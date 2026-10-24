#!/usr/bin/env bash
# gh-live.sh: the whole GitHub demo from one command, from the blueprint's root: npm run demo:github
#   npm run demo:github                start afresh: reset the demo repository and CALM Hub, start the gateway in the
#                                      background, check everything, open GitHub, and play the demo
#   npm run demo:github -- --resume    carry on where the demo stopped, without a reset
#   npm run demo:record                the same start, then record the whole demo to video instead of playing it
#                                      (gh-record.mjs; the video is in gateway/.live/recording/)
# CALM Hub and its UI are started if they are not running, and left running. The gateway stops when the demo ends.
# Logs: gateway/.live/
set -euo pipefail
cd "$(dirname "$0")" # gateway/
export CALM_HUB_URL="${CALM_HUB_URL:-http://localhost:8080}"
export HUB_UI="${HUB_UI:-http://localhost:5173}"
CALM="$(cd ../.. && pwd)/architecture-as-code"
LOGS="$PWD/.live"
mkdir -p "$LOGS"
RESUME=false
RECORD=false
[ "${1:-}" = "--resume" ] && RESUME=true
[ "${1:-}" = "--record" ] && RECORD=true

step() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*"; exit 1; }
up() { curl -sf -o /dev/null --max-time 3 "$1"; }
wait_for() { # url seconds what log
  local i
  for ((i = 0; i < $2; i += 2)); do up "$1" && return 0; sleep 2; done
  tail -20 "$4"
  fail "$3 did not start in $2 seconds (log: $4)"
}

step "1. CALM Hub"
[ -d "$CALM" ] || fail "no architecture-as-code checkout at $CALM"
if up "$CALM_HUB_URL/api/calm/namespaces"; then echo "running at $CALM_HUB_URL"; else
  echo "starting it (a minute or two the first time)"
  (cd "$CALM/calm-hub" && nohup ../mvnw quarkus:dev -Pstandalone,server-only -Dquarkus.console.enabled=false </dev/null >"$LOGS/calm-hub.log" 2>&1 &)
  wait_for "$CALM_HUB_URL/api/calm/namespaces" 300 "CALM Hub" "$LOGS/calm-hub.log"
  echo "running at $CALM_HUB_URL"
fi
if up "$HUB_UI"; then echo "UI running at $HUB_UI"; else
  echo "starting the UI"
  (cd "$CALM/calm-hub-ui" && nohup npm start </dev/null >"$LOGS/calm-hub-ui.log" 2>&1 &)
  wait_for "$HUB_UI" 120 "The CALM Hub UI" "$LOGS/calm-hub-ui.log"
  echo "UI running at $HUB_UI"
fi

step "2. Stop any gateway already running"
for pid in $(pgrep -f 'gateway/gh-gateway.mjs' || true); do kill "$pid" && echo "stopped $pid"; done

if ! $RESUME; then
  step "3. Reset the demo repository and CALM Hub"
  node gateway/gh-reset.mjs
else
  [ -f .gh/demo-state.json ] || fail "nothing to resume: run npm run demo:github"
  step "3. Resume (no reset)"
fi

step "4. Start the gateway in the background"
node gateway/gh-gateway.mjs --watch >"$LOGS/gateway.log" 2>&1 &
GATEWAY=$!
trap 'kill $GATEWAY 2>/dev/null && echo "gateway stopped"' EXIT
for ((i = 0; i < 30; i++)); do
  grep -qs "\"pid\":$GATEWAY," .gh/gateway-run.json && break
  kill -0 "$GATEWAY" 2>/dev/null || { tail -20 "$LOGS/gateway.log"; fail "the gateway stopped (log: $LOGS/gateway.log)"; }
  sleep 1
done
echo "watching (pid $GATEWAY; log: gateway/.live/gateway.log)"

if ! $RESUME; then
  step "5. Pre-flight"
  node gateway/gh-preflight.mjs || fail "not ready: fix what is marked ✗ above, then run npm run demo:github again"
  $RECORD || open "https://github.com/${DEMO_REPO:-rocketstack-matt/osffny-sdlc-calm}/pulls" # CALM Hub opens on the first moment
fi

if $RECORD; then
  step "Recording the demo (about nine minutes)"
  node gateway/gh-record.mjs
  exit
fi

step "The demo"
cat <<'KEYS'
  Enter  the next moment        m  merge (once the check is green)
  a      approve from this laptop (rehearsals, or if Aaron cannot)
  o      open the pull request  h  open CALM Hub at the latest version
  s      where we are           q  quit (the gateway stops too)
KEYS
node gateway/gh-demo.mjs
