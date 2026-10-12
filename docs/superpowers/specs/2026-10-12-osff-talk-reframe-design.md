# OSFF New York talk reframe: the diagram says no

Status: draft for review · 12 October 2026 · talk date 4 November 2026 (35 minutes, Matthew Bain and Aaron Searle)

## Why

The current deck (23 slides) does not land with a general conference audience:

- CALM is the title but not the hero. It first appears on slide 12 as one of four boxes, and nothing argues why
  controls belong on the architecture rather than in pipeline YAML or a policy repository.
- The first half is the working group's history (proposal, timelines, DORA article numbers, per-card versioning).
- The climax (an approval token that dies when the diff changes) is about cryptographic binding and would work the
  same with no architecture model.
- The demo is six allow/deny variations of one control shown as terminal output full of SPIFFE ids, hashes and terms
  such as "cognitive review engines" and "criticality tier", which only mean something with bank-specific assumptions.

## Outcome

An attendee who has never heard of CALM leaves able to say: "they attached the controls to the architecture diagram,
so when the architecture changed, the controls changed with it, and the evidence was pinned back onto the diagram."
And they know the first step: one control, one repository.

## Thesis

Every team already has three things: the controls (policy documents), the architecture (a diagram on a wiki) and the
pipeline (YAML per team). They live in three places and drift apart. People bridged the gaps with judgment; agents
are fast and literal, and go through them. Attach the controls to the architecture as data and the diagram itself
decides what may merge. Change the architecture and the controls follow, with no pipeline edits.

## Part 1: the narrative

One continuous story in two voices, no "part one / part two" split. Concepts introduced, each in one line: **CALM**
(the diagram as data), **ergo** (checks a rule against data and says why), **decorator** (the result pinned back onto
the diagram). No other jargon on screen.

| Time | Beat | Voice | Content |
| --- | --- | --- | --- |
| 0–5 | The PR | Aaron | Keep the opening: bot-authored, bot-approved, merged. Ask which of the room's controls it passed. One picture of the three things that drift. One slide on the catalog: banks wrote the controls once, in the open. Code review in one sentence: "you can't approve your own change, and risky changes need a human." End on: who decides what is risky? Today, a person from memory. |
| 5–10 | The idea | Matthew | What is risky is a fact about the architecture. The five-box diagram; point at the Client Ledger; "anything that connects to the ledger" highlights itself. The control shown sitting on the ledger box. The loop: diagram, rule, change, verdict on the diagram. |
| 10–25 | Live in CALM Hub | both | Four beats, below. |
| 25–32 | Why you should care | Aaron, then Matthew | Developers: a fast lane; most changes merge with no human. Architects: the diagram is load-bearing and cannot go stale because it is enforced. Risk and audit: evidence is a by-product; "every change to anything touching the client ledger last quarter, and who approved it" is a query over decorators, not a project. Bridge line kept from the catalog: "unsubstantiated controls are absent controls." Everything shown is open: the catalog, CALM, and ergo described as "an open source project" (no FINOS contribution announced). |
| 32–35 | The ask | both | Take one control and one repository, and make the diagram say no. Links. |

The demo beats, each visible in the CALM Hub diagram as red or green on the affected box:

1. **Routine change.** The agent changes `trade-api`; an approved bot reviewer approves; merged; `trade-api` green.
   Quick variant: the agent reviews its own change and is denied in the catalog's words ("the author may not
   review its own change").
2. **The ledger.** The agent changes `position-service`; red: "connects to the Client Ledger; a human must approve."
   A person reads the real diff (rendered from the repository, not the agent's summary) and approves; green. The
   approval token gets one line: change one character after approval and the approval dies.
3. **The shortcut.** The agent makes `trade-api` write straight to the ledger; red: "that connection is not in your
   architecture."
4. **Climax: the architect makes it official.** The architect adds `trade-api → client-ledger` to the model. That
   change touches the control plane, so it needs a human too ("even changing the rules goes through the rules").
   On merge the new architecture version is published to the Hub and the new connection appears. The earlier
   `trade-api` change, re-evaluated, is now red. The diagram changed; the control followed; nobody edited a pipeline.

Cut from the deck: the catalog's history and timelines, DORA and NIST article lists, tiers and data classifications,
SPIFFE ids, hashes on screen, the six terminal captures, the approval ceremony sequence diagram.

Kept: the opening PR, the catalog's sentence as the first denial, the evidence bridge line, the repository as the
take-away.

A recorded video of the full demo is the fallback for the live run.

## Part 2: the technical design

```
 agent's PR            CALM architecture (main)                  CALM Hub
┌──────────┐   ┌──────────────────────────────────┐        ┌──────────────────┐
│ files    │   │ nodes + connections              │        │ architecture vN  │
│ author   │   │ controls: config = ergo rules    │        │ decorators ──▶ UI│
│ review   │   └────────────────┬─────────────────┘        │ red/green boxes  │
│ approval │                    │ data                     └────────▲─────────┘
└────┬─────┘                    ▼                                   │
     │  input   ┌──────────────────────────────────┐  report  ┌──────┴─────────┐
     └─────────▶│ ergo (+ small calm.rego) → Wasm  ├─────────▶│ decorator per  │
                │ inside the merge gateway         │          │ control/change │
                └──────────────────────────────────┘          └────────────────┘
```

### 2.1 Controls carry ergo requirements

Each control's `config` in `architecture/trade-capture.architecture.json` holds an ergo requirement (description,
subject, `applies_to`, checks) as plain data. The gateway passes the configs to ergo unchanged as the policy; ergo's
input is `{ "architecture": <the CALM document>, "change": <the change facts> }`. The pattern
(`governed-service.pattern.json`) and the control requirement documents are updated so the model stays valid and
the pattern still requires these controls.

| Control | Attached to | Rule as the audience reads it |
| --- | --- | --- |
| Client ledger (an SDLC-PREV-001 configuration) | the ledger node: `position-store` renamed `client-ledger`, "Client Ledger" | Any change to a service that connects to this node needs a human approver |
| Code review (SDLC-PREV-001) | system | The author is not the reviewer; the reviewer is an approved one |
| Service dependency (SDLC-PREV-017) | system | Every connection the code makes exists in the architecture |
| Requirements (SDLC-PREV-004) | system | The change names an approved spec and touches only its nodes |

`criticality-tier` and `data-classification` metadata are removed from the model and from every rule.

### 2.2 The connection rule is direct, not transitive

`trade-api` already calls `position-service`, so a transitive "can reach the ledger" rule would make `trade-api`
need a human from the start and remove the climax. The ledger rule's subjects are CALM `connects` relationships,
kept by `applies_to` when the destination is `client-ledger` and the source is a node the change touches. Adding the
relationship `trade-api → client-ledger` creates a new in-scope subject; the rule itself does not change.

A change touches a node when one of its files is under the node's `metadata.source-path`. The connections the code
makes (for the service dependency control) come from the existing convention used by `gates/drift-check.mjs`: env
bindings and cross-node imports.

Preference order for expressing this: ergo built-in operators with refs into `$$input`; then a small `calm.rego`
of ergo custom operators (for example, file belongs to node, connection exists in model). `calm.rego` is the
reusable CALM integration offered to the ergo project.

### 2.3 The gateway

- Node keeps verifying signatures, hashes, expiry and single use, and marks records verified, as today.
- ergo (pinned copy of `ergo.rego`) plus the policy files compile to one Wasm module, built by
  `gateway/policy/build.sh` with OPA 1.19 or later, run from Node as `merge.wasm` is today.
- Verdict: allow only when every control's report is compliant. Deny reasons are ergo violation descriptions.
- Every evaluation emits one decorator per control (2.4), written to the decision log and posted to the Hub.
- On a merge that changes the architecture, the gateway publishes the new architecture version to the Hub.

Retired: `gateway/policy/merge.rego`, `gates/review-router.mjs`, `gates/spec-check.mjs`, `gates/drift-check.mjs`,
`gates/model-diff.mjs`, `gates/evidence.mjs` and the CALM evidence documents, `gates/run-all.mjs` once nothing calls
it. `npm run gates` and CI run the same ergo policy against the working tree. The workflow's dependency, SBOM and
secret scanning steps stay.

### 2.4 The `control-evaluation` decorator Standard

Added to the CALM repository beside the deployment decorator standards in `calm/draft/2026-03/standards/`, extending
`decorators.json#/defs/decorator` with `allOf`:

- `type`: `control-evaluation`
- `target`: the architecture document, at its version
- `applies-to`: the unique ids of the nodes or relationships in scope for the control
- `data`: control key and catalog id, requirement URL, change (commit, diff sha256, spec), `compliant`, `status`
  (`met`, `not_met`, `not_applicable`), `causes`, violations (description, expression, subject), evaluated-at, sha256
  of the full ergo report and of the policy module, and the reviewer and approver identities when present

The blueprint carries a copy and validates every emitted decorator against it.

### 2.5 CALM Hub UI

A pull request to `calm-hub-ui` in `finos/architecture-as-code`:

- fetch `control-evaluation` decorators for the displayed architecture version, beside the deployment decorators
  (`DiagramSection`, `calm-service.tsx`)
- a red or green badge on each node and relationship in `applies-to`, from the latest evaluation per control
- a panel listing the violations in plain English, with the change and approver

### 2.6 Deck

`slides/index.html` rewritten to the narrative in Part 1. Demo screens become CALM Hub screenshots captured from the
real run, replacing `slides/captures.js` terminal sessions; `slides/check.mjs` and `slides/overflow-check.mjs` are
updated to the new deck and must pass. README and gateway README describe the new flow.

## Delivery order

1. **Spike** (throwaway): ergo plus a draft `calm.rego` compiled to Wasm and run from Node against the CALM document
   and a sample change, proving the ledger rule, the review rule and the connection rule, including the new-subject
   behaviour when a relationship is added. Settles: custom operators are not allowed inside `all`/`any`; whether a
   `$$input` ref can drive membership without a custom operator; OPA version available.
2. Decorator Standard (CALM repository).
3. Model, policy and gateway rebuild (this repository).
4. Hub UI rendering (CALM repository).
5. Deck rewrite and captures; recorded fallback video.

## Governance in this repository

Changes under `architecture/`, `gates/`, `agent/` and `.github/` are control-plane changes. They are made by, or
reviewed and approved by, a human (Matthew) before implementation depends on them, consistent with `AGENTS.md`.
Code changes are done against an approved spec in `specs/`, and the gateway's demo stays green on `main`.

## Risks

- ergo is pre-alpha with breaking changes expected; mitigated by pinning a copy of `ergo.rego`.
- The live demo depends on a local CALM Hub and UI; mitigated by the recorded video.
- The Hub UI PR must merge, or be run from a branch, in time for 4 November.
- Public wording on ergo is "an open source project" until Kosli agrees otherwise.

## Out of scope

The real approval ceremony (passkey, CIBA, RFC 9396 grants) stays mocked as today. Transitive or flow-level rules.
Other catalog controls beyond the four above.
