import {

  findSurahByName,

  getSurahByNumber,

  getVerseKnowledge,

  getSajdasInSurah,

  getAllSajdas,

  getMorphologyForAyah,

  searchGharib

} from './quranKnowledge';



import {

  getTajweedForAyah,

  findTajweedRuleInAyah,

  getAvailableTajweedRules

} from './quranTajweed';



import {

  explainWaqfSymbol,

  getWaqfMarksFromText,

  getSaktPositionsForAyah,

  getFourFamousHafsSakts

} from './quranWaqf';



import { answerQuranReferenceQuestion } from './quranReferenceEngine';



export type QuranIntent =

  | 'VERSE_LOOKUP'

  | 'TAFSIR'

  | 'EXPLANATION_CHECK'

  | 'SOURCE_BOUND_QA'

  | 'WORD_MEANING'

  | 'IRAB'

  | 'MORPHOLOGY'

  | 'TAJWEED'

  | 'WAQF'

  | 'SAKT'

  | 'SAJDA'

  | 'SURAH_INFO'

  | 'UNKNOWN';



export type QuranReference = {

  surahNumber: number;

  surahName: string;

  ayahNumber?: number;

};



export type QuranRouterResult = {

  intent: QuranIntent;

  understoodAs: string;

  reference?: QuranReference;

  source?: string | string[];

  data?: any;

  message?: string;

  needsSemanticVerification?: boolean;

  fallbackToVerseSearch?: boolean;

};



function normalizeArabicDigits(value: string): string {

  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';

  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';



  return String(value || '')

    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))

    .replace(/[۰-۹]/g, (d) => String(persianDigits.indexOf(d)));

}



function normalizeQuery(text: string): string {

  return normalizeArabicDigits(text)

    .normalize('NFKD')

    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')

    .replace(/ـ/g, '')

    .replace(/[أإآٱ]/g, 'ا')

    .replace(/ى/g, 'ي')

    .replace(/ة/g, 'ه')

    .toLowerCase()

    .replace(/\s+/g, ' ')

    .trim();

}



const ORDINALS: Record<string, number> = {

  الاولى: 1,

  الاول: 1,

  الثانيه: 2,

  الثاني: 2,

  الثالثه: 3,

  الثالث: 3,

  الرابعه: 4,

  الرابع: 4,

  الخامسه: 5,

  الخامس: 5,

  السادسه: 6,

  السادس: 6,

  السابعه: 7,

  السابع: 7,

  الثامنه: 8,

  الثامن: 8,

  التاسعه: 9,

  التاسع: 9,

  العاشره: 10,

  العاشر: 10

};



function extractAyahNumber(query: string): number | undefined {

  const normalized = normalizeQuery(query);



  const numeric = normalized.match(/(?:الايه|ايه)\s\*(?:رقم\s\*)?(\d{1,3})/);

  if (numeric) return Number(numeric[1]);



  for (const [word, number] of Object.entries(ORDINALS)) {

    if (

      normalized.includes(`الايه ${word}`) ||

      normalized.includes(`ايه ${word}`)

    ) {

      return number;

    }

  }



  if (normalized.includes('اول ايه') || normalized.includes('اول الايه')) {

    return 1;

  }



  return undefined;

}



function extractReference(originalQuery: string): QuranReference | null {

  const query = normalizeArabicDigits(originalQuery);



  const numericReference = query.match(/(?:^|\s)(\d{1,3})\s\*[:/]\s\*(\d{1,3})(?:\s|$)/);

  if (numericReference) {

    const surahNumber = Number(numericReference[1]);

    const ayahNumber = Number(numericReference[2]);

    const surah = getSurahByNumber(surahNumber);

    if (!surah) return null;

    return { surahNumber, surahName: surah.name, ayahNumber };

  }



  const surah = findSurahByName(query);

  if (!surah) return null;



  return {

    surahNumber: surah.index,

    surahName: surah.name,

    ayahNumber: extractAyahNumber(query)

  };

}





function extractExplicitAyahNumbers(originalQuery: string): number[] {

  const normalized = normalizeQuery(originalQuery);

  const values = new Set<number>();



  const pairPatterns = [

    /(?:الايتين|الايات)\s\*(\d{1,3})\s\*(?:و|،|,|-)\s\*(\d{1,3})/,

    /(?:الايه|ايه)\s\*(\d{1,3})\s\*(?:و|،|,|-)\s\*(?:الايه|ايه)?\s\*(\d{1,3})/

  ];



  for (const pattern of pairPatterns) {

    const match = normalized.match(pattern);

    if (match) {

      values.add(Number(match[1]));

      values.add(Number(match[2]));

    }

  }



  for (const match of normalized.matchAll(/(?:الايه|ايه)\s\*(?:رقم\s\*)?(\d{1,3})/g)) {

    values.add(Number(match[1]));

  }



  return Array.from(values)

    .filter((n) => Number.isInteger(n) && n > 0 && n <= 300)

    .sort((a, b) => a - b);

}



function looksLikeSourceBoundQuestion(originalQuery: string): boolean {

  const q = normalizeQuery(originalQuery);

  const ayahs = extractExplicitAyahNumbers(originalQuery);



  if (ayahs.length < 2) return false;



  return (

    q.includes('ما الفرق') ||

    q.includes('الفرق بين') ||

    q.includes('هل المقصود') ||

    q.includes('هل المعني') ||

    q.includes('قارن') ||

    q.includes('مقارنه') ||

    q.includes('في الايتين') ||

    q.includes('بين الايتين') ||

    q.includes('في الموضعين') ||

    q.includes('بين الموضعين')

  );

}





function extractRequestedWord(originalQuery: string): string | null {

  const text = String(originalQuery || '').trim();



  // Direct quoted word: معنى «الصمد» / اشرح "الأبتر"

  const quoted = text.match(/[«"'“”]([\u0621-\u064A\u0671\u0649\u0629]+)[»"'“”]/);

  if (quoted?.[1]) return quoted[1].trim();



  const patterns = [

    // تفسير كلمة الكلالة / معنى لفظ الأبتر

    /(?:تفسير|معنى|معني|شرح)\s+(?:كلمة|كلمه|لفظ)\s+([\u0621-\u064A\u0671\u0649\u0629]+)/i,



    // ما معنى الكلالة / ايه معنى الصمد / تفسير الأبتر

    /(?:ما\s+|ايه\s+|إيه\s+)?(?:تفسير|معنى|معني|شرح)\s+([\u0621-\u064A\u0671\u0649\u0629]+)/i,



    // الكلالة يعني ايه / الصمد معناه ايه

    /([\u0621-\u064A\u0671\u0649\u0629]+)\s+(?:يعني\s+ايه|يعنى\s+ايه|معناه\s+ايه|معناها\s+ايه)/i,



    // المقصود بكلمة/بلفظ كذا

    /(?:المقصود\s+ب(?:كلمة|كلمه|لفظ))\s+([\u0621-\u064A\u0671\u0649\u0629]+)/i,



    // كلمة كذا في سورة...

    /(?:كلمة|كلمه|لفظ)\s+([\u0621-\u064A\u0671\u0649\u0629]+)/i

  ];



  const forbidden = new Set([

    'ايه', 'آيه', 'اية', 'الاية', 'الايه',

    'سوره', 'سورة', 'السوره', 'السورة',

    'القران', 'القرآن', 'اللفظ', 'الكلمه', 'الكلمة'

  ].map(normalizeQuery));



  for (const pattern of patterns) {

    const match = text.match(pattern);

    const candidate = match?.[1]?.trim();

    if (!candidate) continue;



    const normalizedCandidate = normalizeQuery(candidate);

    if (!normalizedCandidate || forbidden.has(normalizedCandidate)) continue;



    return candidate;

  }



  return null;

}



function normalizeLexicalText(

  text: string,

  preserveDaggerAlif: boolean

): string {

  let value = normalizeArabicDigits(String(text || ''))

    .normalize('NFKD');



  // Uthmani orthography frequently uses dagger alif (ٰ) instead of a full ا.

  // For lexical search we generate BOTH forms:

  // 1) dagger alif -> ا

  // 2) dagger alif removed

  value = preserveDaggerAlif

    ? value.replace(/\u0670/g, 'ا')

    : value.replace(/\u0670/g, '');



  return value

    .replace(/[\u064B-\u065F\u06D6-\u06ED]/g, '')

    .replace(/ـ/g, '')

    .replace(/[أإآٱ]/g, 'ا')

    .replace(/ى/g, 'ي')

    .replace(/ؤ/g, 'و')

    .replace(/ئ/g, 'ي')

    .replace(/ة/g, 'ه')

    .toLowerCase()

    .replace(/[^\u0621-\u064A0-9\s]/g, ' ')

    .replace(/\s+/g, ' ')

    .trim();

}



function lexicalForms(text: string): string[] {

  const bases = new Set<string>([

    normalizeLexicalText(text, true),

    normalizeLexicalText(text, false)

  ]);



  const forms = new Set<string>();



  const addWithArticleVariants = (value: string) => {

    if (!value) return;

    forms.add(value);



    if (value.startsWith('ال') && value.length > 3) {

      forms.add(value.slice(2));

    }

  };



  for (const raw of bases) {

    if (!raw) continue;



    addWithArticleVariants(raw);



    // Common attached one-letter prefixes.

    if (/^[وفبكلس]/.test(raw) && raw.length > 3) {

      addWithArticleVariants(raw.slice(1));

    }



    // Common combinations such as والـ / فالـ / بالـ / كالـ / للـ.

    if (/^(وال|فال|بال|كال|لل)/.test(raw) && raw.length > 4) {

      const prefixLength = raw.startsWith('لل') ? 2 : 3;

      addWithArticleVariants(raw.slice(prefixLength));

    }

  }



  return Array.from(forms).filter(Boolean);

}





function formsMatch(aForms: string[], bForms: string[]): boolean {

  // Exact lexical matching AFTER Uthmani normalization.

  // We deliberately avoid edit-distance matching here because a one-letter

  // difference can turn a Quranic word into a completely different word.

  for (const a of aForms) {

    for (const b of bForms) {

      if (a === b) return true;

    }

  }



  return false;

}



function verseContainsLexeme(verseText: string, requestedWord: string): boolean {

  const needles = lexicalForms(requestedWord);

  if (!needles.length) return false;



  // Keep the original Uthmani text until each token is normalized so that

  // dagger-alif information is not lost before lexical comparison.

  const rawTokens = String(verseText || '')

    .replace(/[ۘۙۚۗۖۛۜ۩۞]/g, ' ')

    .split(/\s+/)

    .filter(Boolean);



  return rawTokens.some((token) => {

    const tokenForms = lexicalForms(token);

    return formsMatch(tokenForms, needles);

  });

}



function extractRequestedWordMeaning(

  wordMeaningsText: string,

  requestedWord: string

): string | null {

  if (!wordMeaningsText || !requestedWord) return null;



  const needles = lexicalForms(requestedWord);

  const lines = String(wordMeaningsText)

    .split(/\n+/)

    .map((line) => line.trim())

    .filter(Boolean);



  for (const line of lines) {

    const beforeColon = line.split(/[:：]/)[0] || line;

    const tokens = beforeColon

      .replace(/[﴿﴾()[\\]{}،؛,.!?]/g, ' ')

      .split(/\s+/)

      .filter(Boolean);



    const matched = tokens.some((token) =>

      formsMatch(lexicalForms(token), needles)

    );



    if (matched) {

      return line;

    }

  }



  return null;

}



function enrichWordOccurrence(knowledge: any, requestedWord: string) {

  if (!knowledge) return knowledge;



  return {

    ...knowledge,

    requestedWordMeaning: extractRequestedWordMeaning(

      knowledge?.wordMeanings?.text || '',

      requestedWord

    )

  };

}



function findWordOccurrencesInSurah(

  surahNumber: number,

  requestedWord: string

) {

  const surah = getSurahByNumber(surahNumber);

  if (!surah) return [];



  const occurrences: any[] = [];



  for (let ayahNumber = 1; ayahNumber <= surah.ayas; ayahNumber++) {

    const knowledge = getVerseKnowledge(surahNumber, ayahNumber);

    if (!knowledge?.verseText) continue;



    if (verseContainsLexeme(knowledge.verseText, requestedWord)) {

      occurrences.push(enrichWordOccurrence(knowledge, requestedWord));

    }

  }



  return occurrences;

}



function findWordOccurrencesInQuran(requestedWord: string) {

  const occurrences: any[] = [];



  for (let surahNumber = 1; surahNumber <= 114; surahNumber++) {

    const surah = getSurahByNumber(surahNumber);

    if (!surah) continue;



    for (let ayahNumber = 1; ayahNumber <= surah.ayas; ayahNumber++) {

      const knowledge = getVerseKnowledge(surahNumber, ayahNumber);

      if (!knowledge?.verseText) continue;



      if (verseContainsLexeme(knowledge.verseText, requestedWord)) {

        occurrences.push(enrichWordOccurrence(knowledge, requestedWord));

      }

    }

  }



  return occurrences;

}



function detectIntent(originalQuery: string): QuranIntent {

  const q = normalizeQuery(originalQuery);



  if (looksLikeSourceBoundQuestion(originalQuery)) return 'SOURCE_BOUND_QA';



  if (

    q.includes('هل الشرح') ||

    q.includes('هل هذا الشرح') ||

    q.includes('هل التفسير') ||

    q.includes('ينطبق علي الايه') ||

    q.includes('متوافق مع الايه') ||

    q.includes('يتفق مع الايه') ||

    q.includes('هل المعني ده صحيح')

  ) return 'EXPLANATION_CHECK';



  const requestedWord = extractRequestedWord(originalQuery);

  // Never treat a random word inside a longer semantic question as the search term.
  // Enter the lexical route only when the user explicitly asks about a word/lexeme,
  // its meaning, or its occurrences.
  const asksForWordMeaning =
    q.includes('تفسير كلمه') ||
    q.includes('تفسير كلمة') ||
    q.includes('شرح كلمه') ||
    q.includes('شرح كلمة') ||
    q.includes('معني كلمه') ||
    q.includes('معنى كلمه') ||
    q.includes('معني كلمة') ||
    q.includes('معنى كلمة') ||
    q.includes('المقصود بكلمه') ||
    q.includes('المقصود بكلمة') ||
    q.includes('معني لفظ') ||
    q.includes('معنى لفظ') ||
    q.includes('يعني ايه') ||
    q.includes('معناه ايه') ||
    q.includes('معناها ايه') ||
    q.includes('غريب');

  const asksForWordOccurrences =
    q.includes('كم مره وردت') ||
    q.includes('كم مره ورد') ||
    q.includes('عدد مرات ورود') ||
    q.includes('عدد مرات ذكر') ||
    q.includes('اين وردت كلمه') ||
    q.includes('اين ورد لفظ') ||
    q.includes('مواضع كلمه') ||
    q.includes('مواضع كلمة') ||
    q.includes('مواضع لفظ');

  if (requestedWord && (asksForWordMeaning || asksForWordOccurrences)) {
    return 'WORD_MEANING';
  }



  if (

    q.includes('فسر') ||

    q.includes('تفسير') ||

    q.includes('اشرح الايه') ||

    q.includes('شرح الايه') ||

    q.includes('المقصود من الايه') ||

    q.includes('معني الايه') ||

    q.includes('معنى الايه')

  ) return 'TAFSIR';



  if (q.includes('اعراب') || q.includes('اعرب')) return 'IRAB';



  if (

    q.includes('جذر') ||

    q.includes('صرف') ||

    q.includes('صرفي') ||

    q.includes('نوع الكلمه') ||

    q.includes('اصل الكلمه') ||

    q.includes('lemma')

  ) return 'MORPHOLOGY';



  if (

    q.includes('تجويد') ||

    q.includes('ادغام') ||

    q.includes('اخفاء') ||

    q.includes('اقلاب') ||

    q.includes('قلقله') ||

    q.includes('غنه') ||

    q.includes('مد ') ||

    q.includes('مدود') ||

    q.includes('لام شمسيه') ||

    q.includes('همزه وصل')

  ) return 'TAJWEED';



  if (q.includes('سكته') || q.includes('سكتات') || q.includes('السكت')) {

    return 'SAKT';

  }



  if (

    q.includes('وقف') ||

    q.includes('علامه الوقف') ||

    q.includes('علامات الوقف') ||

    /[ۘۙۚۗۖۛ]/.test(originalQuery)

  ) return 'WAQF';



  if (

    q.includes('سجده') ||

    q.includes('سجود') ||

    q.includes('السجود') ||

    q.includes('سجود التلاوه') ||

    q.includes('سجدات') ||

    q.includes('عدد السجود')

  ) return 'SAJDA';



  if (

    q.includes('عدد ايات') ||

    q.includes('مكيه') ||

    q.includes('مدنيه') ||

    q.includes('ترتيب النزول') ||

    q.includes('الجزء') ||

    q.includes('الصفحه') ||

    q.includes('ربع الحزب') ||

    q.includes('معلومات سوره')

  ) return 'SURAH_INFO';



  // Literal Quran search is allowed only when the user explicitly asks for the
  // location of a verse/phrase. Broad semantic questions must not be reduced
  // to one token and searched across the Quran.
  if (
    q.includes('اين وردت') ||
    q.includes('اين ورد') ||
    q.includes('فين الايه') ||
    q.includes('في اي سوره وردت') ||
    q.includes('في انهي سوره وردت') ||
    q.includes('هذه الايه موجوده') ||
    q.includes('الاية دي موجودة') ||
    q.includes('ابحث عن الايه') ||
    q.includes('ابحث عن ايه')
  ) {
    return 'VERSE_LOOKUP';
  }



  return 'UNKNOWN';

}



function detectRequestedTajweedRule(query: string): string | null {

  const q = normalizeQuery(query);

  const rules: Array<[string[], string]> = [

    [['ادغام بغير غنه'], 'idgham_wo_ghunnah'],

    [['ادغام بغنه'], 'idgham_ghunnah'],

    [['ادغام شفوي'], 'idgham_shafawi'],

    [['ادغام متجانسين'], 'idgham_mutajanisayn'],

    [['ادغام متقاربين'], 'idgham_mutaqaribayn'],

    [['اخفاء شفوي'], 'ikhafa_shafawi'],

    [['اخفاء'], 'ikhafa'],

    [['اقلاب'], 'iqlab'],

    [['قلقله'], 'qalaqah'],

    [['غنه'], 'ghunnah'],

    [['مد طبيعي'], 'madda_normal'],

    [['مد لازم'], 'madda_necessary'],

    [['مد منفصل'], 'madda_obligatory_monfasel'],

    [['مد متصل'], 'madda_obligatory_mottasel'],

    [['لام شمسيه'], 'laam_shamsiyah'],

    [['همزه وصل'], 'ham_wasl']

  ];



  for (const [terms, key] of rules) {

    if (terms.some((term) => q.includes(term))) return key;

  }

  return null;

}





function detectRequestedWaqfType(query: string) {

  const q = normalizeQuery(query);



  const types = [

    {

      symbol: 'ۘ',

      key: 'necessary_stop',

      label: 'الوقف اللازم',

      terms: ['وقف لازم', 'الوقف اللازم', 'وقفات لازم', 'الوقفات اللازمه', 'لازم']

    },

    {

      symbol: 'ۙ',

      key: 'do_not_stop',

      label: 'علامة عدم الوقف',

      terms: ['لا تقف', 'عدم الوقف', 'ممنوع الوقف']

    },

    {

      symbol: 'ۚ',

      key: 'permissible_stop',

      label: 'الوقف الجائز',

      terms: ['وقف جائز', 'الوقف الجائز', 'جائز']

    },

    {

      symbol: 'ۗ',

      key: 'stop_preferred',

      label: 'الوقف أولى',

      terms: ['الوقف اولي', 'الوقف اولى', 'وقف اولي', 'وقف اولى']

    },

    {

      symbol: 'ۖ',

      key: 'continue_preferred',

      label: 'الوصل أولى',

      terms: ['الوصل اولي', 'الوصل اولى', 'وصل اولي', 'وصل اولى']

    },

    {

      symbol: 'ۛ',

      key: 'paired_stop',

      label: 'وقف التعانق',

      terms: ['تعانق', 'وقف التعانق']

    }

  ];



  return types.find((item) =>

    item.terms.some((term) => q.includes(term))

  ) || null;

}



function countWaqfMarksInSurah(

  surahNumber: number,

  ayahCount: number

) {

  const occurrences: Array<{

    ayahNumber: number;

    symbol: string;

    label: string;

    description: string;

  }> = [];



  const breakdown: Record<string, number> = {

    'ۘ': 0,

    'ۙ': 0,

    'ۚ': 0,

    'ۗ': 0,

    'ۖ': 0,

    'ۛ': 0

  };



  for (let ayahNumber = 1; ayahNumber <= ayahCount; ayahNumber++) {

    const knowledge = getVerseKnowledge(surahNumber, ayahNumber);

    if (!knowledge?.verseText) continue;



    const marks = getWaqfMarksFromText(knowledge.verseText);



    for (const mark of marks) {

      if (breakdown[mark.symbol] === undefined) {

        breakdown[mark.symbol] = 0;

      }



      breakdown[mark.symbol] += 1;



      occurrences.push({

        ayahNumber,

        symbol: mark.symbol,

        label: mark.info.label,

        description: mark.info.description

      });

    }

  }



  return {

    total: occurrences.length,

    breakdown,

    occurrences

  };

}



export function routeQuranQuestion(userQuery: string): QuranRouterResult {

  const intent = detectIntent(userQuery);

  const reference = extractReference(userQuery);



  if (intent === 'SOURCE_BOUND_QA') {

    const ayahNumbers = extractExplicitAyahNumbers(userQuery);



    if (!reference || ayahNumbers.length < 2) {

      return {

        intent,

        understoodAs: 'مقارنة دلالية مقيدة بالمصادر بين مواضع قرآنية',

        source: ['Tanzil Quran Text', 'التفسير الميسر', 'الميسر في غريب القرآن'],

        message: 'حدد اسم السورة ورقمي الآيتين بوضوح.'

      };

    }



    const passages = ayahNumbers

      .map((ayahNumber) =>

        getVerseKnowledge(reference.surahNumber, ayahNumber)

      )

      .filter(Boolean);



    return {

      intent,

      understoodAs: 'مقارنة دلالية مقيدة بالمصادر بين مواضع قرآنية',

      reference: {

        surahNumber: reference.surahNumber,

        surahName: reference.surahName

      },

      source: ['Tanzil Quran Text', 'التفسير الميسر', 'الميسر في غريب القرآن'],

      data: {

        question: userQuery,

        surahNumber: reference.surahNumber,

        surahName: reference.surahName,

        ayahNumbers,

        passages

      },

      needsSemanticVerification: true,

      message: passages.length === ayahNumbers.length

        ? 'تم جلب الآيات والمصادر المرجعية المطلوبة للمقارنة.'

        : 'تم جلب بعض المواضع فقط؛ توجد بيانات ناقصة لأحد المراجع المطلوبة.'

    };

  }





  // General Quran/Mushaf factual reference layer.

  // Handles counts, rankings, pages, juz, surah facts,

  // Mushaf symbols and ضبط conventions without using model memory.

  // Do not send every UNKNOWN question to the reference engine. That old
  // behavior could reduce a full semantic question to a common word such as
  // "من" and then return thousands of irrelevant Quran matches.
  if (intent === 'SURAH_INFO') {

    const referenceAnswer = answerQuranReferenceQuestion(userQuery);



    if (referenceAnswer) {

      return {

        intent: 'SURAH_INFO',

        understoodAs: 'مرجع القرآن والمصحف',

        source: referenceAnswer.source,

        data: referenceAnswer.data ?? {

          answer: referenceAnswer.answer

        },

        message: referenceAnswer.answer

      };

    }

  }



  if (intent === 'VERSE_LOOKUP') {

    return {

      intent,

      understoodAs: 'البحث عن آية أو التحقق من موضعها',

      reference: reference || undefined,

      source: 'Tanzil Quran Corpus',

      fallbackToVerseSearch: true,

      message: 'يتم البحث داخل المصحف المحلي وتحديد السورة والآية.'

    };

  }



  if (intent === 'TAFSIR') {

    if (!reference?.ayahNumber) {

      return {

        intent,

        understoodAs: 'طلب تفسير آية',

        reference: reference || undefined,

        source: 'التفسير الميسر',

        message: 'حدد السورة ورقم الآية.'

      };

    }



    const knowledge = getVerseKnowledge(reference.surahNumber, reference.ayahNumber);

    return {

      intent,

      understoodAs: 'طلب تفسير آية',

      reference,

      source: ['Tanzil Quran Text', 'التفسير الميسر'],

      data: knowledge,

      message: knowledge?.tafsirMuyassar?.text || 'لم يتم العثور على التفسير.'

    };

  }



  if (intent === 'EXPLANATION_CHECK') {

    if (!reference?.ayahNumber) {

      return {

        intent,

        understoodAs: 'فحص شرح المستخدم مقابل الآية والتفسير',

        source: ['Tanzil Quran Text', 'التفسير الميسر'],

        message: 'حدد السورة ورقم الآية لفحص الشرح.'

      };

    }



    const knowledge = getVerseKnowledge(reference.surahNumber, reference.ayahNumber);

    return {

      intent,

      understoodAs: 'فحص شرح المستخدم مقابل المصدر',

      reference,

      source: ['Tanzil Quran Text', 'التفسير الميسر'],

      data: { knowledge, userQuery },

      needsSemanticVerification: true,

      message: 'تم جلب النص القرآني والتفسير المرجعي، ويجب مقارنة شرح المستخدم بالمصدر فقط.'

    };

  }



  if (intent === 'WORD_MEANING') {

    const requestedWord = extractRequestedWord(userQuery);



    if (reference?.ayahNumber) {

      const knowledge = getVerseKnowledge(reference.surahNumber, reference.ayahNumber);

      return {

        intent,

        understoodAs: 'شرح غريب ومعاني كلمات الآية',

        reference,

        source: ['Tanzil Quran Text', 'الميسر في غريب القرآن', 'التفسير الميسر'],

        data: {

          term: requestedWord,

          knowledge

        },

        message:

          knowledge?.wordMeanings?.text ||

          knowledge?.tafsirMuyassar?.text ||

          'لم يتم العثور على شرح للكلمة في المصادر المتصلة.'

      };

    }



    if (requestedWord && reference) {

      const allOccurrences = findWordOccurrencesInSurah(

        reference.surahNumber,

        requestedWord

      );



      const q = normalizeQuery(userQuery);

      const wantsFirstAndLast =

        (q.includes('اول') && q.includes('اخر')) ||

        q.includes('اول السوره') ||

        q.includes('اخر السوره');



      let selectedOccurrences = allOccurrences;



      if (wantsFirstAndLast && allOccurrences.length > 1) {

        const first = allOccurrences[0];

        const last = allOccurrences[allOccurrences.length - 1];



        selectedOccurrences =

          first.ayahNumber === last.ayahNumber

            ? [first]

            : [first, last];

      }



      return {

        intent,

        understoodAs: 'تفسير لفظ قرآني بحسب مواضعه داخل السورة',

        reference,

        source: ['Tanzil Quran Text', 'الميسر في غريب القرآن', 'التفسير الميسر'],

        data: {

          term: requestedWord,

          surahName: reference.surahName,

          totalOccurrences: allOccurrences.length,

          occurrences: selectedOccurrences,

          displayMode: wantsFirstAndLast ? 'first_last' : 'all'

        },

        message: allOccurrences.length

          ? `تم العثور على لفظ «${requestedWord}» في ${allOccurrences.length} موضع/مواضع في سورة ${reference.surahName}.`

          : `لم يُعثر على لفظ «${requestedWord}» في سورة ${reference.surahName} داخل النص القرآني المتصل.`

      };

    }



    if (requestedWord) {

      const allOccurrences = findWordOccurrencesInQuran(requestedWord);

      const displayedOccurrences = allOccurrences.slice(0, 20);



      return {

        intent,

        understoodAs: 'البحث عن لفظ قرآني ومعناه في مواضعه',

        source: ['Tanzil Quran Text', 'الميسر في غريب القرآن', 'التفسير الميسر'],

        data: {

          term: requestedWord,

          totalOccurrences: allOccurrences.length,

          occurrences: displayedOccurrences,

          truncated: allOccurrences.length > displayedOccurrences.length

        },

        message: allOccurrences.length

          ? `تم العثور على لفظ «${requestedWord}» في ${allOccurrences.length} موضع/مواضع في القرآن.`

          : `لم يُعثر على لفظ «${requestedWord}» بصيغته المطابقة في النص القرآني المتصل.`

      };

    }



    const results = searchGharib(userQuery, 10);



    return {

      intent,

      understoodAs: 'البحث عن معنى لفظ قرآني',

      source: 'الميسر في غريب القرآن',

      data: results,

      message: results.length

        ? 'تم العثور على نتائج لمعنى اللفظ.'

        : 'لم يتم العثور على نتيجة كافية.'

    };

  }



  if (intent === 'IRAB') {

    if (!reference?.ayahNumber) {

      return {

        intent,

        understoodAs: 'طلب إعراب',

        source: 'الجدول في إعراب القرآن',

        message: 'حدد السورة ورقم الآية.'

      };

    }



    const knowledge = getVerseKnowledge(reference.surahNumber, reference.ayahNumber);

    return {

      intent,

      understoodAs: 'طلب إعراب آية أو كلمة',

      reference,

      source: ['Tanzil Quran Text', 'الجدول في إعراب القرآن'],

      data: knowledge,

      message: knowledge?.irab?.text || 'لم يتم العثور على الإعراب.'

    };

  }



  if (intent === 'MORPHOLOGY') {

    if (!reference?.ayahNumber) {

      return {

        intent,

        understoodAs: 'طلب تحليل صرفي أو جذر',

        source: 'Quranic Arabic Corpus',

        message: 'حدد السورة ورقم الآية.'

      };

    }



    const knowledge = getVerseKnowledge(reference.surahNumber, reference.ayahNumber);

    const morphology = getMorphologyForAyah(reference.surahNumber, reference.ayahNumber);

    return {

      intent,

      understoodAs: 'التحليل الصرفي والجذر',

      reference,

      source: ['Tanzil Quran Text', 'Quranic Arabic Corpus'],

      data: { knowledge, morphology },

      message: morphology.length ? 'تم جلب التحليل الصرفي.' : 'لم يتم العثور على تحليل صرفي.'

    };

  }



  if (intent === 'TAJWEED') {

    if (!reference?.ayahNumber) {

      return {

        intent,

        understoodAs: 'طلب أحكام التجويد',

        source: 'QPC Hafs Tajweed Dataset',

        data: getAvailableTajweedRules(),

        message: 'حدد السورة ورقم الآية لتحديد المواضع.'

      };

    }



    const knowledge = getVerseKnowledge(reference.surahNumber, reference.ayahNumber);

    const requestedRule = detectRequestedTajweedRule(userQuery);



    if (requestedRule) {

      const occurrences = findTajweedRuleInAyah(

        reference.surahNumber,

        reference.ayahNumber,

        requestedRule

      );

      return {

        intent,

        understoodAs: 'البحث عن حكم تجويد محدد داخل الآية',

        reference,

        source: ['Tanzil Quran Text', 'QPC Hafs Tajweed Dataset'],

        data: { knowledge, occurrences },

        message: occurrences.length

          ? `تم العثور على ${occurrences.length} موضع/مواضع.`

          : 'لم يظهر هذا الحكم في بيانات التجويد المتصلة.'

      };

    }



    const tajweed = getTajweedForAyah(reference.surahNumber, reference.ayahNumber);

    return {

      intent,

      understoodAs: 'عرض أحكام التجويد الموجودة في الآية',

      reference,

      source: ['Tanzil Quran Text', 'QPC Hafs Tajweed Dataset'],

      data: { knowledge, tajweed },

      message: tajweed ? 'تم جلب أحكام التجويد المعلّمة.' : 'لم توجد بيانات تجويد.'

    };

  }



  if (intent === 'WAQF') {

    const symbols = ['ۘ', 'ۙ', 'ۚ', 'ۗ', 'ۖ', 'ۛ'];

    const foundSymbol = symbols.find((symbol) => userQuery.includes(symbol));



    if (foundSymbol) {

      const explanation = explainWaqfSymbol(foundSymbol);

      return {

        intent,

        understoodAs: 'شرح علامة وقف',

        source: 'Tanzil / Medina Mushaf Pause Marks',

        data: explanation,

        message: explanation

          ? `${explanation.label}: ${explanation.description}`

          : 'لم يتم التعرف على علامة الوقف.'

      };

    }



    if (reference?.ayahNumber) {

      const knowledge = getVerseKnowledge(reference.surahNumber, reference.ayahNumber);

      const marks = knowledge ? getWaqfMarksFromText(knowledge.verseText) : [];

      return {

        intent,

        understoodAs: 'عرض علامات الوقف في الآية',

        reference,

        source: ['Tanzil Quran Text', 'Tanzil Pause Marks'],

        data: { knowledge, marks },

        message: marks.length

          ? 'تم جلب علامات الوقف في الآية.'

          : 'لا توجد علامة وقف مدعومة في هذه الآية.'

      };

    }



    if (reference) {

      const surah = getSurahByNumber(reference.surahNumber);



      if (!surah) {

        return {

          intent,

          understoodAs: 'عدّ علامات الوقف في السورة',

          source: 'Tanzil Quran Text',

          message: 'لم أتمكن من تحديد السورة.'

        };

      }



      const counted = countWaqfMarksInSurah(

        surah.index,

        surah.ayas

      );



      const requestedType = detectRequestedWaqfType(userQuery);



      const requestedOccurrences = requestedType

        ? counted.occurrences.filter(

            (item) => item.symbol === requestedType.symbol

          )

        : [];



      return {

        intent,

        understoodAs: requestedType

          ? `عدّ ${requestedType.label} في السورة`

          : 'عدّ علامات الوقف في السورة',

        reference,

        source: ['Tanzil Quran Text', 'Tanzil Pause Marks'],

        data: {

          surahName: surah.name,

          surahNumber: surah.index,

          total: counted.total,

          breakdown: counted.breakdown,

          occurrences: counted.occurrences,

          requestedType,

          requestedCount: requestedType

            ? requestedOccurrences.length

            : undefined,

          requestedOccurrences

        },

        message: requestedType

          ? `في سورة ${surah.name} يوجد ${requestedOccurrences.length} موضع/مواضع تحمل علامة ${requestedType.label} (${requestedType.symbol}) بحسب علامات الوقف في النص المستخدم.`

          : `في سورة ${surah.name} يوجد ${counted.total} علامة وقف من الأنواع المدعومة في النص المستخدم.`

      };

    }



    return {

      intent,

      understoodAs: 'سؤال عن الوقف',

      source: 'Tanzil / Medina Mushaf Pause Marks',

      message: 'حدد العلامة أو اسم السورة أو رقم الآية.'

    };

  }



  if (intent === 'SAKT') {

    if (reference?.ayahNumber) {

      const knowledge = getVerseKnowledge(reference.surahNumber, reference.ayahNumber);

      const positions = getSaktPositionsForAyah(reference.surahNumber, reference.ayahNumber);

      return {

        intent,

        understoodAs: 'البحث عن موضع سكت في الآية',

        reference,

        source: 'Hafs from Asim — stored recitation data',

        data: { knowledge, positions },

        message: positions.length

          ? 'تم العثور على موضع/مواضع سكت في البيانات المخزنة.'

          : 'لا يوجد موضع سكت مخزن لهذه الآية.'

      };

    }



    return {

      intent,

      understoodAs: 'عرض السكتات',

      source: 'Hafs from Asim — stored recitation data',

      data: getFourFamousHafsSakts(),

      message: 'تم عرض السكتات الأربع المشهورة المخزنة مع بيان الرواية والطريق.'

    };

  }



  if (intent === 'SAJDA') {

    if (reference?.ayahNumber) {

      const knowledge = getVerseKnowledge(reference.surahNumber, reference.ayahNumber);

      const sajda = knowledge?.metadata.sajda || null;

      return {

        intent,

        understoodAs: 'التحقق من وجود سجدة في الآية',

        reference,

        source: 'Tanzil Quran Metadata',

        data: { knowledge, sajda },

        message: sajda

          ? 'هذه الآية مسجلة كموضع سجدة في الـmetadata.'

          : 'هذه الآية ليست مسجلة كموضع سجدة في الـmetadata.'

      };

    }



    if (reference) {

      const positions = getSajdasInSurah(reference.surahNumber);

      return {

        intent,

        understoodAs: 'مواضع سجود التلاوة في السورة',

        reference,

        source: 'Tanzil Quran Metadata',

        data: {

          surahName: reference.surahName,

          surahNumber: reference.surahNumber,

          count: positions.length,

          positions

        },

        message: positions.length

          ? `يوجد ${positions.length} موضع/مواضع سجود تلاوة مسجلة في سورة ${reference.surahName}.`

          : `لا توجد سجدة تلاوة مسجلة في سورة ${reference.surahName}.`

      };

    }



    const all = getAllSajdas();

    return {

      intent,

      understoodAs: 'عرض مواضع سجود التلاوة',

      source: 'Tanzil Quran Metadata',

      data: {

        count: all.length,

        positions: all

      },

      message: `يوجد ${all.length} موضع سجدة مسجل في الـmetadata المستخدم.`

    };

  }



  if (intent === 'SURAH_INFO') {

    const surah = reference

      ? getSurahByNumber(reference.surahNumber)

      : findSurahByName(userQuery);



    if (!surah) {

      return {

        intent,

        understoodAs: 'طلب معلومات عن سورة',

        source: 'Tanzil Quran Metadata',

        message: 'لم أتمكن من تحديد اسم السورة.'

      };

    }



    const firstVerse = getVerseKnowledge(surah.index, 1);

    return {

      intent,

      understoodAs: 'معلومات السورة',

      reference: { surahNumber: surah.index, surahName: surah.name },

      source: ['Tanzil Quran Text', 'Tanzil Quran Metadata'],

      data: {

        surahNumber: surah.index,

        name: surah.name,

        ayahCount: surah.ayas,

        type: surah.type,

        revelationOrder: surah.order,

        rukus: surah.rukus,

        firstVerse: firstVerse?.verseText || ''

      },

      message: `سورة ${surah.name} رقم ${surah.index} وعدد آياتها ${surah.ayas}.`

    };

  }



  return {
    intent: 'UNKNOWN',
    understoodAs: 'لم يتم تحديد نوع السؤال بشكل قاطع',
    reference: reference || undefined,
    fallbackToVerseSearch: false,
    message: 'لم يتم تحديد نوع السؤال من هذا المحرك، لذلك لن يتم إجراء بحث لفظي عشوائي داخل القرآن.'
  };
}
