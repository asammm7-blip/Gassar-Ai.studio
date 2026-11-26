import React, { useEffect, useState } from 'react';
import { Sparkles, Cloud, Mic, FileText, ShieldCheck, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { storage } from '../storage';
import { useAppSettings } from '../contexts/AppSettingsContext';

const FIRST_LAUNCH_KEY = 'gassar_has_opened_app';

const ONBOARDING_STEPS = {
  ar: [
    {
      title: 'مرحباً بك في Gassar.AI',
      description: 'مساعدك الذكي المتكامل للمحادثة، التحليل، والعمل مع المرفقات بواجهة عربية أنيقة وسريعة.',
      icon: Sparkles,
    },
    {
      title: 'نماذج سحابية متعددة',
      description: 'دعم مدمج لنماذج Gemini وGemma وOpenAI وClaude وOpenRouter عبر الخادم الآمن.',
      icon: Cloud,
    },
    {
      title: 'قراءة المستندات والروابط',
      description: 'أرفق ملفات PDF وWord وExcel والصور أو روابط الويب لتحليلها واستخراج محتواها مباشرة.',
      icon: FileText,
    },
    {
      title: 'إدخال وقراءة صوتية',
      description: 'تحدث مع المساعد صوتياً مع موجات تفاعلية حية واستمع إلى الردود بصوت واضح.',
      icon: Mic,
    },
    {
      title: 'تطبيق ويب تقدمي + نسخة Android',
      description: 'تُحفظ محادثاتك في IndexedDB مع دعم التثبيت كتطبيق (PWA) وإعداد نسخة Android مستقلة.',
      icon: ShieldCheck,
    },
  ],
  en: [
    {
      title: 'Welcome to Gassar.AI',
      description: 'Your integrated AI assistant for chat, document analysis, voice interaction, and live web search.',
      icon: Sparkles,
    },
    {
      title: 'Multi-Provider Cloud Models',
      description: 'Built-in support for Gemini 4, Gemma 4, OpenAI, Claude, and OpenRouter via a secure proxy.',
      icon: Cloud,
    },
    {
      title: 'Documents & Web Links',
      description: 'Attach PDF, Word (.docx), Excel, CSV, images, or web links for deep content extraction.',
      icon: FileText,
    },
    {
      title: 'Live Voice Interaction',
      description: 'Speak hands-free with real-time mic visualization and customizable text-to-speech playback.',
      icon: Mic,
    },
    {
      title: 'Installable PWA & Standalone Android',
      description: 'Conversations are stored safely in IndexedDB with full backup export and standalone APK support.',
      icon: ShieldCheck,
    },
  ],
};

export function StartupWelcome() {
  const { language } = useAppSettings();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [step, setStep] = useState(0);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    if (params?.get('autostart') === '1') {
      void storage.setItem(FIRST_LAUNCH_KEY, 'true');
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    void storage.getItem(FIRST_LAUNCH_KEY).then((seen) => {
      if (!seen) {
        setShowOnboarding(true);
      } else {
        setShowToast(true);
        timer = setTimeout(() => setShowToast(false), 3000);
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  const finishOnboarding = async () => {
    await storage.setItem(FIRST_LAUNCH_KEY, 'true');
    setShowOnboarding(false);
  };

  if (showToast) {
    return (
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[90] pointer-events-none">
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full border shadow-lg text-xs font-bold whitespace-nowrap"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
        >
          <Sparkles size={14} style={{ color: 'var(--primary)' }} />
          <span>{language === 'en' ? 'Welcome back to Gassar.AI' : 'أهلاً بعودتك إلى Gassar.AI'}</span>
        </div>
      </div>
    );
  }

  if (!showOnboarding) return null;

  const steps = ONBOARDING_STEPS[language === 'en' ? 'en' : 'ar'];
  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
      <div
        className="w-full max-w-md rounded-3xl border p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1.5">
            {steps.map((_, idx) => (
              <span
                key={idx}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: idx === step ? 24 : 8,
                  backgroundColor: idx === step ? 'var(--primary)' : 'var(--border)',
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => void finishOnboarding()}
            className="text-xs font-semibold cursor-pointer hover:opacity-80"
            style={{ color: 'var(--muted)' }}
          >
            {language === 'en' ? 'Skip' : 'تخطي'}
          </button>
        </div>

        <div className="text-center py-4">
          <div
            className="w-16 h-16 mx-auto mb-5 rounded-3xl flex items-center justify-center text-white shadow-lg"
            style={{
              background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
            }}
          >
            <Icon size={30} />
          </div>
          <h2 className="text-xl font-extrabold mb-3">{current.title}</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
            {current.description}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 mt-6">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold border cursor-pointer disabled:opacity-35 disabled:cursor-default"
            style={{ borderColor: 'var(--border)' }}
          >
            {language === 'en' ? 'Back' : 'السابق'}
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={() => void finishOnboarding()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer hover:opacity-95"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <Check size={16} />
              <span>{language === 'en' ? 'Get Started' : 'ابدأ الآن'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer hover:opacity-95"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <span>{language === 'en' ? 'Next' : 'التالي'}</span>
              {language === 'en' ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
