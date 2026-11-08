// Общий выключатель холодной рассылки и всего, что тратит ключ модели ради неё
// (автопачка, черновики из Notion, повторные письма, выдача очереди мосту).
// По умолчанию рассылка ВЫКЛЮЧЕНА. Включить: переменная окружения OUTREACH_PAUSED=0 в Vercel (проект metrawen), затем Redeploy.
module.exports = { paused: function () { return process.env.OUTREACH_PAUSED !== '0'; } };
