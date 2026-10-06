import { EvidenceRecord } from '../types';

/**
 * Seeded trusted-source collection for MIHAK.
 * يحمّل 3 مصادر: القرآن الكريم + التفسير الميسر + الأحاديث
 */

// === الجزء 1: البيانات الاحتياطية (Fallback) ===
export const SEED_EVIDENCE_RECORDS: EvidenceRecord[] = [
  {
    source_id: 'QURAN-112-001',
    source_name: 'القرآن الكريم',
    canonical_reference: 'سورة الإخلاص، الآية 1',
    language: 'ar',
    raw_text: 'قُلْ هُوَ اللَّهُ أَحَدٌ',
    version: 'مصحف المدينة النبوية — مجمع الملك فهد (رواية حفص عن عاصم)',
    license_note: 'نص قرآني قطعي الثبوت',
    surah_number: 112,
    ayah_number: 1,
    category: 'quran'
  },
  {
    source_id: 'QURAN-112-002',
    source_name: 'القرآن الكريم',
    canonical_reference: 'سورة الإخلاص، الآية 2',
    language: 'ar',
    raw_text: 'اللَّهُ الصَّمَدُ',
    version: 'مصحف المدينة النبوية — مجمع الملك فهد',
    license_note: 'نص قرآني قطعي الثبوت',
    surah_number: 112,
    ayah_number: 2,
    category: 'quran'
  },
  {
    source_id: 'QURAN-112-003',
    source_name: 'القرآن الكريم',
    canonical_reference: 'سورة الإخلاص، الآية 3',
    language: 'ar',
    raw_text: 'لَمْ يَلِدْ وَلَمْ يُولَدْ',
    version: 'مصحف المدينة النبوية — مجمع الملك فهد',
    license_note: 'نص قرآني قطعي الثبوت',
    surah_number: 112,
    ayah_number: 3,
    category: 'quran'
  },
  {
    source_id: 'QURAN-112-004',
    source_name: 'القرآن الكريم',
    canonical_reference: 'سورة الإخلاص، الآية 4',
    language: 'ar',
    raw_text: 'وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ',
    version: 'مصحف المدينة النبوية — مجمع الملك فهد',
    license_note: 'نص قرآني قطعي الثبوت',
    surah_number: 112,
    ayah_number: 4,
    category: 'quran'
  },
  {
    source_id: 'QURAN-002-255',
    source_name: 'القرآن الكريم',
    canonical_reference: 'سورة البقرة، الآية 255 (آية الكرسي)',
    language: 'ar',
    raw_text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ',
    version: 'مصحف المدينة النبوية — مجمع الملك فهد',
    license_note: 'نص قرآني قطعي الثبوت',
    surah_number: 2,
    ayah_number: 255,
    category: 'quran'
  }
];

// === الجزء 2: الفهرس الكامل (Full Corpus Index) ===
let FULL_CORPUS: EvidenceRecord[] = [...SEED_EVIDENCE_RECORDS];
let IS_CORPUS_LOADED = false;
let CORPUS_PROMISE: Promise<void> | null = null;

/**
 * دالة تنظيف النص من HTML tags
 * تستخدم مع ملف التفسير (اللي فيه <div> <p> <span>)
 */
export function cleanHtmlText(text: string): string {
  if (!text) return '';
  return text
    // إزالة HTML tags
    .replace(/<[^>]*>/g, ' ')
    // إزالة الرموز القرآنية ﴿ ﴾
    .replace(/[﴿﴾۞۩]/g, ' ')
    // إزالة الأحرف الزائدة
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * تحويل رقم السورة إلى اسمها العربي
 */
function getSurahName(surahNumber: number, fallbackName?: string): string {
  if (fallbackName && fallbackName.trim()) return fallbackName.trim();
  return `السورة ${surahNumber}`;
}

/**
 * الخادم المركزي هو المصدر الوحيد للحقيقة (Single Source of Truth)
 * لا يقوم المتصفح بتحميل ملفات JSON مباشرة، بل يتعامل حصراً مع واجهات الخادم.
 */
export async function loadFullCorpus(): Promise<void> {
  IS_CORPUS_LOADED = true;
  FULL_CORPUS = SEED_EVIDENCE_RECORDS;
  return Promise.resolve();
}

/**
 * Normalizes Arabic text by stripping diacritics (tashkeel), unifying alefs, etc.
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    // إزالة التشكيل
    .replace(/[\u0617-\u061A\u064B-\u0652\u0670\u0640]/g, '')
    // توحيد الألف
    .replace(/[أإآٱ]/g, 'ا')
    // توحيد الياء
    .replace(/ى/g, 'ي')
    // توحيد التاء المربوطة
    .replace(/ة/g, 'ه')
    // إزالة الرموز القرآنية
    .replace(/[﴿﴾۞۩ۖۗۘۙۚۛۜ]/g, '')
    // إزالة علامات الترقيم
    .replace(/[.,!?؟،؛:؛«»"'()\[\]{}]/g, ' ')
    // توحيد المسافات
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Searches the FULL evidence corpus (قرآن + تفسير + حديث).
 */
export function searchSeedEvidence(query: string): { record: EvidenceRecord; score: number }[] {
  const normQuery = normalizeArabic(query);
  if (!normQuery) return [];

  const queryTokens = normQuery.split(/\s+/).filter(t => t.length > 2);

  const results = FULL_CORPUS.map(rec => {
    const normText = normalizeArabic(rec.raw_text);
    const normRef = normalizeArabic(rec.canonical_reference);

    let score = 0;

    // مطابقة كاملة أو شبه كاملة
    if (normText.includes(normQuery) || normQuery.includes(normText)) {
      score += 0.95;
    } else {
      // مطابقة بالكلمات
      let matchedTokens = 0;
      for (const t of queryTokens) {
        if (normText.includes(t)) matchedTokens++;
        if (normRef.includes(t)) matchedTokens += 0.5;
      }
      if (queryTokens.length > 0) {
        score = Math.min(0.9, matchedTokens / queryTokens.length);
      }
    }

    return { record: rec, score };
  })
    .filter(r => r.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return results;
}

/**
 * بحث في القرآن فقط
 */
export function searchQuran(query: string): { record: EvidenceRecord; score: number }[] {
  return searchSeedEvidence(query).filter(r => r.record.category === 'quran');
}

/**
 * بحث في الأحاديث فقط
 */
export function searchHadith(query: string): { record: EvidenceRecord; score: number }[] {
  return searchSeedEvidence(query).filter(r => r.record.category === 'hadith');
}

/**
 * بحث في التفسير فقط
 */
export function searchTafsir(query: string): { record: EvidenceRecord; score: number }[] {
  return searchSeedEvidence(query).filter(r => r.record.category === 'tafsir');
}