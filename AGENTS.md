# AGENTS.md

You are working in a governed repository. The architecture is code, the controls are code, and your
change will be checked against both. Read this before writing anything.

## The loop you must follow

1. **Get the spec.** Work only from an `approved` spec in `specs/`. If there is no spec, stop and ask for one.
2. **Get the architecture context before you design.**
   - With MCP: call `calm_spec_context` with the spec id.
   - Without MCP: run `npm run calm:context -- --spec SPEC-001`.
   The answer tells you which CALM nodes you may touch, what each node may connect to, and what it must not connect to.
3. **Implement inside that scope.** Touch only code owned by the nodes the spec declares.
4. **Run the gates on your own work**: MCP `run_gates`, or `SPEC=SPEC-001 npm run gates`.
5. **Hand over** with the spec id in the commit message as a trailer: `Spec: SPEC-001`.

## Hard rules

- A connection that is not in the CALM model does not exist for you. Fewer lines of code is not a reason to create one.
- Never edit `architecture/`, `gates/`, `agent/`, `.github/` or this file to make a gate pass. Those paths are the
  control plane. Changes there always route to human review and will be read as an attempt to weaken a control.
- If the spec cannot be met within the modelled connections, **stop**. Say which relationship you believe is missing
  and why. A human changes the model first, then you implement.
- All environment bindings are read in the owning service's `src/config.ts`, by the exact name in the CALM
  interface's `env-binding`. Do not read `process.env` anywhere else.
- Do not claim the work is done while any gate fails. Report the failing gate output verbatim.
- You do not review your own change. The review router decides who does.

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` / `npm run typecheck` | tests and types |
| `npm run calm:validate` | validate the model against CALM 1.2, the governed-service pattern and the control requirement schemas |
| `npm run calm:context -- --spec SPEC-001` | architectural context for a spec, node or path |
| `SPEC=SPEC-001 npm run gates` | every blocking gate |
| `SPEC=SPEC-001 npm run evidence` | gates plus a hashed evidence bundle in `evidence/out/` |
