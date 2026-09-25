/**
 * `tea-evaluate check` and `tea-evaluate digest`, end to end (Story 1.4).
 *
 * Every case spawns the real bin over a real evaluation folder and the real
 * installed eval-quality:
 *
 * - the valid fixture (`test/fixtures/evaluate/valid/`) checks clean, its
 *   contract compiles through the engine CLI, and its qualified baseline probe
 *   meets the engine's probe schema;
 * - each subcommand exits 64 when `--evaluation` is missing or resolves to no
 *   `evaluation.json`;
 * - each of the eleven authoring defects, planted alone in a temp copy of the
 *   fixture, exits 10 naming its file and rule, and two planted together are
 *   both listed;
 * - `digest` writes a sorted `{path, sha256}` index over `corpus/`, `probes/`
 *   and `mutations/` and prints eval-quality's `digestArtifact` over it, which
 *   moves when a `corpus/` byte moves;
 * - a packed install (`npm pack`, installed with `--omit=dev` beside the
 *   repository's own engine) runs `tea-evaluate check` to exit 0, which proves
 *   every module the runtime needs ships in TeA's `dependencies`, and runs
 *   `tea-skill-runner` over the stub agent (Story 1.6).
 *
 * Story 1.5 adds the registry: the fixture's `evaluation.json` registry builds a
 * `CommandTargetPolicy` that eval-quality's own `CommandTargetPolicy` schema
 * accepts, a registry entry the runtime's `RegistryEntry` schema refuses is
 * refused by the builder, and a defect signature one of an entry's
 * `infrastructureExitCodes` could satisfy exits 10 (AD-7).
 *
 * Story 1.6 gives `launch` its shape (`root`, and `skillRoot` for a skill) and
 * adds the `skill-root` rule: a mutation whose `targetArtifact` is not inside
 * the skill root exits 10, a sibling directory sharing its name as a prefix
 * included.
 *
 * Usage: node test/test-evaluate-check.js
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const AjvModule = require('ajv/dist/2020');

const { buildCorpusIndex, writeCorpusIndex } = require('../cli/lib/evaluate/corpus-index');
const { engineCliPath, engineSchemaPath, loadEngine, ENGINE_CLI_ENV } = require('../cli/lib/evaluate/engine');
const { resolveEvaluationFolder } = require('../cli/lib/evaluate/folder');
const { createRegistry, registryFromEvaluation } = require('../cli/lib/evaluate/registry');
const { digest, digestFiles, redactArgs, redactSecrets } = require('../cli/lib/evaluate/digest');
const { isDateTime } = require('../cli/lib/evaluate/formats');
const { createArtifactValidator } = require('../cli/lib/evaluate/records');
const { scratchDirectories } = require('./lib/scratch-directories');

const Ajv = AjvModule.default ?? AjvModule;

const PROJECT_ROOT = path.join(__dirname, '..');
const CLI = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const VALID = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'valid');
const TEA_MANIFEST = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;
const scratch = scratchDirectories('tea-evaluate-check');

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function tempDir(label) {
  return scratch.make(label);
}

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: options.cwd ?? PROJECT_ROOT, encoding: 'utf8', env: process.env });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}${result.stderr}` };
}

function copyValid() {
  const folder = path.join(tempDir('case'), 'valid');
  fs.cpSync(VALID, folder, { recursive: true });
  return folder;
}

function editJson(folder, relative, edit) {
  const file = path.join(folder, relative);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Sets the fixture's one registry entry's infrastructure exit codes. */
function setInfrastructureCodes(folder, codes) {
  editJson(folder, 'evaluation.json', (value) => (value.registry[0].infrastructureExitCodes = codes));
}

/** Replaces P-002's defect signature predicate. */
function setSignature(folder, predicate) {
  editJson(folder, 'probes/P-002.probe.json', (value) => (value.defectSignature.condition.predicate = predicate));
}

const EXIT_CODE = { pointer: '/interactions/observed/exit-code' };
const exitEquals = (code) => ({ op: 'equality', operands: [EXIT_CODE, { literal: code }] });
/** A clause reading only one call-input option of the observed interaction. */
const optionEquals = (name, value) => ({
  op: 'equality',
  operands: [{ pointer: `/interactions/observed/call-inputs/option/${name}` }, { literal: value }],
});
/** `count` call-input clauses beside `rest`, all joined by `all`. */
const withOptionClauses = (count, ...rest) => ({
  op: 'all',
  operands: [...Array.from({ length: count }, (_, index) => optionEquals(`flag${index + 1}`, 'on')), ...rest],
});

/**
 * Plants P-003, a gameability probe on B-001 whose naive oracle is O-002, with
 * its degenerate response at corpus/gameability/P-003.json and the
 * gameability arm declared (Story 1.9); `probe` and `response` edit each
 * before it is written, and `response: null` leaves the file out.
 */
function plantGameability(folder, { probe = () => {}, response = () => {} } = {}) {
  const signature = JSON.parse(fs.readFileSync(path.join(folder, 'probes', 'P-002.probe.json'), 'utf8')).defectSignature;
  const planted = {
    probeId: 'P-003',
    probeClass: 'gameability',
    behaviorId: 'B-001',
    expectedClean: false,
    rationale: 'Gameability: a shortcut run that writes nothing and exits 1 passes a naive check.',
    defects: [],
    defectSignature: signature,
    qualification: { route: 'gameability', degenerateResponse: 'Exits 1 having written nothing.', naiveOracle: 'O-002' },
  };
  probe(planted);
  fs.writeFileSync(path.join(folder, 'probes', 'P-003.probe.json'), `${JSON.stringify(planted, null, 2)}\n`);
  const degenerate = { schemaVersion: 1, steps: { 'tea-atdd-runner-run': { stdout: '', stderr: '', exitCode: 1 } } };
  if (response !== null) {
    response(degenerate);
    fs.mkdirSync(path.join(folder, 'corpus', 'gameability'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'corpus', 'gameability', 'P-003.json'), `${JSON.stringify(degenerate, null, 2)}\n`);
  }
  editJson(folder, 'evaluation.json', (value) => value.arms.push('gameability'));
}

/** Declares R-001 in the contract, the judge in evaluation.json and its model in the evaluator conditions (Story 1.9); `edit` changes the three before they are written. */
function plantRubric(folder, edit = () => {}) {
  const rubric = {
    id: 'R-001',
    scaleLevels: [
      { level: 0, anchor: 'The scaffold holds an active test.' },
      { level: 1, anchor: 'Every test in the scaffold is skipped.' },
    ],
    failureModePenalties: [{ name: 'active-test', description: 'An active test counts as no scaffold.' }],
    maxLength: 200,
    criteria: [{ id: 'RC-001', text: 'Are the scaffold tests all skipped?', evidence: '/interactions/tea-atdd-runner-run/exit-code' }],
  };
  const judge = { agent: 'custom', agentCommand: 'stub-judge', agentArgs: [], timeoutMs: 60_000 };
  const conditions = {
    schemaVersion: 1,
    modelSnapshot: 'a-model-snapshot',
    systemPromptDigest: `sha256:${'0'.repeat(64)}`,
    judge: { modelSnapshot: 'a-judge-snapshot' },
  };
  const planted = { rubric, judge, conditions };
  edit(planted);
  editJson(folder, 'contract.json', (value) => (value.rubrics = [planted.rubric]));
  editJson(folder, 'evaluation.json', (value) => {
    if (planted.judge === null) delete value.judge;
    else value.judge = planted.judge;
  });
  fs.writeFileSync(path.join(folder, 'policy', 'evaluator-conditions.json'), `${JSON.stringify(planted.conditions, null, 2)}\n`);
}

/**
 * Characters a path field refuses beyond C0 and DEL, one per class: C1
 * controls, the line and paragraph separators, and the bidirectional
 * formatting characters (embeddings and overrides, isolates, marks).
 */
const UNPRINTABLE_PATH_CHARACTERS = [
  ['a C1 control (U+0085)', '\u0085'],
  ['a C1 control (U+009B)', '\u009B'],
  ['a line separator (U+2028)', '\u2028'],
  ['a paragraph separator (U+2029)', '\u2029'],
  ['a right-to-left override (U+202E)', '\u202E'],
  ['a left-to-right isolate (U+2066)', '\u2066'],
  ['a right-to-left mark (U+200F)', '\u200F'],
  ['an Arabic letter mark (U+061C)', '\u061C'],
];

function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------
// The valid fixture

async function checkValidFixture() {
  const result = runCli(['check', '--evaluation', VALID]);
  check(result.status === 0, `check over the valid fixture exited ${result.status}; expected 0\n${result.output}`);
  check(!/unknown format/.test(result.output), `check printed an Ajv format warning\n${result.output}`);

  const byManifest = runCli(['check', '--evaluation', path.join(VALID, 'evaluation.json')]);
  check(byManifest.status === 0, `check naming evaluation.json itself exited ${byManifest.status}; expected 0\n${byManifest.output}`);

  const compiled = path.join(tempDir('compile'), 'contract.compiled.json');
  const compile = spawnSync(process.execPath, [engineCliPath(), 'compile', '--in', path.join(VALID, 'contract.json'), '--out', compiled], {
    encoding: 'utf8',
  });
  check(compile.status === 0, `the fixture contract does not compile through the engine CLI (exit ${compile.status})\n${compile.stderr}`);

  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  const validateProbe = ajv.compile(JSON.parse(fs.readFileSync(engineSchemaPath('probe.schema.json'), 'utf8')));
  const qualified = JSON.parse(fs.readFileSync(path.join(VALID, 'baseline', 'probes', 'P-001.probe.json'), 'utf8'));
  check(
    validateProbe(qualified),
    `the fixture's qualified baseline probe does not meet eval-quality's probe schema: ${JSON.stringify(validateProbe.errors)}`,
  );
}

// ---------------------------------------------------------------------------
// The registry (Story 1.5)

/**
 * Problems eval-quality's own `CommandTargetPolicy` parser finds in `policy`,
 * or an empty list when it accepts it.
 *
 * `parseCommandTargetPolicy` on `eval-quality/adapters` refuses an invalid
 * mapping with a `RuntimeFault` whose `cause` is the `ZodError` carrying every
 * issue. A child Node process runs it, because the test tree loads the engine
 * as an ES module, and prints the issues it reports.
 */
function commandTargetPolicyProblems(policy) {
  const script = [
    "import { readFileSync } from 'node:fs';",
    "import { parseCommandTargetPolicy } from 'eval-quality/adapters';",
    'try {',
    "  parseCommandTargetPolicy(JSON.parse(readFileSync(0, 'utf8')));",
    "  process.stdout.write('[]');",
    '} catch (error) {',
    "  if (error?.code !== 'schema-parse-failure' || !Array.isArray(error.cause?.issues)) throw error;",
    '  process.stdout.write(JSON.stringify(error.cause.issues));',
    '}',
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: PROJECT_ROOT,
    input: JSON.stringify(policy),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`eval-quality's parseCommandTargetPolicy could not be run\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function checkRegistry() {
  const evaluation = JSON.parse(fs.readFileSync(path.join(VALID, 'evaluation.json'), 'utf8'));
  const registry = registryFromEvaluation(evaluation, { root: PROJECT_ROOT });
  const policy = registry.commandTargetPolicy({ cwd: tempDir('registry-cwd') });
  const problems = commandTargetPolicyProblems(policy);
  check(
    problems.length === 0,
    `the policy the fixture registry builds does not meet eval-quality's CommandTargetPolicy schema: ${JSON.stringify(problems)}`,
  );
  const leaked = commandTargetPolicyProblems({
    authorizations: [{ ...policy.authorizations[0], infrastructureExitCodes: [3] }],
  });
  check(leaked.length > 0, "eval-quality's CommandTargetPolicy schema accepted an unknown key, so this case proves nothing");
  check(policy.authorizations.length === evaluation.registry.length, 'the policy does not carry one authorization per registry entry');
  check(
    policy.authorizations.every((authorization) => !Object.hasOwn(authorization, 'infrastructureExitCodes')),
    'an authorization carries infrastructureExitCodes, which eval-quality would refuse as an unknown key',
  );
  check(
    policy.authorizations[0]?.target === path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'red-phase-gate.js'),
    `the fixture's relative target did not resolve against the registry root: ${policy.authorizations[0]?.target}`,
  );
  check(
    registry.targetProblems().length === 0,
    `the fixture's registered target is missing or not executable: ${registry.targetProblems().join('; ')}`,
  );

  // The builder reads the RegistryEntry schema: an entry it refuses never
  // becomes an authorization.
  const [entry] = evaluation.registry;
  const { infrastructureExitCodes, ...withoutCodes } = entry;
  let refused;
  try {
    createRegistry([withoutCodes], { root: PROJECT_ROOT });
  } catch (error) {
    refused = error;
  }
  check(
    refused !== undefined && refused.message.includes('infrastructureExitCodes'),
    `createRegistry accepted an entry with no infrastructureExitCodes (${infrastructureExitCodes.join(', ')} removed): ${refused?.message}`,
  );
  // Two executables on one interface with different keys: each authorization
  // carries its own entry's keys, and a request's environment is read for the
  // one executable it targets.
  const shared = createRegistry(
    [
      { ...entry, environmentKeys: ['HOME'] },
      { ...entry, executable: 'tea-atdd-report', environmentKeys: ['TEA_REPORT_TOKEN'] },
    ],
    { root: PROJECT_ROOT },
  );
  const sharedPolicy = shared.commandTargetPolicy({ cwd: PROJECT_ROOT });
  check(
    JSON.stringify(sharedPolicy.authorizations.map((authorization) => authorization.permittedEnvironmentKeys)) ===
      JSON.stringify([['HOME'], ['TEA_REPORT_TOKEN']]),
    `entries sharing an interface did not keep their own keys: ${JSON.stringify(sharedPolicy.authorizations.map((a) => a.permittedEnvironmentKeys))}`,
  );
  const reportEnvironment = shared.hostEnvironment(entry.interfaceId, [], 'tea-atdd-report');
  check(!Object.hasOwn(reportEnvironment, 'HOME'), "hostEnvironment for one executable read another entry's key");
  let ambiguous;
  try {
    shared.hostEnvironment(entry.interfaceId);
  } catch (error) {
    ambiguous = error;
  }
  check(ambiguous !== undefined, 'hostEnvironment answered for an interface with two executables without being told which');
  let dotted;
  try {
    dotted = createRegistry([{ ...entry, target: '..tools/gate.js' }], { root: PROJECT_ROOT }).commandTargetPolicy({ cwd: PROJECT_ROOT });
  } catch (error) {
    dotted = error;
  }
  check(!(dotted instanceof Error), `a target in a directory named "..tools" was refused: ${dotted?.message}`);

  let unknownField;
  try {
    createRegistry([{ ...entry, shell: true }], { root: PROJECT_ROOT });
  } catch (error) {
    unknownField = error;
  }
  check(unknownField !== undefined && unknownField.message.includes('shell'), 'createRegistry accepted an entry with an unknown field');

  // A directory carries the executable bit and still cannot be spawned.
  const directoryTarget = createRegistry([{ ...entry, target: 'test/fixtures/evaluate/valid' }], { root: PROJECT_ROOT });
  const directoryProblems = directoryTarget.targetProblems();
  check(
    directoryProblems.length === 1 && directoryProblems[0].includes('is not a file'),
    `targetProblems accepted a directory as a target: ${JSON.stringify(directoryProblems)}`,
  );

  // A relative root, and a relative projectRoot override, are fixed to absolute
  // paths, so a later change of working directory cannot move a target.
  const expectedTarget = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'red-phase-gate.js');
  const startDirectory = process.cwd();
  try {
    process.chdir(PROJECT_ROOT);
    const relative = createRegistry([entry], { root: '.' });
    const overridden = createRegistry([entry], { root: os.tmpdir() });
    process.chdir(os.tmpdir());
    check(relative.root === PROJECT_ROOT, `a relative registry root was kept as ${JSON.stringify(relative.root)}`);
    const relativeTarget = relative.commandTargetPolicy({ cwd: PROJECT_ROOT }).authorizations[0].target;
    check(relativeTarget === expectedTarget, `a relative registry root resolved its target to ${relativeTarget}`);
    check(relative.targetProblems().length === 0, `a relative registry root broke targetProblems: ${relative.targetProblems().join('; ')}`);
    process.chdir(path.join(PROJECT_ROOT, 'test'));
    const override = overridden.commandTargetPolicy({ cwd: PROJECT_ROOT, projectRoot: '..' }).authorizations[0].target;
    check(override === expectedTarget, `a relative projectRoot override resolved the target to ${override}`);
    check(
      overridden.targetPath(entry, '..') === expectedTarget,
      `targetPath kept a relative projectRoot override: ${overridden.targetPath(entry, '..')}`,
    );
    check(
      overridden.targetProblems('..').length === 0,
      `targetProblems kept a relative projectRoot override: ${overridden.targetProblems('..').join('; ')}`,
    );
  } finally {
    process.chdir(startDirectory);
  }
}

// ---------------------------------------------------------------------------
// Digest, redaction and record formats (review round 1)

async function checkRuntimeUnits() {
  // A missing file and a file holding the marker's bytes digest apart; a
  // missing file and an ordinary file digest as they always have.
  const folder = tempDir('digest-files');
  fs.writeFileSync(path.join(folder, 'marker.txt'), '<missing>');
  fs.writeFileSync(path.join(folder, 'plain.txt'), 'bytes');
  const markerPresent = await digestFiles(folder, ['marker.txt']);
  fs.rmSync(path.join(folder, 'marker.txt'));
  const markerMissing = await digestFiles(folder, ['marker.txt']);
  check(markerPresent !== markerMissing, 'a file holding "<missing>" digests the same as a missing file');
  check(markerMissing === digest(['marker.txt', '<missing>']), 'a missing file no longer digests as its path and the <missing> marker');
  check(
    (await digestFiles(folder, ['plain.txt'])) === digest(['plain.txt', Buffer.from('bytes')]),
    'an ordinary file no longer digests as its path and its bytes',
  );

  // URL userinfo is a credential with or without a password half.
  for (const [input, expected] of [
    ['--endpoint=https://user:pass@host.example/path?x=1', '--endpoint=https://[redacted]@host.example/path?x=1'],
    ['clone http://ghs_token@github.example/org/repo', 'clone http://[redacted]@github.example/org/repo'],
    ['https://user:p@ss@host.example/', 'https://[redacted]@host.example/'],
    ['https://host.example/users/a@b', 'https://host.example/users/a@b'],
    ['mail someone@example.com', 'mail someone@example.com'],
  ]) {
    check(redactSecrets(input) === expected, `redactSecrets(${JSON.stringify(input)}) gave ${JSON.stringify(redactSecrets(input))}`);
  }
  const args = redactArgs(['--endpoint=https://user:pass@host.example', 'https://user:pass@host.example']);
  check(
    JSON.stringify(args) === JSON.stringify(['--endpoint=[redacted]', '[redacted]']),
    `redactArgs kept URL userinfo: ${JSON.stringify(args)}`,
  );

  // date-time is checked, calendar and clock included, with no warning.
  for (const value of ['2026-09-23T10:00:00Z', '2024-02-29T23:59:60.5+05:30', '2026-01-01t00:00:00z']) {
    check(isDateTime(value), `isDateTime refused ${value}`);
  }
  for (const value of [
    '2026-02-30T00:00:00Z',
    '2023-02-29T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-01-01 00:00:00Z',
    '2026-01-01T00:00:00+24:00',
    'yesterday',
  ]) {
    check(!isDateTime(value), `isDateTime accepted ${value}`);
  }
  const stampSchema = { type: 'object', properties: { at: { type: 'string', format: 'date-time' } } };
  const validateArtifact = createArtifactValidator({ readJson: async () => ({ present: true, value: stampSchema }) });
  const warnings = [];
  const warn = console.warn;
  console.warn = (...parts) => warnings.push(parts.join(' '));
  let malformed;
  let wellFormed;
  try {
    malformed = await validateArtifact('stamp', { at: '2026-02-30T00:00:00Z' });
    wellFormed = await validateArtifact('stamp', { at: '2026-09-23T10:00:00Z' });
  } finally {
    console.warn = warn;
  }
  check(malformed.length > 0, 'createArtifactValidator accepted a malformed date-time');
  check(wellFormed.length === 0, `createArtifactValidator refused a well-formed date-time: ${JSON.stringify(wellFormed)}`);
  check(warnings.length === 0, `createArtifactValidator warned while compiling a date-time format: ${warnings.join('; ')}`);
}

// ---------------------------------------------------------------------------
// The optional engine is absent

const HIDE_ENGINE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'engine-absent', 'hide-engine.cjs');
const ENGINE_ABSENT_MESSAGE = 'eval-quality is not installed where tea-evaluate can reach it';

/**
 * With eval-quality hidden from every resolution, the runtime still loads
 * (its synchronous schema-version reading is guarded), each subcommand exits
 * 12 naming the package to install, and asking the runtime for a schema version
 * or the engine version names the missing package too.
 */
function checkEngineAbsent() {
  for (const subcommand of ['check', 'digest']) {
    const result = spawnSync(process.execPath, ['--require', HIDE_ENGINE, CLI, subcommand, '--evaluation', copyValid()], {
      encoding: 'utf8',
    });
    check(
      result.status === 12,
      `${subcommand} with the engine absent exited ${result.status}; expected 12\n${result.stdout}${result.stderr}`,
    );
    check(
      result.stderr.includes(ENGINE_ABSENT_MESSAGE),
      `${subcommand} with the engine absent did not name the missing package\n${result.stderr}`,
    );
  }
  for (const [label, expression] of [
    ['a record builder', "require('./cli/lib/evaluate/records').sealedRunRecord({})"],
    ['the engine version', "require('./cli/lib/evaluate/engine').engineVersion()"],
  ]) {
    const result = spawnSync(process.execPath, ['--require', HIDE_ENGINE, '-e', expression], { cwd: PROJECT_ROOT, encoding: 'utf8' });
    check(
      result.status !== 0 && result.stderr.includes(ENGINE_ABSENT_MESSAGE),
      `${label} with the engine absent did not report the missing package (exit ${result.status})\n${result.stderr}`,
    );
  }
}

// ---------------------------------------------------------------------------
// --evaluation is required and must resolve

function checkUsage() {
  const empty = tempDir('empty');
  for (const subcommand of ['check', 'digest']) {
    const missing = runCli([subcommand]);
    check(missing.status === 64, `${subcommand} with no --evaluation exited ${missing.status}; expected 64\n${missing.output}`);
    check(missing.stderr.includes('--evaluation'), `${subcommand} with no --evaluation did not name the flag on stderr\n${missing.output}`);

    const unresolved = runCli([subcommand, '--evaluation', empty]);
    check(
      unresolved.status === 64,
      `${subcommand} over a folder with no evaluation.json exited ${unresolved.status}; expected 64\n${unresolved.output}`,
    );
    check(
      unresolved.stderr.includes('--evaluation'),
      `${subcommand} over an unresolved folder did not name the flag\n${unresolved.output}`,
    );
    check(fs.readdirSync(empty).length === 0, `${subcommand} wrote into a folder that did not resolve`);

    // A run from inside a valid folder still needs the flag: nothing defaults to the working directory.
    const fromInside = runCli([subcommand], { cwd: VALID });
    check(fromInside.status === 64, `${subcommand} run inside an evaluation folder with no flag exited ${fromInside.status}; expected 64`);
  }
  const noSubcommand = runCli([]);
  check(noSubcommand.status === 64, `tea-evaluate with no subcommand exited ${noSubcommand.status}; expected 64`);
  const unknownOption = runCli(['check', '--evaluation', VALID, '--no-such-flag']);
  check(unknownOption.status === 64, `an unknown option exited ${unknownOption.status}; expected 64`);

  const resolved = resolveEvaluationFolder(VALID);
  check(resolved.ok && resolved.folder === VALID, 'resolveEvaluationFolder did not resolve the valid fixture folder');
  check(!resolveEvaluationFolder().ok, 'resolveEvaluationFolder resolved an absent flag');

  // `link/../evaluation` climbs from the link's target, as the system resolves it.
  const base = fs.realpathSync(tempDir('climb'));
  fs.mkdirSync(path.join(base, 'real', 'deep'), { recursive: true });
  fs.cpSync(VALID, path.join(base, 'real', 'evaluation'), { recursive: true });
  fs.symlinkSync(path.join('real', 'deep'), path.join(base, 'link'), 'dir');
  const climbed = resolveEvaluationFolder(['link', '..', 'evaluation'].join(path.sep), base);
  check(
    climbed.ok && climbed.folder === path.join(base, 'real', 'evaluation'),
    `--evaluation link/../evaluation resolved to ${JSON.stringify(climbed)}; expected the folder beside the link's target`,
  );
}

// ---------------------------------------------------------------------------
// The authoring defects, one per temp copy

const DEFECT_CASES = [
  {
    name: 'a stale corpus-index.json',
    file: 'corpus-index.json',
    rule: 'stale-index',
    redigest: false,
    plant: (folder) => fs.appendFileSync(path.join(folder, 'corpus', 'reservations', 'docs', 'story.md'), 'One more line.\n'),
  },
  {
    name: 'an unknown evaluation.json schemaVersion',
    file: 'evaluation.json',
    rule: 'schema-version',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.schemaVersion = 2)),
    expect: (output) => [
      [output.includes(`${TEA_MANIFEST.name} ${TEA_MANIFEST.version}`), 'the message does not name the installed TeA version'],
      [output.includes('knows schemaVersion 1'), 'the message does not name the versions the runtime knows'],
    ],
  },
  {
    name: 'a committed probe carrying a runtime-owned top-level field',
    file: 'probes/P-001.probe.json',
    rule: 'runtime-owned-field',
    plant: (folder) => editJson(folder, 'probes/P-001.probe.json', (value) => (value.systemId = 'atdd-red-phase')),
    expect: (output) => [[output.includes('"systemId"'), 'the finding does not name the field']],
  },
  {
    name: 'a committed probe carrying a runtime-owned qualification field',
    file: 'probes/P-002.probe.json',
    rule: 'runtime-owned-field',
    plant: (folder) => editJson(folder, 'probes/P-002.probe.json', (value) => (value.qualification.rollbackVerified = true)),
    expect: (output) => [[output.includes('"qualification.rollbackVerified"'), 'the finding does not name the field']],
  },
  {
    name: 'a committed probe carrying a runtime-owned defect field',
    file: 'probes/P-002.probe.json',
    rule: 'runtime-owned-field',
    plant: (folder) => editJson(folder, 'probes/P-002.probe.json', (value) => (value.defects[0].oracleEvidence = [])),
    expect: (output) => [[output.includes('"defects[0].oracleEvidence"'), 'the finding does not name the field']],
  },
  {
    name: 'a mutation whose operator is not replace-exact',
    file: 'mutations/M-001.mutation.json',
    rule: 'mutation-operator',
    plant: (folder) => editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.operator.kind = 'regex-replace')),
  },
  {
    name: 'a replace-exact mutation with an occurrence count other than 1',
    file: 'mutations/M-001.mutation.json',
    rule: 'mutation-operator',
    plant: (folder) => editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.operator.occurrences = 2)),
  },
  {
    name: 'a targetArtifact inside a provisioned directory',
    file: 'mutations/M-001.mutation.json',
    rule: 'provisioned-target',
    plant: (folder) =>
      editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = 'node_modules/left-pad/index.js')),
  },
  {
    name: 'a contract declaring kind web',
    file: 'contract.json',
    rule: 'web-interface',
    plant: (folder) => editJson(folder, 'contract.json', (value) => (value.permittedInterfaces[0].kind = 'web')),
  },
  {
    name: 'a defect signature addressing a written file',
    file: 'probes/P-002.probe.json',
    rule: 'written-file-signature',
    plant: (folder) =>
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.defectSignature.observableChannel = 'artifact';
        value.defectSignature.condition.predicate = {
          op: 'existence',
          operands: [{ pointer: '/interactions/observed/artifact/scaffold' }],
        };
      }),
  },
  {
    name: 'a written-file pointer under a non-artifact channel',
    file: 'probes/P-002.probe.json',
    rule: 'written-file-signature',
    plant: (folder) =>
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.defectSignature.condition.predicate = {
          op: 'not',
          operands: [{ op: 'existence', operands: [{ pointer: '/interactions/observed/artifact/scaffold' }] }],
        };
      }),
  },
  {
    name: 'a behavior discharged by a defect probe declaring two oracles',
    file: 'probes/P-002.probe.json',
    rule: 'oracle-count',
    plant: (folder) => editJson(folder, 'contract.json', (value) => (value.behaviors[0].oracles = ['O-001', 'O-002'])),
  },
  {
    name: 'an off-pattern probe ID',
    file: 'probes/P-001.probe.json',
    rule: 'id-pattern',
    plant: (folder) => editJson(folder, 'probes/P-001.probe.json', (value) => (value.probeId = 'P-1')),
  },
  {
    name: 'an off-pattern behavior ID',
    file: 'contract.json',
    rule: 'id-pattern',
    plant: (folder) => editJson(folder, 'contract.json', (value) => (value.behaviors[1].id = 'B-2')),
  },
  {
    name: 'an off-pattern oracle ID',
    file: 'contract.json',
    rule: 'id-pattern',
    plant: (folder) =>
      editJson(folder, 'contract.json', (value) => {
        value.oracles[1].id = 'O-2';
        value.behaviors[1].oracles = ['O-2'];
      }),
  },
  {
    name: 'an off-pattern mutation ID',
    file: 'mutations/M-001.mutation.json',
    rule: 'id-pattern',
    plant: (folder) => editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.mutationId = 'M-1')),
  },
  {
    name: 'a baseline/qualification/ reference whose digest does not match',
    file: 'baseline/probes/P-001.probe.json',
    rule: 'qualification-digest',
    plant: (folder) => editJson(folder, 'baseline/qualification/P-001.baseline-pass.json', (value) => (value.exitCode = 1)),
  },
  {
    name: 'a clean control that is not zero-action',
    file: 'probes/P-001.probe.json',
    rule: 'clean-control',
    plant: (folder) => editJson(folder, 'probes/P-001.probe.json', (value) => (value.probeClass = 'defect')),
  },
  {
    name: 'a clean-control route with expectedClean false',
    file: 'probes/P-001.probe.json',
    rule: 'clean-control',
    plant: (folder) => editJson(folder, 'probes/P-001.probe.json', (value) => (value.expectedClean = false)),
  },
  {
    name: 'a defect signature exitCode == 3 against a registry entry declaring 3 to 6 as infrastructure codes',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => {
      setInfrastructureCodes(folder, [3, 4, 5, 6]);
      setSignature(folder, exitEquals(3));
    },
    expect: (output) => [[output.includes('exits 3, which'), 'the finding does not name exactly the satisfying code 3']],
  },
  {
    name: 'a defect signature naming an executable no registry entry declares',
    file: 'probes/P-002.probe.json',
    rule: 'unregistered-executable',
    plant: (folder) =>
      editJson(folder, 'probes/P-002.probe.json', (value) => (value.defectSignature.invocation.executable = 'tea-other-runner')),
  },
  {
    name: 'a registry that repeats an interface and executable pair',
    file: 'evaluation.json',
    rule: 'registry',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => value.registry.push({ ...value.registry[0] })),
  },
  {
    name: 'a mutation targetArtifact outside the skill root',
    file: 'mutations/M-001.mutation.json',
    rule: 'skill-root',
    plant: (folder) =>
      editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = 'docs/step-04-generate-tests.md')),
  },
  {
    name: 'a mutation targetArtifact in a sibling directory that shares the skill root as a name prefix',
    file: 'mutations/M-001.mutation.json',
    rule: 'skill-root',
    plant: (folder) =>
      editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = 'skill-extras/step-04-generate-tests.md')),
  },
  {
    name: 'a mutation targetArtifact that climbs out of the skill root after entering it',
    file: 'mutations/M-001.mutation.json',
    rule: 'skill-root',
    plant: (folder) =>
      editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = 'skill/../docs/step-04-generate-tests.md')),
  },
  {
    name: 'a skill evaluation whose launch declares no skillRoot',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => delete value.launch.skillRoot),
    expect: (output) => [[output.includes("required property 'skillRoot'"), 'the finding does not name the missing skillRoot']],
  },
  {
    name: 'a launch with no root',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => delete value.launch.root),
    expect: (output) => [[output.includes("required property 'root'"), 'the finding does not name the missing root']],
  },
  {
    name: 'an absolute launch root',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.launch.root = '/srv/project')),
    expect: (output) => [[output.includes('/launch/root'), 'the finding does not name /launch/root']],
  },
  {
    name: 'a skill root that climbs out of the launch root',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.launch.skillRoot = '../skill')),
    expect: (output) => [[output.includes('/launch/skillRoot'), 'the finding does not name /launch/skillRoot']],
  },
];

const STORY_RULES = [
  'stale-index',
  'schema-version',
  'runtime-owned-field',
  'mutation-operator',
  'provisioned-target',
  'web-interface',
  'written-file-signature',
  'oracle-count',
  'id-pattern',
  'qualification-digest',
  'clean-control',
  'infrastructure-exit-code',
  'unregistered-executable',
  'registry',
  'skill-root',
];

/** A file outside the evaluation folder, for the symbolic-link cases to point at. */
function outsideFile(bytes) {
  const file = path.join(tempDir('outside'), 'outside.json');
  fs.writeFileSync(file, bytes);
  return file;
}

/**
 * Folder shapes the final review found crashing or passing: symbolic links and
 * files where the index or the baseline expects a directory, duplicate IDs,
 * paths that name the whole target, and a manifest that is not an object. Each
 * must be an authoring finding (exit 10), never a crash or a pass.
 */
const HARDENING_CASES = [
  {
    name: 'a qualification with no route',
    file: 'probes/P-002.probe.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'probes/P-002.probe.json', (value) => delete value.qualification.route),
    expect: (output) => [
      [output.includes('route'), 'the finding does not name the missing route'],
      [
        !/fixCommit|degenerateResponse|noKnownDefectStatement|indicts/.test(output),
        'every route branch applied, burying the missing route',
      ],
    ],
  },
  {
    name: 'a symbolic link as the corpus/ root',
    file: 'corpus',
    rule: 'corpus-file',
    redigest: false,
    digestExit: 10,
    plant: (folder) => {
      const outside = path.join(tempDir('outside-root'), 'corpus');
      fs.cpSync(path.join(folder, 'corpus'), outside, { recursive: true });
      fs.rmSync(path.join(folder, 'corpus'), { recursive: true });
      fs.symlinkSync(outside, path.join(folder, 'corpus'), 'dir');
    },
  },
  {
    name: 'a regular file as the mutations/ root',
    file: 'mutations',
    rule: 'corpus-file',
    redigest: false,
    digestExit: 10,
    plant: (folder) => {
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
      fs.writeFileSync(path.join(folder, 'mutations'), 'not a directory\n');
    },
  },
  {
    name: 'a directory where corpus-index.json belongs',
    file: 'corpus-index.json',
    rule: 'stale-index',
    redigest: false,
    digestExit: 10,
    digestNames: 'corpus-index.json: [corpus-file]',
    plant: (folder) => {
      fs.rmSync(path.join(folder, 'corpus-index.json'));
      fs.mkdirSync(path.join(folder, 'corpus-index.json'));
    },
  },
  {
    name: 'a symbolic link loop under baseline/',
    file: 'baseline/loop',
    rule: 'baseline-file',
    plant: (folder) => fs.symlinkSync(path.join(folder, 'baseline'), path.join(folder, 'baseline', 'loop'), 'dir'),
  },
  {
    name: 'a qualification reference that is a symbolic link to an outside file with the same bytes',
    file: 'baseline/probes/P-001.probe.json',
    rule: 'qualification-digest',
    plant: (folder) => {
      const evidence = path.join(folder, 'baseline', 'qualification', 'P-001.baseline-pass.json');
      const outside = outsideFile(fs.readFileSync(evidence));
      fs.rmSync(evidence);
      fs.symlinkSync(outside, evidence);
    },
  },
  {
    name: 'a qualification directory that is a symbolic link out of the folder',
    file: 'baseline/probes/P-001.probe.json',
    rule: 'qualification-digest',
    plant: (folder) => {
      const directory = path.join(folder, 'baseline', 'qualification');
      const outside = path.join(tempDir('outside-qualification'), 'qualification');
      fs.cpSync(directory, outside, { recursive: true });
      fs.rmSync(directory, { recursive: true });
      fs.symlinkSync(outside, directory, 'dir');
    },
  },
  {
    name: 'a duplicate behavior ID',
    file: 'contract.json',
    rule: 'duplicate-id',
    plant: (folder) => editJson(folder, 'contract.json', (value) => (value.behaviors[1].id = value.behaviors[0].id)),
  },
  {
    name: 'a duplicate oracle ID',
    file: 'contract.json',
    rule: 'duplicate-id',
    plant: (folder) => editJson(folder, 'contract.json', (value) => (value.oracles[1].id = value.oracles[0].id)),
  },
  {
    name: 'a duplicate defect ID within a probe',
    file: 'probes/P-002.probe.json',
    rule: 'duplicate-id',
    plant: (folder) => editJson(folder, 'probes/P-002.probe.json', (value) => value.defects.push({ ...value.defects[0] })),
  },
  {
    name: 'a controlled-mutation probe with no scoring policy',
    file: 'policy/scoring-policy.json',
    rule: 'missing-file',
    plant: (folder) => fs.rmSync(path.join(folder, 'policy', 'scoring-policy.json')),
    expect: (output) => [[output.includes('reExecutionCap'), 'the finding does not say why the policy is needed']],
  },
  {
    name: 'a scoring policy with no reExecutionCap',
    file: 'policy/scoring-policy.json',
    rule: 'engine-schema',
    plant: (folder) => editJson(folder, 'policy/scoring-policy.json', (value) => delete value.reExecutionCap),
  },
  {
    name: 'a scoring policy stamped with a version the engine does not read',
    file: 'policy/scoring-policy.json',
    rule: 'engine-schema',
    plant: (folder) => editJson(folder, 'policy/scoring-policy.json', (value) => (value.schemaVersion += 1)),
    expect: (output) => [[output.includes('"schemaVersion"'), 'the finding does not name the stamp']],
  },
  {
    name: 'trials below the scoring policy minimumTrialCount',
    file: 'evaluation.json',
    rule: 'trials',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.trials = 2)),
    expect: (output) => [[output.includes('minimumTrialCount 3'), 'the finding does not name the minimum']],
  },
  {
    name: 'a controlled-mutation probe with no mutated arm declared',
    file: 'evaluation.json',
    rule: 'arms',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean'])),
    expect: (output) => [[output.includes('controlled-mutation'), 'the finding does not name the route']],
  },
  {
    name: 'a clean control with no clean arm declared',
    file: 'evaluation.json',
    rule: 'arms',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.arms = ['mutated'])),
    expect: (output) => [[output.includes('clean-control'), 'the finding does not name the route']],
  },
  {
    name: 'an arm declared with no probe to run on it',
    file: 'evaluation.json',
    rule: 'arms',
    plant: (folder) => fs.rmSync(path.join(folder, 'probes', 'P-002.probe.json')),
    expect: (output) => [[output.includes('arms declares mutated'), 'the finding does not name the unused arm']],
  },
  {
    name: 'an arm declared for the historical route with no historical probe',
    file: 'evaluation.json',
    rule: 'arms',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => value.arms.push('historical')),
    expect: (output) => [
      [output.includes('arms declares historical, and no probe takes the historical route'), 'the finding does not name the unused arm'],
    ],
  },
  {
    name: 'a gameability probe with no gameability arm declared',
    file: 'evaluation.json',
    rule: 'arms',
    plant: (folder) => {
      plantGameability(folder);
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'mutated']));
    },
    expect: (output) => [[output.includes('takes the gameability route'), 'the finding does not name the route']],
  },
  {
    name: 'a defect-class probe on the gameability route',
    file: 'probes/P-003.probe.json',
    rule: 'gameability',
    plant: (folder) => plantGameability(folder, { probe: (probe) => (probe.probeClass = 'defect') }),
  },
  {
    name: 'a gameability probe that seeds a defect',
    file: 'probes/P-003.probe.json',
    rule: 'gameability',
    plant: (folder) =>
      plantGameability(folder, {
        probe: (probe) => {
          const seeded = JSON.parse(fs.readFileSync(path.join(folder, 'probes', 'P-002.probe.json'), 'utf8'));
          probe.defects = seeded.defects;
        },
      }),
  },
  {
    name: "a gameability probe whose naive oracle is its own behavior's",
    file: 'probes/P-003.probe.json',
    rule: 'gameability',
    plant: (folder) => plantGameability(folder, { probe: (probe) => (probe.qualification.naiveOracle = 'O-001') }),
    expect: (output) => [[output.includes('belongs to another behavior'), 'the finding does not say where the naive oracle belongs']],
  },
  {
    name: 'a gameability probe whose naive oracle the contract does not declare',
    file: 'probes/P-003.probe.json',
    rule: 'reference',
    plant: (folder) => plantGameability(folder, { probe: (probe) => (probe.qualification.naiveOracle = 'O-009') }),
  },
  {
    name: 'a gameability probe whose naive oracle is off the oracle ID pattern',
    file: 'probes/P-003.probe.json',
    rule: 'schema',
    plant: (folder) => plantGameability(folder, { probe: (probe) => (probe.qualification.naiveOracle = 'naive') }),
  },
  {
    name: 'a gameability probe with no naive oracle',
    file: 'probes/P-003.probe.json',
    rule: 'schema',
    plant: (folder) => plantGameability(folder, { probe: (probe) => delete probe.qualification.naiveOracle }),
  },
  {
    name: 'a gameability probe with no degenerate response file',
    file: 'corpus/gameability/P-003.json',
    rule: 'gameability',
    plant: (folder) => plantGameability(folder, { response: null }),
    expect: (output) => [[output.includes('is absent'), 'the finding does not say the file is absent']],
  },
  {
    name: 'a degenerate response off its schema',
    file: 'corpus/gameability/P-003.json',
    rule: 'schema',
    plant: (folder) => plantGameability(folder, { response: (response) => (response.steps['tea-atdd-runner-run'].exitCode = '1') }),
  },
  {
    name: 'a degenerate response that leaves a plan step unanswered and answers another',
    file: 'corpus/gameability/P-003.json',
    rule: 'gameability',
    plant: (folder) =>
      plantGameability(folder, {
        response: (response) => {
          response.steps = { 'another-step': response.steps['tea-atdd-runner-run'] };
        },
      }),
    expect: (output) => [
      [output.includes('answers no response for interaction plan step tea-atdd-runner-run'), 'the unanswered step is not named'],
      [output.includes('answers step another-step'), 'the undeclared step is not named'],
    ],
  },
  {
    name: 'a degenerate response that exits an infrastructure code',
    file: 'corpus/gameability/P-003.json',
    rule: 'gameability',
    plant: (folder) => plantGameability(folder, { response: (response) => (response.steps['tea-atdd-runner-run'].exitCode = 3) }),
    expect: (output) => [[output.includes('infrastructure exit code'), 'the finding does not name the infrastructure code']],
  },
  {
    name: 'a historical probe whose defect is a controlled mutation',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    plant: (folder) => {
      editJson(folder, 'probes/P-002.probe.json', (value) => (value.qualification = { route: 'historical', fixCommit: 'a1b2c3d' }));
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'historical']));
    },
    expect: (output) => [[output.includes('1 not natural'), 'the finding does not count the defect that is not natural']],
  },
  {
    name: 'a historical probe that is expected clean',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    plant: (folder) => {
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.qualification = { route: 'historical', fixCommit: 'a1b2c3d' };
        value.defects[0].source = 'natural';
        value.expectedClean = true;
      });
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'historical']));
    },
    expect: (output) => [[output.includes('got expectedClean true'), 'the finding does not name expectedClean']],
  },
  {
    name: 'a historical probe that seeds no defect',
    file: 'probes/P-002.probe.json',
    rule: 'historical',
    plant: (folder) => {
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.qualification = { route: 'historical', fixCommit: 'a1b2c3d' };
        value.defects = [];
      });
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'historical']));
    },
    expect: (output) => [[output.includes('0 defect(s)'), 'the finding does not count the defects']],
  },
  {
    name: 'a historical probe whose fix commit is a ref name',
    file: 'probes/P-002.probe.json',
    rule: 'schema',
    plant: (folder) => {
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.qualification = { route: 'historical', fixCommit: 'main' };
        value.defects[0].source = 'natural';
      });
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'historical']));
    },
  },
  {
    name: 'a gameability probe that is expected clean',
    file: 'probes/P-003.probe.json',
    rule: 'gameability',
    plant: (folder) => plantGameability(folder, { probe: (probe) => (probe.expectedClean = true) }),
    expect: (output) => [[output.includes('expectedClean true'), 'the finding does not name expectedClean']],
  },
  {
    name: 'a gameability probe with no scoring policy',
    file: 'policy/scoring-policy.json',
    rule: 'missing-file',
    plant: (folder) => {
      plantGameability(folder);
      fs.rmSync(path.join(folder, 'probes', 'P-002.probe.json'));
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'gameability']));
      fs.rmSync(path.join(folder, 'policy', 'scoring-policy.json'));
    },
    expect: (output) => [[output.includes('gameability route'), 'the finding does not name the gameability route']],
  },
  {
    name: 'a historical probe with no scoring policy',
    file: 'policy/scoring-policy.json',
    rule: 'missing-file',
    plant: (folder) => {
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.qualification = { route: 'historical', fixCommit: 'a1b2c3d' };
        value.defects[0].source = 'natural';
      });
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'historical']));
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
      fs.rmSync(path.join(folder, 'policy', 'scoring-policy.json'));
    },
    expect: (output) => [[output.includes('regexMatchStepBudget'), 'the finding does not say why the policy is needed']],
  },
  {
    name: 'a rubric with no judge declared',
    file: 'evaluation.json',
    rule: 'judge',
    plant: (folder) => plantRubric(folder, (planted) => (planted.judge = null)),
    expect: (output) => [[output.includes('declares no judge'), 'the finding does not say the judge is missing']],
  },
  {
    name: 'a rubric with no judge model in the evaluator conditions',
    file: 'policy/evaluator-conditions.json',
    rule: 'judge',
    plant: (folder) => plantRubric(folder, ({ conditions }) => delete conditions.judge),
    expect: (output) => [[output.includes('judge.modelSnapshot'), 'the finding does not name the snapshot']],
  },
  {
    name: 'a judge declared beside a contract with no rubric',
    file: 'evaluation.json',
    rule: 'judge',
    plant: (folder) =>
      editJson(folder, 'evaluation.json', (value) => (value.judge = { agent: 'custom', agentCommand: 'stub-judge', timeoutMs: 60_000 })),
    expect: (output) => [[output.includes('declares no rubric'), 'the finding does not say the contract declares no rubric']],
  },
  {
    name: 'a judge model in the evaluator conditions beside a contract with no rubric',
    file: 'policy/evaluator-conditions.json',
    rule: 'judge',
    plant: (folder) =>
      fs.writeFileSync(
        path.join(folder, 'policy', 'evaluator-conditions.json'),
        JSON.stringify({
          schemaVersion: 1,
          modelSnapshot: 'none',
          systemPromptDigest: `sha256:${'0'.repeat(64)}`,
          judge: { modelSnapshot: null },
        }),
      ),
    expect: (output) => [[output.includes('never used; remove it'), 'the finding does not say to remove the block']],
  },
  {
    name: 'a judge on an agent adapter TeA does not have',
    file: 'evaluation.json',
    rule: 'judge',
    plant: (folder) => plantRubric(folder, ({ judge }) => (judge.agent = 'no-such-agent')),
  },
  {
    name: 'a judge on an adapter that cannot run read-only',
    file: 'evaluation.json',
    rule: 'judge',
    plant: (folder) => plantRubric(folder, ({ judge }) => (judge.agent = 'agy')),
    expect: (output) => [[output.includes('runs read-only'), 'the finding does not say the judge runs read-only']],
  },
  {
    name: 'a judge on the custom adapter with no command',
    file: 'evaluation.json',
    rule: 'judge',
    plant: (folder) => plantRubric(folder, ({ judge }) => delete judge.agentCommand),
  },
  {
    name: 'a judge model on an adapter that takes none',
    file: 'evaluation.json',
    rule: 'judge',
    plant: (folder) => plantRubric(folder, ({ judge }) => (judge.model = 'a-model')),
    expect: (output) => [[output.includes('--model is not supported'), 'the finding does not say the adapter takes no model']],
  },
  {
    name: 'a judge with no timeout',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => plantRubric(folder, ({ judge }) => delete judge.timeoutMs),
  },
  {
    name: 'a controlled-mutation probe that seeds no defect',
    file: 'probes/P-002.probe.json',
    rule: 'mutation-route',
    plant: (folder) => editJson(folder, 'probes/P-002.probe.json', (value) => (value.defects = [])),
  },
  {
    name: 'a tea-skill-runner registry entry with no evaluator conditions',
    file: 'policy/evaluator-conditions.json',
    rule: 'evaluator-conditions',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].target = 'tea-skill-runner')),
    expect: (output) => [[output.includes('which always runs an agent'), 'the finding does not say why the conditions are needed']],
  },
  {
    name: 'a tea-skill-runner registry entry whose evaluator conditions say none',
    file: 'policy/evaluator-conditions.json',
    rule: 'evaluator-conditions',
    plant: (folder) => {
      editJson(folder, 'evaluation.json', (value) => (value.registry[0].target = 'tea-skill-runner'));
      fs.writeFileSync(
        path.join(folder, 'policy', 'evaluator-conditions.json'),
        JSON.stringify({ schemaVersion: 1, modelSnapshot: 'none', systemPromptDigest: `sha256:${'0'.repeat(64)}` }),
      );
    },
    expect: (output) => [[output.includes('declares modelSnapshot none'), 'the finding does not name the none model']],
  },
  {
    name: 'evaluator conditions with no systemPromptDigest',
    file: 'policy/evaluator-conditions.json',
    rule: 'schema',
    plant: (folder) =>
      fs.writeFileSync(
        path.join(folder, 'policy', 'evaluator-conditions.json'),
        JSON.stringify({ schemaVersion: 1, modelSnapshot: 'a-model' }),
      ),
  },
  {
    name: 'a maxElapsedMs past the 2147483647 ms one timer holds',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].maxElapsedMs = 2 ** 31)),
  },
  {
    name: 'a provisioned directory of "."',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.workspace.provision = ['.'])),
  },
  {
    name: 'a provisioned directory of "./"',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.workspace.provision = ['./'])),
  },
  {
    name: 'a targetArtifact with a drive letter',
    file: 'mutations/M-001.mutation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = 'C:/x')),
  },
  {
    name: 'a targetArtifact hiding a climb out of the folder after a newline',
    file: 'mutations/M-001.mutation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = 'skill\n/../../x')),
  },
  {
    name: 'a provisioned directory hiding a climb after a newline',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.workspace.provision = ['node_modules\n/..'])),
  },
  {
    name: 'an evaluation.json that is null',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => fs.writeFileSync(path.join(folder, 'evaluation.json'), 'null\n'),
    expect: (output) => [
      [output.includes('(root) must be object'), 'the finding does not say the root must be an object'],
      [!output.includes('[schema-version]'), 'a non-object manifest was told to upgrade TeA'],
    ],
  },
  {
    name: 'an evaluation.json that is an array',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => fs.writeFileSync(path.join(folder, 'evaluation.json'), '[]\n'),
    expect: (output) => [[!output.includes('[schema-version]'), 'a non-object manifest was told to upgrade TeA']],
  },
  {
    name: 'a defect signature any non-zero exit satisfies',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => {
      setInfrastructureCodes(folder, [3, 4, 5, 6]);
      setSignature(folder, { op: 'not', operands: [exitEquals(0)] });
    },
    expect: (output) => [[output.includes('exits 3, 4, 5, 6, which'), 'the finding does not name every satisfying code']],
  },
  {
    name: 'a defect signature whose stream clause holds on a silent failure',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) =>
      setSignature(folder, {
        op: 'all',
        operands: [exitEquals(3), { op: 'existence', operands: [{ pointer: '/interactions/observed/stderr' }] }],
      }),
  },
  {
    name: 'a defect signature with no pointer that always holds',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => setSignature(folder, { op: 'equality', operands: [{ literal: 1 }, { literal: 1 }] }),
  },
  {
    name: 'a defect signature testing the exit code against a contract reference set',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => {
      editJson(folder, 'contract.json', (value) => {
        value.referenceSets = {
          'gate-failures': { keys: ['code'], members: [{ code: 3 }], commentary: 'The exit codes the gate reports a failure with.' },
        };
      });
      setSignature(folder, { op: 'set-membership', operands: [EXIT_CODE, { referenceSet: 'gate-failures' }] });
    },
    expect: (output) => [
      [output.includes('exits 3, which'), 'the finding does not name the code the reference set admits'],
      [!output.includes('[engine-schema]'), 'the planted contract is not valid, so the case proves nothing'],
    ],
  },
  {
    name: 'a defect signature the engine cannot resolve',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => setSignature(folder, { op: 'set-membership', operands: [EXIT_CODE, { referenceSet: 'undeclared-set' }] }),
    expect: (output) => [[output.includes('could not be resolved'), 'an unresolvable signature did not fail closed']],
  },
  {
    name: 'a manifestation witness any non-zero exit satisfies',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) =>
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.defects[0].manifestationWitness.relation = {
          op: 'not',
          operands: [{ op: 'equality', operands: [{ pointer: '/interactions/manifest-active-tests/exit-code' }, { literal: 0 }] }],
        };
      }),
    expect: (output) => [[output.includes('manifestationWitness.relation could hold'), 'the finding does not name the witness relation']],
  },
  {
    name: 'a defect signature whose call-input clause a failed run with the same inputs meets',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => {
      setInfrastructureCodes(folder, [3]);
      setSignature(folder, {
        op: 'all',
        operands: [
          { op: 'equality', operands: [{ pointer: '/interactions/observed/call-inputs/option/agent' }, { literal: 'claude' }] },
          { op: 'not', operands: [exitEquals(0)] },
        ],
      });
    },
  },
  {
    name: 'a manifestation witness reading its own declared inputs beside a non-zero exit',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) =>
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.defects[0].manifestationWitness.relation = {
          op: 'all',
          operands: [
            {
              op: 'equality',
              operands: [{ pointer: '/interactions/manifest-active-tests/call-inputs/option/agent' }, { literal: 'claude' }],
            },
            {
              op: 'not',
              operands: [{ op: 'equality', operands: [{ pointer: '/interactions/manifest-active-tests/exit-code' }, { literal: 0 }] }],
            },
          ],
        };
      }),
  },
  {
    name: 'a manifestation witness naming an interface no registry entry declares',
    file: 'probes/P-002.probe.json',
    rule: 'unregistered-executable',
    plant: (folder) =>
      editJson(folder, 'probes/P-002.probe.json', (value) => (value.defects[0].manifestationWitness.interfaceId = 'tea-other')),
  },
  {
    name: 'a registry entry with no infrastructureExitCodes',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => delete value.registry[0].infrastructureExitCodes),
    expect: (output) => [[output.includes('infrastructureExitCodes'), 'the finding does not name infrastructureExitCodes']],
  },
  {
    name: 'a registry entry permitting PATH',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => value.registry[0].environmentKeys.push('PATH')),
  },
  {
    name: 'a registry entry whose target hides a climb out of the project after a newline',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].target = 'a\n/../../../etc/x')),
  },
  {
    name: 'a registry entry reading an absolute artifact path back',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].artifacts.scaffold = '/etc/passwd')),
  },
  {
    name: 'a registry entry whose target climbs out of the project',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].target = '../outside/runner.js')),
  },
  ...UNPRINTABLE_PATH_CHARACTERS.flatMap(([label, character]) => [
    {
      name: `a registry target holding ${label}`,
      file: 'evaluation.json',
      rule: 'schema',
      plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].target = `test/fix${character}tures/gate.js`)),
    },
    {
      name: `a registry artifact path holding ${label}`,
      file: 'evaluation.json',
      rule: 'schema',
      plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].artifacts.scaffold = `tests/${character}x.ts`)),
    },
    {
      name: `a provisioned directory holding ${label}`,
      file: 'evaluation.json',
      rule: 'schema',
      plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.workspace.provision = [`node${character}_modules`])),
    },
    {
      name: `a targetArtifact holding ${label}`,
      file: 'mutations/M-001.mutation.json',
      rule: 'schema',
      plant: (folder) => editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = `skill/${character}x.md`)),
    },
  ]),
  {
    name: 'a registry target with a trailing slash',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].target = 'test/fixtures/evaluate/')),
  },
  {
    name: 'a registry target with an empty segment',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) =>
      editJson(folder, 'evaluation.json', (value) => (value.registry[0].target = 'test//fixtures/evaluate/red-phase-gate.js')),
  },
  {
    name: 'a registry artifact path with a trailing slash',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].artifacts.scaffold = 'tests/api/')),
  },
  {
    name: 'a targetArtifact with an empty segment',
    file: 'mutations/M-001.mutation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.targetArtifact = 'skill//x.md')),
  },
  {
    name: 'a provisioned directory with an empty segment',
    file: 'evaluation.json',
    rule: 'schema',
    plant: (folder) => editJson(folder, 'evaluation.json', (value) => (value.workspace.provision = ['vendor//cache'])),
  },
  {
    name: 'a defect signature whose one clause compares a call input with a stream',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) =>
      setSignature(folder, {
        op: 'all',
        operands: [
          {
            op: 'equality',
            operands: [{ pointer: '/interactions/observed/call-inputs/option/agent' }, { pointer: '/interactions/observed/stdout' }],
          },
          { op: 'not', operands: [exitEquals(0)] },
        ],
      }),
    expect: (output) => [
      [output.includes('could not be resolved'), 'a clause mixing call inputs with a stream did not fail closed'],
      [output.includes('together with other evidence'), 'the finding does not say a clause mixes call inputs with other evidence'],
    ],
  },
  {
    name: 'a defect signature whose stdout clause holds on a silent failure',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => {
      setInfrastructureCodes(folder, [3, 4, 5, 6]);
      setSignature(folder, {
        op: 'all',
        operands: [exitEquals(3), { op: 'existence', operands: [{ pointer: '/interactions/observed/stdout' }] }],
      });
    },
    expect: (output) => [[output.includes('exits 3, which'), 'the finding does not name the satisfying code 3']],
  },
  {
    name: 'a defect signature with nine call-input clauses',
    file: 'probes/P-002.probe.json',
    rule: 'infrastructure-exit-code',
    plant: (folder) => setSignature(folder, withOptionClauses(9, exitEquals(1))),
    expect: (output) => [
      [output.includes('could not be resolved'), 'nine call-input clauses did not fail closed'],
      [output.includes('too many clauses'), 'the finding does not say there are too many clauses'],
    ],
  },
];

/** Legitimate folders the Story 1.5 rules must leave alone: each exits 0. */
const CLEAN_CASES = [
  {
    name: 'a gameability probe with its naive oracle, its degenerate response and its arm',
    plant: (folder) => plantGameability(folder),
  },
  {
    name: 'a rubric with its judge and the judge model',
    plant: (folder) => plantRubric(folder),
  },
  {
    name: 'a historical probe with a natural defect, its arm and a fix commit named by any revision',
    plant: (folder) => {
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.qualification = { route: 'historical', fixCommit: 'a1b2c3d' };
        value.defects[0].source = 'natural';
      });
      editJson(folder, 'evaluation.json', (value) => (value.arms = ['clean', 'historical']));
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
    },
  },
  {
    name: 'two entries sharing an interface with different executables',
    plant: (folder) =>
      editJson(folder, 'evaluation.json', (value) => value.registry.push({ ...value.registry[0], executable: 'tea-atdd-report' })),
  },
  {
    name: 'a signature whose call-input clause sits beside an exit code only the defect produces',
    plant: (folder) =>
      setSignature(folder, {
        op: 'all',
        operands: [
          { op: 'equality', operands: [{ pointer: '/interactions/observed/call-inputs/option/agent' }, { literal: 'claude' }] },
          exitEquals(1),
        ],
      }),
  },
  {
    name: 'a signature that needs the exit code and output only the defect produces',
    plant: (folder) => {
      setInfrastructureCodes(folder, [3, 4, 5, 6]);
      setSignature(folder, {
        op: 'all',
        operands: [
          exitEquals(3),
          { op: 'equality', operands: [{ pointer: '/interactions/observed/stdout' }, { literal: 'active tests found' }] },
        ],
      });
    },
  },
  {
    name: 'a signature with two call-input clauses beside an exit code only the defect produces',
    plant: (folder) => setSignature(folder, withOptionClauses(2, exitEquals(1))),
  },
  {
    name: 'a signature with eight call-input clauses, the most the rule enumerates',
    plant: (folder) => {
      setInfrastructureCodes(folder, [3, 4, 5, 6]);
      setSignature(folder, withOptionClauses(8, exitEquals(1)));
    },
  },
  {
    name: 'a manifestation witness on an api interface, which no command registry entry serves',
    plant: (folder) => {
      const example = JSON.parse(
        fs.readFileSync(
          path.join(
            path.dirname(path.dirname(engineSchemaPath('probe.schema.json'))),
            'corpus',
            'dev',
            'compile-seal-example',
            'contract.json',
          ),
          'utf8',
        ),
      );
      const api = structuredClone(example.permittedInterfaces.find((candidate) => candidate.logicalId === 'thing-api'));
      api.operations = [api.operations[0]];
      editJson(folder, 'contract.json', (value) => value.permittedInterfaces.push(api));
      editJson(folder, 'probes/P-002.probe.json', (value) => {
        value.defects[0].manifestationWitness = {
          legId: 'manifest-api',
          interfaceId: api.logicalId,
          operationId: api.operations[0].operationId,
          inputs: { body: { kind: 'json', value: { name: 'alpha' } }, header: {}, path: {}, query: {} },
          relation: {
            op: 'not',
            operands: [{ op: 'equality', operands: [{ pointer: '/interactions/manifest-api/response-status' }, { literal: 201 }] }],
          },
        };
      });
    },
  },
];

async function runCleanCases() {
  for (const testCase of CLEAN_CASES) {
    const folder = copyValid();
    testCase.plant(folder);
    await writeCorpusIndex(folder);
    const result = runCli(['check', '--evaluation', folder]);
    check(result.status === 0, `${testCase.name}: check exited ${result.status}; expected 0\n${result.output}`);
  }
}

async function runCases(cases) {
  for (const testCase of cases) {
    const folder = copyValid();
    testCase.plant(folder);
    if (testCase.redigest !== false) await writeCorpusIndex(folder);
    const result = runCli(['check', '--evaluation', folder]);
    const label = `${testCase.name}: `;
    check(result.status === 10, `${label}check exited ${result.status}; expected 10\n${result.output}`);
    check(
      result.stdout.includes(`${testCase.file}: [${testCase.rule}]`),
      `${label}no finding names ${testCase.file} and rule ${testCase.rule}\n${result.output}`,
    );
    for (const [ok, message] of testCase.expect?.(result.output) ?? []) check(ok, `${label}${message}\n${result.output}`);
    if (testCase.digestExit !== undefined) {
      const digest = runCli(['digest', '--evaluation', folder]);
      check(
        digest.status === testCase.digestExit,
        `${label}digest exited ${digest.status}; expected ${testCase.digestExit}\n${digest.output}`,
      );
      const names = testCase.digestNames ?? `${testCase.file}: [${testCase.rule}]`;
      check(digest.stdout.includes(names), `${label}digest did not print ${names}\n${digest.output}`);
    }
  }
}

async function checkDefectCases() {
  await runCases(DEFECT_CASES);
  const covered = new Set(DEFECT_CASES.map((testCase) => testCase.rule));
  for (const rule of STORY_RULES) check(covered.has(rule), `no defect case covers the story's ${rule} rule`);
  await runCases(HARDENING_CASES);
  await runCleanCases();

  // Two defects in one copy: both are listed, not only the first.
  const folder = copyValid();
  editJson(folder, 'mutations/M-001.mutation.json', (value) => (value.operator.kind = 'regex-replace'));
  editJson(folder, 'contract.json', (value) => (value.permittedInterfaces[0].kind = 'web'));
  await writeCorpusIndex(folder);
  const both = runCli(['check', '--evaluation', folder]);
  check(both.status === 10, `two planted defects exited ${both.status}; expected 10`);
  check(
    both.stdout.includes('[mutation-operator]') && both.stdout.includes('[web-interface]'),
    `two planted defects did not both appear in the findings\n${both.output}`,
  );
}

/** A symbolic link under an indexed root is an authoring finding for both subcommands, never a crash. */
function checkSymlinkRefused() {
  const folder = copyValid();
  fs.symlinkSync(path.join(folder, 'corpus', 'reservations', 'docs', 'story.md'), path.join(folder, 'corpus', 'linked.md'));
  for (const subcommand of ['check', 'digest']) {
    const result = runCli([subcommand, '--evaluation', folder]);
    check(result.status === 10, `${subcommand} over a symbolic link in corpus/ exited ${result.status}; expected 10\n${result.output}`);
    check(result.stdout.includes('corpus/linked.md: [corpus-file]'), `${subcommand} did not name the symbolic link\n${result.output}`);
  }
}

/**
 * A file name holding a newline cannot print a finding line of its own: the
 * name is quoted and escaped, and every line either subcommand prints is a
 * finding naming the file or the summary.
 */
function checkForgedFindingLine() {
  const folder = copyValid();
  const forged = 'x\nforged.md: [schema] forged';
  fs.symlinkSync(path.join(folder, 'corpus', 'reservations', 'docs', 'story.md'), path.join(folder, 'corpus', forged));
  for (const subcommand of ['check', 'digest']) {
    const result = runCli([subcommand, '--evaluation', folder]);
    check(result.status === 10, `${subcommand} over a file name holding a newline exited ${result.status}; expected 10\n${result.output}`);
    const lines = result.stdout.split('\n').filter((line) => line.length > 0);
    check(!lines.some((line) => line.startsWith('forged.md')), `${subcommand} printed a line the file name forged\n${result.stdout}`);
    check(
      lines.some((line) => line.startsWith(`${JSON.stringify(`corpus/${forged}`)}: [corpus-file]`)),
      `${subcommand} did not print the file name quoted and escaped\n${result.stdout}`,
    );
  }
}

// ---------------------------------------------------------------------------
// digest

async function checkDigestUnit() {
  const folder = tempDir('index');
  const write = (relative, text) => {
    fs.mkdirSync(path.dirname(path.join(folder, relative)), { recursive: true });
    fs.writeFileSync(path.join(folder, relative), text);
  };
  // Written out of order, with files outside the three indexed roots beside them.
  write('probes/P-010.probe.json', '{}\n');
  write('corpus/z.txt', 'z');
  write('corpus/b/a.txt', 'nested');
  write('mutations/M-001.mutation.json', '{"m":1}\n');
  write('corpus/a.txt', 'a');
  write('evaluation.json', '{}');
  write('baseline/qualification/x.json', '{}');
  write('runs/r.json', '{}');
  const index = await buildCorpusIndex(folder);
  const expected = ['corpus/a.txt', 'corpus/b/a.txt', 'corpus/z.txt', 'mutations/M-001.mutation.json', 'probes/P-010.probe.json'];
  check(
    JSON.stringify(index.map((entry) => entry.path)) === JSON.stringify(expected),
    `buildCorpusIndex listed ${JSON.stringify(index.map((entry) => entry.path))}; expected ${JSON.stringify(expected)}`,
  );
  for (const entry of index) {
    const bytes = fs.readFileSync(path.join(folder, entry.path));
    check(entry.sha256 === sha256Hex(bytes), `buildCorpusIndex recorded the wrong sha256 for ${entry.path}`);
    check(/^[0-9a-f]{64}$/.test(entry.sha256), `buildCorpusIndex recorded a sha256 that is not 64 lowercase hex for ${entry.path}`);
    check(JSON.stringify(Object.keys(entry)) === '["path","sha256"]', `an index entry carries keys other than path and sha256`);
  }
}

async function checkDigestIntegration() {
  const engine = await loadEngine();
  const folder = copyValid();
  fs.rmSync(path.join(folder, 'corpus-index.json'));
  const first = runCli(['digest', '--evaluation', folder]);
  check(first.status === 0, `digest exited ${first.status}; expected 0\n${first.output}`);
  const written = fs.readFileSync(path.join(folder, 'corpus-index.json'), 'utf8');
  const index = JSON.parse(written);
  check(written === engine.serializeArtifact(index, 'corpus-index.json'), 'digest did not write the index through serializeArtifact');
  const expectedDigest = engine.digestArtifact(index, 'corpus-index.json');
  check(
    first.stdout.trim() === expectedDigest,
    `digest printed ${first.stdout.trim()}; digestArtifact over the index is ${expectedDigest}`,
  );
  const paths = index.map((entry) => entry.path);
  check(JSON.stringify(paths) === JSON.stringify([...paths].sort()), 'the written index is not sorted by path');
  check(
    paths.every((entry) => /^(corpus|probes|mutations)\//.test(entry)) && paths.some((entry) => entry.startsWith('corpus/')),
    `the written index does not cover exactly corpus/, probes/ and mutations/: ${JSON.stringify(paths)}`,
  );

  const clean = runCli(['check', '--evaluation', folder]);
  check(clean.status === 0, `check after digest exited ${clean.status}; expected 0\n${clean.output}`);

  // A corpus/ byte change moves the digest; a digest over probes alone would not.
  fs.appendFileSync(path.join(folder, 'corpus', 'reservations', 'src', 'reservations.js'), '\n');
  const second = runCli(['digest', '--evaluation', folder]);
  check(second.status === 0, `the second digest exited ${second.status}; expected 0`);
  check(second.stdout.trim() !== first.stdout.trim(), 'corpusDigest did not move when a corpus/ byte changed');

  // The committed fixture index is current: formatting aside, it digests to what digest computes.
  const fixtureIndex = JSON.parse(fs.readFileSync(path.join(VALID, 'corpus-index.json'), 'utf8'));
  check(engine.digestArtifact(fixtureIndex, 'corpus-index.json') === expectedDigest, 'the committed fixture corpus-index.json is stale');
}

function checkEngineCliPath() {
  const shim = path.join(os.tmpdir(), 'tea-evaluate-engine-shim.js');
  check(engineCliPath({ [ENGINE_CLI_ENV]: shim }) === shim, `${ENGINE_CLI_ENV} does not substitute the engine CLI path`);
  const resolved = engineCliPath({});
  check(fs.existsSync(resolved), `engineCliPath resolved ${resolved}, which does not exist`);
  const version = spawnSync(process.execPath, [resolved, '--version'], { encoding: 'utf8' });
  check(version.status === 0, `the resolved engine CLI does not run (exit ${version.status})`);
}

// ---------------------------------------------------------------------------
// Packed install

function npm(args, cwd) {
  const result = spawnSync('npm', args, { cwd, encoding: 'utf8', timeout: 600_000, env: process.env });
  if (result.error) throw result.error;
  return result;
}

/**
 * npm's own registry fetch failures. The packed install resolves TeA's
 * production dependencies from the registry, so an outage fails it for a reason
 * unrelated to TeA; naming it apart keeps it from ever reading as the
 * missing-module failure this case exists to catch.
 */
const REGISTRY_FAILURE = /\b(?:code )?(ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|E5\d\d)\b/;

/** The registry failure code in npm's output, or null when the failure is something else. */
function registryFailure(output) {
  return REGISTRY_FAILURE.exec(output)?.[1] ?? null;
}

function checkRegistryClassification() {
  const cases = [
    ['npm error code ENOTFOUND\nnpm error network request to https://registry.npmjs.org/ajv failed', 'ENOTFOUND'],
    ['npm error code ETIMEDOUT', 'ETIMEDOUT'],
    ['npm error code ECONNRESET', 'ECONNRESET'],
    ['npm error code E503\nnpm error 503 Service Unavailable - GET https://registry.npmjs.org/ajv', 'E503'],
    ["Error: Cannot find module 'ajv/dist/2020'", null],
    ['npm error code ERESOLVE', null],
  ];
  for (const [output, expected] of cases) {
    check(
      registryFailure(output) === expected,
      `registryFailure read ${JSON.stringify(output)} as ${registryFailure(output)}; expected ${expected}`,
    );
  }
}

function describeNpmFailure(step, result) {
  const output = `${result.stdout}${result.stderr}`;
  const code = registryFailure(output);
  return code === null
    ? `${step} exited ${result.status}\n${output}`
    : `registry unreachable (${code}) during ${step}: this is an npm registry or network failure, not a TeA packaging defect\n${output}`;
}

function checkPackedInstall() {
  const packDirectory = tempDir('pack');
  const pack = npm(['pack', '--ignore-scripts', '--silent', '--pack-destination', packDirectory], PROJECT_ROOT);
  check(pack.status === 0, describeNpmFailure('npm pack', pack));
  if (pack.status !== 0) return;
  const tarball = path.join(packDirectory, pack.stdout.trim().split('\n').pop());

  const project = tempDir('install');
  fs.writeFileSync(
    path.join(project, 'package.json'),
    `${JSON.stringify({ name: 'tea-evaluate-packed-install', private: true }, null, 2)}\n`,
  );
  const install = npm(['install', '--omit=dev', '--prefer-offline', '--no-audit', '--no-fund', tarball], project);
  check(install.status === 0, describeNpmFailure('installing the packed tarball', install));
  if (install.status !== 0) return;

  // The optional peer is not installed by npm; the adopter installs it. Here it
  // is the repository's own engine directory, linked beside the installed TeA.
  const engineLink = path.join(project, 'node_modules', 'eval-quality');
  check(!fs.existsSync(engineLink), 'npm installed the optional eval-quality peer; peerDependenciesMeta should keep it out');
  fs.rmSync(engineLink, { recursive: true, force: true });
  fs.symlinkSync(path.join(PROJECT_ROOT, 'node_modules', 'eval-quality'), engineLink, 'dir');

  const bin = path.join(project, 'node_modules', '.bin', 'tea-evaluate');
  check(fs.existsSync(bin), 'the packed install registers no tea-evaluate bin');
  const run = spawnSync(bin, ['check', '--evaluation', VALID], { cwd: project, encoding: 'utf8' });
  check(
    run.status === 0,
    `tea-evaluate check from the packed install exited ${run.status}; expected 0\n${run.stdout}${run.stderr}${run.error ?? ''}`,
  );

  // The generic skill runner ships as a bin and runs from the tarball over the
  // repository's stub agent (Story 1.6).
  const runnerBin = path.join(project, 'node_modules', '.bin', 'tea-skill-runner');
  check(fs.existsSync(runnerBin), 'the packed install registers no tea-skill-runner bin');
  const stub = spawnSync(
    runnerBin,
    [
      '--skill-root',
      'test/fixtures/evaluate/stub-agent/skill',
      '--agent',
      'custom',
      '--agent-cmd',
      'test/fixtures/evaluate/stub-agent/agent.js',
    ],
    { cwd: PROJECT_ROOT, input: 'Say alpha.', encoding: 'utf8' },
  );
  check(
    stub.status === 0 && stub.stdout.includes('skill: stub-skill'),
    `tea-skill-runner from the packed install exited ${stub.status}; expected 0 naming the stub skill\n${stub.stdout}${stub.stderr}${stub.error ?? ''}`,
  );

  // The runtime modules no subcommand loads yet still load from the tarball,
  // with their dependencies: a registry builds a policy, a record builder
  // stamps its version, and a digest runs.
  const installed = path.join(project, 'node_modules', TEA_MANIFEST.name, 'cli', 'lib', 'evaluate');
  const script = [
    `const registry = require(${JSON.stringify(path.join(installed, 'registry.js'))});`,
    `const records = require(${JSON.stringify(path.join(installed, 'records.js'))});`,
    `const digest = require(${JSON.stringify(path.join(installed, 'digest.js'))});`,
    `const probe = require(${JSON.stringify(path.join(installed, 'bounded-probe.js'))});`,
    `const formats = require(${JSON.stringify(path.join(installed, 'formats.js'))});`,
    `const entries = require(${JSON.stringify(path.join(VALID, 'evaluation.json'))}).registry;`,
    'const policy = registry.createRegistry(entries, { root: process.cwd() }).commandTargetPolicy({ cwd: process.cwd() });',
    'if (policy.authorizations.length !== entries.length) process.exit(3);',
    'if (!Number.isInteger(records.sealedRunRecord({}).schemaVersion)) process.exit(4);',
    "if (!/^sha256:/.test(digest.digest('x')) || typeof probe.boundedProbe !== 'function') process.exit(5);",
    "if (!formats.isDateTime('2026-09-23T00:00:00Z')) process.exit(6);",
  ].join('\n');
  const modules = spawnSync(process.execPath, ['-e', script], { cwd: project, encoding: 'utf8' });
  check(modules.status === 0, `the runtime modules do not load from the packed install (exit ${modules.status})\n${modules.stderr}`);
}

async function main() {
  try {
    await checkValidFixture();
    checkRegistry();
    checkEngineAbsent();
    checkUsage();
    await checkDefectCases();
    checkSymlinkRefused();
    checkForgedFindingLine();
    await checkRuntimeUnits();
    await checkDigestUnit();
    await checkDigestIntegration();
    checkEngineCliPath();
    checkRegistryClassification();
    checkPackedInstall();
  } finally {
    scratch.removeAll();
  }

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} tea-evaluate check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} tea-evaluate check(s) passed`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
