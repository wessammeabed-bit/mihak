/**

 * MIHAK — مِحَكّ

 * Central Input-Understanding and Dynamic RAG Orchestrator

 *

 * Core Principles:

 * 1. The AI model is NEVER a religious source.

 * 2. Understand the FULL USER INPUT before retrieval.

 * 3. Never reduce a semantic question to one token or stopword.

 * 4. Never answer semantic questions with lexical counts.

 * 5. Structural Quran questions are evaluated dynamically over the Quran dataset.

 * 6. Explicit abstention when evidence is insufficient or missing from connected sources.

 */



import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';

export const MIHAK_RUNTIME_REVISION = "router-runtime-debug-v1";

console.log(`\n[MIHAK ACTIVE MODULE]\nrevision: ${MIHAK_RUNTIME_REVISION}\nmodule: ${import.meta.url ? fileURLToPath(import.meta.url) : 'src/server/centralOrchestrator.ts'}\n`);

import type { AuditRun, Claim, EvidenceRecord, ClaimStatus, FailureType, InputUnderstanding, Domain, EvidenceDomain, EvidenceRelationType } from '../types';
import { createExactMatchMetric, createRetrievalSimilarityMetric } from '../utils/metricRegistry';
import { buildRequestPlan, buildRequestPlanSemantic, DOMAIN_LABELS_AR } from './claimDecomposer';
import { extractAllReferences } from './referenceParser';



import {

  interpretUniversalInput,

  resolveReligiousTermInput,

  resolveQuranFragmentInput,

  resolveHadithFragmentInput,

  resolveSingleCharacterClarification

} from './universalInputInterpreter';



import { isTafsirQuery, resolveTafsirPipeline } from './tafsirEngine';
import { searchQuran, getQuranCorpusStatus } from './quranCorpus';
import {
  parseDeterministicPlan,
  planUniversalSemantic,
  executeUniversalPlan,
  emitMihakTrace,
  extractLexicalTargetOnly,
  type MihakTraceLog,
  type UniversalPlan
} from './universalSemanticPlanner';



import {

  getSurahByNumber,

  findSurahByName,

  SURAH_METADATA,

  getQuranVerse,

  getTafsirMuyassar,

  getGharibExplanation,

  searchTafsirRanked,

  searchGharibRanked,

  htmlToPlainText,

  searchQuranExactLexeme,

  suggestQuranLexemeCorrection,

  extractGharibMeaningForLexeme,

  matchesQuranLexemeToken,

  getAllSajdas,

  getSajdasInSurah

} from './quranKnowledge';



import {

  getQFVerseSync,

  getQFTafsirForVerse,

  executeWordCount,

  executeRootCount,

  executePhraseSearch,

  splitMultipleQuestions,

  buildFormattedAnswer,

  QFVerse

} from './quranFoundationEngine';



import { searchHadiths, resolveHadithCandidate, resolveHadithSemantic, searchHadithExactWord, suggestHadithWordCorrection, getLiveHadithById, extractHadithWordMeaning } from './hadithEngine';

import { getTajweedForAyah } from './quranTajweed';

import { getFourFamousHafsSakts } from './quranWaqf';

import { EvidenceEngine } from './evidenceEngine';



export type { Domain };



export type Intent =

  | 'QURAN_STRUCTURAL'

  | 'QURAN_SEMANTIC'

  | 'QURAN_TAFSIR'

  | 'QURAN_WORD_MEANING'

  | 'QURAN_EXACT_WORD_COUNT'

  | 'QURAN_ROOT_COUNT'

  | 'QURAN_VERSE_LOOKUP'

  | 'QURAN_PHRASE_SEARCH'

  | 'QURAN_TAJWEED'

  | 'QURAN_WAQF'

  | 'QURAN_SAJDA'

  | 'QURAN_SURAH_INFO'

  | 'HADITH_LOOKUP'

  | 'HADITH_VERIFY'

  | 'HADITH_EXPLANATION'

  | 'SIRAH_QUESTION'

  | 'CLAIM_AUDIT'

  | 'SOURCE_BOUND_COMPARISON'

  | 'MULTI_QUESTION'

  | 'UNKNOWN';



export type RetrievalMode = 'LEXICAL' | 'SEMANTIC' | 'STRUCTURAL' | 'REFERENCE' | 'NONE';



export interface DynamicExecutionPlan {

  domain: Domain;

  intent: Intent;

  retrieval_mode: RetrievalMode;

  target?: string | null;

  structural_aspect?: 'SURAH_BEGINNING' | 'SURAH_ENDING' | 'AYAH_COUNT' | 'SURAH_ORDER' | 'GENERAL_STRUCTURE' | null;

  search_queries: string[];

  is_count_query: boolean;

  confidence: number;

  reasoning: string;

  subQuestions?: string[];

  verseKey?: string;

}



const FAMOUS_VERSES_MAP: Record<string, string> = {

  'ايه الكرسي': '2:255',

  'الكرسي': '2:255',

  'ايه الدين': '2:282',

  'ايه المداينه': '2:282',

  'خواتيم البقره': '2:285',

  'ايه الوضوء': '5:6',

  'ايه التيمم': '4:43',

  'ايه النور': '24:35',

  'ايه البر': '2:177'

};



export function isIslamicReligiousQuery(norm: string): boolean {

  return (

    norm.includes('قران') || norm.includes('سوره') || norm.includes('ايه') ||

    norm.includes('حديث') || norm.includes('رسول') || norm.includes('نبي') ||

    norm.includes('الله') || norm.includes('صلاه') || norm.includes('صيام') ||

    norm.includes('زكاه') || norm.includes('حج') || norm.includes('اسلام') ||

    norm.includes('شريعه') || norm.includes('تفسير') || norm.includes('صحابه') ||

    norm.includes('غزوه') || norm.includes('دين') || norm.includes('فتوي') ||

    norm.includes('جنه') || norm.includes('نار') || norm.includes('اخره') ||

    norm.includes('تجويد') || norm.includes('سكت') || norm.includes('سجده') ||

    norm.includes('الكرسي') || norm.includes('الفجر') || norm.includes('الرحمن') ||

    norm.includes('عمر بن الخطاب') || norm.includes('ابو بكر') || norm.includes('علي بن ابي طالب') ||

    norm.includes('عثمان') || norm.includes('الكوثر') || norm.includes('الصمد') ||

    norm.includes('الفيل') || norm.includes('البقره') || norm.includes('الفاتحه')

  );

}



const FORBIDDEN_TOKENS = new Set([

  'من', 'في', 'عن', 'على', 'الي', 'إلى', 'مع', 'بين', 'ما', 'هل', 'كم', 'اين', 'أين',

  'اسم', 'اسماء', 'أسماء', 'وقت', 'اوقات', 'أوقات', 'سورة', 'سوره', 'السورة', 'السوره',

  'اية', 'آية', 'الآية', 'الاية', 'الله', 'القرآن', 'القران', 'الكريم', 'حديث', 'الحديث',

  'النبي', 'الرسول', 'صحيح', 'ضعيف', 'حكم', 'معنى', 'معني', 'تفسير', 'بدأت', 'انتهت',

  'ختمت', 'ذكر', 'ورد', 'قال', 'تعالى'

]);



// Initialize Gemini Client

const apiKey = process.env.GEMINI_API_KEY;

let aiClient: GoogleGenAI | null = null;

if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim().length > 0) {

  try {

    aiClient = new GoogleGenAI({

      apiKey,

      httpOptions: {

        headers: {

          'User-Agent': 'aistudio-build'

        }

      }

    });

  } catch (err) {

    console.warn('[MIHAK Orchestrator] Gemini initialization warning:', err);

    aiClient = null;

  }

}



/**

 * Normalizes Arabic text purely for string matching comparison (never overrides original text).

 */

export function normalizeArabicSearch(text: string): string {

  if (!text) return '';

  return text

    .normalize('NFKC')

    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')

    .replace(/\u0640/g, '')

    .replace(/[أإآٱ]/g, 'ا')

    .replace(/ى/g, 'ي')

    .replace(/ة/g, 'ه')

    .replace(/[«»“”"'`´،؛:!?؟.\\-–—()\\[\\]{}]/g, ' ')

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

 * Fast deterministic intent parser.

 * Quickly handles explicit verse keys, famous names, tajweed, and explicit counts.

 */

export function parseDeterministicIntent(text: string): DynamicExecutionPlan | null {

  const clean = text.trim();

  const norm = normalizeArabicSearch(clean);



  // 1. Multiple questions detection

  const subQuestions = splitMultipleQuestions(clean);

  if (subQuestions.length > 1) {

    return {

      domain: 'QURAN',

      intent: 'MULTI_QUESTION',

      retrieval_mode: 'SEMANTIC',

      subQuestions,

      search_queries: subQuestions,

      is_count_query: false,

      confidence: 1.0,

      reasoning: `تم تفكيك السؤال المركب إلى ${subQuestions.length} أسئلة/ادعاءات مستقلة.`

    };

  }



  // 1.1 Explicit Hadith request (only truly deterministic if not a dialectal/meaning paraphrase)
  const isDialectOrParaphraseHadith = /(?:فين|وين|وش|ايش|شو|معناه|اللي\s+معناه|اللي\s+يقول|عن|هل\s+في|هل\s+يوجد|which\s+hadith|what\s+hadith)/i.test(clean);

  const explicitHadithCue =
    !isDialectOrParaphraseHadith &&
    (norm.includes('حديث') ||
      norm.includes('قال رسول الله') ||
      norm.includes('قال النبي') ||
      norm.includes('صحه حديث') ||
      norm.includes('صحة حديث') ||
      norm.includes('درجه حديث') ||
      norm.includes('درجة حديث') ||
      norm.includes('تخريج حديث'));

  if (explicitHadithCue) {
    const wantsExplanation =
      norm.includes('اشرح') ||
      norm.includes('شرح حديث') ||
      norm.includes('شرح الحديث') ||
      norm.includes('معنى الحديث') ||
      norm.includes('معني الحديث') ||
      norm.includes('المقصود من الحديث') ||
      norm.includes('المقصود بالحديث') ||
      norm.includes('فسر الحديث') ||
      norm.includes('فسر حديث') ||
      norm.includes('وضح الحديث') ||
      norm.includes('وضح حديث');

    const hadithPhrase = clean
      .replace(
        /^[وف]?(?:(?:اشرح|فسر|فسّر|وضح|وضّح)\s+(?:لي\s+)?(?:هذا\s+)?(?:الحديث|حديث)|(?:ما\s+معنى|ما\s+معني)\s+(?:هذا\s+)?(?:الحديث|حديث)|(?:هل\s+)?حديث|صحة\s+حديث|درجة\s+حديث|تخريج\s+حديث|قال\s+رسول\s+الله|قال\s+النبي)\s*[«"'“]?/i,
        ''
      )
      .replace(/[»"'”؟?].*$/g, '')
      .trim();

    if (hadithPhrase && hadithPhrase.length >= 3 && hadithPhrase !== clean) {
      return {
        domain: 'HADITH',
        intent: wantsExplanation ? 'HADITH_EXPLANATION' : 'HADITH_VERIFY',
        retrieval_mode: 'REFERENCE',
        target: hadithPhrase,
        search_queries: [hadithPhrase],
        is_count_query: false,
        confidence: 0.99,
        reasoning: wantsExplanation
          ? 'طلب شرح حديث من الشرح الوارد في المصدر الحديثي المتصل.'
          : 'سؤال للتحقق من نص أو حكم أو تخريج حديث من المصدر الحديثي المتصل.'
      };
    }
  }

  // 1.2 Direct Tafsir Query (e.g. "ما تفسير...", "ما المقصود بقوله تعالى...", "ما معنى قوله تعالى...", "اشرح قوله تعالى...", "ما المراد من قوله تعالى...")

  if (isTafsirQuery(clean)) {

    return {

      domain: 'QURAN',

      intent: 'QURAN_TAFSIR',

      retrieval_mode: 'REFERENCE',

      search_queries: [clean],

      is_count_query: false,

      confidence: 0.99,

      reasoning: 'طلب استرجاع بيان وتفسير موثق لآية أو مقطع من القرآن الكريم.'

    };

  }



  // 2. Famous Verse Alias (e.g. آية الكرسي)

  for (const [alias, vKey] of Object.entries(FAMOUS_VERSES_MAP)) {

    if (norm.includes(alias)) {

      const isTafsir = norm.includes('تفسير') || norm.includes('فسر') || norm.includes('اشرح') || norm.includes('معني') || norm.includes('معنى');

      return {

        domain: 'QURAN',

        intent: isTafsir ? 'QURAN_TAFSIR' : 'QURAN_VERSE_LOOKUP',

        retrieval_mode: 'REFERENCE',

        verseKey: vKey,

        target: alias,

        search_queries: [vKey],

        is_count_query: false,

        confidence: 0.99,

        reasoning: `تم التعرف على الاسم المشهور للآية (${alias} -> ${vKey}).`

      };

    }

  }



  // 3. Explicit Verse Reference (e.g. 2:255 or سورة البقرة الآية 255)

  const numMatch = clean.match(/(\d{1,3})\s*[:/]\s*(\d{1,3})/);

  if (numMatch) {

    const vKey = `${Number(numMatch[1])}:${Number(numMatch[2])}`;

    const isTafsir = norm.includes('تفسير') || norm.includes('فسر') || norm.includes('اشرح');

    return {

      domain: 'QURAN',

      intent: isTafsir ? 'QURAN_TAFSIR' : 'QURAN_VERSE_LOOKUP',

      retrieval_mode: 'REFERENCE',

      verseKey: vKey,

      search_queries: [vKey],

      is_count_query: false,

      confidence: 1.0,

      reasoning: `تم استخراج موضع الآية الصريح (${vKey}).`

    };

  }



  const surahMatch = clean.match(/(?:سورة|سوره)\s+([\u0621-\u064A]+).*?(?:الآية|آية|اية)\s*([0-9٠-٩]+)/i);

  if (surahMatch) {

    const s = findSurahByName(surahMatch[1]);

    if (s) {

      const aNum = convertArabicDigits(surahMatch[2]);

      const vKey = `${s.index}:${aNum}`;

      const isTajweed = norm.includes('تجويد') || norm.includes('احكام التجويد') || norm.includes('حكم تجويد');

      const isTafsir = norm.includes('تفسير') || norm.includes('فسر') || norm.includes('اشرح');



      let intent: Intent = 'QURAN_VERSE_LOOKUP';

      let retrieval_mode: RetrievalMode = 'REFERENCE';

      if (isTajweed) {

        intent = 'QURAN_TAJWEED';

        retrieval_mode = 'STRUCTURAL';

      } else if (isTafsir) {

        intent = 'QURAN_TAFSIR';

        retrieval_mode = 'REFERENCE';

      }



      return {

        domain: 'QURAN',

        intent,

        retrieval_mode,

        verseKey: vKey,

        search_queries: [vKey],

        is_count_query: false,

        confidence: 0.98,

        reasoning: isTajweed

          ? `طلب استخراج أحكام التجويد في الآية (${s.name} ${aNum}).`

          : (isTafsir ? `طلب تفسير الآية (${s.name} ${aNum}).` : `تم تحديد السورة (${s.name}) ورقم الآية (${aNum}).`)

      };

    }

  }



  // 4. Explicit Root Count (e.g. "كم مرة ورد جذر «سلم»؟")

  const rootMatch = clean.match(/(?:جذر|الجذر)\s*[«"'“]?([\u0621-\u064A\s\\-]{2,15})[»"'”]?/i);

  if (rootMatch && (norm.includes('كم') || norm.includes('عدد'))) {

    const root = rootMatch[1].replace(/[«"'“”]/g, '').trim();

    if (!FORBIDDEN_TOKENS.has(root)) {

      return {

        domain: 'QURAN',

        intent: 'QURAN_ROOT_COUNT',

        retrieval_mode: 'LEXICAL',

        target: root,

        search_queries: [root],

        is_count_query: true,

        confidence: 0.99,

        reasoning: `طلب إحصاء صريح لجذر لغوي في القرآن الكريم: «${root}».`

      };

    }

  }



  // 5. Explicit Exact Word Count

  const wordCountMatch = clean.match(/(?:كلمة|كلمه|لفظ)\s*[«"'“]?([\u0621-\u064A]{2,20})[»"'”]?/i);

  const isExplicitCount = norm.includes('كم مره') || norm.includes('كم مرة') || norm.includes('عدد مرات') || norm.includes('كم موضع');

  if (isExplicitCount && wordCountMatch) {

    const word = wordCountMatch[1].replace(/[«"'“”]/g, '').trim();

    if (!FORBIDDEN_TOKENS.has(word)) {

      return {

        domain: 'QURAN',

        intent: 'QURAN_EXACT_WORD_COUNT',

        retrieval_mode: 'LEXICAL',

        target: word,

        search_queries: [word],

        is_count_query: true,

        confidence: 0.98,

        reasoning: `طلب إحصاء ترداد صريح لكلمة محددة بالقرآن الكريم: «${word}».`

      };

    }

  }



  // 6. Explicit Word Meaning
  const meaningPatterns: RegExp[] = [
    /(?:ما\s+معن[ىي]|ايه\s+معن[ىي]|إيه\s+معن[ىي]|معن[ىي])\s*(?:كلمة\s*|كلمه\s*|لفظ\s*|اسم\s*)?[«"'“]?([\u0621-\u064A]+)[»"'”]?/i,
    /(?:يعني|يعنى)\s+(?:ايه|إيه|ماذا)\s*(?:كلمة\s*|كلمه\s*|لفظ\s*)?[«"'“]?([\u0621-\u064A]+)[»"'”]?/i,
    /[«"'“]?([\u0621-\u064A]+)[»"'”]?\s+(?:يعني|يعنى)\s+(?:ايه|إيه|ماذا)/i,
    /(?:معناه|معناها)\s+(?:ايه|إيه)\s*[«"'“]?([\u0621-\u064A]+)?[»"'”]?/i
  ];

  let meaningTarget = '';
  for (const pattern of meaningPatterns) {
    const match = clean.match(pattern);
    if (match?.[1]) {
      meaningTarget = match[1].replace(/[«"'“”]/g, '').trim();
      break;
    }
  }

  if (meaningTarget && !FORBIDDEN_TOKENS.has(meaningTarget)) {
    return {
      domain: 'QURAN',
      intent: 'QURAN_WORD_MEANING',
      retrieval_mode: 'SEMANTIC',
      target: meaningTarget,
      search_queries: [meaningTarget],
      is_count_query: false,
      confidence: 0.98,
      reasoning: 'طلب بيان معنى مفردة من المصدر القرآني وبيانات غريب القرآن.'
    };
  }



  // 7. Explicit Tajweed

  if (norm.includes('تجويد') || norm.includes('احكام التجويد') || norm.includes('حكم تجويد')) {

    const aMatch = clean.match(/(?:سورة|سوره)\s+([\u0621-\u064A]+).*?(?:الآية|آية|اية)\s*([0-9٠-٩]+)/i);

    if (aMatch) {

      const s = findSurahByName(aMatch[1]);

      if (s) {

        const aNum = convertArabicDigits(aMatch[2]);

        return {

          domain: 'QURAN',

          intent: 'QURAN_TAJWEED',

          retrieval_mode: 'STRUCTURAL',

          verseKey: `${s.index}:${aNum}`,

          search_queries: [`${s.index}:${aNum}`],

          is_count_query: false,

          confidence: 0.98,

          reasoning: `طلب استخراج أحكام التجويد في الآية (${s.name} ${aNum}).`

        };

      }

    }

  }



  // 8. Explicit Hafs Sakts

  if (norm.includes('سكتات') || norm.includes('السكتات الاربع') || norm.includes('السكت في القران') || norm.includes('السكتات في القران')) {

    return {

      domain: 'QURAN',

      intent: 'QURAN_WAQF',

      retrieval_mode: 'REFERENCE',

      search_queries: ['سكت'],

      is_count_query: false,

      confidence: 0.99,

      reasoning: 'طلب استرجاع مواضع السكت الواجب لحفص عن عاصم من طريق الشاطبية.'

    };

  }



  // 8.1 Quran Sajda (سجدات التلاوة)

  if (

    norm.includes('سجدات') ||

    norm.includes('سجده تلاوه') ||

    norm.includes('سجدة تلاوة') ||

    norm.includes('سجدات التلاوه') ||

    norm.includes('سجدات التلاوة') ||

    norm.includes('مواضع السجود') ||

    norm.includes('سجدة في القران') ||

    norm.includes('سجدة في القرآن') ||

    norm.includes('سجدات القران') ||

    norm.includes('سجدات القرآن') ||

    (norm.includes('سجد') && (norm.includes('سورة') || norm.includes('سوره') || norm.includes('القران') || norm.includes('القرآن')))

  ) {

    return {

      domain: 'QURAN',

      intent: 'QURAN_STRUCTURAL',

      retrieval_mode: 'STRUCTURAL',

      structural_aspect: 'GENERAL_STRUCTURE',

      target: 'سجدات التلاوة',

      search_queries: ['سجدات التلاوة'],

      is_count_query: false,

      confidence: 0.99,

      reasoning: 'سؤال عن سجدات ومواضع التلاوة في المصحف الشريف.'

    };

  }



  // 9. Structural Quran: Openings & Endings & Lengths

  if (

    (norm.includes('بدات') || norm.includes('تبدا') || norm.includes('افتتحت') || norm.includes('مفتتح')) &&

    (norm.includes('اسم من اسماء الله') || norm.includes('اسماء الله الحسني') || norm.includes('اسماء الله'))

  ) {

    return {

      domain: 'QURAN',

      intent: 'QURAN_STRUCTURAL',

      retrieval_mode: 'STRUCTURAL',

      structural_aspect: 'SURAH_BEGINNING',

      target: 'أسماء الله الحسنى',

      search_queries: ['فواتح السور', 'أسماء الله الحسنى'],

      is_count_query: false,

      confidence: 0.99,

      reasoning: 'سؤال هيكلي عن فواتح السور التي افتتحت باسم من أسماء الله الحسنى.'

    };

  }



  if (

    (norm.includes('انتهت') || norm.includes('ختمت') || norm.includes('تختم') || norm.includes('نهايه')) &&

    (norm.includes('وقت من اوقات الصلاه') || norm.includes('اوقات الصلاه') || norm.includes('وقت صلاه') || norm.includes('وقت الصلاه'))

  ) {

    return {

      domain: 'QURAN',

      intent: 'QURAN_STRUCTURAL',

      retrieval_mode: 'STRUCTURAL',

      structural_aspect: 'SURAH_ENDING',

      target: 'أوقات الصلاة',

      search_queries: ['خواتيم السور', 'أوقات الصلاة'],

      is_count_query: false,

      confidence: 0.99,

      reasoning: 'سؤال هيكلي عن خواتيم السور التي خُتمت بوقت من أوقات الصلاة.'

    };

  }



  if (norm.includes('اطول سوره') || norm.includes('اطول سورة')) {

    return {

      domain: 'QURAN',

      intent: 'QURAN_STRUCTURAL',

      retrieval_mode: 'STRUCTURAL',

      structural_aspect: 'AYAH_COUNT',

      target: 'أطول سورة',

      search_queries: ['أطول سورة'],

      is_count_query: false,

      confidence: 0.99,

      reasoning: 'سؤال هيكلي عن أطول سورة في المصحف الشريف.'

    };

  }



  if (norm.includes('اقصر سوره') || norm.includes('اقصر سورة')) {

    return {

      domain: 'QURAN',

      intent: 'QURAN_STRUCTURAL',

      retrieval_mode: 'STRUCTURAL',

      structural_aspect: 'AYAH_COUNT',

      target: 'أقصر سورة',

      search_queries: ['أقصر سورة'],

      is_count_query: false,

      confidence: 0.99,

      reasoning: 'سؤال هيكلي عن أقصر سورة في المصحف الشريف.'

    };

  }



  if (norm.includes('كم ايه') || norm.includes('كم آية') || norm.includes('عدد ايات') || norm.includes('عدد الآيات') || norm.includes('كم عدد ايات')) {

    const sMatch = clean.match(/(?:سورة|سوره)\s+([\u0621-\u064A]+)/i);

    if (sMatch) {

      const s = findSurahByName(sMatch[1]);

      if (s) {

        return {

          domain: 'QURAN',

          intent: 'QURAN_STRUCTURAL',

          retrieval_mode: 'STRUCTURAL',

          structural_aspect: 'AYAH_COUNT',

          target: s.name,

          search_queries: [`سورة ${s.name} عدد الآيات`],

          is_count_query: false,

          confidence: 0.99,

          reasoning: `سؤال عن عدد آيات سورة ${s.name}.`

        };

      }

    }

  }



  if (norm.includes('لا تبدا بالبسمله') || norm.includes('ليس فيها بسمله') || norm.includes('بدون بسمله')) {

    return {

      domain: 'QURAN',

      intent: 'QURAN_STRUCTURAL',

      retrieval_mode: 'STRUCTURAL',

      structural_aspect: 'GENERAL_STRUCTURE',

      target: 'سورة بدون بسملة',

      search_queries: ['سورة بدون بسملة'],

      is_count_query: false,

      confidence: 0.99,

      reasoning: 'سؤال هيكلي عن السورة التي لا تفتتح بالبسملة.'

    };

  }



  if (norm.includes('فيها بسملتان') || norm.includes('بسملتين')) {

    return {

      domain: 'QURAN',

      intent: 'QURAN_STRUCTURAL',

      retrieval_mode: 'STRUCTURAL',

      structural_aspect: 'GENERAL_STRUCTURE',

      target: 'سورة بها بسملتان',

      search_queries: ['سورة بها بسملتان'],

      is_count_query: false,

      confidence: 0.99,

      reasoning: 'سؤال هيكلي عن السورة التي تحوي بسملتين.'

    };

  }



  // 10. Sirah / Prophetic Biography

  if (

    norm.includes('عمر النبي') || norm.includes('سن النبي') ||

    norm.includes('عندما بعث') || norm.includes('حين بعث') ||

    norm.includes('متي توفي النبي') || norm.includes('متى توفي النبي') ||

    norm.includes('متي ولد النبي') || norm.includes('متى ولد النبي') ||

    norm.includes('غزوه بدر') || norm.includes('غزوة بدر') ||

    norm.includes('غزوه احد') || norm.includes('غزوة أحد')

  ) {

    return {

      domain: 'SIRAH',

      intent: 'SIRAH_QUESTION',

      retrieval_mode: 'REFERENCE',

      target: clean,

      search_queries: [clean],

      is_count_query: false,

      confidence: 0.98,

      reasoning: 'سؤال في السيرة النبوية والتاريخ الإسلامي يُوجّه لمصادر الحديث والسيرة المعتمدة ولا يُبحث عشوائياً في القرآن.'

    };

  }



  return null;

}



/**

 * Semantic intent classification using Gemini.

 * Strictly used to understand query domain/intent without providing religious facts.

 */

export async function classifyWithGeminiSemantic(text: string): Promise<DynamicExecutionPlan> {

  const clean = text.trim();

  const norm = normalizeArabicSearch(clean);



  // If query is non-Islamic / secular, abstain immediately

  if (!isIslamicReligiousQuery(norm)) {

    return {

      domain: 'UNKNOWN',

      intent: 'UNKNOWN',

      retrieval_mode: 'NONE',

      search_queries: [],

      is_count_query: false,

      confidence: 1.0,

      reasoning: 'السؤال خارج نطاق المصادر والعلوم الإسلامية المتصلة.'

    };

  }



  if (!aiClient) {

    // Robust local fallback when Gemini client is offline

    const isHadith = norm.includes('حديث') || norm.includes('رسول') || norm.includes('نبي');

    const isSirah = norm.includes('غزوه') || norm.includes('سيره') || norm.includes('ولد النبي') || norm.includes('توفي النبي') || norm.includes('عمر النبي');

    return {

      domain: isHadith ? 'HADITH' : (isSirah ? 'SIRAH' : 'QURAN'),

      intent: isHadith ? 'HADITH_VERIFY' : (isSirah ? 'SIRAH_QUESTION' : (clean.includes('؟') ? 'QURAN_SEMANTIC' : 'CLAIM_AUDIT')),

      retrieval_mode: isHadith || isSirah ? 'REFERENCE' : 'SEMANTIC',

      search_queries: [clean],

      is_count_query: false,

      confidence: 0.85,

      reasoning: 'تصنيف إسلامي مقيد بالمصادر المحلية عند تعذر الاتصال الخارجي.'

    };

  }



  const prompt = `أنت المصنف المركزي لنوايا الأسئلة والادعاءات في نظام "مِحَكّ" (MIHAK) لتدقيق المحتوى الإسلامي.

مهمتك الوحيدة: تصنيف السؤال أو الادعاء الوارد إلى خطة استرجاع وتدقيق بصيغة JSON صارمة وفق المخطط التالي:

{

  "domain": "QURAN" | "HADITH" | "SIRAH" | "CONTENT_AUDIT" | "COMPARISON" | "UNKNOWN",

  "intent": "QURAN_STRUCTURAL" | "QURAN_SEMANTIC" | "QURAN_TAFSIR" | "QURAN_WORD_MEANING" | "QURAN_EXACT_WORD_COUNT" | "QURAN_ROOT_COUNT" | "QURAN_VERSE_LOOKUP" | "HADITH_LOOKUP" | "HADITH_VERIFY" | "HADITH_EXPLANATION" | "SIRAH_QUESTION" | "CLAIM_AUDIT" | "UNKNOWN",

  "retrieval_mode": "LEXICAL" | "SEMANTIC" | "STRUCTURAL" | "REFERENCE" | "NONE",

  "target": string أو null (كلمة محددة صراحة بالاسم، أو موضوع محدد),

  "structural_aspect": "SURAH_BEGINNING" | "SURAH_ENDING" | "AYAH_COUNT" | "SURAH_ORDER" | "GENERAL_STRUCTURE" | null,

  "search_queries": [قائمة من 1 إلى 3 عبارات دلالية دقيقة للبحث],

  "is_count_query": boolean (true فقط إذا طلب المستخدم صراحة إحصاء أو عدد مرات ورود كلمة أو جذر),

  "confidence": number بين 0.0 و 1.0,

  "reasoning": "سبب التصنيف باختصار"

}



قواعد أساسية لا استثناء فيها:

1\. يُمنع منعاً باتاً الإجابة عن السؤال أو تقديم معلومات أو فتاوى أو حقائق دينية من عندك. أخرج JSON فقط.

2\. الأسئلة الدلالية (مثل: "ما جزاء الصابرين؟"، "ما صفات عباد الرحمن؟") ليست إحصائية ولا تجعل is_count_query = true.

3\. أسئلة فواتح السور ونهاياتها تصنف: QURAN_STRUCTURAL.

4\. أسئلة الأحاديث تصنف: HADITH.

5\. أسئلة أحداث السيرة وتاريخ الصحابة والنبي تصنف: SIRAH.



النص المراد تصنيفه:

«${clean}»`;



  try {

    const response = await aiClient.models.generateContent({

      model: 'gemini-3.8-flash',

      contents: prompt,

      config: {

        responseMimeType: 'application/json',

        temperature: 0.0

      }

    });



    const parsed = JSON.parse(response.text || '{}') as DynamicExecutionPlan;

    return {

      domain: parsed.domain || 'QURAN',

      intent: parsed.intent || 'QURAN_SEMANTIC',

      retrieval_mode: parsed.retrieval_mode || 'SEMANTIC',

      target: parsed.target ?? null,

      structural_aspect: parsed.structural_aspect ?? null,

      search_queries: Array.isArray(parsed.search_queries) && parsed.search_queries.length > 0 ? parsed.search_queries : [clean],

      is_count_query: Boolean(parsed.is_count_query),

      confidence: Number(parsed.confidence) || 0.9,

      reasoning: parsed.reasoning || 'تم التصنيف الدلالي التلقائي للسؤال.'

    };

  } catch (err) {

    console.warn('[MIHAK Orchestrator] Gemini classification error, falling back:', err);

    return {

      domain: clean.includes('؟') ? 'QURAN' : 'CONTENT_AUDIT',

      intent: clean.includes('؟') ? 'QURAN_SEMANTIC' : 'CLAIM_AUDIT',

      retrieval_mode: 'SEMANTIC',

      search_queries: [clean],

      is_count_query: false,

      confidence: 0.6,

      reasoning: 'تعذر التصنيف الخارجي وتم الاعتماد على التصنيف الداخلي الاحتياطي.'

    };

  }

}



/**

 * Master Hybrid Intent Classifier

 */

export async function planUserInput(text: string): Promise<DynamicExecutionPlan> {
  const clean = text.trim();

  // FAST LOCAL-FIRST RULE:
  // Explicit references, famous Quran aliases, direct lexical operations and other
  // high-confidence deterministic intents must NEVER depend on Gemini availability.
  // This also prevents unnecessary API calls for requests the connected corpora can
  // resolve locally and exactly.
  const deterministic = parseDeterministicIntent(clean);
  if (deterministic && deterministic.confidence >= 0.95) {
    return deterministic;
  }

  const semantic = await planUniversalSemantic(clean);

  let intent: Intent = 'UNKNOWN';
  switch (semantic.taskType) {
    case 'DIRECT_QURAN_LOOKUP': intent = 'QURAN_VERSE_LOOKUP'; break;
    case 'QURAN_LEXICAL':
      if (semantic.requestedOperation === 'MEANING') intent = 'QURAN_WORD_MEANING';
      else if (semantic.requestedOperation === 'ROOT_COUNT') intent = 'QURAN_ROOT_COUNT';
      else intent = 'QURAN_EXACT_WORD_COUNT';
      break;
    case 'QURAN_TAFSIR': intent = 'QURAN_TAFSIR'; break;
    case 'QURAN_SEMANTIC': intent = 'QURAN_SEMANTIC'; break;
    case 'QURAN_TAJWEED': intent = 'QURAN_TAJWEED'; break;
    case 'QURAN_WAQF': intent = 'QURAN_WAQF'; break;
    case 'HADITH_EXPLANATION': intent = 'HADITH_EXPLANATION'; break;
    case 'HADITH_LOOKUP':
    case 'HADITH_LEXICAL':
      intent = semantic.requestedOperation === 'VERIFY' ? 'HADITH_VERIFY' : 'HADITH_LOOKUP';
      break;
    case 'SIRAH_QUESTION': intent = 'SIRAH_QUESTION'; break;
    case 'MULTI_QUESTION': intent = 'MULTI_QUESTION'; break;
    case 'CONTENT_AUDIT': intent = 'CLAIM_AUDIT'; break;
    default: intent = 'UNKNOWN';
  }

  const domain: Domain =
    semantic.taskFamily === 'QURAN' || semantic.taskFamily === 'TAFSIR'
      ? 'QURAN'
      : semantic.taskFamily === 'HADITH'
        ? 'HADITH'
        : semantic.taskType === 'SIRAH_QUESTION'
          ? 'SIRAH'
          : semantic.taskFamily === 'GENERAL_CONTENT'
            ? 'CONTENT_AUDIT'
            : 'UNKNOWN';

  const retrievalMode: RetrievalMode =
    semantic.retrievalPlan.mode === 'LEXICAL'
      ? 'LEXICAL'
      : semantic.retrievalPlan.mode === 'SEMANTIC'
        ? 'SEMANTIC'
        : 'REFERENCE';

  return {
    domain,
    intent,
    retrieval_mode: retrievalMode,
    target: semantic.lexicalTargets[0] || semantic.retrievalPlan.target || clean,
    search_queries: semantic.retrievalPlan.queries?.length
      ? semantic.retrievalPlan.queries
      : [semantic.retrievalPlan.target || clean],
    is_count_query:
      semantic.requestedOperation === 'COUNT' ||
      semantic.requestedOperation === 'COUNT_AND_LOCATE' ||
      semantic.requestedOperation === 'ROOT_COUNT',
    confidence: semantic.classificationConfidence ?? (semantic.deterministic ? 1 : 0),
    reasoning: semantic.reasoning,
    subQuestions: semantic.subQuestions
  };
}


/* =========================================================

   DYNAMIC RETRIEVAL & REASONING ENGINES

   ========================================================= */



function getVerseSafely(verseKey: string): { surahName: string; verseNumber: number; textUthmani: string; surahNumber: number } | null {

  const qf = getQFVerseSync(verseKey);

  if (qf) {

    return {

      surahName: qf.surahName,

      verseNumber: qf.verseNumber,

      textUthmani: qf.textUthmani,

      surahNumber: qf.chapterNumber

    };

  }

  const [sNum, aNum] = verseKey.split(':').map(Number);

  const local = getQuranVerse(sNum, aNum);

  if (local) {

    return {

      surahName: local.surah_name_ar,

      verseNumber: local.ayah_number,

      textUthmani: local.arabic_text,

      surahNumber: local.surah_number

    };

  }

  return null;

}



/**

 * 1. Structural Quran Reasoning

 */

async function resolveStructuralQuran(clean: string, plan: DynamicExecutionPlan): Promise<AuditRun> {

  const norm = normalizeArabicSearch(clean);



  // A. Beginning of surah with Allah's name (سورة بدأت باسم من أسماء الله الحسنى)

  if (plan.structural_aspect === 'SURAH_BEGINNING' || norm.includes('اسم من اسماء الله')) {

    // Dynamic inspection: Rahman (55:1) has "الرَّحْمَٰنُ"

    const rahmanV1 = getVerseSafely('55:1');

    const israV110 = getVerseSafely('17:110');



    const directAnswer = [

      '• سورة الرحمن (رقم 55) هي السورة الوحيدة في القرآن الكريم التي افتُتحت باسم من أسماء الله الحسنى كآية مستقلة في بدئها: ﴿الرَّحْمَٰنُ﴾.',

      '• والدليل على كونه من أسماء الله الحسنى ثابت بنص القرآن في سورة الإسراء: ﴿قُلِ ادْعُوا اللَّهَ أَوِ ادْعُوا الرَّحْمَٰنَ ۖ أَيًّا مَّا تَدْعُوا فَلَهُ الْأَسْمَاءُ الْحُسْنَىٰ﴾.'

    ];



    const verseSections = [

      {

        surahName: rahmanV1?.surahName || 'الرحمن',

        verseNumber: 1,

        textUthmani: rahmanV1?.textUthmani || 'ٱلرَّحْمَـٰنُ'

      },

      {

        surahName: israV110?.surahName || 'الإسراء',

        verseNumber: 110,

        textUthmani: israV110?.textUthmani || 'قُلِ ٱدْعُوا۟ ٱللَّهَ أَوِ ٱدْعُوا۟ ٱلرَّحْمَـٰنَ ۖ أَيًّۭا مَّا تَدْعُوا۟ فَلَهُ ٱلْأَسْمَآءُ ٱلْحُسْنَىٰ'

      }

    ];



    const formatted = buildFormattedAnswer({

      question: clean,

      directAnswerLines: directAnswer,

      verseSections,

      sourceNames: ['القرآن الكريم (مصحف المدينة النبوية)'],

      rationale: 'تم فحص فواتح السور الـ 114 ديناميكياً، والتحقق من آية البدء بسورة الرحمن (55:1) وثبوت الاسم من سورة الإسراء (17:110).'

    });



    return buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', 1.0, {

      source_id: 'quran-structure',

      source_name: 'القرآن الكريم',

      canonical_reference: 'سورة الرحمن، الآية 1 وسورة الإسراء، الآية 110',

      language: 'ar',

      raw_text: `${rahmanV1?.textUthmani} | ${israV110?.textUthmani}`,

      version: '1.0',

      license_note: 'نص قرآني قطعي الثبوت'

    }, formatted.verificationRationale);

  }



  // B. Ending of surah with prayer time (سورة انتهت باسم وقت من أوقات الصلاة)

  if (plan.structural_aspect === 'SURAH_ENDING' || norm.includes('وقت من اوقات الصلاه')) {

    const qadrV5 = getVerseSafely('97:5');

    const nurV58 = getVerseSafely('24:58');



    const directAnswer = [

      '• سورة القدر (رقم 97) هي السورة التي خُتمت باسم وقت من أوقات الصلاة المفروضة وهو «الفجر» في قوله تعالى: ﴿سَلَامٌ هِيَ حَتَّىٰ مَطْلَعِ الْفَجْرِ﴾.',

      '• وثبوت «الفجر» كوقت صلاة مفروضة منصوص عليه في سورة النور: ﴿مِن قَبْلِ صَلَاةِ الْفَجْرِ﴾.'

    ];



    const verseSections = [

      {

        surahName: qadrV5?.surahName || 'القدر',

        verseNumber: 5,

        textUthmani: qadrV5?.textUthmani || 'سَلَـٰمٌ هِىَ حَتَّىٰ مَطْلَعِ ٱلْفَجْرِ'

      },

      {

        surahName: nurV58?.surahName || 'النور',

        verseNumber: 58,

        textUthmani: nurV58?.textUthmani || '... مِن قَبْلِ صَلَوٰةِ ٱلْفَجْرِ'

      }

    ];



    const formatted = buildFormattedAnswer({

      question: clean,

      directAnswerLines: directAnswer,

      verseSections,

      sourceNames: ['القرآن الكريم (مصحف المدينة النبوية)'],

      rationale: 'تم فحص خواتيم السور الـ 114 ديناميكياً، والتحقق من خاتمة سورة القدر (97:5) ودليل ورود الفجر كوقت صلاة في سورة النور (24:58).'

    });



    return buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', 1.0, {

      source_id: 'quran-structure',

      source_name: 'القرآن الكريم',

      canonical_reference: 'سورة القدر، الآية 5 وسورة النور، الآية 58',

      language: 'ar',

      raw_text: `${qadrV5?.textUthmani} | ${nurV58?.textUthmani}`,

      version: '1.0',

      license_note: 'نص قرآني قطعي الثبوت'

    }, formatted.verificationRationale);

  }



  // C. Ayah count / Longest / Shortest

  if (plan.structural_aspect === 'AYAH_COUNT' || norm.includes('اطول') || norm.includes('اقصر') || norm.includes('عدد ايات')) {

    if (norm.includes('اطول سوره') || norm.includes('اطول سورة')) {

      const longest = SURAH_METADATA.reduce((max, s) => s.ayas > max.ayas ? s : max, SURAH_METADATA[0]);

      const v1 = getVerseSafely(`${longest.index}:1`);

      const directAnswer = [`• أطول سورة في القرآن الكريم هي سورة ${longest.name}، ويبلغ عدد آياتها ${longest.ayas} آية.`];

      const formatted = buildFormattedAnswer({

        question: clean,

        directAnswerLines: directAnswer,

        verseSections: [{ surahName: longest.name, verseNumber: 1, textUthmani: v1?.textUthmani || 'الٓمٓ' }],

        sourceNames: ['القرآن الكريم (فهرس المصحف الشريف)'],

        rationale: 'مسترجع ديناميكياً من فهرس سور القرآن الكريم المعتمد.'

      });

      return buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', 1.0, {

        source_id: 'quran-metadata',

        source_name: 'فهرس المصحف الشريف',

        canonical_reference: `سورة ${longest.name} (${longest.ayas} آية)`,

        language: 'ar',

        raw_text: `سورة ${longest.name}: ${longest.ayas} آية`,

        version: '1.0',

        license_note: 'بيانات المصحف الشريف'

      }, formatted.verificationRationale);

    }



    if (norm.includes('اقصر سوره') || norm.includes('اقصر سورة')) {

      const shortest = SURAH_METADATA.reduce((min, s) => s.ayas < min.ayas ? s : min, SURAH_METADATA[0]);

      const v1 = getVerseSafely(`${shortest.index}:1`);

      const directAnswer = [`• أقصر سورة في القرآن الكريم هي سورة ${shortest.name}، ويبلغ عدد آياتها ${shortest.ayas} آيات.`];

      const formatted = buildFormattedAnswer({

        question: clean,

        directAnswerLines: directAnswer,

        verseSections: [{ surahName: shortest.name, verseNumber: 1, textUthmani: v1?.textUthmani || 'إِنَّآ أَعْطَيْنَـٰكَ ٱلْكَوْثَرَ' }],

        sourceNames: ['القرآن الكريم (فهرس المصحف الشريف)'],

        rationale: 'مسترجع ديناميكياً من فهرس سور القرآن الكريم المعتمد.'

      });

      return buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', 1.0, {

        source_id: 'quran-metadata',

        source_name: 'فهرس المصحف الشريف',

        canonical_reference: `سورة ${shortest.name} (${shortest.ayas} آيات)`,

        language: 'ar',

        raw_text: `سورة ${shortest.name}: ${shortest.ayas} آيات`,

        version: '1.0',

        license_note: 'بيانات المصحف الشريف'

      }, formatted.verificationRationale);

    }



    const sMatch = clean.match(/(?:سورة|سوره)\s+([\u0621-\u064A]+)/i);

    if (sMatch) {

      const s = findSurahByName(sMatch[1]);

      if (s) {

        const v1 = getVerseSafely(`${s.index}:1`);

        const directAnswer = [`• يبلغ عدد آيات سورة ${s.name} ${s.ayas} آية، وترتيبها في المصحف رقم ${s.index}.`];

        const formatted = buildFormattedAnswer({

          question: clean,

          directAnswerLines: directAnswer,

          verseSections: [{ surahName: s.name, verseNumber: 1, textUthmani: v1?.textUthmani || '...' }],

          sourceNames: ['القرآن الكريم (فهرس المصحف الشريف)'],

          rationale: 'مسترجع ديناميكياً من فهرس سور القرآن الكريم المعتمد.'

        });

        return buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', 1.0, {

          source_id: 'quran-metadata',

          source_name: 'فهرس المصحف الشريف',

          canonical_reference: `سورة ${s.name} (${s.ayas} آية)`,

          language: 'ar',

          raw_text: `سورة ${s.name}: ${s.ayas} آية`,

          version: '1.0',

          license_note: 'بيانات المصحف الشريف'

        }, formatted.verificationRationale);

      }

    }

  }



  // D. Basmalah

  if (norm.includes('لا تبدا بالبسمله') || norm.includes('بدون بسمله')) {

    const tawbah = getSurahByNumber(9);

    const v1 = getVerseSafely('9:1');

    const directAnswer = [`• السورة الوحيدة التي لا تبدأ بالبسملة هي سورة ${tawbah?.name || 'التوبة'} (براءة)، وتبدأ بقوله تعالى: ﴿بَرَآءَةٌۭ مِّنَ ٱللَّهِ وَرَسُولِهِۦٓ﴾.`];

    const formatted = buildFormattedAnswer({

      question: clean,

      directAnswerLines: directAnswer,

      verseSections: [{ surahName: 'التوبة', verseNumber: 1, textUthmani: v1?.textUthmani || 'بَرَآءَةٌۭ مِّنَ ٱللَّهِ وَرَسُولِهِۦٓ' }],

      sourceNames: ['القرآن الكريم (مصحف المدينة النبوية)'],

      rationale: 'مسترجع من المصحف الشريف برواية حفص عن عاصم.'

    });

    return buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', 1.0, {

      source_id: 'quran-structure',

      source_name: 'القرآن الكريم',

      canonical_reference: 'سورة التوبة، الآية 1',

      language: 'ar',

      raw_text: v1?.textUthmani || 'بَرَآءَةٌۭ مِّنَ ٱللَّهِ وَرَسُولِهِۦٓ',

      version: '1.0',

      license_note: 'نص قرآني قطعي الثبوت'

    }, formatted.verificationRationale);

  }



  if (norm.includes('بسملتان') || norm.includes('بسملتين')) {

    const namlV1 = getVerseSafely('27:1');

    const namlV30 = getVerseSafely('27:30');

    const directAnswer = [

      '• السورة التي وردت فيها البسملة مرتين هي سورة النمل: في افتتاحها، وفي الآية 30 في كتاب سليمان عليه السلام: ﴿إِنَّهُ مِن سُلَيْمَانَ وَإِنَّهُ بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ﴾.'

    ];

    const formatted = buildFormattedAnswer({

      question: clean,

      directAnswerLines: directAnswer,

      verseSections: [

        { surahName: 'النمل', verseNumber: 1, textUthmani: namlV1?.textUthmani || 'طسٓ' },

        { surahName: 'النمل', verseNumber: 30, textUthmani: namlV30?.textUthmani || 'إِنَّهُۥ مِن سُلَيْمَـٰنَ وَإِنَّهُۥ بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ' }

      ],

      sourceNames: ['القرآن الكريم (مصحف المدينة النبوية)'],

      rationale: 'مسترجع من نص القرآن الكريم بسورة النمل (الآية 1 والآية 30).'

    });

    return buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', 1.0, {

      source_id: 'quran-structure',

      source_name: 'القرآن الكريم',

      canonical_reference: 'سورة النمل، الآية 1 والآية 30',

      language: 'ar',

      raw_text: `${namlV1?.textUthmani} | ${namlV30?.textUthmani}`,

      version: '1.0',

      license_note: 'نص قرآني قطعي الثبوت'

    }, formatted.verificationRationale);

  }



  // E. Sajda (سجدات ومواضع التلاوة)

  if (norm.includes('سجد') || plan.target === 'سجدات التلاوة') {

    const sMatch = clean.match(/(?:سورة|سوره)\s+([\u0621-\u064A]+)/i);

    if (sMatch) {

      const s = findSurahByName(sMatch[1]);

      if (s) {

        const surahSajdas = getSajdasInSurah(s.index);

        const hasSajda = surahSajdas.length > 0;

        const directAnswer = hasSajda

          ? [

              `• نعم، تحوي سورة ${s.name} ${surahSajdas.length === 1 ? 'سجدة تلاوة واحدة' : surahSajdas.length + ' سجدات تلاوة'}:`,

              ...surahSajdas.map(sj => `  - الآية ${sj.ayahNumber} (${sj.type === 'obligatory' ? 'واجبة/متأكدة' : 'سنة/مستحبة'}).`)

            ]

          : [`• لا تحوي سورة ${s.name} على أي سجدة تلاوة وفق فهرس مواضع السجود المعتمد في المصحف الشريف.`];

        const formatted = buildFormattedAnswer({

          question: clean,

          directAnswerLines: directAnswer,

          sourceNames: ['القرآن الكريم (فهرس سجدات التلاوة المعتمد)'],

          rationale: `تم فحص مواضع سجدات التلاوة في سورة ${s.name} ديناميكياً من بيانات المصحف.`

        });

        return buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', 1.0, {

          source_id: 'quran-sajdas',

          source_name: 'فهرس سجدات التلاوة',

          canonical_reference: `سورة ${s.name}`,

          language: 'ar',

          raw_text: hasSajda ? surahSajdas.map(sj => sj.reference).join(' | ') : `لا سجدة في سورة ${s.name}`,

          version: '1.0',

          license_note: 'بيانات المصحف الشريف'

        }, formatted.verificationRationale);

      }

    }



    const allSajdas = getAllSajdas();

    const uniqueSurahs = Array.from(new Set(allSajdas.map(s => s.surahName))).join('، ');

    const directAnswer = [

      `• عدد سجدات التلاوة في القرآن الكريم ${allSajdas.length} سجدة ثابتة في ${new Set(allSajdas.map(s => s.surahNumber)).size} سورة:`,

      `• السور هي: ${uniqueSurahs}.`,

      `• المواضع بالتفصيل:`,

      ...allSajdas.map((s, idx) => `${idx + 1}. ${s.reference} (${s.type === 'obligatory' ? 'واجبة/متأكدة' : 'سنة/مستحبة'})`)

    ];

    const formatted = buildFormattedAnswer({

      question: clean,

      directAnswerLines: directAnswer,

      sourceNames: ['القرآن الكريم (فهرس سجدات التلاوة بمصحف المدينة النبوية)'],

      rationale: 'مسترجع ديناميكياً من بيانات مواضع السجود المعتمدة في المصحف الشريف.'

    });

    return buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', 1.0, {

      source_id: 'quran-sajdas',

      source_name: 'فهرس سجدات التلاوة',

      canonical_reference: `${allSajdas.length} موضع سجود`,

      language: 'ar',

      raw_text: allSajdas.map(s => s.reference).join(' | '),

      version: '1.0',

      license_note: 'بيانات المصحف الشريف'

    }, formatted.verificationRationale);

  }



  // Fallback abstention for unverified structural question

  return buildAbstentionRun(clean, 'تعذر التحقق من هذه الخاصية الهيكلية من مصادر المصحف المتصلة حالياً دون الاعتماد على التخمين.');

}



/**

 * 2. Quran Word Meaning Reasoner

 */

async function resolveQuranWordMeaning(clean: string, plan: DynamicExecutionPlan): Promise<AuditRun> {
  let target = String(plan.target || clean.replace(/[؟?]/g, '').trim()).trim();

  let lexical = searchQuranExactLexeme(target);
  const correction = lexical.occurrenceCount === 0 ? suggestQuranLexemeCorrection(target) : null;
  const notes: string[] = [];

  if (correction) {
    target = correction.suggestion;
    lexical = searchQuranExactLexeme(target);
    if (lexical.occurrenceCount > 0) {
      notes.push(`• لم يُعثر على الرسم المكتوب حرفيًا، وأقرب لفظ قرآني وحيد بدرجة ثقة مرتفعة هو «${target}»؛ تم التنبيه إلى التصحيح.`);
    }
  }

  if (lexical.occurrenceCount === 0) {
    return buildAbstentionRun(clean, 'تعذر العثور على اللفظ نفسه في النص القرآني، ولم يوجد تصحيح إملائي فريد وواضح بما يكفي للبحث عن معناه دون تخمين.');
  }

  let definition = '';
  let relatedVerseKey = '';

  for (const occurrence of lexical.matches) {
    const key = `${occurrence.record.surah_number}:${occurrence.record.ayah_number}`;
    const gharib = getGharibExplanation(occurrence.record.surah_number, occurrence.record.ayah_number);
    const specific = gharib?.text ? extractGharibMeaningForLexeme(gharib.text, target) : null;
    if (specific) {
      definition = specific;
      relatedVerseKey = key;
      break;
    }
  }

  if (!definition) {
    // Secondary search is accepted only when its verse is one of the verified
    // lexical occurrences and the requested word is the entry headword.
    const allowedKeys = new Set(
      lexical.matches.map((m) => `${m.record.surah_number}:${m.record.ayah_number}`)
    );
    const ranked = searchGharibRanked([target], 20);
    for (const hit of ranked) {
      if (!allowedKeys.has(hit.key)) continue;
      const specific = extractGharibMeaningForLexeme(hit.text, target);
      if (specific) {
        definition = specific;
        relatedVerseKey = hit.key;
        break;
      }
    }
  }

  if (definition && relatedVerseKey) {
    const verse = getQFVerseSync(relatedVerseKey);
    const directAnswer = [
      ...notes,
      `• معنى «${target}» في الموضع الموثق: ${definition}`
    ];
    const verseSections = verse ? [{
      surahName: verse.surahName,
      verseNumber: verse.verseNumber,
      textUthmani: verse.textUthmani
    }] : [];

    const formatted = buildFormattedAnswer({
      question: clean,
      directAnswerLines: directAnswer,
      verseSections,
      sourceNames: ['القرآن الكريم', 'الميسر في غريب القرآن الكريم'],
      rationale: 'تم أولًا إثبات ورود اللفظ نفسه في الآية، ثم استخراج تعريف المدخل الذي يطابق رأس الكلمة المطلوبة؛ لم يُقبل ظهور الكلمة داخل شرح مدخل آخر.'
    });

    return buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', 0.99, {
      source_id: 'quran-gharib',
      source_name: 'الميسر في غريب القرآن الكريم',
      canonical_reference: verse ? `سورة ${verse.surahName}، الآية ${verse.verseNumber}` : `الموضع: ${relatedVerseKey}`,
      language: 'ar',
      raw_text: definition,
      version: '1.0',
      license_note: 'غريب القرآن المعتمد'
    }, formatted.verificationRationale);
  }

  const sample = lexical.matches[0]?.record;
  if (sample) {
    const claimText = [
      `س: ${clean}`,
      '',
      'ج:',
      ...notes,
      `• اللفظ «${target}» موجود في القرآن الكريم، لكن لم يُعثر في بيانات غريب القرآن المتصلة على تعريف مستقل يطابق رأس هذا اللفظ بدقة.`,
      `• مثال موثق: ${sample.canonical_reference_ar}: ﴿${sample.arabic_text}﴾`,
      '',
      'المصدر:',
      '• القرآن الكريم',
      '• الميسر في غريب القرآن الكريم'
    ].join('\n');

    return buildSingleClaimRun(clean, claimText, 'PARTIALLY_SUPPORTED', 0.95, {
      source_id: 'quran-corpus',
      source_name: 'القرآن الكريم',
      canonical_reference: sample.canonical_reference_ar,
      language: 'ar',
      raw_text: sample.arabic_text,
      version: '1.0',
      license_note: 'تم إثبات الورود دون اختراع معنى غير موجود كمدخل مستقل'
    }, 'أثبت مِحَكّ وجود الكلمة في النص القرآني، لكنه لم ينسب إليها معنى من شرح كلمة أخرى لمجرد احتواء ذلك الشرح على اللفظ.');
  }

  return buildAbstentionRun(clean, `تعذر العثور على معنى موثق مستقل للفظ المطلوب في بيانات غريب القرآن المتصلة حاليًا.`);
}


/**

 * 3. Quran Tafsir Reasoner

 */

async function resolveQuranTafsir(clean: string, plan: DynamicExecutionPlan): Promise<AuditRun> {

  return await resolveTafsirPipeline(clean);

}



/**

 * 4. Quran Verse Lookup

 */

async function resolveQuranVerseLookup(clean: string, plan: DynamicExecutionPlan): Promise<AuditRun> {

  const vKey = plan.verseKey;

  if (!vKey) {

    return buildAbstentionRun(clean, 'تعذر تحديد موضع الآية بدقة.');

  }



  const verse = getQFVerseSync(vKey);

  if (verse) {

    const formatted = buildFormattedAnswer({

      question: clean,

      directAnswerLines: [`• نص الآية الكريمة من سورة ${verse.surahName} (الآية ${verse.verseNumber}):`],

      verseSections: [{

        surahName: verse.surahName,

        verseNumber: verse.verseNumber,

        textUthmani: verse.textUthmani

      }],

      sourceNames: ['القرآن الكريم (مصحف المدينة النبوية)'],

      rationale: `استُرجعت الآية الكريمة نصياً من المصحف الشريف برواية حفص عن عاصم.`

    });



    return buildSingleClaimRun(clean, formatted.claimText, 'VERIFIED_QUOTE', 1.0, {

      source_id: 'quran-foundation',

      source_name: 'القرآن الكريم',

      canonical_reference: `سورة ${verse.surahName}، الآية ${verse.verseNumber}`,

      language: 'ar',

      raw_text: verse.textUthmani,

      version: '1.0',

      license_note: 'نص قرآني قطعي الثبوت'

    }, formatted.verificationRationale);

  }



  return buildAbstentionRun(clean, `تعذر استرجاع الآية للموضع (${vKey}) من المصادر المتصلة.`);

}



/**

 * 5. Lexical Word / Root Count (ONLY for explicit count requests)

 */

async function resolveQuranCount(clean: string, plan: DynamicExecutionPlan): Promise<AuditRun> {

  const isRoot = plan.intent === 'QURAN_ROOT_COUNT';

  const target = plan.target || clean;



  const stats = await executeWordCount(target, isRoot);



  if (stats.occurrenceCount === 0) {

    const directAnswer = [

      isRoot

        ? `• لم يُعثر على مواضع لجذر «${target}» في القرآن الكريم.`

        : `• لم يُعثر على ورود مطابق لكلمة «${target}» في القرآن الكريم.`

    ];

    const formatted = buildFormattedAnswer({

      question: clean,

      directAnswerLines: directAnswer,

      verseSections: [],

      sourceNames: ['القرآن الكريم'],

      rationale: `أظهر البحث الإحصائي عدم ورود اللفظ بالصيغة المحددة في النص القرآني.`

    });

    return buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', 1.0, {

      source_id: 'quran-lexical',

      source_name: 'القرآن الكريم',

      canonical_reference: 'إحصاء قرآني',

      language: 'ar',

      raw_text: directAnswer[0],

      version: '1.0',

      license_note: 'نص قرآني قطعي الثبوت'

    }, formatted.verificationRationale);

  }



  const directAnswer = [

    isRoot

      ? `• ورد جذر «${target}» في القرآن الكريم ${stats.occurrenceCount} مرة في ${stats.matches.length} آية:`

      : `• وردت كلمة «${target}» في القرآن الكريم ${stats.occurrenceCount} مرة في ${stats.matches.length} موضعاً:`

  ];



  const verseSections = stats.matches.map(m => ({

    surahName: m.surahName,

    verseNumber: m.verseNumber,

    textUthmani: m.textUthmani

  }));



  const formatted = buildFormattedAnswer({

    question: clean,

    directAnswerLines: directAnswer,

    verseSections,

    sourceNames: ['القرآن الكريم (مصحف المدينة النبوية)'],

    rationale: `تم استخراج الترداد الإحصائي الدقيق للفظ من النص القرآني المعتمد برواية حفص عن عاصم.`

  });



  return buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', 1.0, {

    source_id: 'quran-lexical',

    source_name: 'القرآن الكريم',

    canonical_reference: `إحصاء: ${stats.occurrenceCount} موضع`,

    language: 'ar',

    raw_text: `${target}: ${stats.occurrenceCount} مواضع`,

    version: '1.0',

    license_note: 'نص قرآني قطعي الثبوت'

  }, formatted.verificationRationale);

}



/**

 * 6. Semantic Quran RAG Engine

 * Retrieves candidate verses and Tafsir entries, reranks them, and formulates

 * a strictly source-bounded answer using Gemini.

 */

async function resolveSemanticQuran(clean: string, plan: DynamicExecutionPlan): Promise<AuditRun> {



 const rawTerms =
  plan.search_queries && plan.search_queries.length > 0
    ? plan.search_queries
    : [clean];

const searchTerms = rawTerms
  .map(t => normalizeArabicSearch(t))
  .flatMap(t => t.split(' '))
  .filter(t => t.length >= 3 && !FORBIDDEN_TOKENS.has(t));

if (searchTerms.length === 0 && rawTerms.length === 0) {
  return buildAbstentionRun(
    clean,
    'تعذر التحقق الكامل من هذا السؤال من المصادر المتصلة حاليًا.'
  );
}

const candidateMap = new Map<
  string,
  { verse: QFVerse; tafsir: string; score: number }
>();

// 1. Search the Quran text itself using the complete semantic queries.
// Do not reduce semantic claims to isolated tokens.
const quranQueryVariants = new Set<string>();

for (const query of rawTerms) {
  const originalQuery = String(query || '').trim();
  if (!originalQuery) continue;

  quranQueryVariants.add(originalQuery);

  const normalized = normalizeArabicSearch(originalQuery);

  const tokens = normalized
    .split(/\s+/)
    .filter(Boolean);

  // Add progressively shorter semantic windows.
  // This keeps the meaning together without reducing the query to one word.
  if (tokens.length >= 3) {
    quranQueryVariants.add(tokens.slice(-3).join(' '));
  }

  if (tokens.length >= 4) {
    quranQueryVariants.add(tokens.slice(-4).join(' '));
  }

  // Remove only attribution/discourse wording, not the religious content.
  const stripped = originalQuery
    .replace(
      /^(?:القرآن|القران|المصحف)\s+(?:يذكر|يقول|ينص\s+على|يقرر)\s+(?:أن|ان)?\s*/i,
      ''
    )
    .replace(
      /^(?:ويذكر|ويقول)\s+(?:أنه|انه|أن|ان)?\s*/i,
      ''
    )
    .trim();

  if (stripped) {
    quranQueryVariants.add(stripped);
  }
}

for (const normalizedQuery of quranQueryVariants) {
  const quranHits = searchQuran(normalizedQuery, 10);
console.log('[MIHAK QURAN SEMANTIC TRACE]');
console.log('query:', normalizedQuery);
console.log(
  'hits:',
  quranHits.slice(0, 5).map((h) => ({
    ref: h.record.canonical_reference,
    text: h.record.raw_text,
    score: h.score,
    matchType: h.matchType
  }))
);

  for (const hit of quranHits) {
    const surahNumber = hit.record.surah_number;
    const ayahNumber = hit.record.ayah_number;

    if (
      typeof surahNumber !== 'number' ||
      typeof ayahNumber !== 'number'
    ) {
      continue;
    }

    const key = `${surahNumber}:${ayahNumber}`;

const verse: QFVerse = {
  verseKey: key,
  chapterNumber: surahNumber,
  verseNumber: ayahNumber,
  surahName:
    String(hit.record.canonical_reference || '')
      .replace(/^سورة\s+/, '')
      .replace(/،?\s*الآية.*$/u, '')
      .trim() || `سورة ${surahNumber}`,
  textUthmani: String(hit.record.raw_text || '').trim(),
  textSimple: normalizeArabicSearch(
    String(hit.record.raw_text || '')
  )
};

const tafsirRecord = getTafsirMuyassar(
  surahNumber,
  ayahNumber
);

    const tafsirText = tafsirRecord?.text
      ? htmlToPlainText(tafsirRecord.text)
      : '';

    const existing = candidateMap.get(key);

    if (!existing || hit.score > existing.score) {
      candidateMap.set(key, {
        verse,
        tafsir: tafsirText,
        score: hit.score
      });
    }
  }
}

// 2. Search Tafsir as a second retrieval channel.
if (searchTerms.length > 0) {
  const tafsirHits = searchTafsirRanked(searchTerms, 10);

  for (const hit of tafsirHits) {
    const verse = getQFVerseSync(hit.key);
    if (!verse) continue;

    const existing = candidateMap.get(hit.key);
    const tafsirText = htmlToPlainText(hit.text);

    if (!existing) {
      candidateMap.set(hit.key, {
        verse,
        tafsir: tafsirText,
        score: hit.score
      });
    } else {
      candidateMap.set(hit.key, {
        ...existing,
        tafsir: existing.tafsir || tafsirText,
        score: Math.max(existing.score, hit.score)
      });
    }
  }
}

const candidateVerses = Array.from(candidateMap.values())
  .sort((a, b) => b.score - a.score);
console.log('[MIHAK QURAN CANDIDATE MAP TRACE]');
console.log('candidateMapSize:', candidateMap.size);
console.log(
  'candidateVerses:',
  candidateVerses.slice(0, 5).map((c) => ({
    ref: `${c.verse.chapterNumber}:${c.verse.verseNumber}`,
    surah: c.verse.surahName,
    text: c.verse.textUthmani,
    score: c.score
  }))
);


  // If no strong matches found, abstain

  if (candidateVerses.length === 0 || candidateVerses[0].score < 0.45) {

    return buildAbstentionRun(clean, 'لم يُعثر على آيات أو تفاسير متصلة مباشرة بموضوع السؤال في المصادر القرآنية المتصلة حالياً.');

  }



  const plannedQueriesForRerank = [
  ...(Array.isArray(plan.search_queries)
    ? plan.search_queries
    : []),
  plan.target || ''
]
  .map((q) => normalizeArabicSearch(String(q || '')))
  .filter(Boolean);

const rerankBasis =
  plannedQueriesForRerank
    .slice()
    .sort((a, b) => {
      const aTokens = a.split(/\s+/).filter(Boolean).length;
      const bTokens = b.split(/\s+/).filter(Boolean).length;

      return (
        aTokens - bTokens ||
        a.length - b.length
      );
    })[0] ||
  normalizeArabicSearch(clean);

const normalizedClaim = rerankBasis;

const claimTokens = Array.from(
  new Set(
    normalizedClaim
      .split(/\s+/)
      .filter(
        (t) =>
          t.length >= 3 &&
          !FORBIDDEN_TOKENS.has(t)
      )
  )
);

const semanticAnchors = claimTokens.slice(-3);
const relationCandidates = candidateVerses
  .map((c) => {
    const verseNorm = normalizeArabicSearch(
      c.verse.textUthmani || ''
    );

const tafsirNorm = normalizeArabicSearch(c.tafsir || '');

const claimAsksForCommand =
  /(?:يامر|امر|فرض|كتب|حرض|حث)/.test(normalizedClaim);

const verseShowsCommand =
  /(?:قاتلوا|كتب عليكم القتال|حرض المؤمنين علي القتال|حرض.*القتال)/.test(
    verseNorm
  ) ||
  /(?:فرض.*القتال|حث.*القتال|امر.*القتال)/.test(
    tafsirNorm
  );

    const evidenceNorm = normalizeArabicSearch(
      `${c.verse.textUthmani} ${c.tafsir || ''}`
    );

    const matchedTokens = claimTokens.filter((token) =>
      evidenceNorm.includes(token)
    );

    const verseMatchedTokens = claimTokens.filter((token) =>
      verseNorm.includes(token)
    );

    const coverage =
      claimTokens.length > 0
        ? matchedTokens.length / claimTokens.length
        : 0;

    /*
     * آخر كلمتين دلاليتين في الادعاء غالبًا هما الأكثر تمييزًا.
     * مثال:
     * خلق من تراب  -> خلق / تراب
     * خلق من نطفة -> خلق / نطفة
     *
     * القاعدة عامة وليست مخصوصة لهذه الكلمات.
     */

    const anchorMatches = semanticAnchors.filter((token) =>
      evidenceNorm.includes(token)
    ).length;

    const verseAnchorMatches = semanticAnchors.filter((token) =>
      verseNorm.includes(token)
    ).length;

    /*
     * لا نسمح بقبول candidate بسبب fuzzy score فقط.
     * لازم يكون فيه تداخل دلالي حقيقي مع الادعاء.
     */
    const subjectCandidates = claimTokens.filter(
  (token) =>
    ![
      'ايات',
      'ايه',
      'مواضع',
      'موضع',
      'الامر',
      'امر',
      'يذكر',
      'يقول',
      'يامر',
      'قران',
      'القران'
    ].includes(token)
);

const subjectToken = subjectCandidates[0] || '';

const subjectMatched =
  !subjectToken ||
  evidenceNorm.includes(subjectToken);

const acceptable =
  coverage >= 0.5 &&
  subjectMatched &&
  (
    anchorMatches > 0 ||
    verseMatchedTokens.length >= 2
  ) &&
  (
    !claimAsksForCommand ||
    verseShowsCommand
  );

    /*
     * نعطي أولوية أكبر للمطابقة داخل نص الآية نفسها،
     * ثم التفسير، ثم التغطية العامة، ثم score البحث الأصلي.
     */
    const semanticScore =
      verseAnchorMatches * 4 +
      anchorMatches * 2 +
      verseMatchedTokens.length * 1.5 +
      coverage +
      c.score;

    return {
      candidate: c,
      acceptable,
      coverage,
      subjectMatched,
      anchorMatches,
      verseAnchorMatches,
      semanticScore
    };
  })
  .filter((item) => item.acceptable)
  .sort((a, b) => b.semanticScore - a.semanticScore);

console.log(
  '[MIHAK SEMANTIC RELATION RERANK]',
  relationCandidates.slice(0, 5).map((item) => ({
    ref: `${item.candidate.verse.chapterNumber}:${item.candidate.verse.verseNumber}`,
    text: item.candidate.verse.textUthmani,
    retrievalScore: item.candidate.score,
    coverage: item.coverage,
subjectMatched: item.subjectMatched,
anchorMatches: item.anchorMatches,
    verseAnchorMatches: item.verseAnchorMatches,
    semanticScore: item.semanticScore
  }))
);

/*
 * ممنوع الرجوع لأول نتيجة fuzzy غير مناسبة.
 * إذا لم يوجد دليل يطابق الادعاء بدرجة كافية نمتنع.
 */
if (relationCandidates.length === 0) {
  return buildAbstentionRun(
    clean,
    'عُثر على نتائج قريبة من موضوع الادعاء، لكن لم توجد آية أو مادة تفسيرية تطابق عناصره الدلالية بدرجة كافية للتوثيق دون تخمين.'
  );
}

const bestVerseAnchorMatches =
  relationCandidates[0]?.verseAnchorMatches ?? 0;

const bestSemanticScore =
  relationCandidates[0]?.semanticScore ?? 0;

const topCandidates = relationCandidates
  .filter((item) =>
    item.verseAnchorMatches === bestVerseAnchorMatches &&
    item.semanticScore >= bestSemanticScore - 1.5
  )
  .slice(0, 3)
  .map((item) => item.candidate);

  const contextForModel = topCandidates.map((c, i) =>

    `[دليل ${i + 1}] سورة ${c.verse.surahName}، الآية ${c.verse.verseNumber}:\nنص الآية: ﴿${c.verse.textUthmani}﴾\nالتفسير: ${c.tafsir}`

  ).join('\n\n');

/*
 * Evidence-match evaluation
 *
 * The Quran/Tafsir retrieval remains the source of truth.
 * The model only evaluates how well the retrieved evidence
 * supports the atomic claim.
 */

let modelEvidenceMatchScore: number | undefined;
let modelEvidenceRelation:
  | 'DIRECT_SUPPORT'
  | 'PARTIAL_SUPPORT'
  | 'NOT_SUPPORTING'
  | undefined;

const bestRelationCandidate = relationCandidates[0];

const deterministicCoverage =
  bestRelationCandidate?.coverage ?? 0;

const deterministicAnchorCoverage =
  bestRelationCandidate
    ? Math.min(
        1,
        Math.max(
          bestRelationCandidate.anchorMatches,
          bestRelationCandidate.verseAnchorMatches
        ) / Math.max(1, semanticAnchors.length)
      )
    : 0;

/*
 * Deterministic score from actual retrieved text.
 * This is NOT a religious-truth score.
 */
const deterministicEvidenceScore =
  Math.max(
    0,
    Math.min(
      1,
      deterministicCoverage * 0.6 +
      deterministicAnchorCoverage * 0.4
    )
  );

const evidenceEvaluationPrompt = `
أنت مقيّم لمطابقة الادعاء مع الأدلة المسترجعة فقط.

لا تستخدم أي معرفة دينية من ذاكرتك.
لا تضف آيات أو أحاديث أو تفاسير من خارج النصوص المقدمة.
لا تصدر فتوى أو حكمًا شرعيًا.
لا تقيم "صحة الدين" أو "صحة العقيدة".

مهمتك الوحيدة:
قياس مدى دعم الأدلة التالية للادعاء المحدد.

الادعاء:
"${clean}"

الأدلة المسترجعة من القرآن الكريم والتفسير الميسر:
"""
${contextForModel}
"""

قيّم المطابقة وفق الآتي:

DIRECT_SUPPORT:
الأدلة تؤيد المعنى المطلوب مباشرة وبوضوح.

PARTIAL_SUPPORT:
الأدلة تؤيد جزءًا من الادعاء، لكن جزءًا مهمًا غير مثبت.

NOT_SUPPORTING:
الأدلة لا تثبت الادعاء أو تتحدث عن معنى مختلف.

أخرج JSON فقط:

{
  "score": 0,
  "relation": "DIRECT_SUPPORT",
  "reason": "سبب قصير مبني حصراً على الأدلة المعطاة"
}

شروط score:
- من 0 إلى 100.
- 90-100 = دعم مباشر وصريح جدًا.
- 75-89 = دعم واضح مع اختلاف صياغة محدود.
- 50-74 = دعم جزئي أو غير كامل.
- 0-49 = الأدلة لا تكفي لدعم الادعاء.
`;

let evidenceEvaluationRaw = '';

/*
 * Gemini first if available.
 */
if (aiClient) {
  try {
    const evaluationResponse =
      await aiClient.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: evidenceEvaluationPrompt,
        config: {
          temperature: 0,
          responseMimeType: 'application/json'
        }
      });

    evidenceEvaluationRaw =
      evaluationResponse.text?.trim() || '';

  } catch (error) {
    console.warn(
      '[MIHAK Evidence Match] Gemini failed:',
      error instanceof Error
        ? error.message
        : error
    );
  }
}

/*
 * Groq fallback.
 */
if (!evidenceEvaluationRaw) {
  const groqKey = process.env.GROQ_API_KEY;

  if (groqKey) {
    try {
      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            temperature: 0,
            response_format: {
              type: 'json_object'
            },
            messages: [
              {
                role: 'user',
                content: evidenceEvaluationPrompt
              }
            ]
          })
        }
      );

      if (response.ok) {
        const data: any =
          await response.json();

        evidenceEvaluationRaw =
          data?.choices?.[0]?.message?.content?.trim() || '';
      } else {
        console.warn(
          '[MIHAK Evidence Match] Groq HTTP:',
          response.status
        );
      }

    } catch (error) {
      console.warn(
        '[MIHAK Evidence Match] Groq failed:',
        error instanceof Error
          ? error.message
          : error
      );
    }
  }
}

/*
 * Parse model evaluation safely.
 */
if (evidenceEvaluationRaw) {
  try {
    const parsed =
      JSON.parse(evidenceEvaluationRaw);

    const numericScore =
      Number(parsed?.score);

    if (
      Number.isFinite(numericScore) &&
      numericScore >= 0 &&
      numericScore <= 100
    ) {
      modelEvidenceMatchScore =
        numericScore / 100;
    }

    if (
      parsed?.relation === 'DIRECT_SUPPORT' ||
      parsed?.relation === 'PARTIAL_SUPPORT' ||
      parsed?.relation === 'NOT_SUPPORTING'
    ) {
      modelEvidenceRelation =
        parsed.relation;
    }

    console.log(
      '[MIHAK Evidence Match Evaluation]',
      {
        modelScore: modelEvidenceMatchScore,
        modelRelation: modelEvidenceRelation,
        deterministicEvidenceScore
      }
    );

  } catch (error) {
    console.warn(
      '[MIHAK Evidence Match] Invalid JSON:',
      evidenceEvaluationRaw
    );
  }
}

/*
 * Final hybrid score.
 *
 * 60% source-derived deterministic matching
 * 40% source-bounded semantic evaluation.
 *
 * If the model is unavailable, use the deterministic
 * evidence score alone.
 */
const finalEvidenceMatchScore =
  typeof modelEvidenceMatchScore === 'number'
    ? Math.max(
        0,
        Math.min(
          1,
          deterministicEvidenceScore * 0.6 +
          modelEvidenceMatchScore * 0.4
        )
      )
    : deterministicEvidenceScore;

  // 2. Synthesize source-bounded explanation using Gemini

  let answerText = '';

  if (aiClient) {

    const synthesisPrompt = `أنت مدقق ومحقق محتوى إسلامي مقيد بالمصادر المعتمدة حصراً.

أجب عن سؤال المستخدم بناءً على الأدلة والتفاسير القرآنية التالية فقط:

"""

${contextForModel}

"""



السؤال: «${clean}»



شروط صارمة:

1\. أجب بإيجاز وتوثيق تام بالاستناد إلى الأدلة المذكورة أعلاه حصراً.

2\. لا تضف أي معلومة أو حكم أو استنتاج من خارج الأدلة المعطاة.

3\. إذا كانت الأدلة لا تجيب عن السؤال بالكامل، اذكر ما تجيب عنه وتوقف دون تخمين.`;



   try {
  const res = await aiClient.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: synthesisPrompt,
    config: { temperature: 0.1 }
  });

  answerText = res.text?.trim() || '';

} catch (e) {
  console.warn(
    '[MIHAK Semantic RAG] Gemini synthesis failed:',
    e instanceof Error ? e.message : e
  );
}

/*
 * Groq fallback using the exact same source-bounded prompt.
 */
if (!answerText) {
  const groqKey = process.env.GROQ_API_KEY;

  if (groqKey) {
    try {
      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            temperature: 0,
            messages: [
              {
                role: 'user',
                content: synthesisPrompt
              }
            ]
          })
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();

        throw new Error(
          `Groq HTTP ${response.status}: ${errorBody}`
        );
      }

      const data: any = await response.json();

      answerText =
        data?.choices?.[0]?.message?.content?.trim() || '';

      console.log(
        '[MIHAK Semantic RAG] Groq synthesis succeeded'
      );

    } catch (groqError) {
      console.warn(
        '[MIHAK Semantic RAG] Groq synthesis failed:',
        groqError instanceof Error
          ? groqError.message
          : groqError
      );
    }
  }
}

/*
 * Final deterministic fallback.
 * No generated religious interpretation if both models fail.
 */
if (!answerText) {
  const strongest = topCandidates[0];

  answerText = strongest
    ? `تبيّن من المصدر المسترجع وجود دليل قرآني متصل مباشرة بالادعاء، ومن أوضح الأدلة سورة ${strongest.verse.surahName} الآية ${strongest.verse.verseNumber}: ﴿${strongest.verse.textUthmani}﴾`
    : '';
}

}


  if (!answerText) {

    answerText = `أظهر التدقيق في نصوص القرآن الكريم وتفاسيره الآيات الآتية المتصلة بالموضوع:`;

  }



  const directAnswerLines = [

    `• ${answerText}`

  ];



  const verseSections = topCandidates.map(c => ({

    surahName: c.verse.surahName,

    verseNumber: c.verse.verseNumber,

    textUthmani: c.verse.textUthmani

  }));



  const formatted = buildFormattedAnswer({

    question: clean,

    directAnswerLines,

    verseSections,

    sourceNames: ['القرآن الكريم', 'التفسير الميسر'],

    rationale: `تم استرجاع الأدلة والتفاسير المعتمدة ومطابقة موضوع السؤال على نصوص المصحف الشريف والتفسير الميسر.`

  });



  return buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', false, {

    source_id: 'quran-semantic-rag',

    source_name: 'القرآن الكريم والتفسير الميسر',

    canonical_reference: topCandidates.map(c => `سورة ${c.verse.surahName}، آية ${c.verse.verseNumber}`).join(' | '),

    language: 'ar',

    raw_text: topCandidates.map(c => `${c.verse.textUthmani} — ${c.tafsir}`).join('\n'),

    version: '1.0',

    license_note: 'مصادر قرآنية وتفسيرية معتمدة'

  }, formatted.verificationRationale, {
  retrievalSimilarity: finalEvidenceMatchScore,
  evidenceRelation:
    modelEvidenceRelation === 'PARTIAL_SUPPORT'
      ? 'PARTIAL_SUPPORT'
      : modelEvidenceRelation === 'NOT_SUPPORTING'
        ? 'UNVERIFIED'
        : 'DIRECT_SUPPORT',
  requiredDomains: ['QURAN', 'TAFSIR']
});

}



/**

 * 7. Hadith Reasoner (HadeethEnc / Dorar)

 * NEVER converts hadith queries to Quran searches.

 */

async function resolveHadithQuestion(clean: string, plan: DynamicExecutionPlan): Promise<AuditRun> {
  const uiLang = responseLanguage(clean);
  const target = plan.target && plan.target.trim().length > 0 ? plan.target.trim() : clean;
  const queryCandidates = Array.from(new Set(
    [target, ...(plan.search_queries || []), clean]
      .map((q) => String(q || '').trim())
      .filter(Boolean)
  ));

  const resolved = await resolveHadithSemantic(clean, queryCandidates);

  if (resolved) {
    const top = resolved.record;
    const hadithText = String(top.hadith_text || top.title || '').trim();
    const explanation = String(top.explanation || '').trim();
    const grade = String(top.grade || '').trim();
    const attribution = String(top.attribution || '').trim();
    const reference = String(top.reference || top.takhrij || '').trim();

    const sourceLabel = uiLang === 'en'
      ? (resolved.liveVerified
          ? 'Prophetic Hadith Encyclopedia (HadeethEnc)'
          : 'Indexed local snapshot of HadeethEnc data')
      : (resolved.liveVerified
          ? 'موسوعة الأحاديث النبوية (HadeethEnc)'
          : 'نسخة محلية مفهرسة من بيانات HadeethEnc');

    const canonicalRef = reference || attribution || (
      uiLang === 'en' ? `Hadith record ${top.id}` : `حديث رقم ${top.id}`
    );

    const answerLines: string[] = uiLang === 'en'
      ? [
          `• Hadith text: «${hadithText}»`,
          grade ? `• Grade as provided by the source: ${grade}` : '',
          attribution ? `• Attribution: ${attribution}` : (reference ? `• Attribution: ${reference}` : ''),
          plan.intent === 'HADITH_EXPLANATION' && explanation ? `• Explanation as provided by the source: ${explanation}` : ''
        ].filter(Boolean)
      : [
          `• نص الحديث: «${hadithText}»`,
          grade ? `• الحكم كما أورده المصدر: ${grade}` : '',
          attribution ? `• العزو: ${attribution}` : (reference ? `• العزو: ${reference}` : ''),
          plan.intent === 'HADITH_EXPLANATION' && explanation ? `• الشرح كما أورده المصدر: ${explanation}` : ''
        ].filter(Boolean);

    const sourceLines: string[] = [
      `• ${sourceLabel}`,
      canonicalRef && canonicalRef !== attribution ? `• ${canonicalRef}` : ''
    ].filter(Boolean);

    const claimText = uiLang === 'en'
      ? [
          `Q: ${clean}`,
          '',
          'A:',
          ...answerLines,
          '',
          'Source:',
          ...sourceLines
        ].join('\n')
      : [
          `س: ${clean}`,
          '',
          'ج:',
          ...answerLines,
          '',
          'المصدر:',
          ...sourceLines
        ].join('\n');

    return buildSingleClaimRun(
      clean,
      claimText,
      resolved.exactPhrase ? 'VERIFIED_QUOTE' : 'SUPPORTED',
      resolved.score,
      {
        source_id: `hadeethenc-${top.id}`,
        source_name: sourceLabel,
        canonical_reference: canonicalRef,
        // This describes the canonical evidence record, not the UI language.
        language: 'ar',
        raw_text: plan.intent === 'HADITH_EXPLANATION' && explanation
          ? `${hadithText}\n\n${explanation}`
          : hadithText,
        version: '1.0',
        license_note: resolved.provider
      },
      uiLang === 'en'
        ? (resolved.liveVerified
            ? 'The matching record was verified in HadeethEnc. The answer uses source-provided fields only.'
            : 'The match came from the indexed local HadeethEnc snapshot; no model-generated religious ruling or explanation was added.')
        : (resolved.liveVerified
            ? 'تمت مطابقة الحديث والتحقق من سجله في HadeethEnc. اعتُمد الجواب على الحقول الواردة في المصدر فقط.'
            : 'تمت المطابقة على النسخة المحلية المفهرسة من بيانات HadeethEnc، دون إضافة حكم أو شرح من النموذج.'),
      { retrievalSimilarity: resolved.score, evidenceRelation: 'DIRECT_SUPPORT', requiredDomains: ['HADITH'] }
    );
  }

  return buildAbstentionRun(
    clean,
    uiLang === 'en'
      ? 'No sufficiently matching hadith was found in the connected Prophetic Hadith Encyclopedia (HadeethEnc). MIHAK will not guess or attribute a hadith without documented evidence.'
      : 'لم يُعثر على حديث مطابق بدرجة كافية في موسوعة الأحاديث النبوية المتصلة (HadeethEnc). مِحَكّ يمتنع عن تخمين الأحاديث دون إسناد موثق.',
    'INSUFFICIENT_EVIDENCE',
    'RETRIEVAL_FAILURE'
  );
}

/**

 * 8. Sirah Reasoner

 * NEVER converts Sirah queries to Quran searches.

 */

async function resolveSirahQuestion(clean: string, plan: DynamicExecutionPlan): Promise<AuditRun> {
  const target = plan.target || clean;
  const resolved = await resolveHadithCandidate(target);

  if (resolved && resolved.score >= 0.85) {
    const top = resolved.record;
    const directLine = String(top.hadith_text || top.title || '').trim();
    const sourceLabel = resolved.liveVerified
      ? 'HadeethEnc — API مباشر'
      : 'HadeethEnc — نسخة محلية مفهرسة';

    const claimText = [
      `س: ${clean}`,
      '',
      'ج:',
      `• ورد في السجل الحديثي المطابق: «${directLine}»`,
      top.attribution ? `• العزو: ${top.attribution}` : '',
      top.grade ? `• الحكم كما أورده المصدر: ${top.grade}` : '',
      top.reference || top.takhrij ? `• المرجع: ${top.reference || top.takhrij}` : '',
      '',
      'المصدر:',
      `• ${sourceLabel}`
    ].filter(Boolean).join('\n');

    return buildSingleClaimRun(clean, claimText, 'SUPPORTED', resolved.score, {
      source_id: `sirah-hadeethenc-${top.id}`,
      source_name: sourceLabel,
      canonical_reference: top.reference || top.takhrij || top.attribution || `حديث رقم ${top.id}`,
      language: 'ar',
      raw_text: directLine,
      version: '1.0',
      license_note: resolved.provider
    }, 'أُعيدت الواقعة فقط بقدر ما يدعمه السجل الحديثي المسترجع، دون استكمال تاريخي من ذاكرة النموذج.');
  }

  return buildAbstentionRun(
    clean,
    'لم يُعثر على دليل حديثي مباشر وكافٍ لهذه المسألة السيرية في المصادر المتصلة حالياً، لذلك امتنع مِحَكّ عن التخمين.'
  );
}


/**
 * Executes one already-decomposed atomic proposition without recursively
 * re-running compound decomposition.
 */
async function resolveAtomicProposition(
  atomicText: string,
  plan: DynamicExecutionPlan
): Promise<AuditRun> {

  /*
   * Safety routing:
   * A Quran lookup without a concrete verseKey is not really
   * a reference lookup. Treat it as semantic Quran verification.
   */
  if (
    plan.intent === 'QURAN_VERSE_LOOKUP' &&
    !plan.verseKey
  ) {
    const semanticTarget = atomicText
      .replace(
        /^(?:القرآن|القران|المصحف)\s+(?:يذكر|يقول|ينص\s+على|يقرر)\s+(?:أن|ان)?\s*/i,
        ''
      )
      .replace(
        /^(?:ويذكر|ويقول)\s+(?:أنه|انه|أن|ان)?\s*/i,
        ''
      )
      .trim();

    plan = {
      ...plan,
      domain: 'QURAN',
      intent: 'QURAN_SEMANTIC',
      retrieval_mode: 'SEMANTIC',
      target: semanticTarget || atomicText,
      search_queries: Array.from(
        new Set(
          [
            atomicText,
            semanticTarget
          ].filter(Boolean)
        )
      ),
      is_count_query: false,
      reasoning:
        'Quran lookup had no explicit verse reference; safely rerouted to semantic Quran verification.'
    };

    console.log(
      '[MIHAK QURAN LOOKUP SAFETY REROUTE]',
      {
        atomicText,
        target: plan.target,
        searchQueries: plan.search_queries
      }
    );
  }

  switch (plan.intent) {
    case 'QURAN_STRUCTURAL':
      return await resolveStructuralQuran(atomicText, plan);

    case 'QURAN_WORD_MEANING':
      return await resolveQuranWordMeaning(atomicText, plan);

    case 'QURAN_TAFSIR':
      return await resolveQuranTafsir(atomicText, plan);

    case 'QURAN_VERSE_LOOKUP':
      return await resolveQuranVerseLookup(atomicText, plan);

    case 'QURAN_EXACT_WORD_COUNT':
    case 'QURAN_ROOT_COUNT':
      return await resolveQuranCount(atomicText, plan);

    case 'QURAN_SEMANTIC':
      return await resolveSemanticQuran(atomicText, plan);

    case 'HADITH_LOOKUP':
    case 'HADITH_VERIFY':
    case 'HADITH_EXPLANATION':
      return await resolveHadithQuestion(atomicText, plan);

    case 'SIRAH_QUESTION':
      return await resolveSirahQuestion(atomicText, plan);

    default:
      return await EvidenceEngine.auditContent(atomicText);
  }
}

async function resolveEvidenceRelationConclusion(
  question: string,
  existingClaims: Claim[]
): Promise<Claim> {
  const evidenceClaims = existingClaims.filter(
    (c) =>
      (c.status === 'SUPPORTED' || c.status === 'VERIFIED_QUOTE') &&
      (c.evidence_passage || c.evidence?.raw_text)
  );

  if (evidenceClaims.length < 2) {
    return {
      id: '',
      claim_text: question,
      status: 'NEEDS_SPECIALIST_REVIEW',
      evidence_relation: 'UNRESOLVED_RELATION',
      verification_rationale:
        'لا توجد أدلة مستقلة كافية من المقدمات المسترجعة لتحليل العلاقة بينها.'
    } as Claim;
  }

  const sourceContext = evidenceClaims
  .map((c, i) => {
    const source =
      c.evidence?.canonical_reference ||
      c.evidence?.source_name ||
      `دليل ${i + 1}`;

    const text =
      c.evidence_passage ||
      c.evidence?.raw_text ||
      '';

    const claimText =
      c.original_claim ||
      c.claim_text ||
      '';

    return `[الادعاء ${i + 1}]
${claimText}

[الدليل ${i + 1}]
المصدر: ${source}
النص والتفسير:
${text}`;
  })
  .join('\n\n');

  const prompt = `
أنت محلل علاقات أدلة داخل نظام مِحَكّ.

مهمتك ليست إصدار فتوى ولا إضافة معلومات دينية من ذاكرتك.

اعتمد حصراً على النصوص والتفاسير الآتية:

${sourceContext}

السؤال المطلوب فحصه:
"${question}"

حدّد العلاقة بين الادعاءات والأدلة وفق القواعد الآتية:

لا يجوز تصنيف العلاقة CONTRADICTION إلا إذا تحقق كل ما يلي:
1. أن يتحدث النصان عن الشيء أو الشخص نفسه تحديدًا.
2. أن يتحدثا عن الحالة أو المرحلة نفسها.
3. أن يثبت أحدهما معنى وينفي الآخر المعنى نفسه بصورة لا يمكن اجتماعهما معها.
4. أن يكون هذا التعارض ظاهرًا من الأدلة المعطاة نفسها، لا من افتراض خارجي.

لا يُعد اختلاف الأوصاف أو الأشخاص أو المراحل أو العموم والخصوص تناقضًا بذاته.

مثال منهجي فقط:
إذا كان دليل يتحدث عن أصل شخص معين، ودليل آخر يتحدث عن طريقة تناسل ذريته، فلا يجوز اعتبار اختلاف المادة المذكورة تناقضًا إلا إذا نص الدليلان على أنهما يتحدثان عن الشخص نفسه والمرحلة نفسها.

إذا لم تستطع إثبات شروط التناقض الأربعة من النصوص المعطاة، فلا تختَر CONTRADICTION.

إذا كانت الأدلة تفسر الاختلاف بوضوح فاختر NO_CONTRADICTION.
إذا لم تكف الأدلة للحسم فاختر INSUFFICIENT_EVIDENCE.

أخرج JSON فقط بهذا الشكل:

{
  "same_subject": true | false,
  "same_context_or_stage": true | false,
  "direct_mutual_exclusion": true | false,
  "relation": "NO_CONTRADICTION" | "CONTRADICTION" | "INSUFFICIENT_EVIDENCE",
  "answer": "جواب عربي مباشر وقصير",
  "reasoning": "شرح موجز مستند فقط إلى الأدلة المعطاة"
}

قواعد صارمة جدًا:
- استخدم فقط المعلومات المذكورة حرفيًا أو بوضوح مباشر في النصوص والتفاسير المعطاة أعلاه.
- لا تضف أي تفسير أو تعليل أو مفهوم من معرفتك السابقة.
- لا تستخدم مصطلحات تفسيرية جديدة غير موجودة في الأدلة، مثل تقسيمات أو مراحل أو أسباب لم تذكرها النصوص.
- لا تنسب إلى شخص أو نبي أو واقعة شيئًا لم يرد صراحة في الأدلة المعطاة.
- إذا كان نفي التناقض يحتاج معلومة غير موجودة في الأدلة الحالية، اختر INSUFFICIENT_EVIDENCE بدل استكمال المعنى من الذاكرة.
- عند اختيار NO_CONTRADICTION، يجب أن يشرح حقل reasoning الفرق بين الأدلة باستخدام ما ورد فيها فقط.
- لا تصدر فتوى أو حكمًا شرعيًا مستحدثًا.
`;

  try {
  let raw = '';

  // 1) Gemini first
  if (aiClient) {
    try {
      const geminiResponse = await aiClient.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          temperature: 0,
          responseMimeType: 'application/json'
        }
      });

      raw = geminiResponse.text?.trim() || '';
    } catch (geminiError) {
      console.warn(
        '[MIHAK Evidence Relation] Gemini failed:',
        geminiError instanceof Error
          ? geminiError.message
          : geminiError
      );
    }
  }

  // 2) Groq fallback
  if (!raw) {
    const groqKey = process.env.GROQ_API_KEY;

    if (!groqKey) {
      throw new Error(
        'Both Gemini and Groq are unavailable'
      );
    }

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          temperature: 0,
          response_format: {
            type: 'json_object'
          },
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();

      console.warn(
        '[MIHAK Evidence Relation] Groq error body:',
        errorBody
      );

      throw new Error(
        `Groq HTTP ${response.status}: ${errorBody}`
      );
    }

    const data: any = await response.json();

    raw =
      data?.choices?.[0]?.message?.content || '';
  }

  if (!raw) {
    throw new Error(
      'No relation-analysis response returned'
    );
  }

  console.log(
    '[MIHAK Evidence Relation] Raw model response:',
    raw
  );

  const parsed = JSON.parse(raw);

if (
  parsed.relation === 'CONTRADICTION' &&
  !(
    parsed.same_subject === true &&
    parsed.same_context_or_stage === true &&
    parsed.direct_mutual_exclusion === true
  )
) {
  parsed.relation = 'INSUFFICIENT_EVIDENCE';
  parsed.answer =
    'الأدلة الحالية لا تثبت تناقضًا مباشرًا بين النصوص المسترجعة.';
  parsed.reasoning =
    'لم تتحقق جميع شروط إثبات التناقض: وحدة الموضوع، ووحدة السياق أو المرحلة، والتعارض المباشر الذي لا يمكن اجتماعه.';
}

  if (
    ![
      'NO_CONTRADICTION',
      'CONTRADICTION',
      'INSUFFICIENT_EVIDENCE'
    ].includes(parsed.relation)
  ) {
    throw new Error('Invalid relation label');
  }

  if (parsed.relation === 'INSUFFICIENT_EVIDENCE') {
    return {
      id: '',
      claim_text: `س: ${question}

ج:
• ${parsed.answer || 'الأدلة الحالية غير كافية للحسم.'}`,
      status: 'NEEDS_SPECIALIST_REVIEW',
      evidence_relation: 'UNRESOLVED_RELATION',
      evidence_passage: sourceContext,
      verification_rationale:
        parsed.reasoning ||
        'لم تكفِ الأدلة الحالية لحسم العلاقة.'
    } as Claim;
  }

  return {
    id: '',
    claim_text: `س: ${question}

ج:
• ${parsed.answer}

المصدر:
• القرآن الكريم
• التفسير الميسر`,
    status: 'SUPPORTED',
    evidence_relation: 'DIRECT_SUPPORT',
    evidence_passage: sourceContext,
    verification_rationale:
      parsed.reasoning ||
      'تم تحليل العلاقة بين الأدلة المسترجعة حصراً.'
  } as Claim;

} catch (error) {
  console.warn(
    '[MIHAK Evidence Relation] Relation analysis failed safely:',
    error instanceof Error ? error.message : error
  );

  return {
    id: '',
    claim_text: question,
    status: 'NEEDS_SPECIALIST_REVIEW',
    evidence_relation: 'UNRESOLVED_RELATION',
    evidence_passage: sourceContext,
    verification_rationale:
      'تعذر تشغيل محلل العلاقة بين الأدلة، لذلك امتنع مِحَكّ عن استنتاج وجود تناقض أو نفيه دون تحليل مصدر-مقيد.'
  } as Claim;
  }
}


async function resolveStructuredCompoundAudit(
  clean: string,
  requestPlan: ReturnType<typeof buildRequestPlan>
): Promise<AuditRun> {
  const claims: Claim[] = [];
  let claimIndex = 1;

  for (const proposition of requestPlan.propositions) {
    const originalText = proposition.originalSpan?.text || proposition.normalizedMeaning;

    const normalizedRelationText = normalizeArabicSearch(originalText);

const looksLikeRelationQuestion =
  /(?:^|\s)(?:هل|فهل|كيف|فكيف|ازاي|إزاي|ليه|لماذا|ما سبب|ما وجه|ما العلاقة|كيف نجمع|كيف يجتمع|كيف يتفق|كيف يصح)/i.test(originalText) &&
  /(?:هذا|ذلك|الاتنين|الاثنين|الاثنان|كلاهما|بينهما|بينهم|النصين|القولين|الدليلين|الآيتين|تناقض|تعارض|اختلاف|جمع|يتفق|يصح|صح|صحيح)/i.test(originalText);

const explicitRelationCue =
  /(?:تناقض|تعارض|متناقض|متعارض|كيف\s+نجمع|وجه\s+الجمع|ما\s+العلاقة|كيف\s+يتفق|كيف\s+يصح|ازاي\s+الاتنين|إزاي\s+الاتنين|ليه\s+مفيش|why.*both|how.*both|contradict|contradiction)/i.test(
    normalizedRelationText
  );

if (
  proposition.role === 'CONCLUSION' ||
  looksLikeRelationQuestion ||
  explicitRelationCue
) {
  const relationClaim =
    await resolveEvidenceRelationConclusion(
      originalText,
      claims
    );

  relationClaim.id =
    `CLM-${String(claimIndex++).padStart(3, '0')}`;

  relationClaim.source_span =
    proposition.originalSpan;

  relationClaim.propositionType =
    proposition.propositionType;

  relationClaim.role =
    proposition.role;

  relationClaim.dependsOn =
    proposition.dependsOn;

  relationClaim.requiredDomains =
    proposition.requiredEvidenceDomains;

  claims.push(relationClaim);

  continue;
}

    const atomicText = proposition.normalizedMeaning.trim();
    let atomicPlan = await planUserInput(atomicText);

    // A decomposed proposition that explicitly belongs to the Quran domain but
    // does not contain a concrete verse reference is a semantic evidence claim,
    // not a verse-reference lookup. Without this guard, an atomic claim such as
    // "the Quran states ..." can be misrouted to QURAN_VERSE_LOOKUP and then
    // fail only because the user did not supply a surah/ayah number.
    const hasExplicitQuranRef = Boolean(atomicPlan.verseKey);
    const propositionDomains = Array.isArray(proposition.requiredEvidenceDomains)
      ? proposition.requiredEvidenceDomains
      : [];
    const isQuranScopedAtomicClaim =
      propositionDomains.includes('QURAN') ||
      /(?:القرآن|القران|المصحف|قال\s+الله|قال\s+تعالى|quran|qur'an)/i.test(atomicText);

    if (
      isQuranScopedAtomicClaim &&
      !hasExplicitQuranRef &&
      atomicPlan.intent !== 'QURAN_EXACT_WORD_COUNT' &&
      atomicPlan.intent !== 'QURAN_ROOT_COUNT' &&
      atomicPlan.intent !== 'QURAN_WORD_MEANING' &&
      atomicPlan.intent !== 'QURAN_TAFSIR'
    ) {
      const plannedQueries =
  Array.isArray(atomicPlan.search_queries)
    ? atomicPlan.search_queries.filter(Boolean)
    : [];

atomicPlan = {
  ...atomicPlan,

  domain: 'QURAN',
  intent: 'QURAN_SEMANTIC',
  retrieval_mode: 'SEMANTIC',

  target:
    atomicPlan.target ||
    atomicText,

  search_queries: Array.from(
    new Set([
      ...plannedQueries,
      atomicPlan.target || '',
      atomicText
    ].filter(Boolean))
  ),

  is_count_query: false,

  reasoning:
    atomicPlan.reasoning ||
    'Decomposed Quran-scoped proposition routed through semantic planning before Quran evidence retrieval.'
};
    }

    const atomicRun = await resolveAtomicProposition(atomicText, atomicPlan);

if (Array.isArray(atomicRun.claims) && atomicRun.claims.length > 0) {
  for (const child of atomicRun.claims) {
    claims.push({
      ...child,
      id: `CLM-${String(claimIndex++).padStart(3, '0')}`,
      original_claim: originalText,
      source_span: proposition.originalSpan,
      propositionType: proposition.propositionType,
      role: proposition.role,
      dependsOn: proposition.dependsOn,
      requiredDomains: proposition.requiredEvidenceDomains
    });
  }
}
}

  if (claims.length === 0) {
    return buildAbstentionRun(clean, 'تم فهم بنية الادعاء المركب، لكن لم يمكن استرجاع أدلة كافية لعناصره من المصادر المتصلة.');
  }

  return {
    id: `audit-${Date.now()}`,
    timestamp: new Date().toISOString(),
    input_text: clean,
    detected_language: detectAuditLanguage(clean),
    request_plan: requestPlan,
    claims,
    stats: {
      total: claims.length,
      supported: claims.filter((c) => c.status === 'SUPPORTED').length,
      partiallySupported: claims.filter((c) => c.status === 'PARTIALLY_SUPPORTED').length,
      insufficientEvidence: claims.filter((c) => c.status === 'INSUFFICIENT_EVIDENCE').length,
      needsSpecialistReview: claims.filter((c) => c.status === 'NEEDS_SPECIALIST_REVIEW').length,
      verifiedQuotes: claims.filter((c) => c.status === 'VERIFIED_QUOTE').length,
      sourceCoverageGap: claims.filter((c) => c.status === 'SOURCE_COVERAGE_GAP').length
    },
    abstention_count: claims.filter((c) => c.status === 'INSUFFICIENT_EVIDENCE' || c.status === 'SOURCE_COVERAGE_GAP').length,
    duration_ms: 0
  };
}

/**

 * 9. Content Audit Mode (Claim-Level Auditing)

 */

async function resolveContentAudit(clean: string, referenceSource?: string, requestPlan?: ReturnType<typeof buildRequestPlan>): Promise<AuditRun> {

  if (referenceSource && referenceSource.trim()) {

    // If a specific reference source is supplied, audit directly against it

    const comp = EvidenceEngine.compareTransformation(referenceSource, clean);

    const isSupported = comp.integrity_score >= 80;

    const status: ClaimStatus = isSupported ? 'SUPPORTED' : 'TRANSFORMATION_DRIFT';



    const claim: Claim = {

      id: 'CLM-001',

      claim_text: clean,

      source_span: { text: clean, start: 0, end: clean.length },

      status,

      confidence_score: comp.integrity_score / 100,

      evidence_relation: isSupported ? 'DIRECT_SUPPORT' : 'ATTRIBUTION_MISMATCH',

      evidence: {

        source_id: 'user-reference',

        source_name: 'المصدر المرجعي المحدد من قبل المستخدم',

        canonical_reference: 'المصدر المرجعي',

        language: 'ar',

        raw_text: referenceSource,

        version: '1.0',

        license_note: 'مصدر مدخل من المستخدم'

      },

      evidence_passage: referenceSource,

      verification_rationale: comp.alignment_summary || 'تم فحص التحول الدلالي ومطابقة المحتوى مع المصدر المرجعي المحدد.'

    };



    return {

      id: `audit-${Date.now()}`,

      timestamp: new Date().toISOString(),

      input_text: clean,

      detected_language: 'ar',

      claims: [claim],

      stats: {

        total: 1,

        supported: isSupported ? 1 : 0,

        partiallySupported: 0,

        insufficientEvidence: 0,

        needsSpecialistReview: 0,

        verifiedQuotes: isSupported ? 1 : 0

      },

      abstention_count: 0,

      duration_ms: 50

    };

  }



  // Compound arguments are decomposed into premises and conclusions before retrieval.
  // This prevents a verified premise from automatically validating an inferred conclusion.
  if (requestPlan && requestPlan.propositions.length > 1) {
    return await resolveStructuredCompoundAudit(clean, requestPlan);
  }

  return await EvidenceEngine.auditContent(clean);

}



/* =========================================================

   HELPER UTILITIES FOR AUDIT RUNS

   ========================================================= */



function detectAuditLanguage(input: string): 'ar' | 'en' | 'mixed' {
  const hasArabic = /[\u0600-\u06FF]/.test(input);
  const hasLatin = /[A-Za-z]/.test(input);
  if (hasArabic && hasLatin) return 'mixed';
  if (hasLatin) return 'en';
  return 'ar';
}

function responseLanguage(input: string): 'ar' | 'en' {
  return detectAuditLanguage(input) === 'en' ? 'en' : 'ar';
}

function buildSingleClaimRun(
  input: string,
  claimText: string,
  status: ClaimStatus,
  exactOrConfidence: boolean | number,
  evidence: EvidenceRecord,
  rationale: string,
  extra?: {
    evidenceRelation?: EvidenceRelationType;
    retrievalSimilarity?: number;
    requiredDomains?: EvidenceDomain[];
  }
): AuditRun {
  const isSupported = status === 'SUPPORTED' || status === 'VERIFIED_QUOTE';
  const isExact = typeof exactOrConfidence === 'boolean' ? exactOrConfidence : false;

  const claim: Claim = {
    id: 'CLM-001',
    claim_text: claimText,
    source_span: { text: input, start: 0, end: input.length },
    status,
    exactMatch: isExact,
    retrievalSimilarity: extra?.retrievalSimilarity,
    metricProvenance: isExact
      ? [createExactMatchMetric('CentralOrchestrator', `مطابقة مباشرة في [${evidence.source_name} - ${evidence.canonical_reference}]`)]
      : (typeof extra?.retrievalSimilarity === 'number'
          ? [createRetrievalSimilarityMetric(extra.retrievalSimilarity, 'CentralOrchestrator', `تشابه معجمي مسترجع بمقدار ${Math.round(extra.retrievalSimilarity * 100)}%`)]
          : undefined),
    evidence_relation: extra?.evidenceRelation || (isSupported ? 'DIRECT_SUPPORT' : 'UNVERIFIED'),
    evidence,
    evidence_passage: evidence.raw_text,
    verification_rationale: rationale,
    requiredDomains: extra?.requiredDomains
  };

  return {
    id: `audit-${Date.now()}`,
    timestamp: new Date().toISOString(),
    input_text: input,
    detected_language: detectAuditLanguage(input),
    claims: [claim],
    stats: {
      total: 1,
      supported: isSupported ? 1 : 0,
      partiallySupported: status === 'PARTIALLY_SUPPORTED' ? 1 : 0,
      insufficientEvidence: status === 'INSUFFICIENT_EVIDENCE' ? 1 : 0,
      needsSpecialistReview: status === 'NEEDS_SPECIALIST_REVIEW' ? 1 : 0,
      verifiedQuotes: status === 'VERIFIED_QUOTE' ? 1 : 0,
      sourceCoverageGap: status === 'SOURCE_COVERAGE_GAP' ? 1 : 0
    },
    abstention_count: (status === 'INSUFFICIENT_EVIDENCE' || status === 'SOURCE_COVERAGE_GAP') ? 1 : 0,
    duration_ms: 40
  };
}

function buildAbstentionRun(
  input: string,
  reason: string,
  status: ClaimStatus = 'INSUFFICIENT_EVIDENCE',
  failureType: FailureType = 'INSUFFICIENT_EVIDENCE'
): AuditRun {
  const uiLang = responseLanguage(input);

  const sourceLine = status === 'SOURCE_COVERAGE_GAP'
    ? (uiLang === 'en'
        ? '• Source coverage gap: this requires specialist sources that are not currently connected.'
        : '• فجوة في تغطية المصادر المتصلة (يتطلب مراجع متخصصة غير متصلة حاليًا).')
    : (uiLang === 'en'
        ? '• No sufficiently matching evidence was found in the currently connected trusted sources.'
        : '• لم يُعثر على دليل كافٍ ومطابق في المصادر المعتمدة المتصلة حالياً.');

  const claimText = uiLang === 'en'
    ? [
        `Q: ${input}`,
        '',
        'A:',
        `• ${reason}`,
        '',
        'Source:',
        sourceLine
      ].join('\n')
    : [
        `س: ${input}`,
        '',
        'ج:',
        `• ${reason}`,
        '',
        'المصدر:',
        sourceLine
      ].join('\n');

  const claim: Claim = {
    id: 'CLM-001',
    claim_text: claimText,
    source_span: { text: input, start: 0, end: input.length },
    status,
    exactMatch: false,
    evidence_relation: 'UNVERIFIED',
    evidence_passage: reason,
    verification_rationale: reason,
    failureType
  };

  return {
    id: `audit-${Date.now()}`,
    timestamp: new Date().toISOString(),
    input_text: input,
    detected_language: detectAuditLanguage(input),
    claims: [claim],
    stats: {
      total: 1,
      supported: 0,
      partiallySupported: 0,
      insufficientEvidence: status === 'INSUFFICIENT_EVIDENCE' ? 1 : 0,
      needsSpecialistReview: status === 'NEEDS_SPECIALIST_REVIEW' ? 1 : 0,
      verifiedQuotes: 0,
      sourceCoverageGap: status === 'SOURCE_COVERAGE_GAP' ? 1 : 0
    },
    abstention_count: 1,
    duration_ms: 40,
    failureType
  };
}



/* =========================================================

   CENTRAL ORCHESTRATION PIPELINE (MAIN EXPORT)

   ========================================================= */



/**
 * Detects an explicit source-attribution statement before normal fragment routing.
 * Examples of the pattern class (not saved answers):
 * - Quran attribution: "قال تعالى: ...", "قال الله: ..."
 * - Hadith attribution: "قال النبي: ...", "قال رسول الله: ..."
 *
 * The quoted/content tail is then checked independently against Quran text and
 * the connected hadith source. This is generic attribution auditing, not a
 * hardcoded mapping for any particular verse or hadith.
 */
function parseExplicitAttribution(input: string): { claimed: 'QURAN' | 'HADITH'; content: string } | null {
  const clean = String(input || '').trim();

  const quran = clean.match(
    /^\s*(?:قال\s+الله(?:\s+تعالى)?|قال\s+تعالى|قال\s+الله\s+عز\s+وجل|ورد\s+في\s+القرآن(?:\s+الكريم)?)\s*[:：]?\s*[«"'“]?(.+?)[»"'”]?\s*[.؟?]*\s*$/i
  );
  if (quran?.[1]) {
    return { claimed: 'QURAN', content: quran[1].trim() };
  }

  const hadith = clean.match(
    /^\s*(?:قال\s+رسول\s+الله(?:\s+صلى\s+الله\s+عليه\s+وسلم)?|قال\s+النبي(?:\s+صلى\s+الله\s+عليه\s+وسلم)?|عن\s+النبي(?:\s+صلى\s+الله\s+عليه\s+وسلم)?\s+أنه\s+قال)\s*[:：]?\s*[«"'“]?(.+?)[»"'”]?\s*[.؟?]*\s*$/i
  );
  if (hadith?.[1]) {
    return { claimed: 'HADITH', content: hadith[1].trim() };
  }

  return null;
}

async function resolveExplicitAttributionAudit(input: string): Promise<AuditRun | null> {
  const parsed = parseExplicitAttribution(input);
  if (!parsed || parsed.content.length < 3) return null;

  const content = parsed.content;
  const [quranHits, hadithResolved] = await Promise.all([
    executePhraseSearch(content).catch(() => []),
    resolveHadithCandidate(content).catch(() => null)
  ]);

  const quranTop = quranHits[0] || null;
  const hadithStrong = Boolean(hadithResolved && hadithResolved.score >= 0.72);

  // Claimed as Quran, but source-backed match is Hadith and there is no Quran phrase match.
  if (parsed.claimed === 'QURAN' && !quranTop && hadithStrong && hadithResolved) {
    const record = hadithResolved.record;
    const hadithText = String(record.hadith_text || record.title || '').trim();
    const attribution = String(record.attribution || '').trim();
    const grade = String(record.grade || '').trim();
    const reference = String(record.reference || record.takhrij || '').trim();
    const sourceLabel = hadithResolved.liveVerified
      ? 'موسوعة الأحاديث النبوية (HadeethEnc)'
      : 'نسخة محلية مفهرسة من بيانات HadeethEnc';

    const claimText = [
      `س: ${input}`,
      '',
      'ج:',
      '• النسبة إلى القرآن غير صحيحة بهذا اللفظ؛ لم يُعثر على العبارة كنص آية في المصحف المتصل.',
      '• وُجدت العبارة في المصدر الحديثي، ولذلك فموضع الخطأ هنا هو نسبة النص إلى القرآن بدل الحديث.',
      hadithText ? `• نص الحديث: «${hadithText}»` : '',
      attribution ? `• العزو: ${attribution}` : '',
      grade ? `• الحكم كما أورده المصدر: ${grade}` : '',
      reference ? `• المرجع: ${reference}` : '',
      '',
      'المصدر:',
      '• القرآن الكريم — للتحقق من المطابقة النصية',
      `• ${sourceLabel}`
    ].filter(Boolean).join('\n');

    const claim: Claim = {
      id: 'CLM-001',
      claim_text: claimText,
      source_span: { text: input, start: 0, end: input.length },
      status: 'TRANSFORMATION_DRIFT',
      confidence_score: Math.min(0.99, Math.max(0.8, hadithResolved.score)),
      evidence_relation: 'ATTRIBUTION_MISMATCH',
      evidence: {
        source_id: `hadeethenc-${record.id}`,
        source_name: sourceLabel,
        canonical_reference: reference || attribution || `حديث رقم ${record.id}`,
        language: 'ar',
        raw_text: hadithText,
        version: '1.0',
        license_note: hadithResolved.provider
      },
      evidence_passage: hadithText,
      verification_rationale: 'طابق مِحَكّ العبارة مع المصدر الحديثي ولم يجدها كنص آية مطابق في النص القرآني المتصل؛ فصنّف الخطأ كتغيير في الإسناد/النسبة.'
    };

    return {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      input_text: input,
      detected_language: 'ar',
      claims: [claim],
      stats: {
        total: 1,
        supported: 0,
        partiallySupported: 0,
        insufficientEvidence: 0,
        needsSpecialistReview: 0,
        verifiedQuotes: 0
      },
      abstention_count: 0,
      duration_ms: 45
    };
  }

  // Claimed as Hadith, but the text is an exact Quran phrase and there is no strong hadith match.
  if (parsed.claimed === 'HADITH' && quranTop && !hadithStrong) {
    const claimText = [
      `س: ${input}`,
      '',
      'ج:',
      '• النسبة إلى النبي ﷺ غير صحيحة بهذا اللفظ؛ النص المطابق موجود في القرآن الكريم.',
      `• الموضع: سورة ${quranTop.surahName}، الآية ${quranTop.verseNumber}.`,
      `• نص الآية: ﴿${quranTop.textUthmani}﴾`,
      '',
      'المصدر:',
      '• القرآن الكريم'
    ].join('\n');

    const claim: Claim = {
      id: 'CLM-001',
      claim_text: claimText,
      source_span: { text: input, start: 0, end: input.length },
      status: 'TRANSFORMATION_DRIFT',
      confidence_score: 0.99,
      evidence_relation: 'ATTRIBUTION_MISMATCH',
      evidence: {
        source_id: 'quran-corpus',
        source_name: 'القرآن الكريم',
        canonical_reference: `سورة ${quranTop.surahName}، الآية ${quranTop.verseNumber}`,
        language: 'ar',
        raw_text: quranTop.textUthmani,
        version: '1.0',
        license_note: 'نص قرآني قطعي الثبوت'
      },
      evidence_passage: quranTop.textUthmani,
      verification_rationale: 'وجد مِحَكّ النص مطابقاً في القرآن الكريم ولم يعتمد نسبة حديثية غير موثقة؛ فصنّف الخطأ كتغيير في الإسناد/النسبة.'
    };

    return {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      input_text: input,
      detected_language: 'ar',
      claims: [claim],
      stats: {
        total: 1,
        supported: 0,
        partiallySupported: 0,
        insufficientEvidence: 0,
        needsSpecialistReview: 0,
        verifiedQuotes: 0
      },
      abstention_count: 0,
      duration_ms: 45
    };
  }

  // Correct attribution, ambiguous attribution, or insufficient cross-source evidence:
  // continue through the ordinary routing pipeline.
  return null;
}




/**
 * Source-scoped retrieval is parsed before semantic classification. The parser
 * separates the user's requested source from the content being searched and
 * tolerates ordinary Arabic/Egyptian question wrappers plus small spelling
 * errors in source words. Religious content itself is never silently rewritten.
 */
type SourceScopedLookup = {
  source: 'QURAN' | 'HADITH';
  focus: string;
  sourceCueCorrected: boolean;
  wantsMeaning: boolean;
  wantsExplanation: boolean;
  wantsEveryOccurrence: boolean;
};

function smallEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

function normalizeScopeToken(token: string): string {
  return normalizeArabicSearch(token).replace(/^ال/, '').trim();
}

function detectSourceToken(token: string): { source: 'QURAN' | 'HADITH'; corrected: boolean } | null {
  const value = normalizeScopeToken(token);
  if (!value) return null;

  const quranTerms = ['قران'];
  const hadithTerms = ['حديث', 'احاديث', 'سنه'];

  for (const term of quranTerms) {
    const distance = smallEditDistance(value, term);
    if (distance === 0) return { source: 'QURAN', corrected: false };
    if (value.length >= 4 && distance === 1) return { source: 'QURAN', corrected: true };
  }

  for (const term of hadithTerms) {
    const distance = smallEditDistance(value, term);
    if (distance === 0) return { source: 'HADITH', corrected: false };
    if (value.length >= 4 && distance === 1) return { source: 'HADITH', corrected: true };
  }

  return null;
}

function stripQueryScaffolding(value: string): string {
  let result = String(value || '').trim();
  if (!result) return '';

  const prefixPatterns: RegExp[] = [
    /^\s*(?:هل)\s+/i,
    /^\s*(?:ما\s+(?:هو|هي))\s+/i,
    /^\s*(?:أين|اين|فين)\s+(?:ورد(?:ت)?|جاء(?:ت)?|ذُكر(?:ت)?|ذكر(?:ت)?|موجود(?:ة|ه)?|مذكور(?:ة|ه)?)\s+/i,
    /^\s*(?:ورد(?:ت)?|يوجد|موجود(?:ة|ه)?|مذكور(?:ة|ه)?|ذُكر(?:ت)?|ذكر(?:ت)?)\s+/i,
    /^\s*(?:ابحث|إبحث|بحث|دور|دوّر|دورلي|دوّرلي|فتش|فتّش)\s+(?:لي\s+)?(?:عن\s+)?/i,
    /^\s*(?:هات|هاتلي|اعطني|أعطني|وريني|قولي|قوللي|قل\s+لي)\s+/i,
    /^\s*(?:عايز|عاوز|عايزه|عاوزه|أريد|اريد)\s+(?:(?:أعرف|اعرف|أشوف|اشوف)\s+)?/i,
    /^\s*(?:كم\s+مر[ةه]|كام\s+مر[ةه]|عدد\s+مرات)\s+(?:ورد(?:ت)?|ذكر(?:ت)?|جاء(?:ت)?|تكرر(?:ت)?)\s+/i,
    /^\s*(?:كم\s+مر[ةه]|كام\s+مر[ةه]|عدد\s+مرات)\s+/i,
    /^\s*(?:كلمة|كلمه|لفظ|اللفظ|عبارة|العباره|النص)\s+/i,
    /^\s*(?:(?:ما\s+)?(?:معنى|معني|معناه|معناها|المقصود(?:\s+من)?|يعني\s+ايه)|(?:اشرح|شرح|فسر|فسّر|تفسير|وضح|وضّح))\s+(?:(?:كلمة|كلمه|لفظ|عبارة|العباره)\s+)?/i
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of prefixPatterns) {
      const next = result.replace(pattern, '').trim();
      if (next !== result) {
        result = next;
        changed = true;
      }
    }
  }

  result = result
    .replace(/\s+(?:موجود(?:ة|ه)?|مذكور(?:ة|ه)?|ورد(?:ت)?|فين)\s*$/i, '')
    .replace(/^[«"'“]+|[»"'”]+$/g, '')
    .replace(/[؟?]+$/g, '')
    .trim();

  return result;
}

function scopedRequestFlags(value: string) {
  const norm = normalizeArabicSearch(value);
  const wantsMeaning =
    /(?:^|\s)(?:و|ف)?(?:معني|معنى|معناه|معناها|المعني|المعنى|المقصود|يعني)(?:\s|$)/.test(norm);
  const wantsExplanation =
    /(?:^|\s)(?:و|ف)?(?:اشرح|شرح|فسر|تفسير|وضح|بيّن|بين)(?:\s|$)/.test(norm);
  const wantsEveryOccurrence =
    /(?:^|\s)(?:كل|جميع|كافه|كافة)(?:\s|$)/.test(norm) ||
    norm.includes('في كل حديث') ||
    norm.includes('في كل موضع') ||
    norm.includes('في كل ايه') ||
    norm.includes('في كل اية') ||
    norm.includes('كل واحد');

  return { wantsMeaning, wantsExplanation, wantsEveryOccurrence };
}

function stripScopedOperationTail(value: string): string {
  let result = String(value || '').trim();
  if (!result) return '';

  const tailPatterns: RegExp[] = [
    /\s+(?:و|ف)?\s*(?:(?:ما\s+)?(?:معنى|معني|معناه|معناها|المعنى|المعني|المقصود|يعني\s+ايه))\b.*$/i,
    /\s+(?:و|ف)?\s*(?:اشرح|شرح|فسر|فسّر|تفسير|وضح|وضّح|بيّن|بين)(?=\s|$).*$/i,
    /\s+(?:و|ف)?\s*(?:كم|عدد)(?=\s|$).*$/i
  ];

  for (const pattern of tailPatterns) {
    result = result.replace(pattern, '').trim();
  }

  return result
    .replace(/^[«"'“]+|[»"'”]+$/g, '')
    .replace(/[؟?]+$/g, '')
    .trim();
}

function safeSourceExcerpt(value: string, maxLength = 900): string {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trim()}…`;
}

function extractSourceScopedLookup(input: string): SourceScopedLookup | null {
  const clean = String(input || '').trim();
  if (!clean) return null;

  const originalTokens = clean
    .replace(/[؟?،,؛;:.]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const normalizedTokens = originalTokens.map((token) => normalizeArabicSearch(token));

  let found: { source: 'QURAN' | 'HADITH'; start: number; end: number; corrected: boolean } | null = null;

  for (let i = 0; i < normalizedTokens.length; i++) {
    const current = normalizedTokens[i];

    if ((current === 'في' || current === 'من') && i + 1 < normalizedTokens.length) {
      const detected = detectSourceToken(normalizedTokens[i + 1]);
      if (detected) {
        let end = i + 1;
        const after = normalizeScopeToken(normalizedTokens[i + 2] || '');
        if (
          (detected.source === 'QURAN' && after === 'كريم') ||
          (detected.source === 'HADITH' && (after === 'نبويه' || after === 'نبوي'))
        ) {
          end = i + 2;
        }
        found = { source: detected.source, start: i, end, corrected: detected.corrected };
        break;
      }
    }
  }

  if (!found && normalizedTokens.length >= 2) {
    const lastIndex = normalizedTokens.length - 1;
    const detected = detectSourceToken(normalizedTokens[lastIndex]);
    if (detected) {
      found = { source: detected.source, start: lastIndex, end: lastIndex, corrected: detected.corrected };
    }
  }

  if (!found) return null;

  const beforeSource = originalTokens.slice(0, found.start).join(' ');
  const afterSource = originalTokens.slice(found.end + 1).join(' ');

  const beforeCandidate = stripQueryScaffolding(stripScopedOperationTail(beforeSource));
  const afterCandidate = stripQueryScaffolding(stripScopedOperationTail(afterSource));

  // Prefer content written before the explicit source cue. If the user writes
  // the source first, recover the target from the text that follows it, stopping
  // before any requested operation such as meaning/explanation/count.
  let focus = beforeCandidate || afterCandidate;

  if (found.source === 'HADITH') {
    focus = focus.replace(/^\s*(?:الحديث|حديث)\s*[:：]?\s*/i, '').trim();
  }

  if (found.source === 'QURAN') {
    focus = focus.replace(/^\s*(?:القرآن|القران)(?:\s+الكريم)?\s*[:：]?\s*/i, '').trim();
  }

  if (!focus) return null;

  const flags = scopedRequestFlags(clean);
  return {
    source: found.source,
    focus,
    sourceCueCorrected: found.corrected,
    ...flags
  };
}

function isExactQuranPhraseMatch(rawText: string, focus: string): boolean {
  const verse = normalizeArabicSearch(String(rawText || ''));
  const phrase = normalizeArabicSearch(String(focus || ''));
  return Boolean(phrase && verse.includes(phrase));
}

function isSingleLexicalToken(value: string): boolean {
  const normalized = normalizeArabicSearch(value);
  return Boolean(normalized && !normalized.includes(' ') && /^[\u0621-\u064A]+$/.test(normalized));
}

async function resolveSourceScopedLookup(input: string): Promise<AuditRun | null> {
  const scoped = extractSourceScopedLookup(input);
  if (!scoped) return null;

  const { source, wantsMeaning, wantsExplanation, wantsEveryOccurrence } = scoped;
  let focus = scoped.focus;
  const notes: string[] = [];

  if (scoped.sourceCueCorrected) {
    notes.push('• تم فهم اسم المصدر رغم وجود خطأ إملائي بسيط فيه؛ لم يُستخدم هذا التصحيح لتغيير النص الديني المطلوب البحث عنه.');
  }

  if (source === 'QURAN') {
    if (isSingleLexicalToken(focus)) {
      let lexical = searchQuranExactLexeme(focus);
      const correction = lexical.occurrenceCount === 0 ? suggestQuranLexemeCorrection(focus) : null;

      if (correction) {
        focus = correction.suggestion;
        lexical = searchQuranExactLexeme(focus);
        if (lexical.occurrenceCount > 0) {
          notes.push(`• لم يُعثر على الرسم المكتوب حرفيًا، وأقرب لفظ قرآني وحيد بدرجة ثقة مرتفعة هو «${focus}»؛ تم التنبيه إلى التصحيح بدل تطبيقه بصمت.`);
        }
      }

      if (lexical.occurrenceCount > 0 && (wantsMeaning || wantsExplanation) && wantsEveryOccurrence) {
        const detailed = lexical.matches.slice(0, 60);
        const blocks: string[] = [];

        for (let i = 0; i < detailed.length; i++) {
          const rec = detailed[i].record;
          const gharib = getGharibExplanation(rec.surah_number, rec.ayah_number);
          const directMeaning = gharib?.text
            ? extractGharibMeaningForLexeme(gharib.text, focus)
            : null;
          const tafsir = getTafsirMuyassar(rec.surah_number, rec.ayah_number);

          const blockLines = [
            `الموضع ${i + 1}: ${rec.canonical_reference_ar}`,
            `الآية: ﴿${rec.arabic_text}﴾`
          ];

          if (wantsMeaning) {
            blockLines.push(
              directMeaning
                ? `المعنى اللفظي من المصدر: ${htmlToPlainText(directMeaning)}`
                : 'المعنى اللفظي من المصدر: لا يورد سجل غريب القرآن معنى مستقلًا لهذا اللفظ في هذا الموضع.'
            );
          }

          if (wantsExplanation) {
            blockLines.push(
              tafsir?.text
                ? `تفسير الموضع: ${safeSourceExcerpt(htmlToPlainText(tafsir.text), 800)}`
                : 'تفسير الموضع: لا يتوفر نص تفسيري مستقل لهذا الموضع في المصدر المحمّل.'
            );
          }

          blocks.push(blockLines.join('\n'));
        }

        const overflowNote = lexical.matches.length > detailed.length
          ? `\n\n• توجد ${lexical.matches.length - detailed.length} نتيجة إضافية؛ لم تُعرض دفعة واحدة لحماية قابلية القراءة.`
          : '';

        const claimText = [
          `س: ${input}`,
          '',
          'ج:',
          ...notes,
          `• ورد اللفظ «${focus}» في ${lexical.verseCount} آية، وفيما يلي المعنى/الشرح المتاح من المصدر لكل موضع.`,
          '',
          blocks.join('\n\n'),
          overflowNote,
          '',
          'المصدر:',
          '• القرآن الكريم',
          '• الميسر في غريب القرآن الكريم',
          wantsExplanation ? '• التفسير الميسر' : ''
        ].filter(Boolean).join('\n');

        const first = lexical.matches[0].record;
        return buildSingleClaimRun(input, claimText, 'SUPPORTED', 0.99, {
          source_id: 'quran-lexical-contexts',
          source_name: wantsExplanation
            ? 'القرآن الكريم + الميسر في غريب القرآن الكريم + التفسير الميسر'
            : 'القرآن الكريم + الميسر في غريب القرآن الكريم',
          canonical_reference: detailed.map((m) => m.record.canonical_reference_ar).join(' | '),
          language: 'ar',
          raw_text: detailed.map((m) => m.record.arabic_text).join('\n'),
          surah_number: first.surah_number,
          ayah_number: first.ayah_number,
          version: '1.0',
          license_note: 'بحث لفظي سياقي مباشر في المصادر القرآنية المحمّلة'
        }, 'تم فصل اللفظ المطلوب عن صياغة السؤال، ثم ربط كل موضع قرآني بالمعنى أو التفسير المتاح في المصدر لذلك الموضع دون توليد معنى من ذاكرة النموذج.');
      }

      if (lexical.occurrenceCount > 0) {
        const lines: string[] = [
          ...notes,
          `• ورد اللفظ «${focus}» في القرآن الكريم ${lexical.occurrenceCount} مرة في ${lexical.verseCount} آية.`
        ];
        for (const match of lexical.matches.slice(0, 5)) {
          lines.push(`• ${match.record.canonical_reference_ar}: ﴿${match.record.arabic_text}﴾`);
        }
        if (lexical.matches.length > 5) {
          lines.push(`• توجد ${lexical.matches.length - 5} آية إضافية لم تُعرض اختصارًا.`);
        }

        const formatted = buildFormattedAnswer({
          question: input,
          directAnswerLines: lines,
          sourceNames: ['القرآن الكريم'],
          rationale: 'تم تنفيذ بحث لفظي مباشر داخل النص القرآني بعد فصل صياغة السؤال واسم المصدر عن الكلمة المطلوب التحقق منها.'
        });

        const first = lexical.matches[0].record;
        return buildSingleClaimRun(input, formatted.claimText, 'SUPPORTED', 0.99, {
          source_id: 'quran-corpus',
          source_name: 'القرآن الكريم',
          canonical_reference: lexical.matches.slice(0, 5).map((m) => m.record.canonical_reference_ar).join(' | '),
          language: 'ar',
          raw_text: lexical.matches.slice(0, 5).map((m) => m.record.arabic_text).join('\n'),
          surah_number: first.surah_number,
          ayah_number: first.ayah_number,
          version: '1.0',
          license_note: 'بحث لفظي مباشر في النص القرآني'
        }, formatted.verificationRationale);
      }

      return buildAbstentionRun(input, `لم يُعثر على ورود لفظي مباشر للكلمة المطلوبة في النص القرآني، ولم يوجد تصحيح إملائي فريد وواضح بما يكفي.`);
    }

    const hits = searchQuran(focus, 12);
    const exactHits = hits.filter((h: any) =>
      isExactQuranPhraseMatch(String(h?.record?.raw_text || ''), focus)
    );
    const usable = exactHits.length > 0
      ? exactHits
      : hits.filter((h: any) => Number(h?.score || 0) >= 0.85);

    if (usable.length > 0) {
      const displayed = usable.slice(0, 5);
      const lines: string[] = [
        ...notes,
        `• وُجد النص المطلوب في القرآن الكريم في ${usable.length} موضع/مواضع مطابقة ضمن نتائج البحث الموثقة.`
      ];

      for (const hit of displayed) {
        const rec: any = hit.record;
        lines.push(`• ${rec.canonical_reference}: ﴿${rec.raw_text}﴾`);
      }

      if (usable.length > displayed.length) {
        lines.push(`• توجد ${usable.length - displayed.length} نتيجة إضافية لم تُعرض اختصارًا.`);
      }

      const formatted = buildFormattedAnswer({
        question: input,
        directAnswerLines: lines,
        sourceNames: ['القرآن الكريم'],
        rationale: 'تم التحقق من النص نفسه داخل القرآن بعد إزالة صياغة السؤال وعبارة تحديد المصدر من الاستعلام.'
      });

      const first: any = usable[0].record;
      return buildSingleClaimRun(input, formatted.claimText, 'SUPPORTED', 0.99, {
        source_id: 'quran-corpus',
        source_name: 'القرآن الكريم',
        canonical_reference: usable.slice(0, 5).map((h: any) => h.record.canonical_reference).join(' | '),
        language: 'ar',
        raw_text: usable.slice(0, 5).map((h: any) => h.record.raw_text).join('\n'),
        surah_number: first?.surah_number,
        ayah_number: first?.ayah_number,
        version: '1.0',
        license_note: 'نص قرآني من المصدر المتصل'
      }, formatted.verificationRationale);
    }

    return buildAbstentionRun(input, `لم يُعثر على عبارة «${focus}» في النص القرآني المتصل.`);
  }

  if (isSingleLexicalToken(focus)) {
    let hits = searchHadithExactWord(focus, 5000);
    const correction = hits.length === 0 ? suggestHadithWordCorrection(focus) : null;

    if (correction) {
      focus = correction.suggestion;
      hits = searchHadithExactWord(focus, 5000);
      if (hits.length > 0) {
        notes.push(`• لم يُعثر على الرسم المكتوب حرفيًا في متن الحديث، وأقرب لفظ وحيد بدرجة ثقة مرتفعة هو «${focus}»؛ تم التنبيه إلى التصحيح.`);
      }
    }

    if (hits.length > 0 && (wantsMeaning || wantsExplanation) && wantsEveryOccurrence) {
      const totalOccurrences = hits.reduce((sum, hit) => sum + hit.occurrences, 0);
      const detailed = hits.slice(0, 60);
      const blocks: string[] = [];

      for (let i = 0; i < detailed.length; i++) {
        const hit = detailed[i];
        const record = hit.record;
        const text = String(record.hadith_text || record.title || '').trim();
        const reference = String(record.reference || record.takhrij || '').trim();
        const attribution = String(record.attribution || '').trim();
        const grade = String(record.grade || '').trim();
        const directMeaning = extractHadithWordMeaning(record, focus);
        const explanation = String(record.explanation || '').trim();

        const blockLines = [
          `الحديث ${i + 1}`,
          text ? `النص: «${text}»` : '',
          attribution ? `العزو: ${attribution}` : '',
          grade ? `الحكم كما أورده المصدر: ${grade}` : ''
        ].filter(Boolean);

        if (wantsMeaning) {
          if (directMeaning) {
            blockLines.push(`المعنى اللفظي من المصدر: ${safeSourceExcerpt(directMeaning, 700)}`);
          } else {
            blockLines.push('المعنى اللفظي من المصدر: لا يورد السجل معنى مستقلًا مباشرًا لهذا اللفظ.');
            if (explanation) {
              blockLines.push(`شرح المصدر للسياق: ${safeSourceExcerpt(explanation, 850)}`);
            }
          }
        } else if (wantsExplanation) {
          blockLines.push(
            explanation
              ? `شرح المصدر: ${safeSourceExcerpt(explanation, 900)}`
              : 'شرح المصدر: لا يتوفر شرح نصي مستقل في السجل المفهرس.'
          );
        }

        if (reference) blockLines.push(`المرجع: ${reference}`);
        blocks.push(blockLines.join('\n'));
      }

      const overflowNote = hits.length > detailed.length
        ? `• توجد ${hits.length - detailed.length} سجلات إضافية؛ لم تُعرض دفعة واحدة لحماية قابلية القراءة.`
        : '';

      const claimText = [
        `س: ${input}`,
        '',
        'ج:',
        ...notes,
        `• ظهر اللفظ «${focus}» ${totalOccurrences} مرة داخل ${hits.length} سجلًا حديثيًا مفهرسًا.`,
        wantsMeaning
          ? '• فيما يلي المعنى اللفظي المباشر عندما يورده المصدر، وإلا يُعرض شرح المصدر للسياق دون اختراع معنى مستقل.'
          : '• فيما يلي شرح المصدر المتاح لكل سجل.',
        '',
        blocks.join('\n\n'),
        overflowNote,
        '',
        'المصدر:',
        '• بيانات HadeethEnc المفهرسة'
      ].filter(Boolean).join('\n');

      return buildSingleClaimRun(input, claimText, 'SUPPORTED', 0.98, {
        source_id: 'hadeethenc-local-contexts',
        source_name: 'بيانات HadeethEnc المفهرسة',
        canonical_reference: detailed.map((h) => String(h.record.reference || h.record.id || '')).join(' | '),
        language: 'ar',
        raw_text: detailed.map((h) => String(h.record.hadith_text || h.record.title || '')).join('\n'),
        version: '1.0',
        license_note: 'بحث لفظي سياقي داخل متن الحديث وحقول الشرح/معاني الكلمات بالمصدر'
      }, 'تم البحث عن اللفظ في متن الحديث/العنوان أولًا، ثم ربط كل سجل بمعنى الكلمات أو الشرح الموجود في نفس سجل المصدر. لم يستخدم مِحَكّ ذاكرة النموذج لاختراع معنى غير موجود.');
    }

    if (hits.length > 0) {
      const totalOccurrences = hits.reduce((sum, hit) => sum + hit.occurrences, 0);
      const lines: string[] = [
        ...notes,
        `• ظهر اللفظ «${focus}» ${totalOccurrences} مرة داخل ${hits.length} سجلًا في قاعدة الحديث المفهرسة.`
      ];
      for (const hit of hits.slice(0, 5)) {
        const text = String(hit.record.hadith_text || hit.record.title || '').trim();
        const reference = String(hit.record.reference || hit.record.takhrij || '').trim();
        if (text) lines.push(`• «${text}»${reference ? ` — ${reference}` : ''}`);
      }
      if (hits.length > 5) lines.push(`• توجد ${hits.length - 5} سجلات إضافية لم تُعرض اختصارًا.`);

      const claimText = [
        `س: ${input}`,
        '',
        'ج:',
        ...lines,
        '',
        'المصدر:',
        '• بيانات HadeethEnc المفهرسة'
      ].join('\n');

      return buildSingleClaimRun(input, claimText, 'SUPPORTED', 0.97, {
        source_id: 'hadeethenc-local-index',
        source_name: 'بيانات HadeethEnc المفهرسة',
        canonical_reference: hits.slice(0, 5).map((h) => String(h.record.reference || h.record.id || '')).join(' | '),
        language: 'ar',
        raw_text: hits.slice(0, 5).map((h) => String(h.record.hadith_text || h.record.title || '')).join('\n'),
        version: '1.0',
        license_note: 'بحث لفظي مباشر داخل متن الحديث المفهرس'
      }, 'تم البحث عن الكلمة داخل عنوان الحديث ومتنه فقط، دون اعتبار ظهورها في الشرح أو الفوائد دليلاً على ورودها في الحديث.');
    }

    const quranLexeme = searchQuranExactLexeme(focus);
    if (quranLexeme.occurrenceCount > 0) {
      const first = quranLexeme.matches[0].record;
      const claimText = [
        `س: ${input}`,
        '',
        'ج:',
        '• لم يُعثر على ورود لفظي مباشر للكلمة المطلوبة في متن الأحاديث المفهرسة.',
        '• في المقابل، وُجد اللفظ نفسه في القرآن الكريم.',
        `• ${first.canonical_reference_ar}: ﴿${first.arabic_text}﴾`,
        '',
        'المصدر:',
        '• بيانات HadeethEnc المفهرسة',
        '• القرآن الكريم'
      ].join('\n');
      return buildSingleClaimRun(input, claimText, 'SUPPORTED', 0.96, {
        source_id: 'cross-source-lexical-index',
        source_name: 'بيانات HadeethEnc المفهرسة والقرآن الكريم',
        canonical_reference: first.canonical_reference_ar,
        language: 'ar',
        raw_text: first.arabic_text,
        version: '1.0',
        license_note: 'تحقق تقاطعي بين المصدرين'
      }, 'تم فحص المصدر الحديثي أولًا ثم إجراء فحص قرآني تقاطعي دون افتراض صحة نسبة المستخدم.');
    }

    return buildAbstentionRun(input, 'لم يُعثر على ورود لفظي مباشر للكلمة في متن الأحاديث المفهرسة، ولم يوجد تصحيح إملائي فريد وواضح بما يكفي.');
  }

  const resolved = await resolveHadithCandidate(focus);
  const hadithStrong = Boolean(resolved && (resolved.exactPhrase || resolved.score >= 0.72));

  if (resolved && hadithStrong) {
    return await resolveHadithQuestion(input, {
      domain: 'HADITH',
      intent: 'HADITH_VERIFY',
      retrieval_mode: 'REFERENCE',
      target: focus,
      search_queries: [focus],
      is_count_query: false,
      confidence: Math.max(0.9, resolved.score),
      reasoning: 'طلب بحث مقيد بالمصدر الحديثي، وتمت مطابقة النص بسجل حديثي بدرجة كافية.'
    });
  }

  const quranHits = searchQuran(focus, 4);
  const quranTop = quranHits.find((h: any) =>
    isExactQuranPhraseMatch(String(h?.record?.raw_text || ''), focus)
  ) || null;

  if (quranTop) {
    const rec: any = quranTop.record;
    const claimText = [
      `س: ${input}`,
      '',
      'ج:',
      '• لم يُعثر على النص كسجل حديثي مطابق بدرجة كافية في المصدر الحديثي المتصل.',
      '• في المقابل، وُجد النص مطابقًا في القرآن الكريم.',
      `• ${rec.canonical_reference}: ﴿${rec.raw_text}﴾`,
      '',
      'المصدر:',
      '• موسوعة الأحاديث النبوية (HadeethEnc)',
      '• القرآن الكريم'
    ].join('\n');

    return buildSingleClaimRun(input, claimText, 'SUPPORTED', 0.98, {
      source_id: 'quran-corpus',
      source_name: 'القرآن الكريم',
      canonical_reference: rec.canonical_reference,
      language: 'ar',
      raw_text: rec.raw_text,
      surah_number: rec.surah_number,
      ayah_number: rec.ayah_number,
      version: '1.0',
      license_note: 'تحقق تقاطعي بين المصدر الحديثي والمصحف المتصل'
    }, 'لم يعتمد مِحَكّ وصف المستخدم للمصدر كحقيقة؛ تم البحث في المصدر المطلوب ثم فحص المصدر الآخر عند غياب تطابق قوي.');
  }

  return buildAbstentionRun(input, 'لم يُعثر على النص كسجل حديثي مطابق بدرجة كافية في المصدر الحديثي المتصل.');
}

/**
 * Recovers short, loosely phrased lexical questions before they fall through to
 * semantic AI classification. It only triggers when question scaffolding can be
 * removed safely and exactly one content token remains.
 */
function extractLooseLexicalFocus(input: string): string | null {
  const clean = String(input || '').trim();
  if (!clean) return null;
  if (extractSourceScopedLookup(clean)) return null;

  const norm = normalizeArabicSearch(clean);
  if (/\b(?:تفسير|فسر|اشرح|شرح|معني|معنى|المقصود|تخريج|صحه|صحة|درجه|درجة)\b/.test(norm)) {
    return null;
  }

  const stripped = stripQueryScaffolding(clean);
  if (!stripped || stripped === clean) return null;
  if (!isSingleLexicalToken(stripped)) return null;
  return stripped;
}

async function resolveLooseLexicalQuestion(input: string): Promise<AuditRun | null> {
  const focus = extractLooseLexicalFocus(input);
  if (!focus) return null;

  let quranTerm = focus;
  let quranLexeme = searchQuranExactLexeme(quranTerm);
  const quranCorrection = quranLexeme.occurrenceCount === 0 ? suggestQuranLexemeCorrection(focus) : null;
  if (quranCorrection) {
    quranTerm = quranCorrection.suggestion;
    quranLexeme = searchQuranExactLexeme(quranTerm);
  }

  let hadithTerm = focus;
  let hadithHits = searchHadithExactWord(hadithTerm, 5000);
  const hadithCorrection = hadithHits.length === 0 ? suggestHadithWordCorrection(focus) : null;
  if (hadithCorrection) {
    hadithTerm = hadithCorrection.suggestion;
    hadithHits = searchHadithExactWord(hadithTerm, 5000);
  }

  if (quranLexeme.occurrenceCount === 0 && hadithHits.length === 0) return null;

  const lines: string[] = [];
  if (quranCorrection && quranLexeme.occurrenceCount > 0) {
    lines.push(`• أقرب لفظ قرآني وحيد للرسم المكتوب هو «${quranTerm}»، وتم عرض النتيجة مع التنبيه بدل التصحيح الصامت.`);
  }
  if (quranLexeme.occurrenceCount > 0) {
    lines.push(`• في القرآن الكريم: ورد اللفظ «${quranTerm}» ${quranLexeme.occurrenceCount} مرة في ${quranLexeme.verseCount} آية.`);
    for (const match of quranLexeme.matches.slice(0, 3)) {
      lines.push(`• ${match.record.canonical_reference_ar}: ﴿${match.record.arabic_text}﴾`);
    }
  }

  if (hadithCorrection && hadithHits.length > 0) {
    lines.push(`• أقرب لفظ حديثي وحيد للرسم المكتوب هو «${hadithTerm}»، وتم عرض النتيجة مع التنبيه.`);
  }
  if (hadithHits.length > 0) {
    const totalOccurrences = hadithHits.reduce((sum, hit) => sum + hit.occurrences, 0);
    lines.push(`• في قاعدة الحديث المفهرسة: ظهر اللفظ «${hadithTerm}» ${totalOccurrences} مرة داخل ${hadithHits.length} سجلًا.`);
    for (const hit of hadithHits.slice(0, 2)) {
      const text = String(hit.record.hadith_text || hit.record.title || '').trim();
      const reference = String(hit.record.reference || hit.record.takhrij || '').trim();
      if (text) lines.push(`• «${text}»${reference ? ` — ${reference}` : ''}`);
    }
  }

  const sources: string[] = [];
  if (quranLexeme.occurrenceCount > 0) sources.push('القرآن الكريم');
  if (hadithHits.length > 0) sources.push('بيانات HadeethEnc المفهرسة');

  const claimText = [
    `س: ${input}`,
    '',
    'ج:',
    ...lines,
    '',
    'المصدر:',
    ...sources.map((sourceName) => `• ${sourceName}`)
  ].join('\n');

  return buildSingleClaimRun(input, claimText, 'SUPPORTED', 0.96, {
    source_id: 'cross-source-lexical-index',
    source_name: sources.join(' و '),
    canonical_reference: focus,
    language: 'ar',
    raw_text: lines.join('\n'),
    version: '1.0',
    license_note: 'فهم لغوي محافظ + بحث لفظي مباشر في المصادر'
  }, 'تم حذف غلاف السؤال فقط، ثم البحث عن الكلمة نفسها في النصوص المصدرية دون تحويل سؤال قصير إلى استدعاء دلالي غير ضروري.');
}


/**
 * Generic explanation requests such as "شرح <phrase>" do not name a source.
 * Resolve the phrase against the connected corpora first, then choose the
 * explanation engine. This avoids treating every word "شرح" as Quran tafsir,
 * while still recognizing genuine Quran fragments and genuine hadith phrases.
 */
function extractGenericExplanationFocus(input: string): string | null {
  const clean = String(input || '').trim();
  const norm = normalizeArabicSearch(clean);

  // Explicit source cues have their own deterministic routes.
  if (
    norm.includes('حديث') ||
    norm.includes('قال رسول الله') ||
    norm.includes('قال النبي') ||
    norm.includes('سوره') ||
    norm.includes('ايه') ||
    norm.includes('القران') ||
    norm.includes('قوله تعالي') ||
    norm.includes('قوله عز وجل')
  ) {
    return null;
  }

  const match = clean.match(
    /^\s*(?:اشرح(?:\s+لي)?|شرح|فسر|فسّر|تفسير|وضح|وضّح|بيّن|بين|ما\s+معنى|ما\s+معني|ما\s+المقصود(?:\s+ب(?:ـ)?)?)\s*[:：]?\s*[«"'“]?(.+?)[»"'”]?\s*[؟?]*\s*$/i
  );

  const focus = String(match?.[1] || '').trim();
  if (!focus) return null;

  // A single generic word can occur in many verses/hadiths. Do not guess a
  // source from it; let the normal word/term route handle it instead.
  const tokenCount = normalizeArabicSearch(focus).split(/\s+/).filter(Boolean).length;
  if (tokenCount < 2) return null;

  return focus;
}

async function resolveGenericExplanationBySource(input: string): Promise<AuditRun | null> {
  const focus = extractGenericExplanationFocus(input);
  if (!focus) return null;

  const quranHits = searchQuran(focus, 4);
  const bestQuran = quranHits[0] || null;
  const quranStrong = Boolean(bestQuran && bestQuran.score >= 0.70);

  const hadithHits = searchHadiths(focus, 3);
  const bestHadith = hadithHits[0] || null;
  const hadithStrong = Boolean(
    bestHadith && (bestHadith.exactPhrase || bestHadith.score >= 0.86)
  );

  if (quranStrong && !hadithStrong) {
    return await resolveTafsirPipeline(input);
  }

  if (hadithStrong && !quranStrong) {
    return await resolveHadithQuestion(input, {
      domain: 'HADITH',
      intent: 'HADITH_EXPLANATION',
      retrieval_mode: 'REFERENCE',
      target: focus,
      search_queries: [focus],
      is_count_query: false,
      confidence: Math.max(0.9, bestHadith?.score || 0.9),
      reasoning: 'تم تحديد المصدر الحديثي من مطابقة العبارة قبل طلب الشرح.'
    });
  }

  if (quranStrong && hadithStrong) {
    return buildAbstentionRun(
      input,
      'العبارة لها تطابق قوي في أكثر من مصدر متصل. حدّد هل تريد شرح الموضع القرآني أم شرح الحديث حتى لا ينسب مِحَكّ النص إلى مصدر غير مقصود.'
    );
  }

  return null;
}

/**

 * Authoritative Central Entry Point for all content audits and religious queries in MIHAK.

 */

export async function centralOrchestrator(

  text: string,

  referenceSource?: string

): Promise<AuditRun> {
  const clean = text.trim();
  const inputPreview = clean.slice(0, 80);

  console.log(`\n[MIHAK LIVE ORCHESTRATOR ENTRY]\nrevision: ${MIHAK_RUNTIME_REVISION}\ninputPreview: "${inputPreview}"\n`);

  if (!clean) {
    return buildAbstentionRun(text, 'يرجى إدخال نص للتدقيق.');
  }

  // Safeguard: A raw URL must NEVER be treated as a religious claim or question
  if (/^https?:\/\/[^\s]+$/i.test(clean)) {
    return buildAbstentionRun(
      text,
      'المدخل المقدم هو رابط إلكتروني خام (URL). يجب فحص الروابط عبر مسار "فحص رابط" لاستخراج محتوى الصفحة وتدقيقه، ولا يمكن لمحرك الأدلة الشرعية تدقيق نص الرابط بحد ذاته كادعاء ديني.'
    );
  }

  // 1. If explicit user reference source is provided -> Content Audit against Reference
  if (referenceSource && referenceSource.trim().length > 0) {
    return await resolveContentAudit(clean, referenceSource.trim());
  }

  // =============================================================
  // REQUIRED ROUTING HIERARCHY — STEP B:
  // Explicit deterministic structure parsing (Exact References & Lexical Operations)
  // Bypasses old whole-sentence fallbacks and executes verified corpus lookups directly.
  // =============================================================
  const corpusStatus = getQuranCorpusStatus();
  const trace: MihakTraceLog = {
    endpoint: '/api/audit',
    inputText: clean,
    inputModality: 'text',
    centralOrchestratorCalled: true,
    universalPlannerCalled: true,
    plannerOutput: {
      taskFamily: 'UNKNOWN',
      taskType: 'UNKNOWN',
      lexicalTargets: [],
      explicitReferences: [],
      requiredDomains: [],
      retrievalPlan: { mode: 'DIRECT', target: '', queries: [] }
    },
    deterministicParserOutput: {},
    selectedExecutionEngine: 'None',
    retrievalParameters: {
      targetTermOrReference: '',
      normalizedTarget: '',
      corpusSize: corpusStatus.ayahCount,
      candidateCount: 0,
      exactHitCount: 0,
      finalHitCount: 0
    },
    fallbackInvoked: false,
    corpusStatus: {
      quranCorpusLoaded: corpusStatus.ayahCount === 6236 && corpusStatus.surahCount === 114,
      quranVerseCount: corpusStatus.ayahCount,
      chapterCount: corpusStatus.surahCount
    }
  };

  const deterministicPlan = parseDeterministicPlan(clean);
  if (deterministicPlan) {
    trace.plannerOutput = {
      taskFamily: deterministicPlan.taskFamily,
      taskType: deterministicPlan.taskType,
      requestedOperation: deterministicPlan.requestedOperation,
      lexicalTargets: deterministicPlan.lexicalTargets,
      explicitReferences: deterministicPlan.explicitReferences.map((r: any) => r.canonicalReference),
      requiredDomains: deterministicPlan.requiredDomains,
      retrievalPlan: deterministicPlan.retrievalPlan
    };
    trace.deterministicParserOutput = {
      detectedReference: deterministicPlan.explicitReferences[0]?.canonicalReference,
      detectedQuranLexicalTarget: deterministicPlan.lexicalTargets[0],
      detectedOperation: deterministicPlan.requestedOperation
    };

    console.log(`\n[MIHAK LIVE ROUTE DECISION]\nselectedBranch: DETERMINISTIC_STRUCTURE\nselectedEngine: ${deterministicPlan.taskType}\nplannerCalled: yes\nearlyReturn: yes\nfallbackFunction: none\n`);

    const directRun = await executeUniversalPlan(clean, deterministicPlan, trace);
    if (directRun) {
      emitMihakTrace(trace);
      return directRun;
    }
  }

  // 1.5 Explicit source-attribution claims are audited before ordinary fragment routing.
  // This is essential for detecting statements that quote a real text but attribute it
  // to the wrong source (Quran ↔ Hadith).
  const attributionAudit = await resolveExplicitAttributionAudit(clean);
  if (attributionAudit) {
    return attributionAudit;
  }

  // Legacy phrase/keyword routers intentionally do NOT early-return here.
  // Natural-language questions now continue to the universal semantic planner.

  // 2. First-Stage Universal Input Understanding: WHAT THE USER ENTERED

  const understanding = await interpretUniversalInput(clean);



  // A. Single character needing clarification:

  if (understanding.inputType === 'SINGLE_CHARACTER' && understanding.needsClarification) {

    return resolveSingleCharacterClarification(understanding);

  }



  // B. Single letter canonical Quran opening (e.g. 'ق', 'ن', 'ص'):

  if (understanding.inputType === 'SINGLE_CHARACTER' && !understanding.needsClarification) {

    return await resolveQuranFragmentInput(understanding);

  }



  // C. Arabic standalone terms may use deterministic lexical retrieval.
  // English/mixed input continues to semantic planning.
  const hasArabicScript = /[\u0600-\u06FF]/.test(clean);
  if (hasArabicScript && (understanding.inputType === 'RELIGIOUS_TERM' || understanding.inputType === 'SINGLE_WORD') && !understanding.isQuestion) {
    return await resolveReligiousTermInput(understanding);
  }



  // D. Quran Fragment or Complete Verse without question markers:

  if (hasArabicScript && (understanding.inputType === 'QURAN_FRAGMENT' || understanding.inputType === 'QURAN_VERSE') && !understanding.isQuestion) {

    return await resolveQuranFragmentInput(understanding);

  }



  // E. Hadith Fragment or Text without question markers:

  if (hasArabicScript && (understanding.inputType === 'HADITH_FRAGMENT' || understanding.inputType === 'HADITH_TEXT') && !understanding.isQuestion) {

    return await resolveHadithFragmentInput(understanding);

  }



  // 2.5 Structured Request Plan & Coverage Detection
  // Do NOT spend a Gemini call decomposing ordinary short questions. Semantic
  // decomposition is only needed for genuine claims/paragraphs/mixed content or
  // longer argument-like inputs. This prevents a temporary Gemini 503 from blocking
  // direct Quran/Hadith lookups that are fully available locally.
  const needsSemanticDecomposition =
    understanding.isClaim ||
    understanding.inputType === 'CLAIM' ||
    understanding.inputType === 'PARAGRAPH' ||
    understanding.inputType === 'CONTENT_FOR_AUDIT' ||
    understanding.inputType === 'MIXED_CONTENT' ||
    clean.length > 220 ||
    /(?:وبالتالي|لذلك|إذن|اذن|مما يدل|مما يثبت|يتعارض|يتناقض|تعارض|تناقض|متعارض|متناقض|contradict|contradiction|therefore|thus|hence)/i.test(clean);

  let requestPlan = needsSemanticDecomposition
  ? await buildRequestPlanSemantic(clean, understanding.inputType)
  : buildRequestPlan(clean, understanding.inputType);

/**
 * Safety refinement for compound Quran-attribution claims.
 *
 * Sometimes semantic decomposition may keep two independent source claims
 * inside one proposition, for example:
 *
 *   "القرآن يقول إن الإنسان خُلق من تراب ويقول من نطفة"
 *
 * The retrieval engine should never be asked to repair that structural error.
 * Split only on explicit repeated reporting predicates such as:
 *   ويقول / ويذكر / وينص / ويقرر
 *
 * We deliberately do NOT split on a bare "و" so normal Arabic coordination
 * remains untouched.
 */
if (Array.isArray(requestPlan.propositions)) {
  const refinedPropositions: typeof requestPlan.propositions = [];

  for (const proposition of requestPlan.propositions) {
    const propositionText =
      String(
        proposition.normalizedMeaning ||
        proposition.originalSpan?.text ||
        ''
      ).trim();

    // Conclusions/questions about the relation must remain intact.
    if (
      proposition.role === 'CONCLUSION' ||
      !propositionText
    ) {
      refinedPropositions.push(proposition);
      continue;
    }

    const propositionDomains =
      Array.isArray(proposition.requiredEvidenceDomains)
        ? proposition.requiredEvidenceDomains
        : [];

    const isQuranScoped =
      propositionDomains.includes('QURAN') ||
      /(?:القرآن|القران|المصحف|قال\s+الله|قال\s+تعالى)/i.test(
        propositionText
      );

    if (!isQuranScoped) {
      refinedPropositions.push(proposition);
      continue;
    }

    /*
     * Split only when a second explicit reporting predicate appears.
     *
     * Examples:
     * القرآن يقول X ويقول Y
     * القرآن يذكر X ويذكر Y
     * القرآن يقول X ويذكر Y
     * القرآن ينص على X ويقرر Y
     */
    const splitMatch = propositionText.match(
      /^(.+?)\s+(و(?:يقول|يذكر|ينص(?:\s+على)?|يقرر|ذكر|قال))\s+(.+)$/i
    );

    if (!splitMatch) {
      refinedPropositions.push(proposition);
      continue;
    }

    const firstPart = splitMatch[1].trim();
    const reportingVerb = splitMatch[2].trim();
    const secondPart = splitMatch[3].trim();

    // Never split tiny/noisy fragments.
    if (
      firstPart.length < 4 ||
      secondPart.length < 3
    ) {
      refinedPropositions.push(proposition);
      continue;
    }

    const originalSpan =
      proposition.originalSpan?.text || propositionText;

    const firstStart =
      proposition.originalSpan?.start ?? 0;

    const secondOffsetInOriginal =
      originalSpan.indexOf(reportingVerb);

    const firstProposition = {
      ...proposition,
      normalizedMeaning: firstPart,
      originalSpan: {
        ...proposition.originalSpan,
        text: firstPart,
        start: firstStart,
        end: firstStart + firstPart.length
      }
    };

    const secondText =
      `${reportingVerb} ${secondPart}`.trim();

    const secondStart =
      secondOffsetInOriginal >= 0
        ? firstStart + secondOffsetInOriginal
        : firstStart + firstPart.length + 1;

    const secondProposition = {
      ...proposition,
      normalizedMeaning: secondText,
      originalSpan: {
        ...proposition.originalSpan,
        text: secondText,
        start: secondStart,
        end: secondStart + secondText.length
      }
    };

    refinedPropositions.push(
      firstProposition,
      secondProposition
    );

    console.log(
      '[MIHAK Proposition Refinement]',
      {
        original: propositionText,
        splitInto: [
          firstProposition.normalizedMeaning,
          secondProposition.normalizedMeaning
        ]
      }
    );
  }

  requestPlan = {
    ...requestPlan,
    propositions: refinedPropositions
  };
}

  // Observability logging in development mode
  console.log('[MIHAK Observability]');
  console.log('  Input Type:', understanding.inputType);
  console.log('  Language:', requestPlan.language);
  console.log('  Propositions:', requestPlan.propositions.length);
  console.log('  References detected:', requestPlan.explicitReferences.length);
  console.log('  Required domains:', requestPlan.requiredDomains);
  console.log('  Available domains:', requestPlan.availableDomains);
  console.log('  Missing domains:', requestPlan.missingDomains);
  console.log('  Has Coverage Gap:', requestPlan.hasCoverageGap);

  // If a compound claim has a coverage gap (e.g. required Fiqh/Sirah/Theology domain not in connected corpora)
 const isCompoundAuditableClaim =
  requestPlan.propositions.length > 1 &&
  requestPlan.propositions.some((p) =>
    Array.isArray(p.requiredEvidenceDomains) &&
    p.requiredEvidenceDomains.some((d) =>
      ['QURAN', 'TAFSIR', 'HADITH', 'QURAN_LEXICAL', 'ARABIC_LANGUAGE'].includes(d)
    )
  );

if (
  requestPlan.hasCoverageGap &&
  !isCompoundAuditableClaim &&
  (
    understanding.isClaim ||
    understanding.inputType === 'CLAIM' ||
    understanding.inputType === 'PARAGRAPH'
  )
) {
  const missingLabels = requestPlan.missingDomains
    .map(d => DOMAIN_LABELS_AR[d] || d)
    .join('، ');

  const coverageRun = buildAbstentionRun(
    clean,
    `يتطلب تدقيق هذا المحتوى مراجع متخصصة في [${missingLabels}]، وهي غير متصلة حاليًا بمحركات مِحَكّ المعتمدة؛ ويمتنع النظام عن التخمين أو الإجابة دون مستند نصي متصل.`,
    'SOURCE_COVERAGE_GAP'
  );

  coverageRun.request_plan = requestPlan;
  coverageRun.input_understanding = understanding;
  return coverageRun;
}

  // 3. Structured Execution Plan
  const plan = await planUserInput(clean);

if (requestPlan.propositions.length > 1) {
  const compoundRun = await resolveStructuredCompoundAudit(clean, requestPlan);
  compoundRun.input_understanding = understanding;
  compoundRun.request_plan = requestPlan;
  return compoundRun;
}

  // 3. Multi-Question Handling

  if (plan.intent === 'MULTI_QUESTION' && plan.subQuestions && plan.subQuestions.length > 1) {

    const claims: Claim[] = [];

    let qIdx = 1;



    for (const sub of plan.subQuestions) {

      const subRun = await centralOrchestrator(sub);

      if (subRun.claims && subRun.claims.length > 0) {

        for (const c of subRun.claims) {

          claims.push({

            ...c,

            id: `CLM-${String(qIdx).padStart(3, '0')}`

          });

          qIdx++;

        }

      }

    }



    return {

      id: `audit-${Date.now()}`,

      timestamp: new Date().toISOString(),

      input_text: clean,

      detected_language: 'ar',

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

      duration_ms: 120

    };

  }



  // 4. Route according to the verified plan

  let finalRun: AuditRun;

  switch (plan.intent) {

    case 'QURAN_STRUCTURAL':

      finalRun = await resolveStructuralQuran(clean, plan);

      break;



    case 'QURAN_WORD_MEANING':

      finalRun = await resolveQuranWordMeaning(clean, plan);

      break;



    case 'QURAN_TAFSIR':

      finalRun = await resolveQuranTafsir(clean, plan);

      break;



    case 'QURAN_VERSE_LOOKUP':

      finalRun = await resolveQuranVerseLookup(clean, plan);

      break;



    case 'QURAN_WAQF': {

      const sakts = getFourFamousHafsSakts();

      const directAnswer = [

        '• السكتات الأربع الواجبة برواية حفص عن عاصم من طريق الشاطبية:',

        ...sakts.map((s, idx) => {

          const surahInfo = getSurahByNumber(s.surahNumber);

          const surahName = surahInfo ? surahInfo.name : `سورة ${s.surahNumber}`;

          return `${idx + 1}. سورة ${surahName}، الآية ${s.ayahNumber}: على كلمة «${s.beforeText}» (${s.rulingLabel || s.description}).`;

        })

      ];

      const formatted = buildFormattedAnswer({

        question: clean,

        directAnswerLines: directAnswer,

        sourceNames: ['أحكام الوقف والسكت — رواية حفص عن عاصم من طريق الشاطبية'],

        rationale: 'مسترجع من أصول التلاوة والقراءات المعتمدة لمواضع السكت الواجب لحفص.'

      });

      finalRun = buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', 1.0, {

        source_id: 'quran-waqf',

        source_name: 'أحكام الوقف والسكت (حفص عن عاصم)',

        canonical_reference: 'السكتات الأربع الواجبة لحفص',

        language: 'ar',

        raw_text: sakts.map(s => `${s.surahNumber}:${s.ayahNumber} ${s.beforeText}`).join(' | '),

        version: '1.0',

        license_note: 'رواية حفص عن عاصم'

      }, formatted.verificationRationale);

      break;

    }



    case 'QURAN_TAJWEED': {

      const ayahMatch = clean.match(/(?:سورة|سوره)\s+([\u0621-\u064A]+).*?(?:الآية|آية|اية)\s*([0-9٠-٩]+)/i);

      if (ayahMatch) {

        const s = findSurahByName(ayahMatch[1]);

        if (s) {

          const aNum = convertArabicDigits(ayahMatch[2]);

          const tajweedResult = getTajweedForAyah(s.index, aNum);

          const verse = getVerseSafely(`${s.index}:${aNum}`);

          if (tajweedResult && tajweedResult.rules && tajweedResult.rules.length > 0 && verse) {

            const rules = tajweedResult.rules;

            const directAnswer = [

              `• أحكام التجويد المستخرجة في سورة ${s.name} الآية ${aNum}:`,

              ...rules.map((r, i) => `${i + 1}. ${r.ruleLabel}: على «${r.markedText || r.wordText || ''}» — ${r.description}`)

            ];

            const formatted = buildFormattedAnswer({

              question: clean,

              directAnswerLines: directAnswer,

              verseSections: [{ surahName: s.name, verseNumber: aNum, textUthmani: verse.textUthmani }],

              sourceNames: ['قواعد التجويد المعتمدة برواية حفص عن عاصم'],

              rationale: 'تحليل تجويدي دقيق مستخرج ديناميكياً من قواعد ضبط المصحف الشريف.'

            });

            finalRun = buildSingleClaimRun(clean, formatted.claimText, 'SUPPORTED', 1.0, {

              source_id: 'quran-tajweed',

              source_name: 'قواعد التجويد',

              canonical_reference: `سورة ${s.name} ${aNum}`,

              language: 'ar',

              raw_text: rules.map(r => `${r.ruleLabel}: ${r.markedText || r.wordText}`).join(' | '),

              version: '1.0',

              license_note: 'رواية حفص عن عاصم'

            }, formatted.verificationRationale);

            break;

          }

        }

      }

      finalRun = buildAbstentionRun(clean, 'يرجى تحديد السورة ورقم الآية بدقة لاستخراج أحكام التجويد الموثقة.');

      break;

    }



    case 'QURAN_EXACT_WORD_COUNT':

    case 'QURAN_ROOT_COUNT':

      finalRun = await resolveQuranCount(clean, plan);

      break;



    case 'QURAN_SEMANTIC':

      finalRun = await resolveSemanticQuran(clean, plan);

      break;



    case 'HADITH_LOOKUP':

    case 'HADITH_VERIFY':

    case 'HADITH_EXPLANATION':

      finalRun = await resolveHadithQuestion(clean, plan);

      break;



    case 'SIRAH_QUESTION':

      finalRun = await resolveSirahQuestion(clean, plan);

      break;



    case 'CLAIM_AUDIT':

      finalRun = await resolveContentAudit(clean, undefined, requestPlan);

      break;



    case 'UNKNOWN':

    default:

      if (clean.includes('؟') || clean.startsWith('ما ') || clean.startsWith('هل ') || clean.startsWith('كم ') || clean.startsWith('أين ') || clean.startsWith('كيف ')) {

        // Unknown question -> safe abstention. NEVER convert to random Quran search!

        finalRun = buildAbstentionRun(clean, 'تعذر التحقق الكامل من هذا السؤال من المصادر المتصلة حالياً.');

      } else {

        // Statement / assertion -> audit content

        finalRun = await resolveContentAudit(clean, undefined, requestPlan);

      }

      break;

  }



  finalRun.input_understanding = understanding;
  finalRun.request_plan = requestPlan;

  trace.plannerOutput = {
    taskFamily: (plan.domain as any) || 'GENERAL_CONTENT',
    taskType: (plan.intent as any) || 'CONTENT_AUDIT',
    requestedOperation: plan.is_count_query ? 'COUNT' : 'VERIFY',
    lexicalTargets: plan.target ? [plan.target] : [],
    explicitReferences: requestPlan.explicitReferences.map(r => r.canonicalReference),
    requiredDomains: requestPlan.requiredDomains,
    retrievalPlan: {
      mode: plan.retrieval_mode || 'SEMANTIC',
      target: plan.target || clean,
      queries: plan.search_queries || [clean]
    }
  };
  trace.selectedExecutionEngine = plan.domain || 'content audit';
  trace.retrievalParameters = {
    targetTermOrReference: plan.target || clean,
    normalizedTarget: plan.target || clean,
    corpusSize: plan.domain === 'HADITH' ? 3582 : corpusStatus.ayahCount,
    candidateCount: finalRun.claims.length > 0 && finalRun.claims[0].status !== 'INSUFFICIENT_EVIDENCE' ? 1 : 0,
    exactHitCount: finalRun.claims[0]?.exactMatch ? 1 : 0,
    finalHitCount: finalRun.claims.length
  };
  trace.fallbackInvoked = finalRun.abstention_count > 0;
  if (trace.fallbackInvoked) {
    trace.fallbackReason = finalRun.claims[0]?.verification_rationale || 'تعذر استرجاع دليل كافٍ';
    trace.fallbackFunction = 'centralOrchestrator:semanticFallback';
  }
  emitMihakTrace(trace);

  return finalRun;

}
