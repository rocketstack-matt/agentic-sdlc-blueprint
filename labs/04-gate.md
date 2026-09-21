# Lab 4. Gate: who reviews the robot?

**Station 4 of 5. About 10 minutes.**

SDLC-PREV-001 Code Review asks for a deterministic, machine-evaluable policy that picks the review mode, and allows
approved cognitive review engines. It needs policy inputs. The architecture has them.

1. With attempt B applied:
   ```sh
   npm run gate:review
   ```
   `COGNITIVE`: the diff touches `trade-api`, tier 2, internal data. Add `--json` to see the recorded policy inputs.
2. Now touch the tier 1 service. Add a comment to `services/position-service/src/app.ts` and run it again: `HUMAN`.
   Same repo, same agent, different route, decided by the model. Undo that edit.
3. Find the policy. It is not in `gates/review-router.mjs`. It is the `config` of the `sdlc-prev-001-code-review`
   control inside the CALM architecture. Changing review policy is therefore an architecture change.
4. **The agent that edits the model.** Reset, then apply attempt C, where the agent "fixes" the failing gate by adding
   the missing relationship to the model:
   ```sh
   git checkout -- . && git clean -fd services test
   git apply labs/patches/attempt-c-edit-the-model.patch
   SPEC=SPEC-001 npm run gates
   ```
   Two things happen. The drift error disappears but the node-level control still blocks it, and the review mode
   jumps to `HUMAN` because `architecture/` is control plane. Reset and re-apply attempt B before Lab 5.

**Takeaway.** Without a gate every other control is advisory (SDLC-PREV-012). With the model as policy input, the
expensive reviewers are spent only where the architecture says the risk is.

Next: [Lab 5](05-evidence.md)
