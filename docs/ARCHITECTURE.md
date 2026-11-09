# Architecture of the alpha implementation

## Dependencies and composition

`contracts` defines runtime schemas, derived TypeScript types, domain ports, and shared pure helpers. Domain implementations import only their own package and `contracts`. `core` uses contracts without importing Angular or domains. `application` composes every domain into the engine. `content`, `scripting`, and `persistence` provide shared infrastructure.

Run `npm run check:boundaries` to reject cross-domain implementation imports. This is a source import check, not a substitute for review of state ownership.

Each module declares its state slice and registers typed public command handlers, internal effect handlers, tick transitions, event reactions, and optional scheduling. A handler mutates its own slice. Cross-domain mutations go through registered internal effects; cross-domain reads use the read-only transaction view.

Angular uses `GameFacade` for projections and commands. `Engine.view()` filters hidden traits. `Engine.snapshot()` is a full defensive copy for saves and trusted testing. This is a local single-player engine; hidden traits are a presentation boundary rather than a security boundary against someone inspecting their own save.

## Commands and transactions

The public API accepts `{id, type, payload}` and schema-validates it. There is no player-supplied engine/rule authority field. The dispatcher recognizes controller calls separately. Rules execute only an action exactly matching their stored authorization. Script execution validates its host definition's capability and subject scope.

Dispatches and tick batches serialize through one promise queue. A transaction clones the committed state, including RNG and counters. Handlers and reactions operate on this draft. Committing requires schema and semantic state validation. An error discards the draft, including consumed resources, RNG draws, events, and intermediate rewards.

Receipts persist canonical command content and emitted event IDs. Replaying an identical ID/content returns the original result without another effect. Reusing an ID with different content fails.

Rules use child savepoints. A failed action restores its parent draft and event queue, while the rule records its error and cooldown cursor. A transaction is limited to 1,000 handler/effect/reaction operations so feedback cycles fail explicitly.

Events carry a monotonic sequence, simulation tick, type, optional subject definition/entity ID, quantity, and causation ID. Reactions run by stable module ID and append events FIFO. The most recent 500 events form the diagnostics log. Selected achievement events also enter durable history for historical quests.

The state is snapshot-based. The debug log is not an event-sourced reconstruction mechanism.

## Time, work, and RNG

One tick is one normal-speed real second; 600 ticks form an in-game day. The host accumulates real elapsed time and requests whole ticks. Core logic reads no wall clock. `advanceTicks()` is also the explicit headless/debug stepping operation.

Composition orders tick behavior as needs/recovery and contractual obligations, recruitment arrivals, existing travel, work, exploration, and merchant refresh. Reactions drain before interval rules. Scheduling happens last, followed by remaining reactions. Newly scheduled work first accumulates progress on the next tick.

Work uses integer units and integer basis-point modifiers. Traits affect work before discovery. Persistent/protected assignments remain distinct from temporary order execution. Inputs are reserved when an execution starts, consumed on completion, and released on cancellation.

RNG is versioned xorshift32 with FNV-1a-derived initial stream states. Combat, injuries, and item generation use separate named saved streams. Iteration, initiative tie breaks, route tie breaks, and worker selection use explicit ordering rather than locale comparison or object insertion order. Quantities, gold, XP, work, and ticks must remain safe integers.

## Content lifecycle and schema generation

`content/manifest.json` lists definition files and script files. Definitions are arrays in JSON or YAML. YAML custom executable tags and aliases are rejected. The registry validates structures, resolves typed references, freezes definitions, and computes a SHA-256 fingerprint from canonical definitions, manifest metadata, and script text. Initialization requires exactly one `start` definition.

The startup composition validates every script's Lua syntax, top-level chunk, and `run` export under the sandbox. It does not execute the interaction function during export validation.

TypeBox constructs JSON Schema and derives the TypeScript types from the same definitions. AJV compiles standalone validators at development/build time. `packages/contracts/generated/validators.js` executes validation without `new Function` in the browser. Exported schemas are in `docs/schemas`.

After contract changes, regenerate, typecheck, test, and rebuild. Runtime validators do not coerce values or strip unknown fields.

## Lua boundary

Wasmoon embeds Lua 5.4 in WASM. Each call creates and closes a Lua state with allocation tracing and an 8 MiB Lua allocator quota. A Lua count hook stops invocations exceeding 100,000 instructions. Context data is encoded as Lua literals, not bridged JavaScript objects. Result graphs are checked before conversion: depth 16, 4,096 visited nodes, 64 KiB strings, and at most 32 effects.

The environment allowlists selected basic functions, integer-oriented math, basic string functions, table insertion/concatenation, and `ipairs`. It omits IO, OS, package loading, dynamic load, debug, proxies, clocks, random functions, and unordered iteration helpers. Scripts cannot catch and suppress the instruction-hook error through an exposed protected-call function.

API version 1 currently exposes:

```lua
ctx.clock.tick()
ctx.subject.quest_instance_id
ctx.inventory.count("base:item.wood")
ctx.quest.objectives_complete()
ctx.effects.request("quests.claim", {questId = ctx.subject.quest_instance_id})
```

Conditions return a boolean and cannot emit effects. Effects return a validated dense array of allowed intents. Host definitions must grant the `quest.claim` capability, and every intent must refer to the current quest. The engine validates and applies the entire batch in the outer transaction.

Mutable globals exist only for that disposable invocation. They are never game persistence. Instruction quotas cover Lua VM execution; the allowlisted native operations are also constrained by memory/input sizes. The sandbox is a tested capability boundary, not a claim of a formal security audit of Wasmoon or the browser.

## Combat and world separation

A battle references persistent character IDs. HP, resources, injuries, and equipped instances remain in character/inventory state. Battle state owns rows, initiative, round, current actor, escaped actors, and outcome.

No tick transition calls combat actions. Allied actions validate a fresh command against the current actor. The explicit enemy controller uses the same costs, targeting, and effects. Ordinary melee attacks the foremost conscious opposing row; extended reach may bypass it. Ranged accuracy depends on formation distance. Incapacitation leaves row assignments unchanged. Zero HP never invokes a death transition.

Party visit IDs reset on arrival at a different node. Combat completion sets that visit's random-hostile-safety flag and enters a pending post-combat mode. Explicit exploration or travel can resume it; an existing authorized event rule may also issue a permitted action.

## Quests and exactly-once effects

World-state objectives recompute eligible shared stock at claim. Historical objectives read durable achievements. Commissioned objectives accept only event sequences after acceptance. Exclusive contributions allocate one event within a declared group; consumptive objectives validate and consume quantities in the reward transaction.

A claim checks objectives and optional Lua condition, consumes inputs, posts gold, stores a reward receipt, and changes lifecycle state atomically. Completed quests cannot be claimed again, even under a different command ID.

## Persistence and platforms

Save envelopes include format/schema/engine version, content fingerprint, checksum, and full authoritative state. The checksum covers payload metadata and state. Loading applies bounded parsing, envelope validation, checksum verification, migration, content matching, state schema validation, and semantic reference checks before replacing the active engine. Checksums detect corruption; they do not establish authenticity.

The v0 migration renames `clock.worldTick` to `clock.tick` and updates the state schema version. It is a fixture demonstrating migration infrastructure; this project has no earlier released save format.

IndexedDB writes use one transaction. Desktop source writes a temporary file in the app-data saves directory, flushes/closes it, then renames it. Custom Rust commands accept only bounded alphanumeric slot names; there is no arbitrary path API. Portable JSON export/import uses the same serialization.

Production CSS avoids inline event-handler loading, and validators avoid runtime JavaScript compilation. The preview server and Tauri configuration use a CSP allowing local scripts and WASM compilation without general JavaScript `unsafe-eval`. Development tooling may have a different CSP. All runtime content/assets are local.
