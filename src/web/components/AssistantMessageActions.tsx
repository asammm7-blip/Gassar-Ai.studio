import React, { useEffect, useState } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  Volume2,
  Pause,
  Play,
  Square,
  Share2,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import type { Message } from '../chat-data';
import { displayedContent } from '../chat-data';
import {
  getTtsPlaybackState,
  pauseSpeaking,
  resumeSpeaking,
  speakResponseFor,
  stopSpeaking,
  subscribeTtsPlayback,
  type TtsPlaybackState,
} from '../tts-service';
import { useToast } from '../contexts/ToastContext';

interface AssistantMessageActionsProps {
  message: Message;
  onFeedback: (feedback: 'up' | 'down' | null) => void;
  onRegenerate: () => void;
  onSwitchVersion: (versionIndex: number) => void;
  disabled?: boolean;
}

export function AssistantMessageActions({
  message,
  onFeedback,
  onRegenerate,
  onSwitchVersion,
  disabled = false,
}: AssistantMessageActionsProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [playback, setPlayback] = useState<TtsPlaybackState>(getTtsPlaybackState);

  useEffect(() => subscribeTtsPlayback(setPlayback), []);

  const text = displayedContent(message);
  const isSpeakingThis = playback.status === 'speaking' && playback.activeId === message.id;
  const totalVersions = message.versions?.length ?? 1;
  const currentVersion = message.activeVersion ?? totalVersions - 1;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('تعذر النسخ إلى الحافظة', 'error');
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'رد من Gassar.AI', text });
      } else {
        await navigator.clipboard.writeText(text);
        showToast('تم نسخ الرد للمشاركة', 'success');
      }
    } catch {
      // User cancelled share dialog
    }
  };

  const handleSpeak = async () => {
    try {
      if (isSpeakingThis) {
        if (playback.paused) await resumeSpeaking();
        else await pauseSpeaking();
      } else {
        await speakResponseFor(message.id, text);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر تشغيل القراءة الصوتية', 'error');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 mt-2">
      <button
        type="button"
        onClick={() => onFeedback(message.feedback === 'up' ? null : 'up')}
        className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer transition-colors"
        style={{ color: message.feedback === 'up' ? 'var(--success)' : 'var(--muted)' }}
        title="أعجبني"
      >
        <ThumbsUp size={14} />
      </button>

      <button
        type="button"
        onClick={() => onFeedback(message.feedback === 'down' ? null : 'down')}
        className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer transition-colors"
        style={{ color: message.feedback === 'down' ? 'var(--error)' : 'var(--muted)' }}
        title="لم يعجبني"
      >
        <ThumbsDown size={14} />
      </button>

      <button
        type="button"
        onClick={() => void handleCopy()}
        className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer transition-colors"
        style={{ color: copied ? 'var(--success)' : 'var(--muted)' }}
        title="نسخ"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>

      <button
        type="button"
        onClick={() => void handleSpeak()}
        className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer transition-colors"
        style={{ color: isSpeakingThis ? 'var(--primary)' : 'var(--muted)' }}
        title={isSpeakingThis ? (playback.paused ? 'استئناف القراءة' : 'إيقاف مؤقت') : 'قراءة صوتية'}
      >
        {isSpeakingThis ? playback.paused ? <Play size={14} /> : <Pause size={14} /> : <Volume2 size={14} />}
      </button>

      {isSpeakingThis && (
        <button
          type="button"
          onClick={() => void stopSpeaking()}
          className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer"
          style={{ color: 'var(--error)' }}
          title="إيقاف القراءة"
        >
          <Square size={13} />
        </button>
      )}

      <button
        type="button"
        onClick={() => void handleShare()}
        className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer transition-colors"
        style={{ color: 'var(--muted)' }}
        title="مشاركة"
      >
        <Share2 size={14} />
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={onRegenerate}
        className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer disabled:opacity-40 disabled:cursor-default transition-colors"
        style={{ color: 'var(--muted)' }}
        title="إعادة التوليد"
      >
        <RotateCcw size={14} />
      </button>

      {totalVersions > 1 && (
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ms-1"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <button
            type="button"
            disabled={disabled || currentVersion <= 0}
            onClick={() => onSwitchVersion(currentVersion - 1)}
            className="disabled:opacity-30 cursor-pointer"
            aria-label="الإجابة السابقة"
          >
            <ChevronRight size={13} />
          </button>
          <span>
            الإجابة {currentVersion + 1} / {totalVersions}
          </span>
          <button
            type="button"
            disabled={disabled || currentVersion >= totalVersions - 1}
            onClick={() => onSwitchVersion(currentVersion + 1)}
            className="disabled:opacity-30 cursor-pointer"
            aria-label="الإجابة التالية"
          >
            <ChevronLeft size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

export function ReasoningCodeBlock({ reasoning }: { reasoning: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="mb-3 rounded-2xl border overflow-hidden"
      style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold cursor-pointer"
        style={{ color: 'var(--primary)' }}
      >
        <span className="flex items-center gap-1.5">
          <Sparkles size={13} />
          <span>سلسلة التفكير والاستدلال</span>
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <pre
          className="px-3.5 pb-3 text-xs whitespace-pre-wrap leading-relaxed font-sans border-t pt-2.5"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          {reasoning}
        </pre>
      )}
    </div>
  );
}
