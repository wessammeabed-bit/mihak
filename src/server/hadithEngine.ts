import fs from 'fs';

import { fileURLToPath } from 'url';

import {
  hadeethEncGetHadithById,
  hadeethEncWordMeaningsToText,
  testHadeethEncConnection,
  type HadeethEncRecord
} from './hadeethEncClient';
import {
  rerankCandidates,
  generateHadithRetrievalQueries,
  classifyHadithSemanticRelation,
  type HadithRelationLabel
} from './semanticProvider';

import { searchDorar } from './dorarClient';

/* =========================================================

   MIHAK — HADITH ENGINE V3

   Local searchable snapshot + live HadeethEnc verification by record ID.

   The engine retrieves source data; it never independently grades hadith.

   ========================================================= */



export type HadithRecord = {

  id: number | string;

  title?: string;

  hadith_text?: string;

  attribution?: string;

  explanation?: string;

  word_meanings?: string;

  benefits?: string;

  grade?: string;

  takhrij?: string;

  reference?: string;

  link?: string;

  provider?:
  | 'HadeethEnc Live API'
  | 'HadeethEnc local snapshot'
  | 'Dorar API';

  raw?: any;

  [key: string]: any;

};



type HadithDataset = {

  dataset?: Record<string, any>;

  records?: HadithRecord[];

};



export type HadithSearchResult = {

  record: HadithRecord;

  score: number;

  exactPhrase: boolean;

  focus: string;

  matchedFields: string[];

};



export type ResolvedHadithCandidate = {

  record: HadithRecord;

  score: number;

  exactPhrase: boolean;

  liveVerified: boolean;

  provider:
  | 'HadeethEnc Live API'
  | 'HadeethEnc local snapshot'
  | 'Dorar API';
  relationLabel?: HadithRelationLabel;

  relationReasoning?: string;

};



const DATA_DIR = new URL('../data/', import.meta.url);



function filePath(name: string): string {

  return fileURLToPath(new URL(name, DATA_DIR));

}



function normalizeRecordShape(record: any): HadithRecord {

  const hints = Array.isArray(record?.hints)

    ? record.hints.map((x: any) => String(x || '').trim()).filter(Boolean).join('\n')

    : String(record?.benefits || '').trim();



  const wordMeanings = Array.isArray(record?.words_meanings)

    ? hadeethEncWordMeaningsToText(record.words_meanings)

    : String(record?.word_meanings || '').trim();



  return {

    ...record,

    id: record?.id ?? '',

    title: String(record?.title || '').trim(),

    hadith_text: String(record?.hadith_text || record?.hadeeth || '').trim(),

    attribution: String(record?.attribution || '').trim(),

    explanation: String(record?.explanation || '').trim(),

    word_meanings: wordMeanings,

    benefits: hints,

    grade: String(record?.grade || '').trim(),

    takhrij: String(record?.takhrij || record?.reference || record?.attribution || '').trim(),

    reference: String(record?.reference || record?.takhrij || '').trim(),

    link: String(record?.link || '').trim()

  };

}


function dorarResultToHadithRecord(
  result: {
    rawHtml: string;
    plainText: string;
  }
): HadithRecord {
  const plainText = String(result?.plainText || '').trim();

  return {
    id: `dorar-${normalizeHadithArabic(plainText).slice(0, 120)}`,
    title: '',
    hadith_text: plainText,
    attribution: '',
    explanation: '',
    word_meanings: '',
    benefits: '',
    grade: '',
    takhrij: '',
    reference: '',
    link: '',
    provider: 'Dorar API',
    raw: {
      html: result?.rawHtml || ''
    }
  };
}


function loadDataset(): HadithDataset {

  try {

    const p = filePath('hadith_mihak.json');



    if (!fs.existsSync(p)) {

      console.warn('[MIHAK] hadith_mihak.json was not found.');

      return { dataset: {}, records: [] };

    }



    const raw = fs.readFileSync(p, 'utf8');

    const parsed = JSON.parse(raw);



    return {

      dataset: parsed?.dataset || {},

      records: Array.isArray(parsed?.records)

        ? parsed.records.map(normalizeRecordShape)

        : []

    };

  } catch (err) {

    console.warn('[MIHAK] Could not load hadith_mihak.json', err);

    return { dataset: {}, records: [] };

  }

}



const DATA = loadDataset();

const RECORDS: HadithRecord[] = DATA.records || [];



export function getHadithCount(): number {

  return RECORDS.length;

}



export function normalizeHadithArabic(text: string): string {

  return String(text || '')

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

 * Strict token normalizer for lexical lookups. Unlike the general search

 * normalizer, this intentionally preserves ta marbuta (ة) so a noun ending

 * with ة is not collapsed into the same form as a possessive ه suffix.

 */

function normalizeHadithLexeme(text: string): string {

  return String(text || '')

    .normalize('NFKD')

    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')

    .replace(/ـ/g, '')

    .replace(/[أإآٱ]/g, 'ا')

    .replace(/ى/g, 'ي')

    .replace(/[«»"“”'‘’()[\\]{}،؛:,.!?؟\\-–—]/g, ' ')

    .replace(/\s+/g, ' ')

    .trim()

    .toLowerCase();

}



const QUERY_STOP = new Set(

  [

    'حديث', 'الحديث', 'ما', 'هل', 'ماذا', 'اشرح', 'شرح', 'معنى', 'معني',

    'كلمة', 'كلمه', 'لفظ', 'درجة', 'درجه', 'صحة', 'صحه', 'تخريج',

    'المصدر', 'مصدر', 'المتصل', 'عندك', 'موجود', 'ورد', 'رواه', 'الراوي',

    'اعطني', 'أعطني', 'هات', 'ابحث', 'فقط', 'استخدم', 'تستخدم', 'استند',

    'اجب', 'أجب', 'بحسب', 'السجل', 'البيانات'

  ].map(normalizeHadithArabic)

);



function tokens(text: string, removeQueryStop = false): string[] {

  const values = normalizeHadithArabic(text)

    .split(' ')

    .map((x) => x.trim())

    .filter((x) => x.length >= 2);



  return removeQueryStop

    ? values.filter((x) => !QUERY_STOP.has(x))

    : values;

}



function unique(values: string[]): string[] {

  return Array.from(new Set(values));

}



function extractQuoted(query: string): string | null {
  const arabic = query.match(/«([^»]{3,220})»/);
  if (arabic?.[1]) return arabic[1].trim();

  const doubleQuoted = query.match(/["“]([^"”]{3,220})["”]/);
  if (doubleQuoted?.[1]) return doubleQuoted[1].trim();

  return null;
}



export function extractHadithFocus(query: string): string {

  const quoted = extractQuoted(query);

  if (quoted) return quoted;



  const patterns = [

    /(?:هذا\s+حديث|هذا\s+الحديث|حديث|الحديث)\s*[:：]\s*([^؟?\n.]{3,220})/i,

    /(?:العبارة|العباره|النص)\s*[:：]\s*([^؟?\n.]{3,220})/i,

    /(?:في\s+حديث)\s+([^،,؟?\n.]{3,180})/i,

    /(?:حديث\s+عن)\s+([^،,؟?\n.]{2,120})/i

  ];



  for (const pattern of patterns) {

    const match = query.match(pattern);

    if (match?.[1]) {

      return match[1]

        .replace(/\s+(?:وما|وهل|هل|ما)\s.*$/i, '')

        .trim();

    }

  }



  return tokens(query, true).join(' ');

}



function containsNormalizedPhrase(target: string, phrase: string): boolean {

  const t = normalizeHadithArabic(target);

  const p = normalizeHadithArabic(phrase);

  return Boolean(p && p.length >= 6 && t.includes(p));

}



function coverage(queryTokens: string[], targetTokens: string[]): number {

  if (!queryTokens.length || !targetTokens.length) return 0;

  const targetSet = new Set(targetTokens);

  const matched = queryTokens.filter((t) => targetSet.has(t)).length;

  return matched / queryTokens.length;

}



function scoreRecord(focus: string, record: HadithRecord): HadithSearchResult {

  const qTokens = unique(tokens(focus, false));



  const title = String(record.title || '');

  const hadithText = String(record.hadith_text || '');

  const explanation = String(record.explanation || '');

  const wordMeanings = String(record.word_meanings || '');

  const benefits = String(record.benefits || '');



  const titleExact = containsNormalizedPhrase(title, focus);

  const textExact = containsNormalizedPhrase(hadithText, focus);



  const titleCoverage = coverage(qTokens, unique(tokens(title)));

  const textCoverage = coverage(qTokens, unique(tokens(hadithText)));

  const explanationCoverage = coverage(qTokens, unique(tokens(explanation)));

  const wordsCoverage = coverage(qTokens, unique(tokens(wordMeanings)));

  const benefitsCoverage = coverage(qTokens, unique(tokens(benefits)));



  let score = Math.max(

    titleCoverage * 1.0,

    textCoverage * 0.94,

    explanationCoverage * 0.48,

    wordsCoverage * 0.42,

    benefitsCoverage * 0.38

  );



  if (titleExact) score = Math.max(score, 1);

  if (textExact) score = Math.max(score, 0.99);



  const titleSet = new Set(tokens(title));

  const textSet = new Set(tokens(hadithText));

  const matchedCore = qTokens.filter(

    (t) => titleSet.has(t) || textSet.has(t)

  ).length;



  // Short Arabic phrases are especially prone to false positives in long

  // explanations. For one/two-token queries, a match in explanation or word

  // meanings is never sufficient by itself: the core words must occur in the

  // hadith title/text, unless the phrase itself is contiguous there.

  if (!titleExact && !textExact) {

    if (qTokens.length === 1) {

      score = 0;

    } else if (qTokens.length === 2 && matchedCore < 2) {

      score = 0;

    } else if (qTokens.length >= 3 && matchedCore < 2) {

      score = 0;

    }

  }



  const matchedFields: string[] = [];

  if (titleExact || titleCoverage >= 0.45) matchedFields.push('title');

  if (textExact || textCoverage >= 0.45) matchedFields.push('hadith_text');

  if (explanationCoverage >= 0.45) matchedFields.push('explanation');

  if (wordsCoverage >= 0.45) matchedFields.push('word_meanings');

  if (benefitsCoverage >= 0.45) matchedFields.push('benefits');



  return {

    record,

    score: Math.min(1, score),

    exactPhrase: titleExact || textExact,

    focus,

    matchedFields

  };

}



export function searchHadiths(query: string, limit = 8): HadithSearchResult[] {

  const focus = extractHadithFocus(query);

  if (!normalizeHadithArabic(focus)) return [];



  return RECORDS

    .map((record) => scoreRecord(focus, record))

    .filter((result) => result.score >= 0.42)

    .sort((a, b) => {

      if (a.exactPhrase !== b.exactPhrase) {

        return a.exactPhrase ? -1 : 1;

      }

      return b.score - a.score;

    })

    .slice(0, Math.max(1, limit));

}



export function findBestHadith(query: string): HadithSearchResult | null {

  return searchHadiths(query, 1)[0] || null;

}



export type HadithExactWordHit = {

  record: HadithRecord;

  occurrences: number;

  matchedFields: Array<'title' | 'hadith_text'>;

};



function matchesHadithLexemeToken(token: string, target: string): boolean {

  const normalizedToken = normalizeHadithLexeme(token).replace(/\s+/g, '');

  let normalizedTarget = normalizeHadithLexeme(target).replace(/\s+/g, '');



  if (normalizedTarget.startsWith('ال') && normalizedTarget.length > 3) {

    normalizedTarget = normalizedTarget.slice(2);

  }



  if (!normalizedToken || !normalizedTarget) return false;



  const escaped = normalizedTarget.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');



  // Exact lexeme search may tolerate ordinary attached Arabic clitics and

  // pronominal suffixes, but must not absorb derivational letters such as ة.

  // Preserving ة above prevents a different lexeme from being counted merely

  // because the broad search normalizer maps ة -> ه.

  const suffix = '(?:ا|ه|ها|هما|هم|هن|ك|كما|كم|كن|نا|ي)?';

  const pattern = new RegExp(`^(?:و|ف|ب|ك|ل|لل)?(?:ال)?${escaped}${suffix}$`);

  return pattern.test(normalizedToken);

}



function countExactWordInText(text: string, target: string): number {

  return String(text || '')

    .split(/\s+/)

    .filter(Boolean)

    .reduce(

      (sum, token) => sum + (matchesHadithLexemeToken(token, target) ? 1 : 0),

      0

    );

}



/**

 * Safe one-word lookup over the hadith snapshot. It searches only the title

 * and hadith text, never explanation/benefits, so a lexical query cannot match

 * an unrelated record merely because the word appears in commentary.

 */

export function searchHadithExactWord(

  word: string,

  limit = 20

): HadithExactWordHit[] {

  const clean = String(word || '').trim();

  if (!normalizeHadithArabic(clean) || normalizeHadithArabic(clean).includes(' ')) {

    return [];

  }



  const hits: HadithExactWordHit[] = [];



  for (const record of RECORDS) {

    const titleCount = countExactWordInText(String(record.title || ''), clean);

    const textCount = countExactWordInText(String(record.hadith_text || ''), clean);

    const occurrences = titleCount + textCount;



    if (occurrences <= 0) continue;



    const matchedFields: Array<'title' | 'hadith_text'> = [];

    if (titleCount > 0) matchedFields.push('title');

    if (textCount > 0) matchedFields.push('hadith_text');



    hits.push({ record, occurrences, matchedFields });

  }



  return hits

    .sort((a, b) => {

      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;

      return String(a.record.id).localeCompare(String(b.record.id));

    })

    .slice(0, Math.max(1, limit));

}





/**

 * Returns the source-provided lexical meaning line for a requested word when

 * the HadeethEnc record contains one. It never infers a meaning from model

 * memory. A missing return value means the record has no direct lexical gloss

 * for that word in the indexed source data.

 */

export function extractHadithWordMeaning(

  record: HadithRecord,

  target: string

): string | null {

  const raw = String(record?.word_meanings || '').trim();

  if (!raw) return null;



  const chunks = raw

    .split(/\n+|(?<=[.!؟])\s+(?=[^.!؟]{1,80}:)/)

    .map((line) => line.trim())

    .filter(Boolean);



  for (const chunk of chunks) {

    const parts = chunk.split(/[:：]/);

    if (parts.length < 2) continue;



    const head = parts.shift() || '';

    const headTokens = head

      .replace(/[()\\[\\]{}«»"“”'‘’،؛,.!?؟]/g, ' ')

      .split(/\s+/)

      .filter(Boolean);



    if (headTokens.some((token) => matchesHadithLexemeToken(token, target))) {

      const meaning = parts.join(':').trim();

      if (meaning) return meaning;

    }

  }



  return null;

}



export type HadithWordCorrection = {

  suggestion: string;

  distance: number;

  confidence: number;

};



let HADITH_WORD_VOCAB_CACHE: string[] | null = null;



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



function hadithWordCandidateForms(token: string): string[] {

  const normalized = normalizeHadithArabic(token).replace(/\s+/g, '');

  if (!normalized) return [];



  const forms = new Set<string>([normalized]);

  const add = (value: string) => {

    const v = String(value || '').trim();

    if (v.length >= 2) forms.add(v);

  };



  if (/^[وفبكلس]/.test(normalized) && normalized.length > 3) add(normalized.slice(1));

  for (const value of Array.from(forms)) {

    if (value.startsWith('ال') && value.length > 4) add(value.slice(2));

    if (value.startsWith('لل') && value.length > 4) add(value.slice(2));

  }



  return Array.from(forms);

}



function getHadithWordVocabulary(): string[] {

  if (HADITH_WORD_VOCAB_CACHE) return HADITH_WORD_VOCAB_CACHE;



  const vocab = new Set<string>();

  for (const record of RECORDS) {

    const source = `${String(record.title || '')} ${String(record.hadith_text || '')}`;

    for (const rawToken of source.split(/\s+/).filter(Boolean)) {

      for (const form of hadithWordCandidateForms(rawToken)) {

        if (form.length >= 2) vocab.add(form);

      }

    }

  }



  HADITH_WORD_VOCAB_CACHE = Array.from(vocab);

  return HADITH_WORD_VOCAB_CACHE;

}



/**

 * Conservative one-token typo recovery over hadith title/text vocabulary.

 * A correction is returned only when one candidate is uniquely closest.

 */

export function suggestHadithWordCorrection(word: string): HadithWordCorrection | null {

  const normalized = normalizeHadithArabic(word).replace(/\s+/g, '');

  if (!normalized || normalized.length < 3) return null;

  if (searchHadithExactWord(word, 1).length > 0) return null;



  const maxDistance = normalized.length >= 8 ? 2 : 1;

  let best: string | null = null;

  let bestDistance = Number.POSITIVE_INFINITY;

  let secondDistance = Number.POSITIVE_INFINITY;



  for (const candidate of getHadithWordVocabulary()) {

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



  if (!best || secondDistance === bestDistance) return null;

  const confidence = 1 - bestDistance / Math.max(normalized.length, best.length);

  if (confidence < 0.76) return null;



  return { suggestion: best, distance: bestDistance, confidence };

}



function normalizeLiveRecord(raw: HadeethEncRecord): HadithRecord {

  return normalizeRecordShape({

    ...raw,

    provider: 'HadeethEnc Live API',

    raw

  });

}



export async function getLiveHadithById(

  id: string | number

): Promise<HadithRecord | null> {

  try {

    const raw = await hadeethEncGetHadithById(id, 'ar');

    return normalizeLiveRecord(raw);

  } catch (err) {

    console.warn(`[MIHAK] HadeethEnc live lookup failed for ${id}:`, err);

    return null;

  }

}



/**

 * Search locally for speed, then verify/hydrate the selected record against

 * the live HadeethEnc API using its stable record id.

 */

async function hydrateCandidate(
  hit: HadithSearchResult,
  overrideScore?: number
): Promise<ResolvedHadithCandidate> {
  const score = overrideScore !== undefined ? overrideScore : hit.score;
  const live = await getLiveHadithById(hit.record.id);
  if (live) {
    return {
      record: live,
      score,
      exactPhrase: hit.exactPhrase,
      liveVerified: true,
      provider: 'HadeethEnc Live API'
    };
  }
  return {
    record: {
      ...hit.record,
      provider: 'HadeethEnc local snapshot'
    },
    score,
    exactPhrase: hit.exactPhrase,
    liveVerified: false,
    provider: 'HadeethEnc local snapshot'
  };
}

export async function resolveHadithCandidate(
  query: string
): Promise<ResolvedHadithCandidate | null> {
  const hit = findBestHadith(query);
  if (!hit) return null;
  return await hydrateCandidate(hit);
}

async function resolveDorarFallback(
  originalInput: string,
  searchQueries: string[] = []
): Promise<ResolvedHadithCandidate | null> {
  try {
    const queries = Array.from(
      new Set(
        [originalInput, ...searchQueries]
          .map((q) => String(q || '').trim())
          .filter((q) => q.length >= 2)
      )
    ).slice(0, 3);

    const candidateMap = new Map<string, HadithRecord>();

    for (const query of queries) {
      const results = await searchDorar(query, 7000);

      for (const result of results.slice(0, 10)) {
        const record = dorarResultToHadithRecord(result);
        const key = normalizeHadithArabic(
          String(record.hadith_text || '')
        );

        if (!key) continue;

        if (!candidateMap.has(key)) {
          candidateMap.set(key, record);
        }
      }
    }

    const candidates = Array.from(candidateMap.values());

    if (candidates.length === 0) {
      console.log('[MIHAK Dorar] No candidates found.');
      return null;
    }

    const reranked = await rerankCandidates(
      originalInput,
      candidates.slice(0, 15).map((record) => ({
        id: record.id,
        title: record.title,
        text: record.hadith_text,
        explanation: record.explanation,
        score: 0
      })),
      'HADITH'
    );

    if (reranked.selectedId) {
      const selectedIndex = candidates.findIndex(
        (record) =>
          String(record.id) === String(reranked.selectedId)
      );

      if (selectedIndex > 0) {
        const [selected] = candidates.splice(selectedIndex, 1);
        candidates.unshift(selected);
      }
    }

    for (const record of candidates.slice(0, 3)) {
      const relation = await classifyHadithSemanticRelation(
        originalInput,
        record
      );

      if (
        relation.relation === 'DIRECT_MATCH' ||
        relation.relation === 'STRONG_PARAPHRASE'
      ) {
        console.log(
          `[MIHAK Dorar] Accepted candidate with relation ${relation.relation}`
        );

        return {
          record,
          score: relation.confidence,
          exactPhrase: false,
          liveVerified: true,
          provider: 'Dorar API',
          relationLabel: relation.relation,
          relationReasoning: relation.reasoning
        };
      }
    }

    console.log(
      '[MIHAK Dorar] Candidates found, but none passed the strict semantic gate.'
    );

    return null;
  } catch (error) {
    console.warn('[MIHAK Dorar] Fallback failed safely:', error);
    return null;
  }
}

/**
 * Stage 1-3 Generic Hadith Semantic Retrieval:
 * 1. Query expansion & candidate generation across multiple generated queries
 * 2. Semantic reranking of candidates against user's intended meaning
 * 3. Semantic relation & entailment gate: only DIRECT_MATCH or STRONG_PARAPHRASE accepted
 * 4. Hydration & verification from canonical HadeethEnc record
 */
export async function resolveHadithSemantic(
  originalInput: string,
  searchQueries: string[] = []
): Promise<ResolvedHadithCandidate | null> {
  const clean = originalInput.trim();

  // Step 1: Generate semantic meaning representation & 3-6 concise retrieval queries
  const expansion = await generateHadithRetrievalQueries(clean);
  const semanticMeaning = expansion.semanticMeaning || clean;

  const allQueries = Array.from(new Set([
    ...expansion.queries,
    ...searchQueries,
    clean
  ].map((q) => q.trim()).filter((q) => q.length >= 2)));

  const candidateMap = new Map<string | number, HadithSearchResult>();

  // Stage 1: Candidate generation across all queries & 5 fields
  for (const q of allQueries) {
    const results = searchHadiths(q, 10);
    for (const r of results) {
      const existing = candidateMap.get(r.record.id);
      if (!existing || r.score > existing.score || (r.exactPhrase && !existing.exactPhrase)) {
        candidateMap.set(r.record.id, r);
      }
    }
  }

  // Broad token-overlap check over title, text, explanation, word meanings, and benefits if few candidates
  if (candidateMap.size < 4) {
    for (const record of RECORDS) {
      const title = String(record.title || '');
      const hadithText = String(record.hadith_text || '');
      const explanation = String(record.explanation || '');
      const wordMeanings = String(record.word_meanings || '');
      const benefits = String(record.benefits || '');
      const fullCorpusText = `${normalizeHadithArabic(title)} ${normalizeHadithArabic(hadithText)} ${normalizeHadithArabic(explanation)} ${normalizeHadithArabic(wordMeanings)} ${normalizeHadithArabic(benefits)}`;

      for (const q of allQueries) {
        const cleanQ = normalizeHadithArabic(q);
        if (cleanQ.length < 3) continue;
        const qTokens = cleanQ.split(' ').filter((w) => w.length > 2 && !QUERY_STOP.has(w));
        if (!qTokens.length) continue;
        const matched = qTokens.filter((t) => fullCorpusText.includes(t)).length;
        if (matched > 0 && matched >= Math.min(2, qTokens.length)) {
          const score = matched / qTokens.length;
          const existing = candidateMap.get(record.id);
          if (!existing || score > existing.score) {
            candidateMap.set(record.id, {
              record,
              score: Math.min(0.85, score),
              exactPhrase: false,
              focus: q,
              matchedFields: ['title', 'hadith_text']
            });
          }
        }
      }
    }
  }

  const candidateList = Array.from(candidateMap.values())
    .sort((a, b) => {
      if (a.exactPhrase !== b.exactPhrase) return a.exactPhrase ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, 15);

  if (candidateList.length === 0) {
    console.log('\n[MIHAK HADITH RETRIEVAL TRACE]');
    console.log(`originalInput: ${JSON.stringify(originalInput)}`);
    console.log(`semanticMeaning: ${JSON.stringify(semanticMeaning)}`);
    console.log(`retrievalQueries: ${JSON.stringify(allQueries)}`);
    console.log(`hadithCorpusSize: ${RECORDS.length}`);
    console.log(`candidateCount: 0`);
    console.log(`topCandidateIds: []`);
    console.log(`topCandidateLexicalScores: []`);
    console.log(`topCandidateSemanticScores: []`);
    console.log(`topCandidateRelationLabels: []`);
    console.log(`selectedRecordId: null`);
    console.log(`selectionReason: "none"`);
    console.log(`abstentionReason: "لم يُعثر على مرشحات معجمية في الموسوعة"`);
    const dorarFallback = await resolveDorarFallback(
  originalInput,
  allQueries
);

if (dorarFallback) {
  return dorarFallback;
}

return null;
  }

  // Stage 2: Semantic Reranking of retrieved candidates against user's intended meaning
  const reranked = await rerankCandidates(
    semanticMeaning,
    candidateList.map((c) => ({
      id: c.record.id,
      title: c.record.title,
      text: c.record.hadith_text,
      explanation: c.record.explanation,
      score: c.score
    })),
    'HADITH'
  );

  // Re-order candidates based on semantic reranker
  if (reranked.selectedId) {
    const foundIdx = candidateList.findIndex((c) => String(c.record.id) === String(reranked.selectedId));
    if (foundIdx > 0) {
      const [chosen] = candidateList.splice(foundIdx, 1);
      chosen.score = Math.max(chosen.score, reranked.score);
      candidateList.unshift(chosen);
    }
  }

  // Stage 3: Semantic Relation & Entailment Gate
  // Evaluate top candidates to ensure relation is DIRECT_MATCH or STRONG_PARAPHRASE
  const topCandidateIds: (string | number)[] = [];
  const topCandidateLexicalScores: number[] = [];
  const topCandidateSemanticScores: number[] = [];
  const topCandidateRelationLabels: string[] = [];

  let selectedCandidate: HadithSearchResult | null = null;
  let selectedRelation: HadithRelationLabel = 'AMBIGUOUS';
  let selectionReason = '';
  let abstentionReason: string | null = null;

  const candidatesToCheck = candidateList.slice(0, 3);
  for (let i = 0; i < candidatesToCheck.length; i++) {
    const cand = candidatesToCheck[i];
    topCandidateIds.push(cand.record.id);
    topCandidateLexicalScores.push(Number(cand.score.toFixed(3)));

    const relationRes = await classifyHadithSemanticRelation(semanticMeaning, cand.record);
    topCandidateSemanticScores.push(Number(relationRes.confidence.toFixed(3)));
    topCandidateRelationLabels.push(relationRes.relation);

    // Only DIRECT_MATCH or STRONG_PARAPHRASE can be accepted
    if (relationRes.relation === 'DIRECT_MATCH' || relationRes.relation === 'STRONG_PARAPHRASE') {
      if (!selectedCandidate) {
        selectedCandidate = cand;
        selectedRelation = relationRes.relation;
        selectionReason = `أُجيز المرشح [${cand.record.id}] دلالياً بعلاقة [${relationRes.relation}] ودرجة ثقة [${relationRes.confidence.toFixed(2)}]. ${relationRes.reasoning}`;
      }
    }
  }

  if (!selectedCandidate) {
    abstentionReason = 'فشلت المرشحات في اجتياز بوابة التحقق الدلالي: لم يحقق أي مرشح DIRECT_MATCH أو STRONG_PARAPHRASE.';
    console.log('\n[MIHAK HADITH RETRIEVAL TRACE]');
    console.log(`originalInput: ${JSON.stringify(originalInput)}`);
    console.log(`semanticMeaning: ${JSON.stringify(semanticMeaning)}`);
    console.log(`retrievalQueries: ${JSON.stringify(allQueries)}`);
    console.log(`hadithCorpusSize: ${RECORDS.length}`);
    console.log(`candidateCount: ${candidateList.length}`);
    console.log(`topCandidateIds: ${JSON.stringify(topCandidateIds)}`);
    console.log(`topCandidateLexicalScores: ${JSON.stringify(topCandidateLexicalScores)}`);
    console.log(`topCandidateSemanticScores: ${JSON.stringify(topCandidateSemanticScores)}`);
    console.log(`topCandidateRelationLabels: ${JSON.stringify(topCandidateRelationLabels)}`);
    console.log(`selectedRecordId: null`);
    console.log(`selectionReason: "none"`);
    console.log(`abstentionReason: ${JSON.stringify(abstentionReason)}`);
    const dorarFallback = await resolveDorarFallback(
  originalInput,
  allQueries
);

if (dorarFallback) {
  return dorarFallback;
}

return null; // Abstain safely!
  }

  // Hydrate candidate
  const hydrated = await hydrateCandidate(selectedCandidate, selectedCandidate.score);
  hydrated.relationLabel = selectedRelation;

  console.log('\n[MIHAK HADITH RETRIEVAL TRACE]');
  console.log(`originalInput: ${JSON.stringify(originalInput)}`);
  console.log(`semanticMeaning: ${JSON.stringify(semanticMeaning)}`);
  console.log(`retrievalQueries: ${JSON.stringify(allQueries)}`);
  console.log(`hadithCorpusSize: ${RECORDS.length}`);
  console.log(`candidateCount: ${candidateList.length}`);
  console.log(`topCandidateIds: ${JSON.stringify(topCandidateIds)}`);
  console.log(`topCandidateLexicalScores: ${JSON.stringify(topCandidateLexicalScores)}`);
  console.log(`topCandidateSemanticScores: ${JSON.stringify(topCandidateSemanticScores)}`);
  console.log(`topCandidateRelationLabels: ${JSON.stringify(topCandidateRelationLabels)}`);
  console.log(`selectedRecordId: ${hydrated.record.id}`);
  console.log(`selectionReason: ${JSON.stringify(selectionReason)}`);
  console.log(`abstentionReason: null`);

  return hydrated;
}

export function getHadithDatasetStatus() {
  return {
    records: RECORDS.length,
    provider: DATA.dataset?.provider || 'HadeethEnc local snapshot',
    sourceUrl: DATA.dataset?.source_url || 'https://hadeethenc.com/ar',
    language: DATA.dataset?.language || 'العربية',
    version: DATA.dataset?.version || null,
    lastUpdate: DATA.dataset?.last_update || null,
    declaredRecordCount: DATA.dataset?.record_count || null
  };
}



export async function getHadithLiveStatus() {

  try {

    return await testHadeethEncConnection();

  } catch (err: any) {

    return {

      ok: false,

      source: 'HadeethEnc Live API',

      error: String(err?.message || err)

    };

  }

}
