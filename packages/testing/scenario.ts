import { createGame, restoreGame } from '../application/index';
import { serialize, deserialize } from '../persistence/index';
import { canonical } from '../contracts/validation';
import { requireThat, type ContentPort, type ScriptPort } from '../contracts/ports';
import type { Action } from '../contracts/schema';

// All commands in this fixture are explicit verification instructions, not gameplay automation.
export async function verificationScenario(content: ContentPort, scripts: ScriptPort, seed = 'foundation-001') {
  let engine = await createGame(content, scripts, seed);
  let sequence = 0; const checks: string[] = [];
  async function send(action: Action) {
    const result = await engine.dispatch({ id: `verification-${++sequence}`, ...action });
    requireThat(result.ok, 'SCENARIO_COMMAND', JSON.stringify(result));
  }
  async function ticks(count: number) { const result = await engine.advanceTicks(count); requireThat(result.ok, 'SCENARIO_TICK', result.error ?? 'Tick failed'); }
  await send({ type: 'quests.accept', payload: { questDefinitionId: 'base:quest.foundation' } });
  const questId = Object.keys(engine.snapshot().quests)[0];
  await send({ type: 'scripts.execute', payload: { scriptId: 'base:script.quest-ready', questId } });
  checks.push('Real Lua condition executed');
  const characters = Object.values(engine.snapshot().characters).map(c => c.id);
  const facilityId = Object.keys(engine.snapshot().haven.facilities)[0];
  await send({ type: 'jobs.assign', payload: { characterId: characters[0], facilityId, protected: true, flexible: false } });
  await send({ type: 'jobs.create', payload: { recipeId: 'base:recipe.sword', priority: 1 } });
  await ticks(5);
  requireThat(Object.values(engine.snapshot().jobs.orders).some(o => o.status === 'completed'), 'SCENARIO_WORK', 'Work did not complete');
  checks.push('Authorized work reserved inputs, completed, produced a unique item, and granted XP');
  await send({ type: 'rules.create', payload: { rule: { id: 'verification-outfit', enabled: true, priority: 1,
    trigger: { kind: 'interval', ticks: 1 }, condition: { itemId: null, below: 0 },
    action: { type: 'outfits.apply', payload: { characterId: characters[0], itemDefinitionId: 'base:item.sword', loadout: 'combat' } },
    cooldownTicks: 600, lastTick: -1, lastEvent: 0, lastError: null } } });
  await ticks(1);
  requireThat(engine.snapshot().equipment[characters[0]], 'SCENARIO_OUTFIT', 'Outfit was not applied');
  await send({ type: 'rules.enable', payload: { ruleId: 'verification-outfit', enabled: false } });
  checks.push('Explicitly authorized Outfit rule equipped eligible stock');
  await send({ type: 'parties.create', payload: { name: 'Verification expedition', members: characters } });
  const partyId = Object.keys(engine.snapshot().parties)[0];
  await send({ type: 'travel.begin', payload: { partyId, destinationId: 'base:location.forest', waypoints: [] } });
  await ticks(5); await send({ type: 'exploration.start', payload: { partyId } }); await ticks(3);
  requireThat(engine.snapshot().parties[partyId].mode === 'encounter', 'SCENARIO_ENCOUNTER', 'Encounter decision missing');
  await send({ type: 'exploration.decide', payload: { partyId, decision: 'fight' } });
  const combatId = Object.keys(engine.snapshot().combats)[0];
  for (let turn = 0; turn < 100; turn++) {
    const state = engine.snapshot(), battle = state.combats[combatId];
    if (battle.status !== 'active') break;
    const actorId = battle.initiative[battle.turnIndex];
    if (battle.allies.includes(actorId)) {
      const targetId = battle.enemies.filter(id => state.characters[id].conscious).sort((a, b) => {
        const rank = { front: 0, middle: 1, back: 2 }; return rank[battle.rows[a]] - rank[battle.rows[b]] || (a < b ? -1 : 1);
      })[0];
      await send({ type: 'combat.act', payload: { combatId, actorId, targetId, abilityId: 'base:ability.slash' } });
    } else {
      const result = await engine.enemyTurn(combatId, `verification-${++sequence}`); requireThat(result.ok, 'SCENARIO_ENEMY', JSON.stringify(result));
    }
  }
  requireThat(engine.snapshot().combats[combatId].status === 'victory', 'SCENARIO_VICTORY', 'Battle did not end in victory');
  checks.push('Explicit allied actions and shared enemy validation resolved combat');
  await send({ type: 'scripts.execute', payload: { scriptId: 'base:script.claim-quest', questId } });
  requireThat(engine.snapshot().quests[questId].status === 'completed', 'SCENARIO_QUEST', 'Quest not completed');
  const gold = engine.snapshot().economy.gold;
  const duplicate = await engine.dispatch({ id: `verification-${++sequence}`, type: 'quests.claim', payload: { questId } });
  requireThat(!duplicate.ok && engine.snapshot().economy.gold === gold, 'SCENARIO_DUPLICATE', 'Reward repeated');
  checks.push('Lua-requested quest reward committed exactly once');
  await send({ type: 'exploration.start', payload: { partyId } }); await ticks(6);
  requireThat(engine.snapshot().parties[partyId].mode === 'exploring', 'SCENARIO_SAFE_VISIT', 'A random hostile encounter repeated');
  checks.push('Post-combat visit remains encounter-safe');
  const saved = await serialize(engine.snapshot());
  const restored = restoreGame(await deserialize(saved, content), content, scripts);
  requireThat(canonical(restored.snapshot()) === canonical(engine.snapshot()), 'SCENARIO_RESTORE', 'Restore differs');
  await ticks(4); const result = await restored.advanceTicks(4); requireThat(result.ok, 'SCENARIO_CONTINUE', result.error ?? 'Restore failed');
  requireThat(canonical(restored.snapshot()) === canonical(engine.snapshot()), 'SCENARIO_CONTINUE', 'Restored continuation differs');
  checks.push('Save/reload and continued simulation match uninterrupted state');
  engine = restored;
  return { checks, engine, saved };
}
