# The merge gateway

The demo the talk shows, runnable. The gateway guards a repository (`.demo/repo`, a clone of this one) and is the
only thing that merges into its `main`. For every change it works out the facts with the controls of `main`'s
architecture, evaluates them with ergo (the same `gates/lib/controls.mjs` CI uses, at stage `merge`), records the
decision as CALM control-evaluation decorators, and merges on ALLOW. Deny by default.

    bash run-demo.sh                                    # every moment, recorded into sessions.json, self-checked
    CALM_HUB_URL=http://localhost:8080 bash run-demo.sh # the same, published to a local CALM Hub

The commands: `node gateway/reset.mjs`, `node gateway/propose.mjs demo/changes/<x>.json` (the agent's commit on a
branch), `node gateway/review.mjs <id> --as <identity>` (a signed review bound to the commit and the diff's SHA-256),
`node gateway/approve.mjs <id> --as <approver>` (the approval service: renders the real diff, asks for a binding code,
mints a single-use token bound to that commit and diff), `node gateway/merge.mjs <id> --review <file> [--approval
<file>]` and `node gateway/evidence.mjs --last N`.

What the demo shows:

1. **A routine change.** The author agent reviews its own change: DENY, with the reason from the code review
   control. The approved review bot reviews it: ALLOW, and `main` moves.
2. **The Client Ledger.** A change to `position-service`, which connects to the ledger: DENY until a human approves.
   The approval renders the real diff from the repository. Changing one line after approval kills the approval.
3. **The shortcut.** The agent makes trade-api read the ledger's file directly: DENY, that connection is not in the
   architecture.
4. **The architect's change.** The architect adds `trade-api -> client-ledger` to the model: a change no node owns,
   so it needs a human too. With CALM Hub, the new architecture is published as the next version. The same kind
   of trade-api change that merged in moment 1 is now denied: the diagram changed, so the control followed.

Every decision is a line in `.demo/decisions.ndjson` and one decorator per control with an ergo policy in
`.demo/decorators/`, validated against `standards/control-evaluation.decorator.standard.json`. With `CALM_HUB_URL` set, the architecture is published
to the namespace `CALM_HUB_NAMESPACE` (default `finos.agentic-sdlc`) as `Trade Capture (governed)`, one version per
model, and every decorator is posted against the version it was decided on. The gateway deletes only what it created
(`.hub-state.json`). To run CALM Hub locally: `../mvnw quarkus:dev -Pstandalone,server-only` in a checkout of
finos/architecture-as-code's `calm-hub`.

`demo/make-patches.mjs` regenerates the demo patches when the services or the model change. The slides' terminal
panes come from `sessions.json`.
