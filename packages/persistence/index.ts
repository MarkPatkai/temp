import { SaveEnvelopeSchema, type GameState } from '../contracts/schema';
import { requireThat, type ContentPort } from '../contracts/ports';
import { canonical, sha256, validate } from '../contracts/validation';
import { assertState } from '../core/invariants';

const MAX_SAVE = 16 * 1024 * 1024;
export async function serialize(state: GameState): Promise<string> {
  const payload = { format: 'haven-save' as const, schemaVersion: 1, engineVersion: state.engineVersion, contentFingerprint: state.contentFingerprint, state };
  const output = JSON.stringify({ ...payload, checksum: await sha256(canonical(payload)) });
  requireThat(output.length <= MAX_SAVE, 'SAVE_SIZE', 'Save exceeds 16 MiB; archive this development world'); return output;
}
export async function deserialize(text: string, content: ContentPort): Promise<GameState> {
  requireThat(text.length <= MAX_SAVE, 'SAVE_SIZE', 'Save exceeds 16 MiB');
  const raw: unknown = JSON.parse(text); bounded(raw);
  const envelope = validate(SaveEnvelopeSchema, raw, 'save envelope');
  const { checksum, ...payload } = envelope;
  requireThat(checksum === await sha256(canonical(payload)), 'SAVE_CHECKSUM', 'Save checksum does not match');
  requireThat(envelope.contentFingerprint === content.fingerprint, 'CONTENT_MISMATCH', 'Save requires the exact content pack');
  const state = envelope.schemaVersion === 0 ? migrate0to1(envelope.state) : envelope.state;
  assertState(state, content);
  requireThat(state.engineVersion === envelope.engineVersion && state.contentFingerprint === envelope.contentFingerprint,
    'SAVE_METADATA', 'Envelope metadata differs from game state'); return state;
}
function migrate0to1(value: unknown): unknown {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'MIGRATION_INVALID', 'Legacy state is invalid');
  const state = structuredClone(value) as Record<string, unknown>;
  const clock = state['clock'] as Record<string, unknown>;
  requireThat(state['schemaVersion'] === 0 && clock && Number.isSafeInteger(clock['worldTick']), 'MIGRATION_INVALID', 'Legacy worldTick missing');
  state['clock'] = { ...clock, tick: clock['worldTick'] }; delete (state['clock'] as Record<string, unknown>)['worldTick']; state['schemaVersion'] = 1;
  return state;
}
function bounded(value: unknown, depth = 0): void {
  requireThat(depth <= 32, 'SAVE_DEPTH', 'Save nesting exceeds limit');
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    requireThat(!['__proto__', 'constructor', 'prototype'].includes(key), 'SAVE_KEY', 'Reserved object key'); bounded(child, depth + 1);
  }
}
export interface SaveStore { write(slot: string, text: string): Promise<void>; read(slot: string): Promise<string | null> }
export class BrowserSaveStore implements SaveStore {
  private async db(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('haven-foundation', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('saves');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  async write(slot: string, text: string): Promise<void> {
    const db = await this.db();
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite'); tx.objectStore('saves').put(text, slot);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('Save transaction aborted'));
    }); } finally { db.close(); }
  }
  async read(slot: string): Promise<string | null> {
    const db = await this.db();
    try { return await new Promise<string | null>((resolve, reject) => {
      const request = db.transaction('saves', 'readonly').objectStore('saves').get(slot);
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null); request.onerror = () => reject(request.error);
    }); } finally { db.close(); }
  }
}
