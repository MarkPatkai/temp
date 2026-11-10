import { Component, inject, HostListener } from '@angular/core';
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
  tab = 'City'; seed = 'thornhaven-001'; selectedCharacter = 'character-1'; selectedParty = '';
  selectedMembers = ['character-1']; destination = 'base:location.forest'; selectedTarget = '';
  partyName = 'Briarwood expedition'; claimQuantity = 1; surplusKeep = 5; productionTarget = 3;
  readonly values = Object.values; readonly keys = Object.keys; readonly floor = Math.floor;
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
  modal: 'creation' | 'character' | 'companions' | null = null;
  inbox = false; toasts = localStorage.getItem('crossroads-toasts') !== 'off';
  tracked = localStorage.getItem('crossroads-tracked') || 'story:quest.stranger';
  characterName = ''; ancestry = 'Human'; heritage = 'Lowlander'; origin = 'Crossroads'; background = 'Wanderer'; motivation = 'Settlement'; portrait = 'traveler';
  showTechnicalQuests = false;
  questDefinitions() { return this.game.content.list('quest').filter(d=>this.showTechnicalQuests||d.id.startsWith('story:')); }
  interactions() { const scenes=this.game.content.list('interaction');const depth=(id:string):number=>{const d=this.game.content.get(id,'interaction');return d.requires.length?1+Math.max(...d.requires.map(depth)):0;};return scenes.sort((a,b)=>depth(a.id)-depth(b.id)); }
  activeScene = 'story:interaction.gate';
  pc(s: GameState) { return s.playerCharacterId ? s.characters[s.playerCharacterId] : undefined; }
  creation() { return this.game.content.list('creation')[0]; }
  stock(s: GameState,id:string) { return Object.values(s.inventory).filter(i=>i.definitionId===id&&i.location.kind==='storage').reduce((n,i)=>n+i.quantity,0); }
  slots(s:GameState) { return Object.values(s.inventory).filter(i=>i.location.kind==='storage').length; }
  outside(s:GameState) { return Object.values(s.parties).filter(p=>p.locationId!==s.haven.locationId||p.mode==='travel'); }
  work(s:GameState,facilityId:string) { return Object.values(s.jobs.orders).filter(o=>o.facilityId===facilityId&&o.status==='running'); }
  unread(s:GameState) { return s.notifications.filter(n=>!n.acknowledged); }
  icon(id:string) { return 'art/'+(id.includes('wood')?'wood':id.includes('iron')?'iron':id.includes('sword')?'sword':'goods')+'.svg'; }
  production(s:GameState,id:string):string {
    const rate = this.game.rates()[id] ?? 0;
    return rate ? '+'+(rate*600).toFixed(1)+' capacity/day' : '+0 / day';
  }
  canInteract(s:GameState,id:string) { const d=this.game.content.get(id,'interaction'), c=this.pc(s);return !!c?.identity&&c.locationId===d.locationId&&!c.identity.interactions.includes(id)&&d.requires.every(v=>c.identity!.interactions.includes(v))&&!!Object.values(s.quests).find(q=>q.definitionId===d.questId&&['active','ready'].includes(q.status)); }
  track(id:string) { this.tracked=id; localStorage.setItem('crossroads-tracked',id); }
  toggleToasts() { this.toasts=!this.toasts;localStorage.setItem('crossroads-toasts',this.toasts?'on':'off'); }
  async register() {
    await this.send({type:'characters.create',payload:{name:this.characterName,ancestry:this.ancestry,heritage:this.heritage,origin:this.origin,background:this.background,motivation:this.motivation,portrait:this.portrait}});
    if(this.game.error()) return;
    await this.acceptOpening(); this.modal=null;
  }
  async acceptOpening() { if(Object.values(this.game.state()!.quests).some(q=>q.definitionId==='story:quest.stranger')) return; await this.send({type:'quests.accept',payload:{questDefinitionId:'story:quest.stranger'}}); }
  @HostListener('document:keydown', ['$event'])
  onKey(event:KeyboardEvent) {
    if(event.key==='Escape') { this.modal=null; this.inbox=false; }
    if(event.key!=='Tab'||!this.modal) return;
    const nodes=Array.from(document.querySelectorAll<HTMLElement>('.modal-sheet button:not(:disabled), .modal-sheet input:not(:disabled), .modal-sheet select:not(:disabled)'));
    const first=nodes[0],last=nodes.at(-1);
    if(event.shiftKey&&document.activeElement===first) { event.preventDefault();last?.focus(); }
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
  wages(s:GameState){return Object.values(s.contracts).reduce((n,c)=>n+c.wage,0);}
  imported(event: Event): void { const file = (event.target as HTMLInputElement).files?.[0]; if (file) void this.game.importSave(file); }
}
