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
 * coverage gaps are the plant and a clean set that is the control;
 * `test/fixtures/nfr-eval/ground-truth.json` carries an evidence bundle whose
 * domains are undecidable or breached and a clean bundle that is the control;
 * `test/fixtures/test-design-eval/ground-truth.json` carries the risks each epic
 * supports and the risks each epic rules out in as many words; each
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
 * One kind of probe TEA can honestly author is refused by `eval-quality`, and the
 * refusal is recorded in `test/probes/expected-strength.json` rather than avoided
 * by writing a weaker probe. A second was, and is recorded here with what closed
 * it:
 *
 * - A defect signature cannot address a file the command wrote. An `artifact`
 *   pointer is refused as `condition-artifact-channel-contract-local`, because an
 *   artifact identifier is minted per contract and a signature carrying one
 *   resolves only against the contract it was authored on. A `stdout` pointer
 *   resolves only where the operation declares standard output as its descriptor
 *   channel. `tea-fragment-selection-runner` does, so its signatures address the
 *   selection itself. `tea-test-review`, `tea-trace-runner`, `tea-nfr-runner` and
 *   `tea-test-design-runner` all write their deliverable to a file, so a
 *   signature that reads it is refused, and what is left is the exit code. For
 *   `tea-test-review` that discriminates: the seeded fixture exits 1 and the
 *   clean control exits 0, so the condition is false on a review that found
 *   nothing gating. For the other three it does not: every completed trace run,
 *   every completed audit and every completed design run exits 0 whatever it
 *   wrote, so their probes keep the signature that states the truth about the
 *   plant and are recorded as refused rather than given one that would qualify
 *   and discriminate nothing.
 * - `seeded-faults-scoped` treats every leg already registered for an operation
 *   as a clean leg, and the only legs a TEA contract registers are its sensitivity
 *   witness legs. `test-review`'s differential drives one leg at a seeded fixture
 *   and `trace`'s drove both at the seeded set, so a plant in a file a witness leg
 *   reviews fired on a leg AD-10 calls clean: five of the nine review plants and
 *   all three trace plants. Both halves are closed. `eval-quality` 1.4.0 drops a
 *   clean leg that issued the fault leg's own request and received its answer,
 *   which cleared the five review plants, and `trace`'s witness legs now stage the
 *   clean set, which cleared its three. Every probe the deterministic gate scores
 *   pre-flights.
 * - `test-design` is scored by the deterministic gate. `test/lib/probe-scoring.js`
 *   declares one evidence source per suite; `testDesignEvidence` answers each leg
 *   from the documents already stored under `test/replay/test-design/`, which
 *   every probe below cites, and the `test-design` entry in `suites()` puts the
 *   corpus in front of `npm run test:probe-corpus`. `expected-strength.json`
 *   carries its sixteen probes. All sixteen record null strength: the
 *   qualification gate refuses every one with
 *   `condition-artifact-channel-contract-local`, and fourteen of them also fail
 *   pre-flight with `seeded-fault-fired` at exit 3. P-011 and P-016 are the two
 *   that clear pre-flight.
 *
 * Usage: node tools/generate-probes.js [--check]
 * Exit codes: 0 = written or up to date, 1 = a corpus is stale, 2 = the generator could not run
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const prettier = require('prettier');

const { loadCorpus } = require('../test/lib/corpus-port');
const { parseRegistryRows } = require('./validate-criteria-fragments');
// The prompt a trace manifestation witness sends is the prompt the harness
// assembles, for the reason tools/generate-contracts.js reads the same function
// for the contract's own witness legs: a leg carrying a description of a prompt
// is scheduled by pre-flight and then measures nothing. The test-design witness
// legs below read their own harness's buildPrompt on the same rule.
const { buildPrompt: buildTracePrompt } = require('../test/eval-trace');
const { DEFAULT_AGENT: TRACE_DEFAULT_AGENT } = require('../cli/trace-runner');
// And the same for the nfr command: the prompt a manifestation witness sends is
// the prompt the harness assembles, and the domain names and the UNKNOWN spelling
// are the harness's own, so a probe and the contract it names cannot spell one of
// them differently.
const {
  buildPrompt: buildNfrPrompt,
  DOMAINS: NFR_DOMAINS,
  UNKNOWN_TOKEN: NFR_UNKNOWN_TOKEN,
  NFR_INTERFACE,
  NFR_OPERATION,
} = require('../test/eval-nfr');
const { DEFAULT_AGENT: NFR_DEFAULT_AGENT } = require('../cli/nfr-runner');
// The routing probes name the oracle they game by the pointer it reads, which is
// how they stay attached to the right oracle when a case is added to the corpus
// and every id after it shifts.
const { ROUTING_CONTRACTS } = require('./generate-contracts');
const { buildPrompt: buildTestDesignPrompt, TEST_DESIGN_INTERFACE, TEST_DESIGN_OPERATION } = require('../test/eval-test-design');
const { DEFAULT_AGENT: TEST_DESIGN_DEFAULT_AGENT } = require('../cli/test-design-runner');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONTRACT_ROOT = path.join(PROJECT_ROOT, 'test', 'contracts');
const PROBE_ROOT = path.join(PROJECT_ROOT, 'test', 'probes');
const EVAL_ROOT = path.join(PROJECT_ROOT, 'test', 'evals');
const REVIEW_FIXTURE_ROOT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-review-eval');
const TRACE_FIXTURE_ROOT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'trace-eval');
const NFR_FIXTURE_ROOT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'nfr-eval');
const ROUTING_FIXTURE_ROOT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'tea-routing-eval');
const TEST_DESIGN_FIXTURE_ROOT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-design-eval');
const TEST_DESIGN_REPLAY_ROOT = path.join(PROJECT_ROOT, 'test', 'replay', 'test-design');
const REVIEW_FIXTURE_PREFIX = 'test/fixtures/test-review-eval/';
const TRACE_FIXTURE_PREFIX = 'test/fixtures/trace-eval/';
const NFR_FIXTURE_PREFIX = 'test/fixtures/nfr-eval/';
const TEST_DESIGN_FIXTURE_PREFIX = 'test/fixtures/test-design-eval/';
const TEST_DESIGN_REPLAY_PREFIX = 'test/replay/test-design/';

/** The Probe schema version this generator writes. A bump arrives as a parse failure on the first run after an upgrade. */
const PROBE_SCHEMA_VERSION = 5;

/** The agent a witness leg names. The same value the contract's own witness legs carry, so a leg differs from them only in what it reviews. */
const DEFAULT_REVIEW_AGENT = 'claude';

/** `tea-test-review` exits 1 on a blocking verdict and 0 on an approving one. Both are measured verdicts; only the first says a gating defect was found. */
const GATING_EXIT_CODE = 1;

class GeneratorError extends Error {}

function assert(condition, message) {
  if (!condition) throw new GeneratorError(message);
}

const pad = (n) => String(n).padStart(3, '0');

/**
 * One repository-relative path in the spelling the generated corpus carries.
 *
 * POSIX separators always, because this string is hashed beside the file's bytes
 * and stored in the probe. A Windows checkout would otherwise regenerate every
 * digest and every stored path, and `npm run test:probe-sources` would report a
 * stale corpus on a tree nobody had touched. On POSIX it is the identity, so no
 * committed byte moves.
 */
function repositoryPath(...segments) {
  return path
    .join(...segments)
    .split(path.sep)
    .join('/');
}

/**
 * The corpus this generator digests from, resolved through `eval-quality`'s
 * corpus port before any probe is built.
 *
 * `main` loads it and every `digestOf` below reads from it, which is what makes
 * the bytes behind every attested digest come from the certified resolver rather
 * than from this file's own `readFileSync`. The hash is unchanged, so no
 * committed digest moves.
 *
 * Set rather than read lazily because the builders are synchronous and the port
 * is not. A path outside the loaded set is a named error rather than a silent
 * read, which is stricter than what it replaces: the old helper would digest any
 * file in the repository.
 */
let corpus;

/** Every file under one repository directory, as repository-relative references. */
function filesUnder(...segments) {
  const root = path.join(PROJECT_ROOT, ...segments);
  if (!fs.existsSync(root)) return [];
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      // Regular files only. A symlink or a socket under one of these trees is
      // not a corpus member, and loading one would fail the generator over a
      // file no probe digests.
      else if (entry.isFile()) found.push(repositoryPath(path.relative(PROJECT_ROOT, full)));
    }
  };
  walk(root);
  return found;
}

/**
 * Every member this generator may digest.
 *
 * Four trees, walked, plus the workflow step files each fragment-selection case
 * cites. The step files are named by `evals.json` rather than walked, because a
 * workflow directory holds a great deal this corpus is not made of. The trees
 * are walked rather than enumerated because their contents are the corpus: a
 * fixture added to one of them is a member the next run must digest, and a list
 * would have to be updated by somebody remembering to.
 */
function corpusMembers() {
  const contextFiles = fragmentSelectionWorkflows().flatMap((workflow) => {
    const evals = JSON.parse(fs.readFileSync(path.join(EVAL_ROOT, workflow, 'evals.json'), 'utf8'));
    return (evals.contextFiles ?? []).map((file) => repositoryPath('src', 'workflows', 'testarch', workflow, file));
  });
  return [
    // Whole trees rather than named fixture directories, so a suite that brings
    // its own fixtures is a member of this corpus the day it lands rather than
    // the day somebody remembers to name it here. That is not hypothetical: the
    // routing suite arrived with `test/fixtures/tea-routing-eval` while this
    // named two fixture trees by hand.
    ...filesUnder('test', 'fixtures'),
    ...filesUnder('test', 'replay'),
    ...filesUnder('test', 'evals'),
    // Files outside those trees, named because their directories hold a great
    // deal this corpus is not made of: the workflow step files each
    // fragment-selection case cites, and the agent definition the routing probes
    // digest.
    ...contextFiles,
    repositoryPath('src', 'agents', 'bmad-tea', 'SKILL.md'),
    repositoryPath('src', 'agents', 'bmad-tea', 'customize.toml'),
  ];
}

/** `sha256:<hex>` over the named corpus members, in the order given. */
function digestOf(relativePaths) {
  assert(corpus !== undefined, 'the corpus has not been loaded, so nothing can be digested; main loads it before any probe is built');
  return corpus.digest(relativePaths);
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

/**
 * The nine input channels a defect signature's selector declares, with only the
 * ones named bound.
 *
 * `arguments` is the ninth, added by the Probe schema's version 5 bump so a
 * signature against a tool call can filter on what the call supplied. TEA
 * declares the `cli` interface kind only and binds none of it, and the channel
 * is required with no default, so every selector states it as null the same way
 * it states the seven other channels it does not bind.
 */
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
      arguments: null,
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
          // What pre-flight probes to see this plant fire: one review of the file
          // it was planted in, and the verdict naming its row at a line the ground
          // truth admits. The relation reads the artifact the review wrote, which
          // the witness may do and a defect signature may not.
          manifestationWitness: {
            legId: `manifest-${plant.row.toLowerCase()}`,
            interfaceId: 'tea-test-review',
            operationId: 'review-test-files',
            inputs: {
              argument: {},
              option: { files: plant.relativePath, json: 'verdict.json', agent: DEFAULT_REVIEW_AGENT },
              environment: {},
              stdin: { kind: 'absent' },
            },
            relation: {
              op: 'for-any',
              collection: { pointer: `/interactions/manifest-${plant.row.toLowerCase()}/artifact/verdict/findings` },
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
      ],
      // The exit code, because the vocabulary refuses everything else this
      // command produces; see the header. It discriminates: a review that finds a
      // gating defect exits 1 and one that finds none exits 0, so the condition is
      // false on the clean control. It does not discriminate WHICH row, so the
      // per-row attribution is the designated oracle's and the finding's rather
      // than the signature's, and that is the weaker guarantee this contract gets
      // until a signature can address a written artifact.
      defectSignature: {
        interfaceKind: 'cli',
        invocation: { executable: 'tea-test-review', subcommandPath: [] },
        observableChannel: 'exit-code',
        condition: {
          selector: selector({ option: { files: { matcher: 'any' } } }),
          predicate: { op: 'equality', operands: [{ pointer: '/interactions/observed/exit-code' }, { literal: GATING_EXIT_CODE }] },
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
  const gateBehaviorId = soleBehaviorFor(contract, gateOracleId);

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
        // One run of the seeded set, and the summary's own priority arithmetic
        // showing the gap. The percentage is the criterion's priority band read
        // off the ground truth rather than transcribed, so a criterion that
        // changes band moves this relation with it.
        manifestationWitness: {
          legId: `manifest-${criterion.id.toLowerCase()}`,
          interfaceId: 'tea-trace-runner',
          operationId: 'trace-fixture-set',
          inputs: {
            argument: {},
            option: { agent: TRACE_DEFAULT_AGENT },
            environment: {},
            stdin: { kind: 'text', value: buildTracePrompt(seeded) },
          },
          relation: {
            op: 'equality',
            operands: [
              {
                pointer: `/interactions/manifest-${criterion.id.toLowerCase()}/artifact/summary/coverage/priority_breakdown/${criterion.priority}/pct`,
              },
              { literal: seeded.coverageArithmetic.priority[criterion.priority].expectedPct },
            ],
          },
        },
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

  // The clean set's own behaviors are the ones whose requirement link names it.
  const cleanBehavior = contract.behaviors.find((behavior) => behavior.requirementLinks.some((link) => link.id.startsWith(`${clean.id}/`)));
  assert(cleanBehavior, `trace.contract.json declares no behavior linked to ${clean.id}`);
  probes.push({
    schemaVersion: PROBE_SCHEMA_VERSION,
    parentDigest: null,
    revisionCount: 0,
    probeId: `P-${pad(gaps.length + 1)}`,
    probeClass: 'zero-action',
    behaviorId: cleanBehavior.id,
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
// test-design
// ---------------------------------------------------------------------------

/** The pointer a test-design oracle reads: one step's design document, whole. */
function testDesignArtifactPointer(stepId) {
  return `/interactions/${stepId}/artifact/design`;
}

/** The same document as the reserved observation a defect signature addresses. */
const OBSERVED_DESIGN_POINTER = testDesignArtifactPointer('observed');

/** One expression with every pointer equal to `from` rewritten to `to`, and nothing else touched. */
function repointed(node, from, to) {
  if (Array.isArray(node)) return node.map((entry) => repointed(entry, from, to));
  if (node === null || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, key === 'pointer' && value === from ? to : repointed(value, from, to)]),
  );
}

/**
 * The negation of one oracle check, with a double negative collapsed.
 *
 * An unsupported-vocabulary oracle is already spelled `not(matcher)`, so wrapping
 * it again would state the defect as "it is not the case that the document does
 * not carry this vocabulary". The collapsed form is the same predicate and it is
 * the one a reader can check.
 */
function negated(expression) {
  if (expression.op === 'not' && expression.operands.length === 1) return expression.operands[0];
  return { op: 'not', operands: [expression] };
}

/**
 * "This document is the one written for the epic that carries the risk."
 *
 * A manifestation witness is re-resolved against every other leg of its operation
 * to establish that the fault is scoped to the leg carrying it, and the only thing
 * in a test design document that says which fixture set produced it is the epic
 * number: `test-design-template.md` renders it into the title and into the Scope
 * line. Without this conjunct a witness asserting an absence would fire on any
 * document about any other feature, which establishes nothing about scope. The
 * number is read off the corpus rather than written here.
 */
function testDesignEpicMarker(pointer, epicNum) {
  assert(/^\d+$/.test(String(epicNum)), `a fixture set declares epicNum ${JSON.stringify(epicNum)}, which is not a number`);
  return { op: 'regex', operands: [{ pointer }], pattern: String.raw`^[\s\S]*Epic\s+${epicNum}[\s\S]*$` };
}

/**
 * Every stored test-design run, with the fixture set it was scored against and
 * the outcome `test/test-eval-replay.js` records for it.
 *
 * These are the same files that suite replays, read here for their recorded
 * result rather than re-scored: `result.mentions` is `documentMentions`, which is
 * the predicate every vocabulary oracle in this contract is paired with, so a
 * stored run says directly whether an oracle holds on it. That is what lets each
 * probe below name evidence instead of describing a run nobody kept.
 */
function testDesignReplayCases() {
  assert(fs.existsSync(TEST_DESIGN_REPLAY_ROOT), 'test/replay/test-design does not exist, so no stored run evidences a test-design probe');
  const cases = fs
    .readdirSync(TEST_DESIGN_REPLAY_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((id) => {
      const expectedPath = `${TEST_DESIGN_REPLAY_PREFIX}${id}/expected.json`;
      const absolute = path.join(PROJECT_ROOT, expectedPath);
      assert(fs.existsSync(absolute), `${expectedPath} does not exist, so ${id} records no scored outcome`);
      const stored = JSON.parse(fs.readFileSync(absolute, 'utf8'));
      return {
        id,
        setId: stored.inputs.fixtureSet,
        result: stored.result,
        expectedPath,
        designPath: `${TEST_DESIGN_REPLAY_PREFIX}${id}/${stored.storedOutput.design}`,
      };
    });
  assert(cases.length > 0, 'test/replay/test-design stores no run, so there is nothing to evidence a probe with');
  return cases;
}

/**
 * Did every check the harness makes pass on this stored run?
 *
 * The reference run of each fixture set is read off its recorded outcome rather
 * than recognised by its directory name. Every other seeded case is a one-edit
 * mutation of it and four of them leave the document-global reading untouched, so
 * "the run whose oracles all hold" does not identify it and "the run with nothing
 * wrong anywhere" does.
 */
function testDesignRunPassed(result) {
  if (result.unmeasurable !== undefined) return false;
  return (
    result.shapeFailures.length === 0 &&
    result.links.dangling.length === 0 &&
    result.grounding.missed.length === 0 &&
    result.grounding.matched === result.grounding.declared &&
    result.ungrounded.length === 0 &&
    result.coverage.failures.length === 0 &&
    result.ordering.failures.length === 0 &&
    result.ordering.satisfied === result.ordering.resolvable &&
    result.ordering.resolvable === result.ordering.pairs &&
    (result.ceiling === null || result.ceiling.excess === 0) &&
    result.grounding.topSeverityMissed === 0 &&
    result.shape.bandOk === result.shape.banded
  );
}

/**
 * Whether one oracle holds on one stored run, or null when the run records no
 * answer for it.
 *
 * A run the harness refused as unparseable never reached `documentMentions`, so a
 * vocabulary oracle has no recorded reading there and the run is left out of that
 * oracle's evidence rather than counted as a violation it did not record.
 */
function testDesignOracleHolds(entry, result) {
  if (entry.kind === 'run-measured') return result.unmeasurable === undefined && result.shape.rows > 0;
  if (result.unmeasurable !== undefined) return null;
  const mentioned = result.mentions[entry.risk.id];
  assert(typeof mentioned === 'boolean', `a stored run records no mention of ${entry.risk.id}, which ${entry.oracleId} reads`);
  return entry.kind === 'material-vocabulary' ? mentioned : !mentioned;
}

/**
 * Every oracle `test-design.contract.json` states, paired with the corpus entry
 * `tools/generate-contracts.js` generated it from.
 *
 * The pairing is recomputed from the same ground truth rather than parsed out of
 * an oracle's commentary, and then checked against the contract on disk: an
 * oracle whose evidence target names a different fixture set, or whose check has
 * the wrong polarity for the entry it landed on, fails the generator instead of
 * producing a probe about an oracle it has nothing to do with. The order is the
 * contract's own, so P-NNN, B-NNN and O-NNN are one row of the same table for the
 * first fifteen probes.
 */
function testDesignOracleIndex(contract, sets) {
  const entries = [];
  for (const set of sets) {
    entries.push({ set, kind: 'run-measured', risk: null });
    for (const risk of set.materialRisks ?? []) entries.push({ set, kind: 'material-vocabulary', risk });
    for (const risk of set.unsupportedRisks ?? []) entries.push({ set, kind: 'unsupported-vocabulary', risk });
  }
  assert(
    entries.length === contract.oracles.length,
    `test-design.contract.json states ${contract.oracles.length} oracle(s) and the corpus accounts for ${entries.length}; run node tools/generate-contracts.js`,
  );
  return entries.map((entry, position) => {
    const oracleId = `O-${pad(position + 1)}`;
    const oracle = contract.oracles.find((candidate) => candidate.id === oracleId);
    assert(oracle, `test-design.contract.json states no ${oracleId}`);
    const pointer = testDesignArtifactPointer(`design-${entry.set.id}`);
    assert(
      oracle.direction.evidenceTargets.length === 1 && oracle.direction.evidenceTargets[0] === pointer,
      `${oracleId} reads ${oracle.direction.evidenceTargets.join(', ')} and the corpus places ${entry.set.id}, which reads ${pointer}, there`,
    );
    assert(
      (oracle.check.op === 'not') === (entry.kind === 'unsupported-vocabulary'),
      `${oracleId} is a "${oracle.check.op}" check and the corpus places a ${entry.kind} oracle there`,
    );
    return { ...entry, oracleId, oracle, pointer, behaviorId: soleBehaviorFor(contract, oracleId) };
  });
}

/**
 * One probe per test-design oracle, in the contract's own order, and one
 * gameability probe after them.
 *
 * WHAT A TEST-DESIGN PROBE CAN SAY, AND WHAT IT CANNOT
 *
 * `bmad-testarch-test-design` declares one output and it is prose, so every
 * oracle in this contract reads the whole document and none can tell which risk
 * row a token sits in. tools/generate-contracts.js states that in full and pairs
 * each oracle with `documentMentions`, the harness's own document-global
 * predicate. The probes below are held to the same reading, and each rationale
 * says what its oracle establishes rather than what the suite measures: the
 * row-scoped grounding, the arithmetic, the band placement, the coverage mapping
 * and the priority ordering are all test/eval-test-design.js's, and no probe here
 * claims an oracle reaches them.
 *
 * Every probe names a stored run under `test/replay/test-design/` for its
 * evidence, and which run is read off the recorded outcome rather than chosen:
 * `result.mentions` is the predicate the vocabulary oracles are paired with, so
 * the run a probe's oracle resolves false on is the run that evidences its
 * mutation. A corpus edit that moves that answer fails the generator rather than
 * leaving a probe pointing at a run that no longer shows what it claims.
 *
 * The gameability probe is the one with no stored run of its own, and that is the
 * finding it records. Its degenerate document has the mentions map of the
 * reference run and the grounding block of the generic register, and no oracle in
 * this contract can hold those two apart.
 */
function buildTestDesignProbes() {
  const contract = loadContract('test-design.contract.json');
  const groundTruth = JSON.parse(fs.readFileSync(path.join(TEST_DESIGN_FIXTURE_ROOT, 'ground-truth.json'), 'utf8'));
  const sets = groundTruth.fixtureSets ?? [];
  assert(sets.length >= 2, 'the test-design ground truth declares fewer than two fixture sets, so it carries no clean control');

  const groundTruthPath = `${TEST_DESIGN_FIXTURE_PREFIX}ground-truth.json`;
  const epicPathOf = (set) => `${TEST_DESIGN_FIXTURE_PREFIX}${set.root}/${set.epicFile}`;
  const cases = testDesignReplayCases();
  // The corpus revision, pinned by what it is made of: the ground truth, the two
  // epics a run is handed, and every stored run a probe cites. `commitDigest`
  // wants an AD-27 digest and a git commit identifier is not one, so the corpus is
  // pinned by its contents rather than by where it was committed.
  const corpusDigest = digestOf([
    groundTruthPath,
    ...sets.map(epicPathOf),
    ...cases.flatMap((stored) => [stored.designPath, stored.expectedPath]),
  ]);
  const severityOf = new Map(contract.behaviors.map((behavior) => [behavior.id, behavior.severity]));
  const index = testDesignOracleIndex(contract, sets);

  // The reference run of each set: the one stored run on which every check the
  // harness makes passes. It is each probe's baseline-pass evidence, and the
  // generator asserts below that the probe's own oracle actually holds on it.
  const referenceOf = new Map();
  for (const set of sets) {
    const found = cases.filter((stored) => stored.setId === set.id && testDesignRunPassed(stored.result));
    assert(
      found.length === 1,
      `test/replay/test-design stores ${found.length} run(s) of ${set.id} on which every check passes, and a baseline needs exactly one`,
    );
    referenceOf.set(set.id, found[0]);
  }

  const probes = index.map((entry, position) => {
    const { set, kind, risk, oracleId, oracle, pointer, behaviorId } = entry;
    const seeded = (set.materialRisks ?? []).length > 0;
    const reference = referenceOf.get(set.id);
    assert(
      testDesignOracleHolds(entry, reference.result) === true,
      `${oracleId} does not hold on ${reference.id}, which is ${set.id}'s reference run, so that run is not its baseline`,
    );
    const head = {
      schemaVersion: PROBE_SCHEMA_VERSION,
      parentDigest: null,
      revisionCount: 0,
      probeId: `P-${pad(position + 1)}`,
      behaviorId,
      systemId: `tea-test-design-${set.id}`,
      implementationDigest: corpusDigest,
      commitDigest: corpusDigest,
    };

    // The clean control. The seeded set's own run-measured oracle has a stored
    // violation and is probed as a defect below; this set's has none, because a
    // control whose document goes missing is a broken corpus rather than a
    // measurement.
    if (kind === 'run-measured' && !seeded) {
      return {
        ...head,
        probeClass: 'zero-action',
        artifactDigest: digestOf([reference.designPath]),
        rationale:
          `${set.id} is the corpus's control: its epic describes a feature whose genuine risk set is small, and ` +
          `ground-truth.json caps a correct run at ${set.maxRisks} reported risks. ${reference.id} is that run, and all ` +
          `${index.filter((other) => other.set.id === set.id).length} oracles this contract states for the set hold on it. ` +
          'AD-7 keeps a clean control out of the strength vector; what it establishes is that the contract does not fire ' +
          'where there is nothing to find.',
        qualification: {
          route: 'clean-control',
          baselinePassEvidence: fileReference(reference.expectedPath),
          revisionCommitDigest: corpusDigest,
          noKnownDefectStatement:
            `${set.id} declares no material risk. ground-truth.json gives it ${(set.unsupportedRisks ?? []).length} risks the ` +
            `epic rules out in as many words and a ceiling of ${set.maxRisks} reported risks, and ` +
            'npm run test:eval-test-design-data fails when a declared quote has left the epic it names.',
        },
        expectedClean: true,
        defects: [],
      };
    }

    const violating = cases.filter((stored) => stored.setId === set.id && testDesignOracleHolds(entry, stored.result) === false);
    assert(
      violating.length > 0,
      `no stored run of ${set.id} resolves ${oracleId} false, so nothing evidences the mutation this probe describes`,
    );
    const mutated = violating[0];
    const legId = kind === 'run-measured' ? `manifest-${set.id}-register` : `manifest-${risk.id}`;
    const legPointer = testDesignArtifactPointer(legId);

    const authored = {
      'run-measured': {
        operator: 'write-no-risk-register',
        summary: `The document written for ${set.id} carries no table with a risk id and a score: ${mutated.result.unmeasurable}`,
        failure: `The document carries no table cell holding an R-NNN identifier, so ${oracleId} resolves false and the harness refuses the run as ${mutated.result.unmeasurable} rather than scoring an empty register.`,
        rationale:
          `${mutated.id} is a stored run that wrote a document with no risk register at all, and a document the harness ` +
          `cannot read is refused as ${mutated.result.unmeasurable} rather than scored as a register with nothing wrong in ` +
          `it. ${oracleId} catches the same thing from the body alone, by finding no R-NNN in any table cell, and ` +
          `${behaviorId} is the behavior it discharges.`,
      },
      'material-vocabulary': {
        operator: `omit-material-risk-${risk?.id}`,
        summary: `${risk?.id} is material to ${set.id} and the document omits it: ${risk?.summary}`,
        failure: `The document never reaches ${risk?.id}'s deciding vocabulary, so ${oracleId} resolves false over the whole body.`,
        rationale:
          `${risk?.id} is material to ${set.id}: the epic supports it in as many words, and a document that never reaches its ` +
          `deciding vocabulary has not analysed the feature it was given. ${mutated.id} is the stored run that does exactly ` +
          `that, and ${oracleId} is the oracle that catches it through ${behaviorId}. The oracle reads the whole document, so ` +
          'what it establishes is that the vocabulary is present somewhere; whether a risk row in an admitted category ' +
          'carries it is for test/eval-test-design.js to say.',
      },
      'unsupported-vocabulary': {
        operator: `report-ruled-out-risk-${risk?.id}`,
        summary: `${risk?.id} is ruled out by ${set.id} and the document reports it: ${risk?.summary}`,
        failure: `The document carries ${risk?.id}'s vocabulary, which the epic rules out, so ${oracleId} resolves false over the whole body.`,
        rationale:
          `${risk?.id} is ruled out by ${set.id}'s epic in as many words, so a document that reports it has invented a risk ` +
          `that would fit any feature. ${mutated.id} is the stored run that reports it, and ${oracleId} is the oracle that ` +
          `catches it through ${behaviorId}. The oracle reads the whole document, so it also fires on a document that names ` +
          'the vocabulary while explaining why the risk does not apply, which is the false positive a document-global ' +
          'reading buys.',
      },
    }[kind];

    return {
      ...head,
      probeClass: 'defect',
      artifactDigest: digestOf([mutated.designPath]),
      rationale: authored.rationale,
      qualification: {
        route: 'controlled-mutation',
        // The mutation is to the document a run writes, and every stored seeded
        // case is one edit to the reference document, so that document is what the
        // operator is named against.
        mutationSource: reference.designPath,
        mutationOperator: authored.operator,
        targetArtifact: fileReference(reference.designPath),
        expectedObservableFailure: authored.failure,
        baselinePassEvidence: fileReference(reference.expectedPath),
        mutatedFailEvidence: fileReference(mutated.expectedPath),
        // Both documents are stored side by side and neither is produced by
        // editing the other in place, so there is nothing to roll back. The corpus
        // the runs were staged from is digested before and after every live run.
        rollbackVerified: true,
      },
      expectedClean: false,
      defects: [
        {
          defectId: `D-${pad(position + 1)}`,
          behaviorId,
          summary: authored.summary,
          // The contract's own reading of how hard this miss counts, rather than a
          // second severity table that could disagree with it.
          severity: severityOf.get(behaviorId),
          oracleEvidence: [fileReference(mutated.designPath), fileReference(groundTruthPath)],
          source: 'controlled-mutation',
          // What pre-flight probes to see this defect fire: one design run of the
          // set the risk belongs to, and the document it wrote read for the
          // vocabulary. The relation is the oracle's own check negated, so a probe
          // and an oracle read one document the same way, conjoined with the epic
          // number so the witness says nothing about a document written for the
          // other set.
          manifestationWitness: {
            legId,
            interfaceId: TEST_DESIGN_INTERFACE,
            operationId: TEST_DESIGN_OPERATION,
            inputs: {
              argument: {},
              option: { agent: TEST_DESIGN_DEFAULT_AGENT },
              environment: {},
              stdin: { kind: 'text', value: buildTestDesignPrompt(set) },
            },
            relation: {
              op: 'all',
              operands: [testDesignEpicMarker(legPointer, set.epicNum), negated(repointed(oracle.check, pointer, legPointer))],
            },
          },
        },
      ],
      // The artifact channel, because the deliverable is the only thing this
      // command produces and the exit code says nothing: cli/lib/runner-exit-codes.js
      // gives 0 to every run whose agent completed, so a run that wrote a document
      // with no risk analysis in it and a correct run both exit 0. The signature
      // therefore states the truth about the defect and is refused as
      // `condition-artifact-channel-contract-local`, which is the same trade
      // tea-trace-runner's probes record; see the header.
      defectSignature: {
        interfaceKind: 'cli',
        invocation: { executable: TEST_DESIGN_INTERFACE, subcommandPath: [] },
        observableChannel: 'artifact',
        condition: {
          selector: selector({ option: { agent: { matcher: 'any' } } }),
          predicate: negated(repointed(oracle.check, pointer, OBSERVED_DESIGN_POINTER)),
        },
      },
    };
  });

  // The gameability probe, against the seeded set, whose oracles are the ones a
  // degenerate document has something to gain from.
  const seededSet = sets.find((set) => (set.materialRisks ?? []).length > 0);
  assert(seededSet, 'no test-design fixture set declares a material risk, so no document can be gamed against one');
  const seededEntries = index.filter((entry) => entry.set.id === seededSet.id);
  const gamed = seededEntries.find((entry) => entry.kind === 'material-vocabulary');
  assert(gamed, `${seededSet.id} states no material-vocabulary oracle, so a prose mention gains a document nothing`);
  const reference = referenceOf.get(seededSet.id);
  // The stored run whose register is read and whose rows ground nothing. It is the
  // register the degenerate document borrows, read off the recorded outcome rather
  // than recognised by name.
  const generic = cases.filter(
    (stored) =>
      stored.setId === seededSet.id &&
      stored.result.unmeasurable === undefined &&
      stored.result.shape.rows > 0 &&
      stored.result.grounding.declared > 0 &&
      stored.result.grounding.matched === 0,
  );
  assert(
    generic.length === 1,
    `test/replay/test-design stores ${generic.length} run(s) of ${seededSet.id} whose register grounds nothing, and this probe needs exactly one`,
  );

  probes.push({
    schemaVersion: PROBE_SCHEMA_VERSION,
    parentDigest: null,
    revisionCount: 0,
    probeId: `P-${pad(index.length + 1)}`,
    probeClass: 'gameability',
    behaviorId: gamed.behaviorId,
    systemId: `tea-test-design-${seededSet.id}`,
    implementationDigest: corpusDigest,
    artifactDigest: digestOf([reference.designPath]),
    commitDigest: corpusDigest,
    rationale:
      `A document with ${reference.id}'s mentions map and ${generic[0].id}'s grounding block satisfies every one of the ` +
      `${seededEntries.length} oracles this contract states for ${seededSet.id} and reports nothing the epic supports. Its ` +
      'register rows describe risks the epic neither supports nor rules out, and a mitigation section names every material ' +
      `risk's deciding vocabulary in prose, so ${seededEntries[0].oracleId} finds R-NNN identifiers in a table, the ` +
      `${seededEntries.filter((entry) => entry.kind === 'material-vocabulary').length} material-vocabulary oracles find ` +
      `their tokens somewhere in the body, and the ` +
      `${seededEntries.filter((entry) => entry.kind === 'unsupported-vocabulary').length} unsupported-vocabulary oracles ` +
      `find no ruled-out vocabulary. Nothing in this contract rejects that document. ${generic[0].id} records what the ` +
      `row-scoped reading does with a register like it: ${generic[0].result.grounding.matched} of ` +
      `${generic[0].result.grounding.declared} material risks matched a register row in an admitted category. This probe is ` +
      'the record that the contract scores the gamed document clean.',
    qualification: {
      route: 'gameability',
      degenerateResponse:
        'A test design document whose register rows carry well-formed identifiers, correct arithmetic and a band for each ' +
        'score, describing risks the epic neither supports nor rules out, beside a mitigation section that names every ' +
        "material risk's deciding vocabulary in prose.",
      naiveOracleSatisfiedEvidence: fileReference(reference.expectedPath),
      disciplinedOracleRejectedEvidence: fileReference(generic[0].expectedPath),
    },
    expectedClean: false,
    // AD-9's gameability route qualifies a degenerate response rather than a
    // seeded defect, so there is no defect to declare and no manifestation witness
    // to owe.
    defects: [],
    defectSignature: {
      interfaceKind: 'cli',
      invocation: { executable: TEST_DESIGN_INTERFACE, subcommandPath: [] },
      observableChannel: 'artifact',
      condition: {
        selector: selector({ option: { agent: { matcher: 'any' } } }),
        // Every oracle this contract states for the seeded set, read off the one
        // document. The condition states what the degenerate reply satisfies
        // rather than what separates it from a correct one, because nothing
        // expressible over this artifact separates the two: the reference run
        // satisfies the same conjunction. That is the measurement this probe
        // exists to record.
        predicate: {
          op: 'all',
          operands: seededEntries.map((entry) => repointed(entry.oracle.check, entry.pointer, OBSERVED_DESIGN_POINTER)),
        },
      },
    },
  });

  return probes;
}

// ---------------------------------------------------------------------------
// nfr
// ---------------------------------------------------------------------------

/** Every literal a check tree carries, flattened, so an oracle is found by the claim it makes. */
function literalsOf(node) {
  if (node === null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(literalsOf);
  if (Object.hasOwn(node, 'literal')) return [node.literal];
  return Object.values(node).flatMap(literalsOf);
}

/** The oracles this contract states about one evidence bundle, read off the requirement each behavior links. */
function nfrOraclesFor(contract, setId) {
  const ids = new Set(
    contract.behaviors
      .filter((behavior) => behavior.requirementLinks.some((link) => link.id.startsWith(`${setId}/`)))
      .flatMap((behavior) => behavior.oracles),
  );
  assert(ids.size > 0, `nfr.contract.json declares no behavior linked to ${setId}`);
  return contract.oracles.filter((oracle) => ids.has(oracle.id));
}

/**
 * The one oracle among a bundle's that reads the report for a given literal.
 *
 * Found by the literal it checks. The numbering is an ordering convention that
 * nothing holds to a meaning and the literal is the claim itself, so a contract
 * edit that moves a claim fails here and a probe is never pointed at whichever
 * oracle kept the number. It throws when the search names none or several.
 */
function nfrOracleReading(oracles, literal, setId) {
  const found = oracles.filter((oracle) => literalsOf(oracle.check).includes(literal));
  assert(found.length === 1, `${setId}: ${found.length} oracle(s) check the report for "${literal}", and a probe needs exactly one`);
  return found[0].id;
}

/** The three spellings a YAML scalar takes, as the `any` the nfr contract's own overall-status oracle is written with. */
function overallStatusAny(pointer, status) {
  return {
    op: 'any',
    operands: [`'${status}'`, `"${status}"`, status].map((spelling) => ({
      op: 'containment',
      operands: [{ pointer }, { literal: `overall_status: ${spelling}` }],
    })),
  };
}

/**
 * The probe corpus for the nfr contract.
 *
 * Three plants and one control, all read out of `test/fixtures/nfr-eval/ground-truth.json`.
 * A domain is planted when the corpus flags it undecidable, which is a threshold
 * no source states or evidence the bundle does not carry, or when its evidence
 * breaches a threshold the bundle does state. Which oracle each plant answers to
 * is decided by the same field:
 *
 *   threshold never stated   the oracle demanding the report record UNKNOWN. This
 *                            bundle leaves exactly one threshold unstated, so a run
 *                            that supplied its own writes a report without the word
 *                            and that oracle is violated.
 *   everything else          the oracle reading the Gate YAML's overall_status, which
 *                            is the rollup of the four domain statuses the plant is
 *                            one of.
 *
 * The second is the nearest claim this contract can make and it is not always a
 * catch. A markdown report is one string to this vocabulary, so the four oracles
 * are document-level, and a domain whose status the rollup does not move on its
 * own has no oracle of its own: a run that passed maintainability on a prose claim
 * still publishes FAIL, because reliability breaches a threshold in the same
 * bundle. Nothing is measured either way, because every signature here is refused
 * at the qualification gate for the reason the header records, and the rationale
 * says which domain and which rule each probe rests on so a later contract with a
 * per-domain claim can be pointed at the right one.
 */
function buildNfrProbes() {
  const contract = loadContract('nfr.contract.json');
  const groundTruth = JSON.parse(fs.readFileSync(path.join(NFR_FIXTURE_ROOT, 'ground-truth.json'), 'utf8'));
  const isGapped = (set) => Object.values(set.domains ?? {}).some((domain) => domain.isUndecidable === true);
  const gapped = groundTruth.fixtureSets.find((set) => isGapped(set));
  const clean = groundTruth.fixtureSets.find((set) => Object.values(set.domains ?? {}).every((domain) => domain.expectedStatus === 'PASS'));
  assert(gapped && clean, 'nfr ground truth carries no bundle with an undecidable domain or no clean control');

  const groundTruthPath = `${NFR_FIXTURE_PREFIX}ground-truth.json`;
  const corpusDigest = digestOf([groundTruthPath]);
  const citations = groundTruth.skillRuleCitations ?? {};

  // The stored runs the two evidence fields point at. The clean bundle's audit is
  // the baseline: four PASS domains and no gap. The gapped bundle's audit is what
  // the plants produce, and it is the same document test/replay/nfr/ scores.
  const baselineReport = 'test/replay/nfr/clean-correct-audit/test-artifacts/nfr-assessment.md';
  const mutatedReport = 'test/replay/nfr/gapped-correct-audit/test-artifacts/nfr-assessment.md';

  const gappedOracles = nfrOraclesFor(contract, gapped.id);
  const unknownOracleId = nfrOracleReading(gappedOracles, NFR_UNKNOWN_TOKEN, gapped.id);
  const gateOracleId = nfrOracleReading(gappedOracles, `overall_status: '${gapped.expectedOverallStatus}'`, gapped.id);

  // The domains this bundle plants a defect in, in the order the harness scores
  // them: the ones the corpus flags undecidable, plus the one whose evidence
  // breaches a threshold the bundle states.
  const planted = NFR_DOMAINS.map((name) => ({ name, domain: gapped.domains[name] })).filter(
    ({ domain }) => domain.isUndecidable === true || domain.expectedStatus === 'FAIL',
  );
  assert(planted.length > 0, `${gapped.id} plants no defect in any domain, so it seeds nothing`);

  const probes = planted.map(({ name, domain }, index) => {
    const citation = citations[domain.rule];
    assert(citation, `${gapped.id}.domains.${name}: rule "${domain.rule}" names no entry in skillRuleCitations`);
    const oracleId = domain.thresholdStated === false ? unknownOracleId : gateOracleId;
    const behaviorId = soleBehaviorFor(contract, oracleId);
    const legId = `manifest-${name}`;
    return {
      schemaVersion: PROBE_SCHEMA_VERSION,
      parentDigest: null,
      revisionCount: 0,
      probeId: `P-${pad(index + 1)}`,
      probeClass: 'defect',
      behaviorId,
      systemId: `tea-nfr-${gapped.id}`,
      implementationDigest: corpusDigest,
      artifactDigest: corpusDigest,
      commitDigest: corpusDigest,
      rationale:
        `${name} is ${domain.expectedStatus} on ${gapped.id}, under skillRuleCitations.${domain.rule}: ${citation.rule} ` +
        `The bundle is the plant, and ${oracleId} is the oracle that has to see its consequence in the report the run wrote.`,
      qualification: {
        route: 'controlled-mutation',
        mutationSource: groundTruthPath,
        mutationOperator: `plant-${name}-${domain.expectedStatus.toLowerCase()}`,
        targetArtifact: fileReference(groundTruthPath),
        expectedObservableFailure:
          `The ${name} findings of the report are recorded as ${domain.expectedStatus}, and the Gate YAML publishes ` +
          `overall_status ${gapped.expectedOverallStatus}.`,
        baselinePassEvidence: fileReference(baselineReport),
        mutatedFailEvidence: fileReference(mutatedReport),
        rollbackVerified: true,
      },
      expectedClean: false,
      defects: [
        {
          defectId: `D-${pad(index + 1)}`,
          behaviorId,
          summary: `${name} can only reach ${domain.expectedStatus} on this bundle, under the workflow's own ${domain.rule} rule.`,
          severity: domain.expectedStatus === 'FAIL' ? 'critical' : 'material',
          oracleEvidence: [fileReference(groundTruthPath)],
          source: 'controlled-mutation',
          // One audit of the gapped bundle, and the gate its own sections roll up
          // to. The status is read off the ground truth, so a bundle whose plants
          // stop rolling up to it moves this relation with them. The two legs AD-10 reads as clean both stage the clean bundle,
          // whose audit publishes PASS, so the relation is false there.
          manifestationWitness: {
            legId,
            interfaceId: NFR_INTERFACE,
            operationId: NFR_OPERATION,
            inputs: {
              argument: {},
              option: { agent: NFR_DEFAULT_AGENT },
              environment: {},
              stdin: { kind: 'text', value: buildNfrPrompt(gapped) },
            },
            relation: overallStatusAny(`/interactions/${legId}/artifact/report`, gapped.expectedOverallStatus),
          },
        },
      ],
      defectSignature: {
        interfaceKind: 'cli',
        invocation: { executable: NFR_INTERFACE, subcommandPath: [] },
        observableChannel: 'artifact',
        condition: {
          selector: selector({ option: { agent: { matcher: 'any' } } }),
          predicate: overallStatusAny('/interactions/observed/artifact/report', gapped.expectedOverallStatus),
        },
      },
    };
  });

  // The clean bundle's control answers to the same claim on its own side: the
  // audit of a bundle that states every threshold and meets every one publishes
  // the overall status its four PASS domains roll up to.
  const cleanOracles = nfrOraclesFor(contract, clean.id);
  const cleanOracleId = nfrOracleReading(cleanOracles, `overall_status: '${clean.expectedOverallStatus}'`, clean.id);
  probes.push({
    schemaVersion: PROBE_SCHEMA_VERSION,
    parentDigest: null,
    revisionCount: 0,
    probeId: `P-${pad(planted.length + 1)}`,
    probeClass: 'zero-action',
    behaviorId: soleBehaviorFor(contract, cleanOracleId),
    systemId: `tea-nfr-${clean.id}`,
    implementationDigest: corpusDigest,
    artifactDigest: corpusDigest,
    commitDigest: corpusDigest,
    rationale:
      `${clean.id} states a threshold for all ${NFR_DOMAINS.length} of its domains and meets every one, so any gap the run ` +
      'reports is a false positive. It is the control that stops an nfr suite scoring well by refusing to pass anything.',
    qualification: {
      route: 'clean-control',
      baselinePassEvidence: fileReference(baselineReport),
      revisionCommitDigest: corpusDigest,
      noKnownDefectStatement: clean.title,
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
  const evalsPath = repositoryPath('test', 'evals', workflow, 'evals.json');
  const evals = JSON.parse(fs.readFileSync(path.join(EVAL_ROOT, workflow, 'evals.json'), 'utf8'));
  const first = evals.cases[0];
  assert(first, `${workflow}: evals.json carries no case`);

  const contextFiles = evals.contextFiles.map((file) => repositoryPath('src', 'workflows', 'testarch', workflow, file));
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

// ---------------------------------------------------------------------------
// tea-routing-*.probes.json
// ---------------------------------------------------------------------------

/**
 * The oracle of one contract that reads one field of one case's answer.
 *
 * Found by its evidence pointer rather than by its id. Ids are positional, so
 * adding a case to the corpus renumbers every oracle after it, and a probe
 * holding an id would silently move to a different oracle.
 */
function routingOracleFor(contract, caseId, field) {
  const pointer = `/interactions/${caseId}/stdout/${field}`;
  const found = contract.oracles.filter((oracle) => oracle.direction.evidenceTargets[0] === pointer);
  assert(found.length === 1, `${contract.contractId}: ${found.length} oracle(s) read ${pointer}, and a probe needs exactly one`);
  return found[0];
}

/**
 * Two probes per routing contract, and both are about the same weakness.
 *
 * Token containment is a cheap oracle and a gameable one: a reply that quotes the
 * user's message back as its reason satisfies every token the fixture names,
 * whatever it then did with the message. The gameability probe is that reply, and
 * the oracle that catches it is the one reading the decision rather than the
 * prose. For the intents contract that is the menu code; for the controls
 * contract it is the question, where a clarification that names nothing to choose
 * between passes the reason oracle and asks the user nothing.
 *
 * There are no defect probes. A defect probe needs a controlled mutation of the
 * system under test with baseline and mutated evidence, and the system here is
 * `src/agents/bmad-tea/SKILL.md`, which this suite must not edit: a mutation of
 * the skill to prove the eval catches it is an edit to the thing being measured.
 * The fragment-selection corpora ship the same two classes for the same reason.
 */
function buildRoutingProbes(spec) {
  const contract = loadContract(spec.relativePath);
  const corpus = JSON.parse(fs.readFileSync(path.join(ROUTING_FIXTURE_ROOT, 'ground-truth.json'), 'utf8'));
  const intentsPath = repositoryPath('test', 'fixtures', 'tea-routing-eval', 'intents.json');
  const groundTruthPath = repositoryPath('test', 'fixtures', 'tea-routing-eval', 'ground-truth.json');
  const skillPath = repositoryPath('src', 'agents', 'bmad-tea', 'SKILL.md');
  const menuPath = repositoryPath('src', 'agents', 'bmad-tea', 'customize.toml');
  const corpusDigest = digestOf([skillPath, menuPath, intentsPath, groundTruthPath]);

  const first = contract.interactionPlan[0].stepId;
  const expected = corpus.cases[first];
  assert(expected, `${spec.contractId}: ground-truth.json carries no answer for ${first}`);
  const naive = routingOracleFor(contract, first, 'reason');
  const disciplined = routingOracleFor(contract, first, spec.gamedField);

  return [
    {
      schemaVersion: PROBE_SCHEMA_VERSION,
      parentDigest: null,
      revisionCount: 0,
      probeId: 'P-001',
      probeClass: 'gameability',
      behaviorId: soleBehaviorFor(contract, disciplined.id),
      systemId: spec.contractId,
      implementationDigest: corpusDigest,
      artifactDigest: digestOf([groundTruthPath]),
      commitDigest: corpusDigest,
      rationale:
        `A reply that quotes the user's own message back as its reason satisfies ${naive.id} for ${first}, because the deciding tokens ` +
        `are words from that message, and violates ${disciplined.id}, because ${spec.gamedSentence} The reason oracle alone cannot tell ` +
        'that reply from one that actually read the message, and the decision oracle can.',
      qualification: {
        route: 'gameability',
        degenerateResponse: spec.degenerateResponse,
        naiveOracleSatisfiedEvidence: fileReference(groundTruthPath),
        disciplinedOracleRejectedEvidence: fileReference(groundTruthPath),
      },
      expectedClean: false,
      defects: [],
      defectSignature: {
        interfaceKind: 'cli',
        invocation: { executable: 'tea-routing-runner', subcommandPath: [] },
        observableChannel: 'stdout',
        condition: {
          selector: selector({ option: { agent: { matcher: 'any' } }, stdin: { prompt: { matcher: 'any' } } }),
          predicate: spec.defectPredicate(expected),
        },
      },
    },
    {
      schemaVersion: PROBE_SCHEMA_VERSION,
      parentDigest: null,
      revisionCount: 0,
      probeId: 'P-002',
      probeClass: 'zero-action',
      behaviorId: soleBehaviorFor(contract, naive.id),
      systemId: spec.contractId,
      implementationDigest: corpusDigest,
      artifactDigest: digestOf([groundTruthPath]),
      commitDigest: corpusDigest,
      rationale:
        `${first} declares the action, the deciding tokens and the scope the skill's own Step 8 implies for it, so an answer carrying ` +
        'all three is the run this contract exists to confirm rather than a defect to catch.',
      qualification: {
        route: 'clean-control',
        baselinePassEvidence: fileReference(groundTruthPath),
        revisionCommitDigest: corpusDigest,
        noKnownDefectStatement:
          `${first}'s expected answer is derived from src/agents/bmad-tea/SKILL.md and its menu, and ` +
          'node test/eval-bmad-tea-routing.js --validate-only fails when a menu code the corpus names has left customize.toml.',
      },
      expectedClean: true,
      defects: [],
    },
  ];
}

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
    ...ROUTING_CONTRACTS.map((spec) => ({
      relativePath: spec.relativePath.replace('.contract.json', '.probes.json'),
      build: () => buildRoutingProbes(spec),
    })),
    { relativePath: 'test-review.probes.json', build: buildTestReviewProbes },
    { relativePath: 'test-design.probes.json', build: buildTestDesignProbes },
    { relativePath: 'trace.probes.json', build: buildTraceProbes },
    { relativePath: 'nfr.probes.json', build: buildNfrProbes },
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
  // Every byte this generator digests comes through the certified corpus port,
  // resolved here because the builders below are synchronous and the port is not.
  corpus = await loadCorpus(PROJECT_ROOT, corpusMembers());

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

  // Computed before the staleness report below returns, so a stale corpus does
  // not hide an ungenerated one until somebody fixes the first.
  const generated = new Set(targets().map((target) => repositoryPath(target.relativePath)));
  const unheld = filesUnder('test', 'probes')
    .filter((reference) => reference.endsWith('.probes.json'))
    .map((reference) => reference.replace('test/probes/', ''))
    .filter((reference) => !generated.has(reference));
  if (unheld.length > 0) {
    console.error(`❌ ${unheld.length} probe corpus file(s) under test/probes are generated by nothing:\n`);
    for (const reference of unheld) console.error(`   test/probes/${reference}`);
    console.error('\nGenerate it here, or delete it: a corpus nothing writes is a corpus nothing holds.');
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
  if (unheld.length > 0) return 1;

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
