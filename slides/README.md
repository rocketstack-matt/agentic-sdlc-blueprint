# The talk deck

`index.html` is the deck for "Governing the Agentic SDLC" (OSFF New York, 4 November 2026). Open it from disk to
present: reveal.js is vendored. Keys: arrows to move, `s` for the speaker view with notes and a timer, `esc` for the
overview.

- **Live** (`index.html`): one slide, "Let's see it live.", hands over to the browser, where the demo runs on the
  repository's pull requests and CALM Hub (`npm run demo`); its speaker notes are the run sheet for the six moments.
- **Slides only** (`backup.html`, or `index.html?backup`): the same deck. It has no screenshots of the demo, so
  without a network the demo is told from the notes.

The story runs in two chapters, shown in a strip across the top of the slides that carry one: the problem (Aaron's
catalog slides and the bot's pull request) and the idea (Matthew: the architecture, CALM controls, ergo and its
report). Then the live demo, in the browser, and the close. The demo itself is in
[`gateway/`](../gateway/README.md#the-github-demo). Presentation mode and the overlay are on the local branch
`feat/hub-ui-presentation-mode` of the architecture-as-code checkout next to this repo; the Hub UI must run from it.

- `CALM_HUB_URL=http://localhost:8080 DEMO_APPROVER=matt-fisks node slides/github-screenshots.mjs` plays the GitHub
  demo from the start and photographs each moment: the pull request into `img/github/` and CALM Hub into `img/hub/`. It runs the gateway while it plays, and the demo approver (an account in the
  approvers list, logged in to the gh CLI) approves wherever a person must; live, Aaron does.
- `node slides/check.mjs` is the deck's test: slide count, notes on every slide, every picture present, no em-dashes. `node slides/overflow-check.mjs` fails when anything runs off a slide, and
  `node slides/qa-screenshots.mjs` renders every slide to `slides/qa/`.

The deck is published at `/agentic-sdlc-blueprint/slides/` by `.github/workflows/docs.yml`.
