/** Framework-specific request routing and completion checks for tea-framework. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { createHash } = require('node:crypto');
const { stripVTControlCharacters } = require('node:util');
const { spawnSync } = require('node:child_process');
const { runAgent } = require('./run-agent');
const { resolveTeaConfig } = require('./resolve-tea-config');

const SKILL_NAME = 'bmad-testarch-framework';
const SCOPES = ['framework', 'ci', 'both'];
const OPERATIONS = ['create', 'resume', 'validate', 'edit'];

function problem(message) {
  const error = new Error(message);
  error.code = 'TEA_CONFIG_INVALID';
  return error;
}

/** Resolve paths and existing parents through symlinks before allowing project artifacts. */
function projectPath(root, value) {
  if (typeof value !== 'string' || !value.trim() || /[\r\n\0]/.test(value))
    throw problem('Artifact path must be a nonempty single-line path');
  const target = path.resolve(root, value.replaceAll('{project-root}', root));
  let ancestor = target;
  while (!fs.existsSync(ancestor)) {
    try {
      if (fs.lstatSync(ancestor).isSymbolicLink()) throw problem(`Artifact path is a dangling symbolic link: ${value}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw problem(`Cannot resolve artifact path: ${value}`);
    ancestor = parent;
  }
  const resolved = path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, target));
  const relative = path.relative(fs.realpathSync(root), resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw problem(`Artifact path is outside project root: ${value}`);
  }
  return resolved;
}

/** Result publication must preserve configuration, inputs and skill-owned outputs, including inode aliases. */
function protectResultPath(request, resultPath, state = request.before?.data) {
  if (!resultPath) return;
  const protectedPaths = [
    request.journalPath,
    request.instructionsPath,
    ...request.inputs,
    'package.json',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'tsconfig.json',
    'jsconfig.json',
    request.config.configPath,
    '_bmad/config.toml',
    '_bmad/config.user.toml',
    '_bmad/custom/config.toml',
    '_bmad/custom/config.user.toml',
  ];
  for (const phase of ['framework', 'ci']) {
    protectedPaths.push(...(state?.phase_targets?.[phase] ?? []), state?.phase_checkpoints?.[phase]);
    const report = state?.validation_reports?.[phase];
    protectedPaths.push(...(Array.isArray(report) ? report : typeof report === 'string' ? [report] : [report?.path]));
  }
  protectedPaths.push(
    ...(state?.contract?.config_paths ?? []),
    ...(state?.contract?.test_directories ?? []),
    state?.contract?.test_dir,
    state?.contract?.pipeline_target,
    state?.contract?.lockfile,
    state?.pipeline_target,
  );
  const target = projectPath(request.projectRoot, resultPath);
  const targetStat = fs.existsSync(target) ? fs.statSync(target) : null;
  for (const raw of protectedPaths.filter(Boolean)) {
    const file = projectPath(request.projectRoot, raw.replaceAll('{test_artifacts}', request.artifactsRoot));
    const stat = fs.existsSync(file) ? fs.statSync(file) : null;
    const relative = path.relative(file, target);
    if (
      target === file ||
      (stat && targetStat && stat.dev === targetStat.dev && stat.ino === targetStat.ino) ||
      (stat?.isDirectory() && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    )
      throw problem('--json conflicts with protected setup configuration, input or output');
  }
}

/** Recognize native runner summaries after resolving ordinary package or shell-script commands. */
function testExecutionEvidence(root, command, output) {
  let expanded = command;
  const expandedScripts = new Set();
  for (let depth = 0; depth < 4; depth++) {
    const npm = [...expanded.matchAll(/\b(?:npm|pnpm|yarn)\s+(?:run\s+)?([\w:-]+)/g)].find(
      (match) => !expandedScripts.has(match[1]) && !['exec', 'dlx', 'install', 'ci'].includes(match[1]),
    );
    if (!npm) break;
    expandedScripts.add(npm[1]);
    const manifest = path.join(root, 'package.json');
    if (!fs.existsSync(manifest)) break;
    const script = JSON.parse(fs.readFileSync(manifest, 'utf8')).scripts?.[npm[1]];
    if (!script || expanded.includes(script)) break;
    expanded += `\n${script}`;
  }
  const shellFile = command.match(/^\s*(?:bash|sh)\s+([^\s;&|]+)/)?.[1];
  if (shellFile) {
    const file = projectPath(root, shellFile);
    if (fs.existsSync(file)) expanded += `\n${fs.readFileSync(file, 'utf8')}`;
  }
  const patterns = [
    ['node-test', /\bnode(?:\.exe)?\s+(?:--[\w-]+(?:=\S+)?\s+)*--test(?:[=\s]|$)/, /(?:#|ℹ) pass (\d+)/],
    ['unittest', /\bpython[\d.]*\s+-m\s+unittest\b/, /Ran (\d+) tests?\b/],
    ['pytest', /\b(?:pytest|python[\d.]*\s+-m\s+pytest)\b/, /(?:^|\s)(\d+) passed\b/],
    ['playwright', /\bplaywright\s+test\b/, /(?:^|\s)(\d+) passed\b/],
    ['vitest', /\bvitest\b/, /Tests\s+(\d+) passed\b/],
    ['jest', /\bjest\b/, /Tests:\s+(\d+) passed\b/],
    ['cypress', /\bcypress\s+run\b/, /Passing:\s*(\d+)/],
    ['go', /\bgo\s+test\b/, /--- PASS:/],
    ['cargo', /\bcargo\s+test\b/, /test result: ok\. (\d+) passed/],
    ['dotnet', /\bdotnet\s+test\b/, /Passed:\s*(\d+)/],
    ['phpunit', /\bphpunit\b/, /OK \((\d+) tests?/],
  ];
  for (const [runner, detector, summary] of patterns) {
    if (!detector.test(expanded)) continue;
    const match = stripVTControlCharacters(output).match(summary);
    let passedTests = match ? (runner === 'go' ? [...output.matchAll(/--- PASS:/g)].length : Number(match[1])) : 0;
    if (runner === 'unittest') passedTests -= Number(output.match(/skipped=(\d+)/)?.[1] ?? 0);
    return { runner, passedTests };
  }
  return { runner: null, passedTests: 0 };
}

function readJournal(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw problem(`Setup journal has no YAML frontmatter: ${file}`);
  const data = yaml.load(match[1]);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw problem(`Invalid setup journal: ${file}`);
  return { data, digest: createHash('sha256').update(text).digest('hex'), text };
}

function prepareSetup({ projectRoot, skillRoot, config, options }) {
  if (!SCOPES.includes(options.scope)) throw problem(`--scope must be ${SCOPES.join('|')}`);
  if (!OPERATIONS.includes(options.operation)) throw problem(`--operation must be ${OPERATIONS.join('|')}`);
  const artifactsRoot = projectPath(projectRoot, config.configSnapshot.modules.tea.test_artifacts);
  const journalPath = projectPath(projectRoot, path.join(artifactsRoot, 'framework', 'setup-run-progress.md'));
  const before = readJournal(journalPath);
  const inputs = (options.input ?? []).map((file) => projectPath(projectRoot, file));
  for (const file of inputs) if (!fs.existsSync(file)) throw problem(`Input artifact does not exist: ${file}`);
  let instructions = '';
  const instructionsPath = options.instructions ? projectPath(projectRoot, options.instructions) : null;
  if (instructionsPath) instructions = fs.readFileSync(instructionsPath, 'utf8');
  if (options.operation === 'resume' && (inputs.length > 0 || instructionsPath))
    throw problem('Resume restores saved inputs and instructions; omit --input and --instructions');
  if (['edit', 'validate'].includes(options.operation) && inputs.length === 0)
    throw problem(`${options.operation} requires --input <artifact> (repeatable)`);
  if (options.operation === 'edit' && !instructions.trim())
    throw problem('edit requires --instructions <file> containing requested changes');
  if (options.operation === 'resume' && !before) throw problem(`Resume requires the setup journal at ${journalPath}`);
  if (
    options.operation === 'resume' &&
    (!SCOPES.includes(before.data.setup_scope) || !['create', 'edit', 'validate'].includes(before.data.setup_operation))
  ) {
    throw problem('Setup journal has no recognized saved scope and operation');
  }
  if (options.operation === 'resume' && before.data.hooks_started?.some((key) => !before.data.hooks_completed?.includes(key)))
    throw problem('Resume has an uncertain started hook. Record explicit operator recovery in the journal before headless execution.');
  const scope = options.operation === 'resume' ? before.data.setup_scope : options.scope;
  const ciConfig = ['ci', 'both'].includes(scope)
    ? resolveTeaConfig({ projectRoot, skillRoot: path.join(skillRoot, '..', 'bmad-testarch-ci'), skillName: 'bmad-testarch-ci' })
    : null;
  const requiredHooks = {};
  for (const [phase, settings] of [
    ['framework', config.workflowCustomization],
    ['ci', ciConfig?.workflowCustomization],
  ]) {
    if (scope !== 'both' && scope !== phase) continue;
    for (const kind of ['activation_steps_prepend', 'activation_steps_append']) {
      const steps = settings?.[kind] ?? [];
      if (!Array.isArray(steps) || steps.some((step) => typeof step !== 'string')) throw problem(`Invalid ${phase}.${kind}`);
      for (const [index, instruction] of steps.entries()) {
        if (instruction.trim()) requiredHooks[`${phase}.${kind}.${index}`] = instruction;
      }
    }
    const instruction = settings?.on_complete ?? '';
    if (typeof instruction !== 'string') throw problem(`Invalid ${phase}.on_complete`);
    if (instruction.trim()) requiredHooks[`${phase}.on_complete`] = instruction;
  }
  if (options.operation === 'create' && ['ci', 'both'].includes(options.scope)) {
    const git = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projectRoot, encoding: 'utf8', timeout: 10_000 });
    if (git.status !== 0 || git.stdout.trim() !== 'true')
      throw problem('Git repository required for CI/CD setup. Initialize the repository before Create.');
  }
  return {
    projectRoot,
    skillRoot,
    config,
    scope,
    operation: options.operation,
    savedOperation: options.operation === 'resume' ? before.data.setup_operation : options.operation,
    artifactsRoot,
    journalPath,
    before,
    inputs,
    instructions,
    instructionsPath,
    requiredHooks,
    ciWorkflowCustomization: ciConfig?.workflowCustomization ?? {},
    resumeState: options.operation === 'resume' ? before.data : null,
  };
}

function setupPrompt(request, { retry = false } = {}) {
  let operation = request.operation;
  if (retry) {
    const progress = readJournal(projectPath(request.projectRoot, request.journalPath));
    if (
      !progress ||
      progress.digest === request.before?.digest ||
      progress.data.workflowStatus === 'completed' ||
      !progress.data.run_id ||
      (progress.data.run_id === request.before?.data.run_id && request.operation !== 'resume') ||
      progress.data.setup_scope !== request.scope ||
      progress.data.setup_operation !== request.savedOperation
    )
      throw problem('Retry has no recoverable progress from this invocation; refusing to adopt prior history.');
    if (progress.data.hooks_started?.some((key) => !progress.data.hooks_completed?.includes(key)))
      throw problem('Retry has an uncertain started hook; explicit operator recovery is required.');
    request.resumeState ??= progress.data;
    if (request.resumeState.run_id !== progress.data.run_id) throw problem('Retry replaced the saved run_id');
    operation = 'resume';
  }
  return [
    `Run the framework and CI setup skill at ${JSON.stringify(request.skillRoot)}. Read its SKILL.md, setup-routing.md, setup-state.md and applicable step files completely.`,
    `Project root: ${JSON.stringify(request.projectRoot)}. Knowledge root: ${JSON.stringify(path.join(request.skillRoot, '..', 'bmod-tea', 'knowledge'))}.`,
    `This is a headless ${operation} request. Explicit setup_scope: ${request.scope}. Preserve the original operation and ledger when resuming.`,
    'Configuration has been resolved by the CLI. This snapshot fulfills activation configuration loading, including package defaults when no project config exists. Treat it as authoritative for core and modules.tea values. Apply applicable framework and CI workflow customizations using the skill rules; no configuration file needs to be created.',
    JSON.stringify(request.config.configSnapshot, null, 2),
    `Canonical workflow customization: ${JSON.stringify(request.config.workflowCustomization ?? {})}. CI workflow customization: ${JSON.stringify(request.ciWorkflowCustomization)}. Required hook instructions and stable ledger keys: ${JSON.stringify(request.requiredHooks)}.`,
    request.operation === 'resume'
      ? 'Restore the exact phase targets, selected reports and requested edits from the saved journal. New artifact selection is not part of Resume.'
      : `Exact input artifacts: ${JSON.stringify(request.inputs)}.`,
    request.instructions
      ? `Requested work:\n${request.instructions}`
      : 'Create the setup requested by this scope, or continue the saved operation.',
    'Proceed through authorized ordinary checkpoints using the observed project and configured preferences. Use sequential execution; do not launch paid agents.',
    'A missing framework during CI-only Create requires consent: record the unresolved offer and halt with an incomplete result. Explicit both scope authorizes framework setup.',
    'Preserve existing application files. Follow the skill policy for existing framework and pipeline reuse. Do not replace an existing pipeline without explicit instructions.',
    'Execute the actual frozen-contract test commands before Create completion. Failed or unavailable execution keeps Create incomplete. Validate records FAIL/WARN as report outcomes and completes its report without repairs.',
    `Persist the shared journal at ${JSON.stringify(request.journalPath)} and all required per-phase artifacts. Complete applicable hooks through their durable ledger.`,
    'Print a concise summary of files and actual checks. Agent exit success alone does not establish setup completion.',
  ].join('\n\n');
}

/** Check the skill-owned journal and artifacts. Completion is an operation outcome, separate from Validate quality. */
function inspectCompletion(request, { evidenceDir, timeoutMs = 1_200_000 } = {}) {
  const journal = readJournal(projectPath(request.projectRoot, request.journalPath));
  const issues = [];
  if (!journal) return { completed: false, issues: ['The setup journal was not written'], journal: null, artifacts: [] };
  const state = journal.data;
  if (state.workflowStatus !== 'completed') issues.push(`Setup journal is ${state.workflowStatus ?? 'missing workflowStatus'}`);
  if (state.setup_scope !== request.scope) issues.push(`Journal scope ${state.setup_scope} does not match ${request.scope}`);
  if (state.setup_operation !== request.savedOperation)
    issues.push(`Journal operation ${state.setup_operation} does not match ${request.savedOperation}`);
  if (!state.run_id || typeof state.run_id !== 'string') issues.push('Setup journal has no run_id');
  if (request.operation !== 'resume' && request.before && state.run_id === request.before.data.run_id)
    issues.push('A fresh operation reused the preceding run_id');
  if (request.resumeState) {
    if (state.run_id !== request.resumeState.run_id) issues.push('Resume replaced the frozen run_id');
    const preserves = (saved, current) => {
      if (Array.isArray(saved)) return JSON.stringify(saved) === JSON.stringify(current);
      if (saved && typeof saved === 'object') return current && Object.keys(saved).every((key) => preserves(saved[key], current[key]));
      return saved === current;
    };
    if (!preserves(request.resumeState.contract ?? {}, state.contract)) issues.push('Resume changed the frozen contract');
    for (const key of request.resumeState.hooks_started ?? [])
      if (
        !state.hooks_started?.includes(key) ||
        !state.hooks_completed?.includes(key) ||
        state.hook_instructions?.[key] !== request.resumeState.hook_instructions?.[key]
      )
        issues.push(`Resume discarded or changed saved hook ${key}`);
  }
  if (!Array.isArray(state.hooks_started) || !Array.isArray(state.hooks_completed)) issues.push('Setup journal is missing its hook ledger');
  else if (state.hooks_started.some((key) => !state.hooks_completed.includes(key))) issues.push('Setup journal contains unfinished hooks');
  for (const [key, instruction] of Object.entries(request.requiredHooks)) {
    if (!state.hooks_started?.includes(key) || !state.hooks_completed?.includes(key) || state.hook_instructions?.[key] !== instruction)
      issues.push(`Configured hook ${key} lacks its exact instruction and completed lifecycle`);
  }
  const phases = request.scope === 'both' ? ['framework', 'ci'] : [request.scope];
  const artifacts = [request.journalPath];
  for (const phase of phases) {
    if (state.phase_status?.[phase] !== 'completed') issues.push(`${phase} phase is incomplete`);
    const createTargets =
      phase === 'framework'
        ? [
            ...(state.contract?.config_paths ?? []),
            ...(state.contract?.test_directories ?? []),
            ...(state.contract?.test_dir ? [state.contract.test_dir] : []),
          ]
        : [state.contract?.pipeline_target ?? state.pipeline_target].filter(Boolean);
    const references =
      request.savedOperation === 'validate'
        ? state.validation_reports?.[phase]
        : request.savedOperation === 'create'
          ? [...new Set([...createTargets, ...(state.phase_targets?.[phase] ?? [])])]
          : state.phase_targets?.[phase];
    const paths =
      typeof references === 'string' ? [references] : Array.isArray(references) ? references : references?.path ? [references.path] : [];
    if (paths.length === 0)
      issues.push(`${phase} phase names no ${request.savedOperation === 'validate' ? 'validation report' : 'target artifacts'}`);
    for (const file of paths) {
      const resolved = projectPath(request.projectRoot, file.replaceAll('{test_artifacts}', request.artifactsRoot));
      if (fs.existsSync(resolved)) {
        artifacts.push(resolved);
      } else {
        issues.push(`Missing ${phase} artifact: ${file}`);
      }
    }
  }
  if (request.savedOperation === 'create') {
    const testCommands = state.contract?.test_commands ?? state.contract?.local_test_commands ?? state.contract?.local_commands;
    if (
      !Array.isArray(testCommands) ||
      testCommands.length === 0 ||
      testCommands.some((command) => typeof command !== 'string' || !command.trim())
    )
      issues.push('Create journal has no valid frozen test commands');
    if (phases.includes('ci')) {
      const pipeline = state.contract?.pipeline_target ?? state.pipeline_target;
      if (typeof pipeline === 'string') {
        const resolved = projectPath(request.projectRoot, pipeline);
        if (fs.existsSync(resolved)) {
          artifacts.push(resolved);
        } else {
          issues.push(`Missing pipeline: ${pipeline}`);
        }
      } else {
        issues.push('Create journal has no CI pipeline target');
      }
    }
  }
  if (request.savedOperation === 'create' && phases.includes('framework') && issues.length === 0) {
    const directories = [...(state.contract?.test_directories ?? []), ...(state.contract?.test_dir ? [state.contract.test_dir] : [])];
    const roots =
      directories.length > 0
        ? directories
        : (state.phase_targets?.framework ?? []).filter((file) => !(state.contract?.config_paths ?? []).includes(file));
    const seen = new Set();
    const hasCode = (file) => {
      const resolved = projectPath(request.projectRoot, file);
      if (seen.has(resolved)) return false;
      seen.add(resolved);
      const stat = fs.statSync(resolved);
      if (stat.isFile())
        return (
          stat.size > 0 &&
          /\.(?:[cm]?[jt]sx?|py|go|rs|rb|java|cs|kt|php|sh|feature|swift|cpp|c|ya?ml|dart|fsx?|vb|groovy|scala|exs?|clj[sc]?|lua|pl|robot)$/i.test(
            resolved,
          )
        );
      return stat.isDirectory() && fs.readdirSync(resolved).some((entry) => hasCode(path.join(resolved, entry)));
    };
    if (!roots.some(hasCode)) issues.push('Create journal references no nonempty test source files');
  }
  const executions = [];
  if (request.savedOperation === 'create' && issues.length === 0) {
    const commands = state.contract.test_commands ?? state.contract.local_test_commands ?? state.contract.local_commands;
    for (const [index, command] of commands.entries()) {
      const shell = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh';
      const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-c', command];
      let result;
      let failure = null;
      try {
        result = runAgent('', {
          agent: 'custom',
          agentCommand: shell,
          agentArgs: args,
          cwd: request.projectRoot,
          timeout: timeoutMs,
          envPass: Object.keys(process.env).filter((key) => key !== 'NODE_TEST_CONTEXT'),
        });
      } catch (error) {
        failure = error;
        result = error;
      }
      const execution = {
        command,
        timeoutMs,
        exitCode: failure ? Number(failure.message.match(/exited with code (\d+)/)?.[1] ?? NaN) : 0,
        error: failure?.message ?? null,
        ...testExecutionEvidence(request.projectRoot, command, `${result.stdout ?? ''}\n${result.stderr ?? ''}`),
      };
      if (!Number.isFinite(execution.exitCode)) execution.exitCode = null;
      if (evidenceDir) {
        const prefix = path.join(evidenceDir, `verification-${index + 1}`);
        fs.writeFileSync(`${prefix}.stdout.txt`, result.stdout ?? '');
        fs.writeFileSync(`${prefix}.stderr.txt`, result.stderr ?? '');
        execution.stdout = `${prefix}.stdout.txt`;
        execution.stderr = `${prefix}.stderr.txt`;
      }
      executions.push(execution);
      if (failure) issues.push(`Frozen test command failed: ${command} (${failure.message})`);
      else if (!execution.runner || execution.passedTests < 1)
        issues.push(`Frozen command has no positive supported test execution evidence: ${command}`);
    }
    if (evidenceDir) fs.writeFileSync(path.join(evidenceDir, 'verification.json'), `${JSON.stringify(executions, null, 2)}\n`);
  }
  return { completed: issues.length === 0, issues, journal: state, artifacts: [...new Set(artifacts)], executions };
}

module.exports = {
  SKILL_NAME,
  SCOPES,
  OPERATIONS,
  projectPath,
  readJournal,
  prepareSetup,
  setupPrompt,
  inspectCompletion,
  protectResultPath,
};
