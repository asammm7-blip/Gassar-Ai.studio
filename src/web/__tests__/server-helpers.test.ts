import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyCloudApiError,
  decodeHtmlEntities,
  extractReadableTextFromHtml,
  isBlockedIpAddress,
  parseDuckDuckGoHtmlResults,
  resolveGeminiTargetModel,
  validateExternalHttpUrl,
} from '../server-helpers';

test('isBlockedIpAddress blocks private, loopback, link-local, and metadata IPs', () => {
  assert.equal(isBlockedIpAddress('127.0.0.1'), true);
  assert.equal(isBlockedIpAddress('10.0.0.5'), true);
  assert.equal(isBlockedIpAddress('169.254.169.254'), true);
  assert.equal(isBlockedIpAddress('172.16.0.1'), true);
  assert.equal(isBlockedIpAddress('192.168.1.1'), true);
  assert.equal(isBlockedIpAddress('::1'), true);
  assert.equal(isBlockedIpAddress('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedIpAddress('8.8.8.8'), false);
  assert.equal(isBlockedIpAddress('1.1.1.1'), false);
});

test('validateExternalHttpUrl rejects internal hosts, file://, credentials, and private IPs', () => {
  assert.throws(() => validateExternalHttpUrl('file:///etc/passwd'));
  assert.throws(() => validateExternalHttpUrl('http://localhost:3000/api/health'));
  assert.throws(() => validateExternalHttpUrl('http://user:pass@example.com'));
  assert.throws(() => validateExternalHttpUrl('http://127.0.0.1:8080'));
  assert.throws(() => validateExternalHttpUrl('http://metadata.internal/latest'));
  const valid = validateExternalHttpUrl('https://example.com/docs?q=1');
  assert.equal(valid.hostname, 'example.com');
  assert.equal(valid.protocol, 'https:');
});

test('extractReadableTextFromHtml strips scripts/styles and extracts title and body text', () => {
  const html = `
    <html>
      <head>
        <title>Gassar &amp; AI Docs</title>
        <style>.hidden { display: none; }</style>
        <script>console.log("secret")</script>
      </head>
      <body>
        <h1>Hello World</h1>
        <p>First paragraph &quot;quoted&quot;.</p>
      </body>
    </html>
  `;
  const result = extractReadableTextFromHtml(html);
  assert.equal(result.title, 'Gassar & AI Docs');
  assert.ok(result.text.includes('Hello World'));
  assert.ok(result.text.includes('First paragraph "quoted".'));
  assert.ok(!result.text.includes('console.log'));
  assert.ok(!result.text.includes('display: none'));
});

test('decodeHtmlEntities decodes numeric and named entities', () => {
  assert.equal(decodeHtmlEntities('A &amp; B &#65; &lt;tag&gt;'), 'A & B A <tag>');
});

test('parseDuckDuckGoHtmlResults parses redirect uddg URLs and snippets', () => {
  const sampleHtml = `
    <div class="result">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fguide">Example Guide</a>
      <a class="result__snippet">A clear summary of the guide.</a>
    </div>
  `;
  const results = parseDuckDuckGoHtmlResults(sampleHtml, 5);
  assert.equal(results.length, 1);
  assert.equal(results[0].url, 'https://example.org/guide');
  assert.equal(results[0].title, 'Example Guide');
  assert.equal(results[0].snippet, 'A clear summary of the guide.');
});

test('resolveGeminiTargetModel upgrades legacy model IDs and sets Gemini 4 constraints properly', () => {
  const g4 = resolveGeminiTargetModel('gemini-3.8-flash-preview');
  assert.equal(g4.targetModel, 'gemini-4-hydrogen');
  assert.equal(g4.isGemini4, true);
  assert.equal(g4.supportsThinkingLevel, true);
  assert.equal(g4.supportsSamplingParams, false);
  assert.equal(g4.supportsSearchTool, true);

  const lite = resolveGeminiTargetModel('gemini-3.5-flash-lite');
  assert.equal(lite.targetModel, 'gemini-3.1-flash-lite');
  assert.equal(lite.supportsThinkingLevel, true);
  assert.equal(lite.supportsSamplingParams, true);

  const gemma = resolveGeminiTargetModel('gemma-4-31b-it');
  assert.equal(gemma.isGemma, true);
  assert.equal(gemma.supportsSearchTool, false);
  assert.equal(gemma.supportsSamplingParams, true);
});

test('classifyCloudApiError extracts readable error codes from upstream JSON', () => {
  const invalidKey = classifyCloudApiError(
    'Google Gemini',
    new Error('{"error":{"code":400,"message":"API key not valid.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}'),
  );
  assert.equal(invalidKey.code, 'invalid_key');
  assert.equal(invalidKey.status, 400);

  const notFound = classifyCloudApiError('Google Gemini', new Error('{"error":{"code":404,"message":"Model not found","status":"NOT_FOUND"}}'));
  assert.equal(notFound.code, 'not_found');

  const rateLimited = classifyCloudApiError('OpenAI', new Error('Rate limit reached'), 429);
  assert.equal(rateLimited.code, 'rate_limited');
  assert.equal(rateLimited.status, 429);
});
