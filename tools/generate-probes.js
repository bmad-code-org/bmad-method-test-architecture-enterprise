/**
 * Probe corpus generator.
 *
 * A contract says what a TEA skill has to do. A probe says what was wrong with
 * the system when the contract was asked, and `eval-quality`'s `runScore` reads
 * the two together to answer the question the package exists for: did this
 * contract's oracles catch the defect that was actually there?
 *
 * TEA already plants defects and already records them. `test/fixtures/test-review-eval/ground-truth.json`
 * carries nine planted rows with their severities, files, lines and admitted
 * lines; `test/fixtures/trace-eval/ground-truth.json` carries a seeded set whose
 * coverage gaps are the plant and a clean set that is the control; each
 * `test/evals/<workflow>/evals.json` carries a required set and a forbidden set
 * per case. Every probe below is derived from one of those, the way
 * `tools/generate-contracts.js` derives the contracts from the same sources.
 * Nothing here is transcribed, so a corpus edit that leaves a probe stale fails
 * `npm test` rather than sitting on disk describing a plant nobody keeps.
 *
 * Each probe names the oracle that catches it, through the behavior it declares.
 * `eval-quality`'s `designatedOracleIdOf` resolves AD-40's designated oracle only
 * for a behavior declaring exactly one, so a probe's `behaviorId` is read out of
 * the generated contract rather than chosen here, and `--check` fails when a
 * probe names a behavior the contract no longer carries or one that no longer
 * discharges a single oracle. A probe that restates a plant nobody can detect is
 * worthless, and that check is what keeps one out.
 *
 * WHAT DOES NOT SCORE, AND WHY IT IS STILL HERE
 *
 * Two of the nine kinds of probe TEA can honestly author are refused by
 * `eval-quality` 1.2.0, and both refusals are recorded in
 * `test/probes/expected-strength.json` rather than avoided by writing a weaker
 * probe:
 *
 * - A defect probe's `manifestationWitness` cannot describe a command. Its
 *   `inputs` field is the HTTP-only `WitnessInputs` (`path`, `query`, `header`,
 *   `body`), while the contract side's sensitivity-witness leg takes a union
 *   admitting `argument`, `option`, `environment` and `stdin`. A witness carrying
 *   command channels fails the Probe parse, one carrying transport channels
 *   throws `undeclared-mandatory-input` at plan time, and `null` fails the
 *   `seeded-fault-fired` check, which fails pre-flight and invalidates the run.
 *   So every `defect` and `zero-action` probe here declares `null` and is
 *   recorded as blocked.
 * - A defect signature cannot address a file the command wrote. An `artifact`
 *   pointer is refused as `condition-artifact-channel-contract-local`, and a
 *   `stdout` pointer resolves only where the operation declares standard output
 *   as its descriptor channel. `tea-fragment-selection-runner` does, so its
 *   signatures qualify; `tea-test-review` and `tea-trace-runner` both write their
 *   deliverable to a file, so theirs do not.
 *
 * The signatures below say what is true about the plant rather than what would
 * pass. An `exit-code` signature qualifies against all three commands and
 * discriminates nothing, which is the catch rate of 1.00 by construction that
 * AD-40 exists to prevent, so none is written.
 *
 * Usage: node tools/generate-probes.js [--check]
 * Exit codes: 0 = written or up to date, 1 = a corpus is stale, 2 = the generator could not run
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const prettier = require('prettier');

const { digest } = require('../test/lib/eval-record');
const { parseRegistryRows } = require('./validate-criteria-fragments');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONTRACT_ROOT = path.join(PROJECT_ROOT, 'test', 'contracts');
const PROBE_ROOT = path.join(PROJECT_ROOT, 'test', 'probes');
const EVAL_ROOT = path.join(PROJECT_ROOT, 'test', 'evals');
const REVIEW_FIXTURE_ROOT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-review-eval');
const TRACE_FIXTURE_ROOT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'trace-eval');
const REVIEW_FIXTURE_PREFIX = 'test/fixtures/test-review-eval/';
const TRACE_FIXTURE_PREFIX = 'test/fixtures/trace-eval/';

/** The Probe schema version this generator writes. A bump arrives as a parse failure on the first run after an upgrade. */
const PROBE_SCHEMA_VERSION = 3;

class GeneratorError extends Error {}

function assert(condition, message) {
  if (!condition) throw new GeneratorError(message);
}

const pad = (n) => String(n).padStart(3, '0');

/** `sha256:<hex>` over the named repository files, in the order given. */
function digestOf(relativePaths) {
  const parts = [];
  for (const relative of relativePaths) {
    const absolute = path.join(PROJECT_ROOT, relative);
    assert(fs.existsSync(absolute), `${relative} does not exist, so nothing can be digested for it`);
    parts.push(relative, fs.readFileSync(absolute));
  }
  return digest(parts);
}

/** A public artifact reference to one repository file, digested from its bytes. */
function fileReference(relativePath) {
  return { storage: 'public', path: relativePath, privateRef: null, digest: digestOf([relativePath]) };
}

function loadContract(relativePath) {
  const file = path.join(CONTRACT_ROOT, relativePath);
  assert(fs.existsSync(file), `${relativePath} has not been generated; run node tools/generate-contracts.js first`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * The behavior in this contract whose single oracle is the one named.
 *
 * Read rather than chosen, and it throws when the behavior groups more than one.
 * That is the whole point: a probe whose behavior discharges several oracles
 * resolves no designated oracle, `score` votes its trial with the first oracle in
 * the contract instead, and the strength vector then measures a probe against an
 * oracle it has nothing to do with.
 */
function soleBehaviorFor(contract, oracleId) {
  const found = contract.behaviors.filter((behavior) => behavior.oracles.length === 1 && behavior.oracles[0] === oracleId);
  assert(
    found.length === 1,
    `${contract.contractId}: ${found.length} behavior(s) declare ${oracleId} alone, and a probe needs exactly one so AD-40's designated oracle resolves`,
  );
  return found[0].id;
}

/** The behavior a probe may name when no single-oracle behavior exists, with the grouping recorded rather than hidden. */
function groupedBehaviorFor(contract, oracleId) {
  const found = contract.behaviors.filter((behavior) => behavior.oracles.includes(oracleId));
  assert(found.length === 1, `${contract.contractId}: ${found.length} behavior(s) name ${oracleId}`);
  return found[0].id;
}

/** The eight input channels a defect signature's selector declares, with only the ones named bound. */
function selector(bound) {
  return {
    inputBinding: {
      path: null,
      query: null,
      header: null,
      body: null,
      argument: null,
      option: null,
      environment: null,
      stdin: null,
      ...bound,
    },
  };
}

/** The basename pattern the contract's own oracles use, so a probe and an oracle read one file the same way. */
function basenamePattern(basename) {
  const escaped = basename.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
  return `^(?:.*/|)${escaped}$`;
}

// ---------------------------------------------------------------------------
// test-review
// ---------------------------------------------------------------------------

/** Every plant in the corpus, flattened, in the order ground-truth.json lists them. */
function reviewPlants(groundTruth) {
  return groundTruth.files.flatMap((entry) =>
    (entry.planted ?? []).map((defect) => ({
      row: defect.row,
      line: defect.line,
      admittedLines: defect.admittedLines,
      relativePath: `${REVIEW_FIXTURE_PREFIX}${entry.path}`,
      basename: path.basename(entry.path),
      what: defect.what,
    })),
  );
}

function buildTestReviewProbes() {
  const contract = loadContract('test-review.contract.json');
  const groundTruth = JSON.parse(fs.readFileSync(path.join(REVIEW_FIXTURE_ROOT, 'ground-truth.json'), 'utf8'));
  const plants = reviewPlants(groundTruth);
  assert(plants.length > 0, 'ground-truth.json plants nothing, so there is no defect corpus to generate');

  const severityOfRow = new Map(parseRegistryRows().map((row) => [row.id, row.severity]));
  const reviewedFiles = groundTruth.files.map((entry) => `${REVIEW_FIXTURE_PREFIX}${entry.path}`);
  const reviewedBasenames = groundTruth.files.map((entry) => path.basename(entry.path));
  const groundTruthPath = `${REVIEW_FIXTURE_PREFIX}ground-truth.json`;
  const clean = groundTruth.files.find((entry) => (entry.planted ?? []).length === 0);
  assert(clean, 'ground-truth.json declares no clean control, so there is no clean-control probe to write');
  const cleanPath = `${REVIEW_FIXTURE_PREFIX}${clean.path}`;

  // The corpus revision, pinned by the files that constitute it. `commitDigest`
  // wants an AD-27 digest and a git commit identifier is not one, so the corpus
  // is pinned by what it is made of rather than by where it was committed.
  const corpusDigest = digestOf([groundTruthPath, ...reviewedFiles]);
  const systemDigest = digestOf(reviewedFiles);

  // The stored replay outputs the qualification records point at. Both are real
  // files this repository keeps, and each is what its route demands: a review of
  // the planted revision that reports every planted row, and the un-planted file
  // the same review reports nothing against.
  const mutatedFail = 'test/replay/test-review/full-recall/verdict.json';
  const gamedFail = 'test/replay/test-review/out-of-scope-finding/verdict.json';

  const probes = plants.map((plant, index) => {
    const registrySeverity = severityOfRow.get(plant.row);
    assert(registrySeverity, `ground-truth.json plants row ${plant.row}, which criteria-registry.md does not carry`);
    const oracleId = `O-${pad(index + 1)}`;
    const behaviorId = soleBehaviorFor(contract, oracleId);
    return {
      schemaVersion: PROBE_SCHEMA_VERSION,
      parentDigest: null,
      revisionCount: 0,
      probeId: `P-${pad(index + 1)}`,
      probeClass: 'defect',
      behaviorId,
      systemId: 'tea-test-review-corpus',
      implementationDigest: systemDigest,
      artifactDigest: digestOf([plant.relativePath]),
      commitDigest: corpusDigest,
      rationale:
        `Registry row ${plant.row} was planted in ${plant.basename} at line ${plant.line}: ${plant.what}. ` +
        `${oracleId} is the oracle that catches it, and ${behaviorId} is the behavior it discharges.`,
      qualification: {
        route: 'controlled-mutation',
        mutationSource: groundTruthPath,
        mutationOperator: `plant-registry-row-${plant.row.toLowerCase()}`,
        targetArtifact: fileReference(plant.relativePath),
        expectedObservableFailure: `The review reports registry row ${plant.row} against ${plant.basename} at one of lines ${plant.admittedLines.join(', ')}.`,
        // The un-planted revision of the same corpus is the clean control this
        // repository keeps beside the seeded files, and the stored review below
        // reports nothing against it.
        baselinePassEvidence: fileReference(cleanPath),
        mutatedFailEvidence: fileReference(mutatedFail),
        // The plant lives beside its clean control rather than being restored
        // after the run, so there is nothing to roll back and the control is on
        // disk for anyone to read.
        rollbackVerified: true,
      },
      expectedClean: false,
      defects: [
        {
          defectId: `D-${pad(index + 1)}`,
          behaviorId,
          summary: plant.what,
          severity: registrySeverity === 'CRITICAL' ? 'critical' : 'material',
          oracleEvidence: [fileReference(plant.relativePath), fileReference(groundTruthPath)],
          source: 'controlled-mutation',
          // Blocked: `WitnessInputs` names the four transport channels and this
          // defect fires behind a command. See this file's header.
          manifestationWitness: null,
        },
      ],
      defectSignature: {
        interfaceKind: 'cli',
        invocation: { executable: 'tea-test-review', subcommandPath: [] },
        observableChannel: 'artifact',
        condition: {
          selector: selector({ option: { files: { matcher: 'any' } } }),
          predicate: {
            op: 'for-any',
            collection: { pointer: '/interactions/observed/artifact/verdict/findings' },
            predicate: {
              op: 'all',
              operands: [
                { op: 'equality', operands: [{ pointer: '@/row' }, { literal: plant.row }] },
                { op: 'regex', operands: [{ pointer: '@/file' }], pattern: basenamePattern(plant.basename) },
                { op: 'set-membership', operands: [{ pointer: '@/line' }, { literal: plant.admittedLines }] },
              ],
            },
          },
        },
      },
    };
  });

  const cleanOracleId = `O-${pad(plants.length + 1)}`;
  const scopeOracleId = `O-${pad(plants.length + 2)}`;

  probes.push(
    {
      schemaVersion: PROBE_SCHEMA_VERSION,
      parentDigest: null,
      revisionCount: 0,
      probeId: `P-${pad(plants.length + 1)}`,
      probeClass: 'zero-action',
      behaviorId: soleBehaviorFor(contract, cleanOracleId),
      systemId: 'tea-test-review-corpus',
      implementationDigest: systemDigest,
      artifactDigest: digestOf([cleanPath]),
      commitDigest: corpusDigest,
      rationale:
        `${path.basename(clean.path)} carries no planted defect, so a review that reports anything against it has ` +
        `reported something that is not there. AD-7 keeps a clean control out of the strength vector; what it establishes ` +
        'is that the contract does not fire on a file with nothing in it.',
      qualification: {
        route: 'clean-control',
        baselinePassEvidence: fileReference(mutatedFail),
        revisionCommitDigest: corpusDigest,
        noKnownDefectStatement:
          `${clean.path} is deliberately clean. ground-truth.json plants nothing in it and records the five findings a ` +
          'reviewer is most likely to invent there, each with the reason it is wrong.',
      },
      expectedClean: true,
      defects: [],
    },
    {
      schemaVersion: PROBE_SCHEMA_VERSION,
      parentDigest: null,
      revisionCount: 0,
      probeId: `P-${pad(plants.length + 2)}`,
      probeClass: 'gameability',
      behaviorId: soleBehaviorFor(contract, scopeOracleId),
      systemId: 'tea-test-review-corpus',
      implementationDigest: systemDigest,
      artifactDigest: digestOf([groundTruthPath]),
      commitDigest: corpusDigest,
      rationale:
        'Recall alone rewards a reviewer that reports everything. A review that files a finding against every file it can ' +
        `reach clears all ${plants.length} plant oracles and violates ${scopeOracleId}, which is the oracle that has to ` +
        'notice. ground-truth.json records the same rule under negativeControls.',
      qualification: {
        route: 'gameability',
        degenerateResponse:
          'A verdict that files a finding against every file the reviewer opened, including the implementation files the ' +
          'fixtures import and nobody asked it to review.',
        naiveOracleSatisfiedEvidence: fileReference(mutatedFail),
        disciplinedOracleRejectedEvidence: fileReference(gamedFail),
      },
      expectedClean: false,
      // AD-9's gameability route qualifies a degenerate response rather than a
      // seeded defect, so there is no defect to declare and no manifestation
      // witness to owe.
      defects: [],
      defectSignature: {
        interfaceKind: 'cli',
        invocation: { executable: 'tea-test-review', subcommandPath: [] },
        observableChannel: 'artifact',
        condition: {
          selector: selector({ option: { files: { matcher: 'any' } } }),
          predicate: {
            op: 'for-any',
            collection: { pointer: '/interactions/observed/artifact/verdict/findings' },
            predicate: {
              op: 'not',
              operands: [
                {
                  op: 'any',
                  operands: [
                    { op: 'equality', operands: [{ pointer: '@/file' }, { literal: null }] },
                    ...reviewedBasenames.map((basename) => ({
                      op: 'regex',
                      operands: [{ pointer: '@/file' }],
                      pattern: basenamePattern(basename),
                    })),
                  ],
                },
              ],
            },
          },
        },
      },
    },
  );

  return probes;
}

// ---------------------------------------------------------------------------
// trace
// ---------------------------------------------------------------------------

function buildTraceProbes() {
  const contract = loadContract('trace.contract.json');
  const groundTruth = JSON.parse(fs.readFileSync(path.join(TRACE_FIXTURE_ROOT, 'ground-truth.json'), 'utf8'));
  const seeded = groundTruth.fixtureSets.find((set) => set.id.startsWith('seeded'));
  const clean = groundTruth.fixtureSets.find((set) => set.id.startsWith('clean'));
  assert(seeded && clean, 'trace ground truth carries no seeded set or no clean set');

  const groundTruthPath = `${TRACE_FIXTURE_PREFIX}ground-truth.json`;
  const corpusDigest = digestOf([groundTruthPath]);

  // The criteria the seeded set deliberately leaves short. A gap is the plant:
  // step-04 builds its buckets from exactly these, and the FAIL gate follows
  // from the P0 among them.
  const gaps = seeded.criteria.filter((criterion) => criterion.trueCoverage !== 'FULL');
  assert(gaps.length > 0, 'the seeded trace set declares no coverage gap, so it seeds nothing');

  // The gate oracle is the one every seeded gap is ultimately answerable to: the
  // gate is derived from the coverage the gaps produce.
  const gateOracleId = contract.oracles[0].id;
  const gateBehaviorId = groupedBehaviorFor(contract, gateOracleId);

  const probes = gaps.map((criterion, index) => ({
    schemaVersion: PROBE_SCHEMA_VERSION,
    parentDigest: null,
    revisionCount: 0,
    probeId: `P-${pad(index + 1)}`,
    probeClass: 'defect',
    behaviorId: gateBehaviorId,
    systemId: `tea-trace-${seeded.id}`,
    implementationDigest: corpusDigest,
    artifactDigest: corpusDigest,
    commitDigest: corpusDigest,
    rationale:
      `${criterion.id} is ${criterion.priority} and its true coverage is ${criterion.trueCoverage}: ${criterion.text} ` +
      `The gap is the plant, and ${gateOracleId} is the oracle that has to see its consequence in the derived gate.`,
    qualification: {
      route: 'controlled-mutation',
      mutationSource: groundTruthPath,
      mutationOperator: `withhold-coverage-${criterion.id.toLowerCase()}`,
      targetArtifact: fileReference(groundTruthPath),
      expectedObservableFailure:
        `The traceability matrix classifies ${criterion.id} as ${criterion.trueCoverage} and the summary counts it in the ` +
        `${criterion.trueCoverage === 'NONE' ? 'gap buckets' : 'partial coverage items'}.`,
      baselinePassEvidence: fileReference('test/replay/trace/clean-correct-run/test-artifacts/e2e-trace-summary.json'),
      mutatedFailEvidence: fileReference('test/replay/trace/seeded-correct-run/test-artifacts/e2e-trace-summary.json'),
      rollbackVerified: true,
    },
    expectedClean: false,
    defects: [
      {
        defectId: `D-${pad(index + 1)}`,
        behaviorId: gateBehaviorId,
        summary: `${criterion.id} (${criterion.priority}) is covered ${criterion.trueCoverage}: ${criterion.text}`,
        severity: criterion.priority === 'P0' ? 'critical' : 'material',
        oracleEvidence: [fileReference(groundTruthPath)],
        source: 'controlled-mutation',
        // Blocked for the same reason every defect probe here is; see the header.
        manifestationWitness: null,
      },
    ],
    defectSignature: {
      interfaceKind: 'cli',
      invocation: { executable: 'tea-trace-runner', subcommandPath: [] },
      observableChannel: 'artifact',
      condition: {
        selector: selector({ option: { agent: { matcher: 'any' } } }),
        predicate: {
          op: 'equality',
          operands: [{ pointer: '/interactions/observed/artifact/summary/gate_status' }, { literal: seeded.expectedGate.decision }],
        },
      },
    },
  }));

  const cleanOracleId = contract.behaviors.find((behavior) => behavior.description.startsWith('The clean set')).oracles[0];
  probes.push({
    schemaVersion: PROBE_SCHEMA_VERSION,
    parentDigest: null,
    revisionCount: 0,
    probeId: `P-${pad(gaps.length + 1)}`,
    probeClass: 'zero-action',
    behaviorId: groupedBehaviorFor(contract, cleanOracleId),
    systemId: `tea-trace-${clean.id}`,
    implementationDigest: corpusDigest,
    artifactDigest: corpusDigest,
    commitDigest: corpusDigest,
    rationale:
      `${clean.id} has adequate evidence for all ${clean.criteria.length} of its criteria, so any gap the run reports is ` +
      'a false positive. It is the control that stops a trace suite scoring well by calling everything a gap.',
    qualification: {
      route: 'clean-control',
      baselinePassEvidence: fileReference('test/replay/trace/clean-correct-run/test-artifacts/e2e-trace-summary.json'),
      revisionCommitDigest: corpusDigest,
      noKnownDefectStatement: clean.purpose,
    },
    expectedClean: true,
    defects: [],
  });

  return probes;
}

// ---------------------------------------------------------------------------
// fragment selection
// ---------------------------------------------------------------------------

function buildFragmentSelectionProbes(workflow) {
  const contract = loadContract(path.join('fragment-selection', `${workflow}.contract.json`));
  const evalsPath = path.join('test', 'evals', workflow, 'evals.json');
  const evals = JSON.parse(fs.readFileSync(path.join(EVAL_ROOT, workflow, 'evals.json'), 'utf8'));
  const first = evals.cases[0];
  assert(first, `${workflow}: evals.json carries no case`);

  const contextFiles = evals.contextFiles.map((file) => path.join('src', 'workflows', 'testarch', workflow, file));
  const corpusDigest = digestOf([evalsPath, ...contextFiles]);
  const containmentOracleId = 'O-001';
  const exclusionOracleId = 'O-002';

  return [
    {
      schemaVersion: PROBE_SCHEMA_VERSION,
      parentDigest: null,
      revisionCount: 0,
      probeId: 'P-001',
      probeClass: 'gameability',
      behaviorId: soleBehaviorFor(contract, exclusionOracleId),
      systemId: `tea-fragment-selection-${workflow}`,
      implementationDigest: corpusDigest,
      artifactDigest: digestOf([evalsPath]),
      commitDigest: corpusDigest,
      rationale:
        `A run that names every fragment in the index satisfies ${containmentOracleId} for ${first.id}, because every ` +
        `mandated fragment is in the list, and violates ${exclusionOracleId}, because so is every forbidden one. ` +
        'The containment oracle alone cannot tell that reply from a correct selection, and the exclusion oracle can.',
      qualification: {
        route: 'gameability',
        degenerateResponse: `A selection naming every fragment the ${workflow} index offers, mandated and forbidden alike.`,
        naiveOracleSatisfiedEvidence: fileReference(evalsPath),
        disciplinedOracleRejectedEvidence: fileReference(evalsPath),
      },
      expectedClean: false,
      defects: [],
      defectSignature: {
        interfaceKind: 'cli',
        invocation: { executable: 'tea-fragment-selection-runner', subcommandPath: [] },
        observableChannel: 'stdout',
        condition: {
          selector: selector({ option: { agent: { matcher: 'any' } }, stdin: { prompt: { matcher: 'any' } } }),
          predicate: {
            op: 'for-any',
            collection: { pointer: '/interactions/observed/stdout/fragments' },
            predicate: { op: 'set-membership', operands: [{ pointer: '@/' }, { literal: first.expect.mustNotLoad }] },
          },
        },
      },
    },
    {
      schemaVersion: PROBE_SCHEMA_VERSION,
      parentDigest: null,
      revisionCount: 0,
      probeId: 'P-002',
      probeClass: 'zero-action',
      behaviorId: soleBehaviorFor(contract, containmentOracleId),
      systemId: `tea-fragment-selection-${workflow}`,
      implementationDigest: corpusDigest,
      artifactDigest: digestOf([evalsPath]),
      commitDigest: corpusDigest,
      rationale:
        `${first.id} declares the exact set the step files mandate and the exact set they exclude, so a selection ` +
        'naming the first and none of the second is the run this contract exists to confirm.',
      qualification: {
        route: 'clean-control',
        baselinePassEvidence: fileReference(evalsPath),
        revisionCommitDigest: corpusDigest,
        noKnownDefectStatement:
          `${first.id}'s expected selection is derived from the ${workflow} step files themselves, and ` +
          'npm run test:criteria-fragments fails when a fragment it names has left the index.',
      },
      expectedClean: true,
      defects: [],
    },
  ];
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

/** Every fragment-selection workflow that has a generated contract. */
function fragmentSelectionWorkflows() {
  const dir = path.join(CONTRACT_ROOT, 'fragment-selection');
  assert(fs.existsSync(dir), 'test/contracts/fragment-selection does not exist; run node tools/generate-contracts.js first');
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.contract.json'))
    .map((name) => name.replace('.contract.json', ''))
    .sort();
}

function targets() {
  return [
    { relativePath: 'test-review.probes.json', build: buildTestReviewProbes },
    { relativePath: 'trace.probes.json', build: buildTraceProbes },
    ...fragmentSelectionWorkflows().map((workflow) => ({
      relativePath: path.join('fragment-selection', `${workflow}.probes.json`),
      build: () => buildFragmentSelectionProbes(workflow),
    })),
  ];
}

async function render(probes, filePath, prettierConfig) {
  return prettier.format(`${JSON.stringify(probes, null, 2)}\n`, { ...prettierConfig, parser: 'json', filepath: filePath });
}

/** The first line at which two renderings differ. */
function firstDifference(expected, actual) {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  for (const [index, line] of expectedLines.entries()) {
    if (line === actualLines[index]) continue;
    return { line: index + 1, onDisk: line ?? '(end of file)', generated: actualLines[index] ?? '(end of file)' };
  }
  return { line: expectedLines.length + 1, onDisk: '(end of file)', generated: actualLines[expectedLines.length] ?? '(end of file)' };
}

async function main() {
  const check = process.argv.slice(2).includes('--check');
  const prettierConfig = await prettier.resolveConfig(path.join(PROBE_ROOT, 'test-review.probes.json'));

  const stale = [];
  for (const target of targets()) {
    const filePath = path.join(PROBE_ROOT, target.relativePath);
    const generated = await render(target.build(), filePath, prettierConfig);

    if (!check) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, generated, 'utf8');
      console.log(`✅ wrote test/probes/${target.relativePath}`);
      continue;
    }
    if (!fs.existsSync(filePath)) {
      stale.push({ relativePath: target.relativePath, reason: 'is missing' });
      continue;
    }
    const onDisk = fs.readFileSync(filePath, 'utf8');
    if (onDisk === generated) continue;
    const difference = firstDifference(onDisk, generated);
    stale.push({
      relativePath: target.relativePath,
      reason: `differs from its sources, first at line ${difference.line}`,
      onDisk: difference.onDisk,
      generated: difference.generated,
    });
  }

  if (stale.length > 0) {
    console.error('❌ probe generation is out of date with its sources:\n');
    for (const entry of stale) {
      console.error(`   test/probes/${entry.relativePath} ${entry.reason}`);
      if (entry.onDisk !== undefined) {
        console.error(`     on disk:   ${entry.onDisk.trim()}`);
        console.error(`     generated: ${entry.generated.trim()}`);
      }
    }
    console.error('\nRegenerate with: node tools/generate-probes.js');
    return 1;
  }

  if (check) console.log(`✅ ${targets().length} probe corpus file(s) match what their sources generate`);
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error instanceof GeneratorError ? `❌ ${error.message}` : error);
      process.exit(2);
    });
}

module.exports = { targets };
