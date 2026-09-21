#!/usr/bin/env bash
# Pushes copies of the model and the pattern to a local CALM Hub and screenshots the model.
# Needs a hub on http://localhost:8080 (see slides/README.md) and the architecture-as-code checkout next to this repo
# for Playwright. Usage: bash slides/hub-screenshots.sh
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
HUB=${CALM_HUB_URL:-http://localhost:8080}
NS=finos.agentic-sdlc
cd "$ROOT"
curl -sf "$HUB/q/swagger-ui" >/dev/null || { echo "no CALM Hub at $HUB"; exit 2; }

TMP=$(mktemp -d)
# The CLI needs a full document id, and its metadata parser reads "title" (not CALM's "name") for the
# display name. Copies get both; the repository's files do not change.
node -e '
const fs=require("fs");const [tmp,hub,ns]=process.argv.slice(1);
const withId=(file,id)=>{const d=JSON.parse(fs.readFileSync(file));d["$id"]=id;if(!d.title&&d.name)d.title=d.name;const out=`${tmp}/${file.split("/").pop()}`;fs.writeFileSync(out,JSON.stringify(d,null,2));return out;};
console.log(withId("architecture/trade-capture.architecture.json",`${hub}/calm/namespaces/${ns}/architectures/trade-capture/versions/1.0.0`));
console.log(withId("architecture/governed-service.pattern.json",`${hub}/calm/namespaces/${ns}/patterns/governed-service/versions/1.0.0`));
' "$TMP" "$HUB" "$NS"

npx --no-install calm hub create namespace --name "$NS" --description "Agentic SDLC blueprint: governed trade capture" -c "$HUB" -f pretty || true
npx --no-install calm hub push pattern "$TMP/governed-service.pattern.json" -c "$HUB" -f pretty
npx --no-install calm hub push architecture "$TMP/trade-capture.architecture.json" -c "$HUB" -f pretty
npx --no-install calm hub list architectures --namespace "$NS" -c "$HUB" -f pretty

# hub-screenshot.mjs resolves Playwright by a path relative to itself (NODE_PATH is not honoured by
# Node's ESM resolver), so no NODE_PATH is needed here.
node slides/hub-screenshot.mjs "$HUB" "$NS"
