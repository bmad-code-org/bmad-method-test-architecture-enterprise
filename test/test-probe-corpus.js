/**
 * The scoring half of `eval-quality`, run end to end with no model call.
 *
 * `npm run test:probe-targets` proves TEA's commands reach the environment-probe
 * port. This proves the rest of the chain: every probe in every corpus parses
 * against the schema `eval-quality` publishes for it, `runPreflight` plans and
 * reduces each probe's legs, `runScore` returns a verdict and a contract-strength
 * vector, `seal` produces a brief, and every artifact the chain mints validates.
 *
 * The evidence is the outputs `test/replay/` already stores, answered through a
 * port that reads them off disk, so this needs no credential and makes no paid
 * call. The live half is `npm run eval:preflight` and `npm run eval:contract-strength`,
 * which run the same code against the real command-line adapter.
 *
 * WHAT THE BASELINE IS FOR
 *
 * `test/probes/expected-strength.json` records what each probe scores today,
 * including the ones nothing can score yet. Two blockers are recorded rather than
 * avoided: a defect probe cannot declare a manifestation witness against a
 * command, so its pre-flight fails, and a defect signature cannot address a file
 * a command wrote, so a probe carrying one is refused by the qualification gate.
 * tools/generate-probes.js states both in full. A baseline is what makes the day
 * either of them closes visible instead of silent, so movement in either
 * direction fails this check until somebody has read why and regenerated it.
 *
 * Usage:
 *   node test/test-probe-corpus.js
 *   node test/test-probe-corpus.js --write   # regenerate the baseline
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const prettier = require('prettier');

const { validateArtifact } = require('./lib/eval-quality-inputs');
const { runSuite, storedProbePort, suites } = require('./lib/probe-scoring');

const BASELINE_PATH = path.join(__dirname, 'probes', 'expected-strength.json');

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
};

/** The distinct reasons a ladder gave, with the oracle identifiers folded out so the baseline reads as a shape. */
function basisShapes(basis) {
  return [...new Set(basis.map((line) => line.replaceAll(/oracle O-\d+/g, 'oracle'))).values()].sort();
}

/** One probe's result, small enough to read in a diff and complete enough to notice a change. */
function probeSummary(entry) {
  const failedChecks = entry.preflight.checks.filter((check) => check.outcome === 'failed').map((check) => check.kind);
  return {
    probeClass: entry.probe.probeClass,
    expectedClean: entry.probe.expectedClean,
    behaviorId: entry.probe.behaviorId,
    preflight: entry.preflight.passed ? 'passed' : `failed: ${[...new Set(failedChecks)].sort().join(', ')}`,
    verdict: entry.result.ladder.verdict,
    exitCode: entry.result.ladder.exitCode,
    basis: basisShapes(entry.result.ladder.basis),
    strength: entry.result.artifact?.strength?.vector ?? null,
  };
}

function suiteSummary(outcome) {
  const gaps = outcome.scored
    .map((entry) => entry.result.artifact)
    .filter(Boolean)
    .flatMap((artifact) => artifact.coverageGaps.filter((gap) => !gap.satisfied).map((gap) => gap.rule));
  return {
    contractId: outcome.suite.contract.contractId,
    probeCount: outcome.scored.length,
    strength: outcome.strength,
    unsatisfiedCoverageRules: [...new Set(gaps)].sort(),
    probes: Object.fromEntries(outcome.scored.map((entry) => [entry.probe.probeId, probeSummary(entry)])),
  };
}

async function main() {
  const write = process.argv.slice(2).includes('--write');
  const signal = AbortSignal.timeout(600_000);
  const problems = [];
  const summary = {};

  console.log('\nprobe corpora scored through eval-quality, against stored evidence\n');

  for (const suite of suites()) {
    for (const probe of suite.probes) {
      for (const message of validateArtifact('probe', probe)) {
        problems.push(`${suite.id} ${probe.probeId}: Probe${message}`);
      }
    }

    const outcome = await runSuite(suite, { port: storedProbePort(suite), runId: 'replay', modelSnapshot: 'stored-replay', signal });
    for (const entry of outcome.scored) {
      for (const message of entry.schemaProblems) problems.push(`${suite.id} ${entry.probe.probeId}: ${message}`);
      for (const message of entry.preflightProblems) problems.push(`${suite.id} ${entry.probe.probeId}: PreflightVerdict${message}`);
    }
    for (const message of outcome.sealed.schemaProblems) problems.push(`${suite.id}: SealedEvaluatorBrief${message}`);

    summary[suite.id] = suiteSummary(outcome);
    const vector = outcome.strength;
    const rate = (entry) => (entry === null || entry.rate === null ? '  -  ' : `${(entry.rate * 100).toFixed(0).padStart(3)}%`);
    console.log(
      `  ${suite.id.padEnd(42)} ${outcome.scored.length} probe(s)  defect ${rate(vector.defect)}  gameability ${rate(vector.gameability)}  zero-action ${rate(vector['zero-action'])}`,
    );
  }

  // Through Prettier with this repository's own config, because test/probes/ is
  // not in .prettierignore and `npm run format:check` is part of the same gate.
  const prettierConfig = await prettier.resolveConfig(BASELINE_PATH);
  const rendered = await prettier.format(`${JSON.stringify(summary, null, 2)}\n`, {
    ...prettierConfig,
    parser: 'json',
    filepath: BASELINE_PATH,
  });
  if (write) {
    fs.writeFileSync(BASELINE_PATH, rendered, 'utf8');
    console.log(`\n${colors.green}wrote${colors.reset} test/probes/expected-strength.json`);
  } else if (fs.existsSync(BASELINE_PATH)) {
    const onDisk = fs.readFileSync(BASELINE_PATH, 'utf8');
    if (onDisk !== rendered) {
      const expected = onDisk.split('\n');
      const actual = rendered.split('\n');
      const index = expected.findIndex((line, position) => line !== actual[position]);
      problems.push(
        `test/probes/expected-strength.json is out of date, first at line ${index + 1}\n` +
          `     recorded: ${(expected[index] ?? '(end of file)').trim()}\n` +
          `     measured: ${(actual[index] ?? '(end of file)').trim()}`,
      );
    }
  } else {
    problems.push('test/probes/expected-strength.json is missing; regenerate it with --write');
  }

  if (problems.length > 0) {
    console.error(`\n${colors.red}${problems.length} problem(s):${colors.reset}`);
    for (const problem of problems) console.error(`   ${problem}`);
    console.error(
      `\n${colors.dim}A score that moved is a finding. Read why before regenerating with: node test/test-probe-corpus.js --write${colors.reset}`,
    );
    return 1;
  }

  console.log(`\n${colors.green}every probe scored and every artifact matched its published schema${colors.reset}\n`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`${colors.red}probe corpus scoring could not run:${colors.reset} ${error.stack ?? error}`);
    process.exit(2);
  });
