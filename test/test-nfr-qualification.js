/**
 * An nfr probe claims `rollbackVerified: true` only after the mutation it describes was qualified in a
 * disposable copy (Story 1.99, AD-8).
 *
 * `tools/generate-probes.js` used to state the claim as a constant for the three planted domains of the
 * gapped bundle, each citing the clean bundle's audit and the gapped bundle's own, which are audits of two
 * different bundles. The mutation of each domain now withholds its finding from the stored correct audit
 * of the gapped bundle (`test/replay/nfr/gapped-correct-audit/`), and the arm resolves the oracle that
 * reads that part of the report over the report the workspace holds, through
 * `test/lib/probe-qualification.js`. The checks every corpus shares (the performed sequence, each failing
 * step, the generator over failures) are `test/lib/qualification-suite.js`; this suite adds what is the
 * nfr corpus's own:
 *
 * - Performance: the run invents the response-time target the sources never state, so no threshold reads
 *   UNKNOWN (`gapped-performance-passed`).
 * - Reliability: the run misses the breach, so the Gate YAML rolls up to CONCERNS (a twin under
 *   `test/fixtures/probe-mutants/nfr/`, which edits the gate block and nothing else).
 * - Maintainability: the run leaves the section out (`gapped-domain-omitted`). The overall-status oracle
 *   cannot serve it, because reliability keeps the report at FAIL, so the probe names the section oracle.
 *
 * Usage: node test/test-nfr-qualification.js
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');

const { buildNfrProbes } = require('../tools/generate-probes');
const { exitWith, runQualificationSuite } = require('./lib/qualification-suite');

const PROJECT_ROOT = path.join(__dirname, '..');
const REPORT = (...segments) => path.join(PROJECT_ROOT, 'test', ...segments, 'test-artifacts', 'nfr', 'nfr-assessment-system.md');
const REFERENCE = REPORT('replay', 'nfr', 'gapped-correct-audit');
const RELIABILITY_TWIN = path.join(PROJECT_ROOT, 'test', 'fixtures', 'probe-mutants', 'nfr', 'reliability', 'nfr-assessment-system.md');

async function ownDomain({ check, contract, corpusArm }) {
  const arm = (oracleId) => corpusArm({ corpus: 'nfr', contract, oracleId });
  const reference = fs.readFileSync(REFERENCE, 'utf8');
  const cases = [
    ['performance', 'O-004', REPORT('replay', 'nfr', 'gapped-performance-passed')],
    ['reliability', 'O-003', RELIABILITY_TWIN],
    ['maintainability', 'O-001', REPORT('replay', 'nfr', 'gapped-domain-omitted')],
  ];
  for (const [domain, oracleId, twin] of cases) {
    check(arm(oracleId)({ text: reference }).verdict === 'held', `${oracleId} does not hold on the stored correct audit`);
    check(
      arm(oracleId)({ text: fs.readFileSync(twin, 'utf8') }).verdict === 'violated',
      `${oracleId} is not violated by the ${domain} mutation`,
    );
  }
  // The gate oracle cannot serve maintainability: omitting its section leaves the rollup at FAIL.
  check(
    arm('O-003')({ text: fs.readFileSync(REPORT('replay', 'nfr', 'gapped-domain-omitted'), 'utf8') }).verdict === 'held',
    'the overall-status oracle fails on the report without its maintainability section, so the section oracle is no longer the only one that serves',
  );
  // The reliability twin edits the gate block and nothing else.
  const twin = fs.readFileSync(RELIABILITY_TWIN, 'utf8').split('\n');
  const original = reference.split('\n');
  const moved = twin.flatMap((line, index) => (line === original[index] ? [] : [index + 1]));
  check(
    twin.length === original.length && moved.length === 2,
    `the reliability twin differs from the stored audit at ${moved.length} line(s), not the two of the gate block`,
  );
}

exitWith(
  runQualificationSuite({
    title: 'nfr',
    scratchPrefix: 'tea-nfr-qualification',
    corpus: 'nfr',
    build: buildNfrProbes,
    probesFile: path.join(PROJECT_ROOT, 'test', 'probes', 'nfr.probes.json'),
    sample: { oracleId: 'O-003', referencePath: REFERENCE, mutatedPath: RELIABILITY_TWIN },
    extra: ownDomain,
  }),
  'nfr',
);
