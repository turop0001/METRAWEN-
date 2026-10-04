// Журнал ошибок и статистика Sell Manager.
// report(): ошибка уходит в Telegram (одинаковые не чаще раза в час) и в журнал для недельного отчёта.
// stat(): счётчики по неделям (обращения по каналам, подтверждения, продажи).
const crypto = require('crypto');
const { saveJson, loadJson, incr, once, enabled: storeEnabled } = require('./store');

function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Номер недели вида 2026-W40 (по Бангкоку, GMT+7).
function week(ts) {
  const d = new Date((ts || Date.now()) + 7 * 3600 * 1000);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return t.getUTCFullYear() + '-W' + String(w).padStart(2, '0');
}

async function stat(name, by) {
  if (!storeEnabled()) return;
  try { await incr('stat:' + week() + ':' + name + (by ? ':' + by : ''), 60 * 60 * 24 * 70); } catch (e) { /* статистика не критична */ }
}

async function report(where, err, ctx, quiet) {
  const msg = String((err && err.message) || err || '').slice(0, 300);
  console.error('alert: ' + where, err);
  if (!storeEnabled()) return;
  try {
    const h = crypto.createHash('sha1').update(where + '|' + msg.replace(/\d+/g, '#')).digest('hex').slice(0, 16);
    await incr('stat:' + week() + ':errors', 60 * 60 * 24 * 70);
    const log = (await loadJson('err:log')) || [];
    log.unshift({ ts: Date.now(), where: where, msg: msg.slice(0, 160) });
    await saveJson('err:log', log.slice(0, 40), 60 * 60 * 24 * 30);
    if (quiet || !(await once('err:seen:' + h, 60 * 60))) return;
    const { tg } = require('./tg');
    await tg('sendMessage', {
      chat_id: process.env.TELEGRAM_CHAT_ID, parse_mode: 'HTML', disable_web_page_preview: true,
      text: '⚠️ <b>Ошибка Sell Manager</b> · ' + esc(where) + '\n' + esc(msg) + (ctx ? '\n<b>Что затронуто:</b> ' + esc(String(ctx).slice(0, 300)) : '') + '\nОдинаковые ошибки присылаю не чаще раза в час.'
    });
  } catch (e) { console.error('alert: не отправил', e); }
}

// Только в журнал (для недельного отчёта), без сообщения в Telegram: когда владелец и так видит ошибку в чате.
async function log(where, err, ctx) { return report(where, err, ctx, true); }

module.exports = { report, log, stat, week, esc };
