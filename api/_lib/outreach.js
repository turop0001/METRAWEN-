// Холодная рассылка METRAWEN Shop по базе Хантера с прогревом ящиков.
// Порядок: /pack в Telegram → ИИ переписывает черновики лидов в короткое первое письмо БЕЗ ссылки
// (вопрос «прислать ссылку?»: ответы греют домен и не режутся фильтрами) → «Одобрить пачку» → мост в metrawen.shop
// раз в час забирает письма и отправляет с 3 ящиков по графику прогрева → этап «Опубликовано/Отправлено».
// Через 4 дня без ответа один короткий повтор в той же ветке. Ответ лида → «Ответ», покупка → «Продажа».
const { loadJson, saveJson } = require('./store');
const llm = require('./llm');
const shop = require('./shop');

const BOXES = ['dmitry.barinov@getmetrawen.com', 'd.barinov@getmetrawen.com', 'dmytro.pop@getmetrawen.com'];
const boxTag = function (b) { return b.split('@')[0] + '@'; };

// Прогрев: писем в день на один ящик в зависимости от дня с начала рассылки.
function dailyCap(day) { return day < 7 ? 5 : day < 14 ? 10 : day < 21 ? 15 : 20; }

function today() { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }

async function startDay() {
  let s = await loadJson('op:start');
  if (!s) { s = { d: Date.now() }; await saveJson('op:start', s, 60 * 60 * 24 * 365); }
  return Math.floor((Date.now() - s.d) / 86400000);
}

function prop(pg, name) {
  const p = pg.properties[name];
  if (!p) return '';
  if (p.title) return p.title.map(function (x) { return x.plain_text; }).join('');
  if (p.rich_text) return p.rich_text.map(function (x) { return x.plain_text; }).join('');
  if (p.select) return p.select ? p.select.name : '';
  if (p.email !== undefined) return p.email || '';
  if (p.multi_select) return p.multi_select.map(function (x) { return x.name; }).join(', ');
  if (p.number !== undefined) return p.number;
  if (p.date !== undefined) return p.date ? p.date.start : '';
  return '';
}

async function queryHunter(filter, n) {
  const j = await shop.ncall('POST', '/databases/' + shop.HUNTER_DB() + '/query', { filter: filter, page_size: n || 50,
    sorts: [{ property: 'Скоринг', direction: 'ascending' }] });
  return j.results || [];
}

const REWRITE = `You rewrite a cold email draft for METRAWEN Shop (a small team selling ready-made digital templates and tools). Output ONE JSON {"subject":"...","body":"..."}.
Rules: language = draft language. 50-90 words. Plain text, no links, no placeholders in square brackets, no prices unless in the draft. Team voice ("we"), first names only if present. Keep the specific personal detail from the draft (why we wrote to them). Describe the product in one plain sentence. End with a soft question offering to send the link (EN e.g. "Want me to send you the link?", RU e.g. "Прислать ссылку?"). No signature, no sign-off name, no unsubscribe line (the mailbox adds it). Subject: short, lowercase-friendly, no clickbait, no "free", max 6 words.`;

async function rewrite(pg) {
  const draft = prop(pg, 'Черновик A');
  const t = await llm.complete(REWRITE, '<draft>\n' + draft + '\n</draft>\nLead: ' + prop(pg, 'Название') + '\nSignal: ' + prop(pg, 'Сигнал'), 500);
  const j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  const body = String(j.body || '').trim();
  if (!body || /\[|\]|https?:\/\//.test(body)) throw new Error('rewrite guard');
  return { subject: String(j.subject || prop(pg, 'Заголовок')).slice(0, 80), body: body };
}

// Пачка на одобрение: лиды-письма с email, товар которых уже создан.
async function buildPack(n) {
  const rows = await queryHunter({ and: [
    { property: 'Формат', select: { equals: 'Письмо' } },
    { property: 'Этап', select: { equals: 'Ждёт выставления товара' } },
    { property: 'Публичный email', email: { is_not_empty: true } }
  ] }, Math.min(n * 2, 60));
  const items = [];
  for (let i = 0; i < rows.length && items.length < n; i++) {
    const pg = rows[i];
    try {
      const r = await rewrite(pg);
      items.push({ id: pg.id, to: prop(pg, 'Публичный email').toLowerCase(), name: prop(pg, 'Название'), lang: prop(pg, 'Язык') === 'RU' ? 'ru' : 'en', subject: r.subject, body: r.body });
    } catch (e) { console.error('outreach: черновик пропущен', e); }
  }
  const id = Date.now().toString(36);
  await saveJson('op:pack:' + id, { items: items }, 60 * 60 * 24 * 3);
  return { id: id, items: items };
}

async function approvePack(id) {
  const p = await loadJson('op:pack:' + id);
  if (!p) return 0;
  const q = (await loadJson('op:queue')) || [];
  p.items.forEach(function (it) { if (!q.some(function (x) { return x.to === it.to; })) q.push(it); });
  await saveJson('op:queue', q, 60 * 60 * 24 * 30);
  for (const it of p.items) {
    try { await shop.ncall('PATCH', '/pages/' + it.id, { properties: { 'Этап': { select: { name: 'Одобрено' } } } }); } catch (e) { /* ничего */ }
  }
  await saveJson('op:pack:' + id, null, 1);
  return p.items.length;
}

// Вызывается мостом раз в час (8:00-18:00 по времени получателя не знаем, держим дневное окно сервера).
async function due() {
  const day = await startDay();
  const cap = dailyCap(day);
  const d = today();
  const q = (await loadJson('op:queue')) || [];
  const out = [];
  for (const box of BOXES) {
    const ck = 'op:cnt:' + boxTag(box) + d;
    let c = (await loadJson(ck)) || 0;
    // не больше 2 писем за запуск на ящик, чтобы растянуть отправку на день
    let k = 0;
    while (q.length && c < cap && k < 2) {
      const it = q.shift(); it.from = box; it.kind = 'first'; out.push(it); c++; k++;
    }
    await saveJson(ck, c, 60 * 60 * 30);
  }
  await saveJson('op:queue', q, 60 * 60 * 24 * 30);
  // повторы: 1 касание, 4+ дня, без ответа
  try {
    const old = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
    const rows = await queryHunter({ and: [
      { property: 'Этап', select: { equals: 'Опубликовано/Отправлено' } },
      { property: 'Касаний', number: { equals: 1 } },
      { property: 'Отправлено', date: { on_or_before: old } }
    ] }, 10);
    rows.forEach(function (pg) {
      const ru = prop(pg, 'Язык') === 'RU';
      const tag = prop(pg, 'Ящик');
      const from = BOXES.find(function (b) { return boxTag(b) === tag; }) || BOXES[0];
      out.push({ id: pg.id, to: prop(pg, 'Публичный email').toLowerCase(), from: from, lang: ru ? 'ru' : 'en', kind: 'followup',
        body: ru ? 'Поднимаю письмо наверх, вдруг потерялось. Если тема неактуальна, просто ответьте «нет».' : 'Just bumping this in case it got buried. If it is not relevant, a quick "no" is totally fine.' });
    });
  } catch (e) { console.error('outreach: повторы', e); }
  return out;
}

async function sent(it) {
  const pg = await shop.ncall('GET', '/pages/' + it.id);
  const n = (pg.properties['Касаний'] && pg.properties['Касаний'].number) || 0;
  await shop.ncall('PATCH', '/pages/' + it.id, { properties: {
    'Этап': { select: { name: 'Опубликовано/Отправлено' } },
    'Касаний': { number: n + 1 },
    'Ящик': { select: { name: boxTag(it.from) } },
    'Отправлено': { date: { start: new Date().toISOString().slice(0, 10) } }
  } });
}

module.exports = { buildPack, approvePack, due, sent, BOXES };
