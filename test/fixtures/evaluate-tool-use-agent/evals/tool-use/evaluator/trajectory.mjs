#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTrajectoryMatchEvaluator } from 'agentevals';

const directory = path.dirname(fileURLToPath(import.meta.url));
const referenceOutputs = JSON.parse(fs.readFileSync(path.join(directory, 'reference', 'weather.json'), 'utf8'));
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const observation = input.observations.find(
  (candidate) => candidate.stdout?.kind === 'text' && candidate.stdout.value.startsWith('trajectory: '),
);
if (observation === undefined) throw new Error('the calling agent supplied no stdout trajectory');

const stdout = observation.stdout.value;
const outputs = JSON.parse(stdout.slice('trajectory: '.length));
const result = await createTrajectoryMatchEvaluator({ trajectoryMatchMode: 'strict', toolArgsMatchMode: 'exact' })({
  outputs,
  referenceOutputs,
});
const firstCall = outputs.find((message) => message.role === 'assistant')?.tool_calls?.[0];
const referenceCall = referenceOutputs.find((message) => message.role === 'assistant')?.tool_calls?.[0];
const name = firstCall?.function?.name;
const quoted = (candidate) => (stdout.includes(candidate) ? candidate : 'trajectory: ');
const quote = firstCall === undefined
  ? quoted('"tool_calls":[]')
  : name !== referenceCall?.function?.name
    ? quoted(`"name":${JSON.stringify(name)}`)
    : quoted(`"arguments":${JSON.stringify(firstCall.function?.arguments)}`);
const mismatch = firstCall === undefined ? 'no tool call' : name !== referenceCall?.function?.name ? `tool ${name}` : 'different tool arguments';
const row = result.score
  ? { key: result.key, outcome: 'pass', observationIds: [observation.observationId], comment: result.comment ?? 'The trajectory strictly matches the reference.' }
  : {
      key: result.key,
      outcome: 'fail',
      observationIds: [observation.observationId],
      quote,
      quoteChannel: 'stdout',
      confidence: 1,
      comment: `AgentEvals strict trajectory match failed: ${mismatch}.`,
    };
const rows = [row];
if (process.argv.includes('--numeric') || process.argv.includes('--off-scale')) {
  const scored = { ...result, score: process.argv.includes('--off-scale') ? 4 : result.score ? 3 : 1 };
  rows.push({
    key: 'trajectory-quality',
    outcome: 'score',
    score: scored.score,
    observationIds: [observation.observationId],
    comment: scored.comment ?? 'AgentEvals strict trajectory result on the anchored quality scale.',
  });
}
process.stdout.write(`${JSON.stringify({ rows })}\n`);
