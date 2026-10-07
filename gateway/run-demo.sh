#!/usr/bin/env bash
# Runs the whole demo with no human at the keyboard and records every command with its exact output
# in sessions.json: one session per idea, one step per command. Ends with a self-check.
set -u
cd "$(dirname "$0")"

rm -f decisions.ndjson ledger.json token.json sessions.json reviews/*.json
rm -rf .sessions && mkdir -p .sessions reviews

n=0
key=""
session() { key="$1"; }
step() {
  n=$((n + 1))
  printf '%s' "$key" > ".sessions/$n.key"
  printf '%s' "$1" > ".sessions/$n.cmd"
  bash -c "$1" < /dev/null > ".sessions/$n.out" 2>&1 || true
  printf '$ %s\n' "$1"
  cat ".sessions/$n.out"
  echo
}

AUTHOR=spiffe://bank/agents/author
REVIEWER=spiffe://bank/agents/reviewer
# The human reads the binding code off the approval screen; the script derives it the same way.
CODE=$(node -e "import('./gateway/lib.mjs').then((m) => console.log(m.bindingCode(m.loadChange('demo/change-tier1.json'))))")

session propose
step "node gateway/propose.mjs demo/change-tier2.json"

session self-review
step "node gateway/review.mjs demo/change-tier2.json --as $AUTHOR"
step "node gateway/merge.mjs demo/change-tier2.json --review reviews/tier2.author.json"

session reviewed
step "node gateway/review.mjs demo/change-tier2.json --as $REVIEWER"
step "node gateway/merge.mjs demo/change-tier2.json --review reviews/tier2.reviewer.json"

session tier1-no-token
step "node gateway/propose.mjs demo/change-tier1.json"
step "node gateway/review.mjs demo/change-tier1.json --as $REVIEWER"
step "node gateway/merge.mjs demo/change-tier1.json --review reviews/tier1.reviewer.json"

session approve
step "APPROVE_CODE=$CODE node gateway/approve.mjs demo/change-tier1.json --lines 12"

session amended
step "node gateway/review.mjs demo/change-tier1-amended.json --as $REVIEWER"
step "node gateway/merge.mjs demo/change-tier1-amended.json --review reviews/tier1-amended.reviewer.json --approval token.json"

session allowed
step "node gateway/merge.mjs demo/change-tier1.json --review reviews/tier1.reviewer.json --approval token.json"

session replay
step "node gateway/merge.mjs demo/change-tier1.json --review reviews/tier1.reviewer.json --approval token.json"

session evidence
step "node gateway/evidence.mjs --last 2"

# Assemble sessions.json and check every verdict the demo must show.
node demo/sessions.mjs
