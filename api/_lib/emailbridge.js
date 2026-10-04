// Почтовый мост: Google Apps Script в ящике metrawen.team передаёт входящие письма в /api/email,
// а ответы клиентам Sell Manager отправляет обратно через тот же скрипт (с нужного адреса компании).
const crypto = require('crypto');
const { saveJson, loadJson, enabled: storeEnabled } = require('./store');

function secret() {
  return String(process.env.EMAIL_BRIDGE_SECRET || '').trim();
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (!x.length || x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function sha(v) {
  return crypto.createHash('sha256').update(String(v || '')).digest('hex');
}

// Ключ моста: либо EMAIL_BRIDGE_SECRET из Vercel, либо ключ, который владелец подтвердил кнопкой в Telegram.
async function authorized(req) {
  const h = req.headers['x-email-secret'] || '';
  if (!h) return false;
  const s = secret();
  if (s && safeEqual(h, s)) return true;
  if (!storeEnabled()) return false;
  const k = await loadJson('email:key');
  return !!(k && k.hash && safeEqual(sha(h), k.hash));
}

// Для исходящих запросов к скрипту используем хэш ключа: скрипт сверяет его со своим.
async function keyHash() {
  const s = secret();
  if (s) return sha(s);
  if (!storeEnabled()) return '';
  const k = await loadJson('email:key');
  return (k && k.hash) || '';
}

async function hasKey() {
  if (secret()) return true;
  if (!storeEnabled()) return false;
  return !!(await loadJson('email:key'));
}

// Первое подключение: скрипт присылает свой ключ, владелец подтверждает кнопкой в Telegram.
async function register(key, url) {
  if (!storeEnabled()) throw new Error('store off');
  if (String(key || '').length < 32) throw new Error('weak key');
  if (await loadJson('email:reg:rl')) return false;
  await saveJson('email:reg:rl', 1, 60);
  await saveJson('email:pending', { hash: sha(key), url: /^https:\/\/script\.google\.com\//.test(url || '') ? url : '' }, 60 * 60);
  const { tg } = require('./tg');
  await tg('sendMessage', {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text: '📧 <b>Подключение почты к Sell Manager</b>\nСкрипт в ящике metrawen.team просит доступ: письма с sales@, support@, info@, help@ будут приходить сюда черновиками, а подтверждённые ответы уйдут клиентам с нужного адреса.\nЕсли это вы, нажмите «Подключить».',
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: 'Подключить', callback_data: 'em:ok' }, { text: 'Отклонить', callback_data: 'em:no' }]] }
  });
  return true;
}

async function approve() {
  const p = await loadJson('email:pending');
  if (!p || !p.hash) return false;
  await saveJson('email:key', { hash: p.hash, ts: Date.now() }, 60 * 60 * 24 * 365 * 5);
  if (p.url) await saveJson('email:bridge', { url: p.url, ts: Date.now() }, 60 * 60 * 24 * 90);
  await saveJson('email:pending', null, 1);
  return true;
}

async function reject() {
  await saveJson('email:pending', null, 1);
}

async function bridgeUrl() {
  if (process.env.EMAIL_SEND_URL) return process.env.EMAIL_SEND_URL;
  if (!storeEnabled()) return '';
  const b = await loadJson('email:bridge');
  return (b && b.url) || '';
}

async function rememberBridge(url) {
  if (!url || !storeEnabled() || !/^https:\/\/script\.google\.com\//.test(url)) return;
  const cur = await loadJson('email:bridge');
  if (!cur || cur.url !== url) await saveJson('email:bridge', { url: url, ts: Date.now() }, 60 * 60 * 24 * 90);
}

// Отправка ответа клиенту через Apps Script.
async function send(lead, subject, body) {
  const url = await bridgeUrl();
  if (!url) throw new Error('почтовый мост ещё не подключён');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify({
      secretHash: await keyHash(),
      action: 'reply',
      threadId: lead.emailThread || '',
      to: lead.emailAddr,
      from: lead.emailTo || '',
      subject: subject,
      body: body
    })
  });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch (e) { /* ничего */ }
  if (!r.ok || !j || !j.ok) throw new Error('мост ответил: ' + String((j && j.error) || text).slice(0, 160));
  return j;
}

module.exports = { authorized, hasKey, register, approve, reject, rememberBridge, send, secret };
