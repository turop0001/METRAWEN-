// Ручные касания для лидов без email (Instagram, WhatsApp, телефон, LINE, LinkedIn, сообщества и каталоги).
// Автоматически писать в соцсети нельзя (баны), поэтому бот присылает пачку карточек: кому, где, готовый текст
// (нажатие на блок копирует его) и кнопки «Отправил» / «Пропустить» / «Не подходит». Этап в Notion ставит бот.
const llm = require('./llm');
const shop = require('./shop');
const hunter = require('./hunter');
const { report, stat, esc } = require('./alert');

const prop = hunter.prop;
const BAD = /\[[^\]]{1,60}\]|\{\{|\}\}|<link>|your-link|example\.com|ссылка здесь|I won'?t (write|email)/i;
const RU_COUNTRIES = /Россия|СНГ/;

function digits(s) { return String(s || '').replace(/[^\d]/g, ''); }

// Ссылка, где писать: из «Другие контакты» / «Сайт / источник», для WhatsApp и телефона — wa.me.
function whereLink(pg, channel) {
  const other = prop(pg, 'Другие контакты') + ' ' + prop(pg, 'Сайт / источник') + ' ' + prop(pg, 'Ссылка');
  const urls = other.match(/https?:\/\/[^\s,;]+/g) || [];
  const pick = function (re) { return urls.find(function (u) { return re.test(u); }) || ''; };
  if (channel === 'Instagram') return pick(/instagram\.com/i) || (other.match(/@([a-z0-9._]{3,30})/i) ? 'https://instagram.com/' + other.match(/@([a-z0-9._]{3,30})/i)[1] : '');
  if (channel === 'LinkedIn') return pick(/linkedin\.com/i);
  if (channel === 'LINE') return pick(/line\.me/i);
  if (channel === 'Telegram') return pick(/t\.me\//i) || (other.match(/@([a-z0-9_]{4,32})/i) ? 'https://t.me/' + other.match(/@([a-z0-9_]{4,32})/i)[1] : '');
  if (channel === 'WhatsApp' || channel === 'Телефон') {
    const d = digits(prop(pg, 'Публичный телефон')) || digits((other.match(/wa\.me\/(\d+)/) || [])[1]);
    return d.length >= 8 ? 'https://wa.me/' + d : '';
  }
  return urls[0] || '';
}

const DM_PROMPT = `You turn a draft into a short first DIRECT MESSAGE from METRAWEN, a small team that builds websites, booking and order bots, AI assistants and simple dashboards for small businesses. Output ONE JSON {"body":"..."}.
Rules: language = draft language (or Russian for Russia/CIS, otherwise English if no draft). 2-4 short sentences, chat style, no greeting line like "Dear", no signature. Team voice ("we"/"мы"), never "I". Mention the specific thing we noticed about their business, one concrete idea, then one soft question. NO links, NO prices, no placeholders in square brackets.`;

async function ensureClean(text, pg, signal) {
  const t = String(text || '').trim();
  if (t && !BAD.test(t) && !/https?:\/\//.test(t)) return t;
  if (!llm.enabled()) throw new Error('черновик с плейсхолдером, а ключа модели нет');
  const out = await llm.complete(DM_PROMPT, '<draft>\n' + t + '\n</draft>\nBusiness: ' + prop(pg, 'Компания') + '\nIndustry: ' + prop(pg, 'Отрасль') + '\nCountry: ' + prop(pg, 'Страна') + '\nSignal: ' + signal, 400);
  const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  const body = String(j.body || '').trim();
  if (!body || BAD.test(body) || /https?:\/\//.test(body)) throw new Error('dm guard');
  return body;
}

// ---------- агентство ----------
async function agencyPack(n, seg) {
  const f = [
    { property: 'Публичный email', email: { is_empty: true } },
    { or: ['Instagram', 'WhatsApp', 'Телефон', 'LINE', 'LinkedIn', 'Telegram'].map(function (c) { return { property: 'Канал контакта', select: { equals: c } }; }) },
    { or: [{ property: 'Этап', select: { equals: 'Черновик готов' } }, { property: 'Этап', select: { equals: 'Готово к отправке' } }] },
    { property: 'Скоринг', select: { does_not_equal: 'Skip' } }
  ];
  if (seg) f.push({ property: 'Отрасль', select: { equals: seg } });
  const j = await hunter.ncall('POST', '/databases/' + hunter.DB() + '/query', { filter: { and: f }, page_size: Math.min(n * 2, 40), sorts: [{ property: 'Скоринг', direction: 'ascending' }] });
  const cards = [];
  for (const pg of (j.results || [])) {
    if (cards.length >= n) break;
    const ch = prop(pg, 'Канал контакта');
    try {
      const body = await ensureClean(prop(pg, 'Черновик сообщения A'), pg, prop(pg, 'Найденный сигнал'));
      cards.push({ b: 'a', id: pg.id.replace(/-/g, ''), name: prop(pg, 'Компания'), channel: ch, where: whereLink(pg, ch), phone: prop(pg, 'Публичный телефон'),
        meta: [prop(pg, 'Отрасль'), prop(pg, 'Город') || prop(pg, 'Страна'), prop(pg, 'Скоринг')].filter(Boolean).join(' · '),
        signal: prop(pg, 'Найденный сигнал'), body: body, lang: RU_COUNTRIES.test(prop(pg, 'Страна')) ? 'ru' : 'en' });
    } catch (e) { console.error('dm: карточка пропущена', e); }
  }
  return cards;
}

// ---------- магазин: посты, комментарии, каталоги, модераторы ----------
async function shopPack(n, seg) {
  const f = [
    { or: ['Пост', 'Комментарий-ответ', 'Сабмит в каталог', 'Запрос модератору'].map(function (x) { return { property: 'Формат', select: { equals: x } }; }) },
    { property: 'Этап', select: { equals: 'Ждёт выставления товара' } }
  ];
  if (seg) f.push({ property: 'Продукт', multi_select: { contains: seg } });
  const j = await shop.ncall('POST', '/databases/' + shop.HUNTER_DB() + '/query', { filter: { and: f }, page_size: Math.min(n * 3, 60), sorts: [{ property: 'Скоринг', direction: 'ascending' }] });
  let items = [];
  try { items = await shop.loadCatalog(); } catch (e) { await report('Каталог товаров не загрузился', e); }
  const cards = [];
  for (const pg of (j.results || [])) {
    if (cards.length >= n) break;
    // ссылка на товар только из каталога; товара без ссылки нет — карточку не даём (нечего публиковать)
    const lang = prop(pg, 'Язык') === 'RU' ? 'ru' : 'en';
    const nums = (prop(pg, 'Продукт').match(/#(\d+)/g) || []).map(function (x) { return Number(x.slice(1)); });
    const it = items.find(function (x) { return nums.indexOf(x.n) >= 0 && x.ready; });
    const link = it ? (lang === 'ru' ? (it.tribute || it.lava) : (it.gumroad || it.etsy)) : '';
    if (!link) continue;
    const draft = prop(pg, 'Черновик A');
    if (!draft || BAD.test(draft)) continue; // такие черновики сначала чистит /cleandrafts
    cards.push({ b: 's', id: pg.id.replace(/-/g, ''), name: prop(pg, 'Название'), channel: prop(pg, 'Канал') + ' · ' + prop(pg, 'Формат'), where: prop(pg, 'Ссылка'),
      meta: [prop(pg, 'Продукт'), prop(pg, 'Регион'), prop(pg, 'Скоринг')].filter(Boolean).join(' · '),
      rules: prop(pg, 'Правила самопромо'), title: prop(pg, 'Заголовок'), body: draft, link: link, lang: lang });
  }
  return cards;
}

function cardText(c, i, total) {
  return [
    (i + 1) + '/' + total + ' · <b>' + esc(c.name) + '</b>',
    '<b>Где:</b> ' + esc(c.channel) + (c.where ? ' · ' + esc(c.where) : (c.phone ? ' · ' + esc(c.phone) : ' · ссылки нет, найдите вручную')),
    c.meta ? esc(c.meta) : null,
    c.signal ? '<b>Сигнал:</b> ' + esc(String(c.signal).slice(0, 300)) : null,
    c.rules ? '<b>Правила площадки:</b> ' + esc(String(c.rules).slice(0, 300)) : null,
    c.title ? '<b>Заголовок:</b> ' + esc(c.title) : null,
    c.link ? '<b>Ссылка на товар (вставить, если правила разрешают):</b> ' + esc(c.link) : null,
    '<b>Текст</b> (нажмите, чтобы скопировать):',
    '<pre>' + esc(String(c.body).slice(0, 3000)) + '</pre>'
  ].filter(function (x) { return x !== null; }).join('\n');
}

function cardKeyboard(c) {
  return { inline_keyboard: [[
    { text: '✅ Отправил', callback_data: 'dm:s:' + c.b + ':' + c.id },
    { text: 'Позже', callback_data: 'dm:k:' + c.b + ':' + c.id },
    { text: 'Не подходит', callback_data: 'dm:x:' + c.b + ':' + c.id }
  ]] };
}

async function sendPack(chatId, brand, n, seg) {
  const { tg } = require('./tg');
  const cards = brand === 'shop' ? await shopPack(n, seg) : await agencyPack(n, seg);
  for (let i = 0; i < cards.length; i++) {
    await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', disable_web_page_preview: true, text: cardText(cards[i], i, cards.length), reply_markup: cardKeyboard(cards[i]) });
  }
  return cards.length;
}

function uuid(id) { return id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'); }

// Кнопки под карточкой. act: s — отправил, k — позже (ничего не меняем), x — не подходит.
async function action(act, b, id) {
  const pageId = uuid(id);
  if (act === 'k') return 'Оставил на потом';
  if (b === 'a') {
    const pg = await hunter.ncall('GET', '/pages/' + pageId);
    if (act === 'x') { await hunter.advance(pg, 'Отказ', { 'Скоринг': { select: { name: 'Skip' } } }, 'Пропущен вручную из пачки DM'); return 'Отмечен: не подходит'; }
    const n = (pg.properties['Касаний'] && pg.properties['Касаний'].number) || 0;
    const ch = prop(pg, 'Канал контакта');
    await hunter.advance(pg, 'Отправлено', {
      'Касаний': { number: n + 1 },
      'Отправлено': { date: { start: hunter.today() } },
      'Ящик': { select: { name: ch === 'Instagram' ? 'Instagram DM' : ch || 'DM' } },
      'Следующее касание': { date: { start: hunter.plusDays(4) } }
    }, 'Первое касание отправлено вручную (' + ch + ')');
    await stat('sent:agency_dm');
    return 'Этап «Отправлено», повтор через 4 дня';
  }
  const pg = await shop.ncall('GET', '/pages/' + pageId);
  if (act === 'x') { await shop.ncall('PATCH', '/pages/' + pageId, { properties: { 'Этап': { select: { name: 'Skip' } } } }); return 'Отмечен: Skip'; }
  const n = (pg.properties['Касаний'] && pg.properties['Касаний'].number) || 0;
  await shop.ncall('PATCH', '/pages/' + pageId, { properties: {
    'Этап': { select: { name: 'Опубликовано/Отправлено' } },
    'Касаний': { number: n + 1 },
    'Дата публикации': { date: { start: hunter.today() } }
  } });
  await stat('sent:shop_post');
  return 'Этап «Опубликовано/Отправлено»';
}

module.exports = { sendPack, action, whereLink, agencyPack, shopPack, cardText };
