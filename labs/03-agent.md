# Lab 3. Agent: two attempts at the same spec

**Station 3 of 5. About 10 minutes. No API key needed: both attempts are pre-recorded as patches.**

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
Reset to a clean tree, point any MCP-capable agent at this repo (`.mcp.json` registers the `calm-context` server,
and `AGENTS.md` is picked up by most agents), and prompt it with only: `Implement SPEC-001.`
Agents without MCP can use `npm run calm:context` as `AGENTS.md` describes. Then try again after renaming `AGENTS.md`
and removing `.mcp.json`, and compare.

**Takeaway.** Drift happens one reasonable assumption at a time. The agent governs itself better with context
(mi-18, mi-19 in `agent/GUARDRAILS.md`), and the gate catches it when it does not.

Next: [Lab 4](04-gate.md)
