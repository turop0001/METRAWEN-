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

// Бот для клиентов (@metrawen_os_bot): клиенты пишут сюда, а подтверждения и меню остаются в METRAWEN Assistant.
async function tgc(method, payload) {
  const token = process.env.TELEGRAM_CLIENT_BOT_TOKEN;
  if (!token) throw new Error('не задан TELEGRAM_CLIENT_BOT_TOKEN (бот для клиентов)');
  const r = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await r.text();
  if (!r.ok) throw new Error('telegram(client) ' + method + ' ' + r.status + ' ' + text.slice(0, 300));
  try { return JSON.parse(text); } catch (e) { return {}; }
}

module.exports = { tg, tgc };
