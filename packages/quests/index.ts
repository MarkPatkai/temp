import { countItems, requireThat, type Context, type DomainModule, type ScriptSnapshot } from '../contracts/ports';
import type { Def, DomainEvent, GameState } from '../contracts/schema';
type Quest = GameState['quests'][string];
function matches(event: DomainEvent, objective: Def<'quest'>['objectives'][number]): boolean {
  return event.type === objective.event && (!objective.subjectId || event.subjectId === objective.subjectId);
}
function contribution(ctx: Context<'quests'>, q: Quest, objective: Def<'quest'>['objectives'][number], event: DomainEvent): void {
  if (!matches(event, objective) || (q.progress[objective.id] ?? 0) >= objective.amount) return;
  if (objective.contribution === 'exclusive') {
    const claimed = ctx.effect('quest.allocate-contribution', { key: `${event.id}:${objective.exclusiveGroup}`, questId: q.id });
    if (!claimed) return;
  }
  q.progress[objective.id] = Math.min(objective.amount, (q.progress[objective.id] ?? 0) + event.quantity);
}
function refresh(ctx: Context<'quests'>, q: Quest): boolean {
  const def = ctx.content.get(q.definitionId, 'quest');
  for (const o of def.objectives) if (o.tracking === 'world-state') q.progress[o.id] = Math.min(o.amount, countItems(ctx.read(), o.itemId!));
  const complete = def.objectives.every(o => (q.progress[o.id] ?? 0) >= o.amount);
  q.status = complete ? 'ready' : 'active'; return complete;
}
function snapshot(ctx: Context<'quests'>, q: Quest): ScriptSnapshot {
  return { tick: ctx.read().clock.tick, questId: q.id, objectivesComplete: refresh(ctx, q),
    itemCounts: Object.fromEntries(ctx.content.list('item').map(d => [d.id, countItems(ctx.read(), d.id)])) };
}
async function claim(ctx: Context<'quests'>, questId: string): Promise<void> {
  const q = ctx.state[questId]; requireThat(q && ['active', 'ready'].includes(q.status), 'QUEST_STATE', 'Quest is not claimable');
  requireThat(refresh(ctx, q), 'QUEST_INCOMPLETE', 'Objectives are incomplete');
  const def = ctx.content.get(q.definitionId, 'quest');
  if (def.conditionScript) {
    const script = ctx.content.get(def.conditionScript, 'script');
    requireThat(await ctx.scripts.condition(ctx.content.script(script.file), snapshot(ctx, q)), 'QUEST_CONDITION', 'Lua condition is not satisfied');
  }
  for (const o of def.objectives) if (o.contribution === 'consumptive') ctx.effect('inventory.consume-quantity', { itemId: o.itemId!, quantity: o.amount });
  ctx.effect('economy.change', { amount: def.gold, reason: 'quest-reward' });
  q.rewardReceipt = ctx.allocate('quest-reward'); q.status = 'completed';
  ctx.emit('quest.completed', q.definitionId); ctx.notify(`Quest completed: ${def.name}`, q.id);
}
export const quests: DomainModule<'quests'> = {
  id: 'quests', slice: 'quests', commands: {
    'quests.accept'(ctx, p) {
      const def = ctx.content.get(p.questDefinitionId, 'quest');
      requireThat(!Object.values(ctx.state).some(q => q.definitionId === def.id && q.status !== 'abandoned'), 'QUEST_DUPLICATE', 'Quest already accepted or completed');
      const id = ctx.allocate('quest');
      const q: Quest = { id, definitionId: def.id, acceptedSequence: ctx.read().lastEventSequence, status: 'active', progress: {}, rewardReceipt: null };
      ctx.state[id] = q;
      for (const o of def.objectives) if (o.tracking === 'historical') for (const event of ctx.read().history) contribution(ctx, q, o, event);
      refresh(ctx, q); ctx.emit('quest.accepted', def.id);
    },
    'quests.claim'(ctx, p) { return claim(ctx, p.questId); },
    'quests.abandon'(ctx, p) {
      const q = ctx.state[p.questId]; requireThat(q && ['active', 'ready'].includes(q.status), 'QUEST_STATE', 'Quest cannot be abandoned'); q.status = 'abandoned';
    },
    async 'scripts.execute'(ctx, p) {
      const q = ctx.state[p.questId], def = ctx.content.get(p.scriptId, 'script');
      requireThat(q && ['active', 'ready'].includes(q.status), 'QUEST_STATE', 'Script requires an active quest');
      if (def.mode === 'condition') {
        const result = await ctx.scripts.condition(ctx.content.script(def.file), snapshot(ctx, q));
        ctx.notify(`Lua condition returned ${result}.`, q.id);
      } else {
        const intents = await ctx.scripts.effect(ctx.content.script(def.file), snapshot(ctx, q));
        for (const intent of intents) {
          requireThat(def.capabilities.includes('quest.claim') && intent.questId === q.id, 'SCRIPT_CAPABILITY', 'Script lacks quest claim capability');
          await claim(ctx, intent.questId);
        }
      }
      ctx.emit('script.executed', def.id);
    },
  }, react(ctx, event) {
    for (const q of Object.values(ctx.state).sort((a, b) => a.id < b.id ? -1 : 1)) {
      if (!['active', 'ready'].includes(q.status)) continue;
      for (const o of ctx.content.get(q.definitionId, 'quest').objectives) {
        if (o.tracking === 'historical' || (o.tracking === 'commissioned' && event.sequence > q.acceptedSequence)) contribution(ctx, q, o, event);
      }
      refresh(ctx, q);
    }
  },
};
export const contributions: DomainModule<'contributions'> = { id: 'quest-contributions', slice: 'contributions', effects: {
  'quest.allocate-contribution'(ctx, p) { if (ctx.state[p.key]) return false; ctx.state[p.key] = p.questId; return true; },
} };
