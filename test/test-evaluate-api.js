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
 *   otherwise, an auth header over plain http to an address that is not
 *   loopback, a folder with no port, and a degenerate response of the wrong
 *   kind.
 * - Units: the registry's HTTP policy, inventory, ceilings, secrets and
 *   targets; the arm's `api` record; the scrub of an HTTP answer and of a
 *   denial naming a lowercased secret; a multi-byte answer past 64 KiB read
 *   whole; a gameability redirect to another spelling of the entry's host.
 *
 * Usage: node test/test-evaluate-api.js
 */

'use strict';

const crypto = require('node:crypto');
const acorn = require('acorn');
const fs = require('node:fs');
const http = require('node:http');
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
  callServer,
  createApiPort,
  degenerateApiPort,
  portConfiguration,
  probeHttpPort,
} = require('../cli/lib/evaluate/http-target');
const { createRegistry, registryProblems } = require('../cli/lib/evaluate/registry');
const { runTrial } = require('../cli/lib/evaluate/run');
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
 * directory and the service's log.
 */
function makeProject(label, { edit = () => {} } = {}) {
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
  const project = { root, folder, log, directory, env: { TMPDIR: temp, TMP: temp, TEMP: temp, GRADER_LOG: log, GRADER_TOKEN: TOKEN } };
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
  const names = fs.existsSync(runs) ? fs.readdirSync(runs).filter((name) => name !== '.gitignore') : [];
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
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      received.push({
        method: request.method,
        path: url.pathname,
        host: request.headers.host,
        authorization: request.headers.authorization,
        apiKey: request.headers['x-api-key'],
      });
      const hop = /^\/hop\/(\d+)$/.exec(url.pathname);
      const port = server.address().port;
      /** Where each redirecting route sends the request. */
      const redirects = {
        '/elsewhere': [307, `http://localhost:${port}/echo`],
        '/to-unlisted-host': [302, `http://no-such-host.invalid:${port}/echo`],
        '/to-unresolvable': [302, `http://unresolvable.test:${port}/echo`],
        '/bad-location': [302, 'http://[::1'],
      };
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
        response
          .writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'a=1' })
          .end(JSON.stringify({ method: request.method, query: url.search, body: body === '' ? null : JSON.parse(body) }));
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
    // The transport's prepare step runs once per request, after the policy allowed its first hop and before its cap.
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
      slowPrepared?.status === 200 &&
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
    String(unported).includes("no registry holds the evaluation's HTTP port") &&
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
      fs.writeFileSync(
        file,
        fs
          .readFileSync(file, 'utf8')
          .replace(
            'const decision = evaluateTarget(policy, { ...hopTarget, address });',
            'const decision = { allowed: true, authorization: policy.authorizations[0], canonicalAddress: address };',
          )
          .replace(
            'await prepare({ scheme, host, port, address: decision.canonicalAddress, method }, signal);',
            "await prepare({ scheme, host, port, address: decision.canonicalAddress, method: 'GET' }, signal);",
          ),
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

  // A service slower to start than a request's cap still answers: the cap counts from the moment it accepts a connection.
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
  check(
    slowRan.status === 0,
    `a service slower to start than the request's cap: preflight exited ${slowRan.status}; expected 0\n${slowRan.output}`,
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
        text.replace(
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

// ---------------------------------------------------------------- check

async function checkCheckRules() {
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
    portConfiguration({ entries: [mixedEntry], portOf: () => 4242, readEnvironment: () => ({}), interfaceId: 'grader' }).policy,
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

/** Runs one case; an exception is a failed check, so the cases after it still run and every failure is reported. */
async function runCase(name, body) {
  try {
    await body();
  } catch (error) {
    check(false, `${name} could not finish: ${error.stack ?? error}`);
  }
}

async function main() {
  try {
    await runCase('the templates', checkTemplates);
    await runCase('the port, in process', checkPortUnits);
    await runCase('the conformance file', checkConformance);
    await runCase('the units', checkUnits);
    await runCase("an unsealed run's evidence", checkSealedEvidence);
    await runCase("the port's process", checkPortProcess);
    await runCase('the pipeline', checkPipeline);
    await runCase('the denials', checkDenials);
    await runCase("a started service's port", checkPortReport);
    await runCase('the sealed-brief agent', checkSealedBriefAgent);
    await runCase('the gameability arm', checkGameability);
    await runCase('the check rules', checkCheckRules);
    for (const { label, directory } of runtimeTemps) {
      const left = fs.readdirSync(directory);
      check(left.length === 0, `the ${label} project's runs left ${JSON.stringify(left)} in their temp directory`);
    }
  } finally {
    scratch.removeAll();
  }
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
