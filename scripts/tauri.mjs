import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const child = spawn(process.execPath, [fileURLToPath(new URL('node_modules/@tauri-apps/cli/tauri.js', root)), ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('apps/game/', root)), stdio: 'inherit'
});
child.on('exit', code => process.exit(code ?? 1));
