import assert from 'node:assert/strict';
import test from 'node:test';
import { translate } from '../i18n';
import { normalizeApiBase } from '../api-client';
import { separateEmbeddedReasoning, ChatController } from '../chat-controller';
import { ChatRepository } from '../chat-repository';
import { buildRequest, snapshotAttachments, type AttachmentReader } from '../request-builder';
import type { ChatAttachment } from '../attachment-service';
import type { LocalModel } from '../local-model-manager';
import { DEFAULT_MODEL_SETTINGS } from '../chat-data';
import { CloudModelService } from '../cloud-model-service';

class MemoryStorage {
  private map = new Map<string, string>();
  async getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  async removeItem(key: string) {
    this.map.delete(key);
  }
  async clear() {
    this.map.clear();
  }
  async multiGet(keys: string[]) {
    return keys.map((k) => [k, this.map.get(k) ?? null] as [string, string | null]);
  }
  async multiRemove(keys: string[]) {
    for (const k of keys) this.map.delete(k);
  }
}

const GEMINI_MODEL: LocalModel = {
  id: 'cloud-gemini-4-hydrogen',
  name: 'Gemini 4 Flash',
  path: '',
  size: 0,
  type: 'language',
  isLoaded: false,
  isActive: true,
  version: 'cloud',
  description: 'Fast Gemini model',
  source: 'cloud',
  provider: 'gemini',
  remoteModel: 'gemini-4-hydrogen',
  capabilities: { vision: true, tools: true, thinking: true, embeddings: false },
};

const OPENAI_MODEL: LocalModel = {
  ...GEMINI_MODEL,
  id: 'cloud-openai-gpt-4o',
  name: 'OpenAI GPT-4o',
  provider: 'openai',
  remoteModel: 'gpt-4o',
};

test('translate handles Arabic and English placeholders cleanly', () => {
  assert.equal(translate('ar', 'welcomeGreeting', { name: 'أحمد' }), 'مرحباً، أحمد');
  assert.equal(translate('en', 'welcomeGreeting', { name: 'Ahmed' }), 'Hello, Ahmed');
  assert.equal(translate('en', 'settings'), 'Settings');
});

test('normalizeApiBase trims trailing slashes and rejects non-HTTP schemes', () => {
  assert.equal(normalizeApiBase('https://api.example.com///'), 'https://api.example.com');
  assert.equal(normalizeApiBase('http://192.168.1.50:3000/'), 'http://192.168.1.50:3000');
  assert.equal(normalizeApiBase('javascript:alert(1)'), '');
  assert.equal(normalizeApiBase('   '), '');
});

test('separateEmbeddedReasoning strips think blocks and merges explicit reasoning', () => {
  const result = separateEmbeddedReasoning('<think>step 1</think>\nFinal answer', 'prior step');
  assert.equal(result.text, 'Final answer');
  assert.equal(result.reasoning, 'prior step\n\nstep 1');
});

test('snapshotAttachments includes extracted web link text and restricts binary PDF inline to Gemini', async () => {
  const pdfAttachment: ChatAttachment = {
    type: 'file',
    name: 'doc.pdf',
    data: { uri: 'data:application/pdf;base64,JVBERg==', mimeType: 'application/pdf', size: 10 },
  };
  const linkAttachment: ChatAttachment = {
    type: 'link',
    name: 'https://example.com',
    data: { url: 'https://example.com' },
  };

  const reader: AttachmentReader = {
    extract: async () => [{ name: 'doc.pdf', text: 'Extracted PDF text' }],
    inline: async (items) =>
      items.map((item) => ({
        type: 'file' as const,
        name: item.name || 'file',
        mimeType: item.data.mimeType || 'application/pdf',
        base64: 'JVBERg==',
      })),
    fetchUrl: async (url: string) => ({ url, title: 'Example Site', text: 'Page body here' }),
  };

  const geminiSnap = await snapshotAttachments([pdfAttachment, linkAttachment], 'cloud', GEMINI_MODEL, reader);
  assert.equal(geminiSnap.inline.length, 1);
  assert.ok(geminiSnap.context.includes('Extracted PDF text'));
  assert.ok(geminiSnap.context.includes('Page body here'));

  const openaiSnap = await snapshotAttachments([pdfAttachment, linkAttachment], 'cloud', OPENAI_MODEL, reader);
  assert.equal(openaiSnap.inline.length, 0);
  assert.ok(openaiSnap.context.includes('Extracted PDF text'));
});

test('ChatController streams live deltas into state.streaming and clears it upon completion', async () => {
  let seq = 0;
  const mem = new MemoryStorage();
  const observedStreams: string[] = [];

  const controller = new ChatController({
    repository: new ChatRepository(mem),
    uuid: () => `id-${++seq}`,
    generate: async (_req, _signal, onDelta) => {
      onDelta?.({ type: 'reasoning', delta: 'Thinking... ' });
      onDelta?.({ type: 'text', delta: 'Hello ' });
      onDelta?.({ type: 'text', delta: 'World' });
      return { text: 'Hello World', reasoning: 'Thinking...' };
    },
  });

  controller.subscribe(() => {
    const snap = controller.getSnapshot();
    if (snap.streaming?.text) observedStreams.push(snap.streaming.text);
  });

  await controller.switchIdentity({ kind: 'guest' });
  await controller.selectModel(GEMINI_MODEL);
  const convId = controller.createNewConversation();
  assert.ok(convId);

  const built = await buildRequest({
    mode: 'auto',
    model: GEMINI_MODEL,
    settings: DEFAULT_MODEL_SETTINGS,
    target: { id: 'm0', role: 'user', content: 'Hi', timestamp: 1 },
    before: [],
  });
  assert.equal(built.route, 'cloud');

  const res = await controller.sendMessage('Hi there');
  assert.equal(res.status, 'complete');
  if (res.status === 'complete') {
    assert.equal(res.message.content, 'Hello World');
    assert.equal(res.message.reasoning, 'Thinking...');
  }
  assert.deepEqual(observedStreams, ['Hello ', 'Hello World']);
  assert.equal(controller.getSnapshot().streaming, null);
});

test('CloudModelService.streamResponse flushes trailing SSE lines without newline and falls back on empty SSE', async () => {
  const origFetch = globalThis.fetch;
  const service = new CloudModelService();
  try {
    // Case 1: Trailing SSE data line with no trailing newline
    globalThis.fetch = (async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(encoder.encode('data: {"type":"text","delta":"أهلاً بك"}'));
          ctrl.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }) as typeof fetch;

    const deltas: string[] = [];
    const streamed = await service.streamResponse(
      { provider: 'gemini', model: 'gemini-4-hydrogen', userMessage: 'مرحبا' },
      (d) => deltas.push(d.delta),
    );
    assert.equal(streamed.text, 'أهلاً بك');
    assert.deepEqual(deltas, ['أهلاً بك']);

    // Case 2: Empty SSE stream automatically falls back to /api/cloud/generate
    const calls: string[] = [];
    globalThis.fetch = (async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);
      if (url.endsWith('/api/cloud/stream')) {
        const stream = new ReadableStream({
          start(ctrl) {
            ctrl.close();
          },
        });
        return new Response(stream, { status: 200 });
      }
      return new Response(JSON.stringify({ text: 'رد من المسار الاحتياطي' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const fallback = await service.streamResponse({
      provider: 'gemini',
      model: 'gemini-4-hydrogen',
      userMessage: 'اختبار',
    });
    assert.equal(fallback.text, 'رد من المسار الاحتياطي');
    assert.deepEqual(calls, ['/api/cloud/stream', '/api/cloud/generate']);
  } finally {
    globalThis.fetch = origFetch;
  }
});
