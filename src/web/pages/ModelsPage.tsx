import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Cpu,
  Cloud,
  Sparkles,
  Upload,
  Check,
  Trash2,
  Server,
  KeyRound,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { useRouter } from '../contexts/RouterContext';
import { useToast } from '../contexts/ToastContext';
import { cloudModelService, type CloudModelDefinition } from '../cloud-model-service';
import { localModelManager, type LocalModel } from '../local-model-manager';
import { formatBytes } from '../attachment-service';

type ModelsTab = 'local' | 'cloud' | 'available';

const RECOMMENDED_GGUF = [
  {
    name: 'Qwen2.5-3B-Instruct (Q4_K_M)',
    size: '~2.0 GB',
    descAr: 'نموذج متوازن وسريع للمحادثة العربية والبرمجة',
    descEn: 'Balanced and fast model for multilingual chat & coding',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF',
  },
  {
    name: 'Gemma-3-4B-IT (Q4_K_M)',
    size: '~2.6 GB',
    descAr: 'نموذج Google خفيف يدعم المهام اليومية والملخصات',
    descEn: 'Compact Google open model for everyday tasks and summaries',
    url: 'https://huggingface.co/google/gemma-3-4b-it-qat-q4_0-gguf',
  },
  {
    name: 'Llama-3.2-3B-Instruct (Q4_K_M)',
    size: '~2.0 GB',
    descAr: 'أداء ممتاز على الأجهزة المحمولة والمتوسطة',
    descEn: 'Responsive performance for mobile and midrange hardware',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF',
  },
];

export function ModelsPage() {
  const { state, selectModel } = useChatContext();
  const { language } = useAppSettings();
  const isEn = language === 'en';
  const router = useRouter();
  const { showToast, confirm } = useToast();

  const [tab, setTab] = useState<ModelsTab>('cloud');
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [configuredProviders, setConfiguredProviders] = useState<Record<string, boolean>>({});
  const ggufInputRef = useRef<HTMLInputElement | null>(null);

  const refreshModels = async () => {
    await localModelManager.ready;
    setLocalModels(localModelManager.getAvailableModels());
    const providers = await cloudModelService.getConfiguredProviders();
    setConfiguredProviders(providers);
  };

  useEffect(() => {
    let active = true;
    void Promise.all([localModelManager.ready, cloudModelService.getConfiguredProviders()]).then(
      ([, providers]) => {
        if (!active) return;
        setLocalModels(localModelManager.getAvailableModels());
        setConfiguredProviders(providers);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const cloudModels = cloudModelService.getAvailableModels();
  const BackIcon = isEn ? ArrowLeft : ArrowRight;

  const handleRegisterGguf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const model = await localModelManager.registerFile(file);
      await refreshModels();
      showToast(isEn ? `Registered ${model.name}` : `تم تسجيل ${model.name}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : (isEn ? 'Failed to inspect GGUF file' : 'تعذر قراءة ملف GGUF'), 'error');
    }
  };

  const handleActivateCloud = async (def: CloudModelDefinition) => {
    const model: LocalModel = {
      id: def.id,
      name: def.name,
      path: '',
      size: 0,
      type: 'language',
      isLoaded: false,
      isActive: true,
      version: 'cloud',
      description: def.description,
      source: 'cloud',
      provider: def.provider,
      remoteModel: def.model,
      capabilities: def.capabilities,
    };
    try {
      await selectModel(model);
      showToast(isEn ? `Activated ${def.name}` : `تم تفعيل ${def.name}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : (isEn ? 'Failed to activate model' : 'تعذر تفعيل النموذج'), 'error');
    }
  };

  const handleActivateLocal = async (model: LocalModel) => {
    try {
      await selectModel(model);
      await refreshModels();
      showToast(isEn ? `Selected ${model.name}` : `تم تحديد ${model.name}`, 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : (isEn ? 'Failed to select model' : 'تعذر تحديد النموذج'), 'error');
    }
  };

  const handleDeleteLocal = async (model: LocalModel) => {
    const ok = await confirm({
      title: isEn ? 'Remove Local Model' : 'حذف النموذج المحلي',
      message: isEn ? `Remove "${model.name}" from the registry?` : `هل تريد إزالة "${model.name}" من القائمة؟`,
      confirmLabel: isEn ? 'Remove' : 'إزالة',
      destructive: true,
    });
    if (ok) {
      await localModelManager.deleteModel(model.id);
      await refreshModels();
      showToast(isEn ? 'Model removed' : 'تمت إزالة النموذج', 'info');
    }
  };

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
          <h1 className="text-lg font-bold">{isEn ? 'Models Manager' : 'إدارة النماذج'}</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/cloud-model-settings')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer"
            style={{ borderColor: 'var(--border)' }}
          >
            <KeyRound size={14} style={{ color: 'var(--primary)' }} />
            <span>{isEn ? 'Providers' : 'حالة المزودين'}</span>
          </button>
          <button
            type="button"
            onClick={() => router.push('/local-server')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer"
            style={{ borderColor: 'var(--border)' }}
          >
            <Server size={14} style={{ color: 'var(--secondary)' }} />
            <span>{isEn ? 'Server' : 'الخادم المحلي'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            {(
              [
                { id: 'cloud', label: isEn ? 'Cloud' : 'السحابية', icon: Cloud },
                { id: 'local', label: isEn ? 'Local (GGUF)' : 'المحلية (GGUF)', icon: Cpu },
                { id: 'available', label: isEn ? 'Recommended' : 'المتاحة', icon: Sparkles },
              ] as const
            ).map((t) => {
              const active = tab === t.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--primary)' : 'transparent',
                    color: active ? '#FFFFFF' : 'var(--muted)',
                  }}
                >
                  <Icon size={14} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {tab === 'cloud' && (
            <div className="space-y-3">
              {cloudModels.map((def) => {
                const isSelected = state.activeModel?.id === def.id;
                const ready = configuredProviders[def.provider];
                return (
                  <div
                    key={def.id}
                    className="flex items-center justify-between gap-3 p-4 rounded-2xl border"
                    style={{
                      backgroundColor: isSelected ? 'var(--surface-variant)' : 'var(--surface)',
                      borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold">{def.name}</h3>
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                          style={{
                            backgroundColor: ready ? 'rgba(52,168,83,0.14)' : 'rgba(234,67,53,0.12)',
                            color: ready ? 'var(--success)' : 'var(--muted)',
                          }}
                        >
                          {ready ? (isEn ? 'Ready on Server' : 'جاهز على الخادم') : (isEn ? 'Key Not Set' : 'المفتاح غير مضبوط')}
                        </span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                        {def.description}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {def.capabilities.vision && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md border" style={{ borderColor: 'var(--border)' }}>
                            {isEn ? 'Vision' : 'رؤية الصور'}
                          </span>
                        )}
                        {def.capabilities.thinking && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md border" style={{ borderColor: 'var(--border)' }}>
                            {isEn ? 'Deep Thinking' : 'تفكير عميق'}
                          </span>
                        )}
                        {def.capabilities.tools && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md border" style={{ borderColor: 'var(--border)' }}>
                            {isEn ? 'Tools & Search' : 'أدوات وبحث'}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleActivateCloud(def)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer shrink-0"
                      style={{
                        backgroundColor: isSelected ? 'var(--success)' : 'var(--primary)',
                        color: '#FFFFFF',
                      }}
                    >
                      {isSelected && <Check size={14} />}
                      <span>{isSelected ? (isEn ? 'Active' : 'مفعّل') : (isEn ? 'Select' : 'تفعيل')}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'local' && (
            <div className="space-y-4">
              <div
                className="flex items-start gap-3 p-4 rounded-2xl border text-xs leading-relaxed"
                style={{ backgroundColor: 'rgba(251,188,4,0.1)', borderColor: 'var(--warning)' }}
              >
                <AlertCircle size={17} style={{ color: 'var(--warning)' }} className="shrink-0 mt-0.5" />
                <span>
                  {isEn
                    ? 'On-device GGUF execution via llama.cpp requires the native Android runtime. On Web/PWA you can register & validate GGUF file headers while using Cloud models for chat.'
                    : 'تشغيل ملفات GGUF محلياً عبر llama.cpp متاح في وقت التشغيل الأصلي على Android. في نسخة الويب/PWA يمكنك التحقق من سلامة ترويسة GGUF وتسجيلها، واستخدام النماذج السحابية للمحادثة.'}
                </span>
              </div>

              <input
                ref={ggufInputRef}
                type="file"
                accept=".gguf"
                className="hidden"
                onChange={handleRegisterGguf}
              />

              <button
                type="button"
                onClick={() => ggufInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border-2 border-dashed text-sm font-bold cursor-pointer hover:opacity-85"
                style={{ borderColor: 'var(--primary)', color: 'var(--primary)', backgroundColor: 'var(--surface)' }}
              >
                <Upload size={18} />
                <span>{isEn ? 'Register Local GGUF File' : 'تسجيل ملف نموذج GGUF من الجهاز'}</span>
              </button>

              {localModels.length === 0 ? (
                <div
                  className="p-8 rounded-2xl border text-center"
                  style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <Cpu size={30} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--muted)' }} />
                  <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    {isEn ? 'No GGUF models registered yet' : 'لا توجد نماذج GGUF مسجلة حتى الآن'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {localModels.map((model) => {
                    const isSelected = state.activeModel?.id === model.id;
                    return (
                      <div
                        key={model.id}
                        className="flex items-center justify-between gap-3 p-4 rounded-2xl border"
                        style={{
                          backgroundColor: isSelected ? 'var(--surface-variant)' : 'var(--surface)',
                          borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold truncate">{model.name}</h3>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                            {isEn ? `Size: ${formatBytes(model.size)}` : `الحجم: ${formatBytes(model.size)}`} · {model.type}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleActivateLocal(model)}
                            className="px-3.5 py-2 rounded-xl text-xs font-bold text-white cursor-pointer"
                            style={{ backgroundColor: isSelected ? 'var(--success)' : 'var(--primary)' }}
                          >
                            {isSelected ? (isEn ? 'Selected' : 'محدد') : (isEn ? 'Select' : 'تحديد')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteLocal(model)}
                            className="p-2 rounded-xl border cursor-pointer"
                            style={{ borderColor: 'var(--border)', color: 'var(--error)' }}
                            title={isEn ? 'Delete' : 'حذف'}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'available' && (
            <div className="space-y-3">
              <p className="text-xs px-1" style={{ color: 'var(--muted)' }}>
                {isEn
                  ? 'Recommended open-weight GGUF repositories on Hugging Face:'
                  : 'نماذج GGUF مفتوحة موصى بها للتشغيل المحلي:'}
              </p>
              {RECOMMENDED_GGUF.map((item) => (
                <div
                  key={item.name}
                  className="p-4 rounded-2xl border space-y-2"
                  style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">{item.name}</h3>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--surface-variant)', color: 'var(--primary)' }}>
                      {item.size}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {isEn ? item.descEn : item.descAr}
                  </p>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold hover:underline"
                    style={{ color: 'var(--primary)' }}
                  >
                    <span>Hugging Face</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
