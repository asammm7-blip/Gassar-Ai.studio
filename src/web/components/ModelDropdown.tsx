import React, { useEffect, useState } from 'react';
import { ChevronDown, Cloud, Cpu, Check, X, Settings2 } from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import { useRouter } from '../contexts/RouterContext';
import { cloudModelService, type CloudModelDefinition } from '../cloud-model-service';
import { localModelManager, type LocalModel } from '../local-model-manager';
import { useToast } from '../contexts/ToastContext';
import { useAppSettings } from '../contexts/AppSettingsContext';

interface ModelDropdownProps {
  compact?: boolean;
}

export function ModelDropdown({ compact = false }: ModelDropdownProps) {
  const { state, selectModel } = useChatContext();
  const { language } = useAppSettings();
  const isEn = language === 'en';
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [configuredProviders, setConfiguredProviders] = useState<Record<string, boolean>>({});
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);

  useEffect(() => {
    if (!open) return;
    void cloudModelService.getConfiguredProviders().then(setConfiguredProviders);
    void localModelManager.ready.then(() => setLocalModels(localModelManager.getAvailableModels()));
  }, [open]);

  const cloudModels = cloudModelService.getAvailableModels();

  const handleSelectCloud = async (def: CloudModelDefinition) => {
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
      setOpen(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : (isEn ? 'Failed to switch model' : 'تعذر تبديل النموذج'), 'error');
    }
  };

  const handleSelectLocal = async (model: LocalModel) => {
    try {
      await selectModel(model);
      setOpen(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : (isEn ? 'Failed to activate local model' : 'تعذر تفعيل النموذج المحلي'), 'error');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 rounded-full border cursor-pointer hover:opacity-90 transition-opacity ${
          compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs font-semibold'
        }`}
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--foreground)',
        }}
      >
        {state.activeModel?.source === 'cloud' ? (
          <Cloud size={13} style={{ color: 'var(--primary)' }} />
        ) : (
          <Cpu size={13} style={{ color: 'var(--secondary)' }} />
        )}
        <span className="max-w-[130px] truncate">{state.activeModel?.name ?? (isEn ? 'Select Model' : 'اختر نموذجاً')}</span>
        <ChevronDown size={13} style={{ color: 'var(--muted)' }} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] p-3"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md max-h-[82vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h3 className="text-base font-bold">{isEn ? 'Select Model' : 'اختر النموذج'}</h3>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {isEn ? 'Cloud and registered local models' : 'النماذج السحابية والمحلية المسجلة'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-xl cursor-pointer"
                style={{ color: 'var(--muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <p className="text-xs font-bold mb-2 px-1" style={{ color: 'var(--muted)' }}>
                  {isEn ? 'Cloud Models' : 'النماذج السحابية'}
                </p>
                <div className="space-y-2">
                  {cloudModels.map((item) => {
                    const isSelected = state.activeModel?.id === item.id;
                    const ready = configuredProviders[item.provider];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void handleSelectCloud(item)}
                        className="w-full flex items-center justify-between p-3 rounded-2xl border text-start cursor-pointer transition-colors"
                        style={{
                          backgroundColor: isSelected ? 'var(--surface-variant)' : 'var(--background)',
                          borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                        }}
                      >
                        <div className="min-w-0 flex-1 pe-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold truncate">{item.name}</span>
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                              style={{
                                backgroundColor: ready ? 'rgba(52,168,83,0.14)' : 'rgba(234,67,53,0.12)',
                                color: ready ? 'var(--success)' : 'var(--muted)',
                              }}
                            >
                              {ready ? (isEn ? 'Connected' : 'متصل') : (isEn ? 'Not configured' : 'غير مضبوط')}
                            </span>
                          </div>
                          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>
                            {item.description}
                          </p>
                        </div>
                        {isSelected && <Check size={17} style={{ color: 'var(--primary)' }} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold mb-2 px-1" style={{ color: 'var(--muted)' }}>
                  {isEn ? 'Local Models (GGUF)' : 'النماذج المحلية (GGUF)'}
                </p>
                {localModels.length === 0 ? (
                  <p className="text-xs px-2 py-2" style={{ color: 'var(--muted)' }}>
                    {isEn
                      ? 'No GGUF files registered. You can add them on the Models page.'
                      : 'لا توجد ملفات GGUF مسجلة. يمكنك إضافتها من صفحة النماذج.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {localModels.map((m) => {
                      const isSelected = state.activeModel?.id === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => void handleSelectLocal(m)}
                          className="w-full flex items-center justify-between p-3 rounded-2xl border text-start cursor-pointer"
                          style={{
                            backgroundColor: isSelected ? 'var(--surface-variant)' : 'var(--background)',
                            borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                          }}
                        >
                          <div className="min-w-0 flex-1 pe-2">
                            <span className="text-sm font-bold truncate block">{m.name}</span>
                            <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                              {m.description}
                            </p>
                          </div>
                          {isSelected && <Check size={17} style={{ color: 'var(--primary)' }} className="shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div
              className="flex items-center justify-between gap-2 px-4 py-3 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push('/models');
                }}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer hover:opacity-85"
                style={{ borderColor: 'var(--border)' }}
              >
                {isEn ? 'Manage Models' : 'إدارة النماذج'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push('/model-settings');
                }}
                className="flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold text-white cursor-pointer hover:opacity-90"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                <Settings2 size={14} />
                <span>{isEn ? 'Model Settings' : 'إعدادات النموذج'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
