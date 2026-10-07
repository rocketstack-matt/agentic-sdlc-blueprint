// propose.mjs <change.json>: summarise a change the way the gateway will see it.
import { label, loadArchitecture, loadChange, loadSpec, nodesTouched, parseArgs, run } from './lib.mjs';

run(async () => {
  const { positional } = parseArgs(process.argv.slice(2));
  if (!positional[0]) throw new Error('usage: node gateway/propose.mjs <change.json>');
  const change = loadChange(positional[0]);
  const spec = loadSpec(change.spec);
  const { arch } = loadArchitecture();
  const nodes = nodesTouched(arch, change.files);
  const lines = change.diffText.split('\n').filter(Boolean).length;

  console.log(label('change', `${change.id}  ${change.title ?? ''}`.trimEnd()));
  console.log(label('spec', `${spec.id} (${spec.status}${spec.nodes.length ? `, nodes ${spec.nodes.join(', ')}` : ''})`));
  console.log(label('author', change.author));
  console.log(label('commit', change.commit));
  change.files.forEach((file, i) => console.log(label(i === 0 ? 'files' : '', file)));
  console.log(label('nodes', nodes.length
    ? nodes.map((n) => `${n.id} (tier ${n.tier}, ${n.classification})`).join(', ')
    : 'none: no modelled node owns these files'));
  console.log(label('diff', `${change.diffPath}, ${lines} lines`));
  console.log(label('sha256', `${change.diff_sha256}`));
});
