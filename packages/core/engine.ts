import { CommandSchema, type Action, type Command, type CommandType, type DomainEvent, type GameState, type Result, type StateKey } from '../contracts/schema';
import { GameError, requireThat, isAvailable, type ContentPort, type Context, type DomainModule, type Effects, type ScriptPort } from '../contracts/ports';
import { canonical, validate } from '../contracts/validation';
import { assertState } from './invariants';
import { next, seedStream } from './rng';

// Type erasure exists only in composition. Domain implementations retain typed payloads and slices.
type BoundModule = { id: string; slice: StateKey;
  commands?: Partial<Record<CommandType, (ctx: Context<StateKey>, payload: never) => void | Promise<void>>>;
  effects?: Partial<Record<keyof Effects, (ctx: Context<StateKey>, payload: never) => unknown>>;
  tick?: (ctx: Context<StateKey>) => void | Promise<void>;
  schedule?: (ctx: Context<StateKey>) => void;
  react?: (ctx: Context<StateKey>, event: DomainEvent) => void | Promise<void>;
};
export function bind<K extends StateKey>(module: DomainModule<K>): BoundModule { return module as unknown as BoundModule; }
export class Engine {
  private committed: GameState;
  private draft: GameState | null = null;
  private pending: DomainEvent[] = [];
  private operations = 0;
  private cause = 'initialize';
  private queue: Promise<unknown> = Promise.resolve();
  private readonly commands = new Map<CommandType, BoundModule>();
  private readonly effects = new Map<keyof Effects, BoundModule>();
  constructor(state: GameState, readonly content: ContentPort, private readonly scripts: ScriptPort, private readonly modules: BoundModule[]) {
    this.committed = structuredClone(state);
    for (const module of modules) {
      for (const name of Object.keys(module.commands ?? {}) as CommandType[]) { requireThat(!this.commands.has(name), 'MODULE_DUPLICATE', name); this.commands.set(name, module); }
      for (const name of Object.keys(module.effects ?? {}) as (keyof Effects)[]) { requireThat(!this.effects.has(name), 'MODULE_DUPLICATE', name); this.effects.set(name, module); }
    }
  }
  production(): Record<string, number> {
    const result: Record<string,number> = {}, state=this.committed;
    for(const order of Object.values(state.jobs.orders)) {
      if(order.kind!=='craft'||order.status!=='running'||!order.workerId||!isAvailable(state,order.workerId)) continue;
      const recipe=this.content.get(order.definitionId,'recipe'), char=state.characters[order.workerId];
      const modifier=10000+char.traits.reduce((n,t)=>n+t.workBonus,0)+Math.floor((char.skills[recipe.skill]??0)/100)*100;
      const rate=Math.max(1,Math.floor(char.workRate*modifier/10000));
      for(const output of recipe.outputs) result[output.itemId]=(result[output.itemId]??0)+output.quantity*rate/recipe.work;
    }
    return result;
  }
  snapshot(): GameState { return structuredClone(this.committed); }
  view(): GameState {
    const state = this.snapshot(); for (const char of Object.values(state.characters)) char.traits = char.traits.filter(t => !t.hidden); return state;
  }
  private enqueue<T>(task: () => Promise<T>): Promise<T> { const next = this.queue.then(task); this.queue = next.catch(() => undefined); return next; }
  dispatch(input: unknown): Promise<Result> { return this.enqueue(() => this.command(input, false)); }
  enemyTurn(combatId: string, commandId: string): Promise<Result> {
    return this.enqueue(() => this.command({ id: commandId, type: 'combat.enemy-turn', payload: { combatId } }, true));
  }
  private async command(input: unknown, controller: boolean): Promise<Result> {
    try {
      const command = validate(CommandSchema, input, 'command');
      requireThat(command.type !== 'combat.enemy-turn' || controller, 'COMMAND_AUTHORITY', 'Use the explicit combat controller');
      const serialized = canonical(command), previous = this.committed.receipts[command.id];
      if (previous) {
        requireThat(previous.canonicalCommand === serialized, 'COMMAND_ID_REUSED', 'Command ID was reused with different content');
        return { ok: true, duplicate: true, eventIds: [...previous.eventIds] };
      }
      let eventIds: string[] = [];
      await this.transaction(command.id, async () => {
        const start = this.current().lastEventSequence;
        if (command.type === 'clock.configure') this.current().clock = { ...this.current().clock, ...command.payload };
        else if (command.type === 'characters.designate-pc') {
          requireThat(this.current().characters[command.payload.characterId]?.controlled, 'CHARACTER_CONTROL', 'PC must be a controlled character');
          this.current().playerCharacterId = command.payload.characterId;
        } else if (command.type === 'notifications.ack') {
          const notification = this.current().notifications.find(n => n.id === command.payload.notificationId);
          requireThat(notification, 'NOTIFICATION_MISSING', 'Notification not found'); notification.acknowledged = true;
        } else await this.invoke(command);
        await this.drain();
        eventIds = Array.from({ length: this.current().lastEventSequence - start }, (_, i) => `event-${start + i + 1}`);
        this.current().receipts[command.id] = { canonicalCommand: serialized, eventIds };
      });
      return { ok: true, eventIds, duplicate: false };
    } catch (error) { return failure(error); }
  }
  advanceTicks(count: number): Promise<{ ok: boolean; advanced: number; error?: string }> {
    return this.enqueue(async () => {
      if (!Number.isSafeInteger(count) || count < 0 || count > 10000) return { ok: false, advanced: 0, error: 'Tick count must be between 0 and 10000' };
      let advanced = 0;
      try {
        for (; advanced < count; advanced++) await this.transaction(`tick-${this.committed.clock.tick + 1}`, async () => {
          this.current().clock.tick++;
          // Composition order defines deterministic tick phases; reactions always drain between phases.
          for (const module of this.modules.filter(m => m.id !== 'rules')) { if (module.tick) await module.tick(this.context(module.slice)); }
          await this.drain();
          const rules = this.modules.find(m => m.id === 'rules'); if (rules?.tick) await rules.tick(this.context(rules.slice));
          for (const module of this.modules) module.schedule?.(this.context(module.slice));
          await this.drain();
        });
        return { ok: true, advanced };
      } catch (error) {
        // Registered engine fault transition: failed tick is rolled back, clock is paused.
        this.committed.clock.paused = true;
        return { ok: false, advanced, error: String(error) };
      }
    });
  }
  async initialize(startId: string): Promise<void> {
    await this.transaction('initialize', async () => {
      const start = this.content.get(startId, 'start');
      for (const id of start.characters) {
        const characterId = this.effect('character.spawn', { definitionId: id, locationId: start.locationId }) as string;
        if (this.current().playerCharacterId === null) this.current().playerCharacterId = characterId;
      }
      for (const id of start.facilities) {
        const command: Command = { id: `initialize-${id}`, type: 'haven.build', payload: { facilityDefinitionId: id } }; await this.invoke(command);
      }
      for (const item of start.items) this.effect('inventory.produce', { definitionId: item.itemId, quantity: item.quantity });
      await this.drain();
    });
  }
  private current(): GameState { requireThat(this.draft, 'TRANSACTION_REQUIRED', 'Mutation outside transaction'); return this.draft; }
  private async transaction(cause: string, work: () => Promise<void>): Promise<void> {
    this.draft = structuredClone(this.committed); this.pending = []; this.operations = 0; this.cause = cause;
    try { await work(); assertState(this.current(), this.content); this.committed = this.current(); }
    finally { this.draft = null; this.pending = []; }
  }
  private async invoke(command: Pick<Command, 'type' | 'payload'>): Promise<void> {
    requireThat(++this.operations <= 1000, 'REACTION_LIMIT', 'Transaction operation limit exceeded');
    const module = this.commands.get(command.type);
    requireThat(module, 'COMMAND_UNSUPPORTED', `Unsupported command ${command.type}`);
    await module.commands![command.type]!(this.context(module.slice), command.payload as never);
  }
  private effect<N extends keyof Effects>(name: N, payload: Effects[N]): unknown {
    requireThat(++this.operations <= 1000, 'REACTION_LIMIT', 'Transaction effect limit exceeded');
    const module = this.effects.get(name); requireThat(module, 'EFFECT_UNSUPPORTED', name);
    return module.effects![name]!(this.context(module.slice), payload as never);
  }
  private async drain(): Promise<void> {
    const modules = [...this.modules].sort((a, b) => a.id < b.id ? -1 : 1);
    while (this.pending.length) {
      requireThat(++this.operations <= 1000, 'REACTION_LIMIT', 'Transaction reaction limit exceeded');
      const event = this.pending.shift()!;
      for (const module of modules) if (module.react) await module.react(this.context(module.slice), event);
    }
  }
  private context<K extends StateKey>(slice: K): Context<K> {
    const engine = this;
    return {
      get state() { return engine.current()[slice]; }, content: this.content, scripts: this.scripts,
      get cause() { return engine.cause; }, read: () => engine.current(),
      allocate(prefix) { const s = engine.current(); const n = s.counters[prefix] = (s.counters[prefix] ?? 0) + 1; return `${prefix}-${n}`; },
      random(stream, maximum) {
        requireThat(Number.isSafeInteger(maximum) && maximum > 0 && maximum <= 4294967295, 'RNG_RANGE', 'Invalid random range');
        const s = engine.current(), value = next(s.rng[stream] ?? seedStream(s.seed, stream)); s.rng[stream] = value; return value % maximum;
      },
      emit(type, subjectId, quantity = 1) {
        const s = engine.current(), sequence = ++s.lastEventSequence;
        const event: DomainEvent = { id: `event-${sequence}`, sequence, tick: s.clock.tick, type, subjectId: subjectId ?? null, quantity, cause: engine.cause };
        s.events.push(event); if (s.events.length > 500) s.events.shift();
        if (['job.completed', 'combat.victory', 'exploration.surveyed', 'inventory.item-created', 'travel.arrived', 'story.interacted'].includes(type)) s.history.push(event);
        engine.pending.push(event);
      },
      notify(message, subjectId, action, severity = 'info') {
        const s = engine.current(); const id = this.allocate('notification');
        s.notifications.push({ id, tick: s.clock.tick, message: message.slice(0, 1000), subjectId: subjectId ?? null, action: action ?? null, severity, acknowledged: false });
      },
      effect: (name, payload) => engine.effect(name, payload),
      async executeAuthorized(ruleId, action) {
        const rule = engine.current().rules[ruleId];
        requireThat(rule?.enabled && canonical(rule.action) === canonical(action), 'RULE_AUTHORITY', 'Action is outside rule authorization');
        const parent = engine.current(), queue = [...engine.pending];
        engine.draft = structuredClone(parent);
        try { await engine.invoke(action); assertState(engine.current(), engine.content); }
        catch (error) { engine.draft = parent; engine.pending = queue; throw error; }
      },
    };
  }
}
function failure(error: unknown): Result { return { ok: false, code: error instanceof GameError ? error.code : 'ENGINE_ERROR', message: String(error) }; }
