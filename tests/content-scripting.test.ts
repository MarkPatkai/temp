import { describe, it, expect } from 'vitest';
import { stringify } from 'yaml';
import { readContent } from '../scripts/read-content';
import { ContentRegistry } from '../packages/content/index';
import { scripts } from './helpers';

const snapshot = { tick: 3, questId: 'quest-1', objectivesComplete: true, itemCounts: { 'base:item.wood': 2 } };
describe('content loading', () => {
  it('validates JSON and YAML through the same schema and reference lifecycle', async () => {
    const { text, files, registry } = await readContent();
    const equivalent = { ...files }; equivalent['items/items.json'] = JSON.stringify(JSON.parse(files['items/items.json']));
    expect((await ContentRegistry.load(text, equivalent)).fingerprint).toBe(registry.fingerprint);
    const manifest = JSON.parse(text); manifest.files = manifest.files.map((p: string) => p === 'items/items.json' ? 'items/items.yaml' : p);
    equivalent['items/items.yaml'] = stringify(JSON.parse(files['items/items.json']));
    const yaml = await ContentRegistry.load(JSON.stringify(manifest), equivalent);
    expect(yaml.list('item')).toEqual(registry.list('item')); expect(yaml.list('quest')).toEqual(registry.list('quest'));
  });
  it('rejects missing references with the owning definition ID', async () => {
    const { text, files } = await readContent(), values = JSON.parse(files['haven/recipes.json']); values[0].facilityId = 'missing';
    await expect(ContentRegistry.load(text, { ...files, 'haven/recipes.json': JSON.stringify(values) })).rejects.toThrow('base:recipe.sword');
  });
  it('rejects duplicate definitions and unknown fields', async () => {
    const { text, files } = await readContent(), values = JSON.parse(files['items/items.json']);
    await expect(ContentRegistry.load(text, { ...files, 'items/items.json': JSON.stringify([...values, values[0]]) })).rejects.toThrow('duplicate');
    values[0].arbitraryCode = 'no'; await expect(ContentRegistry.load(text, { ...files, 'items/items.json': JSON.stringify(values) })).rejects.toThrow('additional properties');
  });
  it('rejects YAML aliases and executable tags', async () => {
    const { text, files } = await readContent();
    await expect(ContentRegistry.load(text, { ...files, 'quests/foundation.yaml': '- &a {id: test}\n- *a' })).rejects.toThrow();
    await expect(ContentRegistry.load(text, { ...files, 'quests/foundation.yaml': '!!js/function function(){}' })).rejects.toThrow();
  });
});
describe('real Lua sandbox', () => {
  it('validates syntax and exports before initialization without running interactions', async () => {
    await expect(scripts.validate('function run(ctx) error("interaction must not execute during validation") end', 'condition')).resolves.toBeUndefined();
    await expect(scripts.validate('function broken(', 'condition')).rejects.toThrow();
    await expect(scripts.validate('local value = 1', 'condition')).rejects.toThrow('missing run export');
  });
  it('evaluates snapshot queries and returns bounded allowed effect intents', async () => {
    expect(await scripts.condition('function run(ctx) return ctx.inventory.count("base:item.wood") == 2 and ctx.clock.tick() == 3 end', snapshot)).toBe(true);
    expect(await scripts.effect('function run(ctx) return {ctx.effects.request("quests.claim", {questId=ctx.subject.quest_instance_id})} end', snapshot)).toEqual([{ type: 'quests.claim', questId: 'quest-1' }]);
  });
  it('exposes no OS, filesystem, dynamic loader, debug, JS proxy, or random source', async () => {
    expect(await scripts.condition('function run(ctx) return os == nil and io == nil and require == nil and debug == nil and load == nil and package == nil and js == nil and math.random == nil and _G == nil end', snapshot)).toBe(true);
  });
  it('enforces an instruction quota for infinite loops', async () => {
    await expect(scripts.condition('function run(ctx) while true do end end', snapshot)).rejects.toThrow('instruction quota');
  });
  it('enforces a memory quota', async () => {
    await expect(scripts.condition('function run(ctx) local s="x"; for i=1,30 do s=s..s end return true end', snapshot)).rejects.toThrow();
  });
  it('rejects context writes, condition effects, and wrong return types', async () => {
    await expect(scripts.condition('function run(ctx) ctx.subject.quest_instance_id="bad" return true end', snapshot)).rejects.toThrow('read-only');
    await expect(scripts.condition('function run(ctx) return ctx.effects.request("quests.claim",{questId="quest-1"}) end', snapshot)).rejects.toThrow('conditions cannot');
    await expect(scripts.condition('function run(ctx) return 1 end', snapshot)).rejects.toThrow('boolean');
  });
  it('rejects cyclic results and out-of-scope effects', async () => {
    await expect(scripts.effect('function run(ctx) local a={} a[1]=a return a end', snapshot)).rejects.toThrow('cyclic');
    await expect(scripts.effect('function run(ctx) return {{type="quests.claim",questId="other"}} end', snapshot)).rejects.toThrow('out-of-scope');
  });
  it('uses a fresh invocation environment', async () => {
    expect(await scripts.condition('function run(ctx) secret=42 return true end', snapshot)).toBe(true);
    expect(await scripts.condition('function run(ctx) return secret == nil end', snapshot)).toBe(true);
  });
});
