// Проверка сервера КП с AI-расчётом: `node test-aiquote-api.cjs` (без сети, хранилище и Telegram подменены).
process.env.TELEGRAM_BOT_TOKEN = 'test-token'; process.env.TELEGRAM_CHAT_ID = '1';
const path = require('path'), assert = require('assert');
const mem = {};
const stub = (rel, exp) => { const f = require.resolve(rel); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; };
stub('./api/_lib/store.js', { enabled: () => true, saveJson: async (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); }, loadJson: async (k) => (mem[k] === undefined ? null : JSON.parse(JSON.stringify(mem[k]))) });
const sent = []; stub('./api/_lib/tg.js', { tg: async (m, p) => { sent.push(p.text); return {}; } });
const K = require('./api/_lib/kp.js'); const handler = require('./api/kp.js');
const call = (method, o) => new Promise((resolve) => { const res = { h: {}, setHeader() {}, status(c) { this.c = c; return this; }, json(b) { resolve({ c: this.c, b }); } }; handler(Object.assign({ method, headers: {}, query: {} }, o), res); });
const admin = { 'x-kp-key': K.adminKey() };
(async () => {
  const today = new Date().toISOString().slice(0, 10);
  let r = await call('POST', { headers: admin, body: { action: 'save', publish: true, kp: { lang: 'ru', currency: 'USD', title: 'T', client: { name: 'Анна' }, quote: { product: 'pro', roles: ['hunter', 'sales'], answers: { channels: 2 }, auditPaidAt: today, price: 1, total: 1 } } } });
  assert.strictEqual(r.c, 200); const id = r.b.id; const kp = r.b.kp;
  assert.strictEqual(kp.quote.price, undefined, 'лишние поля отброшены');
  assert.strictEqual(kp.quoteSummary.total, 3000 + 150 - 199, 'итог при сохранении = конфиг');
  assert.deepStrictEqual(kp.schedule, [50, 50, 0]);
  // публичное чтение: конфиг без пометок о рынке, кредит рассчитан сервером
  r = await call('GET', { query: { id } });
  assert.strictEqual(r.c, 200); assert.strictEqual(r.b.quoteConfig.evidence, undefined); assert.strictEqual(r.b.kp.quote.auditCredit, true);
  // клиент пытается подсунуть свой чек-лист, цену и чужой продукт: берётся только то, что сохранил менеджер
  r = await call('POST', { body: { action: 'accept', id, quote: { product: 'starter', roles: ['hunter', 'sales', 'analyst'], answers: { channels: 3, actions: true, urgent: true }, total: 1, auditPaidAt: '2000-01-01' } } });
  assert.strictEqual(r.c, 200);
  const a = mem['kp:' + id];
  assert.strictEqual(a.quote.product, 'pro'); assert.strictEqual(a.quote.locked, true); assert.strictEqual(a.quote.auditPaidAt, today);
  assert.deepStrictEqual(a.quote.roles, ['hunter', 'sales']);
  // роли 1000+800, связка 1200, +150 канал, аудит -199
  assert.strictEqual(a.items.reduce((s, x) => s + x.price, 0), 3150 - 199); assert.strictEqual(a.quoteSummary.total, 2951);
  assert.ok(/Поддержка после запуска/.test(sent[sent.length - 1]));
  // принятое КП не пересчитывается и не принимается повторно
  r = await call('POST', { body: { action: 'accept', id, quote: { roles: ['hunter', 'sales'] } } }); assert.strictEqual(r.b.already, true);
  // невозможная конфигурация отклоняется, статус не меняется
  r = await call('POST', { headers: admin, body: { action: 'save', publish: true, kp: { lang: 'en', currency: 'RUB', title: 'T2', quote: { product: 'pro', roles: ['hunter'], answers: {} } } } });
  assert.strictEqual(r.c, 400);
  r = await call('POST', { headers: admin, body: { action: 'save', publish: true, kp: { lang: 'en', currency: 'RUB', title: 'T3', quote: { product: 'starter', roles: ['assistant'], answers: {}, auditPaidAt: '2020-01-01' } } } });
  assert.strictEqual(r.c, 200); assert.strictEqual(r.b.kp.quoteSummary.total, 82000, 'аудит старше 30 дней не засчитывается; рубли по курсу 82');
  r = await call('POST', { body: { action: 'accept', id: r.b.id } }); assert.strictEqual(r.c, 200);
  // клиент не может создать или править КП
  r = await call('POST', { body: { action: 'save', kp: { quote: { product: 'starter' } } } }); assert.strictEqual(r.c, 401);
  console.log('OK: проверки сервера КП пройдены');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
