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
 * A script path is normalised against the repository root first, so `./test/x.js` and an absolute path name the suite too. A suite
 * written as sections (it declares `SECTIONS`) is also read as source: every listed section gates exactly one block, no block is
 * gated on a name `SECTIONS` lacks, and no code that runs cases sits outside the blocks. The suites refuse an unlisted name
 * themselves, so a mutated copy of one exits non-zero.
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

/**
 * `node test/x.js --group=g` becomes `{ file: 'test/x.js', group: 'g' }`; any other `node test/x.js ...` has `group: null`. The
 * file is normalised against the repository root, so `./test/x.js` and an absolute path to it name the same suite as `test/x.js`.
 * A command that does not run a file under `test/` is not a suite command.
 */
function parseSuiteCommand(command) {
  const match = /^node (\S+\.js)((?: .*)?)$/.exec(command.trim());
  if (!match) return null;
  const file = path.relative(PROJECT_ROOT, path.resolve(PROJECT_ROOT, match[1])).split(path.sep).join('/');
  if (!file.startsWith('test/')) return null;
  const group = /(?:^| )--group=(\S*)/.exec(match[2]);
  return { file, group: group ? group[1] : null };
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

/** The names a suite written as sections gates its blocks on, in source order. */
function gatedSectionNames(source) {
  return [...source.matchAll(/runsSection\(\s*'((?:[^'\\]|\\.)*)'\s*,?\s*\)/g)].map((match) => match[1]);
}

/** The statements of a section-style suite's `try` body that sit at its top level and are not a gate, a declaration or a comment. */
function statementsOutsideSections(source) {
  const lines = source.split('\n');
  const start = lines.indexOf('try {');
  const end = lines.findIndex((line, index) => index > start && line.startsWith('} finally'));
  if (start === -1 || end === -1) return ['no top-level try block to hold the sections'];
  const allowed = /^ {2}(\/\/|\/\*|\*|if \(runsSection\(|if \(!listed\) process\.stdout\.write\(|const \w+ = (\[|\(.*\) =>)|[})\]])/;
  return lines
    .slice(start + 1, end)
    .filter((line) => /^ {2}\S/.test(line) && !allowed.test(line))
    .map((line) => line.trim());
}

/**
 * Why a suite written as sections (it declares `SECTIONS`) can run a case in no group: a block gated on a name `listing` does not
 * have, a listed section whose block is missing or repeated, or code that runs outside every block.
 */
function sectionProblems(file, source, listing) {
  if (!source.includes('const SECTIONS = [')) return [];
  const problems = [];
  const listed = listing.cases.map((entry) => entry.name);
  const gated = gatedSectionNames(source);
  for (const name of new Set(gated)) {
    if (!listed.includes(name)) problems.push(`${file}: a block is gated on ${JSON.stringify(name)}, which SECTIONS does not list`);
  }
  for (const name of listed) {
    const count = gated.filter((gate) => gate === name).length;
    if (count !== 1) problems.push(`${file}: SECTIONS lists ${JSON.stringify(name)}, which gates ${count} blocks instead of one`);
  }
  for (const statement of statementsOutsideSections(source)) {
    problems.push(`${file}: code outside every section block: ${statement.slice(0, 80)}`);
  }
  return problems;
}

/** Runs a copy of `source` under a name `groupedSuites` does not pick up, and returns the spawn result of `--list-groups`. */
function listMutant(source) {
  const mutant = path.join(PROJECT_ROOT, 'test', 'zz-mutant-suite.js');
  fs.writeFileSync(mutant, source);
  try {
    return spawnSync(process.execPath, [mutant, '--list-groups'], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  } finally {
    fs.rmSync(mutant, { force: true });
  }
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

  // A suite spelled `./test/x.js` or with an absolute path is the same suite, so chaining it whole beside its groups is still caught.
  for (const spelling of ['./test/x.js', path.join(PROJECT_ROOT, 'test/x.js'), 'test/../test/x.js']) {
    check(
      suiteProblems('test/x.js', two, [run('one'), run('two'), `node ${spelling}`]).some((problem) => /with no --group/.test(problem)),
      `a chained script running the whole suite as ${spelling} beside its groups was accepted`,
    );
    check(
      suiteProblems('test/x.js', two, [run('one'), `node ${spelling} --group=two`]).length === 0,
      `a group script spelled ${spelling} was not counted as running its group`,
    );
  }
  check(
    parseSuiteCommand('node tools/x.js') === null && parseSuiteCommand('node ../test/x.js') === null,
    'a script outside test/ was taken for a suite',
  );

  // The section-style suites, mutated: an unlisted gate, a dropped gate, and code outside every block must each fail.
  const partitionFile = 'test/test-evaluate-partition-plans.js';
  const partitionPlans = fs.readFileSync(path.join(PROJECT_ROOT, partitionFile), 'utf8');
  const partitionListing = listingOf(partitionFile).listing;
  check(partitionListing !== undefined, 'the partition plans suite could not be listed');
  if (partitionListing !== undefined) {
    check(sectionProblems(partitionFile, partitionPlans, partitionListing).length === 0, 'the partition plans suite was refused unmutated');
    const firstGate = gatedSectionNames(partitionPlans)[0];
    const unlisted = partitionPlans.replace(`runsSection('${firstGate}')`, "runsSection('rubrics-v2')");
    check(unlisted !== partitionPlans, 'the unlisted-gate mutation did not change the suite');
    const unlistedProblems = sectionProblems(partitionFile, unlisted, partitionListing);
    check(
      unlistedProblems.some((problem) => /gated on "rubrics-v2", which SECTIONS does not list/.test(problem)),
      'a block gated on a section SECTIONS does not list was accepted',
    );
    check(
      unlistedProblems.some((problem) => /gates 0 blocks instead of one/.test(problem)),
      'a listed section left without its block was accepted',
    );
    const outside = partitionPlans.replace('\ntry {\n', "\ntry {\n  assert.ok(true, 'a case outside every section');\n");
    check(outside !== partitionPlans, 'the outside-code mutation did not change the suite');
    check(
      sectionProblems(partitionFile, outside, partitionListing).some((problem) =>
        /code outside every section block: assert\.ok/.test(problem),
      ),
      'a case outside every section block was accepted',
    );
    const mutant = listMutant(unlisted);
    check(
      mutant.status !== 0 && /no such section/.test(mutant.stderr),
      `a suite gated on an unlisted name still ran (exit ${mutant.status})`,
    );
  }

  const suites = groupedSuites(manifest);
  check(suites.length > 0, 'no grouped suite was found');
  for (const file of suites) {
    const { listing, problem } = listingOf(file);
    if (problem) {
      check(false, `${file} --list-groups ${problem}`);
      continue;
    }
    const found = [
      ...suiteProblems(file, listing, commands),
      ...sectionProblems(file, fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf8'), listing),
    ];
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
