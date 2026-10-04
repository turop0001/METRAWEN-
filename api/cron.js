// Служебный вход: тик (напоминания, контроль мостов, фоновая чистка) и недельный отчёт.
// Кто может вызвать: Vercel Cron (заголовок Authorization: Bearer CRON_SECRET, если переменная задана),
// почтовые мосты Apps Script (их ключ x-email-secret).
const bridge = require('./_lib/emailbridge');
const ops = require('./_lib/ops');
const { report } = require('./_lib/alert');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const cs = String(process.env.CRON_SECRET || '');
  const auth = String(req.headers.authorization || '');
  const ua = String(req.headers['user-agent'] || '');
  const fromVercel = cs ? auth === 'Bearer ' + cs : /vercel-cron/i.test(ua);
  const scope = fromVercel ? '' : await bridge.authorized(req);
  if (!fromVercel && !scope) return res.status(401).json({ ok: false });
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const job = String((req.query && req.query.job) || b.action || 'tick');
  try {
    if (scope) await ops.seen(scope);
    if (job === 'weekly') return res.status(200).json(await ops.weekly(false));
    return res.status(200).json(await ops.tick());
  } catch (e) {
    await report('Служебный вызов ' + job, e);
    return res.status(500).json({ ok: false });
  }
};
