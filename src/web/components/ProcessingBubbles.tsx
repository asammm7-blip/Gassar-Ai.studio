import React from 'react';
import { Loader2, Sparkles, Paperclip } from 'lucide-react';

interface ProcessingBubblesProps {
  attachmentStatus?: string | null;
  thinkingActive?: boolean;
  modelName?: string;
}

export function ProcessingBubbles({ attachmentStatus, thinkingActive, modelName }: ProcessingBubblesProps) {
  return (
    <div className="space-y-2.5 my-2">
      {attachmentStatus && (
        <div
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl border text-xs font-medium"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--foreground)',
          }}
        >
          <Paperclip size={14} style={{ color: 'var(--secondary)' }} />
          <span>{attachmentStatus}</span>
        </div>
      )}

      <div className="flex items-start gap-2.5">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 shadow-xs"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))' }}
        >
          <Sparkles size={15} />
        </div>
        <div
          className="px-4 py-3 rounded-2xl border max-w-[85%]"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--foreground)',
          }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--primary)' }}>
            <Loader2 size={14} className="animate-spin" />
            <span>
              {thinkingActive
                ? `جاري التفكير العميق${modelName ? ` عبر ${modelName}` : ''}...`
                : `جاري توليد الرد${modelName ? ` عبر ${modelName}` : ''}...`}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-2">
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--primary)', animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--secondary)', animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent)', animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
