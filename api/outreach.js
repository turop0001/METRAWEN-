// Мост METRAWEN Shop забирает письма для холодной рассылки и сообщает об отправке.
const bridge = require('./_lib/emailbridge');
const op = require('./_lib/outreach');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  if ((await bridge.authorized(req)) !== 'shop') return res.status(401).json({ ok: false });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  try {
    if (b.action === 'due') return res.status(200).json({ ok: true, items: await op.due() });
    if (b.action === 'sent' && b.item) { await op.sent(b.item); return res.status(200).json({ ok: true }); }
    return res.status(400).json({ ok: false });
  } catch (e) { return res.status(500).json({ ok: false, error: String(e.message || e).slice(0, 120) }); }
};
