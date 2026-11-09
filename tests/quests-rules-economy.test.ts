import { describe, it, expect } from 'vitest';
import { game, send, craft, fixture, advance, content, scripts } from './helpers';
import { restoreGame } from '../packages/application/index';
import { canonical } from '../packages/contracts/validation';
import { countItems } from '../packages/contracts/ports';
import type { Rule } from '../packages/contracts/schema';

function productionRule(): Rule { return { id: 'rule-maintain', enabled: true, priority: 1,
  trigger: { kind: 'interval', ticks: 1 }, condition: { itemId: 'base:item.sword', below: 3 },
  action: { type: 'jobs.create', payload: { recipeId: 'base:recipe.sword', priority: 1 } },
  cooldownTicks: 1, lastTick: -1, lastEvent: 0, lastError: null }; }
describe('quest semantics', () => {
  it('counts historical work while excluding it from a newly commissioned objective', async () => {
    const engine = await game(); await craft(engine);
    await send(engine, { type: 'quests.accept', payload: { questDefinitionId: 'base:quest.history' } });
    await send(engine, { type: 'quests.accept', payload: { questDefinitionId: 'base:quest.foundation' } });
    expect(engine.snapshot().quests['quest-1']).toMatchObject({ status: 'ready', progress: { craft: 1 } });
    expect(engine.snapshot().quests['quest-2'].progress['forge'] ?? 0).toBe(0);
  });
  it('consumes resources and rewards exactly once', async () => {
    const engine = await game(); await send(engine, { type: 'quests.accept', payload: { questDefinitionId: 'base:quest.supplies' } });
    await send(engine, { type: 'quests.claim', payload: { questId: 'quest-1' } });
    expect(countItems(engine.snapshot(), 'base:item.wood')).toBe(7); expect(engine.snapshot().economy.gold).toBe(108);
    const before = canonical(engine.snapshot());
    expect(await engine.dispatch({ id: 'again', type: 'quests.claim', payload: { questId: 'quest-1' } })).toMatchObject({ ok: false, code: 'QUEST_STATE' });
    expect(canonical(engine.snapshot())).toBe(before);
  });
  it('rechecks world-state objectives when claiming', async () => {
    const engine = await game(); await send(engine, { type: 'quests.accept', payload: { questDefinitionId: 'base:quest.supplies' } });
    await send(engine, { type: 'inventory.sell-surplus', payload: { itemId: 'base:item.wood', keep: 0 } });
    expect(await engine.dispatch({ id: 'missing', type: 'quests.claim', payload: { questId: 'quest-1' } })).toMatchObject({ ok: false, code: 'QUEST_INCOMPLETE' });
  });
  it('allocates an exclusive historical event only once within a group', async () => {
    const engine = await fixture(s => { s.lastEventSequence++; s.history.push({ id: `event-${s.lastEventSequence}`, sequence: s.lastEventSequence, tick: 0, type: 'combat.victory', subjectId: 'base:encounter.wolves', quantity: 1, cause: 'fixture' }); });
    await send(engine, { type: 'quests.accept', payload: { questDefinitionId: 'base:quest.exclusive-a' } });
    await send(engine, { type: 'quests.accept', payload: { questDefinitionId: 'base:quest.exclusive-b' } });
    expect(engine.snapshot().quests['quest-1'].status).toBe('ready'); expect(engine.snapshot().quests['quest-2'].status).toBe('active');
  });
  it('rolls back a complete Lua effect batch when a later intent fails', async () => {
    const batchScript = 'function run(ctx) local a=ctx.effects.request("quests.claim",{questId=ctx.subject.quest_instance_id}); return {a,{type="quests.claim",questId=ctx.subject.quest_instance_id}} end';
    const base = await game(), state = base.snapshot();
    const wrapped = { validate: scripts.validate.bind(scripts), condition: scripts.condition.bind(scripts), effect: () => scripts.effect(batchScript, { tick: 0, questId: 'quest-1', objectivesComplete: true, itemCounts: {} }) };
    const engine = restoreGame(state, content, wrapped);
    await send(engine, { type: 'quests.accept', payload: { questDefinitionId: 'base:quest.supplies' } }); const before = canonical(engine.snapshot());
    expect(await engine.dispatch({ id: 'script-batch', type: 'scripts.execute', payload: { scriptId: 'base:script.claim-quest', questId: 'quest-1' } })).toMatchObject({ ok: false });
    expect(canonical(engine.snapshot())).toBe(before);
  });
});
describe('rules and economy', () => {
  it('creates authorized orders only while a rule is enabled and avoids duplicate pending work', async () => {
    const engine = await game(); await send(engine, { type: 'rules.create', payload: { rule: productionRule() } }); await advance(engine, 5);
    expect(Object.values(engine.snapshot().jobs.orders)).toHaveLength(1);
    await send(engine, { type: 'rules.enable', payload: { ruleId: 'rule-maintain', enabled: false } }); await advance(engine, 5);
    expect(Object.values(engine.snapshot().jobs.orders)).toHaveLength(1);
  });
  it('rejects combat automation in the rule schema', async () => {
    const engine = await game(), rule = { ...productionRule(), action: { type: 'combat.escape', payload: { combatId: 'combat-1', actorId: 'character-1' } } };
    expect(await engine.dispatch({ id: 'combat-rule', type: 'rules.create', payload: { rule } })).toMatchObject({ ok: false, code: 'SCHEMA_INVALID' });
  });
  it('executes an event-triggered surplus instruction only after its qualifying event', async () => {
    const engine = await game(), rule = productionRule();
    rule.trigger = { kind: 'event', event: 'job.completed' }; rule.condition = { itemId: null, below: 0 };
    rule.action = { type: 'inventory.sell-surplus', payload: { itemId: 'base:item.sword', keep: 1 } };
    await send(engine, { type: 'rules.create', payload: { rule } });
    expect(engine.snapshot().economy.gold).toBe(100); await craft(engine);
    expect(engine.snapshot().economy.gold).toBe(125); expect(countItems(engine.snapshot(), 'base:item.sword')).toBe(1);
  });
  it('rolls back failed rule actions while retaining the trigger diagnostic', async () => {
    const engine = await fixture(s => { s.haven.storageCapacity = 4; s.inventory['item-1'].quantity = 20; });
    const rule = productionRule(); rule.condition = { itemId: null, below: 0 }; rule.action = { type: 'market.buy', payload: { marketId: 'base:market.town', itemId: 'base:item.wood', quantity: 1 } };
    await send(engine, { type: 'rules.create', payload: { rule } }); await advance(engine, 1);
    expect(engine.snapshot().economy.gold).toBe(100); expect(engine.snapshot().rules[rule.id].lastError).toContain('MARKET_ACCESS'); expect(engine.snapshot().clock.tick).toBe(1);
  });
  it('purchases only with physical access and respects stock and treasury', async () => {
    const engine = await fixture(s => { s.characters['character-1'].locationId = 'base:location.town'; s.economy.gold = 1; });
    await send(engine, { type: 'market.open', payload: { marketId: 'base:market.town', negotiatorId: 'character-1' } }); const before = canonical(engine.snapshot());
    expect(await engine.dispatch({ id: 'too-expensive', type: 'market.buy', payload: { marketId: 'base:market.town', itemId: 'base:item.wood', quantity: 1 } })).toMatchObject({ ok: false, code: 'TREASURY_FUNDS' });
    expect(canonical(engine.snapshot())).toBe(before); expect(engine.snapshot().travel).toEqual({});
  });
  it('arrives through simulated time, accrues wages, suspends work, and pays existing obligations', async () => {
    const engine = await game(); await send(engine, { type: 'recruitment.accept', payload: { recruitId: 'base:recruit.rowan' } });
    expect(engine.snapshot().recruitment['base:recruit.rowan'].arrived).toBe(false); expect(engine.snapshot().characters['character-4'].locationId).toBe('base:location.town');
    await advance(engine, 9); expect(engine.snapshot().characters['character-4']).toMatchObject({ controlled: true, locationId: 'base:location.haven' });
    await advance(engine, 591); expect(engine.snapshot().contracts['contract-1']).toMatchObject({ accrued: 4, suspended: true });
    expect(engine.snapshot().economy.gold).toBe(90); await send(engine, { type: 'contracts.pay', payload: { contractId: 'contract-1' } });
    expect(engine.snapshot().economy.gold).toBe(86); expect(engine.snapshot().contracts['contract-1'].suspended).toBe(false);
  });
  it('fulfills an external service without occupying a workstation', async () => {
    const engine = await game(); await send(engine, { type: 'recruitment.accept', payload: { recruitId: 'base:recruit.supplier' } });
    expect(countItems(engine.snapshot(), 'base:item.wood')).toBe(12); expect(Object.keys(engine.snapshot().characters)).toHaveLength(3);
    expect(engine.snapshot().jobs.orders).toEqual({});
  });
});
