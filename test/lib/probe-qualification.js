/**
 * Mutation qualification for the test-review, trace, nfr and ci probe corpora (AD-8, Story 1.99).
 *
 * `tools/generate-probes.js` used to state `rollbackVerified: true` as a constant for the eighteen
 * controlled-mutation probes of these four corpora, each citing a stored baseline and a stored mutated
 * output. Each probe now earns the claim through `qualifyStoredMutation`
 * (`test/lib/mutation-qualification.js`), the cycle the test-design corpus runs (Story 1.49): a disposable
 * copy of a stored reference artifact, the clean arm, one exact mutation, the mutated arm, the restore,
 * the digest comparison and the clean rerun.
 *
 * Each corpus states its own mutation and its own arm. The arm is the same for all four: the contract
 * oracle the probe's behavior discharges, resolved by eval-quality's evaluator over the artifact the
 * workspace holds (`test/lib/oracle-arm.js`). What differs is the artifact the oracle reads, which is
 * the artifact the mutation edits:
 *
 *   test-review  the review's verdict. The reference is the stored review that reports every planted
 *                row; the mutation withholds the finding for one row, as a reviewer that missed the
 *                plant would, and that row's oracle (a finding naming the row in the right file at an
 *                admitted line) fails. The plants live in spec files a review reads, and scoring a spec
 *                file takes a reviewer, which no deterministic arm is.
 *   trace        the run's summary. The reference is the stored correct summary of the seeded set; the
 *                mutation withholds one coverage gap from its priority breakdown, so the criterion's
 *                priority band reads as covered, and the breakdown oracle fails.
 *   nfr          the run's report. The reference is the stored correct audit of the gapped bundle; the
 *                mutation withholds one domain's finding (a threshold the report invents, a failing
 *                reliability rolled up as CONCERNS, a maintainability section left out), and the oracle
 *                that reads that part of the report fails.
 *   ci           the run's workflow file. The reference is the stored correct pipeline; the mutation
 *                withholds the requested element (the weekly schedule, the `contents: read` grant) or
 *                adds the forbidden one (the template's burn-in job), and the containment oracle fails.
 *
 * Only the cycle yields `rollbackVerified: true`. This module returns the cycle's evidence and states the
 * flag nowhere.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { verdictFor } = require('../../cli/lib/parse-report');
const { qualifyStoredMutation } = require('./mutation-qualification');
const { oracleArm } = require('./oracle-arm');

const CONTRACT_ROOT = path.join(__dirname, '..', 'contracts');

/** A JSON artifact's text as an artifact, or `null` when it does not parse: an artifact nothing can read is no observation at all. */
function jsonArtifact(name, text) {
  try {
    return { [name]: { kind: 'json', value: JSON.parse(text) } };
  } catch {
    return null;
  }
}

/**
 * What each corpus's cycle works on: its contract, the operation its step runs, the artifact's name inside
 * the workspace and how that artifact's text becomes the observation an oracle resolves over.
 */
const CORPORA = Object.freeze({
  'test-review': {
    contract: 'test-review.contract.json',
    operationId: 'review-test-files',
    targetArtifact: 'verdict.json',
    observationOf: (text) => {
      const artifacts = jsonArtifact('verdict', text);
      if (artifacts === null) return null;
      // The CLI's own reading of the recommendation, as the harness passes no --fail-on.
      return { exitCode: verdictFor(artifacts.verdict.value.recommendation, 'request-changes') === 'fail' ? 1 : 0, artifacts };
    },
  },
  trace: {
    contract: 'trace.contract.json',
    operationId: 'trace-fixture-set',
    targetArtifact: 'test-artifacts/trace/summary.json',
    observationOf: (text) => {
      const artifacts = jsonArtifact('summary', text);
      return artifacts === null ? null : { exitCode: 0, artifacts };
    },
  },
  nfr: {
    contract: 'nfr.contract.json',
    operationId: 'audit-evidence-bundle',
    targetArtifact: 'test-artifacts/nfr/nfr-assessment-system.md',
    observationOf: (text) => ({ exitCode: 0, artifacts: { report: { kind: 'text', value: text } } }),
  },
  ci: {
    contract: 'ci.contract.json',
    operationId: 'generate-pipeline',
    targetArtifact: '.github/workflows/test.yml',
    observationOf: (text) => ({ exitCode: 0, artifacts: { workflow: { kind: 'text', value: text } } }),
  },
});

/** The compiled contract of one corpus, read once per call from the generated file. */
function loadCorpusContract(corpus) {
  return JSON.parse(fs.readFileSync(path.join(CONTRACT_ROOT, CORPORA[corpus].contract), 'utf8'));
}

/** The arm one corpus runs for one oracle: the oracle's own check, resolved over the artifact the workspace holds. */
function corpusArm({ corpus, contract, oracleId }) {
  const shape = CORPORA[corpus];
  if (shape === undefined) throw new Error(`no mutation cycle is defined for the ${corpus} corpus`);
  return oracleArm({ contract, oracleId, operationId: shape.operationId, observationOf: shape.observationOf });
}

/**
 * Qualifies one controlled-mutation probe of the four corpora in a disposable copy.
 *
 * @param {object} options
 * @param {'test-review'|'trace'|'nfr'|'ci'} options.corpus
 * @param {object} options.contract the corpus's compiled contract
 * @param {string} options.oracleId the oracle the probe's behavior discharges
 * @param {string} options.mutationId the cycle's label
 * @param {string} options.referencePath absolute path of the stored reference artifact
 * @param {string} options.mutatedPath absolute path of the stored mutated artifact
 * @param {Function} [options.arm] replaces the oracle arm, for a case that plants a failing step
 * @param {(bytes: Uint8Array) => string} [options.digestBytes]
 * @returns {Promise<{mutation: object, evidence: object}>} the cycle's own evidence
 * @throws {QualificationError} at the first step that fails
 */
async function qualifyCorpusMutation({ corpus, contract, oracleId, mutationId, referencePath, mutatedPath, arm, digestBytes }) {
  const shape = CORPORA[corpus];
  if (shape === undefined) throw new Error(`no mutation cycle is defined for the ${corpus} corpus`);
  return qualifyStoredMutation({
    mutationId,
    targetArtifact: shape.targetArtifact,
    referencePath,
    mutatedPath,
    digestBytes,
    arm: arm ?? corpusArm({ corpus, contract, oracleId }),
  });
}

module.exports = { CORPORA, corpusArm, loadCorpusContract, qualifyCorpusMutation };
