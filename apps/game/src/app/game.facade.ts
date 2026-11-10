import { Injectable, signal } from '@angular/core';
import { ContentRegistry, safePath } from '../../../../packages/content/index';
import { ManifestSchema, type Action, type GameState } from '../../../../packages/contracts/schema';
import { validate } from '../../../../packages/contracts/validation';
import { createGame, restoreGame } from '../../../../packages/application/index';
import { LuaSandbox } from '../../../../packages/scripting/index';
import { BrowserSaveStore, deserialize, serialize, type SaveStore } from '../../../../packages/persistence/index';
import { verificationScenario } from '../../../../packages/testing/scenario';
import type { Engine } from '../../../../packages/core/engine';

@Injectable({ providedIn: 'root' })
export class GameFacade {
  readonly state = signal<GameState | null>(null);
  readonly busy = signal(true);
  readonly message = signal('Loading validated content and Lua…');
  readonly error = signal(false);
  readonly verification = signal<string[]>([]);
  readonly rates = signal<Record<string,number>>({});
  content!: ContentRegistry;
  private engine!: Engine;
  private scripts = new LuaSandbox(new URL('runtime/lua.wasm', document.baseURI).href);
  private storage: SaveStore = new BrowserSaveStore();
  private accumulator = 0;
  private previous = performance.now();
  constructor() { void this.boot(); }
  private async boot(): Promise<void> {
    await this.perform(async () => {
      const response = await fetch('content/manifest.json'); if (!response.ok) throw new Error('Content manifest unavailable');
      const text = await response.text(), manifest = validate(ManifestSchema, JSON.parse(text));
      const files: Record<string, string> = {};
      await Promise.all([...manifest.files, ...manifest.scripts].map(async file => {
        if (!safePath(file)) throw new Error(`Unsafe content path ${file}`);
        const res = await fetch(`content/${file}`); if (!res.ok) throw new Error(`Missing content ${file}`); files[file] = await res.text();
      }));
      this.content = await ContentRegistry.load(text, files);
      this.engine = await createGame(this.content, this.scripts, 'crossroads-001', 'story:start.crossroads');
      // Probe the actual WASM runtime before reporting initialization complete.
      await this.scripts.condition('function run(ctx) return ctx.clock.tick() == 0 end', { tick: 0, questId: 'startup', objectivesComplete: false, itemCounts: {} });
      if ('__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core');
        this.storage = { write: (slot, text) => invoke('save_game', { slot, text }), read: slot => invoke('load_game', { slot }) };
      }
      this.message.set('World initialized. Simulation is paused.');
    });
    setInterval(() => void this.pulse(), 250);
  }
  private async pulse(): Promise<void> {
    const now = performance.now(), elapsed = Math.min(1, (now - this.previous) / 1000); this.previous = now;
    const state = this.state();
    if (!state || state.clock.paused || this.busy() || document.hidden) { this.accumulator = 0; return; }
    this.accumulator += elapsed * state.clock.speed;
    const ticks = Math.floor(this.accumulator);
    if (ticks) { this.accumulator -= ticks; await this.advance(ticks, false); }
  }
  private async perform(work: () => Promise<void>): Promise<void> {
    this.busy.set(true); this.error.set(false);
    try { await work(); }
    catch (error) { console.error('Haven operation failed', error); this.error.set(true); this.message.set(String(error)); }
    finally { if (this.engine) { this.state.set(this.engine.view()); this.rates.set(this.engine.production()); } this.busy.set(false); }
  }
  async send(action: Action): Promise<void> {
    await this.perform(async () => {
      const result = await this.engine.dispatch({ id: `ui-${crypto.randomUUID()}`, ...action });
      if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
      this.message.set(`${action.type} accepted.`);
    });
  }
  async enemyTurn(combatId: string): Promise<void> {
    await this.perform(async () => {
      const result = await this.engine.enemyTurn(combatId, `ui-${crypto.randomUUID()}`);
      if (!result.ok) throw new Error(result.message); this.message.set('Enemy turn resolved.');
    });
  }
  async advance(count: number, report = true): Promise<void> {
    await this.perform(async () => {
      const result = await this.engine.advanceTicks(count); if (!result.ok) throw new Error(result.error);
      if (report) this.message.set(`Advanced ${result.advanced} fixed ticks.`);
    });
  }
  async newWorld(seed: string): Promise<void> {
    await this.perform(async () => { const next = await createGame(this.content, this.scripts, seed, 'story:start.crossroads'); this.engine = next; this.accumulator = 0; this.message.set(`New world: ${seed}`); });
  }
  async save(): Promise<void> {
    await this.perform(async () => { await this.storage.write('manual', await serialize(this.engine.snapshot())); this.message.set('Saved to the local manual slot.'); });
  }
  async load(): Promise<void> {
    await this.perform(async () => {
      const text = await this.storage.read('manual'); if (text === null) throw new Error('No local save yet.');
      const next = restoreGame(await deserialize(text, this.content), this.content, this.scripts); this.engine = next; this.accumulator = 0; this.message.set('Local save restored.');
    });
  }
  async exportSave(): Promise<void> {
    await this.perform(async () => {
      const blob = new Blob([await serialize(this.engine.snapshot())], { type: 'application/json' });
      const href = URL.createObjectURL(blob), link = document.createElement('a'); link.href = href; link.download = 'haven-save.json'; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
      this.message.set('Save exported.');
    });
  }
  async importSave(file: File): Promise<void> {
    await this.perform(async () => {
      if (file.size > 16 * 1024 * 1024) throw new Error('Save exceeds 16 MiB.');
      const next = restoreGame(await deserialize(await file.text(), this.content), this.content, this.scripts); this.engine = next; this.accumulator = 0; this.message.set('Imported save restored.');
    });
  }
  async verify(): Promise<void> {
    await this.perform(async () => {
      this.verification.set([]); const result = await verificationScenario(this.content, this.scripts); this.verification.set(result.checks); this.message.set('Architecture verification passed in an isolated world.');
    });
  }
}
