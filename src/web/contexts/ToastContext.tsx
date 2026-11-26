import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastKind = 'info' | 'success' | 'error';

interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);
  const [promptState, setPromptState] = useState<{
    options: PromptOptions;
    value: string;
    resolve: (value: string | null) => void;
  } | null>(null);

  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3400);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setPromptState({ options, value: options.defaultValue ?? '', resolve });
    });
  }, []);

  const closeConfirm = (result: boolean) => {
    if (!confirmState) return;
    confirmState.resolve(result);
    setConfirmState(null);
  };

  const closePrompt = (result: string | null) => {
    if (!promptState) return;
    promptState.resolve(result);
    setPromptState(null);
  };

  return (
    <ToastContext.Provider value={{ showToast, confirm, prompt }}>
      {children}

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] flex flex-col gap-2 w-[min(92vw,420px)] pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-lg border text-sm font-medium transition-all"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor:
                  t.kind === 'error'
                    ? 'var(--error)'
                    : t.kind === 'success'
                      ? 'var(--success)'
                      : 'var(--border)',
                color: 'var(--foreground)',
              }}
            >
              {t.kind === 'success' ? (
                <CheckCircle2 size={18} style={{ color: 'var(--success)' }} className="shrink-0" />
              ) : t.kind === 'error' ? (
                <AlertCircle size={18} style={{ color: 'var(--error)' }} className="shrink-0" />
              ) : (
                <Info size={18} style={{ color: 'var(--primary)' }} className="shrink-0" />
              )}
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                className="opacity-60 hover:opacity-100 p-0.5 cursor-pointer"
                aria-label="إغلاق التنبيه"
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Confirm Modal */}
      {confirmState && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => closeConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border p-6 shadow-2xl"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-2">{confirmState.options.title}</h3>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--muted)' }}>
              {confirmState.options.message}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer hover:opacity-85"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                {confirmState.options.cancelLabel ?? 'إلغاء'}
              </button>
              <button
                type="button"
                onClick={() => closeConfirm(true)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer hover:opacity-90"
                style={{
                  backgroundColor: confirmState.options.destructive ? 'var(--error)' : 'var(--primary)',
                }}
              >
                {confirmState.options.confirmLabel ?? 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Modal */}
      {promptState && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => closePrompt(null)}
        >
          <form
            className="w-full max-w-sm rounded-3xl border p-6 shadow-2xl"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              closePrompt(promptState.value);
            }}
          >
            <h3 className="text-lg font-bold mb-2">{promptState.options.title}</h3>
            {promptState.options.message && (
              <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>
                {promptState.options.message}
              </p>
            )}
            <input
              autoFocus
              type="text"
              value={promptState.value}
              onChange={(e) => setPromptState({ ...promptState, value: e.target.value })}
              placeholder={promptState.options.placeholder}
              className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none mb-5"
              style={{
                backgroundColor: 'var(--input-bg)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => closePrompt(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer hover:opacity-85"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                {promptState.options.cancelLabel ?? 'إلغاء'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer hover:opacity-90"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                {promptState.options.confirmLabel ?? 'حفظ'}
              </button>
            </div>
          </form>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
