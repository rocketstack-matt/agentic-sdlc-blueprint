# Lab 1. Model: the architecture is the context

**Station 1 of 5. About 10 minutes. No API key needed.**

1. Open `architecture/trade-capture.architecture.json`. It is a [FINOS CALM](https://calm.finos.org) 1.2 document:
   six nodes, five relationships.
2. Find three things that make this model useful to an agent and enforceable by a pipeline:
   - `metadata.source-path` on each service node ties a directory of code to a node.
   - `env-binding` on each interface names how code binds to it.
   - `metadata.criticality-tier` and `data-classification` are the system inventory attributes that
     SDLC-PREV-013 asks for. They become review policy inputs in Lab 4.
3. Find the controls. The top-level `controls` block attaches four catalog controls to the whole system. The
   `position-store` node carries its own: only `position-service` may connect to it.
4. Validate it:
   ```sh
   npm run calm:validate
   ```
5. Break a control on purpose. Delete the `repository` key from the `sdlc-prev-004-requirements-repository`
   config and validate again. The CALM CLI checks each control's config against the Standard its `requirement-url`
   names in `architecture/standards/`, which in turn extends the catalog's own control requirement on CALM Hub (a copy
   sits in `architecture/hub/`), so a half-configured control is a build failure, not a finding in next year's audit.
   Undo with `git checkout architecture/`.
6. Now break the shape of the model. Delete `source-path` from the `trade-api` node and validate again:
   ```sh
   npm run calm:validate
   ```
   The pattern in `architecture/governed-service.pattern.json` applies the governed-node Standard to every node:
   services carry a source path, a criticality tier and a data classification, every interface names its environment
   binding, and the system carries its four controls. Without it this edit validates cleanly, and the drift gate then
   no longer knows `trade-api` has code to check, so the shortcut in Lab 3 would sail through. Undo with
   `git checkout architecture/`.

**Takeaway.** A control in a catalog is prose. A control attached to a CALM node is data with a schema, an owner and an enforcement point.

Next: [Lab 2](02-spec.md)
