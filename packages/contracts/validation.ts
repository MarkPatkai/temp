import type { ValidateFunction } from 'ajv';
import type { Static, TSchema } from '@sinclair/typebox';
import { GameError } from './ports';
import { SchemaCatalog } from './schema';
import * as compiled from './generated/validators';

const validators = new Map<TSchema, ValidateFunction>(Object.entries(SchemaCatalog).map(([name, schema]) => [schema, compiled[name as keyof typeof compiled] as unknown as ValidateFunction]));
export function validate<S extends TSchema>(schema: S, value: unknown, label = 'input'): Static<S> {
  const check = validators.get(schema);
  if (!check) throw new GameError('SCHEMA_UNREGISTERED', 'Regenerate standalone validators for this schema');
  if (!check(value)) throw new GameError('SCHEMA_INVALID', `${label}: ${(check.errors ?? []).slice(0, 20).map(e => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);
  return value as Static<S>;
}
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const rec = value as Record<string, unknown>;
  return `{${Object.keys(rec).sort().map(k => `${JSON.stringify(k)}:${canonical(rec[k])}`).join(',')}}`;
}
export async function sha256(value: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
