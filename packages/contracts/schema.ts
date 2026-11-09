import { Type as T, type Static, type TProperties, type TSchema } from '@sinclair/typebox';

// TypeBox schemas are JSON Schema; Static<> derives the matching TypeScript type.
export const object = <P extends TProperties>(p: P) => T.Object(p, { additionalProperties: false });
export const id = T.String({ minLength: 1, maxLength: 160, pattern: '^(?!(?:__proto__|prototype|constructor)$)[a-zA-Z0-9:._/-]+$' });
export const integer = T.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
export const positive = T.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
export const signed = T.Integer({ minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER });
export const nullableId = T.Union([id, T.Null()]);
export const ids = T.Array(id, { maxItems: 10000 });
export const record = <S extends TSchema>(value: S) => T.Record(id, value, { additionalProperties: false });
export const numbers = record(integer);
export const row = T.Union([T.Literal('front'), T.Literal('middle'), T.Literal('back')]);
export const category = T.Union(['permanent', 'subcontractor', 'captive', 'external', 'world'].map(v => T.Literal(v)));
const base = { id, name: T.String({ minLength: 1, maxLength: 120 }), schemaVersion: T.Literal(1) };

export const CharacterDefinitionSchema = object({ ...base, kind: T.Literal('character'), category,
  playerControlled: T.Boolean(), hp: positive, speed: positive, power: positive,
  workRate: positive, traits: T.Array(object({ id, hidden: T.Boolean(), workBonus: signed })),
  food: object({ forbidden: ids, preferred: ids }), });
export const ItemDefinitionSchema = object({ ...base, kind: T.Literal('item'), stackLimit: positive,
  price: integer, equipSlot: T.Union([T.Literal('hand'), T.Literal('body'), T.Null()]),
  power: integer, tags: ids });
export const FacilityDefinitionSchema = object({ ...base, kind: T.Literal('facility'),
  instanceLimit: positive, workstations: positive, maxWorkers: positive });
const quantities = T.Array(object({ itemId: id, quantity: positive }), { minItems: 1, maxItems: 100 });
export const RecipeDefinitionSchema = object({ ...base, kind: T.Literal('recipe'), facilityId: id,
  work: positive, inputs: quantities, outputs: quantities, skill: id });
export const ResearchDefinitionSchema = object({ ...base, kind: T.Literal('research'), facilityId: id,
  work: positive, unlockId: id });
export const LocationDefinitionSchema = object({ ...base, kind: T.Literal('location'),
  locationType: T.Union(['haven', 'settlement', 'wilderness', 'dungeon'].map(v => T.Literal(v))),
  recovery: integer, explorationWork: positive, encounterId: nullableId });
export const ConnectionDefinitionSchema = object({ ...base, kind: T.Literal('connection'),
  from: id, to: id, ticks: positive, requiredUnlock: nullableId });
export const AbilityDefinitionSchema = object({ ...base, kind: T.Literal('ability'),
  style: T.Union(['melee', 'extended', 'ranged', 'magic'].map(v => T.Literal(v))),
  reach: T.Integer({ minimum: 1, maximum: 3 }), power: integer, stamina: integer, mana: integer,
  accuracyByDistance: T.Array(T.Integer({ minimum: 0, maximum: 10000 }), { minItems: 5, maxItems: 5 }) });
export const EncounterDefinitionSchema = object({ ...base, kind: T.Literal('encounter'),
  enemies: T.Array(id, { minItems: 1, maxItems: 8 }), abilities: T.Array(id, { minItems: 1 }),
  gold: integer, surrender: T.Boolean() });
export const QuestDefinitionSchema = object({ ...base, kind: T.Literal('quest'),
  objectives: T.Array(object({ id,
    tracking: T.Union(['world-state', 'historical', 'commissioned'].map(v => T.Literal(v))),
    event: T.String({ minLength: 1, maxLength: 120 }), subjectId: nullableId, amount: positive,
    itemId: nullableId, contribution: T.Union(['shared', 'exclusive', 'consumptive'].map(v => T.Literal(v))),
    exclusiveGroup: nullableId }), { minItems: 1, maxItems: 30 }),
  gold: integer, conditionScript: nullableId });
export const RecruitDefinitionSchema = object({ ...base, kind: T.Literal('recruit'),
  characterId: id, originId: id, fee: integer, travelTicks: positive, wagePerDay: integer, minimumDays: integer,
  serviceOutputs: T.Array(object({ itemId: id, quantity: positive }), { maxItems: 10 }) });
export const MarketDefinitionSchema = object({ ...base, kind: T.Literal('market'),
  locationId: id, refreshTicks: positive, stock: quantities });
export const ScriptDefinitionSchema = object({ ...base, kind: T.Literal('script'), file: id,
  exportName: T.Literal('run'), mode: T.Union([T.Literal('condition'), T.Literal('effect')]),
  capabilities: T.Array(T.Literal('quest.claim'), { maxItems: 1 }), apiVersion: T.Literal(1) });
export const StartDefinitionSchema = object({ ...base, kind: T.Literal('start'), locationId: id,
  characters: T.Array(id, { minItems: 1, maxItems: 10, uniqueItems: true }), facilities: ids,
  items: quantities, storageCapacity: positive, gold: integer });
export const DefinitionSchema = T.Union([CharacterDefinitionSchema, ItemDefinitionSchema,
  FacilityDefinitionSchema, RecipeDefinitionSchema, ResearchDefinitionSchema, LocationDefinitionSchema,
  ConnectionDefinitionSchema, AbilityDefinitionSchema, EncounterDefinitionSchema, QuestDefinitionSchema,
  RecruitDefinitionSchema, MarketDefinitionSchema, ScriptDefinitionSchema, StartDefinitionSchema]);
export type Definition = Static<typeof DefinitionSchema>;
export type Def<K extends Definition['kind']> = Extract<Definition, { kind: K }>;
export const ManifestSchema = object({ packId: id, version: id, schemaVersion: T.Literal(1),
  files: T.Array(id, { minItems: 1, maxItems: 200 }), scripts: T.Array(id, { maxItems: 100 }) });
export type Manifest = Static<typeof ManifestSchema>;

export const CharacterSchema = object({ id, definitionId: id, name: T.String(), category,
  controlled: T.Boolean(), locationId: id, hp: integer, maxHp: positive,
  stamina: integer, mana: integer, speed: positive, power: positive, workRate: positive,
  hunger: T.Integer({ minimum: 0, maximum: 10000 }), rest: T.Integer({ minimum: 0, maximum: 10000 }),
  conscious: T.Boolean(), resting: T.Boolean(), injuries: ids, xp: integer, skills: numbers,
  traits: T.Array(object({ id, hidden: T.Boolean(), workBonus: signed })) });
export type Character = Static<typeof CharacterSchema>;
export const ItemLocationSchema = T.Union([
  object({ kind: T.Literal('storage') }),
  object({ kind: T.Literal('equipped'), characterId: id, slot: id }),
  object({ kind: T.Literal('delivery'), deliveryId: id }),
]);
export const ItemSchema = object({ id, definitionId: id, quantity: positive, quality: positive,
  ownerId: nullableId, protected: T.Boolean(), reservedBy: nullableId, location: ItemLocationSchema });
export type Item = Static<typeof ItemSchema>;
export const EventSchema = object({ id, sequence: positive, tick: integer, type: id,
  subjectId: nullableId, quantity: positive, cause: id });
export type DomainEvent = Static<typeof EventSchema>;
export const OrderSchema = object({ id, definitionId: id,
  kind: T.Union([T.Literal('craft'), T.Literal('research')]),
  status: T.Union(['waiting', 'running', 'completed', 'cancelled'].map(v => T.Literal(v))),
  workerId: nullableId, facilityId: id, work: integer, required: positive, priority: integer });
export type Order = Static<typeof OrderSchema>;
export const PartySchema = object({ id, name: T.String({ minLength: 1, maxLength: 120 }), members: ids,
  rows: record(row), locationId: id, visitId: id, encounterSafe: T.Boolean(),
  mode: T.Union(['idle', 'travel', 'exploring', 'encounter', 'combat', 'post-combat'].map(v => T.Literal(v))),
  encounterId: nullableId, explorationWork: integer });
export type Party = Static<typeof PartySchema>;
export const CombatSchema = object({ id, partyId: id, encounterId: id, allies: ids, enemies: ids,
  rows: record(row), round: positive, initiative: ids, turnIndex: integer, escaped: ids,
  status: T.Union([T.Literal('active'), T.Literal('victory'), T.Literal('defeat'), T.Literal('escaped')]) });
export type Combat = Static<typeof CombatSchema>;
export const RuleActionSchema = T.Union([
  object({ type: T.Literal('jobs.create'), payload: object({ recipeId: id, priority: integer }) }),
  object({ type: T.Literal('outfits.apply'), payload: object({ characterId: id, itemDefinitionId: id, loadout: T.Union([T.Literal('work'), T.Literal('combat')]) }) }),
  object({ type: T.Literal('market.buy'), payload: object({ marketId: id, itemId: id, quantity: positive }) }),
  object({ type: T.Literal('inventory.sell-surplus'), payload: object({ itemId: id, keep: integer }) }),
  object({ type: T.Literal('exploration.start'), payload: object({ partyId: id }) }),
]);
export const RuleSchema = object({ id, enabled: T.Boolean(), priority: integer,
  trigger: T.Union([object({ kind: T.Literal('interval'), ticks: positive }), object({ kind: T.Literal('event'), event: id })]),
  condition: object({ itemId: nullableId, below: integer }), action: RuleActionSchema,
  cooldownTicks: positive, lastTick: T.Union([T.Literal(-1), integer]), lastEvent: integer,
  lastError: T.Union([T.String(), T.Null()]) });
export type Rule = Static<typeof RuleSchema>;

export const GameStateSchema = object({ schemaVersion: T.Literal(1), engineVersion: T.Literal('0.1.0-alpha.1'),
  playerCharacterId: nullableId,
  contentFingerprint: T.String({ pattern: '^[a-f0-9]{64}$' }), seed: T.String({ minLength: 1, maxLength: 120 }),
  counters: numbers, rng: record(T.Integer({ minimum: 1, maximum: 4294967295 })),
  clock: object({ tick: integer, paused: T.Boolean(), speed: T.Union([T.Literal(1), T.Literal(2), T.Literal(4), T.Literal(8)]) }),
  characters: record(CharacterSchema),
  relationships: record(object({ from: id, to: id, trust: T.Integer({ minimum: -100, maximum: 100 }) })),
  recruitment: record(object({ definitionId: id, characterId: id, arrivalTick: integer, arrived: T.Boolean() })),
  contracts: record(object({ characterId: id, wage: integer, accrued: integer, minimumEnd: integer, suspended: T.Boolean() })),
  haven: object({ locationId: id, storageCapacity: positive, facilities: record(object({ id, definitionId: id })), researched: ids }),
  jobs: object({ assignments: record(object({ facilityId: id, protected: T.Boolean(), flexible: T.Boolean() })), orders: record(OrderSchema) }),
  inventory: record(ItemSchema),
  equipment: record(object({ active: T.Union([T.Literal('work'), T.Literal('combat')]),
    work: record(id), combat: record(id) })),
  economy: object({ gold: integer, ledger: T.Array(object({ id, tick: integer, amount: signed, reason: id })) }),
  markets: record(object({ stock: numbers, nextRefresh: integer, negotiatorId: nullableId })),
  world: object({ discovered: ids, unlocked: ids }),
  parties: record(PartySchema),
  travel: record(object({ partyId: id, route: ids, edgeIndex: integer, progress: integer, stopRequested: T.Boolean() })),
  combats: record(CombatSchema),
  quests: record(object({ id, definitionId: id, acceptedSequence: integer,
    status: T.Union(['active', 'ready', 'completed', 'abandoned', 'failed', 'expired'].map(v => T.Literal(v))),
    progress: numbers, rewardReceipt: nullableId })),
  rules: record(RuleSchema),
  notifications: T.Array(object({ id, tick: integer, severity: T.Union([T.Literal('info'), T.Literal('decision'), T.Literal('error')]),
    message: T.String({ maxLength: 1000 }), subjectId: nullableId, action: nullableId, acknowledged: T.Boolean() })),
  history: T.Array(EventSchema), contributions: record(id),
  receipts: record(object({ canonicalCommand: T.String(), eventIds: ids })),
  events: T.Array(EventSchema), lastEventSequence: integer,
});
export type GameState = Static<typeof GameStateSchema>;
export type StateKey = keyof GameState;

const cmd = <N extends string, P extends TProperties>(name: N, p: P) => object({ id, type: T.Literal(name), payload: object(p) });
export const CommandSchema = T.Union([
  cmd('clock.configure', { paused: T.Boolean(), speed: T.Union([T.Literal(1), T.Literal(2), T.Literal(4), T.Literal(8)]) }),
  cmd('haven.build', { facilityDefinitionId: id }),
  cmd('jobs.assign', { characterId: id, facilityId: id, protected: T.Boolean(), flexible: T.Boolean() }),
  cmd('jobs.unassign', { characterId: id }),
  cmd('jobs.create', { recipeId: id, priority: integer }),
  cmd('jobs.cancel', { orderId: id }),
  cmd('research.start', { researchId: id, priority: integer }),
  cmd('equipment.equip', { characterId: id, itemId: id, loadout: T.Union([T.Literal('work'), T.Literal('combat')]) }),
  cmd('equipment.unequip', { characterId: id, slot: id }),
  cmd('equipment.activate', { characterId: id, loadout: T.Union([T.Literal('work'), T.Literal('combat')]) }),
  cmd('outfits.apply', { characterId: id, itemDefinitionId: id, loadout: T.Union([T.Literal('work'), T.Literal('combat')]) }),
  cmd('inventory.protect', { itemId: id, protected: T.Boolean() }),
  cmd('inventory.transfer', { itemId: id, ownerId: nullableId }),
  cmd('inventory.split', { itemId: id, quantity: positive }),
  cmd('inventory.merge', { sourceId: id, targetId: id }),
  cmd('inventory.claim', { itemId: id, quantity: positive }),
  cmd('inventory.sell-surplus', { itemId: id, keep: integer }),
  cmd('parties.create', { name: T.String({ minLength: 1, maxLength: 120 }), members: T.Array(id, { minItems: 1, maxItems: 6, uniqueItems: true }) }),
  cmd('parties.formation', { partyId: id, characterId: id, row }),
  cmd('travel.begin', { partyId: id, destinationId: id, waypoints: T.Array(id, { maxItems: 20 }) }),
  cmd('travel.cancel', { partyId: id }),
  cmd('exploration.start', { partyId: id }),
  cmd('exploration.stop', { partyId: id }),
  cmd('exploration.decide', { partyId: id, decision: T.Union([T.Literal('fight'), T.Literal('avoid'), T.Literal('retreat')]) }),
  cmd('combat.act', { combatId: id, actorId: id, targetId: id, abilityId: id }),
  cmd('combat.escape', { combatId: id, actorId: id }),
  cmd('combat.enemy-turn', { combatId: id }),
  cmd('characters.rest', { characterId: id }),
  cmd('characters.stop-rest', { characterId: id }),
  cmd('characters.designate-pc', { characterId: id }),
  cmd('quests.accept', { questDefinitionId: id }),
  cmd('quests.claim', { questId: id }),
  cmd('quests.abandon', { questId: id }),
  cmd('rules.create', { rule: RuleSchema }),
  cmd('rules.enable', { ruleId: id, enabled: T.Boolean() }),
  cmd('rules.delete', { ruleId: id }),
  cmd('market.open', { marketId: id, negotiatorId: id }),
  cmd('market.buy', { marketId: id, itemId: id, quantity: positive }),
  cmd('contracts.pay', { contractId: id }),
  cmd('recruitment.accept', { recruitId: id }),
  cmd('notifications.ack', { notificationId: id }),
  cmd('scripts.execute', { scriptId: id, questId: id }),
]);
export type Command = Static<typeof CommandSchema>;
export type CommandType = Command['type'];
export type Payload<N extends CommandType> = Extract<Command, { type: N }>['payload'];
export type Action = { [N in CommandType]: { type: N; payload: Payload<N> } }[CommandType];
export type Result = { ok: true; eventIds: string[]; duplicate: boolean } | { ok: false; code: string; message: string };
export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export const SaveEnvelopeSchema = object({ format: T.Literal('haven-save'), schemaVersion: T.Integer({ minimum: 0, maximum: 1 }),
  engineVersion: T.String(), contentFingerprint: T.String(), checksum: T.String({ pattern: '^[a-f0-9]{64}$' }), state: T.Unknown() });
export const SchemaCatalog = { DefinitionSchema, ManifestSchema, GameStateSchema, CommandSchema, SaveEnvelopeSchema };
