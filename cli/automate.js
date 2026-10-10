#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Command } = require('commander');
const { addAgentOptions, agentOptions, projectPath, resolveWorkflowSkill, headlessPrompt, runWithEvidence } = require('./lib/workflow-cli');
const { artifactPath, parseResult, frontmatter } = require('./lib/automate-result');
const { resolveGenerationConfig, generationRequest } = require('./lib/automate-prompt');

const NAME = 'tea-automate';
const MODES = ['red', 'expand'];
const OPERATIONS = ['create', 'resume', 'validate', 'edit'];

function collect(value, previous) {
  return [...previous, value];
}

function safeTarget(root, value) {
  const realRoot = fs.realpathSync(root);
  const target = fs.realpathSync(path.resolve(realRoot, value));
  const relative = path.relative(realRoot, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error(`target is outside the project: ${value}`);
  return relative.split(path.sep).join('/') || '.';
}

function resultDestination(root, value, protectedFiles) {
  const output = projectPath(root, value, '--json');
  if (path.extname(output) !== '.json') throw new Error('--json must name a .json result separate from inputs');
  const existing = fs.existsSync(output) ? fs.statSync(output, { bigint: true }) : null;
  if (existing && !existing.isFile()) throw new Error('--json must name a regular file');
  const canonical = existing ? fs.realpathSync(output) : output;
  for (const file of protectedFiles.filter(Boolean)) {
    const input = path.resolve(root, file);
    if (!fs.existsSync(input)) continue;
    const stat = fs.statSync(input, { bigint: true });
    if (canonical === fs.realpathSync(input) || (existing && existing.dev === stat.dev && existing.ino === stat.ino))
      throw new Error('--json collides with a protected input or artifact');
  }
  return output;
}

function selectMode(explicit, request, savedMode) {
  if (savedMode) {
    if (explicit && explicit !== savedMode) throw new Error(`checkpoint belongs to ${savedMode} mode; pass --mode ${savedMode}`);
    return { mode: savedMode, selection: 'checkpoint' };
  }
  if (explicit) return { mode: explicit, selection: 'explicit' };
  const red = /\b(?:red mode|ATDD|TDD red|write acceptance tests|acceptance test scaffolds|acceptance tests before implementation)\b/i.test(
    request,
  );
  const expand =
    /\b(?:expand mode|coverage expansion|expand (?:test )?coverage|tests for (?:existing|implemented) code|automation)\b/i.test(request);
  if (red !== expand) return { mode: red ? 'red' : 'expand', selection: 'request' };
  return { mode: 'expand', selection: 'entry-default' };
}

async function main(argv) {
  const program = new Command();
  program
    .name(NAME)
    .description(
      'Generate red acceptance scaffolds or expand coverage with the packaged merged Automate skill, including default run-and-heal.',
    )
    .argument('[request]', 'generation request; otherwise read UTF-8 text from standard input')
    .option('--mode <mode>', 'generation mode (red|expand); infer from request or checkpoint, default expand')
    .option('--operation <operation>', 'workflow operation (create|resume|validate|edit)', 'create')
    .option('--project-root <dir>', 'consuming project directory', process.cwd())
    .option('--story <path>', 'story with acceptance criteria; required for red Create')
    .option('--target <path>', 'target file or directory inside the project (repeatable)', collect, [])
    .option('--checkpoint <path>', 'exact saved artifact for Resume, Validate or Edit')
    .option('--skill-root <dir>', 'explicit canonical Automate skill directory')
    .option('--project-skill', 'use the project-installed canonical skill')
    .option('--evidence-dir <dir>', 'directory for fresh per-attempt prompts, streams and manifests')
    .option('--json <path>', 'write validated result JSON to this file')
    .exitOverride()
    .configureOutput({ writeErr: () => {} });
  addAgentOptions(program);
  program.setOptionValueWithSource('retries', '0', 'default');
  try {
    program.parse(argv);
  } catch (error) {
    if (error.exitCode === 0) return 0;
    process.stderr.write(`${NAME}: ${error.message}\n`);
    return 2;
  }
  const options = program.opts();
  let root;
  let skillRoot;
  let request;
  let story;
  let checkpoint;
  let targets;
  let resolvedConfig;
  let modeSelection;
  let checkpointBefore;
  let protectedFiles;
  try {
    if (options.mode !== undefined && !MODES.includes(options.mode)) throw new Error(`--mode must be ${MODES.join(' or ')}`);
    if (!OPERATIONS.includes(options.operation)) throw new Error(`--operation must be ${OPERATIONS.join(', ')}`);
    root = fs.realpathSync(path.resolve(options.projectRoot));
    agentOptions(options, root);
    if (Number(options.retries) > 0 && options.operation !== 'validate')
      throw new Error('generation operations require --retries 0; resume a retained checkpoint explicitly after interruption');
    if (options.evidenceDir) projectPath(root, options.evidenceDir, '--evidence-dir');
    if (options.json) projectPath(root, options.json, '--json');
    if (!fs.statSync(root).isDirectory()) throw new Error('--project-root must be a directory');
    if (options.skillRoot && options.projectSkill) throw new Error('--skill-root and --project-skill are mutually exclusive');
    if (options.projectSkill) {
      const candidates = ['.claude/skills', '.agents/skills', 'skills', '_bmad/tea/workflows/testarch'];
      options.skillRoot = candidates
        .map((directory) => path.join(root, directory, 'bmad-testarch-automate'))
        .find((candidate) => fs.existsSync(path.join(candidate, 'SKILL.md')));
      if (!options.skillRoot) throw new Error('project-installed bmad-testarch-automate skill is missing');
    }
    skillRoot = resolveWorkflowSkill({ projectRoot: root, skillName: 'bmad-testarch-automate', skillRoot: options.skillRoot });
    if (!fs.existsSync(path.join(skillRoot, '..', 'bmod-tea', 'knowledge', 'tea-index.csv')))
      throw new Error('the selected skill has no sibling bmod-tea knowledge base');
    if (options.story) story = artifactPath(root, options.story, '--story');
    if (options.checkpoint) checkpoint = artifactPath(root, options.checkpoint, '--checkpoint');
    targets = options.target.map((target) => safeTarget(root, target));
    protectedFiles = [story, checkpoint, 'package.json', ...targets.filter((target) => fs.statSync(path.join(root, target)).isFile())];
    if (options.json) resultDestination(root, options.json, protectedFiles);
    if (options.operation !== 'create' && !checkpoint) throw new Error(`--checkpoint is required for ${options.operation}`);
    if (options.operation === 'create' && checkpoint) throw new Error('--checkpoint requires Resume, Validate or Edit');
    let savedMode;
    if (checkpoint) {
      checkpointBefore = frontmatter(path.join(root, checkpoint));
      const saved = checkpointBefore.state;
      if (options.operation === 'resume') {
        if (story && (saved.cli_story === undefined ? !(saved.inputDocuments ?? []).includes(story) : saved.cli_story !== story))
          throw new Error('Resume story differs from its saved scope');
        if (targets.length > 0 && JSON.stringify(saved.cli_targets) !== JSON.stringify(targets))
          throw new Error('Resume targets differ from its saved scope');
      }
      savedMode = saved?.testMode ?? saved?.test_mode;
      if (savedMode && !MODES.includes(savedMode)) throw new Error('checkpoint has an invalid generation mode');
      if (!savedMode) savedMode = /(?:^|\/)atdd(?:\/|$)|(?:^|\/)atdd-checklist-/.test(checkpoint) ? 'red' : 'expand';
    }
    request = program.args[0] ?? (process.stdin.isTTY ? '' : new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(0)));
    const selected = selectMode(options.mode, request, savedMode);
    options.mode = selected.mode;
    modeSelection = selected.selection;
    if (options.mode === 'red' && options.operation === 'create' && !story) throw new Error('--story is required for red Create');
    if (!request.trim() && !story && targets.length === 0 && !checkpoint)
      throw new Error('supply a request, --story, --target or --checkpoint');
    if (options.operation === 'edit' && !request.trim()) throw new Error('Edit requires instructions in the request or standard input');
    resolvedConfig = resolveGenerationConfig(
      root,
      checkpoint ? path.join(root, checkpoint) : undefined,
      options.operation,
      skillRoot,
      options.mode,
    );
  } catch (error) {
    process.stderr.write(`${NAME}: ${error.message}\n`);
    return 2;
  }

  const evidenceRoot = path.resolve(root, options.evidenceDir ?? path.join('_bmad-output', 'test-artifacts', 'automate-cli', randomUUID()));
  const prepare = ({ attemptDir }) => {
    const manifestPath = path.join(attemptDir, 'generation.json');
    const requestId = randomUUID();
    const prompt = headlessPrompt({
      skillRoot,
      projectRoot: root,
      resolvedConfig,
      operation: options.operation,
      requestLines: generationRequest({
        mode: options.mode,
        operation: options.operation,
        request,
        story,
        targets,
        checkpoint,
        manifestPath,
        requestId,
        settings: resolvedConfig.settings,
        modeSelection,
      }),
    });
    return { prompt, manifestPath, requestId, startedAtMs: Date.now() };
  };
  if (options.agent === 'none') {
    process.stdout.write(`${prepare({ attemptDir: path.join(evidenceRoot, 'attempt-1') }).prompt}\n`);
    return 0;
  }
  try {
    const result = await runWithEvidence({
      name: NAME,
      projectRoot: root,
      evidenceRoot,
      options,
      prepare,
      capabilities: ['command-execution'],
      validate: ({ manifestPath, startedAtMs, requestId }) =>
        parseResult({
          manifestPath,
          projectRoot: root,
          mode: options.mode,
          operation: options.operation,
          settings: resolvedConfig.settings,
          startedAtMs,
          requestId,
          story,
          targets,
          selectedCheckpoint: checkpoint,
          checkpointBefore,
        }),
    });
    const payload = { ...result.value, modeSelection, evidenceDir: result.runDir, agent: options.agent };
    const text = `${JSON.stringify(payload, null, 2)}\n`;
    if (options.json) {
      const output = resultDestination(root, options.json, [
        ...protectedFiles,
        payload.summaryPath,
        ...payload.generatedFiles,
        ...payload.executionReports,
        payload.validationReportPath,
      ]);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, text);
    }
    process.stdout.write(text);
    return ['failed', 'could not measure'].includes(payload.executionStatus) || payload.remainingFailures.length > 0 ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${NAME}: ${error.message}\nEvidence: ${evidenceRoot}\n`);
    return 3;
  }
}

if (require.main === module)
  main(process.argv)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${NAME}: ${error.message}\n`);
      process.exitCode = 3;
    });

module.exports = { main, MODES, OPERATIONS, selectMode };
