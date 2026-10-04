// Хантер агентства METRAWEN (Notion «METRAWEN OS — Hunter CRM»): связь с Sell Manager.
// Ответ лида → «Ответ получен», запись на встречу → «Встреча назначена», КП принято → «КП принято»,
// оплата по КП → «Сделка/Оплачено» + сумма, отказ → «Отказ». Этапы только вперёд.
// Колонки учёта пишутся, только если они есть в базе (схема читается и кэшируется на 10 минут).
const { loadJson, saveJson, enabled: storeEnabled } = require('./store');
const { report } = require('./alert');

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
const clean = function (v) { return String(v || '').replace(/[^\x20-\x7E]/g, '').trim(); };
const token = function () { return clean(process.env.NOTION_TOKEN); };
const DB = function () { return clean(process.env.NOTION_AGENCY_HUNTER_DB_ID) || 'c85648b90e694ef7b394582cf4d02336'; };

async function ncall(method, path, body) {
  const ctl = new AbortController();
  const t = setTimeout(function () { ctl.abort(); }, 7000);
  try {
    const r = await fetch(API + path, {
      method: method,
      headers: { Authorization: 'Bearer ' + token(), 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal
    });
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error('notion ' + r.status + ' ' + String(j.message || '').slice(0, 160));
    return j;
  } finally { clearTimeout(t); }
}

// Какие колонки есть в базе: {имя: тип}. Нужно, чтобы не падать, пока колонки учёта не добавлены.
let memSchema = null;
async function schema() {
  if (memSchema && memSchema.ts > Date.now() - 600000) return memSchema.p;
  let p = storeEnabled() ? await loadJson('hunterA:schema') : null;
  if (!p) {
    const j = await ncall('GET', '/databases/' + DB());
    p = {};
    Object.keys(j.properties || {}).forEach(function (k) { p[k] = j.properties[k].type; });
    if (storeEnabled()) await saveJson('hunterA:schema', p, 600);
  }
  memSchema = { ts: Date.now(), p: p };
  return p;
}

// Оставляет только существующие колонки.
async function onlyKnown(props) {
  const s = await schema();
  const out = {};
  Object.keys(props).forEach(function (k) { if (s[k]) out[k] = props[k]; });
  return out;
}

function prop(pg, name) {
  const p = pg && pg.properties && pg.properties[name];
  if (!p) return '';
  if (p.title) return p.title.map(function (x) { return x.plain_text; }).join('');
  if (p.rich_text) return p.rich_text.map(function (x) { return x.plain_text; }).join('');
  if (p.type === 'select') return p.select ? p.select.name : '';
  if (p.type === 'email') return p.email || '';
  if (p.type === 'phone_number') return p.phone_number || '';
  if (p.type === 'url') return p.url || '';
  if (p.type === 'multi_select') return p.multi_select.map(function (x) { return x.name; }).join(', ');
  if (p.type === 'number') return p.number;
  if (p.type === 'date') return p.date ? p.date.start : '';
  return '';
}

const RANK = {
  'Новый': 0, 'Проверен': 1, 'Оценён': 1, 'Черновик готов': 2, 'Готово к отправке': 3,
  'Отправлено': 4, 'Follow-up запланирован': 4, 'Без ответа (закрыт)': 4,
  'Ответ получен': 5, 'Встреча назначена': 6, 'КП принято': 7, 'Сделка/Оплачено': 8
};

function today() { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }
function plusDays(n) { return new Date(Date.now() + 7 * 3600 * 1000 + n * 86400000).toISOString().slice(0, 10); }

function emailOf(lead) {
  if (lead && lead.emailAddr) return String(lead.emailAddr).toLowerCase();
  const m = String((lead && lead.contact) || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return m ? m[0].toLowerCase() : '';
}

async function findByEmail(email) {
  if (!token() || !email) return null;
  const j = await ncall('POST', '/databases/' + DB() + '/query', {
    filter: { property: 'Публичный email', email: { equals: String(email).toLowerCase() } }, page_size: 1
  });
  return (j.results && j.results[0]) || null;
}

async function findByCompany(name) {
  if (!token() || !name || String(name).length < 3) return null;
  const j = await ncall('POST', '/databases/' + DB() + '/query', {
    filter: { property: 'Компания', title: { equals: String(name).trim() } }, page_size: 2
  });
  return j.results && j.results.length === 1 ? j.results[0] : null;
}

async function note(pageId, text) {
  const d = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
  await ncall('PATCH', '/blocks/' + pageId + '/children', { children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: (d + ' · ' + text).slice(0, 1900) } }] } }] });
}

// Двигает этап лида вперёд и дописывает заметку. Возвращает страницу лида или null.
async function advance(pg, stage, extra, text) {
  const cur = prop(pg, 'Этап');
  const props = Object.assign({}, extra || {});
  if (stage === 'Отказ') { if (cur !== 'Сделка/Оплачено') props['Этап'] = { select: { name: 'Отказ' } }; }
  else if (stage && (RANK[stage] || 0) > (RANK[cur] || 0)) props['Этап'] = { select: { name: stage } };
  const known = await onlyKnown(props);
  if (Object.keys(known).length) await ncall('PATCH', '/pages/' + pg.id, { properties: known });
  if (text) await note(pg.id, text);
  return pg;
}

// Входящее сообщение клиента агентства (почта, форма с email). true, если лид найден в Хантере.
async function incoming(lead, intent) {
  if (!token()) return false;
  try {
    const pg = await findByEmail(emailOf(lead));
    if (!pg) return false;
    const declined = /Отказ/i.test(intent || '');
    const extra = prop(pg, 'Ответил') ? {} : { 'Ответил': { date: { start: today() } } };
    extra['Следующее касание'] = { date: null };
    await advance(pg, declined ? 'Отказ' : 'Ответ получен', extra, 'Ответ лида: ' + String(lead.message || '').slice(0, 600));
    return true;
  } catch (e) { await report('Хантер агентства: входящее', e, emailOf(lead)); return false; }
}

// Подтверждённый ответ Елены/Nicole. Запись на сессию двигает этап на «Встреча назначена».
async function replied(lead, body, sent, intent) {
  if (!token()) return false;
  try {
    const pg = await findByEmail(emailOf(lead));
    if (!pg) return false;
    await advance(pg, intent === 'booking' ? 'Встреча назначена' : '', {}, (sent ? 'Отправлен ответ: ' : 'Подтверждён ответ (отправить вручную): ') + String(body || '').slice(0, 600));
    return true;
  } catch (e) { await report('Хантер агентства: ответ', e, emailOf(lead)); return false; }
}

// КП: принято или оплачено. Ищем лида по email из диалога, затем по названию компании.
async function kpEvent(kp, kind, amount) {
  if (!token()) return '';
  try {
    const em = String((kp.client && kp.client.email) || '') || emailOf({ contact: (kp.source && kp.source.contact) || '' });
    let pg = em ? await findByEmail(em) : null;
    if (!pg) pg = await findByCompany((kp.client && kp.client.company) || '');
    if (!pg) return '';
    if (kind === 'paid') {
      await advance(pg, 'Сделка/Оплачено', { 'Сумма сделки': { number: Number(amount) || 0 } }, 'Оплата по КП «' + String(kp.title || '') + '»: ' + amount);
    } else {
      await advance(pg, 'КП принято', {}, 'КП принято: «' + String(kp.title || '') + '», сумма ' + amount);
    }
    return prop(pg, 'Компания');
  } catch (e) { await report('Хантер агентства: КП', e, kp && kp.title); return ''; }
}

module.exports = { ncall, DB, schema, onlyKnown, prop, advance, findByEmail, incoming, replied, kpEvent, emailOf, today, plusDays, note };
