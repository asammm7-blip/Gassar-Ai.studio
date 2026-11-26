import { z } from 'zod';
import { envelopeSchema, type DataEnvelope } from './chat-repository';

export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;

const schema = z.object({
  format: z.literal('gassar-chat-backup'),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  scope: z.literal('conversations-and-model-settings'),
  data: envelopeSchema,
});

export type ChatBackup = z.infer<typeof schema>;

export function exportBackup(data: DataEnvelope): string {
  const backup = schema.parse({
    format: 'gassar-chat-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    scope: 'conversations-and-model-settings',
    data,
  });
  const text = JSON.stringify(backup, null, 2);
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('النسخة تتجاوز الميزانية');
  return text;
}

export function parseBackup(text: string): ChatBackup {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('النسخة تتجاوز الميزانية');
  const parsed = schema.parse(JSON.parse(text));
  if (new Set(parsed.data.conversations.map((c) => c.id)).size !== parsed.data.conversations.length) {
    throw new Error('معرف محادثة مكرر');
  }
  return parsed;
}

export function previewBackup(text: string) {
  const b = parseBackup(text);
  return {
    conversations: b.data.conversations.length,
    messages: b.data.conversations.reduce((n, c) => n + c.messages.length, 0),
    branches: b.data.conversations.reduce((n, c) => n + (c.branches?.length ?? 0), 0),
    modelSettings: Object.keys(b.data.modelSettings).length,
    exportedAt: b.exportedAt,
    media: 'snapshots-only-external-uri-not-portable' as const,
  };
}
