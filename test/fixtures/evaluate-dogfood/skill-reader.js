#!/usr/bin/env node
/**
 * A deterministic stand-in for `tea-skill-runner` in the replay of the dogfood evaluation (Story 1.46): it answers each
 * request the way a perfect reader of the skill would, from the bytes of the guides in the workspace it runs in, so a
 * guide a mutation edited changes the answer and a guide left alone gives the committed one. It takes the runner's
 * command line (`--skill-root`, `--agent-arg=--json-schema=<schema>`, the prompt on stdin) and prints one JSON object.
 *
 * What it reads: the exit table of `references/gaps.md` and the sentence of `references/inspection.md` that states the
 * web-application rule. It reads nothing else, so it stands in for the model on exactly the four questions the
 * evaluation asks, and an unrecognized request is a refusal, as a model's reading of a request that names nothing is.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const skillRootIndex = process.argv.indexOf('--skill-root');
const skillRoot = path.resolve(process.cwd(), skillRootIndex === -1 ? '.' : process.argv[skillRootIndex + 1]);
// The runner's `--agent-arg` takes the agent's own flag, spelled `--agent-arg value` or `--agent-arg=value`.
const agentArguments = process.argv.flatMap((argument, index, all) =>
  argument === '--agent-arg' ? [all[index + 1]] : argument.startsWith('--agent-arg=') ? [argument.slice('--agent-arg='.length)] : [],
);
const schema = JSON.parse(agentArguments.find((argument) => argument.startsWith('--json-schema=')).slice('--json-schema='.length));
const properties = new Set(Object.keys(schema.properties));
const prompt = fs.readFileSync(0, 'utf8');

const guide = (name) => fs.readFileSync(path.join(skillRoot, 'references', name), 'utf8');
const heading = '## Map AD-10 exits and classes to repairs';

/** The exit table's rows, in table order, as `{ id, class }`. */
function exitTable() {
  const gaps = guide('gaps.md');
  const start = gaps.indexOf(heading);
  const end = gaps.indexOf('\n## ', start + heading.length);
  return gaps
    .slice(start, end === -1 ? undefined : end)
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .map(([id, cls]) => ({ id: id.replaceAll('`', ''), class: cls }));
}

const classOf = (id) => exitTable().find((row) => row.id === id)?.class;
const exitsNamed = [...prompt.matchAll(/exited (\d+)/g)].map((match) => Number(match[1]));
const reply = { basis: 'read from the guides in this workspace' };

if (properties.has('exits')) {
  reply.status = 'answered';
  reply.exits = exitTable();
} else if (properties.has('targetKind')) {
  const rule = /A web application is an `([a-z-]+)` target reached as `([a-z]+)`/.exec(guide('inspection.md'));
  reply.status = 'answered';
  reply.targetKind = rule?.[1] ?? 'unknown';
  reply.interface = rule?.[2] ?? 'unknown';
} else if (properties.has('exit11')) {
  reply.status = 'answered';
  reply.exit11 = classOf(`tea-evaluate ${exitsNamed[0]}`);
  reply.exit12 = classOf(`tea-evaluate ${exitsNamed[1]}`);
} else if (exitsNamed.length === 1 && properties.has('class') && !properties.has('status')) {
  reply.class = classOf(`tea-evaluate ${exitsNamed[0]}`);
} else {
  reply.status = 'refused';
}

process.stdout.write(`${JSON.stringify(reply)}\n`);
