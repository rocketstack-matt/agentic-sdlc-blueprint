// approve.mjs <id> --as <approver> [--lines N] [--width N]
// The approval service, mocked as a terminal the agent cannot reach. It renders the real diff,
// prints a binding code, waits for a human to type it back, then mints a single-use ES256 JWT
// bound to the commit, the diff hash and the spec. Without a TTY the code comes from APPROVE_CODE.
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { relative } from 'node:path';
import {
  APPROVAL, bindingCode, diffOf, keyPair, loadChange, parseArgs, paths, run, sha256, short, signJws,
} from './lib.mjs';

async function askHuman(code) {
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return (await rl.question('type the binding code to approve: ')).trim().toUpperCase();
    } catch {
      return ''; // end of input: nobody typed
    } finally {
      rl.close();
    }
  }
  const typed = (process.env.APPROVE_CODE ?? '').trim().toUpperCase();
  console.log(`type the binding code to approve: ${typed || '(APPROVE_CODE not set)'}  [stdin is not a tty: read from APPROVE_CODE]`);
  return typed;
}

run(async () => {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  if (!positional[0] || typeof flags.as !== 'string') throw new Error('usage: node gateway/approve.mjs <id> --as <approver> [--lines N] [--width N]');
  const change = loadChange(positional[0]);
  const diff = diffOf(change.commit);
  const diffText = diff.toString('utf8');
  const diffSha = sha256(diff);
  const maxLines = Number(flags.lines ?? 20);
  const width = Number(flags.width ?? 100);

  console.log(`approval request  ${change.id}  commit ${short(change.commit, 7)}  ${change.spec}  by ${change.author}`);
  console.log(`diff sha256 ${diffSha}`);
  const lines = diffText.replace(/\n$/, '').split('\n');
  for (const line of lines.slice(0, maxLines)) {
    console.log(`  ${line.length > width ? `${line.slice(0, width - 3)}...` : line}`);
  }
  if (lines.length > maxLines) console.log(`  ... ${lines.length - maxLines} more lines`);

  const code = bindingCode({ commit: change.commit, diff_sha256: diffSha });
  console.log(`binding code  ${code}`);
  const typed = await askHuman(code);
  if (typed !== code) {
    console.log(typed ? 'binding code does not match: nothing minted' : 'no human present: nothing minted');
    process.exitCode = 1;
    return;
  }

  const iat = Math.floor(Date.now() / 1000);
  const claims = {
    iss: APPROVAL.issuer,
    sub: flags.as,
    aud: APPROVAL.audience,
    jti: randomUUID(),
    iat,
    exp: iat + APPROVAL.maxAgeSeconds,
    amr: ['webauthn'],
    authorization_details: [{ type: 'repo:merge', change: change.id, commit: change.commit, diff_sha256: diffSha, spec: change.spec }],
  };
  const { privateKey } = keyPair(APPROVAL.issuer);
  const jwt = signJws(claims, privateKey, APPROVAL.issuer);
  // claims is a readable copy; the gateway verifies the jwt, never the copy.
  writeFileSync(paths.token, `${JSON.stringify({ jwt, claims }, null, 2)}\n`);
  console.log(`approved by ${claims.sub} (amr webauthn, mocked)`);
  console.log(`token  jti ${short(claims.jti)}  expires ${new Date(claims.exp * 1000).toISOString().slice(11, 19)}Z  bound to commit ${short(change.commit, 7)}, diff ${short(diffSha)}, ${change.spec}  -> ${relative(process.cwd(), paths.token)}`);
});
