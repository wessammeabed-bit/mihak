/**
 * MIHAK — مِحَكّ
 * Central Metric Semantics and Provenance Registry
 *
 * NON-NEGOTIABLE ARCHITECTURAL PRINCIPLES:
 * 1. MIHAK NEVER calculates religious truth probability.
 * 2. No arbitrary confidence constants (0.95, 0.98, 0.85, 0.5) mapped from status.
 * 3. Every displayed numeric metric must have an explicit formula, basis, and machine-readable provenance.
 * 4. Separate all confidence concepts: Exact Match, Retrieval Similarity, Evidence Coverage,
 *    Transcription Confidence, Translation Confidence, Classification Confidence.
 * 5. Primary result is always a categorical evidence state, not a score.
 */

export type MetricType =
  | 'EXACT_MATCH'
  | 'RETRIEVAL_SIMILARITY'
  | 'EVIDENCE_COVERAGE'
  | 'TRANSCRIPTION_CONFIDENCE'
  | 'TRANSLATION_CONFIDENCE'
  | 'CLASSIFICATION_CONFIDENCE';

export interface ScoreMetric {
  metricType: MetricType;
  value: number; // 0.0 to 1.0
  basis: string; // Machine and human readable explanation of the exact basis
  computedBy: string; // Engine, module, or algorithm
  deterministic: boolean;
  userVisible: boolean;
  labelAr: string; // Arabic label suitable for display without claiming "religious truth"
}

export interface MetricDefinition {
  type: MetricType;
  descriptionEn: string;
  descriptionAr: string;
  userVisible: boolean;
  labelAr: string;
  isDeterministic: boolean;
  forbiddenLabels: string[];
}

export const METRIC_REGISTRY: Record<MetricType, MetricDefinition> = {
  EXACT_MATCH: {
    type: 'EXACT_MATCH',
    descriptionEn: 'Deterministic 100% character/word match against canonical source corpus.',
    descriptionAr: 'مطابقة تامة ومباشرة في المتن المعتمد (نص الآية، رقم الآية، جذر الكلمة، نص الحديث).',
    userVisible: true,
    labelAr: 'مطابقة مباشرة بالمصدر',
    isDeterministic: true,
    forbiddenLabels: ['يقين', 'نسبة صحة', 'احتمال صحة', 'صحة المحتوى', 'يقين ديني']
  },
  RETRIEVAL_SIMILARITY: {
    type: 'RETRIEVAL_SIMILARITY',
    descriptionEn: 'Mathematical lexical or vector similarity between query and retrieved passage.',
    descriptionAr: 'درجة التشابه المعجمي أو المتجهي بين الاستعلام والمقطع المسترجع من المصدر.',
    userVisible: true,
    labelAr: 'درجة مطابقة الادعاء للدليل',
    isDeterministic: false,
    forbiddenLabels: ['يقين', 'نسبة صحة', 'صحة', 'احتمال صحة']
  },
  EVIDENCE_COVERAGE: {
    type: 'EVIDENCE_COVERAGE',
    descriptionEn: 'Ratio of essential compound claim components verified against connected evidence.',
    descriptionAr: 'نسبة العناصر الأساسية في الادعاء المركب التي خضعت للتحقق في المصادر المتصلة.',
    userVisible: true,
    labelAr: 'اكتمال التحقق من عناصر الادعاء',
    isDeterministic: true,
    forbiddenLabels: ['يقين', 'صحة الادعاء', 'نسبة صحة المحتوى']
  },
  TRANSCRIPTION_CONFIDENCE: {
    type: 'TRANSCRIPTION_CONFIDENCE',
    descriptionEn: 'Speech recognition acoustic confidence for audio/video input.',
    descriptionAr: 'دقة التعرف الصوتي الآلي على الكلمات المنطوقة في التسجيل الصوتي أو المرئي.',
    userVisible: true,
    labelAr: 'ثقة التفريغ الصوتي',
    isDeterministic: false,
    forbiddenLabels: ['يقين شرعي', 'صحة الحديث', 'صحة الآية']
  },
  TRANSLATION_CONFIDENCE: {
    type: 'TRANSLATION_CONFIDENCE',
    descriptionEn: 'Confidence that English/foreign query was preserved in Arabic retrieval query.',
    descriptionAr: 'ثقة الحفاظ على المعنى الأصلي عند صياغة استعلام الاسترجاع العربي.',
    userVisible: false, // Internal retrieval aid
    labelAr: 'ثقة ترجمة الاستعلام',
    isDeterministic: false,
    forbiddenLabels: ['يقين', 'صحة']
  },
  CLASSIFICATION_CONFIDENCE: {
    type: 'CLASSIFICATION_CONFIDENCE',
    descriptionEn: 'Classifier probability of the input intent/task type. Strictly internal.',
    descriptionAr: 'ثقة مصنف النوايا في تحديد نوع المهمة أو البنية المدخلة. داخلي فقط.',
    userVisible: false, // Strictly internal
    labelAr: 'ثقة تصنيف المقصد (داخلي)',
    isDeterministic: false,
    forbiddenLabels: ['يقين', 'صحة الادعاء']
  }
};

/**
 * Creates an exact match metric object.
 */
export function createExactMatchMetric(computedBy: string, basis: string): ScoreMetric {
  return {
    metricType: 'EXACT_MATCH',
    value: 1.0,
    basis,
    computedBy,
    deterministic: true,
    userVisible: true,
    labelAr: 'مطابقة مباشرة بالمصدر'
  };
}

/**
 * Creates a retrieval similarity metric object.
 */
export function createRetrievalSimilarityMetric(
  similarity: number,
  computedBy: string,
  basis: string
): ScoreMetric {
  const clamped = Math.max(0, Math.min(1, similarity));
  return {
    metricType: 'RETRIEVAL_SIMILARITY',
    value: clamped,
    basis,
    computedBy,
    deterministic: false,
    userVisible: true,
    labelAr: 'درجة مطابقة الادعاء للدليل'
  };
}

/**
 * Creates an evidence coverage metric for compound claims.
 * Formula: verifiedEssential / totalEssential
 */
export function createEvidenceCoverageMetric(
  verifiedEssential: number,
  totalEssential: number,
  computedBy: string,
  basis?: string
): ScoreMetric {
  const ratio = totalEssential > 0 ? Math.max(0, Math.min(1, verifiedEssential / totalEssential)) : 0;
  return {
    metricType: 'EVIDENCE_COVERAGE',
    value: ratio,
    basis: basis || `تم التحقق من ${verifiedEssential} من أصل ${totalEssential} عنصرًا جوهريًا في الادعاء المركب.`,
    computedBy,
    deterministic: true,
    userVisible: true,
    labelAr: 'اكتمال التحقق من عناصر الادعاء'
  };
}

/**
 * Creates a speech transcription confidence metric.
 */
export function createTranscriptionMetric(
  confidence: number,
  computedBy: string,
  basis: string
): ScoreMetric {
  const clamped = Math.max(0, Math.min(1, confidence));
  return {
    metricType: 'TRANSCRIPTION_CONFIDENCE',
    value: clamped,
    basis,
    computedBy,
    deterministic: false,
    userVisible: true,
    labelAr: 'ثقة التفريغ الصوتي'
  };
}

/**
 * Invariant validation: ensures no metric claims religious truth probability or violates semantics.
 */
export function validateMetricInvariants(metric: ScoreMetric): { valid: boolean; reason?: string } {
  if (metric.value < 0 || metric.value > 1) {
    return { valid: false, reason: `Metric value ${metric.value} is outside valid range [0, 1].` };
  }

  const def = METRIC_REGISTRY[metric.metricType];
  if (!def) {
    return { valid: false, reason: `Unknown metric type: ${metric.metricType}` };
  }

  for (const forbidden of def.forbiddenLabels) {
    if (metric.labelAr.includes(forbidden) || metric.basis.includes(forbidden)) {
      return {
        valid: false,
        reason: `Metric ${metric.metricType} contains forbidden concept "${forbidden}" claiming religious truth probability.`
      };
    }
  }

  if (metric.metricType === 'CLASSIFICATION_CONFIDENCE' && metric.userVisible) {
    return { valid: false, reason: 'CLASSIFICATION_CONFIDENCE must never be user-visible.' };
  }

  return { valid: true };
}
