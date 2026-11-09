import { requireThat, type DomainModule } from '../contracts/ports';
export const haven: DomainModule<'haven'> = {
  id: 'haven', slice: 'haven', commands: {
    'haven.build'(ctx, p) {
      const def = ctx.content.get(p.facilityDefinitionId, 'facility');
      requireThat(Object.values(ctx.state.facilities).filter(f => f.definitionId === def.id).length < def.instanceLimit,
        'FACILITY_LIMIT', 'Facility instance limit reached');
      // Foundation construction is instantaneous and free; timed construction is deferred.
      const id = ctx.allocate('facility'); ctx.state.facilities[id] = { id, definitionId: def.id };
      ctx.emit('haven.facility-built', def.id);
    },
  }, effects: {
    'haven.research'(ctx, p) { if (!ctx.state.researched.includes(p.id)) ctx.state.researched.push(p.id); },
  },
};
