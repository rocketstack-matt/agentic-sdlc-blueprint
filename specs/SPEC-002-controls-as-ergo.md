---
id: SPEC-002
title: The model carries the policy
status: approved
owner: matthew-bain
calm-nodes: []
calm-relationships: []
model-change: [client-ledger, position-service-to-client-ledger, trade-capture-composition, client-ledger-human-approval, sdlc-prev-001-code-review, sdlc-prev-004-requirements-repository, sdlc-prev-012-deployment-gating, sdlc-prev-014-test-evidence-retention, sdlc-prev-017-service-dependency]
---

# SPEC-002 The model carries the policy

## Why
The controls on the architecture should be the checks that run, not descriptions of scripts that run elsewhere.

## What
- Each control in the CALM model carries its policy as ergo requirements in `config.ergo`.
- One generic policy module evaluates whatever controls the base branch's model carries.
- `position-store` becomes `client-ledger`. Tiers and data classifications are removed.
- The Client Ledger carries a control: any change to a service that connects to it needs a human approver.
- Service dependency control moves to the system: every connection the code makes must be in the model.
- The bespoke gate scripts are replaced by `gates/check.mjs`.

## Acceptance
- `npm run calm:validate`, `npm test`, `npm run typecheck` and `SPEC=SPEC-002 npm run gates` pass.
- The scenarios in `test/controls.test.mjs` pass, including the Client Ledger rule following a new connection.
