/**
 * `eval-quality`'s own port conformance suite, run against the adapter TEA
 * probes its commands through.
 *
 * `test/test-probe-targets.js` asserts what TEA's registry and policy decide:
 * which logical name maps to which file, which budgets apply, and how a thrown
 * fault becomes a TEA failure class. This asserts the other half, and it is the
 * package's assertion rather than TEA's: `eval-quality/conformance` publishes
 * the port boundary as an executable suite, sixteen outcomes for the command-line
 * arm on 3.0.0, and running it is how an adapter user learns that the adapter
 * behaves the way the boundary says it does rather than the way this repository
 * assumed. The count is read from `CONFORMANCE_OUTCOME_COUNTS` rather than
 * stated, so the day the package adds an assertion this fails until TEA answers
 * it.
 *
 * The mechanism is scripted per scenario because the shared six assertions need
 * a port that fails, one that hangs, and one that returns an in-band error, and
 * a real process does none of those on demand. The ten command-specific
 * assertions run against the real mechanism and a real fixture executable, which
 * is the point: a synthetic process would prove nothing about argv construction,
 * a wall clock, or an output cap.
 *
 * The clock arm runs here too, against the adapter `test/lib/clock.js` reads
 * through. Its six assertions are the shared six, so the subject is the scripted
 * mechanism alone: a clock has no argv, no artifact and no output cap for a
 * specialized assertion to address.
 *
 * A caution that cost real time here, and is worth carrying to the remaining
 * arms. Handing the runner an adapter directly rather than a subject produces a
 * full-length report in which every outcome fails on `subject.build is not a
 * function`, so a check comparing only the count against
 * `CONFORMANCE_OUTCOME_COUNTS` passes on a run where nothing worked. The count
 * and the verdicts are both asserted below for that reason.
 *
 * No model call, no credential, no network.
 *
 * Usage: node test/test-probe-conformance.js
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The expected count comes from the package through one accessor, which is what
// turns an arm the package stopped publishing into a failure naming that arm
// rather than a count comparison against `undefined`.
const { expectedOutcomeCount } = require('./lib/conformance-counts');

const PROJECT_ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'probe-conformance', 'fixture-command.js');

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
};

/** The caps the policy declares. Small enough that the fixture can be told to overrun each one, large enough that nothing else does. */
const MAX_ELAPSED_MS = 4000;
const MAX_OUTPUT_BYTES = 8 * 1024;

const INTERFACE_ID = 'conformance-fixture';
const ARTIFACT_ID = 'report';
const ARTIFACT_TEXT = 'the fixture wrote this';

/** A shell metacharacter payload. It has to reach the process as one literal token; a shell would split or expand it. */
const INJECTION_VALUE = '; echo pwned > /tmp/tea-conformance-should-not-exist; $(whoami) `id` && rm -rf .';

const request = (overrides) => ({
  probeId: 'conformance',
  interfaceId: INTERFACE_ID,
  operationId: 'run-fixture',
  kind: 'cli',
  executable: INTERFACE_ID,
  subcommandPath: [],
  channels: { argument: {}, option: {}, environment: {}, stdin: { kind: 'absent' } },
  ...overrides,
});

const channels = (overrides) => ({ argument: {}, option: {}, environment: {}, stdin: { kind: 'absent' }, ...overrides });

/** A mechanism that counts what it was asked to do, so the suite's single-call assertions measure the process and not the port. */
function countingMechanism(real) {
  let calls = 0;
  return {
    mechanism: {
      run: (runRequest, signal) => {
        calls += 1;
        return real.run(runRequest, signal);
      },
      readArtifact: (artifactPath, maxBytes) => real.readArtifact(artifactPath, maxBytes),
    },
    calls: () => calls,
  };
}

/** A mechanism whose run always rejects, for the `fails` scenario. One call, one rejection, no retry. */
function failingMechanism() {
  let calls = 0;
  return {
    mechanism: {
      run: async () => {
        calls += 1;
        throw new Error('the fixture mechanism was told to fail');
      },
      readArtifact: async () => ({ present: false, text: '', truncated: false }),
    },
    calls: () => calls,
  };
}

/** A mechanism that never settles on its own, for the `hangs` scenario: the adapter's own abort handling is what has to answer. */
function hangingMechanism() {
  let calls = 0;
  return {
    mechanism: {
      run: (runRequest, signal) =>
        new Promise((resolve, reject) => {
          calls += 1;
          if (signal.aborted) reject(signal.reason);
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
      readArtifact: async () => ({ present: false, text: '', truncated: false }),
    },
    calls: () => calls,
  };
}

/** A mechanism that resolves with a shape the port contract does not admit, for the `in-band-error` scenario. */
function inBandErrorMechanism() {
  let calls = 0;
  return {
    mechanism: {
      run: async () => {
        calls += 1;
        return { exitCode: 'not-a-number', stdout: '', stderr: '' };
      },
      readArtifact: async () => ({ present: false, text: '', truncated: false }),
    },
    calls: () => calls,
  };
}

const MECHANISMS = {
  resolves: countingMechanism,
  fails: () => failingMechanism(),
  hangs: () => hangingMechanism(),
  'in-band-error': () => inBandErrorMechanism(),
};

/**
 * The clock subject the shared six assertions need.
 *
 * `runClockPortConformance` drives four scenarios and the shape of each is what
 * the assertions read. `resolves` returns an instant. `fails` throws, so the
 * adapter has a mechanism failure to turn into a declared `RuntimeFault`.
 * `hangs` must reject when the signal aborts rather than resolve, which is the
 * whole of `read/prompt-abort`. `in-band-error` must throw rather than return an
 * error value, which is the whole of `read/no-in-band-error`.
 *
 * `underlyingCalls` is a function rather than a counter object, because the two
 * single-call assertions call it.
 *
 * The mechanism is scripted rather than real for the reason the command-line
 * subject gives: a real clock does not fail or hang on demand, and the shared
 * assertions need one that does.
 */
function clockSubject() {
  return {
    name: 'tea system clock adapter',
    sampleRequest: {},
    async build(scenario) {
      let calls = 0;
      const mechanism = async (signal) => {
        calls += 1;
        if (scenario === 'fails') throw new Error('the system clock could not be read');
        if (scenario === 'in-band-error') throw new Error('an in-band error value is thrown rather than returned');
        if (scenario === 'hangs') {
          return new Promise((resolve, reject) => {
            const abort = () => reject(Object.assign(new Error('the clock read was aborted'), { name: 'AbortError' }));
            if (signal?.aborted) return abort();
            signal?.addEventListener('abort', abort, { once: true });
          });
        }
        return new Date().toISOString();
      };
      const { createSystemClockAdapter } = await import('eval-quality/adapters');
      const port = createSystemClockAdapter(mechanism);
      return { port: (request, signal) => port.read(request, signal), underlyingCalls: () => calls };
    },
  };
}

async function main() {
  const { createCommandLineAdapter, nodeCommandMechanism } = await import('eval-quality/adapters');
  const { runCommandLineProbeConformance, runClockPortConformance, formatConformanceReport, CONFORMANCE_OUTCOME_COUNTS } =
    await import('eval-quality/conformance');

  // Resolved before anything is staged. It throws when the package's registry has
  // moved, and every throw above the `try` below is a temporary directory left
  // behind, which this file has already had to fix once.
  const expected = expectedOutcomeCount(CONFORMANCE_OUTCOME_COUNTS, 'command-probe');

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-probe-conformance-'));
  const policy = {
    authorizations: [
      {
        interfaceId: INTERFACE_ID,
        executable: INTERFACE_ID,
        target: FIXTURE,
        permittedSubcommandPaths: [[]],
        // The fixture command reads no environment variable, so the honest
        // allowlist is empty, which is also AD-35's default-deny base case: any
        // key a request declares is one this authorization does not permit.
        // PATH is absent from every allowlist by rule and reaches the child from
        // the adapter's own process.
        permittedEnvironmentKeys: [],
        cwd: workspace,
        artifacts: { [ARTIFACT_ID]: 'artifact.txt' },
        maxElapsedMs: MAX_ELAPSED_MS,
        maxOutputBytes: MAX_OUTPUT_BYTES,
      },
    ],
  };

  const subject = {
    name: 'tea command-line probe adapter',
    policy,
    sampleRequest: request({ channels: channels({ option: { 'exit-code': '0' } }) }),
    authorizedRequest: request({ channels: channels({ option: { 'exit-code': '0' } }) }),
    unmappedInterfaceRequest: request({ interfaceId: 'no-such-interface', executable: 'no-such-interface' }),
    unmappedExecutableRequest: request({ executable: 'no-such-executable' }),
    unauthorizedSubcommandRequest: request({ subcommandPath: ['forbidden'] }),
    // Authorized in every other respect: the interface, the executable and the
    // subcommand path are the sample request's, and the one thing that makes it
    // refusable is the single environment key, which the authorization above
    // permits none of. The suite checks exactly that, and checks that the
    // refusal costs zero calls into the underlying mechanism.
    unauthorizedEnvironmentKeyRequest: request({
      channels: channels({ environment: { TEA_UNAUTHORIZED_KEY: 'never reaches a process' } }),
    }),
    nonZeroExitRequest: request({ channels: channels({ option: { 'exit-code': '3' } }) }),
    injectionRequest: request({ channels: channels({ argument: { payload: INJECTION_VALUE } }) }),
    injectionArgumentValue: INJECTION_VALUE,
    artifactRequest: request({ channels: channels({ option: { write: ARTIFACT_TEXT } }) }),
    artifactId: ARTIFACT_ID,
    artifactExpectedText: ARTIFACT_TEXT,
    overElapsedRequest: request({ channels: channels({ option: { 'sleep-ms': String(MAX_ELAPSED_MS * 3) } }) }),
    overOutputRequest: request({ channels: channels({ option: { bytes: String(MAX_OUTPUT_BYTES * 4) } }) }),
    async build(scenario) {
      const scripted = MECHANISMS[scenario](nodeCommandMechanism);
      const port = createCommandLineAdapter(policy, scripted.mechanism);
      return { port: (probeRequest, signal) => port.probe(probeRequest, signal), underlyingCalls: scripted.calls };
    },
  };

  const problems = [];
  // In a `finally`, because a throw out of the suite or the renderer would
  // otherwise leave one temporary directory behind per failed invocation.
  try {
    const report = await runCommandLineProbeConformance(subject);
    console.log(formatConformanceReport(report));
    if (report.outcomes.length !== expected) {
      problems.push(`the suite produced ${report.outcomes.length} outcome(s) and a complete command-probe run is ${expected}`);
    }
    for (const outcome of report.outcomes) {
      if (!outcome.passed) problems.push(`${outcome.id}: ${outcome.detail}`);
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }

  const clockExpected = expectedOutcomeCount(CONFORMANCE_OUTCOME_COUNTS, 'clock');
  const clockReport = await runClockPortConformance(clockSubject());
  console.log(formatConformanceReport(clockReport));
  if (clockReport.outcomes.length !== clockExpected) {
    problems.push(`the clock suite produced ${clockReport.outcomes.length} outcome(s) and a complete clock run is ${clockExpected}`);
  }
  for (const outcome of clockReport.outcomes) {
    if (!outcome.passed) problems.push(`clock ${outcome.id}: ${outcome.detail}`);
  }

  if (problems.length > 0) {
    console.error(`\n${colors.red}${problems.length} conformance problem(s):${colors.reset}`);
    for (const problem of problems) console.error(`   ${problem}`);
    return 1;
  }

  console.log(
    `\n${colors.green}all ${expected} published command-probe and ${clockExpected} clock conformance assertions passed${colors.reset}\n`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`${colors.red}probe conformance could not run:${colors.reset} ${error.stack ?? error}`);
    process.exit(2);
  });
