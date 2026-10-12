---
id: SPEC-004
title: The gateway decides with the model's controls
status: approved
owner: matthew-bain
calm-nodes: []
calm-relationships: []
model-change: [sdlc-prev-001-code-review]
---

# SPEC-004 The gateway decides with the model's controls

## Why
The merge gateway should enforce exactly the controls the architecture carries, and leave its decisions on the
architecture where people can see them.

## What
- The gateway guards a real repository, evaluates the ergo controls of `main` at stage `merge`, and merges on ALLOW.
- Every decision is recorded as CALM control-evaluation decorators, published with the architecture to CALM Hub.
- The demo replays the talk's moments: a routine change, the Client Ledger rule, the shortcut, and the architect's change.
- Tests no node owns need a spec and a code review, not a human approver; the rest of the control plane still needs one.

## Acceptance
- `bash gateway/run-demo.sh` ends with `demo ok`, with and without `CALM_HUB_URL`.
- `npm test`, `npm run typecheck` and `SPEC=SPEC-004 npm run gates` pass.
