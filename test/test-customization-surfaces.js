/**
 * Runs BMAD core's real scripts against this repository's TEA skills:
 * setup status on a TEA 2.x upgrade, the customization resolver on the
 * [workflow.red] and [workflow.ci] tables, and the cleanup then migration path.
 *
 * Needs a BMAD core checkout. Set BMAD_CORE_DIR to its root (the folder holding
 * skills/ and tools/). Without it the suite reports a skip, so the npm test
 * chain stays self-contained; the `bmad-core-compat` CI job sets it.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const teaSkills = path.join(repoRoot, 'skills');
const coreDir = process.env.BMAD_CORE_DIR ? path.resolve(process.env.BMAD_CORE_DIR) : null;

if (!coreDir || !fs.existsSync(path.join(coreDir, 'skills', 'bmad', 'scripts', 'setup.py'))) {
  console.log('skip: set BMAD_CORE_DIR to a BMAD core checkout to run the customization surface suite');
  process.exit(0);
}
const coreSkills = path.join(coreDir, 'skills');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function py(script, args, options) {
  return JSON.parse(run('python3', [script, ...args], options).stdout);
}

function resolve(project, skill, key) {
  return py(path.join(project, '_bmad', 'scripts', 'resolve_customization.py'), [
    '--project-root',
    project,
    '--skill',
    path.join(teaSkills, skill),
    '--key',
    key,
  ])[key];
}

function setupProject() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-surfaces-'));
  run('git', ['init', '-q', project]);
  const base = [
    path.join(coreSkills, 'bmad', 'scripts', 'setup.py'),
    '--project-root',
    project,
    '--skill',
    path.join(coreSkills, 'bmad'),
    '--root',
    teaSkills,
    '--root',
    coreSkills,
  ];
  const questions = py(base[0], [...base.slice(1), '--list-config-questions']);
  const modules = {};
  for (const question of questions) (modules[question.module] ??= []).push(question);
  const answers = path.join(project, 'answers.toml');
  fs.writeFileSync(
    answers,
    Object.entries(modules)
      .map(
        ([name, list]) =>
          `[modules.${JSON.stringify(name)}]\n${list.map((q) => `${JSON.stringify(q.key)} = ${JSON.stringify(q.default)}`).join('\n')}`,
      )
      .join('\n'),
  );
  py(base[0], [...base.slice(1), '--module-answers', answers]);
  fs.rmSync(answers);
  return project;
}

const RED_TEAM = '# payments policy\n[workflow.red]\nactivation_steps_prepend = ["Respect the payments acceptance policy"]\n';
const CI_USER = '[workflow.ci]\nci_platform = "azure-pipelines"\n';
const ATDD_TEAM = '# payments policy\n[workflow]\nactivation_steps_prepend = ["Respect the payments acceptance policy"]\n';
const CI_TEAM = '[workflow]\nci_platform = "gitlab-ci"\n';

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}\n${error.stack}`);
  }
}

check('setup status on a TEA 2.x upgrade lists the retired skills and offers no install of a missing skill', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-upgrade-'));
  run('git', ['init', '-q', project]);
  const skills = path.join(project, '.claude', 'skills');
  fs.mkdirSync(skills, { recursive: true });
  for (const root of [coreSkills, teaSkills]) {
    for (const name of fs.readdirSync(root)) fs.cpSync(path.join(root, name), path.join(skills, name), { recursive: true });
  }
  const old = ['automate', 'evaluate', 'framework', 'nfr', 'test-design', 'test-review', 'trace', 'atdd', 'ci'].map(
    (n) => `bmad-testarch-${n}`,
  );
  old.push('bmad-teach-me-testing');
  for (const name of old) {
    fs.mkdirSync(path.join(skills, name));
    fs.writeFileSync(path.join(skills, name, 'SKILL.md'), `---\nname: ${name}\ndescription: old\n---\n`);
  }
  fs.mkdirSync(path.join(project, '_bmad', 'custom'), { recursive: true });
  fs.writeFileSync(path.join(project, '_bmad', 'custom', 'bmad-testarch-trace.toml'), '[workflow]\n');
  const status = py(path.join(skills, 'bmad', 'scripts', 'setup.py'), [
    '--project-root',
    project,
    '--skill',
    path.join(skills, 'bmad'),
    '--root',
    skills,
    '--status',
  ]);
  assert.deepEqual(status.retired_skills.map((r) => r.skill).sort(), old.sort());
  assert.deepEqual(status.custom_renames, [{ from: '_bmad/custom/bmad-testarch-trace.toml', to: '_bmad/custom/bmad-tea-trace.toml' }]);
  assert.equal(status.next, 'bmad setup');
  assert.deepEqual(status.install_offers, []);
  assert.deepEqual(status.problems, []);
});

check('the resolver returns [workflow.red] and [workflow.ci] overrides from the owning skill files', () => {
  const project = setupProject();
  const custom = path.join(project, '_bmad', 'custom');
  fs.mkdirSync(custom, { recursive: true });
  fs.writeFileSync(path.join(custom, 'bmad-tea-automate.toml'), RED_TEAM);
  fs.writeFileSync(path.join(custom, 'bmad-tea-framework.user.toml'), CI_USER);
  assert.deepEqual(resolve(project, 'bmad-tea-automate', 'workflow.red').activation_steps_prepend, [
    'Respect the payments acceptance policy',
  ]);
  assert.deepEqual(resolve(project, 'bmad-tea-automate', 'workflow').activation_steps_prepend, []);
  assert.equal(resolve(project, 'bmad-tea-framework', 'workflow.ci').ci_platform, 'azure-pipelines');
});

check('cleanup deletes the old stems, then the migration restores them from the backup byte for byte', () => {
  const project = setupProject();
  const custom = path.join(project, '_bmad', 'custom');
  fs.mkdirSync(custom, { recursive: true });
  fs.writeFileSync(path.join(custom, 'bmad-tea-atdd.toml'), ATDD_TEAM);
  fs.writeFileSync(path.join(custom, 'bmad-tea-ci.toml'), CI_TEAM);
  const migrate = [
    path.join(coreSkills, 'bmad', 'scripts', 'migrate_v6.py'),
    '--project-root',
    project,
    '--skill',
    path.join(coreSkills, 'bmad'),
    '--root',
    teaSkills,
    '--root',
    coreSkills,
  ];
  const report = py(migrate[0], migrate.slice(1));
  assert.ok(JSON.stringify(report.unused_customizations).includes('bmad-tea-atdd.toml'), 'cleanup lists the atdd stem as unused');
  py(migrate[0], [...migrate.slice(1), '--clean']);
  assert.equal(fs.existsSync(path.join(custom, 'bmad-tea-atdd.toml')), false, 'cleanup removed the atdd stem');
  const cli = path.join(repoRoot, 'cli', 'migrate-customizations.js');
  const out = run('node', [cli, '--project-root', project]).stdout;
  assert.match(out, /bmad-tea-automate\.toml \[workflow\.red\]/);
  assert.equal(fs.readFileSync(path.join(custom, 'bmad-tea-automate.toml'), 'utf8'), ATDD_TEAM.replace('[workflow]', '[workflow.red]'));
  assert.equal(fs.readFileSync(path.join(custom, 'bmad-tea-framework.toml'), 'utf8'), CI_TEAM.replace('[workflow]', '[workflow.ci]'));
  assert.deepEqual(resolve(project, 'bmad-tea-automate', 'workflow.red').activation_steps_prepend, [
    'Respect the payments acceptance policy',
  ]);
  assert.equal(resolve(project, 'bmad-tea-framework', 'workflow.ci').ci_platform, 'gitlab-ci');
  const again = run('node', [cli, '--project-root', project]).stdout;
  assert.match(again, /No legacy TEA customizations found\./);
});

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll customization surface checks passed');
