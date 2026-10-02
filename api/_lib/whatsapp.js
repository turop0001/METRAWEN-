// Тонкая обёртка над WhatsApp Cloud API (Meta). Секреты берутся из переменных окружения Vercel.
const crypto = require('crypto');

function clean(v) { return String(v || '').replace(/[^\x21-\x7E]/g, ''); }

// Подпись входящего запроса: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(тело, App Secret)
function verify(appSecret, rawBody, signature) {
  if (!appSecret || !signature) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', clean(appSecret)).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Ответ клиенту обычным текстом. Работает только в течение 24 часов после его последнего сообщения.
async function send(to, text) {
  const token = clean(process.env.WHATSAPP_ACCESS_TOKEN);
  const phoneId = clean(process.env.WHATSAPP_PHONE_NUMBER_ID);
  if (!token || !phoneId) throw new Error('WHATSAPP_ACCESS_TOKEN или WHATSAPP_PHONE_NUMBER_ID не задан');
  const r = await fetch('https://graph.facebook.com/v21.0/' + phoneId + '/messages', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: String(to),
      type: 'text',
      text: { preview_url: false, body: String(text).slice(0, 4000) }
    })
  });
  const body = await r.text();
  if (!r.ok) throw new Error('whatsapp ' + r.status + ' ' + body.slice(0, 300));
  try { return JSON.parse(body); } catch (e) { return {}; }
}

module.exports = { verify, send, enabled: () => !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) };
