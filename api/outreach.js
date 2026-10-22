// Мосты холодной рассылки (METRAWEN Shop и холодная почта агентства) забирают письма и сообщают об отправке.
const bridge = require('./_lib/emailbridge');
const op = require('./_lib/outreach');
const ops = require('./_lib/ops');
const { report } = require('./_lib/alert');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const scope = await bridge.authorized(req);
  if (scope !== 'shop' && scope !== 'agency') return res.status(401).json({ ok: false });
  await ops.seen(scope);
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  try {
    if (b.action === 'due') return res.status(200).json({ ok: true, items: await op.due(scope, b.boxes) });
    if (b.action === 'sent' && b.item) { await op.sent(b.item, scope); return res.status(200).json({ ok: true }); }
    if (b.action === 'recover') { const r = await op.recover(scope); if (r.restored) console.log('Рассылка (' + scope + '): возвращено в очередь ' + r.restored); /* не шлём в Telegram: при лимите Gmail приходило каждый час */ return res.status(200).json(Object.assign({ ok: true }, r)); }
    if (b.action === 'failed' && b.item && /too many times|quota|Service invoked/i.test(String(b.error || ''))) { try { await op.recover(scope); } catch (e) {} return res.status(200).json({ ok: true, requeued: true }); }
    if (b.action === 'failed' && b.item) { await report('Мост не отправил письмо (' + scope + ')', String(b.error || 'ошибка Gmail'), b.item.to); try { await op.failed(b.item, scope); } catch (e) {} try { await require('./_lib/hunter').sendFailed(b.item.to, b.error); } catch (e) {} return res.status(200).json({ ok: true }); }
    return res.status(400).json({ ok: false });
  } catch (e) {
    await report('Рассылка (' + scope + ')', e);
    return res.status(500).json({ ok: false, error: String(e.message || e).slice(0, 120) });
  }
};
