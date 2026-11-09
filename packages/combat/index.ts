import { compare, requireThat, type Context, type DomainModule } from '../contracts/ports';
import type { Combat, Def } from '../contracts/schema';
const rowIndex = { front: 0, middle: 1, back: 2 };

function battle(ctx: Context<'combats'>, id: string): Combat {
  const value = ctx.state[id]; requireThat(value?.status === 'active', 'COMBAT_INACTIVE', 'Battle is not active'); return value;
}
function conscious(ctx: Context<'combats'>, b: Combat, ids: readonly string[]): string[] {
  return ids.filter(id => ctx.read().characters[id].conscious && !b.escaped.includes(id));
}
function initiative(ctx: Context<'combats'>, b: Combat): string[] {
  return conscious(ctx, b, [...b.allies, ...b.enemies]).sort((a, c) => ctx.read().characters[c].speed - ctx.read().characters[a].speed || compare(a, c));
}
function validTarget(ctx: Context<'combats'>, b: Combat, actor: string, target: string, ability: Def<'ability'>): boolean {
  const opponents = b.allies.includes(actor) ? b.enemies : b.allies;
  const eligible = conscious(ctx, b, opponents);
  if (!eligible.includes(target)) return false;
  const targetRow = rowIndex[b.rows[target]];
  const front = Math.min(...eligible.map(id => rowIndex[b.rows[id]]));
  if (ability.style === 'melee') return targetRow === front;
  if (ability.style === 'extended') return targetRow - front < ability.reach;
  return true;
}
function finishOrAdvance(ctx: Context<'combats'>, b: Combat): void {
  const allies = conscious(ctx, b, b.allies), enemies = conscious(ctx, b, b.enemies);
  if (!allies.length || !enemies.length) {
    b.status = !enemies.length ? 'victory' : b.escaped.length === b.allies.length ? 'escaped' : 'defeat';
    if (b.status === 'victory') {
      const encounter = ctx.content.get(b.encounterId, 'encounter');
      ctx.effect('economy.change', { amount: encounter.gold, reason: 'combat-reward' });
      for (const id of b.allies) ctx.effect('character.reward', { characterId: id, xp: 15, skill: 'combat' });
      ctx.emit('combat.victory', b.encounterId);
    }
    ctx.effect('party.post-combat', { partyId: b.partyId });
    ctx.emit('combat.ended', b.encounterId);
    ctx.notify(`Battle ${b.status}. Awaiting instructions.`, b.partyId, 'exploration.start', 'decision');
    return;
  }
  b.turnIndex++;
  while (b.turnIndex < b.initiative.length && !conscious(ctx, b, [b.initiative[b.turnIndex]]).length) b.turnIndex++;
  if (b.turnIndex >= b.initiative.length) { b.round++; b.initiative = initiative(ctx, b); b.turnIndex = 0; }
}
function act(ctx: Context<'combats'>, b: Combat, actorId: string, targetId: string, abilityId: string): void {
  requireThat(b.initiative[b.turnIndex] === actorId && ctx.read().characters[actorId].conscious, 'COMBAT_TURN', 'Actor does not have the turn');
  const encounter = ctx.content.get(b.encounterId, 'encounter');
  requireThat(encounter.abilities.includes(abilityId), 'ABILITY_UNAVAILABLE', 'Ability is unavailable in this encounter');
  const ability = ctx.content.get(abilityId, 'ability');
  requireThat(validTarget(ctx, b, actorId, targetId, ability), 'COMBAT_TARGET', 'Target is protected, incapacitated, or invalid');
  ctx.effect('character.resources', { characterId: actorId, stamina: ability.stamina, mana: ability.mana });
  const actor = ctx.read().characters[actorId];
  const distance = rowIndex[b.rows[actorId]] + rowIndex[b.rows[targetId]];
  const accuracy = ability.style === 'ranged' ? ability.accuracyByDistance[distance] : 10000;
  if (ctx.random('combat', 10000) < accuracy) {
    const equipped = Object.values(ctx.read().inventory).filter(i => i.location.kind === 'equipped' && i.location.characterId === actorId);
    const itemPower = equipped.reduce((n, i) => n + ctx.content.get(i.definitionId, 'item').power, 0);
    ctx.effect('character.damage', { characterId: targetId, amount: Math.max(1, actor.power + ability.power + itemPower) });
    ctx.emit('combat.hit', actor.definitionId);
  } else ctx.emit('combat.missed', actor.definitionId);
  finishOrAdvance(ctx, b);
}
export const combat: DomainModule<'combats'> = {
  id: 'combat', slice: 'combats', effects: {
    'combat.start'(ctx, p) {
      const party = ctx.read().parties[p.partyId], encounter = ctx.content.get(p.encounterId, 'encounter');
      requireThat(party?.mode === 'encounter', 'COMBAT_START', 'Party has no pending encounter');
      requireThat(!Object.values(ctx.state).some(b => b.status === 'active' && b.partyId === party.id), 'COMBAT_DUPLICATE', 'Party already in combat');
      const enemies = encounter.enemies.map(definitionId => ctx.effect('character.spawn', { definitionId, locationId: party.locationId, controlled: false }) as string);
      const id = ctx.allocate('combat');
      const b: Combat = { id, partyId: party.id, encounterId: encounter.id, allies: [...party.members], enemies,
        rows: { ...party.rows, ...Object.fromEntries(enemies.map((enemyId, index) => [enemyId, index === 0 ? 'front' as const : 'back' as const])) },
        round: 1, initiative: [], turnIndex: 0, escaped: [], status: 'active' };
      b.initiative = initiative(ctx, b); ctx.state[id] = b;
      ctx.effect('party.mode', { partyId: party.id, mode: 'combat' }); ctx.emit('combat.started', encounter.id);
    },
  }, commands: {
    'combat.act'(ctx, p) {
      const b = battle(ctx, p.combatId); requireThat(b.allies.includes(p.actorId), 'COMBAT_ALLIED_ONLY', 'Use the enemy controller for enemy turns');
      act(ctx, b, p.actorId, p.targetId, p.abilityId);
    },
    'combat.escape'(ctx, p) {
      const b = battle(ctx, p.combatId);
      requireThat(b.allies.includes(p.actorId) && b.initiative[b.turnIndex] === p.actorId, 'COMBAT_TURN', 'Only the current allied actor may escape');
      b.escaped.push(p.actorId); ctx.emit('combat.escaped', p.actorId); finishOrAdvance(ctx, b);
    },
    'combat.enemy-turn'(ctx, p) {
      const b = battle(ctx, p.combatId), actorId = b.initiative[b.turnIndex];
      requireThat(b.enemies.includes(actorId), 'COMBAT_ALLIED_MANUAL', 'Allied turns require explicit input');
      const actor = ctx.read().characters[actorId];
      const abilities = ctx.content.get(b.encounterId, 'encounter').abilities.map(id => ctx.content.get(id, 'ability'))
        .filter(a => actor.stamina >= a.stamina && actor.mana >= a.mana).sort((a, c) => compare(a.id, c.id));
      for (const ability of abilities) {
        const targets = conscious(ctx, b, b.allies).filter(id => validTarget(ctx, b, actorId, id, ability)).sort(compare);
        if (targets.length) { act(ctx, b, actorId, targets[0], ability.id); return; }
      }
      // A legal pass when no affordable action exists prevents deadlock without fabricating resources.
      ctx.emit('combat.enemy-passed', actorId); finishOrAdvance(ctx, b);
    },
  },
};
