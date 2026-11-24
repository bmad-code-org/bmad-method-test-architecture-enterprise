#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Command } = require('commander');
const { resolveTeaConfig } = require('./lib/resolve-tea-config');
const { captureLiveResults, currentSourceSha, gitHead } = require('./lib/trace-live');
const { neutralizeWorkflowCommands } = require('./lib/safe-log');
const {
  WorkflowError,
  RUN_FAILURE_CLASSES,
  addAgentOptions,
  projectPath,
  readInput,
  resolveWorkflowSkill,
  headlessPrompt,
  runWithEvidence,
} = require('./lib/workflow-cli');
const {
  PCT_RULE,
  sourceOracleLedger,
  epicTicketSources,
  requirementOracle,
  COLLECTION_MODES,
  GATE_TYPES,
  resolveTraceTarget,
  tracePaths,
  validateTraceOutputs,
  resolveTraceGatePolicy,
  classifyTraceRejection,
  withFullSourceSha,
  publishTraceOutputs,
} = require('./lib/trace-command');

const NAME = 'tea-trace';

function parser() {
  const command = new Command().name(NAME).description('Trace requirements to existing tests and emit a coverage gate.');
  addAgentOptions(command, {
    retryHelp: 'additional attempts after a transport failure, a timeout, or rejected agent output, from 0 to 3',
  });
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
  const skillRoot = resolveWorkflowSkill({ projectRoot, skillName: 'bmad-tea-trace', skillRoot: options.skillRoot });
  const workflowSources = new Map();
  const resolvedConfig = resolveTeaConfig({ projectRoot, skillRoot, skillName: 'bmad-tea-trace', workflowSources });
  const gatePolicy = resolveTraceGatePolicy(resolvedConfig.workflowCustomization.gate, workflowSources);
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
  const oracleLedger = sourceOracleLedger(targetText, targetFile ?? 'project', target);
  // The requirement oracle's criteria come from the epic's tickets; capture them before the agent runs.
  const tickets = requirementOracle(target, oracleLedger) ? epicTicketSources(projectRoot, target) : undefined;
  const requirementLines = tickets
    ? [
        `This is v7 epic ${target.epicKey}; the frozen ledger holds its Requirements lines. Record oracleGranularity: requirements.`,
        'Persist Step 1 criterionLedger and the requirement and exception oracleLedger rows in matrix YAML frontmatter with every field Step 1 section 1b names.',
        'In the summary JSON, set oracle.granularity to "requirements" and oracle.rows to one entry per oracleLedger row, in ledger order: {id, kind, priority, priority_basis, coverage}, plus parent, missing_behaviors and contributors [{id, story, coverage}] for a requirement row, or exception for an exception row.',
      ]
    : [];
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
  const inputs = [...new Set([targetFile, liveResults, waiverRegister, ...(tickets?.files.keys() ?? [])].filter(Boolean))];
  const heldInputs = inputs.map((file) => {
    if (!fs.existsSync(file)) return { file, missing: true };
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error(`Trace input must be a regular file: ${file}`);
    return { file, real: fs.realpathSync(file), mode: stat.mode, dev: stat.dev, ino: stat.ino, bytes: fs.readFileSync(file) };
  });
  // One revision snapshot serves live evidence and every integrity check. Git's own HEAD wins when
  // it resolves, so a lost .git can never pass by matching a CI fallback revision.
  const startGitHead = gitHead(projectRoot);
  const startRevision = startGitHead || currentSourceSha(projectRoot);
  const liveCapture = captureLiveResults(
    liveResults,
    projectRoot,
    levels.includes('live') || options.collectionMode === 'runtime_manifest',
    startRevision,
  );
  // A moved revision or a changed input compromises the run itself; no retry can repair either.
  const assertRunIntegrity = () => {
    if (startGitHead ? gitHead(projectRoot) !== startGitHead : currentSourceSha(projectRoot) !== startRevision)
      throw new WorkflowError(
        'environment-parser',
        liveCapture
          ? 'Trace source revision changed during the run; rerun with current live evidence.'
          : 'Trace source revision changed during the run; the agent must not move the project HEAD.',
      );
    for (const input of heldInputs) {
      const changed = input.missing
        ? fs.existsSync(input.file)
        : !fs.existsSync(input.file) ||
          (() => {
            const stat = fs.statSync(input.file);
            return (
              fs.realpathSync(input.file) !== input.real ||
              stat.mode !== input.mode ||
              stat.dev !== input.dev ||
              stat.ino !== input.ino ||
              !fs.readFileSync(input.file).equals(input.bytes)
            );
          })();
      if (changed) throw new WorkflowError('environment-parser', `Trace agent changed a supplied input: ${input.file}`);
    }
  };
  const assertOutputPaths = () => {
    for (const [name, file] of Object.entries(destinations)) {
      projectPath(projectRoot, file, `trace ${name}`);
      if (fs.existsSync(file) && !fs.statSync(file).isFile()) throw new Error(`Trace ${name} destination must be a regular file.`);
    }
    const outputs = Object.values(destinations);
    if (outputs.some((left, index) => outputs.slice(index + 1).some((right) => aliases(left, right))))
      throw new Error('Trace artifacts must use separate paths from each other.');
    if (Object.values(destinations).some((output) => inputs.some((input) => aliases(output, input))))
      throw new Error('Trace artifacts must use separate paths from the target, its ticket sources, live results, and waiver register.');
    if (!options.json) return;
    projectPath(projectRoot, options.json, '--json');
    const protectedPaths = [...inputs, ...Object.values(destinations)];
    if (protectedPaths.some((file) => aliases(file, options.json)))
      throw new Error('--json must use a separate path from inputs and trace artifacts.');
    if (fs.existsSync(options.json) && !fs.statSync(options.json).isFile()) throw new Error('--json must name a regular file.');
  };
  assertOutputPaths();
  registerOutputGuard(assertOutputPaths);
  if (options.json) {
    fs.mkdirSync(path.dirname(options.json), { recursive: true });
    if (options.agent !== 'none' && fs.existsSync(options.json)) fs.unlinkSync(options.json);
  }
  const run = {
    name: NAME,
    projectRoot,
    evidenceRoot: options.evidenceDir,
    options,
    prepare({ attemptDir, previousRejection }) {
      const paths = tracePaths(attemptDir, target.runKey);
      // An empty frozen ledger would tell the agent to preserve nothing, which the validator rejects.
      const ledgerLines =
        oracleLedger.length > 0
          ? [
              `Frozen source oracle ledger: ${JSON.stringify(oracleLedger)}. Preserve its requirement text, source references, identities, and explicit priorities in Step 1 and the final matrix.`,
            ]
          : [
              'No source oracle ledger is frozen for this run. Build the Step 1 oracleLedger from the source documents, or from the selected tests for a synthetic oracle. It must contain at least one entry.',
            ];
      // The CLI's own check message, reduced to one line; this attempt writes to its own directory below.
      const retryLines = previousRejection
        ? [
            `The CLI rejected attempt ${previousRejection.attempt}'s output with this validation message: ${JSON.stringify(previousRejection.message)}. Write this attempt's artifacts so they pass that check.`,
          ]
        : [];
      const prompt = headlessPrompt({
        skillRoot,
        projectRoot,
        resolvedConfig,
        requestLines: [
          'Execute both trace phases, finishing Step 5. Use deterministic gate decisions.',
          ...retryLines,
          ...ledgerLines,
          'Persist Step 1 oracleLedger in matrix YAML frontmatter as an array of {id, requirement, priority, source} records. Assign priorities only where the source leaves them unspecified.',
          ...requirementLines,
          `The only trace target for this run is ${target.document ? JSON.stringify(target.document) : `the project (${target.runScope})`}.`,
          `Resolved identity: ${JSON.stringify(target)}. Preserve it in every output.`,
          `Resolve {gate_type} to ${JSON.stringify(target.type)}, {run_scope} to ${JSON.stringify(target.runScope)}, and {run_key} to ${JSON.stringify(target.runKey)}.`,
          `Resolve {test_artifacts} to ${JSON.stringify(attemptDir)} for this attempt's outputs.`,
          `For Step 1's supporting test-design and NFR artifact lookup, use the original artifact root ${JSON.stringify(artifactRoot)}. These existing documents are inputs; all new trace outputs belong in this attempt's directory.`,
          `Resolve {test_dir} to ${JSON.stringify(testDir)} and {source_dir} to ${JSON.stringify(sourceDir)}.`,
          `Resolve {live_results_input} to ${JSON.stringify(liveResults)} and {waiver_register_input} to ${JSON.stringify(waiverRegister)}. These are inputs in the original project artifact root.`,
          `Resolve {collection_mode} to ${JSON.stringify(options.collectionMode)}, {coverage_levels} to ${JSON.stringify([...new Set(levels)].join(','))}, {allow_gate} to ${allowGate}, and {decision_mode} to "deterministic".`,
          'Resolve {coverage_basis} and {summary_confidence} to auto, then persist the concrete values selected by Step 1.',
          PCT_RULE,
          `Resolve {gate_policy} to ${JSON.stringify(gatePolicy)}. Use this frozen policy for Step 5.`,
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
    afterAgent: assertRunIntegrity,
    validate({ paths }) {
      try {
        return validateTraceOutputs({
          paths,
          target,
          collectionMode: options.collectionMode,
          allowGate,
          gatePolicy,
          oracleLedger,
          requireOracleLedger: true,
          liveCapture,
          requireLiveManifest: true,
          tickets,
        });
      } catch (error) {
        throw classifyTraceRejection(error);
      }
    },
  };
  let result;
  try {
    result = runWithEvidence(run);
  } catch (error) {
    // Whatever the exit class, an absent matrix or summary means the agent's own words explain the failure.
    if (error.attemptDir) {
      const written = tracePaths(error.attemptDir, target.runKey);
      error.missingArtifacts = ['matrix', 'summary'].filter((name) => {
        try {
          fs.lstatSync(written[name]);
          return false;
        } catch (statError) {
          return statError.code === 'ENOENT';
        }
      });
    }
    throw error;
  }
  if (result.dryRun) return { exitCode: 0, prompt: result.context.prompt, evidence: result.runDir };
  let summary;
  try {
    assertOutputPaths();
    assertRunIntegrity();
    // Only the verified start snapshot of Git's own HEAD may replace an abbreviation; a CI fallback never does.
    const value = { ...result.value, summary: withFullSourceSha(result.value.summary, startGitHead) };
    summary = publishTraceOutputs(value, destinations);
  } catch (error) {
    error.runDir = result.runDir;
    error.attempts = result.attempts;
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
    attemptRecords: result.attempts,
  };
}

/** A failed command result; attempt records, when an agent ran, carry only bounded diagnostics. */
function failedPayload(reason, evidence, attempts) {
  return {
    schema_version: '0.1.0',
    status: 'failed',
    reason,
    evidence,
    ...(attempts
      ? {
          attempts: attempts.length,
          attempt_results: attempts.map((record) => ({
            attempt: record.attempt,
            status: record.status,
            failure_class: record.failureClass ?? null,
            message: record.diagnostic ?? null,
          })),
        }
      : {}),
  };
}

/** JSON whose console copy cannot issue a CI workflow command; parsing it recovers the exact text. */
function consoleJson(text) {
  return text.replaceAll('::', String.raw`:\u003a`).replaceAll('##[', String.raw`#\u0023[`);
}

/** The failure message, plus the agent's own last words when it never wrote a required artifact. */
function failureReason(error) {
  // A parser rejection quotes agent-written text; its CLI-authored form stands in for it outside evidence.
  const message = error.rejection ?? error.message;
  if (!error.missingArtifacts?.length || !error.agentTail) return message;
  const { stdout, stderr } = error.agentTail;
  return [
    message.replace(/\.$/, ''),
    stdout.trim() ? `agent stdout tail: ${stdout.trim()}` : 'agent stdout was empty',
    ...(stderr.trim() ? [`agent stderr tail: ${stderr.trim()}`] : []),
  ].join('; ');
}

function main(argv = process.argv) {
  const command = parser();
  command.exitOverride();
  let options;
  let result;
  let outputGuard;
  let outputGuardPassed = false;
  try {
    command.parse(argv);
    options = command.opts();
    if (options.json) options.json = projectPath(path.resolve(options.projectRoot), options.json, '--json');
    result = execute(options, (guard) => {
      outputGuard = guard;
    });
  } catch (error) {
    if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') return 0;
    const failedRun = RUN_FAILURE_CLASSES.includes(error.failureClass);
    result = {
      exitCode: failedRun ? 3 : 2,
      payload: failedPayload(failureReason(error), error.runDir ?? null, error.attempts),
      attemptRecords: error.attempts,
    };
    // A parser rejection's raw message quotes agent-written text; attempt.json keeps it.
    process.stderr.write(`${NAME}: ${neutralizeWorkflowCommands(error.rejection ?? error.message)}\n`);
  }
  if (result.prompt) {
    process.stdout.write(`${result.prompt}\n`);
    process.stderr.write(`${NAME}: prompt evidence: ${result.evidence}\n`);
  } else {
    try {
      outputGuard?.();
      outputGuardPassed = Boolean(outputGuard);
    } catch (error) {
      result = {
        exitCode: 2,
        payload: failedPayload(error.message, result.payload?.evidence ?? null, result.attemptRecords),
      };
      process.stderr.write(`${NAME}: ${neutralizeWorkflowCommands(error.message)}\n`);
    }
    const text = `${JSON.stringify(result.payload, null, 2)}\n`;
    if (options?.json && (result.exitCode !== 2 || outputGuardPassed)) fs.writeFileSync(options.json, text, 'utf8');
    // The saved result keeps exact diagnostics; the console copy cannot issue CI workflow commands.
    process.stdout.write(consoleJson(text));
  }
  return result.exitCode;
}

if (require.main === module) process.exitCode = main();
module.exports = { main, parser, execute };
