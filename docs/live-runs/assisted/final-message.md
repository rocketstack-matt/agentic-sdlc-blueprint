SPEC-001 is implemented and every blocking gate passes.

## What I did

**`services/trade-api/src/app.ts`**, added `GET /accounts/{account}/summary`. It reads trades from trade-api's own store and fetches positions from position-service over `positionServiceUrl`:

- `200` with `{ account, trades, positions }` for a known account
- `200` with `[]` / `{}` for an unknown one (position-service already returns `{}` for an unseen account)
- `502` when position-service is unreachable or answers non-2xx

The fetch is wrapped in its own try/catch rather than falling through to the handler's outer catch, which would have turned a connection failure into a `400`.

**`test/account-summary.test.ts`**, one test per acceptance criterion. The 502 case uses a second trade-api instance pointed at a dead address.

## Architecture

No new relationship, and no new env binding. Positions are read only over `trade-api-to-position-service`, via the `positionServiceUrl` already in `services/trade-api/src/config.ts`. Reading `position-store` directly would have been shorter but is barred by `sdlc-prev-017-service-dependency`, so it was never on the table. Drift-check confirms the same three edges as before:

```
trade-api -> trade-store, trade-api -> position-service, position-service -> position-store
3 connection(s) observed in code, 3 modelled in CALM.
```

## Gates

`SPEC=SPEC-001` → `admissible: true`. calm-validate, spec-check (touches `trade-api` only, inside SPEC-001's scope), drift-check, tests (5 passed, 0 failed), review-router all pass. Typecheck is clean.

## Handover

The review router returned **mode: HUMAN, authorMayNotReview: true**, so this needs a human reviewer, not me. Worth knowing: `services/trade-api/src/app.ts` on its own routes to `cognitive` (tier 2, internal). The escalation to `human` comes from three untracked files in the working tree, `run.started`, `run.stderr`, `run.transcript.jsonl`, which map to no CALM node and fail safe to the default mode. They're harness artifacts from this run, not part of my change; they aren't in `.gitignore`, so they'll keep escalating the router until they're ignored or removed. That's a control-plane decision, so I've left it alone.

I haven't committed, you're on `main`, and the change is staged for your review. When you're ready:

```
git checkout -b spec-001-account-summary
git add services/trade-api/src/app.ts test/account-summary.test.ts
git commit -m "feat(trade-api): account summary endpoint" -m "Spec: SPEC-001"
```

Want me to run `SPEC=SPEC-001 npm run evidence` to produce the hashed bundle as well?
