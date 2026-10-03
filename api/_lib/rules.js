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
    sign: '',
    intro: "I'm Nicole, a manager at METRAWEN.",
    booking: {
      subject: 'Your METRAWEN session',
      full: slot => 'Thanks for booking a session' + (slot ? ' (' + slot + ')' : '') + '. We will confirm the time by email shortly.\n\nTo make the 15 minutes useful, could you tell us in a line or two which process takes most of your time today: answering inquiries, bookings, reports, something else?',
      short: slot => 'Thanks for booking' + (slot ? ' (' + slot + ')' : '') + '. We will confirm the time shortly. In a line: which process eats most of your time today?'
    },
    interested: {
      subject: 'Re: your request to METRAWEN',
      full: () => 'Thanks for reaching out, happy to help. So I can suggest something that really fits: what kind of business do you have, and what would you most like to take off your plate right now?',
      short: () => 'Happy to help. What kind of business is it, and what would you most like to take off your plate?'
    },
    price_question: {
      subject: 'Re: pricing',
      full: () => 'Good question. The price really depends on what the site or bot needs to do, and I do not want to throw out a random number. Tell me a bit about your business and what you expect it to handle, and I will put together an exact estimate for your case.',
      short: () => 'It depends on what it needs to do. What is your business and what should it handle? Then I will send an exact estimate.'
    },
    has_solution_already: {
      subject: 'Re: your current setup',
      full: () => 'Good to know. How is it working for you, does it cover your inquiries and bookings well? We ask because people usually come to us with exactly that pain.\n\nIf it works, we will say honestly that we probably cannot offer anything better.',
      short: () => 'Good to know. How is your current setup handling inquiries and bookings? If it works well, we will tell you honestly there is no need to change.'
    },
    not_now: {
      subject: 'Re: timing',
      full: () => 'Understood, thanks for being direct. If things change, just write to us. We will keep your contact for now, is that okay?',
      short: () => 'Understood, thanks. If things change, just write. We will keep your contact, okay?'
    },
    wants_proposal: {
      subject: 'Re: your proposal request',
      full: () => 'Sure. Give us a day and we will prepare a proposal for your case with 2-3 options by budget.\n\nTo make it accurate: which channels do your inquiries come from today, and roughly how many per month?',
      short: () => 'Sure, we will send a proposal within a day, with 2-3 options. Which channels do your inquiries come from, and roughly how many a month?'
    },
    decline: {
      subject: 'Re: your reply',
      full: () => 'Understood, thanks for the reply. If the situation changes, you know where to find us. All the best.',
      short: () => 'Understood, thank you. All the best.'
    },
    question: {
      subject: 'Re: your message to METRAWEN',
      full: () => 'Thanks for your message. To answer properly, tell me a little about your business and what you would like to improve or automate?',
      short: () => 'Tell me a little about your business and what you want to improve?'
    }
  },
  ru: {
    hi: n => n ? 'Здравствуйте, ' + n + '.' : 'Здравствуйте.',
    sign: '',
    intro: 'Меня зовут Елена, я менеджер METRAWEN.',
    booking: {
      subject: 'Ваша сессия METRAWEN',
      full: slot => 'Спасибо за запись на сессию' + (slot ? ' (' + slot + ')' : '') + '. Время подтвердим по почте в ближайшее время.\n\nЧтобы 15 минут прошли с пользой, напишите, пожалуйста, в одной-двух строках, какой процесс сейчас отнимает больше всего времени: ответы на обращения, записи, отчёты или что-то ещё?',
      short: slot => 'Спасибо за запись' + (slot ? ' (' + slot + ')' : '') + '. Время скоро подтвердим. Одной строкой: какой процесс сейчас отнимает больше всего времени?'
    },
    interested: {
      subject: 'Re: ваша заявка в METRAWEN',
      full: () => 'Спасибо, что написали, с удовольствием помогу. Чтобы предложить то, что действительно подойдёт: какой у вас бизнес и что сейчас больше всего хочется снять с себя?',
      short: () => 'С удовольствием помогу. Какой у вас бизнес и что больше всего хочется снять с себя?'
    },
    price_question: {
      subject: 'Re: стоимость',
      full: () => 'Хороший вопрос. Цена зависит от того, что именно должен делать сайт или бот, и называть цифру наугад не хочу. Расскажите немного о вашем бизнесе и что вы от него ждёте, и я посчитаю точную стоимость под ваш случай.',
      short: () => 'Зависит от задач. Какой у вас бизнес и что он должен делать? Тогда посчитаю точно.'
    },
    has_solution_already: {
      subject: 'Re: ваше текущее решение',
      full: () => 'Хорошо, что уже есть. Как оно справляется, хорошо ли закрывает обращения и записи? Спрашиваем, потому что к нам обычно приходят именно с этой болью.\n\nЕсли всё работает, честно скажем, что вряд ли сможем предложить что-то лучше.',
      short: () => 'Поняли. Как текущее решение справляется с обращениями и записями? Если всё хорошо, честно скажем, что менять ничего не нужно.'
    },
    not_now: {
      subject: 'Re: сроки',
      full: () => 'Поняли, спасибо за честность. Если что-то изменится, просто напишите. Пока оставим ваш контакт у нас, хорошо?',
      short: () => 'Поняли, спасибо. Если что-то изменится, напишите. Оставим контакт у нас, ок?'
    },
    wants_proposal: {
      subject: 'Re: ваш запрос на предложение',
      full: () => 'Конечно. Дайте нам один день, соберём предложение под ваш случай в 2-3 вариантах по бюджету.\n\nЧтобы оно получилось точным: из каких каналов сейчас приходят обращения и примерно сколько их в месяц?',
      short: () => 'Сделаем. Пришлём предложение в течение дня, в 2-3 вариантах. Из каких каналов приходят обращения и сколько их примерно в месяц?'
    },
    decline: {
      subject: 'Re: ваш ответ',
      full: () => 'Поняли, спасибо за ответ. Если ситуация изменится, вы знаете, где нас найти. Всего доброго.',
      short: () => 'Поняли, спасибо. Всего доброго.'
    },
    question: {
      subject: 'Re: ваше сообщение в METRAWEN',
      full: () => 'Спасибо за сообщение. Чтобы ответить по делу, расскажите немного о вашем бизнесе и что хотелось бы улучшить или автоматизировать?',
      short: () => 'Расскажите немного о бизнесе и что хотелось бы улучшить?'
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
  const body = t.hi(firstName(lead)) + (lead.firstContact ? ' ' + t.intro : '') + '\n\n' + bodyCore;
  return { intent: c.intent, escalate: c.escalate, reason: c.reason, subject: tpl.subject, body, mode: 'rules' };
}

module.exports = { draftFromRules, classify };
