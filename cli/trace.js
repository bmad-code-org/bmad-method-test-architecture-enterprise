#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Command } = require('commander');
const { resolveTeaConfig } = require('./lib/resolve-tea-config');
const { addAgentOptions, projectPath, readInput, resolveWorkflowSkill, headlessPrompt, runWithEvidence } = require('./lib/workflow-cli');
const {
  sourceOracleLedger,
  COLLECTION_MODES,
  GATE_TYPES,
  resolveTraceTarget,
  tracePaths,
  validateTraceOutputs,
  publishTraceOutputs,
} = require('./lib/trace-command');

const NAME = 'tea-trace';

function parser() {
  const command = new Command().name(NAME).description('Trace requirements to existing tests and emit a coverage gate.');
  addAgentOptions(command);
  return command
    .option('--project-root <path>', 'consuming project root', process.cwd())
    .option('--target <path>', 'story, epic, or requirements document, relative to project root')
    .option('--target-id <id>', 'explicit story, epic, release, or hotfix identity')
    .option('--gate-type <type>', `scope type (${GATE_TYPES.join('|')}); inferred from the target when omitted`)
    .option('--test-dir <path>', 'static test root, relative to project root', 'tests')
    .option('--source-dir <path>', 'source root, relative to project root', '.')
    .option('--output-dir <path>', 'test artifact root; defaults to resolved test_artifacts')
    .option('--evidence-dir <path>', 'retained attempt directory, relative to project root', '.tea-runs')
    .option('--live-results <path>', 'recorded live verification input; defaults to artifact root/live-verification-results.json')
    .option('--waiver-register <path>', 'waiver register input; defaults to artifact root/gate-waivers.md')
    .option('--collection-mode <mode>', `collection strategy (${COLLECTION_MODES.join('|')})`, 'contract_static')
    .option('--coverage-levels <levels>', 'comma-separated test levels', 'e2e,api,component,unit,live')
    .option('--no-gate', 'collect coverage without evaluating a gate')
    .option('--fail-on <status>', 'exit 1 for fail, or for concerns and fail', 'fail')
    .option('--skill-root <path>', 'explicit installed Trace skill override')
    .option('--json <path>', 'also save the command result JSON at this project-relative path');
}

function execute(options, registerOutputGuard = () => {}) {
  const projectRoot = fs.realpathSync(path.resolve(options.projectRoot));
  if (!fs.statSync(projectRoot).isDirectory()) throw new Error('--project-root must be a directory.');
  if (!COLLECTION_MODES.includes(options.collectionMode))
    throw new Error(`--collection-mode must be one of ${COLLECTION_MODES.join(', ')}.`);
  if (!['fail', 'concerns'].includes(options.failOn)) throw new Error('--fail-on must be fail or concerns.');
  const levels = options.coverageLevels.split(',').map((level) => level.trim().toLowerCase());
  if (levels.length === 0 || levels.some((level) => !['e2e', 'api', 'component', 'unit', 'live'].includes(level)))
    throw new Error('--coverage-levels must list e2e, api, component, unit, or live.');
  const skillRoot = resolveWorkflowSkill({ projectRoot, skillName: 'bmad-testarch-trace', skillRoot: options.skillRoot });
  const resolvedConfig = resolveTeaConfig({ projectRoot, skillRoot, skillName: 'bmad-testarch-trace' });
  const rawArtifacts = resolvedConfig.configSnapshot.modules.tea.test_artifacts;
  if (typeof rawArtifacts !== 'string' || !rawArtifacts.trim())
    throw new Error('test_artifacts in the TEA config must be a nonempty string.');
  const configuredRoot = rawArtifacts.replaceAll('{project-root}', projectRoot);
  const artifactRoot = projectPath(projectRoot, options.outputDir ?? configuredRoot, '--output-dir');
  const testDir = projectPath(projectRoot, options.testDir, '--test-dir');
  const sourceDir = projectPath(projectRoot, options.sourceDir, '--source-dir');
  if (['contract_static', 'inventory_only'].includes(options.collectionMode) && !fs.statSync(testDir).isDirectory())
    throw new Error('--test-dir must be a directory.');
  if (!fs.statSync(sourceDir).isDirectory()) throw new Error('--source-dir must be a directory.');
  const targetFile = options.target ? readInput(projectRoot, options.target, '--target') : undefined;
  const target = resolveTraceTarget({ projectRoot, target: targetFile, targetId: options.targetId, gateType: options.gateType });
  const targetText = targetFile ? fs.readFileSync(targetFile, 'utf8') : '';
  const oracleLedger = sourceOracleLedger(targetText, targetFile ?? 'project');
  const liveResults = options.liveResults
    ? readInput(projectRoot, options.liveResults, '--live-results')
    : path.join(artifactRoot, 'live-verification-results.json');
  const waiverRegister = options.waiverRegister
    ? readInput(projectRoot, options.waiverRegister, '--waiver-register')
    : path.join(artifactRoot, 'gate-waivers.md');
  const destinations = tracePaths(artifactRoot, target.runKey);
  for (const [name, file] of Object.entries(destinations)) destinations[name] = projectPath(projectRoot, file, `trace ${name}`);
  const allowGate = options.gate && options.collectionMode !== 'inventory_only';
  const identity = (file) => (fs.existsSync(file) ? fs.realpathSync(file) : path.resolve(file));
  const aliases = (left, right) => {
    if (identity(left) === identity(right)) return true;
    if (!fs.existsSync(left) || !fs.existsSync(right)) return false;
    const leftStat = fs.statSync(left);
    const rightStat = fs.statSync(right);
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  };
  const inputs = [targetFile, liveResults, waiverRegister].filter(Boolean);
  const assertOutputPaths = () => {
    for (const [name, file] of Object.entries(destinations)) {
      projectPath(projectRoot, file, `trace ${name}`);
      if (fs.existsSync(file) && !fs.statSync(file).isFile()) throw new Error(`Trace ${name} destination must be a regular file.`);
    }
    const outputs = Object.values(destinations);
    if (outputs.some((left, index) => outputs.slice(index + 1).some((right) => aliases(left, right))))
      throw new Error('Trace artifacts must use separate paths from each other.');
    if (Object.values(destinations).some((output) => inputs.some((input) => aliases(output, input))))
      throw new Error('Trace artifacts must use separate paths from the target, live results, and waiver register.');
    if (!options.json) return;
    projectPath(projectRoot, options.json, '--json');
    const protectedPaths = [...inputs, ...Object.values(destinations)];
    if (protectedPaths.some((file) => aliases(file, options.json)))
      throw new Error('--json must use a separate path from inputs and trace artifacts.');
    if (fs.existsSync(options.json) && !fs.statSync(options.json).isFile()) throw new Error('--json must name a regular file.');
  };
  assertOutputPaths();
  registerOutputGuard(assertOutputPaths);
  if (options.json) fs.mkdirSync(path.dirname(options.json), { recursive: true });
  const result = runWithEvidence({
    name: NAME,
    projectRoot,
    evidenceRoot: options.evidenceDir,
    options,
    prepare({ attemptDir, attempt }) {
      if (attempt === 1 && options.agent !== 'none') {
        for (const file of Object.values(destinations)) if (fs.existsSync(file)) fs.unlinkSync(file);
      }
      const paths = tracePaths(attemptDir, target.runKey);
      const prompt = headlessPrompt({
        skillRoot,
        projectRoot,
        resolvedConfig,
        requestLines: [
          'Execute both trace phases, finishing Step 5. Use deterministic gate decisions.',
          `Frozen source oracle ledger: ${JSON.stringify(oracleLedger)}. Preserve its identities and explicit priorities in Step 1 and the final matrix.`,
          'Persist Step 1 oracleLedger in matrix YAML frontmatter as an array of {id, requirement, priority, source} records. Assign priorities only where the source leaves them unspecified.',
          `The only trace target for this run is ${target.document ? JSON.stringify(target.document) : `the project (${target.runScope})`}.`,
          `Resolved identity: ${JSON.stringify(target)}. Preserve it in every output.`,
          `Resolve {gate_type} to ${JSON.stringify(target.type)}, {run_scope} to ${JSON.stringify(target.runScope)}, and {run_key} to ${JSON.stringify(target.runKey)}.`,
          `Resolve {test_artifacts} to ${JSON.stringify(attemptDir)} for this attempt's outputs.`,
          `For Step 1's supporting test-design and NFR artifact lookup, use the original artifact root ${JSON.stringify(artifactRoot)}. These existing documents are inputs; all new trace outputs belong in this attempt's directory.`,
          `Resolve {test_dir} to ${JSON.stringify(testDir)} and {source_dir} to ${JSON.stringify(sourceDir)}.`,
          `Resolve {live_results_input} to ${JSON.stringify(liveResults)} and {waiver_register_input} to ${JSON.stringify(waiverRegister)}. These are inputs in the original project artifact root.`,
          `Resolve {collection_mode} to ${JSON.stringify(options.collectionMode)}, {coverage_levels} to ${JSON.stringify([...new Set(levels)].join(','))}, {allow_gate} to ${allowGate}, and {decision_mode} to "deterministic".`,
          'Resolve {coverage_basis} and {summary_confidence} to auto, then persist the concrete values selected by Step 1.',
          `Write the matrix to ${JSON.stringify(paths.matrix)} and the schema 0.3.x summary to ${JSON.stringify(paths.summary)}.`,
          `Resolve {outputFile} and {default_output_file} to ${JSON.stringify(paths.matrix)}, {e2e_trace_summary_output} to ${JSON.stringify(paths.summary)}, and {gate_decision_output} to ${JSON.stringify(paths.gate)}.`,
          'Write the gate JSON when this run is eligible. Omit gate fields and the gate file when this run evaluates no gate.',
          'Read existing requirements, source, and tests as evidence. This workflow writes trace artifacts and generates no tests.',
          'Use this attempt directory for temporary coverage files too, preserving their paths in matrix progress frontmatter.',
          'Record unavailable source revision metadata as unknown. Use the actual project Git HEAD when it exists.',
        ],
      });
      return { prompt, paths };
    },
    validate({ paths }) {
      if (targetFile && fs.readFileSync(targetFile, 'utf8') !== targetText)
        throw new Error('Trace agent changed the target requirement document.');
      return validateTraceOutputs({
        paths,
        target,
        collectionMode: options.collectionMode,
        allowGate,
        oracleLedger,
        requireOracleLedger: true,
      });
    },
  });
  if (result.dryRun) return { exitCode: 0, prompt: result.context.prompt, evidence: result.runDir };
  let summary;
  try {
    assertOutputPaths();
    summary = publishTraceOutputs(result.value, destinations);
  } catch (error) {
    error.runDir = result.runDir;
    throw error;
  }
  const status = summary.gate_status ?? null;
  const exitCode = status === 'FAIL' || (status === 'CONCERNS' && options.failOn === 'concerns') ? 1 : 0;
  return {
    exitCode,
    payload: {
      schema_version: '0.1.0',
      status: 'completed',
      run_key: target.runKey,
      gate_status: status,
      collection_status: summary.collection_status,
      coverage: summary.coverage.inventory,
      artifacts: { matrix: destinations.matrix, summary: destinations.summary, gate: result.value.gate ? destinations.gate : null },
      evidence: result.runDir,
      attempts: result.attempts.length,
    },
  };
}

function main(argv = process.argv) {
  const command = parser();
  command.exitOverride();
  let options;
  let result;
  let outputGuard;
  try {
    command.parse(argv);
    options = command.opts();
    if (options.json) options.json = projectPath(path.resolve(options.projectRoot), options.json, '--json');
    result = execute(options, (guard) => {
      outputGuard = guard;
    });
  } catch (error) {
    if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') return 0;
    const failedRun = ['environment-parser', 'environment-transport', 'environment-timeout'].includes(error.failureClass);
    result = {
      exitCode: failedRun ? 3 : 2,
      payload: { schema_version: '0.1.0', status: 'failed', reason: error.message, evidence: error.runDir ?? null },
    };
    process.stderr.write(`${NAME}: ${error.message}\n`);
  }
  if (result.prompt) {
    process.stdout.write(`${result.prompt}\n`);
    process.stderr.write(`${NAME}: prompt evidence: ${result.evidence}\n`);
  } else {
    try {
      outputGuard?.();
    } catch (error) {
      result = {
        exitCode: 2,
        payload: { schema_version: '0.1.0', status: 'failed', reason: error.message, evidence: result.payload?.evidence ?? null },
      };
      process.stderr.write(`${NAME}: ${error.message}\n`);
    }
    const text = `${JSON.stringify(result.payload, null, 2)}\n`;
    if (options?.json && result.exitCode !== 2) fs.writeFileSync(options.json, text, 'utf8');
    process.stdout.write(text);
  }
  return result.exitCode;
}

if (require.main === module) process.exitCode = main();
module.exports = { main, parser, execute };
