import { countItems, requireThat, type Context, type DomainModule } from '../contracts/ports';
import type { DomainEvent } from '../contracts/schema';
async function evaluate(ctx: Context<'rules'>, event?: DomainEvent): Promise<void> {
  const ids = Object.values(ctx.state).sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1)).map(r => r.id);
  for (const id of ids) {
    const rule = ctx.state[id], tick = ctx.read().clock.tick;
    if (!rule.enabled || (rule.lastTick >= 0 && tick - rule.lastTick < rule.cooldownTicks)) continue;
    if (event ? rule.trigger.kind !== 'event' || rule.trigger.event !== event.type || rule.lastEvent >= event.sequence : rule.trigger.kind !== 'interval' || tick % rule.trigger.ticks !== 0) continue;
    if (rule.condition.itemId && countItems(ctx.read(), rule.condition.itemId) >= rule.condition.below) continue;
    // A production target may have at most one matching unfinished order per rule evaluation.
    const action = rule.action;
    if (action.type === 'jobs.create' && Object.values(ctx.read().jobs.orders).some(o => o.definitionId === action.payload.recipeId && ['waiting', 'running'].includes(o.status))) continue;
    const triggerSequence = event?.sequence ?? rule.lastEvent;
    try {
      await ctx.executeAuthorized(id, rule.action);
      ctx.state[id].lastError = null;
    } catch (error) {
      ctx.state[id].lastError = String(error);
      ctx.notify(`Rule ${id} could not execute: ${String(error)}`, id, undefined, 'error');
    }
    ctx.state[id].lastTick = tick; ctx.state[id].lastEvent = triggerSequence;
  }
}
export const rules: DomainModule<'rules'> = {
  id: 'rules', slice: 'rules', commands: {
    'rules.create'(ctx, p) {
      requireThat(!ctx.state[p.rule.id], 'RULE_DUPLICATE', 'Rule ID already exists');
      ctx.state[p.rule.id] = { ...structuredClone(p.rule), lastTick: -1, lastEvent: ctx.read().lastEventSequence, lastError: null };
    },
    'rules.enable'(ctx, p) { requireThat(ctx.state[p.ruleId], 'RULE_MISSING', 'Rule not found'); ctx.state[p.ruleId].enabled = p.enabled; },
    'rules.delete'(ctx, p) { requireThat(ctx.state[p.ruleId], 'RULE_MISSING', 'Rule not found'); delete ctx.state[p.ruleId]; },
  }, tick(ctx) { return evaluate(ctx); }, react(ctx, event) { return evaluate(ctx, event); },
};
