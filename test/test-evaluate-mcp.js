/**
 * `tea-evaluate` over a stdio MCP tool server, end to end over the real
 * installed eval-quality (Story 1.10, AD-4, AD-6, AD-7, AD-8, AD-21).
 *
 * Every case copies `test/fixtures/evaluate-mcp/` (the grader, a loopback
 * stdio MCP server speaking protocol `2025-06-18` with no SDK, whose
 * `grade_answer` tool accepts an answer under `mode: strict` in
 * `rules/policy.txt` and rejects it under `mode: lenient`, the mutation M-001
 * plants) into a temp directory outside git, so its `copy` workspace (AD-8)
 * is what every leg and trial runs in. `GRADER_LOG` makes every session of the
 * server append its handshake and its tool calls to a log the test reads.
 *
 * - The pipeline: `check`, `preflight`, `run` and `score` over the fixture.
 *   The registry's `McpTargetAuthorization` passes eval-quality's
 *   `parseMcpTargetPolicy`, every leg is an `mcp` observation with a
 *   structured result, every session of the server logged the `2025-06-18`
 *   handshake, the records carry the call's arguments, its result as
 *   `response-body` and its error flag as `response-status`, a server's
 *   environment reaches no file of the project and no output, and the clean
 *   arm resolves `passed-clean-control` and the mutated arm `caught`. The
 *   server needs its `--policy=` argument, so the entry's `targetArgs` must
 *   reach it.
 * - Denials: the plan's tool removed from the entry's `tools` stops
 *   `preflight` with exit 10 and the fault's `tool-not-authorized`, at the
 *   qualification and, with no seeded probe, at the legs; an entry for
 *   another interface leaves the contract's interface
 *   `interface-not-authorized`; no server starts for any of them.
 * - A server that refuses its handshake stops the run with exit 12, the
 *   secret its refusal quotes JSON-escaped scrubbed from every file and the
 *   output; one that hangs mid-call is torn down at its ceiling
 *   (`budget-exhausted`, exit 12) with every process it started ended.
 * - A sealed-brief agent through the bridge: a listed and declared tool is
 *   recorded `evaluator-chosen` with the operation its tool name matches, a
 *   listed tool no operation declares runs and stays unrecorded, and a tool
 *   the registry does not list is denied with `tool-not-authorized` and never
 *   starts the server, a call the server answers with its error flag set is
 *   recorded with response status 1, and the server's secret reaches no file,
 *   capture or output; the arms score `passed-clean-control` and `caught`. A
 *   bridge call to a hanging server is named over the agent's own exit.
 * - Gameability: a probe whose degenerate response answers the tool call
 *   qualifies and scores `caught` with no server started in its trials, and
 *   a gameability router denies an unlisted tool and answers a listed one from
 *   the response with nothing started.
 * - `check`: two tool servers for one interface, a command and a tool server
 *   sharing one, an entry of the other kind than its interface, a tool name
 *   eval-quality refuses, an entry off its schema and a degenerate response of
 *   the wrong kind.
 * - Units: the registry's MCP policy (an entry's `maxOutputBytes` included),
 *   port, tool inventory and ceilings, the scrub (keys, JSON-escaped forms,
 *   numbers, a cause cut through a secret), the fault record, and a trial whose
 *   step is denied recording the reason.
 *
 * The denial assertions read eval-quality's `reason` on the `forbidden-target`
 * fault, which eval-quality 4.2.0 carries.
 *
 * Usage: node test/test-evaluate-mcp.js
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ENGINE_CLI_ENV, loadAdapters } = require('../cli/lib/evaluate/engine');
const { ArmError, faultRecord, hostEnvironmentPort, runArm } = require('../cli/lib/evaluate/arm');
const { syntheticPort } = require('../cli/lib/evaluate/gameability');
const { MAX_OUTPUT_BYTES, createRegistry, registryProblems } = require('../cli/lib/evaluate/registry');
const { runTrial } = require('../cli/lib/evaluate/run');
const { bridgeRouter } = require('../cli/lib/evaluate/sealed-brief-agent');
const { scratchDirectories } = require('./lib/scratch-directories');

const PROJECT_ROOT = path.join(__dirname, '..');
const EVALUATE = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const FIXTURE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate-mcp');
const STUB_AGENT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'evaluators', 'stub-mcp-agent.js');
const EVALUATION = path.join('evals', 'grader');
const TRIALS = 3;
const SECRET = 'grader-secret-value-0123';
/** A secret JSON escapes (a quote and a backslash), so a message quoting the server's JSON-RPC frame holds it escaped. */
const QUOTED_SECRET = String.raw`Qv"7\tk-Zp9#wY`;
/** A secret every escaping a serializer applies rewrites: a quote, a backslash, a slash, a non-ASCII letter, <, > and &. */
const FORMS_SECRET = String.raw`Qv"7\tk/Zä<&>p9#wY`;
/** The registry entry's ceiling for the hanging-server cases, short so a hung call is torn down quickly. */
const HANG_CEILING_MS = 3000;

const BASE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== ENGINE_CLI_ENV && !name.startsWith('GRADER_') && !name.startsWith('GIT_')),
);
const SPAWN_TIMEOUT_MS = 180_000;

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;
const scratch = scratchDirectories('tea-evaluate-mcp');
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

/** Every file under each path, recursively, with its text: a node walk, since the shell's grep honours .gitignore and skips runs/. */
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

/**
 * Where any four-character fragment of `secret`, as written or JSON-escaped, appears among `texts` (`{ where, text }`):
 * an empty list when none does.
 */
function leaksOf(texts, secret) {
  const fragments = new Set();
  for (const form of [secret, JSON.stringify(secret).slice(1, -1)]) {
    for (let at = 0; at + 4 <= form.length; at += 1) fragments.add(form.slice(at, at + 4));
  }
  return texts.flatMap(({ where, text }) =>
    [...fragments].filter((fragment) => text.includes(fragment)).map((fragment) => `${where}: ${JSON.stringify(fragment)}`),
  );
}

/** Each process the server's sessions logged that is still running: an empty list once every session ended. */
function livingSessions(project) {
  const alive = [...new Set(sessions(project).map((line) => line.pid))].filter((pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error.code !== 'ESRCH';
    }
  });
  return alive;
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

function evaluate(args, env = {}) {
  const result = spawnSync(process.execPath, [EVALUATE, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...BASE_ENV, ...env },
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  if (result.error) throw new Error(`tea-evaluate ${args.join(' ')} did not finish: ${result.error.message}`);
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/**
 * A copy of the fixture outside git, `edit` applied and the corpus index
 * digested again, with a private temp directory and the server's log.
 */
function makeProject(label, { edit = () => {} } = {}) {
  const directory = scratch.make(label);
  const root = path.join(directory, 'project');
  fs.cpSync(FIXTURE, root, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  const folder = path.join(root, EVALUATION);
  const log = path.join(directory, 'grader.jsonl');
  const temp = scratch.make(`${label}-temp`);
  runtimeTemps.push({ label, directory: temp });
  const project = { root, folder, log, directory, env: { TMPDIR: temp, TMP: temp, TEMP: temp, GRADER_LOG: log } };
  edit(project);
  const digested = evaluate(['digest', '--evaluation', folder]);
  if (digested.status !== 0) throw new Error(`digest failed: ${digested.output}`);
  return project;
}

/** Every line the server's sessions logged. */
function sessions(project) {
  return fs.existsSync(project.log)
    ? fs
        .readFileSync(project.log, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
    : [];
}

/** The newest run directory under `runs/`. */
function runDirectoryOf(folder) {
  const runs = path.join(folder, 'runs');
  const names = fs.existsSync(runs) ? fs.readdirSync(runs).filter((name) => name !== '.gitignore') : [];
  return names.length === 0 ? null : path.join(runs, names.sort().at(-1));
}

/** Scores the newest run and returns each probe's evidence artifact by probe. */
function scoreRun(project, what, expectedExit = 0) {
  const scored = evaluate(['score', '--evaluation', project.folder], project.env);
  check(scored.status === expectedExit, `${what}: score exited ${scored.status}; expected ${expectedExit}\n${scored.output}`);
  const scores = path.join(runDirectoryOf(project.folder) ?? '', 'scores');
  const latest = fs.existsSync(scores) ? fs.readdirSync(scores).sort().at(-1) : undefined;
  if (latest === undefined) return {};
  const evidence = {};
  for (const probeId of fs.readdirSync(path.join(scores, latest))) {
    const file = path.join(scores, latest, probeId, 'evidence-artifact.json');
    evidence[probeId] = fs.existsSync(file) ? readJson(file) : null;
  }
  return evidence;
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

// ---------------------------------------------------------------- units

async function checkUnits() {
  const evaluation = readJson(path.join(FIXTURE, EVALUATION, 'evaluation.json'));
  const previous = { log: process.env.GRADER_LOG, secret: process.env.GRADER_SECRET };
  process.env.GRADER_SECRET = SECRET;
  delete process.env.GRADER_LOG;
  try {
    const registry = createRegistry(evaluation.registry, { root: FIXTURE });
    const policy = registry.mcpTargetPolicy({ cwd: '/the/workspace', projectRoot: '/the/workspace' });
    check(
      JSON.stringify(policy) ===
        JSON.stringify({
          authorizations: [
            {
              interfaceId: 'grader',
              target: path.join('/the/workspace', 'server', 'grader.js'),
              targetArgs: ['--policy=rules/policy.txt'],
              tools: ['grade_answer', 'describe_policy'],
              cwd: '/the/workspace',
              serverEnvironment: { GRADER_SECRET: SECRET },
              maxElapsedMs: 30_000,
              maxOutputBytes: MAX_OUTPUT_BYTES,
            },
          ],
        }),
      `the registry's MCP policy is ${JSON.stringify(policy)}`,
    );
    const built = await registry.createProbePort({ cwd: FIXTURE, projectRoot: FIXTURE });
    const { parseMcpTargetPolicy } = await loadAdapters();
    check(
      JSON.stringify(built.mcpPolicy) === JSON.stringify(parseMcpTargetPolicy(registry.mcpTargetPolicy({ cwd: FIXTURE }))),
      "the port's MCP policy is not the one eval-quality's parseMcpTargetPolicy reads",
    );
    check(
      JSON.stringify(built.policy) === JSON.stringify({ authorizations: [] }),
      `a registry with no command holds command authorizations ${JSON.stringify(built.policy)}`,
    );
    // eval-quality's own parser refuses a tool name it does not admit before any server starts.
    let refused = null;
    try {
      await createRegistry([{ ...evaluation.registry[0], tools: ['grade_answer', 'a/b'] }], { root: FIXTURE }).createProbePort({
        cwd: FIXTURE,
      });
    } catch (error) {
      refused = error;
    }
    check(
      refused?.name === 'RuntimeFault' && refused.code === 'schema-parse-failure' && refused.artifactPath === 'McpTargetPolicy',
      `a tool name eval-quality refuses reached the port: ${refused}`,
    );
    check(
      JSON.stringify(registry.toolInventory()) === JSON.stringify(['grader/describe_policy', 'grader/grade_answer']),
      `the registry's tool inventory is ${JSON.stringify(registry.toolInventory())}`,
    );
    check(
      registry.ceilingMs('grader', { toolName: 'grade_answer' }) === 30_000 && registry.targetFor('grader') === undefined,
      "a tool call's ceiling is not its server's, or a tool server reads as a command",
    );
    check(
      registry.targetProblems(FIXTURE).length === 0 && registry.targetProblems(path.join(FIXTURE, 'rules')).length === 1,
      `the tool server's target is not held to an executable file: ${JSON.stringify(registry.targetProblems(path.join(FIXTURE, 'rules')))}`,
    );

    // An entry's own maxOutputBytes reaches its authorization and eval-quality's parsed copy of it.
    const capped = createRegistry([{ ...evaluation.registry[0], maxOutputBytes: 4096 }], { root: FIXTURE });
    const cappedPort = await capped.createProbePort({ cwd: FIXTURE, projectRoot: FIXTURE });
    check(
      capped.mcpTargetPolicy({ cwd: FIXTURE }).authorizations[0].maxOutputBytes === 4096 &&
        cappedPort.mcpPolicy.authorizations[0].maxOutputBytes === 4096,
      `an entry's maxOutputBytes of 4096 reached the authorization as ${JSON.stringify(cappedPort.mcpPolicy.authorizations[0])}`,
    );

    // A server's environment is scrubbed from what it answers, as a command's injected values are.
    const leaky = hostEnvironmentPort({
      port: {
        probe: async (request) => ({
          ...request,
          kind: 'mcp',
          isError: false,
          result: { kind: 'json', value: { secret: SECRET, [SECRET]: 'as a key', [`x${SECRET}`]: [`in ${SECRET} text`] } },
        }),
      },
      registry,
    });
    const { observation } = await leaky.probe({ probeId: 'x', interfaceId: 'grader', operationId: 'grade-answer', kind: 'mcp' });
    check(
      !JSON.stringify(observation).includes(SECRET) && Object.keys(observation.result.value).length === 3,
      `a tool server's environment reached the observation, in a value or a key, or a field was lost: ${JSON.stringify(observation)}`,
    );

    // A key the scrub rewrites into a name the answer already holds is numbered; the untouched key keeps its field.
    const colliding = hostEnvironmentPort({
      port: {
        probe: async (request) => ({
          ...request,
          kind: 'mcp',
          isError: false,
          result: { kind: 'json', value: { [SECRET]: 'scrubbed', '[redacted]': 'untouched' } },
        }),
      },
      registry,
    });
    const collided = (await colliding.probe({ probeId: 'x', interfaceId: 'grader', operationId: 'grade-answer', kind: 'mcp' })).observation;
    check(
      JSON.stringify(collided.result.value) === JSON.stringify({ '[redacted]-2': 'scrubbed', '[redacted]': 'untouched' }),
      `a scrubbed key colliding with an untouched one gave ${JSON.stringify(collided.result.value)}`,
    );

    // A secret JSON escapes is scrubbed as written and as a quoted JSON frame holds it, in an answer and in a fault's
    // cause; a cause eval-quality cut through a secret loses the leading part the cut left.
    const mcpRequest = { probeId: 'x', interfaceId: 'grader', operationId: 'grade-answer', kind: 'mcp' };
    const escaped = JSON.stringify(QUOTED_SECRET).slice(1, -1);
    process.env.GRADER_SECRET = QUOTED_SECRET;
    const answeringWith = (value) =>
      hostEnvironmentPort({
        port: { probe: async (request) => ({ ...request, isError: false, result: { kind: 'json', value } }) },
        registry,
      });
    const quotedAnswer = (await answeringWith({ raw: QUOTED_SECRET, frame: `{"token":"${escaped}"}`, [escaped]: 1 }).probe(mcpRequest))
      .observation;
    check(
      leaksOf([{ where: 'the observation', text: JSON.stringify(quotedAnswer) }], QUOTED_SECRET).length === 0 &&
        quotedAnswer.result.value.frame === '{"token":"[redacted]"}',
      `a secret JSON escapes reached the observation: ${JSON.stringify(quotedAnswer)}`,
    );
    const causeOf = async (cause) => {
      const failing = hostEnvironmentPort({
        port: {
          probe: async () => {
            throw Object.assign(new Error('port-failure in ProbeObservation: the underlying mechanism threw or rejected'), {
              code: 'port-failure',
              cause,
            });
          },
        },
        registry,
      });
      try {
        await failing.probe(mcpRequest);
      } catch (error) {
        return error.scrubbedCause;
      }
      return null;
    };
    const refusedCause = await causeOf(
      new Error(`the server refused the initialize handshake: ${JSON.stringify({ code: -32_603, data: { token: QUOTED_SECRET } })}`),
    );
    check(
      String(refusedCause).includes('"token":"[redacted]"') &&
        leaksOf([{ where: 'the cause', text: String(refusedCause) }], QUOTED_SECRET).length === 0,
      `a handshake refusal quoting a secret JSON escapes kept the cause ${refusedCause}`,
    );
    // eval-quality quotes the first 200 characters of a line that is no JSON-RPC message, which can end inside a secret.
    const line = `${'x'.repeat(190)}{"token":"${escaped}"}`;
    const cutCause = await causeOf(new Error(`the server wrote bytes on stdout that are not a JSON-RPC message: ${line.slice(0, 206)}`));
    check(
      String(cutCause).endsWith('{"token":"[redacted]') &&
        leaksOf([{ where: 'the cause', text: String(cutCause) }], QUOTED_SECRET).length === 0,
      `a cause cut through a secret kept ${JSON.stringify(String(cutCause).slice(-40))}`,
    );

    // A number whose text is a secret is replaced whole; the same digits inside a string are scrubbed as text.
    process.env.GRADER_SECRET = '9007199254740';
    const numeric = (await answeringWith({ n: 9_007_199_254_740, s: 'x9007199254740x', other: 90_071_992 }).probe(mcpRequest)).observation;
    check(
      JSON.stringify(numeric.result.value) === JSON.stringify({ n: '[redacted]', s: 'x[redacted]x', other: 90_071_992 }),
      `a secret the server answered as a number gave ${JSON.stringify(numeric.result.value)}`,
    );
    // A number is replaced when its text holds a secret or a secret read as a number equals it: past 2^53 the
    // server's digits no longer print as they were sent, and a decimal loses its trailing zero.
    for (const [secret, answered] of [
      ['123456789012345678', Number('123456789012345678')],
      ['12345678', 912_345_678],
      ['1234567.50', 1_234_567.5],
    ]) {
      process.env.GRADER_SECRET = secret;
      const value = (await answeringWith({ n: answered, other: 42 }).probe(mcpRequest)).observation.result.value;
      check(
        JSON.stringify(value) === JSON.stringify({ n: '[redacted]', other: 42 }),
        `a secret ${secret} the server answered as the number ${answered} gave ${JSON.stringify(value)}`,
      );
    }

    // Each way JSON escaping writes a secret in practice is scrubbed from a fault's cause and an answer's string: one
    // level of JSON.stringify, \/ for / (PHP), \uXXXX for non-ASCII (Python's ensure_ascii) in lower- and upper-case
    // hex, \uXXXX for <, > and & (Go), and a second level of escaping over those.
    const body = (text) => JSON.stringify(text).slice(1, -1);
    const unicode = (text, pattern, upper = false) =>
      text.replace(pattern, (unit) => {
        const hex = unit.codePointAt(0).toString(16).padStart(4, '0');
        return `\\u${upper ? hex.toUpperCase() : hex}`;
      });
    const nonAscii = /[\u0080-\uFFFF]/g;
    const html = /[<>&]/g;
    for (const [what, secret, form] of [
      ['one level of JSON.stringify', FORMS_SECRET, body(FORMS_SECRET)],
      [String.raw`PHP (\/ and non-ASCII escaped)`, FORMS_SECRET, unicode(body(FORMS_SECRET).replaceAll('/', String.raw`\/`), nonAscii)],
      ["Python's ensure_ascii", FORMS_SECRET, unicode(body(FORMS_SECRET), nonAscii)],
      ['upper-case hex', FORMS_SECRET, unicode(body(FORMS_SECRET), nonAscii, true)],
      ["Go's <, > and & escapes", FORMS_SECRET, unicode(body(FORMS_SECRET), html)],
      ['a JSON string holding a JSON object', QUOTED_SECRET, body(JSON.stringify({ token: QUOTED_SECRET }))],
      ["a second level over Python's", FORMS_SECRET, body(unicode(body(FORMS_SECRET), nonAscii))],
    ]) {
      process.env.GRADER_SECRET = secret;
      const cause = String(await causeOf(new Error(`the server refused the initialize handshake: {"data":"${form}"}`)));
      const answer = JSON.stringify((await answeringWith({ quoted: `said ${form}` }).probe(mcpRequest)).observation);
      check(
        !cause.includes(form) &&
          cause.includes('[redacted]') &&
          !answer.includes(form) &&
          answer.includes('[redacted]') &&
          leaksOf(
            [
              { where: 'the cause', text: cause },
              { where: 'the answer', text: answer },
            ],
            secret,
          ).length === 0,
        `a secret written as ${what} survived: cause ${cause}; answer ${answer}`,
      );
    }
    process.env.GRADER_SECRET = SECRET;

    // One interface is one kind; two tool servers for one interface are eval-quality's to refuse, before any server starts.
    const [server] = evaluation.registry;
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
      ['a command sharing the interface', [server, command], 'names interface "grader" as cli, which an earlier entry names as mcp'],
      ['a tool server with no tools', [{ ...server, tools: [] }], 'must NOT have fewer than 1 items'],
    ]) {
      const problems = registryProblems(entries);
      check(
        problems.some((problem) => problem.includes(expected)),
        `${what}: the registry problems are ${JSON.stringify(problems)}`,
      );
    }
    let repeated = null;
    try {
      await createRegistry([server, server], { root: FIXTURE }).createProbePort({ cwd: FIXTURE });
    } catch (error) {
      repeated = error;
    }
    check(
      repeated?.code === 'schema-parse-failure' && registryProblems([server, server]).length === 0,
      `two tool servers for one interface were not left to eval-quality's parser: ${repeated}`,
    );
  } finally {
    for (const [name, value] of [
      ['GRADER_LOG', previous.log],
      ['GRADER_SECRET', previous.secret],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  // A tool call's record: its arguments in, its structured result as the response body, its error flag as the status.
  const contract = readJson(path.join(FIXTURE, EVALUATION, 'contract.json'));
  const answering = (observation) => ({
    probe: async (request) => ({ request, observation: { ...observation, probeId: request.probeId } }),
  });
  const failed = await runArm({
    contract,
    port: answering({ kind: 'mcp', isError: true, result: { kind: 'json', value: { ok: false, error: 'no' } } }),
    registry: null,
    label: 'trial-1',
    provenance: 'evaluator-chosen',
  });
  const recorded = failed.stepObservations['grade-run'];
  check(
    JSON.stringify(recorded?.callInputs?.arguments) === JSON.stringify({ answer: 'forty-two' }) &&
      JSON.stringify(recorded.responseBody) === JSON.stringify({ ok: false, error: 'no' }) &&
      recorded.responseStatus === 1 &&
      recorded.exitCode === null &&
      JSON.stringify(failed.steps[0].request) ===
        JSON.stringify({
          probeId: 'trial-1-grade-run',
          interfaceId: 'grader',
          operationId: 'grade-answer',
          kind: 'mcp',
          toolName: 'grade_answer',
          channels: { arguments: { answer: 'forty-two' } },
        }),
    `a tool call that reported an error is recorded as ${JSON.stringify(recorded)} from ${JSON.stringify(failed.steps[0]?.request)}`,
  );
  let crossed = null;
  try {
    await runArm({
      contract,
      port: answering({ kind: 'cli', exitCode: 0, stdout: { kind: 'text', value: '' }, stderr: { kind: 'absent' }, artifacts: {} }),
      registry: null,
      label: 'trial-1',
    });
  } catch (error) {
    crossed = error;
  }
  check(
    crossed instanceof ArmError && crossed.message.includes('sent a mcp request and the port answered a "cli" observation'),
    `a tool call answered by a command's observation gave ${crossed}`,
  );

  // A plan literal carrying an own __proto__ key, which eval-quality's parser drops, stops the arm before anything is sent.
  const polluted = structuredClone(contract);
  polluted.interactionPlan[0].inputBinding.arguments.answer = { literal: JSON.parse('{"a":{"__proto__":{"x":1}}}') };
  let pollutedError = null;
  try {
    await runArm({
      contract: polluted,
      port: answering({ kind: 'mcp', isError: false, result: { kind: 'absent' } }),
      registry: null,
      label: 'trial-1',
    });
  } catch (error) {
    pollutedError = error;
  }
  check(
    pollutedError instanceof ArmError && pollutedError.message.includes('__proto__'),
    `a plan literal carrying a __proto__ key gave ${pollutedError}`,
  );

  // A denial's reason is recorded beside its code, and a fault with none records none.
  const denial = Object.assign(new Error('denied'), { code: 'forbidden-target', reason: 'tool-not-authorized' });
  check(
    JSON.stringify(faultRecord(denial)) ===
      JSON.stringify({ code: 'forbidden-target', reason: 'tool-not-authorized', message: 'denied' }) &&
      !Object.hasOwn(faultRecord(Object.assign(new Error('x'), { code: 'port-failure' })), 'reason'),
    `the fault record is ${JSON.stringify(faultRecord(denial))}`,
  );

  // The synthetic port answers a tool call from its degenerate response, and refuses a response of the other kind.
  const port = syntheticPort({
    label: 'g',
    steps: { one: { isError: true, structuredResult: { ok: false } }, two: { stdout: '', stderr: '', exitCode: 0 } },
  });
  const answered = await port.probe({ probeId: 'g-one', interfaceId: 'grader', operationId: 'grade-answer', kind: 'mcp' });
  check(
    JSON.stringify(answered.observation) ===
      JSON.stringify({
        probeId: 'g-one',
        interfaceId: 'grader',
        operationId: 'grade-answer',
        kind: 'mcp',
        isError: true,
        result: { kind: 'json', value: { ok: false } },
      }),
    `the synthetic port answered ${JSON.stringify(answered.observation)}`,
  );
  let mismatch = null;
  try {
    await port.probe({ probeId: 'g-two', interfaceId: 'grader', operationId: 'grade-answer', kind: 'mcp' });
  } catch (error) {
    mismatch = error.message;
  }
  check(mismatch?.includes("with a command's response") === true, `a tool call answered by a command's response gave ${mismatch}`);

  // A trial whose step the registry denies records eval-quality's reason in its fault and names it as it exits 10. The
  // pipeline's qualification runs the same plan under the same policy first, so the trial is driven directly.
  const written = {};
  let trialStop = null;
  try {
    await runTrial({
      arm: { conditionArm: 'clean', slug: 'clean', mutation: null, mutatedDigest: null, probes: [] },
      trialIndex: 1,
      contract,
      registry: createRegistry([{ ...evaluation.registry[0], tools: ['describe_policy'] }], { root: FIXTURE }),
      pristine: null,
      // The fixture itself is the workspace: the denial comes before any server starts, so nothing runs in it.
      make: () => ({ kind: 'copy', root: FIXTURE, directory: FIXTURE, provisioned: [] }),
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
  const trialFault = written['trials/clean/trial-1.json']?.fault;
  check(
    trialFault?.code === 'forbidden-target' &&
      trialFault.reason === 'tool-not-authorized' &&
      trialFault.request?.toolName === 'grade_answer' &&
      trialStop?.exitCode === 10 &&
      trialStop.message.startsWith('trial-clean-1 was denied by the registry (tool-not-authorized): '),
    `a denied trial step recorded ${JSON.stringify(trialFault)} and stopped with ${trialStop?.exitCode}: ${trialStop?.message}`,
  );
}

// ---------------------------------------------------------------- the pipeline

async function checkPipeline() {
  const project = makeProject('pipeline');
  const checked = evaluate(['check', '--evaluation', project.folder], project.env);
  check(checked.status === 0, `check over the MCP fixture exited ${checked.status}; expected 0\n${checked.output}`);

  const preflight = evaluate(['preflight', '--evaluation', project.folder], project.env);
  check(preflight.status === 0, `preflight over the MCP fixture exited ${preflight.status}; expected 0\n${preflight.output}`);
  const preflightRun = runDirectoryOf(project.folder);
  const observed = preflightRun === null ? null : path.join(preflightRun, 'observations');
  check(observed !== null && fs.existsSync(observed), 'preflight over the MCP fixture recorded no leg');
  if (observed !== null && fs.existsSync(observed)) {
    const legs = fs.readdirSync(observed).map((name) => readJson(path.join(observed, name)));
    check(legs.length >= 4, `preflight recorded ${legs.length} leg(s)`);
    check(
      legs.every(
        (leg) =>
          leg.observation.kind === 'mcp' &&
          leg.request.kind === 'mcp' &&
          leg.request.toolName === 'grade_answer' &&
          leg.observation.isError === false &&
          leg.observation.result.kind === 'json' &&
          typeof leg.observation.result.value.verdict === 'string',
      ),
      `a preflight leg is not a tool call with a structured result: ${JSON.stringify(legs.map((leg) => leg.observation))}`,
    );
    const manifest = legs.find((leg) => leg.legId === 'manifest-lenient');
    check(
      manifest?.workspace === 'mutated:M-001' && manifest.observation.result.value.verdict === 'rejected',
      `the manifestation witness ran as ${JSON.stringify(manifest)}`,
    );
    check(!fs.existsSync(path.join(preflightRun, 'faults')), 'a preflight leg over the MCP fixture was denied or failed');
  }
  // Every session the preflight opened performed the protocol's handshake before its one call.
  const preflightSessions = sessions(project);
  const handshakes = preflightSessions.filter((line) => line.event === 'initialize');
  const calls = preflightSessions.filter((line) => line.event === 'call');
  check(
    handshakes.length > 0 && handshakes.length === calls.length && handshakes.every((line) => line.protocolVersion === '2025-06-18'),
    `the server logged ${handshakes.length} handshake(s) for ${calls.length} call(s): ${JSON.stringify(handshakes)}`,
  );

  fs.rmSync(project.log, { force: true });
  const ran = evaluate(['run', '--evaluation', project.folder], { ...project.env, GRADER_SECRET: SECRET });
  check(ran.status === 0, `run over the MCP fixture exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (runDirectory === null || !fs.existsSync(path.join(runDirectory, 'trial-sets.json'))) {
    check(false, 'the MCP run sealed no trial set');
    return;
  }
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
          JSON.stringify(observation.callInputs.arguments) === JSON.stringify({ answer: 'forty-two' }) &&
          observation.callInputs.stdin === null &&
          observation.responseBody?.verdict === verdict &&
          observation.responseBody?.secret === '[redacted]' &&
          observation.responseStatus === 0 &&
          observation.exitCode === null &&
          observation.stdout.kind === 'absent',
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
  // Every session ran in a runtime workspace, started from the server file the registry resolved into that same workspace.
  const trialSessions = sessions(project);
  check(
    trialSessions.length > 0 && trialSessions.every((line) => line.workspace !== null && line.scriptWorkspace === line.workspace),
    `a session of the server ran outside its workspace: ${JSON.stringify(trialSessions.filter((line) => line.scriptWorkspace !== line.workspace))}`,
  );
  // The secret reached no file of the project, the run directory included, and nothing the commands printed.
  const leaked = [
    ...filesUnder(project.root),
    { where: 'the preflight output', text: preflight.output },
    { where: 'the run output', text: ran.output },
  ].filter(({ text }) => text.includes(SECRET));
  check(leaked.length === 0, `the server's secret reached ${leaked.map(({ where }) => where).join(', ')}`);
  const manifest = readJson(path.join(runDirectory, 'trial-sets', 'P-002', 'isolation-manifest.json'));
  check(
    JSON.stringify(manifest.toolAllowlist) === JSON.stringify(['grader/describe_policy', 'grader/grade_answer']) &&
      JSON.stringify(manifest.observedToolCalls) === JSON.stringify(['grader/grade_answer']),
    `the manifest grants ${JSON.stringify(manifest.toolAllowlist)} and observed ${JSON.stringify(manifest.observedToolCalls)}`,
  );
  const run = readJson(path.join(runDirectory, 'run.json'));
  check(
    JSON.stringify(run.runner) ===
      JSON.stringify([
        {
          interfaceId: 'grader',
          kind: 'mcp',
          target: 'server/grader.js',
          targetArgs: ['--policy=rules/policy.txt'],
          tools: ['grade_answer', 'describe_policy'],
        },
      ]),
    `run.json names the runner ${JSON.stringify(run.runner)}`,
  );
  const evidence = scoreRun(project, 'the MCP run');
  checkVotes('the MCP run', evidence, 'P-001', 'passed-clean-control');
  checkVotes('the MCP run', evidence, 'P-002', 'caught');
}

// ---------------------------------------------------------------- denials

async function checkDenials() {
  // The plan's tool left out of the authorization: the qualification's first call is denied before any server starts.
  const removed = makeProject('tool-removed', {
    edit: ({ folder }) =>
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.registry[0].tools = ['describe_policy'];
      }),
  });
  const denied = evaluate(['preflight', '--evaluation', removed.folder], removed.env);
  check(denied.status === 10, `preflight with the tool removed exited ${denied.status}; expected 10\n${denied.output}`);
  check(denied.output.includes('tool-not-authorized'), `preflight with the tool removed names no reason:\n${denied.output}`);
  const removedRun = runDirectoryOf(removed.folder);
  const fault = removedRun === null ? null : readIfPresent(path.join(removedRun, 'qualification', 'P-002', 'fault.json'));
  check(
    fault?.code === 'forbidden-target' && fault.reason === 'tool-not-authorized',
    `the removed tool's qualification fault is ${JSON.stringify(fault)}`,
  );
  check(sessions(removed).length === 0, `a denied tool started the server: ${JSON.stringify(sessions(removed))}`);

  // With no seeded probe, the first leg is denied, and the leg's fault carries the reason.
  const cleanOnly = (project) => {
    fs.rmSync(path.join(project.folder, 'probes', 'P-002.probe.json'));
    fs.rmSync(path.join(project.folder, 'mutations'), { recursive: true });
    editJson(path.join(project.folder, 'evaluation.json'), (evaluation) => {
      evaluation.arms = ['clean'];
    });
  };
  for (const [label, edit, reason] of [
    [
      'leg-tool-removed',
      (project) => {
        cleanOnly(project);
        editJson(path.join(project.folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].tools = ['describe_policy'];
        });
      },
      'tool-not-authorized',
    ],
    [
      'leg-interface-unregistered',
      (project) => {
        cleanOnly(project);
        editJson(path.join(project.folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].interfaceId = 'another-server';
        });
      },
      'interface-not-authorized',
    ],
  ]) {
    const project = makeProject(label, { edit });
    const ran = evaluate(['preflight', '--evaluation', project.folder], project.env);
    check(ran.status === 10, `${label}: preflight exited ${ran.status}; expected 10\n${ran.output}`);
    const runDirectory = runDirectoryOf(project.folder);
    const faults =
      runDirectory === null || !fs.existsSync(path.join(runDirectory, 'faults')) ? [] : fs.readdirSync(path.join(runDirectory, 'faults'));
    const legFault = faults.length === 1 ? readJson(path.join(runDirectory, 'faults', faults[0])) : null;
    check(
      legFault?.code === 'forbidden-target' && legFault.reason === reason && legFault.request?.kind === 'mcp',
      `${label}: the leg's fault is ${JSON.stringify(legFault)}; expected ${reason}`,
    );
    check(sessions(project).length === 0, `${label}: a denied leg started the server`);
  }

  // A server that refuses its handshake answered nothing: the run cannot measure it, exit 12. Its refusal quotes a secret
  // JSON escapes, which eval-quality's cause holds escaped, and no fragment of it reaches a file or the output.
  const refusing = makeProject('handshake-refused', {
    edit: ({ root }) => fs.appendFileSync(path.join(root, 'rules', 'policy.txt'), 'handshake: refuse\n'),
  });
  const refused = evaluate(['run', '--evaluation', refusing.folder], { ...refusing.env, GRADER_SECRET: QUOTED_SECRET });
  check(refused.status === 12, `a server refusing its handshake: run exited ${refused.status}; expected 12\n${refused.output}`);
  const refusedRun = runDirectoryOf(refusing.folder);
  const refusedFault = refusedRun === null ? null : readIfPresent(path.join(refusedRun, 'qualification', 'P-002', 'fault.json'));
  check(
    refusedFault?.code === 'port-failure' &&
      !Object.hasOwn(refusedFault, 'reason') &&
      String(refusedFault.cause).includes('the server refused the initialize handshake') &&
      String(refusedFault.cause).includes('"token":"[redacted]"') &&
      refused.output.includes('the server refused the initialize handshake') &&
      refused.output.includes('"token":"[redacted]"'),
    `a server refusing its handshake is recorded as ${JSON.stringify(refusedFault)}`,
  );
  const refusedRecord = refusedRun === null ? null : readIfPresent(path.join(refusedRun, 'run.json'));
  check(
    JSON.stringify(refusedRecord ?? {}).includes(String.raw`"token\":\"[redacted]`),
    `the stopped run's run.json does not name the scrubbed cause: ${JSON.stringify(refusedRecord?.outcome)}`,
  );
  const refusedLeaks = leaksOf([...filesUnder(refusing.root), { where: 'the run output', text: refused.output }], QUOTED_SECRET);
  check(refusedLeaks.length === 0, `a secret the handshake refusal quoted reached ${refusedLeaks.join('; ')}`);
  // The server started and was refused at its handshake, so no tool was ever called: a server that never started logs nothing.
  const refusedSessions = sessions(refusing);
  check(
    refusedSessions.some((line) => line.event === 'initialize' && line.protocolVersion === '2025-06-18') &&
      refusedSessions.every((line) => line.event === 'initialize'),
    `a server refusing its handshake logged ${JSON.stringify(refusedSessions)}`,
  );

  // A sealed-brief agent's call to that server records the same cause, scrubbed, in its bridge fault and the run's stop.
  const previousSecret = process.env.GRADER_SECRET;
  process.env.GRADER_SECRET = QUOTED_SECRET;
  let refusingRouter;
  try {
    const refusingRegistry = createRegistry(readJson(path.join(refusing.folder, 'evaluation.json')).registry, { root: refusing.root });
    const { port: refusingPort } = await refusingRegistry.createProbePort({ cwd: refusing.root, projectRoot: refusing.root });
    refusingRouter = bridgeRouter({
      contract: readJson(path.join(refusing.folder, 'contract.json')),
      registry: refusingRegistry,
      port: hostEnvironmentPort({ port: refusingPort, registry: refusingRegistry }),
      degenerate: null,
      label: 'trial-1',
      taken: new Set(),
      firstSequence: 1,
      budget: 1,
      nonce: crypto.randomBytes(16).toString('hex'),
    });
    await refusingRouter.handle({ name: 'grader', kind: 'mcp' }, { tool: 'grade_answer', arguments: { answer: 'x' } });
  } finally {
    if (previousSecret === undefined) delete process.env.GRADER_SECRET;
    else process.env.GRADER_SECRET = previousSecret;
  }
  const bridgeCause = String(refusingRouter.calls[0]?.fault?.cause);
  check(
    bridgeCause.includes('the server refused the initialize handshake') &&
      bridgeCause.includes('"token":"[redacted]"') &&
      String(refusingRouter.infrastructure()).includes('the server refused the initialize handshake') &&
      leaksOf(
        [
          { where: 'the bridge calls', text: JSON.stringify(refusingRouter.calls) },
          { where: "the run's stop", text: String(refusingRouter.infrastructure()) },
        ],
        QUOTED_SECRET,
      ).length === 0,
    `a bridge call to a server refusing its handshake recorded ${JSON.stringify(refusingRouter.calls)} and ${refusingRouter.infrastructure()}`,
  );

  // A server that hangs mid-call is torn down at its ceiling: exit 12, the fault's budget-exhausted code, every process
  // it started ended and the run's temp directory empty.
  const hanging = makeProject('hanging', {
    edit: ({ root, folder }) => {
      fs.appendFileSync(path.join(root, 'rules', 'policy.txt'), 'hang: grade_answer\n');
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.registry[0].maxElapsedMs = HANG_CEILING_MS;
      });
    },
  });
  const hung = evaluate(['preflight', '--evaluation', hanging.folder], hanging.env);
  check(hung.status === 12, `a server hanging mid-call: preflight exited ${hung.status}; expected 12\n${hung.output}`);
  const hungRun = runDirectoryOf(hanging.folder);
  const hungFault = hungRun === null ? null : readIfPresent(path.join(hungRun, 'qualification', 'P-002', 'fault.json'));
  check(
    hungFault?.code === 'budget-exhausted' && hung.output.includes('budget-exhausted'),
    `a server hanging mid-call is recorded as ${JSON.stringify(hungFault)}`,
  );
  const hungSessions = sessions(hanging);
  check(
    hungSessions.some((line) => line.event === 'call' && line.tool === 'grade_answer') && livingSessions(hanging).length === 0,
    `a hung server's processes outlived the run: ${JSON.stringify(livingSessions(hanging))} of ${JSON.stringify(hungSessions)}`,
  );
  check(
    fs.readdirSync(hanging.env.TMPDIR).length === 0,
    `a hung server's run left ${fs.readdirSync(hanging.env.TMPDIR)} in its temp directory`,
  );

  // A server that accepts every answer, whatever its policy, lets the mutated arm hold, so the mutation proves nothing: exit 11.
  const accepting = makeProject('always-accepts', {
    edit: ({ root }) => fs.appendFileSync(path.join(root, 'rules', 'policy.txt'), 'verdict: accept\n'),
  });
  const held = evaluate(['preflight', '--evaluation', accepting.folder], accepting.env);
  check(
    held.status === 11 && held.output.includes('the mutated arm did not fail'),
    `a server that accepts every answer: preflight exited ${held.status}; expected 11\n${held.output}`,
  );
}

// ---------------------------------------------------------------- the bridge

/** Makes `folder`'s evaluator the MCP stub agent, capturing each run to `capture`, with a budget for its four calls. */
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
    evaluator: { modelSnapshot: 'stub-mcp-agent-2026-09' },
  });
}

async function checkSealedBriefAgent() {
  const capture = path.join(scratch.make('sealed-capture'), 'captures.jsonl');
  const project = makeProject('sealed-brief', { edit: ({ folder }) => useStubAgent(folder, capture) });
  const ran = evaluate(['run', '--evaluation', project.folder], { ...project.env, GRADER_SECRET: SECRET });
  check(ran.status === 0, `a sealed-brief run over the MCP fixture exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  if (runDirectory === null || !fs.existsSync(path.join(runDirectory, 'trial-sets.json'))) {
    check(false, 'the sealed-brief MCP run sealed no trial set');
    return;
  }
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
            'denied:forbidden-target:tool-not-authorized',
            `grade-answer:trial-${trial}-call-4`,
          ]),
        `${arm} trial ${trial}: the bridge's calls are ${JSON.stringify(calls.map(outcome))}`,
      );
    }
    for (const record of recordsOf(runDirectory, probeId)) {
      const [chosen, refused] = record.observations.filter((observation) => observation.provenance === 'evaluator-chosen');
      check(
        record.observations.length === 3 &&
          record.observations[0].provenance === 'baseline' &&
          chosen?.observationId === `trial-${record.trialIndex}-call-1` &&
          chosen.operationId === 'grade-answer' &&
          JSON.stringify(chosen.callInputs.arguments) === JSON.stringify({ answer: 'an answer of my own' }) &&
          chosen.responseBody?.verdict === verdict &&
          chosen.responseBody?.secret === '[redacted]' &&
          chosen.responseStatus === 0,
        `${probeId} trial ${record.trialIndex}'s observations are ${JSON.stringify(record.observations)}`,
      );
      // The server answered the agent's number with its error flag set, which the record keeps as response status 1.
      check(
        refused?.observationId === `trial-${record.trialIndex}-call-4` &&
          JSON.stringify(refused.callInputs.arguments) === JSON.stringify({ answer: 42 }) &&
          refused.responseBody?.ok === false &&
          refused.responseStatus === 1,
        `${probeId} trial ${record.trialIndex} recorded the call the server refused as ${JSON.stringify(refused)}`,
      );
    }
  }
  // The denied tool never started the server: in each trial the plan's step and the agent's two grade calls started it
  // for grade_answer, and the agent's undeclared call once for describe_policy.
  const trialCalls = sessions(project).filter((line) => line.event === 'call' && line.workspace?.startsWith('trial-'));
  const perTool = {};
  for (const line of trialCalls) perTool[line.tool] = (perTool[line.tool] ?? 0) + 1;
  check(
    JSON.stringify(perTool) === JSON.stringify({ grade_answer: 3 * 2 * TRIALS, describe_policy: 2 * TRIALS }),
    `the trials started the server for ${JSON.stringify(perTool)}`,
  );
  // The server's secret reached no file of the project, no capture of the agent and nothing the run printed.
  const leaked = [...filesUnder(project.root, capture), { where: 'the run output', text: ran.output }].filter(({ text }) =>
    text.includes(SECRET),
  );
  check(leaked.length === 0, `the server's secret reached ${leaked.map(({ where }) => where).join(', ')} in a sealed-brief run`);
  const [first] = fs.existsSync(capture)
    ? fs
        .readFileSync(capture, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  check(
    first?.results?.[2]?.result?.isError === true && first.results[2].result.content[0].text.includes('tool-not-authorized'),
    `the agent was told ${JSON.stringify(first?.results?.[2])} of its unlisted tool`,
  );
  const manifest = readJson(path.join(runDirectory, 'trial-sets', 'P-002', 'isolation-manifest.json'));
  check(
    JSON.stringify(manifest.observedToolCalls) === JSON.stringify(['grader/describe_policy', 'grader/grade_answer']),
    `the sealed-brief manifest observed ${JSON.stringify(manifest.observedToolCalls)}`,
  );
  const evidence = scoreRun(project, 'the sealed-brief MCP run');
  checkVotes('the sealed-brief MCP run', evidence, 'P-001', 'passed-clean-control');
  checkVotes('the sealed-brief MCP run', evidence, 'P-002', 'caught');

  // A bridge call to a server that hangs is torn down at its ceiling; the agent, told only that its call could not run,
  // exits 1, and the run names the call's budget-exhausted fault over the agent's exit.
  const hanging = makeProject('sealed-brief-hang', {
    edit: ({ root, folder }) => {
      useStubAgent(folder, path.join(scratch.make('sealed-hang-capture'), 'captures.jsonl'));
      fs.appendFileSync(path.join(root, 'rules', 'policy.txt'), 'hang: describe_policy\n');
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
        evaluation.registry[0].maxElapsedMs = HANG_CEILING_MS;
      });
    },
  });
  const hung = evaluate(['run', '--evaluation', hanging.folder], hanging.env);
  check(
    hung.status === 12 &&
      hung.output.includes("trial-clean-1 yields no record: the evaluator's call trial-1-call-2 could not run: budget-exhausted") &&
      /could not run: budget-exhausted[^\n]*; the agent then failed: Agent [^\n]* exited with code 1/.test(hung.output) &&
      !hung.output.includes('could not answer'),
    `a bridge call to a hanging server: run exited ${hung.status}; expected 12 naming the call's budget-exhausted fault\n${hung.output}`,
  );
  check(livingSessions(hanging).length === 0, `a hung server's processes outlived the run: ${JSON.stringify(livingSessions(hanging))}`);
}

// ---------------------------------------------------------------- gameability

const DEGENERATE = { isError: false, structuredResult: { ok: true, answer: 'forty-two', verdict: 'pending' } };

async function checkGameability() {
  const project = makeProject('gameability', {
    edit: ({ folder }) => {
      editJson(path.join(folder, 'contract.json'), (contract) => {
        contract.behaviors.push({
          id: 'B-002',
          description: 'The grader answers every grade call with a result that reports ok.',
          severity: 'low',
          observableSuccessCriterion: 'The grade_answer result reports ok.',
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
            scope: 'The structured result of the grade call.',
            negativeDomain: 'A result that does not report ok.',
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
  check(ran.status === 0, `a gameability run over the MCP fixture exited ${ran.status}; expected 0\n${ran.output}`);
  // Only the preflight's witness legs started the server; the gameability qualification and trials started nothing.
  const started = sessions(project).filter((line) => line.event === 'call');
  check(
    started.length > 0 && started.every((line) => line.workspace === 'pristine' && line.arguments.answer !== 'forty-two'),
    `the gameability arm started the server: ${JSON.stringify(started)}`,
  );
  const runDirectory = runDirectoryOf(project.folder);
  if (runDirectory === null || !fs.existsSync(path.join(runDirectory, 'trial-sets.json'))) {
    check(false, 'the gameability MCP run sealed no trial set');
    return;
  }
  for (const record of recordsOf(runDirectory, 'P-003')) {
    check(
      record.observations.length === 1 &&
        record.observations[0].responseBody?.verdict === 'pending' &&
        record.observations[0].responseStatus === 0 &&
        record.findings.map((finding) => finding.oracleId).join(',') === 'O-001',
      `gameability trial ${record.trialIndex} records ${JSON.stringify(record.observations)} and files ${JSON.stringify(record.findings)}`,
    );
  }
  const evidence = scoreRun(project, 'the gameability MCP run');
  checkVotes('the gameability MCP run', evidence, 'P-003', 'caught');

  // A gameability router over a tool server: an unlisted tool is denied as on a real arm, a listed one is answered from the
  // degenerate response, and nothing starts.
  const evaluation = readJson(path.join(project.folder, 'evaluation.json'));
  const contract = readJson(path.join(project.folder, 'contract.json'));
  const registry = createRegistry(evaluation.registry, { root: project.root });
  const router = bridgeRouter({
    contract,
    registry,
    port: null,
    degenerate: { 'grade-run': DEGENERATE },
    label: 'trial-1',
    taken: new Set(['trial-1-grade-run']),
    firstSequence: 2,
    budget: 3,
    nonce: crypto.randomBytes(16).toString('hex'),
  });
  const before = sessions(project).length;
  const tool = { name: 'grader', kind: 'mcp' };
  // The server's log key in this process too, so a router that started the server would write a line here.
  const previousLog = process.env.GRADER_LOG;
  process.env.GRADER_LOG = project.log;
  let unlisted;
  let listed;
  try {
    unlisted = await router.handle(tool, { tool: 'reset_ledger' });
    listed = await router.handle(tool, { tool: 'grade_answer', arguments: { answer: 'any' } });
  } finally {
    if (previousLog === undefined) delete process.env.GRADER_LOG;
    else process.env.GRADER_LOG = previousLog;
  }
  // A degenerate response with its error flag set is recorded as a real call's is, response status 1.
  const failingRouter = bridgeRouter({
    contract,
    registry,
    port: null,
    degenerate: { 'grade-run': { isError: true, structuredResult: { ok: false, error: 'degenerate' } } },
    label: 'trial-1',
    taken: new Set(['trial-1-grade-run']),
    firstSequence: 2,
    budget: 1,
    nonce: crypto.randomBytes(16).toString('hex'),
  });
  const failingAnswer = await failingRouter.handle(tool, { tool: 'grade_answer', arguments: { answer: 'any' } });
  check(
    JSON.parse(failingAnswer.text).isError === true &&
      failingRouter.observations[0]?.responseStatus === 1 &&
      failingRouter.observations[0].responseBody?.error === 'degenerate',
    `a degenerate response with its error flag set was answered ${failingAnswer.text} and recorded ${JSON.stringify(failingRouter.observations)}`,
  );
  check(
    unlisted.isError === true &&
      router.calls[0]?.denied?.reason === 'tool-not-authorized' &&
      listed.isError === false &&
      JSON.parse(listed.text).result?.verdict === 'pending' &&
      router.observations[0]?.responseBody?.verdict === 'pending',
    `the gameability router answered ${JSON.stringify([unlisted, listed])} and recorded ${JSON.stringify(router.calls)}`,
  );
  check(sessions(project).length === before, 'the gameability router started the server');
  // Arguments carrying an own __proto__ key, which eval-quality's parser drops, are refused unsent, so no record shows an
  // argument the server never received.
  const polluted = await router.handle(tool, {
    tool: 'grade_answer',
    arguments: JSON.parse('{"answer":"a","nested":{"__proto__":{"x":1}}}'),
  });
  check(
    polluted.isError === true && polluted.text.includes('__proto__') && router.observations.length === 1,
    `a call carrying a __proto__ key was answered ${JSON.stringify(polluted)} and recorded ${router.observations.length} observation(s)`,
  );
}

// ---------------------------------------------------------------- check

async function checkCheckRules() {
  const cases = [
    [
      'two tool servers for one interface',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry.push({ ...evaluation.registry[0] });
        }),
      'registry',
      'two authorizations name one interfaceId',
    ],
    [
      "a command sharing the tool server's interface",
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry.push({
            interfaceId: 'grader',
            executable: 'grader',
            target: 'server/grader.js',
            subcommandPaths: [[]],
            artifacts: {},
            environmentKeys: [],
            maxElapsedMs: 1000,
            infrastructureExitCodes: [],
          });
        }),
      'registry',
      'names interface "grader" as cli',
    ],
    [
      'a command entry for an mcp interface',
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
      'serves interface "grader" as cli, and contract.json declares it "mcp"',
    ],
    [
      'a tool name eval-quality refuses',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].tools = ['grade_answer', 'a/b'];
        }),
      'registry',
      'parseMcpTargetPolicy refuses the tool-server entries',
    ],
    [
      "a tool server argument naming the adopter's live tree",
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].target = 'node';
          evaluation.registry[0].targetArgs = [path.join(FIXTURE, 'server', 'grader.js')];
        }),
      'schema',
      'targetArgs/0',
    ],
    [
      'a tool server argument carrying an absolute path after =',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].targetArgs = ['--script=/abs/grader.js'];
        }),
      'schema',
      'targetArgs/0',
    ],
    [
      'a tool server argument naming a file URL',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].targetArgs = ['--import=file:///etc/x.js'];
        }),
      'schema',
      'targetArgs/0',
    ],
    [
      'a tool server argument climbing out of the workspace',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].targetArgs = ['--root=../outside'];
        }),
      'schema',
      'targetArgs/0',
    ],
    [
      'an interface kind the contract does not declare',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.interface = 'cli';
        }),
      'reference',
      'interface "cli" names a kind no interface of contract.json declares (it declares mcp)',
    ],
    [
      'a tool server with no targetArgs',
      ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          delete evaluation.registry[0].targetArgs;
        }),
      'schema',
      'targetArgs',
    ],
    [
      "a degenerate response answering a tool call with a command's response",
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
      "answers step grade-run, a tool call, with a command's response",
    ],
  ];
  for (const [what, edit, rule, expected] of cases) {
    const project = makeProject(`check-${cases.findIndex((entry) => entry[0] === what)}`, { edit });
    const checked = evaluate(['check', '--evaluation', project.folder], project.env);
    // A finding prints as `<file>: [<rule>] <message>`.
    const named = checked.output.split('\n').some((line) => line.includes(`[${rule}]`) && line.includes(expected));
    check(
      checked.status === 10 && named,
      `${what}: check exited ${checked.status}; expected 10 under ${rule} naming ${JSON.stringify(expected)}\n${checked.output}`,
    );
  }
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
    await runCase('the units', checkUnits);
    await runCase('the pipeline', checkPipeline);
    await runCase('the denials', checkDenials);
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
    console.error(`${colors.red}${failures.length} of ${checks} tea-evaluate MCP check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} tea-evaluate MCP check(s) passed`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`${colors.red}the tea-evaluate MCP test could not run:${colors.reset} ${error.stack ?? error}`);
    process.exitCode = 2;
  },
);
