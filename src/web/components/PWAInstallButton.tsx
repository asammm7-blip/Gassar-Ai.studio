import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { translate } from '../i18n';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { language } = useAppSettings();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={`flex items-center gap-1.5 rounded-xl text-white font-bold shadow-xs cursor-pointer hover:opacity-95 transition-opacity ${
          compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-xs'
        }`}
        style={{ backgroundColor: 'var(--primary)' }}
      >
        <Download size={14} />
        <span>{translate(language, 'installApp')}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer"
          style={{ borderColor: 'var(--border)', color: 'var(--primary)' }}
        >
          <Smartphone size={14} />
          <span>{translate(language, 'installOnIOS')}</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm rounded-3xl border p-6 shadow-2xl space-y-4"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">
                  {language === 'en' ? 'Install on iPhone / iPad' : 'التثبيت على iPhone / iPad'}
                </h3>
                <button type="button" onClick={() => setShowIOSGuide(false)} className="p-1 rounded-lg cursor-pointer">
                  <X size={16} />
                </button>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
                {language === 'en'
                  ? '1. Tap the Share button in Safari toolbar. 2. Scroll down and tap Add to Home Screen.'
                  : '١. اضغط على زر المشاركة في شريط Safari. ٢. مرّر للأسفل واختر "إضافة إلى الشاشة الرئيسية".'}
              </p>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
