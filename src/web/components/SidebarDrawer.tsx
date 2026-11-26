import React, { useMemo, useState } from 'react';
import {
  X,
  Plus,
  Search,
  MessageSquare,
  Pin,
  Star,
  Archive,
  Trash2,
  Cpu,
  Server,
  Settings,
  Wifi,
  WifiOff,
  Sparkles,
} from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import { useRouter } from '../contexts/RouterContext';
import { useToast } from '../contexts/ToastContext';

interface SidebarDrawerProps {
  visible: boolean;
  onClose: () => void;
}

type DrawerTab = 'recent' | 'favorite' | 'archived';

export function SidebarDrawer({ visible, onClose }: SidebarDrawerProps) {
  const {
    state,
    listConversations,
    createNewConversation,
    selectConversation,
    deleteConversation,
    toggleConversationPinned,
    toggleConversationFavorite,
    toggleConversationArchived,
  } = useChatContext();
  const router = useRouter();
  const { confirm, showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<DrawerTab>('recent');

  const filteredConversations = useMemo(() => {
    if (activeTab === 'favorite') {
      return listConversations({ query: searchQuery, favorite: true });
    }
    if (activeTab === 'archived') {
      return listConversations({ query: searchQuery, archived: true });
    }
    return listConversations({ query: searchQuery });
  }, [activeTab, listConversations, searchQuery]);

  if (!visible) return null;

  const handleNewChat = () => {
    const id = createNewConversation();
    onClose();
    if (id) router.push(`/chat/${id}`);
  };

  const handleSelectChat = (id: string) => {
    selectConversation(id);
    onClose();
    router.push(`/chat/${id}`);
  };

  const handleDelete = async (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'حذف المحادثة',
      message: `هل تريد حذف "${title}"؟`,
      confirmLabel: 'حذف',
      destructive: true,
    });
    if (ok) {
      await deleteConversation(id);
      showToast('تم حذف المحادثة', 'info');
    }
  };

  const navigateTo = (path: string) => {
    onClose();
    router.push(path);
  };

  const modeLabel =
    state.connectionMode === 'offline' ? 'أوفلاين' : state.connectionMode === 'online' ? 'أونلاين' : 'تلقائي';

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

      {/* Drawer Panel */}
      <aside
        className="relative z-10 flex flex-col w-[300px] max-w-[85vw] h-full border-e shadow-2xl"
        style={{
          backgroundColor: 'var(--sidebar-bg)',
          borderColor: 'var(--border)',
          color: 'var(--foreground)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <img
              src="/assets/images/icon.png"
              alt="Gassar.AI"
              className="w-8 h-8 rounded-xl object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <div>
              <h2 className="text-base font-extrabold tracking-tight" style={{ color: 'var(--primary)' }}>
                Gassar.AI
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                المساعد الذكي المتكامل
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:opacity-80 cursor-pointer"
            style={{ color: 'var(--muted)' }}
            aria-label="إغلاق القائمة"
          >
            <X size={20} />
          </button>
        </div>

        {/* New Chat + Search */}
        <div className="p-3 space-y-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <button
            type="button"
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold text-white shadow-xs hover:opacity-95 cursor-pointer transition-opacity"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <Plus size={18} />
            <span>محادثة جديدة</span>
          </button>

          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl border"
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border)' }}
          >
            <Search size={15} style={{ color: 'var(--muted)' }} className="shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث في المحادثات..."
              className="w-full bg-transparent text-xs outline-none"
              style={{ color: 'var(--foreground)' }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="cursor-pointer opacity-70 hover:opacity-100"
                style={{ color: 'var(--muted)' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
            {(
              [
                { id: 'recent', label: 'الأخيرة' },
                { id: 'favorite', label: 'المفضلة' },
                { id: 'archived', label: 'الأرشيف' },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className="py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--primary)' : 'transparent',
                    color: active ? '#FFFFFF' : 'var(--muted)',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {filteredConversations.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <MessageSquare size={28} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--muted)' }} />
              <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                {searchQuery
                  ? 'لا توجد نتائج مطابقة للبحث'
                  : activeTab === 'favorite'
                    ? 'لا توجد محادثات مفضلة بعد'
                    : activeTab === 'archived'
                      ? 'الأرشيف فارغ'
                      : 'لا توجد محادثات محفوظة'}
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = state.currentId === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => handleSelectChat(conv.id)}
                  className="group flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors"
                  style={{
                    backgroundColor: isSelected ? 'var(--surface-variant)' : 'var(--surface)',
                    borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                  }}
                >
                  <MessageSquare
                    size={16}
                    className="shrink-0"
                    style={{ color: isSelected ? 'var(--primary)' : 'var(--muted)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {conv.pinned && <Pin size={11} style={{ color: 'var(--primary)' }} className="shrink-0" />}
                      <p className="text-xs font-semibold truncate">{conv.title || 'محادثة بدون عنوان'}</p>
                    </div>
                    <p className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>
                      {conv.messages.length} رسالة
                    </p>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleConversationPinned(conv.id);
                      }}
                      className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
                      title={conv.pinned ? 'إلغاء التثبيت' : 'تثبيت'}
                      style={{ color: conv.pinned ? 'var(--primary)' : 'var(--muted)' }}
                    >
                      <Pin size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleConversationFavorite(conv.id);
                      }}
                      className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
                      title={conv.favorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                      style={{ color: conv.favorite ? 'var(--warning)' : 'var(--muted)' }}
                    >
                      <Star size={13} fill={conv.favorite ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleConversationArchived(conv.id);
                      }}
                      className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
                      title={conv.archived ? 'إلغاء الأرشفة' : 'أرشفة'}
                      style={{ color: conv.archived ? 'var(--secondary)' : 'var(--muted)' }}
                    >
                      <Archive size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => void handleDelete(conv.id, conv.title, e)}
                      className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
                      title="حذف"
                      style={{ color: 'var(--error)' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Nav */}
        <div className="p-3 border-t space-y-1.5" style={{ borderColor: 'var(--border)' }}>
          <div
            className="flex items-center justify-between px-3 py-2 rounded-xl text-xs"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <div className="flex items-center gap-2">
              {state.connectionMode === 'offline' ? (
                <WifiOff size={14} style={{ color: 'var(--warning)' }} />
              ) : (
                <Wifi size={14} style={{ color: 'var(--success)' }} />
              )}
              <span className="font-semibold">وضع الاتصال: {modeLabel}</span>
            </div>
            <span className="text-[11px] truncate max-w-[100px]" style={{ color: 'var(--muted)' }}>
              {state.activeModel?.name ?? 'بدون نموذج'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigateTo('/models')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium hover:opacity-85 cursor-pointer transition-opacity"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <Cpu size={17} style={{ color: 'var(--primary)' }} />
            <span>النماذج</span>
          </button>

          <button
            type="button"
            onClick={() => navigateTo('/local-server')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium hover:opacity-85 cursor-pointer transition-opacity"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <Server size={17} style={{ color: 'var(--secondary)' }} />
            <span>الخادم المحلي</span>
          </button>

          <button
            type="button"
            onClick={() => navigateTo('/voice')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium hover:opacity-85 cursor-pointer transition-opacity"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <Sparkles size={17} style={{ color: 'var(--accent)' }} />
            <span>المحادثة الصوتية</span>
          </button>

          <button
            type="button"
            onClick={() => navigateTo('/settings')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium hover:opacity-85 cursor-pointer transition-opacity"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <Settings size={17} style={{ color: 'var(--muted)' }} />
            <span>الإعدادات</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
