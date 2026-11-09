# Game Design & Architecture — Consolidated Specification

Architecture direction established

Project: Character-centric Fantasy RPG, Adventuring & Haven Management Simulator\
Technology: Angular, TypeScript, Tauri, JSON/YAML, Lua\
Development approach: Architecture-first, modular, data-driven, extensible

## 1. Executive summary

We are building a fantasy RPG that combines persistent character development, party-based adventuring, tactical turn-based combat, exploration, recruitment, production, and haven management.

The player manages a collection of individually simulated characters. Those characters can become adventurers, workers, specialists, leaders, or other inhabitants of the world.

The game supports both small elite adventuring groups and larger, more developed havens.

The most important design principle is player authority. The game does not independently decide what the player wants. It executes direct commands, standing orders, and rules explicitly created or enabled by the player.

The development plan is now:

# 0.1

Runnable architectural foundation

Angular application compiles and starts. Core systems, simulation engine, Lua integration, data definitions, commands, persistence, and module boundaries exist.

Not required to provide a complete or enjoyable gameplay experience.

# 0.2

First playable game iteration

Add authored content, quests, encounters, characters, progression, and gameplay integration using the existing systems.

A player should be able to undertake an adventure, complete a quest, obtain rewards, and make meaningful progress.

This supersedes my previous recommendation to make combat the main deliverable of version 0.1.

Version 0.1 is the foundation for the entire game, not a combat prototype.

## 2. Technology and original architectural decisions

These are the original technology choices that must be preserved.

| Component              | Technology / approach                                      |
| ---------------------- | ---------------------------------------------------------- |
| Application framework  | Angular + TypeScript                                       |
| Browser deployment     | Standard web application                                   |
| Desktop deployment     | Tauri                                                      |
| Game simulation        | TypeScript                                                 |
| Content definitions    | JSON and YAML                                              |
| Advanced content logic | Sandboxed Lua                                              |
| Simulation model       | Deterministic, seeded, tick-based                          |
| UI                     | Separated from simulation logic                            |
| State changes          | Validated commands and simulation events                   |
| Persistence            | Versioned, serializable game state                         |
| Extensibility          | Data-driven definitions, registries, and scripted behavior |

### Why Lua matters

Lua isn't an optional afterthought or something we should replace with hardcoded TypeScript quest logic.

The intended relationship is:

- TypeScript defines the authoritative game rules, state models, simulation, scheduling, and commands.
- JSON/YAML defines characters, items, buildings, recipes, abilities, encounters, quests, and world content.
- Lua handles advanced conditions, scripted interactions, custom behavior, and content-specific logic that would otherwise require changing engine code.
- Angular displays the current state and allows players to issue commands.
- Tauri packages the same application for desktop.

Lua scripts should operate through a controlled API. They should not be able to mutate arbitrary game state directly.

For example, a Lua quest script can evaluate a special condition and request an allowed game command. The TypeScript engine validates and executes that command.

This keeps modifiable content flexible without undermining game-state integrity.

## 3. High-level architecture

Angular UI / Tauri Desktop Shell

Screens, interaction, notifications, player commands

Application / Command Layer

Validation, authorization, command dispatch, queries

Deterministic Simulation Core

World clock, work units, scheduling, events, RNG, state transitions

Characters

Haven

World

Exploration

Combat

Quests

Economy

Inventory

Recruitment

Content Engine

JSON/YAML loaders, validation, registries, references

Lua Runtime

Sandbox, scripts, conditions, controlled API

Persistence & Save Migration

Versioned world state, save/load, deterministic restoration

This is a conceptual dependency diagram, not a requirement that the modules communicate only vertically.

The content engine, Lua runtime, and persistence layer are infrastructure shared by multiple systems. They should not become isolated features attached only to quests or combat.

### Content lifecycle

The original architecture should preserve this general lifecycle:

Load → Validate → Resolve references → Register → Initialize → Simulate

Invalid definitions, missing referenced IDs, or unsupported script operations should be detected explicitly rather than causing silent failures during gameplay.

## 4. Game simulation

The world is based on continuous simulation time, while combat is turn-based.

### World simulation

The original timing decision was:

10 real minutes = 1 in-game day at normal speed.

The player can pause or accelerate the world simulation.

Actions such as gathering, manufacturing, training, travel, and construction consume work or time. Characters' abilities and relevant modifiers affect how quickly work completes.

The simulation must use deterministic updates and seeded randomness so that its results can be reproduced and saved reliably.

### Combat simulation

Combat operates separately from world ticks.

Characters take individual turns in initiative order. Allied turns require explicit input.

Multiple independent battles can remain unresolved while the rest of the world operates.

World-time progression cannot automatically execute combat actions.

### One authoritative state

All systems should operate on consistent character, party, item, and world identities.

A combatant isn't a disposable copy of a character. An adventurer is the same persistent character that works, trains, socializes, and lives at the haven.

## 5. Player control and automation

This is one of our most important final clarifications and supersedes earlier suggestions of autonomous behavior.

The player may issue:

| Instruction type | Purpose                                                            |
| ---------------- | ------------------------------------------------------------------ |
| Direct command   | Perform an action now                                              |
| Standing order   | Continue performing authorized work                                |
| Conditional rule | Perform an authorized action when its trigger and conditions match |
| Manual decision  | Resolve a situation requiring explicit input                       |

Examples include returning adventurers to previous jobs, maintaining production orders, automatically buying permitted market stock, cleaning surplus inventory, and using equipment Outfit policies.

The engine should never invent new goals or orders.

A scheduler may choose which eligible worker executes an existing player-authorized order, but may not independently decide to start unrelated work.

Outfit policies are especially important. The player can configure separate Combat and Work outfits, specifying which available items characters may equip. Eligible stock can then be assigned according to those rules, respecting ownership, protection, and reservation.

Without an authorized rule, the game must not silently replace equipment.

The goal is to minimize repetitive clicking without replacing player decision-making.

# 6. Core gameplay systems

The following summarizes the systems we designed throughout the conversation. These are the target architectural domains, not a requirement to implement all their detailed gameplay in version 0.1.

## 6.1 Characters and progression

Characters are the foundation of the entire simulation.

They have persistent identities, attributes, skills, traits, equipment, health, needs, relationships, and progression.

The Player Character is simply a designated character in the world. It is not required for every party, quest, or managerial activity.

The actual player retains global management authority regardless of where the PC is located.

Character architecture should account for:

- Attributes, skills, experience, levels, and progression.
- Visible, suspected, and hidden traits.
- Needs including hunger, rest, and health.
- Food preferences: forbidden, tolerated, and preferred.
- Relationships, trust, mood, and expectations.
- Equipment and personal item ownership.
- Injuries, incapacitation, healing, and hospitalization.
- Job assignments, activity eligibility, and participation in parties.
- Character departure, historical records, and eventual non-combat mortality.

Hidden information is source-dependent. Formal recruits and guild subcontractors reveal their information upfront, whereas certain rescued, captured, or unusual characters may have undiscovered personality traits or secrets.

Hidden traits still affect the simulation before they are discovered.

## 6.2 Recruitment and character categories

We distinguished several types of characters.

| Category                       | Behavior                                             |
| ------------------------------ | ---------------------------------------------------- |
| Permanent recruits             | Voluntary full haven members                         |
| Guild subcontractors           | Temporary residents with limited contractual control |
| Captives / enslaved characters | Separate coercive-control and relationship rules     |
| External contractors           | Services performed outside the resident workforce    |
| World characters               | NPCs not currently belonging to the haven            |

Formal recruitment requires satisfying the character's conditions, and incoming recruits travel normally rather than teleporting to the haven.

Guild subcontractors can work on haven facilities, have needs, gain experience, and receive daily wages. Their contracts include minimum terms, accrued obligations, suspension for nonpayment, and guild-related consequences.

External contractors are different: they provide abstract services and do not occupy haven workstations.

## 6.3 Haven management and work

The haven is the player's development and operational center.

It supports facilities, workstations, construction, research, professions, manufacturing, healing, housing, and resource management.

The work architecture distinguishes:

Persistent assignments: Characters have an assigned workstation or responsibility.

Protected assignments: Characters retain their position even when no work is available.

Flexible assignments: Characters may be allocated to eligible work according to player-authorized orders.

Temporary execution: The scheduler selects an appropriate worker without overwriting persistent assignments.

Work is simulated through work units, and character ability influences output and completion.

Manufacturing produces real item instances with appropriate quality and other generated properties.

A facility's number of instances, available workstations, and maximum workers are distinct limits.

## 6.4 Inventory and equipment

The inventory is global from the haven-management perspective, but still respects ownership and equipment rules.

We established:

- Every equipment item is a unique instance.
- Stackable materials use stack instances.
- Storage capacity is based on occupied item/stack slots.
- Equipped items leave available storage and cannot be claimed by another character.
- Unequipping returns eligible items to haven storage.
- Characters can maintain Combat and Work loadouts.
- Player-defined Outfit policies can manage eligible equipment.
- Protected or locked items cannot be silently replaced or disposed of.
- Incoming loot uses the pending-delivery system when storage is full.
- Pending deliveries can be partially claimed or prioritized.
- Selling, salvaging, and disposal follow explicitly configured rules.

Inventory automation is executed from player-defined policies, not inferred by the game.

## 6.5 Economy and markets

The haven uses a shared treasury.

Automatic selling can convert permitted surplus items directly to gold according to established prices.

Purchasing occurs through actual merchant access and unlocked catalogs.

Merchants have limited stock, periodic refreshes, and access conditions.

A city market can be used while an eligible resident is physically present, with one designated negotiator for that city's active market session.

Negotiation and pricing can use character Bartering skills.

Player-defined standing purchases execute when their requirements are met; they do not cause automatic travel.

There is no unnecessary cargo-hauling simulation for market purchases.

Subcontractor wages and existing financial obligations remain important, but the treasury does not reserve future wages automatically.

## 6.6 World graph and exploration

The world is a graph of connected locations:

- Haven and settlements.
- Roads and wilderness.
- Resource locations.
- Dungeons.
- Landmarks and special places.

Travel follows accessible connections. By default, parties use the fastest available route, with optional manual waypoints.

Travel time, accessibility, and encounters are determined by the world simulation.

Exploration is hybrid:

Known activities include surveying, gathering, hunting, investigating, interacting, and resting.

Unknown discoveries include locations, resource sites, events, encounters, characters, and quests.

Survey progress does not mean a location permanently stops producing resources or events.

Discovery can be authored or generated deterministically.

An exploration encounter interrupts the party and requires a player decision to Fight, Avoid, or Retreat.

## 6.7 Quests

Quests connect the world, characters, exploration, combat, and haven development.

Quest categories include main, regional, character-specific, and repeatable contracts.

Quests may contain multiple objective types:

| Objective tracking | Meaning                                        |
| ------------------ | ---------------------------------------------- |
| World State        | Current condition must hold                    |
| Historical         | A valid past achievement can count             |
| Commissioned       | Only qualifying actions after acceptance count |

Quest contribution rules can be shared, exclusive within a defined group, or consumptive.

Most quests have no deadlines. Exceptional world events may have acceptance or completion limits.

Failure, abandonment, and expiration are separate outcomes.

Quests may change world conditions, unlock routes or recipes, create recruitment opportunities, and alter factions.

Quest completion and rewards must be processed exactly once.

Lua is especially relevant here, because quests may require custom conditions, interactions, branching logic, and scripted world effects.

## 6.8 Combat — finalized decisions

We have enough combat design for implementation.

| Feature                | Final rule                                                 |
| ---------------------- | ---------------------------------------------------------- |
| Execution              | Manual turn-based                                          |
| Initiative             | Individual, speed-based                                    |
| Turns                  | One opportunity per eligible character per round           |
| Player input           | Explicit action for every allied turn                      |
| Allied automation      | No action queues or repeat commands                        |
| Enemy actions          | Rule-based AI                                              |
| Formations             | Front, Middle, Back                                        |
| Row capacities         | Unrestricted within total party limit                      |
| Movement               | No repositioning during combat                             |
| Ordinary melee         | Strict frontline protection                                |
| Extended melee         | Can bypass protection according to reach                   |
| Ranged attacks         | Range and formation-dependent accuracy                     |
| Magic                  | Ability-defined targeting and defenses                     |
| Combat resources       | HP, stamina, mana, and specialized costs                   |
| Escape                 | Individual character action                                |
| Ordinary enemy escape  | Not permitted                                              |
| Surrender              | Scripted encounters only                                   |
| HP reaches zero        | Incapacitation, not death                                  |
| Combat death           | Never directly caused by combat damage                     |
| Injury                 | Possible when incapacitated                                |
| Consciousness restored | 25% maximum HP recovery threshold                          |
| Multiple battles       | Independent and simultaneously persistent                  |
| Post-combat            | Await player instructions unless a configured rule applies |

Enemy AI uses the same action and targeting validation as player characters.

Characters remain in their assigned rows after incapacitation or frontline collapse.

Combat does not automatically cause permanent character death. Separate mortality systems may exist outside combat.

## 6.9 Post-combat and resting

Combat victories produce rewards and enter a post-combat decision state.

The player can continue exploration, rest, return to the haven, or choose another available activity.

Player-configured rules may carry out previously authorized post-combat behavior.

Your latest decision also establishes:

After combat, the party's current location becomes encounter-safe for that visit.

That means no additional random hostile attack at that location while the party remains there.

It does not turn the forest, dungeon, or road into a settlement or true safe zone.

Recovery rates, services, and other location benefits remain unchanged.

# 7. Proposed complete architecture for version 0.1

The earlier combat-only directory structure was incomplete. This is the architecture I would use as the foundation for the whole game.

```
project/
├── apps/
│   └── game/
│       ├── src/
│       │   ├── app/
│       │   │   ├── shell/
│       │   │   ├── screens/
│       │   │   ├── components/
│       │   │   └── state/
│       │   └── assets/
│       └── src-tauri/
│
├── packages/
│   ├── core/
│   │   ├── commands/
│   │   ├── events/
│   │   ├── state/
│   │   ├── rng/
│   │   ├── simulation/
│   │   ├── scheduler/
│   │   ├── rules/
│   │   └── registries/
│   │
│   ├── scripting/
│   │   ├── lua-runtime/
│   │   ├── sandbox/
│   │   ├── script-api/
│   │   ├── conditions/
│   │   └── effects/
│   │
│   ├── content/
│   │   ├── loaders/
│   │   ├── schemas/
│   │   ├── validation/
│   │   ├── references/
│   │   └── definitions/
│   │
│   ├── characters/
│   ├── recruitment/
│   ├── professions/
│   ├── needs/
│   ├── health/
│   ├── relationships/
│   ├── inventory/
│   ├── equipment/
│   ├── outfits/
│   ├── haven/
│   ├── jobs/
│   ├── crafting/
│   ├── research/
│   ├── economy/
│   ├── market/
│   ├── contracts/
│   ├── world/
│   ├── travel/
│   ├── parties/
│   ├── exploration/
│   ├── combat/
│   ├── quests/
│   ├── notifications/
│   │
│   ├── persistence/
│   │   ├── saves/
│   │   ├── serialization/
│   │   └── migrations/
│   │
│   └── testing/
│       ├── fixtures/
│       └── simulation-harness/
│
└── content/
    ├── characters/
    ├── items/
    ├── abilities/
    ├── enemies/
    ├── encounters/
    ├── facilities/
    ├── recipes/
    ├── research/
    ├── locations/
    ├── quests/
    └── scripts/
```

This is a proposed logical workspace structure. It need not be implemented as dozens of independently published packages.

What matters is establishing clear module ownership and contracts.

For version 0.1, a module may contain its models, registry, minimal command handlers, and tests without yet having a complete user-facing feature.

A crucial architecture rule is that modules should expose commands and queries rather than directly modifying each other's private state.

# 8. Version 0.1 — Runnable architectural foundation

First implementation milestone

Objective: Build the underlying infrastructure for the complete game and verify that the architecture works.

Version 0.1 is not expected to deliver a satisfying gameplay experience.

It must, however, compile, launch, initialize the game systems, run the simulation, and demonstrate that the major architectural components can interact.

## 8.1 What 0.1 must contain

| System              | Version 0.1 deliverable                                          |
| ------------------- | ---------------------------------------------------------------- |
| Angular application | Runnable application shell and basic development/debug interface |
| Tauri               | Working desktop shell using the same application                 |
| Simulation core     | World clock, ticks, speed controls, seeded randomness            |
| State management    | Authoritative game state and state transitions                   |
| Command system      | Dispatch, validation, authorization, execution                   |
| Events              | Internal domain events and deterministic processing              |
| Lua                 | Working sandboxed runtime and controlled TypeScript API          |
| Content engine      | Load, validate, resolve, and register JSON/YAML content          |
| Rule engine         | Triggers, conditions, actions, enable/disable                    |
| Characters          | Persistent models, attributes, skills, basic progression         |
| Needs and health    | Models and minimal time-based updates                            |
| Haven and jobs      | Facilities, assignments, work units, job execution               |
| Inventory           | Instances, stacks, storage, ownership, transfers                 |
| Equipment           | Loadouts and initial Outfit policy evaluation                    |
| Economy             | Treasury, prices, transaction commands                           |
| World and travel    | Nodes, connections, parties, travel progress                     |
| Exploration         | Activity definitions, progress, encounter hooks                  |
| Combat              | Turn state, initiative, commands, basic resolution               |
| Quests              | Definitions, objective tracking, lifecycle, scripted conditions  |
| Notifications       | Structured actionable notifications and inbox state              |
| Persistence         | Save/load, versioning, initial migration infrastructure          |
| Tests               | Determinism, validation, critical state transitions              |

For many of these, minimal working implementations are enough.

For example, the combat system does not require thirty abilities. It requires a genuine combat state, a valid action contract, and a way to resolve an illustrative encounter.

Likewise, the quest system doesn't require authored storylines yet. It requires the infrastructure needed to load, activate, progress, and complete quests.

## 8.2 Architecture versus empty placeholders

There is one distinction I would enforce.

0.1 should be architecture-complete, not gameplay-complete.

But architecture-complete should not mean creating fifty empty services that have no behavior.

For every important system, I would aim for:

- Defined types and state ownership.
- Public interfaces and commands.
- Minimal working implementation.
- Integration into the core simulation where relevant.
- A small test or demonstration proving that the contract works.

A minimal inventory transfer should actually move an item.

A minimal Lua condition should actually execute and return a validated result.

A minimal scheduled job should actually accumulate work and complete.

A minimal combat action should actually change combat state.

These examples do not constitute a finished gameplay loop, but they demonstrate that the architecture is real.

## 8.3 A technical verification scenario

The following is sufficient as a 0.1 integration test.

Architecture Verification Scenario

1. Launch the Angular application and initialize a world from a seed.
2. Load sample character, location, item, recipe, and quest definitions.
3. Execute a Lua condition through the sandboxed scripting interface.
4. Create a haven with a few persistent characters.
5. Issue a player command assigning a character to a work activity.
6. Advance world simulation ticks and verify work progress.
7. Apply an authorized equipment or assignment rule.
8. Create an expedition, begin travel, and trigger a sample encounter.
9. Resolve a minimal combat action and emit corresponding events.
10. Progress an example quest objective from a qualifying event.
11. Save, reload, and verify that authoritative state is restored.

This scenario can use artificial development content.

It doesn't need polished assets, meaningful narrative, balancing, or a complete tutorial.

Its purpose is to verify the architecture across system boundaries.

## 8.4 Definition of Done — Version 0.1

Version 0.1 is ready when:

- The application compiles and runs.
- Browser and Tauri deployment are supported.
- Core systems initialize without requiring manual code modifications.
- JSON/YAML definitions are validated.
- Lua scripts execute through the controlled scripting API.
- The simulation can advance, pause, and change speed.
- Player commands and authorized rules execute deterministically.
- Core systems can exchange events and update state.
- Game state can be saved and restored.
- Automated tests cover the critical infrastructure.
- The application can demonstrate its systems through a minimal interface or development harness.

A player does not need to find the game fun at version 0.1.

The system foundation must be functional enough that version 0.2 can concentrate on content and gameplay rather than rewriting the engine.

# 9. Version 0.2 — First playable iteration

Second implementation milestone

Objective: Turn the established systems into a small but coherent game.

Version 0.2 should deliver a functional gameplay loop with actual content.

I recommend a small starting region, a haven, a few recruitable characters, several activities, and a short quest chain.

## 9.1 Suggested initial content

| Content             | Example scope                                       |
| ------------------- | --------------------------------------------------- |
| Starting haven      | One operating base                                  |
| Playable characters | 3–5 initial characters                              |
| Recruitment         | 1–2 available recruits                              |
| Facilities          | Basic production, housing, and recovery             |
| World locations     | Haven, settlement, wilderness, dungeon              |
| Quests              | 5–8 meaningful quests                               |
| Enemy types         | 3–5                                                 |
| Combat abilities    | 8–12 distinct abilities                             |
| Equipment           | Small selection of weapons, armor, and accessories  |
| Resources           | Basic gathering and crafting materials              |
| Crafting            | A few practical recipes                             |
| Progression         | Character XP, skills, haven improvements            |
| Lua content         | Scripted quest conditions, events, and interactions |

These are suggested content targets, not fixed limits.

The important requirement is that the game demonstrates the interaction between systems.

## 9.2 The first complete gameplay loop

Manage characters and prepare the haven

Accept a quest and assemble a party

Travel and explore

Encounter enemies, discoveries, or interactions

Make decisions and resolve combat

Earn rewards and complete quest objectives

Return, improve characters and haven, repeat

The quests should be authored using JSON/YAML and Lua through the content infrastructure built in 0.1.

They should not require new hardcoded quest-specific logic in Angular components or the simulation engine.

Some additional generic mechanics may inevitably be needed during 0.2 development, but they should be implemented as reusable engine capabilities.

## 9.3 Example first quest chain

A simple sequence could be:

1. First Assignment: Accept an adventuring contract and assemble a party.
2. Into the Woods: Travel to a forest and discover a resource site.
3. Predator Problem: Defeat wolves through the manual combat system.
4. Supplies for the Haven: Gather resources and craft equipment.
5. The Hidden Entrance: Discover a dungeon through exploration.
6. A New Ally: Resolve a character interaction that enables recruitment.

This would exercise much of the core gameplay without requiring an enormous amount of content.

The quests can introduce the game's systems naturally while preserving sandbox activities outside quest progression.

## 9.4 Definition of Done — Version 0.2

Version 0.2 is ready when a player can:

- Start a new game.
- Understand and operate their starting haven.
- Inspect and develop characters.
- Assign workers to jobs and use player-defined rules.
- Accept and progress quests.
- Assemble and equip a party.
- Travel between locations.
- Explore and discover content.
- Fight an encounter through the manual turn-based system.
- Recover from injuries and combat.
- Obtain loot and manage storage.
- Improve the haven or character equipment.
- Complete several connected quests.
- Save and continue their game.

This is where playability and user experience become actual acceptance criteria.

The game does not need to be content-rich yet. It needs to be meaningfully playable.

# 10. Development boundaries

To keep these milestones under control, I would enforce the following:

| Version 0.1                   | Version 0.2                          |
| ----------------------------- | ------------------------------------ |
| System definitions            | Actual content                       |
| Module interfaces             | Gameplay integration                 |
| Lua runtime and API           | Lua-authored quests and interactions |
| Quest infrastructure          | Quest chains                         |
| Combat state engine           | Playable combat encounters           |
| Exploration framework         | Discoverable locations               |
| Inventory and economy systems | Meaningful rewards and crafting      |
| Minimal UI / debug tools      | Usable player-facing screens         |
| Technical acceptance tests    | Gameplay acceptance tests            |
| Architecture reliability      | Player experience                    |

The biggest mistake would be turning version 0.1 into a large combat implementation while leaving the Lua engine, quest framework, job scheduler, and other core infrastructure unfinished.

The second biggest mistake would be declaring version 0.1 complete when it consists only of interfaces and empty classes.

We need the middle ground: real architecture with minimal functional implementations.

# 11. Recommended implementation sequence

I would build version 0.1 in this order:

1. Repository and application shell: Angular, TypeScript, Tauri, project structure, tests, and builds.
2. Simulation foundation: World state, clocks, seeded RNG, commands, event processing, registries, and persistence.
3. Content and scripting: JSON/YAML loader, schemas, definition resolution, Lua sandbox, scripting API.
4. Character and haven domains: Characters, needs, progression, work, facilities, inventory, equipment, economy.
5. Adventure domains: World graph, parties, travel, exploration, combat, quest infrastructure.
6. Player-directed rules: Standing orders, triggers, conditions, Outfit policies, scheduler integration.
7. Full integration validation: Load a world, execute commands, simulate, run Lua, process events, save and restore.

Then version 0.2 adds real content, completes player-facing workflows, and validates the first playable loop.

# Final development direction

0.1 — Architecture exists, compiles, runs, and integrates.

0.2 — Content uses that architecture to deliver a playable game.

We have enough design information to begin version 0.1 without another major round of gameplay discussions.

The specifications that remain open—exact damage formulas, initial attribute values, ability balance, and extensive content—can be resolved during implementation and early playtesting.

The next development deliverable should therefore be a Version 0.1 Architecture and Implementation Specification that converts this consolidated design into explicit module interfaces, dependencies, data schemas, Lua API contracts, milestones, and acceptance tests.

That specification should be suitable for handing directly to coding agents, with version 0.1 kept strictly architecture-first and version 0.2 reserved for the first playable gameplay iteration. 