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
  maxOutputTokens?: number;
  attachments?: PreparedInlineAttachment[];
  thinking?: boolean;
}

export type CloudGenerationResult = { text: string; reasoning?: string };
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
    id: 'cloud-gemini-2-5-flash',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'نموذج Google السريع متعدد الوسائط مع أدوات وتفكير متقدم',
    capabilities: { vision: true, tools: true, reasoning: true, thinking: true, embeddings: false },
  },
  {
    id: 'cloud-gemini-2-5-pro',
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'للمهام المعقدة والبرمجة والاستدلال المتقدم',
    capabilities: { vision: true, tools: true, reasoning: true, thinking: true, embeddings: false },
  },
  {
    id: 'cloud-gemini-3-5-flash-lite',
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
    name: 'Gemini Flash-Lite',
    description: 'خيار اقتصادي سريع للطلبات الكثيفة',
    capabilities: { vision: true, tools: true, reasoning: false, thinking: false, embeddings: false },
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
    name: 'Claude Sonnet',
    description: 'توازن قوي بين السرعة والذكاء والبرمجة',
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
      const response = await fetch('/api/cloud/status');
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
      const response = await fetch('/api/cloud/test', {
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

  async generateResponse(options: CloudGenerationOptions): Promise<CloudGenerationResult> {
    const response = await fetch('/api/cloud/generate', {
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
        maxOutputTokens: options.maxOutputTokens,
        thinking: options.thinking,
      }),
    });
    const data = (await response.json()) as { text?: string; reasoning?: string; error?: string };
    if (!response.ok) {
      throw new Error(data.error || `تعذر إتمام الطلب (${response.status})`);
    }
    if (!data.text?.trim()) {
      throw new Error(`لم يرجع ${providerLabels[options.provider]} نصاً صالحاً`);
    }
    return {
      text: data.text.trim(),
      ...(data.reasoning?.trim() ? { reasoning: data.reasoning.trim() } : {}),
    };
  }
}

export const cloudModelService = new CloudModelService();
