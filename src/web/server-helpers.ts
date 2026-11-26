import net from 'node:net';

export interface ParsedWebResult {
  title: string;
  url: string;
  snippet: string;
}

export function isBlockedIpAddress(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('::ffff:')) {
    return isBlockedIpAddress(normalized.slice('::ffff:'.length));
  }
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }
  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
  }
  return false;
}

export function validateExternalHttpUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('صيغة الرابط غير صالحة.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('يُسمح بروابط http و https فقط.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('الروابط التي تحتوي على بيانات اعتماد غير مسموح بها.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('الوصول إلى العناوين المحلية أو الداخلية غير مسموح به.');
  }
  if (net.isIP(host) && isBlockedIpAddress(host)) {
    throw new Error('عنوان IP غير مسموح به.');
  }
  return parsed;
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number(num);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    });
}

export function extractReadableTextFromHtml(html: string, maxChars = 15000): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeHtmlEntities((titleMatch?.[1] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());

  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|section|article|br)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const text = decodeHtmlEntities(stripped)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, maxChars);

  return { title, text };
}

export function parseDuckDuckGoHtmlResults(html: string, limit = 5): ParsedWebResult[] {
  const results: ParsedWebResult[] = [];
  const anchorRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) && results.length < limit) {
    let url = decodeHtmlEntities(match[1] || '').trim();
    if (url.startsWith('//')) url = `https:${url}`;
    const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
    if (uddgMatch) {
      try {
        url = decodeURIComponent(uddgMatch[1]);
      } catch {
        // keep original
      }
    }
    if (!/^https?:\/\//i.test(url)) continue;
    const title = decodeHtmlEntities((match[2] || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const afterAnchor = html.slice(anchorRegex.lastIndex, anchorRegex.lastIndex + 1500);
    const snippetMatch = afterAnchor.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/i);
    const snippet = decodeHtmlEntities((snippetMatch?.[1] || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (title) {
      results.push({
        title: title.slice(0, 180),
        url,
        snippet: (snippet || title).slice(0, 600),
      });
    }
  }
  return results;
}

export function resolveGeminiTargetModel(model: string): {
  targetModel: string;
  isGemini4: boolean;
  isGemma: boolean;
  supportsThinkingLevel: boolean;
  supportsThinkingBudget: boolean;
  supportsSamplingParams: boolean;
  supportsSearchTool: boolean;
} {
  const trimmed = (model || 'gemini-4-hydrogen').trim();
  let targetModel = trimmed;
  if (/^gemini-3\.8-flash|^gemini-3\.6-flash/i.test(trimmed)) targetModel = 'gemini-4-hydrogen';
  else if (/^gemini-3\.5-flash-lite/i.test(trimmed)) targetModel = 'gemini-3.1-flash-lite';
  else if (/^gemini-3\.1-pro/i.test(trimmed)) targetModel = 'gemini-2.5-pro';

  const lower = targetModel.toLowerCase();
  const isGemma = lower.startsWith('gemma');
  const isGemini4 = lower.startsWith('gemini-4');
  const isGemini3 = lower.startsWith('gemini-3');
  const isGemini25 = lower.startsWith('gemini-2.5');

  return {
    targetModel,
    isGemini4,
    isGemma,
    supportsThinkingLevel: isGemini4 || isGemini3,
    supportsThinkingBudget: isGemini25,
    supportsSamplingParams: !isGemini4,
    supportsSearchTool: !isGemma,
  };
}

export type ClassifiedCloudErrorCode =
  | 'missing_key'
  | 'invalid_key'
  | 'billing_required'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export function classifyCloudApiError(
  providerLabel: string,
  error: unknown,
  statusHint?: number,
): { code: ClassifiedCloudErrorCode; status?: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  let parsedMessage = raw;
  let parsedStatus = statusHint;
  let apiStatus = '';
  let reason = '';

  const jsonStart = raw.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        error?: {
          code?: number;
          status?: string;
          message?: string;
          details?: Array<{ reason?: string }>;
        };
      };
      if (parsed?.error) {
        if (typeof parsed.error.code === 'number') parsedStatus = parsed.error.code;
        if (typeof parsed.error.status === 'string') apiStatus = parsed.error.status;
        if (typeof parsed.error.message === 'string') parsedMessage = parsed.error.message;
        const foundReason = parsed.error.details?.find((d) => typeof d.reason === 'string')?.reason;
        if (foundReason) reason = foundReason;
      }
    } catch {
      // Keep raw string
    }
  }

  const combined = `${apiStatus} ${reason} ${parsedMessage} ${raw}`.toLowerCase();

  if (reason === 'API_KEY_INVALID' || combined.includes('api key not valid') || parsedStatus === 401) {
    return {
      code: 'invalid_key',
      status: parsedStatus ?? 400,
      message: `مفتاح ${providerLabel} غير صالح. يرجى التحقق من المفتاح في إعدادات الأسرار على الخادم (Settings > Secrets).`,
    };
  }
  if (combined.includes('billing') || combined.includes('quota') && combined.includes('paid')) {
    return {
      code: 'billing_required',
      status: parsedStatus ?? 403,
      message: `يتطلب هذا النموذج في ${providerLabel} تفعيل الفوترة أو خطة مدفوعة.`,
    };
  }
  if (parsedStatus === 403 || apiStatus === 'PERMISSION_DENIED' || combined.includes('permission_denied')) {
    return {
      code: 'forbidden',
      status: 403,
      message: `تم رفض الصلاحية من ${providerLabel}: تأكد من صلاحيات المفتاح في Settings > Secrets.`,
    };
  }
  if (parsedStatus === 404 || apiStatus === 'NOT_FOUND' || combined.includes('not found')) {
    return {
      code: 'not_found',
      status: 404,
      message: `النموذج المطلوب غير متاح أو غير مدعوم في ${providerLabel} (${parsedMessage}).`,
    };
  }
  if (parsedStatus === 429 || apiStatus === 'RESOURCE_EXHAUSTED' || combined.includes('rate limit') || combined.includes('resource_exhausted')) {
    return {
      code: 'rate_limited',
      status: 429,
      message: `تم تجاوز حد الطلبات المؤقت لدى ${providerLabel}. انتظر قليلاً ثم أعد المحاولة.`,
    };
  }
  if (combined.includes('fetch failed') || combined.includes('enotfound') || combined.includes('econnrefused') || combined.includes('etimedout')) {
    return {
      code: 'network',
      status: parsedStatus,
      message: `تعذر الوصول عبر الشبكة إلى ${providerLabel}.`,
    };
  }

  return {
    code: 'unknown',
    status: parsedStatus,
    message: parsedMessage || `تعذر إتمام الطلب مع ${providerLabel}.`,
  };
}
