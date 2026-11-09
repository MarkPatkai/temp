import { compare, requireThat, type DomainModule } from '../contracts/ports';
export const recruitment: DomainModule<'recruitment'> = {
  id: 'recruitment', slice: 'recruitment', commands: {
    'recruitment.accept'(ctx, p) {
      const def = ctx.content.get(p.recruitId, 'recruit');
      requireThat(!ctx.state[def.id], 'RECRUIT_DUPLICATE', 'Recruitment already accepted');
      const template = ctx.content.get(def.characterId, 'character');
      requireThat(template.category === 'permanent' || template.category === 'subcontractor' || template.category === 'external', 'RECRUIT_CATEGORY', 'Category does not allow voluntary recruitment');
      ctx.effect('economy.change', { amount: -def.fee, reason: 'recruitment-fee' });
      if (template.category === 'external') {
        for (const output of def.serviceOutputs) ctx.effect('inventory.produce', { definitionId: output.itemId, quantity: output.quantity });
        ctx.state[def.id] = { definitionId: def.id, characterId: 'external-service', arrivalTick: ctx.read().clock.tick, arrived: true };
        ctx.emit('contractor.service-completed', def.id); return;
      }
      const characterId = ctx.effect('character.spawn', { definitionId: def.characterId, locationId: def.originId, controlled: false }) as string;
      ctx.state[def.id] = { definitionId: def.id, characterId, arrivalTick: ctx.read().clock.tick + def.travelTicks, arrived: false };
    },
  }, tick(ctx) {
    for (const recruit of Object.values(ctx.state).sort((a, b) => compare(a.definitionId, b.definitionId))) {
      if (recruit.arrived || ctx.read().clock.tick < recruit.arrivalTick) continue;
      const def = ctx.content.get(recruit.definitionId, 'recruit'); recruit.arrived = true;
      ctx.effect('character.move', { characterId: recruit.characterId, locationId: ctx.read().haven.locationId });
      ctx.effect('character.recruit', { characterId: recruit.characterId });
      if (ctx.content.get(def.characterId, 'character').category === 'subcontractor') ctx.effect('contract.create', {
        characterId: recruit.characterId, wage: def.wagePerDay, minimumEnd: ctx.read().clock.tick + def.minimumDays * 600 });
      const host = Object.values(ctx.read().characters).filter(c => c.controlled && c.id !== recruit.characterId).sort((a, b) => compare(a.id, b.id))[0];
      if (host) ctx.effect('relationship.adjust', { from: recruit.characterId, to: host.id, amount: 5 });
      ctx.emit('recruitment.arrived', def.id); ctx.notify('A recruit has arrived.', recruit.characterId);
    }
  },
};
export const contracts: DomainModule<'contracts'> = {
  id: 'contracts', slice: 'contracts', commands: {
    'contracts.pay'(ctx, p) {
      const contract = ctx.state[p.contractId]; requireThat(contract && contract.accrued > 0, 'CONTRACT_PAYMENT', 'No accrued obligation');
      ctx.effect('economy.change', { amount: -contract.accrued, reason: 'wages' }); contract.accrued = 0; contract.suspended = false;
    },
  }, effects: {
    'contract.create'(ctx, p) { const id = ctx.allocate('contract'); ctx.state[id] = { characterId: p.characterId, wage: p.wage, accrued: 0, minimumEnd: p.minimumEnd, suspended: false }; },
  }, tick(ctx) {
    if (ctx.read().clock.tick % 600 !== 0) return;
    for (const id of Object.keys(ctx.state).sort()) {
      const contract = ctx.state[id]; contract.accrued += contract.wage; contract.suspended = contract.accrued > 0;
      if (contract.suspended) ctx.notify('Wages are due; contractual work is suspended.', id, 'contracts.pay', 'decision');
    }
  },
};
