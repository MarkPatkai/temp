import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const target = new URL('apps/game/public/runtime/', root);
await mkdir(target, { recursive: true });
await copyFile(new URL('node_modules/wasmoon/dist/glue.wasm', root), new URL('lua.wasm', target));
