export const MAX_SAFE_MODEL_BYTES = 16 * 1024 * 1024 * 1024;
export const SUPPORTED_MODEL_EXTENSIONS = ['gguf'] as const;

export function getModelExtension(nameOrUri: string): string {
  const withoutQuery = nameOrUri.split(/[?#]/, 1)[0] ?? nameOrUri;
  const fileName = withoutQuery.split('/').pop() ?? withoutQuery;
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
}

export function sanitizeModelFileName(name: string): string {
  const baseName = name.split(/[?#]/, 1)[0]?.split('/').pop() || 'model.gguf';
  return baseName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'model.gguf';
}

export function getDisplayModelName(name: string): string {
  const baseName = name.split(/[?#]/, 1)[0]?.split('/').pop() || 'model.gguf';
  const withoutUuid = baseName.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[\s_-]*/i,
    '',
  );
  return (withoutUuid || baseName).replace(/\s+/g, ' ').trim().slice(0, 96) || 'model.gguf';
}

export function validateModelMetadata(nameOrUri: string, size: number | undefined): string | null {
  const extension = getModelExtension(nameOrUri);
  if (!SUPPORTED_MODEL_EXTENSIONS.includes(extension as (typeof SUPPORTED_MODEL_EXTENSIONS)[number])) {
    return 'نوع الملف غير مدعوم. اختر نموذجاً بصيغة GGUF وامتداد .gguf فقط.';
  }
  if (!size || size <= 0) return 'ملف نموذج GGUF فارغ أو تعذر قراءة حجمه.';
  if (size > MAX_SAFE_MODEL_BYTES) {
    return 'حجم نموذج GGUF أكبر من 16GB، وهو خارج نطاق التخزين الآمن.';
  }
  return null;
}
