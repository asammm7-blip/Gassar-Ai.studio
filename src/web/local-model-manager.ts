import { storage } from './storage';
import { getDisplayModelName, getModelExtension, validateModelMetadata } from './model-safety';
import type { CloudProvider } from './cloud-model-service';

export interface LocalModel {
  id: string;
  name: string;
  path: string;
  size: number;
  type: 'language' | 'vision' | 'embedding' | 'image-generation';
  isLoaded: boolean;
  isActive: boolean;
  version: string;
  description: string;
  source?: 'local' | 'cloud';
  provider?: CloudProvider;
  remoteModel?: string;
  capabilities?: {
    vision: boolean;
    thinking: boolean;
    tools: boolean;
    embeddings: boolean;
    audioInput?: boolean;
    multimodalProjector?: string;
  };
  multimodalProjector?: string;
}

export interface ModelLoadingState {
  status: 'idle' | 'selecting' | 'loading' | 'initializing' | 'active' | 'error';
  message: string;
  progress: number;
  selectedModel: LocalModel | null;
  error?: string;
}

const MODEL_STORAGE_KEY = 'localModels';

export class LocalModelManager {
  readonly ready: Promise<void>;
  private models: Map<string, LocalModel> = new Map();
  private loadingState: ModelLoadingState = {
    status: 'idle',
    message: '',
    progress: 0,
    selectedModel: null,
  };
  private listeners: Set<(state: ModelLoadingState) => void> = new Set();
  private activeModel: LocalModel | null = null;

  constructor() {
    this.ready = typeof window === 'undefined' ? Promise.resolve() : this.loadModelsFromStorage();
  }

  private async loadModelsFromStorage(): Promise<void> {
    try {
      const saved = await storage.getItem(MODEL_STORAGE_KEY);
      if (!saved) return;
      const modelsArray = JSON.parse(saved) as LocalModel[];
      modelsArray
        .filter((model) => getModelExtension(model.name) === 'gguf')
        .forEach((model) => {
          this.models.set(model.id, { ...model, isActive: false, isLoaded: false });
        });
    } catch (error) {
      console.error('خطأ في تحميل نماذج GGUF المحفوظة:', error);
    }
  }

  private updateState(state: Partial<ModelLoadingState>): void {
    this.loadingState = { ...this.loadingState, ...state };
    this.listeners.forEach((listener) => listener(this.loadingState));
  }

  subscribe(listener: (state: ModelLoadingState) => void): () => void {
    this.listeners.add(listener);
    listener(this.loadingState);
    return () => this.listeners.delete(listener);
  }

  getState(): ModelLoadingState {
    return this.loadingState;
  }

  async registerFile(file: File): Promise<LocalModel> {
    await this.ready;
    this.updateState({
      status: 'loading',
      message: 'جاري فحص بيانات ملف GGUF…',
      progress: 40,
      error: undefined,
    });
    const validationError = validateModelMetadata(file.name, file.size);
    if (validationError) {
      this.updateState({ status: 'error', message: validationError, progress: 0, error: validationError });
      throw new Error(validationError);
    }

    const modelName = getDisplayModelName(file.name);
    const modelId = `gguf_${Date.now()}`;
    const newModel: LocalModel = {
      id: modelId,
      name: modelName,
      path: `local-file://${file.name}`,
      size: file.size,
      type: this.detectModelType(modelName),
      isLoaded: false,
      isActive: false,
      version: '1.0.0',
      description: `نموذج GGUF محلي · ${modelName} (التشغيل المباشر يتطلب تطبيق Android الأصلي)`,
      capabilities: this.detectCapabilities(modelName),
    };
    this.models.set(modelId, newModel);
    await this.saveModelsToStorage();
    this.updateState({
      status: 'selecting',
      message: 'تم تسجيل بيانات نموذج GGUF بنجاح',
      progress: 100,
      selectedModel: newModel,
    });
    return newModel;
  }

  async activateModel(modelId: string): Promise<void> {
    await this.ready;
    const model = this.models.get(modelId);
    if (!model) throw new Error('نموذج GGUF غير موجود');
    if (this.activeModel) {
      this.activeModel.isActive = false;
      this.activeModel.isLoaded = false;
    }
    model.isActive = true;
    model.isLoaded = false;
    this.activeModel = model;
    await this.saveModelsToStorage();
    this.updateState({
      status: 'active',
      message: 'تم تحديد النموذج المحلي (يتطلب التشغيل الفعلي لمكتبة llama.cpp بيئة Android)',
      progress: 100,
      selectedModel: model,
    });
  }

  async deactivateModel(): Promise<void> {
    if (!this.activeModel) return;
    this.activeModel.isActive = false;
    this.activeModel.isLoaded = false;
    this.activeModel = null;
    this.updateState({ status: 'idle', message: 'تم إيقاف نموذج GGUF', progress: 0, selectedModel: null });
    await this.saveModelsToStorage();
  }

  async deleteModel(modelId: string): Promise<void> {
    if (this.activeModel?.id === modelId) await this.deactivateModel();
    this.models.delete(modelId);
    await this.saveModelsToStorage();
  }

  async generateResponseWithModelDetailed(): Promise<{ text: string; reasoning?: string }> {
    throw new Error(
      'تشغيل نماذج GGUF محلياً عبر llama.cpp غير متاح في متصفح الويب. اختر أحد النماذج السحابية أو فعّل الوضع التلقائي.',
    );
  }

  async stopGeneration(): Promise<void> {
    return;
  }

  getAvailableModels(): LocalModel[] {
    return Array.from(this.models.values());
  }

  getActiveModel(): LocalModel | null {
    return this.activeModel;
  }

  private detectModelType(modelName: string): LocalModel['type'] {
    const lowerName = modelName.toLowerCase();
    if (lowerName.includes('vision') || lowerName.includes('vl') || lowerName.includes('mmproj')) return 'vision';
    if (lowerName.includes('embed')) return 'embedding';
    return 'language';
  }

  private detectCapabilities(modelName: string): LocalModel['capabilities'] {
    const lower = modelName.toLowerCase();
    return {
      vision: /vision|vl|llava|qwen2-vl|qwen3-vl|gemma-3/.test(lower),
      thinking: /think|reason|qwq|deepseek-r1|qwen3/.test(lower),
      tools: /instruct|chat|function|tool/.test(lower),
      embeddings: /embed|bge|nomic/.test(lower),
    };
  }

  private async saveModelsToStorage(): Promise<void> {
    await storage.setItem(MODEL_STORAGE_KEY, JSON.stringify(Array.from(this.models.values())));
  }
}

export const localModelManager = new LocalModelManager();
