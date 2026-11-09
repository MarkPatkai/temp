# Coding handover rules

Read README.md, HANDOVER.md, and docs/ARCHITECTURE.md before changing architecture.

- Keep version 0.1 architecture-first. Do not turn this into a combat-only prototype.
- Domains own their state slices; cross-domain mutations use registered effects. No Angular dependency in packages.
- Player commands, explicit standing orders, or enabled rules authorize work. Do not infer new player goals.
- World ticks must never execute a combat turn. Every allied action needs explicit input.
- Use persistent character/item identities. Combat damage incapacitates, never kills.
- Keep simulation deterministic: no Math.random, Date.now, host timers, locale-dependent comparisons, or unsorted tie-breaking in domains/core.
- Use contracts/schema.ts for schema/type changes; regenerate validators and schema artifacts.
- Lua must remain a real sandboxed runtime with quotas, no JS proxy objects, and validated atomic effect batches.
- Review save compatibility when changing state/content contracts. Do not silently discard saved fields.
- Run npm run verify and the relevant browser tests. A native build requires native validation; do not report configuration as a successful compile.
- Update HANDOVER.md when closing an outstanding gap. Do not promote the alpha to completed 0.1 while release gates remain unverified.
