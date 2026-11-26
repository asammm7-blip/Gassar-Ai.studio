import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  MessageSquarePlus,
  RotateCcw,
  Repeat,
  AlertCircle,
} from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import { useAppSettings } from '../contexts/AppSettingsContext';
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

const DEFAULT_BARS = [8, 10, 12, 14, 12, 10, 8];

export function VoicePage() {
  const { state, createNewConversation, sendMessage } = useChatContext();
  const { language } = useAppSettings();
  const isEn = language === 'en';
  const router = useRouter();
  const { showToast } = useToast();

  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [waveBars, setWaveBars] = useState<number[]>(DEFAULT_BARS);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const transcriptRef = useRef('');
  const handsFreeRef = useRef(false);
  const mutedRef = useRef(false);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const stopAudioMeter = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close().catch(() => undefined);
    }
    audioCtxRef.current = null;
    setWaveBars(DEFAULT_BARS);
  };

  const startAudioMeter = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const bars = Array.from({ length: 7 }, (_, i) => {
          const val = data[i * 2] ?? 0;
          return Math.max(8, Math.min(34, 8 + Math.round((val / 255) * 26)));
        });
        setWaveBars(bars);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // Fall back quietly if WebAudio meter permission denied while SpeechRecognition runs
    }
  };

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      stopAudioMeter();
      void stopSpeaking();
    };
  }, []);

  const handleSendVoiceMessage = async (overrideText?: string) => {
    const clean = (overrideText ?? transcriptRef.current).trim();
    if (!clean) {
      showToast(isEn ? 'Speak or type a message first' : 'تحدث أو اكتب رسالة أولاً', 'info');
      return;
    }
    if (!state.currentId) createNewConversation();
    setSending(true);
    setMicError(null);
    try {
      const res = await sendMessage(clean);
      if (res.status === 'complete') {
        setReplyText(res.message.content);
        if (!mutedRef.current) {
          await speakResponse(res.message.content).catch(() => undefined);
        }
        if (handsFreeRef.current) {
          setTranscript('');
          transcriptRef.current = '';
          startListeningSession();
        }
      } else {
        showToast(res.reason, 'error');
      }
    } finally {
      setSending(false);
    }
  };

  const startListeningSession = () => {
    setMicError(null);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setMicError(
        isEn
          ? 'Live SpeechRecognition API is unavailable in this browser. Type your prompt below to speak with AI.'
          : 'واجهة التعرف الصوتي المباشر (SpeechRecognition) غير متاحة في هذا المتصفح. يمكنك كتابة رسالتك بالأسفل وسماع الرد الصوتي.',
      );
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = isEn ? 'en-US' : 'ar-SA';
      rec.interimResults = true;
      rec.continuous = !handsFreeRef.current;
      rec.onresult = (event) => {
        const text = Array.from(event.results)
          .map((r) => r[0]?.transcript || '')
          .join(' ')
          .trim();
        transcriptRef.current = text;
        setTranscript(text);
      };
      rec.onerror = (event) => {
        setListening(false);
        stopAudioMeter();
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setMicError(isEn ? 'Microphone access was denied.' : 'تم رفض إذن الوصول إلى الميكروفون.');
        }
      };
      rec.onend = () => {
        setListening(false);
        stopAudioMeter();
        if (handsFreeRef.current && transcriptRef.current.trim()) {
          void handleSendVoiceMessage(transcriptRef.current);
        }
      };
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
      void startAudioMeter();
    } catch {
      setListening(false);
      stopAudioMeter();
      setMicError(isEn ? 'Could not initialize microphone.' : 'تعذر الوصول إلى الميكروفون.');
    }
  };

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      stopAudioMeter();
      return;
    }
    startListeningSession();
  };

  const handleSendToChat = () => {
    const clean = transcript.trim();
    if (!clean) {
      showToast(isEn ? 'Speak or enter text first' : 'تحدث أو اكتب نصاً أولاً', 'info');
      return;
    }
    const convId = state.currentId || createNewConversation();
    if (!convId) return;
    const draftId = createChatDraft(clean);
    router.push(`/chat/${convId}?draft=${encodeURIComponent(draftId)}`);
  };

  const BackIcon = isEn ? ArrowLeft : ArrowRight;

  return (
    <div className="flex flex-col h-full min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 border-b"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => router.back()} className="p-2 rounded-xl hover:bg-black/5 cursor-pointer">
            <BackIcon size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold">{isEn ? 'Voice Chat' : 'المحادثة الصوتية'}</h1>
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
              {state.activeModel?.name ?? (isEn ? 'Choose a model' : 'اختر نموذجاً من النماذج')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHandsFree((h) => !h)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold cursor-pointer"
            style={{
              backgroundColor: handsFree ? 'var(--surface-variant)' : 'transparent',
              borderColor: handsFree ? 'var(--primary)' : 'var(--border)',
              color: handsFree ? 'var(--primary)' : 'var(--muted)',
            }}
            title={isEn ? 'Continuous Conversation' : 'محادثة مستمرة تلقائياً'}
          >
            <Repeat size={14} />
            <span>{isEn ? 'Hands-Free' : 'حوار مستمر'}</span>
          </button>
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
            title={muted ? (isEn ? 'Unmute TTS' : 'إلغاء كتم الصوت') : (isEn ? 'Mute TTS' : 'كتم الرد الصوتي')}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-8 flex flex-col items-center justify-between gap-6 max-w-xl mx-auto w-full">
        {micError && (
          <div
            className="w-full flex items-start gap-2.5 p-3.5 rounded-2xl border text-xs font-semibold"
            style={{ backgroundColor: 'rgba(234,67,53,0.1)', borderColor: 'var(--error)', color: 'var(--error)' }}
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{micError}</span>
          </div>
        )}

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

          <div className="flex items-center justify-center gap-1.5 h-10">
            {waveBars.map((height, idx) => (
              <span
                key={idx}
                className="w-1.5 rounded-full transition-all duration-75"
                style={{
                  height: sending ? 18 + (idx % 3) * 6 : height,
                  backgroundColor: listening || sending ? 'var(--primary)' : 'var(--border)',
                }}
              />
            ))}
          </div>

          <p className="text-xs font-bold text-center" style={{ color: 'var(--muted)' }}>
            {sending
              ? isEn
                ? 'Generating reply...'
                : 'جاري إرسال الرسالة الصوتية وتوليد الرد...'
              : listening
                ? isEn
                  ? 'Listening live... tap to stop'
                  : 'جاري الاستماع... اضغط للإيقاف'
                : isEn
                  ? 'Tap the mic orb to start speaking or type below'
                  : 'اضغط على الدائرة لبدء التحدث أو اكتب رسالتك أدناه'}
          </p>
        </div>

        <div className="w-full space-y-3">
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={3}
            placeholder={
              isEn
                ? 'Captured speech will appear here (editable)...'
                : 'النص الملتقط من الصوت سيظهر هنا (ويمكنك تعديله يدوياً)...'
            }
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
                  {isEn ? 'Gassar.AI Reply' : 'رد Gassar.AI'}
                </span>
                <button
                  type="button"
                  onClick={() => void speakResponse(replyText)}
                  className="flex items-center gap-1 text-xs font-semibold cursor-pointer"
                  style={{ color: 'var(--primary)' }}
                >
                  <RotateCcw size={13} />
                  <span>{isEn ? 'Replay' : 'إعادة التشغيل'}</span>
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
              <span>{sending ? (isEn ? 'Replying...' : 'جاري الرد...') : (isEn ? 'Send & Speak Reply' : 'إرسال وسماع الرد')}</span>
            </button>

            <button
              type="button"
              onClick={handleSendToChat}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border text-sm font-bold cursor-pointer"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
            >
              <MessageSquarePlus size={16} style={{ color: 'var(--secondary)' }} />
              <span>{isEn ? 'Continue in Chat' : 'إرسال إلى المحادثة'}</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
