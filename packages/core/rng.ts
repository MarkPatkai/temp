// xorshift32-v1. Bitwise operators specify unsigned 32-bit behavior on all targets.
export function seedStream(seed: string, stream: string): number {
  let value = 2166136261;
  for (const byte of new TextEncoder().encode(`${seed}:${stream}`)) value = Math.imul(value ^ byte, 16777619) >>> 0;
  return value || 1;
}
export function next(state: number): number {
  let value = state | 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  return value >>> 0;
}
