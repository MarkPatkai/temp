import { readFile } from 'node:fs/promises';
import { ContentRegistry, safePath } from '../packages/content/index';
import { ManifestSchema } from '../packages/contracts/schema';
import { validate } from '../packages/contracts/validation';
export async function readContent() {
  const root = new URL('../content/', import.meta.url), text = await readFile(new URL('manifest.json', root), 'utf8');
  const manifest = validate(ManifestSchema, JSON.parse(text));
  const files: Record<string, string> = {};
  for (const file of [...manifest.files, ...manifest.scripts]) {
    if (!safePath(file)) throw new Error(`Unsafe content path: ${file}`);
    files[file] = await readFile(new URL(file, root), 'utf8');
  }
  return { text, files, registry: await ContentRegistry.load(text, files) };
}
