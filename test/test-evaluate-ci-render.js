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
 *
 * Story 1.97 adds the gate adopter: its plan names the publish job its release tier gates, its request asks in prose that the
 * publish job waits for the release checks, and its ground truth reads the wait (the `needs` list the job ends with, the events it
 * still runs on, the bytes of the rest of the job). The scorer's wait element is held here by one edit of the stored correct run each,
 * the cross-file form by the gate block of the template, and the step's sentences about gates, conflicts and the re-render by pins.
 *
 * Story 1.93 adds the projects that carry the rest of the step: the tiers adopter's plan places checks on pr, merge,
 * scheduled and release, and its ground truth is the job, tier step, event, timeout and artifact name each tier's rules give; the
 * edit adopter's pipeline carries a marker job under an id the rules no longer give and a hand-written job, and its
 * ground truth digests that job and the create run's checkpoint. The scorer's event guard reader, the corpus validator's
 * refusals of the new element fields and the stored tiers and edit cases (one real capture each, and the constructed
 * deviations that each miss exactly the elements they remove) are held here.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const YAML = require('yaml');

const { DEFAULT_TIERS, PLAN_PATH, readPlan } = require('../cli/lib/evaluate/ci-plan');
const { validateCorpus, scoreRun, guardHolds, jobBlockOf, sha256Of, withoutNeeds } = require('./eval-ci');

const ROOT = path.join(__dirname, '..');
const CANONICAL_SKILL = path.join(ROOT, 'skills', 'bmad-testarch-framework');
const SKILL = path.join(CANONICAL_SKILL, 'ci');
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
  return typeof value === 'string' && value.startsWith('{skill-root}/ci/') ? value.slice('{skill-root}/ci/'.length) : null;
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
  const skill = fs.readFileSync(path.join(CANONICAL_SKILL, 'SKILL.md'), 'utf8');
  const create = /\*\*If C:\*\* Load `\{skill-root\}\/ci\/([^`]+)`/.exec(skill)?.[1] ?? null;
  const edit = /\*\*If E:\*\* Load `\{skill-root\}\/ci\/([^`]+)`/.exec(skill)?.[1] ?? null;
  const resume = /\*\*If R:\*\* Load `\{skill-root\}\/ci\/([^`]+)`/.exec(skill)?.[1] ?? null;
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
    resumeText.includes("'step-03-configure-quality-gates'` → Load `{skill-root}/ci/steps-c/step-03b-render-evaluation-plans.md`"),
    'resume mode: a run last saved at the quality gates step skips the detection step',
  );
  check(
    resumeText.includes("'step-03b-render-evaluation-plans'` → Load `{skill-root}/ci/steps-c/step-04-validate-and-summary.md`"),
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

/** Every file under the skill, as paths relative to the skill root. The knowledge base lives in bmod-tea, not here. */
function skillFiles(directory = SKILL) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(SKILL, absolute).split(path.sep).join('/');
    if (entry.isDirectory()) return skillFiles(absolute);
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

const TIERS_SET_ID = 'evaluation-tiers-granite-router';
const EDIT_SET_ID = 'evaluation-edit-ember-ledger';
const FULL_SET_ID = 'full-meridian-storefront';
const GATE_SET_ID = 'evaluation-gate-slate-publisher';
/** The event a plan trigger starts, as the step maps it for a pipeline that lists no merge_group. */
const EVENT_OF_TRIGGER = { 'pull-request': 'pull_request', merge: 'push', schedule: 'schedule', release: 'release' };
/** The limit in minutes the step gives each tier's job. */
const TIMEOUT_OF_TIER = { pr: 30, merge: 30, scheduled: 120, release: 120 };

function groundTruthSet(setId) {
  return JSON.parse(fs.readFileSync(GROUND_TRUTH, 'utf8')).fixtureSets.find((entry) => entry.id === setId);
}

/**
 * The two fixture adopters of Story 1.93 hold their ground truth to their plans: the tiers adopter places checks on pr,
 * merge, scheduled and release, and each tier's job, tier step, timeout, event, artifact name and the merge job's pr step ahead
 * of its own are the ones the step's rules give for that plan. The edit adopter's pipeline carries a marker job under
 * an id the rules no longer give and a hand-written job, and its checkpoint is the one the create run left.
 */
function checkTierFixtures() {
  const tiers = groundTruthSet(TIERS_SET_ID);
  check(tiers !== undefined, `ground-truth.json has no fixture set ${TIERS_SET_ID}`);
  const folder = 'test/fixtures/ci-eval/evaluation-tiers/evals/router';
  const adopter = readPlan(path.join(ROOT, folder));
  check(
    adopter.plan !== undefined && adopter.findings.length === 0,
    `the tiers adopter's plan breaks the runtime schema: ${JSON.stringify(adopter.findings)}`,
  );
  if (tiers !== undefined && adopter.plan !== undefined) {
    const placed = ['pr', 'merge', 'scheduled', 'release'].filter((tier) => checkIdsOf(adopter.plan, tier).length > 0);
    check(
      placed.join(',') === 'pr,merge,scheduled,release',
      `the tiers adopter's plan places checks on ${placed.join(', ')}, expected pr, merge, scheduled and release`,
    );
    const element = (id) => tiers.expectedElements.find((entry) => entry.id === id);
    const command = (tier) => `npm exec --prefix evals -- tea-evaluate ci --evaluation evals/router --tier ${tier}`;
    const marker = `# tea-evaluation-plan: evals/router/${PLAN_PATH}`;
    for (const tier of placed) {
      const step = element(`command-evaluation-ci-${tier}`);
      check(
        step?.command === command(tier) &&
          step?.standaloneStep === true &&
          JSON.stringify(step?.checkIds) === JSON.stringify(checkIdsOf(adopter.plan, tier)),
        `the ground truth's ${tier} tier step is ${JSON.stringify(step)}, expected ${command(tier)} named for ${checkIdsOf(adopter.plan, tier).join(', ')}`,
      );
      const events = [
        ...new Set(
          adopter.plan.checks
            .filter((entry) => entry.placement.tier === tier)
            .flatMap((entry) => entry.trigger.map((trigger) => EVENT_OF_TRIGGER[trigger])),
        ),
      ];
      const job = element(`job-evaluation-${tier}`);
      check(
        job?.jobId === `evaluation-${tier}` &&
          job?.command === command(tier) &&
          job?.marker === marker &&
          job?.timeoutMinutes === TIMEOUT_OF_TIER[tier] &&
          JSON.stringify(job?.runsOn) === JSON.stringify(events),
        `the ground truth's evaluation-${tier} job is ${JSON.stringify(job)}, expected ${command(tier)} under ${marker}, ${TIMEOUT_OF_TIER[tier]} minutes, on ${events.join(', ')}`,
      );
      const upload = element(`artifact-evaluation-runs-${tier}`);
      check(
        upload?.jobId === `evaluation-${tier}` &&
          upload?.name === `evaluation-${tier}-runs` &&
          upload?.pathToken === 'evals/router/runs/' &&
          upload?.condition === 'always()',
        `the ground truth's ${tier} upload is ${JSON.stringify(upload)}, expected evals/router/runs/ under always() named evaluation-${tier}-runs in job evaluation-${tier}`,
      );
    }
    check(
      element('job-evaluation-merge')?.after === command('pr'),
      "the ground truth does not put the pr step ahead of the merge job's own",
    );
    const names = tiers.expectedElements.filter((entry) => entry.kind === 'artifact').map((entry) => entry.name);
    check(new Set(names).size === names.length, `the ground truth names two uploads alike: ${names.join(', ')}`);
    const guard = element('guard-unit-tests');
    check(
      guard?.command === 'npm test' && JSON.stringify(guard?.runsOn) === JSON.stringify(['pull_request', 'push']),
      `the ground truth limits the test job to ${JSON.stringify(guard?.runsOn)}, expected pull_request and push, the events it ran on before the plan's tiers added schedule and release`,
    );
    const release = element('trigger-release-published');
    check(
      release?.event === 'release' && JSON.stringify(release?.types) === JSON.stringify(['published']),
      'the ground truth does not map the release tier to release of type published',
    );
    check(
      element('trigger-push-main')?.event === 'push' && element('trigger-weekly-schedule')?.event === 'schedule',
      'the ground truth lacks the push and schedule triggers the merge and scheduled tiers map to',
    );
    check(tiers.requireEveryElement === true, 'the tiers adopter is not held to every one of its elements');
    check(
      tiers.projectFiles.includes(`evals/router/${PLAN_PATH}`) && tiers.projectFiles.includes('evals/package.json'),
      'the tiers adopter does not declare its plan and its evaluations folder manifest',
    );
    const request = fs.readFileSync(path.join(FIXTURE_ROOT, 'evaluation-tiers', 'docs', 'ci-requirements.md'), 'utf8');
    check(!/evaluation-ci-plan|ci\/|plan/i.test(request), "the tiers adopter's request names the plan");
  }

  const edit = groundTruthSet(EDIT_SET_ID);
  check(edit !== undefined, `ground-truth.json has no fixture set ${EDIT_SET_ID}`);
  const editFolder = 'test/fixtures/ci-eval/evaluation-edit/evals/ledger';
  const editPlan = readPlan(path.join(ROOT, editFolder));
  check(
    editPlan.plan !== undefined && editPlan.findings.length === 0,
    `the edit adopter's plan breaks the runtime schema: ${JSON.stringify(editPlan.findings)}`,
  );
  if (edit !== undefined && editPlan.plan !== undefined) {
    const prIds = checkIdsOf(editPlan.plan, 'pr');
    check(
      prIds.length === editPlan.plan.checks.length && prIds.length >= 3,
      "the edit adopter's plan places checks off pr, or fewer than the stale job's step names and two more",
    );
    const step = edit.expectedElements.find((entry) => entry.id === 'command-evaluation-ci-pr');
    check(
      JSON.stringify(step?.checkIds) === JSON.stringify(prIds),
      `the edit adopter's tier step names ${JSON.stringify(step?.checkIds)}, expected ${prIds.join(', ')}`,
    );
    const pipeline = fs.readFileSync(path.join(FIXTURE_ROOT, 'evaluation-edit', '.github', 'workflows', 'test.yml'), 'utf8');
    const marker = `# tea-evaluation-plan: evals/ledger/${PLAN_PATH}`;
    const staleId = /^ {2}(\S+):\n {4}# tea-evaluation-plan:/m.exec(pipeline)?.[1];
    check(
      staleId !== undefined && staleId !== 'evaluation-pr',
      `the edit adopter's pipeline carries its marker job under ${staleId}, which must differ from the id the rules give now (evaluation-pr)`,
    );
    check(pipeline.split(marker).length === 2, "the edit adopter's pipeline must carry the marker on exactly one job");
    const staleName = /name: "([^"]*)"\n {8}run: \|\n {10}npm exec/.exec(pipeline)?.[1] ?? '';
    check(
      staleName.length > 0 && prIds.some((id) => !staleName.includes(id)),
      "the stale job's step is already named for every pr check, so the edit has nothing to replace",
    );
    check(
      jobBlockOf(pipeline, 'test') !== null &&
        sha256Of(jobBlockOf(pipeline, 'test')) === edit.expectedElements.find((entry) => entry.kind === 'preserved')?.sha256,
      'the hand-written job is not the one the ground truth digests',
    );
    check(
      edit.mode === 'edit' && edit.editTarget === '.github/workflows/test.yml',
      'the edit adopter is not an edit set over the pipeline',
    );
  }
}

/**
 * A job that waits for a job its event skips is skipped with it, and a guard on a job that existed before an event is read
 * for the command it runs, so both are scored through the stored tiers capture with one edit each.
 */
function checkNeedsAndExistingJobGuards() {
  const set = groundTruthSet(TIERS_SET_ID);
  const captureFile = path.join(REPLAY_ROOT, 'evaluation-tiers-live-capture', '.github', 'workflows', 'test.yml');
  check(fs.existsSync(captureFile), 'the stored tiers capture is gone, so the needs and guard cases cannot run');
  if (!fs.existsSync(captureFile)) return;
  const capture = fs.readFileSync(captureFile, 'utf8');
  const missesOf = (text) =>
    scoreRun(set, text, { findings: [] })
      .elements.filter((element) => !element.present)
      .map((element) => element.id);
  check(missesOf(capture).length === 0, `the stored tiers capture misses ${missesOf(capture).join(', ')}`);
  const waiting = capture.replace('  evaluation-merge:\n', '  evaluation-merge:\n    needs: evaluation-pr\n');
  check(waiting !== capture, 'the tiers capture has no evaluation-merge job to make wait');
  check(
    missesOf(waiting).join(',') === 'job-evaluation-merge',
    `a merge job that needs the pr job (skipped on push) misses ${missesOf(waiting).join(', ') || 'nothing'} where only the merge job element belongs`,
  );
  const created = capture.replace('    types: [published]\n', '    types: [created]\n');
  check(created !== capture, 'the tiers capture has no release type to change');
  check(
    missesOf(created).join(',') === 'trigger-release-published',
    `a release trigger of type created misses ${missesOf(created).join(', ') || 'nothing'} where only the release trigger element belongs`,
  );
  // The merge job's own step ahead of the pr step runs the tiers in the wrong order.
  const prStep =
    '      - name: "check, compile, seal, replay"\n        run: |\n          npm exec --prefix evals -- tea-evaluate ci --evaluation evals/router --tier pr\n\n';
  const mergeStep =
    '      - name: "preflight-live"\n        run: |\n          npm exec --prefix evals -- tea-evaluate ci --evaluation evals/router --tier merge\n\n';
  const swapped = capture.replace(`${prStep}${mergeStep}`, `${mergeStep}${prStep}`);
  check(swapped !== capture, 'the tiers capture has no pr step ahead of the merge step to swap');
  check(
    missesOf(swapped).join(',') === 'job-evaluation-merge',
    `a merge job that runs its own step ahead of the pr step misses ${missesOf(swapped).join(', ') || 'nothing'} where only the merge job element belongs`,
  );
  // A tier's job runs its own tier's step and no other tier's: the pr job carrying the scheduled step runs live checks on every pull request.
  const scheduledStep =
    '      - name: "twin-run, held-out"\n        run: |\n          npm exec --prefix evals -- tea-evaluate ci --evaluation evals/router --tier scheduled\n\n';
  const carrying = capture.replace(prStep, `${prStep}${scheduledStep}`);
  check(carrying !== capture, 'the tiers capture has no pr step to follow with the scheduled step');
  check(
    missesOf(carrying).join(',') === 'job-evaluation-pr',
    `a pr job that also runs the scheduled step misses ${missesOf(carrying).join(', ') || 'nothing'} where only the pr job element belongs`,
  );
  // The scheduled job's guard names the cron the workflow declares, so it is read per cron the event fired for.
  const cron = (value) => capture.replace("    if: github.event_name == 'schedule'\n", `    if: github.event.schedule == '${value}'\n`);
  check(cron('0 3 * * 0') !== capture, 'the tiers capture has no scheduled job guard to name a cron');
  check(
    missesOf(cron('0 3 * * 0')).length === 0,
    `a scheduled job guarded by the declared cron misses ${missesOf(cron('0 3 * * 0')).join(', ')}`,
  );
  check(
    missesOf(cron('0 4 * * 0')).join(',') === 'job-evaluation-scheduled',
    `a scheduled job guarded by another cron misses ${missesOf(cron('0 4 * * 0')).join(', ') || 'nothing'} where only the scheduled job element belongs`,
  );
  const everyEvent = capture.replace(
    "    if: github.event_name == 'pull_request' || github.event_name == 'push'\n",
    "    if: github.event_name != 'release'\n",
  );
  check(everyEvent !== capture, 'the tiers capture has no test job to guard');
  check(
    missesOf(everyEvent).join(',') === 'guard-unit-tests',
    `a test job that still runs on schedule misses ${missesOf(everyEvent).join(', ') || 'nothing'} where only the guard element belongs`,
  );
}

/** The event guards the scorer reads, and the ones it refuses to guess at. */
function checkEventGuards() {
  const cases = [
    [undefined, 'push', true],
    ["github.event_name == 'push'", 'push', true],
    ["github.event_name == 'push'", 'schedule', false],
    ["${{ github.event_name != 'schedule' }}", 'pull_request', true],
    ["${{ github.event_name != 'schedule' }}", 'schedule', false],
    ["github.event_name == 'push' && github.ref == 'refs/heads/main'", 'push', true],
    ["github.event_name == 'pull_request' || github.event_name == 'push'", 'schedule', false],
    ["!(github.event_name == 'schedule')", 'push', true],
    ["github.event_name == 'pull_request' && github.ref == 'refs/heads/main'", 'pull_request', false],
    ['contains(fromJSON(\'["push"]\'), github.event_name)', 'push', null],
    ["github.event_name == 'push' && (function () { return true; })()", 'push', null],
    ["github.event_name == 'push' && process.exit(1)", 'push', null],
    ["github.event_name == 'PUSH'", 'push', true],
    ["startsWith(github.ref, 'refs/tags/')", 'release', true],
    ["startsWith(github.ref, 'refs/tags/')", 'push', false],
    ['startsWith(github.ref, github.ref)', 'push', null],
    ["github.event.schedule == '0 3 * * 0'", 'schedule', true, '0 3 * * 0'],
    ["github.event.schedule == '0 3 * * 0'", 'schedule', false, '0 4 * * 0'],
  ];
  for (const [condition, event, expected, cron] of cases) {
    check(
      guardHolds(condition, event, cron) === expected,
      `the guard ${JSON.stringify(condition)} on ${event} reads ${guardHolds(condition, event, cron)}, expected ${expected}`,
    );
  }
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
      'a re-render renames the job to the id the rules give now',
      'Rewrite the job under the id item 1 gives now: rename it, give its artifact the name item 1 derives from the new id, and keep no job under the old id, so a renamed or newly shared id never leaves two jobs.',
    ],
    [
      'the id a job carries can differ from the id the rules give now',
      "For each job whose plan still places checks on its tier, work out the id item 1 gives that plan and tier now. It can differ from the id the job carries: a job written while the repository held several plans carries the plan's folder, and with one plan left item 1 gives `evaluation-<tier>`.",
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
  // The events of the tiers that name no trigger of their own come from the repository (Story 2.4, round 1).
  for (const [label, clause] of [
    [
      'merge is merge_group when the pipeline lists it',
      '`merge` is `merge_group` when the pipeline already lists it and `push` to the default branch otherwise',
    ],
    [
      'release is the event of the repository release or deploy workflow',
      "`release` is the event the repository's existing release or deploy workflow starts on, read from its workflows (a `push` of a tag pattern, `release` of type `published`, or the deploy workflow's own trigger)",
    ],
    ['pull-request is pull_request', '`pull-request` is `pull_request`'],
    ['manual-dispatch is workflow_dispatch', '`manual-dispatch` is `workflow_dispatch`'],
    [
      'jobs are limited by an event guard',
      "Limit the evaluation job with an `if:` on the event when the workflow carries more events than the tier's checks name.",
    ],
    [
      'new events and widened filters guard the earlier jobs',
      'give each job that existed before an `if:` limiting it to the events and filters it already ran on',
    ],
    [
      'tiers that share an event are told apart',
      "When two tiers' triggers resolve to the same GitHub event, limit each job with a guard that tells them apart",
    ],
    ['a branch push is told apart by its ref', "`github.ref == 'refs/heads/<default branch>'` for a branch push"],
    ['a tag push is told apart by its ref', "`startsWith(github.ref, 'refs/tags/')` (or the tag pattern) for a tag push"],
    ['a cron is told apart by its schedule', "`github.event.schedule == '<its cron>'` for each cron"],
    [
      'a tier left with no event is named and never guarded out of every event',
      "When a tier's only resolved event is one that another tier took, name that tier in the summary as wired to no event of its own, and render no guard that excludes a tier from every event: its evaluation job runs on the event the other tier took, and a job it gates (item 10) waits for it there, since `gates` names a job and creates no event.",
    ],
    [
      'every tier that names manual-dispatch takes workflow_dispatch',
      'give `workflow_dispatch` to every tier whose `trigger` names it and guard the tiers that do not name it out of it',
    ],
    ['release falls back to a published release', 'and `release` of type `published` when they name none'],
  ])
    check(step.includes(clause), `${STEP} lacks the trigger clause for ${label}`);
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
    (readSkill('steps-c/step-04-validate-and-summary.md') ?? '').includes(
      'Evaluation plans rendered, refused or not validated, the jobs they gate, and the credentials their live tiers need',
    ),
    'the summary step does not report the jobs the plans gate',
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
    [
      'contractPattern that is empty',
      'command-evaluation-install',
      { contractPattern: '' },
      'contractPattern is declared and is not a non-empty string',
    ],
    [
      'contractPattern with no contractToken',
      'command-evaluation-install',
      { contractToken: null, contractPattern: '^npm install --prefix evals$' },
      'declares a contractPattern and no contractToken',
    ],
    [
      'contractPattern that is not anchored at its start',
      'command-evaluation-install',
      { contractPattern: String.raw`[\s\S]*npm install --prefix ['"]?evals['"]?[\s\S]*$` },
      'contractPattern is not anchored',
    ],
    [
      'contractPattern that is not anchored at its end',
      'command-evaluation-install',
      { contractPattern: String.raw`^[\s\S]*npm install --prefix ['"]?evals['"]?` },
      'contractPattern is not anchored',
    ],
    [
      'contractPattern with an alternation at the top level',
      'command-evaluation-install',
      { contractPattern: String.raw`^npm ci$|^[\s\S]*npm install --prefix evals[\s\S]*$` },
      'contractPattern is not anchored',
    ],
    [
      'contractPattern whose final dollar is escaped',
      'command-evaluation-install',
      { contractPattern: String.raw`^[\s\S]*npm install --prefix evals\$` },
      'contractPattern is not anchored',
    ],
    [
      'contractPattern that is not a regular expression',
      'command-evaluation-install',
      { contractPattern: '^(npm install$' },
      'is not a regular expression',
    ],
    [
      'contractPattern that does not match its contractToken',
      'command-evaluation-install',
      { contractPattern: String.raw`^[\s\S]*npm ci[\s\S]*$` },
      'does not match its own contractToken',
    ],
    [
      "contractPattern that does not match the element's command",
      'command-evaluation-ci-pr',
      { contractPattern: '^tea-evaluate ci --evaluation evals/grader --tier pr$' },
      'does not match the command',
    ],
    [
      'contractPattern of a gate that does not match its contractToken',
      'gate-burn-in',
      { contractToken: 'burn-out:' },
      'does not match its own contractToken',
      FULL_SET_ID,
    ],
    [
      'contractPattern of a gate that is not anchored',
      'gate-burn-in',
      { contractPattern: String.raw`^[\s\S]*burn-in:` },
      'contractPattern is not anchored',
      FULL_SET_ID,
    ],
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
    ['job whose after is empty', 'job-evaluation-merge', { after: '' }, 'after is declared and is not a non-empty command', TIERS_SET_ID],
    ['job whose runsOn is empty', 'job-evaluation-pr', { runsOn: [] }, 'runsOn is declared and is not a non-empty list', TIERS_SET_ID],
    [
      'job whose timeout is not a number',
      'job-evaluation-pr',
      { timeoutMinutes: '30' },
      'timeoutMinutes is declared and is not a positive integer',
      TIERS_SET_ID,
    ],
    [
      'trigger whose types is not a list',
      'trigger-release-published',
      { types: 'published' },
      'types is declared and is not a non-empty list of event types',
      TIERS_SET_ID,
    ],
    [
      'command whose runsOn is empty',
      'guard-unit-tests',
      { runsOn: [] },
      'runsOn is declared and is not a non-empty list of events',
      TIERS_SET_ID,
    ],
    [
      'job whose marker count is zero',
      'job-evaluation-pr',
      { markerJobs: 0 },
      'markerJobs is declared and is not a positive integer',
      EDIT_SET_ID,
    ],
    [
      'artifact whose name is empty',
      'artifact-evaluation-runs-pr',
      { name: '' },
      'name is declared and is not a non-empty string',
      TIERS_SET_ID,
    ],
    [
      'artifact whose job is empty',
      'artifact-evaluation-runs-pr',
      { jobId: '' },
      'jobId is declared and is not a non-empty string',
      TIERS_SET_ID,
    ],
    ["preserved job whose digest is not the staged job's", 'preserved-job-test', { sha256: '0'.repeat(64) }, 'digests to', EDIT_SET_ID],
    ['preserved job the pipeline does not hold', 'preserved-job-test', { jobId: 'absent' }, 'carries no job absent', EDIT_SET_ID],
    ["checkpoint whose digest is not the staged file's", 'checkpoint-untouched', { sha256: '0'.repeat(64) }, 'digests to', EDIT_SET_ID],
    [
      'checkpoint that names no project file',
      'checkpoint-untouched',
      { file: 'test-artifacts/other.md' },
      'not a declared project file',
      EDIT_SET_ID,
    ],
  ];
  for (const [label, elementId, patch, expected, setId = SET_ID] of cases) {
    const mutated = structuredClone(baseline);
    const element = mutated.fixtureSets.find((set) => set.id === setId).expectedElements.find((entry) => entry.id === elementId);
    Object.assign(element, patch);
    const { problems } = await validateCorpus(mutated);
    check(
      problems.some((problem) => problem.includes(expected)),
      `validateCorpus does not refuse ${label} (${problems.length} problems)`,
    );
  }
  // A gate's command is the one its job loops, which the pattern of the gate does not state, so the match with the command binds a command element only.
  const gate = structuredClone(baseline);
  gate.fixtureSets.find((set) => set.id === FULL_SET_ID).expectedElements.find((entry) => entry.id === 'gate-burn-in').command =
    'npm run test:e2e -- --repeat-each=10';
  const gateProblems = (await validateCorpus(gate)).problems;
  check(
    !gateProblems.some((problem) => problem.includes('does not match the command')),
    `validateCorpus holds the contractPattern of a gate to its command: ${gateProblems.join('; ')}`,
  );
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

/** The corpus validator refuses an edit set that leaves out what its edit must keep, and a mode it does not know. */
async function checkEditSetGuards() {
  const baseline = JSON.parse(fs.readFileSync(GROUND_TRUTH, 'utf8'));
  const cases = [
    [
      'an edit set with no preserved element',
      (set) =>
        set.expectedElements.splice(
          set.expectedElements.findIndex((entry) => entry.kind === 'preserved'),
          1,
        ),
      'declares no preserved element',
    ],
    [
      'an edit set with no checkpoint element',
      (set) =>
        set.expectedElements.splice(
          set.expectedElements.findIndex((entry) => entry.kind === 'checkpoint'),
          1,
        ),
      'declares no checkpoint element',
    ],
    ['an edit set with no edit target', (set) => delete set.editTarget, 'names editTarget'],
    ['a mode that is neither create nor edit', (set) => (set.mode = 'repair'), 'is not one of [create, edit]'],
  ];
  for (const [label, mutate, expected] of cases) {
    const mutated = structuredClone(baseline);
    mutate(mutated.fixtureSets.find((set) => set.id === EDIT_SET_ID));
    const { problems } = await validateCorpus(mutated);
    check(
      problems.some((problem) => problem.includes(expected)),
      `validateCorpus does not refuse ${label} (${problems.length} problems)`,
    );
  }
  const mutated = structuredClone(baseline);
  mutated.fixtureSets.find((set) => set.id === TIERS_SET_ID).editTarget = '.github/workflows/test.yml';
  const { problems } = await validateCorpus(mutated);
  check(
    problems.some((problem) => problem.includes('not an edit set')),
    'validateCorpus does not refuse an editTarget on a create set',
  );
}

/**
 * The stored cases of the tiers and edit projects: one real capture each with its recorded sha256, the three constructed
 * deviations the story names, each missing exactly the element it removes, and the edit cases holding the checkpoint
 * the run left.
 */
function checkTierAndEditCases() {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(REPLAY_ROOT, name, 'expected.json'), 'utf8'));
  const missesOf = (name) =>
    Object.entries(read(name).result.elements)
      .filter(([, present]) => !present)
      .map(([id]) => id);
  for (const [prefix, setId] of [
    ['evaluation-tiers-', TIERS_SET_ID],
    ['evaluation-edit-', EDIT_SET_ID],
  ]) {
    const names = fs.readdirSync(REPLAY_ROOT).filter((name) => name.startsWith(prefix));
    let captures = 0;
    for (const name of names) {
      const directory = path.join(REPLAY_ROOT, name);
      const expected = read(name);
      check(expected.inputs?.fixtureSet === setId, `${name} scores against ${expected.inputs?.fixtureSet}, expected ${setId}`);
      check(fs.existsSync(path.join(directory, '.github', 'workflows', 'test.yml')), `${name} holds no stored workflow`);
      if (setId === EDIT_SET_ID) {
        check(
          fs.existsSync(path.join(directory, 'test-artifacts', 'ci', 'ci-pipeline-progress.md')),
          `${name} holds no checkpoint, which the edit set scores`,
        );
      }
      if (expected.storedOutput?.origin !== 'real-capture') continue;
      captures += 1;
      const stored = fs.readFileSync(path.join(directory, '.github', 'workflows', 'test.yml'));
      check(
        typeof expected.storedOutput.capturedBy === 'string' && expected.storedOutput.capturedBy.length > 0,
        `${name} is a real capture and does not say which run produced it`,
      );
      check(
        expected.storedOutput.sha256 === crypto.createHash('sha256').update(stored).digest('hex'),
        `${name} holds a workflow whose sha256 differs from the one recorded when the run was captured`,
      );
      check(missesOf(name).length === 0, `${name} is the real capture and misses ${missesOf(name).join(', ')}`);
    }
    check(captures === 1, `test/replay/ci holds ${captures} real captures of ${setId}, expected one`);
  }
  // Each constructed deviation misses exactly the elements it removes.
  const exact = {
    'evaluation-tiers-merge-without-pr-step': ['job-evaluation-merge'],
    'evaluation-tiers-shared-artifact-name': ['artifact-evaluation-runs-merge'],
    'evaluation-tiers-scheduled-under-pr-timeout': ['job-evaluation-scheduled'],
    'evaluation-tiers-pr-job-unguarded': ['job-evaluation-pr'],
    'evaluation-tiers-artifact-names-swapped': ['artifact-evaluation-runs-merge', 'artifact-evaluation-runs-pr'],
    'evaluation-tiers-test-job-unguarded': ['guard-unit-tests'],
    'evaluation-edit-test-job-reformatted': ['preserved-job-test'],
    'evaluation-edit-checkpoint-rewritten': ['checkpoint-untouched'],
    'evaluation-edit-stale-job-kept': ['command-evaluation-ci-pr', 'job-evaluation-pr'],
    'evaluation-edit-stale-job-kept-unmarked': ['command-evaluation-ci-pr', 'job-evaluation-pr'],
    'evaluation-edit-marker-job-emptied': ['job-evaluation-pr'],
    'evaluation-edit-job-id-kept': ['artifact-evaluation-runs', 'job-evaluation-pr'],
  };
  for (const [name, expectedMisses] of Object.entries(exact)) {
    check(fs.existsSync(path.join(REPLAY_ROOT, name)), `test/replay/ci holds no case ${name}`);
    if (!fs.existsSync(path.join(REPLAY_ROOT, name))) continue;
    check(
      missesOf(name).sort().join(',') === expectedMisses.join(','),
      `${name} misses ${missesOf(name).join(', ') || 'nothing'}, expected ${expectedMisses.join(', ')}`,
    );
  }
}

/** Whether a line of `text`, with its list marker removed, is `sentence` whole. */
function hasLineText(text, sentence) {
  return String(text ?? '')
    .split('\n')
    .some((line) => line.trim().replace(/^(?:[-*] |\d+\. )/, '') === sentence.replace(/^(?:[-*] |\d+\. )/, ''));
}

/** The sentences of the step that resolve, render, restore and report the gates, each pinned whole on a line of its own. */
function checkGateSentences() {
  const step = readSkill(STEP) ?? '';
  const sentences = [
    ['gates resolve after validation', 'Then resolve the gates of every plan that was not refused.'],
    [
      'a tier gates the union of the lists',
      'A tier gates the union of the `gates` lists over the checks the plan places on it, each name once.',
    ],
    [
      'a name matches one job in one file',
      'A name matches a job when exactly one workflow file of the repository holds a job with that id (for GitHub Actions, the pipeline file this step writes and the other files in `.github/workflows/`).',
    ],
    [
      'a name that matches no job',
      'A name that no file holds, that several files hold, or that is the id of a job this step wrote (one that carries the `# tea-evaluation-plan:` marker) matches no job.',
    ],
    ['a conflict is a wait that cannot hold', 'A gate conflicts when its wait cannot hold, and each conflict below refuses the plan.'],
    [
      'a skipped evaluation job skips the gated job',
      "Inside the pipeline file, a job that needs a skipped job is skipped, so a gate conflicts when the gated job already ran in a run where its tier's evaluation job is skipped.",
    ],
    [
      'events and guards are compared',
      "Compare the events and the branch, tag and cron filters the gated job ran on as its file held them before this render (its workflow's `on:` and its own `if:`) with the events and guards the evaluation job of each tier that gates it runs on, using the ref or cron guards item 7 gives it.",
    ],
    [
      'a run the render adds is no conflict',
      'A run this render adds, such as a merge tier widening `on.push` to `branches: [main]` or a new cron, is skipped through the wait and is no conflict.',
    ],
    [
      'a deploy that already ran on every push beside a tag-guarded evaluation job conflicts',
      'A deploy that already ran on every `push` beside a release evaluation job guarded to tags conflicts.',
    ],
    [
      'an evaluation job running on a run the gated job did not have conflicts',
      "It also conflicts when the tier's evaluation job runs on a run the gated job did not run on before this render, such as a `workflow_dispatch` the render adds to a tag-push release file, since an in-file gated job carries no guard of its own and would run there.",
    ],
    [
      'a gated job that already ran on a dispatch gains no run, and a file without dispatch conflicts',
      'A gated job that already ran on `workflow_dispatch`, as a nightly deploy file does, gains no run when the evaluation job runs on a dispatch, and a deploy file that did not start on `workflow_dispatch` before the render conflicts when the plan names `manual-dispatch` on the gating tier.',
    ],
    [
      'a job gated by another plan through the other form conflicts',
      'It conflicts when the job already waits for an evaluation job of another plan through the other form of item 10.',
    ],
    [
      'a status function in the if conflicts',
      "It conflicts, in either form, when the job's `if:` calls a status function other than `success()` (`always()`, `!cancelled()` or `failure()`), since the job would run after the evaluation job failed.",
    ],
    [
      'a cross-file wait for a pull request or fork tier conflicts',
      "Across files the wait is `workflow_run`, and it conflicts when the tier's GitHub event is `pull_request`, `pull_request_target` or another event that runs code of a fork, since the job would check out the fork's commit with the repository's secrets.",
    ],
    [
      'a cross-file wait behind a ref or cron guard conflicts',
      "It conflicts when the tier's evaluation job carries a ref or cron guard beyond its event, since `github.event.workflow_run.event` cannot tell a tag push from a branch push or one cron from another, and a skipped evaluation job still lets the run conclude `success`.",
    ],
    [
      'a file that follows another workflow, or a job gated twice, conflicts',
      'It conflicts when the gated file already has a `workflow_run` trigger that lists a workflow other than the pipeline file, or when the job is gated by another plan or by a second tier, since two `if:` lines cannot be combined.',
    ],
    [
      'a cross-file job with needs, uses, an if or changing contexts conflicts',
      'It conflicts when the gated job has `needs` (its sibling is skipped on the `workflow_run` event and the job never runs again), is a `uses:` reusable-workflow job (it has no checkout step to carry the `ref`), has an `if:` of its own other than the one this step wrote, or reads `github.ref`, `github.ref_name`, `github.sha`, `github.head_ref` or `github.event.*` outside the wait this step wrote, since those contexts change under `workflow_run`.',
    ],
    [
      'a missing name or a conflict refuses the plan',
      'Refuse a plan with a name that matches no job or with a conflicting gate: report each in the summary, render nothing from that plan, and treat the jobs of its earlier run as section 4 treats a refused plan.',
    ],
    ['other plans still render', 'Other plans still render.'],
    [
      'widened filters guard the jobs that existed before',
      'When an event is new to the workflow, or an event the workflow already has gains a branch filter, a tag pattern or a cron, give each job that existed before an `if:` limiting it to the events and filters it already ran on, and name the guard in the summary.',
    ],
    [
      'an in-file gated job is exempt from the pre-existing job guard',
      'An in-file gated job (item 10) is exempt from that guard, since its `needs` on the evaluation job keeps it off the runs this render adds, which holds because section 2 refuses a gate whose evaluation job runs on one of them.',
    ],
    ['the wait is item 10', '10. **Gates.**'],
    [
      'the wait follows where the gated job lives',
      "For each job the tier gates (section 2), make the job wait for the tier's evaluation job, by where the gated job lives.",
    ],
    [
      'inside one file the wait is needs, appended',
      "In the pipeline file this step writes, the wait is `needs`: append the evaluation job's id to the gated job's `needs`, keep the entries already there in their order (a `needs` that is one string becomes a list), and leave the job's `if:` and every other key as they are, so the job's own event handling stays as it was.",
    ],
    [
      'across files the wait is workflow_run, an if with the path and a ref',
      "In another workflow file the wait is a `workflow_run` trigger, since a job waits only for jobs of its own workflow run and `needs` cannot reach the evaluation job: add to that file's `on:`, keeping the triggers already there, `workflow_run` with `workflows` naming the pipeline file this step writes (its `name:`, or its file path when it has none) and `types: [completed]`, give the job `if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == '<the GitHub event of the tier>' && github.event.workflow_run.path == '<the pipeline file path>'`, and set `ref: ${{ github.event.workflow_run.head_sha }}` on the job's `actions/checkout` steps, as the gate block of `{skill-root}/ci/github-actions-template.yaml` shows between its `evaluation-gate:begin` and `evaluation-gate:end` markers.",
    ],
    [
      'a cross-file job is limited to the pipeline, the event and the evaluated commit',
      "A completed workflow run triggers the job whatever workflow and event started it, and a `workflow_run` job checks out the default branch, so the three checks limit the job to a successful run of the pipeline file on the tier's event and the `ref` builds the commit the evaluation ran on.",
    ],
    ['the cross-file job starts only from that completion', 'That job then starts only from that completion, and the summary says so.'],
    [
      'the other jobs of the gated workflow are guarded, a gated job is not',
      'Give each other job of that file, except a job this item gates, an `if:` limiting it to the events it already ran on, as item 7 does for a pipeline that gains an event.',
    ],
    [
      'the edit is reported and nothing else of the job changes',
      'Report each edit in the summary with the job, its file and the evaluation job it waits for, and change nothing else of the job.',
    ],
    ['a re-render restores the wait under the current id', '- Restore each wait with its job.'],
    [
      'the restore rewrites the needs entry',
      "For a job the plan's tier gates, write the wait under the id item 1 gives now: replace the `needs` entry that names a job the marker carried, under the id it carried then, with the current id, so a renamed evaluation job leaves neither two entries nor a dangling one, and add the wait where it is absent.",
    ],
    [
      'a wait goes with its plan entry or its evaluation job',
      '- Remove a wait when the plan no longer names the job on that tier, and remove the waits on an evaluation job when that job is removed.',
    ],
    [
      'the needs entry goes with its key when alone',
      'The `needs` entry goes, the key with it when it was the only entry, and a list left with one entry is written as that entry.',
    ],
    [
      'across files the trigger and guards stay while another wait uses them',
      "Across files the `if:` and the checkout `ref:` go with the wait, and the `workflow_run` trigger and the guards on the workflow's other jobs go only when no other wait in that file still uses them.",
    ],
    [
      'the gated job is as it was',
      'The gated job then carries what it carried before the first render, a one-entry `needs` list reading as its entry.',
    ],
    [
      'the limits name the one wait',
      "- Limits: change no job this step did not write, except the event guards of section 3 item 7 and the wait of section 3 item 10, which changes that one job's `needs` in the pipeline file, or across files that job's `if:` and checkout `ref:`, its workflow's `workflow_run` trigger and the event guards of that workflow's other jobs, and nothing else",
    ],
    ['a gate creates no job, event or check', '- 🚫 A `gates` entry names a job to wait for and creates no job, event or check'],
    [
      'success names the gated jobs',
      "- Every job a tier gates waits for the tier's evaluation job, or the plan is refused with the name or the conflict reported",
    ],
    [
      'failure names a gated job changed beyond the wait',
      "- A gated job changed beyond the wait of section 3 item 10 (its `needs` in the pipeline file; across files its `if:` and checkout `ref:`, its workflow's `workflow_run` trigger and the guards of that workflow's other jobs), or a wait written for a plan that was refused",
    ],
    [
      'other platforms get the wait in their idiom',
      "Other platforms get the same structure in their own idiom: a job or stage per tier, one step per tier, the evidence kept whatever the result, and the wait of item 10 as the platform's own dependency between jobs, or between pipelines when the gated job lives in another file.",
    ],
    [
      'the summary of the create run names the jobs gated',
      'the plans found, the jobs written, the jobs gated, the plans refused or not validated, and the credentials the live tiers need.',
    ],
  ];
  for (const [label, sentence] of sentences) {
    check(
      label.startsWith('the summary of the create run') ? step.includes(sentence) : hasLineText(step, sentence),
      `${STEP} lacks the sentence for ${label}, whole and on a line of its own`,
    );
  }
  // The retired phrase named a story the step no longer waits for.
  check(!step.includes('until the gating of Story 1.97'), `${STEP} still waits for the gating of Story 1.97`);
  check(
    (readSkill('checklist.md') ?? '').includes("Each job a tier gates waits for the tier's evaluation job"),
    'the checklist lacks the item for the waits of gated jobs',
  );
  check(
    (readSkill('steps-v/step-01-validate.md') ?? '').includes(
      "Each job a tier gates (`gates` in the plan) waits for the tier's evaluation job",
    ),
    'the validate step lacks its check of the waits of gated jobs',
  );
}

/** The gate block of the template: the cross-file form of the wait, parsed as YAML. */
function checkGateTemplateBlock() {
  const template = readSkill('github-actions-template.yaml') ?? '';
  const match = /^# evaluation-gate:begin\n([\S\s]*?)^# evaluation-gate:end$/m.exec(template);
  check(match !== null, 'github-actions-template.yaml has no evaluation-gate:begin and evaluation-gate:end block');
  if (match === null) return;
  let parsed;
  try {
    parsed = YAML.parse(
      match[1]
        .split('\n')
        .map((line) => line.replace(/^# ?/, ''))
        .join('\n'),
      { uniqueKeys: true, strict: true },
    );
  } catch (error) {
    check(false, `the evaluation gate block is not YAML: ${error.message.split('\n')[0]}`);
    return;
  }
  const run = parsed?.on?.workflow_run;
  check(
    JSON.stringify(run?.workflows) === JSON.stringify(['PIPELINE_NAME']),
    `the gate block names ${JSON.stringify(run?.workflows)} as the workflow to follow where [PIPELINE_NAME] belongs`,
  );
  check(
    JSON.stringify(run?.types) === JSON.stringify(['completed']),
    'the gate block follows an event other than the completion of the evaluation workflow',
  );
  const jobs = Object.entries(parsed?.jobs ?? {});
  check(jobs.length === 1 && jobs[0][0] === 'GATED_JOB_ID', 'the gate block does not address exactly the GATED_JOB_ID job');
  const gated = jobs[0]?.[1] ?? {};
  check(
    gated.if ===
      "github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'TIER_EVENT' && github.event.workflow_run.path == 'PIPELINE_PATH'",
    "the gate block gives the job an if other than the successful conclusion of a run of the pipeline file started by the tier's event",
  );
  check(
    Object.keys(gated).join(',') === 'if,steps',
    `the gate block changes ${Object.keys(gated).join(', ')} of the job where only the if and the checkout belong`,
  );
  const checkouts = (gated.steps ?? []).filter((step) => typeof step?.uses === 'string' && step.uses.startsWith('actions/checkout'));
  check(
    checkouts.length === 1 && gated.steps.length === 1 && checkouts[0].with?.ref === '${{ github.event.workflow_run.head_sha }}',
    'the gate block does not check out the commit the evaluation workflow ran on',
  );
  check(
    template.includes(
      '#   PIPELINE_NAME: the `name:` of the workflow file that holds the evaluation jobs, its file path when it has none',
    ) &&
      template.includes('#   GATED_JOB_ID:  the id of the job the tier gates') &&
      template.includes("#   TIER_EVENT:    the GitHub event that starts the tier's evaluation job") &&
      template.includes('#   PIPELINE_PATH: the repository-relative path of the workflow file that holds the evaluation jobs'),
    'the template legend lacks the PIPELINE_NAME, GATED_JOB_ID, TIER_EVENT and PIPELINE_PATH lines of the gate block',
  );
}

/** The plan of the gate adopter names the job its release tier gates, and its ground truth reads the wait that follows. */
function checkGateFixture() {
  const gate = groundTruthSet(GATE_SET_ID);
  check(gate !== undefined, `ground-truth.json has no fixture set ${GATE_SET_ID}`);
  const folder = 'test/fixtures/ci-eval/evaluation-gate/evals/notes';
  const adopter = readPlan(path.join(ROOT, folder));
  check(
    adopter.plan !== undefined && adopter.findings.length === 0,
    `the gate adopter's plan breaks the runtime schema: ${JSON.stringify(adopter.findings)}`,
  );
  if (gate === undefined || adopter.plan === undefined) return;
  // The jobs a tier gates are the union of `gates` over the checks the plan places on it.
  const gated = (tier) => [
    ...new Set(adopter.plan.checks.filter((entry) => entry.placement.tier === tier).flatMap((entry) => entry.gates ?? [])),
  ];
  check(
    gated('pr').length === 0,
    `the plan gates ${gated('pr').join(', ')} on pr, where the request gates the publish job on the release checks alone`,
  );
  check(
    JSON.stringify(gated('release')) === JSON.stringify(['publish']),
    `the plan gates ${JSON.stringify(gated('release'))} on release, expected ["publish"]`,
  );
  check(
    adopter.plan.checks.filter((entry) => entry.gates !== undefined).length === 1,
    'the plan names the publish job on more than one check, so the union over the tier is not what the fixture shows',
  );
  const element = (id) => gate.expectedElements.find((entry) => entry.id === id);
  const wait = element('wait-publish');
  const pipeline = fs.readFileSync(path.join(FIXTURE_ROOT, 'evaluation-gate', '.github', 'workflows', 'test.yml'), 'utf8');
  const publish = YAML.parse(pipeline, { uniqueKeys: true, strict: true }).jobs?.publish;
  check(
    wait?.jobId === 'publish' && JSON.stringify(wait?.needs) === JSON.stringify([...[publish?.needs].flat(), 'evaluation-release']),
    `the ground truth's wait is ${JSON.stringify(wait)}, expected the publish job's needs (${JSON.stringify(publish?.needs)}) followed by evaluation-release`,
  );
  check(
    JSON.stringify(wait?.runsOn) === JSON.stringify(['release']) && publish?.if === "github.event_name == 'release'",
    'the ground truth does not hold the publish job to the release event its own if already gives it',
  );
  check(
    element('job-evaluation-release')?.jobId === 'evaluation-release' &&
      JSON.stringify(element('job-evaluation-release')?.runsOn) === JSON.stringify(['release']),
    'the ground truth does not put the evaluation job the publish job waits for on the release event',
  );
  check(
    !pipeline.includes('evaluation-'),
    'the staged pipeline already holds an evaluation job, so the run has nothing to render and the wait would be the fixture',
  );
  // Rule C of the step: the gated job never runs in a run where its tier's evaluation job is skipped, so every event the publish
  // job's own if lets through is an event the evaluation job's if (as the stored correct run renders it) lets through too.
  const correctRun = YAML.parse(
    fs.readFileSync(path.join(REPLAY_ROOT, 'evaluation-gate-live-capture', '.github', 'workflows', 'test.yml'), 'utf8'),
  );
  const events = Object.keys(correctRun.on ?? {});
  const stranded = events.filter(
    (event) => guardHolds(publish?.if, event) !== false && guardHolds(correctRun.jobs['evaluation-release']?.if, event) === false,
  );
  check(stranded.length === 0, `the publish job can run on ${stranded.join(', ')}, where the release evaluation job is skipped`);
  check(!/always\(|cancelled\(|failure\(/.test(String(publish?.if ?? '')), 'the publish job calls a status function in its if');
  check(gate.requireEveryElement === true && gate.mode === 'edit', 'the gate adopter is not an edit set held to every one of its elements');
  const request = fs.readFileSync(path.join(FIXTURE_ROOT, 'evaluation-gate', 'docs', 'ci-requirements.md'), 'utf8');
  check(
    !/evaluation-ci-plan|\bplan\b|\bgates\b|\bneeds\b/i.test(request),
    "the gate adopter's request names the plan, its gates field or the needs key",
  );
  check(request.includes(wait?.requestQuote ?? '\u0000'), "the wait is not quoted from the gate adopter's request");
  check(
    gate.projectFiles.includes(`evals/notes/${PLAN_PATH}`) && gate.projectFiles.includes('evals/package.json'),
    'the gate adopter does not declare its plan and its evaluations folder manifest',
  );
}

/**
 * The wait element, held by one edit of the stored correct run each: the form it takes, the order and content of the list it
 * ends with, what else of the job may not move, the events it still runs on, and the evaluation job it waits for.
 */
function checkGatedWait() {
  const set = groundTruthSet(GATE_SET_ID);
  const directory = path.join(REPLAY_ROOT, 'evaluation-gate-live-capture');
  check(fs.existsSync(path.join(directory, '.github', 'workflows', 'test.yml')), 'the stored correct run of the gate adopter is gone');
  if (set === undefined || !fs.existsSync(path.join(directory, '.github', 'workflows', 'test.yml'))) return;
  const correct = fs.readFileSync(path.join(directory, '.github', 'workflows', 'test.yml'), 'utf8');
  const checkpoint = fs.readFileSync(path.join(directory, 'test-artifacts', 'ci', 'ci-pipeline-progress.md'), 'utf8');
  const missesOf = (text) =>
    scoreRun(set, text, { findings: [] }, { files: { 'test-artifacts/ci/ci-pipeline-progress.md': checkpoint } })
      .elements.filter((element) => !element.present)
      .map((element) => element.id);
  const wait = '    needs: [test, evaluation-release]\n';
  check(correct.includes(wait), 'the stored correct run of the gate adopter has no wait to edit');
  check(missesOf(correct).length === 0, `the stored correct run of the gate adopter misses ${missesOf(correct).join(', ')}`);
  const edited = (replacement) => correct.replace(wait, replacement);
  const publish = (text) => text.replace("    if: github.event_name == 'release'\n    needs: [test, evaluation-release]\n", wait);
  for (const [label, text, expected] of [
    ['the wait as a block list', edited('    needs:\n      - test\n      - evaluation-release\n'), ''],
    ['the wait as an indentless block list', edited('    needs:\n    - test\n    - evaluation-release\n'), ''],
    ['the wait cut from the list', edited('    needs: test\n'), 'wait-publish'],
    ['the wait with the old entry dropped', edited('    needs: [evaluation-release]\n'), 'wait-publish'],
    ['the wait put ahead of the entry the job had', edited('    needs: [evaluation-release, test]\n'), 'wait-publish'],
    ['the wait on the pr evaluation job', edited('    needs: [test, evaluation-pr]\n'), 'wait-publish'],
    ['the wait extended at the end of the list', edited('    needs: [test, evaluation-release, evaluation-pr]\n'), 'wait-publish'],
    ['the wait followed by an entry that runs on the same event', edited('    needs: [test, evaluation-release, test]\n'), 'wait-publish'],
    ['both evaluation jobs awaited', edited('    needs: [test, evaluation-pr, evaluation-release]\n'), 'wait-publish'],
    ['no needs at all', edited(''), 'wait-publish'],
    ['the publish condition dropped', publish(correct), 'wait-publish'],
    [
      'the publish condition widened',
      correct.replace(
        "    if: github.event_name == 'release'\n    needs",
        "    if: github.event_name == 'release' || github.event_name == 'pull_request'\n    needs",
      ),
      'wait-publish',
    ],
    ['the publish steps edited', correct.replace("          registry-url: 'https://registry.npmjs.org'\n", ''), 'wait-publish'],
    ['the publish timeout edited', correct.replace('    timeout-minutes: 10\n', '    timeout-minutes: 20\n'), 'wait-publish'],
    ['the publish job gone', correct.replace(/\n {2}publish:\n[\S\s]*$/, '\n'), 'wait-publish'],
    [
      'the evaluation job on the wrong event',
      correct.replace(
        "    name: 'Evaluation (release)'\n    if: github.event_name == 'release'\n",
        "    name: 'Evaluation (release)'\n    if: github.event_name == 'pull_request'\n",
      ),
      'job-evaluation-release,wait-publish',
    ],
    [
      'the waited evaluation job removed',
      correct.replace(/\n {2}evaluation-release:\n[\S\s]*?(?=\n {2}publish:\n)/, ''),
      'artifact-evaluation-runs-release,command-evaluation-ci-release,job-evaluation-release,wait-publish',
    ],
    [
      'the wait written on the test job',
      edited('    needs: test\n').replace("    name: 'Unit tests'\n", "    name: 'Unit tests'\n    needs: evaluation-release\n"),
      'preserved-job-test,wait-publish',
    ],
  ]) {
    const missed = missesOf(text).sort().join(',');
    check(text !== correct || label === 'the wait as a block list', `${label}: the edit left the stored correct run as it was`);
    check(missed === expected, `${label} misses ${missed || 'nothing'} where ${expected || 'nothing'} belongs`);
  }
  // `withoutNeeds` removes the key at the job's depth and the lines that continue it, and nothing else.
  const block = '  job:\n    needs:\n      - a\n      - b\n    if: x\n    steps:\n      - run: echo needs: a';
  check(
    withoutNeeds(block) === '  job:\n    if: x\n    steps:\n      - run: echo needs: a',
    `withoutNeeds reads ${JSON.stringify(withoutNeeds(block))}`,
  );
  check(
    withoutNeeds('  job:\n    needs:\n    - a\n    - b\n    if: x') === '  job:\n    if: x',
    'withoutNeeds keeps the lines of an indentless block list',
  );
  check(withoutNeeds('  job:\n    needs: a\n    if: x') === '  job:\n    if: x', 'withoutNeeds keeps the needs of a one-line key');
  check(withoutNeeds('  job:\n    if: x\n    needs: [a, b]') === '  job:\n    if: x', 'withoutNeeds keeps the needs of a flow list');
  check(
    withoutNeeds('  job:\n    if: x\n    steps:\n      - run: a\n        needs: b') ===
      '  job:\n    if: x\n    steps:\n      - run: a\n        needs: b',
    'withoutNeeds drops a key deeper than the job',
  );
}

/** The stored cases of the gate adopter: the live capture, and the two deviations derived from it. */
function checkGateCases() {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(REPLAY_ROOT, name, 'expected.json'), 'utf8'));
  const names = fs.readdirSync(REPLAY_ROOT).filter((name) => name.startsWith('evaluation-gate-'));
  let captures = 0;
  for (const name of names) {
    const expected = read(name);
    check(expected.inputs?.fixtureSet === GATE_SET_ID, `${name} scores against ${expected.inputs?.fixtureSet}, expected ${GATE_SET_ID}`);
    check(fs.existsSync(path.join(REPLAY_ROOT, name, '.github', 'workflows', 'test.yml')), `${name} holds no stored workflow`);
    check(
      fs.existsSync(path.join(REPLAY_ROOT, name, 'test-artifacts', 'ci', 'ci-pipeline-progress.md')),
      `${name} holds no checkpoint, which the edit set scores`,
    );
    if (expected.storedOutput?.origin !== 'real-capture') continue;
    captures += 1;
    const stored = fs.readFileSync(path.join(REPLAY_ROOT, name, '.github', 'workflows', 'test.yml'));
    check(
      typeof expected.storedOutput.capturedBy === 'string' && expected.storedOutput.capturedBy.length > 0,
      `${name} is a real capture and does not say which run produced it`,
    );
    check(
      expected.storedOutput.sha256 === crypto.createHash('sha256').update(stored).digest('hex'),
      `${name} holds a workflow whose sha256 differs from the one recorded when the run was captured`,
    );
    check(
      Object.values(expected.result.elements).every(Boolean),
      `${name} is the real capture and misses ${expected.result.elementMisses.join('; ')}`,
    );
  }
  check(captures === 1, `test/replay/ci holds ${captures} real captures of ${GATE_SET_ID}, expected one`);
  // The deviations: the wait cut from a correct run, and an evaluation job its event skips under a publish job that needs it.
  // Two cases that miss the same elements must sign alike and differ in nothing else, so each deviation misses its own set.
  const missesOf = (name) =>
    Object.entries(read(name).result.elements)
      .filter(([, present]) => !present)
      .map(([id]) => id);
  check(missesOf('evaluation-gate-live-capture').length === 0, 'the live capture of the gate adopter misses an element');
  for (const [name, expected] of Object.entries({
    'evaluation-gate-needs-cut': ['wait-publish'],
    'evaluation-gate-release-job-on-pull-requests': ['job-evaluation-release', 'wait-publish'],
  })) {
    check(
      missesOf(name).sort().join(',') === expected.join(','),
      `${name} misses ${missesOf(name).join(', ') || 'nothing'}, expected ${expected.join(', ')}`,
    );
  }
}

/** The corpus validator refuses the wait it cannot hold: a wait with no list, no digest, a digest the staged job does not give, or on a set that is not an edit set. */
async function checkWaitGuards() {
  const baseline = JSON.parse(fs.readFileSync(GROUND_TRUTH, 'utf8'));
  const cases = [
    ['a wait with no jobId', { jobId: '' }, 'wait declares no jobId'],
    ['a wait with an empty needs list', { needs: [] }, 'wait declares no needs list of job ids'],
    ['a wait whose needs holds a non-name', { needs: ['test', 5] }, 'wait declares no needs list of job ids'],
    ['a wait whose runsOn is empty', { runsOn: [] }, 'runsOn is declared and is not a non-empty list of events'],
    ['a wait with no digest', { sha256: 'abc' }, "wait declares no sha256 of the job's bytes without its needs"],
    ['a wait whose digest is not the staged job without its needs', { sha256: '0'.repeat(64) }, 'which is not the declared sha256'],
    ['a wait on a job the pipeline does not hold', { jobId: 'absent' }, 'the staged pipeline carries no job absent'],
  ];
  for (const [label, patch, expected] of cases) {
    const mutated = structuredClone(baseline);
    const element = mutated.fixtureSets.find((set) => set.id === GATE_SET_ID).expectedElements.find((entry) => entry.id === 'wait-publish');
    Object.assign(element, patch);
    const { problems } = await validateCorpus(mutated);
    check(
      problems.some((problem) => problem.includes(expected)),
      `validateCorpus does not refuse ${label} (${problems.length} problems)`,
    );
  }
  const created = structuredClone(baseline);
  const set = created.fixtureSets.find((entry) => entry.id === TIERS_SET_ID);
  set.expectedElements.push(
    structuredClone(
      baseline.fixtureSets.find((entry) => entry.id === GATE_SET_ID).expectedElements.find((entry) => entry.id === 'wait-publish'),
    ),
  );
  const { problems } = await validateCorpus(created);
  check(
    problems.some((problem) => problem.includes('belongs to an edit set')),
    'validateCorpus does not refuse a wait on a set that is not an edit set',
  );
}

// ---------------------------------------------------------------------------
// The step applied to the two committed live repositories (Story 1.97, round 2)

const REPOSITORIES_ROOT = path.join(__dirname, 'fixtures', 'evaluate-ci-repos');

/** The runs a workflow's `on:` starts, as classes: an event, and for a push whether it is a tag, a branch or any push, and for a schedule its cron. */
function runClassesOf(on) {
  const runs = [];
  for (const [event, value] of Object.entries(on ?? {})) {
    if (event === 'push') {
      if (value?.tags) runs.push({ event, ref: 'tag' });
      if (value?.branches) runs.push({ event, ref: 'branch' });
      if (!value?.tags && !value?.branches) runs.push({ event, ref: 'any' });
    } else if (event === 'schedule') {
      for (const entry of value ?? []) runs.push({ event, cron: entry.cron });
    } else runs.push({ event });
  }
  return runs;
}

/** The `if:` text of a run class, as item 7 writes it. */
function guardOf(run) {
  if (run.event === 'schedule') return `github.event.schedule == '${run.cron}'`;
  if (run.event === 'push' && run.ref === 'tag') return "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')";
  if (run.event === 'push' && run.ref === 'branch') return "github.event_name == 'push' && github.ref == 'refs/heads/main'";
  return `github.event_name == '${run.event}'`;
}

/** Whether `run` is one of the runs in the set: the same event, ref class and cron, an `any` push covering a tag or a branch push. */
const coveredBy = (run, evaluationRuns) =>
  evaluationRuns.some(
    (other) =>
      other.event === run.event && (other.ref === run.ref || other.ref === 'any') && (run.event !== 'schedule' || other.cron === run.cron),
  );

/**
 * Section 2 and items 7 and 10 of step 03b, applied by the test's own helper to a repository's workflow files and a plan. It
 * models the in-file wait on GitHub Actions: the tier events and their guards, the guards on the jobs that existed before, the
 * resolution of each gated name and its conflicts, and the `needs` of the gated job. It returns the plan's refusals or the
 * rendered pipeline file.
 */
function renderGatedPipeline({ workflows, pipelineFile, plan, scheduledCron, releaseFile }) {
  const refused = [];
  const pipeline = structuredClone(workflows[pipelineFile]);
  const before = workflows[pipelineFile];
  const tiers = ['pr', 'merge', 'scheduled', 'release'].filter((tier) => plan.checks.some((entry) => entry.placement.tier === tier));
  const named = (tier) => plan.checks.filter((entry) => entry.placement.tier === tier);
  const dispatch = (tier) => named(tier).some((entry) => entry.trigger.includes('manual-dispatch'));
  const specs = {};
  for (const tier of tiers) {
    const runs = [];
    if (tier === 'pr') runs.push({ event: 'pull_request' });
    if (tier === 'merge') runs.push(pipeline.on.merge_group === undefined ? { event: 'push', ref: 'branch' } : { event: 'merge_group' });
    if (tier === 'scheduled') runs.push({ event: 'schedule', cron: scheduledCron });
    if (tier === 'release') runs.push(...runClassesOf(workflows[releaseFile].on).filter((run) => run.event !== 'workflow_dispatch'));
    if (dispatch(tier)) runs.push({ event: 'workflow_dispatch' });
    specs[tier] = runs;
  }
  // Item 7: a release push that another tier's push shares is told apart by its tag.
  for (const run of specs.release ?? []) {
    if (
      run.event === 'push' &&
      run.ref === 'any' &&
      tiers.some((tier) => tier !== 'release' && specs[tier].some((other) => other.event === 'push'))
    )
      run.ref = 'tag';
  }
  // The runs the render adds to the pipeline file: every tier run the file's `on:` did not hold.
  const oldRuns = runClassesOf(before.on);
  const added = tiers.flatMap((tier) => specs[tier]).filter((run) => !coveredBy(run, oldRuns));
  // Item 7: widen `on:`, keeping what is there.
  for (const run of added) {
    if (run.event === 'push') {
      pipeline.on.push = { ...pipeline.on.push, branches: ['main'] };
    } else if (run.event === 'schedule') {
      pipeline.on.schedule = [...(pipeline.on.schedule ?? []), { cron: run.cron }];
    } else pipeline.on[run.event] ??= null;
  }
  // Section 2: resolve each gated name.
  const gatedBy = {};
  for (const tier of tiers) {
    for (const name of new Set(named(tier).flatMap((entry) => entry.gates ?? []))) {
      const holders = Object.entries(workflows).filter(([, workflow]) => workflow.jobs?.[name] !== undefined);
      if (holders.length !== 1) {
        refused.push(`${name} matches ${holders.length} jobs`);
        continue;
      }
      if (holders[0][0] !== pipelineFile) {
        refused.push(`${name} lives in ${holders[0][0]}, a cross-file wait this helper does not model`);
        continue;
      }
      const job = before.jobs[name];
      if (/always\(|cancelled\(|failure\(/.test(String(job.if ?? ''))) refused.push(`${name} calls a status function in its if`);
      const stranded = runClassesOf(before.on).filter((run) => !coveredBy(run, specs[tier]));
      if (stranded.length > 0) {
        refused.push(`${name} already ran on ${JSON.stringify(stranded)}, where the ${tier} evaluation job is skipped`);
      }
      const added = specs[tier].filter((run) => !coveredBy(run, runClassesOf(before.on)));
      if (added.length > 0) {
        refused.push(
          `${name} would run on ${JSON.stringify(added)}, which it did not run on before, where the ${tier} evaluation job runs`,
        );
      }
      (gatedBy[name] ??= []).push(tier);
    }
  }
  if (refused.length > 0) return { refused };
  // Item 7 guards: a pre-existing job that is not gated keeps the runs it had.
  if (added.length > 0) {
    for (const id of Object.keys(before.jobs)) {
      if (gatedBy[id] === undefined) pipeline.jobs[id].if = oldRuns.map(guardOf).join(' || ');
    }
  }
  // Items 1 to 10: one evaluation job per tier, and the wait appended to each gated job.
  for (const tier of tiers) {
    const shared = (run) => tiers.some((other) => other !== tier && specs[other].some((candidate) => candidate.event === run.event));
    pipeline.jobs[`evaluation-${tier}`] = {
      'timeout-minutes': tier === 'scheduled' || tier === 'release' ? 120 : 30,
      if: specs[tier]
        .map((run) => (run.event === 'workflow_dispatch' || !shared(run) ? `github.event_name == '${run.event}'` : guardOf(run)))
        .join(' || '),
      steps: [{ run: `npm exec --prefix evals -- tea-evaluate ci --evaluation evals/answer-grade --tier ${tier}\n` }],
    };
  }
  for (const [id, gating] of Object.entries(gatedBy)) {
    pipeline.jobs[id].needs = [...[before.jobs[id].needs ?? []].flat(), ...gating.map((tier) => `evaluation-${tier}`)];
  }
  return { workflow: pipeline };
}

function loadRepository(name) {
  const root = path.join(REPOSITORIES_ROOT, name);
  const directory = path.join(root, '.github', 'workflows');
  const workflows = Object.fromEntries(
    fs.readdirSync(directory).map((file) => [file, YAML.parse(fs.readFileSync(path.join(directory, file), 'utf8'), { uniqueKeys: true })]),
  );
  const { plan, findings } = readPlan(path.join(root, 'evals', 'answer-grade'));
  check(plan !== undefined && findings.length === 0, `${name}: the committed plan does not read: ${JSON.stringify(findings)}`);
  return { workflows, plan };
}

/**
 * Section 2 and items 7 and 10 applied to both committed live plans, and to edits of them that must conflict or guard.
 * The rendering is the helper's, built from the committed workflows and plans by the step's rules, and the parsed result is read
 * for the wait, the guards and the widened triggers.
 */
function checkGateRenders() {
  // tagged-release: the pipeline file is release.yml, the file that holds `publish`.
  const tagged = loadRepository('tagged-release');
  const rendered = renderGatedPipeline({
    workflows: tagged.workflows,
    pipelineFile: 'release.yml',
    plan: tagged.plan,
    releaseFile: 'release.yml',
  });
  check(rendered.refused === undefined, `tagged-release is refused: ${JSON.stringify(rendered.refused)}`);
  const release = rendered.workflow;
  if (release !== undefined) {
    check(
      JSON.stringify(release.jobs.publish.needs) === JSON.stringify(['evaluation-release']),
      `tagged-release: publish waits for ${JSON.stringify(release.jobs.publish.needs)}`,
    );
    const rest = { ...release.jobs.publish };
    delete rest.needs;
    check(
      JSON.stringify(rest) === JSON.stringify(tagged.workflows['release.yml'].jobs.publish),
      'tagged-release: the publish job changed beyond its needs',
    );
    check(
      release.jobs['evaluation-release'].if === "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')",
      `tagged-release: the release evaluation job runs under ${release.jobs['evaluation-release'].if}`,
    );
    check(
      release.jobs['evaluation-merge'].if === "github.event_name == 'push' && github.ref == 'refs/heads/main'",
      `tagged-release: the merge evaluation job runs under ${release.jobs['evaluation-merge'].if}`,
    );
    check(
      release.jobs['evaluation-pr'].if === "github.event_name == 'pull_request'",
      'tagged-release: the pr evaluation job is not limited to pull requests',
    );
    check(
      JSON.stringify(release.on.push) === JSON.stringify({ tags: ['v*'], branches: ['main'] }) && release.on.pull_request === null,
      `tagged-release: the triggers read ${JSON.stringify(release.on)}`,
    );
  }
  // The release tier naming `manual-dispatch` adds a dispatch to a tag-push release file, where the in-file `publish` would run.
  const addedDispatch = structuredClone(tagged.plan);
  for (const entry of addedDispatch.checks) if (entry.tier === 'release') entry.trigger = ['release', 'manual-dispatch'];
  const dispatchAdded = renderGatedPipeline({
    workflows: tagged.workflows,
    pipelineFile: 'release.yml',
    plan: addedDispatch,
    releaseFile: 'release.yml',
  });
  check(
    dispatchAdded.refused?.length === 1 &&
      /^publish would run on \[\{"event":"workflow_dispatch"\}\], which it did not run on before, where the release evaluation job runs$/.test(
        dispatchAdded.refused[0],
      ),
    `a gate whose evaluation job runs on a dispatch the render adds does not conflict: ${JSON.stringify(dispatchAdded.refused)}`,
  );
  // A declined gate: `publish` is a pre-existing job the render widens the filters under, so it keeps the tag runs it had.
  const declined = structuredClone(tagged.plan);
  for (const entry of declined.checks) delete entry.gates;
  const guarded = renderGatedPipeline({
    workflows: tagged.workflows,
    pipelineFile: 'release.yml',
    plan: declined,
    releaseFile: 'release.yml',
  });
  check(
    guarded.workflow?.jobs.publish.if === "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')" &&
      guarded.workflow.jobs.publish.needs === undefined,
    `tagged-release without the gate: publish runs under ${guarded.workflow?.jobs.publish.if}`,
  );

  // nightly-deploy: the pipeline file is deploy.yml, the file that holds `production`; the scheduled tier takes the cron of nightly.yml.
  const nightly = loadRepository('nightly-deploy');
  const renderNightly = (plan) =>
    renderGatedPipeline({
      workflows: nightly.workflows,
      pipelineFile: 'deploy.yml',
      plan,
      scheduledCron: nightly.workflows['nightly.yml'].on.schedule[0].cron,
      releaseFile: 'deploy.yml',
    });
  // The step refuses a gate whose job already ran on an event where the tier's evaluation job is skipped: `deploy.yml` also runs
  // `production` on a dispatch, so a plan that names `manual-dispatch` on the scheduled checks alone is refused with that conflict,
  // and the plan that names it on the release checks too renders.
  const releaseTriggers = (plan, triggers) => {
    const edited = structuredClone(plan);
    for (const entry of edited.checks) if (entry.tier === 'release') entry.trigger = triggers;
    return edited;
  };
  const checkNightlyRender = (label, deploy) => {
    check(
      deploy.refused === undefined,
      `${label}: nightly-deploy with manual-dispatch on the release tier is refused: ${JSON.stringify(deploy.refused)}`,
    );
    if (deploy.workflow === undefined) return;
    const production = deploy.workflow.jobs.production;
    check(
      JSON.stringify(production.needs) === JSON.stringify(['evaluation-release']),
      `${label}: production waits for ${JSON.stringify(production.needs)}`,
    );
    check(production.if === undefined, `${label}: the gated production job carries an event guard besides its wait`);
    check(
      deploy.workflow.jobs['evaluation-release'].if === "github.event.schedule == '47 3 * * *' || github.event_name == 'workflow_dispatch'",
      `${label}: the release evaluation job runs under ${deploy.workflow.jobs['evaluation-release'].if}`,
    );
    check(
      deploy.workflow.jobs['evaluation-scheduled'].if ===
        "github.event.schedule == '17 2 * * *' || github.event_name == 'workflow_dispatch'",
      `${label}: the scheduled evaluation job runs under ${deploy.workflow.jobs['evaluation-scheduled'].if}`,
    );
    check(
      JSON.stringify(deploy.workflow.on.schedule) === JSON.stringify([{ cron: '47 3 * * *' }, { cron: '17 2 * * *' }]) &&
        'workflow_dispatch' in deploy.workflow.on,
      `${label}: the triggers read ${JSON.stringify(deploy.workflow.on)}`,
    );
  };
  const refusedDispatch = renderNightly(releaseTriggers(nightly.plan, ['release']));
  check(
    refusedDispatch.refused?.length === 1 &&
      /^production already ran on \[\{"event":"workflow_dispatch"\}\], where the release evaluation job is skipped$/.test(
        refusedDispatch.refused[0],
      ),
    `nightly-deploy: the plan with release alone reads ${JSON.stringify(refusedDispatch.refused)}`,
  );
  checkNightlyRender('edited plan', renderNightly(releaseTriggers(nightly.plan, ['release', 'manual-dispatch'])));
  // The committed live plan is whichever shape its session wrote: it renders with `manual-dispatch` on its release checks and is refused without.
  const liveNamesDispatch = nightly.plan.checks
    .filter((entry) => entry.tier === 'release')
    .every((entry) => entry.trigger.includes('manual-dispatch'));
  const live = renderNightly(nightly.plan);
  if (liveNamesDispatch) checkNightlyRender('committed plan', live);
  else
    check(
      JSON.stringify(live.refused) === JSON.stringify(refusedDispatch.refused),
      `nightly-deploy: the committed plan reads ${JSON.stringify(live.refused)}`,
    );

  // Conflicts and refusals, each from an edit of a committed repository.
  const everyPush = structuredClone(tagged.workflows);
  everyPush['release.yml'].on = { push: null };
  const strandedRun = renderGatedPipeline({
    workflows: everyPush,
    pipelineFile: 'release.yml',
    plan: tagged.plan,
    releaseFile: 'release.yml',
  });
  check(
    strandedRun.refused?.length === 1 && /already ran on .*"ref":"any".*the release evaluation job is skipped/.test(strandedRun.refused[0]),
    `a deploy on every push beside a tag-guarded release evaluation does not conflict: ${JSON.stringify(strandedRun)}`,
  );
  const status = structuredClone(tagged.workflows);
  status['release.yml'].jobs.publish.if = 'always()';
  check(
    renderGatedPipeline({ workflows: status, pipelineFile: 'release.yml', plan: tagged.plan, releaseFile: 'release.yml' }).refused?.some(
      (reason) => reason.includes('status function'),
    ) === true,
    'a gated job whose if calls always() does not conflict',
  );
  const absent = structuredClone(tagged.plan);
  absent.checks.find((entry) => entry.gates).gates = ['absent'];
  check(
    renderGatedPipeline({ workflows: tagged.workflows, pipelineFile: 'release.yml', plan: absent, releaseFile: 'release.yml' })
      .refused?.[0] === 'absent matches 0 jobs',
    'a name that matches no job does not refuse the plan',
  );
  const twice = structuredClone(tagged.workflows);
  twice['ci.yml'].jobs.publish = twice['ci.yml'].jobs.test;
  check(
    renderGatedPipeline({ workflows: twice, pipelineFile: 'release.yml', plan: tagged.plan, releaseFile: 'release.yml' }).refused?.[0] ===
      'publish matches 2 jobs',
    'a name that two workflow files hold does not refuse the plan',
  );
  // A run the render adds is no conflict: the tagged-release pipeline gains pull request and branch runs the publish job never had.
  check(
    strandedRun.refused !== undefined && rendered.refused === undefined,
    'the pre-render comparison treats the runs the render adds as a conflict',
  );
}

async function main() {
  checkEntryPoints();
  checkTemplateBlock();
  checkNoRestatedTable();
  checkFixturePlan();
  checkTierFixtures();
  checkEventGuards();
  checkNeedsAndExistingJobGuards();
  checkStepSentences();
  checkSupportingFiles();
  checkManifestFixtures();
  checkStepNaming();
  checkPrescribedRenderings();
  checkTemplateNodeStep();
  await checkCorpusGuards();
  await checkEditSetGuards();
  checkStoredCapture();
  checkTierAndEditCases();
  checkGateSentences();
  checkGateTemplateBlock();
  checkGateFixture();
  checkGatedWait();
  checkGateCases();
  await checkWaitGuards();
  checkGateRenders();

  if (failures.length > 0) {
    for (const message of failures) console.error(`${colors.red}✗${colors.reset} ${message}`);
    console.error(`${colors.red}${failures.length} of ${checks} checks failed${colors.reset}`);
    process.exit(1);
  }
  console.log(
    `${colors.green}✓${colors.reset} ${checks} checks: the evaluation plan step is reached from create, edit and resume, the template block holds its patterns, the fixture adopter's plan is the Story 1.10 plan, the tiers, edit and gate adopters hold their ground truth to their plans`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
