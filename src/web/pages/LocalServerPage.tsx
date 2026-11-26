import React, { useEffect, useState } from 'react';
import { ArrowRight, Server, CheckCircle2, Cpu, RefreshCw, Info } from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import { useRouter } from '../contexts/RouterContext';

interface ServerStatus {
  mode: string;
  nativeInferenceAvailable: boolean;
  endpoints: Record<string, string>;
}

export function LocalServerPage() {
  const { state } = useChatContext();
  const router = useRouter();
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/local-server/status');
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

  return (
    <div className="flex flex-col h-full min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 border-b"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => router.back()} className="p-2 rounded-xl hover:bg-black/5 cursor-pointer">
            <ArrowRight size={20} />
          </button>
          <h1 className="text-lg font-bold">الخادم المحلي وواجهة API</h1>
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
                  <h2 className="text-sm font-bold">خادم Gassar.AI Web</h2>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {loading ? 'جاري التحقق...' : status ? 'متصل وجاهز على المنفذ 3000' : 'تعذر التحقق من الحالة'}
                  </p>
                </div>
              </div>
              {status && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ backgroundColor: 'rgba(52,168,83,0.14)', color: 'var(--success)' }}
                >
                  <CheckCircle2 size={13} />
                  <span>نشط</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}>
              <Cpu size={15} style={{ color: 'var(--primary)' }} />
              <span className="font-semibold">النموذج النشط:</span>
              <span style={{ color: 'var(--muted)' }}>{state.activeModel?.name ?? 'لا يوجد'}</span>
            </div>
          </div>

          <div
            className="flex items-start gap-3 p-4 rounded-2xl border text-xs leading-relaxed"
            style={{ backgroundColor: 'var(--surface-variant)', borderColor: 'var(--border)' }}
          >
            <Info size={17} style={{ color: 'var(--primary)' }} className="shrink-0 mt-0.5" />
            <span>
              في تطبيق Android الأصلي، يشغّل Gassar.AI خادم HTTP محلي في الخلفية لخدمة نماذج GGUF عبر الشبكة المحلية. في نسخة الويب الحالية، يعمل خادم Express المدمج كوسيط آمن لمزودي السحابة والبحث الويب.
            </span>
          </div>

          {status && (
            <div className="p-4 rounded-2xl border space-y-2.5" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
              <h3 className="text-sm font-bold">نقاط النهاية المتاحة</h3>
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
