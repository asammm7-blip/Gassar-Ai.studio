import { storage } from './storage';

export const TTS_SETTINGS_KEYS = {
  enabled: 'gassar_tts_enabled',
  autoRead: 'gassar_tts_auto_read',
  rate: 'gassar_tts_rate',
  voice: 'gassar_tts_voice',
  volume: 'gassar_tts_volume',
} as const;

export type TtsSettings = {
  enabled: boolean;
  autoRead: boolean;
  rate: number;
  voice: string;
  volume: number;
};

export type TtsVoice = {
  identifier: string;
  language?: string;
  name?: string;
};

export type TtsPlaybackState = {
  activeId: string | null;
  status: 'idle' | 'speaking';
  paused: boolean;
};

const DEFAULT_TTS_SETTINGS: TtsSettings = {
  enabled: false,
  autoRead: false,
  rate: 0.95,
  voice: 'default',
  volume: 1,
};

let speechGeneration = 0;
let playbackState: TtsPlaybackState = { activeId: null, status: 'idle', paused: false };
const playbackListeners = new Set<(state: TtsPlaybackState) => void>();

function publishPlayback(state: TtsPlaybackState) {
  playbackState = state;
  playbackListeners.forEach((listener) => listener(playbackState));
}

export function getTtsPlaybackState(): TtsPlaybackState {
  return playbackState;
}

export function subscribeTtsPlayback(listener: (state: TtsPlaybackState) => void): () => void {
  playbackListeners.add(listener);
  listener(playbackState);
  return () => playbackListeners.delete(listener);
}

export async function getAvailableTtsVoices(): Promise<TtsVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const list = window.speechSynthesis.getVoices();
  return list.map((voice) => ({
    identifier: voice.voiceURI || voice.name,
    language: voice.lang,
    name: voice.name,
  }));
}

export async function getTtsSettings(): Promise<TtsSettings> {
  const values = await storage.multiGet(Object.values(TTS_SETTINGS_KEYS));
  const stored = Object.fromEntries(values);
  const rate = Number(stored[TTS_SETTINGS_KEYS.rate]);
  const volume = Number(stored[TTS_SETTINGS_KEYS.volume]);
  const voice = stored[TTS_SETTINGS_KEYS.voice];

  return {
    enabled: stored[TTS_SETTINGS_KEYS.enabled] === 'true',
    autoRead: stored[TTS_SETTINGS_KEYS.autoRead] === 'true',
    rate: Number.isFinite(rate) ? Math.min(1.5, Math.max(0.5, rate)) : DEFAULT_TTS_SETTINGS.rate,
    voice: voice && voice.trim().length > 0 ? voice : DEFAULT_TTS_SETTINGS.voice,
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : DEFAULT_TTS_SETTINGS.volume,
  };
}

export async function speakResponse(text: string, settings?: TtsSettings): Promise<void> {
  return speakResponseFor(null, text, settings);
}

export async function speakResponseFor(id: string | null, text: string, settings?: TtsSettings): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    throw new Error('محرك تحويل النص إلى كلام غير مدعوم في هذا المتصفح.');
  }
  const resolved = settings ?? (await getTtsSettings());
  if (!text.trim() || resolved.volume <= 0) return;

  const generation = ++speechGeneration;
  window.speechSynthesis.cancel();
  if (generation !== speechGeneration) return;
  publishPlayback({ activeId: id, status: 'speaking', paused: false });

  try {
    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text.trim());
      utterance.rate = resolved.rate;
      utterance.volume = resolved.volume;
      if (resolved.voice === 'ar-SA' || resolved.voice === 'en-US') {
        utterance.lang = resolved.voice;
      } else if (resolved.voice !== 'default') {
        const match = window.speechSynthesis
          .getVoices()
          .find((v) => v.voiceURI === resolved.voice || v.name === resolved.voice);
        if (match) utterance.voice = match;
      } else {
        utterance.lang = /[\u0600-\u06FF]/.test(text) ? 'ar-SA' : 'en-US';
      }
      utterance.onend = () => resolve();
      utterance.onerror = (event) => {
        if (event.error === 'interrupted' || event.error === 'canceled') resolve();
        else reject(new Error(event.error || 'تعذر تشغيل الصوت'));
      };
      window.speechSynthesis.speak(utterance);
    });
  } finally {
    if (generation === speechGeneration) {
      publishPlayback({ activeId: null, status: 'idle', paused: false });
    }
  }
}

export async function stopSpeaking(): Promise<void> {
  ++speechGeneration;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  publishPlayback({ activeId: null, status: 'idle', paused: false });
}

export async function pauseSpeaking(): Promise<void> {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.pause();
    publishPlayback({ ...playbackState, paused: true });
  }
}

export async function resumeSpeaking(): Promise<void> {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.resume();
    publishPlayback({ ...playbackState, paused: false });
  }
}

export { DEFAULT_TTS_SETTINGS };
