// api/email.js: приём входящих писем с адресов компании (sales@, support@, info@, help@).
// Письма передаёт Apps Script из ящика metrawen.team. Дмитрию в Telegram приходит черновик ответа.
const { handleNewLead } = require('./_lib/sellmanager');
const bridge = require('./_lib/emailbridge');
const { saveJson, loadJson, enabled: storeEnabled } = require('./_lib/store');

const SKIP_FROM = /(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?@|bounce|newsletter|marketing@|@(.+\.)?(google|googlemail|vercel|github|notion|porkbun|stripe|paypal|payoneer|canva|facebookmail|instagram|linkedin|telegram)\.)/i;
const SKIP_SUBJECT = /^(undelivered|delivery status|automatic reply|auto-?reply|out of office|автоответ|не доставлено)/i;

function cleanBody(t) {
  let s = String(t || '').replace(/\r/g, '');
  const cuts = [
    /\n\s*On .{5,120} wrote:\s*\n/i,
    /\n\s*.{3,120}(написал|написала|пишет)\(?а?\)?:\s*\n/i,
    /\n\s*-{2,}\s*(Original Message|Forwarded message|Пересланное сообщение)/i,
    /\n\s*>/,
    /\n\s*(From|От):\s.+\n\s*(Sent|Date|Отправлено|Дата):/i
  ];
  cuts.forEach(function (re) {
    const m = s.match(re);
    if (m && m.index > 5) s = s.slice(0, m.index);
  });
  return s.trim().slice(0, 2500);
}

function parseFrom(v) {
  const m = String(v || '').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), addr: m[2].trim().toLowerCase() };
  return { name: '', addr: String(v || '').trim().toLowerCase() };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  if (!b || typeof b !== 'object') b = {};

  // Первое подключение скрипта: ключ подтверждает владелец кнопкой в Telegram.
  if (b.action === 'register') {
    if (await bridge.hasKey()) return res.status(403).json({ ok: false, error: 'already_connected' });
    try {
      const sent = await bridge.register(req.headers['x-email-secret'], b.replyUrl);
      return res.status(200).json({ ok: true, pending: true, sent: sent });
    } catch (e) { return res.status(400).json({ ok: false, error: String(e.message || e).slice(0, 80) }); }
  }

  if (!(await bridge.authorized(req))) return res.status(401).json({ ok: false, error: 'unauthorized' });

  await bridge.rememberBridge(b.replyUrl);

  const f = parseFrom(b.from);
  const subject = String(b.subject || '').slice(0, 300);
  const text = cleanBody(b.body);
  if (!f.addr || !text) return res.status(200).json({ ok: true, skipped: 'empty' });
  if (/@metrawen\.com$/i.test(f.addr) || f.addr === 'metrawen.team@gmail.com') return res.status(200).json({ ok: true, skipped: 'own' });
  if (SKIP_FROM.test(f.addr) || SKIP_SUBJECT.test(subject)) return res.status(200).json({ ok: true, skipped: 'auto' });

  if (storeEnabled()) {
    const seen = 'em:seen:' + String(b.id || '');
    if (b.id) {
      if (await loadJson(seen)) return res.status(200).json({ ok: true, skipped: 'dup' });
      await saveJson(seen, 1, 60 * 60 * 24 * 7);
    }
    const rk = 'em:rl:' + f.addr;
    const n = ((await loadJson(rk)) || 0) + 1;
    await saveJson(rk, n, 60 * 60);
    if (n > 6) return res.status(200).json({ ok: true, skipped: 'rate' });
  }

  const alias = String(b.to || '').toLowerCase();
  await handleNewLead({
    label: 'Email' + (alias ? ' → ' + alias : ''),
    channel: 'email',
    emailAddr: f.addr,
    emailThread: String(b.threadId || ''),
    emailTo: alias,
    emailSubject: subject,
    name: f.name,
    contact: (f.name ? f.name + ' <' + f.addr + '>' : f.addr),
    message: (subject ? 'Тема письма: ' + subject + '\n\n' : '') + text
  });
  return res.status(200).json({ ok: true });
};
