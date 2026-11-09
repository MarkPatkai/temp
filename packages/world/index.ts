import type { DomainModule } from '../contracts/ports';
export const world: DomainModule<'world'> = { id: 'world', slice: 'world', effects: {
  'world.unlock'(ctx, p) { if (!ctx.state.unlocked.includes(p.id)) ctx.state.unlocked.push(p.id); },
}, react(ctx, event) {
  if (event.type === 'travel.arrived' && event.subjectId && !ctx.state.discovered.includes(event.subjectId)) ctx.state.discovered.push(event.subjectId);
} };
