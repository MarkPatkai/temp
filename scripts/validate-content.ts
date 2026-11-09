import { readContent } from './read-content';
import { LuaSandbox } from '../packages/scripting/index';
const { registry } = await readContent();
const lua = new LuaSandbox();
for (const def of registry.list('script')) {
  await lua.validate(registry.script(def.file), def.mode);
  const snapshot = { tick: 0, questId: 'quest-validation', objectivesComplete: true, itemCounts: {} };
  if (def.mode === 'condition') await lua.condition(registry.script(def.file), snapshot);
  else await lua.effect(registry.script(def.file), snapshot);
}
console.log(`Validated content and script exports. SHA-256: ${registry.fingerprint}`);
