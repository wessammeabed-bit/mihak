import fs from 'fs';
import { gunzipSync } from 'zlib';
import { fileURLToPath } from 'url';
import type {
  AuditRun,
  Claim,
  ClaimStatus,
  EvidenceRecord
} from '../types';

type QuranDatasetRecord = {
  source_type: 'quran';
  surah_number: number;
  ayah_number: number;
  surah_name_ar: string;
  surah_name_transliteration?: string;
  surah_name_en?: string;
  surah_type?: string;
  revelation_order?: number;
  canonical_reference_ar: string;
  arabic_text: string;
  bismillah?: string;
};

type QuranDataset = {
  dataset: {
    name: string;
    provider: string;
    source_url: string;
    text_variant: string;
    text_version: string;
    metadata_version: string;
    license: string;
    usage_note?: string;
    record_count: number;
    surah_count: number;
    copyright_and_terms_notice_verbatim?: string;
  };
  records: QuranDatasetRecord[];
};

type IndexedAyah = {
  record: QuranDatasetRecord;
  normalized: string;
  tokens: string[];
};

export type QuranSearchMatch = {
  record: EvidenceRecord;
  score: number;
  matchType: 'exact' | 'contained' | 'fuzzy';
};

const quranDataPath = fileURLToPath(
  new URL('../data/quran_mihak.json.gz', import.meta.url)
);

function loadDataset(): QuranDataset {
  const compressed = fs.readFileSync(quranDataPath);
  const jsonText = gunzipSync(compressed).toString('utf8');
  const parsed = JSON.parse(jsonText) as QuranDataset;

  if (!parsed?.records || !Array.isArray(parsed.records)) {
    throw new Error(
      'Invalid MIHAK Quran dataset: records array is missing.'
    );
  }

  if (parsed.records.length !== 6236) {
    console.warn(
      `MIHAK Quran dataset expected 6236 ayahs, found ${parsed.records.length}.`
    );
  }

  return parsed;
}

const QURAN_DATASET = loadDataset();

/**
 * التطبيع ده للبحث فقط.
 * النص المعروض للمستخدم يفضل دايمًا النص الأصلي من Tanzil.
 */
export function normalizeArabicForSearch(text: string): string {
  if (!text) return '';

  return text
    .normalize('NFKC')
    .replace(
      /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g,
      ''
    )
    .replace(/\u0640/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(
      /[﴾﴿«»“”"'`´،؛:!?؟.\-–—()\[\]{}]/g,
      ' '
    )
    .replace(
      /[^\u0621-\u063A\u0641-\u064A0-9٠-٩\s]/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenize(text: string): string[] {
  return normalizeArabicForSearch(text)
    .split(/\s+/)
    .filter(Boolean);
}

const INDEX: IndexedAyah[] = QURAN_DATASET.records.map(
  (record) => ({
    record,
    normalized: normalizeArabicForSearch(record.arabic_text),
    tokens: tokenize(record.arabic_text)
  })
);

const SURAH_NAMES = Array.from(
  new Map(
    QURAN_DATASET.records.map((r) => [
      r.surah_number,
      r.surah_name_ar
    ])
  ).entries()
).map(([number, name]) => ({
  number,
  name,
  normalizedName: normalizeArabicForSearch(name)
}));

function toEvidenceRecord(
  record: QuranDatasetRecord
): EvidenceRecord {
  return {
    source_id: `QURAN-${String(record.surah_number).padStart(
      3,
      '0'
    )}-${String(record.ayah_number).padStart(3, '0')}`,

    source_name: 'القرآن الكريم — Tanzil Project',

    canonical_reference:
      record.canonical_reference_ar,

    language: 'ar',

    raw_text: record.arabic_text,

    version: `Tanzil Quran Text (Uthmani), Version ${QURAN_DATASET.dataset.text_version}`,

    license_note:
      `${QURAN_DATASET.dataset.provider} — ` +
      `${QURAN_DATASET.dataset.license}. ` +
      `النص المعروض محفوظ حرفيًا من المصدر.`,

    surah_number: record.surah_number,

    ayah_number: record.ayah_number,

    category: 'quran'
  };
}

function uniqueTokenIntersection(
  a: string[],
  b: string[]
): number {
  const bSet = new Set(b);

  return new Set(
    a.filter((token) => bSet.has(token))
  ).size;
}

function fuzzyScore(
  queryTokens: string[],
  verseTokens: string[]
): number {
  if (
    queryTokens.length === 0 ||
    verseTokens.length === 0
  ) {
    return 0;
  }

  const overlap = uniqueTokenIntersection(
    queryTokens,
    verseTokens
  );

  if (overlap === 0) return 0;

  const uniqueQuery = new Set(queryTokens).size;
  const uniqueVerse = new Set(verseTokens).size;

  const queryCoverage =
    overlap / uniqueQuery;

  const verseCoverage =
    overlap / uniqueVerse;

  const dice =
    (2 * overlap) /
    (uniqueQuery + uniqueVerse);

  return Math.min(
    0.94,
    queryCoverage * 0.62 +
      dice * 0.28 +
      verseCoverage * 0.1
  );
}

export function searchQuran(
  query: string,
  limit = 5
): QuranSearchMatch[] {
  const normalizedQuery =
    normalizeArabicForSearch(query);

  if (!normalizedQuery) return [];

  const queryTokens = tokenize(query);

  const scored: QuranSearchMatch[] = [];

  for (const item of INDEX) {
    let score = 0;

    let matchType:
      QuranSearchMatch['matchType'] = 'fuzzy';

    if (item.normalized === normalizedQuery) {
      score = 1;
      matchType = 'exact';
    } else if (
      normalizedQuery.length >= 4 &&
      (
        item.normalized.includes(
          normalizedQuery
        ) ||
        normalizedQuery.includes(
          item.normalized
        )
      )
    ) {
      const shorter = Math.min(
        item.normalized.length,
        normalizedQuery.length
      );

      const longer = Math.max(
        item.normalized.length,
        normalizedQuery.length
      );

      score =
        0.95 +
        0.04 * (shorter / longer);

      matchType = 'contained';
    } else if (queryTokens.length >= 2) {
      score = fuzzyScore(
        queryTokens,
        item.tokens
      );

      matchType = 'fuzzy';
    }

    if (score >= 0.38) {
      scored.push({
        record: toEvidenceRecord(
          item.record
        ),
        score,
        matchType
      });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function convertArabicDigits(
  value: string
): number | undefined {
  const translated = value.replace(
    /[٠-٩]/g,
    (digit) =>
      String(
        '٠١٢٣٤٥٦٧٨٩'.indexOf(digit)
      )
  );

  const parsed = Number.parseInt(
    translated,
    10
  );

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
}

function extractAssertedReference(
  text: string
): {
  surahNumber?: number;
  ayahNumber?: number;
} {
  const normalized =
    normalizeArabicForSearch(text);

  let surahNumber:
    | number
    | undefined;

  for (const surah of SURAH_NAMES) {
    const marker =
      `سوره ${surah.normalizedName}`;

    if (normalized.includes(marker)) {
      surahNumber = surah.number;
      break;
    }
  }

  const ayahMatch = text.match(
    /(?:الآية|الاية|آية|اية)\s*(?:رقم\s*)?([0-9٠-٩]+)/i
  );

  let ayahNumber = ayahMatch
    ? convertArabicDigits(
        ayahMatch[1]
      )
    : undefined;

  if (
    ayahNumber === undefined &&
    /(?:تبدأ|بداية|أول\s+آية|اول\s+ايه|الآية\s+الأولى|الاية\s+الاولى)/i.test(
      text
    )
  ) {
    ayahNumber = 1;
  }

  return {
    surahNumber,
    ayahNumber
  };
}

function extractLikelyQuotation(
  text: string
): {
  query: string;
  directQuote: boolean;
} {
  const quotePatterns = [
    /«([^»]{2,})»/,
    /“([^”]{2,})”/,
    /"([^"]{2,})"/,
    /﴿([^﴾]{2,})﴾/
  ];

  for (const pattern of quotePatterns) {
    const match = text.match(pattern);

    if (match?.[1]?.trim()) {
      return {
        query: match[1].trim(),
        directQuote: true
      };
    }
  }

  const afterQawl = text.match(
    /(?:قال\s+تعالى|قوله\s+تعالى|قول\s+الله\s+تعالى)\s*[:：-]?\s*(.+)$/i
  );

  if (afterQawl?.[1]?.trim()) {
    return {
      query: afterQawl[1]
        .replace(
          /[.،؛!?؟]+$/g,
          ''
        )
        .trim(),

      directQuote: true
    };
  }

  return {
    query: text.trim(),
    directQuote: false
  };
}

function makeUnresolvedClaim(
  claimId: string,
  claimText: string,
  sourceSpanText: string,
  fullText: string
): Claim {
  const spanStart = Math.max(
    0,
    fullText.indexOf(
      sourceSpanText
    )
  );

  const specialist =
    /أجمع|إجماع|فرض|حرام|واجب|مذهب|فتوى|حكم\s+شرعي/i.test(
      claimText
    );

  return {
    id: claimId,

    claim_text: claimText,

    source_span: {
      text: sourceSpanText,
      start: spanStart,
      end:
        spanStart +
        sourceSpanText.length
    },

    status: specialist
      ? 'NEEDS_SPECIALIST_REVIEW'
      : 'INSUFFICIENT_EVIDENCE',

    confidence_score: 0,

    evidence_relation:
      'UNVERIFIED',

    verification_rationale:
      'لم يتم العثور على دليل كافٍ في المصادر المتاحة.',

    specialist_review_reason:
      specialist
        ? 'يتضمن الادعاء حكمًا شرعيًا أو دعوى إجماع تتطلب مراجعة متخصص، ولا يصدر مِحَكّ حكمًا شرعيًا من ذاكرة النموذج.'
        : undefined
  };
}

export function buildQuranClaim(
  claimText: string,
  sourceSpanText: string,
  claimId: string,
  fullText: string
): Claim {
  const spanStart = Math.max(
    0,
    fullText.indexOf(
      sourceSpanText
    )
  );

  const {
    query,
    directQuote
  } =
    extractLikelyQuotation(
      claimText
    );

  const asserted =
    extractAssertedReference(
      claimText
    );

  const matches =
    searchQuran(query, 20);

  if (matches.length === 0) {
    return makeUnresolvedClaim(
      claimId,
      claimText,
      sourceSpanText,
      fullText
    );
  }

  const assertedLocationMatch =
    matches.find(
      (match) => {
        const sameSurah =
          asserted.surahNumber ===
            undefined ||
          match.record
            .surah_number ===
            asserted.surahNumber;

        const sameAyah =
          asserted.ayahNumber ===
            undefined ||
          match.record
            .ayah_number ===
            asserted.ayahNumber;

        return (
          sameSurah &&
          sameAyah &&
          match.score >= 0.94
        );
      }
    );

  const top =
    assertedLocationMatch ||
    matches[0];

  const evidence =
    top.record;

  const surahMismatch =
    asserted.surahNumber !==
      undefined &&
    evidence.surah_number !==
      undefined &&
    asserted.surahNumber !==
      evidence.surah_number;

  const ayahMismatch =
    asserted.ayahNumber !==
      undefined &&
    evidence.ayah_number !==
      undefined &&
    asserted.ayahNumber !==
      evidence.ayah_number;

  const referenceMismatch =
    surahMismatch ||
    ayahMismatch;

  if (top.score >= 0.94) {
    if (referenceMismatch) {
      return {
        id: claimId,

        claim_text: claimText,

        source_span: {
          text: sourceSpanText,
          start: spanStart,
          end:
            spanStart +
            sourceSpanText.length
        },

        status:
          'PARTIALLY_SUPPORTED',

        confidence_score:
          Number(
            top.score.toFixed(3)
          ),

        evidence_relation:
          'ATTRIBUTION_MISMATCH',

        evidence,

        evidence_passage:
          evidence.raw_text,

        verification_rationale:
          `النص القرآني موجود، لكن المرجع المذكور في الادعاء لا يطابق موضعه الفعلي. الموضع الذي عثر عليه مِحَكّ هو: ${evidence.canonical_reference}.`
      };
    }

    const status: ClaimStatus =
      directQuote
        ? 'VERIFIED_QUOTE'
        : 'SUPPORTED';

    return {
      id: claimId,

      claim_text: claimText,

      source_span: {
        text: sourceSpanText,
        start: spanStart,
        end:
          spanStart +
          sourceSpanText.length
      },

      status,

      confidence_score:
        Number(
          top.score.toFixed(3)
        ),

      evidence_relation:
        'DIRECT_SUPPORT',

      evidence,

      evidence_passage:
        evidence.raw_text,

      verification_rationale:
        directQuote
          ? `تم العثور على الاقتباس في المصدر القرآني المعتمد: ${evidence.canonical_reference}.`
          : `تم العثور على دعم نصي مباشر في المصدر القرآني المعتمد: ${evidence.canonical_reference}.`
    };
  }

  if (top.score >= 0.68) {
    return {
      id: claimId,

      claim_text: claimText,

      source_span: {
        text: sourceSpanText,
        start: spanStart,
        end:
          spanStart +
          sourceSpanText.length
      },

      status:
        'PARTIALLY_SUPPORTED',

      confidence_score:
        Number(
          top.score.toFixed(3)
        ),

      evidence_relation:
        referenceMismatch
          ? 'ATTRIBUTION_MISMATCH'
          : 'PARTIAL_SUPPORT',

      evidence,

      evidence_passage:
        evidence.raw_text,

      verification_rationale:
        referenceMismatch
          ? `وُجد نص قريب في القرآن، لكن موضعه لا يطابق المرجع المذكور. أقرب موضع: ${evidence.canonical_reference}.`
          : `وُجد نص قريب في ${evidence.canonical_reference}، لكن المطابقة ليست كافية لإثبات الادعاء كاملًا.`
    };
  }

  return makeUnresolvedClaim(
    claimId,
    claimText,
    sourceSpanText,
    fullText
  );
}

function splitIntoClaims(
  text: string
): string[] {
  const lines = text
    .split(
      /(?:\n+|(?<=[.!?؟])\s+)/
    )
    .map(
      (part) =>
        part.trim()
    )
    .filter(
      (part) =>
        part.length > 2
    );

  return lines.length > 0
    ? lines
    : [text.trim()];
}

function makeStats(
  claims: Claim[]
) {
  return {
    total:
      claims.length,

    supported:
      claims.filter(
        (c) =>
          c.status ===
          'SUPPORTED'
      ).length,

    partiallySupported:
      claims.filter(
        (c) =>
          c.status ===
          'PARTIALLY_SUPPORTED'
      ).length,

    insufficientEvidence:
      claims.filter(
        (c) =>
          c.status ===
          'INSUFFICIENT_EVIDENCE'
      ).length,

    needsSpecialistReview:
      claims.filter(
        (c) =>
          c.status ===
          'NEEDS_SPECIALIST_REVIEW'
      ).length,

    verifiedQuotes:
      claims.filter(
        (c) =>
          c.status ===
          'VERIFIED_QUOTE'
      ).length
  };
}

export function auditQuranContentLocally(
  text: string
): AuditRun {
  const start = Date.now();

  const input =
    text.trim();

  const pieces =
    splitIntoClaims(input);

  const claims =
    pieces.map(
      (piece, index) =>
        buildQuranClaim(
          piece,
          piece,
          `CLM-${String(
            index + 1
          ).padStart(3, '0')}`,
          input
        )
    );

  const stats =
    makeStats(claims);

  return {
    id:
      `audit-${Date.now()}`,

    timestamp:
      new Date().toISOString(),

    input_text: input,

    detected_language:
      /[\u0600-\u06FF]/.test(
        input
      )
        ? 'ar'
        : 'en',

    claims,

    stats,

    abstention_count:
      stats.insufficientEvidence,

    duration_ms:
      Date.now() - start
  };
}

export function buildAuditRunFromClaims(
  text: string,
  claims: Claim[],
  startTime: number
): AuditRun {
  const stats =
    makeStats(claims);

  return {
    id:
      `audit-${Date.now()}`,

    timestamp:
      new Date().toISOString(),

    input_text: text,

    detected_language:
      /[\u0600-\u06FF]/.test(
        text
      )
        ? 'ar'
        : 'en',

    claims,

    stats,

    abstention_count:
      stats.insufficientEvidence,

    duration_ms:
      Date.now() -
      startTime
  };
}

export function getQuranCorpusStatus() {
  return {
    provider:
      QURAN_DATASET.dataset.provider,

    sourceUrl:
      QURAN_DATASET.dataset.source_url,

    textVariant:
      QURAN_DATASET.dataset.text_variant,

    textVersion:
      QURAN_DATASET.dataset.text_version,

    metadataVersion:
      QURAN_DATASET.dataset.metadata_version,

    license:
      QURAN_DATASET.dataset.license,

    surahCount:
      QURAN_DATASET.dataset.surah_count,

    ayahCount:
      QURAN_DATASET.records.length,

    canonicalTextPolicy:
      'Display text is returned verbatim from the bundled Tanzil dataset.'
  };
}

export function isSimpleQuranQuoteInput(
  text: string
): boolean {
  const trimmed = text.trim();

  // نص قصير (أقل من 800 حرف) → نعتبره اقتباس محتمل ونبحث في القرآن مباشرة
  if (trimmed.length > 0 && trimmed.length <= 800) {
    return true;
  }

  return false;
}