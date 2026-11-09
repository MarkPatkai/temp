import { describe, it, expect } from 'vitest';
import { content, scripts, game, advance } from './helpers';
import { verificationScenario } from '../packages/testing/scenario';
import { serialize, deserialize } from '../packages/persistence/index';
import { restoreGame } from '../packages/application/index';
import { canonical, sha256 } from '../packages/contracts/validation';

describe('architecture integration and persistence', () => {
  it('runs the entire cross-domain scenario and repeats deterministically', async () => {
    const a = await verificationScenario(content, scripts), b = await verificationScenario(content, scripts);
    expect(a.checks).toHaveLength(7); expect(canonical(a.engine.snapshot())).toBe(canonical(b.engine.snapshot()));
  });
  it('continues identically after save/load including RNG and ongoing work', async () => {
    const a = await game(); await advance(a, 3); const b = restoreGame(await deserialize(await serialize(a.snapshot()), content), content, scripts);
    await advance(a, 12); await advance(b, 12); expect(canonical(a.snapshot())).toBe(canonical(b.snapshot()));
  });
  it('rejects corrupt, future-version, and incompatible saves without touching the active session', async () => {
    const engine = await game(), before = canonical(engine.snapshot()), saved = await serialize(engine.snapshot());
    const envelope = JSON.parse(saved); envelope.state.economy.gold++;
    await expect(deserialize(JSON.stringify(envelope), content)).rejects.toThrow('checksum');
    envelope.schemaVersion = 999; await expect(deserialize(JSON.stringify(envelope), content)).rejects.toThrow();
    envelope.schemaVersion = 1; envelope.contentFingerprint = 'a'.repeat(64); const { checksum, ...payload } = envelope;
    envelope.checksum = await sha256(canonical(payload)); await expect(deserialize(JSON.stringify(envelope), content)).rejects.toThrow('exact content');
    expect(canonical(engine.snapshot())).toBe(before);
  });
  it('migrates the genuine v0 worldTick field to v1 tick', async () => {
    const state = (await game()).snapshot();
    const { tick, ...clock } = state.clock;
    const old = { ...state, schemaVersion: 0, clock: { ...clock, worldTick: tick } };
    const payload = { format: 'haven-save', schemaVersion: 0, engineVersion: state.engineVersion, contentFingerprint: content.fingerprint, state: old };
    expect(await deserialize(JSON.stringify({ ...payload, checksum: await sha256(canonical(payload)) }), content)).toEqual(state);
  });
  it('rejects deeply nested save input before hashing or activation', async () => {
    const value = '['.repeat(40) + '0' + ']'.repeat(40);
    await expect(deserialize(value, content)).rejects.toThrow('nesting');
  });
});
