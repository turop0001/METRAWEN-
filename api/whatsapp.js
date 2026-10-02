// api/whatsapp.js: webhook WhatsApp Cloud API. Принимает сообщения клиентов и передаёт их Sell Manager.
// Sell Manager присылает Дмитрию черновик в Telegram. Клиенту ничего не уходит без нажатия «Подтвердить».
const wa = require('./_lib/whatsapp');
const { handleNewLead } = require('./_lib/sellmanager');
const { tg } = require('./_lib/tg');
const { saveJson, loadJson, enabled: storeEnabled } = require('./_lib/store');

function readRaw(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

async function processMessage(m, names) {
  const from = m.from;
  const text = m.text && m.text.body;
  if (!from || m.type !== 'text' || !text) return;
  // Защита от потока сообщений: не чаще одного черновика в 8 секунд от одного номера.
  if (storeEnabled()) {
    const key = 'wa:rl:' + from;
    if (await loadJson(key)) return;
    await saveJson(key, 1, 8);
  }
  const name = names[from] || '';
  await handleNewLead({
    label: 'WhatsApp',
    channel: 'whatsapp',
    waId: from,
    name: name,
    contact: 'WhatsApp: +' + from + (name ? ' (' + name + ')' : ''),
    message: String(text).slice(0, 2000)
  });
}

async function handler(req, res) {
  // Проверка адреса при подключении webhook в Meta
  if (req.method === 'GET') {
    const q = req.query || {};
    const expected = String(process.env.WHATSAPP_VERIFY_TOKEN || '').replace(/[^\x21-\x7E]/g, '');
    if (expected && q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === expected) {
      return res.status(200).send(String(q['hub.challenge'] || ''));
    }
    return res.status(403).send('forbidden');
  }
  if (req.method !== 'POST') return res.status(200).send('ok');

  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return res.status(500).json({ ok: false });
  const raw = await readRaw(req);
  if (!wa.verify(secret, raw, req.headers['x-hub-signature-256'])) {
    return res.status(401).json({ ok: false });
  }
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch (e) { return res.status(400).json({ ok: false }); }

  const jobs = [];
  (body.entry || []).forEach(function (en) {
    (en.changes || []).forEach(function (ch) {
      const v = ch.value || {};
      const names = {};
      (v.contacts || []).forEach(function (c) { if (c.wa_id) names[c.wa_id] = (c.profile && c.profile.name) || ''; });
      (v.statuses || []).forEach(function (st) {
        if (st.status !== 'failed') return;
        const er = (st.errors && st.errors[0]) || {};
        const msg = 'WhatsApp НЕ ДОСТАВИЛ сообщение клиенту +' + (st.recipient_id || '?') + '\nКод ' + (er.code || '?') + ': ' + String(er.title || '') + ' ' + String((er.error_data && er.error_data.details) || er.message || '').slice(0, 300);
        jobs.push(tg('sendMessage', { chat_id: process.env.TELEGRAM_CHAT_ID, text: msg }).catch(function (e) { console.error('whatsapp: статус не отправлен', e); }));
      });
      (v.messages || []).forEach(function (m) {
        jobs.push(processMessage(m, names).catch(function (e) { console.error('whatsapp: сообщение не обработано', e); }));
      });
    });
  });
  const job = Promise.all(jobs);

  let bg = null;
  if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
    try { bg = require('@vercel/functions').waitUntil; } catch (e) { bg = null; }
  }
  if (bg) { bg(job); } else { await job; }
  return res.status(200).json({ ok: true });
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
