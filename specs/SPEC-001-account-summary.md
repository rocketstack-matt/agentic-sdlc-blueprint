---
id: SPEC-001
title: Account summary endpoint
status: approved
owner: trade-capture-leads
calm-nodes: [trade-api, position-service]
calm-relationships: [trade-api-to-position-service]
---

# SPEC-001 Account summary endpoint

## Why
Traders want one call that returns an account's trades together with its current positions.

## What
`GET /accounts/{account}/summary` on **trade-api** returns:

```json
{ "account": "ACC-1", "trades": [ ... ], "positions": { "VOD.L": 60 } }
```

## Architectural context (from the CALM model)
- Lives in node `trade-api`.
- Positions are owned by node `position-service`. trade-api reaches them only over relationship
  `trade-api-to-position-service`.
- Node `client-ledger` (the book of record) carries a control: any change to a service that connects to it needs a
  human approver. trade-api has no connection to it. **Reading the ledger from trade-api is not an available
  option**, even though it would be fewer lines of code: the connection is not in the model, so service dependency
  control blocks it.

## Acceptance
- Returns trades and positions for a known account, and empty collections for an unknown one.
- Returns 502 if position-service is unavailable.
- No new relationships in the CALM model. If you believe one is needed, stop and propose a model change first.
