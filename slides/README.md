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
- `node slides/hub-catalog-screenshot.mjs` retakes the picture of the
  catalog's control domain on the "how the catalog becomes enforceable" slide. It needs a hub seeded with the
  `finos-sdlc-common-controls` domain, which the read-only image built from finos/architecture-as-code has.
- `node slides/check.mjs` is the deck's test: slide count, notes on every slide, capture keys present, images present,
  no em-dashes.
- `HUB_LINKS` at the top of `index.html` holds the repository, site and CALM Hub links. Point them at the
  FINOS-hosted CALM Hub once the seeding pull request to finos/architecture-as-code has landed.

The deck is published at `/agentic-sdlc-blueprint/slides/` by `.github/workflows/docs.yml`.
