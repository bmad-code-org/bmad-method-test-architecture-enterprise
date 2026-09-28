'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scratchDirectories } = require('./scratch-directories');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'cli/evaluate.js');
const FIXTURE = path.join(ROOT, 'test/fixtures/evaluate/mutation');
const GIT = ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', '-c', 'core.hooksPath=/dev/null'];
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));

function suite(name) {
  const scratch = scratchDirectories(name);
  function cli(folder, command, args = [], env = {}) {
    const run = spawnSync(process.execPath, [CLI, command, '--evaluation', folder, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 180_000,
      env: { ...BASE_ENV, ...env },
    });
    if (run.error) throw run.error;
    return { status: run.status, output: `${run.stdout}${run.stderr}` };
  }
  function project(label, edit = () => {}) {
    const directory = scratch.make(label);
    const repository = path.join(directory, 'repository');
    fs.cpSync(FIXTURE, repository, { recursive: true, filter: (file) => path.basename(file) !== 'runs' });
    fs.writeFileSync(path.join(repository, '.gitignore'), 'vendor/\n');
    const folder = path.join(repository, 'evals/verdict');
    const manifest = path.join(folder, 'evaluation.json');
    const policy = path.join(folder, 'policy/scoring-policy.json');
    const evaluation = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    evaluation.trials = 1;
    fs.writeFileSync(manifest, `${JSON.stringify(evaluation, null, 2)}\n`);
    const scoring = JSON.parse(fs.readFileSync(policy, 'utf8'));
    scoring.minimumTrialCount = 1;
    fs.writeFileSync(policy, `${JSON.stringify(scoring, null, 2)}\n`);
    edit({ folder, directory, repository });
    const digested = cli(folder, 'digest');
    if (digested.status !== 0) throw new Error(digested.output);
    for (const args of [
      ['init', '--quiet', '--initial-branch', 'main'],
      ['add', '--all'],
      ['commit', '--quiet', '-m', 'fixture'],
    ]) {
      const run = spawnSync('git', [...GIT, '-C', repository, ...args], {
        encoding: 'utf8',
        env: { ...BASE_ENV, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
      });
      if (run.status !== 0) throw new Error(`${args.join(' ')}: ${run.stderr}`);
    }
    return { folder, directory, repository, env: { VERDICT_MARKER: path.join(directory, 'launches.jsonl') } };
  }
  function latest(folder) {
    const runs = path.join(folder, 'runs');
    return path.join(
      runs,
      fs
        .readdirSync(runs)
        .filter((name) => name !== '.gitignore')
        .sort()
        .at(-1),
    );
  }
  return { cli, project, latest, cleanup: scratch.removeAll };
}

module.exports = { suite };
