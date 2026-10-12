// api/tgclient.js: webhook бота для клиентов (@metrawen_os_bot).
// Клиентские сообщения превращаются в лид, черновик ответа приходит владельцу в METRAWEN Assistant на «Подтвердить».
const crypto = require('crypto');
const { saveJson, loadJson, enabled: storeEnabled } = require('./_lib/store');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok');
  const token = process.env.TELEGRAM_CLIENT_BOT_TOKEN;
  const ownerChat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !ownerChat) return res.status(500).json({ ok: false });
  const secret = crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
  if (req.headers['x-telegram-bot-api-secret-token'] !== secret) return res.status(401).json({ ok: false });

  let update = req.body;
  if (typeof update === 'string') { try { update = JSON.parse(update); } catch (e) { update = {}; } }
  try {
    if (update && update.update_id && storeEnabled()) {
      const dk = 'tgc:upd:' + update.update_id;
      if (await loadJson(dk)) return res.status(200).json({ ok: true });
      await saveJson(dk, 1, 3600);
    }
  } catch (e) { console.error('tgclient: dedup', e); }

  const msg = update && update.message;
  if (msg) await require('./telegram').handleClientMessage(msg, ownerChat);
  return res.status(200).json({ ok: true });
};
