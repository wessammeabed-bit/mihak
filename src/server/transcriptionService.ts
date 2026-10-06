import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { sanitizeMediaPayload } from '../utils/mediaUtils';
import { isRetryableError, transcribeWithGroqWhisper } from './semanticProvider';



dotenv.config();



export type TranscriptSegment = {

  startMs?: number;

  endMs?: number;

  startTimeFormatted?: string; // e.g. "01:23"

  endTimeFormatted?: string;   // e.g. "01:45"

  text: string;

  language?: string;

  confidence?: number;

};



export type TranscriptResult = {

  text: string;

  durationSeconds?: number;

  detectedLanguage?: string;

  transcriptionConfidence?: number; // only when returned by the underlying transcription response

  transcriptionNote?: string;

  segments: TranscriptSegment[];

  mediaType: 'audio' | 'video';

  mimeType: string;

};



export class TranscriptionError extends Error {

  statusCode: number;

  code: string;



  constructor(message: string, statusCode = 400, code = 'TRANSCRIPTION_ERROR') {

    super(message);

    this.name = 'TranscriptionError';

    this.statusCode = statusCode;

    this.code = code;

  }

}



const apiKey = process.env.GEMINI_API_KEY;

let aiClient: GoogleGenAI | null = null;

if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim().length > 0) {

  aiClient = new GoogleGenAI({

    apiKey,

    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }

  });

}



function formatTime(ms?: number): string {

  if (typeof ms !== 'number' || isNaN(ms)) return '00:00';

  const totalSeconds = Math.max(0, Math.floor(ms / 1000));

  const minutes = Math.floor(totalSeconds / 60);

  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

}



function parseTimestampToMs(timeStr?: string): number | undefined {
  if (!timeStr) return undefined;
  const parts = timeStr.trim().replace(/[\[\]]/g, '').split(':').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return (parts[0] * 60 + parts[1]) * 1000;
  }
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  return undefined;
}



/**

 * Helper to extract transcribed text from generateContent response.

 * Handles both standard part.text and audio-specific part.audioTranscription.text / audio_transcription.text

 * as returned by gemini-3.5-transcribe and other multimodal Gemini models.

 */

function extractTextFromGenerateContentResponse(response: any): string {
  /**
   * Structured transcription parts take priority. response.text can be only a
   * convenience rendering and, for transcription models, may omit structured
   * audioTranscription parts. Never return early from response.text.
   */
  const pieces: string[] = [];
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];

  const pushUnique = (value: unknown) => {
    const clean = String(value || '').trim();
    if (!clean) return;
    if (!pieces.includes(clean)) pieces.push(clean);
  };

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      // Prefer explicit transcription payloads before generic text wrappers.
      if (typeof part?.audioTranscription === 'string') pushUnique(part.audioTranscription);
      else if (part?.audioTranscription?.text) pushUnique(part.audioTranscription.text);
      if (typeof part?.audio_transcription === 'string') pushUnique(part.audio_transcription);
      else if (part?.audio_transcription?.text) pushUnique(part.audio_transcription.text);
      if (part?.transcription?.text) pushUnique(part.transcription.text);
      if (typeof part?.text === 'string') pushUnique(part.text);
    }
  }

  if (pieces.length > 0) return pieces.join('\n').trim();

  // Fallback only when the structured response contained no usable text.
  if (typeof response?.text === 'string' && response.text.trim().length > 0) {
    return response.text.trim();
  }

  return '';
}

/**

 * Robust parser capable of extracting full transcript and timestamped segments

 * from either JSON responses or timestamped text lines.

 */

function parseModelTranscriptionOutput(rawOutput: string): {

  text: string;

  segments: TranscriptSegment[];

  durationSeconds?: number;

  detectedLanguage?: string;

  transcriptionConfidence?: number;

  transcriptionNote?: string;

} {

  const trimmed = String(rawOutput || '').trim();



  // 1. Try parsing JSON (if model returned JSON format)

  let jsonCandidate = trimmed;

  const markdownMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);

  if (markdownMatch) {

    jsonCandidate = markdownMatch[1].trim();

  }



  if (jsonCandidate.startsWith('{') && jsonCandidate.endsWith('}')) {

    try {

      const parsed = JSON.parse(jsonCandidate);

      const segments: TranscriptSegment[] = Array.isArray(parsed?.segments)

        ? parsed.segments.map((seg: any) => {

            const startMs = typeof seg?.startMs === 'number' ? seg.startMs : 0;

            const endMs = typeof seg?.endMs === 'number' ? seg.endMs : startMs + 5000;

            return {

              startMs,

              endMs,

              startTimeFormatted: formatTime(startMs),

              endTimeFormatted: formatTime(endMs),

              text: String(seg?.text || '').trim(),

              language: String(seg?.language || parsed?.detectedLanguage || 'ar')

            };

          }).filter((s: TranscriptSegment) => s.text.length > 0)

        : [];



      const fullText = String(parsed?.text || segments.map((s) => s.text).join(' ')).trim();

      return {

        text: fullText,

        segments,

        durationSeconds: Number(parsed?.durationSeconds) || (segments.length ? Math.round((segments[segments.length - 1]?.endMs || 0) / 1000) : undefined),

        detectedLanguage: String(parsed?.detectedLanguage || 'ar'),

        transcriptionConfidence: typeof parsed?.transcriptionConfidence === 'number' ? Math.min(1, Math.max(0, parsed.transcriptionConfidence)) : undefined,

        transcriptionNote: parsed?.transcriptionNote ? String(parsed.transcriptionNote) : undefined

      };

    } catch {

      // Fall through to text/line parser

    }

  }



  // 2. Parse text lines with timestamps: e.g. "[00:12 - 00:25] text..." or "[00:12] text..."

  const lines = trimmed.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  const segments: TranscriptSegment[] = [];
  const timestampRegex = /(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?))?\]?)\s*:?\s*(.+)/;
  for (const line of lines) {

    const match = line.match(timestampRegex);

    if (match) {

      const startMs = parseTimestampToMs(match[1]) || 0;

      const endMs = parseTimestampToMs(match[2]) || startMs + 5000;

      const text = match[3].trim();

      if (text) {

        segments.push({

          startMs,

          endMs,

          startTimeFormatted: formatTime(startMs),

          endTimeFormatted: formatTime(endMs),

          text,

          language: 'ar'

        });

      }

    }

  }



  // 3. If no timestamp lines matched, split by sentences/paragraphs

  if (segments.length === 0 && trimmed.length > 0) {

    const sentences = trimmed.split(/(?<=[.،؛؟!\n])\s+/).filter((s) => s.trim().length > 0);

    let currentMs = 0;

    for (const s of sentences) {

      const durationMs = Math.max(3000, Math.min(15000, s.length * 70));

      segments.push({

        startMs: currentMs,

        endMs: currentMs + durationMs,

        startTimeFormatted: formatTime(currentMs),

        endTimeFormatted: formatTime(currentMs + durationMs),

        text: s.trim(),

        language: 'ar'

      });

      currentMs += durationMs;

    }

  }



  const fullText = segments.length > 0 ? segments.map((s) => s.text).join(' ') : trimmed;

  const durationSeconds = segments.length > 0 ? Math.round((segments[segments.length - 1]?.endMs || 0) / 1000) : 0;



  return {

    text: fullText,

    segments,

    durationSeconds,

    detectedLanguage: 'ar',

    transcriptionConfidence: undefined

  };

}



/**

 * Strips technical stack traces, raw Base64, and sensitive server data from error messages,

 * converting them into helpful user-facing Arabic messages.

 */

function sanitizeErrorMessage(rawMessage: string): string {

  const msg = String(rawMessage || '');

  if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {

    return 'تم تجاوز حد طلبات خدمة التفريغ الصوتي المجانية مؤقتًا. يرجى المحاولة بعد لحظات.';

  }

  if (msg.includes('413') || msg.includes('too large') || msg.includes('Payload Too Large')) {

    return 'حجم الملف أكبر من الحد المسموح لهذه الطريقة. يرجى اختيار مقطع أصغر.';

  }

  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {

    return 'خدمة التفريغ تواجه ضغطًا مؤقتًا في خوادم Google، يرجى إعادة المحاولة.';

  }

  if (msg.includes('base64') || msg.includes('data:') || msg.length > 200) {

    return 'تعذر تفريغ الملف الصوتي بسبب خلل في معالجة الوسائط. يرجى المحاولة بصيغة أخرى.';

  }

  return msg || 'تعذر إتمام عملية التفريغ الصوتي.';

}



export async function transcribeAudio(

  audioBase64: string,

  declaredMimeType: string = 'audio/webm',

  fileName?: string

): Promise<TranscriptResult> {

  if (!aiClient) {

    throw new TranscriptionError(

      'خدمة التفريغ الصوتي غير مهيأة (مفتاح API غير متوفر).',

      503,

      'API_KEY_MISSING'

    );

  }



  // 1. Sanitize payload: strip any data URL prefixes and normalize MIME

  const { base64, mimeType, isVideo } = sanitizeMediaPayload(

    audioBase64,

    declaredMimeType,

    fileName

  );



  // 2. Comprehensive validation

  if (!base64 || base64.length < 50) {

    throw new TranscriptionError(

      'ملف الصوت فارغ أو تالف. يرجى التأكد من التسجيل أو اختيار ملف سليم.',

      400,

      'EMPTY_AUDIO'

    );

  }



  if (base64.startsWith('data:') || base64.includes(';base64,')) {

    throw new TranscriptionError(

      'خطأ داخلي في ترميز الوسائط: لا يمكن تمرير بادئة Data URL إلى محرك التفريغ.',

      400,

      'INVALID_BASE64_FORMAT'

    );

  }



  const supportedAudioMimes = [

    'audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg',

    'audio/m4a', 'audio/aac', 'audio/flac'

  ];

  const supportedVideoMimes = [

    'video/mp4', 'video/webm', 'video/quicktime'

  ];



  const isSupported = isVideo

    ? supportedVideoMimes.includes(mimeType) || mimeType.startsWith('video/')

    : supportedAudioMimes.includes(mimeType) || mimeType.startsWith('audio/');



  if (!isSupported) {

    throw new TranscriptionError(

      `صيغة الملف (${mimeType}) غير مدعومة للتفريغ حاليًا. الأنواع المدعومة: MP3, WAV, WEBM, M4A, OGG, MP4.`,

      415,

      'UNSUPPORTED_MEDIA_TYPE'

    );

  }



  // Safe diagnostics (never logging Base64 data or keys)

  console.log('[MIHAK Media]');

  console.log('  mediaType:', isVideo ? 'video' : 'audio');

  console.log('  mimeType:', mimeType);

  console.log('  base64Characters:', base64.length);

  console.log('  hasDataUrlPrefix:', base64.startsWith('data:'));



  const prompt = isVideo

    ? `أنت نظام تفريغ مرئي وصوتي متخصص في استخراج الحديث المنطوق من مقاطع الفيديو والمحاضرات والدروس.

مهمتك:

1\. استمع بدقة إلى الحديث الصوتي المنطوق في مقطع الفيديو المرفق، وفرّغه نصياً بحروفه وكلماته بدقة تامة باللغة الأصلية (عربية أو غيرها).

2\. قسّم التفريغ إلى مقاطع زمنية متسلسلة (segments) مع تحديد وقت البداية والنهاية لكل مقطع بالمللي ثانية (startMs, endMs) بصيغة JSON.



أعد النتيجة حصراً بصيغة JSON التالية:

{

  "text": "كامل النص المنطوق المفرغ هنا",

  "detectedLanguage": "ar",


  "transcriptionNote": "ملاحظة حول وضوح الصوت المنطوق",

  "durationSeconds": 60,

  "segments": [

    {

      "startMs": 0,

      "endMs": 15000,

      "text": "نص المقطع هنا",

      "language": "ar"

    }

  ]

}`

    : `أنت نظام تفريغ صوتي دقيق ومتخصص في تفريغ الخطب والمقاطع الصوتية الإسلامية والعامة.

مهمتك:

1\. استمع بدقة إلى الملف الصوتي المرفق وفرّغه نصياً بحروفه وكلماته بدقة تامة باللغة الأصلية المنطوقة.

2\. قسّم التفريغ إلى مقاطع زمنية مع تحديد التوقيت الزمني بصيغة [MM:SS - MM:SS] أو بصيغة JSON لكل جملة منطوقة.`;



  // 3. Model routing:

  // For AUDIO: gemini-3.5-transcribe as primary, with fallback to gemini-3.8-flash

  // For VIDEO: gemini-3.8-flash (multimodal video understanding model)

  const modelsToTry = isVideo

    ? ['gemini-3.8-flash']

    : ['gemini-3.5-transcribe', 'gemini-3.8-flash'];



  // 4. Large file strategy vs Inline:

  // For media > 4MB (approx > 5.3 million base64 characters), prefer Gemini Files API

  const USE_FILE_API_THRESHOLD = 4 * 1024 * 1024;

  let tempFilePath: string | null = null;

  let uploadedFileRef: any = null;



  try {

    if (base64.length > USE_FILE_API_THRESHOLD) {

      try {

        const ext = isVideo ? (mimeType.includes('webm') ? 'webm' : 'mp4') : (mimeType.includes('wav') ? 'wav' : 'mp3');

        tempFilePath = path.join(os.tmpdir(), `mihak-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);

        await fs.promises.writeFile(tempFilePath, Buffer.from(base64, 'base64'));



        console.log(`[MIHAK Media] Uploading large media (${Math.round(base64.length / 1024)} KB) via Files API...`);
        uploadedFileRef = await aiClient.files.upload({
          file: tempFilePath,
          config: { mimeType }
        });
        console.log(`[MIHAK Media] File uploaded successfully: ${uploadedFileRef.uri}`);

        // Wait until file becomes ACTIVE if in PROCESSING state (per Requirement 21)
        let fileState = uploadedFileRef.state;
        let pollCount = 0;
        while (fileState === 'PROCESSING' && pollCount < 25) {
          await new Promise((r) => setTimeout(r, 1000));
          pollCount++;
          try {
            const updated = await aiClient.files.get({ name: uploadedFileRef.name });
            fileState = updated.state;
            if (fileState === 'ACTIVE') {
              uploadedFileRef = updated;
              break;
            }
            if (fileState === 'FAILED') {
              console.warn('[MIHAK Media] Files API processing reported FAILED state, falling back to inline');
              uploadedFileRef = null;
              break;
            }
          } catch (pollErr) {
            break;
          }
        }
      } catch (fileUploadErr) {
        console.warn('[MIHAK Media] Files API upload attempt failed, falling back to inlineData:', fileUploadErr);
        uploadedFileRef = null;
      }
    }

    let lastError: any = null;

    for (const model of modelsToTry) {
      const maxRetries = 2; // total 3 attempts
      let attempt = 0;

      while (attempt <= maxRetries) {
        try {
          console.log(`[MIHAK Media] Requesting transcription using model: ${model} (attempt ${attempt + 1})`);

          // Construct request part (either FileData or InlineData)
          const mediaPart = uploadedFileRef
            ? {
                fileData: {
                  fileUri: uploadedFileRef.uri,
                  mimeType: uploadedFileRef.mimeType || mimeType
                }
              }
            : {
                inlineData: {
                  mimeType,
                  data: base64
                }
              };

          const isJsonModeSupported = model !== 'gemini-3.5-transcribe';
          const modelConfig: any = {
            temperature: 0.1
          };
          if (isJsonModeSupported) {
            modelConfig.responseMimeType = 'application/json';
          }

          const requestParts = model === 'gemini-3.5-transcribe'
            ? [mediaPart]
            : [mediaPart, { text: prompt }];

          const response = await aiClient.models.generateContent({
            model,
            contents: {
              parts: requestParts
            },
            config: modelConfig
          });

          const rawOutput = extractTextFromGenerateContentResponse(response);
          const parsed = parseModelTranscriptionOutput(rawOutput);

          if (!parsed.text || parsed.text.length < 2) {
            console.warn(`[MIHAK Media] Model ${model} returned empty transcription. Trying alternative model...`);
            throw new TranscriptionError(
              'لم يتم التعرف على أي حديث أو كلام مسموع في المقطع. يرجى التأكد من وضوح الصوت.',
              422,
              'NO_SPEECH_DETECTED'
            );
          }

          return {
            text: parsed.text,
            durationSeconds: parsed.durationSeconds || (parsed.segments.length ? Math.round((parsed.segments[parsed.segments.length - 1]?.endMs || 0) / 1000) : 0),
            detectedLanguage: parsed.detectedLanguage || 'ar',
            transcriptionConfidence: parsed.transcriptionConfidence,
            transcriptionNote: parsed.transcriptionNote,
            mediaType: isVideo ? 'video' : 'audio',
            mimeType,
            segments: parsed.segments
          };
        } catch (error: any) {
          lastError = error;
          const errMsg = error?.message || String(error);
          attempt++;

          if (isRetryableError(error) && attempt <= maxRetries) {
            const delay = 600 * Math.pow(2, attempt - 1);
            console.warn(`[MIHAK Media] Model ${model} transient failure (${sanitizeErrorMessage(errMsg)}), retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          console.warn(`[MIHAK Media] Transcription attempt with ${model} failed:`, sanitizeErrorMessage(errMsg));
          break; // move to next model in modelsToTry
        }
      }
    }

    // 5. Try Groq Whisper fallback if Gemini failed and GROQ_API_KEY is configured
    try {
      console.log('[MIHAK Media] Gemini transcription unavailable; checking Groq Whisper fallback...');
      const groqWhisper = await transcribeWithGroqWhisper(base64, mimeType, fileName || 'media.mp3');
      if (groqWhisper?.text && groqWhisper.text.length >= 2) {
        console.log('[MIHAK Media] Groq Whisper fallback succeeded!');
        const parsed = parseModelTranscriptionOutput(groqWhisper.text);
        return {
          text: parsed.text,
          durationSeconds: parsed.durationSeconds,
          detectedLanguage: groqWhisper.language || 'ar',
          transcriptionConfidence: undefined, // technical acoustic metric only, never fake
          transcriptionNote: 'تم التفريغ عبر المزود البديل (Groq Whisper) لتعذر خوادم Gemini مؤقتًا.',
          mediaType: isVideo ? 'video' : 'audio',
          mimeType,
          segments: parsed.segments
        };
      }
    } catch (groqErr) {
      console.warn('[MIHAK Media] Groq Whisper fallback failed:', groqErr);
    }



    const safeMessage = sanitizeErrorMessage(lastError?.message || '');

    const isQuota = lastError?.status === 429 || lastError?.message?.includes('429') || lastError?.message?.includes('quota');



    throw new TranscriptionError(

      safeMessage,

      isQuota ? 429 : 500,

      isQuota ? 'RATE_LIMITED' : 'TRANSCRIPTION_FAILED'

    );

  } finally {

    // Clean up temporary local file if created

    if (tempFilePath && fs.existsSync(tempFilePath)) {

      try {

        await fs.promises.unlink(tempFilePath);

      } catch (cleanupErr) {

        console.warn('[MIHAK Media] Temp file cleanup warning:', cleanupErr);

      }

    }

  }

}
