// Заказ новых лидов для Hunter CRM из меню бота: кнопки +25 / +50 / +100.
// Запрос ложится строкой в Notion («Лиды по каналам», канал «Запрос лидов»); лиды добавляет ассистент Hunter,
// ставит статус «Готово», а бот присылает уведомление.
const shop = require('./shop');
const { tg } = require('./tg');
const DB = function () { return String(process.env.NOTION_OUTBOUND_DB_ID || '2ab374b320594ee5bd115f329a9c3594').replace(/[^0-9a-f]/gi, ''); };
const NAME = { agency: 'Агентство', shop: 'Shop', ig: 'Instagram (личная отправка)', li: 'LinkedIn (личная отправка)', tgg: 'Telegram-группы (личная отправка)' };

async function create(brand, n, seg) {
  const b = NAME[brand] ? brand : 'agency';
  const num = Math.min(Math.max(parseInt(n, 10) || 50, 1), 200);
  const title = '+' + num + ' · ' + NAME[b] + (seg ? ' · ' + seg : '');
  await shop.ncall('POST', '/pages', {
    parent: { database_id: DB() },
    properties: {
      'Название': { title: [{ text: { content: title } }] },
      'Канал': { select: { name: 'Запрос лидов' } },
      'Статус запроса': { select: { name: 'Новый' } },
      'Количество': { number: num },
      'Заметки': { rich_text: [{ text: { content: 'Бренд: ' + NAME[b] + (seg ? '. Сегмент: ' + seg : '') } }] }
    }
  });
  return { brand: b, n: num };
}

async function open() {
  const j = await shop.ncall('POST', '/databases/' + DB() + '/query', {
    page_size: 50,
    filter: { and: [{ property: 'Канал', select: { equals: 'Запрос лидов' } }, { property: 'Статус запроса', select: { does_not_equal: 'Готово' } }] }
  });
  return (j.results || []).length;
}

async function notifyDone() {
  const j = await shop.ncall('POST', '/databases/' + DB() + '/query', {
    page_size: 10,
    filter: { and: [{ property: 'Канал', select: { equals: 'Запрос лидов' } }, { property: 'Статус запроса', select: { equals: 'Готово' } }, { property: 'Уведомлён', checkbox: { equals: false } }] }
  });
  let sent = 0;
  for (const r of (j.results || [])) {
    const t = (r.properties['Название'] && r.properties['Название'].title || []).map(function (x) { return x.plain_text; }).join('');
    await tg('sendMessage', { chat_id: process.env.TELEGRAM_CHAT_ID, text: '✅ Новые лиды добавлены: ' + t + '. Они в Hunter CRM с черновиками, можно готовить пачку в меню.' });
    await shop.ncall('PATCH', '/pages/' + r.id, { properties: { 'Уведомлён': { checkbox: true } } });
    sent++;
  }
  return sent;
}
module.exports = { create, open, notifyDone };
