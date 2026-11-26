import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { translate } from '../i18n';

export function OfflineIndicator() {
  const { language } = useAppSettings();
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      className="fixed bottom-4 left-4 z-[95] flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold text-white shadow-lg"
      style={{ backgroundColor: 'var(--warning)', color: '#202124' }}
    >
      <WifiOff size={14} />
      <span>{translate(language, 'offlineNotice')}</span>
    </div>
  );
}
