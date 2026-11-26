import 'dotenv/config';
import express from 'express';
import dns from 'node:dns/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import {
  classifyCloudApiError,
  extractReadableTextFromHtml,
  isBlockedIpAddress,
  parseDuckDuckGoHtmlResults,
  resolveGeminiTargetModel,
  validateExternalHttpUrl,
  type ParsedWebResult,
} from './src/web/server-helpers';

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
  topK?: number;
  maxOutputTokens?: number;
  thinking?: boolean;
  webSearch?: boolean;
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

function createGeminiClient(apiKey: string) {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function flattenDuckTopics(topics: unknown[], output: ParsedWebResult[]) {
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

async function resolveSafePublicUrl(rawUrl: string): Promise<URL> {
  const parsed = validateExternalHttpUrl(rawUrl);
  const resolved = await dns.lookup(parsed.hostname, { all: true });
  if (!resolved.length || resolved.some((entry) => isBlockedIpAddress(entry.address))) {
    throw new Error('لا يمكن الاتصال بهذا العنوان لأسباب تتعلق بسلامة الشبكة.');
  }
  return parsed;
}

async function fetchExternalUrlText(rawUrl: string): Promise<{ url: string; title: string; text: string }> {
  let currentUrl = await resolveSafePublicUrl(rawUrl);
  let response: Response | null = null;

  for (let hop = 0; hop < 3; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'GassarAI-Fetcher/1.0',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
        },
      });
      clearTimeout(timer);

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new Error('إعادة توجيه غير مكتملة.');
        currentUrl = await resolveSafePublicUrl(new URL(location, currentUrl).toString());
        continue;
      }
      response = res;
      break;
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
  }

  if (!response || !response.ok) {
    throw new Error(`تعذر جلب الصفحة (${response?.status ?? 'redirect-limit'}).`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/') && !contentType.includes('html') && !contentType.includes('json') && !contentType.includes('xml')) {
    throw new Error(`نوع محتوى الرابط غير نصي (${contentType || 'غير معروف'}).`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const raw = (await response.text()).slice(0, 1024 * 1024);
    const extracted = contentType.includes('html') ? extractReadableTextFromHtml(raw) : { title: currentUrl.hostname, text: raw.slice(0, 15000) };
    return { url: currentUrl.toString(), ...extracted };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const maxBytes = 1024 * 1024;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        chunks.push(value.slice(0, value.byteLength - (total - maxBytes)));
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
    }
  }

  const rawText = Buffer.concat(chunks).toString('utf8');
  const extracted = contentType.includes('html')
    ? extractReadableTextFromHtml(rawText)
    : { title: currentUrl.hostname, text: rawText.slice(0, 15000) };

  if (!extracted.text.trim()) {
    throw new Error('الصفحة لا تحتوي على نص مقروء.');
  }
  return { url: currentUrl.toString(), ...extracted };
}

async function extractPdfTextServer(buffer: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  const pages: string[] = [];
  const total = Math.min(doc.numPages, 120);
  for (let i = 1; i <= total; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line) pages.push(`--- صفحة ${i} ---\n${line}`);
  }
  await (doc as unknown as { destroy?: () => Promise<void>; cleanup?: () => Promise<void> }).destroy?.();
  const output = pages.join('\n\n').trim();
  if (!output) {
    throw new Error('لم يُعثر على نص قابل للاستخراج في ملف PDF (قد يكون ممسوحاً ضوئياً كصور).');
  }
  return output.slice(0, 240_000);
}

function buildGeminiConfig(body: GenerateBody, capabilities: ReturnType<typeof resolveGeminiTargetModel>) {
  const systemText = body.systemPrompt?.trim();
  const config: Record<string, unknown> = {
    ...(systemText ? { systemInstruction: systemText } : {}),
  };

  if (typeof body.maxOutputTokens === 'number' && body.maxOutputTokens > 0) {
    if (!capabilities.isGemini4 || body.maxOutputTokens > 4096) {
      config.maxOutputTokens = body.maxOutputTokens;
    }
  }

  if (capabilities.supportsSamplingParams) {
    if (typeof body.temperature === 'number') config.temperature = body.temperature;
    if (typeof body.topP === 'number') config.topP = body.topP;
    if (typeof body.topK === 'number') config.topK = body.topK;
  }

  if (body.thinking) {
    if (capabilities.supportsThinkingLevel) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    } else if (capabilities.supportsThinkingBudget) {
      config.thinkingConfig = { thinkingBudget: 2048 };
    }
  }

  if (body.webSearch && capabilities.supportsSearchTool) {
    config.tools = [{ googleSearch: {} }];
  }

  return config;
}

function buildGeminiContents(body: GenerateBody) {
  const historyTurns = (body.history || [])
    .map((msg) => {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (msg.content?.trim()) parts.push({ text: msg.content });
      for (const a of msg.attachments || []) {
        if (a.base64 && a.mimeType) parts.push({ inlineData: { mimeType: a.mimeType, data: a.base64 } });
      }
      return {
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    })
    .filter((turn) => turn.parts.length > 0);

  const userParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (body.userMessage?.trim()) userParts.push({ text: body.userMessage });
  for (const a of body.attachments || []) {
    if (a.base64 && a.mimeType) userParts.push({ inlineData: { mimeType: a.mimeType, data: a.base64 } });
  }
  if (userParts.length === 0) userParts.push({ text: 'مرحباً' });

  return [
    ...historyTurns,
    {
      role: 'user',
      parts: userParts,
    },
  ];
}

function extractGroundingSources(candidate: unknown): Array<{ title: string; url: string }> {
  const c = candidate as {
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
  } | null;
  const chunks = c?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: Array<{ title: string; url: string }> = [];
  for (const chunk of chunks) {
    const url = chunk?.web?.uri?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: chunk.web?.title?.trim() || url, url });
  }
  return sources.slice(0, 6);
}

async function generateWithGemini(apiKey: string, body: GenerateBody, signal: AbortSignal) {
  const ai = createGeminiClient(apiKey);
  const cap = resolveGeminiTargetModel(body.model);
  const config = { ...buildGeminiConfig(body, cap), abortSignal: signal };
  const response = await ai.models.generateContent({
    model: cap.targetModel,
    contents: buildGeminiContents(body),
    config,
  });

  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts || [];
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

  const sources = extractGroundingSources(candidate);
  const sourcesBlock = sources.length
    ? `\n\n---\nالمصادر:\n${sources.map((s, idx) => `${idx + 1}. ${s.title} — ${s.url}`).join('\n')}`
    : '';

  const text = (textParts || (response.text || '').trim()) + sourcesBlock;
  if (!text.trim()) {
    throw new Error('لم يرجع Gemini نصاً صالحاً');
  }
  return reasoningParts ? { text, reasoning: reasoningParts } : { text };
}

async function streamWithGemini(
  apiKey: string,
  body: GenerateBody,
  signal: AbortSignal,
  sendEvent: (payload: Record<string, unknown>) => void,
) {
  const ai = createGeminiClient(apiKey);
  const cap = resolveGeminiTargetModel(body.model);
  const config = { ...buildGeminiConfig(body, cap), abortSignal: signal };
  const stream = await ai.models.generateContentStream({
    model: cap.targetModel,
    contents: buildGeminiContents(body),
    config,
  });

  const collectedSources: Array<{ title: string; url: string }> = [];
  const seenUrls = new Set<string>();
  let totalText = '';

  for await (const chunk of stream) {
    if (signal.aborted) break;
    const candidate = chunk.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    let emittedFromParts = false;
    for (const part of parts as Array<{ thought?: boolean; text?: string }>) {
      if (!part.text) continue;
      if (part.thought) {
        sendEvent({ type: 'reasoning', delta: part.text });
      } else {
        emittedFromParts = true;
        totalText += part.text;
        sendEvent({ type: 'text', delta: part.text });
      }
    }
    if (!emittedFromParts && typeof chunk.text === 'string' && chunk.text) {
      totalText += chunk.text;
      sendEvent({ type: 'text', delta: chunk.text });
    }
    for (const s of extractGroundingSources(candidate)) {
      if (!seenUrls.has(s.url)) {
        seenUrls.add(s.url);
        collectedSources.push(s);
      }
    }
  }

  if (collectedSources.length > 0 && !signal.aborted) {
    const suffix = `\n\n---\nالمصادر:\n${collectedSources.map((s, idx) => `${idx + 1}. ${s.title} — ${s.url}`).join('\n')}`;
    totalText += suffix;
    sendEvent({ type: 'text', delta: suffix });
  }
  if (!totalText.trim() && !signal.aborted) {
    throw new Error('لم يرجع Gemini نصاً صالحاً');
  }
}

async function generateWithOpenAICompatible(
  apiKey: string,
  body: GenerateBody,
  endpoint: string,
  provider: 'openai' | 'openrouter',
  signal: AbortSignal,
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

  const payload: Record<string, unknown> = {
    model: body.model,
    messages,
    temperature: body.temperature ?? 0.7,
    top_p: body.topP ?? 0.95,
    max_tokens: body.maxOutputTokens ?? 2048,
  };
  if (provider === 'openrouter' && typeof body.topK === 'number') {
    payload.top_k = body.topK;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://gassar.ai', 'X-Title': 'Gassar.AI' } : {}),
    },
    body: JSON.stringify(payload),
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

async function generateWithAnthropic(apiKey: string, body: GenerateBody, signal: AbortSignal) {
  const userContent = [
    { type: 'text', text: body.userMessage },
    ...(body.attachments || [])
      .filter((a) => a.type === 'image')
      .map((a) => ({ type: 'image', source: { type: 'base64', media_type: a.mimeType, data: a.base64 } })),
  ];

  const maxTokens = body.maxOutputTokens ?? 2048;
  const useThinking = Boolean(body.thinking) && /3-7|sonnet-4|opus-4/i.test(body.model);
  const payload: Record<string, unknown> = {
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
    max_tokens: useThinking ? Math.max(maxTokens, 4096) : maxTokens,
  };

  if (useThinking) {
    payload.thinking = { type: 'enabled', budget_tokens: 2048 };
  } else {
    payload.temperature = body.temperature ?? 0.7;
    payload.top_p = body.topP ?? 0.95;
    if (typeof body.topK === 'number') payload.top_k = body.topK;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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

async function performWebSearch(query: string): Promise<ParsedWebResult[]> {
  const tavilyKey = (process.env.TAVILY_API_KEY || '').trim();
  if (tavilyKey) {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: tavilyKey, query, max_results: 5 }),
    });
    if (res.ok) {
      const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
      const mapped = (data.results ?? [])
        .filter((r) => r.url && r.title)
        .map((r) => ({ title: String(r.title), url: String(r.url), snippet: String(r.content || r.title).slice(0, 700) }));
      if (mapped.length) return mapped.slice(0, 5);
    }
  }

  const braveKey = (process.env.BRAVE_SEARCH_API_KEY || '').trim();
  if (braveKey) {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': braveKey },
    });
    if (res.ok) {
      const data = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
      const mapped = (data.web?.results ?? [])
        .filter((r) => r.url && r.title)
        .map((r) => ({ title: String(r.title), url: String(r.url), snippet: String(r.description || r.title).slice(0, 700) }));
      if (mapped.length) return mapped.slice(0, 5);
    }
  }

  // Fallback 1: DuckDuckGo HTML search (supports Arabic and general web queries)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const htmlRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36',
        Accept: 'text/html',
      },
    });
    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const parsed = parseDuckDuckGoHtmlResults(html, 5);
      if (parsed.length) return parsed;
    }
  } catch {
    // Fall through to Instant Answer API
  } finally {
    clearTimeout(timer);
  }

  // Fallback 2: DuckDuckGo Instant Answer JSON API
  const ddgRes = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    { headers: { Accept: 'application/json' } },
  );
  if (!ddgRes.ok) {
    throw new Error(`فشل البحث الويب (${ddgRes.status})`);
  }
  const data = (await ddgRes.json()) as {
    AbstractText?: unknown;
    AbstractURL?: unknown;
    Heading?: unknown;
    RelatedTopics?: unknown;
  };
  const results: ParsedWebResult[] = [];
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
  return results.slice(0, 5);
}

async function startServer() {
  const app = express();
  const allowedCapacitorOrigins = new Set([
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost',
    'https://localhost',
  ]);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (
      origin &&
      (allowedCapacitorOrigins.has(origin) || req.path.startsWith('/api/'))
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

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
        const ai = createGeminiClient(apiKey);
        const { targetModel } = resolveGeminiTargetModel(model || 'gemini-4-hydrogen');
        await ai.models.get({ model: targetModel });
        res.json({ ok: true, provider, model: targetModel });
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
      const classified = classifyCloudApiError(PROVIDER_LABELS[provider], error);
      res.json({
        ok: false,
        provider,
        model: model || '',
        code: classified.code,
        ...(classified.status ? { status: classified.status } : {}),
        message: classified.message,
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
        error: `مفتاح ${PROVIDER_LABELS[body.provider]} غير مضبوط في بيئة الخادم.`,
      });
      return;
    }

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });

    try {
      let result: { text: string; reasoning?: string };
      if (body.provider === 'gemini') {
        result = await generateWithGemini(apiKey, body, abort.signal);
      } else if (body.provider === 'openai') {
        result = await generateWithOpenAICompatible(
          apiKey,
          body,
          'https://api.openai.com/v1/chat/completions',
          'openai',
          abort.signal,
        );
      } else if (body.provider === 'openrouter') {
        result = await generateWithOpenAICompatible(
          apiKey,
          body,
          'https://openrouter.ai/api/v1/chat/completions',
          'openrouter',
          abort.signal,
        );
      } else {
        result = await generateWithAnthropic(apiKey, body, abort.signal);
      }
      if (!abort.signal.aborted && !res.writableEnded) {
        res.json(result);
      } else if (!res.writableEnded) {
        res.end();
      }
    } catch (error) {
      if (abort.signal.aborted) {
        if (!res.writableEnded) res.end();
        return;
      }
      const classified = classifyCloudApiError(PROVIDER_LABELS[body.provider], error);
      res.status(classified.status && classified.status >= 400 && classified.status < 600 ? classified.status : 502).json({
        error: classified.message,
        code: classified.code,
      });
    }
  });

  app.post('/api/cloud/stream', async (req, res) => {
    const body = req.body as GenerateBody;
    if (!body?.provider || !(body.provider in PROVIDER_LABELS)) {
      res.status(400).json({ error: 'مزود السحابة غير صالح.' });
      return;
    }
    const apiKey = getProviderKey(body.provider);
    if (!apiKey) {
      res.status(400).json({
        error: `مفتاح ${PROVIDER_LABELS[body.provider]} غير مضبوط في بيئة الخادم.`,
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });

    const sendEvent = (payload: Record<string, unknown>) => {
      if (res.writableEnded || abort.signal.aborted) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      if (body.provider === 'gemini') {
        await streamWithGemini(apiKey, body, abort.signal, sendEvent);
      } else if (body.provider === 'openai') {
        const result = await generateWithOpenAICompatible(
          apiKey,
          body,
          'https://api.openai.com/v1/chat/completions',
          'openai',
          abort.signal,
        );
        if (result.reasoning) sendEvent({ type: 'reasoning', delta: result.reasoning });
        sendEvent({ type: 'text', delta: result.text });
      } else if (body.provider === 'openrouter') {
        const result = await generateWithOpenAICompatible(
          apiKey,
          body,
          'https://openrouter.ai/api/v1/chat/completions',
          'openrouter',
          abort.signal,
        );
        if (result.reasoning) sendEvent({ type: 'reasoning', delta: result.reasoning });
        sendEvent({ type: 'text', delta: result.text });
      } else {
        const result = await generateWithAnthropic(apiKey, body, abort.signal);
        if (result.reasoning) sendEvent({ type: 'reasoning', delta: result.reasoning });
        sendEvent({ type: 'text', delta: result.text });
      }
      sendEvent({ type: 'done' });
    } catch (error) {
      if (!abort.signal.aborted) {
        const classified = classifyCloudApiError(PROVIDER_LABELS[body.provider], error);
        sendEvent({
          type: 'error',
          error: classified.message,
          code: classified.code,
        });
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  });

  app.post('/api/extract-document', async (req, res) => {
    const { name, mimeType, base64 } = (req.body || {}) as { name?: string; mimeType?: string; base64?: string };
    if (!base64 || typeof base64 !== 'string') {
      res.status(400).json({ error: 'بيانات الملف مفقودة.' });
      return;
    }
    try {
      const normalized = base64.replace(/^data:[^,]+,/, '');
      const buffer = Buffer.from(normalized, 'base64');
      if (buffer.byteLength > 20 * 1024 * 1024) {
        res.status(400).json({ error: 'حجم الملف يتجاوز 20MB.' });
        return;
      }
      const lowerMime = (mimeType || '').toLowerCase();
      const lowerName = (name || '').toLowerCase();

      if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
        const text = await extractPdfTextServer(buffer);
        res.json({ text: `## نص PDF المستخرج\n${text}` });
        return;
      }
      if (
        lowerMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        lowerName.endsWith('.docx')
      ) {
        const result = await mammoth.extractRawText({ buffer });
        const text = result.value.replace(/\n{4,}/g, '\n\n\n').trim().slice(0, 240_000);
        if (!text) {
          res.status(400).json({ error: 'لم يُعثر على نص في مستند Word.' });
          return;
        }
        res.json({ text: `## محتوى مستند Word\n${text}` });
        return;
      }
      if (
        lowerMime === 'application/vnd.ms-excel' ||
        lowerMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        /\.(xls|xlsx)$/.test(lowerName)
      ) {
        const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
        const sections = wb.SheetNames.map((sheetName) => {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: '' }) as unknown[][];
          const body = rows
            .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
            .map((row) => row.map((cell) => String(cell ?? '').replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t'))
            .join('\n');
          return `## ورقة: ${sheetName}\n${body}`;
        });
        res.json({ text: sections.join('\n\n').slice(0, 240_000) });
        return;
      }
      const plain = buffer.toString('utf8').replace(/^\uFEFF/, '').trim().slice(0, 240_000);
      res.json({ text: plain });
    } catch (error) {
      res.status(422).json({
        error: error instanceof Error ? error.message : 'تعذر استخراج النص من الملف على الخادم.',
      });
    }
  });

  app.post('/api/fetch-url', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    if (!rawUrl.trim()) {
      res.status(400).json({ error: 'الرابط مطلوب.' });
      return;
    }
    try {
      const result = await fetchExternalUrlText(rawUrl);
      res.json(result);
    } catch (error) {
      res.status(422).json({
        error: error instanceof Error ? error.message : 'تعذر قراءة محتوى الرابط.',
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
      const results = await performWebSearch(query);
      res.json({ results });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'تعذر تنفيذ البحث الويب.',
      });
    }
  });

  app.get('/api/local-server/status', (_req, res) => {
    res.json({
      mode: 'pwa-web',
      nativeInferenceAvailable: false,
      androidCapacitorReady: true,
      endpoints: {
        health: '/api/health',
        cloudStatus: '/api/cloud/status',
        cloudStream: '/api/cloud/stream',
        cloudGenerate: '/api/cloud/generate',
        extractDocument: '/api/extract-document',
        fetchUrl: '/api/fetch-url',
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
      server: { middlewareMode: true, hmr: false, ws: false },
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
