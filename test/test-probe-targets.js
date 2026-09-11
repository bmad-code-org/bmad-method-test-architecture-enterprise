/**
 * The command-probe layer, end to end, with no credential and no model call.
 *
 * TEA measures its skills by running a command and reading what it wrote. That
 * mechanism is now eval-quality's `createCommandLineAdapter` rather than three
 * hand-rolled `spawnSync` blocks, and this file is what says so is true: it
 * drives every one of TEA's four real command targets through the real adapter
 * and the real policy, with a stub agent standing in for the vendor, and asserts
 * the observation that comes back.
 *
 * Six things are checked here and nowhere else.
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
 *    verdict artifact the adapter reads back as JSON; a real
 *    `tea-fragment-selection-runner` run producing a selection on stdout; a
 *    real `tea-trace-runner` run leaving a summary and a matrix the adapter reads
 *    back as JSON and as text, at the registry's default paths and at the
 *    per-run paths a staged workspace supplies; and a real `tea-nfr-runner` run
 *    leaving its one report, read back the same two ways. All are free: the
 *    vendor is a stub, and the only assertions are about the plumbing.
 *
 * 4. **A killed run is classified, not scored.** A budget exhaustion comes back
 *    as an environment failure with a class, never as a measurement.
 *
 * 5. **The behavioral harnesses run end to end against the stub.**
 *    `test/eval-trace.js` and `test/eval-test-design.js` are spawned the way an
 *    operator spawns them, each with its own stub as a custom runner, and their
 *    result records are read back: every declared repetition completed and every
 *    threshold met on a correct run, a quality failure naming fixture mutations
 *    when the run writes into the corpus it was handed, and a missing-artifact
 *    failure when it writes no deliverable. The test-design half also drives
 *    three documents carrying one known defect each, so the metric the record
 *    names can be compared with the defect that produced it. That is the whole
 *    chain, from argv to the record, with no credential.
 *
 * 6. **The environment probes are bounded.** The `--version`, `git` and keychain
 *    probes are nobody's system under test and stayed hand-rolled, so each one
 *    is driven against a child that never returns. A pre-flight that blocks
 *    forever leaves CI watching a job that will never end.
 *
 * Usage: node test/test-probe-targets.js
 * Exit codes: 0 every check passed, 1 a check failed
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  EXECUTION_TARGETS,
  commandTargetPolicy,
  createProbePort,
  failureClassForFault,
  observedText,
  permittedEnvironmentKeys,
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
const { PROBE_TIMEOUT_MS, boundedProbe } = require('./lib/bounded-probe');
const {
  EXIT_CODES: TRACE_EXIT_CODES,
  RUNNER_CAPABILITIES: TRACE_RUNNER_DECLARED_CAPABILITIES,
  TRACE_REQUEST_KEYS,
  classOfAgentError: traceClassOfAgentError,
  failureClassForExit: traceFailureClassForExit,
} = require('../cli/trace-runner');
const { RUNNER_CAPABILITIES: TRACE_HARNESS_DECLARED_CAPABILITIES } = require('./eval-trace');
const { RUNNER_CAPABILITIES: TEST_DESIGN_RUNNER_DECLARED_CAPABILITIES } = require('../cli/test-design-runner');
const {
  RUNNER_CAPABILITIES: TEST_DESIGN_HARNESS_DECLARED_CAPABILITIES,
  THRESHOLDS: TEST_DESIGN_THRESHOLDS,
} = require('./eval-test-design');
const {
  EXIT_CODES: NFR_EXIT_CODES,
  RUNNER_CAPABILITIES: NFR_RUNNER_DECLARED_CAPABILITIES,
  NFR_REQUEST_KEYS,
  classOfAgentError: nfrClassOfAgentError,
  failureClassForExit: nfrFailureClassForExit,
} = require('../cli/nfr-runner');
const { RUNNER_CAPABILITIES: NFR_HARNESS_DECLARED_CAPABILITIES } = require('./eval-nfr');
const { classifyAgentError } = require('./lib/eval-record');
const { FAILURE_CLASSES } = require('./schema/eval-result');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONTRACT_ROOT = path.join(__dirname, 'contracts');
const REVIEW_FIXTURE_PROJECT = path.join(__dirname, 'fixtures', 'test-review-cli', 'project');
const REVIEW_STUB_AGENT = path.join(__dirname, 'fixtures', 'test-review-cli', 'stub-agent.js');
const SELECTION_STUB_AGENT = path.join(__dirname, 'fixtures', 'fragment-selection-runner', 'stub-agent.js');
const TRACE_STUB_AGENT = path.join(__dirname, 'fixtures', 'trace-runner', 'stub-agent.js');
const NFR_STUB_AGENT = path.join(__dirname, 'fixtures', 'nfr-runner', 'stub-agent.js');
const TRACE_HARNESS = path.join(__dirname, 'eval-trace.js');
const NFR_HARNESS = path.join(__dirname, 'eval-nfr.js');
const TEST_DESIGN_STUB_AGENT = path.join(__dirname, 'fixtures', 'test-design-runner', 'stub-agent.js');
const TEST_DESIGN_HARNESS = path.join(__dirname, 'eval-test-design.js');

/**
 * The environment names the three stub agents read, passed through `--env-pass`.
 *
 * They belong to no contract: they are how this file drives a stub instead of a
 * vendor. The authorization has to name them, because the adapter refuses any
 * key a request declares that the authorization does not permit, which is what
 * makes them the exact demonstration of the widening `environmentKeys` is for.
 */
const STUB_ENVIRONMENT_KEYS = ['STUB_FRAGMENTS', 'STUB_MODE'];

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
        // The environment channel, held the same way the subcommand path is.
        // The contract states which keys a request may carry and the policy
        // states which reach the process, and on 3.0.0 a key the policy omits
        // is refused before anything spawns. Equal rather than contained,
        // because a policy narrower than the contract turns a declared key into
        // a run-time denial and a policy wider than it permits a key no
        // behavioral statement mentions.
        const contractKeys = [...(operation.requestShape?.environment?.permittedKeys ?? [])].sort();
        const policyKeys = target === undefined ? [] : permittedEnvironmentKeys(iface.logicalId);
        assert(
          JSON.stringify(contractKeys) === JSON.stringify(policyKeys),
          `${relative}: ${operation.operationId}'s environment keys are the ones its authorization permits`,
          `contract ${JSON.stringify(contractKeys)}, policy ${JSON.stringify(policyKeys)}`,
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

  // The environment channel. `permittedEnvironmentKeys` is required on 3.0.0
  // with no default, so every authorization states it, and no authorization may
  // state PATH: `target` may name a bare command and a declared PATH would then
  // choose which binary runs.
  const { authorizations } = commandTargetPolicy({ cwd: runDir });
  for (const authorization of authorizations) {
    assert(
      Array.isArray(authorization.permittedEnvironmentKeys),
      `${authorization.interfaceId} declares permittedEnvironmentKeys`,
      JSON.stringify(authorization.permittedEnvironmentKeys),
    );
    assert(
      !authorization.permittedEnvironmentKeys.some((key) => key.toUpperCase() === 'PATH'),
      `${authorization.interfaceId} permits no PATH`,
      JSON.stringify(authorization.permittedEnvironmentKeys),
    );
  }

  // PATH cannot be introduced by the one mechanism that widens an
  // authorization. The adapter and the schema both refuse it too, later; this
  // is the boundary where an operator's `--env-pass PATH` would otherwise reach
  // a policy at all.
  let pathRefused = false;
  try {
    commandTargetPolicy({ cwd: runDir, interfaceIds: ['tea-test-review'], environmentKeys: { 'tea-test-review': ['PATH'] } });
  } catch {
    pathRefused = true;
  }
  assert(pathRefused, 'the policy builder refuses PATH through the environment widening');

  // An override keyed by an interface the policy does not carry widens nothing.
  // Unnoticed, every request of that harness would carry names the
  // authorization never permitted and every live run would be a lost run.
  let unknownOverrideRefused = false;
  try {
    commandTargetPolicy({ cwd: runDir, interfaceIds: ['tea-test-review'], environmentKeys: { 'tea-test-revue': ['STUB_MODE'] } });
  } catch {
    unknownOverrideRefused = true;
  }
  assert(unknownOverrideRefused, 'the policy builder refuses a per-interface override for an interface it does not authorize');

  // This port permits the three commands' own keys and nothing else, so a stub
  // variable is a key the authorization does not name. The denial is the
  // adapter's, and it happens before a process exists.
  const undeclaredEnvironmentKey = await probeCommand(
    port,
    probeRequest({
      probeId: 'deny-5',
      interfaceId: 'tea-fragment-selection-runner',
      operationId: 'select-fragments',
      environment: { STUB_MODE: 'approve' },
      stdin: { kind: 'text', value: 'never reaches a process' },
    }),
    new AbortController().signal,
  );
  assert(
    !undeclaredEnvironmentKey.ok && /not permitted by this authorization/.test(undeclaredEnvironmentKey.reason),
    'an environment key the authorization does not permit is denied',
    JSON.stringify(undeclaredEnvironmentKey),
  );

  // A name that is not a legal environment key fails at the port boundary, on
  // the request parse, rather than being handed to a spawned process. The
  // package's own `EnvironmentKeyName` decides what is legal; TEA asserts the
  // refusal rather than restating the pattern.
  const malformedEnvironmentKey = await probeCommand(
    port,
    probeRequest({
      probeId: 'deny-6',
      interfaceId: 'tea-fragment-selection-runner',
      operationId: 'select-fragments',
      environment: { 'not a key': 'value' },
      stdin: { kind: 'text', value: 'never reaches a process' },
    }),
    new AbortController().signal,
  );
  assert(
    !malformedEnvironmentKey.ok && malformedEnvironmentKey.failureClass === 'environment-parser',
    'an environment key that is not a legal name fails at the port boundary',
    JSON.stringify(malformedEnvironmentKey),
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
  const { port, policy } = await createProbePort({
    cwd: runDir,
    interfaceIds: ['tea-test-review'],
    environmentKeys: { 'tea-test-review': STUB_ENVIRONMENT_KEYS },
  });
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
    environmentKeys: { 'tea-test-review': STUB_ENVIRONMENT_KEYS },
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
  const { port } = await createProbePort({
    cwd: runDir,
    interfaceIds: ['tea-fragment-selection-runner'],
    environmentKeys: { 'tea-fragment-selection-runner': STUB_ENVIRONMENT_KEYS },
  });
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

/**
 * One tea-trace-runner probe against the stub, in a fresh working directory
 * under `runDir`, because the stub writes where the previous probe wrote and a
 * second probe expecting `absent` would otherwise read the first probe's files.
 */
async function traceProbe(runDir, probeId, stubMode, { artifacts, budgets, stage } = {}) {
  const cwd = fs.mkdtempSync(path.join(runDir, 'trace-'));
  if (stage) stage(cwd);
  const { port } = await createProbePort({
    cwd,
    interfaceIds: ['tea-trace-runner'],
    ...(artifacts ? { artifacts: { 'tea-trace-runner': artifacts } } : {}),
    ...(budgets ? { budgets: { 'tea-trace-runner': budgets } } : {}),
    environmentKeys: { 'tea-trace-runner': STUB_ENVIRONMENT_KEYS },
  });
  return probeCommand(
    port,
    probeRequest({
      probeId,
      interfaceId: 'tea-trace-runner',
      operationId: 'trace-fixture-set',
      option: { agent: 'custom', 'agent-cmd': TRACE_STUB_AGENT, 'env-pass': 'STUB_MODE', 'timeout-ms': '60000' },
      environment: { STUB_MODE: stubMode },
      stdin: { kind: 'text', value: 'Run the trace workflow against project/ and write both deliverables.' },
    }),
    new AbortController().signal,
  );
}

async function checkTraceProbe(runDir) {
  console.log('\ntea-trace-runner through the adapter');

  // The registry's default artifact map: the workflow's own paths under a project
  // root that is the working directory. The stub, given no project/, writes there.
  const complete = await traceProbe(runDir, 'trace-complete', 'complete');
  assert(complete.ok, 'the probe returned an observation', complete.ok ? '' : complete.reason);
  if (complete.ok) {
    const { observation } = complete;
    assert(observation.exitCode === TRACE_EXIT_CODES.none, 'a completed trace run exits 0', `exitCode ${observation.exitCode}`);
    assert(
      observation.artifacts.summary.kind === 'json' && observation.artifacts.summary.value?.gate_status === 'FAIL',
      'the summary artifact is read back as JSON at the registry default path',
      JSON.stringify(observation.artifacts.summary).slice(0, 200),
    );
    assert(
      observation.artifacts.matrix.kind === 'text' && /^#{2,6}\s+AC-1\b/m.test(observation.artifacts.matrix.value),
      'the matrix artifact is read back as text at the registry default path',
      JSON.stringify(observation.artifacts.matrix).slice(0, 200),
    );
    assert(
      observation.stdout.kind === 'text' && /Wrote .*traceability-matrix\.md/.test(observation.stdout.value),
      'the runner forwards what the agent printed',
      JSON.stringify(observation.stdout).slice(0, 200),
    );
  }

  // The per-run override the harness supplies: the workspace holds project/, so
  // the artifacts sit one directory down from the authorization cwd. The staged
  // epic is the clean set's, and the stub picks its pair by that, so the gate
  // read back says which artifact map won.
  const staged = await traceProbe(runDir, 'trace-staged', 'complete', {
    artifacts: {
      summary: path.join('project', 'test-artifacts', 'e2e-trace-summary.json'),
      matrix: path.join('project', 'test-artifacts', 'traceability-matrix.md'),
    },
    stage: (cwd) => {
      fs.mkdirSync(path.join(cwd, 'project', 'docs', 'epics'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'project', 'docs', 'epics', 'epic-5-api-token-lifecycle.md'), '# Epic 5\n', 'utf8');
    },
  });
  assert(
    staged.ok && staged.observation.artifacts.summary.kind === 'json' && staged.observation.artifacts.summary.value?.gate_status === 'PASS',
    'a per-run artifact override reads the pair the stub wrote under project/',
    JSON.stringify(staged.ok ? staged.observation.artifacts.summary : staged).slice(0, 200),
  );

  // An artifact the run never wrote is `absent`, not a throw and not an empty
  // string, which is what lets the harness classify it as a missing artifact.
  const nothing = await traceProbe(runDir, 'trace-nothing', 'nothing');
  assert(
    nothing.ok &&
      nothing.observation.exitCode === TRACE_EXIT_CODES.none &&
      nothing.observation.artifacts.summary.kind === 'absent' &&
      nothing.observation.artifacts.matrix.kind === 'absent',
    'a run that wrote neither deliverable exits 0 with both artifacts absent',
    JSON.stringify(nothing.ok ? nothing.observation.artifacts : nothing),
  );

  // A summary that is not JSON comes back as `text`, so the harness reads a parser
  // failure off the tag rather than off a JSON.parse in a try.
  const invalid = await traceProbe(runDir, 'trace-invalid-json', 'invalid-json');
  assert(
    invalid.ok && invalid.observation.artifacts.summary.kind === 'text' && invalid.observation.artifacts.matrix.kind === 'text',
    'a summary that is not JSON is read back as text beside a text matrix',
    JSON.stringify(invalid.ok ? Object.fromEntries(Object.entries(invalid.observation.artifacts).map(([id, a]) => [id, a.kind])) : invalid),
  );

  // A vendor that exits nonzero is the runner's transport class, on the exit code.
  const failed = await traceProbe(runDir, 'trace-fail', 'fail');
  assert(
    failed.ok && traceFailureClassForExit(failed.observation.exitCode) === 'environment-transport',
    'a vendor that exits nonzero is reported as a transport failure on the exit code',
    JSON.stringify(failed.ok ? failed.observation.exitCode : failed),
  );

  // The outer clock, lowered from the registry's 21-minute backstop, kills a run
  // that hangs, and the kill is a timeout.
  const started = Date.now();
  const killed = await traceProbe(runDir, 'trace-slow', 'slow', { budgets: { maxElapsedMs: 1500 } });
  assert(
    !killed.ok && killed.failureClass === 'environment-timeout',
    'exceeding the trace authorization wall clock is an environment timeout',
    JSON.stringify(killed),
  );
  assert(Date.now() - started < 30_000, 'the hung trace run is actually killed rather than waited out');
}

/**
 * One tea-nfr-runner probe against the stub, in a fresh working directory under
 * `runDir`, because the stub writes where the previous probe wrote and a second
 * probe expecting `absent` would otherwise read the first probe's file.
 */
async function nfrProbe(runDir, probeId, stubMode, { artifacts, prompt } = {}) {
  const cwd = fs.mkdtempSync(path.join(runDir, 'nfr-'));
  const { port } = await createProbePort({
    cwd,
    interfaceIds: ['tea-nfr-runner'],
    ...(artifacts ? { artifacts: { 'tea-nfr-runner': artifacts } } : {}),
    environmentKeys: { 'tea-nfr-runner': STUB_ENVIRONMENT_KEYS },
  });
  return probeCommand(
    port,
    probeRequest({
      probeId,
      interfaceId: 'tea-nfr-runner',
      operationId: 'audit-evidence-bundle',
      option: { agent: 'custom', 'agent-cmd': NFR_STUB_AGENT, 'env-pass': 'STUB_MODE', 'timeout-ms': '60000' },
      environment: { STUB_MODE: stubMode },
      stdin: { kind: 'text', value: prompt ?? 'Audit the evidence bundle and write the report the workflow declares.' },
    }),
    new AbortController().signal,
  );
}

async function checkNfrProbe(runDir) {
  console.log('\ntea-nfr-runner through the adapter');

  // The registry's default artifact map: the workflow's own path under a project
  // root that is the working directory. The stub, given no project root in the
  // prompt, writes there.
  const complete = await nfrProbe(runDir, 'nfr-complete', 'complete');
  assert(complete.ok, 'the probe returned an observation', complete.ok ? '' : complete.reason);
  if (complete.ok) {
    const { observation } = complete;
    assert(observation.exitCode === NFR_EXIT_CODES.none, 'a completed NFR run exits 0', `exitCode ${observation.exitCode}`);
    assert(
      observation.artifacts.report.kind === 'text' && /^#{2,6}\s+Security Assessment$/m.test(observation.artifacts.report.value),
      'the report artifact is read back as text at the registry default path',
      JSON.stringify(observation.artifacts.report).slice(0, 200),
    );
    assert(
      observation.stdout.kind === 'text' && /Wrote .*nfr-assessment\.md/.test(observation.stdout.value),
      'the runner forwards what the agent printed',
      JSON.stringify(observation.stdout).slice(0, 200),
    );
  }

  // The per-run override the harness supplies: the workspace holds the bundle
  // under its own project root, so the report sits one directory down from the
  // authorization cwd. The prompt names that root, and the stub picks its report
  // by it, so the overall status read back says which artifact map won.
  const staged = await nfrProbe(runDir, 'nfr-staged', 'complete', {
    artifacts: { report: path.join('atlas-notification-relay', 'test-artifacts', 'nfr-assessment.md') },
    prompt: '- `{project-root}`: `atlas-notification-relay`\n',
  });
  assert(
    staged.ok &&
      staged.observation.artifacts.report.kind === 'text' &&
      /overall_status: 'PASS'/.test(staged.observation.artifacts.report.value),
    'a per-run artifact override reads the report the stub wrote under the project root the prompt named',
    JSON.stringify(staged.ok ? staged.observation.artifacts.report : staged).slice(0, 200),
  );

  // An artifact the run never wrote is `absent`, not a throw and not an empty
  // string, which is what lets the harness classify it as a missing artifact.
  const nothing = await nfrProbe(runDir, 'nfr-nothing', 'nothing');
  assert(
    nothing.ok && nothing.observation.exitCode === NFR_EXIT_CODES.none && nothing.observation.artifacts.report.kind === 'absent',
    'a run that wrote no report exits 0 with the artifact absent',
    JSON.stringify(nothing.ok ? nothing.observation.artifacts : nothing),
  );

  // A vendor that exits nonzero is the runner's transport class, on the exit code.
  const failed = await nfrProbe(runDir, 'nfr-fail', 'fail');
  assert(
    failed.ok && nfrFailureClassForExit(failed.observation.exitCode) === 'environment-transport',
    'a vendor that exits nonzero is reported as a transport failure on the exit code',
    JSON.stringify(failed.ok ? failed.observation.exitCode : failed),
  );
}

// ---------------------------------------------------------------------------
// 5. the behavioral harnesses run end to end against the stub
// ---------------------------------------------------------------------------

/**
 * One behavioral harness spawned the way an operator spawns it: that suite's stub
 * as a custom runner, STUB_MODE passed through, a result record requested.
 *
 * The two harnesses share this because they share the operator's command line: one
 * vendor selection, one environment passthrough, one `--json` path read back the
 * same way. A second copy would let one suite's spawn drift, and then a green check
 * here would say nothing about how the other suite behaves for an operator.
 */
function runHarnessAgainstStub(harness, stubAgent, jsonPath, stubMode, extraArgs) {
  const result = spawnSync(
    process.execPath,
    [harness, '--agent', 'custom', '--agent-cmd', stubAgent, '--env-pass', 'STUB_MODE', '--json', jsonPath, ...extraArgs],
    { cwd: PROJECT_ROOT, encoding: 'utf8', env: { ...process.env, STUB_MODE: stubMode }, timeout: 300_000 },
  );
  let record = null;
  if (fs.existsSync(jsonPath)) {
    try {
      record = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch {
      record = null;
    }
  }
  return { status: result.status, stderr: String(result.stderr ?? ''), stdout: String(result.stdout ?? ''), record };
}

function runTraceHarness(runDir, stubMode, extraArgs) {
  return runHarnessAgainstStub(TRACE_HARNESS, TRACE_STUB_AGENT, path.join(runDir, `trace-harness-${stubMode}.json`), stubMode, extraArgs);
}

function runTestDesignHarness(runDir, stubMode, extraArgs) {
  return runHarnessAgainstStub(
    TEST_DESIGN_HARNESS,
    TEST_DESIGN_STUB_AGENT,
    path.join(runDir, `test-design-harness-${stubMode}.json`),
    stubMode,
    extraArgs,
  );
}

function runNfrHarness(runDir, stubMode, extraArgs) {
  return runHarnessAgainstStub(NFR_HARNESS, NFR_STUB_AGENT, path.join(runDir, `nfr-harness-${stubMode}.json`), stubMode, extraArgs);
}

/**
 * The nfr harness end to end against its stub.
 *
 * This is the check whose absence let the suite ship having never completed a
 * run. `npm test` drives `test/eval-nfr.js --validate-only`, which returns before
 * the pre-flight and before any `runCase`, and the manifest's declared
 * `preflightArgs` stop at the vendor CLI. So the request assembly one line later
 * was broken, every gate in the tree was green, and the skill's `deferred` entry
 * was deleted on the strength of it. `hostEnvironment` had gained an interface id
 * as its first parameter and this harness was still passing its `--env-pass`
 * array there, which threw before a process started.
 *
 * What it asserts is what the trace and test-design smokes assert, because the
 * three harnesses fail in the same ways: every declared repetition completes on a
 * correct run, a run that writes into the corpus is a measured quality failure
 * naming the ceiling it broke, and a run that wrote no artifact is an environment
 * failure with a class rather than a low score.
 */
function checkNfrHarnessSmoke(runDir) {
  console.log('\nthe nfr harness end to end against the stub');

  const complete = runNfrHarness(runDir, 'complete', ['--runs', '2']);
  assert(
    complete.status === 0,
    'a correct audit of both bundles, twice, exits 0',
    complete.stderr.trim().split('\n').slice(-3).join(' | '),
  );
  assert(
    complete.record?.mode === 'live' && complete.record?.failureClass === 'none',
    'the record is a live run with no failure class',
    JSON.stringify(complete.record && { mode: complete.record.mode, failureClass: complete.record.failureClass }),
  );
  const runner = complete.record?.runners?.[0];
  assert(
    runner?.repetitions?.expected === 4 && runner?.repetitions?.completed === 4,
    'every declared repetition completed: two bundles, two runs each',
    JSON.stringify(runner?.repetitions),
  );
  assert(runner?.failures?.length === 0, 'every threshold is met on the correct audit', JSON.stringify(runner?.failures));
  assert(
    runner?.version === 'stub-agent 1.0.0',
    'the pre-flight recorded the version the stub answered --version with',
    JSON.stringify(runner?.version),
  );
  assert(runner?.parameters?.envPassNames?.includes('STUB_MODE'), 'the record names the environment variable the operator passed through');

  // The workflow audits evidence and produces none, so a write into the bundle is
  // a measured quality failure. This is the only path that reaches
  // maxFixtureMutations at all, which is what its threshold comment promises.
  const mutate = runNfrHarness(runDir, 'mutate', ['--runs', '1', '--set', 'gapped-harbor-billing-ledger']);
  assert(mutate.status === 1, 'a run that writes into the evidence bundle exits 1', `exit ${mutate.status}`);
  assert(
    mutate.record?.failureClass === 'quality' && mutate.record?.runners?.[0]?.failures?.includes('fixture mutations'),
    'the record carries a quality failure naming fixture mutations',
    JSON.stringify(mutate.record?.runners?.[0]?.failures),
  );

  // Nothing written is an environment failure with a class, never a low score.
  const nothing = runNfrHarness(runDir, 'nothing', ['--runs', '1', '--set', 'gapped-harbor-billing-ledger']);
  assert(nothing.status === 2, 'a run that wrote no report exits 2', `exit ${nothing.status}`);
  assert(
    nothing.record?.failureClass === 'environment-missing-artifact' && nothing.record?.runners?.[0]?.repetitions?.completed === 0,
    'the record classifies the lost run as a missing artifact and counts no completed repetition',
    JSON.stringify(nothing.record && { failureClass: nothing.record.failureClass, repetitions: nothing.record.runners?.[0]?.repetitions }),
  );
}

function checkTraceHarnessSmoke(runDir) {
  console.log('\nthe trace harness end to end against the stub');

  const complete = runTraceHarness(runDir, 'complete', ['--runs', '2']);
  assert(complete.status === 0, 'a correct run of both sets, twice, exits 0', complete.stderr.trim().split('\n').slice(-3).join(' | '));
  assert(
    complete.record?.mode === 'live' && complete.record?.failureClass === 'none',
    'the record is a live run with no failure class',
    JSON.stringify(complete.record && { mode: complete.record.mode, failureClass: complete.record.failureClass }),
  );
  const runner = complete.record?.runners?.[0];
  assert(
    runner?.repetitions?.expected === 4 && runner?.repetitions?.completed === 4,
    'every declared repetition completed: two sets, two runs each',
    JSON.stringify(runner?.repetitions),
  );
  assert(runner?.failures?.length === 0, 'every threshold is met on the correct run', JSON.stringify(runner?.failures));
  assert(
    runner?.version === 'stub-agent 1.0.0',
    'the pre-flight recorded the version the stub answered --version with',
    JSON.stringify(runner?.version),
  );
  assert(runner?.parameters?.envPassNames?.includes('STUB_MODE'), 'the record names the environment variable the operator passed through');

  // The one thing the workflow says it never does, counted. A run that wrote a
  // test into the corpus is a measured quality failure, and the record says which.
  const mutate = runTraceHarness(runDir, 'mutate', ['--runs', '1', '--set', 'seeded-tenant-data-export']);
  assert(mutate.status === 1, 'a run that writes a test into the corpus exits 1', `exit ${mutate.status}`);
  assert(
    mutate.record?.failureClass === 'quality' && mutate.record?.runners?.[0]?.failures?.includes('fixture mutations'),
    'the record carries a quality failure naming fixture mutations',
    JSON.stringify(mutate.record?.runners?.[0]?.failures),
  );

  // Nothing written is an environment failure with a class, never a low score.
  const nothing = runTraceHarness(runDir, 'nothing', ['--runs', '1', '--set', 'seeded-tenant-data-export']);
  assert(nothing.status === 2, 'a run that wrote no artifact exits 2', `exit ${nothing.status}`);
  assert(
    nothing.record?.failureClass === 'environment-missing-artifact' && nothing.record?.runners?.[0]?.repetitions?.completed === 0,
    'the record classifies the lost run as a missing artifact and counts no completed repetition',
    JSON.stringify(nothing.record && { failureClass: nothing.record.failureClass, repetitions: nothing.record.runners?.[0]?.repetitions }),
  );
}

/**
 * One seeded case, once. Every document below is written about the seeded epic, so
 * the clean control has nothing to say about any of them, and a stub repeating
 * itself byte for byte measures the same thing twice.
 */
const SEEDED_DESIGN_CASE = ['--runs', '1', '--set', 'seeded-offline-order-capture'];

/** The failures a runner record names, as the array the harness wrote. */
function recordedFailures(result) {
  return result.record?.runners?.[0]?.failures;
}

function checkTestDesignHarnessSmoke(runDir) {
  console.log('\nthe test-design harness end to end against the stub');

  const complete = runTestDesignHarness(runDir, 'complete', ['--runs', '2']);
  assert(complete.status === 0, 'a correct run of both sets, twice, exits 0', complete.stderr.trim().split('\n').slice(-3).join(' | '));
  assert(
    complete.record?.mode === 'live' && complete.record?.failureClass === 'none',
    'the record is a live run with no failure class',
    JSON.stringify(complete.record && { mode: complete.record.mode, failureClass: complete.record.failureClass }),
  );
  const runner = complete.record?.runners?.[0];
  assert(
    runner?.repetitions?.expected === 4 && runner?.repetitions?.completed === 4,
    'every declared repetition completed: two sets, two runs each',
    JSON.stringify(runner?.repetitions),
  );
  assert(runner?.failures?.length === 0, 'every threshold is met on the correct run', JSON.stringify(runner?.failures));

  // The gate again, read off the record itself, because the record is what a later
  // reader holds. A metric no run could answer is written as null there, and a reader
  // comparing null with a threshold would call it met; this says every one of them is
  // a number that clears its own bar.
  const measurements = runner?.measurements ?? {};
  const unmet = Object.entries(TEST_DESIGN_THRESHOLDS)
    // The `max` keys are ceilings on counts and are read on the next assertion.
    .filter(([key]) => !key.startsWith('max'))
    .filter(([key, threshold]) => !(typeof measurements[key] === 'number' && measurements[key] >= threshold))
    .map(([key]) => key);
  assert(unmet.length === 0, 'every declared threshold is measured as a number and met in the record', unmet.join(', '));
  assert(
    measurements.riskCeilingExcess === 0 &&
      measurements.ungroundedRisks === 0 &&
      measurements.topSeverityMissed === 0 &&
      measurements.fixtureMutations === 0,
    'neither set exceeds its ceiling, no row reads as one the epic rules out, the most severe risks are reported, and the staged corpus is unchanged',
    JSON.stringify({
      riskCeilingExcess: measurements.riskCeilingExcess,
      ungroundedRisks: measurements.ungroundedRisks,
      fixtureMutations: measurements.fixtureMutations,
    }),
  );

  // The one thing the prompt forbids in as many words. A run that edited the epic it
  // was handed has moved the benchmark, and the next run would be measured against a
  // corpus this one rewrote, so the record has to name it.
  const mutate = runTestDesignHarness(runDir, 'mutate', SEEDED_DESIGN_CASE);
  assert(mutate.status === 1, 'a run that edits a file under the staged docs/ exits 1', `exit ${mutate.status}`);
  assert(
    mutate.record?.failureClass === 'quality' && recordedFailures(mutate)?.includes('fixture mutations'),
    'the record carries a quality failure naming fixture mutations',
    JSON.stringify(recordedFailures(mutate)),
  );

  // A run that wrote no document has measured nothing, so what the record has to
  // carry is the environment class that lost it.
  const nothing = runTestDesignHarness(runDir, 'nothing', SEEDED_DESIGN_CASE);
  assert(nothing.status === 2, 'a run that wrote no document exits 2', `exit ${nothing.status}`);
  assert(
    nothing.record?.failureClass === 'environment-missing-artifact' && nothing.record?.runners?.[0]?.repetitions?.completed === 0,
    'the record classifies the lost run as a missing artifact and counts no completed repetition',
    JSON.stringify(nothing.record && { failureClass: nothing.record.failureClass, repetitions: nothing.record.runners?.[0]?.repetitions }),
  );

  // Three documents with one known defect each, which is the half of this suite no
  // other check covers: the trace harness scores a matrix and this one scores
  // arithmetic, a heading and a claim about an epic.

  // A score cell that disagrees with its own two factors. It fails twice on purpose:
  // 3 x 2 written as 5 is wrong arithmetic, and it also drops the row out of the
  // `Score >=6` heading it was filed under, which is the second statement the
  // document makes about that row.
  const arithmetic = runTestDesignHarness(runDir, 'arithmetic-off', SEEDED_DESIGN_CASE);
  assert(arithmetic.status === 1, 'a score cell that is not the product of its factors exits 1', `exit ${arithmetic.status}`);
  assert(
    arithmetic.record?.failureClass === 'quality' &&
      recordedFailures(arithmetic)?.includes('scoreArithmeticAccuracy') &&
      recordedFailures(arithmetic)?.includes('bandPlacementAccuracy'),
    'the record names the arithmetic and the band the wrong score fell out of',
    JSON.stringify(recordedFailures(arithmetic)),
  );

  // A score-9 risk filed under `Low-Priority Risks (Score 1-2)`, with its own
  // arithmetic correct. Band placement is the only threshold it misses, which is what
  // proves the scorer reads the heading a row sits under as well as the cells.
  const band = runTestDesignHarness(runDir, 'band-misfiled', SEEDED_DESIGN_CASE);
  assert(band.status === 1, 'a score-9 risk filed under the Score 1-2 heading exits 1', `exit ${band.status}`);
  assert(
    band.record?.failureClass === 'quality' && JSON.stringify(recordedFailures(band)) === JSON.stringify(['bandPlacementAccuracy']),
    'band placement is the only threshold the misfiled register misses',
    JSON.stringify(recordedFailures(band)),
  );

  // The register this suite exists to catch: four plausible risks, every one of them
  // ruled out by the epic in as many words. Precision and recall both have to report
  // it, and the two metrics that need a matched risk go unmeasurable, because an
  // empty denominator would otherwise clear the bar it never met.
  const generic = runTestDesignHarness(runDir, 'generic-register', SEEDED_DESIGN_CASE);
  assert(generic.status === 1, 'a register of risks the epic rules out exits 1', `exit ${generic.status}`);
  assert(
    generic.record?.failureClass === 'quality' &&
      JSON.stringify(recordedFailures(generic)) ===
        JSON.stringify([
          'groundedRiskRecall',
          'riskPrecision',
          'priorityOrderingAccuracy (unmeasurable)',
          'coverageMappingAccuracy (unmeasurable)',
          '4 risk(s) the epic rules out in as many words',
          '1 of the most severe risk(s) went unreported',
        ]),
    'the record names recall, precision, the two metrics a matched risk would have made measurable, the four invented risks, and the top-severity miss',
    JSON.stringify(recordedFailures(generic)),
  );
  assert(
    generic.record?.runners?.[0]?.measurements?.ungroundedRisks === 4,
    'all four reported risks are counted as ones the epic rules out',
    JSON.stringify(generic.record?.runners?.[0]?.measurements?.ungroundedRisks),
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
    environmentKeys: { 'tea-fragment-selection-runner': STUB_ENVIRONMENT_KEYS },
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
  assert(
    JSON.stringify([...TRACE_HARNESS_DECLARED_CAPABILITIES].sort()) === JSON.stringify([...TRACE_RUNNER_DECLARED_CAPABILITIES].sort()),
    'the trace harness and tea-trace-runner declare the same runner capabilities',
    `harness ${JSON.stringify(TRACE_HARNESS_DECLARED_CAPABILITIES)} vs command ${JSON.stringify(TRACE_RUNNER_DECLARED_CAPABILITIES)}`,
  );
  assert(
    JSON.stringify([...TEST_DESIGN_HARNESS_DECLARED_CAPABILITIES].sort()) ===
      JSON.stringify([...TEST_DESIGN_RUNNER_DECLARED_CAPABILITIES].sort()),
    'the test-design harness and tea-test-design-runner declare the same runner capabilities',
    `harness ${JSON.stringify(TEST_DESIGN_HARNESS_DECLARED_CAPABILITIES)} vs command ${JSON.stringify(TEST_DESIGN_RUNNER_DECLARED_CAPABILITIES)}`,
  );
  assert(
    JSON.stringify([...NFR_HARNESS_DECLARED_CAPABILITIES].sort()) === JSON.stringify([...NFR_RUNNER_DECLARED_CAPABILITIES].sort()),
    'the nfr harness and tea-nfr-runner declare the same runner capabilities',
    `harness ${JSON.stringify(NFR_HARNESS_DECLARED_CAPABILITIES)} vs command ${JSON.stringify(NFR_RUNNER_DECLARED_CAPABILITIES)}`,
  );
  assert(
    TRACE_RUNNER_DECLARED_CAPABILITIES.includes('scoped-artifact-writes') &&
      NFR_RUNNER_DECLARED_CAPABILITIES.includes('scoped-artifact-writes') &&
      TEST_DESIGN_RUNNER_DECLARED_CAPABILITIES.includes('scoped-artifact-writes') &&
      !RUNNER_DECLARED_CAPABILITIES.includes('scoped-artifact-writes'),
    'a trace, NFR or test-design run may write its deliverable and a selection may not; that is the one capability the commands differ in',
  );

  // The three runner commands checked here share one exit-code table, because a
  // caller holding an observation cannot tell which command produced it. The table
  // lives in cli/lib/runner-exit-codes.js and each re-exports it; this is the check
  // that none has grown a spelling of its own.
  assert(
    JSON.stringify(TRACE_EXIT_CODES) === JSON.stringify(EXIT_CODES) && JSON.stringify(NFR_EXIT_CODES) === JSON.stringify(EXIT_CODES),
    'all three runner commands spell every failure class with the same exit code',
    `${JSON.stringify(TRACE_EXIT_CODES)} and ${JSON.stringify(NFR_EXIT_CODES)} vs ${JSON.stringify(EXIT_CODES)}`,
  );
  for (const [failureClass, code] of Object.entries(EXIT_CODES)) {
    assert(
      failureClassForExit(code) === failureClass &&
        traceFailureClassForExit(code) === failureClass &&
        nfrFailureClassForExit(code) === failureClass,
      `exit ${code} maps back to ${failureClass} in all three runners`,
    );
  }
  assert(
    TRACE_REQUEST_KEYS.option.required.every((key) => TRACE_REQUEST_KEYS.option.permitted.includes(key)),
    'every required trace option key is also permitted',
  );
  assert(TRACE_REQUEST_KEYS.stdin.required.includes('prompt'), 'the trace prompt is required on standard input');
  assert(
    NFR_REQUEST_KEYS.option.required.every((key) => NFR_REQUEST_KEYS.option.permitted.includes(key)),
    'every required nfr option key is also permitted',
  );
  assert(NFR_REQUEST_KEYS.stdin.required.includes('prompt'), 'the nfr prompt is required on standard input');
  assert(
    JSON.stringify(TRACE_REQUEST_KEYS.environment) === JSON.stringify(SELECTION_REQUEST_KEYS.environment) &&
      JSON.stringify(NFR_REQUEST_KEYS.environment) === JSON.stringify(SELECTION_REQUEST_KEYS.environment),
    'all three runners permit the same environment names, because all three wrap the same vendor call',
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
    assert(
      traceClassOfAgentError(error) === shared,
      `${probe.code} classifies the same in tea-trace-runner`,
      traceClassOfAgentError(error),
    );
    assert(nfrClassOfAgentError(error) === shared, `${probe.code} classifies the same in tea-nfr-runner`, nfrClassOfAgentError(error));
    assert(FAILURE_CLASSES.includes(runner), `${probe.code} classifies to a declared TEA failure class`, runner);
    assert(Object.hasOwn(EXIT_CODES, runner), `${probe.code} classifies to a class this command can exit with`, runner);
  }
}

// ---------------------------------------------------------------------------
// 6. the environment probes are bounded
// ---------------------------------------------------------------------------

/**
 * The `--version`, `git`, and keychain probes are not systems under test, so
 * eval-quality's adapter does not cover them and they stayed hand-rolled. Each
 * one ran with no timeout, and a pre-flight exists to fail before a paid matrix
 * starts: one that blocks forever shows CI a running job rather than a broken
 * one. This proves the bound is real by running something that never returns.
 */
function checkBoundedProbes(runDir) {
  console.log('\nthe environment probes are bounded');

  const hang = path.join(runDir, 'hang.js');
  // A child that ignores SIGTERM, so a bound that only asks politely would wait
  // out the full run rather than end it. boundedProbe sends SIGKILL.
  fs.writeFileSync(hang, "process.on('SIGTERM', () => {});\nsetInterval(() => {}, 1000);\n");

  const started = Date.now();
  const timedOut = boundedProbe(process.execPath, [hang], { timeoutMs: 1500 });
  const elapsed = Date.now() - started;
  assert(!timedOut.ok && timedOut.reason === 'timeout', 'a probe that never returns is reported as a timeout', JSON.stringify(timedOut));
  assert(elapsed < 15_000, 'the probe is killed at its deadline rather than waited out', `${elapsed}ms`);

  const missing = boundedProbe(path.join(runDir, 'no-such-executable'), ['--version']);
  assert(
    !missing.ok && missing.reason === 'not-found',
    'an executable that is not there is reported as not-found',
    JSON.stringify(missing),
  );

  const failed = boundedProbe(process.execPath, ['-e', 'process.exit(3)']);
  assert(
    !failed.ok && failed.reason === 'failed' && failed.status === 3,
    'a non-zero exit is reported with its code',
    JSON.stringify(failed),
  );

  const answered = boundedProbe(process.execPath, ['--version']);
  assert(
    answered.ok && /^v\d+\./.test(answered.stdout.trim()),
    'a probe that answers returns its output',
    JSON.stringify(answered).slice(0, 120),
  );

  assert(
    PROBE_TIMEOUT_MS > 0 && PROBE_TIMEOUT_MS <= 60_000,
    'the default deadline is a bound a person would wait out',
    `${PROBE_TIMEOUT_MS}ms`,
  );

  // An observation channel is tagged, and the tag is total. Reading `.value`
  // without checking it gives `undefined` on an absent channel, and the
  // diagnostic built from it then either throws or silently loses the exit
  // code's only explanation. Both happen in the error path, where a crash is
  // worst, so every kind is covered here rather than the two this adapter
  // happens to produce.
  assert(observedText({ kind: 'text', value: 'boom' }) === 'boom', 'a text channel reads as its own text');
  assert(observedText({ kind: 'json', value: { a: 1 } }) === '{"a":1}', 'a json channel reads as its serialization');
  assert(observedText({ kind: 'absent' }) === '', 'an absent channel reads as empty, never as the string "undefined"');
  assert(observedText({}) === '', 'a channel carrying no tag at all reads as empty');
  assert(typeof observedText({ kind: 'absent' }).trim === 'function', 'every reading is a string a diagnostic can trim');
}

async function main() {
  console.log('probe targets and the eval-quality command-line adapter');
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-probe-'));
  try {
    checkContractsAgainstRegistry();
    checkRunnerDeclarations();
    checkBoundedProbes(runDir);
    await checkDefaultDeny(runDir);
    await checkTestReviewProbe(runDir);
    await checkFragmentSelectionProbe(runDir);
    await checkTraceProbe(runDir);
    await checkNfrProbe(runDir);
    await checkBudgets(runDir);
    checkNfrHarnessSmoke(runDir);
    checkTraceHarnessSmoke(runDir);
    checkTestDesignHarnessSmoke(runDir);
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
