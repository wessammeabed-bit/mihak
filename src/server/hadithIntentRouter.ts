import {
  findBestHadith,
  getHadithDatasetStatus,
  HadithRecord,
  HadithSearchResult,
  normalizeHadithArabic,
  searchHadiths
} from './hadithEngine';

export type HadithIntent =
  | 'HADITH_LOOKUP'
  | 'HADITH_DETAILS'
  | 'HADITH_EXPLANATION'
  | 'HADITH_WORD_MEANING'
  | 'HADITH_VERIFY'
  | 'HADITH_SEARCH'
  | 'HADITH_SOURCE_BOUND_QA'
  | 'HADITH_STATUS'
  | 'UNKNOWN';

export type HadithRouterResult = {
  intent: HadithIntent;
  understoodAs: string;
  source?: string | string[];
  data?: any;
  message?: string;
  needsSemanticVerification?: boolean;
};

function q(text: string): string {
  return normalizeHadithArabic(text);
}

function looksHadithRelated(query: string): boolean {
  const text = q(query);

  return (
    text.includes('حديث') ||
    text.includes('قال رسول الله') ||
    text.includes('قال النبي') ||
    text.includes('رواه') ||
    text.includes('تخريج') ||
    text.includes('درجه الحديث') ||
    text.includes('صحه الحديث')
  );
}

function looksSourceBound(query: string): boolean {
  const text = q(query);

  return (
    text.includes('هل معنى الحديث') ||
    text.includes('هل معني الحديث') ||
    text.includes('هل يعني الحديث') ||
    text.includes('هل يدل الحديث') ||
    text.includes('دليل صريح') ||
    text.includes('دقق الادعاء') ||
    text.includes('دقّق الادعاء') ||
    text.includes('ما الذي تغير') ||
    text.includes('ما الذي تغيّر') ||
    text.includes('مطابقه للحديث') ||
    text.includes('مطابقة للحديث') ||
    text.includes('هل المقصود') ||
    text.includes('اعتمد فقط') ||
    text.includes('استند فقط')
  );
}

function detectIntent(query: string): HadithIntent {
  const text = q(query);

  if (
    text.includes('عدد الاحاديث') ||
    text.includes('حاله بيانات الحديث')
  ) {
    return 'HADITH_STATUS';
  }

  if (!looksHadithRelated(query)) return 'UNKNOWN';

  if (looksSourceBound(query)) {
    return 'HADITH_SOURCE_BOUND_QA';
  }

  if (
    text.includes('هل هذا حديث') ||
    text.includes('هل ده حديث') ||
    text.includes('هل دي حديث') ||
    text.includes('هل الحديث موجود') ||
    text.includes('هل ورد الحديث') ||
    text.includes('هل صح نسبته')
  ) {
    return 'HADITH_VERIFY';
  }

  if (
    text.includes('شرح الحديث') ||
    text.includes('اشرح حديث') ||
    text.includes('اشرح الحديث') ||
    text.includes('تفسير الحديث') ||
    text.includes('ما المقصود بالحديث')
  ) {
    return 'HADITH_EXPLANATION';
  }

  if (
    text.includes('معنى كلمه') ||
    text.includes('معنى كلمة') ||
    text.includes('معني كلمه') ||
    text.includes('معني كلمة') ||
    text.includes('معنى لفظ') ||
    text.includes('معني لفظ')
  ) {
    return 'HADITH_WORD_MEANING';
  }

  if (
    text.includes('درجه') ||
    text.includes('درجة') ||
    text.includes('صحه') ||
    text.includes('صحة') ||
    text.includes('تخريج') ||
    text.includes('رواه') ||
    text.includes('متفق عليه') ||
    text.includes('مصدر الحديث')
  ) {
    return 'HADITH_DETAILS';
  }

  if (
    text.includes('هات حديث') ||
    text.includes('اعطني حديث') ||
    text.includes('ابحث عن حديث') ||
    text.includes('حديث عن')
  ) {
    return 'HADITH_SEARCH';
  }

  return 'HADITH_LOOKUP';
}

function payload(result: HadithSearchResult) {
  return {
    matchScore: result.score,
    exactPhrase: result.exactPhrase,
    focus: result.focus,
    matchedFields: result.matchedFields,
    record: result.record
  };
}

function source(record?: HadithRecord | null): string {
  return record?.link || 'HadeethEnc Arabic Dataset';
}

function noMatch(intent: HadithIntent): HadithRouterResult {
  return {
    intent,
    understoodAs: 'بحث في مصدر الحديث المتصل',
    source: 'HadeethEnc Arabic Dataset',
    data: null,
    message:
      'لم أعثر على مطابقة كافية في مجموعة الأحاديث المتصلة. عدم العثور هنا لا يعني أن النص ليس حديثًا؛ بل يعني أن المصدر المتصل لم يعطِ مطابقة كافية.'
  };
}

export function routeHadithQuestion(
  userQuery: string
): HadithRouterResult {
  const intent = detectIntent(userQuery);

  if (intent === 'UNKNOWN') {
    return {
      intent,
      understoodAs: 'ليس سؤال حديث صريحًا'
    };
  }

  if (intent === 'HADITH_STATUS') {
    const status = getHadithDatasetStatus();
    return {
      intent,
      understoodAs: 'حالة مجموعة الأحاديث المتصلة',
      source: 'HadeethEnc Arabic Dataset',
      data: status,
      message:
        `مجموعة الحديث المتصلة تحتوي على ${status.records} سجلًا محمّلًا من ${status.provider}.`
    };
  }

  if (intent === 'HADITH_SEARCH') {
    const results = searchHadiths(userQuery, 5);
    if (!results.length) return noMatch(intent);

    return {
      intent,
      understoodAs: 'البحث عن أحاديث ذات صلة',
      source: 'HadeethEnc Arabic Dataset',
      data: {
        results: results.map(payload)
      },
      message:
        `تم العثور على ${results.length} نتيجة مرتبطة بالبحث في المصدر المتصل.`
    };
  }

  const best = findBestHadith(userQuery);

  if (!best || best.score < 0.56) {
    return noMatch(intent);
  }

  const record = best.record;

  if (intent === 'HADITH_SOURCE_BOUND_QA') {
    return {
      intent,
      understoodAs: 'تحليل سؤال أو ادعاء مقابل سجل الحديث المتصل',
      source: source(record),
      data: payload(best),
      needsSemanticVerification: true,
      message:
        'تم العثور على سجل الحديث المرجعي، ويجب تحليل السؤال في حدود نصه وشرحه فقط.'
    };
  }

  if (intent === 'HADITH_VERIFY') {
    return {
      intent,
      understoodAs: 'التحقق من وجود النص في المصدر المتصل',
      source: source(record),
      data: {
        ...payload(best),
        strongMatch: best.exactPhrase
      },
      message: best.exactPhrase
        ? 'عُثر على نص مطابق في مجموعة الأحاديث المتصلة.'
        : 'عُثر على حديث قريب، لكن النص ليس مطابقًا حرفيًا للسجل المتصل.'
    };
  }

  return {
    intent,
    understoodAs: 'استرجاع حديث من المصدر المتصل',
    source: source(record),
    data: payload(best),
    message: record.hadith_text || record.title || 'تم العثور على سجل حديث ذي صلة.'
  };
}
