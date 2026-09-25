/**
 * Every script in the `npm test` chain runs somewhere in CI.
 *
 * How many checks that is belongs in the output. `chainedScripts` reads them
 * off `package.json` and `main` prints the count, so a comment here naming that
 * number beside the code computing it would be exactly the drift this file
 * exists to catch.
 *
 * The GitHub Actions workflow reaches the chain two ways. The `chain` job in
 * `.github/workflows/quality.yaml` splits it across a matrix of runners with
 * `node tools/test-shards.js --shard ${{ matrix.shard }}/N`, which partitions
 * every chained script over the N shards, so a workflow job that runs that
 * command over a matrix listing exactly 1 through N covers the whole chain.
 * Any other workflow step covers a chained script by naming it as a literal
 * `npm run <script>`, which is how the prettier, eslint, markdownlint,
 * supply-chain and layering jobs name theirs.
 *
 * Before the split, the workflow ran each check as its own step, and that
 * transcription drifted. Four checks added in one change reached `npm test`
 * and never reached the workflow, so contract drift, a broken replay record
 * and a corrupted trace corpus would all have passed CI on a pull request
 * while failing on a laptop.
 *
 * So this compares the two and fails on a chain entry that neither a full
 * shard matrix nor a named step runs, and on a sharded job that could skip a
 * shard or hide its failure (`shardRunProblems` lists each way). The reverse
 * is allowed: a workflow may run more than the chain does,
 * which is how the docs job's link check and site build work.
 *
 * The threat model is drift. These checks hold the chain's CI configuration
 * against the edits someone makes to save time or to reorganize a workflow: a
 * shard dropped from the matrix, a step made optional, a trigger narrowed. They
 * are not a defense against a hostile editor of the workflow, who could plant
 * an environment variable that neuters the run or change this file in the same
 * pull request, so they refuse no environment variables.
 *
 * The reverse direction has its own gap: nothing held every OTHER script in
 * `package.json` to that same "covered or explained" bar, so a script outside
 * the chain (a fix-mode variant, a live eval, a release trigger) could sit
 * there uncovered and unexplained indefinitely, and a genuinely dead script
 * (a duplicate alias nothing calls any more) is indistinguishable from one of
 * those without reading every line by hand. `uncoveredScripts` closes that:
 * every script is either found running in CI, listed in `DELIBERATELY_LOCAL`
 * with the reason it stays out, or it fails. `test` itself is exempted by
 * name rather than added to the allowlist, because its sub-scripts are what
 * `chainedScripts` and `scriptsCoveredInCi` below already validate
 * individually, and the workflow shards those sub-scripts across runners.
 *
 * It also holds the chain against `scripts` itself: every name the chain calls
 * has to be defined. `npm run` reports a missing script only when the chain
 * reaches it, and a rebase resolution that takes one side of the chain string can
 * drop a definition while keeping the entry that calls it, so the failure arrives
 * after the commit with nothing naming the cause.
 *
 * Usage: node tools/validate-ci-coverage.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const PROJECT_ROOT = path.join(__dirname, '..');
const WORKFLOW_ROOT = path.join(PROJECT_ROOT, '.github', 'workflows');

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
};

/** One part of the `npm test` chain the shards can run: a bare `npm run <script>`. */
const CHAIN_PART = /^npm run ([\w:.-]+)$/;

/**
 * The script names `npm test` chains, in order.
 *
 * Throws on any `&&` part that is not a bare `npm run <script>`: CI runs the
 * chain only through tools/test-shards.js, which runs scripts by name, so a
 * part like `node test/x.js` would run on a laptop and never in CI.
 */
function chainedScripts(manifest) {
  return manifest.scripts.test.split('&&').map((raw) => {
    const part = raw.trim();
    const match = CHAIN_PART.exec(part);
    if (!match) {
      throw new Error(
        `package.json's test chain holds ${JSON.stringify(part)}, which is not a bare \`npm run <script>\`; CI runs the chain through tools/test-shards.js, which runs only named scripts, so define it as a script and chain \`npm run\` of that`,
      );
    }
    return match[1];
  });
}

/**
 * Every `npm run <script>` any workflow invokes.
 *
 * A plain text scan rather than a YAML parse, because a step can reach a script
 * through a shell line, a matrix value, or a composite action, and all three
 * carry the same literal.
 */
function scriptsRunInCi() {
  const found = new Set();
  const files = fs.existsSync(WORKFLOW_ROOT) ? fs.readdirSync(WORKFLOW_ROOT) : [];
  for (const name of files) {
    if (!name.endsWith('.yml') && !name.endsWith('.yaml')) continue;
    const text = fs.readFileSync(path.join(WORKFLOW_ROOT, name), 'utf8');
    for (const match of text.matchAll(/npm run ([\w:-]+)/g)) found.add(match[1]);
  }
  return found;
}

/** The invocation that runs one shard of the chain, with the shard count it passes. */
const SHARD_INVOCATION = /node tools\/test-shards\.js --shard \$\{\{ matrix\.shard \}\}\/(\d+)\b/g;

/**
 * The whole run line a shard step may hold: the invocation and, in any order,
 * its `--coverage-dir` and `--timings` flags with double-quoted values that
 * expand only environment variables and `${{ matrix.shard }}`. Anything else
 * on the line (`--list`, `|| true`, `; true`, `&&`, a pipe, a command
 * substitution) could drop the shard's scripts or hide their failures. A
 * value may not hold a backslash, `!` or a line break either: bash reads a
 * backslash inside double quotes as an escape, so `"a\" || true #"` is one
 * quoted string to a regex and a closed quote plus `|| true` to bash.
 */
const SHARD_RUN_LINE =
  /^node tools\/test-shards\.js --shard \$\{\{ matrix\.shard \}\}\/\d+(?: --(?:coverage-dir|timings) "(?:[^"`$\\!\n\r]|\$[A-Z_]+|\$\{\{ matrix\.shard \}\})*")*$/;

/**
 * The workflow jobs in one workflow file's text that run the chain through
 * tools/test-shards.js, with what `shardRunProblems` needs to judge each: the
 * shard count the command passes, the parsed workflow, job and step.
 *
 * A YAML parse, unlike `scriptsRunInCi`, because the claim ties a step's
 * command to its own job's matrix and conditions, and a text scan cannot say
 * which job a matrix belongs to.
 */
function shardedChainRunsIn(name, text) {
  const workflow = yaml.load(text);
  const runs = [];
  for (const [job, definition] of Object.entries(workflow?.jobs ?? {})) {
    for (const step of definition?.steps ?? []) {
      if (typeof step?.run !== 'string') continue;
      for (const match of step.run.matchAll(SHARD_INVOCATION)) {
        runs.push({ file: name, job, total: Number.parseInt(match[1], 10), workflow, definition, step });
      }
    }
  }
  return runs;
}

/** Every workflow job that runs the chain through tools/test-shards.js, across every workflow file. */
function shardedChainRuns(workflowRoot = WORKFLOW_ROOT) {
  const files = fs.existsSync(workflowRoot) ? fs.readdirSync(workflowRoot).sort() : [];
  return files
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .flatMap((name) => shardedChainRunsIn(name, fs.readFileSync(path.join(workflowRoot, name), 'utf8')));
}

/** The filters under `pull_request` that would let a pull request through without running the shards. */
const PULL_REQUEST_FILTERS = ['types', 'paths', 'paths-ignore', 'branches-ignore'];

/**
 * Why a workflow's `on` does not run it on every pull request, whichever of
 * its three shapes `on` takes, or an empty list when it does.
 */
function pullRequestTriggerProblems(file, workflow) {
  const on = workflow?.on ?? workflow?.true;
  const named = typeof on === 'string' ? [on] : Array.isArray(on) ? on : on && typeof on === 'object' ? Object.keys(on) : [];
  if (!named.includes('pull_request')) return [`${file} does not run on pull_request, so its shards do not gate a pull request`];
  const config = on && typeof on === 'object' && !Array.isArray(on) ? on.pull_request : null;
  if (!config || typeof config !== 'object') return [];
  const problems = PULL_REQUEST_FILTERS.filter((key) => Object.hasOwn(config, key)).map(
    (key) => `${file} filters pull_request by \`${key}\`, so a pull request it filters out runs no shard`,
  );
  if (Object.hasOwn(config, 'branches')) {
    const branches = Array.isArray(config.branches) ? config.branches : [config.branches];
    const everyBranch = branches.includes('**') && branches.every((pattern) => typeof pattern === 'string' && !pattern.startsWith('!'));
    if (!everyBranch) {
      problems.push(
        `${file} limits pull_request to branches ${JSON.stringify(config.branches)}; only a filter matching every branch ("**") is allowed`,
      );
    }
  }
  return problems;
}

/**
 * Why one sharded run fails to run the whole chain on every pull request and
 * fail CI when any of it fails, or an empty list when it does. Each refusal
 * names a way a green run could skip a shard or swallow its failures.
 */
function shardRunProblems(run) {
  const where = `${run.file} job ${run.job}`;
  if (!Number.isInteger(run.total) || run.total < 1) return [`${where} passes a shard count of ${run.total}; it has to be 1 or more`];
  const problems = [];
  const expected = Array.from({ length: run.total }, (_, index) => index + 1);
  const matrix = run.definition?.strategy?.matrix;
  const shards = matrix?.shard;
  if (JSON.stringify(Array.isArray(shards) ? shards : []) !== JSON.stringify(expected)) {
    problems.push(
      `${where} runs tools/test-shards.js as ${run.total} shards over matrix.shard ${JSON.stringify(shards ?? null)}; the matrix has to list exactly ${JSON.stringify(expected)}`,
    );
  }
  const extraKeys = matrix && typeof matrix === 'object' ? Object.keys(matrix).filter((key) => key !== 'shard') : [];
  if (extraKeys.length > 0) {
    problems.push(
      `${where}'s matrix carries ${extraKeys.join(', ')}; only \`shard\` is allowed, since include and exclude add or drop shards`,
    );
  }
  for (const [owner, holder] of [
    ['job', run.definition],
    ['shard step', run.step],
  ]) {
    for (const key of ['if', 'continue-on-error']) {
      if (holder && Object.hasOwn(holder, key)) {
        problems.push(`${where}'s ${owner} sets \`${key}\`, which can skip the shard or keep its failure from failing CI`);
      }
    }
  }
  for (const key of ['shell', 'working-directory']) {
    if (run.step && Object.hasOwn(run.step, key)) {
      problems.push(`${where}'s shard step sets \`${key}\`, which can change how its run line runs or what its exit means`);
    }
  }
  for (const [owner, holder] of [
    ['job', run.definition],
    ['workflow', run.workflow],
  ]) {
    const defaults = holder?.defaults?.run;
    if (defaults && typeof defaults === 'object' && Object.keys(defaults).length > 0) {
      problems.push(
        `${where}'s ${owner} sets defaults.run (${Object.keys(defaults).join(', ')}), which can change how the shard step runs or what its exit means`,
      );
    }
  }
  if (typeof run.step?.run !== 'string' || !SHARD_RUN_LINE.test(run.step.run.trim())) {
    problems.push(
      `${where}'s shard step runs ${JSON.stringify(run.step?.run ?? null)}; it may hold only \`node tools/test-shards.js --shard \${{ matrix.shard }}/N\` and its --coverage-dir and --timings flags`,
    );
  }
  if (run.definition && Object.hasOwn(run.definition, 'needs')) {
    problems.push(`${where} sets \`needs\`, so a skipped or failed upstream job skips every shard and the workflow can still end green`);
  }
  problems.push(...pullRequestTriggerProblems(run.file, run.workflow));
  return problems;
}

/**
 * Every script CI runs: each literal `npm run <script>` in a workflow, plus the
 * whole chain when some job runs tools/test-shards.js over a full shard matrix.
 */
function scriptsCoveredInCi(chained, inCi = scriptsRunInCi(), runs = shardedChainRuns()) {
  const covered = new Set(inCi);
  if (runs.some((run) => shardRunProblems(run).length === 0)) for (const script of chained) covered.add(script);
  return covered;
}

/**
 * Every script `scriptsRunInCi()` will never find, paired with why running it
 * in CI would be wrong rather than merely unproven, not a convenience.
 */
const DELIBERATELY_LOCAL = {
  'docs:dev': 'an interactive dev server; categorically cannot run unattended in CI',
  'docs:preview': 'an interactive preview server; categorically cannot run unattended in CI',
  'docs:fix-links': '--write mode of the covered docs:validate-links; running fix-mode in CI would mutate the diff mid-job',
  'format:fix': '--write mode of the covered format:check; running fix-mode in CI would mutate the diff mid-job',
  'lint:fix': '--fix mode of the covered lint; running fix-mode in CI would mutate the diff mid-job',
  'generate:lockfile-age-cache':
    'a write-mode cache regenerator; the covered test:lockfile-age reads the cache it writes specifically to avoid registry calls in CI, so running the generator there would be circular',
  'regenerate:doc-claim-hash':
    'a manual, human-triggered helper that prints a sha256 for a doc-claims asOf.subject file; it takes a path argument CI has none to supply, and its only job is producing a hash for a human to paste into eval-quality.config.json by hand, so there is nothing for a CI run to assert against',
  'eval:all':
    'a live agent eval; costs real credentials and API spend per run, kept out of CI by the eval-quality/deterministic-gate split (see README.md)',
  'eval:atdd': 'a live agent eval; same reason as eval:all',
  'eval:automate':
    'no live agent and no vendor cost, unlike its siblings above; test:eval-automate-data already runs this exact deterministic check in CI, so running it again here under a second name would be redundant rather than a coverage gap',
  'eval:ci': 'a live agent eval; same reason as eval:all',
  'eval:contract-strength': 'a live agent eval; same reason as eval:all',
  'eval:fragment-selection': 'a live agent eval; same reason as eval:all',
  'eval:framework-scaffold':
    "no live agent and no vendor cost, but a real npm install against the real registry and a real Playwright/Chromium run, unlike eval:automate above; test:eval-framework-scaffold-data and test:framework-scaffold-install-isolation already run its deterministic and isolation checks in CI, and the live install-and-smoke run itself stays in the manual/scheduled full-matrix tier the same way every live-agent eval above does, per docs/explanation/eval-quality-roadmap.md's CI policy",
  'eval:nfr': 'a live agent eval; same reason as eval:all',
  'eval:preflight': 'the --preflight-only entry point into the live eval:contract-strength; same reason as eval:all',
  'eval:routing': 'a live agent eval; same reason as eval:all',
  'eval:teach-me-testing': 'a live agent eval; same reason as eval:all',
  'eval:test-design': 'a live agent eval; same reason as eval:all',
  'eval:test-review': 'a live agent eval; same reason as eval:all',
  'eval:trace': 'a live agent eval; same reason as eval:all',
  'eval:transcript': 'a live agent eval; same reason as eval:all',
  'test:coverage':
    "the single-process local form of the coverage gate; CI holds the same package.json thresholds by merging the chain shards' raw V8 output with `c8 report` in the coverage job, so running it there would repeat the whole chain serially on one runner, which is the 20-minute job the shards replaced",
  prepare:
    'an npm lifecycle hook every `npm ci`/`npm install` invokes automatically; it runs, just never via the literal `npm run prepare` text this scan looks for',
  prepublishOnly:
    'an npm lifecycle hook `npm publish` invokes automatically; its logic is exercised by the covered test:guard-publish, which seeds the refusal case directly rather than through the literal `npm run prepublishOnly` text this scan looks for',
  'release:major': 'a human-triggered `gh workflow run publish.yaml` call; a release is a deliberate action, not an automated gate',
  'release:minor': 'a human-triggered `gh workflow run publish.yaml` call; a release is a deliberate action, not an automated gate',
  'release:next': 'a human-triggered `gh workflow run publish.yaml` call; a release is a deliberate action, not an automated gate',
  'release:patch': 'a human-triggered `gh workflow run publish.yaml` call; a release is a deliberate action, not an automated gate',
};

/**
 * Every script in `package.json` that is neither found running in CI nor
 * named in `DELIBERATELY_LOCAL`, with `test` itself exempted (see the header
 * comment for why).
 */
function uncoveredScripts(manifest, inCi) {
  return Object.keys(manifest.scripts).filter((name) => name !== 'test' && !inCi.has(name) && !(name in DELIBERATELY_LOCAL));
}

/**
 * Every `DELIBERATELY_LOCAL` key that no longer names a `package.json` script.
 *
 * `uncoveredScripts` only checks the forward direction: a script the
 * allowlist doesn't cover. A renamed or deleted script leaves its old entry
 * here silently inert, which is the same blind spot this file exists to
 * close, just facing the other way.
 */
function staleDeliberatelyLocalEntries(manifest) {
  return Object.keys(DELIBERATELY_LOCAL).filter((name) => typeof manifest.scripts[name] !== 'string');
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  let chained;
  try {
    chained = chainedScripts(manifest);
  } catch (error) {
    console.error(`${colors.red}${error.message}${colors.reset}`);
    return 1;
  }
  if (chained.length === 0) {
    console.error(`${colors.red}package.json's test script chains no npm run steps${colors.reset}`);
    return 1;
  }

  // The other half of the same claim, and the half nothing held. `npm run` reports
  // a missing script only when the chain reaches it, which on a rebase is after the
  // commit, so a resolution that took one side of the chain string and dropped a
  // definition while keeping its caller produced a red chain whose cause was
  // invisible until it ran. This names the script instead.
  //
  // It exists because the hazard recurred within an hour on the author of its own
  // finding, who caught it the second time only by having just written it down.
  // Knowing to look is not a defence.
  const undefinedScripts = chained.filter((script) => typeof manifest.scripts[script] !== 'string');
  if (undefinedScripts.length > 0) {
    console.error(`${colors.red}${undefinedScripts.length} name(s) the npm test chain calls have no definition in scripts:${colors.reset}`);
    for (const script of undefinedScripts) console.error(`  - npm run ${script}`);
    console.error(
      `\n${colors.dim}Define the script in package.json, or remove its entry from the test chain. A chain entry whose definition was lost fails only when the chain runs.${colors.reset}`,
    );
    return 1;
  }

  const runs = shardedChainRuns();
  const runProblems = runs.flatMap((run) => shardRunProblems(run));
  if (runProblems.length > 0) {
    console.error(`${colors.red}a workflow job shards the npm test chain over an incomplete matrix:${colors.reset}`);
    for (const problem of runProblems) console.error(`  - ${problem}`);
    console.error(
      `\n${colors.dim}Make the job's strategy.matrix.shard list 1 through N, where N is the count its tools/test-shards.js command passes.${colors.reset}`,
    );
    return 1;
  }

  const inCi = scriptsCoveredInCi(chained, scriptsRunInCi(), runs);
  const missing = chained.filter((script) => !inCi.has(script));

  if (missing.length > 0) {
    console.error(`${colors.red}${missing.length} check(s) in the npm test chain never run in CI:${colors.reset}`);
    for (const script of missing) console.error(`  - npm run ${script}`);
    console.error(
      `\n${colors.dim}Run the chain in a workflow job through \`node tools/test-shards.js --shard \${{ matrix.shard }}/N\` over a matrix listing 1 through N (the chain job in .github/workflows/quality.yaml does), give the check its own \`npm run\` step, or remove it from the chain.${colors.reset}`,
    );
    return 1;
  }

  const uncovered = uncoveredScripts(manifest, inCi);
  if (uncovered.length > 0) {
    console.error(
      `${colors.red}${uncovered.length} script(s) in package.json are neither run in CI nor listed as deliberately local:${colors.reset}`,
    );
    for (const script of uncovered) console.error(`  - npm run ${script}`);
    console.error(
      `\n${colors.dim}Add a CI step that runs it, or add an entry to DELIBERATELY_LOCAL in tools/validate-ci-coverage.js with the reason it stays out.${colors.reset}`,
    );
    return 1;
  }

  const stale = staleDeliberatelyLocalEntries(manifest);
  if (stale.length > 0) {
    console.error(
      `${colors.red}${stale.length} DELIBERATELY_LOCAL entry(ies) name a script package.json no longer defines:${colors.reset}`,
    );
    for (const script of stale) console.error(`  - ${script}`);
    console.error(`\n${colors.dim}Remove the stale entry from DELIBERATELY_LOCAL in tools/validate-ci-coverage.js.${colors.reset}`);
    return 1;
  }

  const totalScripts = Object.keys(manifest.scripts).length;
  const sharded = runs.length > 0 ? ` (sharded by ${runs.map((run) => `${run.file} job ${run.job} over ${run.total}`).join(', ')})` : '';
  console.log(
    `${colors.green}✅${colors.reset} all ${chained.length} npm test chain step(s) are defined and run in CI${sharded}, and every one of ` +
      `${totalScripts} package.json script(s) is either CI-covered or deliberately local`,
  );
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = {
  chainedScripts,
  DELIBERATELY_LOCAL,
  scriptsCoveredInCi,
  scriptsRunInCi,
  shardedChainRuns,
  shardedChainRunsIn,
  shardRunProblems,
  staleDeliberatelyLocalEntries,
  uncoveredScripts,
};
