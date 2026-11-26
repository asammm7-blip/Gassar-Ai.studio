import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, AlertCircle, Loader2, ShieldCheck, RefreshCw } from 'lucide-react';
import { useRouter } from '../contexts/RouterContext';
import { cloudModelService, type CloudAccessResult, type CloudProvider } from '../cloud-model-service';

const PROVIDERS: { id: CloudProvider; envVar: string; defaultModel: string }[] = [
  { id: 'gemini', envVar: 'GEMINI_API_KEY', defaultModel: 'gemini-2.5-flash' },
  { id: 'openai', envVar: 'OPENAI_API_KEY', defaultModel: 'gpt-4o-mini' },
  { id: 'anthropic', envVar: 'ANTHROPIC_API_KEY', defaultModel: 'claude-3-7-sonnet-latest' },
  { id: 'openrouter', envVar: 'OPENROUTER_API_KEY', defaultModel: 'openrouter/auto' },
];

export function CloudModelSettingsPage() {
  const router = useRouter();
  const [configured, setConfigured] = useState<Record<CloudProvider, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false,
    openrouter: false,
  });
  const [testing, setTesting] = useState<CloudProvider | null>(null);
  const [results, setResults] = useState<Partial<Record<CloudProvider, CloudAccessResult>>>({});

  const loadStatus = async () => {
    const status = await cloudModelService.getConfiguredProviders();
    setConfigured(status);
  };

  useEffect(() => {
    let active = true;
    void cloudModelService.getConfiguredProviders().then((status) => {
      if (active) setConfigured(status);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleTest = async (provider: CloudProvider, defaultModel: string) => {
    setTesting(provider);
    const res = await cloudModelService.testConnection(provider, defaultModel);
    setResults((prev) => ({ ...prev, [provider]: res }));
    setTesting(null);
  };

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
          <h1 className="text-lg font-bold">مزودو النماذج السحابية</h1>
        </div>
        <button
          type="button"
          onClick={() => void loadStatus()}
          className="p-2 rounded-xl hover:bg-black/5 cursor-pointer"
          title="تحديث الحالة"
        >
          <RefreshCw size={18} style={{ color: 'var(--muted)' }} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <div
            className="flex items-start gap-3 p-4 rounded-2xl border text-xs leading-relaxed"
            style={{ backgroundColor: 'var(--surface-variant)', borderColor: 'var(--border)' }}
          >
            <ShieldCheck size={18} style={{ color: 'var(--primary)' }} className="shrink-0 mt-0.5" />
            <span>
              تُدار مفاتيح واجهات البرمجة بأمان على الخادم عبر متغيرات البيئة دون تخزينها أو كشفها في المتصفح. يمكنك فحص جاهزية كل مزود أدناه.
            </span>
          </div>

          {PROVIDERS.map((item) => {
            const ready = configured[item.id];
            const res = results[item.id];
            const isTesting = testing === item.id;
            return (
              <div
                key={item.id}
                className="p-4 rounded-2xl border space-y-3"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold">{cloudModelService.getProviderLabel(item.id)}</h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      متغير البيئة: <code className="font-mono">{item.envVar}</code>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: ready ? 'rgba(52,168,83,0.14)' : 'rgba(234,67,53,0.12)',
                        color: ready ? 'var(--success)' : 'var(--error)',
                      }}
                    >
                      {ready ? 'مضبوط' : 'غير مضبوط'}
                    </span>
                    <button
                      type="button"
                      disabled={isTesting}
                      onClick={() => void handleTest(item.id, item.defaultModel)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white cursor-pointer disabled:opacity-50"
                      style={{ backgroundColor: 'var(--primary)' }}
                    >
                      {isTesting && <Loader2 size={13} className="animate-spin" />}
                      <span>اختبار الاتصال</span>
                    </button>
                  </div>
                </div>

                {res && (
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
                    style={{
                      backgroundColor: res.ok ? 'rgba(52,168,83,0.12)' : 'rgba(234,67,53,0.1)',
                      color: res.ok ? 'var(--success)' : 'var(--error)',
                    }}
                  >
                    {res.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                    <span>
                      {res.ok ? `تم التحقق من الاتصال بنجاح (${res.model})` : res.message}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
