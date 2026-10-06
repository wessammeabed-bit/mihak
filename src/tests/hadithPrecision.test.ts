import { centralOrchestrator } from '../server/centralOrchestrator';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Test failed: ${message}`);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

export async function runHadithPrecisionTests() {
  console.log('\n==================================================');
  console.log('RUNNING HADITH PRECISION & GATE ACCEPTANCE TESTS');
  console.log('==================================================\n');

  let passed = 0;
  let total = 0;

  function runAssert(cond: boolean, msg: string) {
    total++;
    assert(cond, msg);
    passed++;
  }

  // Category 1: Exact Hadith Wording
  console.log('--- 1. Exact Hadith Wording ---');
  const resExact = await centralOrchestrator('حديث «إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى»');
  runAssert(
    resExact.claims.length > 0 &&
    (resExact.claims[0].status === 'SUPPORTED' || resExact.claims[0].status === 'VERIFIED_QUOTE') &&
    resExact.abstention_count === 0,
    'Exact Hadith wording returns verified record without abstention'
  );
  runAssert(
    Boolean(resExact.claims[0].evidence?.source_name?.includes('HadeethEnc')),
    'Exact Hadith evidence source is HadeethEnc'
  );

  // Category 2: Close Paraphrase
  console.log('\n--- 2. Close Paraphrase ---');
  const resClose = await centralOrchestrator('ما هو الحديث النبوي في أن مدار الأعمال على نية صاحبها؟');
  runAssert(
    resClose.claims.length > 0 &&
    (resClose.claims[0].status === 'SUPPORTED' || resClose.claims[0].status === 'VERIFIED_QUOTE') &&
    resClose.abstention_count === 0,
    'Close paraphrase retrieves verified Hadith record'
  );

  // Category 3: Egyptian Arabic Paraphrase (The failure case reported by user)
  console.log('\n--- 3. Egyptian Arabic Paraphrase ---');
  const resEgypt = await centralOrchestrator('فين الحديث اللي معناه إن قيمة العمل بتكون على حسب نية الشخص؟');
  runAssert(
    resEgypt.claims.length > 0 &&
    (resEgypt.claims[0].status === 'SUPPORTED' || resEgypt.claims[0].status === 'VERIFIED_QUOTE') &&
    resEgypt.abstention_count === 0,
    'Egyptian dialect query retrieves semantically correct record'
  );
  runAssert(
    !resEgypt.claims[0].claim_text?.includes('لا حسد إلا في اثنتين') &&
    (resEgypt.claims[0].claim_text?.includes('الْأَعْمَالُ') || resEgypt.claims[0].claim_text?.includes('الأعمال بالنيات')),
    'False positive record 488 (لا حسد) is rejected in favor of actions/intentions record'
  );

  // Category 4: Gulf Arabic Paraphrase
  console.log('\n--- 4. Gulf Arabic Paraphrase ---');
  const resGulf = await centralOrchestrator('وش الحديث اللي يقول إن الأعمال بنياتها ولكل شخص ما نوى؟');
  runAssert(
    resGulf.claims.length > 0 &&
    (resGulf.claims[0].status === 'SUPPORTED' || resGulf.claims[0].status === 'VERIFIED_QUOTE') &&
    resGulf.abstention_count === 0,
    'Gulf dialect query routes and retrieves canonical Hadith'
  );

  // Category 5: English Paraphrase
  console.log('\n--- 5. English Paraphrase ---');
  const resEn = await centralOrchestrator('Which hadith states that actions are judged according to intentions?');
  runAssert(
    resEn.claims.length > 0 &&
    (resEn.claims[0].status === 'SUPPORTED' || resEn.claims[0].status === 'VERIFIED_QUOTE') &&
    resEn.abstention_count === 0,
    'English paraphrase produces Arabic search queries and retrieves canonical record'
  );

  // Category 6: Proverb Falsely Attributed as Hadith (Must safely abstain!)
  console.log('\n--- 6. Falsely Attributed Proverb ---');
  const resProverb = await centralOrchestrator('الوقاية خير من العلاج هل هو حديث نبوي شريف؟');
  runAssert(
    resProverb.abstention_count > 0 &&
    resProverb.claims[0]?.status === 'INSUFFICIENT_EVIDENCE',
    'Falsely attributed proverb fails semantic relation gate and abstains safely'
  );
  runAssert(
    !resProverb.claims[0]?.evidence,
    'No spurious evidence is attached to unverified proverb'
  );

  // Category 7: Unrelated Religious Question (Must safely abstain!)
  console.log('\n--- 7. Unrelated Religious Question ---');
  const resUnrelated = await centralOrchestrator('هل ورد حديث صحيح يقول إنه يجب هدم المنازل القديمة كل مائة عام؟');
  runAssert(
    resUnrelated.abstention_count > 0 &&
    resUnrelated.claims[0]?.status === 'INSUFFICIENT_EVIDENCE',
    'Unrelated religious statement abstains with INSUFFICIENT_EVIDENCE'
  );

  // Category 8: Ambiguous Paraphrase
  console.log('\n--- 8. Ambiguous Paraphrase ---');
  const resAmbiguous = await centralOrchestrator('حديث عن شيء ما سيحدث يوما ما في مكان ما');
  runAssert(
    resAmbiguous.abstention_count > 0 &&
    (resAmbiguous.claims[0]?.status === 'INSUFFICIENT_EVIDENCE' || resAmbiguous.claims[0]?.status === 'SOURCE_COVERAGE_GAP'),
    'Ambiguous query does not return weak random candidate; it abstains'
  );

  // Category 9: UI Format Compliance
  console.log('\n--- 9. UI Format Compliance ---');
  const formattedText = resEgypt.claims[0]?.claim_text || '';
  runAssert(
    formattedText.startsWith('س:') &&
    formattedText.includes('ج:\n• نص الحديث:') &&
    formattedText.includes('المصدر:'),
    'Hadith result follows clean specified display format (س / ج / المصدر)'
  );

  console.log('\n==================================================');
  console.log(`ALL HADITH PRECISION TESTS PASSED: ${passed} / ${total} assertions`);
  console.log('==================================================\n');
}
