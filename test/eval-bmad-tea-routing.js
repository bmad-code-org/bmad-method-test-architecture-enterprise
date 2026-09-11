/**
 * `bmad-tea` routing eval harness.
 *
 * `bmad-tea` is the agent a user meets before any workflow runs, and until this
 * suite existed nothing measured the only thing it does: read a sentence someone
 * wrote in their own words and pick one item off a ten-item menu. It was the one
 * TEA skill with no eval of any kind, declared `deferred` in the suite manifest
 * for exactly that reason.
 *
 * A wrong route is the most expensive mistake the module can make, and the
 * cheapest one to miss. Every artifact downstream of it is well-formed, cites the
 * repository, and answers a question the user did not ask. Nothing about the
 * output says so.
 *
 * WHAT IS MEASURED
 *
 *   route accuracy       — of the intents with one right answer, how often the
 *                          right menu item came back
 *   reason token recall  — whether the stated reason names the feature of the
 *                          message that decided it, scored by containment
 *                          against a token set the fixture declares, never by
 *                          judgment
 *   scope fidelity       — whether the epic, story or feature the user named
 *                          survives into the dispatch. The agent passes no scope
 *                          structurally, so restating it is the only observable
 *   clarification recall — of the intents where two or more menu items are
 *                          genuinely close, how often the answer asked, and
 *                          named what it was asking between
 *   decline recall       — of the intents no menu item serves, how often the
 *                          answer declined and said what was missing
 *
 * AND TWO CONTROLS, POINTING IN OPPOSITE DIRECTIONS
 *
 * Recall on its own rewards a system that reports everything, so the corpus
 * carries the cases that punish both degenerate answers.
 *
 *   confident routes on unservable intents — a skill that always picks its best
 *                          guess scores perfectly on the intents that have an
 *                          answer and sends everyone else into a workflow that
 *                          cannot help them. Zero is the bar
 *   hedged clear intents — a skill that answers "which did you mean?" to
 *                          everything never routes anything wrong and is
 *                          useless. Step 8 of the skill calls this out by name:
 *                          clarify only when two or more items are genuinely
 *                          close, and not as a confirmation ritual. Zero is the
 *                          bar
 *
 * THE ORACLE IS THE SKILL'S OWN TEXT
 *
 * All three actions come from Step 8 of `src/agents/bmad-tea/SKILL.md`: dispatch
 * a clear match directly, pause to clarify only when two or more items are
 * genuinely close, and do not dispatch when nothing on the menu fits. The corpus
 * asserts nothing the skill was not already told to do, and the harness checks
 * every expected menu code against the live `customize.toml`, so editing the menu
 * fails this corpus rather than quietly invalidating it.
 *
 * GROUND TRUTH NEVER REACHES THE AGENT
 *
 * The intents live in one file and the answers in another. Before a model call is
 * spent, the assembled prompt is searched for every ground-truth-only key and for
 * the ground-truth file's own bytes, the way `test/eval-trace.js` guards its own.
 * That check runs in `--validate-only` and `--preflight-only` too, so it is in the
 * pull-request gate rather than only in the runs that cost money.
 *
 * THREE MODES
 *
 *   --validate-only   Static. No vendor, no cost, no network. Asserts the corpus
 *                     is internally consistent, that every expected menu code and
 *                     workflow exists, and that no prompt carries an answer. This
 *                     is the mode `npm test` and CI run.
 *   --preflight-only  The static checks, then the runner: is the agent executable
 *                     on PATH, does it answer --version, does a built-in vendor
 *                     have a credential. Exits before any model call.
 *   default           Spends a vendor run per case per repetition.
 *
 * THE RUNNER IS READ-ONLY
 *
 * A routing decision is a reply, so the run needs no file. `cli/routing-runner.js`
 * declares the same list RUNNER_CAPABILITIES holds below and is what hands it to
 * the vendor. Every run happens in an empty disposable directory that is also the
 * authorization's working directory, and both it and the repository are checked
 * afterwards. A run that wrote anything is an environment failure and is never
 * scored.
 *
 * EVERY DECLARED REPETITION MUST COMPLETE
 *
 * Stability is a claim about repeated runs. A case that lost a run to a timeout or
 * an unparseable reply has fewer observations than the gate declared, so it is
 * unmeasurable and exits 2. A failed model call is never a low score.
 *
 * Usage:
 *   node test/eval-bmad-tea-routing.js --validate-only
 *   node test/eval-bmad-tea-routing.js --preflight-only --agent codex
 *   node test/eval-bmad-tea-routing.js --agent claude --runs 2
 *   node test/eval-bmad-tea-routing.js --agent custom --agent-cmd my-runner
 *   node test/eval-bmad-tea-routing.js --agent claude --json results/tea-routing.json
 *
 * Exit codes:
 *   0  the corpus is valid (--validate-only), the runner is ready
 *      (--preflight-only), or every vendor met the thresholds
 *   1  a threshold was missed, or the corpus is inconsistent (a real result)
 *   2  the environment could not run the eval (nothing was measured)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { AGENT_ADAPTERS, resolveModel } = require('../cli/lib/agent-adapters');
const { failureClassForExit } = require('../cli/routing-runner');
// The reply parser belongs to the command that produces the reply, for the
// reason cli/lib/parse-routing.js records. It is re-exported below so
// test/test-eval-replay.js scores stored answers through the same function the
// runner applies to a live one.
const { ROUTING_ACTIONS, parseRouting } = require('../cli/lib/parse-routing');
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
const { createProbePort, hostEnvironment, observedText, probeCommand, probeRequest } = require('./lib/probe-targets');
const { PROBE_TIMEOUT_MS, boundedProbe } = require('./lib/bounded-probe');

const PROJECT_ROOT = path.join(__dirname, '..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'tea-routing-eval');
const INTENTS = path.join(FIXTURE_ROOT, 'intents.json');
const GROUND_TRUTH = path.join(FIXTURE_ROOT, 'ground-truth.json');
const SKILL_ROOT = path.join(PROJECT_ROOT, 'src', 'agents', 'bmad-tea');
const SKILL_FILE = path.join(SKILL_ROOT, 'SKILL.md');
const MENU_FILE = path.join(SKILL_ROOT, 'customize.toml');
const SUITE_ID = 'bmad-tea-routing';

const ROUTING_INTERFACE = 'tea-routing-runner';
const ROUTING_OPERATION = 'route-intent';

const RUN_TIMEOUT_MS = 5 * 60_000;

/**
 * What the runner is allowed to do, and what tools/validate-eval-schemas.js
 * checks the manifest's `runnerCapabilities` against. It must equal the list
 * `cli/routing-runner.js` declares, because that command is what applies it
 * to the vendor call.
 */
const RUNNER_CAPABILITIES = ['read-only'];

/**
 * The keys that exist only in the oracle. `assertGroundTruthAbsent` searches
 * every assembled prompt for each of them and for the ground-truth file's own
 * bytes, so a prompt that leaked the answer fails before a call is spent.
 */
const GROUND_TRUTH_ONLY_KEYS = [
  'expectedAction',
  'expectedMenuCode',
  'expectedWorkflow',
  'decidingTokens',
  'scopeTokens',
  'candidateCodes',
];

/**
 * Five fractions and three counts.
 *
 * The fractions are deliberately not 1. A bar nobody clears teaches nothing and a
 * bar everyone clears teaches nothing, and each of these sits on a boundary the
 * corpus can actually land on: `routeAccuracy` at 0.9 is nine of the ten intents
 * with one right answer, `clarifyRecall` and `declineRecall` at 0.75 are three of
 * four, and `scopeFidelity` at 0.8 is five of the six intents that name a scope.
 *
 * The counts are the controls and two of them are zero, because the behavior they
 * forbid is named in Step 8 of the skill rather than inferred here. A confident
 * route on an intent nothing on the menu serves is the defect this suite exists
 * to catch; hedging on an intent that is already clear is the confirmation ritual
 * the same paragraph rules out.
 *
 * `maxUnstableCases` is 2 rather than 0. A routing decision that flips between
 * repetitions is not a decision, and zero is the honest target, but the suite
 * runs at two repetitions over eighteen cases and four of those cases hold two
 * menu items deliberately close together. One flip there is one observation.
 */
const THRESHOLDS = {
  routeAccuracy: 0.9,
  reasonTokenRecall: 0.8,
  scopeFidelity: 0.8,
  clarifyRecall: 0.75,
  declineRecall: 0.75,
  maxConfidentRoutesOnUnservable: 0,
  maxHedgedClearIntents: 0,
  maxUnstableCases: 2,
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
      case '--runs': {
        runs = Number.parseInt(argv[index + 1] ?? '', 10);
        if (!Number.isInteger(runs) || runs < 1) fatal(2, '--runs requires a positive integer');
        index += 1;
        break;
      }
      case '--agent-cmd': {
        agentCmd = argv[index + 1];
        if (!agentCmd) fatal(2, '--agent-cmd requires an executable path or name');
        if (agentCmd.includes(path.sep)) agentCmd = path.resolve(agentCmd);
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
  return { agents, runs, validateOnly, preflightOnly, agentCmd, agentArgs, envPass, model, jsonPath };
}

/**
 * The menu the skill dispatches from, read out of its own `customize.toml`.
 *
 * A purpose-built reader rather than a TOML dependency, because the whole of what
 * is needed here is the `[[agent.menu]]` array of tables and its three string
 * keys. What it is for is validation: every `expectedMenuCode` in the oracle is
 * checked against this, so an edit to the menu fails the corpus instead of
 * leaving it asserting an answer that no longer exists.
 *
 * @returns {Array<{code: string, description: string, label: string, skill: string|null}>}
 */
function menuItems() {
  const source = fs.readFileSync(MENU_FILE, 'utf8');
  const items = [];
  for (const block of source.split('[[agent.menu]]').slice(1)) {
    const body = block.split(/^\[/m)[0];
    const read = (key) => {
      const match = new RegExp(`^${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'm').exec(body);
      return match === null ? null : match[1].replaceAll(String.raw`\"`, '"');
    };
    const code = read('code');
    if (code === null) continue;
    const description = read('description') ?? '';
    items.push({
      code,
      description,
      // The menu writes "Test Design — risk assessment, ...", so the label is the
      // half before the dash. It is one of the spellings a clarifying question
      // may name a candidate by, since a user-facing question that says "TD" and
      // nothing else has not asked the user anything.
      label: description.split('—')[0].trim(),
      skill: read('skill'),
    });
  }
  return items;
}

/** The intents and the oracle, as one list of cases in corpus order. */
function loadCorpus() {
  const read = (file) => {
    if (!fs.existsSync(file)) fatal(2, `no fixture at ${path.relative(PROJECT_ROOT, file)}`);
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      fatal(2, `${path.relative(PROJECT_ROOT, file)} is not valid JSON: ${error.message}`);
      return null;
    }
  };
  const intents = read(INTENTS);
  const groundTruth = read(GROUND_TRUTH);
  return { intents, groundTruth, cases: (intents.cases ?? []).map((item) => ({ ...item, expected: groundTruth.cases?.[item.id] })) };
}

/**
 * Static validation, and the part CI runs.
 *
 * It keeps the corpus from rotting into assertions about a menu that has moved:
 * every expected code is checked against `customize.toml` and every expected
 * workflow against the menu item that names it, so a renamed skill or a dropped
 * menu row fails here rather than as a mysterious routing miss later.
 */
function validateCorpus({ intents, groundTruth, cases }) {
  const problems = [];
  const menu = menuItems();
  const byCode = new Map(menu.map((item) => [item.code, item]));
  if (menu.length === 0) problems.push('src/agents/bmad-tea/customize.toml declares no [[agent.menu]] item; there is nothing to route to');

  const seen = new Set();
  const answered = new Set(Object.keys(groundTruth.cases ?? {}));
  if ((intents.cases ?? []).length === 0) problems.push('test/fixtures/tea-routing-eval/intents.json carries no case');

  for (const item of cases) {
    const label = `intents.json :: ${item.id}`;
    if (!item.id) problems.push('a case carries no id');
    if (seen.has(item.id)) problems.push(`${label}: duplicate case id`);
    seen.add(item.id);
    answered.delete(item.id);
    if (typeof item.intent !== 'string' || item.intent.trim().length === 0) problems.push(`${label}: no intent text`);

    const expected = item.expected;
    if (expected === undefined) {
      problems.push(`${label}: ground-truth.json carries no answer for it`);
      continue;
    }
    if (!ROUTING_ACTIONS.includes(expected.expectedAction)) {
      problems.push(`${label}: expectedAction "${expected.expectedAction}" is not one of ${ROUTING_ACTIONS.join(', ')}`);
      continue;
    }
    if (!Array.isArray(expected.decidingTokens) || expected.decidingTokens.length === 0) {
      problems.push(`${label}: no decidingTokens, so its stated reason could not be scored against anything`);
    }
    // A deciding token has to be reachable from what the agent is shown, which is
    // the intent plus the skill and its menu. The deciding feature is often a
    // paraphrase: "no Playwright, no Cypress, nothing" is the absence of a
    // framework, and `framework` is the menu's own word for it. A token in
    // neither place is a token no grounded reason could be expected to carry,
    // and the score would be measuring the fixture rather than the skill.
    const prompt = buildPrompt(item);
    for (const token of expected.decidingTokens ?? []) {
      if (!containsToken(prompt, token))
        problems.push(`${label}: decidingToken ${JSON.stringify(token)} is in neither the intent nor the skill the agent is shown`);
    }
    // A scope token is held to the stricter rule, because scope is what the user
    // named and nothing else can supply it.
    for (const token of expected.scopeTokens ?? []) {
      if (!containsToken(item.intent, token)) problems.push(`${label}: scopeToken ${JSON.stringify(token)} is not in the intent`);
    }

    if (expected.expectedAction === 'route') {
      const menuItem = byCode.get(expected.expectedMenuCode);
      if (menuItem === undefined) {
        problems.push(`${label}: expectedMenuCode "${expected.expectedMenuCode}" is not a code in src/agents/bmad-tea/customize.toml`);
      } else if ((menuItem.skill ?? null) !== (expected.expectedWorkflow ?? null)) {
        problems.push(
          `${label}: the menu maps ${menuItem.code} to ${menuItem.skill ?? 'a prompt rather than a skill'} and the oracle expects ${expected.expectedWorkflow ?? 'null'}`,
        );
      }
      if ((expected.candidateCodes ?? []).length > 0)
        problems.push(`${label}: a route case declares candidateCodes, which only a clarify case asks between`);
    } else {
      if (expected.expectedMenuCode !== null) problems.push(`${label}: a ${expected.expectedAction} case must expect no menu code`);
      if (expected.expectedWorkflow !== null) problems.push(`${label}: a ${expected.expectedAction} case must expect no workflow`);
    }

    if (expected.expectedAction === 'clarify') {
      const candidates = expected.candidateCodes ?? [];
      if (candidates.length < 2) problems.push(`${label}: a clarify case needs at least two candidateCodes; one candidate is a route`);
      for (const code of candidates) {
        if (!byCode.has(code)) problems.push(`${label}: candidateCode "${code}" is not a code in src/agents/bmad-tea/customize.toml`);
      }
    } else if (expected.expectedAction === 'decline' && (expected.candidateCodes ?? []).length > 0) {
      problems.push(`${label}: a decline case declares candidateCodes, and nothing on the menu serves it`);
    }
  }

  for (const id of answered) problems.push(`ground-truth.json :: ${id}: answers a case intents.json does not carry`);

  // A corpus of one class measures one class. Each is named here rather than
  // counted loosely, because dropping the last unservable intent would leave
  // every threshold reachable and the control gone.
  for (const action of ROUTING_ACTIONS) {
    const count = cases.filter((item) => item.expected?.expectedAction === action).length;
    if (count === 0) problems.push(`the corpus carries no "${action}" case, so that half of the measurement is absent`);
  }

  return problems;
}

function escapeRegex(text) {
  return String(text).replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * A literal that matches in either case, spelled as character classes rather
 * than as a flag.
 *
 * The flag would be the obvious way to write this, and it cannot cross the
 * boundary: `tools/generate-contracts.js` turns each of these into a contract
 * oracle's `pattern`, which is a bare string with nowhere to carry `i`. Spelling
 * the insensitivity into the pattern is what lets the oracle and the scorer below
 * share one source string and one meaning.
 */
function caseInsensitiveLiteral(text) {
  return [...String(text)]
    .map((character) => (/[a-z]/i.test(character) ? `[${character.toUpperCase()}${character.toLowerCase()}]` : escapeRegex(character)))
    .join('');
}

/**
 * Containment, spelled as a fully anchored pattern.
 *
 * `eval-quality`'s `AnchoredPattern` requires every oracle pattern to begin `^`
 * and end `$`, so "the reason contains this somewhere" has to be written as "the
 * whole reason matches anything, then this, then anything". The shape is also
 * chosen to clear the evaluator's two-tier backtracking gate: no group, so the
 * nested-quantifier check cannot fire, and two quantifiers, so the linear step
 * estimate is three times the string length against a budget of a million.
 */
function containmentPatternSource(inner) {
  return String.raw`^[\s\S]*` + inner + String.raw`[\s\S]*$`;
}

/**
 * The pattern a deciding token is scored by: a word boundary at the start and a
 * prefix match after it, so `gate` counts `gates` and `implement` counts
 * `implemented`, in either case.
 *
 * This is the whole of how a stated reason is scored, and it is a source string
 * because `test/contracts/tea-routing.contract.json` carries the same bytes. A
 * reason judged by a model would be a second eval with its own error rate sitting
 * inside this one, and its disagreements would be indistinguishable from the
 * routing failures this suite is trying to see.
 */
function tokenPatternSource(token) {
  return containmentPatternSource(String.raw`\b` + caseInsensitiveLiteral(token));
}

function containsToken(text, token) {
  return new RegExp(tokenPatternSource(token)).test(String(text ?? ''));
}

/**
 * Every spelling a clarifying question may name one candidate by, as one pattern.
 *
 * The code is held to a whole word, because `CI` inside `decision` names nothing.
 * The workflow name and the menu label are substrings, because a question that
 * says "the test-design workflow or the trace workflow" has asked the user
 * something and a question that says "TD or TR" has not, so both have to count.
 */
function candidatePatternSource(code, menu) {
  const item = menu.find((entry) => entry.code === code);
  const alternatives = [String.raw`\b${escapeRegex(code)}\b`];
  if (item?.skill) alternatives.push(caseInsensitiveLiteral(item.skill));
  if (item?.label) alternatives.push(caseInsensitiveLiteral(item.label));
  return containmentPatternSource(`(?:${alternatives.join('|')})`);
}

/** Whether a question names the candidate, by code, by workflow name, or by menu label. */
function namesCandidate(question, code, menu) {
  return new RegExp(candidatePatternSource(code, menu)).test(String(question ?? ''));
}

/** The pattern a decline's `missing` is held to: it has to say something. */
const MISSING_PATTERN_SOURCE = containmentPatternSource(String.raw`\S`);

/**
 * One answer, scored against one case's oracle.
 *
 * Returns null for an unparseable reply, which is an environment failure rather
 * than a bad routing decision, and is counted as one by every caller. The shape
 * this returns is what the stored replay corpus records, so it holds only what
 * can be checked by hand.
 *
 * @param {object} expected - The case's ground-truth entry.
 * @param {object|null} answer - The parsed routing answer.
 * @param {Array<object>} menu - The live menu, for candidate spellings.
 */
function scoreCase(expected, answer, menu) {
  if (answer === null) return null;
  const tokens = expected.decidingTokens ?? [];
  const tokensFound = tokens.filter((token) => containsToken(answer.reason, token));
  const scopeTokens = expected.scopeTokens ?? [];
  const scopeFound = scopeTokens.filter((token) => containsToken(answer.scope, token));
  const candidates = expected.candidateCodes ?? [];
  const candidatesNamed = candidates.filter((code) => namesCandidate(answer.question, code, menu));

  const actionCorrect = answer.action === expected.expectedAction;
  const routeCase = expected.expectedAction === 'route';
  return {
    action: answer.action,
    menuCode: answer.menuCode,
    workflow: answer.workflow,
    actionCorrect,
    // The menu item alone, which is what the contract's menu oracle reads. It is
    // a separate field from routeCorrect so the oracle and this scorer can be
    // compared on one question at a time.
    menuCorrect: routeCase && answer.menuCode === expected.expectedMenuCode,
    // A route is right only when the menu item and the workflow behind it are
    // both right. GATE expects a null workflow, because it is a menu item whose
    // target is a prompt, and naming a skill for it is the merge its own prompt
    // text forbids.
    routeCorrect:
      routeCase &&
      actionCorrect &&
      answer.menuCode === expected.expectedMenuCode &&
      answer.workflow === (expected.expectedWorkflow ?? null),
    tokens: tokens.length,
    tokensFound: tokensFound.length,
    tokensMissed: tokens.filter((token) => !containsToken(answer.reason, token)),
    scopeTokens: scopeTokens.length,
    scopeFound: scopeFound.length,
    scopeOk: scopeTokens.length > 0 && scopeFound.length === scopeTokens.length,
    candidates: candidates.length,
    candidatesNamed: candidatesNamed.length,
    clarifyOk:
      expected.expectedAction === 'clarify' && actionCorrect && candidates.length > 0 && candidatesNamed.length === candidates.length,
    // Whether the answer says what is missing at all, which is what the
    // contract's missing oracle reads, separated from the action for the same
    // reason menuCorrect is separated from routeCorrect.
    missingStated: new RegExp(MISSING_PATTERN_SOURCE).test(String(answer.missing ?? '')),
    declineOk:
      expected.expectedAction === 'decline' && actionCorrect && new RegExp(MISSING_PATTERN_SOURCE).test(String(answer.missing ?? '')),
    // The two controls. A confident route on an intent nothing serves, and a
    // hedge on an intent that is already clear.
    confidentRouteOnUnservable: expected.expectedAction === 'decline' && answer.action === 'route',
    hedgedClearIntent: routeCase && answer.action !== 'route',
  };
}

/** The stability key: two repetitions agree when they picked the same thing, not when they worded it the same. */
function signatureOf(score) {
  return score === null ? 'unmeasured' : [score.action, score.menuCode ?? '', score.workflow ?? ''].join('|');
}

/** The prompt one case gets: the skill as it ships, its menu as it ships, and one user message. */
function buildPrompt(item) {
  const skill = fs.readFileSync(SKILL_FILE, 'utf8');
  const menu = fs.readFileSync(MENU_FILE, 'utf8');
  return [
    'You are the TEA agent `bmad-tea`. Below are the skill definition you run under and the capabilities menu it dispatches from.',
    '',
    'Apply the dispatch rule in Step 8 of the skill to the single user message at the end. Do not run the activation steps, do not greet, and do not produce the workflow itself. Decide only where this message belongs.',
    '',
    `----- src/agents/bmad-tea/SKILL.md -----\n${skill}`,
    '',
    `----- src/agents/bmad-tea/customize.toml -----\n${menu}`,
    '',
    `----- the user's opening message -----\n${item.intent}`,
    '',
    '----- output -----',
    'Reply with JSON only, no prose and no code fence:',
    '{"action": "route|clarify|decline", "menuCode": "...", "workflow": "...", "scope": "...", "reason": "...", "question": "...", "missing": "..."}',
    '',
    '- `action` is `route` when one menu item clearly fits, `clarify` when two or more are genuinely close, and `decline` when nothing on the menu fits.',
    "- `menuCode` is the `code` of the item you are dispatching to, and `workflow` is that item's `skill` value. Both are null unless the action is `route`, and `workflow` is null for a menu item that carries a `prompt` instead of a `skill`.",
    "- `scope` restates the epic, story, feature or file set the message named, in the message's own words, or is null when it named none.",
    "- `reason` states the feature of the message that decided your answer, naming it in the message's own words.",
    '- `question` is the one short question you are asking and the menu items you are asking between, or null unless the action is `clarify`.',
    '- `missing` names what you would need, or what TEA does not offer, or null unless the action is `decline`.',
  ].join('\n');
}

/**
 * Every case with the exact prompt it is sent.
 *
 * @param {Array<object>} cases
 * @returns {Array<{id: string, prompt: string}>}
 */
function caseIndex(cases) {
  return cases.map((item) => ({ id: item.id, prompt: buildPrompt(item) }));
}

/**
 * The ids of every case this suite scores.
 *
 * tools/validate-eval-schemas.js checks the manifest's `caseCount` against the
 * length of this, the same way it checks its thresholds against THRESHOLDS.
 *
 * @returns {string[]}
 */
function caseIds() {
  return (loadCorpus().intents.cases ?? []).map((item) => item.id);
}

/**
 * The answers are in a file the agent must never see, so prove it before
 * spending anything.
 *
 * Both halves matter. The key search catches a prompt assembled from the wrong
 * object, and the byte search catches the whole file being pasted in. Neither is
 * hypothetical: every prompt here is built from files under `src/`, and one wrong
 * path away is the file next door.
 */
function assertGroundTruthAbsent(prompts) {
  const problems = [];
  const bytes = fs.readFileSync(GROUND_TRUTH, 'utf8').trim();
  for (const { id, prompt } of prompts) {
    for (const key of GROUND_TRUTH_ONLY_KEYS) {
      if (prompt.includes(key)) problems.push(`${id}: its prompt carries the ground-truth-only key "${key}"`);
    }
    if (prompt.includes(bytes)) problems.push(`${id}: its prompt carries the ground-truth file verbatim`);
  }
  return problems;
}

function preflight({ agents, agentCmd }) {
  const problems = [];
  const versions = {};
  const report = (failureClass, message) => problems.push({ failureClass, message });

  for (const agent of agents) {
    // Check the name against the adapter registry BEFORE spawning it, so an
    // unknown vendor is a configuration problem rather than a command.
    if (!Object.hasOwn(AGENT_ADAPTERS, agent)) {
      report('environment-configuration', `unknown agent "${agent}"; expected one of ${Object.keys(AGENT_ADAPTERS).join(', ')}`);
      continue;
    }
    const executable = agent === 'custom' ? agentCmd : agent;
    const probe = boundedProbe(executable, ['--version']);
    if (probe.ok) {
      versions[agent] =
        String(probe.stdout || '')
          .trim()
          .split('\n')[0] || null;
    } else if (probe.reason === 'failed') {
      report('environment-transport', `agent CLI "${executable}" failed its --version probe (exit ${probe.status})`);
    } else if (probe.reason === 'timeout') {
      report('environment-transport', `agent CLI "${executable}" did not answer --version within ${PROBE_TIMEOUT_MS}ms and was killed`);
    } else {
      report('environment-transport', `agent CLI "${executable}" is not on PATH (${probe.detail})`);
    }
    const credential = agent === 'custom' ? null : missingCredential(agent);
    if (credential) report('environment-authentication', credential);
  }
  return { problems, versions };
}

/**
 * Write the machine-readable record when --json asked for one, then exit with
 * the code the failure class carries.
 */
function finish({ options, startedAt, mode, cases, runners, suiteFailureClasses = [] }) {
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
    const index = caseIndex(cases);
    writeSuiteResult(
      options.jsonPath,
      suiteResultRecord({
        mode,
        suite,
        repository: repositoryState(PROJECT_ROOT),
        fixtureDigest: digestFiles(PROJECT_ROOT, suite.fixtures),
        promptDigest: digestPrompts(index),
        cases: index.map((item) => ({ id: item.id, promptDigest: digest(item.prompt) })),
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

/** A ratio that says `NaN` when it had nothing to divide, because an unmeasurable metric is a failure and never a pass. */
function ratio(hits, opportunities) {
  return opportunities === 0 ? Number.NaN : hits / opportunities;
}

async function main() {
  const startedAt = Date.now();
  const options = parseArgs(process.argv.slice(2));
  const { agents, runs, validateOnly, preflightOnly } = options;
  const staticMode = validateOnly ? 'validate-only' : preflightOnly ? 'preflight-only' : 'live';

  console.log(`${colors.cyan}========================================`);
  console.log('tea bmad-tea routing eval harness');
  console.log(`========================================${colors.reset}\n`);

  const corpus = loadCorpus();
  const problems = [...validateCorpus(corpus), ...assertGroundTruthAbsent(caseIndex(corpus.cases))];

  if (problems.length > 0) {
    console.error(`${colors.red}the routing corpus is inconsistent:${colors.reset}`);
    for (const problem of problems) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
    console.error('');
    // Inconsistent data is exit 1: a real finding about the repository, measured
    // with no model call. No cases are handed to the record, because building a
    // prompt out of data that just failed validation is how a reporting path
    // turns into a second crash.
    finish({ options, startedAt, mode: staticMode, cases: [], runners: [], suiteFailureClasses: ['quality'] });
  }

  const menu = menuItems();
  const counts = Object.fromEntries(
    ROUTING_ACTIONS.map((action) => [action, corpus.cases.filter((item) => item.expected.expectedAction === action).length]),
  );
  console.log(
    `${colors.green}✓${colors.reset} ${corpus.cases.length} intent(s) over a ${menu.length}-item menu: ` +
      `${counts.route} with one right answer, ${counts.clarify} genuinely close, ${counts.decline} nothing serves`,
  );
  console.log(`${colors.green}✓${colors.reset} no prompt carries the oracle`);

  if (validateOnly) {
    console.log(`\n${colors.green}routing corpus valid; nothing measured (--validate-only).${colors.reset}\n`);
    finish({ options, startedAt, mode: 'validate-only', cases: corpus.cases, runners: [] });
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
      cases: corpus.cases,
      runners: [],
      suiteFailureClasses: readiness.map((problem) => problem.failureClass),
    });
  }
  if (preflightOnly) {
    console.log(`${colors.green}✓${colors.reset} runner executable(s) answer --version; built-in credentials checked`);
    console.log(`\n${colors.green}pre-flight only; nothing measured.${colors.reset}\n`);
    finish({ options, startedAt, mode: 'preflight-only', cases: corpus.cases, runners: [] });
  }
  console.log(`${colors.dim}${runs} run(s) per intent per agent${colors.reset}\n`);

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
    let routeHits = 0;
    let routeOpportunities = 0;
    let tokensFound = 0;
    let tokensExpected = 0;
    let scopeHits = 0;
    let scopeOpportunities = 0;
    let clarifyHits = 0;
    let clarifyOpportunities = 0;
    let declineHits = 0;
    let declineOpportunities = 0;
    let confidentRoutesOnUnservable = 0;
    let hedgedClearIntents = 0;
    let unmeasuredRuns = 0;
    let completedRuns = 0;
    let unstableCases = 0;
    let incompleteCases = 0;
    const lostRunClasses = [];

    for (const item of corpus.cases) {
      const prompt = buildPrompt(item);
      const signatures = new Set();
      const caseScores = [];

      for (let runIndex = 0; runIndex < runs; runIndex += 1) {
        // The run's working directory is empty and disposable, and it is also the
        // authorization's cwd, so the policy is what confines the run rather than
        // a convention. The prompt carries everything the case needs.
        const scratch = scratchDirectory('tea-eval-routing');
        const treeBefore = workingTreeState(PROJECT_ROOT);
        let result;
        let written = [];
        let treeChanges = [];
        try {
          const { port } = await createProbePort({ cwd: scratch, interfaceIds: [ROUTING_INTERFACE] });
          result = await probeCommand(
            port,
            probeRequest({
              probeId: `${item.id}-run-${runIndex + 1}`,
              interfaceId: ROUTING_INTERFACE,
              operationId: ROUTING_OPERATION,
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

        if (!result.ok) {
          console.error(`  ${colors.red}${item.id} run ${runIndex + 1}: ${result.reason}${colors.reset}`);
          lostRunClasses.push(result.failureClass);
          unmeasuredRuns += 1;
          continue;
        }

        if (written.length > 0 || treeChanges.length > 0) {
          console.error(
            `  ${colors.red}${item.id} run ${runIndex + 1}: the runner wrote ${[...written, ...treeChanges].join(', ')} under a read-only declaration${colors.reset}`,
          );
          lostRunClasses.push('environment-configuration');
          unmeasuredRuns += 1;
          continue;
        }

        const { observation } = result;
        if (observation.exitCode !== 0) {
          const stderr = observedText(observation.stderr);
          console.error(`  ${colors.red}${item.id} run ${runIndex + 1}: ${stderr.trim() || `exit ${observation.exitCode}`}${colors.reset}`);
          lostRunClasses.push(failureClassForExit(observation.exitCode));
          unmeasuredRuns += 1;
          continue;
        }

        // The runner prints the response descriptor the contract declares, so the
        // reply is already parsed by the time it crosses the boundary.
        const answer = observation.stdout.kind === 'json' ? observation.stdout.value : null;
        const score = scoreCase(item.expected, answer && ROUTING_ACTIONS.includes(answer.action) ? answer : null, menu);
        if (score === null) {
          console.error(`  ${colors.red}${item.id} run ${runIndex + 1}: no routing answer in the runner's reply${colors.reset}`);
          lostRunClasses.push('environment-parser');
          unmeasuredRuns += 1;
          continue;
        }
        signatures.add(signatureOf(score));
        caseScores.push(score);
      }

      completedRuns += caseScores.length;
      if (caseScores.length === 0) {
        console.log(`  ${colors.red}${item.id}: no measurable run${colors.reset}`);
        incompleteCases += 1;
        continue;
      }

      const expectedAction = item.expected.expectedAction;
      for (const score of caseScores) {
        tokensExpected += score.tokens;
        tokensFound += score.tokensFound;
        if (score.scopeTokens > 0) {
          scopeOpportunities += 1;
          if (score.scopeOk) scopeHits += 1;
        }
        if (expectedAction === 'route') {
          routeOpportunities += 1;
          if (score.routeCorrect) routeHits += 1;
          if (score.hedgedClearIntent) hedgedClearIntents += 1;
        } else if (expectedAction === 'clarify') {
          clarifyOpportunities += 1;
          if (score.clarifyOk) clarifyHits += 1;
        } else {
          declineOpportunities += 1;
          if (score.declineOk) declineHits += 1;
          if (score.confidentRouteOnUnservable) confidentRoutesOnUnservable += 1;
        }
      }

      const first = caseScores[0];
      // Stability needs every run to have been measured. With one of two runs
      // lost, a single signature is one observation and not agreement, and
      // reporting it as stable would launder a failed run into a pass.
      const complete = caseScores.length === runs;
      const stable = signatures.size === 1 && complete;
      const good = expectedAction === 'route' ? first.routeCorrect : expectedAction === 'clarify' ? first.clarifyOk : first.declineOk;
      const status = good ? `${colors.green}✓${colors.reset}` : `${colors.yellow}•${colors.reset}`;
      console.log(
        `  ${status} ${item.id}: ${first.action}${first.menuCode ? ` ${first.menuCode}` : ''} ` +
          `(expected ${expectedAction}${item.expected.expectedMenuCode ? ` ${item.expected.expectedMenuCode}` : ''}), ` +
          `reason ${first.tokensFound}/${first.tokens}, ` +
          `${stable ? 'stable' : complete ? `${colors.red}${signatures.size} different answers on identical input${colors.reset}` : `${colors.red}only ${caseScores.length}/${runs} runs measured${colors.reset}`}`,
      );
      if (first.tokensMissed.length > 0)
        console.log(`      ${colors.yellow}reason never named:${colors.reset} ${first.tokensMissed.join(', ')}`);
      if (first.confidentRouteOnUnservable) console.log(`      ${colors.red}routed an intent nothing on the menu serves${colors.reset}`);
      if (first.hedgedClearIntent) console.log(`      ${colors.red}hedged an intent with one right answer${colors.reset}`);
      if (!complete) incompleteCases += 1;
      else if (!stable) unstableCases += 1;
    }

    const routeAccuracy = ratio(routeHits, routeOpportunities);
    const reasonTokenRecall = ratio(tokensFound, tokensExpected);
    const scopeFidelity = ratio(scopeHits, scopeOpportunities);
    const clarifyRecall = ratio(clarifyHits, clarifyOpportunities);
    const declineRecall = ratio(declineHits, declineOpportunities);
    const pct = (value) => (Number.isNaN(value) ? '  n/a' : `${(value * 100).toFixed(0).padStart(3)}%`);

    console.log(`  ${colors.dim}────────${colors.reset}`);
    console.log(`  route accuracy          ${pct(routeAccuracy)}   (threshold ${pct(THRESHOLDS.routeAccuracy)})`);
    console.log(`  reason token recall     ${pct(reasonTokenRecall)}   (threshold ${pct(THRESHOLDS.reasonTokenRecall)})`);
    console.log(`  scope fidelity          ${pct(scopeFidelity)}   (threshold ${pct(THRESHOLDS.scopeFidelity)})`);
    console.log(`  clarification recall    ${pct(clarifyRecall)}   (threshold ${pct(THRESHOLDS.clarifyRecall)})`);
    console.log(`  decline recall          ${pct(declineRecall)}   (threshold ${pct(THRESHOLDS.declineRecall)})`);
    console.log(
      `  confident routes on unservable intents ${confidentRoutesOnUnservable}   (max ${THRESHOLDS.maxConfidentRoutesOnUnservable})`,
    );
    console.log(`  hedged clear intents                   ${hedgedClearIntents}   (max ${THRESHOLDS.maxHedgedClearIntents})`);
    if (unmeasuredRuns > 0) console.log(`  ${colors.yellow}${unmeasuredRuns} run(s) produced nothing measurable${colors.reset}`);

    const expectedRuns = corpus.cases.length * runs;
    const measurements = {
      routeAccuracy: measured(routeAccuracy),
      reasonTokenRecall: measured(reasonTokenRecall),
      scopeFidelity: measured(scopeFidelity),
      clarifyRecall: measured(clarifyRecall),
      declineRecall: measured(declineRecall),
      confidentRoutesOnUnservable,
      hedgedClearIntents,
      unstableCases,
      incompleteCases,
      unmeasuredRuns,
    };

    const failures = [];
    const rate = (value, label, threshold) => {
      if (Number.isNaN(value)) failures.push(`${label} (unmeasurable)`);
      else if (value < threshold) failures.push(label);
    };
    rate(routeAccuracy, 'route accuracy', THRESHOLDS.routeAccuracy);
    rate(reasonTokenRecall, 'reason token recall', THRESHOLDS.reasonTokenRecall);
    rate(scopeFidelity, 'scope fidelity', THRESHOLDS.scopeFidelity);
    rate(clarifyRecall, 'clarification recall', THRESHOLDS.clarifyRecall);
    rate(declineRecall, 'decline recall', THRESHOLDS.declineRecall);
    if (confidentRoutesOnUnservable > THRESHOLDS.maxConfidentRoutesOnUnservable) {
      failures.push(`${confidentRoutesOnUnservable} confident route(s) on an unservable intent`);
    }
    if (hedgedClearIntents > THRESHOLDS.maxHedgedClearIntents) failures.push(`${hedgedClearIntents} hedged clear intent(s)`);
    if (unstableCases > THRESHOLDS.maxUnstableCases) failures.push(`${unstableCases} unstable case(s)`);

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

  finish({ options, startedAt, mode: 'live', cases: corpus.cases, runners });
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
  assertGroundTruthAbsent,
  buildPrompt,
  candidatePatternSource,
  caseIds,
  caseIndex,
  caseInsensitiveLiteral,
  containsToken,
  loadCorpus,
  menuItems,
  namesCandidate,
  parseArgs,
  parseRouting,
  scoreCase,
  signatureOf,
  tokenPatternSource,
  validateCorpus,
  GROUND_TRUTH_ONLY_KEYS,
  MISSING_PATTERN_SOURCE,
  ROUTING_INTERFACE,
  ROUTING_OPERATION,
  RUNNER_CAPABILITIES,
  THRESHOLDS,
  SUITE_ID,
};
