SPEC-001 is implemented.

**The change**, `services/trade-api/src/app.ts:47-62`, one new route:

```
GET /accounts/{account}/summary → { account, trades, positions }
```

Trades come from trade-api's own store; positions are fetched over HTTP from `positionServiceUrl` (the `trade-api-to-position-service` relationship), using position-service's existing `GET /positions/{account}`. A non-ok response or a failed connection both return 502.

**On the architectural constraint:** reading `position-store` directly was not taken. No CALM model change was needed either, `trade-api-to-position-service` already exists and its description already covers "read positions", and position-service already exposes the read endpoint. `drift-check` confirms it: 3 connections observed in code, 3 modelled, no new edges.

**Tests**, `test/trade-capture.test.ts`, one per acceptance criterion: known account returns trades plus `{ "VOD.L": 60 }`, unknown account returns empty collections, and an unreachable position-service returns 502.

**Verification:**

| Check | Result |
| --- | --- |
| `npm test` | 5 passed, 0 failed |
| `npm run typecheck` | clean |
| calm-validate | PASS |
| drift-check | PASS |
| review-router | HUMAN |
| spec-check | needs the spec binding, see below |

Two things to flag:

`spec-check` fails with *"Change touches [trade-api] but names no spec."* That is the spec binding, not a defect in the code, the gate reads the id from `SPEC=SPEC-001` or a `Spec: SPEC-001` commit trailer. I couldn't run it the env-var way (those calls needed approval), and I haven't committed since you didn't ask me to. Say the word and I'll branch off main and commit with the trailer, which passes it.

`review-router` returns HUMAN rather than the COGNITIVE you'd expect for a tier-2/internal service plus tests. That's the three untracked harness artifacts in the working tree, `run.started`, `run.stderr`, `run.transcript.jsonl`, matching no rule and failing safe to the default mode. They aren't part of the change; excluding them from the commit routes it to cognitive.
