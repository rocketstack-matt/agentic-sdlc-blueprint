# The talk deck

`index.html` is the deck for "Governing the Agentic SDLC" (OSFF New York, 4 November 2026). Open it from disk to
present: reveal.js is vendored, nothing needs a network. Keys: arrows to move, `s` for the speaker view with notes
and a timer, `esc` for the overview, `?` for the rest.

The deck is the workshop, cut to one demonstration per idea. After the opening, every slide is a step of labs 1 to 5
with the screen a participant sees: a picture of the CALM Learning Lab for the steps that run in the browser, or a
terminal session replayed from the repository for the rest. Each screen has a callout beside it saying what it shows
and what to take away. The steps the talk skips (the lesson's last two breakages, the spec gate, the browser version
of the model change, the CALM evidence documents) stay in the labs and the lessons.

- `bash slides/capture.sh` regenerates every terminal session in `captures.js` by replaying the labs in a throwaway
  worktree seeded from your working tree. A session is the commands exactly as the labs print them, each with its
  output as it came out (colour codes stripped, nothing else). If a command's output is too long for a slide, narrow
  it in the command itself (`head`, `tail`, `awk`, `grep`), print that command in the lab, and let `labs/verify.sh`
  run it; never filter in the script. Run it after any change to the labs, patches, gates or model, then commit
  `captures.js`.
- `node slides/lab-screenshots.mjs [lab url]` retakes the Learning Lab pictures in `img/lab/`, one per lesson step:
  the whole lab and its diagram, the editor at the node and the control the talk explains, the whole lab with the
  terminal enlarged after the failing validate, the editor after each edit and the terminal after each command. It needs a lab serving the two lessons: the hosted lab once they have landed, or the dev
  server from a checkout of finos/architecture-as-code (`npm run calm-lab:run`, then pass `http://localhost:5173`).
- `node slides/hub-catalog-screenshot.mjs` retakes the picture of the catalog's control domain on the "three
  faults, three layers, three owners" slide. It needs a hub seeded with the `finos-sdlc-common-controls` domain, which the
  read-only image built from finos/architecture-as-code has.
- `node slides/check.mjs` is the deck's test: slide count, notes on every slide, a station ring on every section
  card, every capture and picture present, every step slide carrying its screen and both callout parts, no em-dashes.
- `node slides/overflow-check.mjs` fails when any slide's content runs past the slide or a pane clips its own text.
  Panes are not trimmed, so this is the only budget. Run it with `check.mjs` after every edit; both must pass before
  a commit.
- `node slides/qa-screenshots.mjs` renders every slide to `slides/qa/` for a visual pass.
- `HUB_LINKS` at the bottom of `index.html` holds the repository, site, the two Learning Lab lessons, catalog and
  CALM Hub links; the hub and lab ones resolve once the pull requests to finos/architecture-as-code have landed. The
  three project logos in `img/logos/` are rendered as one monochrome family by CSS filters; `deck.css` documents the
  slide templates, including the workshop step.

The deck is published at `/agentic-sdlc-blueprint/slides/` by `.github/workflows/docs.yml`.
