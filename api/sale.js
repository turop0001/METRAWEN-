// Вебхук продаж: Gumroad Ping (form-urlencoded) и любые площадки с JSON (Lava.top и т.п.).
// Магазин:   https://metrawen.com/api/sale?k=SALE_WEBHOOK_KEY            (&src=Lava для Lava.top)
// Агентство: https://metrawen.com/api/sale?k=SALE_WEBHOOK_KEY&brand=agency (оплата услуг по ссылке Lava.top/Payoneer:
//            лид из Hunter CRM по email покупателя → «Сделка/Оплачено» + сумма)
const shop = require('./_lib/shop');
const { report } = require('./_lib/alert');

module.exports = async function handler(req, res) {
  const key = String(process.env.SALE_WEBHOOK_KEY || '');
  if (!key || String((req.query && req.query.k) || '') !== key) return res.status(401).json({ ok: false });
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = Object.fromEntries(new URLSearchParams(b)); } }
  const email = b.email || b.buyer_email || (b.buyer && b.buyer.email) || (b.customer && b.customer.email) || '';
  const product = b.product_name || b.product || (b.offer && b.offer.name) || '';
  const amount = b.seller_id ? Number(b.price || 0) / 100 : (b.amount || b.sum || b.price || '');
  try {
    if (req.query.brand === 'agency') {
      const hunter = require('./_lib/hunter');
      const { tg } = require('./_lib/tg');
      const pg = email ? await hunter.findByEmail(String(email).toLowerCase()) : null;
      if (pg) await hunter.advance(pg, 'Сделка/Оплачено', { 'Сумма сделки': { number: Number(amount) || 0 } }, 'Оплата: ' + amount + (product ? ' · ' + product : ''));
      await require('./_lib/alert').stat('sales');
      await tg('sendMessage', { chat_id: process.env.TELEGRAM_CHAT_ID,
        text: '💰 ОПЛАТА УСЛУГ АГЕНТСТВА · ' + String(req.query.src || 'вебхук') + (product ? '\nЗа что: ' + String(product).slice(0, 120) : '') + (amount ? '\nСумма: ' + amount : '') +
          (pg ? '\nКлиент из Hunter CRM: ' + hunter.prop(pg, 'Компания') + ' → этап «Сделка/Оплачено»' : '\nПлательщик не найден в Hunter CRM' + (email ? ' (' + email + ')' : '') + ': отметьте сделку вручную.') });
      return res.status(200).json({ ok: true });
    }
    await shop.markSale(String(email) + ' ' + JSON.stringify(b).slice(0, 2000), { source: req.query.src || (b.seller_id ? 'Gumroad' : 'вебхук'), product: product, amount: amount });
  } catch (e) {
    await report('Вебхук продаж', e, product || email);
  }
  return res.status(200).json({ ok: true });
};
