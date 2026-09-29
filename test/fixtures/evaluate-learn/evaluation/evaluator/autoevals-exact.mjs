#!/usr/bin/env node
import fs from 'node:fs';
import { ExactMatch } from 'autoevals';

const { sealedBrief, observations } = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!sealedBrief || !Array.isArray(observations)) {
  throw new TypeError('expected sealedBrief and observations');
}

function selectStep(stepId) {
  const found = observations.filter((item) => item.observationId?.endsWith(`-${stepId}`));
  if (found.length !== 1) throw new Error(`expected one ${stepId} observation, received ${found.length}`);
  const entry = found[0];
  const result = entry.observation ?? entry;
  const stdout = typeof result.stdout === 'string' ? result.stdout : result.stdout?.value;
  const stderr = typeof result.stderr === 'string' ? result.stderr : result.stderr?.value;
  const exitCode = result.exitCode ?? result['exit-code'];
  if (typeof stdout !== 'string' || typeof stderr !== 'string' || !Number.isInteger(exitCode)) {
    throw new TypeError(`${stepId} observation lacks an expected channel`);
  }
  return { entry, stdout, stderr, exitCode };
}

async function judge({ stepId, key, channel, expected, expectedExitCode }) {
  const result = selectStep(stepId);
  const output = result[channel];
  const score = await ExactMatch({ output, expected });
  if (score.name !== 'ExactMatch' || (score.score !== 0 && score.score !== 1)) {
    throw new TypeError('unexpected autoevals ExactMatch result');
  }
  const passed = result.exitCode === expectedExitCode && score.score === 1 && (stepId !== 'reject-malformed' || result.stdout === '');
  if (passed) {
    return {
      key,
      outcome: 'pass',
      observationIds: [result.entry.observationId],
      comment: `Autoevals ExactMatch scored the complete ${channel} 1 and the CLI exited ${expectedExitCode}.`,
    };
  }
  let quoteChannel;
  let quote;
  if (result.exitCode !== expectedExitCode) {
    quoteChannel = 'exit-code';
    quote = String(result.exitCode);
  } else if (stepId === 'reject-malformed' && result.stdout !== '') {
    quoteChannel = 'stdout';
    quote = result.stdout;
  } else if (output !== '') {
    quoteChannel = channel;
    quote = output;
  } else {
    quoteChannel = 'exit-code';
    quote = String(result.exitCode);
  }
  return {
    key,
    outcome: 'fail',
    observationIds: [result.entry.observationId],
    quote,
    quoteChannel,
    confidence: 1,
    comment: `Autoevals ExactMatch scored the complete ${channel} ${score.score}; CLI exit code ${result.exitCode}; stdout ${JSON.stringify(result.stdout)}; stderr ${JSON.stringify(result.stderr)}.`,
  };
}

const rows = [
  await judge({ stepId: 'summarize', key: 'pantry-exact-summary', channel: 'stdout', expected: 'Summary for List pantry: apples, pears\n', expectedExitCode: 0 }),
  await judge({ stepId: 'reject-malformed', key: 'malformed-request-refusal', channel: 'stderr', expected: 'error: invalid list request\n', expectedExitCode: 2 }),
];
process.stdout.write(`${JSON.stringify({ rows })}\n`);
