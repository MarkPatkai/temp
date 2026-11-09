import { compare, requireThat, type ContentPort, type DomainModule } from '../contracts/ports';
import type { DeepReadonly, GameState } from '../contracts/schema';

export function fastestRoute(content: ContentPort, state: DeepReadonly<GameState>, from: string, to: string): string[] {
  content.get(from, 'location'); content.get(to, 'location');
  const edges = content.list('connection').filter(e => !e.requiredUnlock || state.world.unlocked.includes(e.requiredUnlock));
  const queue = [{ node: from, cost: 0, route: [] as string[] }];
  const settled = new Set<string>();
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost || compare(a.route.join('|'), b.route.join('|')) || compare(a.node, b.node));
    const current = queue.shift()!;
    if (settled.has(current.node)) continue;
    if (current.node === to) return current.route;
    settled.add(current.node);
    for (const edge of edges) {
      const next = edge.from === current.node ? edge.to : edge.to === current.node ? edge.from : null;
      if (next && !settled.has(next)) queue.push({ node: next, cost: current.cost + edge.ticks, route: [...current.route, edge.id] });
    }
  }
  throw new Error(`No accessible route from ${from} to ${to}`);
}
export const travel: DomainModule<'travel'> = {
  id: 'travel', slice: 'travel', commands: {
    'travel.begin'(ctx, p) {
      const party = ctx.read().parties[p.partyId];
      requireThat(party && ['idle', 'post-combat'].includes(party.mode), 'PARTY_BUSY', 'Party cannot travel now');
      requireThat(party.members.every(id => ctx.read().characters[id].conscious && !ctx.read().characters[id].resting), 'PARTY_INCAPACITATED', 'Recover members and stop resting first');
      requireThat(!Object.values(ctx.read().jobs.orders).some(o => o.status === 'running' && o.workerId && party.members.includes(o.workerId)), 'WORKER_BUSY', 'Cancel work before traveling');
      let from = party.locationId; const route: string[] = [];
      for (const waypoint of [...p.waypoints, p.destinationId]) {
        route.push(...fastestRoute(ctx.content, ctx.read(), from, waypoint)); from = waypoint;
      }
      requireThat(route.length > 0, 'TRAVEL_SAME', 'Already at destination');
      ctx.state[party.id] = { partyId: party.id, route, edgeIndex: 0, progress: 0, stopRequested: false };
      ctx.effect('party.mode', { partyId: party.id, mode: 'travel' });
    },
    'travel.cancel'(ctx, p) { const journey = ctx.state[p.partyId]; requireThat(journey, 'TRAVEL_MISSING', 'No active journey'); journey.stopRequested = true; },
  }, tick(ctx) {
    for (const id of Object.keys(ctx.state).sort()) {
      const journey = ctx.state[id], edge = ctx.content.get(journey.route[journey.edgeIndex], 'connection');
      journey.progress++;
      if (journey.progress < edge.ticks) continue;
      const party = ctx.read().parties[journey.partyId];
      const destination = party.locationId === edge.from ? edge.to : edge.from;
      ctx.effect('party.arrive', { partyId: party.id, locationId: destination });
      journey.edgeIndex++; journey.progress = 0;
      if (journey.stopRequested || journey.edgeIndex === journey.route.length) {
        ctx.effect('party.mode', { partyId: party.id, mode: 'idle' }); delete ctx.state[id];
      }
    }
  },
};
