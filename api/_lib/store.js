// Мини-клиент Upstash Redis (REST). Работает без зависимостей.
// Переменные подставляет интеграция Upstash в Vercel (KV_REST_API_* или UPSTASH_REDIS_REST_*).
function cfg() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function cmd(args) {
  const c = cfg();
  if (!c) return null;
  const r = await fetch(c.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  const j = await r.json();
  return j.result;
}

async function saveJson(key, value, ttlSeconds) {
  return cmd(['SET', key, JSON.stringify(value), 'EX', String(ttlSeconds || 60 * 60 * 24 * 30)]);
}

async function loadJson(key) {
  const v = await cmd(['GET', key]);
  if (!v) return null;
  try { return JSON.parse(v); } catch (e) { return null; }
}

module.exports = { saveJson, loadJson, enabled: () => !!cfg() };
