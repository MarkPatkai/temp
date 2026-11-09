import { available, compare, countItems, requireThat, type Context, type DomainModule } from '../contracts/ports';
import type { Item } from '../contracts/schema';

function eligible(ctx: Context<'inventory'>, itemId: string): Item {
  const item = ctx.state[itemId];
  requireThat(item && available(item), 'ITEM_UNAVAILABLE', 'Item must be unprotected, unreserved, and in storage');
  return item;
}
function consume(ctx: Context<'inventory'>, definitionId: string, quantity: number): void {
  requireThat(countItems(ctx.read(), definitionId) >= quantity, 'MATERIALS_MISSING', `Not enough ${definitionId}`);
  let remaining = quantity;
  for (const item of Object.values(ctx.state).sort((a, b) => compare(a.id, b.id))) {
    if (item.definitionId !== definitionId || !available(item) || item.ownerId !== null || remaining === 0) continue;
    const used = Math.min(remaining, item.quantity);
    item.quantity -= used; remaining -= used;
    if (item.quantity === 0) delete ctx.state[item.id];
  }
}
export const inventory: DomainModule<'inventory'> = {
  id: 'inventory', slice: 'inventory',
  commands: {
    'inventory.protect'(ctx, p) {
      const item = ctx.state[p.itemId];
      requireThat(item && !item.reservedBy, 'ITEM_UNAVAILABLE', 'Missing or reserved item');
      item.protected = p.protected;
    },
    'inventory.transfer'(ctx, p) {
      const item = eligible(ctx, p.itemId);
      requireThat(p.ownerId === null || ctx.read().characters[p.ownerId]?.controlled, 'OWNER_INVALID', 'Invalid item owner');
      item.ownerId = p.ownerId; ctx.emit('inventory.transferred', item.definitionId, item.quantity);
    },
    'inventory.split'(ctx, p) {
      const item = eligible(ctx, p.itemId);
      requireThat(p.quantity < item.quantity, 'STACK_QUANTITY', 'Split quantity must be less than stack size');
      item.quantity -= p.quantity;
      const id = ctx.allocate('item'); ctx.state[id] = { ...structuredClone(item), id, quantity: p.quantity };
    },
    'inventory.merge'(ctx, p) {
      requireThat(p.sourceId !== p.targetId, 'STACK_SAME', 'Choose two different stacks');
      const source = eligible(ctx, p.sourceId), target = eligible(ctx, p.targetId);
      const def = ctx.content.get(source.definitionId, 'item');
      requireThat(source.definitionId === target.definitionId && source.quality === target.quality && source.ownerId === target.ownerId,
        'STACK_INCOMPATIBLE', 'Stacks have different properties');
      requireThat(source.quantity + target.quantity <= def.stackLimit, 'STACK_LIMIT', 'Merged stack exceeds limit');
      target.quantity += source.quantity; delete ctx.state[source.id];
    },
    'inventory.claim'(ctx, p) {
      const item = ctx.state[p.itemId];
      requireThat(item?.location.kind === 'delivery' && p.quantity <= item.quantity, 'DELIVERY_INVALID', 'Invalid delivery claim');
      const def = ctx.content.get(item.definitionId, 'item');
      let remaining = p.quantity;
      for (const target of Object.values(ctx.state).sort((a, b) => compare(a.id, b.id))) {
        if (!available(target) || target.definitionId !== item.definitionId || target.quality !== item.quality || target.ownerId !== item.ownerId) continue;
        const move = Math.min(remaining, def.stackLimit - target.quantity);
        target.quantity += move; remaining -= move;
      }
      if (remaining) {
        if (remaining === item.quantity) item.location = { kind: 'storage' };
        else {
          const id = ctx.allocate('item'); ctx.state[id] = { ...structuredClone(item), id, quantity: remaining, location: { kind: 'storage' } };
          item.quantity -= remaining;
        }
      }
      // Quantity merged into existing stacks must be removed from the delivery too.
      const merged = p.quantity - remaining;
      item.quantity -= merged;
      if (item.quantity === 0) delete ctx.state[item.id];
      ctx.emit('inventory.delivery-claimed', item.definitionId, p.quantity);
    },
    'inventory.sell-surplus'(ctx, p) {
      const def = ctx.content.get(p.itemId, 'item');
      const amount = Math.max(0, countItems(ctx.read(), p.itemId) - p.keep);
      requireThat(amount > 0, 'NO_SURPLUS', 'No eligible surplus');
      // Personally owned stock is never automatically sold, even if it is otherwise available.
      consume(ctx, p.itemId, amount);
      ctx.effect('economy.change', { amount: amount * def.price, reason: 'surplus-sale' });
    },
  },
  effects: {
    'inventory.produce'(ctx, p) {
      const def = ctx.content.get(p.definitionId, 'item');
      requireThat(p.quantity > 0 && p.quantity <= 10000, 'PRODUCTION_LIMIT', 'Production quantity outside safe bounds');
      let remaining = p.quantity;
      const quality = def.equipSlot ? 90 + ctx.random('item-generation', 21) : 100;
      for (const stack of Object.values(ctx.state).sort((a, b) => compare(a.id, b.id))) {
        if (!available(stack) || stack.definitionId !== def.id || stack.ownerId !== (p.ownerId ?? null) || stack.quality !== quality) continue;
        const amount = Math.min(remaining, def.stackLimit - stack.quantity);
        stack.quantity += amount; remaining -= amount;
      }
      while (remaining > 0) {
        const slots = Object.values(ctx.state).filter(i => i.location.kind === 'storage').length;
        const location: Item['location'] = slots < ctx.read().haven.storageCapacity ? { kind: 'storage' } : { kind: 'delivery', deliveryId: ctx.allocate('delivery') };
        const id = ctx.allocate('item');
        ctx.state[id] = { id, definitionId: def.id, quantity: Math.min(remaining, def.stackLimit), quality,
          ownerId: p.ownerId ?? null, protected: false, reservedBy: null, location };
        remaining -= ctx.state[id].quantity;
      }
      ctx.emit('inventory.item-created', def.id, p.quantity);
    },
    'inventory.reserve'(ctx, p) {
      requireThat(countItems(ctx.read(), p.itemId) >= p.quantity, 'MATERIALS_MISSING', `Not enough ${p.itemId}`);
      let remaining = p.quantity;
      for (const item of Object.values(ctx.state).sort((a, b) => compare(a.id, b.id))) {
        if (remaining === 0 || item.definitionId !== p.itemId || !available(item) || item.ownerId !== null) continue;
        const amount = Math.min(remaining, item.quantity);
        if (amount === item.quantity) item.reservedBy = p.orderId;
        else {
          // Reserved split remains a physical storage stack and consumes a slot.
          item.quantity -= amount;
          const id = ctx.allocate('item'); ctx.state[id] = { ...structuredClone(item), id, quantity: amount, reservedBy: p.orderId };
        }
        remaining -= amount;
      }
    },
    'inventory.consume'(ctx, p) { for (const item of Object.values(ctx.state)) if (item.reservedBy === p.reservationId) delete ctx.state[item.id]; },
    'inventory.release'(ctx, p) { for (const item of Object.values(ctx.state)) if (item.reservedBy === p.reservationId) item.reservedBy = null; },
    'inventory.consume-quantity'(ctx, p) { consume(ctx, p.itemId, p.quantity); },
    'inventory.equip'(ctx, p) {
      const item = ctx.state[p.itemId];
      requireThat(item && item.location.kind === 'storage' && !item.reservedBy && (item.ownerId === null || item.ownerId === p.characterId), 'ITEM_UNAVAILABLE', 'Item is not available to equip');
      item.location = { kind: 'equipped', characterId: p.characterId, slot: p.slot };
    },
    'inventory.unequip'(ctx, p) {
      const item = ctx.state[p.itemId]; requireThat(item?.location.kind === 'equipped', 'ITEM_UNAVAILABLE', 'Item is not equipped');
      item.location = { kind: 'storage' };
    },
  },
};
