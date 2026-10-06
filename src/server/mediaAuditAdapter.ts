import type { AuditRun, Claim } from '../types';

import { centralOrchestrator } from './centralOrchestrator';

import type { TranscriptResult, TranscriptSegment } from './transcriptionService';



export type MediaAuditMeta = {

  fileName?: string;

  mimeType: string;

  durationSeconds: number;

  detectedLanguage: string;

  transcriptionConfidence?: number; // only when returned by the transcription service

  transcriptionNote?: string;

  segmentCount: number;

  claimCount: number;

  sourceRole: 'UNTRUSTED_INPUT';

  trustNotice: string;

};



export type MediaAuditResponse = {

  ok: true;

  media: MediaAuditMeta;

  transcript: {

    fullText: string;

    segments: TranscriptSegment[];

  };

  audit: AuditRun;

};



function hasReligiousCue(text: string): boolean {

  const v = text.toLowerCase();

  const cues = [

    'القرآن', 'القران', 'سورة', 'سوره', 'آية', 'اية', 'آيات', 'ايات', 'حديث', 'النبي',

    'رسول الله', 'محمد', 'تفسير', 'قال تعالى', 'قال الله', 'مسلم', 'البخاري', 'الترمذي',

    'أبو داود', 'ابن كثير', 'الطبري', 'القرطبي', 'صلاة', 'إسلام', 'الشريعة', 'حرام', 'حلال',

    'quran', "qur'an", 'qur’an', 'koran', 'surah', 'sura', 'verse', 'ayah', 'hadith',

    'hadeeth', 'prophet', 'messenger', 'muhammad', 'allah', 'muslim', 'bukhari', 'tafsir'

  ];



  if (/\b(?:s(?:ura|urah)?\\.?\s*)?\d{1,3}\s*:\s*\d{1,3}\b/i.test(v)) return true;

  return cues.some((c) => v.includes(c));

}



function findBestSegmentMatch(

  claimText: string,

  segments: TranscriptSegment[]

): { startMs?: number; endMs?: number; timeFormatted: string } {

  if (!segments.length) {

    return { timeFormatted: '00:00' };

  }



  const claimLower = claimText.toLowerCase().replace(/[\u064B-\u065F\u0670\s]+/g, ' ');



  // Look for exact substring match inside segment text

  for (const seg of segments) {

    const segLower = seg.text.toLowerCase().replace(/[\u064B-\u065F\u0670\s]+/g, ' ');

    if (segLower.includes(claimLower) || claimLower.includes(segLower)) {

      return {

        startMs: seg.startMs,

        endMs: seg.endMs,

        timeFormatted: `${seg.startTimeFormatted || '00:00'} – ${seg.endTimeFormatted || '00:00'}`

      };

    }

  }



  // Fallback: match by maximum word overlap

  const claimWords = new Set(claimLower.split(/\s+/).filter((w) => w.length > 2));

  let bestSeg: TranscriptSegment = segments[0];

  let maxOverlap = 0;



  for (const seg of segments) {

    const segWords = seg.text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

    let overlap = 0;

    for (const w of segWords) {

      if (claimWords.has(w)) overlap++;

    }

    if (overlap > maxOverlap) {

      maxOverlap = overlap;

      bestSeg = seg;

    }

  }



  return {

    startMs: bestSeg.startMs,

    endMs: bestSeg.endMs,

    timeFormatted: `${bestSeg.startTimeFormatted || '00:00'} – ${bestSeg.endTimeFormatted || '00:00'}`

  };

}



export async function auditMediaTranscript(
  transcript: TranscriptResult,
  options: {
    fileName?: string;
    mimeType?: string;
  } = {}
): Promise<MediaAuditResponse> {
  const started = Date.now();
  const claims: Claim[] = [];
  let claimIndex = 1;

  /**
   * IMPORTANT: Never filter the recording down to segments containing a hard-coded
   * list of religious keywords. That previously caused a long recording to be reduced
   * to the last religious-looking sentence. Every transcribed word must remain eligible
   * for semantic understanding.
   */
  const orderedSegments = [...(transcript.segments || [])]
    .filter(s => String(s.text || '').trim().length > 0)
    .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));

  type AuditWindow = {
    text: string;
    segments: TranscriptSegment[];
    startMs?: number;
    endMs?: number;
  };

  const MAX_WINDOW_CHARS = 8000;
  const windows: AuditWindow[] = [];

  if (orderedSegments.length > 0) {
    let current: TranscriptSegment[] = [];
    let currentLength = 0;

    const flush = () => {
      if (!current.length) return;
      windows.push({
        text: current.map(s => s.text.trim()).filter(Boolean).join(' ').trim(),
        segments: current,
        startMs: current[0]?.startMs,
        endMs: current[current.length - 1]?.endMs
      });
      current = [];
      currentLength = 0;
    };

    for (const seg of orderedSegments) {
      const segText = String(seg.text || '').trim();
      if (!segText) continue;
      if (current.length && currentLength + segText.length + 1 > MAX_WINDOW_CHARS) flush();
      current.push(seg);
      currentLength += segText.length + 1;
    }
    flush();
  }

  if (windows.length === 0 && transcript.text.trim().length > 0) {
    const full = transcript.text.trim();
    for (let i = 0; i < full.length; i += MAX_WINDOW_CHARS) {
      windows.push({ text: full.slice(i, i + MAX_WINDOW_CHARS).trim(), segments: [] });
    }
  }

  for (const window of windows) {
    if (window.text.length < 2) continue;

    try {
      // All modalities converge here on the SAME central semantic planner/retrieval layer.
      const result = await centralOrchestrator(window.text);
      if (!Array.isArray(result?.claims) || result.claims.length === 0) continue;

      for (const c of result.claims) {
        const provenanceText = String(
          c.original_claim || c.source_span?.text || window.text
        ).trim();
        const timing = findBestSegmentMatch(
          provenanceText,
          window.segments.length ? window.segments : orderedSegments
        );
        const charStart = provenanceText ? Math.max(0, transcript.text.indexOf(provenanceText)) : 0;
        const confidence = typeof transcript.transcriptionConfidence === 'number'
          ? transcript.transcriptionConfidence
          : undefined;

        claims.push({
          ...c,
          id: `CLM-MEDIA-${String(claimIndex++).padStart(3, '0')}`,
          original_claim: provenanceText || window.text,
          source_span: {
            text: provenanceText || window.text,
            start: charStart,
            end: charStart + (provenanceText || window.text).length
          },
          source_title: options.fileName || (transcript.mediaType === 'video' ? 'مقطع فيديو' : 'تسجيل صوتي'),
          content_role: 'UNTRUSTED_INPUT',
          transcriptionConfidence: confidence,
          verification_rationale: [
            `موضع المحتوى في التسجيل تقريبًا: [${timing.timeFormatted}]`,
            c.verification_rationale || '',
            typeof confidence === 'number'
              ? `ثقة التفريغ الصوتي المبلغ عنها: ${Math.round(confidence * 100)}% (مقياس تقني مستقل عن نتيجة التحقق).`
              : 'لم تُعرض نسبة ثقة للتفريغ لأن خدمة التفريغ لم تُرجع مقياسًا موثوقًا قابلًا للعرض.',
            'النص المفرغ من الوسائط مادة قيد التدقيق فقط، ولم يُستخدم كمصدر إثبات.'
          ].filter(Boolean).join(' ')
        });
      }
    } catch (error) {
      console.warn('[MIHAK Media Audit] Window verification failed:', error);
      // Preserve the unprocessed window visibly instead of silently dropping it.
      claims.push({
        id: `CLM-MEDIA-${String(claimIndex++).padStart(3, '0')}`,
        claim_text: window.text,
        original_claim: window.text,
        source_span: { text: window.text, start: 0, end: window.text.length },
        status: 'INSUFFICIENT_EVIDENCE',
        evidence_relation: 'UNVERIFIED',
        evidence_passage: '',
        source_title: options.fileName || (transcript.mediaType === 'video' ? 'مقطع فيديو' : 'تسجيل صوتي'),
        content_role: 'UNTRUSTED_INPUT',
        verification_rationale: 'تم الاحتفاظ بهذا الجزء من التفريغ، لكن تعذر إكمال ربطه بالمصادر المتصلة. لم يُحذف الجزء من التسجيل.'
      } as Claim);
    }
  }

  if (claims.length === 0 && transcript.text.trim().length > 0) {
    claims.push({
      id: 'CLM-MEDIA-001',
      claim_text: transcript.text.trim(),
      original_claim: transcript.text.trim(),
      source_span: { text: transcript.text.trim(), start: 0, end: transcript.text.trim().length },
      status: 'INSUFFICIENT_EVIDENCE',
      evidence_relation: 'UNVERIFIED',
      evidence_passage: '',
      source_title: options.fileName || (transcript.mediaType === 'video' ? 'مقطع فيديو' : 'تسجيل صوتي'),
      content_role: 'UNTRUSTED_INPUT',
      verification_rationale: 'تم حفظ التفريغ الكامل، لكن لم يُستخرج منه ادعاء يمكن ربطه بدليل من المصادر المتصلة.'
    } as Claim);
  }

  console.log('[MIHAK Audio/Video Audit]');
  console.log('  File:', options.fileName || 'media-stream');
  console.log('  Duration:', transcript.durationSeconds, 'seconds');
  console.log('  Transcript characters:', transcript.text.length);
  console.log('  Transcript segments:', orderedSegments.length);
  console.log('  Audit windows:', windows.length);
  console.log('  Audited claims:', claims.length);

  const audit: AuditRun = {
    id: `media-audit-${Date.now()}`,
    timestamp: new Date().toISOString(),
    input_text: transcript.text,
    detected_language: (transcript.detectedLanguage as 'ar' | 'en' | 'mixed') || 'ar',
    claims,
    stats: {
      total: claims.length,
      supported: claims.filter(c => c.status === 'SUPPORTED').length,
      partiallySupported: claims.filter(c => c.status === 'PARTIALLY_SUPPORTED').length,
      insufficientEvidence: claims.filter(c => c.status === 'INSUFFICIENT_EVIDENCE').length,
      needsSpecialistReview: claims.filter(c => c.status === 'NEEDS_SPECIALIST_REVIEW').length,
      verifiedQuotes: claims.filter(c => c.status === 'VERIFIED_QUOTE').length,
      sourceCoverageGap: claims.filter(c => c.status === 'SOURCE_COVERAGE_GAP').length
    },
    abstention_count: claims.filter(c => c.status === 'INSUFFICIENT_EVIDENCE' || c.status === 'SOURCE_COVERAGE_GAP').length,
    duration_ms: Date.now() - started
  };

  const media: MediaAuditMeta = {
    fileName: options.fileName,
    mimeType: options.mimeType || transcript.mimeType || 'audio/webm',
    durationSeconds: transcript.durationSeconds || 0,
    detectedLanguage: transcript.detectedLanguage || 'ar',
    transcriptionConfidence: transcript.transcriptionConfidence,
    transcriptionNote: transcript.transcriptionNote,
    segmentCount: orderedSegments.length,
    claimCount: claims.length,
    sourceRole: 'UNTRUSTED_INPUT',
    trustNotice: transcript.mediaType === 'video'
      ? 'المحتوى المفرغ من مقطع الفيديو مادة قيد الفحص فقط، ولا يُعامل كمصدر إثبات شرعي.'
      : 'المحتوى المفرغ صوتيًا مادة قيد الفحص فقط، ولا يُعامل كمصدر إثبات شرعي.'
  };

  return {
    ok: true,
    media,
    transcript: { fullText: transcript.text, segments: orderedSegments },
    audit
  };
}
