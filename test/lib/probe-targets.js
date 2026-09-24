/**
 * TEA's own command execution targets, as data, over the `tea-evaluate`
 * runtime's registry.
 *
 * The registry itself (the `RegistryEntry` shape, the default-deny
 * `CommandTargetPolicy` builder, the environment widening, the probe port and
 * the target checks) lives in `cli/lib/evaluate/registry.js` since Story 1.5,
 * so TEA's harness and every adopter's `tea-evaluate` run go through one
 * implementation (AD-5). What stays here is TEA's: the commands it ships,
 * written as `RegistryEntry` data, and the mapping from a probe fault to one of
 * the failure classes TEA's own eval result schema declares.
 *
 *   contract says                  registry says                    adapter spawns
 *   executable: "tea-test-review"  ->  target: cli/test-review.js  ->  <root>/cli/test-review.js
 *
 * A logical name with no entry below is denied before a process starts. That is
 * the check `test/test-probe-targets.js` runs against the contracts: an
 * interface the contracts declare and this registry does not carry is an
 * executable nobody ships, and a contract naming one is fiction that compiles.
 *
 * `targetProblems` stays synchronous (an `existsSync` and a `statSync` over each
 * registered script, which read no file's contents), which is what keeps its
 * callers unchanged.
 */

'use strict';

const path = require('node:path');

const {
  MAX_OUTPUT_BYTES,
  cliObservation,
  createRegistry,
  observedText,
  probeRequest,
  readEnvironment,
} = require('../../cli/lib/evaluate/registry');
const { EXIT_CODES, vendorEnvironmentNames } = require('../../cli/lib/runner-exit-codes');
const { EXIT: TEST_REVIEW_EXIT } = require('../../cli/test-review');
const { loadEvalQuality } = require('./eval-quality-inputs');
const { publishedMember } = require('./vocabularies');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

/**
 * The exit codes by which a TEA runner command reports that it could not run:
 * `environment-configuration`, `-transport`, `-timeout` and `-parser` (3 to 6),
 * and 1, which no runner emits on purpose and which Node uses for an uncaught
 * exception, so it can only mean a crash. Exit 2 is a usage error, the
 * caller's defect (AD-7).
 */
const UNCAUGHT_EXCEPTION_EXIT_CODE = 1;
const RUNNER_INFRASTRUCTURE_EXIT_CODES = [
  UNCAUGHT_EXCEPTION_EXIT_CODE,
  ...Object.entries(EXIT_CODES)
    .filter(([name]) => name.startsWith('environment-'))
    .map(([, code]) => code),
].sort((left, right) => left - right);

/**
 * The commands TEA ships, as `RegistryEntry` data, keyed the way
 * `evaluateCommandTarget` keys them: by interface and executable together.
 * `target` is relative to the repository root the registry below resolves
 * against.
 *
 * Each entry's `environmentKeys` is the list its contract declares, read from
 * the same source the contract generator reads: `vendorEnvironmentNames()`
 * carries every variable a shipped vendor adapter consumes, plus `HOME` and
 * `USER`, because both shipped vendors resolve a stored login through `HOME`.
 * `CI` is deliberately on no list, and its absence is what makes a measured
 * review reproducible: `cli/test-review.js` reads it to decide filesystem
 * isolation when `--isolate` is not stated, so permitting it would let the host
 * decide how the measured run executes. The adapter closes the child
 * environment to `PATH` plus what the request declares, so a command run
 * through the port sees no `CI` and isolates the same way on every host.
 *
 * `maxElapsedMs` is the outer wall clock, and it is deliberately longer than the
 * inner one each command applies to its own vendor call. The inner bound reports
 * a timeout as an exit code the caller can classify; the outer one SIGKILLs and
 * reports `budget-exhausted`, which says a process was killed and not why. The
 * outer bound is the backstop for a command that hangs outside its own timed
 * region, so it must not fire first.
 */
const EXECUTION_TARGETS = [
  {
    interfaceId: 'tea-atdd-runner',
    executable: 'tea-atdd-runner',
    target: 'cli/atdd-runner.js',
    subcommandPaths: [[]],
    // The one deliverable the atdd eval's own prompt asks generation to write,
    // at the default location a project without its own override gets. The
    // harness overrides this per run with the project root and test directory
    // its ground truth declares, the same way the nfr and trace targets below
    // are overridden with a bundle's or a fixture set's own project root.
    artifacts: { scaffold: 'tests/api/reservations.spec.ts' },
    environmentKeys: vendorEnvironmentNames(),
    // One minute above RUN_TIMEOUT_MS in test/eval-atdd.js, for the reason the
    // comment above EXECUTION_TARGETS gives: the inner clock classifies, and
    // this one only backstops.
    maxElapsedMs: 21 * 60_000,
    infrastructureExitCodes: RUNNER_INFRASTRUCTURE_EXIT_CODES,
  },
  {
    interfaceId: 'tea-test-design-runner',
    executable: 'tea-test-design-runner',
    target: 'cli/test-design-runner.js',
    subcommandPaths: [[]],
    // The one deliverable the epic-level test-design workflow writes, at the
    // workflow's own default location relative to the project root. A caller
    // whose project root is not the run directory, which is every staged eval
    // workspace, supplies its own path through `commandTargetPolicy`'s artifact
    // override; this is what a run gets when it supplies none. The epic number
    // is the workflow's own placeholder and a caller always overrides it.
    artifacts: { design: 'test-artifacts/test-design/test-design-epic-1.md' },
    // The same list the other three carry: every variable a shipped vendor
    // adapter consumes, plus HOME and USER, because both shipped vendors resolve
    // a stored login through HOME. The contract declares the same set, and
    // test/test-probe-targets.js holds the two equal in both directions.
    environmentKeys: vendorEnvironmentNames(),
    // One minute above RUN_TIMEOUT_MS in test/eval-test-design.js, for the
    // reason the comment above EXECUTION_TARGETS gives: the inner clock
    // classifies, and this one only backstops.
    maxElapsedMs: 21 * 60_000,
    infrastructureExitCodes: RUNNER_INFRASTRUCTURE_EXIT_CODES,
  },
  {
    interfaceId: 'tea-test-review',
    executable: 'tea-test-review',
    target: 'cli/test-review.js',
    subcommandPaths: [[]],
    // The names are the contract's artifact ids; the paths are what the
    // interaction plan passes on --json and --output, resolved against the run
    // directory the caller supplies as `cwd`.
    artifacts: { verdict: 'verdict.json', report: 'test-review.md' },
    environmentKeys: vendorEnvironmentNames(),
    maxElapsedMs: 16 * 60_000,
    // cli/test-review.js reports an environment or configuration error as 2
    // and an agent, parse or report-artifact failure as 3. It exits 1 on a
    // failing verdict on purpose, so 1 cannot be listed here, and a crash of
    // this command is indistinguishable from that verdict by exit code alone.
    infrastructureExitCodes: [TEST_REVIEW_EXIT.ENV_ERROR, TEST_REVIEW_EXIT.AGENT_OR_PARSE_ERROR],
  },
  {
    interfaceId: 'tea-fragment-selection-runner',
    executable: 'tea-fragment-selection-runner',
    target: 'cli/fragment-selection-runner.js',
    subcommandPaths: [[]],
    // The selection is a stdout payload. The operation declares no artifact, so
    // authorizing one would let a run be scored off a file the contract never
    // said it would read.
    artifacts: {},
    environmentKeys: vendorEnvironmentNames(),
    maxElapsedMs: 6 * 60_000,
    infrastructureExitCodes: RUNNER_INFRASTRUCTURE_EXIT_CODES,
  },
  {
    interfaceId: 'tea-routing-runner',
    executable: 'tea-routing-runner',
    target: 'cli/routing-runner.js',
    subcommandPaths: [[]],
    // The routing answer is a stdout payload, the same as a selection. The
    // operation declares no artifact, so authorizing one would let a run be
    // scored off a file the contract never said it would read.
    artifacts: {},
    // The vendor variables and nothing else, which is the list
    // cli/routing-runner.js declares through ROUTING_REQUEST_KEYS and the list
    // the two routing contracts carry. A routing decision reads no file and
    // needs no other key.
    environmentKeys: vendorEnvironmentNames(),
    maxElapsedMs: 6 * 60_000,
    infrastructureExitCodes: RUNNER_INFRASTRUCTURE_EXIT_CODES,
  },
  {
    interfaceId: 'tea-ci-runner',
    executable: 'tea-ci-runner',
    target: 'cli/ci-runner.js',
    subcommandPaths: [[]],
    // The one deliverable this harness reads back: the platform's own workflow
    // file, at the path GitHub Actions requires. A caller whose project root is
    // not the run directory, which is every staged eval workspace, supplies its
    // own path through `commandTargetPolicy`'s artifact override; this is what a
    // run gets when it supplies none. The workflow also writes helper scripts,
    // documentation and a progress file this harness never reads.
    artifacts: { workflow: '.github/workflows/test.yml' },
    // The vendor variables and nothing else, which is the list cli/ci-runner.js
    // declares through CI_REQUEST_KEYS and the list ci.contract.json carries. A
    // scaffold reads the staged project off disk and needs no other key.
    environmentKeys: vendorEnvironmentNames(),
    // One minute above RUN_TIMEOUT_MS in test/eval-ci.js, for the reason the
    // comment above EXECUTION_TARGETS gives: the inner clock classifies, and this
    // one only backstops.
    maxElapsedMs: 21 * 60_000,
    infrastructureExitCodes: RUNNER_INFRASTRUCTURE_EXIT_CODES,
  },
  {
    interfaceId: 'tea-nfr-runner',
    executable: 'tea-nfr-runner',
    target: 'cli/nfr-runner.js',
    subcommandPaths: [[]],
    // The one deliverable the NFR workflow writes, at the workflow's own default
    // location relative to the project root. A caller whose project root is not
    // the run directory, which is every staged eval workspace, supplies its own
    // path through `commandTargetPolicy`'s artifact override; this is what a run
    // gets when it supplies none. The run key is `system`, the one step-01
    // resolves when the project carries no story or epic to narrow the audit.
    artifacts: { report: 'test-artifacts/nfr/nfr-assessment-system.md' },
    // The vendor variables and nothing else, which is the list cli/nfr-runner.js
    // declares through NFR_REQUEST_KEYS and the list nfr.contract.json carries.
    // An audit reads the staged bundle off disk and needs no other key.
    environmentKeys: vendorEnvironmentNames(),
    // One minute above RUN_TIMEOUT_MS in test/eval-nfr.js, for the reason the
    // comment above EXECUTION_TARGETS gives: the inner clock classifies, and this
    // one only backstops.
    maxElapsedMs: 21 * 60_000,
    infrastructureExitCodes: RUNNER_INFRASTRUCTURE_EXIT_CODES,
  },
  {
    interfaceId: 'tea-trace-runner',
    executable: 'tea-trace-runner',
    target: 'cli/trace-runner.js',
    subcommandPaths: [[]],
    // The two deliverables the trace workflow writes, at the workflow's own
    // default location relative to the project root. A caller whose project
    // root is not the run directory, which is every staged eval workspace,
    // supplies its own paths through `commandTargetPolicy`'s artifact override;
    // these are what a run gets when it supplies none. The run key is `system`,
    // the one step-01 resolves when the project carries no story, epic, release
    // or hotfix to narrow the trace.
    artifacts: {
      summary: 'test-artifacts/trace/e2e-trace-summary-system.json',
      matrix: 'test-artifacts/trace/traceability-matrix-system.md',
    },
    environmentKeys: vendorEnvironmentNames(),
    // One minute above RUN_TIMEOUT_MS in test/eval-trace.js, for the reason the
    // comment above EXECUTION_TARGETS gives: the inner clock classifies, and this
    // one only backstops.
    maxElapsedMs: 21 * 60_000,
    infrastructureExitCodes: RUNNER_INFRASTRUCTURE_EXIT_CODES,
  },
  {
    interfaceId: 'tea-transcript-runner',
    executable: 'tea-transcript-runner',
    target: 'cli/transcript-runner.js',
    subcommandPaths: [[]],
    // A turn's whole output is its reply on standard output; the transcript
    // harness records it directly rather than reading a file, so this target
    // declares no default artifact. A caller whose turn needs one, the way
    // Story 6.11's teaching session might record progress to disk, supplies its
    // own path through `commandTargetPolicy`'s artifact override, the same way
    // every staged eval workspace overrides the trace and nfr targets above.
    artifacts: {},
    environmentKeys: vendorEnvironmentNames(),
    // One minute above the 20-minute RUN_TIMEOUT_MS test/eval-teach-me-testing.js
    // passes as its own per-turn --timeout-ms, the heavier caller
    // cli/transcript-runner.js's own header comment anticipates: a real teaching
    // turn reads several step files, plays both facilitator and learner through
    // an entire session, and writes a progress file, session notes, and a
    // transcript log, so it needs materially more than the runner's own
    // DEFAULT_TIMEOUT_MS (10 minutes). Every other registered target's backstop
    // sits one minute above its own harness's RUN_TIMEOUT_MS for the same reason
    // the comment above EXECUTION_TARGETS gives: the inner clock classifies, and
    // this one only backstops, and `commandTargetPolicy`'s budget override can
    // only lower this ceiling, never raise it, so the backstop has to already be
    // wide enough for the heaviest caller.
    maxElapsedMs: 21 * 60_000,
    infrastructureExitCodes: RUNNER_INFRASTRUCTURE_EXIT_CODES,
  },
];

/**
 * TEA's commands as one registry, resolved against this repository's root.
 */
const registry = createRegistry(EXECUTION_TARGETS, { root: PROJECT_ROOT });

// `loadEvalQuality`, imported above from `./eval-quality-inputs`, is the
// runtime engine's own loader: the root barrel is where the fault classes and
// the code registries live. The identity discipline matters: `instanceof` is
// false across two copies of a package, so the classes a narrowing tests
// against and the error it tests have to come from one resolution. The runtime
// loads `eval-quality/adapters` and the root barrel from this same tree, and the
// ESM loader caches one module namespace per resolved URL, so the class this
// import hands back is the class the adapter threw with.
// `test/test-probe-targets.js` holds that rather than assuming it: it
// constructs a fault from its own import and drives it through
// `failureClassForFault`.

/**
 * One thrown probe fault, as a TEA failure class.
 *
 * NARROWED BY CLASS, NOT BY SHAPE
 *
 * This read `error?.code` and branched on the string it found, which made every
 * error carrying a `code` field a package fault. Node puts a `code` on almost
 * everything it throws: a spawn that cannot find its executable is `ENOENT`, a
 * script without the execute bit is `EACCES`, a socket that goes away is
 * `EPIPE`. Each of those walked the whole table, matched nothing, and landed on
 * the default, so a broken environment and a defect in TEA were both filed as a
 * package transport fault. Nothing downstream could tell them apart, and the
 * transport class is the one that reads as "the port had a bad day", which is
 * the most forgivable thing any of them could have been.
 *
 * `RuntimeFault` and `StructuralFailure` are exported classes, so the question
 * has an exact answer and `instanceof` asks it. Both extend `Error` directly and
 * neither extends the other, so the two are named individually: `instanceof
 * Error` separates neither of them from a Node error. Anything that is neither
 * is `unexpected-error`, which is a class of its own precisely so it cannot be
 * mistaken for a run the environment lost.
 *
 * WHAT THE CODE IS THEN HELD AGAINST
 *
 * A `RuntimeFault`'s code is a member of `RUNTIME_FAULT_CODES` and a
 * `StructuralFailure`'s is a member of `FAILURE_CODES`, and each is held against
 * its own registry before it is branched on. Membership is what makes a rename
 * loud: without it a code that moved upstream falls quietly to the default class
 * below, which is the same silence `error?.code` produced, one layer in.
 *
 * The codes branched on are a policy denial, a cap, an abort, and the two that
 * mean the port itself was handed or produced something it could not read. Every
 * other published runtime fault code falls to a transport failure, which
 * `test/test-port-totality.js` records code by code so the fall-through is a
 * decision rather than a gap. None of these is a measured quality result, which
 * is the distinction every harness here already draws: a failed call must never
 * report as a low score. `budget-exhausted` splits on its own detail because the
 * same code covers a wall clock and an output cap, and a run killed for printing
 * too much is not a slow run.
 *
 * A `StructuralFailure` out of the port is TEA having declared something the
 * package refuses structurally, which is the same finding as `forbidden-target`
 * one layer up, so it carries the same class.
 *
 * @param {unknown} error
 * @returns {Promise<string>} A member of `FAILURE_CLASSES` in `test/schema/eval-result.js`.
 */
async function failureClassForFault(error) {
  const { RuntimeFault, StructuralFailure, RUNTIME_FAULT_CODES, FAILURE_CODES } = await loadEvalQuality();
  if (error instanceof StructuralFailure) {
    // Held for the throw rather than for the value: every structural refusal
    // carries the same class, and what this catches is the day one arrives
    // carrying a code the compile-time registry no longer publishes.
    publishedMember({ FAILURE_CODES }, error.code, 'the code the StructuralFailure the port threw carries');
    return 'environment-configuration';
  }
  if (!(error instanceof RuntimeFault)) return 'unexpected-error';
  const code = publishedMember({ RUNTIME_FAULT_CODES }, error.code, 'the code the RuntimeFault the port threw carries');
  // `RuntimeFault` exposes no `detail` field: its constructor takes one and
  // folds it into `message` as `${code} in ${artifactPath}: ${detail}` and
  // nothing else, confirmed against the installed package's own class, so
  // `error.detail` is always undefined here and `message` is what every
  // branch below actually reads. The `?? error.message` half is load-bearing;
  // the `error.detail ??` half is a defensive read for a shape this package
  // does not produce today.
  const detail = String(error.detail ?? error.message ?? '');
  if (code === 'forbidden-target') return 'environment-configuration';
  if (code === 'aborted') return 'environment-timeout';
  if (code === 'budget-exhausted') return /maxElapsedMs/.test(detail) ? 'environment-timeout' : 'environment-transport';
  if (code === 'schema-parse-failure' || code === 'port-contract-violation') return 'environment-parser';
  return 'environment-transport';
}

/**
 * The one-line reason beside the class, in the vocabulary the class was decided
 * in.
 *
 * Split from the classification because the two used to disagree. `reason` was
 * built from `error?.code` whatever the error was, so an `ENOENT` printed as
 * `ENOENT: spawn ...` beside a package failure class, which reads as a package
 * fault code nobody can find in the registry. An `unexpected-error` names the
 * constructor instead, because the constructor is the finding: this is not one
 * of the two classes the port declares.
 *
 * @param {unknown} error
 * @param {string} failureClass The class `failureClassForFault` answered.
 * @returns {string}
 */
function faultReason(error, failureClass) {
  const message = error?.detail ?? error?.message ?? String(error);
  if (failureClass !== 'unexpected-error') return `${error?.code}: ${message}`;
  const code = error?.code === undefined ? '' : ` carrying code ${JSON.stringify(error.code)}`;
  return `${error?.constructor?.name ?? 'Error'}${code}, which is neither of eval-quality's declared fault classes: ${message}`;
}

/**
 * Run one command through the port and return the observation, or the failure
 * class that says why nothing was observed.
 *
 * The two-armed return is the shape every harness here already uses for a lost
 * run, so this drops in where a `spawnSync` block stood. A non-zero exit comes
 * back as `ok: true` with the code on the observation, because the adapter
 * treats it as an observation and so must anything reading one: a review that
 * exits 1 on a blocking verdict has measured something.
 *
 * @throws {Error} When the port answers a member of `ProbeObservation` other
 * than `cli`. That is a defect in TEA rather than a lost run, so it is the one
 * outcome this function does not report as a failure class.
 * @returns {Promise<{ok: true, observation: object}|{ok: false, failureClass: string, reason: string}>}
 */
async function probeCommand(port, request, signal) {
  let observation;
  try {
    observation = await port.probe(request, signal);
  } catch (error) {
    let failureClass;
    let reason;
    try {
      failureClass = await failureClassForFault(error);
      reason = faultReason(error, failureClass);
    } catch (vocabularyError) {
      // `failureClassForFault` refuses to classify a code its own registry
      // does not publish, by throwing rather than by falling to a default
      // class: that is the loud failure this whole rewrite exists to produce.
      // Letting the throw reach here and propagate further would be loud in
      // the wrong place. Every live harness above this function loops over
      // runs and fixture sets with no `catch` around a probe call, on the
      // documented invariant that a lost run comes back as `{ok: false, ...}`
      // and never as an exception: `probeCommand` is the one seam that
      // invariant is enforced at. A vocabulary that moved upstream mid-batch
      // would otherwise abort every run still queued and discard every result
      // a paid live invocation had already collected, which is the same
      // batch-destroying failure mode the `instanceof` rewrite exists to
      // remove from every other fault this function classifies. Reporting it
      // as `unexpected-error`, the most severe class, keeps the finding just
      // as loud: it exits 2, sorts above every environment class, and the
      // message below still names the code and the registry.
      failureClass = 'unexpected-error';
      reason = vocabularyError.message;
    }
    return { ok: false, failureClass, reason };
  }
  // Outside the catch on purpose. A member TEA cannot read is a defect in TEA,
  // and classifying it as an environment failure would file that defect as a
  // lost run.
  return { ok: true, observation: cliObservation(observation) };
}

/**
 * The two failure classes a bounded retry is safe to attempt: a run that
 * timed out, or a run the port's own transport lost before anything real
 * happened. Never `environment-configuration` (the same refused request
 * would be refused again), never `environment-parser` (a shape a second
 * attempt does not change), and never `unexpected-error` (a defect in TEA,
 * not a lost run). `probeCommand` never returns any of the other declared
 * classes as `ok: false` failure classes outside this set.
 */
const RETRYABLE_FAILURE_CLASSES = new Set(['environment-timeout', 'environment-transport']);

/** Total attempts a retryable failure gets, the first one included. */
const PROBE_RETRY_ATTEMPTS = 3;

/**
 * `probeCommand`, with a bounded retry over `RETRYABLE_FAILURE_CLASSES`.
 *
 * A live matrix spends hundreds of calls in one run, and a per-call failure
 * rate low enough to look rare still makes a fully clean run improbable at
 * that volume: Story 5.2's own first live run lost the whole matrix to one
 * `tea-fragment-selection-runner` invocation that hung past its declared
 * budget and was killed. Its own AC1 requires every declared repetition to
 * complete, so leaving that outcome to luck means the criterion passes today
 * and fails next week for a reason nobody changed.
 *
 * A scored call is never retried, however it scores: `{ok: true}` already
 * means a real command answered, and a low score or a non-zero exit is a
 * measurement, not a lost run. Only `{ok: false}` with a class this module
 * classifies as retryable gets another attempt, and every attempt beyond the
 * first prints which interface and probe id it is, which attempt, and what
 * failed, on `stderr`, so a flaky run reads as one in the transcript. A retry that leaves no
 * trace is the same defect class the rest of this story keeps finding
 * elsewhere.
 *
 * `portOrFactory` may be one port for calls that leave no attempt-owned state,
 * or an async factory for artifact-producing calls. The factory is invoked once
 * per attempt, which lets those callers replace the whole workspace and port
 * before a retry can observe files left by the attempt that timed out.
 *
 * @param {import('eval-quality').EnvironmentProbePort|((attempt: number) => Promise<import('eval-quality').EnvironmentProbePort|{ok: false, failureClass: string, reason: string}>)} portOrFactory
 * @param {object} request
 * @param {AbortSignal} signal
 * @returns {Promise<{ok: true, observation: object}|{ok: false, failureClass: string, reason: string}>}
 */
async function probeCommandWithRetry(portOrFactory, request, signal) {
  let result;
  for (let attempt = 1; attempt <= PROBE_RETRY_ATTEMPTS; attempt += 1) {
    let prepared;
    try {
      prepared = typeof portOrFactory === 'function' ? await portOrFactory(attempt) : portOrFactory;
    } catch (error) {
      result = {
        ok: false,
        failureClass: 'unexpected-error',
        reason: `attempt ${attempt} setup failed: ${error?.message ?? String(error)}`,
      };
      break;
    }
    result = prepared?.ok === false ? prepared : await probeCommand(prepared, request, signal);
    if (result.ok || !RETRYABLE_FAILURE_CLASSES.has(result.failureClass) || attempt === PROBE_RETRY_ATTEMPTS || signal.aborted) break;
    console.error(
      `    [retry] ${request.interfaceId} ${request.probeId}: attempt ${attempt} failed as ${result.failureClass} (${result.reason}); retrying`,
    );
  }
  return result;
}

module.exports = {
  EXECUTION_TARGETS,
  MAX_OUTPUT_BYTES,
  RUNNER_INFRASTRUCTURE_EXIT_CODES,
  cliObservation,
  commandTargetPolicy: registry.commandTargetPolicy,
  createProbePort: registry.createProbePort,
  failureClassForFault,
  faultReason,
  hostEnvironment: registry.hostEnvironment,
  loadEvalQuality,
  observedText,
  permittedEnvironmentKeys: registry.permittedEnvironmentKeys,
  probeCommand,
  probeCommandWithRetry,
  PROBE_RETRY_ATTEMPTS,
  RETRYABLE_FAILURE_CLASSES,
  probeRequest,
  readEnvironment,
  // The runtime registry itself, so a test can hold every re-export above to
  // being that registry's own function (identity), whatever syntax a move
  // back into this file would use.
  registry,
  targetFor: registry.targetFor,
  targetProblems: registry.targetProblems,
};
