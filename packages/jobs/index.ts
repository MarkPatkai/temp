import { available, compare, countItems, isAvailable, requireThat, type Context, type DomainModule } from '../contracts/ports';
import type { Order } from '../contracts/schema';

function create(ctx: Context<'jobs'>, kind: 'craft' | 'research', definitionId: string, priority: number): void {
  const def = ctx.content.get(definitionId, kind === 'craft' ? 'recipe' : 'research');
  const facility = Object.values(ctx.read().haven.facilities).filter(f => f.definitionId === def.facilityId).sort((a, b) => compare(a.id, b.id))[0];
  requireThat(facility, 'FACILITY_MISSING', 'Required facility is missing');
  if (kind === 'research') requireThat(!ctx.read().haven.researched.includes(definitionId) &&
    !Object.values(ctx.state.orders).some(o => o.definitionId === definitionId && ['waiting', 'running'].includes(o.status)), 'RESEARCH_DUPLICATE', 'Research already completed or ordered');
  const id = ctx.allocate('order');
  ctx.state.orders[id] = { id, definitionId, kind, status: 'waiting', workerId: null,
    facilityId: facility.id, work: 0, required: def.work, priority };
  ctx.emit('job.ordered', definitionId);
}
export const jobs: DomainModule<'jobs'> = {
  id: 'jobs', slice: 'jobs', commands: {
    'jobs.assign'(ctx, p) {
      requireThat(isAvailable(ctx.read(), p.characterId), 'WORKER_UNAVAILABLE', 'Worker is not available at the haven');
      requireThat(ctx.read().haven.facilities[p.facilityId], 'FACILITY_MISSING', 'Facility not found');
      ctx.state.assignments[p.characterId] = { facilityId: p.facilityId, protected: p.protected, flexible: p.flexible };
    },
    'jobs.unassign'(ctx, p) {
      requireThat(!Object.values(ctx.state.orders).some(o => o.workerId === p.characterId && o.status === 'running'), 'WORKER_BUSY', 'Cancel current work first');
      delete ctx.state.assignments[p.characterId];
    },
    'jobs.create'(ctx, p) { create(ctx, 'craft', p.recipeId, p.priority); },
    'research.start'(ctx, p) { create(ctx, 'research', p.researchId, p.priority); },
    'jobs.cancel'(ctx, p) {
      const order = ctx.state.orders[p.orderId];
      requireThat(order && ['waiting', 'running'].includes(order.status), 'ORDER_INVALID', 'Order is not active');
      ctx.effect('inventory.release', { reservationId: order.id });
      order.status = 'cancelled'; order.workerId = null;
    },
  },
  tick(ctx) {
    for (const order of Object.values(ctx.state.orders).sort((a, b) => compare(a.id, b.id))) {
      if (order.status !== 'running' || !order.workerId || !isAvailable(ctx.read(), order.workerId)) continue;
      const char = ctx.read().characters[order.workerId];
      const bonus = char.traits.reduce((n, t) => n + t.workBonus, 0);
      const skill = order.kind === 'craft' ? ctx.content.get(order.definitionId, 'recipe').skill : 'research';
      const rate = Math.max(1, Math.floor(char.workRate * (10000 + bonus + Math.floor((char.skills[skill] ?? 0) / 100) * 100) / 10000));
      order.work = Math.min(order.required, order.work + rate);
      if (order.work < order.required) continue;
      if (order.kind === 'craft') {
        ctx.effect('inventory.consume', { reservationId: order.id });
        const recipe = ctx.content.get(order.definitionId, 'recipe');
        for (const output of recipe.outputs) ctx.effect('inventory.produce', { definitionId: output.itemId, quantity: output.quantity });
      } else {
        const research = ctx.content.get(order.definitionId, 'research');
        ctx.effect('haven.research', { id: research.id }); ctx.effect('world.unlock', { id: research.unlockId });
      }
      ctx.effect('character.reward', { characterId: order.workerId, xp: 10, skill });
      order.status = 'completed'; order.workerId = null;
      ctx.emit('job.completed', order.definitionId); ctx.notify(`Work completed: ${order.definitionId}`, order.id);
    }
  },
  schedule(ctx) {
    const running = Object.values(ctx.state.orders).filter(o => o.status === 'running');
    const busy = new Set(running.map(o => o.workerId));
    const waiting = Object.values(ctx.state.orders).filter(o => o.status === 'waiting').sort((a, b) => b.priority - a.priority || compare(a.id, b.id));
    for (const order of waiting) {
      const facility = ctx.read().haven.facilities[order.facilityId];
      const def = ctx.content.get(facility.definitionId, 'facility');
      if (running.filter(o => o.facilityId === facility.id).length >= Math.min(def.workstations, def.maxWorkers)) continue;
      const worker = Object.values(ctx.read().characters).filter(c => {
        if (!isAvailable(ctx.read(), c.id) || busy.has(c.id)) return false;
        const assignment = ctx.state.assignments[c.id];
        return assignment && (assignment.facilityId === facility.id || (!assignment.protected && assignment.flexible));
      }).sort((a, b) => b.workRate - a.workRate || compare(a.id, b.id))[0];
      if (!worker || !canReserve(ctx, order)) continue;
      if (order.kind === 'craft') for (const input of ctx.content.get(order.definitionId, 'recipe').inputs)
        ctx.effect('inventory.reserve', { itemId: input.itemId, quantity: input.quantity, orderId: order.id });
      order.workerId = worker.id; order.status = 'running'; busy.add(worker.id); running.push(order);
      ctx.emit('job.started', order.definitionId);
    }
  },
};
function canReserve(ctx: Context<'jobs'>, order: Order): boolean {
  if (order.kind !== 'craft') return true;
  const totals: Record<string, number> = {};
  for (const q of ctx.content.get(order.definitionId, 'recipe').inputs) totals[q.itemId] = (totals[q.itemId] ?? 0) + q.quantity;
  let extraSlots = 0;
  for (const [id, quantity] of Object.entries(totals)) {
    const stock = Object.values(ctx.read().inventory).filter(i => i.definitionId === id && available(i) && i.ownerId === null).sort((a, b) => compare(a.id, b.id));
    if (stock.reduce((n, i) => n + i.quantity, 0) < quantity || countItems(ctx.read(), id) < quantity) return false;
    let remaining = quantity;
    for (const item of stock) { const amount = Math.min(item.quantity, remaining); if (amount > 0 && amount < item.quantity) extraSlots++; remaining -= amount; }
  }
  return Object.values(ctx.read().inventory).filter(i => i.location.kind === 'storage').length + extraSlots <= ctx.read().haven.storageCapacity;
}
