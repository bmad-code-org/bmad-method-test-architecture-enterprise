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
 *    `evaluationPlansStepFile`) and from the resume routing, so deleting the step file or dropping any reference fails;
 *  - the GitHub Actions template carries the evaluation block between its markers, parsed as YAML: a per-check step
 *    pattern (a named standalone `run:` step) and an upload of the evaluation folder's `runs/` with `if: always()`, so
 *    removing the block or either pattern fails;
 *  - skill prose points at the runtime's schema and `ci-plan.js` and restates no AD-10 tier table, so writing a check id
 *    with its default tier into the skill fails;
 *  - the fixture adopter's plan is the Story 1.10 fixture's plan with its evaluation folder moved, validates through the
 *    runtime's own reader, and the ground truth's command elements are the plan's distinct `pr` commands, so a plan and a
 *    ground truth that drift apart fail;
 *  - the stored `evaluation-plan` replay is a real capture of the live `eval:ci` run.
 */

const fs = require('node:fs');
const path = require('node:path');

const YAML = require('yaml');

const { DEFAULT_TIERS, PLAN_PATH, readPlan } = require('../cli/lib/evaluate/ci-plan');

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
  check(create !== null && edit !== null && resume !== null, 'SKILL.md routes the create, edit and resume entries');

  check(readSkill(STEP) !== null, `${STEP} exists`);
  check(frontmatterOf(readSkill(STEP)).name === 'step-03b-render-evaluation-plans', `${STEP} names itself in its frontmatter`);

  // Create mode: the chain of nextStepFile from the first step reaches the detection step before the validation step.
  const chain = create === null ? [] : nextChain(create);
  const at = chain.indexOf(STEP);
  check(at !== -1, `create mode: the nextStepFile chain from ${create} (${chain.join(' > ')}) does not reach ${STEP}`);
  check(
    at !== -1 && chain[at + 1] === 'steps-c/step-04-validate-and-summary.md',
    `create mode: ${STEP} is not followed by the validation step in the chain (${chain.join(' > ')})`,
  );
  check(
    at > 0 && chain[at - 1] === 'steps-c/step-03-configure-quality-gates.md',
    `create mode: ${STEP} does not follow the quality gates step in the chain (${chain.join(' > ')})`,
  );

  // Edit mode: the assess step detects and validates, the apply step renders, each through its own reference.
  for (const [file, sections] of [
    ['steps-e/step-01-assess.md', 'sections 1 and 2'],
    ['steps-e/step-02-apply-edit.md', 'sections 3 and 4'],
  ]) {
    const text = readSkill(file);
    check(
      skillPathOf(frontmatterOf(text).evaluationPlansStepFile) === STEP,
      `edit mode: ${file} does not name ${STEP} as its evaluationPlansStepFile`,
    );
    check(
      text !== null && text.includes('{evaluationPlansStepFile}') && text.includes(sections),
      `edit mode: ${file} does not load {evaluationPlansStepFile} for ${sections}`,
    );
  }
  check(edit === 'steps-e/step-01-assess.md', `edit mode: SKILL.md routes E to ${edit}, expected the assess step`);

  // Resume: the checkpoint's last step routes onto the detection step and past it.
  const resumeText = resume === null ? '' : (readSkill(resume) ?? '');
  check(
    /'step-03-configure-quality-gates'` → Load `\.\/step-03b-render-evaluation-plans\.md`/.test(resumeText),
    'resume mode: a run last saved at the quality gates step does not route to the detection step',
  );
  check(
    /'step-03b-render-evaluation-plans'` → Load `\.\/step-04-validate-and-summary\.md`/.test(resumeText),
    'resume mode: a run last saved at the detection step does not route to the validation step',
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
  check(jobId === 'JOB_ID', `the evaluation job is keyed ${JSON.stringify(jobId)}, expected the JOB_ID placeholder`);
  check(job?.['timeout-minutes'] === 'TIMEOUT_MINUTES', 'the evaluation job does not carry the TIMEOUT_MINUTES placeholder');
  check(
    /# tea-evaluation-plan: /.test(match[1]),
    'the evaluation block carries the tea-evaluation-plan marker comment the re-render looks for',
  );
  const steps = Array.isArray(job?.steps) ? job.steps : [];

  // The per-check step pattern: a named, standalone run: step that holds the command placeholder.
  const checkSteps = steps.filter(
    (step) => typeof step?.name === 'string' && typeof step?.run === 'string' && step.run.includes('COMMAND'),
  );
  check(checkSteps.length === 1, `the evaluation block holds ${checkSteps.length} per-check step patterns, expected one`);
  check(
    checkSteps.every((step) => step.name.includes('CHECK_IDS') && step['continue-on-error'] === undefined),
    'the per-check step pattern is not named for its check ids or is marked continue-on-error',
  );
  check(
    checkSteps.every((step) => step.run.trim() === 'COMMAND' && step.run.endsWith('\n')),
    'the per-check step pattern is not a block scalar that holds its one command and nothing else',
  );

  // The evidence upload: the evaluation folder's runs/ directory, whatever the result.
  const uploads = steps.filter((step) => typeof step?.uses === 'string' && step.uses.startsWith('actions/upload-artifact@'));
  check(uploads.length === 1, `the evaluation block holds ${uploads.length} artifact uploads, expected one`);
  const upload = uploads[0];
  check(upload?.if === 'always()', `the evaluation upload runs under ${JSON.stringify(upload?.if)}, expected always()`);
  check(
    upload?.with?.name === 'JOB_ID-runs',
    `the evaluation upload is named ${JSON.stringify(upload?.with?.name)}, expected the job id and -runs`,
  );
  check(
    typeof upload?.with?.path === 'string' && upload.with.path.endsWith('/runs/'),
    `the evaluation upload path is ${JSON.stringify(upload?.with?.path)}, expected the evaluation folder's runs/ directory`,
  );
  check(steps.indexOf(upload) > steps.indexOf(checkSteps[0]), 'the evaluation upload does not come after the check step pattern');

  // The template as a whole stays YAML a workflow can start from.
  try {
    YAML.parse(template, { uniqueKeys: true, strict: true });
  } catch (error) {
    check(false, `github-actions-template.yaml no longer parses: ${error.message.split('\n')[0]}`);
  }
}

function checkNoRestatedTable() {
  const step = readSkill(STEP) ?? '';
  check(step.includes(PLAN_SCHEMA_FILE), `${STEP} does not point at ${PLAN_SCHEMA_FILE}`);
  check(step.includes(PLAN_RULES_FILE), `${STEP} does not point at ${PLAN_RULES_FILE}`);
  check(fs.existsSync(path.join(ROOT, PLAN_SCHEMA_FILE)), `${PLAN_SCHEMA_FILE} does not exist`);
  check(fs.existsSync(path.join(ROOT, PLAN_RULES_FILE)), `${PLAN_RULES_FILE} does not exist`);

  // The ids that are not ordinary words each name one AD-10 default-table row. Writing one into the skill, with or
  // without its tier, copies the table. A test may import the table and the skill must point at it.
  const distinctive = Object.keys(DEFAULT_TIERS).filter((id) => id.includes('-') || id === 'gameability');
  check(distinctive.length >= 7, `the AD-10 table gives ${distinctive.length} distinctive check ids, expected at least 7`);
  const block =
    /^# evaluation-plan:begin\n[\S\s]*?^# evaluation-plan:end$/m.exec(readSkill('github-actions-template.yaml') ?? '')?.[0] ?? '';
  for (const [label, text] of [
    [STEP, step],
    ['the evaluation block of github-actions-template.yaml', block],
    ['steps-e/step-01-assess.md', readSkill('steps-e/step-01-assess.md') ?? ''],
    ['steps-e/step-02-apply-edit.md', readSkill('steps-e/step-02-apply-edit.md') ?? ''],
    ['checklist.md', readSkill('checklist.md') ?? ''],
    ['SKILL.md', readSkill('SKILL.md') ?? ''],
    ['instructions.md', readSkill('instructions.md') ?? ''],
    ['steps-c/step-01b-resume.md', readSkill('steps-c/step-01b-resume.md') ?? ''],
    ['steps-c/step-04-validate-and-summary.md', readSkill('steps-c/step-04-validate-and-summary.md') ?? ''],
    ['steps-v/step-01-validate.md', readSkill('steps-v/step-01-validate.md') ?? ''],
  ]) {
    const restated = distinctive.filter((id) => text.includes(id));
    check(restated.length === 0, `${label} restates the AD-10 table by naming ${restated.join(', ')}; point at ${PLAN_RULES_FILE} instead`);
  }
}

/** The distinct argv of one tier's checks, in plan order, as the step renders them (an `npx` lead). */
function distinctCommands(plan, tier) {
  return [...new Set(plan.checks.filter((entry) => entry.placement.tier === tier).map((entry) => ['npx', ...entry.command].join(' ')))];
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

  const prCommands = distinctCommands(adopter.plan, 'pr');
  check(
    prCommands.length >= 2 && prCommands.length < adopter.plan.checks.length,
    `the plan's pr checks give ${prCommands.length} distinct commands for ${adopter.plan.checks.length} checks`,
  );

  const groundTruth = JSON.parse(fs.readFileSync(GROUND_TRUTH, 'utf8'));
  const set = groundTruth.fixtureSets.find((entry) => entry.id === SET_ID);
  check(set !== undefined, `ground-truth.json has no fixture set ${SET_ID}`);
  if (set === undefined) return;
  const requested = set.expectedElements
    .filter((element) => element.rule === 'evaluationPlanCommandSteps')
    .map((element) => element.command);
  check(
    JSON.stringify(requested) === JSON.stringify(prCommands),
    `the ground truth lists ${JSON.stringify(requested)} as the pr commands and the plan's distinct pr commands are ${JSON.stringify(prCommands)}`,
  );
  const upload = set.expectedElements.find((element) => element.kind === 'artifact');
  check(
    upload?.pathToken === 'runs/' && upload?.condition === 'always()',
    'the ground truth does not ask for an upload of runs/ under always()',
  );
  check(set.projectFiles.includes(`evals/grader/${PLAN_PATH}`), 'the fixture adopter does not declare its plan as a project file');
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

checkEntryPoints();
checkTemplateBlock();
checkNoRestatedTable();
checkFixturePlan();
checkStoredCapture();

if (failures.length > 0) {
  for (const message of failures) console.error(`${colors.red}✗${colors.reset} ${message}`);
  console.error(`${colors.red}${failures.length} of ${checks} checks failed${colors.reset}`);
  process.exit(1);
}
console.log(
  `${colors.green}✓${colors.reset} ${checks} checks: the evaluation plan step is reached from create, edit and resume, the template block holds both patterns, and the fixture adopter's plan is the Story 1.10 plan`,
);
