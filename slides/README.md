# The talk deck

`index.html` is the deck for "Governing the Agentic SDLC" (OSFF New York, 4 November 2026). Open it from disk to
present: reveal.js is vendored. Keys: arrows to move, `s` for the speaker view with notes and a timer, `esc` for the
overview.

- **Live** (`index.html`): the demo slides carry a red "live" badge that links to the demo repository's pull
  requests; the presenters switch to the browser for each moment and come back to the slide, which shows the same
  moment as a screenshot.
- **Slides only** (`backup.html`, or `index.html?backup`): the same deck without the badges. Every moment is a
  screenshot, so the talk works with no network.

One story in four chapters, shown in the strip across the top of every slide: the problem (Aaron), the idea
(Matthew), live on GitHub (Matthew, with Aaron approving), and why it matters (Aaron). Two pictures carry it: the map
of the trade capture system, drawn by the script in `index.html` from each slide's data attributes so it looks the
same on every slide, and the pull requests on GitHub, where the **Architecture controls** check explains each
decision. The demo itself is in [`gateway/`](../gateway/README.md#the-github-demo).

- `DEMO_APPROVER=matt-fisks node slides/github-screenshots.mjs` plays the GitHub demo from the start and photographs
  each moment into `img/github/`. It runs the gateway while it plays, and the demo approver (an account in the
  approvers list, logged in to the gh CLI) approves wherever a person must; live, Aaron does. Set `CALM_HUB_URL` to
  publish to CALM Hub as it goes.
- `node slides/hub-screenshots.mjs` retakes the CALM Hub picture in `img/hub/` from the local demo, with the
  positions the deck uses to pin labels over it.
- `node slides/check.mjs` is the deck's test: slide count, notes on every slide, every picture present, every Hub
  pin with a position, no em-dashes. `node slides/overflow-check.mjs` fails when anything runs off a slide, and
  `node slides/qa-screenshots.mjs` renders every slide to `slides/qa/`.

The deck is published at `/agentic-sdlc-blueprint/slides/` by `.github/workflows/docs.yml`.
