#!/usr/bin/env bash
# Builds controls.wasm from ergo.rego and controls.rego, and records the sha256 of those sources and of the module so
# a test can tell when the committed module is stale. The build is byte-reproducible: CI reruns it and fails on any
# diff. The gates never shell out to opa; only the maintainer and CI run this.
set -euo pipefail
OPA="${OPA:-opa}"
# A path containing a slash is resolved before the cd below, so a relative OPA still works; a bare name stays on PATH.
case "$OPA" in
	*/*) OPA="$(cd "$(dirname "$OPA")" && pwd)/$(basename "$OPA")" ;;
esac
cd "$(dirname "$0")"
sha() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi | cut -d' ' -f1; }
"$OPA" check --strict ergo.rego controls.rego
"$OPA" build -t wasm -e controls/result -o bundle.tar.gz ergo.rego controls.rego
tar -xzOf bundle.tar.gz /policy.wasm > controls.wasm
rm bundle.tar.gz
cat ergo.rego controls.rego | sha > controls.sources.sha256
sha controls.wasm > controls.wasm.sha256
echo "built controls.wasm with $("$OPA" version | head -1) ($(cut -c1-12 controls.wasm.sha256))"
