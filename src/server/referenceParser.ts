/**

 * MIHAK — مِحَكّ

 * Generic Reference Parser & Range Normalizer

 *

 * Core Principles:

 * 1. Collects ALL explicit references in the input (never discards secondary references).

 * 2. Deterministic range expansion (e.g. 2:183-185 -> [2:183, 2:184, 2:185]).

 * 3. Range boundaries validated using connected source metadata.

 * 4. Multi-reference retrieval: each reference is retrieved independently with full provenance.

 * 5. Supports Arabic, English, numerical, named surahs, and canonical Hadith books.

 */



import type { ParsedReference, EvidenceRecord } from '../types';

import { findSurahByName, getSurahByNumber, getQuranVerse, SURAH_METADATA } from './quranKnowledge';

import { getLiveHadithById, searchHadiths } from './hadithEngine';



function normalizeArabicDigits(input: string): string {

  if (!input) return '';

  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  return input.replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)));

}



/**

 * Extracts all explicit references (Quran and Hadith) found anywhere in the text.

 */

export function extractAllReferences(rawInput: string): ParsedReference[] {

  const text = normalizeArabicDigits(rawInput);

  const references: ParsedReference[] = [];

  const seenKeys = new Set<string>();



  // 1. Quran numeric references: e.g. 2:255, 18:10-12, [2:183-185], (سورة 2: 183)

  // Pattern matches (surahNumber):(ayahStart)[-(ayahEnd)]

  const numericPattern = /(?:(?:سورة|سوره|chapter|surah|quran)\s*)?(\d{1,3})\s*[:/]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/gi;

  let match: RegExpExecArray | null;



  while ((match = numericPattern.exec(text)) !== null) {

    const surahNum = Number(match[1]);

    const ayahStart = Number(match[2]);

    const ayahEnd = match[3] ? Number(match[3]) : ayahStart;



    if (surahNum >= 1 && surahNum <= 114) {

      const meta = getSurahByNumber(surahNum);

      const surahName = meta ? meta.name : `سورة ${surahNum}`;

      const isRange = ayahEnd > ayahStart;

      const canonicalRef = isRange

        ? `سورة ${surahName} [${surahNum}:${ayahStart}-${ayahEnd}]`

        : `سورة ${surahName} [${surahNum}:${ayahStart}]`;



      const key = `quran-${surahNum}-${ayahStart}-${ayahEnd}`;

      if (!seenKeys.has(key)) {

        seenKeys.add(key);

        references.push({

          sourceType: 'quran',

          rawText: match[0],

          canonicalReference: canonicalRef,

          surahNumber: surahNum,

          surahName,

          ayahStart,

          ayahEnd,

          isRange

        });

      }

    }

  }



  // 2. Quran named references: e.g. "سورة البقرة: 255" or "البقرة: 183-185" or "سورة آل عمران: 18" or "سورة الكهف آية 10 إلى 12"

  const namedSurahPattern = /(?:(?:سورة|سوره)\s+)?([\u0621-\u064A]+(?:\s+[\u0621-\u064A]+)?)\s*(?:[:/،,]\s*|\s+(?:الآية|آية|اية|الآيات|آيات|verse|ayah)\s*|\s+)\s*(\d{1,3})(?:\s*(?:إلى|الى|[-–—])\s*(\d{1,3}))?/gi;

  while ((match = namedSurahPattern.exec(text)) !== null) {

    const rawSurahName = match[1].trim();

    const surah = findSurahByName(rawSurahName);

    if (surah && match[2]) {

      const ayahStart = Number(match[2]);

      const ayahEnd = match[3] ? Number(match[3]) : ayahStart;

      const isRange = ayahEnd > ayahStart;

      const canonicalRef = isRange

        ? `سورة ${surah.name} [${surah.index}:${ayahStart}-${ayahEnd}]`

        : `سورة ${surah.name} [${surah.index}:${ayahStart}]`;



      const key = `quran-${surah.index}-${ayahStart}-${ayahEnd}`;

      if (!seenKeys.has(key)) {

        seenKeys.add(key);

        references.push({

          sourceType: 'quran',

          rawText: match[0].trim(),

          canonicalReference: canonicalRef,

          surahNumber: surah.index,

          surahName: surah.name,

          ayahStart,

          ayahEnd,

          isRange

        });

      }

    }

  }



  // 2b. Quran inverted reference: e.g. "الآية 10 من سورة الكهف" or "اية 255 في سورة البقرة"

  const invertedPattern = /(?:الآية|آية|اية)\s*(\d{1,3})\s*(?:من|في)\s*(?:سورة|سوره)?\s*([\u0621-\u064A]+(?:\s+[\u0621-\u064A]+)?)/gi;

  while ((match = invertedPattern.exec(text)) !== null) {

    const ayahNum = Number(match[1]);

    const rawSurahName = match[2].trim();

    const surah = findSurahByName(rawSurahName);

    if (surah) {

      const canonicalRef = `سورة ${surah.name} [${surah.index}:${ayahNum}]`;

      const key = `quran-${surah.index}-${ayahNum}-${ayahNum}`;

      if (!seenKeys.has(key)) {

        seenKeys.add(key);

        references.push({

          sourceType: 'quran',

          rawText: match[0].trim(),

          canonicalReference: canonicalRef,

          surahNumber: surah.index,

          surahName: surah.name,

          ayahStart: ayahNum,

          ayahEnd: ayahNum,

          isRange: false

        });

      }

    }

  }



  // 3. Hadith references: e.g. "صحيح البخاري: 1" or "صحيح مسلم: 45" or "Bukhari: 1"

  const hadithPattern = /(?:صحيح\s+)?(البخاري|مسلم|الترمذي|أبو\s*داود|النسائي|ابن\s*ماجه|أحمد|bukhari|muslim|tirmidhi|abu\s*dawud|nasai|ibn\s*majah)\s*(?:رقم|حديث|hadith|no\\.?|:)?\s*(\d{1,6})/gi;

  while ((match = hadithPattern.exec(text)) !== null) {

    const book = match[1].trim();

    const hadithNum = Number(match[2]);

    const canonicalRef = `${book}: ${hadithNum}`;

    const key = `hadith-${book.toLowerCase()}-${hadithNum}`;

    if (!seenKeys.has(key)) {

      seenKeys.add(key);

      references.push({

        sourceType: 'hadith',

        rawText: match[0],

        canonicalReference: canonicalRef,

        hadithBook: book,

        hadithNumber: hadithNum,

        isRange: false

      });

    }

  }



  return references;

}



/**

 * Expands a reference range into individual retrievable references.

 * Boundary validation is enforced using SURAH_METADATA.

 */

export function normalizeReferenceRange(ref: ParsedReference): ParsedReference[] {

  if (!ref.isRange || ref.sourceType !== 'quran' || !ref.surahNumber || !ref.ayahStart || !ref.ayahEnd) {

    return [ref];

  }



  const meta = SURAH_METADATA[ref.surahNumber - 1];

  const maxAyahs = meta ? (Number(meta.ayas) || Number((meta as any).ayahs) || 286) : 286;

  const start = Math.max(1, Math.min(ref.ayahStart, maxAyahs));

  const end = Math.max(start, Math.min(ref.ayahEnd, maxAyahs));



  const expanded: ParsedReference[] = [];

  for (let a = start; a <= end; a++) {

    expanded.push({

      sourceType: 'quran',

      rawText: `${ref.surahNumber}:${a}`,

      canonicalReference: `سورة ${ref.surahName || meta?.name || ref.surahNumber} [${ref.surahNumber}:${a}]`,

      surahNumber: ref.surahNumber,

      surahName: ref.surahName || meta?.name,

      ayahStart: a,

      ayahEnd: a,

      isRange: false

    });

  }



  return expanded;

}



/**

 * Retrieves connected evidence for a parsed reference.

 * Returns success/failure independently with full machine-readable provenance.

 */

export async function retrieveReferenceEvidence(

  ref: ParsedReference

): Promise<{ success: boolean; evidence?: EvidenceRecord; rawText?: string; error?: string }> {

  try {

    if (ref.sourceType === 'quran' && ref.surahNumber && ref.ayahStart) {

      // If it's a range, retrieve all verses in range

      if (ref.isRange && ref.ayahEnd && ref.ayahEnd > ref.ayahStart) {

        const expanded = normalizeReferenceRange(ref);

        const texts: string[] = [];

        for (const item of expanded) {

          const verse = getQuranVerse(item.surahNumber!, item.ayahStart!);

          if (verse) {

            texts.push(`(${item.ayahStart}) ${verse.arabic_text}`);

          }

        }

        if (texts.length > 0) {

          const fullText = texts.join(' ');

          return {

            success: true,

            rawText: fullText,

            evidence: {

              source_id: 'quran-corpus',

              source_name: 'القرآن الكريم — مجمع الملك فهد لطباعة المصحف الشريف',

              canonical_reference: ref.canonicalReference,

              language: 'ar',

              raw_text: fullText,

              version: '1.0',

              license_note: 'النص القرآني المعتمد برواية حفص عن عاصم',

              surah_number: ref.surahNumber,

              ayah_number: ref.ayahStart,

              category: 'quran'

            }

          };

        }

      } else {

        const verse = getQuranVerse(ref.surahNumber, ref.ayahStart);

        if (verse) {

          return {

            success: true,

            rawText: verse.arabic_text,

            evidence: {

              source_id: 'quran-corpus',

              source_name: 'القرآن الكريم — مجمع الملك فهد لطباعة المصحف الشريف',

              canonical_reference: ref.canonicalReference,

              language: 'ar',

              raw_text: verse.arabic_text,

              version: '1.0',

              license_note: 'النص القرآني المعتمد برواية حفص عن عاصم',

              surah_number: ref.surahNumber,

              ayah_number: ref.ayahStart,

              category: 'quran'

            }

          };

        }

      }

    }



    if (ref.sourceType === 'hadith') {

      if (ref.hadithNumber) {

        const live = await getLiveHadithById(ref.hadithNumber);

        if (live && live.arabic) {

          return {

            success: true,

            rawText: live.arabic,

            evidence: {

              source_id: 'hadeethenc',

              source_name: `موسوعة الأحاديث النبوية — ${ref.hadithBook || 'المتون المعتمدة'}`,

              canonical_reference: ref.canonicalReference,

              language: 'ar',

              raw_text: live.arabic,

              version: '1.0',

              license_note: live.grade || 'حديث مسند',

              category: 'hadith_canonical'

            }

          };

        }

      }



      // Search by book/keyword

      const searchRes = await searchHadiths(ref.rawText, 1);

      if (searchRes.length > 0 && searchRes[0].record) {

        const h = searchRes[0].record;

        const text = String(h.hadith_text || h.arabic || h.title || '').trim();

        return {

          success: true,

          rawText: text,

          evidence: {

            source_id: 'hadeethenc',

            source_name: `موسوعة الأحاديث النبوية — ${h.attribution || ref.hadithBook || 'المتون'}`,

            canonical_reference: ref.canonicalReference,

            language: 'ar',

            raw_text: text,

            version: '1.0',

            license_note: h.grade || 'حديث مسند',

            category: 'hadith_canonical'

          }

        };

      }

    }



    return {

      success: false,

      error: `لم يتم العثور على المرجع [${ref.canonicalReference}] في المصادر المتصلة.`

    };

  } catch (err: any) {

    return {

      success: false,

      error: `خطأ أثناء استرجاع المرجع [${ref.canonicalReference}]: ${err?.message || err}`

    };

  }

}
