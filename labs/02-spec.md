# Lab 2. Spec: say what you want in terms of the model

**Station 2 of 5. About 5 minutes.** This station runs in the repository. One piece of it also appears in the browser:
Learning Lab lesson [a change to the model](https://lab.calm.finos.org/?lesson=agentic-sdlc-change) has a spec declare
the model change it needs, in station 4's half of the lab.

1. Read `specs/SPEC-001-account-summary.md`. The front matter names the CALM nodes and the relationship the change
   may use. The body repeats, in words, the one constraint most likely to be violated.
2. Ask the model what that scope implies:
   ```sh
   npm run calm:context -- --spec SPEC-001
   ```
   Look at `mayConnectTo` and `mustNotConnectTo` for `trade-api`. This JSON is exactly what an agent receives over MCP.
3. Check the specs are consistent with the model:
   ```sh
   npm run gate:spec
   ```
4. Name architecture that does not exist. The patch adds `pricing-service` to `calm-nodes`:
   ```sh
   git apply labs/patches/spec-001-unknown-node.patch
   npm run gate:spec                  # FAIL: references unknown CALM node "pricing-service"
   git checkout specs/
   ```
   A spec that names architecture that does not exist is rejected before any agent sees it.

**Takeaway.** "What you want" is easy. "How you want it" is the hard, auditable part, and the model already knows it.
Context engineering becomes a lookup, not a prompt-writing skill.

Next: [Lab 3](03-agent.md)
