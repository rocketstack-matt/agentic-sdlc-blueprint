---
id: SPEC-003
title: Trade API writes end-of-day snapshots to the Client Ledger
status: approved
owner: trade-capture-leads
calm-nodes: []
calm-relationships: []
model-change: [trade-api-to-client-ledger]
---

# SPEC-003 Trade API writes end-of-day snapshots to the Client Ledger

## Why
Operations want each day's trades written to the book of record directly, without a round trip per trade.

## What
A model change only: the relationship `trade-api-to-client-ledger`, trade-api connecting to the Client Ledger's file
interface. The code that uses it follows under its own spec once the relationship is in the model.

## Acceptance
- The relationship is in the model. From then on, a change to trade-api is a change to a service that connects to the
  Client Ledger, and needs a human approver.
