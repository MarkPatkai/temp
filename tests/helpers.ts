import { readContent } from '../scripts/read-content';
import { LuaSandbox } from '../packages/scripting/index';
import { createGame, restoreGame } from '../packages/application/index';
import type { Engine } from '../packages/core/engine';
import type { Action, GameState } from '../packages/contracts/schema';
export const content = (await readContent()).registry;
export const scripts = new LuaSandbox();
export async function game(seed = 'test-seed') { return createGame(content, scripts, seed); }
export async function fixture(change: (state: GameState) => void) { const engine = await game(); const state = engine.snapshot(); change(state); return restoreGame(state, content, scripts); }
export async function send(engine: Engine, action: Action) {
  const result = await engine.dispatch({ id: `test-${Object.keys(engine.snapshot().receipts).length + 1}`, ...action });
  if (!result.ok) throw new Error(JSON.stringify(result)); return result;
}
export async function advance(engine: Engine, count: number) { const result = await engine.advanceTicks(count); if (!result.ok) throw new Error(result.error); }
export async function craft(engine: Engine) {
  await send(engine, { type: 'jobs.assign', payload: { characterId: 'character-1', facilityId: 'facility-1', protected: true, flexible: false } });
  await send(engine, { type: 'jobs.create', payload: { recipeId: 'base:recipe.sword', priority: 1 } }); await advance(engine, 5);
}
export async function encounter(engine: Engine, members = ['character-1', 'character-2', 'character-3']) {
  await send(engine, { type: 'parties.create', payload: { name: 'Test expedition', members } });
  const partyId = Object.keys(engine.snapshot().parties).at(-1)!;
  await send(engine, { type: 'travel.begin', payload: { partyId, destinationId: 'base:location.forest', waypoints: [] } });
  await advance(engine, 5); await send(engine, { type: 'exploration.start', payload: { partyId } }); await advance(engine, 3);
  await send(engine, { type: 'exploration.decide', payload: { partyId, decision: 'fight' } });
  return { partyId, combatId: Object.keys(engine.snapshot().combats).at(-1)! };
}
