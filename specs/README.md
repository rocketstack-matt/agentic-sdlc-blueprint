# Specs: the requirements repository (SDLC-PREV-004)

Each spec is a version-controlled Markdown file whose front matter pins it to the CALM model:

| key | meaning |
| --- | --- |
| `id`, `status` | only `approved` specs may be implemented |
| `calm-nodes` | the only nodes a change under this spec may touch |
| `calm-relationships` | the connections the change is expected to use |
| `model-change` | the nodes or relationships this spec adds or alters in the model, if any. `gates/model-diff.mjs` blocks any other model change |

`npm run gate:spec` fails if a spec names a node that does not exist, if a code change names no spec,
or if the diff strays outside the nodes its spec declares.
