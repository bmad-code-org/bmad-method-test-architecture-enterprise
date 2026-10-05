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
 *   trigger removed, the three lines of the permissions block removed, or the burn-in job appended after a blank line,
 *   its heading at job level and every other line indented below it, so no top-level key (`permissions:`, `env:`,
 *   `concurrency:`) and no second job comes with it.
 * - The stored correct pipeline holds every oracle of its project, and exactly the probe's oracle flips on the twin
 *   (the shared kit asserts the flip set over the oracles of the probe's own project).
 * - The manifestation witness of a ci probe reads the request in the workflow the run wrote: the weekly schedule or the `contents: read`
 *   grant for the two requested-element probes, and for the minimal project the requested `npm test` with the forbidden `burn-in` job absent.
 *   It fires on the correct pipeline and is silent on the twin (`plant-reported`), which is the direction pre-flight's fault leg needs
 *   (it replays the correct run on the planted input), so the three pre-flights pass. A witness that reads the other way round, the
 *   element the twin gets wrong, fails this suite.
 * - Pre-flight's `seeded-faults-scoped` also reads the witness over the legs that answered another question than the fault leg: the
 *   alternate-platform leg writes no workflow (the artifact is absent), and the full project's leg writes the full project's correct
 *   pipeline. The witness must be silent on both, so a `not` over a containment (true on an absent artifact) or a bare containment of the
 *   forbidden job (true on the full pipeline) fails here the way it fails pre-flight, which needs a leg cache a live run fills.
 *
 * Usage: node test/test-ci-qualification.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const { buildCiProbes } = require('../tools/generate-probes');
const { witnessArm } = require('./lib/oracle-arm');
const { CORPORA } = require('./lib/probe-qualification');
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
    // The burn-in job appended after the last job and nothing else: the reference's own bytes, then a blank separator line, the `burn-in:`
    // job heading at job level, and only lines indented below it. A top-level key (`permissions:`, `env:`, `concurrency:`) or a second
    // job is indented less, so it is no part of the edit.
    'plant-template-copied-onto-minimal': ({ removed, added }, { reference, twin }) =>
      removed.length === 0 &&
      added.length > 0 &&
      added.at(-1) === '' &&
      twin.startsWith(reference) &&
      /^\n {2}burn-in:\n(?: {4,}[^\n]*\n)+$/.test(twin.slice(reference.length)),
  };
  const fullCorrectPipeline = fs.readFileSync(WORKFLOW('full-correct-pipeline'), 'utf8');
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
      edit?.(region, { reference, twin }) === true,
      `the twin of ${probe.probeId} (${mutationOperator}) differs from ${baselinePassEvidence.path} as ${JSON.stringify(difference)}; the named edit is another`,
    );
    const designated = contract.behaviors.find((behavior) => behavior.id === probe.behaviorId)?.oracles[0];
    // The legs of the operation that did not receive the fault leg's request: no workflow written, and the full project's correct run.
    const witnessOn = (observationOf) =>
      witnessArm({
        contract,
        witness: probe.defects[0].manifestationWitness,
        operationId: CORPORA.ci.operationId,
        observationOf,
      })({ text: '' });
    check(
      witnessOn(() => ({ exitCode: 0, artifacts: { workflow: { kind: 'absent' } } })) !== 'fires',
      `${probe.probeId}: the witness fires when the run wrote no workflow, which is the alternate-platform leg's observation`,
    );
    // A probe whose fault leg sends the request of the `witness-github-actions` leg is dropped from the clean legs by pre-flight (it answered
    // alike), so only a probe with another request has that leg read against its witness.
    const witnessLeg = contract.permittedInterfaces
      .flatMap((iface) => iface.operations)
      .flatMap((operation) => operation.sensitivityWitness?.legs ?? [])
      .find((leg) => leg.legId === 'witness-github-actions');
    check(witnessLeg !== undefined, `${probe.probeId}: the contract declares no witness-github-actions leg`);
    if (!isDeepStrictEqual(probe.defects[0].manifestationWitness.inputs, witnessLeg?.inputs)) {
      check(
        witnessOn(() => ({ exitCode: 0, artifacts: { workflow: { kind: 'text', value: fullCorrectPipeline } } })) !== 'fires',
        `${probe.probeId}: the witness fires on the full project's correct pipeline, which is a clean leg of the same operation`,
      );
    }
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
    witnessDirection: 'plant-reported',
    flips: { byProject: true },
    extra: ownElement,
  }),
  'ci',
);
