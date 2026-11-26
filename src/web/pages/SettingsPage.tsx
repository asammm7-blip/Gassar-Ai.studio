import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  User,
  Cpu,
  Palette,
  Languages,
  Shield,
  Volume2,
  Type,
  Info,
  Download,
  Upload,
  Trash2,
  X,
  Play,
  ChevronLeft,
  ChevronRight,
  Globe,
} from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';
import { useAppSettings, type FontFamily, type FontScale } from '../contexts/AppSettingsContext';
import { useRouter } from '../contexts/RouterContext';
import { useToast } from '../contexts/ToastContext';
import { storage } from '../storage';
import { getApiBaseUrl, setApiBaseUrl, testServerConnection } from '../api-client';
import { PWAInstallButton } from '../components/PWAInstallButton';
import {
  DEFAULT_TTS_SETTINGS,
  TTS_SETTINGS_KEYS,
  getAvailableTtsVoices,
  getTtsSettings,
  speakResponse,
  type TtsSettings,
  type TtsVoice,
} from '../tts-service';
import type { ConnectionMode } from '../connection-mode';
import { translate } from '../i18n';

export function SettingsPage() {
  const { state, setConnectionMode, setSaveHistory, clearConversations, exportBackup, previewBackup, importBackup } =
    useChatContext();
  const { themeSelection, setThemeSelection } = useTheme();
  const { profileName, setProfileName, language, setLanguage, fontScale, setFontScale, fontFamily, setFontFamily } =
    useAppSettings();
  const isEn = language === 'en';
  const router = useRouter();
  const { showToast, confirm, prompt } = useToast();

  const [ttsModalOpen, setTtsModalOpen] = useState(false);
  const [ttsSettings, setTtsSettings] = useState<TtsSettings>(DEFAULT_TTS_SETTINGS);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [remoteApiUrl, setRemoteApiUrl] = useState('');
  const [serverTestStatus, setServerTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [testingServer, setTestingServer] = useState(false);
  const [importPending, setImportPending] = useState<{
    text: string;
    conversations: number;
    messages: number;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void getTtsSettings().then(setTtsSettings);
    void getAvailableTtsVoices().then(setVoices);
    void getApiBaseUrl().then(setRemoteApiUrl);
  }, []);

  const updateTtsField = async <K extends keyof TtsSettings>(key: K, value: TtsSettings[K]) => {
    const next = { ...ttsSettings, [key]: value };
    setTtsSettings(next);
    await storage.setItem(TTS_SETTINGS_KEYS[key], String(value));
  };

  const handleSaveApiUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const saved = await setApiBaseUrl(remoteApiUrl);
    setRemoteApiUrl(saved);
    setTestingServer(true);
    const check = await testServerConnection(saved);
    setTestingServer(false);
    const activeList = check.providers
      ? Object.entries(check.providers)
          .filter(([, ready]) => ready)
          .map(([k]) => k)
      : [];
    const detail =
      check.ok && activeList.length
        ? `${check.message} (${activeList.join(', ')})`
        : check.message;
    setServerTestStatus({ ok: check.ok, message: detail });
    showToast(
      saved
        ? isEn
          ? `Server URL saved: ${saved}`
          : `تم حفظ عنوان الخادم: ${saved}`
        : isEn
          ? 'Using relative Web/PWA server path (/api/*)'
          : 'تم الرجوع إلى المسار المحلي للخادم (/api/*)',
      check.ok ? 'success' : 'info',
    );
  };

  const handleEditName = async () => {
    const next = await prompt({
      title: isEn ? 'Edit Display Name' : 'تغيير الاسم المعروض',
      defaultValue: profileName,
      placeholder: isEn ? 'Enter your name...' : 'أدخل اسمك...',
    });
    if (next !== null) {
      await setProfileName(next);
      showToast(isEn ? 'Display name updated' : 'تم تحديث الاسم', 'success');
    }
  };

  const handleExportBackup = () => {
    const json = exportBackup();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gassar-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(isEn ? 'Backup exported' : 'تم تصدير النسخة الاحتياطية', 'success');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const summary = previewBackup(text);
      setImportPending({ text, conversations: summary.conversations, messages: summary.messages });
    } catch (error) {
      showToast(error instanceof Error ? error.message : (isEn ? 'Invalid backup file' : 'ملف النسخة الاحتياطية غير صالح'), 'error');
    }
  };

  const applyImport = async (mode: 'merge' | 'replace') => {
    if (!importPending) return;
    const { text, conversations } = importPending;
    setImportPending(null);
    try {
      await importBackup(text, mode);
      showToast(isEn ? `Imported ${conversations} conversations` : `تم استيراد ${conversations} محادثة بنجاح`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : (isEn ? 'Import failed' : 'تعذر استيراد النسخة الاحتياطية'), 'error');
    }
  };

  const handleClearAll = async () => {
    const ok = await confirm({
      title: isEn ? 'Clear All Conversations' : 'مسح جميع المحادثات',
      message: isEn
        ? 'This deletes your saved chat history permanently. Continue?'
        : 'سيتم حذف سجل المحادثات بالكامل من المتصفح. لا يمكن التراجع عن هذا الإجراء.',
      confirmLabel: isEn ? 'Clear All' : 'مسح الكل',
      destructive: true,
    });
    if (ok) {
      await clearConversations();
      showToast(isEn ? 'All conversations cleared' : 'تم مسح جميع المحادثات', 'info');
    }
  };

  const conversationCount = Object.keys(state.conversationsById).length;
  const BackIcon = isEn ? ArrowLeft : ArrowRight;
  const NavChevron = isEn ? ChevronRight : ChevronLeft;

  return (
    <div className="flex flex-col h-full min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      <header
        className="sticky top-0 z-20 flex items-center gap-2 px-4 py-3 border-b"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <button type="button" onClick={() => router.back()} className="p-2 rounded-xl hover:bg-black/5 cursor-pointer">
          <BackIcon size={20} />
        </button>
        <h1 className="text-lg font-bold">{translate(language, 'settings')}</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Profile */}
          <section className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold"
                  style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))' }}
                >
                  <User size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold">{profileName}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {translate(language, 'profileSubtitle')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleEditName()}
                className="px-3.5 py-1.5 rounded-xl border text-xs font-bold cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--primary)' }}
              >
                {translate(language, 'profileEdit')}
              </button>
            </div>
          </section>

          {/* Models & Connection */}
          <section className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <Cpu size={16} style={{ color: 'var(--primary)' }} />
              <h2 className="text-sm font-bold">{translate(language, 'modelsAndConnection')}</h2>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'auto', label: translate(language, 'modeAuto') },
                  { id: 'online', label: translate(language, 'modeOnline') },
                  { id: 'offline', label: translate(language, 'modeOffline') },
                ] as { id: ConnectionMode; label: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => void setConnectionMode(m.id)}
                  className="py-2 rounded-xl border text-xs font-bold cursor-pointer"
                  style={{
                    backgroundColor: state.connectionMode === m.id ? 'var(--primary)' : 'var(--background)',
                    borderColor: state.connectionMode === m.id ? 'var(--primary)' : 'var(--border)',
                    color: state.connectionMode === m.id ? '#FFFFFF' : 'var(--foreground)',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {[
                { label: isEn ? 'Manage Cloud & Local Models' : 'إدارة النماذج (السحابية والمحلية)', path: '/models' },
                { label: isEn ? 'Cloud Providers Status' : 'حالة مزودي السحابة', path: '/cloud-model-settings' },
                { label: isEn ? 'Active Model Parameters' : 'إعدادات النموذج النشط', path: '/model-settings' },
                { label: isEn ? 'Local Server & Endpoints' : 'حالة الخادم المحلي', path: '/local-server' },
              ].map((link) => (
                <button
                  key={link.path}
                  type="button"
                  onClick={() => router.push(link.path)}
                  className="w-full flex items-center justify-between py-2.5 text-xs font-semibold cursor-pointer hover:opacity-80"
                >
                  <span>{link.label}</span>
                  <NavChevron size={15} style={{ color: 'var(--muted)' }} />
                </button>
              ))}
            </div>
          </section>

          {/* Standalone APK / Capacitor Backend Server URL */}
          <section className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <Globe size={16} style={{ color: 'var(--secondary)' }} />
              <h2 className="text-sm font-bold">{translate(language, 'remoteApiSection')}</h2>
            </div>
            <form onSubmit={(e) => void handleSaveApiUrl(e)} className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                dir="ltr"
                value={remoteApiUrl}
                onChange={(e) => setRemoteApiUrl(e.target.value)}
                placeholder={translate(language, 'remoteApiPlaceholder')}
                className="flex-1 rounded-xl border px-3 py-2 text-xs outline-none"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              />
              <button
                type="submit"
                disabled={testingServer}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer shrink-0 disabled:opacity-60"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                {testingServer ? (isEn ? 'Testing...' : 'جاري الاختبار...') : translate(language, 'remoteApiSave')}
              </button>
            </form>
            {serverTestStatus && (
              <p
                className="text-xs font-semibold px-3 py-2 rounded-xl"
                style={{
                  backgroundColor: serverTestStatus.ok ? 'rgba(52,168,83,0.12)' : 'rgba(234,67,53,0.1)',
                  color: serverTestStatus.ok ? 'var(--success)' : 'var(--error)',
                }}
              >
                {serverTestStatus.message}
              </p>
            )}
          </section>

          {/* Theme & Language */}
          <section className="p-4 rounded-2xl border space-y-4" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Palette size={16} style={{ color: 'var(--secondary)' }} />
                <h2 className="text-sm font-bold">{translate(language, 'appearanceSection')}</h2>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'light', label: translate(language, 'themeLight') },
                    { id: 'dark', label: translate(language, 'themeDark') },
                    { id: 'system', label: translate(language, 'themeSystem') },
                  ] as { id: ThemeMode; label: string }[]
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void setThemeSelection(item.id)}
                    className="py-2 rounded-xl border text-xs font-bold cursor-pointer"
                    style={{
                      backgroundColor: themeSelection === item.id ? 'var(--primary)' : 'var(--background)',
                      borderColor: themeSelection === item.id ? 'var(--primary)' : 'var(--border)',
                      color: themeSelection === item.id ? '#FFFFFF' : 'var(--foreground)',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Languages size={16} style={{ color: 'var(--accent)' }} />
                <h2 className="text-sm font-bold">{translate(language, 'languageSection')}</h2>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void setLanguage('ar')}
                  className="py-2 rounded-xl border text-xs font-bold cursor-pointer"
                  style={{
                    backgroundColor: language === 'ar' ? 'var(--primary)' : 'var(--background)',
                    borderColor: language === 'ar' ? 'var(--primary)' : 'var(--border)',
                    color: language === 'ar' ? '#FFFFFF' : 'var(--foreground)',
                  }}
                >
                  العربية (RTL)
                </button>
                <button
                  type="button"
                  onClick={() => void setLanguage('en')}
                  className="py-2 rounded-xl border text-xs font-bold cursor-pointer"
                  style={{
                    backgroundColor: language === 'en' ? 'var(--primary)' : 'var(--background)',
                    borderColor: language === 'en' ? 'var(--primary)' : 'var(--border)',
                    color: language === 'en' ? '#FFFFFF' : 'var(--foreground)',
                  }}
                >
                  English (LTR)
                </button>
              </div>
            </div>
          </section>

          {/* Voice & TTS */}
          <section className="p-4 rounded-2xl border flex items-center justify-between" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3">
              <Volume2 size={18} style={{ color: 'var(--primary)' }} />
              <div>
                <p className="text-sm font-bold">{translate(language, 'voiceAndTts')}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {isEn
                    ? `Rate: ${ttsSettings.rate.toFixed(2)}x · Auto-Read: ${ttsSettings.enabled && ttsSettings.autoRead ? 'On' : 'Off'}`
                    : `السرعة: ${ttsSettings.rate.toFixed(2)}x · القراءة التلقائية: ${ttsSettings.enabled && ttsSettings.autoRead ? 'مفعّلة' : 'متوقفة'}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTtsModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-white cursor-pointer"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              {translate(language, 'customize')}
            </button>
          </section>

          {/* Accessibility */}
          <section className="p-4 rounded-2xl border space-y-4" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <Type size={16} style={{ color: 'var(--primary)' }} />
              <h2 className="text-sm font-bold">{translate(language, 'accessibilityAndFont')}</h2>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'small', label: isEn ? 'Small' : 'صغير' },
                  { id: 'medium', label: isEn ? 'Medium' : 'متوسط' },
                  { id: 'large', label: isEn ? 'Large' : 'كبير' },
                ] as { id: FontScale; label: string }[]
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void setFontScale(s.id)}
                  className="py-2 rounded-xl border text-xs font-bold cursor-pointer"
                  style={{
                    backgroundColor: fontScale === s.id ? 'var(--primary)' : 'var(--background)',
                    borderColor: fontScale === s.id ? 'var(--primary)' : 'var(--border)',
                    color: fontScale === s.id ? '#FFFFFF' : 'var(--foreground)',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: 'system', label: isEn ? 'System' : 'النظام' },
                  { id: 'sans', label: 'Sans' },
                  { id: 'serif', label: 'Serif' },
                  { id: 'mono', label: 'Mono' },
                ] as { id: FontFamily; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => void setFontFamily(f.id)}
                  className="py-2 rounded-xl border text-xs font-bold cursor-pointer"
                  style={{
                    backgroundColor: fontFamily === f.id ? 'var(--surface-variant)' : 'var(--background)',
                    borderColor: fontFamily === f.id ? 'var(--primary)' : 'var(--border)',
                    color: fontFamily === f.id ? 'var(--primary)' : 'var(--foreground)',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </section>

          {/* Privacy & Backup */}
          <section className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} style={{ color: 'var(--success)' }} />
                <h2 className="text-sm font-bold">{translate(language, 'privacyAndBackup')}</h2>
              </div>
              <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                {isEn ? `${conversationCount} chats` : `${conversationCount} محادثة`}
              </span>
            </div>

            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-xs font-semibold">{translate(language, 'saveHistoryLocally')}</span>
              <input
                type="checkbox"
                checked={state.saveHistory}
                onChange={(e) => void setSaveHistory(e.target.checked)}
                className="w-4 h-4 accent-blue-500 cursor-pointer"
              />
            </label>

            <input ref={importInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportFile} />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={handleExportBackup}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-bold cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                <Download size={14} style={{ color: 'var(--primary)' }} />
                <span>{translate(language, 'exportBackup')}</span>
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-bold cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                <Upload size={14} style={{ color: 'var(--secondary)' }} />
                <span>{translate(language, 'importBackup')}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleClearAll()}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-bold cursor-pointer"
                style={{ borderColor: 'var(--error)', color: 'var(--error)' }}
              >
                <Trash2 size={14} />
                <span>{translate(language, 'clearHistory')}</span>
              </button>
            </div>
          </section>

          {/* About & PWA Install */}
          <section className="p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2.5">
              <Info size={16} style={{ color: 'var(--muted)' }} />
              <div>
                <p className="text-sm font-bold">{translate(language, 'aboutTitle')}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {translate(language, 'aboutSubtitle')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PWAInstallButton compact />
              <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>
                v2.0
              </span>
            </div>
          </section>
        </div>
      </main>

      {ttsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
          onClick={() => setTtsModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border p-5 shadow-2xl space-y-4"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">{isEn ? 'Text-to-Speech (TTS)' : 'إعدادات الصوت (TTS)'}</h3>
              <button type="button" onClick={() => setTtsModalOpen(false)} className="p-1.5 rounded-xl cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-semibold">{isEn ? 'Enable Voice Playback (TTS)' : 'تفعيل القراءة الصوتية'}</span>
              <input
                type="checkbox"
                checked={ttsSettings.enabled}
                onChange={(e) => void updateTtsField('enabled', e.target.checked)}
                className="w-4 h-4 accent-blue-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-semibold">
                {isEn ? 'Auto-Read New Replies' : 'القراءة التلقائية للردود الجديدة'}
              </span>
              <input
                type="checkbox"
                disabled={!ttsSettings.enabled}
                checked={ttsSettings.autoRead}
                onChange={(e) => void updateTtsField('autoRead', e.target.checked)}
                className="w-4 h-4 accent-blue-500 cursor-pointer disabled:opacity-40"
              />
            </label>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1">
                <span>{isEn ? 'Speech Rate' : 'سرعة الكلام'}</span>
                <span>{ttsSettings.rate.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={ttsSettings.rate}
                onChange={(e) => void updateTtsField('rate', Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1">
                <span>{isEn ? 'Volume' : 'مستوى الصوت'}</span>
                <span>{Math.round(ttsSettings.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={ttsSettings.volume}
                onChange={(e) => void updateTtsField('volume', Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">{isEn ? 'Voice Selection' : 'الصوت المستخدم'}</label>
              <select
                value={ttsSettings.voice}
                onChange={(e) => void updateTtsField('voice', e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                <option value="default">{isEn ? 'Auto by language' : 'تلقائي حسب اللغة'}</option>
                <option value="ar-SA">العربية (ar-SA)</option>
                <option value="en-US">English (en-US)</option>
                {voices.map((v) => (
                  <option key={v.identifier} value={v.identifier}>
                    {v.name || v.identifier} ({v.language})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() =>
                void speakResponse(
                  isEn ? 'Hello, this is a voice test in Gassar AI.' : 'مرحباً، هذا اختبار للصوت في تطبيق Gassar.AI.',
                  ttsSettings,
                )
              }
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white cursor-pointer"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <Play size={14} />
              <span>{isEn ? 'Test Voice' : 'تجربة الصوت'}</span>
            </button>
          </div>
        </div>
      )}

      {importPending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
          onClick={() => setImportPending(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border p-6 shadow-2xl space-y-4"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold">{translate(language, 'importBackup')}</h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
              {isEn
                ? `Backup contains ${importPending.conversations} conversations and ${importPending.messages} messages. Choose import mode:`
                : `تحتوي النسخة على ${importPending.conversations} محادثة و${importPending.messages} رسالة. اختر طريقة الاستيراد:`}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void applyImport('merge')}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                {isEn ? 'Merge with Existing Chats' : 'دمج مع المحادثات الحالية'}
              </button>
              <button
                type="button"
                onClick={() => void applyImport('replace')}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer"
                style={{ backgroundColor: 'var(--error)' }}
              >
                {isEn ? 'Replace Current History' : 'استبدال السجل الحالي بالكامل'}
              </button>
              <button
                type="button"
                onClick={() => setImportPending(null)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold border cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                {isEn ? 'Cancel' : 'إلغاء'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
