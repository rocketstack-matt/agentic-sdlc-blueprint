# Talk deck design: Governing the Agentic SDLC

Date: 21 September 2026. Status: approved design, awaiting implementation plan.

## Goal

A browser-hosted slide deck for the OSFF New York session on 4 November 2026 (35 minutes, Hub 3, Aaron Searle and
Matthew Bain) that lives in this repository, is published by the existing docs workflow, and goes live next to the
repo the moment the talk ends. The labs are the source of truth: every claim on a slide is something the labs do,
and every terminal pane shows output the repository produces today.

## Decisions already taken

| Decision | Choice |
| --- | --- |
| Format | HTML deck, reveal.js vendored into the repo, no build step, works offline from disk |
| Demo mode | Pre-rendered terminal panes in the deck; three optional live moments the presenter can cut to |
| Speaker split | Aaron opens (problem, catalog) and closes (contribution); Matthew runs the loop |
| Diagrams of the model | Screenshots from a local CALM Hub, not hand-drawn |
| Artefact links | The deck links to the architecture, pattern and control requirements on the FINOS-hosted CALM Hub once published there |
| Location | `slides/` in the repo, published at `/agentic-sdlc-blueprint/slides/` |

## Narrative and slide list

Twenty eight slides. Speaker shown in the notes only.

### Aaron opens (1 to 6, about 7 minutes)

1. **Title.** Template title layout: blue network background, white logo, title, both names, OSFF New York, 4 November 2026.
2. **The risk event.** "Confident, syntactically correct, architecturally catastrophic." In a regulated institution that is not a bug, it is a risk event.
3. **Every bank is solving it alone.** Home-grown guardrails, duplicated and drifting apart. The same failure the SDLC Common Controls Catalog was created to fix for the human-driven SDLC.
4. **The catalog.** A shared language for controls. The seven ids and three risks this talk uses (SDLC-PREV-001, 004, 012, 013, 014, 016, 017; SDLC-OP-007, SDLC-SEC-008, SDLC-RC-005), each with its catalog title, and the draft status caveat.
5. **The missing piece.** Controls must be machine-enforceable when the developer is an agent. CALM is the key. One diagram: CALM, the catalog and the AI Governance Framework composing rather than competing, with what each governs (the system, the change, the agent).
6. **The loop.** Five stations: model, spec, agent, gate, evidence, as a ring. The repo URL. Handover.

### Matthew runs the loop (7 to 23, about 20 minutes)

7. **Section: Model.** "The architecture is the context."
8. **The model.** CALM Hub screenshot of the trade capture architecture (six nodes, five relationships) beside the three things that make it enforceable: `source-path`, `env-binding`, and criticality tier plus data classification, which are the SDLC-PREV-013 inventory attributes.
9. **Controls as data.** The `position-store` control block and the governed-service pattern side by side, then a terminal pane: delete `source-path`, validation fails. Takeaway: a control in a catalog is prose; a control on a CALM node is data with a schema and an enforcement point.
10. **Section: Spec.** "Say what you want in terms of the model."
11. **SPEC-001.** Front matter (calm-nodes, calm-relationships) beside the context an agent receives (`mayConnectTo`, `mustNotConnectTo`). Takeaway: context engineering becomes a lookup.
12. **Section: Agent.** "Two attempts at the same spec."
13. **Attempt A, the reasonable shortcut.** The diff excerpt that reads the position store, and the green test run.
14. **Attempt A at the gate.** Terminal pane: BLOCKED, drift plus control breach. Live moment one.
15. **Attempt B, and two real agents.** Terminal pane: ADMISSIBLE. Then the recorded live runs: neither drifted; the unassisted agent found and read the gates on its own; the context changed the path, not the destination. Honest, with the caveat that it is one sample each.
16. **Section: Gate.** "Who reviews the robot?"
17. **The policy lives in the model.** The SDLC-PREV-001 rules from the architecture, and two terminal panes: COGNITIVE for a tier 2 change, HUMAN after touching the tier 1 service.
18. **Attempt C, the agent edits the model.** Terminal pane: drift gone, control breach remains, model-diff blocks the undeclared change, review HUMAN. Live moment two.
19. **The right path.** SPEC-002 declares its model change. Human applies the model first (declared, model ahead of code), then the agent implements. `calm diff` inside the gate.
20. **Section: Evidence.** "Answer the examiner in one file."
21. **The bundle.** JSON excerpt: spec, architecture hash, each gate with its control ids, review mode and inputs, sha256. Live moment three.
22. **In CI.** The workflow steps mapped to control ids (secret detection, dependency scan, SBOM, gates, evidence) and the published site serving the schemas at their ids.
23. **Honest limitations.** The README's list, verbatim.

### Aaron closes (24 to 28, about 5 minutes)

24. **Section: build it once, together, in the open.**
25. **Candidate controls.** Architecture conformance, agent task scoping, agent attribution and context provenance. Drafts to start a conversation, with their reference implementations named.
26. **Where to contribute.** Catalog (controls), CALM (modelling gaps, the pattern), AIGF (agent mitigations). Links to each.
27. **Make it yours.** Fork, then three steps: model your estate, wire it into your agent, contribute. Repo URL, site URL, hub links.
28. **Thank you.** Names, URLs.

## Visual design

Taken from the template master, not invented:

- 16:9. Arial throughout. Title slides at 52 pt, section titles 36 pt, content titles 28 pt, body 18 pt, terminal 16 pt monospace.
- Title and section slides: the template's blue network background image, white text, white logo. Content slides: white background, the logo at 0.67 inch top left as the template places it, dark text.
- Palette from the theme: text `212121`, secondary `595959`, blue `4285F4` for links and the current station, amber `FFAB40` as the single accent for BLOCKED and for the live-moment marker, teal `0097A7` for PASS and ADMISSIBLE.
- The five-station ring appears small in the corner of every content slide with the current station highlighted, so the audience always knows where in the loop they are. This is the one repeated motif.
- Terminal panes: dark `212121` background, monospace, real output, with PASS, FAIL, ADMISSIBLE and BLOCKED coloured by a small script at load time. Nothing else is decorated.
- No accent bars, no underlines, no clip art.

## Files

```
slides/
  index.html          the deck: one <section> per slide, notes in <aside class="notes">
  deck.css            the template-derived styling
  captures.js         terminal output, generated, do not edit
  capture.sh          regenerates captures.js by replaying the lab commands in a throwaway worktree
  img/                background.png and logo.svg from the template; hub-*.png screenshots
  vendor/reveal/      reveal.js dist (MIT), unmodified
  README.md           how to present, regenerate captures, retake screenshots
```

`capture.sh` reuses the worktree approach of `labs/verify.sh`: it applies the same patches in the same order and
records the stdout of each printed command under a key (`clean-gates`, `lab1-break-pattern`, `attempt-a-tests`,
`attempt-a-gates`, `attempt-b-gates`, `review-cognitive`, `review-human`, `attempt-c-gates`, `spec-002-model`,
`spec-002-impl`, `evidence`). The deck reads `captures.js` at load; a pane whose key is missing shows a visible
"capture missing" marker rather than nothing.

## CALM Hub screenshots

Local hub: the FINOS `calm-hub/deploy/docker-compose.yml` default profile (`finos/calm-hub:latest` with a MongoDB
sidecar, `no-auth` Quarkus profile). Steps, scripted in `slides/hub-screenshots.sh` so they can be repeated:

1. Start the hub, create a namespace, push a copy of the architecture and the pattern with `calm hub push`. The CLI
   requires a full document `$id`; the copy gets one, the repository model is not changed by this.
2. Open the architecture in the hub's visualiser with a browser at 2x device pixel ratio and save the screenshots the
   deck uses: the whole model, and the model with `position-store` selected showing its control.
3. Stop the hub.

If the local hub's rendering is not usable for the deck (unreadable at slide size, or the visualiser needs manual
layout), fall back to an inline SVG drawn from the model file and say so in `slides/README.md`.

## FINOS-hosted CALM Hub

The hosted hub's API rejects writes (405 on POST to the public API), so publication there is a FINOS-side step,
owned by Matthew. The deck holds the hub links in one place at the top of `index.html` (`HUB_LINKS`), pointing at the
repository's published site until the hub versions exist. Once the architecture, pattern and control requirements
are on the hosted hub, those five values change and nothing else does.

## Publishing

The docs workflow copies `slides/` into the generated site's `static/` directory before the build, so the deck is
served at `/agentic-sdlc-blueprint/slides/`. The workflow's `paths` trigger gains `slides/**`. The README gains a
link to the deck in the talk paragraph. On stage the presenter opens `slides/index.html` from disk; reveal.js runs
from the vendored copy and needs no network.

## Testing

- **Visual.** Screenshot every slide at 1920 by 1080 with a browser and read them: overflow, contrast, alignment,
  the ring's highlighted station matching the section.
- **Captures.** `capture.sh` runs clean; every key the deck references exists in `captures.js`; the panes show
  the same words the labs assert (BLOCKED, ADMISSIBLE, DRIFT, CONTROL BREACH, UNDECLARED MODEL CHANGE, COGNITIVE, HUMAN).
- **Notes.** The speaker view opens and every slide has notes.
- **Published.** After the first deploy, the deck URL returns 200 and the vendored assets load from the site.
- **Offline.** The deck opens from `file://` with no network and all slides render.

## Out of scope

- A Google Slides or PowerPoint version. The template is the visual reference only.
- Recording or video.
- Changes to the labs. If a slide needs something the labs do not say, the lab changes first, in its own commit.
