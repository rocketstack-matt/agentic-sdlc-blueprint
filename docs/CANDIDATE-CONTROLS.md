# Candidate controls for the SDLC Common Controls Catalog

The catalog was written for a human-driven SDLC and already anticipates agents in places (SDLC-PREV-001 treats
prompts as reviewable artefacts and allows approved cognitive review engines). Building this blueprint surfaced
three controls we could not find in the catalog. They are **drafts to start a conversation**, not catalog content.
If they resonate, raise them at https://github.com/finos-labs/SDLC-Controls-Framework.

## 1. Architecture Conformance
**Intent.** Code admitted to a protected baseline must not introduce connections, dependencies or data flows that
are absent from the system's approved, machine-readable architecture.
**Why now.** Agents drift one reasonable assumption at a time, and each assumption passes tests and review in isolation.
**Mitigates.** SDLC-OP-007 Configuration Drift (extended from runtime state to design intent), SDLC-SEC-008 Unauthorised Change.
**Sketch of requirements.** An approved architecture model MUST exist in version control. A deterministic check MUST compare
changes to it and block on unmodelled connections. Changes to the model MUST follow a stricter review route than
changes to code. **Reference implementation:** `gates/drift-check.mjs`.

## 2. Agent Task Scoping
**Intent.** An AI agent's change must be bound to an approved requirement that declares, in advance, the architectural
scope the agent may modify, and the change must be rejected if it exceeds that scope.
**Mitigates.** SDLC-SEC-008 Unauthorised Change, SDLC-RC-005 Audit and Compliance Evidence Failure.
**Relates to.** SDLC-PREV-004 Requirements Repository, AIGF mi-18. **Reference implementation:** `gates/spec-check.mjs`.

## 3. Agent Attribution and Context Provenance
**Intent.** For any agent-authored change the organisation can show which agent identity produced it, under which
instructions, and with which architectural context, at the time of the change.
**Mitigates.** SDLC-RC-005, SDLC-RC-001 Insider Threat (compromised or misdirected agents behave like insiders).
**Sketch of requirements.** Evidence MUST bind the change to the agent identity, the hash of the agent instructions
(`AGENTS.md`), and the hash of the architecture it was given. The authoring agent MUST NOT satisfy the review requirement.
**Reference implementation (partial):** `gates/evidence.mjs` records `architectureSha256` and author kind.
