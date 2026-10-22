// Автопачка: каждое рабочее утро (Таиланд, пн-пт) сама собирает пачку холодных писем до суточного лимита ящиков
// и присылает в Telegram одно сообщение с кнопками «Одобрить пачку» / «Отменить». Без нажатия ничего не уходит.
// Выключить: переменная OUTREACH_AUTO=0. Вызывается из /api/cron?job=tick (Vercel Cron, 01:00 UTC = 08:00 Таиланд).
const { loadJson, saveJson, once, enabled: storeEnabled } = require('./store');
const { tg } = require('./tg');
const { report } = require('./alert');

const MIN_PACK = 5;   // меньше не собираем: смысла дёргать нет
const MAX_PACK = 50;

function bkk() { return new Date(Date.now() + 7 * 3600 * 1000); }

async function one(brand) {
  const op = require('./outreach');
  const B = op.cfg(brand);
  // ящики: агентство берёт из подключённого моста, магазин из OUTREACH_SHOP_BOXES
  const nb = brand === 'agency' ? (((await loadJson(B.key + ':boxes')) || []).length) : op.SHOP_BOXES.length;
  if (!nb) return { brand: brand, skip: 'нет подключённых ящиков' };
  const perDay = nb * (await op.capFor(brand));
  const queued = ((await loadJson(B.key + ':queue')) || []).length;
  const need = Math.min(perDay - queued, MAX_PACK);
  if (need < MIN_PACK) return { brand: brand, skip: 'очередь уже покрывает день (' + queued + ' из ' + perDay + ')' };
  // неодобренная пачка со вчера ещё висит: не плодим вторую
  const prev = await loadJson('op:auto:pending:' + brand);
  const old = prev ? await loadJson('op:pack:' + prev) : null;
  if (old) {
    // свежая (до суток) неодобренная пачка: повторно шлём карточку с кнопками, вдруг первая не дошла
    if (old.at && Date.now() - old.at < 20 * 60 * 60 * 1000) {
      await tg('sendMessage', { chat_id: process.env.TELEGRAM_CHAT_ID, text: '🔁 Пачка (' + (brand === 'agency' ? 'агентство' : 'магазин') + ', ' + old.items.length + ' писем) всё ещё ждёт одобрения. Одобрить?',
        reply_markup: { inline_keyboard: [[{ text: '✅ Одобрить пачку', callback_data: 'op:ok:' + prev }, { text: '✖️ Отменить', callback_data: 'op:no:' + prev }]] } });
      return { brand: brand, skip: 'пачка ждёт одобрения (карточка отправлена повторно)' };
    }
    // старая или без отметки времени: сбрасываем и собираем заново, чтобы не стоять днями
    await saveJson('op:pack:' + prev, null, 1);
    await saveJson('op:auto:pending:' + brand, null, 1);
  }
  const p = await op.buildPack(need, brand, '');
  if (!p.items.length) {
    await tg('sendMessage', { chat_id: process.env.TELEGRAM_CHAT_ID, text: '📭 Автопачка (' + (brand === 'agency' ? 'агентство' : 'магазин') + '): нет лидов, готовых к рассылке. Нужны новые лиды в Hunter CRM.' });
    return { brand: brand, skip: 'нет лидов' };
  }
  await saveJson('op:auto:pending:' + brand, p.id, 60 * 60 * 24 * 3);
  const name = brand === 'agency' ? 'агентство' : 'магазин';
  const text = '📦 Пачка на сегодня готова (' + name + '): ' + p.items.length + ' писем из ' + perDay + ' по дневному лимиту (' + nb + ' ящ. × ' + (perDay / nb) + ').\n' +
    'Тексты в карточках Notion. 🗓 Старт по графику: ' + op.planStart(p.items) + ' (время Таиланда), окно 9–18 по стране лида, повтор через 4 дня без ответа.\n\nОдобрить?';
  await tg('sendMessage', { chat_id: process.env.TELEGRAM_CHAT_ID, text: text,
    reply_markup: { inline_keyboard: [[{ text: '✅ Одобрить пачку', callback_data: 'op:ok:' + p.id }, { text: '✖️ Отменить', callback_data: 'op:no:' + p.id }]] } });
  return { brand: brand, n: p.items.length };
}

async function run(force) {
  if (!storeEnabled() || process.env.OUTREACH_AUTO === '0') return { skipped: true };
  const d = bkk(); const dow = d.getUTCDay();
  if (!force && (dow === 0 || dow === 6)) return { skipped: 'выходной' };
  const day = d.toISOString().slice(0, 10);
  if (!force && !(await once('op:auto:' + day, 20 * 60 * 60))) return { skipped: 'сегодня уже было' };
  const out = [];
  for (const brand of ['agency', 'shop']) {
    try { out.push(await one(brand)); } catch (e) { await report('Автопачка ' + brand, e); }
  }
  return { ok: true, out: out };
}

module.exports = { run: run };
