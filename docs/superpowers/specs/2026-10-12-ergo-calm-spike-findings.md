# ergo × CALM spike: findings

Ran on 12 October 2026 with OPA 1.21.1 (darwin arm64), ergo `d924f4d`, `@open-policy-agent/opa-wasm` 1.10.0 and
Node 26.4.0. The code was throwaway, in `.amp/in/spike` (not committed). Plan:
`docs/superpowers/plans/2026-10-12-plan-1-ergo-calm-spike.md`.

The fixtures were generated from `architecture/trade-capture.architecture.json` with `position-store` renamed
`client-ledger`, tiers and classifications removed, and four controls whose `config.ergo` holds an ergo policy.

## Answers to the spec's questions

1. **ergo compiles to Wasm and runs from Node.** Yes. `opa build -t wasm` on `ergo.rego` plus a 25-line entrypoint
   gives a 635 KB module. The only built-in it needs from JavaScript is `time.parse_rfc3339_ns`, passed in as ergo's
   reference shows; none of our checks use it. One report plus its violations (two evaluations, 39 rows) used
   9.19 MB of Wasm heap.
2. **Membership through a `$$input` ref, without a custom operator.** Yes. The ledger filter
   `{"op": "in", "path": [...source.node], "values": {"ref": ["$$input", "change", "nodes"]}}` works, and an empty
   `change.nodes` (a docs-only change) rules every connection out with cause `value`, so the rule is
   `not_applicable` rather than failing. The plan's fallback was not needed.
3. **Custom operators.** None. Every rule is ergo built-ins over the CALM document as it is. `calm.rego` is not
   needed.

## Scenario results

| Scenario | Expected | Result | What the report says |
| --- | --- | --- | --- |
| S1 routine change to `trade-api`, reviewed by `review-bot` | allow | allow | ledger rule `not_applicable` |
| S2 the author reviews its own change | deny | deny | `not_the_author`: "The author may not review its own change" (`value`); `approved_reviewer` also fails |
| S1b ledger rule on S1 | not applicable | not applicable | 0 of 5 relationships in scope |
| S3 change to `position-service`, no approval | deny | deny | subject `position-service-to-client-ledger`, `human_approved`: "A human approved this change" (`absent`) |
| S4 S3 with an approval for this commit and diff | allow | allow | ledger rule `met` |
| S4b approval bound to another diff | deny | deny | `approval_for_this_diff`: "The approval is for this exact diff" (`value`) |
| S6 the architect adds `trade-api → client-ledger`; S1 again | deny | deny | subject `trade-api-to-client-ledger`, five approval checks, all `absent` |
| S10 docs-only change, no nodes | not applicable | not applicable | every `$applies` row false with cause `value` |
| S5 the shortcut: code makes `trade-api → client-ledger`, model lacks it | deny | deny | subject `trade-api->client-ledger`, `in_architecture`: "The architecture has this connection" |
| S5b S5's code after the architect's change, approved | allow | allow | |
| S9 change touches `trade-store`, outside SPEC-001 | deny | deny | subject `trade-store`, `in_spec`: "The spec declares this node" |
| S7 a typo (`equalz`) in a control in the model | deny | deny | `code-review` fails `$well_formed` |
| S11 two controls define the same subject name differently | no report | no report | evaluation fails: Wasm throws the string `controls.rego:19:14: object insert conflict`; `opa eval` gives `eval_conflict_error` |
| Parity: Wasm vs `opa eval`, 7 inputs | identical | identical | reports deep-equal |

## Surprises

- **One missing approval gives five violations**, one per approval check, all on the same subject. Plan 3 should
  show the first by importance (`human_approved`) and fold the rest into the decorator, or group the approval checks
  under one `any_of` so a missing approval is one row.
- **S5's cause is `absent`, not `value`.** The `any` over relationships tries `interacts` and `composed-of` items,
  whose `connects` path is missing, and the row takes the worst cause. The verdict is right; the cause is noisy.
  Filtering the list (or a `connection` subject with `each_as`) would make it `value`.
- **The Wasm runtime throws a plain string, not an `Error`**, when the entrypoint fails. The gateway must treat any
  thrown value, or an undefined report, as a deny.
- **The connection rule must be direct.** Confirmed by S1: `trade-api` calls `position-service`, which writes to the
  ledger, and S1 is still allowed because only `connects` relationships *into* `client-ledger` count.

## Recommendation for plan 3

- **Control config shape.** Each control's `config` carries `control-id`, `name` and `ergo: { subjects,
  requirements }`, exactly as in the spike. Requirement `meta` carries `control-id` and `calm-control` (the control's
  key in the model), so each report row maps back to its control and its node without a lookup table.
- **The entrypoint stays generic.** It collects every `config.ergo` from system and node controls and calls
  `ergo.report(input, policy, {})`. Changing the model never rebuilds the Wasm module. Subject and requirement names
  must be unique across all controls; the pattern should enforce that, and the gateway denies when the evaluation
  throws.
- **Input** is `{ architecture, change, spec }`. Node still works out two facts about the change: the nodes it touches
  (from `metadata.source-path`) and the connections its code makes (the `drift-check` convention). Signatures,
  expiry and single use stay in Node and arrive as `verified` and `used`.
- **Verdict** is `report.compliant`, never "no violations", as ergo's reference advises.
- **Memory.** 9 MB per call is fine for a gateway that evaluates once per request. Evaluate `report` once and call
  `violations` on it, rather than computing the report twice as the spike did.
- **What to offer the ergo project.** No CALM-specific Rego is needed. The contribution is an example
  (`examples/calm/`): a CALM architecture whose controls carry ergo requirements, the generic entrypoint, and the
  scenario tests above.
