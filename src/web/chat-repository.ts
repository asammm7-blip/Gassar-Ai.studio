import { z } from 'zod';
import { conversationSchema, modelSettingsSchema, type Conversation, type ModelSettings } from './chat-data';

export interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type DataIdentity = { kind: 'guest' } | { kind: 'local' | 'verified'; id: string };
export const namespaceFor = (identity: DataIdentity) =>
  identity.kind === 'guest' ? 'guest' : `${identity.kind}:${encodeURIComponent(identity.id)}`;
export const dataKey = (namespace: string) => `gassar_data_v2:${namespace}`;

const envelopeSchema = z
  .object({
    version: z.literal(2),
    conversations: z.array(conversationSchema).max(5000),
    modelSettings: z.record(z.string(), modelSettingsSchema).default({}),
  })
  .refine((data) => new Set(data.conversations.map((c) => c.id)).size === data.conversations.length, 'معرف محادثة مكرر');

export interface DataEnvelope {
  version: 2;
  conversations: Conversation[];
  modelSettings: Record<string, ModelSettings>;
}

export const emptyEnvelope = (): DataEnvelope => ({ version: 2, conversations: [], modelSettings: {} });
export interface Hydration {
  data: DataEnvelope;
  warnings: string[];
  saveHistory: boolean;
}

export class ChatRepository {
  private queue: Promise<unknown> = Promise.resolve();
  private disabled = false;
  private hydrated = new Set<string>();
  private deleted = new Set<string>();
  private policyEpoch = 0;
  private policyControlled = false;

  constructor(private storage: Storage) {}

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.queue.catch(() => undefined).then(operation);
    this.queue = task;
    return task;
  }

  async hydrate(namespace: string): Promise<Hydration> {
    const policyEpoch = this.policyEpoch;
    return this.serial(async () => {
      if (this.deleted.has(namespace)) throw new Error('النطاق محذوف');
      const policy = await this.storage.getItem('gassar_save_history');
      if (!this.policyControlled && policyEpoch === this.policyEpoch) this.disabled = policy === 'false';
      const raw = await this.storage.getItem(dataKey(namespace));
      const warnings: string[] = [];
      let data = emptyEnvelope();
      if (raw) {
        data = this.parseSalvage(raw, warnings);
      }
      this.hydrated.add(namespace);
      return { data, warnings, saveHistory: !this.disabled };
    });
  }

  private parseSalvage(raw: string, warnings: string[]): DataEnvelope {
    if (raw.length > 64 * 1024 * 1024) throw new Error('سجل كبير يتطلب استرداداً؛ لم يتم تغييره');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('سجل تالف؛ النسخة الأصلية محفوظة ولم يتم تغييرها');
    }
    const full = envelopeSchema.safeParse(parsed);
    if (full.success) return full.data;
    const candidates = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 2 && 'conversations' in parsed
        ? parsed.conversations
        : null;
    if (!Array.isArray(candidates)) throw new Error('إصدار أو مخطط السجل غير صالح؛ الأصل محفوظ');
    const data = emptyEnvelope();
    const ids = new Set<string>();
    for (const candidate of candidates) {
      const c = conversationSchema.safeParse(candidate);
      if (c.success && !ids.has(c.data.id)) {
        data.conversations.push(c.data);
        ids.add(c.data.id);
      } else {
        warnings.push('تم عزل محادثة غير سليمة؛ لم تحذف من النسخة الأصلية.');
      }
    }
    if (parsed && !Array.isArray(parsed) && typeof parsed === 'object' && 'modelSettings' in parsed) {
      const settings = z.record(z.string(), modelSettingsSchema).safeParse(parsed.modelSettings);
      if (settings.success) data.modelSettings = settings.data;
    }
    return data;
  }

  persist(namespace: string, data: DataEnvelope): Promise<void> {
    const snapshot = envelopeSchema.parse(data);
    if (this.disabled) return Promise.resolve();
    return this.serial(async () => {
      if (!this.hydrated.has(namespace)) throw new Error('لم تكتمل استعادة البيانات');
      if (this.deleted.has(namespace)) return;
      if (this.disabled) return;
      const existing = await this.storage.getItem(dataKey(namespace));
      let old = emptyEnvelope();
      if (existing) {
        const parsed = envelopeSchema.safeParse(JSON.parse(existing));
        if (!parsed.success) throw new Error('رفض الكتابة فوق سجل تالف؛ استخدم استرداداً مؤكداً');
        old = parsed.data;
      }
      if (this.disabled || this.deleted.has(namespace)) return;
      const saved = snapshot.conversations.filter((c) => c.retention !== 'temporary');
      const preserved = old.conversations.filter((c) =>
        snapshot.conversations.some((s) => s.id === c.id && s.retention === 'temporary'),
      );
      await this.storage.setItem(dataKey(namespace), JSON.stringify({ ...snapshot, conversations: [...saved, ...preserved] }));
    });
  }

  setSaveHistory(enabled: boolean): Promise<void> {
    this.policyEpoch++;
    this.policyControlled = true;
    this.disabled = !enabled;
    return this.serial(() => this.storage.setItem('gassar_save_history', String(enabled)));
  }

  deleteConversation(namespace: string, id: string): Promise<void> {
    return this.serial(async () => {
      const raw = await this.storage.getItem(dataKey(namespace));
      if (raw) {
        const data = envelopeSchema.parse(JSON.parse(raw));
        data.conversations = data.conversations.filter((c) => c.id !== id);
        await this.storage.setItem(dataKey(namespace), JSON.stringify(data));
      }
    });
  }

  clear(namespace: string): Promise<void> {
    return this.serial(async () => {
      await this.storage.removeItem(dataKey(namespace));
    });
  }

  deleteNamespace(namespace: string): Promise<void> {
    this.deleted.add(namespace);
    return this.serial(async () => {
      await this.storage.removeItem(dataKey(namespace));
      this.hydrated.delete(namespace);
    });
  }

  flush(): Promise<unknown> {
    return this.queue;
  }
}

export { envelopeSchema };
