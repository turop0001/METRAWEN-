// Тонкая обёртка над Telegram Bot API.
async function tg(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const r = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await r.text();
  if (!r.ok) throw new Error('telegram ' + method + ' ' + r.status + ' ' + text.slice(0, 300));
  try { return JSON.parse(text); } catch (e) { return {}; }
}

module.exports = { tg };
