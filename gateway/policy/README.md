# Merge policy

`merge.rego` is the merge gateway's policy: Rego v1, for OPA 1.x. It is compiled to `merge.wasm`
and evaluated in process by the gateway through `@open-policy-agent/opa-wasm`. The gateway never
shells out to `opa` and never calls a policy server.

## How merge.wasm was built

The maintainer runs opa once per policy change. OPA 1.21.1 (darwin arm64, static binary) built the
committed `merge.wasm`:

    opa check merge.rego
    opa build -t wasm -e merge/allow -e merge/deny -o bundle.tar.gz merge.rego
    tar -xzOf bundle.tar.gz /policy.wasm > merge.wasm

`build.sh` runs exactly these steps; set `OPA` to your binary if it is not on `PATH`. The two
entrypoints are `merge/allow` (a boolean) and `merge/deny` (the set of reasons). The SHA-256 of
`merge.wasm` is recorded as the `merge-policy` bundle revision in every decision, so a decision can
always be tied to the policy that made it.

## What the policy sees

DATA is `data.arch`: the FINOS CALM architecture (`trade-capture.architecture.json`) with the
catalogue's controls attached as config. The policy reads the `sdlc-prev-001-code-review` control:
`author-may-not-review`, the `rules` (whose `human` rules name the tier ceiling, the data
classifications and the control plane paths), `approved-cognitive-engines` and `human-approval`
(issuer, audience, max age, single use and what the token must be bound to). Nodes are matched to
files by `metadata.source-path`; tier and classification come from the node's metadata.

INPUT is the change (id, spec, author, commit, files, diff hash), the spec (approved, nodes in
scope), the review record, the approval token and `now` in unix seconds.

## What stays in Node

The wasm target has no JWT or crypto builtins, so the gateway verifies the ES256 signatures of the
review record and the approval token, computes the diff hash and reads the single-use ledger before
evaluation. The policy receives the claims plus `verified` and `used` flags. Issuer, audience,
expiry, the binding to commit, diff and spec, and single use are all decided in Rego from the
control's config. Deny is the default: `allow` is true only when the deny set is empty.

## Testing

    node policy/test.mjs

Evaluates `merge.wasm` against the real model with hand-built inputs for every scenario.
