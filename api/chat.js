// api/chat.js: чат на сайте. Сообщение клиента -> Sell Manager -> черновик Дмитрию в Telegram.
// Ответ после «Подтвердить» кладётся в историю чата, окно на сайте забирает его опросом (GET).
const { saveJson, loadJson, enabled: storeEnabled } = require('./_lib/store');
const { handleNewLead } = require('./_lib/sellmanager');

const TTL = 60 * 60 * 24 * 3;
const MAX_MSG = 1000;
const MAX_HISTORY = 80;

function validSid(s) { return typeof s === 'string' && /^[a-z0-9]{12,40}$/.test(s); }

function clean(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n); }

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!storeEnabled()) return res.status(503).json({ ok: false, error: 'unavailable' });

  if (req.method === 'GET') {
    const q = req.query || {};
    if (!validSid(q.sid)) return res.status(400).json({ ok: false });
    const n = Math.max(0, parseInt(q.n, 10) || 0);
    const chat = await loadJson('chat:' + q.sid);
    const msgs = (chat && chat.msgs) || [];
    return res.status(200).json({ ok: true, total: msgs.length, msgs: msgs.slice(n).map(function (m) { return { r: m.r, t: m.t }; }) });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};
  if (body.website) return res.status(200).json({ ok: true });
  if (!validSid(body.sid)) return res.status(400).json({ ok: false, error: 'bad_sid' });
  const message = clean(body.message, MAX_MSG);
  if (!message) return res.status(400).json({ ok: false, error: 'empty' });

  const sid = body.sid;
  // не чаще одного сообщения в 2 секунды и не больше 40 сообщений клиента на сессию
  if (await loadJson('chat:rl:' + sid)) return res.status(429).json({ ok: false, error: 'slow_down' });
  await saveJson('chat:rl:' + sid, 1, 2);

  const lang = body.lang === 'ru' ? 'ru' : 'en';
  const chat = (await loadJson('chat:' + sid)) || { msgs: [], name: '', contact: '' };
  if (chat.msgs.filter(function (m) { return m.r === 'c'; }).length >= 40) {
    return res.status(429).json({ ok: false, error: 'limit' });
  }
  const name = clean(body.name, 80) || chat.name || '';
  const contact = clean(body.contact, 120) || chat.contact || '';
  const history = chat.msgs.slice(-8).map(function (m) { return (m.r === 'c' ? 'Client: ' : 'METRAWEN: ') + m.t; }).join('\n');

  chat.msgs.push({ r: 'c', t: message, ts: Date.now() });
  chat.name = name; chat.contact = contact;
  chat.msgs = chat.msgs.slice(-MAX_HISTORY);
  await saveJson('chat:' + sid, chat, TTL);

  const lead = {
    label: 'Чат на сайте',
    channel: 'chat',
    chatSid: sid,
    chatLang: lang,
    name: name,
    contact: contact ? 'Чат на сайте: ' + contact : 'Чат на сайте' + (name ? ' (' + name + ')' : ''),
    message: message,
    history: history,
    page: clean(body.page, 300)
  };

  const job = handleNewLead(lead).catch(function (e) { console.error('chat: не обработано', e); });
  let bg = null;
  try { bg = require('@vercel/functions').waitUntil; } catch (e) { bg = null; }
  if (bg) { bg(job); } else { await job; }
  return res.status(200).json({ ok: true });
};
