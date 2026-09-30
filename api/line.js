// api/line.js: webhook LINE Official Account. Принимает сообщения клиентов и передаёт их Sell Manager.
// Sell Manager присылает Дмитрию черновик в Telegram. Клиенту ничего не уходит без нажатия «Подтвердить».
const line = require('./_lib/line');
const { handleNewLead } = require('./_lib/sellmanager');
const { saveJson, loadJson, enabled: storeEnabled } = require('./_lib/store');

function readRaw(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

async function processEvent(ev) {
  const userId = ev.source && ev.source.userId;
  const text = ev.message && ev.message.text;
  if (!userId || !text) return;
  // Защита от потока сообщений: не чаще одного черновика в 8 секунд от одного человека.
  if (storeEnabled()) {
    const key = 'line:rl:' + userId;
    if (await loadJson(key)) return;
    await saveJson(key, 1, 8);
  }
  const p = await line.profile(userId);
  const name = p && p.displayName ? p.displayName : '';
  await handleNewLead({
    label: 'LINE',
    channel: 'line',
    lineUserId: userId,
    name: name,
    contact: 'LINE: ' + (name || userId.slice(0, 8)),
    message: text
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok');
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return res.status(500).json({ ok: false });

  const raw = await readRaw(req);
  if (!line.verify(secret, raw, req.headers['x-line-signature'])) {
    return res.status(401).json({ ok: false });
  }
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch (e) { return res.status(400).json({ ok: false }); }

  const events = (body.events || []).filter(function (ev) {
    return ev.type === 'message' && ev.message && ev.message.type === 'text' &&
      ev.source && ev.source.type === 'user' &&
      !(ev.deliveryContext && ev.deliveryContext.isRedelivery);
  });
  const job = Promise.all(events.map(function (ev) {
    return processEvent(ev).catch(function (e) { console.error('line: событие не обработано', e); });
  }));

  let bg = null;
  if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
    try { bg = require('@vercel/functions').waitUntil; } catch (e) { bg = null; }
  }
  if (bg) { bg(job); } else { await job; }
  return res.status(200).json({ ok: true });
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
