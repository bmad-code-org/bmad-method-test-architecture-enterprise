/**
 * The command-probe layer, end to end, with no credential and no model call.
 *
 * TEA measures its skills by running a command and reading what it wrote. That
 * mechanism is now eval-quality's `createCommandLineAdapter` rather than three
 * hand-rolled `spawnSync` blocks, and this file is what says so is true: it
 * drives both of TEA's real command targets through the real adapter and the
 * real policy, with a stub agent standing in for the vendor, and asserts the
 * observation that comes back.
 *
 * Four things are checked here and nowhere else.
 *
 * 1. **Every contract names a command TEA ships.** Eight contracts declared
 *    `tea-fragment-selection-runner` for months and nothing by that name
 *    existed. That is worse than a declared gap: the contract compiles, the
 *    pre-flight plan schedules it, and the gate stays green over an executable
 *    nobody can run. The registry in test/lib/probe-targets.js is the list of
 *    commands that exist, and this compares the contracts against it.
 *
 * 2. **The policy denies by default.** An unregistered interface, an
 *    unregistered executable under a registered interface, and an unauthorized
 *    subcommand path are each refused before a process starts.
 *
 * 3. **The adapter really drives a TEA command.** A real `tea-test-review` run
 *    against the checked-in fixture project, through the port, producing a
 *    verdict artifact the adapter reads back as JSON; and a real
 *    `tea-fragment-selection-runner` run producing a selection on stdout. Both
 *    are free: the vendor is a stub, and the only assertions are about the
 *    plumbing.
 *
 * 4. **A killed run is classified, not scored.** A budget exhaustion comes back
 *    as an environment failure with a class, never as a measurement.
 *
 * Usage: node test/test-probe-targets.js
 * Exit codes: 0 every check passed, 1 a check failed
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  EXECUTION_TARGETS,
  commandTargetPolicy,
  createProbePort,
  failureClassForFault,
  probeCommand,
  probeRequest,
  targetFor,
  targetProblems,
} = require('./lib/probe-targets');
const {
  EXIT_CODES,
  RUNNER_CAPABILITIES: RUNNER_DECLARED_CAPABILITIES,
  SELECTION_REQUEST_KEYS,
  classOfAgentError,
  failureClassForExit,
} = require('../cli/fragment-selection-runner');
const { RUNNER_CAPABILITIES: HARNESS_DECLARED_CAPABILITIES } = require('./eval-fragment-selection');
const { classifyAgentError } = require('./lib/eval-record');
const { FAILURE_CLASSES } = require('./schema/eval-result');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONTRACT_ROOT = path.join(__dirname, 'contracts');
const REVIEW_FIXTURE_PROJECT = path.join(__dirname, 'fixtures', 'test-review-cli', 'project');
const REVIEW_STUB_AGENT = path.join(__dirname, 'fixtures', 'test-review-cli', 'stub-agent.js');
const SELECTION_STUB_AGENT = path.join(__dirname, 'fixtures', 'fragment-selection-runner', 'stub-agent.js');

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
};

let failures = 0;

function assert(condition, label, detail) {
  if (condition) {
    console.log(`  ${colors.green}✓${colors.reset} ${label}`);
    return;
  }
  failures += 1;
  console.log(`  ${colors.red}✗ ${label}${colors.reset}`);
  if (detail) console.log(`    ${colors.dim}${detail}${colors.reset}`);
}

/** Every *.contract.json under test/contracts, at any depth, in a stable order. */
function findContracts(directory) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...findContracts(full));
    else if (entry.name.endsWith('.contract.json')) found.push(full);
  }
  return found;
}

// ---------------------------------------------------------------------------
// 1. every contract names a command TEA ships
// ---------------------------------------------------------------------------

function checkContractsAgainstRegistry() {
  console.log('\ncontracts name a command TEA ships');
  const registered = new Set(EXECUTION_TARGETS.map((target) => `${target.interfaceId}\u0000${target.executable}`));
  const declared = new Set();

  for (const file of findContracts(CONTRACT_ROOT)) {
    const relative = path.relative(PROJECT_ROOT, file);
    const contract = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const iface of contract.permittedInterfaces ?? []) {
      // Only a command interface belongs to this registry. An `api` interface
      // would be a different adapter's problem and is not silently accepted.
      assert(iface.kind === 'cli', `${relative}: ${iface.logicalId} is a cli interface`, `kind is ${iface.kind}`);
      for (const operation of iface.operations ?? []) {
        const executable = operation.invocation?.executable;
        const key = `${iface.logicalId}\u0000${executable}`;
        declared.add(key);
        assert(
          registered.has(key),
          `${relative}: ${iface.logicalId}/${operation.operationId} names a registered executable`,
          `no execution target is registered for interface "${iface.logicalId}" and executable "${executable}"`,
        );
        const subcommandPath = operation.invocation?.subcommandPath ?? [];
        const target = targetFor(iface.logicalId, executable);
        assert(
          target !== undefined && target.subcommandPaths.some((permitted) => JSON.stringify(permitted) === JSON.stringify(subcommandPath)),
          `${relative}: ${operation.operationId}'s subcommand path is authorized`,
          `[${subcommandPath.join(' ')}] is not among the registered paths`,
        );
      }
    }
  }

  // The reverse direction too. A registered target no contract names is a
  // command with no behavioral statement about it, which is the state the
  // registry exists to make visible rather than the state it exists to hide.
  for (const target of EXECUTION_TARGETS) {
    assert(
      declared.has(`${target.interfaceId}\u0000${target.executable}`),
      `${target.executable} is named by at least one contract`,
      'a registered execution target that no contract declares has no behavioral statement about it',
    );
  }
}

// ---------------------------------------------------------------------------
// 2. the policy denies by default
// ---------------------------------------------------------------------------

async function checkDefaultDeny(runDir) {
  console.log('\nthe policy denies by default');
  assert(targetProblems().length === 0, 'every registered target exists and is executable', targetProblems().join('; '));

  const { port } = await createProbePort({ cwd: runDir, interfaceIds: ['tea-fragment-selection-runner'] });

  const unregisteredInterface = await probeCommand(
    port,
    probeRequest({ probeId: 'deny-1', interfaceId: 'tea-nfr', operationId: 'assess', executable: 'tea-nfr' }),
    new AbortController().signal,
  );
  assert(
    !unregisteredInterface.ok && unregisteredInterface.failureClass === 'environment-configuration',
    'an unregistered interface is denied',
    JSON.stringify(unregisteredInterface),
  );

  const wrongExecutable = await probeCommand(
    port,
    probeRequest({
      probeId: 'deny-2',
      interfaceId: 'tea-fragment-selection-runner',
      operationId: 'select-fragments',
      executable: 'tea-test-review',
    }),
    new AbortController().signal,
  );
  assert(
    !wrongExecutable.ok && /no authorization names/.test(wrongExecutable.reason),
    'a registered interface cannot be pointed at another registered executable',
    JSON.stringify(wrongExecutable),
  );

  // A path cannot reach the executable field at all: the schema constrains it to
  // a lowercase hyphenated name, so the only place a real filesystem path
  // exists is the policy. A contract cannot smuggle one, and neither can a
  // caller assembling a request by hand.
  const pathAsExecutable = await probeCommand(
    port,
    probeRequest({
      probeId: 'deny-4',
      interfaceId: 'tea-fragment-selection-runner',
      operationId: 'select-fragments',
      executable: '/bin/sh',
    }),
    new AbortController().signal,
  );
  assert(
    !pathAsExecutable.ok && pathAsExecutable.failureClass === 'environment-parser',
    'a filesystem path is not a legal executable name',
    JSON.stringify(pathAsExecutable),
  );

  const wrongSubcommand = await probeCommand(
    port,
    probeRequest({
      probeId: 'deny-3',
      interfaceId: 'tea-fragment-selection-runner',
      operationId: 'select-fragments',
      subcommandPath: ['rm'],
    }),
    new AbortController().signal,
  );
  assert(
    !wrongSubcommand.ok && /subcommand path/.test(wrongSubcommand.reason),
    'an unauthorized subcommand path is denied',
    JSON.stringify(wrongSubcommand),
  );

  // An interface outside the policy is refused by the builder too, before any
  // request is shaped, so a caller cannot ask for one and get an empty policy
  // that denies everything for the wrong reason.
  let builderRefused = false;
  try {
    commandTargetPolicy({ cwd: runDir, interfaceIds: ['tea-nfr'] });
  } catch {
    builderRefused = true;
  }
  assert(builderRefused, 'the policy builder refuses an interface TEA ships no command for');
}

// ---------------------------------------------------------------------------
// 3. the adapter really drives a TEA command
// ---------------------------------------------------------------------------

async function checkTestReviewProbe(runDir) {
  console.log('\ntea-test-review through the adapter');
  const { port, policy } = await createProbePort({ cwd: runDir, interfaceIds: ['tea-test-review'] });
  const authorization = policy.authorizations[0];
  assert(authorization.cwd === runDir, 'the authorization pins the run directory the caller supplied');
  assert(authorization.maxOutputBytes > 0 && authorization.maxElapsedMs > 0, 'the authorization carries both budgets');

  // --json and --output resolve against --project-root, not against the process
  // working directory, while the policy's artifact map resolves against `cwd`.
  // The two agree only when the caller says so, and an absolute path is how it
  // says so without depending on which of the two directories won.
  const result = await probeCommand(
    port,
    probeRequest({
      probeId: 'review-corpus',
      interfaceId: 'tea-test-review',
      operationId: 'review-test-files',
      option: {
        files: './tests/checkout.spec.ts,tests/extra.spec.ts',
        'project-root': REVIEW_FIXTURE_PROJECT,
        output: path.join(runDir, 'test-review.md'),
        json: path.join(runDir, 'verdict.json'),
        'agent-cmd': REVIEW_STUB_AGENT,
        // A negated commander flag is its own option key. The adapter omits a
        // `false` value entirely, so `{isolate: false}` would send nothing and
        // the run would isolate itself under CI.
        'no-isolate': true,
        'env-pass': 'STUB_MODE',
      },
      environment: { STUB_MODE: 'approve' },
    }),
    new AbortController().signal,
  );

  assert(result.ok, 'the probe returned an observation', result.ok ? '' : result.reason);
  if (!result.ok) return;
  const observation = result.observation;
  assert(observation.kind === 'cli' && observation.probeId === 'review-corpus', 'the observation echoes the correlation identifiers');
  assert(observation.exitCode === 0, 'the approving stub review exits 0', `exitCode ${observation.exitCode}`);
  assert(
    observation.artifacts.verdict.kind === 'json',
    'the verdict artifact is read back as JSON',
    JSON.stringify(observation.artifacts.verdict).slice(0, 200),
  );
  assert(
    observation.artifacts.verdict.value?.recommendation === 'Approve with Comments',
    'the verdict carries the recommendation the stub produced',
    JSON.stringify(observation.artifacts.verdict.value?.recommendation),
  );
  assert(observation.artifacts.report.kind === 'text', 'the report artifact is read back as text');

  // An artifact the run did not write is `absent`, not a throw and not an empty
  // string. That is what lets a missing verdict be classified as a missing
  // artifact instead of being scored as an empty review.
  const absent = await createProbePort({
    cwd: runDir,
    interfaceIds: ['tea-test-review'],
    artifacts: { 'tea-test-review': { verdict: 'nothing-wrote-this.json' } },
  });
  const missing = await probeCommand(
    absent.port,
    probeRequest({
      probeId: 'review-missing-artifact',
      interfaceId: 'tea-test-review',
      operationId: 'review-test-files',
      option: {
        files: './tests/checkout.spec.ts',
        'project-root': REVIEW_FIXTURE_PROJECT,
        output: path.join(runDir, 'test-review.md'),
        json: path.join(runDir, 'verdict.json'),
        'agent-cmd': REVIEW_STUB_AGENT,
        'no-isolate': true,
        'env-pass': 'STUB_MODE',
      },
      environment: { STUB_MODE: 'approve' },
    }),
    new AbortController().signal,
  );
  assert(
    missing.ok && missing.observation.artifacts.verdict.kind === 'absent',
    'an artifact the run never wrote comes back absent',
    JSON.stringify(missing.ok ? missing.observation.artifacts : missing),
  );
}

async function checkFragmentSelectionProbe(runDir) {
  console.log('\ntea-fragment-selection-runner through the adapter');
  const { port } = await createProbePort({ cwd: runDir, interfaceIds: ['tea-fragment-selection-runner'] });
  const signal = new AbortController().signal;

  // Two environment names through one `--env-pass`, which is the repeatable
  // spelling under test as much as the modes are. An array option value reaches
  // the child as the flag repeated once per element, so the stub answering with
  // the list from STUB_FRAGMENTS proves the second occurrence arrived. Before
  // eval-quality 1.2.0 an array was one JSON token and the fixture had to pack
  // both values into one variable.
  const selectionRequest = (probeId, stubMode, stubFragments = 'test-quality.md,data-factories.md') =>
    probeRequest({
      probeId,
      interfaceId: 'tea-fragment-selection-runner',
      operationId: 'select-fragments',
      option: { agent: 'custom', 'agent-cmd': SELECTION_STUB_AGENT, 'env-pass': ['STUB_MODE', 'STUB_FRAGMENTS'] },
      environment: { STUB_MODE: stubMode, STUB_FRAGMENTS: stubFragments },
      stdin: { kind: 'text', value: 'Decide which knowledge fragments this run must load.' },
    });

  const bare = await probeCommand(port, selectionRequest('select-bare', 'fragments'), signal);
  assert(bare.ok, 'the probe returned an observation', bare.ok ? '' : bare.reason);
  if (bare.ok) {
    assert(bare.observation.exitCode === EXIT_CODES.none, 'a produced selection exits 0', `exitCode ${bare.observation.exitCode}`);
    assert(
      bare.observation.stdout.kind === 'json' &&
        JSON.stringify(bare.observation.stdout.value) === JSON.stringify({ fragments: ['test-quality.md', 'data-factories.md'] }),
      'stdout carries exactly the response descriptor key set',
      JSON.stringify(bare.observation.stdout),
    );
  }

  // The witness every fragment-selection contract declares is a differential
  // over stdin. Two prompts through one authorization must be able to produce
  // two selections, and the stub is the only part of that a model would own.
  const fenced = await probeCommand(port, selectionRequest('select-fenced', 'fenced', 'selector-resilience.md'), signal);
  assert(
    fenced.ok && JSON.stringify(fenced.observation.stdout.value) === JSON.stringify({ fragments: ['selector-resilience.md'] }),
    'a fenced reply is normalized to the same payload shape',
    JSON.stringify(fenced.ok ? fenced.observation.stdout : fenced),
  );
  assert(
    bare.ok && fenced.ok && JSON.stringify(bare.observation.stdout.value) !== JSON.stringify(fenced.observation.stdout.value),
    'two legs of one authorization can return different selections',
  );

  const prose = await probeCommand(port, selectionRequest('select-prose', 'prose'), signal);
  assert(
    prose.ok && prose.observation.exitCode === EXIT_CODES['environment-parser'],
    'a reply with no fragment list exits as environment-parser rather than as an empty selection',
    JSON.stringify(prose.ok ? prose.observation.exitCode : prose),
  );
  assert(
    prose.ok && failureClassForExit(prose.observation.exitCode) === 'environment-parser',
    'the exit code maps back to the class that produced it',
  );

  const agentFailed = await probeCommand(port, selectionRequest('select-fail', 'fail'), signal);
  assert(
    agentFailed.ok && failureClassForExit(agentFailed.observation.exitCode) === 'environment-transport',
    'a vendor that exits nonzero is reported as a transport failure, never as a selection',
    JSON.stringify(agentFailed.ok ? agentFailed.observation.exitCode : agentFailed),
  );
}

// ---------------------------------------------------------------------------
// 4. a killed run is classified, not scored
// ---------------------------------------------------------------------------

async function checkBudgets(runDir) {
  console.log('\nbudgets are enforced and classified');
  const { port } = await createProbePort({
    cwd: runDir,
    interfaceIds: ['tea-fragment-selection-runner'],
    budgets: { 'tea-fragment-selection-runner': { maxElapsedMs: 1500 } },
  });
  const started = Date.now();
  const killed = await probeCommand(
    port,
    probeRequest({
      probeId: 'select-slow',
      interfaceId: 'tea-fragment-selection-runner',
      operationId: 'select-fragments',
      option: { agent: 'custom', 'agent-cmd': SELECTION_STUB_AGENT, 'env-pass': 'STUB_MODE', 'timeout-ms': '60000' },
      environment: { STUB_MODE: 'slow' },
      stdin: { kind: 'text', value: 'hang' },
    }),
    new AbortController().signal,
  );
  const elapsed = Date.now() - started;
  assert(
    !killed.ok && killed.failureClass === 'environment-timeout',
    'exceeding the wall clock is an environment timeout',
    JSON.stringify(killed),
  );
  assert(elapsed < 30_000, 'the process is actually killed rather than waited out', `${elapsed}ms`);

  // The classification table itself, over the four codes the port may throw.
  assert(failureClassForFault({ code: 'forbidden-target' }) === 'environment-configuration', 'forbidden-target is a configuration failure');
  assert(
    failureClassForFault({ code: 'budget-exhausted', detail: 'exceeded maxElapsedMs (10ms) and was killed' }) === 'environment-timeout',
    'a wall-clock budget exhaustion is a timeout',
  );
  assert(
    failureClassForFault({ code: 'budget-exhausted', detail: 'stdout or stderr exceeded maxOutputBytes (10)' }) === 'environment-transport',
    'an output-cap exhaustion is a transport failure and not a slow run',
  );
  assert(failureClassForFault({ code: 'aborted' }) === 'environment-timeout', 'an abort is a timeout');
  assert(failureClassForFault({ code: 'port-failure' }) === 'environment-transport', 'a transport failure is a transport failure');
  for (const failureClass of Object.keys(EXIT_CODES)) {
    if (failureClass === 'usage') continue;
    assert(FAILURE_CLASSES.includes(failureClass), `${failureClass} is a declared TEA failure class`);
  }
}

// ---------------------------------------------------------------------------
// the runner's own declarations
// ---------------------------------------------------------------------------

function checkRunnerDeclarations() {
  console.log('\nthe runner declares what the generator reads');
  assert(
    SELECTION_REQUEST_KEYS.option.required.every((key) => SELECTION_REQUEST_KEYS.option.permitted.includes(key)),
    'every required option key is also permitted',
  );
  assert(SELECTION_REQUEST_KEYS.stdin.required.includes('prompt'), 'the prompt is required on standard input');
  assert(
    SELECTION_REQUEST_KEYS.environment.permitted.includes('HOME'),
    'HOME is a permitted environment key, because the adapter passes the child nothing else that could reach a stored login',
  );

  // The suite's capability declaration is checked against the harness constant by
  // tools/validate-eval-schemas.js, and the command is what actually hands the
  // capability to the vendor now that the harness probes rather than spawns. So
  // the two constants have to agree, or the manifest describes a confinement the
  // run does not get.
  assert(
    JSON.stringify([...HARNESS_DECLARED_CAPABILITIES].sort()) === JSON.stringify([...RUNNER_DECLARED_CAPABILITIES].sort()),
    'the harness and the command declare the same runner capabilities',
    `harness ${JSON.stringify(HARNESS_DECLARED_CAPABILITIES)} vs command ${JSON.stringify(RUNNER_DECLARED_CAPABILITIES)}`,
  );

  // cli/fragment-selection-runner.js restates test/lib/eval-record.js's error
  // classification rather than importing it, so a shipped file does not depend
  // on the eval harness. Restating it is only safe while the two agree, so the
  // two are run against the same errors and compared.
  const errorCases = [
    { code: 'AGENT_UNKNOWN', message: 'Unknown agent "x"' },
    { code: 'AGENT_COMMAND_REQUIRED', message: 'requires an explicit --agent-cmd executable' },
    { code: 'MODEL_ARG_INVALID', message: 'must be a bare model name' },
    { code: 'MODEL_ARG_CONFLICT', message: 'declares the model 2 times' },
    { code: 'MODEL_UNSUPPORTED', message: 'is not supported by the custom adapter' },
    { code: 'AGENT_NOT_FOUND', message: 'agent executable not found: codex' },
    { code: 'AGENT_FAILED', message: 'Agent "codex" failed: timed out after 1ms (SIGTERM sent)' },
    { code: 'AGENT_FAILED', message: 'Agent "codex" exited with code 1.' },
    { code: 'AGENT_FAILED', message: 'Agent "codex" was killed by signal SIGKILL.' },
  ];
  for (const probe of errorCases) {
    const error = Object.assign(new Error(probe.message), { code: probe.code });
    const shared = classifyAgentError(error);
    const runner = classOfAgentError(error);
    assert(shared === runner, `${probe.code} classifies the same in the runner and in eval-record`, `${runner} vs ${shared}`);
    assert(FAILURE_CLASSES.includes(runner), `${probe.code} classifies to a declared TEA failure class`, runner);
    assert(Object.hasOwn(EXIT_CODES, runner), `${probe.code} classifies to a class this command can exit with`, runner);
  }
}

async function main() {
  console.log('probe targets and the eval-quality command-line adapter');
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-probe-'));
  try {
    checkContractsAgainstRegistry();
    checkRunnerDeclarations();
    await checkDefaultDeny(runDir);
    await checkTestReviewProbe(runDir);
    await checkFragmentSelectionProbe(runDir);
    await checkBudgets(runDir);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.log(`\n${colors.red}${failures} check(s) failed.${colors.reset}\n`);
    process.exit(1);
  }
  console.log(`\n${colors.green}every probe-target check passed.${colors.reset}\n`);
}

main().catch((error) => {
  console.error(`${colors.red}probe targets: ${error.stack ?? error.message}${colors.reset}`);
  process.exit(1);
});
