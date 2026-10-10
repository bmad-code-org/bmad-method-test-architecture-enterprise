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

function journalArtifactPaths(state) {
  const references = [];
  const add = (value) => {
    if (typeof value === 'string') references.push(value);
    else if (Array.isArray(value)) {
      for (const item of value) add(item);
    } else if (value?.path) add(value.path);
  };
  for (const phase of ['framework', 'ci']) {
    add(state?.phase_targets?.[phase]);
    add(state?.phase_checkpoints?.[phase]);
    add(state?.validation_reports?.[phase]);
    add(state?.parallel_workers?.[phase]?.checkpoint);
  }
  for (const key of ['config_paths', 'test_directories', 'test_dir', 'pipeline_target', 'lockfile', 'artifact_paths'])
    add(state?.contract?.[key]);
  add(state?.pipeline_target);
  return references;
}

function validateJournalPaths(request, state) {
  for (const file of journalArtifactPaths(state))
    projectPath(request.projectRoot, file.replaceAll('{test_artifacts}', request.artifactsRoot));
}

/** Read simple shell invocations while preserving quoted and escaped argument boundaries. */
function shellInvocations(command) {
  const commands = [];
  let args = [];
  let word = '';
  let active = false;
  let quote = null;
  let escaped = false;
  let comment = false;
  const token = () => {
    if (active) args.push(word);
    word = '';
    active = false;
  };
  const finish = () => {
    token();
    if (args.length > 0) commands.push(args);
    args = [];
  };
  for (const character of command) {
    if (comment) {
      if (character === '\n') {
        comment = false;
        finish();
      }
      continue;
    }
    if (escaped) {
      if (character !== '\n') word += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'" && process.platform !== 'win32') {
      escaped = true;
      active = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else word += character;
      continue;
    }
    if (["'", '"', '`'].includes(character)) {
      quote = character;
      active = true;
      continue;
    }
    if (character === '#' && !active) {
      comment = true;
      continue;
    }
    if ([';', '&', '|', '\n'].includes(character)) {
      finish();
      continue;
    }
    if (/\s/.test(character)) {
      token();
      continue;
    }
    word += character;
    active = true;
  }
  if (quote || escaped) return [];
  finish();
  return commands.map((parts) => {
    while (/^[A-Z_]\w*=/.test(parts[0] ?? '')) parts.shift();
    if (parts[0] === 'npx') {
      parts.shift();
      while (parts[0]?.startsWith('--')) parts.shift();
    } else if (['npm', 'pnpm'].includes(parts[0]) && parts[1] === 'exec') {
      parts.splice(0, 2);
      if (parts[0] === '--') parts.shift();
    }
    if (parts[0]) parts[0] = path.basename(parts[0]);
    return parts;
  });
}

/** Expand package scripts from their actual directory, including monorepo prefix flags. */
function commandInvocations(root, command, cwd = root, seen = new Set()) {
  const invocations = [];
  for (const parts of shellInvocations(command)) {
    if (parts[0] === 'cd' && parts[1]) {
      cwd = projectPath(root, path.resolve(cwd, parts[1]));
      continue;
    }
    invocations.push(parts.join(' '));
    if (['npm', 'pnpm', 'yarn'].includes(parts[0])) {
      let directory = cwd;
      const words = [];
      for (let index = 1; index < parts.length; index++) {
        const part = parts[index];
        if (['--prefix', '--cwd', '-C', '--dir'].includes(part)) {
          if (!parts[index + 1]) break;
          directory = projectPath(root, path.resolve(cwd, parts[++index]));
        } else if (/^--(?:prefix|cwd|dir)=/.test(part)) {
          directory = projectPath(root, path.resolve(cwd, part.slice(part.indexOf('=') + 1)));
        } else if (part === '--') break;
        else if (!part.startsWith('-')) words.push(part);
      }
      const name = words[0] === 'run' ? words[1] : words[0];
      if (!name || ['exec', 'dlx', 'install', 'ci', 'add'].includes(name)) continue;
      const manifest = path.join(directory, 'package.json');
      const identity = `${manifest}:${name}`;
      if (seen.has(identity) || seen.size >= 16 || !fs.existsSync(manifest)) continue;
      seen.add(identity);
      const script = JSON.parse(fs.readFileSync(manifest, 'utf8')).scripts?.[name];
      if (typeof script === 'string') invocations.push(...commandInvocations(root, script, directory, seen));
    } else if (['bash', 'sh'].includes(parts[0]) && parts[1] && !parts[1].startsWith('-')) {
      const file = projectPath(root, path.resolve(cwd, parts[1]));
      if (!seen.has(file) && seen.size < 16 && fs.existsSync(file)) {
        seen.add(file);
        invocations.push(...commandInvocations(root, fs.readFileSync(file, 'utf8'), cwd, seen));
      }
    }
  }
  return invocations;
}

/** Recognize every native summary, so shell success cannot mask a later suite failure. */
function testExecutionEvidence(root, command, output) {
  const invocations = commandInvocations(root, command);
  const patterns = [
    ['node-test', /^node(?:\.exe)?\s+(?:--[\w-]+(?:=\S+)?\s+)*--test(?:[=\s]|$)/, /^(?:#|ℹ) pass (\d+)\s*$/],
    ['unittest', /^python[\d.]*\s+(?:-[A-Za-z]+\s+)*-m\s+unittest\b/, /Ran (\d+) tests?\b/],
    ['pytest', /^(?:pytest|python[\d.]*\s+(?:-[A-Za-z]+\s+)*-m\s+pytest)\b/, /(?:^|\s)(\d+) passed\b/],
    ['playwright', /^playwright\s+test\b/, /(?:^|\s)(\d+) passed\b/],
    ['vitest', /^vitest\b/, /Tests\s+(\d+) passed\b/],
    ['jest', /^jest\b/, /Tests:\s+(\d+) passed\b/],
    ['cypress', /^cypress\s+run\b/, /Passing:\s*(\d+)/],
    ['go', /^go\s+test\b/, /--- PASS:/],
    ['cargo', /^cargo\s+test\b/, /test result: ok\. (\d+) passed/],
    ['dotnet', /^dotnet\s+test\b/, /Passed:\s*(\d+)/],
    ['phpunit', /^phpunit\b/, /OK \((\d+) tests?/],
  ];
  for (const [runner, detector, summary] of patterns) {
    if (!invocations.some((invocation) => detector.test(invocation))) continue;
    const plain = stripVTControlCharacters(output);
    const numeric = (pattern) => [...plain.matchAll(pattern)].reduce((total, item) => total + Number(item[1]), 0);
    const matches = [...plain.matchAll(new RegExp(summary.source, 'gm'))];
    let passedTests = runner === 'go' ? matches.length : matches.reduce((total, match) => total + Number(match[1]), 0);
    if (runner === 'unittest') passedTests -= numeric(/skipped=(\d+)/g);
    let failedTests =
      numeric(/(?:\b(\d+) (?:failed|failing)\b)/g) +
      numeric(/\b(?:Failed|Failing|Failures):\s*(\d+)/g) +
      numeric(/failures=(\d+)/g) +
      numeric(/^(?:#|ℹ) fail (\d+)\s*$/gm);
    let errors =
      numeric(/\b(\d+) (?:errors?|interrupted|timed out|cancelled)\b/g) +
      numeric(/\bErrors:\s*(\d+)/g) +
      numeric(/errors=(\d+)/g) +
      numeric(/^(?:#|ℹ) cancelled (\d+)\s*$/gm);
    let summaryComplete = matches.length > 0;
    if (runner === 'node-test') {
      const summaries = plain.split(/(?=^(?:#|ℹ) tests \d+\s*$)/m).slice(1);
      const required = ['tests', 'pass', 'fail', 'cancelled', 'skipped'];
      summaryComplete =
        summaries.length > 0 &&
        summaries.every((block) => {
          const count = (key) => block.match(new RegExp(`^(?:#|ℹ) ${key} (\\d+)\\s*$`, 'm'))?.[1];
          return (
            required.every((key) => count(key) !== undefined) &&
            Number(count('tests')) === Number(count('pass')) + Number(count('fail')) + Number(count('cancelled')) + Number(count('skipped'))
          );
        });
    }
    if (runner === 'go' && /(?:--- FAIL:|^FAIL\s)/m.test(plain)) failedTests++;
    if (runner === 'unittest' && (plain.match(/^OK(?:\s|$)/gm)?.length ?? 0) !== matches.length) summaryComplete = false;
    if (runner === 'unittest') passedTests = Math.max(0, passedTests - failedTests - errors);
    return { runner, passedTests, failedTests, errors, summaryComplete };
  }
  return { runner: null, passedTests: 0, failedTests: 0, errors: 0, summaryComplete: false };
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

/** Snapshot exact selected artifacts, including directory inputs, without following escaping links. */
function artifactDigest(root, file, ancestors = new Set()) {
  const resolved = projectPath(root, file);
  const stat = fs.statSync(resolved);
  const hash = createHash('sha256').update(String(stat.mode));
  if (stat.isFile()) return hash.update(fs.readFileSync(resolved)).digest('hex');
  if (!stat.isDirectory()) throw problem(`Input artifact must be a regular file or directory: ${file}`);
  if (ancestors.has(resolved)) throw problem(`Input artifact contains a directory-link cycle: ${file}`);
  const next = new Set([...ancestors, resolved]);
  for (const name of fs.readdirSync(resolved).sort()) hash.update(name).update(artifactDigest(root, path.join(resolved, name), next));
  return hash.digest('hex');
}

/** Inspect platform-owned executable jobs and their relationship to the frozen test command. */
function inspectPipeline(root, file, state) {
  if (!fs.statSync(file).isFile()) return 'Pipeline must be a regular file';
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return 'Pipeline is empty';
  const platform =
    state.contract?.ci_platform ??
    state.ci_platform ??
    (file.includes(`${path.sep}.github${path.sep}`)
      ? 'github-actions'
      : path.basename(file).startsWith('.gitlab-ci')
        ? 'gitlab-ci'
        : path.basename(file) === 'Jenkinsfile'
          ? 'jenkins'
          : file.includes(`${path.sep}.circleci${path.sep}`)
            ? 'circle-ci'
            : file.includes(`${path.sep}.harness${path.sep}`)
              ? 'harness'
              : 'azure-devops');
  const commands = [];
  const add = (value) => {
    if (typeof value === 'string' && value.trim()) commands.push(value);
  };
  const walkSteps = (steps) => {
    for (const step of steps ?? []) {
      if (!step || typeof step !== 'object' || step.if === false || step.condition === false) continue;
      for (const key of ['run', 'script', 'bash', 'pwsh', 'powershell'])
        add(typeof step[key] === 'object' ? step[key]?.command : step[key]);
      if (step.step?.type === 'Run') add(step.step.spec?.command);
    }
  };
  try {
    if (platform === 'jenkins') {
      if (!/\bpipeline\s*\{/.test(text) || !/\bstages\s*\{/.test(text)) return 'Jenkins pipeline has no executable stages';
      for (const match of text.matchAll(/\b(?:sh|bat|powershell)\s*(?:\(\s*)?(['"])([\s\S]*?)\1/g)) add(match[2]);
    } else {
      const config = yaml.load(text);
      if (!config || typeof config !== 'object' || Array.isArray(config)) return 'Pipeline YAML must contain a mapping';
      switch (platform) {
        case 'github-actions': {
          if (!config.on || !config.jobs || typeof config.jobs !== 'object' || Array.isArray(config.jobs))
            return 'GitHub workflow has no triggers or jobs';
          for (const job of Object.values(config.jobs)) {
            if (job?.if === false) continue;
            if (job?.uses) continue;
            if (!job?.['runs-on'] || !Array.isArray(job.steps)) continue;
            walkSteps(job.steps);
          }

          break;
        }
        case 'gitlab-ci': {
          const reserved = new Set([
            'stages',
            'workflow',
            'default',
            'variables',
            'include',
            'image',
            'services',
            'before_script',
            'after_script',
            'cache',
          ]);
          for (const [name, job] of Object.entries(config)) {
            if (reserved.has(name) || name.startsWith('.') || !job || typeof job !== 'object') continue;
            for (const command of Array.isArray(job.script) ? job.script : [job.script]) add(command);
          }

          break;
        }
        case 'circle-ci': {
          const jobs = Object.values(config.workflows ?? {}).flatMap((workflow) => workflow?.jobs ?? []);
          for (const selected of jobs) {
            const name = typeof selected === 'string' ? selected : Object.keys(selected ?? {})[0];
            walkSteps(config.jobs?.[name]?.steps);
          }

          break;
        }
        case 'azure-devops': {
          walkSteps(config.steps);
          for (const job of [...(config.jobs ?? []), ...(config.stages ?? []).flatMap((stage) => stage.jobs ?? [])]) walkSteps(job.steps);

          break;
        }
        case 'harness': {
          for (const stage of config.pipeline?.stages ?? []) walkSteps(stage.stage?.spec?.execution?.steps);

          break;
        }
        default: {
          return `Unsupported pipeline platform: ${platform}`;
        }
      }
    }
  } catch (error) {
    return `Pipeline syntax or job structure is invalid: ${error.message}`;
  }
  if (commands.length === 0) return 'Pipeline has no runnable test steps';
  const frozen =
    state.contract?.ci_test_commands ??
    state.contract?.test_commands ??
    state.contract?.local_test_commands ??
    state.contract?.local_commands ??
    [];
  const actual = commands.flatMap((command) => commandInvocations(root, command));
  const matches = (candidate, target) => candidate === target || candidate.startsWith(`${target} `);
  if (
    frozen.length === 0 ||
    !frozen.every((command) => commandInvocations(root, command).some((target) => actual.some((candidate) => matches(candidate, target))))
  )
    return 'Pipeline has no runnable step for a frozen test command';
  return null;
}

/** Completion must account for the caller-selected Edit and Validate scope. */
function inspectSelectedOperation(request, state, issues) {
  if (!['edit', 'validate'].includes(request.savedOperation)) return;
  const phases = request.scope === 'both' ? ['framework', 'ci'] : [request.scope];
  const resolve = (value) => projectPath(request.projectRoot, value.replaceAll('{test_artifacts}', request.artifactsRoot));
  const targets = phases.flatMap((phase) => state.phase_targets?.[phase] ?? []).map(resolve);
  const expected =
    request.operation === 'resume'
      ? phases.flatMap((phase) => request.resumeState.phase_targets?.[phase] ?? []).map(resolve)
      : request.inputs;
  const same = (left, right) => JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
  if (expected.length === 0 || !same(targets, expected))
    issues.push(`${request.savedOperation} did not preserve the exact selected artifacts`);
  if (request.savedOperation === 'validate') {
    const validated = [];
    for (const phase of phases) {
      const references = state.validation_reports?.[phase];
      const paths =
        typeof references === 'string' ? [references] : Array.isArray(references) ? references : [references?.path].filter(Boolean);
      for (const reference of paths) {
        const report = resolve(reference);
        if (!fs.existsSync(report)) continue;
        const stat = fs.statSync(report);
        if (!stat.isFile() || stat.size === 0) {
          issues.push(`Validation report is not a nonempty regular file: ${reference}`);
          continue;
        }
        let owned;
        try {
          owned = readJournal(report);
        } catch (error) {
          issues.push(`Validation report is malformed: ${reference} (${error.message})`);
          continue;
        }
        if (
          !owned ||
          owned.data.run_id !== state.run_id ||
          !['PASS', 'WARN', 'FAIL'].includes(owned.data.status) ||
          !owned.text.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').trim() ||
          !Array.isArray(owned.data.validated_artifacts)
        ) {
          issues.push(`Validation report lacks completed same-run ownership and selected artifact metadata: ${reference}`);
          continue;
        }
        if (request.operation !== 'resume' && stat.mtimeMs < request.startedAtMs - 1)
          issues.push(`Validation report predates this invocation: ${reference}`);
        const selections = owned.data.validated_artifacts.map(resolve);
        if (!same(selections, (state.phase_targets?.[phase] ?? []).map(resolve)))
          issues.push(`Validation report covers a different selected scope: ${reference}`);
        validated.push(...selections);
      }
    }
    if (!same(validated, expected)) issues.push('Validation reports do not account for every selected artifact');
    for (const [file, digest] of request.inputDigests) {
      if (artifactDigest(request.projectRoot, file) !== digest) issues.push(`Validate changed a selected input: ${file}`);
    }
  } else {
    const outcomes = phases.flatMap((phase) => state.edit_applied?.[phase] ?? []);
    const savedOutcomes = phases.flatMap((phase) => request.resumeState?.edit_applied?.[phase] ?? []);
    for (const file of expected) {
      const outcome = outcomes.find((entry) => entry && typeof entry.path === 'string' && resolve(entry.path) === file);
      const savedOutcome = savedOutcomes.find((entry) => entry && typeof entry.path === 'string' && resolve(entry.path) === file);
      const before = request.inputDigests.get(file) ?? savedOutcome?.before_sha256 ?? outcome?.before_sha256;
      const after = artifactDigest(request.projectRoot, file);
      if (
        savedOutcome &&
        ['applied', 'noop'].includes(savedOutcome.status) &&
        ['status', 'before_sha256', 'after_sha256', 'reason'].some((key) => savedOutcome[key] !== outcome?.[key])
      )
        issues.push(`Resume changed a completed Edit outcome: ${file}`);
      if (
        !outcome ||
        !/^[a-f0-9]{64}$/.test(before ?? '') ||
        outcome.before_sha256 !== before ||
        outcome.after_sha256 !== after ||
        !(
          (outcome.status === 'applied' && before !== after) ||
          (outcome.status === 'noop' && before === after && typeof outcome.reason === 'string' && outcome.reason.trim())
        )
      )
        issues.push(`Edit has no verified applied change or explicit no-op outcome: ${file}`);
    }
  }
}

function prepareSetup({ projectRoot, skillRoot, config, options }) {
  if (!SCOPES.includes(options.scope)) throw problem(`--scope must be ${SCOPES.join('|')}`);
  if (!OPERATIONS.includes(options.operation)) throw problem(`--operation must be ${OPERATIONS.join('|')}`);
  const artifactsRoot = projectPath(projectRoot, config.configSnapshot.modules.tea.test_artifacts);
  const journalPath = projectPath(projectRoot, path.join(artifactsRoot, 'framework', 'setup-run-progress.md'));
  const before = readJournal(journalPath);
  const inputs = [...new Set((options.input ?? []).map((file) => projectPath(projectRoot, file)))];
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
  const request = {
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
    startedAtMs: Date.now(),
    inputDigests: new Map(inputs.map((file) => [file, artifactDigest(projectRoot, file)])),
  };
  if (before) validateJournalPaths(request, before.data);
  return request;
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
    'Create CI completion requires a valid pipeline with runnable jobs that execute its frozen test command.',
    'For Edit and Validate preserve exact selected artifacts in phase_targets. Validate reports are nonempty regular Markdown files with YAML frontmatter containing run_id, status PASS/WARN/FAIL and validated_artifacts listing the exact phase targets; fresh Validate writes a new same-run report and preserves its selected inputs.',
    `For Edit record edit_applied.<phase> as an array of {path,status,before_sha256,after_sha256,reason}. status is applied for a verified change or noop for an unchanged artifact with an explicit reason. Use these CLI-observed input digests (including permissions): ${JSON.stringify(Object.fromEntries(request.inputDigests))}. The digest is SHA-256 of the file's numeric stat.mode followed by its raw bytes; directories hash numeric mode followed by each sorted child name and child digest.`,
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
  validateJournalPaths(request, state);
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
    for (const field of ['phase_targets', 'phase_checkpoints', 'validation_reports', 'edit_requests']) {
      for (const phase of ['framework', 'ci']) {
        const saved = request.resumeState[field]?.[phase];
        if (saved && (!Array.isArray(saved) || saved.length > 0) && !preserves(saved, state[field]?.[phase]))
          issues.push(`Resume changed saved ${field}.${phase}`);
      }
    }
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
    if (request.savedOperation === 'create' && state.phase_checkpoints?.[phase]) paths.push(state.phase_checkpoints[phase]);
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
          const pipelineIssue = inspectPipeline(request.projectRoot, resolved, state);
          if (pipelineIssue) issues.push(pipelineIssue);
        } else {
          issues.push(`Missing pipeline: ${pipeline}`);
        }
      } else {
        issues.push('Create journal has no CI pipeline target');
      }
    }
  }
  inspectSelectedOperation(request, state, issues);
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
      else if (!execution.runner || !execution.summaryComplete || execution.passedTests < 1)
        issues.push(`Frozen command has no positive supported test execution evidence: ${command}`);
      else if (execution.failedTests > 0 || execution.errors > 0)
        issues.push(`Frozen native runner reports failed or cancelled tests: ${command}`);
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
