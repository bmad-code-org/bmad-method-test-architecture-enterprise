'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

if (process.platform !== 'win32') {
  console.log('Windows runner probe skipped outside Windows');
  process.exit(0);
}

const root = path.join(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-windows-runner-probe-'));
const traceFile = path.join(directory, 'trace.log');
const pidFile = path.join(directory, 'agent.pid');
const agentFile = path.join(directory, 'agent.cjs');
fs.writeFileSync(
  agentFile,
  `require('node:fs').writeFileSync(process.argv[2], String(process.pid));
process.stdout.write('probe agent answered\\n');
`,
);

async function probe() {
  const runner = spawn(
    process.execPath,
    [
      path.join(root, 'cli', 'skill-runner.js'),
      '--skill-root',
      'test/fixtures/evaluate/stub-agent/skill',
      '--agent',
      'custom',
      '--agent-cmd',
      process.execPath,
      '--agent-arg',
      agentFile,
      '--agent-arg',
      pidFile,
      '--env-pass',
      'TEA_WINDOWS_JOB_TRACE',
      '--timeout-ms',
      '10000',
    ],
    { cwd: root, env: { ...process.env, TEA_WINDOWS_JOB_TRACE: traceFile }, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let stdout = '';
  let stderr = '';
  runner.stdout.on('data', (chunk) => (stdout += chunk));
  runner.stderr.on('data', (chunk) => (stderr += chunk));
  runner.stdin.end('Say alpha.');
  let timer;
  const result = await Promise.race([
    new Promise((resolve) => runner.once('close', (code, signal) => resolve({ code, signal }))),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), 120_000);
    }),
  ]);
  clearTimeout(timer);
  const trace = fs.existsSync(traceFile) ? fs.readFileSync(traceFile, 'utf8') : '';
  const agentPid = fs.existsSync(pidFile) ? Number(fs.readFileSync(pidFile, 'utf8')) : null;
  fs.writeSync(2, `[Windows runner probe] ${JSON.stringify({ result, agentPid, stdout, stderr })}\n${trace}`);
  const failed =
    result?.code !== 0 ||
    !stdout.includes('probe agent answered') ||
    !trace.includes('guardian-agent-pid-write-end') ||
    !trace.includes('leader-agent-ready') ||
    !trace.includes('supervisor-agent-ready') ||
    !trace.includes('guardian-report-written');
  if (failed) {
    if (result === null && Number.isSafeInteger(runner.pid) && runner.pid > 0 && runner.exitCode === null) {
      const systemRoot = process.env.SystemRoot;
      if (systemRoot && path.isAbsolute(systemRoot)) {
        const taskkill = path.join(systemRoot, 'System32', 'taskkill.exe');
        const cleanup = spawnSync(taskkill, ['/PID', String(runner.pid), '/T', '/F'], { encoding: 'utf8', timeout: 10_000 });
        fs.writeSync(
          2,
          `[Windows runner probe] tree cleanup: ${JSON.stringify({ status: cleanup.status, error: cleanup.error?.message })}\n`,
        );
      }
      runner.kill('SIGKILL');
    }
    if (Number.isSafeInteger(agentPid) && agentPid > 0) {
      try {
        process.kill(agentPid, 'SIGKILL');
      } catch {
        // The job already ended the agent.
      }
    }
    throw new Error('the complete Windows runner did not report its agent and exit');
  }
  console.log('Windows runner probe passed');
}

probe().catch((error) => {
  fs.writeSync(2, `${error.stack ?? error}\n`);
  process.exitCode = 1;
});
