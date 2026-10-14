// Разовая выгрузка Hunter CRM (Notion) в формате строк для METRAWEN OS (importHunterLeads).
// Вызывается через api/cron.js?job=hunter-export с заголовком x-export-token (переменная HUNTER_EXPORT_TOKEN).
// Только чтение: ничего в Notion не меняет. Отдаёт до 100 строк за вызов, продолжение по cursor.
const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
const DEFAULT_DB = 'b3fe6fa8665e4cbf8307475d147e1dac';

function db() { return String(process.env.NOTION_CRM_DB_ID || '').replace(/[^0-9a-fA-F-]/g, '') || DEFAULT_DB; }

function txt(p) {
  if (!p) return '';
  if (p.type === 'title') return (p.title || []).map(function (x) { return x.plain_text; }).join('');
  if (p.type === 'rich_text') return (p.rich_text || []).map(function (x) { return x.plain_text; }).join('');
  if (p.type === 'select') return p.select ? p.select.name : '';
  if (p.type === 'email') return p.email || '';
  if (p.type === 'number') return p.number == null ? '' : p.number;
  if (p.type === 'date') return p.date ? p.date.start : '';
  return '';
}

function row(pg) {
  const P = pg.properties || {};
  const o = { id: pg.id, company: String(txt(P['Компания']) || '').trim() };
  const set = function (k, v) { if (v !== '' && v != null) o[k] = v; };
  set('email', String(txt(P['Публичный email'])).trim());
  set('signal', txt(P['Найденный сигнал']));
  set('country', txt(P['Страна']));
  set('industry', txt(P['Отрасль']));
  set('score', txt(P['Скоринг']));
  set('stage', txt(P['Этап']));
  set('draftA', txt(P['Черновик сообщения A']));
  set('draftB', txt(P['Черновик сообщения B']));
  set('mailbox', txt(P['Ящик']));
  const t = txt(P['Касаний']); if (t !== '') o.touches = Number(t);
  set('sentAt', txt(P['Отправлено']));
  set('repliedAt', txt(P['Ответил']));
  set('nextTouchAt', txt(P['Следующее касание']));
  const a = txt(P['Сумма сделки']); if (a !== '') o.amount = Number(a);
  return o;
}

async function page(cursor) {
  const token = require('./env').secret('NOTION_TOKEN');
  if (!token) throw new Error('NOTION_TOKEN не задан');
  const ctl = new AbortController();
  const t = setTimeout(function () { ctl.abort(); }, 25000);
  try {
    const r = await fetch(API + '/databases/' + db() + '/query', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ page_size: 100, sorts: [{ timestamp: 'created_time', direction: 'ascending' }] }, cursor ? { start_cursor: cursor } : {})),
      signal: ctl.signal
    });
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error('notion ' + r.status + ' ' + String(j.message || '').slice(0, 160));
    const rows = (j.results || []).filter(function (p) { return !p.archived; }).map(row).filter(function (x) { return x.company; });
    return { rows: rows, next: j.has_more ? j.next_cursor : null };
  } finally { clearTimeout(t); }
}

module.exports = { page, row };
