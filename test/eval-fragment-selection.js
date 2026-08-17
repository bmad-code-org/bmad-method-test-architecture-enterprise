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
 * TWO MODES
 *
 *   --validate-only  Static. No vendor, no cost, no network. Asserts the eval
 *                    data is internally consistent and that every fragment it
 *                    names exists and is indexed for that workflow. This is the
 *                    mode `npm test` and CI run.
 *   default          Spends a vendor run per case per repetition. Run it by hand
 *                    or on a schedule; it needs a logged-in claude or codex.
 *
 * Usage:
 *   node test/eval-fragment-selection.js --validate-only
 *   node test/eval-fragment-selection.js --agent claude --runs 3
 *   node test/eval-fragment-selection.js --agent codex --workflow bmad-testarch-automate
 *   node test/eval-fragment-selection.js --agent custom --agent-cmd my-runner --agent-arg --headless
 *
 * Exit codes:
 *   0  data is valid (--validate-only), or every vendor met the thresholds
 *   1  a threshold was missed, or the eval data is inconsistent (a real result)
 *   2  the environment could not run the eval (nothing was measured)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parse } = require('csv-parse/sync');

const { runAgent } = require('../cli/lib/run-agent');
const { AGENT_ADAPTERS } = require('../cli/lib/agent-adapters');
const { missingCredential } = require('./eval-test-review');

const PROJECT_ROOT = path.join(__dirname, '..');
const EVAL_ROOT = path.join(__dirname, 'evals');
const WORKFLOW_ROOT = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch');

const RUN_TIMEOUT_MS = 5 * 60_000;

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
  let agentCmd;
  let model;
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
      case '--validate-only': {
        validateOnly = true;
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
  return { agents, workflows, runs, validateOnly, agentCmd, agentArgs, envPass, model };
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

/**
 * The fragment list out of the agent's reply.
 *
 * Returns null when nothing parseable came back, so "the contract changed" never
 * reports as "the agent selected nothing", which would look like a real and very
 * bad result.
 */
function parseSelection(stdout) {
  const text = String(stdout || '');
  const candidates = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/g;
  for (const match of text.matchAll(fenced)) candidates.push(match[1]);
  const braced = /\{[\s\S]*"fragments"[\s\S]*\}/.exec(text);
  if (braced) candidates.push(braced[0]);
  candidates.push(text);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim());
      if (Array.isArray(parsed?.fragments)) {
        return parsed.fragments
          .map((name) =>
            String(name)
              .replace(/^knowledge\//, '')
              .trim(),
          )
          .filter(Boolean);
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
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
  for (const agent of agents) {
    // Check the name against the adapter registry BEFORE spawning it. runAgent
    // would reject an unknown vendor too, but only after preflight had already
    // handed the string to spawnSync as a command.
    if (!Object.prototype.hasOwnProperty.call(AGENT_ADAPTERS, agent)) {
      problems.push(`unknown agent "${agent}"; expected one of ${Object.keys(AGENT_ADAPTERS).join(', ')}`);
      continue;
    }
    const executable = agent === 'custom' ? agentCmd : agent;
    const probe = spawnSync(executable, ['--version'], { encoding: 'utf8' });
    if (probe.error) problems.push(`agent CLI "${executable}" is not on PATH (${probe.error.code})`);
    else if (probe.status !== 0) problems.push(`agent CLI "${executable}" failed its --version probe (exit ${probe.status})`);
    const credential = agent === 'custom' ? null : missingCredential(agent);
    if (credential) problems.push(credential);
  }
  if (problems.length > 0) {
    console.error(`${colors.red}eval pre-flight failed; nothing was measured:${colors.reset}`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(`\n${colors.dim}A failed pre-flight is exit 2, never a 0% score.${colors.reset}`);
    process.exit(2);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const { agents, workflows, runs, validateOnly } = options;

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
    process.exit(1);
  }

  console.log(
    `${colors.green}✓${colors.reset} ${suites.length} suite(s), ${caseCount} case(s); every named fragment exists and is indexed`,
  );

  if (validateOnly) {
    console.log(`\n${colors.green}eval data valid; nothing measured (--validate-only).${colors.reset}\n`);
    process.exit(0);
  }

  preflight(options);
  console.log(`${colors.dim}${runs} run(s) per case per agent${colors.reset}\n`);

  let anyBelowThreshold = false;

  for (const agent of agents) {
    console.log(`${colors.cyan}${agent}${colors.reset}`);
    let requiredTotal = 0;
    let hitTotal = 0;
    let forbiddenHits = 0;
    let forbiddenOpportunities = 0;
    let unmeasured = 0;

    for (const suite of suites) {
      console.log(`  ${colors.dim}${suite.data.workflow}${colors.reset}`);
      for (const item of suite.data.cases) {
        const prompt = buildPrompt(suite, item);
        const signatures = new Set();
        const caseScores = [];

        for (let runIndex = 0; runIndex < runs; runIndex += 1) {
          let stdout = '';
          try {
            ({ stdout } = runAgent(prompt, {
              agent,
              agentCommand: options.agentCmd,
              agentArgs: options.agentArgs,
              envPass: options.envPass,
              model: options.model,
              timeout: RUN_TIMEOUT_MS,
              cwd: PROJECT_ROOT,
            }));
          } catch (error) {
            console.error(`    ${colors.red}${item.id} run ${runIndex + 1}: ${error.message}${colors.reset}`);
            unmeasured += 1;
            continue;
          }
          const selected = parseSelection(stdout);
          if (selected === null) {
            console.error(`    ${colors.red}${item.id} run ${runIndex + 1}: no parseable fragment list in the reply${colors.reset}`);
            unmeasured += 1;
            continue;
          }
          signatures.add([...selected].sort().join(','));
          caseScores.push(scoreCase(item, selected));
        }

        if (caseScores.length === 0) {
          console.log(`    ${colors.red}${item.id}: no measurable run${colors.reset}`);
          anyBelowThreshold = true;
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
        const stable = signatures.size === 1 && caseScores.length === runs;
        const status =
          first.missing.length === 0 && first.forbidden.length === 0
            ? `${colors.green}✓${colors.reset}`
            : `${colors.yellow}•${colors.reset}`;
        console.log(
          `    ${status} ${item.id}: ${first.hits}/${first.required} required, ${first.forbidden.length} forbidden, ` +
            `${stable ? 'stable' : caseScores.length < runs ? `${colors.red}only ${caseScores.length}/${runs} runs measured${colors.reset}` : `${colors.red}${signatures.size} different sets on identical input${colors.reset}`}`,
        );
        if (first.missing.length > 0) console.log(`        ${colors.yellow}missed:${colors.reset} ${first.missing.join(', ')}`);
        if (first.forbidden.length > 0) console.log(`        ${colors.red}loaded anyway:${colors.reset} ${first.forbidden.join(', ')}`);
        if (!stable) anyBelowThreshold = true;
      }
    }

    const recall = requiredTotal === 0 ? Number.NaN : hitTotal / requiredTotal;
    const forbiddenRate = forbiddenOpportunities === 0 ? Number.NaN : forbiddenHits / forbiddenOpportunities;
    const pct = (value) => (Number.isNaN(value) ? '  n/a' : `${(value * 100).toFixed(0).padStart(3)}%`);

    console.log(`  ${colors.dim}────────${colors.reset}`);
    console.log(`  required recall   ${pct(recall)}   (threshold ${pct(THRESHOLDS.requiredRecall)})`);
    console.log(`  forbidden rate    ${pct(forbiddenRate)}   (max ${pct(THRESHOLDS.forbiddenRate)})`);
    if (unmeasured > 0) console.log(`  ${colors.yellow}${unmeasured} run(s) produced nothing measurable${colors.reset}`);

    const failures = [];
    if (Number.isNaN(recall)) failures.push('required recall (unmeasurable)');
    else if (recall < THRESHOLDS.requiredRecall) failures.push('required recall');
    if (!Number.isNaN(forbiddenRate) && forbiddenRate > THRESHOLDS.forbiddenRate) failures.push('forbidden rate');

    if (failures.length > 0) {
      anyBelowThreshold = true;
      console.log(`  ${colors.red}below threshold: ${failures.join(', ')}${colors.reset}\n`);
    } else {
      console.log(`  ${colors.green}all thresholds met${colors.reset}\n`);
    }
  }

  process.exit(anyBelowThreshold ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { loadSuites, validateSuites, parseSelection, scoreCase, buildPrompt, parseArgs, THRESHOLDS };
