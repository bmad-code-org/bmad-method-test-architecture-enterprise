'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { buildMinimalEnv } = require('../cli/lib/run-agent');

if (process.platform !== 'win32') {
  console.log('Windows guardian probe skipped outside Windows');
  process.exit(0);
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-windows-guardian-probe-'));
const traceFile = path.join(directory, 'trace.log');
const agentFile = path.join(directory, 'agent.cjs');
const supervisorFile = path.join(__dirname, '..', 'cli', 'lib', 'agent-supervisor.js');
const helperFile = path.join(__dirname, '..', 'cli', 'lib', 'windows-job-owner.ps1');
const minimalEnv = buildMinimalEnv(['TEA_WINDOWS_JOB_TRACE'], { ...process.env, TEA_WINDOWS_JOB_TRACE: traceFile }, [], 'win32');
const typeDefinition = /Add-Type -TypeDefinition @'\r?\n([\s\S]*?)\r?\n'@/.exec(fs.readFileSync(helperFile, 'utf8'))?.[1];
if (!typeDefinition) throw new Error('could not isolate the Windows Job Object helper Add-Type definition');
const addTypeFile = path.join(directory, 'add-type.ps1');
fs.writeFileSync(
  addTypeFile,
  `$ErrorActionPreference = 'Stop'
Write-Output "runtime ps=$($PSVersionTable.PSVersion) edition=$($PSVersionTable.PSEdition) clr=$([Environment]::Version)"
$started = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Write-Output 'add-type-start'
Add-Type -TypeDefinition @'
${typeDefinition}
'@
Write-Output "add-type-done elapsed-ms=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $started)"
`,
);
fs.writeFileSync(agentFile, "process.stdout.write('probe agent answered\\n');\n");

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const measureAddType = () =>
  new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', addTypeFile],
      {
        env: minimalEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    let stdout = '';
    let stderr = '';
    let exit = null;
    let settled = false;
    let error = null;
    let timer;
    let drainTimer;
    const finishMeasure = (timedOut) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(drainTimer);
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve({
        elapsedMs: Date.now() - startedAt,
        status: exit?.code ?? null,
        signal: exit?.signal ?? null,
        timedOut,
        error,
        stdout,
        stderr,
      });
    };
    child.stdout?.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr?.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.once('error', (spawnError) => {
      error = spawnError.message;
      finishMeasure(false);
    });
    child.once('exit', (code, signal) => {
      exit = { code, signal };
      drainTimer = setTimeout(() => finishMeasure(false), 1000);
    });
    child.once('close', () => finishMeasure(false));
    timer = setTimeout(() => {
      child.kill('SIGKILL');
      finishMeasure(true);
    }, 120_000);
  });

const finish = async () => {
  const addTypeResult = await measureAddType();
  const guardian = spawn(process.execPath, [supervisorFile, '--agent-guardian', process.execPath, agentFile], {
    stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
    env: minimalEnv,
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
  let timer;
  const ending = await Promise.race([
    closed,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), 110_000);
    }),
  ]);
  clearTimeout(timer);
  if (ending === null) guardian.kill('SIGKILL');
  guardian.stdio[4].end();
  await pause(200);

  const trace = fs.existsSync(traceFile) ? fs.readFileSync(traceFile, 'utf8') : '(trace file absent)';
  const pwsh = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
    env: minimalEnv,
    encoding: 'utf8',
    timeout: 15_000,
  });
  const pwshResult = { status: pwsh.status, error: pwsh.error?.message, stdout: pwsh.stdout, stderr: pwsh.stderr };
  let outcome = null;
  try {
    outcome = JSON.parse(report);
  } catch {
    // The raw FD3 report is printed below.
  }
  const agentPid = Number(agentPidText.trim());
  const succeeded =
    addTypeResult.status === 0 &&
    ending?.code === 0 &&
    outcome?.status === 0 &&
    stdout.includes('probe agent answered') &&
    Number.isSafeInteger(agentPid) &&
    agentPid > 0 &&
    trace.includes('helper-guardian-assigned') &&
    trace.includes('guardian-helper-ready');
  fs.writeSync(
    2,
    `Windows guardian startup probe: ${succeeded ? 'passed' : 'failed'}\nIsolated Add-Type under minimal env: ${JSON.stringify(addTypeResult)}\npwsh.exe availability: ${JSON.stringify(pwshResult)}\nGuardian exit: ${JSON.stringify(exit)}; close: ${JSON.stringify(ending)}\nFD3 report: ${report || '(empty)'}\nFD5 agent PID: ${agentPidText || '(empty)'}\nGuardian stdout: ${stdout || '(empty)'}\nGuardian stderr: ${stderr || '(empty)'}\nTrace:\n${trace}\n`,
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
