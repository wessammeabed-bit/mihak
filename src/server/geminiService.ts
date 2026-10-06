import { GoogleGenAI, Type } from '@google/genai';

import {
  AuditRun,
  Claim,
  ComparisonRun,
  TransformationDelta
} from '../types';

import { EvidenceEngine } from './evidenceEngine';

import {
  auditQuranContentLocally,
  buildAuditRunFromClaims,
  buildQuranClaim,
  isSimpleQuranQuoteInput
} from './quranCorpus';

import { routeQuranQuestion } from './quranIntentRouter';
import {
  getVerseKnowledge,
  searchTafsirRanked,
  searchGharibRanked
} from './quranKnowledge';
import { routeHadithQuestion } from './hadithIntentRouter';
import { processQuranInput, splitMultipleQuestions } from './quranFoundationEngine';
import { executeMasterRoute, classifyMasterIntent } from './masterIntentRouter';

/* =========================================================
   MIHAK — MAIN AUDIT ORCHESTRATOR

   Architecture:
   - Direct Quran questions -> local trusted sources first.
   - Gemini is NEVER Quran evidence.
   - Gemini may only decompose long text or compare supplied text.
   - If Gemini is unavailable/quota exhausted, local Quran features continue.
   ========================================================= */

const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (
  apiKey &&
  apiKey !== 'MY_GEMINI_API_KEY' &&
  apiKey.trim().length > 0
) {
  try {
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  } catch (err) {
    console.warn('[MIHAK] Gemini unavailable. Local Quran services remain active.', err);
    ai = null;
  }
}

function createTimeout(milliseconds: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), milliseconds);
  });
}

const MIHAK_FAST_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash'
];

const MIHAK_REASONING_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash'
];

async function generateWithModelFallback(
  models: string[],
  makeRequest: (model: string) => Promise<any>,
  timeoutMs: number,
  label: string
): Promise<any> {
  let lastError: any = null;

  for (const model of models) {
    try {
      return await Promise.race([
        makeRequest(model),
        createTimeout(timeoutMs, `${label} timed out on ${model}`)
      ]);
    } catch (err) {
      lastError = err;
      console.warn(`[MIHAK] ${label} failed on ${model}.`, err);
    }
  }

  throw lastError || new Error(`${label} failed on all configured models.`);
}

function sourceLabel(source: any): string {
  return Array.isArray(source)
    ? source.filter(Boolean).join(' + ')
    : String(source || 'MIHAK local Quran sources');
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

function polishUserFacingText(value: string): string {
  return String(value || '')
    .replace(/\bTanzil Quran Text\b/gi, 'القرآن الكريم')
    .replace(/\bTanzil Quran Corpus\b/gi, 'القرآن الكريم')
    .replace(/\bTanzil Quran Metadata\b/gi, 'فهرسة المصحف الشريف')
    .replace(/\bQuranic Arabic Corpus\b/gi, 'المصحح الصرفي للقرآن الكريم')
    .replace(/الـmetadata/gi, 'فهرسة المصحف')
    .replace(/\bmetadata\b/gi, 'فهرسة المصحف')
    .replace(/المصادر المحلية المتصلة/gi, 'المصادر المعتمدة')
    .replace(/المصدر\/المصادر المحلية المتصلة/gi, 'المصادر المعتمدة')
    .replace(/السجل المتصل/gi, 'المصدر')
    .replace(/السجل المرجعي/gi, 'المصدر المرجعي')
    .trim();
}

function toAnswerBullets(body: string): string[] {
  const lines = polishUserFacingText(body)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^المصدر\s*[:：]/.test(line))
    .filter((line) => !/^رابط المصدر\s*[:：]/.test(line));

  if (!lines.length) {
    return ['• لم تتوفر إجابة كافية من المصادر المعتمدة.'];
  }

  return lines.map((line) => {
    const clean = line
      .replace(/^[-•]\s*/, '')
      .replace(/^\d+\.\s*/, '')
      .trim();

    return `• ${clean}`;
  });
}

function formatQuestionAnswer(
  question: string,
  body: string,
  sources: string[]
): string {
  const cleanSources = uniqueStrings(
    sources.map((source) => polishUserFacingText(source))
  );

  return [
    `س: ${String(question || '').trim()}`,
    '',
    'ج:',
    ...toAnswerBullets(body),
    '',
    'المصدر:',
    ...(cleanSources.length
      ? cleanSources.map((source) => `• ${source}`)
      : ['• لم يتوفر اسم مصدر أصلي كافٍ في البيانات الحالية.'])
  ].join('\n');
}

function quranSourcesForResult(result: any): string[] {
  const data = result?.data;
  const sources: string[] = [];

  const addQuranReference = (knowledge: any) => {
    if (!knowledge) return;

    if (knowledge.reference) {
      sources.push(`القرآن الكريم — ${knowledge.reference}`);
      return;
    }

    if (knowledge.surahName && knowledge.ayahNumber) {
      sources.push(
        `القرآن الكريم — سورة ${knowledge.surahName}، الآية ${knowledge.ayahNumber}`
      );
    }
  };

  if (result?.intent === 'TAFSIR') {
    addQuranReference(data);
    sources.push('التفسير الميسر');
  }

  if (result?.intent === 'WORD_MEANING') {
    if (data?.countMode) {
      sources.push('القرآن الكريم');
      return uniqueStrings(sources);
    }

    if (data?.knowledge) {
      addQuranReference(data.knowledge);

      if (data.knowledge?.wordMeanings?.text) {
        sources.push('الميسر في غريب القرآن');
      }

      if (data.knowledge?.tafsirMuyassar?.text) {
        sources.push('التفسير الميسر');
      }
    }

    if (Array.isArray(data?.occurrences)) {
      for (const knowledge of data.occurrences) {
        addQuranReference(knowledge);

        if (knowledge?.requestedWordMeaning || knowledge?.wordMeanings?.text) {
          sources.push('الميسر في غريب القرآن');
        } else if (knowledge?.tafsirMuyassar?.text) {
          sources.push('التفسير الميسر');
        }
      }
    }
  }

  if (result?.intent === 'IRAB') {
    addQuranReference(data);
    sources.push('الجدول في إعراب القرآن');
  }

  if (result?.intent === 'MORPHOLOGY') {
    addQuranReference(data?.knowledge);
    sources.push('المصحح الصرفي للقرآن الكريم');
  }

  if (
    result?.intent === 'TAJWEED' ||
    result?.intent === 'WAQF' ||
    result?.intent === 'SAKT' ||
    result?.intent === 'SAJDA'
  ) {
    addQuranReference(data?.knowledge);
    sources.push('القرآن الكريم');
  }

  if (
    result?.intent === 'SURAH_INFO' ||
    result?.understoodAs === 'مرجع القرآن والمصحف'
  ) {
    sources.push('القرآن الكريم');
    sources.push('فهرسة المصحف الشريف');
  }

  if (result?.intent === 'EXPLANATION_CHECK') {
    addQuranReference(data?.knowledge);
    sources.push('التفسير الميسر');
  }

  if (!sources.length) {
    const original = Array.isArray(result?.source)
      ? result.source
      : [result?.source];

    for (const source of original) {
      if (!source) continue;

      const label = String(source)
        .replace(/Tanzil Quran Text/gi, 'القرآن الكريم')
        .replace(/Tanzil Quran Corpus/gi, 'القرآن الكريم')
        .replace(/Tanzil Quran Metadata/gi, 'فهرسة المصحف الشريف');

      if (
        !label.includes('HadeethEnc') &&
        !label.includes('local Quran')
      ) {
        sources.push(label);
      }
    }
  }

  return uniqueStrings(sources);
}

function hadithSourcesForResult(result: any): string[] {
  const data = result?.data;
  const sources: string[] = ['موسوعة الأحاديث النبوية'];

  const addRecordSource = (record: any) => {
    if (!record) return;

    if (record.takhrij) {
      sources.push(String(record.takhrij));
    }
  };

  if (data?.record) {
    addRecordSource(data.record);
  }

  if (Array.isArray(data?.results)) {
    for (const item of data.results) {
      addRecordSource(item?.record);
    }
  }

  return uniqueStrings(sources);
}

function formatVerseHeader(knowledge: any): string[] {
  if (!knowledge) return [];

  const lines: string[] = [];
  if (knowledge.reference) lines.push(`المرجع: ${knowledge.reference}`);
  if (knowledge.verseText) lines.push(`نص الآية: ﴿${knowledge.verseText}﴾`);
  return lines;
}

function formatMorphology(rows: any[]): string {
  if (!rows?.length) return 'لا توجد بيانات صرفية متاحة لهذا الموضع.';

  return rows
    .slice(0, 50)
    .map((item: any) => {
      const bits = [
        `الكلمة ${item.wordNumber}`,
        item.form ? `الصيغة: ${item.form}` : '',
        item.root ? `الجذر: ${item.root}` : '',
        item.lemma ? `Lemma: ${item.lemma}` : '',
        item.tag ? `النوع: ${item.tag}` : ''
      ].filter(Boolean);
      return `• ${bits.join(' — ')}`;
    })
    .join('\n');
}

function formatTajweedRows(rows: any[]): string {
  if (!rows?.length) return 'لم تظهر مواضع للقاعدة المطلوبة في بيانات التجويد المتصلة.';

  return rows
    .slice(0, 50)
    .map((item: any) => {
      const label = item.ruleLabel || item.label || item.ruleKey || 'قاعدة تجويد';
      const marked = item.markedText || item.wordText || '';
      const location = item.location ? ` — الموضع: ${item.location}` : '';
      return `• ${label}${marked ? `: ${marked}` : ''}${location}`;
    })
    .join('\n');
}

function formatRoutedAnswer(result: any): string {
  const data = result?.data;

  if (result.intent === 'TAFSIR') {
    const knowledge = data;
    const lines = formatVerseHeader(knowledge);
    lines.push('');
    lines.push('التفسير الميسر:');
    lines.push(knowledge?.tafsirMuyassar?.text || result.message || 'لم يتم العثور على التفسير.');
    lines.push('');
    lines.push('المصدر: التفسير الميسر');
    return lines.join('\n');
  }

  if (result.intent === 'WORD_MEANING') {
    if (data?.countMode) {
      const scope = data?.surahName
        ? `في سورة ${data.surahName}`
        : 'في القرآن الكريم';

      const lines = [
        `ورد اللفظ الاسمي «${data?.term || ''}» ${data?.occurrenceCount ?? 0} مرة ${scope}.`,
        `وجاء في ${data?.verseCount ?? 0} آية.`,
        'طريقة العد: حُسبت اللفظة الاسمية نفسها بصيغها الصرفية، مثل دخول «الـ» أو التنوين، ولم تُحسب الكلمات الأخرى من الجذر إذا كانت لفظًا مختلفًا.'
      ];

      if (Array.isArray(data?.examples) && data.examples.length) {
        lines.push('أمثلة من المواضع:');

        for (const knowledge of data.examples) {
          lines.push(
            `سورة ${knowledge.surahName}، الآية ${knowledge.ayahNumber}`
          );
        }
      }

      return lines.join('\n');
    }

    if (data?.knowledge?.verseText) {
      const knowledge = data.knowledge;
      const lines = formatVerseHeader(knowledge);
      lines.push('');

      if (data?.term) {
        lines.push(`اللفظ المطلوب: ${data.term}`);
        lines.push('');
      }

      if (knowledge?.wordMeanings?.text) {
        lines.push('معنى اللفظ وغريب القرآن:');
        lines.push(knowledge.wordMeanings.text);
        lines.push('');
        lines.push('المصدر: الميسر في غريب القرآن');
      } else {
        lines.push('التفسير الميسر للسياق:');
        lines.push(
          knowledge?.tafsirMuyassar?.text ||
          result.message ||
          'لم يتم العثور على شرح للكلمة.'
        );
        lines.push('');
        lines.push('المصدر: التفسير الميسر');
      }

      return lines.join('\n');
    }

    if (Array.isArray(data?.occurrences)) {
      const lines: string[] = [];

      if (data?.term && data?.surahName) {
        lines.push(`لفظ «${data.term}» في سورة ${data.surahName}`);
      } else if (data?.term) {
        lines.push(`لفظ «${data.term}» في القرآن الكريم`);
      }

      if (data?.displayMode === 'first_last' && data?.totalOccurrences > 1) {
        lines.push(`إجمالي المواضع المطابقة: ${data.totalOccurrences}`);
        lines.push('أعرض أول وآخر موضع حسب طلبك.');
      } else {
        lines.push(`عدد المواضع المطابقة: ${data.totalOccurrences ?? data.occurrences.length}`);
      }

      if (data?.truncated) {
        lines.push('يعرض مِحَكّ أول 20 موضعًا فقط لتجنب إطالة النتيجة.');
      }

      for (const knowledge of data.occurrences) {
        lines.push('');
        lines.push(`سورة ${knowledge.surahName}، الآية ${knowledge.ayahNumber}`);

        if (knowledge?.verseText) {
          lines.push(`نص الآية: ﴿${knowledge.verseText}﴾`);
        }

        if (knowledge?.requestedWordMeaning) {
          lines.push(`المعنى: ${knowledge.requestedWordMeaning}`);
          lines.push('المصدر: الميسر في غريب القرآن');
        } else if (knowledge?.tafsirMuyassar?.text) {
          lines.push('لم يتوفر شرح مستقل للكلمة في ملف غريب القرآن؛ وهذا تفسير سياق الآية:');
          lines.push(knowledge.tafsirMuyassar.text);
          lines.push('المصدر: التفسير الميسر');
        } else {
          lines.push('لم يتوفر شرح مستقل لهذا اللفظ في المصادر المتصلة.');
        }
      }

      return lines.join('\n');
    }

    if (Array.isArray(data)) {
      return data
        .slice(0, 10)
        .map((x: any) => `• ${x.surahNumber}:${x.ayahNumber} — ${x.text}`)
        .join('\n') || result.message;
    }
  }

  if (result.intent === 'IRAB') {
    const knowledge = data;
    const lines = formatVerseHeader(knowledge);
    lines.push('');
    lines.push('الإعراب والتحليل اللغوي:');
    lines.push(knowledge?.irab?.text || result.message || 'لم يتم العثور على الإعراب.');
    lines.push('');
    lines.push('المصدر: الجدول في إعراب القرآن');
    return lines.join('\n');
  }

  if (result.intent === 'MORPHOLOGY') {
    const knowledge = data?.knowledge;
    const lines = formatVerseHeader(knowledge);
    lines.push('');
    lines.push('التحليل الصرفي والجذور:');
    lines.push(formatMorphology(data?.morphology || []));
    lines.push('');
    lines.push('المصدر: Quranic Arabic Corpus');
    return lines.join('\n');
  }

  if (result.intent === 'TAJWEED') {
    const knowledge = data?.knowledge;
    const lines = formatVerseHeader(knowledge);

    if (data?.occurrences) {
      lines.push('');
      lines.push('مواضع الحكم المطلوب:');
      lines.push(formatTajweedRows(data.occurrences));
    } else if (data?.tajweed) {
      lines.push('');
      lines.push('أحكام التجويد المعلَّمة في الآية:');
      lines.push(formatTajweedRows(data.tajweed.rules || []));
    } else if (Array.isArray(data)) {
      lines.push('');
      lines.push(data.map((x: any) => `• ${x.label}: ${x.shortDescription}`).join('\n'));
    } else {
      lines.push('');
      lines.push(result.message || 'لا توجد بيانات تجويد.');
    }

    lines.push('');
    lines.push('المصدر: QPC Hafs Tajweed Dataset');
    return lines.join('\n');
  }

  if (result.intent === 'WAQF') {
    if (data?.knowledge) {
      const lines = formatVerseHeader(data.knowledge);
      lines.push('');
      lines.push('علامات الوقف في الآية:');

      if (data.marks?.length) {
        for (const mark of data.marks) {
          lines.push(`• ${mark.symbol} — ${mark.info.label}: ${mark.info.description}`);
        }
      } else {
        lines.push('لا توجد علامة وقف من العلامات المدعومة في هذا الموضع.');
      }
      return lines.join('\n');
    }

    if (data?.surahName && typeof data?.total === 'number') {
      const lines = [`سورة ${data.surahName}`];

      if (data?.requestedType) {
        lines.push(
          `${data.requestedType.label}: ${data.requestedCount ?? 0} موضع/مواضع`
        );
        lines.push(
          `العلامة في النص المستخدم: ${data.requestedType.symbol}`
        );

        if (Array.isArray(data.requestedOccurrences) && data.requestedOccurrences.length) {
          lines.push('');
          lines.push('المواضع:');
          for (const item of data.requestedOccurrences) {
            lines.push(`• الآية ${item.ayahNumber} — ${item.symbol}`);
          }
        }
      } else {
        lines.push(
          `إجمالي علامات الوقف المدعومة في النص المستخدم: ${data.total}`
        );
      }

      lines.push('');
      lines.push('المصدر: Tanzil Quran Text + علامات الوقف المرمّزة في النص');
      return lines.join('\n');
    }

    if (data?.symbol) {
      return `${data.symbol} — ${data.label}\n${data.description}`;
    }

    return result.message || 'حدد علامة الوقف أو اسم السورة أو موضع الآية.';
  }

  if (result.intent === 'SAKT') {
    const knowledge = data?.knowledge;
    const positions = data?.positions || (Array.isArray(data) ? data : []);
    const lines = formatVerseHeader(knowledge);

    if (lines.length) lines.push('');
    lines.push('السكتات/الأوجه المخزنة:');

    if (!positions.length) {
      lines.push(result.message || 'لا يوجد موضع سكت مخزن لهذا الموضع.');
    } else {
      for (const item of positions) {
        lines.push(`• ${item.beforeText || ''}${item.afterText ? ` | ${item.afterText}` : ''}`);
        if (item.rulingLabel) lines.push(`  ${item.rulingLabel}`);
        if (item.description) lines.push(`  ${item.description}`);
        if (item.riwayah) lines.push(`  الرواية: ${item.riwayah}${item.tariq ? ` — ${item.tariq}` : ''}`);
      }
    }

    return lines.join('\n');
  }

  if (result.intent === 'SAJDA') {
    if (data?.knowledge) {
      const lines = formatVerseHeader(data.knowledge);
      lines.push('');
      lines.push(
        data.sajda
          ? `موضع سجدة مسجل في الـmetadata. التصنيف في المصدر: ${data.sajda.type}.`
          : 'لا توجد سجدة مسجلة لهذه الآية في الـmetadata المتصل.'
      );
      return lines.join('\n');
    }

    if (typeof data?.count === 'number' && Array.isArray(data?.positions)) {
      const lines: string[] = [];

      if (data?.surahName) {
        lines.push(`سورة ${data.surahName}`);
        lines.push(`عدد مواضع سجود التلاوة المسجلة: ${data.count}`);
      } else {
        lines.push(`عدد مواضع سجود التلاوة المسجلة: ${data.count}`);
      }

      if (data.positions.length) {
        lines.push('');
        lines.push('المواضع:');
        for (const item of data.positions) {
          lines.push(
            `• ${item.reference}${item.type ? ` — تصنيف المصدر: ${item.type}` : ''}`
          );
        }
      }

      lines.push('');
      lines.push('المصدر: Tanzil Quran Metadata');
      return lines.join('\n');
    }

    if (Array.isArray(data)) {
      if (!data.length) return result.message || 'لا توجد مواضع سجدة مسجلة.';
      return data
        .map((item: any) => `• ${item.reference}${item.type ? ` — تصنيف المصدر: ${item.type}` : ''}`)
        .join('\n');
    }
  }

  if (
    result.intent === 'SURAH_INFO' &&
    result.understoodAs === 'مرجع القرآن والمصحف'
  ) {
    return result.message || 'تم استخراج الإجابة من مرجع القرآن والمصحف المحلي.';
  }

  if (result.intent === 'SURAH_INFO' && data) {
    const type =
      data.type === 'Meccan'
        ? 'مكية'
        : data.type === 'Medinan'
          ? 'مدنية'
          : data.type || 'غير محدد';

    return [
      `سورة ${data.name}`,
      `رقم السورة: ${data.surahNumber}`,
      `عدد الآيات: ${data.ayahCount}`,
      `التصنيف: ${type}`,
      data.revelationOrder ? `ترتيب النزول في الـmetadata: ${data.revelationOrder}` : '',
      data.firstVerse ? `أول آية: ﴿${data.firstVerse}﴾` : ''
    ].filter(Boolean).join('\n');
  }

  if (result.intent === 'SOURCE_BOUND_QA') {
    const passages = Array.isArray(data?.passages) ? data.passages : [];

    if (!passages.length) {
      return 'لم تتوفر المواضع المرجعية المطلوبة في المصادر المتصلة.';
    }

    const refs = passages
      .map((knowledge: any) => knowledge?.reference)
      .filter(Boolean)
      .join('، ');

    return [
      `تم العثور على المواضع المرجعية المطلوبة${refs ? `: ${refs}` : ''}.`,
      '',
      'لكن تعذر إكمال المقارنة الدلالية الآلية الآن.',
      'لم يضف مِحَكّ استنتاجًا من خارج المصادر المتصلة.'
    ].join('\n');
  }

  if (result.intent === 'EXPLANATION_CHECK') {
    const knowledge = data?.knowledge;
    const lines = formatVerseHeader(knowledge);
    lines.push('');
    lines.push('التفسير المرجعي:');
    lines.push(knowledge?.tafsirMuyassar?.text || 'لم يتوفر تفسير مرجعي.');
    lines.push('');
    lines.push('ملاحظة: فحص توافق شرح المستخدم يحتاج مقارنة دلالية مقيدة بهذا المصدر؛ لا يُعد التشابه اللفظي وحده دليلاً على الدعم.');
    return lines.join('\n');
  }

  return result.message || 'لم يتم العثور على نتيجة كافية في المصادر المتصلة.';
}


function shortHadithText(text: string, max = 260): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}…`;
}

function formatHadithAnswer(input: string, result: any): string {
  const data = result?.data;
  const record = data?.record;

  if (result.intent === 'HADITH_STATUS') {
    return result.message || 'بيانات الحديث جاهزة للبحث.';
  }

  if (result.intent === 'HADITH_SEARCH') {
    const rows = Array.isArray(data?.results) ? data.results : [];

    if (!rows.length) {
      return result.message || 'لم يتم العثور على نتائج كافية.';
    }

    return rows
      .map((item: any, index: number) => {
        const r = item?.record || {};
        const bits = [
          `${index + 1}. ${r.title || shortHadithText(r.hadith_text, 120)}`,
          r.grade ? `الدرجة: ${r.grade}` : '',
          r.takhrij ? `التخريج: ${r.takhrij}` : ''
        ].filter(Boolean);

        return bits.join(' — ');
      })
      .join('\n');
  }

  if (!record) {
    return result.message ||
      'لم أعثر على مطابقة كافية في المصدر الحديثي المتاح.';
  }

  const title = record.title || 'الحديث المطابق';

  if (result.intent === 'HADITH_DETAILS') {
    const lines = [
      `الحديث: ${title}`,
      record.grade
        ? `الدرجة: ${record.grade}`
        : 'الدرجة غير متاحة في المصدر.',
      record.takhrij
        ? `التخريج: ${record.takhrij}`
        : 'التخريج غير متاح في المصدر.'
    ];

    const normalizedInput = String(input || '').normalize('NFKD')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .toLowerCase();

    if (normalizedInput.includes('متفق عليه')) {
      const normalizedTakhrij = String(record.takhrij || '')
        .normalize('NFKD')
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .toLowerCase();

      lines.push(
        normalizedTakhrij.includes('متفق عليه')
          ? 'هل هو متفق عليه؟ نعم، وفق التخريج الوارد في المصدر.'
          : `هل هو متفق عليه؟ لا. التخريج الوارد في المصدر: ${record.takhrij || 'غير متاح'}.`
      );
    }

    return lines.join('\n');
  }

  if (result.intent === 'HADITH_EXPLANATION') {
    return [
      `الحديث: ${title}`,
      record.hadith_text ? `نص الحديث: ${record.hadith_text}` : '',
      'الشرح:',
      record.explanation ||
        'لا يتوفر شرح لهذا الحديث في المصدر الحالي.',
      record.grade ? `الدرجة: ${record.grade}` : '',
      record.takhrij ? `التخريج: ${record.takhrij}` : ''
    ].filter(Boolean).join('\n');
  }

  if (result.intent === 'HADITH_WORD_MEANING') {
    return [
      `الحديث: ${title}`,
      record.hadith_text
        ? `نص الحديث: ${shortHadithText(record.hadith_text, 700)}`
        : '',
      'معنى الكلمة أو اللفظ:',
      record.word_meanings && record.word_meanings !== '-'
        ? record.word_meanings
        : 'لا يتوفر شرح مستقل للكلمة في المصدر الحالي.',
      record.grade ? `الدرجة: ${record.grade}` : '',
      record.takhrij ? `التخريج: ${record.takhrij}` : ''
    ].filter(Boolean).join('\n');
  }

  if (result.intent === 'HADITH_VERIFY') {
    return [
      data?.strongMatch
        ? 'النص مطابق لحديث موجود في المصدر الحديثي.'
        : 'يوجد حديث قريب، لكن النص المدخل ليس مطابقًا حرفيًا له.',
      `الحديث: ${title}`,
      `النص المرجعي: ${shortHadithText(record.hadith_text, 500)}`,
      record.grade ? `الدرجة: ${record.grade}` : '',
      record.takhrij ? `التخريج: ${record.takhrij}` : ''
    ].filter(Boolean).join('\n');
  }

  const gradeLine = record.grade ? `الحديث ${record.grade}` : 'الحديث مثبت في المصدر';
  const takhrijLine = record.takhrij ? `، ${record.takhrij}` : '';

  return [
    `${gradeLine}${takhrijLine}.`,
    '',
    'الحديث:',
    record.hadith_text ? record.hadith_text.trim() : title
  ].join('\n');
}

function buildHadithKnowledgeRun(
  input: string,
  result: any
): AuditRun {
  const rawAnswer = formatHadithAnswer(input, result);
  const answer = formatQuestionAnswer(
    input,
    rawAnswer,
    hadithSourcesForResult(result)
  );
  const hasData = Boolean(result?.data);

  const weakVerification =
    result?.intent === 'HADITH_VERIFY' &&
    result?.data &&
    !result.data.strongMatch;

  const claim: Claim = {
    id: 'CLM-001',
    claim_text: answer,
    source_span: { text: input, start: 0, end: input.length },
    status: weakVerification
      ? 'INSUFFICIENT_EVIDENCE'
      : hasData
        ? 'SUPPORTED'
        : 'INSUFFICIENT_EVIDENCE',
    confidence_score: weakVerification ? 0.45 : hasData ? 0.95 : 0,
    evidence_relation: weakVerification
      ? 'UNRESOLVED'
      : hasData
        ? 'DIRECT_SUPPORT'
        : 'UNVERIFIED',
    evidence_passage: answer,
    verification_rationale:
      'النتيجة مبنية على سجل HadeethEnc المتصل. الدرجة والتخريج معروضان كما هما في المصدر، وليسا حكمًا مستقلاً صادرًا عن مِحَكّ.'
  } as Claim;

  return buildAuditRunFromClaims(input, [claim], Date.now());
}

async function answerSourceBoundHadithQuestion(
  input: string,
  result: any
): Promise<AuditRun | null> {
  if (!ai || result?.intent !== 'HADITH_SOURCE_BOUND_QA') return null;

  const record = result?.data?.record;
  if (!record) return null;

  const evidence = [
    record.title ? `العنوان: ${record.title}` : '',
    record.hadith_text ? `نص الحديث: ${record.hadith_text}` : '',
    record.explanation ? `الشرح: ${record.explanation}` : '',
    record.word_meanings ? `معاني الكلمات: ${record.word_meanings}` : '',
    record.benefits ? `الفوائد المذكورة في المصدر: ${record.benefits}` : '',
    record.grade ? `الدرجة في المصدر: ${record.grade}` : '',
    record.takhrij ? `التخريج في المصدر: ${record.takhrij}` : ''
  ].filter(Boolean).join('\n');

  const prompt = `
السؤال أو الادعاء:
"""${input}"""

السجل المرجعي الوحيد المسموح باستخدامه:
"""${evidence}"""

أجب اعتمادًا على هذا السجل فقط.

قواعد إلزامية:
1. لا تستخدم ذاكرتك الدينية أو أي مصدر خارجي.
2. إذا كان المستخدم قد غيّر لفظًا أو قيدًا في الحديث، وضح التغيير.
3. إذا كان الشرح ينفي استنتاج المستخدم صراحة، قل ذلك بوضوح.
4. فرّق بين ما يقوله السجل صراحة وما يحتاج مراجعة متخصصة.
5. لا تصدر فتوى مستقلة ولا تضف تخريجًا أو درجة من ذاكرتك.
6. كن مختصرًا وواضحًا.

أعد JSON فقط:
{
  "answer": "الجواب المباشر",
  "explicitSupport": ["ما يدعمه السجل صراحة"],
  "unsupportedOrChanged": ["ما لا يدعمه السجل أو ما تغير"],
  "specialistReview": ["ما يحتاج مراجعة متخصصة إن وجد"]
}
  `.trim();

  const modelsToTry = MIHAK_REASONING_MODELS;

  for (const model of modelsToTry) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            systemInstruction:
              'MIHAK hadith source-bound analysis. Use only the supplied HadeethEnc record.'
          }
        }),
        createTimeout(22000, `Hadith source-bound analysis timed out on ${model}`)
      ]);

      const raw = String((response as any)?.text || '').trim();
      if (!raw) continue;

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = JSON.parse(
          raw.replace(/```json/gi, '').replace(/```/g, '').trim()
        );
      }

      const answerText = String(parsed?.answer || '').trim();
      if (!answerText) continue;

      const explicitSupport = Array.isArray(parsed?.explicitSupport)
        ? parsed.explicitSupport.map((x: any) => String(x).trim()).filter(Boolean)
        : [];

      const unsupported = Array.isArray(parsed?.unsupportedOrChanged)
        ? parsed.unsupportedOrChanged.map((x: any) => String(x).trim()).filter(Boolean)
        : [];

      const specialist = Array.isArray(parsed?.specialistReview)
        ? parsed.specialistReview.map((x: any) => String(x).trim()).filter(Boolean)
        : [];

      const lines: string[] = [answerText];

      if (explicitSupport.length) {
        lines.push('', 'ما يدعمه المصدر بوضوح:');
        explicitSupport.forEach((x: string) => lines.push(`• ${x}`));
      }

      if (unsupported.length) {
        lines.push('', 'ما لا يدعمه المصدر أو ما تغيّر:');
        unsupported.forEach((x: string) => lines.push(`• ${x}`));
      }

      if (specialist.length) {
        lines.push('', 'يحتاج مراجعة متخصصة:');
        specialist.forEach((x: string) => lines.push(`• ${x}`));
      }

      const rawAnswer = lines.join('\n');
      const answer = formatQuestionAnswer(
        input,
        rawAnswer,
        hadithSourcesForResult(result)
      );

      const claim: Claim = {
        id: 'CLM-001',
        claim_text: answer,
        source_span: { text: input, start: 0, end: input.length },
        status: unsupported.length || specialist.length
          ? 'PARTIALLY_SUPPORTED'
          : 'SUPPORTED',
        confidence_score: 0.9,
        evidence_relation: unsupported.length || specialist.length
          ? 'UNRESOLVED'
          : 'DIRECT_SUPPORT',
        evidence_passage: evidence,
        verification_rationale:
          'التحليل مقيد بسجل HadeethEnc المسترجع فقط، دون استخدام ذاكرة النموذج كدليل ديني.'
      } as Claim;

      return buildAuditRunFromClaims(input, [claim], Date.now());
    } catch (err) {
      console.warn(`[MIHAK] Hadith source-bound analysis failed on ${model}.`, err);
    }
  }

  return null;
}


async function tryQuranFoundationDirect(
  input: string
): Promise<AuditRun | null> {
  try {
    return await processQuranInput(input);
  } catch (error) {
    console.warn(
      '[MIHAK] Quran Foundation direct engine failed:',
      error
    );
    return null;
  }
}

function buildKnowledgeRun(input: string, result: any): AuditRun {
  const startTime = Date.now();
  const rawAnswer = formatRoutedAnswer(result);
  const answer = formatQuestionAnswer(
    input,
    rawAnswer,
    quranSourcesForResult(result)
  );

  const hasUsefulData =
    result?.data !== undefined &&
    result?.data !== null &&
    (!Array.isArray(result.data) || result.data.length > 0);

  const isSemanticCheck = result.intent === 'EXPLANATION_CHECK';

  const claim: Claim = {
    id: 'CLM-001',
    claim_text: answer,
    source_span: {
      text: input,
      start: 0,
      end: input.length
    },
    status: isSemanticCheck
      ? 'NEEDS_SPECIALIST_REVIEW'
      : hasUsefulData
        ? 'SUPPORTED'
        : 'INSUFFICIENT_EVIDENCE',
    confidence_score: isSemanticCheck ? 0.5 : hasUsefulData ? 1 : 0,
    evidence_relation: isSemanticCheck ? 'UNRESOLVED' : hasUsefulData ? 'DIRECT_SUPPORT' : 'UNVERIFIED',
    evidence_passage: answer,
    verification_rationale: isSemanticCheck
      ? 'تم جلب الآية والتفسير المرجعي من المصادر المحلية، ولم يُفترض أن شرح المستخدم مدعوم دون مقارنة دلالية مقيدة بالمصدر.'
      : `الإجابة مستخرجة من المصدر/المصادر المحلية المتصلة: ${sourceLabel(result.source)}.`
  } as Claim;

  return buildAuditRunFromClaims(input, [claim], startTime);
}


function looksLikeGeneralQuranQuestion(input: string): boolean {
  const q = String(input || '')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();

  const questionSignals = [
    'ما هي السوره',
    'ما السوره',
    'اي سوره',
    'أي سوره',
    'في اي سوره',
    'في أي سوره',
    'ما الايه',
    'ما الآيه',
    'ايه التي',
    'القران',
    'القرآن',
    'سوره تتحدث',
    'سوره تحدثت',
    'ورد في القران',
    'ذكر في القران',
    'ذكرت في القران'
  ];

  return questionSignals.some((signal) => q.includes(signal));
}

function normalizeGeneralQuranQuery(text: string): string {
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
    .trim()
    .toLowerCase();
}

function extractLocalQuranSearchTerms(input: string): string[] {
  const stopWords = new Set([
    'ما', 'ماذا', 'من', 'هي', 'هو', 'التي', 'الذي', 'الذين',
    'اي', 'في', 'عن', 'على', 'الى', 'هل', 'كم', 'اذكر',
    'السوره', 'سوره', 'الايه', 'ايه', 'القران', 'تحدثت',
    'تتكلم', 'تكلمت', 'وردت', 'ورد', 'ذكر', 'ذكرت',
    'تحدث', 'خاصه', 'خاصة', 'المقصود'
  ]);

  const tokens = normalizeGeneralQuranQuery(input)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) =>
      token.length >= 3 &&
      !stopWords.has(token)
    );

  return Array.from(new Set(tokens)).slice(0, 10);
}

function asksForSurahName(input: string): boolean {
  const q = normalizeGeneralQuranQuery(input);

  return (
    q.includes('ما السوره') ||
    q.includes('ما هي السوره') ||
    q.includes('اي سوره') ||
    q.includes('في اي سوره')
  );
}

async function extractQuranSearchTerms(input: string): Promise<string[]> {
  if (!ai) return [];

  const modelsToTry = MIHAK_FAST_MODELS;

  const prompt = `
حوّل السؤال التالي إلى كلمات أو عبارات عربية قصيرة تصلح للبحث الحرفي داخل تفسير القرآن.

السؤال:
"""${input}"""

قواعد:
- لا تجب عن السؤال.
- لا تذكر اسم سورة أو رقم آية من ذاكرتك.
- استخرج فقط ألفاظ الموضوع والمترادفات القريبة التي قد تظهر في التفسير.
- أعطِ من 2 إلى 6 عبارات قصيرة.
- أعد JSON فقط:
{"terms":["...","..."]}
  `.trim();

  for (const model of modelsToTry) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0
          }
        }),
        createTimeout(18000, `Quran search-term extraction timed out on ${model}`)
      ]);

      const raw = String((response as any)?.text || '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const terms = Array.isArray(parsed?.terms)
        ? parsed.terms
            .map((x: any) => String(x || '').trim())
            .filter((x: string) => x.length >= 2)
            .slice(0, 6)
        : [];

      if (terms.length) return Array.from(new Set(terms));
    } catch (err) {
      console.warn(`[MIHAK] Quran search-term extraction failed on ${model}.`, err);
    }
  }

  return [];
}

async function answerGeneralQuranQuestion(
  input: string
): Promise<AuditRun | null> {
  if (!ai || !looksLikeGeneralQuranQuestion(input)) return null;

  const localTerms = extractLocalQuranSearchTerms(input);
  const modelTerms = await extractQuranSearchTerms(input);

  const terms = Array.from(
    new Set(
      [...localTerms, ...modelTerms]
        .map((term) => String(term || '').trim())
        .filter((term) => term.length >= 2)
    )
  ).slice(0, 12);

  if (!terms.length) return null;

  const tafsirHits = searchTafsirRanked(terms, 18);
  const gharibHits = searchGharibRanked(terms, 8);

  const preferSurahOverview = asksForSurahName(input);

  const combined = [
    ...tafsirHits.map((hit: any) => {
      const normalizedEvidence =
        normalizeGeneralQuranQuery(hit?.text || '');

      const overviewBonus =
        preferSurahOverview &&
        (
          normalizedEvidence.includes('من مقاصد السوره') ||
          normalizedEvidence.includes('تسميه السوره')
        )
          ? 14
          : 0;

      return {
        ...hit,
        score: Number(hit?.score || 0) + overviewBonus,
        evidenceType: 'tafsir',
        surahOverview: overviewBonus > 0
      };
    }),
    ...gharibHits.map((hit: any) => ({
      ...hit,
      evidenceType: 'gharib',
      surahOverview: false
    }))
  ]
    .sort((a: any, b: any) => {
      if (b.score !== a.score) return b.score - a.score;
      if (Boolean(b.surahOverview) !== Boolean(a.surahOverview)) {
        return b.surahOverview ? 1 : -1;
      }
      if (a.surahNumber !== b.surahNumber) {
        return a.surahNumber - b.surahNumber;
      }
      return a.ayahNumber - b.ayahNumber;
    });

  const seen = new Set<string>();
  const hits = combined
    .filter((hit: any) => {
      const key = `${hit.surahNumber}:${hit.ayahNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);

  if (!hits.length) return null;

  const passages = hits
    .map((hit: any) => {
      const knowledge = getVerseKnowledge(
        hit.surahNumber,
        hit.ayahNumber
      );

      if (!knowledge?.verseText) return null;

      return {
        score: hit.score,
        matchedTerms: hit.matchedTerms || [],
        reference:
          knowledge.reference ||
          `سورة ${knowledge.surahName}، الآية ${knowledge.ayahNumber}`,
        surahName: knowledge.surahName,
        ayahNumber: knowledge.ayahNumber,
        verseText: knowledge.verseText,
        tafsir:
          knowledge?.tafsirMuyassar?.text ||
          (hit.evidenceType === 'tafsir' ? hit.text : ''),
        gharib:
          knowledge?.wordMeanings?.text ||
          (hit.evidenceType === 'gharib' ? hit.text : '')
      };
    })
    .filter(Boolean);

  if (!passages.length) return null;

  const topPassage: any = passages[0];

  // Deterministic answer for "which surah?" when retrieval is strong.
  // This avoids asking the model to choose a surah after evidence ranking.
  if (
    asksForSurahName(input) &&
    topPassage?.surahName &&
    Number(topPassage?.score || 0) >= 16
  ) {
    const rawBody = [
      `السورة هي سورة ${topPassage.surahName}.`,
      topPassage?.verseText
        ? `ومن أوضح المواضع: ﴿${topPassage.verseText}﴾`
        : '',
      topPassage?.tafsir
        ? `ويبين التفسير الميسر: ${topPassage.tafsir}`
        : ''
    ].filter(Boolean).join('\n');

    const answer = formatQuestionAnswer(
      input,
      rawBody,
      uniqueStrings([
        topPassage?.reference
          ? `القرآن الكريم — ${topPassage.reference}`
          : 'القرآن الكريم',
        topPassage?.tafsir
          ? 'التفسير الميسر'
          : ''
      ])
    );

    const claim: Claim = {
      id: 'CLM-001',
      claim_text: answer,
      source_span: {
        text: input,
        start: 0,
        end: input.length
      },
      status: 'SUPPORTED',
      confidence_score: 0.94,
      evidence_relation: 'DIRECT_SUPPORT',
      evidence_passage: [
        topPassage.reference,
        topPassage.verseText,
        topPassage.tafsir
      ].filter(Boolean).join('\n'),
      verification_rationale:
        'اختيرت الإجابة من أعلى نتيجة مرتبة داخل القرآن والتفسير الميسر، دون استخدام ذاكرة النموذج كدليل.'
    } as Claim;

    return buildAuditRunFromClaims(
      input,
      [claim],
      Date.now()
    );
  }

  const evidencePacket = passages
    .map((passage: any, index: number) => [
      `الدليل ${index + 1}`,
      `الموضع: ${passage.reference}`,
      `درجة الصلة الاسترجاعية: ${passage.score ?? 0}`,
      passage.matchedTerms?.length
        ? `المفاهيم المطابقة: ${passage.matchedTerms.join('، ')}`
        : '',
      `نص الآية: ${passage.verseText}`,
      passage.tafsir ? `التفسير الميسر: ${passage.tafsir}` : '',
      passage.gharib ? `غريب القرآن: ${passage.gharib}` : ''
    ].filter(Boolean).join('\n'))
    .join('\n\n');

  const prompt = `
السؤال:
"""${input}"""

الأدلة المسترجعة من المصادر:
"""${evidencePacket}"""

أجب عن السؤال اعتمادًا على الأدلة المرفقة فقط.

قواعد إلزامية:
1. لا تستخدم ذاكرتك الدينية أو أي معلومة غير موجودة في الأدلة.
2. إذا كان السؤال يسأل "ما السورة" فاذكر اسم السورة فقط إذا كان الدليل يثبت ذلك بوضوح.
3. اذكر الآية أو الآيات الأوضح التي تثبت الإجابة عندما تكون ذات صلة.
4. لا تملأ الإجابة ببيانات غير مطلوبة مثل عدد صفحات السورة أو ترتيب النزول.
5. إذا كان أكثر من موضع مناسبًا، اذكر الأوضح ثم وضّح الباقي باختصار.
6. إذا لم تكف الأدلة للجزم، اجعل supported=false.
7. لا تصدر فتوى.

أعد JSON فقط:
{
  "supported": true,
  "answer": "الجواب المباشر المختصر",
  "supportPoints": ["نقطة دليل", "نقطة دليل أخرى"],
  "references": ["اسم السورة، رقم الآية"]
}
  `.trim();

  const modelsToTry = MIHAK_REASONING_MODELS;

  for (const model of modelsToTry) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            systemInstruction:
              'MIHAK source-bound Quran QA. The supplied evidence is the only religious evidence.'
          }
        }),
        createTimeout(22000, `General Quran QA timed out on ${model}`)
      ]);

      const raw = String((response as any)?.text || '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (parsed?.supported !== true) return null;

      const answerText = String(parsed?.answer || '').trim();
      if (!answerText) continue;

      const supportPoints = Array.isArray(parsed?.supportPoints)
        ? parsed.supportPoints
            .map((x: any) => String(x || '').trim())
            .filter(Boolean)
        : [];

      const rawBody = [
        answerText,
        ...supportPoints
      ].filter(Boolean).join('\n');

      const evidenceSources = uniqueStrings([
        ...passages.map((p: any) =>
          p.reference
            ? `القرآن الكريم — ${p.reference}`
            : ''
        ),
        'التفسير الميسر'
      ]);

      const answer = formatQuestionAnswer(
        input,
        rawBody,
        evidenceSources
      );

      const claim: Claim = {
        id: 'CLM-001',
        claim_text: answer,
        source_span: {
          text: input,
          start: 0,
          end: input.length
        },
        status: 'SUPPORTED',
        confidence_score: 0.9,
        evidence_relation: 'DIRECT_SUPPORT',
        evidence_passage: evidencePacket,
        verification_rationale:
          'الإجابة صيغت فقط من الآيات والتفسير المسترجعين من المصادر المعتمدة.'
      } as Claim;

      return buildAuditRunFromClaims(
        input,
        [claim],
        Date.now()
      );
    } catch (err) {
      console.warn(`[MIHAK] General Quran QA failed on ${model}.`, err);
    }
  }

  return null;
}

async function answerSourceBoundQuranQuestion(
  input: string,
  result: any
): Promise<AuditRun | null> {
  if (!ai || result?.intent !== 'SOURCE_BOUND_QA') return null;

  const passages = Array.isArray(result?.data?.passages)
    ? result.data.passages
    : [];

  if (passages.length < 2) return null;

  const evidencePacket = passages
    .map((knowledge: any, index: number) => {
      return [
        `الموضع ${index + 1}: ${knowledge?.reference || ''}`,
        `نص الآية: ${knowledge?.verseText || ''}`,
        `التفسير الميسر: ${knowledge?.tafsirMuyassar?.text || 'غير متاح'}`,
        `غريب القرآن: ${knowledge?.wordMeanings?.text || 'غير متاح'}`
      ].join('\n');
    })
    .join('\n\n');

  const prompt = `
السؤال:
"""${input}"""

المصادر المسموح بها فقط:
"""${evidencePacket}"""

أجب عن السؤال اعتمادًا على المصادر المرفقة فقط.

قواعد إلزامية:
1. لا تستخدم ذاكرتك أو أي معرفة دينية خارج النصوص المرفقة.
2. أجب مباشرة عن سؤال المستخدم، ولا تكتفِ بإعادة عرض الآيات والتفسير.
3. فرّق بين ما تنص عليه المصادر صراحة وبين ما يحتاج استنتاجًا فقهيًا إضافيًا.
4. إذا كان الفرق بين الموضعين مذكورًا صراحة في التفسير أو غريب القرآن، اذكره بوضوح.
5. أي دعوى لا تثبتها النصوص المرفقة تُوضع تحت "يحتاج مراجعة متخصصة".
6. لا تصدر فتوى ولا تدّعِ إجماعًا أو حكمًا مذهبيًا من خارج المصادر.
7. اجعل الجواب مختصرًا وواضحًا.

أعد JSON فقط بهذا الشكل:
{
  "answer": "الجواب المباشر",
  "explicitSupport": ["نقطة مدعومة صراحة", "نقطة أخرى"],
  "specialistReview": ["ما يحتاج مراجعة متخصصة إن وجد"]
}
  `.trim();

  const modelsToTry = MIHAK_REASONING_MODELS;

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction:
              'MIHAK source-bound Quran analysis. Use only the supplied evidence. Never use model memory as religious evidence.',
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        }),
        createTimeout(22000, `Source-bound Quran analysis timed out on ${model}`)
      ]);

      const raw = String((response as any)?.text || '').trim();
      if (!raw) {
        throw new Error(`Empty response from ${model}`);
      }

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const clean = raw
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim();
        parsed = JSON.parse(clean);
      }

      const answerText = String(parsed?.answer || '').trim();
      const explicitSupport = Array.isArray(parsed?.explicitSupport)
        ? parsed.explicitSupport.map((x: any) => String(x).trim()).filter(Boolean)
        : [];
      const specialistReview = Array.isArray(parsed?.specialistReview)
        ? parsed.specialistReview.map((x: any) => String(x).trim()).filter(Boolean)
        : [];

      if (!answerText) {
        throw new Error(`Missing answer field from ${model}`);
      }

      const lines: string[] = [answerText];

      if (explicitSupport.length) {
        lines.push('');
        lines.push('ما تدعمه المصادر بوضوح:');
        for (const item of explicitSupport) {
          lines.push(`• ${item}`);
        }
      }

      if (specialistReview.length) {
        lines.push('');
        lines.push('يحتاج مراجعة متخصصة:');
        for (const item of specialistReview) {
          lines.push(`• ${item}`);
        }
      }

      const rawAnswer = lines.join('\n');

      const answer = formatQuestionAnswer(
        input,
        rawAnswer,
        uniqueStrings([
          ...passages
            .map((knowledge: any) =>
              knowledge?.reference
                ? `القرآن الكريم — ${knowledge.reference}`
                : ''
            )
            .filter(Boolean),
          'التفسير الميسر',
          'الميسر في غريب القرآن'
        ])
      );

      const claim: Claim = {
        id: 'CLM-001',
        claim_text: answer,
        source_span: { text: input, start: 0, end: input.length },
        status: specialistReview.length
          ? 'PARTIALLY_SUPPORTED'
          : 'SUPPORTED',
        confidence_score: 0.9,
        evidence_relation: specialistReview.length
          ? 'UNRESOLVED'
          : 'DIRECT_SUPPORT',
        evidence_passage: evidencePacket,
        verification_rationale:
          `الإجابة مبنية على المصادر المحلية المتصلة فقط: ${sourceLabel(result.source)}.`
      } as Claim;

      return buildAuditRunFromClaims(input, [claim], Date.now());
    } catch (err) {
      lastError = err;
      console.warn(
        `[MIHAK] Source-bound analysis failed on ${model}.`,
        err
      );
    }
  }

  console.warn(
    '[MIHAK] All source-bound analysis models failed.',
    lastError
  );

  return null;
}

async function verifyExplanationAgainstTafsir(
  input: string,
  result: any
): Promise<AuditRun | null> {
  if (!ai || result.intent !== 'EXPLANATION_CHECK') return null;

  const knowledge = result?.data?.knowledge;
  const tafsir = knowledge?.tafsirMuyassar?.text;
  if (!tafsir) return null;

  try {
    const response = await generateWithModelFallback(
      MIHAK_REASONING_MODELS,
      (model) => ai!.models.generateContent({
        model,
        contents: `
قارن شرح المستخدم التالي حصراً بالتفسير المرجعي المرفق.

شرح المستخدم:
"""${input}"""

نص الآية:
"""${knowledge.verseText || ''}"""

التفسير المرجعي:
"""${tafsir}"""

صنّف العلاقة فقط إلى:
SUPPORTED = المعنى الذي كتبه المستخدم مدعوم مباشرة بالمصدر المرجعي.
PARTIALLY_SUPPORTED = جزء مدعوم وجزء يتجاوز المصدر أو يضيف تعميماً.
INSUFFICIENT_EVIDENCE = المصدر المرجعي لا يكفي لإثبات الشرح.

لا تستخدم أي معرفة خارج النصين. لا تعط فتوى ولا تضف تفسيراً من ذاكرتك.
        `.trim(),
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING },
              rationale: { type: Type.STRING }
            },
            required: ['status', 'rationale']
          }
        }
      }),
      22000,
      'Semantic explanation verification'
    );

    const parsed = JSON.parse(response.text || '{}');
    const allowed = new Set(['SUPPORTED', 'PARTIALLY_SUPPORTED', 'INSUFFICIENT_EVIDENCE']);
    const status = allowed.has(String(parsed.status))
      ? String(parsed.status)
      : 'INSUFFICIENT_EVIDENCE';

    const rawAnswer = [
      ...formatVerseHeader(knowledge),
      '',
      'التفسير المرجعي:',
      tafsir,
      '',
      'نتيجة فحص الشرح:',
      String(parsed.rationale || 'لم تتوفر نتيجة دلالية كافية.')
    ].join('\n');

    const answer = formatQuestionAnswer(
      input,
      rawAnswer,
      uniqueStrings([
        knowledge?.reference
          ? `القرآن الكريم — ${knowledge.reference}`
          : 'القرآن الكريم',
        'التفسير الميسر'
      ])
    );

    const claim: Claim = {
      id: 'CLM-001',
      claim_text: answer,
      source_span: { text: input, start: 0, end: input.length },
      status: status as Claim['status'],
      confidence_score: 0.8,
      evidence_relation: status === 'SUPPORTED' ? 'DIRECT_SUPPORT' : 'UNRESOLVED',
      evidence_passage: tafsir,
      verification_rationale: String(parsed.rationale || '')
    } as Claim;

    return buildAuditRunFromClaims(input, [claim], Date.now());
  } catch (err) {
    console.warn('[MIHAK] Explanation semantic verification failed.', err);
    return null;
  }
}

export async function auditContentWithGemini(text: string): Promise<AuditRun> {
  const cleanText = text.trim();

  if (!cleanText) {
    return auditQuranContentLocally(cleanText);
  }

  /* 1) Authoritative Master Intent Router: understands full sentence before choosing retrieval */
  const masterRoute = classifyMasterIntent(cleanText);

  // If specific Quran, Hadith, Sirah, Structural, Tafsir, Word Count, Meaning, Comparison, or Multi-Question:
  if (masterRoute.intent !== 'CLAIM_AUDIT' && masterRoute.intent !== 'UNKNOWN') {
    return await executeMasterRoute(cleanText);
  }

  // If input is an explicit question (ends with '؟' or starts with an interrogative) but UNKNOWN:
  // Gracefully abstain rather than converting to random token/word searches
  if (
    cleanText.includes('؟') ||
    cleanText.startsWith('ما ') ||
    cleanText.startsWith('هل ') ||
    cleanText.startsWith('كم ') ||
    cleanText.startsWith('أين ') ||
    cleanText.startsWith('اين ') ||
    cleanText.startsWith('كيف ')
  ) {
    return await executeMasterRoute(cleanText);
  }

  /* 2) Multi-question inputs: split into independent units and route each individually */
  const subQuestions = splitMultipleQuestions(cleanText);
  if (subQuestions.length > 1) {
    const multiResult = await tryQuranFoundationDirect(cleanText);
    if (multiResult) return multiResult;
  }

  /* 2) Explicit hadith questions use the connected HadeethEnc dataset first. */
  const hadithRouted = routeHadithQuestion(cleanText);

  if (hadithRouted.intent === 'HADITH_SOURCE_BOUND_QA') {
    const analyzedHadith = await answerSourceBoundHadithQuestion(
      cleanText,
      hadithRouted
    );

    if (analyzedHadith) return analyzedHadith;

    return buildHadithKnowledgeRun(cleanText, hadithRouted);
  }

  if (hadithRouted.intent !== 'UNKNOWN') {
    return buildHadithKnowledgeRun(cleanText, hadithRouted);
  }

  /* 2) Quran Foundation Production is the primary Quran source. */
  const qfDirect =
    await tryQuranFoundationDirect(cleanText);

  if (qfDirect) {
    return qfDirect;
  }

  /*
    3) Temporary compatibility fallback:
    legacy local Quran features remain available while the direct-source
    migration is being validated. They can be removed after the Quran
    regression tests pass.
  */
  const routed = routeQuranQuestion(cleanText);

  if (routed.intent === 'SOURCE_BOUND_QA') {
    const sourceBoundAnswer = await answerSourceBoundQuranQuestion(
      cleanText,
      routed
    );

    if (sourceBoundAnswer) return sourceBoundAnswer;

    return buildKnowledgeRun(cleanText, routed);
  }

  if (
    routed.intent !== 'UNKNOWN' &&
    routed.intent !== 'VERSE_LOOKUP'
  ) {
    const semanticCheck = await verifyExplanationAgainstTafsir(cleanText, routed);
    if (semanticCheck) return semanticCheck;
    return buildKnowledgeRun(cleanText, routed);
  }

  /* 4) Legacy general Quran fallback. */
  if (routed.intent === 'UNKNOWN') {
    const generalQuranAnswer =
      await answerGeneralQuranQuestion(cleanText);

    if (generalQuranAnswer) {
      return generalQuranAnswer;
    }
  }

  /* 5) Legacy quote verification fallback. */
  const localResult = auditQuranContentLocally(cleanText);

  if (
    routed.intent === 'VERSE_LOOKUP' ||
    !ai ||
    isSimpleQuranQuoteInput(cleanText)
  ) {
    return localResult;
  }

  /* 6) Long-text claim decomposition fallback. */
  const startTime = Date.now();

  try {
    const response = await generateWithModelFallback(
      MIHAK_REASONING_MODELS,
      (model) => ai!.models.generateContent({
        model,
        contents: `
فكك النص التالي إلى ادعاءات ذرية مستقلة قابلة للتحقق.

النص:
"""${cleanText}"""

المطلوب فقط:
1. استخراج الادعاءات المستقلة الموجودة فعلاً في النص.
2. الاحتفاظ بالجملة الأصلية التي خرج منها كل ادعاء.
3. لا تصحح اقتباساً قرآنياً من ذاكرتك.
4. لا تتحقق من صحة الادعاء.
5. لا تعط مصدراً أو رقم سورة أو آية من ذاكرتك.
6. لا تصدر حكماً شرعياً.
        `.trim(),
        config: {
          systemInstruction:
            'You are MIHAK claim decomposition only. Never use model memory as religious evidence.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              claims: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    claimText: { type: Type.STRING },
                    sourceSpan: { type: Type.STRING }
                  },
                  required: ['claimText', 'sourceSpan']
                }
              }
            },
            required: ['claims']
          }
        }
      }),
      22000,
      'Gemini claim decomposition'
    );

    let parsed: any = {};
    try {
      parsed = JSON.parse(response.text || '{}');
    } catch {
      return localResult;
    }

    const rawClaims = Array.isArray(parsed.claims) ? parsed.claims.slice(0, 20) : [];
    if (!rawClaims.length) return localResult;

    const processedClaims: Claim[] = [];

    for (let i = 0; i < rawClaims.length; i++) {
      const raw = rawClaims[i] || {};
      const claimText = String(raw.claimText || '').trim();
      const sourceSpan = String(raw.sourceSpan || claimText).trim();
      if (!claimText && !sourceSpan) continue;

      const verifiedClaim = buildQuranClaim(
        claimText || sourceSpan,
        sourceSpan || claimText,
        `CLM-${String(i + 1).padStart(3, '0')}`,
        cleanText
      );

      processedClaims.push(verifiedClaim);
    }

    if (!processedClaims.length) return localResult;
    return buildAuditRunFromClaims(cleanText, processedClaims, startTime);
  } catch (err) {
    console.warn('[MIHAK] Gemini decomposition failed; using local Quran corpus.', err);
    return localResult;
  }
}

export async function compareTransformationWithGemini(
  sourceText: string,
  derivedText: string,
  derivedType: string
): Promise<ComparisonRun> {
  const deterministicResult = EvidenceEngine.compareTransformation(
    sourceText,
    derivedText,
    derivedType
  );

  if (deterministicResult.deltas.length > 0 || !ai) {
    return deterministicResult;
  }

  const startTime = Date.now();

  try {
    const response = await generateWithModelFallback(
      MIHAK_REASONING_MODELS,
      (model) => ai!.models.generateContent({
        model,
        contents: `
قارن بين النص المصدر والنص المشتق التاليين فقط.

النص المصدر:
"""${sourceText}"""

النص المشتق:
"""${derivedText}"""

نوع التحويل:
${derivedType}

استخدم فقط الفئات التالية:
ADDITION
OMISSION
NEGATION_SHIFT
MODALITY_SHIFT
SCOPE_SHIFT
ATTRIBUTION_SHIFT
TERM_DRIFT
UNRESOLVED

لا تستخدم معرفة خارج النصين، ولا تصدر حكماً دينياً.
        `.trim(),
        config: {
          systemInstruction:
            'You are MIHAK Source-Bound Semantic Diff. Compare only supplied texts.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              integrityScore: { type: Type.INTEGER },
              deltas: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    categoryLabelAr: { type: Type.STRING },
                    sourceSpan: { type: Type.STRING },
                    derivedSpan: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                    impactLevel: { type: Type.STRING }
                  },
                  required: ['category', 'sourceSpan', 'derivedSpan', 'explanation']
                }
              }
            },
            required: ['summary', 'integrityScore', 'deltas']
          }
        }
      }),
      22000,
      'Gemini semantic comparison'
    );

    const parsed = JSON.parse(response.text || '{}');
    const rawDeltas = Array.isArray(parsed.deltas) ? parsed.deltas : [];
    const allowedCategories = new Set([
      'ADDITION',
      'OMISSION',
      'NEGATION_SHIFT',
      'MODALITY_SHIFT',
      'SCOPE_SHIFT',
      'ATTRIBUTION_SHIFT',
      'TERM_DRIFT',
      'UNRESOLVED'
    ]);

    const deltas: TransformationDelta[] = rawDeltas.map((delta: any, index: number) => {
      const rawCategory = String(delta.category || 'UNRESOLVED').toUpperCase();
      const category = allowedCategories.has(rawCategory) ? rawCategory : 'UNRESOLVED';

      let impactLevel: 'CRITICAL' | 'MODERATE' | 'LOW' = 'MODERATE';
      if (delta.impactLevel === 'CRITICAL') impactLevel = 'CRITICAL';
      if (delta.impactLevel === 'LOW') impactLevel = 'LOW';

      return {
        id: `DELTA-${String(index + 1).padStart(3, '0')}`,
        category: category as TransformationDelta['category'],
        category_label_ar: String(
          delta.categoryLabelAr || getArabicDeltaLabel(category)
        ),
        source_span: String(delta.sourceSpan || ''),
        derived_span: String(delta.derivedSpan || ''),
        explanation: String(delta.explanation || ''),
        impact_level: impactLevel
      };
    });

    let integrityScore = Number(parsed.integrityScore);
    if (!Number.isFinite(integrityScore)) integrityScore = 70;
    integrityScore = Math.max(0, Math.min(100, Math.round(integrityScore)));

    return {
      id: `comp-${Date.now()}`,
      timestamp: new Date().toISOString(),
      source_text: sourceText,
      derived_text: derivedText,
      derived_type: derivedType,
      deltas,
      alignment_summary: String(
        parsed.summary || 'تم تحليل الفرق الدلالي بين النص المصدر والنص المشتق.'
      ),
      integrity_score: integrityScore,
      duration_ms: Date.now() - startTime
    };
  } catch (err) {
    console.warn('[MIHAK] Gemini comparison failed; deterministic fallback used.', err);
    return deterministicResult;
  }
}

function getArabicDeltaLabel(category: string): string {
  switch (category) {
    case 'ADDITION': return 'إضافة معنى';
    case 'OMISSION': return 'حذف معنى';
    case 'NEGATION_SHIFT': return 'تغيّر في النفي';
    case 'MODALITY_SHIFT': return 'تغيّر في درجة اليقين';
    case 'SCOPE_SHIFT': return 'تغيّر في النطاق';
    case 'ATTRIBUTION_SHIFT': return 'تغيّر جهة النسبة';
    case 'TERM_DRIFT': return 'انزياح المصطلح';
    default: return 'غير محسوم';
  }
}
