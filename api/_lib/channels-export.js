// Сводка по личным ручным отправкам (Instagram, Telegram, LinkedIn, Upwork) для рабочего стола METRAWEN OS.
// Источник: база Notion «Лиды по каналам». Только чтение. Отдаёт агрегаты, а не карточки людей.
const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
const DEFAULT_DB = '2ab374b320594ee5bd115f329a9c3594';
const CHANNELS = [
  { key: 'instagram', notion: 'Instagram', label: 'Instagram' },
  { key: 'telegram', notion: 'Telegram-группа', label: 'Telegram' },
  { key: 'linkedin', notion: 'LinkedIn', label: 'LinkedIn' },
  { key: 'upwork', notion: 'Upwork', label: 'Upwork' }
];

function dbId() { return String(process.env.NOTION_CHANNELS_DB_ID || '').replace(/[^0-9a-fA-F-]/g, '') || DEFAULT_DB; }
function sel(p) { return p && p.select ? p.select.name : ''; }
function chk(p) { return !!(p && p.checkbox); }
function day(p) { return p && p.date && p.date.start ? String(p.date.start).slice(0, 10) : ''; }

async function pages() {
  const token = require('./env').secret('NOTION_TOKEN');
  if (!token) throw new Error('NOTION_TOKEN не задан');
  const out = []; let cursor = null;
  for (let i = 0; i < 12; i++) {
    const ctl = new AbortController();
    const t = setTimeout(function () { ctl.abort(); }, 8000);
    try {
      const r = await fetch(API + '/databases/' + dbId() + '/query', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ page_size: 100 }, cursor ? { start_cursor: cursor } : {})),
        signal: ctl.signal
      });
      const j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error('notion ' + r.status + ' ' + String(j.message || '').slice(0, 160));
      (j.results || []).forEach(function (p) { if (!p.archived) out.push(p); });
      if (!j.has_more) break;
      cursor = j.next_cursor;
    } finally { clearTimeout(t); }
  }
  return out;
}

function summary(list) {
  const today = new Date();
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(today.getTime() - i * 86400000); days.push(d.toISOString().slice(0, 10)); }
  const res = CHANNELS.map(function (c) {
    return { key: c.key, label: c.label, inList: 0, added: 0, written: 0, replied: 0, dialogs: 0, calls: 0, orders: 0, refused: 0, days: days.map(function () { return 0; }) };
  });
  const byName = {}; CHANNELS.forEach(function (c, i) { byName[c.notion] = res[i]; });
  list.forEach(function (pg) {
    const P = pg.properties || {};
    const c = byName[sel(P['Канал'])];
    if (!c) return;
    c.inList++;
    if (chk(P['Добавил в контакты'])) c.added++;
    const sent = chk(P['Записка отправлена']) || !!day(P['Дата отправки']);
    if (sent) c.written++;
    const r = sel(P['Результат']);
    if (chk(P['Ответил']) || r === 'Диалог' || r === 'Созвон' || r === 'Заказ') c.replied++;
    if (r === 'Диалог') c.dialogs++;
    if (r === 'Созвон') c.calls++;
    if (r === 'Заказ') c.orders++;
    if (r === 'Отказ') c.refused++;
    const d = day(P['Дата отправки']); const k = days.indexOf(d);
    if (k >= 0) c.days[k]++;
  });
  return { at: new Date().toISOString(), days: days, channels: res };
}

function txt(p) {
  if (!p) return '';
  if (p.type === 'title') return (p.title || []).map(function (x) { return x.plain_text; }).join('');
  if (p.type === 'rich_text') return (p.rich_text || []).map(function (x) { return x.plain_text; }).join('');
  if (p.type === 'url') return p.url || '';
  return '';
}

// Строки для переноса в лиды OS: только три личных канала, без Upwork и служебных «Запрос лидов».
function rows(list) {
  const key = {}; CHANNELS.forEach(function (c) { key[c.notion] = c.key; });
  const out = [];
  list.forEach(function (pg) {
    const P = pg.properties || {};
    const ch = key[sel(P['Канал'])];
    if (!ch || ch === 'upwork') return;
    const name = String(txt(P['Название']) || '').trim();
    if (!name) return;
    const o = { id: pg.id, name: name, channel: ch, inContacts: chk(P['Добавил в контакты']), noteSent: chk(P['Записка отправлена']), replied: chk(P['Ответил']) };
    const set = function (k, v) { v = String(v || '').trim(); if (v) o[k] = v; };
    set('link', txt(P['Ссылка'])); set('city', txt(P['Город'])); set('segment', sel(P['Сегмент']));
    set('why', txt(P['Почему подходит'])); set('note', txt(P['Заметки'])); set('result', sel(P['Результат'])); set('sentAt', day(P['Дата отправки']));
    out.push(o);
  });
  return out;
}

async function run() { return summary(await pages()); }
async function rowsAll() { return { rows: rows(await pages()) }; }
module.exports = { run, rowsAll, summary, rows };
