// Сводка агентства в Notion («Сводка агентства — панель руководителя»): цифры считаются сами и обновляются
// раз в два часа (тик почтового моста вызывает run(); отдельный cron не нужен). Рекламные таблицы и таблица
// по категориям остаются ручными: их заполняют из баз «Реклама» внизу страницы.
// Как устроено: макет страницы (таблицы в колонках) создаётся один раз из layoutMarkdown(); здесь меняются
// только ячейки таблиц, по порядку строк. Число строк в таблицах задаёт tables(), макет строится из него же.
// Когда CRM переедет в Metrawen OS, поменять нужно только load() и tables().
const H = require('./hunter');
const { once, enabled: storeEnabled } = require('./store');
const { report } = require('./alert');

const clean = function (v) { return String(v || '').replace(/[^\x20-\x7E]/g, '').trim(); };
const PAGE = function () { return clean(process.env.NOTION_DIGEST_PAGE_ID) || '3f2ab017e982819fa6fdd16175795b52'; };
const INBOUND = function () { return clean(process.env.NOTION_CRM_DB_ID) || 'b3fe6fa8665e4cbf8307475d147e1dac'; };
const ADS = function () { return clean(process.env.NOTION_ADS_DB_ID) || 'fc965e35e77249f899c302e5e395a4ba'; };

const SENT_STAGES = ['Отправлено', 'Follow-up запланирован', 'Ответ получен', 'Встреча назначена', 'Без ответа (закрыт)', 'КП принято', 'Сделка/Оплачено'];
const REPLY_STAGES = ['Ответ получен', 'Встреча назначена', 'КП принято', 'Сделка/Оплачено'];
const COUNTRIES = ['Таиланд', 'Индонезия', 'США', 'Великобритания', 'Канада', 'Австралия', 'ОАЭ', 'Россия', 'СНГ', 'Европа'];
const INDUSTRIES = ['Фитнес и спорт', 'Салоны красоты', 'Недвижимость', 'Рестораны и кафе', 'Услуги B2B', 'Клиники', 'Туры и экскурсии', 'Интернет-магазины', 'Образование и курсы', 'Отели и виллы', 'Ритейл', 'Эксперты и консалтинг'];
const STAGES = ['Новый', 'Черновик готов', 'Готово к отправке', 'Отправлено', 'Follow-up запланирован', 'Ответ получен', 'Встреча назначена', 'Отказ', 'Без ответа (закрыт)', 'Skip'];
const CHANNELS = [['Форма и кнопки на сайте', 'Сайт'], ['Чат на сайте', 'Чат на сайте'], ['WhatsApp', 'WhatsApp'], ['Telegram', 'Telegram'], ['LINE', 'LINE'], ['Почта', 'Email']];
const ADPLAT = ['Яндекс Директ', 'Google Ads', 'Facebook Ads'];

function day(n) { return new Date(Date.now() + 7 * 3600e3 + (n || 0) * 86400e3).toISOString().slice(0, 10); }
function money(n) { return '$' + Math.round(n || 0).toLocaleString('en-US').replace(/,/g, ' '); }
function pct(a, b) { return b ? Math.round(a * 100 / b) + '%' : '0%'; }
const p = H.prop;

async function queryAll(db, max) {
  const rows = [];
  let cursor;
  for (let i = 0; i < (max || 8); i++) {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const j = await H.ncall('POST', '/databases/' + db + '/query', body);
    (j.results || []).forEach(function (r) { rows.push(r); });
    if (!j.has_more) break;
    cursor = j.next_cursor;
  }
  return rows;
}

async function load() {
  const hunter = await queryAll(H.DB(), 10);
  const inbound = await queryAll(INBOUND(), 5);
  let ads = [];
  try { ads = await queryAll(ADS(), 3); } catch (e) { ads = null; }
  return { hunter: hunter, inbound: inbound, ads: ads };
}

function countBy(rows, fn) { const m = {}; rows.forEach(function (r) { const k = fn(r); if (k) m[k] = (m[k] || 0) + 1; }); return m; }
function num(r, name) { const v = p(r, name); return typeof v === 'number' ? v : 0; }

// Все таблицы страницы: заголовок (первая ячейка шапки), шапка, строки. Порядок и число строк фиксированы.
function tables(d) {
  d = d || { hunter: [], inbound: [], ads: [] };
  const hr = d.hunter, ib = d.inbound;
  const stage = function (r) { return p(r, 'Этап'); };
  const sentDate = function (r) { return p(r, 'Отправлено'); };
  const isSent = function (r) { return !!sentDate(r) || SENT_STAGES.indexOf(stage(r)) >= 0; };
  const isReply = function (r) { return !!p(r, 'Ответил') || REPLY_STAGES.indexOf(stage(r)) >= 0; };
  const email = function (r) { return !!p(r, 'Публичный email'); };
  const note = function (r) { return p(r, 'Заметки') || ''; };
  const sentRows = hr.filter(isSent);
  const replyRows = hr.filter(isReply);
  const deals = hr.filter(function (r) { return stage(r) === 'Сделка/Оплачено' || (stage(r) === 'КП принято' && num(r, 'Сумма сделки') > 0); });
  const dealSum = hr.reduce(function (a, r) { return a + (num(r, 'Сумма сделки') > 0 ? num(r, 'Сумма сделки') : 0); }, 0);
  const today = day(0);
  const sentOn = function (dt) { return hr.filter(function (r) { return String(sentDate(r) || '').slice(0, 10) === dt; }).length; };
  const replyOn = function (dt) { return hr.filter(function (r) { return String(p(r, 'Ответил') || '').slice(0, 10) === dt; }).length; };
  const new7 = hr.filter(function (r) { return r.created_time && Date.parse(r.created_time) >= Date.now() - 7 * 86400e3; }).length;
  const sent7 = hr.filter(function (r) { const s = String(sentDate(r) || '').slice(0, 10); return s && s >= day(-6); }).length;
  const bounced = hr.filter(function (r) { return /EMAIL НЕВАЛИДНЫЙ/.test(note(r)); }).length;
  const autor = hr.filter(function (r) { return /АВТООТВЕТ/.test(note(r)); }).length;
  const failed = hr.filter(function (r) { return /ПИСЬМО НЕ ОТПРАВИЛОСЬ|ВРЕМЕННАЯ ОШИБКА/.test(note(r)); }).length;
  const followups = hr.filter(function (r) { return num(r, 'Касаний') >= 2; }).length;
  const score = countBy(hr, function (r) { return p(r, 'Скоринг'); });
  const stageC = countBy(hr, stage);
  const countryC = countBy(hr, function (r) { return p(r, 'Страна'); });
  const indC = countBy(hr, function (r) { return p(r, 'Отрасль'); });
  const emailScore = function (s) { return hr.filter(function (r) { return email(r) && p(r, 'Скоринг') === s; }).length; };
  const chan = countBy(ib, function (r) { return p(r, 'Канал'); });
  const ibStage = countBy(ib, function (r) { return p(r, 'Этап'); });
  const booked = ibStage['Встреча назначена'] || 0;

  const adsOk = Array.isArray(d.ads);
  const adSum = function (rows, f) { return rows.reduce(function (a, r) { return a + num(r, f); }, 0); };
  const ads = adsOk ? d.ads : [];
  const adsBy = function (plat) { return ads.filter(function (r) { return p(r, 'Площадка') === plat; }); };
  const spend = adSum(ads, 'Расход, $'), revenue = adSum(ads, 'Доход, $') + dealSum;
  const adRow = function (name, rows) {
    const sp = adSum(rows, 'Расход, $'), ld = adSum(rows, 'Лиды');
    return [name, money(sp), String(ld), String(adSum(rows, 'Продажи')), money(adSum(rows, 'Доход, $')), ld && sp ? money(sp / ld) : 'нет данных'];
  };
  const catRow = function (cat) {
    const rows = ads.filter(function (r) { return p(r, 'Категория') === cat; });
    const sp = adSum(rows, 'Расход, $'), rv = adSum(rows, 'Доход, $');
    return [cat === 'Общая' ? 'Общая реклама' : cat, money(sp), String(adSum(rows, 'Лиды')), String(adSum(rows, 'Продажи')), money(rv), money(rv - sp)];
  };
  const inbound = ib.length;
  const out = [];
  out.push({ t: 'ГЛАВНОЕ', head: ['ГЛАВНОЕ', 'Сейчас'], rows: [
    ['Заявки всего (сайт, мессенджеры, чат, почта)', String(inbound)],
    ['Записались на бесплатную сессию', String(booked)],
    ['Холодных писем отправлено всего', String(sentRows.length)],
    ['Ответили на холодную рассылку', String(replyRows.length)],
    ['Продажи (по сделкам в Хантере)', String(deals.length)],
    ['Расход на рекламу', adsOk ? money(spend) : 'нет данных'],
    ['Доход', money(revenue)],
    ['Прибыль (доход минус расход)', money(revenue - spend)]
  ] });
  out.push({ t: 'ЗАЯВКИ ПО КАНАЛАМ', head: ['ЗАЯВКИ ПО КАНАЛАМ', 'Заявок'], rows: CHANNELS.map(function (c) { return [c[0], String(chan[c[1]] || 0)]; }).concat([['Бесплатная сессия (запись)', String(booked)]]) });
  out.push({ t: 'ВОРОНКА ЗАЯВОК', head: ['ВОРОНКА ЗАЯВОК', 'Шт.'], rows: [
    ['Новые', String(ibStage['Новый'] || 0)], ['В диалоге', String(ibStage['В диалоге'] || 0)], ['Ждёт ответа', String(ibStage['Ждёт ответа'] || 0)],
    ['Встреча назначена', String(booked)], ['Отказ или закрыто', String((ibStage['Отказ'] || 0) + (ibStage['Закрыт'] || 0))],
    ['Конверсия заявка → встреча', pct(booked, inbound)]
  ] });
  out.push({ t: 'ХОЛОДНАЯ БАЗА', head: ['ХОЛОДНАЯ БАЗА (Hunter CRM)', 'Шт.'], rows: [
    ['Всего лидов в базе', String(hr.length)], ['Новые за 7 дней', String(new7)],
    ['С публичным email', String(hr.filter(email).length)],
    ['Hot с email', String(emailScore('Hot'))], ['Warm с email', String(emailScore('Warm'))], ['Cold с email', String(emailScore('Cold'))],
    ['Отправлено сегодня', String(sentOn(today))], ['Отправлено за 7 дней', String(sent7)], ['Отправлено всего', String(sentRows.length)],
    ['Повторные письма (касаний 2 и больше)', String(followups)],
    ['Ответили', String(replyRows.length) + ' (' + pct(replyRows.length, sentRows.length) + ')'],
    ['Встречи назначены', String(stageC['Встреча назначена'] || 0)],
    ['Продажи от лидов', String(deals.length)], ['Сумма сделок', money(dealSum)],
    ['Автоответы (отпуск, закрыто)', String(autor)], ['Адрес не существует', String(bounced)], ['Не отправилось или временная ошибка', String(failed)]
  ] });
  out.push({ t: 'СКОРИНГ', head: ['СКОРИНГ', 'Шт.'], rows: [['Hot', String(score.Hot || 0)], ['Warm', String(score.Warm || 0)], ['Cold', String(score.Cold || 0)], ['Skip', String(score.Skip || 0)]] });
  out.push({ t: 'ЭТАПЫ', head: ['ЭТАПЫ', 'Шт.'], rows: STAGES.map(function (s) { return [s, String(stageC[s] || 0)]; }) });
  out.push({ t: 'ОТЧЁТ ПО ДНЯМ', head: ['ОТЧЁТ ПО ДНЯМ (рассылка)', 'Отправлено', 'Ответы'], rows: [0, -1, -2, -3, -4, -5, -6].map(function (n) { return [day(n), String(sentOn(day(n))), String(replyOn(day(n)))]; }) });
  out.push({ t: 'СТРАНЫ', head: ['СТРАНЫ', 'Всего', 'Отправлено'], rows: COUNTRIES.map(function (c) { return [c, String(countryC[c] || 0), String(sentRows.filter(function (r) { return p(r, 'Страна') === c; }).length)]; }) });
  out.push({ t: 'ОТРАСЛИ', head: ['ОТРАСЛИ', 'Всего', 'Отправлено'], rows: INDUSTRIES.map(function (c) { return [c, String(indC[c] || 0), String(sentRows.filter(function (r) { return p(r, 'Отрасль') === c; }).length)]; }) });
  out.push({ t: 'РЕКЛАМА', head: ['ПЛОЩАДКА', 'Расход', 'Лиды', 'Продажи', 'Доход', 'Цена лида'], rows: ADPLAT.map(function (n) { return adRow(n, adsBy(n)); }).concat([adRow('ИТОГО', ads)]) });
  out.push({ t: 'КАТЕГОРИИ', head: ['КАТЕГОРИЯ', 'Расход', 'Лиды', 'Продажи', 'Доход', 'Прибыль'], rows: ['AI-сотрудники', 'Сайты и лендинги', 'Боты', 'Общая'].map(catRow).concat([['ВСЕГО', money(spend), String(adSum(ads, 'Лиды')), String(adSum(ads, 'Продажи')), money(adSum(ads, 'Доход, $')), money(adSum(ads, 'Доход, $') - spend)]]) });
  out.push({ t: 'ПРОГРЕВ ПОЧТ', head: ['ПРОГРЕВ ПОЧТ (getmetrawen.com)', 'Писем'], rows: [
    ['Ящиков в работе', '3 (dmitry.barinov@, d.barinov@, dmytro.pop@)'],
    ['Неделя 1: с ящика / в день всего', '5 / 15'], ['Неделя 2: с ящика / в день всего', '10 / 30'], ['Неделя 3: с ящика / в день всего', '15 / 45'],
    ['Дальше: с ящика в день', '20 (потолок)'],
    ['Статус запуска', 'Автопачка по будням в 08:00 (Таиланд), одобрение кнопкой в Telegram. Сегодня отправлено: ' + sentOn(today)]
  ] });
  return out;
}

const cell = function (s) { return [{ type: 'text', text: { content: String(s).slice(0, 1900) } }]; };
const plain = function (c) { return (c || []).map(function (x) { return x.plain_text || ''; }).join(''); };

async function children(id) {
  const all = [];
  let cursor;
  for (let i = 0; i < 6; i++) {
    const j = await H.ncall('GET', '/blocks/' + id + '/children?page_size=100' + (cursor ? '&start_cursor=' + cursor : ''));
    (j.results || []).forEach(function (b) { all.push(b); });
    if (!j.has_more) break;
    cursor = j.next_cursor;
  }
  return all;
}

// Находит на странице все таблицы (в том числе внутри колонок) и callout.
async function discover(id, depth, acc) {
  acc = acc || { tables: [], callout: null };
  const kids = await children(id);
  for (const b of kids) {
    if (b.type === 'callout' && !acc.callout) acc.callout = b;
    else if (b.type === 'table') acc.tables.push({ id: b.id, rows: await children(b.id) });
    else if (b.has_children && (b.type === 'column_list' || b.type === 'column') && depth < 3) await discover(b.id, depth + 1, acc);
  }
  return acc;
}

async function pool(items, n, fn) {
  let i = 0;
  const w = [];
  for (let k = 0; k < n; k++) w.push((async function () { while (i < items.length) { const it = items[i++]; await fn(it); } })());
  await Promise.all(w);
}

// Обновляет страницу. Если не уложились во время, оставшееся допишется следующим тиком.
async function refresh(budgetMs) {
  const t0 = Date.now();
  const d = await load();
  const T = tables(d);
  const found = await discover(PAGE(), 0);
  const byHead = {};
  found.tables.forEach(function (t) { const h = t.rows[0] && t.rows[0].table_row ? plain(t.rows[0].table_row.cells[0]) : ''; byHead[h] = t; });
  const jobs = [];
  T.forEach(function (tb) {
    const t = byHead[tb.head[0]];
    if (!t) return;
    tb.rows.forEach(function (row, i) {
      const cur = t.rows[i + 1];
      if (!cur || !cur.table_row) return;
      const have = cur.table_row.cells.map(plain);
      if (have.length === row.length && have.every(function (v, k) { return v === String(row[k]); })) return;
      jobs.push({ id: cur.id, cells: row });
    });
  });
  let done = 0, skipped = 0;
  await pool(jobs, 3, async function (j) {
    if (Date.now() - t0 > (budgetMs || 40000)) { skipped++; return; }
    await H.ncall('PATCH', '/blocks/' + j.id, { table_row: { cells: j.cells.map(cell) } });
    done++;
  });
  if (found.callout && !skipped) {
    const stamp = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
    const txt = 'Как читать сводку. Цифры обновляются сами раз в два часа, последний раз: ' + stamp + ' (время Таиланда). Заявки считаются по базе «Входящие клиенты», холодная рассылка по Hunter CRM, реклама по таблице «Реклама» внизу страницы (её заполняют вручную). В заявки входят тестовые обращения.';
    await H.ncall('PATCH', '/blocks/' + found.callout.id, { callout: { rich_text: [{ type: 'text', text: { content: txt } }] } });
  }
  return { ok: true, tables: found.tables.length, expected: T.length, changed: jobs.length, done: done, skipped: skipped, ms: Date.now() - t0 };
}

// Вызывается из тика моста; не чаще раза в два часа. Принудительно: run(true).
async function run(force) {
  if (!storeEnabled()) return { ok: false };
  if (!force && !(await once('digest:run', 2 * 3600))) return { ok: true, skipped: true };
  try {
    const r = await refresh(40000);
    if (r.tables < r.expected) await report('Сводка агентства', 'на странице найдено таблиц ' + r.tables + ' из ' + r.expected + ': макет изменён вручную или нет доступа интеграции Notion');
    return r;
  } catch (e) { await report('Сводка агентства', e); return { ok: false }; }
}

// Markdown макета: таблицы в колонках. Строится из tables(), поэтому число строк всегда совпадает.
function layoutMarkdown(dbTags) {
  const T = {};
  tables().forEach(function (t) { T[t.t] = t; });
  const tbl = function (k) {
    const t = T[k], n = t.head.length;
    const row = function (cells) { return '<tr>' + cells.map(function (c) { return '<td>' + String(c).replace(/[\\*~`$\[\]<>{}|^]/g, '\\$&') + '</td>'; }).join('') + '</tr>'; };
    return '<table header-row="true" fit-page-width="true">' + [row(t.head)].concat(t.rows.map(function (r) { return row(r.concat(Array(Math.max(0, n - r.length)).fill(''))); })).join('') + '</table>';
  };
  const col = function (blocks, ratio) { return '<column ratio="' + ratio + '">\n' + blocks.join('\n') + '\n</column>'; };
  const two = function (a, b, ra) { return '<columns>\n' + col(a, ra || 50) + '\n' + col(b, 100 - (ra || 50)) + '\n</columns>'; };
  const parts = [];
  parts.push('<callout icon="🧭" color="gray_bg">\nКак читать сводку. Цифры обновляются сами раз в два часа.\n</callout>');
  parts.push(two(['## Главное', tbl('ГЛАВНОЕ')], ['## Заявки: каналы и воронка', tbl('ЗАЯВКИ ПО КАНАЛАМ'), tbl('ВОРОНКА ЗАЯВОК')]));
  parts.push(two(['## Холодная рассылка', tbl('ХОЛОДНАЯ БАЗА'), tbl('СКОРИНГ')], ['## Этапы и отчёт по дням', tbl('ЭТАПЫ'), tbl('ОТЧЁТ ПО ДНЯМ')]));
  parts.push(two(['## Страны', tbl('СТРАНЫ')], ['## Отрасли', tbl('ОТРАСЛИ')]));
  parts.push(two(['## Реклама', tbl('РЕКЛАМА')], ['## Доход и расход по категориям', tbl('КАТЕГОРИИ')], 55));
  parts.push('## Прогрев почт\n' + tbl('ПРОГРЕВ ПОЧТ'));
  parts.push(dbTags || '');
  return parts.join('\n');
}

module.exports = { run, refresh, tables, layoutMarkdown, load };
