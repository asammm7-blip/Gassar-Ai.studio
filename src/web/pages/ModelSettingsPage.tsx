import React, { useState } from 'react';
import { ArrowRight, RotateCcw, Save, SlidersHorizontal, Info } from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import { useRouter } from '../contexts/RouterContext';
import { useToast } from '../contexts/ToastContext';
import { DEFAULT_MODEL_SETTINGS, type ModelSettings } from '../chat-data';

export function ModelSettingsPage() {
  const { state, updateModelSettings } = useChatContext();
  const router = useRouter();
  const { showToast, confirm } = useToast();

  const [draft, setDraft] = useState<{ modelId: string | null; values: ModelSettings } | null>(null);
  const [saving, setSaving] = useState(false);

  const activeId = state.activeModel?.id ?? null;
  const form = draft && draft.modelId === activeId ? draft.values : state.modelSettings;
  const setForm = (next: ModelSettings) => setDraft({ modelId: activeId, values: next });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.activeModel) {
      showToast('اختر نموذجاً أولاً قبل حفظ الإعدادات', 'error');
      return;
    }
    setSaving(true);
    try {
      await updateModelSettings(form);
      showToast('تم حفظ إعدادات النموذج', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر حفظ الإعدادات', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: 'استعادة الافتراضي',
      message: 'هل تريد إعادة جميع معاملات النموذج إلى القيم الافتراضية؟',
      confirmLabel: 'استعادة',
    });
    if (!ok) return;
    setForm({ ...DEFAULT_MODEL_SETTINGS });
    if (state.activeModel) {
      await updateModelSettings(DEFAULT_MODEL_SETTINGS);
    }
    showToast('تمت استعادة الإعدادات الافتراضية', 'info');
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
          <div>
            <h1 className="text-lg font-bold">إعدادات النموذج</h1>
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
              {state.activeModel?.name ?? 'لا يوجد نموذج محدد'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleReset()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <RotateCcw size={14} />
          <span>افتراضي</span>
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <form onSubmit={(e) => void handleSave(e)} className="max-w-2xl mx-auto space-y-5">
          {/* System Instructions */}
          <section className="p-4 rounded-2xl border space-y-2.5" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <label className="block text-sm font-bold">تعليمات النظام (System Prompt)</label>
            <textarea
              value={form.systemInstructions}
              onChange={(e) => setForm({ ...form, systemInstructions: e.target.value })}
              rows={4}
              placeholder="مثال: أنت مساعد ذكي يقدّم إجابات دقيقة ومنظمة بالعربية..."
              className="w-full rounded-xl border p-3 text-sm outline-none resize-y"
              style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </section>

          {/* Sampling Parameters */}
          <section className="p-4 rounded-2xl border space-y-4" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={16} style={{ color: 'var(--primary)' }} />
              <h2 className="text-sm font-bold">معاملات التوليد</h2>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span>درجة الإبداع (Temperature)</span>
                <span style={{ color: 'var(--primary)' }}>{form.temperature.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span>Top P</span>
                <span style={{ color: 'var(--primary)' }}>{form.topP.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={form.topP}
                onChange={(e) => setForm({ ...form, topP: Number(e.target.value) })}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Top K (1 - 1000)</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={form.topK}
                  onChange={(e) => setForm({ ...form, topK: Math.min(1000, Math.max(1, Number(e.target.value) || 40)) })}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">الحد الأقصى للرموز (N Predict)</label>
                <input
                  type="number"
                  min={64}
                  max={32768}
                  step={64}
                  value={form.nPredict}
                  onChange={(e) => setForm({ ...form, nPredict: Math.min(32768, Math.max(1, Number(e.target.value) || 2048)) })}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
            </div>
          </section>

          {/* Local Advanced Info */}
          <section
            className="flex items-start gap-3 p-4 rounded-2xl border text-xs leading-relaxed"
            style={{ backgroundColor: 'var(--surface-variant)', borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            <Info size={16} style={{ color: 'var(--primary)' }} className="shrink-0 mt-0.5" />
            <span>
              المعاملات المحلية الإضافية (Min P: {form.minP}، Typical P: {form.typicalP}، Repeat Penalty: {form.penaltyRepeat}) تُحفظ ضمن إعدادات النموذج وتُطبَّق تلقائياً عند تشغيل GGUF محلياً.
            </span>
          </section>

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white cursor-pointer disabled:opacity-50 shadow-sm"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <Save size={16} />
            <span>{saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}</span>
          </button>
        </form>
      </main>
    </div>
  );
}
