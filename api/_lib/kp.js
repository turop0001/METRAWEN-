// Коммерческие предложения (КП): хранение, ключ доступа, черновик от Sell Manager.
const crypto = require('crypto');
const { saveJson, loadJson } = require('./store');
const { ITEMS, RATE } = require('./catalog');
const llm = require('./llm');

const SITE = 'https://metrawen.com';
const TTL = 60 * 60 * 24 * 180;

function adminKey() {
  return crypto.createHash('sha256').update('metrawen-kp:' + String(process.env.TELEGRAM_BOT_TOKEN || '')).digest('hex').slice(0, 24);
}
function checkKey(k) {
  const a = Buffer.from(String(k || '')); const b = Buffer.from(adminKey());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function newId() { return crypto.randomBytes(8).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase(); }
function adminUrl(id) { return SITE + '/kp-admin.html' + (id ? '?id=' + id : '') + '#k=' + adminKey(); }
function publicUrl(id) { return SITE + '/p/' + id; }

async function load(id) { if (!/^[a-z0-9]{6,16}$/.test(String(id || ''))) return null; return loadJson('kp:' + id); }
async function save(kp) {
  kp.updated = Date.now();
  await saveJson('kp:' + kp.id, kp, TTL);
  const idx = (await loadJson('kp:index')) || [];
  const row = { id: kp.id, client: (kp.client && (kp.client.name || kp.client.company)) || '', title: kp.title || '', status: kp.status, updated: kp.updated };
  const next = [row].concat(idx.filter(function (r) { return r.id !== kp.id; })).slice(0, 100);
  await saveJson('kp:index', next, TTL);
  return kp;
}

function price(item, cur) { return cur === 'RUB' ? item.rub : Math.round(item.rub / RATE / 5) * 5; }
function fromCatalog(id, lang, cur, desc) {
  const it = ITEMS.find(function (x) { return x.id === id; });
  if (!it) return null;
  const t = it[lang] || it.ru;
  return { name: t.nm, desc: desc || t.sol, price: price(it, cur), days: it.days, ref: it.id };
}

function blank(lang) {
  const ru = lang !== 'en';
  const d = new Date(Date.now() + 14 * 864e5);
  return {
    id: newId(), status: 'draft', lang: ru ? 'ru' : 'en', currency: ru ? 'RUB' : 'USD',
    manager: ru ? 'Елена' : 'Nicole',
    client: { name: '', company: '' }, title: '', situation: '', solution: '', result: '',
    items: [], addons: [], schedule: [30, 40, 30], payLinks: ['', '', ''], paid: [false, false, false],
    validUntil: d.toISOString().slice(0, 10), demo: { title: '', url: '' }, notes: '',
    created: Date.now(), views: 0
  };
}

const KP_SYSTEM = `You prepare a commercial proposal draft for METRAWEN from a sales conversation. Output ONE JSON object only:
{"title":"short proposal title","situation":"2-3 sentences: the client's business and the problem in their words","solution":"2-4 sentences: what we will build and how it solves it","result":"2-3 sentences: what changes for the client, no invented numbers or guarantees","items":[{"id":"catalog id","desc":"one line tailored to this client"}],"addons":[{"id":"catalog id","desc":"one line why it may help"}],"demo":"one demo url from the list or empty"}
Use only catalog ids from the list. Items are what the client clearly needs (usually 1-3). Addons are 1-3 sensible optional extras. Write in the conversation language. Never invent facts, cases or statistics.
Demo urls: booking bot SITE/demo/fitness-bot.html, cafe/order bot SITE/demo/cafe-bot.html, school bot SITE/demo/school-bot.html, landing SITE/demo/lume-landing.html, expert landing SITE/demo/expert-landing.html, realty landing SITE/demo/realty-landing.html, marketplace dashboard SITE/demo/marketplace-dashboard.html (for Russian use SITE/ru/demo/...). SITE=${SITE}`;

async function draftFromConversation(lead, lang) {
  const cat = ITEMS.map(function (x) { return x.id + ': ' + x.ru.nm + ' / ' + x.en.nm; }).join('\n');
  const text = 'Catalog:\n' + cat + '\n\nConversation:\n' + String(lead.history || '') + '\nClient: ' + String(lead.message || '') + '\n\nClient name: ' + String(lead.name || '');
  const out = await llm.complete(KP_SYSTEM, text, 1200);
  const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  const kp = blank(lang);
  kp.client.name = String(lead.name || '').slice(0, 80);
  const em = String(lead.emailAddr || '') || (String(lead.contact || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i) || [''])[0];
  if (em) kp.client.email = em.toLowerCase();
  if (lead.company) kp.client.company = String(lead.company).slice(0, 80);
  kp.title = String(j.title || '').slice(0, 140);
  kp.situation = String(j.situation || ''); kp.solution = String(j.solution || ''); kp.result = String(j.result || '');
  kp.items = (j.items || []).map(function (x) { return fromCatalog(x.id, kp.lang, kp.currency, x.desc); }).filter(Boolean);
  kp.addons = (j.addons || []).map(function (x) { return fromCatalog(x.id, kp.lang, kp.currency, x.desc); }).filter(Boolean);
  if (j.demo && /^https:\/\/metrawen\.com\//.test(j.demo)) kp.demo = { title: kp.lang === 'ru' ? 'Пример похожего проекта' : 'A similar sample project', url: j.demo };
  kp.source = { channel: lead.channel || 'site', contact: lead.contact || '' };
  return save(kp);
}

module.exports = { adminKey, checkKey, adminUrl, publicUrl, load, save, blank, draftFromConversation, ITEMS, RATE, price };
