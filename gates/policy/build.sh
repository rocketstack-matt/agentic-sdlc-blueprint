#!/usr/bin/env bash
# Builds controls.wasm from ergo.rego and controls.rego, and records the sha256 of those sources so a test can
# tell when the committed module is stale. The gates never shell out to opa; only the maintainer runs this.
set -euo pipefail
OPA="${OPA:-opa}"
# A path containing a slash is resolved before the cd below, so a relative OPA still works; a bare name stays on PATH.
case "$OPA" in
	*/*) OPA="$(cd "$(dirname "$OPA")" && pwd)/$(basename "$OPA")" ;;
esac
cd "$(dirname "$0")"
"$OPA" check --strict ergo.rego controls.rego
"$OPA" build -t wasm -e controls/result -o bundle.tar.gz ergo.rego controls.rego
tar -xzOf bundle.tar.gz /policy.wasm > controls.wasm
rm bundle.tar.gz
cat ergo.rego controls.rego | shasum -a 256 | cut -d' ' -f1 > controls.sources.sha256
echo "built controls.wasm with $("$OPA" version | head -1) ($(shasum -a 256 controls.wasm | cut -c1-12))"
