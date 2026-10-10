#!/usr/bin/env node
/** tea-framework drives the packaged framework and CI skill with durable run evidence. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Command } = require('commander');
const { resolveModel } = require('./lib/agent-adapters');
const { agentOptions } = require('./lib/workflow-cli');
const { resolveTeaConfig } = require('./lib/resolve-tea-config');
const { addAgentOptions, resolveWorkflowSkill, runWithEvidence } = require('./lib/workflow-cli');
const { SKILL_NAME, SCOPES, OPERATIONS, projectPath, prepareSetup, setupPrompt, inspectCompletion } = require('./lib/framework-setup');

function collect(value, previous) {
  return [...previous, value];
}

function resultReport(result) {
  return [
    '# Framework and CI setup result',
    '',
    `Operation: ${result.operation}. Scope: ${result.scope}.`,
    `Completed: ${result.completed ? 'yes' : 'no'}.`,
    `Agent: ${result.agent}. Model: ${result.model ?? 'unspecified'}.`,
    '',
    '## Completion evidence',
    '',
    ...result.artifacts.map((file) => `- ${file}`),
    '',
    ...(result.issues.length > 0 ? ['## Unresolved work', '', ...result.issues.map((issue) => `- ${issue}`), ''] : []),
    `Retained agent evidence: ${result.runDirectory}.`,
    '',
    'Create completion verifies the skill journal and referenced outputs, then reruns the frozen test commands. Native verification logs and agent transcripts are retained. Validate findings remain report outcomes.',
    '',
  ].join('\n');
}

function main(argv = process.argv) {
  const program = new Command();
  program
    .name('tea-framework')
    .description('Create, resume, validate or edit test framework and CI setup using the packaged TEA skill.')
    .option('--project-root <dir>', 'project whose framework and CI are being set up', process.cwd())
    .option('--scope <scope>', `requested phases (${SCOPES.join('|')})`, 'framework')
    .option('--operation <operation>', `requested operation (${OPERATIONS.join('|')})`, 'create')
    .option('--input <path>', 'exact project artifact to edit or validate (repeatable)', collect, [])
    .option('--instructions <path>', 'project file containing the setup request or requested edit')
    .option('--skill-root <dir>', 'explicit skill copy; defaults to the packaged framework skill')
    .option('--output <dir>', 'project directory for retained CLI reports and agent evidence')
    .option('--json <path>', 'additional project-relative machine-readable result path')
    .option('--use-playwright-utils', 'enable Playwright utilities when applicable')
    .option('--no-use-playwright-utils', 'disable Playwright utilities')
    .option('--use-pactjs-utils', 'enable Pact utilities when applicable')
    .option('--no-use-pactjs-utils', 'disable Pact utilities')
    .exitOverride()
    .configureOutput({ writeErr: () => {} });
  addAgentOptions(program);
  program.options.find((option) => option.long === '--retries').default('0');
  try {
    program.parse(argv);
  } catch (error) {
    if (error.exitCode === 0) return 0;
    process.stderr.write(`tea-framework: ${error.message}\n`);
    return 2;
  }
  const options = program.opts();
  let request;
  let jsonPath;
  try {
    const projectRoot = fs.realpathSync(path.resolve(options.projectRoot));
    agentOptions(options, projectRoot);
    if (!fs.statSync(projectRoot).isDirectory()) throw new Error('--project-root must be a directory');
    const skillRoot = resolveWorkflowSkill({ projectRoot, skillName: SKILL_NAME, skillRoot: options.skillRoot });
    const config = resolveTeaConfig({ projectRoot, skillRoot, skillName: SKILL_NAME, flags: options });
    request = prepareSetup({ projectRoot, skillRoot, config, options });
    const evidenceRoot = projectPath(projectRoot, options.output ?? path.join(request.artifactsRoot, 'framework', 'cli-runs'));
    jsonPath = options.json ? projectPath(projectRoot, options.json) : null;
    if (
      jsonPath &&
      (path.extname(jsonPath) !== '.json' ||
        jsonPath === request.journalPath ||
        request.inputs.includes(jsonPath) ||
        jsonPath === request.instructionsPath)
    ) {
      throw new Error('--json must name a .json result file separate from setup inputs and journal');
    }
    if (options.agent === 'none') {
      process.stdout.write(`${setupPrompt(request)}\n`);
      return 0;
    }
    const execution = runWithEvidence({
      name: 'tea-framework',
      projectRoot,
      evidenceRoot,
      options,
      capabilities: ['command-execution'],
      prepare: ({ attempt }) => ({ prompt: setupPrompt(request, { retry: attempt > 1 }), request }),
      validate: ({ attemptDir }) => inspectCompletion(request, { evidenceDir: attemptDir, timeoutMs: Number(options.timeoutMs) }),
    });
    const outcome = execution.value;
    const result = {
      schema_version: '0.1.0',
      completed: outcome.completed,
      scope: request.scope,
      operation: request.savedOperation,
      agent: options.agent,
      model: resolveModel(options.agent, options.model, options.agentArg),
      runDirectory: execution.runDir,
      journal: request.journalPath,
      artifacts: outcome.artifacts,
      issues: outcome.issues,
      verification: outcome.executions,
    };
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    fs.writeFileSync(path.join(execution.runDir, 'result.json'), serialized);
    fs.writeFileSync(path.join(execution.runDir, 'report.md'), resultReport(result));
    if (jsonPath) {
      fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
      fs.writeFileSync(jsonPath, serialized);
    }
    process.stdout.write(serialized);
    return result.completed ? 0 : 1;
  } catch (error) {
    if (error.runDir) {
      const failureResult = {
        schema_version: '0.1.0',
        completed: false,
        scope: request?.scope ?? options.scope,
        operation: request?.savedOperation ?? options.operation,
        agent: options.agent,
        model: null,
        runDirectory: error.runDir,
        journal: request?.journalPath ?? null,
        artifacts: [],
        issues: [error.message],
        failureClass: error.failureClass,
      };
      const serialized = `${JSON.stringify(failureResult, null, 2)}\n`;
      fs.writeFileSync(path.join(error.runDir, 'result.json'), serialized);
      fs.writeFileSync(path.join(error.runDir, 'report.md'), resultReport(failureResult));
      if (jsonPath) {
        fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
        fs.writeFileSync(jsonPath, serialized);
      }
      process.stdout.write(serialized);
    }
    process.stderr.write(`tea-framework: ${error.message}${error.runDir ? `\nRetained evidence: ${error.runDir}` : ''}\n`);
    return ['environment-transport', 'environment-timeout', 'environment-parser'].includes(error.failureClass) ? 3 : 2;
  }
}

if (require.main === module) process.exitCode = main();
module.exports = { main, resultReport };
