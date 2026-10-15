// Служебный вход: тик (напоминания, контроль мостов, фоновая чистка) и недельный отчёт.
// Кто может вызвать: Vercel Cron (заголовок Authorization: Bearer CRON_SECRET, если переменная задана),
// почтовые мосты Apps Script (их ключ x-email-secret).
const bridge = require('./_lib/emailbridge');
const ops = require('./_lib/ops');
const { report } = require('./_lib/alert');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (String((req.query && req.query.job) || '') === 'hunter-export') {
    // Разовая выгрузка Hunter CRM для METRAWEN OS: отдельный ключ, только чтение.
    const want = String(process.env.HUNTER_EXPORT_TOKEN || '').replace(/\s+/g, '');
    const got = String(req.headers['x-export-token'] || '');
    if (!want || got !== want) return res.status(401).json({ ok: false });
    try { return res.status(200).json(await require('./_lib/hunter-export').page(String((req.query && req.query.cursor) || '') || null)); }
    catch (e) { return res.status(500).json({ ok: false, error: String(e.message).slice(0, 200) }); }
  }
  if (String((req.query && req.query.job) || '') === 'channels-export') {
    // Сводка по ручным отправкам для рабочего стола OS. Ключ тот же, что у двойной записи (OS_INGEST_TOKEN), только чтение.
    const want = String(process.env.OS_INGEST_TOKEN || '').replace(/[^\x21-\x7E]/g, '');
    const got = String(req.headers['x-ingest-token'] || '');
    if (!want || got !== want) return res.status(401).json({ ok: false });
    try { const ce = require('./_lib/channels-export'); return res.status(200).json(String((req.query && req.query.rows) || '') ? await ce.rowsAll() : await ce.run()); }
    catch (e) { return res.status(500).json({ ok: false, error: String(e.message).slice(0, 200) }); }
  }
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
    const t = await ops.tick();
    try { t.digest = await require('./_lib/digest').run(job === 'digest'); } catch (e) { await report('Сводка агентства', e); }
    if (fromVercel) { try { t.drafts = await require('./_lib/drafts').fillMissing(20, 40000); } catch (e) { await report('Авточерновики', e); } }
    if (fromVercel) { try { t.auto = await require('./_lib/autopack').run(); } catch (e) { await report('Автопачка', e); } }
    return res.status(200).json(t);
  } catch (e) {
    await report('Служебный вызов ' + job, e);
    return res.status(500).json({ ok: false });
  }
};
