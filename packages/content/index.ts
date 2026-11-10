import { parseDocument } from 'yaml';
import { DefinitionSchema, ManifestSchema, type Definition, type Def, type Manifest } from '../contracts/schema';
import { validate, canonical, sha256 } from '../contracts/validation';
import { compare, GameError, requireThat, type ContentPort } from '../contracts/ports';

function parse(text: string, file: string): unknown {
  requireThat(text.length <= 1_000_000, 'CONTENT_SIZE', `${file}: document too large`);
  try {
    if (file.endsWith('.json')) return JSON.parse(text);
    const document = parseDocument(text, { version: '1.2', uniqueKeys: true, customTags: [] });
    requireThat(!document.errors.length && !document.warnings.length, 'YAML_INVALID', `${file}: ${[...document.errors, ...document.warnings].join('; ')}`);
    return document.toJS({ maxAliasCount: 0 });
  } catch (error) { throw new GameError('CONTENT_PARSE', `${file}: ${String(error)}`); }
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); for (const v of Object.values(value)) freeze(v); }
  return value;
}
export class ContentRegistry implements ContentPort {
  private constructor(private readonly definitions: ReadonlyMap<string, Definition>,
    private readonly sources: ReadonlyMap<string, string>, readonly fingerprint: string, readonly manifest: Manifest) {}

  static async load(manifestText: string, files: Record<string, string>): Promise<ContentRegistry> {
    const manifest = validate(ManifestSchema, JSON.parse(manifestText), 'manifest.json');
    const definitions = new Map<string, Definition>();
    const scripts = new Map<string, string>();
    for (const file of [...manifest.files].sort(compare)) {
      requireThat(safePath(file) && files[file] !== undefined, 'CONTENT_FILE', `Missing or unsafe content file: ${file}`);
      const values = parse(files[file], file);
      requireThat(Array.isArray(values) && values.length <= 1000, 'CONTENT_ARRAY', `${file}: expected definition array`);
      for (const raw of values) {
        const def = validate(DefinitionSchema, raw, file);
        requireThat(!definitions.has(def.id), 'CONTENT_DUPLICATE', `${file}: duplicate ${def.id}`);
        definitions.set(def.id, freeze(def));
      }
    }
    for (const file of manifest.scripts) {
      requireThat(safePath(file) && typeof files[file] === 'string', 'SCRIPT_FILE', `Missing or unsafe script: ${file}`);
      requireThat(files[file].length <= 65536, 'SCRIPT_SIZE', `${file}: script exceeds 64 KiB`);
      scripts.set(file, files[file]);
    }
    const fingerprint = await sha256(canonical({ manifest, definitions: [...definitions.values()], scripts: [...scripts].sort(([a], [b]) => compare(a, b)) }));
    const registry = new ContentRegistry(definitions, scripts, fingerprint, freeze(manifest));
    registry.resolve();
    return registry;
  }
  get<K extends Definition['kind']>(definitionId: string, kind: K): Def<K> {
    const definition = this.definitions.get(definitionId);
    requireThat(definition?.kind === kind, 'CONTENT_REFERENCE', `${definitionId}: expected ${kind}`);
    return definition as Def<K>;
  }
  list<K extends Definition['kind']>(kind: K): Def<K>[] {
    return [...this.definitions.values()].filter((d): d is Def<K> => d.kind === kind).sort((a, b) => compare(a.id, b.id));
  }
  script(file: string): string {
    const source = this.sources.get(file);
    requireThat(source !== undefined, 'SCRIPT_FILE', `Missing script ${file}`);
    return source;
  }
  private resolve(): void {
    for (const d of this.definitions.values()) {
      try {
        switch (d.kind) {
          case 'interaction': this.get(d.npcId,'character'); this.get(d.locationId,'location'); this.get(d.questId,'quest');
            requireThat(new Set(d.choices.map(c=>c.id)).size===d.choices.length,'CONTENT_DUPLICATE','Duplicate dialogue choice');
            for (const id of d.requires) this.get(id,'interaction');
            { const walk=(id:string, chain:string[]):void=>{requireThat(!chain.includes(id),'CONTENT_CYCLE','Dialogue prerequisites contain a cycle');for(const parent of this.get(id,'interaction').requires) walk(parent,[...chain,id]);};walk(d.id,[]); } break;
          case 'recipe': this.get(d.facilityId, 'facility'); for (const q of [...d.inputs, ...d.outputs]) this.get(q.itemId, 'item'); break;
          case 'research': this.get(d.facilityId, 'facility'); break;
          case 'connection': this.get(d.from, 'location'); this.get(d.to, 'location'); requireThat(d.from !== d.to, 'CONTENT_REFERENCE', 'Self connection'); break;
          case 'location': if (d.encounterId) this.get(d.encounterId, 'encounter'); break;
          case 'encounter': for (const id of d.enemies) this.get(id, 'character'); for (const id of d.abilities) this.get(id, 'ability'); break;
          case 'quest': {
            requireThat(new Set(d.objectives.map(o => o.id)).size === d.objectives.length, 'CONTENT_DUPLICATE', 'Duplicate objective ID');
            for (const o of d.objectives) {
              if (o.itemId) this.get(o.itemId, 'item');
              if (o.subjectId) requireThat(this.definitions.has(o.subjectId), 'CONTENT_REFERENCE', `Missing subjectId ${o.subjectId}`);
              requireThat((o.tracking === 'world-state' || o.contribution === 'consumptive') ? !!o.itemId : true, 'CONTENT_REFERENCE', 'Item-based objective requires itemId');
              requireThat(o.contribution !== 'exclusive' || !!o.exclusiveGroup, 'CONTENT_REFERENCE', 'Exclusive objective requires group');
            }
            if (d.conditionScript) requireThat(this.get(d.conditionScript, 'script').mode === 'condition', 'SCRIPT_MODE', 'Quest requires condition script');
            break;
          }
          case 'recruit': this.get(d.characterId, 'character'); this.get(d.originId, 'location'); for (const q of d.serviceOutputs) this.get(q.itemId, 'item'); break;
          case 'start': this.get(d.locationId, 'location'); for (const id of d.characters) this.get(id, 'character'); for (const id of d.facilities) this.get(id, 'facility'); for (const q of d.items) this.get(q.itemId, 'item'); break;
          case 'market': this.get(d.locationId, 'location'); for (const q of d.stock) this.get(q.itemId, 'item'); break;
          case 'script': this.script(d.file); requireThat(d.mode === 'effect' || d.capabilities.length === 0, 'SCRIPT_CAPABILITY', 'Conditions cannot request effects'); break;
        }
      } catch (error) { throw new GameError('CONTENT_REFERENCE', `${d.id}: ${String(error)}`); }
    }
  }
}
export function safePath(file: string): boolean {
  return !file.startsWith('/') && !file.includes('..') && !file.includes('\\') && /^[\w./-]+$/.test(file);
}
