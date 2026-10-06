import { GoogleGenAI } from '@google/genai';

import type { AuditRun, Claim } from '../types';

import { centralOrchestrator } from './centralOrchestrator';

import type { ExternalContentDocument } from './externalContentService';



export type ExternalAuditMeta = {

  requestedUrl: string;

  finalUrl: string;

  hostname: string;

  title: string;

  kind: string;

  contentType: string;

  detectedLanguage: 'ar' | 'en' | 'mixed' | 'unknown';

  extractedCharacters: number;

  extractedWordCount: number;

  extractionMethod: string;

  candidateCount: number;

  auditedCount: number;

  skippedNonArabicCount: number;

  translatedForRetrievalCount: number;

  sourceRole: 'UNTRUSTED_INPUT';

  trustNotice: string;

};



export type ExternalAuditResponse = {

  ok: true;

  page: {

    originalUrl: string;

    finalUrl: string;

    hostname: string;

    title: string;

    contentType: string;

    language: 'ar' | 'en' | 'mixed' | 'unknown';

    extractionMethod: string;

    characterCount: number;

    wordCount: number;

    contentRole: 'UNTRUSTED_INPUT';

  };

  extraction: {

    candidateCount: number;

    claimCount: number;

    skippedNonArabicCount: number;

    translatedForRetrievalCount: number;

  };

  source: ExternalAuditMeta;

  audit: AuditRun;

};



const MAX_CANDIDATES = 30;

const MAX_UNIT_CHARS = 1000;

const MIN_UNIT_CHARS = 20;



const apiKey = process.env.GEMINI_API_KEY;

let aiClient: GoogleGenAI | null = null;

if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim().length > 0) {

  try {

    aiClient = new GoogleGenAI({

      apiKey,

      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }

    });

  } catch (error) {

    console.warn('[MIHAK External Audit] Gemini normalization unavailable:', error);

    aiClient = null;

  }

}



export function detectLanguage(text: string): 'ar' | 'en' | 'mixed' | 'unknown' {

  const letters = String(text || '').match(/[A-Za-z\u0600-\u06FF]/g) || [];

  if (!letters.length) return 'unknown';



  const arabicCount = letters.filter((x) => /[\u0600-\u06FF]/.test(x)).length;

  const latinCount = letters.filter((x) => /[A-Za-z]/.test(x)).length;

  const arabicRatio = arabicCount / letters.length;

  const latinRatio = latinCount / letters.length;



  if (arabicRatio >= 0.6) return 'ar';

  if (latinRatio >= 0.6) return 'en';

  if (arabicRatio >= 0.2 && latinRatio >= 0.2) return 'mixed';

  return 'unknown';

}



function normalizeUnit(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[•*–—\d\-]+[.)\s]+/, '')
    .trim();
}



function islamicCueScore(value: string): number {

  const v = value.toLowerCase();

  const cues = [

    'القرآن', 'القران', 'سورة', 'سوره', 'آية', 'اية', 'آيات', 'ايات', 'حديث', 'النبي',

    'رسول الله', 'محمد', 'تفسير', 'قال تعالى', 'قال الله', 'مسلم', 'البخاري', 'الترمذي',

    'أبو داود', 'ابن كثير', 'الطبري', 'القرطبي', 'ناسخ', 'منسوخ', 'إعجاز',

    'quran', "qur'an", 'qur’an', 'koran', 'surah', 'sura', 'verse', 'verses', 'ayah', 'ayat',

    'hadith', 'hadeeth', 'prophet', 'messenger', 'muhammad', 'mohammed', 'allah', 'muslim',

    'bukhari', 'tafsir', 'exegesis', 'islam', 'islamic', 'contradict', 'contradiction', 'abrogate'

  ];



  let score = 0;

  for (const cue of cues) {

    if (v.includes(cue)) score += 2;

  }



  // Explicit chapter:verse pattern (e.g. 2:255, 4:34, Surah 9:5)

  if (/\b(?:s(?:ura|urah)?\\.?\s*)?\d{1,3}\s*:\s*\d{1,3}\b/i.test(v)) score += 4;

  // Quotation marks around Arabic or citations

  if (/[﴿﴾«»“”"]/.test(value)) score += 1;

  // Direct religious inquiry

  if (/[؟?]/.test(value)) score += 1;



  // Filter out obvious navigation / boilerplate text

  if (/copyright|all rights reserved|privacy policy|terms of use|contact us|click here/i.test(v)) {

    score -= 5;

  }



  return Math.max(0, score);

}



function isAllegationOfContradictionOrCritique(text: string): boolean {

  const v = text.toLowerCase();

  return (

    v.includes('contradict') ||

    v.includes('contradiction') ||

    v.includes('discrepancy') ||

    v.includes('error') ||

    v.includes('mistake') ||

    v.includes('تناقض') ||

    v.includes('تعارض') ||

    v.includes('خطأ') ||

    v.includes('اختلاف')

  );

}



function extractExplicitVerseReference(text: string): { surah: number; ayah: number } | null {

  const match = text.match(/\b(?:surah|sura|سورة)?\s*(\d{1,3})\s*:\s*(\d{1,3})\b/i);

  if (match) {

    const s = parseInt(match[1], 10);

    const a = parseInt(match[2], 10);

    if (s >= 1 && s <= 114 && a >= 1 && a <= 286) {

      return { surah: s, ayah: a };

    }

  }

  return null;

}



function splitLongUnit(unit: string): string[] {

  if (unit.length <= MAX_UNIT_CHARS) return [unit];



  const parts = unit

    .split(/(?<=[.!؟?؛;])\s+/)

    .map(normalizeUnit)

    .filter((x) => x.length >= MIN_UNIT_CHARS);



  if (!parts.length) {

    const chunks: string[] = [];

    for (let i = 0; i < unit.length; i += MAX_UNIT_CHARS) {

      chunks.push(unit.slice(i, i + MAX_UNIT_CHARS).trim());

    }

    return chunks.filter(Boolean);

  }



  const grouped: string[] = [];

  let current = '';

  for (const part of parts) {

    if (!current) {

      current = part;

      continue;

    }

    if ((current + ' ' + part).length <= MAX_UNIT_CHARS) {

      current += ' ' + part;

    } else {

      grouped.push(current);

      current = part;

    }

  }

  if (current) grouped.push(current);

  return grouped;

}



function extractCandidateUnits(text: string): string[] {
  const rawParagraphs = String(text || '')
    .replace(/\r/g, '')
    .split(/\n{2,}|\n(?=[•*–—\d\-]+[.)\s])/)
    .map(normalizeUnit)
    .filter((x) => x.length >= MIN_UNIT_CHARS);



  const expanded = rawParagraphs.flatMap(splitLongUnit);

  const unique = new Map<string, string>();



  for (const unit of expanded) {

    const key = unit

      .toLowerCase()

      .replace(/[\u064B-\u065F\u0670]/g, '')

      .replace(/\s+/g, ' ')

      .trim();

    if (!unique.has(key)) unique.set(key, unit);

  }



  return Array.from(unique.values())

    .map((unit, index) => ({

      unit,

      index,

      score: islamicCueScore(unit)

    }))

    .filter((item) => item.score > 0)

    .sort((a, b) => b.score - a.score || a.index - b.index)

    .slice(0, MAX_CANDIDATES)

    .map((item) => item.unit);

}




async function extractCandidateUnitsSemantically(text: string): Promise<string[]> {
  const deterministic = extractCandidateUnits(text);
  if (!aiClient || String(text || '').trim().length < 40) return deterministic;

  const body = String(text || '').trim().slice(0, 50000);
  const prompt = `You are MIHAK's external-content claim selector. You do NOT verify, answer, translate, or supply religious information.

Extract only passages from the supplied page that contain an Islamic/religious factual claim, quotation, attribution, comparison, contradiction allegation, Quran/Hadith reference, or a question that can be checked against MIHAK's trusted corpora.

Understand Arabic dialects, Modern Standard Arabic, English, and mixed input.
Return JSON only: {"claims":["EXACT VERBATIM SUBSTRING", ...]}.

Rules:
1. Every returned item MUST be copied verbatim from the supplied page. Never paraphrase.
2. Do not add Quran/Hadith wording from memory.
3. Keep compound claims intact if splitting would destroy the relationship; MIHAK's central planner will decompose them later.
4. Ignore navigation, menus, ads, copyright, contact text, and boilerplate.
5. Return at most ${MAX_CANDIDATES} passages, each preferably under ${MAX_UNIT_CHARS} characters.

PAGE TEXT:\n${body}`;

  try {
    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0 }
    });
    const parsed = JSON.parse(response.text || '{}');
    const raw = Array.isArray(parsed?.claims) ? parsed.claims : [];
    const out: string[] = [];
    for (const item of raw) {
      const exact = String(item || '').trim();
      if (exact.length < MIN_UNIT_CHARS) continue;
      // Anti-hallucination invariant: only exact page spans are accepted.
      if (!body.includes(exact)) continue;
      for (const chunk of splitLongUnit(exact)) {
        if (chunk && !out.includes(chunk)) out.push(chunk);
        if (out.length >= MAX_CANDIDATES) break;
      }
      if (out.length >= MAX_CANDIDATES) break;
    }
    return out.length ? out : deterministic;
  } catch (error) {
    console.warn('[MIHAK External Audit] Semantic candidate extraction unavailable:', error);
    return deterministic;
  }
}

async function normalizeForeignClaimForRetrieval(text: string): Promise<string | null> {

  if (!aiClient) return null;



  const prompt = `أنت طبقة تحويل لغوي فقط داخل نظام تدقيق مصادر دينية.

مهمتك إعادة صياغة النص التالي باللغة العربية لاستخدامه كاستعلام بحث واسترجاع في المصادر المعتمدة، دون الحكم على صحته ودون إضافة أي معلومة.



قواعد إلزامية:

1\) حافظ حرفيًا على جميع أرقام السور والآيات والمراجع المذكورة (مثل 2:255 أو سورة البقرة).

2\) حافظ على النفي والاستفهام والادعاء كما هو، ولا تحوّل الرأي إلى حقيقة أو العكس.

3\) لا تضف أي نص قرآني أو حديث أو تفسير من ذاكرتك.

4\) لا تقل إن الادعاء صحيح أو خطأ، ولا تقدم أي حكم.

5\) أعد JSON فقط بالشكل التالي: {"arabic_text": "صياغة الاسترجاع بالعربية"}.



النص الخارجي:

${text}`;



  try {

    const response = await aiClient.models.generateContent({

      model: 'gemini-3.8-flash',

      contents: prompt,

      config: {

        responseMimeType: 'application/json',

        temperature: 0

      }

    });

    const parsed = JSON.parse(response.text || '{}');

    const arabicText = String(parsed?.arabic_text || '').trim();

    return arabicText || null;

  } catch (error) {

    console.warn('[MIHAK External Audit] Foreign-language normalization failed (quota or offline):', error);

    return null;

  }

}



function normalizeClaimForExternalInput(

  claim: Claim,

  originalUnit: string,

  index: number,

  retrievalText?: string,

  sourceUrl?: string,

  sourceTitle?: string

): Claim {

  const isAllegation = isAllegationOfContradictionOrCritique(originalUnit);

  let finalStatus = claim.status;

  let finalRationale = String(claim.verification_rationale || '').trim();

  let specialistReason = claim.specialist_review_reason;



  // RULE 14 & 15: QUOTE VS INTERPRETATION / ALLEGATION

  // If the user's external claim alleges a contradiction or theological dispute,

  // merely finding the verse does NOT prove the contradiction!

  if (isAllegation && (claim.status === 'SUPPORTED' || claim.status === 'VERIFIED_QUOTE')) {

    finalStatus = 'NEEDS_SPECIALIST_REVIEW';

    specialistReason = 'الآية أو النص المذكور وارد في المصادر، لكن دعوى التناقض أو الإشكال التفسيري لا تتبع مجرد وجود النص وتتطلب دراسة توجيه الآيات وأقوال المفسرين.';

    finalRationale = [

      finalRationale,

      'تنبيه منهجي: تم توثيق وجود الآية/المصدر، لكن الحكم بدعوى التناقض أو التعارض لا يثبت بمجرد الاسترجاع ويحال للمراجعة التخصصية.'

    ].join(' ');

  }



  return {

    ...claim,

    id: `CLM-${String(index).padStart(3, '0')}`,

    claim_text: originalUnit, // Keep exact original claim text as the primary claim

    original_claim: originalUnit,

    retrieval_query_ar: retrievalText && retrievalText !== originalUnit ? retrievalText : undefined,

    source_span: { text: originalUnit, start: 0, end: originalUnit.length },

    status: finalStatus,

    specialist_review_reason: specialistReason,

    source_url: sourceUrl,

    source_title: sourceTitle,

    content_role: 'UNTRUSTED_INPUT',

    verification_rationale: [

      finalRationale,

      retrievalText && retrievalText !== originalUnit

        ? 'استُخدمت الصياغة العربية كطبقة لغوية للاسترجاع فقط، وليست دليلاً.'

        : '',

      'المحتوى الخارجي مادة قيد الفحص فقط، ولم يُستخدم نص الصفحة كمصدر إثبات.'

    ].filter(Boolean).join(' ')

  };

}



export async function auditExternalDocument(

  document: ExternalContentDocument

): Promise<ExternalAuditResponse> {

  const started = Date.now();

  const detectedLang = detectLanguage(document.text);

  const candidates = await extractCandidateUnitsSemantically(document.text);

  const claims: Claim[] = [];

  let skippedNonArabicCount = 0;

  let translatedForRetrievalCount = 0;

  let claimIndex = 1;



  for (const candidate of candidates) {

    const isArabic = detectLanguage(candidate) === 'ar';

    let auditInput = candidate;

    let retrievalText: string | undefined = undefined;



    if (!isArabic) {

      // Deterministic check first: Does the candidate contain an explicit verse reference?

      const explicitRef = extractExplicitVerseReference(candidate);

      if (explicitRef) {

        retrievalText = `سورة ${explicitRef.surah} آية ${explicitRef.ayah}`;

        auditInput = retrievalText;

        translatedForRetrievalCount++;

      } else {

        const normalized = await normalizeForeignClaimForRetrieval(candidate);

        if (normalized) {

          retrievalText = normalized;

          auditInput = normalized;

          translatedForRetrievalCount++;

        } else {

          // Gemini translation unavailable (429/quota/offline) and no explicit citation

          skippedNonArabicCount++;

          claims.push({

            id: `CLM-${String(claimIndex++).padStart(3, '0')}`,

            claim_text: candidate,

            original_claim: candidate,

            source_span: { text: candidate, start: 0, end: candidate.length },

            status: 'NEEDS_SPECIALIST_REVIEW',

            evidence_relation: 'UNVERIFIED',

            evidence_passage: '',

            specialist_review_reason: 'تعذر التحويل اللغوي الآلي للاسترجاع حاليًا (لعدم توفر خدمة الترجمة). النص الأصلي محفوظ للتدقيق اليدوي.',

            source_url: document.finalUrl,

            source_title: document.title,

            content_role: 'UNTRUSTED_INPUT',

            verification_rationale:

              'المحتوى الخارجي مادة قيد الفحص فقط. تعذر تجهيز استعلام استرجاع عربي لهذا المقطع غير العربي دون الاعتماد على النص الخارجي كدليل.'

          } as Claim);

          continue;

        }

      }

    }



    try {

      const result = await centralOrchestrator(auditInput);

      if (Array.isArray(result?.claims) && result.claims.length > 0) {

        for (const claim of result.claims) {

          claims.push(

            normalizeClaimForExternalInput(

              claim,

              candidate,

              claimIndex++,

              retrievalText,

              document.finalUrl,

              document.title

            )

          );

        }

      }

    } catch (error) {

      console.warn('[MIHAK External Audit] Candidate audit failed:', error);

      claims.push({

        id: `CLM-${String(claimIndex++).padStart(3, '0')}`,

        claim_text: candidate,

        original_claim: candidate,

        source_span: { text: candidate, start: 0, end: candidate.length },

        status: 'INSUFFICIENT_EVIDENCE',

        evidence_relation: 'UNVERIFIED',

        evidence_passage: '',

        source_url: document.finalUrl,

        source_title: document.title,

        content_role: 'UNTRUSTED_INPUT',

        verification_rationale:

          'تعذر استرجاع دليل مسند لهذا المقطع من المصادر المتصلة حاليًا دون اعتماد النص الخارجي كدليل.'

      } as Claim);

    }

  }



  // Diagnostics logging on the server (non-sensitive)

  console.log('[MIHAK URL]');

  console.log('  URL:', document.requestedUrl);

  console.log('  Content-Type:', document.contentType);

  console.log('  HTTP status: 200');

  console.log('  Final URL:', document.finalUrl);

  console.log('  Raw HTML length:', document.rawLength);

  console.log('  Clean body text length:', document.cleanBodyLength);

  console.log('  Selected extraction method:', document.extractionMethod);

  console.log('  Selected text length:', document.extractedCharacters);

  console.log('  Detected language:', detectedLang);

  console.log('  Candidate passages:', candidates.length);

  console.log('  Atomic claims:', claims.length);



  const audit: AuditRun = {

    id: `external-audit-${Date.now()}`,

    timestamp: new Date().toISOString(),

    input_text: document.finalUrl,

    detected_language: detectedLang === 'unknown' ? 'ar' : detectedLang,

    claims,

    stats: {

      total: claims.length,

      supported: claims.filter((c) => c.status === 'SUPPORTED').length,

      partiallySupported: claims.filter((c) => c.status === 'PARTIALLY_SUPPORTED').length,

      insufficientEvidence: claims.filter((c) => c.status === 'INSUFFICIENT_EVIDENCE').length,

      needsSpecialistReview: claims.filter((c) => c.status === 'NEEDS_SPECIALIST_REVIEW').length,

      verifiedQuotes: claims.filter((c) => c.status === 'VERIFIED_QUOTE').length

    },

    abstention_count: claims.filter((c) => c.status === 'INSUFFICIENT_EVIDENCE').length,

    duration_ms: Date.now() - started

  };



  const meta: ExternalAuditMeta = {

    requestedUrl: document.requestedUrl,

    finalUrl: document.finalUrl,

    hostname: document.hostname,

    title: document.title,

    kind: document.kind,

    contentType: document.contentType,

    detectedLanguage: detectedLang,

    extractedCharacters: document.extractedCharacters,

    extractedWordCount: document.wordCount,

    extractionMethod: document.extractionMethod,

    candidateCount: candidates.length,

    auditedCount: claims.length,

    skippedNonArabicCount,

    translatedForRetrievalCount,

    sourceRole: document.sourceRole,

    trustNotice: document.trustNotice

  };



  return {

    ok: true,

    page: {

      originalUrl: document.requestedUrl,

      finalUrl: document.finalUrl,

      hostname: document.hostname,

      title: document.title,

      contentType: document.contentType,

      language: detectedLang,

      extractionMethod: document.extractionMethod,

      characterCount: document.extractedCharacters,

      wordCount: document.wordCount,

      contentRole: 'UNTRUSTED_INPUT'

    },

    extraction: {

      candidateCount: candidates.length,

      claimCount: claims.length,

      skippedNonArabicCount,

      translatedForRetrievalCount

    },

    source: meta,

    audit

  };

}
