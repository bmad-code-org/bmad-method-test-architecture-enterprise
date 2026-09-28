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

const observation = observations.find((item) => item.stdout?.kind === 'text');
if (!observation) throw new Error('the oracle needs an observed stdout channel');
const result = await judge({ sealedBrief, observations, observation });
if (typeof result?.passed !== 'boolean') throw new Error('judge must return { passed, comment, quote? }');

const row = result.passed
  ? { key: 'example-oracle', outcome: 'pass', observationIds: [observation.observationId], comment: result.comment }
  : {
      key: 'example-oracle',
      outcome: 'fail',
      observationIds: [observation.observationId],
      quote: result.quote,
      quoteChannel: 'stdout',
      confidence: 1,
      comment: result.comment,
    };
process.stdout.write(`${JSON.stringify({ rows: [row] })}\n`);
