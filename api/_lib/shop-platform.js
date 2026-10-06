// Площадки METRAWEN Shop: где продаётся товар, по какой цене и как понять, с какой площадки пишет клиент.
// Единственный источник цен для бота. Notion даёт состав и ссылки, цены по площадкам и фазам берём отсюда.
// Правка цен: меняйте таблицы ниже и пушьте в main. Формат: [стартовая, обычная, до какой даты действует старт (YYYY-MM-DD) или null].
// null в третьей позиции значит «старт держится, пока не поменяем вручную» (условие «до первых отзывов/продаж»).

const NAMES = { gumroad: 'Gumroad', etsy: 'Etsy', lava: 'Lava', tribute: 'Tribute' };
const CUR = { gumroad: 'USD', etsy: 'EUR', lava: 'RUB', tribute: 'RUB' };

// Gumroad, доллары. Сверено с живыми страницами 2026-10-06: везде действует стартовая цена (первое число).
const GUM = {
  1: [29, 39, null], 2: [15, 19, null], 3: [19, 29, null], 5: [29, 39, null], 6: [15, 19, null], 7: [12, 15, null], 8: [12, 17, null],
  9: [19, 24, '2026-10-19'], 10: [14, 19, '2026-10-19'], 11: [9, 12, '2026-10-19'], 12: [11, 15, '2026-10-19'], 13: [17, 24, '2026-10-19'],
  14: [14, 19, '2026-10-19'], 15: [14, 19, null], 16: [14, 19, null], 17: [35, 49, '2026-10-12'], 19: [19, 29, null], 20: [19, 29, null],
  21: [12, 15, '2026-10-19'], 22: [14, 19, '2026-10-19'], 23: [19, 29, null], 24: [12, 17, '2026-10-19'], 25: [17, 24, null], 26: [19, 29, null]
};

// Etsy, евро. Сверено с живыми страницами листингов 2026-10-06 (цена в метаданных страницы, базовая валюта EUR).
// Обычную цену знаем только для №2 и №3; после конца старта для остальных бот цену не назовёт («цена на странице листинга»).
// №19: ссылка Etsy ведёт на листинг №13, поэтому товар отключён в DISABLED до исправления ссылки.
const ETSY = {
  1: [27, null, null], 2: [14, 17, null], 3: [18, 27, null], 6: [14, null, null], 7: [11, null, null], 8: [11, null, null], 9: [18, null, null],
  10: [13, null, null], 12: [10, null, null], 13: [16, null, null], 14: [13, null, null], 17: [33, null, null], 20: [18, null, null]
};

// Lava и Tribute, рубли (цена на обеих одинаковая). Lava сверена по живым страницам 2026-10-06 (все совпали, №5 без старта, №9 1490, №10 стартовая 690). Tribute закрыт для ботов (robots.txt), не сверялась.
const RUB = {
  1: [1990, 2990, null], 2: [990, 1290, null], 3: [1290, 1990, null], 4: [690, 990, null], 5: [null, 1990, null], 7: [null, 790, null],
  8: [null, 990, null], 9: [null, 1490, null], 10: [690, 990, '2026-10-19'], 11: [490, 790, '2026-10-19'], 12: [490, 690, '2026-10-19'], 13: [990, 1490, '2026-10-19'],
  15: [790, 990, null], 16: [790, 990, null], 17: [1490, 1990, '2026-10-12'], 18: [990, 1490, null], 19: [990, 1490, null], 20: [990, 1490, null],
  21: [690, 990, '2026-10-19'], 22: [990, 1490, '2026-10-19'], 23: [990, 1490, null], 24: [690, 990, '2026-10-19'],
  27: [790, 990, null], 28: [990, 1190, null], 29: [390, 490, null], 30: [990, 1290, null], 31: [790, 990, null], 32: [490, 590, null],
  33: [290, 390, null], 34: [490, 590, null]
};

const TABLE = { gumroad: GUM, etsy: ETSY, lava: RUB, tribute: RUB };

// Листинги, которых больше нет на площадке (даже если ссылка осталась в Notion).
// №11: листинг на Etsy удалён. №19: ссылки Etsy и Lava показывают страницу №13 (проверено 2026-10-06), пока не исправят, ссылки не даём.
const DISABLED = { 11: ['etsy'], 19: ['etsy', 'lava'] };

function today(now) { return (now ? new Date(now) : new Date()).toISOString().slice(0, 10); }

// Текущая цена товара на площадке: { value, cur, phase: 'launch'|'regular', regular, until } или null, если цена не задана.
function priceNow(n, platform, now) {
  const row = (TABLE[platform] || {})[n];
  if (!row) return null;
  const launch = row[0], regular = row[1], until = row[2];
  const active = launch != null && (!until || today(now) <= until);
  const value = active ? launch : regular;
  if (value == null) return null;
  return { value: value, cur: CUR[platform], phase: active ? 'launch' : 'regular', regular: regular, until: until };
}

function money(cur, v) {
  return cur === 'USD' ? '$' + v : cur === 'EUR' ? v + ' EUR' : v + ' ₽';
}

function liveOn(it, platform) {
  if ((DISABLED[it.n] || []).indexOf(platform) >= 0) return false;
  return !!it[platform];
}

// ---------- определение площадки ----------
const SENDER = [
  [/@([a-z0-9.-]+\.)?etsy\.com$/i, 'etsy'],
  [/@([a-z0-9.-]+\.)?gumroad\.com$/i, 'gumroad'],
  [/@([a-z0-9.-]+\.)?lava\.top$/i, 'lava'],
  [/@([a-z0-9.-]+\.)?tribute\.(tg|to)$/i, 'tribute']
];
const WORDS = [
  [/etsy\.com|\betsy\b|этси|этс[иы]\b/i, 'etsy'],
  [/gumroad\.com|\bgumroad\b|гумроад|гамроад|гумрод/i, 'gumroad'],
  [/lava\.top|\blava\b|\bлав[аеуы]\b|лава\.топ/i, 'lava'],
  [/tribute\.tg|t\.me\/tribute|\btribute\b|трибьют|трибут/i, 'tribute']
];

function senderPlatform(addr) {
  for (let i = 0; i < SENDER.length; i++) if (SENDER[i][0].test(String(addr || ''))) return SENDER[i][1];
  return '';
}

function norm(u) { return String(u || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase(); }

// Возвращает { platform, source, n } ; platform '' = неизвестна.
// opts: { addr, text, items, memory (платформа из прошлого письма диалога), hunter (лид Хантера: true/false), lang }
function detect(opts) {
  const o = opts || {};
  const sp = senderPlatform(o.addr);
  if (sp) return { platform: sp, source: 'sender' };
  const text = String(o.text || '').slice(0, 3000);
  // ссылка на конкретный листинг из каталога: и площадка, и товар
  const urls = (text.match(/https?:\/\/[^\s)>\]"']+/g) || []).map(norm);
  const items = o.items || [];
  for (let i = 0; i < urls.length; i++) {
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      for (const p of Object.keys(NAMES)) if (it[p] && norm(it[p]) === urls[i]) return { platform: p, source: 'link', n: it.n };
    }
  }
  const found = {};
  WORDS.forEach(function (w) { if (w[0].test(text)) found[w[1]] = 1; });
  const keys = Object.keys(found);
  if (keys.length === 1) return { platform: keys[0], source: 'text' };
  if (o.memory && NAMES[o.memory]) return { platform: o.memory, source: 'memory' };
  if (o.hunter) return { platform: o.lang === 'ru' ? 'tribute' : 'gumroad', source: 'hunter' };
  return { platform: '', source: keys.length > 1 ? 'ambiguous' : 'none' };
}

function label(d) {
  if (!d || !d.platform) return 'неизвестна' + (d && d.source === 'ambiguous' ? ' (в письме названо несколько площадок)' : '');
  const how = { sender: 'по отправителю', link: 'по ссылке в письме', text: 'по тексту письма', memory: 'из прошлого письма диалога', hunter: 'клиент из рассылки Хантера' }[d.source] || '';
  return NAMES[d.platform] + (how ? ' (' + how + ')' : '');
}

// ---------- каталог для промпта ----------
function catalogLines(items, platform, lang, cards, now) {
  const base = items.filter(function (it) { return it.ready; });
  if (!platform) {
    // площадка неизвестна: состав и форматы известны, цены и ссылок нет
    return base.filter(function (it) { return lang === 'ru' ? true : (!it.lang.length || it.lang.indexOf('EN') >= 0); }).map(function (it) {
      const where = Object.keys(NAMES).filter(function (p) { return liveOn(it, p); }).map(function (p) { return NAMES[p]; });
      return '#' + it.n + ' ' + it.title + ' | SOLD ON: ' + (where.length ? where.join(', ') : 'nowhere yet') + ' | NO PRICE, NO LINK until the store is known' + (cards[it.n] ? ' | INFO: ' + cards[it.n] : '');
    }).join('\n');
  }
  return base.filter(function (it) { return liveOn(it, platform); }).map(function (it) {
    const pr = priceNow(it.n, platform, now);
    let priceTxt;
    if (!pr) priceTxt = 'PRICE: not set here, do not name a number, say the price is on the listing page';
    else priceTxt = 'PRICE NOW: ' + money(pr.cur, pr.value) + (pr.phase === 'launch' ? ' (launch price' + (pr.until ? ' until ' + pr.until : '') + (pr.regular != null ? '; regular price later: ' + money(pr.cur, pr.regular) : '') + ')' : '');
    return '#' + it.n + ' ' + it.title + ' | ' + priceTxt + ' | LINK: ' + it[platform] + (cards[it.n] ? ' | INFO: ' + cards[it.n] : '');
  }).join('\n');
}

// Текст правил площадки для системного промпта.
function platformRules(platform, source) {
  if (!platform) {
    return 'STORE OF THIS CONVERSATION: UNKNOWN' + (source === 'ambiguous' ? ' (the message names several stores)' : '') + '.\n' +
      '- Our products are sold in separate stores (Gumroad, Etsy, Lava, Tribute) and the price and the link differ by store. Without knowing the store you must not give any price, any link or any currency amount.\n' +
      '- Answer the question about the product itself from INFO (what is inside, formats, who it is for), briefly. Then ask ONE short question: which store the person is looking at (name the stores shown in SOLD ON for that product). Say you will send the exact price and link as soon as they tell you. Never guess the store from the language.\n' +
      '- If the question is only about price or "where to buy", skip the product details and ask the store question right away. Set intent accordingly and escalate=false.';
  }
  const nm = NAMES[platform];
  const base = 'STORE OF THIS CONVERSATION: ' + nm + ' (' + CUR[platform] + ').\n' +
    '- Use only the PRICE NOW and LINK shown in the catalog lines for ' + nm + '. Never quote a price in another currency, never give a link of another store, never compare with other stores.\n' +
    '- If a product is not in the list below, it is not sold on ' + nm + ': say so in one sentence and set escalate=true with the product name in reason.\n' +
    '- Give the price as written (for example the PRICE NOW figure), without converting. Mention the regular price only if the person asks whether the price will change, and never create urgency or deadlines beyond what the line says.\n' +
    '- If the line says the price is not set here, do not name a number: say the current price is shown on the listing page.\n';
  if (platform === 'etsy') {
    return base + '- Etsy rules: do not mention or hint at other stores, websites or ways to buy outside Etsy, and do not ask for an email address or messenger. If the person says it is cheaper elsewhere or asks why the euro price is higher, answer calmly: the price on Etsy is the one shown in the listing, prices are set separately per store and currency, and we do not change a price in messages. No discounts, no coupons, no workarounds.';
  }
  return base;
}

// Проверка черновика: цены и ссылки только своей площадки. Возвращает строку с проблемой или ''.
const AMOUNT = /(\$\s?(\d[\d,.]*))|((\d[\d\s.,]*)\s?(₽|руб\.?|руб\b|rub\b|eur\b|€|usd\b|\$|долл))|(€\s?(\d[\d,.]*))/gi;
function amounts(body) {
  const out = [];
  let m;
  const re = new RegExp(AMOUNT.source, 'gi');
  while ((m = re.exec(String(body || '')))) {
    let num, cur;
    if (m[1]) { num = m[2]; cur = 'USD'; }
    else if (m[3]) {
      num = m[4];
      const c = String(m[5]).toLowerCase();
      cur = /₽|руб|rub/.test(c) ? 'RUB' : /eur|€/.test(c) ? 'EUR' : 'USD';
    } else { num = m[7]; cur = 'EUR'; }
    const v = parseFloat(String(num).replace(/\s/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
    if (!isNaN(v)) out.push({ v: v, cur: cur });
  }
  return out;
}

function checkPlatform(body, items, platform, now) {
  const b = String(body || '');
  const urls = b.match(/https?:\/\/[^\s)>\]"']+/g) || [];
  const am = amounts(b);
  // все цены, которые вообще существуют в таблицах (чтобы не путать с «2,4 млн ₽» из описания)
  const known = {};
  Object.keys(TABLE).forEach(function (p) {
    Object.keys(TABLE[p]).forEach(function (n) { TABLE[p][n].slice(0, 2).forEach(function (v) { if (v != null) known[CUR[p] + ':' + v] = 1; }); });
  });
  if (!platform) {
    for (let i = 0; i < am.length; i++) if (known[am[i].cur + ':' + am[i].v]) return 'названа цена, пока площадка клиента неизвестна: ' + am[i].v + ' ' + am[i].cur;
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i].replace(/[.,;:!?]+$/, '');
      if (!/^https:\/\/getmetrawen\.com/i.test(u)) return 'дана ссылка, пока площадка клиента неизвестна: ' + u;
    }
    return '';
  }
  const allowed = {};
  items.forEach(function (it) {
    if (!liveOn(it, platform)) return;
    const row = (TABLE[platform] || {})[it.n];
    if (row) row.slice(0, 2).forEach(function (v) { if (v != null) allowed[v] = 1; });
  });
  for (let i = 0; i < am.length; i++) {
    const a = am[i];
    if (!known[a.cur + ':' + a.v]) continue;
    if (a.cur !== CUR[platform]) return 'цена в чужой валюте для ' + NAMES[platform] + ': ' + a.v + ' ' + a.cur;
    if (!allowed[a.v]) return 'цена не совпадает с ценой на ' + NAMES[platform] + ': ' + a.v + ' ' + a.cur;
  }
  const mine = {};
  items.forEach(function (it) { if (liveOn(it, platform)) mine[norm(it[platform])] = 1; });
  for (let i = 0; i < urls.length; i++) {
    const u = norm(urls[i].replace(/[.,;:!?]+$/, ''));
    if (mine[u] || /^https:\/\/getmetrawen\.com/i.test(u)) continue;
    return 'ссылка не со страницы ' + NAMES[platform] + ': ' + u;
  }
  if (platform === 'etsy') {
    const other = /gumroad|lava\.top|tribute|getmetrawen|metrawen\.shop|@/i.exec(b);
    if (other) return 'в ответе на Etsy упомянуто внешнее (' + other[0] + ')';
  }
  return '';
}

module.exports = { NAMES, CUR, TABLE, DISABLED, priceNow, money, liveOn, senderPlatform, detect, label, catalogLines, platformRules, checkPlatform, amounts };
