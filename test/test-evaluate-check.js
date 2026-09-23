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
 *   every module the runtime needs ships in TeA's `dependencies`.
 *
 * Story 1.5 adds the registry: the fixture's `evaluation.json` registry builds a
 * `CommandTargetPolicy` that eval-quality's own `CommandTargetPolicy` schema
 * accepts, a registry entry the runtime's `RegistryEntry` schema refuses is
 * refused by the builder, and a defect signature one of an entry's
 * `infrastructureExitCodes` could satisfy exits 10 (AD-7).
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

const Ajv = AjvModule.default ?? AjvModule;

const PROJECT_ROOT = path.join(__dirname, '..');
const CLI = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const VALID = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'valid');
const TEA_MANIFEST = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;
const scratch = [];

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function tempDir(label) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `tea-evaluate-${label}-`));
  scratch.push(directory);
  return directory;
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
 * Problems eval-quality's own `CommandTargetPolicy` schema finds in `policy`,
 * or an empty list when it accepts it.
 *
 * The engine publishes no JSON Schema for a command target policy and exports
 * no parser for one ("nothing in this package parses this policy"), so the Zod
 * schema is read from the module that declares it,
 * `dist/core/schemas/probe-policy.js`. The package's `exports` map does not
 * name that module, and the `dependency-direction` gate admits no computed
 * import and no relative path out of the scan roots, so a child Node process
 * imports it by file URL and parses the policy it reads on stdin. A move
 * upstream fails the import by name, and the case is then re-pointed.
 */
function commandTargetPolicyProblems(policy) {
  const engineRoot = path.dirname(path.dirname(engineSchemaPath('probe.schema.json')));
  const declaration = path.join(engineRoot, 'dist', 'core', 'schemas', 'probe-policy.js');
  const script = [
    "import { readFileSync } from 'node:fs';",
    "import { pathToFileURL } from 'node:url';",
    'const { CommandTargetPolicy } = await import(pathToFileURL(process.argv[1]).href);',
    "if (typeof CommandTargetPolicy?.safeParse !== 'function') throw new Error('no CommandTargetPolicy schema is exported');",
    "const parsed = CommandTargetPolicy.safeParse(JSON.parse(readFileSync(0, 'utf8')));",
    'process.stdout.write(JSON.stringify(parsed.success ? [] : parsed.error.issues));',
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, declaration], {
    input: JSON.stringify(policy),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `eval-quality's CommandTargetPolicy schema could not be read from ${declaration}; re-point this case\n${result.stderr}`,
    );
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
}

// ---------------------------------------------------------------------------
// The eleven authoring defects, one per temp copy

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
];

/** Legitimate folders the Story 1.5 rules must leave alone: each exits 0. */
const CLEAN_CASES = [
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

  // The runtime modules no subcommand loads yet still load from the tarball,
  // with their dependencies: a registry builds a policy, a record builder
  // stamps its version, and a digest runs.
  const installed = path.join(project, 'node_modules', TEA_MANIFEST.name, 'cli', 'lib', 'evaluate');
  const script = [
    `const registry = require(${JSON.stringify(path.join(installed, 'registry.js'))});`,
    `const records = require(${JSON.stringify(path.join(installed, 'records.js'))});`,
    `const digest = require(${JSON.stringify(path.join(installed, 'digest.js'))});`,
    `const probe = require(${JSON.stringify(path.join(installed, 'bounded-probe.js'))});`,
    `const entries = require(${JSON.stringify(path.join(VALID, 'evaluation.json'))}).registry;`,
    'const policy = registry.createRegistry(entries, { root: process.cwd() }).commandTargetPolicy({ cwd: process.cwd() });',
    'if (policy.authorizations.length !== entries.length) process.exit(3);',
    'if (!Number.isInteger(records.sealedRunRecord({}).schemaVersion)) process.exit(4);',
    "if (!/^sha256:/.test(digest.digest('x')) || typeof probe.boundedProbe !== 'function') process.exit(5);",
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
    await checkDigestUnit();
    await checkDigestIntegration();
    checkEngineCliPath();
    checkRegistryClassification();
    checkPackedInstall();
  } finally {
    for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true });
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
