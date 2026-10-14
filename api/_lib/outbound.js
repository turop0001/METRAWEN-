// Исходящие каналы: Instagram, Telegram-группы, LinkedIn, Upwork.
// Данные из Notion-базы «METRAWEN — Лиды по каналам»: вы ставите галочки, бот считает.
const shop = require('./shop');
const DB = function () { return String(process.env.NOTION_OUTBOUND_DB_ID || '2ab374b320594ee5bd115f329a9c3594').replace(/[^0-9a-f]/gi, ''); };
const CH = [['Instagram', 'Instagram'], ['Telegram-группа', 'Telegram'], ['LinkedIn', 'LinkedIn'], ['Upwork', 'Upwork']];

function chk(pr, n) { return !!(pr[n] && pr[n].checkbox); }
function sel(pr, n) { return pr[n] && pr[n].select ? pr[n].select.name : ''; }
function dt(pr, n) { return pr[n] && pr[n].date ? String(pr[n].date.start || '').slice(0, 10) : ''; }

async function load() {
  const rows = [];
  let cursor;
  for (let i = 0; i < 6; i++) {
    const j = await shop.ncall('POST', '/databases/' + DB() + '/query', { page_size: 100, start_cursor: cursor });
    (j.results || []).forEach(function (r) { rows.push(r.properties || {}); });
    if (!j.has_more) break;
    cursor = j.next_cursor;
  }
  return rows;
}

// today: строка YYYY-MM-DD по Таиланду
async function stats(today) {
  const rows = await load();
  return CH.map(function (c) {
    const rs = rows.filter(function (pr) { return sel(pr, 'Канал') === c[0]; });
    const sent = rs.filter(function (pr) { return chk(pr, 'Записка отправлена') || chk(pr, 'Сообщение через день'); });
    const res = function (n) { return rs.filter(function (pr) { return sel(pr, 'Результат') === n; }).length; };
    return {
      name: c[1], total: rs.length,
      added: rs.filter(function (pr) { return chk(pr, 'Добавил в контакты'); }).length,
      sent: sent.length,
      sentToday: sent.filter(function (pr) { return dt(pr, 'Дата отправки') === today; }).length,
      replied: rs.filter(function (pr) { return chk(pr, 'Ответил'); }).length,
      dialog: res('Диалог'), call: res('Созвон'), order: res('Заказ'), refuse: res('Отказ')
    };
  });
}

function lines(st, esc) {
  const L = [];
  st.forEach(function (x) {
    if (x.name === 'Upwork') {
      L.push('• Upwork: откликов ' + x.sent + (x.sentToday ? ' (сегодня ' + x.sentToday + ')' : '') + ' · ответили ' + x.replied + ' · созвонов ' + x.call + ' · заказов ' + x.order);
    } else {
      L.push('• ' + esc(x.name) + ': в списке ' + x.total + ' · добавлено ' + x.added + ' · написано ' + x.sent + (x.sentToday ? ' (сегодня ' + x.sentToday + ')' : '') + ' · ответили ' + x.replied + ' · созвонов ' + x.call + ' · заказов ' + x.order);
    }
  });
  return L;
}
module.exports = { stats, lines, load };
