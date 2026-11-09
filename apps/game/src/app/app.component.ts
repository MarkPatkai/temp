import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import { GameFacade } from './game.facade';
import type { Action, Combat, GameState, Item, Party, Rule } from '../../../../packages/contracts/schema';

@Component({
  selector: 'haven-app', standalone: true, imports: [FormsModule, JsonPipe],
  templateUrl: './app.component.html',
})
export class AppComponent {
  readonly game = inject(GameFacade);
  readonly tabs = ['Overview', 'Characters', 'Haven & work', 'Inventory', 'Expeditions', 'Quests', 'Rules', 'Economy', 'Diagnostics'];
  tab = 'Overview'; seed = 'thornhaven-001'; selectedCharacter = 'character-1'; selectedParty = '';
  selectedMembers = ['character-1', 'character-2', 'character-3']; destination = 'base:location.forest'; selectedTarget = '';
  partyName = 'Briarwood expedition'; claimQuantity = 1; surplusKeep = 5; productionTarget = 3;
  readonly values = Object.values;
  send(action: Action) { return this.game.send(action); }
  label(id: string): string { return id.split('.').at(-1)?.replaceAll('-', ' ') ?? id; }
  clock(s: GameState): string { return `Day ${Math.floor(s.clock.tick / 600) + 1} · ${Math.floor((s.clock.tick % 600) / 25).toString().padStart(2, '0')}:00`; }
  pending(s: GameState): number { return s.notifications.filter(n => !n.acknowledged).length; }
  residents(s: GameState): number { return Object.values(s.characters).filter(c => c.controlled).length; }
  contractId(s: GameState, characterId: string): string { return Object.keys(s.contracts).find(id => s.contracts[id].characterId === characterId) ?? ''; }
  itemName(item: Item): string { return this.game.content.get(item.definitionId, 'item').name; }
  itemLocation(item: Item): string { return item.location.kind === 'equipped' ? `${this.game.state()?.characters[item.location.characterId]?.name} · ${item.location.slot}` : item.location.kind === 'delivery' ? 'Pending delivery' : 'Haven storage'; }
  party(s: GameState): Party | undefined { return s.parties[this.selectedParty] ?? Object.values(s.parties)[0]; }
  battle(s: GameState): Combat | undefined { return Object.values(s.combats).filter(b => b.partyId === this.party(s)?.id).at(-1); }
  actor(s: GameState, b: Combat): string { return s.characters[b.initiative[b.turnIndex]]?.name ?? 'Resolved'; }
  allied(b: Combat): boolean { return b.allies.includes(b.initiative[b.turnIndex]); }
  targets(s: GameState, b: Combat): string[] { return b.enemies.filter(id => s.characters[id].conscious); }
  act(s: GameState, b: Combat, abilityId: string): void {
    const targetId = this.targets(s, b).includes(this.selectedTarget) ? this.selectedTarget : this.targets(s, b)[0];
    void this.send({ type: 'combat.act', payload: { combatId: b.id, actorId: b.initiative[b.turnIndex], targetId, abilityId } });
  }
  quest(s: GameState, id: string) { return Object.values(s.quests).find(q => q.definitionId === id); }
  toggleMember(id: string): void { this.selectedMembers = this.selectedMembers.includes(id) ? this.selectedMembers.filter(v => v !== id) : [...this.selectedMembers, id]; }
  createRule(kind: 'production' | 'outfit'): void {
    const rule: Rule = { id: `rule-${crypto.randomUUID()}`, enabled: true, priority: 10, trigger: { kind: 'interval', ticks: 5 },
      condition: kind === 'production' ? { itemId: 'base:item.sword', below: this.productionTarget } : { itemId: null, below: 0 },
      action: kind === 'production' ? { type: 'jobs.create', payload: { recipeId: 'base:recipe.sword', priority: 1 } } :
        { type: 'outfits.apply', payload: { characterId: this.selectedCharacter, itemDefinitionId: 'base:item.sword', loadout: 'work' } },
      cooldownTicks: 30, lastTick: -1, lastEvent: 0, lastError: null };
    void this.send({ type: 'rules.create', payload: { rule } });
  }
  imported(event: Event): void { const file = (event.target as HTMLInputElement).files?.[0]; if (file) void this.game.importSave(file); }
}
