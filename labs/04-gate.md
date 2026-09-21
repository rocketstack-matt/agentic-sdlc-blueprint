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
   Three things happen. The drift error disappears, because the code now matches the model. The node-level control
   still blocks it. And `model-diff` blocks it too: the CALM CLI's own `calm diff` shows a relationship was added, and
   SPEC-001 does not declare any model change. The review mode also jumps to `HUMAN` because `architecture/` is control
   plane. A model change is made by a human first, under a spec that declares it, and only then does the agent
   implement. Reset before the next step.
5. **The right path.** SPEC-002 asks position-service for a reconciliation endpoint that needs an account's trades,
   which only trade-api owns. The model has no such relationship, so the spec declares one in `model-change`. A human
   makes that change first: the spec and the model arrive together, and nothing else.
   ```sh
   git checkout -- . && git clean -fd services test specs
   git apply labs/patches/spec-002-model-change.patch
   SPEC=SPEC-002 npm run gates
   ```
   `ADMISSIBLE`, with two things worth reading: `drift-check` warns that the model is now ahead of the code, and
   `model-diff` lists the change as declared by SPEC-002. Review is `HUMAN`, because the model is control plane.
   Once that is approved, the agent implements inside the new scope:
   ```sh
   git apply labs/patches/attempt-d-spec-002.patch
   SPEC=SPEC-002 npm run gates
   ```
   `ADMISSIBLE`, four connections in code and four in the model. Review is still `HUMAN`: position-service is tier 1.
   Compare with attempt C, where the agent made the same kind of model edit itself and was blocked. Reset and re-apply
   attempt B before Lab 5:
   ```sh
   git checkout -- . && git clean -fd services test specs
   git apply labs/patches/attempt-b-conformant.patch
   ```

**Takeaway.** Without a gate every other control is advisory (SDLC-PREV-012). With the model as policy input, the
expensive reviewers are spent only where the architecture says the risk is.

Next: [Lab 5](05-evidence.md)
