// Вебхук продаж: Gumroad Ping (form-urlencoded) и любые площадки с JSON (Lava.top и т.п.).
// Адрес: https://metrawen.com/api/sale?k=SALE_WEBHOOK_KEY
const shop = require('./_lib/shop');
module.exports = async function handler(req, res) {
  const key = String(process.env.SALE_WEBHOOK_KEY || '');
  if (!key || String((req.query && req.query.k) || '') !== key) return res.status(401).json({ ok: false });
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = Object.fromEntries(new URLSearchParams(b)); } }
  const email = b.email || b.buyer_email || (b.buyer && b.buyer.email) || (b.customer && b.customer.email) || '';
  const product = b.product_name || b.product || (b.offer && b.offer.name) || '';
  const amount = b.seller_id ? Number(b.price || 0) / 100 : (b.amount || b.sum || b.price || '');
  await shop.markSale(String(email) + ' ' + JSON.stringify(b).slice(0, 2000), { source: req.query.src || (b.seller_id ? 'Gumroad' : 'вебхук'), product: product, amount: amount });
  return res.status(200).json({ ok: true });
};
