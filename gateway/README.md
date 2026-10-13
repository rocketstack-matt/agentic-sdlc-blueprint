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
| `github-actions[bot]` (the review-bot workflow) | `review-bot` | reviews every commit |
| `calm-merge-gateway[bot]` (a GitHub App) | the merge gateway | posts the check and a comment on every decision |
| `@aaronsearle` live, a demo account in the screenshots | `alice` | approves, with GitHub's own review, when a person is needed |
| `@rocketstack-matt` | `bob` | the architect: changes the architecture |

The approvers are listed in `.github-demo.json` as `"approvers": ["aaronsearle", "<demo account>"]`; the gateway's
comments name `DEMO_APPROVER`, or the first in the list. The gateway runs on the presenter's laptop, so it publishes
to a local CALM Hub. A person's approval counts for the
commit they approved and no other, so a push after it fails the check again.

    node gateway/gh-apps.mjs        # once: create the two GitHub Apps (opens a page; then install both on the repo)
    CALM_HUB_URL=http://localhost:8080 node gateway/gh-reset.mjs            # the repo, its protection and the Hub, from the start
    CALM_HUB_URL=http://localhost:8080 node gateway/gh-gateway.mjs --watch  # the gateway: leave it running

The moments, in order (each pull request waits a few seconds for the review bot):

    node gateway/gh-propose.mjs demo/changes/account-summary.json      # 1. harmless: green, press Merge
    node gateway/gh-propose.mjs demo/changes/position-total.json       # 2. near the ledger: red, needs @aaronsearle
                                                                       # 3. Aaron approves on GitHub: green
    node gateway/gh-propose.mjs demo/changes/position-total-amended.json --onto <pr> --message "Add a source header to the position total"
                                                                       # 4. one more line: red again; Aaron approves again, press Merge
    node gateway/gh-propose.mjs demo/changes/ledger-shortcut.json      # 5. the shortcut: red, not in the architecture; close it
    node gateway/gh-propose.mjs demo/changes/architect-ledger-connection.json --as owner
                                                                       # 6. the architect: red until Aaron approves; press Merge
    node gateway/gh-propose.mjs demo/changes/trade-count.json          # 7. the same harmless change: now red

The gateway's decisions, decorators and Hub state are in `.gh/`, apart from the local demo's; the apps' ids are in
`.github-demo.json` and their keys in `keys/`, all kept out of git.
