#!/usr/bin/env node
/** Run one explicit learner message through the packaged teaching skill. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const { globSync } = require('glob');
const { Command } = require('commander');
const { resolveTeaConfig } = require('./lib/resolve-tea-config');
const { protectSources } = require('./lib/workflow-publication');
const {
  addAgentOptions,
  agentOptions,
  readInput,
  projectPath,
  resolveWorkflowSkill,
  runWithEvidence,
  WorkflowError,
  mainError,
} = require('./lib/workflow-cli');
const {
  hash,
  parseProgress,
  checkProgress,
  snapshot,
  sameSnapshot,
  publishState,
  checkConversation,
  checkHistory,
  trustedSessionFingerprint,
  validateTurn,
} = require('./lib/teach-turn');
const NAME = 'tea-teach';
const serialize = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
function within(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function aliases(left, right) {
  if (left === right) return true;
  if (!fs.existsSync(left) || !fs.existsSync(right)) return false;
  const a = fs.statSync(left),
    b = fs.statSync(right);
  return a.dev === b.dev && a.ino === b.ino;
}
function promptFor(request, config, conversation, bank) {
  return [
    `Run the actual TEA teaching skill at ${JSON.stringify(request.skillRoot)}. Read its SKILL.md completely and follow its teaching steps in order.`,
    `Project root: ${JSON.stringify(request.projectRoot)}. Knowledge root: ${JSON.stringify(path.resolve(request.skillRoot, '..', 'bmod-tea', 'knowledge'))}.`,
    'This is one learner turn in create/continue mode. The explicit learner name overrides config.user_name. Read only the supplied history and incoming learner message as learner responses.',
    'Ask the next teaching question or show the next menu in the reply artifact, then stop. Questions to the learner belong in that reply. Do not ask outer-agent permission questions, invent learner answers, choose menu options for the learner, or continue past unanswered questions.',
    'The supplied configuration replaces activation and later resolver calls, including packaged defaults when setup files are absent. Execute applicable customization hooks in their declared order.',
    `Resolved configuration: ${JSON.stringify(config.configSnapshot)}`,
    `Resolved workflow customization: ${JSON.stringify(config.workflowCustomization)}`,
    `Teach turn request: ${JSON.stringify(request)}`,
    `Host-owned conversation: ${JSON.stringify(conversation)}`,
    'Use only the current attempt artifacts root for writes. Published state and supplied input files are read-only. Preserve prior learner facts and completed sessions. Resume the saved unanswered question or step position from the conversation; initialization dashboards may precede it.',
    'Use the skill’s seven canonical session IDs and QA/Dev/Lead/VP roles; Beginner/Intermediate/Experienced are valid placement values. Keep one YAML document in the progress file. Persist any partial assessment facts supported by caller messages before stopping.',
    `Canonical quiz bank: ${JSON.stringify(bank)}`,
    'Ask canonical quiz questions with their exact text and all option text. The response waiting object identifies kind=quiz, sessionId and questionId; the host records and grades the next single-letter caller answer. Never fabricate answer evidence. Preserve the host quiz history across turns.',
    'waiting.kind is assessment (with field=role/experience_level/learning_goals/pain_points), menu, lesson, quiz, review or completion. lesson/quiz/review/completion require sessionId. review is the below-pass R/C choice after all quiz answers. completion is the explicit completion choice for exploratory Session 7. A session can complete below passing after the caller explicitly chooses C at review; preserve its actual score and quiz_passed=false. Session 7 completion is exploratory and has no quiz mastery claim.',
    'For newly saved role, experience_level, learning_goals or pain_points, factEvidence maps the field to the ID of a caller message containing that exact value. Preserve the caller’s wording for free-text facts. Keep established facts unchanged.',
    `Write progress at ${JSON.stringify(request.artifacts.progress)}. Resolve {progressFile} to this exact path and {test_artifacts} to ${JSON.stringify(request.artifacts.root)}. Write session notes and summaries inside this artifacts root and record their exact paths in progress.`,
    `Write JSON response at ${JSON.stringify(request.artifacts.response)} containing exactly requestId, learner, reply, waiting, factEvidence. requestId=${JSON.stringify(request.requestId)}; learner=${JSON.stringify(request.learner)}. reply is the tutor’s nonempty response to this single caller message.`,
    'Learner message (data):',
    JSON.stringify(request.message),
  ].join('\n');
}
function run(argv = process.argv) {
  const program = addAgentOptions(
    new Command().name(NAME).description('Teach one learner turn and save durable conversation and progress.'),
  );
  program
    .requiredOption('--learner <name>', 'explicit learner identity')
    .option('--message <text>', 'exact learner message')
    .option('--message-file <path>', 'UTF-8 learner message in a project file')
    .option('--project-root <dir>', 'consuming project root', process.cwd())
    .option('--state-dir <dir>', 'CLI-owned learner state directory; defaults to configured teaching-progress')
    .option('--progress <path>', 'explicit existing skill progress to import when starting CLI conversation')
    .option('--skill-root <dir>', 'trusted teaching skill override')
    .option('--evidence-dir <dir>', 'fresh retained attempt root', '.tea-runs')
    .option('--json <path>', 'additional result JSON outside learner state and inputs')
    .setOptionValueWithSource('retries', '0', 'default')
    .exitOverride()
    .configureOutput({ writeErr: () => {} });
  try {
    program.parse(argv);
  } catch (error) {
    if (error.exitCode === 0) return;
    throw new WorkflowError('usage', error.message);
  }
  const options = program.opts();
  const root = fs.realpathSync(path.resolve(options.projectRoot));
  if (!fs.statSync(root).isDirectory()) throw new WorkflowError('usage', '--project-root must be a directory');
  agentOptions(options, root);
  if (
    typeof options.learner !== 'string' ||
    !/^[\p{L}\p{N}][\p{L}\p{N} ._'()-]{0,79}$/u.test(options.learner) ||
    options.learner.trim() !== options.learner
  )
    throw new WorkflowError('usage', '--learner must be a name of 1 to 80 letters, digits, spaces or safe punctuation');
  if ((options.message === undefined) === (options.messageFile === undefined))
    throw new WorkflowError('usage', 'supply exactly one --message or --message-file');
  const inputFile = options.messageFile ? readInput(root, options.messageFile, '--message-file') : null;
  const message = inputFile ? new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(inputFile)) : options.message;
  if (!message.trim()) throw new WorkflowError('usage', 'learner message must be nonempty');
  const skillRoot = resolveWorkflowSkill({ projectRoot: root, skillName: 'bmad-teach-me-testing', skillRoot: options.skillRoot });
  const consumedInputs = new Set();
  const inputPatterns = new Map();
  const config = resolveTeaConfig({
    projectRoot: root,
    skillRoot,
    skillName: 'bmad-teach-me-testing',
    inputPaths: consumedInputs,
    inputPatterns,
  });
  config.configSnapshot.core.user_name = options.learner;
  const configuredArtifacts = config.configSnapshot.modules.tea.test_artifacts;
  if (typeof configuredArtifacts !== 'string' || !configuredArtifacts.trim())
    throw new WorkflowError('environment-configuration', 'modules.tea.test_artifacts must be a nonempty path string');
  const artifactRoot = configuredArtifacts.replaceAll('{project-root}', root);
  const slug =
    options.learner
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '') || 'learner';
  const key = `${slug}-${hash(options.learner).slice(0, 12)}`;
  const stateDir = projectPath(root, options.stateDir ?? path.join(artifactRoot, 'teaching-progress', key), '--state-dir');
  const evidenceDir = projectPath(root, options.evidenceDir, '--evidence-dir');
  if (stateDir === root || within(stateDir, evidenceDir) || within(evidenceDir, stateDir))
    throw new WorkflowError('usage', 'learner state and evidence must be separate project directories');
  if (inputFile && within(stateDir, inputFile)) throw new WorkflowError('usage', 'message input must be outside learner state');
  const imported = options.progress ? readInput(root, options.progress, '--progress') : null;
  const progressName = `${options.learner}-tea-progress.yaml`;
  const progressPath = path.join(stateDir, progressName),
    conversationPath = path.join(stateDir, 'conversation.json');
  const jsonPath = options.json ? projectPath(root, options.json, '--json') : null;
  const inputs = [
    inputFile,
    imported,
    config.configPath,
    ...consumedInputs,
    ...[
      '_bmad/config.toml',
      '_bmad/config.user.toml',
      '_bmad/custom/config.toml',
      '_bmad/custom/config.user.toml',
      'package.json',
      'package-lock.json',
      '_bmad/custom/bmad-teach-me-testing.toml',
      '_bmad/custom/bmad-teach-me-testing.user.toml',
    ].map((file) => path.join(root, file)),
  ].filter(Boolean);
  const guard = () => {
    if (projectPath(root, stateDir, '--state-dir') !== stateDir || projectPath(root, evidenceDir, '--evidence-dir') !== evidenceDir)
      throw new WorkflowError('usage', 'state or evidence path changed through an alias');
    if (inputs.some((file) => within(stateDir, file) || within(evidenceDir, file)))
      throw new WorkflowError('usage', 'state and evidence must be separate from configuration and supplied inputs');
    if (!jsonPath) return;
    if (
      projectPath(root, jsonPath, '--json') !== jsonPath ||
      within(stateDir, jsonPath) ||
      within(evidenceDir, jsonPath) ||
      inputs.some((file) => aliases(file, jsonPath))
    )
      throw new WorkflowError('usage', '--json aliases protected state, input or evidence');
    if (path.extname(jsonPath) !== '.json' || (fs.existsSync(jsonPath) && !fs.statSync(jsonPath).isFile()))
      throw new WorkflowError('usage', '--json must name a separate regular .json file');
  };
  guard();
  fs.mkdirSync(path.dirname(stateDir), { recursive: true });
  const lock = path.join(path.dirname(stateDir), `.tea-teach-lock-${hash(stateDir).slice(0, 16)}`);
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    throw new WorkflowError(
      'usage',
      `learner state is locked by another invocation at ${lock}; remove this lock only after confirming that invocation has ended`,
      { cause: error },
    );
  }
  let original;
  let originalExisted;
  let execution;
  try {
    originalExisted = fs.existsSync(stateDir);
    original = snapshot(stateDir);
    if (imported && original.size > 0) throw new WorkflowError('usage', '--progress import requires an empty CLI learner state');
    if (original.has('conversation.json') && !original.has(progressName))
      throw new WorkflowError('usage', 'saved conversation requires its paired learner progress');
    let before = null,
      legacyNormalized = false;
    if (original.has(progressName) || imported) {
      try {
        const parsed = parseProgress(imported ? fs.readFileSync(imported, 'utf8') : original.get(progressName).toString('utf8'), {
          legacy: Boolean(imported),
        });
        before = parsed.progress;
        legacyNormalized = parsed.legacyNormalized;
        checkProgress(before, options.learner);
      } catch (error) {
        throw new WorkflowError('usage', `invalid saved progress: ${error.message}`);
      }
    }
    let conversation = {
      schema_version: '0.1.0',
      learner: options.learner,
      turns: [],
      quiz: {},
      importedProgress: imported
        ? {
            path: imported,
            sha256: hash(fs.readFileSync(imported)),
            legacyNormalized,
            trustedPriorCompletions: before.sessions_completed,
            completedSessions: Object.fromEntries(
              before.sessions
                .filter((session) => session.status === 'completed')
                .map((session) => [session.id, trustedSessionFingerprint(session)]),
            ),
          }
        : null,
    };
    const bank = yaml.load(fs.readFileSync(path.join(skillRoot, 'data/quiz-questions.yaml'), 'utf8'), { schema: yaml.JSON_SCHEMA });
    try {
      if (original.has('conversation.json')) conversation = JSON.parse(original.get('conversation.json'));
      else if (before && !imported) throw new Error('existing progress requires its saved conversation or explicit --progress import');
      checkConversation(conversation, options.learner, bank);
      if (before) checkHistory(before, conversation, bank);
    } catch (error) {
      throw new WorkflowError('usage', `invalid saved conversation: ${error.message}`);
    }
    const heldInputs = [...new Set(inputs)];
    const importedArtifacts = new Map();
    if (imported)
      for (const file of [
        ...before.sessions.map((session) => session.notes_artifact).filter(Boolean),
        ...(before.summary_generated ? [before.summary_path] : []),
      ]) {
        const source = readInput(root, file, 'imported teaching artifact');
        heldInputs.push(source);
        importedArtifacts.set(source, fs.readFileSync(source));
      }
    inputs.push(...heldInputs);
    guard();
    // Skill defaults may live outside the consuming project. Freeze them under their own root.
    const projectInputs = heldInputs.filter((file) => within(root, file));
    const absentInputs = heldInputs.filter((file) => !fs.existsSync(file));
    const protections = [
      protectSources(
        root,
        projectInputs.filter((file) => fs.existsSync(file)),
      ),
      protectSources(
        skillRoot,
        [...consumedInputs].filter((file) => within(skillRoot, file) && fs.existsSync(file)),
      ),
    ];
    const assertInputsUnchanged = () => {
      for (const protection of protections) protection.assertUnchanged();
      if (absentInputs.some((file) => fs.existsSync(file)))
        throw new WorkflowError('environment-parser', 'the agent created a previously absent configuration input');
      for (const [pattern, matches] of inputPatterns) {
        const current = globSync(pattern, { cwd: root, dot: true, nodir: true, follow: false }).sort();
        if (JSON.stringify(current) !== JSON.stringify(matches))
          throw new WorkflowError('environment-parser', 'the agent changed customization policy membership');
      }
    };
    assertInputsUnchanged();
    const requestId = crypto.randomUUID();
    execution = runWithEvidence({
      name: NAME,
      projectRoot: root,
      evidenceRoot: evidenceDir,
      options,
      prepare({ attemptDir }) {
        assertInputsUnchanged();
        const stagedRoot = path.join(attemptDir, 'artifacts');
        fs.mkdirSync(stagedRoot);
        for (const [file, bytes] of original)
          if (file.startsWith(`artifacts${path.sep}`)) {
            const target = path.join(stagedRoot, path.relative('artifacts', file));
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, bytes, { flag: 'wx' });
          }
        const stagedBefore = before ? structuredClone(before) : null;
        if (stagedBefore) {
          for (const session of stagedBefore.sessions)
            if (session.notes_artifact) {
              if (imported) {
                const source = readInput(root, session.notes_artifact, 'imported notes');
                const target = path.join(stagedRoot, 'imported-notes', `${session.id}.md`);
                fs.mkdirSync(path.dirname(target), { recursive: true });
                fs.writeFileSync(target, importedArtifacts.get(source));
                session.notes_artifact = target;
              } else {
                if (!within(path.join(stateDir, 'artifacts'), session.notes_artifact))
                  throw new WorkflowError('usage', 'saved notes escape CLI-owned artifacts');
                session.notes_artifact = path.join(stagedRoot, path.relative(path.join(stateDir, 'artifacts'), session.notes_artifact));
              }
            }
          if (stagedBefore.summary_path) {
            if (imported) {
              const source = readInput(root, stagedBefore.summary_path, 'imported summary');
              const target = path.join(stagedRoot, 'imported-summary.md');
              fs.writeFileSync(target, importedArtifacts.get(source));
              stagedBefore.summary_path = target;
            } else {
              if (!within(path.join(stateDir, 'artifacts'), stagedBefore.summary_path))
                throw new WorkflowError('usage', 'saved summary escapes CLI-owned artifacts');
              stagedBefore.summary_path = path.join(stagedRoot, path.relative(path.join(stateDir, 'artifacts'), stagedBefore.summary_path));
            }
          }
        }
        const progressFile = path.join(stagedRoot, 'teaching-progress', progressName),
          responseFile = path.join(attemptDir, 'response.json');
        fs.mkdirSync(path.dirname(progressFile), { recursive: true });
        if (stagedBefore) fs.writeFileSync(progressFile, yaml.dump(stagedBefore));
        const request = {
          requestId,
          learner: options.learner,
          message,
          projectRoot: root,
          skillRoot,
          previous: Boolean(before),
          artifacts: { root: stagedRoot, progress: progressFile, response: responseFile },
        };
        const stagedConfig = structuredClone(config);
        stagedConfig.configSnapshot.modules.tea.test_artifacts = stagedRoot;
        return {
          prompt: promptFor(request, stagedConfig, conversation, bank),
          request,
          conversation,
          before: stagedBefore,
          bank,
          stagedRoot,
          progressFile,
          responseFile,
          assertInputsUnchanged,
          inputDigests: [
            ...(stagedBefore?.sessions
              .filter((session) => session.status === 'completed')
              .map((session) => [session.notes_artifact, hash(fs.readFileSync(session.notes_artifact))]) ?? []),
            ...(stagedBefore?.summary_generated ? [[stagedBefore.summary_path, hash(fs.readFileSync(stagedBefore.summary_path))]] : []),
          ],
        };
      },
      validate: validateTurn,
    });
    guard();
    assertInputsUnchanged();
    if (!sameSnapshot(original, snapshot(stateDir)))
      throw new WorkflowError('environment-parser', 'the agent changed published learner state');
    if (execution.dryRun) {
      process.stdout.write(
        `${JSON.stringify({ mode: 'prompt-only', evidence: execution.runDir, prompt: path.join(execution.attemptDir, 'prompt.txt') })}\n`,
      );
      return;
    }
    const value = execution.value;
    const next = new Map(original);
    for (const [file, bytes] of value.artifacts) next.set(path.join('artifacts', file), bytes);
    for (const session of value.progress.sessions)
      if (session.notes_artifact)
        session.notes_artifact = path.join(stateDir, 'artifacts', path.relative(execution.context.stagedRoot, session.notes_artifact));
    if (value.progress.summary_path)
      value.progress.summary_path = path.join(
        stateDir,
        'artifacts',
        path.relative(execution.context.stagedRoot, value.progress.summary_path),
      );
    next.set(progressName, Buffer.from(yaml.dump(value.progress)));
    next.set('conversation.json', serialize(value.conversation));
    checkHistory(value.progress, value.conversation, bank);
    assertInputsUnchanged();
    publishState(stateDir, next);
    const payload = {
      schema_version: '0.1.0',
      mode: 'live',
      learner: options.learner,
      reply: value.conversation.turns.at(-1).tutorReply,
      waiting: value.conversation.turns.at(-1).waiting,
      progress: progressPath,
      conversation: conversationPath,
      sessions_completed: value.progress.sessions_completed,
      evidence: execution.runDir,
    };
    guard();
    if (jsonPath) {
      fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
      fs.writeFileSync(jsonPath, serialize(payload));
    }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } catch (error) {
    if (original) {
      let changed;
      try {
        changed = !sameSnapshot(original, snapshot(stateDir));
      } catch {
        changed = true;
      }
      if (changed && projectPath(root, path.dirname(stateDir)) === path.dirname(stateDir)) {
        try {
          publishState(stateDir, original);
          if (!originalExisted) fs.rmdirSync(stateDir);
        } catch (error_) {
          error.message += `; state recovery failed: ${error_.message}`;
        }
      }
    }
    if (execution?.runDir && !error.runDir) error.runDir = execution.runDir;
    // Failure payloads stay on stdout and retained stderr; never publish failed state or overwrite --json.
    process.stdout.write(
      `${JSON.stringify({ schema_version: '0.1.0', status: 'failed', reason: error.message, evidence: error.runDir ?? null })}\n`,
    );
    throw error;
  } finally {
    fs.rmdirSync(lock);
  }
}
function main(argv = process.argv) {
  try {
    run(argv);
    return 0;
  } catch (error) {
    return mainError(NAME, error);
  }
}
if (require.main === module) process.exitCode = main();
module.exports = { main, run, promptFor };
