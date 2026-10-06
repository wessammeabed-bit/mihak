/**

 * MIHAK — مِحَكّ

 * Universal Islamic Input Interpreter

 *

 * First-Stage Input Understanding Layer:

 * 1. Understands WHAT THE USER ENTERED before deciding HOW to retrieve evidence.

 * 2. Distinguishes: Single Character, Single Word, Short Phrase, Quran Fragment,

 *    Complete Quran Verse, Multi-Verse, Hadith Fragment, Hadith Text, Religious Term,

 *    Direct Question, Claim, Mixed Content, and Paragraphs.

 * 3. Never treats an unknown input as a random lexical Quran search.

 * 4. Never reduces a semantic sentence to a single token.

 * 5. Uses multi-level progressive retrieval (exact -> contiguous phrase -> token overlap -> semantic rerank).

 */



import type {

  InputUnderstanding,

  InputType,

  CandidateReference,

  Domain,

  AuditRun,

  Claim

} from '../types';



import { searchQuran, normalizeArabicForSearch } from './quranCorpus';

import {

  findSurahByName,

  SURAH_METADATA,

  getQuranVerse,

  searchGharibRanked,

  searchTafsirRanked,

  htmlToPlainText,

  searchQuranExactLexeme,

  suggestQuranLexemeCorrection

} from './quranKnowledge';

import { searchHadiths, normalizeHadithArabic, resolveHadithCandidate, searchHadithExactWord, suggestHadithWordCorrection } from './hadithEngine';

import { buildFormattedAnswer, getQFVerseSync } from './quranFoundationEngine';

import { isTafsirQuery } from './tafsirEngine';



/**

 * Canonical Muqatta'ah / Single-letter openings in the Quran.

 */

const CANONICAL_SINGLE_LETTERS: Record<string, { surahNumber: number; surahName: string; verseNumber: number; text: string }> = {

  'ق': { surahNumber: 50, surahName: 'ق', verseNumber: 1, text: 'قٓ ۚ وَٱلْقُرْءَانِ ٱلْمَجِيدِ' },

  'ن': { surahNumber: 68, surahName: 'القلم', verseNumber: 1, text: 'نٓ ۚ وَٱلْقَلَمِ وَمَا يَسْطُرُونَ' },

  'ص': { surahNumber: 38, surahName: 'ص', verseNumber: 1, text: 'صٓ ۚ وَٱلْقُرْءَانِ ذِى ٱلذِّكْرِ' }

};



/**

 * Canonical short Quranic opening phrases / Muqatta'ah words.

 */

const CANONICAL_OPENINGS: Record<string, { surahNumber: number; surahName: string; verseNumber: number; text: string }> = {

  'الم': { surahNumber: 2, surahName: 'البقرة', verseNumber: 1, text: 'الٓمٓ' },

  'المص': { surahNumber: 7, surahName: 'الأعراف', verseNumber: 1, text: 'الٓمٓصٓ' },

  'الر': { surahNumber: 10, surahName: 'يونس', verseNumber: 1, text: 'الٓر' },

  'المر': { surahNumber: 13, surahName: 'الرعد', verseNumber: 1, text: 'الٓمٓر' },

  'كهيعص': { surahNumber: 19, surahName: 'مريم', verseNumber: 1, text: 'كٓهيعٓصٓ' },

  'طه': { surahNumber: 20, surahName: 'طه', verseNumber: 1, text: 'طه' },

  'طسم': { surahNumber: 26, surahName: 'الشعراء', verseNumber: 1, text: 'طسٓمٓ' },

  'طس': { surahNumber: 27, surahName: 'النمل', verseNumber: 1, text: 'طسٓ' },

  'يس': { surahNumber: 36, surahName: 'يس', verseNumber: 1, text: 'يسٓ' },

  'حم': { surahNumber: 40, surahName: 'غافر', verseNumber: 1, text: 'حمٓ' },

  'عسق': { surahNumber: 42, surahName: 'الشورى', verseNumber: 2, text: 'عٓسٓقٓ' }

};



/**

 * Normalizes Arabic text purely for matching, while preserving original user text.

 */

export function normalizeForUnderstanding(text: string): string {

  if (!text) return '';

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



/**

 * Analyzes the complete input and produces a structured InputUnderstanding object.

 */

export async function interpretUniversalInput(rawInput: string): Promise<InputUnderstanding> {

  const originalQuery = rawInput.trim();

  const normalizedQuery = normalizeForUnderstanding(originalQuery);



  const words = normalizedQuery.split(/\s+/).filter(w => w.length > 0);

  const letterCount = normalizedQuery.replace(/\s+/g, '').length;



  // Interrogative / Question markers

  const hasQuestionMark = originalQuery.includes('؟') || originalQuery.includes('?');

  const startsWithInterrogative = /^(?:ما|ماذا|هل|كم|أين|اين|كيف|لماذا|لم|من هو|من هي|ما هو|ما هي|ما حكم|ما معنى|ما معني|ماهو|ماهي)(?:\s|$)/i.test(originalQuery);

  // Imperative information requests are still user questions semantically.
  // This prevents inputs such as "اشرح حديث ..." from being treated as a bare quotation.
  const startsWithRequest = /^(?:اشرح|فسر|فسّر|وضح|وضّح|بين|بيّن|اذكر|تحقق|تأكد|تاكد)(?:\s|$)/i.test(originalQuery);

  const isQuestion = hasQuestionMark || startsWithInterrogative || startsWithRequest;



  // Mixed quotation markers

  const hasQuranMention = /(?:قال\s+الله|قال\s+تعالى|قوله\s+تعالى|في\s+القرآن|في\s+القران|﴿)/i.test(originalQuery);

  const hasHadithMention = /(?:قال\s+رسول\s+الله|قال\s+النبي|عن\s+(?:عمر|أبي|ابي|ابن|عائشة|علي)|صلى\s+الله\s+عليه\s+وسلم|حديث)/i.test(originalQuery);

  const isMixedContent = hasQuranMention && hasHadithMention && words.length >= 8;



  // 1. SINGLE CHARACTER

  if (letterCount === 1) {

    const singleChar = originalQuery.trim();

    const canonicalOpening = CANONICAL_SINGLE_LETTERS[singleChar] || CANONICAL_SINGLE_LETTERS[normalizeForUnderstanding(singleChar)];



    if (canonicalOpening) {

      return {

        inputType: 'SINGLE_CHARACTER',

        domainCandidates: [{ domain: 'QURAN', confidence: 0.99 }],

        isQuestion: false,

        isClaim: false,

        isQuotation: true,

        isFragment: true,

        isCompleteText: false,

        isLikelyQuran: true,

        isLikelyHadith: false,

        isLikelyTafsir: false,

        isLikelySirah: false,

        detectedEntities: [`حرف «${singleChar}» من فواتح السور`],

        candidateReferences: [{

          sourceId: 'quran-corpus',

          sourceName: 'القرآن الكريم',

          reference: `سورة ${canonicalOpening.surahName}، الآية ${canonicalOpening.verseNumber}`,

          label: 'حرف مقطّع في فواتح السور',

          confidence: 0.99,

          sampleText: canonicalOpening.text

        }],

        confidence: 0.99,

        needsClarification: false,

        normalizedQuery,

        originalQuery

      };

    }



    return {

      inputType: 'SINGLE_CHARACTER',

      domainCandidates: [{ domain: 'UNKNOWN', confidence: 0.1 }],

      isQuestion: false,

      isClaim: false,

      isQuotation: false,

      isFragment: true,

      isCompleteText: false,

      isLikelyQuran: false,

      isLikelyHadith: false,

      isLikelyTafsir: false,

      isLikelySirah: false,

      detectedEntities: [],

      candidateReferences: [],

      confidence: 0.1,

      needsClarification: true,

      clarificationMessage: `أدخلت حرفاً مفرداً («${singleChar}»). يرجى إدخال كلمة أو عبارة أو سؤال شرعي للتحقق منه في المصادر.`,

      normalizedQuery,

      originalQuery

    };

  }



  // 2. MIXED QURAN + HADITH CONTENT

  if (isMixedContent) {

    return {

      inputType: 'MIXED_CONTENT',

      domainCandidates: [

        { domain: 'QURAN', confidence: 0.9 },

        { domain: 'HADITH', confidence: 0.9 },

        { domain: 'CONTENT_AUDIT', confidence: 0.95 }

      ],

      isQuestion: false,

      isClaim: true,

      isQuotation: true,

      isFragment: false,

      isCompleteText: true,

      isLikelyQuran: true,

      isLikelyHadith: true,

      isLikelyTafsir: false,

      isLikelySirah: false,

      detectedEntities: ['نص مركب يجمع بين آية قرآنية وحديث نبوي'],

      candidateReferences: [],

      confidence: 0.95,

      needsClarification: false,

      normalizedQuery,

      originalQuery

    };

  }



  // 3. DIRECT QUESTION

  if (isQuestion) {

    return {

      inputType: 'DIRECT_QUESTION',

      domainCandidates: [{ domain: 'QURAN', confidence: 0.8 }, { domain: 'HADITH', confidence: 0.5 }],

      isQuestion: true,

      isClaim: false,

      isQuotation: false,

      isFragment: false,

      isCompleteText: true,

      isLikelyQuran: isTafsirQuery(originalQuery) || words.some(w => ['سورة', 'سوره', 'اية', 'آية', 'القران', 'القرآن'].includes(w)),

      isLikelyHadith: words.some(w => ['حديث', 'الحديث', 'الرسول', 'النبي', 'رواه'].includes(w)),

      isLikelyTafsir: isTafsirQuery(originalQuery) || words.some(w => ['تفسير', 'معنى', 'معني', 'اشرح', 'المقصود', 'مقصود', 'المراد', 'مراد', 'شرح', 'تاويل', 'تأويل'].includes(w)),

      isLikelySirah: words.some(w => ['غزوة', 'غزوه', 'وفاة', 'مولد', 'هجرة', 'هجره'].includes(w)),

      detectedEntities: [],

      candidateReferences: [],

      confidence: 0.95,

      needsClarification: false,

      normalizedQuery,

      originalQuery

    };

  }



  // 4. SINGLE WORD

  if (words.length === 1) {

    const singleWord = words[0];



    // Check canonical openings (e.g. "الم", "يس", "طه", "حم")

    const opening = CANONICAL_OPENINGS[singleWord];

    if (opening) {

      return {

        inputType: 'QURAN_VERSE',

        domainCandidates: [{ domain: 'QURAN', confidence: 0.99 }],

        isQuestion: false,

        isClaim: false,

        isQuotation: true,

        isFragment: false,

        isCompleteText: true,

        isLikelyQuran: true,

        isLikelyHadith: false,

        isLikelyTafsir: false,

        isLikelySirah: false,

        detectedEntities: [`فاتحة سورة ${opening.surahName}`],

        candidateReferences: [{

          sourceId: 'quran-corpus',

          sourceName: 'القرآن الكريم',

          reference: `سورة ${opening.surahName}، الآية ${opening.verseNumber}`,

          label: 'آية وفاتحة سورة قرآنية',

          confidence: 0.99,

          sampleText: opening.text

        }],

        confidence: 0.99,

        needsClarification: false,

        normalizedQuery,

        originalQuery

      };

    }



    // Check if it is a Surah name (e.g. "الكوثر", "الرحمن", "الفاتحة", "البقرة")

    const surah = findSurahByName(singleWord);

    const surahEntities: string[] = [];

    const candidateRefs: CandidateReference[] = [];



    if (surah) {

      surahEntities.push(`سورة ${surah.name}`);

      candidateRefs.push({

        sourceId: 'quran-metadata',

        sourceName: 'فهرس المصحف الشريف',

        reference: `سورة ${surah.name} (رقم ${surah.index})`,

        label: `اسم سورة في القرآن الكريم (${surah.ayas} آية)`,

        confidence: 0.98

      });

    }



    // Exact lexical retrieval. A standalone word must occur in the source
    // itself; appearances only inside tafsir/explanation do not make it a match.
    const quranLexeme = searchQuranExactLexeme(singleWord);
    for (const match of quranLexeme.matches.slice(0, 3)) {
      candidateRefs.push({
        sourceId: 'quran-corpus',
        sourceName: 'القرآن الكريم',
        reference: match.record.canonical_reference_ar,
        label: 'ورود لفظي مطابق في القرآن الكريم',
        confidence: 0.99,
        sampleText: match.record.arabic_text
      });
    }

    const hadithWordHits = searchHadithExactWord(singleWord, 3);
    for (const hit of hadithWordHits) {
      candidateRefs.push({
        sourceId: 'hadeethenc-local',
        sourceName: 'بيانات HadeethEnc المفهرسة',
        reference: String(hit.record.reference || hit.record.takhrij || hit.record.id || ''),
        label: 'ورود لفظي مطابق في متن حديث',
        confidence: 0.97,
        sampleText: String(hit.record.hadith_text || hit.record.title || '')
      });
    }

    const hasQuranLexeme = quranLexeme.occurrenceCount > 0 || Boolean(surah);
    const hasHadithLexeme = hadithWordHits.length > 0;

    return {

      inputType: surah || hasQuranLexeme || hasHadithLexeme ? 'RELIGIOUS_TERM' : 'SINGLE_WORD',

      domainCandidates: [

        { domain: 'QURAN', confidence: hasQuranLexeme ? 0.95 : 0.25 },

        { domain: 'HADITH', confidence: hasHadithLexeme ? 0.92 : 0.25 }

      ],

      isQuestion: false,

      isClaim: false,

      isQuotation: false,

      isFragment: true,

      isCompleteText: false,

      isLikelyQuran: hasQuranLexeme,

      isLikelyHadith: hasHadithLexeme,

      isLikelyTafsir: false,

      isLikelySirah: false,

      detectedEntities: surahEntities.length > 0 ? surahEntities : [`مفردة «${originalQuery}»`],

      candidateReferences: candidateRefs,

      confidence: candidateRefs.length > 0 ? 0.94 : 0.6,

      needsClarification: candidateRefs.length === 0,

      clarificationMessage: candidateRefs.length === 0

        ? `أدخلت كلمة منفردة («${originalQuery}»). لم يُعثر على ارتباط مباشر في مصادر المصحف أو الحديث.`

        : undefined,

      normalizedQuery,

      originalQuery

    };

  }



  // 5. PROGRESSIVE RETRIEVAL FOR SHORT PHRASES & VERSE/HADITH IDENTIFICATION

  // A. Level 1 & 2: Check Quran Corpus (Exact Full Verse vs Verse Fragment)

  const quranMatches = searchQuran(originalQuery, 5);

  const bestQuran = quranMatches[0];



  if (bestQuran && bestQuran.score >= 0.95 && bestQuran.matchType === 'exact') {

    // Complete exact verse

    return {

      inputType: 'QURAN_VERSE',

      domainCandidates: [{ domain: 'QURAN', confidence: 0.99 }],

      isQuestion: false,

      isClaim: false,

      isQuotation: true,

      isFragment: false,

      isCompleteText: true,

      isLikelyQuran: true,

      isLikelyHadith: false,

      isLikelyTafsir: false,

      isLikelySirah: false,

      detectedEntities: [bestQuran.record.canonical_reference],

      candidateReferences: [{

        sourceId: bestQuran.record.source_id,

        sourceName: bestQuran.record.source_name,

        reference: bestQuran.record.canonical_reference,

        label: 'آية قرآنية تامة',

        confidence: bestQuran.score,

        sampleText: bestQuran.record.raw_text

      }],

      confidence: 0.99,

      needsClarification: false,

      normalizedQuery,

      originalQuery

    };

  }



  if (bestQuran && bestQuran.score >= 0.7) {

  /*
   * A Quran fragment must share the actual requested phrase/tokens.
   * Fuzzy similarity alone is not enough to call something
   * a Quranic fragment.
   */
  const normalizedInput = normalizeArabicForSearch(originalQuery)
    .replace(
      /^(?:القرآن|القران|المصحف)\s+(?:يذكر|يقول|ينص\s+على|يقرر)\s+(?:أن|ان)?\s*/i,
      ''
    )
    .trim();

  const inputTokens = normalizedInput
    .split(/\s+/)
    .filter(token => token.length >= 2);

  const candidateRefs: CandidateReference[] = quranMatches
    .filter(m => {
      const verseNorm = normalizeArabicForSearch(
        String(m.record.raw_text || '')
      );

      /*
       * Exact contiguous phrase wins immediately.
       */
      if (
        normalizedInput &&
        verseNorm.includes(normalizedInput)
      ) {
        return true;
      }

      /*
       * Otherwise require substantial token overlap.
       * This prevents tiny accidental matches such as:
       * "يس" being selected because the query contains "يسرا".
       */
      const matchedTokens = inputTokens.filter(token =>
        verseNorm
          .split(/\s+/)
          .some(verseToken => verseToken === token)
      );

      const coverage =
        inputTokens.length > 0
          ? matchedTokens.length / inputTokens.length
          : 0;

      return (
        m.score >= 0.7 &&
        coverage >= 0.6
      );
    })

    .slice(0, 4)

    .map(m => ({
      sourceId: m.record.source_id,
      sourceName: m.record.source_name,
      reference: m.record.canonical_reference,
      label: 'مقطع قرآني مطابق',
      confidence: m.score,
      sampleText: m.record.raw_text
    }));

  /*
   * Do not classify as a Quran fragment if all candidates
   * disappeared after strict verification.
   */
  if (candidateRefs.length === 0) {
    // Continue to the normal claim / semantic routing below.
  } else {



   return {
  inputType: 'QURAN_FRAGMENT',
  domainCandidates: [{ domain: 'QURAN', confidence: bestQuran.score }],
  isQuestion: false,
  isClaim: false,
  isQuotation: true,
  isFragment: true,
  isCompleteText: false,
  isLikelyQuran: true,
  isLikelyHadith: false,
  isLikelyTafsir: false,
  isLikelySirah: false,
  detectedEntities: candidateRefs.map(c => c.reference),
  candidateReferences: candidateRefs,
  confidence: bestQuran.score,
  needsClarification: false,
  normalizedQuery,
  originalQuery
};

  }
}



  // B. Level 3 & 4: Check Hadith Corpus

  const hadithResults = searchHadiths(originalQuery, 3);

  const bestHadith = hadithResults[0];



  if (bestHadith && bestHadith.score >= 0.75) {

    const isExact = bestHadith.exactPhrase || bestHadith.score >= 0.9;

    return {

      inputType: isExact ? 'HADITH_TEXT' : 'HADITH_FRAGMENT',

      domainCandidates: [{ domain: 'HADITH', confidence: bestHadith.score }],

      isQuestion: false,

      isClaim: false,

      isQuotation: true,

      isFragment: !isExact,

      isCompleteText: isExact,

      isLikelyQuran: false,

      isLikelyHadith: true,

      isLikelyTafsir: false,

      isLikelySirah: false,

      detectedEntities: [bestHadith.record.title || 'حديث شريف'],

      candidateReferences: [{

        sourceId: 'hadeethenc',

        sourceName: 'موسوعة الأحاديث النبوية (HadeethEnc)',

        reference: bestHadith.record.title || `حديث رقم ${bestHadith.record.id}`,

        label: isExact ? 'متن حديث نبوي مطابق' : 'جزء من حديث نبوي',

        confidence: bestHadith.score,

        sampleText: bestHadith.record.hadith_text

      }],

      confidence: bestHadith.score,

      needsClarification: false,

      normalizedQuery,

      originalQuery

    };

  }



  // 6. SHORT PHRASE (2 to 4 words without strong Quran/Hadith match)

  if (words.length <= 4) {

    return {

      inputType: 'SHORT_PHRASE',

      domainCandidates: [

        { domain: 'CONTENT_AUDIT', confidence: 0.6 },

        { domain: 'UNKNOWN', confidence: 0.4 }

      ],

      isQuestion: false,

      isClaim: true,

      isQuotation: false,

      isFragment: true,

      isCompleteText: false,

      isLikelyQuran: false,

      isLikelyHadith: false,

      isLikelyTafsir: false,

      isLikelySirah: false,

      detectedEntities: [],

      candidateReferences: [],

      confidence: 0.6,

      needsClarification: false,

      normalizedQuery,

      originalQuery

    };

  }



  // 7. CLAIM / PARAGRAPH / CONTENT FOR AUDIT (multi-word assertion)

  const isParagraph = words.length > 25 || originalQuery.includes('\n');

  return {

    inputType: isParagraph ? 'PARAGRAPH' : 'CLAIM',

    domainCandidates: [

      { domain: 'CONTENT_AUDIT', confidence: 0.95 },

      { domain: 'QURAN', confidence: 0.3 },

      { domain: 'HADITH', confidence: 0.3 }

    ],

    isQuestion: false,

    isClaim: true,

    isQuotation: false,

    isFragment: false,

    isCompleteText: true,

    isLikelyQuran: hasQuranMention,

    isLikelyHadith: hasHadithMention,

    isLikelyTafsir: false,

    isLikelySirah: false,

    detectedEntities: [],

    candidateReferences: [],

    confidence: 0.9,

    needsClarification: false,

    normalizedQuery,

    originalQuery

  };

}



/**

 * Resolves standalone religious term inputs (e.g. "الصمد", "الكوثر", "الرحمن").

 * Presents verified source-backed findings without inventing a question the user did not ask.

 */

export async function resolveReligiousTermInput(understanding: InputUnderstanding): Promise<AuditRun> {
  const clean = understanding.originalQuery;
  const norm = understanding.normalizedQuery;
  const surah = findSurahByName(norm);

  let quranSearchTerm = clean;
  let quranLexeme = searchQuranExactLexeme(quranSearchTerm);
  const quranCorrection = quranLexeme.occurrenceCount === 0
    ? suggestQuranLexemeCorrection(clean)
    : null;

  if (quranCorrection) {
    quranSearchTerm = quranCorrection.suggestion;
    quranLexeme = searchQuranExactLexeme(quranSearchTerm);
  }

  let hadithSearchTerm = clean;
  let hadithWordHits = searchHadithExactWord(hadithSearchTerm, 5000);
  const hadithCorrection = hadithWordHits.length === 0
    ? suggestHadithWordCorrection(clean)
    : null;

  if (hadithCorrection) {
    hadithSearchTerm = hadithCorrection.suggestion;
    hadithWordHits = searchHadithExactWord(hadithSearchTerm, 5000);
  }

  const lines: string[] = [
    '• المدخل كلمة منفردة، لذلك لم يفترض «مِحَكّ» أنك تقصد معنى أو تفسيرًا بعينه؛ تم فحص الورود اللفظي المباشر في المصادر المتصلة.'
  ];
  const verseSections: Array<{ surahName: string; verseNumber: number; textUthmani: string }> = [];
  const sourceNames: string[] = [];

  if (surah) {
    lines.push(`• الكلمة تطابق أيضًا اسم سورة: سورة ${surah.name} (رقم ${surah.index}، وعدد آياتها ${surah.ayas}).`);
    const firstVerse = getQFVerseSync(`${surah.index}:1`) || getQuranVerse(surah.index, 1);
    if (firstVerse) {
      verseSections.push({
        surahName: surah.name,
        verseNumber: 1,
        textUthmani: 'textUthmani' in firstVerse ? firstVerse.textUthmani : firstVerse.arabic_text
      });
    }
    sourceNames.push('فهرس المصحف الشريف');
  }

  if (quranCorrection && quranLexeme.occurrenceCount > 0) {
    lines.push(`• لم يُعثر على الرسم المكتوب حرفيًا في القرآن، وأقرب لفظ قرآني وحيد بدرجة ثقة مرتفعة هو «${quranSearchTerm}»؛ عُرضت نتائجه مع التنبيه بدل تغيير كلمة المستخدم بصمت.`);
  }

  if (quranLexeme.occurrenceCount > 0) {
    lines.push(`• في القرآن الكريم: ورد اللفظ «${quranSearchTerm}» ${quranLexeme.occurrenceCount} مرة في ${quranLexeme.verseCount} آية.`);
    for (const match of quranLexeme.matches.slice(0, 5)) {
      lines.push(`• ${match.record.canonical_reference_ar}: ﴿${match.record.arabic_text}﴾`);
      if (verseSections.length < 5) {
        verseSections.push({
          surahName: match.record.surah_name_ar,
          verseNumber: match.record.ayah_number,
          textUthmani: match.record.arabic_text
        });
      }
    }
    if (quranLexeme.matches.length > 5) {
      lines.push(`• توجد ${quranLexeme.matches.length - 5} آية إضافية لم تُعرض اختصارًا.`);
    }
    sourceNames.push('القرآن الكريم');
  }

  if (hadithCorrection && hadithWordHits.length > 0) {
    lines.push(`• في فهرس الحديث لم يُعثر على الرسم المكتوب حرفيًا، وأقرب لفظ وحيد بدرجة ثقة مرتفعة هو «${hadithSearchTerm}»؛ عُرضت نتائجه مع التنبيه.`);
  }

  if (hadithWordHits.length > 0) {
    const totalOccurrences = hadithWordHits.reduce((sum: number, hit: { occurrences: number }) => sum + hit.occurrences, 0);
    lines.push(`• في قاعدة الحديث المفهرسة: ظهر اللفظ «${hadithSearchTerm}» ${totalOccurrences} مرة داخل ${hadithWordHits.length} سجلًا حديثيًا.`);
    for (const hit of hadithWordHits.slice(0, 3)) {
      const text = String(hit.record.hadith_text || hit.record.title || '').trim();
      const reference = String(hit.record.reference || hit.record.takhrij || '').trim();
      if (text) lines.push(`• «${text}»${reference ? ` — ${reference}` : ''}`);
    }
    sourceNames.push('بيانات HadeethEnc المفهرسة');
  }

  if (!surah && quranLexeme.occurrenceCount === 0 && hadithWordHits.length === 0) {
    const message = [
      `س: ${clean}`,
      '',
      'ج:',
      '• المدخل كلمة منفردة، ولم يُعثر لها على ورود لفظي مباشر في النص القرآني أو متن الأحاديث المفهرسة.',
      '• لم يستخدم «مِحَكّ» ظهور الكلمة داخل الشروح أو التفاسير وحده باعتباره دليلاً على ورودها في النص المصدر.',
      '• ولم يُجرِ تصحيحًا تخمينيًا لأن التصحيح المحتمل لم يكن فريدًا بما يكفي.',
      '',
      'المصدر:',
      '• القرآن الكريم',
      '• بيانات HadeethEnc المفهرسة'
    ].join('\n');

    const claim: Claim = {
      id: 'CLM-001',
      claim_text: message,
      source_span: { text: clean, start: 0, end: clean.length },
      status: 'INSUFFICIENT_EVIDENCE',
      exactMatch: false,
      evidence_relation: 'UNVERIFIED',
      evidence_passage: clean,
      verification_rationale: 'تم إجراء بحث لفظي مباشر في النصوص المصدرية مع تصحيح محافظ للأخطاء الإملائية، دون الاستدلال من ورود الكلمة داخل الشروح.'
    };

    return {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      input_text: clean,
      detected_language: 'ar',
      input_understanding: understanding,
      claims: [claim],
      stats: { total: 1, supported: 0, partiallySupported: 0, insufficientEvidence: 1, needsSpecialistReview: 0, verifiedQuotes: 0 },
      abstention_count: 1,
      duration_ms: 45
    };
  }

  lines.push('• لو كان المقصود معنى الكلمة أو تفسير موضع بعينه، يمكن طلب ذلك صراحة؛ لم يتم افتراض هذا المقصود من كلمة منفردة.');

  const formatted = buildFormattedAnswer({
    question: clean,
    directAnswerLines: lines,
    verseSections,
    sourceNames: Array.from(new Set(sourceNames)),
    rationale: 'تم فحص الورود اللفظي المباشر للكلمة في النصوص المصدرية أولًا، مع تصحيح محافظ فقط عندما كان هناك مرشح واحد واضح.'
  });

  const claim: Claim = {
    id: 'CLM-001',
    claim_text: formatted.claimText,
    source_span: { text: clean, start: 0, end: clean.length },
    status: 'SUPPORTED',
    exactMatch: true,
    evidence_relation: 'DIRECT_SUPPORT',
    evidence: {
      source_id: 'cross-source-lexical-index',
      source_name: Array.from(new Set(sourceNames)).join(' و '),
      canonical_reference: clean,
      language: 'ar',
      raw_text: lines.join('\n'),
      version: '1.0',
      license_note: 'بحث لفظي مباشر في المصادر المتصلة'
    },
    evidence_passage: lines.join('\n'),
    verification_rationale: formatted.verificationRationale
  };

  return {
    id: `audit-${Date.now()}`,
    timestamp: new Date().toISOString(),
    input_text: clean,
    detected_language: 'ar',
    input_understanding: understanding,
    claims: [claim],
    stats: { total: 1, supported: 1, partiallySupported: 0, insufficientEvidence: 0, needsSpecialistReview: 0, verifiedQuotes: 0 },
    abstention_count: 0,
    duration_ms: 45
  };
}


/**

 * Resolves Quran fragments dynamically from the connected Quran corpus.

 * Identifies the candidate verses with exact citations and provenance.

 */

export async function resolveQuranFragmentInput(understanding: InputUnderstanding): Promise<AuditRun> {

  const clean = understanding.originalQuery;

  const candidateRefs = understanding.candidateReferences;



  const lines: string[] = [
  `• تمت مطابقة مضمون العبارة مع المواضع القرآنية الآتية:`,
  ...candidateRefs.map(
    (c, i) =>
      `${i + 1}. ${c.reference}:\n   ﴿${c.sampleText || ''}﴾`
  )
];



  const verseSections: Array<{ surahName: string; verseNumber: number; textUthmani: string }> = [];

  for (const c of candidateRefs) {

    const sMatch = c.reference.match(/(?:سورة|سوره)\s+([\u0621-\u064A]+).*?(?:الآية|آية|اية)\s*([0-9٠-٩]+)/i);

    if (sMatch) {

      const s = findSurahByName(sMatch[1]);

      if (s) {

        const aNum = Number(sMatch[2]) || 1;

        const v = getQFVerseSync(`${s.index}:${aNum}`);

        if (v) {

          verseSections.push({

            surahName: s.name,

            verseNumber: aNum,

            textUthmani: v.textUthmani

          });

        }

      }

    }

  }



  const formatted = buildFormattedAnswer({

    question: clean,

    directAnswerLines: lines,

    verseSections,

    sourceNames: ['القرآن الكريم (مصحف المدينة النبوية)'],

    rationale: `تم استرجاع ومطابقة المقطع القرآني في ${candidateRefs.length} موضعاً موثقاً من النص القرآني المعتمد.`

  });



  const claim: Claim = {

    id: 'CLM-001',

    claim_text: formatted.claimText,

    source_span: { text: clean, start: 0, end: clean.length },

    status: 'VERIFIED_QUOTE',

    exactMatch: true,

    evidence_relation: 'DIRECT_SUPPORT',

    evidence: {

      source_id: 'quran-corpus',

      source_name: 'القرآن الكريم',

      canonical_reference: candidateRefs.map(c => c.reference).join(' | '),

      language: 'ar',

      raw_text: candidateRefs.map(c => c.sampleText).join(' | '),

      version: '1.0',

      license_note: 'نص قرآني قطعي الثبوت'

    },

    evidence_passage: candidateRefs.map(c => `${c.reference}: ${c.sampleText}`).join('\n'),

    verification_rationale: formatted.verificationRationale

  };



  return {

    id: `audit-${Date.now()}`,

    timestamp: new Date().toISOString(),

    input_text: clean,

    detected_language: 'ar',

    input_understanding: understanding,

    claims: [claim],

    stats: {

      total: 1,

      supported: 0,

      partiallySupported: 0,

      insufficientEvidence: 0,

      needsSpecialistReview: 0,

      verifiedQuotes: 1

    },

    abstention_count: 0,

    duration_ms: 35

  };

}



/**

 * Resolves Hadith fragments or text dynamically from the connected hadith index/source.

 */

export async function resolveHadithFragmentInput(understanding: InputUnderstanding): Promise<AuditRun> {
  const clean = understanding.originalQuery;

  const resolved = await resolveHadithCandidate(clean);
  const fallbackCandidate = understanding.candidateReferences[0];

  if (!resolved && !fallbackCandidate) {
    const reason = 'تعذر العثور على سجل حديثي مطابق بدرجة كافية في المصدر المتصل.';
    const claim: Claim = {
      id: 'CLM-001',
      claim_text: [
        `س: ${clean}`,
        '',
        'ج:',
        `• ${reason}`,
        '',
        'المصدر:',
        '• لم يتم اعتماد حديث دون مطابقة مصدرية كافية.'
      ].join('\n'),
      source_span: { text: clean, start: 0, end: clean.length },
      status: 'INSUFFICIENT_EVIDENCE',
      exactMatch: false,
      evidence_relation: 'UNVERIFIED',
      evidence_passage: reason,
      verification_rationale: reason
    };

    return {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      input_text: clean,
      detected_language: 'ar',
      input_understanding: understanding,
      claims: [claim],
      stats: {
        total: 1,
        supported: 0,
        partiallySupported: 0,
        insufficientEvidence: 1,
        needsSpecialistReview: 0,
        verifiedQuotes: 0
      },
      abstention_count: 1,
      duration_ms: 35
    };
  }

  const record = resolved?.record;
  const hadithText = String(record?.hadith_text || fallbackCandidate?.sampleText || '').trim();
  const reference = String(record?.reference || record?.takhrij || fallbackCandidate?.reference || '').trim();
  const attribution = String(record?.attribution || '').trim();
  const grade = String(record?.grade || '').trim();
  const explanation = String(record?.explanation || '').trim();
  const normalizedRequest = normalizeForUnderstanding(clean);
  const wantsExplanation =
    normalizedRequest.includes('اشرح') ||
    normalizedRequest.includes('شرح حديث') ||
    normalizedRequest.includes('شرح الحديث') ||
    normalizedRequest.includes('معنى الحديث') ||
    normalizedRequest.includes('معني الحديث') ||
    normalizedRequest.includes('المقصود من الحديث') ||
    normalizedRequest.includes('المقصود بالحديث') ||
    normalizedRequest.includes('فسر حديث') ||
    normalizedRequest.includes('فسر الحديث') ||
    normalizedRequest.includes('وضح حديث') ||
    normalizedRequest.includes('وضح الحديث');

  const lines: string[] = [
    wantsExplanation && explanation ? `• الشرح: ${explanation}` : '',
    wantsExplanation && !explanation ? '• عُثر على الحديث، لكن السجل المسترجع من المصدر لا يحتوي شرحًا نصيًا.' : '',
    hadithText ? `• المتن: «${hadithText}»` : '',
    attribution ? `• العزو: ${attribution}` : '',
    grade ? `• الحكم كما أورده المصدر: ${grade}` : '',
    reference ? `• المرجع: ${reference}` : ''
  ].filter(Boolean);

  const sourceName = resolved?.liveVerified
    ? 'موسوعة الأحاديث النبوية (HadeethEnc)'
    : 'نسخة محلية مفهرسة من بيانات HadeethEnc';

  const formatted = buildFormattedAnswer({
    question: clean,
    directAnswerLines: lines,
    sourceNames: [sourceName],
    rationale: resolved?.liveVerified
      ? 'تمت مطابقة النص بالسجل الحديثي الموثق في HadeethEnc.'
      : 'تمت المطابقة على النسخة المحلية المفهرسة من بيانات HadeethEnc.'
  });

  const status = resolved?.exactPhrase || understanding.inputType === 'HADITH_TEXT'
    ? 'VERIFIED_QUOTE'
    : 'SUPPORTED';

  const claim: Claim = {
    id: 'CLM-001',
    claim_text: formatted.claimText,
    source_span: { text: clean, start: 0, end: clean.length },
    status,
    exactMatch: status === 'VERIFIED_QUOTE',
    retrievalSimilarity: resolved?.score ? Number(resolved.score.toFixed(3)) : undefined,
    evidence_relation: 'DIRECT_SUPPORT',
    evidence: {
      source_id: record?.id ? `hadeethenc-${record.id}` : 'hadeethenc-local',
      source_name: sourceName,
      canonical_reference: reference || attribution || 'سجل حديثي مطابق',
      language: 'ar',
      raw_text: hadithText,
      version: '1.0',
      license_note: resolved?.provider || 'HadeethEnc source data'
    },
    evidence_passage: hadithText,
    verification_rationale: formatted.verificationRationale
  };

  return {
    id: `audit-${Date.now()}`,
    timestamp: new Date().toISOString(),
    input_text: clean,
    detected_language: 'ar',
    input_understanding: understanding,
    claims: [claim],
    stats: {
      total: 1,
      supported: status === 'SUPPORTED' ? 1 : 0,
      partiallySupported: 0,
      insufficientEvidence: 0,
      needsSpecialistReview: 0,
      verifiedQuotes: status === 'VERIFIED_QUOTE' ? 1 : 0
    },
    abstention_count: 0,
    duration_ms: 35
  };
}

/**

 * Resolves single character clarification.

 */

export function resolveSingleCharacterClarification(understanding: InputUnderstanding): AuditRun {

  const clean = understanding.originalQuery;

  const reason = understanding.clarificationMessage || `أدخلت حرفاً مفرداً («${clean}»). يرجى إدخال كلمة أو عبارة أو سؤال شرعي للتحقق منه في المصادر.`;



  const claimText = [

    `س: ${clean}`,

    '',

    'ج:',

    `• ${reason}`,

    '',

    'المصدر:',

    '• يتطلب التدقيق إدخال كلمة أو آية أو حديث أو سؤال شرعي مكتمل المعنى.'

  ].join('\n');



  const claim: Claim = {

    id: 'CLM-001',

    claim_text: claimText,

    source_span: { text: clean, start: 0, end: clean.length },

    status: 'INSUFFICIENT_EVIDENCE',

    exactMatch: false,

    evidence_relation: 'UNVERIFIED',

    evidence_passage: reason,

    verification_rationale: reason

  };



  return {

    id: `audit-${Date.now()}`,

    timestamp: new Date().toISOString(),

    input_text: clean,

    detected_language: 'ar',

    input_understanding: understanding,

    claims: [claim],

    stats: {

      total: 1,

      supported: 0,

      partiallySupported: 0,

      insufficientEvidence: 1,

      needsSpecialistReview: 0,

      verifiedQuotes: 0

    },

    abstention_count: 1,

    duration_ms: 10

  };

}
