#!/usr/bin/env bash
# Runs the demo with no human at the keyboard and records every command with its exact output in
# .demo/sessions.json: one session per moment, one step per command. Ends with a self-check of every verdict.
# Set CALM_HUB_URL (for example http://localhost:8080) to publish the architecture and every decision to CALM Hub.
set -u
cd "$(dirname "$0")"
rm -rf .sessions && mkdir -p .sessions

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
# The human reads the binding code off the approval screen; the script derives it the same way.
code() { node -e "import('./gateway/lib.mjs').then((m) => { const c = m.loadChange('$1'); const d = m.sha256(m.diffOf(c.commit)); console.log(m.bindingCode({ commit: c.commit, diff_sha256: d })); })"; }
R=.demo/reviews

session reset
step "node gateway/reset.mjs"

session routine
step "node gateway/propose.mjs demo/changes/account-summary.json"
step "node gateway/review.mjs CHG-0421 --as author-agent"
step "node gateway/merge.mjs CHG-0421 --review $R/CHG-0421.author-agent.json"
step "node gateway/review.mjs CHG-0421 --as review-bot"
step "node gateway/merge.mjs CHG-0421 --review $R/CHG-0421.review-bot.json"

session ledger
step "node gateway/propose.mjs demo/changes/position-total.json"
step "node gateway/review.mjs CHG-0422 --as review-bot"
step "node gateway/merge.mjs CHG-0422 --review $R/CHG-0422.review-bot.json"

session approve
CODE=$(code CHG-0422)
step "APPROVE_CODE=$CODE node gateway/approve.mjs CHG-0422 --as alice --lines 12"

session amended
step "node gateway/propose.mjs demo/changes/position-total-amended.json"
step "node gateway/review.mjs CHG-0423 --as review-bot"
step "node gateway/merge.mjs CHG-0423 --review $R/CHG-0423.review-bot.json --approval .demo/token.json"

session allowed
step "node gateway/merge.mjs CHG-0422 --review $R/CHG-0422.review-bot.json --approval .demo/token.json"

session shortcut
step "node gateway/propose.mjs demo/changes/ledger-shortcut.json"
step "node gateway/review.mjs CHG-0424 --as review-bot"
step "node gateway/merge.mjs CHG-0424 --review $R/CHG-0424.review-bot.json"

session architect
step "node gateway/propose.mjs demo/changes/architect-ledger-connection.json"
step "node gateway/review.mjs CHG-0425 --as review-bot"
step "node gateway/merge.mjs CHG-0425 --review $R/CHG-0425.review-bot.json"
CODE=$(code CHG-0425)
step "APPROVE_CODE=$CODE node gateway/approve.mjs CHG-0425 --as alice --lines 12"
step "node gateway/merge.mjs CHG-0425 --review $R/CHG-0425.review-bot.json --approval .demo/token.json"

session climax
step "node gateway/propose.mjs demo/changes/trade-count.json"
step "node gateway/review.mjs CHG-0426 --as review-bot"
step "node gateway/merge.mjs CHG-0426 --review $R/CHG-0426.review-bot.json"

session evidence
step "node gateway/evidence.mjs --last 3"

node demo/sessions.mjs
