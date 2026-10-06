/**

 * MIHAK — مِحَكّ

 * Dedicated Source-Grounded Tafsir Engine

 *

 * Responsibilities:

 * 1. Detect tafsir / explanation intent from natural Arabic phrasing.

 * 2. Resolve Quran verse from full verse, partial verse, verse key, surah + ayah, or famous alias.

 * 3. Retrieve tafsir using a resilient fallback chain over REAL connected sources only:

 *    - Source A: Local Tafsir Al-Muyassar (King Fahd Glorious Quran Printing Complex) — 6,236 verses loaded.

 *    - Source B: Quran Foundation Tafsir API / cache (Resource 16: Tafsir Al-Muyassar).

 *    - Source C: Al-Muyassar fi Gharib Al-Quran (Gharib Quranic Lexicon) — 6,236 verses loaded.

 * 4. Never invent tafsir or rely on raw model hallucination.

 * 5. Provide complete provenance: Quran verse, surah + ayah, tafsir source name, exact passage.

 * 6. Abstain with INSUFFICIENT_EVIDENCE only after all connected tafsir sources have been attempted.

 */



import type { AuditRun, Claim } from '../types';

import { searchQuran, normalizeArabicForSearch } from './quranCorpus';

import {

  findSurahByName,

  getSurahByNumber,

  getQuranVerse,

  getTafsirMuyassar,

  getGharibExplanation,

  searchTafsirRanked,

  htmlToPlainText

} from './quranKnowledge';

import {

  executePhraseSearch,

  getQFVerseSync,

  getQFTafsirForVerse,

  buildFormattedAnswer

} from './quranFoundationEngine';



export interface ResolvedVerseInfo {

  surahNumber: number;

  ayahNumber: number;

  verseKey: string;

  surahName: string;

  textUthmani: string;

}



export interface RetrievedTafsirInfo {

  tafsirText: string;

  sourceName: string;

  sourceId: string;

  rawPassage: string;

}



const FAMOUS_VERSES_ALIASES: Record<string, string> = {

  'ايه الكرسي': '2:255',

  'آية الكرسي': '2:255',

  'الكرسي': '2:255',

  'ايه الدين': '2:282',

  'آية الدين': '2:282',

  'ايه المداينه': '2:282',

  'آية المداينة': '2:282',

  'خواتيم البقره': '2:285',

  'خواتيم البقرة': '2:285',

  'ايه الوضوء': '5:6',

  'آية الوضوء': '5:6',

  'ايه التيمم': '4:43',

  'آية التيمم': '4:43',

  'ايه النور': '24:35',

  'آية النور': '24:35',

  'ايه البر': '2:177',

  'آية البر': '2:177'

};



/**

 * Normalizes text for regex/intent checking.

 */

function normalizeQuery(text: string): string {

  return text

    .normalize('NFKD')

    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')

    .replace(/ـ/g, '')

    .replace(/[أإآٱ]/g, 'ا')

    .replace(/ى/g, 'ي')

    .replace(/ؤ/g, 'و')

    .replace(/ئ/g, 'ي')

    .replace(/ة/g, 'ه')

    .replace(/[«»"“”'‘’()[\\]{}،؛:,.!?؟\\-–—]/g, ' ')

    .replace(/\s+/g, ' ')

    .trim()

    .toLowerCase();

}



function convertArabicDigits(value: string): number {

  const translated = value.replace(/[٠-٩]/g, (digit) =>

    String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))

  );

  return Number.parseInt(translated, 10) || 1;

}



/**

 * 1. Intent Detection: detects whether the user is asking a Tafsir / Explanation query.

 */

export function isTafsirQuery(rawText: string): boolean {

  const norm = normalizeQuery(rawText);

  // A request to explain/verify a hadith is NOT a Quran tafsir request.
  // Keep source-domain routing deterministic before applying generic words such as "اشرح".
  const hasExplicitHadithCue =
    norm.includes('حديث') ||
    norm.includes('قال رسول الله') ||
    norm.includes('قال النبي') ||
    norm.includes('رواه') ||
    norm.includes('تخريج') ||
    norm.includes('صحه حديث') ||
    norm.includes('صحة حديث') ||
    norm.includes('درجه حديث') ||
    norm.includes('درجة حديث');

  if (hasExplicitHadithCue) return false;



  // Direct Tafsir keywords & patterns

  const tafsirTriggers = [

    'تفسير',

    'ما تفسير',

    'اشرح',

    'شرح',

    'ما المقصود',

    'المقصود',

    'ما معنى',

    'ما معني',

    'معنى قوله',

    'معني قوله',

    'ماذا تعني',

    'ماذا يعني',

    'ما المراد',

    'المراد من',

    'المراد بقوله',

    'ما دلاله',

    'ما دلالة',

    'تاويل',

    'تأويل',

    'بيان قوله',

    'وضح قوله'

  ];



  const hasTafsirTrigger = tafsirTriggers.some(t => norm.includes(t));

  if (!hasTafsirTrigger) return false;



  // Check if it pertains to Quran (explicit verse brackets, Quranic mention, or religious verse context)

  const hasQuranSign =

    rawText.includes('﴿') ||

    rawText.includes('﴾') ||

    norm.includes('قوله تعالي') ||

    norm.includes('قوله عز وجل') ||

    norm.includes('قوله') ||

    norm.includes('ايه') ||

    norm.includes('سوره') ||

    norm.includes('القران') ||

    norm.includes('الكرسي');



  return hasQuranSign || norm.startsWith('ما تفسير') || norm.startsWith('اشرح') || norm.startsWith('ما المقصود');

}



/**

 * 2. Verse Resolution: resolves query text or partial verse to a canonical verse in the Quran.

 */

export async function resolveVerseForTafsir(query: string): Promise<ResolvedVerseInfo | null> {

  const clean = query.trim();

  const norm = normalizeQuery(clean);



  // A. Famous Verse Aliases (e.g. آية الكرسي)

  for (const [alias, vKey] of Object.entries(FAMOUS_VERSES_ALIASES)) {

    if (norm.includes(normalizeQuery(alias))) {

      const [sNum, aNum] = vKey.split(':').map(Number);

      const v = getQuranVerse(sNum, aNum);

      if (v) {

        return {

          surahNumber: sNum,

          ayahNumber: aNum,

          verseKey: vKey,

          surahName: v.surah_name_ar,

          textUthmani: v.arabic_text

        };

      }

    }

  }



  // B. Explicit verse key (e.g. 108:1 or 2:255)

  const keyMatch = clean.match(/(\d{1,3})\s*[:/]\s*(\d{1,3})/);

  if (keyMatch) {

    const sNum = Number(keyMatch[1]);

    const aNum = Number(keyMatch[2]);

    const v = getQuranVerse(sNum, aNum);

    if (v) {

      return {

        surahNumber: sNum,

        ayahNumber: aNum,

        verseKey: `${sNum}:${aNum}`,

        surahName: v.surah_name_ar,

        textUthmani: v.arabic_text

      };

    }

  }



  // C. Surah name + Ayah number (e.g. سورة الكوثر الآية 1 or سورة الإخلاص اية 2)

  const surahMatch = clean.match(/(?:سورة|سوره)\s+([\u0621-\u064A]+).*?(?:الآية|آية|اية)\s*([0-9٠-٩]+)/i);

  if (surahMatch) {

    const s = findSurahByName(surahMatch[1]);

    if (s) {

      const aNum = convertArabicDigits(surahMatch[2]);

      const v = getQuranVerse(s.index, aNum);

      if (v) {

        return {

          surahNumber: s.index,

          ayahNumber: aNum,

          verseKey: `${s.index}:${aNum}`,

          surahName: s.name,

          textUthmani: v.arabic_text

        };

      }

    }

  }



  // C2. Ayah number + Surah name (e.g. "الآية 35 من سورة البقرة")
  // This is intentionally generic: it resolves any valid surah/ayah pair, not saved examples.
  const ayahThenSurahMatch = clean.match(
    /(?:الآية|الاية|آية|اية)\s*(?:رقم\s*)?([0-9٠-٩]+)\s*(?:من|في)?\s*(?:سورة|سوره)\s+([\u0621-\u064A]+)/i
  );

  if (ayahThenSurahMatch) {
    const aNum = convertArabicDigits(ayahThenSurahMatch[1]);
    const s = findSurahByName(ayahThenSurahMatch[2]);

    if (s && aNum >= 1 && aNum <= s.ayas) {
      const v = getQuranVerse(s.index, aNum);
      if (v) {
        return {
          surahNumber: s.index,
          ayahNumber: aNum,
          verseKey: `${s.index}:${aNum}`,
          surahName: s.name,
          textUthmani: v.arabic_text
        };
      }
    }
  }

  // C3. Compact reference forms such as "البقرة آية 35" or "البقرة 35".
  // The surah name must resolve against metadata and the ayah number must be valid.
  const compactRefMatch = clean.match(
    /(?:سورة|سوره)?\s*([\u0621-\u064A]{2,20})\s+(?:الآية|الاية|آية|اية)?\s*([0-9٠-٩]{1,3})(?:\s|$)/i
  );

  if (compactRefMatch) {
    const s = findSurahByName(compactRefMatch[1]);
    const aNum = convertArabicDigits(compactRefMatch[2]);
    if (s && aNum >= 1 && aNum <= s.ayas) {
      const v = getQuranVerse(s.index, aNum);
      if (v) {
        return {
          surahNumber: s.index,
          ayahNumber: aNum,
          verseKey: `${s.index}:${aNum}`,
          surahName: s.name,
          textUthmani: v.arabic_text
        };
      }
    }
  }

  // D. Extract quoted text inside brackets ﴿...﴾ or «...» or "..."

  let candidateVerseText = '';

  const bracketMatch = clean.match(/[﴿«"']([^﴾»"']{2,220})[﴾»"']/);

  if (bracketMatch) {

    candidateVerseText = bracketMatch[1].trim();

  }



  // E. If no brackets, extract text after trigger phrases (قوله تعالى:, اشرح:, ما معنى:, etc.)

  if (!candidateVerseText) {

    const triggerMatch = clean.match(/(?:قوله\s+تعالى|قوله\s+عز\s+وجل|بقوله\s+تعالى|بقوله|الآية|الاية)\s*[:：]?\s*([^؟?\n]{3,220})/i);

    if (triggerMatch) {

      candidateVerseText = triggerMatch[1].trim();

    } else {

      const genericMatch = clean.match(/(?:ما\s+تفسير|تفسير|ما\s+المقصود\s+بـ|ما\s+المقصود\s+من|ما\s+المقصود|ما\s+معنى|ما\s+معني|ما\s+مراد|اشرح|شرح|فسر|فسّر|وضح|وضّح)\s*[:：]?\s*([^؟?\n]{2,220})/i);

      if (genericMatch) {

        candidateVerseText = genericMatch[1].trim();

      }

    }

  }



  // F. Resolve candidate text against the connected Quran sources

  if (candidateVerseText) {

    // Strip leading prepositions/particles like "في" or "أن" if any

    const searchTarget = candidateVerseText
      .replace(/^(?:في|ان|أن|من)\s+/, '')
      .replace(/\s+(?:في|من)\s+(?:القرآن|القران)(?:\s+الكريم)?\s*$/i, '')
      .trim();



    // 1) Try contiguous phrase search in Quran Foundation corpus

    const phraseHits = await executePhraseSearch(searchTarget);

    if (phraseHits.length > 0) {

      const top = phraseHits[0];

      return {

        surahNumber: top.chapterNumber,

        ayahNumber: top.verseNumber,

        verseKey: top.verseKey,

        surahName: top.surahName,

        textUthmani: top.textUthmani

      };

    }



    // 2) Try searchQuran ranked corpus search

    const corpusHits = searchQuran(searchTarget, 3);

    if (corpusHits.length > 0 && corpusHits[0].score >= 0.45) {

      const top = corpusHits[0].record;

      if (top.surah_number && top.ayah_number) {

        const surahInfo = getSurahByNumber(top.surah_number);

        return {

          surahNumber: top.surah_number,

          ayahNumber: top.ayah_number,

          verseKey: `${top.surah_number}:${top.ayah_number}`,

          surahName: surahInfo?.name || `سورة ${top.surah_number}`,

          textUthmani: top.raw_text

        };

      }

    }

  }



  return null;

}



/**

 * 3. Fallback Chain for Tafsir:

 * Retrieves tafsir for a resolved verse using connected sources only.

 */

export async function retrieveTafsirWithFallbackChain(

  surahNumber: number,

  ayahNumber: number,

  verseKey: string

): Promise<RetrievedTafsirInfo | null> {

  // Source 1: Quran Foundation Production Tafsir API / cache.
  // Live source is preferred when available, but it is never required for basic tafsir lookup.
  try {
    const qfTafsir = await getQFTafsirForVerse(verseKey);
    if (qfTafsir?.text && qfTafsir.text.trim().length > 10) {
      return {
        tafsirText: qfTafsir.text.trim(),
        sourceName: qfTafsir.sourceName || 'التفسير الميسر (Quran Foundation)',
        sourceId: 'tafsir-qf-live',
        rawPassage: qfTafsir.text
      };
    }
  } catch (err) {
    console.warn(`[MIHAK Tafsir Engine] Quran Foundation tafsir unavailable for ${verseKey}; using local fallback.`, err);
  }

  // Source 2: Local Tafsir Al-Muyassar.
  // This keeps explicit tafsir requests working even if the network/API is unavailable.
  const localMuyassar = getTafsirMuyassar(surahNumber, ayahNumber);
  if (localMuyassar?.text && localMuyassar.text.trim().length > 10) {
    let cleanText = localMuyassar.text.trim();

    const tafsirMarkerIndex = cleanText.indexOf('[التفسير]');
    if (tafsirMarkerIndex !== -1) {
      const directPart = cleanText.slice(tafsirMarkerIndex + '[التفسير]'.length).trim();
      const introPart = cleanText.slice(0, tafsirMarkerIndex).trim();
      if (directPart) {
        cleanText = `${directPart}\n\n${introPart}`;
      }
    }

    return {
      tafsirText: cleanText,
      sourceName: 'التفسير الميسر (نسخة محلية موثقة)',
      sourceId: 'tafsir-muyassar-local',
      rawPassage: localMuyassar.text
    };
  }

  // Source 3: Al-Muyassar fi Gharib Al-Quran (Lexical Quranic explanation)

  const gharib = getGharibExplanation(surahNumber, ayahNumber);

  if (gharib?.text && gharib.text.trim().length > 5) {

    return {

      tafsirText: gharib.text.trim(),

      sourceName: 'الميسر في غريب القرآن الكريم',

      sourceId: 'gharib-muyassar',

      rawPassage: gharib.text

    };

  }



  return null;

}



/**

 * 4. Master Tafsir Resolver:

 * Executes the complete Tafsir pipeline for any user query.

 */

export async function resolveTafsirPipeline(cleanQuery: string): Promise<AuditRun> {

  // Step 1: Resolve the verse from the question

  const resolvedVerse = await resolveVerseForTafsir(cleanQuery);



  if (!resolvedVerse) {

    return {

      id: `audit-${Date.now()}`,

      timestamp: new Date().toISOString(),

      input_text: cleanQuery,

      detected_language: 'ar',

      claims: [

        {

          id: 'CLM-001',

          claim_text: [

            `س: ${cleanQuery}`,

            '',

            'ج:',

            '• تعذر التحقق الكامل من هذا السؤال من المصادر المتصلة حاليًا.',

            '',

            'المصدر:',

            '• لم يُعثر على آية قرآنية مطابقة ومحددة في متن السؤال لاسترجاع تفسيرها المعتمد.'

          ].join('\n'),

          source_span: { text: cleanQuery, start: 0, end: cleanQuery.length },

          status: 'INSUFFICIENT_EVIDENCE',

          confidence_score: 0.9,

          evidence_relation: 'UNVERIFIED',

          verification_rationale: 'تعذر تحديد موضع الآية القرآنية أو نصها الموثق من متن السؤال.'

        }

      ],

      stats: {

        total: 1,

        supported: 0,

        partiallySupported: 0,

        insufficientEvidence: 1,

        needsSpecialistReview: 0,

        verifiedQuotes: 0

      },

      abstention_count: 1,

      duration_ms: 25

    };

  }



  // Step 2: Retrieve Tafsir using the connected fallback chain

  const tafsirResult = await retrieveTafsirWithFallbackChain(

    resolvedVerse.surahNumber,

    resolvedVerse.ayahNumber,

    resolvedVerse.verseKey

  );



  if (!tafsirResult) {

    return {

      id: `audit-${Date.now()}`,

      timestamp: new Date().toISOString(),

      input_text: cleanQuery,

      detected_language: 'ar',

      claims: [

        {

          id: 'CLM-001',

          claim_text: [

            `س: ${cleanQuery}`,

            '',

            'ج:',

            '• تعذر التحقق الكامل من هذا السؤال من المصادر المتصلة حاليًا.',

            '',

            'المصدر:',

            `• لم يتوفر نص تفسير موثق للآية (${resolvedVerse.surahName}، ${resolvedVerse.ayahNumber}) في مصادر التفسير المتصلة حالياً.`

          ].join('\n'),

          source_span: { text: cleanQuery, start: 0, end: cleanQuery.length },

          status: 'INSUFFICIENT_EVIDENCE',

          confidence_score: 0.9,

          evidence_relation: 'UNVERIFIED',

          verification_rationale: 'لم يتوفر نص تفسير معتمد للآية في قواعد التفسير المتصلة.'

        }

      ],

      stats: {

        total: 1,

        supported: 0,

        partiallySupported: 0,

        insufficientEvidence: 1,

        needsSpecialistReview: 0,

        verifiedQuotes: 0

      },

      abstention_count: 1,

      duration_ms: 25

    };

  }



  // Step 3: Format the response with strict source grounding and provenance

  const directAnswerLines = [

    `• بيان المعنى وتفسير الآية:`,

    tafsirResult.tafsirText

  ];



  const verseSections = [

    {

      surahName: resolvedVerse.surahName,

      verseNumber: resolvedVerse.ayahNumber,

      textUthmani: resolvedVerse.textUthmani

    }

  ];



  const formatted = buildFormattedAnswer({

    question: cleanQuery,

    directAnswerLines,

    verseSections,

    sourceNames: [

      tafsirResult.sourceName,

      `سورة ${resolvedVerse.surahName}، الآية ${resolvedVerse.ayahNumber}`

    ],

    rationale: `تم استرجاع تفسير الآية الكريمة مباشرة من ${tafsirResult.sourceName} المعتمد.`

  });



  const claim: Claim = {

    id: 'CLM-001',

    claim_text: formatted.claimText,

    source_span: { text: cleanQuery, start: 0, end: cleanQuery.length },

    status: 'SUPPORTED',

    confidence_score: 0.99,

    evidence_relation: 'DIRECT_SUPPORT',

    evidence: {

      source_id: tafsirResult.sourceId,

      source_name: tafsirResult.sourceName,

      canonical_reference: `سورة ${resolvedVerse.surahName}، الآية ${resolvedVerse.ayahNumber}`,

      language: 'ar',

      raw_text: tafsirResult.rawPassage,

      surah_number: resolvedVerse.surahNumber,

      ayah_number: resolvedVerse.ayahNumber,

      category: 'tafsir',

      version: '1.0',

      license_note: 'تفسير معتمد مقيد بالمصادر'

    },

    evidence_passage: tafsirResult.tafsirText,

    verification_rationale: formatted.verificationRationale

  };



  return {

    id: `audit-${Date.now()}`,

    timestamp: new Date().toISOString(),

    input_text: cleanQuery,

    detected_language: 'ar',

    claims: [claim],

    stats: {

      total: 1,

      supported: 1,

      partiallySupported: 0,

      insufficientEvidence: 0,

      needsSpecialistReview: 0,

      verifiedQuotes: 0

    },

    abstention_count: 0,

    duration_ms: 40

  };

}
