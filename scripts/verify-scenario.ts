import { readContent } from './read-content';
import { LuaSandbox } from '../packages/scripting/index';
import { verificationScenario } from '../packages/testing/scenario';
import { canonical, sha256 } from '../packages/contracts/validation';
const { registry } = await readContent();
const result = await verificationScenario(registry, new LuaSandbox());
console.log(result.checks.map(c => `PASS ${c}`).join('\n'));
console.log(`Final state SHA-256: ${await sha256(canonical(result.engine.snapshot()))}`);
