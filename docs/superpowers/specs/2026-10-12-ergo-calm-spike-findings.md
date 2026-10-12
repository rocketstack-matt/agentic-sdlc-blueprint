# ergo × CALM spike: findings

Ran on 12 October 2026 with OPA 1.21.1 (darwin arm64), ergo `d924f4d`, `@open-policy-agent/opa-wasm` 1.10.0 and
Node 26.4.0. The code was throwaway, in `.amp/in/spike` (not committed). Plan:
`docs/superpowers/plans/2026-10-12-plan-1-ergo-calm-spike.md`.

The fixtures were generated from `architecture/trade-capture.architecture.json` with `position-store` renamed
`client-ledger`, tiers and classifications removed, and four controls whose `config.ergo` holds an ergo policy.

## Answers to the spec's questions

1. **ergo compiles to Wasm and runs from Node.** Yes. `opa build -t wasm` on `ergo.rego` plus a 25-line entrypoint
   gives a 635 KB module. The only built-in it needs from JavaScript is `time.parse_rfc3339_ns`, passed in as ergo's
   reference shows; none of our checks use it. One evaluation (39 rows) uses about 9.2 MB of Wasm heap, in 10.3 MB
   of linear memory. opa-wasm resets the heap before every `evaluate`, so this does not grow across calls.
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
| S10 docs-only change, no nodes | allow; ledger not applicable | allow; not applicable | every `$applies` row false with cause `value` |
| S5 the shortcut: code makes `trade-api → client-ledger`, model lacks it | deny | deny | subject `trade-api->client-ledger`, `in_architecture`: "The architecture has this connection" |
| S5b S5's code after the architect's change, approved | allow | allow | |
| S9 change touches `trade-store`, outside SPEC-001 | deny | deny | subject `trade-store`, `in_spec`: "The spec declares this node" |
| S7 a typo (`equalz`) inside a control's ergo check | deny | deny | `code-review` fails `$well_formed` (but see gap 1: a control with no `config.ergo` vanishes) |
| S11 two controls define the same subject name differently | no report | no report | evaluation fails: Wasm throws the string `controls.rego:19:14: object insert conflict`; `opa eval` gives `eval_conflict_error` |
| Parity: Wasm vs `opa eval`, 7 inputs | identical | identical | reports deep-equal |

## Surprises

- **One missing approval gives five violations**, one per approval check, all on the same subject. Plan 3 should
  show the first by importance (`human_approved`) and fold the rest into the decorator, or group the approval checks
  under one `any_of` so a missing approval is one row.
- **S5's cause is `absent`, not `value`.** The `any` over relationships tries `interacts` and `composed-of` items,
  whose `connects` path is missing, and the row takes the worst cause. The verdict is right; the cause is noisy.
  Filtering the list to `connects` relationships may make it `value`; not tried. A malformed connection fact (no
  `destination`) also gives `absent`, so the cause cannot tell drift from bad input.
- **The Wasm runtime throws a plain string, not an `Error`**, when the entrypoint fails. The gateway must treat any
  thrown value, or an undefined report, as a deny. A requirement-name clash throws the same way. Two *identical*
  duplicate controls do not throw; they merge silently into one row.
- **The rule as built is direct.** S1 shows it: `trade-api` calls `position-service`, which writes to the ledger,
  and S1 is still allowed because only `connects` relationships *into* `client-ledger` count. An `interacts`
  relationship into the ledger is ignored too, by design.

## Gaps plan 3 must close

Found by an independent review of the spike, each reproduced with a probe against the spike's controls:

1. **A control without `config.ergo` disappears.** Deleting the ledger control's `ergo` key, renaming it, or emptying
   its requirements makes S3 allowed, with no trace in the report. The entrypoint must fail when any control
   requirement lacks `config.ergo`; the gateway must check every control key in the model appears as a
   `calm-control` in the report's requirement `meta`; the pattern must require `ergo`.
2. **The author can be the approver.** S3 with `approval.approver: "author-agent"` is allowed. Add checks that the
   approver is neither the author nor the reviewer and is on a list of people, or state that Node guarantees it.
3. **The spec checks do not run when a change touches no nodes, and the spec id is never matched.** A docs-only
   change with an unapproved spec is allowed, and so is `change.spec: SPEC-001` against `spec.id: SPEC-999`. Add a
   requirement on the change itself (`from: ["change"]`) for `spec_approved` and `change.spec == spec.id`.
4. **Files no node owns look like a docs-only change.** Only `trade-api` and `position-service` have
   `metadata.source-path` today, so a change to `gateway/`, `gates/` or a store gets `nodes: []` and only code review
   applies. Node must pass unowned non-docs files as a fact and a control must deny on them, or every node gets a
   source-path. S9's input was written by hand; the real mapping cannot produce `trade-store` yet.
5. **The policy is read from the input's architecture.** If the gateway passed the pull request's own model, a pull
   request could delete its controls (gap 1). Controls must always come from the `main` architecture, and a pull
   request that changes the model is gated by the control-plane rule.

## Recommendation for plan 3

- **Control config shape.** Each control's `config` carries `control-id`, `name` and `ergo: { subjects,
  requirements }`, exactly as in the spike. Requirement `meta` carries `control-id` and `calm-control` (the control's
  key in the model). Violation rows carry no `meta`, so a row maps to its control through
  `report.requirements[row.requirement].meta`; the node a control sits on is not in `meta` and must be looked up in
  the model, or added to `meta`.
- **The entrypoint stays generic.** It collects every `config.ergo` from system and node controls and calls
  `ergo.report(input, policy, {})`. Changing the model never rebuilds the Wasm module. It needs the guard from gap 1
  and the `main`-only rule from gap 5 to be safe. Subject and requirement names must be unique across all controls;
  the pattern should enforce that, because identical duplicates merge without an error. The gateway denies when the
  evaluation throws.
- **Input** is `{ architecture, change, spec }`. Node still works out two facts about the change: the nodes it touches
  (from `metadata.source-path`) and the connections its code makes (the `drift-check` convention). Signatures,
  expiry and single use stay in Node and arrive as `verified` and `used`.
- **Verdict** is `report.compliant`, never "no violations", as ergo's reference advises.
- **Memory and time.** About 9 MB per evaluation is fine for a gateway. The spike's `violations` entrypoint works the
  report out again, which costs time, not memory. Plan 3 should expose one entrypoint that returns
  `{report, violations}` from a single evaluation.
- **What to offer the ergo project.** No CALM-specific Rego is needed. The contribution is an example
  (`examples/calm/`): a CALM architecture whose controls carry ergo requirements, the generic entrypoint, and the
  scenario tests above.
