import { describe, it, expect } from 'vitest';
import { advance, craft, fixture, game, send } from './helpers';
import { canonical } from '../packages/contracts/validation';
import { countItems } from '../packages/contracts/ports';

describe('haven work and inventory', () => {
  it('reserves inputs and completes real work while retaining a protected assignment', async () => {
    const engine = await game(); await craft(engine); const state = engine.snapshot();
    expect(countItems(state, 'base:item.wood')).toBe(7); expect(countItems(state, 'base:item.iron')).toBe(6);
    expect(countItems(state, 'base:item.sword')).toBe(2); expect(state.characters['character-1'].xp).toBe(10);
    expect(state.jobs.assignments['character-1'].protected).toBe(true); expect(Object.values(state.inventory).every(i => !i.reservedBy)).toBe(true);
  });
  it('cancels execution without consuming reserved inputs', async () => {
    const engine = await game();
    await send(engine, { type: 'jobs.assign', payload: { characterId: 'character-1', facilityId: 'facility-1', protected: true, flexible: false } });
    await send(engine, { type: 'jobs.create', payload: { recipeId: 'base:recipe.sword', priority: 1 } }); await advance(engine, 1);
    expect(Object.values(engine.snapshot().inventory).some(i => i.reservedBy === 'order-1')).toBe(true);
    await send(engine, { type: 'jobs.cancel', payload: { orderId: 'order-1' } });
    expect(countItems(engine.snapshot(), 'base:item.wood')).toBe(10);
  });
  it('distinguishes facility workstations and maximum workers', async () => {
    const engine = await game();
    for (const characterId of ['character-1', 'character-2']) await send(engine, { type: 'jobs.assign', payload: { characterId, facilityId: 'facility-1', protected: true, flexible: false } });
    for (let i = 0; i < 2; i++) await send(engine, { type: 'jobs.create', payload: { recipeId: 'base:recipe.sword', priority: 1 } });
    await advance(engine, 1); expect(Object.values(engine.snapshot().jobs.orders).filter(o => o.status === 'running')).toHaveLength(1);
  });
  it('research completes through work and unlocks a reusable world condition', async () => {
    const engine = await game(); await send(engine, { type: 'jobs.assign', payload: { characterId: 'character-1', facilityId: 'facility-1', protected: true, flexible: false } });
    await send(engine, { type: 'research.start', payload: { researchId: 'base:research.paths', priority: 1 } }); await advance(engine, 5);
    expect(engine.snapshot().world.unlocked).toContain('base:unlock.dungeon'); expect(engine.snapshot().haven.researched).toContain('base:research.paths');
  });
  it('splits and merges compatible stacks without changing quantity', async () => {
    const engine = await game(); await send(engine, { type: 'inventory.split', payload: { itemId: 'item-1', quantity: 3 } });
    const split = Object.values(engine.snapshot().inventory).find(i => i.id !== 'item-1' && i.definitionId === 'base:item.wood')!;
    await send(engine, { type: 'inventory.merge', payload: { sourceId: split.id, targetId: 'item-1' } }); expect(engine.snapshot().inventory['item-1'].quantity).toBe(10);
  });
  it('rejects a split beyond storage capacity atomically', async () => {
    const engine = await fixture(s => s.haven.storageCapacity = 4), before = canonical(engine.snapshot());
    expect(await engine.dispatch({ id: 'split', type: 'inventory.split', payload: { itemId: 'item-1', quantity: 1 } })).toMatchObject({ ok: false, code: 'STORAGE_FULL' });
    expect(canonical(engine.snapshot())).toBe(before);
  });
  it('routes purchased stock to delivery and permits partial claims', async () => {
    const engine = await fixture(s => { s.haven.storageCapacity = 4; s.inventory['item-1'].quantity = 20; s.characters['character-1'].locationId = 'base:location.town'; });
    await send(engine, { type: 'market.open', payload: { marketId: 'base:market.town', negotiatorId: 'character-1' } });
    await send(engine, { type: 'market.buy', payload: { marketId: 'base:market.town', itemId: 'base:item.wood', quantity: 3 } });
    const delivery = Object.values(engine.snapshot().inventory).find(i => i.location.kind === 'delivery')!; expect(delivery.quantity).toBe(3);
    await send(engine, { type: 'inventory.sell-surplus', payload: { itemId: 'base:item.iron', keep: 0 } });
    await send(engine, { type: 'inventory.claim', payload: { itemId: delivery.id, quantity: 1 } });
    expect(engine.snapshot().inventory[delivery.id].quantity).toBe(2); expect(countItems(engine.snapshot(), 'base:item.wood')).toBe(21);
  });
  it('enforces ownership and prevents protected Outfit replacement', async () => {
    const engine = await game(); await send(engine, { type: 'inventory.transfer', payload: { itemId: 'item-3', ownerId: 'character-2' } });
    expect(await engine.dispatch({ id: 'equip-owned', type: 'equipment.equip', payload: { characterId: 'character-1', itemId: 'item-3', loadout: 'combat' } })).toMatchObject({ ok: false });
    await send(engine, { type: 'equipment.equip', payload: { characterId: 'character-2', itemId: 'item-3', loadout: 'combat' } });
    await send(engine, { type: 'inventory.protect', payload: { itemId: 'item-3', protected: true } });
    await craft(engine); const before = canonical(engine.snapshot());
    expect(await engine.dispatch({ id: 'outfit-protected', type: 'outfits.apply', payload: { characterId: 'character-2', itemDefinitionId: 'base:item.sword', loadout: 'work' } })).toMatchObject({ ok: false, code: 'ITEM_PROTECTED' });
    expect(canonical(engine.snapshot())).toBe(before);
  });
  it('keeps equipped items outside storage and rejects double equipment claims', async () => {
    const engine = await game(); await send(engine, { type: 'equipment.equip', payload: { characterId: 'character-1', itemId: 'item-3', loadout: 'combat' } });
    expect(Object.values(engine.snapshot().inventory).filter(i => i.location.kind === 'storage')).toHaveLength(3);
    expect(await engine.dispatch({ id: 'double-equip', type: 'equipment.equip', payload: { characterId: 'character-2', itemId: 'item-3', loadout: 'combat' } })).toMatchObject({ ok: false });
  });
  it('switches multi-slot saved loadouts atomically', async () => {
    const engine = await game();
    await send(engine, { type: 'equipment.equip', payload: { characterId: 'character-1', itemId: 'item-3', loadout: 'combat' } });
    await send(engine, { type: 'equipment.equip', payload: { characterId: 'character-1', itemId: 'item-4', loadout: 'combat' } });
    await send(engine, { type: 'equipment.activate', payload: { characterId: 'character-1', loadout: 'work' } });
    expect(engine.snapshot().inventory['item-3'].location.kind).toBe('storage');
    await send(engine, { type: 'equipment.activate', payload: { characterId: 'character-1', loadout: 'combat' } });
    expect(engine.snapshot().inventory['item-3'].location.kind).toBe('equipped'); expect(engine.snapshot().inventory['item-4'].location.kind).toBe('equipped');
  });
  it('rolls back the whole loadout switch if one saved item became unavailable', async () => {
    const engine = await game();
    await send(engine, { type: 'equipment.equip', payload: { characterId: 'character-1', itemId: 'item-3', loadout: 'combat' } });
    await send(engine, { type: 'equipment.activate', payload: { characterId: 'character-1', loadout: 'work' } });
    await send(engine, { type: 'equipment.equip', payload: { characterId: 'character-2', itemId: 'item-3', loadout: 'combat' } });
    const before = canonical(engine.snapshot());
    expect(await engine.dispatch({ id: 'stale-loadout', type: 'equipment.activate', payload: { characterId: 'character-1', loadout: 'combat' } })).toMatchObject({ ok: false });
    expect(canonical(engine.snapshot())).toBe(before);
  });
  it('recovers through explicitly ordered rest and restores consciousness at 25 percent HP', async () => {
    const engine = await fixture(s => { s.characters['character-1'].hp = 0; s.characters['character-1'].conscious = false; });
    await advance(engine, 10); expect(engine.snapshot().characters['character-1'].hp).toBe(0);
    await send(engine, { type: 'characters.rest', payload: { characterId: 'character-1' } }); await advance(engine, 10);
    expect(engine.snapshot().characters['character-1']).toMatchObject({ hp: 10, conscious: true, resting: true });
    await send(engine, { type: 'characters.stop-rest', payload: { characterId: 'character-1' } });
    expect(engine.snapshot().characters['character-1'].resting).toBe(false);
  });
  it('designates a persistent PC without limiting global management commands', async () => {
    const engine = await game();
    await send(engine, { type: 'characters.designate-pc', payload: { characterId: 'character-2' } });
    await craft(engine); expect(engine.snapshot().playerCharacterId).toBe('character-2'); expect(engine.snapshot().characters['character-1'].xp).toBe(10);
  });
});
