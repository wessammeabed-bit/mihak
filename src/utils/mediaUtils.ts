/**
 * MIHAK Media Utilities
 * Handles robust parsing, Base64 conversion, and MIME type normalization
 * for audio and video inputs without carrying Data URL prefixes into Gemini API.
 */

export function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const trimmed = String(dataUrl || '').trim();
  if (!trimmed.startsWith('data:')) {
    throw new Error('القيمة المرسلة ليست بصيغة Data URL صالحة.');
  }

  const base64Index = trimmed.indexOf(';base64,');
  if (base64Index === -1) {
    throw new Error('Data URL لا يحتوي على وسم ;base64, الصالح.');
  }

  const header = trimmed.substring(5, base64Index);
  // Split on ';' or ',' to discard codec or other parameters
  const mimeType = header.split(';')[0].split(',')[0].trim().toLowerCase();
  const base64 = trimmed.substring(base64Index + 8).trim();

  if (!base64) {
    throw new Error('بيانات Base64 فارغة في Data URL.');
  }

  return { mimeType, base64 };
}

/**
 * Converts a Blob or File directly to pure Base64 using ArrayBuffer.
 * This completely avoids creating or leaking "data:...;base64," prefixes into the payload.
 */
export async function blobToRawBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) {
    throw new Error('ملف الوسائط فارغ ولا يحتوي على بايتات صالحة.');
  }

  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Normalizes media MIME types for Gemini models.
 * Strips codec parameters (e.g. "audio/webm;codecs=opus" -> "audio/webm")
 * and maps common audio/video aliases to standard IANA media types.
 */
export function normalizeMediaMime(rawMime?: string, fileName?: string): { mimeType: string; isVideo: boolean } {
  let cleaned = String(rawMime || '').toLowerCase().trim();

  // Strip codec or secondary parameters (e.g. ";codecs=opus")
  if (cleaned.includes(';')) {
    cleaned = cleaned.split(';')[0].trim();
  }

  // Infer from file extension if mime is generic or missing
  if ((!cleaned || cleaned === 'application/octet-stream') && fileName) {
    const ext = fileName.toLowerCase().split('.').pop() || '';
    if (ext === 'mp3') cleaned = 'audio/mp3';
    else if (ext === 'wav') cleaned = 'audio/wav';
    else if (ext === 'm4a') cleaned = 'audio/m4a';
    else if (ext === 'ogg' || ext === 'oga') cleaned = 'audio/ogg';
    else if (ext === 'flac') cleaned = 'audio/flac';
    else if (ext === 'aac') cleaned = 'audio/aac';
    else if (ext === 'webm') cleaned = 'audio/webm';
    else if (ext === 'mp4') cleaned = 'video/mp4';
    else if (ext === 'mov' || ext === 'qt') cleaned = 'video/quicktime';
  }

  // Map known audio aliases
  if (cleaned === 'audio/x-wav' || cleaned === 'audio/wave') cleaned = 'audio/wav';
  if (cleaned === 'audio/x-m4a') cleaned = 'audio/m4a';
  if (cleaned === 'audio/x-aac') cleaned = 'audio/aac';
  if (cleaned === 'audio/x-flac') cleaned = 'audio/flac';
  if (cleaned === 'audio/mpeg' || cleaned === 'audio/mpeg3' || cleaned === 'audio/x-mpeg-3') cleaned = 'audio/mp3';

  // Video types
  const isVideo = cleaned.startsWith('video/');

  if (!cleaned) {
    cleaned = 'audio/webm';
  }

  return { mimeType: cleaned, isVideo };
}

/**
 * Thoroughly sanitizes and extracts pure Base64 and normalized MIME from any payload.
 * Handles:
 * - Data URLs: "data:audio/webm;codecs=opus;base64,GkX..."
 * - Already pure Base64: "GkX..."
 * - Whitespace and carriage returns
 * Guarantees that returned `base64` NEVER starts with "data:" or contains prefixes.
 */
export function sanitizeMediaPayload(
  rawInput: string,
  declaredMime?: string,
  fileName?: string
): { base64: string; mimeType: string; isVideo: boolean } {
  const trimmed = String(rawInput || '').trim();

  let detectedMime = declaredMime;
  let pureBase64 = trimmed;

  if (trimmed.startsWith('data:')) {
    const parsed = parseDataUrl(trimmed);
    detectedMime = parsed.mimeType || declaredMime;
    pureBase64 = parsed.base64;
  } else {
    // If somehow a partial data URL or prefix slipped in without starting with data:
    const regexMatch = trimmed.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s);
    if (regexMatch) {
      detectedMime = regexMatch[1];
      pureBase64 = regexMatch[2].trim();
    }
  }

  // Remove any stray newlines or whitespace in base64 string
  pureBase64 = pureBase64.replace(/\s+/g, '');

  // Secondary assertion: absolutely no "data:" or "base64" prefix can remain in bytes
  if (pureBase64.startsWith('data:') || pureBase64.includes(';base64,')) {
    pureBase64 = pureBase64.replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
  }

  const { mimeType, isVideo } = normalizeMediaMime(detectedMime, fileName);

  return {
    base64: pureBase64,
    mimeType,
    isVideo
  };
}
