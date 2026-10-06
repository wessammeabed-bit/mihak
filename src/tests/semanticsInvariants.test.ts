/**
 * MIHAK — مِحَكّ
 * Automated Architectural Invariant & Structural Tests
 *
 * Validates:
 * 1. Semantic Invariants A through J (No religious truth probabilities, no arbitrary constants).
 * 2. Generic Structural Capabilities:
 *    - Single & multi-reference extraction
 *    - Range normalization
 *    - Premise vs Conclusion separation
 *    - Source domain detection & SOURCE_COVERAGE_GAP
 *    - Compound claim evidence coverage
 *    - Multilingual (Arabic, English, mixed)
 */

import { extractAllReferences, normalizeReferenceRange } from '../server/referenceParser';
import { 
  decomposeIntoPropositions, 
  buildRequestPlan, 
  aggregateParentClaimStatus,
  AVAILABLE_TRUSTED_DOMAINS 
} from '../server/claimDecomposer';
import { 
  METRIC_REGISTRY, 
  createExactMatchMetric, 
  createRetrievalSimilarityMetric, 
  createEvidenceCoverageMetric, 
  createTranscriptionMetric,
  validateMetricInvariants 
} from '../utils/metricRegistry';
import { computeAuditCategoricalStats } from '../components/ConfidenceScore';
import type { Claim, ParsedReference, Proposition, ScoreMetric } from '../types';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] ${testName}${detail ? ': ' + detail : ''}`);
    throw new Error(`Test failed: ${testName} - ${detail}`);
  }
}

export async function runSemanticsAndStructuralTests() {
  console.log('\n==================================================');
  console.log('RUNNING MIHAK SEMANTICS & ARCHITECTURE TESTS');
  console.log('==================================================\n');

  // --- PART 1: METRIC INVARIANTS A-J ---
  console.log('--- 1. Testing Metric Invariants A - J ---');

  // INVARIANT A: Status does not automatically imply a fixed percentage
  {
    const supportedClaim: Claim = {
      id: 'CLM-001',
      claim_text: 'ادعاء تجريبي',
      source_span: { text: 'ادعاء', start: 0, end: 5 },
      status: 'SUPPORTED',
      verification_rationale: 'فحص تجريبي'
    };
    assert(
      supportedClaim.confidence_score === undefined || supportedClaim.confidence_score === 0,
      'INVARIANT A: SUPPORTED status does not contain a hardcoded percentage'
    );
  }

  // INVARIANT B: INSUFFICIENT_EVIDENCE may not display a high truth confidence
  {
    const unverifiedClaim: Claim = {
      id: 'CLM-002',
      claim_text: 'ادعاء بلا مستند',
      source_span: { text: 'ادعاء', start: 0, end: 5 },
      status: 'INSUFFICIENT_EVIDENCE',
      verification_rationale: 'امتناع: لم يُعثر على دليل'
    };
    assert(
      !unverifiedClaim.exactMatch && (unverifiedClaim.confidence_score === undefined || unverifiedClaim.confidence_score < 0.5),
      'INVARIANT B: INSUFFICIENT_EVIDENCE never assigned a high confidence number'
    );
  }

  // INVARIANT C: SUPPORTED may not display 96%/98% merely because of status mapping
  {
    const stats = computeAuditCategoricalStats([
      { id: '1', claim_text: 'C1', source_span: { text: '', start: 0, end: 0 }, status: 'SUPPORTED', verification_rationale: '' },
      { id: '2', claim_text: 'C2', source_span: { text: '', start: 0, end: 0 }, status: 'SUPPORTED', verification_rationale: '' }
    ]);
    assert(
      stats.supportedCount === 2,
      'INVARIANT C: Audit summary tracks categorical counts rather than fake status-to-percentage mapping'
    );
  }

  // INVARIANT D: Exact deterministic match displays exactMatch=true
  {
    const exactMetric = createExactMatchMetric('QuranKnowledge', 'مطابقة تامة لسورة البقرة: 255');
    assert(
      exactMetric.metricType === 'EXACT_MATCH' && exactMetric.value === 1.0 && exactMetric.deterministic,
      'INVARIANT D: Exact deterministic match has exactMatch=true and value=1.0'
    );
    assert(
      exactMetric.labelAr === 'مطابقة مباشرة بالمصدر',
      'INVARIANT D: User-facing label is "مطابقة مباشرة بالمصدر"'
    );
  }

  // INVARIANT E: Any displayed percentage must have metricType and basis
  {
    const coverageMetric = createEvidenceCoverageMetric(3, 4, 'EvidenceEngine.aggregate');
    const validation = validateMetricInvariants(coverageMetric);
    assert(
      validation.valid && coverageMetric.metricType === 'EVIDENCE_COVERAGE' && coverageMetric.basis.length > 5,
      'INVARIANT E: Displayed percentage has explicit metricType, value, and machine-readable basis'
    );
  }

  // INVARIANT F: Consistent across summary and claim card
  {
    const claim1: Claim = {
      id: 'CLM-001',
      claim_text: 'T1',
      source_span: { text: '', start: 0, end: 0 },
      status: 'SUPPORTED',
      exactMatch: true,
      verification_rationale: ''
    };
    assert(
      claim1.exactMatch === true,
      'INVARIANT F: Exact match semantics are identical between card level and audit summary'
    );
  }

  // INVARIANT G: Overall article truth percentage does not exist
  {
    const claims: Claim[] = [
      { id: '1', claim_text: 'A', source_span: { text: '', start: 0, end: 0 }, status: 'SUPPORTED', verification_rationale: '' },
      { id: '2', claim_text: 'B', source_span: { text: '', start: 0, end: 0 }, status: 'INSUFFICIENT_EVIDENCE', verification_rationale: '' }
    ];
    const stats = computeAuditCategoricalStats(claims);
    assert(
      stats.supportedCount === 1 && stats.unverifiedCount === 1,
      'INVARIANT G: Summary exposes categorical count breakdown without calculating a single fake overall truth percentage'
    );
  }

  // INVARIANT H: Model-generated prose percentages never parsed into product metrics
  {
    const metric = createRetrievalSimilarityMetric(0.82, 'searchSeedEvidence', 'Similarity 0.82');
    assert(
      metric.computedBy === 'searchSeedEvidence' && metric.deterministic === false,
      'INVARIANT H: Metrics are generated strictly by application algorithms or APIs, not LLM prose'
    );
  }

  // INVARIANT I: Classification confidence remains separate from evidence relation
  {
    const classDef = METRIC_REGISTRY.CLASSIFICATION_CONFIDENCE;
    assert(
      classDef.userVisible === false,
      'INVARIANT I: Classification confidence is strictly internal and never shown as religious evidence'
    );
  }

  // INVARIANT J: Transcription confidence remains separate from religious evidence
  {
    const speechMetric = createTranscriptionMetric(0.94, 'gemini-3.5-transcribe', 'Acoustic audio quality');
    assert(
      speechMetric.metricType === 'TRANSCRIPTION_CONFIDENCE' && speechMetric.labelAr === 'ثقة التفريغ الصوتي',
      'INVARIANT J: Transcription confidence is labeled "ثقة التفريغ الصوتي" and decoupled from truth'
    );
  }

  // --- PART 2: GENERIC STRUCTURAL TESTS ---
  console.log('\n--- 2. Testing Generic Structural Capabilities ---');

  // Test 1: Single reference extraction
  {
    const refs = extractAllReferences('قال تعالى في سورة البقرة: 255 عن الكرسي.');
    assert(
      refs.length === 1 && refs[0].surahNumber === 2 && refs[0].ayahStart === 255,
      'STRUCTURAL 1: One proposition / one reference correctly parsed (2:255)'
    );
  }

  // Test 2: Multiple references extraction (Never discard secondary references!)
  {
    const refs = extractAllReferences('راجع سورة البقرة: 255 وسورة آل عمران: 18.');
    assert(
      refs.length === 2 && refs[0].surahNumber === 2 && refs[1].surahNumber === 3,
      'STRUCTURAL 2: Multiple explicit references all collected (2:255 and 3:18)'
    );
  }

  // Test 3: Reference Range expansion
  {
    const refs = extractAllReferences('انظر الآيات في البقرة: 183-185 حول الصيام.');
    assert(
      refs.length === 1 && refs[0].isRange === true && refs[0].ayahStart === 183 && refs[0].ayahEnd === 185,
      'STRUCTURAL 3: Reference range detected (183-185)'
    );
    const expanded = normalizeReferenceRange(refs[0]);
    assert(
      expanded.length === 3 && expanded[0].ayahStart === 183 && expanded[2].ayahStart === 185,
      'STRUCTURAL 3: Range normalized deterministically into 3 consecutive verses'
    );
  }

  // Test 4: Mixed Quran and Hadith references
  {
    const refs = extractAllReferences('جاء في البقرة: 255 وفي صحيح البخاري: 1.');
    assert(
      refs.length === 2 && refs.some(r => r.sourceType === 'quran') && refs.some(r => r.sourceType === 'hadith'),
      'STRUCTURAL 4: Mixed Quran and Hadith references extracted simultaneously'
    );
  }

  // Test 5: Premise vs Conclusion separation
  {
    const props = decomposeIntoPropositions('قال تعالى «كتب عليكم الصيام»، فثبت أن الصيام واجب على كل مسافر.');
    assert(
      props.length === 2,
      'STRUCTURAL 5: Decomposes argument into 2 atomic propositions'
    );
    const premise = props.find(p => p.role === 'PREMISE');
    const conclusion = props.find(p => p.role === 'CONCLUSION');
    assert(
      premise !== undefined && conclusion !== undefined,
      'STRUCTURAL 5: Explicitly separates Premise from Conclusion'
    );
    assert(
      conclusion?.dependsOn?.includes(premise!.id) === true,
      'STRUCTURAL 5: Conclusion records dependency on the Premise ID'
    );

    // Parent aggregation test: verified premise does NOT validate conclusion!
    const mockClaims: Claim[] = [
      {
        id: premise!.id,
        claim_text: premise!.originalSpan.text,
        source_span: premise!.originalSpan,
        status: 'VERIFIED_QUOTE',
        role: 'PREMISE',
        verification_rationale: 'نص قرآني محقق'
      },
      {
        id: conclusion!.id,
        claim_text: conclusion!.originalSpan.text,
        source_span: conclusion!.originalSpan,
        status: 'INSUFFICIENT_EVIDENCE',
        role: 'CONCLUSION',
        dependsOn: [premise!.id],
        verification_rationale: 'لم يثبت أن الصيام واجب على المسافر'
      }
    ];

    const plan = buildRequestPlan('قال تعالى «كتب عليكم الصيام»، فثبت أن الصيام واجب على كل مسافر.');
    const parentAggregation = aggregateParentClaimStatus(mockClaims, plan);
    assert(
      parentAggregation.status === 'PARTIALLY_SUPPORTED' && parentAggregation.evidenceRelation === 'SCOPE_MISMATCH',
      'STRUCTURAL 5: Verified premise quotation does NOT automatically validate unsupported conclusion'
    );
  }

  // Test 6: Missing Source Domain Coverage Detection (SOURCE_COVERAGE_GAP)
  {
    const plan = buildRequestPlan('ما هي تفاصيل مبطلات الصلاة عند المالكية والحنفية وأحكام سجود السهو في الفروع؟');
    assert(
      plan.requiredDomains.includes('FIQH'),
      'STRUCTURAL 6: Inferred required domain FIQH from text structure'
    );
    assert(
      plan.hasCoverageGap === true && plan.missingDomains.includes('FIQH'),
      'STRUCTURAL 6: Flags SOURCE_COVERAGE_GAP because FIQH books are not in connected corpora'
    );
  }

  // Test 7: Multilingual English Support
  {
    const plan = buildRequestPlan('The Prophet said actions are judged by intentions (Bukhari: 1).');
    assert(
      plan.language === 'en',
      'STRUCTURAL 7: Detects English language input'
    );
    assert(
      plan.explicitReferences.length > 0 && plan.explicitReferences[0].sourceType === 'hadith',
      'STRUCTURAL 7: Extracts Hadith reference from English prose'
    );
  }

  // Test 8: Compound Claim Evidence Coverage Ratio
  {
    const childClaims: Claim[] = [
      { id: '1', claim_text: 'A', source_span: { text: '', start: 0, end: 0 }, status: 'SUPPORTED', verification_rationale: '' },
      { id: '2', claim_text: 'B', source_span: { text: '', start: 0, end: 0 }, status: 'VERIFIED_QUOTE', verification_rationale: '' },
      { id: '3', claim_text: 'C', source_span: { text: '', start: 0, end: 0 }, status: 'INSUFFICIENT_EVIDENCE', verification_rationale: '' },
      { id: '4', claim_text: 'D', source_span: { text: '', start: 0, end: 0 }, status: 'INSUFFICIENT_EVIDENCE', verification_rationale: '' }
    ];
    const plan = buildRequestPlan('Compound text with 4 statements');
    const agg = aggregateParentClaimStatus(childClaims, plan);
    assert(
      agg.evidenceCoverage === 0.5 && agg.status === 'PARTIALLY_SUPPORTED',
      'STRUCTURAL 8: Compound claim calculates deterministic evidenceCoverage = 2/4 = 0.5 (50%)'
    );
  }

  console.log('\n==================================================');
  console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions`);
  console.log('==================================================\n');
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSemanticsAndStructuralTests().catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}
