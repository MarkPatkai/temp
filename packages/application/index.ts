import { Engine, bind } from '../core/engine';
import { assertState } from '../core/invariants';
import { characters, relationships } from '../characters/index';
import { haven } from '../haven/index';
import { jobs } from '../jobs/index';
import { inventory } from '../inventory/index';
import { equipment } from '../equipment/index';
import { economy } from '../economy/index';
import { market } from '../market/index';
import { recruitment, contracts } from '../recruitment/index';
import { world } from '../world/index';
import { parties } from '../parties/index';
import { travel } from '../travel/index';
import { exploration } from '../exploration/index';
import { combat } from '../combat/index';
import { quests, contributions } from '../quests/index';
import { rules } from '../rules/index';
import { requireThat, type ContentPort, type ScriptPort } from '../contracts/ports';
import type { GameState } from '../contracts/schema';

function modules() {
  // Tick phases: needs/health + obligations → arrivals → travel → work → exploration → rules → scheduling.
  return [bind(characters), bind(contracts), bind(recruitment), bind(travel), bind(jobs), bind(exploration),
    bind(market), bind(haven), bind(inventory), bind(equipment), bind(economy), bind(relationships),
    bind(world), bind(parties), bind(combat), bind(quests), bind(contributions), bind(rules)];
}
export function restoreGame(state: GameState, content: ContentPort, scripts: ScriptPort): Engine {
  assertState(state, content); return new Engine(state, content, scripts, modules());
}
export async function createGame(content: ContentPort, scripts: ScriptPort, seed: string, startId = 'base:start.default'): Promise<Engine> {
  requireThat(seed.length > 0 && seed.length <= 120, 'SEED_INVALID', 'Seed must contain 1–120 characters');
  for (const def of content.list('script')) await scripts.validate(content.script(def.file), def.mode);
  const start = content.get(startId,'start');
  const state: GameState = { schemaVersion: 1, engineVersion: '0.1.0-alpha.1', contentFingerprint: content.fingerprint,
    seed, playerCharacterId: null, counters: {}, rng: {}, clock: { tick: 0, paused: true, speed: 1 }, characters: {}, relationships: {}, recruitment: {}, contracts: {},
    haven: { locationId: start.locationId, storageCapacity: start.storageCapacity, facilities: {}, researched: [] },
    jobs: { assignments: {}, orders: {} }, inventory: {}, equipment: {}, economy: { gold: start.gold, ledger: [] }, markets: {},
    world: { discovered: [start.locationId], unlocked: [] }, parties: {}, travel: {}, combats: {}, quests: {}, rules: {}, notifications: [],
    history: [], contributions: {}, receipts: {}, events: [], lastEventSequence: 0 };
  for (const def of content.list('market')) state.markets[def.id] = { stock: Object.fromEntries(def.stock.map(q => [q.itemId, q.quantity])), nextRefresh: def.refreshTicks, negotiatorId: null };
  const engine = new Engine(state, content, scripts, modules()); await engine.initialize(start.id); return engine;
}
