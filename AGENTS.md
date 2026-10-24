# AGENTS.md

You are working in a governed repository. The architecture is code, the controls are code, and your
change will be checked against both. Read this before writing anything.

## The loop you must follow

1. **Get the spec.** Work only from an `approved` spec in `specs/`. If there is no spec, stop and ask for one.
   If the spec declares a `model-change`, check the model already contains it. If it does not, stop: a human
   makes the model change first, then you implement.
2. **Get the architecture context before you design.**
   - With MCP: call `calm_spec_context` with the spec id (also `calm_node_context` and `calm_path_context`).
   - Without MCP: run `npm run calm:context -- --spec SPEC-001` (or `--node <id>`, `--path <file>`).
   The answer tells you which CALM nodes you may touch, what each node may connect to, and what it must not connect to.
3. **Implement inside that scope.** Touch only code owned by the nodes the spec declares. A node owns the folder in
   its `source-path` metadata: `services/trade-api` and `services/position-service`.
4. **Run the gates on your own work**: MCP `run_gates`, or `SPEC=SPEC-001 npm run gates`.
5. **Hand over** with the spec id as a commit trailer, `Spec: SPEC-001`, and in the pull request's description.
   CI (`.github/workflows/governed-sdlc.yml`) reads the spec from the description, so changes reach `main` through a
   pull request: a direct push to `main` names no spec and fails the controls gate.

## Hard rules

- A connection that is not in the CALM model does not exist for you. Fewer lines of code is not a reason to create one.
- Never edit `architecture/`, `gates/`, `agent/`, `.github/` or this file to make a gate pass. Those paths are the
  control plane. Changes there will be read as an attempt to weaken a control.
- The code review control in the model routes to a human approver every change to a file no node owns, other than
  `README.md`, `slides/`, `test/`, `LICENSE` and `NOTICE`. That covers the control plane above and also
  `specs/`, `gateway/`, `tools/`, `gates/test/` and the root config files.
- If the spec cannot be met within the modelled connections, **stop**. Say which relationship you believe is missing
  and why. A human changes the model first, then you implement.
- All environment bindings are read in the owning service's `src/config.ts`, by the exact name in the CALM
  interface's `env-binding`. Do not read `process.env` anywhere else in `services/`.
- Do not claim the work is done while any gate fails. Report the failing gate output verbatim.
- You do not review your own change. The code review control in the model decides who may, and the merge gateway enforces it.

## Where things are

| Path | What it is |
| --- | --- |
| `architecture/` | the CALM model of the trade capture system, with the controls on it as ergo requirements |
| `services/` | the two services the model's nodes own |
| `specs/` | the specs; only `approved` ones may be implemented |
| `gates/` | `check.mjs`, the policy (`policy/`, built to WebAssembly) and the gate tests (`gates/test/`) |
| `agent/` | the read-only MCP server and `calm:context` |
| `gateway/` | the merge gateway: the local demo (`run-demo.sh`) and the GitHub demo (`gateway/gh-*.mjs`); see its README |
| `slides/` | the talk deck and its checks; see its README |

## Related repositories

- **[osffny-sdlc-calm](https://github.com/rocketstack-matt/osffny-sdlc-calm)** is the live demo on GitHub. It is
  generated from this repository: `gateway/gateway/gh-reset.mjs` force-pushes its `main` from this repository's last
  commit, closes its pull requests and deletes its branches, so make lasting changes here, never there. Its README
  is written by `gh-reset.mjs`. Do not reset it or open, approve, merge or close its pull requests unless asked: the
  presenters rehearse and present on it.
- **[FINOS architecture-as-code](https://github.com/finos/architecture-as-code)** (CALM, CALM Hub), checked out next
  to this repository as `../architecture-as-code`. Presentation mode and node deep links are in CALM Hub upstream;
  the decision overlay the deck shows is on a local branch there, so the Hub UI must run from
  `feat/hub-ui-presentation-mode`. Do not push those branches or raise pull requests for them unless asked. The
  control-evaluation decorator Standard is released in [FINOS calm-schema](https://github.com/finos/calm-schema).

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` / `npm run typecheck` | tests (including `gates/test/`) and types |
| `npm run calm:validate` | validate the model against CALM 1.2, the governed-service pattern and the Standards it names |
| `npm run calm:context -- --spec SPEC-001` | architectural context for a spec, node or path |
| `SPEC=SPEC-001 npm run gates` | every blocking gate the model names, including the controls it carries |
| `npm run demo` | the local demo (`gateway/run-demo.sh`), every verdict checked; needs a clean tree |
| `npm run demo:github` | the live GitHub demo, start to finish (`-- --resume` to carry on); see `gateway/README.md` |
| `node slides/check.mjs` / `node slides/overflow-check.mjs` | the deck's checks |
