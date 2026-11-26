import React, { useState } from 'react';
import { Wifi, WifiOff, Sparkles, ChevronDown, Check, X } from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import type { ConnectionMode } from '../connection-mode';

const MODES: { id: ConnectionMode; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: 'auto',
    label: 'تلقائي',
    desc: 'يستخدم السحابة للنماذج السحابية أو المحلي للنماذج المحلية',
    icon: <Sparkles size={15} style={{ color: 'var(--primary)' }} />,
  },
  {
    id: 'online',
    label: 'أونلاين',
    desc: 'يعتمد على مزودي السحابة المفعّلين على الخادم',
    icon: <Wifi size={15} style={{ color: 'var(--success)' }} />,
  },
  {
    id: 'offline',
    label: 'أوفلاين',
    desc: 'يقصر التشغيل على النموذج المحلي فقط',
    icon: <WifiOff size={15} style={{ color: 'var(--warning)' }} />,
  },
];

export function ConnectionModeDropdown({ compact = false }: { compact?: boolean }) {
  const { state, setConnectionMode } = useChatContext();
  const [open, setOpen] = useState(false);

  const current = MODES.find((m) => m.id === state.connectionMode) ?? MODES[0];

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
              <h3 className="text-base font-bold">وضع الاتصال</h3>
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
              {MODES.map((m) => {
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
          </div>
        </div>
      )}
    </>
  );
}
