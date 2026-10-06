import fs from 'fs';
import { gunzipSync } from 'zlib';
import { fileURLToPath } from 'url';

/* =========================================================
   MIHAK — QURAN REFERENCE ENGINE
   Deterministic, source-bound answers for Quran/Mushaf facts.
   No model memory is used as evidence.
   ========================================================= */

type QuranRecord = {
  surah_number: number;
  ayah_number: number;
  surah_name_ar: string;
  surah_type?: string;
  revelation_order?: number;
  canonical_reference_ar?: string;
  arabic_text: string;
  bismillah?: string;
};

type QuranDataset = {
  records: QuranRecord[];
};

type SuraMeta = {
  index: number;
  ayas: number;
  start: number;
  name: string;
  tname?: string;
  ename?: string;
  type?: string;
  order?: number;
  rukus?: number;
};

type StartPoint = {
  index: number;
  sura: number;
  aya: number;
};

type SajdaMeta = {
  index: number;
  sura: number;
  aya: number;
  type: string;
};

type QuranMeta = {
  suras: SuraMeta[];
  juzs: StartPoint[];
  hizbs: StartPoint[];   // quarter-hizb start points: normally 240
  manzils?: StartPoint[];
  rukus?: StartPoint[];
  pages: StartPoint[];
  sajdas: SajdaMeta[];
};

type ConventionDataset = {
  dataset?: Record<string, any>;
  waqf_marks?: Array<Record<string, any>>;
  mushaf_marks?: Array<Record<string, any>>;
  dabt_conventions?: Array<Record<string, any>>;
  concepts?: Array<Record<string, any>>;
};

export type QuranReferenceAnswer = {
  answer: string;
  source: string | string[];
  data?: any;
};

const DATA_DIR = new URL('../data/', import.meta.url);

function filePath(name: string): string {
  return fileURLToPath(new URL(name, DATA_DIR));
}

function readTextAuto(name: string): string {
  try {
    const p = filePath(name);
    if (!fs.existsSync(p)) return '';
    const buffer = fs.readFileSync(p);
    const isGzip =
      buffer.length > 1 &&
      buffer[0] === 0x1f &&
      buffer[1] === 0x8b;

    return (
      isGzip
        ? gunzipSync(buffer).toString('utf8')
        : buffer.toString('utf8')
    );
  } catch (err) {
    console.warn(`[MIHAK] Could not read ${name}`, err);
    return '';
  }
}

function readJsonAuto<T>(names: string[], fallback: T): T {
  for (const name of names) {
    const raw = readTextAuto(name);
    if (!raw.trim()) continue;

    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn(`[MIHAK] Invalid JSON in ${name}`, err);
    }
  }
  return fallback;
}

const QURAN = readJsonAuto<QuranDataset>(
  ['quran_mihak.json.gz', 'quran_mihak.json'],
  { records: [] }
);

const META = readJsonAuto<QuranMeta>(
  ['quran_meta_mihak.json.gz', 'quran_meta_mihak.json'],
  { suras: [], juzs: [], hizbs: [], pages: [], sajdas: [] }
);

const CONVENTIONS = readJsonAuto<ConventionDataset>(
  ['quran_conventions_mihak.json'],
  {}
);

function normalizeArabicDigits(value: string): string {
  const ar = '٠١٢٣٤٥٦٧٨٩';
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  return String(value || '')
    .replace(/[٠-٩]/g, d => String(ar.indexOf(d)))
    .replace(/[۰-۹]/g, d => String(fa.indexOf(d)));
}

function normalize(text: string): string {
  return normalizeArabicDigits(text)
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0621-\u063A\u0641-\u064A0-9\s:"«»\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeForCounting(text: string): string {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(text: string): string[] {
  const clean = normalizeForCounting(text);
  return clean ? clean.split(' ') : [];
}

function lettersCount(text: string): number {
  return normalizeForCounting(text).replace(/\s/g, '').length;
}

function position(sura: number, aya: number): number {
  const meta = META.suras.find(s => s.index === sura);
  if (!meta) return 0;
  return meta.start + aya;
}

function containingIndex(
  points: StartPoint[] | undefined,
  surahNumber: number,
  ayahNumber: number
): number | undefined {
  if (!points?.length) return undefined;

  const pos = position(surahNumber, ayahNumber);
  let result: number | undefined;

  for (const point of points) {
    if (position(point.sura, point.aya) <= pos) {
      result = point.index;
    } else {
      break;
    }
  }

  return result;
}

function findSurah(query: string): SuraMeta | undefined {
  const normalized = normalize(query);

  // Treat a number as a surah number only when the user explicitly labels it.
  // Verse numbers such as "12 و176" must never be mistaken for surah 12.
  const explicitNumber = normalized.match(
    /(?:رقم السوره|السوره رقم|سوره رقم|سوره)\s*(\d{1,3})\b/
  );

  if (explicitNumber) {
    const n = Number(explicitNumber[1]);
    const found = META.suras.find(s => s.index === n);
    if (found) return found;
  }

  const q = normalized
    .replace(/\bسوره\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!q) return undefined;

  // Match complete Arabic tokens / phrases, never raw substrings.
  // Example: سورة "ق" must not match the ق inside "تقسيم".
  const paddedQuery = ` ${q} `;

  return META.suras
    .slice()
    .sort((a, b) => normalize(b.name).length - normalize(a.name).length)
    .find((s) => {
      const name = normalize(s.name).trim();
      if (!name) return false;
      return paddedQuery.includes(` ${name} `);
    });
}

type EnrichedVerse = QuranRecord & {
  page?: number;
  juz?: number;
  hizbQuarter?: number;
  manzil?: number;
  ruku?: number;
  wordCount: number;
  letterCount: number;
};

const VERSES: EnrichedVerse[] = (QURAN.records || []).map(record => ({
  ...record,
  page: containingIndex(META.pages, record.surah_number, record.ayah_number),
  juz: containingIndex(META.juzs, record.surah_number, record.ayah_number),
  hizbQuarter: containingIndex(META.hizbs, record.surah_number, record.ayah_number),
  manzil: containingIndex(META.manzils, record.surah_number, record.ayah_number),
  ruku: containingIndex(META.rukus, record.surah_number, record.ayah_number),
  wordCount: words(record.arabic_text).length,
  letterCount: lettersCount(record.arabic_text)
}));

function ref(v: QuranRecord): string {
  return (
    v.canonical_reference_ar ||
    `سورة ${v.surah_name_ar}، الآية ${v.ayah_number}`
  );
}

function groupBy<T, K extends string | number>(
  items: T[],
  key: (item: T) => K | undefined
): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === undefined) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

const BY_SURAH = groupBy(VERSES, v => v.surah_number);
const BY_PAGE = groupBy(VERSES, v => v.page);
const BY_JUZ = groupBy(VERSES, v => v.juz);

function pageInfo(page: number) {
  const rows = BY_PAGE.get(page) || [];
  if (!rows.length) return null;

  const surahs = Array.from(new Set(rows.map(v => v.surah_name_ar)));
  return {
    page,
    verseCount: rows.length,
    wordCount: rows.reduce((s, v) => s + v.wordCount, 0),
    letterCount: rows.reduce((s, v) => s + v.letterCount, 0),
    first: rows[0],
    last: rows[rows.length - 1],
    surahs,
    rows
  };
}

function surahInfo(surah: SuraMeta) {
  const rows = BY_SURAH.get(surah.index) || [];
  const pages = Array.from(
    new Set(rows.map(v => v.page).filter((x): x is number => !!x))
  );
  const juzs = Array.from(
    new Set(rows.map(v => v.juz).filter((x): x is number => !!x))
  );

  return {
    surah,
    rows,
    pages,
    juzs,
    wordCount: rows.reduce((s, v) => s + v.wordCount, 0),
    letterCount: rows.reduce((s, v) => s + v.letterCount, 0),
    sajdas: (META.sajdas || []).filter(x => x.sura === surah.index)
  };
}

function extractNumberAfter(q: string, term: string): number | null {
  const m = normalize(q).match(
    new RegExp(`${term}\\s*(?:رقم\\s*)?(\\d{1,3})`)
  );
  return m ? Number(m[1]) : null;
}

function topBy<T>(items: T[], score: (x: T) => number, max = true): T[] {
  if (!items.length) return [];
  const values = items.map(score);
  const target = max ? Math.max(...values) : Math.min(...values);
  return items.filter(x => score(x) === target);
}

function result(
  answer: string,
  source: string | string[],
  data?: any
): QuranReferenceAnswer {
  return { answer, source, data };
}

function bismillahAnswer(query: string): QuranReferenceAnswer | null {
  const q = normalize(query);

  const asksDoubleBasmala =
    q.includes('بسملتين') ||
    q.includes('بسم الله مرتين') ||
    q.includes('البسمله مرتين') ||
    q.includes('البسملة مرتين') ||
    q.includes('سوره فيها بسملتين') ||
    q.includes('سورة فيها بسملتين');

  const asksWithoutBasmala =
    q.includes('لا تبدا بالبسمله') ||
    q.includes('لا تبدأ بالبسملة') ||
    q.includes('بدون بسمله') ||
    q.includes('بدون بسملة') ||
    q.includes('من غير بسمله') ||
    q.includes('من غير بسملة');

  const asksOpeningCount =
    q.includes('كم سوره تبدا بالبسمله') ||
    q.includes('كم سورة تبدأ بالبسملة') ||
    q.includes('عدد السور التي تبدا بالبسمله') ||
    q.includes('عدد السور التي تبدأ بالبسملة');

  if (!asksDoubleBasmala && !asksWithoutBasmala && !asksOpeningCount) {
    return null;
  }

  const basmalaNeedle = normalizeForCounting(
    'بسم الله الرحمن الرحيم'
  );

  const stats = META.suras.map((surah) => {
    const rows = BY_SURAH.get(surah.index) || [];
    const first = rows.find((row) => row.ayah_number === 1);

    const hasOpeningBasmala = Boolean(
      first?.bismillah &&
      normalizeForCounting(first.bismillah).includes(basmalaNeedle)
    );

    const inVerseOccurrences = rows.filter((row) =>
      normalizeForCounting(row.arabic_text).includes(basmalaNeedle)
    );

    return {
      surah,
      first,
      hasOpeningBasmala,
      inVerseOccurrences,
      totalOccurrences:
        (hasOpeningBasmala ? 1 : 0) +
        inVerseOccurrences.length
    };
  });

  if (asksDoubleBasmala) {
    const matches = stats.filter(
      (item) => item.totalOccurrences >= 2
    );

    if (!matches.length) {
      return result(
        'لم أجد سورة تحقق وصف ورود البسملة مرتين وفق النص القرآني المفهرس.',
        'القرآن الكريم'
      );
    }

    const item = matches[0];
    const internal = item.inVerseOccurrences[0];

    return result(
      [
        `السورة التي وردت فيها البسملة مرتين هي سورة ${item.surah.name}.`,
        item.first?.bismillah
          ? `البسملة الأولى في افتتاح السورة: ﴿${item.first.bismillah}﴾`
          : '',
        internal
          ? `والبسملة الثانية وردت داخل ${ref(internal)}: ﴿${internal.arabic_text}﴾`
          : '',
        'والأدق أن يقال: وردت فيها البسملة مرتين؛ لأن البسملة الثانية ليست في بداية السورة، بل داخل إحدى آياتها.'
      ]
        .filter(Boolean)
        .join('\n'),
      'القرآن الكريم',
      {
        surahNumber: item.surah.index,
        surahName: item.surah.name,
        openingBasmala: item.first?.bismillah || null,
        internalOccurrences: item.inVerseOccurrences.map((verse) => ({
          reference: ref(verse),
          text: verse.arabic_text
        }))
      }
    );
  }

  if (asksWithoutBasmala) {
    const matches = stats.filter(
      (item) => !item.hasOpeningBasmala
    );

    if (!matches.length) {
      return result(
        'لم أجد سورة بلا بسملة افتتاحية وفق البيانات المفهرسة.',
        'القرآن الكريم'
      );
    }

    return result(
      `السورة التي لا تظهر لها بسملة افتتاحية في المصحف المفهرس هي: ${matches
        .map((item) => `سورة ${item.surah.name}`)
        .join('، ')}.`,
      'القرآن الكريم',
      {
        surahs: matches.map((item) => ({
          number: item.surah.index,
          name: item.surah.name
        }))
      }
    );
  }

  if (asksOpeningCount) {
    const count = stats.filter(
      (item) => item.hasOpeningBasmala
    ).length;

    return result(
      `عدد السور التي تظهر لها بسملة افتتاحية في المصحف المفهرس: ${count} سورة.`,
      'القرآن الكريم',
      { count }
    );
  }

  return null;
}

function conventionsAnswer(query: string): QuranReferenceAnswer | null {
  const q = normalize(query);
  const all = [
    ...(CONVENTIONS.waqf_marks || []),
    ...(CONVENTIONS.mushaf_marks || []),
    ...(CONVENTIONS.dabt_conventions || []),
    ...(CONVENTIONS.concepts || [])
  ];

  const symbol = String(query).match(/[ۘۙۚۗۖۛۜ۩۞]/)?.[0];
  if (symbol) {
    const entry = all.find(x => x.symbol === symbol);
    if (entry) {
      return result(
        `${entry.name || entry.term}: ${entry.meaning}`,
        'MIHAK Mushaf Conventions Reference',
        entry
      );
    }
  }

  const match = all.find(entry => {
    const terms = [
      entry.name,
      entry.term,
      ...(Array.isArray(entry.aliases) ? entry.aliases : [])
    ].filter(Boolean).map(normalize);

    return terms.some(t => t && q.includes(t));
  });

  if (match) {
    return result(
      `${match.name || match.term}: ${match.meaning}`,
      'MIHAK Mushaf Conventions Reference',
      match
    );
  }

  if (
    q.includes('اصطلاحات الضبط') ||
    q.includes('علامات الضبط') ||
    q.includes('مصطلحات الرسم') ||
    q.includes('الرسم العثماني') ||
    q.includes('علامات المصحف') ||
    q.includes('دلاله العلامات') ||
    q.includes('دلالة العلامات')
  ) {
    const terms = [
      ...(CONVENTIONS.dabt_conventions || []).map(x => x.term),
      ...(CONVENTIONS.waqf_marks || []).map(x => `${x.display || x.symbol} (${x.name})`),
      ...(CONVENTIONS.mushaf_marks || []).map(x => `${x.symbol} (${x.name})`)
    ].filter(Boolean);

    return result(
      `المرجع المحلي يتضمن ${terms.length} مدخلاً مختصرًا لعلامات واصطلاحات المصحف، منها:\n` +
      terms.map(x => `• ${x}`).join('\n'),
      'MIHAK Mushaf Conventions Reference',
      { terms }
    );
  }

  if (q.includes('تنبيهات المصحف') || q === 'تنبيهات' || q.includes('تنبيهات الضبط')) {
    return result(
      'توجد في المصدر الرسمي لمصحف المدينة أقسام للتنبيهات واصطلاحات الضبط، لكن مِحَكّ لا يعرض نص تنبيه غير موجود حرفيًا في ملف المراجع المحلي. أضف نصوص التنبيهات المعتمدة إلى quran_conventions_mihak.json لتصبح قابلة للبحث.',
      'King Fahd Glorious Qur’an Printing Complex - Hafs App'
    );
  }

  return null;
}

function extractQuotedPhrase(query: string): string | null {
  const arabic = query.match(/«([^»]{1,100})»/);
  if (arabic) return arabic[1].trim();

  const quoted = query.match(/"([^"]{1,100})"/);
  if (quoted) return quoted[1].trim();

  const m = normalizeArabicDigits(query).match(
    /(?:كلمه|كلمة|لفظ|عباره|عبارة)\s+([^\n،؟?]{1,60}?)(?:\s+في\s+(?:القران|القرآن|سوره|سورة)|[؟?]|$)/
  );
  return m ? m[1].trim() : null;
}

function phraseCountAnswer(query: string): QuranReferenceAnswer | null {
  const q = normalize(query);

  if (
    !q.includes('كم مره') &&
    !q.includes('كم مرة') &&
    !q.includes('عدد مرات') &&
    !q.includes('كم موضع')
  ) return null;

  const phrase = extractQuotedPhrase(query);
  if (!phrase) return null;

  const needle = normalizeForCounting(phrase);
  if (!needle) return null;

  const surah = findSurah(query);
  const pool = surah ? (BY_SURAH.get(surah.index) || []) : VERSES;
  const refs: string[] = [];
  let count = 0;

  for (const verse of pool) {
    const hay = normalizeForCounting(verse.arabic_text);
    let start = 0;
    let local = 0;

    while (true) {
      const idx = hay.indexOf(needle, start);
      if (idx < 0) break;
      local += 1;
      start = idx + Math.max(needle.length, 1);
    }

    if (local) {
      count += local;
      if (refs.length < 30) refs.push(ref(verse));
    }
  }

  const scope = surah ? `في سورة ${surah.name}` : 'في النص القرآني المحلي';
  return result(
    `وردت العبارة «${phrase}» ${count} مرة ${scope} وفق المطابقة النصية بعد توحيد الحركات وعلامات الرسم لأغراض البحث.` +
    (refs.length ? `\nالمواضع الأولى:\n${refs.map(x => `• ${x}`).join('\n')}` : ''),
    'Tanzil Quran Text',
    { phrase, count, scope, references: refs }
  );
}

function rankingAnswer(query: string): QuranReferenceAnswer | null {
  const q = normalize(query);

  const surahStats = META.suras.map(s => surahInfo(s));
  const pageStats = Array.from(BY_PAGE.keys())
    .sort((a, b) => Number(a) - Number(b))
    .map(p => pageInfo(Number(p))!)
    .filter(Boolean);

  if (q.includes('اطول سوره') || q.includes('أطول سورة') || q.includes('اكثر سوره ايات')) {
    const byAyahs = topBy(surahStats, x => x.surah.ayas, true);
    const byWords = topBy(surahStats, x => x.wordCount, true);
    return result(
      [
        `بحسب عدد الآيات: ${byAyahs.map(x => `سورة ${x.surah.name} (${x.surah.ayas} آية)`).join('، ')}.`,
        `وبحسب عدد الكلمات المحسوب آليًا من نص Tanzil: ${byWords.map(x => `سورة ${x.surah.name} (${x.wordCount} كلمة)`).join('، ')}.`,
        'لأن كلمة «أطول» قد تعني عدد الآيات أو حجم النص، يعرض مِحَكّ المعيارين بدل خلطهما.'
      ].join('\n'),
      ['Tanzil Quran Metadata', 'Tanzil Quran Text']
    );
  }

  if (q.includes('اقصر سوره') || q.includes('أقصر سورة') || q.includes('اقل سوره ايات')) {
    const byAyahs = topBy(surahStats, x => x.surah.ayas, false);
    const byWords = topBy(surahStats, x => x.wordCount, false);
    return result(
      [
        `بحسب عدد الآيات: ${byAyahs.map(x => `سورة ${x.surah.name} (${x.surah.ayas} آية)`).join('، ')}.`,
        `وبحسب عدد الكلمات المحسوب آليًا: ${byWords.map(x => `سورة ${x.surah.name} (${x.wordCount} كلمة)`).join('، ')}.`
      ].join('\n'),
      ['Tanzil Quran Metadata', 'Tanzil Quran Text']
    );
  }

  if (q.includes('اطول صفحه') || q.includes('أطول صفحة') || q.includes('اكبر صفحه')) {
    const byWords = topBy(pageStats, x => x.wordCount, true);
    const byLetters = topBy(pageStats, x => x.letterCount, true);
    const byVerses = topBy(pageStats, x => x.verseCount, true);

    return result(
      [
        `لا يوجد في الـmetadata مفهوم مستقل اسمه «أطول صفحة»، لذلك يحسبها مِحَكّ بمقاييس واضحة:`,
        `• أكثر صفحة كلمات: ${byWords.map(x => `${x.page} (${x.wordCount} كلمة)`).join('، ')}`,
        `• أكثر صفحة حروفًا: ${byLetters.map(x => `${x.page} (${x.letterCount} حرفًا محسوبًا)`).join('، ')}`,
        `• أكثر صفحة من حيث عدد الآيات التي تقع فيها: ${byVerses.map(x => `${x.page} (${x.verseCount} آية/أجزاء آيات مفهرسة)`).join('، ')}`
      ].join('\n'),
      ['Tanzil Quran Text', 'Tanzil Quran Metadata']
    );
  }

  if (q.includes('اقصر صفحه') || q.includes('أقصر صفحة')) {
    const byWords = topBy(pageStats, x => x.wordCount, false);
    const byLetters = topBy(pageStats, x => x.letterCount, false);
    return result(
      `بحسب النص المفهرس:\n• أقل صفحة كلمات: ${byWords.map(x => `${x.page} (${x.wordCount})`).join('، ')}\n` +
      `• أقل صفحة حروفًا: ${byLetters.map(x => `${x.page} (${x.letterCount})`).join('، ')}`,
      ['Tanzil Quran Text', 'Tanzil Quran Metadata']
    );
  }

  if (q.includes('اطول ايه') || q.includes('أطول آية')) {
    const byWords = topBy(VERSES, x => x.wordCount, true);
    const byLetters = topBy(VERSES, x => x.letterCount, true);
    return result(
      `بحسب عدد الكلمات: ${byWords.map(v => `${ref(v)} (${v.wordCount} كلمة)`).join('، ')}.\n` +
      `وبحسب عدد الحروف المحسوب بعد إزالة علامات الضبط لأغراض العد: ${byLetters.map(v => `${ref(v)} (${v.letterCount} حرفًا)`).join('، ')}.`,
      'Tanzil Quran Text'
    );
  }

  return null;
}

function totalsAnswer(query: string): QuranReferenceAnswer | null {
  const q = normalize(query);

  if (q.includes('كم عدد سور') || q.includes('عدد السور')) {
    return result(`عدد سور القرآن الكريم: ${META.suras.length} سورة.`, 'Tanzil Quran Metadata');
  }

  if (
    (q.includes('كم عدد الايات') || q.includes('عدد ايات القران') || q.includes('عدد آيات القرآن')) &&
    !findSurah(query)
  ) {
    return result(`عدد الآيات المفهرسة في المصحف المستخدم: ${VERSES.length} آية.`, 'Tanzil Quran Text');
  }

  if (q.includes('كم عدد الصفحات') || q.includes('عدد صفحات القران')) {
    return result(`عدد صفحات المصحف المفهرسة: ${META.pages.length} صفحة.`, 'Tanzil Quran Metadata');
  }

  if (q.includes('كم عدد الاجزاء') || q.includes('عدد اجزاء القران')) {
    return result(`عدد أجزاء القرآن: ${META.juzs.length} جزءًا.`, 'Tanzil Quran Metadata');
  }

  if (q.includes('كم عدد الاحزاب') || q.includes('عدد الاحزاب')) {
    const quarters = META.hizbs.length;
    return result(
      `عدد الأحزاب: ${quarters / 4} حزبًا، موزعة على ${quarters} ربع حزب.`,
      'Tanzil Quran Metadata'
    );
  }

  if (q.includes('كم عدد ارباع') || q.includes('عدد ارباع الاحزاب') || q.includes('ربع حزب')) {
    return result(`عدد أرباع الأحزاب: ${META.hizbs.length} ربع حزب.`, 'Tanzil Quran Metadata');
  }

  if (q.includes('كم عدد المنازل') || q.includes('عدد المنازل')) {
    return result(`عدد المنازل: ${META.manzils?.length || 0}.`, 'Tanzil Quran Metadata');
  }

  if (q.includes('كم عدد الركوعات') || q.includes('عدد الركوعات')) {
    return result(`عدد الركوعات: ${META.rukus?.length || 0}.`, 'Tanzil Quran Metadata');
  }

  if (
    (q.includes('كم عدد السجدات') || q.includes('عدد السجدات') || q.includes('كم سجده')) &&
    !findSurah(query)
  ) {
    return result(
      `عدد مواضع سجود التلاوة المسجلة في بيانات المصحف: ${META.sajdas.length}.`,
      'Tanzil Quran Metadata'
    );
  }

  if (q.includes('كم سوره مكيه') || q.includes('عدد السور المكيه')) {
    const n = META.suras.filter(s => s.type === 'Meccan').length;
    return result(`عدد السور المصنفة مكية في بيانات المصحف: ${n} سورة.`, 'Tanzil Quran Metadata');
  }

  if (q.includes('كم سوره مدنيه') || q.includes('عدد السور المدنيه')) {
    const n = META.suras.filter(s => s.type === 'Medinan').length;
    return result(`عدد السور المصنفة مدنية في بيانات المصحف: ${n} سورة.`, 'Tanzil Quran Metadata');
  }

  return null;
}

function pageAnswer(query: string): QuranReferenceAnswer | null {
  const q = normalize(query);
  const pageNumber = extractNumberAfter(q, 'صفحه') ?? extractNumberAfter(q, 'الصفحه');
  if (!pageNumber) return null;

  const info = pageInfo(pageNumber);
  if (!info) {
    return result(`لا توجد صفحة رقم ${pageNumber} في بيانات المصحف المتاحة.`, 'Tanzil Quran Metadata');
  }

  if (q.includes('اول ايه') || q.includes('اول آيه') || q.includes('تبدأ')) {
    return result(
      `أول موضع مفهرس في الصفحة ${pageNumber}: ${ref(info.first)} — ﴿${info.first.arabic_text}﴾`,
      ['Tanzil Quran Text', 'Tanzil Quran Metadata']
    );
  }

  if (q.includes('اخر ايه') || q.includes('آخر آيه') || q.includes('تنتهي')) {
    return result(
      `آخر موضع مفهرس في الصفحة ${pageNumber}: ${ref(info.last)} — ﴿${info.last.arabic_text}﴾`,
      ['Tanzil Quran Text', 'Tanzil Quran Metadata']
    );
  }

  return result(
    [
      `الصفحة ${pageNumber}`,
      `السور الموجودة فيها: ${info.surahs.join('، ')}`,
      `أول موضع: ${ref(info.first)}`,
      `آخر موضع: ${ref(info.last)}`,
      `عدد الآيات/أجزاء الآيات المفهرسة في الصفحة: ${info.verseCount}`,
      `عدد الكلمات المحسوب من النص: ${info.wordCount}`,
      `عدد الحروف المحسوب بعد إزالة علامات الضبط لأغراض العد: ${info.letterCount}`
    ].join('\n'),
    ['Tanzil Quran Text', 'Tanzil Quran Metadata'],
    info
  );
}

function juzAnswer(query: string): QuranReferenceAnswer | null {
  const q = normalize(query);
  const juzNumber = extractNumberAfter(q, 'جزء') ?? extractNumberAfter(q, 'الجزء');
  if (!juzNumber) return null;

  const rows = BY_JUZ.get(juzNumber) || [];
  if (!rows.length) {
    return result(`لا يوجد جزء رقم ${juzNumber} في بيانات المصحف المتاحة.`, 'Tanzil Quran Metadata');
  }

  const pages = Array.from(new Set(rows.map(x => x.page).filter(Boolean)));
  const surahs = Array.from(new Set(rows.map(x => x.surah_name_ar)));

  return result(
    [
      `الجزء ${juzNumber}`,
      `يبدأ عند: ${ref(rows[0])}`,
      `ينتهي عند: ${ref(rows[rows.length - 1])}`,
      `السور التي يمر بها: ${surahs.join('، ')}`,
      `الصفحات المفهرسة: ${pages.length ? `${Math.min(...pages as number[])}–${Math.max(...pages as number[])}` : 'غير متاح'}`,
      `عدد الآيات/أجزاء الآيات المفهرسة داخله: ${rows.length}`
    ].join('\n'),
    ['Tanzil Quran Text', 'Tanzil Quran Metadata']
  );
}

function surahAnswer(query: string): QuranReferenceAnswer | null {
  const surah = findSurah(query);
  if (!surah) return null;

  const q = normalize(query);
  const info = surahInfo(surah);
  const first = info.rows[0];
  const last = info.rows[info.rows.length - 1];

  if (q.includes('قبلها') || q.includes('السوره السابقه') || q.includes('السورة السابقة')) {
    const previous = META.suras.find(s => s.index === surah.index - 1);
    return result(
      previous
        ? `السورة السابقة لسورة ${surah.name} في ترتيب المصحف هي سورة ${previous.name}.`
        : `سورة ${surah.name} هي أول سورة في ترتيب المصحف.`,
      'Tanzil Quran Metadata'
    );
  }

  if (q.includes('بعدها') || q.includes('السوره التاليه') || q.includes('السورة التالية')) {
    const next = META.suras.find(s => s.index === surah.index + 1);
    return result(
      next
        ? `السورة التالية لسورة ${surah.name} في ترتيب المصحف هي سورة ${next.name}.`
        : `سورة ${surah.name} هي آخر سورة في ترتيب المصحف.`,
      'Tanzil Quran Metadata'
    );
  }

  if (q.includes('اول ايه') || q.includes('أول آية') || q.includes('تبدأ')) {
    return result(
      first
        ? `أول آية في سورة ${surah.name}: ﴿${first.arabic_text}﴾ — ${ref(first)}`
        : 'لم تتوفر الآية الأولى.',
      'Tanzil Quran Text'
    );
  }

  if (q.includes('اخر ايه') || q.includes('آخر آية') || q.includes('تنتهي')) {
    return result(
      last
        ? `آخر آية في سورة ${surah.name}: ﴿${last.arabic_text}﴾ — ${ref(last)}`
        : 'لم تتوفر الآية الأخيرة.',
      'Tanzil Quran Text'
    );
  }

  if (q.includes('كم عدد ايات') || q.includes('عدد ايات') || q.includes('عدد آيات')) {
    return result(`عدد آيات سورة ${surah.name}: ${surah.ayas}.`, 'Tanzil Quran Metadata');
  }

  if (q.includes('كم صفحه') || q.includes('عدد صفحات') || q.includes('كام صفحه')) {
    return result(
      `سورة ${surah.name} تمتد عبر ${info.pages.length} صفحة مفهرسة، من الصفحة ${Math.min(...info.pages)} إلى الصفحة ${Math.max(...info.pages)}.`,
      'Tanzil Quran Metadata'
    );
  }

  if (q.includes('في اي صفحه') || q.includes('في انهي صفحه') || q.includes('صفحات السوره')) {
    return result(
      `سورة ${surah.name} تقع في الصفحات المفهرسة من ${Math.min(...info.pages)} إلى ${Math.max(...info.pages)}.`,
      'Tanzil Quran Metadata'
    );
  }

  if (q.includes('في اي جزء') || q.includes('في انهي جزء') || q.includes('اجزاء السوره')) {
    return result(
      `سورة ${surah.name} تقع في الجزء/الأجزاء: ${info.juzs.join('، ')}.`,
      'Tanzil Quran Metadata'
    );
  }

  if (q.includes('كم كلمه') || q.includes('عدد كلمات')) {
    return result(
      `عدد الكلمات المحسوب آليًا في سورة ${surah.name}: ${info.wordCount} كلمة وفق فصل الكلمات في نص Tanzil.`,
      'Tanzil Quran Text'
    );
  }

  if (q.includes('كم حرف') || q.includes('عدد حروف')) {
    return result(
      `عدد الحروف المحسوب آليًا في سورة ${surah.name}: ${info.letterCount} حرفًا بعد إزالة علامات الضبط لأغراض العد. هذا عدّ برمجي وليس مذهبًا تقليديًا في عد الحروف.`,
      'Tanzil Quran Text'
    );
  }

  if (q.includes('كم سجده') || q.includes('عدد السجدات') || q.includes('سجود')) {
    return result(
      `عدد مواضع سجود التلاوة المسجلة في سورة ${surah.name}: ${info.sajdas.length}.` +
      (info.sajdas.length
        ? `\nالمواضع: ${info.sajdas.map(x => `الآية ${x.aya}`).join('، ')}`
        : ''),
      'Tanzil Quran Metadata'
    );
  }

  if (q.includes('كم ركوع') || q.includes('عدد الركوعات')) {
    return result(
      `عدد الركوعات المسجل لسورة ${surah.name} في metadata السور: ${surah.rukus ?? 'غير متاح'}.`,
      'Tanzil Quran Metadata'
    );
  }

  if (q.includes('مكيه') || q.includes('مدنيه') || q.includes('مكان النزول')) {
    const label =
      surah.type === 'Meccan' ? 'مكية' :
      surah.type === 'Medinan' ? 'مدنية' :
      surah.type || 'غير محدد';

    return result(`سورة ${surah.name} مصنفة بأنها ${label}.`, 'Tanzil Quran Metadata');
  }

  if (q.includes('ترتيب النزول')) {
    return result(
      `ترتيب نزول سورة ${surah.name} في بيانات المصدر المستخدم: ${surah.order ?? 'غير متاح'}.`,
      'Tanzil Quran Metadata'
    );
  }

  return result(
    [
      `سورة ${surah.name}`,
      `رقمها في المصحف: ${surah.index}`,
      `عدد الآيات: ${surah.ayas}`,
      `التصنيف: ${surah.type || 'غير محدد'}`,
      surah.order ? `ترتيب النزول: ${surah.order}` : '',
      `الصفحات: ${info.pages.length ? `${Math.min(...info.pages)}–${Math.max(...info.pages)}` : 'غير متاح'}`,
      `الأجزاء: ${info.juzs.join('، ') || 'غير متاح'}`,
      `عدد الكلمات المحسوب آليًا: ${info.wordCount}`,
      `مواضع السجود المسجلة: ${info.sajdas.length}`,
      first ? `أول آية: ﴿${first.arabic_text}﴾` : '',
      last ? `آخر آية: ﴿${last.arabic_text}﴾` : ''
    ].filter(Boolean).join('\n'),
    ['Tanzil Quran Text', 'Tanzil Quran Metadata']
  );
}

export function answerQuranReferenceQuestion(
  query: string
): QuranReferenceAnswer | null {
  const clean = String(query || '').trim();
  if (!clean) return null;

  return (
    bismillahAnswer(clean) ||
    conventionsAnswer(clean) ||
    phraseCountAnswer(clean) ||
    rankingAnswer(clean) ||
    totalsAnswer(clean) ||
    pageAnswer(clean) ||
    juzAnswer(clean) ||
    surahAnswer(clean)
  );
}

export function getQuranReferenceStatus() {
  return {
    verses: VERSES.length,
    surahs: META.suras.length,
    pages: META.pages.length,
    juzs: META.juzs.length,
    hizbQuarters: META.hizbs.length,
    manzils: META.manzils?.length || 0,
    rukus: META.rukus?.length || 0,
    sajdas: META.sajdas.length,
    conventions:
      (CONVENTIONS.waqf_marks?.length || 0) +
      (CONVENTIONS.mushaf_marks?.length || 0) +
      (CONVENTIONS.dabt_conventions?.length || 0) +
      (CONVENTIONS.concepts?.length || 0)
  };
}
