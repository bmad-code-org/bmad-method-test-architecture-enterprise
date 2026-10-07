/**
 * The long evaluate suites run as several chained scripts, each `node test/<suite>.js --group=<name>`, so no one CI runner carries a
 * suite's whole wall time. A suite that splits this way can lose cases silently: a case given a group that no chained script names runs
 * nowhere, and a chained script naming a group the suite does not have fails only when CI reaches it.
 *
 * This holds every grouped suite to its `npm test` chain. Each suite lists its cases with their groups through `--list-groups`, which
 * runs nothing, and for every suite this proves that
 *  - every case has a group,
 *  - every group is run by exactly one chained script,
 *  - every chained script that runs the suite names a group the suite has, and
 *  - no chained script runs the suite without a group, which would run every case a second time.
 *
 * A suite is grouped when a `package.json` script passes it `--group=` or its source requires `lib/case-groups.js`.
 *
 * Usage: node test/test-test-groups.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { chainedScripts } = require('../tools/validate-ci-coverage');

const PROJECT_ROOT = path.join(__dirname, '..');
const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

/** `node test/x.js --group=g` becomes `{ file: 'test/x.js', group: 'g' }`; any other `node test/x.js ...` has `group: null`. */
function parseSuiteCommand(command) {
  const match = /^node (test\/[\w./-]+\.js)((?: .*)?)$/.exec(command.trim());
  if (!match) return null;
  const group = /(?:^| )--group=(\S*)/.exec(match[2]);
  return { file: match[1], group: group ? group[1] : null };
}

/** Every suite file the chain or the sources say is grouped. */
function groupedSuites(manifest) {
  const files = new Set();
  for (const command of Object.values(manifest.scripts)) {
    const parsed = parseSuiteCommand(command);
    if (parsed && parsed.group !== null) files.add(parsed.file);
  }
  const directory = path.join(PROJECT_ROOT, 'test');
  for (const name of fs.readdirSync(directory)) {
    if (!/^test-.*\.js$/.test(name) || name === path.basename(__filename)) continue;
    if (fs.readFileSync(path.join(directory, name), 'utf8').includes("require('./lib/case-groups')")) files.add(`test/${name}`);
  }
  return [...files].sort();
}

/** The listing `--list-groups` prints for `file`, or the reason it could not be read. */
function listingOf(file) {
  const run = spawnSync(process.execPath, [file, '--list-groups'], { cwd: PROJECT_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (run.status !== 0) return { problem: `exited ${run.status ?? run.signal}: ${(run.stderr || run.stdout).trim().slice(0, 300)}` };
  try {
    return { listing: JSON.parse(run.stdout) };
  } catch {
    return { problem: `printed something that is not JSON: ${run.stdout.slice(0, 200)}` };
  }
}

/** Why the chain does not run `file`'s cases exactly once, given its `listing` and the chained commands. */
function suiteProblems(file, listing, commands) {
  const problems = [];
  const groups = new Set(listing.groups);
  const ungrouped = listing.cases.filter((entry) => entry.group === null).map((entry) => entry.name);
  if (ungrouped.length > 0) problems.push(`${file}: no group on ${ungrouped.join(', ')}`);
  if (listing.cases.length === 0) problems.push(`${file}: lists no cases`);
  const runners = commands.map(parseSuiteCommand).filter((parsed) => parsed && parsed.file === file);
  if (runners.some((parsed) => parsed.group === null))
    problems.push(`${file}: a chained script runs it with no --group, so every case runs twice`);
  const named = runners.filter((parsed) => parsed.group !== null).map((parsed) => parsed.group);
  for (const group of named)
    if (!groups.has(group)) problems.push(`${file}: a chained script names --group=${group}, which the suite does not have`);
  for (const group of groups) {
    const count = named.filter((name) => name === group).length;
    if (count === 0) problems.push(`${file}: --group=${group} is run by no chained script, so its cases run nowhere`);
    if (count > 1) problems.push(`${file}: --group=${group} is run by ${count} chained scripts`);
  }
  return problems;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  const chain = chainedScripts(manifest);
  const commands = [...new Set(chain)].map((script) => manifest.scripts[script]).filter((command) => typeof command === 'string');

  // The checker itself, on listings it is handed.
  const sample = (cases) => ({ groups: [...new Set(cases.map((entry) => entry.group).filter(Boolean))], cases });
  const two = sample([
    { name: 'a', group: 'one' },
    { name: 'b', group: 'two' },
  ]);
  const run = (group) => `node test/x.js --group=${group}`;
  check(suiteProblems('test/x.js', two, [run('one'), run('two')]).length === 0, 'a suite whose every group is chained was refused');
  check(
    suiteProblems('test/x.js', two, [run('one')]).some((problem) => /--group=two is run by no chained script/.test(problem)),
    'a group that no chained script runs was accepted',
  );
  check(
    suiteProblems('test/x.js', two, [run('one'), run('two'), run('three')]).some((problem) =>
      /--group=three, which the suite does not have/.test(problem),
    ),
    'a chained script naming a missing group was accepted',
  );
  check(
    suiteProblems('test/x.js', two, [run('one'), run('two'), run('two')]).some((problem) =>
      /--group=two is run by 2 chained scripts/.test(problem),
    ),
    'a group run by two chained scripts was accepted',
  );
  check(
    suiteProblems('test/x.js', two, [run('one'), run('two'), 'node test/x.js']).some((problem) => /with no --group/.test(problem)),
    'a chained script running the whole suite beside its groups was accepted',
  );
  check(
    suiteProblems(
      'test/x.js',
      sample([
        { name: 'a', group: 'one' },
        { name: 'b', group: null },
      ]),
      [run('one')],
    ).some((problem) => /no group on b/.test(problem)),
    'a case with no group was accepted',
  );

  const suites = groupedSuites(manifest);
  check(suites.length > 0, 'no grouped suite was found');
  for (const file of suites) {
    const { listing, problem } = listingOf(file);
    if (problem) {
      check(false, `${file} --list-groups ${problem}`);
      continue;
    }
    const found = suiteProblems(file, listing, commands);
    check(found.length === 0, found.join('; '));
  }

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} test-groups check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} test-groups check(s) passed over ${suites.length} grouped suite(s)`);
  return 0;
}

process.exitCode = main();
