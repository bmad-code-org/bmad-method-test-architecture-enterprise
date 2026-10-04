/**
 * A ci probe claims `rollbackVerified: true` only after the mutation it describes was qualified in a
 * disposable copy (Story 1.99, AD-8).
 *
 * `tools/generate-probes.js` used to state the claim as a constant for the two requested-element gaps and
 * the forbidden-element plant, each citing a stored pipeline and naming the corpus's `ground-truth.json`
 * as the artifact it mutates. The mutation of each now edits the stored correct pipeline of its project
 * (`test/replay/ci/full-correct-pipeline/`, `minimal-correct-pipeline/`) into the stored deviant one: the
 * weekly schedule withheld, the `contents: read` grant withheld, the template's burn-in job added. The arm
 * resolves the containment oracle that reads that element over the workflow the workspace holds, through
 * `test/lib/probe-qualification.js`. The checks every corpus shares (the performed sequence, each failing
 * step, the generator over failures) are `test/lib/qualification-suite.js`; this suite adds what is the
 * ci corpus's own:
 *
 * - Each stored deviant pipeline fails only the oracle its probe names among the oracles of its project
 *   that the edit can reach, and the stored correct pipeline holds all of them.
 *
 * Usage: node test/test-ci-qualification.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { buildCiProbes } = require('../tools/generate-probes');
const { exitWith, runQualificationSuite } = require('./lib/qualification-suite');

const PROJECT_ROOT = path.join(__dirname, '..');
const WORKFLOW = (id) => path.join(PROJECT_ROOT, 'test', 'replay', 'ci', id, '.github', 'workflows', 'test.yml');

async function ownElement({ check, contract, corpusArm }) {
  const arm = (oracleId) => corpusArm({ corpus: 'ci', contract, oracleId });
  const cases = [
    [
      'O-003',
      'full-correct-pipeline',
      'full-trigger-schedule-missing',
      ['O-001', 'O-002', 'O-003', 'O-004', 'O-005', 'O-006', 'O-007', 'O-008', 'O-009', 'O-010', 'O-011', 'O-012'],
    ],
    [
      'O-004',
      'full-correct-pipeline',
      'full-permissions-missing',
      ['O-001', 'O-002', 'O-003', 'O-004', 'O-005', 'O-006', 'O-007', 'O-008', 'O-009', 'O-010', 'O-011', 'O-012'],
    ],
    [
      'O-022',
      'minimal-correct-pipeline',
      'minimal-template-copied',
      ['O-014', 'O-015', 'O-016', 'O-017', 'O-018', 'O-019', 'O-020', 'O-021', 'O-022', 'O-023', 'O-024', 'O-025'],
    ],
  ];
  for (const [oracleId, referenceId, mutatedId, project] of cases) {
    const reference = fs.readFileSync(WORKFLOW(referenceId), 'utf8');
    const mutated = fs.readFileSync(WORKFLOW(mutatedId), 'utf8');
    for (const id of project) {
      check(arm(id)({ text: reference }).verdict === 'held', `${id} does not hold on ${referenceId}`);
      const verdict = arm(id)({ text: mutated }).verdict;
      if (id === oracleId) check(verdict === 'violated', `${id} is not violated by ${mutatedId}`);
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
    sample: { oracleId: 'O-003', referencePath: WORKFLOW('full-correct-pipeline'), mutatedPath: WORKFLOW('full-trigger-schedule-missing') },
    extra: ownElement,
  }),
  'ci',
);
