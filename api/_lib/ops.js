// Служебные задачи Sell Manager:
//  - напоминание, если черновик не подтверждён 2 часа (и ещё раз через 24 часа);
//  - тревога, если почтовый мост не выходит на связь больше 6 часов;
//  - фоновая чистка черновиков Хантера магазина;
//  - еженедельный отчёт: обращения по каналам, рассылка, ответы, встречи, сделки, продажи и выручка по товарам.
// tick() вызывают мосты Apps Script раз в 10 минут (и попутно webhook Telegram), weekly() — Vercel Cron по понедельникам.
const { loadJson, saveJson, once, enabled: storeEnabled } = require('./store');
const { tg } = require('./tg');
const { report, week, esc } = require('./alert');

const chat = function () { return process.env.TELEGRAM_CHAT_ID; };

// ---------- неподтверждённые черновики ----------
async function track(id, messageId, label) {
  if (!storeEnabled() || !messageId) return;
  const list = (await loadJson('sm:pending')) || [];
  list.push({ id: id, m: messageId, l: String(label || '').slice(0, 80), ts: Date.now(), r: 0 });
  await saveJson('sm:pending', list.slice(-60), 60 * 60 * 24 * 7);
}

async function untrack(id) {
  if (!storeEnabled()) return;
  const list = (await loadJson('sm:pending')) || [];
  const next = list.filter(function (x) { return x.id !== id; });
  if (next.length !== list.length) await saveJson('sm:pending', next, 60 * 60 * 24 * 7);
}

async function remind() {
  const list = (await loadJson('sm:pending')) || [];
  if (!list.length) return;
  const now = Date.now();
  let changed = false;
  for (const x of list) {
    const age = now - x.ts;
    const need = (x.r === 0 && age > 2 * 3600e3) || (x.r === 1 && age > 24 * 3600e3);
    if (!need) continue;
    x.r += 1; changed = true;
    try {
      await tg('sendMessage', { chat_id: chat(), reply_to_message_id: x.m, allow_sending_without_reply: true,
        text: '⏰ Черновик ждёт подтверждения ' + (x.r === 1 ? 'больше 2 часов' : 'больше суток') + (x.l ? ': ' + x.l : '') + '. Клиент ждёт ответа: «Подтвердить», «Переписать» или ответьте сами.' });
    } catch (e) { console.error('ops: напоминание', e); }
  }
  // старше 3 суток не напоминаем
  const keep = list.filter(function (x) { return now - x.ts < 3 * 86400e3 && x.r < 2; });
  if (changed || keep.length !== list.length) await saveJson('sm:pending', keep, 60 * 60 * 24 * 7);
}

// ---------- мосты ----------
async function seen(scope) {
  if (!storeEnabled()) return;
  try { await saveJson('bridge:seen:' + scope, Date.now(), 60 * 60 * 24 * 30); } catch (e) { /* ничего */ }
}

async function watchBridges() {
  for (const scope of ['main', 'shop', 'agency']) {
    const last = await loadJson('bridge:seen:' + scope);
    if (!last) continue; // мост ещё ни разу не выходил на связь (не подключён)
    if (Date.now() - last < 6 * 3600e3) continue;
    if (!(await once('bridge:alert:' + scope, 60 * 60 * 12))) continue;
    const name = scope === 'shop' ? 'METRAWEN Shop (metrawen.shop@gmail.com)' : scope === 'agency' ? 'холодной почты агентства' : 'основной почты (metrawen.team@gmail.com)';
    await report('Почтовый мост ' + name + ' молчит', 'нет связи ' + Math.round((Date.now() - last) / 3600e3) + ' ч', 'Откройте script.google.com в этом ящике: проверьте триггеры (setup()) и журнал выполнения. Пока мост молчит, письма клиентов не доходят до Telegram.');
  }
}

// light: без фоновой чистки (для webhook Telegram, чтобы не задерживать ответ).
async function tick(light) {
  if (!storeEnabled()) return { ok: false };
  if (light) {
    if (!(await once('ops:tick:light', 8 * 60))) return { ok: true, skipped: true };
    try { await remind(); await watchBridges(); } catch (e) { await report('Напоминания', e); }
    return { ok: true, light: true };
  }
  if (!(await once('ops:tick', 8 * 60))) return { ok: true, skipped: true };
  const out = { ok: true };
  try { await remind(); } catch (e) { await report('Напоминания', e); }
  try { await watchBridges(); } catch (e) { await report('Контроль мостов', e); }
  try {
    const msg = await require('./cleanup').step();
    if (msg) await tg('sendMessage', { chat_id: chat(), text: msg });
  } catch (e) { await report('Чистка черновиков', e); }
  return out;
}

// ---------- недельный отчёт ----------
async function queryAll(call, db, filter, max) {
  const rows = [];
  let cursor;
  for (let i = 0; i < (max || 6); i++) {
    const body = { page_size: 100, start_cursor: cursor };
    if (filter) body.filter = filter;
    const j = await call('POST', '/databases/' + db + '/query', body);
    (j.results || []).forEach(function (r) { rows.push(r); });
    if (!j.has_more) break;
    cursor = j.next_cursor;
  }
  return rows;
}

function count(rows, fn) {
  const m = {};
  rows.forEach(function (r) { const k = fn(r); if (k) m[k] = (m[k] || 0) + 1; });
  return m;
}
function top(m, n) {
  return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).slice(0, n || 8).map(function (k) { return esc(k) + ' ' + m[k]; }).join(', ') || '—';
}
function inLastDays(dateStr, days) {
  if (!dateStr) return false;
  return new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00Z' : '')).getTime() >= Date.now() - days * 86400e3;
}

async function stats(w) {
  const names = ['in:email', 'in:email_shop', 'in:site', 'in:chat', 'in:telegram', 'in:whatsapp', 'in:line', 'confirmed', 'sent:shop', 'sent:agency', 'sent:agency_dm', 'sent:shop_post', 'sales', 'errors'];
  const out = {};
  for (const n of names) out[n] = Number(await loadJson('stat:' + w + ':' + n)) || 0;
  return out;
}

async function weekly(force) {
  if (!force && !(await once('ops:weekly:' + week(), 60 * 60 * 24 * 6))) return { ok: true, skipped: true };
  const prop = require('./hunter').prop;
  const lines = ['📊 <b>Недельный отчёт Sell Manager</b> · неделя ' + week(Date.now() - 86400e3)];
  // 1. Обращения и работа бота (счётчики прошлой недели — отчёт уходит в понедельник)
  try {
    const s = await stats(week(Date.now() - 3 * 86400e3));
    const inbound = s['in:email'] + s['in:email_shop'] + s['in:site'] + s['in:chat'] + s['in:telegram'] + s['in:whatsapp'] + s['in:line'];
    lines.push('', '<b>Входящие обращения:</b> ' + inbound + ' (почта ' + s['in:email'] + ', почта магазина ' + s['in:email_shop'] + ', форма ' + s['in:site'] + ', чат ' + s['in:chat'] + ', Telegram ' + s['in:telegram'] + ', WhatsApp ' + s['in:whatsapp'] + ', LINE ' + s['in:line'] + ')');
    lines.push('<b>Подтверждено ответов:</b> ' + s.confirmed + ' · <b>ошибок:</b> ' + s.errors);
    lines.push('<b>Холодные касания:</b> письма магазина ' + s['sent:shop'] + ', посты/каталоги магазина ' + s['sent:shop_post'] + ', письма агентства ' + s['sent:agency'] + ', DM агентства ' + s['sent:agency_dm']);
  } catch (e) { lines.push('Счётчики недоступны: ' + esc(e.message)); }

  // 2. Хантер агентства: воронка, ответы и сделки по отраслям и странам
  try {
    const H = require('./hunter');
    const rows = await queryAll(H.ncall, H.DB(), null, 5);
    const stage = count(rows, function (r) { return prop(r, 'Этап'); });
    const sentW = rows.filter(function (r) { return inLastDays(prop(r, 'Отправлено'), 7); }).length;
    const replW = rows.filter(function (r) { return inLastDays(prop(r, 'Ответил'), 7); }).length;
    const touched = rows.filter(function (r) { return ['Отправлено', 'Follow-up запланирован', 'Ответ получен', 'Встреча назначена', 'КП принято', 'Сделка/Оплачено', 'Отказ', 'Без ответа (закрыт)'].indexOf(prop(r, 'Этап')) >= 0; });
    const replied = touched.filter(function (r) { return ['Ответ получен', 'Встреча назначена', 'КП принято', 'Сделка/Оплачено'].indexOf(prop(r, 'Этап')) >= 0 || prop(r, 'Ответил'); });
    const deals = rows.filter(function (r) { return prop(r, 'Этап') === 'Сделка/Оплачено'; });
    const sum = deals.reduce(function (a, r) { return a + (Number(prop(r, 'Сумма сделки')) || 0); }, 0);
    const rate = touched.length ? Math.round(replied.length * 100 / touched.length) : 0;
    lines.push('', '🏢 <b>Агентство (Hunter CRM, ' + rows.length + ' лидов)</b>');
    lines.push('За неделю: отправлено ' + sentW + ', ответов ' + replW + '. Всего с касанием ' + touched.length + ', ответили ' + replied.length + ' (' + rate + '%), встреч ' + (stage['Встреча назначена'] || 0) + ', КП принято ' + (stage['КП принято'] || 0) + ', сделок ' + deals.length + (sum ? ' на $' + sum : ''));
    lines.push('Ответы по отраслям: ' + top(count(replied, function (r) { return prop(r, 'Отрасль'); }), 6));
    lines.push('Ответы по странам: ' + top(count(replied, function (r) { return prop(r, 'Страна'); }), 6));
    lines.push('Этапы: ' + top(stage, 12));
    const due = rows.filter(function (r) { const d = prop(r, 'Следующее касание'); return d && d <= new Date().toISOString().slice(0, 10) && prop(r, 'Этап') === 'Отправлено'; }).length;
    if (due) lines.push('⏳ Ждут повторного касания вручную (DM): ' + due);
  } catch (e) { lines.push('', 'Хантер агентства недоступен: ' + esc(e.message)); await report('Отчёт: Хантер агентства', e); }

  // 3. Хантер магазина + продажи и выручка по товарам
  try {
    const S = require('./shop');
    const rows = await queryAll(S.ncall, S.HUNTER_DB(), null, 6);
    const stage = count(rows, function (r) { return prop(r, 'Этап'); });
    const sentW = rows.filter(function (r) { return inLastDays(prop(r, 'Отправлено'), 7) || inLastDays(prop(r, 'Дата публикации'), 7); }).length;
    const replW = rows.filter(function (r) { return inLastDays(prop(r, 'Ответил'), 7); }).length;
    lines.push('', '🛍 <b>METRAWEN Shop (Хантер, ' + rows.length + ' лидов)</b>');
    lines.push('За неделю: отправлено/опубликовано ' + sentW + ', ответов ' + replW + '. Этапы: ' + top(stage, 10));
  } catch (e) { lines.push('', 'Хантер магазина недоступен: ' + esc(e.message)); await report('Отчёт: Хантер магазина', e); }
  try {
    const log = ((await loadJson('sales:log')) || []).filter(function (x) { return x.ts >= Date.now() - 7 * 86400e3; });
    const by = {};
    let total = 0;
    log.forEach(function (x) { const k = x.product || 'без названия'; by[k] = by[k] || { n: 0, s: 0 }; by[k].n++; by[k].s += Number(x.amount) || 0; total += Number(x.amount) || 0; });
    const keys = Object.keys(by).sort(function (a, b) { return by[b].s - by[a].s; });
    lines.push('<b>Продажи за неделю:</b> ' + log.length + (total ? ' на ' + Math.round(total * 100) / 100 : '') + (keys.length ? '\n' + keys.slice(0, 10).map(function (k) { return '· ' + esc(k) + ': ' + by[k].n + ' шт' + (by[k].s ? ', ' + Math.round(by[k].s * 100) / 100 : ''); }).join('\n') : ''));
  } catch (e) { lines.push('Продажи недоступны: ' + esc(e.message)); }

  // 4. Последние ошибки
  try {
    const errs = ((await loadJson('err:log')) || []).filter(function (x) { return x.ts >= Date.now() - 7 * 86400e3; });
    if (errs.length) lines.push('', '⚠️ <b>Ошибки за неделю (' + errs.length + '):</b>\n' + errs.slice(0, 5).map(function (x) { return '· ' + esc(x.where) + ': ' + esc(x.msg); }).join('\n'));
  } catch (e) { /* ничего */ }

  // режем по строкам, чтобы не разорвать HTML-теги
  const parts = [];
  let cur = '';
  lines.join('\n').split('\n').forEach(function (l) {
    if ((cur + '\n' + l).length > 3800 && cur) { parts.push(cur); cur = ''; }
    cur = cur ? cur + '\n' + l : l;
  });
  if (cur) parts.push(cur);
  for (const t of parts) await tg('sendMessage', { chat_id: chat(), parse_mode: 'HTML', disable_web_page_preview: true, text: t });
  return { ok: true };
}

// Журнал продаж для отчёта (вызывает shop.markSale).
async function logSale(s) {
  if (!storeEnabled()) return;
  const log = (await loadJson('sales:log')) || [];
  log.unshift({ ts: Date.now(), product: String(s.product || '').slice(0, 80), amount: Number(s.amount) || 0, source: String(s.source || '').slice(0, 40), hunter: !!s.hunter });
  await saveJson('sales:log', log.slice(0, 500), 60 * 60 * 24 * 400);
}

module.exports = { track, untrack, tick, weekly, seen, logSale, remind };
