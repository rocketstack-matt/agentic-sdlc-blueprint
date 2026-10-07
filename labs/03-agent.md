# Lab 3. Agent: two attempts at the same spec

**Lab 3 of 5. About 10 minutes. No API key needed: both attempts are pre-recorded as patches.**

### Attempt A: the reasonable shortcut
An agent given only "add an account summary endpoint" notices the positions file is right there on disk.
```sh
git apply labs/patches/attempt-a-shortcut.patch
npm test && npm run typecheck      # green. A reviewer skimming the diff would likely approve it.
SPEC=SPEC-001 npm run gates        # BLOCKED
```
Read the two errors. One is drift (the code has a connection the model does not). The other is a control breach
(`position-store` names who may connect to it). Reset:
```sh
git checkout -- . && git clean -fd services test
```

### Attempt B: same agent, given the architecture
```sh
git apply labs/patches/attempt-b-conformant.patch
SPEC=SPEC-001 npm run gates        # ADMISSIBLE
```
Keep attempt B applied for Labs 4 and 5.

### Optional: do it live with your own agent
Reset to a clean tree, point any MCP-capable agent at this repo, and prompt it with only: `Implement SPEC-001.`
`AGENTS.md` is read by Claude Code, Codex, Copilot and Cursor; `CLAUDE.md` is a one-line import of it, and
`.gemini/settings.json` points Gemini CLI at it. The `calm-context` MCP server is registered for each tool where it
looks: `.mcp.json` (Claude Code, Copilot agent), `.vscode/mcp.json`, `.cursor/mcp.json`, `.codex/config.toml` and
`.gemini/settings.json`. Agents without MCP can use `npm run calm:context` as `AGENTS.md` describes. Then try again
after removing `AGENTS.md`, `CLAUDE.md` and every MCP registration, and compare. Two such runs, with the agent's diffs, gate output
and handover, are recorded in [`docs/live-runs/`](../docs/live-runs/README.md). Neither drifted; read why.

**Takeaway.** Drift happens one reasonable assumption at a time. The agent governs itself better with context
(AIR-PREV-018 and AIR-PREV-019 in `agent/GUARDRAILS.md`), and the gate catches it when it does not.

Next: [Lab 4](04-gate.md)
