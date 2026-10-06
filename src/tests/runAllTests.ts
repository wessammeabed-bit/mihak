import { runSemanticsAndStructuralTests } from './semanticsInvariants.test';
import { runRoutingAndExecutionTests } from './routingAndExecution.test';
import { runHadithPrecisionTests } from './hadithPrecision.test';

async function main() {
  try {
    await runSemanticsAndStructuralTests();
    await runRoutingAndExecutionTests();
    await runHadithPrecisionTests();
    process.exit(0);
  } catch (err) {
    console.error('Test suite failed:', err);
    process.exit(1);
  }
}

main();
