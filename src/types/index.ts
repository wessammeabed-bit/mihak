/**
 * MIHAK — مِحَكّ
 * Core TypeScript Data Definitions
 */

import type { MetricType, ScoreMetric } from '../utils/metricRegistry';
export type { MetricType, ScoreMetric };

export type ClaimStatus =
  | 'VERIFIED_QUOTE'
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'NEEDS_SPECIALIST_REVIEW'
  | 'TRANSFORMATION_DRIFT'
  | 'SOURCE_COVERAGE_GAP';

export type FailureType =
  | 'UNDERSTANDING_FAILURE'
  | 'RETRIEVAL_FAILURE'
  | 'PROVIDER_TEMPORARILY_UNAVAILABLE'
  | 'SOURCE_COVERAGE_GAP'
  | 'INSUFFICIENT_EVIDENCE';

export type EvidenceRelationType =
  | 'DIRECT_SUPPORT'
  | 'PARTIAL_SUPPORT'
  | 'ATTRIBUTION_MISMATCH'
  | 'SCOPE_MISMATCH'
  | 'DIFFERENT_CONTEXT'
  | 'GENERAL_SPECIFIC'
  | 'CONDITION_EXCEPTION'
  | 'TERMINOLOGY_SHIFT'
  | 'TEMPORAL_DIFFERENCE'
  | 'SUBJECT_DIFFERENCE'
  | 'UNRESOLVED_RELATION'
  | 'INSUFFICIENT_CONTEXT'
  | 'UNVERIFIED';

export type EvidenceDomain =
  | 'QURAN'
  | 'TAFSIR'
  | 'HADITH'
  | 'QURAN_LEXICAL'
  | 'ARABIC_LANGUAGE'
  | 'SIRAH'
  | 'FIQH'
  | 'AQIDAH'
  | 'HISTORICAL_CONTEXT'
  | 'ASBAB_AL_NUZUL'
  | 'QIRAAT'
  | 'OTHER';

export type PropositionType =
  | 'QUOTATION'
  | 'ATTRIBUTION'
  | 'LEXICAL_CLAIM'
  | 'NUMERICAL_CLAIM'
  | 'INTERPRETATION'
  | 'COMPARISON'
  | 'CONTRADICTION'
  | 'PREMISE'
  | 'CONCLUSION'
  | 'GENERAL_CLAIM';

export interface ParsedReference {
  sourceType: 'quran' | 'hadith' | 'other';
  rawText: string;
  canonicalReference: string;
  surahNumber?: number;
  surahName?: string;
  ayahStart?: number;
  ayahEnd?: number;
  hadithBook?: string;
  hadithNumber?: number;
  isRange?: boolean;
}

export interface Proposition {
  id: string;
  originalSpan: {
    text: string;
    start: number;
    end: number;
  };
  normalizedMeaning: string;
  propositionType: PropositionType;
  role: 'PREMISE' | 'CONCLUSION' | 'INDEPENDENT_CLAIM';
  explicitReferences: ParsedReference[];
  dependsOn?: string[];
  requiredEvidenceDomains: EvidenceDomain[];
  isEssential: boolean;
}

export interface RequestPlan {
  originalInput: string;
  language: 'ar' | 'en' | 'mixed';
  inputType: InputType;
  taskType: string;
  propositions: Proposition[];
  explicitReferences: ParsedReference[];
  requiredDomains: EvidenceDomain[];
  availableDomains: EvidenceDomain[];
  missingDomains: EvidenceDomain[];
  hasCoverageGap: boolean;
  requestedOperation?: string;
}

export interface EvidenceRecord {
  source_id: string;
  source_name: string;
  canonical_reference: string;
  language: string;
  raw_text: string;
  version: string;
  license_note: string;
  surah_number?: number;
  ayah_number?: number;
  category?: 'quran' | 'hadith' | 'tafsir' | 'hadith_canonical' | 'scholarly_consensus' | 'reference_corpus';
  confidence_score?: number;
}

export interface Claim {
  id: string;
  claim_text: string;
  source_span: {
    text: string;
    start: number;
    end: number;
  };
  status: ClaimStatus;

  // Specific decoupled metrics (never religious truth percentages):
  exactMatch?: boolean; // 100% exact text match against connected source
  retrievalSimilarity?: number; // Mathematical retrieval similarity (0.0 to 1.0)
  evidenceCoverage?: number; // verifiedEssential / totalEssential for compound claims (0.0 to 1.0)
  transcriptionConfidence?: number; // Audio recognition acoustic quality only (0.0 to 1.0)
  translationConfidence?: number; // Non-Arabic cross-lingual retrieval fidelity only (0.0 to 1.0)
  classificationConfidence?: number; // INTERNAL ONLY - never shown in user UI
  metricProvenance?: ScoreMetric[];

  // Legacy field preserved for backwards-compatibility; never used to compute truth:
  confidence_score?: number;

  // Proposition & argument structure
  propositionType?: PropositionType;
  role?: 'PREMISE' | 'CONCLUSION' | 'INDEPENDENT_CLAIM';
  dependsOn?: string[];
  requiredDomains?: EvidenceDomain[];
  missingDomains?: EvidenceDomain[];

  evidence_relation?: EvidenceRelationType;
  evidence?: EvidenceRecord;
  evidence_passage?: string;
  verification_rationale: string;
  specialist_review_reason?: string;
  failureType?: FailureType;
  linguistic_notes?: string;
  original_claim?: string;
  retrieval_query_ar?: string;
  source_url?: string;
  source_title?: string;
  content_role?: 'UNTRUSTED_INPUT';
}

export type Domain =
  | 'QURAN'
  | 'HADITH'
  | 'SIRAH'
  | 'CONTENT_AUDIT'
  | 'COMPARISON'
  | 'UNKNOWN';

export interface AuditRun {
  id: string;
  timestamp: string;
  input_text: string;
  detected_language: 'ar' | 'en' | 'mixed';
  input_understanding?: InputUnderstanding;
  request_plan?: RequestPlan;
  claims: Claim[];
  stats: {
    total: number;
    supported: number;
    partiallySupported: number;
    insufficientEvidence: number;
    needsSpecialistReview: number;
    verifiedQuotes: number;
    sourceCoverageGap?: number;
  };
  abstention_count: number;
  duration_ms: number;
  failureType?: FailureType;
  provider_trace?: {
    providerUsed: string;
    fallbackUsed: boolean;
    reasoning?: string;
  };
}

export type InputType =
  | 'SINGLE_CHARACTER'
  | 'SINGLE_WORD'
  | 'SHORT_PHRASE'
  | 'QURAN_FRAGMENT'
  | 'QURAN_VERSE'
  | 'MULTI_VERSE'
  | 'HADITH_FRAGMENT'
  | 'HADITH_TEXT'
  | 'RELIGIOUS_TERM'
  | 'DIRECT_QUESTION'
  | 'CLAIM'
  | 'PARAGRAPH'
  | 'CONTENT_FOR_AUDIT'
  | 'SOURCE_COMPARISON'
  | 'MIXED_CONTENT'
  | 'UNKNOWN';

export interface CandidateReference {
  sourceId: string;
  sourceName: string;
  reference: string;
  label: string;
  confidence: number;
  sampleText?: string;
}

export interface InputUnderstanding {
  inputType: InputType;
  domainCandidates: Array<{ domain: 'QURAN' | 'HADITH' | 'SIRAH' | 'CONTENT_AUDIT' | 'COMPARISON' | 'UNKNOWN'; confidence: number }>;
  isQuestion: boolean;
  isClaim: boolean;
  isQuotation: boolean;
  isFragment: boolean;
  isCompleteText: boolean;
  isLikelyQuran: boolean;
  isLikelyHadith: boolean;
  isLikelyTafsir: boolean;
  isLikelySirah: boolean;
  detectedEntities: string[];
  candidateReferences: CandidateReference[];
  confidence: number;
  needsClarification: boolean;
  clarificationMessage?: string;
  normalizedQuery: string;
  originalQuery: string;
}

export type SemanticDeltaCategory =
  | 'ADDITION'
  | 'OMISSION'
  | 'NEGATION_SHIFT'
  | 'MODALITY_SHIFT'
  | 'SCOPE_SHIFT'
  | 'ATTRIBUTION_SHIFT'
  | 'TERM_DRIFT'
  | 'UNRESOLVED';

export interface TransformationDelta {
  id: string;
  category: SemanticDeltaCategory;
  category_label_ar: string;
  source_span: string;
  derived_span: string;
  explanation: string;
  impact_level: 'CRITICAL' | 'MODERATE' | 'LOW';
}

export interface ComparisonRun {
  id: string;
  timestamp: string;
  source_text: string;
  derived_text: string;
  derived_type: string;
  deltas: TransformationDelta[];
  alignment_summary: string;
  integrity_score: number;
  duration_ms: number;
}
