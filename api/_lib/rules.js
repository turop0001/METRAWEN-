// Sell Manager без ИИ: определяет тип заявки по ключевым словам и подставляет готовые тексты.
// Бесплатно, работает на Vercel без внешних сервисов. Тексты правятся здесь.
const SITE = 'https://metrawen.com';

const RX = {
  decline: /(not interested|no thanks|unsubscribe|stop (emailing|writing|contacting)|remove me|do not contact|don'?t contact|не интересно|не интересует|не пишите|отпишите|удалите (мой|меня))/i,
  escalate: /(contract|invoice|legal|lawyer|gdpr|privacy|refund|complain|lawsuit|nda\b|договор|счет|счёт|юридич|юрист|жалоб|возврат|нда\b)/i,
  proposal: /(proposal|quote|quotation|estimate|\bkp\b|кп\b|коммерческ|смет|предложени)/i,
  price: /(price|pricing|cost|how much|expensive|cheaper|budget|сколько (стоит|будет)|цен[аыуе]|стоимост|дорого|бюджет)/i,
  solution: /(already (have|use|work)|we have (a|an)|current (provider|vendor|solution)|уже (есть|работаем|используем|пользуемся)|подрядчик)/i,
  later: /(not now|later|next (month|quarter|year)|maybe (later|next)|не сейчас|позже|в другой раз|потом)/i,
  interest: /(interested|sounds good|yes\b|let'?s talk|tell me more|хочу|интересно|давайте|расскажите|подробнее)/i
};

function firstName(lead) {
  const n = String(lead.name || '').trim().split(/\s+/)[0] || '';
  return n.slice(0, 40);
}
function lang(lead) {
  const txt = String(lead.message || '') + String(lead.name || '');
  if (/[а-яё]/i.test(txt)) return 'ru';
  return /\/ru(\/|$)/.test(String(lead.page || '')) ? 'ru' : 'en';
}

function classify(lead) {
  const msg = String(lead.message || '');
  const formBooking = /Бронирование|booking/i.test(String(lead.label || '')) || !!lead.slot;
  if (RX.decline.test(msg)) return { intent: 'decline', escalate: false, reason: 'Просит не писать или отказывается. Ответить коротко и больше не беспокоить.' };
  if (RX.escalate.test(msg)) return { intent: 'question', escalate: true, reason: 'В сообщении договор, счёт, юридический или спорный вопрос. Ответьте лично.' };
  if (RX.proposal.test(msg)) return { intent: 'wants_proposal', escalate: false, reason: 'Просит предложение или смету. Шаблон обещает КП в течение дня и уточняет каналы и объём.' };
  if (RX.price.test(msg)) return { intent: 'price_question', escalate: false, reason: 'Спрашивает про цену. Шаблон отправляет к калькулятору и предлагает короткий звонок, цену не называет.' };
  if (RX.solution.test(msg)) return { intent: 'has_solution_already', escalate: false, reason: 'У клиента уже есть решение или подрядчик. Шаблон уточняет, как оно справляется.' };
  if (RX.later.test(msg)) return { intent: 'not_now', escalate: false, reason: 'Пока не готов. Шаблон вежливо оставляет дверь открытой.' };
  if (formBooking) return { intent: 'booking', escalate: false, reason: 'Записался на сессию. Шаблон подтверждает и просит одной строкой описать главную рутину.' };
  if (!msg.trim()) return { intent: 'interested', escalate: false, reason: 'Заявка без текста. Шаблон предлагает звонок или короткое описание задачи.' };
  if (RX.interest.test(msg) || msg.length > 20) {
    // есть осмысленный текст, но он не попал в известные ветки
    if (RX.interest.test(msg)) return { intent: 'interested', escalate: false, reason: 'Проявил интерес. Шаблон предлагает звонок или письменные варианты.' };
    return { intent: 'question', escalate: true, reason: 'Свободный вопрос, который правила не распознали. Прочитайте сообщение и ответьте лично; шаблон нейтральный.' };
  }
  return { intent: 'question', escalate: true, reason: 'Сообщение короткое и неясное. Проверьте его вручную.' };
}

const T = {
  en: {
    hi: n => n ? 'Hi ' + n + ',' : 'Hi,',
    sign: 'Dmitry, METRAWEN',
    booking: {
      subject: 'Your METRAWEN session',
      full: slot => 'Thanks for booking a session' + (slot ? ' (' + slot + ')' : '') + '. I will confirm the time by email shortly.\n\nTo make the 15 minutes useful, could you tell me in a line or two which process takes most of your time today: answering inquiries, bookings, reports, something else?',
      short: slot => 'Thanks for booking' + (slot ? ' (' + slot + ')' : '') + '. I will confirm the time shortly. In a line: which process eats most of your time today?'
    },
    interested: {
      subject: 'Re: your request to METRAWEN',
      full: () => 'Thanks for reaching out. What you describe is close to what we build: AI employees for inquiries and bookings, plus bots and websites.\n\nThe quickest way is a free 15-minute call, no pitch, so I can look at your case: ' + SITE + '/#open-booking\nOr reply here with a few details and I will suggest options in writing. What is easier for you?',
      short: () => 'Thanks for reaching out. Easiest is a free 15-minute call: ' + SITE + '/#open-booking . Or reply with a few details and I will send options in writing.'
    },
    price_question: {
      subject: 'Re: pricing',
      full: () => 'Fair question. The price depends on what exactly you need, so I do not want to guess.\n\nFor sites, bots and dashboards, the calculator gives an instant estimate: ' + SITE + '/digital.html#calculator . For AI employees I prepare a written proposal after a short call.\n\nIt also helps to look at what the problem costs you today: missed inquiries or hours spent by hand. Shall we go through it in 15 minutes?',
      short: () => 'Price depends on the scope. The calculator gives an instant estimate: ' + SITE + '/digital.html#calculator . For AI employees I send a written proposal after a short call. Want a 15-minute call?'
    },
    has_solution_already: {
      subject: 'Re: your current setup',
      full: () => 'Good to know. How is it working for you, does it cover your inquiries and bookings well? I ask because people usually come to us with exactly that pain.\n\nIf it works, I will say honestly that I probably cannot offer anything better.',
      short: () => 'Good to know. How is your current setup handling inquiries and bookings? If it works well, I will tell you honestly there is no need to change.'
    },
    not_now: {
      subject: 'Re: timing',
      full: () => 'Understood, thanks for being direct. If things change, just write to me. I will keep your contact for now, is that okay?',
      short: () => 'Understood, thanks. If things change, just write. I will keep your contact, okay?'
    },
    wants_proposal: {
      subject: 'Re: your proposal request',
      full: () => 'Sure. Give me a day and I will prepare a proposal for your case with 2-3 options by budget.\n\nTo make it accurate: which channels do your inquiries come from today, and roughly how many per month?',
      short: () => 'Sure, I will send a proposal within a day, with 2-3 options. Which channels do your inquiries come from, and roughly how many a month?'
    },
    decline: {
      subject: 'Re: your reply',
      full: () => 'Understood, thanks for the reply. If the situation changes, you know where to find me. All the best.',
      short: () => 'Understood, thank you. All the best.'
    },
    question: {
      subject: 'Re: your message to METRAWEN',
      full: () => 'Thanks for your message. To answer precisely, could you tell me a bit more about your business and what you would like to automate?\n\nA short free call also works: ' + SITE + '/#open-booking',
      short: () => 'Thanks for your message. Could you tell me a bit more about your business and what you want to automate? Or book a short call: ' + SITE + '/#open-booking'
    }
  },
  ru: {
    hi: n => n ? 'Здравствуйте, ' + n + '.' : 'Здравствуйте.',
    sign: 'Дмитрий, METRAWEN',
    booking: {
      subject: 'Ваша сессия METRAWEN',
      full: slot => 'Спасибо за запись на сессию' + (slot ? ' (' + slot + ')' : '') + '. Время подтвержу по почте в ближайшее время.\n\nЧтобы 15 минут прошли с пользой, напишите, пожалуйста, в одной-двух строках, какой процесс сейчас отнимает больше всего времени: ответы на обращения, записи, отчёты или что-то ещё?',
      short: slot => 'Спасибо за запись' + (slot ? ' (' + slot + ')' : '') + '. Время скоро подтвержу. Одной строкой: какой процесс сейчас отнимает больше всего времени?'
    },
    interested: {
      subject: 'Re: ваша заявка в METRAWEN',
      full: () => 'Спасибо за обращение. То, что вы описываете, близко к тому, что мы делаем: AI-сотрудники для обращений и записей, боты и сайты.\n\nСамый быстрый вариант: бесплатный звонок на 15 минут без питча, чтобы я посмотрел ваш случай: ' + SITE + '/ru/#open-booking\nЛибо ответьте здесь парой деталей, и я предложу варианты письменно. Как удобнее?',
      short: () => 'Спасибо за обращение. Проще всего бесплатный звонок на 15 минут: ' + SITE + '/ru/#open-booking . Или ответьте парой деталей, и я пришлю варианты письменно.'
    },
    price_question: {
      subject: 'Re: стоимость',
      full: () => 'Вопрос закономерный. Цена зависит от того, что именно нужно, поэтому не хочу называть цифру наугад.\n\nПо сайтам, ботам и дашбордам калькулятор сразу даёт оценку: ' + SITE + '/ru/digital.html#calculator . По AI-сотрудникам я готовлю письменное предложение после короткого звонка.\n\nЕщё полезно посмотреть, во сколько вам сейчас обходится проблема: потерянные заявки или часы ручной работы. Разберём за 15 минут?',
      short: () => 'Цена зависит от задачи. Калькулятор даёт оценку сразу: ' + SITE + '/ru/digital.html#calculator . По AI-сотрудникам присылаю письменное предложение после короткого звонка. Созвонимся на 15 минут?'
    },
    has_solution_already: {
      subject: 'Re: ваше текущее решение',
      full: () => 'Хорошо, что уже есть. Как оно справляется, хорошо ли закрывает обращения и записи? Спрашиваю, потому что к нам обычно приходят именно с этой болью.\n\nЕсли всё работает, честно скажу, что вряд ли смогу предложить что-то лучше.',
      short: () => 'Понял. Как текущее решение справляется с обращениями и записями? Если всё хорошо, честно скажу, что менять ничего не нужно.'
    },
    not_now: {
      subject: 'Re: сроки',
      full: () => 'Понял, спасибо за честность. Если что-то изменится, просто напишите. Пока оставлю ваш контакт у себя, хорошо?',
      short: () => 'Понял, спасибо. Если что-то изменится, напишите. Оставлю контакт у себя, ок?'
    },
    wants_proposal: {
      subject: 'Re: ваш запрос на предложение',
      full: () => 'Конечно. Дайте мне один день, соберу предложение под ваш случай в 2-3 вариантах по бюджету.\n\nЧтобы оно получилось точным: из каких каналов сейчас приходят обращения и примерно сколько их в месяц?',
      short: () => 'Сделаю. Пришлю предложение в течение дня, в 2-3 вариантах. Из каких каналов приходят обращения и сколько их примерно в месяц?'
    },
    decline: {
      subject: 'Re: ваш ответ',
      full: () => 'Понял, спасибо за ответ. Если ситуация изменится, вы знаете, где меня найти. Всего доброго.',
      short: () => 'Понял, спасибо. Всего доброго.'
    },
    question: {
      subject: 'Re: ваше сообщение в METRAWEN',
      full: () => 'Спасибо за сообщение. Чтобы ответить точнее, расскажите, пожалуйста, немного о вашем бизнесе и что вы хотели бы автоматизировать?\n\nМожно и коротким бесплатным звонком: ' + SITE + '/ru/#open-booking',
      short: () => 'Спасибо за сообщение. Расскажите немного о бизнесе и что хотите автоматизировать? Или запишитесь на короткий звонок: ' + SITE + '/ru/#open-booking'
    }
  }
};

function draftFromRules(lead, mode) {
  const c = classify(lead);
  const l = lang(lead);
  const t = T[l];
  const tpl = t[c.intent] || t.question;
  const variant = mode === 'shorter' ? 'short' : 'full';
  const bodyCore = tpl[variant](lead.slot);
  const body = t.hi(firstName(lead)) + '\n\n' + bodyCore + '\n\n' + t.sign;
  return { intent: c.intent, escalate: c.escalate, reason: c.reason, subject: tpl.subject, body, mode: 'rules' };
}

module.exports = { draftFromRules, classify };
