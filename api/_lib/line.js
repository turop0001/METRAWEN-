// Тонкая обёртка над LINE Messaging API. Секреты берутся из переменных окружения Vercel.
const crypto = require('crypto');

// Из панели Vercel в значение иногда попадают невидимые символы (перенос строки, U+2028, пробелы). Оставляем только печатный ASCII.
function clean(v) { return String(v || '').replace(/[^\x21-\x7E]/g, ''); }

function verify(secret, rawBody, signature) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', clean(secret)).update(rawBody).digest();
  let given;
  try { given = Buffer.from(String(signature), 'base64'); } catch (e) { return false; }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

async function call(path, method, payload) {
  const token = clean(process.env.LINE_CHANNEL_ACCESS_TOKEN);
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN не задан');
  const r = await fetch('https://api.line.me' + path, {
    method: method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined
  });
  const text = await r.text();
  if (!r.ok) throw new Error('line ' + path + ' ' + r.status + ' ' + text.slice(0, 300));
  try { return JSON.parse(text); } catch (e) { return {}; }
}

async function profile(userId) {
  try { return await call('/v2/bot/profile/' + encodeURIComponent(userId), 'GET'); } catch (e) { return {}; }
}

async function push(userId, text) {
  return call('/v2/bot/message/push', 'POST', {
    to: userId,
    messages: [{ type: 'text', text: String(text).slice(0, 4800) }]
  });
}

module.exports = { verify, profile, push, enabled: () => !!process.env.LINE_CHANNEL_ACCESS_TOKEN };
