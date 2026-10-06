/**

 * MIHAK — مِحَكّ

 * Generic Structured Proposition Decomposer & Source Coverage Engine

 *

 * Core Principles:

 * 1. Decomposes compound inputs into independently verifiable atomic propositions.

 * 2. Explicitly separates Premises from Conclusions.

 * 3. Identifies required source domains and compares with available trusted corpora.

 * 4. Flags SOURCE_COVERAGE_GAP whenever a required domain is not connected.

 * 5. Aggregates parent status deterministically from child propositions without fake percentages.

 */



import { GoogleGenAI } from '@google/genai';
import { generateSemanticJson } from './semanticProvider';

import type {

  EvidenceDomain,

  Proposition,

  PropositionType,

  RequestPlan,

  Claim,

  ClaimStatus,

  EvidenceRelationType,

  InputType

} from '../types';

import { extractAllReferences } from './referenceParser';

import { createEvidenceCoverageMetric, createExactMatchMetric } from '../utils/metricRegistry';



/**

 * Registry of currently connected and verified trusted source corpora in MIHAK.

 */

export const AVAILABLE_TRUSTED_DOMAINS: ReadonlySet<EvidenceDomain> = new Set<EvidenceDomain>([

  'QURAN',

  'TAFSIR',

  'HADITH',

  'QURAN_LEXICAL',

  'ARABIC_LANGUAGE'

]);



/**

 * Human-readable Arabic names for evidence domains.

 */

export const DOMAIN_LABELS_AR: Record<EvidenceDomain, string> = {

  QURAN: 'القرآن الكريم (مصحف المدينة النبوية)',

  TAFSIR: 'كتب التفسير المعتمدة (الميسر، ابن كثير، الطبري)',

  HADITH: 'موسوعات الحديث النبوي المسند (الصحيحان والسنن)',

  QURAN_LEXICAL: 'معاجم مفردات وغريب القرآن',

  ARABIC_LANGUAGE: 'معاجم لسان العرب واللغة العربية',

  SIRAH: 'كتب السيرة النبوية والمغازي الموثقة',

  FIQH: 'المصنفات الفقهية وأبواب الفروع والمذاهب',

  AQIDAH: 'كتب أصول الدين والعقيدة المعتمدة',

  HISTORICAL_CONTEXT: 'كتب التاريخ والتراجم الإسلامية',

  ASBAB_AL_NUZUL: 'كتب أسباب النزول المعتمدة',

  QIRAAT: 'كتب القراءات والتوجيه المعتمدة',

  OTHER: 'مصادر أخرى'

};



/**

 * Argument boundary connectors in Arabic and English separating premises from conclusions.

 */

const ARGUMENT_CONNECTORS = [

  'فثبت أن', 'فثبت ان', 'لذا', 'لذلك', 'ولذلك', 'وبالتالي', 'فهذا يدل على', 'إذن', 'اذن',

  'فهذا يقتضي', 'وعليه فإن', 'وعليه', 'ومن ثم', 'ومن ثَم', 'لهذا', 'وبناء على ذلك',

  'فالنتيجة هي', 'مما يثبت', 'مما يدل',

  'therefore', 'thus', 'hence', 'so', 'which proves that', 'which implies that'

];

function splitPremiseClauses(text: string): Array<{ original: string; normalized: string; start: number }> {
  const sourceContext = /القر[آا]ن/.test(text)
    ? 'القرآن'
    : /حديث|النبي|رسول الله/.test(text)
      ? 'الحديث'
      : /quran/i.test(text)
        ? 'Quran'
        : /hadith|prophet/i.test(text)
          ? 'Hadith'
          : '';

  const pieces = text
    .split(/\s+(?=(?:و?يذكر(?:\s+أيض(?:ًا|ا))?|و?يقول|كما\s+(?:يذكر|ورد|جاء)|وكذلك|وأيض(?:ًا|ا)|وايض(?:ا)?|and\s+(?:the\s+)?(?:quran|hadith|source)))/i)
    .map((x) => x.trim())
    .filter((x) => x.length > 4);

  if (pieces.length <= 1) {
    return [{ original: text, normalized: text, start: 0 }];
  }

  let cursor = 0;
  return pieces.map((piece, index) => {
    const at = text.indexOf(piece, cursor);
    cursor = at >= 0 ? at + piece.length : cursor;
    const normalized = index > 0 && sourceContext && !new RegExp(sourceContext, 'i').test(piece)
      ? `${sourceContext}: ${piece.replace(/^و/, '').trim()}`
      : piece;
    return { original: piece, normalized, start: Math.max(0, at) };
  });
}



/**

 * Detects the language of the text.

 */

export function detectLanguage(text: string): 'ar' | 'en' | 'mixed' {

  const hasArabic = /[\u0600-\u06FF]/.test(text);

  const hasLatin = /[a-zA-Z]/.test(text);

  if (hasArabic && hasLatin) return 'mixed';

  if (hasArabic) return 'ar';

  return 'en';

}



/**

 * Infers required evidence domains from proposition content and references.

 */

export function inferRequiredDomains(text: string, references: ReturnType<typeof extractAllReferences>): EvidenceDomain[] {

  const domains = new Set<EvidenceDomain>();

  const lower = text.toLowerCase();



  // 1. References check

  for (const ref of references) {

    if (ref.sourceType === 'quran') domains.add('QURAN');

    if (ref.sourceType === 'hadith') domains.add('HADITH');

  }



  // 2. Lexical indicators for Quran / Tafsir

  if (/قرآن|سورة|آية|مصحف|تفسير|معنى كلمة|إعراب|قراءة|quran|surah|verse|tafsir/i.test(text)) {

    if (/تفسير|معنى|المراد بـ|سبب نزول/i.test(text)) {

      domains.add('TAFSIR');

    } else {

      domains.add('QURAN');

    }

  }



  // 3. Hadith indicators

  if (/حديث|رسول الله|قال النبي|صلى الله عليه وسلم|رواه|البخاري|مسلم|إسناد|hadith|prophet/i.test(text)) {

    domains.add('HADITH');

  }



  // 4. Lexical meaning

  if (/معنى|مرادف|جذر|لغة|اشتقاق|meaning|lexicon|root/i.test(text)) {

    domains.add('QURAN_LEXICAL');

    domains.add('ARABIC_LANGUAGE');

  }



  // 5. Asbab al-Nuzul

  if (/سبب نزول|نزلت في|مناسبة النزول/i.test(text)) {

    domains.add('ASBAB_AL_NUZUL');

    domains.add('TAFSIR');

  }



  // 6. Fiqh / Rulings (Specialist domain)

  if (/حكم|فرض|واجب|حرام|مستحب|مكروه|مبطلات|شروط الصلاة|طهارة|زكاة|مذهب|شافعي|حنفي|مالكي|حنبلي|fiqh|halal|haram|jurisprudence/i.test(text)) {

    domains.add('FIQH');

  }



  // 7. Sirah / Historical (Specialist domain)

  if (/غزوة|موقعة|هجرة|تاريخ|سيرة|وفاة|ميلاد|صحابي|صحابة|بدر|أحد|حنين/i.test(text)) {

    domains.add('SIRAH');

  }



  // 8. Aqidah / Theology

  if (/عقيدة|صفات|أشاعرة|ماتريدية|سلفية|معتزلة|تجسيم|تأويل|قضاء وقدر/i.test(text)) {

    domains.add('AQIDAH');

  }



  // Default if no specific domain matched

  if (domains.size === 0) {

    domains.add('QURAN');

    domains.add('HADITH');

  }



  return Array.from(domains);

}



/**

 * Splits text into atomic propositions, isolating premises, quotations, and conclusions.

 */

export function decomposeIntoPropositions(input: string): Proposition[] {

  const trimmed = input.trim();

  if (!trimmed) return [];



  const propositions: Proposition[] = [];

  let propIdx = 1;



  // Check for explicit argument structure (Premise -> Conclusion connector)

  let premisePart: string | null = null;

  let conclusionPart: string | null = null;



  for (const conn of ARGUMENT_CONNECTORS) {

    const idx = trimmed.indexOf(conn);

    if (idx > 5 && idx + conn.length < trimmed.length - 5) {

      premisePart = trimmed.substring(0, idx).trim();

      conclusionPart = trimmed.substring(idx + conn.length).trim();

      break;

    }

  }



  if (premisePart && conclusionPart) {
    const premiseIds: string[] = [];
    const premiseClauses = splitPremiseClauses(premisePart);

    for (const clause of premiseClauses) {
      const premiseRefs = extractAllReferences(clause.original);
      const premiseDomains = inferRequiredDomains(clause.normalized, premiseRefs);
      const premiseId = `PROP-${String(propIdx++).padStart(3, '0')}`;
      premiseIds.push(premiseId);

      propositions.push({
        id: premiseId,
        originalSpan: {
          text: clause.original,
          start: clause.start,
          end: clause.start + clause.original.length
        },
        normalizedMeaning: clause.normalized,
        propositionType: premiseRefs.length > 0 ? 'QUOTATION' : 'PREMISE',
        role: 'PREMISE',
        explicitReferences: premiseRefs,
        requiredEvidenceDomains: premiseDomains,
        isEssential: true
      });
    }

    const conclusionRefs = extractAllReferences(conclusionPart);
    const conclusionDomains = inferRequiredDomains(conclusionPart, conclusionRefs);
    const conclusionId = `PROP-${String(propIdx++).padStart(3, '0')}`;

    propositions.push({
      id: conclusionId,
      originalSpan: {
        text: conclusionPart,
        start: trimmed.indexOf(conclusionPart),
        end: trimmed.indexOf(conclusionPart) + conclusionPart.length
      },
      normalizedMeaning: conclusionPart,
      propositionType: /تعارض|تناقض|contradict|contradiction/i.test(conclusionPart)
        ? 'CONTRADICTION'
        : 'CONCLUSION',
      role: 'CONCLUSION',
      explicitReferences: conclusionRefs,
      dependsOn: premiseIds,
      requiredEvidenceDomains: conclusionDomains,
      isEssential: true
    });

    return propositions;
  }


  // Otherwise, split by punctuation, sentences, and quotes

  // Preserve quoted segments as standalone atomic propositions

  const quoteRegex = /([«"'][^»"']+[»"'])/g;

  const rawParts = trimmed.split(/(?<=[.،؛؟!\n])\s+/).filter(p => p.trim().length > 0);



  for (const part of rawParts) {

    const partTrimmed = part.trim();

    if (!partTrimmed) continue;



    // Check if part contains quotes

    const quoteMatches = Array.from(partTrimmed.matchAll(quoteRegex));

    if (quoteMatches.length > 0) {

      for (const qm of quoteMatches) {

        const quotedText = qm[0].replace(/[«»"']/g, '').trim();

        if (quotedText.length > 3) {

          const refs = extractAllReferences(quotedText);

          const domains = inferRequiredDomains(quotedText, refs);

          const start = trimmed.indexOf(qm[0]);

          propositions.push({

            id: `PROP-${String(propIdx++).padStart(3, '0')}`,

            originalSpan: { text: qm[0], start: Math.max(0, start), end: start + qm[0].length },

            normalizedMeaning: quotedText,

            propositionType: 'QUOTATION',

            role: 'INDEPENDENT_CLAIM',

            explicitReferences: refs,

            requiredEvidenceDomains: domains,

            isEssential: true

          });

        }

      }



      // Also include surrounding text if it has meaning beyond the quote

      const withoutQuote = partTrimmed.replace(quoteRegex, '').trim();

      if (withoutQuote.length > 10) {

        const refs = extractAllReferences(withoutQuote);

        const domains = inferRequiredDomains(withoutQuote, refs);

        const start = trimmed.indexOf(withoutQuote);

        propositions.push({

          id: `PROP-${String(propIdx++).padStart(3, '0')}`,

          originalSpan: { text: withoutQuote, start: Math.max(0, start), end: start + withoutQuote.length },

          normalizedMeaning: withoutQuote,

          propositionType: 'INTERPRETATION',

          role: 'INDEPENDENT_CLAIM',

          explicitReferences: refs,

          requiredEvidenceDomains: domains,

          isEssential: true

        });

      }

    } else {

      const refs = extractAllReferences(partTrimmed);

      const domains = inferRequiredDomains(partTrimmed, refs);

      const start = trimmed.indexOf(partTrimmed);

      const isQuotation = refs.length > 0 || /قال|روى|ذكر|نص/.test(partTrimmed);



      propositions.push({

        id: `PROP-${String(propIdx++).padStart(3, '0')}`,

        originalSpan: { text: partTrimmed, start: Math.max(0, start), end: start + partTrimmed.length },

        normalizedMeaning: partTrimmed,

        propositionType: isQuotation ? 'QUOTATION' : 'GENERAL_CLAIM',

        role: 'INDEPENDENT_CLAIM',

        explicitReferences: refs,

        requiredEvidenceDomains: domains,

        isEssential: true

      });

    }

  }



  // Fallback if empty

  if (propositions.length === 0) {

    const refs = extractAllReferences(trimmed);

    const domains = inferRequiredDomains(trimmed, refs);

    propositions.push({

      id: 'PROP-001',

      originalSpan: { text: trimmed, start: 0, end: trimmed.length },

      normalizedMeaning: trimmed,

      propositionType: refs.length > 0 ? 'QUOTATION' : 'GENERAL_CLAIM',

      role: 'INDEPENDENT_CLAIM',

      explicitReferences: refs,

      requiredEvidenceDomains: domains,

      isEssential: true

    });

  }



  return propositions;

}



/**

 * Builds a structured RequestPlan for an input, including required domains and coverage gaps.

 */

export function buildRequestPlan(input: string, inputType: InputType = 'CLAIM'): RequestPlan {

  const originalInput = input.trim();

  const language = detectLanguage(originalInput);

  const propositions = decomposeIntoPropositions(originalInput);

  const explicitReferences = extractAllReferences(originalInput);



  // Aggregate all required domains across propositions

  const requiredDomainsSet = new Set<EvidenceDomain>();

  for (const prop of propositions) {

    for (const d of prop.requiredEvidenceDomains) {

      requiredDomainsSet.add(d);

    }

  }

  const requiredDomains = Array.from(requiredDomainsSet);

  const availableDomains = Array.from(AVAILABLE_TRUSTED_DOMAINS);



  // Detect missing domains

  const missingDomains = requiredDomains.filter(d => !AVAILABLE_TRUSTED_DOMAINS.has(d));

  const hasCoverageGap = missingDomains.length > 0;



  return {

    originalInput,

    language,

    inputType,

    taskType: inputType,

    propositions,

    explicitReferences,

    requiredDomains,

    availableDomains,

    missingDomains,

    hasCoverageGap

  };

}





/* =========================================================
   SEMANTIC PROPOSITION DECOMPOSITION
   ========================================================= */

const semanticApiKey = process.env.GEMINI_API_KEY;
let semanticDecomposerClient: GoogleGenAI | null = null;

if (semanticApiKey && semanticApiKey !== 'MY_GEMINI_API_KEY' && semanticApiKey.trim().length > 0) {
  try {
    semanticDecomposerClient = new GoogleGenAI({
      apiKey: semanticApiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
  } catch (error) {
    console.warn('[MIHAK Claim Decomposer] Gemini initialization failed:', error);
    semanticDecomposerClient = null;
  }
}

const SEMANTIC_DECOMPOSER_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];

function uniqueDomains(values: EvidenceDomain[]): EvidenceDomain[] {
  return Array.from(new Set(values));
}

/**
 * Uses Gemini ONLY to segment/label the user's own wording.
 * The model is forbidden from supplying religious facts or evidence.
 * Every returned proposition must be an exact substring of the input; otherwise it is discarded.
 */
export async function buildRequestPlanSemantic(
  input: string,
  inputType: InputType = 'CLAIM'
): Promise<RequestPlan> {
  const base = buildRequestPlan(input, inputType);
  const originalInput = input.trim();

  if (!semanticDecomposerClient || originalInput.length < 18) {
    return base;
  }

  const prompt = `You are MIHAK's claim-structure parser. You do NOT answer religious questions and you do NOT provide Quran, Hadith, Tafsir, rulings, or facts from memory.

Your task is only to split the USER'S OWN TEXT into independently verifiable propositions and identify argument roles.

You must understand:
- Modern Standard Arabic and Arabic dialects (Egyptian, Gulf, Hijazi, Najdi, Levantine, Iraqi, Yemeni, Sudanese, Maghrebi)
- English and mixed Arabic/English
- spelling mistakes, colloquial grammar, and informal word order

Return JSON ONLY:
{
  "propositions": [
    {
      "text": "EXACT VERBATIM SUBSTRING copied from the user input",
      "role": "PREMISE" | "CONCLUSION" | "INDEPENDENT_CLAIM",
      "propositionType": "QUOTATION" | "ATTRIBUTION" | "LEXICAL_CLAIM" | "NUMERICAL_CLAIM" | "INTERPRETATION" | "COMPARISON" | "CONTRADICTION" | "PREMISE" | "CONCLUSION" | "GENERAL_CLAIM",
      "requiredDomains": ["QURAN" | "TAFSIR" | "HADITH" | "QURAN_LEXICAL" | "ARABIC_LANGUAGE" | "SIRAH" | "FIQH" | "AQIDAH" | "HISTORICAL_CONTEXT" | "ASBAB_AL_NUZUL" | "QIRAAT" | "OTHER"],
      "dependsOnIndexes": [0]
    }
  ]
}

STRICT RULES:
1. text MUST be copied verbatim from the user input. Never paraphrase it.
2. Do not invent a proposition that is not explicitly present.
3. Separate factual/source premises from an author's inference or conclusion.
4. A sentence can contain multiple premises even without punctuation.
5. If the user says two source statements and then alleges contradiction, return the two source statements as separate PREMise propositions and the contradiction as a CONCLUSION.
6. requiredDomains describes what trusted source domain is needed to verify that proposition; it is routing metadata only.
7. Do not judge whether any proposition is true or false.
8. If the input is actually one atomic proposition, return exactly one item.

USER INPUT:
${JSON.stringify(originalInput)}`;

  const aiResult = await generateSemanticJson(prompt, { maxGeminiRetries: 1 });
  if (aiResult.ok && aiResult.json) {
    try {
      const parsed = aiResult.json;
      const rawItems = Array.isArray(parsed?.propositions) ? parsed.propositions : [];
      const allowedTypes = new Set<PropositionType>([
        'QUOTATION', 'ATTRIBUTION', 'LEXICAL_CLAIM', 'NUMERICAL_CLAIM', 'INTERPRETATION',
        'COMPARISON', 'CONTRADICTION', 'PREMISE', 'CONCLUSION', 'GENERAL_CLAIM'
      ]);
      const allowedRoles = new Set(['PREMISE', 'CONCLUSION', 'INDEPENDENT_CLAIM']);
      const allowedDomains = new Set<EvidenceDomain>([
        'QURAN', 'TAFSIR', 'HADITH', 'QURAN_LEXICAL', 'ARABIC_LANGUAGE', 'SIRAH',
        'FIQH', 'AQIDAH', 'HISTORICAL_CONTEXT', 'ASBAB_AL_NUZUL', 'QIRAAT', 'OTHER'
      ]);

      const propositions: Proposition[] = [];
      const occupied: Array<{ start: number; end: number }> = [];

      for (let i = 0; i < rawItems.length && propositions.length < 24; i++) {
        const item = rawItems[i] || {};
        const text = String(item.text || '').trim();
        if (text.length < 2) continue;

        // HARD anti-hallucination invariant: semantic decomposition may only return exact user spans.
        let start = originalInput.indexOf(text);
        if (start < 0) continue;

        // If the same exact phrase occurs several times, choose the first not already occupied.
        if (occupied.some(r => start >= r.start && start < r.end)) {
          let from = start + text.length;
          while (from < originalInput.length) {
            const next = originalInput.indexOf(text, from);
            if (next < 0) break;
            if (!occupied.some(r => next >= r.start && next < r.end)) {
              start = next;
              break;
            }
            from = next + text.length;
          }
        }

        const role = allowedRoles.has(String(item.role))
          ? String(item.role) as Proposition['role']
          : 'INDEPENDENT_CLAIM';
        const propositionType = allowedTypes.has(item.propositionType as PropositionType)
          ? item.propositionType as PropositionType
          : role === 'CONCLUSION' ? 'CONCLUSION' : role === 'PREMISE' ? 'PREMISE' : 'GENERAL_CLAIM';

        const refs = extractAllReferences(text);
        const deterministicDomains = inferRequiredDomains(text, refs);
        const modelDomains = Array.isArray(item.requiredDomains)
          ? item.requiredDomains.filter((d: unknown): d is EvidenceDomain => allowedDomains.has(d as EvidenceDomain))
          : [];
        const requiredEvidenceDomains = uniqueDomains([...deterministicDomains, ...modelDomains]);

        const prop: Proposition = {
          id: `PROP-${String(propositions.length + 1).padStart(3, '0')}`,
          originalSpan: { text, start, end: start + text.length },
          normalizedMeaning: text,
          propositionType,
          role,
          explicitReferences: refs,
          requiredEvidenceDomains,
          isEssential: true
        };
        propositions.push(prop);
        occupied.push({ start, end: start + text.length });
      }

      if (propositions.length === 0) return base;

      // Resolve dependency indexes only after stable IDs exist.
      for (let i = 0; i < propositions.length; i++) {
        const deps = Array.isArray(rawItems[i]?.dependsOnIndexes) ? rawItems[i].dependsOnIndexes : [];
        const resolved = deps
          .map((x: unknown) => Number(x))
          .filter((x: number) => Number.isInteger(x) && x >= 0 && x < propositions.length && x !== i)
          .map((x: number) => propositions[x].id);
        if (resolved.length) propositions[i].dependsOn = Array.from(new Set(resolved));
      }

      const requiredDomains = uniqueDomains(propositions.flatMap(p => p.requiredEvidenceDomains));
      const availableDomains = Array.from(AVAILABLE_TRUSTED_DOMAINS);
      const missingDomains = requiredDomains.filter(d => !AVAILABLE_TRUSTED_DOMAINS.has(d));

      return {
        originalInput,
        language: detectLanguage(originalInput),
        inputType,
        taskType: inputType,
        propositions,
        explicitReferences: extractAllReferences(originalInput),
        requiredDomains,
        availableDomains,
        missingDomains,
        hasCoverageGap: missingDomains.length > 0
      };
    } catch (error) {
      console.warn('[MIHAK Claim Decomposer] Parsing semantic decomposition failed:', error);
    }
  }

  return base;
}

/**

 * Aggregates evaluated child claims into parent claim status deterministically.

 * NEVER creates a fake averaged percentage.

 */

export function aggregateParentClaimStatus(

  childClaims: Claim[],

  plan: RequestPlan

): {

  status: ClaimStatus;

  evidenceCoverage: number;

  rationale: string;

  evidenceRelation: EvidenceRelationType;

} {

  const total = childClaims.length;

  if (total === 0) {

    return {

      status: 'INSUFFICIENT_EVIDENCE',

      evidenceCoverage: 0,

      rationale: 'لم يتم العثور على أدلة كافية في المصادر المعتمدة للتحقق من الادعاء.',

      evidenceRelation: 'UNVERIFIED'

    };

  }



  // Check premises vs conclusions:

  // An accurate premise does NOT automatically validate a conclusion!

  const premiseClaim = childClaims.find(c => c.role === 'PREMISE');

  const conclusionClaim = childClaims.find(c => c.role === 'CONCLUSION');



  if (premiseClaim && conclusionClaim) {

    const premiseSupported = premiseClaim.status === 'SUPPORTED' || premiseClaim.status === 'VERIFIED_QUOTE';

    const conclusionSupported = conclusionClaim.status === 'SUPPORTED' || conclusionClaim.status === 'VERIFIED_QUOTE';



    if (premiseSupported && !conclusionSupported) {

      return {

        status: 'PARTIALLY_SUPPORTED',

        evidenceCoverage: 0.5,

        rationale: 'المقدمة النصية/الاقتباس ثابت في المصدر المعتمد، ولكن النتيجة أو الدلالة المستنبطة لم يُعثر على دليل مسند يدعمها.',

        evidenceRelation: 'SCOPE_MISMATCH'

      };

    }

  }



  // If there's an uncovered required domain

  if (plan.hasCoverageGap) {

    const missingLabels = plan.missingDomains.map(d => DOMAIN_LABELS_AR[d] || d).join('، ');

    return {

      status: 'SOURCE_COVERAGE_GAP',

      evidenceCoverage: 0,

      rationale: `يتطلب التحقق الكامل من هذا المحتوى مراجع في [${missingLabels}]، وهي غير متصلة حاليًا بمحركات مِحَكّ المعتمدة، ويمتنع النظام عن التخمين.`,

      evidenceRelation: 'INSUFFICIENT_CONTEXT'

    };

  }



  const supportedCount = childClaims.filter(c => c.status === 'SUPPORTED' || c.status === 'VERIFIED_QUOTE').length;

  const partialCount = childClaims.filter(c => c.status === 'PARTIALLY_SUPPORTED').length;

  const driftCount = childClaims.filter(c => c.status === 'TRANSFORMATION_DRIFT').length;

  const specialistCount = childClaims.filter(c => c.status === 'NEEDS_SPECIALIST_REVIEW').length;

  const insufficientCount = childClaims.filter(c => c.status === 'INSUFFICIENT_EVIDENCE').length;



  const coverageRatio = Number((supportedCount / total).toFixed(2));



  if (driftCount > 0) {

    return {

      status: 'TRANSFORMATION_DRIFT',

      evidenceCoverage: coverageRatio,

      rationale: 'رُصد انزياح أو تغيّر دلالي في صياغة المحتوى عند مطابقته مع النص الأصلي في المصادر المعتمدة.',

      evidenceRelation: 'ATTRIBUTION_MISMATCH'

    };

  }



  if (specialistCount > 0) {

    return {

      status: 'NEEDS_SPECIALIST_REVIEW',

      evidenceCoverage: coverageRatio,

      rationale: 'يتضمن الادعاء عناصر فقهية أو مسائل استنباطية خلافية تتطلب مراجعة من متخصص في العلوم الشرعية.',

      evidenceRelation: 'INSUFFICIENT_CONTEXT'

    };

  }



  if (supportedCount === total) {

    const allQuotes = childClaims.every(c => c.status === 'VERIFIED_QUOTE');

    return {

      status: allQuotes ? 'VERIFIED_QUOTE' : 'SUPPORTED',

      evidenceCoverage: 1.0,

      rationale: 'جميع عناصر الادعاء مطابقة تمامًا للأدلة المسندة في المصادر المتصلة المعتمدة.',

      evidenceRelation: 'DIRECT_SUPPORT'

    };

  }



  if (supportedCount > 0 || partialCount > 0) {

    return {

      status: 'PARTIALLY_SUPPORTED',

      evidenceCoverage: coverageRatio,

      rationale: `تم التحقق من دعم بعض عناصر الادعاء (${supportedCount} من أصل ${total})، بينما بقية العناصر تفتقر للإسناد المباشر أو تتطلب استئناسًا.`,

      evidenceRelation: 'PARTIAL_SUPPORT'

    };

  }



  return {

    status: 'INSUFFICIENT_EVIDENCE',

    evidenceCoverage: 0,

    rationale: 'لم يُعثر على أدلة مسندة كافية في المصادر المعتمدة تدعم عناصر هذا الادعاء.',

    evidenceRelation: 'UNVERIFIED'

  };

}
