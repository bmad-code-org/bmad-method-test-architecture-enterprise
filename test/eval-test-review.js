/**
 * test-review eval harness.
 *
 * The workflow's quality has been asserted rather than measured. This measures it,
 * against a fixture corpus with known ground truth, and reports three numbers per
 * vendor:
 *
 *   recall     — planted defects the reviewer named, at the right line
 *   precision  — of everything it reported, how much was real (1 - false-positive rate)
 *   variance   — spread of the quality score across repeated runs of IDENTICAL input
 *
 * The third number is the one nobody had. Two reviewers scoring the same four files
 * 82 and 85 tells you the spread across vendors; it says nothing about whether one
 * vendor returns 82 twice. A gate whose verdict moves on re-run is not a gate, and
 * you cannot know that from a single run.
 *
 * Precision is measured on the same corpus as recall on purpose. A reviewer that
 * reports every possible finding scores perfect recall and is useless, so the clean
 * fixture is not optional and its violations count against the score.
 *
 * Usage:
 *   node test/eval-test-review.js --agent codex --runs 3
 *   node test/eval-test-review.js --agent claude --agent codex --runs 5
 *   node test/eval-test-review.js --preflight-only
 *
 * Exit codes:
 *   0  every requested vendor met the thresholds
 *   1  a vendor missed a threshold (a real result, reported)
 *   2  the environment could not run the eval (nothing was measured)
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'test-review-eval');
const GROUND_TRUTH = path.join(FIXTURE_ROOT, 'ground-truth.json');
const CLI = path.join(__dirname, '..', 'cli', 'test-review.js');

/**
 * Thresholds. Deliberately conservative: this harness exists to detect regression
 * and vendor drift, so a bar nobody can clear teaches nothing and a bar everyone
 * clears teaches nothing either. Raise them as the rubric tightens.
 */
const THRESHOLDS = {
  criticalRecall: 1, // every CRITICAL row must be found. A missed .skip is the whole failure mode.
  recall: 0.7,
  precision: 0.8,
  maxScoreStdev: 3, // a wider spread than one MEDIUM violation means the score is not reproducible
};

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  cyan: '[36m',
  dim: '[2m',
};

function parseArgs(argv) {
  const agents = [];
  let runs = 3;
  let preflightOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--agent': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--agent requires a vendor name');
        agents.push(value);
        index += 1;
        break;
      }
      case '--runs': {
        runs = Number.parseInt(argv[index + 1] ?? '', 10);
        if (!Number.isInteger(runs) || runs < 1) fatal(2, '--runs requires a positive integer');
        index += 1;
        break;
      }
      case '--preflight-only': {
        preflightOnly = true;
        break;
      }
      default: {
        fatal(2, `unknown argument: ${arg}`);
      }
    }
  }
  if (agents.length === 0) agents.push('codex');
  // Variance across one run is not a number. Say so rather than printing 0.
  if (runs < 2 && !preflightOnly) {
    console.error(`${colors.yellow}note${colors.reset}: --runs ${runs} cannot measure variance; use --runs 2 or more.`);
  }
  return { agents, runs, preflightOnly };
}

function fatal(code, message) {
  console.error(`${colors.red}eval: ${message}${colors.reset}`);
  process.exit(code);
}

/**
 * Bounded pre-flight. For a skill the environment IS repo state plus tool
 * availability, and that is where every unintended defect in the earlier
 * experiment rounds lived. Without this, a missing credential reports as 0% recall
 * and reads as "the reviewer found nothing", which is the most expensive possible
 * way to be wrong about your own tool.
 */
function preflight(agents) {
  const problems = [];

  if (!fs.existsSync(CLI)) problems.push(`CLI not found at ${CLI}`);
  if (!fs.existsSync(GROUND_TRUTH)) problems.push(`ground truth not found at ${GROUND_TRUTH}`);

  let groundTruth = null;
  if (fs.existsSync(GROUND_TRUTH)) {
    try {
      groundTruth = JSON.parse(fs.readFileSync(GROUND_TRUTH, 'utf8'));
    } catch (error) {
      problems.push(`ground truth is not valid JSON: ${error.message}`);
    }
  }

  // Every fixture the manifest names must exist, and every line it cites must be
  // inside the file. A manifest pointing past the end of a fixture scores recall
  // against nothing and always reports a miss.
  for (const entry of groundTruth?.files ?? []) {
    const absolute = path.join(FIXTURE_ROOT, entry.path);
    if (!fs.existsSync(absolute)) {
      problems.push(`fixture missing: ${entry.path}`);
      continue;
    }
    const lineCount = fs.readFileSync(absolute, 'utf8').split('\n').length;
    for (const planted of entry.planted ?? []) {
      if (planted.line > lineCount) {
        problems.push(`${entry.path}: ground truth cites line ${planted.line}, file has ${lineCount}`);
      }
    }
  }

  const credentialFor = { codex: 'OPENAI_API_KEY', claude: 'ANTHROPIC_API_KEY' };
  for (const agent of agents) {
    const probe = spawnSync(agent, ['--version'], { encoding: 'utf8' });
    if (probe.error) problems.push(`vendor CLI "${agent}" is not on PATH (${probe.error.code})`);
    const variable = credentialFor[agent];
    if (variable && !process.env[variable]) problems.push(`${agent} needs ${variable} in the environment`);
  }

  if (problems.length > 0) {
    console.error(`${colors.red}eval pre-flight failed; nothing was measured:${colors.reset}`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(`\n${colors.dim}A failed pre-flight is exit 2, never a 0% score.${colors.reset}`);
    process.exit(2);
  }

  console.log(`${colors.green}✓${colors.reset} pre-flight: CLI, fixtures, ground truth, and ${agents.length} vendor credential(s) present`);
  return groundTruth;
}

/** One review of the whole fixture corpus. Returns the parsed verdict, or null. */
function runReview(agent, runIndex) {
  const jsonPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tea-eval-')), 'verdict.json');
  const reviewFiles = ['seeded/checkout.spec.ts', 'seeded/orders.service.spec.ts', 'clean/profile.spec.ts'].map((relative) =>
    path.join(FIXTURE_ROOT, relative),
  );

  // No --fail-on override: the enum is request-changes|block, so there is no "never".
  // A verdict failure exits 1 and still writes the verdict, which is all this needs;
  // the harness reads the JSON regardless of exit code and only treats a MISSING
  // verdict as a failed run.
  const result = spawnSync(process.execPath, [CLI, '--agent', agent, '--files', reviewFiles.join(','), '--json', jsonPath], {
    encoding: 'utf8',
    cwd: path.join(__dirname, '..'),
  });

  if (!fs.existsSync(jsonPath)) {
    console.error(`  ${colors.red}run ${runIndex + 1}: no verdict written${colors.reset} (exit ${result.status})`);
    if (result.stderr) console.error(`  ${colors.dim}${result.stderr.trim().split('\n').slice(-3).join('\n  ')}${colors.reset}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (error) {
    console.error(`  ${colors.red}run ${runIndex + 1}: verdict is not valid JSON: ${error.message}${colors.reset}`);
    return null;
  }
}

/**
 * Score one verdict against ground truth.
 *
 * A planted defect counts as found when a reported violation cites the same
 * registry row within lineTolerance of the planted line. Matching on the row is
 * what makes this comparable across vendors: prose descriptions of the same defect
 * differ, row identities do not.
 */
function scoreVerdict(verdict, groundTruth) {
  const tolerance = groundTruth.lineTolerance ?? 0;
  const reported = (verdict.violations ?? verdict.allViolations ?? []).filter(Boolean);
  const cleanPaths = new Set((groundTruth.files ?? []).filter((f) => (f.planted ?? []).length === 0).map((f) => f.path));

  const planted = [];
  for (const entry of groundTruth.files ?? []) {
    for (const item of entry.planted ?? []) planted.push({ ...item, path: entry.path });
  }

  const matched = new Set();
  const hits = planted.filter((expected) => {
    const found = reported.find((actual, actualIndex) => {
      if (matched.has(actualIndex)) return false;
      const samePath = String(actual.file ?? '').endsWith(path.basename(expected.path));
      const sameRow = String(actual.row ?? '').toUpperCase() === expected.row;
      const closeEnough = Math.abs(Number(actual.line ?? -1) - expected.line) <= tolerance;
      if (samePath && sameRow && closeEnough) {
        matched.add(actualIndex);
        return true;
      }
      return false;
    });
    return Boolean(found);
  });

  // Two different things, kept apart on purpose.
  //
  // A violation against the clean fixture is a definite false positive: that file
  // has no defects by construction, so anything reported there is invented.
  //
  // A violation on a SEEDED fixture that matched no planted row is unattributed, not
  // necessarily wrong. A fixture can carry an incidental real defect nobody planted.
  // Folding those into the false-positive count would punish a reviewer for being
  // right about something the manifest failed to anticipate, so they are reported
  // separately and precision is computed from the definite ones.
  const isCleanFixture = (file) => [...cleanPaths].some((clean) => String(file).endsWith(path.basename(clean)));

  const falsePositives = reported.filter((actual, actualIndex) => !matched.has(actualIndex) && isCleanFixture(actual.file));
  const unattributed = reported.filter((actual, actualIndex) => !matched.has(actualIndex) && !isCleanFixture(actual.file));

  const criticalPlanted = planted.filter((p) => p.row.startsWith('C'));
  const criticalHits = hits.filter((p) => p.row.startsWith('C'));

  return {
    score: Number(verdict.qualityScore ?? Number.NaN),
    recommendation: verdict.recommendation ?? 'n/a',
    planted: planted.length,
    hits: hits.length,
    misses: planted.filter((p) => !hits.includes(p)),
    criticalPlanted: criticalPlanted.length,
    criticalHits: criticalHits.length,
    reported: reported.length,
    falsePositives: falsePositives.length,
    unattributed: unattributed.length,
  };
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const stdev = (values) => {
  if (values.length < 2) return Number.NaN;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};
const ratio = (numerator, denominator) => (denominator === 0 ? Number.NaN : numerator / denominator);
const pct = (value) => (Number.isNaN(value) ? '  n/a' : `${(value * 100).toFixed(0).padStart(3)}%`);

function main() {
  const { agents, runs, preflightOnly } = parseArgs(process.argv.slice(2));

  console.log(`${colors.cyan}========================================`);
  console.log('tea-test-review eval harness');
  console.log(`========================================${colors.reset}\n`);

  const groundTruth = preflight(agents);
  if (preflightOnly) {
    console.log(`\n${colors.green}pre-flight only; nothing measured.${colors.reset}`);
    process.exit(0);
  }

  const plantedTotal = (groundTruth.files ?? []).reduce((sum, file) => sum + (file.planted ?? []).length, 0);
  console.log(
    `${colors.dim}corpus: ${groundTruth.files.length} fixtures, ${plantedTotal} planted defects, ${runs} run(s) per vendor${colors.reset}\n`,
  );

  let anyBelowThreshold = false;

  for (const agent of agents) {
    console.log(`${colors.cyan}${agent}${colors.reset}`);
    const results = [];
    for (let runIndex = 0; runIndex < runs; runIndex += 1) {
      const verdict = runReview(agent, runIndex);
      if (!verdict) continue;
      const scored = scoreVerdict(verdict, groundTruth);
      results.push(scored);
      console.log(
        `  run ${runIndex + 1}: score ${scored.score}, ${scored.recommendation}, ` +
          `recall ${scored.hits}/${scored.planted}, false positives ${scored.falsePositives}, unattributed ${scored.unattributed}`,
      );
    }

    if (results.length === 0) {
      console.error(`  ${colors.red}no successful runs; cannot report numbers for ${agent}${colors.reset}\n`);
      anyBelowThreshold = true;
      continue;
    }

    const recall = mean(results.map((r) => ratio(r.hits, r.planted)));
    const criticalRecall = mean(results.map((r) => ratio(r.criticalHits, r.criticalPlanted)));
    const precision = mean(results.map((r) => ratio(r.reported - r.falsePositives, r.reported)));
    const scoreSpread = stdev(results.map((r) => r.score));
    const verdicts = new Set(results.map((r) => r.recommendation));

    console.log(`  ${colors.dim}────────${colors.reset}`);
    console.log(`  recall            ${pct(recall)}   (threshold ${pct(THRESHOLDS.recall)})`);
    console.log(`  CRITICAL recall   ${pct(criticalRecall)}   (threshold ${pct(THRESHOLDS.criticalRecall)})`);
    console.log(`  precision         ${pct(precision)}   (threshold ${pct(THRESHOLDS.precision)}, clean-fixture false positives only)`);
    console.log(
      `  unattributed      ${mean(results.map((r) => r.unattributed))
        .toFixed(1)
        .padStart(
          5,
        )}   ${colors.dim}findings on seeded fixtures matching no planted row; review these by hand, they may be real${colors.reset}`,
    );
    console.log(
      `  score stdev       ${Number.isNaN(scoreSpread) ? ' n/a' : scoreSpread.toFixed(2).padStart(5)}   (max ${THRESHOLDS.maxScoreStdev})`,
    );
    console.log(
      `  verdict stability ${verdicts.size === 1 ? `${colors.green}stable${colors.reset}` : `${colors.red}${verdicts.size} different verdicts on identical input${colors.reset}`}`,
    );

    const missed = results[0].misses;
    if (missed.length > 0) {
      console.log(`  ${colors.yellow}missed on run 1:${colors.reset}`);
      for (const miss of missed) console.log(`    ${miss.row} ${miss.path}:${miss.line} — ${miss.what}`);
    }

    const failures = [];
    if (criticalRecall < THRESHOLDS.criticalRecall) failures.push('CRITICAL recall');
    if (recall < THRESHOLDS.recall) failures.push('recall');
    if (precision < THRESHOLDS.precision) failures.push('precision');
    if (!Number.isNaN(scoreSpread) && scoreSpread > THRESHOLDS.maxScoreStdev) failures.push('score variance');
    if (verdicts.size > 1) failures.push('verdict stability');

    if (failures.length > 0) {
      anyBelowThreshold = true;
      console.log(`  ${colors.red}below threshold: ${failures.join(', ')}${colors.reset}\n`);
    } else {
      console.log(`  ${colors.green}all thresholds met${colors.reset}\n`);
    }
  }

  process.exit(anyBelowThreshold ? 1 : 0);
}

main();
