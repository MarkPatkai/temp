import { requireThat, partyOf, type DomainModule } from '../contracts/ports';

export const characters: DomainModule<'characters'> = {
  id: 'characters', slice: 'characters',
  commands: {
    'characters.rest'(ctx, p) {
      const char = ctx.state[p.characterId];
      requireThat(char?.controlled, 'CHARACTER_CONTROL', 'Character is not controlled');
      const party = partyOf(ctx.read(), char.id);
      requireThat(!party || ['idle', 'post-combat'].includes(party.mode), 'CHARACTER_BUSY', 'Character is busy');
      requireThat(!Object.values(ctx.read().jobs.orders).some(o => o.workerId === char.id && o.status === 'running'), 'CHARACTER_BUSY', 'Character is working');
      const recovery = ctx.content.get(char.locationId, 'location').recovery;
      requireThat(recovery > 0, 'NO_RECOVERY', 'No recovery available here');
      char.resting = true; ctx.emit('character.rest-started', char.id);
    },
    'characters.stop-rest'(ctx, p) { requireThat(ctx.state[p.characterId]?.controlled, 'CHARACTER_CONTROL', 'Character is not controlled'); ctx.state[p.characterId].resting = false; },
  },
  effects: {
    'character.spawn'(ctx, p) {
      const def = ctx.content.get(p.definitionId, 'character');
      ctx.content.get(p.locationId, 'location');
      const id = ctx.allocate('character');
      ctx.state[id] = { id, definitionId: def.id, name: def.name, category: def.category,
        controlled: p.controlled ?? def.playerControlled, locationId: p.locationId,
        hp: def.hp, maxHp: def.hp, stamina: 100, mana: 100, speed: def.speed, power: def.power,
        workRate: def.workRate, hunger: 10000, rest: 10000, conscious: true, resting: false, injuries: [], xp: 0,
        skills: {}, traits: structuredClone(def.traits) };
      return id;
    },
    'character.damage'(ctx, p) {
      const char = ctx.state[p.characterId];
      requireThat(char, 'CHARACTER_MISSING', 'Character not found');
      char.hp = Math.max(0, char.hp - p.amount);
      if (char.hp === 0 && char.conscious) {
        char.conscious = false;
        if (ctx.random('injuries', 100) < 25) char.injuries.push('base:injury.bruised');
        ctx.emit('combat.character-incapacitated', char.definitionId);
      }
    },
    'character.reward'(ctx, p) {
      const char = ctx.state[p.characterId];
      requireThat(char, 'CHARACTER_MISSING', 'Character not found');
      char.xp += p.xp; char.skills[p.skill] = (char.skills[p.skill] ?? 0) + p.xp;
    },
    'character.move'(ctx, p) { ctx.state[p.characterId].locationId = p.locationId; },
    'character.resources'(ctx, p) {
      const char = ctx.state[p.characterId];
      requireThat(char && char.stamina >= p.stamina && char.mana >= p.mana, 'RESOURCE_COST', 'Insufficient stamina or mana');
      char.stamina -= p.stamina; char.mana -= p.mana;
    },
    'character.recruit'(ctx, p) { ctx.state[p.characterId].controlled = true; },
  },
  tick(ctx) {
    for (const id of Object.keys(ctx.state).sort()) {
      const char = ctx.state[id];
      char.hunger = Math.max(0, char.hunger - 1);
      char.rest = Math.max(0, char.rest - 1);
      if (char.resting && ctx.read().clock.tick % 10 === 0) {
        const recovery = ctx.content.get(char.locationId, 'location').recovery;
        char.hp = Math.min(char.maxHp, char.hp + recovery);
        char.rest = Math.min(10000, char.rest + recovery * 10);
        char.stamina = Math.min(100, char.stamina + recovery); char.mana = Math.min(100, char.mana + recovery);
        if (char.hp >= Math.ceil(char.maxHp / 4)) char.conscious = true;
        ctx.emit('character.recovered', char.id);
      }
    }
  },
};

export const relationships: DomainModule<'relationships'> = {
  id: 'relationships', slice: 'relationships', effects: {
    'relationship.adjust'(ctx, p) {
      requireThat(ctx.read().characters[p.from] && ctx.read().characters[p.to], 'CHARACTER_MISSING', 'Relationship character missing');
      const key = `${p.from}:${p.to}`;
      const edge = ctx.state[key] ?? { from: p.from, to: p.to, trust: 0 };
      edge.trust = Math.max(-100, Math.min(100, edge.trust + p.amount));
      ctx.state[key] = edge;
    },
  },
};
