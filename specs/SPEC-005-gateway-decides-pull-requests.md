---
id: SPEC-005
title: The merge gateway decides pull requests on GitHub
status: approved
owner: matthew-bain
calm-nodes: []
calm-relationships: []
model-change: []
---

# SPEC-005 The merge gateway decides pull requests on GitHub

## Why
The talk shows the demo on GitHub pull requests, which everyone can follow, instead of terminals. The controls, the
model and the decorators stay exactly as they are; only where the gateway reads changes from and reports to changes.

## What
- A demo repository, `rocketstack-matt/osffny-sdlc-calm`, holds the trade capture system: the architecture, the
  services, their tests and the specs. Its `main` is protected and needs the gateway's check.
- An agent (a GitHub App) opens the demo's changes as pull requests. A review bot (GitHub Actions) reviews them.
  People approve with GitHub's own review.
- The gateway, run on the presenter's laptop, reads each open pull request (its author, its reviews, its diff),
  evaluates the controls of `main` at stage `merge` with the same `gates/lib/controls.mjs`, posts the result as the
  "Architecture controls" check with the reasons in plain words, records the decision as CALM decorators (on CALM
  Hub when `CALM_HUB_URL` is set). `main` takes a pull request only when that check has passed, so the Merge button
  works only on a yes.
- A person's approval counts only for the commit they approved: a push after it makes the check fail again.
- GitHub identities map to the people and bots the model names, in the gateway's configuration.
- The local demo (`gateway/run-demo.sh`) keeps working unchanged.

## Acceptance
- The demo's moments play on GitHub: the routine change can be merged; the Position Service change waits for a person; a
  push after approval fails the check; the shortcut is refused; the architect's change needs a person; after it, the
  same kind of Trade API change needs a person.
- `npm test`, `npm run typecheck`, `bash gateway/run-demo.sh` and `SPEC=SPEC-005 npm run gates` pass.
