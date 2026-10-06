/**
 * MIHAK — مِحَكّ
 * Central Metric Semantics & Score Provenance Registry
 *
 * NON-NEGOTIABLE PRINCIPLES:
 * 1. NO "Religious Truth Percentage" / NO "نسبة صحة المحتوى" / NO "احتمال صحة الادعاء".
 *    MIHAK evaluates RELATIONSHIP TO CONNECTED EVIDENCE, not metaphysical probability.
 * 2. NO Arbitrary Confidence Constants (0.98, 0.95, 0.85, 0.5, etc.).
 * 3. Every numeric metric must have machine-readable provenance:
 *    { metricType, value, basis, computedBy, deterministic, userVisible, displayLabelAr, displayValue }.
 * 4. Separate metrics cleanly:
 *    - EXACT_MATCH: deterministic direct lookup in trusted corpus (label: "مطابقة مباشرة بالمصدر").
 *    - RETRIEVAL_SIMILARITY: vector/lexical retrieval score (label: "درجة مطابقة الادعاء للدليل").
 *    - EVIDENCE_COVERAGE: verifiedEssentialComponents / totalEssentialComponents (label: "اكتمال التحقق من عناصر الادعاء").
 *    - TRANSCRIPTION_CONFIDENCE: speech-to-text recognition quality only (label: "ثقة التفريغ الصوتي").
 *    - TRANSLATION_CONFIDENCE: non-Arabic query translation fidelity (internal/search aid only).
 *    - CLASSIFICATION_CONFIDENCE: intent/category confidence (internal only, never shown as truth).
 */

export type MetricType =
  | 'EXACT_MATCH'
  | 'RETRIEVAL_SIMILARITY'
  | 'EVIDENCE_COVERAGE'
  | 'TRANSCRIPTION_CONFIDENCE'
  | 'TRANSLATION_CONFIDENCE'
  | 'CLASSIFICATION_CONFIDENCE';

export interface MetricRecord {
  metricType: MetricType;
  value: number; // 0.0 to 1.0 (or 1 for boolean exact match)
  basis: string;
  computedBy: string;
  deterministic: boolean;
  userVisible: boolean;
  displayLabelAr: string;
  displayValue: string;
}

export interface ClaimMetrics {
  exactMatch?: boolean;
  retrievalSimilarity?: number;
  evidenceCoverage?: number;
  transcriptionConfidence?: number;
  translationConfidence?: number;
  classificationConfidence?: number;
  records: MetricRecord[];
}

export const METRIC_DEFINITIONS: Record<
  MetricType,
  {
    meaning: string;
    validRange: [number, number];
    isDeterministic: boolean;
    defaultUserVisible: boolean;
    displayLabelAr: string;
  }
> = {
  EXACT_MATCH: {
    meaning: 'مطابقة نصية أو مرجعية تامة ومباشرة مع نص محفوظ في المصدر المتصل',
    validRange: [0.0, 1.0],
    isDeterministic: true,
    defaultUserVisible: true,
    displayLabelAr: 'مطابقة مباشرة بالمصدر'
  },
  RETRIEVAL_SIMILARITY: {
    meaning: 'درجة التشابه الدلالي أو اللفظي بين نص الاستعلام والفقرة المسترجعة من المصدر',
    validRange: [0.0, 1.0],
    isDeterministic: false,
    defaultUserVisible: true,
    displayLabelAr: 'درجة مطابقة الادعاء للدليل'
  },
  EVIDENCE_COVERAGE: {
    meaning: 'نسبة العناصر الجوهرية للادعاء المركب التي خضعت للمطابقة مع أدلة مسندة',
    validRange: [0.0, 1.0],
    isDeterministic: true,
    defaultUserVisible: true,
    displayLabelAr: 'اكتمال التحقق من عناصر الادعاء'
  },
  TRANSCRIPTION_CONFIDENCE: {
    meaning: 'ثقة نموذج تحويل الصوت/الفيديو إلى نص فقط، ولا علاقة لها بثقة الأدلة الشرعية',
    validRange: [0.0, 1.0],
    isDeterministic: false,
    defaultUserVisible: true,
    displayLabelAr: 'ثقة التفريغ الصوتي'
  },
  TRANSLATION_CONFIDENCE: {
    meaning: 'ثقة نقل نص بلغة غير عربية إلى العربية لغرض الاسترجاع المعجمي في المكانز',
    validRange: [0.0, 1.0],
    isDeterministic: false,
    defaultUserVisible: false,
    displayLabelAr: 'ثقة الترجمة للاسترجاع'
  },
  CLASSIFICATION_CONFIDENCE: {
    meaning: 'ثقة مصنف المقاصد والأنماط، وهي قيمة داخلية لا تعبر عن صحة أي مضمون ديني',
    validRange: [0.0, 1.0],
    isDeterministic: false,
    defaultUserVisible: false,
    displayLabelAr: 'ثقة التصنيف الداخلي'
  }
};

/**
 * Creates an immutable MetricRecord with verified provenance.
 */
export function createMetricRecord(
  metricType: MetricType,
  value: number,
  basis: string,
  computedBy: string,
  options: {
    deterministic?: boolean;
    userVisible?: boolean;
    customDisplayValue?: string;
  } = {}
): MetricRecord {
  const def = METRIC_DEFINITIONS[metricType];
  const clampedValue = Math.max(def.validRange[0], Math.min(def.validRange[1], value));
  const deterministic = options.deterministic ?? def.isDeterministic;
  const userVisible = options.userVisible ?? def.defaultUserVisible;

  let displayValue = options.customDisplayValue;
  if (!displayValue) {
    if (metricType === 'EXACT_MATCH') {
      displayValue = clampedValue >= 1 ? 'مطابقة مباشرة بالمصدر' : 'مطابقة جزئية بالمصدر';
    } else {
      const pct = Math.round(clampedValue * 100);
      displayValue = `${def.displayLabelAr}: ${pct}%`;
    }
  }

  return {
    metricType,
    value: clampedValue,
    basis,
    computedBy,
    deterministic,
    userVisible,
    displayLabelAr: def.displayLabelAr,
    displayValue
  };
}

/**
 * Exact Match Builder: guarantees honest labeling.
 * 100% only means 100% direct match to connected source, NEVER religious truth probability.
 */
export function createExactMatchRecord(
  basis: string,
  computedBy: string
): MetricRecord {
  return createMetricRecord(
    'EXACT_MATCH',
    1.0,
    basis,
    computedBy,
    {
      deterministic: true,
      userVisible: true,
      customDisplayValue: 'مطابقة مباشرة بالمصدر'
    }
  );
}

/**
 * Evidence Coverage Builder: verifiedEssential / totalEssential.
 */
export function createEvidenceCoverageRecord(
  verifiedComponents: number,
  totalComponents: number,
  computedBy: string
): MetricRecord {
  if (totalComponents <= 0) {
    return createMetricRecord('EVIDENCE_COVERAGE', 0, 'لا توجد عناصر ادعاء محددة', computedBy, {
      deterministic: true,
      userVisible: false
    });
  }
  const ratio = Math.max(0, Math.min(1, verifiedComponents / totalComponents));
  const pct = Math.round(ratio * 100);
  return createMetricRecord(
    'EVIDENCE_COVERAGE',
    ratio,
    `تم التحقق من ${verifiedComponents} من أصل ${totalComponents} عنصرًا جوهريًا (${pct}%)`,
    computedBy,
    {
      deterministic: true,
      userVisible: true,
      customDisplayValue: `اكتمال التحقق: ${pct}% (${verifiedComponents}/${totalComponents})`
    }
  );
}

/**
 * Retrieval Similarity Builder.
 */
export function createRetrievalSimilarityRecord(
  score: number,
  basis: string,
  computedBy: string
): MetricRecord {
  const clamped = Math.max(0, Math.min(1, score));
  const pct = Math.round(clamped * 100);
  return createMetricRecord(
    'RETRIEVAL_SIMILARITY',
    clamped,
    basis,
    computedBy,
    {
      deterministic: false,
      userVisible: true,
      customDisplayValue: `درجة مطابقة الادعاء للدليل   : ${pct}%`
    }
  );
}

/**
 * Transcription Confidence Builder.
 */
export function createTranscriptionConfidenceRecord(
  score: number,
  basis: string,
  computedBy: string
): MetricRecord {
  const clamped = Math.max(0, Math.min(1, score));
  const pct = Math.round(clamped * 100);
  return createMetricRecord(
    'TRANSCRIPTION_CONFIDENCE',
    clamped,
    basis,
    computedBy,
    {
      deterministic: false,
      userVisible: true,
      customDisplayValue: `ثقة التفريغ الصوتي: ${pct}%`
    }
  );
}

/**
 * Bundles metric records into ClaimMetrics.
 */
export function bundleClaimMetrics(records: MetricRecord[]): ClaimMetrics {
  const exact = records.find((r) => r.metricType === 'EXACT_MATCH');
  const sim = records.find((r) => r.metricType === 'RETRIEVAL_SIMILARITY');
  const cov = records.find((r) => r.metricType === 'EVIDENCE_COVERAGE');
  const trans = records.find((r) => r.metricType === 'TRANSCRIPTION_CONFIDENCE');
  const transl = records.find((r) => r.metricType === 'TRANSLATION_CONFIDENCE');
  const cls = records.find((r) => r.metricType === 'CLASSIFICATION_CONFIDENCE');

  return {
    exactMatch: exact ? exact.value >= 1 : undefined,
    retrievalSimilarity: sim?.value,
    evidenceCoverage: cov?.value,
    transcriptionConfidence: trans?.value,
    translationConfidence: transl?.value,
    classificationConfidence: cls?.value,
    records
  };
}
