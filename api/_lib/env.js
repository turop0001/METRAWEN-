// Чтение секретов из переменных окружения с защитой от типичных ошибок вставки в Vercel:
// пробелы и переносы внутри значения, кавычки, приставка «Bearer », «NAME=» перед значением, невидимые символы.
// Значения секретов нигде не выводятся: diag() возвращает только форму (длина, начало, наличие пробелов).
const SHAPES = {
  NOTION_TOKEN: /(?:ntn_|secret_)[A-Za-z0-9]+/,
  ANTHROPIC_API_KEY: /sk-ant-[A-Za-z0-9_-]+/,
  OPENAI_API_KEY: /sk-[A-Za-z0-9_-]+/
};

function raw(name) { return String(process.env[name] || ''); }

function secret(name) {
  let v = raw(name);
  if (SHAPES[name]) {
    const compact = v.replace(/\s+/g, '');
    const m = SHAPES[name].exec(compact);
    if (m) return m[0];
  }
  v = v.replace(/^[\s"']*(?:export\s+)?[A-Z][A-Z0-9_]*\s*=\s*/, '');
  v = v.replace(/bearer\s+/ig, '');
  return v.replace(/["'\s]/g, '').replace(/[^\x21-\x7E]/g, '');
}

function diag(name) {
  const v = raw(name);
  if (!v) return name + ': не задана';
  return name + ': длина ' + v.length + ', начало «' + v.trim().slice(0, 4) + '», пробелов/переносов внутри ' + (v.trim().match(/\s/g) || []).length + ', после очистки длина ' + secret(name).length;
}

module.exports = { secret, diag };
