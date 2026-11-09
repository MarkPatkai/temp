import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('packages');
const infrastructure = {
  contracts: new Set(['contracts']), core: new Set(['core', 'contracts']),
  content: new Set(['content', 'contracts']), scripting: new Set(['scripting', 'contracts']),
  persistence: new Set(['persistence', 'contracts', 'core'])
};
const errors = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { await walk(file); continue; }
    if (!file.endsWith('.ts')) continue;
    const owner = path.relative(root, file).split(path.sep)[0];
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) {
        if (!['contracts', 'content', 'scripting'].includes(owner)) errors.push(`${file}: external dependency ${specifier}`);
        continue;
      }
      const target = path.relative(root, path.resolve(path.dirname(file), specifier)).split(path.sep)[0];
      if (owner === 'application' || owner === 'testing') continue;
      if (!(infrastructure[owner] ?? new Set([owner, 'contracts'])).has(target)) errors.push(`${file}: ${owner} imports ${target}`);
    }
  }
}
await walk(root);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Module boundaries verified.');
