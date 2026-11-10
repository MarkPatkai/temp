# Crossroads gameplay implementation inventory

Source of narrative truth: docs/story/STORY.md. This is the working inventory for the transition from foundation harness to gameplay. Items marked pending are not represented as finished features.

## Order and scope

1. Implement generic identity and interaction contracts, then author the opening through content.
2. Connect existing quest event tracking to deliberate dialogue actions.
3. Replace the shell with a strategy-game HUD, retaining foundation tools in a separate view.
4. Expand the charter journey into travel, assessment alternatives and actual property development.

## This slice

- [x] Persist character name, ancestry, homeland, background, motivation and portrait.
- [x] Validate ancestry/sub-ancestry combinations against authored choices; background grants an initial skill, ancestry does not imply politics or morality.
- [x] Separate one-time identity creation from character designation; reject duplicate creation.
- [x] Start story sessions in Veybridge with one player character, Mara, Borin and Lucien, rather than a ready-made haven workforce.
- [x] Author `A Stranger at the Gates`: registration, Mara introduction, Borin briefing; commissioned objectives and explicit reward claim.
- [x] Author dialogue choices and prerequisites as content; reject repeated, unavailable and out-of-order interactions.
- [x] Save dialogue history and choices; use qualifying engine events for quest progress.
- [x] Notify acceptance, each newly completed objective, readiness and reward claim once.
- [x] Journal with progress and tracking, dialogue UI, creation form, profile modal and companion view.
- [x] Resource HUD, location/time/speed controls, left navigation, right facility/party accordion, bottom character dock, notification stack and toggled inbox.
- [x] Brown fabric/leather/wood palette; locally authored SVG environment, portraits and material icons, no copied Stellaris assets.

## Opening quest behavior

Creation and quest acceptance are separate validated commands initiated by the registration button. Quest tracking starts before the `gate` interaction; earlier actions never backfill commissioned objectives. Each interaction names a location, required quest, prior interaction IDs, NPC text and permitted choices. The engine records the chosen response and emits `story.interacted` with the interaction definition ID. Existing quest reactions increment the matching objective. Repeating an interaction cannot duplicate progress. Claiming the reward is an explicit command and remains exactly once. The opening does not grant a deed prematurely: Borin's briefing ends with an invitation to assessment.

## Full prologue backlog

- [ ] Guild assessment with combat, magic, craft and exploration alternatives, all equally valid; never force a combat career.
- [ ] Selection-dependent NPC dialogue, reputation and optional personal objectives beyond the initial background skill.
- [ ] Lucien relationship branches, voluntary companionship, reusable dialogue presentation conditions and Lua effects beyond existing quest claims.
- [ ] Assessment completion, Borin deed issuance, modest equipment/allowance as actual instances and receipt-protected rewards.
- [ ] Follow-up `A Place to Call Your Own`: travel to Briarfield, survey foundation/well/trees and establish ownership.
- [ ] No running forge or claimed estate before deed; construction, restoration and housing use real time/materials.
- [ ] Initial contract board: Missing Shipment, Weeds and Worse, Disputed Boundary, Apprentice's Mistake, Old Road.
- [ ] Old Road evidence ledger, survey markers, missing surveyor, boundary claims, four legitimate resolution paths and Selene's optional introduction.

## Engine and gameplay backlog

- [ ] Prerequisite quest chains, optional objectives, deadlines/failure/expiration commands, branching rewards and faction/personal/Guild standing.
- [ ] Typed notification actions, persistent player-selected tracking, dismissal preferences per save, achievements with actual award definitions (no fake achievements).
- [ ] Save migration between content revisions; current exact content fingerprint still applies. New identity fields are optional for old engine snapshots, not permission to bypass content checks.
- [ ] Housing slots and buildable plots as independent modeled capacities. Until implemented, HUD identifies these as not surveyed, never as invented numbers.
- [ ] Sustainable resource gain projection including standing orders, inputs and wages. Current HUD shows only actual active production work rates, not guaranteed future stock or fictitious gold income.
- [ ] Resource capacity, reservation, ownership, storage overflow and deliveries; market access and contract obligations retained.
- [ ] Party membership edits, normal inbound recruitment routing, equipment policies, travel encounters and resting.
- [ ] All original 0.1 gaps in HANDOVER.md remain unless explicitly closed here; native Tauri verification remains local.

## UI contract

Top: icons, stock, active rate, occupied/free storage and treasury; top-right current location, day/time, pause and speed. Left: City/Haven, World map, Journal, Research, Buildings, Inventory, Commands and developer tools. Right: collapsible facilities with idle/running status, workers and outputs; outside parties with location/activity. Center: environment illustration with actionable NPC/place cards, or selected domain screen. Bottom center: portrait opens PC modal; name/level opens companion roster. Bottom right: at most three unread toast cards, unread badge and independently toggled history list. Achievements have no fabricated events; future awards will use the same inbox.

Image contract: local SVGs are replaceable first-pass art. Every material row has an icon and quantity; portraits and environment occupy key scene locations. Production art, additional item illustrations, high-contrast mode and full keyboard/assistive-technology audit remain pending.

## Verification gates

Existing headless suite must remain green. Add identity validation, duplicate creation, prerequisite/physical-access checks, event-based progress, no duplicate rewards, save continuation, and end-to-end creation → dialogue → ready → claim tests. Browser checks cover resource/outliner regions, modal controls, three-toast limit, inbox and narrow layout. Rebuild checked-in browser distribution for local handover. Update the repository and downloadable archive together.
