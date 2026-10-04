// Единая точка вызова модели. Провайдер выбирается переменными окружения, код менять не нужно.
//
//  Claude:   ANTHROPIC_API_KEY  (модель: ANTHROPIC_MODEL, по умолчанию claude-sonnet-5-5)
//  OpenAI:   OPENAI_API_KEY     (модель: OPENAI_MODEL, по умолчанию gpt-4o-mini)
//  Любой OpenAI-совместимый сервис (Gemini, DeepSeek, Groq, локальный Ollama и т.д.):
//            OPENAI_API_KEY + OPENAI_BASE_URL + OPENAI_MODEL
//  Если ключей несколько, LLM_PROVIDER=anthropic|openai выбирает нужный.
//  Ключей нет: работает режим по шаблонам (без ИИ, бесплатно).

const env = require('./env');

function provider() {
  const want = (process.env.LLM_PROVIDER || '').toLowerCase();
  if (want === 'openai' && env.secret('OPENAI_API_KEY')) return 'openai';
  if (want === 'anthropic' && env.secret('ANTHROPIC_API_KEY')) return 'anthropic';
  if (env.secret('ANTHROPIC_API_KEY')) return 'anthropic';
  if (env.secret('OPENAI_API_KEY')) return 'openai';
  return null;
}

async function complete(system, user, maxTokens) {
  const p = provider();
  if (!p) throw new Error('ключ модели не задан');
  if (p === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.secret('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: maxTokens || 900,
        system: system,
        messages: [{ role: 'user', content: user }]
      })
    });
    const raw = await r.text();
    if (!r.ok) throw new Error('anthropic ' + r.status + ' ' + raw.slice(0, 300) + (r.status === 401 ? ' [' + env.diag('ANTHROPIC_API_KEY') + ']' : ''));
    return (JSON.parse(raw).content || []).map(b => b.text || '').join('');
  }
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.secret('OPENAI_API_KEY'), 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens: maxTokens || 900,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    })
  });
  const raw = await r.text();
  if (!r.ok) throw new Error('openai ' + r.status + ' ' + raw.slice(0, 300));
  const j = JSON.parse(raw);
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}

module.exports = { complete, provider, enabled: () => !!provider() };
