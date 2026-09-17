/**
 * teach-me-testing eval harness.
 *
 * `bmad-teach-me-testing` is the one TEA skill with no suite of any kind: it
 * stayed `deferred` because it is a live, multi-turn teaching session and
 * nothing before Story 6.10's `runTranscript` could drive or record one. This
 * suite discharges that entry for real, against a real vendor, reusing Story
 * 6.10's engine (`test/lib/transcript-harness.js`) and runner
 * (`cli/transcript-runner.js`) completely unchanged.
 *
 * ONE CASE, TWO TURNS, AGAINST A REAL VENDOR
 *
 * Turn 1 plays the whole first-session path through the real skill, itself
 * supplying both sides of what the workflow's own step files write as an
 * interactive exchange: the learner's role, experience level, goals, and pain
 * points; the session-1 selection; a deliberately wrong answer to session-1's
 * own Q1 (data/quiz-questions.yaml's q1-purpose), landing at 66.67%, below the
 * workflow's own 70% passing_score; the resulting `[R]` review choice; and
 * exit. Turn 2 is a brand-new, memoryless process, in the same persistent
 * workspace, that re-enters the skill fresh -- the only thing that can tell a
 * correct write of `progress.yaml` from a skill that would forget everything
 * the instant the process exited, since a headless agent CLI carries no
 * session state of its own between invocations.
 *
 * WHAT IS MEASURED, AND HOW
 *
 * Every check is a mechanical containment or equality test over structural
 * data (a parsed YAML file, a literal phrase in a transcript), never a
 * semantic judgment of reply quality, and each of the four scoring functions
 * below is proven in `test/test-teach-me-testing-scoring.js` to actually fail
 * on a hand-built violation before this harness is trusted to run one:
 *
 *   placementAccuracy   placementHolds: does progress.yaml's experience_level
 *                        equal the fixture's declared level (Beginner)
 *   correctionRate       correctionHolds: does turn 1's transcript contain
 *                        step-04-session-01.md's own verbatim correction text
 *                        for the seeded wrong answer
 *   reTeachingRate        reTeachingHolds: does that same corrective content
 *                        reappear in the transcript AFTER the learner's `[R]`
 *                        choice -- proving the review actually re-teaches the
 *                        missed sub-topic, not merely that the transcript
 *                        contains the phrase once, from the original mistake
 *   continuationRate      continuationHolds: does turn 2 -- a fresh process --
 *                        land on step-01-init.md's continuation branch rather
 *                        than its fresh-start branch, which is the structural
 *                        proof that persistence is real
 *   maxUnearnedMastery    masteryClaimHolds: does every session progress.yaml
 *                        claims `completed` correspond to a session the
 *                        transcript actually shows was quizzed, cross-
 *                        referenced against quiz evidence this fixture
 *                        declares rather than trusted at face value -- the
 *                        cross-reference IS the honesty check, since the
 *                        progress schema itself carries no separate "mastery"
 *                        field
 *
 * `progress.yaml` is read directly off the staged workspace with the
 * file-system port, after both turns complete and before the workspace is
 * removed, exactly as `cli/nfr-runner.js`'s own deliverable is read in
 * `test/eval-nfr.js` -- not through the probe's typed artifact channel, which
 * `test/lib/transcript-harness.js` deliberately exposes no override for (see
 * its own header: it is general on purpose, and Story 6.11 supplies its own
 * meaning). Turn 1 and turn 2 are each also instructed to write their own
 * complete transcript to a file in the workspace (`transcript-turn-1.md`,
 * `transcript-turn-2.md`), read the same way, because a headless CLI's
 * captured stdout is the only channel `runTranscript` records and a written
 * file survives even if a final printed reply were ever truncated or
 * summarized.
 *
 * NO EVAL-QUALITY CONTRACT FOR V1
 *
 * Every check here is the same containment/equality shape `test/eval-atdd.js`'s
 * `scoreRun` already uses for comparably structural claims, and
 * `test/test-teach-me-testing-scoring.js`'s own pure-function proof is what
 * gives that shape independent verification. `test/contracts/README.md`
 * records why a contract exists at all for the suites that carry one; this is
 * a deliberate, reviewable deviation rather than an oversight, stated here for
 * the same reason `test/eval-transcript.js` states its own absence of one.
 *
 * NO MISCONCEPTION-TRIGGERED TOPIC ROUTING
 *
 * `bmad-teach-me-testing` has no mechanism, in any session, where a wrong
 * answer on one topic pulls in a different topic the pre-correction plan did
 * not already have (see `_bmad-output/planning-artifacts/epics.md`'s Story
 * 6.11 finding, and `data/curriculum.yaml`, read in full). The real branch is
 * `[R]` review the same session's content again, or `[C]` continue anyway, and
 * `reTeachingHolds` scores that real branch rather than adaptive branching the
 * skill does not have.
 *
 * THREE MODES
 *
 *   --validate-only   Static. No vendor, no cost, no network. Asserts the
 *                     corpus is internally consistent and that every phrase it
 *                     cites from the real skill still appears verbatim in the
 *                     real step and data files it names.
 *   --preflight-only  The static checks, then the runner: is
 *                     tea-transcript-runner executable, does the requested
 *                     agent answer --version, does a built-in vendor have a
 *                     credential. Exits before any model call.
 *   default           Spends two real vendor calls per repetition (one per
 *                     turn). This suite is not free the way Story 6.10's
 *                     infrastructure proof was: it discharges
 *                     `bmad-teach-me-testing`'s coverage obligation for real.
 *
 * Usage:
 *   node test/eval-teach-me-testing.js --validate-only
 *   node test/eval-teach-me-testing.js --preflight-only --agent codex
 *   node test/eval-teach-me-testing.js --agent claude --runs 1
 *   node test/eval-teach-me-testing.js --agent claude --json results/teach-me-testing.json
 *
 * Exit codes:
 *   0  the corpus is valid (--validate-only), the runner is ready
 *      (--preflight-only), or every threshold was met
 *   1  a threshold was missed, or the corpus is inconsistent (a real result)
 *   2  the environment could not run the eval (nothing was measured): a
 *      missing credential or executable, a timeout, a transport error, a
 *      missing or unparseable progress file, or fewer completed repetitions
 *      than were declared
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const yaml = require('js-yaml');

const { AGENT_ADAPTERS, resolveModel } = require('../cli/lib/agent-adapters');
const { failureClassForExit } = require('../cli/transcript-runner');
const { runTranscript } = require('./lib/transcript-harness');
const { missingCredential } = require('./eval-test-review');
const { loadSuiteManifest, suiteById } = require('./lib/suite-manifest');
const {
  digestFiles,
  repositoryState,
  probeVersion,
  redactArgs,
  measured,
  diagnosticRecord,
  numericContributions,
  classifyDiagnosticQuality,
  suiteResultRecord,
  writeSuiteResult,
} = require('./lib/eval-record');
const { worstFailureClass, exitCodeForFailureClass } = require('./schema/eval-result');
const { PROBE_TIMEOUT_MS, boundedProbe } = require('./lib/bounded-probe');
const { nowMs, nowIso, elapsedMsSince } = require('./lib/clock');
const { targetProblems } = require('./lib/probe-targets');
const { readJson, readText, writeText } = require('./lib/file-system-port');

const PROJECT_ROOT = path.join(__dirname, '..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'teach-me-testing-eval');
const GROUND_TRUTH = path.join(FIXTURE_ROOT, 'ground-truth.json');
const SKILL_ROOT = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-teach-me-testing');
const SUITE_ID = 'teach-me-testing';
const CASE_ID = 'session-01-first-run-then-fresh-continuation';

/** The interface test/lib/probe-targets.js and test/lib/transcript-harness.js share. */
const TRANSCRIPT_INTERFACE = 'tea-transcript-runner';

const TURN_COUNT = 2;

/**
 * Twenty minutes per turn. A full session-1 run reads several step files, a
 * data file, plays both facilitator and scripted learner through an entire
 * interactive session, and writes a progress file, session notes, and a
 * transcript log -- materially heavier than the trivial scripted exchange
 * Story 6.10 proved the engine against. `test/lib/probe-targets.js`'s own
 * `tea-transcript-runner` backstop is one minute above this.
 */
const RUN_TIMEOUT_MS = 20 * 60_000;

/**
 * What the runner is allowed to do, checked against the manifest's declaration
 * by tools/validate-eval-schemas.js the same way THRESHOLDS is. A turn writes
 * its own progress file, session notes, and transcript log into the staged
 * workspace, so it needs write tools and no shell.
 */
const RUNNER_CAPABILITIES = ['scoped-artifact-writes'];

/** The file each turn is instructed to write its own complete transcript to, inside the workspace. */
const TRANSCRIPT_FILES = { 0: 'transcript-turn-1.md', 1: 'transcript-turn-2.md' };

/**
 * Thresholds. A single live-cost case, one repetition by default (see
 * `test/evals/suite-manifest.json`'s own `repetitions`), so every rate below is
 * a bar the one scored run has to clear outright; `maxUnearnedMastery` is a
 * ceiling for the same reason every sibling suite's honesty checks are
 * ceilings rather than accuracies: a false claim of mastery is a defect a
 * learner cannot see past, not a partial credit.
 */
const THRESHOLDS = {
  placementAccuracy: 1,
  correctionRate: 1,
  reTeachingRate: 1,
  continuationRate: 1,
  maxUnearnedMastery: 0,
};

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  cyan: '[36m',
  dim: '[2m',
};

function fatal(code, message) {
  console.error(`${colors.red}eval: ${message}${colors.reset}`);
  process.exit(code);
}

function parseArgs(argv) {
  const agents = [];
  const agentArgs = [];
  const envPass = [];
  let runs = 1;
  let validateOnly = false;
  let preflightOnly = false;
  let agentCmd;
  let model;
  let jsonPath;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--agent': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--agent requires a vendor name');
        agents.push(value);
        index += 1;
        break;
      }
      case '--runs': {
        runs = Number.parseInt(argv[index + 1] ?? '', 10);
        if (!Number.isInteger(runs) || runs < 1) fatal(2, '--runs requires a positive integer');
        index += 1;
        break;
      }
      case '--agent-cmd': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--agent-cmd requires an executable path or name');
        agentCmd = value.includes('/') || value.includes(path.sep) ? path.resolve(value) : value;
        index += 1;
        break;
      }
      case '--agent-arg': {
        const value = argv[index + 1];
        if (value === undefined) fatal(2, '--agent-arg requires a value');
        agentArgs.push(value);
        index += 1;
        break;
      }
      case '--env-pass': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--env-pass requires an environment variable name');
        envPass.push(value);
        index += 1;
        break;
      }
      case '--model': {
        model = argv[index + 1];
        if (!model) fatal(2, '--model requires a model name');
        index += 1;
        break;
      }
      case '--json': {
        jsonPath = argv[index + 1];
        if (!jsonPath) fatal(2, '--json requires a file path');
        index += 1;
        break;
      }
      case '--validate-only': {
        validateOnly = true;
        break;
      }
      case '--preflight-only': {
        preflightOnly = true;
        break;
      }
      default: {
        fatal(2, `unknown argument: ${arg}`);
      }
    }
  }
  if (agents.length === 0) agents.push('claude');
  if (agents.includes('custom') && !agentCmd) fatal(2, '--agent custom requires --agent-cmd');
  if (agents.includes('custom') && model) {
    fatal(2, '--model is not supported by --agent custom; pass the runner model through --agent-arg');
  }
  if (agents.length > 1 && (agentCmd || agentArgs.length > 0 || envPass.length > 0 || model)) {
    fatal(2, 'runner overrides require exactly one --agent; run separate commands for different runner configurations');
  }
  if (validateOnly && preflightOnly) fatal(2, '--validate-only and --preflight-only name different modes; pass one');
  if (runs > 1) {
    console.error(
      `${colors.yellow}note${colors.reset}: --runs ${runs} spends ${runs * TURN_COUNT} real vendor calls; this suite is not free.`,
    );
  }
  return { agents, runs, validateOnly, preflightOnly, agentCmd, agentArgs, envPass, model, jsonPath };
}

/* -------------------------------------------------------------------------- */
/* Ground truth                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Parse ground-truth.json.
 *
 * @returns {Promise<object|null>} Null when the file is missing or unparseable.
 */
async function loadGroundTruth() {
  try {
    const read = await readJson(GROUND_TRUTH);
    return read.present ? read.value : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/**
 * Static validation of the corpus: the shape a --validate-only run checks, and
 * what every other mode checks before it spends a call.
 *
 * Every phrase or marker the fixture pins is cross-checked against the real
 * skill files it names, the same discipline `test/eval-nfr.js`'s
 * `skillRuleCitations` applies: a claim this corpus rests a score on has to
 * still be true of the skill on disk, so a later edit to the real workflow
 * fails this corpus before it silently miscalibrates a live run. It also
 * cross-checks the scripted quiz answers against the real answer key in
 * data/quiz-questions.yaml, so a change to which answer is correct is caught
 * here rather than changing what score the live run produces without anyone
 * noticing.
 *
 * @param {object} groundTruth
 * @returns {Promise<string[]>} Problems; empty when the corpus is consistent.
 */
async function validateCorpus(groundTruth) {
  const problems = [];
  const LEVELS = new Set(['Beginner', 'Intermediate', 'Experienced']);
  const ROLES = new Set(['QA', 'Dev', 'Lead', 'VP']);

  if (!LEVELS.has(groundTruth?.declaredLevel)) {
    problems.push(`declaredLevel must be one of ${[...LEVELS].join(', ')}; got ${JSON.stringify(groundTruth?.declaredLevel)}`);
  }
  if (!ROLES.has(groundTruth?.role)) {
    problems.push(`role must be one of ${[...ROLES].join(', ')}; got ${JSON.stringify(groundTruth?.role)}`);
  }
  if (typeof groundTruth?.learningGoals !== 'string' || groundTruth.learningGoals.trim().length < 10) {
    problems.push('learningGoals must be a string of at least 10 characters, the workflow step-02-assess.md validates for itself');
  }
  if (typeof groundTruth?.userName !== 'string' || groundTruth.userName.trim().length === 0) {
    problems.push('userName is missing or empty, so the progress file path cannot be predicted');
  }
  if (typeof groundTruth?.sessionId !== 'string' || groundTruth.sessionId.trim().length === 0) {
    problems.push('sessionId is missing or empty');
  }
  for (const key of ['correctionPhrase', 'reviewMarker', 'continuationMarker', 'freshStartMarker']) {
    if (typeof groundTruth?.[key] !== 'string' || groundTruth[key].trim().length === 0) {
      problems.push(`${key} is missing or empty, so the check it anchors cannot run`);
    }
  }
  const evidence = groundTruth?.quizQuestionEvidence?.[groundTruth?.sessionId];
  if (typeof evidence !== 'string' || evidence.trim().length === 0) {
    problems.push(`quizQuestionEvidence has no entry for sessionId ${JSON.stringify(groundTruth?.sessionId)}`);
  }

  // Cross-check every phrase against the real files corpusCitations names.
  const citations = groundTruth?.corpusCitations ?? {};
  const fileCache = new Map();
  const realText = async (relative) => {
    if (!fileCache.has(relative)) {
      const read = await readText(path.join(PROJECT_ROOT, relative));
      fileCache.set(relative, read.present ? read.text : null);
    }
    return fileCache.get(relative);
  };

  for (const key of ['correctionPhrase', 'reviewMarker', 'continuationMarker', 'freshStartMarker']) {
    const citation = citations[key];
    if (!citation?.file) {
      problems.push(`corpusCitations has no entry naming which real file ${key} must appear in`);
      continue;
    }
    const text = await realText(citation.file);
    if (text === null) {
      problems.push(`corpusCitations.${key} names ${citation.file}, which does not exist`);
      continue;
    }
    const phrase = groundTruth[key];
    if (typeof phrase === 'string' && phrase.length > 0 && !text.includes(phrase)) {
      problems.push(`${key} ${JSON.stringify(phrase)} does not appear verbatim in ${citation.file}; the skill's own wording moved`);
    }
  }

  if (typeof evidence === 'string' && evidence.length > 0) {
    const citation = citations.quizQuestionEvidence;
    if (citation?.file) {
      const text = await realText(citation.file);
      if (text === null) problems.push(`corpusCitations.quizQuestionEvidence names ${citation.file}, which does not exist`);
      else if (!text.includes(evidence)) {
        problems.push(
          `quizQuestionEvidence[${groundTruth.sessionId}] ${JSON.stringify(evidence)} does not appear verbatim in ${citation.file}`,
        );
      }
    } else {
      problems.push('corpusCitations has no entry naming which real file quizQuestionEvidence must appear in');
    }
  }

  // Cross-check the scripted quiz answers against the real answer key, so this
  // corpus cannot drift from what the skill's own quiz actually asks and scores.
  const quizCitation = citations.quizAnswers;
  if (quizCitation?.file) {
    const quizText = await realText(quizCitation.file);
    if (quizText === null) {
      problems.push(`corpusCitations.quizAnswers names ${quizCitation.file}, which does not exist`);
    } else {
      let parsed;
      try {
        parsed = yaml.load(quizText);
      } catch (error) {
        problems.push(`${quizCitation.file} does not parse as YAML: ${error.message}`);
        parsed = null;
      }
      if (parsed) {
        const session = parsed[groundTruth.sessionId];
        const questions = Array.isArray(session?.questions) ? session.questions : [];
        if (questions.length === 0) {
          problems.push(`${quizCitation.file} declares no questions for ${groundTruth.sessionId}`);
        }
        const byId = new Map(questions.map((question) => [question.id, question]));
        const seeded = groundTruth.seededWrongQuestion;
        const real = seeded ? byId.get(seeded.id) : undefined;
        if (seeded?.id && real) {
          if (real.correct !== seeded.correctAnswer) {
            problems.push(
              `seededWrongQuestion.correctAnswer is ${JSON.stringify(seeded.correctAnswer)}, ${quizCitation.file} says ${JSON.stringify(real.correct)}`,
            );
          }
          if (seeded.scriptedAnswer === real.correct) {
            problems.push(
              `seededWrongQuestion.scriptedAnswer (${seeded.scriptedAnswer}) equals the real correct answer; it would not seed a wrong answer at all`,
            );
          }
        } else if (seeded?.id) {
          problems.push(
            `seededWrongQuestion.id ${JSON.stringify(seeded.id)} is not a question ${quizCitation.file} declares for ${groundTruth.sessionId}`,
          );
        } else {
          problems.push('seededWrongQuestion.id is missing');
        }
        for (const [id, answer] of Object.entries(groundTruth.quizAnswers ?? {})) {
          const question = byId.get(id);
          if (!question) {
            problems.push(
              `quizAnswers names question ${JSON.stringify(id)}, which ${quizCitation.file} does not declare for ${groundTruth.sessionId}`,
            );
            continue;
          }
          if (id === seeded?.id) continue; // deliberately wrong; checked above.
          if (question.correct !== answer) {
            problems.push(
              `quizAnswers[${id}] is ${JSON.stringify(answer)}, which is not ${quizCitation.file}'s correct answer (${JSON.stringify(question.correct)})`,
            );
          }
        }
        if (questions.length > 0) {
          const correctCount = questions.filter((question) => groundTruth.quizAnswers?.[question.id] === question.correct).length;
          const scorePct = (correctCount / questions.length) * 100;
          const passing = session?.passing_score ?? 70;
          if (scorePct >= passing) {
            problems.push(
              `the scripted quiz answers score ${scorePct.toFixed(2)}%, at or above ${quizCitation.file}'s own passing_score (${passing}); ` +
                'this corpus needs a below-threshold score to exercise the [R]/[C] branch at all',
            );
          }
        }
      }
    }
  } else {
    problems.push('corpusCitations has no entry naming the real quiz-questions.yaml the scripted answers are checked against');
  }

  return problems;
}

/* -------------------------------------------------------------------------- */
/* Workspace staging                                                          */
/* -------------------------------------------------------------------------- */

/** Every file under a directory, as paths relative to it, sorted. */
function filesUnder(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) found.push(path.relative(root, absolute));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return found;
}

/**
 * The resolved TEA config the staged run reads its four required placeholders
 * from (SKILL.md's "On Activation" Step 4): user_name, project_name,
 * communication_language, test_artifacts.
 */
function configYaml(groundTruth) {
  return [
    '# Written by test/eval-teach-me-testing.js for one staged, persistent workspace.',
    '# test_artifacts points inside this workspace only, so the progress file and session notes the run',
    '# writes land here and nowhere else, across both turns of this session.',
    `user_name: ${groundTruth.userName}`,
    'project_name: teach-me-testing-eval',
    'communication_language: English',
    'document_output_language: English',
    'output_folder: docs',
    'test_artifacts: test-artifacts',
    '',
  ].join('\n');
}

/**
 * Stage the persistent workspace both turns of the session share, with the
 * workspace itself as the agent's working directory:
 *
 *   skill/                    the bmad-teach-me-testing workflow, copied verbatim
 *   _bmad/tea/config.yaml     the resolved config
 *   test-artifacts/           empty; the run writes its progress file and session notes here
 *
 * There is no separate "project root" the way `test/eval-nfr.js` stages one
 * beside its skill copy: this suite audits nothing that exists outside the
 * skill itself, so the workspace root IS `{project-root}`.
 *
 * @param {object} groundTruth
 * @returns {Promise<string>} The workspace's absolute path.
 */
async function stageWorkspace(groundTruth) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-teach-me-testing-eval-'));

  for (const relative of filesUnder(SKILL_ROOT)) {
    const target = path.join(dir, 'skill', relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(SKILL_ROOT, relative), target);
  }

  fs.mkdirSync(path.join(dir, 'test-artifacts'), { recursive: true });
  fs.mkdirSync(path.join(dir, '_bmad', 'tea'), { recursive: true });
  await writeText(path.join(dir, '_bmad', 'tea', 'config.yaml'), configYaml(groundTruth));

  return dir;
}

/* -------------------------------------------------------------------------- */
/* Prompt                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Turn 1's prompt: the whole scripted first-session path, playing both the
 * facilitator (following the real step files exactly) and the learner (whose
 * every answer is scripted here) in one non-interactive call.
 *
 * No answer here is invented content the skill does not already carry.
 * "Restate your own step file's explanation verbatim" is an instruction about
 * HOW to review, not a supplied answer: the agent has already read that
 * explanation off `skill/steps-c/step-04-session-01.md`, so quoting it back is
 * the workflow's own scripted content, faithfully executed, not a hint copied
 * out of this fixture.
 *
 * @param {object} groundTruth
 * @returns {string}
 */
function turn1Prompt(groundTruth) {
  const wrong = groundTruth.seededWrongQuestion;
  const transcriptFile = TRANSCRIPT_FILES[0];
  return [
    "You are conducting one complete, non-interactive session of the TEA workflow `bmad-teach-me-testing`, playing BOTH roles yourself in a single reply: the TEA Academy facilitator (exactly as the workflow's own step files direct) and a scripted learner whose every answer is given to you below. There is no live human here. Supply the learner's answers yourself, exactly as scripted, the instant the facilitator's own step file would ask a real person for them, and never stop to wait for one.",
    '',
    'The workflow is in `skill/`. Read `skill/SKILL.md` first, then follow its "On Activation" sequence and every step file it and the step files it names direct you to, in order, in full, exactly as written. Do not skip, reorder, paraphrase away, or improvise the facilitator half of this -- if a step\'s own text says to display something, display it in full.',
    '',
    '----- run configuration -----',
    'Resolve the workflow placeholders to these values:',
    '',
    '- `{project-root}`: `.`',
    '- `{skill-root}`: `skill`',
    '- `_bmad/tea/config.yaml` in the current working directory carries `user_name`, `project_name`,',
    '  `communication_language`, and `test_artifacts`; load it and resolve every config-derived placeholder',
    '  from it.',
    '',
    'If Step 1 of `skill/SKILL.md`\'s "On Activation" sequence names a script or a file that is not present',
    '(there is no `_bmad/scripts/` or `_bmad/custom/` here), that is the documented "script fails" / "any',
    'missing file is skipped" case: fall back to the base `skill/customize.toml` alone, exactly as that',
    "step's own instructions direct, and continue.",
    '',
    'Enter mode "create" (a brand-new learning session; no progress exists yet in this working directory).',
    '',
    "----- the scripted learner's answers, in order -----",
    '',
    `1. Role: ${groundTruth.role}`,
    `2. Experience level: ${groundTruth.declaredLevel}`,
    `3. Learning goals: "${groundTruth.learningGoals}"`,
    '4. Pain points: skip (answer "skip")',
    '5. At the session menu, select session "1" (Quick Start).',
    "6. Session 1's knowledge-check quiz, answered exactly as scripted:",
    `   - Question 1 (${wrong.id}): answer ${wrong.scriptedAnswer}. This is deliberately wrong -- the correct`,
    `     answer is ${wrong.correctAnswer}. Let the facilitator's own step file correct it, exactly as that`,
    '     file instructs for an incorrect answer to this question, rather than silently answering correctly.',
    `   - Question 2 (q2-risk-matrix): answer ${groundTruth.quizAnswers['q2-risk-matrix']}.`,
    `   - Question 3 (q3-engagement): answer ${groundTruth.quizAnswers['q3-engagement']}.`,
    '7. Two of three answers are correct, so the quiz score is below the 70% passing threshold. When the',
    '   facilitator presents the below-threshold choice, select **[R]** Review the content again.',
    '8. The step file gives no further detail for the `[R]` branch beyond "review the content again." As',
    "   the facilitator, satisfy that instruction by re-presenting Session 1's teaching content, and",
    "   specifically re-explaining Question 1: re-open your own step file's quiz section and restate its",
    '   own incorrect-answer explanation for Question 1 VERBATIM -- the exact sentence that step file',
    '   itself displays for an incorrect answer to Question 1 -- so the learner is corrected on the exact',
    '   point they missed, before moving on. Quote it exactly rather than paraphrasing it: a faithful review',
    "   re-teaches the skill's own scripted correction, word for word.",
    `   Then, having reviewed, re-ask Question 1 alone and this time answer ${wrong.correctAnswer} (the`,
    '   correct answer). The step file gives no instruction to recompute the quiz score after a review, so',
    '   the score your progress file records in the next step is the ORIGINAL quiz result from step 6 above,',
    '   not a second attempt.',
    "9. Proceed with step-04-session-01.md's own remaining mandatory sequence exactly as written: generate",
    '   the session notes file, update the progress file with the session marked complete and the original',
    '   quiz score, and present the completion menu.',
    '10. At the session-complete menu, select **[C]** Continue to Session Menu.',
    '11. At the session menu (the hub), select **[X]** Save progress and exit. Do not start or continue any',
    '    other session.',
    '',
    '----- what to produce -----',
    '',
    "Actually create every file the workflow's own instructions direct you to create in this working",
    'directory (the progress file, the session notes file) -- do not only describe them.',
    '',
    `In addition, write the COMPLETE text of everything displayed during this session -- every facilitator`,
    `message and every scripted learner answer, in the order they occurred, with nothing summarized or`,
    `omitted -- to a new file named \`${transcriptFile}\` in the current working directory (not inside`,
    '`skill/` or `test-artifacts/`). Then print that same complete text as your final reply. Both copies',
    'have to carry the same content: this transcript, on disk and in your reply, is the entire surface this',
    'session is measured against.',
  ].join('\n');
}

/**
 * Turn 2's prompt: a brand-new, memoryless process re-entering the same
 * workflow in the same persistent workspace, to prove progress persistence is
 * real rather than assumed. It does not start or continue any session -- it
 * only has to correctly discover and report what turn 1 already recorded.
 *
 * @param {object} groundTruth
 * @returns {string}
 */
function turn2Prompt(groundTruth) {
  const transcriptFile = TRANSCRIPT_FILES[1];
  return [
    'This is a brand-new process with no memory of any earlier turn. You are again running the TEA workflow',
    '`bmad-teach-me-testing` in this same working directory. Read `skill/SKILL.md` first, then follow its',
    '"On Activation" sequence, resolving placeholders exactly as before:',
    '',
    '- `{project-root}`: `.`',
    '- `{skill-root}`: `skill`',
    '- `_bmad/tea/config.yaml` in the current working directory carries `user_name`, `project_name`,',
    '  `communication_language`, and `test_artifacts`.',
    '',
    'Enter mode "create". Do not assume anything about prior progress -- discover it, or its absence, the',
    "way the workflow's own `skill/steps-c/step-01-init.md` instructs: by checking whether this working",
    "directory's own progress file already exists. Let the workflow route itself from there.",
    '',
    'If the workflow finds existing progress, it routes to its continuation step, which loads and displays a',
    'dashboard of what has already been completed. Let it do so in full. Once that dashboard reaches the',
    'session menu, select **[X]** Save progress and exit immediately -- do not start or continue any session',
    'in this turn. This turn exists only to prove the workflow correctly finds and reports what an earlier',
    'session already recorded.',
    '',
    `Write the COMPLETE text of everything the facilitator displayed during this turn, in order, with nothing`,
    `summarized or omitted, to a new file named \`${transcriptFile}\` in the current working directory (not`,
    'inside `skill/` or `test-artifacts/`). Then print that same complete text as your final reply.',
    `Reproduce ${JSON.stringify(groundTruth.userName)}'s role, experience level, and session-1 status and`,
    'score exactly as the dashboard displayed them.',
  ].join('\n');
}

/**
 * `buildTurnPrompt(turnIndex, priorTurns, workspace)`, the callback
 * `runTranscript` calls once per turn.
 *
 * @param {object} groundTruth
 * @returns {(turnIndex: number, priorTurns: object[], workspace: string) => string}
 */
function makeBuildTurnPrompt(groundTruth) {
  return function buildTurnPrompt(turnIndex) {
    return turnIndex === 0 ? turn1Prompt(groundTruth) : turn2Prompt(groundTruth);
  };
}

/* -------------------------------------------------------------------------- */
/* Reading the workspace after both turns                                     */
/* -------------------------------------------------------------------------- */

/** Where this fixture's progress file lands, resolved the same way the skill itself resolves it. */
function progressFilePath(workspace, groundTruth) {
  return path.join(workspace, 'test-artifacts', 'teaching-progress', `${groundTruth.userName}-tea-progress.yaml`);
}

/**
 * Read and parse `progress.yaml` directly off the staged workspace.
 *
 * @param {string} workspace
 * @param {object} groundTruth
 * @returns {Promise<object|null>} Null when the file is absent or does not parse as YAML.
 */
async function readProgress(workspace, groundTruth) {
  const read = await readText(progressFilePath(workspace, groundTruth));
  if (!read.present) return null;
  try {
    return yaml.load(read.text) ?? null;
  } catch {
    return null;
  }
}

/**
 * The text one turn is scored against: the file it was instructed to write,
 * falling back to its captured stdout reply when the file was never written
 * (a scored miss in itself, not an environment failure -- see the header).
 *
 * @param {string} workspace
 * @param {number} turnIndex
 * @param {object[]} turns
 * @returns {Promise<string>}
 */
async function transcriptTextFor(workspace, turnIndex, turns) {
  const read = await readText(path.join(workspace, TRANSCRIPT_FILES[turnIndex]));
  if (read.present && read.text.trim().length > 0) return read.text;
  return turns[turnIndex]?.reply ?? '';
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Whether progress.yaml records the fixture's declared placement.
 *
 * @param {{declaredLevel: string}} groundTruth
 * @param {{experience_level?: string}|null} progress
 * @returns {{holds: boolean, expected: string|null, actual: string|null}}
 */
function placementHolds(groundTruth, progress) {
  const expected = groundTruth?.declaredLevel ?? null;
  const actual = progress?.experience_level ?? null;
  return { holds: expected !== null && actual === expected, expected, actual };
}

/**
 * Whether a transcript contains the step file's own verbatim correction text
 * for the fixture's seeded wrong answer.
 *
 * @param {{correctionPhrase: string}} groundTruth
 * @param {string} transcriptText
 * @returns {{holds: boolean, phrase: string}}
 */
function correctionHolds(groundTruth, transcriptText) {
  const phrase = groundTruth?.correctionPhrase ?? '';
  const holds = phrase.length > 0 && typeof transcriptText === 'string' && transcriptText.includes(phrase);
  return { holds, phrase };
}

/**
 * Whether the same corrective content reappears in a transcript AFTER the
 * learner's `[R]` review choice -- not merely somewhere in the transcript,
 * which a plain whole-text containment check could not tell from the
 * pre-review correction alone. This is what makes the check "the review
 * actually re-teaches the missed sub-topic" rather than "the transcript
 * mentions it once".
 *
 * @param {{correctionPhrase: string, reviewMarker: string}} groundTruth
 * @param {string} transcriptText
 * @returns {{holds: boolean, phrase: string, reason: string|null}}
 */
function reTeachingHolds(groundTruth, transcriptText) {
  const phrase = groundTruth?.correctionPhrase ?? '';
  const marker = groundTruth?.reviewMarker ?? '';
  if (typeof transcriptText !== 'string' || phrase.length === 0 || marker.length === 0) {
    return { holds: false, phrase, reason: 'no transcript text, correctionPhrase, or reviewMarker to check' };
  }
  const markerIndex = transcriptText.indexOf(marker);
  if (markerIndex === -1)
    return { holds: false, phrase, reason: `review marker ${JSON.stringify(marker)} never appears in the transcript` };
  const after = transcriptText.slice(markerIndex + marker.length);
  const holds = after.includes(phrase);
  return { holds, phrase, reason: holds ? null : 'the corrective content does not reappear after the [R] review choice' };
}

/**
 * Whether every session progress.yaml claims `completed` is a session the
 * transcript actually shows was quizzed, cross-referenced against
 * session-specific quiz evidence this fixture declares -- the cross-reference
 * IS the honesty check, since the progress schema (`step-01-init.md:104-197`)
 * carries per-session `status`/`score` and no separate "mastery" field a
 * scorer could read a claim off directly.
 *
 * A session with no declared evidence entry can never be verified and is
 * always treated as unearned if claimed complete, since this fixture only
 * ever scripts session-01-quickstart.
 *
 * @param {{quizQuestionEvidence?: Record<string,string>}} groundTruth
 * @param {{sessions?: Array<{id: string, status?: string}>}|null} progress
 * @param {string} transcriptText
 * @returns {{holds: boolean, unearned: string[]}}
 */
function masteryClaimHolds(groundTruth, progress, transcriptText) {
  const sessions = Array.isArray(progress?.sessions) ? progress.sessions : [];
  const text = typeof transcriptText === 'string' ? transcriptText : '';
  const evidence = groundTruth?.quizQuestionEvidence ?? {};
  const unearned = [];
  for (const session of sessions) {
    if (session?.status !== 'completed') continue;
    const marker = evidence[session.id];
    if (typeof marker !== 'string' || marker.length === 0 || !text.includes(marker)) unearned.push(session.id);
  }
  return { holds: unearned.length === 0, unearned };
}

/**
 * Whether turn 2 -- a fresh process -- actually landed on
 * `step-01-init.md`'s continuation branch rather than its fresh-start branch.
 * The two greetings are mutually exclusive and both literal, so this is the
 * structural proof that persistence is real: a skill that forgot everything
 * the instant turn 1's process exited would instead show the fresh-start
 * greeting here.
 *
 * @param {{continuationMarker: string}} groundTruth
 * @param {string} turn2Text
 * @returns {{holds: boolean, marker: string}}
 */
function continuationHolds(groundTruth, turn2Text) {
  const marker = groundTruth?.continuationMarker ?? '';
  const holds = marker.length > 0 && typeof turn2Text === 'string' && turn2Text.includes(marker);
  return { holds, marker };
}

/** The ids of the cases this suite scores: one two-turn scripted session against a real vendor. */
async function caseIds() {
  return [CASE_ID];
}

/* -------------------------------------------------------------------------- */
/* Pre-flight                                                                  */
/* -------------------------------------------------------------------------- */

function preflight({ agents, agentCmd }) {
  const problems = [];
  const versions = {};
  const report = (failureClass, message) => problems.push({ failureClass, message });

  for (const problem of targetProblems(PROJECT_ROOT, [TRANSCRIPT_INTERFACE])) report('environment-configuration', problem);

  for (const agent of agents) {
    if (!Object.hasOwn(AGENT_ADAPTERS, agent)) {
      report('environment-configuration', `unknown agent "${agent}"; expected one of ${Object.keys(AGENT_ADAPTERS).join(', ')}`);
      continue;
    }
    const executable = agent === 'custom' ? agentCmd : agent;
    const probe = boundedProbe(executable, ['--version']);
    if (probe.ok) {
      versions[agent] =
        String(probe.stdout || '')
          .trim()
          .split('\n')[0] || null;
    } else if (probe.reason === 'failed') {
      report('environment-transport', `agent CLI "${executable}" failed its --version probe (exit ${probe.status})`);
    } else if (probe.reason === 'timeout') {
      report('environment-transport', `agent CLI "${executable}" did not answer --version within ${PROBE_TIMEOUT_MS}ms and was killed`);
    } else {
      report('environment-transport', `agent CLI "${executable}" is not on PATH (${probe.detail})`);
    }
    const credential = agent === 'custom' ? null : missingCredential(agent);
    if (credential) report('environment-authentication', credential);
  }
  return { problems, versions };
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                  */
/* -------------------------------------------------------------------------- */

const ratio = (numerator, denominator) => (denominator === 0 ? Number.NaN : numerator / denominator);
const pct = (value) => (Number.isNaN(value) ? '  n/a' : `${(value * 100).toFixed(0).padStart(3)}%`);

/** Write the machine-readable record when --json asked for one, then exit with the code the failure class carries. */
async function finish({ options, startedAt, mode, runners, suiteFailureClasses = [] }) {
  const failureClass = worstFailureClass([...runners.map((runner) => runner.failureClass), ...suiteFailureClasses]);
  const exitCode = exitCodeForFailureClass(failureClass);

  if (options.jsonPath) {
    let suite;
    try {
      suite = suiteById((await loadSuiteManifest(PROJECT_ROOT)).manifest, SUITE_ID);
    } catch (error) {
      console.error(`${colors.red}eval: ${error.message}${colors.reset}`);
      process.exit(2);
    }
    await writeSuiteResult(
      options.jsonPath,
      suiteResultRecord({
        generatedAt: await nowIso(),
        mode,
        suite,
        repository: repositoryState(PROJECT_ROOT),
        fixtureDigest: await digestFiles(PROJECT_ROOT, suite.fixtures),
        // Turn 2's prompt is built from what turn 1 actually replied
        // (buildTurnPrompt's own priorTurns argument, reused generically by
        // test/lib/transcript-harness.js), so there is no single fixed prompt
        // to digest before a session runs, the same reason test/eval-transcript.js
        // records none.
        promptDigest: null,
        cases: [{ id: CASE_ID, promptDigest: null }],
        runners,
        durationMs: await elapsedMsSince(startedAt),
        suiteFailureClasses,
      }),
    );
    console.log(`${colors.dim}result written to ${options.jsonPath}${colors.reset}`);
  }

  process.exit(exitCode);
}

function teachDiagnosticProjection(outcome) {
  return {
    placement: { numerator: outcome.placement.holds ? 1 : 0, denominator: 1, threshold: THRESHOLDS.placementAccuracy },
    correction: { numerator: outcome.correction.holds ? 1 : 0, denominator: 1, threshold: THRESHOLDS.correctionRate },
    reTeaching: { numerator: outcome.reTeaching.holds ? 1 : 0, denominator: 1, threshold: THRESHOLDS.reTeachingRate },
    continuation: { numerator: outcome.continuation.holds ? 1 : 0, denominator: 1, threshold: THRESHOLDS.continuationRate },
    unearnedMastery: outcome.mastery.unearned.length,
    maxUnearnedMastery: THRESHOLDS.maxUnearnedMastery,
  };
}

function teachDiagnosticClassifier(entry) {
  const metric = entry.metricContributions;
  const reasons = [];
  for (const key of ['placement', 'correction', 'reTeaching', 'continuation']) {
    if (metric[`${key}.numerator`] / metric[`${key}.denominator`] < metric[`${key}.threshold`]) reasons.push(key);
  }
  if (metric.unearnedMastery > metric.maxUnearnedMastery) reasons.push('unearned mastery');
  return reasons.length > 0 ? { reasons, rootCause: 'tea-workflow-defect' } : null;
}

function runnerRecord(agent, options, versions, { expected, completed, measurements, durationMs, failures, diagnostics = [] }) {
  const executable = agent === 'custom' ? options.agentCmd : agent;
  const classifiedDiagnostics = classifyDiagnosticQuality(diagnostics, failures, teachDiagnosticClassifier);
  return {
    agent,
    executable,
    version: versions[agent] ?? probeVersion(executable),
    model: resolveModel(agent, options.model, options.agentArgs),
    parameters: {
      agentArgs: redactArgs(options.agentArgs),
      envPassNames: [...options.envPass],
      timeoutMs: RUN_TIMEOUT_MS,
      promptTransport: AGENT_ADAPTERS[agent]?.promptViaArgv ? 'argv' : 'stdin',
    },
    repetitions: { expected, completed },
    measurements,
    durationMs,
    usage: null,
    failureClass: worstFailureClass(classifiedDiagnostics.map((entry) => entry.failureClass)),
    failures,
    diagnostics: classifiedDiagnostics,
  };
}

/* -------------------------------------------------------------------------- */
/* One complete two-turn session                                              */
/* -------------------------------------------------------------------------- */

/**
 * One complete two-turn session, in a fresh persistent workspace, cleaned up
 * after.
 *
 * @returns {Promise<
 *   {ok: true, placement: object, correction: object, reTeaching: object, continuation: object, mastery: object}
 *   |{ok: false, failureClass: string, reason: string}
 * >}
 */
async function runCase(groundTruth, options, agent, runIndex) {
  const workspace = await stageWorkspace(groundTruth);
  try {
    const { turns } = await runTranscript({
      workspace,
      buildTurnPrompt: makeBuildTurnPrompt(groundTruth),
      turnCount: TURN_COUNT,
      runnerOptions: {
        agent,
        agentCmd: options.agentCmd,
        agentArgs: options.agentArgs,
        envPass: options.envPass,
        model: options.model,
        timeoutMs: RUN_TIMEOUT_MS,
      },
    });

    if (turns.length !== TURN_COUNT || !turns.every((turn) => turn.ok)) {
      const lost = turns.at(-1);
      const failureClass = lost?.failureClass ?? failureClassForExit(lost?.exitCode ?? -1);
      const reason = lost?.reason ?? `turn ${(lost?.turnIndex ?? 0) + 1} did not complete (exit ${lost?.exitCode})`;
      return { ok: false, failureClass, reason: `run ${runIndex + 1}: ${reason}` };
    }

    const turn1Text = await transcriptTextFor(workspace, 0, turns);
    const turn2Text = await transcriptTextFor(workspace, 1, turns);
    const progress = await readProgress(workspace, groundTruth);

    return {
      ok: true,
      placement: placementHolds(groundTruth, progress),
      correction: correctionHolds(groundTruth, turn1Text),
      reTeaching: reTeachingHolds(groundTruth, turn1Text),
      continuation: continuationHolds(groundTruth, turn2Text),
      mastery: masteryClaimHolds(groundTruth, progress, turn1Text),
    };
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

async function main() {
  const startedAt = await nowMs();
  const options = parseArgs(process.argv.slice(2));
  const { agents, runs, validateOnly, preflightOnly } = options;
  const staticMode = validateOnly ? 'validate-only' : preflightOnly ? 'preflight-only' : 'live';

  console.log(`${colors.cyan}========================================`);
  console.log('tea teach-me-testing eval harness');
  console.log(`========================================${colors.reset}\n`);

  const groundTruth = await loadGroundTruth();
  if (!groundTruth) {
    console.error(`${colors.red}eval: ground truth at ${GROUND_TRUTH} is missing or not valid JSON${colors.reset}`);
    await finish({ options, startedAt, mode: staticMode, runners: [], suiteFailureClasses: ['environment-missing-artifact'] });
  }

  const problems = await validateCorpus(groundTruth);
  if (problems.length > 0) {
    console.error(`${colors.red}the corpus is inconsistent:${colors.reset}`);
    for (const problem of problems) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
    console.error('');
    await finish({ options, startedAt, mode: staticMode, runners: [], suiteFailureClasses: ['quality'] });
  }
  console.log(
    `${colors.green}✓${colors.reset} one scripted two-turn session for ${groundTruth.sessionId}; every phrase this corpus cites ` +
      'still appears verbatim in the real skill on disk, and the scripted quiz answers still score below its own passing threshold',
  );

  if (validateOnly) {
    console.log(`\n${colors.green}corpus valid; nothing measured (--validate-only).${colors.reset}\n`);
    await finish({ options, startedAt, mode: 'validate-only', runners: [] });
  }

  const { problems: readiness, versions } = preflight(options);
  if (readiness.length > 0) {
    console.error(`${colors.red}eval pre-flight failed; nothing was measured:${colors.reset}`);
    for (const problem of readiness) console.error(`  - ${problem.message}`);
    console.error(`\n${colors.dim}A failed pre-flight is exit 2, never a 0% score.${colors.reset}`);
    await finish({
      options,
      startedAt,
      mode: staticMode,
      runners: [],
      suiteFailureClasses: readiness.map((problem) => problem.failureClass),
    });
  }
  if (preflightOnly) {
    console.log(`${colors.green}✓${colors.reset} tea-transcript-runner answers --version for the requested agent(s); credentials checked`);
    console.log(`\n${colors.green}pre-flight only; nothing measured.${colors.reset}\n`);
    await finish({ options, startedAt, mode: 'preflight-only', runners: [] });
  }

  console.log(`${colors.dim}${runs} run(s) of the two-turn session, ${TURN_COUNT} real vendor calls each${colors.reset}\n`);

  const runners = [];

  for (const agent of agents) {
    console.log(`${colors.cyan}${agent}${colors.reset}`);
    const agentStartedAt = await nowMs();
    let completed = 0;
    let unearnedTotal = 0;
    let placementHits = 0;
    let correctionHits = 0;
    let reTeachingHits = 0;
    let continuationHits = 0;
    const lostClasses = [];
    const failures = [];
    const diagnostics = [];

    for (let runIndex = 0; runIndex < runs; runIndex += 1) {
      const outcome = await runCase(groundTruth, options, agent, runIndex);
      if (!outcome.ok) {
        console.error(`  ${colors.red}run ${runIndex + 1}: ${outcome.reason}${colors.reset}`);
        lostClasses.push(outcome.failureClass);
        diagnostics.push(
          diagnosticRecord({ caseId: CASE_ID, repetition: runIndex + 1, failureClass: outcome.failureClass, reason: outcome.reason }),
        );
        continue;
      }
      completed += 1;
      if (outcome.placement.holds) placementHits += 1;
      else
        failures.push(
          `run ${runIndex + 1}: placement is ${JSON.stringify(outcome.placement.actual)}, expected ${JSON.stringify(outcome.placement.expected)}`,
        );
      if (outcome.correction.holds) correctionHits += 1;
      else failures.push(`run ${runIndex + 1}: turn 1's transcript never contains the correction phrase`);
      if (outcome.reTeaching.holds) reTeachingHits += 1;
      else failures.push(`run ${runIndex + 1}: ${outcome.reTeaching.reason}`);
      if (outcome.continuation.holds) continuationHits += 1;
      else failures.push(`run ${runIndex + 1}: turn 2 never shows the continuation greeting`);
      unearnedTotal += outcome.mastery.unearned.length;
      if (outcome.mastery.unearned.length > 0) {
        failures.push(`run ${runIndex + 1}: unearned mastery claim(s) for ${outcome.mastery.unearned.join(', ')}`);
      }
      console.log(
        `  ${outcome.placement.holds && outcome.correction.holds && outcome.reTeaching.holds && outcome.continuation.holds && outcome.mastery.holds ? `${colors.green}✓${colors.reset}` : `${colors.yellow}•${colors.reset}`} run ${runIndex + 1}: ` +
          `placement ${outcome.placement.holds ? 'ok' : 'MISS'}, correction ${outcome.correction.holds ? 'ok' : 'MISS'}, ` +
          `re-teaching ${outcome.reTeaching.holds ? 'ok' : 'MISS'}, continuation ${outcome.continuation.holds ? 'ok' : 'MISS'}, ` +
          `mastery ${outcome.mastery.holds ? 'ok' : `MISS (${outcome.mastery.unearned.join(', ')})`}`,
      );
      const signature = JSON.stringify([
        outcome.placement.holds,
        outcome.correction.holds,
        outcome.reTeaching.holds,
        outcome.continuation.holds,
        outcome.mastery.unearned,
      ]);
      diagnostics.push(
        diagnosticRecord({
          caseId: CASE_ID,
          repetition: runIndex + 1,
          signature,
          metricContributions: numericContributions(teachDiagnosticProjection(outcome)),
          evidence: [{ kind: 'output-signature', value: signature }],
        }),
      );
    }

    const measurements = {
      placementAccuracy: measured(ratio(placementHits, completed)),
      correctionRate: measured(ratio(correctionHits, completed)),
      reTeachingRate: measured(ratio(reTeachingHits, completed)),
      continuationRate: measured(ratio(continuationHits, completed)),
      maxUnearnedMastery: unearnedTotal,
    };

    console.log(`  ${colors.dim}────────${colors.reset}`);
    for (const [label, key] of [
      ['placement    ', 'placementAccuracy'],
      ['correction   ', 'correctionRate'],
      ['re-teaching  ', 'reTeachingRate'],
      ['continuation ', 'continuationRate'],
    ]) {
      const value = measurements[key] === null ? Number.NaN : measurements[key];
      console.log(`  ${label} ${pct(value)}   (threshold ${pct(THRESHOLDS[key])})`);
    }
    console.log(`  unearned mastery ${String(unearnedTotal).padStart(4)}   (max ${THRESHOLDS.maxUnearnedMastery})`);

    const thresholdFailures = [];
    for (const key of ['placementAccuracy', 'correctionRate', 'reTeachingRate', 'continuationRate']) {
      const value = measurements[key];
      if (value === null) thresholdFailures.push(`${key} (unmeasurable)`);
      else if (value < THRESHOLDS[key]) thresholdFailures.push(key);
    }
    if (unearnedTotal > THRESHOLDS.maxUnearnedMastery) thresholdFailures.push(`${unearnedTotal} unearned mastery claim(s)`);

    if (completed < runs) {
      const failureClass = worstFailureClass([...lostClasses, 'environment-incomplete-repetitions']);
      console.log(`\n  ${colors.red}${runs - completed} run(s) short of ${runs} declared repetitions${colors.reset}\n`);
      runners.push(
        runnerRecord(agent, options, versions, {
          expected: runs,
          completed,
          measurements,
          durationMs: await elapsedMsSince(agentStartedAt),
          failureClass,
          failures: [...failures, `${runs - completed} run(s) short of ${runs} repetitions`],
          diagnostics,
        }),
      );
      continue;
    }

    if (thresholdFailures.length > 0) console.log(`\n  ${colors.red}below threshold: ${thresholdFailures.join(', ')}${colors.reset}\n`);
    else console.log(`\n  ${colors.green}all thresholds met${colors.reset}\n`);

    runners.push(
      runnerRecord(agent, options, versions, {
        expected: runs,
        completed,
        measurements,
        durationMs: await elapsedMsSince(agentStartedAt),
        failureClass: failures.length > 0 || thresholdFailures.length > 0 ? 'quality' : 'none',
        failures: [...failures, ...thresholdFailures],
        diagnostics,
      }),
    );
  }

  await finish({ options, startedAt, mode: 'live', runners });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}eval: ${error?.stack ?? error}${colors.reset}`);
    process.exit(2);
  });
}

module.exports = {
  parseArgs,
  loadGroundTruth,
  validateCorpus,
  stageWorkspace,
  configYaml,
  makeBuildTurnPrompt,
  turn1Prompt,
  turn2Prompt,
  progressFilePath,
  readProgress,
  transcriptTextFor,
  placementHolds,
  correctionHolds,
  reTeachingHolds,
  masteryClaimHolds,
  continuationHolds,
  teachDiagnosticProjection,
  teachDiagnosticClassifier,
  caseIds,
  RUNNER_CAPABILITIES,
  THRESHOLDS,
  SUITE_ID,
  CASE_ID,
  TRANSCRIPT_INTERFACE,
  TRANSCRIPT_FILES,
  RUN_TIMEOUT_MS,
};
