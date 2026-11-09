import { compare, partyOf, requireThat, type Context, type DomainModule } from '../contracts/ports';

function create(ctx: Context<'parties'>, p: { name: string; members: string[] }): string {
  requireThat(p.members.length > 0 && p.members.length <= 6 && new Set(p.members).size === p.members.length, 'PARTY_LIMIT', 'Party must have 1–6 unique members');
  const chars = p.members.map(id => ctx.read().characters[id]);
  requireThat(chars.every(c => c?.controlled && c.conscious && !c.resting), 'PARTY_CONTROL', 'Members must be controlled, conscious, and not resting');
  requireThat(chars.every(c => c.locationId === chars[0].locationId && !partyOf(ctx.read(), c.id)), 'PARTY_MEMBERSHIP', 'Members must be together and not in another party');
  requireThat(!Object.values(ctx.read().jobs.orders).some(o => o.status === 'running' && o.workerId && p.members.includes(o.workerId)), 'WORKER_BUSY', 'Cancel current work first');
  const id = ctx.allocate('party');
  ctx.state[id] = { id, name: p.name, members: [...p.members].sort(compare), rows: Object.fromEntries(p.members.map(id => [id, 'front' as const])),
    locationId: chars[0].locationId, visitId: ctx.allocate('visit'), encounterSafe: false, mode: 'idle', encounterId: null, explorationWork: 0 };
  ctx.emit('party.created', id); return id;
}
export const parties: DomainModule<'parties'> = {
  id: 'parties', slice: 'parties', commands: {
    'parties.create'(ctx, p) { create(ctx, p); },
    'parties.formation'(ctx, p) {
      const party = ctx.state[p.partyId];
      requireThat(party?.members.includes(p.characterId) && party.mode === 'idle', 'FORMATION_LOCKED', 'Formation can change only while idle');
      party.rows[p.characterId] = p.row;
    },
  }, effects: {
    'party.create': create,
    'party.mode'(ctx, p) {
      const party = ctx.state[p.partyId]; requireThat(party, 'PARTY_MISSING', 'Party not found');
      party.mode = p.mode; if (p.encounterId !== undefined) party.encounterId = p.encounterId;
    },
    'party.arrive'(ctx, p) {
      const party = ctx.state[p.partyId]; party.locationId = p.locationId;
      party.visitId = ctx.allocate('visit'); party.encounterSafe = false; party.explorationWork = 0;
      for (const member of party.members) ctx.effect('character.move', { characterId: member, locationId: p.locationId });
      ctx.emit('travel.arrived', p.locationId);
    },
    'party.explore'(ctx, p) {
      const party = ctx.state[p.partyId]; party.explorationWork = p.work;
      if (p.encounterId) { party.mode = 'encounter'; party.encounterId = p.encounterId; }
    },
    'party.post-combat'(ctx, p) {
      const party = ctx.state[p.partyId]; party.mode = 'post-combat'; party.encounterSafe = true; party.encounterId = null;
    },
  },
};
