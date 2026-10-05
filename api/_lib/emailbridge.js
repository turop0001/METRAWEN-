// Почтовый мост: Google Apps Script в ящике metrawen.team передаёт входящие письма в /api/email,
// а ответы клиентам Sell Manager отправляет обратно через тот же скрипт (с нужного адреса компании).
const crypto = require('crypto');
const { saveJson, loadJson, enabled: storeEnabled } = require('./store');

function pre(scope) { return scope === 'shop' ? 'email:shop:' : scope === 'agency' ? 'email:agency:' : 'email:'; }

function secret() {
  return String(process.env.EMAIL_BRIDGE_SECRET || '').trim();
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (!x.length || x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function sha(v) {
  return crypto.createHash('sha256').update(String(v || '')).digest('hex');
}

// Ключ моста: либо EMAIL_BRIDGE_SECRET из Vercel, либо ключ, который владелец подтвердил кнопкой в Telegram.
// Возвращает '' (нет доступа), 'main' (ящик компании), 'shop' (ящик цифровых товаров) или 'agency' (холодная почта агентства).
async function authorized(req) {
  const h = req.headers['x-email-secret'] || '';
  if (!h) return '';
  const s = secret();
  if (s && safeEqual(h, s)) return 'main';
  if (!storeEnabled()) return '';
  const k = await loadJson('email:key');
  if (k && k.hash && safeEqual(sha(h), k.hash)) return 'main';
  const ks = await loadJson('email:shop:key');
  if (ks && ks.hash && safeEqual(sha(h), ks.hash)) return 'shop';
  const ka = await loadJson('email:agency:key');
  if (ka && ka.hash && safeEqual(sha(h), ka.hash)) return 'agency';
  return '';
}

// Для исходящих запросов к скрипту используем хэш ключа: скрипт сверяет его со своим.
async function keyHash(scope) {
  const s = secret();
  if (s && (!scope || scope === 'main')) return sha(s);
  if (!storeEnabled()) return '';
  const k = await loadJson(pre(scope) + 'key');
  return (k && k.hash) || '';
}

async function hasKey(scope) {
  if ((!scope || scope === 'main') && secret()) return true;
  if (!storeEnabled()) return false;
  return !!(await loadJson(pre(scope) + 'key'));
}

// Первое подключение: скрипт присылает свой ключ, владелец подтверждает кнопкой в Telegram.
async function register(key, url, scope) {
  const P = pre(scope);
  const shop = scope === 'shop';
  const agency = scope === 'agency';
  if (!storeEnabled()) throw new Error('store off');
  if (String(key || '').length < 32) throw new Error('weak key');
  if (await loadJson(P + 'reg:rl')) return false;
  await saveJson(P + 'reg:rl', 1, 60);
  await saveJson(P + 'pending', { hash: sha(key), url: /^https:\/\/script\.google\.com\//.test(url || '') ? url : '' }, 60 * 60);
  const { tg } = require('./tg');
  await tg('sendMessage', {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text: agency
      ? '🏢 <b>Подключение холодной почты агентства METRAWEN</b>\nСкрипт в отдельном ящике для холодных писем просит доступ: ответы лидов из Hunter CRM будут приходить сюда черновиками (Елена / Nicole), рассылка пойдёт по графику прогрева только после «Одобрить пачку».\nЕсли это вы, нажмите «Подключить».'
      : shop
      ? '🛍 <b>Подключение почты METRAWEN Shop (цифровые товары)</b>\nСкрипт в ящике metrawen.shop просит доступ: письма с getmetrawen.com и площадок будут приходить сюда черновиками (Алина / Emma), а подтверждённые ответы уйдут клиентам с нужного адреса.\nЕсли это вы, нажмите «Подключить».'
      : '📧 <b>Подключение почты к Sell Manager</b>\nСкрипт в ящике metrawen.team просит доступ: письма с sales@, support@, info@, help@ будут приходить сюда черновиками, а подтверждённые ответы уйдут клиентам с нужного адреса.\nЕсли это вы, нажмите «Подключить».',
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: 'Подключить', callback_data: 'em:ok' + (shop ? ':shop' : agency ? ':agency' : '') }, { text: 'Отклонить', callback_data: 'em:no' + (shop ? ':shop' : agency ? ':agency' : '') }]] }
  });
  return true;
}

async function approve(scope) {
  const P = pre(scope);
  const p = await loadJson(P + 'pending');
  if (!p || !p.hash) return false;
  await saveJson(P + 'key', { hash: p.hash, ts: Date.now() }, 60 * 60 * 24 * 365 * 5);
  if (p.url) await saveJson(P + 'bridge', { url: p.url, ts: Date.now() }, 60 * 60 * 24 * 90);
  await saveJson(P + 'pending', null, 1);
  return true;
}

async function reject(scope) {
  await saveJson(pre(scope) + 'pending', null, 1);
}

async function bridgeUrl(scope) {
  if ((!scope || scope === 'main') && process.env.EMAIL_SEND_URL) return process.env.EMAIL_SEND_URL;
  if (!storeEnabled()) return '';
  const b = await loadJson(pre(scope) + 'bridge');
  return (b && b.url) || '';
}

async function rememberBridge(url, scope) {
  if (!url || !storeEnabled() || !/^https:\/\/script\.google\.com\//.test(url)) return;
  const cur = await loadJson(pre(scope) + 'bridge');
  if (!cur || cur.url !== url) await saveJson(pre(scope) + 'bridge', { url: url, ts: Date.now() }, 60 * 60 * 24 * 90);
}

function personaName(lead, body) {
  const ru = /[а-яё]/i.test(String(body || ''));
  if (lead.brand === 'shop') return (ru ? 'Алина' : 'Emma') + ' | METRAWEN Shop';
  return (ru ? 'Елена' : 'Nicole') + ' | METRAWEN';
}

// Отправка ответа клиенту через Apps Script.
async function send(lead, subject, body) {
  const url = await bridgeUrl(lead.emailScope);
  if (!url) throw new Error('почтовый мост ещё не подключён');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify({
      secretHash: await keyHash(lead.emailScope),
      action: 'reply',
      threadId: lead.emailThread || '',
      to: lead.emailAddr,
      from: lead.emailTo || '',
      subject: subject,
      body: body,
      // кто отвечает: имя отправителя и подпись зависят от ветки (студия или магазин)
      brand: lead.brand === 'shop' ? 'shop' : 'agency',
      name: personaName(lead, body)
    })
  });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch (e) { /* ничего */ }
  if (!r.ok || !j || !j.ok) throw new Error('мост ответил: ' + String((j && j.error) || text).slice(0, 160));
  return j;
}

module.exports = { authorized, hasKey, register, approve, reject, rememberBridge, send, secret };
