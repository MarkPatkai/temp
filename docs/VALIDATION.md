# Validation record

Date: 2026-11-09. This record describes the alpha handover, not a completed 0.1 release.

## Executed successfully

| Check | Result |
|---|---|
| npm dependency installation and lockfile resolution | Passed |
| Module import boundaries | Passed |
| TypeScript strict typecheck | Passed |
| Angular strict template compilation | Passed |
| JSON/YAML definitions and typed references | Passed |
| Lua syntax/exports and sample invocations | Passed |
| Vitest headless tests | **62 passed**, 6 files |
| Full deterministic integration scenario | **7 checks passed** |
| Angular production build | Passed |
| Chromium browser acceptance | **4 passed** |
| Fresh ZIP extraction: npm ci, complete verification, scenario, production browser tests | Passed in a separate directory |
| Development server: Angular/Lua startup and isolated scenario in Chromium | Passed |

The browser tests run against the actual production files with a CSP that permits local WASM but excludes general JavaScript `unsafe-eval`. They verify successful initialization and styling, the isolated Lua integration scenario, no page exceptions/external runtime requests, IndexedDB save/reload, JSON download, rejected invalid import, UI work/quest/manual combat, and narrow-screen operation.

The packaged source was extracted to a new directory, dependencies installed from its lockfile, and the full verification/build/scenario/browser suite rerun successfully. The development server was also started from that extraction, and its live Angular/Lua initialization and isolated integration scenario passed in Chromium. These checks establish portability between directories on the tested Linux host; native Windows/macOS checks remain outstanding.

## Deterministic verification fingerprint

Seed: `foundation-001`

Content SHA-256:

```text
087d672b8d451d3cec24bae7b093e0b49e967f4679e485350719bceb0ccc605d
```

Canonical final state SHA-256 from `npm run verify:scenario`:

```text
3f8706d7b69754d890964df31d2799c3fd806a92ceb0608faa0a0884ae698094
```

The scenario uses explicit fixed command IDs and test-only choices. It is not a player automation policy. A separate test repeats the scenario and compares the complete state, including command receipts and RNG. The scenario itself checks save/reload continuation against the uninterrupted engine.

## Test coverage

- PRNG golden vector, seed initialization, host tick batching, duplicate receipts, ID reuse, concurrent dispatch, failed-command rollback, hidden trait projections, invalid references, dictionary keys.
- JSON/YAML equivalence, missing references, duplicate definitions, unknown fields, unsafe YAML, Lua syntax/export validation.
- Lua query/effect API, unavailable host libraries, instruction and memory quotas, read-only context, invalid returns, cycles, scope escalation, isolated globals.
- Input reservations/cancellation, actual craft outputs/XP, protected assignments, distinct facility limits, research unlocks, split/merge, capacity rollback, pending delivery/partial claim, ownership/protection, multi-slot loadouts, unavailable saved preferences, ordered recovery, designated PC.
- Fastest eligible routes, edge-based cancellation, pending encounter decisions, independent world/combat time, frontline/reach rules, incapacitation, independent battles, explicit controller authority.
- Historical/commissioned/world-state quests, consumption/reward once, exclusivity, atomic Lua effect batches, interval/event rules, disabled rules, blocked combat automation, failed-rule savepoints, physical merchant access, treasury/stock, delayed recruitment, wages/suspension/payment, external service.
- Save continuation, checksum/future-version/content failures, a v0 migration, bounded nesting, whole-architecture repeatability.

## Environment and platform limits

Verified with Node 24.22.1, npm 11.9.0, TypeScript 6.0.3, Angular 22.2.5 / build tooling 22.2.6, Wasmoon 1.16.0, Vitest 5.1.0, and Playwright 1.65.0 using installed Chromium on Linux.

The Tauri CLI inspected configuration successfully. A native build was attempted with `node scripts/tauri.mjs build --no-bundle` and stopped at `cargo metadata`: Cargo was not installed. `tauri info` also reported missing Rust, WebKitGTK 4.1, and librsvg development prerequisites. Native compilation, native save IO, executable launch, installer generation, and signing are **not verified**.

There is no claim of completed gameplay, balance, native platform support validation, exhaustive save-state proof, sandbox audit, or large-world performance testing. Remaining implementation work is enumerated in HANDOVER.md.
