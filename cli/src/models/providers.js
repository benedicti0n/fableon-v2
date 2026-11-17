// Provider registry: base URLs, auth headers and OpenAI-compatible chat paths. Keys are read from env only.
export const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    keyEnv: 'DEEPSEEK_API_KEY',
    chatPath: '/chat/completions',
    modelsPath: '/models',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    headers: { 'HTTP-Referer': 'https://fableon.local', 'X-Title': 'Fableon' },
    // Ask OpenRouter to route only to providers that do not store/train on the request.
    providerPreferences: { data_collection: 'deny' },
  },
  sarvam: {
    label: 'Sarvam',
    baseUrl: 'https://api.sarvam.ai',
    keyEnv: 'SARVAM_API_KEY',
    chatPath: '/v1/chat/completions',
    modelsPath: null,
    models: ['sarvam-105b', 'sarvam-105b-conversations'],
    auth: 'api-subscription-key',
  },
  'openai-compatible': { label: 'OpenAI-compatible', baseUrl: '', keyEnv: null, chatPath: '/chat/completions', modelsPath: '/models' },
  mock: { label: 'Mock', baseUrl: '', keyEnv: '', chatPath: '', modelsPath: null },
};

export const providerInfo = (provider) => PROVIDERS[provider] ?? null;
export const providerKeyEnv = (provider) => PROVIDERS[provider]?.keyEnv ?? null;
export const providerBase = (provider) => PROVIDERS[provider]?.baseUrl ?? '';
