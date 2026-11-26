import React from 'react';
import { FileText, Link2, X } from 'lucide-react';
import { formatBytes, type ChatAttachment } from '../attachment-service';

interface AttachmentPreviewProps {
  attachments: ChatAttachment[];
  onRemove?: (index: number) => void;
  compact?: boolean;
}

export function AttachmentPreview({ attachments, onRemove, compact = false }: AttachmentPreviewProps) {
  if (!attachments.length) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? '' : 'px-1 py-1.5'}`}>
      {attachments.map((att, index) => {
        const isImage = att.type === 'image' || att.type === 'camera';
        const isLink = att.type === 'link';
        const label = att.name || att.data.name || att.data.url || 'مرفق';

        return (
          <div
            key={`${label}_${index}`}
            className="relative flex items-center gap-2 rounded-2xl border px-2.5 py-1.5 max-w-[220px]"
            style={{
              backgroundColor: 'var(--surface-variant)',
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
            }}
          >
            {isImage && att.data.uri ? (
              <img src={att.data.uri} alt={label} className="w-8 h-8 rounded-lg object-cover shrink-0" />
            ) : isLink ? (
              <Link2 size={16} style={{ color: 'var(--primary)' }} className="shrink-0" />
            ) : (
              <FileText size={16} style={{ color: 'var(--secondary)' }} className="shrink-0" />
            )}

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{label}</p>
              {typeof att.data.size === 'number' && att.data.size > 0 && (
                <p className="text-[10px]" style={{ color: 'var(--muted)' }}>
                  {formatBytes(att.data.size)}
                </p>
              )}
            </div>

            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="p-0.5 rounded-full hover:bg-black/10 cursor-pointer shrink-0"
                style={{ color: 'var(--muted)' }}
                aria-label="إزالة المرفق"
              >
                <X size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
