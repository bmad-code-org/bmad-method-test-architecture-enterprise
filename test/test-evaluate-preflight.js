/**
 * `tea-skill-runner` and `tea-evaluate preflight`, end to end (Story 1.6).
 *
 * The runner cases spawn `cli/skill-runner.js` over the stub agent under
 * `test/fixtures/evaluate/stub-agent/`: a run names the skill it was handed; a
 * missing `--skill-root`, a skill root or `SKILL.md` outside the working
 * directory (a symbolic link included), a prompt that is not UTF-8 and every
 * other malformed command line exit 2 (usage); a missing skill, a failing
 * agent and a timeout exit 3, 4 and 5; an unexpected error and a reader that
 * closes standard output early exit 4; and a process the agent started dies
 * with a timeout and with a runner killed outright. The registry entry the
 * preflight fixture declares for the runner carries exactly its
 * infrastructure codes, 3 to 6.
 *
 * The preflight cases run the real `tea-evaluate preflight` over a temp copy of
 * `test/fixtures/evaluate/preflight/`, whose `launch.root` is pointed back at
 * the stub project (or a temp copy of it, for a case that changes or writes
 * the target), against the real installed eval-quality, with the runner on
 * PATH under its bin name:
 *
 * - the stub passes: exit 0, a passed `PreflightVerdict` from the CLI, every
 *   leg's observation under `runs/<invocationId>/observations/`, and no denial
 *   (`forbidden-target`, `interface-not-authorized`, `executable-not-authorized`)
 *   in the files the runtime writes about legs and the verdict;
 * - with the stub's registry entry replaced by an entry for another executable,
 *   the same assertions fail on the recorded denial, and the command exits 10,
 *   as it does for an entry under another interface;
 * - with `TEA_EVALUATE_ENGINE_CLI` at a shim that logs its argv, exits 0 for
 *   `compile` and `seal` and 5 for `preflight`, the command exits 5 and the log
 *   holds the preflight argv with `--observations` and this run's `--run-id`, so
 *   the verdict came from the CLI (the library's own verdict would pass), and
 *   each stage record says whether the shim substituted the CLI;
 * - a witness leg whose agent exits non-zero fails the clean-control check on
 *   the control leg's exit 4: `tea-evaluate` and the CLI run directly over the
 *   persisted files both exit 3;
 * - a failed `compile` or `seal` passes its exit through and stops the run; a
 *   stage exit eval-quality does not document for that stage, a seeded probe,
 *   a missing registry target, an `mcp` interface, a leg over its output
 *   budget and a missing engine exit 12; an authoring defect exits 10; and no
 *   `--evaluation` exits 64;
 * - a `runPreflight` that refuses its plan before any leg falls through to the
 *   CLI's own exit, and one that fails after a leg exits 12;
 * - a leg that writes a file writes it into a disposable copy that is removed
 *   afterwards, and an interrupted run removes it too and leaves no process;
 *   the copy holds no `.git` and no `runs/`, links a provisioned directory in,
 *   points every symbolic link inside the target at the copy, and is refused
 *   (exit 12) for a link out of the target, a FIFO, or a temp directory inside
 *   the target; `--evaluation` through a link resolves `launch.root` from the
 *   folder's real location; `runs/` carries a `.gitignore`; and a permitted
 *   environment value reaches the agent beneath a leg's own value and is
 *   scrubbed from everything the run recorded;
 * - `check` refuses a runner leg or plan step with another skill root or no
 *   `--timeout-ms` below the entry's ceiling, a runner entry missing an
 *   infrastructure code, and a skill root inside a provisioned directory.
 *
 * Usage: node test/test-evaluate-preflight.js
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { INFRASTRUCTURE_EXIT_CODES } = require('../cli/skill-runner');
const { EXIT_CODES } = require('../cli/lib/runner-exit-codes');
const { ENGINE_CLI_ENV, engineCliPath } = require('../cli/lib/evaluate/engine');

const PROJECT_ROOT = path.join(__dirname, '..');
const EVALUATE = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const RUNNER = path.join(PROJECT_ROOT, 'cli', 'skill-runner.js');
const SUPERVISOR = path.join(PROJECT_ROOT, 'cli', 'lib', 'agent-supervisor.js');
const FIXTURES = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate');
const PREFLIGHT_FIXTURE = path.join(FIXTURES, 'preflight');
const VALID_FIXTURE = path.join(FIXTURES, 'valid');
const STUB_PROJECT = path.join(FIXTURES, 'stub-agent');
const STUB_AGENT = 'test/fixtures/evaluate/stub-agent/agent.js';
const STUB_SKILL = 'test/fixtures/evaluate/stub-agent/skill';
const SHIM = path.join(FIXTURES, 'engine-shim.js');
const HIDE_ENGINE = path.join(FIXTURES, 'engine-absent', 'hide-engine.cjs');
const WRAP_ENGINE = path.join(FIXTURES, 'engine-wrapped', 'wrap-engine.cjs');
const DENIALS = ['forbidden-target', 'interface-not-authorized', 'executable-not-authorized'];

/** This process's environment with every variable the cases set themselves removed, so a developer's shell cannot reroute a case. */
const BASE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) =>
      name !== ENGINE_CLI_ENV &&
      !name.startsWith('TEA_EVALUATE_SHIM_') &&
      name !== 'TEA_EVALUATE_WRAP_RUNPREFLIGHT' &&
      name !== 'TEA_STUB_SECRET',
  ),
);

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;
const scratch = [];

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function tempDir(label) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), `tea-evaluate-preflight-${label}-`));
  scratch.push(directory);
  return directory;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function editJson(folder, relative, edit) {
  const file = path.join(folder, relative);
  const value = readJson(file);
  edit(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** A private temp directory for a case, and the environment that points every temp lookup at it. */
function privateTemp(label) {
  const directory = tempDir(label);
  return { directory, env: { TMPDIR: directory, TMP: directory, TEMP: directory } };
}

/** A temp copy of the stub project, for a case that changes the target or must not write into the tracked fixture. */
function stubProject(label) {
  const project = path.join(tempDir(label), 'project');
  fs.cpSync(STUB_PROJECT, project, { recursive: true });
  return project;
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Whether the process `pid` is gone within `withinMs`. */
async function processEnds(pid, withinMs = 5000) {
  const deadline = Date.now() + withinMs;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') return true;
    }
    if (Date.now() > deadline) return false;
    await delay(50);
  }
}

/** Waits for `file` to hold a pid; null when it never does within `withinMs`. */
async function pidFrom(file, withinMs = 20_000) {
  const deadline = Date.now() + withinMs;
  while (Date.now() <= deadline) {
    if (fs.existsSync(file)) {
      const pid = Number(fs.readFileSync(file, 'utf8'));
      if (pid > 0) return pid;
    }
    await delay(50);
  }
  return null;
}

/** Resolves with how a spawned child ended. */
function ended(child) {
  return new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
}

/** Kills a pid a failing case left running, so a regression cannot leak processes past the suite. */
function reap(pid) {
  try {
    if (pid !== null) process.kill(pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}

// ---------------------------------------------------------------------------
// tea-skill-runner

function runRunner(args, { input = 'Say alpha.', cwd = PROJECT_ROOT } = {}) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], { cwd, input, encoding: 'utf8', env: BASE_ENV });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}${result.stderr}` };
}

const STUB_OPTIONS = ['--agent', 'custom', '--agent-cmd', STUB_AGENT];

function checkRunner() {
  check(
    JSON.stringify(INFRASTRUCTURE_EXIT_CODES) === JSON.stringify([3, 4, 5, 6]),
    `the skill runner's infrastructure exit codes are ${JSON.stringify(INFRASTRUCTURE_EXIT_CODES)}; expected 3 to 6`,
  );
  check(EXIT_CODES.usage === 2, `the shared usage exit is ${EXIT_CODES.usage}; the runner's usage error is documented as 2`);
  const entry = readJson(path.join(PREFLIGHT_FIXTURE, 'evaluation.json')).registry[0];
  check(
    JSON.stringify(entry.infrastructureExitCodes) === JSON.stringify(INFRASTRUCTURE_EXIT_CODES),
    `the fixture's tea-skill-runner entry declares ${JSON.stringify(entry.infrastructureExitCodes)}; expected the runner's own ${JSON.stringify(INFRASTRUCTURE_EXIT_CODES)}`,
  );

  const ok = runRunner(['--skill-root', STUB_SKILL, ...STUB_OPTIONS]);
  check(ok.status === 0, `a stub run exited ${ok.status}; expected 0\n${ok.output}`);
  check(ok.stdout.includes('skill: stub-skill'), `a stub run did not name the skill it was handed:\n${ok.output}`);
  check(ok.stdout.includes('request: Say alpha.'), `a stub run did not receive the prompt:\n${ok.output}`);

  const absolute = runRunner(['--skill-root', path.join(PROJECT_ROOT, STUB_SKILL), ...STUB_OPTIONS]);
  check(
    absolute.status === 0,
    `an absolute skill root inside the working directory exited ${absolute.status}; expected 0\n${absolute.output}`,
  );

  const cases = [
    ['no --skill-root', [...STUB_OPTIONS], {}, EXIT_CODES.usage],
    ['no --agent', ['--skill-root', STUB_SKILL], {}, EXIT_CODES.usage],
    ['an empty prompt', ['--skill-root', STUB_SKILL, ...STUB_OPTIONS], { input: '  \n' }, EXIT_CODES.usage],
    ['a malformed --timeout-ms', ['--skill-root', STUB_SKILL, ...STUB_OPTIONS, '--timeout-ms', '20abc'], {}, EXIT_CODES.usage],
    ['an unknown --capability', ['--skill-root', STUB_SKILL, ...STUB_OPTIONS, '--capability', 'root'], {}, EXIT_CODES.usage],
    ['a skill root outside the working directory', ['--skill-root', path.dirname(PROJECT_ROOT), ...STUB_OPTIONS], {}, EXIT_CODES.usage],
    ['a skill root that climbs out', ['--skill-root', '../elsewhere', ...STUB_OPTIONS], {}, EXIT_CODES.usage],
    ['an unknown agent', ['--skill-root', STUB_SKILL, '--agent', 'nobody'], {}, EXIT_CODES['environment-configuration']],
    [
      'a missing skill root',
      ['--skill-root', 'test/fixtures/evaluate/no-such-skill', ...STUB_OPTIONS],
      {},
      EXIT_CODES['environment-configuration'],
    ],
    [
      'a skill root holding no SKILL.md',
      ['--skill-root', 'test/fixtures/evaluate/stub-agent', ...STUB_OPTIONS],
      {},
      EXIT_CODES['environment-configuration'],
    ],
    [
      'an agent that exits non-zero',
      ['--skill-root', STUB_SKILL, ...STUB_OPTIONS],
      { input: 'STUB-EXIT 7' },
      EXIT_CODES['environment-transport'],
    ],
    [
      'an agent that outlives --timeout-ms',
      ['--skill-root', STUB_SKILL, ...STUB_OPTIONS, '--timeout-ms', '300'],
      { input: 'STUB-SLEEP 5000' },
      EXIT_CODES['environment-timeout'],
    ],
  ];
  for (const [name, args, options, expected] of cases) {
    const result = runRunner(args, options);
    check(result.status === expected, `the runner with ${name} exited ${result.status}; expected ${expected}\n${result.output}`);
    check(result.stderr.includes('tea-skill-runner: '), `the runner with ${name} named no reason on stderr:\n${result.output}`);
  }

  // A symbolic link inside the working directory that points outside it.
  const cwd = tempDir('runner-cwd');
  const outside = tempDir('runner-outside');
  fs.writeFileSync(path.join(outside, 'SKILL.md'), '---\nname: outside-skill\n---\n');
  fs.symlinkSync(outside, path.join(cwd, 'skill'), 'dir');
  const linked = runRunner(['--skill-root', 'skill', '--agent', 'custom', '--agent-cmd', path.join(PROJECT_ROOT, STUB_AGENT)], { cwd });
  check(
    linked.status === EXIT_CODES.usage,
    `a skill root linked outside the working directory exited ${linked.status}; expected ${EXIT_CODES.usage}\n${linked.output}`,
  );

  // SKILL.md itself linked outside the working directory.
  const entryCwd = tempDir('runner-entry');
  fs.mkdirSync(path.join(entryCwd, 'skill'));
  fs.symlinkSync(path.join(outside, 'SKILL.md'), path.join(entryCwd, 'skill', 'SKILL.md'));
  const linkedEntry = runRunner(['--skill-root', 'skill', '--agent', 'custom', '--agent-cmd', path.join(PROJECT_ROOT, STUB_AGENT)], {
    cwd: entryCwd,
  });
  check(
    linkedEntry.status === EXIT_CODES.usage,
    `a SKILL.md linked outside the working directory exited ${linkedEntry.status}; expected ${EXIT_CODES.usage}\n${linkedEntry.output}`,
  );

  // An absolute skill root spelled through a symbolic link to the working directory, and one holding a backtick.
  const spelled = tempDir('runner-spelled');
  fs.cpSync(path.join(PROJECT_ROOT, STUB_SKILL), path.join(spelled, 'skill'), { recursive: true });
  const linkedCwd = path.join(tempDir('runner-linked-cwd'), 'linked');
  fs.symlinkSync(spelled, linkedCwd, 'dir');
  const absoluteSpelled = runRunner(
    ['--skill-root', path.join(linkedCwd, 'skill'), '--agent', 'custom', '--agent-cmd', path.join(PROJECT_ROOT, STUB_AGENT)],
    { cwd: linkedCwd },
  );
  check(
    absoluteSpelled.status === 0,
    `an absolute skill root spelled through a linked working directory exited ${absoluteSpelled.status}\n${absoluteSpelled.output}`,
  );
  fs.cpSync(path.join(PROJECT_ROOT, STUB_SKILL), path.join(spelled, 'sk`ill'), { recursive: true });
  const backtick = runRunner(['--skill-root', 'sk`ill', '--agent', 'custom', '--agent-cmd', path.join(PROJECT_ROOT, STUB_AGENT)], {
    cwd: spelled,
  });
  check(
    backtick.status === EXIT_CODES.usage,
    `a skill root holding a backtick exited ${backtick.status}; expected ${EXIT_CODES.usage}\n${backtick.output}`,
  );

  // An unexpected error inside the runner, planted by failing the filesystem call it makes first.
  const crash = spawnSync(
    process.execPath,
    [
      '-e',
      "const runner = require(process.argv[1]); require('node:fs').realpathSync = () => { throw new TypeError('planted'); }; process.exitCode = runner.main(process.argv);",
      RUNNER,
      '--skill-root',
      STUB_SKILL,
      ...STUB_OPTIONS,
    ],
    { cwd: PROJECT_ROOT, input: 'Say alpha.', encoding: 'utf8' },
  );
  check(
    crash.status === EXIT_CODES['environment-transport'],
    `an unexpected runner error exited ${crash.status}; expected ${EXIT_CODES['environment-transport']}\n${crash.stderr}`,
  );
  check(
    crash.stderr.includes('unexpected error') && crash.stderr.includes('planted'),
    `the unexpected runner error did not name itself on stderr:\n${crash.stderr}`,
  );
}

/**
 * The runner's own process handling: a prompt that is not UTF-8 is a usage
 * error, a reader that closes standard output early is transport (4) and no
 * crash, and nothing the agent started outlives a timeout or a killed runner.
 */
async function checkRunnerProcesses() {
  const invalid = runRunner(['--skill-root', STUB_SKILL, ...STUB_OPTIONS], { input: Buffer.from([0x53, 0x61, 0x79, 0x20, 0xff, 0xfe]) });
  check(
    invalid.status === EXIT_CODES.usage,
    `a prompt that is not UTF-8 exited ${invalid.status}; expected ${EXIT_CODES.usage}\n${invalid.output}`,
  );
  check(invalid.stderr.includes('not valid UTF-8'), `the invalid prompt was not named on stderr:\n${invalid.output}`);

  // A reader that takes the first chunk of a large reply and closes the pipe.
  const piped = spawn(process.execPath, [RUNNER, '--skill-root', STUB_SKILL, ...STUB_OPTIONS], { cwd: PROJECT_ROOT, env: BASE_ENV });
  let stderr = '';
  piped.stderr.on('data', (chunk) => (stderr += chunk));
  piped.stdout.once('data', () => piped.stdout.destroy());
  piped.stdin.end('Say alpha. STUB-BIG 4000000');
  const closed = await ended(piped);
  check(
    closed.code === EXIT_CODES['environment-transport'],
    `the runner whose reader closed early exited ${closed.code} (${closed.signal}); expected ${EXIT_CODES['environment-transport']}\n${stderr}`,
  );
  check(stderr.includes("could not write the agent's output"), `the closed reader was not named on stderr:\n${stderr}`);

  // An agent that starts a child and then outlives --timeout-ms.
  const timedOutPid = path.join(tempDir('orphan-timeout'), 'pid');
  const timedOut = runRunner(['--skill-root', STUB_SKILL, ...STUB_OPTIONS, '--timeout-ms', '500'], {
    input: `Say alpha. STUB-ORPHAN ${timedOutPid} STUB-SLEEP 10000`,
  });
  check(
    timedOut.status === EXIT_CODES['environment-timeout'],
    `the orphaning agent's timeout exited ${timedOut.status}\n${timedOut.output}`,
  );
  const orphan = await pidFrom(timedOutPid, 1000);
  check(orphan !== null, 'the orphaning agent recorded no child pid');
  if (orphan !== null) {
    check(await processEnds(orphan), `a child the agent started (pid ${orphan}) outlived the runner's timeout`);
    reap(orphan);
  }

  // The runner killed on its own, as eval-quality's adapter before 4.1.1 kills it at its ceiling.
  const killedPid = path.join(tempDir('orphan-killed'), 'pid');
  const killed = spawn(process.execPath, [RUNNER, '--skill-root', STUB_SKILL, ...STUB_OPTIONS], {
    cwd: PROJECT_ROOT,
    env: BASE_ENV,
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  killed.stdin.end(`Say alpha. STUB-ORPHAN ${killedPid} STUB-SLEEP 30000`);
  const survivor = await pidFrom(killedPid);
  killed.kill('SIGKILL');
  await ended(killed);
  check(survivor !== null, 'the agent under a killed runner recorded no child pid');
  if (survivor !== null) {
    check(await processEnds(survivor), `a child the agent started (pid ${survivor}) outlived its runner's SIGKILL`);
    reap(survivor);
  }
}

/** A runner started in the background on `input`, with its output collected and its ending awaited. */
function startRunner(args, input, { detached = false } = {}) {
  const child = spawn(process.execPath, [RUNNER, '--skill-root', STUB_SKILL, ...STUB_OPTIONS, ...args], {
    cwd: PROJECT_ROOT,
    env: BASE_ENV,
    detached,
  });
  let stderr = '';
  child.stdout.resume();
  child.stderr.on('data', (chunk) => (stderr += chunk));
  child.stdin.end(input);
  const closed = ended(child).then((ending) => ({ ...ending, stderr }));
  return { child, closed };
}

/** The pids of the children of `pid`. */
function childrenOf(pid) {
  const listed = spawnSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' });
  return listed.stdout.split(/\s+/).filter(Boolean).map(Number);
}

/**
 * The agent's process group outlives no ending of the runner or of the
 * supervisor between them, and the supervisor reports how the agent ended:
 * a signal to the runner's whole group, the supervisor killed or stopped on
 * its own, the runner gone before the supervisor looked, a child the agent
 * leaves behind when it exits, each forwarded signal, and a wall clock past
 * the 2^31-1 ms one Node timer holds.
 */
async function checkSupervision() {
  if (process.platform === 'win32') return;
  const long = ['--timeout-ms', '1200000'];

  // The runner's whole group killed, as a cancelled CI job or `timeout -s KILL` kills it.
  const groupPid = path.join(tempDir('group-kill'), 'pid');
  const group = startRunner(long, `Say alpha. STUB-ORPHAN ${groupPid} STUB-SLEEP 30000`, { detached: true });
  const groupChild = await pidFrom(groupPid);
  check(groupChild !== null, 'the agent under a group-killed runner recorded no child pid');
  process.kill(-group.child.pid, 'SIGKILL');
  await group.closed;
  if (groupChild !== null) {
    check(await processEnds(groupChild), `a child the agent started (pid ${groupChild}) outlived a SIGKILL to the runner's process group`);
    reap(groupChild);
  }

  // The supervisor killed on its own: the lifeline closes, the group stops, and the runner reports no timeout.
  const supervisorPid = path.join(tempDir('supervisor-kill'), 'pid');
  const killed = startRunner(long, `Say alpha. STUB-ORPHAN ${supervisorPid} STUB-SLEEP 30000`);
  const killedChild = await pidFrom(supervisorPid);
  const [supervisor] = childrenOf(killed.child.pid);
  check(supervisor !== undefined, 'the runner started no supervisor');
  if (supervisor !== undefined) process.kill(supervisor, 'SIGKILL');
  const killedAt = Date.now();
  const killedEnding = await killed.closed;
  check(
    killedEnding.code === EXIT_CODES['environment-transport'] && !/timed out/i.test(killedEnding.stderr),
    `a runner whose supervisor was killed exited ${killedEnding.code}; expected ${EXIT_CODES['environment-transport']} with no timeout\n${killedEnding.stderr}`,
  );
  check(
    Date.now() - killedAt < 10_000,
    `a runner whose supervisor was killed took ${Date.now() - killedAt} ms to return; the agent's group outlived it`,
  );
  if (killedChild !== null) {
    check(await processEnds(killedChild), `a child the agent started (pid ${killedChild}) outlived its supervisor's SIGKILL`);
    reap(killedChild);
  }

  // The group leader killed on its own: the supervisor kills what is left of its group.
  const leaderPid = path.join(tempDir('leader-kill'), 'pid');
  const leaderRun = startRunner(long, `Say alpha. STUB-ORPHAN ${leaderPid} STUB-SLEEP 30000`);
  const leaderChild = await pidFrom(leaderPid);
  const [leader] = childrenOf(childrenOf(leaderRun.child.pid)[0] ?? 0);
  check(leader !== undefined, 'the supervisor started no group leader');
  if (leader !== undefined) process.kill(leader, 'SIGKILL');
  const leaderKilledAt = Date.now();
  const leaderEnding = await leaderRun.closed;
  check(
    Date.now() - leaderKilledAt < 10_000,
    `a runner whose group leader was killed took ${Date.now() - leaderKilledAt} ms to return; the agent's group outlived the leader`,
  );
  check(
    leaderEnding.code === EXIT_CODES['environment-transport'] && leaderEnding.stderr.includes('group leader was killed by signal SIGKILL'),
    `a runner whose group leader was killed exited ${leaderEnding.code}; expected ${EXIT_CODES['environment-transport']} naming the leader\n${leaderEnding.stderr}`,
  );
  if (leaderChild !== null) {
    check(await processEnds(leaderChild), `a child the agent started (pid ${leaderChild}) outlived its group leader's SIGKILL`);
    reap(leaderChild);
  }

  // A supervisor that never reports (stopped here) is a transport failure once spawnSync's backstop runs out.
  const stoppedPid = path.join(tempDir('supervisor-stop'), 'pid');
  const stopped = startRunner(['--timeout-ms', '1000'], `Say alpha. STUB-ORPHAN ${stoppedPid} STUB-SLEEP 30000`);
  const stoppedChild = await pidFrom(stoppedPid);
  const [stoppedSupervisor] = childrenOf(stopped.child.pid);
  if (stoppedSupervisor !== undefined) process.kill(stoppedSupervisor, 'SIGSTOP');
  const stoppedEnding = await stopped.closed;
  check(
    stoppedEnding.code === EXIT_CODES['environment-transport'] && stoppedEnding.stderr.includes('gave no report'),
    `a runner whose supervisor never reported exited ${stoppedEnding.code}; expected ${EXIT_CODES['environment-transport']}, a supervisor failure\n${stoppedEnding.stderr}`,
  );
  if (stoppedChild !== null) {
    check(await processEnds(stoppedChild), `a child the agent started (pid ${stoppedChild}) outlived its stopped supervisor`);
    reap(stoppedChild);
  }

  // The runner gone before the supervisor first looks: its pid is not the supervisor's parent.
  const gone = spawnSync(process.execPath, ['-e', '0']).pid;
  const earlyPid = path.join(tempDir('runner-early'), 'pid');
  const agent = `const c = require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' }); require('node:fs').writeFileSync(${JSON.stringify(earlyPid)}, String(c.pid)); setTimeout(() => {}, 30000);`;
  const orphaned = spawn(process.execPath, [SUPERVISOR, String(gone), '1200000', process.execPath, '-e', agent], { stdio: 'ignore' });
  const orphanedEnds = ended(orphaned);
  const supervisorEnded = await Promise.race([orphanedEnds.then(() => true), delay(5000).then(() => false)]);
  check(supervisorEnded, 'a supervisor whose runner was gone before it started kept its agent running for 5 s');
  if (!supervisorEnded) orphaned.kill('SIGKILL');
  await orphanedEnds;
  // The group leader stops the agent, and SIGKILLs it after its grace period, once the lifeline closes.
  await delay(2500);
  const earlyChild = fs.existsSync(earlyPid) ? Number(fs.readFileSync(earlyPid, 'utf8')) : null;
  if (earlyChild !== null) {
    check(
      await processEnds(earlyChild),
      `a child the agent started (pid ${earlyChild}) outlived a runner that was gone before its supervisor started`,
    );
    reap(earlyChild);
  }

  // The agent answers and exits, leaving a child behind.
  const leftPid = path.join(tempDir('left-behind'), 'pid');
  const left = runRunner(['--skill-root', STUB_SKILL, ...STUB_OPTIONS], { input: `Say alpha. STUB-LEAVE ${leftPid}` });
  check(left.status === 0, `an agent that leaves a child behind exited ${left.status}; expected 0\n${left.output}`);
  const leftChild = await pidFrom(leftPid, 1000);
  check(leftChild !== null, 'the agent recorded no child it left behind');
  if (leftChild !== null) {
    check(await processEnds(leftChild), `a child the agent left behind (pid ${leftChild}) outlived the agent's exit`);
    reap(leftChild);
  }

  // Each forwarded signal, sent to the supervisor alone, reaches the agent's group.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT']) {
    const pidFile = path.join(tempDir(`forward-${signal}`), 'pid');
    const run = startRunner(long, `Say alpha. STUB-ORPHAN ${pidFile} STUB-SLEEP 30000`);
    const forwardedChild = await pidFrom(pidFile);
    const [forwardingSupervisor] = childrenOf(run.child.pid);
    if (forwardingSupervisor !== undefined) process.kill(forwardingSupervisor, signal);
    const ending = await run.closed;
    check(
      ending.code === EXIT_CODES['environment-transport'] && ending.stderr.includes(`killed by signal ${signal}`),
      `a runner whose supervisor received ${signal} exited ${ending.code}; expected the agent killed by ${signal}\n${ending.stderr}`,
    );
    if (forwardedChild !== null) {
      check(await processEnds(forwardedChild), `a child the agent started (pid ${forwardedChild}) outlived a forwarded ${signal}`);
      reap(forwardedChild);
    }
  }

  // A wall clock past the 2^31-1 ms one Node timer holds.
  const far = runRunner(['--skill-root', STUB_SKILL, ...STUB_OPTIONS, '--timeout-ms', String(2 ** 31)]);
  check(
    far.status === 0 && far.stdout.includes('skill: stub-skill'),
    `--timeout-ms ${2 ** 31} exited ${far.status}; expected 0\n${far.output}`,
  );
}

// ---------------------------------------------------------------------------
// tea-evaluate preflight

/**
 * A temp copy of an evaluation fixture whose launch root points back at its
 * target in this repository: the stub project for the preflight fixture, the
 * repository itself for the check fixture.
 */
function copyFixture(source = PREFLIGHT_FIXTURE, root = STUB_PROJECT) {
  const folder = path.join(tempDir('case'), path.basename(source));
  fs.cpSync(source, folder, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  editJson(folder, 'evaluation.json', (value) => {
    value.launch.root = path.relative(folder, root).split(path.sep).join('/');
  });
  return folder;
}

/**
 * A directory holding `tea-skill-runner` as a link to this repository's runner,
 * put on PATH the way `npm exec` puts an installed package's bins there, since
 * the fixture registers the runner by its bin name.
 */
let binDirectory;
function runnerPath() {
  if (binDirectory === undefined) {
    binDirectory = tempDir('bin');
    fs.symlinkSync(RUNNER, path.join(binDirectory, 'tea-skill-runner'));
  }
  return `${binDirectory}${path.delimiter}${BASE_ENV.PATH ?? ''}`;
}

function runEvaluate(args, { env = {}, node = [] } = {}) {
  const result = spawnSync(process.execPath, [...node, EVALUATE, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...BASE_ENV, PATH: runnerPath(), ...env },
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}${result.stderr}` };
}

function runPreflight(folder, options) {
  return runEvaluate(folder === null ? ['preflight'] : ['preflight', '--evaluation', folder], options);
}

/** The one run directory an invocation wrote, or null. */
function runDirectoryOf(folder) {
  const runs = path.join(folder, 'runs');
  if (!fs.existsSync(runs)) return null;
  const entries = fs.readdirSync(runs, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  return entries.length === 1 ? path.join(runs, entries[0].name) : null;
}

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { recursive: true }).map((relative) => path.join(directory, relative));
}

/**
 * Why a run is not a passed preflight with no authorization denial; empty when
 * it is. The passing case asserts this is empty, and the removed-entry case
 * asserts it is not, so removing the stub's registry entry fails the same
 * assertions.
 */
function passedPreflightProblems(runDirectory) {
  if (runDirectory === null) return ['the invocation wrote no runs/<invocationId>/ directory'];
  const problems = [];
  const observations = filesUnder(path.join(runDirectory, 'observations'));
  if (observations.length === 0) problems.push('runs/<invocationId>/observations/ is empty');
  const verdictPath = path.join(runDirectory, 'preflight-verdict.json');
  const verdict = fs.existsSync(verdictPath) ? readJson(verdictPath) : null;
  if (verdict?.passed !== true)
    problems.push(`the CLI's PreflightVerdict is ${verdict === null ? 'missing' : `passed: ${verdict.passed}`}`);
  // The files the runtime writes about legs and the verdict; a stage's own
  // stdout and stderr under engine/ are the engine's words and may name its vocabulary.
  const legFiles = [
    ...filesUnder(path.join(runDirectory, 'observations')),
    ...filesUnder(path.join(runDirectory, 'faults')),
    path.join(runDirectory, 'observations.json'),
    verdictPath,
  ];
  for (const file of legFiles) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const denial of DENIALS) if (text.includes(denial)) problems.push(`${path.relative(runDirectory, file)} records ${denial}`);
  }
  return problems;
}

function checkPasses() {
  const folder = copyFixture();
  const result = runPreflight(folder);
  check(result.status === 0, `preflight over the stub exited ${result.status}; expected 0\n${result.output}`);
  const runDirectory = runDirectoryOf(folder);
  for (const problem of passedPreflightProblems(runDirectory)) check(false, `the passing preflight: ${problem}`);
  if (runDirectory === null) return;
  const invocationId = path.basename(runDirectory);
  const legs = filesUnder(path.join(runDirectory, 'observations')).map((file) => readJson(file).legId);
  check(
    JSON.stringify(legs) === JSON.stringify(['witness-alpha', 'witness-beta', 'preflight-control-observe', 'preflight-control-observe-2']),
    `the persisted legs are ${JSON.stringify(legs)}; expected both witness legs and both control legs, in plan order`,
  );
  const observationsPath = path.join(runDirectory, 'observations.json');
  const persisted = fs.existsSync(observationsPath) ? readJson(observationsPath) : null;
  check(persisted?.length === legs.length, `observations.json holds ${persisted?.length ?? 'no'} observation(s) for ${legs.length} leg(s)`);
  const callPath = path.join(runDirectory, 'engine', 'preflight.json');
  const argv = fs.existsSync(callPath) ? readJson(callPath).argv : [];
  check(fs.existsSync(callPath), 'the run recorded no eval-quality preflight call, so its verdict came from somewhere else');
  const runIdAt = argv.indexOf('--run-id');
  check(runIdAt > 0 && argv[runIdAt + 1] === invocationId, `the preflight call's --run-id is not the invocation's: ${argv}`);
  check(argv.includes('--observations'), `the preflight call carries no --observations: ${argv}`);
  check(
    fs.existsSync(callPath) && readJson(callPath).substituted === false,
    'the preflight call over the installed CLI is not recorded as substituted: false',
  );
  for (const artifact of ['eval-contract.json', 'sealed-evaluator-brief.json', 'probes.json']) {
    check(fs.existsSync(path.join(runDirectory, artifact)), `the run holds no ${artifact}`);
  }
  check(!fs.existsSync(path.join(runDirectory, 'faults')), 'a passing run recorded a leg fault');
}

function checkRemovedEntry() {
  const folder = copyFixture();
  editJson(folder, 'evaluation.json', (value) => (value.registry[0].executable = 'tea-other-runner'));
  const result = runPreflight(folder);
  check(result.status === 10, `preflight with the stub's registry entry removed exited ${result.status}; expected 10\n${result.output}`);
  const runDirectory = runDirectoryOf(folder);
  const problems = passedPreflightProblems(runDirectory);
  check(
    problems.some((problem) => problem.includes('forbidden-target')),
    `the passing-preflight assertions did not observe the denial once the stub's entry was removed: ${JSON.stringify(problems)}`,
  );
  if (runDirectory === null) return;
  const faults = filesUnder(path.join(runDirectory, 'faults'));
  check(faults.length === 1, `a denied run recorded ${faults.length} fault(s); expected the one refused leg`);
  check(!fs.existsSync(path.join(runDirectory, 'engine', 'preflight.json')), 'a denied run still asked the CLI for a verdict');
}

function checkShim() {
  const folder = copyFixture();
  const log = path.join(tempDir('shim'), 'argv.log');
  const result = runPreflight(folder, {
    env: { [ENGINE_CLI_ENV]: SHIM, TEA_EVALUATE_SHIM_LOG: log, TEA_EVALUATE_SHIM_EXIT_PREFLIGHT: '5' },
  });
  check(
    result.status === 5,
    `preflight under the logging shim exited ${result.status}; expected the shim's preflight exit 5\n${result.output}`,
  );
  const lines = fs.existsSync(log)
    ? fs
        .readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    : [];
  check(
    JSON.stringify(lines.map((argv) => argv[0])) === JSON.stringify(['compile', 'seal', 'preflight']),
    `the shim saw ${JSON.stringify(lines.map((argv) => argv[0]))}; expected compile, seal, preflight`,
  );
  const runDirectory = runDirectoryOf(folder);
  const preflight = lines.find((argv) => argv[0] === 'preflight') ?? [];
  const runIdAt = preflight.indexOf('--run-id');
  check(preflight.includes('--observations'), `the logged preflight argv carries no --observations: ${JSON.stringify(preflight)}`);
  check(
    runDirectory !== null && runIdAt > 0 && preflight[runIdAt + 1] === path.basename(runDirectory),
    `the logged preflight argv does not carry this run's --run-id: ${JSON.stringify(preflight)}`,
  );
  check(
    runDirectory !== null && filesUnder(path.join(runDirectory, 'observations')).length === 4,
    'the legs did not run under the shim; the library drives them whatever the CLI is',
  );
  check(
    runDirectory !== null && !fs.existsSync(path.join(runDirectory, 'preflight-verdict.json')),
    'a verdict file exists though the shim wrote none, so something other than the CLI wrote a verdict',
  );
  const shimRecord = runDirectory === null ? null : path.join(runDirectory, 'engine', 'preflight.json');
  check(
    shimRecord !== null && fs.existsSync(shimRecord) && readJson(shimRecord).substituted === true,
    'the preflight call under the shim is not recorded as substituted: true',
  );

  // Exits eval-quality documents for another stage only: 2 is a score verdict, 3 is no compile exit.
  for (const [stage, code] of [
    ['PREFLIGHT', '2'],
    ['COMPILE', '3'],
  ]) {
    const undocumented = runPreflight(copyFixture(), {
      env: {
        [ENGINE_CLI_ENV]: SHIM,
        TEA_EVALUATE_SHIM_LOG: path.join(tempDir('shim-stage'), 'argv.log'),
        [`TEA_EVALUATE_SHIM_EXIT_${stage}`]: code,
      },
    });
    check(
      undocumented.status === 12,
      `preflight whose ${stage.toLowerCase()} exits ${code}, which eval-quality does not document for it, exited ${undocumented.status}; expected 12\n${undocumented.output}`,
    );
  }

  const compileFolder = copyFixture();
  const compileLog = path.join(tempDir('shim-compile'), 'argv.log');
  const failed = runPreflight(compileFolder, {
    env: { [ENGINE_CLI_ENV]: SHIM, TEA_EVALUATE_SHIM_LOG: compileLog, TEA_EVALUATE_SHIM_EXIT_COMPILE: '4' },
  });
  check(failed.status === 4, `preflight whose compile exits 4 exited ${failed.status}; expected 4 passed through\n${failed.output}`);
  const logLines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n') : []);
  check(logLines(compileLog).length === 1, 'the run went on past a failed compile');
  const compileRun = runDirectoryOf(compileFolder);
  check(compileRun !== null && !fs.existsSync(path.join(compileRun, 'observations')), 'a leg ran after a failed compile');

  const sealFolder = copyFixture();
  const sealLog = path.join(tempDir('shim-seal'), 'argv.log');
  const sealFailed = runPreflight(sealFolder, {
    env: { [ENGINE_CLI_ENV]: SHIM, TEA_EVALUATE_SHIM_LOG: sealLog, TEA_EVALUATE_SHIM_EXIT_SEAL: '5' },
  });
  check(
    sealFailed.status === 5,
    `preflight whose seal exits 5 exited ${sealFailed.status}; expected 5 passed through\n${sealFailed.output}`,
  );
  check(logLines(sealLog).length === 2, 'the run went on past a failed seal');
  const sealRun = runDirectoryOf(sealFolder);
  check(sealRun !== null && !fs.existsSync(path.join(sealRun, 'observations')), 'a leg ran after a failed seal');
}

function checkFailingControl() {
  const folder = copyFixture();
  editJson(folder, 'contract.json', (contract) => {
    const legs = contract.permittedInterfaces[0].operations[0].sensitivityWitness.legs;
    legs[0].inputs.stdin.value = 'Say alpha. STUB-EXIT 9';
  });
  const result = runPreflight(folder);
  check(
    result.status === 3,
    `preflight whose control leg exits non-zero exited ${result.status}; expected 3 from the CLI\n${result.output}`,
  );
  const runDirectory = runDirectoryOf(folder);
  if (runDirectory === null) {
    check(false, 'the failing-control run wrote no run directory');
    return;
  }
  const verdictPath = path.join(runDirectory, 'preflight-verdict.json');
  const verdict = fs.existsSync(verdictPath) ? readJson(verdictPath) : null;
  const cleanControl = verdict?.checks?.find((entry) => entry.kind === 'clean-control');
  check(
    cleanControl?.outcome === 'failed' && JSON.stringify(cleanControl).includes('exit code 4'),
    `the CLI's verdict does not fail clean-control on the control leg's exit 4: ${JSON.stringify(cleanControl)}`,
  );
  const control = filesUnder(path.join(runDirectory, 'observations'))
    .map((file) => readJson(file))
    .find((entry) => entry.legId === 'preflight-control-observe');
  check(
    control?.observation?.exitCode === EXIT_CODES['environment-transport'],
    `the control leg's runner exit is ${control?.observation?.exitCode}; expected the transport class`,
  );
  const direct = spawnSync(
    process.execPath,
    [
      engineCliPath({}),
      'preflight',
      '--contract',
      path.join(folder, 'contract.json'),
      '--probes',
      path.join(runDirectory, 'probes.json'),
      '--observations',
      path.join(runDirectory, 'observations.json'),
      '--run-id',
      path.basename(runDirectory),
      '--out',
      path.join(tempDir('direct'), 'preflight-verdict.json'),
    ],
    { encoding: 'utf8' },
  );
  check(
    direct.status === 3 && direct.status === result.status,
    `the direct CLI over the persisted files exited ${direct.status}; tea-evaluate exited ${result.status}; both should be 3`,
  );
}

function checkRefusals() {
  const seeded = copyFixture(VALID_FIXTURE, PROJECT_ROOT);
  const seededResult = runPreflight(seeded);
  check(seededResult.status === 12, `preflight over a seeded probe exited ${seededResult.status}; expected 12\n${seededResult.output}`);
  check(seededResult.stdout.includes('probes/P-002.probe.json'), `the seeded refusal does not name the probe:\n${seededResult.output}`);
  check(runDirectoryOf(seeded) === null, 'a refused seeded evaluation still started a run');

  const missing = copyFixture();
  editJson(missing, 'evaluation.json', (value) => (value.registry[0].target = 'cli/no-such-runner.js'));
  const missingResult = runPreflight(missing);
  check(
    missingResult.status === 12,
    `preflight with a missing registry target exited ${missingResult.status}; expected 12\n${missingResult.output}`,
  );
  check(missingResult.stdout.includes('does not exist'), `the missing-target refusal does not say why:\n${missingResult.output}`);
  check(runDirectoryOf(missing) === null, 'a registry target that cannot launch still started a run');

  const stale = copyFixture();
  editJson(stale, 'probes/P-001.probe.json', (value) => (value.rationale = `${value.rationale} Edited.`));
  const staleResult = runPreflight(stale);
  check(staleResult.status === 10, `preflight over a stale index exited ${staleResult.status}; expected 10\n${staleResult.output}`);
  check(staleResult.stdout.includes('[stale-index]'), `the authoring defect was not printed as a finding:\n${staleResult.output}`);
  check(runDirectoryOf(stale) === null, 'an evaluation with an authoring defect still started a run');

  const usage = runPreflight(null);
  check(usage.status === 64, `preflight with no --evaluation exited ${usage.status}; expected 64\n${usage.output}`);

  const absent = runPreflight(copyFixture(), { node: ['--require', HIDE_ENGINE] });
  check(absent.status === 12, `preflight with no engine installed exited ${absent.status}; expected 12\n${absent.output}`);
  check(absent.output.includes('eval-quality is not installed'), `the missing engine was not named:\n${absent.output}`);

  // A leg the adapter cannot finish, for a reason other than authorization:
  // the registry's output ceiling is below what the stub prints.
  const slow = copyFixture();
  editJson(slow, 'evaluation.json', (value) => (value.registry[0].maxOutputBytes = 8));
  const slowResult = runPreflight(slow);
  check(
    slowResult.status === 12,
    `preflight whose leg exceeds its output budget exited ${slowResult.status}; expected 12\n${slowResult.output}`,
  );
  const slowRun = runDirectoryOf(slow);
  const slowFaults = slowRun === null ? [] : filesUnder(path.join(slowRun, 'faults'));
  check(slowFaults.length === 1, `a leg that exceeded its budget recorded ${slowFaults.length} fault(s); expected 1`);
  check(
    slowFaults.every((file) => readJson(file).code === 'budget-exhausted'),
    'the over-budget leg was not recorded as budget-exhausted',
  );
  check(
    slowRun !== null && !fs.existsSync(path.join(slowRun, 'engine', 'preflight.json')),
    'an over-budget run still asked the CLI for a verdict',
  );
}

/** Adds an option every leg and the plan step hand the runner, and permits it in the request shape. */
function addRunnerOption(folder, name, value) {
  editJson(folder, 'contract.json', (contract) => {
    const operation = contract.permittedInterfaces[0].operations[0];
    if (!operation.requestShape.option.permittedKeys.includes(name)) operation.requestShape.option.permittedKeys.push(name);
    operation.requestShape.option.types[name] = 'string';
    for (const leg of operation.sensitivityWitness.legs) leg.inputs.option[name] = value;
    contract.interactionPlan[0].inputBinding.option[name] = { literal: value };
  });
}

function checkEnvironmentValuesStayOut() {
  const folder = copyFixture();
  const secret = 'tea-stub-secret-value-7f3a91';
  editJson(folder, 'evaluation.json', (value) => (value.registry[0].environmentKeys = ['TEA_STUB_SECRET']));
  addRunnerOption(folder, 'env-pass', 'TEA_STUB_SECRET');
  const declared = 'leg-declared-value-2b8c';
  editJson(folder, 'contract.json', (contract) => {
    const operation = contract.permittedInterfaces[0].operations[0];
    operation.requestShape.environment.permittedKeys.push('TEA_STUB_SECRET');
    operation.requestShape.environment.types.TEA_STUB_SECRET = 'string';
    for (const leg of operation.sensitivityWitness.legs) {
      leg.inputs.stdin.value = `${leg.inputs.stdin.value} STUB-ENV TEA_STUB_SECRET`;
    }
    // One leg declares its own value, which wins over the host's.
    operation.sensitivityWitness.legs[1].inputs.environment.TEA_STUB_SECRET = declared;
  });
  const result = runPreflight(folder, { env: { TEA_STUB_SECRET: secret } });
  check(result.status === 0, `preflight with a permitted environment key exited ${result.status}; expected 0\n${result.output}`);
  const runDirectory = runDirectoryOf(folder);
  const first = filesUnder(path.join(runDirectory ?? folder, 'observations'))[0];
  const recorded = first === undefined ? null : readJson(first);
  check(
    JSON.stringify(recorded?.request?.channels?.environment) === JSON.stringify(['TEA_STUB_SECRET']),
    'the recorded request does not list the environment key the registry entry permits',
  );
  check(
    JSON.stringify(recorded?.observation?.stdout ?? '').includes('env: [redacted]'),
    `the host value did not reach the agent, or its echo was not scrubbed: ${JSON.stringify(recorded?.observation?.stdout)}`,
  );
  for (const file of filesUnder(runDirectory ?? folder)) {
    if (fs.statSync(file).isFile()) check(!fs.readFileSync(file, 'utf8').includes(secret), `${file} holds an environment value`);
  }
  const echoes = Object.fromEntries(
    filesUnder(path.join(runDirectory ?? folder, 'observations')).map((file) => {
      const entry = readJson(file);
      return [entry.legId, /env: (.*)/.exec(entry.observation?.stdout?.value ?? '')?.[1] ?? null];
    }),
  );
  check(
    echoes['witness-beta'] === declared,
    `the leg that declares its own value received ${JSON.stringify(echoes['witness-beta'])}; its declared value beats the host's`,
  );
  check(
    echoes['witness-alpha'] === '[redacted]',
    `a leg that declares no value received ${JSON.stringify(echoes['witness-alpha'])}; expected the host's, scrubbed`,
  );
}

/** Appends `text` to the first witness leg's prompt. */
function firstLegSays(folder, text) {
  editJson(folder, 'contract.json', (contract) => {
    const legs = contract.permittedInterfaces[0].operations[0].sensitivityWitness.legs;
    legs[0].inputs.stdin.value = `${legs[0].inputs.stdin.value} ${text}`;
  });
}

/** The first witness leg's observed stdout, or ''. */
function firstLegStdout(runDirectory) {
  const first = runDirectory === null ? undefined : filesUnder(path.join(runDirectory, 'observations'))[0];
  return first === undefined ? '' : (readJson(first).observation?.stdout?.value ?? '');
}

function checkCopyAndRunsIgnore() {
  const project = stubProject('copy');
  const folder = copyFixture(PREFLIGHT_FIXTURE, project);
  firstLegSays(folder, 'STUB-WRITE');
  const temp = privateTemp('copy-temp');
  const result = runPreflight(folder, { env: temp.env });
  check(fs.readdirSync(temp.directory).length === 0, 'the disposable copy of the target root was left in the temp directory');
  check(result.status === 0, `preflight whose leg writes a file exited ${result.status}; expected 0\n${result.output}`);
  check(!fs.existsSync(path.join(project, 'stub-wrote.txt')), 'a leg wrote into the target root; legs run in a disposable copy');
  const ignore = path.join(folder, 'runs', '.gitignore');
  check(fs.existsSync(ignore) && fs.readFileSync(ignore, 'utf8') === '*\n', 'runs/ carries no .gitignore that ignores every run');
}

/**
 * The copy leaves `.git` and the evaluation's own `runs/` behind and links a
 * provisioned directory in, with the evaluation folder inside the target.
 */
function checkCopyContents() {
  const project = stubProject('contents');
  fs.mkdirSync(path.join(project, '.git'));
  fs.writeFileSync(path.join(project, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  fs.mkdirSync(path.join(project, 'vendor'));
  fs.writeFileSync(path.join(project, 'vendor', 'library.js'), '// provisioned\n');
  const folder = path.join(project, 'evals', 'stub');
  fs.cpSync(PREFLIGHT_FIXTURE, folder, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  fs.mkdirSync(path.join(folder, 'runs', 'earlier-run'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'runs', 'earlier-run', 'marker.json'), '{}\n');
  editJson(folder, 'evaluation.json', (value) => {
    value.launch.root = '../..';
    value.workspace.provision = ['vendor'];
  });
  firstLegSays(folder, 'STUB-LIST');
  const result = runPreflight(folder);
  check(result.status === 0, `preflight with the evaluation inside its target exited ${result.status}; expected 0\n${result.output}`);
  const runs = path.join(folder, 'runs');
  const run = fs.readdirSync(runs, { withFileTypes: true }).find((entry) => entry.isDirectory() && entry.name !== 'earlier-run');
  const listed = /list: (.*)/.exec(firstLegStdout(run === undefined ? null : path.join(runs, run.name)))?.[1];
  const entries = listed === undefined ? [] : JSON.parse(listed);
  check(entries.includes('agent.js'), `the leg's working directory is not a copy of the target: ${JSON.stringify(entries)}`);
  check(entries.includes('evals/stub/evaluation.json'), `the copy left out the evaluation folder's own files: ${JSON.stringify(entries)}`);
  check(!entries.some((entry) => entry === '.git' || entry.startsWith('.git/')), `the copy holds .git: ${JSON.stringify(entries)}`);
  check(
    !entries.some((entry) => entry.startsWith('evals/stub/runs')),
    `the copy holds the evaluation's own runs/: ${JSON.stringify(entries)}`,
  );
  check(entries.includes('vendor@'), `the provisioned directory is not a symbolic link in the copy: ${JSON.stringify(entries)}`);
}

/**
 * A symbolic link in the target is contained: a relative skill root link and
 * a link a leg writes through stay in the copy, and a link out of the root is
 * refused.
 */
function checkLinks() {
  const linkedSkill = stubProject('link-skill');
  fs.mkdirSync(path.join(linkedSkill, 'skills'));
  fs.renameSync(path.join(linkedSkill, 'skill'), path.join(linkedSkill, 'skills', 'stub'));
  fs.symlinkSync(path.join('skills', 'stub'), path.join(linkedSkill, 'skill'), 'dir');
  const skillFolder = copyFixture(PREFLIGHT_FIXTURE, linkedSkill);
  const skillResult = runPreflight(skillFolder);
  check(
    skillResult.status === 0,
    `preflight whose skill root is a relative link inside the target exited ${skillResult.status}; expected 0\n${skillResult.output}`,
  );
  check(firstLegStdout(runDirectoryOf(skillFolder)).includes('skill: stub-skill'), 'the linked skill root did not reach the agent');

  for (const [name, spell] of [
    ['a relative', () => path.join('data', 'victim.txt')],
    ['an absolute', (project) => path.join(project, 'data', 'victim.txt')],
  ]) {
    const project = stubProject(`link-${name.split(' ')[1]}`);
    fs.mkdirSync(path.join(project, 'data'));
    fs.writeFileSync(path.join(project, 'data', 'victim.txt'), 'original\n');
    fs.symlinkSync(spell(project), path.join(project, 'stub-wrote.txt'));
    const folder = copyFixture(PREFLIGHT_FIXTURE, project);
    firstLegSays(folder, 'STUB-WRITE');
    const result = runPreflight(folder);
    check(result.status === 0, `preflight writing through ${name} link exited ${result.status}; expected 0\n${result.output}`);
    check(
      fs.readFileSync(path.join(project, 'data', 'victim.txt'), 'utf8') === 'original\n',
      `a leg wrote through ${name} link into the target's data/victim.txt`,
    );
  }

  // A `..` after a link climbs from the link's target: x reads a/c, never the root's own c.
  const climbing = stubProject('link-climb');
  fs.mkdirSync(path.join(climbing, 'a', 'b'), { recursive: true });
  fs.writeFileSync(path.join(climbing, 'a', 'c'), 'A-C\n');
  fs.writeFileSync(path.join(climbing, 'c'), 'ROOT-C\n');
  fs.symlinkSync(path.join('a', 'b'), path.join(climbing, 'sub'), 'dir');
  fs.symlinkSync(['sub', '..', 'c'].join(path.sep), path.join(climbing, 'x'));
  const climbingFolder = copyFixture(PREFLIGHT_FIXTURE, climbing);
  firstLegSays(climbingFolder, 'STUB-READ x');
  const climbed = runPreflight(climbingFolder);
  check(climbed.status === 0, `preflight over a link climbing past a link exited ${climbed.status}; expected 0\n${climbed.output}`);
  const readBack = /read: (.*)/.exec(firstLegStdout(runDirectoryOf(climbingFolder)))?.[1];
  check(readBack === 'A-C', `a link through sub/../c read ${JSON.stringify(readBack)} in the copy; the target itself reads "A-C"`);

  // A link that leaves the root only once the system climbs past another link.
  const tricked = stubProject('link-trick');
  fs.mkdirSync(path.join(path.dirname(tricked), 'out'));
  fs.writeFileSync(path.join(path.dirname(tricked), 'out', 'victim.txt'), 'outside\n');
  fs.mkdirSync(path.join(tricked, 'case'));
  fs.symlinkSync('..', path.join(tricked, 'case', 'selfroot'), 'dir');
  fs.symlinkSync(['selfroot', '..', 'out', 'victim.txt'].join(path.sep), path.join(tricked, 'case', 'trick'));
  const trickedFolder = copyFixture(PREFLIGHT_FIXTURE, tricked);
  const trick = runPreflight(trickedFolder);
  check(
    trick.status === 12,
    `preflight over a link that climbs out past another link exited ${trick.status}; expected 12\n${trick.output}`,
  );
  check(trick.stdout.includes('case/trick'), `the refusal does not name the climbing link:\n${trick.output}`);

  const escaping = stubProject('link-out');
  fs.writeFileSync(path.join(path.dirname(escaping), 'outside.txt'), 'outside\n');
  fs.symlinkSync(path.join('..', 'outside.txt'), path.join(escaping, 'escape'));
  const escapingFolder = copyFixture(PREFLIGHT_FIXTURE, escaping);
  const temp = privateTemp('link-out-temp');
  const escaped = runPreflight(escapingFolder, { env: temp.env });
  check(escaped.status === 12, `preflight over a link out of launch.root exited ${escaped.status}; expected 12\n${escaped.output}`);
  check(escaped.stdout.includes('escape'), `the refusal does not name the link:\n${escaped.output}`);
  check(runDirectoryOf(escapingFolder) === null, 'a target with a link out of launch.root still started a run');
  check(fs.readdirSync(temp.directory).length === 0, 'the refused copy was left in the temp directory');
}

/** A copy the command cannot make is refused with exit 12 and leaves no temp copy behind. */
function checkCopyRefusals() {
  const project = stubProject('tmp-inside');
  fs.mkdirSync(path.join(project, 'tmp'));
  const folder = copyFixture(PREFLIGHT_FIXTURE, project);
  const inside = path.join(project, 'tmp');
  const result = runPreflight(folder, { env: { TMPDIR: inside, TMP: inside, TEMP: inside } });
  check(
    result.status === 12,
    `preflight whose temp directory is inside launch.root exited ${result.status}; expected 12\n${result.output}`,
  );
  check(result.stdout.includes('TMPDIR'), `the refusal does not say how to fix it:\n${result.output}`);
  check(fs.readdirSync(inside).length === 0, `a temp copy was left inside launch.root: ${fs.readdirSync(inside)}`);

  if (process.platform === 'win32') return;
  const fifoProject = stubProject('fifo');
  const made = spawnSync('mkfifo', [path.join(fifoProject, 'pipe')]);
  check(made.status === 0, `mkfifo failed: ${made.stderr}`);
  const fifoFolder = copyFixture(PREFLIGHT_FIXTURE, fifoProject);
  const temp = privateTemp('fifo-temp');
  const fifo = runPreflight(fifoFolder, { env: temp.env });
  check(fifo.status === 12, `preflight over a target holding a FIFO exited ${fifo.status}; expected 12\n${fifo.output}`);
  check(fifo.stdout.includes('pipe') && fifo.stdout.includes('FIFO'), `the FIFO refusal does not name the entry:\n${fifo.output}`);
  check(fs.readdirSync(temp.directory).length === 0, 'the partial copy of a target holding a FIFO was left in the temp directory');
}

/**
 * An interrupted preflight removes its copy and leaves no process behind, and
 * ends by the signal it received: `SIGTERM` to the command alone, and
 * `SIGQUIT` to its whole process group, as a terminal's Ctrl-\\ sends it.
 */
async function checkInterrupted() {
  const cases = [['SIGTERM', false]];
  if (process.platform !== 'win32') cases.push(['SIGQUIT', true]);
  for (const [signal, toGroup] of cases) {
    const project = stubProject(`interrupt-${signal}`);
    const folder = copyFixture(PREFLIGHT_FIXTURE, project);
    const pidFile = path.join(tempDir(`interrupt-pid-${signal}`), 'pid');
    firstLegSays(folder, `STUB-ORPHAN ${pidFile} STUB-SLEEP 25000`);
    const temp = privateTemp(`interrupt-temp-${signal}`);
    const child = spawn(process.execPath, [EVALUATE, 'preflight', '--evaluation', folder], {
      cwd: PROJECT_ROOT,
      env: { ...BASE_ENV, PATH: runnerPath(), ...temp.env },
      stdio: 'ignore',
      detached: toGroup,
    });
    const orphan = await pidFrom(pidFile);
    check(orphan !== null, `the leg interrupted by ${signal} never started`);
    if (toGroup) process.kill(-child.pid, signal);
    else child.kill(signal);
    const closed = await ended(child);
    check(closed.signal === signal, `the preflight interrupted by ${signal} ended by ${closed.signal ?? `exit ${closed.code}`}`);
    check(
      fs.readdirSync(temp.directory).length === 0,
      `the preflight interrupted by ${signal} left its copy: ${fs.readdirSync(temp.directory)}`,
    );
    if (orphan !== null) {
      check(await processEnds(orphan), `a process the leg interrupted by ${signal} started (pid ${orphan}) outlived the preflight`);
      reap(orphan);
    }
  }
}

/** `--evaluation` through a symbolic link resolves `launch.root` against the folder's real location. */
function checkLinkedEvaluation() {
  const base = tempDir('linked');
  const real = path.join(base, 'real');
  const decoy = path.join(base, 'decoy');
  fs.cpSync(STUB_PROJECT, path.join(real, 'project'), { recursive: true });
  fs.cpSync(STUB_PROJECT, path.join(decoy, 'project'), { recursive: true });
  const decoySkill = path.join(decoy, 'project', 'skill', 'SKILL.md');
  fs.writeFileSync(decoySkill, fs.readFileSync(decoySkill, 'utf8').replace(/^name:.*$/m, 'name: decoy-skill'));
  const folder = path.join(real, 'evaluation');
  fs.cpSync(PREFLIGHT_FIXTURE, folder, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  editJson(folder, 'evaluation.json', (value) => (value.launch.root = '../project'));
  const link = path.join(decoy, 'evaluation');
  fs.symlinkSync(folder, link, 'dir');
  const result = runPreflight(link);
  check(result.status === 0, `preflight through a linked evaluation folder exited ${result.status}; expected 0\n${result.output}`);
  const stdout = firstLegStdout(runDirectoryOf(folder));
  check(
    stdout.includes('skill: stub-skill'),
    `preflight through a link ran the target beside the link: ${JSON.stringify(stdout.split('\n')[0])}`,
  );
}

/** A `runPreflight` failure falls through to the CLI only when it refused the plan before any leg. */
function checkPlanningFallthrough() {
  const structural = copyFixture();
  const refused = runPreflight(structural, {
    node: ['--require', WRAP_ENGINE],
    env: { TEA_EVALUATE_WRAP_RUNPREFLIGHT: 'structural-before-legs' },
  });
  const refusedRun = runDirectoryOf(structural);
  const refusedCall = refusedRun === null ? null : path.join(refusedRun, 'engine', 'preflight.json');
  check(
    refusedCall !== null && fs.existsSync(refusedCall),
    `a plan refused before any leg did not reach the CLI's preflight (exit ${refused.status})\n${refused.output}`,
  );
  check(
    refusedCall !== null && fs.existsSync(refusedCall) && readJson(refusedCall).exitCode === refused.status,
    `a plan refused before any leg exited ${refused.status}, not the CLI's own exit\n${refused.output}`,
  );

  const midway = copyFixture();
  const stopped = runPreflight(midway, {
    node: ['--require', WRAP_ENGINE],
    env: { TEA_EVALUATE_WRAP_RUNPREFLIGHT: 'error-after-one-leg' },
  });
  check(stopped.status === 12, `legs that stopped after one exited ${stopped.status}; expected 12\n${stopped.output}`);
  const stoppedRun = runDirectoryOf(midway);
  check(
    stoppedRun !== null && !fs.existsSync(path.join(stoppedRun, 'engine', 'preflight.json')),
    'legs that stopped after one still asked the CLI for a verdict',
  );
  check(
    stoppedRun !== null && filesUnder(path.join(stoppedRun, 'observations')).length === 1,
    'the wrapped engine did not run exactly one leg before failing',
  );
}

function checkInterfaceDenialAndRefusals() {
  const renamed = copyFixture();
  editJson(renamed, 'evaluation.json', (value) => (value.registry[0].interfaceId = 'other-skill'));
  const denied = runPreflight(renamed);
  check(denied.status === 10, `preflight with the stub's interface unregistered exited ${denied.status}; expected 10\n${denied.output}`);

  const mcp = copyFixture();
  editJson(mcp, 'evaluation.json', (value) => (value.interface = 'mcp'));
  const mcpResult = runPreflight(mcp);
  check(mcpResult.status === 12, `preflight over an mcp evaluation exited ${mcpResult.status}; expected 12\n${mcpResult.output}`);

  const crashed = copyFixture();
  const log = path.join(tempDir('shim-crash'), 'argv.log');
  const crashResult = runPreflight(crashed, {
    env: { [ENGINE_CLI_ENV]: SHIM, TEA_EVALUATE_SHIM_LOG: log, TEA_EVALUATE_SHIM_EXIT_COMPILE: '1' },
  });
  check(
    crashResult.status === 12,
    `preflight whose compile exits an undocumented 1 exited ${crashResult.status}; expected 12\n${crashResult.output}`,
  );
  check(crashResult.output.includes('substitutes'), `the engine substitution was not announced:\n${crashResult.output}`);
}

/** The `skill-root` and `skill-runner` check rules, over the preflight fixture's tea-skill-runner entry. */
function checkRunnerRules() {
  const cases = [
    ['a leg handing the runner another skill root', 'skill-root', (folder) => addRunnerOption(folder, 'skill-root', 'other-skill')],
    [
      'a skill root inside a provisioned directory',
      'skill-root',
      (folder) => editJson(folder, 'evaluation.json', (value) => (value.workspace.provision = ['skill'])),
    ],
    [
      'a runner entry missing an infrastructure code',
      'skill-runner',
      (folder) => editJson(folder, 'evaluation.json', (value) => (value.registry[0].infrastructureExitCodes = [3, 4, 5])),
    ],
    [
      'a runner leg with no --timeout-ms',
      'skill-runner',
      (folder) =>
        editJson(folder, 'contract.json', (contract) => {
          const operation = contract.permittedInterfaces[0].operations[0];
          for (const leg of operation.sensitivityWitness.legs) delete leg.inputs.option['timeout-ms'];
        }),
    ],
    ['a runner --timeout-ms at the entry ceiling', 'skill-runner', (folder) => addRunnerOption(folder, 'timeout-ms', '60000')],
    [
      'a plan step alone handing the runner another skill root',
      'skill-root',
      (folder) =>
        editJson(
          folder,
          'contract.json',
          (contract) => (contract.interactionPlan[0].inputBinding.option['skill-root'] = { literal: 'other-skill' }),
        ),
    ],
    [
      'a plan step alone with no --timeout-ms',
      'skill-runner',
      (folder) => editJson(folder, 'contract.json', (contract) => delete contract.interactionPlan[0].inputBinding.option['timeout-ms']),
    ],
  ];
  for (const [name, rule, plant] of cases) {
    const folder = copyFixture();
    plant(folder);
    const result = runEvaluate(['check', '--evaluation', folder]);
    check(result.status === 10, `check with ${name} exited ${result.status}; expected 10\n${result.output}`);
    check(result.stdout.includes(`[${rule}]`), `check with ${name} reported no ${rule} finding:\n${result.output}`);
  }
}

async function main() {
  try {
    checkRunner();
    await checkRunnerProcesses();
    await checkSupervision();
    checkPasses();
    checkRemovedEntry();
    checkShim();
    checkFailingControl();
    checkRefusals();
    checkEnvironmentValuesStayOut();
    checkCopyAndRunsIgnore();
    checkCopyContents();
    checkLinks();
    checkCopyRefusals();
    await checkInterrupted();
    checkLinkedEvaluation();
    checkPlanningFallthrough();
    checkInterfaceDenialAndRefusals();
    checkRunnerRules();
  } finally {
    for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} tea-evaluate preflight check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} tea-evaluate preflight check(s) passed`);
  return 0;
}

// A case awaiting an event that already fired leaves nothing pending, and
// Node would exit 0 with no verdict printed.
let finished = false;
process.on('exit', () => {
  if (finished) return;
  console.error(`${colors.red}the preflight checks stopped before finishing; a case awaited an event that never came${colors.reset}`);
  process.exitCode = 1;
});

main().then(
  (code) => {
    finished = true;
    process.exitCode = code;
  },
  (error) => {
    finished = true;
    console.error(error);
    process.exitCode = 1;
  },
);
