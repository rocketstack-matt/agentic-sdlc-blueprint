# Copies of the catalog's control requirements from CALM Hub

These five documents are the FINOS SDLC Common Controls Catalog entries this blueprint enforces, in the form CALM Hub
holds them: one control requirement per catalog mitigation, generated from the catalog's source by
`scripts/generate-sdlc-common-controls-domain.mjs` in finos/architecture-as-code. They are here so that
`npm run calm:validate` works offline: `architecture/url-mapping.json` maps each document's hub URL to its copy.

The hub is the source of truth. To refresh, copy the `requirement["1-0-0"]` object from the matching file under
`calm-hub/mongo/controls/finos-sdlc-common-controls/` in finos/architecture-as-code.
