/**
 * Deterministically compute `step-02-discover-tests.md` §2b's "convention baseline"
 * instead of asking the review agent to sample and self-report it.
 *
 * Why this exists: couture-cast PR #106's codex-run review reported
 * "Convention: priorityMarkers (18 of 40 sampled)" against a repo that has zero
 * real instances of a P0-P3 marker anywhere (verified with a repo-wide grep). The
 * skill's own design (§2b) already anticipated and forbade exactly this — "Guessing
 * a convention is worse than admitting it wasn't measured" — but nothing enforced
 * it: the sampling was entirely delegated to the agent's prompt-following honor
 * system, so a plausible-sounding number could be generated without a single file
 * actually being read.
 *
 * Same fix as everywhere else in this CLI (the review set, the deduction score, the
 * recommendation): whatever can be computed deterministically and cheaply is
 * computed here, stated in the prompt as a fixed fact, and cross-checked against
 * the report afterward (see parse-report.js's verifyConventionBaseline). The agent
 * is never asked to produce a number this module can produce itself.
 *
 * Two tiers of grounding:
 * - corpusSize / sampled / sampledFiles: 100% mechanical (git ls-files, a real test
 *   filename with fixture trees excluded, directory-distance ranking, then a stride
 *   of 8 across the closest 40) — this is exactly step-02 §2b's sampling rules, just
 *   executed by code instead of described in prose. A report
 *   that cites a different sampled count is provably wrong and rejected outright.
 *   (verifyConventionBaseline checks the count; the corpus itself travels in the
 *   prompt as a do-not-substitute list and is not re-derivable from the report.)
 * - adopted counts for the six keys with a concrete, literal recognized form
 *   (priorityMarkers, testIds, networkFirst, dataFactories, fixtures, playwrightUtils): a generous,
 *   high-recall regex scan over the real sampled files' real content. This is not
 *   claimed to be a precise semantic judgment — a regex cannot know intent — but it
 *   gives a safe one-directional floor: when the scan finds ZERO occurrences of any
 *   recognized form anywhere in the entire scanned corpus, the true adopted count is
 *   zero with very high confidence (a looser scan finding nothing all but rules out
 *   a careful reader finding something), so the report may never claim otherwise.
 *   That scan reads up to 40 files, wider than the 8 the agent is asked to read,
 *   because this module opens them itself and pays no agent turn for any of them.
 *   The floor is only as strong as the corpus it observed nothing in.
 *   The two keys with no literal recognized form (bddNaming — a naming *style*, not
 *   a token; assertionStyle — dialect consistency) get no mechanical signal and stay
 *   fully agent-judged; only their sampled/corpusSize grounding applies. This is an
 *   honest limitation, not an oversight: a regex loose enough to catch every BDD-ish
 *   test name would also be loose enough to approve almost anything, which defeats
 *   the point of a floor check.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { isTestFile } = require('./changed-tests');

// Same order as step-02-discover-tests.md §2b's "Conventions to measure" table and
// criteria-registry.md's mapping table. Every consumer of this list (build-prompt,
// parse-report, the tests) shares this one array so the eight keys cannot drift.
const CONVENTION_KEYS = [
  'priorityMarkers',
  'testIds',
  'bddNaming',
  'networkFirst',
  'dataFactories',
  'fixtures',
  'assertionStyle',
  'playwrightUtils',
];

// The sample is the review's single largest input, and it is paid on every run
// regardless of how small the pull request is. The agent has no shell (see
// agent-adapters.js's claude tool list), so a sampled file can only be opened one
// Read at a time: the cap is a turn budget as much as a byte budget. At 40, and
// measured on this repository against a one-file review set, the sample was
// ~609 KB of files that were not in the diff; at 8 it is ~289 KB, over five times
// fewer reads.
//
// Eight keeps the two properties the cap has to keep. It stays above
// step-02-discover-tests.md §2b's `sampled < 4` "corpus too small to infer a
// house rule" floor with margin, and it leaves enough files for §2b's 0.5
// established/emerging ratio to mean something. Changing this changes the number
// every report cites, so step-02 §2b's "Sampling rules" states the same figure.
const MAX_SAMPLED_FILES = 8;

// The mechanical scan is a different budget from the read set, so it gets its own
// cap. Nothing the agent does bounds it: this module opens the files itself with
// fs.readFileSync and runs six regexes, which costs milliseconds and no turns at
// all. Shrinking it alongside the read set would have quietly weakened the one
// claim the scan exists to make. `mechanicalSignal: false` is what forbids the
// report from citing any adoption for a key (see conventionBaselinePromptLines
// and parse-report.js's verifyConventionBaseline), and a zero observed over 8
// files is much weaker evidence of absence than a zero observed over 40. The
// floor keeps its old corpus; only the agent's reading got cheaper.
const MAX_SCANNED_FILES = 40;
const MIN_CORPUS_TO_ATTEMPT = 1; // 0 eligible files outside the review set: nothing to sample at all.

// One regex per mechanically-recognizable key, matched against a sampled file's raw
// content (case-insensitive, no /g flag so repeated .test() calls carry no state).
// Deliberately high-recall: a false positive here only ever makes the zero-signal
// floor check more permissive (it stops treating a convention as unattested), never
// less — see the module doc comment. Each detector must match what the "Adopted when
// a sampled file..." column in step-02-discover-tests.md's table says, so a headless
// run and an interactive run count the same corpus. Changing one means changing both.
const MECHANICAL_DETECTORS = {
  priorityMarkers: /(\[P[0-3]\]|@P[0-3]\b|['"`]@?P[0-3]['"`]|\bpriority\s*:\s*['"`]?P[0-3]\b)/i,
  testIds: /(data-testid|data-test-id|getByTestId|test-id\s*=|testid\s*=)/i,
  networkFirst:
    /(interceptNetworkCall\s*\(|page\.route\s*\(|cy\.intercept\s*\(|waitForResponse\s*\(|waitForRequest\s*\(|route\.fulfill\s*\()/i,
  dataFactories: /(\bbuild[A-Z]\w*\s*\(|\bFactory\s*\(|from\s+['"][^'"]*factories|\bfactories\/)/i,
  fixtures: /(mergeTests\s*\(|test\.extend\s*\(|from\s+['"][^'"]*fixtures|merged-fixtures)/i,
  // Only the package literal. `merged-fixtures` is already the `fixtures` key's
  // signal, and a hand-rolled merged-fixtures.ts with no playwright-utils anywhere
  // would otherwise register adoption for a package the repo never installed.
  // Import-shaped only. The bare package literal also matches a prose mention in a
  // comment ("// TODO: migrate to @seontechnologies/playwright-utils"), which would
  // register adoption for a file that uses none of it.
  playwrightUtils: /(?:from|require\s*\(|import\s*\()\s*['"`]@seontechnologies\/playwright-utils/i,
};

// §2b says "Sample test files". `isTestFile` is deliberately wider than that,
// because the review set has to catch a changed helper sitting under a test
// directory, and a directory-only match is enough there. It is not enough here. A
// convention baseline built from files that are not tests measures the wrong thing:
// on this repository the directory rule pulled in `stub-agent.js` and a React
// component under `trace-eval/clean/src/tokens/`, and the house Playwright
// convention was being established partly from those.
const NAMED_TEST_FILE_PATTERNS = [
  /^test_.*\.py$/,
  /_test\.py$/,
  /_test\.go$/,
  /_spec\.rb$/,
  /\.cy\.[^.]+$/,
  /Test\.php$/,
  /Tests?\.cs$/,
  /Tests?\.java$/,
  /\.pacttest\.[^.]+$/,
  /\.test\.[^.]+$/,
  /\.spec\.[^.]+$/,
  /\.test-[^.]+\.[^.]+$/,
];

// A repository's test-tooling fixtures are not its test suite. A spec under a
// directory that declares itself fixture data is an input to some other test, and
// the sharpest case is a seeded-defect corpus: this repository keeps deliberately
// bad specs under `test/fixtures/test-review-eval/seeded/` for its own evals to
// score against, and sampling those to establish "what this repo does" would
// establish the anti-patterns. Costs a consumer repository nothing, since spec
// files rarely live under a fixtures directory there, and when the exclusion empties
// the corpus the baseline reports itself unavailable rather than guessing.
const FIXTURE_TREE_PATTERN = /(^|\/)(fixtures|__fixtures__|__mocks__|testdata)(\/|$)/;

/** Whether a path is a real test file for baseline purposes: named like one, and not fixture data. */
function isConventionCorpusFile(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  if (FIXTURE_TREE_PATTERN.test(normalized)) {
    return false;
  }
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
  return NAMED_TEST_FILE_PATTERNS.some((pattern) => pattern.test(basename));
}

const MECHANICAL_CONVENTION_KEYS = Object.keys(MECHANICAL_DETECTORS);
// bddNaming and assertionStyle: no literal token distinguishes "adopted" from "not",
// so no mechanical signal is offered for them. Grounded on sampled/corpusSize only.
const JUDGMENT_ONLY_CONVENTION_KEYS = CONVENTION_KEYS.filter((key) => !MECHANICAL_CONVENTION_KEYS.includes(key));

/**
 * List every git-tracked file in the repo, repo-relative POSIX paths.
 *
 * @param {string} projectRoot
 * @returns {string[]|null} File list, or null when git ls-files could not run
 *   (not a git repo, or some other git failure) — treated as baseline-unavailable
 *   by the caller rather than thrown, matching step-02's own "shallow clone with
 *   nothing else checked out" fallback case.
 */
function listGitTrackedFiles(projectRoot) {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', 'ls-files', '-z'], { cwd: projectRoot, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    return null;
  }
  return result.stdout.split('\0').filter(Boolean);
}

/** The directory portion of a repo-relative POSIX path ('' for a root-level file). */
function directoryOf(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '' : normalized.slice(0, index);
}

/** Path-segment distance between two directories: segments not on their shared prefix, both sides counted. */
function directoryDistance(dirA, dirB) {
  const a = dirA.split('/').filter(Boolean);
  const b = dirB.split('/').filter(Boolean);
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) {
    common++;
  }
  return a.length - common + (b.length - common);
}

/** Minimum directory distance from a candidate file to any reviewed file's directory. */
function closestDistance(candidateDir, reviewedDirs) {
  let min = Number.POSITIVE_INFINITY;
  for (const reviewedDir of reviewedDirs) {
    const distance = directoryDistance(candidateDir, reviewedDir);
    if (distance < min) {
      min = distance;
    }
  }
  return min;
}

/**
 * Mechanically measure adoption of the six literal-form conventions across the
 * scanned files' real content.
 *
 * @param {object} options
 * @param {string} options.projectRoot
 * @param {string[]} options.sampledFiles - Repo-relative paths, already capped/ranked.
 *   This is the scanned corpus, which is wider than the agent's read set; see
 *   computeConventionBaseline's `scanned` field.
 * @returns {object} One entry per CONVENTION_KEYS, `{ mechanical: false }` for the
 *   two judgment-only keys, `{ mechanical: true, adopted, mechanicalSignal }` for
 *   the rest. `mechanicalSignal` is `adopted > 0`, i.e. whether the scan found the
 *   convention anywhere at all in the scanned corpus.
 */
function measureConventions({ projectRoot, sampledFiles }) {
  const conventions = {};
  for (const key of CONVENTION_KEYS) {
    const detector = MECHANICAL_DETECTORS[key];
    if (!detector) {
      conventions[key] = { mechanical: false };
      continue;
    }
    let adopted = 0;
    for (const file of sampledFiles) {
      let content;
      try {
        content = fs.readFileSync(path.join(projectRoot, file), 'utf8');
      } catch {
        continue; // unreadable file contributes no signal either way, not a crash
      }
      if (detector.test(content)) {
        adopted++;
      }
    }
    conventions[key] = { mechanical: true, adopted, mechanicalSignal: adopted > 0 };
  }
  return conventions;
}

/**
 * Take `count` entries spread evenly across `ranked`, always including its head.
 *
 * Taking the first `count` instead would be wrong in a way that hides itself.
 * Every file in the reviewed file's own directory has distance 0, so within that
 * directory the ranking is the alphabetical tie-break and nothing else. At a cap of
 * 40 against a 45-file corpus that never showed, because the sample was almost the
 * whole corpus. At a cap of 8 the tie-break becomes the selector: measured on this
 * repository, a review anchored in `test/` sampled `eval-all.js` through
 * `test-contracts.js` and nothing named `test-e*` or later was reachable by any
 * review, ever. That is a systematic wrong draw rather than a noisy one, and a
 * systematic draw has no error bars to argue about.
 *
 * Striding keeps every property the head had. It is deterministic (same ranking,
 * same indices, same files on every machine), it stays inside the reviewed file's
 * neighborhood (the whole stride runs over the closest `scanCap` files), and it
 * costs the same `count` reads. What it adds is that the sample spans the corpus
 * it claims to describe.
 *
 * @param {string[]} ranked - Ranked file list, closest-first.
 * @param {number} count - How many to take.
 * @returns {string[]} Up to `count` files, in ranked order.
 */
function strideSelect(ranked, count) {
  if (count >= ranked.length) {
    return [...ranked];
  }
  const picked = [];
  for (let index = 0; index < count; index++) {
    picked.push(ranked[Math.floor((index * ranked.length) / count)]);
  }
  return picked;
}

function unavailable(reason) {
  return { baselineUnavailable: true, reason, corpusSize: 0, sampled: 0, scanned: 0, sampledFiles: [], conventions: {} };
}

/**
 * Compute the convention baseline for a review run: the real corpus outside the
 * review set, ranked closest-first by directory distance, plus a mechanical
 * adoption scan over real file content.
 *
 * Two corpora come out of the one ranking, and they are different sizes on purpose.
 * `scanned` (the closest 40) is how many files this module opened itself for the
 * mechanical detectors. `sampledFiles` (8, per step-02-discover-tests.md §2b's
 * sampling rules) is a stride across those 40, and it is what the agent is told to
 * read and the denominator every report cites. The first is not a turn budget and
 * the second is, so keeping the scan wide costs milliseconds and keeps the
 * zero-signal floor standing on the evidence it always had.
 *
 * @param {object} options
 * @param {string} options.projectRoot - Repo root (git ls-files runs here).
 * @param {string[]} options.reviewFiles - The review set; excluded from sampling and
 *   used as the distance anchor.
 * @param {number} [options.cap] - Agent read-set cap (default 8, matching step-02).
 * @param {number} [options.scanCap] - Mechanical scan cap (default 40). Raised to
 *   `cap` when it is smaller, since the read set is always drawn from the scanned
 *   corpus.
 * @returns {object} `{ baselineUnavailable: true, reason, ... }` when no corpus
 *   exists outside the review set (or git ls-files failed), otherwise
 *   `{ baselineUnavailable: false, corpusSize, sampled, scanned, sampledFiles, conventions }`.
 */
function computeConventionBaseline({ projectRoot, reviewFiles, cap = MAX_SAMPLED_FILES, scanCap = MAX_SCANNED_FILES }) {
  const tracked = listGitTrackedFiles(projectRoot);
  if (tracked === null) {
    return unavailable('could not list repository files (git ls-files failed; not a git repo, or a git error)');
  }

  const reviewSet = new Set(reviewFiles.map((file) => file.replaceAll('\\', '/')));
  const eligible = tracked.filter((file) => isTestFile(file) && isConventionCorpusFile(file) && !reviewSet.has(file));
  const corpusSize = eligible.length;
  if (corpusSize < MIN_CORPUS_TO_ATTEMPT) {
    return unavailable(
      'no test files exist outside the review set to measure a house convention against (fixture and test-data trees are excluded)',
    );
  }

  const reviewedDirs = reviewFiles.length > 0 ? reviewFiles.map(directoryOf) : [''];
  const ranked = eligible
    .map((file) => ({ file, distance: closestDistance(directoryOf(file), reviewedDirs) }))
    // Plain code-unit comparison, not localeCompare: the tie-break order has to be
    // the same sampled set on every machine regardless of the runtime's ICU/locale
    // data, or "deterministic sampling" would itself be an environment-dependent claim.
    .sort((a, b) => a.distance - b.distance || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const scannedFiles = ranked.slice(0, Math.max(cap, scanCap)).map((entry) => entry.file);
  const sampledFiles = strideSelect(scannedFiles, cap);

  return {
    baselineUnavailable: false,
    reason: null,
    corpusSize,
    sampled: sampledFiles.length,
    scanned: scannedFiles.length,
    sampledFiles,
    conventions: measureConventions({ projectRoot, sampledFiles: scannedFiles }),
  };
}

module.exports = {
  computeConventionBaseline,
  CONVENTION_KEYS,
  MECHANICAL_CONVENTION_KEYS,
  JUDGMENT_ONLY_CONVENTION_KEYS,
  // Exposed for tests only: unit-test the pure helpers without shelling out to git.
  directoryDistance,
  directoryOf,
  measureConventions,
  strideSelect,
  isConventionCorpusFile,
};
