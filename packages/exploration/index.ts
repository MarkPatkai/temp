import { requireThat, type DomainModule } from '../contracts/ports';
// Exploration progress belongs to party activity state; this module changes it via party effects.
export const exploration: DomainModule<'world'> = {
  id: 'exploration', slice: 'world', commands: {
    'exploration.start'(ctx, p) {
      const party = ctx.read().parties[p.partyId];
      requireThat(party && ['idle', 'post-combat'].includes(party.mode), 'PARTY_BUSY', 'Party cannot explore now');
      requireThat(party.members.some(id => ctx.read().characters[id].conscious), 'PARTY_INCAPACITATED', 'No conscious party member');
      requireThat(party.members.every(id => !ctx.read().characters[id].resting), 'PARTY_RESTING', 'Stop resting before exploring');
      ctx.effect('party.mode', { partyId: party.id, mode: 'exploring', encounterId: null });
    },
    'exploration.stop'(ctx, p) {
      requireThat(ctx.read().parties[p.partyId]?.mode === 'exploring', 'EXPLORATION_MISSING', 'Party is not exploring');
      ctx.effect('party.mode', { partyId: p.partyId, mode: 'idle' });
    },
    'exploration.decide'(ctx, p) {
      const party = ctx.read().parties[p.partyId];
      requireThat(party?.mode === 'encounter' && party.encounterId, 'ENCOUNTER_MISSING', 'No pending encounter');
      if (p.decision === 'fight') ctx.effect('combat.start', { partyId: party.id, encounterId: party.encounterId });
      else {
        // Foundation avoid/retreat are deterministic local disengagements; no unrequested travel.
        ctx.effect('party.mode', { partyId: party.id, mode: 'idle', encounterId: null });
        ctx.emit(`exploration.${p.decision}`, party.locationId);
      }
    },
  }, tick(ctx) {
    for (const party of Object.values(ctx.read().parties).sort((a, b) => a.id < b.id ? -1 : 1)) {
      if (party.mode !== 'exploring') continue;
      const location = ctx.content.get(party.locationId, 'location');
      const work = party.explorationWork + 1;
      if (work < location.explorationWork) { ctx.effect('party.explore', { partyId: party.id, work, encounterId: null }); continue; }
      const encounterId = !party.encounterSafe ? location.encounterId : null;
      ctx.effect('party.explore', { partyId: party.id, work: 0, encounterId });
      ctx.emit('exploration.surveyed', location.id);
      if (encounterId) { ctx.emit('exploration.encounter-requested', encounterId); ctx.notify('Encounter awaits Fight, Avoid, or Retreat.', party.id, 'exploration.decide', 'decision'); }
    }
  },
};
