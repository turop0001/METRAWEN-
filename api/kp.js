// api/kp.js: КП как веб-страница. Публичное чтение и «Принять» для клиента; создание и правка только с ключом.
const K = require('./_lib/kp');
const { tg } = require('./_lib/tg');
const { saveJson, loadJson, enabled: storeEnabled } = require('./_lib/store');

function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmt(n, cur) { n = Number(n || 0); return cur === 'RUB' ? n.toLocaleString('ru-RU') + ' ₽' : '$' + n.toLocaleString('en-US'); }
function total(kp, addonIdx) {
  let s = (kp.items || []).reduce(function (a, x) { return a + Number(x.price || 0); }, 0);
  (addonIdx || []).forEach(function (i) { const a = (kp.addons || [])[i]; if (a) s += Number(a.price || 0); });
  return s;
}
function publicView(kp) {
  const c = JSON.parse(JSON.stringify(kp));
  delete c.source; delete c.notesPrivate;
  return c;
}
async function notify(text) {
  try { await tg('sendMessage', { chat_id: process.env.TELEGRAM_CHAT_ID, text: text, parse_mode: 'HTML', disable_web_page_preview: true }); } catch (e) { console.error('kp: tg', e); }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!storeEnabled()) return res.status(503).json({ ok: false });
  const key = req.headers['x-kp-key'];
  const admin = K.checkKey(key);

  if (req.method === 'GET') {
    const q = req.query || {};
    if (q.catalog) return res.status(200).json({ ok: true, items: K.ITEMS, rate: K.RATE });
    if (q.list) {
      if (!admin) return res.status(401).json({ ok: false });
      return res.status(200).json({ ok: true, list: (await loadJson('kp:index')) || [] });
    }
    if (q.new) {
      if (!admin) return res.status(401).json({ ok: false });
      return res.status(200).json({ ok: true, kp: K.blank(q.lang === 'en' ? 'en' : 'ru') });
    }
    const kp = await K.load(q.id);
    if (!kp) return res.status(404).json({ ok: false });
    if (admin) return res.status(200).json({ ok: true, kp: kp, url: K.publicUrl(kp.id) });
    if (kp.status === 'draft') return res.status(404).json({ ok: false });
    kp.views = (kp.views || 0) + 1;
    if (kp.status === 'sent') kp.status = 'viewed';
    await K.save(kp);
    if (!(await loadJson('kp:seen:' + kp.id))) {
      await saveJson('kp:seen:' + kp.id, 1, 60 * 60 * 3);
      await notify('👀 <b>Клиент открыл КП</b>\n' + esc(kp.client.name || kp.client.company || '') + ' · ' + esc(kp.title) + '\nПросмотров: ' + kp.views + '\n' + K.publicUrl(kp.id));
    }
    return res.status(200).json({ ok: true, kp: publicView(kp) });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  if (body.action === 'accept') {
    const kp = await K.load(body.id);
    if (!kp || kp.status === 'draft') return res.status(404).json({ ok: false });
    if (kp.status === 'accepted') return res.status(200).json({ ok: true, already: true });
    if (kp.validUntil && new Date(kp.validUntil + 'T23:59:59Z') < new Date(Date.now() - 864e5)) return res.status(410).json({ ok: false, error: 'expired' });
    if (await loadJson('kp:acc:' + kp.id)) return res.status(429).json({ ok: false });
    await saveJson('kp:acc:' + kp.id, 1, 5);
    const addons = (Array.isArray(body.addons) ? body.addons : []).map(Number).filter(function (i) { return i >= 0 && i < (kp.addons || []).length; });
    kp.status = 'accepted'; kp.acceptedAt = Date.now(); kp.acceptedAddons = addons;
    await K.save(kp);
    const sum = total(kp, addons);
    const extra = addons.map(function (i) { return '+ ' + esc(kp.addons[i].name); }).join('\n');
    await notify('🔥 <b>КП ПРИНЯТО</b>\n' + esc(kp.client.name || kp.client.company || '') + ' · ' + esc(kp.title) + '\nИтого: <b>' + fmt(sum, kp.currency) + '</b>' + (extra ? '\nДопы:\n' + extra : '') + '\n\nПервый платёж ' + (kp.schedule || [30])[0] + '%: ' + fmt(Math.round(sum * (kp.schedule || [30])[0] / 100), kp.currency) + (kp.payLinks && kp.payLinks[0] ? '' : '\n⚠️ Ссылка на оплату не добавлена, добавьте в форме.') + '\nОткрыть: ' + K.adminUrl(kp.id));
    return res.status(200).json({ ok: true });
  }

  if (body.action === 'save') {
    if (!admin) return res.status(401).json({ ok: false });
    const inKp = body.kp || {};
    const prev = inKp.id ? await K.load(inKp.id) : null;
    const base = prev || K.blank(inKp.lang);
    const keep = ['id', 'created', 'views', 'acceptedAt', 'acceptedAddons', 'source', 'status'];
    const kp = Object.assign({}, base, inKp);
    if (prev) keep.forEach(function (k) { if (prev[k] !== undefined) kp[k] = prev[k]; });
    if (!/^[a-z0-9]{6,16}$/.test(String(kp.id || ''))) kp.id = base.id;
    if (!['draft', 'sent', 'viewed', 'accepted'].includes(kp.status)) kp.status = 'draft';
    if (body.publish && kp.status === 'draft') kp.status = 'sent';
    await K.save(kp);
    return res.status(200).json({ ok: true, id: kp.id, url: K.publicUrl(kp.id), kp: kp });
  }
  return res.status(400).json({ ok: false });
};
