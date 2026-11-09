import { LuaFactory } from 'wasmoon';
import { GameError, requireThat, type ScriptPort, type ScriptSnapshot } from '../contracts/ports';

// UTF-8 decimal byte escapes avoid Lua/JavaScript quoting differences and code injection.
function quote(text: string): string {
  return '"' + [...new TextEncoder().encode(text)].map(b => '\\' + b.toString().padStart(3, '0')).join('') + '"';
}
function literal(snapshot: ScriptSnapshot): string {
  const counts = Object.keys(snapshot.itemCounts).sort().map(k => `[${quote(k)}]=${snapshot.itemCounts[k]}`).join(',');
  return `{tick=${snapshot.tick},questId=${quote(snapshot.questId)},objectivesComplete=${snapshot.objectivesComplete},itemCounts={${counts}}}`;
}
export class LuaSandbox implements ScriptPort {
  private readonly factory: LuaFactory;
  constructor(wasmUri?: string) { this.factory = new LuaFactory(wasmUri); }
  async validate(source: string, mode: 'condition' | 'effect'): Promise<void> {
    await this.run(source, { tick: 0, questId: 'validation', objectivesComplete: false, itemCounts: {} }, mode, false);
  }
  async condition(source: string, snapshot: ScriptSnapshot): Promise<boolean> {
    const result = await this.run(source, snapshot, 'condition');
    requireThat(typeof result === 'boolean', 'SCRIPT_RETURN', 'Condition must return boolean');
    return result;
  }
  async effect(source: string, snapshot: ScriptSnapshot): Promise<Array<{ type: 'quests.claim'; questId: string }>> {
    const result = await this.run(source, snapshot, 'effect');
    requireThat(Array.isArray(result) && result.length <= 32, 'SCRIPT_RETURN', 'Effect must return an array of at most 32 intents');
    for (const intent of result) {
      requireThat(intent && typeof intent === 'object' && Object.keys(intent).sort().join(',') === 'questId,type' &&
        intent.type === 'quests.claim' && intent.questId === snapshot.questId, 'SCRIPT_CAPABILITY', 'Unsupported or out-of-scope intent');
    }
    return result;
  }
  private async run(source: string, snapshot: ScriptSnapshot, mode: 'condition' | 'effect', execute = true): Promise<unknown> {
    requireThat(new TextEncoder().encode(source).length <= 65536, 'SCRIPT_SIZE', 'Script exceeds 64 KiB');
    const lua = await this.factory.createEngine({ injectObjects: false, enableProxy: false, traceAllocations: true });
    try {
      lua.global.setMemoryMax(8 * 1024 * 1024);
      // Only plain Lua values cross this boundary. There are no JS callbacks or proxies.
      const wrapper = `
local rawtype, rawpairs = type, pairs
local function lock(t)
  local copy = {}
  for k,v in rawpairs(t) do copy[k] = rawtype(v) == 'table' and lock(v) or v end
  return setmetatable({}, {__index=copy, __newindex=function() error('read-only context') end, __metatable=false})
end
local snapshot = ${literal(snapshot)}
local context = lock({
  clock={tick=function() return snapshot.tick end},
  subject={quest_instance_id=snapshot.questId},
  inventory={count=function(id) return snapshot.itemCounts[id] or 0 end},
  quest={objectives_complete=function() return snapshot.objectivesComplete end},
  effects={request=function(kind, payload)
    if ${quote(mode)} ~= 'effect' then error('conditions cannot emit effects') end
    if kind ~= 'quests.claim' or payload.questId ~= snapshot.questId then error('unsupported intent') end
    return {type=kind, questId=payload.questId}
  end}
})
local env = {
  assert=assert, error=error, ipairs=ipairs, type=type, tonumber=tonumber,
  math=lock({abs=math.abs, floor=math.floor, min=math.min, max=math.max}),
  string=lock({len=string.len, sub=string.sub, lower=string.lower, upper=string.upper}),
  table=lock({insert=table.insert, concat=table.concat})
}
local chunk, message = load(${quote(source)}, 'content', 't', env)
if not chunk then error(message) end
local instructions = 0
debug.sethook(function()
  instructions = instructions + 1000
  if instructions > 100000 then error('instruction quota exceeded') end
end, '', 1000)
chunk()
if rawtype(env.run) ~= 'function' then error('missing run export') end
if ${execute ? 'false' : 'true'} then debug.sethook(); return true end
local result = env.run(context)
if ${quote(mode)} == 'condition' then
  if rawtype(result) ~= 'boolean' then error('condition must return boolean') end
else
  if rawtype(result) ~= 'table' then error('effect must return intent array') end
  local seen, size, nodes = {}, 0, 0
  local function check(v, depth)
    nodes = nodes + 1
    if depth > 16 or nodes > 4096 then error('result complexity exceeded') end
    if rawtype(v) == 'table' then
      if seen[v] then error('cyclic or aliased result') end
      seen[v] = true
      for k,x in rawpairs(v) do check(k, depth+1); check(x, depth+1) end
    elseif rawtype(v) == 'string' then size = size + #v
    elseif rawtype(v) == 'number' then
      if v ~= v or v > 9007199254740991 or v < -9007199254740991 or v % 1 ~= 0 then error('invalid result number') end
    elseif rawtype(v) ~= 'boolean' and rawtype(v) ~= 'nil' then error('invalid result value') end
    if size > 65536 then error('result size exceeded') end
  end
  check(result, 0)
  local count = 0
  for k in rawpairs(result) do
    count = count + 1
    if rawtype(k) ~= 'number' or k < 1 or k > 32 or k % 1 ~= 0 then error('invalid intent array index') end
  end
  if count == 0 then result = nil
  elseif count ~= #result or count > 32 then error('sparse or excessive intents') end
end
debug.sethook()
return result
`;
      const result: unknown = lua.doStringSync(wrapper);
      return mode === 'effect' && result == null ? [] : result;
    } catch (error) { throw new GameError('SCRIPT_FAILED', String(error)); }
    finally { lua.global.close(); }
  }
}
