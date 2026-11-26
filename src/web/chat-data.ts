import { z } from 'zod';
import type { LocalModel } from './local-model-manager';
import type { ChatAttachment, PreparedInlineAttachment } from './attachment-service';

const id = z.string().min(1).max(256);
const time = z.number().finite().nonnegative();

export const modelSettingsSchema = z.object({
  temperature: z.number().finite().min(0).max(2),
  topK: z.number().int().min(1).max(1000),
  topP: z.number().finite().min(0).max(1),
  minP: z.number().finite().min(0).max(1),
  xtcThreshold: z.number().finite().min(0).max(1),
  typicalP: z.number().finite().min(0).max(1),
  penaltyRepeat: z.number().finite().min(0).max(2),
  penaltyLastN: z.number().int().min(0).max(4096),
  nPredict: z.number().int().min(1).max(32768),
  systemInstructions: z.string().max(64000),
});

export type ModelSettings = z.infer<typeof modelSettingsSchema>;

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  temperature: 0.7,
  topK: 40,
  topP: 0.95,
  minP: 0.05,
  xtcThreshold: 0.1,
  typicalP: 0.97,
  penaltyRepeat: 1,
  penaltyLastN: 64,
  nPredict: 2048,
  systemInstructions: 'أنت مساعد ذكي مفيد وودود.',
};

const attachmentSchema = z.object({
  id: id.optional(),
  type: z.enum(['camera', 'image', 'file', 'link']),
  name: z.string().max(1024).optional(),
  data: z.object({
    uri: z.string().max(28 * 1024 * 1024).optional(),
    url: z.string().max(8192).optional(),
    name: z.string().max(1024).optional(),
    mimeType: z.string().max(256).optional(),
    size: time.optional(),
    width: time.optional(),
    height: time.optional(),
  }),
});

const inlineSchema = z.object({
  type: z.enum(['image', 'file']),
  name: z.string().max(1024),
  mimeType: z.string().max(256),
  base64: z.string().max(28 * 1024 * 1024),
  text: z.string().max(2000000).optional(),
});

export interface AttachmentSnapshot {
  version: 1;
  context: string;
  inline: PreparedInlineAttachment[];
}

const snapshotSchema = z.object({
  version: z.literal(1),
  context: z.string().max(2000000),
  inline: z.array(inlineSchema).max(16),
});

export const messageSchema = z
  .object({
    id,
    role: z.enum(['user', 'assistant']),
    content: z.string().max(2000000),
    timestamp: time,
    attachments: z.array(attachmentSchema).max(16).optional(),
    attachmentSnapshot: snapshotSchema.optional(),
    reasoning: z.string().max(2000000).optional(),
    feedback: z.enum(['up', 'down']).nullable().optional(),
    versions: z.array(z.string().max(2000000)).min(1).max(100).optional(),
    activeVersion: z.number().int().nonnegative().optional(),
    modelName: z.string().max(1024).optional(),
    generationStatus: z.enum(['pending', 'complete', 'failed', 'cancelled']).optional(),
    requestId: id.optional(),
  })
  .superRefine((m, ctx) => {
    if (m.activeVersion !== undefined && (!m.versions || m.activeVersion >= m.versions.length)) {
      ctx.addIssue({ code: 'custom', message: 'نسخة الرد خارج الحدود', path: ['activeVersion'] });
    }
  });

export type Message = z.infer<typeof messageSchema> & { attachments?: ChatAttachment[] };

const modelSchema = z.object({
  id,
  name: z.string().max(1024),
  path: z.string().max(8192),
  size: time,
  type: z.enum(['language', 'vision', 'embedding', 'image-generation']),
  isLoaded: z.boolean(),
  isActive: z.boolean(),
  version: z.string().max(256),
  description: z.string().max(16000),
  source: z.enum(['local', 'cloud']).optional(),
  provider: z.enum(['gemini', 'openai', 'anthropic', 'openrouter']).optional(),
  remoteModel: z.string().max(256).optional(),
  capabilities: z
    .object({
      vision: z.boolean().default(false),
      thinking: z.boolean().default(false),
      tools: z.boolean().default(false),
      embeddings: z.boolean().default(false),
      multimodalProjector: z.string().max(8192).optional(),
    })
    .optional(),
});

const branchSchema = z
  .object({
    id,
    label: z.string().max(256),
    createdAt: time,
    messages: z.array(messageSchema).max(10000),
  })
  .refine((b) => new Set(b.messages.map((m) => m.id)).size === b.messages.length, 'معرف رسالة فرع مكرر');

export const conversationSchema = z
  .object({
    id,
    title: z.string().max(1024),
    messages: z.array(messageSchema).max(10000),
    model: modelSchema.nullable(),
    createdAt: time,
    updatedAt: time,
    pinned: z.boolean().optional(),
    favorite: z.boolean().optional(),
    archived: z.boolean().optional(),
    branches: z.array(branchSchema).max(100).optional(),
    retention: z.enum(['saved', 'temporary']).optional(),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.messages.map((m) => m.id)).size !== c.messages.length) {
      ctx.addIssue({ code: 'custom', message: 'معرف رسالة مكرر' });
    }
    if (new Set(c.branches?.map((b) => b.id)).size !== (c.branches?.length ?? 0)) {
      ctx.addIssue({ code: 'custom', message: 'معرف فرع مكرر' });
    }
  });

export type Conversation = z.infer<typeof conversationSchema> & { model: LocalModel | null };
export interface ChatStore {
  byId: Record<string, Conversation>;
  currentId: string | null;
}

export type ChatAction =
  | { type: 'hydrate'; conversations: Conversation[] }
  | { type: 'select'; id: string | null }
  | { type: 'put'; conversation: Conversation }
  | { type: 'delete'; id: string }
  | { type: 'clear' }
  | { type: 'append'; id: string; message: Message }
  | { type: 'patchMessage'; id: string; messageId: string; patch: Partial<Message> }
  | { type: 'patchConversation'; id: string; patch: Partial<Conversation> };

export const EMPTY_STORE: ChatStore = { byId: {}, currentId: null };

export function chatReducer(state: ChatStore, action: ChatAction): ChatStore {
  if (action.type === 'hydrate') {
    return { byId: Object.fromEntries(action.conversations.map((c) => [c.id, c])), currentId: null };
  }
  if (action.type === 'select') {
    return { ...state, currentId: action.id && state.byId[action.id] ? action.id : null };
  }
  if (action.type === 'clear') return { byId: {}, currentId: null };
  if (action.type === 'put') return { ...state, byId: { ...state.byId, [action.conversation.id]: action.conversation } };
  if (action.type === 'delete') {
    const byId = { ...state.byId };
    delete byId[action.id];
    return { byId, currentId: state.currentId === action.id ? null : state.currentId };
  }
  const old = state.byId[action.id];
  if (!old) return state;
  let next: Conversation;
  if (action.type === 'append') {
    next = {
      ...old,
      messages: [...old.messages, action.message],
      title:
        !old.messages.length && action.message.role === 'user'
          ? action.message.content.trim().replace(/\s+/g, ' ').slice(0, 56) || old.title
          : old.title,
      updatedAt: Date.now(),
    };
  } else if (action.type === 'patchMessage') {
    next = {
      ...old,
      messages: old.messages.map((m) => (m.id === action.messageId ? { ...m, ...action.patch } : m)),
      updatedAt: Date.now(),
    };
  } else {
    next = { ...old, ...action.patch, id: old.id, updatedAt: Date.now() };
  }
  return { ...state, byId: { ...state.byId, [old.id]: next } };
}

export function selectConversations(
  store: ChatStore,
  options: { query?: string; favorite?: boolean; archived?: boolean; limit?: number } = {},
): Conversation[] {
  const query = options.query?.trim().toLocaleLowerCase();
  return Object.values(store.byId)
    .filter(
      (c) =>
        Boolean(c.archived) === Boolean(options.archived) &&
        (!options.favorite || c.favorite) &&
        (!query ||
          [c.title, ...c.messages.map((m) => m.content)].some((text) => text.toLocaleLowerCase().includes(query))),
    )
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
    .slice(0, options.limit ?? Infinity);
}

export function preserveBranch(c: Conversation, newId: string, label: string): Conversation {
  return {
    ...c,
    branches: [...(c.branches ?? []), { id: newId, label, createdAt: Date.now(), messages: c.messages.map((m) => ({ ...m })) }],
  };
}

export function displayedContent(m: Message): string {
  return m.versions?.[m.activeVersion ?? m.versions.length - 1] ?? m.content;
}

export { modelSchema };
