/**
 * Behavioral Evaluation Contract generator.
 *
 * Every contract under test/contracts/ is generated. Every row, line,
 * admitted-line set, fragment name, severity and count in them comes from a
 * source this repository already keeps:
 *
 *   - test/fixtures/test-review-eval/ground-truth.json for test-review.contract.json,
 *   - src/workflows/testarch/bmad-testarch-test-review/steps-c/criteria-registry.md
 *     for the severity of each planted row and for that contract's sourceSpecDigest,
 *   - test/evals/<workflow>/evals.json for each fragment-selection contract,
 *   - each workflow's deciding step file for that contract's sourceSpecDigest,
 *   - each workflow's resources/tea-index.csv for the selection cardinality bound, and
 *   - cli/test-review.js's VERDICT_KEYS for the verdict response descriptor's key
 *     sets and types, and its DEFAULT_AGENT for the sensitivity-witness legs, and
 *   - cli/fragment-selection-runner.js's SELECTION_REQUEST_KEYS for the request
 *     shape of the command the eight fragment-selection contracts name, and its
 *     DEFAULT_AGENT for their witness legs,
 *   - test/fixtures/trace-eval/ground-truth.json for trace.contract.json: every
 *     expected gate, count, percentage, disposition, blocker, rejected span, and
 *     waiver verdict its oracles state, and the skill files its rule citations
 *     name for that contract's sourceSpecDigest,
 *   - cli/trace-runner.js's TRACE_REQUEST_KEYS and DEFAULT_AGENT for that
 *     contract's request shape and witness legs, and test/eval-trace.js's
 *     buildPrompt for the two prompts the witness legs send and for the literal
 *     each of its two plan steps binds on standard input, and
 *   - the trace workflow's step-05 for the key set of the summary the run writes.
 *
 * The prose that is genuinely authored (an oracle's commentary, a behavior's lead
 * sentence, the risk ids) lives in the tables below, so the JSON on disk carries
 * nothing that is written down only there. That is the whole point: 4,800 lines of
 * JSON that look hand-written and are actually derived will drift the first time a
 * fixture line moves, and nothing would say so.
 *
 * This follows tools/validate-eval-schemas.js, which solves the same problem for
 * test/schema/eval-result.schema.json: one generator, and a mode that regenerates
 * in memory and fails when the bytes on disk differ.
 *
 * Output is run through Prettier with this repository's own config, because
 * test/contracts/ is not in .prettierignore and `npm run format:check` is part of
 * the same gate.
 *
 * Usage: node tools/generate-contracts.js [--check]
 * Exit codes: 0 = written or up to date, 1 = a contract is stale, 2 = the generator could not run
 *
 * --check regenerates in memory and reports every contract whose bytes moved.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const prettier = require('prettier');

// One digest function serves every caller in this repository, for the reason
// test/lib/eval-record.js gives: two implementations produce two answers for the
// same bytes, and a digest exists so a later run can decide whether it looked at
// the same input.
const { digest } = require('../test/lib/eval-record');

// The registry table parser is imported from the module that owns it, for the
// reason that module gives: two copies of the cell-count and id-shape rules would
// let a format change be caught by one and silently mis-parsed by the other.
const { parseRegistryRows, REGISTRY_PATH } = require('./validate-criteria-fragments');
// The CLI is the only authority on the shape of its own verdict, so the response
// descriptor's key and type fields are read from it instead of written here.
const { VERDICT_KEYS, DEFAULT_AGENT } = require('../cli/test-review');
// Same rule for the command the fragment-selection contracts name: the runner
// owns its own request shape and its own default agent, so both are read from it.
const { SELECTION_REQUEST_KEYS, DEFAULT_AGENT: SELECTION_DEFAULT_AGENT } = require('../cli/fragment-selection-runner');
// And for the trace command: its request shape and default agent are its own, and
// the prompt its witness legs send and the literal each of its plan steps binds
// are the harness's, because the harness is the only thing that assembles one.
const { TRACE_REQUEST_KEYS, DEFAULT_AGENT: TRACE_DEFAULT_AGENT, EXIT_CODES: TRACE_EXIT_CODES } = require('../cli/trace-runner');
const { vendorEnvironmentNames } = require('../cli/lib/runner-exit-codes');
const {
  buildPrompt: buildTracePrompt,
  SUMMARY_SCHEMA_MAJOR_MINOR: TRACE_SUMMARY_SCHEMA,
  TRACE_INTERFACE,
  TRACE_OPERATION,
} = require('../test/eval-trace');
// The prompt a selection witness leg sends is the prompt the harness assembles,
// for the reason the trace witness reads its two prompts from the harness as
// well: a leg carrying a description of a prompt parses, compiles, schedules,
// and then measures nothing when it is finally run.
const { buildPrompt: buildSelectionPrompt } = require('../test/eval-fragment-selection');
// And for the routing command the bmad-tea suite names: its request and response
// shapes and its default agent are its own, and the prompt, the menu reading and
// the three pattern sources are the harness's. The patterns matter most. An
// oracle asking whether a stated reason names a token and a scorer asking the
// same question have to be one rule, or `test/test-contract-oracles.js` is
// comparing two spellings of nearly the same thing and reporting the difference
// as a defect in the skill.
const { ROUTING_REQUEST_KEYS, ROUTING_RESPONSE_KEYS, DEFAULT_AGENT: ROUTING_DEFAULT_AGENT } = require('../cli/routing-runner');
const {
  buildPrompt: buildRoutingPrompt,
  candidatePatternSource,
  loadCorpus: loadRoutingCorpus,
  menuItems: routingMenuItems,
  tokenPatternSource,
  MISSING_PATTERN_SOURCE,
  ROUTING_INTERFACE,
  ROUTING_OPERATION,
} = require('../test/eval-bmad-tea-routing');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONTRACT_ROOT = path.join(PROJECT_ROOT, 'test', 'contracts');
const EVAL_ROOT = path.join(PROJECT_ROOT, 'test', 'evals');
const WORKFLOW_ROOT = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch');
const FIXTURE_ROOT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-review-eval');
const GROUND_TRUTH_PATH = path.join(FIXTURE_ROOT, 'ground-truth.json');
const FIXTURE_PREFIX = 'test/fixtures/test-review-eval/';
const TRACE_FIXTURE_ROOT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'trace-eval');
const TRACE_GROUND_TRUTH_PATH = path.join(TRACE_FIXTURE_ROOT, 'ground-truth.json');
const TRACE_STEP_05 = path.join(WORKFLOW_ROOT, 'bmad-testarch-trace', 'steps-c', 'step-05-gate-decision.md');

/**
 * The Eval Contract schema version this generator writes. A bump arrives as a
 * `schema-version-mismatch` fault on the first compile after an upgrade, which
 * is what version 3.0.0 of the package did to every contract stamped 4.
 */
const EVAL_CONTRACT_SCHEMA_VERSION = 5;

/** The forbidden-input list is fixed by the contract schema and is the same for every contract here. */
const FORBIDDEN_INPUTS = [
  'original-spec',
  'source-code',
  'repository',
  'builder-transcript',
  'implementation-logs',
  'comparator-results',
  'human-labels',
];

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

class GeneratorError extends Error {}

function assert(condition, message) {
  if (!condition) throw new GeneratorError(message);
}

function numberWord(count) {
  assert(count < NUMBER_WORDS.length, `no number word for ${count}; extend NUMBER_WORDS`);
  return NUMBER_WORDS[count];
}

/**
 * `sha256:<hex>` over the named files, in the order given.
 *
 * The hashing is the shared helper's, which length-prefixes each part. Plain
 * concatenation collided across a file boundary: moving a byte from the tail of
 * one step file to the head of the next left the digest unchanged, and
 * bmad-testarch-ci's contract pins a multi-file contextFiles list.
 */
function digestOf(absolutePaths) {
  return digest(absolutePaths.map((file) => fs.readFileSync(file)));
}

/** Registry row ids sorted by their letter class and then numerically, so H10 follows H4. */
function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const [, aLetter, aNumber] = /^([CHML])(\d+)$/.exec(a);
    const [, bLetter, bNumber] = /^([CHML])(\d+)$/.exec(b);
    return aLetter === bLetter ? Number(aNumber) - Number(bNumber) : aLetter.localeCompare(bLetter);
  });
}

/**
 * A basename anchored so a finding may cite the fixture by any path that ends in it.
 *
 * The directory prefix (DIRECTORY_PREFIX below) is an alternation with an empty
 * branch, and no quantifier applies to the group. It was an optional group around a dot-star
 * and a slash, which parses, compiles, and is then refused at evaluation time:
 * eval-quality's regex operator rejects a quantifier nested inside a quantified
 * group before matching anything, as a catastrophic-backtracking shape, and it
 * reports the refusal as a `budget-exhausted` fault. Every regex oracle in the
 * test-review contract carried that shape, so none of them could be evaluated,
 * and nothing in this repository read an oracle until test/test-contract-oracles.js
 * did. `npm run test:contracts` never saw it because the compiler does not run
 * the operator; it only requires the `^` and `$` anchors, which both shapes have.
 */
function basenamePattern(basename) {
  return `^${DIRECTORY_PREFIX}${escapeRegex(basename)}$`;
}

/** One pattern that matches any of the basenames, under the same prefix as basenamePattern. */
function basenamesPattern(basenames) {
  return `^${DIRECTORY_PREFIX}(?:${basenames.map(escapeRegex).join('|')})$`;
}

const DIRECTORY_PREFIX = '(?:.*/|)';

function escapeRegex(text) {
  return text.replaceAll('.', String.raw`\.`);
}

// ---------------------------------------------------------------------------
// test-review.contract.json
// ---------------------------------------------------------------------------

const FINDINGS_POINTER = '/interactions/review-corpus/artifact/verdict/findings';
const EXIT_CODE_POINTER = '/interactions/review-corpus/exit-code';
const VERDICT_POINTERS = ['findings', 'violations', 'qualityScore', 'recommendation'].map(
  (field) => `/interactions/review-corpus/artifact/verdict/${field}`,
);

/**
 * The risk a missed plant of each registry severity names, and how hard it grades.
 *
 * There is one behavior per planted row rather than one per severity class, and
 * that is a requirement of the scoring half rather than a preference. AD-40 pairs
 * a probe with the single oracle discharging the behavior its seeded defect
 * breaks, and `eval-quality`'s `designatedOracleIdOf` resolves that oracle only
 * when the behavior declares exactly one. A behavior grouping four plant oracles
 * resolves none, and `score` then votes the trial with the first oracle's state
 * instead, so every probe in the corpus would be measured against O-001 whatever
 * row it seeded. The demand is unchanged either way: the same nine oracles, all
 * required, at the same severities. Only the grouping moved.
 *
 * Nothing grades below material. HIGH and MEDIUM-or-LOW were both hand-assigned
 * `low` once, which put missing a planted HIGH defect below one out-of-scope
 * finding (the scope behavior, material). Missing a planted defect is the failure
 * this suite exists to catch, so that ordering was inverted. `low` is unused
 * here, which is the honest reading of a corpus with two tiers: a row carrying
 * its own CRITICAL recall gate grades critical, and a row feeding the pooled
 * recall gate grades material.
 */
const PLANT_SEVERITY_CLASSES = [
  { severities: ['CRITICAL'], grade: 'critical', risk: 'missed-critical-defect' },
  { severities: ['HIGH'], grade: 'material', risk: 'missed-high-defect' },
  { severities: ['MEDIUM', 'LOW'], grade: 'material', risk: 'missed-minor-defect' },
];

/**
 * The severity class of one planted row, by its registry severity.
 *
 * @param {string} registrySeverity
 * @returns {{severities: string[], grade: string, risk: string}}
 */
function plantSeverityClass(registrySeverity) {
  const found = PLANT_SEVERITY_CLASSES.find((entry) => entry.severities.includes(registrySeverity));
  assert(found, `criteria-registry.md grades a planted row ${registrySeverity}, which no severity class here covers`);
  return found;
}

/** The JSON type names a response descriptor may declare; `null` means "declared, type not stated". */
const JSON_TYPE_NAMES = new Set(['string', 'number', 'boolean', 'object', 'array', 'null']);

/**
 * The verdict payload the tea-test-review CLI writes.
 *
 * `requiredKeys`, `permittedKeys` and `types` are derived from the CLI's own
 * VERDICT_KEYS export, so a field added to the verdict lands here without an edit
 * and `--check` fails until the contract on disk is regenerated. Before this the
 * three were transcribed, and the transcription had already drifted: the CLI can
 * emit twenty-two keys and the list on disk permitted fifteen, forbidding two
 * fields (`reportedQualityScore`, `reportedRecommendation`) that every review
 * whose agent disagrees with the derived ledger produces.
 *
 * Only those three fields are derived. `successIndicator`, `channelRoles` and the
 * findings cardinality bound stay authored below. Each is a reading of the
 * payload: which key decides pass from fail, which one is the collection, how
 * many findings a review may plausibly report. The CLI states none of that about
 * itself.
 *
 * The skip payload is a different shape and is out of scope here: a descriptor
 * covering both could only declare their union, whose recommendation and score
 * are sometimes null, which asserts nothing about the verdict this contract
 * exists to check. cli/test-review.js declares that shape as SKIP_KEYS and
 * asserts every skip payload against it.
 */
function verdictDescriptor(keys) {
  const alwaysKeys = Object.keys(keys.always);
  const conditionalKeys = Object.keys(keys.conditional);
  const types = { ...keys.always, ...keys.conditional };
  for (const key of conditionalKeys) {
    assert(!Object.hasOwn(keys.always, key), `VERDICT_KEYS declares "${key}" as both always and conditional`);
  }
  for (const [key, type] of Object.entries(types)) {
    assert(type === null || JSON_TYPE_NAMES.has(type), `VERDICT_KEYS types "${key}" as ${JSON.stringify(type)}, which is not a JSON type`);
  }
  return {
    requiredKeys: alwaysKeys,
    permittedKeys: [...alwaysKeys, ...conditionalKeys],
    types,
    successIndicator: '/recommendation',
    channelRoles: {
      '/recommendation': 'success-indicator',
      '/findings': 'collection',
      '/qualityScore': 'payload',
      '/violations': 'payload',
    },
    collectionLocations: [{ pointer: '/findings', referenceSet: null, expectedCardinality: { mode: 'at-most', max: 200 } }],
  };
}

/** Every plant in the corpus, flattened, in the order ground-truth.json lists them. */
function plantsOf(groundTruth) {
  return groundTruth.files.flatMap((entry) =>
    (entry.planted ?? []).map((defect) => ({
      row: defect.row,
      line: defect.line,
      admittedLines: defect.admittedLines,
      relativePath: entry.path,
      basename: path.basename(entry.path),
      what: defect.what,
    })),
  );
}

/** One oracle per plant: the right row, in the right file, on a line the ground truth admits. */
function plantOracle(plant, index) {
  const id = `O-${String(index + 1).padStart(3, '0')}`;
  return {
    id,
    polarity: 'expects-hold',
    commentary: `${plant.row} at ${plant.basename}:${plant.line}. ${plant.what}`,
    direction: {
      polarity: 'expects-hold',
      relation: 'for-any',
      scope: `Every finding the review reported, searched for one naming registry row ${plant.row} in ${plant.basename}.`,
      negativeDomain: `A review that reports ${plant.row} nowhere, or reports it against another file, or cites a line the ground truth does not admit for it.`,
      evidenceTargets: [FINDINGS_POINTER],
    },
    check: {
      op: 'for-any',
      collection: { pointer: FINDINGS_POINTER },
      predicate: {
        op: 'all',
        operands: [
          { op: 'equality', operands: [{ pointer: '@/row' }, { literal: plant.row }] },
          { op: 'regex', operands: [{ pointer: '@/file' }], pattern: basenamePattern(plant.basename) },
          { op: 'set-membership', operands: [{ pointer: '@/line' }, { literal: plant.admittedLines }] },
        ],
      },
    },
  };
}

function buildTestReviewContract() {
  const groundTruth = JSON.parse(fs.readFileSync(GROUND_TRUTH_PATH, 'utf8'));
  const plants = plantsOf(groundTruth);
  assert(plants.length > 0, 'ground-truth.json plants nothing, so there is no behavioral contract to generate');

  const severityOfRow = new Map(parseRegistryRows().map((row) => [row.id, row.severity]));
  for (const plant of plants) {
    assert(severityOfRow.has(plant.row), `ground-truth.json plants row ${plant.row}, which criteria-registry.md does not carry`);
  }

  const clean = groundTruth.files.find((entry) => (entry.planted ?? []).length === 0);
  assert(clean, 'ground-truth.json declares no clean control, so the false-positive oracle has no subject');
  const cleanBasename = path.basename(clean.path);

  const scopeControl = groundTruth.negativeControls?.[0];
  assert(scopeControl, 'ground-truth.json declares no negative control, so the scope oracle has no requirement to link');
  const reviewedBasenames = groundTruth.files.map((entry) => path.basename(entry.path));

  // The plant oracles come first and in corpus order, so O-00n and the nth plant
  // stay the same thing however the corpus is later reordered.
  const oracleIdOfRow = new Map();
  const oracles = plants.map((plant, index) => {
    const oracle = plantOracle(plant, index);
    oracleIdOfRow.set(plant.row, oracle.id);
    return oracle;
  });
  const nextId = (offset) => `O-${String(plants.length + offset).padStart(3, '0')}`;
  const [cleanOracleId, scopeOracleId, verdictOracleId, exitOracleId] = [nextId(1), nextId(2), nextId(3), nextId(4)];

  oracles.push(
    {
      id: cleanOracleId,
      polarity: 'expects-hold',
      commentary: `The clean control. ${cleanBasename} carries no planted defect, so every finding against it is a definite false positive.`,
      direction: {
        polarity: 'expects-hold',
        relation: 'not',
        scope: 'Every finding the review reported, searched for any that names the clean control file.',
        negativeDomain: `A review that reports any finding at all against ${cleanBasename}.`,
        evidenceTargets: [FINDINGS_POINTER],
      },
      check: {
        op: 'not',
        operands: [
          {
            op: 'for-any',
            collection: { pointer: FINDINGS_POINTER },
            predicate: { op: 'regex', operands: [{ pointer: '@/file' }], pattern: basenamePattern(cleanBasename) },
          },
        ],
      },
    },
    {
      id: scopeOracleId,
      polarity: 'expects-hold',
      commentary:
        'The scope control recorded as negativeControls[0] in ground-truth.json. A changed implementation with no accompanying test belongs to trace, so a finding against any file outside the review set is a scope violation scored as a false positive. ' +
        'A finding with no file is left to the unlocated count, because nothing can say which file it meant.',
      direction: {
        polarity: 'expects-hold',
        relation: 'for-all',
        scope: `Every located finding the review reported, checked against the ${numberWord(reviewedBasenames.length)} files under review.`,
        negativeDomain: 'A review that raises a finding, a coverage violation for example, against a file it was not asked to review.',
        evidenceTargets: [FINDINGS_POINTER],
      },
      check: {
        op: 'for-all',
        collection: { pointer: FINDINGS_POINTER },
        // The review set is the ground truth's own file list, so this is membership
        // in that set. The pattern it replaced matched a bare name with a .ts or .js
        // extension, which named neither orders.service.ts nor any file under src/.
        predicate: {
          op: 'any',
          operands: [
            { op: 'equality', operands: [{ pointer: '@/file' }, { literal: null }] },
            { op: 'regex', operands: [{ pointer: '@/file' }], pattern: basenamesPattern(reviewedBasenames) },
          ],
        },
      },
    },
    {
      id: verdictOracleId,
      polarity: 'expects-hold',
      commentary:
        'The verdict is the contract. A findings array that disagrees with the severity counts beside it makes every rate computed from either one unreadable.',
      direction: {
        polarity: 'expects-hold',
        relation: 'all',
        scope: 'The verdict artifact taken as a whole.',
        negativeDomain: 'A verdict declaring severity counts with no findings array, or an array whose entries carry no registry row.',
        evidenceTargets: VERDICT_POINTERS,
      },
      check: {
        op: 'all',
        operands: [
          ...VERDICT_POINTERS.map((pointer) => ({ op: 'existence', operands: [{ pointer }] })),
          {
            op: 'for-all',
            collection: { pointer: FINDINGS_POINTER },
            predicate: {
              op: 'all',
              operands: ['row', 'file', 'line', 'severity'].map((field) => ({
                op: 'existence',
                operands: [{ pointer: `@/${field}` }],
              })),
            },
          },
        ],
      },
    },
    {
      id: exitOracleId,
      polarity: 'expects-hold',
      commentary:
        `${capitalize(numberWord(countBySeverity(plants, severityOfRow, ['CRITICAL'])))} CRITICAL rows are planted, and the registry computes Block ` +
        `from any CRITICAL, so exit 1 is the only correct outcome. Exit 0 means the review missed all ` +
        `${numberWord(countBySeverity(plants, severityOfRow, ['CRITICAL']))}. Exit 2 and exit 3 are environment and agent failures, and neither is a low score.`,
      direction: {
        polarity: 'expects-hold',
        relation: 'equality',
        scope: 'The exit code of the one review invocation.',
        negativeDomain: 'An exit code reporting an environment failure, an agent failure, or a usage error.',
        evidenceTargets: [EXIT_CODE_POINTER],
      },
      check: { op: 'equality', operands: [{ pointer: EXIT_CODE_POINTER }, { literal: 1 }] },
    },
  );

  // One behavior per planted row, in corpus order, so B-00n, O-00n and the nth
  // plant are one thing. See PLANT_SEVERITY_CLASSES for why the grouping is
  // per row rather than per severity class.
  const behaviorIdOfRow = new Map();
  const behaviors = plants.map((plant, index) => {
    const id = `B-${String(index + 1).padStart(3, '0')}`;
    behaviorIdOfRow.set(plant.row, id);
    const severityClass = plantSeverityClass(severityOfRow.get(plant.row));
    return {
      id,
      description: `The planted ${plant.row} defect at ${plant.basename}:${plant.line} is named at its registry row, in the right file, within the declared line window.`,
      severity: severityClass.grade,
      observableSuccessCriterion:
        `The verdict artifact carries a finding whose row is ${plant.row}, whose file is ${plant.basename}, and whose line is one of ` +
        `${plant.admittedLines.join(', ')}.`,
      requirementLinks: [{ scheme: 'tea-criteria-registry', id: plant.row }],
      riskLinks: [{ scheme: 'tea-eval-risk', id: severityClass.risk }],
      oracles: [oracleIdOfRow.get(plant.row)],
    };
  });

  const nextBehaviorId = (offset) => `B-${String(plants.length + offset).padStart(3, '0')}`;
  const [cleanBehaviorId, scopeBehaviorId, verdictBehaviorId] = [nextBehaviorId(1), nextBehaviorId(2), nextBehaviorId(3)];
  behaviors.push(
    {
      id: cleanBehaviorId,
      description: 'The clean control draws no finding.',
      severity: 'critical',
      observableSuccessCriterion: `No finding in the verdict artifact names ${cleanBasename}.`,
      requirementLinks: [{ scheme: 'tea-eval-ground-truth', id: clean.path }],
      riskLinks: [{ scheme: 'tea-eval-risk', id: 'reports-everything' }],
      oracles: [cleanOracleId],
    },
    {
      id: scopeBehaviorId,
      description: 'Findings stay inside the review set, because coverage belongs to the trace workflow.',
      severity: 'material',
      observableSuccessCriterion: 'Every located finding in the verdict artifact names one of the files under review.',
      requirementLinks: [{ scheme: 'tea-eval-ground-truth', id: scopeControl.id }],
      riskLinks: [{ scheme: 'tea-eval-risk', id: 'scope-creep-into-trace' }],
      oracles: [scopeOracleId],
    },
    {
      id: verdictBehaviorId,
      description: 'The verdict artifact is internally consistent and the run measured something.',
      severity: 'critical',
      observableSuccessCriterion:
        'The verdict carries a findings array, severity counts, a quality score, and a recommendation; every finding carries ' +
        'a row, a file, a line, and a severity; and the exit code is one of the two that report a measured verdict.',
      requirementLinks: [{ scheme: 'tea-cli-contract', id: 'verdict-payload' }],
      riskLinks: [{ scheme: 'tea-eval-risk', id: 'unmeasurable-run-scored-as-a-miss' }],
      oracles: [verdictOracleId, exitOracleId],
    },
  );

  const seededWithPlants = groundTruth.files.find((entry) => (entry.planted ?? []).length > 0);
  const criticalRows = sortRows(plants.filter((plant) => severityOfRow.get(plant.row) === 'CRITICAL').map((plant) => plant.row));

  return {
    schemaVersion: EVAL_CONTRACT_SCHEMA_VERSION,
    parentDigest: null,
    revisionCount: 0,
    contractId: 'tea-test-review-behavioral',
    // The registry is the specification the reviewer scores against, so a row
    // added or reworded there is a change to what this contract demands.
    sourceSpecDigest: digestOf([REGISTRY_PATH]),
    behaviors,
    oracles,
    rubrics: [
      {
        id: 'R-001',
        maxLength: 600,
        scaleLevels: [
          { level: 1, anchor: 'Every reported finding quotes the offending code and names the rule it violates.' },
          { level: 2, anchor: 'Every reported finding names the rule it violates and cites a location.' },
          { level: 3, anchor: 'A reported finding names a rule with no location, or a location with no rule.' },
        ],
        criteria: [
          {
            id: 'RC-001',
            text: 'Does each reported finding cite a location and a registry row that a reader could check against the file?',
            evidence: FINDINGS_POINTER,
          },
        ],
        failureModePenalties: [
          { name: 'unattributed-finding', description: 'A finding with no registry row, which cannot be compared across runners.' },
          { name: 'fabricated-location', description: 'A location that does not exist in the reviewed file.' },
        ],
      },
    ],
    waivers: [],
    permittedInterfaces: [
      {
        logicalId: 'tea-test-review',
        kind: 'cli',
        operations: [
          {
            operationId: 'review-test-files',
            invocation: { executable: 'tea-test-review', subcommandPath: [] },
            stateChangeMarker: true,
            requestShape: REVIEW_REQUEST_SHAPE,
            artifacts: ['verdict', 'report'],
            // One response descriptor per operation, with one field naming the
            // channel it describes. A descriptor per artifact would leave the
            // denominator of every rate computed off it with no single referent.
            descriptorChannel: { kind: 'artifact', artifactId: 'verdict' },
            responseDescriptor: verdictDescriptor(VERDICT_KEYS),
            volatilePointers: ['/report'],
            sensitivityWitness: {
              witnessId: 'review-reads-the-files',
              channel: 'option',
              legs: [
                witnessLeg('witness-seeded-only', `${FIXTURE_PREFIX}${seededWithPlants.path}`),
                witnessLeg('witness-clean-only', `${FIXTURE_PREFIX}${clean.path}`),
              ],
              relation: {
                op: 'not',
                operands: [
                  {
                    op: 'deep-equality',
                    operands: [
                      { pointer: '/interactions/witness-seeded-only/artifact/verdict/violations' },
                      { pointer: '/interactions/witness-clean-only/artifact/verdict/violations' },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    ],
    referenceSets: {
      'planted-critical-rows': {
        keys: ['row'],
        members: criticalRows.map((row) => ({ row })),
        commentary:
          `The ${numberWord(criticalRows.length)} CRITICAL rows the corpus plants. Keyed on the row alone because no row repeats ` +
          'in this corpus; a corpus that planted one row twice would need a composite key, and this contract would have to change with it.',
      },
    },
    siblingGroups: { operations: [], parameters: [] },
    interactionPlan: [
      {
        stepId: 'review-corpus',
        operationId: 'review-test-files',
        after: null,
        cardinality: 'exactly-one',
        inputBinding: {
          argument: null,
          option: {
            files: { literal: groundTruth.files.map((entry) => `${FIXTURE_PREFIX}${entry.path}`).join(',') },
            json: { matcher: 'any' },
            agent: { matcher: 'any' },
          },
          environment: null,
          stdin: null,
        },
      },
    ],
    scopedResources: null,
    forbiddenInputs: FORBIDDEN_INPUTS,
    testData: {
      setup:
        `The ${numberWord(groundTruth.files.length)} fixture files under ${FIXTURE_PREFIX} are checked in and carry the planted ` +
        'defects ground-truth.json records. No other setup runs.',
      cleanup: 'Delete the report and verdict the run wrote. The fixtures are read-only and are never modified.',
      principals: null,
      resources: null,
    },
    budgets: { maxToolCalls: 200, maxWallClockMinutes: 15, maxCostUsd: '2.00' },
    safetyLimits: [
      'The runner reads and writes only inside the disposable working directory the harness creates.',
      'No credential value appears in a prompt, an artifact, a log, or a result file.',
    ],
    requiredEvidence: [
      'The verdict artifact the run wrote, in full.',
      'The exit code of the review invocation.',
      'The review report the verdict points at.',
    ],
    probeStepBound: 4,
    fixtureReset: null,
  };
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function countBySeverity(plants, severityOfRow, severities) {
  return plants.filter((plant) => severities.includes(severityOfRow.get(plant.row))).length;
}

function stringShape(required, permitted) {
  return {
    requiredKeys: required,
    permittedKeys: permitted,
    types: Object.fromEntries(permitted.map((key) => [key, 'string'])),
  };
}

/**
 * One sensitivity-witness leg's supplied inputs, built from the operation's own
 * request shape.
 *
 * A leg is a request the port has to be able to issue, so it supplies every key
 * the shape requires. The key list is read from the shape rather than restated
 * here, which is the rule the verdict response descriptor already follows. The
 * test-review legs restated it and supplied only `files` against a shape
 * requiring `files`, `json` and `agent`, so the contract parsed and then failed
 * compilation under `undeclared-mandatory-input`.
 *
 * `stdin` stays the caller's. The request shape spells it as a key map and a leg
 * spells it as one tagged value, because a leg has to tell an absent standard
 * input from one carrying an empty string, and the compiler bridges the two
 * spellings itself.
 *
 * @param {object} requestShape - The operation's requestShape.
 * @param {object} values - Per-channel value maps covering every required key.
 * @param {object} stdin - The leg's tagged stdin value.
 * @returns {object}
 */
function witnessInputs(requestShape, values, stdin) {
  const inputs = { argument: {}, option: {}, environment: {}, stdin };
  for (const channel of ['argument', 'option', 'environment']) {
    for (const key of requestShape[channel].requiredKeys) {
      const supplied = values[channel] ?? {};
      assert(Object.hasOwn(supplied, key), `a witness leg supplies no value for the required ${channel} key "${key}"`);
      inputs[channel][key] = supplied[key];
    }
  }
  return inputs;
}

/**
 * The verdict path a witness leg asks for.
 *
 * Authored, and the same on both legs on purpose: the differential this witness
 * asserts is over `files`, so every other input has to be held fixed or the two
 * legs differ in more than the one thing the relation reads. It matches the name
 * test/eval-test-review.js writes into its run directory.
 */
const WITNESS_VERDICT_FILE = 'verdict.json';

const REVIEW_REQUEST_SHAPE = {
  argument: stringShape([], []),
  option: stringShape(['files', 'json', 'agent'], ['files', 'json', 'agent', 'model', 'output', 'project-root', 'skill-root', 'test-dir']),
  // Read from the runner exit-code module rather than authored, the same source
  // the other two commands' shapes come from. The authored list named three API
  // keys and forbade HOME, which is the variable cli/test-review.js resolves a
  // stored login through: eval-quality's command-line adapter closes the child
  // environment to PATH plus what the request declares, so a leg run against
  // that shape could authenticate only from an API key and a machine with a
  // keychain login could not run its own pre-flight at all.
  environment: stringShape([], vendorEnvironmentNames()),
  stdin: stringShape([], []),
};

function witnessLeg(legId, files) {
  return {
    legId,
    inputs: witnessInputs(
      REVIEW_REQUEST_SHAPE,
      { option: { files, json: WITNESS_VERDICT_FILE, agent: DEFAULT_AGENT } },
      { kind: 'absent' },
    ),
  };
}

// ---------------------------------------------------------------------------
// fragment-selection/<workflow>.contract.json
// ---------------------------------------------------------------------------

/**
 * The request shape of the command these eight contracts name, read from that
 * command instead of transcribed here.
 *
 * It was transcribed, against an executable nobody shipped, and it described a
 * runner that took `--model` and nothing else. `cli/fragment-selection-runner.js`
 * is that executable now, and it declares its own key sets, so the shape below
 * moves when the command's option surface moves and `--check` fails until the
 * contracts are regenerated. This is the idiom the verdict response descriptor
 * already follows for `tea-test-review`, and the reason is the one recorded
 * there: the transcribed version had drifted by seven keys before anybody
 * measured it.
 */
const SELECTION_REQUEST_SHAPE = Object.fromEntries(
  Object.entries(SELECTION_REQUEST_KEYS).map(([channel, keys]) => [channel, stringShape(keys.required, keys.permitted)]),
);

/**
 * The authored half of the eight fragment-selection contracts.
 *
 * Everything a case asserts is read from its evals.json entry. What lives here is
 * the reading of it: how hard a miss counts, which risk it names, which assertion
 * the behavior quotes, and the sentence that says what the case is about before
 * the quote. `witnessCases` names the two cases whose selections a differential
 * witness compares; it is null where no two cases mandate different sets, which is
 * checked below rather than trusted.
 */
const FRAGMENT_SELECTION = [
  {
    workflow: 'bmad-testarch-atdd',
    witnessCases: ['atdd-frontend-playwright', 'atdd-backend-pytest'],
    cases: {
      'atdd-frontend-playwright': {
        severity: 'material',
        risks: ['stack-branch-replaces-the-core-set'],
        assertionId: 'stack-branch-adds-not-replaces',
        lead: 'A frontend Playwright run loads the core set and the frontend branch on top of it.',
        successLead: 'The selection returned for atdd-frontend-playwright names all seven mandated fragments',
        includedCommentary:
          'The four core fragments plus the frontend branch and the playwright-utils mandate, which opens because the flag is on and the package is installed.',
        excludedCommentary:
          'This is a browser run with no .maestro directory and no pact artifact, so no mobile fragment and no contract fragment is in scope.',
      },
      'atdd-backend-pytest': {
        severity: 'critical',
        risks: ['mandate-opened-without-the-package', 'dom-fragment-in-a-backend-run'],
        assertionId: 'backend-branch-excludes-dom-fragments',
        lead: 'A backend pytest run loads the core set and the backend branch, and opens no library mandate.',
        successLead: 'The selection returned for atdd-backend-pytest names all seven mandated fragments',
        includedCommentary: 'The four core fragments plus the backend level and priority fragments and ci-burn-in.md.',
        excludedCommentary:
          'tea_use_playwright_utils is true and the repository has no package.json, so the mandate cannot open, and the DOM fragments are gated on frontend or fullstack while this run is backend.',
      },
      'atdd-fullstack-pact': {
        severity: 'material',
        risks: ['fullstack-branches-treated-as-exclusive'],
        assertionId: 'fullstack-takes-both-branches',
        lead: 'A fullstack run takes the frontend branch and the backend branch together.',
        successLead: 'The selection returned for atdd-fullstack-pact names all eight mandated fragments',
        includedCommentary:
          'Both branches fire for a fullstack run, and the pactjs-utils mandate opens because the flag is on and the package is installed.',
        excludedCommentary:
          'contract-testing.md is the flag-off path and the pactjs-utils mandate is open here, and the repository has no .maestro directory.',
      },
    },
  },
  {
    workflow: 'bmad-testarch-automate',
    witnessCases: ['automate-playwright-ui-utils-on', 'automate-mobile-maestro'],
    cases: {
      'automate-playwright-ui-utils-on': {
        severity: 'critical',
        risks: ['mobile-fragment-in-a-browser-run'],
        assertionId: 'no-mobile-bleed',
        lead: 'A Playwright browser suite loads the core set and the playwright-utils set, and no mobile fragment.',
        successLead: 'The selection returned for automate-playwright-ui-utils-on names all ten mandated fragments',
        includedCommentary:
          'The six core fragments plus the playwright-utils set. The step file also says to load the mandate first, because it governs how every other playwright-utils fragment is applied, but the harness scores set membership rather than order, so only its presence is measured here.',
        excludedCommentary:
          'The repository has no .maestro directory and no pact dependency, and a device-flow pattern leaking into a Playwright spec is the failure this exclusion exists to prevent.',
      },
      'automate-backend-pytest': {
        severity: 'critical',
        risks: ['mandate-opened-without-the-package'],
        assertionId: 'flag-is-not-enough',
        lead: 'A pytest service run loads the stack-neutral core set and opens no library mandate.',
        successLead: 'The selection returned for automate-backend-pytest names all six core fragments',
        includedCommentary: 'The six core fragments are stack-neutral and load for a pytest suite exactly as they do for Playwright.',
        excludedCommentary:
          'The flag is on and the package is absent because the repository carries no JavaScript manifest, so the mandate stays closed and the browser fragments it governs stay out.',
      },
      'automate-mobile-maestro': {
        severity: 'critical',
        risks: ['browser-fragment-in-a-mobile-run'],
        assertionId: 'browser-fragments-excluded',
        lead: 'A Maestro device run loads the mobile profile and no browser fragment.',
        successLead: 'The selection returned for automate-mobile-maestro names all six mandated fragments',
        includedCommentary:
          'The three mobile fragments plus the level, priority, and quality fragments. A .maestro directory selects the mobile profile whatever test_dir holds and whatever react-native makes package.json look like.',
        excludedCommentary: 'A device flow has no DOM and no request interceptor, so the four browser fragments are excluded by name.',
      },
      'automate-pact-consumer': {
        severity: 'material',
        risks: ['two-competing-sources-for-one-code-shape'],
        assertionId: 'utils-path-not-vanilla-path',
        lead: 'A Pact consumer run with pactjs-utils installed takes the utils path and not the vanilla path.',
        successLead: 'The selection returned for automate-pact-consumer names all six pactjs-utils fragments',
        includedCommentary:
          'The pactjs-utils mandate and its five companion fragments, because the flag is on and both packages are installed.',
        excludedCommentary:
          'contract-testing.md is the flag-off path and would compete with the open mandate for the same code shape, and the repository has no .maestro directory.',
      },
      'automate-backend-junit': {
        severity: 'critical',
        risks: ['mandate-opened-without-the-package'],
        assertionId: 'two-flags-two-closed-gates',
        lead: 'A Maven JUnit run loads the stack-neutral core set and opens neither library mandate.',
        successLead: 'The selection returned for automate-backend-junit names all six core fragments',
        includedCommentary: 'The six core fragments, which are stack-neutral and apply to a Maven project unchanged.',
        excludedCommentary:
          'Both library flags are true and a Maven project has no JavaScript manifest, so neither package can be installed and neither mandate can open.',
      },
    },
  },
  {
    workflow: 'bmad-testarch-ci',
    witnessCases: ['ci-gitlab-python', 'ci-pact-consumer-pipeline'],
    cases: {
      'ci-gitlab-python': {
        severity: 'critical',
        risks: ['mandate-opened-without-the-package', 'platform-treated-as-a-fragment-axis'],
        assertionId: 'burn-in-utility-needs-the-package',
        lead: 'A GitLab pipeline for a Python service needs one burn-in fragment and nothing else.',
        successLead: 'The selection returned for ci-gitlab-python names ci-burn-in.md',
        includedCommentary:
          'ci-burn-in.md is the burn-in guidance for every platform. GitLab rather than GitHub Actions changes the template that gets written, not which knowledge the run needs, and treating the two as linked is how a workflow ends up implicitly GitHub-only.',
        excludedCommentary:
          'A Python repository with no package.json satisfies neither half of the utility precondition, and it carries no pact artifact and no .maestro directory, so the utility path and the Pact path both stay closed.',
      },
      'ci-pact-consumer-pipeline': {
        severity: 'critical',
        risks: ['deploy-gate-built-without-its-webhook-fragment', 'provider-verifier-skipped-as-provider-side-reading'],
        assertionId: 'webhooks-are-part-of-the-gate',
        lead: 'A consumer pipeline with contract tests needs the broker and verifier fragments that make its deploy gate work.',
        successLead: 'The selection returned for ci-pact-consumer-pipeline names all five mandated fragments',
        includedCommentary:
          'The burn-in fragment, the Pact consumer setup, both pactjs-utils helper fragments, and the broker webhooks fragment. The provider verifier is required even on a consumer-only pipeline, because the vitest pool and singleFork rule it carries applies to consumer and provider alike.',
        excludedCommentary:
          'contract-testing.md is the flag-off path and pactjs-utils is enabled and installed here, and the repository has no .maestro directory and no device lab.',
      },
    },
  },
  {
    workflow: 'bmad-testarch-framework',
    witnessCases: ['framework-mobile-scaffold', 'framework-python-backend'],
    cases: {
      'framework-mobile-scaffold': {
        severity: 'critical',
        risks: ['browser-fragment-in-a-mobile-run'],
        assertionId: 'browser-fragments-excluded-by-name',
        lead: 'Scaffolding a mobile framework loads the mobile set and no browser fragment.',
        successLead: 'The selection returned for framework-mobile-scaffold names all six mandated fragments',
        includedCommentary:
          'The three mobile fragments plus the level, priority, and quality fragments. mobile-test-strategy.md is marked CRITICAL and load-first because it decides which behaviors become device flows at all, and the step file says most should not.',
        excludedCommentary:
          'A device flow has no DOM and no request interceptor, so the three browser fragments are excluded by name, and a scaffolded project keeps whatever it is set up with.',
      },
      'framework-greenfield-playwright-utils': {
        severity: 'critical',
        risks: ['wrong-pattern-scaffolded-into-every-later-run'],
        assertionId: 'scaffolded-samples-are-copied-forever',
        lead: 'Scaffolding a browser framework with playwright-utils enabled loads the whole utils set plus the stack-gated interceptor fragment.',
        successLead: 'The selection returned for framework-greenfield-playwright-utils names all eleven mandated fragments',
        includedCommentary:
          'The playwright-utils set, which loads whenever the flag is on and the package is installed, plus intercept-network-call.md, which is added only when the detected stack is frontend or fullstack.',
        excludedCommentary:
          'The repository has no .maestro directory and no pact artifact, and tea_use_pactjs_utils is off, so nothing mobile and nothing contract-related is in scope.',
      },
      'framework-python-backend': {
        severity: 'critical',
        risks: ['mandate-opened-without-the-package', 'pact-relevance-read-off-the-flag'],
        assertionId: 'both-mandates-stay-closed',
        lead: 'Scaffolding for a Python service with no JavaScript loads two stack-neutral fragments and opens neither mandate.',
        successLead: 'The selection returned for framework-python-backend names test-quality.md and data-factories.md',
        includedCommentary: 'Two stack-neutral fragments are the whole answer for a FastAPI service with no JavaScript manifest.',
        excludedCommentary:
          'Both flags default true and a repository with no package.json can have neither package installed. The Pact relevance gate is a property of the repository, and this one has no pact artifact, no broker variable, and no separate provider.',
      },
    },
  },
  {
    workflow: 'bmad-testarch-nfr',
    witnessCases: ['nfr-backend-junit-no-browser', 'nfr-browser-automation-cli'],
    cases: {
      'nfr-backend-junit-no-browser': {
        severity: 'critical',
        risks: ['mandate-opened-without-the-package'],
        assertionId: 'both-mandates-stay-closed',
        lead: 'An NFR assessment on a JVM service loads the unconditional required set and opens neither mandate.',
        successLead:
          'The selection returned for nfr-backend-junit-no-browser names all five required fragments, playwright-config.md included,',
        includedCommentary:
          'The step file names all five as required with no stack condition, including playwright-config.md. Ground truth here is the step file as written; if that unconditional include is wrong it is a bug in the workflow, and this case is what would make it visible.',
        excludedCommentary:
          'Both flags default true and a Gradle repository with no JavaScript manifest can carry neither package. playwright-cli.md is gated on tea_browser_automation, which this run sets to none; the paired case sets the same key to cli and is where the fragment must load.',
      },
      'nfr-browser-automation-cli': {
        severity: 'material',
        risks: ['config-gated-fragment-missed'],
        assertionId: 'cli-branch-fires-on-the-config-value',
        lead: 'An NFR assessment with browser automation set to cli adds one config-gated fragment to the required set.',
        successLead: 'The selection returned for nfr-browser-automation-cli names all six mandated fragments, playwright-cli.md included,',
        includedCommentary:
          'The five unconditional fragments plus playwright-cli.md, which the cli setting of tea_browser_automation turns on.',
        excludedCommentary: 'The repository has no .maestro directory and no pact artifact.',
      },
    },
  },
  {
    workflow: 'bmad-testarch-test-design',
    witnessCases: ['test-design-system-level', 'test-design-epic-level'],
    cases: {
      'test-design-system-level': {
        severity: 'material',
        risks: ['system-required-list-incomplete'],
        assertionId: 'system-required-list-is-complete',
        lead: 'A system-level design loads the whole System-Level required list.',
        successLead: 'The selection returned for test-design-system-level names all five System-Level required fragments',
        includedCommentary: 'The System-Level required list, all five of it.',
        excludedCommentary: 'The repository has no .maestro directory and no pact artifact, and tea_use_pactjs_utils is off.',
      },
      'test-design-epic-level': {
        severity: 'material',
        risks: ['system-level-set-loaded-for-an-epic'],
        assertionId: 'mode-narrows-the-set',
        lead: 'An epic-level design loads the shorter Epic-Level list and leaves the conditional NFR fragment out.',
        successLead: 'The selection returned for test-design-epic-level names all four Epic-Level required fragments',
        includedCommentary: 'The Epic-Level required list, which is the shorter of the two.',
        excludedCommentary:
          'adr-quality-readiness-checklist.md belongs to the System-Level list, and this epic states no security, performance, reliability, scalability, compliance, maintainability, or operational requirement.',
      },
      'test-design-epic-with-nfrs': {
        severity: 'material',
        risks: ['conditional-nfr-load-missed'],
        assertionId: 'nfr-condition-fires',
        lead: 'An epic-level design whose epic carries NFRs adds the conditional NFR fragment.',
        successLead:
          'The selection returned for test-design-epic-with-nfrs names all four Epic-Level required fragments plus nfr-criteria.md,',
        includedCommentary:
          'The Epic-Level required list plus nfr-criteria.md, because the epic states a tenant isolation requirement and a 30 second latency budget.',
        excludedCommentary: 'The repository has no .maestro directory.',
      },
      'test-design-pact-consumer-is-a-frontend': {
        severity: 'material',
        risks: ['pact-relevance-gated-on-the-stack'],
        assertionId: 'relevance-is-not-a-stack-question',
        lead: 'Pact relevance is decided by the artifacts in the repository.',
        successLead:
          'The selection returned for test-design-pact-consumer-is-a-frontend names pactjs-utils-mandate.md alongside the three Epic-Level fragments,',
        includedCommentary:
          'The mandate loads because the .pacttest.ts files are present and the flag is on, on a repository whose detected stack is frontend.',
        excludedCommentary:
          'contract-testing.md is the flag-off path and the mandate is open here, and the repository has no .maestro directory.',
      },
      'test-design-backend-junit': {
        severity: 'critical',
        risks: ['mandate-opened-without-the-package'],
        assertionId: 'default-true-flag-still-needs-relevance',
        lead: 'An epic-level design on a Gradle service loads the Epic-Level list and nothing Pact-related.',
        successLead: 'The selection returned for test-design-backend-junit names all four Epic-Level required fragments',
        includedCommentary:
          'The Epic-Level required list. A Gradle repository with no package.json gets the same risk and level fragments as a JavaScript one, and fragment selection that degrades on a JVM repo is TEA failing at the stack-agnostic claim it makes.',
        excludedCommentary:
          'The flag defaults true and the repository has no pact artifact, no broker variable, and no JavaScript manifest, so nothing Pact-related and nothing playwright-related can load.',
      },
    },
  },
  {
    workflow: 'bmad-testarch-test-review',
    witnessCases: ['test-review-maestro-flow-set', 'test-review-java-suite'],
    cases: {
      'test-review-maestro-flow-set': {
        severity: 'critical',
        risks: ['flow-scored-against-predicates-that-cannot-match'],
        assertionId: 'without-these-a-flow-scores-100-by-matching-nothing',
        lead: 'Reviewing a Maestro flow needs the two mobile fragments and drops one core fragment.',
        successLead: 'The selection returned for test-review-maestro-flow-set names all eight mandated fragments',
        includedCommentary:
          'The core review set with selector-resilience removed, plus the two mobile fragments the mobile registry rows need.',
        excludedCommentary:
          'Maestro addresses elements by native accessibility id rather than DOM selector, so selector-resilience.md is the one core fragment the step file removes, and the repository has no @playwright/test and no playwright-utils.',
      },
      'test-review-java-suite': {
        severity: 'critical',
        risks: ['mandate-opened-without-the-package'],
        assertionId: 'both-mandates-stay-closed',
        lead: 'Reviewing a JUnit suite keeps the whole core set and opens neither mandate.',
        successLead:
          'The selection returned for test-review-java-suite names all seven core review fragments, selector-resilience.md included,',
        includedCommentary:
          'The full core review set. The mobile branch is gated on the detected stack or on a Maestro flow being in the review set, and neither holds, so selector-resilience stays in the core set rather than being skipped.',
        excludedCommentary:
          'A Maven repository has no JavaScript manifest, so neither package can be installed and neither mandate loads, and neither the detected stack nor the review set is mobile.',
      },
    },
  },
  {
    workflow: 'bmad-testarch-trace',
    witnessCases: null,
    cases: {
      'trace-go-service-no-js': {
        severity: 'critical',
        risks: ['mandate-opened-without-the-package'],
        assertionId: 'both-mandates-stay-closed',
        lead: 'Traceability on a Go service loads the five stack-neutral fragments and opens neither mandate.',
        successLead: 'The selection returned for trace-go-service-no-js names all five required fragments',
        includedCommentary:
          'The five required fragments. Traceability is a mapping problem, so the required set is the same five whatever the stack.',
        excludedCommentary:
          'A Go module with no JavaScript manifest can carry neither package, and pulling in browser or contract fragments because the epic mentions an API is over-loading.',
      },
      'trace-mobile-epic': {
        severity: 'material',
        risks: ['mobile-branch-invented-for-a-stack-neutral-workflow'],
        assertionId: 'presence-of-flows-does-not-change-the-set',
        lead: 'Traceability on a mobile epic loads the same five fragments as every other trace run.',
        successLead: 'The selection returned for trace-mobile-epic names the same five required fragments as every other trace run,',
        includedCommentary:
          'The same five required fragments as the Go case. The presence of device flows changes what is traced, not which fragments the workflow needs.',
        excludedCommentary: 'The trace step file names no browser branch, so the browser fragments sit outside its required set.',
      },
    },
  },
];

/** "does not name a.md." for one, "neither a.md nor b.md." for two, "none of a.md, b.md, or c.md." past that. */
function excludeSentence(caseId, fragments) {
  const lead = `The selection returned for ${caseId}`;
  if (fragments.length === 1) return `${lead} does not name ${fragments[0]}.`;
  if (fragments.length === 2) return `${lead} names neither ${fragments[0]} nor ${fragments[1]}.`;
  return `${lead} names none of ${fragments.slice(0, -1).join(', ')}, or ${fragments.at(-1)}.`;
}

/**
 * One authored lead as a finished sentence.
 *
 * Several leads end on a trailing comma, because each used to be completed by
 * the exclusion clause that followed it in one grouped success criterion. The
 * two halves are two behaviors now, so the containment half closes itself.
 */
function successSentence(lead) {
  return `${lead.replace(/,$/, '')}.`;
}

/**
 * The authored success sentence, checked against the case it describes.
 *
 * The lead is prose and cannot be templated, because the eight workflows name
 * their required sets in eight different ways. These two checks are what stop it
 * describing a set the eval data no longer holds: every fragment it names by file
 * must be one the case mentions, and a lead of the plain "names all N ... fragments"
 * shape must agree with how many the case actually mandates.
 */
function checkSuccessLead(caseId, lead, expectations) {
  const known = new Set([...expectations.mustLoad, ...expectations.mustNotLoad]);
  for (const fragment of lead.match(/[\w-]+\.md/g) ?? []) {
    assert(known.has(fragment), `${caseId}: the success criterion names ${fragment}, which the case neither requires nor forbids`);
  }
  const counted = / names all ([a-z]+) [A-Za-z -]*fragments(?:,|$)/.exec(lead);
  if (counted) {
    assert(
      counted[1] === numberWord(expectations.mustLoad.length),
      `${caseId}: the success criterion says "all ${counted[1]}" and the case mandates ${expectations.mustLoad.length} fragment(s)`,
    );
  }
}

function containmentOracle(id, caseId, expectations, commentary) {
  const pointer = `/interactions/${caseId}/stdout/fragments`;
  return {
    id,
    polarity: 'expects-hold',
    commentary,
    direction: {
      polarity: 'expects-hold',
      relation: 'containment',
      scope: `The fragment list returned for ${caseId}, against the ${expectations.mustLoad.length} fragments the step file mandates for it.`,
      negativeDomain: 'A selection that omits any mandated fragment.',
      evidenceTargets: [pointer],
    },
    check: { op: 'containment', operands: [{ pointer }, { literal: expectations.mustLoad }] },
  };
}

function exclusionOracle(id, caseId, expectations, commentary) {
  const pointer = `/interactions/${caseId}/stdout/fragments`;
  return {
    id,
    polarity: 'expects-hold',
    commentary: `The ${expectations.mustNotLoad.length} fragments the step file excludes for ${caseId}. ${commentary}`,
    direction: {
      polarity: 'expects-hold',
      relation: 'not',
      scope: `Every fragment returned for ${caseId}, searched for any the step file excludes.`,
      negativeDomain: `A selection carrying any of ${expectations.mustNotLoad.join(', ')}.`,
      evidenceTargets: [pointer],
    },
    check: {
      op: 'not',
      operands: [
        {
          op: 'for-any',
          collection: { pointer },
          // `@/` addresses the bound element itself, which is what a collection of
          // plain strings needs; there is no field on it to point at.
          predicate: { op: 'set-membership', operands: [{ pointer: '@/' }, { literal: expectations.mustNotLoad }] },
        },
      ],
    },
  };
}

function buildFragmentSelectionContract(spec) {
  const { workflow } = spec;
  const workflowDir = path.join(WORKFLOW_ROOT, workflow);
  const evals = JSON.parse(fs.readFileSync(path.join(EVAL_ROOT, workflow, 'evals.json'), 'utf8'));
  assert(evals.workflow === workflow, `${workflow}: evals.json declares workflow "${evals.workflow}"`);

  const authoredIds = Object.keys(spec.cases);
  const caseIds = evals.cases.map((entry) => entry.id);
  assert(
    authoredIds.length === caseIds.length && authoredIds.every((id, index) => id === caseIds[index]),
    `${workflow}: this generator carries prose for [${authoredIds.join(', ')}] and evals.json holds [${caseIds.join(', ')}]`,
  );

  // The selection can never name more fragments than the index offers, so the
  // cardinality bound is counted from the index.
  const indexRows = parse(fs.readFileSync(path.join(workflowDir, 'resources', 'tea-index.csv'), 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });

  const behaviors = [];
  const oracles = [];
  for (const [index, entry] of evals.cases.entries()) {
    const authored = spec.cases[entry.id];
    const assertion = entry.assertions.find((candidate) => candidate.id === authored.assertionId);
    assert(assertion, `${entry.id}: no assertion "${authored.assertionId}" in evals.json`);
    assert(entry.expect.mustLoad.length > 0, `${entry.id}: mandates no fragment, so the containment oracle would be vacuous`);
    assert(entry.expect.mustNotLoad.length > 0, `${entry.id}: forbids no fragment, so the exclusion oracle would be vacuous`);
    checkSuccessLead(entry.id, authored.successLead, entry.expect);

    const containmentId = `O-${String(2 * index + 1).padStart(3, '0')}`;
    const exclusionId = `O-${String(2 * index + 2).padStart(3, '0')}`;
    oracles.push(
      containmentOracle(containmentId, entry.id, entry.expect, authored.includedCommentary),
      exclusionOracle(exclusionId, entry.id, entry.expect, authored.excludedCommentary),
    );
    // Two behaviors per case, one per oracle, rather than one behavior over
    // both. `eval-quality`'s `designatedOracleIdOf` resolves AD-40's designated
    // oracle only for a behavior declaring exactly one, and with none resolved
    // `score` votes a probe's trial with the first oracle's state instead of the
    // one the probe's own behavior names. A gameability probe against the
    // exclusion oracle would then be measured against the containment oracle of
    // the first case in the file. Splitting demands nothing new: the same two
    // oracles, both required, at the same severity.
    const requirementLinks = evals.contextFiles.map((file) => ({ scheme: 'tea-workflow-step', id: `${workflow}/${file}` }));
    const riskLinks = authored.risks.map((risk) => ({ scheme: 'tea-eval-risk', id: risk }));
    behaviors.push(
      {
        id: `B-${String(2 * index + 1).padStart(3, '0')}`,
        description: `${authored.lead} The case asserts: "${assertion.text}"`,
        severity: authored.severity,
        observableSuccessCriterion: successSentence(authored.successLead),
        requirementLinks,
        riskLinks,
        oracles: [containmentId],
      },
      {
        id: `B-${String(2 * index + 2).padStart(3, '0')}`,
        description: `The same case, read for what it must leave out. ${authored.lead} The case asserts: "${assertion.text}"`,
        severity: authored.severity,
        observableSuccessCriterion: excludeSentence(entry.id, entry.expect.mustNotLoad),
        requirementLinks,
        riskLinks,
        oracles: [exclusionId],
      },
    );
  }

  return {
    schemaVersion: EVAL_CONTRACT_SCHEMA_VERSION,
    parentDigest: null,
    revisionCount: 0,
    contractId: `tea-fragment-selection-${workflow.replace('bmad-testarch-', '')}`,
    // The deciding step files, concatenated in the order evals.json lists them.
    // An edit to what the run is asked changes this digest.
    sourceSpecDigest: digestOf(evals.contextFiles.map((file) => path.join(workflowDir, file))),
    behaviors,
    oracles,
    rubrics: [],
    waivers: [],
    permittedInterfaces: [
      {
        logicalId: 'tea-fragment-selection-runner',
        kind: 'cli',
        operations: [
          {
            operationId: 'select-fragments',
            invocation: { executable: 'tea-fragment-selection-runner', subcommandPath: [] },
            stateChangeMarker: false,
            requestShape: SELECTION_REQUEST_SHAPE,
            artifacts: [],
            descriptorChannel: { kind: 'stream', channel: 'stdout' },
            responseDescriptor: {
              requiredKeys: ['fragments'],
              permittedKeys: ['fragments'],
              types: { fragments: 'array' },
              successIndicator: '/fragments',
              channelRoles: { '/fragments': 'collection' },
              collectionLocations: [
                { pointer: '/fragments', referenceSet: null, expectedCardinality: { mode: 'at-most', max: indexRows.length } },
              ],
            },
            volatilePointers: [],
            sensitivityWitness: buildSelectionWitness(spec, evals),
          },
        ],
      },
    ],
    referenceSets: {},
    siblingGroups: { operations: [], parameters: [] },
    interactionPlan: evals.cases.map((entry) => ({
      stepId: entry.id,
      operationId: 'select-fragments',
      after: null,
      cardinality: 'exactly-one',
      // The agent is bound as `any` rather than pinned: which vendor answered is
      // the runner record's to state, and a literal here would make every case
      // in the plan a claim about one vendor.
      inputBinding: { argument: null, option: { agent: { matcher: 'any' } }, environment: null, stdin: { prompt: { matcher: 'any' } } },
    })),
    scopedResources: null,
    forbiddenInputs: FORBIDDEN_INPUTS,
    testData: {
      setup:
        `Every case runs against the checked-in ${workflow} workflow: its step file or files named in requirementLinks, and its ` +
        `resources/tea-index.csv. The harness assembles one prompt per case from those files plus the case's task, repository facts, ` +
        `and TEA config, and writes it to the runner's standard input. The prompt bytes are evidence rather than declaration. This ` +
        `contract states what must be true of each case's selection, and the sealed run record carries the digest of the prompt that ` +
        `produced it, so a step-file edit that changes what the runner was asked shows up in the record instead of hiding inside a literal here.`,
      cleanup:
        'Nothing is written. The runner reads a prompt from standard input and prints one JSON object to standard output; the workflow files and the eval data are read-only for the whole run.',
      principals: null,
      resources: null,
    },
    // Five tool calls, five minutes and a quarter of a dollar per case is what the
    // harness has spent, and the bound scales with the case list, so adding a case
    // needs no new number here.
    budgets: {
      maxToolCalls: 5 * evals.cases.length,
      maxWallClockMinutes: 5 * evals.cases.length,
      maxCostUsd: (0.25 * evals.cases.length).toFixed(2),
    },
    safetyLimits: [
      'The runner receives a minimal environment: PATH, HOME, USER, LOGNAME, the locale and proxy variables, and the selected vendor credential variables. Nothing else is passed through.',
      'No credential value appears in a prompt, in a selection, or in a result file.',
      'The runner writes nothing. The workflow step files, resources/tea-index.csv, and the eval data are read-only for the whole run.',
    ],
    requiredEvidence: [
      'The JSON object the runner printed on standard output for every case, in full.',
      'The exit code of every case invocation.',
      'The digest of the prompt each case was given, so a step-file edit that changed the question is visible in the record.',
    ],
    // One step per case, plus room for the two probe steps the compiler may add.
    probeStepBound: evals.cases.length + 2,
    fixtureReset: null,
  };
}

/**
 * The two-leg witness over the prompt: a differential between two named cases
 * that mandate different fragment sets, or, for a workflow whose cases all
 * mandate the same one, an invariance claim over the first two of them.
 *
 * `SELECTION_REQUEST_SHAPE` declares request keys on every fragment-selection
 * operation, so AD-10 requires a witness here whether or not the suite has
 * anything to differentiate. The relation is the author's to choose: a
 * workflow insensitive to its declared inputs by design gets a witness whose
 * relation says so, a true and checkable claim, and the weaker guarantee that
 * follows from it rather than the one a differential establishes.
 *
 * The relation addresses the legs this witness declares. A leg is its own
 * interaction: it runs with its own input and its evidence lands under its own leg
 * id, so a pointer at a plan step names evidence the witness never produced. The
 * leg ids are built once here and used for both the legs and the relation, so the
 * two cannot drift apart again.
 */
function buildSelectionWitness(spec, evals) {
  const mustLoadOf = new Map(evals.cases.map((entry) => [entry.id, JSON.stringify(entry.expect.mustLoad)]));
  let first;
  let second;
  let invariant;
  if (spec.witnessCases === null) {
    const distinct = new Set(mustLoadOf.values());
    assert(
      distinct.size === 1,
      `${spec.workflow}: declares no differential witness, but its cases mandate ${distinct.size} different fragment sets`,
    );
    assert(evals.cases.length >= 2, `${spec.workflow}: an invariance witness needs at least two cases to compare`);
    [first, second] = evals.cases.map((entry) => entry.id);
    invariant = true;
  } else {
    [first, second] = spec.witnessCases;
    assert(mustLoadOf.has(first) && mustLoadOf.has(second), `${spec.workflow}: the witness names a case evals.json does not carry`);
    assert(
      mustLoadOf.get(first) !== mustLoadOf.get(second),
      `${spec.workflow}: the witness compares ${first} and ${second}, which mandate the same fragment set`,
    );
    invariant = false;
  }
  const legs = [first, second].map((caseId) => {
    const entry = evals.cases.find((candidate) => candidate.id === caseId);
    assert(entry, `${spec.workflow}: the witness names case ${caseId}, which evals.json does not carry`);
    return { caseId, legId: `witness-${caseId}`, prompt: buildSelectionPrompt({ dir: spec.workflow, data: evals }, entry) };
  });
  const equality = {
    op: 'deep-equality',
    operands: legs.map(({ legId }) => ({ pointer: `/interactions/${legId}/stdout/fragments` })),
  };
  return {
    witnessId: invariant ? 'selection-is-invariant-under-the-prompt' : 'selection-follows-the-prompt',
    channel: 'stdin',
    // Built through witnessInputs for the same reason the test-review legs are:
    // the required key list belongs to the request shape. The runner requires
    // one option and the two legs hold it fixed, because the differential this
    // witness asserts is over the prompt: a leg that also changed the agent
    // would let a difference in the two selections come from the vendor.
    legs: legs.map(({ legId, prompt }) => ({
      legId,
      inputs: witnessInputs(SELECTION_REQUEST_SHAPE, { option: { agent: SELECTION_DEFAULT_AGENT } }, { kind: 'text', value: prompt }),
    })),
    // A differential asserts the two legs disagree; an invariance claim asserts
    // they agree. Same equality expression, negated only in the first case.
    relation: invariant ? equality : { op: 'not', operands: [equality] },
  };
}

// ---------------------------------------------------------------------------
// trace.contract.json
// ---------------------------------------------------------------------------

// The interface and operation ids are the harness's, imported above, so the
// request the harness issues and the operation the contract declares cannot
// spell them differently.

/** The plan step one fixture set is traced under, and the root of every pointer into what that step wrote. */
function traceStepId(set) {
  return `trace-${set.id}`;
}

function traceSummaryPointer(set, field) {
  return `/interactions/${traceStepId(set)}/artifact/summary${field}`;
}

/** The six coverage levels step-04 buckets tests into, in the order the summary lists them. */
const TRACE_LEVELS = ['e2e', 'api', 'component', 'unit', 'live', 'other'];
const TRACE_PRIORITIES = ['P0', 'P1', 'P2', 'P3'];

const TRACE_REQUEST_SHAPE = Object.fromEntries(
  Object.entries(TRACE_REQUEST_KEYS).map(([channel, keys]) => [channel, stringShape(keys.required, keys.permitted)]),
);

function equalsPointer(pointer, literal) {
  return { op: 'equality', operands: [{ pointer }, { literal }] };
}

function allOf(operands) {
  return operands.length === 1 ? operands[0] : { op: 'all', operands };
}

/**
 * The key set of `e2e-trace-summary.json`, read out of step-05's own object
 * literal rather than transcribed here.
 *
 * Step-05 section 3b builds the summary as one `const e2eTraceSummary = {...}`
 * whose top-level keys sit at a two-space indent, then adds `waivers` when a
 * register exists and `gate_status` and `gate_criteria` when the gate was
 * eligible, by assignment. The always-present keys are the literal's; the
 * conditional ones are the assignment targets. A key the workflow gains lands
 * here without an edit and `--check` fails until the contract is regenerated,
 * which is the rule the verdict descriptor already follows for tea-test-review.
 */
function summaryKeysFromStep05() {
  const text = fs.readFileSync(TRACE_STEP_05, 'utf8');
  const start = text.indexOf('const e2eTraceSummary = {');
  assert(start !== -1, 'step-05 no longer declares `const e2eTraceSummary = {`, so the summary key set cannot be read');
  const end = text.indexOf('\n};', start);
  assert(end !== -1, 'step-05 declares `const e2eTraceSummary = {` and never closes it');
  const always = [];
  for (const line of text.slice(start, end).split('\n')) {
    const key = /^ {2}([a-z_]+):/.exec(line);
    if (key) always.push(key[1]);
  }
  const conditional = [...new Set([...text.matchAll(/^\s*e2eTraceSummary\.([a-z_]+) = /gm)].map((match) => match[1]))];
  assert(always.length > 0, "no top-level key was read off step-05's summary literal");
  for (const key of conditional) {
    assert(!always.includes(key), `step-05 both declares "${key}" in the summary literal and assigns it afterwards`);
  }
  return { always, conditional };
}

/**
 * Authored: the JSON type of each summary key an oracle here reads, for the
 * response descriptor. Every other key is declared with its type unstated, which
 * the descriptor permits, because the contract asserts nothing about it and a
 * transcribed type nobody checks is the drift this generator exists to refuse.
 */
const TRACE_SUMMARY_TYPES = {
  schema_version: 'string',
  collection_mode: 'string',
  collection_status: 'string',
  inventory_basis: 'string',
  gate_basis: 'string',
  oracle: 'object',
  coverage: 'object',
  risk_summary: 'object',
  live_evidence: 'object',
  blockers: 'array',
  rejected_evidence: 'array',
  waivers: 'object',
  gate_status: 'string',
  gate_criteria: 'object',
};

function traceSummaryDescriptor(keys, cardinalityBound) {
  return {
    requiredKeys: keys.always,
    permittedKeys: [...keys.always, ...keys.conditional],
    types: Object.fromEntries([...keys.always, ...keys.conditional].map((key) => [key, TRACE_SUMMARY_TYPES[key] ?? null])),
    successIndicator: '/gate_status',
    channelRoles: {
      '/gate_status': 'success-indicator',
      '/blockers': 'collection',
      '/rejected_evidence': 'collection',
      '/coverage': 'payload',
      '/gate_criteria': 'payload',
      '/live_evidence': 'payload',
      '/waivers': 'payload',
    },
    // A blocker is a live record or a skipped test and a rejection is a test, so
    // neither collection can plausibly outgrow the corpus's own test count by an
    // order of magnitude. The bound is authored as that: a plausibility ceiling,
    // scaled from the largest criterion set.
    collectionLocations: ['/blockers', '/rejected_evidence'].map((pointer) => ({
      pointer,
      referenceSet: null,
      expectedCardinality: { mode: 'at-most', max: cardinalityBound },
    })),
  };
}

/** The lines a citation may land on and still resolve to a recorded span, at the corpus's declared tolerance. */
function admittedLines(entry, tolerance) {
  const lines = [];
  for (let line = entry.line - tolerance; line <= entry.lineEnd + tolerance; line += 1) lines.push(line);
  return lines;
}

/**
 * Every oracle the trace contract states, one spec per claim, in the order they
 * are numbered.
 *
 * Each spec carries the oracle as the contract will render it and, beside it, the
 * scorer's answer for the same evidence as a function over one `scoreRun` result.
 * test/test-contract-oracles.js reads the second half: an oracle here may never
 * contradict `scoreRun` on the same summary and matrix, and this is the one place
 * the correspondence between an oracle and the check it restates is written.
 * `scorer` returns true where the harness passed the check, false where it
 * failed, and undefined where the harness did not score it at all, which is how
 * the waiver oracles behave when the gate did not match: scoreWaivers skips them
 * so that one wrong gate is not scored three times, and the oracle check skips
 * them with it.
 *
 * Every claim is something ground-truth.json states. The one derivation is
 * `gate_basis`, which step-05 sets from the gate eligibility the ground truth
 * records under `collection`, and the one restated rule is `oracle.synthetic`,
 * which step-01 sets only for an inferred oracle and every set here resolved
 * formal requirements.
 *
 * @returns {Array<{id: string, kind: string, setId: string, oracle: object, scorer: Function}>}
 */
function traceOracleSpecs(groundTruth) {
  const tolerance = groundTruth.evidenceLineTolerance;
  assert(Number.isInteger(tolerance), 'ground-truth.json declares no integer evidenceLineTolerance');
  const specs = [];
  const push = (setId, kind, oracle, scorer) =>
    specs.push({ id: `O-${String(specs.length + 1).padStart(3, '0')}`, kind, setId, oracle, scorer });
  const okOf = (checks, fields) => {
    const named = checks.filter((item) => fields.includes(item.field));
    return named.length === fields.length && named.every((item) => item.ok);
  };

  for (const set of groundTruth.fixtureSets) {
    const at = (field) => traceSummaryPointer(set, field);
    const label = set.id;
    const arithmetic = set.coverageArithmetic;
    const gate = set.expectedGate;
    assert(gate?.decision && gate.gateCriteria, `${label}: expectedGate declares no decision or no gateCriteria`);
    assert(
      arithmetic?.overall && arithmetic.priority && arithmetic.riskSummary && arithmetic.byLevelCriteriaCovered,
      `${label}: coverageArithmetic is incomplete`,
    );

    // The gate, and the criteria it was derived from. The single bit the corpus
    // exists to get right, and the ten fields that say why.
    push(
      set.id,
      'gate-decision',
      {
        polarity: 'expects-hold',
        commentary: `${label}: the gate is ${gate.decision}, produced by ${gate.producedBy}. ${gate.derivation}`,
        direction: {
          polarity: 'expects-hold',
          relation: 'equality',
          scope: `gate_status in the summary written for ${label}.`,
          negativeDomain: `A run deriving any decision other than ${gate.decision} for ${label}.`,
          evidenceTargets: [at('/gate_status')],
        },
        check: equalsPointer(at('/gate_status'), gate.decision),
      },
      (scored) => scored.gate.ok,
    );
    const criteriaFields = Object.keys(gate.gateCriteria);
    push(
      set.id,
      'gate-criteria',
      {
        polarity: 'expects-hold',
        commentary: `${label}: the ${numberWord(criteriaFields.length)} gate_criteria fields, as expectedGate.gateCriteria records them. Each is a threshold the skill states or a percentage recomputed from trueCoverage, so a run reporting a different required minimum has changed the gate it claims to be.`,
        direction: {
          polarity: 'expects-hold',
          relation: 'all',
          scope: `Every gate_criteria field in the summary written for ${label}.`,
          negativeDomain:
            'A run reporting a different threshold, a different actual percentage, or a different MET/NOT_MET status on any field.',
          evidenceTargets: criteriaFields.map((field) => at(`/gate_criteria/${field}`)),
        },
        check: allOf(criteriaFields.map((field) => equalsPointer(at(`/gate_criteria/${field}`), gate.gateCriteria[field]))),
      },
      (scored) =>
        okOf(
          scored.gateCriteria,
          criteriaFields.map((field) => `gate_criteria.${field}`),
        ),
    );

    // Coverage arithmetic: the inventory, the priority breakdown, the risk summary,
    // and the per-level criteria counts, each recomputed from trueCoverage by the
    // corpus and typed beside the formula that produced it.
    push(
      set.id,
      'coverage-inventory',
      {
        polarity: 'expects-hold',
        commentary: `${label}: ${arithmetic.overall.full} of ${arithmetic.overall.total} criteria are FULL, which is ${arithmetic.overall.formula} = ${arithmetic.overall.expectedPct}. Only FULL counts toward a percentage, per skillRuleCitations.coverageArithmetic.`,
        direction: {
          polarity: 'expects-hold',
          relation: 'all',
          scope: `coverage.inventory in the summary written for ${label}.`,
          negativeDomain: 'A run whose covered count, total, or percentage disagrees with the recomputed values.',
          evidenceTargets: ['covered', 'total', 'pct'].map((field) => at(`/coverage/inventory/${field}`)),
        },
        check: allOf([
          equalsPointer(at('/coverage/inventory/covered'), arithmetic.overall.full),
          equalsPointer(at('/coverage/inventory/total'), arithmetic.overall.total),
          equalsPointer(at('/coverage/inventory/pct'), arithmetic.overall.expectedPct),
        ]),
      },
      (scored) => okOf(scored.arithmetic, ['coverage.inventory.covered', 'coverage.inventory.total', 'coverage.inventory.pct']),
    );
    push(
      set.id,
      'priority-breakdown',
      {
        polarity: 'expects-hold',
        commentary: `${label}: ${TRACE_PRIORITIES.map((name) => `${name} ${arithmetic.priority[name].full}/${arithmetic.priority[name].total} = ${arithmetic.priority[name].expectedPct}%`).join(', ')}. An empty priority resolves to 100, per step-04's safePct.`,
        direction: {
          polarity: 'expects-hold',
          relation: 'all',
          scope: `coverage.priority_breakdown, all four priorities, in the summary written for ${label}.`,
          negativeDomain: 'A run whose total, covered count, or percentage for any priority disagrees with the recomputed values.',
          evidenceTargets: TRACE_PRIORITIES.flatMap((name) =>
            ['total', 'covered', 'pct'].map((field) => at(`/coverage/priority_breakdown/${name}/${field}`)),
          ),
        },
        check: allOf(
          TRACE_PRIORITIES.flatMap((name) => [
            equalsPointer(at(`/coverage/priority_breakdown/${name}/total`), arithmetic.priority[name].total),
            equalsPointer(at(`/coverage/priority_breakdown/${name}/covered`), arithmetic.priority[name].full),
            equalsPointer(at(`/coverage/priority_breakdown/${name}/pct`), arithmetic.priority[name].expectedPct),
          ]),
        ),
      },
      (scored) =>
        okOf(
          scored.arithmetic,
          TRACE_PRIORITIES.flatMap((name) => ['total', 'covered', 'pct'].map((field) => `priority_breakdown.${name}.${field}`)),
        ),
    );
    const riskKeys = Object.keys(arithmetic.riskSummary);
    push(
      set.id,
      'risk-summary',
      {
        polarity: 'expects-hold',
        commentary: `${label}: ${riskKeys.map((key) => `${key} ${arithmetic.riskSummary[key]}`).join(', ')}, from the gap buckets step-04 builds out of criteria whose coverage is exactly NONE.`,
        direction: {
          polarity: 'expects-hold',
          relation: 'all',
          scope: `risk_summary in the summary written for ${label}.`,
          negativeDomain: 'A run counting a gap the corpus does not declare, or missing one it does.',
          evidenceTargets: riskKeys.map((key) => at(`/risk_summary/${key}`)),
        },
        check: allOf(riskKeys.map((key) => equalsPointer(at(`/risk_summary/${key}`), arithmetic.riskSummary[key]))),
      },
      (scored) =>
        okOf(
          scored.arithmetic,
          riskKeys.map((key) => `risk_summary.${key}`),
        ),
    );
    push(
      set.id,
      'criteria-covered-by-level',
      {
        polarity: 'expects-hold',
        commentary: `${label}: criteria with a mapped test per level, ${TRACE_LEVELS.map((level) => `${level} ${arithmetic.byLevelCriteriaCovered[level]}`).join(', ')}. Invariant across the test-count ambiguity the corpus describes, because a NONE criterion has no level.`,
        direction: {
          polarity: 'expects-hold',
          relation: 'all',
          scope: `coverage.by_level.*.criteria_covered for all six levels in the summary written for ${label}.`,
          negativeDomain: 'A run attributing a criterion to a level its evidence does not carry.',
          evidenceTargets: TRACE_LEVELS.map((level) => at(`/coverage/by_level/${level}/criteria_covered`)),
        },
        check: allOf(
          TRACE_LEVELS.map((level) =>
            equalsPointer(at(`/coverage/by_level/${level}/criteria_covered`), arithmetic.byLevelCriteriaCovered[level]),
          ),
        ),
      },
      (scored) =>
        okOf(
          scored.arithmetic,
          TRACE_LEVELS.map((level) => `by_level.${level}.criteria_covered`),
        ),
    );

    // How the run collected and resolved its oracle. Both sets resolve formal
    // requirements from an epic with numbered criteria, and gate_basis follows
    // from the eligibility the corpus records.
    const oracleDocBasename = path.basename(set.oracle.document);
    const gateBasis = set.collection.gateEligible ? 'priority_thresholds' : 'none';
    push(
      set.id,
      'collection-and-oracle',
      {
        polarity: 'expects-hold',
        commentary:
          `${label}: collection ${set.collection.collectionMode}/${set.collection.collectionStatus}, gate_basis ${gateBasis} because the corpus records the set gate-eligible and step-05 sets the basis from eligibility (skillRuleCitations.gateEligibility), and an oracle resolved as ${set.oracle.oracleResolutionMode} at ${set.oracle.oracleConfidence} confidence from ${oracleDocBasename} with external pointers ${set.oracle.externalPointerStatus}. ` +
          'oracle.synthetic is false because step-01 marks an oracle synthetic only when it was inferred, and this one was read off numbered criteria.',
        direction: {
          polarity: 'expects-hold',
          relation: 'all',
          scope: `collection_mode, collection_status, gate_basis, inventory_basis, and the oracle block in the summary written for ${label}.`,
          negativeDomain:
            'A run reporting a non-collecting mode, a skipped gate, a synthetic or heuristic oracle, or an oracle document other than the epic.',
          evidenceTargets: [
            at('/collection_mode'),
            at('/collection_status'),
            at('/gate_basis'),
            at('/inventory_basis'),
            at('/oracle/resolution_mode'),
            at('/oracle/confidence'),
            at('/oracle/external_pointer_status'),
            at('/oracle/synthetic'),
            at('/oracle/sources'),
          ],
        },
        check: allOf([
          equalsPointer(at('/collection_mode'), set.collection.collectionMode),
          equalsPointer(at('/collection_status'), set.collection.collectionStatus),
          equalsPointer(at('/gate_basis'), gateBasis),
          equalsPointer(at('/inventory_basis'), set.oracle.coverageBasis),
          equalsPointer(at('/oracle/resolution_mode'), set.oracle.oracleResolutionMode),
          equalsPointer(at('/oracle/confidence'), set.oracle.oracleConfidence),
          equalsPointer(at('/oracle/external_pointer_status'), set.oracle.externalPointerStatus),
          equalsPointer(at('/oracle/synthetic'), false),
          {
            op: 'for-any',
            collection: { pointer: at('/oracle/sources') },
            predicate: { op: 'regex', operands: [{ pointer: '@/' }], pattern: basenamePattern(oracleDocBasename) },
          },
        ]),
      },
      (scored) => scored.oracleResolution.every((item) => item.ok) && okOf(scored.gateCriteria, ['collection_status', 'gate_basis']),
    );

    // Live evidence. The seeded set carries two records that count as nothing at
    // two severities; the clean set carries no file and so no blocker.
    const live = set.expectedLiveEvidence;
    assert(typeof live?.present === 'boolean', `${label}: expectedLiveEvidence declares no present flag`);
    if (live.present) {
      const dispositionKeys = [
        'counted',
        'requirements_live_only',
        'failed',
        'contradicted',
        'blocked',
        'skipped',
        'unmatched',
        'invalid',
      ].filter((key) => live[key] !== undefined);
      push(
        set.id,
        'live-dispositions',
        {
          polarity: 'expects-hold',
          commentary: `${label}: ${live.invariant} Dispositions: ${dispositionKeys.map((key) => `${key} ${live[key]}`).join(', ')}. stale and unverifiable are left to the harness, which scores their sum, because which one a record lands on depends on whether the workspace resolves a commit sha.`,
          direction: {
            polarity: 'expects-hold',
            relation: 'all',
            scope: `live_evidence.present and the ${numberWord(dispositionKeys.length)} environment-independent disposition counts in the summary written for ${label}.`,
            negativeDomain:
              'A run counting a recorded live pass as coverage, or classifying the unrecognised status as anything but invalid.',
            evidenceTargets: [at('/live_evidence/present'), ...dispositionKeys.map((key) => at(`/live_evidence/${key}`))],
          },
          check: allOf([
            equalsPointer(at('/live_evidence/present'), true),
            ...dispositionKeys.map((key) => equalsPointer(at(`/live_evidence/${key}`), live[key])),
          ]),
        },
        (scored) => okOf(scored.live, ['live_evidence.present', ...dispositionKeys.map((key) => `live_evidence.${key}`)]),
      );
      for (const blocker of live.expectedBlockers ?? []) {
        push(
          set.id,
          `live-blocker-${blocker.id}`,
          {
            polarity: 'expects-hold',
            commentary: `${label}: record ${blocker.id} is raised as a ${blocker.severity} severity blocker. ${blocker.why}`,
            direction: {
              polarity: 'expects-hold',
              relation: 'for-any',
              scope: `Every blocker in the summary written for ${label}, searched for one naming ${blocker.id}.`,
              negativeDomain: `A run raising no blocker for ${blocker.id}, or raising it at another severity.`,
              evidenceTargets: [at('/blockers')],
            },
            check: {
              op: 'for-any',
              collection: { pointer: at('/blockers') },
              predicate: {
                op: 'all',
                operands: [
                  { op: 'equality', operands: [{ pointer: '@/id' }, { literal: blocker.id }] },
                  { op: 'equality', operands: [{ pointer: '@/severity' }, { literal: blocker.severity }] },
                ],
              },
            },
          },
          (scored) => okOf(scored.live, [`blocker ${blocker.id} at severity ${blocker.severity}`]),
        );
      }
    } else {
      push(
        set.id,
        'live-absent',
        {
          polarity: 'expects-hold',
          commentary: `${label}: ${live.invariant}`,
          direction: {
            polarity: 'expects-hold',
            relation: 'all',
            scope: `live_evidence.present, live_evidence.freshness, and the blockers array in the summary written for ${label}.`,
            negativeDomain:
              'A run reporting live evidence where the set has no live file, or raising any blocker against a set with no skipped test.',
            evidenceTargets: [at('/live_evidence/present'), at('/live_evidence/freshness'), at('/blockers')],
          },
          check: allOf([
            equalsPointer(at('/live_evidence/present'), false),
            equalsPointer(at('/live_evidence/freshness'), live.freshness),
            emptyCollection(at('/blockers')),
          ]),
        },
        (scored) => okOf(scored.live, ['live_evidence.present', 'live_evidence.freshness', 'blockers is empty']),
      );
    }

    // Rejected evidence: the tests whose names claim a criterion their assertions
    // do not establish. The seeded set owes exactly the AC-2 test; the clean set
    // owes none, and reporting one there is a false positive.
    const rejected = (set.criteria ?? []).flatMap((item) =>
      (item.falseEvidence ?? []).filter((entry) => entry.level !== 'live').map((entry) => ({ requirementId: item.id, ...entry })),
    );
    if (rejected.length > 0) {
      for (const entry of rejected) {
        const basename = path.basename(entry.file);
        push(
          set.id,
          `rejected-evidence-${entry.requirementId}`,
          {
            polarity: 'expects-hold',
            commentary: `${label}: ${basename}:${entry.line}-${entry.lineEnd} is named as considered for ${entry.requirementId} and turned down. ${entry.whyItIsNotEvidence}`,
            direction: {
              polarity: 'expects-hold',
              relation: 'for-any',
              scope: `Every rejected_evidence entry in the summary written for ${label}, searched for one naming ${entry.requirementId} in ${basename} within the recorded span at the corpus's line tolerance of ${tolerance}.`,
              negativeDomain: `A run that never names the ${entry.requirementId} test as rejected, which is what a run that matched on its title does.`,
              evidenceTargets: [at('/rejected_evidence')],
            },
            check: {
              op: 'for-any',
              collection: { pointer: at('/rejected_evidence') },
              predicate: {
                op: 'all',
                operands: [
                  { op: 'equality', operands: [{ pointer: '@/requirement_id' }, { literal: entry.requirementId }] },
                  { op: 'regex', operands: [{ pointer: '@/file' }], pattern: basenamePattern(basename) },
                  { op: 'set-membership', operands: [{ pointer: '@/line' }, { literal: admittedLines(entry, tolerance) }] },
                ],
              },
            },
          },
          (scored) =>
            okOf(scored.rejectedEvidence, [`rejected_evidence names ${entry.requirementId} at ${basename}:${entry.line}-${entry.lineEnd}`]),
        );
      }
    } else {
      push(
        set.id,
        'rejected-evidence-none',
        {
          polarity: 'expects-hold',
          commentary: `${label}: every criterion has evidence that establishes it, so there is no test to turn down and rejected_evidence is empty.`,
          direction: {
            polarity: 'expects-hold',
            relation: 'count-tolerance',
            scope: `The rejected_evidence array in the summary written for ${label}.`,
            negativeDomain: 'A run rejecting a test that does establish its criterion.',
            evidenceTargets: [at('/rejected_evidence')],
          },
          check: emptyCollection(at('/rejected_evidence')),
        },
        (scored) => okOf(scored.rejectedEvidence, ['rejected_evidence is an array', 'rejected_evidence.length']),
      );
    }

    // Waivers. Scored by the harness only where the gate matched, and the scorer
    // half of each spec says so with undefined; see the function comment.
    const waiversScored = (scored) => (scored.waivers.scored ? scored.waivers.checks : undefined);
    if (set.waiverRegister) {
      const valid = set.expectedWaiverHandling?.valid ?? [];
      const invalid = set.expectedWaiverHandling?.invalid ?? [];
      assert(valid.length + invalid.length > 0, `${label}: declares a waiver register and no expected waiver handling`);
      push(
        set.id,
        'waiver-register',
        {
          polarity: 'expects-hold',
          commentary: `${label}: ${set.expectedWaiverHandling.note} ${numberWord(valid.length + invalid.length)} filed, ${numberWord(valid.length)} valid, ${numberWord(invalid.length)} invalid.`,
          direction: {
            polarity: 'expects-hold',
            relation: 'all',
            scope: `waivers.filed, waivers.valid, and waivers.invalid in the summary written for ${label}.`,
            negativeDomain: 'A run that missed a filed waiver, or accepted one the register does not support.',
            evidenceTargets: ['filed', 'valid', 'invalid'].map((field) => at(`/waivers/${field}`)),
          },
          check: allOf([
            equalsPointer(at('/waivers/filed'), valid.length + invalid.length),
            equalsPointer(at('/waivers/valid'), valid.length),
            equalsPointer(at('/waivers/invalid'), invalid.length),
          ]),
        },
        (scored) => {
          const checks = waiversScored(scored);
          return checks === undefined ? undefined : okOf(checks, ['waivers.filed', 'waivers.valid', 'waivers.invalid']);
        },
      );
      for (const [waiver, verdict] of [...valid.map((entry) => [entry, true]), ...invalid.map((entry) => [entry, false])]) {
        push(
          set.id,
          `waiver-${waiver.id}`,
          {
            polarity: 'expects-hold',
            commentary: `${label}: ${waiver.id} waives ${waiver.waives} and is ${verdict ? 'well formed' : 'invalid'}. ${waiver.expectedTreatment}`,
            direction: {
              polarity: 'expects-hold',
              relation: 'for-any',
              scope: `Every waiver entry in the summary written for ${label}, searched for ${waiver.id}.`,
              negativeDomain: `A run reporting ${waiver.id} as ${verdict ? 'invalid' : 'valid'}, or not reporting it at all.`,
              evidenceTargets: [at('/waivers/entries')],
            },
            check: {
              op: 'for-any',
              collection: { pointer: at('/waivers/entries') },
              predicate: {
                op: 'all',
                operands: [
                  { op: 'equality', operands: [{ pointer: '@/id' }, { literal: waiver.id }] },
                  { op: 'equality', operands: [{ pointer: '@/valid' }, { literal: verdict }] },
                ],
              },
            },
          },
          (scored) => {
            const checks = waiversScored(scored);
            return checks === undefined ? undefined : okOf(checks, [`waiver ${waiver.id} reported ${verdict ? 'valid' : 'invalid'}`]);
          },
        );
      }
    } else {
      push(
        set.id,
        'no-waiver-register',
        {
          polarity: 'expects-hold',
          commentary: `${label}: the set has no waiver register, and step-05 emits the waivers block only when a register was found, so the key is absent.`,
          direction: {
            polarity: 'expects-hold',
            relation: 'not',
            scope: `The waivers key in the summary written for ${label}.`,
            negativeDomain: 'A run inventing a waiver register the workspace does not carry.',
            evidenceTargets: [at('/waivers')],
          },
          check: { op: 'not', operands: [{ op: 'existence', operands: [{ pointer: at('/waivers') }] }] },
        },
        (scored) => {
          const checks = waiversScored(scored);
          return checks === undefined ? undefined : okOf(checks, ['waivers block absent when no register exists']);
        },
      );
    }

    // The run measured something: both deliverables exist, the summary declares
    // the schema version the harness scores, and the runner exited clean. Any
    // other exit is one of the runner's failure classes, an absent artifact is a
    // missing-artifact failure, and another schema version is a changed contract
    // the harness refuses to score as a regression; none is a low score.
    const schemaPattern = `^${escapeRegex(TRACE_SUMMARY_SCHEMA)}\\.\\d+$`;
    push(
      set.id,
      'run-measured',
      {
        polarity: 'expects-hold',
        commentary: `${label}: the summary and the matrix were both written, the summary declares schema_version ${TRACE_SUMMARY_SCHEMA}.x, which is the version step-05 emits and test/eval-trace.js scores, and tea-trace-runner exited ${TRACE_EXIT_CODES.none}. Every other exit code the runner produces is a TEA failure class, an absent artifact is a missing-artifact failure, and another schema version is a changed contract; none is a measured result.`,
        direction: {
          polarity: 'expects-hold',
          relation: 'all',
          scope: `The two artifacts, the summary's schema_version, and the exit code of the ${traceStepId(set)} invocation.`,
          negativeDomain:
            'A run that wrote one deliverable and not the other, declared another schema version, or exited with an environment class.',
          evidenceTargets: [
            `/interactions/${traceStepId(set)}/artifact/summary`,
            `/interactions/${traceStepId(set)}/artifact/matrix`,
            at('/schema_version'),
            `/interactions/${traceStepId(set)}/exit-code`,
          ],
        },
        check: allOf([
          { op: 'existence', operands: [{ pointer: `/interactions/${traceStepId(set)}/artifact/summary` }] },
          { op: 'existence', operands: [{ pointer: `/interactions/${traceStepId(set)}/artifact/matrix` }] },
          { op: 'regex', operands: [{ pointer: at('/schema_version') }], pattern: schemaPattern },
          equalsPointer(`/interactions/${traceStepId(set)}/exit-code`, TRACE_EXIT_CODES.none),
        ]),
      },
      () => true,
    );
  }
  return specs;
}

/**
 * The authored half of the trace behaviors: which oracle kinds each one groups,
 * on which set, how hard a miss grades, and which risk it names. The sets are
 * addressed by role rather than by id, so a renamed fixture set does not orphan
 * a behavior: the seeded set is the one with a NONE criterion, the clean set the
 * one with none.
 */
const TRACE_BEHAVIORS = [
  {
    id: 'B-001',
    role: 'seeded',
    kinds: ['gate-decision', 'gate-criteria'],
    severity: 'critical',
    risk: 'gate-flipped-by-one-misread-criterion',
    description: 'The seeded set derives its gate from the rules and reports the criteria that produced it.',
    success: 'The summary for the seeded set carries the expected gate decision and every gate_criteria field the ground truth records.',
    requirement: 'expectedGate',
  },
  {
    id: 'B-002',
    role: 'seeded',
    kinds: ['coverage-inventory', 'priority-breakdown', 'risk-summary', 'criteria-covered-by-level'],
    severity: 'critical',
    risk: 'arithmetic-drift-hidden-behind-a-correct-gate',
    description: 'The seeded set reports coverage arithmetic that recomputes from the true statuses.',
    success:
      'The inventory, all four priority rows, the four risk counts, and the six per-level criteria counts in the seeded summary equal the values recomputed from trueCoverage.',
    requirement: 'coverageArithmetic',
  },
  {
    id: 'B-003',
    role: 'seeded',
    kinds: ['rejected-evidence-', 'live-dispositions', 'live-blocker-'],
    severity: 'critical',
    risk: 'title-match-scored-as-coverage',
    description:
      'The discriminating criterion is read rather than matched: its misnamed test is turned down and its recorded live pass counts as nothing.',
    success:
      'The seeded summary names the misnamed test under rejected_evidence at its recorded span, counts no live record as coverage, and raises both live records as blockers at their declared severities.',
    requirement: 'criteria[isDiscriminatingCase]',
  },
  {
    id: 'B-004',
    role: 'seeded',
    kinds: ['waiver-'],
    severity: 'material',
    risk: 'waiver-applied-to-the-gate',
    description:
      'The waiver register is reported, the well formed request as valid and the defective one as invalid, and neither moves the gate.',
    success:
      'The seeded summary reports two filed waivers, one valid and one invalid, names each with its verdict, and still derives the FAIL the gate behavior asserts.',
    requirement: 'expectedWaiverHandling',
  },
  {
    id: 'B-005',
    role: 'clean',
    kinds: [
      'gate-decision',
      'gate-criteria',
      'coverage-inventory',
      'priority-breakdown',
      'risk-summary',
      'criteria-covered-by-level',
      'live-absent',
      'rejected-evidence-none',
      'no-waiver-register',
    ],
    severity: 'critical',
    risk: 'reports-gaps-everywhere',
    description: 'The clean set draws no finding: full coverage, a PASS gate, no blocker, no rejection, and no waiver.',
    success:
      'The clean summary reports every criterion covered, every percentage at 100, a PASS gate with every criterion MET, zero open risks, an empty blockers array, an empty rejected_evidence array, live evidence absent, and no waivers block.',
    requirement: 'mustNotReport',
  },
  {
    id: 'B-006',
    role: 'both',
    kinds: ['collection-and-oracle', 'run-measured'],
    severity: 'critical',
    risk: 'unmeasurable-run-scored-as-a-miss',
    description:
      'Each run collected statically, resolved the epic as a formal-requirements oracle, wrote both deliverables, and exited clean.',
    success:
      'Both summaries report contract_static collection, a COLLECTED status, a priority_thresholds gate basis, a formal_requirements oracle at high confidence naming the epic, and both runs left a summary and a matrix behind with exit 0.',
    requirement: 'collection',
  },
];

/**
 * "This collection is empty", as a count rather than as a comparison.
 *
 * `deep-equality` against a literal `[]` was the first spelling and it cannot
 * work: AD-4 resolves any addressing of an empty collection to
 * `insufficient-evidence` before the comparison runs, so the oracle abstained on
 * exactly the run it was written to confirm and scored the clean control a
 * behavioural failure. `count-tolerance` counts the elements instead, and zero
 * elements with zero tolerance is the claim.
 */
function emptyCollection(pointer) {
  return { op: 'count-tolerance', operands: [{ pointer }], expected: 0, tolerance: 0, relative: false };
}

function buildTraceContract() {
  const groundTruth = JSON.parse(fs.readFileSync(TRACE_GROUND_TRUTH_PATH, 'utf8'));
  const sets = groundTruth.fixtureSets ?? [];
  assert(
    sets.length >= 2,
    'ground-truth.json declares fewer than two fixture sets, so there is no clean control to hold the seeded set against',
  );
  const seeded = sets.filter((set) => (set.criteria ?? []).some((item) => item.trueCoverage !== 'FULL'));
  const clean = sets.filter((set) => (set.criteria ?? []).every((item) => item.trueCoverage === 'FULL'));
  assert(
    seeded.length === 1 && clean.length === 1,
    `expected one seeded and one clean fixture set; found ${seeded.length} and ${clean.length}`,
  );

  const specs = traceOracleSpecs(groundTruth);
  const oracles = specs.map((spec) => ({ id: spec.id, ...spec.oracle }));
  const summaryKeys = summaryKeysFromStep05();
  for (const key of ['gate_status', 'gate_criteria', 'waivers']) {
    assert(summaryKeys.conditional.includes(key), `step-05 no longer assigns "${key}" conditionally, and the oracles here address it`);
  }
  for (const key of [
    'collection_mode',
    'collection_status',
    'gate_basis',
    'inventory_basis',
    'oracle',
    'coverage',
    'risk_summary',
    'live_evidence',
    'blockers',
    'rejected_evidence',
  ]) {
    assert(summaryKeys.always.includes(key), `step-05's summary literal no longer carries "${key}", and the oracles here address it`);
  }

  const roleOf = (set) => (seeded.includes(set) ? 'seeded' : 'clean');
  // One behavior per oracle, in oracle order, rather than one per authored group.
  // The groups are still what carries the severity, the risk, the requirement
  // link and the success sentence; what they no longer do is put several oracles
  // behind one behavior, which is what left AD-40's designated oracle unresolved
  // and made `score` vote a probe's trial with the first oracle in the contract
  // whatever the probe seeded. Each split behavior keeps its group's success
  // sentence, because that sentence is the group's observable criterion and each
  // behavior is one oracle's share of it; the description is the oracle's own,
  // which is already a sentence about that one check.
  const oracleById = new Map(oracles.map((oracle) => [oracle.id, oracle]));
  const behaviors = [];
  for (const authored of TRACE_BEHAVIORS) {
    const targetSets = authored.role === 'both' ? sets : sets.filter((set) => roleOf(set) === authored.role);
    const matched = specs
      .filter((spec) => targetSets.some((set) => set.id === spec.setId))
      .filter((spec) => authored.kinds.some((kind) => (kind.endsWith('-') ? spec.kind.startsWith(kind) : spec.kind === kind)));
    assert(matched.length > 0, `${authored.id}: no oracle matches kinds [${authored.kinds.join(', ')}] on the ${authored.role} set(s)`);
    for (const spec of matched) {
      behaviors.push({
        id: spec.id,
        description: oracleById.get(spec.id).commentary,
        severity: authored.severity,
        observableSuccessCriterion: authored.success,
        requirementLinks: [{ scheme: 'tea-eval-ground-truth', id: `${spec.setId}/${authored.requirement}` }],
        riskLinks: [{ scheme: 'tea-eval-risk', id: authored.risk }],
        oracles: [spec.id],
      });
    }
  }
  behaviors.sort((left, right) => (left.id < right.id ? -1 : 1));
  // The identifier is minted from the oracle's, so B-00n and O-00n are one thing.
  for (const behavior of behaviors) behavior.id = behavior.id.replace('O-', 'B-');
  const claimed = new Set(behaviors.flatMap((behavior) => behavior.oracles));
  for (const spec of specs) {
    assert(claimed.has(spec.id), `${spec.id} (${spec.kind} on ${spec.setId}) is stated by no behavior, so nothing would demand it`);
  }

  // The specification the run is scored against is the set of skill files the
  // corpus cites for its rules, so an edit to any of them changes what this
  // contract demands.
  const citedFiles = [...new Set(Object.values(groundTruth.skillRuleCitations ?? {}).map((citation) => citation.file))].sort();
  assert(citedFiles.length > 0, 'ground-truth.json cites no skill file, so there is no specification to digest');
  for (const file of citedFiles) {
    assert(fs.existsSync(path.join(PROJECT_ROOT, file)), `ground-truth.json cites ${file}, which does not exist`);
  }

  const maxCriteria = Math.max(...sets.map((set) => (set.criteria ?? []).length));
  // The sensitivity witness runs the clean set. AD-10 treats every other leg of an
  // operation as a clean leg when it asks whether a seeded fault is scoped to its
  // own leg, and these two legs are the only other legs `trace-fixture-set` has, so
  // whatever set they trace is what "clean leg" means for this contract. Run on the
  // seeded set they were seeded runs, and the manifestation witness of every defect
  // probe fired on them, which is exactly what `seeded-faults-scoped` reported. See
  // the sensitivityWitness comment below for why the differential still holds here.
  const witnessSet = clean[0];

  return {
    schemaVersion: EVAL_CONTRACT_SCHEMA_VERSION,
    parentDigest: null,
    revisionCount: 0,
    contractId: 'tea-trace-behavioral',
    sourceSpecDigest: digestOf(citedFiles.map((file) => path.join(PROJECT_ROOT, file))),
    behaviors,
    oracles,
    rubrics: [],
    waivers: [],
    permittedInterfaces: [
      {
        logicalId: TRACE_INTERFACE,
        kind: 'cli',
        operations: [
          {
            operationId: TRACE_OPERATION,
            invocation: { executable: TRACE_INTERFACE, subcommandPath: [] },
            stateChangeMarker: true,
            requestShape: TRACE_REQUEST_SHAPE,
            artifacts: ['summary', 'matrix'],
            // The summary is the machine-readable contract and carries every
            // deterministic oracle. The matrix is the deliverable the summary
            // links, and the per-criterion statuses the harness reads out of it
            // are markdown, which the operator vocabulary addresses only as a
            // whole document; they are scored by the harness and stated here
            // through their arithmetic consequences.
            descriptorChannel: { kind: 'artifact', artifactId: 'summary' },
            responseDescriptor: traceSummaryDescriptor(summaryKeys, maxCriteria),
            volatilePointers: ['/matrix'],
            sensitivityWitness: {
              // The differential is allow_gate, the one prompt value the corpus
              // establishes an effect for: skillRuleCitations.gateEligibility says
              // a gate is evaluated only when it is true, and step-05 sets
              // gate_basis to `none` otherwise. Two prompts differing in that
              // value, over one staged fixture set, must therefore produce two
              // gate_basis values, which is a true and checkable claim that the
              // command reads its standard input. It holds over either set: the
              // clean set's allow_gate run writes `priority_thresholds` and its
              // withheld run writes `none`, the same pair the seeded set writes.
              //
              // The legs run against a staged workspace, which is the coupling
              // docs/explanation/eval-quality-command-adapter.md records for
              // artifact-writing commands, and the prompt names which set that
              // workspace holds through its project root.
              witnessId: 'gate-follows-allow-gate',
              channel: 'stdin',
              legs: [
                {
                  legId: 'witness-gate-evaluated',
                  inputs: witnessInputs(
                    TRACE_REQUEST_SHAPE,
                    { option: { agent: TRACE_DEFAULT_AGENT } },
                    { kind: 'text', value: buildTracePrompt(witnessSet) },
                  ),
                },
                {
                  legId: 'witness-gate-withheld',
                  inputs: witnessInputs(
                    TRACE_REQUEST_SHAPE,
                    { option: { agent: TRACE_DEFAULT_AGENT } },
                    { kind: 'text', value: buildTracePrompt(witnessSet, { allowGate: false }) },
                  ),
                },
              ],
              relation: {
                op: 'not',
                operands: [
                  {
                    op: 'deep-equality',
                    operands: [
                      { pointer: '/interactions/witness-gate-evaluated/artifact/summary/gate_basis' },
                      { pointer: '/interactions/witness-gate-withheld/artifact/summary/gate_basis' },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    ],
    referenceSets: {},
    siblingGroups: { operations: [], parameters: [] },
    interactionPlan: sets.map((set) => ({
      stepId: traceStepId(set),
      operationId: TRACE_OPERATION,
      after: null,
      cardinality: 'exactly-one',
      // The agent is bound as `any`: which vendor answered is the runner record's
      // to state.
      //
      // Standard input is bound as a literal, and the literal is the prompt the
      // harness assembles for this fixture set. Both steps declare the same
      // operation, so under a matcher binding every observation satisfies both
      // steps: one observation is selected twice and the other set's oracles
      // quantify over evidence that is not theirs, which is what held the clean
      // control at FAIL with five abstentions. The prompt is the only part of the
      // request that tells the two steps apart, because the project root it is
      // written against is the one fact about the set the request carries.
      //
      // buildTracePrompt is test/eval-trace.js's own buildPrompt, the function
      // that assembles the prompt the live run sends and the prompt
      // test/lib/probe-scoring.js puts on a trace observation. A literal is
      // compared with deepEquals, so a prompt restated here in any other form
      // would select nothing, every oracle would resolve `unreached`, and a run
      // that examined no evidence at all would report clean at exit 0. One
      // function on both sides is what makes that unrepresentable.
      inputBinding: {
        argument: null,
        option: { agent: { matcher: 'any' } },
        environment: null,
        stdin: { prompt: { literal: buildTracePrompt(set) } },
      },
    })),
    scopedResources: null,
    forbiddenInputs: FORBIDDEN_INPUTS,
    testData: {
      setup:
        `Each plan step stages one fixture set from test/fixtures/trace-eval/ into a disposable workspace: the set's files under its own project root ` +
        `(${sets.map((set) => `${set.projectRoot}/ for ${set.id}`).join(', ')}), a resolved _bmad/tea/config.yaml whose test_artifacts points inside that ` +
        `workspace, and the bmad-testarch-trace workflow under skill/. ground-truth.json is never staged, and the harness asserts that no staged file carries ` +
        `its bytes or its keys before the run. The workspace is the authorization's working directory, and the prompt on standard input names the project root ` +
        `and skill/ and resolves every placeholder against them. The project root is the one fact about the set the prompt carries, and it carries the epic the ` +
        `set traces rather than the set's role, so it says which set a leg is asking for and suggests no coverage status. ` +
        `The sensitivity witness differs its two legs on allow_gate rather than between the two sets: the seeded and clean summaries differ because of the ` +
        `staged workspace, so a differential between the sets would attribute to the prompt a difference the staged files produced, and an invariance claim ` +
        `would be false. allow_gate is the one prompt value the ground truth establishes an effect for, through skillRuleCitations.gateEligibility: step-05 ` +
        `evaluates a gate only when it is true and writes gate_basis as none otherwise, so two prompts differing in that value, over one staged fixture set, ` +
        `produce two gate_basis values. That is the same reasoning that gives the fragment-selection contract for this workflow an invariance witness: the ` +
        `claim is moved onto an input the run demonstrably reads, and stated as what it is. Both witness legs stage the clean set, because they are the only ` +
        `other legs this operation has and AD-10 reads them as its clean legs when it asks whether a seeded fault is scoped to its own leg.`,
      cleanup:
        'Delete the workspace. The corpus under test/fixtures/trace-eval/ is read-only and the harness digests it before and after every run.',
      principals: null,
      resources: null,
    },
    // A full trace is a five-step run over a whole project tree, so the bounds
    // are the harness's own twenty-minute clock per set and a generous tool and
    // cost allowance beside it, scaled with the set count.
    budgets: {
      maxToolCalls: 300 * sets.length,
      maxWallClockMinutes: 20 * sets.length,
      maxCostUsd: (4 * sets.length).toFixed(2),
    },
    safetyLimits: [
      "The runner writes only inside the staged workspace, and only its two deliverables under the fixture set's own test-artifacts/; the harness fails a run that changed the repository or the staged corpus.",
      "The run adds, edits, and deletes nothing under the fixture set's docs/, src/, or tests/. The workflow does not generate tests, and a run that did has moved the benchmark.",
      'No credential value appears in a prompt, an artifact, a log, or a result file.',
    ],
    requiredEvidence: [
      'The e2e-trace-summary.json each run wrote, in full.',
      'The traceability-matrix.md each run wrote, in full.',
      'The exit code of each invocation.',
      'The digest of the prompt each run was given, so an edit that changed the question is visible in the record.',
    ],
    // One step per fixture set, plus room for the two probe steps the compiler may add.
    probeStepBound: sets.length + 2,
    fixtureReset: null,
  };
}

// ---------------------------------------------------------------------------
// tea-routing.contract.json
// ---------------------------------------------------------------------------

const ROUTING_FIXTURE_ROOT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'tea-routing-eval');
const ROUTING_INTENTS_PATH = path.join(ROUTING_FIXTURE_ROOT, 'intents.json');
const ROUTING_GROUND_TRUTH_PATH = path.join(ROUTING_FIXTURE_ROOT, 'ground-truth.json');
const TEA_AGENT_ROOT = path.join(PROJECT_ROOT, 'src', 'agents', 'bmad-tea');
const TEA_SKILL_PATH = path.join(TEA_AGENT_ROOT, 'SKILL.md');
const TEA_MENU_PATH = path.join(TEA_AGENT_ROOT, 'customize.toml');

const ROUTING_REQUEST_SHAPE = Object.fromEntries(
  Object.entries(ROUTING_REQUEST_KEYS).map(([channel, keys]) => [channel, stringShape(keys.required, keys.permitted)]),
);

/**
 * The routing answer's descriptor.
 *
 * The key sets come from the command, the way every other descriptor here does.
 * `action` and `reason` are typed `string` because a reply carrying neither is
 * not a routing answer; the five optional keys are declared with no type, which
 * is this vocabulary's spelling for "present, and its type is not the claim",
 * because each of them is a string on the action that owns it and null on the
 * other two.
 *
 * `successIndicator` is `/action` and there is no collection. A routing decision
 * is one answer rather than a list, so declaring a collection location would name
 * a pointer no reply ever carries.
 */
function routingDescriptor(keys) {
  const typed = new Set(['action', 'reason']);
  return {
    requiredKeys: [...keys.required],
    permittedKeys: [...keys.permitted],
    types: Object.fromEntries(keys.permitted.map((key) => [key, typed.has(key) ? 'string' : null])),
    successIndicator: '/action',
    channelRoles: Object.fromEntries(keys.permitted.map((key) => [`/${key}`, key === 'action' ? 'success-indicator' : 'payload'])),
    collectionLocations: [],
  };
}

/** What each oracle kind reads, what it risks, and how hard it is. */
const ROUTING_ORACLE_KINDS = {
  action: {
    field: 'expectedAction',
    pointer: 'action',
    severity: 'critical',
    risk: 'intent-answered-with-the-wrong-kind-of-answer',
  },
  menu: {
    field: 'expectedMenuCode',
    pointer: 'menuCode',
    severity: 'critical',
    risk: 'wrong-workflow-dispatched',
  },
  reason: {
    field: 'decidingTokens',
    pointer: 'reason',
    severity: 'material',
    risk: 'reason-not-grounded-in-the-intent',
  },
  scope: {
    field: 'scopeTokens',
    pointer: 'scope',
    severity: 'material',
    risk: 'scope-dropped-on-dispatch',
  },
  candidates: {
    field: 'candidateCodes',
    pointer: 'question',
    severity: 'material',
    risk: 'ambiguity-answered-without-naming-what-it-is-between',
  },
  missing: {
    field: 'expectedAction',
    pointer: 'missing',
    severity: 'material',
    risk: 'unservable-intent-declined-without-saying-what-is-missing',
  },
};

function routingPointer(caseId, key) {
  return `/interactions/${caseId}/stdout/${key}`;
}

function routingRegex(caseId, key, pattern) {
  return { op: 'regex', operands: [{ pointer: routingPointer(caseId, key) }], pattern };
}

/** One `all` for several patterns, the bare check for one, because `all` over a single operand states nothing extra. */
function allPatterns(checks) {
  return checks.length === 1 ? checks[0] : { op: 'all', operands: checks };
}

/**
 * Every oracle this contract carries, in case order and then in the fixed kind
 * order below, so the ids are stable across a fixture edit that adds a case.
 */
function routingOracleSpecs(cases, menu) {
  const specs = [];
  for (const item of cases) {
    const expected = item.expected;
    const push = (kind, check, scope, negativeDomain, success) =>
      specs.push({ caseId: item.id, kind, check, scope, negativeDomain, success, rationale: expected.rationale });

    push(
      'action',
      { op: 'equality', operands: [{ pointer: routingPointer(item.id, 'action') }, { literal: expected.expectedAction }] },
      `The action returned for ${item.id}.`,
      `Any action other than ${expected.expectedAction}.`,
      `The answer for ${item.id} is a ${expected.expectedAction}.`,
    );

    if (expected.expectedAction === 'route') {
      push(
        'menu',
        { op: 'equality', operands: [{ pointer: routingPointer(item.id, 'menuCode') }, { literal: expected.expectedMenuCode }] },
        `The menu code returned for ${item.id}, against the one item the intent names.`,
        `Any menu code other than ${expected.expectedMenuCode}, including none.`,
        `The dispatch for ${item.id} names menu code ${expected.expectedMenuCode}.`,
      );
    }

    const tokens = expected.decidingTokens ?? [];
    assert(tokens.length > 0, `${item.id}: declares no decidingTokens, so its reason oracle would be vacuous`);
    push(
      'reason',
      allPatterns(tokens.map((token) => routingRegex(item.id, 'reason', tokenPatternSource(token)))),
      `The stated reason for ${item.id}, against the ${numberWord(tokens.length)} token(s) the fixture names as the deciding feature.`,
      'A reason that names none of them, which is a reason that did not use the intent.',
      `The reason for ${item.id} names ${tokens.join(', ')}.`,
    );

    const scopeTokens = expected.scopeTokens ?? [];
    if (scopeTokens.length > 0) {
      push(
        'scope',
        allPatterns(scopeTokens.map((token) => routingRegex(item.id, 'scope', tokenPatternSource(token)))),
        `The scope carried out of ${item.id}, against what the intent named.`,
        'A scope that drops what the user asked about, so the workflow runs against something wider or narrower than the request.',
        `The scope for ${item.id} still names ${scopeTokens.join(', ')}.`,
      );
    }

    const candidates = expected.candidateCodes ?? [];
    if (expected.expectedAction === 'clarify') {
      assert(candidates.length >= 2, `${item.id}: a clarify case needs at least two candidateCodes`);
      push(
        'candidates',
        allPatterns(candidates.map((code) => routingRegex(item.id, 'question', candidatePatternSource(code, menu)))),
        `The question asked for ${item.id}, against the ${numberWord(candidates.length)} menu items it has to be asking between.`,
        'A question that asks which the user meant without saying between what, which is a stall rather than a clarification.',
        `The question for ${item.id} names ${candidates.join(', ')}, by code, by workflow name, or by menu label.`,
      );
    }

    if (expected.expectedAction === 'decline') {
      push(
        'missing',
        routingRegex(item.id, 'missing', MISSING_PATTERN_SOURCE),
        `The decline for ${item.id}, read for whether it says what is missing.`,
        'A decline that names nothing, which leaves the user with a refusal and no next step.',
        `The decline for ${item.id} names what is missing.`,
      );
    }
  }
  return specs.map((spec, index) => ({ ...spec, id: `O-${String(index + 1).padStart(3, '0')}` }));
}

/**
 * The witness legs and what they claim.
 *
 * Two intents from the same contract whose correct answers differ, and the
 * relation says the two replies must not agree on the field the contract is
 * about. A runner that returned one answer whatever it was asked would satisfy
 * every oracle it happened to line up with and fail this.
 *
 * The prompts are `test/eval-bmad-tea-routing.js`'s own `buildPrompt`, for the
 * reason the trace and selection witnesses read theirs from their harnesses: a
 * leg carrying a description of a prompt parses, compiles, is scheduled, and then
 * measures nothing when it is finally run.
 */
function buildRoutingWitness(spec, cases) {
  const [firstId, secondId] = spec.witnessCases;
  const legs = [firstId, secondId].map((caseId) => {
    const item = cases.find((candidate) => candidate.id === caseId);
    assert(item, `${spec.contractId}: the witness names case ${caseId}, which this contract does not carry`);
    return { legId: `witness-${caseId}`, prompt: buildRoutingPrompt(item) };
  });
  return {
    witnessId: spec.witnessId,
    channel: 'stdin',
    legs: legs.map(({ legId, prompt }) => ({
      legId,
      // The one option the shape requires is held fixed across both legs: the
      // differential this witness asserts is over the intent, and a leg that also
      // changed the agent would let the difference come from the vendor.
      inputs: witnessInputs(ROUTING_REQUEST_SHAPE, { option: { agent: ROUTING_DEFAULT_AGENT } }, { kind: 'text', value: prompt }),
    })),
    relation: {
      op: 'not',
      operands: [
        {
          op: 'deep-equality',
          operands: legs.map(({ legId }) => ({ pointer: `/interactions/${legId}/stdout/${spec.witnessField}` })),
        },
      ],
    },
  };
}

/**
 * The routing corpus is carried by two contracts rather than one, and the reason
 * is a published bound rather than taste.
 *
 * `eval-quality`'s AD-39 scripting bound caps an interaction plan at sixteen
 * steps, and the corpus is eighteen intents. Each intent is one agent call with
 * its own oracles, so one step per intent is the only binding that lets a case's
 * oracles read that case's answer, and eighteen of them is past the ceiling. The
 * suite manifest's `contracts` field is an array for this: a suite may be
 * expressed as more than one contract.
 *
 * The split is the corpus's own line rather than an arbitrary cut at sixteen. One
 * contract carries the intents with a right answer and asks whether the right
 * answer came back. The other carries the controls, the intents where asking is
 * correct and the intents nothing on the menu serves, and asks whether the skill
 * declined to guess. Those are two different claims about the same skill, and the
 * witness each needs is different too: the first differs its legs on the menu
 * code, because both its legs route, and the second on the action.
 */
const ROUTING_CONTRACTS = [
  {
    relativePath: 'tea-routing-intents.contract.json',
    contractId: 'tea-routing-intents-behavioral',
    actions: ['route'],
    witnessId: 'the-dispatch-follows-the-intent',
    witnessField: 'menuCode',
    witnessCases: ['epic-risk-before-tests', 'no-framework-yet'],
    setupLead: 'Each plan step sends one intent that has a single right menu item.',
    // Read by tools/generate-probes.js. The field a degenerate reply gets wrong
    // while satisfying the reason oracle, and how to recognize it.
    gamedField: 'menuCode',
    gamedSentence: 'the menu code it names is not the one the intent points at.',
    degenerateResponse: "A reply whose reason restates the user's own message and whose menu code is whichever item came to hand.",
    defectPredicate: (expected) => ({
      op: 'not',
      operands: [
        {
          op: 'equality',
          operands: [{ pointer: '/interactions/observed/stdout/menuCode' }, { literal: expected.expectedMenuCode }],
        },
      ],
    }),
  },
  {
    relativePath: 'tea-routing-controls.contract.json',
    contractId: 'tea-routing-controls-behavioral',
    actions: ['clarify', 'decline'],
    witnessId: 'the-refusal-follows-the-intent',
    witnessField: 'action',
    witnessCases: ['look-at-our-tests', 'run-and-fix-ci-failures'],
    setupLead:
      'Each plan step sends one control intent: one where two or more menu items are genuinely close, or one nothing on the menu serves.',
    gamedField: 'question',
    gamedSentence: 'the question it asks names nothing to choose between.',
    degenerateResponse:
      "A clarification whose reason restates the user's own message and whose question asks for more detail without naming a single menu item.",
    defectPredicate: (expected) => {
      const menu = routingMenuItems();
      const patterns = (expected.candidateCodes ?? []).map((code) => ({
        op: 'regex',
        operands: [{ pointer: '/interactions/observed/stdout/question' }],
        pattern: candidatePatternSource(code, menu),
      }));
      assert(patterns.length > 0, "the controls contract's first case declares no candidateCodes to ask between");
      return { op: 'not', operands: [patterns.length === 1 ? patterns[0] : { op: 'all', operands: patterns }] };
    },
  },
];

function buildRoutingContract(spec) {
  const corpus = loadRoutingCorpus();
  for (const item of corpus.cases) assert(item.expected !== undefined, `${item.id}: ground-truth.json carries no answer for it`);
  const cases = corpus.cases.filter((item) => spec.actions.includes(item.expected.expectedAction));
  assert(cases.length > 0, `${spec.contractId}: the corpus carries no ${spec.actions.join(' or ')} case`);
  const menu = routingMenuItems();
  assert(menu.length > 0, 'src/agents/bmad-tea/customize.toml declares no [[agent.menu]] item');

  const specs = routingOracleSpecs(cases, menu);
  const oracles = specs.map((oracleSpec) => ({
    id: oracleSpec.id,
    polarity: 'expects-hold',
    commentary: oracleSpec.rationale,
    direction: {
      polarity: 'expects-hold',
      relation: oracleSpec.check.op === 'equality' ? 'equality' : oracleSpec.check.op === 'all' ? 'all' : 'regex',
      scope: oracleSpec.scope,
      negativeDomain: oracleSpec.negativeDomain,
      evidenceTargets: [routingPointer(oracleSpec.caseId, ROUTING_ORACLE_KINDS[oracleSpec.kind].pointer)],
    },
    check: oracleSpec.check,
  }));

  // One behavior per oracle, for the reason the fragment-selection builder
  // records: eval-quality resolves AD-40's designated oracle only for a behavior
  // declaring exactly one, and with none resolved a probe's trial is voted with
  // the first oracle in the file instead of the one its own behavior names.
  const behaviors = specs.map((oracleSpec, index) => ({
    id: `B-${String(index + 1).padStart(3, '0')}`,
    description: `${oracleSpec.scope} ${oracleSpec.rationale}`,
    severity: ROUTING_ORACLE_KINDS[oracleSpec.kind].severity,
    observableSuccessCriterion: oracleSpec.success,
    requirementLinks: [{ scheme: 'tea-eval-ground-truth', id: `${oracleSpec.caseId}/${ROUTING_ORACLE_KINDS[oracleSpec.kind].field}` }],
    riskLinks: [{ scheme: 'tea-eval-risk', id: ROUTING_ORACLE_KINDS[oracleSpec.kind].risk }],
    oracles: [oracleSpec.id],
  }));

  return {
    schemaVersion: 4,
    parentDigest: null,
    revisionCount: 0,
    contractId: spec.contractId,
    // The skill and its menu are what the answers are derived from, and the
    // corpus is what states them, so a change to any of the four moves this. Both
    // routing contracts carry the same digest because both are claims about the
    // same skill read against the same corpus.
    sourceSpecDigest: digestOf([TEA_SKILL_PATH, TEA_MENU_PATH, ROUTING_INTENTS_PATH, ROUTING_GROUND_TRUTH_PATH]),
    behaviors,
    oracles,
    rubrics: [],
    waivers: [],
    permittedInterfaces: [
      {
        logicalId: ROUTING_INTERFACE,
        kind: 'cli',
        operations: [
          {
            operationId: ROUTING_OPERATION,
            invocation: { executable: ROUTING_INTERFACE, subcommandPath: [] },
            // A routing decision reads and decides. Nothing it does outlives the run.
            stateChangeMarker: false,
            requestShape: ROUTING_REQUEST_SHAPE,
            artifacts: [],
            descriptorChannel: { kind: 'stream', channel: 'stdout' },
            responseDescriptor: routingDescriptor(ROUTING_RESPONSE_KEYS),
            volatilePointers: [],
            sensitivityWitness: buildRoutingWitness(spec, cases),
          },
        ],
      },
    ],
    referenceSets: {},
    siblingGroups: { operations: [], parameters: [] },
    interactionPlan: cases.map((item) => ({
      stepId: item.id,
      operationId: ROUTING_OPERATION,
      after: null,
      cardinality: 'exactly-one',
      // The agent is bound as `any`: which vendor answered is the runner record's
      // to state, and a literal here would make every step a claim about one vendor.
      //
      // Standard input is bound as the literal prompt this case sends, for the
      // reason test/eval-trace.js's two steps bind theirs: every step declares the
      // same operation, so under a matcher binding one observation satisfies all
      // of them and each case's oracles quantify over evidence that is not theirs.
      // The prompt is the only part of the request that tells the steps apart, and
      // buildRoutingPrompt is the same function the live run and
      // test/lib/probe-scoring.js use, so a prompt restated here in any other form
      // would select nothing and every oracle would resolve unreached.
      inputBinding: {
        argument: null,
        option: { agent: { matcher: 'any' } },
        environment: null,
        stdin: { prompt: { literal: buildRoutingPrompt(item) } },
      },
    })),
    scopedResources: null,
    forbiddenInputs: FORBIDDEN_INPUTS,
    testData: {
      setup:
        `${spec.setupLead} The intent comes from test/fixtures/tea-routing-eval/intents.json and is wrapped in the bmad-tea skill as it ships: ` +
        `src/agents/bmad-tea/SKILL.md and src/agents/bmad-tea/customize.toml, read off disk and placed in the prompt whole. Nothing is staged and ` +
        `nothing is installed, because a routing decision needs no workspace. The run happens in an empty disposable directory that is also the ` +
        `authorization's working directory. test/fixtures/tea-routing-eval/ground-truth.json is never shown: the harness searches every assembled ` +
        `prompt for each of its ground-truth-only keys and for its own bytes before a call is spent, and that check runs in --validate-only too. ` +
        `The witness differs its two legs on the intent, which is the only thing the prompt varies, and reads the difference at /${spec.witnessField}, ` +
        `because that is the field this contract's own oracles are about.`,
      cleanup:
        'Delete the working directory. The corpus is read-only, and a run that wrote anything at all is an environment failure rather than a score.',
      principals: null,
      resources: null,
    },
    // One short reply per intent. The bounds are generous ceilings rather than
    // measurements: the harness's own five-minute clock is what actually fires.
    budgets: {
      maxToolCalls: 2 * cases.length,
      maxWallClockMinutes: 5 * cases.length,
      maxCostUsd: (0.1 * cases.length).toFixed(2),
    },
    safetyLimits: [
      'The runner reads and writes nothing outside the disposable working directory, and a routing answer needs no file at all; the harness fails a run that wrote one or that changed the repository.',
      'No credential value appears in a prompt, an artifact, a log, or a result file.',
    ],
    requiredEvidence: [
      'The routing answer each run printed on standard output, in full.',
      'The exit code of each invocation.',
      'The digest of the prompt each run was given, so an edit that changed the intent or the menu is visible in the record.',
    ],
    // One step per intent, plus room for the two probe steps the compiler may add.
    probeStepBound: cases.length + 2,
    fixtureReset: null,
  };
}

// ---------------------------------------------------------------------------
// Rendering and the two modes
// ---------------------------------------------------------------------------

/**
 * The contract as bytes.
 *
 * test/contracts/ is not in .prettierignore, so the committed bytes are whatever
 * Prettier makes of them, and a generator that emitted plain JSON.stringify output
 * would fail `npm run format:check` on whitespace alone.
 */
async function render(contract, filePath, prettierConfig) {
  return prettier.format(`${JSON.stringify(contract, null, 2)}\n`, { ...prettierConfig, parser: 'json', filepath: filePath });
}

/** The first line at which two renderings differ, with a little context either side. */
function firstDifference(expected, actual) {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  for (const [index, line] of expectedLines.entries()) {
    if (line === actualLines[index]) continue;
    return { line: index + 1, onDisk: line ?? '(end of file)', generated: actualLines[index] ?? '(end of file)' };
  }
  return { line: expectedLines.length + 1, onDisk: '(end of file)', generated: actualLines[expectedLines.length] ?? '(end of file)' };
}

function targets() {
  return [
    ...ROUTING_CONTRACTS.map((spec) => ({ relativePath: spec.relativePath, build: () => buildRoutingContract(spec) })),
    { relativePath: 'test-review.contract.json', build: buildTestReviewContract },
    { relativePath: 'trace.contract.json', build: buildTraceContract },
    ...FRAGMENT_SELECTION.map((spec) => ({
      relativePath: path.join('fragment-selection', `${spec.workflow}.contract.json`),
      build: () => buildFragmentSelectionContract(spec),
    })),
  ];
}

async function main() {
  const check = process.argv.slice(2).includes('--check');
  const prettierConfig = await prettier.resolveConfig(path.join(CONTRACT_ROOT, 'test-review.contract.json'));

  const stale = [];
  for (const target of targets()) {
    const filePath = path.join(CONTRACT_ROOT, target.relativePath);
    const generated = await render(target.build(), filePath, prettierConfig);

    if (!check) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, generated, 'utf8');
      console.log(`✅ wrote test/contracts/${target.relativePath}`);
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
    console.error('❌ contract generation is out of date with its sources:\n');
    for (const entry of stale) {
      console.error(`   test/contracts/${entry.relativePath} ${entry.reason}`);
      if (entry.onDisk !== undefined) {
        console.error(`      on disk:   ${entry.onDisk.trim()}`);
        console.error(`      generated: ${entry.generated.trim()}`);
      }
    }
    console.error('\n   Regenerate with "node tools/generate-contracts.js". The contracts are generated; do not hand-edit them.\n');
    process.exit(1);
  }

  if (check) console.log(`✅ ${targets().length} contract(s) match what their sources generate`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(error instanceof GeneratorError ? 1 : 2);
  });
}

module.exports = {
  buildTestReviewContract,
  buildFragmentSelectionContract,
  buildTraceContract,
  traceOracleSpecs,
  traceStepId,
  render,
  FRAGMENT_SELECTION,
  ROUTING_CONTRACTS,
  routingOracleSpecs,
};
