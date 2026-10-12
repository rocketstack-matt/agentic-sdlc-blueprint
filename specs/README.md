# Specs: the requirements repository (SDLC-PREV-004)

Each spec is a version-controlled Markdown file whose front matter pins it to the CALM model:

| key | meaning |
| --- | --- |
| `id`, `status` | only `approved` specs may be implemented |
| `calm-nodes` | the only nodes a change under this spec may touch |
| `calm-relationships` | the connections the change is expected to use |
| `model-change` | the nodes or relationships this spec adds or alters in the model, if any. Informational: a model change is a change to a file no node owns, which needs a human approver at merge. |

The requirements control in the model (SDLC-PREV-004, evaluated by `npm run gates`) blocks a change other than documentation that names no approved spec, or that touches a node its spec does not declare.
