/**
 * The deferred-declaration gate `test/eval-all.js` runs before anything else,
 * proved directly rather than only against today's manifest.
 *
 * WHY THIS FILE EXISTS
 *
 * `test/lib/suite-manifest.js`'s `unaccountedSkills` is what decides whether
 * `eval:all` exits 2 before running a single suite: a skill with neither a
 * behavioral suite nor a `deferred` entry is unaccounted, and the run refuses.
 * Nothing exercised that decision directly. The manifest's `deferred` array
 * happening to hold zero entries today would look identical to a bug that made
 * the check always pass, and a bug that made it always fail would look
 * identical to the array happening to hold at least one entry. Story 6.12
 * (empty the deferred array) is exactly the change that drives the array to
 * zero entries, so this is the case most likely to expose either bug, and
 * fixture manifests make both directions provable independent of the array's
 * size on any given day.
 *
 * Usage: node test/test-suite-manifest.js
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { unaccountedSkills, skillsOf } = require('./lib/suite-manifest');
const { teaSkills } = require('./lib/tea-skills');
const { validateSuiteManifest } = require('./schema/suite-manifest');
const { checkEvaluateAuthored } = require('../tools/validate-eval-schemas');
const { buildInvocations } = require('./eval-all');
const { validateEvalRun } = require('./schema/eval-result');

const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`  FAIL  ${name}`);
  }
}

function behavioralSuite(skill) {
  return { id: `${skill}-suite`, evalType: 'behavioral', skill };
}

function deferredEntry(skill) {
  return { skill, owner: 'TEA maintainers', missingEvidence: 'fixture', exitCondition: 'fixture' };
}

check('flags a skill with neither a behavioral suite nor a deferred entry', () => {
  const manifest = { deferred: [], suites: [behavioralSuite('bmad-tea')] };
  const unaccounted = unaccountedSkills(manifest, ['bmad-tea', 'bmad-testarch-framework']);
  assert.deepStrictEqual(unaccounted, ['bmad-testarch-framework']);
});

check('reports nothing when the deferred array is empty and every skill has a behavioral suite', () => {
  const manifest = {
    deferred: [],
    suites: [behavioralSuite('bmad-tea'), behavioralSuite('bmad-testarch-framework'), behavioralSuite('bmad-teach-me-testing')],
  };
  const unaccounted = unaccountedSkills(manifest, ['bmad-tea', 'bmad-testarch-framework', 'bmad-teach-me-testing']);
  assert.deepStrictEqual(unaccounted, []);
});

check('a deferred entry accounts for a skill with no behavioral suite', () => {
  const manifest = { deferred: [deferredEntry('bmad-testarch-framework')], suites: [behavioralSuite('bmad-tea')] };
  const unaccounted = unaccountedSkills(manifest, ['bmad-tea', 'bmad-testarch-framework']);
  assert.deepStrictEqual(unaccounted, []);
});

check('a fragment-selection-only entry does not account for a skill: routing evidence is not coverage', () => {
  const manifest = { deferred: [], suites: [{ id: 'fragment-selection', evalType: 'fragment-selection', skills: ['bmad-tea'] }] };
  const unaccounted = unaccountedSkills(manifest, ['bmad-tea']);
  assert.deepStrictEqual(unaccounted, ['bmad-tea']);
});

check('skillsOf falls back to an empty list for an infrastructure entry, not [undefined]', () => {
  assert.deepStrictEqual(skillsOf({ evalType: 'infrastructure' }), []);
});

const policy = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/evaluate/valid/policy/scoring-policy.json'), 'utf8'));
const authoredFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/evaluate/suite-manifest-authored.json'), 'utf8'));
const authoredSuite = authoredFixture.suites[0];

function evalSchemasFixture(manifest) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-authored-manifest-'));
  try {
    const fixturePath = path.join(folder, 'suite-manifest.json');
    fs.writeFileSync(fixturePath, JSON.stringify(manifest));
    return spawnSync('npm', ['run', 'test:eval-schemas', '--', '--fixture-manifest', fixturePath], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
    });
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

check('an Evaluate-authored entry alone accounts for a skill', () => {
  assert.strictEqual(validateSuiteManifest(authoredFixture).success, true);
  assert.deepStrictEqual(unaccountedSkills(authoredFixture, ['temp-skill']), []);
});

check('an Evaluate-authored entry excludes harness fields', () => {
  const manifest = { manifestVersion: 1, suites: [{ ...authoredSuite, harness: 'test/eval-atdd.js' }], deferred: [] };
  assert.strictEqual(validateSuiteManifest(manifest).success, false);
});

check('Evaluate-authored thresholds agree with evaluation and scoring policy', () => {
  const problems = [];
  checkEvaluateAuthored(authoredSuite, problems);
  assert.deepStrictEqual(problems, []);
  checkEvaluateAuthored({ ...authoredSuite, thresholds: { ...authoredSuite.thresholds, catchThreshold: 0 } }, problems);
  assert.match(problems.join('\n'), /catchThreshold/);
});

check('Evaluate-authored validation rejects null evaluation and policy documents', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-authored-docs-'));
  try {
    fs.mkdirSync(path.join(folder, 'policy'));
    fs.writeFileSync(path.join(folder, 'evaluation.json'), 'null\n');
    fs.writeFileSync(path.join(folder, 'policy', 'scoring-policy.json'), JSON.stringify(policy));
    const evaluationProblems = [];
    checkEvaluateAuthored({ ...authoredSuite, evaluation: 'evaluation.json' }, evaluationProblems, folder);
    assert.match(evaluationProblems.join('\n'), /evaluation .* must be a JSON object/);

    fs.writeFileSync(
      path.join(folder, 'evaluation.json'),
      fs.readFileSync(path.join(__dirname, 'fixtures/evaluate/valid/evaluation.json')),
    );
    fs.writeFileSync(path.join(folder, 'policy', 'scoring-policy.json'), 'null\n');
    const policyProblems = [];
    checkEvaluateAuthored({ ...authoredSuite, evaluation: 'evaluation.json' }, policyProblems, folder);
    assert.match(policyProblems.join('\n'), /scoring policy .* must be a JSON object/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

check('test:eval-schemas rejects threshold drift in a fixture manifest', () => {
  for (const key of ['trials', 'strengthFloor', 'catchThreshold', 'minimumTrialCount', 'severityFloor']) {
    const changed = structuredClone(authoredFixture);
    changed.suites[0].thresholds[key] =
      key === 'strengthFloor' ? { defect: 0 } : key === 'severityFloor' ? 'critical' : key === 'catchThreshold' ? 0 : 4;
    const result = evalSchemasFixture(changed);
    assert.strictEqual(result.status, 1, `${key}: ${result.stderr || result.stdout}`);
    assert.match(result.stderr, new RegExp(key));
  }
});

check('test:eval-schemas rejects invalid Evaluate-authored paths and documents', () => {
  const cases = [
    ['missing evaluation', 'test/fixtures/evaluate/valid/missing/evaluation.json', /cannot read evaluation/],
    ['missing scoring policy', 'test/fixtures/evaluate/preflight/evaluation.json', /cannot read scoring policy/],
    ['wrong evaluation suffix', 'test/fixtures/evaluate/valid/policy/scoring-policy.json', /must point at an evaluation\.json/],
    ['absolute evaluation path', '/tmp/evaluation.json', /repository-relative/],
    ['traversal evaluation path', '../evaluation.json', /repository-relative/],
  ];
  for (const [label, evaluation, expected] of cases) {
    const changed = structuredClone(authoredFixture);
    changed.suites[0].evaluation = evaluation;
    const result = evalSchemasFixture(changed);
    assert.strictEqual(result.status, 1, `${label}: ${result.stderr || result.stdout}`);
    assert.match(`${result.stderr}\n${result.stdout}`, expected);
  }
});

check('test:eval-schemas counts a skill covered only by Evaluate-authored entry', () => {
  const result = evalSchemasFixture(authoredFixture);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});

check('test:eval-schemas rejects both authoring paths for one named skill', () => {
  const liveManifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'evals/suite-manifest.json'), 'utf8'));
  const base = liveManifest.suites.find((entry) => entry.evalType === 'behavioral' && entry.skill);
  assert.ok(base, 'the live manifest needs a behavioral entry for this fixture');
  const behavioral = { ...base, id: 'temp-behavioral', skill: 'temp-skill' };
  const result = evalSchemasFixture({ ...authoredFixture, suites: [authoredSuite, behavioral] });
  assert.strictEqual(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stderr, /temp-skill: has both behavioral and Evaluate-authored suites \(AD-14\)/);
});

check('eval:all skips Evaluate-authored suites', () => {
  const invocations = buildInvocations(
    { agents: ['custom'], workflows: [], agentArgs: [], envPass: [], preflightOnly: true, agentCmd: process.execPath },
    { suites: [authoredSuite] },
  );
  assert.deepStrictEqual(invocations, []);
});

check('eval:all records skipped IDs when the manifest contains only Evaluate-authored suites', () => {
  const repoRoot = path.join(__dirname, '..');
  const manifestFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-eval-all-summary-'));
  const manifestPath = path.join(manifestFolder, 'suite-manifest.json');
  const outputPath = path.join(manifestFolder, 'run.json');
  const manifest = {
    manifestVersion: 1,
    suites: [authoredSuite],
    deferred: teaSkills(repoRoot).map((skill) => ({
      skill,
      owner: 'test',
      missingEvidence: 'fixture-only coverage test',
      exitCondition: 'Story 1.16 supplies the authored suite',
    })),
  };
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = spawnSync(
      process.execPath,
      ['test/eval-all.js', '--agent', 'custom', '--agent-cmd', process.execPath, '--preflight-only', '--json', outputPath],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, TEA_EVAL_MANIFEST_PATH: manifestPath },
      },
    );
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.deepStrictEqual(summary.skippedSuiteIds, [authoredSuite.id]);
    assert.strictEqual(validateEvalRun(summary).success, true);
  } finally {
    fs.rmSync(manifestFolder, { recursive: true, force: true });
  }
});

if (failures.length > 0) {
  console.error('\nSuite manifest declaration-gate validation failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('The deferred-declaration gate fails on an unaccounted skill and passes when the deferred array is empty.');
