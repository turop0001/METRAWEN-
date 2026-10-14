// Автоматика Sell Manager поверх существующих черновиков:
//  1) автоотправка типовых ответов с задержкой (по умолчанию включена, выключить: SM_AUTO=0). Сложное, горячее и спорное остаётся на ваше «Подтвердить».
//     Перед отправкой у вас есть окно: «Отмена» под черновиком останавливает отправку.
//  2) касания клиенту, который замолчал после нашего ответа: через 1, 3 и 7 дней (выключить: SM_NUDGE=0).
//     Любое новое сообщение клиента гасит цепочку. Касания уходят только днём по времени клиента (05:00–16:00 UTC).
// Запускается из ops.tick (раз в ~8 минут).
const { saveJson, loadJson, enabled: storeEnabled } = require('./store');
const { tg, tgc } = require('./tg');
const llm = require('./llm');
const humanize = require('./humanize');
const { report, esc } = require('./alert');

const chat = function () { return process.env.TELEGRAM_CHAT_ID; };
const AUTO_INTENTS = ['interested', 'price_question', 'question', 'not_now', 'has_solution_already', 'booking'];
const NUDGE_INTENTS = ['interested', 'price_question', 'question', 'has_solution_already', 'booking'];
const DAYS = [1, 3, 7];
const TTL = 60 * 60 * 24 * 14;

function convKey(lead) {
  if (lead.chatSid) return 'chat:' + lead.chatSid;
  if (lead.emailAddr) return 'email:' + lead.emailAddr;
  if (lead.waId) return 'wa:' + lead.waId;
  if (lead.tgChatId) return 'tg:' + lead.tgChatId;
  if (lead.lineUserId) return 'line:' + lead.lineUserId;
  return 'site:' + String(lead.contact || lead.name || '').toLowerCase().slice(0, 120);
}
function reachable(lead) {
  if (lead.noSend) return false;
  if (lead.channel === 'telegram') return !!lead.tgChatId;
  if (lead.channel === 'whatsapp') return !!lead.waId;
  if (lead.channel === 'line') return !!lead.lineUserId;
  if (lead.channel === 'email') return !!lead.emailAddr;
  return false; // чат сайта отвечает сам (handleChatLead), формы без контакта отвечаем вручную
}

// ---------- 1. автоотправка ----------
function eligible(lead, d) {
  if (process.env.SM_AUTO === '0' || !storeEnabled() || !d || d.mode !== 'ai') return false;
  if (d.escalate || d.guard || !String(d.body || '').trim()) return false;
  if (d.stage === 'hot' || AUTO_INTENTS.indexOf(d.intent) < 0) return false;
  return reachable(lead);
}
// задержка в минутах: живой человек не отвечает за секунду; на холодное письмо отвечает дольше
function delayMin(lead) { return lead.channel === 'email' ? 12 + Math.floor(Math.random() * 18) : 4 + Math.floor(Math.random() * 5); }

async function schedule(id, msgId, minutes) {
  const list = (await loadJson('sm:auto')) || [];
  list.push({ id: id, m: msgId, due: Date.now() + minutes * 60e3 });
  await saveJson('sm:auto', list.slice(-60), TTL);
}

async function cancelAuto(id) {
  try {
    const list = (await loadJson('sm:auto')) || [];
    const next = list.filter(function (x) { return x.id !== id; });
    if (next.length !== list.length) await saveJson('sm:auto', next, TTL);
  } catch (e) { /* ничего */ }
}

async function runAuto() {
  const list = (await loadJson('sm:auto')) || [];
  if (!list.length) return 0;
  const left = [];
  let sent = 0;
  for (const x of list) {
    if (x.due > Date.now()) { left.push(x); continue; }
    try {
      const rec = await loadJson('lead:' + x.id);
      if (!rec || rec.canceled || rec.approved) continue; // отменили, подтвердили сами или срок хранения истёк
      await require('./sellmanager').handleAction('ok', x.id, { message_id: x.m });
      sent++;
    } catch (e) { await report('Автоотправка ответа', e, x.id); }
  }
  await saveJson('sm:auto', left, TTL);
  return sent;
}

// ---------- 2. касания молчащему клиенту ----------
async function armNudge(lead, d) {
  try {
    if (process.env.SM_NUDGE === '0' || !storeEnabled() || !reachable(lead) || !d) return;
    if (NUDGE_INTENTS.indexOf(d.intent) < 0 || d.stage === 'lost') return;
    const k = convKey(lead);
    const list = ((await loadJson('sm:nudge')) || []).filter(function (x) { return x.k !== k; });
    list.push({ k: k, lead: lead, n: 0, due: Date.now() + DAYS[0] * 86400e3, intent: d.intent });
    await saveJson('sm:nudge', list.slice(-80), 60 * 60 * 24 * 30);
  } catch (e) { console.error('autoflow: armNudge', e); }
}
async function disarm(lead) {
  try {
    if (!storeEnabled()) return;
    const k = convKey(lead);
    const list = (await loadJson('sm:nudge')) || [];
    const next = list.filter(function (x) { return x.k !== k; });
    if (next.length !== list.length) await saveJson('sm:nudge', next, 60 * 60 * 24 * 30);
  } catch (e) { /* ничего */ }
}

const STEP_HINT = [
  'Day 1. A light check-in. Pick up the exact thing they asked about, add ONE small useful detail or offer to send a short sample or written estimate, and end with one easy question. No "just checking in", no "following up".',
  'Day 3. Give them something concrete they can use without replying: a relevant demo link from your list, or one short practical observation about their situation. Soft, one sentence of invitation at most.',
  'Day 7. Close the loop kindly. Say you will not keep writing, that the offer stays open, and make it easy to answer with one word. No guilt, no pressure, no deadline.'
];

function nudgeSystem(lang) {
  return 'You are a manager at METRAWEN writing a short follow-up message to a person who stopped replying. Write like a real person in a messenger: 1-3 short sentences, natural, warm, specific to what they wrote before. ' +
    'Language: ' + (lang === 'ru' ? 'Russian, formal "вы" unless they wrote informally' : 'English') + '. No greeting formulas, no signature, no emojis, no bullet lists, no dashes as connectors. Never mention that you are following up automatically, never invent facts, prices, clients or results. ' +
    'If you mention a price use only a "from" price the client already saw in the conversation. At most one link, only a demo or booking link that appeared earlier in the conversation. ' +
    humanize.promptList() + ' Output ONE JSON {"body":"..."} and nothing else.';
}
function langOf(lead) {
  const t = String(lead.message || lead.history || '');
  return /[а-яё]/i.test(t) ? 'ru' : 'en';
}
function parseBody(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  try { return String(JSON.parse(text.slice(a, b + 1)).body || '').trim(); }
  catch (e) { const m = text.match(/"body"\s*:\s*"([\s\S]*)"/); return m ? m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim() : ''; }
}
function clean(t) { return String(t || '').replace(/[—–]/g, ',').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim(); }

async function write(x) {
  const hist = (await loadJson('hist:' + x.k)) || [];
  const history = hist.slice(-10).map(function (m) { return (m.r === 'c' ? 'Client: ' : 'You: ') + m.t; }).join('\n');
  const lang = langOf({ message: hist.filter(function (m) { return m.r === 'c'; }).map(function (m) { return m.t; }).join(' '), history: history });
  const sys = nudgeSystem(lang);
  const ask = function (extra) {
    return 'Conversation so far:\n<conversation>\n' + history + '\n</conversation>\n\nThis follow-up: ' + STEP_HINT[x.n] + (extra || '') + '\nSite: https://metrawen.com';
  };
  let body = clean(parseBody(await llm.complete(sys, ask(), 600)));
  let bad = humanize.find(body);
  if (bad.length || !body) {
    body = clean(parseBody(await llm.complete(sys, ask('\nYour previous try sounded like a template (' + bad.join(', ') + '). Write it again, plainer, as you would say it out loud.'), 600)));
    bad = humanize.find(body);
  }
  if (!body || bad.length) return '';
  return body;
}

async function deliver(lead, body) {
  if (lead.channel === 'email') {
    const subj = 'Re: ' + String(lead.emailSubject || 'METRAWEN').replace(/^(re:\s*)+/i, '');
    await require('./emailbridge').send(lead, subj, body);
  } else if (lead.channel === 'telegram') {
    await (lead.tgVia === 'client' ? tgc : tg)('sendMessage', { chat_id: lead.tgChatId, text: body.slice(0, 3500) });
  } else if (lead.channel === 'whatsapp') {
    await require('./whatsapp').send(lead.waId, body);
  } else if (lead.channel === 'line') {
    await require('./line').push(lead.lineUserId, body);
  } else throw new Error('канал без автоотправки');
}

function dayWindow() { const h = new Date().getUTCHours(); return h >= 5 && h < 16; }

async function runNudges() {
  if (process.env.SM_NUDGE === '0' || !llm.enabled() || !dayWindow()) return 0;
  const list = (await loadJson('sm:nudge')) || [];
  if (!list.length) return 0;
  const left = [];
  let sent = 0;
  for (const x of list) {
    if (x.due > Date.now() || sent >= 3) { left.push(x); continue; } // не больше 3 касаний за прогон
    try {
      const body = await write(x);
      if (!body) { await tg('sendMessage', { chat_id: chat(), text: '⚠️ Напоминание для ' + esc(x.lead.contact || x.k) + ' не написано (текст не прошёл проверку на «живость»). Напишите клиенту сами.' }); continue; }
      await deliver(x.lead, body);
      sent++;
      try { await saveHist(x.k, body); await require('./crm').logReply(x.lead, body, true); } catch (e) { /* ничего */ }
      await tg('sendMessage', { chat_id: chat(), parse_mode: 'HTML', text: '📨 <b>Касание ' + (x.n + 1) + ' из ' + DAYS.length + '</b> молчащему клиенту: ' + esc(x.lead.contact || x.lead.name || x.k) + '\n<pre>' + esc(body) + '</pre>' + (x.n + 1 < DAYS.length ? 'Следующее через ' + (DAYS[x.n + 1] - DAYS[x.n]) + ' дн. Если клиент ответит, цепочка остановится сама.' : 'Это последнее касание, дальше цепочка закрыта.') });
      if (x.n + 1 < DAYS.length) { x.n += 1; x.due = Date.now() + (DAYS[x.n] - DAYS[x.n - 1]) * 86400e3; left.push(x); }
    } catch (e) {
      await report('Касание молчащему клиенту', e, x.k);
      x.due = Date.now() + 86400e3; left.push(x); // повтор завтра, чтобы не долбить ошибкой
    }
  }
  await saveJson('sm:nudge', left, 60 * 60 * 24 * 30);
  return sent;
}
async function saveHist(k, text) {
  const key = 'hist:' + k;
  const h = (await loadJson(key)) || [];
  h.push({ r: 't', t: String(text).slice(0, 1500) });
  await saveJson(key, h.slice(-30), 60 * 60 * 24 * 90);
}

async function run() {
  const out = {};
  try { out.auto = await runAuto(); } catch (e) { await report('Автоматика ответов', e); }
  try { out.nudge = await runNudges(); } catch (e) { await report('Касания клиентам', e); }
  return out;
}

module.exports = { eligible, delayMin, schedule, cancelAuto, armNudge, disarm, run, convKey };
