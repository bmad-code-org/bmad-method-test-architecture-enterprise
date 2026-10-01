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

const fs = require('node:fs');
const path = require('node:path');

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
  for (const [file, text, instruction] of [
    ['steps-e/step-01-assess.md', assess, /^Load `\{evaluationPlansStepFile\}`, read it completely, and run its sections 1 and 2 /m],
    [
      'steps-e/step-02-apply-edit.md',
      apply,
      /^When step 1 found evaluation plans, run sections 3 and 4 of `\{evaluationPlansStepFile\}` /m,
    ],
  ]) {
    check(
      skillPathOf(frontmatterOf(text).evaluationPlansStepFile) === STEP,
      `edit mode: ${file} names another file than ${STEP} as its evaluationPlansStepFile`,
    );
    check(instruction.test(text ?? ''), `edit mode: ${file} lacks the instruction that loads {evaluationPlansStepFile} at its verb`);
  }
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
  check(
    /not run: checkpoint predates this step, use \[E\] Edit to render plans/.test(resumeText),
    'resume mode: the dashboard of a checkpoint that predates the detection step does not say so',
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
    !steps.some((step) => typeof step?.run === 'string' && /^npm (ci|install)\s*(#.*)?$/m.test(step.run.trim())),
    'the evaluation block runs a root install',
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
  check(steps.indexOf(upload) > steps.indexOf(tierStep), 'the evaluation upload comes before the tier step');

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
    `the scan found ${files.length} skill files and ${files.includes(STEP) ? 'the step' : 'not the step'}`,
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
  check(prIds.length >= 2, `the plan places ${prIds.length} checks on pr`);

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
  const renamed = capture.replace(/name: "check, compile, seal, oracle-agreement, replay"/, 'name: "evaluate"');
  check(renamed !== capture, 'the stored capture no longer names its tier step for the checks, so the renaming case cannot run');
  check(
    missesOf(renamed).join(',') === 'command-evaluation-ci-pr',
    `a tier step named "evaluate" misses ${missesOf(renamed).join(', ') || 'nothing'} where the tier step element belongs`,
  );
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
  }
  // The live run's workflow, kept byte for byte, is what holds the rendering. The other cases are single deviations from it.
  check(captures === 1, `test/replay/ci holds ${captures} real captures of the evaluation-plan project, expected one`);
}

async function main() {
  checkEntryPoints();
  checkTemplateBlock();
  checkNoRestatedTable();
  checkFixturePlan();
  checkManifestFixtures();
  checkStepNaming();
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
