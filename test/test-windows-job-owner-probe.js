'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildMinimalEnv } = require('../cli/lib/run-agent');

if (process.platform !== 'win32') {
  console.log('Windows guardian probe skipped outside Windows');
  process.exit(0);
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-windows-guardian-probe-'));
const traceFile = path.join(directory, 'trace.log');
const agentFile = path.join(directory, 'agent.cjs');
const supervisorFile = path.join(__dirname, '..', 'cli', 'lib', 'agent-supervisor.js');
fs.writeFileSync(agentFile, "process.stdout.write('probe agent answered\\n');\n");

const guardian = spawn(process.execPath, [supervisorFile, '--agent-guardian', process.execPath, agentFile], {
  stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
  env: buildMinimalEnv(['TEA_WINDOWS_JOB_TRACE'], { ...process.env, TEA_WINDOWS_JOB_TRACE: traceFile }, [], 'win32'),
  windowsHide: true,
});
let stdout = '';
let stderr = '';
let report = '';
let agentPidText = '';
let exit = null;
guardian.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
guardian.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
guardian.stdio[3].setEncoding('utf8').on('data', (chunk) => (report += chunk));
guardian.stdio[5].setEncoding('utf8').on('data', (chunk) => (agentPidText += chunk));
guardian.stdio[4].on('error', () => {});
guardian.once('exit', (code, signal) => (exit = { code, signal }));
guardian.stdin.end();

const closed = new Promise((resolve) => guardian.once('close', (code, signal) => resolve({ code, signal })));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const finish = async () => {
  let timer;
  const ending = await Promise.race([
    closed,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), 25_000);
    }),
  ]);
  clearTimeout(timer);
  if (ending === null) guardian.kill('SIGKILL');
  guardian.stdio[4].end();
  await pause(200);

  const trace = fs.existsSync(traceFile) ? fs.readFileSync(traceFile, 'utf8') : '(trace file absent)';
  let outcome = null;
  try {
    outcome = JSON.parse(report);
  } catch {
    // The raw FD3 report is printed below.
  }
  const agentPid = Number(agentPidText.trim());
  const succeeded =
    ending?.code === 0 &&
    outcome?.status === 0 &&
    stdout.includes('probe agent answered') &&
    Number.isSafeInteger(agentPid) &&
    agentPid > 0 &&
    trace.includes('helper-guardian-assigned') &&
    trace.includes('guardian-helper-ready');
  fs.writeSync(
    2,
    `Windows guardian startup probe: ${succeeded ? 'passed' : 'failed'}\nGuardian exit: ${JSON.stringify(exit)}; close: ${JSON.stringify(ending)}\nFD3 report: ${report || '(empty)'}\nFD5 agent PID: ${agentPidText || '(empty)'}\nGuardian stdout: ${stdout || '(empty)'}\nGuardian stderr: ${stderr || '(empty)'}\nTrace:\n${trace}\n`,
  );
  if (!succeeded) process.exitCode = 1;

  const helperPid = Number(/node \d+ guardian-helper-spawned pid=(\d+)/.exec(trace)?.[1]);
  for (const pid of [helperPid, agentPid]) {
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) continue;
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // The process already ended.
    }
  }
  await Promise.race([closed, pause(2000)]);
  fs.rmSync(directory, { recursive: true, force: true });
};

finish().catch((error) => {
  fs.writeSync(2, `Windows guardian startup probe threw: ${error.stack}\n`);
  process.exitCode = 1;
});
