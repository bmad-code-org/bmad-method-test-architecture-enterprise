/**
 * The harness-side half of a suite's declared runner capabilities.
 *
 * test/evals/suite-manifest.json declares what each suite's runner may do to the
 * filesystem, and cli/lib/agent-adapters.js turns that declaration into vendor
 * argv where a vendor has one: claude loses its write tools under `read-only`,
 * codex runs under `--sandbox read-only`. A custom runner and agy carry no such
 * flag, so the declaration would hold for two vendors and be a comment for the
 * others. What is here closes that half: a disposable working directory the
 * runner is pointed at, a check that a read-only run left nothing in it, and a
 * check that no run wrote into the repository the harness lives in.
 *
 * The repository check reads `git status`, which sees a new or modified file
 * anywhere under the checkout, including an untracked one. It detects a write
 * after the fact, and it is deliberately cheap enough to run after every
 * agent call: a run that wrote into the tree is reported as an environment
 * failure and kept out of the score, because a runner outside its declared
 * envelope is a runner the measurement did not describe.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { boundedProbe } = require('./bounded-probe');

/** A fresh empty directory under the system temp root, for one agent run. */
function scratchDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

/** Every file under `root`, repository-relative, in a stable order; empty when the directory is empty or gone. */
function filesWritten(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else found.push(path.relative(root, absolute));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return found;
}

/**
 * The working tree as `git status` sees it, one line per changed or untracked
 * path, or null when git could not answer (no git on PATH, or not a checkout),
 * in which case the caller has no baseline and skips the comparison.
 *
 * @param {string} projectRoot
 * @returns {string[]|null}
 */
function workingTreeState(projectRoot) {
  const result = boundedProbe('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: projectRoot });
  if (!result.ok) return null;
  return String(result.stdout ?? '')
    .split('\n')
    .filter((line) => line.length > 0)
    .sort();
}

/**
 * The status lines present after a run and absent before it: the paths the run
 * created or modified inside the repository. A tree that was already dirty
 * stays out of the answer, because only the delta is the run's.
 *
 * @param {string[]|null} before
 * @param {string[]|null} after
 * @returns {string[]}
 */
function workingTreeChanges(before, after) {
  if (before === null || after === null) return [];
  const known = new Set(before);
  return after.filter((line) => !known.has(line));
}

/**
 * The deliverables a run wrote under some other run key, when the one the
 * harness reads is absent.
 *
 * Every scoped workflow writes `{test_artifacts}/<workflow>/<name>-<run_key>.<ext>`,
 * and the harness knows the one run key the prompt resolves to. A run that
 * resolved another key wrote a complete deliverable where nothing reads it, which
 * is a behavior the scorer has to see: reporting it as an artifact the
 * environment never produced would hide a wrong run key behind exit 2. Read
 * before the workspace is removed.
 *
 * @param {string} folder Absolute path of the workflow's output folder.
 * @param {RegExp} family Matches the file names of the deliverables this workflow writes, any run key.
 * @param {string[]} expected The file names the harness reads, which are never reported here.
 * @returns {string[]} The sibling file names found, sorted; empty when the folder is absent.
 */
function misplacedDeliverables(folder, family, expected) {
  if (!fs.existsSync(folder)) return [];
  const wanted = new Set(expected);
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && family.test(entry.name) && !wanted.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/**
 * The reason and result-record evidence for a run whose deliverables landed under
 * another run key, naming each file by its path under the project root.
 *
 * @param {string} folder The workflow's output folder relative to the project root, with `/` separators.
 * @param {string[]} names What misplacedDeliverables found.
 * @returns {{reason: string, evidence: {kind: string, value: string}[]}}
 */
function misplacedEvidence(folder, names) {
  const paths = names.map((name) => `${folder}/${name}`);
  const reason = `the run wrote its deliverables under another run key: ${paths.join(', ')}`;
  return {
    reason,
    evidence: [...paths.map((value) => ({ kind: 'artifact', value })), { kind: 'summary', value: reason }],
  };
}

module.exports = {
  scratchDirectory,
  filesWritten,
  workingTreeState,
  workingTreeChanges,
  misplacedDeliverables,
  misplacedEvidence,
};
