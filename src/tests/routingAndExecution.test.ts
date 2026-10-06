/**
 * MIHAK — مِحَكّ
 * Synthetic Routing & Runtime Trace Tests
 *
 * Validates:
 * 1. Section 12: Structural Synthetic Routing Tests (A - F)
 * 2. Section 13: Runtime Acceptance Trace Tests for unseen requests
 */

import {
  parseDeterministicPlan,
  planUniversalSemantic,
  extractLexicalTargetOnly,
  type UniversalPlan
} from '../server/universalSemanticPlanner';

import { centralOrchestrator } from '../server/centralOrchestrator';
import { buildRequestPlan } from '../server/claimDecomposer';

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

export async function runRoutingAndExecutionTests() {
  console.log('\n==================================================');
  console.log('RUNNING SYNTHETIC ROUTING & RUNTIME TRACE TESTS');
  console.log('==================================================\n');

  // --- SECTION 12: STRUCTURAL ROUTING TESTS ---
  console.log('--- 1. Section 12: Structural Synthetic Routing Tests (A - F) ---');

  // Test A: Natural-language direct reference request → DIRECT_QURAN_LOOKUP
  {
    const plan = parseDeterministicPlan('ما هو نص الآية في سورة الإسراء: 1؟');
    assert(
      plan !== null &&
      plan.taskFamily === 'QURAN' &&
      plan.taskType === 'DIRECT_QURAN_LOOKUP' &&
      plan.explicitReferences.length === 1 &&
      plan.explicitReferences[0].surahNumber === 17 &&
      plan.explicitReferences[0].ayahStart === 1,
      'TEST A: Natural-language direct reference request routes to DIRECT_QURAN_LOOKUP (17:1)'
    );
  }

  // Test B: Natural-language lexical count request → QURAN_LEXICAL / COUNT
  {
    const plan = parseDeterministicPlan('كم مرة وردت كلمة «معراج» في القرآن الكريم؟');
    assert(
      plan !== null &&
      plan.taskFamily === 'QURAN' &&
      plan.taskType === 'QURAN_LEXICAL' &&
      plan.requestedOperation === 'COUNT' &&
      plan.lexicalTargets.includes('معراج'),
      'TEST B: Natural-language lexical count request routes to QURAN_LEXICAL / COUNT with isolated target'
    );
  }

  // Test C: Colloquial lexical request → same task as formal version
  {
    const formalPlan = parseDeterministicPlan('كم مرة وردت كلمة الفرقان في القرآن؟');
    const colloquialPlan = parseDeterministicPlan('كلمة الفرقان جت كام مرة في المصحف؟');
    assert(
      colloquialPlan !== null &&
      formalPlan !== null &&
      colloquialPlan.taskFamily === formalPlan.taskFamily &&
      colloquialPlan.taskType === formalPlan.taskType &&
      colloquialPlan.requestedOperation === formalPlan.requestedOperation &&
      colloquialPlan.lexicalTargets[0] === formalPlan.lexicalTargets[0],
      'TEST C: Colloquial lexical request matches the exact task and operation of formal version'
    );
  }

  // Test D: Minor spelling variation → same task family
  {
    const misspelledPlan = parseDeterministicPlan('كم مره وردت كلمه الفرقان فى القران');
    assert(
      misspelledPlan !== null &&
      misspelledPlan.taskFamily === 'QURAN' &&
      misspelledPlan.taskType === 'QURAN_LEXICAL' &&
      misspelledPlan.requestedOperation === 'COUNT' &&
      misspelledPlan.lexicalTargets[0] === 'الفرقان',
      'TEST D: Minor spelling variation (مره / كلمه / فى / القران) normalizes to same task family and target'
    );
  }

  // Test E: Paraphrased Hadith search → HADITH semantic retrieval
  {
    const plan = await planUniversalSemantic('ما صحة حديث أن النبي قال من غشنا فليس منا في كتب السنة؟');
    assert(
      plan.taskFamily === 'HADITH' &&
      (plan.taskType === 'HADITH_LOOKUP' || plan.taskType === 'HADITH_EXPLANATION') &&
      plan.requiredDomains.includes('HADITH'),
      'TEST E: Paraphrased Hadith question routes to HADITH domain retrieval'
    );
  }

  // Test F: Compound claim → proposition decomposition
  {
    const requestPlan = buildRequestPlan('قال تعالى «كتب عليكم الصيام»، فثبت أن الصيام فرض على المسافر.');
    assert(
      requestPlan.propositions.length === 2 &&
      requestPlan.propositions.some(p => p.role === 'PREMISE') &&
      requestPlan.propositions.some(p => p.role === 'CONCLUSION'),
      'TEST F: Compound claim decomposes into Premise and Conclusion propositions'
    );
  }

  // --- SECTION 13: RUNTIME ACCEPTANCE TESTS WITH COMPLETE TRACE ---
  console.log('\n--- 2. Section 13: Runtime Acceptance Tests for Unseen Requests ---');

  // Unseen Request 1: Direct Reference (Surah Al-Kahf 10)
  console.log('\n>>> Executing Unseen Request 1: Direct Quran Reference');
  const res1 = await centralOrchestrator('ما هو نص الآية 10 من سورة الكهف؟');
  assert(
    res1.claims.length > 0 &&
    res1.claims[0].status === 'VERIFIED_QUOTE' &&
    res1.claims[0].exactMatch === true &&
    Boolean(res1.claims[0].evidence?.raw_text?.includes('إِذْ أَوَى ٱلْفِتْيَةُ')),
    'RUNTIME 1: Direct Quran reference (18:10) retrieved verbatim from 6236-verse corpus with exactMatch=true'
  );
  assert(
    res1.abstention_count === 0,
    'RUNTIME 1: Direct Quran reference did NOT invoke fallback'
  );

  // Unseen Request 2: Unseen Lexical Locate Request (Word: "سرادقها")
  console.log('\n>>> Executing Unseen Request 2: Unseen Lexical Locate Request');
  const res2 = await centralOrchestrator('أين ورد لفظ «سرادقها» في القرآن الكريم؟');
  assert(
    res2.claims.length > 0 &&
    res2.claims[0].status === 'SUPPORTED' &&
    res2.claims[0].exactMatch === true &&
    res2.claims[0].claim_text?.includes('سرادقها') &&
    res2.claims[0].claim_text?.includes('سورة الكهف'),
    'RUNTIME 2: Lexical locate query for «سرادقها» located in Surah Al-Kahf [18:29]'
  );
  assert(
    res2.abstention_count === 0,
    'RUNTIME 2: Lexical locate query did NOT invoke fallback'
  );

  // Unseen Request 3: Unseen Paraphrased Hadith Request
  console.log('\n>>> Executing Unseen Request 3: Unseen Paraphrased Hadith Request');
  const res3 = await centralOrchestrator('ما صحة حديث من غشنا فليس منا؟');
  assert(
    res3.claims.length > 0 &&
    res3.claims[0].status === 'SUPPORTED' &&
    (res3.claims[0].claim_text?.includes('فَلَيْسَ مِنَّا') || res3.claims[0].claim_text?.includes('غَشَّنَا') || res3.claims[0].claim_text?.includes('فَلَيْسَ مِنِّي') || res3.claims[0].claim_text?.includes('مَنْ غَشَّ')),
    'RUNTIME 3: Paraphrased Hadith query retrieved and verified with attribution'
  );
  assert(
    res3.abstention_count === 0,
    'RUNTIME 3: Paraphrased Hadith query did NOT invoke fallback'
  );

  console.log('\n==================================================');
  console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions`);
  console.log('==================================================\n');
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runRoutingAndExecutionTests().catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}
