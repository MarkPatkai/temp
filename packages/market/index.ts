import { requireThat, type Context, type DomainModule } from '../contracts/ports';
function access(ctx: Context<'markets'>, marketId: string): void {
  const def = ctx.content.get(marketId, 'market'), session = ctx.state[marketId];
  const negotiator = session?.negotiatorId ? ctx.read().characters[session.negotiatorId] : null;
  requireThat(negotiator?.controlled && negotiator.conscious && negotiator.locationId === def.locationId, 'MARKET_ACCESS', 'An eligible negotiator must be physically present');
}
export const market: DomainModule<'markets'> = {
  id: 'market', slice: 'markets', commands: {
    'market.open'(ctx, p) {
      const def = ctx.content.get(p.marketId, 'market'), char = ctx.read().characters[p.negotiatorId];
      requireThat(char?.controlled && char.conscious && char.locationId === def.locationId, 'MARKET_ACCESS', 'Negotiator must be at the market');
      ctx.state[p.marketId].negotiatorId = char.id;
    },
    'market.buy'(ctx, p) {
      access(ctx, p.marketId); const session = ctx.state[p.marketId], def = ctx.content.get(p.itemId, 'item');
      requireThat((session.stock[p.itemId] ?? 0) >= p.quantity, 'MARKET_STOCK', 'Insufficient merchant stock');
      const negotiator = ctx.read().characters[session.negotiatorId!];
      const discount = Math.min(2000, Math.floor((negotiator.skills['bartering'] ?? 0) / 100) * 100);
      const price = Math.max(1, Math.floor(def.price * (10000 - discount) / 10000));
      ctx.effect('economy.change', { amount: -price * p.quantity, reason: 'market-purchase' });
      session.stock[p.itemId] -= p.quantity;
      ctx.effect('inventory.produce', { definitionId: p.itemId, quantity: p.quantity });
      ctx.emit('market.purchased', p.itemId, p.quantity);
    },
  }, tick(ctx) {
    for (const [id, session] of Object.entries(ctx.state).sort(([a], [b]) => a < b ? -1 : 1)) {
      if (ctx.read().clock.tick < session.nextRefresh) continue;
      const def = ctx.content.get(id, 'market');
      session.stock = Object.fromEntries(def.stock.map(q => [q.itemId, q.quantity]));
      session.nextRefresh += def.refreshTicks;
    }
  },
};
