# The merge gateway

The second half of the talk, runnable. A merge gateway decides whether a change may reach `main`. It asks a policy
(Open Policy Agent, compiled to WebAssembly and evaluated in process) whose data is the architecture model with the
catalog's code review control attached as config, and whose input is the change, the signed review record and an
optional human approval token. Deny by default. The author agent may not review its own change; the reviewer must be
an approved cognitive engine named in the model; a change touching a tier 1 node or a control plane path needs a
human approval token that is single use, short lived and bound to the commit and the SHA-256 of the exact diff; the
token is minted only by the approval service after a human approves, which the demo mocks as a terminal prompt.
Every decision is appended to `decisions.ndjson` with the hashes of the change, the architecture and the policy.

    npm install
    bash run-demo.sh        # the whole sequence, recorded into sessions.json, with a self-check

The commands, one idea each: `node gateway/propose.mjs <change>`, `node gateway/review.mjs <change> --as <identity>`,
`node gateway/merge.mjs <change> [--review <record>] [--approval token.json]`, `node gateway/approve.mjs <change>`
(the approval service: renders the real diff, asks for a binding code, mints the token) and
`node gateway/evidence.mjs --last N`. The policy is `policy/merge.rego`; `policy/README.md` says how the committed
`merge.wasm` was built and what stays in Node (signatures and hashes, which the wasm runtime cannot check).

The model it reads is the repository's `architecture/trade-capture.architecture.json`; two keys the policy needs on
the code review control (`approved-cognitive-engines` and `human-approval`) are added in memory by `gateway/lib.mjs`
until they are added to the model itself, which is a control plane change. The slides' terminal panes are written
from `sessions.json` by `node slides/demo-captures.mjs gateway/sessions.json`.
