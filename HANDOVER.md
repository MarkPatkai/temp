# Local implementation handover

## What this delivery establishes

This alpha starts the implementation described in the consolidated design and the architecture specification. It contains working behavior rather than empty module scaffolds. Browser initialization, Lua, a cross-domain scenario, and persistence can all be exercised locally without cloud infrastructure.

The version number is an **alpha of the 0.1 foundation**, not an assertion that every release gate from the full specification is complete. Native Tauri verification is outstanding.

## Implemented contracts

| Area | Working behavior | Ownership |
|---|---|---|
| Application | Angular standalone components, nine development panels, facade, explicit commands | `apps/game` |
| Core | Seeded xorshift32 streams, fixed ticks, serialized async dispatch, rollback, receipts, stable event reactions | `core` |
| Content | JSON/YAML parsing, strict JSON Schema, immutable registries, reference checking, SHA-256 fingerprint | `content`, `contracts` |
| Lua | Lua 5.4 WASM, isolated invocations, export validation, read-only context, instruction/memory/result limits, authorized quest intents | `scripting` |
| Characters | Persistent identity, designated PC, needs, hidden-trait filtering, XP, skills, injuries, explicitly ordered recovery | `characters` |
| Haven | Facility instances, separate workstation/worker limits, protected assignments, work-unit execution | `haven`, `jobs` |
| Crafting/research | Input reservation and cancellation, unique outputs, skill XP, research unlock | `jobs` |
| Inventory | Item/stack instances, quantity-preserving operations, ownership/protection/reservation, deliveries and partial claims | `inventory` |
| Equipment | Work/Combat instance loadouts, atomic swaps, ownership validation, Outfit selection | `equipment` |
| Economy | Treasury ledger, surplus sale, market access/stock/refresh/bartering modifier, wages | `economy`, `market`, `recruitment` |
| Recruitment | Paid recruitment, delayed arrival, membership on arrival, wage accrual/suspension, external services | `recruitment` |
| Relationships | Persistent trust edges and a recruitment trust effect | `characters` |
| Adventure | Party creation/formation, fastest accessible routes, waypoints, edge progress/cancellation | `parties`, `travel`, `world` |
| Exploration | Progress, encounter decision, Fight/Avoid/Retreat, visit-specific hostile safety | `exploration` |
| Combat | Persistent character references, individual initiative, manual allied input, common targeting/cost validation, enemy controller, independent battles | `combat` |
| Quests | Lifecycle, current/historical/commissioned tracking, shared/exclusive/consumptive contributions, Lua condition, exactly-once claim | `quests` |
| Rules | Explicit authorization, interval/event triggers, priorities, cooldowns, enable/disable/delete, failed-action savepoints | `rules` |
| Persistence | Full snapshots, metadata/checksum validation, initial migration, browser IndexedDB, import/export | `persistence` |
| Desktop | Tauri 2 source, window/CSP configuration, atomic app-data save adapter, icons | `apps/game/src-tauri` |

Several proposed logical packages are intentionally grouped. Needs, health, progression, and relationships live beside character behavior; crafting/research are job executions; Outfits are equipment commands; contracts are in recruitment. There are no empty profession or research services to disguise missing work.

## Next local tasks, in order

### 1. Verify and lock the native build

Install Tauri prerequisites, run `npm run tauri:dev`, and exercise the same UI and isolated scenario. Save twice to the same native slot; quit, reopen, and load. Run `npm run tauri:build` and launch the built application. Commit Cargo.lock after resolution. Test each intended OS; source configuration alone does not establish cross-platform support.

### 2. Close remaining 0.1 contract gaps

- Recruitment currently uses an explicit authored arrival duration. It does not yet traverse saved world edges like a player party. Replace this with an inbound traveler using shared routing and access contracts; retain physical membership-on-arrival semantics.
- Party membership is fixed after creation. Add validated add/remove/dissolve commands without breaking historical battle references.
- Broaden the Lua capability API beyond tick, available item count, quest readiness, and scoped quest claim. Add character/world queries and reusable allowlisted effects as required; keep per-invocation limits and atomic batches.
- Add schema-governed namespaced persistent script data. VM globals must remain disposable.
- Extend notifications from subject/action identifiers to fully typed action descriptors with complete command payload contracts and inbox navigation.
- Add validated commands/transitions for quest failure and expiration. Those statuses are represented, but only acceptance, readiness, claim, and abandonment have active behavior in this alpha.
- Harden content diagnostics to attach precise field paths and originating files to all reference errors. Add explicit maximum nesting and duplicate material-ID validation to the content ingestion pipeline.
- Extend saved-state semantic validation and counter/reference consistency for imported edge cases; the present validator covers critical relationships but is not an exhaustive proof of every possible state invariant.

### 3. Develop generic domain capabilities before 0.2 content

Construction currently creates a free instantaneous facility and is labeled as development functionality. Add authorized time/resource-based construction. Develop housing, feeding and food preferences, richer needs/health, trait discovery, recruitment conditions, and contract consequences through generic domain contracts.

Combat uses deliberately simple damage and enemy priorities. Add ability-defined defenses and effects, healing/target scope, specialized costs, scripted surrender, and richer encounter rewards before treating the combat design as fully implemented. Incapacitation and the absence of combat death must remain invariant.

Research, relationships, economy, and recruitment each have minimal functional behavior. They are not complete game systems. The sample region, recipes, and quests exist for verification, not campaign content.

### 4. Address scale and release reliability

The engine clones and validates the complete state per transaction. This favors correctness and inspectability over large-world performance. Historical achievements, treasury entries, command receipts, and notifications currently grow without compaction. Saves are capped at 16 MiB. Add a tested retention/receipt design and profile realistic worlds before increasing simulation scale.

The application facade holds the engine on the main browser thread. Move it behind a worker port if profiling justifies it; preserve the existing headless API and transaction ordering. Do not use host timing inside simulation logic.

### 5. Begin 0.2 once the foundation gates close

Author meaningful quests, characters, activities, progression, and encounters through JSON/YAML and Lua. Keep Angular free of quest-specific effects and preserve explicit input for every allied turn.

## Operating conventions

- Start from `README.md`, then run `npm ci` and `npm run verify`.
- Treat `packages/contracts/schema.ts` as the schema/type source. `npm run schemas:generate` refreshes the standalone validators and exported JSON schemas.
- Generated validators are plain JavaScript plus declarations so production browsers need no JavaScript `eval`. Angular disk caching is disabled in this alpha to avoid stale external-source/generated-validator compiler caches.
- Inactive loadouts store preferences, not item reservations. Other authorized actions can make an inactive preference unavailable; activation then fails atomically rather than silently choosing substitutes.
- All available item-count queries used by production/quests count shared, unprotected, unreserved storage. Personally owned or equipped stock is excluded.
- Browser saves belong to the exact origin. `localhost` and `127.0.0.1` have separate IndexedDB stores. Use Export/Import when moving origins, machines, or deployment types.
- Saves require the exact content fingerprint, including Lua sources. Content compatibility migration is not yet supported. No offline progression is performed.
- The preview suspends host advancement while the tab is hidden. Speed changes only the rate of requesting fixed ticks. Debug Step explicitly advances ticks even while paused.
- Temporary combat escape removes a character from that battle's eligible actors, while persistent party regrouping is simplified until the battle resolves.
- The development UI's one-enemy-turn button is a trusted explicit controller operation; it is never driven by world ticks. A future production controller may continue enemy turns until an allied input boundary.

## Local handover contents

The archive includes source, npm lockfile, sample content/scripts, executable schemas, tests, documentation, generated icons, and a verified production browser build. It excludes node_modules, compiler caches, Rust targets, credentials, and cloud-specific configuration. No hosted deployment or repository publication has been performed.
