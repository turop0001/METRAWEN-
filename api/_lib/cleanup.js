// Чистка черновиков в Хантере магазина: [FEATURES], [GUMROAD_LINK], [SENDER ADDRESS], подпись «METRAWEN»,
// «I won't email again», голос «я». Исходный текст сохраняется в теле карточки, поле «Черновик A» заменяется чистым.
// Запуск: /cleandrafts в Telegram. Дальше чистка идёт сама небольшими порциями (каждый тик по 4 карточки) до конца.
const llm = require('./llm');
const shop = require('./shop');
const { loadJson, saveJson } = require('./store');
const { report } = require('./alert');
const prop = require('./hunter').prop;

const BAD = /\[[^\]]{1,60}\]|\{\{|I won'?t (write|email)|\n\s*(Thanks,?\s*\n\s*)?METRAWEN\s*$/i;

const PROMPT = `You clean a marketing draft for METRAWEN Shop (a small team selling ready-made digital templates and tools). Output ONE JSON {"text":"..."}.
Keep the same language, format, structure, length and the specific personal details. Remove every placeholder in square brackets ([FEATURES], [GUMROAD_LINK], [SENDER ADDRESS] etc.): if a placeholder stood for a link, rephrase so no link is needed (for an email end with a soft question like "Want me to send you the link?" / "Прислать ссылку?"; for a post or comment simply drop it, the link is added separately when publishing); if it stood for a feature list, write one short plain sentence from the product description already in the draft or drop it. Team voice: "we"/"мы", never "I". For an email: no signature, no sign-off name, no "reply no and I won't write" line (the mailbox adds the signature and opt-out). Do not add prices, numbers or claims that are not in the draft. No links at all.`;

async function batch(n) {
  const skip = (await loadJson('clean:skip')) || [];
  const j = await shop.ncall('POST', '/databases/' + shop.HUNTER_DB() + '/query', {
    filter: { or: [
      { property: 'Черновик A', rich_text: { contains: '[' } },
      { property: 'Черновик A', rich_text: { contains: "I won't" } },
      { property: 'Черновик A', rich_text: { contains: 'I wont' } }
    ] },
    page_size: Math.min(n + skip.length, 100)
  });
  const rows = (j.results || []).filter(function (pg) { return skip.indexOf(pg.id) < 0; }).slice(0, n);
  let ok = 0;
  for (const pg of rows) {
    const draft = prop(pg, 'Черновик A');
    try {
      const out = await llm.complete(PROMPT, 'Format: ' + prop(pg, 'Формат') + '\n<draft>\n' + draft + '\n</draft>', 900);
      const t = String(JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)).text || '').trim();
      if (!t || /\[[^\]]{1,60}\]|https?:\/\//.test(t)) throw new Error('cleanup guard');
      // сначала сохраняем исходник в теле карточки, потом заменяем поле
      await shop.ncall('PATCH', '/blocks/' + pg.id + '/children', { children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: ('Исходный черновик A (до чистки):\n' + draft).slice(0, 1990) } }] } }] });
      const chunks = [];
      for (let i = 0; i < t.length && chunks.length < 10; i += 1900) chunks.push({ type: 'text', text: { content: t.slice(i, i + 1900) } });
      await shop.ncall('PATCH', '/pages/' + pg.id, { properties: { 'Черновик A': { rich_text: chunks } } });
      ok++;
    } catch (e) {
      // карточку, которую не удалось почистить, откладываем, чтобы не крутить её бесконечно (поправить вручную)
      skip.push(pg.id);
      await saveJson('clean:skip', skip.slice(-90), 60 * 60 * 24 * 7);
      await report('Чистка черновиков', e, prop(pg, 'Название'));
    }
  }
  return { done: ok, seen: rows.length, skipped: skip.length };
}

async function start() { await saveJson('clean:on', { ts: Date.now(), done: 0 }, 60 * 60 * 24 * 3); }

// Вызывается из тика. Возвращает текст для Telegram, когда чистка закончена.
async function step() {
  const st = await loadJson('clean:on');
  if (!st || !llm.enabled()) return '';
  const r = await batch(4);
  st.done += r.done;
  if (!r.seen) { await saveJson('clean:on', null, 1); const sk = (await loadJson('clean:skip')) || [];
    return '🧹 Чистка черновиков Хантера магазина закончена: исправлено ' + st.done + ' карточек. Исходники сохранены в теле каждой карточки.' + (sk.length ? ' Не получилось у ' + sk.length + ' карточек: поправьте их вручную (поиск по «[» в «Черновик A»).' : ''); }
  await saveJson('clean:on', st, 60 * 60 * 24 * 3);
  return '';
}

module.exports = { batch, start, step, BAD };
