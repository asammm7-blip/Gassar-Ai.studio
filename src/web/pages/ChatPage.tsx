import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  SlidersHorizontal,
  PlusSquare,
  MoreVertical,
  Pin,
  Star,
  Archive,
  Trash2,
  Share2,
  Pencil,
  GitBranch,
  Plus,
  Send,
  Square,
  Mic,
  MicOff,
  Brain,
  Globe,
  RotateCcw,
  AlertCircle,
  X,
  Sparkles,
} from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { useRouter } from '../contexts/RouterContext';
import { useToast } from '../contexts/ToastContext';
import { displayedContent } from '../chat-data';
import { getChatDraft, removeChatDraft } from '../chat-drafts';
import type { ChatAttachment } from '../attachment-service';
import { getTtsSettings, speakResponseFor, stopSpeaking } from '../tts-service';
import { MediaMenu } from '../components/MediaMenu';
import { AttachmentPreview } from '../components/AttachmentPreview';
import { ModelDropdown } from '../components/ModelDropdown';
import { ConnectionModeDropdown } from '../components/ConnectionModeDropdown';
import { AssistantMessageActions, ReasoningCodeBlock } from '../components/AssistantMessageActions';
import { UserMessageActions } from '../components/UserMessageActions';
import { ProcessingBubbles } from '../components/ProcessingBubbles';
import { translate } from '../i18n';

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

export function ChatPage({ conversationId }: { conversationId: string }) {
  const {
    state,
    selectConversation,
    createNewConversation,
    deleteConversation,
    renameConversation,
    toggleConversationPinned,
    toggleConversationFavorite,
    toggleConversationArchived,
    sendMessage,
    retryMessage,
    regenerateResponse,
    editUserMessage,
    cancelGeneration,
    updateMessage,
    restoreBranch,
  } = useChatContext();
  const { language } = useAppSettings();
  const isEn = language === 'en';
  const router = useRouter();
  const { confirm, prompt, showToast } = useToast();

  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [attachmentStatus, setAttachmentStatus] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const consumedDraftRef = useRef<string | null>(null);

  useEffect(() => {
    if (conversationId && state.currentId !== conversationId && state.conversationsById[conversationId]) {
      selectConversation(conversationId);
    }
  }, [conversationId, selectConversation, state.conversationsById, state.currentId]);

  const conversation = state.conversationsById[conversationId] ?? state.currentConversation;

  const streamingDraft =
    state.streaming && state.streaming.conversationId === conversationId ? state.streaming : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages.length, state.pending?.requestId, streamingDraft?.text]);

  const runSend = async (text: string, sendAttachments: ChatAttachment[]) => {
    const result = await sendMessage(
      text,
      sendAttachments,
      (progress) => {
        if (progress.stage === 'reading') {
          setAttachmentStatus(
            isEn
              ? `Preparing attachment (${progress.current}/${progress.total}): ${progress.name}`
              : `جاري تجهيز المرفق (${progress.current}/${progress.total}): ${progress.name}`,
          );
        } else if (progress.stage === 'ready') {
          setAttachmentStatus(isEn ? `Ready: ${progress.name}` : `تمت قراءة: ${progress.name}`);
        }
      },
      { thinking: thinkingEnabled, web: webSearchEnabled },
    );
    setAttachmentStatus(null);
    if (result.status === 'complete') {
      const tts = await getTtsSettings();
      if (tts.enabled && tts.autoRead) {
        void speakResponseFor(result.message.id, displayedContent(result.message), tts).catch(() => undefined);
      }
    } else if (result.status === 'refused' || result.status === 'failed') {
      showToast(result.reason, 'error');
    }
  };

  useEffect(() => {
    if (!state.hydrated || !conversation || conversation.id !== conversationId) return;
    const params = new URLSearchParams(router.search);
    const draftId = params.get('draft');
    if (!draftId || consumedDraftRef.current === draftId) return;
    const draft = getChatDraft(draftId);
    if (!draft) return;
    consumedDraftRef.current = draftId;
    removeChatDraft(draftId);
    router.replace(`/chat/${conversationId}`);
    void Promise.resolve().then(() => runSend(draft.content, draft.attachments));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id, conversationId, router.search, state.hydrated]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      void stopSpeaking();
    };
  }, []);

  const handleSend = () => {
    if (state.pending) return;
    const trimmed = inputText.trim();
    if (!trimmed && attachments.length === 0) return;
    const payloadText =
      trimmed ||
      (isEn ? 'Analyze the attached items and give me a clear summary.' : 'حلّل المرفقات المرسلة وأعطني ملخصاً واضحاً.');
    const payloadAttachments = [...attachments];
    setInputText('');
    setAttachments([]);
    void runSend(payloadText, payloadAttachments);
  };

  const handleToggleDictation = () => {
    if (dictating) {
      recognitionRef.current?.stop();
      setDictating(false);
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      showToast(
        isEn
          ? 'Live voice dictation is not supported in this browser.'
          : 'الإدخال الصوتي المباشر غير مدعوم في هذا المتصفح. يمكنك استخدام الكتابة أو صفحة الصوت.',
        'error',
      );
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = isEn ? 'en-US' : 'ar-SA';
      rec.interimResults = true;
      rec.continuous = false;
      rec.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((res) => res[0]?.transcript || '')
          .join(' ')
          .trim();
        if (transcript) setInputText(transcript);
      };
      rec.onerror = () => {
        setDictating(false);
      };
      rec.onend = () => {
        setDictating(false);
      };
      recognitionRef.current = rec;
      rec.start();
      setDictating(true);
    } catch {
      setDictating(false);
      showToast(isEn ? 'Could not start microphone' : 'تعذر بدء الميكروفون في المتصفح', 'error');
    }
  };

  const handleNewChat = () => {
    const id = createNewConversation();
    if (id) router.push(`/chat/${id}`);
  };

  const handleShareConversation = async () => {
    setMenuOpen(false);
    if (!conversation) return;
    const text = conversation.messages
      .map((m) => `${m.role === 'user' ? (isEn ? 'You' : 'أنت') : 'Gassar.AI'}: ${displayedContent(m)}`)
      .join('\n\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: conversation.title, text: text || conversation.title });
      } else {
        await navigator.clipboard.writeText(text || conversation.title);
        showToast(isEn ? 'Conversation copied for sharing' : 'تم نسخ المحادثة للمشاركة', 'success');
      }
    } catch {
      // cancelled
    }
  };

  const handleRename = async () => {
    setMenuOpen(false);
    if (!conversation) return;
    const next = await prompt({
      title: isEn ? 'Rename Conversation' : 'إعادة تسمية المحادثة',
      defaultValue: conversation.title,
      placeholder: isEn ? 'New title...' : 'العنوان الجديد...',
    });
    if (next && next.trim()) {
      await renameConversation(conversation.id, next.trim());
      showToast(isEn ? 'Conversation renamed' : 'تم تغيير اسم المحادثة', 'success');
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    if (!conversation) return;
    const ok = await confirm({
      title: isEn ? 'Delete Conversation' : 'حذف المحادثة',
      message: isEn ? `Permanently delete "${conversation.title}"?` : `هل تريد حذف "${conversation.title}" نهائياً؟`,
      confirmLabel: isEn ? 'Delete' : 'حذف',
      destructive: true,
    });
    if (ok) {
      await deleteConversation(conversation.id);
      router.replace('/');
    }
  };

  const isGenerating = Boolean(state.pending && state.pending.conversationId === conversationId);
  const branches = useMemo(() => conversation?.branches ?? [], [conversation?.branches]);
  const BackIcon = isEn ? ArrowLeft : ArrowRight;

  if (!state.hydrated) {
    return (
      <div
        className="flex items-center justify-center h-full min-h-screen"
        style={{ backgroundColor: 'var(--background)', color: 'var(--muted)' }}
      >
        <span className="text-sm font-semibold">{isEn ? 'Loading conversation...' : 'جاري تحميل المحادثة...'}</span>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full min-h-screen p-6 text-center gap-4"
        style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
      >
        <AlertCircle size={36} style={{ color: 'var(--muted)' }} />
        <p className="text-base font-bold">{isEn ? 'Conversation not found' : 'لم يتم العثور على هذه المحادثة'}</p>
        <button
          type="button"
          onClick={() => router.replace('/')}
          className="px-5 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer"
          style={{ backgroundColor: 'var(--primary)' }}
        >
          {translate(language, 'backHome')}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full min-h-screen"
      style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
      onClick={() => menuOpen && setMenuOpen(false)}
    >
      <header
        className="sticky top-0 z-20 flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="p-2 rounded-xl hover:bg-black/5 cursor-pointer shrink-0"
            aria-label={translate(language, 'backHome')}
          >
            <BackIcon size={20} />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-base font-bold truncate">
              {conversation.title || translate(language, 'newChat')}
            </h1>
            <p className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>
              {state.activeModel?.name ?? (isEn ? 'No model selected' : 'لم يُختر نموذج')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 relative" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => router.push('/model-settings')}
            className="p-2 rounded-xl hover:bg-black/5 cursor-pointer"
            title={translate(language, 'modelSettings')}
          >
            <SlidersHorizontal size={18} style={{ color: 'var(--muted)' }} />
          </button>
          <button
            type="button"
            onClick={handleNewChat}
            className="p-2 rounded-xl hover:bg-black/5 cursor-pointer"
            title={translate(language, 'newChat')}
          >
            <PlusSquare size={18} style={{ color: 'var(--primary)' }} />
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-2 rounded-xl hover:bg-black/5 cursor-pointer"
            title={isEn ? 'Options' : 'خيارات المحادثة'}
          >
            <MoreVertical size={18} style={{ color: 'var(--muted)' }} />
          </button>

          {menuOpen && (
            <div
              className={`absolute ${isEn ? 'right-0' : 'left-0'} top-11 z-30 w-48 rounded-2xl border shadow-xl p-1.5 space-y-0.5`}
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <button
                type="button"
                onClick={() => void handleShareConversation()}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 cursor-pointer"
              >
                <Share2 size={14} />
                <span>{isEn ? 'Share Chat' : 'مشاركة المحادثة'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void toggleConversationPinned(conversation.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 cursor-pointer"
              >
                <Pin size={14} />
                <span>{conversation.pinned ? (isEn ? 'Unpin' : 'إلغاء التثبيت') : (isEn ? 'Pin' : 'تثبيت')}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleRename()}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 cursor-pointer"
              >
                <Pencil size={14} />
                <span>{isEn ? 'Rename' : 'إعادة تسمية'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void toggleConversationFavorite(conversation.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 cursor-pointer"
              >
                <Star size={14} />
                <span>
                  {conversation.favorite
                    ? isEn
                      ? 'Remove Favorite'
                      : 'إزالة من المفضلة'
                    : isEn
                      ? 'Add Favorite'
                      : 'إضافة للمفضلة'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void toggleConversationArchived(conversation.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 cursor-pointer"
              >
                <Archive size={14} />
                <span>{conversation.archived ? (isEn ? 'Unarchive' : 'إلغاء الأرشفة') : (isEn ? 'Archive' : 'أرشفة')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setBranchesOpen(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <GitBranch size={14} />
                  <span>{translate(language, 'savedBranches')}</span>
                </span>
                <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  {branches.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 cursor-pointer"
                style={{ color: 'var(--error)' }}
              >
                <Trash2 size={14} />
                <span>{isEn ? 'Delete Chat' : 'حذف المحادثة'}</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {state.error && (
        <div
          className="px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b"
          style={{ backgroundColor: 'rgba(234,67,53,0.1)', borderColor: 'var(--error)', color: 'var(--error)' }}
        >
          <AlertCircle size={15} className="shrink-0" />
          <span className="flex-1">{state.error}</span>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-3 sm:px-5 py-4">
        <div className="max-w-3xl mx-auto space-y-5">
          {conversation.messages.length === 0 && !isGenerating && (
            <div className="py-16 text-center space-y-3">
              <div
                className="w-14 h-14 mx-auto rounded-3xl flex items-center justify-center text-white shadow-md"
                style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))' }}
              >
                <Sparkles size={24} />
              </div>
              <h2 className="text-lg font-bold">
                {translate(language, 'startConversationWith', { model: state.activeModel?.name ?? 'Gassar.AI' })}
              </h2>
              <p className="text-xs max-w-sm mx-auto" style={{ color: 'var(--muted)' }}>
                {translate(language, 'startConversationHint')}
              </p>
            </div>
          )}

          {conversation.messages.map((msg) => {
            const isUser = msg.role === 'user';
            const content = displayedContent(msg);

            if (isUser) {
              return (
                <div key={msg.id} className="flex flex-col items-end">
                  <div
                    className="max-w-[85%] rounded-3xl rounded-ee-md px-4 py-3 shadow-xs border"
                    style={{
                      backgroundColor: 'var(--surface-variant)',
                      borderColor: 'var(--border)',
                      color: 'var(--foreground)',
                    }}
                  >
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mb-2">
                        <AttachmentPreview attachments={msg.attachments} compact />
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
                    <UserMessageActions
                      content={content}
                      disabled={isGenerating}
                      onSaveEdit={(next) => {
                        void editUserMessage(msg.id, next, msg.attachments);
                      }}
                    />
                  </div>

                  {msg.generationStatus === 'failed' && (
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => void retryMessage(msg.id)}
                      className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer"
                      style={{
                        borderColor: 'var(--error)',
                        color: 'var(--error)',
                        backgroundColor: 'rgba(234,67,53,0.08)',
                      }}
                    >
                      <RotateCcw size={12} />
                      <span>{translate(language, 'retry')}</span>
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex items-start gap-2.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs"
                  style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))' }}
                >
                  <Sparkles size={15} />
                </div>
                <div
                  className="flex-1 min-w-0 rounded-3xl rounded-ss-md px-4 py-3.5 border shadow-xs"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--border)',
                    color: 'var(--foreground)',
                  }}
                >
                  {msg.modelName && (
                    <p className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--primary)' }}>
                      {msg.modelName}
                    </p>
                  )}

                  {msg.reasoning && <ReasoningCodeBlock reasoning={msg.reasoning} />}

                  <div className="text-sm whitespace-pre-wrap leading-relaxed break-words">{content}</div>

                  <AssistantMessageActions
                    message={msg}
                    disabled={isGenerating}
                    onFeedback={(fb) => void updateMessage(msg.id, { feedback: fb })}
                    onRegenerate={() => void regenerateResponse(msg.id)}
                    onSwitchVersion={(idx) => void updateMessage(msg.id, { activeVersion: idx })}
                  />
                </div>
              </div>
            );
          })}

          {isGenerating &&
            (streamingDraft && (streamingDraft.text || streamingDraft.reasoning) ? (
              <div className="flex items-start gap-2.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs animate-pulse"
                  style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))' }}
                >
                  <Sparkles size={15} />
                </div>
                <div
                  className="flex-1 min-w-0 rounded-3xl rounded-ss-md px-4 py-3.5 border shadow-xs"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--primary)',
                    color: 'var(--foreground)',
                  }}
                >
                  {state.activeModel?.name && (
                    <p className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--primary)' }}>
                      {state.activeModel.name}
                    </p>
                  )}
                  {streamingDraft.reasoning && <ReasoningCodeBlock reasoning={streamingDraft.reasoning} />}
                  <div className="text-sm whitespace-pre-wrap leading-relaxed break-words">
                    {streamingDraft.text || (isEn ? 'Thinking...' : 'جاري التفكير...')}
                    <span className="inline-block w-1.5 h-4 ms-1 align-middle animate-pulse" style={{ backgroundColor: 'var(--primary)' }} />
                  </div>
                </div>
              </div>
            ) : (
              <ProcessingBubbles
                attachmentStatus={attachmentStatus}
                thinkingActive={thinkingEnabled}
                modelName={state.activeModel?.name}
              />
            ))}

          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer
        className="sticky bottom-0 z-20 border-t px-3 sm:px-4 py-3"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="max-w-3xl mx-auto space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setThinkingEnabled((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer transition-colors"
                style={{
                  backgroundColor: thinkingEnabled ? 'var(--surface-variant)' : 'var(--background)',
                  borderColor: thinkingEnabled ? 'var(--primary)' : 'var(--border)',
                  color: thinkingEnabled ? 'var(--primary)' : 'var(--muted)',
                }}
              >
                <Brain size={13} />
                <span>{translate(language, 'thinkingToggle')}</span>
              </button>

              <button
                type="button"
                onClick={() => setWebSearchEnabled((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer transition-colors"
                style={{
                  backgroundColor: webSearchEnabled ? 'var(--surface-variant)' : 'var(--background)',
                  borderColor: webSearchEnabled ? 'var(--secondary)' : 'var(--border)',
                  color: webSearchEnabled ? 'var(--secondary)' : 'var(--muted)',
                }}
              >
                <Globe size={13} />
                <span>{translate(language, 'webSearchToggle')}</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <ConnectionModeDropdown compact />
              <ModelDropdown compact />
            </div>
          </div>

          <AttachmentPreview
            attachments={attachments}
            compact
            onRemove={(idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
          />

          <div
            className="flex items-end gap-1.5 rounded-3xl border px-3 py-2"
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border)' }}
          >
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => setMediaOpen(true)}
              className="p-2 rounded-full hover:bg-black/5 cursor-pointer disabled:opacity-40 shrink-0"
              style={{ color: 'var(--muted)' }}
              title={translate(language, 'attachMedia')}
            >
              <Plus size={19} />
            </button>

            <button
              type="button"
              disabled={isGenerating}
              onClick={handleToggleDictation}
              className="p-2 rounded-full hover:bg-black/5 cursor-pointer disabled:opacity-40 shrink-0"
              style={{ color: dictating ? 'var(--error)' : 'var(--muted)' }}
              title={dictating ? (isEn ? 'Stop dictation' : 'إيقاف الإملاء الصوتي') : (isEn ? 'Voice dictation' : 'إملاء صوتي')}
            >
              {dictating ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={translate(language, 'writeMessage')}
              rows={1}
              className="flex-1 bg-transparent py-2 text-sm outline-none resize-none max-h-36 leading-relaxed"
              style={{ color: 'var(--foreground)' }}
            />

            {isGenerating ? (
              <button
                type="button"
                onClick={() => void cancelGeneration()}
                className="p-2.5 rounded-full text-white cursor-pointer shrink-0"
                style={{ backgroundColor: 'var(--error)' }}
                title={translate(language, 'stopGeneration')}
              >
                <Square size={15} />
              </button>
            ) : (
              <button
                type="button"
                disabled={!inputText.trim() && attachments.length === 0}
                onClick={handleSend}
                className="p-2.5 rounded-full text-white cursor-pointer disabled:opacity-40 shrink-0"
                style={{ backgroundColor: 'var(--primary)' }}
                title={translate(language, 'send')}
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </footer>

      <MediaMenu
        visible={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onAddAttachment={(att) => setAttachments((prev) => [...prev, att])}
      />

      {branchesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
          onClick={() => setBranchesOpen(false)}
        >
          <div
            className="w-full max-w-md max-h-[80vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-base font-bold">
                {translate(language, 'savedBranches')} ({branches.length})
              </h3>
              <button
                type="button"
                onClick={() => setBranchesOpen(false)}
                className="p-1.5 rounded-xl cursor-pointer"
                style={{ color: 'var(--muted)' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {branches.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--muted)' }}>
                  {isEn
                    ? 'Branches are automatically saved before editing a prompt, regenerating, or switching reply versions.'
                    : 'تُحفظ الفروع تلقائياً عند تعديل سؤال أو إعادة توليد رد أو تبديل نسخة الرد.'}
                </p>
              ) : (
                branches.map((branch) => (
                  <div
                    key={branch.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl border"
                    style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate">{branch.label}</p>
                      <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                        {isEn ? `${branch.messages.length} msgs` : `${branch.messages.length} رسالة`} ·{' '}
                        {new Date(branch.createdAt).toLocaleString(isEn ? 'en-US' : 'ar-SA')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void restoreBranch(branch.id);
                        setBranchesOpen(false);
                        showToast(isEn ? 'Branch restored' : 'تمت استعادة الفرع', 'success');
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-white cursor-pointer"
                      style={{ backgroundColor: 'var(--primary)' }}
                    >
                      {translate(language, 'restore')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
