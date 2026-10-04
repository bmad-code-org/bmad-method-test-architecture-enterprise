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
 *   UNKNOWN. The twin (`test/fixtures/probe-mutants/nfr/performance/`) writes an invented target on each of the four
 *   threshold lines that read UNKNOWN and moves no other line.
 * - Reliability: the run misses the breach, so the Gate YAML rolls up to CONCERNS. The twin
 *   (`.../nfr/reliability/`) edits the two gate lines that carry reliability and the overall status.
 * - Maintainability: the run leaves the section out. The twin (`.../nfr/maintainability/`) is the stored audit with that
 *   one section deleted. The overall-status oracle cannot serve it, because reliability keeps the report at FAIL, so the
 *   probe names the section oracle, and its witness reads the section's first criterion at CONCERNS, which the clean
 *   bundle's audit does not carry.
 * - The suite reads each twin from the path the builder's emitted probe cites. The shared kit asserts that exactly the
 *   probe's oracle flips between the stored audit and its twin, and this suite asserts the twin's edit is the named one.
 *
 * Usage: node test/test-nfr-qualification.js
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');

const { buildNfrProbes } = require('../tools/generate-probes');
const { changedLines, exitWith, runQualificationSuite } = require('./lib/qualification-suite');

const PROJECT_ROOT = path.join(__dirname, '..');
const REFERENCE = path.join(
  PROJECT_ROOT,
  'test',
  'replay',
  'nfr',
  'gapped-correct-audit',
  'test-artifacts',
  'nfr',
  'nfr-assessment-system.md',
);
const RELIABILITY_TWIN = path.join(PROJECT_ROOT, 'test', 'fixtures', 'probe-mutants', 'nfr', 'reliability', 'nfr-assessment-system.md');
const MAINTAINABILITY_HEADING = '## Maintainability Assessment\n';
const NEXT_SECTION_HEADING = '## Evidence Gaps\n';

async function ownDomain({ check, contract, corpusArm, probes }) {
  const arm = (oracleId) => corpusArm({ corpus: 'nfr', contract, oracleId });
  const reference = fs.readFileSync(REFERENCE, 'utf8');
  const referenceLines = reference.split('\n');
  check(probes.length === 3, `the builder emitted ${probes.length} controlled-mutation probe(s) for the three planted domains`);
  const edits = {
    // Each of the four threshold lines that read UNKNOWN is replaced by an invented target; no other line moves.
    'invent-performance-threshold': (twin) => {
      const { lines } = changedLines(reference, twin);
      const unknownLines = referenceLines.flatMap((line, index) => (/\*\*Threshold:\*\* UNKNOWN/.test(line) ? [index + 1] : []));
      check(
        unknownLines.length > 0 && JSON.stringify(lines?.map((entry) => entry.line)) === JSON.stringify(unknownLines),
        `the performance twin changes lines ${JSON.stringify(lines?.map((entry) => entry.line))}; the threshold lines that read UNKNOWN are ${JSON.stringify(unknownLines)}`,
      );
      check(
        lines?.every((entry) => /^\s*- \*\*Threshold:\*\* \S/.test(entry.to) && !entry.to.includes('UNKNOWN')),
        'the performance twin leaves a threshold line that reads UNKNOWN, or writes one that is no threshold',
      );
    },
    // The two gate lines that carry reliability and the overall status: FAIL becomes CONCERNS.
    'roll-up-reliability-as-concerns': (twin) => {
      const { lines } = changedLines(reference, twin);
      check(
        lines?.length === 2 &&
          lines.every(
            (entry) =>
              /^\s+(?:reliability|overall_status): 'FAIL'$/.test(entry.from) && entry.to === entry.from.replace('FAIL', 'CONCERNS'),
          ),
        `the reliability twin changes ${JSON.stringify(lines)}; expected the reliability and overall_status lines of the gate block, FAIL to CONCERNS`,
      );
    },
    // The stored audit with the one section deleted, from its heading to the next section's.
    'omit-maintainability-section': (twin) => {
      const start = reference.indexOf(MAINTAINABILITY_HEADING);
      const end = reference.indexOf(NEXT_SECTION_HEADING);
      check(start > 0 && end > start, 'the stored audit has no maintainability section followed by the evidence gaps');
      check(
        twin === reference.slice(0, start) + reference.slice(end),
        'the maintainability twin is not the stored audit with that one section deleted',
      );
    },
  };
  for (const probe of probes) {
    const { baselinePassEvidence, mutatedFailEvidence, mutationOperator } = probe.qualification;
    check(
      path.join(PROJECT_ROOT, baselinePassEvidence.path) === REFERENCE,
      `${probe.probeId} cites ${baselinePassEvidence.path}, not the stored correct audit, as its clean arm`,
    );
    const edit = edits[mutationOperator];
    check(edit !== undefined, `${probe.probeId} names the mutation ${mutationOperator}, which this suite holds no edit for`);
    if (edit !== undefined) edit(fs.readFileSync(path.join(PROJECT_ROOT, mutatedFailEvidence.path), 'utf8'));
  }
  // The gate oracle cannot serve maintainability: omitting its section leaves the rollup at FAIL.
  const omitted = probes.find((probe) => probe.qualification.mutationOperator === 'omit-maintainability-section');
  check(omitted !== undefined, 'no probe omits the maintainability section');
  if (omitted !== undefined) {
    const gate = contract.oracles.find((oracle) => oracle.commentary.includes('overall_status FAIL'));
    check(gate !== undefined, 'the contract carries no oracle reading the overall status');
    check(
      gate !== undefined &&
        arm(gate.id)({ text: fs.readFileSync(path.join(PROJECT_ROOT, omitted.qualification.mutatedFailEvidence.path), 'utf8') }).verdict ===
          'held',
      'the overall-status oracle fails on the report without its maintainability section, so the section oracle is no longer the only one that serves',
    );
  }
}

exitWith(
  runQualificationSuite({
    title: 'nfr',
    scratchPrefix: 'tea-nfr-qualification',
    corpus: 'nfr',
    build: buildNfrProbes,
    probesFile: path.join(PROJECT_ROOT, 'test', 'probes', 'nfr.probes.json'),
    sample: { oracleId: 'O-003', referencePath: REFERENCE, mutatedPath: RELIABILITY_TWIN },
    witnessDirection: 'plant-reported',
    flips: { byProject: true },
    extra: ownDomain,
  }),
  'nfr',
);
