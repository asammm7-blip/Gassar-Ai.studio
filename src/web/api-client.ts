import { storage } from './storage';

const API_BASE_KEY = 'gassar_api_base_url';
const DEFAULT_REMOTE_API =
  ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL || '').trim();

let cachedApiBase: string | null = null;

export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

export async function getApiBaseUrl(): Promise<string> {
  if (cachedApiBase !== null) return cachedApiBase;
  const saved = await storage.getItem(API_BASE_KEY);
  cachedApiBase = normalizeApiBase(saved ?? DEFAULT_REMOTE_API);
  return cachedApiBase;
}

export async function setApiBaseUrl(url: string): Promise<string> {
  const normalized = normalizeApiBase(url);
  cachedApiBase = normalized;
  if (normalized) {
    await storage.setItem(API_BASE_KEY, normalized);
  } else {
    await storage.removeItem(API_BASE_KEY);
  }
  return normalized;
}

export function normalizeApiBase(url: string): string {
  const clean = url.trim().replace(/\/+$/, '');
  if (!clean) return '';
  if (!/^https?:\/\//i.test(clean)) return '';
  return clean;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (path.startsWith('http')) {
    return fetch(path, init);
  }
  const base = await getApiBaseUrl();
  if (!base && isCapacitorNative()) {
    throw new Error(
      'تطبيق أندرويد المستقل غير مربوط بخادم بعد: افتح الإعدادات ← عنوان الخادم للتطبيق المستقل (APK) وأدخل رابط الخادم.',
    );
  }
  const target = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(target, init);
}

export async function testServerConnection(overrideBaseUrl?: string): Promise<{
  ok: boolean;
  baseUrl: string;
  providers?: Record<string, boolean>;
  message: string;
}> {
  const base = overrideBaseUrl !== undefined ? normalizeApiBase(overrideBaseUrl) : await getApiBaseUrl();
  if (!base && isCapacitorNative()) {
    return {
      ok: false,
      baseUrl: '',
      message: 'أدخل رابط الخادم بصيغة https://... أولاً.',
    };
  }
  try {
    const healthRes = await fetch(`${base}/api/health`);
    if (!healthRes.ok) {
      return {
        ok: false,
        baseUrl: base,
        message: `الخادم استجاب برمز خطأ (${healthRes.status}).`,
      };
    }
    const statusRes = await fetch(`${base}/api/cloud/status`);
    if (!statusRes.ok) {
      return { ok: true, baseUrl: base, message: 'الخادم متصل بنجاح.' };
    }
    const statusData = (await statusRes.json().catch(() => ({}))) as { providers?: Record<string, boolean> };
    return {
      ok: true,
      baseUrl: base,
      providers: statusData.providers,
      message: 'تم الاتصال بالخادم بنجاح.',
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl: base,
      message: error instanceof Error ? `تعذر الوصول إلى الخادم: ${error.message}` : 'تعذر الوصول إلى الخادم.',
    };
  }
}
