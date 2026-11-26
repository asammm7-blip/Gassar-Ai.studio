import {
  buildAttachmentContext,
  extractTextAttachments,
  prepareInlineAttachments,
  validateAttachments,
  type AttachmentProgressCallback,
  type ChatAttachment,
  type PreparedInlineAttachment,
} from './attachment-service';
import { isDocumentExtractableMime } from './document-extractor';
import type { LocalModel } from './local-model-manager';
import type { ConnectionMode } from './connection-mode';
import { displayedContent, type AttachmentSnapshot, type Message, type ModelSettings } from './chat-data';

export interface RequestHistory {
  role: 'user' | 'assistant';
  content: string;
  attachments?: PreparedInlineAttachment[];
}

export interface RequestFeatures {
  thinking: boolean;
  web: boolean;
}

export interface BuiltRequest {
  route: 'local' | 'cloud';
  model: LocalModel;
  settings: ModelSettings;
  features: RequestFeatures;
  prompt: string;
  history: RequestHistory[];
  attachments: PreparedInlineAttachment[];
  snapshot: AttachmentSnapshot;
}

export interface AttachmentReader {
  extract: typeof extractTextAttachments;
  inline: typeof prepareInlineAttachments;
}

export const defaultAttachmentReader: AttachmentReader = {
  extract: extractTextAttachments,
  inline: prepareInlineAttachments,
};

export function resolveRoute(mode: ConnectionMode, model: LocalModel | null): 'local' | 'cloud' {
  if (!model) throw new Error('يرجى اختيار نموذج أولاً؛ المسودة محفوظة.');
  const cloud = model.source === 'cloud';
  if (mode === 'offline' && cloud) throw new Error('النموذج السحابي لا يعمل في الوضع المحلي.');
  if (mode === 'online' && !cloud) throw new Error('اختر نموذجاً سحابياً أو الوضع المحلي/التلقائي؛ لا تحويل تلقائي إلى السحابة.');
  if (cloud && (!model.provider || !model.remoteModel)) throw new Error('إعداد النموذج السحابي غير مكتمل.');
  return cloud ? 'cloud' : 'local';
}

export async function snapshotAttachments(
  attachments: ChatAttachment[],
  route: 'local' | 'cloud',
  model: LocalModel,
  reader: AttachmentReader,
  progress?: AttachmentProgressCallback,
): Promise<AttachmentSnapshot> {
  const validated = validateAttachments(attachments);
  if (!validated.length) return { version: 1, context: '', inline: [] };
  for (const a of validated) {
    const mime = a.data.mimeType ?? '';
    if (a.type === 'link') continue;
    if (isDocumentExtractableMime(mime, a.name || a.data.name || '')) {
      if ((a.data.size ?? 0) > 20 * 1024 * 1024) throw new Error('استخراج هذا المستند الكبير غير متاح حالياً؛ لم يُرسل الملف.');
    } else if (mime.startsWith('image/')) {
      if (!model.capabilities?.vision) throw new Error('النموذج المختار لا يدعم الصور.');
    } else if (route === 'local') {
      throw new Error('هذا النوع من المستندات يحتاج استخراج نص محلياً قبل إرساله؛ لم يُرسل الملف.');
    } else if (mime !== 'application/pdf' || model.provider !== 'gemini') {
      throw new Error('محتوى هذا المرفق غير مدعوم في المزود المختار؛ لم يُرسل.');
    }
    if ((a.data.size ?? 0) > 20 * 1024 * 1024) throw new Error('المرفق أكبر من ميزانية الطلب المضمن؛ لم يُرسل.');
  }

  let skipped = false;
  const onProgress: AttachmentProgressCallback = (p) => {
    if (p.stage === 'skipped') skipped = true;
    progress?.(p);
  };
  const extracted = await reader.extract(validated, onProgress);
  const documentSources = validated.filter(
    (a) => a.type !== 'link' && isDocumentExtractableMime(a.data.mimeType ?? '', a.name || a.data.name || ''),
  );
  const binary = validated.filter((a) => a.type !== 'link' && !documentSources.includes(a));
  const inlineCandidates =
    route === 'local'
      ? binary.filter((a) => (a.data.mimeType ?? '').startsWith('image/'))
      : [...binary, ...documentSources.filter((a) => a.data.mimeType === 'application/pdf')];
  const inline = await reader.inline(inlineCandidates, onProgress);
  if (skipped || extracted.length !== documentSources.length || inline.length !== inlineCandidates.length) {
    throw new Error('تعذر تجهيز جميع مصادر الرسالة؛ أعد اختيار المرفق.');
  }
  return { version: 1, context: buildAttachmentContext(validated, extracted), inline };
}

export async function buildRequest(options: {
  mode: ConnectionMode;
  model: LocalModel | null;
  settings: ModelSettings;
  target: Message;
  before: Message[];
  reader?: AttachmentReader;
  progress?: AttachmentProgressCallback;
  features?: Partial<RequestFeatures>;
}): Promise<BuiltRequest> {
  const route = resolveRoute(options.mode, options.model);
  const model = options.model!;
  const materialize = async (m: Message): Promise<AttachmentSnapshot> => {
    if (m.attachmentSnapshot) return m.attachmentSnapshot;
    return snapshotAttachments(m.attachments ?? [], route, model, options.reader ?? defaultAttachmentReader, options.progress);
  };
  const snapshot = await materialize(options.target);
  const history: RequestHistory[] = [];
  for (const m of options.before.slice(-12)) {
    const s = m.role === 'user' ? await materialize(m) : undefined;
    history.push({
      role: m.role,
      content: displayedContent(m) + (s?.context ?? ''),
      ...(s?.inline.length ? { attachments: s.inline } : {}),
    });
  }
  const features: RequestFeatures = {
    thinking: Boolean(options.features?.thinking),
    web: Boolean(options.features?.web),
  };
  const featurePrompt = [
    features.thinking ? '\n[وضع التفكير مفعّل: استخدم reasoning الداخلي للنموذج إن كان مدعوماً.]' : '',
    features.web ? '\n[وضع الويب مفعّل: استخدم أداة البحث المهيأة إن كانت متاحة، ولا تخترع نتائج أو روابط.]' : '',
  ].join('');
  return {
    route,
    model,
    settings: { ...options.settings },
    features,
    prompt: options.target.content + snapshot.context + featurePrompt,
    history,
    attachments: snapshot.inline,
    snapshot,
  };
}
