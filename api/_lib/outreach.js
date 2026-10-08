// Холодная рассылка по Хантерам с прогревом ящиков. Две ветки:
//  shop   — METRAWEN Shop (цифровые товары), база «Хантер — лиды и площадки», 3 ящика getmetrawen.com;
//  agency — METRAWEN (услуги агентства), база «METRAWEN OS — Hunter CRM», ящики отдельного домена
//           (НЕ metrawen.com: холодные письма не должны портить репутацию основной почты и заявок с сайта).
// Порядок: /pack (или /pack agency) в Telegram → ИИ переписывает черновики в короткое первое письмо БЕЗ ссылки и без цены
// (вопрос «прислать ссылку/пример?»: ответы греют домен) → «Одобрить пачку» → мост раз в час по будням забирает письма
// и отправляет по графику прогрева → этап «Отправлено». Через 4 дня без ответа один короткий повтор в той же ветке.
// Ответ лида → «Ответ»/«Ответ получен» (sellmanager), покупка → «Продажа», оплата КП → «Сделка/Оплачено».
const { loadJson, saveJson } = require('./store');
const llm = require('./llm');
const shop = require('./shop');
const hunter = require('./hunter');
const humanize = require('./humanize');
const { report, stat } = require('./alert');
const tzm = require('./tz');
const { tg } = require('./tg');

// Три ящика getmetrawen.com общие: с них идёт холодная рассылка и магазина, и агентства (ящики агентства присылает мост agency).
// Суточный лимит ящика делится поровну между ветками, чтобы суммарно не выходить за потолок прогрева.
// Свой набор ящиков магазина можно задать переменной OUTREACH_SHOP_BOXES (через запятую).
// Ящики getmetrawen.com закреплены за агентством. Для магазина нужны другие ящики: задайте OUTREACH_SHOP_BOXES.
const DEFAULT_SHOP_BOXES = [];
const envBoxes = String(process.env.OUTREACH_SHOP_BOXES || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(function (s) { return /@/.test(s); });
const SHOP_BOXES = envBoxes.length ? envBoxes : DEFAULT_SHOP_BOXES;
const boxTag = function (b) { return String(b).split('@')[0] + '@'; };

// Прогрев: писем в день на один ящик в зависимости от дня с начала рассылки этой ветки.
// После подключения DKIM (Google Workspace) можно поднять потолок переменной OUTREACH_MAX_PER_BOX (по умолчанию 20, максимум 30).
function dailyCap(day) {
  const max = Math.min(Math.max(parseInt(process.env.OUTREACH_MAX_PER_BOX, 10) || 20, 5), 30);
  return Math.min(day < 7 ? 5 : day < 14 ? 10 : day < 21 ? 15 : 20 + Math.floor((day - 21) / 7) * 5, max);
}

function today() { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }

const prop = hunter.prop;

// ---------- ветки ----------
const RU_COUNTRIES = /Россия|СНГ/;
const BRANDS = {
  shop: {
    key: 'op',
    db: function () { return shop.HUNTER_DB(); },
    call: function (m, p, b) { return shop.ncall(m, p, b); },
    title: 'Название', email: 'Публичный email', draft: 'Черновик A', signal: 'Сигнал',
    lang: function (pg) { return prop(pg, 'Язык') === 'RU' ? 'ru' : 'en'; },
    pickFilter: function (seg) {
      const f = [
        { property: 'Формат', select: { equals: 'Письмо' } },
        { property: 'Этап', select: { equals: 'Ждёт выставления товара' } },
        { property: 'Публичный email', email: { is_not_empty: true } }
      ];
      if (seg) f.push({ property: 'Продукт', multi_select: { contains: seg } });
      return { and: f };
    },
    approved: 'Одобрено', sent: 'Опубликовано/Отправлено',
    followupFilter: function (old, n) {
      return { and: [
        { property: 'Этап', select: { equals: 'Опубликовано/Отправлено' } },
        { property: 'Касаний', number: { equals: n || 1 } },
        { property: 'Отправлено', date: { on_or_before: old } },
        { property: 'Публичный email', email: { is_not_empty: true } }
      ] };
    },
    prompt: `You rewrite a cold email draft for METRAWEN Shop (a small team selling ready-made digital templates and tools). Output ONE JSON {"subject":"...","body":"..."}.
Structure: (1) one specific observation about THEM taken from the draft (why we wrote to them), (2) one plain sentence about what the product is and what it saves them, (3) one soft question offering the link.
Rules: language = draft language. 45-80 words, 3-5 short sentences. Plain text, no links, no placeholders in square brackets, no prices, no attachments. Team voice ("we"/"мы"), never "I". ${humanize.promptList()}  Plain everyday words; no "не X, а Y" contrasts, no praise or flattery, no buzzwords (уникальный, инновационный, решение, synergy), no em dashes, no exclamation marks. Question like "Want me to send you the link?" / "Прислать ссылку?". No signature, no sign-off name, no unsubscribe line (the mailbox adds it). Subject: 2-5 words, lowercase-friendly, concrete, no clickbait, no "free", no "Re:".`,
    followups: {
      1: { ru: 'Добавлю одну деталь: если удобнее, вместо ссылки пришлю короткий пример того, что внутри. Что вам полезнее?', en: 'One small addition: if it is easier, I can send a short example of what is inside instead of the link. Which would help more?' },
      2: { ru: 'Это моё последнее письмо, чтобы не надоедать. Если тема появится позже, просто ответьте на него, и мы пришлём ссылку.', en: 'This is my last note so I do not crowd your inbox. If it becomes relevant later, just reply and we will send the link.' }
    },
  },
  agency: {
    key: 'opa',
    db: function () { return hunter.DB(); },
    call: function (m, p, b) { return hunter.ncall(m, p, b); },
    title: 'Компания', email: 'Публичный email', draft: 'Черновик сообщения A', signal: 'Найденный сигнал',
    lang: function (pg) { return RU_COUNTRIES.test(prop(pg, 'Страна')) ? 'ru' : 'en'; },
    // Сначала Hot, по одной отрасли за пачку (одна тема: проще писать и мерить ответ). Skip и отказы не берём.
    useDraft: true,
    // Пачка по важности (hot / warm / cold) или по отрасли («Клиники»), можно вместе: «hot Клиники». Skip и отказы не берём.
    pickFilter: function (seg) {
      const f = [
        { property: 'Публичный email', email: { is_not_empty: true } },
        { or: [{ property: 'Этап', select: { equals: 'Черновик готов' } }, { property: 'Этап', select: { equals: 'Готово к отправке' } }, { property: 'Этап', select: { equals: 'Новый' } }] },
        { property: 'Скоринг', select: { does_not_equal: 'Skip' } }
      ];
      let rest = String(seg || '').trim();
      // «top» (рекомендуемая): самые перспективные, Hot и Warm; Hot идут первыми
      const tm = /(^|\s)(top|топ|рекоменд\S*|лучш\S*)(?=\s|$)/i.exec(rest);
      if (tm) {
        f.push({ or: [{ property: 'Скоринг', select: { equals: 'Hot' } }, { property: 'Скоринг', select: { equals: 'Warm' } }] });
        rest = (rest.slice(0, tm.index) + ' ' + rest.slice(tm.index + tm[0].length)).trim();
      }
      const m = !tm && /(^|\s)(hot|горяч\S*|warm|тепл\S*|cold|холод\S*)(?=\s|$)/i.exec(rest);
      if (m) {
        const w = m[2].toLowerCase();
        f.push({ property: 'Скоринг', select: { equals: /^(hot|горяч)/.test(w) ? 'Hot' : /^(warm|тепл)/.test(w) ? 'Warm' : 'Cold' } });
        rest = (rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length)).trim();
      }
      if (rest) f.push({ property: 'Отрасль', select: { equals: rest } });
      return { and: f };
    },
    approved: 'Готово к отправке', sent: 'Отправлено',
    followupFilter: function (old, n) {
      return { and: [
        { property: 'Этап', select: { equals: 'Отправлено' } },
        { property: 'Касаний', number: { equals: n || 1 } },
        { property: 'Отправлено', date: { on_or_before: old } },
        { property: 'Публичный email', email: { is_not_empty: true } }
      ] };
    },
    prompt: `You write the FIRST cold email from METRAWEN, a small team that builds websites, landing pages, booking and order bots, AI assistants that answer client questions, and simple dashboards for small businesses. Output ONE JSON {"subject":"...","body":"..."}.
Input: a draft (may be empty), the business name, its industry, country and the signal we noticed about them.
Structure: (1) observation: the specific thing we noticed about THEIR business (the signal), (2) one concrete idea of what we would build for them and what it changes in their day, no invented numbers or guarantees, (3) one soft question offering a short example.
Rules: language = draft language, or Russian if the country is Russia/CIS and there is no draft, otherwise English. 50-85 words, 3-5 short sentences. Plain text. NO links, NO prices, no placeholders in square brackets, no attachments. Team voice ("we"/"мы"), never "I". ${humanize.promptList()}  Plain everyday words; no "не X, а Y" contrasts, no flattery, no buzzwords (уникальный, комплексный, инновационный, digital transformation), no em dashes, no exclamation marks. Question like "Want me to send a quick example?" / "Показать пример, как это может выглядеть?". No signature, no sign-off, no unsubscribe line (the mailbox adds it). Subject: 2-5 words, specific to their business, no clickbait, no "Re:".`,
    followups: {
      1: { ru: 'Добавлю конкретики: мы бы начали с одного небольшого шага, например с бота, который отвечает клиентам и записывает их, чтобы вы увидели, как это работает, до больших вложений. Показать пример?', en: 'To be more concrete: we would start with one small step, for example a bot that answers clients and books them, so you can see how it works before any bigger investment. Want a quick example?' },
      2: { ru: 'Это наше последнее письмо, чтобы не надоедать. Если тема появится позже, просто ответьте на него, и мы вернёмся с примером.', en: 'This is our last note so we do not crowd your inbox. If it becomes relevant later, just reply and we will come back with an example.' }
    }
  }
};

function cfg(brand) { return BRANDS[brand === 'agency' ? 'agency' : 'shop']; }

async function startDay(B) {
  let s = await loadJson(B.key + ':start');
  if (!s) { s = { d: Date.now() }; await saveJson(B.key + ':start', s, 60 * 60 * 24 * 365); }
  return Math.floor((Date.now() - s.d) / 86400000);
}

async function query(B, filter, n, sorts) {
  const j = await B.call('POST', '/databases/' + B.db() + '/query', { filter: filter, page_size: n || 50, sorts: sorts || [{ property: 'Скоринг', direction: 'ascending' }] });
  return j.results || [];
}

// Плейсхолдеры и следы шаблона, которые не должны уйти клиенту.
const BAD = /\[[^\]]{1,60}\]|\{\{|\}\}|<link>|your-link|example\.com|ссылка здесь|https?:\/\/|I won'?t (write|email)/i;

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

// Вызов модели с повтором при лимитах и перегрузке (429, 5xx).
async function complete(system, user, tokens) {
  let last;
  for (let a = 0; a < 3; a++) {
    try { return await llm.complete(system, user, tokens); }
    catch (e) { last = e; if (!/ 429| 5\d\d|overload|rate/i.test(String(e.message || e))) throw e; await sleep(1500 * (a + 1)); }
  }
  throw last;
}

// Готовый черновик из Notion берём как есть, если в нём нет ссылок, цен и плейсхолдеров. Тему делаем по шаблону.
const PRICE = /[$€₽£]\s?\d|\d\s?(usd|eur|rub|руб|долл)/i;
function fromDraft(B, pg) {
  if (!B.useDraft) return null;
  const d = String(prop(pg, B.draft) || '').trim();
  if (d.length < 40 || d.length > 1400 || BAD.test(d) || PRICE.test(d)) return null;
  const name = String(prop(pg, B.title) || '').trim();
  const ru = B.lang(pg) === 'ru';
  return { subject: ((ru ? 'Идея для ' : 'Quick idea for ') + name).slice(0, 70), body: d };
}

async function rewrite(B, pg) {
  const draft = prop(pg, B.draft);
  const signal = prop(pg, B.signal);
  if (!draft && !signal) throw new Error('нет черновика и сигнала');
  const t = await complete(B.prompt, '<draft>\n' + draft + '\n</draft>\nLead: ' + prop(pg, B.title) + '\nIndustry: ' + (prop(pg, 'Отрасль') || '') + '\nCountry: ' + (prop(pg, 'Страна') || prop(pg, 'Регион') || '') + '\nSignal: ' + signal, 500);
  const j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  const body = String(j.body || '').trim();
  if (!body || BAD.test(body)) throw new Error('rewrite guard');
  return { subject: String(j.subject || prop(pg, 'Заголовок') || '').slice(0, 80), body: body };
}

// Пачка на одобрение. seg: для shop — продукт («#24 …»), для agency — отрасль («Клиники»).
async function buildPack(n, brand, seg) {
  const B = cfg(brand);
  let rows = [];
  if (B.useDraft) {
    // сначала карточки с уже готовым черновиком (письмо берём из Notion без модели), потом остальные
    const fd = B.pickFilter(seg);
    fd.and.push({ property: 'Этап', select: { equals: 'Черновик готов' } });
    rows = await query(B, fd, 100);
    if (rows.length < n * 2) rows = rows.concat(await query(B, B.pickFilter(seg), 100));
  } else {
    rows = await query(B, B.pickFilter(seg), Math.min(n * 3, 100));
  }
  const queued = ((await loadJson(B.key + ':queue')) || []).map(function (x) { return x.to; });
  const items = [];
  let skipped = 0;
  let firstErr = '';
  let fromNotion = 0;
  const seen = {};
  const gen = [];
  const mk = function (pg, to, r) { return { id: pg.id, to: to, name: prop(pg, B.title), lang: B.lang(pg), subject: r.subject, body: r.body, seg: prop(pg, 'Отрасль') || '', country: prop(pg, 'Страна') || prop(pg, 'Регион') || '' }; };
  for (let i = 0; i < rows.length; i++) {
    const pg = rows[i];
    const to = String(prop(pg, B.email) || '').toLowerCase();
    if (!to || queued.indexOf(to) >= 0 || seen[to]) continue;
    seen[to] = 1;
    const r = fromDraft(B, pg);
    if (r) { if (items.length < n) { items.push(mk(pg, to, r)); fromNotion++; } }
    else gen.push({ pg: pg, to: to });
  }
  // Без готового черновика (или для магазина) письмо пишет модель: по 3 параллельно, с повтором при лимитах.
  const deadline = Date.now() + 38000;
  let pos = 0;
  while (pos < gen.length && items.length < n && Date.now() < deadline) {
    const chunk = gen.slice(pos, pos + Math.max(1, Math.min(3, n - items.length)));
    pos += chunk.length;
    const res = await Promise.all(chunk.map(function (c) {
      return rewrite(B, c.pg).then(function (r) { return { c: c, r: r }; }, function (e) { console.error('outreach: черновик пропущен', e); if (!firstErr) firstErr = String(e && e.message || e).slice(0, 160); return null; });
    }));
    res.forEach(function (x) {
      if (!x) { skipped++; return; }
      if (items.length < n) items.push(mk(x.c.pg, x.c.to, x.r));
    });
  }
  if (skipped >= 3) await report('Рассылка: черновики не переписались', skipped + ' из ' + (items.length + skipped) + (firstErr ? '. Причина: ' + firstErr : ''), brand);
  // Тексты писем кладём в карточки Notion: чат не засоряем, всё видно в базе.
  const nd = Date.now() + 12000;
  for (let i = 0; i < items.length && Date.now() < nd; i += 10) {
    await Promise.all(items.slice(i, i + 10).map(function (it) {
      return B.call('PATCH', '/blocks/' + it.id + '/children', { children: [
        { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: 'Письмо в рассылку ' + today() } }] } },
        { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'Тема: ' + it.subject } }] } },
        { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: String(it.body).slice(0, 1900) } }] } }
      ] }).catch(function (e) { console.error('outreach: текст в Notion', e); });
    }));
  }
  const id = Date.now().toString(36);
  await saveJson('op:pack:' + id, { brand: brand === 'agency' ? 'agency' : 'shop', items: items }, 60 * 60 * 24 * 3);
  return { id: id, items: items, brand: brand, fromNotion: fromNotion, written: items.length - fromNotion };
}

// Суточный лимит на ящик: ящики у веток раздельные, поэтому лимит не делится.
async function capFor(brand) {
  return dailyCap(await startDay(cfg(brand)));
}

function tzOfItem(it) { return tzm.zone(it.country, it.lang); }

// Плановый старт пачки по Таиланду: самое раннее окно 9-18 среди стран лидов.
function planStart(items) {
  const now = Date.now();
  let first = Infinity;
  (items || []).forEach(function (it) { first = Math.min(first, tzm.nextOpen(tzOfItem(it).tz, now)); });
  return first === Infinity ? '' : tzm.bangkok(first);
}

async function notify(text) {
  try { await tg('sendMessage', { chat_id: process.env.TELEGRAM_CHAT_ID, text: text }); } catch (e) { console.error('outreach: уведомление', e); }
}

// Одобрение: пачка получает номер, считаем плановый старт по Таиланду (окно 9-18 по местному времени каждого лида).
async function approvePack(id) {
  const p = await loadJson('op:pack:' + id);
  if (!p) return { n: 0, text: '' };
  const B = cfg(p.brand);
  const q = (await loadJson(B.key + ':queue')) || [];
  p.items.forEach(function (it) { it.pack = id; if (!q.some(function (x) { return x.to === it.to; })) q.push(it); });
  await saveJson(B.key + ':queue', q, 60 * 60 * 24 * 30);
  for (const it of p.items) {
    try { await B.call('PATCH', '/pages/' + it.id, { properties: { 'Этап': { select: { name: B.approved } } } }); } catch (e) { await report('Рассылка: этап «' + B.approved + '»', e, it.name); }
  }
  const now = Date.now();
  const byC = {};
  let first = Infinity, last = 0, guessed = 0;
  p.items.forEach(function (it) {
    const z = tzOfItem(it);
    if (z.guess) guessed++;
    const t = tzm.nextOpen(z.tz, now);
    first = Math.min(first, t); last = Math.max(last, t);
    const k = (it.country || 'не указана') + ' (' + z.tz.split('/')[1].replace(/_/g, ' ') + ')';
    if (!byC[k]) byC[k] = { n: 0, t: t };
    byC[k].n++; byC[k].t = Math.min(byC[k].t, t);
  });
  const rows = Object.keys(byC).sort(function (a, b) { return byC[a].t - byC[b].t; }).slice(0, 8)
    .map(function (k) { return '• ' + k + ': ' + byC[k].n + ' пис., с ' + tzm.bangkok(byC[k].t); });
  const nb = B === BRANDS.agency ? (((await loadJson(B.key + ':boxes')) || []).length || 3) : SHOP_BOXES.length;
  const perDay = Math.max(1, nb * (await capFor(p.brand)));
  const days = Math.ceil(p.items.length / perDay);
  const rec = { id: id, brand: p.brand, total: p.items.length, sent: 0, failed: 0, approved: now, plan: first, started: 0, finished: 0 };
  await saveJson(B.key + ':batch:' + id, rec, 60 * 60 * 24 * 60);
  const ids = ((await loadJson(B.key + ':batches')) || []).filter(function (x) { return x !== id; });
  ids.unshift(id);
  await saveJson(B.key + ':batches', ids.slice(0, 10), 60 * 60 * 24 * 60);
  await saveJson('op:pack:' + id, null, 1);
  const text = '\n\n🗓 Плановый старт (время Таиланда, GMT+7): ' + tzm.bangkok(first) + '\nОкно отправки: пн–пт, 9:00–18:00 по местному времени каждой страны.\n' + rows.join('\n') +
    '\nЛимит прогрева: до ' + perDay + ' писем в день, значит вся пачка уйдёт примерно за ' + days + ' раб. дн.' +
    (guessed ? '\n⚠️ У ' + guessed + ' лидов страна не распознана, время взято по умолчанию.' : '') +
    '\n\nСтатус: ⏳ в очереди. Напишу, когда рассылка начнётся и когда завершится (/status покажет текущее).';
  return { n: p.items.length, text: text, id: id };
}

const STATUS = function (r) { return r.cancelled ? '❌ отменена' : r.finished ? '✅ завершена' : r.started ? '🚀 идёт' : '⏳ в очереди'; };

async function batchLine(r) {
  return '#' + r.id.slice(-4) + ' · ' + (r.brand === 'agency' ? 'агентство' : 'магазин') + ' · ' + STATUS(r) + ' · ' + r.sent + '/' + r.total + (r.failed ? ' (ошибок ' + r.failed + ')' : '') +
    (r.finished ? ' · завершена ' + tzm.bangkok(r.finished) : r.started ? ' · началась ' + tzm.bangkok(r.started) : ' · старт по плану ' + tzm.bangkok(r.plan)) + ' (Таиланд)';
}

async function statusText() {
  const lines = [];
  for (const b of ['agency', 'shop']) {
    const B = cfg(b);
    const ids = (await loadJson(B.key + ':batches')) || [];
    for (const id of ids.slice(0, 4)) { const r = await loadJson(B.key + ':batch:' + id); if (r) lines.push(await batchLine(r)); }
  }
  const d = today();
  const box = [];
  for (const b of ['agency', 'shop']) {
    const B = cfg(b);
    const bx = b === 'agency' ? ((await loadJson(B.key + ':boxes')) || []) : SHOP_BOXES;
    if (!bx.length) continue;
    const cap = await capFor(b);
    const parts = [];
    for (const x of bx) parts.push(boxTag(x) + ' ' + ((await loadJson(B.key + ':cnt:' + boxTag(x) + d)) || 0) + '/' + cap);
    box.push((b === 'agency' ? 'агентство' : 'магазин') + ': ' + parts.join(', '));
  }
  return (lines.length ? '📬 Рассылки (время Таиланда, GMT+7):\n' + lines.join('\n') : 'Пока нет одобренных пачек.') + (box.length ? '\n\nСегодня по ящикам (ушло/лимит):\n' + box.join('\n') : '');
}

// Событие по письму из пачки: «отправлено» или «ошибка». Первое отправленное = «началась», последнее = «завершена».
async function track(B, brand, itemId, kind) {
  const pack = await loadJson(B.key + ':out:' + itemId);
  if (!pack) return;
  const r = await loadJson(B.key + ':batch:' + pack);
  if (!r || r.finished) return;
  const wasStarted = !!r.started;
  if (kind === 'sent') { r.sent++; if (!r.started) r.started = Date.now(); } else r.failed++;
  const fin = r.sent + r.failed >= r.total;
  if (fin) r.finished = Date.now();
  await saveJson(B.key + ':batch:' + pack, r, 60 * 60 * 24 * 60);
  const name = '#' + pack.slice(-4) + ' (' + (brand === 'agency' ? 'агентство' : 'магазин') + ')';
  if (kind === 'sent' && !wasStarted) await notify('🚀 Рассылка ' + name + ' началась: ' + tzm.bangkok(r.started) + ' по Таиланду. Всего в пачке ' + r.total + '.');
  if (fin) await notify('✅ Рассылка ' + name + ' завершена: ' + tzm.bangkok(r.finished) + ' по Таиланду. Отправлено ' + r.sent + ' из ' + r.total + (r.failed ? ', ошибок ' + r.failed : '') + '.');
}

async function failed(it, brand) { return track(cfg(brand), brand, it.id, 'failed'); }

// Отмена всей очереди ещё не отправленных писем: этап возвращается, пачку можно собрать заново.
async function cancelQueue(brand) {
  const B = cfg(brand);
  const q = (await loadJson(B.key + ':queue')) || [];
  const back = B === BRANDS.agency ? 'Черновик готов' : 'Ждёт выставления товара';
  let n = 0;
  const packs = {};
  for (const it of q) {
    if (it.pack) packs[it.pack] = 1;
    try { await B.call('PATCH', '/pages/' + it.id, { properties: { 'Этап': { select: { name: back } } } }); n++; } catch (e) { await report('Отмена очереди: этап', e, it.name); }
  }
  await saveJson(B.key + ':queue', [], 60 * 60 * 24 * 30);
  for (const id of Object.keys(packs)) {
    const r = await loadJson(B.key + ':batch:' + id);
    if (r && !r.finished) { r.cancelled = true; r.finished = Date.now(); await saveJson(B.key + ':batch:' + id, r, 60 * 60 * 24 * 60); }
  }
  return { total: q.length, restored: n };
}

// Вызывается мостом раз в час. boxes — ящики, с которых мост умеет отправлять (для agency их присылает сам мост).
async function due(brand, boxesFromBridge) {
  const B = cfg(brand);
  const boxes = brand === 'agency'
    ? (Array.isArray(boxesFromBridge) ? boxesFromBridge : []).map(function (b) { return String(b).toLowerCase(); }).filter(function (b) { return /@/.test(b) && !/@metrawen\.com$/.test(b); }).slice(0, 5)
    : SHOP_BOXES;
  if (!boxes.length) return [];
  if (brand === 'agency') await saveJson(B.key + ':boxes', boxes, 60 * 60 * 24 * 30);
  const cap = await capFor(brand);
  const d = today();
  let q = (await loadJson(B.key + ':queue')) || [];
  const out = [];
  // окно 9-18 по местному времени получателя (пн–пт): письма вне окна остаются в очереди
  const open = [], rest = [];
  let lookups = 0;
  for (const it of q) {
    if (!it.country && it.country !== '' && lookups < 6) {
      lookups++;
      try { const pg = await B.call('GET', '/pages/' + it.id); it.country = prop(pg, 'Страна') || prop(pg, 'Регион') || ''; } catch (e) { it.country = ''; }
    }
    (tzm.isOpen(tzOfItem(it).tz) ? open : rest).push(it);
  }
  for (const box of boxes) {
    const ck = B.key + ':cnt:' + boxTag(box) + d;
    let c = (await loadJson(ck)) || 0;
    // не больше 2 писем за запуск на ящик, чтобы растянуть отправку на день
    let k = 0;
    while (open.length && c < cap && k < 2) {
      const it = open.shift(); it.from = box; it.kind = 'first'; out.push(it); c++; k++;
      if (it.pack) await saveJson(B.key + ':out:' + it.id, it.pack, 60 * 60 * 24 * 14);
    }
    await saveJson(ck, c, 60 * 60 * 30);
  }
  q = rest.concat(open);
  await saveJson(B.key + ':queue', q, 60 * 60 * 24 * 30);
  // повторы: касание 2 через 4 дня, касание 3 («последнее письмо») через 9 дней от первого, только без ответа
  try {
    for (const step of [{ n: 1, days: 4 }, { n: 2, days: 9 }]) {
      const old = new Date(Date.now() - step.days * 86400000).toISOString().slice(0, 10);
      const rows = await query(B, B.followupFilter(old, step.n), 10, [{ property: 'Отправлено', direction: 'ascending' }]);
      rows.forEach(function (pg) {
        const lang = B.lang(pg);
        const tag = prop(pg, 'Ящик');
        const from = boxes.find(function (b) { return boxTag(b) === tag; });
        if (!tzm.isOpen(tzm.zone(prop(pg, 'Страна') || prop(pg, 'Регион'), lang).tz)) return; // вне окна 9-18 получателя
        if (!from) return; // ящик, с которого писали, больше не подключён: повтор с чужого адреса не шлём
        out.push({ id: pg.id, to: String(prop(pg, B.email)).toLowerCase(), from: from, lang: lang, kind: 'followup', body: B.followups[step.n][lang] });
      });
    }
  } catch (e) { await report('Рассылка: повторы (' + (brand || 'shop') + ')', e); }
  return out;
}

async function sent(it, brand) {
  const B = cfg(brand);
  try {
    const pg = await B.call('GET', '/pages/' + it.id);
    const n = (pg.properties['Касаний'] && pg.properties['Касаний'].number) || 0;
    const props = {
      'Этап': { select: { name: B.sent } },
      'Касаний': { number: n + 1 },
      'Ящик': { select: { name: boxTag(it.from) } }
    };
    if (!n) props['Отправлено'] = { date: { start: today() } };
    if (brand === 'agency') props['Следующее касание'] = { date: n ? null : { start: hunter.plusDays(4) } };
    const known = brand === 'agency' ? await hunter.onlyKnown(props) : props;
    await B.call('PATCH', '/pages/' + it.id, { properties: known });
    // запоминаем, чей это лид: ящики общие, и по этой метке ответ уходит в нужную ветку (агентство или магазин)
    const em = String(it.to || '').toLowerCase();
    if (em) await saveJson('op:rcpt:' + em, brand === 'agency' ? 'agency' : 'shop', 60 * 60 * 24 * 120);
    await stat('sent:' + (brand === 'agency' ? 'agency' : 'shop'));
    if (it.kind !== 'followup') await track(B, brand, it.id, 'sent');
  } catch (e) { await report('Рассылка: отметка «отправлено»', e, it.id); }
}

module.exports = { buildPack, approvePack, planStart, cancelQueue, statusText, failed, due, sent, SHOP_BOXES, BOXES: SHOP_BOXES, BRANDS, cfg, BAD, dailyCap, rewrite, fromDraft };
