import fs from 'fs';

import { gunzipSync } from 'zlib';

import { fileURLToPath } from 'url';



/* =========================================================

   MIHAK — QURAN KNOWLEDGE LAYER

   Local-only trusted Quran resources.

   Missing optional files do not crash the server.

   ========================================================= */



type TextEntryObject = {

  text: string;

  ayah_keys?: string[];

};



type TextEntry = TextEntryObject | string;

type TextDataset = Record<string, TextEntry>;



type QuranRecord = {

  source_type: string;

  surah_number: number;

  ayah_number: number;

  surah_name_ar: string;

  surah_name_transliteration?: string;

  surah_name_en?: string;

  surah_type?: string;

  revelation_order?: number;

  canonical_reference_ar: string;

  arabic_text: string;

};



type QuranDataset = {

  dataset?: Record<string, any>;

  records: QuranRecord[];

};



type SuraMetadata = {

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



type SajdaMetadata = {

  index: number;

  sura: number;

  aya: number;

  type: string;

};



type QuranMetaDataset = {

  source?: string;

  version?: string;

  license?: string;

  suras: SuraMetadata[];

  juzs: StartPoint[];

  hizbs: StartPoint[];

  manzils?: StartPoint[];

  rukus?: StartPoint[];

  pages: StartPoint[];

  sajdas: SajdaMetadata[];

};



export type QuranVerseMetadata = {

  surahNumber: number;

  surahName: string;

  ayahNumber: number;

  ayahCount: number;

  revelationType?: string;

  revelationOrder?: number;

  juz?: number;

  hizbQuarter?: number;

  page?: number;

  sajda?: { index: number; type: string } | null;

};



export type QuranKnowledgeResult = {

  reference: string;

  surahNumber: number;

  surahName: string;

  ayahNumber: number;

  verseText: string;

  metadata: QuranVerseMetadata;

  tafsirMuyassar?: { source: string; text: string; rawHtml: string };

  wordMeanings?: { source: string; text: string; rawHtml: string };

  irab?: { source: string; text: string; rawHtml: string };

};



export type MorphologyEntry = {

  location: string;

  surahNumber: number;

  ayahNumber: number;

  wordNumber: number;

  segmentNumber: number;

  form: string;

  tag: string;

  features: string;

  lemma?: string;

  root?: string;

};



const DATA_DIR = new URL('../data/', import.meta.url);



function pathFor(name: string): string {

  const p = fileURLToPath(new URL(name, DATA_DIR));

  if (fs.existsSync(p)) return p;

  if (name.endsWith('.gz')) {

    const uncompressed = p.slice(0, -3);

    if (fs.existsSync(uncompressed)) return uncompressed;

  } else {

    const compressed = p + '.gz';

    if (fs.existsSync(compressed)) return compressed;

  }

  return p;

}



function readTextAutoSafe(name: string): string {

  try {

    const p = pathFor(name);



    if (!fs.existsSync(p)) {

      console.warn(`[MIHAK] Quran data file missing: ${name}`);

      return '';

    }



    const buffer = fs.readFileSync(p);



    // Detect GZIP by magic bytes instead of trusting the extension.

    const isGzip =

      buffer.length >= 2 &&

      buffer[0] === 0x1f &&

      buffer[1] === 0x8b;



    const text = isGzip

      ? gunzipSync(buffer).toString('utf8')

      : buffer.toString('utf8');



    if (!text.trim()) {

      console.warn(`[MIHAK] Quran data file is empty: ${name}`);

      return '';

    }



    return text;

  } catch (err) {

    console.warn(`[MIHAK] Could not load ${name}`, err);

    return '';

  }

}



function readJsonAutoSafe<T>(name: string, fallback: T): T {

  const raw = readTextAutoSafe(name);



  if (!raw) {

    return fallback;

  }



  try {

    return JSON.parse(raw) as T;

  } catch (err) {

    console.warn(`[MIHAK] Invalid JSON in ${name}`, err);

    return fallback;

  }

}



const QURAN_DATA = readJsonAutoSafe<QuranDataset>(

  'quran_mihak.json.gz',

  { records: [] }

);



const TAFSIR_DATA = readJsonAutoSafe<TextDataset>(

  'tafsir_muyassar.json',

  {}

);



const GHARIB_DATA = readJsonAutoSafe<TextDataset>(

  'quran_gharib.json.gz',

  {}

);



const IRAB_DATA = readJsonAutoSafe<TextDataset>(

  'quran_irab.json.gz',

  {}

);



const META_DATA = readJsonAutoSafe<QuranMetaDataset>(

  'quran_meta_mihak.json.gz',

  { suras: [], juzs: [], hizbs: [], pages: [], sajdas: [] }

);



const MORPHOLOGY_TEXT = readTextAutoSafe('quran_morphology.txt.gz');



import { getHadithCount } from './hadithEngine';



export const SURAH_METADATA = META_DATA.suras;



export interface CorpusIntegrityReport {

  surahs: number;

  quranRecords: number;

  tafsirRecords: number;

  tafsirUniqueKeys: number;

  missingTafsirKeysCount: number;

  missingTafsirKeysSample: string[];

  gharibRecords: number;

  irabRecords: number;

  hadithRecords: number;

  coveragePercentage: number;

}



export function getCorpusIntegrityReport(): CorpusIntegrityReport {

  let totalVerses = 0;

  let tafsirMatches = 0;

  const missingTafsirKeys: string[] = [];



  for (const surah of SURAH_METADATA) {

    for (let a = 1; a <= surah.ayas; a++) {

      totalVerses++;

      const key = `${surah.index}:${a}`;

      const entry = TAFSIR_DATA[key];

      if (entry && (typeof entry === 'string' ? entry.trim().length > 0 : (entry.text || '').trim().length > 0)) {

        tafsirMatches++;

      } else {

        missingTafsirKeys.push(key);

      }

    }

  }



  const quranCount = Array.isArray(QURAN_DATA.records) ? QURAN_DATA.records.length : 0;

  const tafsirCount = Object.keys(TAFSIR_DATA).length;

  const coveragePercentage = totalVerses > 0 ? (tafsirMatches / totalVerses) * 100 : 0;



  return {

    surahs: SURAH_METADATA.length,

    quranRecords: quranCount,

    tafsirRecords: tafsirCount,

    tafsirUniqueKeys: tafsirMatches,

    missingTafsirKeysCount: missingTafsirKeys.length,

    missingTafsirKeysSample: missingTafsirKeys.slice(0, 5),

    gharibRecords: Object.keys(GHARIB_DATA).length,

    irabRecords: Object.keys(IRAB_DATA).length,

    hadithRecords: getHadithCount(),

    coveragePercentage: Number(coveragePercentage.toFixed(2))

  };

}



const integrityReport = getCorpusIntegrityReport();

console.log('[MIHAK Corpus Integrity Report]', {

  surahs: integrityReport.surahs,

  quranVerses: integrityReport.quranRecords,

  tafsirCoverage: `${integrityReport.tafsirUniqueKeys}/${integrityReport.quranRecords} (${integrityReport.coveragePercentage}%)`,

  missingTafsirKeys: integrityReport.missingTafsirKeysCount,

  gharibRecords: integrityReport.gharibRecords,

  irabRecords: integrityReport.irabRecords,

  hadithRecords: integrityReport.hadithRecords

});



const VERSE_INDEX = new Map<string, QuranRecord>();

for (const record of QURAN_DATA.records || []) {

  VERSE_INDEX.set(`${record.surah_number}:${record.ayah_number}`, record);

}



function normalizeArabic(text: string): string {

  return String(text || '')

    .normalize('NFKD')

    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')

    .replace(/ـ/g, '')

    .replace(/[أإآٱ]/g, 'ا')

    .replace(/ى/g, 'ي')

    .replace(/ؤ/g, 'و')

    .replace(/ئ/g, 'ي')

    .replace(/ة/g, 'ه')

    .replace(/[^\u0621-\u063A\u0641-\u064A0-9\s]/g, ' ')

    .replace(/\s+/g, ' ')

    .trim();

}




export type QuranLexemeOccurrence = {
  record: QuranRecord;
  occurrencesInVerse: number;
};

export type QuranLexemeSearchResult = {
  term: string;
  occurrenceCount: number;
  verseCount: number;
  matches: QuranLexemeOccurrence[];
};

/**
 * Conservative lexical normalization used only for exact-word retrieval.
 * It deliberately preserves letters such as ئ so a nearby spelling is not
 * silently converted into a different Quranic word.
 */
export function normalizeQuranLexemeToken(token: string): string {
  return String(token || '')
    .normalize('NFKD')
    .replace(/\u0670/g, 'ا')
    .replace(/[\u064B-\u065F\u06D6-\u06ED]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0621-\u063A\u0641-\u064A]/g, '')
    .trim();
}

export function matchesQuranLexemeToken(token: string, target: string): boolean {
  const normalizedToken = normalizeQuranLexemeToken(token);
  let normalizedTarget = normalizeQuranLexemeToken(target);

  if (normalizedTarget.startsWith('ال') && normalizedTarget.length > 3) {
    normalizedTarget = normalizedTarget.slice(2);
  }

  if (!normalizedToken || !normalizedTarget) return false;

  const escaped = normalizedTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const suffix = normalizedTarget.endsWith('ا') ? '' : '(?:ا|ه|هم|كم)?';
  const pattern = new RegExp(`^(?:و|ف|ب|ك|ل|لل)?(?:ال)?${escaped}${suffix}$`);
  return pattern.test(normalizedToken);
}

/**
 * Exact lexical lookup over the local Quran corpus. This is intentionally
 * different from semantic/substring search: a standalone word is counted only
 * when the word itself occurs in the Quranic text.
 */
export function searchQuranExactLexeme(target: string): QuranLexemeSearchResult {
  const term = String(target || '').trim();
  let occurrenceCount = 0;
  const matches: QuranLexemeOccurrence[] = [];

  if (!normalizeQuranLexemeToken(term)) {
    return { term, occurrenceCount: 0, verseCount: 0, matches: [] };
  }

  for (const record of QURAN_DATA.records || []) {
    const rawTokens = String(record.arabic_text || '')
      .replace(/[ۘۙۚۗۖۛۜ۩۞]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const count = rawTokens.reduce(
      (sum, token) => sum + (matchesQuranLexemeToken(token, term) ? 1 : 0),
      0
    );

    if (count > 0) {
      occurrenceCount += count;
      matches.push({ record, occurrencesInVerse: count });
    }
  }

  return {
    term,
    occurrenceCount,
    verseCount: matches.length,
    matches
  };
}


export type QuranLexemeCorrection = {
  suggestion: string;
  distance: number;
  confidence: number;
};

let QURAN_LEXEME_VOCAB_CACHE: string[] | null = null;

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

function quranLexemeCandidateForms(token: string): string[] {
  const normalized = normalizeQuranLexemeToken(token);
  if (!normalized) return [];

  const forms = new Set<string>([normalized]);
  const add = (value: string) => {
    const v = String(value || '').trim();
    if (v.length >= 2) forms.add(v);
  };

  if (/^[وفبكلس]/.test(normalized) && normalized.length > 3) {
    add(normalized.slice(1));
  }

  for (const value of Array.from(forms)) {
    if (value.startsWith('ال') && value.length > 4) add(value.slice(2));
    if (value.startsWith('لل') && value.length > 4) add(value.slice(2));
  }

  return Array.from(forms);
}

function getQuranLexemeVocabulary(): string[] {
  if (QURAN_LEXEME_VOCAB_CACHE) return QURAN_LEXEME_VOCAB_CACHE;

  const vocab = new Set<string>();
  for (const record of QURAN_DATA.records || []) {
    const rawTokens = String(record.arabic_text || '')
      .replace(/[ۘۙۚۗۖۛۜ۩۞]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    for (const token of rawTokens) {
      for (const form of quranLexemeCandidateForms(token)) {
        if (form.length >= 2) vocab.add(form);
      }
    }
  }

  QURAN_LEXEME_VOCAB_CACHE = Array.from(vocab);
  return QURAN_LEXEME_VOCAB_CACHE;
}

/**
 * Conservative typo recovery for one Quranic lexical token.
 * It returns a suggestion only when there is one clearly best nearby token.
 * It never silently changes the user's text.
 */
export function suggestQuranLexemeCorrection(target: string): QuranLexemeCorrection | null {
  const normalized = normalizeQuranLexemeToken(target);
  if (!normalized || normalized.includes(' ') || normalized.length < 3) return null;
  if (searchQuranExactLexeme(target).occurrenceCount > 0) return null;

  const maxDistance = normalized.length >= 8 ? 2 : 1;
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let secondDistance = Number.POSITIVE_INFINITY;

  for (const candidate of getQuranLexemeVocabulary()) {
    if (Math.abs(candidate.length - normalized.length) > maxDistance) continue;
    const distance = levenshteinDistance(normalized, candidate);
    if (distance > maxDistance) continue;

    if (distance < bestDistance) {
      secondDistance = bestDistance;
      bestDistance = distance;
      best = candidate;
    } else if (distance < secondDistance && candidate !== best) {
      secondDistance = distance;
    }
  }

  if (!best || !Number.isFinite(bestDistance)) return null;
  if (secondDistance === bestDistance) return null;

  const confidence = 1 - bestDistance / Math.max(normalized.length, best.length);
  if (confidence < 0.76) return null;

  return { suggestion: best, distance: bestDistance, confidence };
}

/**
 * Extracts only the headword entry that actually corresponds to the requested
 * Quranic lexeme. A word merely appearing inside another definition is ignored.
 */
export function extractGharibMeaningForLexeme(rawText: string, target: string): string | null {
  const plain = htmlToPlainText(String(rawText || '')).trim();
  if (!plain) return null;

  const bracketed = /﴿([^﴾]+)﴾\s*[:：]\s*([^﴿\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = bracketed.exec(plain)) !== null) {
    const head = String(match[1] || '').trim();
    const meaning = String(match[2] || '').trim();
    const headTokens = head.split(/\s+/).filter(Boolean);
    if (headTokens.some((token) => matchesQuranLexemeToken(token, target))) {
      return `﴿${head}﴾: ${meaning}`.trim();
    }
  }

  for (const line of plain.split(/\n+/).map((x) => x.trim()).filter(Boolean)) {
    const parts = line.split(/[:：]/);
    if (parts.length < 2) continue;
    const head = parts.shift() || '';
    const meaning = parts.join(':').trim();
    const headTokens = head.replace(/[﴿﴾]/g, ' ').split(/\s+/).filter(Boolean);
    if (headTokens.some((token) => matchesQuranLexemeToken(token, target))) {
      return `${head.trim()}: ${meaning}`.trim();
    }
  }

  return null;
}

function decodeHtmlEntities(text: string): string {

  return text

    .replace(/&nbsp;/g, ' ')

    .replace(/&amp;/g, '&')

    .replace(/&quot;/g, '"')

    .replace(/&#39;/g, "'")

    .replace(/&lt;/g, '<')

    .replace(/&gt;/g, '>');

}



export function htmlToPlainText(html: string): string {

  if (!html) return '';

  return decodeHtmlEntities(

    html

      .replace(/<br\s*\/?>/gi, '\n')

      .replace(/<\/p>/gi, '\n')

      .replace(/<\/h[1-6]>/gi, '\n')

      .replace(/<li[^>]*>/gi, '• ')

      .replace(/<\/li>/gi, '\n')

      .replace(/<[^>]+>/g, '')

      .replace(/\n{3,}/g, '\n\n')

      .replace(/[ \t]{2,}/g, ' ')

      .trim()

  );

}



function verseKey(surahNumber: number, ayahNumber: number): string {

  return `${surahNumber}:${ayahNumber}`;

}



function compareVersePosition(

  surahA: number,

  ayahA: number,

  surahB: number,

  ayahB: number

): number {

  if (surahA !== surahB) return surahA - surahB;

  return ayahA - ayahB;

}



function findContainingSection(

  points: StartPoint[],

  surahNumber: number,

  ayahNumber: number

): number | undefined {

  let result: number | undefined;

  for (const point of points || []) {

    if (compareVersePosition(point.sura, point.aya, surahNumber, ayahNumber) <= 0) {

      result = point.index;

    } else {

      break;

    }

  }

  return result;

}



export function getSurahByNumber(

  surahNumber: number

): SuraMetadata | undefined {

  return META_DATA.suras.find((sura) => sura.index === surahNumber);

}



export function findSurahByName(input: string): SuraMetadata | undefined {

  const cleaned = normalizeArabic(

    String(input || '')

      .replace(/سورة/g, ' ')

      .replace(/سوره/g, ' ')

  );



  if (!cleaned) return undefined;



  const exact = META_DATA.suras.find(

    (sura) => normalizeArabic(sura.name) === cleaned

  );

  if (exact) return exact;



  return META_DATA.suras.find((sura) => {

    const name = normalizeArabic(sura.name);

    return name.length > 1 && cleaned.includes(name);

  });

}



export function getQuranVerse(

  surahNumber: number,

  ayahNumber: number

): QuranRecord | null {

  return VERSE_INDEX.get(verseKey(surahNumber, ayahNumber)) || null;

}



export function getVerseMetadata(

  surahNumber: number,

  ayahNumber: number

): QuranVerseMetadata | null {

  const surah = getSurahByNumber(surahNumber);

  if (!surah || ayahNumber < 1 || ayahNumber > surah.ayas) return null;



  const sajda = META_DATA.sajdas.find(

    (item) => item.sura === surahNumber && item.aya === ayahNumber

  );



  return {

    surahNumber,

    surahName: surah.name,

    ayahNumber,

    ayahCount: surah.ayas,

    revelationType: surah.type,

    revelationOrder: surah.order,

    juz: findContainingSection(META_DATA.juzs, surahNumber, ayahNumber),

    hizbQuarter: findContainingSection(META_DATA.hizbs, surahNumber, ayahNumber),

    page: findContainingSection(META_DATA.pages, surahNumber, ayahNumber),

    sajda: sajda ? { index: sajda.index, type: sajda.type } : null

  };

}



function resolveTextEntry(

  dataset: TextDataset,

  key: string,

  visited = new Set<string>()

): TextEntryObject | null {

  if (visited.has(key)) {

    return null;

  }



  visited.add(key);



  const item = dataset[key];



  if (!item) {

    return null;

  }



  // Some QUL JSON files store secondary ayahs as aliases,

  // e.g. "94:6": "94:5".

  if (typeof item === 'string') {

    return resolveTextEntry(dataset, item, visited);

  }



  if (!item.text) {

    return null;

  }



  return item;

}



function getTextEntry(

  dataset: TextDataset,

  surahNumber: number,

  ayahNumber: number,

  source: string

) {

  const key = verseKey(surahNumber, ayahNumber);

  const item = resolveTextEntry(dataset, key);



  if (!item?.text) {

    return null;

  }



  return {

    source,

    rawHtml: item.text,

    text: htmlToPlainText(item.text)

  };

}



function getTextEntryWithDiskFallback(

  inMemoryDataset: TextDataset,

  fileName: string,

  surahNumber: number,

  ayahNumber: number,

  source: string

) {

  const fromMemory = getTextEntry(

    inMemoryDataset,

    surahNumber,

    ayahNumber,

    source

  );



  if (fromMemory) {

    return fromMemory;

  }



  // Defensive fallback for AI Studio hot-reload/module-cache cases:

  // re-read the local file at request time if the startup cache was empty.

  const reloadedDataset = readJsonAutoSafe<TextDataset>(

    fileName,

    {}

  );



  const fromDisk = getTextEntry(

    reloadedDataset,

    surahNumber,

    ayahNumber,

    source

  );



  if (!fromDisk) {

    console.warn(

      `[MIHAK] No entry found in ${fileName} for ${surahNumber}:${ayahNumber}. ` +

      `Loaded records: ${Object.keys(reloadedDataset).length}`

    );

  }



  return fromDisk;

}



export function getTafsirMuyassar(

  surahNumber: number,

  ayahNumber: number

) {

  return getTextEntryWithDiskFallback(

    TAFSIR_DATA,

    'tafsir_muyassar.json',

    surahNumber,

    ayahNumber,

    'التفسير الميسر'

  );

}



export function getGharibExplanation(

  surahNumber: number,

  ayahNumber: number

) {

  return getTextEntryWithDiskFallback(

    GHARIB_DATA,

    'quran_gharib.json.gz',

    surahNumber,

    ayahNumber,

    'الميسر في غريب القرآن'

  );

}



export function getIrabExplanation(

  surahNumber: number,

  ayahNumber: number

) {

  return getTextEntryWithDiskFallback(

    IRAB_DATA,

    'quran_irab.json.gz',

    surahNumber,

    ayahNumber,

    'الجدول في إعراب القرآن'

  );

}



export function getQuranKnowledgeDiagnostics() {

  return {

    quranRecords: Array.isArray(QURAN_DATA.records)

      ? QURAN_DATA.records.length

      : 0,

    tafsirRecords: Object.keys(TAFSIR_DATA).length,

    gharibRecords: Object.keys(GHARIB_DATA).length,

    irabRecords: Object.keys(IRAB_DATA).length,

    surahs: Array.isArray(META_DATA.suras)

      ? META_DATA.suras.length

      : 0,

    hasTafsir945: Boolean(

      resolveTextEntry(TAFSIR_DATA, '94:5')

    )

  };

}



export function getVerseKnowledge(

  surahNumber: number,

  ayahNumber: number

): QuranKnowledgeResult | null {

  const metadata = getVerseMetadata(surahNumber, ayahNumber);

  const verse = getQuranVerse(surahNumber, ayahNumber);

  if (!metadata || !verse) return null;



  return {

    reference: verse.canonical_reference_ar || `سورة ${metadata.surahName}، الآية ${ayahNumber}`,

    surahNumber,

    surahName: metadata.surahName,

    ayahNumber,

    verseText: verse.arabic_text,

    metadata,

    tafsirMuyassar: getTafsirMuyassar(surahNumber, ayahNumber) || undefined,

    wordMeanings: getGharibExplanation(surahNumber, ayahNumber) || undefined,

    irab: getIrabExplanation(surahNumber, ayahNumber) || undefined

  };

}



export function getAllSajdas() {

  return (META_DATA.sajdas || []).map((sajda) => {

    const surah = getSurahByNumber(sajda.sura);

    return {

      index: sajda.index,

      surahNumber: sajda.sura,

      surahName: surah?.name || '',

      ayahNumber: sajda.aya,

      type: sajda.type,

      reference: surah

        ? `سورة ${surah.name}، الآية ${sajda.aya}`

        : `${sajda.sura}:${sajda.aya}`

    };

  });

}



export function getSajdasInSurah(surahNumber: number) {

  return getAllSajdas().filter((item) => item.surahNumber === surahNumber);

}



function extractFeatureValue(features: string, name: string): string | undefined {

  const match = features.match(new RegExp(`(?:^|\\|)${name}:([^|]+)`));

  return match?.[1];

}



function parseMorphologyLine(line: string): MorphologyEntry | null {

  const columns = line.split('\t');

  if (columns.length < 4) return null;



  const [location, form, tag, features] = columns;

  const match = location.match(/^\((\d+):(\d+):(\d+):(\d+)\)$/);

  if (!match) return null;



  return {

    location,

    surahNumber: Number(match[1]),

    ayahNumber: Number(match[2]),

    wordNumber: Number(match[3]),

    segmentNumber: Number(match[4]),

    form,

    tag,

    features,

    lemma: extractFeatureValue(features, 'LEM'),

    root: extractFeatureValue(features, 'ROOT')

  };

}



const MORPHOLOGY_LINES = MORPHOLOGY_TEXT

  ? MORPHOLOGY_TEXT.split(/\r?\n/).filter((line) => line.startsWith('('))

  : [];



export function getMorphologyForAyah(

  surahNumber: number,

  ayahNumber: number

): MorphologyEntry[] {

  const prefix = `(${surahNumber}:${ayahNumber}:`;

  const results: MorphologyEntry[] = [];



  for (const line of MORPHOLOGY_LINES) {

    if (!line.startsWith(prefix)) continue;

    const parsed = parseMorphologyLine(line);

    if (parsed) results.push(parsed);

  }



  return results;

}



function searchTextDataset(dataset: TextDataset, query: string, limit = 10) {

  const normalizedQuery = normalizeArabic(query);

  if (!normalizedQuery) return [];



  const results: Array<{

    key: string;

    surahNumber: number;

    ayahNumber: number;

    text: string;

  }> = [];



  for (const [key] of Object.entries(dataset)) {

    const item = resolveTextEntry(dataset, key);

    if (!item?.text) continue;



    const plain = htmlToPlainText(item.text);

    if (!normalizeArabic(plain).includes(normalizedQuery)) continue;



    const [surahString, ayahString] = key.split(':');

    results.push({

      key,

      surahNumber: Number(surahString),

      ayahNumber: Number(ayahString),

      text: plain

    });



    if (results.length >= limit) break;

  }



  return results;

}



export function searchTafsir(query: string, limit = 10) {

  return searchTextDataset(TAFSIR_DATA, query, limit);

}



export function searchGharib(query: string, limit = 10) {

  return searchTextDataset(GHARIB_DATA, query, limit);

}





function lightArabicStemToken(token: string): string {

  let word = normalizeArabic(token).replace(/\s+/g, '');



  if (!word) return '';



  if (word.startsWith('ال') && word.length > 4) {

    word = word.slice(2);

  }



  // Common single-letter prefixes. Retrieval aid only.

  if (/^[وفبكل]/.test(word) && word.length > 4) {

    word = word.slice(1);

  }



  const suffixes = [

    'هما', 'كما', 'كم', 'كن', 'هم', 'هن', 'نا',

    'ها', 'ات', 'ون', 'ين', 'ان', 'يه', 'ية',

    'ه', 'ة', 'ي'

  ];



  for (const suffix of suffixes) {

    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {

      word = word.slice(0, -suffix.length);

      break;

    }

  }



  // Common masdar pattern تفعيل -> root-like retrieval key.

  // Example: تقسيم -> قسم

  if (

    word.length === 5 &&

    word.startsWith('ت') &&

    word[3] === 'ي'

  ) {

    word = `${word[1]}${word[2]}${word[4]}`;

  }



  // Example: قسمَت / قسمته after suffix stripping -> قسم

  if (word.length === 4 && word.endsWith('ت')) {

    word = word.slice(0, -1);

  }



  return word;

}



function normalizedTokens(text: string): string[] {

  return normalizeArabic(text)

    .split(' ')

    .map((token) => token.trim())

    .filter(Boolean);

}



export type RankedQuranTextSearchResult = {

  key: string;

  surahNumber: number;

  ayahNumber: number;

  text: string;

  score: number;

  matchedTerms: string[];

};



function searchTextDatasetRanked(

  dataset: TextDataset,

  terms: string[],

  limit = 20

): RankedQuranTextSearchResult[] {

  const normalizedTerms = Array.from(

    new Set(

      terms

        .map((term) => normalizeArabic(term))

        .filter((term) => term.length >= 2)

    )

  );



  if (!normalizedTerms.length) return [];



  const results: RankedQuranTextSearchResult[] = [];



  for (const [key] of Object.entries(dataset)) {

    const item = resolveTextEntry(dataset, key);

    if (!item?.text) continue;



    const plain = htmlToPlainText(item.text);

    const normalizedText = normalizeArabic(plain);

    const textTokens = normalizedTokens(plain);

    const textTokenSet = new Set(textTokens);

    const textStemSet = new Set(

      textTokens

        .map(lightArabicStemToken)

        .filter((stem) => stem.length >= 3)

    );



    let score = 0;

    const matchedTerms: string[] = [];



    for (const term of normalizedTerms) {

      let termScore = 0;



      if (normalizedText.includes(term)) {

        termScore += 10;

      }



      const termTokens = normalizedTokens(term);

      const distinctTermTokens = Array.from(new Set(termTokens));



      for (const token of distinctTermTokens) {

        if (textTokenSet.has(token)) {

          termScore += 2.5;

          continue;

        }



        const stem = lightArabicStemToken(token);

        if (stem.length >= 3 && textStemSet.has(stem)) {

          termScore += 1.5;

        }

      }



      if (termScore > 0) {

        matchedTerms.push(term);

        score += termScore;

      }

    }



    if (!matchedTerms.length) continue;



    // Prefer passages matching several independent query concepts.

    score += matchedTerms.length * 4;



    const [surahString, ayahString] = key.split(':');



    results.push({

      key,

      surahNumber: Number(surahString),

      ayahNumber: Number(ayahString),

      text: plain,

      score,

      matchedTerms

    });

  }



  return results

    .sort((a, b) => {

      if (b.score !== a.score) return b.score - a.score;

      if (b.matchedTerms.length !== a.matchedTerms.length) {

        return b.matchedTerms.length - a.matchedTerms.length;

      }

      if (a.surahNumber !== b.surahNumber) {

        return a.surahNumber - b.surahNumber;

      }

      return a.ayahNumber - b.ayahNumber;

    })

    .slice(0, Math.max(1, limit));

}



export function searchTafsirRanked(

  terms: string[],

  limit = 20

): RankedQuranTextSearchResult[] {

  return searchTextDatasetRanked(

    TAFSIR_DATA,

    terms,

    limit

  );

}



export function searchGharibRanked(

  terms: string[],

  limit = 20

): RankedQuranTextSearchResult[] {

  return searchTextDatasetRanked(

    GHARIB_DATA,

    terms,

    limit

  );

}



export function getQuranKnowledgeStatus() {

  return {

    quranVerses: VERSE_INDEX.size,

    tafsirRecords: Object.keys(TAFSIR_DATA).length,

    gharibRecords: Object.keys(GHARIB_DATA).length,

    irabRecords: Object.keys(IRAB_DATA).length,

    surahs: META_DATA.suras.length,

    juzs: META_DATA.juzs.length,

    hizbQuarters: META_DATA.hizbs.length,

    pages: META_DATA.pages.length,

    sajdas: META_DATA.sajdas.length,

    morphologySegments: MORPHOLOGY_LINES.length,

    sources: [

      'Tanzil Quran Text',

      'Tafsir Muyassar',

      'Al-Muyassar fi Al-Gharib',

      'Al-Jadwal fi I’rab Al-Quran',

      'Tanzil Quran Metadata',

      'Quranic Arabic Corpus Morphology'

    ]

  };

}
