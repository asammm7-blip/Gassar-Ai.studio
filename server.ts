import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type CloudProvider = 'gemini' | 'openai' | 'anthropic' | 'openrouter';

interface AttachmentInput {
  type: 'image' | 'file';
  name: string;
  mimeType: string;
  base64: string;
}

interface HistoryInput {
  role: 'user' | 'assistant';
  content: string;
  attachments?: AttachmentInput[];
}

interface GenerateBody {
  provider: CloudProvider;
  model: string;
  userMessage: string;
  systemPrompt?: string;
  history?: HistoryInput[];
  attachments?: AttachmentInput[];
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  thinking?: boolean;
}

const PROVIDER_LABELS: Record<CloudProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  openrouter: 'OpenRouter',
};

function getProviderKey(provider: CloudProvider): string {
  switch (provider) {
    case 'gemini':
      return (process.env.GEMINI_API_KEY || '').trim();
    case 'openai':
      return (process.env.OPENAI_API_KEY || '').trim();
    case 'anthropic':
      return (process.env.ANTHROPIC_API_KEY || '').trim();
    case 'openrouter':
      return (process.env.OPENROUTER_API_KEY || '').trim();
  }
}

function resolveGeminiModel(model: string): string {
  if (/^gemini-3\.8-flash|^gemini-3\.6-flash/i.test(model)) return 'gemini-2.5-flash';
  if (/^gemini-3\.5-flash-lite/i.test(model)) return 'gemini-2.5-flash-lite';
  if (/^gemini-3\.1-pro/i.test(model)) return 'gemini-2.5-pro';
  return model;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function flattenDuckTopics(topics: unknown[], output: Array<{ title: string; url: string; snippet: string }>) {
  for (const topic of topics) {
    if (!topic || typeof topic !== 'object') continue;
    const item = topic as { FirstURL?: unknown; Text?: unknown; Topics?: unknown };
    const url = cleanText(item.FirstURL);
    const text = cleanText(item.Text);
    if (url && text) {
      output.push({
        title: text.split(' - ')[0].slice(0, 180),
        url,
        snippet: text.slice(0, 900),
      });
    }
    if (Array.isArray(item.Topics)) flattenDuckTopics(item.Topics, output);
    if (output.length >= 5) return;
  }
}

async function generateWithGemini(apiKey: string, body: GenerateBody) {
  const ai = new GoogleGenAI({ apiKey });
  const targetModel = resolveGeminiModel(body.model || 'gemini-2.5-flash');
  const contents = [
    ...(body.history || []).map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [
        { text: msg.content },
        ...(msg.attachments || []).map((a) => ({
          inlineData: { mimeType: a.mimeType, data: a.base64 },
        })),
      ],
    })),
    {
      role: 'user',
      parts: [
        { text: body.userMessage },
        ...(body.attachments || []).map((a) => ({
          inlineData: { mimeType: a.mimeType, data: a.base64 },
        })),
      ],
    },
  ];

  const response = await ai.models.generateContent({
    model: targetModel,
    contents,
    config: {
      systemInstruction: body.systemPrompt || undefined,
      temperature: body.temperature ?? 0.7,
      topP: body.topP ?? 0.95,
      maxOutputTokens: body.maxOutputTokens ?? 2048,
      ...(body.thinking ? { thinkingConfig: { thinkingBudget: 2048 } } : {}),
    },
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  const textParts = parts
    .filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === 'string')
    .map((p: { text?: string }) => p.text || '')
    .join('')
    .trim();
  const reasoningParts = parts
    .filter((p: { thought?: boolean; text?: string }) => p.thought && typeof p.text === 'string')
    .map((p: { text?: string }) => p.text || '')
    .join('\n')
    .trim();

  const text = textParts || (response.text || '').trim();
  if (!text) {
    throw new Error('لم يرجع Gemini نصاً صالحاً');
  }
  return reasoningParts ? { text, reasoning: reasoningParts } : { text };
}

async function generateWithOpenAICompatible(
  apiKey: string,
  body: GenerateBody,
  endpoint: string,
  provider: 'openai' | 'openrouter',
) {
  const userContent = [
    { type: 'text', text: body.userMessage },
    ...(body.attachments || [])
      .filter((a) => a.type === 'image')
      .map((a) => ({ type: 'image_url', image_url: { url: `data:${a.mimeType};base64,${a.base64}` } })),
  ];
  const messages = [
    ...(body.systemPrompt ? [{ role: 'system', content: body.systemPrompt }] : []),
    ...(body.history || []).map((m) => ({
      role: m.role,
      content: m.attachments?.some((a) => a.type === 'image')
        ? [
            { type: 'text', text: m.content },
            ...m.attachments
              .filter((a) => a.type === 'image')
              .map((a) => ({ type: 'image_url', image_url: { url: `data:${a.mimeType};base64,${a.base64}` } })),
          ]
        : m.content,
    })),
    {
      role: 'user',
      content: body.attachments?.some((a) => a.type === 'image') ? userContent : body.userMessage,
    },
  ];

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://gassar.ai', 'X-Title': 'Gassar.AI' } : {}),
    },
    body: JSON.stringify({
      model: body.model,
      messages,
      temperature: body.temperature ?? 0.7,
      top_p: body.topP ?? 0.95,
      max_tokens: body.maxOutputTokens ?? 2048,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${PROVIDER_LABELS[provider]} (${response.status}): ${detail}`);
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string; reasoning_content?: string } }[];
  };
  const message = data.choices?.[0]?.message;
  const text = message?.content?.trim();
  if (!text) throw new Error(`لم يرجع ${PROVIDER_LABELS[provider]} نصاً صالحاً`);
  return message?.reasoning_content?.trim()
    ? { text, reasoning: message.reasoning_content.trim() }
    : { text };
}

async function generateWithAnthropic(apiKey: string, body: GenerateBody) {
  const userContent = [
    { type: 'text', text: body.userMessage },
    ...(body.attachments || [])
      .filter((a) => a.type === 'image')
      .map((a) => ({ type: 'image', source: { type: 'base64', media_type: a.mimeType, data: a.base64 } })),
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: body.model,
      system: body.systemPrompt || undefined,
      messages: [
        ...(body.history || []).map((m) => ({
          role: m.role,
          content: m.attachments?.some((a) => a.type === 'image')
            ? [
                { type: 'text', text: m.content },
                ...m.attachments
                  .filter((a) => a.type === 'image')
                  .map((a) => ({ type: 'image', source: { type: 'base64', media_type: a.mimeType, data: a.base64 } })),
              ]
            : m.content,
        })),
        {
          role: 'user',
          content: body.attachments?.some((a) => a.type === 'image') ? userContent : body.userMessage,
        },
      ],
      temperature: body.temperature ?? 0.7,
      top_p: body.topP ?? 0.95,
      max_tokens: body.maxOutputTokens ?? 2048,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Anthropic (${response.status}): ${detail}`);
  }
  const data = (await response.json()) as {
    content?: { type?: string; text?: string; thinking?: string }[];
  };
  const text = data.content?.filter((p) => p.type === 'text').map((p) => p.text || '').join('').trim();
  const reasoning = data.content
    ?.filter((p) => p.type === 'thinking')
    .map((p) => p.thinking || p.text || '')
    .join('\n')
    .trim();
  if (!text) throw new Error('لم يرجع Claude نصاً صالحاً');
  return reasoning ? { text, reasoning } : { text };
}

async function startServer() {
  const app = express();
  app.use('/assets', express.static(path.resolve(process.cwd(), 'assets')));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.get('/api/cloud/status', (_req, res) => {
    const providers: Record<CloudProvider, boolean> = {
      gemini: Boolean(getProviderKey('gemini')),
      openai: Boolean(getProviderKey('openai')),
      anthropic: Boolean(getProviderKey('anthropic')),
      openrouter: Boolean(getProviderKey('openrouter')),
    };
    res.json({ providers });
  });

  app.post('/api/cloud/test', async (req, res) => {
    const { provider, model } = (req.body || {}) as { provider?: CloudProvider; model?: string };
    if (!provider || !(provider in PROVIDER_LABELS)) {
      res.status(400).json({ ok: false, code: 'unknown', message: 'مزود خدمة غير معروف.' });
      return;
    }
    const apiKey = getProviderKey(provider);
    if (!apiKey) {
      res.json({
        ok: false,
        provider,
        model: model || '',
        code: 'missing_key',
        message: `لم يتم ضبط مفتاح ${PROVIDER_LABELS[provider]} في متغيرات البيئة على الخادم.`,
      });
      return;
    }

    try {
      if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const target = resolveGeminiModel(model || 'gemini-2.5-flash');
        await ai.models.get({ model: target });
        res.json({ ok: true, provider, model: target });
        return;
      }
      let url = '';
      let headers: Record<string, string> = {};
      if (provider === 'openai') {
        url = `https://api.openai.com/v1/models/${encodeURIComponent(model || 'gpt-4o-mini')}`;
        headers = { Authorization: `Bearer ${apiKey}` };
      } else if (provider === 'anthropic') {
        url = 'https://api.anthropic.com/v1/models';
        headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
      } else {
        url = 'https://openrouter.ai/api/v1/models';
        headers = { Authorization: `Bearer ${apiKey}` };
      }
      const response = await fetch(url, { headers });
      if (response.ok) {
        res.json({ ok: true, provider, model: model || '' });
        return;
      }
      const code = response.status === 401 ? 'invalid_key' : response.status === 403 ? 'forbidden' : 'unknown';
      res.json({
        ok: false,
        provider,
        model: model || '',
        code,
        status: response.status,
        message: `${PROVIDER_LABELS[provider]} رفض اختبار الاتصال (${response.status}).`,
      });
    } catch (error) {
      res.json({
        ok: false,
        provider,
        model: model || '',
        code: 'network',
        message: error instanceof Error ? error.message : 'تعذر الوصول إلى مزود الخدمة.',
      });
    }
  });

  app.post('/api/cloud/generate', async (req, res) => {
    const body = req.body as GenerateBody;
    if (!body?.provider || !(body.provider in PROVIDER_LABELS)) {
      res.status(400).json({ error: 'مزود السحابة غير صالح.' });
      return;
    }
    const apiKey = getProviderKey(body.provider);
    if (!apiKey) {
      res.status(400).json({
        error: `مفتاح ${PROVIDER_LABELS[body.provider]} غير مضبوط في بيئة الخادم (.env).`,
      });
      return;
    }
    try {
      let result: { text: string; reasoning?: string };
      if (body.provider === 'gemini') {
        result = await generateWithGemini(apiKey, body);
      } else if (body.provider === 'openai') {
        result = await generateWithOpenAICompatible(
          apiKey,
          body,
          'https://api.openai.com/v1/chat/completions',
          'openai',
        );
      } else if (body.provider === 'openrouter') {
        result = await generateWithOpenAICompatible(
          apiKey,
          body,
          'https://openrouter.ai/api/v1/chat/completions',
          'openrouter',
        );
      } else {
        result = await generateWithAnthropic(apiKey, body);
      }
      res.json(result);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'تعذر توليد الاستجابة من المزود السحابي.',
      });
    }
  });

  app.get('/api/web-search', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 500) : '';
    if (!query) {
      res.status(400).json({ error: 'لا يمكن إجراء بحث ويب دون سؤال واضح.' });
      return;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        { headers: { Accept: 'application/json' }, signal: controller.signal },
      );
      clearTimeout(timer);
      if (!response.ok) {
        res.status(502).json({ error: `فشل البحث الويب (${response.status})` });
        return;
      }
      const data = (await response.json()) as {
        AbstractText?: unknown;
        AbstractURL?: unknown;
        Heading?: unknown;
        RelatedTopics?: unknown;
      };
      const results: Array<{ title: string; url: string; snippet: string }> = [];
      const abstract = cleanText(data.AbstractText);
      const abstractUrl = cleanText(data.AbstractURL);
      if (abstract && abstractUrl) {
        results.push({
          title: cleanText(data.Heading) || 'ملخص البحث',
          url: abstractUrl,
          snippet: abstract.slice(0, 900),
        });
      }
      if (Array.isArray(data.RelatedTopics)) flattenDuckTopics(data.RelatedTopics, results);
      res.json({ results: results.slice(0, 5) });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'تعذر تنفيذ البحث الويب.',
      });
    }
  });

  app.get('/api/local-server/status', (_req, res) => {
    res.json({
      mode: 'web',
      nativeInferenceAvailable: false,
      endpoints: {
        health: '/api/health',
        cloudStatus: '/api/cloud/status',
        cloudGenerate: '/api/cloud/generate',
        webSearch: '/api/web-search',
      },
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'client');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const cliPortArg = (() => {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === '--port' && args[i + 1]) return args[i + 1];
      if (args[i].startsWith('--port=')) return args[i].slice('--port='.length);
    }
    return undefined;
  })();

  const envPort =
    process.env.NODE_ENV === 'production'
      ? process.env.PORT
      : process.env.PORT && process.env.PORT !== process.env.NGINX_PORT
        ? process.env.PORT
        : process.env.DEFAULT_APP_PORT;

  const port = Number(cliPortArg || envPort || 3000);
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Gassar.AI server running at http://0.0.0.0:${port}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start Gassar.AI server:', err);
  process.exit(1);
});
