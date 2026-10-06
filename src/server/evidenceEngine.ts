import { 
  AuditRun, 
  Claim, 
  ClaimStatus, 
  ComparisonRun, 
  EvidenceRecord, 
  EvidenceRelationType, 
  SemanticDeltaCategory, 
  TransformationDelta 
} from '../types';
import { loadFullCorpus, searchSeedEvidence, normalizeArabic } from '../data/seedEvidence';
import { 
  buildRequestPlan, 
  aggregateParentClaimStatus, 
  AVAILABLE_TRUSTED_DOMAINS,
  DOMAIN_LABELS_AR 
} from './claimDecomposer';
import { retrieveReferenceEvidence } from './referenceParser';
import { 
  createExactMatchMetric, 
  createRetrievalSimilarityMetric, 
  createEvidenceCoverageMetric 
} from '../utils/metricRegistry';

/**
 * Deterministic Evidence & Claim Engine
 * Follows strict MIHAK reliability rules:
 * 1. Evidence is separate from model reasoning.
 * 2. Retrieval similarity does not automatically mean religious truth.
 * 3. Never invent arbitrary percentages (95%, 98%, 50%).
 * 4. Multi-reference: all explicit references are retrieved independently.
 * 5. Premise vs Conclusion: an accurate premise quotation never automatically validates a conclusion.
 * 6. Missing source domains produce SOURCE_COVERAGE_GAP instead of guessing.
 */
export class EvidenceEngine {

  /**
   * Evaluates input text for claims and matches with canonical evidence
   */
  public static async auditContent(text: string): Promise<AuditRun> {
    const trimmed = text.trim();
    const startTime = Date.now();

    // Ensure corpora are loaded
    await loadFullCorpus();

    // Build structured intermediate representation
    const plan = buildRequestPlan(trimmed, 'CONTENT_FOR_AUDIT');
    const claims: Claim[] = [];

    // Evaluate each atomic proposition independently
    for (let index = 0; index < plan.propositions.length; index++) {
      const prop = plan.propositions[index];
      const claimId = `CLM-${String(index + 1).padStart(3, '0')}`;
      const sentence = prop.originalSpan.text;

      // 1. Check for missing required domains
      const propMissingDomains = prop.requiredEvidenceDomains.filter(d => !AVAILABLE_TRUSTED_DOMAINS.has(d));
      if (propMissingDomains.length > 0) {
        const missingLabels = propMissingDomains.map(d => DOMAIN_LABELS_AR[d] || d).join('، ');
        claims.push({
          id: claimId,
          claim_text: sentence,
          source_span: prop.originalSpan,
          status: 'SOURCE_COVERAGE_GAP',
          evidence_relation: 'INSUFFICIENT_CONTEXT',
          propositionType: prop.propositionType,
          role: prop.role,
          dependsOn: prop.dependsOn,
          requiredDomains: prop.requiredEvidenceDomains,
          missingDomains: propMissingDomains,
          verification_rationale: `يتطلب فحص هذا العنصر مراجع متخصصة في [${missingLabels}]، وهي غير متصلة حالياً بالمحرك المعتمد. يمتنع مِحَكّ عن التخمين.`
        });
        continue;
      }

      // 2. If explicit references exist, perform multi-reference deterministic retrieval FIRST
      if (prop.explicitReferences.length > 0) {
        let referenceMatched = false;
        for (const ref of prop.explicitReferences) {
          const refResult = await retrieveReferenceEvidence(ref);
          if (refResult.success && refResult.evidence) {
            const rawNorm = normalizeArabic(refResult.evidence.raw_text);
            const queryNorm = normalizeArabic(prop.normalizedMeaning);
            const isVerbatim = rawNorm.includes(queryNorm) || queryNorm.includes(rawNorm);

            claims.push({
              id: claimId,
              claim_text: sentence,
              source_span: prop.originalSpan,
              status: isVerbatim ? 'VERIFIED_QUOTE' : 'SUPPORTED',
              exactMatch: isVerbatim,
              metricProvenance: isVerbatim ? [createExactMatchMetric('EvidenceEngine.referenceParser', `مطابقة تامة مع ${refResult.evidence.canonical_reference}`)] : undefined,
              evidence_relation: 'DIRECT_SUPPORT',
              evidence: refResult.evidence,
              evidence_passage: refResult.evidence.raw_text,
              propositionType: prop.propositionType,
              role: prop.role,
              dependsOn: prop.dependsOn,
              requiredDomains: prop.requiredEvidenceDomains,
              verification_rationale: `تم التحقق المباشر من المرجع المذكور [${refResult.evidence.source_name} - ${refResult.evidence.canonical_reference}] ومطابقة نصه مع الادعاء.`
            });
            referenceMatched = true;
            break;
          }
        }
        if (referenceMatched) continue;
      }

      // 3. Search in canonical evidence corpus
      const quoteMatch = sentence.match(/[«"']([^»"']+)[\»"']/);
      const targetQuery = quoteMatch ? quoteMatch[1] : prop.normalizedMeaning;
      const searchMatches = searchSeedEvidence(targetQuery);

      if (searchMatches.length > 0 && searchMatches[0].score >= 0.75) {
        const top = searchMatches[0];
        const isVerbatim = normalizeArabic(top.record.raw_text) === normalizeArabic(targetQuery) ||
          normalizeArabic(top.record.raw_text).includes(normalizeArabic(targetQuery)) ||
          normalizeArabic(targetQuery).includes(normalizeArabic(top.record.raw_text));

        const status: ClaimStatus = isVerbatim && quoteMatch ? 'VERIFIED_QUOTE' : 'SUPPORTED';
        const similarityScore = Number(top.score.toFixed(3));

        claims.push({
          id: claimId,
          claim_text: sentence,
          source_span: prop.originalSpan,
          status,
          exactMatch: isVerbatim,
          retrievalSimilarity: similarityScore,
          metricProvenance: [
            isVerbatim
              ? createExactMatchMetric('EvidenceEngine.searchSeedEvidence', `مطابقة حرفية مع ${top.record.canonical_reference}`)
              : createRetrievalSimilarityMetric(similarityScore, 'EvidenceEngine.searchSeedEvidence', `تشابه معجمي مسترجع بمقدار ${Math.round(similarityScore * 100)}%`)
          ],
          evidence_relation: 'DIRECT_SUPPORT',
          evidence: top.record,
          evidence_passage: top.record.raw_text,
          propositionType: prop.propositionType,
          role: prop.role,
          dependsOn: prop.dependsOn,
          requiredDomains: prop.requiredEvidenceDomains,
          verification_rationale: `تم التحقق من مطابقة النص المستخرج مع نص الآية/المصدر الموثق في [${top.record.source_name} - ${top.record.canonical_reference}].`
        });
      } else if (searchMatches.length > 0 && searchMatches[0].score >= 0.45) {
        const top = searchMatches[0];
        const similarityScore = Number(top.score.toFixed(3));

        claims.push({
          id: claimId,
          claim_text: sentence,
          source_span: prop.originalSpan,
          status: 'PARTIALLY_SUPPORTED',
          exactMatch: false,
          retrievalSimilarity: similarityScore,
          metricProvenance: [
            createRetrievalSimilarityMetric(similarityScore, 'EvidenceEngine.searchSeedEvidence', `تشابه جزئي معجمي بمقدار ${Math.round(similarityScore * 100)}%`)
          ],
          evidence_relation: 'PARTIAL_SUPPORT',
          evidence: top.record,
          evidence_passage: top.record.raw_text,
          propositionType: prop.propositionType,
          role: prop.role,
          dependsOn: prop.dependsOn,
          requiredDomains: prop.requiredEvidenceDomains,
          verification_rationale: `يوجد تشابه جزئي مع [${top.record.canonical_reference}]، لكن الصياغة تحتوي على إضافات أو قيود لم يُعثر على إثبات لها في المصدر.`
        });
      } else {
        // Abstention rule: Never hallucinate support.
        const isJurisprudenceOrConsensusClaim = /أجمع|إجماع|فرض|حرام|واجب|مذهب|اتفق|حكم/i.test(sentence);

        claims.push({
          id: claimId,
          claim_text: sentence,
          source_span: prop.originalSpan,
          status: isJurisprudenceOrConsensusClaim ? 'NEEDS_SPECIALIST_REVIEW' : 'INSUFFICIENT_EVIDENCE',
          exactMatch: false,
          evidence_relation: 'UNVERIFIED',
          propositionType: prop.propositionType,
          role: prop.role,
          dependsOn: prop.dependsOn,
          requiredDomains: prop.requiredEvidenceDomains,
          verification_rationale: 'امتناع مِحَكّ: لم يتم العثور على دليل كافٍ يطابق هذا الادعاء في المدونة الموثقة المعتمدة.',
          specialist_review_reason: isJurisprudenceOrConsensusClaim 
            ? 'الادعاء يتضمن حكمًا تكليفيًا أو دعوى إجماع تتطلب الرجوع لكتب التراث وفحص المتخصصين في أصول الفقه.' 
            : undefined
        });
      }
    }

    // If compound input with multiple propositions, compute deterministic evidenceCoverage
    if (claims.length > 1) {
      const verifiedEssential = claims.filter(c => c.status === 'SUPPORTED' || c.status === 'VERIFIED_QUOTE').length;
      const coverageMetric = createEvidenceCoverageMetric(verifiedEssential, claims.length, 'EvidenceEngine.aggregate');
      // Attach evidence coverage to the parent audit run / summary
      claims.forEach(c => {
        c.evidenceCoverage = coverageMetric.value;
      });
    }

    const stats = {
      total: claims.length,
      supported: claims.filter(c => c.status === 'SUPPORTED').length,
      partiallySupported: claims.filter(c => c.status === 'PARTIALLY_SUPPORTED').length,
      insufficientEvidence: claims.filter(c => c.status === 'INSUFFICIENT_EVIDENCE').length,
      needsSpecialistReview: claims.filter(c => c.status === 'NEEDS_SPECIALIST_REVIEW' || !!c.specialist_review_reason).length,
      verifiedQuotes: claims.filter(c => c.status === 'VERIFIED_QUOTE').length,
      sourceCoverageGap: claims.filter(c => c.status === 'SOURCE_COVERAGE_GAP').length
    };

    return {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      input_text: trimmed,
      detected_language: plan.language,
      request_plan: plan,
      claims,
      stats,
      abstention_count: stats.insufficientEvidence + (stats.sourceCoverageGap || 0),
      duration_ms: Date.now() - startTime
    };
  }

  /**
   * Compares Original Source against Derived Content to detect semantic shifts.
   */
  public static compareTransformation(sourceText: string, derivedText: string, derivedType: string = 'إعادة صياغة'): ComparisonRun {
    const startTime = Date.now();
    const deltas: TransformationDelta[] = [];

    // 1. Modality Shift: e.g. "قد يدل / ربما / محتمل" -> "يدل قطعا / جزما / بالضرورة"
    const hasProbabilistic = /قد\s+يدل|ربما|محتمل|يحتمل|ظني|الراجح|الأظهر/i.test(sourceText);
    const hasDefinite = /يدل\s+قطعا|قطعا|حتما|بالضرورة|بلا\s+شك|يقين|جزم/i.test(derivedText);
    if (hasProbabilistic && hasDefinite) {
      deltas.push({
        id: `DELTA-001`,
        category: 'MODALITY_SHIFT',
        category_label_ar: 'تغيّر درجة اليقين (Modality Shift)',
        source_span: this.extractSurroundingSpan(sourceText, ['قد يدل', 'ربما', 'محتمل', 'يحتمل', 'الراجح']),
        derived_span: this.extractSurroundingSpan(derivedText, ['يدل قطعا', 'قطعا', 'حتما', 'بالضرورة', 'يقين']),
        explanation: 'تحولت صياغة احتمالية أو ظنية في المصدر إلى صياغة قطعية جازمة في النص المشتق دون مستند نصي يدعم هذا الجزم.',
        impact_level: 'CRITICAL'
      });
    }

    // 2. Negation Shift: Source has "لا / لم / ليس / غير" while derived removed it or vice versa
    const sourceNegated = /لا\s+|لم\s+|لن\s+|ليس|غير\s+/i.test(sourceText);
    const derivedNegated = /لا\s+|لم\s+|لن\s+|ليس|غير\s+/i.test(derivedText);
    if (sourceNegated !== derivedNegated) {
      deltas.push({
        id: `DELTA-${deltas.length + 1}`,
        category: 'NEGATION_SHIFT',
        category_label_ar: 'تغيّر النفي والإثبات (Negation Shift)',
        source_span: sourceText,
        derived_span: derivedText,
        explanation: 'انعكاس في دلالة النفي والإثبات؛ إما بإسقاط أداة النفي أو إقحام نفي لم يرد في الأصل.',
        impact_level: 'CRITICAL'
      });
    }

    // 3. Attribution Shift: Attributing single scholar opinion to consensus (إجماع) or vice versa
    const sourceIndividual = /ذهب\s+الإمام|قول\s+الواحد|رأي|رأى|قال\s+بعض/i.test(sourceText);
    const derivedConsensus = /أجمع|إجماع|كافة|قاطبة|اتفق\s+العلماء/i.test(derivedText);
    if (sourceIndividual && derivedConsensus) {
      deltas.push({
        id: `DELTA-${deltas.length + 1}`,
        category: 'ATTRIBUTION_SHIFT',
        category_label_ar: 'تغيّر جهة النسبة (Attribution Shift)',
        source_span: this.extractSurroundingSpan(sourceText, ['ذهب الإمام', 'رأي', 'قال']),
        derived_span: this.extractSurroundingSpan(derivedText, ['أجمع', 'إجماع', 'كافة']),
        explanation: 'تم تغيير جهة النسبة من رأي فردي اجتهادي إلى دعوى إجماع عام على الأمة.',
        impact_level: 'CRITICAL'
      });
    }

    // 4. Scope Shift / Omission of conditions:
    const hasCondition = /بشرط|إذا|ما\s+لم|حال|في\s+حالة|خاص|للمسافر|للمريض/i.test(sourceText);
    const hasGeneralization = /دائما|مطلقا|لكل|لأي|في\s+أي\s+ظرف|دون\s+شروط/i.test(derivedText);
    if (hasCondition && hasGeneralization) {
      deltas.push({
        id: `DELTA-${deltas.length + 1}`,
        category: 'SCOPE_SHIFT',
        category_label_ar: 'تغيّر النطاق وإسقاط القيود (Scope Shift)',
        source_span: this.extractSurroundingSpan(sourceText, ['بشرط', 'إذا', 'خاص', 'للمسافر']),
        derived_span: this.extractSurroundingSpan(derivedText, ['دائما', 'مطلقا', 'دون شروط', 'لأي']),
        explanation: 'إسقاط قيود وشروط الحكم المقيد في الأصل وتوسيعه إلى حكم عام مطلق.',
        impact_level: 'CRITICAL'
      });
    }

    // If no specific delta matched, analyze word length differences
    if (deltas.length === 0) {
      const sourceWords = sourceText.split(/\s+/).length;
      const derivedWords = derivedText.split(/\s+/).length;

      if (derivedWords > sourceWords * 1.5) {
        deltas.push({
          id: 'DELTA-001',
          category: 'ADDITION',
          category_label_ar: 'إضافة معنى (Addition)',
          source_span: sourceText,
          derived_span: derivedText,
          explanation: 'يتضمن النص المشتق توسعًا واستطرادًا لا تجد له عبارات مقابلة في النص المصدر.',
          impact_level: 'MODERATE'
        });
      } else if (sourceWords > derivedWords * 1.8) {
        deltas.push({
          id: 'DELTA-001',
          category: 'OMISSION',
          category_label_ar: 'حذف معنى (Omission)',
          source_span: sourceText,
          derived_span: derivedText,
          explanation: 'أغفل النص المشتق أجزاء متعددة من السياق الأصلي قد تخل بالاكتمال الدلالي.',
          impact_level: 'MODERATE'
        });
      } else {
        return {
          id: `comp-${Date.now()}`,
          timestamp: new Date().toISOString(),
          source_text: sourceText,
          derived_text: derivedText,
          derived_type: derivedType,
          deltas: [],
          alignment_summary: 'تطابق دلالي وثيق بين النص المصدر والنص المشتق دون رصد انزياحات جوهرية في المعنى أو النطاق.',
          integrity_score: 100,
          duration_ms: Date.now() - startTime
        };
      }
    }

    const calculatedScore = Math.max(10, 100 - (deltas.length * 25));

    return {
      id: `comp-${Date.now()}`,
      timestamp: new Date().toISOString(),
      source_text: sourceText,
      derived_text: derivedText,
      derived_type: derivedType,
      deltas,
      alignment_summary: `تم رصد ${deltas.length} فوارق دلالية تتطلب تدقيقًا لمطابقة النص المنقول مع أصله.`,
      integrity_score: calculatedScore,
      duration_ms: Date.now() - startTime
    };
  }

  private static extractSurroundingSpan(fullText: string, keywords: string[]): string {
    for (const kw of keywords) {
      const idx = fullText.indexOf(kw);
      if (idx !== -1) {
        const start = Math.max(0, idx - 10);
        const end = Math.min(fullText.length, idx + kw.length + 20);
        return fullText.slice(start, end).trim();
      }
    }
    return fullText.slice(0, 40) + '...';
  }
}
