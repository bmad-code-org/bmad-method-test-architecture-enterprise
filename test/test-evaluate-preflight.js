/**
 * `tea-skill-runner` and `tea-evaluate preflight`, end to end (Story 1.6).
 *
 * The runner cases spawn `cli/skill-runner.js` over the stub agent under
 * `test/fixtures/evaluate/stub-agent/`: a run names the skill it was handed; a
 * missing `--skill-root`, a skill root or `SKILL.md` outside the working
 * directory (a symbolic link included) and every other malformed command line
 * exit 2 (usage); a missing skill, a failing agent and a timeout exit 3, 4 and
 * 5; and an unexpected error exits 4. The registry entry the preflight fixture
 * declares for the runner carries exactly its infrastructure codes, 3 to 6.
 *
 * The preflight cases run the real `tea-evaluate preflight` over a temp copy of
 * `test/fixtures/evaluate/preflight/`, whose `launch.root` is pointed back at
 * the stub project, against the real installed eval-quality, with the runner on
 * PATH under its bin name:
 *
 * - the stub passes: exit 0, a passed `PreflightVerdict` from the CLI, every
 *   leg's observation under `runs/<invocationId>/observations/`, and no denial
 *   (`forbidden-target`, `interface-not-authorized`, `executable-not-authorized`)
 *   in what the run recorded;
 * - with the stub's registry entry replaced by an entry for another executable,
 *   the same assertions fail on the recorded denial, and the command exits 10,
 *   as it does for an entry under another interface;
 * - with `TEA_EVALUATE_ENGINE_CLI` at a shim that logs its argv, exits 0 for
 *   `compile` and `seal` and 5 for `preflight`, the command exits 5 and the log
 *   holds the preflight argv with `--observations` and this run's `--run-id`, so
 *   the verdict came from the CLI (the library's own verdict would pass);
 * - a witness leg whose agent exits non-zero fails the clean-control check on
 *   the control leg's exit 4: `tea-evaluate` and the CLI run directly over the
 *   persisted files both exit 3;
 * - a failed `compile` or `seal` passes its exit through and stops the run, an
 *   undocumented stage exit, a seeded probe, a missing registry target, an
 *   `mcp` interface, a leg over its output budget and a missing engine exit 12,
 *   an authoring defect exits 10, and no `--evaluation` exits 64;
 * - a leg that writes a file writes it into a disposable copy that is removed
 *   afterwards, `runs/` carries a `.gitignore`, and a permitted environment
 *   value reaches the agent and is scrubbed from everything the run recorded;
 * - `check` refuses a runner leg with another skill root or no `--timeout-ms`
 *   below the entry's ceiling, a runner entry missing an infrastructure code,
 *   and a skill root inside a provisioned directory.
 *
 * Usage: node test/test-evaluate-preflight.js
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { INFRASTRUCTURE_EXIT_CODES } = require('../cli/skill-runner');
const { EXIT_CODES } = require('../cli/lib/runner-exit-codes');
const { ENGINE_CLI_ENV, engineCliPath } = require('../cli/lib/evaluate/engine');

const PROJECT_ROOT = path.join(__dirname, '..');
const EVALUATE = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const RUNNER = path.join(PROJECT_ROOT, 'cli', 'skill-runner.js');
const FIXTURES = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate');
const PREFLIGHT_FIXTURE = path.join(FIXTURES, 'preflight');
const VALID_FIXTURE = path.join(FIXTURES, 'valid');
const STUB_PROJECT = path.join(FIXTURES, 'stub-agent');
const STUB_AGENT = 'test/fixtures/evaluate/stub-agent/agent.js';
const STUB_SKILL = 'test/fixtures/evaluate/stub-agent/skill';
const SHIM = path.join(FIXTURES, 'engine-shim.js');
const HIDE_ENGINE = path.join(FIXTURES, 'engine-absent', 'hide-engine.cjs');
const DENIALS = ['forbidden-target', 'interface-not-authorized', 'executable-not-authorized'];

/** This process's environment with every variable the cases set themselves removed, so a developer's shell cannot reroute a case. */
const BASE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => name !== ENGINE_CLI_ENV && !name.startsWith('TEA_EVALUATE_SHIM_') && name !== 'TEA_STUB_SECRET',
  ),
);

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;
const scratch = [];

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function tempDir(label) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `tea-evaluate-preflight-${label}-`));
  scratch.push(directory);
  return directory;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function editJson(folder, relative, edit) {
  const file = path.join(folder, relative);
  const value = readJson(file);
  edit(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// tea-skill-runner

function runRunner(args, { input = 'Say alpha.', cwd = PROJECT_ROOT } = {}) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], { cwd, input, encoding: 'utf8', env: BASE_ENV });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}${result.stderr}` };
}

const STUB_OPTIONS = ['--agent', 'custom', '--agent-cmd', STUB_AGENT];

function checkRunner() {
  check(
    JSON.stringify(INFRASTRUCTURE_EXIT_CODES) === JSON.stringify([3, 4, 5, 6]),
    `the skill runner's infrastructure exit codes are ${JSON.stringify(INFRASTRUCTURE_EXIT_CODES)}; expected 3 to 6`,
  );
  check(EXIT_CODES.usage === 2, `the shared usage exit is ${EXIT_CODES.usage}; the runner's usage error is documented as 2`);
  const entry = readJson(path.join(PREFLIGHT_FIXTURE, 'evaluation.json')).registry[0];
  check(
    JSON.stringify(entry.infrastructureExitCodes) === JSON.stringify(INFRASTRUCTURE_EXIT_CODES),
    `the fixture's tea-skill-runner entry declares ${JSON.stringify(entry.infrastructureExitCodes)}; expected the runner's own ${JSON.stringify(INFRASTRUCTURE_EXIT_CODES)}`,
  );

  const ok = runRunner(['--skill-root', STUB_SKILL, ...STUB_OPTIONS]);
  check(ok.status === 0, `a stub run exited ${ok.status}; expected 0\n${ok.output}`);
  check(ok.stdout.includes('skill: stub-skill'), `a stub run did not name the skill it was handed:\n${ok.output}`);
  check(ok.stdout.includes('request: Say alpha.'), `a stub run did not receive the prompt:\n${ok.output}`);

  const absolute = runRunner(['--skill-root', path.join(PROJECT_ROOT, STUB_SKILL), ...STUB_OPTIONS]);
  check(
    absolute.status === 0,
    `an absolute skill root inside the working directory exited ${absolute.status}; expected 0\n${absolute.output}`,
  );

  const cases = [
    ['no --skill-root', [...STUB_OPTIONS], {}, EXIT_CODES.usage],
    ['no --agent', ['--skill-root', STUB_SKILL], {}, EXIT_CODES.usage],
    ['an empty prompt', ['--skill-root', STUB_SKILL, ...STUB_OPTIONS], { input: '  \n' }, EXIT_CODES.usage],
    ['a malformed --timeout-ms', ['--skill-root', STUB_SKILL, ...STUB_OPTIONS, '--timeout-ms', '20abc'], {}, EXIT_CODES.usage],
    ['an unknown --capability', ['--skill-root', STUB_SKILL, ...STUB_OPTIONS, '--capability', 'root'], {}, EXIT_CODES.usage],
    ['a skill root outside the working directory', ['--skill-root', path.dirname(PROJECT_ROOT), ...STUB_OPTIONS], {}, EXIT_CODES.usage],
    ['a skill root that climbs out', ['--skill-root', '../elsewhere', ...STUB_OPTIONS], {}, EXIT_CODES.usage],
    ['an unknown agent', ['--skill-root', STUB_SKILL, '--agent', 'nobody'], {}, EXIT_CODES['environment-configuration']],
    [
      'a missing skill root',
      ['--skill-root', 'test/fixtures/evaluate/no-such-skill', ...STUB_OPTIONS],
      {},
      EXIT_CODES['environment-configuration'],
    ],
    [
      'a skill root holding no SKILL.md',
      ['--skill-root', 'test/fixtures/evaluate/stub-agent', ...STUB_OPTIONS],
      {},
      EXIT_CODES['environment-configuration'],
    ],
    [
      'an agent that exits non-zero',
      ['--skill-root', STUB_SKILL, ...STUB_OPTIONS],
      { input: 'STUB-EXIT 7' },
      EXIT_CODES['environment-transport'],
    ],
    [
      'an agent that outlives --timeout-ms',
      ['--skill-root', STUB_SKILL, ...STUB_OPTIONS, '--timeout-ms', '300'],
      { input: 'STUB-SLEEP 5000' },
      EXIT_CODES['environment-timeout'],
    ],
  ];
  for (const [name, args, options, expected] of cases) {
    const result = runRunner(args, options);
    check(result.status === expected, `the runner with ${name} exited ${result.status}; expected ${expected}\n${result.output}`);
    check(result.stderr.includes('tea-skill-runner: '), `the runner with ${name} named no reason on stderr:\n${result.output}`);
  }

  // A symbolic link inside the working directory that points outside it.
  const cwd = tempDir('runner-cwd');
  const outside = tempDir('runner-outside');
  fs.writeFileSync(path.join(outside, 'SKILL.md'), '---\nname: outside-skill\n---\n');
  fs.symlinkSync(outside, path.join(cwd, 'skill'), 'dir');
  const linked = runRunner(['--skill-root', 'skill', '--agent', 'custom', '--agent-cmd', path.join(PROJECT_ROOT, STUB_AGENT)], { cwd });
  check(
    linked.status === EXIT_CODES.usage,
    `a skill root linked outside the working directory exited ${linked.status}; expected ${EXIT_CODES.usage}\n${linked.output}`,
  );

  // SKILL.md itself linked outside the working directory.
  const entryCwd = tempDir('runner-entry');
  fs.mkdirSync(path.join(entryCwd, 'skill'));
  fs.symlinkSync(path.join(outside, 'SKILL.md'), path.join(entryCwd, 'skill', 'SKILL.md'));
  const linkedEntry = runRunner(['--skill-root', 'skill', '--agent', 'custom', '--agent-cmd', path.join(PROJECT_ROOT, STUB_AGENT)], {
    cwd: entryCwd,
  });
  check(
    linkedEntry.status === EXIT_CODES.usage,
    `a SKILL.md linked outside the working directory exited ${linkedEntry.status}; expected ${EXIT_CODES.usage}\n${linkedEntry.output}`,
  );

  // An absolute skill root spelled through the link the temp directory sits under, and one holding a backtick.
  const spelled = tempDir('runner-spelled');
  fs.cpSync(path.join(PROJECT_ROOT, STUB_SKILL), path.join(spelled, 'skill'), { recursive: true });
  const absoluteSpelled = runRunner(
    ['--skill-root', path.join(spelled, 'skill'), '--agent', 'custom', '--agent-cmd', path.join(PROJECT_ROOT, STUB_AGENT)],
    { cwd: spelled },
  );
  check(
    absoluteSpelled.status === 0,
    `an absolute skill root inside a linked working directory exited ${absoluteSpelled.status}\n${absoluteSpelled.output}`,
  );
  fs.cpSync(path.join(PROJECT_ROOT, STUB_SKILL), path.join(spelled, 'sk`ill'), { recursive: true });
  const backtick = runRunner(['--skill-root', 'sk`ill', '--agent', 'custom', '--agent-cmd', path.join(PROJECT_ROOT, STUB_AGENT)], {
    cwd: spelled,
  });
  check(
    backtick.status === EXIT_CODES.usage,
    `a skill root holding a backtick exited ${backtick.status}; expected ${EXIT_CODES.usage}\n${backtick.output}`,
  );

  // An unexpected error inside the runner, planted by failing the filesystem call it makes first.
  const crash = spawnSync(
    process.execPath,
    [
      '-e',
      "const runner = require(process.argv[1]); require('node:fs').realpathSync = () => { throw new TypeError('planted'); }; process.exitCode = runner.main(process.argv);",
      RUNNER,
      '--skill-root',
      STUB_SKILL,
      ...STUB_OPTIONS,
    ],
    { cwd: PROJECT_ROOT, input: 'Say alpha.', encoding: 'utf8' },
  );
  check(
    crash.status === EXIT_CODES['environment-transport'],
    `an unexpected runner error exited ${crash.status}; expected ${EXIT_CODES['environment-transport']}\n${crash.stderr}`,
  );
  check(
    crash.stderr.includes('unexpected error') && crash.stderr.includes('planted'),
    `the unexpected runner error did not name itself on stderr:\n${crash.stderr}`,
  );
}

// ---------------------------------------------------------------------------
// tea-evaluate preflight

/**
 * A temp copy of an evaluation fixture whose launch root points back at its
 * target in this repository: the stub project for the preflight fixture, the
 * repository itself for the check fixture.
 */
function copyFixture(source = PREFLIGHT_FIXTURE, root = STUB_PROJECT) {
  const folder = path.join(tempDir('case'), path.basename(source));
  fs.cpSync(source, folder, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  editJson(folder, 'evaluation.json', (value) => {
    value.launch.root = path.relative(folder, root).split(path.sep).join('/');
  });
  return folder;
}

/**
 * A directory holding `tea-skill-runner` as a link to this repository's runner,
 * put on PATH the way `npm exec` puts an installed package's bins there, since
 * the fixture registers the runner by its bin name.
 */
let binDirectory;
function runnerPath() {
  if (binDirectory === undefined) {
    binDirectory = tempDir('bin');
    fs.symlinkSync(RUNNER, path.join(binDirectory, 'tea-skill-runner'));
  }
  return `${binDirectory}${path.delimiter}${BASE_ENV.PATH ?? ''}`;
}

function runEvaluate(args, { env = {}, node = [] } = {}) {
  const result = spawnSync(process.execPath, [...node, EVALUATE, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...BASE_ENV, PATH: runnerPath(), ...env },
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}${result.stderr}` };
}

function runPreflight(folder, options) {
  return runEvaluate(folder === null ? ['preflight'] : ['preflight', '--evaluation', folder], options);
}

/** The one run directory an invocation wrote, or null. */
function runDirectoryOf(folder) {
  const runs = path.join(folder, 'runs');
  if (!fs.existsSync(runs)) return null;
  const entries = fs.readdirSync(runs, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  return entries.length === 1 ? path.join(runs, entries[0].name) : null;
}

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { recursive: true }).map((relative) => path.join(directory, relative));
}

/**
 * Why a run is not a passed preflight with no authorization denial; empty when
 * it is. The passing case asserts this is empty, and the removed-entry case
 * asserts it is not, so removing the stub's registry entry fails the same
 * assertions.
 */
function passedPreflightProblems(runDirectory) {
  if (runDirectory === null) return ['the invocation wrote no runs/<invocationId>/ directory'];
  const problems = [];
  const observations = filesUnder(path.join(runDirectory, 'observations'));
  if (observations.length === 0) problems.push('runs/<invocationId>/observations/ is empty');
  const verdictPath = path.join(runDirectory, 'preflight-verdict.json');
  const verdict = fs.existsSync(verdictPath) ? readJson(verdictPath) : null;
  if (verdict?.passed !== true)
    problems.push(`the CLI's PreflightVerdict is ${verdict === null ? 'missing' : `passed: ${verdict.passed}`}`);
  // The files the runtime writes about legs and the verdict; a stage's own
  // stdout and stderr under engine/ are the engine's words and may name its vocabulary.
  const legFiles = [
    ...filesUnder(path.join(runDirectory, 'observations')),
    ...filesUnder(path.join(runDirectory, 'faults')),
    path.join(runDirectory, 'observations.json'),
    verdictPath,
  ];
  for (const file of legFiles) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const denial of DENIALS) if (text.includes(denial)) problems.push(`${path.relative(runDirectory, file)} records ${denial}`);
  }
  return problems;
}

function checkPasses() {
  const folder = copyFixture();
  const result = runPreflight(folder);
  check(result.status === 0, `preflight over the stub exited ${result.status}; expected 0\n${result.output}`);
  const runDirectory = runDirectoryOf(folder);
  for (const problem of passedPreflightProblems(runDirectory)) check(false, `the passing preflight: ${problem}`);
  if (runDirectory === null) return;
  const invocationId = path.basename(runDirectory);
  const legs = filesUnder(path.join(runDirectory, 'observations')).map((file) => readJson(file).legId);
  check(
    JSON.stringify(legs) === JSON.stringify(['witness-alpha', 'witness-beta', 'preflight-control-observe', 'preflight-control-observe-2']),
    `the persisted legs are ${JSON.stringify(legs)}; expected both witness legs and both control legs, in plan order`,
  );
  const observationsPath = path.join(runDirectory, 'observations.json');
  const persisted = fs.existsSync(observationsPath) ? readJson(observationsPath) : null;
  check(persisted?.length === legs.length, `observations.json holds ${persisted?.length ?? 'no'} observation(s) for ${legs.length} leg(s)`);
  const callPath = path.join(runDirectory, 'engine', 'preflight.json');
  const argv = fs.existsSync(callPath) ? readJson(callPath).argv : [];
  check(fs.existsSync(callPath), 'the run recorded no eval-quality preflight call, so its verdict came from somewhere else');
  const runIdAt = argv.indexOf('--run-id');
  check(runIdAt > 0 && argv[runIdAt + 1] === invocationId, `the preflight call's --run-id is not the invocation's: ${argv}`);
  check(argv.includes('--observations'), `the preflight call carries no --observations: ${argv}`);
  for (const artifact of ['eval-contract.json', 'sealed-evaluator-brief.json', 'probes.json']) {
    check(fs.existsSync(path.join(runDirectory, artifact)), `the run holds no ${artifact}`);
  }
  check(!fs.existsSync(path.join(runDirectory, 'faults')), 'a passing run recorded a leg fault');
}

function checkRemovedEntry() {
  const folder = copyFixture();
  editJson(folder, 'evaluation.json', (value) => (value.registry[0].executable = 'tea-other-runner'));
  const result = runPreflight(folder);
  check(result.status === 10, `preflight with the stub's registry entry removed exited ${result.status}; expected 10\n${result.output}`);
  const runDirectory = runDirectoryOf(folder);
  const problems = passedPreflightProblems(runDirectory);
  check(
    problems.some((problem) => problem.includes('forbidden-target')),
    `the passing-preflight assertions did not observe the denial once the stub's entry was removed: ${JSON.stringify(problems)}`,
  );
  if (runDirectory === null) return;
  const faults = filesUnder(path.join(runDirectory, 'faults'));
  check(faults.length === 1, `a denied run recorded ${faults.length} fault(s); expected the one refused leg`);
  check(!fs.existsSync(path.join(runDirectory, 'engine', 'preflight.json')), 'a denied run still asked the CLI for a verdict');
}

function checkShim() {
  const folder = copyFixture();
  const log = path.join(tempDir('shim'), 'argv.log');
  const result = runPreflight(folder, {
    env: { [ENGINE_CLI_ENV]: SHIM, TEA_EVALUATE_SHIM_LOG: log, TEA_EVALUATE_SHIM_EXIT_PREFLIGHT: '5' },
  });
  check(
    result.status === 5,
    `preflight under the logging shim exited ${result.status}; expected the shim's preflight exit 5\n${result.output}`,
  );
  const lines = fs.existsSync(log)
    ? fs
        .readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    : [];
  check(
    JSON.stringify(lines.map((argv) => argv[0])) === JSON.stringify(['compile', 'seal', 'preflight']),
    `the shim saw ${JSON.stringify(lines.map((argv) => argv[0]))}; expected compile, seal, preflight`,
  );
  const runDirectory = runDirectoryOf(folder);
  const preflight = lines.find((argv) => argv[0] === 'preflight') ?? [];
  const runIdAt = preflight.indexOf('--run-id');
  check(preflight.includes('--observations'), `the logged preflight argv carries no --observations: ${JSON.stringify(preflight)}`);
  check(
    runDirectory !== null && runIdAt > 0 && preflight[runIdAt + 1] === path.basename(runDirectory),
    `the logged preflight argv does not carry this run's --run-id: ${JSON.stringify(preflight)}`,
  );
  check(
    runDirectory !== null && filesUnder(path.join(runDirectory, 'observations')).length === 4,
    'the legs did not run under the shim; the library drives them whatever the CLI is',
  );
  check(
    runDirectory !== null && !fs.existsSync(path.join(runDirectory, 'preflight-verdict.json')),
    'a verdict file exists though the shim wrote none, so something other than the CLI wrote a verdict',
  );

  const compileFolder = copyFixture();
  const compileLog = path.join(tempDir('shim-compile'), 'argv.log');
  const failed = runPreflight(compileFolder, {
    env: { [ENGINE_CLI_ENV]: SHIM, TEA_EVALUATE_SHIM_LOG: compileLog, TEA_EVALUATE_SHIM_EXIT_COMPILE: '4' },
  });
  check(failed.status === 4, `preflight whose compile exits 4 exited ${failed.status}; expected 4 passed through\n${failed.output}`);
  const logLines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n') : []);
  check(logLines(compileLog).length === 1, 'the run went on past a failed compile');
  const compileRun = runDirectoryOf(compileFolder);
  check(compileRun !== null && !fs.existsSync(path.join(compileRun, 'observations')), 'a leg ran after a failed compile');

  const sealFolder = copyFixture();
  const sealLog = path.join(tempDir('shim-seal'), 'argv.log');
  const sealFailed = runPreflight(sealFolder, {
    env: { [ENGINE_CLI_ENV]: SHIM, TEA_EVALUATE_SHIM_LOG: sealLog, TEA_EVALUATE_SHIM_EXIT_SEAL: '5' },
  });
  check(
    sealFailed.status === 5,
    `preflight whose seal exits 5 exited ${sealFailed.status}; expected 5 passed through\n${sealFailed.output}`,
  );
  check(logLines(sealLog).length === 2, 'the run went on past a failed seal');
  const sealRun = runDirectoryOf(sealFolder);
  check(sealRun !== null && !fs.existsSync(path.join(sealRun, 'observations')), 'a leg ran after a failed seal');
}

function checkFailingControl() {
  const folder = copyFixture();
  editJson(folder, 'contract.json', (contract) => {
    const legs = contract.permittedInterfaces[0].operations[0].sensitivityWitness.legs;
    legs[0].inputs.stdin.value = 'Say alpha. STUB-EXIT 9';
  });
  const result = runPreflight(folder);
  check(
    result.status === 3,
    `preflight whose control leg exits non-zero exited ${result.status}; expected 3 from the CLI\n${result.output}`,
  );
  const runDirectory = runDirectoryOf(folder);
  if (runDirectory === null) {
    check(false, 'the failing-control run wrote no run directory');
    return;
  }
  const verdictPath = path.join(runDirectory, 'preflight-verdict.json');
  const verdict = fs.existsSync(verdictPath) ? readJson(verdictPath) : null;
  const cleanControl = verdict?.checks?.find((entry) => entry.kind === 'clean-control');
  check(
    cleanControl?.outcome === 'failed' && JSON.stringify(cleanControl).includes('exit code 4'),
    `the CLI's verdict does not fail clean-control on the control leg's exit 4: ${JSON.stringify(cleanControl)}`,
  );
  const control = filesUnder(path.join(runDirectory, 'observations'))
    .map((file) => readJson(file))
    .find((entry) => entry.legId === 'preflight-control-observe');
  check(
    control?.observation?.exitCode === EXIT_CODES['environment-transport'],
    `the control leg's runner exit is ${control?.observation?.exitCode}; expected the transport class`,
  );
  const direct = spawnSync(
    process.execPath,
    [
      engineCliPath({}),
      'preflight',
      '--contract',
      path.join(folder, 'contract.json'),
      '--probes',
      path.join(runDirectory, 'probes.json'),
      '--observations',
      path.join(runDirectory, 'observations.json'),
      '--run-id',
      path.basename(runDirectory),
      '--out',
      path.join(tempDir('direct'), 'preflight-verdict.json'),
    ],
    { encoding: 'utf8' },
  );
  check(
    direct.status === 3 && direct.status === result.status,
    `the direct CLI over the persisted files exited ${direct.status}; tea-evaluate exited ${result.status}; both should be 3`,
  );
}

function checkRefusals() {
  const seeded = copyFixture(VALID_FIXTURE, PROJECT_ROOT);
  const seededResult = runPreflight(seeded);
  check(seededResult.status === 12, `preflight over a seeded probe exited ${seededResult.status}; expected 12\n${seededResult.output}`);
  check(seededResult.stdout.includes('probes/P-002.probe.json'), `the seeded refusal does not name the probe:\n${seededResult.output}`);
  check(runDirectoryOf(seeded) === null, 'a refused seeded evaluation still started a run');

  const missing = copyFixture();
  editJson(missing, 'evaluation.json', (value) => (value.registry[0].target = 'cli/no-such-runner.js'));
  const missingResult = runPreflight(missing);
  check(
    missingResult.status === 12,
    `preflight with a missing registry target exited ${missingResult.status}; expected 12\n${missingResult.output}`,
  );
  check(missingResult.stdout.includes('does not exist'), `the missing-target refusal does not say why:\n${missingResult.output}`);
  check(runDirectoryOf(missing) === null, 'a registry target that cannot launch still started a run');

  const stale = copyFixture();
  editJson(stale, 'probes/P-001.probe.json', (value) => (value.rationale = `${value.rationale} Edited.`));
  const staleResult = runPreflight(stale);
  check(staleResult.status === 10, `preflight over a stale index exited ${staleResult.status}; expected 10\n${staleResult.output}`);
  check(staleResult.stdout.includes('[stale-index]'), `the authoring defect was not printed as a finding:\n${staleResult.output}`);
  check(runDirectoryOf(stale) === null, 'an evaluation with an authoring defect still started a run');

  const usage = runPreflight(null);
  check(usage.status === 64, `preflight with no --evaluation exited ${usage.status}; expected 64\n${usage.output}`);

  const absent = runPreflight(copyFixture(), { node: ['--require', HIDE_ENGINE] });
  check(absent.status === 12, `preflight with no engine installed exited ${absent.status}; expected 12\n${absent.output}`);
  check(absent.output.includes('eval-quality is not installed'), `the missing engine was not named:\n${absent.output}`);

  // A leg the adapter cannot finish, for a reason other than authorization:
  // the registry's output ceiling is below what the stub prints.
  const slow = copyFixture();
  editJson(slow, 'evaluation.json', (value) => (value.registry[0].maxOutputBytes = 8));
  const slowResult = runPreflight(slow);
  check(
    slowResult.status === 12,
    `preflight whose leg exceeds its output budget exited ${slowResult.status}; expected 12\n${slowResult.output}`,
  );
  const slowRun = runDirectoryOf(slow);
  const slowFaults = slowRun === null ? [] : filesUnder(path.join(slowRun, 'faults'));
  check(slowFaults.length === 1, `a leg that exceeded its budget recorded ${slowFaults.length} fault(s); expected 1`);
  check(
    slowFaults.every((file) => readJson(file).code === 'budget-exhausted'),
    'the over-budget leg was not recorded as budget-exhausted',
  );
  check(
    slowRun !== null && !fs.existsSync(path.join(slowRun, 'engine', 'preflight.json')),
    'an over-budget run still asked the CLI for a verdict',
  );
}

/** Adds an option every leg and the plan step hand the runner, and permits it in the request shape. */
function addRunnerOption(folder, name, value) {
  editJson(folder, 'contract.json', (contract) => {
    const operation = contract.permittedInterfaces[0].operations[0];
    if (!operation.requestShape.option.permittedKeys.includes(name)) operation.requestShape.option.permittedKeys.push(name);
    operation.requestShape.option.types[name] = 'string';
    for (const leg of operation.sensitivityWitness.legs) leg.inputs.option[name] = value;
    contract.interactionPlan[0].inputBinding.option[name] = { literal: value };
  });
}

function checkEnvironmentValuesStayOut() {
  const folder = copyFixture();
  const secret = 'tea-stub-secret-value-7f3a91';
  editJson(folder, 'evaluation.json', (value) => (value.registry[0].environmentKeys = ['TEA_STUB_SECRET']));
  addRunnerOption(folder, 'env-pass', 'TEA_STUB_SECRET');
  editJson(folder, 'contract.json', (contract) => {
    for (const leg of contract.permittedInterfaces[0].operations[0].sensitivityWitness.legs) {
      leg.inputs.stdin.value = `${leg.inputs.stdin.value} STUB-ENV TEA_STUB_SECRET`;
    }
  });
  const result = runPreflight(folder, { env: { TEA_STUB_SECRET: secret } });
  check(result.status === 0, `preflight with a permitted environment key exited ${result.status}; expected 0\n${result.output}`);
  const runDirectory = runDirectoryOf(folder);
  const first = filesUnder(path.join(runDirectory ?? folder, 'observations'))[0];
  const recorded = first === undefined ? null : readJson(first);
  check(
    JSON.stringify(recorded?.request?.channels?.environment) === JSON.stringify(['TEA_STUB_SECRET']),
    'the recorded request does not list the environment key the registry entry permits',
  );
  check(
    JSON.stringify(recorded?.observation?.stdout ?? '').includes('env: [redacted]'),
    `the host value did not reach the agent, or its echo was not scrubbed: ${JSON.stringify(recorded?.observation?.stdout)}`,
  );
  for (const file of filesUnder(runDirectory ?? folder)) {
    if (fs.statSync(file).isFile()) check(!fs.readFileSync(file, 'utf8').includes(secret), `${file} holds an environment value`);
  }
}

function checkCopyAndRunsIgnore() {
  const folder = copyFixture();
  editJson(folder, 'contract.json', (contract) => {
    const legs = contract.permittedInterfaces[0].operations[0].sensitivityWitness.legs;
    legs[0].inputs.stdin.value = `${legs[0].inputs.stdin.value} STUB-WRITE`;
  });
  const copies = () => new Set(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('tea-evaluate-copy-')));
  const before = copies();
  const result = runPreflight(folder);
  check(
    [...copies()].every((name) => before.has(name)),
    'the disposable copy of the target root was left in the temp directory',
  );
  check(result.status === 0, `preflight whose leg writes a file exited ${result.status}; expected 0\n${result.output}`);
  check(!fs.existsSync(path.join(STUB_PROJECT, 'stub-wrote.txt')), 'a leg wrote into the target root; legs run in a disposable copy');
  const ignore = path.join(folder, 'runs', '.gitignore');
  check(fs.existsSync(ignore) && fs.readFileSync(ignore, 'utf8') === '*\n', 'runs/ carries no .gitignore that ignores every run');
}

function checkInterfaceDenialAndRefusals() {
  const renamed = copyFixture();
  editJson(renamed, 'evaluation.json', (value) => (value.registry[0].interfaceId = 'other-skill'));
  const denied = runPreflight(renamed);
  check(denied.status === 10, `preflight with the stub's interface unregistered exited ${denied.status}; expected 10\n${denied.output}`);

  const mcp = copyFixture();
  editJson(mcp, 'evaluation.json', (value) => (value.interface = 'mcp'));
  const mcpResult = runPreflight(mcp);
  check(mcpResult.status === 12, `preflight over an mcp evaluation exited ${mcpResult.status}; expected 12\n${mcpResult.output}`);

  const crashed = copyFixture();
  const log = path.join(tempDir('shim-crash'), 'argv.log');
  const crashResult = runPreflight(crashed, {
    env: { [ENGINE_CLI_ENV]: SHIM, TEA_EVALUATE_SHIM_LOG: log, TEA_EVALUATE_SHIM_EXIT_COMPILE: '1' },
  });
  check(
    crashResult.status === 12,
    `preflight whose compile exits an undocumented 1 exited ${crashResult.status}; expected 12\n${crashResult.output}`,
  );
  check(crashResult.output.includes('substitutes'), `the engine substitution was not announced:\n${crashResult.output}`);
}

/** The `skill-root` and `skill-runner` check rules, over the preflight fixture's tea-skill-runner entry. */
function checkRunnerRules() {
  const cases = [
    ['a leg handing the runner another skill root', 'skill-root', (folder) => addRunnerOption(folder, 'skill-root', 'other-skill')],
    [
      'a skill root inside a provisioned directory',
      'skill-root',
      (folder) => editJson(folder, 'evaluation.json', (value) => (value.workspace.provision = ['skill'])),
    ],
    [
      'a runner entry missing an infrastructure code',
      'skill-runner',
      (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].infrastructureExitCodes = [3, 4, 5])),
    ],
    [
      'a runner leg with no --timeout-ms',
      'skill-runner',
      (folder) =>
        editJson(folder, 'contract.json', (contract) => {
          const operation = contract.permittedInterfaces[0].operations[0];
          for (const leg of operation.sensitivityWitness.legs) delete leg.inputs.option['timeout-ms'];
        }),
    ],
    ['a runner --timeout-ms at the entry ceiling', 'skill-runner', (folder) => addRunnerOption(folder, 'timeout-ms', '60000')],
  ];
  for (const [name, rule, plant] of cases) {
    const folder = copyFixture();
    plant(folder);
    const result = runEvaluate(['check', '--evaluation', folder]);
    check(result.status === 10, `check with ${name} exited ${result.status}; expected 10\n${result.output}`);
    check(result.stdout.includes(`[${rule}]`), `check with ${name} reported no ${rule} finding:\n${result.output}`);
  }
}

function main() {
  try {
    checkRunner();
    checkPasses();
    checkRemovedEntry();
    checkShim();
    checkFailingControl();
    checkRefusals();
    checkEnvironmentValuesStayOut();
    checkCopyAndRunsIgnore();
    checkInterfaceDenialAndRefusals();
    checkRunnerRules();
  } finally {
    for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} tea-evaluate preflight check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} tea-evaluate preflight check(s) passed`);
  return 0;
}

process.exitCode = main();
