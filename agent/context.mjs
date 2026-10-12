// The architectural context an agent needs BEFORE it writes code, derived from the CALM model.
// Used by both the CLI (agent/calm-context.mjs) and the MCP server (agent/mcp/calm-context-server.mjs),
// so agents with and without MCP support get identical answers.
import { loadArchitecture, nodeForPath, nodeById, modelledEdges, loadSpecs } from '../gates/lib/calm.mjs';

const controlsOf = (thing) =>
  Object.entries(thing?.controls ?? {}).map(([id, c]) => ({ id, description: c.description, controlId: c.requirements?.[0]?.config?.['control-id'], applied: c.requirements?.[0]?.config?.description, requirementUrl: c.requirements?.[0]?.['requirement-url'] }));

export function contextForNode(nodeId) {
  const arch = loadArchitecture();
  const node = nodeById(arch, nodeId);
  if (!node) return { error: `No CALM node "${nodeId}". Known nodes: ${arch.nodes.map((n) => n['unique-id']).join(', ')}` };
  const edges = modelledEdges(arch);
  return {
    node: { id: nodeId, name: node.name, description: node.description, sourcePath: node.metadata?.['source-path'] ?? null },
    mayConnectTo: edges.filter((e) => e.source === nodeId).map((e) => ({ node: e.destination, relationship: e.id })),
    calledBy: edges.filter((e) => e.destination === nodeId).map((e) => ({ node: e.source, relationship: e.id })),
    nodeControls: controlsOf(node),
    systemControls: controlsOf(arch),
    rule: 'Any connection not listed in mayConnectTo is architectural drift: service dependency control (SDLC-PREV-017) blocks it. If the spec cannot be met within these connections, stop and propose a model change for human review. Do not edit architecture/ to make a gate pass.',
  };
}

export function contextForPath(path) {
  const node = nodeForPath(loadArchitecture(), path);
  return node ? contextForNode(node['unique-id']) : { path, note: 'This path is not owned by a CALM node. Paths under architecture/, gates/, agent/ and .github/ are control plane and always need human review.' };
}

export function specContext(specId) {
  const spec = loadSpecs().find((s) => s.id === specId);
  if (!spec) return { error: `No spec ${specId}` };
  return { spec, scope: (spec['calm-nodes'] ?? []).map(contextForNode), rule: `Only touch code owned by: ${(spec['calm-nodes'] ?? []).join(', ')}. The requirements control (SDLC-PREV-004) blocks anything else.` };
}
