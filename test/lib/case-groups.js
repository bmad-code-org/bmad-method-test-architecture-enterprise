'use strict';

/**
 * The `--group=<name>` mechanism the long evaluate suites share, so CI can run one suite as several chained scripts and no one
 * runner carries its whole wall time.
 *
 * A suite names each of its cases (or sections) with a group. `--group=<name>` runs the cases of that group and nothing else,
 * with no `--group` every case runs, and `--list-groups` prints the suite's cases with their groups as JSON and runs nothing.
 * `test:groups` reads that listing for every suite, so a group that no chained script runs, or a chained script naming a group
 * the suite does not have, fails the quality gate rather than dropping its cases from `npm test` unnoticed.
 */

/** The `--group=<name>` argument's value, `null` when the flag is absent, `''` when it carries no name. */
function requestedGroup(argv = process.argv) {
  const argument = argv.find((value) => value === '--group' || value.startsWith('--group='));
  return argument === undefined ? null : argument.slice('--group='.length);
}

/** The distinct groups of `cases`, in the order they first appear. */
function groupsOf(cases) {
  return [...new Set(cases.map(({ group }) => group))];
}

/**
 * The `--group` of this run, checked against `groups`: a name the suite does not have is a usage error (`error` is its message),
 * and `null` means every case runs.
 */
function selectGroup(groups, argv = process.argv) {
  const group = requestedGroup(argv);
  if (group !== null && !groups.includes(group)) {
    return {
      group,
      error: `unknown --group ${JSON.stringify(group)}: expected one of ${groups.map((name) => `--group=${name}`).join(', ')}`,
    };
  }
  return { group, error: null };
}

/** Whether a case of `caseGroup` runs under the requested `group` (`null` is every group). */
function runs(group, caseGroup) {
  return group === null || group === caseGroup;
}

/**
 * For a suite written as sections, a function that says whether the section called `name` runs. A name that `sections` does not list
 * throws, even under `--list-groups`, so a block gated on an unlisted name cannot sit in the suite and run nowhere.
 */
function sectionRunner(sections, group, listed) {
  return (name) => {
    const section = sections.find((entry) => entry.name === name);
    if (section === undefined) {
      throw new Error(
        `runsSection(${JSON.stringify(name)}): no such section; SECTIONS lists ${sections.map((entry) => JSON.stringify(entry.name)).join(', ')}`,
      );
    }
    return !listed && runs(group, section.group);
  };
}

/**
 * With `--list-groups`, prints `{ groups, cases }` as JSON and returns true so the caller exits before running anything.
 * `cases` is every case or section with its group, so a case with no group shows up as `null` instead of vanishing.
 */
function printGroupsWhenAsked(cases, argv = process.argv, write = (text) => process.stdout.write(text)) {
  if (!argv.includes('--list-groups')) return false;
  const listing = {
    groups: groupsOf(cases),
    cases: cases.map(({ name, group }) => ({ name, group: typeof group === 'string' && group !== '' ? group : null })),
  };
  write(`${JSON.stringify(listing)}\n`);
  return true;
}

module.exports = { groupsOf, printGroupsWhenAsked, requestedGroup, runs, sectionRunner, selectGroup };
