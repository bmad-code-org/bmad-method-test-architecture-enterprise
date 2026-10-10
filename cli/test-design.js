#!/usr/bin/env node
/** Generate a project test plan through the packaged test-design skill. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const { Command } = require('commander');
const { resolveTeaConfig } = require('./lib/resolve-tea-config');
const { readDesign, RISK_ID_PATTERN } = require('./lib/test-design-parser');
const {
  WorkflowError,
  addAgentOptions,
  readInput,
  projectPath,
  resolveWorkflowSkill,
  headlessPrompt,
  runWithEvidence,
  mainError,
} = require('./lib/workflow-cli');
const collect = (value, previous) => [...previous, value];
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
/** Resolve existing parents so publication checks include symlink aliases. */
function canonicalDestination(file) {
  if (fs.existsSync(file)) return fs.realpathSync(file);
  return path.join(canonicalDestination(path.dirname(file)), path.basename(file));
}
/** Refuse publication onto a supplied input or another deliverable. */
function checkPublication(destinations, inputs) {
  const canonical = destinations.map(canonicalDestination);
  const aliases = (a, b) => {
    if (a === b) return true;
    if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
    const left = fs.statSync(a);
    const right = fs.statSync(b);
    return left.dev === right.dev && left.ino === right.ino;
  };
  if (canonical.some((file) => inputs.some((input) => aliases(file, input))))
    throw new WorkflowError('usage', 'a published artifact aliases an input document; select a separate --output-dir');
  if (canonical.some((file, index) => canonical.slice(0, index).some((other) => aliases(file, other))))
    throw new WorkflowError('usage', 'published artifacts alias each other; select a separate --output-dir');
}
/** Require populated workflow sections and reject unresolved template scaffolding. */
function validateSections(text, sections, label) {
  for (const section of sections) {
    const escaped = section.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const match = text.match(new RegExp(`^#{2,3} .*${escaped}[^\\n]*\\n([\\s\\S]*?)(?=^#{1,3} |$(?![\\s\\S]))`, 'mi'));
    if (!match || !match[1].replaceAll(/<!--[^]*?-->/g, '').trim())
      throw new WorkflowError('environment-parser', `${label} is missing populated section: ${section}`);
  }
  if (/<!--\s*TEA will populate|\{(?:Feature Name|project_name|timestamp|test_design_path)\}/i.test(text))
    throw new WorkflowError('environment-parser', `${label} contains unresolved template placeholders`);
}
/** Read a fresh regular artifact confined to the current attempt. */
function readArtifact(attemptDir, file) {
  const target = projectPath(attemptDir, file, 'generated artifact');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile())
    throw new WorkflowError('environment-parser', `required artifact was not written: ${file}`);
  const text = fs.readFileSync(target, 'utf8');
  if (!text.trim()) throw new WorkflowError('environment-parser', `required artifact is empty: ${file}`);
  return { path: target, text };
}
/** Validate completion, preserved inputs, risk arithmetic and coverage references. */
function validateDesign(context) {
  const { attemptDir, artifactFiles, checkpointFile, runKey, inputDigests, planFile } = context;
  for (const [file, expected] of inputDigests)
    if (digest(file) !== expected) throw new WorkflowError('environment-parser', `the agent changed an input: ${file}`);
  const artifacts = artifactFiles.map((file) => readArtifact(attemptDir, file));
  if (context.runScope === 'system') {
    const architecture = artifacts.find((artifact) => path.basename(artifact.path) === 'test-design-architecture.md');
    const handoff = artifacts.find((artifact) => artifact.path.endsWith('-handoff.md'));
    validateSections(
      architecture.text,
      [
        'Executive Summary',
        'Risk Assessment',
        'NFR Testability Requirements',
        'Testability Concerns and Architectural Gaps',
        'Risk Mitigation Plans',
        'Assumptions and Dependencies',
      ],
      'architecture report',
    );
    validateSections(
      handoff.text,
      [
        'Purpose',
        'TEA Artifacts Inventory',
        'Epic-Level Integration Guidance',
        'Story-Level Integration Guidance',
        'Risk-to-Story Mapping',
        'Recommended BMAD',
        'Phase Transition Quality Gates',
      ],
      'handoff report',
    );
  }
  const checkpoint = readArtifact(attemptDir, checkpointFile);
  const match = checkpoint.text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new WorkflowError('environment-parser', 'the progress checkpoint has no YAML frontmatter');
  const progress = yaml.load(match[1]);
  if (
    progress?.workflowStatus !== 'completed' ||
    progress.runKey !== runKey ||
    progress.runScope !== context.runScope ||
    !Array.isArray(progress.stepsCompleted) ||
    [
      'step-01-detect-mode',
      'step-02-load-context',
      'step-03-risk-and-testability',
      'step-04-coverage-plan',
      'step-05-generate-output',
    ].some((step) => !progress.stepsCompleted.includes(step)) ||
    progress.lastStep !== 'step-05-generate-output' ||
    progress.nextStep !== '' ||
    progress.totalSteps !== 5
  ) {
    throw new WorkflowError('environment-parser', 'the progress checkpoint does not confirm completion of this run');
  }
  const report = artifacts.find((artifact) => artifact.path === path.join(attemptDir, planFile));
  const parsed = readDesign({ kind: 'text', value: report.text });
  if (!parsed.ok) throw new WorkflowError('environment-parser', parsed.reason);
  const { risks, coverage } = parsed.design;
  if (parsed.design.unscoredTables.length > 0) throw new WorkflowError('environment-parser', 'the report contains unscored risk tables');
  const ids = new Set();
  for (const risk of risks) {
    if (
      !risk.description.trim() ||
      !RISK_ID_PATTERN.test(risk.rawId) ||
      ids.has(risk.id) ||
      !['TECH', 'SEC', 'PERF', 'DATA', 'BUS', 'OPS'].includes(risk.category) ||
      ![1, 2, 3].includes(risk.probability) ||
      ![1, 2, 3].includes(risk.impact) ||
      risk.score !== risk.probability * risk.impact
    ) {
      throw new WorkflowError('environment-parser', `invalid or duplicate scored risk row: ${risk.rawId}`);
    }
    ids.add(risk.id);
  }
  if (
    coverage.length === 0 ||
    coverage.some(
      (row) => !['E2E', 'API', 'Component', 'Integration', 'Unit'].includes(row.level) || row.riskIds.some((id) => !ids.has(id)),
    ) ||
    risks.some((risk) => !coverage.some((row) => row.riskIds.includes(risk.id)))
  )
    throw new WorkflowError(
      'environment-parser',
      'the coverage plan is empty, uses invalid levels, carries dangling references or leaves risks uncovered',
    );
  return { artifacts: [...artifacts, checkpoint], riskCount: risks.length, coverageCount: coverage.length };
}
/** Stage all deliverables and restore prior reports if a replacement fails. */
function publishDesign(artifacts, { projectRoot, outputDir, runDir }, io = fs) {
  const staged = [];
  let keepBackups = false;
  try {
    for (const artifact of artifacts) {
      const destination = projectPath(projectRoot, path.join(outputDir, 'test-design', path.basename(artifact.path)), 'published artifact');
      const target = canonicalDestination(destination);
      io.mkdirSync(path.dirname(target), { recursive: true });
      const directory = io.mkdtempSync(path.join(path.dirname(target), '.tea-publish-'));
      const item = {
        destination,
        target,
        directory,
        next: path.join(directory, 'next'),
        previous: path.join(directory, 'previous'),
        existed: io.existsSync(target),
        installed: false,
      };
      staged.push(item);
      if (item.existed) {
        if (!io.statSync(target).isFile()) throw new Error(`publication destination is not a regular file: ${destination}`);
        io.copyFileSync(target, item.previous);
      }
      io.copyFileSync(artifact.path, item.next);
      if (item.existed) io.chmodSync(item.next, io.statSync(target).mode);
    }
    for (const item of staged) {
      io.renameSync(item.next, item.target);
      item.installed = true;
    }
    return staged.map((item) => item.destination);
  } catch (error_) {
    const rollbackErrors = [];
    for (const item of staged.filter((entry) => entry.installed).toReversed()) {
      try {
        if (item.existed) io.renameSync(item.previous, item.target);
        else io.unlinkSync(item.target);
      } catch (error) {
        rollbackErrors.push(`${item.destination}: ${error.message}`);
      }
    }
    keepBackups = rollbackErrors.length > 0;
    const status = keepBackups
      ? `publication may contain mixed reports; recovery backups: ${staged.map((item) => item.directory).join(', ')}; rollback errors: ${rollbackErrors.join('; ')}`
      : 'previous reports restored; no partial publication remains';
    const error = new WorkflowError('environment-configuration', `could not publish artifacts: ${error_.message}; ${status}`, {
      cause: error_,
    });
    error.runDir = runDir;
    throw error;
  } finally {
    if (!keepBackups) {
      for (const item of staged) {
        try {
          io.rmSync(item.directory, { recursive: true, force: true });
        } catch (error) {
          process.stderr.write(`publication staging cleanup failed at ${item.directory}: ${error.message}\n`);
        }
      }
    }
  }
}
/** Resolve user inputs, invoke the actual skill and publish verified deliverables. */
function run(argv) {
  const program = addAgentOptions(
    new Command().name('tea-test-design').description('Generate and verify an epic or system test plan with the TEA test-design skill.'),
  );
  program
    .option('--project-root <dir>', 'consuming project root', process.cwd())
    .option('--skill-root <dir>', 'explicit trusted skill directory; defaults to the packaged skill')
    .requiredOption('--input <path>', 'requirements or architecture document in the project (repeatable)', collect, [])
    .option('--scope <name>', 'epic or system', 'epic')
    .option('--epic <id>', 'epic number or stable slug; required for epic scope')
    .option('--output-dir <dir>', 'published artifact root inside the project; defaults to TEA test_artifacts')
    .option('--evidence-dir <dir>', 'retained prompts, raw streams and fresh artifacts inside the project', '.tea-runs')
    .setOptionValue('retries', '0')
    .exitOverride()
    .configureOutput({ writeErr: () => {} });
  try {
    program.parse(argv);
  } catch (error) {
    if (error.exitCode === 0) return;
    throw new WorkflowError('usage', error.message);
  }
  const options = program.opts();
  const projectRoot = fs.realpathSync(path.resolve(options.projectRoot));
  if (!['epic', 'system'].includes(options.scope)) throw new WorkflowError('usage', '--scope must be epic or system');
  if (options.scope === 'epic' && (!options.epic || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(options.epic)))
    throw new WorkflowError('usage', 'epic scope requires --epic with a number or stable lowercase slug');
  if (options.scope === 'system' && options.epic) throw new WorkflowError('usage', '--epic applies to epic scope');
  if (options.scope === 'system' && options.input.length < 2)
    throw new WorkflowError('usage', 'system scope requires PRD and architecture inputs, supplied with at least two --input options');
  const inputs = [...new Set(options.input.map((file) => readInput(projectRoot, file, '--input')))];
  if (options.scope === 'system' && inputs.length < 2)
    throw new WorkflowError('usage', 'system scope requires two distinct input documents');
  const inputDigests = inputs.map((file) => [file, digest(file)]);
  const skillRoot = resolveWorkflowSkill({ projectRoot, skillName: 'bmad-testarch-test-design', skillRoot: options.skillRoot });
  const resolvedConfig = resolveTeaConfig({ projectRoot, skillRoot, skillName: 'bmad-testarch-test-design' });
  const outputValue =
    options.outputDir || resolvedConfig.configSnapshot.modules.tea.test_artifacts.replaceAll('{project-root}', projectRoot);
  const outputDir = projectPath(projectRoot, outputValue, '--output-dir');
  const runKey = options.scope === 'epic' ? `epic-${options.epic}` : 'system';
  const projectName =
    path
      .basename(projectRoot)
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '') || 'project';
  const planName = options.scope === 'epic' ? `test-design-epic-${options.epic}.md` : 'test-design-qa.md';
  const publishedNames = options.scope === 'epic' ? [planName] : ['test-design-architecture.md', planName, `${projectName}-handoff.md`];
  const destinations = [...publishedNames, `test-design-progress-${runKey}.md`].map((name) =>
    projectPath(projectRoot, path.join(outputDir, 'test-design', name), 'published artifact'),
  );
  checkPublication(destinations, inputs);
  const result = runWithEvidence({
    name: 'tea-test-design',
    projectRoot,
    evidenceRoot: options.evidenceDir,
    options,
    prepare({ attemptDir }) {
      const artifactsRoot = path.join(attemptDir, 'artifacts');
      const config = {
        ...resolvedConfig,
        configSnapshot: {
          core: { ...resolvedConfig.configSnapshot.core, project_name: projectName },
          modules: { tea: { ...resolvedConfig.configSnapshot.modules.tea, test_artifacts: artifactsRoot } },
        },
      };
      const artifactFiles = publishedNames.map((file) => path.join('artifacts', 'test-design', file));
      const checkpointFile = path.join('artifacts', 'test-design', `test-design-progress-${runKey}.md`);
      const requestLines = [
        `Start Create mode at ${JSON.stringify(path.join(skillRoot, 'steps-c', 'step-01-detect-mode.md'))}.`,
        `mode=${options.scope}-level; run_scope=${options.scope}; run_key=${runKey}; design_level=full`,
        ...(options.scope === 'epic' ? [`epic_num=${options.epic}`] : []),
        `project_name=${projectName}; test_artifacts=${JSON.stringify(artifactsRoot)}; tea_browser_automation=none`,
        `Inputs are exactly this JSON list: ${JSON.stringify(inputs)}. Read them as the supplied requirements and architecture context.`,
        'Do not discover other requirement documents. Do not generate tests or modify any input document.',
        `Produce these deliverables: ${JSON.stringify(artifactFiles.map((file) => path.join(attemptDir, file)))}`,
        `Save a completed progress checkpoint at ${JSON.stringify(path.join(attemptDir, checkpointFile))}.`,
        'Use the workflow template and checklist. Complete all five steps and preserve its scored risk and coverage table schema.',
      ];
      return {
        prompt: headlessPrompt({ skillRoot, projectRoot, resolvedConfig: config, requestLines }),
        artifactFiles,
        checkpointFile,
        runKey,
        runScope: options.scope,
        inputDigests,
        planFile: path.join('artifacts', 'test-design', planName),
      };
    },
    validate: validateDesign,
  });
  if (result.dryRun) {
    process.stdout.write(
      `${JSON.stringify({ mode: 'prompt-only', evidence: result.runDir, prompt: path.join(result.attemptDir, 'prompt.txt') })}\n`,
    );
    return;
  }
  // Recheck after execution: the consuming project is writable during generation.
  checkPublication(
    destinations.map((file) => projectPath(projectRoot, file, 'published artifact')),
    inputs,
  );
  const published = publishDesign(result.value.artifacts, { projectRoot, outputDir, runDir: result.runDir });
  process.stdout.write(
    `${JSON.stringify({ mode: 'live', runKey, evidence: result.runDir, artifacts: published, riskCount: result.value.riskCount, coverageCount: result.value.coverageCount })}\n`,
  );
}
/** Convert configuration and agent failures to the documented CLI exit codes. */
function main(argv) {
  try {
    run(argv);
    return 0;
  } catch (error) {
    return mainError('tea-test-design', error);
  }
}
if (require.main === module) process.exitCode = main(process.argv);
module.exports = { main, validateDesign, publishDesign };
