// Двойная запись: после каждого изменения лида в Notion (Hunter CRM) его текущее состояние уходит в METRAWEN OS.
// Нужны переменные: OS_INGEST_TOKEN (ключ приёмника в OS) и, при желании, OS_URL (по умолчанию https://os.metrawen.com).
// Без токена модуль молча ничего не делает. Сбой OS никогда не ломает основную работу: Notion остаётся главным.
const { row } = require('./hunter-export');

function tokenOf() { return String(process.env.OS_INGEST_TOKEN || '').replace(/[^\x21-\x7E]/g, ''); }
function baseUrl() { return String(process.env.OS_URL || 'https://os.metrawen.com').replace(/[^\x21-\x7E]/g, '').replace(/\/+$/, ''); }

async function push(pageId, note) {
  const token = tokenOf();
  if (!token || !pageId) return false;
  const ctl = new AbortController();
  const t = setTimeout(function () { ctl.abort(); }, 8000);
  try {
    const pg = await require('./hunter').ncall('GET', '/pages/' + pageId);
    const r = await fetch(baseUrl() + '/api/admin/hunter-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ingest-token': token },
      body: JSON.stringify({ row: row(pg), note: note ? String(note).slice(0, 1900) : undefined }),
      signal: ctl.signal
    });
    if (!r.ok) throw new Error('OS ' + r.status + ' ' + String(await r.text().catch(function () { return ''; })).slice(0, 160));
    return true;
  } catch (e) {
    try { await require('./alert').report('Двойная запись в OS', e, String(pageId)); } catch (x) { /* не критично */ }
    return false;
  } finally { clearTimeout(t); }
}

module.exports = { push };
