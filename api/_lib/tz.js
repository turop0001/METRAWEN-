// Часовые пояса получателей: холодные письма уходят только в будни с 9:00 до 18:00 по местному времени страны лида.
// Время для владельца показываем по Таиланду (Asia/Bangkok, GMT+7).
const MAP = [
  [/индонез|indonesia|бали|bali|jakarta/i, 'Asia/Makassar'],
  [/таиланд|thailand|пхукет|phuket|бангкок/i, 'Asia/Bangkok'],
  [/вьетнам|vietnam/i, 'Asia/Ho_Chi_Minh'],
  [/малайзи|malaysia/i, 'Asia/Kuala_Lumpur'],
  [/сингапур|singapore/i, 'Asia/Singapore'],
  [/филиппин|philippines/i, 'Asia/Manila'],
  [/япони|japan/i, 'Asia/Tokyo'],
  [/корея|korea/i, 'Asia/Seoul'],
  [/китай|china/i, 'Asia/Shanghai'],
  [/гонконг|hong kong/i, 'Asia/Hong_Kong'],
  [/инди[яи]|india/i, 'Asia/Kolkata'],
  [/оаэ|эмират|uae|emirates|dubai|дубай/i, 'Asia/Dubai'],
  [/израил|israel/i, 'Asia/Jerusalem'],
  [/турци|turkey|türkiye/i, 'Europe/Istanbul'],
  [/казахстан|kazakhstan/i, 'Asia/Almaty'],
  [/грузи|georgia/i, 'Asia/Tbilisi'],
  [/армени|armenia/i, 'Asia/Yerevan'],
  [/украин|ukraine/i, 'Europe/Kyiv'],
  [/беларус|belarus/i, 'Europe/Minsk'],
  [/росси|russia|снг/i, 'Europe/Moscow'],
  [/великобритан|англи|uk\b|united kingdom|england|scotland|шотланд/i, 'Europe/London'],
  [/ирланд|ireland/i, 'Europe/Dublin'],
  [/португал|portugal/i, 'Europe/Lisbon'],
  [/испани|spain/i, 'Europe/Madrid'],
  [/франци|france/i, 'Europe/Paris'],
  [/германи|germany|австри|austria|швейцар|switzerland/i, 'Europe/Berlin'],
  [/итали|italy|мальта|malta/i, 'Europe/Rome'],
  [/нидерланд|netherlands|голланд|бельги|belgium/i, 'Europe/Amsterdam'],
  [/польш|poland|чехи|czech|венгри|hungary|хорват|croatia/i, 'Europe/Warsaw'],
  [/швеци|sweden|норвег|norway|дани[яи]|denmark/i, 'Europe/Stockholm'],
  [/финлянд|finland|эстони|estonia|латви|latvia|литв|lithuania|греци|greece|кипр|cyprus|румын|romania|болгар|bulgaria/i, 'Europe/Athens'],
  [/австрали|australia/i, 'Australia/Sydney'],
  [/зеланд|zealand/i, 'Pacific/Auckland'],
  [/канад|canada/i, 'America/Toronto'],
  [/мексик|mexico/i, 'America/Mexico_City'],
  [/бразил|brazil/i, 'America/Sao_Paulo'],
  [/юар|south africa/i, 'Africa/Johannesburg'],
  [/сша|usa|united states|america|u\.s\./i, 'America/New_York']
];

function zone(country, lang) {
  const s = String(country || '');
  for (let i = 0; i < MAP.length; i++) if (MAP[i][0].test(s)) return { tz: MAP[i][1], guess: false };
  return { tz: lang === 'ru' ? 'Europe/Moscow' : 'America/New_York', guess: true };
}

const fmtCache = {};
function parts(tz, ts) {
  const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }));
  const o = {};
  f.formatToParts(new Date(ts)).forEach(function (p) { o[p.type] = p.value; });
  return { wd: o.weekday, h: parseInt(o.hour, 10) };
}

// Окно отправки: пн–пт, 9:00–17:59 по местному времени получателя.
function isOpen(tz, ts) {
  const p = parts(tz, ts == null ? Date.now() : ts);
  return p.wd !== 'Sat' && p.wd !== 'Sun' && p.h >= 9 && p.h < 18;
}

// Ближайший момент (мс), когда окно открыто, не позже чем через 8 суток.
function nextOpen(tz, ts) {
  let t = ts == null ? Date.now() : ts;
  if (isOpen(tz, t)) return t;
  t = Math.ceil(t / 900000) * 900000;
  for (let i = 0; i < 8 * 96; i++, t += 900000) if (isOpen(tz, t)) return t;
  return t;
}

function bangkok(ts) {
  const d = new Date(ts + 7 * 3600 * 1000);
  const wd = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getUTCDay()];
  const p = function (n) { return (n < 10 ? '0' : '') + n; };
  return wd + ' ' + p(d.getUTCDate()) + '.' + p(d.getUTCMonth() + 1) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}

module.exports = { zone, isOpen, nextOpen, bangkok };
