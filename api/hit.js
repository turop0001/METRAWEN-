// Счётчик посещений сайта без cookies и персональных данных: считаем просмотры, уникальных посетителей
// (случайный идентификатор из браузера, хранится только как ключ на 2 суток) и страницы. Данные видны в боте: «Кабинет».
const { incr, once, saveJson, loadJson, enabled } = require('./_lib/store');

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|headless|lighthouse|pingdom|uptime|curl|wget|python|node-fetch|go-http/i;
function day() { return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); }
async function bump(key, name) {
  const m = (await loadJson(key)) || {};
  if (!(name in m) && Object.keys(m).length >= 40) name = 'другое';
  m[name] = (m[name] || 0) + 1;
  await saveJson(key, m, 60 * 60 * 24 * 35);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ua = String(req.headers['user-agent'] || '');
    const q = req.query || {};
    const v = String(q.v || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
    if (!enabled() || !v || v.length < 8 || BOT.test(ua)) return res.status(204).end();
    const d = day();
    let p = String(q.p || '/').split('?')[0].slice(0, 80).replace(/[^\w\/.\-]/g, '');
    if (!p) p = '/';
    const ttl = 60 * 60 * 24 * 35;
    await incr('hit:v:' + d, ttl);
    if (await once('hit:uv:' + d + ':' + v, 60 * 60 * 24 * 2)) await incr('hit:u:' + d, ttl);
    await bump('hit:pp:' + d, p);
    let r = String(q.r || '').toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9.\-]/g, '').slice(0, 40);
    if (r && r !== 'metrawen.com') await bump('hit:rf:' + d, r);
  } catch (e) { console.error('hit', e); }
  return res.status(204).end();
};
