import { apiFetch } from './api-client';
import type { PreparedInlineAttachment } from './attachment-service';

export type CloudProvider = 'gemini' | 'openai' | 'anthropic' | 'openrouter';

export interface CloudModelDefinition {
  id: string;
  provider: CloudProvider;
  model: string;
  name: string;
  description: string;
  capabilities: {
    vision: boolean;
    tools: boolean;
    reasoning: boolean;
    thinking: boolean;
    embeddings: boolean;
  };
}

export interface CloudGenerationOptions {
  provider: CloudProvider;
  model: string;
  userMessage: string;
  systemPrompt?: string;
  history?: { role: 'user' | 'assistant'; content: string; attachments?: PreparedInlineAttachment[] }[];
  signal?: AbortSignal;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  attachments?: PreparedInlineAttachment[];
  thinking?: boolean;
  webSearch?: boolean;
}

export type CloudGenerationResult = { text: string; reasoning?: string };
export type CloudStreamDelta = { type: 'text' | 'reasoning'; delta: string };

export type CloudAccessCode =
  | 'missing_key'
  | 'billing_required'
  | 'forbidden'
  | 'not_found'
  | 'network'
  | 'invalid_key'
  | 'unknown';

export type CloudAccessResult =
  | { ok: true; provider: CloudProvider; model: string }
  | { ok: false; provider: CloudProvider; model: string; code: CloudAccessCode; status?: number; message: string };

const CLOUD_MODELS: CloudModelDefinition[] = [
  {
    id: 'cloud-gemini-4-hydrogen',
    provider: 'gemini',
    model: 'gemini-4-hydrogen',
    name: 'Gemini 4 Flash',
    description: 'أحدث نموذج سريع من Google متعدد الوسائط مع البحث المباشر والتفكير المتقدم',
    capabilities: { vision: true, tools: true, reasoning: true, thinking: true, embeddings: false },
  },
  {
    id: 'cloud-gemini-3-1-flash-lite',
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    description: 'خيار اقتصادي فائق السرعة للمحادثات اليومية والطلبات الكثيفة',
    capabilities: { vision: true, tools: true, reasoning: false, thinking: false, embeddings: false },
  },
  {
    id: 'cloud-gemini-2-5-pro',
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'للمهام المعقدة والبرمجة المتقدمة والاستدلال العميق',
    capabilities: { vision: true, tools: true, reasoning: true, thinking: true, embeddings: false },
  },
  {
    id: 'cloud-gemma-4-31b',
    provider: 'gemini',
    model: 'gemma-4-31b-it',
    name: 'Gemma 4 31B IT',
    description: 'نموذج Google المفتوح للتفكير والبرمجة والمهام متعددة الوسائط',
    capabilities: { vision: true, tools: true, reasoning: true, thinking: true, embeddings: false },
  },
  {
    id: 'cloud-openai-gpt-4o',
    provider: 'openai',
    model: 'gpt-4o',
    name: 'OpenAI GPT-4o',
    description: 'نموذج OpenAI متعدد الوسائط للاستدلال والبرمجة',
    capabilities: { vision: true, tools: true, reasoning: true, thinking: true, embeddings: false },
  },
  {
    id: 'cloud-openai-gpt-4o-mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    name: 'OpenAI GPT-4o Mini',
    description: 'خيار OpenAI السريع للاستخدام اليومي',
    capabilities: { vision: true, tools: true, reasoning: false, thinking: false, embeddings: false },
  },
  {
    id: 'cloud-anthropic-sonnet',
    provider: 'anthropic',
    model: 'claude-3-7-sonnet-latest',
    name: 'Claude 3.7 Sonnet',
    description: 'توازن قوي بين السرعة والذكاء والبرمجة والتفكير الممتد',
    capabilities: { vision: true, tools: true, reasoning: true, thinking: true, embeddings: false },
  },
  {
    id: 'cloud-openrouter-auto',
    provider: 'openrouter',
    model: 'openrouter/auto',
    name: 'OpenRouter Auto',
    description: 'اختيار تلقائي لنموذج مناسب عبر OpenRouter',
    capabilities: { vision: true, tools: true, reasoning: true, thinking: true, embeddings: false },
  },
];

const providerLabels: Record<CloudProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  openrouter: 'OpenRouter',
};

export class CloudModelService {
  getAvailableModels(): CloudModelDefinition[] {
    return CLOUD_MODELS.map((model) => ({ ...model, capabilities: { ...model.capabilities } }));
  }

  getProviderLabel(provider: CloudProvider): string {
    return providerLabels[provider];
  }

  async getConfiguredProviders(): Promise<Record<CloudProvider, boolean>> {
    try {
      const response = await apiFetch('/api/cloud/status');
      if (!response.ok) {
        return { gemini: false, openai: false, anthropic: false, openrouter: false };
      }
      const data = (await response.json()) as { providers?: Record<CloudProvider, boolean> };
      return data.providers ?? { gemini: false, openai: false, anthropic: false, openrouter: false };
    } catch {
      return { gemini: false, openai: false, anthropic: false, openrouter: false };
    }
  }

  async hasApiKey(provider: CloudProvider): Promise<boolean> {
    const status = await this.getConfiguredProviders();
    return Boolean(status[provider]);
  }

  async testConnection(provider: CloudProvider, model?: string): Promise<CloudAccessResult> {
    const selectedModel = model || this.getAvailableModels().find((item) => item.provider === provider)?.model || '';
    try {
      const response = await apiFetch('/api/cloud/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model: selectedModel }),
      });
      const data = (await response.json()) as CloudAccessResult;
      return data;
    } catch (error) {
      return {
        ok: false,
        provider,
        model: selectedModel,
        code: 'network',
        message: error instanceof Error ? error.message : 'تعذر الوصول إلى خادم Gassar.AI.',
      };
    }
  }

  private async readErrorPayload(response: Response, fallback: string): Promise<string> {
    const raw = await response.text().catch(() => '');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { error?: string; message?: string };
        if (parsed?.error) return parsed.error;
        if (parsed?.message) return parsed.message;
      } catch {
        const trimmed = raw.trim();
        if (trimmed && !trimmed.startsWith('<')) return trimmed.slice(0, 300);
      }
    }
    return fallback;
  }

  async generateResponse(options: CloudGenerationOptions): Promise<CloudGenerationResult> {
    const response = await apiFetch('/api/cloud/generate', {
      method: 'POST',
      signal: options.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: options.provider,
        model: options.model,
        userMessage: options.userMessage,
        systemPrompt: options.systemPrompt,
        history: options.history,
        attachments: options.attachments,
        temperature: options.temperature,
        topP: options.topP,
        topK: options.topK,
        maxOutputTokens: options.maxOutputTokens,
        thinking: options.thinking,
        webSearch: options.webSearch,
      }),
    });
    if (!response.ok) {
      const message = await this.readErrorPayload(response, `تعذر إتمام الطلب (${response.status})`);
      throw new Error(message);
    }
    const data = (await response.json().catch(() => ({}))) as { text?: string; reasoning?: string; error?: string };
    if (!data.text?.trim()) {
      throw new Error(data.error || `لم يرجع ${providerLabels[options.provider]} نصاً صالحاً`);
    }
    return {
      text: data.text.trim(),
      ...(data.reasoning?.trim() ? { reasoning: data.reasoning.trim() } : {}),
    };
  }

  async streamResponse(
    options: CloudGenerationOptions,
    onDelta?: (chunk: CloudStreamDelta) => void,
  ): Promise<CloudGenerationResult> {
    const response = await apiFetch('/api/cloud/stream', {
      method: 'POST',
      signal: options.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        provider: options.provider,
        model: options.model,
        userMessage: options.userMessage,
        systemPrompt: options.systemPrompt,
        history: options.history,
        attachments: options.attachments,
        temperature: options.temperature,
        topP: options.topP,
        topK: options.topK,
        maxOutputTokens: options.maxOutputTokens,
        thinking: options.thinking,
        webSearch: options.webSearch,
      }),
    });

    if (!response.ok) {
      const message = await this.readErrorPayload(response, `تعذر بدء البث (${response.status})`);
      throw new Error(message);
    }

    if (!response.body) {
      return this.generateResponse(options);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let fullReasoning = '';

    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const raw = trimmed.slice('data:'.length).trim();
      if (!raw) return;
      let evt: { type?: string; delta?: string; error?: string };
      try {
        evt = JSON.parse(raw) as { type?: string; delta?: string; error?: string };
      } catch {
        return;
      }
      if (evt.type === 'error') {
        throw new Error(evt.error || 'تعذر إكمال البث من المزود.');
      }
      if (evt.type === 'reasoning' && evt.delta) {
        fullReasoning += evt.delta;
        onDelta?.({ type: 'reasoning', delta: evt.delta });
      } else if (evt.type === 'text' && evt.delta) {
        fullText += evt.delta;
        onDelta?.({ type: 'text', delta: evt.delta });
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        processLine(line);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      for (const line of buffer.split(/\r?\n/)) {
        processLine(line);
      }
    }

    if (!fullText.trim()) {
      if (options.signal?.aborted) {
        throw new Error('cancelled');
      }
      return this.generateResponse(options);
    }

    return {
      text: fullText.trim(),
      ...(fullReasoning.trim() ? { reasoning: fullReasoning.trim() } : {}),
    };
  }
}

export const cloudModelService = new CloudModelService();
