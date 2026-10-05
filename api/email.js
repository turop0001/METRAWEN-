// api/email.js: приём входящих писем с адресов компании (sales@, support@, info@, help@).
// Письма передаёт Apps Script из ящика metrawen.team. Дмитрию в Telegram приходит черновик ответа.
const { handleNewLead } = require('./_lib/sellmanager');
const bridge = require('./_lib/emailbridge');
const shop = require('./_lib/shop');
const hunter = require('./_lib/hunter');
const { saveJson, loadJson, enabled: storeEnabled } = require('./_lib/store');
const ops = require('./_lib/ops');
const { report, stat } = require('./_lib/alert');

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
    const scope = b.scope === 'shop' ? 'shop' : b.scope === 'agency' ? 'agency' : 'main';
    if (await bridge.hasKey(scope)) return res.status(403).json({ ok: false, error: 'already_connected' });
    try {
      const sent = await bridge.register(req.headers['x-email-secret'], b.replyUrl, scope);
      return res.status(200).json({ ok: true, pending: true, sent: sent });
    } catch (e) { return res.status(400).json({ ok: false, error: String(e.message || e).slice(0, 80) }); }
  }

  const scope = await bridge.authorized(req);
  if (!scope) return res.status(401).json({ ok: false, error: 'unauthorized' });

  await bridge.rememberBridge(b.replyUrl, scope);
  await ops.seen(scope);
  // служебный вызов моста раз в 10 минут: напоминания, контроль мостов, фоновая чистка
  if (b.action === 'tick') return res.status(200).json(await ops.tick());

  const f = parseFrom(b.from);
  const subject = String(b.subject || '').slice(0, 300);
  const text = cleanBody(b.body);
  if (!f.addr || !text) return res.status(200).json({ ok: true, skipped: 'empty' });
  const shopMode = scope === 'shop';
  const agencyMode = scope === 'agency';
  const ownBoxes = (Array.isArray(b.boxes) ? b.boxes : []).map(function (x) { return String(x).toLowerCase(); });
  if (shopMode ? shop.OWN_SHOP.test(f.addr) : (/@metrawen\.com$/i.test(f.addr) || f.addr === 'metrawen.team@gmail.com' || ownBoxes.indexOf(f.addr) >= 0)) return res.status(200).json({ ok: true, skipped: 'own' });
  // Письма площадок (Etsy, Gumroad, Lava, Tribute) для ящика магазина пропускать нельзя: это сообщения покупателей.
  const market = shopMode && shop.isMarketplace(f.addr);
  if ((!market && SKIP_FROM.test(f.addr)) || SKIP_SUBJECT.test(subject)) return res.status(200).json({ ok: true, skipped: 'auto' });

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

  if (shopMode && market && shop.isSaleMail(subject)) {
    try { await shop.markSale(String(b.body || ''), { source: f.addr.split('@')[1], product: subject }); }
    catch (e) { await report('Продажа из письма площадки', e, subject); }
    return res.status(200).json({ ok: true, sale: true });
  }

  const alias = String(b.to || '').toLowerCase();

  // Три ящика getmetrawen.com общие для холодной рассылки магазина и агентства, и ответы приходят в один мост.
  // Чей это ответ, определяем по отправителю: метка при отправке, а если её нет, по базе Hunter CRM агентства.
  let agencyReply = false;
  if (shopMode && !market) {
    // главный признак: на какой адрес написали (getmetrawen.com = агентство, metrawenshop.com = магазин)
    const dom = (alias.split('@')[1] || '');
    if (dom === 'getmetrawen.com') agencyReply = true;
    else if (dom !== 'metrawenshop.com') try {
      const tag = storeEnabled() ? await loadJson('op:rcpt:' + f.addr) : null;
      if (tag === 'agency') agencyReply = true;
      else if (tag !== 'shop') agencyReply = !!(await hunter.findByEmail(f.addr));
    } catch (e) { console.error('email: ветка ответа не определена, считаем магазином', e); }
  }
  // Одно и то же письмо могут принести два моста (если ящик пересылается в обе почты): второй раз не обрабатываем.
  if (storeEnabled()) {
    const dk = 'em:dd:' + f.addr + ':' + subject.slice(0, 60) + ':' + text.slice(0, 80);
    if (await loadJson(dk)) return res.status(200).json({ ok: true, skipped: 'dup2' });
    await saveJson(dk, 1, 60 * 60);
  }
  await stat(shopMode ? 'in:email_shop' : 'in:email');
  try {
  await handleNewLead({
    label: (agencyReply ? 'Ответ на рассылку агентства' : shopMode ? 'Shop Email' : agencyMode ? 'Холодная почта агентства' : 'Email') + (alias ? ' → ' + alias : ''),
    channel: 'email',
    brand: shopMode && !agencyReply ? 'shop' : '',
    emailScope: scope,
    noSend: market,
    emailAddr: f.addr,
    emailThread: String(b.threadId || ''),
    emailTo: alias,
    emailSubject: subject,
    name: f.name,
    contact: (f.name ? f.name + ' <' + f.addr + '>' : f.addr),
    message: (subject ? 'Тема письма: ' + subject + '\n\n' : '') + text
  });
  } catch (e) {
    await report('Письмо не обработано', e, f.addr + ' · ' + subject);
    return res.status(500).json({ ok: false });
  }
  return res.status(200).json({ ok: true });
};
