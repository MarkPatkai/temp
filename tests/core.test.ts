import { describe, it, expect } from 'vitest';
import { game, send, advance, content, scripts } from './helpers';
import { restoreGame } from '../packages/application/index';
import { next } from '../packages/core/rng';
import { canonical } from '../packages/contracts/validation';

describe('deterministic command and simulation core', () => {
  it('matches the xorshift32-v1 golden vector', () => {
    let value = 1; const vector = Array.from({ length: 5 }, () => value = next(value));
    expect(vector).toEqual([270369, 67634689, 2647435461, 307599695, 2398689233]);
  });
  it('initializes identical state from the same seed', async () => {
    const a = await game(), b = await game(); expect(canonical(a.snapshot())).toBe(canonical(b.snapshot()));
  });
  it('is independent of host tick batching', async () => {
    const a = await game(), b = await game(); await advance(a, 30); for (let i = 0; i < 6; i++) await advance(b, 5);
    expect(canonical(a.snapshot())).toBe(canonical(b.snapshot()));
  });
  it('rejects an invalid command without changing state or RNG', async () => {
    const engine = await game(), before = canonical(engine.snapshot());
    const result = await engine.dispatch({ id: 'bad', type: 'market.buy', payload: { marketId: 'base:market.town', itemId: 'base:item.wood', quantity: 1 } });
    expect(result).toMatchObject({ ok: false, code: 'MARKET_ACCESS' }); expect(canonical(engine.snapshot())).toBe(before);
  });
  it('deduplicates commands and rejects ID reuse with different content', async () => {
    const engine = await game(), command = { id: 'repeat', type: 'haven.build', payload: { facilityDefinitionId: 'base:facility.forge' } };
    expect(await engine.dispatch(command)).toMatchObject({ ok: true, duplicate: false }); const before = canonical(engine.snapshot());
    expect(await engine.dispatch(command)).toMatchObject({ ok: true, duplicate: true }); expect(canonical(engine.snapshot())).toBe(before);
    expect(await engine.dispatch({ ...command, type: 'clock.configure', payload: { paused: false, speed: 2 } })).toMatchObject({ ok: false, code: 'COMMAND_ID_REUSED' });
  });
  it('serializes concurrent dispatches at the transaction boundary', async () => {
    const engine = await game();
    const results = await Promise.all([engine.dispatch({ id: 'a', type: 'haven.build', payload: { facilityDefinitionId: 'base:facility.forge' } }), engine.dispatch({ id: 'b', type: 'haven.build', payload: { facilityDefinitionId: 'base:facility.forge' } })]);
    expect(results.map(r => r.ok)).toEqual([true, false]); expect(Object.keys(engine.snapshot().haven.facilities)).toHaveLength(2);
  });
  it('does not invent orders while time advances', async () => {
    const engine = await game(); await advance(engine, 50); const s = engine.snapshot();
    expect(s.jobs.orders).toEqual({}); expect(s.travel).toEqual({}); expect(s.equipment).toEqual({}); expect(s.economy.gold).toBe(100);
  });
  it('returns snapshots without mutable references and filters hidden traits', async () => {
    const engine = await game(), snapshot = engine.snapshot(); snapshot.characters['character-1'].hp = 0;
    expect(engine.snapshot().characters['character-1'].hp).toBe(40);
    expect(engine.snapshot().characters['character-1'].traits).toHaveLength(1); expect(engine.view().characters['character-1'].traits).toHaveLength(0);
  });
  it('rejects malformed state references during restoration', async () => {
    const state = (await game()).snapshot(); state.inventory['item-1'].ownerId = 'missing';
    expect(() => restoreGame(state, content, scripts)).toThrow('Item owner missing');
  });
  it('rejects reserved prototype keys', async () => {
    const engine = await game();
    expect(await engine.dispatch({ id: '__proto__', type: 'clock.configure', payload: { paused: true, speed: 1 } })).toMatchObject({ ok: false, code: 'SCHEMA_INVALID' });
  });
  it('rejects dictionary keys outside the declared ID schema', async () => {
    const state = (await game()).snapshot(); state.characters['bad key'] = { ...state.characters['character-1'], id: 'bad key' };
    expect(() => restoreGame(state, content, scripts)).toThrow('game state');
  });
});
