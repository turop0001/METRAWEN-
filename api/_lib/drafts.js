// Автоматический черновик первого письма для каждого лида Хантера агентства (Notion «METRAWEN OS — Hunter CRM»).
// Нашли лид (любым способом: сбор в Cowork, ручное добавление, импорт) → карточка без «Черновик сообщения A» →
// писатель сам пишет черновик в голосе Sell Manager и кладёт его в карточку, этап «Новый» → «Черновик готов».
// Вызывается: каждые ~10 минут из тика (ops.tick, мосты Apps Script), раз в сутки из Vercel Cron, командой /drafts в Telegram.
// Выключить: переменная DRAFTS_AUTO=0. Черновик проходит те же проверки, что и письма пачки (длина, слова, ссылки, цены, тире, «!»).
const llm = require('./llm');
const hunter = require('./hunter');
const humanize = require('./humanize');
const { once, saveJson, loadJson, enabled: storeEnabled } = require('./store');
const { report } = require('./alert');

const prop = hunter.prop;
const FIELD = 'Черновик сообщения A';
const RU = /Россия|СНГ/;
const BAD = /\[[^\]]{1,60}\]|\{\{|\}\}|<link>|your-link|example\.com|ссылка здесь|https?:\/\/|www\.|I won'?t (write|email)/i;
const PRICE = /[$€₽£]\s?\d|\d\s?(usd|eur|rub|руб|долл|baht|бат)/i;

const SYSTEM = `You write the FIRST cold message from METRAWEN, a small team that builds websites, landing pages, booking and order bots, AI assistants that answer client questions, CRM automation and simple dashboards for small businesses. The text is saved as a draft that Sell Manager later sends as the first email or DM. Output ONLY the message text itself, nothing else: no JSON, no quotation marks around it, no labels, no notes.
Input: business name, industry, country, city, the signal we noticed, whether they have a website, what we could sell them, notes.
Structure: (1) observation: one specific thing we noticed about THEIR business, taken only from the input; (2) one concrete idea of what we would build for them and what it changes in their working day, matched to what we could sell; no invented numbers, terms, guarantees or facts; (3) one soft closing question offering a short example.
Rules: language = Russian if the country is Russia or CIS, otherwise English. Start with "Hi," (English) or "Здравствуйте," (Russian). 50-85 words, 3-5 short sentences, 250-700 characters. Plain text. Team voice ("we"/"мы"), never "I"/"я"; no self-introduction, no person names, no signature, no sign-off, no unsubscribe line. NO links, domain names, prices, delivery times, placeholders in brackets. No em or en dashes (use commas and periods), no exclamation marks, no flattery about reviews or ratings, no buzzwords, no "not X but Y" contrasts, no triads, no one-line closers. ${humanize.promptList()} Closing question like "Want us to send a quick example?" or "Показать пример, как это может выглядеть для вас?" (vary the wording). Make it sound like a calm professional person, not a template.`;

// Достаёт текст письма из ответа модели: обычный текст, JSON {"body":...}, JSON с кавычками внутри, блок ```.
function extractBody(raw) {
  let t = String(raw || '').replace(/^\s*```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '').trim();
  if (!t) return '';
  if (t[0] === '{') {
    try { const j = JSON.parse(t.slice(0, t.lastIndexOf('}') + 1)); if (j && j.body) return String(j.body).trim(); } catch (e) { /* ниже достаём вручную */ }
    const m = t.match(/"body"\s*:\s*"([\s\S]*?)"\s*}?\s*$/);
    if (!m) return '';
    t = m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"');
  }
  t = t.replace(/^["«“]+|["»”]+$/g, '').replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return t;
}

function words(s) { return String(s).trim().split(/\s+/).filter(Boolean).length; }

// Возвращает список замечаний (пусто = текст годен).
function issues(body, ru) {
  const out = [];
  const s = String(body || '').trim();
  const w = words(s);
  if (s.length < 250 || s.length > 700) out.push('length ' + s.length + ' (need 250-700 chars)');
  if (w < 50 || w > 85) out.push('words ' + w + ' (need 50-85)');
  if (BAD.test(s)) out.push('contains link, domain or placeholder');
  if (PRICE.test(s)) out.push('contains price');
  if (/[—–]/.test(s)) out.push('contains dash');
  if (/!/.test(s)) out.push('contains exclamation mark');
  if (/[\[\]{}]/.test(s)) out.push('contains brackets');
  if (/\b(I|I'm|I'd|I've|my)\b/.test(s) && !ru) out.push('first person');
  if (ru && /(^|[^а-яё])(я|мне|мой|моя|мои)([^а-яё]|$)/i.test(s)) out.push('first person');
  if (!/\?\s*$/.test(s)) out.push('must end with a question');
  if (!(ru ? /^Здравствуйте,/ : /^Hi,/).test(s)) out.push('wrong greeting');
  const h = humanize.find(s);
  if (h.length) out.push('template phrases: ' + h.join(', '));
  return out;
}

function brief(pg) {
  const cut = function (v, n) { return String(v || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, n); };
  return 'Business: ' + prop(pg, 'Компания') + '\nIndustry: ' + (prop(pg, 'Отрасль') || '') + '\nCountry: ' + (prop(pg, 'Страна') || '') +
    '\nCity: ' + (prop(pg, 'Город') || '') + '\nSignal: ' + cut(prop(pg, 'Найденный сигнал'), 500) + '\nWebsite: ' + (prop(pg, 'Есть сайт') || 'unknown') +
    '\nCould sell: ' + (prop(pg, 'Что продавать') || '') + '\nNotes: ' + cut(prop(pg, 'Заметки'), 400);
}

async function complete(user) {
  let last;
  for (let a = 0; a < 3; a++) {
    try { return await llm.complete(SYSTEM, user, 700); }
    catch (e) { last = e; if (!/ 429| 5\d\d|overload|rate/i.test(String(e.message || e))) throw e; await new Promise(function (r) { setTimeout(r, 1500 * (a + 1)); }); }
  }
  throw last;
}

async function write(pg) {
  const ru = RU.test(prop(pg, 'Страна'));
  const base = brief(pg);
  let problems = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = await complete(base + (problems.length ? '\n\nThe previous version failed these checks, fix them: ' + problems.join('; ') : ''));
    const body = extractBody(t);
    if (!body) { problems = ['empty or unreadable output: ' + String(t || '').replace(/\s+/g, ' ').slice(0, 120)]; continue; }
    problems = issues(body, ru);
    if (!problems.length) return body;
    problems.push('text was: ' + body.slice(0, 100));
  }
  throw new Error('черновик не прошёл проверки: ' + problems.join('; '));
}

const COOL = 24 * 3600;
async function cooled(pg) { try { return !!(await loadJson('drafts:fail:' + pg.id)); } catch (e) { return false; } }
async function cool(pg) { try { await saveJson('drafts:fail:' + pg.id, { ts: Date.now() }, COOL); } catch (e) { /* не критично */ } }

async function save(pg, body) {
  const props = {};
  props[FIELD] = { rich_text: [{ type: 'text', text: { content: body.slice(0, 1900) } }] };
  if (prop(pg, 'Этап') === 'Новый') props['Этап'] = { select: { name: 'Черновик готов' } };
  await hunter.ncall('PATCH', '/pages/' + pg.id, { properties: await hunter.onlyKnown(props) });
}

// Берёт до limit карточек без черновика и пишет черновики (параллельно по 3, в пределах бюджета времени).
async function fillMissing(limit, budgetMs) {
  const out = { done: 0, failed: 0, left: 0, err: '' };
  if (!llm.enabled()) return Object.assign(out, { skipped: 'нет ключа модели' });
  const j = await hunter.ncall('POST', '/databases/' + hunter.DB() + '/query', {
    filter: { and: [
      { property: FIELD, rich_text: { is_empty: true } },
      { property: 'Скоринг', select: { does_not_equal: 'Skip' } },
      { or: [{ property: 'Этап', select: { equals: 'Новый' } }, { property: 'Этап', select: { equals: 'Проверен' } }, { property: 'Этап', select: { equals: 'Оценён' } }] }
    ] },
    page_size: 60,
    sorts: [{ property: 'Скоринг', direction: 'ascending' }]
  });
  let rows = [];
  for (const pg of (j.results || [])) { if (rows.length >= Math.min(Math.max(limit || 6, 1), 30)) break; if (!(await cooled(pg))) rows.push(pg); }
  out.left = rows.length;
  const deadline = Date.now() + (budgetMs || 40000);
  for (let i = 0; i < rows.length && Date.now() < deadline; i += 3) {
    await Promise.all(rows.slice(i, i + 3).map(async function (pg) {
      try { await save(pg, await write(pg)); out.done++; }
      catch (e) { out.failed++; await cool(pg); if (!out.err) out.err = String(prop(pg, 'Компания') + ': ' + (e && e.message || e)).slice(0, 300); console.error('drafts:', e); }
    }));
  }
  out.left = Math.max(0, out.left - out.done - out.failed);
  return out;
}

// Фоновый вызов из тика: раз в ~9 минут, небольшая порция.
async function step() {
  if (!storeEnabled() || process.env.DRAFTS_AUTO === '0') return null;
  if (!(await once('drafts:step', 9 * 60))) return null;
  try {
    const r = await fillMissing(8, 35000);
    // Одно спокойное уведомление раз в 6 часов, без названий компаний (иначе каждое сообщение «новое»). Подробности: команда /drafts.
    if (r.failed >= 3 && r.done === 0 && (await once('drafts:alert', 6 * 3600))) await report('Авточерновики не получаются', 'Не вышло ' + r.failed + ' из ' + (r.done + r.failed) + ' карточек. Напишите /drafts, бот покажет причину.');
    return r;
  } catch (e) { await report('Авточерновики', e); return null; }
}

module.exports = { fillMissing, step, issues, write };
