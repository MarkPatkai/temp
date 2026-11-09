# Haven Foundation

**0.1.0-alpha.1 — first implementation handover**

A local Angular application and headless TypeScript simulation for the character-centric fantasy RPG / haven simulator. Includes real Lua 5.4 via Wasmoon, JSON/YAML definitions, transactional commands, fixed ticks, persistent characters, work, inventory, travel, manual combat, quests, player rules, versioned saves, and Tauri desktop source.

This is an architecture development build. It is **not the completed version 0.1 release** or the version 0.2 playable campaign. Read [HANDOVER.md](HANDOVER.md) for the remaining work and native-platform verification gap.

## Try the included build — no package installation

Install **Node.js 24 LTS** (24.15 or later, below 25), extract the ZIP, and run from this directory:

```sh
node scripts/serve-preview.mjs
```

Open **http://127.0.0.1:4200**. This serves the included production build from `dist/game/browser`. It needs no cloud service, external assets, account, or installed npm dependencies. Do not open `index.html` directly: Lua WASM, content loading, and browser persistence require an HTTP origin.

The simulation starts paused. Press **Verify architecture** on Overview to run an isolated integration scenario. It preserves your current world.

## Develop locally

```sh
npm ci
npm start
```

Use the same URL. The initial dependency install needs internet access. `node_modules` is intentionally excluded from the ZIP. Dependency versions are resolved in `package-lock.json`.

```sh
npm run verify              # boundaries, types/templates, content/Lua, headless tests, production build
npm run verify:scenario     # complete cross-domain verification and final state hash
npx playwright install chromium
npm run test:e2e            # four browser acceptance tests against the production build
```

On Linux, Playwright may also need its documented system packages (`npx playwright install --with-deps chromium` on a machine you administer). To use an existing Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable before the test command. No cloud paths are required.

Stop another server on port 4200 before running browser tests if it serves a different build. Rebuild after source changes with `npm run build`; `npm run preview` serves the most recently built files.

## Desktop source

Install stable Rust/Cargo and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS, then:

```sh
npm ci
npm run tauri:dev
npm run tauri:build
```

Windows needs the MSVC C++ build tools and WebView2. macOS needs Xcode command-line tools. Linux needs the WebKitGTK 4.1 and other Tauri system development packages listed in the official guide.

**Native compilation was not verified in cloud:** Rust, Cargo, WebKitGTK development libraries, and librsvg development libraries were unavailable. The ZIP includes the Rust shell, scoped save commands, configuration, and desktop icons, but no executable or native installer. Generate and commit `apps/game/src-tauri/Cargo.lock` during the first successful local native build.

## A manual walkthrough

1. In **Quests**, accept *Architecture verification* before crafting or exploring. Its objectives are commissioned.
2. In **Haven & work**, assign Ada to the forge and create one sword order. Advance ten ticks. The order produces a unique item and XP.
3. In **Inventory**, equip a sword or explicitly authorize an Outfit under **Rules**.
4. In **Expeditions**, create a party, begin travel to Briarwood, and advance ten ticks.
5. Start exploration and advance ten ticks. Choose **Fight** at the encounter decision.
6. On each allied turn choose an action. Ordinary melee targets the conscious frontline first. Press **Resolve one enemy turn** when an enemy has the turn. World ticks do not advance any battle turn.
7. Claim the quest reward. Try claiming again through the headless API: the engine rejects it.
8. After combat, explicitly explore, rest, or travel. The current visit is safe from another random hostile encounter without changing recovery rates.
9. Use **Save / Load** for the local slot, or **Export / Import** for portable JSON saves.

Resting is explicitly ordered in Characters and recovers resources every ten simulation ticks. Stop resting before travel or work. Free instantaneous facility construction is labeled as a development capability.

## Files to read next

- [HANDOVER.md](HANDOVER.md): implemented scope, limitations, and next local tasks.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): boundaries, transactions, simulation, schemas, Lua, and persistence.
- [docs/VALIDATION.md](docs/VALIDATION.md): verification evidence and platform limits.
- [docs/consolidated-design.md](docs/consolidated-design.md): original supplied design.
- `packages/contracts/schema.ts`: executable JSON Schema and derived TypeScript contracts.
- `docs/schemas/`: exported standalone JSON schemas.
- `packages/application/index.ts`: composition and initialization.
- `packages/testing/scenario.ts`: explicit verification fixture, not gameplay automation.

Original project source has no license selected. Third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `dist/game/3rdpartylicenses.txt`.
