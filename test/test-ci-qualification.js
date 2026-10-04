/**
 * A ci probe claims `rollbackVerified: true` only after the mutation it describes was qualified in a
 * disposable copy (Story 1.99, AD-8).
 *
 * `tools/generate-probes.js` used to state the claim as a constant for the two requested-element gaps and
 * the forbidden-element plant, each citing a stored pipeline and naming the corpus's `ground-truth.json`
 * as the artifact it mutates. The mutation of each now edits the stored correct pipeline of its project
 * (`test/replay/ci/full-correct-pipeline/`, `minimal-correct-pipeline/`) into its twin under
 * `test/fixtures/probe-mutants/ci/`: the weekly schedule withheld, the `contents: read` grant withheld, the
 * template's burn-in job added. The arm resolves the containment oracle that reads that element over the
 * workflow the workspace holds, through `test/lib/probe-qualification.js`. The checks every corpus shares
 * (the performed sequence, each failing step, the generator over failures) are `test/lib/qualification-suite.js`;
 * this suite adds what is the ci corpus's own, reading each twin from the path the builder's emitted probe cites:
 *
 * - Each twin differs from its reference by its named edit and nothing else: the three lines of the schedule
 *   trigger removed, the three lines of the permissions block removed, or the burn-in job appended with no other job.
 * - The stored correct pipeline holds every oracle of its project, and exactly the probe's oracle flips on the twin
 *   (the shared kit asserts the flip set over the oracles of the probe's own project).
 * - The defect of a ci probe is in the run's output, so the manifestation witness fires on the twin and is silent on
 *   the correct pipeline (`defect-shown`).
 *
 * Usage: node test/test-ci-qualification.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { buildCiProbes } = require('../tools/generate-probes');
const { changedLines, exitWith, runQualificationSuite } = require('./lib/qualification-suite');

const PROJECT_ROOT = path.join(__dirname, '..');
const WORKFLOW = (id) => path.join(PROJECT_ROOT, 'test', 'replay', 'ci', id, '.github', 'workflows', 'test.yml');

const MUTANTS = path.join(PROJECT_ROOT, 'test', 'fixtures', 'probe-mutants', 'ci');

async function ownElement({ check, contract, corpusArm, probes }) {
  const arm = (oracleId) => corpusArm({ corpus: 'ci', contract, oracleId });
  const projectOf = (oracleId) => {
    const set = (oracle) => /^([\da-z][\da-z-]*): /.exec(oracle.commentary)?.[1];
    const own = set(contract.oracles.find((oracle) => oracle.id === oracleId));
    return contract.oracles.filter((oracle) => set(oracle) === own).map((oracle) => oracle.id);
  };
  // What each named edit is, as the lines the twin loses or gains against its reference.
  const edits = {
    'plant-trigger-weekly-schedule-missing': ({ removed, added }) =>
      added.length === 0 && removed.length === 3 && /^\s*schedule:$/.test(removed[0]) && removed[2].includes('0 2 * * 0'),
    'plant-permission-contents-read-missing': ({ removed, added }) =>
      added.length === 0 &&
      removed.length === 3 &&
      /^permissions:$/.test(removed[0]) &&
      /^\s+contents: read$/.test(removed[1]) &&
      removed[2] === '',
    // The burn-in job appended after the last job, and no other job: every job heading in the added lines is burn-in.
    'plant-template-copied-onto-minimal': ({ removed, added }) => {
      const jobs = added.flatMap((line) => /^ {2}([\w-]+):$/.exec(line)?.[1] ?? []);
      return removed.length === 0 && JSON.stringify(jobs) === JSON.stringify(['burn-in']);
    },
  };
  check(probes.length === 3, `the builder emitted ${probes.length} controlled-mutation probe(s) for the three plants`);
  for (const probe of probes) {
    const { baselinePassEvidence, mutatedFailEvidence, mutationOperator } = probe.qualification;
    const reference = fs.readFileSync(path.join(PROJECT_ROOT, baselinePassEvidence.path), 'utf8');
    const twin = fs.readFileSync(path.join(PROJECT_ROOT, mutatedFailEvidence.path), 'utf8');
    check(
      path.join(PROJECT_ROOT, mutatedFailEvidence.path).startsWith(MUTANTS),
      `${probe.probeId} cites ${mutatedFailEvidence.path}, which is no stored twin under test/fixtures/probe-mutants/ci/`,
    );
    const edit = edits[mutationOperator];
    check(edit !== undefined, `${probe.probeId} names the mutation ${mutationOperator}, which this suite holds no edit for`);
    // A twin of the reference's own length differs line by line, which no edit named here does.
    const difference = changedLines(reference, twin);
    const region = difference.lines === undefined ? difference : { removed: [], added: [] };
    check(
      edit?.(region) === true,
      `the twin of ${probe.probeId} (${mutationOperator}) differs from ${baselinePassEvidence.path} as ${JSON.stringify(difference)}; the named edit is another`,
    );
    const designated = contract.behaviors.find((behavior) => behavior.id === probe.behaviorId)?.oracles[0];
    // The stored correct pipeline holds every oracle of its project, so the twin's one failure is the edit's.
    for (const id of projectOf(designated)) {
      check(arm(id)({ text: reference }).verdict === 'held', `${id} does not hold on ${baselinePassEvidence.path}`);
    }
  }
}

exitWith(
  runQualificationSuite({
    title: 'ci',
    scratchPrefix: 'tea-ci-qualification',
    corpus: 'ci',
    build: buildCiProbes,
    probesFile: path.join(PROJECT_ROOT, 'test', 'probes', 'ci.probes.json'),
    sample: {
      oracleId: 'O-003',
      referencePath: WORKFLOW('full-correct-pipeline'),
      mutatedPath: path.join(MUTANTS, 'trigger-weekly-schedule', 'test.yml'),
    },
    witnessDirection: 'defect-shown',
    flips: { byProject: true },
    extra: ownElement,
  }),
  'ci',
);
