#!/usr/bin/env bash
# Builds controls.wasm from ergo.rego and controls.rego, and records the sha256 of those sources so a test can
# tell when the committed module is stale. The gates never shell out to opa; only the maintainer runs this.
set -euo pipefail
cd "$(dirname "$0")"
OPA="${OPA:-opa}"
"$OPA" check --strict ergo.rego controls.rego
"$OPA" build -t wasm -e controls/result -o bundle.tar.gz ergo.rego controls.rego
tar -xzOf bundle.tar.gz /policy.wasm > controls.wasm
rm bundle.tar.gz
cat ergo.rego controls.rego | shasum -a 256 | cut -d' ' -f1 > controls.sources.sha256
echo "built controls.wasm with $("$OPA" version | head -1) ($(shasum -a 256 controls.wasm | cut -c1-12))"
