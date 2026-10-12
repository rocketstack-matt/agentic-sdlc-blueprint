# The talk deck

`index.html` is the deck for "Governing the Agentic SDLC" (OSFF New York, 4 November 2026). Open it from disk to
present: reveal.js is vendored, nothing needs a network. Keys: arrows to move, `s` for the speaker view with notes
and a timer, `esc` for the overview, `?` for the rest.

One story, two voices. Aaron opens with the problem: agents write and review code faster than anyone can look, and
which changes are risky is decided by a person, from memory. Matthew answers that what is risky is a fact about the
architecture: one rule on the Client Ledger in the CALM model, a merge gateway that asks it about every change, and
every decision pinned back onto the architecture in CALM Hub as decorators. The climax is an architect's change to
the model: the same kind of change that merged with no human now needs one, and nobody touched the pipeline. Every
screen is real: CALM Hub photographed during a run of the gateway demo, and terminal sessions recorded from it.

- `node slides/hub-screenshots.mjs` retakes the CALM Hub pictures in `img/hub/`. It runs the gateway demo step by step
  against a running CALM Hub and its UI from the architecture-as-code checkout next to this repo (`CALM_HUB_URL`,
  default `http://localhost:8080`; `HUB_UI`, default `http://localhost:5173`), saves a default layout so no
  connection crosses a box, and photographs the Hub at each moment the talk shows. It resets the demo and the Hub
  architecture the demo owns, and leaves `gateway/sessions.json` alone.
- `slides/captures.js` holds the terminal sessions: each is the commands exactly as the demo runs them, with their
  output as it came out. They are recorded by `bash gateway/run-demo.sh` into `gateway/sessions.json`, and
  `node slides/demo-captures.mjs gateway/sessions.json` writes them into `captures.js`. Run both after any change to
  the demo, the policy or the model, then commit `captures.js`.
- `node slides/check.mjs` is the deck's test: slide count, notes on every slide, every capture and picture present,
  every step slide carrying its screen and both callout parts, no em-dashes.
- `node slides/overflow-check.mjs` fails when any slide's content runs past the slide or a pane clips its own text.
  Panes are not trimmed, so this is the only budget. Run it with `check.mjs` after every edit; both must pass before
  a commit.
- `node slides/qa-screenshots.mjs` renders every slide to `slides/qa/` for a visual pass.
- `HUB_LINKS` at the bottom of `index.html` holds the repository, catalog and CALM Hub links. The project logos in
  `img/logos/` are rendered as one monochrome family by CSS filters; `deck.css` documents the slide templates.

The deck is published at `/agentic-sdlc-blueprint/slides/` by `.github/workflows/docs.yml`.
