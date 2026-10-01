'use strict';

/**
 * Evaluation plans rendered by `bmad-testarch-ci` (Story 2.3, AD-11, AD-12, risk R2-02).
 *
 * The CI skill's templates are rendered by the agent following step files, so no deterministic renderer exists to call.
 * This test holds everything around the rendering that is deterministic, and the behavioral proof of the rendering is
 * the `evaluation-plan` case of the `ci` suite (test/eval-ci.js, test/replay/ci/evaluation-plan-*).
 *
 * Each case below is one revert check the story names:
 *  - the detection step is reached from the create entry (the `nextStepFile` chain from step 1), from the edit entry
 *    (`steps-e/step-01-assess.md` detects and `steps-e/step-02-apply-edit.md` renders, both through their
 *    `evaluationPlansStepFile` and their anchored load instructions) and from the resume routing, so deleting the step
 *    file or dropping any reference fails;
 *  - the GitHub Actions template carries the evaluation block between its markers, parsed as YAML: one step that runs
 *    `tea-evaluate ci` for the tier through `npm exec --prefix`, named for the tier's checks, an install of the evaluations
 *    folder with `--prefix`, and an upload of exactly the evaluation folder's `runs/` with `if: always()`, so removing the
 *    block or any pattern fails;
 *  - skill prose points at the runtime's schema and `ci-plan.js` and restates no AD-10 tier table, in every skill file but
 *    the knowledge fragments;
 *  - the fixture adopter's plan is the Story 1.10 fixture's plan with its evaluation folder moved, validates through the
 *    runtime's own reader, and the ground truth's elements are what that plan renders to, so a plan and a ground truth
 *    that drift apart fail;
 *  - the corpus validator refuses the malformed elements it names;
 *  - the CI suite's manifest lists exactly the files under each project root;
 *  - the stored `evaluation-plan` replay is a real capture of the live `eval:ci` run.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const YAML = require('yaml');

const { DEFAULT_TIERS, PLAN_PATH, readPlan } = require('../cli/lib/evaluate/ci-plan');
const { validateCorpus, scoreRun } = require('./eval-ci');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-ci');
const STEP = 'steps-c/step-03b-render-evaluation-plans.md';
const PLAN_SCHEMA_FILE = 'cli/lib/evaluate/schemas/evaluation-ci-plan.schema.json';
const PLAN_RULES_FILE = 'cli/lib/evaluate/ci-plan.js';
const GROUND_TRUTH = path.join(__dirname, 'fixtures', 'ci-eval', 'ground-truth.json');
const SET_ID = 'evaluation-plan-quarry-grader';
const FIXTURE_FOLDER = 'test/fixtures/ci-eval/evaluation-plan/evals/grader';
const SOURCE_FOLDER = 'test/fixtures/evaluate-mcp/evals/grader';
const REPLAY_ROOT = path.join(__dirname, 'replay', 'ci');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'ci-eval');
const MANIFEST = path.join(__dirname, 'evals', 'suite-manifest.json');

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };
const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const readSkill = (relative) => {
  const file = path.join(SKILL, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

/** The `key: 'value'` lines of a step file's frontmatter. */
function frontmatterOf(text) {
  const match = /^---\n([\S\s]*?)\n---/.exec(text ?? '');
  const entries = {};
  for (const line of (match?.[1] ?? '').split('\n')) {
    const pair = /^([A-Za-z]+):\s*'?(.*?)'?\s*$/.exec(line);
    if (pair) entries[pair[1]] = pair[2];
  }
  return entries;
}

/** A frontmatter value naming a skill file, as a path relative to the skill root. */
function skillPathOf(value) {
  return typeof value === 'string' && value.startsWith('{skill-root}/') ? value.slice('{skill-root}/'.length) : null;
}

/** The blank-line separated paragraphs of a document, so a whole paragraph can be pinned. */
const paragraphsOf = (text) =>
  String(text ?? '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim());

/**
 * Whether `sentence` stands in `text` from the start of a line, a list item, a bold lead or a previous sentence, so a
 * negated or reworded copy that merely contains its words does not satisfy it.
 */
function hasSentence(text, sentence) {
  const source = String(text ?? '');
  const at = source.indexOf(sentence);
  if (at === -1) return false;
  const lead = source.slice(source.lastIndexOf('\n', at - 1) + 1, at);
  return /^(?:(?:[-*] |\d+\. )?(?:\*\*[^*]+\*\* )?|.*\. )$/.test(lead);
}

/** Follows `nextStepFile` from a step file and returns every file on the way, the first one included. */
function nextChain(entry) {
  const chain = [];
  let current = entry;
  while (current !== null && !chain.includes(current)) {
    chain.push(current);
    current = skillPathOf(frontmatterOf(readSkill(current)).nextStepFile);
  }
  return chain;
}

function checkEntryPoints() {
  const skill = readSkill('SKILL.md') ?? '';
  const create = /\*\*If C:\*\* Load `\{skill-root\}\/([^`]+)`/.exec(skill)?.[1] ?? null;
  const edit = /\*\*If E:\*\* Load `\{skill-root\}\/([^`]+)`/.exec(skill)?.[1] ?? null;
  const resume = /\*\*If R:\*\* Load `\{skill-root\}\/([^`]+)`/.exec(skill)?.[1] ?? null;
  check(create !== null && edit !== null && resume !== null, 'SKILL.md lacks a create, edit or resume route');

  check(readSkill(STEP) !== null, `${STEP} is missing`);
  check(frontmatterOf(readSkill(STEP)).name === 'step-03b-render-evaluation-plans', `${STEP} carries another name in its frontmatter`);

  // Create mode: the chain of nextStepFile from the first step reaches the detection step before the validation step.
  const chain = create === null ? [] : nextChain(create);
  const at = chain.indexOf(STEP);
  check(at !== -1, `create mode: the nextStepFile chain from ${create} (${chain.join(' > ')}) skips ${STEP}`);
  check(
    at !== -1 && chain[at + 1] === 'steps-c/step-04-validate-and-summary.md',
    `create mode: ${STEP} is followed by another step than the validation step (${chain.join(' > ')})`,
  );
  check(
    at > 0 && chain[at - 1] === 'steps-c/step-03-configure-quality-gates.md',
    `create mode: ${STEP} follows another step than the quality gates step (${chain.join(' > ')})`,
  );

  // Edit mode: the assess step detects and validates, the apply step renders, each through its own reference and an
  // instruction that starts at the verb, so a negated sentence does not satisfy it.
  const assess = readSkill('steps-e/step-01-assess.md');
  const apply = readSkill('steps-e/step-02-apply-edit.md');
  check(
    skillPathOf(frontmatterOf(assess).nextStepFile) === 'steps-e/step-02-apply-edit.md',
    'edit mode: the assess step hands over to a step other than the apply step',
  );
  for (const [file, text] of [
    ['steps-e/step-01-assess.md', assess],
    ['steps-e/step-02-apply-edit.md', apply],
  ]) {
    check(
      skillPathOf(frontmatterOf(text).evaluationPlansStepFile) === STEP,
      `edit mode: ${file} names another file than ${STEP} as its evaluationPlansStepFile`,
    );
  }
  // Each load instruction is pinned as a whole paragraph, so a reworded, negated or truncated copy fails.
  check(
    paragraphsOf(assess).includes(
      'Load `{evaluationPlansStepFile}`, read it completely, and run its sections 1 and 2 (detect and validate) against the repository, holding what it finds in the conversation. Every `ci/evaluation-ci-plan.json` it finds is an edit to apply.',
    ),
    'edit mode: the assess step lacks its whole instruction that loads {evaluationPlansStepFile} for sections 1 and 2',
  );
  check(
    paragraphsOf(apply).includes(
      'When the loaded target is a pipeline file, run sections 3 and 4 of `{evaluationPlansStepFile}` on it, whether or not step 1 found plans, so the generated jobs of a plan that was deleted are removed, then return here. Skip its section 5.',
    ),
    'edit mode: the apply step lacks its whole instruction that loads {evaluationPlansStepFile} for sections 3 and 4 and skips section 5',
  );
  check(edit === 'steps-e/step-01-assess.md', `edit mode: SKILL.md routes E to ${edit}, which is not the assess step`);

  // Resume: the checkpoint's last step routes onto the detection step and past it.
  const resumeText = resume === null ? '' : (readSkill(resume) ?? '');
  check(
    /'step-03-configure-quality-gates'` → Load `\.\/step-03b-render-evaluation-plans\.md`/.test(resumeText),
    'resume mode: a run last saved at the quality gates step skips the detection step',
  );
  check(
    /'step-03b-render-evaluation-plans'` → Load `\.\/step-04-validate-and-summary\.md`/.test(resumeText),
    'resume mode: a run last saved at the detection step skips the validation step',
  );
  const dashboard = resumeText.split('\n').find((line) => line.startsWith('4. Render Evaluation Plans'));
  check(
    dashboard ===
      '4. Render Evaluation Plans (step-03b-render-evaluation-plans) — {✅ if in stepsCompleted, ⬜ otherwise; when `lastStep` is `step-04-validate-and-summary` and this step is absent, "not run: checkpoint predates this step, use [E] Edit to render plans"}',
    'resume mode: the dashboard line of the detection step differs from the one that tells a checkpoint predating it to use [E] Edit',
  );
  const rows = resumeText.split('\n').filter((line) => /^\d+\. .*\(step-[\w-]+\) — /.test(line));
  check(
    rows.length === chain.length && resumeText.includes(`of ${chain.length}\n`),
    `resume mode: the dashboard lists ${rows.length} steps and the create chain runs ${chain.length}`,
  );
}

function checkTemplateBlock() {
  const template = readSkill('github-actions-template.yaml') ?? '';
  const match = /^# evaluation-plan:begin\n([\S\s]*?)^# evaluation-plan:end$/m.exec(template);
  check(match !== null, 'github-actions-template.yaml has no evaluation-plan:begin and evaluation-plan:end block');
  if (match === null) return;
  const body = match[1]
    .split('\n')
    .map((line) => line.replace(/^# ?/, ''))
    .join('\n');
  let parsed;
  try {
    parsed = YAML.parse(body, { uniqueKeys: true, strict: true });
  } catch (error) {
    check(false, `the evaluation block is not YAML: ${error.message.split('\n')[0]}`);
    return;
  }
  const jobs = Object.entries(parsed?.jobs ?? {});
  check(jobs.length === 1, `the evaluation block declares ${jobs.length} jobs, expected one per tier pattern`);
  const [jobId, job] = jobs[0] ?? [];
  check(jobId === 'JOB_ID', `the evaluation job is keyed ${JSON.stringify(jobId)} where the JOB_ID placeholder belongs`);
  check(job?.['timeout-minutes'] === 'TIMEOUT_MINUTES', 'the evaluation job lacks the TIMEOUT_MINUTES placeholder');
  check(job?.['continue-on-error'] === undefined, 'the evaluation job is marked continue-on-error, so no step of it can fail the run');
  check(
    /# tea-evaluation-plan: PLAN_PATH/.test(match[1]),
    'the evaluation block lacks the tea-evaluation-plan marker comment the re-render looks for',
  );
  const steps = Array.isArray(job?.steps) ? job.steps : [];

  // The tier step: exactly one step runs the runtime's tier entry, through npm exec with the evaluations folder as prefix.
  const tierSteps = steps.filter((step) => typeof step?.run === 'string' && step.run.includes('tea-evaluate'));
  check(tierSteps.length === 1, `the evaluation block holds ${tierSteps.length} steps that run tea-evaluate, expected one`);
  const [tierStep] = tierSteps;
  check(
    tierStep?.run.trim() === 'npm exec --prefix EVALUATIONS_FOLDER -- tea-evaluate ci --evaluation EVALUATION_FOLDER --tier TIER' &&
      tierStep.run.endsWith('\n'),
    'the tier step is not a block scalar that holds the npm exec invocation of tea-evaluate ci and nothing else',
  );
  check(
    typeof tierStep?.name === 'string' && tierStep.name.includes('CHECK_IDS'),
    'the tier step is not named for the ids of the checks on the tier',
  );
  check(tierStep?.if === undefined && tierStep?.['continue-on-error'] === undefined, 'the tier step carries an if or continue-on-error');

  // The install runs against the evaluations folder, and the job runs no root install or root-keyed cache.
  const installs = steps.filter((step) => typeof step?.run === 'string' && /^INSTALL\b/.test(step.run.trim()));
  check(
    installs.length === 1 && installs[0].run.trim() === 'INSTALL --prefix EVALUATIONS_FOLDER',
    'the evaluation block does not install the evaluations folder with --prefix in exactly one step',
  );
  check(
    !steps.some((step) => typeof step?.run === 'string' && /^npm (?:ci|install|i)\b(?![^\n]*--prefix)/m.test(step.run)),
    'the evaluation block runs an npm install with no --prefix',
  );
  check(
    !steps.some((step) => step?.with?.cache !== undefined),
    'the evaluation block caches on a root manifest the repository may not have',
  );

  // The evidence upload: exactly the evaluation folder's runs/ directory, whatever the result.
  const uploads = steps.filter((step) => typeof step?.uses === 'string' && step.uses.startsWith('actions/upload-artifact'));
  check(uploads.length === 1, `the evaluation block holds ${uploads.length} artifact uploads, expected one`);
  const upload = uploads[0];
  check(
    upload?.uses === 'actions/upload-artifact@v4',
    `the evaluation upload uses ${JSON.stringify(upload?.uses)} where actions/upload-artifact@v4 belongs`,
  );
  check(upload?.if === 'always()', `the evaluation upload runs under ${JSON.stringify(upload?.if)} where always() belongs`);
  check(
    upload?.with?.name === 'JOB_ID-runs',
    `the evaluation upload is named ${JSON.stringify(upload?.with?.name)} where the job id and -runs belong`,
  );
  check(
    upload?.with?.path === 'EVALUATION_FOLDER/runs/',
    `the evaluation upload path is ${JSON.stringify(upload?.with?.path)} where the evaluation folder's runs/ directory belongs`,
  );
  check(upload?.with?.['if-no-files-found'] === 'warn', 'the evaluation upload lacks if-no-files-found: warn');
  check(steps.indexOf(upload) > steps.indexOf(tierStep), 'the evaluation upload comes before the tier step');

  // The Node setup chooses the project's .nvmrc only at or above the floor the tooling declares.
  const nodeStep = steps.find((step) => step?.id === 'node-version');
  check(
    typeof nodeStep?.run === 'string' && nodeStep.run.includes('floor=NODE_FLOOR') && nodeStep.run.includes('value=NODE_LTS'),
    'the evaluation block lacks a Node version step that starts from the NODE_FLOOR and NODE_LTS placeholders',
  );
  check(
    nodeStep?.run.includes('sort -V') && nodeStep.run.includes('"$GITHUB_OUTPUT"'),
    'the Node version step does not compare .nvmrc with the floor or does not write its output',
  );

  // The legend and prose the render rules rest on are pinned line by line.
  const prose = template
    .split('\n')
    .map((line) => line.replace(/^# ?/, ''))
    .join(' ')
    .replaceAll(/\s+/g, ' ');
  for (const line of [
    'JOB_ID:             evaluation-<tier>, or evaluation-<folder>-<tier> for several plans',
    'TIMEOUT_MINUTES:    30 for pr and merge, 120 for scheduled and release',
    'NODE_FLOOR:         the lower bound of engines.node of the TeA package, 22.20.0 when it is not readable',
    'INSTALL:            npm ci when the evaluations folder holds a package-lock.json, else npm install',
  ]) {
    check(template.split('\n').includes(`#   ${line}`), `the template legend lacks the line ${JSON.stringify(line)}`);
  }
  check(
    prose.includes('A merge job repeats the step pattern for the pr tier, then for the merge tier.'),
    'the template prose lacks the sentence that orders the merge job: the pr tier, then the merge tier',
  );

  // The template as a whole stays YAML a workflow can start from.
  try {
    YAML.parse(template, { uniqueKeys: true, strict: true });
  } catch (error) {
    check(false, `github-actions-template.yaml no longer parses: ${error.message.split('\n')[0]}`);
  }
}

/** Every file under the skill except the knowledge fragments, as paths relative to the skill root. */
function skillFiles(directory = SKILL) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(SKILL, absolute).split(path.sep).join('/');
    if (entry.isDirectory()) return relative === 'resources/knowledge' ? [] : skillFiles(absolute);
    return [relative];
  });
}

function checkNoRestatedTable() {
  const step = readSkill(STEP) ?? '';
  check(step.includes(PLAN_SCHEMA_FILE), `${STEP} does not point at ${PLAN_SCHEMA_FILE}`);
  check(step.includes(PLAN_RULES_FILE), `${STEP} does not point at ${PLAN_RULES_FILE}`);
  check(step.includes('Never copy their contents into this skill or into a pipeline file.'), `${STEP} lacks its never-copy sentence`);
  check(fs.existsSync(path.join(ROOT, PLAN_SCHEMA_FILE)), `${PLAN_SCHEMA_FILE} does not exist`);
  check(fs.existsSync(path.join(ROOT, PLAN_RULES_FILE)), `${PLAN_RULES_FILE} does not exist`);

  // The ids that are not ordinary words each name one AD-10 default-table row. Writing one into the skill, with or
  // without its tier, copies the table. A test may import the table and the skill must point at it.
  const distinctive = Object.keys(DEFAULT_TIERS).filter((id) => id.includes('-') || id === 'gameability');
  check(distinctive.length >= 7, `the AD-10 table gives ${distinctive.length} distinctive check ids, expected at least 7`);
  const files = skillFiles();
  check(
    files.length > 10 && files.includes(STEP),
    `the whole-skill scan covers ${files.length} files and ${files.includes(STEP) ? 'includes' : 'omits'} the step`,
  );
  for (const relative of files) {
    const restated = distinctive.filter((id) => (readSkill(relative) ?? '').includes(id));
    check(
      restated.length === 0,
      `${relative} restates the AD-10 table by naming ${restated.join(', ')}; point at ${PLAN_RULES_FILE} instead`,
    );
  }
}

/** The ids of one tier's checks, in plan order. */
function checkIdsOf(plan, tier) {
  return plan.checks.filter((entry) => entry.placement.tier === tier).map((entry) => entry.id);
}

function checkFixturePlan() {
  const adopter = readPlan(path.join(ROOT, FIXTURE_FOLDER));
  check(adopter.absent !== true, `${FIXTURE_FOLDER}/${PLAN_PATH} is absent`);
  check(
    adopter.plan !== undefined && adopter.findings.length === 0,
    `the fixture adopter's plan breaks the runtime schema: ${JSON.stringify(adopter.findings)}`,
  );
  const source = readPlan(path.join(ROOT, SOURCE_FOLDER));
  check(source.plan !== undefined, `the Story 1.10 fixture's plan at ${SOURCE_FOLDER} does not read`);
  if (adopter.plan === undefined || source.plan === undefined) return;

  // "A copy of that plan": every field equal, with the evaluation folder the commands name moved into the adopter project.
  const moved = JSON.parse(JSON.stringify(source.plan).replaceAll(SOURCE_FOLDER, 'evals/grader'));
  check(
    JSON.stringify(adopter.plan) === JSON.stringify(moved),
    "the fixture adopter's plan is not the Story 1.10 fixture's plan with its evaluation folder moved",
  );

  // The evaluations folder holds the private package.json AD-20 writes, with both packages as devDependencies.
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/ci-eval/evaluation-plan/evals/package.json'), 'utf8'));
  check(
    manifest.private === true &&
      Object.keys(manifest.devDependencies ?? {})
        .sort()
        .join(',') === 'bmad-method-test-architecture-enterprise,eval-quality',
    "the fixture's evaluations folder lacks the private package.json with TeA and eval-quality as devDependencies",
  );

  const prIds = checkIdsOf(adopter.plan, 'pr');
  check(prIds.length >= 2, `the plan places ${prIds.length} checks on pr where the tier step needs at least two to be named for them`);

  const groundTruth = JSON.parse(fs.readFileSync(GROUND_TRUTH, 'utf8'));
  const set = groundTruth.fixtureSets.find((entry) => entry.id === SET_ID);
  check(set !== undefined, `ground-truth.json has no fixture set ${SET_ID}`);
  if (set === undefined) return;
  const element = (id) => set.expectedElements.find((entry) => entry.id === id);
  const tierCommand = 'npm exec --prefix evals -- tea-evaluate ci --evaluation evals/grader --tier pr';
  const tierElement = element('command-evaluation-ci-pr');
  check(
    tierElement?.command === tierCommand,
    `the ground truth lists ${JSON.stringify(tierElement?.command)} as the pr step where ${tierCommand} belongs`,
  );
  check(
    tierElement?.standaloneStep === true && JSON.stringify(tierElement?.checkIds) === JSON.stringify(prIds),
    `the ground truth names ${JSON.stringify(tierElement?.checkIds)} for the pr step where the plan's pr checks ${JSON.stringify(prIds)} belong`,
  );
  check(
    element('command-evaluation-install')?.command === 'npm install --prefix evals' &&
      element('command-evaluation-install')?.standaloneStep === true,
    'the ground truth lacks the standalone install of the evaluations folder',
  );
  check(element('command-install')?.standaloneStep === true, 'the ground truth lets the root install run in more than one step');
  const job = element('job-evaluation-pr');
  check(
    job?.jobId === 'evaluation-pr' && job?.command === tierCommand && job?.marker === `# tea-evaluation-plan: evals/grader/${PLAN_PATH}`,
    'the ground truth lacks the evaluation-pr job with its command and marker',
  );
  const upload = element('artifact-evaluation-runs');
  check(
    upload?.pathToken === 'evals/grader/runs/' && upload?.condition === 'always()',
    "the ground truth does not ask for an upload of the evaluation folder's runs/ under always()",
  );
  check(set.projectFiles.includes(`evals/grader/${PLAN_PATH}`), 'the fixture adopter does not declare its plan as a project file');
  check(set.projectFiles.includes('evals/package.json'), 'the fixture adopter does not declare the evaluations folder manifest');
}

/**
 * The scorer's reading of the tier step's name. Two replay cases cannot hold it, since a case that misses the tier step
 * element for another reason signs like it, so the capture is scored here with the step renamed.
 */
function checkStepNaming() {
  const captureFile = path.join(REPLAY_ROOT, 'evaluation-plan-live-capture', '.github', 'workflows', 'test.yml');
  const capture = fs.readFileSync(captureFile, 'utf8');
  const set = JSON.parse(fs.readFileSync(GROUND_TRUTH, 'utf8')).fixtureSets.find((entry) => entry.id === SET_ID);
  const missesOf = (text) =>
    scoreRun(set, text, { findings: [] })
      .elements.filter((element) => !element.present)
      .map((element) => element.id);
  check(missesOf(capture).length === 0, `the stored capture misses ${missesOf(capture).join(', ')}`);
  const named = 'name: "check, compile, seal, oracle-agreement, replay"';
  for (const [label, replacement] of [
    ['evaluate', 'name: "evaluate"'],
    ['the list without its last id', 'name: "check, compile, seal, oracle-agreement"'],
    ['the list without its first id', 'name: "compile, seal, oracle-agreement, replay"'],
  ]) {
    const renamed = capture.replace(named, replacement);
    check(renamed !== capture, `the stored capture no longer names its tier step for the checks, so the case for ${label} cannot run`);
    check(
      missesOf(renamed).join(',') === 'command-evaluation-ci-pr',
      `a tier step named for ${label} misses ${missesOf(renamed).join(', ') || 'nothing'} where the tier step element belongs`,
    );
  }

  // The marker belongs inside the evaluation job. Moved into a job that follows it, the job element misses.
  const marker = '    # tea-evaluation-plan: evals/grader/ci/evaluation-ci-plan.json\n';
  const moved = `${capture.replace(marker, '')}\n  later:\n${marker}    runs-on: ubuntu-latest\n    steps:\n      - run: echo later\n`;
  check(capture.includes(marker), 'the stored capture lacks the marker comment the marker case moves');
  check(
    missesOf(moved).join(',') === 'job-evaluation-pr',
    `the marker moved into a following job misses ${missesOf(moved).join(', ') || 'nothing'} where the job element belongs`,
  );
}

/**
 * Renderings the step prescribes that the stored capture does not show, scored through the same elements: a merge job
 * that repeats the pr step before its own, an evaluations folder with a lockfile, and the evaluation job's Node floor.
 */
function checkPrescribedRenderings() {
  const base = JSON.parse(fs.readFileSync(GROUND_TRUTH, 'utf8')).fixtureSets.find((entry) => entry.id === SET_ID);
  const command = (id, text, extra = {}) => ({ id, kind: 'command', command: text, standaloneStep: true, ...extra });
  const prStep = 'npm exec --prefix evals -- tea-evaluate ci --evaluation evals/grader --tier pr';
  const mergeStep = 'npm exec --prefix evals -- tea-evaluate ci --evaluation evals/grader --tier merge';
  const scored = (elements, text, nvmrcVersion = '24') =>
    scoreRun({ ...base, nvmrcVersion, expectedElements: elements }, text, { findings: [] });
  const missesOf = (result) => result.elements.filter((element) => !element.present).map((element) => element.id);

  const workflow = (jobs) => `name: t\non:\n  pull_request:\n  push:\n    branches: [main]\njobs:\n${jobs}`;
  const step = (name, run) => `      - name: ${name}\n        run: |\n          ${run}\n`;
  const mergePipeline = workflow(
    `  test:\n    runs-on: ubuntu-latest\n    steps:\n${step('install', 'npm ci')}` +
      `  evaluation-pr:\n    runs-on: ubuntu-latest\n    steps:\n${step('install', 'npm ci --prefix evals')}${step('pr', prStep)}` +
      `  evaluation-merge:\n    runs-on: ubuntu-latest\n    steps:\n${step('pr', prStep)}${step('merge', mergeStep)}`,
  );
  const elements = [
    command('root-install', 'npm ci'),
    command('lockfile-install', 'npm ci --prefix evals'),
    command('pr', prStep),
    command('merge', mergeStep),
    { id: 'on-pull-request', kind: 'trigger', event: 'pull_request' },
    { id: 'on-push', kind: 'trigger', event: 'push', branches: ['main'] },
  ];
  const merged = scored(elements, mergePipeline);
  check(missesOf(merged).length === 0, `a merge job that repeats the pr step before its own misses ${missesOf(merged).join(', ')}`);
  check(
    merged.unrequested.length === 0 && merged.ruleViolations.length === 0,
    'a merge job and a lockfile install score unrequested elements or violations',
  );
  // Quoting each path for the shell, as the step says to, is the same invocation.
  const quoted = mergePipeline
    .replaceAll(
      'npm exec --prefix evals -- tea-evaluate ci --evaluation evals/grader',
      "npm exec --prefix 'evals' -- tea-evaluate ci --evaluation 'evals/grader'",
    )
    .replace('npm ci --prefix evals', "npm ci --prefix 'evals'");
  const quotedResult = scored(elements, quoted);
  check(
    quoted !== mergePipeline && missesOf(quotedResult).length === 0,
    `a rendering that quotes its paths misses ${missesOf(quotedResult).join(', ')}`,
  );
  check(
    quotedResult.unrequested.length === 0,
    `a rendering that quotes its paths adds unrequested elements: ${quotedResult.unrequested.join('; ')}`,
  );
  const repeated = mergePipeline.replace(step('merge', mergeStep), step('merge', mergeStep) + step('again', mergeStep));
  check(missesOf(scored(elements, repeated)).join(',') === 'merge', 'a merge step repeated inside one job does not miss');

  // Node floor: an evaluation job runs the project's .nvmrc only at or above the floor.
  const floor = { id: 'floor', kind: 'node-version', scope: 'evaluation', floor: '22.20.0' };
  const job = (setup) =>
    workflow(
      `  evaluation-pr:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n${setup}${step('pr', prStep)}`,
    );
  const fileSetup = '          node-version-file: .nvmrc\n';
  check(missesOf(scored([floor], job(fileSetup), '24')).length === 0, 'an evaluation job on .nvmrc 24 misses the Node floor');
  check(
    missesOf(scored([floor], job(fileSetup), '20')).join(',') === 'floor',
    'an evaluation job on .nvmrc 20 does not miss the Node floor',
  );
  check(
    missesOf(scored([floor], job('          node-version: 20\n'), '24')).join(',') === 'floor',
    'an evaluation job on a literal Node 20 does not miss the floor',
  );
  check(
    missesOf(scored([floor], job('          node-version: 24\n'), '20')).length === 0,
    'an evaluation job on a literal Node 24 misses the Node floor',
  );
  const guarded = workflow(
    `  evaluation-pr:\n    runs-on: ubuntu-latest\n    steps:\n      - id: node-version\n        run: |\n          floor=22.20.0\n          echo "value=$floor" >> "$GITHUB_OUTPUT"\n      - uses: actions/setup-node@v4\n        with:\n          node-version: \${{ steps.node-version.outputs.value }}\n${step('pr', prStep)}`,
  );
  check(missesOf(scored([floor], guarded, '20')).length === 0, 'an evaluation job whose Node step names the floor misses it');
  // A step that names the floor and ignores it writes what it reads, and the aliases are read as what they name.
  const ignoresFloor = workflow(
    `  evaluation-pr:\n    runs-on: ubuntu-latest\n    steps:\n      - id: node-version\n        run: |\n          floor=22.20.0\n          value="$(cat .nvmrc)"\n          echo "value=$value" >> "$GITHUB_OUTPUT"\n      - uses: actions/setup-node@v4\n        with:\n          node-version: \${{ steps.node-version.outputs.value }}\n${step('pr', prStep)}`,
  );
  check(
    missesOf(scored([floor], ignoresFloor, '20')).join(',') === 'floor',
    'a Node step that names the floor and ignores it does not miss the floor on .nvmrc 20',
  );
  check(missesOf(scored([floor], ignoresFloor, '24')).length === 0, 'a Node step that reads .nvmrc misses the floor on .nvmrc 24');
  check(missesOf(scored([floor], job("          node-version: 'lts/*'\n"), '20')).length === 0, 'a literal lts/* misses the Node floor');
  check(missesOf(scored([floor], job('          node-version: node\n'), '20')).length === 0, 'a literal node misses the Node floor');
  check(
    missesOf(scored([floor], job('          node-version: lts/iron\n'), '24')).join(',') === 'floor',
    'a literal lts/iron does not miss the Node floor',
  );
  check(missesOf(scored([floor], job(fileSetup), 'lts/iron')).join(',') === 'floor', 'an .nvmrc of lts/iron does not miss the Node floor');
  const testJobOnly = workflow(
    `  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n${fileSetup}`,
  );
  check(
    missesOf(scored([floor], testJobOnly, '24')).join(',') === 'floor',
    'a pipeline with no evaluation job does not miss the Node floor',
  );
  const scoped = { id: 'tests', kind: 'node-version', scope: 'jobs-without-evaluation' };
  const both = workflow(
    `  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n${fileSetup}` +
      `  evaluation-pr:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 24\n${step('pr', prStep)}`,
  );
  check(missesOf(scored([scoped], both, '24')).length === 0, 'the test job scope misses a literal Node 24 in the evaluation job');
}

/** The sentences of the step the renderer's behavior rests on, each pinned whole and anchored at a sentence start. */
function checkStepSentences() {
  const step = readSkill(STEP) ?? '';
  const sentences = [
    [
      'detection lists tracked and untracked files',
      'List the files named `evaluation-ci-plan.json` whose parent directory is `ci` with `git ls-files --cached --others --exclude-standard`, so a plan Evaluate has just written and not yet committed is found while ignored copies are skipped.',
    ],
    [
      'detection skip list',
      'Skip `node_modules/`, `runs/` and `baseline/`, and skip a plan whose `ci/` is a symbolic link, naming it in the summary.',
    ],
    [
      'only ci-plan findings refuse a plan',
      'Refuse the plan only when a finding line concerns `ci/evaluation-ci-plan.json` (the `ci-plan` family, exit 10): report those findings verbatim and do not render that plan.',
    ],
    [
      'validation runs check through npm exec',
      'With a shell, run `npm exec --prefix <evaluations folder> -- tea-evaluate check --evaluation <evaluation folder>`.',
    ],
    [
      'job id digest on a collision',
      "When that id equals the id of a job this step did not write, or of another plan's job, append a hyphen and the first six hexadecimal characters of the SHA-256 of the plan path.",
    ],
    [
      'install of the evaluations folder',
      'Then install the evaluations folder: `npm ci --prefix <evaluations folder>` when it holds a `package-lock.json`, else `npm install --prefix <evaluations folder>`.',
    ],
    ['no root install', 'Never run the root install in this job.'],
    [
      'no plan still reaches the cleanup',
      'When no plan is found, record `evaluation plans: none`, render nothing and go to section 4, which removes the jobs of plans that no longer exist, before section 5.',
    ],
    [
      'cleanup removes the jobs of gone plans',
      'Remove a job only when its plan file is gone or the plan no longer places a check on its tier.',
    ],
    [
      'Node floor',
      "The Node version is the project's `.nvmrc` version only when it is at or above the floor the tooling declares, the lower bound of `engines.node` in the `package.json` of the installed `bmad-method-test-architecture-enterprise` package (22.20.0 when that package is not readable), and the current LTS otherwise.",
    ],
    [
      'Node alias',
      'Keep `.nvmrc` only when its value, after a leading `v` is dropped, matches `^[0-9]+(\\.[0-9]+){0,2}$` and is at or above the floor: an alias such as `lts/iron` names an older line and falls back to the current LTS.',
    ],
    [
      'the tier step',
      'Write one standalone `run:` step, `npm exec --prefix <evaluations folder> -- tea-evaluate ci --evaluation <evaluation folder> --tier <tier>`, as a `run: |` block that holds that one command.',
    ],
    ['the tier step name', 'Name it for the ids of every check the plan places on the tier, in plan order.'],
    ['a gate renders nothing', 'Render nothing for a `gate` check, which `ci` runs.'],
    [
      'merge order',
      "The job for the `merge` tier runs the `pr` tier's step first and the `merge` tier's step second, each as its own step, since a tier holds only the checks placed on it.",
    ],
    [
      'never continue-on-error',
      "Never add `continue-on-error` to a step or to the job: the runtime's exit is the verdict, and a `warn` enforcement is already exit 0 there.",
    ],
    [
      'timeouts',
      '`timeout-minutes` is 30 for the `pr` and `merge` jobs and 120 for `scheduled` and `release`, whose live checks spend model calls.',
    ],
    [
      're-render by marker path',
      'Find the jobs that carry a `# tea-evaluation-plan:` marker and match each to its plan by the path in the marker, whatever its id.',
    ],
    [
      'edit mode never writes the checkpoint',
      'Hold what section 1 finds in the conversation and never write `{outputFile}`: the checkpoint belongs to the create run.',
    ],
    [
      'success line',
      'Every plan found was validated or reported, and each valid plan is rendered with one `tea-evaluate ci` step per tier and an `if: always()` upload of its `runs/` folder',
    ],
  ];
  for (const [label, sentence] of sentences) {
    check(hasSentence(step, sentence), `${STEP} lacks the sentence for ${label}, whole and at a sentence start`);
  }
  check(
    step.includes('`.github/workflows/*.yml` and `.github/workflows/*.yaml` are `github-actions`'),
    `${STEP} lacks the .yml and .yaml platform map for edit mode`,
  );
}

/** The files that carry the step's output into summaries and validation name it, so a copy that dropped it fails. */
function checkSupportingFiles() {
  const example = readSkill('resources/ci-pipeline-progress.example.md') ?? '';
  check(
    example.includes("'step-03b-render-evaluation-plans'") && example.includes('## Step 3b: Render Evaluation Plans'),
    'the progress example does not list step-03b or carry its section',
  );
  check(
    (readSkill('checklist.md') ?? '').includes('### Step 10: Evaluation Plans'),
    'the checklist lacks its Step 10 for evaluation plans',
  );
  check(
    (readSkill('steps-v/step-01-validate.md') ?? '').includes('### 3b. Evaluation Plan Check'),
    'the validate step lacks its 3b evaluation plan check',
  );
  check(
    (readSkill('steps-c/step-04-validate-and-summary.md') ?? '').includes(
      '- Evaluation plans found by step 3b rendered, one `tea-evaluate ci` step per tier',
    ),
    'the validation step lacks its evaluation plan bullet',
  );
}

/**
 * The Node version step of the template block, run under bash for each `.nvmrc` an adopter might hold. It keeps the file only
 * when it is a plain version number at or above the floor, so an alias such as `lts/iron` (Node 20) or `lts/hydrogen`
 * (Node 18), which a version sort would rank above the floor, falls back to the LTS.
 */
function checkTemplateNodeStep() {
  const template = readSkill('github-actions-template.yaml') ?? '';
  const block = /^# evaluation-plan:begin\n([\S\s]*?)^# evaluation-plan:end$/m.exec(template)?.[1] ?? '';
  const parsed = YAML.parse(
    block
      .split('\n')
      .map((line) => line.replace(/^# ?/, ''))
      .join('\n'),
  );
  const writer = parsed?.jobs?.JOB_ID?.steps?.find((step) => step?.id === 'node-version')?.run;
  check(typeof writer === 'string', 'the template block has no Node version step to run');
  if (typeof writer !== 'string') return;
  const script = writer.replaceAll('NODE_FLOOR', '22.20.0').replaceAll('NODE_LTS', '24');
  const valueFor = (nvmrc) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-ci-render-'));
    try {
      if (nvmrc !== null) fs.writeFileSync(path.join(directory, '.nvmrc'), nvmrc);
      const output = path.join(directory, 'out');
      fs.writeFileSync(output, '');
      const ran = spawnSync('bash', ['-c', script], {
        cwd: directory,
        env: { PATH: process.env.PATH, GITHUB_OUTPUT: output },
        encoding: 'utf8',
      });
      return ran.status === 0 ? /^value=(.*)$/m.exec(fs.readFileSync(output, 'utf8'))?.[1] : `exit ${ran.status}`;
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
  for (const [nvmrc, expected] of [
    ['24\n', '24'],
    ['v22.20.0\n', '22.20.0'],
    ['22.21\n', '22.21'],
    ['20\n', '24'],
    ['22.12.0\n', '24'],
    ['22\n', '24'],
    ['lts/iron\n', '24'],
    ['lts/hydrogen\n', '24'],
    ['lts/*\n', '24'],
    ['node\n', '24'],
    [null, '24'],
  ]) {
    const got = valueFor(nvmrc);
    check(
      got === expected,
      `the template Node step writes ${JSON.stringify(got)} for .nvmrc ${JSON.stringify(nvmrc)} where ${JSON.stringify(expected)} belongs`,
    );
  }
}

/** Every regular file under a directory, as sorted paths relative to it. */
function filesUnder(root, prefix = '') {
  return fs
    .readdirSync(path.join(root, prefix), { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? filesUnder(root, `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]))
    .sort();
}

function checkManifestFixtures() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const suite = manifest.suites.find((entry) => entry.id === 'ci');
  const groundTruth = JSON.parse(fs.readFileSync(GROUND_TRUTH, 'utf8'));
  const onDisk = groundTruth.fixtureSets
    .flatMap((set) => filesUnder(path.join(FIXTURE_ROOT, set.root)).map((file) => `test/fixtures/ci-eval/${set.root}/${file}`))
    .sort();
  const declared = [...(suite?.fixtures ?? [])].sort();
  const missing = onDisk.filter((file) => !declared.includes(file));
  const extra = declared.filter((file) => !onDisk.includes(file));
  check(missing.length === 0, `the ci suite's fixtures omit ${missing.join(', ')}`);
  check(extra.length === 0, `the ci suite's fixtures list ${extra.join(', ')}, which no project root holds`);
}

/** The corpus validator refuses each malformed element it names, so a guard that stops working fails here. */
async function checkCorpusGuards() {
  const baseline = JSON.parse(fs.readFileSync(GROUND_TRUTH, 'utf8'));
  const clean = await validateCorpus(baseline);
  check(clean.problems.length === 0, `the committed corpus has problems: ${clean.problems.join('; ')}`);
  const cases = [
    [
      'standaloneStep that is not a boolean',
      'command-evaluation-ci-pr',
      { standaloneStep: 'yes' },
      'standaloneStep is declared and is not a boolean',
    ],
    ['checkIds that is empty', 'command-evaluation-ci-pr', { checkIds: [] }, 'checkIds is declared and is not a non-empty list'],
    ['checkIds without standaloneStep', 'command-evaluation-ci-pr', { standaloneStep: false }, 'needs standaloneStep'],
    ['condition that is empty', 'artifact-evaluation-runs', { condition: '' }, 'condition is declared and is not a non-empty string'],
    ['condition beside onFailureOnly', 'artifact-evaluation-runs', { onFailureOnly: true }, 'declares a condition and onFailureOnly'],
    [
      'retentionDays that is not an integer',
      'artifact-evaluation-runs',
      { retentionDays: 'many' },
      'retentionDays is declared and is not an integer',
    ],
    ['job with no marker', 'job-evaluation-pr', { marker: '' }, 'job declares no marker'],
  ];
  for (const [label, elementId, patch, expected] of cases) {
    const mutated = structuredClone(baseline);
    const element = mutated.fixtureSets.find((set) => set.id === SET_ID).expectedElements.find((entry) => entry.id === elementId);
    Object.assign(element, patch);
    const { problems } = await validateCorpus(mutated);
    check(
      problems.some((problem) => problem.includes(expected)),
      `validateCorpus does not refuse ${label} (${problems.length} problems)`,
    );
  }
}

function checkStoredCapture() {
  const cases = fs.existsSync(REPLAY_ROOT) ? fs.readdirSync(REPLAY_ROOT).filter((name) => name.startsWith('evaluation-plan-')) : [];
  check(cases.length > 0, 'test/replay/ci holds no evaluation-plan case');
  let captures = 0;
  for (const name of cases) {
    const directory = path.join(REPLAY_ROOT, name);
    const expected = JSON.parse(fs.readFileSync(path.join(directory, 'expected.json'), 'utf8'));
    check(expected.inputs?.fixtureSet === SET_ID, `${name} scores against ${expected.inputs?.fixtureSet}, expected ${SET_ID}`);
    check(fs.existsSync(path.join(directory, '.github', 'workflows', 'test.yml')), `${name} holds no stored workflow`);
    if (expected.storedOutput?.origin !== 'real-capture') continue;
    captures += 1;
    check(
      typeof expected.storedOutput.capturedBy === 'string' && expected.storedOutput.capturedBy.length > 0,
      `${name} is a real capture and does not say which run produced it`,
    );
    const stored = fs.readFileSync(path.join(directory, '.github', 'workflows', 'test.yml'));
    check(
      expected.storedOutput.sha256 === crypto.createHash('sha256').update(stored).digest('hex'),
      `${name} holds a workflow whose sha256 differs from the one recorded when the run was captured`,
    );
  }
  // The live run's workflow, kept byte for byte, is what holds the rendering. The other cases are single deviations from it.
  check(captures === 1, `test/replay/ci holds ${captures} real captures of the evaluation-plan project, expected one`);
}

async function main() {
  checkEntryPoints();
  checkTemplateBlock();
  checkNoRestatedTable();
  checkFixturePlan();
  checkStepSentences();
  checkSupportingFiles();
  checkManifestFixtures();
  checkStepNaming();
  checkPrescribedRenderings();
  checkTemplateNodeStep();
  await checkCorpusGuards();
  checkStoredCapture();

  if (failures.length > 0) {
    for (const message of failures) console.error(`${colors.red}✗${colors.reset} ${message}`);
    console.error(`${colors.red}${failures.length} of ${checks} checks failed${colors.reset}`);
    process.exit(1);
  }
  console.log(
    `${colors.green}✓${colors.reset} ${checks} checks: the evaluation plan step is reached from create, edit and resume, the template block holds its patterns, and the fixture adopter's plan is the Story 1.10 plan`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
