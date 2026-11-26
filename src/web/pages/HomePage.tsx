import React, { useMemo, useRef, useState } from 'react';
import {
  Menu,
  Settings,
  Sparkles,
  Plus,
  Send,
  MoreVertical,
  Pin,
  Copy,
  Share2,
  Pencil,
  Trash2,
  MessageSquare,
  Lightbulb,
  Code2,
  BookOpen,
  Languages,
  FileSpreadsheet,
  Compass,
  Mic,
} from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { useRouter } from '../contexts/RouterContext';
import { useToast } from '../contexts/ToastContext';
import { SidebarDrawer } from '../components/SidebarDrawer';
import { MediaMenu } from '../components/MediaMenu';
import { AttachmentPreview } from '../components/AttachmentPreview';
import { ModelDropdown } from '../components/ModelDropdown';
import { ConnectionModeDropdown } from '../components/ConnectionModeDropdown';
import { PWAInstallButton } from '../components/PWAInstallButton';
import type { ChatAttachment } from '../attachment-service';
import { createChatDraft } from '../chat-drafts';
import type { Conversation } from '../chat-data';
import { translate } from '../i18n';

const SUGGESTION_CARDS = {
  ar: [
    {
      id: 'explain',
      title: 'اشرح مفهوماً معقداً',
      prompt: 'اشرح لي كيف تعمل نماذج اللغة الكبيرة بأسلوب مبسط مع مثال عملي.',
      icon: Lightbulb,
      color: '#4285F4',
      needsInput: false,
    },
    {
      id: 'code',
      title: 'مساعدة برمجية',
      prompt: 'اكتب دالة TypeScript نظيفة للتحقق من صحة البريد الإلكتروني مع اختبارات سريعة.',
      icon: Code2,
      color: '#7C4DFF',
      needsInput: false,
    },
    {
      id: 'summarize',
      title: 'تلخيص مقال أو نص',
      prompt: 'لخّص النص التالي في نقاط واضحة ومرتبة مع استخلاص أهم الأفكار:\n',
      icon: BookOpen,
      color: '#34A853',
      needsInput: true,
    },
    {
      id: 'translate',
      title: 'ترجمة احترافية',
      prompt: 'ترجم النص التالي إلى العربية الفصحى بأسلوب طبيعي وسلس:\n',
      icon: Languages,
      color: '#5C6BC0',
      needsInput: true,
    },
    {
      id: 'data',
      title: 'تحليل ملفات وجداول',
      prompt: 'ما هي أهم الخطوات لتحليل جدول بيانات واستخراج المؤشرات الرئيسية منه؟',
      icon: FileSpreadsheet,
      color: '#FBBC04',
      needsInput: false,
    },
    {
      id: 'plan',
      title: 'تخطيط يومي ومشاريع',
      prompt: 'ساعدني في وضع خطة عملية منظمة لإنجاز مشروع برمجي خلال أسبوع.',
      icon: Compass,
      color: '#EA4335',
      needsInput: false,
    },
  ],
  en: [
    {
      id: 'explain',
      title: 'Explain a Complex Topic',
      prompt: 'Explain how large language models work in simple terms with a practical example.',
      icon: Lightbulb,
      color: '#4285F4',
      needsInput: false,
    },
    {
      id: 'code',
      title: 'Coding Assistance',
      prompt: 'Write a clean TypeScript email validation function with quick unit tests.',
      icon: Code2,
      color: '#7C4DFF',
      needsInput: false,
    },
    {
      id: 'summarize',
      title: 'Summarize Article or Text',
      prompt: 'Summarize the following text into clear bullet points highlighting key takeaways:\n',
      icon: BookOpen,
      color: '#34A853',
      needsInput: true,
    },
    {
      id: 'translate',
      title: 'Natural Translation',
      prompt: 'Translate the following text into clear, natural English:\n',
      icon: Languages,
      color: '#5C6BC0',
      needsInput: true,
    },
    {
      id: 'data',
      title: 'Analyze Files & Tables',
      prompt: 'What are the key steps to analyze a spreadsheet and extract top metrics?',
      icon: FileSpreadsheet,
      color: '#FBBC04',
      needsInput: false,
    },
    {
      id: 'plan',
      title: 'Daily & Project Planning',
      prompt: 'Help me design a structured 7-day execution plan for shipping a software project.',
      icon: Compass,
      color: '#EA4335',
      needsInput: false,
    },
  ],
};

export function HomePage() {
  const {
    state,
    listConversations,
    createNewConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
    toggleConversationPinned,
  } = useChatContext();
  const { profileName, language } = useAppSettings();
  const isEn = language === 'en';
  const router = useRouter();
  const { confirm, prompt, showToast } = useToast();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const recentConversations = useMemo(() => listConversations({ limit: 8 }), [listConversations]);
  const cards = SUGGESTION_CARDS[isEn ? 'en' : 'ar'];

  const startConversationWithDraft = (text: string, draftAttachments: ChatAttachment[] = []) => {
    const id = createNewConversation();
    if (!id) return;
    const draftId = createChatDraft(text, draftAttachments);
    router.push(`/chat/${id}?draft=${encodeURIComponent(draftId)}`);
  };

  const handleCardClick = (card: (typeof cards)[number]) => {
    if (card.needsInput) {
      setInputText(card.prompt);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
      showToast(translate(language, 'pastePromptHint'), 'info');
      return;
    }
    startConversationWithDraft(card.prompt);
  };

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed && attachments.length === 0) {
      router.push('/voice');
      return;
    }
    const textToSend =
      trimmed ||
      (isEn ? 'Analyze the attached items and give me a clear summary.' : 'حلّل المرفقات المرسلة وأعطني ملخصاً واضحاً.');
    const currentAttachments = [...attachments];
    setInputText('');
    setAttachments([]);
    startConversationWithDraft(textToSend, currentAttachments);
  };

  const handleRename = async (conv: Conversation) => {
    setOpenMenuId(null);
    const nextTitle = await prompt({
      title: isEn ? 'Rename Conversation' : 'إعادة تسمية المحادثة',
      defaultValue: conv.title,
      placeholder: isEn ? 'Enter new title...' : 'اكتب العنوان الجديد...',
    });
    if (nextTitle && nextTitle.trim()) {
      await renameConversation(conv.id, nextTitle.trim());
      showToast(isEn ? 'Conversation renamed' : 'تم تحديث اسم المحادثة', 'success');
    }
  };

  const handleCopyConversation = async (conv: Conversation) => {
    setOpenMenuId(null);
    const text = conv.messages
      .map((m) => `${m.role === 'user' ? (isEn ? 'You' : 'أنت') : 'Gassar.AI'}: ${m.content}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text || conv.title);
      showToast(isEn ? 'Conversation copied to clipboard' : 'تم نسخ المحادثة إلى الحافظة', 'success');
    } catch {
      showToast(isEn ? 'Could not copy conversation' : 'تعذر نسخ المحادثة', 'error');
    }
  };

  const handleShareConversation = async (conv: Conversation) => {
    setOpenMenuId(null);
    const text = conv.messages
      .map((m) => `${m.role === 'user' ? (isEn ? 'You' : 'أنت') : 'Gassar.AI'}: ${m.content}`)
      .join('\n\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: conv.title, text: text || conv.title });
      } else {
        await navigator.clipboard.writeText(text || conv.title);
        showToast(isEn ? 'Copied to clipboard for sharing' : 'تم نسخ المحادثة للمشاركة', 'success');
      }
    } catch {
      // cancelled
    }
  };

  const handleDelete = async (conv: Conversation) => {
    setOpenMenuId(null);
    const ok = await confirm({
      title: isEn ? 'Delete Conversation' : 'حذف المحادثة',
      message: isEn ? `Delete "${conv.title}"?` : `هل أنت متأكد من حذف "${conv.title}"؟`,
      confirmLabel: isEn ? 'Delete' : 'حذف',
      destructive: true,
    });
    if (ok) {
      await deleteConversation(conv.id);
      showToast(isEn ? 'Conversation deleted' : 'تم حذف المحادثة', 'info');
    }
  };

  return (
    <div
      className="flex flex-col h-full min-h-screen"
      style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
      onClick={() => openMenuId && setOpenMenuId(null)}
    >
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 border-b backdrop-blur-md"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-xl hover:bg-black/5 cursor-pointer"
            aria-label={isEn ? 'Open sidebar' : 'فتح القائمة الجانبية'}
          >
            <Menu size={21} />
          </button>
          <div className="flex items-center gap-2">
            <span
              className="w-7 h-7 rounded-xl flex items-center justify-center text-white shadow-xs"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))' }}
            >
              <Sparkles size={15} />
            </span>
            <h1 className="text-lg font-extrabold tracking-tight">{translate(language, 'appName')}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <PWAInstallButton compact />
          <button
            type="button"
            onClick={() => router.push('/settings')}
            className="p-2 rounded-xl hover:bg-black/5 cursor-pointer"
            aria-label={translate(language, 'settings')}
          >
            <Settings size={20} style={{ color: 'var(--muted)' }} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-8">
          <section className="pt-2">
            <h2
              className="text-3xl sm:text-4xl font-extrabold leading-tight bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(135deg, var(--primary), var(--secondary))',
              }}
            >
              {translate(language, 'welcomeGreeting', { name: profileName })}
            </h2>
            <p className="text-base sm:text-lg font-medium mt-2" style={{ color: 'var(--muted)' }}>
              {translate(language, 'welcomeQuestion')}
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold mb-3 px-1" style={{ color: 'var(--muted)' }}>
              {translate(language, 'quickSuggestions')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleCardClick(card)}
                    className="flex items-start gap-3 p-4 rounded-2xl border text-start cursor-pointer hover:shadow-md transition-all"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${card.color}18`, color: card.color }}
                    >
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{card.title}</p>
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--muted)' }}>
                        {card.prompt}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {recentConversations.length > 0 && (
            <section className="pb-4">
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-xs font-bold" style={{ color: 'var(--muted)' }}>
                  {translate(language, 'recentChats')}
                </h3>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="text-xs font-semibold cursor-pointer hover:underline"
                  style={{ color: 'var(--primary)' }}
                >
                  {translate(language, 'viewAll')}
                </button>
              </div>

              <div className="space-y-2">
                {recentConversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => {
                      selectConversation(conv.id);
                      router.push(`/chat/${conv.id}`);
                    }}
                    className="relative flex items-center justify-between gap-3 p-3.5 rounded-2xl border cursor-pointer hover:shadow-xs transition-all"
                    style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: 'var(--surface-variant)', color: 'var(--primary)' }}
                      >
                        {conv.pinned ? <Pin size={16} /> : <MessageSquare size={16} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate">
                          {conv.title || (isEn ? 'New Chat' : 'محادثة جديدة')}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                          {conv.messages[conv.messages.length - 1]?.content ||
                            (isEn ? `${conv.messages.length} messages` : `${conv.messages.length} رسالة`)}
                        </p>
                      </div>
                    </div>

                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setOpenMenuId((prev) => (prev === conv.id ? null : conv.id))}
                        className="p-1.5 rounded-xl hover:bg-black/5 cursor-pointer"
                        style={{ color: 'var(--muted)' }}
                        aria-label={isEn ? 'Chat options' : 'خيارات المحادثة'}
                      >
                        <MoreVertical size={17} />
                      </button>

                      {openMenuId === conv.id && (
                        <div
                          className={`absolute ${isEn ? 'right-0' : 'left-0'} top-9 z-30 w-44 rounded-2xl border shadow-xl p-1.5 space-y-0.5`}
                          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                        >
                          <button
                            type="button"
                            onClick={() => void handleRename(conv)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 cursor-pointer"
                          >
                            <Pencil size={14} />
                            <span>{isEn ? 'Rename' : 'إعادة تسمية'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              void toggleConversationPinned(conv.id);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 cursor-pointer"
                          >
                            <Pin size={14} />
                            <span>{conv.pinned ? (isEn ? 'Unpin' : 'إلغاء التثبيت') : (isEn ? 'Pin' : 'تثبيت')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCopyConversation(conv)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 cursor-pointer"
                          >
                            <Copy size={14} />
                            <span>{isEn ? 'Copy Text' : 'نسخ النص'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleShareConversation(conv)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 cursor-pointer"
                          >
                            <Share2 size={14} />
                            <span>{isEn ? 'Share' : 'مشاركة'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(conv)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 cursor-pointer"
                            style={{ color: 'var(--error)' }}
                          >
                            <Trash2 size={14} />
                            <span>{isEn ? 'Delete' : 'حذف'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <footer
        className="sticky bottom-0 z-20 border-t px-4 py-3"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="max-w-3xl mx-auto space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <ConnectionModeDropdown compact />
              <ModelDropdown compact />
            </div>
            {!state.activeModel && (
              <button
                type="button"
                onClick={() => router.push('/models')}
                className="text-xs font-semibold cursor-pointer hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                {translate(language, 'chooseModelFirst')}
              </button>
            )}
          </div>

          <AttachmentPreview
            attachments={attachments}
            compact
            onRemove={(idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
          />

          <div
            className="flex items-end gap-2 rounded-3xl border px-3 py-2 shadow-xs"
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border)' }}
          >
            <button
              type="button"
              onClick={() => setMediaOpen(true)}
              className="p-2 rounded-full hover:bg-black/5 cursor-pointer shrink-0"
              style={{ color: 'var(--muted)' }}
              title={translate(language, 'attachMedia')}
            >
              <Plus size={20} />
            </button>

            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={translate(language, 'askAnything')}
              rows={1}
              className="flex-1 bg-transparent py-2 text-sm outline-none resize-none max-h-36 leading-relaxed"
              style={{ color: 'var(--foreground)' }}
            />

            <button
              type="button"
              onClick={handleSend}
              className="p-2.5 rounded-full text-white cursor-pointer shrink-0 shadow-xs hover:opacity-95 transition-opacity"
              style={{
                background:
                  inputText.trim() || attachments.length > 0
                    ? 'var(--primary)'
                    : 'linear-gradient(135deg, var(--primary), var(--secondary))',
              }}
              title={inputText.trim() || attachments.length > 0 ? translate(language, 'send') : translate(language, 'voiceChat')}
            >
              {inputText.trim() || attachments.length > 0 ? <Send size={17} /> : <Mic size={17} />}
            </button>
          </div>
        </div>
      </footer>

      <SidebarDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <MediaMenu
        visible={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onAddAttachment={(att) => setAttachments((prev) => [...prev, att])}
      />
    </div>
  );
}
