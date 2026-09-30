// api/telegram.js — webhook для кнопок под черновиками Sell Manager.
// Принимает только запросы от Telegram (секрет считается из токена бота) и только от вашего чата.
const crypto = require('crypto');
const { tg } = require('./_lib/tg');
const { handleAction } = require('./_lib/sellmanager');

module.exports = async function handler(req, res) {
  // SETUP_TMP: одноразовая регистрация webhook. Удаляется после настройки.
  if (req.method === 'GET' && req.query && req.query.setup === '1') {
    try {
      const tk = process.env.TELEGRAM_BOT_TOKEN;
      if (!tk) return res.status(500).json({ ok: false, error: 'no token' });
      const sec = crypto.createHash('sha256').update(tk).digest('hex').slice(0, 32);
      await tg('setWebhook', { url: 'https://metrawen.com/api/telegram', secret_token: sec, allowed_updates: ['callback_query'] });
      const info = await tg('getWebhookInfo', {});
      const r = info.result || {};
      return res.status(200).json({ ok: true, url: r.url, pending: r.pending_update_count, last_error: r.last_error_message || null });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e.message || e).replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot<hidden>') });
    }
  }
  if (req.method !== 'POST') return res.status(200).send('ok');

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return res.status(500).json({ ok: false });

  const secret = crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
  if (req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).json({ ok: false });
  }

  let update = req.body;
  if (typeof update === 'string') { try { update = JSON.parse(update); } catch (e) { update = {}; } }
  const cq = update && update.callback_query;
  if (!cq || !cq.message) return res.status(200).json({ ok: true });

  // только ваш чат
  if (String(cq.message.chat.id) !== String(chatId)) {
    try { await tg('answerCallbackQuery', { callback_query_id: cq.id }); } catch (e) {}
    return res.status(200).json({ ok: true });
  }

  const m = /^(rg|sh|sk):([a-z0-9]+)$/.exec(String(cq.data || ''));
  if (!m) {
    try { await tg('answerCallbackQuery', { callback_query_id: cq.id }); } catch (e) {}
    return res.status(200).json({ ok: true });
  }

  try { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: m[1] === 'sk' ? 'Ок' : 'Пишу новый вариант...' }); } catch (e) {}

  try {
    await handleAction(m[1], m[2], cq.message);
  } catch (err) {
    console.error('telegram: ошибка действия', err);
    try { await tg('sendMessage', { chat_id: chatId, text: 'Не получилось: ' + String(err.message || err).slice(0, 200) }); } catch (e) {}
  }
  return res.status(200).json({ ok: true });
};
