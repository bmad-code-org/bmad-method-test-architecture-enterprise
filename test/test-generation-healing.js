/**
 * Deterministic execution witnesses for generated-test healing, plus guards on
 * the installed instruction resource's Create-only callers and default config.
 * The one fixture repair below is controlled test setup. Live skill captures
 * prove agent behavior separately; this suite proves the seeded failure and
 * corrected result are real, assertions/SUT are preserved, and red executes.
 *
 * Usage: node test/test-generation-healing.js
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { parse: parseToml } = require('smol-toml');
const yaml = require('yaml');
const { readGenerationEvidence, extract } = require('./lib/generation-evidence');
const { resolvePlaywrightCli } = require('../cli/atdd-red-check');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'test-generation-healing');
const SKILL = path.join(ROOT, 'skills', 'bmad-testarch-automate');
const LIVE_CAPTURE = path.join(__dirname, 'results', 'test-generation-healing');
const DEPENDENCIES = path.join(ROOT, 'node_modules');
const CLI = resolvePlaywrightCli([ROOT]);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-generation-healing-'));
let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
  console.log(`✓ ${message}`);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function captureBytes(file) {
  return readGenerationEvidence(path.relative(LIVE_CAPTURE, file).split(path.sep).join('/'));
}

function captureText(file) {
  return captureBytes(file).toString('utf8');
}

function staged(name) {
  const project = path.join(scratch, name);
  fs.cpSync(FIXTURE, project, { recursive: true });
  fs.symlinkSync(DEPENDENCIES, path.join(project, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  return project;
}

function runExpand(project, relativeFile, round) {
  const reportPath = path.join(project, 'test-results', `${round}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const result = spawnSync(process.execPath, [CLI, 'test', relativeFile, '--reporter=json'], {
    cwd: project,
    env: {
      PATH: process.env.PATH ?? '',
      PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
      PWTEST_CACHE_DIR: path.join(project, '.cache', round),
      FORCE_COLOR: '0',
      CI: '',
    },
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, `runner was killed: ${result.signal}`);
  assert.ok(fs.existsSync(reportPath), result.stderr || result.stdout);
  return { exit: result.status, report: JSON.parse(read(reportPath)) };
}

function stripAnsi(value) {
  // eslint-disable-next-line no-control-regex -- Playwright colors assertion diffs in JSON
  return String(value).replaceAll(/\u001B\[[0-9;]*m/g, '');
}

function leaves(report) {
  const results = [];
  function walk(suite) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) results.push({ title: spec.title, ...test.results?.at(-1) });
    }
    for (const child of suite.suites ?? []) walk(child);
  }
  for (const suite of report.suites ?? []) walk(suite);
  return results;
}

function guardInstructions() {
  const resource = read(path.join(SKILL, 'resources', 'run-and-heal.md'));
  const questions = parseToml(read(path.join(ROOT, 'skills', 'bmod-tea', 'bmod.toml'))).bmod.config_questions;
  for (const [key, expected] of Object.entries({
    auto_validate: 'true',
    auto_heal_failures: 'true',
    max_healing_iterations: '3',
    use_mcp_healing: 'true',
  })) {
    const entries = questions.filter((question) => question.key === key);
    check(entries.length === 1 && entries[0].default === expected, `${key} is declared once with default ${expected}`);
    check(resource.includes(`\`${key}\``) && resource.includes('modules.tea'), `${key} is resolved by the shared run-and-heal resource`);
  }
  for (const phrase of [
    'Validate and Edit never execute this loop or repair tests',
    'at most three repair rounds',
    'Persist the incremented round count before edits',
    'A correctly failing acceptance test is complete and receives no repair',
    'Never replace the real SUT with a mock',
    'Never introduce `test.fixme()`',
    'disposable copy of the project',
    'syntax/import/setup',
    'could not measure',
    'Prefer `tea-atdd-red-check` when it is available and compatible',
    'a skill-only installation may contain no CLI',
    "Derive its `--per-file-timeout-ms` from the project's existing execution budget",
    'default 15 seconds must not truncate',
    'Use the project-native runner when the verifier is unavailable or incompatible',
    'original config and environment',
    "Activate only this run's generated leaf scaffolds",
    "Isolate each generated file's execution",
    'Missing, interrupted, timed-out or skipped results are reported explicitly',
    'production/config files against their pre-execution content and permission baseline',
    'A skipped, passed, unmapped, empty or wrong-reason result fails',
    "Playwright's `expected`/`unexpected` summary alone cannot prove a failed assertion",
  ])
    check(resource.toLowerCase().includes(phrase.toLowerCase()), `resource preserves ${phrase}`);

  for (const terminal of ['steps-c/step-04-validate-and-summarize.md', 'red/steps-c/step-05-validate-and-complete.md']) {
    const source = read(path.join(SKILL, terminal));
    check(source.includes('{skill-root}/resources/run-and-heal.md'), `${terminal} loads the shared Create loop`);
  }
  for (const directory of ['steps-v', 'steps-e', 'red/steps-v', 'red/steps-e']) {
    const files = fs.readdirSync(path.join(SKILL, directory)).filter((file) => file.endsWith('.md'));
    for (const file of files) {
      const source = read(path.join(SKILL, directory, file));
      check(!/load[^\n]*resources\/run-and-heal\.md/i.test(source), `${directory}/${file} never loads the healing loop`);
    }
  }
  const knowledge = read(path.join(ROOT, 'skills', 'bmod-tea', 'knowledge', 'test-healing-patterns.md'));
  check(
    !/Mock ALL external|Use `test\.fixme\(\)` if healing fails|Replace.*regex.*hardcoding/i.test(knowledge),
    'knowledge teaches evidence-backed repairs without suppressing failures',
  );
}

function executionWitnesses() {
  const criteria = JSON.parse(read(path.join(FIXTURE, 'criteria.json'))).criteria;
  const project = staged('expand');
  const sourcePath = path.join(project, 'src', 'orders.js');
  const sourceBefore = read(sourcePath);
  const totalPath = path.join(project, criteria[0].file);
  const beforeTotal = read(totalPath);
  const broken = runExpand(project, criteria[0].file, 'initial');
  check(
    broken.exit !== 0 && broken.report.errors.length > 0 && leaves(broken.report).length === 0,
    'seeded generated import defect prevents any assertion from running',
  );
  check(
    broken.report.errors.some((error) => error.message.includes('../../src/order')),
    'fresh runner evidence identifies the generated import defect',
  );

  // Controlled fixture repair: the named module on disk establishes the path.
  assert.ok(fs.existsSync(path.join(project, 'src', 'orders.js')));
  const repaired = beforeTotal.replace("from '../../src/order'", "from '../../src/orders'");
  assert.notEqual(repaired, beforeTotal);
  fs.writeFileSync(totalPath, repaired);
  const healed = runExpand(project, criteria[0].file, 'healed');
  check(
    healed.exit === 0 && leaves(healed.report).length === 1 && leaves(healed.report)[0].status === 'passed',
    'correcting only the observed import makes the generated test execute and pass',
  );
  check(
    repaired.replace("from '../../src/orders'", "from '../../src/order'") === beforeTotal,
    'heal preserves the entire test including its exact 4200-cent assertion',
  );
  check(read(sourcePath) === sourceBefore, 'heal preserves production source byte for byte');

  const refundPath = path.join(project, criteria[1].file);
  const refundBefore = read(refundPath);
  const defect = runExpand(project, criteria[1].file, 'product-defect');
  const refund = leaves(defect.report);
  check(
    defect.exit !== 0 && refund.length === 1 && refund[0].status === 'failed',
    'valid generated refund test reproduces the real product defect',
  );
  check(
    /expect\(/.test(stripAnsi(refund[0].error.message)) &&
      /Expected: 4200/.test(stripAnsi(refund[0].error.message)) &&
      /Received: 4199/.test(stripAnsi(refund[0].error.message)),
    'product defect report retains exact expected and actual business values',
  );
  check(read(refundPath) === refundBefore && read(sourcePath) === sourceBefore, 'reported product defect leaves test and SUT unchanged');
  const finalScope = runExpand(project, 'tests/expand', 'final-scope');
  const finalTests = leaves(finalScope.report);
  check(
    finalScope.exit !== 0 &&
      finalTests.length === 2 &&
      finalTests.filter((test) => test.status === 'passed').length === 1 &&
      finalTests.filter((test) => test.status === 'failed').length === 1,
    'fresh final generated scope contains the healed pass and preserved product failure',
  );

  const permanent = staged('red-permanent');
  const redPath = path.join(permanent, criteria[2].file);
  const originalRed = read(redPath);
  const redCopy = path.join(scratch, 'red-execution');
  fs.cpSync(permanent, redCopy, { recursive: true, filter: (file) => path.basename(file) !== 'node_modules' });
  fs.symlinkSync(DEPENDENCIES, path.join(redCopy, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const reportPath = path.join(redCopy, 'test-results', 'red.json');
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'cli', 'atdd-red-check.js'),
      '--project-root',
      redCopy,
      '--test-dir',
      'tests/red',
      '--node-path',
      DEPENDENCIES,
      '--report',
      reportPath,
    ],
    { encoding: 'utf8', timeout: 20_000 },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const red = JSON.parse(read(reportPath));
  const redTest = red.files[0]?.tests[0];
  check(
    red.specFileCount === 1 && red.files[0].hadSkipCall && red.files[0].loadError === null && redTest?.status === 'failed',
    'existing red verifier activates and executes the disposable scaffold',
  );
  check(
    /expect\(/.test(redTest.message) && /Expected: "confirmed"/.test(redTest.message) && /Received: "pending"/.test(redTest.message),
    'red fails for the intended missing confirmation behavior',
  );
  check(red.productionFilesTouched.length === 0, 'red execution does not change production source');
  check(
    read(redPath) === originalRed && originalRed.includes('test.skip('),
    'permanent correctly failing red scaffold keeps its original skip convention and all bytes',
  );
}

/** Replay raw agent captures against their original fixture and staged instruction snapshots. */
function replayLiveCaptures() {
  const provenance = JSON.parse(captureText(path.join(LIVE_CAPTURE, 'provenance.json')));
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const archived = (record) => captureBytes(path.join(LIVE_CAPTURE, record.archivePath));
  const baseline = (relative) => archived(provenance.baseline[relative]).toString('utf8');
  const captured = (name, relative) => archived(provenance.captures[name].artifacts[relative]).toString('utf8');
  check(provenance.schemaVersion === 1, 'live-capture provenance uses its explicit schema version');
  check(/^[0-9a-f]{40}$/.test(provenance.repositoryCommitAtArchive), 'live-capture archive records a full repository revision');

  for (const [relative, record] of Object.entries(provenance.baseline)) {
    const bytes = archived(record);
    check(digest(bytes) === record.sha256, `live baseline ${relative} keeps its original bytes`);
    if (relative !== 'story.md') {
      check(
        digest(fs.readFileSync(path.join(FIXTURE, relative))) === record.sha256,
        `live baseline ${relative} agrees with the controlled fixture input`,
      );
    }
  }
  for (const [name, capture] of Object.entries(provenance.captures)) {
    const entry = ['red', 'default-red'].includes(name) ? 'bmad-testarch-atdd' : 'bmad-testarch-automate';
    const [node, runner, ...argumentsAfterRunner] = capture.invocation.argv;
    check(
      node === 'node' &&
        /(?:^|\/)cli\/skill-runner\.js$/.test(runner.replaceAll('\\', '/')) &&
        JSON.stringify(argumentsAfterRunner) ===
          JSON.stringify([
            '--skill-root',
            `.skills/${entry}`,
            '--agent',
            'claude',
            '--capability',
            'command-execution',
            '--timeout-ms',
            '600000',
          ]) &&
        capture.invocation.cwd.endsWith(`/${name}`) &&
        capture.invocation.stdin === 'prompt.txt' &&
        capture.invocation.stdout === 'capture.txt' &&
        capture.invocation.stderr === 'capture.stderr',
      `${name} capture records the actual command, selected entry, cwd and raw standard streams`,
    );
    for (const [relative, record] of Object.entries(capture.artifacts)) {
      const bytes = archived(record);
      check(digest(bytes) === record.sha256, `${name} capture ${relative} remains byte-identical`);
      if (relative.startsWith('.skills/')) {
        check(
          record.sha256 === capture.stagedSkillSnapshotHashes[relative],
          `${name} archived instruction ${relative} binds to the staged snapshot used by the agent`,
        );
      }
    }
    check(
      Object.hasOwn(capture.stagedSkillSnapshotHashes, '.skills/bmad-testarch-automate/SKILL.md') &&
        Object.hasOwn(capture.stagedSkillSnapshotHashes, '.skills/bmad-testarch-automate/resources/test-generation-routing.md') &&
        Object.hasOwn(capture.stagedSkillSnapshotHashes, '.skills/bmod-tea/knowledge/tea-index.csv') &&
        Object.values(capture.stagedSkillSnapshotHashes).every((hash) => /^[0-9a-f]{64}$/.test(hash)),
      `${name} provenance retains the complete staged skill snapshot hashes without asserting current-source equality`,
    );
    const prefix = ['red', 'default-red', 'canonical-only-red'].includes(name) ? 'ATDD' : 'AUTOMATE';
    check(
      captured(name, 'hooks.log') === `${prefix}-PREPEND\n${prefix}-APPEND\n${prefix}-COMPLETE\n`,
      `${name} agent capture runs only its selected mode hooks in their original order`,
    );
    for (const relative of ['src/orders.js', 'criteria.json', 'story.md', 'tests/expand/refund.spec.ts', 'tests/red/confirm.spec.ts']) {
      check(captured(name, relative) === baseline(relative), `${name} agent preserves ${relative} byte for byte`);
    }
  }

  const totalBefore = baseline('tests/expand/total.spec.ts');
  const totalAfter = captured('heal', 'tests/expand/total.spec.ts');
  check(
    totalBefore.replace("from '../../src/order'", "from '../../src/orders'") === totalAfter && totalBefore !== totalAfter,
    'live agent heals the observed import only, preserving every generated assertion and all other test bytes',
  );
  const initial = captured('heal', 'test-artifacts/automate/runs/round0.out');
  check(initial.includes("Cannot find module '../../src/order'"), 'live initial execution identifies the seeded generated import failure');
  const final = JSON.parse(captured('heal', 'test-artifacts/automate/runs/round1.json'));
  const tests = leaves(final);
  check(
    final.errors.length === 0 &&
      final.stats.expected === 1 &&
      final.stats.unexpected === 1 &&
      final.stats.skipped === 0 &&
      tests.length === 2 &&
      tests.find((test) => test.title.includes('AC-1'))?.status === 'passed' &&
      tests.find((test) => test.title.includes('AC-2'))?.status === 'failed',
    'live final generated scope executes both criteria: one healed pass and one preserved product failure',
  );
  const refund = tests.find((test) => test.title.includes('AC-2'));
  check(
    /Expected: 4200/.test(stripAnsi(refund.error.message)) && /Received: 4199/.test(stripAnsi(refund.error.message)),
    'live final failure preserves the exact refund business assertion against the real source',
  );
  const summaryPath = 'test-artifacts/automate/automation-summary-target-orders.md';
  const healSummary = captured('heal', summaryPath);
  check(
    healSummary.includes('Syntax/import/setup') &&
      healSummary.includes('Class: real product defect') &&
      healSummary.includes('**Rounds used: 1 of 3.**') &&
      healSummary.includes('final 2 executed / 1 passed / 1 failed / 0 skipped'),
    'live agent summary classifies the healed test defect and remaining product defect after one round',
  );
  check(
    captured('heal', 'capture.txt').includes('I changed the import') &&
      captured('heal', 'capture.txt').includes('real product defect') &&
      captured('heal', 'prompt.txt').includes('Do not regenerate tests'),
    'live automatic-healing capture records agent repair of existing generated tests through the Create terminal',
  );

  const redScaffold = captured('red', 'tests/generated/confirm.spec.ts');
  check(
    redScaffold === baseline('tests/red/confirm.spec.ts') && redScaffold.includes('test.skip('),
    'live red Create preserves the exact correctly failing scaffold after disposable verification',
  );
  const redReport = JSON.parse(captured('red', 'test-artifacts/atdd/evidence/red-check-report.json'));
  const redTest = redReport.files[0]?.tests[0];
  check(
    redReport.specFileCount === 1 &&
      redReport.productionFilesTouched.length === 0 &&
      redReport.files[0].loadError === null &&
      redReport.files[0].hadSkipCall &&
      redTest.status === 'failed' &&
      /Expected: "confirmed"/.test(redTest.message) &&
      /Received: "pending"/.test(redTest.message),
    'live red verifier measures the intended missing confirmation behavior without production changes',
  );
  check(
    captured('red', 'test-artifacts/atdd/atdd-checklist-1-3.md').includes('`healing_rounds_used = 0` of 3') &&
      captured('red', 'capture.txt').includes('0 of 3 rounds used'),
    'live red Create records zero repairs for its correctly failing acceptance test',
  );

  check(
    captured('default-red', 'capture.txt').includes('defaulted to **red** through `bmad-testarch-atdd`') &&
      captured('default-red', 'tests/generated/confirm.spec.ts') === redScaffold &&
      captured('default-red', 'prompt.txt').includes('no mode specified'),
    'live unattended ATDD entry defaults to red, reports its default and preserves the intended scaffold',
  );
  check(
    captured('default-expand', 'capture.txt').includes('expand, chosen by default') &&
      captured('default-expand', 'tests/expand/total.spec.ts') === totalAfter &&
      captured('default-expand', 'prompt.txt').includes('selected mode was intentionally unspecified'),
    'live unattended canonical entry defaults to expand and reports its choice without another question',
  );
  const standalone = provenance.captures['canonical-only-red'];
  check(
    !Object.keys(standalone.stagedSkillSnapshotHashes).some((file) => file.startsWith('.skills/bmad-testarch-atdd/')) &&
      Object.keys(standalone.stagedSkillSnapshotHashes).includes('.skills/bmad-testarch-automate/red/customize.toml') &&
      captured('canonical-only-red', '_bmad/custom/bmad-testarch-atdd.toml') === captured('red', '_bmad/custom/bmad-testarch-atdd.toml') &&
      captured('canonical-only-red', 'capture.txt').includes('red defaults plus `_bmad/custom/bmad-testarch-atdd.toml`'),
    'live standalone canonical red entry uses embedded red defaults and the original ATDD customizations',
  );
  check(
    captured('canonical-only-red', 'tests/generated/confirm.spec.ts') === redScaffold &&
      captured('canonical-only-red', 'test-artifacts/atdd/atdd-checklist-1-3.md') ===
        captured('red', 'test-artifacts/atdd/atdd-checklist-1-3.md') &&
      captured('canonical-only-red', 'capture.txt').includes("I didn't run or heal anything"),
    'live standalone red Validate preserves its confirmed checklist and intended-failure scaffold',
  );

  const expandReport = JSON.parse(captured('expand', 'test-artifacts/automate/run-target-total/round0.json'));
  check(
    expandReport.errors.length === 0 &&
      expandReport.stats.expected === 1 &&
      expandReport.stats.unexpected === 0 &&
      expandReport.stats.skipped === 0 &&
      leaves(expandReport).length === 1 &&
      leaves(expandReport)[0].status === 'passed',
    'live full expand Create generates and executes one passing criterion with no repair',
  );
  check(
    captured('expand', 'tests/expand/total.spec.ts') === totalBefore &&
      captured('expand', 'tests/generated/total.spec.ts').includes('.toBe(4200)') &&
      captured('expand', 'test-artifacts/automate/automation-summary-target-total.md').includes('Rounds used: 0'),
    'live expand Create preserves the out-of-scope broken exemplar and exact generated 4200-cent assertion',
  );

  for (const name of ['validate', 'edit']) {
    check(captured(name, 'tests/expand/total.spec.ts') === totalAfter, `live ${name} does not alter the healed test`);
    for (const relative of Object.keys(provenance.captures.heal.artifacts).filter((file) =>
      file.startsWith('test-artifacts/automate/runs/'),
    )) {
      check(captured(name, relative) === captured('heal', relative), `live ${name} retains prior execution evidence ${relative}`);
    }
  }
  check(
    captured('validate', summaryPath) === healSummary &&
      captured('validate', 'capture.txt').includes("I didn't run or repair any tests") &&
      captured('validate', 'capture.txt').includes('Overall verdict is **FAIL**'),
    'live Validate completes with a reported product failure and preserves the Create summary and tests',
  );
  check(
    captured('edit', summaryPath) === `${healSummary}Reviewed generated scope: orders.\n` &&
      captured('edit', 'capture.txt').includes('I ran no tests') &&
      captured('edit', 'capture.txt').includes('summary still records AC-2 as failing'),
    'live Edit applies only the requested summary line and completes while the known product failure remains',
  );
}

/** Replay genuine checkpoints and separately labeled seeded settings witnesses. */
function replayResumeAndSettings() {
  const runtime = path.join(LIVE_CAPTURE, 'runtime');
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const frontmatter = (source) => yaml.parse(source.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
  function load(group, name) {
    const directory = path.join(runtime, group, name);
    const capture = JSON.parse(captureText(path.join(directory, 'provenance.json')));
    const bytes = (relative) => captureBytes(path.join(directory, relative));
    for (const record of capture.files) {
      const actual = bytes(record.archivePath);
      assert.equal(actual.length, record.bytes, `${group}/${name}: ${record.archivePath} byte count`);
      assert.equal(digest(actual), record.sha256, `${group}/${name}: ${record.archivePath} digest`);
    }
    for (const record of capture.sourceSnapshots) {
      const actual = captureBytes(path.join(runtime, record.archivePath));
      assert.equal(actual.length, record.bytes, `${group}/${name}: ${record.sourcePath} source byte count`);
      assert.equal(digest(actual), record.sha256, `${group}/${name}: ${record.sourcePath} source digest`);
    }
    check(
      capture.schemaVersion === 1 && capture.invocations.at(-1).exitCode === 0,
      `${group}/${name} retains raw agent evidence, staged source snapshots and observed completion`,
    );
    const text = (relative) => bytes(relative).toString('utf8');
    const byRole = (role) => capture.files.filter((record) => record.role === role).map((record) => text(record.archivePath));
    return { capture, text, byRole };
  }
  for (const mode of ['red', 'expand']) {
    const { capture, text, byRole } = load('resume-v200', mode);
    const before = frontmatter(text('checkpoints/before.md.raw'));
    const after = frontmatter(text('checkpoints/after.md.raw'));
    check(
      capture.sourceTag.revision === 'cf325a7948220058208339587b917cb1a4d4ae60' &&
        !Object.hasOwn(before, 'testMode') &&
        byRole('v200-create-stdout')[0].length > 0,
      `${mode} checkpoint was saved by a real v2.0.0 Create before mode fields existed`,
    );
    for (const key of ['runScope', 'runKey', 'storyId', 'storyKey', 'storyFile']) assert.deepEqual(after[key], before[key]);
    const selected = mode === 'red' ? 'ATDD' : 'AUTOMATE';
    check(
      byRole('physical-hooks')[0] ===
        `${selected}-PREPEND\n${selected}-APPEND\nBEFORE-RESUME\n${selected}-PREPEND\nGREET-RESUME\n${selected}-APPEND\n`,
      `${mode} v2.0.0 Resume runs only its original activation hooks around the greeting`,
    );
    if (mode === 'red') check(after.lastStep === 'step-03-test-strategy', 'genuine red Resume saves the next strategy step');
    else
      check(
        after.lastStep === before.lastStep && byRole('resume-stdout')[0].includes('step-03'),
        'genuine expand Resume reaches generation and pauses before its aggregation-owned progress save',
      );
  }
  for (const name of ['red-exact', 'expand-exact', 'red-conflict', 'expand-conflict']) {
    const { capture, text, byRole } = load('exact-resume', name);
    const before = frontmatter(text('checkpoints/before.md.raw'));
    const after = frontmatter(text('checkpoints/after.md.raw'));
    for (const key of ['runScope', 'runKey', 'storyId', 'storyKey', 'storyFile']) assert.deepEqual(after[key], before[key]);
    for (const record of capture.files.filter((file) => file.archivePath.startsWith('watched-before/'))) {
      const afterPath = record.archivePath.replace('watched-before/', 'watched-after/');
      assert.equal(text(afterPath), text(record.archivePath), `${name}: unrelated watched file stays unchanged`);
    }
    check(true, `${name} preserves original run identity and every unrelated checkpoint/source/config byte`);
    if (capture.conflictingScope) {
      check(
        text('checkpoints/after.md.raw') === text('checkpoints/before.md.raw') && /Halted|Halt|halted|Refusing/.test(byRole('stdout')[0]),
        `${name} refuses the mismatched scope without changing progress`,
      );
    } else {
      const step = name === 'red-exact' ? 'step-03-test-strategy' : 'step-03c-aggregate';
      check(
        after.lastStep === step &&
          after.workflowStatus === 'in-progress' &&
          JSON.stringify(after.stepsCompleted) === JSON.stringify([...before.stepsCompleted, step]),
        `${name} saves the exact next incomplete step at the supplied external path`,
      );
      if (name === 'red-exact')
        check(
          after.atddChecklistPath === capture.suppliedCheckpointPath,
          'exact red Resume updates the implementation handoff to the supplied external checkpoint',
        );
    }
  }
  for (const name of ['validation-disabled', 'healing-disabled', 'zero-rounds', 'spent-budget']) {
    const { capture, text, byRole } = load('settings', name === 'zero-rounds' ? 'repair-limit-zero' : name);
    const before = JSON.parse(byRole('initial-snapshot')[0]);
    const after = frontmatter(text('checkpoints/after.md.raw'));
    check(
      capture.kind === 'create-terminal-settings' &&
        capture.files.some((record) => record.role === 'seeded-terminal-state-before' && record.reconstructed === true),
      `${name} labels its seeded state separately from genuine legacy checkpoints`,
    );
    const config = parseToml(text('bmad-inputs/config.toml.raw')).modules.tea;
    assert.deepEqual(config, capture.resolvedModuleConfig);
    for (const record of capture.files.filter((file) => file.archivePath.startsWith('watched-before/'))) {
      const afterPath = record.archivePath.replace('watched-before/', 'watched-after/');
      assert.equal(text(afterPath), text(record.archivePath), `${name}: owned test/source/config unchanged`);
    }
    check(
      after.healing_rounds_used === before.seededRoundCount && after.healing_rounds_used === (name === 'spent-budget' ? 3 : 0),
      `${name} preserves the saved repair budget without edits`,
    );
    const reports = byRole('native-runner-json-report').map((source) => JSON.parse(source));
    if (name === 'validation-disabled') {
      check(
        config.auto_validate === 'false' && reports.length === 0 && /disabled/i.test(byRole('stdout')[0]),
        'string false validation setting disables execution and repair with zero runtime reports',
      );
    } else {
      const report = reports[0];
      check(
        reports.length === 1 &&
          leaves(report).length === 0 &&
          report.errors.some((error) => /Cannot find module.*src\/order/.test(error.message)),
        `${name} executes once and reports the unchanged import defect without repairs`,
      );
    }
    check(byRole('physical-hooks')[0] === 'AUTOMATE-COMPLETE\n', `${name} physical completion hook runs once`);
  }
}

/** Genuine legacy checkpoint reaches its first terminal loop without a saved budget. */
function replayLegacyTerminal() {
  const root = path.join(LIVE_CAPTURE, 'runtime', 'legacy-terminal', 'expand');
  const data = (name) => captureText(path.join(root, name));
  const manifest = JSON.parse(data('manifest.json'));
  for (const record of manifest.files) {
    check(
      createHash('sha256')
        .update(captureBytes(path.join(root, record.archivePath)))
        .digest('hex') === record.sha256,
      `legacy terminal capture preserves ${record.archivePath} bytes`,
    );
  }
  const before = JSON.parse(data('before-terminal.json'));
  const provenance = JSON.parse(data('terminal-provenance.json'));
  check(
    !before.checkpointText.includes('healing_rounds_used') && provenance.exitStatus === 0 && provenance.protectedUnchanged,
    'genuine legacy terminal starts without a repair counter and preserves every protected artifact',
  );
  assert.deepEqual(provenance.before, provenance.after);
  const checkpoint = data(before.checkpoint);
  check(
    checkpoint.includes("workflowStatus: 'completed'") &&
      checkpoint.includes("runKey: 'target-src-orders-js'") &&
      checkpoint.includes('`healing_rounds_used`: 0') &&
      checkpoint.includes('initialized now: legacy checkpoint'),
    'legacy Resume initializes zero repair rounds and completes the supplied external checkpoint',
  );
  const report = JSON.parse(data('runner-report.json'));
  check(
    report.errors.length === 0 &&
      leaves(report).length === 6 &&
      leaves(report).every((test) => test.status === 'passed') &&
      report.stats.skipped === 0,
    'legacy terminal executes all six generated tests through the real project runner',
  );
  check(
    data('hooks.log') === 'BEFORE-TERMINAL\nAUTOMATE-PREPEND\nGREET-TERMINAL\nAUTOMATE-APPEND\nAUTOMATE-COMPLETE\n',
    'legacy terminal retains selected activation order and calls completion once',
  );
}

/** Actual browser execution captured through the skill-only native fallback. */
function replayNativeBrowser() {
  const root = path.join(LIVE_CAPTURE, 'runtime', 'native-browser');
  const provenance = JSON.parse(captureText(path.join(root, 'provenance.json')));
  const file = (name) => captureText(path.join(root, provenance.files[name].archivePath));
  for (const [name, record] of Object.entries(provenance.files)) {
    check(
      createHash('sha256')
        .update(captureBytes(path.join(root, record.archivePath)))
        .digest('hex') === record.sha256,
      `native browser capture preserves ${name} bytes`,
    );
  }
  check(
    provenance.capturedExitStatus === 0 &&
      provenance.invocation.argv.includes('--env-pass') &&
      provenance.invocation.environmentPass.includes('TEA_NATIVE_WITNESS'),
    'native browser agent receives the explicitly passed project environment',
  );
  const baseline = JSON.parse(file('baseline.json'));
  for (const [name, digest] of Object.entries(baseline)) {
    check(createHash('sha256').update(file(name)).digest('hex') === digest, `native browser preserves original ${name}`);
  }
  const report = JSON.parse(file('test-artifacts/atdd/run-and-heal-1-3/native-round0.json'));
  const tests = leaves(report);
  check(
    report.errors.length === 0 &&
      tests.length === 1 &&
      tests[0].status === 'failed' &&
      report.stats.skipped === 0 &&
      report.config.projects[0].timeout === 30_000,
    'native browser red executes one real assertion with the original project test budget',
  );
  const message = stripAnsi(tests[0].error.message);
  check(
    /toHaveText/.test(message) &&
      /Expected: "Confirmed"/.test(message) &&
      /Received: "Pending"/.test(message) &&
      tests[0].error.snippet.includes('TEA_NATIVE_WITNESS') &&
      tests[0].error.location.line === 7,
    'native Chromium red reaches the criterion after the environment-dependent child process succeeds',
  );
  check(
    file('tests/generated/confirm.spec.ts').includes('test.skip(') &&
      file('playwright.config.ts').includes("browserName:'chromium'") &&
      file('capture.txt').includes('real Chromium') &&
      file('capture.txt').includes('0 of 3 healing rounds'),
    'native fallback retains the permanent skipped scaffold and records correctly failing browser behavior without repair',
  );
}

try {
  const interrupted = path.join(scratch, 'interrupted-evidence');
  const faultPreload = path.join(scratch, 'extraction-fault.cjs');
  fs.writeFileSync(
    faultPreload,
    `const fs = require('node:fs');
const originalWrite = fs.writeFileSync;
let writes = 0;
fs.writeFileSync = (...args) => {
  if (++writes === 2) throw new Error('controlled filesystem write failure');
  return originalWrite(...args);
};
`,
  );
  const failedExtraction = spawnSync(
    process.execPath,
    ['--require', faultPreload, path.join(__dirname, 'lib/generation-evidence.js'), '--extract', interrupted],
    { encoding: 'utf8', timeout: 15_000 },
  );
  check(
    failedExtraction.status === 1 && failedExtraction.stderr.includes('controlled filesystem write failure') && !fs.existsSync(interrupted),
    'actual extraction CLI cleans partial output after a filesystem write failure',
  );
  check(extract(interrupted) > 0, 'extraction can retry the cleaned destination successfully');
  const extracted = path.join(scratch, 'evidence');
  check(
    extract(extracted) === JSON.parse(read(path.join(LIVE_CAPTURE, 'index.json'))).fileCount,
    'immutable capture bundle extracts every archived file for independent review',
  );
  check(
    fs.readFileSync(path.join(extracted, 'provenance.json')).equals(readGenerationEvidence('provenance.json')),
    'evidence extraction preserves exact original bytes',
  );
  assert.throws(() => extract(extracted), /destination must be new/);
  check(true, 'evidence extraction refuses to overwrite an existing directory');
  guardInstructions();
  executionWitnesses();
  replayLiveCaptures();
  replayNativeBrowser();
  replayLegacyTerminal();
  replayResumeAndSettings();
  console.log(`\n${checks} generated-test healing checks passed.`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
