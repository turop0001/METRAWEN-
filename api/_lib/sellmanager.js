// Sell Manager v1: генерирует ЧЕРНОВИК ответа на заявку. Ничего клиенту не отправляет.
const { SYSTEM } = require('./kb');
const { saveJson, loadJson, enabled: storeEnabled } = require('./store');
const { tg } = require('./tg');
const { draftFromRules } = require('./rules');
const llm = require('./llm');
const line = require('./line');
const crm = require('./crm');


function detectLang(lead) {
  if (lead.chatLang) return lead.chatLang;
  if (/\/ru(\/|$)/.test(String(lead.page || ''))) return 'ru';
  if (/[а-яё]/i.test(String(lead.message || ''))) return 'ru';
  return 'en';
}

function leadToText(lead) {
  const rows = [
    ['Form', lead.label],
    ['Channel', (lead.channel === 'line' || lead.channel === 'telegram' || lead.channel === 'whatsapp' || lead.channel === 'chat') ? (lead.channel === 'line' ? 'LINE' : lead.channel === 'whatsapp' ? 'WhatsApp' : lead.channel === 'chat' ? 'Website' : 'Telegram') + ' chat: a short chat message, no subject line, no email greeting or formatting. Return subject as an empty string. Reply in the language of the lead message.' : ''],
    ['Channel (email)', lead.channel === 'email' ? 'Email reply to a client who wrote to ' + (lead.emailTo || 'the company address') + '. Write a proper short email: greeting by name (Здравствуйте, Анна / Hi Anna), then 3-8 plain sentences in the same live consultative style, then a sign-off on its own lines: your first name and then METRAWEN. No marketing formatting, no bullet lists unless the client asked for options. Put subject as Re: plus their subject.' : ''],
    ['Client name (this is the client, NOT Dmitry)', lead.name],
    ['Contact', lead.contact],
    ['Company', lead.company],
    ['Industry', lead.industry],
    ['Chosen slot', lead.slot],
    ['Style', lead.channel === 'chat' ? 'Live website chat. Short and warm, 1-4 sentences, plain text. No signature, no sign-off line, no subject.' : ''],
    ['Your name in this conversation', detectLang(lead) === 'ru' ? 'Елена (менеджер METRAWEN)' : 'Nicole (METRAWEN manager)'],
    ['Conversation stage', lead.firstContact ? 'FIRST message from this person: greet and introduce yourself once.' : 'Ongoing conversation: do not introduce yourself again.'],
    ['Earlier messages in this conversation', lead.history],
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
    stage: String(j.stage || ''),
    summary: String(j.summary || ''),
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

function routeInfo(lead) {
  const ch = lead.channel || 'site';
  if (ch === 'line') return { from: 'LINE', to: 'в LINE клиенту, автоматически после «Подтвердить»' };
  if (ch === 'telegram') return { from: 'Telegram (бот)', to: 'в Telegram клиенту, автоматически после «Подтвердить»' };
  if (ch === 'whatsapp') return { from: 'WhatsApp', to: 'в WhatsApp клиенту, автоматически после «Подтвердить»' };
  if (ch === 'chat') return { from: 'Чат на сайте', to: 'в чат на сайте, автоматически после «Подтвердить» (клиент увидит, пока окно открыто)' };
  if (ch === 'email') return { from: 'Email', to: 'на email клиента, автоматически после «Подтвердить»' };
  return { from: 'Сайт, форма заявки', to: 'на email клиента (отправка пока вручную, скопируйте текст после «Подтвердить»)' };
}

function formatDraft(lead, d) {
  const chat = lead.channel === 'line' || lead.channel === 'telegram' || lead.channel === 'whatsapp' || lead.channel === 'chat';
  const chatName = lead.channel === 'chat' ? 'чат на сайте' : lead.channel === 'telegram' ? 'Telegram' : lead.channel === 'whatsapp' ? 'WhatsApp' : 'LINE';
  const src = d.mode === 'rules' ? 'по шаблону' : 'ИИ';
  const todo = d.escalate
    ? 'Ответьте сами. Здесь нужен ваш разбор, черновик нейтральный.'
    : 'Прочитайте текст ниже. Если всё верно, нажмите «Подтвердить».';
  const lines = [
    '<b>ЧЕРНОВИК ОТВЕТА</b> (' + src + ')',
    '────────────────',
    '<b>Откуда:</b> ' + routeInfo(lead).from,
    lead.contact ? '<b>Кому:</b> ' + esc(lead.contact) : null,
    '<b>Куда уйдёт ответ:</b> ' + routeInfo(lead).to,
    (chat || lead.channel === 'email') && lead.message ? '<b>Клиент написал:</b> ' + esc(String(lead.message).slice(0, 500)) : null,
    '<b>Тип обращения:</b> ' + esc(INTENT_RU[d.intent] || d.intent || 'не определён'),
    d.stage === 'hot' ? '<b>🔥 ГОРЯЧИЙ КЛИЕНТ</b>, готов двигаться' : null,
    d.summary ? '<b>Что известно:</b> ' + esc(String(d.summary).slice(0, 400)) : null,
    '<b>Что делать:</b> ' + esc(todo),
    d.reason ? '<b>Почему такой ответ:</b> ' + esc(String(d.reason).slice(0, 500)) : null,
    '',
    d.subject && !chat ? '<b>Тема письма</b>\n' + esc(d.subject) : null,
    d.subject && !chat ? '' : null,
    chat ? '<b>Текст сообщения в ' + chatName + '</b>' : '<b>Текст письма</b>',
    '<blockquote>' + esc(String(d.body || '').slice(0, 2600)) + '</blockquote>'
  ].filter(function (x) { return x !== null; });
  return lines.join('\n');
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}



function convKey(lead) {
  if (lead.chatSid) return 'chat:' + lead.chatSid;
  if (lead.emailAddr) return 'email:' + lead.emailAddr;
  if (lead.waId) return 'wa:' + lead.waId;
  if (lead.tgChatId) return 'tg:' + lead.tgChatId;
  if (lead.lineUserId) return 'line:' + lead.lineUserId;
  return 'site:' + String(lead.contact || lead.name || '').toLowerCase().slice(0, 120);
}

// История диалога для живого общения: первое ли это сообщение и что было раньше.
async function prepContext(lead) {
  if (!storeEnabled()) { lead.firstContact = !lead.history; return; }
  try {
    const key = 'hist:' + convKey(lead);
    const h = (await loadJson(key)) || [];
    lead.firstContact = h.length === 0 && !lead.history;
    if (!lead.history && h.length) {
      lead.history = h.slice(-10).map(function (m) { return (m.r === 'c' ? 'Client: ' : 'You: ') + m.t; }).join('\n');
    }
    h.push({ r: 'c', t: String(lead.message || '').slice(0, 1500) });
    await saveJson(key, h.slice(-30), 60 * 60 * 24 * 90);
  } catch (e) { lead.firstContact = !lead.history; }
}

async function rememberReply(lead, text) {
  if (!storeEnabled() || !text) return;
  try {
    const key = 'hist:' + convKey(lead);
    const h = (await loadJson(key)) || [];
    h.push({ r: 't', t: String(text).slice(0, 1500) });
    await saveJson(key, h.slice(-30), 60 * 60 * 24 * 90);
  } catch (e) { /* ничего */ }
}

// Если Елена пообещала смету, сразу готовим черновик КП и присылаем ссылку на редактор.
async function maybeDraftKp(lead, d) {
  try {
    if (!d || d.intent !== 'wants_proposal' || !llm.enabled() || !storeEnabled()) return;
    const flag = 'kpdraft:' + convKey(lead);
    if (await loadJson(flag)) return;
    await saveJson(flag, 1, 60 * 60 * 24);
    const K = require('./kp');
    const kp = await K.draftFromConversation(lead, detectLang(lead));
    await tg('sendMessage', {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: '📄 <b>Черновик КП готов</b>\n' + esc(kp.title || '') + (kp.client.name ? ' · ' + esc(kp.client.name) : '') + '\nПроверьте цены, добавьте ссылку на оплату и опубликуйте:\n' + K.adminUrl(kp.id),
      parse_mode: 'HTML', disable_web_page_preview: true
    });
  } catch (e) { console.error('sellmanager: черновик КП не получился', e); }
}

function stripSign(body) {
  return String(body || '').replace(/\n+\s*(METRAWEN team|Команда METRAWEN|Елена|Nicole)[^\n]{0,40}\s*$/i, '').trim();
}

async function pushChat(sid, text) {
  const key = 'chat:' + sid;
  const cc = (await loadJson(key)) || { msgs: [] };
  cc.msgs.push({ r: 't', t: String(text || '').slice(0, 3500), ts: Date.now() });
  cc.msgs = cc.msgs.slice(-80);
  await saveJson(key, cc, 60 * 60 * 24 * 3);
}

// Чат на сайте: ответ уходит клиенту сразу, без подтверждения. Исключение: сложные вопросы (договор, счёт, юридическое).
async function handleChatLead(lead) {
  await prepContext(lead);
  const chatId = process.env.TELEGRAM_CHAT_ID;
  let crmIntent = '';
  let lastChatDraft = null;
  let autoReply = null;
  try {
    const d = await generateDraft(lead, 'new', null);
    lastChatDraft = d;
    d.body = stripSign(d.body);
    crmIntent = INTENT_RU[d.intent] || d.intent || '';
    const id = newId();
    if (d.escalate) {
      await saveJson('lead:' + id, { lead, draft: d });
      const hold = lead.chatLang === 'ru'
        ? 'Передали ваш вопрос специалисту. Он ответит прямо здесь, в чате.'
        : 'We have passed your question to a specialist. They will reply right here in the chat.';
      await pushChat(lead.chatSid, hold);
      await tg('sendMessage', {
        chat_id: chatId,
        text: '<b>ЧАТ НА САЙТЕ: нужен ваш ответ</b>\nКлиенту отправлено только уведомление, что вопрос передан специалисту.\n\n' + formatDraft(lead, d),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: keyboard(id, d.mode)
      });
    } else {
      await pushChat(lead.chatSid, d.body);
      await rememberReply(lead, d.body);
      await saveJson('lead:' + id, { lead, draft: d, approved: true, sent: true });
      autoReply = d.body;
      const txt = [
        '<b>ОТВЕТ ОТПРАВЛЕН В ЧАТ САЙТА БЕЗ ПОДТВЕРЖДЕНИЯ</b>',
        '────────────────',
        lead.contact ? '<b>Клиент:</b> ' + esc(lead.contact) : null,
        '<b>Написал:</b> ' + esc(String(lead.message || '').slice(0, 600)),
        '<b>Тип обращения:</b> ' + esc(crmIntent || 'не определён'),
        d.stage === 'hot' ? '<b>🔥 ГОРЯЧИЙ КЛИЕНТ</b>, готов двигаться. Подключитесь.' : null,
        d.summary ? '<b>Что известно:</b> ' + esc(String(d.summary).slice(0, 400)) : null,
        '',
        '<b>Что ушло клиенту</b>',
        '<blockquote>' + esc(String(d.body || '').slice(0, 2600)) + '</blockquote>'
      ].filter(function (x) { return x !== null; }).join('\n');
      await tg('sendMessage', { chat_id: chatId, text: txt, parse_mode: 'HTML', disable_web_page_preview: true });
    }
  } catch (err) {
    console.error('sellmanager: чат не обработан', err);
    try {
      await tg('sendMessage', { chat_id: chatId, text: 'Чат на сайте: ответ не получился (' + String(err.message || err).slice(0, 200) + '). Клиент ждёт в чате, ответьте вручную: ' + String(lead.contact || '') + '\nВопрос: ' + String(lead.message || '').slice(0, 500) });
    } catch (e) { /* ничего */ }
  }
  await crm.logIncoming(lead, crmIntent);
  if (autoReply) await crm.logReply(lead, autoReply, true);
  await maybeDraftKp(lead, lastChatDraft);
}

// Вызывается из api/lead.js после того, как заявка отправлена в Telegram.
async function handleNewLead(lead) {
  if (lead.channel === 'chat' && lead.chatSid && storeEnabled()) return handleChatLead(lead);
  await prepContext(lead);
  const chatId = process.env.TELEGRAM_CHAT_ID;
  let crmIntent = '';
  let lastDraft = null;
  try {
    const d = await generateDraft(lead, 'new', null);
    lastDraft = d;
    crmIntent = INTENT_RU[d.intent] || d.intent || '';
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
  // CRM: сохраняем сообщение клиента в Notion (если задан NOTION_TOKEN)
  await crm.logIncoming(lead, crmIntent);
  await maybeDraftKp(lead, lastDraft);
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
    const isTg = rec.lead.channel === 'telegram' && rec.lead.tgChatId;
    const isWa = rec.lead.channel === 'whatsapp' && rec.lead.waId;
    const isChat = rec.lead.channel === 'chat' && rec.lead.chatSid;
    const isEmail = rec.lead.channel === 'email' && rec.lead.emailAddr;
    const isLine = (rec.lead.channel === 'line' && rec.lead.lineUserId) || isTg || isWa || isChat || isEmail;
    const chName = isEmail ? 'EMAIL' : isChat ? 'ЧАТ НА САЙТЕ' : isTg ? 'TELEGRAM' : isWa ? 'WHATSAPP' : 'LINE';
    let sentLine = false;
    let lineErr = '';
    if (isLine) {
      try {
        if (isEmail) {
          const subj = String(dd.subject || '').trim() || ('Re: ' + String(rec.lead.emailSubject || '').replace(/^(re:\s*)+/i, ''));
          await require('./emailbridge').send(rec.lead, /^re:/i.test(subj) ? subj : 'Re: ' + subj, dd.body || '');
        }
        else if (isChat) {
          const ck = 'chat:' + rec.lead.chatSid;
          const cc = (await loadJson(ck)) || { msgs: [] };
          cc.msgs.push({ r: 't', t: String(dd.body || '').slice(0, 3500), ts: Date.now() });
          cc.msgs = cc.msgs.slice(-80);
          await saveJson(ck, cc, 60 * 60 * 24 * 3);
        }
        else if (isTg) { await tg('sendMessage', { chat_id: rec.lead.tgChatId, text: String(dd.body || '').slice(0, 3500) }); }
        else if (isWa) {
          const wr = await require('./whatsapp').send(rec.lead.waId, dd.body || '');
          // запоминаем текст, чтобы при недоставке дать ссылку на ручную отправку
          try {
            const wid = wr && wr.messages && wr.messages[0] && wr.messages[0].id;
            const keep = { to: rec.lead.waId, body: String(dd.body || '') };
            if (wid) await saveJson('wa:out:' + wid, keep, 60 * 60 * 24 * 7);
            await saveJson('wa:last:' + rec.lead.waId, keep, 60 * 60 * 24 * 7);
          } catch (e2) { console.error('sellmanager: не сохранил ответ WA', e2); }
        }
        else { await line.push(rec.lead.lineUserId, dd.body || ''); }
        sentLine = true;
      } catch (e) {
        lineErr = String(e.message || e).slice(0, 200);
        console.error('sellmanager: LINE не отправил', e);
      }
    }
    await saveJson('lead:' + id, { lead: rec.lead, draft: dd, approved: true, sent: sentLine });
    await crm.logReply(rec.lead, dd.body || '', isLine ? sentLine : false);
    await rememberReply(rec.lead, dd.body || '');
    const head = isLine
      ? (sentLine ? '<b>ПОДТВЕРЖДЕНО И ОТПРАВЛЕНО В ' + chName + '</b>' : '<b>ПОДТВЕРЖДЕНО, НО В ' + chName + ' НЕ ОТПРАВИЛОСЬ</b>')
      : '<b>ПОДТВЕРЖДЕНО</b>';
    const tail = isLine
      ? (sentLine ? null : 'Ошибка ' + chName + ': ' + esc(lineErr) + '\nСкопируйте текст и ответьте клиенту вручную.')
      : 'Отправка из бота заработает после подключения почты. Пока скопируйте текст (нажатие на блок копирует его) и отправьте вручную.';
    const txt = [
      head,
      '────────────────',
      '<b>Откуда:</b> ' + routeInfo(rec.lead).from,
      rec.lead.contact ? '<b>Кому:</b> ' + esc(rec.lead.contact) : null,
      (!isLine || isEmail) && dd.subject ? '<b>Тема:</b> ' + esc(dd.subject) : null,
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
