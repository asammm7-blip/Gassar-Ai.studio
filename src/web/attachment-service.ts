import { extractDocumentText, isDocumentExtractableMime } from './document-extractor';

export type ChatAttachmentType = 'camera' | 'image' | 'file' | 'link';

export interface ChatAttachmentData {
  uri?: string;
  url?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
}

export interface ChatAttachment {
  type: ChatAttachmentType;
  data: ChatAttachmentData;
  name?: string;
}

export type PreparedInlineAttachment = {
  type: 'image' | 'file';
  name: string;
  mimeType: string;
  base64: string;
  text?: string;
};

export type ExtractedAttachmentText = { name: string; text: string };
export type AttachmentProgressCallback = (progress: {
  current: number;
  total: number;
  name: string;
  stage: 'reading' | 'ready' | 'skipped';
}) => void;

export const MAX_ATTACHMENT_BYTES = 512 * 1024 * 1024;
export const MAX_INLINE_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 64 * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = ['image/', 'text/'];
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/json',
  'application/xml',
  'application/rtf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export function normalizeAttachment(attachment: ChatAttachment): ChatAttachment {
  const data = attachment.data || {};
  return {
    type: attachment.type,
    name: attachment.name || data.name || 'مرفق',
    data: {
      ...data,
      name: attachment.name || data.name || 'مرفق',
      mimeType:
        !data.mimeType || data.mimeType === 'application/octet-stream'
          ? inferMimeType(data.name || attachment.name || '')
          : data.mimeType,
    },
  };
}

export function validateAttachments(attachments: ChatAttachment[]): ChatAttachment[] {
  const normalized = attachments.map(normalizeAttachment);
  let totalBytes = 0;
  for (const attachment of normalized) {
    if (attachment.type === 'link') {
      if (!attachment.data.url || !/^https?:\/\//i.test(attachment.data.url)) {
        throw new Error(`الرابط غير صالح: ${attachment.data.url || 'فارغ'}`);
      }
      continue;
    }
    const size = attachment.data.size;
    if (typeof size === 'number' && size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`الملف «${attachment.name}» أكبر من الحد المدعوم (512 MB).`);
    }
    if (typeof size === 'number' && Number.isFinite(size) && size >= 0) totalBytes += size;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new Error('إجمالي أحجام المرفقات يتجاوز الحد المدعوم (64 MB). أرسل الملفات على دفعات.');
    }
    const mimeType = attachment.data.mimeType || 'application/octet-stream';
    if (!isSupportedMimeType(mimeType)) {
      throw new Error(`نوع الملف «${attachment.name}» غير مدعوم (${mimeType}).`);
    }
    if (!attachment.data.uri || !isReadableAttachmentUri(attachment.data.uri)) {
      throw new Error(`تعذر الوصول إلى الملف «${attachment.name}». أعد اختياره من الجهاز.`);
    }
  }
  return normalized;
}

export function isSupportedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.has(mimeType) || ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

export function buildAttachmentContext(attachments: ChatAttachment[], extractedText: ExtractedAttachmentText[] = []): string {
  if (!attachments.length) return '';
  const extractedByName = new Map<string, string[]>();
  for (const item of extractedText) {
    extractedByName.set(item.name, [...(extractedByName.get(item.name) || []), item.text]);
  }
  const lines = attachments.map((attachment) => {
    const data = attachment.data;
    if (attachment.type === 'link') return `- رابط: ${data.url}`;
    const size = typeof data.size === 'number' ? `، الحجم ${formatBytes(data.size)}` : '';
    const name = attachment.name || data.name || 'مرفق';
    const matching = extractedByName.get(name) || [];
    const extracted = matching.shift();
    return `- ${name} (${data.mimeType || 'نوع غير معروف'}${size})${extracted ? `\n  النص المستخرج:\n${extracted}` : ''}`;
  });
  return `\n\n[مرفقات الرسالة — استخدمها في الإجابة إن كان النموذج يدعمها]\n${lines.join('\n')}`;
}

async function readUriAsBase64(uri: string): Promise<string> {
  if (uri.startsWith('data:')) {
    const comma = uri.indexOf(',');
    return comma >= 0 ? uri.slice(comma + 1) : uri;
  }
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('تعذر قراءة الملف المحدد في المتصفح.');
  }
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('تعذر تحويل الملف إلى Base64.'));
    reader.readAsDataURL(blob);
  });
}

export async function prepareInlineAttachments(
  attachments: ChatAttachment[],
  onProgress?: AttachmentProgressCallback,
): Promise<PreparedInlineAttachment[]> {
  const prepared: PreparedInlineAttachment[] = [];
  let totalInlineBytes = 0;
  for (const [index, attachment] of attachments.entries()) {
    const name = attachment.name || attachment.data.name || 'مرفق';
    onProgress?.({ current: index + 1, total: attachments.length, name, stage: 'reading' });
    if (attachment.type === 'link' || !attachment.data.uri) continue;
    const mimeType = attachment.data.mimeType || 'application/octet-stream';
    const size = attachment.data.size;
    if (typeof size === 'number' && size > MAX_INLINE_ATTACHMENT_BYTES) {
      onProgress?.({ current: index + 1, total: attachments.length, name, stage: 'skipped' });
      continue;
    }
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf' && !mimeType.startsWith('text/')) {
      onProgress?.({ current: index + 1, total: attachments.length, name, stage: 'skipped' });
      continue;
    }
    const base64 = await readUriAsBase64(attachment.data.uri);
    const actualBytes =
      typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : Math.floor(base64.length * 0.75);
    if (totalInlineBytes + actualBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      onProgress?.({ current: index + 1, total: attachments.length, name, stage: 'skipped' });
      throw new Error('إجمالي المرفقات المضمنة يتجاوز 64 MB؛ أرسل الملفات على دفعات.');
    }
    totalInlineBytes += actualBytes;
    prepared.push({
      type: attachment.type === 'image' || attachment.type === 'camera' ? 'image' : 'file',
      name,
      mimeType,
      base64,
    });
    onProgress?.({ current: index + 1, total: attachments.length, name, stage: 'ready' });
  }
  return prepared;
}

export async function extractTextAttachments(
  attachments: ChatAttachment[],
  onProgress?: AttachmentProgressCallback,
): Promise<ExtractedAttachmentText[]> {
  const extracted: ExtractedAttachmentText[] = [];
  const textAttachments = attachments.filter((attachment) =>
    isDocumentExtractableMime(attachment.data.mimeType || '', attachment.name || attachment.data.name || ''),
  );
  for (const [index, attachment] of textAttachments.entries()) {
    const name = attachment.name || attachment.data.name || 'مرفق';
    onProgress?.({ current: index, total: textAttachments.length, name, stage: 'reading' });
    const size = attachment.data.size;
    if (!attachment.data.uri || (typeof size === 'number' && size > 20 * 1024 * 1024)) {
      onProgress?.({ current: index + 1, total: textAttachments.length, name, stage: 'skipped' });
      continue;
    }
    const base64 = await readUriAsBase64(attachment.data.uri);
    const text = await extractDocumentText({
      name,
      mimeType: attachment.data.mimeType || 'text/plain',
      base64,
    });
    extracted.push({ name, text });
    onProgress?.({ current: index + 1, total: textAttachments.length, name, stage: 'ready' });
  }
  return extracted;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function inferMimeType(name: string): string {
  const extension = name.toLowerCase().split('.').pop();
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    xml: 'application/xml',
    rtf: 'application/rtf',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return (extension && map[extension]) || 'application/octet-stream';
}

function isReadableAttachmentUri(uri: string): boolean {
  return /^(?:data|blob|https?):/i.test(uri);
}
