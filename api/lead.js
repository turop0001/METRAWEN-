// api/lead.js — приём заявок с сайта METRAWEN и уведомление в Telegram.
// Токен и chat_id берутся только из переменных окружения Vercel, в коде их нет.

const FORM_LABELS = {
  booking: 'Бронирование стратегической сессии',
  contact: 'Заявка на разбор',
  'digital-contact': 'Заявка на Digital-услуги'
};

const MAX_FIELD = 1500;

function esc(value) {
  return String(value == null ? '' : value)
    .slice(0, MAX_FIELD)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error('lead: TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы');
    return res.status(500).json({ ok: false, error: 'not_configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (err) { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  // honeypot: скрытое поле, которое заполняют только боты
  if (body.website) return res.status(200).json({ ok: true });

  const name = String(body.name || '').trim();
  const contact = String(body.contact || '').trim();
  if (!name && !contact) {
    return res.status(400).json({ ok: false, error: 'empty_submission' });
  }

  const formKey = String(body.form || 'contact');
  const label = FORM_LABELS[formKey] || formKey;

  const lines = [
    '<b>METRAWEN: новая заявка</b>',
    '',
    '<b>Форма:</b> ' + esc(label),
    name ? '<b>Имя:</b> ' + esc(name) : null,
    contact ? '<b>Контакт:</b> ' + esc(contact) : null,
    body.company ? '<b>Бизнес:</b> ' + esc(body.company) : null,
    body.industry ? '<b>Отрасль:</b> ' + esc(body.industry) : null,
    body.slot ? '<b>Выбранное время:</b> ' + esc(body.slot) : null,
    body.message ? '<b>Запрос:</b>\n' + esc(body.message) : null,
    '',
    '<b>Страница:</b> ' + esc(body.page || ''),
    body.utm ? '<b>UTM:</b> ' + esc(body.utm) : null,
    body.referrer ? '<b>Переход с:</b> ' + esc(body.referrer) : null,
    '<b>Время (UTC):</b> ' + new Date().toISOString().replace('T', ' ').slice(0, 19)
  ].filter(Boolean);

  try {
    const response = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('lead: Telegram ответил ошибкой', response.status, detail);
      return res.status(502).json({ ok: false, error: 'telegram_failed' });
    }
  } catch (err) {
    console.error('lead: запрос к Telegram не прошёл', err);
    return res.status(502).json({ ok: false, error: 'telegram_unreachable' });
  }

  return res.status(200).json({ ok: true });
};
