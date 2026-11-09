import { describe, it, expect } from 'vitest';
import { content, advance, encounter, game, send } from './helpers';
import { fastestRoute } from '../packages/travel/index';
import { canonical } from '../packages/contracts/validation';

describe('world, exploration, and combat', () => {
  it('chooses the fastest eligible route and honors access conditions', async () => {
    const state = (await game()).snapshot();
    expect(fastestRoute(content, state, 'base:location.haven', 'base:location.town')).toEqual(['base:connection.haven-forest', 'base:connection.forest-town']);
    expect(() => fastestRoute(content, state, 'base:location.haven', 'base:location.dungeon')).toThrow('No accessible route');
  });
  it('cancels travel at the next connected node without teleporting', async () => {
    const engine = await game(); await send(engine, { type: 'parties.create', payload: { name: 'Travelers', members: ['character-1'] } });
    await send(engine, { type: 'travel.begin', payload: { partyId: 'party-1', destinationId: 'base:location.town', waypoints: [] } });
    await advance(engine, 1); await send(engine, { type: 'travel.cancel', payload: { partyId: 'party-1' } }); await advance(engine, 4);
    expect(engine.snapshot().parties['party-1']).toMatchObject({ locationId: 'base:location.forest', mode: 'idle' });
    expect(engine.snapshot().characters['character-1'].locationId).toBe('base:location.forest');
  });
  it('persists an encounter decision without choosing a combat action', async () => {
    const engine = await game(); await send(engine, { type: 'parties.create', payload: { name: 'Travelers', members: ['character-1'] } });
    await send(engine, { type: 'travel.begin', payload: { partyId: 'party-1', destinationId: 'base:location.forest', waypoints: [] } }); await advance(engine, 5);
    await send(engine, { type: 'exploration.start', payload: { partyId: 'party-1' } }); await advance(engine, 20);
    expect(engine.snapshot().parties['party-1'].mode).toBe('encounter'); expect(engine.snapshot().combats).toEqual({});
  });
  it('world ticks do not advance battle initiative, actor, or rounds', async () => {
    const engine = await game(), { combatId } = await encounter(engine), before = canonical(engine.snapshot().combats[combatId]);
    await advance(engine, 50); expect(canonical(engine.snapshot().combats[combatId])).toBe(before);
  });
  it('rejects ordinary melee behind a conscious frontline without spending RNG or resources', async () => {
    const engine = await game(), { combatId } = await encounter(engine), s = engine.snapshot(), b = s.combats[combatId];
    const before = canonical(s);
    expect(await engine.dispatch({ id: 'protected', type: 'combat.act', payload: { combatId, actorId: b.initiative[0], targetId: b.enemies[1], abilityId: 'base:ability.slash' } })).toMatchObject({ ok: false, code: 'COMBAT_TARGET' });
    expect(canonical(engine.snapshot())).toBe(before);
  });
  it('extended melee bypasses a protected row according to reach', async () => {
    const engine = await game(), { combatId } = await encounter(engine), b = engine.snapshot().combats[combatId];
    await send(engine, { type: 'combat.act', payload: { combatId, actorId: b.initiative[0], targetId: b.enemies[1], abilityId: 'base:ability.reach' } });
    expect(engine.snapshot().characters[b.enemies[1]].hp).toBeLessThan(20);
  });
  it('incapacitates at zero HP and permits attacks after frontline collapse without moving rows', async () => {
    const engine = await game(), { combatId } = await encounter(engine); let b = engine.snapshot().combats[combatId];
    await send(engine, { type: 'combat.act', payload: { combatId, actorId: b.initiative[b.turnIndex], targetId: b.enemies[0], abilityId: 'base:ability.slash' } });
    b = engine.snapshot().combats[combatId];
    await send(engine, { type: 'combat.act', payload: { combatId, actorId: b.initiative[b.turnIndex], targetId: b.enemies[0], abilityId: 'base:ability.slash' } });
    const state = engine.snapshot(); b = state.combats[combatId]; expect(state.characters[b.enemies[0]]).toMatchObject({ hp: 0, conscious: false }); expect(b.rows[b.enemies[1]]).toBe('back');
    await send(engine, { type: 'combat.act', payload: { combatId, actorId: b.initiative[b.turnIndex], targetId: b.enemies[1], abilityId: 'base:ability.slash' } });
    expect(engine.snapshot().characters[b.enemies[1]].hp).toBeLessThan(20);
  });
  it('requires fresh allied input and blocks public enemy-controller impersonation', async () => {
    const engine = await game(), { combatId } = await encounter(engine);
    expect(await engine.enemyTurn(combatId, 'enemy-on-allied')).toMatchObject({ ok: false, code: 'COMBAT_ALLIED_MANUAL' });
    expect(await engine.dispatch({ id: 'fake-controller', type: 'combat.enemy-turn', payload: { combatId } })).toMatchObject({ ok: false, code: 'COMMAND_AUTHORITY' });
  });
  it('keeps two simultaneous battles independent', async () => {
    const engine = await game(), a = await encounter(engine, ['character-1']), b = await encounter(engine, ['character-2']);
    const other = canonical(engine.snapshot().combats[b.combatId]), battle = engine.snapshot().combats[a.combatId];
    await send(engine, { type: 'combat.act', payload: { combatId: a.combatId, actorId: battle.initiative[0], targetId: battle.enemies[0], abilityId: 'base:ability.slash' } });
    expect(canonical(engine.snapshot().combats[b.combatId])).toBe(other);
  });
});
