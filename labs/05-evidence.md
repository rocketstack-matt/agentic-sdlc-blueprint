# Lab 5. Evidence: answer the examiner in one file

**Lab 5 of 5. About 5 minutes.**

Risk SDLC-RC-005 is blunt: if you cannot produce the record, the control did not operate.

1. Commit attempt B with its spec trailer, as an agent would be required to:
   ```sh
   git add -A && git commit -m "Add account summary endpoint" -m "Spec: SPEC-001"
   CHANGE_AUTHOR_KIND=agent CHANGE_AUTHOR_ID=my-coding-agent npm run evidence
   ```
2. Read the file it names in `evidence/out/`:
   ```sh
   head -n 24 evidence/out/$(git rev-parse --short=12 HEAD).json
   ```
   For this one commit you can now show: the spec it implemented, the exact
   architecture it was checked against (`architectureSha256`), each gate result with its catalog control ids, the
   review mode required and the inputs that decided it, and a hash over the lot.
   Beside it, `evidence/out/<commit>/` holds one CALM evidence document per control configuration in the model, in
   CALM's own `evidence.json` shape: a `unique-id`, `evidence-paths` into the bundle for every gate that evidenced
   that control id, and `control-config-url`, the architecture's `$id` plus a JSON Pointer to the exact config. The
   `$id` is the upstream published URL until your fork changes it, like the pattern's.
   ```sh
   ls evidence/out/$(git rev-parse --short=12 HEAD)/
   cat evidence/out/$(git rev-parse --short=12 HEAD)/*.sdlc-prev-012-deployment-gating.json
   ```
3. In CI (`.github/workflows/governed-sdlc.yml`) the same bundle is uploaded with the SBOM and the secret scan
   report. Enable Actions on your fork and open a pull request there to see it. In a bank it goes to WORM storage
   under your retention policy (SDLC-PREV-014). That part is yours to wire.

## Now make it yours

1. **Model your own estate.** Replace the architecture with one of your systems. Start with nodes, `connects`
   relationships and `source-path`.
2. **Wire it into your agent workflow.** Keep `AGENTS.md`, swap the MCP server's model path.
3. **Contribute.** Three candidate controls fell out of building this: see `docs/CANDIDATE-CONTROLS.md`. Bring them, or
   better ones, to the SDLC Common Controls Catalog. Bring modelling gaps to CALM.
