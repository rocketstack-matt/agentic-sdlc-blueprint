#!/usr/bin/env bash
# Replays every command printed in labs/01 to 05 and asserts the outcome each lab promises.
# Runs in a throwaway git worktree seeded from your working tree, so nothing here touches your files. Used by CI so the
# patches and the prose can never silently rot. Usage: bash labs/verify.sh
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
[ -d node_modules ] || { echo "run npm install first"; exit 2; }

# CI exports these for the real gate run. The labs assume a developer shell, so drop them here.
unset BASE_REF SPEC PR_BODY CHANGE_AUTHOR_KIND CHANGE_AUTHOR_ID
export GIT_AUTHOR_NAME=lab-runner GIT_AUTHOR_EMAIL=lab-runner@example.invalid
export GIT_COMMITTER_NAME=lab-runner GIT_COMMITTER_EMAIL=lab-runner@example.invalid
export NODE_NO_WARNINGS=1

WT=$(mktemp -d "${TMPDIR:-/tmp}/blueprint-verify.XXXXXX")
cleanup() { cd "$ROOT"; git worktree remove --force "$WT" >/dev/null 2>&1 || true; rm -rf "$WT"; }
trap cleanup EXIT
git worktree add --detach -q "$WT" HEAD
ln -s "$ROOT/node_modules" "$WT/node_modules"
if [ -n "$(git status --porcelain)" ]; then     # replay what you are about to commit, not just HEAD
  echo "note: the working tree has uncommitted changes; they are included in this run"
  git diff --binary HEAD > "$WT/.verify.diff"
  [ -s "$WT/.verify.diff" ] && git -C "$WT" apply "$WT/.verify.diff"
  git ls-files --others --exclude-standard -z | while IFS= read -r -d '' f; do mkdir -p "$WT/$(dirname "$f")"; cp "$f" "$WT/$f"; done
  rm "$WT/.verify.diff"
  git -C "$WT" add -A && git -C "$WT" commit -q -m "verify.sh snapshot of the working tree"
fi
cd "$WT"

# The labs assume the blueprint as shipped. A branch that has already implemented a spec cannot replay them,
# and the gates, not this script, govern that change. main must always be lab-ready, so CI requires the baseline there.
if ! git apply --check labs/patches/attempt-a-shortcut.patch 2>/dev/null; then
  echo "labs/verify.sh: SKIPPED. This tree is not the lab baseline (labs/patches/attempt-a-shortcut.patch no longer applies)."
  [ "${VERIFY_REQUIRE_BASELINE:-}" = true ] && { echo "VERIFY_REQUIRE_BASELINE is set: this branch must stay lab-ready."; exit 1; }
  exit 0
fi

# --- tiny assertion kit -------------------------------------------------------------------
FAILED=0; OUT=""; RC=0
run() {                       # run "<command exactly as printed in the lab>"
  echo "\$ $1"
  set +e; OUT=$(bash -c "$1" 2>&1); RC=$?; set -e
}
printed() {                   # the command must still appear verbatim in a lab file, or the lab and this script have diverged
  grep -qF -- "$1" "$ROOT"/labs/0*.md "$ROOT"/README.md || fail "command is no longer printed in any lab: $1"
}
lab() { printed "$1"; run "$1"; }
ok()   { echo "  ok    $1"; }
fail() { echo "  FAIL  $1"; FAILED=$((FAILED + 1)); }
expect_rc()      { [ "$RC" -eq "$1" ] && ok "exit $1" || { fail "expected exit $1, got $RC"; echo "$OUT" | sed 's/^/        /'; }; }
expect_nonzero() { [ "$RC" -ne 0 ] && ok "exit non-zero" || { fail "expected a non-zero exit"; echo "$OUT" | sed 's/^/        /'; }; }
expect()         { grep -qF -- "$1" <<<"$OUT" && ok "output has: $1" || { fail "output lacks: $1"; echo "$OUT" | sed 's/^/        /'; }; }
expect_not()     { grep -qF -- "$1" <<<"$OUT" && { fail "output must not have: $1"; echo "$OUT" | sed 's/^/        /'; } || ok "output lacks: $1"; }
edit_json() { node -e "const fs=require('fs');const p=process.argv[1];const a=JSON.parse(fs.readFileSync(p));($2)(a);fs.writeFileSync(p,JSON.stringify(a,null,2)+'\n')" "$1"; }

# --- README quick start: a clean tree is ADMISSIBLE -------------------------------------------
echo "== Clean tree"
lab "npm test";                 expect_rc 0; expect "pass 2"
lab "npm run typecheck";        expect_rc 0
lab "npm run gates";            expect_rc 0; expect "ADMISSIBLE"; expect "2 passed, 0 failed"; expect "governed-service pattern"; expect "PASS  model-diff"

# --- Lab 1: Model --------------------------------------------------------------------------------
echo "== Lab 1"
lab "npm run calm:validate";    expect_rc 0; expect "Errors: no"
lab "npx calm validate -p architecture/governed-service.pattern.json -a architecture/trade-capture.architecture.json -u architecture/url-mapping.json -f pretty"; expect_rc 0; expect "Errors: no"
edit_json architecture/trade-capture.architecture.json \
  "a => { delete a.controls['sdlc-prev-004-requirements-repository'].requirements[0].config.repository }"
lab "npm run calm:validate";    expect_nonzero; expect "Errors: yes"; expect "must have required property 'repository'"
lab "git checkout architecture/"; expect_rc 0
edit_json architecture/trade-capture.architecture.json "a => { delete a.nodes.find((n) => n['unique-id'] === 'trade-api').metadata['source-path'] }"
lab "npm run calm:validate";    expect_nonzero; expect "must have required property 'source-path'"
lab "git checkout architecture/"; expect_rc 0

# --- Lab 2: Spec ---------------------------------------------------------------------------------
echo "== Lab 2"
lab "npm run calm:context -- --spec SPEC-001"; expect_rc 0; expect '"mustNotConnectTo"'; expect "position-store (only position-service may connect)"
lab "npm run gate:spec";        expect_rc 0; expect "PASS  spec-check"
lab "git apply labs/patches/spec-001-unknown-node.patch"; expect_rc 0
lab "npm run gate:spec";        expect_nonzero; expect 'references unknown CALM node "pricing-service"'
lab "git checkout specs/";      expect_rc 0

# --- Lab 3: Agent --------------------------------------------------------------------------------
echo "== Lab 3, attempt A: passes tests, BLOCKED by the gates"
lab "git apply labs/patches/attempt-a-shortcut.patch"; expect_rc 0
lab "npm test && npm run typecheck"; expect_rc 0; expect "pass 4"
lab "SPEC=SPEC-001 npm run gates"; expect_nonzero; expect "BLOCKED"; expect "FAIL  drift-check"
  expect "DRIFT: code connects trade-api -> position-store"; expect "CONTROL BREACH: position-store only permits [position-service]"
  expect "4 passed, 0 failed"; expect "Required review mode: COGNITIVE"
lab "git checkout -- . && git clean -fd services test"; expect_rc 0
[ -z "$(git status --porcelain)" ] && ok "tree clean after reset" || fail "tree dirty after reset: $(git status --porcelain)"

echo "== Lab 3, attempt B: ADMISSIBLE"
lab "git apply labs/patches/attempt-b-conformant.patch"; expect_rc 0
lab "SPEC=SPEC-001 npm run gates"; expect_rc 0; expect "ADMISSIBLE"; expect "5 passed, 0 failed"; expect "Required review mode: COGNITIVE"

# --- Lab 4: Gate ---------------------------------------------------------------------------------
echo "== Lab 4"
lab "npm run gate:review";      expect_rc 0; expect "Required review mode: COGNITIVE"
lab 'echo "// touched by lab 4" >> services/position-service/src/app.ts'; expect_rc 0
lab "npm run gate:review";      expect_rc 0; expect "Required review mode: HUMAN"; expect "tier 1, confidential"
lab "git checkout -- services/position-service/src/app.ts"; expect_rc 0
lab "grep -n -e '\"author-may-not-review\"' -e '\"mode\"' -e '\"reason\"' architecture/trade-capture.architecture.json"; expect_rc 0; expect '"mode": "cognitive"'

echo "== Lab 4, attempt C: the agent edits the model"
lab "git checkout -- . && git clean -fd services test"; expect_rc 0
lab "git apply labs/patches/attempt-c-edit-the-model.patch"; expect_rc 0
lab "SPEC=SPEC-001 npm run gates"; expect_nonzero; expect "BLOCKED"
  expect_not "DRIFT:"; expect "CONTROL BREACH: position-store only permits [position-service]"
  expect "FAIL  model-diff"; expect "UNDECLARED MODEL CHANGE: SPEC-001 does not declare [trade-api-to-position-store]"
  expect "Required review mode: HUMAN"; expect "architecture/trade-capture.architecture.json: Control plane"
echo "== Lab 4, the right path: SPEC-002 declares its model change"
lab "git checkout -- . && git clean -fd services test specs"; expect_rc 0
lab "git apply labs/patches/spec-002-model-change.patch"; expect_rc 0
lab "SPEC=SPEC-002 npm run gates"; expect_rc 0; expect "ADMISSIBLE"; expect "STALE MODEL? position-service-to-trade-api"
  expect "PASS  model-diff     Model changed against HEAD: +1 -0 ~1."; expect "Required review mode: HUMAN"
lab "git apply labs/patches/attempt-d-spec-002.patch"; expect_rc 0
lab "SPEC=SPEC-002 npm run gates"; expect_rc 0; expect "ADMISSIBLE"; expect "4 connection(s) observed in code, 4 modelled in CALM"
  expect "5 passed, 0 failed"; expect "Required review mode: HUMAN"
lab "git checkout -- . && git clean -fd services test specs"; expect_rc 0
lab "git apply labs/patches/attempt-b-conformant.patch"; expect_rc 0

# --- Lab 5: Evidence -----------------------------------------------------------------------------
echo "== Lab 5"
lab 'git add -A && git commit -m "Add account summary endpoint" -m "Spec: SPEC-001"'; expect_rc 0
lab "CHANGE_AUTHOR_KIND=agent CHANGE_AUTHOR_ID=my-coding-agent npm run evidence"; expect_rc 0
  expect "ADMISSIBLE  evidence written to evidence/out/"; expect "review mode: cognitive"; expect "5 CALM evidence documents in evidence/out/"
  expect "SDLC-PREV-001, SDLC-PREV-004, SDLC-PREV-012, SDLC-PREV-014, SDLC-PREV-016, SDLC-PREV-017"
lab 'head -n 24 evidence/out/$(git rev-parse --short=12 HEAD).json'; expect_rc 0; expect '"spec": "SPEC-001"'
lab 'ls evidence/out/$(git rev-parse --short=12 HEAD)/'; expect_rc 0; expect "sdlc-prev-012-deployment-gating.json"
lab 'cat evidence/out/$(git rev-parse --short=12 HEAD)/*.sdlc-prev-012-deployment-gating.json'; expect_rc 0; expect '"control-config-url"'
BUNDLE=$(ls evidence/out/*.json | head -1)
echo "\$ node <bundle checks> $BUNDLE"
set +e; OUT=$(node -e '
const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const { sha256, ...body } = b;
const check = (name, cond) => { if (!cond) { console.log("bundle check failed: " + name); process.exitCode = 1; } };
check("admissible", b.admissible === true);
check("spec", b.subject.spec === "SPEC-001");
check("bound to a real commit", b.subject.workingTreeDirty === false && /^[0-9a-f]{40}$/.test(b.subject.commit));
check("architecture hash", /^[0-9a-f]{64}$/.test(b.subject.architectureSha256));
check("author", b.author.kind === "agent" && b.author.id === "my-coding-agent");
check("review mode", b.review.requiredMode === "cognitive" && b.review.authorMayNotReview === true);
check("changed files", JSON.stringify(b.subject.changedFiles) === JSON.stringify(["services/trade-api/src/app.ts", "test/account-summary.test.ts"]));
check("test counts recorded", b.gates.find((g) => g.gate === "tests").tests.pass === 5);
check("hash recomputes", require("crypto").createHash("sha256").update(JSON.stringify(body)).digest("hex") === sha256);
if (!process.exitCode) console.log("bundle ok");
' "$BUNDLE" 2>&1); RC=$?; set -e
expect_rc 0; expect "bundle ok"
DOCS="${BUNDLE%.json}"
echo "\$ node <CALM evidence document checks> $DOCS/"
set +e; OUT=$(node -e '
const fs = require("fs"), path = require("path");
const [dir, bundlePath] = process.argv.slice(1);
const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
const arch = JSON.parse(fs.readFileSync("architecture/trade-capture.architecture.json", "utf8"));
const check = (name, cond) => { if (!cond) { console.log("evidence document check failed: " + name); process.exitCode = 1; } };
const deref = (root, pointer) => pointer.split("/").slice(1).map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~")).reduce((o, k) => o?.[k], root);
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
check("one document per control configuration", files.length === 5);
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), e = d.evidence ?? {};
  check(f + ": CALM 1.2 evidence schema", d.$schema === "https://calm.finos.org/release/1.2/meta/evidence.json");
  check(f + ": required keys", typeof e["unique-id"] === "string" && Array.isArray(e["evidence-paths"]) && e["evidence-paths"].length > 0 && typeof e["control-config-url"] === "string");
  const [url, pointer] = e["control-config-url"].split("#"), config = deref(arch, pointer);
  check(f + ": cites a config in this architecture", url === arch.$id && typeof config?.["control-id"] === "string");
  for (const p of e["evidence-paths"]) { const [file, gate] = p.split("#"); check(f + ": " + p, file === bundlePath && deref(bundle, gate)?.controls?.includes(config?.["control-id"])); }
}
if (!process.exitCode) console.log(files.length + " CALM evidence documents ok");
' "$DOCS" "$BUNDLE" 2>&1); RC=$?; set -e
expect_rc 0; expect "5 CALM evidence documents ok"

echo
if [ "$FAILED" -eq 0 ]; then echo "labs/verify.sh: every lab behaves as printed."; else echo "labs/verify.sh: $FAILED assertion(s) failed."; exit 1; fi
