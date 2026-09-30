// Sell Manager v1: генерирует ЧЕРНОВИК ответа на заявку. Ничего клиенту не отправляет.
const { SYSTEM } = require('./kb');
const { saveJson, loadJson, enabled: storeEnabled } = require('./store');
const { tg } = require('./tg');
const { draftFromRules } = require('./rules');
const llm = require('./llm');
const line = require('./line');


function detectLang(lead) {
  if (/\/ru(\/|$)/.test(String(lead.page || ''))) return 'ru';
  if (/[а-яё]/i.test(String(lead.message || ''))) return 'ru';
  return 'en';
}

function leadToText(lead) {
  const rows = [
    ['Form', lead.label],
    ['Channel', lead.channel === 'line' ? 'LINE chat: a short chat message, no subject line, no email greeting or formatting. Return subject as an empty string. Reply in the language of the lead message.' : ''],
    ['Name', lead.name],
    ['Contact', lead.contact],
    ['Company', lead.company],
    ['Industry', lead.industry],
    ['Chosen slot', lead.slot],
    ['Message', lead.message],
    ['Page', lead.page],
    ['Page language', detectLang(lead)]
  ];
  return rows.filter(r => r[1]).map(r => r[0] + ': ' + String(r[1]).slice(0, 1500)).join('\n');
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no json in model output');
  return JSON.parse(text.slice(start, end + 1));
}

async function callModel(lead, mode, previous) {
  let instruction = 'Here is a new inbound lead from the website form. Write the draft reply.\n\n<lead>\n' + leadToText(lead) + '\n</lead>';
  if (previous && mode === 'regen') {
    instruction += '\n\nHere is the previous draft. Write a clearly different version (different angle and wording, same rules):\n<previous>\n' + previous.body + '\n</previous>';
  }
  if (previous && mode === 'shorter') {
    instruction += '\n\nHere is the previous draft. Rewrite it noticeably shorter (2-4 sentences), same rules:\n<previous>\n' + previous.body + '\n</previous>';
  }
  const text = await llm.complete(SYSTEM, instruction, 900);
  const j = extractJson(text);
  return {
    intent: String(j.intent || ''),
    escalate: !!j.escalate,
    reason: String(j.reason || ''),
    subject: String(j.subject || ''),
    body: String(j.body || '')
  };
}

// Если задан ключ модели (Claude, OpenAI или совместимый), пишет модель. Иначе работают готовые шаблоны (бесплатно).
async function generateDraft(lead, mode, previous) {
  if (llm.enabled()) {
    try {
      const d = await callModel(lead, mode, previous);
      d.mode = 'ai';
      return d;
    } catch (err) {
      console.error('sellmanager: модель недоступна, беру шаблон', err);
    }
  }
  return draftFromRules(lead, mode);
}

function keyboard(id, mode) {
  const row = mode === 'ai'
    ? [{ text: 'Переписать', callback_data: 'rg:' + id }, { text: 'Короче', callback_data: 'sh:' + id }]
    : [{ text: 'Короче', callback_data: 'sh:' + id }];
  return { inline_keyboard: [row, [{ text: 'Подтвердить', callback_data: 'ok:' + id }]] };
}

const INTENT_RU = {
  booking: 'Запись на сессию',
  interested: 'Интерес к услугам',
  price_question: 'Вопрос о цене',
  has_solution_already: 'Уже есть решение',
  not_now: 'Пока не готов',
  wants_proposal: 'Просит предложение',
  decline: 'Отказ',
  question: 'Вопрос',
  spam_or_unclear: 'Неясное сообщение'
};

function esc(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDraft(lead, d) {
  const src = d.mode === 'rules' ? 'по шаблону' : 'ИИ';
  const todo = d.escalate
    ? 'Ответьте сами. Здесь нужен ваш разбор, черновик нейтральный.'
    : 'Прочитайте текст ниже. Если всё верно, нажмите «Подтвердить».';
  const lines = [
    '<b>ЧЕРНОВИК ОТВЕТА</b> (' + src + ')',
    '────────────────',
    lead.contact ? '<b>Кому:</b> ' + esc(lead.contact) : null,
    lead.channel === 'line' && lead.message ? '<b>Клиент написал:</b> ' + esc(String(lead.message).slice(0, 500)) : null,
    '<b>Тип обращения:</b> ' + esc(INTENT_RU[d.intent] || d.intent || 'не определён'),
    '<b>Что делать:</b> ' + esc(todo),
    d.reason ? '<b>Почему такой ответ:</b> ' + esc(String(d.reason).slice(0, 500)) : null,
    '',
    d.subject && lead.channel !== 'line' ? '<b>Тема письма</b>\n' + esc(d.subject) : null,
    d.subject && lead.channel !== 'line' ? '' : null,
    lead.channel === 'line' ? '<b>Текст сообщения в LINE</b>' : '<b>Текст письма</b>',
    '<blockquote>' + esc(String(d.body || '').slice(0, 2600)) + '</blockquote>'
  ].filter(function (x) { return x !== null; });
  return lines.join('\n');
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Вызывается из api/lead.js после того, как заявка отправлена в Telegram.
async function handleNewLead(lead) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  try {
    const d = await generateDraft(lead, 'new', null);
    const id = newId();
    let withButtons = false;
    if (storeEnabled()) {
      await saveJson('lead:' + id, { lead, draft: d });
      withButtons = true;
    }
    await tg('sendMessage', {
      chat_id: chatId,
      text: formatDraft(lead, d),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: withButtons ? keyboard(id, d.mode) : undefined
    });
  } catch (err) {
    console.error('sellmanager: не удалось подготовить черновик', err);
    try {
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Sell Manager: черновик ответа не получился (' + String(err.message || err).slice(0, 200) + '). Ответьте на заявку вручную.'
      });
    } catch (e) { /* ничего */ }
  }
}

// Вызывается из api/telegram.js при нажатии кнопок.
async function handleAction(action, id, message) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const rec = await loadJson('lead:' + id);
  if (!rec) {
    await tg('sendMessage', { chat_id: chatId, text: 'Заявка не найдена (срок хранения истёк или база не подключена).' });
    return;
  }
  // убрать кнопки со старого сообщения
  try {
    await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: message.message_id, reply_markup: { inline_keyboard: [] } });
  } catch (e) { /* ничего */ }

  if (action === 'ok') {
    const dd = rec.draft || {};
    const isLine = rec.lead.channel === 'line' && rec.lead.lineUserId;
    let sentLine = false;
    let lineErr = '';
    if (isLine) {
      try {
        await line.push(rec.lead.lineUserId, dd.body || '');
        sentLine = true;
      } catch (e) {
        lineErr = String(e.message || e).slice(0, 200);
        console.error('sellmanager: LINE не отправил', e);
      }
    }
    await saveJson('lead:' + id, { lead: rec.lead, draft: dd, approved: true, sent: sentLine });
    const head = isLine
      ? (sentLine ? '<b>ПОДТВЕРЖДЕНО И ОТПРАВЛЕНО В LINE</b>' : '<b>ПОДТВЕРЖДЕНО, НО В LINE НЕ ОТПРАВИЛОСЬ</b>')
      : '<b>ПОДТВЕРЖДЕНО</b>';
    const tail = isLine
      ? (sentLine ? null : 'Ошибка LINE: ' + esc(lineErr) + '\nСкопируйте текст и ответьте клиенту вручную.')
      : 'Отправка из бота заработает после подключения почты. Пока скопируйте текст (нажатие на блок копирует его) и отправьте вручную.';
    const txt = [
      head,
      '────────────────',
      rec.lead.contact ? '<b>Кому:</b> ' + esc(rec.lead.contact) : null,
      !isLine && dd.subject ? '<b>Тема:</b> ' + esc(dd.subject) : null,
      '',
      '<pre>' + esc(String(dd.body || '').slice(0, 3000)) + '</pre>',
      tail ? '' : null,
      tail
    ].filter(function (x) { return x !== null; }).join('\n');
    await tg('sendMessage', { chat_id: chatId, text: txt, parse_mode: 'HTML', reply_to_message_id: message.message_id });
    return;
  }
  if (action === 'sk') {
    await tg('sendMessage', { chat_id: chatId, text: 'Пропущено.', reply_to_message_id: message.message_id });
    return;
  }
  const mode = action === 'sh' ? 'shorter' : 'regen';
  const d = await generateDraft(rec.lead, mode, rec.draft);
  await saveJson('lead:' + id, { lead: rec.lead, draft: d });
  await tg('sendMessage', {
    chat_id: chatId,
    text: formatDraft(rec.lead, d),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: keyboard(id, d.mode)
  });
}

module.exports = { handleNewLead, handleAction };
