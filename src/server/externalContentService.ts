import { lookup } from 'dns/promises';
import net from 'net';

import {
  extractHtmlDocument,
  extractPdfDocument,
  extractPlainTextDocument,
  ContentExtractionError
} from './contentExtractor';

export type ExternalContentKind = 'html' | 'pdf' | 'text';

export type ExternalContentDocument = {
  requestedUrl: string;
  finalUrl: string;
  hostname: string;
  title: string;
  kind: ExternalContentKind;
  contentType: string;
  text: string;
  extractedCharacters: number;
  wordCount: number;
  extractionMethod: string;
  rawLength: number;
  cleanBodyLength: number;
  sourceRole: 'UNTRUSTED_INPUT';
  trustNotice: string;
};

export class ExternalContentError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = 'EXTERNAL_CONTENT_ERROR') {
    super(message);
    this.name = 'ExternalContentError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (compatible; MIHAK-Auditor/1.0)';

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 0 || // Current network
    a === 10 || // Private 10.0.0.0/8
    a === 127 || // Loopback 127.0.0.0/8
    (a === 100 && b >= 64 && b <= 127) || // Carrier-grade NAT 100.64.0.0/10
    (a === 169 && b === 254) || // Link-local / Cloud metadata 169.254.0.0/16
    (a === 172 && b >= 16 && b <= 31) || // Private 172.16.0.0/12
    (a === 192 && b === 0 && parts[2] === 0) || // IETF Protocol Assignments
    (a === 192 && b === 0 && parts[2] === 2) || // TEST-NET-1
    (a === 192 && b === 168) || // Private 192.168.0.0/16
    (a === 198 && (b === 18 || b === 19)) || // Benchmarking
    (a === 198 && b === 51 && parts[2] === 100) || // TEST-NET-2
    (a === 203 && b === 0 && parts[2] === 113) || // TEST-NET-3
    a >= 224 // Multicast & Reserved (224.0.0.0/4 and 240.0.0.0/4)
  );
}

function isBlockedIPv6(ip: string): boolean {
  const value = ip.toLowerCase();

  if (
    value === '::1' ||
    value === '::' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe8') ||
    value.startsWith('fe9') ||
    value.startsWith('fea') ||
    value.startsWith('feb')
  ) {
    return true;
  }

  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);

  return false;
}

function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedIPv4(ip);
  if (family === 6) return isBlockedIPv6(ip);
  return true;
}

export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ExternalContentError('الرابط غير صالح. يرجى إدخال رابط يبدأ بـ http:// أو https://.', 400, 'INVALID_URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ExternalContentError('يسمح مِحَكّ حاليًا بروابط HTTP وHTTPS العامة فقط.', 400, 'INVALID_PROTOCOL');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname === 'metadata.google.internal' ||
    hostname.includes('169.254.169.254')
  ) {
    throw new ExternalContentError('لا يمكن فحص روابط محلية أو خاصة بالشبكة الداخلية (SSRF Protection).', 403, 'INTERNAL_NETWORK_BLOCKED');
  }

  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new ExternalContentError('الرابط يشير إلى عنوان شبكة خاص أو محجوز وغير مسموح بفحصه.', 403, 'PRIVATE_IP_BLOCKED');
    }
    return parsed;
  }

  let addresses: Array<{ address: string; family: number }> = [];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ExternalContentError('تعذر الوصول إلى اسم النطاق الموجود في الرابط (فشل DNS).', 422, 'DNS_FAILED');
  }

  if (!addresses.length || addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new ExternalContentError('الرابط يشير إلى عنوان شبكة غير عام أو غير مسموح بالاتصال به.', 403, 'PRIVATE_NETWORK_BLOCKED');
  }

  return parsed;
}

function isKnownMediaOrVideoUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  // Known video/audio platforms
  const mediaHosts = [
    'youtube.com', 'm.youtube.com', 'youtu.be',
    'tiktok.com', 'vimeo.com', 'dailymotion.com',
    'soundcloud.com', 'spotify.com', 'podcasts.apple.com'
  ];
  if (mediaHosts.some((mh) => host === mh || host.endsWith('.' + mh))) return true;

  // Social video paths
  if (
    (host.includes('instagram.com') && (path.includes('/reel/') || path.includes('/reels/') || path.includes('/tv/'))) ||
    (host.includes('facebook.com') && (path.includes('/watch') || path.includes('/videos/') || path.includes('/reel/'))) ||
    (host.includes('twitter.com') || host.includes('x.com')) && path.includes('/video')
  ) {
    return true;
  }

  // Known media file extensions
  const mediaExtensions = [
    '.mp4', '.m4v', '.webm', '.avi', '.mov', '.mkv', '.flv',
    '.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac', '.opus'
  ];
  if (mediaExtensions.some((ext) => path.endsWith(ext))) return true;

  return false;
}

function decodeBufferText(bytes: Buffer, contentTypeHeader: string): string {
  // 1. Try charset from header
  let charset = '';
  const matchHeader = contentTypeHeader.match(/charset=([^;\s]+)/i);
  if (matchHeader) {
    charset = matchHeader[1].trim().toLowerCase().replace(/^["']|["']$/g, '');
  }

  // 2. If not in header, look in first 2048 bytes of HTML
  if (!charset) {
    const preview = bytes.slice(0, 2048).toString('binary');
    const metaMatch =
      preview.match(/<meta[^>]+charset=["']?([^"'>\s/]+)/i) ||
      preview.match(/<meta[^>]+content=["'][^"']*charset=([^"'>\s/]+)/i);
    if (metaMatch) {
      charset = metaMatch[1].trim().toLowerCase();
    }
  }

  // Normalize common charset names
  if (charset === 'windows-1256' || charset === 'cp1256') charset = 'windows-1256';
  else if (charset === 'windows-1252' || charset === 'cp1252') charset = 'windows-1252';
  else if (charset === 'iso-8859-6') charset = 'iso-8859-6';
  else if (charset === 'iso-8859-1') charset = 'iso-8859-1';

  if (charset && charset !== 'utf-8' && charset !== 'utf8') {
    try {
      const decoder = new TextDecoder(charset);
      return decoder.decode(bytes);
    } catch {
      // Fallback to utf-8 if specified charset isn't supported
    }
  }

  return bytes.toString('utf8');
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    throw new ExternalContentError('حجم المحتوى أكبر من الحد المسموح لفحص الرابط.', 413, 'CONTENT_TOO_LARGE');
  }

  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* noop */ }
      throw new ExternalContentError('حجم المحتوى أكبر من الحد المسموح لفحص الرابط.', 413, 'CONTENT_TOO_LARGE');
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function fetchWithSafeRedirects(rawUrl: string): Promise<{ response: Response; finalUrl: URL; contentTypeRaw: string }> {
  let current = await assertPublicUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    // Check media before fetching
    if (isKnownMediaOrVideoUrl(current)) {
      throw new ExternalContentError(
        'تم التعرف على رابط فيديو أو صوت، لكن هذه النسخة تحتاج إلى طبقة تفريغ صوتي (Transcript) قبل التدقيق.',
        415,
        'VIDEO_TRANSCRIPT_REQUIRED'
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
          'User-Agent': USER_AGENT
        },
        signal: controller.signal
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new ExternalContentError('أعاد الموقع تحويلًا بلا عنوان وجهة صالح.', 422, 'BAD_REDIRECT');
        }

        if (redirectCount === MAX_REDIRECTS) {
          throw new ExternalContentError('عدد التحويلات في الرابط أكبر من الحد المسموح.', 422, 'TOO_MANY_REDIRECTS');
        }

        current = await assertPublicUrl(new URL(location, current).toString());
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw new ExternalContentError(
          `الموقع الخارجي يمنع الوصول أو يتطلب تسجيل دخول (HTTP ${response.status}).`,
          response.status,
          'ACCESS_DENIED'
        );
      }

      if (response.status === 404) {
        throw new ExternalContentError(
          'الصفحة المطلوبة غير موجودة في الموقع الخارجي (HTTP 404).',
          404,
          'NOT_FOUND'
        );
      }

      if (response.status === 429) {
        throw new ExternalContentError(
          'الموقع الخارجي قيّد عدد الطلبات مؤقتًا (Rate Limit / HTTP 429).',
          429,
          'RATE_LIMITED'
        );
      }

      if (!response.ok) {
        throw new ExternalContentError(
          `تعذر جلب الصفحة من الموقع الخارجي (HTTP ${response.status}).`,
          422,
          'REMOTE_HTTP_ERROR'
        );
      }

      const contentTypeRaw = String(response.headers.get('content-type') || '');
      return { response, finalUrl: current, contentTypeRaw };
    } catch (error: any) {
      if (error instanceof ExternalContentError) throw error;
      if (error?.name === 'AbortError') {
        throw new ExternalContentError('انتهت مهلة جلب الرابط قبل اكتمال التحميل (15 ثانية).', 408, 'FETCH_TIMEOUT');
      }
      throw new ExternalContentError(`تعذر الاتصال بالموقع الخارجي: ${error?.message || 'خطأ في الشبكة'}`, 422, 'FETCH_FAILED');
    } finally {
      clearTimeout(timer);
    }
  }

  throw new ExternalContentError('تعذر تتبع تحويلات الرابط.', 422, 'REDIRECT_FAILED');
}

export async function fetchExternalContent(rawUrl: string): Promise<ExternalContentDocument> {
  const requestedUrl = String(rawUrl || '').trim();
  if (!requestedUrl) {
    throw new ExternalContentError('يرجى إدخال رابط المحتوى المراد فحصه.');
  }

  const { response, finalUrl, contentTypeRaw } = await fetchWithSafeRedirects(requestedUrl);
  const contentType = contentTypeRaw.split(';')[0].trim().toLowerCase();

  // Media check
  if (contentType.startsWith('video/') || contentType.startsWith('audio/')) {
    throw new ExternalContentError(
      'تم التعرف على رابط فيديو أو صوت، لكن هذه النسخة تحتاج إلى طبقة تفريغ صوتي (Transcript) قبل التدقيق.',
      415,
      'VIDEO_TRANSCRIPT_REQUIRED'
    );
  }

  if (contentType.startsWith('image/')) {
    throw new ExternalContentError(
      'الرابط يشير إلى ملف صورة مباشرة. فحص الصور يحتاج طبقة OCR مستقلة وسيُضاف لاحقًا.',
      415,
      'IMAGE_EXTRACTION_NOT_ENABLED'
    );
  }

  const looksPdf =
    contentType === 'application/pdf' ||
    finalUrl.pathname.toLowerCase().endsWith('.pdf');

  let title = '';
  let text = '';
  let wordCount = 0;
  let extractionMethod = '';
  let rawLength = 0;
  let cleanBodyLength = 0;
  let kind: ExternalContentKind;

  try {
    if (looksPdf) {
      const bytes = await readResponseBytes(response, MAX_PDF_BYTES);
      rawLength = bytes.length;
      const extracted = await extractPdfDocument(bytes, finalUrl.toString());
      title = extracted.title;
      text = extracted.text;
      wordCount = extracted.wordCount;
      extractionMethod = extracted.extractionMethod;
      cleanBodyLength = extracted.characterCount;
      kind = 'pdf';
    } else if (
      contentType === 'text/html' ||
      contentType === 'application/xhtml+xml' ||
      !contentType
    ) {
      const bytes = await readResponseBytes(response, MAX_HTML_BYTES);
      rawLength = bytes.length;
      const decodedHtml = decodeBufferText(bytes, contentTypeRaw);
      const extracted = extractHtmlDocument(decodedHtml, finalUrl.toString());
      title = extracted.title;
      text = extracted.text;
      wordCount = extracted.wordCount;
      extractionMethod = extracted.extractionMethod;
      cleanBodyLength = extracted.cleanBodyLength || extracted.characterCount;
      kind = 'html';
    } else if (contentType.startsWith('text/')) {
      const bytes = await readResponseBytes(response, MAX_HTML_BYTES);
      rawLength = bytes.length;
      const decodedText = decodeBufferText(bytes, contentTypeRaw);
      const extracted = extractPlainTextDocument(decodedText, finalUrl.toString());
      title = extracted.title;
      text = extracted.text;
      wordCount = extracted.wordCount;
      extractionMethod = extracted.extractionMethod;
      cleanBodyLength = extracted.characterCount;
      kind = 'text';
    } else {
      throw new ExternalContentError(
        `نوع المحتوى (${contentType || 'غير معروف'}) غير مدعوم في فحص الروابط حاليًا.`,
        415,
        'UNSUPPORTED_CONTENT_TYPE'
      );
    }
  } catch (err: any) {
    if (err instanceof ExternalContentError) throw err;
    if (err instanceof ContentExtractionError) {
      throw new ExternalContentError(err.message, err.statusCode, err.code);
    }
    throw new ExternalContentError(`فشل استخراج المحتوى: ${err?.message || 'خطأ غير معروف'}`, 422, 'EXTRACTION_FAILED');
  }

  if (!text || text.trim().length < 40) {
    throw new ExternalContentError(
      'تم فتح الرابط ولكن لم يُستخرج منه نص كافٍ للتدقيق. قد تكون الصفحة ديناميكية أو تتطلب تسجيل دخول.',
      422,
      'NO_EXTRACTABLE_TEXT'
    );
  }

  return {
    requestedUrl,
    finalUrl: finalUrl.toString(),
    hostname: finalUrl.hostname,
    title: title || finalUrl.hostname,
    kind,
    contentType: contentType || (kind === 'pdf' ? 'application/pdf' : 'text/html'),
    text,
    extractedCharacters: text.length,
    wordCount,
    extractionMethod,
    rawLength,
    cleanBodyLength,
    sourceRole: 'UNTRUSTED_INPUT',
    trustNotice: 'المحتوى المستورد مادة قيد الفحص فقط، ولا يُستخدم كمصدر لإثبات أي ادعاء.'
  };
}
