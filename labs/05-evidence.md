# Lab 5. Evidence: answer the examiner in one file

**Station 5 of 5. About 5 minutes.**

Risk SDLC-RC-005 is blunt: if you cannot produce the record, the control did not operate.

1. Commit attempt B with its spec trailer, as an agent would be required to:
   ```sh
   git add -A && git commit -m "Add account summary endpoint" -m "Spec: SPEC-001"
   CHANGE_AUTHOR_KIND=agent CHANGE_AUTHOR_ID=my-coding-agent npm run evidence
   ```
2. Open the file it names in `evidence/out/`. For this one commit you can now show: the spec it implemented, the exact
   architecture it was checked against (`architectureSha256`), each gate result with its catalog control ids, the
   review mode required and the inputs that decided it, and a hash over the lot.
3. In CI (`.github/workflows/governed-sdlc.yml`) the same bundle is uploaded with the SBOM. In a bank it goes to
   WORM storage under your retention policy (SDLC-PREV-014). That part is yours to wire.

## Now make it yours

1. **Model your own estate.** Replace the architecture with one of your systems. Start with nodes, `connects`
   relationships and `source-path`.
2. **Wire it into your agent workflow.** Keep `AGENTS.md`, swap the MCP server's model path.
3. **Contribute.** Three candidate controls fell out of building this: see `docs/CANDIDATE-CONTROLS.md`. Bring them, or
   better ones, to the SDLC Common Controls Catalog. Bring modelling gaps to CALM.
