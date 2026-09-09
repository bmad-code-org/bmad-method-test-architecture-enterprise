/**
 * Fragment-selection eval harness.
 *
 * `eval-test-review.js` measures how well one workflow reviews. Nothing measured
 * the step before every workflow: whether the RIGHT fragment comes out of
 * `tea-index.csv` for the task at hand. That is TEA's actual failure mode. A
 * reviewer that scores badly is visible. An agent that loaded no fragment, or the
 * wrong one, and then answered from prior looks exactly like an agent that read
 * the knowledge base — the output is fluent either way, and the only tell is that
 * it is generic.
 *
 * WHAT IS MEASURED
 *
 *   required recall  — of the fragments the step file mandates for a scenario,
 *                      how many did the agent select
 *   forbidden rate   — how often it selected a fragment the step file excludes
 *                      by name (over-loading is a real defect: a Maestro fragment
 *                      in a Playwright run is where device patterns leak into a
 *                      browser spec)
 *   stability        — whether the same scenario yields the same set on re-run
 *
 * Ground truth is quoted from the step files, never invented. Every `mustLoad`
 * and `mustNotLoad` in the eval data traces to a line in the workflow's own step
 * file, which is why `--validate-only` can check the data against the shipped
 * knowledge index and why a step-file rewrite that drops a fragment shows up here
 * as a failing case rather than as nothing at all.
 *
 * THREE MODES
 *
 *   --validate-only   Static. No vendor, no cost, no network. Asserts the eval
 *                     data is internally consistent and that every fragment it
 *                     names exists and is indexed for that workflow. This is the
 *                     mode `npm test` and CI run.
 *   --preflight-only  The static checks, then the runner: is the agent
 *                     executable on PATH, does it answer --version, does a
 *                     built-in vendor have a credential. Exits before any model
 *                     call. This is what `eval:all --preflight-only` runs, and
 *                     the argv the suite manifest declares as preflightArgs.
 *   default           Spends a vendor run per case per repetition. Run it by
 *                     hand or on a schedule; it needs a logged-in claude or codex.
 *
 * THE RUNNER IS READ-ONLY
 *
 * A selection is a reply, so the run needs no file. The suite manifest declares
 * `read-only` for it, RUNNER_CAPABILITIES below is what the manifest is checked
 * against, and `cli/fragment-selection-runner.js` declares the same list and is
 * what hands it to the vendor: claude runs with no write tool, codex under its
 * read-only sandbox, and every runner in the empty scratch directory that is both
 * the authorization's working directory and checked afterwards. A run that
 * left a file there, or changed the repository, is an environment failure and
 * is never scored.
 *
 * EVERY DECLARED REPETITION MUST COMPLETE
 *
 * Stability is a claim about repeated runs. A case that lost a run to a timeout or
 * an unparseable reply has fewer observations than the gate declared, so it is
 * unmeasurable and exits 2. A failed model call is never a low score.
 *
 * Usage:
 *   node test/eval-fragment-selection.js --validate-only
 *   node test/eval-fragment-selection.js --preflight-only --agent codex
 *   node test/eval-fragment-selection.js --agent claude --runs 3
 *   node test/eval-fragment-selection.js --agent codex --workflow bmad-testarch-automate
 *   node test/eval-fragment-selection.js --agent custom --agent-cmd my-runner --agent-arg --headless
 *   node test/eval-fragment-selection.js --agent claude --json results/fragment-selection.json
 *
 * Exit codes:
 *   0  data is valid (--validate-only), the runner is ready (--preflight-only),
 *      or every vendor met the thresholds
 *   1  a threshold was missed, or the eval data is inconsistent (a real result)
 *   2  the environment could not run the eval (nothing was measured): a missing
 *      credential or executable, a timeout, a transport error, an unparseable
 *      reply, a runner outside its declared capability, or fewer completed runs
 *      than were declared
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parse } = require('csv-parse/sync');

const { AGENT_ADAPTERS, resolveModel } = require('../cli/lib/agent-adapters');
const { failureClassForExit } = require('../cli/fragment-selection-runner');
// The reply parser belongs to the command that produces the reply. It moved to
// cli/lib/ when cli/fragment-selection-runner.js started producing one, and it
// is re-exported below so test/test-eval-replay.js keeps scoring stored outputs
// through the same function the runner applies to a live one.
const { parseSelection } = require('../cli/lib/parse-selection');
const { missingCredential } = require('./eval-test-review');
const { loadSuiteManifest, suiteById } = require('./lib/suite-manifest');
const {
  digest,
  digestFiles,
  digestPrompts,
  repositoryState,
  probeVersion,
  redactArgs,
  measured,
  suiteResultRecord,
  writeSuiteResult,
} = require('./lib/eval-record');
const { worstFailureClass, exitCodeForFailureClass } = require('./schema/eval-result');
const { scratchDirectory, filesWritten, workingTreeState, workingTreeChanges } = require('./lib/runner-capabilities');
const { createProbePort, hostEnvironment, probeCommand, probeRequest } = require('./lib/probe-targets');

const PROJECT_ROOT = path.join(__dirname, '..');
const EVAL_ROOT = path.join(__dirname, 'evals');
const WORKFLOW_ROOT = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch');
const SUITE_ID = 'fragment-selection';

const RUN_TIMEOUT_MS = 5 * 60_000;

/**
 * What the runner is allowed to do, and what tools/validate-eval-schemas.js checks
 * the manifest's `runnerCapabilities` against, the same way it checks THRESHOLDS.
 * It must equal the list `cli/fragment-selection-runner.js` declares, because that
 * command is what applies it to the vendor call now that the harness probes rather
 * than spawns. See THE RUNNER IS READ-ONLY in the header.
 */
const RUNNER_CAPABILITIES = ['read-only'];

/**
 * Deliberately conservative, same reasoning as the test-review harness: a bar
 * nobody clears teaches nothing and a bar everyone clears teaches nothing.
 * `forbiddenRate` is the one to watch — over-loading is the cheaper mistake to
 * make and the harder one to notice.
 */
const THRESHOLDS = {
  requiredRecall: 0.9,
  forbiddenRate: 0.1,
};

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  cyan: '[36m',
  dim: '[2m',
};

function fatal(code, message) {
  console.error(`${colors.red}eval: ${message}${colors.reset}`);
  process.exit(code);
}

function parseArgs(argv) {
  const agents = [];
  const workflows = [];
  const agentArgs = [];
  const envPass = [];
  let runs = 2;
  let validateOnly = false;
  let preflightOnly = false;
  let agentCmd;
  let model;
  let jsonPath;
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
      case '--workflow': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--workflow requires a workflow name');
        workflows.push(value);
        index += 1;
        break;
      }
      case '--runs': {
        runs = Number.parseInt(argv[index + 1] ?? '', 10);
        if (!Number.isInteger(runs) || runs < 1) fatal(2, '--runs requires a positive integer');
        index += 1;
        break;
      }
      case '--agent-cmd': {
        agentCmd = argv[index + 1];
        if (!agentCmd) fatal(2, '--agent-cmd requires an executable path or name');
        index += 1;
        break;
      }
      case '--agent-arg': {
        const value = argv[index + 1];
        if (value === undefined) fatal(2, '--agent-arg requires a value');
        agentArgs.push(value);
        index += 1;
        break;
      }
      case '--env-pass': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--env-pass requires an environment variable name');
        envPass.push(value);
        index += 1;
        break;
      }
      case '--model': {
        model = argv[index + 1];
        if (!model) fatal(2, '--model requires a model name');
        index += 1;
        break;
      }
      case '--json': {
        jsonPath = argv[index + 1];
        if (!jsonPath) fatal(2, '--json requires a file path');
        index += 1;
        break;
      }
      case '--validate-only': {
        validateOnly = true;
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
  if (agents.length === 0) agents.push('claude');
  if (agents.includes('custom') && !agentCmd) fatal(2, '--agent custom requires --agent-cmd');
  if (agents.includes('custom') && model) {
    fatal(2, '--model is not supported by --agent custom; pass the runner model through --agent-arg');
  }
  if (agents.length > 1 && (agentCmd || agentArgs.length > 0 || envPass.length > 0 || model)) {
    fatal(2, 'runner overrides require exactly one --agent; run separate commands for different runner configurations');
  }
  if (validateOnly && preflightOnly) fatal(2, '--validate-only and --preflight-only name different modes; pass one');
  return { agents, workflows, runs, validateOnly, preflightOnly, agentCmd, agentArgs, envPass, model, jsonPath };
}

/** Every evals.json under test/evals, or only the requested workflows. */
function loadSuites(requested) {
  if (!fs.existsSync(EVAL_ROOT)) fatal(2, `no eval directory at ${EVAL_ROOT}`);
  const suites = [];
  for (const name of fs.readdirSync(EVAL_ROOT).sort()) {
    if (requested.length > 0 && !requested.includes(name)) continue;
    const file = path.join(EVAL_ROOT, name, 'evals.json');
    if (!fs.existsSync(file)) continue;
    try {
      suites.push({ dir: name, file, data: JSON.parse(fs.readFileSync(file, 'utf8')) });
    } catch (error) {
      fatal(2, `${path.relative(PROJECT_ROOT, file)} is not valid JSON: ${error.message}`);
    }
  }
  if (suites.length === 0) fatal(2, requested.length > 0 ? `no eval suite for ${requested.join(', ')}` : 'no eval suites found');
  return suites;
}

/**
 * Static validation. This is the part CI runs, and it is what keeps the eval data
 * from rotting into a set of assertions about fragments that no longer exist:
 * every name below is checked against the workflow's shipped knowledge directory
 * AND its index, because a fragment on disk with no index row can never be
 * selected and asserting that it must be is asserting a thing that cannot happen.
 */
function validateSuites(suites) {
  const problems = [];

  for (const suite of suites) {
    const label = path.relative(PROJECT_ROOT, suite.file);
    const { workflow, cases, contextFiles } = suite.data;

    if (!workflow) problems.push(`${label}: no "workflow" field`);
    if (workflow && workflow !== suite.dir) problems.push(`${label}: workflow "${workflow}" does not match its directory "${suite.dir}"`);

    const workflowDir = path.join(WORKFLOW_ROOT, suite.dir);
    if (!fs.existsSync(workflowDir)) {
      problems.push(`${label}: no workflow at src/workflows/testarch/${suite.dir}`);
      continue;
    }

    for (const relative of contextFiles ?? []) {
      if (!fs.existsSync(path.join(workflowDir, relative))) {
        problems.push(`${label}: contextFile ${relative} does not exist in the workflow`);
      }
    }
    if ((contextFiles ?? []).length === 0)
      problems.push(`${label}: no contextFiles; the runner would have no ground-truth step file to show the agent`);

    const knowledgeDir = path.join(workflowDir, 'resources', 'knowledge');
    const indexPath = path.join(workflowDir, 'resources', 'tea-index.csv');
    let indexed = new Set();
    if (fs.existsSync(indexPath)) {
      try {
        const records = parse(fs.readFileSync(indexPath, 'utf8'), { columns: true, skip_empty_lines: true });
        indexed = new Set(records.map((record) => String(record.fragment_file || '').replace(/^knowledge\//, '')));
      } catch (error) {
        problems.push(`${label}: ${path.relative(workflowDir, indexPath)} does not parse: ${error.message}`);
      }
    } else {
      problems.push(`${label}: the workflow ships no resources/tea-index.csv`);
    }

    if (!Array.isArray(cases) || cases.length === 0) {
      problems.push(`${label}: no cases`);
      continue;
    }

    const seenIds = new Set();
    for (const item of cases) {
      const caseLabel = `${label} [${item.id || '(no id)'}]`;
      if (!item.id) problems.push(`${caseLabel}: no id`);
      if (seenIds.has(item.id)) problems.push(`${caseLabel}: duplicate id`);
      seenIds.add(item.id);
      if (!item.prompt || item.prompt.trim().length < 20) problems.push(`${caseLabel}: prompt is missing or too short to route on`);
      if (!Array.isArray(item.repoFacts) || item.repoFacts.length === 0) {
        problems.push(`${caseLabel}: no repoFacts; fragment selection is a function of the repo, not only of the prompt`);
      }
      if (!Array.isArray(item.assertions) || item.assertions.length === 0) {
        problems.push(`${caseLabel}: no assertions; the numbers say what happened, the assertions say why it matters`);
      }
      for (const assertion of item.assertions ?? []) {
        if (!assertion.id || !assertion.text) problems.push(`${caseLabel}: an assertion is missing id or text`);
      }

      const mustLoad = item.expect?.mustLoad ?? [];
      const mustNotLoad = item.expect?.mustNotLoad ?? [];
      if (mustLoad.length === 0) problems.push(`${caseLabel}: mustLoad is empty; a case that requires nothing measures nothing`);

      for (const fragment of [...mustLoad, ...mustNotLoad]) {
        if (!fs.existsSync(path.join(knowledgeDir, fragment))) {
          problems.push(`${caseLabel}: ${fragment} is not in ${suite.dir}/resources/knowledge/`);
          continue;
        }
        if (indexed.size > 0 && !indexed.has(fragment)) {
          problems.push(`${caseLabel}: ${fragment} is not indexed in ${suite.dir}/resources/tea-index.csv, so it can never be selected`);
        }
      }

      const overlap = mustLoad.filter((fragment) => mustNotLoad.includes(fragment));
      if (overlap.length > 0) problems.push(`${caseLabel}: ${overlap.join(', ')} is both required and forbidden`);
    }
  }

  return problems;
}

/** The prompt one case gets: the workflow's own routing rules, its index, and the scenario. */
function buildPrompt(suite, item) {
  const workflowDir = path.join(WORKFLOW_ROOT, suite.dir);
  const context = (suite.data.contextFiles ?? [])
    .map((relative) => `----- ${relative} -----\n${fs.readFileSync(path.join(workflowDir, relative), 'utf8')}`)
    .join('\n\n');
  const index = fs.readFileSync(path.join(workflowDir, 'resources', 'tea-index.csv'), 'utf8');

  return [
    `You are running the TEA workflow \`${suite.data.workflow}\`. Below are the workflow's own knowledge-loading rules and its fragment index.`,
    '',
    'Decide which knowledge fragments this run must load, following those rules exactly. Do not load a fragment the rules do not call for: over-loading costs context and mixes patterns from stacks the project does not use.',
    '',
    context,
    '',
    '----- resources/tea-index.csv -----',
    index,
    '',
    '----- the run -----',
    `Task: ${item.prompt}`,
    '',
    'Repository facts:',
    ...(item.repoFacts ?? []).map((fact) => `- ${fact}`),
    '',
    'TEA config for this run:',
    `${JSON.stringify(item.config ?? {}, null, 2)}`,
    '',
    '----- output -----',
    'Reply with JSON only, no prose and no code fence:',
    '{"fragments": ["one-fragment-file-name.md", "..."]}',
    'Use the fragment file names exactly as they appear in the index, without the `knowledge/` prefix.',
  ].join('\n');
}

function scoreCase(item, selected) {
  const chosen = new Set(selected);
  const mustLoad = item.expect?.mustLoad ?? [];
  const mustNotLoad = item.expect?.mustNotLoad ?? [];
  const missing = mustLoad.filter((fragment) => !chosen.has(fragment));
  const forbidden = mustNotLoad.filter((fragment) => chosen.has(fragment));
  return {
    required: mustLoad.length,
    hits: mustLoad.length - missing.length,
    missing,
    forbiddenTotal: mustNotLoad.length,
    forbidden,
    selected: selected.length,
  };
}

function preflight({ agents, agentCmd }) {
  const problems = [];
  const versions = {};
  // Each problem carries its failure class so the result record keeps a missing
  // credential and a missing executable apart.
  const report = (failureClass, message) => problems.push({ failureClass, message });

  for (const agent of agents) {
    // Check the name against the adapter registry BEFORE spawning it. runAgent
    // would reject an unknown vendor too, but only after preflight had already
    // handed the string to spawnSync as a command.
    if (!Object.prototype.hasOwnProperty.call(AGENT_ADAPTERS, agent)) {
      report('environment-configuration', `unknown agent "${agent}"; expected one of ${Object.keys(AGENT_ADAPTERS).join(', ')}`);
      continue;
    }
    const executable = agent === 'custom' ? agentCmd : agent;
    const probe = spawnSync(executable, ['--version'], { encoding: 'utf8' });
    if (probe.error) report('environment-transport', `agent CLI "${executable}" is not on PATH (${probe.error.code})`);
    else if (probe.status === 0)
      versions[agent] =
        String(probe.stdout || '')
          .trim()
          .split('\n')[0] || null;
    else report('environment-transport', `agent CLI "${executable}" failed its --version probe (exit ${probe.status})`);
    const credential = agent === 'custom' ? null : missingCredential(agent);
    if (credential) report('environment-authentication', credential);
  }
  return { problems, versions };
}

/**
 * Every case with the exact prompt it is sent, keyed so two workflows cannot
 * collide on a shared case id.
 *
 * @param {Array<object>} suites
 * @returns {Array<{id: string, prompt: string}>}
 */
function caseIndex(suites) {
  return suites.flatMap((suite) => suite.data.cases.map((item) => ({ id: `${suite.dir}:${item.id}`, prompt: buildPrompt(suite, item) })));
}

/**
 * The ids of every case this suite scores, across all eight workflows.
 *
 * tools/validate-eval-schemas.js checks the manifest's `caseCount` against the
 * length of this, the same way it checks its thresholds against THRESHOLDS.
 *
 * @returns {string[]}
 */
function caseIds() {
  return caseIndex(loadSuites([])).map((item) => item.id);
}

/**
 * Write the machine-readable record when --json asked for one, then exit with
 * the code the failure class carries.
 */
function finish({ options, startedAt, mode, suites, runners, suiteFailureClasses = [] }) {
  const failureClass = worstFailureClass([...runners.map((runner) => runner.failureClass), ...suiteFailureClasses]);
  const exitCode = exitCodeForFailureClass(failureClass);

  if (options.jsonPath) {
    let suite;
    try {
      suite = suiteById(loadSuiteManifest(PROJECT_ROOT).manifest, SUITE_ID);
    } catch (error) {
      console.error(`${colors.red}eval: ${error.message}${colors.reset}`);
      process.exit(2);
    }
    const cases = caseIndex(suites).map((item) => ({ id: item.id, promptDigest: digest(item.prompt) }));
    writeSuiteResult(
      options.jsonPath,
      suiteResultRecord({
        mode,
        suite,
        repository: repositoryState(PROJECT_ROOT),
        fixtureDigest: digestFiles(PROJECT_ROOT, suite.fixtures),
        promptDigest: digestPrompts(caseIndex(suites)),
        cases,
        runners,
        durationMs: Date.now() - startedAt,
        suiteFailureClasses,
      }),
    );
    console.log(`${colors.dim}result written to ${options.jsonPath}${colors.reset}`);
  }

  process.exit(exitCode);
}

/** The per-runner half of the result record. */
function runnerRecord(agent, options, versions, { expected, completed, measurements, durationMs, failureClass, failures }) {
  const executable = agent === 'custom' ? options.agentCmd : agent;
  return {
    agent,
    executable,
    version: versions[agent] ?? probeVersion(executable),
    model: resolveModel(agent, options.model, options.agentArgs),
    parameters: {
      agentArgs: redactArgs(options.agentArgs),
      envPassNames: [...options.envPass],
      timeoutMs: RUN_TIMEOUT_MS,
      promptTransport: AGENT_ADAPTERS[agent]?.promptViaArgv ? 'argv' : 'stdin',
    },
    repetitions: { expected, completed },
    measurements,
    durationMs,
    usage: null, // No built-in adapter reports tokens or cost yet; a zero would be a claim.
    failureClass,
    failures,
  };
}

async function main() {
  const startedAt = Date.now();
  const options = parseArgs(process.argv.slice(2));
  const { agents, workflows, runs, validateOnly, preflightOnly } = options;
  const staticMode = validateOnly ? 'validate-only' : preflightOnly ? 'preflight-only' : 'live';

  console.log(`${colors.cyan}========================================`);
  console.log('tea fragment-selection eval harness');
  console.log(`========================================${colors.reset}\n`);

  const suites = loadSuites(workflows);
  const problems = validateSuites(suites);
  const caseCount = suites.reduce((sum, suite) => sum + (suite.data.cases?.length ?? 0), 0);

  if (problems.length > 0) {
    console.error(`${colors.red}eval data is inconsistent:${colors.reset}`);
    for (const problem of problems) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
    console.error('');
    // Inconsistent data keeps its historical exit 1. It is a real finding about
    // the repository, measured without a model call, and an environment that
    // could not run is a different thing.
    //
    // No suites are handed to the record: building a prompt out of data that
    // just failed validation is how a reporting path turns into a second crash.
    finish({
      options,
      startedAt,
      mode: staticMode,
      suites: [],
      runners: [],
      suiteFailureClasses: ['quality'],
    });
  }

  console.log(
    `${colors.green}✓${colors.reset} ${suites.length} suite(s), ${caseCount} case(s); every named fragment exists and is indexed`,
  );

  if (validateOnly) {
    console.log(`\n${colors.green}eval data valid; nothing measured (--validate-only).${colors.reset}\n`);
    finish({ options, startedAt, mode: 'validate-only', suites, runners: [] });
  }

  const { problems: readiness, versions } = preflight(options);
  if (readiness.length > 0) {
    console.error(`${colors.red}eval pre-flight failed; nothing was measured:${colors.reset}`);
    for (const problem of readiness) console.error(`  - ${problem.message}`);
    console.error(`\n${colors.dim}A failed pre-flight is exit 2, never a 0% score.${colors.reset}`);
    finish({
      options,
      startedAt,
      mode: staticMode,
      suites,
      runners: [],
      suiteFailureClasses: readiness.map((problem) => problem.failureClass),
    });
  }
  if (preflightOnly) {
    console.log(`${colors.green}✓${colors.reset} runner executable(s) answer --version; built-in credentials checked`);
    console.log(`\n${colors.green}pre-flight only; nothing measured.${colors.reset}\n`);
    finish({ options, startedAt, mode: 'preflight-only', suites, runners: [] });
  }
  console.log(`${colors.dim}${runs} run(s) per case per agent${colors.reset}\n`);

  // Everything about the request that does not change between runs. The vendor
  // name is the one exception, so it is applied per run below; the port itself
  // is built per run because each run gets its own working directory and the
  // authorization is what pins that.
  const runnerOption = {};
  if (options.agentCmd) runnerOption['agent-cmd'] = options.agentCmd;
  if (options.model) runnerOption.model = options.model;
  if (options.agentArgs.length > 0) runnerOption['agent-arg'] = [...options.agentArgs];
  if (options.envPass.length > 0) runnerOption['env-pass'] = [...options.envPass];
  // The runner's own wall clock, which reports a timeout as an exit code. The
  // authorization's maxElapsedMs is a minute longer and SIGKILLs, so the inner
  // bound is the one that fires and the classification survives.
  runnerOption['timeout-ms'] = String(RUN_TIMEOUT_MS);
  const runnerEnvironment = hostEnvironment(options.envPass);

  const runners = [];

  for (const agent of agents) {
    console.log(`${colors.cyan}${agent}${colors.reset}`);
    const agentStartedAt = Date.now();
    let requiredTotal = 0;
    let hitTotal = 0;
    let forbiddenHits = 0;
    let forbiddenOpportunities = 0;
    let unmeasuredRuns = 0;
    let completedRuns = 0;
    let unstableCases = 0;
    let incompleteCases = 0;
    // Every environment failure seen across every case, so the runner's class is
    // the worst of them rather than the last one printed.
    const lostRunClasses = [];

    for (const suite of suites) {
      console.log(`  ${colors.dim}${suite.data.workflow}${colors.reset}`);
      for (const item of suite.data.cases) {
        const prompt = buildPrompt(suite, item);
        const signatures = new Set();
        const caseScores = [];

        for (let runIndex = 0; runIndex < runs; runIndex += 1) {
          // The run's working directory is empty and disposable. The prompt carries
          // everything the case needs, so PROJECT_ROOT was never a requirement, and
          // pointing a runner with write tools at the repository made `read-only`
          // a declaration with nothing behind it. Here it is also the authorization
          // `cwd`, so the policy is what confines the run rather than a convention.
          const scratch = scratchDirectory('tea-eval-selection');
          const treeBefore = workingTreeState(PROJECT_ROOT);
          let result;
          let written = [];
          let treeChanges = [];
          try {
            const { port } = await createProbePort({ cwd: scratch, interfaceIds: ['tea-fragment-selection-runner'] });
            result = await probeCommand(
              port,
              probeRequest({
                probeId: `${item.id}-run-${runIndex + 1}`,
                interfaceId: 'tea-fragment-selection-runner',
                operationId: 'select-fragments',
                option: { ...runnerOption, agent },
                environment: runnerEnvironment,
                stdin: { kind: 'text', value: prompt },
              }),
              new AbortController().signal,
            );
            written = filesWritten(scratch);
            treeChanges = workingTreeChanges(treeBefore, workingTreeState(PROJECT_ROOT));
          } finally {
            fs.rmSync(scratch, { recursive: true, force: true });
          }

          // A thrown fault means the probe itself lost the run: a denial, a cap,
          // an abort, or a process that never started.
          if (!result.ok) {
            console.error(`    ${colors.red}${item.id} run ${runIndex + 1}: ${result.reason}${colors.reset}`);
            lostRunClasses.push(result.failureClass);
            unmeasuredRuns += 1;
            continue;
          }

          if (written.length > 0 || treeChanges.length > 0) {
            // The runner wrote when the suite declares it may not. The reply is
            // not scored: a run outside its declared envelope is a run the
            // measurement does not describe, so it is an environment failure.
            console.error(
              `    ${colors.red}${item.id} run ${runIndex + 1}: the runner wrote ${[...written, ...treeChanges].join(', ')} under a read-only declaration${colors.reset}`,
            );
            lostRunClasses.push('environment-configuration');
            unmeasuredRuns += 1;
            continue;
          }

          // A non-zero exit is an observation. The runner spells its own failure
          // classes as exit codes for exactly this reason, so the class here is
          // the one it derived from the thrown error, with no second table.
          const { observation } = result;
          if (observation.exitCode !== 0) {
            const stderr = observation.stderr.kind === 'text' ? observation.stderr.value : JSON.stringify(observation.stderr.value);
            console.error(
              `    ${colors.red}${item.id} run ${runIndex + 1}: ${stderr.trim() || `exit ${observation.exitCode}`}${colors.reset}`,
            );
            lostRunClasses.push(failureClassForExit(observation.exitCode));
            unmeasuredRuns += 1;
            continue;
          }

          // The runner prints the response descriptor the contracts declare, so
          // the reply is already parsed by the time it crosses the boundary. The
          // harness parsing it a second time is what let the runner and the
          // scorer disagree about a fenced spelling.
          const selected = observation.stdout.kind === 'json' ? observation.stdout.value?.fragments : undefined;
          if (!Array.isArray(selected)) {
            console.error(`    ${colors.red}${item.id} run ${runIndex + 1}: no fragment list in the runner's reply${colors.reset}`);
            lostRunClasses.push('environment-parser');
            unmeasuredRuns += 1;
            continue;
          }
          signatures.add([...selected].sort().join(','));
          caseScores.push(scoreCase(item, selected));
        }

        completedRuns += caseScores.length;

        if (caseScores.length === 0) {
          console.log(`    ${colors.red}${item.id}: no measurable run${colors.reset}`);
          incompleteCases += 1;
          continue;
        }

        const first = caseScores[0];
        requiredTotal += caseScores.reduce((sum, score) => sum + score.required, 0);
        hitTotal += caseScores.reduce((sum, score) => sum + score.hits, 0);
        forbiddenHits += caseScores.reduce((sum, score) => sum + score.forbidden.length, 0);
        forbiddenOpportunities += caseScores.reduce((sum, score) => sum + score.forbiddenTotal, 0);

        // Stability is a claim about repeated runs, so it needs every run to have
        // been measured. With one of two runs failing, a single signature is one
        // observation, not agreement, and reporting it as `stable` would launder a
        // failed run into a pass.
        const complete = caseScores.length === runs;
        const stable = signatures.size === 1 && complete;
        const status =
          first.missing.length === 0 && first.forbidden.length === 0
            ? `${colors.green}✓${colors.reset}`
            : `${colors.yellow}•${colors.reset}`;
        console.log(
          `    ${status} ${item.id}: ${first.hits}/${first.required} required, ${first.forbidden.length} forbidden, ` +
            `${stable ? 'stable' : complete ? `${colors.red}${signatures.size} different sets on identical input${colors.reset}` : `${colors.red}only ${caseScores.length}/${runs} runs measured${colors.reset}`}`,
        );
        if (first.missing.length > 0) console.log(`        ${colors.yellow}missed:${colors.reset} ${first.missing.join(', ')}`);
        if (first.forbidden.length > 0) console.log(`        ${colors.red}loaded anyway:${colors.reset} ${first.forbidden.join(', ')}`);
        // An unstable set on complete runs is a measured quality failure. A case
        // short of its runs is an environment failure, and the two must not be
        // reported through the same channel.
        if (!complete) incompleteCases += 1;
        else if (!stable) unstableCases += 1;
      }
    }

    const recall = requiredTotal === 0 ? Number.NaN : hitTotal / requiredTotal;
    const forbiddenRate = forbiddenOpportunities === 0 ? Number.NaN : forbiddenHits / forbiddenOpportunities;
    const pct = (value) => (Number.isNaN(value) ? '  n/a' : `${(value * 100).toFixed(0).padStart(3)}%`);

    console.log(`  ${colors.dim}────────${colors.reset}`);
    console.log(`  required recall   ${pct(recall)}   (threshold ${pct(THRESHOLDS.requiredRecall)})`);
    console.log(`  forbidden rate    ${pct(forbiddenRate)}   (max ${pct(THRESHOLDS.forbiddenRate)})`);
    if (unmeasuredRuns > 0) console.log(`  ${colors.yellow}${unmeasuredRuns} run(s) produced nothing measurable${colors.reset}`);

    const expectedRuns = caseCount * runs;
    const measurements = {
      requiredRecall: measured(recall),
      forbiddenRate: measured(forbiddenRate),
      unstableCases,
      incompleteCases,
      unmeasuredRuns,
    };

    const failures = [];
    if (Number.isNaN(recall)) failures.push('required recall (unmeasurable)');
    else if (recall < THRESHOLDS.requiredRecall) failures.push('required recall');
    if (!Number.isNaN(forbiddenRate) && forbiddenRate > THRESHOLDS.forbiddenRate) failures.push('forbidden rate');
    if (unstableCases > 0) failures.push(`${unstableCases} unstable case(s)`);

    if (incompleteCases > 0) {
      const failureClass = worstFailureClass([...lostRunClasses, 'environment-incomplete-repetitions']);
      console.log(
        `  ${colors.red}${incompleteCases} case(s) completed fewer than ${runs} declared repetitions; stability is unmeasurable${colors.reset}\n`,
      );
      runners.push(
        runnerRecord(agent, options, versions, {
          expected: expectedRuns,
          completed: completedRuns,
          measurements,
          durationMs: Date.now() - agentStartedAt,
          failureClass,
          failures: [...failures, `${incompleteCases} case(s) short of ${runs} repetitions`],
        }),
      );
      continue;
    }

    if (failures.length > 0) {
      console.log(`  ${colors.red}below threshold: ${failures.join(', ')}${colors.reset}\n`);
    } else {
      console.log(`  ${colors.green}all thresholds met${colors.reset}\n`);
    }

    runners.push(
      runnerRecord(agent, options, versions, {
        expected: expectedRuns,
        completed: completedRuns,
        measurements,
        durationMs: Date.now() - agentStartedAt,
        failureClass: failures.length > 0 ? 'quality' : 'none',
        failures,
      }),
    );
  }

  finish({ options, startedAt, mode: 'live', suites, runners });
}

// A rejected promise is exit 2 with the reason printed. `main` is asynchronous
// because every entry point through eval-quality is, and an unhandled rejection
// would otherwise end the process with no failure class and no record.
if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}eval: ${error?.stack ?? error}${colors.reset}`);
    process.exit(2);
  });
}

module.exports = {
  loadSuites,
  validateSuites,
  parseSelection,
  scoreCase,
  buildPrompt,
  caseIndex,
  caseIds,
  parseArgs,
  RUNNER_CAPABILITIES,
  THRESHOLDS,
  SUITE_ID,
};
