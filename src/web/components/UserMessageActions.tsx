import React, { useState } from 'react';
import { Copy, Check, Pencil, X, Send } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface UserMessageActionsProps {
  content: string;
  onSaveEdit: (nextContent: string) => void;
  disabled?: boolean;
}

export function UserMessageActions({ content, onSaveEdit, disabled = false }: UserMessageActionsProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('تعذر نسخ الرسالة', 'error');
    }
  };

  if (editing) {
    return (
      <div className="mt-2 space-y-2 w-full">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="w-full rounded-xl border p-2.5 text-sm outline-none resize-none"
          style={{
            backgroundColor: 'var(--input-bg)',
            borderColor: 'var(--border)',
            color: 'var(--foreground)',
          }}
        />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(content);
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
          >
            <X size={13} />
            <span>إلغاء</span>
          </button>
          <button
            type="button"
            disabled={!draft.trim()}
            onClick={() => {
              onSaveEdit(draft.trim());
              setEditing(false);
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white cursor-pointer disabled:opacity-40"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <Send size={12} />
            <span>إرسال التعديل</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1 mt-1 opacity-80">
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
        style={{ color: copied ? 'var(--success)' : 'var(--muted)' }}
        title="نسخ"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setDraft(content);
          setEditing(true);
        }}
        className="p-1 rounded-lg hover:bg-black/5 cursor-pointer disabled:opacity-40"
        style={{ color: 'var(--muted)' }}
        title="تعديل وإعادة إرسال"
      >
        <Pencil size={13} />
      </button>
    </div>
  );
}
