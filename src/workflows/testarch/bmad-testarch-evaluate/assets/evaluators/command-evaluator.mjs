#!/usr/bin/env node

// Copy into evaluator/ and set evaluation.json.evaluator to
// { "kind": "command", "command": "evaluator/command-evaluator.mjs", "timeoutMs": 30000 }.
// Replace judge() with an oracle-specific check or a framework call.
import fs from 'node:fs';

const { sealedBrief, observations } = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!sealedBrief || !Array.isArray(observations)) throw new Error('expected sealedBrief and observations');

function judge() {
  throw new Error('implement a known-pass and known-fail judgment before running this evaluator');
}

// Select an observation and evidence channel in judge() for the oracle at hand.
// Stdout, stderr, HTTP and MCP responses, exit codes, and artifacts can each
// support a different oracle. The observation ID must name the selected input.
const result = await judge({ sealedBrief, observations });
if (typeof result?.passed !== 'boolean' || typeof result.observationId !== 'string' || typeof result.comment !== 'string') {
  throw new TypeError('judge must return { passed, observationId, comment, quote?, quoteChannel?, artifactId? }');
}
if (!observations.some((item) => item.observationId === result.observationId)) {
  throw new Error('judge cited an observation outside this trial');
}
if (!result.passed && (typeof result.quote !== 'string' || !result.quote || typeof result.quoteChannel !== 'string')) {
  throw new Error('a failed judgment needs a verbatim quote and its observation channel');
}
if (!result.passed && result.quoteChannel === 'artifact' && typeof result.artifactId !== 'string') {
  throw new Error('an artifact quote needs its artifactId');
}

const row = result.passed
  ? { key: 'example-oracle', outcome: 'pass', observationIds: [result.observationId], comment: result.comment }
  : {
      key: 'example-oracle',
      outcome: 'fail',
      observationIds: [result.observationId],
      quote: result.quote,
      quoteChannel: result.quoteChannel,
      ...(result.quoteChannel === 'artifact' ? { artifactId: result.artifactId } : {}),
      confidence: 1,
      comment: result.comment,
    };
process.stdout.write(`${JSON.stringify({ rows: [row] })}\n`);
