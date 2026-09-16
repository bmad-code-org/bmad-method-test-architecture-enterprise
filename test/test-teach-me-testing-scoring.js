/**
 * Proof that test/eval-teach-me-testing.js's four scoring functions actually
 * fail on a hand-built violation and pass on a hand-built consistent case,
 * before test/eval-teach-me-testing.js is trusted to score a real, live-cost
 * run with them.
 *
 * Every check here builds its own synthetic ground truth, transcript text, and
 * progress object directly -- no process spawn, no corpus dependency, no read
 * of test/fixtures/teach-me-testing-eval/ground-truth.json -- the same
 * discipline test/test-atdd-scoring.js already uses for a comparably
 * structural claim (scoreRun's assertion-provenance requirement). A pure
 * function over plain data does not need a staged workspace to be proven
 * correct.
 *
 * WHAT IS PROVEN
 *
 *   placementHolds     holds when progress.yaml's experience_level equals the
 *                       fixture's declared level, fails when it names a
 *                       different one
 *   correctionHolds     holds when a transcript contains the correction
 *                       phrase, fails when it is absent
 *   reTeachingHolds     holds when the correction phrase reappears AFTER the
 *                       [R] review marker, fails when it appears only before
 *                       the marker -- the property that separates "the review
 *                       actually re-teaches it" from "the transcript mentions
 *                       it once, from the original mistake"
 *   masteryClaimHolds   holds when every session progress.yaml claims
 *                       `completed` has matching quiz evidence in the
 *                       transcript, fails and names the session when one does
 *                       not -- proven against a hand-built progress object
 *                       claiming an untested session's mastery, the exact
 *                       scenario the story spec requires
 *
 * A bonus block proves continuationHolds, the harness's own additional check
 * for turn 2 landing on the continuation branch rather than the fresh-start
 * branch; it is not one of the four the story spec names, but it is the same
 * pure-function shape and just as cheap to prove.
 *
 * Usage: node test/test-teach-me-testing-scoring.js
 * Exit codes: 0 every property held, 1 a property did not hold
 */

'use strict';

const { placementHolds, correctionHolds, reTeachingHolds, masteryClaimHolds, continuationHolds } = require('./eval-teach-me-testing');

const colors = { reset: '[0m', red: '[31m', green: '[32m', dim: '[2m' };
let failures = 0;

function assert(condition, label, detail) {
  if (condition) {
    console.log(`  ${colors.green}✓${colors.reset} ${label}`);
    return;
  }
  failures += 1;
  console.log(`  ${colors.red}✗ ${label}${colors.reset}`);
  if (detail) console.log(`    ${colors.dim}${detail}${colors.reset}`);
}

function main() {
  console.log('the four teach-me-testing scoring functions, each proven to fail on a violation and pass on a consistent case\n');

  // --- placementHolds --------------------------------------------------
  console.log('placementHolds');
  const placementGroundTruth = { declaredLevel: 'Beginner' };
  const goodPlacement = placementHolds(placementGroundTruth, { experience_level: 'Beginner' });
  assert(goodPlacement.holds === true, 'holds when progress.yaml records the declared level', JSON.stringify(goodPlacement));
  const wrongPlacement = placementHolds(placementGroundTruth, { experience_level: 'Intermediate' });
  assert(
    wrongPlacement.holds === false && wrongPlacement.expected === 'Beginner' && wrongPlacement.actual === 'Intermediate',
    'fails, naming both sides, when progress.yaml records a different level',
    JSON.stringify(wrongPlacement),
  );
  const missingPlacement = placementHolds(placementGroundTruth, null);
  assert(missingPlacement.holds === false, 'fails when progress.yaml itself is absent (parsed as null)', JSON.stringify(missingPlacement));

  // --- correctionHolds ---------------------------------------------------
  console.log('\ncorrectionHolds');
  const correctionGroundTruth = { correctionPhrase: "TEA's purpose is to make testing expertise accessible (B)" };
  const correctedTranscript =
    'Facilitator: Question 1 of 3...\nLearner: A\nFacilitator: ❌ Not quite. ' +
    "TEA's purpose is to make testing expertise accessible (B). It's not about replacing tools.";
  const goodCorrection = correctionHolds(correctionGroundTruth, correctedTranscript);
  assert(
    goodCorrection.holds === true,
    "holds when the transcript contains the step file's own verbatim correction text",
    JSON.stringify(goodCorrection),
  );
  const passedOverTranscript = 'Facilitator: Question 1 of 3...\nLearner: A\nFacilitator: ❌ Not quite, the answer was B.';
  const missedCorrection = correctionHolds(correctionGroundTruth, passedOverTranscript);
  assert(
    missedCorrection.holds === false,
    'fails when the transcript never contains the verbatim correction text, even if it gestures at being wrong',
    JSON.stringify(missedCorrection),
  );

  // --- reTeachingHolds -----------------------------------------------------
  console.log('\nreTeachingHolds');
  const reTeachingGroundTruth = { correctionPhrase: 'purpose is to make testing expertise accessible', reviewMarker: '[R]' };
  const reviewedTranscript = [
    'Facilitator: ❌ Not quite. purpose is to make testing expertise accessible, not to replace every tool.',
    'Learner: [R]',
    "Facilitator: Let's review. As a reminder, purpose is to make testing expertise accessible through structured workflows.",
  ].join('\n');
  const goodReTeaching = reTeachingHolds(reTeachingGroundTruth, reviewedTranscript);
  assert(
    goodReTeaching.holds === true,
    'holds when the corrective content reappears in the transcript AFTER the [R] review choice',
    JSON.stringify(goodReTeaching),
  );
  const contentFreeReview = [
    'Facilitator: ❌ Not quite. purpose is to make testing expertise accessible, not to replace every tool.',
    'Learner: [R]',
    "Facilitator: Sure, let's go over Session 1 again. TEA Lite is a 30-minute quick start.",
  ].join('\n');
  const missedReTeaching = reTeachingHolds(reTeachingGroundTruth, contentFreeReview);
  assert(
    missedReTeaching.holds === false,
    'fails when the corrective content appears only BEFORE the [R] choice and is not actually re-taught by the review',
    JSON.stringify(missedReTeaching),
  );
  const noMarkerAtAll = 'Facilitator: ❌ Not quite. purpose is to make testing expertise accessible.\nLearner: [C]';
  const noReviewChosen = reTeachingHolds(reTeachingGroundTruth, noMarkerAtAll);
  assert(
    noReviewChosen.holds === false && /never appears/.test(noReviewChosen.reason ?? ''),
    'fails, naming the reason, when the [R] marker never appears in the transcript at all',
    JSON.stringify(noReviewChosen),
  );

  // --- masteryClaimHolds ---------------------------------------------------
  console.log('\nmasteryClaimHolds');
  const masteryGroundTruth = {
    quizQuestionEvidence: { 'session-01-quickstart': 'What is the primary purpose of TEA?' },
  };
  const earnedTranscript = 'Question 1 of 3: What is the primary purpose of TEA?\nLearner: A\nFacilitator: not quite...';
  const earnedProgress = { sessions: [{ id: 'session-01-quickstart', status: 'completed' }] };
  const goodMastery = masteryClaimHolds(masteryGroundTruth, earnedProgress, earnedTranscript);
  assert(
    goodMastery.holds === true && goodMastery.unearned.length === 0,
    'holds when every session claimed complete has matching quiz evidence in the transcript',
    JSON.stringify(goodMastery),
  );

  // The exact scenario the story spec requires: a hand-built progress object
  // claiming an untested session's mastery.
  const lyingProgress = {
    sessions: [
      { id: 'session-01-quickstart', status: 'completed' },
      { id: 'session-02-concepts', status: 'completed' },
    ],
  };
  const untestedMastery = masteryClaimHolds(masteryGroundTruth, lyingProgress, earnedTranscript);
  assert(
    untestedMastery.holds === false && untestedMastery.unearned.length === 1 && untestedMastery.unearned[0] === 'session-02-concepts',
    'fails, naming the unearned session, when progress.yaml claims a session complete the transcript never shows was quizzed',
    JSON.stringify(untestedMastery),
  );

  const notStartedProgress = {
    sessions: [
      { id: 'session-01-quickstart', status: 'completed' },
      { id: 'session-02-concepts', status: 'not-started' },
    ],
  };
  const noFalsePositive = masteryClaimHolds(masteryGroundTruth, notStartedProgress, earnedTranscript);
  assert(
    noFalsePositive.holds === true,
    'a session progress.yaml never claims complete is not flagged, even with no quiz evidence for it -- only a claim can be unearned',
    JSON.stringify(noFalsePositive),
  );

  // --- continuationHolds (bonus: not one of the story's four, same shape) --
  console.log("\ncontinuationHolds (bonus, proves the harness's own turn-2 persistence check)");
  const continuationGroundTruth = { continuationMarker: 'Welcome back' };
  const foundProgress = continuationHolds(continuationGroundTruth, '✅ **Welcome back!** I found your existing progress.');
  assert(foundProgress.holds === true, 'holds when turn 2 shows the continuation greeting', JSON.stringify(foundProgress));
  const forgotEverything = continuationHolds(continuationGroundTruth, "📝 **Starting fresh!** I'll create your progress tracking file.");
  assert(
    forgotEverything.holds === false,
    'fails when turn 2 shows the fresh-start greeting instead, as it would if persistence were not real',
    JSON.stringify(forgotEverything),
  );

  console.log('');
  if (failures > 0) {
    console.log(`${colors.red}${failures} propert${failures === 1 ? 'y' : 'ies'} did not hold.${colors.reset}\n`);
    process.exit(1);
  }
  console.log(`${colors.green}every teach-me-testing scoring property held.${colors.reset}\n`);
}

main();
