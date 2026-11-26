import React, { useState } from 'react';
import { Wifi, WifiOff, Sparkles, ChevronDown, Check, X, AlertCircle } from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import { useAppSettings } from '../contexts/AppSettingsContext';
import type { ConnectionMode } from '../connection-mode';

export function ConnectionModeDropdown({ compact = false }: { compact?: boolean }) {
  const { state, setConnectionMode } = useChatContext();
  const { language } = useAppSettings();
  const isEn = language === 'en';
  const [open, setOpen] = useState(false);

  const modes: { id: ConnectionMode; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      id: 'auto',
      label: isEn ? 'Auto' : 'تلقائي',
      desc: isEn
        ? 'Uses Cloud API for cloud models or local engine when supported'
        : 'يستخدم السحابة للنماذج السحابية أو المحلي عند توفره',
      icon: <Sparkles size={15} style={{ color: 'var(--primary)' }} />,
    },
    {
      id: 'online',
      label: isEn ? 'Online' : 'أونلاين',
      desc: isEn
        ? 'Routes generation through configured server cloud providers'
        : 'يعتمد على مزودي السحابة المفعّلين على الخادم',
      icon: <Wifi size={15} style={{ color: 'var(--success)' }} />,
    },
    {
      id: 'offline',
      label: isEn ? 'Offline' : 'أوفلاين',
      desc: isEn
        ? 'Local-only inference (GGUF runtime requires standalone Android APK)'
        : 'تشغيل محلي فقط (محرك GGUF يتطلب نسخة Android المستقلة)',
      icon: <WifiOff size={15} style={{ color: 'var(--warning)' }} />,
    },
  ];

  const current = modes.find((m) => m.id === state.connectionMode) ?? modes[0];

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
        {current.icon}
        <span>{current.label}</span>
        <ChevronDown size={13} style={{ color: 'var(--muted)' }} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] p-3"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border p-5 shadow-2xl"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">{isEn ? 'Connection Mode' : 'وضع الاتصال'}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-xl cursor-pointer"
                style={{ color: 'var(--muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              {modes.map((m) => {
                const selected = state.connectionMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      void setConnectionMode(m.id);
                      setOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl border text-start cursor-pointer transition-colors"
                    style={{
                      backgroundColor: selected ? 'var(--surface-variant)' : 'var(--background)',
                      borderColor: selected ? 'var(--primary)' : 'var(--border)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{m.icon}</div>
                      <div>
                        <p className="text-sm font-bold">{m.label}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                          {m.desc}
                        </p>
                      </div>
                    </div>
                    {selected && <Check size={17} style={{ color: 'var(--primary)' }} className="shrink-0" />}
                  </button>
                );
              })}
            </div>

            {state.connectionMode === 'offline' && (
              <div
                className="mt-3 flex items-start gap-2 p-3 rounded-xl border text-[11px]"
                style={{ backgroundColor: 'rgba(251,188,4,0.1)', borderColor: 'var(--warning)' }}
              >
                <AlertCircle size={14} style={{ color: 'var(--warning)' }} className="shrink-0 mt-0.5" />
                <span>
                  {isEn
                    ? 'Browser/PWA cannot execute native llama.cpp GGUF binaries; switch to Auto or Online for live replies.'
                    : 'المتصفح/PWA لا يشغّل ملفات GGUF الأصلية؛ بدّل إلى تلقائي أو أونلاين للمحادثة السحابية.'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
