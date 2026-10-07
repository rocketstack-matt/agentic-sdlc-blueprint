# The talk deck

`index.html` is the deck for "Governing the Agentic SDLC" (OSFF New York, 4 November 2026). Open it from disk to
present: reveal.js is vendored, nothing needs a network. Keys: arrows to move, `s` for the speaker view with notes
and a timer, `esc` for the overview, `?` for the rest.

Two halves, one control. The first half is the FINOS SDLC Common Controls Catalog: why it was written, what it is, and
code review followed from founding control to open argument, told from the catalog's own record. The second half is
the gate: the code review control enforced where it counts when an agent writes the code and an agent reviews the pull
request, with a policy that reads the model, a merge gateway that denies by default, a human approval token bound to
the exact change, and a decision log as the evidence. Every screen is real: pictures of the catalog's public record,
and terminal sessions recorded from the gateway demo.

- `node slides/catalog-screenshots.mjs` retakes the pictures of the catalog's record in `img/catalog/` from GitHub
  and the catalog site. It needs a network and Playwright from the architecture-as-code checkout next to this repo.
- `slides/captures.js` holds the terminal sessions the second half shows: each is the commands exactly as the demo
  runs them, with their output as it came out. They are recorded by `bash gateway/run-demo.sh` into
  `gateway/sessions.json`, and `node slides/demo-captures.mjs gateway/sessions.json` writes them into `captures.js`. Run both after
  any change to the demo, the policy or the model, then commit `captures.js`.
- `node slides/check.mjs` is the deck's test: slide count, notes on every slide, every capture and picture present,
  every step slide carrying its screen and both callout parts, no em-dashes.
- `node slides/overflow-check.mjs` fails when any slide's content runs past the slide or a pane clips its own text.
  Panes are not trimmed, so this is the only budget. Run it with `check.mjs` after every edit; both must pass before
  a commit.
- `node slides/qa-screenshots.mjs` renders every slide to `slides/qa/` for a visual pass.
- `HUB_LINKS` at the bottom of `index.html` holds the repository, site, catalog and CALM Hub links. The project logos
  in `img/logos/` are rendered as one monochrome family by CSS filters; `deck.css` documents the slide templates.

The deck is published at `/agentic-sdlc-blueprint/slides/` by `.github/workflows/docs.yml`.
