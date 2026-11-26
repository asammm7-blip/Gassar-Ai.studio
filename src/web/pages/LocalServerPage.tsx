import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Server, CheckCircle2, Cpu, RefreshCw, Info, Smartphone } from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { useRouter } from '../contexts/RouterContext';
import { apiFetch } from '../api-client';

interface ServerStatus {
  mode: string;
  nativeInferenceAvailable: boolean;
  androidCapacitorReady?: boolean;
  endpoints: Record<string, string>;
}

export function LocalServerPage() {
  const { state } = useChatContext();
  const { language } = useAppSettings();
  const isEn = language === 'en';
  const router = useRouter();
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await apiFetch('/api/local-server/status');
      if (res.ok) {
        return (await res.json()) as ServerStatus;
      }
      return null;
    } catch {
      return null;
    }
  };

  const loadStatus = async () => {
    setLoading(true);
    setStatus(await fetchStatus());
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void fetchStatus().then((data) => {
      if (active) {
        setStatus(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const BackIcon = isEn ? ArrowLeft : ArrowRight;

  return (
    <div className="flex flex-col h-full min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 border-b"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => router.back()} className="p-2 rounded-xl hover:bg-black/5 cursor-pointer">
            <BackIcon size={20} />
          </button>
          <h1 className="text-lg font-bold">{isEn ? 'Local Server & API' : 'الخادم المحلي وواجهة API'}</h1>
        </div>
        <button type="button" onClick={() => void loadStatus()} className="p-2 rounded-xl hover:bg-black/5 cursor-pointer">
          <RefreshCw size={18} style={{ color: 'var(--muted)' }} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="p-5 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center text-white"
                  style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))' }}
                >
                  <Server size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-bold">Gassar.AI Server</h2>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {loading
                      ? isEn
                        ? 'Checking status...'
                        : 'جاري التحقق...'
                      : status
                        ? isEn
                          ? 'Connected & ready on port 3000'
                          : 'متصل وجاهز على المنفذ 3000'
                        : isEn
                          ? 'Could not reach server'
                          : 'تعذر التحقق من الحالة'}
                  </p>
                </div>
              </div>
              {status && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ backgroundColor: 'rgba(52,168,83,0.14)', color: 'var(--success)' }}
                >
                  <CheckCircle2 size={13} />
                  <span>{isEn ? 'Online' : 'نشط'}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}>
              <Cpu size={15} style={{ color: 'var(--primary)' }} />
              <span className="font-semibold">{isEn ? 'Active Model:' : 'النموذج النشط:'}</span>
              <span style={{ color: 'var(--muted)' }}>{state.activeModel?.name ?? (isEn ? 'None' : 'لا يوجد')}</span>
            </div>
          </div>

          <div
            className="flex items-start gap-3 p-4 rounded-2xl border text-xs leading-relaxed"
            style={{ backgroundColor: 'var(--surface-variant)', borderColor: 'var(--border)' }}
          >
            <Smartphone size={17} style={{ color: 'var(--secondary)' }} className="shrink-0 mt-0.5" />
            <span>
              {isEn
                ? 'Standalone Android APK project (/android, com.gassar.ai) is synced via Capacitor from dist/client. Configure your deployed Gassar.AI server URL in Settings so the Android APK connects cleanly over HTTPS.'
                : 'مشروع Android APK المستقل (/android، المعرف com.gassar.ai) متزامن عبر Capacitor مع مخرجات البناء dist/client. اضبط عنوان الخادم المنشور في صفحة الإعدادات ليعمل تطبيق Android APK مباشرة عبر HTTPS.'}
            </span>
          </div>

          <div
            className="flex items-start gap-3 p-4 rounded-2xl border text-xs leading-relaxed"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <Info size={17} style={{ color: 'var(--primary)' }} className="shrink-0 mt-0.5" />
            <span>
              {isEn
                ? 'Express backend serves secure cloud streaming, PDF/DOCX document parsing, safe web URL reading, and live web search without exposing API keys to client code.'
                : 'خادم Express يدير البث السحابي المباشر، استخراج مستندات PDF وWord وExcel، قراءة الروابط الآمنة، وبحث الويب دون كشف مفاتيح API للمتصفح.'}
            </span>
          </div>

          {status && (
            <div className="p-4 rounded-2xl border space-y-2.5" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
              <h3 className="text-sm font-bold">{isEn ? 'Available API Endpoints' : 'نقاط النهاية المتاحة'}</h3>
              <div className="space-y-2">
                {Object.entries(status.endpoints).map(([name, path]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between px-3 py-2 rounded-xl border text-xs"
                    style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                  >
                    <span className="font-semibold">{name}</span>
                    <code dir="ltr" className="font-mono" style={{ color: 'var(--primary)' }}>
                      {path}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
