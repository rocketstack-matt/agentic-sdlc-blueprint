# Lab 1. Model: the architecture is the context

**Lab 1 of 5. About 10 minutes. No API key needed.**

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
   That is the CALM CLI, and it is worth running once by hand:
   ```sh
   npx calm validate -p architecture/governed-service.pattern.json -a architecture/trade-capture.architecture.json -u architecture/url-mapping.json -f pretty
   ```
   `-p` is the pattern, `-a` the architecture. `-u` is a URL mapping: every canonical URL the model cites (the
   catalog's documents and their Standard, the node and interface Standards, the pattern, all addresses on CALM Hub)
   maps to a copy under `architecture/`, so validation is offline and reproducible. We keep the mapping even once the
   hub serves those URLs, because the CLI only fetches from hosts you allow with `calm init-config`, and a pipeline
   should not depend on a fetch. CALM's tutorials 17 to 20 (patterns, Standards, enforcing Standards, multi-pattern
   validation) are the background this lab compresses; they run in the browser in the
   [CALM Learning Lab](https://calm.finos.org/tutorials/intermediate/19-enforcing-standards).
5. Break a control on purpose. Delete the `repository` key from the `sdlc-prev-004-requirements-repository`
   config and validate again. Two schemas look at that config. The control's `requirement-url` names the catalog's
   own control requirement document on CALM Hub (a copy sits in `architecture/hub/`); the CLI validates the config
   against it, which pins `control-id` and `name` to the catalog. The pattern then says what this estate needs
   from the control, here `repository` and `audit-trail`, the values `gates/spec-check.mjs` reads. So a
   half-configured control is a build failure, not a finding in next year's audit. Open the copy in
   `architecture/hub/` too: every catalog document declares the catalog's one Standard as its `$schema`, so the
   CLI also checks the document itself before trusting it. Undo with `git checkout architecture/`.
6. Now break the shape of the model. Delete `source-path` from the `trade-api` node and validate again:
   ```sh
   npm run calm:validate
   ```
   The pattern in `architecture/governed-service.pattern.json` is how this estate enforces the catalog: it requires
   the four system-level controls, pins each to its catalog document, fixes the parameters the gates read, and applies
   the governed-node Standard to every node, so services carry a source path, a criticality tier and a data
   classification, and every interface names its environment binding. Standards say what a node, an interface or a
   control requirement looks like; the pattern says which of them an architecture here must satisfy. Standards do not
   enforce themselves; a pattern does. In the words of CALM's tutorials this is a standards-enforcing pattern, not a
   structural one: it uses `items`, so it applies to every node without saying which nodes must exist. Relationships
   are left unconstrained on purpose; what may connect to what is checked against the code by the drift gate in Lab 4.
   Without the pattern this edit validates cleanly, and the drift gate then no longer knows `trade-api` has code to
   check, so the shortcut in Lab 3 would sail through. Undo with `git checkout architecture/`.

**Takeaway.** A control in a catalog is prose. A control attached to a CALM node is data with a schema, an owner and an enforcement point.

Next: [Lab 2](02-spec.md)
