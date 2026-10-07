#!/usr/bin/env bash
# Compiles merge.rego to merge.wasm. The maintainer runs this once per policy change; the gateway
# never shells out to opa. OPA 1.21.1 (darwin arm64) was used; point OPA at your binary if needed.
set -euo pipefail
cd "$(dirname "$0")"
OPA="${OPA:-opa}"
"$OPA" check merge.rego
"$OPA" build -t wasm -e merge/allow -e merge/deny -o bundle.tar.gz merge.rego
tar -xzOf bundle.tar.gz /policy.wasm > merge.wasm 2>/dev/null
rm bundle.tar.gz
echo "built merge.wasm with $("$OPA" version | head -1 | tr -d '\n') ($(shasum -a 256 merge.wasm | cut -c1-12))"
