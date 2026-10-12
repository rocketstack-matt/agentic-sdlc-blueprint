import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../gates/check.mjs';

test('a base ref that cannot be read blocks the change with an error result, it does not throw', async () => {
  const saved = process.env.BASE_REF;
  process.env.BASE_REF = 'no-such-ref-xyz';
  try {
    const { admissible, results } = await runChecks();
    assert.equal(admissible, false);
    assert.ok(results.length > 0);
    assert.ok(results.every((r) => r.passed === false));
    assert.ok(results.some((r) => r.findings.some((f) => f.level === 'error' && /no-such-ref-xyz/.test(f.message))), JSON.stringify(results));
  } finally {
    if (saved === undefined) delete process.env.BASE_REF; else process.env.BASE_REF = saved;
  }
});
