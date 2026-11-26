import {
  chatReducer,
  EMPTY_STORE,
  DEFAULT_MODEL_SETTINGS,
  modelSettingsSchema,
  modelSchema,
  preserveBranch,
  type ChatStore,
  type Conversation,
  type Message,
  type ModelSettings,
} from './chat-data';
import { ChatRepository, emptyEnvelope, namespaceFor, envelopeSchema, type DataIdentity, type DataEnvelope } from './chat-repository';
import { buildRequest, type BuiltRequest, type AttachmentReader, type RequestFeatures } from './request-builder';
import type { LocalModel } from './local-model-manager';
import type { ConnectionMode } from './connection-mode';
import type { ChatAttachment, AttachmentProgressCallback } from './attachment-service';

export type SendResult =
  | { status: 'complete'; accepted: true; requestId: string; conversationId: string; userMessageId: string; message: Message }
  | {
      status: 'refused' | 'failed' | 'cancelled';
      accepted: boolean;
      reason: string;
      requestId?: string;
      conversationId?: string;
      userMessageId?: string;
    };

export interface ControllerState {
  store: ChatStore;
  hydrated: boolean;
  namespace: string;
  saveHistory: boolean;
  activeModel: LocalModel | null;
  modelSettings: ModelSettings;
  settingsByModel: Record<string, ModelSettings>;
  connectionMode: ConnectionMode;
  error: string | null;
  pending: { requestId: string; conversationId: string } | null;
  userMessages: string[];
  warnings: string[];
}

export interface ChatDependencies {
  repository: ChatRepository;
  uuid(): string;
  generate(request: BuiltRequest, signal: AbortSignal): Promise<string | { text: string; reasoning?: string }>;
  cancelLocal?(): Promise<void>;
  activate?(model: LocalModel): Promise<void>;
  reader?: AttachmentReader;
  readSettings?(modelId: string, namespace: string): Promise<ModelSettings>;
  saveSettings?(modelId: string, settings: ModelSettings, namespace: string): Promise<void>;
}

export function separateEmbeddedReasoning(text: string, reasoning?: string): { text: string; reasoning?: string } {
  const explicit = reasoning?.trim();
  const matches = [...text.matchAll(/<(?:think|thinking|reasoning)>\s*([\s\S]*?)\s*<\/(?:think|thinking|reasoning)>/gi)];
  const embedded = matches.map((match) => match[1].trim()).filter(Boolean).join('\n\n');
  const visible = text.replace(/<(?:think|thinking|reasoning)>\s*[\s\S]*?\s*<\/(?:think|thinking|reasoning)>/gi, '').trim();
  const combined = [explicit, embedded].filter(Boolean).join('\n\n').trim();
  return combined ? { text: visible, reasoning: combined } : { text: visible };
}

export class ChatController {
  private state: ControllerState = {
    store: EMPTY_STORE,
    hydrated: false,
    namespace: 'guest',
    saveHistory: true,
    activeModel: null,
    modelSettings: { ...DEFAULT_MODEL_SETTINGS },
    settingsByModel: {},
    connectionMode: 'auto',
    error: null,
    pending: null,
    userMessages: [],
    warnings: [],
  };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private operation: {
    requestId: string;
    conversationId: string;
    epoch: number;
    abort: AbortController;
    route?: 'local' | 'cloud';
  } | null = null;
  private modelLock = false;

  constructor(private deps: ChatDependencies) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<ControllerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private reduce(action: Parameters<typeof chatReducer>[1]) {
    this.set({ store: chatReducer(this.state.store, action) });
  }

  private data(): DataEnvelope {
    return { version: 2, conversations: Object.values(this.state.store.byId), modelSettings: this.state.settingsByModel };
  }

  private async save() {
    const epoch = this.epoch;
    const currentId = this.state.store.currentId;
    try {
      await this.deps.repository.persist(this.state.namespace, this.data());
    } catch {
      if (epoch === this.epoch && currentId === this.state.store.currentId) {
        this.set({ error: 'تعذر حفظ البيانات؛ التعديل في الذاكرة فقط. أعد المحاولة.' });
      }
      throw new Error('فشل حفظ البيانات');
    }
  }

  async switchIdentity(identity: DataIdentity): Promise<void> {
    const active = this.state.activeModel;
    const epoch = ++this.epoch;
    this.operation?.abort.abort();
    this.set({
      hydrated: false,
      namespace: namespaceFor(identity),
      store: EMPTY_STORE,
      pending: null,
      settingsByModel: {},
      modelSettings: { ...DEFAULT_MODEL_SETTINGS },
      error: null,
    });
    const namespace = namespaceFor(identity);
    try {
      const result = await this.deps.repository.hydrate(namespace);
      if (epoch !== this.epoch) return;
      const settings = active
        ? result.data.modelSettings[active.id] ?? (await this.deps.readSettings?.(active.id, namespace)) ?? DEFAULT_MODEL_SETTINGS
        : DEFAULT_MODEL_SETTINGS;
      if (epoch !== this.epoch) return;
      const conversations = result.data.conversations.map((c) => ({
        ...c,
        retention: result.saveHistory ? c.retention : ('temporary' as const),
        messages: c.messages.map((m) => (m.generationStatus === 'pending' ? { ...m, generationStatus: 'failed' as const } : m)),
      }));
      this.set({
        store: chatReducer(EMPTY_STORE, { type: 'hydrate', conversations }),
        settingsByModel: result.data.modelSettings,
        hydrated: true,
        modelSettings: modelSettingsSchema.parse(settings),
        saveHistory: result.saveHistory,
        warnings: result.warnings,
      });
    } catch {
      if (epoch === this.epoch) {
        this.set({ error: 'تعذر استعادة السجل؛ لم يتم تغييره. أعد المحاولة أو استرد نسخة صحيحة.' });
      }
    }
  }

  async setSaveHistory(enabled: boolean) {
    this.set({ saveHistory: enabled });
    if (!enabled) {
      const byId = Object.fromEntries(
        Object.values(this.state.store.byId).map((c) => [c.id, { ...c, retention: 'temporary' as const }]),
      );
      this.set({ store: { ...this.state.store, byId } });
    }
    try {
      await this.deps.repository.setSaveHistory(enabled);
    } catch {
      this.set({ saveHistory: false, error: 'فشل حفظ سياسة الخصوصية؛ الحفظ معطل بأمان لهذه الجلسة.' });
      await this.deps.repository.setSaveHistory(false).catch(() => undefined);
      throw new Error('فشل حفظ سياسة الخصوصية');
    }
  }

  createNewConversation(): string {
    if (!this.state.hydrated) {
      this.set({ error: 'انتظر استعادة السجل أولاً.' });
      return '';
    }
    const now = Date.now();
    const c: Conversation = {
      id: this.deps.uuid(),
      title: 'محادثة جديدة',
      messages: [],
      model: this.state.activeModel,
      createdAt: now,
      updatedAt: now,
      retention: this.state.saveHistory ? 'saved' : 'temporary',
    };
    this.reduce({ type: 'put', conversation: c });
    this.selectConversation(c.id);
    void this.save().catch(() => undefined);
    return c.id;
  }

  selectConversation(id: string) {
    this.reduce({ type: 'select', id });
  }

  async selectModel(model: LocalModel) {
    if (this.operation || this.modelLock) throw new Error('انتظر نهاية الطلب قبل تبديل النموذج.');
    modelSchema.parse(model);
    this.modelLock = true;
    const epoch = this.epoch;
    const namespace = this.state.namespace;
    try {
      if (model.source !== 'cloud') await this.deps.activate?.(model);
      if (epoch !== this.epoch) return;
      const settings =
        this.state.settingsByModel[model.id] ?? (await this.deps.readSettings?.(model.id, namespace)) ?? { ...DEFAULT_MODEL_SETTINGS };
      if (epoch !== this.epoch) return;
      this.set({ activeModel: model, modelSettings: modelSettingsSchema.parse(settings), error: null });
    } finally {
      this.modelLock = false;
    }
  }

  restoreModel(model: LocalModel | null, mode: ConnectionMode) {
    this.set({ activeModel: model, connectionMode: mode });
  }

  setConnectionMode(mode: ConnectionMode) {
    this.set({ connectionMode: mode });
  }

  async updateModelSettings(patch: Partial<ModelSettings>) {
    const model = this.state.activeModel;
    if (!model) throw new Error('اختر نموذجاً أولاً.');
    const settings = modelSettingsSchema.parse({ ...this.state.modelSettings, ...patch });
    const epoch = this.epoch;
    const namespace = this.state.namespace;
    await this.deps.saveSettings?.(model.id, settings, namespace);
    if (epoch !== this.epoch || model.id !== this.state.activeModel?.id) return;
    this.set({ modelSettings: settings, settingsByModel: { ...this.state.settingsByModel, [model.id]: settings } });
    await this.save();
  }

  deleteIdentity(identity: DataIdentity): Promise<void> {
    return this.deps.repository.deleteNamespace(namespaceFor(identity));
  }

  showUserMessage(message: string) {
    this.set({ userMessages: [...this.state.userMessages, message] });
  }

  async deleteConversation(id: string) {
    const namespace = this.state.namespace;
    const epoch = this.epoch;
    const original = this.state.store.byId[id];
    this.reduce({ type: 'delete', id });
    const cancellation = this.operation?.conversationId === id ? this.cancelGeneration() : Promise.resolve();
    try {
      await this.deps.repository.deleteConversation(namespace, id);
      await cancellation;
    } catch {
      if (epoch === this.epoch && original) {
        this.reduce({ type: 'put', conversation: original });
        this.set({ error: 'تعذر إكمال الحذف؛ أعد المحاولة.' });
      }
      throw new Error('فشل الحذف');
    }
  }

  async clearConversations() {
    const namespace = this.state.namespace;
    const epoch = this.epoch;
    const original = this.state.store;
    this.reduce({ type: 'clear' });
    const cancellation = this.cancelGeneration();
    try {
      await this.deps.repository.clear(namespace);
      await cancellation;
    } catch {
      if (epoch === this.epoch) this.set({ store: original, error: 'تعذر إكمال المسح؛ أعد المحاولة.' });
      throw new Error('فشل المسح');
    }
  }

  async updateConversation(id: string, patch: Partial<Conversation>) {
    this.reduce({ type: 'patchConversation', id, patch });
    await this.save();
  }

  async updateMessage(messageId: string, patch: Partial<Message>) {
    const id = this.state.store.currentId;
    const c = id && this.state.store.byId[id];
    if (!c) return;
    if (this.operation) throw new Error('انتظر نهاية التوليد قبل تغيير الفرع.');
    const index = c.messages.findIndex((m) => m.id === messageId);
    if (index < 0) return;
    if (patch.activeVersion !== undefined) {
      if ((c.branches?.length ?? 0) >= 100) throw new Error('بلغت الفروع حد التخزين');
      const m = c.messages[index];
      if (!m.versions || patch.activeVersion < 0 || patch.activeVersion >= m.versions.length) {
        throw new Error('نسخة غير صالحة');
      }
      let next = preserveBranch(c, this.deps.uuid(), 'قبل تبديل الرد');
      next = { ...next, messages: next.messages.slice(0, index + 1) };
      this.reduce({ type: 'put', conversation: next });
      patch = { ...patch, content: m.versions[patch.activeVersion] };
    }
    this.reduce({ type: 'patchMessage', id: c.id, messageId, patch });
    await this.save();
  }

  async restoreBranch(branchId: string) {
    const c = this.current();
    if (!c || this.operation) throw new Error('لا يمكن تبديل الفرع أثناء الطلب.');
    if ((c.branches?.length ?? 0) >= 100) throw new Error('بلغت الفروع حد التخزين');
    const branch = c.branches?.find((b) => b.id === branchId);
    if (!branch) throw new Error('الفرع غير موجود');
    const next = preserveBranch(c, this.deps.uuid(), 'قبل استعادة الفرع');
    this.reduce({ type: 'put', conversation: { ...next, messages: branch.messages.map((m) => ({ ...m })) } });
    await this.save();
  }

  private current() {
    return this.state.store.currentId ? this.state.store.byId[this.state.store.currentId] : null;
  }

  async cancelGeneration() {
    const op = this.operation;
    if (!op) return;
    op.abort.abort();
    if (op.route === 'local') await this.deps.cancelLocal?.();
  }

  sendMessage(
    content: string,
    attachments: ChatAttachment[] = [],
    progress?: AttachmentProgressCallback,
    features?: Partial<RequestFeatures>,
  ): Promise<SendResult> {
    return this.run({ kind: 'send', content, attachments, progress, features });
  }

  retryMessage(messageId: string): Promise<SendResult> {
    return this.run({ kind: 'retry', messageId });
  }

  regenerateResponse(messageId: string): Promise<SendResult> {
    return this.run({ kind: 'regenerate', messageId });
  }

  editUserMessage(messageId: string, content: string, attachments?: ChatAttachment[]): Promise<SendResult> {
    return this.run({ kind: 'edit', messageId, content, attachments });
  }

  private async run(input: {
    kind: 'send' | 'retry' | 'regenerate' | 'edit';
    content?: string;
    attachments?: ChatAttachment[];
    messageId?: string;
    progress?: AttachmentProgressCallback;
    features?: Partial<RequestFeatures>;
  }): Promise<SendResult> {
    const c = this.current();
    if (!this.state.hydrated || !c || this.operation || this.modelLock) {
      return { status: 'refused', accepted: false, reason: 'المحادثة غير جاهزة أو يوجد طلب قيد التنفيذ.' };
    }
    let index = input.kind === 'send' ? c.messages.length : c.messages.findIndex((m) => m.id === input.messageId);
    let originalAssistant: Message | undefined;
    if (input.kind === 'regenerate') {
      originalAssistant = c.messages[index];
      if (originalAssistant?.role !== 'assistant') return { status: 'refused', accepted: false, reason: 'رد غير صالح' };
      let userIdx = -1;
      for (let i = index - 1; i >= 0; i -= 1) {
        if (c.messages[i]?.role === 'user') {
          userIdx = i;
          break;
        }
      }
      index = userIdx;
    }
    const source = c.messages[index];
    if (input.kind !== 'send' && source?.role !== 'user') return { status: 'refused', accepted: false, reason: 'سؤال غير صالح' };
    const text = input.content ?? source?.content ?? '';
    if (!text.trim()) return { status: 'refused', accepted: false, reason: 'اكتب رسالة أولاً.' };
    const target: Message =
      input.kind === 'retry' || input.kind === 'regenerate'
        ? { ...source }
        : {
            id: this.deps.uuid(),
            role: 'user',
            content: text,
            timestamp: Date.now(),
            attachments: input.attachments ?? source?.attachments,
          };
    if (input.kind === 'edit' && source?.attachmentSnapshot && JSON.stringify(target.attachments ?? []) === JSON.stringify(source.attachments ?? [])) {
      target.attachmentSnapshot = source.attachmentSnapshot;
    }

    const op = {
      requestId: this.deps.uuid(),
      conversationId: c.id,
      epoch: this.epoch,
      abort: new AbortController(),
      route: undefined as BuiltRequest['route'] | undefined,
    };
    this.operation = op;
    this.set({ pending: { requestId: op.requestId, conversationId: c.id }, error: null });
    let accepted = false;
    const owns = () => this.operation === op && this.epoch === op.epoch && !!this.state.store.byId[c.id] && !op.abort.signal.aborted;

    try {
      const request = await buildRequest({
        mode: this.state.connectionMode,
        model: this.state.activeModel,
        settings: this.state.modelSettings,
        target,
        before: c.messages.slice(0, index),
        reader: this.deps.reader,
        progress: input.progress,
        features: input.features,
      });
      op.route = request.route;
      if (!owns()) return { status: 'cancelled', accepted: false, reason: 'ألغي الطلب قبل الإرسال.' };
      const branch = this.state.store.byId[c.id];
      if ((branch.branches?.length ?? 0) >= 100 && input.kind !== 'send') throw new Error('branch-limit');
      if (originalAssistant && (originalAssistant.versions?.length ?? 1) >= 100) throw new Error('version-limit');
      target.attachmentSnapshot = request.snapshot;
      target.generationStatus = 'pending';
      target.requestId = op.requestId;
      let next = this.state.store.byId[c.id];
      if (input.kind !== 'send') {
        next = preserveBranch(next, this.deps.uuid(), input.kind === 'edit' ? 'قبل تعديل السؤال' : 'قبل إعادة التوليد');
        next = { ...next, messages: next.messages.slice(0, index) };
      }
      this.reduce({
        type: 'put',
        conversation: {
          ...next,
          title: !next.messages.length ? target.content.trim().replace(/\s+/g, ' ').slice(0, 56) : next.title,
          messages: [...next.messages, target],
          updatedAt: Date.now(),
        },
      });
      accepted = true;
      await this.save();
      if (!owns()) throw new Error('cancelled');
      const generated = await this.deps.generate(request, op.abort.signal);
      const generatedText = typeof generated === 'string' ? generated : generated.text;
      const generatedReasoning = typeof generated === 'string' ? undefined : generated.reasoning;
      const separated = separateEmbeddedReasoning(generatedText, generatedReasoning);
      const outText = separated.text;
      const reasoning = separated.reasoning;
      if (!owns()) {
        return {
          status: 'cancelled',
          accepted,
          reason: 'ألغي الطلب؛ النتيجة المتأخرة لم تحفظ.',
          conversationId: c.id,
          userMessageId: target.id,
        };
      }
      if (!outText.trim()) throw new Error('empty');
      const versions = originalAssistant ? [...(originalAssistant.versions ?? [originalAssistant.content]), outText] : undefined;
      const message: Message = {
        id: this.deps.uuid(),
        role: 'assistant',
        content: outText,
        timestamp: Date.now(),
        modelName: request.model.name,
        generationStatus: 'complete',
        requestId: op.requestId,
        ...(reasoning ? { reasoning } : {}),
        ...(versions ? { versions, activeVersion: versions.length - 1, feedback: null } : {}),
      };
      this.reduce({ type: 'patchMessage', id: c.id, messageId: target.id, patch: { generationStatus: 'complete' } });
      this.reduce({ type: 'append', id: c.id, message });
      await this.save();
      if (!owns()) {
        return {
          status: 'cancelled',
          accepted: true,
          reason: 'انتهى ملك الطلب؛ لم تُعرض النتيجة في النطاق الجديد.',
          requestId: op.requestId,
          conversationId: c.id,
          userMessageId: target.id,
        };
      }
      return { status: 'complete', accepted: true, requestId: op.requestId, conversationId: c.id, userMessageId: target.id, message };
    } catch (error) {
      const cancelled = op.abort.signal.aborted || op.epoch !== this.epoch;
      const detail = error instanceof Error ? error.message : String(error);
      if (op.epoch === this.epoch && this.state.store.byId[c.id]) {
        if (accepted) {
          this.reduce({
            type: 'patchMessage',
            id: c.id,
            messageId: target.id,
            patch: { generationStatus: cancelled ? 'cancelled' : 'failed' },
          });
        }
        if (this.state.store.currentId === c.id) {
          this.set({
            error: cancelled ? null : `تعذر إرسال الرسالة أو حفظها: ${detail}. المسودة محفوظة لإعادة المحاولة دون تكرارها.`,
          });
        }
        if (accepted) await this.save().catch(() => undefined);
      }
      return {
        status: cancelled ? 'cancelled' : 'failed',
        accepted,
        reason: cancelled ? 'ألغي الطلب' : this.state.error ?? 'فشل الطلب',
        requestId: op.requestId,
        conversationId: c.id,
        userMessageId: accepted ? target.id : undefined,
      };
    } finally {
      if (this.operation === op) {
        this.operation = null;
        if (op.epoch === this.epoch) {
          if (accepted && op.abort.signal.aborted && this.state.store.byId[c.id]) {
            this.reduce({ type: 'patchMessage', id: c.id, messageId: target.id, patch: { generationStatus: 'cancelled' } });
            void this.save().catch(() => undefined);
          }
          this.set({ pending: null });
        }
      }
    }
  }

  async importData(data: DataEnvelope, mode: 'merge' | 'replace') {
    if (this.operation) throw new Error('انتظر نهاية الطلب قبل الاستيراد.');
    if (!this.state.saveHistory || !this.state.hydrated) throw new Error('فعّل الحفظ واستعد النطاق قبل استيراد نسخة دائمة.');
    if (mode !== 'merge' && mode !== 'replace') throw new Error('وضع استيراد غير صالح');
    const epoch = this.epoch;
    const namespace = this.state.namespace;
    const current = this.data();
    const merged =
      mode === 'replace'
        ? data
        : {
            ...data,
            conversations: [...current.conversations, ...data.conversations.filter((c) => !this.state.store.byId[c.id])],
            modelSettings: { ...data.modelSettings, ...current.modelSettings },
          };
    const validated = envelopeSchema.parse(merged);
    await this.deps.repository.persist(namespace, validated);
    if (epoch === this.epoch) {
      this.set({
        store: chatReducer(EMPTY_STORE, { type: 'hydrate', conversations: validated.conversations }),
        settingsByModel: validated.modelSettings,
        modelSettings: this.state.activeModel
          ? validated.modelSettings[this.state.activeModel.id] ?? { ...DEFAULT_MODEL_SETTINGS }
          : { ...DEFAULT_MODEL_SETTINGS },
      });
    }
  }

  exportData() {
    return this.data() ?? emptyEnvelope();
  }
}
