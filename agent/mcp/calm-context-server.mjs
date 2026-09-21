#!/usr/bin/env node
// A small MCP server (stdio) that gives any MCP-capable coding agent architectural context from the CALM model,
// and lets it run the gates on its own work before asking for review. Read-only by design (AIGF mi-18: least privilege).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { contextForNode, contextForPath, specContext } from '../context.mjs';
import { runAll } from '../../gates/run-all.mjs';

const text = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const server = new McpServer({ name: 'calm-context', version: '0.1.0' });

server.tool('calm_spec_context', 'Call this FIRST. Given a spec id, returns the CALM nodes you may touch, what each may and must not connect to, and the controls that apply.',
  { specId: z.string().describe('e.g. SPEC-001') }, async ({ specId }) => text(specContext(specId)));

server.tool('calm_node_context', 'Architectural context for one CALM node: allowed connections, forbidden connections, controls, criticality.',
  { nodeId: z.string() }, async ({ nodeId }) => text(contextForNode(nodeId)));

server.tool('calm_path_context', 'Which CALM node owns a file path, and the constraints that follow.',
  { path: z.string().describe('repo-relative path') }, async ({ path }) => text(contextForPath(path)));

server.tool('run_gates', 'Run every blocking gate on the current working tree. Call before you say you are done. Fix your code, never the gates or the model.',
  { specId: z.string() }, async ({ specId }) => { process.env.SPEC = specId; return text(runAll()); });

await server.connect(new StdioServerTransport());
