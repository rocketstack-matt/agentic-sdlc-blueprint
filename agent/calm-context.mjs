#!/usr/bin/env node
// Usage: npm run calm:context -- --spec SPEC-001 | --node trade-api | --path services/trade-api/src/app.ts
import { contextForNode, contextForPath, specContext } from './context.mjs';
const [flag, value] = process.argv.slice(2);
const out = flag === '--spec' ? specContext(value) : flag === '--node' ? contextForNode(value) : flag === '--path' ? contextForPath(value)
  : { usage: 'calm-context --spec SPEC-001 | --node <calm-node-id> | --path <repo-path>' };
console.log(JSON.stringify(out, null, 2));
