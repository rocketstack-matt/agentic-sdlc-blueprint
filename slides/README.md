# The talk deck

`index.html` is the deck for "Governing the Agentic SDLC" (OSFF New York, 4 November 2026). Open it from disk to
present: reveal.js is vendored, nothing needs a network. Keys: arrows to move, `s` for the speaker view with notes
and a timer, `esc` for the overview, `?` for the rest.

- `bash slides/capture.sh` regenerates every terminal pane from the labs. Run it after any change to the labs, patches,
  gates or model, then commit `captures.js`. It replays the last commit, so commit your lab changes first.
- `bash slides/hub-screenshots.sh` retakes the CALM Hub screenshot on slide 8. It needs a local hub: from the
  `architecture-as-code` checkout, `cd calm-hub && ../mvnw quarkus:dev -Pstandalone`. The hub UI's document route is
  a hash route, for example `http://localhost:8080/#/finos.agentic-sdlc/architectures/trade-capture/1.0.0`. Every
  re-run of the script pushes a new patch version to the local hub (the hub auto-bumps), which is harmless locally.
- `node slides/hub-catalog-screenshot.mjs` retakes the picture of the catalog's control domain on the "how the catalog
  becomes enforceable" slide. It needs a hub seeded with the `finos-sdlc-common-controls` domain, which the read-only
  image built from finos/architecture-as-code has.
- `node slides/lab-screenshots.mjs [lab url]` retakes the two Learning Lab pictures: the whole lab at the start of the
  `agentic-sdlc-model` lesson with the diagram open, and its terminal after the lesson's first deliberate failure. It
  needs a lab serving the lesson: the hosted lab once the lesson has landed, or the dev server from a checkout of
  finos/architecture-as-code (`npm run calm-lab:run`, then pass `http://localhost:5173`).
- `node slides/overflow-check.mjs` fails when any slide's content runs past the slide or a pane clips its own text.
  Run it with `check.mjs` after every edit; both must pass before a commit.
- `node slides/qa-screenshots.mjs` renders every slide to `slides/qa/` for a visual pass.
- `node slides/check.mjs` is the deck's test: slide count, notes on every slide, capture keys and images present, pane
  budgets after the fill script's trimming, no em-dashes.
- `HUB_LINKS` at the bottom of `index.html` holds the repository, site, Learning Lab, catalog and CALM Hub links; the hub
  and lab ones resolve once the pull requests to finos/architecture-as-code have landed. The three project logos in
  `img/logos/` are rendered as one monochrome family by CSS filters; `deck.css` documents the slide templates.

The deck is published at `/agentic-sdlc-blueprint/slides/` by `.github/workflows/docs.yml`.
