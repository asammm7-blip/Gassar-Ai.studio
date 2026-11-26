import type { ChatAttachment } from './attachment-service';

export interface ChatDraft {
  id: string;
  content: string;
  attachments: ChatAttachment[];
  createdAt: number;
}

const drafts = new Map<string, ChatDraft>();

export function createChatDraft(content: string, attachments: ChatAttachment[] = []): string {
  const id = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  drafts.set(id, { id, content, attachments, createdAt: Date.now() });
  return id;
}

export function getChatDraft(id: string): ChatDraft | null {
  return drafts.get(id) ?? null;
}

export function removeChatDraft(id: string): void {
  drafts.delete(id);
}

export function clearChatDrafts(): void {
  drafts.clear();
}
