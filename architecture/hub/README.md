# Copies from CALM Hub

What this blueprint vendors from CALM Hub so that `npm run calm:validate` works offline;
`architecture/url-mapping.json` maps each document's hub URL to its copy here. The hub is the source of truth.

- `sdlc-control-requirement.standard.json`: the one Standard of the FINOS SDLC Common Controls Catalog, the JSON
  Schema every control requirement document of the catalog conforms to.
- `sdlc-prev-*.json`: the five catalog control requirement documents this blueprint enforces, in the form CALM Hub
  holds them in the `finos-sdlc-common-controls` control domain. Each declares the Standard as its `$schema`; each
  is also a JSON Schema that pins `control-id` and `name`, which is what the CLI validates a control's config
  against when the architecture cites the document as its `requirement-url`.

Both are generated from the catalog's source by `tools/generate-sdlc-common-controls-domain.mjs` here, run against a
checkout of finos/architecture-as-code; the hub repository holds the generated files, not the generator. To refresh, copy the Standard from `calm-hub/mongo/standards/finos.sdlc-common-controls/`
and the `requirement["1-0-0"]` object from the matching file under `calm-hub/mongo/controls/finos-sdlc-common-controls/`.
