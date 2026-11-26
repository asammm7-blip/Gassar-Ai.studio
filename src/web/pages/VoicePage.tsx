import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Mic, MicOff, Volume2, VolumeX, Send, MessageSquarePlus, RotateCcw } from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import { useRouter } from '../contexts/RouterContext';
import { useToast } from '../contexts/ToastContext';
import { createChatDraft } from '../chat-drafts';
import { speakResponse, stopSpeaking } from '../tts-service';

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function VoicePage() {
  const { state, createNewConversation, sendMessage } = useChatContext();
  const router = useRouter();
  const { showToast } = useToast();

  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      void stopSpeaking();
    };
  }, []);

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      showToast('التعرف الصوتي المباشر غير متاح في هذا المتصفح. اكتب رسالتك في الحقل أدناه.', 'info');
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = 'ar-SA';
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = (event) => {
        const text = Array.from(event.results)
          .map((r) => r[0]?.transcript || '')
          .join(' ')
          .trim();
        setTranscript(text);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      showToast('تعذر الوصول إلى الميكروفون', 'error');
    }
  };

  const handleSendToChat = () => {
    const clean = transcript.trim();
    if (!clean) {
      showToast('تحدث أو اكتب نصاً أولاً', 'info');
      return;
    }
    const convId = state.currentId || createNewConversation();
    if (!convId) return;
    const draftId = createChatDraft(clean);
    router.push(`/chat/${convId}?draft=${encodeURIComponent(draftId)}`);
  };

  const handleSendVoiceMessage = async () => {
    const clean = transcript.trim();
    if (!clean) {
      showToast('تحدث أو اكتب رسالة أولاً', 'info');
      return;
    }
    if (!state.currentId) createNewConversation();
    setSending(true);
    try {
      const res = await sendMessage(clean);
      if (res.status === 'complete') {
        setReplyText(res.message.content);
        if (!muted) {
          void speakResponse(res.message.content).catch(() => undefined);
        }
      } else {
        showToast(res.reason, 'error');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 border-b"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => router.back()} className="p-2 rounded-xl hover:bg-black/5 cursor-pointer">
            <ArrowRight size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold">المحادثة الصوتية</h1>
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
              {state.activeModel?.name ?? 'اختر نموذجاً من النماذج'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setMuted((m) => {
              if (!m) void stopSpeaking();
              return !m;
            });
          }}
          className="p-2 rounded-xl border cursor-pointer"
          style={{ borderColor: 'var(--border)', color: muted ? 'var(--error)' : 'var(--primary)' }}
          title={muted ? 'إلغاء كتم الصوت' : 'كتم الرد الصوتي'}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-8 flex flex-col items-center justify-between gap-6 max-w-xl mx-auto w-full">
        {/* Animated Circular Orb */}
        <div className="flex flex-col items-center gap-5 pt-4">
          <button
            type="button"
            onClick={toggleListening}
            className={`relative w-40 h-40 rounded-full flex items-center justify-center text-white shadow-2xl cursor-pointer transition-transform ${
              listening ? 'scale-105' : 'hover:scale-102'
            }`}
            style={{
              background: listening
                ? 'linear-gradient(135deg, #EA4335, #7C4DFF)'
                : 'linear-gradient(135deg, var(--primary), var(--secondary))',
            }}
          >
            {listening && (
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-25"
                style={{ backgroundColor: 'var(--primary)' }}
              />
            )}
            {listening ? <MicOff size={44} /> : <Mic size={44} />}
          </button>

          {/* Wave Bars */}
          <div className="flex items-center justify-center gap-1.5 h-8">
            {[0, 1, 2, 3, 4, 5, 6].map((idx) => (
              <span
                key={idx}
                className="w-1.5 rounded-full transition-all"
                style={{
                  height: listening || sending ? 26 : 8,
                  backgroundColor: listening ? 'var(--primary)' : 'var(--border)',
                  animation: listening || sending ? `pulseWave 0.9s ease-in-out ${idx * 0.1}s infinite` : undefined,
                }}
              />
            ))}
          </div>

          <p className="text-xs font-bold" style={{ color: 'var(--muted)' }}>
            {sending
              ? 'جاري إرسال الرسالة الصوتية وتوليد الرد...'
              : listening
                ? 'جاري الاستماع... اضغط للإيقاف'
                : 'اضغط على الدائرة لبدء التحدث أو اكتب رسالتك أدناه'}
          </p>
        </div>

        {/* Transcript & Reply Box */}
        <div className="w-full space-y-3">
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={3}
            placeholder="النص الملتقط من الصوت سيظهر هنا (ويمكنك تعديله يدوياً)..."
            className="w-full rounded-2xl border p-3.5 text-sm outline-none resize-none"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          />

          {replyText && (
            <div
              className="p-4 rounded-2xl border space-y-2"
              style={{ backgroundColor: 'var(--surface-variant)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: 'var(--primary)' }}>
                  رد Gassar.AI
                </span>
                <button
                  type="button"
                  onClick={() => void speakResponse(replyText)}
                  className="flex items-center gap-1 text-xs font-semibold cursor-pointer"
                  style={{ color: 'var(--primary)' }}
                >
                  <RotateCcw size={13} />
                  <span>إعادة التشغيل</span>
                </button>
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{replyText}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={sending}
              onClick={() => void handleSendVoiceMessage()}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-sm font-bold text-white cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <Send size={16} />
              <span>{sending ? 'جاري الرد...' : 'إرسال وسماع الرد'}</span>
            </button>

            <button
              type="button"
              onClick={handleSendToChat}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border text-sm font-bold cursor-pointer"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
            >
              <MessageSquarePlus size={16} style={{ color: 'var(--secondary)' }} />
              <span>إرسال إلى المحادثة</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
