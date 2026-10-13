// gh-gateway.mjs [--watch] [--pr <n>] [--dry-run]: the merge gateway for the GitHub demo. For each open pull request on the demo
// repository it reads the author, the reviews and the diff, works out the facts with the controls of main's
// architecture, evaluates them with ergo at stage merge (the same gates/lib/controls.mjs as CI and the local demo),
// posts the "Architecture controls" check and a comment that says why in plain words, records the decision as CALM
// control-evaluation decorators (on CALM Hub when CALM_HUB_URL is set). main is protected: it takes a pull request only
// when this check has passed, so a person presses Merge only on a yes.
// --watch keeps deciding every few seconds, whenever a pull request, its reviews or main change. --dry-run decides
// and prints the comment it would post, and posts and records nothing.
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baseArchitectureText, changeInput } from '../../gates/lib/calm.mjs';
import { evaluateControls } from '../../gates/lib/controls.mjs';
import { buildDecorators, checkRank, validateDecorator } from './decorators.mjs';
import { CHECK, CLONE, GH, REPO, appSlug, approver, as, diffIn, identityOf, inClone } from './github.mjs';
import { hubEnabled, postDecorator, publishArchitecture } from './hub.mjs';
import { ARCHITECTURE, parseArgs, run, sha256 } from './lib.mjs';

const STATE = join(GH, 'prs.json');
const DECISIONS = join(GH, 'decisions.ndjson');
const DECORATORS = join(GH, 'decorators');
const REVIEW_BOT_WAIT_MS = 120_000;
const loadState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {});
const saveState = (s) => writeFileSync(STATE, `${JSON.stringify(s, null, 2)}\n`);
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const now = () => new Date().toISOString().slice(11, 19);

// --- plain words ---------------------------------------------------------------------------------

function namer(arch) {
  const name = (id) => arch.nodes.find((n) => n['unique-id'] === id)?.name ?? id;
  const rels = Object.fromEntries((arch.relationships ?? []).filter((r) => r['relationship-type']?.connects).map((r) => [r['unique-id'], r['relationship-type'].connects]));
  return (id) => {
    if (rels[id]) return `${name(rels[id].source.node)} → ${name(rels[id].destination.node)}`;
    if (/^[^>]+->[^>]+$/.test(id ?? '')) { const [a, b] = id.split('->'); return `${name(a)} → ${name(b)}`; }
    if (/^[0-9a-f]{40}$/.test(id ?? '')) return 'this change';
    if (String(id).includes('/')) return `\`${id}\``;
    return name(id);
  };
}

// What a failed check means, for the person reading the pull request.
const PLAIN = {
  human_approved: 'needs a person to approve it',
  approval_for_this_commit: 'the approval is for an earlier commit',
  approval_for_this_diff: 'the approval is for different code',
  approval_verified: 'the approval could not be verified',
  approver_is_a_person: 'the approver is not someone who may approve',
  approver_is_not_the_author: 'the approver wrote the change',
  approver_is_not_the_reviewer: 'the approver is also the reviewer',
  in_architecture: 'that connection is not in the architecture',
  not_the_author: 'the author reviewed their own change',
  approved_reviewer: 'the reviewer is not an approved reviewer',
  review_approves: 'the review did not approve',
  review_of_this_commit: 'the review is for an earlier commit',
  review_of_this_diff: 'the review is for different code',
  in_spec: 'the spec does not cover this part of the system',
  names_a_spec: 'the change names no spec',
};

function explain(outcome, arch) {
  const say = namer(arch);
  const requirements = outcome.report?.requirements ?? {};
  const failing = (outcome.failing ?? []).map((name) => {
    let vs = (outcome.violations ?? []).filter((v) => v.requirement === name).sort((a, b) => checkRank(a) - checkRank(b));
    // With no approval at all, the checks on the approval's details only repeat that it is missing.
    if (vs.some((v) => v.check === 'human_approved')) vs = vs.filter((v) => !/^(approval_|approver_)/.test(v.check));
    const findings = [...new Set(vs.map((v) => `${say(v.subject?.id)}: ${PLAIN[v.check] ?? v.description ?? v.check}`))];
    return { name, description: requirements[name].description, findings };
  });
  const met = Object.entries(requirements).filter(([, q]) => q.status === 'met').map(([, q]) => q.description);
  const errors = [...(outcome.error ? [outcome.error] : []), ...(outcome.problems ?? [])];
  const headline = outcome.allowed ? 'All controls met' : errors[0] ?? failing[0]?.description ?? 'Denied';
  return { headline, failing, met, errors };
}

function markdown({ allowed, headline, failing, met, errors }, { version, approverHandles }) {
  const lines = [allowed ? `### ✅ ${headline}` : `### ❌ ${headline}`, ''];
  if (allowed) lines.push('Every control the architecture puts on this change is met. It can be merged.', '');
  for (const e of errors.slice(allowed ? 0 : 1)) lines.push(`- ${e}`);
  for (const f of failing) {
    if (!(failing.length === 1 && !errors.length && f.description === headline)) lines.push(`**${f.description}**`);
    for (const x of f.findings.slice(0, 3)) lines.push(`- ✗ ${x}`);
    if (f.findings.length > 3) lines.push(`- … and ${f.findings.length - 3} more`);
    lines.push('');
  }
  if (!allowed && approverHandles.length && failing.some((f) => f.findings.some((x) => /approv/i.test(x)))) lines.push(`A person who may approve: ${approverHandles.map((h) => `@${h}`).join(', ')}`, '');
  if (met.length) lines.push(`<details><summary>Met (${met.length})</summary>`, '', ...met.map((m) => `- ✓ ${m}`), '', '</details>', '');
  lines.push(`<sub>Decided against the architecture on \`main\`${version ? `, version ${version} in CALM Hub` : ''}. Every decision is recorded on the architecture as CALM control-evaluation decorators.</sub>`);
  return lines.join('\n');
}

// --- one pull request -------------------------------------------------------------------------------

async function decide(gw, pr, state, { force = false, dry = false } = {}) {
  const n = pr.number;
  const head = pr.head.sha;
  inClone('fetch', '-q', 'origin', 'main', `+refs/pull/${n}/head:refs/pr/${n}`);
  const main = inClone('rev-parse', 'origin/main');
  const reviews = await gw.get(`/repos/${REPO}/pulls/${n}/reviews?per_page=100`);
  const key = hash({ head, main, reviews: reviews.map((r) => [r.id, r.state, r.commit_id]) });
  if (!force && state[n]?.key === key) return;

  // The review bot reviews every commit; give it a moment before deciding, so the first word on a pull request is
  // not "no review" while the review is on its way.
  // Only reviews that approve or request changes count; a bot that only comments (such as Copilot) is not a review.
  const decided = (r) => ['APPROVED', 'CHANGES_REQUESTED'].includes(r.state);
  const bot = reviews.filter((r) => r.user.type === 'Bot' && decided(r)).at(-1);
  const waiting = !bot || bot.commit_id !== head;
  const age = Date.now() - Date.parse(state[n]?.headSeen === head ? state[n].headSeenAt : new Date().toISOString());
  if (waiting && age < REVIEW_BOT_WAIT_MS && !dry) {
    if (state[n]?.headSeen !== head) {
      await gw.post(`/repos/${REPO}/check-runs`, { name: CHECK, head_sha: head, status: 'in_progress', output: { title: 'Waiting for the review bot', summary: 'The gateway decides as soon as the review bot has reviewed this commit.' } });
      state[n] = { ...state[n], headSeen: head, headSeenAt: new Date().toISOString() };
      saveState(state);
    }
    return;
  }

  const archText = baseArchitectureText(main, CLONE);
  const arch = JSON.parse(archText);
  const base = inClone('merge-base', main, head);
  const diffSha = sha256(diffIn(main, head));
  const diffAt = (commit) => sha256(diffIn(main, commit));
  const commitSpec = inClone('log', `${main}..${head}`, '--format=%(trailers:key=Spec,valueonly)').split('\n').map((s) => s.trim()).find(Boolean);
  const specId = commitSpec ?? pr.body?.match(/SPEC-\d+/)?.[0];
  const author = identityOf(pr.user.login);

  const tree = mkdtempSync(join(tmpdir(), 'gh-gateway-'));
  inClone('worktree', 'add', '--detach', '--quiet', tree, head);
  let input;
  try {
    input = changeInput({ arch, base, head, root: CLONE, treeRoot: tree, specId, author });
  } finally {
    inClone('worktree', 'remove', '--force', tree);
    rmSync(tree, { recursive: true, force: true });
  }
  input.change = { ...input.change, id: `PR-${n}`, title: pr.title, diff_sha256: diffSha };
  // The machine review: the latest by a bot. The person's approval: the latest decision by a person. Each counts for
  // the commit it was made on, and nothing else.
  if (bot) input.change.review = { reviewer: identityOf(bot.user.login), verdict: bot.state === 'APPROVED' ? 'approve' : 'reject', commit: bot.commit_id, diff_sha256: diffAt(bot.commit_id), verified: true };
  const person = reviews.filter((r) => r.user.type === 'User' && decided(r)).at(-1);
  if (person?.state === 'APPROVED') input.change.approval = { approver: identityOf(person.user.login), commit: person.commit_id, diff_sha256: diffAt(person.commit_id), verified: true, used: false };

  let mergeable = true;
  try { inClone('merge-tree', '--write-tree', main, head); } catch { mergeable = false; }
  let outcome = mergeable ? await evaluateControls(input, { stage: 'merge' }) : { allowed: false, error: 'The change does not merge cleanly into main', controls: {} };

  const decisionId = randomUUID();
  const evaluatedAt = new Date().toISOString();
  const published = dry ? null : await publishArchitecture(archText);
  const target = published && !published.error ? published.target : `${ARCHITECTURE}@${sha256(archText).slice(0, 12)}`;
  let decorators = buildDecorators({ outcome, input, decisionId, target, evaluatedAt });
  const invalid = decorators.map((d) => ({ d, ...validateDecorator(d) })).find((x) => !x.valid);
  if (invalid) { outcome = { ...outcome, allowed: false, error: `The decision could not be recorded: ${invalid.errors.join('; ')}` }; decorators = []; }

  const words = explain(outcome, arch);
  const version = published && !published.error ? published.version : null;
  const body = markdown({ allowed: outcome.allowed, ...words }, { version, approverHandles: [approver()] });
  if (dry) { console.log(`#${n} ${head.slice(0, 7)}  ${outcome.allowed ? 'ALLOW' : 'DENY'}  (author ${author}, review ${input.change.review?.reviewer ?? 'none'}, approval ${input.change.approval?.approver ?? 'none'})\n${body}\n`); return; }
  await gw.post(`/repos/${REPO}/check-runs`, {
    name: CHECK, head_sha: head, status: 'completed', conclusion: outcome.allowed ? 'success' : 'failure', external_id: decisionId,
    output: { title: words.headline.slice(0, 250), summary: body },
  });
  // A comment when the verdict changes, so the pull request's timeline tells the story.
  const verdict = hash({ allowed: outcome.allowed, failing: words.failing.map((f) => [f.description, f.findings]), errors: words.errors });
  if (state[n]?.verdict !== verdict) await gw.post(`/repos/${REPO}/issues/${n}/comments`, { body });

  appendFileSync(DECISIONS, `${JSON.stringify({ decision_id: decisionId, timestamp: evaluatedAt, pr: n, head, allowed: outcome.allowed, author, spec: specId ?? null, review: input.change.review ?? null, approval: input.change.approval ?? null, architecture_sha256: sha256(archText), failing: outcome.failing ?? [], hub: version })}\n`);
  mkdirSync(DECORATORS, { recursive: true });
  for (const d of decorators) writeFileSync(join(DECORATORS, `${d['unique-id']}.json`), `${JSON.stringify(d, null, 2)}\n`);
  let hubNote = '';
  if (hubEnabled() && version) { const ids = []; for (const d of decorators) ids.push(await postDecorator(d)); hubNote = ids.some((x) => x?.error) ? ', some decorators failed on the Hub' : `, hub ${version}`; }
  console.log(`${now()}  #${n} ${head.slice(0, 7)}  ${outcome.allowed ? 'ALLOW' : 'DENY '}  ${words.headline}${hubNote}`);

  state[n] = { ...state[n], key, verdict, headSeen: head, headSeenAt: state[n]?.headSeenAt ?? evaluatedAt };
  saveState(state);
}

// When main's architecture changes (the architect's pull request merged), CALM Hub gets the new version straight away.
async function followMain(state) {
  if (!hubEnabled()) return;
  inClone('fetch', '-q', 'origin', 'main');
  const text = `${inClone('show', `origin/main:${ARCHITECTURE}`)}\n`;
  const sha = sha256(text);
  if (state.mainArchitecture === sha) return;
  const published = await publishArchitecture(text);
  if (!published?.error) {
    if (state.mainArchitecture) console.log(`${now()}  the architecture changed on main: CALM Hub version ${published.version}`);
    state.mainArchitecture = sha;
    saveState(state);
  }
}

run(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  if (!existsSync(CLONE)) throw new Error('no clone of the demo repository: run node gateway/gh-reset.mjs first');
  if (!appSlug('gateway') && !flags['dry-run']) throw new Error('no gateway app: run node gateway/gh-apps.mjs first');
  const state = loadState();
  const tick = async () => {
    const gw = await as(appSlug('gateway') ? 'gateway' : 'owner');
    if (!flags['dry-run']) await followMain(state);
    const prs = flags.pr ? [await gw.get(`/repos/${REPO}/pulls/${flags.pr}`)] : await gw.get(`/repos/${REPO}/pulls?state=open&per_page=50`);
    for (const pr of prs.filter((p) => p.state === 'open')) {
      try { await decide(gw, pr, state, { force: Boolean(flags.pr) || Boolean(flags['dry-run']), dry: Boolean(flags['dry-run']) }); } catch (e) { console.error(`${now()}  #${pr.number} error: ${e.message}`); }
    }
  };
  if (!flags.watch) { await tick(); return; }
  console.log(`watching ${REPO} (Ctrl-C to stop)`);
  for (;;) {
    try { await tick(); } catch (e) { console.error(`${now()}  error: ${e.message}`); }
    await new Promise((r) => setTimeout(r, Number(process.env.GATEWAY_POLL_MS ?? 4000)));
  }
});
