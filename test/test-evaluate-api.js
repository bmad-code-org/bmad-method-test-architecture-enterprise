/**
 * `tea-evaluate` over an HTTP service through the evaluation's own HTTP port,
 * end to end over the real installed eval-quality (Story 1.11, AD-1, AD-4,
 * AD-7, AD-8, AD-21).
 *
 * The port is the Evaluate skill's template,
 * `src/workflows/testarch/bmad-testarch-evaluate/assets/http-probe-port.mjs`,
 * rendered unchanged into the fixture's `adapter/` beside its conformance
 * file. Every case that runs `tea-evaluate` copies `test/fixtures/evaluate-api/`
 * (the grader, a loopback HTTP service whose `GET /grade` accepts an answer
 * under `mode: strict` in `rules/policy.txt` and rejects it under `mode:
 * lenient`, the mutation M-001 plants) into a temp directory outside git, so
 * its `copy` workspace (AD-8) is what every leg and trial runs in, and links
 * the copy's evaluation folder `node_modules` to eval-quality and to this
 * package, standing in for the folder's own install (AD-20). `GRADER_LOG`
 * makes the service log each start and request.
 *
 * - The templates: the fixture's adapter is the templates byte for byte; the
 *   port's evaluator defaults, in the factory's parsed parameter list, to the
 *   `evaluateTarget` it imports from eval-quality, and a counting evaluator
 *   sees one call per request and one per redirect hop; the port holds no
 *   address classification (no private-range literal, bare, prefixed or
 *   regex-escaped, no CIDR arithmetic or octet radix), the grep catching each
 *   spelling it was written against, and the conformance file's only range
 *   literals are its four denied-class samples, each of the class
 *   eval-quality's own `classifyAddress` gives it; the conformance file passes
 *   every one of eval-quality's environment-probe outcomes against the stub it
 *   starts, and ends once its own `finally` closes a stub the suite left open.
 * - The pipeline: `check`, `preflight`, `run` and `score` over the fixture.
 *   Every leg and trial is an `api` observation, the registry's auth header
 *   reaches the service, the records carry the query and the answer's status,
 *   headers and body, the service's secret and token reach no file or output,
 *   every service started in its own workspace and ended with its call, and
 *   the clean arm resolves `passed-clean-control` and the mutated arm
 *   `caught`.
 * - Denials and faults: an address the entry does not list is denied
 *   `address-not-authorized` at the qualification, a leg and a trial, with no
 *   service started; a service that cannot start and one that hangs stop the
 *   run with exit 12, the cause scrubbed and every process ended; a service
 *   that accepts every answer exits 11; a folder with no port, or one whose
 *   port does not hand itself to TeA's host, exits 10; a port that logs on its
 *   standard output still serves, since the protocol has file descriptor 3 to
 *   itself; an answer eval-quality's `ProbeObservation` parser does not read
 *   stops the qualification with `port-contract-violation` (exit 12).
 * - A sealed-brief agent through the bridge: a declared and allowed request is
 *   recorded `evaluator-chosen` with the operation its method and path match,
 *   an undeclared one runs unrecorded, an unlisted method is denied before any
 *   service starts, and a bridge on an address the entry does not list is
 *   denied `address-not-authorized` with no request sent.
 * - Gameability: a probe whose degenerate response answers the HTTP step
 *   qualifies and scores `caught` with no service started, and a gameability
 *   router denies an unlisted method and answers an allowed request.
 * - `check`: a command entry for the api interface, two HTTP entries for one
 *   interface, an entry naming both a port and a server, a host a URL spells
 *   otherwise (the entry's own or a deployment origin's), an auth header over
 *   plain http to an address that is not loopback (the entry's or a
 *   deployment's), a folder with no port, and a degenerate response of the
 *   wrong kind.
 * - eval-quality's policy parser (Story 1.36): `check` reads each HTTP entry
 *   (a started server's at a placeholder port) and each `deployments` origin
 *   as an authorization of its own through `parseProbeTargetPolicy`, and an
 *   entry it refuses is one `registry` finding carrying the parser's reason
 *   and pointers; the runtime builds each call's policy through the same
 *   parser before any service starts, so a registry built without `check`
 *   over refused fields stops the call (a started server's, a deployed
 *   entry's and the gameability arm's) with the parser's fault, no service
 *   started and no port-file directory left, and a trial over it with exit
 *   12; and `ApiRegistryEntry` and its
 *   `deployments` items carry the authorization fields at their JSON types
 *   alone, read from the schema, with the rules that are TeA's own kept.
 * - The bridge to a Bubblewrap target's server (Story 1.63), over the real status
 *   shim with no Bubblewrap: a call through the port is answered through the
 *   runtime's forwarder, a server that reports a port the host holds is reached on
 *   the port the runtime was given, a chosen port the forwarder cannot take is
 *   refused, a server that has not bound is not ready and one that never binds
 *   or exits before it binds ends the call with nothing listening, and an address
 *   or temp directory no bridge can carry is refused; the confined pipeline runs
 *   once for each handoff (a server that reports its port and one that is told
 *   it), which on Linux is the bridge end to end.
 * - Units: the registry's HTTP policy, inventory, ceilings, secrets and
 *   targets; the arm's `api` record; the scrub of an HTTP answer and of a
 *   denial naming a lowercased secret; the scrub of a secret echoed in every
 *   letter case (Story 1.66: lower, upper, capitalized and alternating, in
 *   each byte format a serializer writes, in the observation, the keys, a
 *   fault's message and cause and a cut text, for a secret with pattern
 *   metacharacters, a letter whose case mapping changes its length, a dotted
 *   capital I, a lone surrogate and a letter outside the BMP, with a value of
 *   seven characters left alone); a multi-byte answer past 64 KiB read
 *   whole; a gameability redirect to another spelling of the entry's host.
 *
 * Usage: node test/test-evaluate-api.js [--only=<text in a case's name>]
 */

'use strict';

const crypto = require('node:crypto');
const acorn = require('acorn');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { pathToFileURL } = require('node:url');
const { spawn, spawnSync } = require('node:child_process');

const { ENGINE_CLI_ENV, loadAdapters, loadEngine } = require('../cli/lib/evaluate/engine');
const { serveHttpProbePort } = require('../cli/lib/evaluate/http-port-host');
const { ArmError, hostEnvironmentPort, runArm } = require('../cli/lib/evaluate/arm');
const { syntheticPort } = require('../cli/lib/evaluate/gameability');
const {
  HTTP_PORT_MODULE,
  authorizationOf,
  bridgeDirectoryBase,
  makeBridgeDirectory,
  callServer,
  createApiPort,
  degenerateApiPort,
  portConfiguration,
  probeHttpPort,
} = require('../cli/lib/evaluate/http-target');
const relayModule = require('../cli/lib/evaluate/confinement-relay');
const shimModule = require('../cli/lib/evaluate/confinement-status.cjs');
const { createRegistry, registryProblems } = require('../cli/lib/evaluate/registry');
const { runTrial } = require('../cli/lib/evaluate/run');
const { requestKey } = require('../cli/lib/evaluate/workspace');
const { bridgeRouter } = require('../cli/lib/evaluate/sealed-brief-agent');
const { expectedOutcomeCount } = require('./lib/conformance-counts');
const { scratchDirectories } = require('./lib/scratch-directories');

const PROJECT_ROOT = path.join(__dirname, '..');
const EVALUATE = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const REFERENCE = path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md');
const FIXTURE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate-api');
const ASSETS = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-evaluate', 'assets');
const PORT_TEMPLATE = path.join(ASSETS, 'http-probe-port.mjs');
const CONFORMANCE_TEMPLATE = path.join(ASSETS, 'http-probe-port.conformance.mjs');
const STUB_AGENT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'evaluators', 'stub-api-agent.js');
const EVALUATION = path.join('evals', 'grader');
const TRIALS = 3;
const SECRET = 'grader-secret-value-0123';
const TOKEN = 'grader-token-value-4567';
/** The registry entry's ceiling for the hanging-service case, short so a hung call is torn down quickly. */
const HANG_CEILING_MS = 3000;

const BASE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== ENGINE_CLI_ENV && !name.startsWith('GRADER_') && !name.startsWith('GIT_')),
);
const SPAWN_TIMEOUT_MS = 180_000;

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;
const scratch = scratchDirectories('tea-evaluate-api');
/** Each project's private temp directory, which every run and score must leave empty. */
const runtimeTemps = [];

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** A file a run may not have written, parsed, or null, so a case reports what is missing and goes on. */
function readIfPresent(file) {
  return fs.existsSync(file) ? readJson(file) : null;
}

/** Every file under each path, recursively, with its text; a link is not followed, so the linked installs are left out. */
function filesUnder(...roots) {
  const files = [];
  const walk = (entry) => {
    if (!fs.existsSync(entry)) return;
    const stat = fs.lstatSync(entry);
    if (stat.isDirectory()) for (const name of fs.readdirSync(entry)) walk(path.join(entry, name));
    else if (stat.isFile()) files.push({ where: entry, text: fs.readFileSync(entry, 'latin1') });
  };
  for (const root of roots) walk(root);
  return files;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function editJson(file, edit) {
  const value = readJson(file);
  edit(value);
  writeJson(file, value);
}

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function evaluate(args, env = {}, { timeoutMs = SPAWN_TIMEOUT_MS } = {}) {
  const result = spawnSync(process.execPath, [EVALUATE, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...BASE_ENV, ...env },
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  });
  if (result.error) throw new Error(`tea-evaluate ${args.join(' ')} did not finish: ${result.error.message}`);
  return { status: result.status, signal: result.signal, stderr: result.stderr, output: `${result.stdout}${result.stderr}` };
}

/**
 * A copy of the fixture outside git, its evaluation folder's `node_modules`
 * linked to eval-quality and this package (the folder's own install, AD-20),
 * `edit` applied and the corpus index digested again, with a private temp
 * directory and the service's log. The log is a file outside the workspace,
 * which a confined service cannot write, so a logged project opts out of
 * file-system confinement (Story 1.31); one made with `log: false` runs
 * confined.
 */
function makeProject(label, { edit = () => {}, log: logged = true } = {}) {
  const directory = scratch.make(label);
  const root = path.join(directory, 'project');
  fs.cpSync(FIXTURE, root, { recursive: true, filter: (from) => !['runs', 'node_modules'].includes(path.basename(from)) });
  const folder = path.join(root, EVALUATION);
  fs.mkdirSync(path.join(folder, 'node_modules'));
  fs.symlinkSync(path.join(PROJECT_ROOT, 'node_modules', 'eval-quality'), path.join(folder, 'node_modules', 'eval-quality'));
  fs.symlinkSync(PROJECT_ROOT, path.join(folder, 'node_modules', 'bmad-method-test-architecture-enterprise'));
  const log = path.join(directory, 'grader.jsonl');
  const temp = scratch.make(`${label}-temp`);
  runtimeTemps.push({ label, directory: temp });
  const project = {
    root,
    folder,
    log,
    directory,
    env: { TMPDIR: temp, TMP: temp, TEMP: temp, ...(logged ? { GRADER_LOG: log } : {}), GRADER_TOKEN: TOKEN },
  };
  if (logged) {
    const manifest = path.join(folder, 'evaluation.json');
    fs.writeFileSync(manifest, `${JSON.stringify({ ...JSON.parse(fs.readFileSync(manifest, 'utf8')), confinement: false }, null, 2)}\n`);
  }
  edit(project);
  const digested = evaluate(['digest', '--evaluation', folder]);
  if (digested.status !== 0) throw new Error(`digest failed: ${digested.output}`);
  return project;
}

/** Every line the service logged. */
function sessions(project) {
  return fs.existsSync(project.log)
    ? fs
        .readFileSync(project.log, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
    : [];
}

/** Waits until `condition` holds or `ms` pass: a killed process is gone from the process table a moment after its kill. */
async function eventually(condition, ms = 3000) {
  const deadline = Date.now() + ms;
  while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  return condition();
}

/** Each process the service logged that is still running: an empty list once every service ended. */
function livingSessions(project) {
  return [...new Set(sessions(project).map((line) => line.pid))].filter((pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error.code !== 'ESRCH';
    }
  });
}

/** The newest run directory under `runs/`. */
function runDirectoryOf(folder) {
  const runs = path.join(folder, 'runs');
  const names = fs.existsSync(runs) ? fs.readdirSync(runs).filter((name) => name !== '.gitignore' && name !== '.workspace-journal') : [];
  return names.length === 0 ? null : path.join(runs, names.sort().at(-1));
}

/**
 * Fails a case whose run sealed no trial set, with the evidence the next
 * occurrence needs: the run's exit code and signal, its whole stderr, and every
 * file under its run directory, with each fault, `run.json` and evaluator
 * stderr quoted. The run directory and the stderr are also kept outside the
 * suite's scratch, which the suite removes as it ends, and the failure's first
 * line names where, so a capture that keeps only part of the output still
 * leads to the whole of it. By default the evidence also goes to stderr at
 * once.
 */
function checkSealed(what, ran, runDirectory, report = checkAtOnce) {
  if (runDirectory !== null && fs.existsSync(path.join(runDirectory, 'trial-sets.json'))) return true;
  const kept = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tea-evaluate-api-evidence-'));
  fs.writeFileSync(path.join(kept, 'stderr.txt'), ran.stderr);
  if (runDirectory !== null) fs.cpSync(runDirectory, path.join(kept, 'run'), { recursive: true });
  const files = runDirectory === null ? [] : filesUnder(runDirectory);
  const listing = files.map(({ where, text }) => {
    const name = path.relative(runDirectory, where);
    const quoted = /(?:^|\/)(?:fault|run)\.json$|^evaluator\/.+\.stderr$/.test(name) && text.length > 0 ? `\n${text}` : '';
    return `  ${name} (${text.length} bytes)${quoted}`;
  });
  const evidence = [
    `${what} sealed no trial set: exit code ${ran.status}, signal ${ran.signal ?? 'none'}; the run directory and stderr are kept in ${kept}`,
    `run directory: ${runDirectory ?? 'none under runs/'}`,
    ...(listing.length === 0 ? ['  (no files)'] : listing),
    'stderr:',
    ran.stderr.length === 0 ? '  (empty)' : ran.stderr,
  ].join('\n');
  report(false, evidence);
  return false;
}

/** `check`, with a failure's message also printed at once. */
function checkAtOnce(condition, message) {
  if (!condition) console.error(message);
  check(condition, message);
}

/** Scores the newest run and returns each probe's evidence artifact by probe, and what `score` printed. */
function scoreRun(project, what, expectedExit = 0) {
  const scored = evaluate(['score', '--evaluation', project.folder], project.env);
  check(scored.status === expectedExit, `${what}: score exited ${scored.status}; expected ${expectedExit}\n${scored.output}`);
  const scores = path.join(runDirectoryOf(project.folder) ?? '', 'scores');
  const latest = fs.existsSync(scores) ? fs.readdirSync(scores).sort().at(-1) : undefined;
  const evidence = {};
  if (latest === undefined) return { evidence, output: scored.output };
  for (const probeId of fs.readdirSync(path.join(scores, latest))) {
    const file = path.join(scores, latest, probeId, 'evidence-artifact.json');
    evidence[probeId] = fs.existsSync(file) ? readJson(file) : null;
  }
  return { evidence, output: scored.output };
}

/** The runtime's port processes still running for a project: its adapter file on a live command line. */
function livingPorts(project) {
  const listed = spawnSync('ps', ['-A', '-o', 'pid=,command='], { encoding: 'utf8' });
  const file = path.join(project.folder, HTTP_PORT_MODULE);
  return String(listed.stdout)
    .split('\n')
    .filter((line) => line.includes(file));
}

/** Each trial's vote for a probe equals `state`, over `TRIALS` trials. */
function checkVotes(what, evidence, probeId, state) {
  const votes = (evidence[probeId]?.reducedProbeOutcomes?.[0]?.trialVotes ?? []).map((vote) => vote.state);
  check(
    votes.length === TRIALS && votes.every((vote) => vote === state),
    `${what}: ${probeId}'s trial votes are ${JSON.stringify(votes)}; expected ${state} in each of ${TRIALS}`,
  );
}

/** The trial records of one probe's set, read from the run directory. */
function recordsOf(runDirectory, probeId) {
  const index = readJson(path.join(runDirectory, 'trial-sets.json'));
  const set = index.trialSets.find((candidate) => candidate.probeId === probeId);
  return set === undefined ? [] : set.records.map((relative) => readJson(path.join(runDirectory, relative)));
}

/** Runs `body` with the named environment values set in this process, restoring them after. */
async function withEnvironment(values, body) {
  const previous = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await body();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

// ---------------------------------------------------------------- the templates

/**
 * An IPv4 or IPv6 literal of a range eval-quality classifies as private, link-local or metadata, as the test design
 * lists them: a whole address, a prefix with or without its trailing dot (`192.168`, `172.16.`, `10.`), each dot
 * optionally escaped as a regular expression writes it (`/^10\./`), and an IPv6 prefix with or without its colon.
 */
const RANGE_LITERAL =
  /(?<![\w.\\])(?:10\\?\.(?:\d{1,3}\\?\.\d{1,3}\\?\.\d{1,3}|(?!\d))|172\\?\.(?:1[6-9]|2\d|3[01])|192\\?\.168|169\\?\.254|100\\?\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7]))(?!\d)|\b(?:fc00|fd00|fe80)\b/gi;
/**
 * CIDR notation, a prefix length read off one, or the arithmetic a range comparison needs: a mask, a shift, a hex
 * constant, or an octet's radix (256, 65536, 16777216, 4294967296) that a division or a remainder takes an address
 * apart with; and the other spellings a copied classifier takes: an octet compared with 168 or 254 or bounded by 16
 * and 31, a power of two, a range base written in decimal, an IPv6 prefix as a character class or a quoted prefix, the
 * IPv4-mapped prefix, a table of base and prefix-length pairs, and an address prefix assembled from quoted pieces.
 */
const CIDR_ARITHMETIC = [
  /\b\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}\b/,
  /[0-9a-f:]+::?\/\d{1,3}\b/i,
  /\\\/\(?\\d/,
  /['"`]\/\d{1,3}['"`]/,
  /(?:&|\|)\s*0x[0-9a-f]+/i,
  /\b0x[0-9a-f]{2,}\b/i,
  /(?:<<|>>>?)\s*\d/,
  /\b(?:256|65_?536|16_?777_?216|4_?294_?967_?296)\b/,
  /(?:[=!]==?|[<>]=?)\s*(?:168|254)\b|\b(?:168|254)\s*(?:[=!]==?|[<>]=?)/,
  /[<>]=?\s*(?:1[56]|3[12])\b|\b(?:1[56]|3[12])\s*[<>]=?/,
  /\*\*\s*\d/,
  /\b\d(?:_?\d){8,}\b/,
  /\bfe?\[[\da-f-]+\]/i,
  /['"`](?:f[cd]|fe[89ab])[\da-f]{0,2}:?['"`]/i,
  /::ffff:/i,
  /\[\s*['"`]?\d{1,3}(?:\.\d{1,3}){0,3}['"`]?\s*,\s*\d{1,3}\s*\]/,
  /['"`]\.?\d{1,3}\.?['"`]\s*\+|\+\s*['"`]\.?\d{1,3}\.?['"`]/,
];
/** Ways a copied range check has been spelled that the grep must catch, each on its own. */
const RANGE_EVASIONS = [
  "address.startsWith('192.168')",
  "address.startsWith('169.254')",
  "address.startsWith('172.16')",
  "address.startsWith('10.')",
  'address.startsWith("100.64")',
  "host.toLowerCase().startsWith('fe80')",
  "host.startsWith('fc00')",
  String.raw`/^10\./.test(address)`,
  String.raw`/^192\.168\./.test(address)`,
  'Math.floor(n / 16777216) === 10',
  'Math.floor(n / 16_777_216) === 10',
  '(n % 65536) >> 8',
  'first === 10 && second / 256 === 0',
  '(value & 0xffff) === 0xa9fe',
  String.raw`const [base, bits] = cidr.split(/\/(\d+)$/);`,
  "const cidr = base + '/8';",
  'a === 10 || (a === 192 && b === 168)',
  'first === 169 && second === 254',
  'a === 172 && b >= 16 && b <= 31',
  'a === 172 && b > 15 && b < 32',
  'Math.floor(n / 2 ** 24) === 10',
  'n >= 3232235520 && n <= 3232301055',
  'n >= 167_772_160 && n < 184_549_376',
  '/^f[cd]/i.test(host)',
  '/^fe[89ab]/i.test(host)',
  "host.toLowerCase().startsWith('fd')",
  "host.startsWith('fe9')",
  "address.startsWith('::ffff:')",
  'const PRIVATE = [[10, 8], [172, 12], [192, 16]];',
  "const PRIVATE = [['10.0.0.0', 8]];",
  "address.startsWith('192' + '.168')",
  "address.startsWith(first + '.168')",
];

/** Whether the grep catches `text`: a range literal or any of the arithmetic. */
function grepCatches(text) {
  return new RegExp(RANGE_LITERAL.source, 'i').test(text) || CIDR_ARITHMETIC.some((pattern) => pattern.test(text));
}

/**
 * Whether the port template's factory takes `evaluateTarget` as an option whose default is the `evaluateTarget` it
 * imports from eval-quality, read from the parsed module (so no comment or string can stand in): the local name the
 * import binds, and the default in the destructured first parameter of the default-exported `createHttpProbePort`.
 */
function defaultsToImportedEvaluateTarget(source) {
  const program = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const imported = program.body
    .filter((node) => node.type === 'ImportDeclaration' && node.source.value === 'eval-quality')
    .flatMap((node) => node.specifiers)
    .find((specifier) => specifier.type === 'ImportSpecifier' && specifier.imported.name === 'evaluateTarget')?.local.name;
  const factory = program.body.find((node) => node.type === 'ExportDefaultDeclaration')?.declaration;
  if (imported === undefined || factory?.type !== 'FunctionDeclaration' || factory.id?.name !== 'createHttpProbePort') return false;
  const [options] = factory.params;
  const property =
    options?.type === 'ObjectPattern' ? options.properties.find((candidate) => candidate.key?.name === 'evaluateTarget') : undefined;
  return (
    property?.value?.type === 'AssignmentPattern' &&
    property.value.left.name === 'evaluateTarget' &&
    property.value.right.type === 'Identifier' &&
    property.value.right.name === imported
  );
}

async function checkTemplates() {
  for (const [template, name] of [
    [PORT_TEMPLATE, 'http-probe-port.mjs'],
    [CONFORMANCE_TEMPLATE, 'http-probe-port.conformance.mjs'],
  ]) {
    const rendered = path.join(FIXTURE, EVALUATION, 'adapter', name);
    check(
      fs.existsSync(rendered) && fs.readFileSync(rendered).equals(fs.readFileSync(template)),
      `the fixture's adapter/${name} is not the skill's template byte for byte, so the fixture proves another port`,
    );
  }

  const port = fs.readFileSync(PORT_TEMPLATE, 'utf8');
  // The evaluator is an injected option whose default is eval-quality's own evaluateTarget, imported under a name.
  check(
    defaultsToImportedEvaluateTarget(port),
    "the port template's evaluator does not default to the evaluateTarget it imports from eval-quality",
  );
  // The reading holds only the factory's own parameter list: a comment, or a default moved out of the list, fails it.
  const commentedOnly = port
    .replace(/, evaluateTarget = engineEvaluateTarget \}\)/, ' })')
    .replace('export default function', '// evaluateTarget = engineEvaluateTarget\nexport default function');
  const movedOut = port.replace(/, evaluateTarget = engineEvaluateTarget \}\)/, ' }, evaluateTarget = engineEvaluateTarget)');
  check(
    commentedOnly !== port &&
      movedOut !== port &&
      !defaultsToImportedEvaluateTarget(commentedOnly) &&
      !defaultsToImportedEvaluateTarget(movedOut),
    'the check that the evaluator defaults to the import reads a comment, or a default outside the options, as the default',
  );
  // The grep's own reach: every spelling of a copied range check it was written against is caught.
  const escaped = RANGE_EVASIONS.filter((text) => !grepCatches(text));
  check(escaped.length === 0, `the template grep misses a copied range check spelled ${JSON.stringify(escaped)}`);
  const portRanges = port.match(RANGE_LITERAL) ?? [];
  check(portRanges.length === 0, `the port template holds range literals of its own: ${JSON.stringify(portRanges)}`);
  for (const [template, text] of [
    ['the port template', port],
    ['the conformance template', fs.readFileSync(CONFORMANCE_TEMPLATE, 'utf8')],
  ]) {
    const arithmetic = CIDR_ARITHMETIC.filter((pattern) => pattern.test(text)).map(String);
    check(arithmetic.length === 0, `${template} carries address arithmetic: ${JSON.stringify(arithmetic)}`);
  }
  // The conformance file needs one sample address per denied class; each is data eval-quality classifies, never a rule.
  const conformance = fs.readFileSync(CONFORMANCE_TEMPLATE, 'utf8');
  const samples = [...conformance.matchAll(/(\w+): \{ interfaceId: '[\w-]+', host: '[\w.-]+', address: '([^']+)' \}/g)].map(
    ([, denied, address]) => ({ denied, address }),
  );
  const expectedClass = { loopback: 'loopback', private: 'private', linkLocal: 'link-local', metadata: 'metadata' };
  const { classifyAddress } = await loadEngine();
  check(
    samples.length === 4 && samples.every(({ denied, address }) => classifyAddress(address) === expectedClass[denied]),
    `the conformance template's denied-class samples are ${JSON.stringify(samples.map((sample) => ({ ...sample, class: classifyAddress(sample.address) })))}`,
  );
  // With the sample lines taken out, the conformance template holds no range literal, a prefix or an IPv6 one included.
  const unsampled = conformance
    .split('\n')
    .filter((line) => !/^\s*\w+: \{ interfaceId: '[\w-]+', host: '[\w.-]+', address: '[^']+' \},$/.test(line))
    .join('\n');
  const stray = unsampled.match(RANGE_LITERAL) ?? [];
  check(stray.length === 0, `the conformance template holds range literals outside its samples: ${JSON.stringify(stray)}`);
}

// ---------------------------------------------------------------- the port, in process

/** A text body past 64 KiB of two-, three- and four-byte characters, so the port's answer crosses a pipe's chunk inside one. */
const MULTIBYTE = 'aé€😀'.repeat(8000);

/**
 * A loopback service for the port's own units: `/echo` answers what it was sent, `/hop/<n>` redirects to `/hop/<n + 1>`
 * until 2, `/multibyte?pad=<n>` answers `MULTIBYTE` after `n` ASCII characters as text, and `/to-host?host=<name>`
 * redirects to `<name>` on its own port.
 */
async function unitService() {
  const received = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://unit');
    const chunks = [];
    request.on('data', (chunk) => {
      chunks.push(chunk);
    });
    request.on('end', () => {
      const bodyBytes = Buffer.concat(chunks);
      received.push({
        method: request.method,
        path: url.pathname,
        host: request.headers.host,
        authorization: request.headers.authorization,
        apiKey: request.headers['x-api-key'],
        contentType: request.headers['content-type'],
        contentLength: request.headers['content-length'],
        transferEncoding: request.headers['transfer-encoding'],
        bodyBase64: bodyBytes.toString('base64'),
      });
      const hop = /^\/hop\/(\d+)$/.exec(url.pathname);
      const port = server.address().port;
      /** Where each redirecting route sends the request. */
      const redirects = {
        '/elsewhere': [307, `http://localhost:${port}/echo`],
        '/to-unlisted-host': [302, `http://no-such-host.invalid:${port}/echo`],
        '/to-unresolvable': [302, `http://unresolvable.test:${port}/echo`],
        '/bad-location': [302, 'http://[::1'],
        '/raw-307': [307, '/raw'],
        '/raw-303': [303, '/raw'],
      };
      if (url.pathname === '/raw') {
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ base64: bodyBytes.toString('base64'), contentType: request.headers['content-type'] ?? null }));
        return;
      }
      if (url.pathname === '/multibyte') {
        const pad = 'a'.repeat(Number(url.searchParams.get('pad') ?? 0));
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(`${pad}${MULTIBYTE}`);
      } else if (url.pathname === '/to-host') {
        response.writeHead(302, { location: `http://${url.searchParams.get('host')}:${port}/echo` }).end();
      } else if (hop !== null) {
        const next = Number(hop[1]) + 1;
        response.writeHead(302, { location: next > 2 ? '/echo' : `/hop/${next}` }).end();
      } else if (Object.hasOwn(redirects, url.pathname)) {
        const [status, location] = redirects[url.pathname];
        response.writeHead(status, { location }).end();
      } else {
        response.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'a=1' }).end(
          JSON.stringify({
            method: request.method,
            query: url.search,
            body: bodyBytes.length === 0 ? null : JSON.parse(bodyBytes.toString('utf8')),
          }),
        );
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const close = () => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  };
  return { port, received, close };
}

async function checkPortUnits() {
  const { default: createHttpProbePort, nodeTransport } =
    await import('../src/workflows/testarch/bmad-testarch-evaluate/assets/http-probe-port.mjs');
  const engine = await loadEngine();
  const service = await unitService();
  try {
    const authorization = (host) => ({
      interfaceId: 'unit',
      scheme: 'http',
      host,
      port: service.port,
      addresses: ['127.0.0.1'],
      methods: ['GET', 'POST'],
      safeMethods: ['GET'],
      maxRedirects: 3,
      maxElapsedMs: 5000,
      maxRequestBytes: 64,
      maxResponseBytes: 65_536,
    });
    let decisions = 0;
    let sends = 0;
    const port = createHttpProbePort({
      policy: { authorizations: [authorization('127.0.0.1'), authorization('localhost')] },
      targets: { unit: { scheme: 'http', host: '127.0.0.1', port: service.port } },
      auth: { unit: { authorization: 'Bearer unit-token' } },
      transport: {
        resolve: async (host) => {
          if (host === 'localhost') return '127.0.0.1';
          if (host.endsWith('.invalid') || host === 'unresolvable.test') throw new Error(`no address for ${host}`);
          return nodeTransport.resolve(host);
        },
        send: (exchange, signal) => {
          sends += 1;
          return nodeTransport.send(exchange, signal);
        },
      },
      evaluateTarget: (policy, target) => {
        decisions += 1;
        return engine.evaluateTarget(policy, target);
      },
    });
    const request = (method, pathTemplate, extra = {}) => ({
      probeId: 'unit-call',
      interfaceId: 'unit',
      operationId: 'unit-operation',
      kind: 'api',
      method,
      pathTemplate,
      channels: { path: {}, query: {}, header: {}, body: { kind: 'absent' }, ...extra },
    });
    const counted = async (what, call) => {
      decisions = 0;
      sends = 0;
      service.received.length = 0;
      try {
        return { observation: await call(), decisions, sends };
      } catch (error) {
        return { error, decisions, sends };
      }
    };

    const plain = await counted('a request', () => port.probe(request('GET', '/echo', { query: { answer: 'a b' } })));
    check(
      plain.decisions === 1 &&
        plain.sends === 1 &&
        plain.observation?.status === 200 &&
        plain.observation.body.value.query === '?answer=a+b' &&
        !Object.hasOwn(plain.observation.headers, 'set-cookie') &&
        service.received[0]?.authorization === 'Bearer unit-token',
      `one request made ${plain.decisions} decision(s) and ${plain.sends} send(s): ${JSON.stringify(plain.observation ?? plain.error?.message)}`,
    );
    const hops = await counted('a redirect chain', () => port.probe(request('GET', '/hop/{n}', { path: { n: '0' } })));
    check(
      hops.decisions === 4 && hops.sends === 4 && hops.observation?.status === 200,
      `a request redirected three times made ${hops.decisions} decision(s) and ${hops.sends} send(s); expected 4 of each`,
    );
    const posted = await counted('a body', () => port.probe(request('POST', '/echo', { body: { kind: 'json', value: { answer: 7 } } })));
    check(
      posted.observation?.body?.value?.body?.answer === 7 && posted.decisions === 1,
      `a JSON body was answered ${JSON.stringify(posted.observation ?? posted.error?.message)}`,
    );
    const malformedBytes = Buffer.from('{"broken":');
    const rawBody = { kind: 'raw', base64: malformedBytes.toString('base64'), contentType: 'application/json; charset=utf-8' };
    const rawRequest = request('POST', '/raw', { body: rawBody });
    const raw = await counted('raw malformed JSON', () => port.probe(rawRequest));
    check(
      raw.observation?.status === 200 &&
        raw.observation.body.value.base64 === rawBody.base64 &&
        service.received[0]?.bodyBase64 === rawBody.base64 &&
        service.received[0]?.contentType === rawBody.contentType,
      `raw malformed JSON reached the target as ${JSON.stringify(service.received)}`,
    );
    const rawValid = await counted('raw valid JSON', () =>
      port.probe(
        request('POST', '/raw', {
          body: { kind: 'raw', base64: Buffer.from('{"ok":true}').toString('base64'), contentType: 'application/json' },
        }),
      ),
    );
    check(
      rawValid.observation?.status === 200 && service.received[0]?.bodyBase64 === Buffer.from('{"ok":true}').toString('base64'),
      'raw valid JSON changed before the target received it',
    );
    const binaryBytes = Buffer.from([0x00, 0x80, 0xff, 0x41]);
    const binaryBody = { kind: 'raw', base64: binaryBytes.toString('base64'), contentType: 'application/octet-stream' };
    const binaryRaw = await counted('binary raw body', () => port.probe(request('POST', '/raw', { body: binaryBody })));
    check(
      binaryRaw.observation?.status === 200 &&
        service.received[0]?.bodyBase64 === binaryBody.base64 &&
        service.received[0]?.contentType === binaryBody.contentType &&
        service.received[0]?.contentLength === String(binaryBytes.byteLength),
      `binary raw bytes changed on the wire: ${JSON.stringify(service.received)}`,
    );
    const emptyRawRequest = request('POST', '/raw', { body: { kind: 'raw', base64: '', contentType: 'application/json' } });
    const emptyRaw = await counted('empty raw body', () => port.probe(emptyRawRequest));
    check(
      emptyRaw.observation?.status === 200 &&
        service.received[0]?.bodyBase64 === '' &&
        service.received[0]?.contentType === 'application/json' &&
        service.received[0]?.transferEncoding === 'chunked' &&
        service.received[0]?.contentLength === undefined,
      `empty raw lost its zero-byte body, declared content type, or chunked framing: ${JSON.stringify(service.received)}`,
    );
    const absentRequest = request('POST', '/raw');
    const absent = await counted('absent body', () => port.probe(absentRequest));
    check(
      absent.observation?.status === 200 &&
        service.received[0]?.bodyBase64 === '' &&
        service.received[0]?.contentType === undefined &&
        service.received[0]?.transferEncoding === undefined &&
        service.received[0]?.contentLength === '0',
      `absent body acquired raw framing or a content type: ${JSON.stringify(service.received)}`,
    );
    check(
      new Set([
        requestKey(rawRequest),
        requestKey({
          ...rawRequest,
          channels: { ...rawRequest.channels, body: { ...rawBody, base64: Buffer.from('{"broken";').toString('base64') } },
        }),
        requestKey(emptyRawRequest),
        requestKey(absentRequest),
        requestKey(request('POST', '/raw', { body: { kind: 'json', value: { ok: true } } })),
      ]).size === 5,
      'raw byte changes, empty raw, JSON and absent must have distinct request identities',
    );
    const badBase64 = await counted('noncanonical base64', () =>
      port.probe(request('POST', '/raw', { body: { kind: 'raw', base64: 'Zh==', contentType: 'application/json' } })),
    );
    check(
      badBase64.error?.code === 'schema-parse-failure' && badBase64.sends === 0 && service.received.length === 0,
      'noncanonical base64 reached the target',
    );
    const mismatch = await counted('content type conflict', () =>
      port.probe(request('POST', '/raw', { header: { 'Content-Type': 'text/plain' }, body: rawBody })),
    );
    check(
      mismatch.error?.code === 'schema-parse-failure' && mismatch.sends === 0 && service.received.length === 0,
      'a conflicting Content-Type header reached the target',
    );
    const duplicateType = await counted('duplicate content type', () =>
      port.probe(
        request('POST', '/raw', { header: { 'Content-Type': rawBody.contentType, 'content-type': rawBody.contentType }, body: rawBody }),
      ),
    );
    check(
      duplicateType.error?.code === 'schema-parse-failure' && duplicateType.sends === 0 && service.received.length === 0,
      'case-variant duplicate Content-Type headers reached the target',
    );
    const invalidContentType = await counted('invalid content type', () =>
      port.probe(request('POST', '/raw', { body: { ...rawBody, contentType: 'application/json\0bad' } })),
    );
    check(
      invalidContentType.error?.code === 'schema-parse-failure' && invalidContentType.sends === 0 && service.received.length === 0,
      'an invalid Content-Type reached the target',
    );
    const declared = await counted('duplicate matching content type header', () =>
      port.probe(request('POST', '/raw', { header: { 'Content-Type': rawBody.contentType }, body: rawBody })),
    );
    check(
      declared.error?.code === 'schema-parse-failure' && declared.sends === 0 && service.received.length === 0,
      `a matching duplicate Content-Type header reached the target: ${JSON.stringify({ error: declared.error?.message, received: service.received })}`,
    );
    const authHeaders = createHttpProbePort({
      policy: { authorizations: [authorization('127.0.0.1')] },
      targets: { unit: { scheme: 'http', host: '127.0.0.1', port: service.port } },
      auth: { unit: { 'Content-Type': 'text/plain', 'Content-Length': '1' } },
    });
    service.received.length = 0;
    const normalizedAuth = await authHeaders.probe(rawRequest);
    check(
      normalizedAuth.status === 200 &&
        service.received[0]?.contentType === rawBody.contentType &&
        service.received[0]?.contentLength === String(malformedBytes.byteLength) &&
        service.received[0]?.bodyBase64 === rawBody.base64,
      `raw bytes or authoritative headers changed under configured auth: ${JSON.stringify(service.received)}`,
    );
    service.received.length = 0;
    await authHeaders.probe(request('POST', '/raw-303', { body: rawBody }));
    check(
      service.received[1]?.method === 'GET' &&
        service.received[1]?.contentType === undefined &&
        service.received[1]?.contentLength === undefined &&
        service.received[1]?.transferEncoding === undefined,
      `a 303 redirect restored body headers from auth: ${JSON.stringify(service.received)}`,
    );
    const framed = await counted('caller framing conflict', () =>
      port.probe(request('POST', '/raw', { header: { 'Content-Length': '1' }, body: rawBody })),
    );
    check(framed.error?.code === 'schema-parse-failure' && framed.sends === 0, 'caller framing changed the raw byte count');
    const rawAtCapBytes = Buffer.alloc(64, 0x80);
    const rawAtCap = await counted('raw body at its cap', () =>
      port.probe(
        request('POST', '/raw', {
          body: { kind: 'raw', base64: rawAtCapBytes.toString('base64'), contentType: 'application/octet-stream' },
        }),
      ),
    );
    check(
      rawAtCap.observation?.status === 200 &&
        service.received[0]?.bodyBase64 === rawAtCapBytes.toString('base64') &&
        service.received[0]?.contentLength === '64',
      'a 64-byte raw body failed at maxRequestBytes 64',
    );
    const oversizedBase64 = Buffer.alloc(65).toString('base64');
    const originalBufferFrom = Buffer.from;
    let portDecodedOversize = false;
    Buffer.from = function (...args) {
      if (args[0] === oversizedBase64 && args[1] === 'base64') {
        portDecodedOversize = true;
      }
      return originalBufferFrom.apply(this, args);
    };
    let rawOversize;
    try {
      rawOversize = await counted('raw body past its cap', () =>
        port.probe(request('POST', '/raw', { body: { kind: 'raw', base64: oversizedBase64, contentType: 'application/octet-stream' } })),
      );
    } finally {
      Buffer.from = originalBufferFrom;
    }
    check(
      rawOversize.error?.code === 'budget-exhausted' && rawOversize.sends === 0 && !portDecodedOversize,
      'the port decoded 65 raw bytes before rejecting maxRequestBytes 64',
    );
    const rawPreserved = await counted('307 raw redirect', () => port.probe(request('POST', '/raw-307', { body: rawBody })));
    check(
      rawPreserved.observation?.status === 200 &&
        service.received[1]?.bodyBase64 === rawBody.base64 &&
        service.received[1]?.contentType === rawBody.contentType,
      '307 redirect changed raw bytes or content type',
    );
    const rawDropped = await counted('303 raw redirect', () => port.probe(request('POST', '/raw-303', { body: rawBody })));
    check(
      rawDropped.observation?.status === 200 &&
        service.received[1]?.method === 'GET' &&
        service.received[1]?.bodyBase64 === '' &&
        service.received[1]?.contentType === undefined &&
        service.received[1]?.transferEncoding === undefined,
      '303 redirect kept a raw body, content type, or framing',
    );
    const denied = await counted('an unlisted method', () => port.probe(request('DELETE', '/echo')));
    check(
      denied.error?.code === 'forbidden-target' &&
        denied.error.reason === 'method-not-authorized' &&
        denied.decisions === 1 &&
        denied.sends === 0,
      `an unlisted method gave ${denied.error?.code}/${denied.error?.reason} after ${denied.decisions} decision(s) and ${denied.sends} send(s)`,
    );
    const oversize = await counted('a body past its cap', () =>
      port.probe(request('POST', '/echo', { body: { kind: 'json', value: { answer: 'x'.repeat(100) } } })),
    );
    check(
      oversize.error?.code === 'budget-exhausted' && oversize.sends === 0,
      `a request body past maxRequestBytes gave ${oversize.error?.code} after ${oversize.sends} send(s)`,
    );
    // A redirect to another origin is decided again and carries no credential there.
    const moved = await counted('a redirect to another origin', () => port.probe(request('GET', '/elsewhere')));
    check(
      moved.observation?.status === 200 &&
        moved.decisions === 2 &&
        service.received[1]?.host === `localhost:${service.port}` &&
        service.received[1].authorization === undefined,
      `a redirect to another origin was sent ${JSON.stringify(service.received)} after ${moved.decisions} decision(s)`,
    );
    // A path value that reads as `..` is refused before anything is sent: a URL would resolve it into another path.
    const dotted = await counted('a dot segment', () => port.probe(request('GET', '/hop/{n}', { path: { n: '..' } })));
    check(
      dotted.error?.code === 'schema-parse-failure' && dotted.sends === 0,
      `a path value of .. gave ${dotted.error?.code ?? JSON.stringify(dotted.observation)} after ${dotted.sends} send(s)`,
    );
    // A redirect to a host the policy does not name is denied by the policy even when the host resolves to nothing; one
    // the policy names that resolves to nothing could not be reached.
    const unlistedHost = await counted('a redirect to an unlisted host', () => port.probe(request('GET', '/to-unlisted-host')));
    check(
      unlistedHost.error?.code === 'forbidden-target' &&
        unlistedHost.error.reason === 'host-not-authorized' &&
        unlistedHost.decisions === 2,
      `a redirect to an unlisted, unresolvable host gave ${unlistedHost.error?.code}/${unlistedHost.error?.reason} after ${unlistedHost.decisions} decision(s)`,
    );
    // eval-quality reports the first authorization's denial, so the listed host's authorization comes first here.
    const listingUnresolvable = createHttpProbePort({
      policy: { authorizations: [authorization('unresolvable.test'), authorization('127.0.0.1')] },
      targets: { unit: { scheme: 'http', host: '127.0.0.1', port: service.port } },
      transport: {
        resolve: async (host) => {
          if (host === 'unresolvable.test') throw new Error(`no address for ${host}`);
          return nodeTransport.resolve(host);
        },
      },
    });
    const unresolvable = await listingUnresolvable.probe(request('GET', '/to-unresolvable')).catch((error) => error);
    check(
      unresolvable?.code === 'port-failure' && String(unresolvable.cause?.message).includes('no address for unresolvable.test'),
      `a redirect to a listed host that resolves to nothing gave ${unresolvable?.code}/${unresolvable?.reason}`,
    );
    // A Location no URL can be read from is the target's answer, recorded as it came.
    const badLocation = await counted('a malformed Location', () => port.probe(request('GET', '/bad-location')));
    check(
      badLocation.observation?.status === 302 && badLocation.observation.headers.location === 'http://[::1' && badLocation.sends === 1,
      `a redirect with a malformed Location gave ${JSON.stringify(badLocation.observation ?? badLocation.error?.message)}`,
    );
    // The transport's prepare step runs once per request, after the policy allowed its first hop and within its cap.
    const prepared = [];
    const preparing = createHttpProbePort({
      policy: { authorizations: [{ ...authorization('127.0.0.1'), maxElapsedMs: 200 }] },
      targets: { unit: { scheme: 'http', host: '127.0.0.1', port: service.port } },
      transport: {
        prepare: async (target) => {
          prepared.push(target);
          await new Promise((resolve) => setTimeout(resolve, 400));
        },
      },
    });
    const slowPrepared = await preparing.probe(request('GET', '/hop/{n}', { path: { n: '1' } })).catch((error) => error);
    const deniedPrepared = await preparing.probe(request('DELETE', '/echo')).catch((error) => error);
    // A body past its cap is refused before the target is prepared, so no service starts for a request never sent.
    const oversizePrepared = await preparing
      .probe(request('POST', '/echo', { body: { kind: 'json', value: { answer: 'x'.repeat(100) } } }))
      .catch((error) => error);
    check(
      slowPrepared?.code === 'budget-exhausted' &&
        prepared.length === 1 &&
        prepared[0].address === '127.0.0.1' &&
        prepared[0].port === service.port &&
        deniedPrepared?.reason === 'method-not-authorized' &&
        oversizePrepared?.code === 'budget-exhausted',
      `a prepare step slower than the cap gave ${slowPrepared?.code ?? slowPrepared?.status} and ran for ${JSON.stringify(prepared)}`,
    );

    // A request the port cannot parse is refused before any decision.
    const malformed = await counted('a malformed request', () => port.probe({ kind: 'api' }));
    check(
      malformed.error?.code === 'schema-parse-failure' && malformed.decisions === 0,
      `a malformed request gave ${malformed.error?.code}`,
    );
  } finally {
    await service.close();
  }
}

async function checkConformance() {
  const project = makeProject('conformance');
  const ran = spawnSync(process.execPath, [path.join('adapter', 'http-probe-port.conformance.mjs')], {
    cwd: project.folder,
    encoding: 'utf8',
    env: BASE_ENV,
    // A stub left open keeps the process alive, so an unclosed server fails here.
    timeout: 60_000,
    killSignal: 'SIGKILL',
  });
  const { CONFORMANCE_OUTCOME_COUNTS } = await import('eval-quality/conformance');
  const expected = expectedOutcomeCount(CONFORMANCE_OUTCOME_COUNTS, 'environment-probe');
  const lines = String(ran.stdout).split('\n');
  check(
    ran.error === undefined &&
      ran.status === 0 &&
      lines[0] === `PASS environment-probe conformance for "http-probe-port": ${expected}/${expected} assertions passed` &&
      lines.filter((line) => line.startsWith('pass probe/')).length === expected,
    `the conformance file ran ${ran.error?.message ?? `to exit ${ran.status}`}; expected ${expected} passing outcomes\n${ran.stdout}${ran.stderr}`,
  );

  // The conformance file closes every stub it started, whether or not the suite disposed of it: over an eval-quality
  // whose suite builds one scenario and reports without disposing of it, the file still ends, since its own `finally`
  // closes the stub. Everything else the file and the port import is the real package.
  const undisposed = makeProject('conformance-undisposed');
  const real = path.join(PROJECT_ROOT, 'node_modules', 'eval-quality');
  const stub = path.join(undisposed.folder, 'node_modules', 'eval-quality');
  fs.rmSync(stub);
  fs.mkdirSync(stub);
  writeJson(path.join(stub, 'package.json'), {
    name: 'eval-quality',
    type: 'module',
    exports: { '.': './index.js', './conformance': './conformance.js' },
  });
  const realUrl = (relative) => JSON.stringify(pathToFileURL(path.join(real, relative)).href);
  fs.writeFileSync(path.join(stub, 'index.js'), `export * from ${realUrl('dist/index.js')};\n`);
  fs.writeFileSync(
    path.join(stub, 'conformance.js'),
    [
      `export * from ${realUrl('dist/testing/index.js')};`,
      'export async function runEnvironmentProbePortConformance(subject) {',
      "  await subject.build('resolves');",
      '  return { passed: true };',
      '}',
      "export function formatConformanceReport() { return 'a suite that disposed of nothing'; }",
      '',
    ].join('\n'),
  );
  const ended = spawnSync(process.execPath, [path.join('adapter', 'http-probe-port.conformance.mjs')], {
    cwd: undisposed.folder,
    encoding: 'utf8',
    env: BASE_ENV,
    timeout: 15_000,
    killSignal: 'SIGKILL',
  });
  check(
    ended.error === undefined && ended.status === 0 && ended.stdout.includes('a suite that disposed of nothing'),
    `the conformance file over a suite that disposed of no stub ${ended.error === undefined ? `exited ${ended.status}` : `did not end: ${ended.error.message}`}\n${ended.stdout}${ended.stderr}`,
  );
}

// ---------------------------------------------------------------- units

async function checkUnits() {
  const { parseProbeTargetPolicy } = await loadAdapters();
  const evaluation = readJson(path.join(FIXTURE, EVALUATION, 'evaluation.json'));
  const [entry] = evaluation.registry;
  // The fixture's server reports the port it bound (Story 1.37). The chosen-port handoff, kept for a server that cannot
  // report its port, is exercised by the units below that name `chosenEntry`, which drop that key.
  const chosenEntry = { ...entry, server: (({ portFileEnvironmentKey, ...server }) => server)(entry.server) };
  await withEnvironment({ GRADER_SECRET: SECRET, GRADER_TOKEN: TOKEN, GRADER_LOG: undefined }, async () => {
    const registry = createRegistry(evaluation.registry, { root: FIXTURE });
    const configuration = portConfiguration({
      entries: registry.entries,
      portOf: () => 4242,
      parsePolicy: parseProbeTargetPolicy,
      readEnvironment: (names) =>
        Object.fromEntries(names.filter((name) => process.env[name] !== undefined).map((name) => [name, process.env[name]])),
      interfaceId: 'grader',
    });
    check(
      JSON.stringify(configuration) ===
        JSON.stringify({
          policy: {
            authorizations: [
              {
                interfaceId: 'grader',
                scheme: 'http',
                host: '127.0.0.1',
                port: 4242,
                addresses: ['127.0.0.1'],
                methods: ['GET'],
                safeMethods: ['GET'],
                maxRedirects: 0,
                maxElapsedMs: 30_000,
                maxRequestBytes: 65_536,
                maxResponseBytes: 1_048_576,
              },
            ],
          },
          targets: { grader: { scheme: 'http', host: '127.0.0.1', port: 4242 } },
          auth: { grader: { authorization: `Bearer ${TOKEN}` } },
        }),
      `the registry's HTTP configuration is ${JSON.stringify(configuration)}`,
    );
    check(
      JSON.stringify(registry.toolInventory()) === JSON.stringify(['grader/GET']) &&
        registry.ceilingMs('grader', { method: 'GET', pathTemplate: '/grade' }) === 30_000 + 20_000,
      `the registry's inventory is ${JSON.stringify(registry.toolInventory())} and an HTTP call's ceiling ${registry.ceilingMs('grader', { pathTemplate: '/grade' })}`,
    );
    check(
      registry.targetProblems(FIXTURE).length === 0 && registry.targetProblems(path.join(FIXTURE, 'rules')).length === 1,
      `a started service's target is not held to an executable file: ${JSON.stringify(registry.targetProblems(path.join(FIXTURE, 'rules')))}`,
    );
    check(
      JSON.stringify(registry.apiSecrets('grader').sort()) === JSON.stringify([SECRET, TOKEN].sort()),
      `an HTTP call's secrets are ${JSON.stringify(registry.apiSecrets('grader'))}`,
    );
    let unprobed = null;
    try {
      await registry.createProbePort({ cwd: FIXTURE });
    } catch (error) {
      unprobed = error;
    }
    check(
      String(unprobed?.message).includes('no HTTP port was probed'),
      `a registry with an HTTP target and no port built a probe port: ${unprobed}`,
    );

    // The scrub reaches an HTTP answer's body, headers and keys, for the service's environment and the auth value alike.
    const leaky = hostEnvironmentPort({
      port: {
        probe: async (request) => ({
          ...request,
          kind: 'api',
          status: 200,
          headers: { 'x-echo': TOKEN },
          body: { kind: 'json', value: { secret: SECRET, [TOKEN]: 'as a key' } },
        }),
      },
      registry,
    });
    const { observation } = await leaky.probe({ probeId: 'x', interfaceId: 'grader', operationId: 'grade-answer', kind: 'api' });
    check(
      !JSON.stringify(observation).includes(SECRET) && !JSON.stringify(observation).includes(TOKEN),
      `an HTTP call's secrets reached the observation: ${JSON.stringify(observation)}`,
    );
    // The same values echoed in another letter case (a header a server normalizes, a field it shouts, a URL a proxy lowercases)
    // are scrubbed from the answer, the headers and the keys alike (Story 1.66); `checkLetterCases` holds the rest of the matrix.
    const shouting = hostEnvironmentPort({
      port: {
        probe: async (request) => ({
          ...request,
          kind: 'api',
          status: 200,
          headers: { 'x-echo': TOKEN.toUpperCase(), 'x-title': `Grader-Token-Value-4567` },
          body: {
            kind: 'json',
            value: { loud: SECRET.toUpperCase(), title: 'Grader-Secret-Value-0123', [TOKEN.toUpperCase()]: 'as a key' },
          },
        }),
      },
      registry,
    });
    const { observation: shouted } = await shouting.probe({
      probeId: 'x',
      interfaceId: 'grader',
      operationId: 'grade-answer',
      kind: 'api',
    });
    check(
      shouted.headers['x-echo'] === '[redacted]' &&
        shouted.headers['x-title'] === '[redacted]' &&
        shouted.body.value.loud === '[redacted]' &&
        shouted.body.value.title === '[redacted]' &&
        shouted.body.value['[redacted]'] === 'as a key' &&
        !JSON.stringify(shouted).toLowerCase().includes(SECRET) &&
        !JSON.stringify(shouted).toLowerCase().includes(TOKEN),
      `an HTTP call's secrets echoed in other letter cases reached the observation: ${JSON.stringify(shouted)}`,
    );
  });

  // A deployed entry is reached at its own port with its auth header, and a started one only for the call that starts it.
  const deployed = {
    kind: 'api',
    interfaceId: 'catalog',
    scheme: 'https',
    host: 'catalog.example.test',
    port: 8443,
    addresses: ['127.0.0.1'],
    methods: ['GET'],
    safeMethods: [],
    maxRedirects: 1,
    maxElapsedMs: 5000,
    maxRequestBytes: 1024,
    maxResponseBytes: 4096,
    auth: {
      header: 'x-api-key',
      environmentKey: 'CATALOG_KEY',
    },
  };
  const started = {
    ...entry,
    interfaceId: 'grader-two',
    auth: { header: 'x-other-key', environmentKey: 'GRADER_TWO_KEY' },
    server: {
      target: 'server/grader.js',
      targetArgs: [],
      environmentKeys: [],
      portEnvironmentKey: 'PORT',
      readyTimeoutMs: 1000,
    },
  };
  const mixed = portConfiguration({
    entries: [deployed, started],
    portOf: (candidate) => (candidate.server === undefined ? candidate.port : null),
    parsePolicy: parseProbeTargetPolicy,
    readEnvironment: (names) => Object.fromEntries(names.map((name) => [name, `${name}-value`])),
    interfaceId: 'catalog',
  });
  check(
    registryProblems([deployed, started]).length === 0 &&
      JSON.stringify(mixed.policy.authorizations.map((authorization) => [authorization.interfaceId, authorization.port])) ===
        JSON.stringify([['catalog', 8443]]) &&
      JSON.stringify(mixed.targets) === JSON.stringify({ catalog: { scheme: 'https', host: 'catalog.example.test', port: 8443 } }) &&
      JSON.stringify(mixed.auth) === JSON.stringify({ catalog: { 'x-api-key': 'CATALOG_KEY-value' } }),
    `a deployed and a started entry gave ${JSON.stringify(mixed)} and ${JSON.stringify(registryProblems([deployed, started]))}`,
  );

  // The registry's rules over HTTP entries.
  const command = {
    interfaceId: 'grader',
    executable: 'grader',
    target: 'server/grader.js',
    subcommandPaths: [[]],
    artifacts: {},
    environmentKeys: [],
    maxElapsedMs: 1000,
    infrastructureExitCodes: [],
  };
  for (const [what, entries, expected] of [
    ['a command sharing the interface', [entry, command], 'names interface "grader" as cli, which an earlier entry names as api'],
    ['two HTTP entries for one interface', [entry, entry], 'repeats interface "grader" as an HTTP target'],
    ['an entry naming a port and a server', [{ ...entry, port: 8080 }], 'must match exactly one schema in oneOf'],
    [
      'an entry naming neither',
      [(({ server, ...deployedWithNoPort }) => deployedWithNoPort)(entry)],
      'must match exactly one schema in oneOf',
    ],
    ['a started service reading PATH', [{ ...entry, server: { ...entry.server, environmentKeys: ['PATH'] } }], 'environmentKeys/0'],
  ]) {
    const problems = registryProblems(entries);
    check(
      problems.some((problem) => problem.includes(expected)),
      `${what}: the registry problems are ${JSON.stringify(problems)}`,
    );
  }

  // An HTTP step's record: its query in, the answer's status, headers and body out.
  const contract = readJson(path.join(FIXTURE, EVALUATION, 'contract.json'));
  const answering = (observation) => ({
    probe: async (request) => ({ request, observation: { ...observation, probeId: request.probeId } }),
  });
  const armed = await runArm({
    contract,
    port: answering({
      kind: 'api',
      status: 503,
      headers: { 'content-type': 'application/json' },
      body: { kind: 'json', value: { ok: false } },
    }),
    registry: null,
    label: 'trial-1',
    provenance: 'evaluator-chosen',
  });
  const recorded = armed.stepObservations['grade-run'];
  check(
    JSON.stringify(recorded?.callInputs?.query) === JSON.stringify({ answer: 'forty-two' }) &&
      recorded.callInputs.path === null &&
      recorded.callInputs.body === null &&
      recorded.responseStatus === 503 &&
      recorded.responseHeaders?.['content-type'] === 'application/json' &&
      JSON.stringify(recorded.responseBody) === JSON.stringify({ ok: false }) &&
      recorded.exitCode === null &&
      JSON.stringify(armed.steps[0].request) ===
        JSON.stringify({
          probeId: 'trial-1-grade-run',
          interfaceId: 'grader',
          operationId: 'grade-answer',
          kind: 'api',
          method: 'GET',
          pathTemplate: '/grade',
          channels: { path: {}, query: { answer: 'forty-two' }, header: {}, body: { kind: 'absent' } },
        }),
    `an HTTP step is recorded as ${JSON.stringify(recorded)} from ${JSON.stringify(armed.steps[0]?.request)}`,
  );
  const headed = structuredClone(contract);
  headed.interactionPlan[0].inputBinding.header = { 'x-count': { literal: 3 } };
  let headerError = null;
  try {
    await runArm({
      contract: headed,
      port: answering({ kind: 'api', status: 200, headers: {}, body: { kind: 'absent' } }),
      registry: null,
      label: 't',
    });
  } catch (error) {
    headerError = error;
  }
  check(
    headerError instanceof ArmError && headerError.message.includes('a header value is a string'),
    `a header bound to a number gave ${headerError}`,
  );
  // The synthetic port answers an HTTP step only through the evaluation's HTTP port, and refuses a response of another kind.
  let unported = null;
  try {
    await syntheticPort({ label: 'g', steps: { one: { status: 200 } } }).probe({ probeId: 'g-one', kind: 'api' });
  } catch (error) {
    unported = error.message;
  }
  let crossed = null;
  try {
    await syntheticPort({ label: 'g', steps: { one: { stdout: '', stderr: '', exitCode: 0 } } }).probe({ probeId: 'g-one', kind: 'api' });
  } catch (error) {
    crossed = error.message;
  }
  check(
    String(unported).includes("has no registry to hold the evaluation's authorizations") &&
      String(crossed).includes("an HTTP request, with a command's response"),
    `the synthetic port answered an HTTP step with ${unported} and ${crossed}`,
  );

  // An HTTP step's path, header and body bindings reach the request and the record.
  const bound = structuredClone(contract);
  bound.permittedInterfaces[0].operations[0].pathTemplate = '/grade/{id}';
  bound.interactionPlan[0].inputBinding = {
    path: { id: { literal: 'a b' } },
    query: null,
    header: { 'x-trace': { literal: 'trace-1' } },
    body: { answer: { literal: 'forty-two' } },
  };
  const boundArm = await runArm({
    contract: bound,
    port: answering({ kind: 'api', status: 200, headers: {}, body: { kind: 'absent' } }),
    registry: null,
    label: 'trial-1',
  });
  const boundRecord = boundArm.stepObservations['grade-run'];
  check(
    JSON.stringify([
      boundRecord?.callInputs.path,
      boundRecord?.callInputs.query,
      boundRecord?.callInputs.header,
      boundRecord?.callInputs.body,
    ]) === JSON.stringify([{ id: 'a b' }, null, { 'x-trace': 'trace-1' }, { answer: 'forty-two' }]) &&
      JSON.stringify(boundArm.steps[0].request.channels) ===
        JSON.stringify({
          path: { id: 'a b' },
          query: {},
          header: { 'x-trace': 'trace-1' },
          body: { kind: 'json', value: { answer: 'forty-two' } },
        }),
    `an HTTP step's path, header and body are recorded as ${JSON.stringify(boundRecord?.callInputs)} from ${JSON.stringify(boundArm.steps[0]?.request)}`,
  );
  const rawStep = structuredClone(contract);
  const rawStepBody = { kind: 'raw', base64: Buffer.from('{"answer":').toString('base64'), contentType: 'application/json' };
  rawStep.interactionPlan[0].inputBinding.body = rawStepBody;
  const rawStepArm = await runArm({
    contract: rawStep,
    port: answering({ kind: 'api', status: 400, headers: {}, body: { kind: 'json', value: { error: 'invalid JSON' } } }),
    registry: null,
    label: 'raw-trial',
  });
  check(
    JSON.stringify(rawStepArm.steps[0]?.request.channels.body) === JSON.stringify(rawStepBody) &&
      JSON.stringify(rawStepArm.stepObservations['grade-run']?.callInputs.body) === JSON.stringify(rawStepBody) &&
      rawStepArm.stepObservations['grade-run']?.callInputs.bodyEncoding === 'raw' &&
      boundRecord?.callInputs.bodyEncoding === null &&
      recorded?.callInputs.bodyEncoding === null,
    `a raw scored step lost its body-kind marker or exact bytes: ${JSON.stringify(rawStepArm.stepObservations['grade-run'])}`,
  );
  const mimicStep = structuredClone(contract);
  mimicStep.interactionPlan[0].inputBinding.body = {
    kind: { literal: 'raw' },
    base64: { literal: rawStepBody.base64 },
    contentType: { literal: rawStepBody.contentType },
  };
  const mimicArm = await runArm({
    contract: mimicStep,
    port: answering({ kind: 'api', status: 200, headers: {}, body: { kind: 'absent' } }),
    registry: null,
    label: 'json-mimic',
  });
  check(
    mimicArm.steps[0]?.request.channels.body.kind === 'json' &&
      JSON.stringify(mimicArm.stepObservations['grade-run']?.callInputs.body) === JSON.stringify(rawStepBody) &&
      mimicArm.stepObservations['grade-run']?.callInputs.bodyEncoding === null,
    'a JSON body shaped like a raw body acquired the raw marker',
  );
  const malformedBody = structuredClone(bound);
  malformedBody.permittedInterfaces[0].operations[0].requestShape.body = {
    requiredKeys: [],
    permittedKeys: ['answer'],
    types: { answer: 'string' },
  };
  malformedBody.interactionPlan[0].inputBinding.body = { answer: { matcher: 'type-violating' } };
  const malformedBodyArm = await runArm({
    contract: malformedBody,
    port: answering({ kind: 'api', status: 400, headers: {}, body: { kind: 'json', value: { error: 'invalid answer' } } }),
    registry: null,
    label: 'malformed',
  });
  check(
    malformedBodyArm.steps[0]?.request.channels.body.kind === 'json' &&
      malformedBodyArm.steps[0].request.channels.body.value.answer === 42 &&
      malformedBodyArm.stepObservations['grade-run'].callInputs.body.answer === 42,
    `a type-violating HTTP body did not reach the port and record as a JSON number: ${JSON.stringify(malformedBodyArm.steps[0]?.request)}`,
  );
  const malformedHeader = structuredClone(bound);
  malformedHeader.permittedInterfaces[0].operations[0].requestShape.header = {
    requiredKeys: [],
    permittedKeys: ['x-trace'],
    types: { 'x-trace': 'string' },
  };
  malformedHeader.interactionPlan[0].inputBinding.header = { 'x-trace': { matcher: 'type-violating' } };
  let malformedHeaderError = null;
  try {
    await runArm({
      contract: malformedHeader,
      port: answering({ kind: 'api', status: 200, headers: {}, body: { kind: 'absent' } }),
      registry: null,
      label: 'malformed',
    });
  } catch (error) {
    malformedHeaderError = error;
  }
  check(
    malformedHeaderError instanceof ArmError && malformedHeaderError.message.includes('type-violating header.x-trace'),
    `a type-violating HTTP header was accepted: ${malformedHeaderError}`,
  );

  // A trial whose step the registry denies records eval-quality's reason in its fault and names it as it exits 10. The
  // pipeline's qualification runs the same plan under the same policy first, so the trial is driven directly.
  const project = makeProject('unit-trial-denied');
  const denying = createRegistry([{ ...entry, addresses: ['127.0.0.2'] }], {
    root: project.root,
    httpPort: await probeHttpPort(project.folder),
  });
  const written = {};
  let trialStop = null;
  await withEnvironment({ GRADER_LOG: project.log }, async () => {
    try {
      await runTrial({
        arm: { conditionArm: 'clean', slug: 'clean', mutation: null, mutatedDigest: null, probes: [] },
        trialIndex: 1,
        contract,
        registry: denying,
        pristine: null,
        make: () => ({ kind: 'copy', root: project.root, directory: project.root, provisioned: [] }),
        discard: () => {},
        engine: null,
        writer: { writeJson: (file, value) => (written[file] = value) },
        stop: (fields) => Object.assign(new Error(fields.message), fields),
        signal: new AbortController().signal,
        snapshot: { layer: { evaluator: { kind: 'deterministic' } } },
      });
    } catch (error) {
      trialStop = error;
    }
  });
  const trialFault = written['trials/clean/trial-1.json']?.fault;
  check(
    trialFault?.code === 'forbidden-target' &&
      trialFault.reason === 'address-not-authorized' &&
      trialFault.request?.kind === 'api' &&
      trialStop?.exitCode === 10 &&
      trialStop.message.startsWith('trial-clean-1 was denied by the registry (address-not-authorized): ') &&
      sessions(project).length === 0,
    `a denied trial step recorded ${JSON.stringify(trialFault)} and stopped with ${trialStop?.exitCode}: ${trialStop?.message}`,
  );

  const httpPort = await probeHttpPort(project.folder);
  const { nodeCommandMechanism } = await loadAdapters();
  const noEnvironment = () => ({});
  // A port file whose bytes changed after the run asked it for its protocol serves no call.
  const changed = await createApiPort({
    entries: [entry],
    httpPort: { ...httpPort, digest: 'sha256:0000' },
    cwd: project.root,
    targetOf: () => path.join(project.root, 'server', 'grader.js'),
    readEnvironment: noEnvironment,
    mechanism: nodeCommandMechanism,
    maxOutputBytes: 1024,
  })
    .probe(armed.steps[0].request)
    .catch((error) => error);
  check(
    changed?.code === 'port-failure' && String(changed.cause?.message).includes('changed after the run started'),
    `a port file changed during the run gave ${changed?.code}: ${changed?.cause?.message ?? changed?.message}`,
  );
  // A port file replaced during the run by a pipe no one opens, or by a link to /dev/zero, is a changed port file,
  // refused at once: the runtime reads neither through a read that waits or follows a link.
  for (const [what, replace] of [
    ...(process.platform === 'win32' ? [] : [['a named pipe', (file) => spawnSync('mkfifo', [file])]]),
    ...(fs.existsSync('/dev/zero') ? [['a link to /dev/zero', (file) => fs.symlinkSync('/dev/zero', file)]] : []),
  ]) {
    const replaced = path.join(scratch.make('port-module-replaced'), 'http-probe-port.mjs');
    replace(replaced);
    const started = Date.now();
    const refused = await createApiPort({
      entries: [entry],
      httpPort: { ...httpPort, file: replaced },
      cwd: project.root,
      targetOf: () => path.join(project.root, 'server', 'grader.js'),
      readEnvironment: noEnvironment,
      mechanism: nodeCommandMechanism,
      maxOutputBytes: 1024,
    })
      .probe(armed.steps[0].request)
      .catch((error) => error);
    const elapsed = Date.now() - started;
    check(
      refused?.code === 'port-failure' && String(refused.cause?.message).includes('changed after the run started') && elapsed < 5000,
      `a port file replaced by ${what} during the run gave ${refused?.code}: ${refused?.cause?.message ?? refused?.message} after ${elapsed}ms`,
    );
  }

  // The chosen-port handoff and its window. Another process that took the call's port answers after the call's own
  // server ended with exit 1: the answer is refused, since no server of the run gave it.
  let squatter = null;
  const squatting = {
    run: (request, signal) =>
      new Promise((resolve) => {
        squatter = http.createServer((incoming, response) => {
          // The run's server has failed (its port was taken) before the other process answers.
          resolve({ exitCode: 1, stdout: '', stderr: 'listen EADDRINUSE' });
          setTimeout(() => response.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}'), 50);
        });
        squatter.listen(Number(request.env.PORT), '127.0.0.1');
        signal.addEventListener('abort', () => resolve({ exitCode: 1, stdout: '', stderr: '' }), { once: true });
      }),
  };
  const squatted = await createApiPort({
    entries: [chosenEntry],
    httpPort,
    cwd: project.root,
    targetOf: () => path.join(project.root, 'server', 'grader.js'),
    readEnvironment: noEnvironment,
    mechanism: squatting,
    maxOutputBytes: 1024,
  })
    .probe(armed.steps[0].request)
    .catch((error) => error);
  if (squatter !== null) {
    squatter.closeAllConnections();
    await new Promise((resolve) => squatter.close(resolve));
  }
  check(
    squatted?.code === 'port-failure' &&
      String(squatted.message).includes("after the call's server had ended") &&
      String(squatted.cause?.message).includes('exited 1 after it accepted a connection'),
    `an answer from another process on the call's port gave ${JSON.stringify(squatted?.status ?? squatted?.message)}: ${squatted?.cause?.message}`,
  );

  // A port another process already listens on is refused before the call's server starts.
  const holder = http.createServer((incoming, response) => response.end('{}'));
  await new Promise((resolve) => holder.listen(0, '127.0.0.1', resolve));
  let serverStarted = false;
  const taken = await callServer({
    entry: chosenEntry,
    port: holder.address().port,
    cwd: project.root,
    target: path.join(project.root, 'server', 'grader.js'),
    environment: {},
    mechanism: {
      run: () => {
        serverStarted = true;
        return new Promise(() => {});
      },
    },
    maxOutputBytes: 1024,
  })
    .start(new AbortController().signal, '127.0.0.1')
    .catch((error) => error);
  holder.closeAllConnections();
  await new Promise((resolve) => holder.close(resolve));
  check(
    String(taken?.message).includes('another process listens on 127.0.0.1') && !serverStarted,
    `a port another process holds gave ${taken?.message ?? 'a started server'}`,
  );

  // A server that runs and never listens is reported at readyTimeoutMs with the last attempt's reason, so a closed port
  // (ECONNREFUSED) reads apart from a host that has run out of ports to connect from (EADDRNOTAVAIL).
  const released = http.createServer();
  await new Promise((resolve) => released.listen(0, '127.0.0.1', resolve));
  const unheldPort = released.address().port;
  await new Promise((resolve) => released.close(resolve));
  const silent = await callServer({
    entry: { ...chosenEntry, server: { ...chosenEntry.server, readyTimeoutMs: 300 } },
    port: unheldPort,
    cwd: project.root,
    target: path.join(project.root, 'server', 'grader.js'),
    environment: {},
    mechanism: { run: () => new Promise(() => {}) },
    maxOutputBytes: 1024,
  })
    .start(new AbortController().signal, '127.0.0.1')
    .catch((error) => error);
  check(
    String(silent?.message).endsWith(
      `did not accept a connection on 127.0.0.1 port ${unheldPort} within readyTimeoutMs (300ms); the last attempt failed with ECONNREFUSED`,
    ),
    `a server that never listens gave ${silent?.message ?? 'a ready server'}`,
  );

  // A server that reports the port it bound is reached there alone. Another process listens on the port the runtime
  // hands the server, as one that takes a chosen port in the window before the server binds it does; with the port
  // file, the runtime hands the server 0, which no process holds, and the other process answers nothing.
  const intruded = [];
  let intruder = null;
  const intruding = {
    run: (request, signal) => {
      intruder = http.createServer((incoming, response) => {
        intruded.push(incoming.url);
        response.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true,"verdict":"intruder"}');
      });
      // A port the other process cannot take (the host out of ports) leaves it absent, which the check below names.
      intruder.on('error', (error) => intruded.push(`the other process could not listen: ${error.code}`));
      intruder.listen(Number(request.env.PORT), '127.0.0.1');
      return nodeCommandMechanism.run(request, signal);
    },
  };
  const reachedLog = path.join(scratch.make('port-file-reached'), 'grader.jsonl');
  const graderLog = (names) => Object.fromEntries(names.filter((name) => name === 'GRADER_LOG').map((name) => [name, reachedLog]));
  const reached = await createApiPort({
    entries: [entry],
    httpPort,
    cwd: project.root,
    targetOf: () => path.join(project.root, 'server', 'grader.js'),
    readEnvironment: graderLog,
    mechanism: intruding,
    maxOutputBytes: 1024 * 1024,
  })
    .probe(armed.steps[0].request)
    .catch((error) => error);
  if (intruder?.listening) {
    intruder.closeAllConnections();
    await new Promise((resolve) => intruder.close(resolve));
  }
  const reachedLines = sessions({ log: reachedLog });
  check(
    reached?.status === 200 &&
      reached.body?.value?.verdict === 'accepted' &&
      intruded.length === 0 &&
      reachedLines.some((line) => line.event === 'listen' && line.handoff === 'port-file') &&
      reachedLines.filter((line) => line.event === 'request').length === 1,
    `a server reporting its port, with another process on the port the runtime hands it: the call gave ${JSON.stringify(reached?.body ?? reached?.cause?.message ?? reached?.message)}, the other process answered ${JSON.stringify(intruded)}, the server logged ${JSON.stringify(reachedLines)}`,
  );

  // A port file that is never written, or that names no port, starts no call: the server is a target that could not
  // run. A fake server that writes its report and never listens, so only the file decides the outcome.
  const reporting = (write) => ({
    run: (request, signal) =>
      new Promise((resolve) => {
        write(request.env.PORT_FILE, request.env.PORT);
        signal.addEventListener('abort', () => resolve({ exitCode: 0, stdout: '', stderr: '' }), { once: true });
      }),
  });
  const handed = [];
  for (const [what, write, expected] of [
    [
      'a server that writes no port',
      (file, port) => handed.push(port),
      'wrote no port to the file PORT_FILE names within readyTimeoutMs (300ms)',
    ],
    [
      'a server that writes a port that is not a number',
      (file) => fs.writeFileSync(file, 'port 8080\n'),
      'wrote something other than a port number (a whole number from 1 to 65535) to the file PORT_FILE names',
    ],
    ['a server that writes port 0', (file) => fs.writeFileSync(file, '0'), 'wrote something other than a port number'],
    ['a server that writes a port past 65535', (file) => fs.writeFileSync(file, '65536'), 'wrote something other than a port number'],
    [
      'a server that writes more than a port number',
      (file) => fs.writeFileSync(file, ' '.repeat(64) + '8080\n'),
      'wrote something other than a port number',
    ],
    // A pipe no one opens and a link to an endless device would hold a read that waits or follows; neither holds the runtime.
    ...(process.platform === 'win32'
      ? []
      : [
          [
            'a server that makes its port file a named pipe',
            (file) => spawnSync('mkfifo', [file]),
            'wrote something other than a port number',
          ],
        ]),
    ...(fs.existsSync('/dev/zero')
      ? [
          [
            'a server that makes its port file a link to /dev/zero',
            (file) => fs.symlinkSync('/dev/zero', file),
            'wrote something other than a port number',
          ],
        ]
      : []),
  ]) {
    const directory = scratch.make('port-report');
    const started = Date.now();
    const refusedReport = await callServer({
      entry: { ...entry, server: { ...entry.server, readyTimeoutMs: 300 } },
      portFile: path.join(directory, 'port'),
      cwd: project.root,
      target: path.join(project.root, 'server', 'grader.js'),
      environment: {},
      mechanism: reporting(write),
      maxOutputBytes: 1024,
    })
      .start(new AbortController().signal, '127.0.0.1')
      .catch((error) => error);
    const elapsed = Date.now() - started;
    check(
      String(refusedReport?.message).includes(expected),
      `${what} gave ${refusedReport?.message ?? `a server ready on ${refusedReport}`}`,
    );
    // A file that names no port is refused as soon as it is read, before readyTimeoutMs runs out.
    if (expected.startsWith('wrote something other')) check(elapsed < 300, `${what} was refused after ${elapsed}ms; expected within 300ms`);
  }
  check(
    JSON.stringify(handed) === JSON.stringify(['0']),
    `a server reporting its port was handed ${JSON.stringify(handed)} in PORT; expected "0"`,
  );

  // A port whose own decision allows everything, and that names another method than the request's when it prepares,
  // starts no server for a call eval-quality's policy denies: the runtime asks eval-quality itself, at the request's method.
  const permissive = makeProject('port-allows-all', {
    edit: ({ folder }) => {
      const file = path.join(folder, HTTP_PORT_MODULE);
      const oldPrepare = 'await prepare({ scheme, host, port, address: decision.canonicalAddress, method }, signal);';
      const newPrepare = 'await whileActive(() => prepare({ scheme, host, port, address: decision.canonicalAddress, method }, exchange));';
      fs.writeFileSync(
        file,
        fs
          .readFileSync(file, 'utf8')
          .replace(
            'const decision = evaluateTarget(policy, { ...hopTarget, address });',
            'const decision = { allowed: true, authorization: policy.authorizations[0], canonicalAddress: address };',
          )
          .replace(
            newPrepare,
            "await whileActive(() => prepare({ scheme, host, port, address: decision.canonicalAddress, method: 'GET' }, exchange));",
          )
          .replace(oldPrepare, "await prepare({ scheme, host, port, address: decision.canonicalAddress, method: 'GET' }, signal);"),
      );
    },
  });
  const permissivePort = await probeHttpPort(permissive.folder);
  const overreached = await withEnvironment({ GRADER_LOG: permissive.log }, () =>
    createApiPort({
      entries: [entry],
      httpPort: permissivePort,
      cwd: permissive.root,
      targetOf: () => path.join(permissive.root, 'server', 'grader.js'),
      readEnvironment: noEnvironment,
      mechanism: nodeCommandMechanism,
      maxOutputBytes: 1024,
    })
      .probe({ ...armed.steps[0].request, method: 'DELETE' })
      .catch((error) => error),
  );
  check(
    overreached?.code === 'port-failure' &&
      String(overreached.cause?.message).includes("eval-quality's policy does not allow the target the port named") &&
      sessions(permissive).length === 0,
    `a DELETE a permissive port allowed gave ${overreached?.code}: ${overreached?.cause?.message} and started ${JSON.stringify(sessions(permissive))}`,
  );

  // A deployed entry is reached at its own port with its auth header, and starts nothing.
  const service = await unitService();
  try {
    const deployedEntry = {
      kind: 'api',
      interfaceId: 'unit-deployed',
      scheme: 'http',
      host: '127.0.0.1',
      port: service.port,
      addresses: ['127.0.0.1'],
      methods: ['GET'],
      safeMethods: ['GET'],
      maxRedirects: 1,
      maxElapsedMs: 5000,
      maxRequestBytes: 1024,
      maxResponseBytes: 262_144,
      auth: {
        header: 'x-api-key',
        environmentKey: 'UNIT_API_KEY',
      },
    };
    const deployedRegistry = createRegistry([deployedEntry], { root: project.root, httpPort });
    const answered = await withEnvironment({ UNIT_API_KEY: 'unit-key-value', GRADER_LOG: project.log }, async () => {
      const { port } = await deployedRegistry.createProbePort({ cwd: project.root, projectRoot: project.root });
      return port
        .probe({
          probeId: 'deployed-1',
          interfaceId: 'unit-deployed',
          operationId: 'echo',
          kind: 'api',
          method: 'GET',
          pathTemplate: '/echo',
          channels: { path: {}, query: {}, header: {}, body: { kind: 'absent' } },
        })
        .catch((error) => error);
    });
    check(
      answered?.status === 200 &&
        service.received.length === 1 &&
        service.received[0].apiKey === 'unit-key-value' &&
        sessions(project).length === 0,
      `a call to a deployed entry gave ${JSON.stringify(answered?.status ?? answered?.message)} and reached ${JSON.stringify(service.received)}`,
    );

    // An answer past 64 KiB of multi-byte characters crosses the port's channel in several chunks and is read whole.
    // Four answers, each shifted by one more ASCII character, so a chunk's end falls inside a character in some of them
    // wherever the channel cuts.
    const multibytes = await withEnvironment({ UNIT_API_KEY: 'unit-key-value' }, async () => {
      const { port } = await deployedRegistry.createProbePort({ cwd: project.root, projectRoot: project.root });
      const answers = [];
      for (const pad of [0, 1, 2, 3]) {
        answers.push(
          await port
            .probe({
              probeId: `deployed-multibyte-${pad}`,
              interfaceId: 'unit-deployed',
              operationId: 'multibyte',
              kind: 'api',
              method: 'GET',
              pathTemplate: '/multibyte',
              channels: { path: {}, query: { pad: String(pad) }, header: {}, body: { kind: 'absent' } },
            })
            .catch((error) => error),
        );
      }
      return answers;
    });
    const unread = multibytes
      .map((answer, pad) => ({ pad, value: String(answer?.body?.value ?? answer?.message) }))
      .filter(({ pad, value }) => value !== `${'a'.repeat(pad)}${MULTIBYTE}`)
      .map(({ pad, value }) => ({ pad, length: value.length, replaced: [...value].filter((character) => character === '\uFFFD').length }));
    check(unread.length === 0, `a ${Buffer.byteLength(MULTIBYTE)}-byte multi-byte answer came back altered: ${JSON.stringify(unread)}`);

    // A denial's message names the host a redirect gave, which a URL lowercases: a secret the target put there is
    // scrubbed from the message in every case, as from the answer.
    const { default: createHttpProbePort } = await import('../src/workflows/testarch/bmad-testarch-evaluate/assets/http-probe-port.mjs');
    const mixedCaseKey = 'Unit-Key-Value-MixedCase';
    const templatePort = createHttpProbePort({
      ...portConfiguration({
        entries: [deployedEntry],
        portOf: (candidate) => candidate.port,
        parsePolicy: parseProbeTargetPolicy,
        readEnvironment: () => ({ UNIT_API_KEY: mixedCaseKey }),
        interfaceId: 'unit-deployed',
      }),
      transport: {
        // A name no resolver knows, as DNS answers for the host the redirect named.
        resolve: async (host) => {
          if (host !== '127.0.0.1') throw new Error(`no address for ${host}`);
          return host;
        },
      },
    });
    const redirected = await withEnvironment({ UNIT_API_KEY: mixedCaseKey }, async () =>
      hostEnvironmentPort({ port: templatePort, registry: createRegistry([deployedEntry], { root: project.root, httpPort }) })
        .probe({
          probeId: 'deployed-3',
          interfaceId: 'unit-deployed',
          operationId: 'to-host',
          kind: 'api',
          method: 'GET',
          pathTemplate: '/to-host',
          channels: { path: {}, query: { host: `${mixedCaseKey}.example.test` }, header: {}, body: { kind: 'absent' } },
        })
        .catch((error) => error),
    );
    check(
      redirected?.code === 'forbidden-target' &&
        redirected.reason === 'host-not-authorized' &&
        !redirected.message.toLowerCase().includes(mixedCaseKey.toLowerCase()) &&
        redirected.message.includes('[redacted]'),
      `a redirect to a host carrying the auth value was denied with ${redirected?.code}/${redirected?.reason}: ${redirected?.message}`,
    );
  } finally {
    await service.close();
  }

  // On a gameability arm, every spelling of a host the policy reads as the entry's resolves as on a real arm, so a
  // redirect to it is followed (and caps), and a host the policy does not name is still denied by the policy.
  const gameEntry = {
    kind: 'api',
    interfaceId: 'unit-game',
    scheme: 'http',
    host: 'localhost',
    port: 8080,
    addresses: ['127.0.0.1'],
    methods: ['GET'],
    safeMethods: ['GET'],
    maxRedirects: 1,
    maxElapsedMs: 5000,
    maxRequestBytes: 1024,
    maxResponseBytes: 4096,
  };
  const degenerateRedirect = async (location) =>
    degenerateApiPort({
      entries: [gameEntry],
      httpPort,
      answer: { status: 302, headers: { location } },
      readEnvironment: noEnvironment,
    })
      .probe({
        probeId: 'game-1',
        interfaceId: 'unit-game',
        operationId: 'redirect',
        kind: 'api',
        method: 'GET',
        pathTemplate: '/start',
        channels: { path: {}, query: {}, header: {}, body: { kind: 'absent' } },
      })
      .catch((error) => error);
  const respelled = await degenerateRedirect('http://LOCALHOST.:8080/next');
  const elsewhere = await degenerateRedirect('http://elsewhere.test:8080/next');
  check(
    respelled?.code === 'budget-exhausted' && elsewhere?.code === 'forbidden-target' && elsewhere.reason === 'host-not-authorized',
    `a gameability redirect to LOCALHOST. gave ${respelled?.code}/${respelled?.reason}, and to an unlisted host ${elsewhere?.code}/${elsewhere?.reason}`,
  );
}

// ---------------------------------------------------------------- the port's process

/**
 * A call through the port's own process holds only its own interface's credential, a secret the quoted end of what a
 * process printed would cut is scrubbed before the cut, and the host reads a call whose bytes arrive split inside a
 * character whole.
 */
async function checkPortProcess() {
  const [grader] = readJson(path.join(FIXTURE, EVALUATION, 'evaluation.json')).registry;
  // A port that reports which interfaces' auth it was handed, and one that prints its auth value and ends unanswered.
  const project = makeProject('port-process', {
    edit: ({ folder }) => {
      const file = path.join(folder, HTTP_PORT_MODULE);
      const probeStart = '  async function probe(input, signal) {\n';
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes(probeStart)) throw new Error("the port template's probe no longer opens as the test edits it");
      fs.writeFileSync(
        file,
        source.replace(
          probeStart,
          `${probeStart}    if (input?.operationId === 'report-auth') {
      throw new RuntimeFault('port-failure', 'ProbeRequest', \`auth \${JSON.stringify(Object.keys(auth).sort())}\`);
    }
    if (input?.operationId === 'channel-auth') {
      const value = Object.values(auth[input.interfaceId] ?? {})[0];
      (await import('node:fs')).writeSync(3, \`\${'x'.repeat(190)}\${value}\\n\`);
      return new Promise(() => {});
    }
    if (input?.operationId === 'answer-unprepared') {
      return { probeId: input.probeId, interfaceId: input.interfaceId, operationId: input.operationId, kind: 'api', status: 200, headers: {}, body: { kind: 'absent' } };
    }
    if (input?.operationId === 'print-auth') {
      const value = Object.values(auth[input.interfaceId] ?? {})[0];
      process.stdout.write(\`\${'a'.repeat(100)}\${value}\${'b'.repeat(1994)}\`, () => process.exit(1));
      return new Promise(() => {});
    }
`,
        ),
      );
    },
  });
  const httpPort = await probeHttpPort(project.folder);
  const straddled = 'straddle-value-QZXJWK';
  const deployedEntry = (interfaceId, environmentKey) => ({
    kind: 'api',
    interfaceId,
    scheme: 'http',
    host: '127.0.0.1',
    port: 9,
    addresses: ['127.0.0.1'],
    methods: ['GET'],
    safeMethods: ['GET'],
    maxRedirects: 0,
    maxElapsedMs: 5000,
    maxRequestBytes: 1024,
    maxResponseBytes: 4096,
    auth: { header: 'x-api-key', environmentKey },
  });
  const entries = [deployedEntry('unit-a', 'UNIT_A_KEY'), deployedEntry('unit-b', 'UNIT_B_KEY')];
  const readEnvironment = (names) => Object.fromEntries(names.map((name) => [name, name === 'UNIT_A_KEY' ? straddled : `${name}-value`]));
  const request = (interfaceId, operationId) => ({
    probeId: `${operationId}-1`,
    interfaceId,
    operationId,
    kind: 'api',
    method: 'GET',
    pathTemplate: '/',
    channels: { path: {}, query: {}, header: {}, body: { kind: 'absent' } },
  });
  const { nodeCommandMechanism } = await loadAdapters();
  const live = createApiPort({
    entries,
    httpPort,
    cwd: project.root,
    targetOf: () => path.join(project.root, 'server', 'grader.js'),
    readEnvironment,
    mechanism: nodeCommandMechanism,
    maxOutputBytes: 1024,
  });
  const degenerate = degenerateApiPort({ entries, httpPort, answer: { status: 200 }, readEnvironment });

  // Each call's port holds its own interface's auth alone, on a real arm and a gameability arm alike.
  for (const [arm, port] of [
    ['a real arm', live],
    ['a gameability arm', degenerate],
  ]) {
    const reported = await port.probe(request('unit-a', 'report-auth')).catch((error) => error);
    check(
      reported?.code === 'port-failure' && String(reported.message).endsWith('auth ["unit-a"]'),
      `a call to unit-a on ${arm} handed its port the auth of ${reported?.message}`,
    );
  }

  // A secret straddling the start of the end a failure quotes is scrubbed whole before the cut, from what the port
  // process printed and from what a started service printed on its standard error.
  const scrubbing = (port) => hostEnvironmentPort({ port, registry: { apiSecrets: () => [straddled] } });
  const printed = await scrubbing(live)
    .probe(request('unit-a', 'print-auth'))
    .catch((error) => error);
  const serverPrinted = await scrubbing(
    createApiPort({
      entries: [grader],
      httpPort,
      cwd: project.root,
      targetOf: () => path.join(project.root, 'server', 'grader.js'),
      readEnvironment: () => ({}),
      mechanism: { run: async () => ({ exitCode: 1, stdout: '', stderr: `${'a'.repeat(100)}${straddled}${'b'.repeat(1994)}` }) },
      maxOutputBytes: 1024,
    }),
  )
    .probe({ ...request('grader', 'grade-run'), pathTemplate: '/grade' })
    .catch((error) => error);
  // An answer the port gives before it asks the runtime to start the call's server came from no server of the run, as
  // a port that skips its prepare step and sends to the placeholder port would give, and is refused.
  let unpreparedStarts = 0;
  const unprepared = await createApiPort({
    entries: [grader],
    httpPort,
    cwd: project.root,
    targetOf: () => path.join(project.root, 'server', 'grader.js'),
    readEnvironment: () => ({}),
    mechanism: {
      run: () => {
        unpreparedStarts += 1;
        return new Promise(() => {});
      },
    },
    maxOutputBytes: 1024,
  })
    .probe({ ...request('grader', 'answer-unprepared'), pathTemplate: '/grade' })
    .catch((error) => error);
  check(
    unprepared?.code === 'port-failure' &&
      String(unprepared.message).includes('the answer came before the call started its server') &&
      unpreparedStarts === 0,
    `an answer before the call's server was ready gave ${JSON.stringify(unprepared?.status ?? unprepared?.message)} with ${unpreparedStarts} server start(s)`,
  );
  // A line outside the protocol is quoted cut at its end, where the scrub finds the leading part of a secret the cut left.
  const strayLine = await scrubbing(live)
    .probe(request('unit-a', 'channel-auth'))
    .catch((error) => error);
  check(
    strayLine?.code === 'port-failure' &&
      String(strayLine.scrubbedCause).includes("wrote a line that is not the runtime's protocol") &&
      !String(strayLine.scrubbedCause).includes('straddle-'),
    `a secret the quoted stray line cut left ${JSON.stringify(String(strayLine?.scrubbedCause).slice(-80))}`,
  );
  for (const [what, fault, account] of [
    ["the port's process", printed, 'ended (exit 1) before it answered'],
    ['a started service', serverPrinted, 'exited 1 before it accepted a connection'],
  ]) {
    const cause = String(fault?.scrubbedCause);
    check(
      fault?.code === 'port-failure' && cause.includes(account) && cause.includes('b'.repeat(1994)) && !cause.includes('QZXJWK'),
      `a secret straddling the quoted end of what ${what} printed left ${JSON.stringify(cause.slice(0, 400))}`,
    );
  }

  // The host decodes the channel as one stream: a call whose bytes are cut inside a character is read whole.
  const input = new PassThrough();
  const output = new PassThrough();
  let written = '';
  output.setEncoding('utf8');
  output.on('data', (chunk) => {
    written += chunk;
  });
  serveHttpProbePort(
    {
      createHttpProbePort: () => ({ probe: async (probed) => ({ echoed: probed.channels.query.text }) }),
      nodeTransport: { send: async () => {} },
    },
    { input, output, env: { TEA_EVALUATE_HTTP_PORT_HOST: '1' } },
  );
  const text = 'é€😀';
  const bytes = Buffer.from(
    `${JSON.stringify({ type: 'call', configuration: {}, launched: false, request: { channels: { query: { text } } } })}\n`,
  );
  const cut = bytes.indexOf(Buffer.from('😀')) + 2;
  input.write(bytes.subarray(0, cut));
  await new Promise((resolve) => setImmediate(resolve));
  input.write(bytes.subarray(cut));
  await eventually(() => written.includes('\n'));
  const echoed = written.includes('\n') ? JSON.parse(written.split('\n')[0])?.observation?.echoed : undefined;
  check(echoed === text, `a call cut inside a character was read as ${JSON.stringify(echoed)}; expected ${JSON.stringify(text)}`);
}

// ---------------------------------------------------------------- the scrub in every letter case

/**
 * The letter cases a normalizer gives an echoed value: a server that shouts a field, a proxy that lowercases a URL,
 * a header normalizer that capitalizes each word, and a mix.
 */
const LETTER_CASES = {
  original: (text) => text,
  lowercased: (text) => text.toLowerCase(),
  uppercased: (text) => text.toUpperCase(),
  capitalized: (text) =>
    text.toLowerCase().replaceAll(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, before, letter) => `${before}${letter.toUpperCase()}`),
  'Turkish upper-cased': (text) => text.toLocaleUpperCase('tr'),
  'Turkish lowercased': (text) => text.toLocaleLowerCase('tr'),
  'Turkish capitalized': (text) =>
    text
      .toLocaleLowerCase('tr')
      .replaceAll(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, before, letter) => `${before}${letter.toLocaleUpperCase('tr')}`),
  alternating: (text) =>
    [...text].map((character, index) => (index % 2 === 0 ? character.toUpperCase() : character.toLowerCase())).join(''),
};

/** `text` as a JSON string body, as Python's `ensure_ascii` (every non-ASCII unit as `\uXXXX`, in lower- or upper-case hex), and with `/` written `\/` (PHP). */
const asciiEscaped = (text, upper) =>
  JSON.stringify(text)
    .slice(1, -1)
    .replaceAll(/[^ -~]/g, (unit) => {
      const hex = unit.codePointAt(0).toString(16).padStart(4, '0');
      return `\\u${upper ? hex.toUpperCase() : hex}`;
    });
/** The byte formats an echo reaches a record in, each derived from the echoed text alone. */
const BYTE_FORMATS = {
  plain: (text) => text,
  'a JSON string body': (text) => JSON.stringify(text).slice(1, -1),
  'ASCII-escaped, lower-case hex': (text) => asciiEscaped(text, false),
  'ASCII-escaped, upper-case hex': (text) => asciiEscaped(text, true),
  '<, > and & written \\u003c, \\u003e and \\u0026 (Go)': (text) =>
    JSON.stringify(text)
      .slice(1, -1)
      .replaceAll(/[<>&]/g, (unit) => `\\u00${unit.codePointAt(0).toString(16)}`),
  'slashes written \\/': (text) =>
    JSON.stringify(text)
      .slice(1, -1)
      .replaceAll('/', String.raw`\/`),
  'two levels of a JSON string body': (text) => JSON.stringify(JSON.stringify(text).slice(1, -1)).slice(1, -1),
  'ASCII-escaped at the second of two levels': (text) => asciiEscaped(JSON.stringify(text).slice(1, -1), true),
};
/** The formats that write a letter beyond ASCII as `\uXXXX`. */
const ESCAPES_LETTERS = (format) => format.includes('ASCII-escaped');

/** Secrets that differ in every input the scrub derives from: metacharacters, a case mapping that changes length, a dotted capital I, a lone surrogate, a letter outside the BMP, a base64 value. */
const LETTER_SECRETS = [
  'grader-secret-value-0123',
  'Grader-MixedCase-Secret-0123',
  String.raw`a.b*c+d?e^f$g{h}(i)|j[k]\l-m/n<o>&p`,
  'straße-Secret-ünï-0123',
  'İstanbul-Key-0123',
  'lone-\uD83D-surrogate-0123',
  'tok-𐐨𐐀-secret-0123',
  'Aw+/Zx9=Base64+Token/Value==',
  'Grader-INDEX-index-0123',
  'ΣΟΦΟΣ-Token-ΑΣ-Ὀδυσσεύς-0123',
  'admin-index-token',
  'İİ-key-token-01',
  'münich-key-0123',
  'key-token-value-𐐨',
];

/**
 * Whether an echo holds a letter beyond ASCII in a case of its own: not the secret as it was sent, nor its lower, upper or
 * Turkish case alone (Turkish capitals turn the `i` of an ASCII secret into `İ` word by word). A serializer that then writes
 * that letter as `\\uXXXX` has other hex digits than any whole-text case gives; Story 1.74 closes that corner.
 */
const unevenBeyondAscii = (secret, echo) =>
  [...echo].some((character) => character.codePointAt(0) > 0x7f) &&
  ![secret, secret.toLowerCase(), secret.toUpperCase(), secret.toLocaleLowerCase('tr'), secret.toLocaleUpperCase('tr')].includes(echo);

/** A fake port that answers every request with `answer`, as the grader's HTTP port does. */
const answering = (answer) => ({ probe: async (request) => ({ ...request, kind: 'api', ...answer }) });
const API_REQUEST = { probeId: 'x', interfaceId: 'grader', operationId: 'grade-answer', kind: 'api' };
const SCRUBBED_TEXT = '[redacted]';

/** What a grader that echoes `echo` answers: in a header, a body field inside other text, a nested array and a key. */
const echoingAnswer = (echo, key = echo) => ({
  status: 200,
  headers: { 'x-echo': echo, 'x-plain': 'ordinary' },
  body: {
    kind: 'json',
    value: { field: `before ${echo} after`, nested: [{ again: 'ordinary' }, { again: echo }], [key]: 'as a key', plain: 'ordinary text' },
  },
});

/**
 * An echoed auth value is scrubbed whatever letter case it comes back in (Story 1.66): the observation, a fault's
 * message and a fault's cause scrub with one set, a value under the minimum length stays in every case, and ordinary
 * text that merely resembles a secret stays.
 */
async function checkLetterCases() {
  const { scrub, scrubCutText, secretForms, quotedCapture } = require('../cli/lib/evaluate/arm');
  const registryOf = (...secrets) => ({ apiSecrets: () => secrets });
  const probe = (answer, ...secrets) =>
    hostEnvironmentPort({ port: answering(answer), registry: registryOf(...secrets) }).probe(API_REQUEST);
  const failure = async (build, ...secrets) => {
    const fault = build();
    const port = {
      probe: async () => {
        throw fault;
      },
    };
    return hostEnvironmentPort({ port, registry: registryOf(...secrets) })
      .probe(API_REQUEST)
      .catch((error) => error);
  };

  for (const secret of LETTER_SECRETS) {
    const label = JSON.stringify(secret);
    for (const [caseName, change] of Object.entries(LETTER_CASES)) {
      const echo = change(secret);
      // The observation: a header, a body field, a nested element and a key, each holding the echo.
      const { observation } = await probe(echoingAnswer(echo), secret);
      const expected = { ...API_REQUEST, kind: 'api', ...echoingAnswer(SCRUBBED_TEXT) };
      check(
        JSON.stringify(observation) === JSON.stringify(expected),
        `${label} echoed ${caseName} (${JSON.stringify(echo)}) left ${JSON.stringify(observation)}; expected ${JSON.stringify(expected)}`,
      );
      // Each byte format of the echo, in a text body: one record per format, so a later format is not judged by the first.
      // An echo with a letter beyond ASCII in a case of its own (a word capitalized, every other letter shifted) that the
      // serializer then writes as `\uXXXX` has other hex digits than any whole-secret case gives (`\u00fc`, `\u00dc`):
      // Story 1.74 closes that corner, so the escaped formats are tried here for the cases that change every letter alike.
      const unevenAndEscaped = unevenBeyondAscii(secret, echo);
      for (const [format, write] of Object.entries(BYTE_FORMATS)) {
        if (unevenAndEscaped && ESCAPES_LETTERS(format)) continue;
        const written = write(echo);
        // In the middle of a text, at its end and at its start, so a span that ends on the last character is read too.
        for (const [where, around] of [
          ['in the middle', (text) => `pre ${text} post`],
          ['at the end', (text) => `pre ${text}`],
          ['at the start', (text) => `${text} post`],
        ]) {
          const { observation: sent } = await probe({ status: 200, headers: {}, body: { kind: 'text', value: around(written) } }, secret);
          check(
            sent.body?.value === around(SCRUBBED_TEXT),
            `${label} echoed ${caseName} as ${format} (${JSON.stringify(written)}) ${where} of a text left ${JSON.stringify(sent.body?.value)}`,
          );
        }
      }
      // The fault path: the message, the cause and the text a process printed, with the secret in the same case, and a
      // leading part of it the printed text's end cut off.
      const printed = `${'a'.repeat(100)}${echo}${'b'.repeat(20)}`;
      const cutOff = `${'a'.repeat(100)}${[...echo].slice(0, 9).join('')}`;
      const faulted = await failure(
        () =>
          Object.assign(new Error(`denied ${echo} for the call`), {
            code: 'forbidden-target',
            captured: printed,
            cause: Object.assign(new Error(`cause ${echo} ended`), { captured: cutOff }),
          }),
        secret,
      );
      check(
        faulted.message === `denied ${SCRUBBED_TEXT} for the call: ${'a'.repeat(100)}${SCRUBBED_TEXT}${'b'.repeat(20)}` &&
          faulted.scrubbedCause === `cause ${SCRUBBED_TEXT} ended: ${'a'.repeat(100)}${SCRUBBED_TEXT}`,
        `a fault quoting ${label} ${caseName} left the message ${JSON.stringify(faulted?.message)} and the cause ${JSON.stringify(faulted?.scrubbedCause)}`,
      );
    }
    // A key, whatever its case: three keys that scrub to one name are numbered, the others keep theirs.
    const keys = Object.values(LETTER_CASES).map((change) => change(secret));
    const distinct = [...new Set(keys)];
    const { observation: keyed } = await probe(
      {
        status: 200,
        headers: {},
        body: { kind: 'json', value: Object.fromEntries([...distinct.map((key, index) => [key, index]), ['plain', 'x']]) },
      },
      secret,
    );
    const numbered = [...distinct.keys()].map((index) => (index === 0 ? SCRUBBED_TEXT : `${SCRUBBED_TEXT}-${index + 1}`));
    check(
      JSON.stringify(Object.keys(keyed.body?.value ?? {})) === JSON.stringify([...numbered, 'plain']),
      `${label} as ${distinct.length} object keys in different cases gave ${JSON.stringify(Object.keys(keyed.body?.value ?? {}))}`,
    );
  }

  // One port holds every secret above, an ASCII decoy first: a value that is not first in its set, a letter beyond ASCII
  // included, is scrubbed in every case as it is when it stands alone.
  const answered = { current: null };
  const crowded = hostEnvironmentPort({
    port: { probe: async (request) => ({ ...request, kind: 'api', ...answered.current }) },
    registry: registryOf('decoy-first-secret-99', ...LETTER_SECRETS),
  });
  for (const secret of LETTER_SECRETS) {
    for (const [caseName, change] of Object.entries(LETTER_CASES)) {
      const echo = change(secret);
      answered.current = echoingAnswer(echo);
      const { observation: shared } = await crowded.probe(API_REQUEST);
      check(
        JSON.stringify(shared) === JSON.stringify({ ...API_REQUEST, kind: 'api', ...echoingAnswer(SCRUBBED_TEXT) }),
        `${JSON.stringify(secret)} echoed ${caseName} among ${LETTER_SECRETS.length + 1} secrets on one port left ${JSON.stringify(shared)}`,
      );
      const uneven = unevenBeyondAscii(secret, echo);
      for (const [format, write] of Object.entries(BYTE_FORMATS)) {
        if (uneven && ESCAPES_LETTERS(format)) continue;
        answered.current = { status: 200, headers: {}, body: { kind: 'text', value: `pre ${write(echo)} post` } };
        const { observation: sent } = await crowded.probe(API_REQUEST);
        check(
          sent.body?.value === `pre ${SCRUBBED_TEXT} post`,
          `${JSON.stringify(secret)} echoed ${caseName} as ${format} among ${LETTER_SECRETS.length + 1} secrets on one port left ${JSON.stringify(sent.body?.value)}`,
        );
      }
    }
  }

  // A value under the minimum length stays in every case, in every byte format; one of the minimum length does not.
  const SHORT = ['sevench', 'sh/rt-7', 'ünï-7ab'];
  const BOUNDARY = 'eightchr';
  check(
    SHORT.every((short) => short.length === 7) && BOUNDARY.length === 8,
    'the short values are not seven characters or the boundary value not eight',
  );
  for (const [caseName, change] of Object.entries(LETTER_CASES)) {
    const bodies = [];
    for (const short of SHORT) for (const write of Object.values(BYTE_FORMATS)) bodies.push(write(change(short)));
    const answer = {
      status: 200,
      headers: { 'x-short': change(SHORT[0]) },
      body: { kind: 'json', value: { shorts: bodies, [change(SHORT[1])]: 'a key', boundary: change(BOUNDARY), number: 1_234_567 } },
    };
    const { observation } = await probe(answer, ...SHORT, BOUNDARY);
    const expected = {
      ...API_REQUEST,
      kind: 'api',
      ...answer,
      body: { kind: 'json', value: { ...answer.body.value, boundary: SCRUBBED_TEXT } },
    };
    check(
      JSON.stringify(observation) === JSON.stringify(expected),
      `a seven-character value echoed ${caseName} was scrubbed, or the eight-character one was not: ${JSON.stringify(observation)}`,
    );
    const faulted = await failure(
      () => Object.assign(new Error(`seen ${change(SHORT[0])} and ${change(BOUNDARY)}`), { cause: new Error(`cause ${change(SHORT[2])}`) }),
      ...SHORT,
      BOUNDARY,
    );
    check(
      faulted.message === `seen ${change(SHORT[0])} and ${SCRUBBED_TEXT}` && faulted.scrubbedCause === `cause ${change(SHORT[2])}`,
      `a fault quoting a seven-character value ${caseName} gave ${JSON.stringify(faulted?.message)} and ${JSON.stringify(faulted?.scrubbedCause)}`,
    );
  }

  // Text that merely resembles a secret stays: a value that differs in one character, spaces for dashes, a leading part
  // of it (no cut text ends an observation), the secret's characters in another order, and a pattern's metacharacters.
  const [plainSecret, , metaSecret, sharpSecret] = LETTER_SECRETS;
  const resembling = [
    'GRADER-SECRET-VALUE-0124',
    'grader secret value 0123',
    'GRADER-SECRET-VALUE',
    'xgrader-secret-value-012',
    'GRADER-SECRET-0123-VALUE',
    'STRASSE-SECRET-ÜNÏ-0124',
    'a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p',
    'axb c d e f g h i j k l m n o p',
    String.raw`a.b*c+d?e^f$g{h}(i)|j[k]\l-m/n<o>&`,
    'v1x2x3-rcx1',
    'a|b|c',
  ];
  const { observation: resembled } = await probe(
    { status: 200, headers: { 'x-text': resembling[0] }, body: { kind: 'json', value: resembling } },
    plainSecret,
    metaSecret,
    sharpSecret,
    'v1.2.3-rc.1',
    'a|b|c|d|e|f',
  );
  check(
    JSON.stringify(resembled.body?.value) === JSON.stringify(resembling) && resembled.headers['x-text'] === resembling[0],
    `text that merely resembles a secret came back ${JSON.stringify(resembled.body?.value)}`,
  );

  // Two secret sets on one port: each call is scrubbed with its own interface's secrets and not with another's.
  const twoSets = hostEnvironmentPort({
    port: {
      probe: async (request) => ({
        ...request,
        kind: 'api',
        status: 200,
        headers: {},
        body: { kind: 'text', value: `${'FIRST-SET-VALUE-1'} ${'second-set-value-2'}` },
      }),
    },
    registry: { apiSecrets: (interfaceId) => (interfaceId === 'first' ? ['first-set-value-1'] : ['SECOND-SET-VALUE-2']) },
  });
  const asFirst = await twoSets.probe({ ...API_REQUEST, interfaceId: 'first' });
  const asSecond = await twoSets.probe({ ...API_REQUEST, interfaceId: 'second' });
  const asFirstAgain = await twoSets.probe({ ...API_REQUEST, interfaceId: 'first' });
  check(
    asFirst.observation.body.value === `${SCRUBBED_TEXT} second-set-value-2` &&
      asSecond.observation.body.value === `FIRST-SET-VALUE-1 ${SCRUBBED_TEXT}` &&
      asFirstAgain.observation.body.value === asFirst.observation.body.value,
    `two secret sets on one port gave ${JSON.stringify([asFirst, asSecond, asFirstAgain].map((answer) => answer.observation.body.value))}`,
  );

  // Sets that share a value, or differ only in how a comma splits their values, are told apart whole: a key built from part of
  // the values would give one set the other's forms.
  const shared = 'shared-server-value-1';
  const sets = {
    a: [shared, 'first-auth-token-AAAA'],
    b: [shared, 'second-auth-token-BBBB'],
    e: ['first-auth-token-AAAA', shared],
    f: ['second-auth-token-BBBB', shared],
    c: ['abcdefgh,ijklmnop'],
    d: ['abcdefgh', 'ijklmnop'],
  };
  const echoes = {
    a: ['SHARED-SERVER-VALUE-1 FIRST-AUTH-TOKEN-AAAA SECOND-AUTH-TOKEN-BBBB', `${SCRUBBED_TEXT} ${SCRUBBED_TEXT} SECOND-AUTH-TOKEN-BBBB`],
    b: ['SHARED-SERVER-VALUE-1 FIRST-AUTH-TOKEN-AAAA SECOND-AUTH-TOKEN-BBBB', `${SCRUBBED_TEXT} FIRST-AUTH-TOKEN-AAAA ${SCRUBBED_TEXT}`],
    e: ['SHARED-SERVER-VALUE-1 FIRST-AUTH-TOKEN-AAAA SECOND-AUTH-TOKEN-BBBB', `${SCRUBBED_TEXT} ${SCRUBBED_TEXT} SECOND-AUTH-TOKEN-BBBB`],
    f: ['SHARED-SERVER-VALUE-1 FIRST-AUTH-TOKEN-AAAA SECOND-AUTH-TOKEN-BBBB', `${SCRUBBED_TEXT} FIRST-AUTH-TOKEN-AAAA ${SCRUBBED_TEXT}`],
    c: ['ABCDEFGH,IJKLMNOP and ABCDEFGH and IJKLMNOP', `${SCRUBBED_TEXT} and ABCDEFGH and IJKLMNOP`],
    d: ['ABCDEFGH,IJKLMNOP and ABCDEFGH and IJKLMNOP', `${SCRUBBED_TEXT},${SCRUBBED_TEXT} and ${SCRUBBED_TEXT} and ${SCRUBBED_TEXT}`],
  };
  for (const order of [
    ['a', 'b', 'a'],
    ['b', 'a', 'b'],
    ['e', 'f', 'e'],
    ['f', 'e', 'f'],
    ['c', 'd', 'c'],
    ['d', 'c', 'd'],
  ]) {
    let current = null;
    const port = hostEnvironmentPort({
      port: {
        probe: async (request) => ({ ...request, kind: 'api', status: 200, headers: {}, body: { kind: 'text', value: current } }),
      },
      registry: { apiSecrets: (interfaceId) => sets[interfaceId] },
    });
    const gave = [];
    for (const id of order) {
      current = echoes[id][0];
      gave.push([id, (await port.probe({ ...API_REQUEST, interfaceId: id })).observation.body.value]);
    }
    check(
      gave.every(([id, value]) => value === echoes[id][1]),
      `secret sets visited in the order ${order.join(', ')} on one port gave ${JSON.stringify(gave)}`,
    );
  }

  // A cut text: a leading part of a secret, four characters or more, at the end, in any case; shorter ones and ones that are
  // not at the end stay; the longest cut wins whichever secret it leads.
  const forms = secretForms(['grader-secret-value-0123', 'Second-Token-Value-4567']);
  const cuts = [
    ['log line GRADER-SECRET-VA', 'log line [redacted]'],
    ['log line Grader-Secret-Value-012', 'log line [redacted]'],
    ['log line gRaDeR-sE', 'log line [redacted]'],
    ['log line GRAD', 'log line [redacted]'],
    ['log line GRA', 'log line GRA'],
    ['log line GRAD then more', 'log line GRAD then more'],
    ['log line SECOND-TOKEN-V', 'log line [redacted]'],
    ['log line second-', 'log line [redacted]'],
    ['log line GRADER-SECRET-VALUE-0123 tail', 'log line [redacted] tail'],
    ['GRADER-SECRET-VALUE-0123 and SECOND-TOK', '[redacted] and [redacted]'],
    ['Straße: GRADER-SE', 'Straße: [redacted]'],
    ['Straße ß Straße GRADER-SE', 'Straße ß Straße [redacted]'],
    ['İstanbul: Second-Tok', 'İstanbul: [redacted]'],
  ];
  for (const [text, expected] of cuts) {
    check(
      scrubCutText(text, forms) === expected,
      `the cut text ${JSON.stringify(text)} gave ${JSON.stringify(scrubCutText(text, forms))}; expected ${JSON.stringify(expected)}`,
    );
  }
  const astral = 'tok-𐐨𐐀-secret-0123';
  const astralForms = secretForms([astral]);
  for (const [name, change] of Object.entries(LETTER_CASES)) {
    const echoed = change(astral);
    // Every length of the leading part, in code units: a cut between a pair's surrogates leaves the first alone at the end.
    for (let units = 4; units < echoed.length; units += 1) {
      const text = `line ${echoed.slice(0, units)}`;
      check(
        scrubCutText(text, astralForms) === 'line [redacted]',
        `the cut text ${JSON.stringify(text)} (${name}, ${units} units of a secret with letters outside the BMP) gave ${JSON.stringify(scrubCutText(text, astralForms))}`,
      );
    }
  }
  const sharpForms = secretForms(['straße-secret']);
  for (const [text, expected] of [
    ['line STRASS', 'line [redacted]'],
    ['line StRaSsE-s', 'line [redacted]'],
    ['line STRAẞE-SEC', 'line [redacted]'],
    ['line STRA', 'line [redacted]'],
    ['line STR', 'line STR'],
  ]) {
    check(
      scrubCutText(text, sharpForms) === expected,
      `the cut text ${JSON.stringify(text)} gave ${JSON.stringify(scrubCutText(text, sharpForms))}; expected ${JSON.stringify(expected)}`,
    );
  }
  // A printed text is scrubbed whole before it is cut to its last 2000 characters, so the cut never splits a secret in another case.
  const straddling = quotedCapture(`xxxxx${'SECOND-token-value-4567'}${'y'.repeat(1990)}`, forms);
  check(
    straddling === `: ...${SCRUBBED_TEXT}${'y'.repeat(1990)}`,
    `a printed text whose cut falls inside a secret in another case was quoted as ${JSON.stringify(straddling.slice(0, 60))}`,
  );
  check(
    quotedCapture('some output') === ': some output' && quotedCapture(undefined, forms) === '',
    'quotedCapture changed for no secrets or no output',
  );

  // A number whose text holds a secret in another letter case: a secret of digits and `E`, read against the number's `e`.
  const exponent = secretForms(['3456789E+25']);
  check(
    scrub({ big: 1.234_567_89e25, other: 1.2345e25, list: [1, 2.5e30] }, exponent).big === SCRUBBED_TEXT &&
      scrub({ big: 1.234_567_89e25, other: 1.2345e25 }, exponent).other === 1.2345e25 &&
      JSON.stringify(scrub([1, 2.5e30], exponent)) === JSON.stringify([1, 2.5e30]),
    `a number holding 3456789E+25 gave ${JSON.stringify(scrub({ big: 1.234_567_89e25, other: 1.2345e25 }, exponent))}`,
  );
  // The same, over a hand-built array that holds the secret in the one case it was written in.
  check(
    scrub(1.234_567_89e25, ['3456789E+25']) === SCRUBBED_TEXT && scrub(1.2345e25, ['3456789E+25']) === 1.2345e25,
    'a number holding 3456789E+25 was not read against a secret written with an upper-case E',
  );
  const laterNumber = scrub([7, 8, { n: 9.876_543_21e22 }], secretForms(['7654321E+22']));
  check(
    laterNumber[2].n === SCRUBBED_TEXT && laterNumber[0] === 7,
    `a later number holding 7654321E+22 gave ${JSON.stringify(laterNumber)}`,
  );

  // A form that holds another is replaced whole, whichever of the two the array lists first.
  check(
    scrub('xx-ABCDEFGHIJ-xx', ['abcdefgh', 'abcdefghij']) === 'xx-[redacted]-xx' &&
      scrub('xx-ABCDEFGHIJ-xx', ['abcdefghij', 'abcdefgh']) === 'xx-[redacted]-xx',
    'a secret that holds another left its end in the text',
  );

  // `İ` lower-cases to `i` and a combining dot above, so an echo that spells it both ways (the capital, or `i` and the mark)
  // is one letter to the scrub: each spelling, mixed in one text, matches the secret written with a plain `i`.
  const dot = 'İ'.toLowerCase().slice(1);
  for (const [text, secret, expected] of [
    [`x i${dot}ndex-token-0001 y`, 'index-token-0001', 'x [redacted] y'],
    [`Admi${dot}n-İndex-Token`, 'admin-index-token', '[redacted]'],
    [`İi${dot}-kEy-tOkEn-01`, 'İİ-key-token-01', '[redacted]'],
    [`İ${dot}${dot}ndex-token-0001`, 'index-token-0001', '[redacted]'],
    [`line ${'a'.repeat(30)} Admi${dot}n-İndex-To`, 'admin-index-token', `line ${'a'.repeat(30)} [redacted]`],
    [`x ${`i${dot}`.repeat(8)}-ke`, 'iiiiiiii-key', 'x [redacted]'],
    // An `i` carries more dots than the stretch read has spare: the stretch widens by the dots it holds.
    [`line abcdefghi${dot.repeat(20)}`, 'abcdefghijklmnop', 'line [redacted]'],
    [`x ${`i${dot.repeat(7)}`.repeat(8)}-ke`, 'iiiiiiii-key', 'x [redacted]'],
    // A secret that opens with the dot is found after an `i` that absorbs it, and verbatim.
    [`ai${dot}abcdefgh`, `${dot}abcdefgh`, `ai${dot}[redacted]`],
    [`x ${dot}abcdefgh y`, `${dot}abcdefgh`, 'x [redacted] y'],
    // A remainder under the floor, or a form of dots alone, matches nothing: ordinary text stays.
    // The floor counts the remainder's units as written: eight, folding to seven.
    [`xi${dot}IfIİI${dot}bIy`, `${dot}IfIİI${dot}bI`, `xi${dot}[redacted]y`],
    ['abcdefgh abcdefg a aaa', `${dot.repeat(7)}a`, 'abcdefgh abcdefg a aaa'],
    ['abcdefgh a aaa', dot.repeat(8), 'abcdefgh a aaa'],
  ]) {
    const done =
      text.startsWith('line ') || text.endsWith('-ke') ? scrubCutText(text, secretForms([secret])) : scrub(text, secretForms([secret]));
    check(
      done === expected,
      `${JSON.stringify(text)} against ${JSON.stringify(secret)} gave ${JSON.stringify(done)}; expected ${JSON.stringify(expected)}`,
    );
  }

  // A megabyte of combining dots widens the stretch read to the whole text; it still scrubs in well under the bound.
  const dots = performance.now();
  scrubCutText(dot.repeat(1_000_000), secretForms(['abcdefghijklmnop']));
  scrubCutText('ordinary text line\n'.repeat(55_000), secretForms(['abcdefghijklmnop']));
  check(performance.now() - dots < 5000, `a megabyte of combining dots took ${Math.round(performance.now() - dots)} ms to cut-scrub`);

  // Secrets that overlap in the text are replaced as one: the leftmost does not leave the rest of the longer one behind.
  for (const secrets of [
    ['abcdefgh', 'cdefghijklmnop'],
    ['cdefghijklmnop', 'abcdefgh'],
  ]) {
    check(
      scrub('xx ABCDEFGHIJKLMNOP yy', secrets) === 'xx [redacted] yy' &&
        scrub('xx abcdefghijklmnop yy', secretForms(secrets)) === 'xx [redacted] yy',
      `overlapping secrets ${JSON.stringify(secrets)} left ${JSON.stringify(scrub('xx ABCDEFGHIJKLMNOP yy', secrets))}`,
    );
  }
  // Two secrets that meet inside one character a fold expands (`ß` is `ss`, the Greek iota with a diaeresis and a tonos is three
  // units) are one run: no character of either survives.
  const accent = '\u0308\u0301';
  for (const [text, secrets] of [
    ['abcdefgßxyzwvut', ['abcdefgs', 'sxyzwvut']],
    ['zzzzzzzßqqqqqqqqq', ['zzzzzzzs', 'sqqqqqqqqq']],
    ['sabcdefgßabcdefgs', ['sabcdefgs']],
    ['ABCDEFGSSXYZWVUT', ['abcdefgß', 'ßxyzwvut']],
    [`abcdefgΐxyzwvut`, ['abcdefgι', `${accent}xyzwvut`]],
  ]) {
    check(
      scrub(text, secretForms(secrets)) === SCRUBBED_TEXT,
      `secrets ${JSON.stringify(secrets)} meeting inside a character left ${JSON.stringify(scrub(text, secretForms(secrets)))} of ${JSON.stringify(text)}`,
    );
  }
  check(
    scrub('abcdefghABCDEFGH', ['abcdefgh']) === '[redacted][redacted]' &&
      scrub('ß-straße-secret', secretForms(['STRASSE-SECRET'])) === 'ß-[redacted]',
    'two secrets side by side were merged, or a length-changing fold shifted the replaced span',
  );

  // A large secret scrubs and cuts without a pattern the engine cannot compile: a credential file with characters a serializer
  // escapes, a long plain token and a very long one, on the success path and on a fault, which keeps its own message.
  const credential = JSON.stringify({
    type: 'service_account',
    private_key: `-----BEGIN-----\n${'MIIEvQ+/='.repeat(150)}\n-----END-----`,
    note: 'Ü<&>/é',
  });
  const longToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9xYz_-'.repeat(60);
  const veryLong = 'AbCdEfGhIj'.repeat(6000);
  for (const [what, secret] of [
    ['a credential file', credential],
    ['a 2,520-character token', longToken],
    ['a 60,000-character secret', veryLong],
  ]) {
    const started = Date.now();
    const { observation: large } = await probe(
      { status: 200, headers: { 'x-echo': secret.toUpperCase() }, body: { kind: 'text', value: `pre ${secret.toLowerCase()} post` } },
      secret,
    );
    const fault = await failure(
      () =>
        Object.assign(new Error('server would not start'), {
          cause: Object.assign(new Error(`cause ${secret.toUpperCase()}`), {
            captured: `${'a'.repeat(50)}${secret.slice(0, 1000).toLowerCase()}`,
          }),
        }),
      secret,
    );
    check(
      large.headers['x-echo'] === SCRUBBED_TEXT &&
        large.body.value === `pre ${SCRUBBED_TEXT} post` &&
        fault.message === 'server would not start' &&
        fault.scrubbedCause === `cause ${SCRUBBED_TEXT}: ${'a'.repeat(50)}${SCRUBBED_TEXT}`,
      `${what} was not scrubbed whole: ${JSON.stringify(large.body?.value?.slice(0, 40))}, ${JSON.stringify(fault?.message?.slice(0, 80))}, ${JSON.stringify(fault?.scrubbedCause?.slice(0, 80))}`,
    );
    check(Date.now() - started < 20_000, `scrubbing ${what} took ${Date.now() - started} ms`);
  }
  check(
    Object.isFrozen(secretForms(['abcdefgh'])),
    'secretForms gave an array that can change after the matching compiled from it was kept with it',
  );

  // The forms stay a plain array of strings, longest first, and a form that is empty matches nothing.
  const listed = secretForms(['grader-secret-value-0123']);
  check(
    Array.isArray(listed) &&
      listed.every((form) => typeof form === 'string') &&
      listed.every((form, index) => index === 0 || listed[index - 1].length >= form.length) &&
      listed.includes('grader-secret-value-0123') &&
      listed.includes('GRADER-SECRET-VALUE-0123'),
    `secretForms gave ${JSON.stringify(listed)}`,
  );
  // The order holds where the forms differ in length: the escaped forms of this secret are longer than its plain ones.
  const unequal = secretForms(['straße-Secret-ünï-0123']);
  check(
    unequal.every((form, index) => index === 0 || unequal[index - 1].length >= form.length) && unequal[0].length > unequal.at(-1).length,
    `secretForms of a secret with escapable letters is not longest first: ${JSON.stringify(unequal.map((form) => form.length))}`,
  );
  check(
    scrub('abcdef', ['', 'cd']) === 'ab[redacted]ef' && scrub('abcdef', ['']) === 'abcdef' && scrub('abc', []) === 'abc',
    'an empty form scrubbed ordinary text',
  );
}

/** A serializer must not expose a secret whose individual letters changed case before escaping. */
async function checkUnevenEscapedCases() {
  const { scrub, scrubCutText, secretForms, escapedPatternSize } = require('../cli/lib/evaluate/arm');
  const registry = (secret) => ({ apiSecrets: () => [secret] });
  const probe = (answer, secret) => hostEnvironmentPort({ port: answering(answer), registry: registry(secret) }).probe(API_REQUEST);
  const failure = async (fault, secret) =>
    hostEnvironmentPort({
      port: {
        probe: async () => {
          throw fault;
        },
      },
      registry: registry(secret),
    })
      .probe(API_REQUEST)
      .catch((error) => error);
  const secrets = ['münich-κόσμος-ключ-𐐨-0123', 'admin-index-token', 'straße-Secret-ünï-0123'];
  const formats = [
    ['one level, lower hex', (text) => asciiEscaped(text, false)],
    ['one level, upper hex', (text) => asciiEscaped(text, true)],
    ['two levels, lower hex', (text) => JSON.stringify(asciiEscaped(text, false)).slice(1, -1)],
    ['two levels, upper hex', (text) => JSON.stringify(asciiEscaped(text, true)).slice(1, -1)],
    ['escaped at the second level', (text) => asciiEscaped(JSON.stringify(text).slice(1, -1), true)],
  ];
  for (const secret of secrets) {
    for (const [caseName, change] of [
      ['capitalized', LETTER_CASES.capitalized],
      ['alternating', LETTER_CASES.alternating],
      ['Turkish capitalized', LETTER_CASES['Turkish capitalized']],
    ]) {
      const echo = change(secret);
      for (const [format, write] of formats) {
        const written = write(echo);
        const { observation } = await probe(echoingAnswer(written), secret);
        const expected = { ...API_REQUEST, kind: 'api', ...echoingAnswer(SCRUBBED_TEXT) };
        check(
          JSON.stringify(observation) === JSON.stringify(expected),
          `${secret} ${caseName} ${format} leaked in the observation: ${JSON.stringify(observation)}`,
        );
        const cut = written.slice(0, Math.max(4, written.indexOf(String.raw`\u`) + 4));
        const fault = Object.assign(new Error(`denied ${written}`), {
          code: 'forbidden-target',
          captured: `printed ${cut}`,
          cause: Object.assign(new Error(`cause ${written}`), { captured: `printed ${cut}` }),
        });
        const faulted = await failure(fault, secret);
        check(
          faulted.code === 'forbidden-target' &&
            faulted.message === `denied ${SCRUBBED_TEXT}: printed ${SCRUBBED_TEXT}` &&
            faulted.scrubbedCause === `cause ${SCRUBBED_TEXT}: printed ${SCRUBBED_TEXT}`,
          `${secret} ${caseName} ${format} leaked in a fault: ${JSON.stringify([faulted.message, faulted.scrubbedCause])}`,
        );
        check(
          scrubCutText(`printed ${cut}`, secretForms([secret])) === `printed ${SCRUBBED_TEXT}`,
          `${secret} ${format} leaked a cut escape`,
        );
        check(
          scrubCutText(`printed ${written.slice(0, 3)}`, secretForms([secret])) === `printed ${written.slice(0, 3)}`,
          `${secret} ${format} scrubbed a three-character prefix`,
        );
      }
    }
  }
  const kelvinSecret = 'key-ü-ö-token';
  const kelvinEcho = String.raw`Key-\u00dc-\u00f6-token`;
  const { observation: kelvinObservation } = await probe(echoingAnswer(kelvinEcho), kelvinSecret);
  check(
    JSON.stringify(kelvinObservation) === JSON.stringify({ ...API_REQUEST, kind: 'api', ...echoingAnswer(SCRUBBED_TEXT) }),
    `a case-fold equivalent in an escaped echo leaked: ${JSON.stringify(kelvinObservation)}`,
  );
  check(
    scrub(String.raw`üüüüüüüü\u00fc`, secretForms(['üüüüüüüü'])) === SCRUBBED_TEXT,
    'an escaped match overlapping a raw match left its suffix visible',
  );
  const slashes = '\\'.repeat(16);
  const nearStart = performance.now();
  check(
    scrub(`${slashes}${slashes}X`, secretForms([`${slashes}Y`])) === `${slashes}${slashes}X`,
    'an ambiguous near-match changed ordinary text',
  );
  check(performance.now() - nearStart < 5000, 'an ambiguous near-match took over five seconds');
  const longNearSecret = `${'a'.repeat(9600)}ü`;
  const longNearText = `${'a'.repeat(19_200)}\\u00ff`;
  const longNearStart = performance.now();
  let longNearRefusal;
  try {
    scrub(longNearText, secretForms([longNearSecret]));
  } catch (error) {
    longNearRefusal = error;
  }
  check(
    longNearRefusal?.message === 'Escaped secret matching exceeded its work limit' && performance.now() - longNearStart < 5000,
    `a hostile long near-match did not fail closed in time: ${String(longNearRefusal?.message)}`,
  );
  const longSecret = 'münich'.repeat(90);
  const longEcho = asciiEscaped(LETTER_CASES.alternating(longSecret), true);
  check(
    scrub(`before ${longEcho} after`, secretForms([longSecret])) === `before ${SCRUBBED_TEXT} after`,
    'a long uneven escaped echo leaked',
  );
  const letters = [...'üκόσμοςключ𐐨'];
  const forty = Array.from({ length: 40 }, (_, index) => letters[index % letters.length]).join('');
  check(
    [...forty].length === 40 && [...forty].every((letter) => letter.codePointAt(0) > 0x7f && /\p{L}/u.test(letter)),
    'the bound fixture is not forty non-ASCII letters',
  );
  const patternSize = escapedPatternSize(secretForms([forty]));
  check(patternSize < 120_000, `forty letters made ${patternSize} pattern characters`);
  check(require('../cli/lib/evaluate/arm').matcherFor === undefined, 'the mutable cached matcher is exported');
  const ordinary = 'ordinary evidence '.repeat(65_536);
  const started = performance.now();
  check(scrub(ordinary, secretForms([forty])) === ordinary, 'the ordinary megabyte changed');
  check(performance.now() - started < 5000, 'scrubbing a megabyte took over five seconds');
  const slashOrdinary = [`\\${'a'.repeat(1_048_575)}`, `${'a'.repeat(1_048_575)}\\`, 'a\\'.repeat(524_288)];
  for (const text of slashOrdinary) {
    const startedAt = performance.now();
    const { observation } = await probe({ status: 200, headers: {}, body: { kind: 'text', value: text } }, 'admin-index-token');
    check(observation.body.value === text, 'ordinary evidence with a backslash was refused or changed');
    check(performance.now() - startedAt < 5000, 'ordinary evidence with a backslash took over five seconds');
  }
  const reference = fs.readFileSync(path.join(__dirname, '../docs/reference/tea-evaluate-cli.md'), 'utf8');
  const httpSection = reference.split('## The registry')[1]?.split('\n## ')[0] ?? '';
  check(
    httpSection.includes('uneven capitalization') && httpSection.includes(String.raw`\u0130`),
    'the HTTP reference does not describe unevenly cased escapes',
  );
  check(!httpSection.includes('is not replaced, since the escape digits'), 'the HTTP reference still states the old escaped-case limit');
}

// ---------------------------------------------------------------- the pipeline

async function checkPipeline() {
  const project = makeProject('pipeline');
  const env = { ...project.env, GRADER_SECRET: SECRET, GRADER_TOKEN: TOKEN };
  const checked = evaluate(['check', '--evaluation', project.folder], env);
  check(checked.status === 0, `check over the HTTP fixture exited ${checked.status}; expected 0\n${checked.output}`);
  const contract = readJson(path.join(project.folder, 'contract.json'));
  check(
    contract.permittedInterfaces.every((iface) => iface.kind === 'api'),
    `the fixture's contract declares ${JSON.stringify(contract.permittedInterfaces.map((iface) => iface.kind))}`,
  );

  const preflight = evaluate(['preflight', '--evaluation', project.folder], env);
  check(preflight.status === 0, `preflight over the HTTP fixture exited ${preflight.status}; expected 0\n${preflight.output}`);
  const preflightRun = runDirectoryOf(project.folder);
  const observed = preflightRun === null ? null : path.join(preflightRun, 'observations');
  if (observed !== null && fs.existsSync(observed)) {
    const legs = fs.readdirSync(observed).map((name) => readJson(path.join(observed, name)));
    check(legs.length >= 4, `preflight recorded ${legs.length} leg(s)`);
    check(
      legs.every(
        (leg) =>
          leg.observation.kind === 'api' &&
          leg.request.kind === 'api' &&
          leg.request.pathTemplate === '/grade' &&
          leg.observation.status === 200 &&
          leg.observation.body.kind === 'json' &&
          typeof leg.observation.body.value.verdict === 'string',
      ),
      `a preflight leg is not an HTTP request answered in JSON: ${JSON.stringify(legs.map((leg) => leg.observation))}`,
    );
    const manifest = legs.find((leg) => leg.legId === 'manifest-lenient');
    check(
      manifest?.workspace === 'mutated:M-001' && manifest.observation.body.value.verdict === 'rejected',
      `the manifestation witness ran as ${JSON.stringify(manifest)}`,
    );
    check(!fs.existsSync(path.join(preflightRun, 'faults')), 'a preflight leg over the HTTP fixture was denied or failed');
  } else {
    check(false, 'preflight over the HTTP fixture recorded no leg');
  }

  fs.rmSync(project.log, { force: true });
  const ran = evaluate(['run', '--evaluation', project.folder], env);
  check(ran.status === 0, `run over the HTTP fixture exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (!checkSealed('the HTTP run', ran, runDirectory)) return;
  for (const [probeId, verdict] of [
    ['P-001', 'accepted'],
    ['P-002', 'rejected'],
  ]) {
    const records = recordsOf(runDirectory, probeId);
    check(records.length === TRIALS, `${probeId}'s trial set holds ${records.length} records; expected ${TRIALS}`);
    for (const record of records) {
      const [observation] = record.observations;
      check(
        record.observations.length === 1 &&
          observation.provenance === 'evaluator-chosen' &&
          observation.operationId === 'grade-answer' &&
          JSON.stringify(observation.callInputs.query) === JSON.stringify({ answer: 'forty-two' }) &&
          observation.callInputs.arguments === null &&
          observation.responseBody?.verdict === verdict &&
          observation.responseBody?.secret === '[redacted]' &&
          observation.responseStatus === 200 &&
          observation.responseHeaders?.['content-type'] === 'application/json' &&
          observation.exitCode === null,
        `${probeId} trial ${record.trialIndex} records ${JSON.stringify(record.observations)}`,
      );
    }
  }
  const [finding] = recordsOf(runDirectory, 'P-002')[0]?.findings ?? [];
  check(
    finding?.oracleId === 'O-001' &&
      finding.quotedEvidence[0].channel === 'response-body' &&
      finding.quotedEvidence[0].quote.includes('rejected'),
    `P-002's finding is ${JSON.stringify(finding)}`,
  );
  // Every service started in a runtime workspace, from the script the registry resolved into that same workspace, and
  // every request it answered carried the registry's auth header.
  const served = sessions(project);
  const starts = served.filter((line) => line.event === 'listen');
  const requests = served.filter((line) => line.event === 'request');
  check(
    starts.length > 0 &&
      starts.length === requests.length &&
      served.every((line) => line.workspace !== null && line.scriptWorkspace === line.workspace) &&
      requests.every((line) => line.authorized === true && line.path.startsWith('/grade?answer=')),
    `the service ran outside its workspace, answered more than once per start, or saw no auth header: ${JSON.stringify(served)}`,
  );
  check(livingSessions(project).length === 0, `a service outlived its call: ${JSON.stringify(livingSessions(project))}`);
  // The fixture's registry names portFileEnvironmentKey, so every service bound a port the system chose and reported it.
  check(
    starts.length > 0 && starts.every((line) => line.handoff === 'port-file'),
    `a service of the pipeline was started with the chosen-port handoff: ${JSON.stringify(starts)}`,
  );
  // The secret and the token reached no file of the project, the run directory included, and nothing the commands printed.
  const leaked = [
    ...filesUnder(project.root),
    { where: 'the preflight output', text: preflight.output },
    { where: 'the run output', text: ran.output },
  ].filter(({ text }) => text.includes(SECRET) || text.includes(TOKEN));
  check(leaked.length === 0, `the service's secret or token reached ${leaked.map(({ where }) => where).join(', ')}`);
  const manifest = readJson(path.join(runDirectory, 'trial-sets', 'P-002', 'isolation-manifest.json'));
  check(
    JSON.stringify(manifest.toolAllowlist) === JSON.stringify(['grader/GET']) &&
      JSON.stringify(manifest.observedToolCalls) === JSON.stringify(['grader/GET']),
    `the manifest grants ${JSON.stringify(manifest.toolAllowlist)} and observed ${JSON.stringify(manifest.observedToolCalls)}`,
  );
  const run = readJson(path.join(runDirectory, 'run.json'));
  check(
    JSON.stringify(run.runner) ===
      JSON.stringify([
        {
          interfaceId: 'grader',
          kind: 'api',
          scheme: 'http',
          host: '127.0.0.1',
          addresses: ['127.0.0.1'],
          methods: ['GET'],
          server: { target: 'server/grader.js', targetArgs: ['--policy=rules/policy.txt'] },
          httpProbePortDigest: sha256(fs.readFileSync(path.join(project.folder, HTTP_PORT_MODULE))),
        },
      ]),
    `run.json names the runner ${JSON.stringify(run.runner)}`,
  );
  const { evidence, output: scoredOutput } = scoreRun(project, 'the HTTP run', 0);
  check(!scoredOutput.includes(SECRET) && !scoredOutput.includes(TOKEN), "the service's secret or token reached what score printed");
  checkVotes('the HTTP run', evidence, 'P-001', 'passed-clean-control');
  checkVotes('the HTTP run', evidence, 'P-002', 'caught');
}

// ---------------------------------------------------------------- a started service's port (Story 1.37)

/**
 * The port-file handoff end to end: a service that writes no port, or writes
 * something other than a port number, stops the run with exit 12; the port
 * file's directory is on the run's scratch list, so a signal mid-call leaves
 * the temp directory empty; and the reference states both handoffs and the
 * window the chosen port leaves.
 */
async function checkPortReport() {
  const other = 'wrote something other than a port number (a whole number from 1 to 65535) to the file PORT_FILE names';
  for (const [label, line, expected] of [
    ['port-none', 'port: none', 'wrote no port to the file PORT_FILE names within readyTimeoutMs (1000ms)'],
    ['port-text', 'port: text', other],
    // A port file that is a pipe the service never opens, or a link to /dev/zero, would block a read that waits or follows
    // links, and with it the run's timers and signal handlers; the run reads neither and stops with exit 12.
    ...(process.platform === 'win32' ? [] : [['port-fifo', 'port: fifo', other]]),
    ...(fs.existsSync('/dev/zero') ? [['port-zero', 'port: zero', other]] : []),
  ]) {
    const project = makeProject(label, {
      edit: ({ root, folder }) => {
        fs.appendFileSync(path.join(root, 'rules', 'policy.txt'), `${line}\n`);
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].server.readyTimeoutMs = 1000;
        });
      },
    });
    // A run held by the file is ended well before the suite's own spawn timeout, so the case fails on its own.
    const ran = evaluate(['preflight', '--evaluation', project.folder], project.env, { timeoutMs: 60_000 });
    const runDirectory = runDirectoryOf(project.folder);
    const fault = runDirectory === null ? null : readIfPresent(path.join(runDirectory, 'qualification', 'P-002', 'fault.json'));
    check(
      ran.status === 12 &&
        fault?.code === 'port-failure' &&
        String(fault.cause).includes(expected) &&
        ran.output.includes(expected) &&
        sessions(project).some((entry) => entry.event === 'listen') &&
        !sessions(project).some((entry) => entry.event === 'request'),
      `${line}: preflight exited ${ran.status} with the fault ${JSON.stringify(fault)} and the service's log ${JSON.stringify(sessions(project))}; expected 12 naming ${JSON.stringify(expected)}\n${ran.output}`,
    );
    check(
      await eventually(() => livingSessions(project).length === 0),
      `${line}: a service outlived its run: ${JSON.stringify(livingSessions(project))}`,
    );
  }

  // A signal that ends a run mid-call removes the call's port-file directory with the rest of the run's scratch.
  if (process.platform !== 'win32') {
    const project = makeProject('port-signal', {
      edit: ({ root }) => fs.appendFileSync(path.join(root, 'rules', 'policy.txt'), 'hang: /grade\n'),
    });
    const child = spawn(process.execPath, [EVALUATE, 'preflight', '--evaluation', project.folder], {
      cwd: PROJECT_ROOT,
      env: { ...BASE_ENV, ...project.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const ended = new Promise((resolve) => child.on('exit', (code, name) => resolve({ code, name })));
    const deadline = Date.now() + SPAWN_TIMEOUT_MS;
    while (!sessions(project).some((entry) => entry.event === 'request') && Date.now() < deadline && child.exitCode === null) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const during = fs.readdirSync(project.env.TMPDIR);
    child.kill('SIGTERM');
    const { code, name } = await ended;
    const after = fs.readdirSync(project.env.TMPDIR);
    check(
      name === 'SIGTERM' && during.some((entry) => entry.startsWith('tea-evaluate-port-')),
      `a run ended by SIGTERM mid-call ended with code ${code} and signal ${name}, and its temp directory held ${JSON.stringify(during)} mid-call; expected a tea-evaluate-port-* directory\n${output}`,
    );
    check(after.length === 0, `a run ended by SIGTERM mid-call left ${JSON.stringify(after)} in its temp directory`);
    check(
      await eventually(() => livingSessions(project).length === 0),
      `a service outlived a run ended by SIGTERM: ${JSON.stringify(livingSessions(project))}`,
    );
  }

  // The reference states both handoffs and the window the chosen port leaves, under its own heading.
  const reference = fs.readFileSync(REFERENCE, 'utf8');
  const heading = "### A started service's port";
  const start = reference.indexOf(`\n${heading}\n`);
  const passage = start === -1 ? '' : reference.slice(start + heading.length + 2).split(/\n#{2,3} /)[0];
  for (const phrase of [
    'With `portFileEnvironmentKey`, the service reports the port it bound',
    'Without `portFileEnvironmentKey`, the runtime chooses the port',
    'This handoff leaves a window: another process can take the port between its release and the service binding it',
  ]) {
    check(passage.includes(phrase), `the reference's passage under ${JSON.stringify(heading)} does not say ${JSON.stringify(phrase)}`);
  }
}

// ---------------------------------------------------------------- denials and faults

async function checkDenials() {
  const unlisted = ({ folder }) =>
    editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
      evaluation.registry[0].addresses = ['127.0.0.2'];
    });
  // An address the entry does not list: the qualification's first request is denied before any service starts.
  const denying = makeProject('address-unlisted', { edit: unlisted });
  const denied = evaluate(['preflight', '--evaluation', denying.folder], denying.env);
  check(
    denied.status === 10 && denied.output.includes('address-not-authorized'),
    `preflight with the address unlisted exited ${denied.status}; expected 10 naming address-not-authorized\n${denied.output}`,
  );
  const deniedRun = runDirectoryOf(denying.folder);
  const fault = deniedRun === null ? null : readIfPresent(path.join(deniedRun, 'qualification', 'P-002', 'fault.json'));
  check(
    fault?.code === 'forbidden-target' && fault.reason === 'address-not-authorized',
    `the unlisted address's qualification fault is ${JSON.stringify(fault)}`,
  );
  check(sessions(denying).length === 0, `a denied request started the service: ${JSON.stringify(sessions(denying))}`);

  // With no seeded probe, the first leg is denied, and the leg's fault carries the reason.
  const legProject = makeProject('leg-address-unlisted', {
    edit: (project) => {
      fs.rmSync(path.join(project.folder, 'probes', 'P-002.probe.json'));
      fs.rmSync(path.join(project.folder, 'mutations'), { recursive: true });
      editJson(path.join(project.folder, 'evaluation.json'), (evaluation) => {
        evaluation.arms = ['clean'];
      });
      unlisted(project);
    },
  });
  const legRan = evaluate(['preflight', '--evaluation', legProject.folder], legProject.env);
  const legRun = runDirectoryOf(legProject.folder);
  const legFaults = legRun === null || !fs.existsSync(path.join(legRun, 'faults')) ? [] : fs.readdirSync(path.join(legRun, 'faults'));
  const legFault = legFaults.length === 1 ? readJson(path.join(legRun, 'faults', legFaults[0])) : null;
  check(
    legRan.status === 10 &&
      legFault?.code === 'forbidden-target' &&
      legFault.reason === 'address-not-authorized' &&
      legFault.request?.kind === 'api' &&
      sessions(legProject).length === 0,
    `a leg to an unlisted address exited ${legRan.status} with the fault ${JSON.stringify(legFault)}\n${legRan.output}`,
  );

  // A service that cannot start answered nothing: the run cannot measure it, exit 12, its cause kept with the secret scrubbed.
  const failing = makeProject('start-fails', {
    edit: ({ root }) => fs.appendFileSync(path.join(root, 'rules', 'policy.txt'), 'start: fail\n'),
  });
  const failed = evaluate(['run', '--evaluation', failing.folder], { ...failing.env, GRADER_SECRET: SECRET });
  const failedRun = runDirectoryOf(failing.folder);
  const failedFault = failedRun === null ? null : readIfPresent(path.join(failedRun, 'qualification', 'P-002', 'fault.json'));
  check(
    failed.status === 12 &&
      failedFault?.code === 'port-failure' &&
      String(failedFault.cause).includes('exited 3 before it accepted a connection') &&
      String(failedFault.cause).includes('[redacted]') &&
      failed.output.includes('exited 3 before it accepted a connection'),
    `a service that cannot start: run exited ${failed.status} with the fault ${JSON.stringify(failedFault)}\n${failed.output}`,
  );
  const failedLeaks = [...filesUnder(failing.root), { where: 'the run output', text: failed.output }].filter(({ text }) =>
    text.includes(SECRET),
  );
  check(failedLeaks.length === 0, `a failing service's secret reached ${failedLeaks.map(({ where }) => where).join(', ')}`);

  // A service that hangs mid-call is torn down at its ceiling: exit 12, the fault's budget-exhausted code, every process ended.
  const hanging = makeProject('hanging', {
    edit: ({ root, folder }) => {
      fs.appendFileSync(path.join(root, 'rules', 'policy.txt'), 'hang: /grade\n');
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.registry[0].maxElapsedMs = HANG_CEILING_MS;
      });
    },
  });
  const hung = evaluate(['preflight', '--evaluation', hanging.folder], hanging.env);
  const hungRun = runDirectoryOf(hanging.folder);
  const hungFault = hungRun === null ? null : readIfPresent(path.join(hungRun, 'qualification', 'P-002', 'fault.json'));
  check(
    hung.status === 12 && hungFault?.code === 'budget-exhausted' && hung.output.includes('budget-exhausted'),
    `a service hanging mid-call: preflight exited ${hung.status} with the fault ${JSON.stringify(hungFault)}\n${hung.output}`,
  );
  check(
    sessions(hanging).some((line) => line.event === 'request') && livingSessions(hanging).length === 0,
    `a hung service outlived the run: ${JSON.stringify(livingSessions(hanging))}`,
  );

  // A service that accepts every answer, whatever its policy, lets the mutated arm hold, so the mutation proves nothing: exit 11.
  const accepting = makeProject('always-accepts', {
    edit: ({ root }) => fs.appendFileSync(path.join(root, 'rules', 'policy.txt'), 'verdict: accept\n'),
  });
  const held = evaluate(['preflight', '--evaluation', accepting.folder], accepting.env);
  check(
    held.status === 11 && held.output.includes('the mutated arm did not fail'),
    `a service that accepts every answer: preflight exited ${held.status}; expected 11\n${held.output}`,
  );

  // A port that does not hand itself to TeA's host, as the template's last lines do, stops the run as an authoring defect.
  const unhosted = makeProject('port-unhosted', {
    edit: ({ folder }) => {
      const file = path.join(folder, HTTP_PORT_MODULE);
      const text = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(file, text.slice(0, text.lastIndexOf('\n// When `tea-evaluate` starts this file')));
    },
  });
  const refused = evaluate(['preflight', '--evaluation', unhosted.folder], unhosted.env);
  check(
    refused.status === 10 && refused.output.includes("hand the port to TeA's host") && sessions(unhosted).length === 0,
    `a port with no host: preflight exited ${refused.status}; expected 10\n${refused.output}`,
  );

  // A port file that hands the host no factory, writes a line outside the protocol on the protocol's channel, or floods
  // that channel does not serve: exit 10.
  const portEdit =
    (edit) =>
    ({ folder }) => {
      const file = path.join(folder, HTTP_PORT_MODULE);
      fs.writeFileSync(file, edit(fs.readFileSync(file, 'utf8')));
    };
  for (const [label, edit, expected] of [
    [
      'port-no-factory',
      (text) => text.replace('serveHttpProbePort({ createHttpProbePort, nodeTransport });', 'serveHttpProbePort({ nodeTransport });'),
      "hands TeA's host no createHttpProbePort factory",
    ],
    [
      'port-stray-line',
      (text) => `import { writeSync as protocolWrite } from 'node:fs';\nprotocolWrite(3, 'ready\\n');\n${text}`,
      "wrote a line that is not the runtime's protocol",
    ],
    [
      'port-flood',
      (text) => `import { writeSync as protocolWrite } from 'node:fs';\nprotocolWrite(3, 'x'.repeat(2 * 1024 * 1024));\n${text}`,
      'wrote past its protocol channel ceiling',
    ],
  ]) {
    const project = makeProject(label, { edit: portEdit(edit) });
    const answered = evaluate(['preflight', '--evaluation', project.folder], project.env);
    check(
      answered.status === 10 && answered.output.includes(expected) && sessions(project).length === 0,
      `${label}: preflight exited ${answered.status}; expected 10 naming ${JSON.stringify(expected)}\n${answered.output}`,
    );
  }

  // No value for the auth header's key: every call would go out with no credential, so the run stops first.
  const credentialless = makeProject('auth-unset');
  const { GRADER_TOKEN: _token, ...withoutToken } = credentialless.env;
  const unset = evaluate(['preflight', '--evaluation', credentialless.folder], withoutToken);
  check(
    unset.status === 10 && unset.output.includes('GRADER_TOKEN, which this host does not set') && sessions(credentialless).length === 0,
    `a run with no value for the auth key: preflight exited ${unset.status}; expected 10\n${unset.output}`,
  );

  // The cases below run the legs alone: no seeded probe, so no qualification cycle.
  const cleanOnly = (project) => {
    fs.rmSync(path.join(project.folder, 'probes', 'P-002.probe.json'));
    fs.rmSync(path.join(project.folder, 'mutations'), { recursive: true });
    editJson(path.join(project.folder, 'evaluation.json'), (evaluation) => {
      evaluation.arms = ['clean'];
    });
  };
  const legFaultOf = (project) => {
    const runDirectory = runDirectoryOf(project.folder);
    const faults =
      runDirectory === null || !fs.existsSync(path.join(runDirectory, 'faults')) ? [] : fs.readdirSync(path.join(runDirectory, 'faults'));
    return faults.length === 1 ? readJson(path.join(runDirectory, 'faults', faults[0])) : null;
  };

  // A service slower to start than a request's cap is stopped during preparation.
  const slow = makeProject('slow-start', {
    edit: (project) => {
      cleanOnly(project);
      fs.appendFileSync(path.join(project.root, 'rules', 'policy.txt'), 'start: delay 1200\n');
      editJson(path.join(project.folder, 'evaluation.json'), (evaluation) => {
        evaluation.registry[0].maxElapsedMs = 800;
      });
    },
  });
  const slowRan = evaluate(['preflight', '--evaluation', slow.folder], slow.env);
  const slowFault = legFaultOf(slow);
  check(
    slowRan.status === 12 && slowFault?.code === 'budget-exhausted',
    `a service slower to start than the request's cap: preflight exited ${slowRan.status} with fault ${JSON.stringify(slowFault)}; expected budget-exhausted\n${slowRan.output}`,
  );

  // A service that exits during a call is a target that could not run, its cause naming that it had accepted a connection.
  const crashing = makeProject('crash-mid-call', {
    edit: (project) => {
      cleanOnly(project);
      fs.appendFileSync(path.join(project.root, 'rules', 'policy.txt'), 'crash: /grade\n');
    },
  });
  const crashed = evaluate(['preflight', '--evaluation', crashing.folder], crashing.env);
  const crashFault = legFaultOf(crashing);
  check(
    crashed.status === 12 &&
      crashFault?.code === 'port-failure' &&
      String(crashFault.cause).includes('the server stopped during the call') &&
      String(crashFault.cause).includes('exited 3 after it accepted a connection'),
    `a service exiting mid-call: preflight exited ${crashed.status} with the fault ${JSON.stringify(crashFault)}\n${crashed.output}`,
  );

  // A port that names another address than the one eval-quality allowed starts no server: the runtime asks
  // eval-quality itself before it starts one.
  const lying = makeProject('port-lies', {
    edit: (project) => {
      cleanOnly(project);
      portEdit((text) =>
        text
          .replace(
            'await whileActive(() => prepare({ scheme, host, port, address: decision.canonicalAddress, method }, exchange));',
            "await whileActive(() => prepare({ scheme, host, port, address: '127.0.0.2', method }, exchange));",
          )
          .replace(
            'await prepare({ scheme, host, port, address: decision.canonicalAddress, method }, signal);',
            "await prepare({ scheme, host, port, address: '127.0.0.2', method }, signal);",
          ),
      )(project);
    },
  });
  const lied = evaluate(['preflight', '--evaluation', lying.folder], lying.env);
  const lieFault = legFaultOf(lying);
  check(
    lied.status === 12 &&
      String(lieFault?.cause).includes("eval-quality's policy does not allow the target the port named") &&
      sessions(lying).length === 0,
    `a port naming an unlisted address: preflight exited ${lied.status} with the fault ${JSON.stringify(lieFault)}\n${lied.output}`,
  );

  // A port that throws an error of no code eval-quality defines records eval-quality's port-failure in its place.
  const throwing = makeProject('port-throws', {
    edit: (project) => {
      cleanOnly(project);
      portEdit((text) =>
        text.replace(
          '  return { probe };',
          "  return {\n    probe: async () => {\n      throw Object.assign(new Error('boom'), { code: 'ERR_BOOM' });\n    },\n  };",
        ),
      )(project);
    },
  });
  const threw = evaluate(['preflight', '--evaluation', throwing.folder], throwing.env);
  const threwFault = legFaultOf(throwing);
  check(
    threw.status === 12 && threwFault?.code === 'port-failure',
    `a port throwing an undefined code: preflight exited ${threw.status} with the fault ${JSON.stringify(threwFault)}\n${threw.output}`,
  );

  // A port whose call never settles is ended at the call's ceiling: exit 12, and no port process left running.
  const stuck = makeProject('port-hangs', {
    edit: (project) => {
      cleanOnly(project);
      portEdit((text) => text.replace('  return { probe };', '  return { probe: () => new Promise(() => {}) };'))(project);
      editJson(path.join(project.folder, 'evaluation.json'), (evaluation) => {
        evaluation.registry[0].maxElapsedMs = 1000;
        evaluation.registry[0].server.readyTimeoutMs = 1000;
      });
    },
  });
  const stuckRan = evaluate(['preflight', '--evaluation', stuck.folder], stuck.env);
  const stuckFault = legFaultOf(stuck);
  check(
    stuckRan.status === 12 && String(stuckFault?.cause).includes('did not answer within') && livingPorts(stuck).length === 0,
    `a port whose call never settles: preflight exited ${stuckRan.status} with the fault ${JSON.stringify(stuckFault)}, leaving ${JSON.stringify(livingPorts(stuck))}\n${stuckRan.output}`,
  );

  // A port that logs on its standard output, as it loads and on every call, still serves: the protocol has a channel of
  // its own.
  const logging = makeProject('port-logs', {
    edit: (project) => {
      cleanOnly(project);
      portEdit((text) =>
        `console.log('the port is loading');\n${text}`.replace(
          '  async function probe(input, signal) {',
          "  async function probe(input, signal) {\n    console.log('probing', input?.probeId);",
        ),
      )(project);
    },
  });
  const logged = evaluate(['preflight', '--evaluation', logging.folder], logging.env);
  check(logged.status === 0, `a port that logs on its standard output: preflight exited ${logged.status}; expected 0\n${logged.output}`);

  // A port that prints past its output ceiling during a call is ended, and the call stops the run: exit 12.
  const printing = makeProject('port-prints', {
    edit: (project) => {
      cleanOnly(project);
      portEdit((text) =>
        text.replace(
          '  return { probe };',
          "  return {\n    probe: () => {\n      process.stdout.write('x'.repeat(2 * 1024 * 1024));\n      return new Promise(() => {});\n    },\n  };",
        ),
      )(project);
    },
  });
  const printed = evaluate(['preflight', '--evaluation', printing.folder], printing.env);
  const printedFault = legFaultOf(printing);
  check(
    printed.status === 12 && String(printedFault?.cause).includes('printed past its output ceiling') && livingPorts(printing).length === 0,
    `a port printing past its output ceiling: preflight exited ${printed.status} with the fault ${JSON.stringify(printedFault)}\n${printed.output.slice(0, 4000)}`,
  );

  // A port that answers with something eval-quality's own ProbeObservation parser does not read breaks its contract:
  // the run stops (exit 12) at the qualification, whose arms the runtime records itself, and the answer is never judged
  // as the target's behavior.
  for (const [label, malformed] of [
    ['port-status-999', '{ ...valid.data, status: 999 }'],
    ['port-header-number', '{ ...valid.data, headers: { x: 5 } }'],
    ['port-body-object', "{ ...valid.data, body: { verdict: 'accept' } }"],
  ]) {
    const project = makeProject(label, {
      edit: portEdit((text) => text.replace('  return valid.data;\n}', `  return ${malformed};\n}`)),
    });
    const ran = evaluate(['preflight', '--evaluation', project.folder], project.env);
    const runDirectory = runDirectoryOf(project.folder);
    const fault = runDirectory === null ? null : readIfPresent(path.join(runDirectory, 'qualification', 'P-002', 'fault.json'));
    check(
      ran.status === 12 &&
        fault?.code === 'port-contract-violation' &&
        String(fault.message).includes('no ProbeObservation eval-quality reads'),
      `${label}: preflight exited ${ran.status} with the qualification fault ${JSON.stringify(fault)}; expected 12 and port-contract-violation\n${ran.output}`,
    );
  }
}

// ---------------------------------------------------------------- the bridge

/** Makes `folder`'s evaluator the HTTP stub agent, capturing each run to `capture`, with a budget for its four calls. */
function useStubAgent(folder, capture) {
  writeJson(path.join(folder, 'evaluator', 'mapping.json'), {
    schemaVersion: 1,
    keys: { 'grade-accepted': { oracleId: 'O-001', behaviorId: 'B-001' } },
  });
  editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
    evaluation.evaluator = {
      kind: 'sealed-brief-agent',
      agent: 'custom',
      agentCommand: process.execPath,
      agentArgs: [STUB_AGENT, '--capture', capture],
      timeoutMs: 60_000,
    };
    // The agent chooses its own calls, so a run qualifies it before its first trial (Story 1.34).
    evaluation.evaluatorQualification = { attempts: 2, minimumAgreement: 0.9 };
  });
  editJson(path.join(folder, 'contract.json'), (contract) => {
    contract.budgets.maxToolCalls = 4;
  });
  writeJson(path.join(folder, 'policy', 'evaluator-conditions.json'), {
    schemaVersion: 1,
    modelSnapshot: 'none',
    systemPromptDigest: sha256(Buffer.alloc(0)),
    evaluator: { modelSnapshot: 'stub-api-agent-2026-09' },
  });
}

async function checkSealedBriefAgent() {
  const capture = path.join(scratch.make('sealed-capture'), 'captures.jsonl');
  const project = makeProject('sealed-brief', { edit: ({ folder }) => useStubAgent(folder, capture) });
  const ran = evaluate(['run', '--evaluation', project.folder], { ...project.env, GRADER_SECRET: SECRET, GRADER_TOKEN: TOKEN });
  check(ran.status === 0, `a sealed-brief run over the HTTP fixture exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (!checkSealed('the sealed-brief HTTP run', ran, runDirectory)) return;
  for (const [arm, probeId, verdict] of [
    ['clean', 'P-001', 'accepted'],
    ['mutated-M-001', 'P-002', 'rejected'],
  ]) {
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      const { calls = [] } = readIfPresent(path.join(runDirectory, 'evaluator', arm, `trial-${trial}.json`)) ?? {};
      const outcome = (call) => {
        if (call.denied !== undefined) return `denied:${call.denied.code}:${call.denied.reason}`;
        if (call.unmatched !== undefined) return `unmatched:${call.observationId ?? 'unrecorded'}`;
        return `${call.operationId}:${call.observationId}`;
      };
      check(
        JSON.stringify(calls.map(outcome)) ===
          JSON.stringify([
            `grade-answer:trial-${trial}-call-1`,
            'unmatched:unrecorded',
            'denied:forbidden-target:method-not-authorized',
            `grade-answer:trial-${trial}-call-4`,
          ]),
        `${arm} trial ${trial}: the bridge's calls are ${JSON.stringify(calls.map(outcome))}`,
      );
    }
    check(
      recordsOf(runDirectory, probeId).length === TRIALS,
      `${probeId}'s sealed-brief trial set holds ${recordsOf(runDirectory, probeId).length} records`,
    );
    for (const record of recordsOf(runDirectory, probeId)) {
      const [chosen, unanswered] = record.observations.filter((observation) => observation.provenance === 'evaluator-chosen');
      check(
        record.observations.length === 3 &&
          record.observations[0].provenance === 'baseline' &&
          chosen?.observationId === `trial-${record.trialIndex}-call-1` &&
          chosen.operationId === 'grade-answer' &&
          JSON.stringify(chosen.callInputs.query) === JSON.stringify({ answer: 'an answer of my own' }) &&
          chosen.responseBody?.verdict === verdict &&
          chosen.responseBody?.secret === '[redacted]' &&
          chosen.responseStatus === 200,
        `${probeId} trial ${record.trialIndex}'s observations are ${JSON.stringify(record.observations)}`,
      );
      // The service answered the agent's request with no answer 400, which the record keeps as its status.
      check(
        unanswered?.observationId === `trial-${record.trialIndex}-call-4` &&
          unanswered.callInputs.query === null &&
          unanswered.responseBody?.ok === false &&
          unanswered.responseStatus === 400,
        `${probeId} trial ${record.trialIndex} recorded the request the service refused as ${JSON.stringify(unanswered)}`,
      );
    }
  }
  // The denied method started no service: each trial's plan step and the agent's two grade requests and one policy
  // request each started one, and the DELETE none.
  const trialRequests = sessions(project).filter((line) => line.event === 'request' && line.workspace?.startsWith('trial-'));
  const trialStarts = sessions(project).filter((line) => line.event === 'listen' && line.workspace?.startsWith('trial-'));
  check(
    trialRequests.length === 4 * 2 * TRIALS &&
      trialStarts.length === 4 * 2 * TRIALS &&
      trialRequests.every((line) => line.method === 'GET'),
    `the trials started the service ${trialStarts.length} time(s) and sent it ${JSON.stringify(trialRequests.map((line) => `${line.method} ${line.path}`))}`,
  );
  const leaked = [...filesUnder(project.root, capture), { where: 'the run output', text: ran.output }].filter(
    ({ text }) => text.includes(SECRET) || text.includes(TOKEN),
  );
  check(leaked.length === 0, `the service's secret or token reached ${leaked.map(({ where }) => where).join(', ')} in a sealed-brief run`);
  const [first] = fs.existsSync(capture)
    ? fs
        .readFileSync(capture, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  check(
    first?.results?.[2]?.result?.isError === true && first.results[2].result.content[0].text.includes('method-not-authorized'),
    `the agent was told ${JSON.stringify(first?.results?.[2])} of its unlisted method`,
  );
  const manifest = readJson(path.join(runDirectory, 'trial-sets', 'P-002', 'isolation-manifest.json'));
  check(
    JSON.stringify(manifest.observedToolCalls) === JSON.stringify(['grader/GET']),
    `the sealed-brief manifest observed ${JSON.stringify(manifest.observedToolCalls)}`,
  );
  const { evidence, output: scoredOutput } = scoreRun(project, 'the sealed-brief HTTP run');
  check(
    !scoredOutput.includes(SECRET) && !scoredOutput.includes(TOKEN),
    "the service's secret or token reached what score printed in a sealed-brief run",
  );
  checkVotes('the sealed-brief HTTP run', evidence, 'P-001', 'passed-clean-control');
  checkVotes('the sealed-brief HTTP run', evidence, 'P-002', 'caught');

  // A bridge whose entry does not list the service's address denies the agent's request before any service starts.
  const unlisted = makeProject('bridge-address-unlisted', {
    edit: ({ folder }) =>
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.registry[0].addresses = ['127.0.0.2'];
      }),
  });
  const evaluation = readJson(path.join(unlisted.folder, 'evaluation.json'));
  const registry = createRegistry(evaluation.registry, { root: unlisted.root, httpPort: await probeHttpPort(unlisted.folder) });
  const { port } = await registry.createProbePort({ cwd: unlisted.root, projectRoot: unlisted.root });
  const router = bridgeRouter({
    contract: readJson(path.join(unlisted.folder, 'contract.json')),
    registry,
    port: hostEnvironmentPort({ port, registry }),
    degenerate: null,
    label: 'trial-1',
    taken: new Set(),
    firstSequence: 1,
    budget: 2,
    nonce: crypto.randomBytes(16).toString('hex'),
  });
  const answer = await withEnvironment({ GRADER_LOG: unlisted.log }, () =>
    router.handle({ name: 'grader', kind: 'api' }, { method: 'GET', path: '/grade?answer=x' }),
  );
  check(
    answer.isError === true &&
      answer.text.includes('address-not-authorized') &&
      router.calls[0]?.denied?.reason === 'address-not-authorized' &&
      router.observations.length === 0 &&
      sessions(unlisted).length === 0,
    `a bridge call to an unlisted address was answered ${JSON.stringify(answer)} and recorded ${JSON.stringify(router.calls)}`,
  );
  // A body carrying an own __proto__ key, which eval-quality's parser drops, is refused unsent.
  const polluted = await router.handle(
    { name: 'grader', kind: 'api' },
    { method: 'GET', path: '/grade', body: JSON.parse('{"a":{"__proto__":{"x":1}}}') },
  );
  check(
    polluted.isError === true && polluted.text.includes('__proto__'),
    `a call carrying a __proto__ key was answered ${JSON.stringify(polluted)}`,
  );

  // An allowed call through the workspace's port, in this process: once it has answered, its server has ended, before
  // the run's own end (whose lifeline would end it anyway) could.
  const served = makeProject('in-process-call');
  const servedRegistry = createRegistry(readJson(path.join(served.folder, 'evaluation.json')).registry, {
    root: served.root,
    httpPort: await probeHttpPort(served.folder),
  });
  const servedAnswer = await withEnvironment({ GRADER_LOG: served.log, GRADER_TOKEN: TOKEN }, async () => {
    const { port: servedPort } = await servedRegistry.createProbePort({ cwd: served.root, projectRoot: served.root });
    return hostEnvironmentPort({ port: servedPort, registry: servedRegistry }).probe({
      probeId: 'in-process-1',
      interfaceId: 'grader',
      operationId: 'grade-answer',
      kind: 'api',
      method: 'GET',
      pathTemplate: '/grade',
      channels: { path: {}, query: { answer: 'x' }, header: {}, body: { kind: 'absent' } },
    });
  });
  // Without the call's own stop the server would live out its ceiling of more than fifty seconds.
  const ended = await eventually(() => livingSessions(served).length === 0 && livingPorts(served).length === 0);
  check(
    servedAnswer.observation.status === 200 && sessions(served).filter((line) => line.event === 'listen').length === 1 && ended,
    `an allowed in-process call answered ${servedAnswer.observation.status} and left ${JSON.stringify(livingSessions(served))} running`,
  );
}

// ---------------------------------------------------------------- gameability

const DEGENERATE = {
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ok: true, answer: 'forty-two', verdict: 'pending' }),
};

async function checkGameability() {
  const project = makeProject('gameability', {
    edit: ({ folder }) => {
      editJson(path.join(folder, 'contract.json'), (contract) => {
        contract.behaviors.push({
          id: 'B-002',
          description: 'The grader answers every grade request with a body that reports ok.',
          severity: 'low',
          observableSuccessCriterion: 'The grade answer reports ok.',
          requirementLinks: [{ scheme: 'tea-evaluate-fixture', id: 'answers-ok' }],
          riskLinks: [{ scheme: 'tea-evaluate-fixture', id: 'silent-grade' }],
          oracles: ['O-002'],
        });
        contract.oracles.push({
          id: 'O-002',
          polarity: 'expects-hold',
          commentary: 'The grader reported ok, whichever verdict it names.',
          direction: {
            polarity: 'expects-hold',
            relation: 'equality',
            scope: 'The response body of the grade request.',
            negativeDomain: 'A body that does not report ok.',
            evidenceTargets: ['/interactions/grade-run/response-body/ok'],
          },
          check: { op: 'equality', operands: [{ pointer: '/interactions/grade-run/response-body/ok' }, { literal: true }] },
        });
      });
      const signature = readJson(path.join(folder, 'probes', 'P-002.probe.json')).defectSignature;
      signature.condition.predicate.operands[1].literal = 'pending';
      fs.rmSync(path.join(folder, 'probes'), { recursive: true });
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
      writeJson(path.join(folder, 'probes', 'P-003.probe.json'), {
        probeId: 'P-003',
        probeClass: 'gameability',
        behaviorId: 'B-001',
        expectedClean: false,
        rationale: 'Gameability: a shortcut grader reports ok without grading the answer.',
        defects: [],
        defectSignature: signature,
        qualification: {
          route: 'gameability',
          degenerateResponse: 'Reports ok with the verdict pending, without grading the answer.',
          naiveOracle: 'O-002',
        },
      });
      writeJson(path.join(folder, 'corpus', 'gameability', 'P-003.json'), { schemaVersion: 1, steps: { 'grade-run': DEGENERATE } });
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.arms = ['gameability'];
      });
    },
  });
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a gameability run over the HTTP fixture exited ${ran.status}; expected 0\n${ran.output}`);
  // Only the preflight's witness legs started the service; the gameability qualification and trials started nothing.
  const requests = sessions(project).filter((line) => line.event === 'request');
  check(
    requests.length > 0 &&
      sessions(project).every((line) => line.workspace === 'pristine') &&
      requests.every((line) => line.path !== '/grade?answer=forty-two'),
    `the gameability arm started the service: ${JSON.stringify(sessions(project))}`,
  );
  const runDirectory = runDirectoryOf(project.folder);
  if (!checkSealed('the gameability HTTP run', ran, runDirectory)) return;
  check(recordsOf(runDirectory, 'P-003').length === TRIALS, `P-003's trial set holds ${recordsOf(runDirectory, 'P-003').length} records`);
  for (const record of recordsOf(runDirectory, 'P-003')) {
    check(
      record.observations.length === 1 &&
        record.observations[0].responseBody?.verdict === 'pending' &&
        record.observations[0].responseStatus === 200 &&
        record.findings.map((finding) => finding.oracleId).join(',') === 'O-001',
      `gameability trial ${record.trialIndex} records ${JSON.stringify(record.observations)} and files ${JSON.stringify(record.findings)}`,
    );
  }
  const { evidence } = scoreRun(project, 'the gameability HTTP run');
  checkVotes('the gameability HTTP run', evidence, 'P-003', 'caught');

  // A gameability router over the HTTP port: an unlisted method is denied as on a real arm, an allowed request is
  // answered from the degenerate response, and nothing starts.
  const evaluation = readJson(path.join(project.folder, 'evaluation.json'));
  const registry = createRegistry(evaluation.registry, { root: project.root, httpPort: await probeHttpPort(project.folder) });
  const router = bridgeRouter({
    contract: readJson(path.join(project.folder, 'contract.json')),
    registry,
    port: null,
    degenerate: { 'grade-run': DEGENERATE },
    label: 'trial-1',
    taken: new Set(['trial-1-grade-run']),
    firstSequence: 2,
    budget: 2,
    nonce: crypto.randomBytes(16).toString('hex'),
  });
  const before = sessions(project).length;
  const tool = { name: 'grader', kind: 'api' };
  const [unlistedMethod, allowed] = await withEnvironment({ GRADER_LOG: project.log }, async () => [
    await router.handle(tool, { method: 'DELETE', path: '/grade' }),
    await router.handle(tool, { method: 'GET', path: '/grade?answer=any' }),
  ]);
  check(
    unlistedMethod.isError === true &&
      router.calls[0]?.denied?.reason === 'method-not-authorized' &&
      allowed.isError === false &&
      JSON.parse(allowed.text).body?.verdict === 'pending' &&
      router.observations[0]?.responseBody?.verdict === 'pending' &&
      JSON.stringify(router.observations[0].callInputs.query) === JSON.stringify({ answer: 'any' }),
    `the gameability router answered ${JSON.stringify([unlistedMethod, allowed])} and recorded ${JSON.stringify(router.calls)}`,
  );
  check(sessions(project).length === before, 'the gameability router started the service');

  // The operation a call matches takes the path's parameters, decoded, and its query; a `..` parameter and a body that
  // is not an object are refused unsent.
  const itemContract = readJson(path.join(project.folder, 'contract.json'));
  itemContract.permittedInterfaces[0].operations.push({
    ...itemContract.permittedInterfaces[0].operations[0],
    operationId: 'grade-item',
    pathTemplate: '/grade/{id}',
  });
  const itemRouter = bridgeRouter({
    contract: itemContract,
    registry,
    port: null,
    degenerate: { 'grade-run': DEGENERATE },
    label: 'trial-1',
    taken: new Set(['trial-1-grade-run']),
    firstSequence: 2,
    budget: 3,
    nonce: crypto.randomBytes(16).toString('hex'),
  });
  const item = await itemRouter.handle(tool, { method: 'GET', path: '/grade/a%20b?x=1&x=2' });
  const dotted = await itemRouter.handle(tool, { method: 'GET', path: '/grade/%2e%2e' });
  const texted = await itemRouter.handle(tool, { method: 'GET', path: '/grade', body: 'hello' });
  check(
    item.isError === false &&
      itemRouter.observations[0]?.operationId === 'grade-item' &&
      JSON.stringify(itemRouter.observations[0].callInputs.path) === JSON.stringify({ id: 'a b' }) &&
      JSON.stringify(itemRouter.observations[0].callInputs.query) === JSON.stringify({ x: ['1', '2'] }) &&
      dotted.isError === true &&
      dotted.text.includes('the call cannot be sent') &&
      texted.isError === true &&
      texted.text.includes('takes body as an object') &&
      itemRouter.observations.length === 1,
    `a path-parameter call, a .. parameter and a text body were answered ${JSON.stringify([item, dotted, texted])} and recorded ${JSON.stringify(itemRouter.observations)}`,
  );
}

// ---------------------------------------------------------------- eval-quality's policy parser (Story 1.36)

/** The JSON type of each field of an HTTP entry that becomes a field of eval-quality's authorization. */
const AUTHORIZATION_TYPES = {
  scheme: 'string',
  host: 'string',
  port: 'integer',
  addresses: 'array',
  methods: 'array',
  safeMethods: 'array',
  maxRedirects: 'integer',
  maxElapsedMs: 'integer',
  maxRequestBytes: 'integer',
  maxResponseBytes: 'integer',
};

/** What `check` prints for each finding, one line: `<file>: [<rule>] <message>`. */
function findingsOf(output, rule) {
  return output.split('\n').filter((line) => line.includes(`[${rule}]`));
}

/** The message of the fault eval-quality's parser throws for one authorization, or null when it accepts it. */
function parserReason(parseProbeTargetPolicy, authorization) {
  try {
    parseProbeTargetPolicy({ authorizations: [authorization] });
    return null;
  } catch (error) {
    return error.message;
  }
}

/**
 * `check` holds an HTTP entry to eval-quality's own `parseProbeTargetPolicy`;
 * the runtime builds each call's policy through it before any service starts;
 * and `ApiRegistryEntry` carries its authorization fields at their JSON types
 * alone.
 */
async function checkPolicyParser() {
  const { parseProbeTargetPolicy } = await loadAdapters();
  const manifest = readJson(path.join(FIXTURE, EVALUATION, 'evaluation.json'));
  const [entry] = manifest.registry;

  // `check`: an entry the parser refuses is one `registry` finding that carries the parser's reason and pointers.
  const refusedFields = { port: 0, scheme: 'ftp', addresses: [], maxElapsedMs: 0 };
  const refused = makeProject('policy-parser-refused', {
    edit: ({ folder }) =>
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        delete evaluation.registry[0].server;
        Object.assign(evaluation.registry[0], refusedFields);
      }),
  });
  const refusedChecked = evaluate(['check', '--evaluation', refused.folder], refused.env);
  const refusedReason = parserReason(parseProbeTargetPolicy, {
    ...authorizationOf(entry, 0),
    scheme: 'ftp',
    addresses: [],
    maxElapsedMs: 0,
  });
  const refusedFindings = findingsOf(refusedChecked.output, 'registry');
  check(
    refusedChecked.status === 10 &&
      refusedFindings.length === 1 &&
      refusedFindings[0].includes("registry[0] becomes an authorization eval-quality's parseProbeTargetPolicy refuses") &&
      refusedReason !== null &&
      refusedFindings[0].includes(refusedReason) &&
      ['/authorizations/0/port', '/authorizations/0/scheme', '/authorizations/0/addresses', '/authorizations/0/maxElapsedMs'].every(
        (pointer) => refusedFindings[0].includes(pointer),
      ) &&
      findingsOf(refusedChecked.output, 'schema').length === 0,
    `an entry the parser refuses: check exited ${refusedChecked.status} with ${refusedFindings.length} registry finding(s); expected 10 and one carrying ${JSON.stringify(refusedReason)}\n${refusedChecked.output}`,
  );

  // A started server's entry is read at a placeholder port: the fixture's own entry has no `port` and yields no
  // finding, and one whose ceiling the parser refuses yields the finding for that ceiling alone.
  const started = makeProject('policy-parser-started');
  const startedChecked = evaluate(['check', '--evaluation', started.folder], started.env);
  check(
    startedChecked.status === 0 && findingsOf(startedChecked.output, 'registry').length === 0,
    `a started server's entry: check exited ${startedChecked.status}; expected 0 and no registry finding\n${startedChecked.output}`,
  );
  const startedRefused = makeProject('policy-parser-started-refused', {
    edit: ({ folder }) =>
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.registry[0].maxRequestBytes = 0;
      }),
  });
  const startedRefusedChecked = evaluate(['check', '--evaluation', startedRefused.folder], startedRefused.env);
  const startedFindings = findingsOf(startedRefusedChecked.output, 'registry');
  check(
    startedRefusedChecked.status === 10 &&
      startedFindings.length === 1 &&
      startedFindings[0].includes('/authorizations/0/maxRequestBytes') &&
      !startedFindings[0].includes('/authorizations/0/port'),
    `a started server's entry with maxRequestBytes 0: check exited ${startedRefusedChecked.status}; expected 10 and one registry finding for maxRequestBytes alone\n${startedRefusedChecked.output}`,
  );

  // eval-quality's HTTP policy sets no ceiling on `maxElapsedMs`, so a value past the 2147483647 ms one timer holds is
  // the parser's to accept and the runtime's timers to hold.
  const longest = makeProject('policy-parser-longest', {
    edit: ({ folder }) =>
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.registry[0].maxElapsedMs = 2 ** 31;
      }),
  });
  const longestChecked = evaluate(['check', '--evaluation', longest.folder], longest.env);
  check(
    longestChecked.status === 0,
    `a maxElapsedMs of 2 ** 31 on an HTTP entry: check exited ${longestChecked.status}; expected 0\n${longestChecked.output}`,
  );

  // A rule the parser holds beyond the old schema's reach reaches `check` with no change here: an address that is a
  // host name, which could never match a resolved address.
  const named = makeProject('policy-parser-address-name', {
    edit: ({ folder }) =>
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.registry[0].addresses = ['127.0.0.1', 'localhost'];
      }),
  });
  const namedChecked = evaluate(['check', '--evaluation', named.folder], named.env);
  check(
    namedChecked.status === 10 &&
      findingsOf(namedChecked.output, 'registry').some(
        (line) => line.includes('parseProbeTargetPolicy refuses') && line.includes('/authorizations/0/addresses/1'),
      ),
    `an address that is a host name: check exited ${namedChecked.status}; expected 10 and a registry finding at /authorizations/0/addresses/1\n${namedChecked.output}`,
  );

  // A second HTTP entry serves a second interface of the contract. The parser refuses one field of that entry alone, so the
  // finding must name `registry[1]`: every other case edits `registry[0]`, which a finding hard-coded to it would still name.
  const siblingFields = { scheme: 'http', host: '127.0.0.1', addresses: ['127.0.0.1'], methods: ['GET'], safeMethods: ['GET'] };
  const withSibling = (label, refuse) =>
    makeProject(label, {
      edit: ({ folder }) => {
        editJson(path.join(folder, 'contract.json'), (contract) => {
          const second = { ...structuredClone(contract.permittedInterfaces[0]), logicalId: 'grader-second' };
          for (const operation of second.operations) operation.operationId = `${operation.operationId}-second`;
          contract.permittedInterfaces.push(second);
        });
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.operationPhases['grader-second'] = Object.fromEntries(
            Object.entries(evaluation.operationPhases.grader).map(([operationId, phase]) => [`${operationId}-second`, phase]),
          );
          const { kind, maxRedirects, maxElapsedMs, maxRequestBytes, maxResponseBytes } = evaluation.registry[0];
          evaluation.registry.push({
            kind,
            interfaceId: 'grader-second',
            ...siblingFields,
            port: 41_002,
            maxRedirects,
            maxElapsedMs,
            maxRequestBytes,
            maxResponseBytes,
            ...refuse,
          });
        });
      },
    });
  const siblingValid = withSibling('policy-parser-sibling-valid', {});
  const siblingValidChecked = evaluate(['check', '--evaluation', siblingValid.folder], siblingValid.env);
  check(
    siblingValidChecked.status === 0 && findingsOf(siblingValidChecked.output, 'registry').length === 0,
    `a registry of two valid HTTP entries: check exited ${siblingValidChecked.status}; expected 0 and no registry finding\n${siblingValidChecked.output}`,
  );
  const siblingRefused = withSibling('policy-parser-sibling-refused', { maxResponseBytes: 0 });
  const siblingRefusedChecked = evaluate(['check', '--evaluation', siblingRefused.folder], siblingRefused.env);
  const siblingFindings = findingsOf(siblingRefusedChecked.output, 'registry');
  check(
    siblingRefusedChecked.status === 10 &&
      siblingFindings.length === 1 &&
      siblingFindings[0].includes("registry[1] becomes an authorization eval-quality's parseProbeTargetPolicy refuses") &&
      siblingFindings[0].includes('/authorizations/0/maxResponseBytes') &&
      !siblingFindings[0].includes('registry[0]') &&
      findingsOf(siblingRefusedChecked.output, 'schema').length === 0,
    `a second HTTP entry whose maxResponseBytes the parser refuses: check exited ${siblingRefusedChecked.status} with ${siblingFindings.length} registry finding(s); expected 10 and one naming registry[1] and not registry[0]\n${siblingRefusedChecked.output}`,
  );

  // A deployment origin is an authorization of its own: the finding names the deployment the parser refused.
  const deployed = makeProject('policy-parser-deployment', {
    edit: ({ folder }) =>
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.registry[0].deployments = [
          { scheme: 'http', host: '127.0.0.1', port: 41_001, addresses: ['127.0.0.1'] },
          { scheme: 'http', host: '127.0.0.1', port: 0, addresses: [] },
        ];
      }),
  });
  const deployedChecked = evaluate(['check', '--evaluation', deployed.folder], deployed.env);
  const deployedFindings = findingsOf(deployedChecked.output, 'registry');
  check(
    deployedChecked.status === 10 &&
      deployedFindings.length === 1 &&
      deployedFindings[0].includes("registry[0].deployments[1] becomes an authorization eval-quality's parseProbeTargetPolicy refuses") &&
      deployedFindings[0].includes('/authorizations/0/port') &&
      deployedFindings[0].includes('/authorizations/0/addresses'),
    `a deployment origin the parser refuses: check exited ${deployedChecked.status}; expected 10 and one registry finding naming registry[0].deployments[1]\n${deployedChecked.output}`,
  );

  // The runtime: each call's policy is built through the parser before any service starts. A registry built without
  // `check`, over fields the parser refuses, stops the call with the parser's own fault.
  const unused = { file: path.join(FIXTURE, EVALUATION, HTTP_PORT_MODULE), folder: path.join(FIXTURE, EVALUATION), digest: 'sha256:0000' };
  const chosenEntry = { ...entry, server: (({ portFileEnvironmentKey, ...server }) => server)(entry.server) };
  const request = { probeId: 'unit', interfaceId: 'grader', operationId: 'grade', kind: 'api', method: 'GET', pathTemplate: '/grade' };
  for (const [what, refusedEntry] of [
    ['a started server that reports its port', { ...entry, scheme: 'ftp', maxElapsedMs: 0 }],
    ['a started server on a port the runtime chose', { ...chosenEntry, scheme: 'ftp', maxElapsedMs: 0 }],
  ]) {
    let runs = 0;
    const listed = [];
    const fault = await createApiPort({
      entries: [refusedEntry],
      httpPort: unused,
      cwd: FIXTURE,
      targetOf: () => path.join(FIXTURE, 'server', 'grader.js'),
      readEnvironment: () => ({}),
      mechanism: {
        run: async () => {
          runs += 1;
          return { exitCode: 0, stdout: '', stderr: '' };
        },
      },
      maxOutputBytes: 1024,
      scratch: listed,
    })
      .probe(request)
      .catch((error) => error);
    const reason = parserReason(parseProbeTargetPolicy, { ...authorizationOf(refusedEntry, 4242) });
    check(
      fault?.name === 'RuntimeFault' &&
        fault.code === 'schema-parse-failure' &&
        reason !== null &&
        fault.message === reason &&
        fault.message.includes('/authorizations/0/scheme') &&
        fault.message.includes('/authorizations/0/maxElapsedMs') &&
        runs === 0 &&
        listed.length === 0,
      `${what} over refused fields gave ${fault?.code ?? fault}: ${fault?.message}; expected the parser's fault ${JSON.stringify(reason)} with no service started (${runs} run) and no directory left (${JSON.stringify(listed)})`,
    );
  }
  // A trial over such a registry stops the run as any call that cannot run does, exit 12, with the parser's pointers in
  // its message and no service started. The pipeline's own `check` would stop the authoring first, so the trial is driven directly.
  const trialProject = makeProject('unit-trial-refused');
  const refusing = createRegistry([{ ...entry, maxElapsedMs: 0 }], {
    root: trialProject.root,
    httpPort: await probeHttpPort(trialProject.folder),
  });
  let refusedStop = null;
  await withEnvironment({ GRADER_LOG: trialProject.log, GRADER_TOKEN: TOKEN }, async () => {
    try {
      await runTrial({
        arm: { conditionArm: 'clean', slug: 'clean', mutation: null, mutatedDigest: null, probes: [] },
        trialIndex: 1,
        contract: readJson(path.join(FIXTURE, EVALUATION, 'contract.json')),
        registry: refusing,
        pristine: null,
        make: () => ({ kind: 'copy', root: trialProject.root, directory: trialProject.root, provisioned: [] }),
        discard: () => {},
        engine: null,
        writer: { writeJson: () => {} },
        stop: (fields) => Object.assign(new Error(fields.message), fields),
        signal: new AbortController().signal,
        snapshot: { layer: { evaluator: { kind: 'deterministic' } } },
      });
    } catch (error) {
      refusedStop = error;
    }
  });
  check(
    refusedStop?.exitCode === 12 &&
      String(refusedStop.message).includes('/authorizations/0/maxElapsedMs') &&
      sessions(trialProject).length === 0,
    `a trial over a registry the parser refuses stopped with ${refusedStop?.exitCode}: ${refusedStop?.message}; expected exit 12 carrying the parser's pointer and no service started (${sessions(trialProject).length} started)`,
  );
  // A deployed entry's call meets the same refusal, and so does the gameability arm's port.
  const deployedEntry = { ...entry, port: 0 };
  delete deployedEntry.server;
  const deployedFault = await createApiPort({
    entries: [deployedEntry],
    httpPort: unused,
    cwd: FIXTURE,
    targetOf: () => path.join(FIXTURE, 'server', 'grader.js'),
    readEnvironment: () => ({}),
    mechanism: { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }) },
    maxOutputBytes: 1024,
  })
    .probe(request)
    .catch((error) => error);
  check(
    deployedFault?.code === 'schema-parse-failure' && deployedFault.message.includes('/authorizations/0/port'),
    `a deployed entry over port 0 gave ${deployedFault?.code ?? deployedFault}: ${deployedFault?.message}; expected the parser's fault for /authorizations/0/port`,
  );
  const degenerateFault = await degenerateApiPort({
    entries: [{ ...chosenEntry, methods: [] }],
    httpPort: unused,
    answer: { status: 200 },
    readEnvironment: () => ({}),
  })
    .probe(request)
    .catch((error) => error);
  check(
    degenerateFault?.code === 'schema-parse-failure' && degenerateFault.message.includes('/authorizations/0/methods'),
    `the gameability arm's port over an empty method list gave ${degenerateFault?.code ?? degenerateFault}: ${degenerateFault?.message}; expected the parser's fault for /authorizations/0/methods`,
  );

  // The called entry is valid and a deployed sibling's field is refused. `portConfiguration` parses every authorization
  // it reaches, a deployed entry's included, so the sibling's refusal stops the call with the parser's fault (pointer
  // `/authorizations/1/...`, the sibling's place in the policy) and no service starts.
  // The runtime holds one policy per call, so this outcome is the intended one: a sibling the parser refuses is a registry `check` already refuses.
  const siblingEntry = { ...entry, interfaceId: 'grader-second', port: 41_002, methods: [] };
  delete siblingEntry.server;
  let siblingRuns = 0;
  const siblingListed = [];
  const siblingFault = await createApiPort({
    entries: [entry, siblingEntry],
    httpPort: unused,
    cwd: FIXTURE,
    targetOf: () => path.join(FIXTURE, 'server', 'grader.js'),
    readEnvironment: () => ({}),
    mechanism: {
      run: async () => {
        siblingRuns += 1;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    },
    maxOutputBytes: 1024,
    scratch: siblingListed,
  })
    .probe(request)
    .catch((error) => error);
  check(
    siblingFault?.name === 'RuntimeFault' &&
      siblingFault.code === 'schema-parse-failure' &&
      siblingFault.message.includes('/authorizations/1/methods') &&
      !siblingFault.message.includes('/authorizations/0') &&
      siblingRuns === 0 &&
      siblingListed.length === 0,
    `a valid called entry beside a deployed sibling with no methods gave ${siblingFault?.code ?? siblingFault}: ${siblingFault?.message}; expected the parser's fault for /authorizations/1/methods alone, with no service started (${siblingRuns} run) and no directory left (${JSON.stringify(siblingListed)})`,
  );

  // The schema: each authorization field carries its JSON type alone, and the rules that are TeA's own stay.
  const schema = readJson(path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'schemas', 'evaluation.schema.json'));
  const apiEntry = schema.$defs.ApiRegistryEntry;
  const deploymentItem = apiEntry.properties.deployments.items;
  // An allow-list: a field's own keys are `type`, `description` and `items`, and an array's `items` carries `type` and
  // `description`. A content keyword, a `$ref` or a combinator (`allOf`, `anyOf`, `oneOf`, `not`, `if`) cannot bring a copied rule back.
  const FIELD_KEYS = new Set(['type', 'description', 'items']);
  const ITEM_KEYS = new Set(['type', 'description']);
  const holdsTypeAlone = (where, field, type, definition) => {
    const extras = Object.keys(definition ?? {}).filter((keyword) => !FIELD_KEYS.has(keyword));
    const nested = type === 'array' ? Object.keys(definition?.items ?? {}).filter((keyword) => !ITEM_KEYS.has(keyword)) : [];
    check(
      definition?.type === type && extras.length === 0 && nested.length === 0 && (type !== 'array' || definition.items?.type === 'string'),
      `${where}.${field} is ${JSON.stringify(definition)}; expected the JSON type ${type} alone, with no ${[...extras, ...nested].join(', ') || 'rule'} of its own`,
    );
  };
  for (const [field, type] of Object.entries(AUTHORIZATION_TYPES))
    holdsTypeAlone('ApiRegistryEntry', field, type, apiEntry.properties[field]);
  for (const field of ['scheme', 'host', 'port', 'addresses']) {
    holdsTypeAlone('ApiRegistryEntry.deployments.items', field, AUTHORIZATION_TYPES[field], deploymentItem.properties[field]);
  }
  check(
    deploymentItem.additionalProperties === false &&
      JSON.stringify(deploymentItem.required) === JSON.stringify(['scheme', 'host', 'port', 'addresses']) &&
      Object.keys(AUTHORIZATION_TYPES).every((field) => apiEntry.required.includes(field) || field === 'port') &&
      apiEntry.oneOf?.length === 2 &&
      apiEntry.properties.interfaceId.pattern !== undefined &&
      apiEntry.properties.auth !== undefined &&
      apiEntry.properties.server.properties.environmentKeys !== undefined,
    'ApiRegistryEntry lost a rule that is its own: the port and server oneOf, the interfaceId slug, the required lists, auth, server or environmentKeys',
  );
}

// ---------------------------------------------------------------- check

async function checkCheckRules() {
  const { parseProbeTargetPolicy } = await loadAdapters();
  const cases = [
    [
      'a command entry for an api interface',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry = [
            {
              interfaceId: 'grader',
              executable: 'grader',
              target: 'server/grader.js',
              subcommandPaths: [[]],
              artifacts: {},
              environmentKeys: [],
              maxElapsedMs: 1000,
              infrastructureExitCodes: [],
            },
          ];
        }),
      'registry',
      'serves interface "grader" as cli, and contract.json declares it "api"',
    ],
    [
      'two HTTP entries for one interface',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry.push({ ...evaluation.registry[0] });
        }),
      'registry',
      'repeats interface "grader" as an HTTP target',
    ],
    [
      'an HTTP entry naming both a port and a server',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].port = 8080;
        }),
      'schema',
      'oneOf',
    ],
    [
      'an HTTP entry naming neither a port nor a server',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          delete evaluation.registry[0].server;
        }),
      'schema',
      'oneOf',
    ],
    [
      'a port file that is a link',
      ({ folder }) => {
        const file = path.join(folder, HTTP_PORT_MODULE);
        fs.renameSync(file, `${file}.real`);
        fs.symlinkSync(`${file}.real`, file);
      },
      'adapter',
      'adapter/http-probe-port.mjs is not a regular file',
    ],
    [
      'a started service argument naming the live tree',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].server.targetArgs = [`--policy=${path.join(FIXTURE, 'rules', 'policy.txt')}`];
        }),
      'schema',
      'targetArgs/0',
    ],
    [
      'a port file key that is the port key',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].server = {
            ...evaluation.registry[0].server,
            portFileEnvironmentKey: 'PORT',
          };
        }),
      'registry',
      'names "PORT" as both its server\'s portEnvironmentKey and its portFileEnvironmentKey',
    ],
    [
      'a port file key the server also reads from the host',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].server.environmentKeys.push('PORT_FILE');
        }),
      'registry',
      'names "PORT_FILE" as its server\'s portFileEnvironmentKey and in its environmentKeys',
    ],
    [
      'a port key the server also reads from the host',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].server.environmentKeys.push('PORT');
        }),
      'registry',
      'names "PORT" as its server\'s portEnvironmentKey and in its environmentKeys',
    ],
    [
      'a port file key naming PATH',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].server.portFileEnvironmentKey = 'Path';
        }),
      'schema',
      'portFileEnvironmentKey',
    ],
    [
      'an HTTP entry whose IPv4 host a URL spells otherwise',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].host = '127.1';
        }),
      'registry',
      'names host "127.1", which a URL spells "127.0.0.1"',
    ],
    [
      'an HTTP entry whose IPv6 host a URL spells otherwise',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].host = '0:0:0:0:0:0:0:1';
        }),
      'registry',
      'which a URL spells "::1"',
    ],
    [
      'an auth header over plain http to an address that is not loopback',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].addresses = ['127.0.0.1', '192.0.2.10'];
        }),
      'registry',
      'sends its authorization header over plain http to "192.0.2.10", where eval-quality\'s staysOnHost says a connection leaves this host, so the credential would cross the network in clear text; serve the target over https with scheme "https" (setting NODE_EXTRA_CA_CERTS',
    ],
    // eval-quality's classifyAddress classes both spellings below loopback, reading the embedded IPv4 address; a
    // connection to either goes through a translator and leaves the host, so the credential rule holds staysOnHost.
    [
      'an auth header over plain http to the NAT64 spelling of a loopback address',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].addresses = ['127.0.0.1', '64:ff9b::7f00:1'];
        }),
      'registry',
      'sends its authorization header over plain http to "64:ff9b::7f00:1", where eval-quality\'s staysOnHost says a connection leaves this host',
    ],
    [
      'an auth header over plain http to the IPv4-compatible spelling of a loopback address',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].addresses = ['127.0.0.1', '::127.0.0.1'];
        }),
      'registry',
      'sends its authorization header over plain http to "::127.0.0.1", where eval-quality\'s staysOnHost says a connection leaves this host',
    ],
    [
      'a deployment origin whose host a URL spells otherwise',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].deployments = [{ scheme: 'http', host: '127.1', port: 41_001, addresses: ['127.0.0.1'] }];
        }),
      'registry',
      'registry[0].deployments[0] names host "127.1", which a URL spells "127.0.0.1"',
    ],
    [
      'an auth header over plain http to a deployment that leaves the host',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].deployments = [{ scheme: 'http', host: 'grader.example.test', port: 80, addresses: ['192.0.2.10'] }];
        }),
      'registry',
      'registry[0].deployments[0] sends its authorization header over plain http to "192.0.2.10"',
    ],
    [
      'a folder with no HTTP port',
      ({ folder }) => fs.rmSync(path.join(folder, 'adapter'), { recursive: true }),
      'adapter',
      'adapter/http-probe-port.mjs is absent',
    ],
    [
      "a degenerate response answering an HTTP request with a command's response",
      ({ folder }) => {
        writeJson(path.join(folder, 'corpus', 'gameability', 'P-009.json'), {
          schemaVersion: 1,
          steps: { 'grade-run': { stdout: 'ok', stderr: '', exitCode: 0 } },
        });
        writeJson(path.join(folder, 'probes', 'P-009.probe.json'), {
          probeId: 'P-009',
          probeClass: 'gameability',
          behaviorId: 'B-001',
          expectedClean: false,
          rationale: 'A shortcut answer.',
          defects: [],
          qualification: { route: 'gameability', degenerateResponse: 'Prints ok.', naiveOracle: 'O-001' },
        });
      },
      'gameability',
      "answers step grade-run, an HTTP request, with a command's response",
    ],
  ];
  for (const [index, [what, edit, rule, expected]] of cases.entries()) {
    const project = makeProject(`check-${index}`, { edit });
    const checked = evaluate(['check', '--evaluation', project.folder], project.env);
    // A finding prints as `<file>: [<rule>] <message>`.
    const named = checked.output.split('\n').some((line) => line.includes(`[${rule}]`) && line.includes(expected));
    check(
      checked.status === 10 && named,
      `${what}: check exited ${checked.status}; expected 10 under ${rule} naming ${JSON.stringify(expected)}\n${checked.output}`,
    );
  }

  // An auth header over plain http to every spelling that stays on the host passes: a 127.0.0.0/8 address, ::1 and
  // the ::ffff: spelling of a 127.0.0.0/8 address.
  const onHost = makeProject('check-on-host', {
    edit: ({ folder }) =>
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.registry[0].addresses = ['127.0.0.1', '127.0.0.2', '::1', '::ffff:127.0.0.1'];
      }),
  });
  const onHostChecked = evaluate(['check', '--evaluation', onHost.folder], onHost.env);
  const [onHostEntry] = readJson(path.join(onHost.folder, 'evaluation.json')).registry;
  check(
    onHostChecked.status === 0 && onHostEntry.scheme === 'http' && onHostEntry.auth !== undefined,
    `an auth header over plain http to addresses that stay on the host: check exited ${onHostChecked.status}; expected 0\n${onHostChecked.output}`,
  );

  // A host a URL spells the same, letter case aside, passes: the port hands eval-quality's policy the URL's hostname,
  // which the policy reads in lower case, as it reads the entry's host.
  const mixedCase = makeProject('check-mixed-case', {
    edit: ({ folder }) =>
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.registry[0].host = 'LocalHost';
      }),
  });
  const accepted = evaluate(['check', '--evaluation', mixedCase.folder], mixedCase.env);
  const [mixedEntry] = readJson(path.join(mixedCase.folder, 'evaluation.json')).registry;
  const { evaluateTarget } = await loadEngine();
  const decision = evaluateTarget(
    portConfiguration({
      entries: [mixedEntry],
      portOf: () => 4242,
      parsePolicy: parseProbeTargetPolicy,
      readEnvironment: () => ({}),
      interfaceId: 'grader',
    }).policy,
    {
      interfaceId: 'grader',
      scheme: 'http',
      host: new URL(`http://${mixedEntry.host}:4242/`).hostname,
      port: 4242,
      address: '127.0.0.1',
      method: 'GET',
    },
  );
  check(
    accepted.status === 0 && decision.allowed === true,
    `a host spelled LocalHost: check exited ${accepted.status} and the policy decided ${JSON.stringify(decision)}\n${accepted.output}`,
  );
}

/** A run that sealed no trial set fails its case with its own evidence, kept where the suite's cleanup leaves it. */
function checkSealedEvidence() {
  const runDirectory = scratch.make('unsealed-run');
  writeJson(path.join(runDirectory, 'run.json'), { outcome: { exitCode: 12, message: 'a run-json message' } });
  writeJson(path.join(runDirectory, 'trials', 'clean', 'fault.json'), { code: 'port-failure', message: 'a fault message' });
  fs.mkdirSync(path.join(runDirectory, 'evaluator', 'clean'), { recursive: true });
  fs.writeFileSync(path.join(runDirectory, 'evaluator', 'clean', 'trial-2.stderr'), 'an agent stderr line\n');
  writeJson(path.join(runDirectory, 'probes.json'), { unquoted: 'a probes body' });
  const reported = [];
  const sealed = checkSealed('a unit run', { status: 12, signal: null, stderr: 'a run stderr line\n' }, runDirectory, (ok, message) =>
    reported.push({ ok, message }),
  );
  const [{ ok, message } = {}] = reported;
  const kept = /kept in (\S+)$/m.exec(message ?? '')?.[1];
  check(
    sealed === false &&
      reported.length === 1 &&
      ok === false &&
      message.split('\n')[0].includes('a unit run sealed no trial set: exit code 12, signal none') &&
      ['a run stderr line', 'a run-json message', 'a fault message', 'an agent stderr line', 'probes.json ('].every((text) =>
        message.includes(text),
      ) &&
      !message.includes('a probes body'),
    `an unsealed run's failure carries ${JSON.stringify(reported)}`,
  );
  check(
    kept !== undefined &&
      path.dirname(kept) === fs.realpathSync(os.tmpdir()) &&
      fs.readFileSync(path.join(kept, 'stderr.txt'), 'utf8') === 'a run stderr line\n' &&
      fs.existsSync(path.join(kept, 'run', 'trials', 'clean', 'fault.json')),
    `an unsealed run's evidence was not kept whole: ${kept}`,
  );
  if (kept !== undefined) fs.rmSync(kept, { recursive: true, force: true });

  writeJson(path.join(runDirectory, 'trial-sets.json'), {});
  const reportedSealed = [];
  check(
    checkSealed('a sealed unit run', { status: 0, signal: null, stderr: '' }, runDirectory, (...args) => reportedSealed.push(args)) &&
      reportedSealed.length === 0,
    `a sealed run was reported: ${JSON.stringify(reportedSealed)}`,
  );
}

/**
 * The pipeline in a confined run (Story 1.31): with no log to write outside
 * its workspace, the target runs under the host's mechanism through check,
 * run and score, and the audit finds nothing it opened outside what it was
 * granted. Under Bubblewrap the server runs in a network namespace of its own
 * and the run reaches it through the bridge (Story 1.63), for a server that
 * reports its port and for one that is told it; the audit lists nothing for
 * the bridge, whose directory is a grant of the call.
 */
async function checkConfinedPipeline() {
  // The fixture's server reports the port it bound; the second project drops that key, so the runtime chooses the port and the
  // server is told it (Story 1.63: under Bubblewrap each handoff goes through the bridge, so each is a case of its own).
  for (const [handoff, label, edit] of [
    ['reports its port', 'confined', () => {}],
    [
      'is told its port',
      'confined-told',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          delete evaluation.registry[0].server.portFileEnvironmentKey;
        }),
    ],
  ]) {
    const project = makeProject(label, { log: false, edit });
    const env = { ...project.env, GRADER_TOKEN: TOKEN };
    const ran = evaluate(['run', '--evaluation', project.folder], env);
    check(ran.status === 0, `a confined run over the HTTP fixture whose server ${handoff} exited ${ran.status}; expected 0\n${ran.output}`);
    const runDirectory = runDirectoryOf(project.folder);
    if (runDirectory === null) {
      check(false, `the confined HTTP run whose server ${handoff} wrote no run directory`);
      continue;
    }
    const record = readJson(path.join(runDirectory, 'run.json'));
    const confinement = process.platform === 'darwin' ? 'seatbelt' : 'bubblewrap';
    check(
      record.completed === true && record.confinement === confinement,
      `a confined HTTP run whose server ${handoff} records ${JSON.stringify({ completed: record.completed, confinement: record.confinement })}`,
    );
    for (const set of fs.existsSync(path.join(runDirectory, 'trial-sets.json'))
      ? readJson(path.join(runDirectory, 'trial-sets.json')).trialSets
      : []) {
      const manifest = readJson(path.join(runDirectory, set.isolationManifest));
      check(
        manifest.observedMounts.length === 0,
        `a confined HTTP trial set whose server ${handoff} observed mounts ${JSON.stringify(manifest.observedMounts)}`,
      );
    }
    const scored = evaluate(['score', '--evaluation', project.folder], env);
    check(
      scored.status === 0,
      `score over the confined HTTP run whose server ${handoff} exited ${scored.status}; expected 0\n${scored.output}`,
    );
  }
}

/**
 * The confined started service's reads and the confined HTTP port (Story
 * 1.31): a started service that reads the evaluation folder's contract.json is
 * refused, and one that reads a file outside its workspace is let through; the
 * audit lists both paths, by their real paths, as the trial set's observed
 * mounts, and the file drops out once the entry declares its directory in
 * `systemPaths`. The evaluation's HTTP port, which runs with the evaluation
 * folder read-only, is refused each write it tries under `runs/`, and notes
 * each attempt in a file outside the folder. An opted-out control, where the
 * service reads the contract and the port's write lands, shows both attempts
 * are made.
 */
async function checkConfinedServiceReads() {
  const outside = path.join(scratch.make('confined-outside'), 'host-notes.txt');
  fs.writeFileSync(outside, 'a file no trial was granted\n');
  const realOutside = fs.realpathSync(outside);
  const probeStart = '  async function probe(input, signal) {\n';
  const reading = ({ declared = false, optOut = false } = {}) => ({
    log: false,
    edit: ({ folder, directory }) => {
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.registry[0].server.environmentKeys.push('GRADER_READ');
        if (declared) evaluation.registry[0].systemPaths = [path.dirname(realOutside)];
        if (optOut) evaluation.confinement = false;
      });
      // The port tries a write under the evaluation folder at every call and notes how it ended outside the folder.
      const file = path.join(folder, HTTP_PORT_MODULE);
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes(probeStart)) throw new Error("the port template's probe no longer opens as the test edits it");
      const tamper = JSON.stringify(path.join(folder, 'runs', '.port-tamper'));
      const attempts = JSON.stringify(path.join(directory, 'port-attempts.txt'));
      fs.writeFileSync(
        file,
        source.replace(
          probeStart,
          `${probeStart}    {
      const portFs = await import('node:fs');
      let outcome = 'allowed';
      try {
        portFs.writeFileSync(${tamper}, 'written by the HTTP port\\n');
      } catch (error) {
        outcome = \`refused \${error.code}\`;
      }
      portFs.appendFileSync(${attempts}, \`\${outcome}\\n\`);
    }
`,
        ),
      );
    },
  });
  const runReading = (label, options) => {
    const project = makeProject(label, reading(options));
    const contract = path.join(fs.realpathSync(project.folder), 'contract.json');
    const ran = evaluate(['run', '--evaluation', project.folder], {
      ...project.env,
      GRADER_TOKEN: TOKEN,
      GRADER_READ: JSON.stringify({ contract, outside }),
    });
    check(ran.status === 0, `${label}: run exited ${ran.status}; expected 0\n${ran.output}`);
    const runDirectory = runDirectoryOf(project.folder);
    const trial = runDirectory === null ? null : path.join(runDirectory, 'trials', 'clean', 'trial-1.json');
    const evidence = trial !== null && fs.existsSync(trial) ? fs.readFileSync(trial, 'utf8') : '';
    const manifest =
      runDirectory === null ? null : readIfPresent(path.join(runDirectory, 'trial-sets', 'P-001', 'isolation-manifest.json'));
    const attemptsFile = path.join(project.directory, 'port-attempts.txt');
    const attempts = fs.existsSync(attemptsFile) ? fs.readFileSync(attemptsFile, 'utf8').split('\n').filter(Boolean) : [];
    const tamper = path.join(project.folder, 'runs', '.port-tamper');
    const tampered = fs.existsSync(tamper);
    fs.rmSync(tamper, { force: true });
    return { contract, evidence, observed: manifest?.observedMounts ?? null, attempts, tampered };
  };
  const refusal = /contract: refused (EPERM|EACCES|ENOENT|EROFS)/;

  // The kernel's report channel on macOS can lose a report under load (Story 1.60): a run whose audit lists only what it should, but
  // not all of it, runs again (up to two more times) before the exact comparison below counts. Any extra path counts at once.
  const wanted = (run) => [run.contract, realOutside].sort();
  const lostOnly = (run) =>
    Array.isArray(run.observed) &&
    run.observed.every((entry) => wanted(run).includes(entry)) &&
    wanted(run).some((entry) => !run.observed.includes(entry));
  let confined = runReading('confined-reads');
  for (let again = 0; again < 2 && process.platform === 'darwin' && lostOnly(confined); again += 1) confined = runReading('confined-reads');
  check(refusal.test(confined.evidence), `a confined started service's read of contract.json was not refused: ${confined.evidence}`);
  check(
    /outside: allowed/.test(confined.evidence),
    `a confined started service could not read the ungranted file, so the case proves nothing: ${confined.evidence}`,
  );
  check(
    JSON.stringify(confined.observed) === JSON.stringify([confined.contract, realOutside].sort()),
    `a confined started service's trial set observed ${JSON.stringify(confined.observed)}; expected the contract and ${realOutside}`,
  );
  check(
    confined.attempts.length > 0 &&
      confined.attempts.every((line) => /^refused (EPERM|EACCES|EROFS|ENOENT)$/.test(line)) &&
      !confined.tampered,
    `a confined HTTP port's writes under the evaluation folder ended ${JSON.stringify(confined.attempts)} (written: ${confined.tampered}); expected each refused`,
  );

  let declared = runReading('confined-reads-declared', { declared: true });
  for (
    let again = 0;
    again < 2 && process.platform === 'darwin' && Array.isArray(declared.observed) && declared.observed.length === 0;
    again += 1
  ) {
    declared = runReading('confined-reads-declared', { declared: true });
  }
  check(
    refusal.test(declared.evidence) && /outside: allowed/.test(declared.evidence),
    `a started service under a declared system path read: ${declared.evidence}`,
  );
  check(
    JSON.stringify(declared.observed) === JSON.stringify([declared.contract]),
    `a read under a declared system path was reported: ${JSON.stringify(declared.observed)}; expected the contract alone`,
  );

  // The control: with the confinement off, the same service reads the contract and the port's write lands.
  const open = runReading('confined-reads-open', { optOut: true });
  check(/contract: allowed/.test(open.evidence), `the unconfined control could not read contract.json: ${open.evidence}`);
  check(
    open.tampered && open.attempts.length > 0 && open.attempts.every((line) => line === 'allowed'),
    `the unconfined control's HTTP port did not write under the evaluation folder: ${JSON.stringify(open.attempts)} (written: ${open.tampered})`,
  );
}

// ---------------------------------------------------------------- the bridge to a Bubblewrap target's server (Story 1.63)

/** The directories of cases whose Unix sockets need a short path, removed when the suite ends. */
const shortDirectories = [];

/** A directory under `/tmp` whose path leaves room for a Unix socket (a socket path holds about 100 bytes); the suite's scratch directories are too deep on macOS. */
function shortDirectory() {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join('/tmp', 'tea-bt-')));
  shortDirectories.push(directory);
  return directory;
}

/** Whether a connection to `port` on the loopback is refused now: `true`, or what the attempt ended with. */
function refusedAt(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve('connected');
    });
    socket.once('error', (error) => resolve(error.code === 'ECONNREFUSED' ? true : error.code));
  });
}

/** A port number nothing listens on now (the system gave it and it was released); with a retry for the rare reuse, `withFreePort`. */
function freeNumber() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Runs `run` with a free port number, again with another while it answers `{ taken: true }` (another process took the number first). */
async function withFreePort(run) {
  let result;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    result = await run(await freeNumber());
    if (result?.taken !== true) return result;
  }
  return result;
}

/** How a connection to the loopback port ends within a second: `refused`, `closed with no byte`, or `data` / `held`. */
function connectionOutcome(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let bytes = 0;
    let connected = false;
    const done = (value) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => done(connected ? 'held' : 'timeout'), 1000);
    socket.on('connect', () => {
      connected = true;
    });
    socket.on('data', (chunk) => {
      bytes += chunk.length;
      done('data');
    });
    socket.on('end', () => done(bytes === 0 ? 'closed with no byte' : 'data'));
    socket.on('close', () => done(connected && bytes === 0 ? 'closed with no byte' : 'closed'));
    socket.on('error', (error) => done(error.code === 'ECONNREFUSED' ? 'refused' : error.code));
  });
}

/** One GET to the loopback: `{ status, body }`, the body parsed when it is JSON. */
function getLoopback(port, pathname, headers = {}) {
  return new Promise((resolve) => {
    http
      .get({ host: '127.0.0.1', port, path: pathname, headers }, (response) => {
        let text = '';
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => {
          let body = text;
          try {
            body = JSON.parse(text);
          } catch {
            // A body that is no JSON is returned as it is.
          }
          resolve({ status: response.statusCode, body });
        });
      })
      .on('error', (error) => resolve({ status: null, body: error.code }));
  });
}

/**
 * The bridge to a started server whose network namespace is its own (Story 1.63), over the real status shim and the real
 * HTTP port process with no Bubblewrap: a mechanism stands in for the confined one, starts the fixture's server through the
 * shim with `--bridge` and asks nothing of the host's network (every host has one loopback, so a server's port inside the
 * namespace and the port the runtime listens on can be told apart only when the system gives the runtime another). A call
 * through `createApiPort` is answered through the forwarder, makes its bridge directory on the run's scratch list and removes
 * it with the call, and a mechanism that does not bridge makes none. With `callServer` itself: a server that reports a
 * port the host holds is reached on the port the runtime was given (not the reported one), which also answers a request;
 * a chosen port the forwarder cannot take is refused as one another process holds; a server that has not bound is not
 * ready, and one that never binds ends with the message it had before the bridge; one that exits before it binds ends the
 * call with its exit and leaves nothing listening; an address that is no loopback name, and a temp directory too long for
 * a socket path, are refused before anything starts. One thing a host cannot show: with no network namespace, the server's
 * loopback and the host's are one, so a readiness check made on the host and one made through the bridge answer alike; the
 * Linux job's confined pipeline (each handoff) is what holds the bridged readiness, since a check made on the host never
 * sees a server inside the namespace.
 */
/**
 * What the bridged-server cases share: the fixture's entries and request, the stand-in for the confined mechanism that starts
 * the fixture's server through the real status shim (`bridging`), and the projects, environment and `callServer` over them.
 */
async function bridgedHarness() {
  const shim = path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'confinement-status.cjs');
  const { nodeCommandMechanism } = await loadAdapters();
  const [entry] = readJson(path.join(FIXTURE, EVALUATION, 'evaluation.json')).registry;
  const chosenEntry = { ...entry, server: (({ portFileEnvironmentKey, ...server }) => server)(entry.server) };
  const request = {
    probeId: 'bridged-1',
    interfaceId: 'grader',
    operationId: 'grade-answer',
    kind: 'api',
    method: 'GET',
    pathTemplate: '/grade',
    channels: { path: {}, query: { answer: 'forty-two' }, header: {}, body: { kind: 'absent' } },
  };
  const statusDirectory = scratch.make('bridged-status');
  let started = 0;
  /** The confined mechanism's bridging without Bubblewrap: the shim serves the bridge and starts the server. */
  const bridging = (record = []) => ({
    bridges: true,
    run: (call, signal) => {
      started += 1;
      record.push({ ...call, directoryHeld: fs.existsSync(path.dirname(call.bridge)) });
      return nodeCommandMechanism.run(
        {
          ...call,
          target: process.execPath,
          subcommandPath: [],
          argv: [shim, '--bridge', call.bridge, path.join(statusDirectory, `status-${started}.json`), call.target, ...call.argv],
        },
        signal,
      );
    },
  });
  /** A project whose server logs where `project.log` says, with `policy` lines appended. */
  const projectWith = (label, policy = []) =>
    makeProject(label, {
      edit: ({ root }) => {
        if (policy.length > 0) fs.appendFileSync(path.join(root, 'rules', 'policy.txt'), `${policy.join('\n')}\n`);
      },
    });
  const environmentOf = (project) => {
    const values = { GRADER_LOG: project.log, GRADER_TOKEN: TOKEN };
    return (names) => Object.fromEntries(names.filter((name) => values[name] !== undefined).map((name) => [name, values[name]]));
  };
  const serverOf = (project) => path.join(project.root, 'server', 'grader.js');
  const listened = (project) => sessions(project).filter((line) => line.event === 'listen');
  /** A `callServer` over `project`, its bridge in a short directory. */
  const bridgedServer = (project, serverEntry, options = {}) => {
    const directory = shortDirectory();
    return callServer({
      entry: serverEntry,
      portFile: serverEntry.server.portFileEnvironmentKey === undefined ? null : path.join(directory, 'port'),
      bridge: path.join(directory, 'sock'),
      cwd: project.root,
      target: serverOf(project),
      environment: environmentOf(project)(serverEntry.server.environmentKeys),
      mechanism: options.mechanism ?? bridging(),
      maxOutputBytes: 1024 * 1024,
      ...options.call,
    });
  };
  const signal = () => new AbortController().signal;

  return {
    shim,
    nodeCommandMechanism,
    entry,
    chosenEntry,
    request,
    bridging,
    projectWith,
    environmentOf,
    serverOf,
    listened,
    bridgedServer,
    signal,
  };
}

async function checkBridgedServer() {
  const {
    entry,
    request,
    bridging,
    projectWith,
    environmentOf,
    serverOf,
    listened,
    bridgedServer,
    signal,
    nodeCommandMechanism,
    chosenEntry,
  } = await bridgedHarness();
  // A call through the port: answered through the forwarder, its directories on the run's scratch list while it runs.
  const project = projectWith('bridged-call');
  const httpPort = await probeHttpPort(project.folder);
  const temp = shortDirectory();
  const scratchList = [];
  const record = [];
  const observation = await withEnvironment({ TMPDIR: temp }, () =>
    createApiPort({
      entries: [entry],
      httpPort,
      cwd: project.root,
      targetOf: () => serverOf(project),
      readEnvironment: environmentOf(project),
      mechanism: {
        ...bridging(record),
        run: (call, mechanismSignal) => {
          record.push({ onScratchList: scratchList.includes(path.dirname(call.bridge)) });
          return bridging(record).run(call, mechanismSignal);
        },
      },
      maxOutputBytes: 1024 * 1024,
      scratch: scratchList,
    })
      .probe(request)
      .catch((error) => error),
  );
  check(
    observation?.kind === 'api' && observation.status === 200,
    `a call through a bridged server was answered ${JSON.stringify(observation?.status ?? observation?.message)}; expected status 200`,
  );
  const [onList, bridgedCall] = record;
  check(
    onList?.onScratchList === true &&
      bridgedCall?.directoryHeld === true &&
      path.basename(bridgedCall.bridge) === 'b' &&
      path.dirname(bridgedCall.bridge).startsWith(path.join(temp, 'tea-nb-')),
    `the call's bridge was ${JSON.stringify(record)}; expected a socket in a tea-nb-* directory under the temp directory, on the run's scratch list while the call ran`,
  );
  check(
    scratchList.length === 0 && fs.readdirSync(temp).length === 0,
    `a bridged call left ${JSON.stringify(scratchList)} on the scratch list and ${JSON.stringify(fs.readdirSync(temp))} in its temp directory`,
  );
  check(
    listened(project).length === 1 &&
      sessions(project).some((line) => line.event === 'request') &&
      (await eventually(() => livingSessions(project).length === 0)),
    `a bridged call's server logged ${JSON.stringify(sessions(project))}; expected one start, a request and an end with the call`,
  );

  // A mechanism that does not bridge makes no bridge: the server is started as before.
  const plain = [];
  const unbridged = await createApiPort({
    entries: [entry],
    httpPort,
    cwd: project.root,
    targetOf: () => serverOf(project),
    readEnvironment: environmentOf(project),
    mechanism: {
      run: (call, mechanismSignal) => {
        plain.push(call);
        return nodeCommandMechanism.run(call, mechanismSignal);
      },
    },
    maxOutputBytes: 1024 * 1024,
    scratch: [],
  })
    .probe(request)
    .catch((error) => error);
  check(
    unbridged?.status === 200 && plain.length === 1 && plain[0].bridge === undefined,
    `a mechanism that does not bridge was handed ${JSON.stringify(plain.map((call) => call.bridge))} and answered ${JSON.stringify(unbridged?.status ?? unbridged?.message)}`,
  );

  // A server that reports a port the host holds: the runtime listens on another, the call goes there, and it answers.
  const reporting = projectWith('bridged-report');
  const reported = bridgedServer(reporting, entry);
  const forwarded = await reported.start(signal(), '127.0.0.1').catch((error) => error);
  const bound = listened(reporting)[0]?.port;
  check(
    Number.isInteger(forwarded) && Number.isInteger(bound) && forwarded !== bound && reported.isReady(),
    `a server that bound ${bound} was ready on ${JSON.stringify(forwarded?.message ?? forwarded)}; expected the port the runtime listens on, another than the reported one, since the host holds it`,
  );
  if (Number.isInteger(forwarded)) {
    const answered = await getLoopback(forwarded, '/policy', { authorization: `Bearer ${TOKEN}` });
    check(
      answered.status === 200 && answered.body?.ok === true,
      `a request to the port the runtime listens on was answered ${JSON.stringify(answered)}; expected the server's /policy through the bridge`,
    );
  }
  await reported.stop();
  check(
    !Number.isInteger(forwarded) || (await refusedAt(forwarded)) === true,
    `the runtime still listened on port ${forwarded} after the call's server was stopped`,
  );
  check(await eventually(() => livingSessions(reporting).length === 0), 'a bridged server outlived its call');

  // A chosen port another process already holds is refused before the server starts, as without a bridge.
  const chosen = projectWith('bridged-chosen');
  const holding = net.createServer();
  const chosenPort = await new Promise((resolve) => holding.listen(0, '127.0.0.1', () => resolve(holding.address().port)));
  const taken = bridgedServer(chosen, chosenEntry, { call: { port: chosenPort } });
  const takenError = await taken.start(signal(), '127.0.0.1').catch((error) => error);
  check(
    String(takenError?.message).includes(`another process listens on 127.0.0.1 port ${chosenPort}, which was chosen for the server`) &&
      sessions(chosen).length === 0,
    `a chosen port another process holds gave ${takenError?.message ?? 'a ready server'} (the server logged ${JSON.stringify(sessions(chosen))})`,
  );
  await taken.stop();
  await new Promise((resolve) => holding.close(resolve));

  // A server that has not bound is not ready; one that never binds ends at readyTimeoutMs with the message it always had.
  const slow = projectWith('bridged-slow', ['start: delay 1200']);
  const waiting = bridgedServer(slow, entry);
  const began = Date.now();
  const pending = waiting.start(signal(), '127.0.0.1').catch((error) => error);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const earlyReady = waiting.isReady();
  const slowPort = await pending;
  check(
    earlyReady === false && Number.isInteger(slowPort) && Date.now() - began >= 1000 && listened(slow).length === 1,
    `a server that binds after 1200ms was ready early (${earlyReady}) or ended as ${JSON.stringify(slowPort?.message ?? slowPort)} after ${Date.now() - began}ms`,
  );
  await waiting.stop();
  // An address no bridge reaches is refused before anything starts.
  let ran = 0;
  const refusing = bridgedServer(projectWith('bridged-address'), entry, {
    mechanism: { bridges: true, run: () => (ran += 1) && new Promise(() => {}) },
  });
  const addressError = await refusing.start(signal(), '10.0.0.5').catch((error) => error);
  check(
    String(addressError?.message).includes('network namespace of its own') &&
      String(addressError.message).includes('10.0.0.5') &&
      ran === 0,
    `a bridged server asked to listen on a non-loopback address gave ${addressError?.message ?? 'a ready server'} (started ${ran})`,
  );
}

/**
 * A bridge socket that stands in for a network namespace on a host that has one loopback: it speaks the shim's protocol and
 * answers a port asked inside the "namespace" by connecting to the real port `map` gives for it, so a server can listen on one
 * port while the runtime's forwarder holds another, which a shim on a shared loopback cannot show. `onReady` runs once the
 * upstream has connected, just before the `ok`.
 */
function standInBridge(socketPath, { map, onReady = () => {} }) {
  const connections = new Set();
  const server = net.createServer({ allowHalfOpen: true }, (client) => {
    connections.add(client);
    client.once('close', () => connections.delete(client));
    client.on('error', () => client.destroy());
    let buffer = Buffer.alloc(0);
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const newline = buffer.indexOf(10);
      if (newline === -1) return;
      client.off('data', onData);
      client.pause();
      const asked = /^(\S+) (\d+)$/.exec(buffer.toString('utf8', 0, newline));
      const real = asked === null ? undefined : map.get(Number(asked[2]));
      const rest = buffer.subarray(newline + 1);
      if (real === undefined) {
        client.end('fail\n');
        return;
      }
      if (rest.length > 0) client.unshift(rest);
      const upstream = net.connect({ host: '127.0.0.1', port: real, allowHalfOpen: true });
      let connected = false;
      upstream.once('error', () => {
        if (!connected) client.end('fail\n');
      });
      upstream.once('connect', () => {
        connected = true;
        onReady();
        client.write('ok\n');
        shimModule.splice(client, upstream);
      });
    };
    client.on('data', onData);
  });
  return new Promise((resolve) =>
    server.listen(socketPath, () =>
      resolve({
        close() {
          server.close();
          for (const connection of connections) connection.destroy();
        },
      }),
    ),
  );
}

/** Writes `text` to `file` so a reader that sees the file sees all of it. */
function writeWhole(file, text) {
  fs.writeFileSync(`${file}.part`, text);
  fs.renameSync(`${file}.part`, file);
}

/**
 * The confined mechanism's bridging with the namespace stood in (`standInBridge`): the fixture's server runs on a port of its
 * own (the one it bound, `S`), the call is told another (a free host port `P` it writes to the port file, or the chosen one),
 * and the bridge maps `P` to `S`, so the runtime's forwarder on `P` and the server on `S` do not meet on the shared loopback.
 */
function standInMechanism(nodeCommandMechanism, { map, onReady, record = [] }) {
  return {
    bridges: true,
    run: async (call, signal) => {
      record.push(call);
      const bridge = await standInBridge(call.bridge, { map, onReady });
      const realPortFile = path.join(shortDirectory(), 'real-port');
      const running = nodeCommandMechanism.run(
        { ...call, bridge: undefined, env: { ...call.env, PORT: '0', PORT_FILE: realPortFile } },
        signal,
      );
      let settled = false;
      running.then(
        () => (settled = true),
        () => (settled = true),
      );
      while (!fs.existsSync(realPortFile) && !settled) await new Promise((resolve) => setTimeout(resolve, 20));
      if (fs.existsSync(realPortFile)) {
        const real = Number(fs.readFileSync(realPortFile, 'utf8'));
        if (typeof call.portFile === 'string') {
          const reported = await freeNumber();
          map.set(reported, real);
          writeWhole(call.portFile, String(reported));
        } else {
          map.set(Number(call.env.PORT), real);
        }
      }
      return running.finally(() => bridge.close());
    },
  };
}

/** The shim idling as a bridge: its socket, and a way to end it. */
async function startShimBridge(shim) {
  const directory = shortDirectory();
  const socket = path.join(directory, 'b');
  const child = spawn(
    process.execPath,
    [shim, '--bridge', socket, path.join(directory, 'status'), process.execPath, '-e', 'setInterval(() => {}, 1000)'],
    {
      stdio: 'ignore',
    },
  );
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(socket) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  return { socket, stop: () => child.kill('SIGTERM') };
}

/** A server of the test's own that echoes, on `host`; its port and a way to close it with its connections. */
async function listenOwn(host, handler = (socket) => socket.pipe(socket)) {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    handler(socket);
  });
  await new Promise((resolve) => server.listen(0, host, resolve));
  return {
    port: server.address().port,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        for (const socket of sockets) socket.destroy();
      }),
  };
}

/** What a client reads of `size` bytes a server sends after the client wrote `request` and half-closed, reading slowly. */
function readSlowly(port, host, request, size) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, allowHalfOpen: true });
    let bytes = 0;
    const done = () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(bytes);
    };
    const timer = setTimeout(done, 20_000);
    socket.on('connect', () => socket.end(request));
    socket.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes >= size) return done();
      socket.pause();
      setTimeout(() => socket.resume(), 5);
    });
    socket.on('end', done);
    socket.on('error', done);
  });
}

/**
 * The bridge's two halves where the shared loopback hid them (Story 1.63), over a stood-in namespace and the real halves:
 *
 * - A server that reports a port the host has free is reached on that same number (the runtime listens on the number the
 *   server reported); a chosen port is the runtime's before the server starts (a connection that arrives early is closed with
 *   no byte, a server that never binds ends at `readyTimeoutMs`, one that exits ends the call with its exit, and nothing listens
 *   once the call is stopped) and the call answers on it once the server is ready.
 * - A call stopped when the bridge answers, and one stopped while the forwarder starts, end with the abort and leave no
 *   listener.
 * - An entry that declares `network: host` is started directly with no bridge directory.
 * - A temp directory too long for a socket path puts the bridge directory under `/tmp`, and one with no room even there is refused.
 * - `startForwarder` keeps a free number, moves from a held one when it may, refuses it when it may not, closes within a second
 *   with a live connection, carries 4 MiB to a slow half-closing client and listens on `::1` where the host has it; `openBridge`
 *   keeps the bytes after `ok`, names a bad answer and refuses a socket that is a link or no socket.
 */
async function checkBridgedServerStandIn() {
  const harness = await bridgedHarness();
  const { entry, chosenEntry, request, projectWith, environmentOf, serverOf, listened, bridgedServer, signal, nodeCommandMechanism, shim } =
    harness;
  const { relayModule: relay } = { relayModule };

  // A server that reports a port the host has free is reached on that number.
  const reporting = projectWith('standin-report');
  const reportMap = new Map();
  const reported = bridgedServer(reporting, entry, { mechanism: standInMechanism(nodeCommandMechanism, { map: reportMap }) });
  const keptPort = await reported.start(signal(), '127.0.0.1').catch((error) => error);
  const inside = listened(reporting)[0]?.port;
  check(
    Number.isInteger(keptPort) && reportMap.has(keptPort) && reportMap.get(keptPort) === inside && keptPort !== inside,
    `a server that reported the free port ${[...reportMap.keys()]} (it bound ${inside}) was ready on ${JSON.stringify(keptPort?.message ?? keptPort)}; expected the number it reported`,
  );
  if (Number.isInteger(keptPort)) {
    const answered = await getLoopback(keptPort, '/policy', { authorization: `Bearer ${TOKEN}` });
    check(
      answered.status === 200 && answered.body?.ok === true,
      `a request to the reported port ${keptPort} was answered ${JSON.stringify(answered)}`,
    );
  }
  await reported.stop();
  check(
    !Number.isInteger(keptPort) || (await refusedAt(keptPort)) === true,
    `the runtime still listened on ${keptPort} after the call's server was stopped`,
  );

  // A chosen port: ready and answering once the server has bound.
  const chosen = projectWith('standin-chosen');
  const chosenResult = await withFreePort(async (port) => {
    const map = new Map();
    const server = bridgedServer(chosen, chosenEntry, { call: { port }, mechanism: standInMechanism(nodeCommandMechanism, { map }) });
    const ready = await server.start(signal(), '127.0.0.1').catch((error) => error);
    const answered = Number.isInteger(ready) ? await getLoopback(ready, '/policy', { authorization: `Bearer ${TOKEN}` }) : null;
    await server.stop();
    return {
      taken: String(ready?.message).includes('another process listens'),
      ready,
      port,
      answered,
      refusedAfter: await refusedAt(port),
    };
  });
  check(
    chosenResult.ready === chosenResult.port && chosenResult.answered?.status === 200 && chosenResult.refusedAfter === true,
    `a chosen-port server through the stood-in bridge was ready on ${JSON.stringify(chosenResult.ready?.message ?? chosenResult.ready)} (chosen ${chosenResult.port}), answered ${JSON.stringify(chosenResult.answered)}, and the port was ${chosenResult.refusedAfter} after its stop`,
  );

  // A chosen port is held from before the server starts: an early connection is closed with no byte, a server that never binds
  // ends at readyTimeoutMs, and nothing listens once the call is stopped.
  const never = projectWith('standin-never', ['start: delay 8000']);
  const neverResult = await withFreePort(async (port) => {
    const server = bridgedServer(
      never,
      { ...chosenEntry, server: { ...chosenEntry.server, readyTimeoutMs: 1500 } },
      { call: { port }, mechanism: standInMechanism(nodeCommandMechanism, { map: new Map() }) },
    );
    const pending = server.start(signal(), '127.0.0.1').catch((error) => error);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const early = await connectionOutcome(port);
    const readyEarly = server.isReady();
    const error = await pending;
    await server.stop();
    return {
      taken: String(error?.message).includes('another process listens'),
      early,
      readyEarly,
      error,
      port,
      refusedAfter: await refusedAt(port),
    };
  });
  check(
    neverResult.early === 'closed with no byte' && neverResult.readyEarly === false,
    `a connection to the chosen port ${neverResult.port} while its server had not bound ended as ${JSON.stringify(neverResult.early)} (ready: ${neverResult.readyEarly}); expected the runtime's listener to close it with no byte`,
  );
  check(
    String(neverResult.error?.message).endsWith(
      `did not accept a connection on 127.0.0.1 port ${neverResult.port} within readyTimeoutMs (1500ms); the last attempt failed with ECONNREFUSED`,
    ),
    `a bridged server that never binds gave ${neverResult.error?.message ?? 'a ready server'}`,
  );
  check(
    neverResult.refusedAfter === true,
    `something listened on the chosen port ${neverResult.port} after a server that never bound was stopped`,
  );
  check(await eventually(() => livingSessions(never).length === 0), 'a bridged server that never bound outlived its call');
  const failing = projectWith('standin-failing', ['start: fail']);
  const failed = await withFreePort(async (port) => {
    const server = bridgedServer(failing, chosenEntry, {
      call: { port },
      mechanism: standInMechanism(nodeCommandMechanism, { map: new Map() }),
    });
    const error = await server.start(signal(), '127.0.0.1').catch((error_) => error_);
    await server.stop();
    return { taken: String(error?.message).includes('another process listens'), error, port, refusedAfter: await refusedAt(port) };
  });
  check(
    String(failed.error?.message).includes('exited 3 before it accepted a connection') && failed.refusedAfter === true,
    `a bridged server that exits before it binds gave ${failed.error?.message ?? 'a ready server'} and its port was ${failed.refusedAfter} afterwards`,
  );

  // A call stopped when the bridge answers, and one stopped while the forwarder starts, end with the abort and leave no listener.
  for (const [label, late] of [
    ['when the bridge answers', false],
    ['while the forwarder starts', true],
  ]) {
    const echo = await listenOwn('127.0.0.1');
    const port = await freeNumber();
    const directory = shortDirectory();
    let server = null;
    let forwarders = 0;
    const mechanism = {
      bridges: true,
      run: async (call, abort) => {
        const bridge = await standInBridge(call.bridge, {
          map: new Map([[port, echo.port]]),
          onReady: () => (late ? undefined : server.stop()),
        });
        writeWhole(call.portFile, String(port));
        return new Promise((resolve) =>
          abort.addEventListener(
            'abort',
            () =>
              setTimeout(() => {
                bridge.close();
                resolve({ exitCode: 0, stdout: '', stderr: '' });
              }, 300),
            { once: true },
          ),
        );
      },
    };
    server = callServer({
      entry,
      portFile: path.join(directory, 'port'),
      bridge: path.join(directory, 'b'),
      cwd: directory,
      target: 'unused',
      environment: {},
      mechanism,
      maxOutputBytes: 1024,
      relay: {
        bridgeAccepts: relay.bridgeAccepts,
        startForwarder: (options) => {
          forwarders += 1;
          if (late) server.stop();
          return relay.startForwarder(options);
        },
      },
    });
    const error = await server.start(signal(), '127.0.0.1').catch((error_) => error_);
    await server.stop();
    check(
      String(error?.message).includes('aborted while its server started') && !server.isReady(),
      `a call stopped ${label} ended as ${JSON.stringify(error?.message ?? error)}; expected the abort to end it`,
    );
    check((await refusedAt(port)) === true, `a call stopped ${label} left the runtime listening on ${port}`);
    // Stopped before the forwarder starts, the call never starts it; stopped while it starts, it starts it once and closes it.
    check(forwarders === (late ? 1 : 0), `a call stopped ${label} started the forwarder ${forwarders} time(s); expected ${late ? 1 : 0}`);
    await echo.close();
  }

  // An entry that declares `network: host` is started directly: no bridge directory and no bridge in the request.
  const hosted = projectWith('standin-host');
  const hostedHttpPort = await probeHttpPort(hosted.folder);
  const hostedTemp = shortDirectory();
  const hostedScratch = [];
  const hostedCalls = [];
  const hostedAnswer = await withEnvironment({ TMPDIR: hostedTemp }, () =>
    createApiPort({
      entries: [{ ...entry, network: 'host' }],
      httpPort: hostedHttpPort,
      cwd: hosted.root,
      targetOf: () => serverOf(hosted),
      readEnvironment: environmentOf(hosted),
      mechanism: {
        bridges: true,
        run: (call, abort) => {
          hostedCalls.push(call);
          return nodeCommandMechanism.run(call, abort);
        },
      },
      maxOutputBytes: 1024 * 1024,
      scratch: hostedScratch,
    })
      .probe(request)
      .catch((error) => error),
  );
  check(
    hostedAnswer?.status === 200 &&
      hostedCalls.length === 1 &&
      hostedCalls[0].bridge === undefined &&
      !fs.readdirSync(hostedTemp).some((name) => name.startsWith('tea-nb-')) &&
      hostedScratch.length === 0,
    `a started service whose entry declares network host was answered ${JSON.stringify(hostedAnswer?.status ?? hostedAnswer?.message)} with the bridges ${JSON.stringify(hostedCalls.map((call) => call.bridge))}; expected none and a direct start`,
  );

  // A temp directory too long for a socket path puts the bridge directory under /tmp, and the call works.
  const longTemp = path.join(shortDirectory(), 'y'.repeat(150));
  fs.mkdirSync(longTemp);
  check(Buffer.byteLength(longTemp) >= 150, 'the long temp directory of the case is not 150 bytes long');
  const longBase = bridgeDirectoryBase(longTemp);
  check(
    longBase === '/tmp',
    `a ${Buffer.byteLength(longTemp)}-byte temp directory chose ${longBase} for the bridge directory; expected /tmp`,
  );
  const shortBase = bridgeDirectoryBase(shortDirectory());
  check(shortBase !== '/tmp' || shortBase === fs.realpathSync.native(shortBase), `a short temp directory chose ${shortBase}`);
  const longProject = projectWith('standin-long');
  const longHttpPort = await probeHttpPort(longProject.folder);
  const longScratch = [];
  const longCalls = [];
  const longAnswer = await withEnvironment({ TMPDIR: longTemp }, () =>
    createApiPort({
      entries: [entry],
      httpPort: longHttpPort,
      cwd: longProject.root,
      targetOf: () => serverOf(longProject),
      readEnvironment: environmentOf(longProject),
      mechanism: harness.bridging(longCalls),
      maxOutputBytes: 1024 * 1024,
      scratch: longScratch,
    })
      .probe(request)
      .catch((error) => error),
  );
  check(
    longAnswer?.status === 200 &&
      longCalls.length === 1 &&
      /^\/(private\/)?tmp\/tea-nb-[A-Za-z0-9]{6}\/b$/.test(longCalls[0].bridge ?? '') &&
      Buffer.byteLength(longCalls[0].bridge ?? '') <= 100 &&
      longScratch.length === 0,
    `a call with a ${Buffer.byteLength(longTemp)}-byte TMPDIR was answered ${JSON.stringify(longAnswer?.status ?? longAnswer?.message)} with the bridge ${JSON.stringify(longCalls[0]?.bridge)}; expected a socket under /tmp and the call to work`,
  );
  check(
    longCalls[0]?.bridge !== undefined && !fs.existsSync(path.dirname(longCalls[0].bridge)),
    `the call's own bridge directory ${JSON.stringify(longCalls[0]?.bridge && path.dirname(longCalls[0].bridge))} was left under /tmp`,
  );
  const tooLong = [];
  let tooLongError = null;
  try {
    makeBridgeDirectory(tooLong, { temp: longTemp, fallback: longTemp });
  } catch (error) {
    tooLongError = error;
  }
  check(
    String(tooLongError?.message).includes('longer than 100 bytes') &&
      String(tooLongError.message).includes('TMPDIR') &&
      tooLong.length === 0,
    `a temp directory and a fallback with no room for a socket gave ${tooLongError?.message ?? 'a directory'} (scratch ${JSON.stringify(tooLong)})`,
  );
  check(
    fs.readdirSync(longTemp).length === 0,
    `a refused bridge directory stayed in the temp directory: ${JSON.stringify(fs.readdirSync(longTemp))}`,
  );

  // `startForwarder`.
  const keptResult = await withFreePort(async (number) => {
    try {
      const forwarder = await relay.startForwarder({
        socketPath: path.join(shortDirectory(), 'b'),
        address: '127.0.0.1',
        targetPort: 9,
        port: number,
      });
      const result = { number, port: forwarder.port };
      await forwarder.close();
      return { ...result, refusedAfter: await refusedAt(number) };
    } catch (error) {
      return error.code === 'EADDRINUSE' ? { taken: true } : { error };
    }
  });
  check(
    keptResult.port === keptResult.number && keptResult.refusedAfter === true,
    `a forwarder asked for the free port ${keptResult.number} listened on ${keptResult.port ?? keptResult.error}, and it was ${keptResult.refusedAfter} once closed`,
  );
  const holder = await listenOwn('127.0.0.1');
  const moved = await relay.startForwarder({
    socketPath: path.join(shortDirectory(), 'b'),
    address: '127.0.0.1',
    targetPort: 9,
    port: holder.port,
  });
  check(moved.port !== holder.port && moved.port > 0, `a forwarder asked for the held port ${holder.port} listened on ${moved.port}`);
  // A port the host refuses for another reason than a holder (here a number no port is): a forwarder that may not insist falls
  // back to one the system gives, and a strict one rejects.
  const refusedPort = await relay.startForwarder({
    socketPath: path.join(shortDirectory(), 'b'),
    address: '127.0.0.1',
    targetPort: 9,
    port: 70_000,
  });
  check(refusedPort.port > 0 && refusedPort.port < 65_536, `a forwarder asked for a port the host refuses listened on ${refusedPort.port}`);
  await refusedPort.close();
  const refusedStrict = await relay
    .startForwarder({ socketPath: path.join(shortDirectory(), 'b'), address: '127.0.0.1', targetPort: 9, port: 70_000, strict: true })
    .catch((error) => error);
  check(
    refusedStrict instanceof Error,
    `a strict forwarder asked for a port the host refuses gave ${JSON.stringify(refusedStrict?.port ?? refusedStrict)}`,
  );
  const insisting = await relay
    .startForwarder({ socketPath: path.join(shortDirectory(), 'b'), address: '127.0.0.1', targetPort: 9, port: holder.port, strict: true })
    .catch((error) => error);
  check(insisting?.code === 'EADDRINUSE', `a strict forwarder asked for the held port ${holder.port} gave ${insisting?.code ?? insisting}`);
  await moved.close();
  await holder.close();

  const live = await listenOwn('127.0.0.1');
  const bridge = await startShimBridge(shim);
  try {
    // close() lets go within a second of a live connection through a live bridge to a live server.
    const forwarder = await relay.startForwarder({ socketPath: bridge.socket, address: '127.0.0.1', targetPort: live.port, port: 0 });
    const held = await new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port: forwarder.port }, () => socket.write('hello'));
      socket.on('data', (chunk) => resolve({ socket, text: String(chunk) }));
      socket.on('error', () => resolve({ socket, text: 'error' }));
      setTimeout(() => resolve({ socket, text: 'timeout' }), 5000);
    });
    check(
      held.text === 'hello',
      `a connection through the forwarder, the bridge and a live server got ${JSON.stringify(held.text)}; expected the echo`,
    );
    const seen = new Promise((resolve) => {
      held.socket.once('close', () => resolve(true));
      held.socket.once('end', () => resolve(true));
      setTimeout(() => resolve(false), 2000);
    });
    const closeBegan = Date.now();
    await forwarder.close();
    check(
      Date.now() - closeBegan < 1000 && (await seen) === true,
      `closing a forwarder that held a live connection took ${Date.now() - closeBegan} ms and the client ${(await seen) ? 'saw' : 'did not see'} the close; expected under a second and the close`,
    );
    held.socket.destroy();

    // 4 MiB to a client that half-closes and reads slowly.
    const SIZE = 4 * 1024 * 1024;
    const answering = await listenOwn('127.0.0.1', (socket) => {
      socket.on('data', () => {});
      socket.on('end', () => socket.end(Buffer.alloc(SIZE, 'x')));
    });
    const big = await relay.startForwarder({ socketPath: bridge.socket, address: '127.0.0.1', targetPort: answering.port, port: 0 });
    const received = await readSlowly(big.port, '127.0.0.1', 'go', SIZE);
    check(received === SIZE, `a slow half-closing client received ${received} of ${SIZE} byte(s) through the forwarder`);
    await big.close();
    await answering.close();
  } finally {
    bridge.stop();
    await live.close();
  }
  const ipv6 = Object.values(os.networkInterfaces())
    .flat()
    .some((address) => address?.address === '::1');
  if (ipv6) {
    const echoSix = await listenOwn('::1');
    const sixBridge = await startShimBridge(shim);
    try {
      const sixth = await relay.startForwarder({ socketPath: sixBridge.socket, address: '::1', targetPort: echoSix.port, port: 0 });
      const echoed = await new Promise((resolve) => {
        const socket = net.connect({ host: '::1', port: sixth.port }, () => socket.write('six'));
        socket.on('data', (chunk) => {
          socket.destroy();
          resolve(String(chunk));
        });
        socket.on('error', (error) => resolve(error.code));
        setTimeout(() => resolve('timeout'), 5000);
      });
      check(echoed === 'six', `a forwarder on ::1 carried ${JSON.stringify(echoed)}; expected the echo`);
      await sixth.close();
    } finally {
      sixBridge.stop();
      await echoSix.close();
    }
  } else {
    console.log('  skipped the IPv6 forwarder case: this host has no ::1 address');
  }

  // `openBridge` against a scripted bridge.
  const scripted = async (answerBytes) => {
    const socket = path.join(shortDirectory(), 'b');
    const sockets = new Set();
    const server = net.createServer((client) => {
      sockets.add(client);
      client.on('error', () => {});
      client.once('data', () => client.write(answerBytes));
    });
    await new Promise((resolve) => server.listen(socket, resolve));
    return {
      socket,
      close: () => {
        server.close();
        for (const client of sockets) client.destroy();
      },
    };
  };
  for (const [label, bytes, expected] of [
    ['an answer ok with bytes after it in one write', 'ok\nhello', 'ok'],
    ['an answer that is neither ok nor fail', 'nope\n', 'protocol'],
    ['nine bytes with no newline', 'aaaaaaaaa', 'protocol'],
    ['an answer fail', 'fail\n', 'ECONNREFUSED'],
  ]) {
    const fake = await scripted(bytes);
    const opened = await relay.openBridge(fake.socket, '127.0.0.1', 80, 2000);
    if (expected === 'ok') {
      const first =
        opened.socket === undefined
          ? null
          : await new Promise((resolve) => {
              opened.socket.once('data', (chunk) => resolve(String(chunk)));
              opened.socket.resume();
              setTimeout(() => resolve('timeout'), 2000);
            });
      check(first === 'hello', `${label} left ${JSON.stringify(first ?? opened)}; expected the bytes after ok kept for the reader`);
      opened.socket?.destroy();
    } else {
      check(opened.reason === expected, `${label} gave ${JSON.stringify(opened)}; expected the reason ${expected}`);
    }
    fake.close();
  }
  check(
    (await relay.openBridge(path.join(shortDirectory(), 'absent'), '127.0.0.1', 80)).reason === 'ENOENT',
    'a bridge socket that does not exist yet was not ENOENT',
  );
  const target = await scripted('ok\n');
  const linkDirectory = shortDirectory();
  const link = path.join(linkDirectory, 'link');
  fs.symlinkSync(target.socket, link);
  const plainFile = path.join(linkDirectory, 'plain');
  fs.writeFileSync(plainFile, 'not a socket');
  for (const [label, candidate] of [
    ['a link to a socket', link],
    ['a regular file', plainFile],
  ]) {
    const refused = await relay.openBridge(candidate, '127.0.0.1', 80);
    let thrown = null;
    await relay.bridgeAccepts(candidate, '127.0.0.1', 80).catch((error) => (thrown = error));
    check(
      typeof refused.refusal === 'string' && refused.socket === undefined && thrown !== null && String(thrown.message).includes(candidate),
      `${label} in the bridge's place gave ${JSON.stringify(refused)} and ${thrown?.message ?? 'no refusal'}; expected the runtime to refuse it, naming the path`,
    );
  }
  target.close();
}

/** Runs one case; an exception is a failed check, so the cases after it still run and every failure is reported. */
async function runCase(name, body) {
  const only = process.argv.find((value) => value.startsWith('--only='))?.slice('--only='.length);
  if (only !== undefined && !name.includes(only)) return;
  try {
    await body();
  } catch (error) {
    check(false, `${name} could not finish: ${error.stack ?? error}`);
  }
}

async function main() {
  try {
    if (process.argv.includes('--letter-cases-only')) {
      // The scrub cases of Story 1.66 alone, which its revert checks run.
      await runCase('the units', checkUnits);
      await runCase('the scrub in every letter case', checkLetterCases);
      return report();
    }
    if (process.argv.includes('--uneven-escapes-only')) {
      await runCase('unevenly escaped echoes', checkUnevenEscapedCases);
      return report();
    }
    await runCase('the templates', checkTemplates);
    await runCase('the port, in process', checkPortUnits);
    await runCase('the conformance file', checkConformance);
    await runCase('the units', checkUnits);
    await runCase('the scrub in every letter case', checkLetterCases);
    await runCase('unevenly escaped echoes', checkUnevenEscapedCases);
    await runCase("an unsealed run's evidence", checkSealedEvidence);
    await runCase("the port's process", checkPortProcess);
    await runCase('the pipeline', checkPipeline);
    await runCase('the confined pipeline', checkConfinedPipeline);
    await runCase("the confined started service's reads and HTTP port", checkConfinedServiceReads);
    await runCase('the denials', checkDenials);
    await runCase("a started service's port", checkPortReport);
    await runCase('the bridged server', checkBridgedServer);
    await runCase('the bridged server, stood in', checkBridgedServerStandIn);
    await runCase('the sealed-brief agent', checkSealedBriefAgent);
    await runCase('the gameability arm', checkGameability);
    await runCase('the check rules', checkCheckRules);
    await runCase("eval-quality's policy parser", checkPolicyParser);
    for (const { label, directory } of runtimeTemps) {
      const left = fs.readdirSync(directory);
      check(left.length === 0, `the ${label} project's runs left ${JSON.stringify(left)} in their temp directory`);
    }
  } finally {
    scratch.removeAll();
    for (const directory of shortDirectories) fs.rmSync(directory, { recursive: true, force: true });
  }
  return report();
}

/** Reports the failures, or that every check passed, as the exit code of the run. */
function report() {
  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} tea-evaluate HTTP check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} tea-evaluate HTTP check(s) passed`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`${colors.red}the tea-evaluate HTTP test could not run:${colors.reset} ${error.stack ?? error}`);
    process.exitCode = 2;
  },
);
