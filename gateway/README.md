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

## The GitHub demo

The talk plays the same moments on GitHub pull requests, in
[rocketstack-matt/osffny-sdlc-calm](https://github.com/rocketstack-matt/osffny-sdlc-calm) (SPEC-005). The repository
holds the trade capture system, its architecture and the specs it needs; its `main` takes a pull request only when
the **Architecture controls** check has passed. Who is who:

| On GitHub | In the model | Does |
| --- | --- | --- |
| `calm-trade-agent[bot]` (a GitHub App) | `author-agent` | writes the code and opens the pull requests |
| `calm-review-bot[bot]` (a GitHub App, run by the gateway's watch loop; without it, the review-bot workflow on GitHub Actions) | `review-bot` | reviews every commit |
| `calm-merge-gateway[bot]` (a GitHub App) | the merge gateway | posts the check and a comment on every decision |
| `@aaronsearle` live, a demo account in the screenshots | `alice` | approves, with GitHub's own review, when a person is needed |
| `@rocketstack-matt` | `bob` | the architect: changes the architecture |

The approvers are listed in `.github-demo.json` as `"approvers": ["aaronsearle", "<demo account>"]`; the gateway's
comments name `DEMO_APPROVER`, or the first in the list. The gateway runs on the presenter's laptop, so it publishes
to a local CALM Hub. A person's approval counts for the
commit they approved and no other, so a push after it fails the check again.

    node gateway/gh-apps.mjs        # once: create the three GitHub Apps (opens a page; then install each on the repo)

On the day:

    export CALM_HUB_URL=http://localhost:8080
    node gateway/gh-reset.mjs            # the repo, its protection, CALM Hub and its layout, from the start
    node gateway/gh-gateway.mjs --watch  # in its own terminal: the gateway and the review bot; leave it running
    node gateway/gh-preflight.mjs        # everything checked; prints the two links to open
    node gateway/gh-demo.mjs             # the demo: Enter for each moment, m to merge, o / h to open GitHub / CALM Hub

The moments `gh-demo` plays, in order (moment 3 is Aaron approving; there is nothing to press for it):

1. A harmless change: green in about 15 seconds; press Merge.
2. A change near the ledger: red, naming @aaronsearle. 3. Aaron approves on GitHub: green in about 8 seconds; press
   Merge.
4. The shortcut: red, not in the architecture. The next key closes it.
5. The architect changes the architecture (opened as you): red until Aaron approves; press Merge, and move CALM Hub to
   1.1.0.
6. The same harmless change: now red.

`gh-demo` remembers where it got to, so it can be stopped and started again; `gh-reset` starts everything afresh. The
moments can also be played by hand with `node gateway/gh-propose.mjs` (see `gh-demo.mjs` for the arguments).

The gateway's decisions, decorators and Hub state are in `.gh/`, apart from the local demo's; the apps' ids are in
`.github-demo.json` and their keys in `keys/`, all kept out of git.
