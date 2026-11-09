import { requireThat, type DomainModule } from '../contracts/ports';
export const economy: DomainModule<'economy'> = {
  id: 'economy', slice: 'economy', effects: {
    'economy.change'(ctx, p) {
      requireThat(Number.isSafeInteger(p.amount) && ctx.state.gold + p.amount >= 0 && Number.isSafeInteger(ctx.state.gold + p.amount), 'TREASURY_FUNDS', 'Insufficient funds or invalid amount');
      ctx.state.gold += p.amount;
      ctx.state.ledger.push({ id: ctx.allocate('transaction'), tick: ctx.read().clock.tick, amount: p.amount, reason: p.reason });
      ctx.emit('economy.transaction-posted', p.reason);
    },
  },
};
