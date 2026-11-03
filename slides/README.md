# The talk deck

`index.html` is the deck for *Governing the Agentic SDLC* (OSFF New York, 4 November 2026). reveal.js is vendored, so
open the file from disk or any static server. Keys: arrows to move, `s` for the speaker view with notes and a timer,
`esc` for the overview.

The story runs in two chapters, shown in a strip across the top of the slides that carry one: the problem (Aaron: the
SDLC Common Controls Catalog and the bot's pull request) and the idea (Matthew: the architecture, CALM controls, ergo
and its report). "How a CALM control feeds ergo" shows the control's config going straight into the engine. "Let's see it live." then hands over to the browser, where `npm run demo:github` plays the demo on GitHub and CALM
Hub (see [`gateway/`](../gateway/README.md#the-github-demo)) and says what each key press will do next. The deck
ends on the links, with QR codes, for questions.

[`governing-the-agentic-sdlc.pptx`](governing-the-agentic-sdlc.pptx) is a PowerPoint copy for organisers and offline
use: one 4K picture of each slide, with the speaker notes and clickable links. It is a snapshot, so export it again
after changing the deck.

- `node slides/check.mjs` is the deck's test: slide count, a notes element on every slide, every picture present, no em-dashes.
- `node slides/overflow-check.mjs` fails when anything runs off a slide.
- `node slides/qa-screenshots.mjs` renders every slide to `slides/qa/`.

The last two use Playwright from the architecture-as-code checkout next to this repository. The deck is published at
`/agentic-sdlc-blueprint/slides/` by `.github/workflows/docs.yml`.
