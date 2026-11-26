import React, { useRef, useState } from 'react';
import { Image as ImageIcon, FileText, Link2, X } from 'lucide-react';
import type { ChatAttachment } from '../attachment-service';
import { useToast } from '../contexts/ToastContext';
import { useAppSettings } from '../contexts/AppSettingsContext';

interface MediaMenuProps {
  visible: boolean;
  onClose: () => void;
  onAddAttachment: (attachment: ChatAttachment) => void;
}

export function MediaMenu({ visible, onClose, onAddAttachment }: MediaMenuProps) {
  const { showToast } = useToast();
  const { language } = useAppSettings();
  const isEn = language === 'en';
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  if (!visible) return null;

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error(isEn ? 'Failed to read file' : 'تعذر قراءة الملف'));
      reader.readAsDataURL(file);
    });

  const handleImagesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    try {
      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);
        onAddAttachment({
          type: 'image',
          name: file.name,
          data: {
            uri: dataUrl,
            name: file.name,
            mimeType: file.type || 'image/png',
            size: file.size,
          },
        });
      }
      onClose();
    } catch {
      showToast(isEn ? 'Could not load selected image' : 'تعذر تحميل الصورة المحددة', 'error');
    }
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    try {
      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);
        onAddAttachment({
          type: 'file',
          name: file.name,
          data: {
            uri: dataUrl,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
          },
        });
      }
      onClose();
    } catch {
      showToast(isEn ? 'Could not read selected file' : 'تعذر قراءة الملف المحدد', 'error');
    }
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = linkUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      showToast(isEn ? 'Enter a URL starting with http:// or https://' : 'أدخل رابطاً يبدأ بـ http:// أو https://', 'error');
      return;
    }
    onAddAttachment({
      type: 'link',
      name: trimmed,
      data: { url: trimmed, name: trimmed },
    });
    setLinkUrl('');
    setLinkMode(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border p-5 shadow-2xl"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold">{isEn ? 'Attach Media or Files' : 'إرفاق وسائط أو ملفات'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl cursor-pointer hover:opacity-80"
            style={{ color: 'var(--muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImagesSelected}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.csv,.json,.xml,.rtf,.xls,.xlsx"
          multiple
          className="hidden"
          onChange={handleFilesSelected}
        />

        {!linkMode ? (
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border cursor-pointer hover:opacity-90 transition-opacity"
              style={{ backgroundColor: 'var(--surface-variant)', borderColor: 'var(--border)' }}
            >
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-white"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                <ImageIcon size={20} />
              </div>
              <span className="text-xs font-bold">{isEn ? 'Image' : 'صورة'}</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border cursor-pointer hover:opacity-90 transition-opacity"
              style={{ backgroundColor: 'var(--surface-variant)', borderColor: 'var(--border)' }}
            >
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-white"
                style={{ backgroundColor: 'var(--secondary)' }}
              >
                <FileText size={20} />
              </div>
              <span className="text-xs font-bold">{isEn ? 'Document' : 'ملف / مستند'}</span>
            </button>

            <button
              type="button"
              onClick={() => setLinkMode(true)}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border cursor-pointer hover:opacity-90 transition-opacity"
              style={{ backgroundColor: 'var(--surface-variant)', borderColor: 'var(--border)' }}
            >
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                <Link2 size={20} />
              </div>
              <span className="text-xs font-bold">{isEn ? 'Web Link' : 'رابط ويب'}</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleLinkSubmit} className="space-y-3">
            <label className="block text-xs font-semibold" style={{ color: 'var(--muted)' }}>
              {isEn ? 'Enter page URL (https://...)' : 'أدخل رابط الصفحة (https://...)'}
            </label>
            <input
              autoFocus
              type="url"
              dir="ltr"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none"
              style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setLinkMode(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold border cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                {isEn ? 'Back' : 'رجوع'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                {isEn ? 'Add Link' : 'إضافة الرابط'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
