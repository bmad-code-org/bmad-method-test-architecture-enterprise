#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
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
const argumentsOf = (call) => {
  try {
    return JSON.parse(call?.function?.arguments);
  } catch {
    return call?.function?.arguments;
  }
};
let quote = 'trajectory: ';
let mismatch = 'trajectory differs from the reference';
if (firstCall === undefined) {
  quote = quoted('"tool_calls":[]');
  mismatch = 'no tool call';
} else if (name !== referenceCall?.function?.name && name !== undefined) {
  quote = quoted(`"name":${JSON.stringify(name)}`);
  mismatch = `tool ${name}`;
} else if (!isDeepStrictEqual(argumentsOf(firstCall), argumentsOf(referenceCall))) {
  quote = quoted(`"arguments":${JSON.stringify(firstCall.function?.arguments)}`);
  mismatch = 'different tool arguments';
} else if (outputs.length > referenceOutputs.length) {
  quote = quoted(JSON.stringify(outputs[referenceOutputs.length]));
  mismatch = 'an additional trajectory message';
}
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
