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
 *     DEFAULT_AGENT for their witness legs.
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

const PROJECT_ROOT = path.join(__dirname, '..');
const CONTRACT_ROOT = path.join(PROJECT_ROOT, 'test', 'contracts');
const EVAL_ROOT = path.join(PROJECT_ROOT, 'test', 'evals');
const WORKFLOW_ROOT = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch');
const FIXTURE_ROOT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-review-eval');
const GROUND_TRUTH_PATH = path.join(FIXTURE_ROOT, 'ground-truth.json');
const FIXTURE_PREFIX = 'test/fixtures/test-review-eval/';

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

/** A basename anchored so a finding may cite the fixture by any path that ends in it. */
function basenamePattern(basename) {
  return `^(?:.*/)?${basename.replaceAll('.', String.raw`\.`)}$`;
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
 * One behavior per severity class of planted row.
 *
 * The membership of each group is derived from the registry's severity for the
 * rows the corpus actually plants, so a plant that changes row cannot leave a
 * behavior pointing at a row nobody plants any more. Everything here is the prose
 * around that: which risk the group names.
 */
const PLANT_GROUPS = [
  { id: 'B-001', severities: ['CRITICAL'], label: 'CRITICAL', risk: 'missed-critical-defect' },
  { id: 'B-003', severities: ['HIGH'], label: 'HIGH', risk: 'missed-high-defect' },
  { id: 'B-004', severities: ['MEDIUM', 'LOW'], label: 'MEDIUM or LOW', risk: 'missed-minor-defect' },
];

/**
 * How hard a missed plant grades, read off the registry severity of the rows in
 * the group.
 *
 * The corpus supports two grades and no more, because the harness gates CRITICAL
 * recall on its own threshold of 1 and pools every other severity into a single
 * recall threshold of 0.7. A group whose rows carry their own gate grades
 * critical; a group that feeds the pooled gate grades material.
 *
 * Nothing grades below material. The HIGH group and the MEDIUM-or-LOW group were
 * both hand-assigned `low`, which put missing every planted HIGH defect below one
 * out-of-scope finding (B-005, material). Missing a planted defect is the failure
 * this suite exists to catch, so that ordering was inverted. `low` is now unused
 * here, which is the honest reading of a corpus with two tiers.
 *
 * @param {{severities: string[]}} group
 * @returns {string}
 */
function plantGroupSeverity(group) {
  return group.severities.includes('CRITICAL') ? 'critical' : 'material';
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
        'The scope control recorded as negativeControls[0] in ground-truth.json. A changed implementation with no accompanying test belongs to trace, so reporting it here is a scope violation scored as a false positive.',
      direction: {
        polarity: 'expects-hold',
        relation: 'not',
        scope: 'Every finding the review reported, searched for one naming a source file outside the review set.',
        negativeDomain: 'A review that raises a coverage violation against a changed implementation file.',
        evidenceTargets: [FINDINGS_POINTER],
      },
      check: {
        op: 'not',
        operands: [
          {
            op: 'for-any',
            collection: { pointer: FINDINGS_POINTER },
            // A reviewed test file always carries a .spec or .test segment, so a bare
            // name with a .ts or .js extension is an implementation file and out of scope.
            predicate: { op: 'regex', operands: [{ pointer: '@/file' }], pattern: String.raw`^(?:.*/)?[a-z0-9-]+\.(?:ts|js)$` },
          },
        ],
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

  const behaviors = [];
  for (const group of PLANT_GROUPS) {
    const rows = sortRows([
      ...new Set(plants.filter((plant) => group.severities.includes(severityOfRow.get(plant.row))).map((plant) => plant.row)),
    ]);
    // An empty severity class is dropped, because a behavior over no oracle demands
    // nothing and no scorer could fail it.
    if (rows.length === 0) continue;
    behaviors.push({
      id: group.id,
      description: `Every planted ${group.label} defect is named at its registry row, in the right file, within the declared line window.`,
      severity: plantGroupSeverity(group),
      observableSuccessCriterion:
        `The verdict artifact carries one finding per planted ${group.label} row, each citing the fixture the defect was ` +
        `planted in and a line inside that row's declared window.`,
      requirementLinks: rows.map((row) => ({ scheme: 'tea-criteria-registry', id: row })),
      riskLinks: [{ scheme: 'tea-eval-risk', id: group.risk }],
      oracles: rows.map((row) => oracleIdOfRow.get(row)).sort(),
    });
  }

  behaviors.splice(1, 0, {
    id: 'B-002',
    description: 'The clean control draws no finding.',
    severity: 'critical',
    observableSuccessCriterion: `No finding in the verdict artifact names ${cleanBasename}.`,
    requirementLinks: [{ scheme: 'tea-eval-ground-truth', id: clean.path }],
    riskLinks: [{ scheme: 'tea-eval-risk', id: 'reports-everything' }],
    oracles: [cleanOracleId],
  });
  behaviors.push(
    {
      id: 'B-005',
      description: 'Coverage findings stay out of scope, because coverage belongs to the trace workflow.',
      severity: 'material',
      observableSuccessCriterion: 'No finding in the verdict artifact names a source file outside the review set.',
      requirementLinks: [{ scheme: 'tea-eval-ground-truth', id: scopeControl.id }],
      riskLinks: [{ scheme: 'tea-eval-risk', id: 'scope-creep-into-trace' }],
      oracles: [scopeOracleId],
    },
    {
      id: 'B-006',
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
    schemaVersion: 4,
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
  environment: stringShape([], ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']),
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
function excludeClause(fragments) {
  if (fragments.length === 1) return ` and does not name ${fragments[0]}.`;
  if (fragments.length === 2) return ` and names neither ${fragments[0]} nor ${fragments[1]}.`;
  return ` and names none of ${fragments.slice(0, -1).join(', ')}, or ${fragments.at(-1)}.`;
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
    behaviors.push({
      id: `B-${String(index + 1).padStart(3, '0')}`,
      description: `${authored.lead} The case asserts: "${assertion.text}"`,
      severity: authored.severity,
      observableSuccessCriterion: authored.successLead + excludeClause(entry.expect.mustNotLoad),
      requirementLinks: evals.contextFiles.map((file) => ({ scheme: 'tea-workflow-step', id: `${workflow}/${file}` })),
      riskLinks: authored.risks.map((risk) => ({ scheme: 'tea-eval-risk', id: risk })),
      oracles: [containmentId, exclusionId],
    });
  }

  return {
    schemaVersion: 4,
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
  const legs = [first, second].map((caseId) => ({ caseId, legId: `witness-${caseId}` }));
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
    legs: legs.map(({ caseId, legId }) => ({
      legId,
      inputs: witnessInputs(
        SELECTION_REQUEST_SHAPE,
        { option: { agent: SELECTION_DEFAULT_AGENT } },
        {
          kind: 'text',
          value:
            `The prompt the harness assembles for case ${caseId}: the workflow's own step file or files, its resources/tea-index.csv, ` +
            `and that case's task, repository facts, and TEA config.`,
        },
      ),
    })),
    // A differential asserts the two legs disagree; an invariance claim asserts
    // they agree. Same equality expression, negated only in the first case.
    relation: invariant ? equality : { op: 'not', operands: [equality] },
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
    { relativePath: 'test-review.contract.json', build: buildTestReviewContract },
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

module.exports = { buildTestReviewContract, buildFragmentSelectionContract, render, FRAGMENT_SELECTION };
