import { available, compare, partyOf, requireThat, type Context, type DomainModule } from '../contracts/ports';
import type { GameState } from '../contracts/schema';
type Loadouts = GameState['equipment'][string];
function permitted(ctx: Context<'equipment'>, characterId: string): void {
  const char = ctx.read().characters[characterId];
  requireThat(char?.controlled && char.locationId === ctx.read().haven.locationId, 'EQUIPMENT_ACCESS', 'Equipment changes require a controlled character at the haven');
  const party = partyOf(ctx.read(), characterId);
  requireThat(!party || party.mode === 'idle', 'CHARACTER_BUSY', 'Character is busy');
}
function activate(ctx: Context<'equipment'>, characterId: string, loadouts: Loadouts, target: 'work' | 'combat', policy: boolean): void {
  const previous = Object.entries(loadouts[loadouts.active]);
  const next = Object.entries(loadouts[target]);
  for (const [, itemId] of previous) {
    if (next.some(([, id]) => id === itemId)) continue;
    requireThat(!policy || !ctx.read().inventory[itemId]?.protected, 'ITEM_PROTECTED', 'Outfit cannot replace protected equipment');
    ctx.effect('inventory.unequip', { itemId });
  }
  for (const [slot, itemId] of next) {
    const item = ctx.read().inventory[itemId];
    requireThat(item && ctx.content.get(item.definitionId, 'item').equipSlot === slot, 'LOADOUT_UNAVAILABLE', 'Saved loadout item is missing or incompatible');
    if (item.location.kind === 'equipped' && item.location.characterId === characterId && item.location.slot === slot) continue;
    requireThat(!policy || !item.protected, 'ITEM_PROTECTED', 'Outfit cannot select protected stock');
    ctx.effect('inventory.equip', { itemId, characterId, slot });
  }
  loadouts.active = target; ctx.state[characterId] = loadouts;
}
function equip(ctx: Context<'equipment'>, p: { characterId: string; itemId: string; loadout: 'work' | 'combat' }, policy: boolean): void {
  permitted(ctx, p.characterId);
  const item = ctx.read().inventory[p.itemId]; requireThat(item, 'ITEM_MISSING', 'Item not found');
  const def = ctx.content.get(item.definitionId, 'item'); requireThat(def.equipSlot, 'NOT_EQUIPMENT', 'Item cannot be equipped');
  // Clone before editing so the previous active slot remains available to the swap planner.
  const existing = ctx.state[p.characterId] ?? { active: p.loadout, work: {}, combat: {} };
  const planned = structuredClone(existing);
  planned[p.loadout][def.equipSlot] = item.id;
  const oldId = existing[existing.active][def.equipSlot];
  if (oldId && oldId !== item.id) {
    requireThat(!policy || !ctx.read().inventory[oldId]?.protected, 'ITEM_PROTECTED', 'Outfit cannot replace protected equipment');
    ctx.effect('inventory.unequip', { itemId: oldId });
  }
  // The planner has already released the replaced slot, while other previous slots still matter.
  const previous = Object.entries(existing[existing.active]);
  for (const [slot, previousId] of previous) {
    if (slot === def.equipSlot || Object.values(planned[p.loadout]).includes(previousId)) continue;
    requireThat(!policy || !ctx.read().inventory[previousId]?.protected, 'ITEM_PROTECTED', 'Outfit cannot replace protected equipment');
    ctx.effect('inventory.unequip', { itemId: previousId });
  }
  for (const [slot, nextId] of Object.entries(planned[p.loadout])) {
    const next = ctx.read().inventory[nextId];
    requireThat(next && ctx.content.get(next.definitionId, 'item').equipSlot === slot, 'LOADOUT_UNAVAILABLE', 'Saved loadout item is missing or incompatible');
    if (next.location.kind === 'equipped' && next.location.characterId === p.characterId && next.location.slot === slot) continue;
    requireThat(!policy || !next.protected, 'ITEM_PROTECTED', 'Outfit cannot select protected stock');
    ctx.effect('inventory.equip', { itemId: nextId, characterId: p.characterId, slot });
  }
  planned.active = p.loadout; ctx.state[p.characterId] = planned;
  ctx.emit('equipment.changed', p.characterId);
}
export const equipment: DomainModule<'equipment'> = {
  id: 'equipment', slice: 'equipment', commands: {
    'equipment.equip'(ctx, p) { equip(ctx, p, false); },
    'outfits.apply'(ctx, p) {
      const item = Object.values(ctx.read().inventory).filter(i => i.definitionId === p.itemDefinitionId && available(i) && (i.ownerId === null || i.ownerId === p.characterId))
        .sort((a, b) => b.quality - a.quality || compare(a.id, b.id))[0];
      const loadouts = ctx.state[p.characterId], slot = ctx.content.get(p.itemDefinitionId, 'item').equipSlot;
      const currentId = slot && loadouts ? loadouts[loadouts.active][slot] : undefined;
      const current = currentId ? ctx.read().inventory[currentId] : undefined;
      if (loadouts?.active === p.loadout && current?.definitionId === p.itemDefinitionId && (!item || current.quality >= item.quality)) return;
      requireThat(item, 'OUTFIT_NO_STOCK', 'No eligible Outfit stock'); equip(ctx, { ...p, itemId: item.id }, true);
    },
    'equipment.unequip'(ctx, p) {
      permitted(ctx, p.characterId); const loadouts = ctx.state[p.characterId];
      const itemId = loadouts?.[loadouts.active][p.slot]; requireThat(itemId, 'SLOT_EMPTY', 'Slot is empty');
      ctx.effect('inventory.unequip', { itemId }); delete loadouts[loadouts.active][p.slot];
    },
    'equipment.activate'(ctx, p) {
      permitted(ctx, p.characterId); const loadouts = ctx.state[p.characterId];
      requireThat(loadouts, 'LOADOUT_MISSING', 'No saved loadout');
      if (loadouts.active !== p.loadout) activate(ctx, p.characterId, loadouts, p.loadout, false);
    },
  },
};
