// CRM в Notion: карточка на каждого клиента, внутри вся переписка (сообщения клиента и подтверждённые ответы).
// Нужны переменные: NOTION_TOKEN (секрет внутренней интеграции Notion) и, при желании, NOTION_CRM_DB_ID.
// База должна быть расшарена на интеграцию. Если токена нет, модуль молча ничего не делает.
const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
const DEFAULT_DB = 'b3fe6fa8665e4cbf8307475d147e1dac';

function clean(v) { return String(v || '').replace(/[^\x20-\x7E]/g, '').trim(); }
function token() { return clean(process.env.NOTION_TOKEN); }
function dbId() { return clean(process.env.NOTION_CRM_DB_ID) || DEFAULT_DB; }
function enabled() { return !!token(); }

async function call(method, path, body) {
  const ctl = new AbortController();
  const t = setTimeout(function () { ctl.abort(); }, 7000);
  try {
    const r = await fetch(API + path, {
      method: method,
      headers: {
        Authorization: 'Bearer ' + token(),
        'Notion-Version': VERSION,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal
    });
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error('notion ' + r.status + ' ' + String(j.message || '').slice(0, 160));
    return j;
  } finally {
    clearTimeout(t);
  }
}

const CHANNEL = { line: 'LINE', telegram: 'Telegram', whatsapp: 'WhatsApp', email: 'Email', chat: 'Чат на сайте' };

function channelOf(lead) { return CHANNEL[lead.channel] || 'Сайт'; }

function keyOf(lead) {
  if (lead.channel === 'line' && lead.lineUserId) return 'line:' + lead.lineUserId;
  if (lead.channel === 'telegram' && lead.tgChatId) return 'tg:' + lead.tgChatId;
  if (lead.channel === 'whatsapp' && lead.waId) return 'wa:' + lead.waId;
  if (lead.channel === 'chat' && lead.chatSid) return 'chat:' + lead.chatSid;
  return 'site:' + String(lead.contact || lead.name || 'unknown').toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

function text(s) {
  const out = [];
  const str = String(s == null ? '' : s);
  for (let i = 0; i < str.length && out.length < 20; i += 1900) {
    out.push({ type: 'text', text: { content: str.slice(i, i + 1900) } });
  }
  return out.length ? out : [{ type: 'text', text: { content: '' } }];
}

function stamp() {
  // время по Бангкоку
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' (GMT+7)';
}

function blocks(kind, body, extra) {
  const head = (kind === 'in' ? 'Клиент' : 'METRAWEN') + ' · ' + stamp() + (extra ? ' · ' + extra : '');
  return [
    { object: 'block', type: 'heading_3', heading_3: { rich_text: text(head), color: kind === 'in' ? 'default' : 'gray' } },
    { object: 'block', type: 'quote', quote: { rich_text: text(body) } }
  ];
}

async function findPage(key) {
  const j = await call('POST', '/databases/' + dbId() + '/query', {
    filter: { property: 'Ключ', rich_text: { equals: key } },
    page_size: 1
  });
  return j.results && j.results[0] ? j.results[0] : null;
}

function countOf(page) {
  const p = page && page.properties && page.properties['Сообщений'];
  return p && typeof p.number === 'number' ? p.number : 0;
}

async function upsert(lead, kind, body, extra, intent, stage) {
  const key = keyOf(lead);
  const nowIso = new Date().toISOString();
  let page = await findPage(key);
  const children = blocks(kind, body, extra);
  if (!page) {
    const props = {
      'Клиент': { title: text(lead.name || lead.contact || 'Без имени').slice(0, 1) },
      'Канал': { select: { name: channelOf(lead) } },
      'Контакт': { rich_text: text(lead.contact || '') },
      'Ключ': { rich_text: text(key) },
      'Этап': { select: { name: stage || 'Новый' } },
      'Первое обращение': { date: { start: nowIso } },
      'Последнее сообщение': { date: { start: nowIso } },
      'Сообщений': { number: 1 }
    };
    if (intent) props['Тип обращения'] = { rich_text: text(intent) };
    if (lead.company) props['Заметки'] = { rich_text: text('Компания: ' + lead.company + (lead.industry ? ', ' + lead.industry : '')) };
    await call('POST', '/pages', { parent: { database_id: dbId() }, properties: props, children: children });
    return;
  }
  const props = {
    'Последнее сообщение': { date: { start: nowIso } },
    'Сообщений': { number: countOf(page) + 1 }
  };
  if (stage) props['Этап'] = { select: { name: stage } };
  if (intent) props['Тип обращения'] = { rich_text: text(intent) };
  await call('PATCH', '/pages/' + page.id, { properties: props });
  await call('PATCH', '/blocks/' + page.id + '/children', { children: children });
}

// Сообщение клиента. Этап: «Ждёт ответа» (ответ ещё не подтверждён).
async function logIncoming(lead, intent) {
  if (!enabled()) return;
  try {
    const extra = lead.slot ? 'слот: ' + lead.slot : '';
    await upsert(lead, 'in', lead.message || '(пусто)', extra, intent, 'Ждёт ответа');
  } catch (e) {
    await require('./alert').report('CRM входящих: сообщение клиента не записано', e, lead.contact);
  }
}

// Подтверждённый ответ. sent=false значит «подтверждён, но отправить нужно вручную / не ушёл».
async function logReply(lead, body, sent) {
  if (!enabled()) return;
  try {
    await upsert(lead, 'out', body || '', sent ? 'отправлено' : 'подтверждено, отправить вручную', '', 'В диалоге');
  } catch (e) {
    await require('./alert').report('CRM входящих: ответ не записан', e, lead.contact);
  }
}

module.exports = { enabled, logIncoming, logReply };
