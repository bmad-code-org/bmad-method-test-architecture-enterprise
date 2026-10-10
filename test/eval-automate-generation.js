/** Execute an untouched live-generated voucher suite against fixed and mutated HTTP service copies.
 * This scorer does not invoke an agent. Generation provenance belongs to the retained CLI capture.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { createHash } = require('node:crypto');
const { runAgent } = require('../cli/lib/run-agent');
const { Command } = require('commander');
const { resolvePlaywrightCli } = require('../cli/atdd-red-check');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures/automate-eval/voucher-service');
const MUTATION_FROM = 'const meetsMinimumSpend = cartTotal >= voucher.minimumSpend;';
const MUTATION_TO = 'const meetsMinimumSpend = cartTotal > voucher.minimumSpend;';
const SOURCE_FILES = ['src/server.js', 'src/vouchers.js', 'package.json', 'playwright.config.ts'];
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function leaves(report) {
  const results = [];
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? [])
        results.push({
          title: spec.title,
          project: test.projectName,
          attempts: (test.results ?? []).map((attempt) => ({
            status: attempt.status,
            errors: (attempt.errors ?? []).map((error) => error.message ?? ''),
          })),
        });
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return results;
}

async function scoreGeneratedProject(projectRoot, outputRoot) {
  const project = fs.realpathSync(projectRoot);
  const output = path.resolve(outputRoot);
  fs.mkdirSync(output, { recursive: true });
  for (const file of SOURCE_FILES) {
    if (digest(path.join(project, file)) !== digest(path.join(FIXTURE, file)))
      throw new Error(`generated project changed protected fixture source: ${file}`);
  }
  if (!fs.statSync(path.join(project, 'tests')).isDirectory()) throw new Error('generated project has no tests directory');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-automate-generation-score-'));
  const runs = {};
  try {
    for (const variant of ['fixed', 'mutated']) {
      const staged = path.join(scratch, variant);
      fs.mkdirSync(staged);
      for (const name of ['src', 'tests', 'package.json', 'playwright.config.ts'])
        fs.cpSync(path.join(project, name), path.join(staged, name), { recursive: true });
      fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(staged, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      if (variant === 'mutated') {
        const source = fs.readFileSync(path.join(staged, 'src/vouchers.js'), 'utf8');
        if (source.split(MUTATION_FROM).length !== 2) throw new Error('minimum-spend mutation anchor must occur exactly once');
        fs.writeFileSync(path.join(staged, 'src/vouchers.js'), source.replace(MUTATION_FROM, MUTATION_TO));
      }
      const sourceBefore = Object.fromEntries(SOURCE_FILES.map((file) => [file, digest(path.join(staged, file))]));
      const reportPath = path.join(output, `${variant}-playwright.json`);
      if (fs.existsSync(reportPath)) throw new Error(`refusing to overwrite existing execution evidence: ${reportPath}`);
      const port = await availablePort();
      const argv = [resolvePlaywrightCli([ROOT]), 'test', '--reporter=json'];
      let command;
      try {
        command = runAgent('', {
          agent: 'custom',
          agentCommand: process.execPath,
          agentArgs: argv,
          cwd: staged,
          timeout: 60_000,
          envPass: Object.keys({
            ...process.env,
            PORT: '',
            VOUCHER_BASE_URL: '',
            CI: '',
            FORCE_COLOR: '',
            PLAYWRIGHT_JSON_OUTPUT_NAME: '',
          }),
          sourceEnv: {
            ...process.env,
            PORT: String(port),
            VOUCHER_BASE_URL: `http://127.0.0.1:${port}`,
            CI: '1',
            FORCE_COLOR: '0',
            PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
          },
        });
        command.status = 0;
      } catch (error) {
        if (error.code !== 'AGENT_FAILED') throw error;
        command = error;
        command.status = Number(error.message.match(/exited with code (\d+)/)?.[1]);
        if (!Number.isSafeInteger(command.status)) throw error;
      }
      fs.writeFileSync(path.join(output, `${variant}-stdout.txt`), command.stdout ?? '');
      fs.writeFileSync(path.join(output, `${variant}-stderr.txt`), command.stderr ?? '');
      if (!fs.existsSync(reportPath)) throw new Error(`${variant} produced no machine-readable report`);
      const sourceAfter = Object.fromEntries(SOURCE_FILES.map((file) => [file, digest(path.join(staged, file))]));
      if (JSON.stringify(sourceBefore) !== JSON.stringify(sourceAfter))
        throw new Error(`${variant} execution modified production/config source`);
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      runs[variant] = {
        exitCode: command.status,
        command: [process.execPath, ...argv],
        environment: { PORT: String(port), VOUCHER_BASE_URL: `http://127.0.0.1:${port}`, CI: '1' },
        errors: report.errors ?? [],
        tests: leaves(report),
        sourceBefore,
        sourceAfter,
      };
    }
    const allPassed =
      runs.fixed.exitCode === 0 &&
      runs.fixed.errors.length === 0 &&
      runs.fixed.tests.length > 0 &&
      runs.fixed.tests.every((test) => test.attempts.length > 0 && test.attempts.every((attempt) => attempt.status === 'passed'));
    const detections = runs.mutated.tests.filter(
      (test) =>
        runs.fixed.tests.some((baseline) => baseline.title === test.title && baseline.project === test.project) &&
        test.attempts.some(
          (attempt) =>
            attempt.status === 'failed' &&
            attempt.errors.some((message) => message.includes('expect(') && message.includes('below-minimum-spend')),
        ),
    );
    const completeMutation =
      runs.mutated.errors.length === 0 &&
      runs.mutated.tests.length === runs.fixed.tests.length &&
      runs.mutated.tests.every(
        (test) => test.attempts.length > 0 && test.attempts.every((attempt) => ['passed', 'failed'].includes(attempt.status)),
      );
    const result = {
      schemaVersion: 1,
      type: 'executed-generated-suite',
      generationWasInvoked: false,
      generatedAt: new Date().toISOString(),
      projectRoot: project,
      mutation: { from: MUTATION_FROM, to: MUTATION_TO },
      protectedSourcePreserved: true,
      allFixedTestsPassed: allPassed,
      mutationExecutionComplete: completeMutation,
      detectedRegression: detections.length > 0,
      detectingTitles: detections.map((test) => test.title),
      runs,
      pass: allPassed && completeMutation && detections.length > 0,
    };
    fs.writeFileSync(path.join(output, 'score.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
    return result;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

async function main() {
  const program = new Command()
    .requiredOption('--project <dir>', 'captured, live-generated voucher fixture project')
    .requiredOption('--output <dir>', 'fresh output directory for execution reports');
  program.parse();
  const options = program.opts();
  const result = await scoreGeneratedProject(options.project, options.output);
  console.log(
    JSON.stringify(
      {
        pass: result.pass,
        fixedTests: result.runs.fixed.tests.length,
        detectedRegression: result.detectedRegression,
        detectingTitles: result.detectingTitles,
      },
      null,
      2,
    ),
  );
  return result.pass ? 0 : 1;
}
if (require.main === module)
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 2;
    });
module.exports = { scoreGeneratedProject, leaves };
