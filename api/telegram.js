// api/telegram.js — webhook для кнопок под черновиками Sell Manager.
// Принимает только запросы от Telegram (секрет считается из токена бота) и только от вашего чата.
const crypto = require('crypto');
const { tg } = require('./_lib/tg');
const { handleAction, handleNewLead, applyEdit } = require('./_lib/sellmanager');
const { saveJson, loadJson, enabled: storeEnabled } = require('./_lib/store');
const { report, esc } = require('./_lib/alert');

const HELP = [
  '<b>Команды Sell Manager</b>',
  '/pack 10 — пачка холодных писем METRAWEN Shop (можно добавить товар: /pack 10 #24)',
  '/pack agency 15 top — рекомендуемая пачка (самые Hot и Warm); можно hot, warm или отрасль: /pack agency 15 Клиники, вместе: hot Клиники',
  '/dm 10 Салоны красоты — карточки для ручных DM агентства (Instagram, WhatsApp, телефон, LINE)',
  '/dm shop 10 — карточки постов/комментариев/каталогов магазина (только товары со ссылкой)',
  '/report — недельный отчёт прямо сейчас',
  '/cleandrafts — почистить черновики Хантера магазина от плейсхолдеров (идёт в фоне)',
  '/menu — меню кнопками',
  '/kp — редактор КП'
].join('\n');

// Разбор «/pack agency 10 Клиники» → { brand, n, seg }.
function parseArgs(text, def) {
  const parts = text.split(/\s+/).slice(1);
  let brand = '';
  if (parts[0] && /^(agency|агентство|shop|магазин)$/i.test(parts[0])) brand = /^(agency|агентство)$/i.test(parts.shift()) ? 'agency' : 'shop';
  let n = def;
  if (parts[0] && /^\d+$/.test(parts[0])) n = parseInt(parts.shift(), 10);
  return { brand: brand, n: Math.min(Math.max(n, 1), 50), seg: parts.join(' ').trim() };
}

const INDUSTRIES = ['Фитнес и спорт', 'Салоны красоты', 'Недвижимость', 'Рестораны и кафе', 'Услуги B2B', 'Клиники', 'Туры и экскурсии', 'Интернет-магазины', 'Образование и курсы', 'Отели и виллы', 'Ритейл', 'Эксперты и консалтинг'];

const MAIN_MENU = { inline_keyboard: [
  [{ text: '🏢 АГЕНТСТВО (услуги студии)', callback_data: 'mn:ag' }],
  [{ text: '🛍 SHOP (цифровые товары)', callback_data: 'mn:sh' }],
  [{ text: '📊 Отчёт сейчас', callback_data: 'mn:rp' }, { text: '📝 Редактор КП', callback_data: 'mn:kp' }],
  [{ text: '❓ Все команды', callback_data: 'mn:hp' }]
] };

const AGENCY_MENU = { inline_keyboard: [
  [{ text: '⭐ Агентство: топ 15 (Hot+Warm) — рекомендуем', callback_data: 'mn:pt:15' }],
  [{ text: '⭐ Агентство: топ 30', callback_data: 'mn:pt:30' }, { text: '⭐ Агентство: топ 50', callback_data: 'mn:pt:50' }],
  [{ text: '🔥 Агентство: Hot (15)', callback_data: 'mn:ph' }, { text: '🌤 Агентство: Warm (15)', callback_data: 'mn:pw' }],
  [{ text: '📨 Агентство: пачка по отрасли', callback_data: 'mn:pa' }],
  [{ text: '💬 Агентство: карточки для ручных DM', callback_data: 'mn:dm' }],
  [{ text: '← Главное меню', callback_data: 'mn:main' }]
] };

const SHOP_MENU = { inline_keyboard: [
  [{ text: '🛍 Shop: пачка 15 писем — рекомендуем', callback_data: 'mn:ps:15' }],
  [{ text: '🛍 Shop: пачка 30', callback_data: 'mn:ps:30' }, { text: '🛍 Shop: пачка 50', callback_data: 'mn:ps:50' }],
  [{ text: '💬 Shop: карточки для ручных DM (10)', callback_data: 'mn:dms' }],
  [{ text: '← Главное меню', callback_data: 'mn:main' }]
] };

async function sendMenu(chatId) {
  await tg('sendMessage', { chat_id: chatId, text: '<b>METRAWEN Sell Manager</b>\nЧто делаем?', parse_mode: 'HTML', reply_markup: MAIN_MENU });
  try {
    if (storeEnabled() && !(await loadJson('tg:cmds:v1'))) {
      await tg('setMyCommands', { commands: [
        { command: 'menu', description: 'Меню действий' },
        { command: 'pack', description: 'Пачка писем: /pack agency 15 Отрасль' },
        { command: 'dm', description: 'Карточки для ручных DM' },
        { command: 'report', description: 'Отчёт сейчас' },
        { command: 'kp', description: 'Редактор КП' },
        { command: 'help', description: 'Все команды' }
      ] });
      await saveJson('tg:cmds:v1', 1, 60 * 60 * 24 * 365);
    }
  } catch (e) { console.error('telegram: setMyCommands', e); }
}

function industryKeyboard(prefix) {
  const rows = [];
  for (let i = 0; i < INDUSTRIES.length; i += 2) {
    const r = [{ text: INDUSTRIES[i], callback_data: prefix + ':' + i }];
    if (INDUSTRIES[i + 1]) r.push({ text: INDUSTRIES[i + 1], callback_data: prefix + ':' + (i + 1) });
    rows.push(r);
  }
  rows.push([{ text: '← Назад в «Агентство»', callback_data: 'mn:ag' }]);
  return { inline_keyboard: rows };
}

async function menuAction(data, chatId) {
  const p = data.split(':');
  if (p[1] === 'main') { await tg('sendMessage', { chat_id: chatId, text: 'Что делаем?', reply_markup: MAIN_MENU }); return; }
  if (p[1] === 'ag') { await tg('sendMessage', { chat_id: chatId, text: '<b>🏢 АГЕНТСТВО</b> (холодные письма по Hunter CRM, ящики getmetrawen.com)\nКакую пачку готовим?', parse_mode: 'HTML', reply_markup: AGENCY_MENU }); return; }
  if (p[1] === 'sh') { await tg('sendMessage', { chat_id: chatId, text: '<b>🛍 SHOP</b> (цифровые товары, холодные письма по лидам магазина)\nКакую пачку готовим?', parse_mode: 'HTML', reply_markup: SHOP_MENU }); return; }
  if (p[1] === 'dms') { await ownerCommand('/dm shop 10', chatId); return; }
  if (p[1] === 'pt') { const k = Math.min(Math.max(parseInt(p[2], 10) || 15, 1), 50); await ownerCommand('/pack agency ' + k + ' top', chatId); return; }
  if (p[1] === 'ph') { await ownerCommand('/pack agency 15 hot', chatId); return; }
  if (p[1] === 'pw') { await ownerCommand('/pack agency 15 warm', chatId); return; }
  if (p[1] === 'pa' && p[2] === undefined) { await tg('sendMessage', { chat_id: chatId, text: 'Пачка агентства (15 писем). Выберите отрасль:', reply_markup: industryKeyboard('mn:pa') }); return; }
  if (p[1] === 'pa') { const seg = INDUSTRIES[parseInt(p[2], 10)]; if (seg) await ownerCommand('/pack agency 15 ' + seg, chatId); return; }
  if (p[1] === 'ps') { const k = Math.min(Math.max(parseInt(p[2], 10) || 15, 1), 50); await ownerCommand('/pack shop ' + k, chatId); return; }
  if (p[1] === 'dm' && p[2] === undefined) { await tg('sendMessage', { chat_id: chatId, text: 'Карточки DM агентства (10 штук). Выберите отрасль:', reply_markup: industryKeyboard('mn:dm') }); return; }
  if (p[1] === 'dm') { const seg = INDUSTRIES[parseInt(p[2], 10)]; if (seg) await ownerCommand('/dm agency 10 ' + seg, chatId); return; }
  if (p[1] === 'rp') { await ownerCommand('/report', chatId); return; }
  if (p[1] === 'hp') { await ownerCommand('/help', chatId); return; }
  if (p[1] === 'kp') { const K = require('./_lib/kp'); await tg('sendMessage', { chat_id: chatId, text: 'Редактор КП: ' + K.adminUrl() + '\nСсылка с ключом доступа, не пересылайте её.', disable_web_page_preview: true }); return; }
}

async function ownerCommand(text, chatId) {
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*/, '');
  if (cmd === '/menu' || cmd === '/start') { await sendMenu(chatId); return; }
  if (cmd === '/help') { await tg('sendMessage', { chat_id: chatId, text: HELP, parse_mode: 'HTML' }); return; }
  if (cmd === '/report') { await tg('sendMessage', { chat_id: chatId, text: 'Собираю отчёт...' }); await require('./_lib/ops').weekly(true); return; }
  if (cmd === '/cleandrafts') {
    await require('./_lib/cleanup').start();
    await tg('sendMessage', { chat_id: chatId, text: '🧹 Чистка черновиков Хантера магазина запущена: по 4 карточки каждые 10 минут, исходный текст сохраняется в теле карточки. Напишу, когда закончу.' });
    return;
  }
  if (cmd === '/dm') {
    const a = parseArgs(text, 10);
    const brand = a.brand || 'agency';
    await tg('sendMessage', { chat_id: chatId, text: 'Готовлю ' + a.n + ' карточек для ручной отправки (' + (brand === 'shop' ? 'магазин' : 'агентство') + (a.seg ? ', ' + a.seg : '') + ')...' });
    const n = await require('./_lib/dm').sendPack(chatId, brand, a.n, a.seg);
    await tg('sendMessage', { chat_id: chatId, text: n ? 'Готово: ' + n + '. Отправьте текст вручную и нажмите «Отправил» — этап в Notion поставлю сам.' : (brand === 'shop' ? 'Нет карточек: у подходящих товаров ещё нет ссылок в каталоге или черновики ждут чистки (/cleandrafts).' : 'Нет лидов без email с готовым черновиком' + (a.seg ? ' в отрасли «' + a.seg + '»' : '') + '.') });
    return;
  }
  // /pack
  const op = require('./_lib/outreach');
  const a = parseArgs(text, 10);
  const brand = a.brand || 'shop';
  const lockKey = 'op:lock:' + brand;
  if (storeEnabled() && await loadJson(lockKey)) { await tg('sendMessage', { chat_id: chatId, text: '⏳ Пачка уже в процессе, подождите минуту.' }); return; }
  if (storeEnabled()) await saveJson(lockKey, 1, 90);
  await tg('sendMessage', { chat_id: chatId, text: '⏳ В процессе: готовлю пачку из ' + a.n + ' писем (' + (brand === 'agency' ? 'агентство' : 'магазин') + (a.seg ? ', ' + a.seg : '') + ')...' });
  let p;
  try { p = await op.buildPack(a.n, brand, a.seg); }
  finally { if (storeEnabled()) { try { await saveJson(lockKey, null, 1); } catch (e) {} } }
  const agencyBridge = brand === 'agency' ? await loadJson('email:agency:key') : true;
  const tail = brand === 'agency'
    ? (agencyBridge ? 'Отправка пойдёт сама по графику прогрева с ящиков холодной почты агентства, повтор через 4 дня без ответа.' : '⚠️ Ящик холодной почты агентства ещё не подключён: после одобрения письма встанут в очередь и уйдут, когда мост подключится. С metrawen.com холодные письма не отправляются.')
    : 'Отправка пойдёт сама по графику прогрева (с 3 ящиков getmetrawen.com, повтор через 4 дня без ответа).';
  await tg('sendMessage', { chat_id: chatId, text: p.items.length ? '✅ Готово. Пачка: ' + p.items.length + (p.items.length < a.n ? ' из ' + a.n + ' (в этой выборке больше нет подходящих лидов)' : '') + ' писем' + (a.seg ? ' (' + a.seg + ')' : '') + '. Из черновиков Notion: ' + (p.fromNotion || 0) + ', написано заново: ' + (p.written || 0) + '. Тексты записаны в карточки лидов в Notion. ' + tail : 'Нет лидов, готовых к рассылке' + (a.seg ? ' по «' + a.seg + '»' : '') + '.',
    reply_markup: p.items.length ? { inline_keyboard: [[{ text: 'Одобрить пачку', callback_data: 'op:ok:' + p.id }, { text: 'Отменить', callback_data: 'op:no:' + p.id }]] } : undefined });
}

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

  // Telegram повторяет апдейт, если ответ не пришёл вовремя: один и тот же update_id обрабатываем один раз.
  try {
    let u0 = req.body;
    if (typeof u0 === 'string') { try { u0 = JSON.parse(u0); } catch (e) { u0 = {}; } }
    if (u0 && u0.update_id && storeEnabled()) {
      const dk = 'tg:upd:' + u0.update_id;
      if (await loadJson(dk)) return res.status(200).json({ ok: true });
      await saveJson(dk, 1, 3600);
    }
  } catch (e) { console.error('telegram: dedup', e); }

  // попутно: напоминания и контроль мостов (не чаще раза в 8 минут, ошибки не мешают ответу)
  try { await require('./_lib/ops').tick(true); } catch (e) { console.error('telegram: tick', e); }

  let update = req.body;
  if (typeof update === 'string') { try { update = JSON.parse(update); } catch (e) { update = {}; } }
  const msg = update && update.message;
  if (msg && !update.callback_query) {
    if (msg.chat && String(msg.chat.id) === String(chatId) && /^\/kp/i.test(String(msg.text || ''))) {
      const K = require('./_lib/kp');
      await tg('sendMessage', { chat_id: chatId, text: 'Редактор КП: ' + K.adminUrl() + '\nСсылка с ключом доступа, не пересылайте её.', disable_web_page_preview: true });
      return res.status(200).json({ ok: true });
    }
    if (msg.chat && String(msg.chat.id) === String(chatId) && /^\/(pack|dm|report|cleandrafts|help|menu|start)\b/i.test(String(msg.text || ''))) {
      try { await ownerCommand(String(msg.text || '').trim(), chatId); }
      catch (e) { await report('Команда ' + String(msg.text).split(/\s+/)[0], e); }
      return res.status(200).json({ ok: true });
    }
    if (msg.chat && String(msg.chat.id) === String(chatId)) {
      try { await applyEdit(msg); } catch (e) { await report('Правка черновика', e); }
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

  if (/^mn:/.test(String(cq.data || ''))) {
    try { await tg('answerCallbackQuery', { callback_query_id: cq.id }); } catch (e) {}
    try { await menuAction(String(cq.data), chatId); } catch (e) { await report('Меню бота', e); }
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

  const dmm = /^dm:(s|k|x):(a|s):([a-f0-9]{32})$/.exec(String(cq.data || ''));
  if (dmm) {
    let txt = '';
    try { txt = await require('./_lib/dm').action(dmm[1], dmm[2], dmm[3]); }
    catch (e) { txt = 'Не получилось обновить Notion'; await report('DM-карточка: этап', e); }
    try { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: txt.slice(0, 190) }); } catch (e) {}
    if (dmm[1] !== 'k') { try { await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: (dmm[1] === 's' ? '✅ ' : '⛔ ') + txt.slice(0, 50), callback_data: 'noop' }]] } }); } catch (e) {} }
    return res.status(200).json({ ok: true });
  }

  const emm = /^em:(ok|no)(:shop|:agency)?$/.exec(String(cq.data || ''));
  if (emm) {
    const bridge = require('./_lib/emailbridge');
    const sc = emm[2] ? emm[2].slice(1) : 'main';
    const yes = emm[1] === 'ok';
    let ok = false;
    try { ok = yes ? await bridge.approve(sc) : (await bridge.reject(sc), false); } catch (e) { console.error('telegram: email bridge', e); }
    try { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: yes ? (ok ? 'Почта подключена' : 'Запрос устарел') : 'Отклонено' }); } catch (e) {}
    try { await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }); } catch (e) {}
    try { await tg('sendMessage', { chat_id: chatId, text: yes ? (ok ? (sc === 'agency' ? '✅ Холодная почта агентства подключена. Ответы лидов будут приходить сюда черновиками (Елена / Nicole), рассылка: /pack agency 10 <отрасль>.' : sc === 'shop' ? '✅ Почта METRAWEN Shop подключена. Письма на getmetrawen.com и от площадок будут приходить сюда черновиками (Алина / Emma).' : '✅ Почта подключена к Sell Manager. Письма на sales@, support@, info@, help@ будут приходить сюда черновиками.') : 'Запрос на подключение почты устарел. Запустите register() в скрипте ещё раз.') : 'Подключение почты отклонено.' }); } catch (e) {}
    return res.status(200).json({ ok: true });
  }

  const m = /^(rg|sh|sk|ok|ca|ed):([a-z0-9]+)$/.exec(String(cq.data || ''));
  if (!m) {
    try { await tg('answerCallbackQuery', { callback_query_id: cq.id }); } catch (e) {}
    return res.status(200).json({ ok: true });
  }

  try { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: m[1] === 'ok' ? 'Подтверждено' : m[1] === 'sk' || m[1] === 'ca' ? 'Ок' : m[1] === 'ed' ? 'Жду вашу правку' : 'Пишу новый вариант...' }); } catch (e) {}

  try {
    await handleAction(m[1], m[2], cq.message);
  } catch (err) {
    console.error('telegram: ошибка действия', err);
    try { await tg('sendMessage', { chat_id: chatId, text: 'Не получилось: ' + String(err.message || err).slice(0, 200) }); } catch (e) {}
  }
  return res.status(200).json({ ok: true });
};
