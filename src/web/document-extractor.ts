import * as XLSX from 'xlsx';
import { inflate } from 'pako';
import { apiFetch } from './api-client';

export type SupportedDocumentMime =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'text/plain'
  | 'text/csv'
  | 'text/markdown'
  | 'application/json'
  | 'application/xml'
  | 'application/vnd.ms-excel'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MAX_EXTRACTED_CHARS = 240_000;

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/^data:[^,]+,/, '').replace(/\s/g, '');
  const decode = globalThis.atob(normalized);
  const bytes = new Uint8Array(decode.length);
  for (let i = 0; i < decode.length; i += 1) bytes[i] = decode.charCodeAt(i) & 0xff;
  return bytes;
}

function decodeUtf8(base64: string): string {
  const bytes = base64ToBytes(base64);
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('').replace(/^\uFEFF/, '');
  }
}

function decodeLatin1(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
}

function cleanText(value: string): string {
  const withoutControls = Array.from(value.replace(/\r\n/g, '\n'))
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code === 9 || code === 10 || (code >= 32 && code !== 127);
    })
    .join('');
  return withoutControls
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS);
}

async function extractSpreadsheet(base64: string): Promise<string> {
  const workbook = XLSX.read(base64, { type: 'base64', cellDates: true, dense: true });
  const sections = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][];
    const body = rows
      .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
      .map((row) => row.map((cell) => String(cell ?? '').replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t'))
      .join('\n');
    return `## ورقة: ${sheetName}\n${body}`;
  });
  return cleanText(sections.join('\n\n'));
}

function readPdfLiteralStrings(source: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== '(') continue;
    let depth = 1;
    let value = '';
    for (i += 1; i < source.length && depth > 0; i += 1) {
      const character = source[i];
      if (character === '\\') {
        const next = source[++i];
        const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
        value += escapes[next] ?? next ?? '';
      } else if (character === '(') {
        depth += 1;
        value += character;
      } else if (character === ')') {
        depth -= 1;
        if (depth > 0) value += character;
      } else value += character;
    }
    if (value.trim()) values.push(value);
  }
  return values;
}

function readPdfHexStrings(source: string): string[] {
  return [...source.matchAll(/<([0-9a-f\s]{4,})>\s*(?:Tj|TJ)/gi)].map((match) => {
    const hex = match[1].replace(/\s/g, '');
    let output = '';
    for (let i = 0; i + 3 < hex.length; i += 4) {
      const code = Number.parseInt(hex.slice(i, i + 4), 16);
      if (Number.isFinite(code)) output += String.fromCharCode(code);
    }
    return output;
  }).filter(Boolean);
}

function ascii85Decode(value: Uint8Array): Uint8Array {
  const source = decodeLatin1(value).replace(/\s/g, '').replace(/^<~/, '').replace(/~>$/, '');
  const output: number[] = [];
  for (let i = 0; i < source.length;) {
    if (source[i] === 'z') { output.push(0, 0, 0, 0); i += 1; continue; }
    const group = source.slice(i, i + 5);
    i += group.length;
    if (group.length < 2) break;
    const padded = group.padEnd(5, 'u');
    let number = 0;
    for (const character of padded) number = number * 85 + character.charCodeAt(0) - 33;
    const bytes = [(number >>> 24) & 0xff, (number >>> 16) & 0xff, (number >>> 8) & 0xff, number & 0xff];
    output.push(...bytes.slice(0, group.length - 1));
  }
  return Uint8Array.from(output);
}

function extractPdfStreamText(stream: Uint8Array, compressed: boolean): string {
  try {
    const bytes = compressed ? inflate(stream) : stream;
    const source = decodeLatin1(bytes);
    return [...readPdfLiteralStrings(source), ...readPdfHexStrings(source)].join(' ');
  } catch {
    return '';
  }
}

function extractPdfLocalFallback(base64: string): string {
  const bytes = base64ToBytes(base64);
  const source = decodeLatin1(bytes);
  const texts: string[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)(?:\r?\n)?endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(source))) {
    const start = match.index;
    const dictionary = source.slice(Math.max(0, start - 1024), start);
    let streamBytes: Uint8Array = Uint8Array.from(Array.from(match[1], (character) => character.charCodeAt(0) & 0xff));
    if (/\/ASCII85Decode/.test(dictionary)) streamBytes = ascii85Decode(streamBytes);
    const text = extractPdfStreamText(streamBytes, /\/FlateDecode/.test(dictionary));
    if (text.trim()) texts.push(text);
  }
  if (!texts.length) texts.push(...readPdfLiteralStrings(source));
  if (!texts.length) throw new Error('لم يعثر مستخرج PDF على نص قابل للقراءة؛ قد يكون الملف صورة ممسوحة أو مشفراً.');
  return cleanText(`## نص PDF المستخرج\n${texts.join('\n')}`);
}

async function extractViaServer(input: { name: string; mimeType: string; base64: string }): Promise<string> {
  const response = await apiFetch('/api/extract-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!response.ok || !data.text?.trim()) {
    throw new Error(data.error || `تعذر استخراج المستند (${response.status}).`);
  }
  return cleanText(data.text);
}

export async function extractDocumentText(input: { name: string; mimeType: string; base64: string }): Promise<string> {
  const mime = input.mimeType.toLowerCase();
  if (mime === 'application/pdf' || /\.pdf$/i.test(input.name)) {
    try {
      return await extractViaServer(input);
    } catch (serverError) {
      try {
        return extractPdfLocalFallback(input.base64);
      } catch {
        throw serverError;
      }
    }
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.docx$/i.test(input.name)
  ) {
    return extractViaServer(input);
  }
  if (mime === 'application/vnd.ms-excel' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || /\.(xls|xlsx)$/i.test(input.name)) {
    return extractSpreadsheet(input.base64);
  }
  if (mime.startsWith('text/') || ['application/json', 'application/xml', 'application/rtf'].includes(mime)) {
    return cleanText(decodeUtf8(input.base64));
  }
  throw new Error(`لا يوجد مستخرج محلي لنوع الملف ${input.mimeType}.`);
}

export function isDocumentExtractableMime(mimeType: string, name = ''): boolean {
  const mime = mimeType.toLowerCase();
  return mime === 'application/pdf'
    || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || mime === 'application/vnd.ms-excel'
    || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || mime.startsWith('text/')
    || ['application/json', 'application/xml', 'application/rtf'].includes(mime)
    || /\.(pdf|docx|xls|xlsx|txt|csv|md|json|xml|rtf)$/i.test(name);
}
