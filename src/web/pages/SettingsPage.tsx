import React, { useEffect, useRef, useState } from 'react';
import {
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
} from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';
import { useAppSettings, type FontFamily, type FontScale } from '../contexts/AppSettingsContext';
import { useRouter } from '../contexts/RouterContext';
import { useToast } from '../contexts/ToastContext';
import { storage } from '../storage';
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

export function SettingsPage() {
  const { state, setConnectionMode, setSaveHistory, clearConversations, exportBackup, previewBackup, importBackup } =
    useChatContext();
  const { themeSelection, setThemeSelection } = useTheme();
  const { profileName, setProfileName, language, setLanguage, fontScale, setFontScale, fontFamily, setFontFamily } =
    useAppSettings();
  const router = useRouter();
  const { showToast, confirm, prompt } = useToast();

  const [ttsModalOpen, setTtsModalOpen] = useState(false);
  const [ttsSettings, setTtsSettings] = useState<TtsSettings>(DEFAULT_TTS_SETTINGS);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [importPending, setImportPending] = useState<{
    text: string;
    conversations: number;
    messages: number;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void getTtsSettings().then(setTtsSettings);
    void getAvailableTtsVoices().then(setVoices);
  }, []);

  const updateTtsField = async <K extends keyof TtsSettings>(key: K, value: TtsSettings[K]) => {
    const next = { ...ttsSettings, [key]: value };
    setTtsSettings(next);
    await storage.setItem(TTS_SETTINGS_KEYS[key], String(value));
  };

  const handleEditName = async () => {
    const next = await prompt({
      title: 'تغيير الاسم المعروض',
      defaultValue: profileName,
      placeholder: 'أدخل اسمك...',
    });
    if (next !== null) {
      await setProfileName(next);
      showToast('تم تحديث الاسم', 'success');
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
    showToast('تم تصدير النسخة الاحتياطية', 'success');
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
      showToast(error instanceof Error ? error.message : 'ملف النسخة الاحتياطية غير صالح', 'error');
    }
  };

  const applyImport = async (mode: 'merge' | 'replace') => {
    if (!importPending) return;
    const { text, conversations } = importPending;
    setImportPending(null);
    try {
      await importBackup(text, mode);
      showToast(`تم استيراد ${conversations} محادثة بنجاح`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر استيراد النسخة الاحتياطية', 'error');
    }
  };

  const handleClearAll = async () => {
    const ok = await confirm({
      title: 'مسح جميع المحادثات',
      message: 'سيتم حذف سجل المحادثات بالكامل من المتصفح. لا يمكن التراجع عن هذا الإجراء.',
      confirmLabel: 'مسح الكل',
      destructive: true,
    });
    if (ok) {
      await clearConversations();
      showToast('تم مسح جميع المحادثات', 'info');
    }
  };

  const conversationCount = Object.keys(state.conversationsById).length;

  return (
    <div className="flex flex-col h-full min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      <header
        className="sticky top-0 z-20 flex items-center gap-2 px-4 py-3 border-b"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <button type="button" onClick={() => router.back()} className="p-2 rounded-xl hover:bg-black/5 cursor-pointer">
          <ArrowRight size={20} />
        </button>
        <h1 className="text-lg font-bold">الإعدادات</h1>
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
                    الاسم الظاهر في شاشة الترحيب
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleEditName()}
                className="px-3.5 py-1.5 rounded-xl border text-xs font-bold cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--primary)' }}
              >
                تعديل
              </button>
            </div>
          </section>

          {/* Models & Connection */}
          <section className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <Cpu size={16} style={{ color: 'var(--primary)' }} />
              <h2 className="text-sm font-bold">النماذج والاتصال</h2>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'auto', label: 'تلقائي' },
                  { id: 'online', label: 'أونلاين' },
                  { id: 'offline', label: 'أوفلاين' },
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
                { label: 'إدارة النماذج (السحابية والمحلية)', path: '/models' },
                { label: 'حالة مزودي السحابة', path: '/cloud-model-settings' },
                { label: 'إعدادات النموذج النشط', path: '/model-settings' },
                { label: 'حالة الخادم المحلي', path: '/local-server' },
              ].map((link) => (
                <button
                  key={link.path}
                  type="button"
                  onClick={() => router.push(link.path)}
                  className="w-full flex items-center justify-between py-2.5 text-xs font-semibold cursor-pointer hover:opacity-80"
                >
                  <span>{link.label}</span>
                  <ChevronLeft size={15} style={{ color: 'var(--muted)' }} />
                </button>
              ))}
            </div>
          </section>

          {/* Theme & Language */}
          <section className="p-4 rounded-2xl border space-y-4" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Palette size={16} style={{ color: 'var(--secondary)' }} />
                <h2 className="text-sm font-bold">المظهر</h2>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'light', label: 'فاتح' },
                    { id: 'dark', label: 'داكن' },
                    { id: 'system', label: 'النظام' },
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
                <h2 className="text-sm font-bold">اللغة والاتجاه</h2>
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
                <p className="text-sm font-bold">الصوت والقراءة التلقائية (TTS)</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  السرعة: {ttsSettings.rate.toFixed(2)}x · القراءة التلقائية: {ttsSettings.autoRead ? 'مفعّلة' : 'متوقفة'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTtsModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-white cursor-pointer"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              تخصيص
            </button>
          </section>

          {/* Accessibility */}
          <section className="p-4 rounded-2xl border space-y-4" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <Type size={16} style={{ color: 'var(--primary)' }} />
              <h2 className="text-sm font-bold">إمكانية الوصول والخط</h2>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'small', label: 'صغير' },
                  { id: 'medium', label: 'متوسط' },
                  { id: 'large', label: 'كبير' },
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
                  { id: 'system', label: 'النظام' },
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
                <h2 className="text-sm font-bold">الخصوصية والنسخ الاحتياطي</h2>
              </div>
              <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                {conversationCount} محادثة
              </span>
            </div>

            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-xs font-semibold">حفظ سجل المحادثات محلياً</span>
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
                <span>تصدير نسخة</span>
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-bold cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                <Upload size={14} style={{ color: 'var(--secondary)' }} />
                <span>استيراد نسخة</span>
              </button>
              <button
                type="button"
                onClick={() => void handleClearAll()}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-bold cursor-pointer"
                style={{ borderColor: 'var(--error)', color: 'var(--error)' }}
              >
                <Trash2 size={14} />
                <span>مسح السجل</span>
              </button>
            </div>
          </section>

          {/* About */}
          <section className="p-4 rounded-2xl border flex items-center justify-between" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2.5">
              <Info size={16} style={{ color: 'var(--muted)' }} />
              <div>
                <p className="text-sm font-bold">Gassar.AI Web</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  مساعد ذكي متعدد النماذج والمرفقات والصوت
                </p>
              </div>
            </div>
            <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>
              v1.0
            </span>
          </section>
        </div>
      </main>

      {/* TTS Modal */}
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
              <h3 className="text-base font-bold">إعدادات الصوت (TTS)</h3>
              <button type="button" onClick={() => setTtsModalOpen(false)} className="p-1.5 rounded-xl cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-semibold">القراءة التلقائية للردود الجديدة</span>
              <input
                type="checkbox"
                checked={ttsSettings.autoRead}
                onChange={(e) => void updateTtsField('autoRead', e.target.checked)}
                className="w-4 h-4 accent-blue-500 cursor-pointer"
              />
            </label>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1">
                <span>سرعة الكلام</span>
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
                <span>مستوى الصوت</span>
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
              <label className="block text-xs font-semibold mb-1.5">الصوت المستخدم</label>
              <select
                value={ttsSettings.voice}
                onChange={(e) => void updateTtsField('voice', e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-xs outline-none"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                <option value="default">تلقائي حسب اللغة</option>
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
              onClick={() => void speakResponse('مرحباً، هذا اختبار للصوت في تطبيق Gassar.AI.', ttsSettings)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white cursor-pointer"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <Play size={14} />
              <span>تجربة الصوت</span>
            </button>
          </div>
        </div>
      )}

      {/* Backup Import Mode Modal */}
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
            <h3 className="text-base font-bold">استيراد نسخة احتياطية</h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
              تحتوي النسخة على {importPending.conversations} محادثة و{importPending.messages} رسالة. اختر طريقة الاستيراد:
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void applyImport('merge')}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                دمج مع المحادثات الحالية
              </button>
              <button
                type="button"
                onClick={() => void applyImport('replace')}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer"
                style={{ backgroundColor: 'var(--error)' }}
              >
                استبدال السجل الحالي بالكامل
              </button>
              <button
                type="button"
                onClick={() => setImportPending(null)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold border cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
