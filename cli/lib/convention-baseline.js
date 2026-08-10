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
 * - corpusSize / sampled / sampledFiles: 100% mechanical (git ls-files, isTestFile,
 *   directory-distance ranking, a 40-file cap) — this is exactly step-02 §2b's
 *   sampling rules, just executed by code instead of described in prose. A report
 *   that cites a different sampled count, or a different corpus, is provably wrong
 *   and rejected outright.
 * - adopted counts for the five keys with a concrete, literal recognized form
 *   (priorityMarkers, testIds, networkFirst, dataFactories, fixtures): a generous,
 *   high-recall regex scan over the real sampled files' real content. This is not
 *   claimed to be a precise semantic judgment — a regex cannot know intent — but it
 *   gives a safe one-directional floor: when the scan finds ZERO occurrences of any
 *   recognized form anywhere in the entire sampled corpus, the true adopted count is
 *   zero with very high confidence (a looser scan finding nothing all but rules out
 *   a careful reader finding something), so the report may never claim otherwise.
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
// parse-report, the tests) shares this one array so the seven keys cannot drift.
const CONVENTION_KEYS = ['priorityMarkers', 'testIds', 'bddNaming', 'networkFirst', 'dataFactories', 'fixtures', 'assertionStyle'];

const MAX_SAMPLED_FILES = 40;
const MIN_CORPUS_TO_ATTEMPT = 1; // 0 eligible files outside the review set: nothing to sample at all.

// One regex per mechanically-recognizable key, matched against a sampled file's raw
// content (case-insensitive, no /g flag so repeated .test() calls carry no state).
// Deliberately high-recall: a false positive here only ever makes the zero-signal
// floor check more permissive (it stops treating a convention as unattested), never
// less — see the module doc comment. The literal forms mirror the "Record as `form`"
// examples in step-02-discover-tests.md's table.
const MECHANICAL_DETECTORS = {
  priorityMarkers: /(\[P[0-3]\]|@P[0-3]\b|['"`]@?P[0-3]['"`]|\bpriority\s*:\s*['"`]?P[0-3]\b)/i,
  testIds: /(data-testid|data-test-id|getByTestId|test-id\s*=|testid\s*=)/i,
  networkFirst:
    /(interceptNetworkCall\s*\(|page\.route\s*\(|cy\.intercept\s*\(|waitForResponse\s*\(|waitForRequest\s*\(|route\.fulfill\s*\()/i,
  dataFactories: /(\bbuild[A-Z]\w*\s*\(|\bFactory\s*\(|from\s+['"][^'"]*factories|\bfactories\/)/i,
  fixtures: /(mergeTests\s*\(|test\.extend\s*\(|from\s+['"][^'"]*fixtures|merged-fixtures)/i,
};

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
 * Mechanically measure adoption of the five literal-form conventions across the
 * already-sampled files' real content.
 *
 * @param {object} options
 * @param {string} options.projectRoot
 * @param {string[]} options.sampledFiles - Repo-relative paths, already capped/ranked.
 * @returns {object} One entry per CONVENTION_KEYS, `{ mechanical: false }` for the
 *   two judgment-only keys, `{ mechanical: true, adopted, mechanicalSignal }` for
 *   the rest. `mechanicalSignal` is `adopted > 0`, i.e. whether the scan found the
 *   convention anywhere at all in the sampled corpus.
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

function unavailable(reason) {
  return { baselineUnavailable: true, reason, corpusSize: 0, sampled: 0, sampledFiles: [], conventions: {} };
}

/**
 * Compute the convention baseline for a review run: the real corpus outside the
 * review set, ranked closest-first by directory distance and capped at 40 (per
 * step-02-discover-tests.md §2b's sampling rules), plus a mechanical adoption scan
 * over the sampled files' real content.
 *
 * @param {object} options
 * @param {string} options.projectRoot - Repo root (git ls-files runs here).
 * @param {string[]} options.reviewFiles - The review set; excluded from sampling and
 *   used as the distance anchor.
 * @param {number} [options.cap] - Sample size cap (default 40, matching step-02).
 * @returns {object} `{ baselineUnavailable: true, reason, ... }` when no corpus
 *   exists outside the review set (or git ls-files failed), otherwise
 *   `{ baselineUnavailable: false, corpusSize, sampled, sampledFiles, conventions }`.
 */
function computeConventionBaseline({ projectRoot, reviewFiles, cap = MAX_SAMPLED_FILES }) {
  const tracked = listGitTrackedFiles(projectRoot);
  if (tracked === null) {
    return unavailable('could not list repository files (git ls-files failed; not a git repo, or a git error)');
  }

  const reviewSet = new Set(reviewFiles.map((file) => file.replaceAll('\\', '/')));
  const eligible = tracked.filter((file) => isTestFile(file) && !reviewSet.has(file));
  const corpusSize = eligible.length;
  if (corpusSize < MIN_CORPUS_TO_ATTEMPT) {
    return unavailable('no test files exist outside the review set to measure a house convention against');
  }

  const reviewedDirs = reviewFiles.length > 0 ? reviewFiles.map(directoryOf) : [''];
  const ranked = eligible
    .map((file) => ({ file, distance: closestDistance(directoryOf(file), reviewedDirs) }))
    // Plain code-unit comparison, not localeCompare: the tie-break order has to be
    // the same sampled set on every machine regardless of the runtime's ICU/locale
    // data, or "deterministic sampling" would itself be an environment-dependent claim.
    .sort((a, b) => a.distance - b.distance || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const sampledFiles = ranked.slice(0, cap).map((entry) => entry.file);

  return {
    baselineUnavailable: false,
    reason: null,
    corpusSize,
    sampled: sampledFiles.length,
    sampledFiles,
    conventions: measureConventions({ projectRoot, sampledFiles }),
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
};
