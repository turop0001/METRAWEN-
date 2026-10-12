// Автообработка отказов доставки («адрес не существует»): письмо от Mailer-Daemon превращается в пометку лида.
// Только жёсткие отказы (адреса нет). Временные сбои, полный ящик и отсрочки не трогаем.
const { saveJson, loadJson, enabled: storeEnabled } = require('./store');
const { report } = require('./alert');

const FROM_RE = /(mailer-daemon|postmaster)@/i;
const SUBJ_RE = /(delivery status notification \(failure\)|undeliver|mail delivery (failed|subsystem)|returned mail|delivery failure|address not found|не доставлен|недоступн)/i;
const DELAY_RE = /(delay|delayed|отсрочк|задерж)/i;
const HARD_RE = /(5\.1\.1|5\.1\.0|5\.4\.1|550[ -]5\.1|does not exist|doesn'?t exist|couldn'?t be found|could not be found|unknown user|no such user|user unknown|address not found|invalid recipient|recipient address rejected|no mailbox|не существует|не найден)/i;
const SOFT_RE = /(mailbox full|over quota|quota exceeded|try again later|temporar|переполнен)/i;

function isBounce(from, subject) {
  if (!FROM_RE.test(String(from || ''))) return false;
  const s = String(subject || '');
  return SUBJ_RE.test(s) && !(DELAY_RE.test(s) && !/failure/i.test(s));
}

function failedAddress(body, own) {
  const b = String(body || '');
  const pats = [
    /Final-Recipient:\s*rfc822;\s*([^\s<>;]+@[^\s<>;]+)/i,
    /wasn'?t delivered to\s+<?([^\s<>]+@[^\s<>]+)/i,
    /(?:to|для)\s+<?([^\s<>]+@[^\s<>]+)>?\s+(?:failed|because|не удалось)/i,
    /Original-Recipient:\s*rfc822;\s*([^\s<>;]+@[^\s<>;]+)/i
  ];
  for (const re of pats) {
    const m = b.match(re);
    if (m) return m[1].toLowerCase().replace(/[.,;:)]+$/, '');
  }
  const all = b.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  for (const a of all) {
    const x = a.toLowerCase();
    if (FROM_RE.test(x) || own.indexOf(x) >= 0 || /@(google|googlemail)\.com$/.test(x)) continue;
    return x;
  }
  return '';
}

// Возвращает {handled:true,...}, если письмо было отказом доставки (даже если пометить некого).
async function handle(b, ownBoxes) {
  const subject = String(b.subject || '');
  if (!isBounce(b.from, subject)) return null;
  const body = String(b.body || '');
  if (SOFT_RE.test(body) && !HARD_RE.test(body)) {
    try {
      const own0 = (ownBoxes || []).map(function (x) { return String(x).toLowerCase(); }).concat(['metrawen.team@gmail.com']);
      const a0 = failedAddress(body, own0);
      if (a0) { const hunter0 = require('./hunter'); await hunter0.mark(a0, 'ВРЕМЕННАЯ ОШИБКА ДОСТАВКИ (ящик получателя переполнен или недоступен, ' + hunter0.today() + '). Адрес пока не удалён.'); }
    } catch (e) { /* пометка не критична */ }
    return { handled: true, kind: 'soft' };
  }
  if (!HARD_RE.test(body) && !/failure/i.test(subject)) return { handled: true, kind: 'unknown' };
  const own = (ownBoxes || []).map(function (x) { return String(x).toLowerCase(); }).concat(['metrawen.team@gmail.com']);
  const addr = failedAddress(body, own);
  if (!addr || own.indexOf(addr) >= 0) return { handled: true, kind: 'noaddr' };
  if (storeEnabled()) {
    if (await loadJson('op:bad:' + addr)) return { handled: true, kind: 'dup', addr: addr };
    await saveJson('op:bad:' + addr, 1, 60 * 60 * 24 * 365);
  }
  let company = '', marked = false, dequeued = 0;
  try {
    const hunter = require('./hunter');
    const pg = await hunter.findByEmail(addr);
    if (pg) {
      company = hunter.prop(pg, 'Компания');
      const cur = hunter.prop(pg, 'Этап');
      const replied = /Ответ|Встреча|КП|Сделка|Отказ/.test(cur);
      const old = hunter.prop(pg, 'Заметки');
      const note = 'EMAIL НЕВАЛИДНЫЙ (bounce, адрес не существует, ' + hunter.today() + '). Не писать повторно.' + (old ? ' ' + old : '');
      const props = { 'Заметки': { rich_text: [{ type: 'text', text: { content: note.slice(0, 1900) } }] } };
      if (!replied) { props['Этап'] = { select: { name: 'Skip' } }; props['Скоринг'] = { select: { name: 'Skip' } }; }
      props['Следующее касание'] = { date: null };
      const known = await hunter.onlyKnown(props);
      await hunter.ncall('PATCH', '/pages/' + pg.id, { properties: known });
      marked = true;
    }
  } catch (e) { await report('Отказ доставки: Хантер', e, addr); }
  try {
    const key = require('./outreach').cfg('agency').key + ':queue';
    const q = (await loadJson(key)) || [];
    const nq = q.filter(function (x) { return String(x.to || '').toLowerCase() !== addr; });
    dequeued = q.length - nq.length;
    if (dequeued) await saveJson(key, nq, 60 * 60 * 24 * 30);
  } catch (e) { /* очередь не критична */ }
  try {
    const { tg } = require('./tg');
    await tg('sendMessage', {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: '📭 Адрес не существует: ' + addr + (company ? ' (' + company + ')' : '') + '\n' + (marked ? 'Лид в Hunter CRM помечен «email невалидный», этап Skip, повторы отключены.' : 'В Hunter CRM такого лида нет, адрес добавлен в чёрный список.') + (dequeued ? '\nУбрано из очереди рассылки: ' + dequeued + '.' : '')
    });
  } catch (e) { /* уведомление не критично */ }
  return { handled: true, kind: 'hard', addr: addr, marked: marked };
}

module.exports = { handle, isBounce, failedAddress };
