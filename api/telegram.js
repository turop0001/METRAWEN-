// api/telegram.js — webhook для кнопок под черновиками Sell Manager.
// Принимает только запросы от Telegram (секрет считается из токена бота) и только от вашего чата.
const crypto = require('crypto');
const { tg } = require('./_lib/tg');
const { handleAction, handleNewLead } = require('./_lib/sellmanager');
const { saveJson, loadJson, enabled: storeEnabled } = require('./_lib/store');

// Обычное сообщение клиента боту. Клиенту ничего не уходит без «Подтвердить», кроме приветствия на /start.
async function handleClientMessage(msg, ownerChatId) {
  try {
    if (!msg.chat || msg.chat.type !== 'private') return;
    if (String(msg.chat.id) === String(ownerChatId)) return; // ваши сообщения боту игнорируем
    const from = msg.from || {};
    const ru = /^ru|^uk|^be|^kk/i.test(String(from.language_code || ''));
    const text = String(msg.text || '').trim();
    if (!text) return;
    if (/^\/start/i.test(text)) {
      await tg('sendMessage', {
        chat_id: msg.chat.id,
        text: ru
          ? 'Здравствуйте! Это METRAWEN. Напишите, чем можем помочь: мы прочитаем сообщение и ответим в ближайшее время.'
          : 'Hello! This is METRAWEN. Tell us what you need and our team will get back to you shortly.'
      });
      return;
    }
    if (storeEnabled()) {
      const key = 'tg:rl:' + msg.chat.id;
      if (await loadJson(key)) return;
      await saveJson(key, 1, 8);
    }
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ');
    await handleNewLead({
      label: 'Telegram',
      channel: 'telegram',
      tgChatId: msg.chat.id,
      name: name,
      contact: 'Telegram: ' + (from.username ? '@' + from.username : (name || String(msg.chat.id))),
      message: text.slice(0, 2000),
      page: ru ? '/ru/' : '/'
    });
  } catch (e) {
    console.error('telegram: сообщение клиента не обработано', e);
  }
}

module.exports = async function handler(req, res) {
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
  const msg = update && update.message;
  if (msg && !update.callback_query) {
    if (msg.chat && String(msg.chat.id) === String(chatId) && /^\/kp/i.test(String(msg.text || ''))) {
      const K = require('./_lib/kp');
      await tg('sendMessage', { chat_id: chatId, text: 'Редактор КП: ' + K.adminUrl() + '\nСсылка с ключом доступа, не пересылайте её.', disable_web_page_preview: true });
      return res.status(200).json({ ok: true });
    }
    if (msg.chat && String(msg.chat.id) === String(chatId) && /^\/pack/i.test(String(msg.text || ''))) {
      const op = require('./_lib/outreach');
      const n = Math.min(Math.max(parseInt(String(msg.text).split(/\s+/)[1], 10) || 10, 1), 30);
      await tg('sendMessage', { chat_id: chatId, text: 'Готовлю пачку из ' + n + ' писем по Хантеру...' });
      const p = await op.buildPack(n);
      const esc = function (t) { return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
      for (let i = 0; i < p.items.length; i++) {
        const it = p.items[i];
        await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', disable_web_page_preview: true,
          text: (i + 1) + '/' + p.items.length + ' · <b>' + esc(it.name) + '</b> · ' + esc(it.to) + '\n<b>Тема:</b> ' + esc(it.subject) + '\n<blockquote>' + esc(it.body) + '</blockquote>' });
      }
      await tg('sendMessage', { chat_id: chatId, text: p.items.length ? 'Пачка: ' + p.items.length + ' писем. Отправка пойдёт сама по графику прогрева (с 3 ящиков, повтор через 4 дня без ответа).' : 'Нет лидов, готовых к рассылке.',
        reply_markup: p.items.length ? { inline_keyboard: [[{ text: 'Одобрить пачку', callback_data: 'op:ok:' + p.id }, { text: 'Отменить', callback_data: 'op:no:' + p.id }]] } : undefined });
      return res.status(200).json({ ok: true });
    }
    await handleClientMessage(msg, chatId);
    return res.status(200).json({ ok: true });
  }
  const cq = update && update.callback_query;
  if (!cq || !cq.message) return res.status(200).json({ ok: true });

  // только ваш чат
  if (String(cq.message.chat.id) !== String(chatId)) {
    try { await tg('answerCallbackQuery', { callback_query_id: cq.id }); } catch (e) {}
    return res.status(200).json({ ok: true });
  }

  const opm = /^op:(ok|no):([a-z0-9]+)$/.exec(String(cq.data || ''));
  if (opm) {
    let n = 0;
    try { if (opm[1] === 'ok') n = await require('./_lib/outreach').approvePack(opm[2]); } catch (e) { console.error('telegram: пачка', e); }
    try { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: opm[1] === 'ok' ? 'Одобрено: ' + n : 'Отменено' }); } catch (e) {}
    try { await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }); } catch (e) {}
    try { await tg('sendMessage', { chat_id: chatId, text: opm[1] === 'ok' ? '✅ Одобрено ' + n + ' писем. Встали в очередь рассылки.' : 'Пачка отменена.' }); } catch (e) {}
    return res.status(200).json({ ok: true });
  }

  const emm = /^em:(ok|no)(:shop)?$/.exec(String(cq.data || ''));
  if (emm) {
    const bridge = require('./_lib/emailbridge');
    const sc = emm[2] ? 'shop' : 'main';
    const yes = emm[1] === 'ok';
    let ok = false;
    try { ok = yes ? await bridge.approve(sc) : (await bridge.reject(sc), false); } catch (e) { console.error('telegram: email bridge', e); }
    try { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: yes ? (ok ? 'Почта подключена' : 'Запрос устарел') : 'Отклонено' }); } catch (e) {}
    try { await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }); } catch (e) {}
    try { await tg('sendMessage', { chat_id: chatId, text: yes ? (ok ? (sc === 'shop' ? '✅ Почта METRAWEN Shop подключена. Письма на getmetrawen.com и от площадок будут приходить сюда черновиками (Алина / Emma).' : '✅ Почта подключена к Sell Manager. Письма на sales@, support@, info@, help@ будут приходить сюда черновиками.') : 'Запрос на подключение почты устарел. Запустите register() в скрипте ещё раз.') : 'Подключение почты отклонено.' }); } catch (e) {}
    return res.status(200).json({ ok: true });
  }

  const m = /^(rg|sh|sk|ok):([a-z0-9]+)$/.exec(String(cq.data || ''));
  if (!m) {
    try { await tg('answerCallbackQuery', { callback_query_id: cq.id }); } catch (e) {}
    return res.status(200).json({ ok: true });
  }

  try { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: m[1] === 'ok' ? 'Подтверждено' : m[1] === 'sk' ? 'Ок' : 'Пишу новый вариант...' }); } catch (e) {}

  try {
    await handleAction(m[1], m[2], cq.message);
  } catch (err) {
    console.error('telegram: ошибка действия', err);
    try { await tg('sendMessage', { chat_id: chatId, text: 'Не получилось: ' + String(err.message || err).slice(0, 200) }); } catch (e) {}
  }
  return res.status(200).json({ ok: true });
};
