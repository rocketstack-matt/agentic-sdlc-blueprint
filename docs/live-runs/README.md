# Live runs: one agent, one prompt, with and without the governance context

Two headless Claude Code runs of the same prompt against the same repository state, recorded on 21 September 2026.
The prompt was exactly `Implement SPEC-001.` and nothing else. The runs were not repeated, the prompt was not tuned,
and the results are reported as they came out.

| | unassisted | assisted |
| --- | --- | --- |
| `AGENTS.md`, `CLAUDE.md`, `.mcp.json` | removed | present |
| MCP server `calm-context` | none | loaded from `.mcp.json` |
| Result | conformant, ADMISSIBLE | conformant, ADMISSIBLE |
| Read the model before writing code | yes, by opening the JSON | yes, via `calm_spec_context` (MCP) |
| Ran the gates before handing over | yes, `npm run gates` (after several denied attempts) | yes, via `run_gates` (MCP) |
| Turns, cost, wall clock | 27, USD 0.82, 748 s | 24, USD 0.73, 279 s |

**Neither run drifted.** Both agents implemented the account summary over `trade-api-to-position-service` and
neither touched the position store. That is the honest headline.

## What the runs do and do not show

- **The spec already carries the constraint.** SPEC-001's own text says reading the position store is not an option.
  Both agents read the spec first. The unassisted run is therefore a test of "no instructions file and no MCP",
  not a test of "no governance visible at all".
- **The agent finds the governance if it is in the repo.** With nothing pointing it there, the unassisted agent
  still opened `architecture/trade-capture.architecture.json`, `gates/drift-check.mjs`, `gates/spec-check.mjs` and
  `agent/GUARDRAILS.md`, then ran the gates it found in `package.json`. The assisted agent read the same two gate
  scripts. Agents learn what the scanner detects by reading it, which is a reason to keep the checks in the model
  and the pattern, not only in the scanner.
- **What the context changed was the path, not the destination.** The assisted agent's first substantive call was
  the MCP context tool, before it opened any source file, and its last was the MCP gate tool. It finished in
  under half the wall clock. The unassisted agent spent six tool calls trying to run the gates with `SPEC=SPEC-001`
  set, which the run's allow-list rejected (see below), and reported that limitation in its handover.
- **Both agents handed over rather than committing**, and both reported the review decision correctly.
- **Both noticed the harness's own files.** The transcript and status files written into the clone by the runner were
  untracked, matched no review rule and routed the decision to HUMAN. Both agents called that out. The saved
  `gates.txt` in each folder was produced after removing those files, so it shows COGNITIVE.

This is one sample of each condition on one spec. It is evidence that the loop works end to end with a real agent,
not a measurement of how often unassisted agents drift. Attempt A in Lab 3 remains the pre-recorded drift case.

## Method

Two clones of the repository at commit `256a30b`, each with `labs/`, `docs/` and `README.md` removed because they
contain the worked answer to SPEC-001 (the same removal in both). The unassisted clone additionally had `AGENTS.md`
and `.mcp.json` removed. The assisted clone had the one-line `CLAUDE.md` import that ships with the repository. Neither
clone had the `model-diff` gate, which was added later the same day, so it does not appear in the saved gate output.

The runs used Claude Code headless with only project settings, so nothing from the operator's own configuration
applied, and with MCP restricted to the clone's own file:

```sh
# unassisted
claude -p "Implement SPEC-001." --output-format stream-json --verbose --max-turns 60 --setting-sources project \
  --strict-mcp-config --permission-mode acceptEdits \
  --allowedTools "Read Edit Write Glob Grep Bash(npm *) Bash(npx *) Bash(node *) Bash(git *) Bash(ls *) Bash(cat *) Bash(find *) Bash(tsc *)"

# assisted
claude -p "Implement SPEC-001." --output-format stream-json --verbose --max-turns 60 --setting-sources project \
  --strict-mcp-config --mcp-config .mcp.json --permission-mode acceptEdits \
  --allowedTools "Read Edit Write Glob Grep Bash(npm *) Bash(npx *) Bash(node *) Bash(git *) Bash(ls *) Bash(cat *) Bash(find *) Bash(tsc *) \
    mcp__calm-context__calm_spec_context mcp__calm-context__calm_node_context mcp__calm-context__calm_path_context mcp__calm-context__run_gates"
```

Model: `claude-fable-5-1` in both. The unassisted run also hit four rate-limit events, all allowed to proceed, which
account for part of its longer wall clock.

A known flaw in the method: `Bash(npm *)` does not match a command that starts with an environment assignment, so
`SPEC=SPEC-001 npm run gates` was denied in the unassisted run until the agent found another way. The assisted agent
avoided the problem by using the MCP gate tool. This is a harness artefact, not a property of either condition.

## Files

- `unassisted/` and `assisted/`: `diff.patch` (the agent's change), `gates.txt` (all gates under SPEC-001 on that
  change), `tool-calls.md` (every tool call in order, with turns, cost and duration), `final-message.md` (the agent's
  handover, verbatim apart from punctuation: the agents' em-dashes were replaced with commas to match house style).
