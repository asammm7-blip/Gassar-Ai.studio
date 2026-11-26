import React, { useEffect, useState } from 'react';
import { Sparkles, Cloud, Mic, FileText, ShieldCheck, ArrowLeft, Check } from 'lucide-react';
import { storage } from '../storage';

const FIRST_LAUNCH_KEY = 'gassar_has_opened_app';

const ONBOARDING_STEPS = [
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
    title: 'قراءة المستندات والصور',
    description: 'أرفق ملفات PDF وExcel وCSV والصور لتحليلها واستخراج محتواها مباشرة داخل المحادثة.',
    icon: FileText,
  },
  {
    title: 'إدخال وقراءة صوتية',
    description: 'تحدث مع المساعد صوتياً عبر المتصفح أو استمع إلى الردود بصوت واضح وقابل للتخصيص.',
    icon: Mic,
  },
  {
    title: 'خصوصية ونسخ احتياطي كامل',
    description: 'تحفظ محادثاتك وإعداداتك محلياً في المتصفح مع إمكانية التصدير والاستيراد في أي وقت.',
    icon: ShieldCheck,
  },
];

export function StartupWelcome() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [step, setStep] = useState(0);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    void storage.getItem(FIRST_LAUNCH_KEY).then((seen) => {
      if (!seen) {
        setShowOnboarding(true);
      } else {
        setShowToast(true);
        const timer = setTimeout(() => setShowToast(false), 3000);
        return () => clearTimeout(timer);
      }
      return undefined;
    });
  }, []);

  const finishOnboarding = async () => {
    await storage.setItem(FIRST_LAUNCH_KEY, 'true');
    setShowOnboarding(false);
  };

  if (showToast) {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] pointer-events-none">
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full border shadow-lg text-xs font-bold"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
        >
          <Sparkles size={14} style={{ color: 'var(--primary)' }} />
          <span>أهلاً بعودتك إلى Gassar.AI</span>
        </div>
      </div>
    );
  }

  if (!showOnboarding) return null;

  const current = ONBOARDING_STEPS[step];
  const Icon = current.icon;
  const isLast = step === ONBOARDING_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
      <div
        className="w-full max-w-md rounded-3xl border p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1.5">
            {ONBOARDING_STEPS.map((_, idx) => (
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
            تخطي
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
            السابق
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={() => void finishOnboarding()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer hover:opacity-95"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <Check size={16} />
              <span>ابدأ الآن</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(ONBOARDING_STEPS.length - 1, s + 1))}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer hover:opacity-95"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <span>التالي</span>
              <ArrowLeft size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
