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

function authorized(req) {
  const s = secret();
  return !!s && safeEqual(req.headers['x-email-secret'], s);
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
      secret: secret(),
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

module.exports = { authorized, rememberBridge, send, secret };
