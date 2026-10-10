/** Durable learner state and evidence checks for one teaching turn. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const { isDeepStrictEqual } = require('node:util');
const { projectPath, WorkflowError } = require('./workflow-cli');
const SESSION_IDS = [
  'session-01-quickstart',
  'session-02-concepts',
  'session-03-architecture',
  'session-04-test-design',
  'session-05-atdd-automate',
  'session-06-quality-trace',
  'session-07-advanced',
];
const FACTS = ['role', 'experience_level', 'learning_goals', 'pain_points'];
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message) => {
  throw new WorkflowError('environment-parser', message);
};
const table = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
function parseProgress(text, { legacy = false } = {}) {
  const documents = [];
  yaml.loadAll(text, (value) => documents.push(value), { schema: yaml.JSON_SCHEMA });
  if (documents.length !== 1 && !(legacy && documents.length === 2 && documents[1] === null))
    fail('progress must contain one YAML document');
  if (!table(documents[0])) fail('progress must be a YAML table');
  return { progress: documents[0], legacyNormalized: documents.length === 2 };
}
function checkProgress(progress, learner) {
  if (progress.user !== learner) fail('progress belongs to another learner');
  if (
    !Array.isArray(progress.sessions) ||
    progress.sessions.length !== SESSION_IDS.length ||
    progress.sessions.some((session, index) => !table(session) || session.id !== SESSION_IDS[index])
  )
    fail('progress must retain all seven canonical sessions in order');
  for (const session of progress.sessions) {
    if (!['not-started', 'in-progress', 'completed'].includes(session.status)) fail(`invalid status for ${session.id}`);
    if (
      session.score !== null &&
      (typeof session.score !== 'number' || !Number.isFinite(session.score) || session.score < 0 || session.score > 100)
    )
      fail(`invalid score for ${session.id}`);
    if (
      session.status === 'completed' &&
      (session.score === null ||
        typeof session.completed_date !== 'string' ||
        !session.completed_date.trim() ||
        typeof session.notes_artifact !== 'string' ||
        !session.notes_artifact.trim())
    )
      fail(`completed session lacks score, date or notes: ${session.id}`);
  }
  const completed = progress.sessions.filter((session) => session.status === 'completed').length;
  if (
    progress.sessions_completed !== completed ||
    progress.total_sessions !== 7 ||
    typeof progress.completion_percentage !== 'number' ||
    Math.abs(progress.completion_percentage - (completed / 7) * 100) > 0.51
  )
    fail('progress completion counters contradict its sessions');
  if (
    !(
      SESSION_IDS.includes(progress.next_recommended) ||
      (completed === 7 && [null, 'completion', 'completed', 'none'].includes(progress.next_recommended))
    )
  )
    fail('progress has an invalid next recommendation');
  if (completed < 7 && progress.sessions.find((session) => session.id === progress.next_recommended)?.status === 'completed')
    fail('next recommendation names an already completed session');
  if (progress.role !== null && (typeof progress.role !== 'string' || !['qa', 'dev', 'lead', 'vp'].includes(progress.role.toLowerCase())))
    fail('progress has an invalid role');
  if (
    progress.experience_level !== null &&
    (typeof progress.experience_level !== 'string' ||
      !['beginner', 'intermediate', 'experienced'].includes(progress.experience_level.toLowerCase()))
  )
    fail('progress has an invalid experience level');
  for (const field of ['learning_goals', 'pain_points'])
    if (progress[field] !== null && (typeof progress[field] !== 'string' || !progress[field].trim())) fail(`progress has invalid ${field}`);
  if (
    !Array.isArray(progress.stepsCompleted) ||
    progress.stepsCompleted.some((step) => typeof step !== 'string') ||
    typeof progress.lastStep !== 'string'
  )
    fail('progress has invalid continuation tracking');
  if (typeof progress.summary_generated !== 'boolean') fail('progress has an invalid summary flag');
  if (
    progress.summary_generated &&
    (completed !== 7 ||
      typeof progress.summary_path !== 'string' ||
      !progress.summary_path.trim() ||
      typeof progress.completion_date !== 'string' ||
      !progress.completion_date.trim())
  )
    fail('completed summary lacks its path, completion date or all seven sessions');
}
/** Every read is a fresh, singly linked regular file inside the attempt. */
function regularArtifact(root, value) {
  const lexical = path.resolve(root, value);
  let resolved;
  try {
    resolved = projectPath(root, value, 'generated artifact');
  } catch (error) {
    fail(`generated artifact is outside the attempt: ${error.message}`);
  }
  if (resolved !== lexical) fail('generated artifact traverses a symbolic link');
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch {
    fail(`generated artifact is missing: ${value}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail(`generated artifact must be a separate regular file: ${value}`);
  return { path: resolved, bytes: fs.readFileSync(resolved) };
}
/** Snapshot the entire CLI-owned directory. Symbolic and inode aliases are rejected. */
function snapshot(root) {
  const files = new Map();
  if (!fs.existsSync(root)) return files;
  const walk = (directory) => {
    if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink())
      throw new WorkflowError('usage', 'learner state must be a regular directory');
    for (const entry of fs.readdirSync(directory)) {
      const file = path.join(directory, entry),
        stat = fs.lstatSync(file);
      if (stat.isDirectory() && !stat.isSymbolicLink()) walk(file);
      else if (stat.isFile() && stat.nlink === 1) files.set(path.relative(root, file), fs.readFileSync(file));
      else throw new WorkflowError('usage', 'learner state contains a symbolic link or inode alias');
    }
  };
  walk(root);
  return files;
}
function sameSnapshot(left, right) {
  return left.size === right.size && [...left].every(([file, bytes]) => right.get(file)?.equals(bytes));
}
/** Install the directory as a unit; retain recoverable backups if rollback fails. */
function publishState(root, files, io = fs) {
  const parent = path.dirname(root);
  io.mkdirSync(parent, { recursive: true });
  const stage = io.mkdtempSync(path.join(parent, '.tea-teach-publish-'));
  const next = path.join(stage, 'next'),
    previous = path.join(stage, 'previous');
  io.mkdirSync(next);
  let moved = false,
    installed = false,
    keep = false;
  try {
    for (const [file, bytes] of files) {
      const destination = path.join(next, file);
      io.mkdirSync(path.dirname(destination), { recursive: true });
      io.writeFileSync(destination, bytes, { flag: 'wx' });
    }
    if (io.existsSync(root)) {
      io.renameSync(root, previous);
      moved = true;
    }
    io.renameSync(next, root);
    installed = true;
  } catch (error) {
    if (moved && !installed) {
      try {
        io.renameSync(previous, root);
      } catch (error_) {
        keep = true;
        throw new WorkflowError(
          'environment-configuration',
          `state publication failed: ${error.message}; recovery backup: ${previous}; rollback: ${error_.message}`,
        );
      }
    }
    throw new WorkflowError('environment-configuration', `state publication failed: ${error.message}; previous state preserved`);
  } finally {
    if (!keep) io.rmSync(stage, { recursive: true, force: true });
  }
}
function checkConversation(value, learner, bank) {
  if (!table(value) || value.schema_version !== '0.1.0' || value.learner !== learner || !Array.isArray(value.turns) || !table(value.quiz))
    fail('conversation has invalid learner identity or schema');
  const ids = new Set();
  for (const turn of value.turns) {
    if (
      !table(turn) ||
      typeof turn.id !== 'string' ||
      ids.has(turn.id) ||
      typeof turn.learnerMessage !== 'string' ||
      !turn.learnerMessage.trim() ||
      typeof turn.tutorReply !== 'string' ||
      !turn.tutorReply.trim() ||
      !table(turn.waiting)
    )
      fail('conversation contains an invalid or repeated turn');
    ids.add(turn.id);
  }
  for (const [sessionId, round] of Object.entries(value.quiz)) {
    if (!SESSION_IDS.includes(sessionId) || !table(round) || typeof round.id !== 'string' || !Array.isArray(round.answers))
      fail('conversation contains an invalid quiz ledger');
    for (const [index, answer] of round.answers.entries()) {
      const turnIndex = value.turns.findIndex((item) => item.id === answer.messageId);
      const turn = value.turns[turnIndex];
      const pending = value.turns[turnIndex - 1]?.waiting;
      const question = bank[sessionId]?.questions[index];
      if (
        !turn ||
        turn.learnerMessage.trim().toUpperCase() !== answer.answer ||
        !/^[ABCD]$/.test(answer.answer) ||
        !question ||
        answer.questionId !== question.id ||
        answer.correct !== (answer.answer === question.correct) ||
        pending?.kind !== 'quiz' ||
        pending.sessionId !== sessionId ||
        pending.questionId !== question.id ||
        pending.roundId !== round.id
      )
        fail('quiz answer lacks its actual learner message');
    }
  }
}
function quizForTurn(conversation, incoming, bank) {
  const quiz = structuredClone(conversation.quiz);
  const pending = conversation.turns.at(-1)?.waiting;
  if (pending?.kind === 'quiz') {
    const item = bank[pending.sessionId]?.questions.find((question) => question.id === pending.questionId);
    if (!item) fail('saved pending quiz question is unknown');
    const answer = incoming.learnerMessage.trim().toUpperCase();
    if (/^[ABCD]$/.test(answer)) {
      const round = quiz[pending.sessionId];
      if (!round || round.id !== pending.roundId || round.answers.some((entry) => entry.questionId === item.id))
        fail('saved quiz round is inconsistent');
      round.answers.push({ questionId: item.id, messageId: incoming.id, answer, correct: answer === item.correct });
    }
  }
  return quiz;
}
function scoredRound(round, questions) {
  if (
    !round ||
    round.answers.length !== questions.length ||
    questions.some((question, index) => round.answers[index]?.questionId !== question.id)
  )
    return null;
  const correct = round.answers.filter((answer) => answer.correct).length;
  return { score: Math.round((correct / questions.length) * 10_000) / 100, passed: (correct / questions.length) * 100 >= 70 };
}
/** Bind trusted imported completions to specific session facts; publication relocates notes. */
function trustedSessionFingerprint(session) {
  const facts = { ...session };
  delete facts.notes_artifact;
  return hash(JSON.stringify(Object.fromEntries(Object.entries(facts).sort(([left], [right]) => left.localeCompare(right)))));
}
/** Cross-check saved progress against caller-owned history before invoking a tutor or publishing. */
function checkHistory(progress, conversation, bank) {
  for (const session of progress.sessions) {
    if (session.status !== 'completed') continue;
    const imported = conversation.importedProgress;
    if (
      imported?.completedSessions?.[session.id] === trustedSessionFingerprint(session) &&
      typeof imported.path === 'string' &&
      typeof imported.sha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(imported.sha256)
    )
      continue;
    const questions = bank[session.id]?.questions;
    if (!Array.isArray(questions)) fail('completed session has no canonical quiz bank');
    let result;
    if (questions.length === 0) {
      const completed = conversation.turns.some((turn, index) => {
        const pending = conversation.turns[index - 1]?.waiting;
        return (
          pending?.kind === 'completion' && pending.sessionId === session.id && /^(?:c|complete|done)$/i.test(turn.learnerMessage.trim())
        );
      });
      if (!completed) fail('saved exploratory completion lacks its caller choice');
      result = { score: 100, passed: null };
    } else {
      result = scoredRound(conversation.quiz[session.id], questions);
      if (!result) fail(`saved completion lacks caller quiz evidence: ${session.id}`);
      if (!result.passed) {
        const lastAnswer = conversation.quiz[session.id].answers.at(-1).messageId;
        const answerIndex = conversation.turns.findIndex((turn) => turn.id === lastAnswer);
        if (
          !conversation.turns.some(
            (turn, index) =>
              index > answerIndex &&
              conversation.turns[index - 1]?.waiting.kind === 'review' &&
              conversation.turns[index - 1].waiting.sessionId === session.id &&
              /^\[?c\]?$/i.test(turn.learnerMessage.trim()),
          )
        )
          fail('saved below-pass completion lacks its caller Continue choice');
      }
    }
    if (
      Math.abs(session.score - result.score) > 0.011 ||
      session.quiz_passed !== result.passed ||
      ['passed', 'mastered'].some((field) => session[field] !== undefined && session[field] !== result.passed)
    )
      fail('saved completion contradicts its caller quiz grade');
  }
}
/** Verify the tutor output against host-owned incoming messages and quiz results. */
function validateTurn({
  request,
  conversation,
  before,
  bank,
  attemptDir,
  stagedRoot,
  progressFile,
  responseFile,
  inputDigests,
  assertInputsUnchanged,
}) {
  assertInputsUnchanged();
  for (const [file, digest] of inputDigests) if (hash(fs.readFileSync(file)) !== digest) fail('the agent changed a supplied input');
  const progressArtifact = regularArtifact(attemptDir, progressFile);
  const progress = parseProgress(progressArtifact.bytes.toString('utf8')).progress;
  checkProgress(progress, request.learner);
  const response = JSON.parse(regularArtifact(attemptDir, responseFile).bytes);
  if (
    !table(response) ||
    response.requestId !== request.requestId ||
    response.learner !== request.learner ||
    typeof response.reply !== 'string' ||
    !response.reply.trim() ||
    !table(response.waiting) ||
    !table(response.factEvidence)
  )
    fail('response does not identify this learner turn');
  if (Object.keys(response).some((key) => !['requestId', 'learner', 'reply', 'waiting', 'factEvidence'].includes(key)))
    fail('response includes unsupported fields; learner messages are host-owned');
  const incoming = { id: request.requestId, learnerMessage: request.message, tutorReply: response.reply, waiting: response.waiting };
  const quiz = quizForTurn(conversation, incoming, bank);
  const messages = [...conversation.turns, incoming];
  for (const field of FACTS) {
    if (before?.[field] !== null && before?.[field] !== undefined && !isDeepStrictEqual(before[field], progress[field]))
      fail(`the tutor changed established learner ${field}`);
    if (progress[field] !== null && (before?.[field] === null || before?.[field] === undefined)) {
      const cited = messages.find((turn) => turn.id === response.factEvidence[field]);
      if (!cited || !cited.learnerMessage.toLowerCase().includes(progress[field].toLowerCase()))
        fail(`learner ${field} lacks caller-message evidence`);
    }
  }
  const artifacts = new Map();
  const collect = (file) => {
    const artifact = regularArtifact(stagedRoot, file);
    artifacts.set(path.relative(stagedRoot, artifact.path), artifact.bytes);
    return artifact;
  };
  for (const [index, session] of progress.sessions.entries()) {
    const previous = before?.sessions[index];
    if (session.score === null && ['quiz_passed', 'passed', 'mastered'].some((field) => session[field] === true))
      fail('session claims mastery without quiz evidence');
    if (previous?.status === 'completed' && !isDeepStrictEqual(previous, session))
      fail(`the tutor changed completed session ${session.id}`);
    if (session.status === 'completed') {
      const notes = collect(session.notes_artifact);
      const notesText = notes.bytes.toString('utf8');
      const metadata = notesText.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (!metadata || !notesText.slice(metadata[0].length).trim()) fail('completed session notes lack metadata or content');
      const noteState = yaml.load(metadata[1], { schema: yaml.JSON_SCHEMA });
      if (
        noteState?.session_id !== session.id ||
        noteState.user !== request.learner ||
        Math.abs(noteState.score - session.score) > 0.011 ||
        typeof noteState.score !== 'number'
      )
        fail('session notes disagree with learner, session or score');
      if (previous?.status !== 'completed') {
        const questions = bank[session.id]?.questions;
        if (!Array.isArray(questions)) fail('skill quiz bank is missing this session');
        let result;
        if (questions.length === 0) {
          const pending = conversation.turns.at(-1)?.waiting;
          if (
            pending?.kind !== 'completion' ||
            pending.sessionId !== session.id ||
            previous?.status !== 'in-progress' ||
            !/^(?:c|complete|done)$/i.test(request.message.trim())
          )
            fail('exploratory completion requires the learner’s explicit completion choice');
          result = { score: 100, passed: null };
        } else {
          result = scoredRound(quiz[session.id], questions);
          if (!result) fail('session completion lacks all three caller-owned quiz answers');
          const pending = conversation.turns.at(-1)?.waiting;
          if (
            !result.passed &&
            !(pending?.kind === 'review' && pending.sessionId === session.id && /^\[?c\]?$/i.test(request.message.trim()))
          )
            fail('below-pass completion requires the learner’s explicit Continue choice');
        }
        if (Math.abs(session.score - result.score) > 0.011) fail('session score disagrees with its actual quiz evidence');
        for (const field of ['quiz_passed', 'passed', 'mastered'])
          if (session[field] !== undefined && session[field] !== result.passed) fail('session claims unearned mastery');
        session.quiz_passed = result.passed;
      }
    } else if (session.score !== null) {
      const result = scoredRound(quiz[session.id], bank[session.id]?.questions ?? []);
      if (!result || Math.abs(session.score - result.score) > 0.011) fail('session score lacks complete quiz evidence');
      for (const field of ['quiz_passed', 'passed', 'mastered'])
        if (session[field] !== undefined && session[field] !== result.passed) fail('session claims unearned mastery');
    }
  }
  const waiting = response.waiting;
  if (
    ['lesson', 'quiz', 'review', 'completion'].includes(waiting.kind) &&
    ['role', 'experience_level', 'learning_goals'].some((field) => progress[field] === null)
  )
    fail('teaching requires the caller-supported learner assessment');
  if (!['assessment', 'menu', 'lesson', 'quiz', 'review', 'completion'].includes(waiting.kind))
    fail('response has an invalid learner stop point');
  if (['lesson', 'quiz', 'review', 'completion'].includes(waiting.kind) && !SESSION_IDS.includes(waiting.sessionId))
    fail('response stop point has no canonical session');
  if (waiting.kind === 'assessment' && !FACTS.includes(waiting.field)) fail('assessment stop point has no known field');
  if (waiting.kind === 'quiz') {
    const questions = bank[waiting.sessionId].questions;
    const question = questions.find((item) => item.id === waiting.questionId);
    if (
      !question ||
      !response.reply.includes(question.question) ||
      Object.values(question.options).some((option) => !response.reply.includes(option))
    )
      fail('pending quiz reply omits its canonical question or options');
    let round = quiz[waiting.sessionId];
    if (
      waiting.questionId === questions[0].id &&
      (conversation.turns.at(-1)?.waiting.kind !== 'quiz' || round?.answers.length === questions.length)
    )
      round = quiz[waiting.sessionId] = { id: crypto.randomUUID(), answers: [] };
    if (!round || questions[round.answers.length]?.id !== waiting.questionId) fail('pending quiz skips unanswered questions');
    waiting.roundId = round.id;
  }
  if (waiting.kind === 'review' && !scoredRound(quiz[waiting.sessionId], bank[waiting.sessionId].questions))
    fail('review stop point lacks a completed quiz');
  if (progress.summary_generated) {
    if (progress.sessions_completed !== 7 || typeof progress.summary_path !== 'string')
      fail('completion summary lacks all seven completed sessions');
    collect(progress.summary_path);
  }
  if (before?.summary_generated && (!progress.summary_generated || progress.summary_path !== before.summary_path))
    fail('the tutor changed the established completion summary');
  if (before?.completion_date != null && progress.completion_date !== before.completion_date)
    fail('the tutor changed the established completion date');
  if (before && before.stepsCompleted.some((step) => !progress.stepsCompleted.includes(step)))
    fail('the tutor discarded saved workflow steps');
  const nextConversation = { ...conversation, turns: messages, quiz };
  checkConversation(nextConversation, request.learner, bank);
  checkHistory(progress, nextConversation, bank);
  return { progress, conversation: nextConversation, artifacts };
}
module.exports = {
  SESSION_IDS,
  FACTS,
  hash,
  parseProgress,
  checkProgress,
  regularArtifact,
  snapshot,
  sameSnapshot,
  publishState,
  checkConversation,
  trustedSessionFingerprint,
  checkHistory,
  quizForTurn,
  scoredRound,
  validateTurn,
};
