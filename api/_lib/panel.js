// «Кабинет руководителя» для бота Control: одним сообщением цифры сайта, заявок, холодной рассылки и денег.
// Данные: просмотры сайта (api/hit.js, Redis), заявки («Входящие клиенты» Notion), Hunter CRM, реклама, очередь и счётчики ящиков.
// Кэш 3 минуты, чтобы кнопка «Обновить» не перегружала Notion; «Обновить» обходит кэш.
const H = require('./hunter');
const D = require('./digest');
const { loadJson, saveJson, enabled } = require('./store');
const { esc } = require('./alert');

const p = H.prop;
const SENT = ['Отправлено', 'Follow-up запланирован', 'Ответ получен', 'Встреча назначена', 'Без ответа (закрыт)', 'КП принято', 'Сделка/Оплачено'];
const REPL = ['Ответ получен', 'Встреча назначена', 'КП принято', 'Сделка/Оплачено'];
const clean = function (v) { return String(v || '').replace(/[^\x20-\x7E]/g, '').trim(); };

function th(n) { return new Date(Date.now() + 7 * 3600e3 + (n || 0) * 86400e3); }
function day(n) { return th(n).toISOString().slice(0, 10); }
function num(r, k) { const v = p(r, k); return typeof v === 'number' ? v : 0; }
function money(n) { return '$' + Math.round(n || 0).toLocaleString('en-US').replace(/,/g, ' '); }
function pct(a, b) { return b ? Math.round(a * 100 / b) + '%' : '0%'; }
function createdDay(r) { return r.created_time ? new Date(Date.parse(r.created_time) + 7 * 3600e3).toISOString().slice(0, 10) : ''; }

async function counter(key) { const v = await loadJson(key); return typeof v === 'number' ? v : (v ? Number(v) : 0); }
async function rawCount(key) {
  // incr() кладёт обычное число строкой: loadJson его разбирает как число
  try { return Number(await loadJson(key)) || 0; } catch (e) { return 0; }
}
async function site() {
  const out = { vt: 0, vy: 0, v7: 0, ut: 0, uy: 0, u7: 0, top: [], ref: [] };
  if (!enabled()) return out;
  const d0 = day(0), d1 = day(-1);
  out.vt = await rawCount('hit:v:' + d0); out.vy = await rawCount('hit:v:' + d1);
  out.ut = await rawCount('hit:u:' + d0); out.uy = await rawCount('hit:u:' + d1);
  for (let i = 0; i < 7; i++) { out.v7 += await rawCount('hit:v:' + day(-i)); out.u7 += await rawCount('hit:u:' + day(-i)); }
  const pp = (await loadJson('hit:pp:' + d0)) || {};
  out.top = Object.keys(pp).sort(function (a, b) { return pp[b] - pp[a]; }).slice(0, 4).map(function (k) { return k + ' ' + pp[k]; });
  const rf = (await loadJson('hit:rf:' + d0)) || {};
  out.ref = Object.keys(rf).sort(function (a, b) { return rf[b] - rf[a]; }).slice(0, 3).map(function (k) { return k + ' ' + rf[k]; });
  return out;
}

async function build(force) {
  if (!force && enabled()) { const c = await loadJson('panel:cache'); if (c && c.t) return c.t; }
  const d = await D.load();
  const hr = d.hunter, ib = d.inbound;
  const today = day(0);
  const stage = function (r) { return p(r, 'Этап'); };
  const sentD = function (r) { return String(p(r, 'Отправлено') || '').slice(0, 10); };
  const replD = function (r) { return String(p(r, 'Ответил') || '').slice(0, 10); };
  const isSent = function (r) { return !!sentD(r) || SENT.indexOf(stage(r)) >= 0; };
  const isRepl = function (r) { return !!p(r, 'Ответил') || REPL.indexOf(stage(r)) >= 0; };
  const sentRows = hr.filter(isSent), replRows = hr.filter(isRepl);
  const sentToday = hr.filter(function (r) { return sentD(r) === today; }).length;
  const sent7 = hr.filter(function (r) { const s = sentD(r); return s && s >= day(-6); }).length;
  const replToday = hr.filter(function (r) { return replD(r) === today; }).length;
  const withEmail = hr.filter(function (r) { return !!p(r, 'Публичный email'); }).length;
  const sc = { Hot: 0, Warm: 0, Cold: 0 };
  hr.forEach(function (r) { const s = p(r, 'Скоринг'); if (s in sc) sc[s]++; });
  const new7 = hr.filter(function (r) { return r.created_time && Date.parse(r.created_time) >= Date.now() - 7 * 86400e3; }).length;
  const newToday = hr.filter(function (r) { return createdDay(r) === today; }).length;
  const ready = hr.filter(function (r) { return stage(r) === 'Готово к отправке'; }).length;
  const drafted = hr.filter(function (r) { return stage(r) === 'Черновик готов'; }).length;
  const meetings = hr.filter(function (r) { return stage(r) === 'Встреча назначена'; }).length;
  const bounced = hr.filter(function (r) { return /EMAIL НЕВАЛИДНЫЙ/.test(p(r, 'Заметки') || ''); }).length;
  const deals = hr.filter(function (r) { return stage(r) === 'Сделка/Оплачено' || (stage(r) === 'КП принято' && num(r, 'Сумма сделки') > 0); });
  const dealSum = hr.reduce(function (a, r) { return a + Math.max(0, num(r, 'Сумма сделки')); }, 0);
  const ads = Array.isArray(d.ads) ? d.ads : [];
  const spend = ads.reduce(function (a, r) { return a + num(r, 'Расход, $'); }, 0);
  const rev = ads.reduce(function (a, r) { return a + num(r, 'Доход, $'); }, 0) + dealSum;

  const ibToday = ib.filter(function (r) { return createdDay(r) === today; });
  const chanToday = {};
  ibToday.forEach(function (r) { const c = p(r, 'Канал') || 'другое'; chanToday[c] = (chanToday[c] || 0) + 1; });
  const fromSiteToday = ibToday.filter(function (r) { return /Сайт|Чат/.test(p(r, 'Канал')); }).length;
  const waiting = ib.filter(function (r) { return p(r, 'Этап') === 'Ждёт ответа'; }).length;
  const booked = ib.filter(function (r) { return p(r, 'Этап') === 'Встреча назначена'; }).length;

  const s = await site();
  const pending = enabled() ? ((await loadJson('sm:pending')) || []).length : 0;
  const queue = enabled() ? ((await loadJson('opa:queue')) || []).length : 0;

  const now = th(0).toISOString().slice(0, 16).replace('T', ' ');
  const L = [];
  L.push('<b>📈 Кабинет METRAWEN</b> · ' + now + ' (Таиланд)');
  L.push('');
  L.push('<b>🌐 Сайт сегодня</b>');
  L.push('Просмотры ' + s.vt + ' (вчера ' + s.vy + '), посетители ' + s.ut + ' (вчера ' + s.uy + ')');
  L.push('За 7 дней: просмотры ' + s.v7 + ', посетители ' + s.u7);
  L.push('Заявок с сайта сегодня: ' + fromSiteToday + (s.ut ? ' (конверсия ' + pct(fromSiteToday, s.ut) + ')' : ''));
  if (s.top.length) L.push('Страницы: ' + esc(s.top.join(', ')));
  if (s.ref.length) L.push('Откуда: ' + esc(s.ref.join(', ')));
  L.push('');
  L.push('<b>🎯 Заявки</b>');
  L.push('Сегодня ' + ibToday.length + ' · всего ' + ib.length + ' · ждут ответа ' + waiting + ' · встреч ' + booked);
  if (Object.keys(chanToday).length) L.push('Сегодня по каналам: ' + esc(Object.keys(chanToday).map(function (k) { return k + ' ' + chanToday[k]; }).join(', ')));
  L.push('✍️ Ответов ждут вашего «Подтвердить»: ' + pending);
  L.push('');
  L.push('<b>📬 Холодная рассылка (Hunter)</b>');
  L.push('Лидов в базе ' + hr.length + ' (новых сегодня ' + newToday + ', за 7 дней ' + new7 + ')');
  L.push('С email ' + withEmail + ' · Hot ' + sc.Hot + ' / Warm ' + sc.Warm + ' / Cold ' + sc.Cold);
  L.push('Отправлено: сегодня ' + sentToday + ', за 7 дней ' + sent7 + ', всего ' + sentRows.length);
  L.push('Ответили: сегодня ' + replToday + ', всего ' + replRows.length + ' (' + pct(replRows.length, sentRows.length) + ')');
  L.push('В очереди сейчас ' + queue + ' · готово к отправке ' + ready + ' · с черновиком ' + drafted + ' · битых адресов ' + bounced);
  L.push('');
  L.push('<b>💰 Деньги</b>');
  L.push('Продаж ' + deals.length + ' · сумма ' + money(dealSum) + ' · расход на рекламу ' + money(spend) + ' · итог ' + money(rev - spend));
  const t = L.join('\n');
  if (enabled()) { try { await saveJson('panel:cache', { t: t }, 180); } catch (e) { /* ничего */ } }
  return t;
}

const KEYBOARD = { inline_keyboard: [
  [{ text: '🔄 Обновить', callback_data: 'mn:pr' }, { text: '📬 Статус рассылок', callback_data: 'mn:st' }],
  [{ text: '🏢 Агентство', callback_data: 'mn:ag' }, { text: '🛍 Shop', callback_data: 'mn:sh' }],
  [{ text: '💬 Карточки DM', callback_data: 'mn:dm' }, { text: '📝 Редактор КП', callback_data: 'mn:kp' }],
  [{ text: '📊 Недельный отчёт', callback_data: 'mn:rp' }, { text: '← Меню', callback_data: 'mn:main' }]
] };

module.exports = { build, KEYBOARD };
