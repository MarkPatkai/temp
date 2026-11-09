import type { Action, CommandType, DeepReadonly, Def, Definition, DomainEvent, GameState, Payload, StateKey } from './schema';

export interface ContentPort {
  readonly fingerprint: string;
  get<K extends Definition['kind']>(id: string, kind: K): Def<K>;
  list<K extends Definition['kind']>(kind: K): Def<K>[];
  script(file: string): string;
}
export interface ScriptPort {
  validate(source: string, mode: 'condition' | 'effect'): Promise<void>;
  condition(source: string, snapshot: ScriptSnapshot): Promise<boolean>;
  effect(source: string, snapshot: ScriptSnapshot): Promise<Array<{ type: 'quests.claim'; questId: string }>>;
}
export interface ScriptSnapshot { tick: number; questId: string; objectivesComplete: boolean; itemCounts: Record<string, number> }

export interface Effects {
  'quest.allocate-contribution': { key: string; questId: string };
  'character.spawn': { definitionId: string; locationId: string; controlled?: boolean };
  'character.damage': { characterId: string; amount: number };
  'character.reward': { characterId: string; xp: number; skill: string };
  'character.move': { characterId: string; locationId: string };
  'character.resources': { characterId: string; stamina: number; mana: number };
  'character.recruit': { characterId: string };
  'inventory.produce': { definitionId: string; quantity: number; ownerId?: string };
  'inventory.reserve': { itemId: string; quantity: number; orderId: string };
  'inventory.consume': { reservationId: string };
  'inventory.release': { reservationId: string };
  'inventory.consume-quantity': { itemId: string; quantity: number };
  'inventory.equip': { itemId: string; characterId: string; slot: string };
  'inventory.unequip': { itemId: string };
  'economy.change': { amount: number; reason: string };
  'party.create': { name: string; members: string[] };
  'party.mode': { partyId: string; mode: GameState['parties'][string]['mode']; encounterId?: string | null };
  'party.arrive': { partyId: string; locationId: string };
  'party.explore': { partyId: string; work: number; encounterId: string | null };
  'party.post-combat': { partyId: string };
  'combat.start': { partyId: string; encounterId: string };
  'world.unlock': { id: string };
  'haven.research': { id: string };
  'contract.create': { characterId: string; wage: number; minimumEnd: number };
  'relationship.adjust': { from: string; to: string; amount: number };
}
export interface Context<K extends StateKey> {
  readonly state: GameState[K];
  readonly content: ContentPort;
  readonly scripts: ScriptPort;
  readonly cause: string;
  read(): DeepReadonly<GameState>;
  allocate(prefix: string): string;
  random(stream: string, maximum: number): number;
  emit(type: string, subjectId?: string, quantity?: number): void;
  notify(message: string, subjectId?: string, action?: string, severity?: 'info' | 'decision' | 'error'): void;
  effect<N extends keyof Effects>(name: N, payload: Effects[N]): unknown;
  executeAuthorized(ruleId: string, action: Action): Promise<void>;
}
export interface DomainModule<K extends StateKey = StateKey> {
  id: string;
  slice: K;
  commands?: Partial<{ [N in CommandType]: (ctx: Context<K>, payload: Payload<N>) => void | Promise<void> }>;
  effects?: Partial<{ [N in keyof Effects]: (ctx: Context<K>, payload: Effects[N]) => unknown }>;
  tick?: (ctx: Context<K>) => void | Promise<void>;
  schedule?: (ctx: Context<K>) => void;
  react?: (ctx: Context<K>, event: DomainEvent) => void | Promise<void>;
}
export class GameError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'GameError'; }
  override toString(): string { return `${this.name}[${this.code}]: ${this.message}`; }
}
export function requireThat(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new GameError(code, message);
}
export function sorted<T extends { id: string }>(values: readonly T[]): T[] { return [...values].sort((a, b) => compare(a.id, b.id)); }
export function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
export function available(item: DeepReadonly<GameState['inventory'][string]>): boolean {
  return item.location.kind === 'storage' && !item.protected && item.reservedBy === null;
}
export function countItems(state: DeepReadonly<GameState>, definitionId: string): number {
  return Object.values(state.inventory).filter(i => i.definitionId === definitionId && available(i) && i.ownerId === null).reduce((n, i) => n + i.quantity, 0);
}
export function partyOf(state: DeepReadonly<GameState>, characterId: string) {
  return Object.values(state.parties).find(p => p.members.includes(characterId));
}
export function isAvailable(state: DeepReadonly<GameState>, characterId: string): boolean {
  const char = state.characters[characterId];
  const party = partyOf(state, characterId);
  return !!char?.controlled && char.conscious && !char.resting && char.locationId === state.haven.locationId &&
    (!party || party.mode === 'idle') &&
    !Object.values(state.contracts).some(c => c.characterId === characterId && c.suspended);
}
