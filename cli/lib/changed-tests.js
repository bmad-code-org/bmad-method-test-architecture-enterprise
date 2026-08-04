/**
 * Split the PR's diff into the two lists a review needs, or normalize an
 * explicit --files list that skips git entirely (fixture/CI-shallow-clone use).
 *
 * The diff yields both lists, which is why nothing here is configurable:
 * - files matching isTestFile are the REVIEW SET, scored against the ledger;
 * - everything else is the CONTEXT SET, read for understanding and never
 *   scored. If the story is in the PR it is in the diff, so it gets read.
 *
 * Hardening notes:
 * - The git invocation uses `-c core.quotePath=false` and `-z` so non-ASCII paths
 *   arrive unquoted and NUL-delimited, `--diff-filter=d` so deleted files never
 *   enter the review set (a separate --diff-filter=D pass detects deletion-only
 *   diffs), and a trailing `--` after the rev so the rev can never be re-parsed
 *   as a pathspec. The base ref is validated up front: a base starting with `-`
 *   would be a git option injection and is rejected with BASE_UNRESOLVABLE.
 * - assertSafePaths fails closed on paths that could corrupt either of the
 *   prompt's delimited blocks (newlines, carriage returns, NUL, or the BEGIN/END
 *   delimiter literals); unsafe paths are never silently dropped.
 */

const { spawnSync } = require('node:child_process');

const TEST_DIR_SEGMENTS = new Set(['test', 'tests', '__tests__', 'e2e', 'spec', 'specs']);

// A directory-segment match only counts when the file is actual source code,
// so fixtures like tests/data.json or e2e/docker-compose.yaml stay out.
const CODE_EXTENSION_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|php|cs|java|kt|swift|rs|dart|exs|ex|vue|svelte)$/;

const TEST_FILENAME_PATTERNS = [
  /^test_.*\.py$/, // pytest: test_checkout.py
  /_test\.py$/, // pytest: checkout_test.py
  /_test\.go$/, // go: handler_test.go
  /_spec\.rb$/, // rspec: checkout_spec.rb
  /\.cy\.[^.]+$/, // cypress: login.cy.ts
  /Test\.php$/, // phpunit: LoginTest.php
  /Tests?\.cs$/, // dotnet xUnit/NUnit: CheckoutTest.cs, CheckoutTests.cs
  /Tests?\.java$/, // junit: CheckoutTest.java, CheckoutTests.java
  /\.pacttest\.[^.]+$/, // pact contract tests: orders.pacttest.ts
  /\.test\.[^.]+$/, // js/ts: checkout.test.ts
  /\.spec\.[^.]+$/, // js/ts: checkout.spec.ts
  /\.test-[^.]+\.[^.]+$/, // js/ts: checkout.test-e2e.ts
];

// Registry of user-supplied extra test-file matchers (--test-glob). Entries are
// plain functions (repo-relative path) => boolean; substring matchers match
// anywhere in the path, /regex/ matchers run as regular expressions.
const extraTestPatterns = [];

function invalidTestGlob(message) {
  const error = new Error(message);
  error.code = 'INVALID_TEST_GLOB';
  return error;
}

/**
 * Append a --test-glob matcher to the registry. A value wrapped in slashes
 * (/.../) is treated as a regex, anything else as a plain substring.
 *
 * @param {string} raw - The --test-glob option value.
 * @throws {Error} With code INVALID_TEST_GLOB on empty values or bad regexes.
 */
function registerExtraTestPattern(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw invalidTestGlob('--test-glob must be a non-empty substring or a /regex/ pattern.');
  }
  if (raw.length > 1 && raw.startsWith('/') && raw.endsWith('/')) {
    let regex;
    try {
      regex = new RegExp(raw.slice(1, -1));
    } catch (error) {
      throw invalidTestGlob(`--test-glob "${raw}" is not a valid regex: ${error.message}`);
    }
    extraTestPatterns.push((filePath) => regex.test(filePath));
    return;
  }
  extraTestPatterns.push((filePath) => filePath.includes(raw));
}

/** Empty the --test-glob registry (tests; each CLI process registers fresh). */
function resetExtraTestPatterns() {
  extraTestPatterns.length = 0;
}

/**
 * Match a repo-relative path that looks like a test/spec file. Directory
 * segments match case-insensitively but only on exact segment equality (so
 * src/latest/run.ts and src/test-utils/helpers.ts stay out). Every built-in
 * rule requires a code extension, so docs/example.spec.md is documentation,
 * not a test. Registered --test-glob matchers bypass the extension gate by
 * explicit user intent.
 *
 * @param {string} filePath - Repo-relative file path.
 * @returns {boolean}
 */
function isTestFile(filePath) {
  const segments = filePath.replaceAll('\\', '/').split('/');
  const filename = segments.at(-1);
  const directories = segments.slice(0, -1);

  for (const matches of extraTestPatterns) {
    if (matches(filePath)) {
      return true;
    }
  }

  if (!CODE_EXTENSION_PATTERN.test(filename)) {
    return false;
  }

  if (directories.some((segment) => TEST_DIR_SEGMENTS.has(segment.toLowerCase()))) {
    return true;
  }

  return TEST_FILENAME_PATTERNS.some((pattern) => pattern.test(filename));
}

/**
 * Split NUL-delimited `git diff -z` stdout into paths. Git paths are passed
 * through untouched (no trimming): leading/trailing whitespace can be part of
 * a filename. (The explicit --files list, by contrast, IS trimmed.)
 *
 * @param {string} stdout - Raw stdout from `git diff --name-only -z`.
 * @returns {string[]}
 */
function splitGitPathList(stdout) {
  return stdout.split('\0').filter(Boolean);
}

const UNSAFE_PATH_MARKERS = [
  '---BEGIN FILES---',
  '---END FILES---',
  '---BEGIN CONTEXT---',
  '---END CONTEXT---',
  '---BEGIN UNSCORABLE---',
  '---END UNSCORABLE---',
];

// Context-set exclusions. Not an option: a lockfile or a binary asset carries
// no requirements the review could use, and every one of them costs the agent
// a read. These are internal noise rules, not a user-facing filter.
const CONTEXT_NOISE_FILENAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'gemfile.lock',
  'poetry.lock',
  'cargo.lock',
  'composer.lock',
  'go.sum',
]);
const CONTEXT_NOISE_DIR_SEGMENTS = new Set(['node_modules', 'dist', 'build', 'coverage', 'vendor', '.next', '.nuxt', '__snapshots__']);
const CONTEXT_NOISE_EXTENSION_PATTERN =
  /\.(snap|map|lock|png|jpe?g|gif|svg|webp|avif|ico|pdf|zip|gz|tgz|tar|woff2?|ttf|otf|eot|mp[34]|webm|mov|wasm|so|dylib|dll|exe|bin)$/i;
const CONTEXT_NOISE_SUFFIXES = ['.min.js', '.min.css'];

// Documentation is the likeliest oracle in a diff (story, PRD, test design), so
// it is ordered ahead of source. This only matters when the cap below bites:
// the requirements have to survive the trim, not the twentieth controller.
const CONTEXT_DOC_EXTENSION_PATTERN = /\.(md|mdx|markdown|adoc|rst|txt)$/i;

// The agent reads every context file, so an unbounded set is an unbounded run.
// Trimming is always reported as pr_diff_truncated: a report never implies it
// read a whole change it only partly saw.
const MAX_CONTEXT_FILES = 40;

const CONTEXT_BASIS_VALUES = ['none', 'pr_diff', 'pr_diff_truncated'];

/**
 * Whether a changed non-test file is worth handing to the reviewer as context.
 *
 * @param {string} filePath - Repo-relative file path.
 * @returns {boolean}
 */
function isContextNoise(filePath) {
  const segments = filePath.replaceAll('\\', '/').split('/');
  const filename = segments.at(-1).toLowerCase();
  if (CONTEXT_NOISE_FILENAMES.has(filename)) {
    return true;
  }
  if (CONTEXT_NOISE_EXTENSION_PATTERN.test(filename) || CONTEXT_NOISE_SUFFIXES.some((suffix) => filename.endsWith(suffix))) {
    return true;
  }
  return segments.slice(0, -1).some((segment) => CONTEXT_NOISE_DIR_SEGMENTS.has(segment.toLowerCase()));
}

// Test artifacts written in a format isTestFile deliberately will not match,
// because every built-in rule requires a code extension. A Maestro flow, a
// Gherkin feature, a Robot suite or an .http collection is a test the reviewer
// cannot score, and staying silent about it reads as "there was nothing else to
// review". These only ever produce a disclosure line and a --test-glob hint;
// they never enter the review set on their own, since scoring a format the
// ledger has no criteria for would be worse than declining it.
const NON_CODE_TEST_DIR_SEGMENTS = new Set([
  'maestro',
  'cypress',
  'playwright',
  'features',
  'e2e',
  'test',
  'tests',
  'spec',
  'specs',
  '__tests__',
  'postman',
  'newman',
  'karate',
  'gatling',
]);
const NON_CODE_TEST_EXTENSION_PATTERN = /\.(ya?ml|feature|robot|http|rest|hurl)$/i;
const NON_CODE_TEST_FILENAME_PATTERN = /(flow|test|spec|scenario|suite|journey|smoke)/i;

/**
 * Changed files that look like test artifacts but cannot be scored, so the
 * report can name them instead of omitting them.
 *
 * Deliberately narrow: a non-code extension AND either a test-tool directory
 * segment or a test-shaped filename. A CI workflow or a locale JSON in the same
 * diff must not land here, or the disclosure becomes noise nobody reads.
 *
 * @param {string[]} changedFiles - Repo-relative changed file paths.
 * @returns {string[]}
 */
function getUnscorableTestArtifacts(changedFiles) {
  return (Array.isArray(changedFiles) ? changedFiles : []).filter((file) => {
    if (typeof file !== 'string' || file.length === 0) return false;
    if (isTestFile(file) || isContextNoise(file)) return false;
    const segments = file.replaceAll('\\', '/').split('/');
    const filename = segments.at(-1);
    if (!NON_CODE_TEST_EXTENSION_PATTERN.test(filename)) return false;
    const inTestDir = segments.slice(0, -1).some((segment) => NON_CODE_TEST_DIR_SEGMENTS.has(segment.toLowerCase()));
    return inTestDir || NON_CODE_TEST_FILENAME_PATTERN.test(filename);
  });
}

/**
 * Derive the read-only context set from an already-computed changed-file list:
 * everything in the diff that is not a test file and not noise, documentation
 * first, capped.
 *
 * Takes the list rather than a base ref so the CLI runs `git diff` once and
 * derives both lists (and the control-plane guard) from the same snapshot.
 *
 * @param {string[]} changedFiles - Repo-relative changed file paths.
 * @returns {{files: string[], truncated: boolean}}
 */
function getContextFiles(changedFiles) {
  const candidates = changedFiles.filter((file) => !isTestFile(file) && !isContextNoise(file));
  const docs = candidates.filter((file) => CONTEXT_DOC_EXTENSION_PATTERN.test(file));
  const rest = candidates.filter((file) => !CONTEXT_DOC_EXTENSION_PATTERN.test(file));
  const ordered = [...docs, ...rest];
  return { files: ordered.slice(0, MAX_CONTEXT_FILES), truncated: ordered.length > MAX_CONTEXT_FILES };
}

/**
 * The context_basis value for a resolved context set. Derived, never supplied:
 * the oracle is whatever the PR happens to contain, so there is nothing to pick.
 *
 * @param {object} options
 * @param {string[]} options.files - The resolved context set.
 * @param {boolean} [options.truncated] - Whether the size cap trimmed the set.
 * @returns {'none'|'pr_diff'|'pr_diff_truncated'}
 */
function contextBasisFor({ files, truncated = false }) {
  if (files.length === 0) {
    return 'none';
  }
  return truncated ? 'pr_diff_truncated' : 'pr_diff';
}

/**
 * Fail closed on paths that could corrupt or inject into the prompt's file
 * block. Throws rather than dropping so a hostile path is always loud.
 *
 * @param {string[]} list - Review-set file paths.
 * @throws {Error} With code UNSAFE_PATH on the first unsafe path.
 */
function assertSafePaths(list) {
  for (const filePath of list) {
    const unsafe =
      filePath.includes('\n') ||
      filePath.includes('\r') ||
      filePath.includes('\0') ||
      UNSAFE_PATH_MARKERS.some((marker) => filePath.includes(marker));
    if (unsafe) {
      const error = new Error(
        `Unsafe file path rejected (no newlines, NUL, or prompt delimiter literals allowed): ${JSON.stringify(filePath)}`,
      );
      error.code = 'UNSAFE_PATH';
      throw error;
    }
  }
}

/**
 * Run `git diff --name-only -z <base>...HEAD --` with the given diff-filter.
 *
 * @param {object} options
 * @param {string} options.base - Git base ref; must not start with `-`.
 * @param {string} options.projectRoot - Working directory for git.
 * @param {string} options.diffFilter - git --diff-filter value (d or D).
 * @returns {string[]} Repo-relative changed file paths.
 * @throws {Error} BASE_UNRESOLVABLE for an option-looking base, GIT_DIFF_FAILED
 *   when git cannot produce the diff.
 */
function runGitDiff({ base, projectRoot, diffFilter }) {
  if (typeof base !== 'string' || base.length === 0 || base.startsWith('-')) {
    const error = new Error(`git base ref ${JSON.stringify(base)} is empty or looks like a git option; refusing to run git diff with it.`);
    error.code = 'BASE_UNRESOLVABLE';
    throw error;
  }

  const result = spawnSync(
    'git',
    ['-c', 'core.quotePath=false', 'diff', '--name-only', `--diff-filter=${diffFilter}`, '-z', `${base}...HEAD`, '--'],
    { cwd: projectRoot, encoding: 'utf8' },
  );

  if (result.error || result.status !== 0) {
    const detail = ((result.stderr || '').trim() || (result.error && result.error.message) || 'unknown git error').trim();
    const error = new Error(`git diff --name-only ${base}...HEAD failed in ${projectRoot}:\n${detail}`);
    error.code = 'GIT_DIFF_FAILED';
    throw error;
  }

  return splitGitPathList(result.stdout);
}

/**
 * List files changed between <base> and HEAD, or normalize an explicit file list.
 *
 * @param {object} options
 * @param {string} [options.base] - Git base ref for the diff (default origin/main).
 * @param {string|string[]} [options.files] - Explicit review set: a comma-separated
 *   string, an array from the repeatable --files option (each element may itself
 *   be comma-separated), or a mix. Elements are trimmed; empty entries drop.
 *   When the option is provided at all (even as an empty string) it is used
 *   verbatim and git is never invoked; an empty list means "no changed files".
 * @param {string} [options.projectRoot] - Working directory for git (default cwd).
 * @returns {string[]} Repo-relative changed file paths.
 * @throws {Error} BASE_UNRESOLVABLE or GIT_DIFF_FAILED (see runGitDiff).
 */
function getChangedFiles({ base = 'origin/main', files, projectRoot = process.cwd() } = {}) {
  if (files !== undefined && files !== null) {
    const entries = Array.isArray(files) ? files : [files];
    return entries
      .flatMap((entry) => String(entry).split(','))
      .map((file) => file.trim())
      .filter(Boolean);
  }

  return runGitDiff({ base, projectRoot, diffFilter: 'd' });
}

/**
 * Files deleted between <base> and HEAD (--diff-filter=D pass).
 *
 * @param {object} [options] - base and projectRoot (see getChangedFiles).
 * @returns {string[]}
 */
function getDeletedFiles({ base = 'origin/main', projectRoot = process.cwd() } = {}) {
  return runGitDiff({ base, projectRoot, diffFilter: 'D' });
}

/**
 * Deleted files filtered down to test/spec files (used to distinguish a
 * deletions-only diff, which is never a pass, from a zero-test-change diff).
 *
 * @param {object} [options] - base and projectRoot (see getChangedFiles).
 * @returns {string[]}
 */
function getDeletedTestFiles(options = {}) {
  return getDeletedFiles(options).filter(isTestFile);
}

/**
 * Changed files filtered down to test/spec files. An explicitly supplied --files
 * list is authoritative user intent and BYPASSES the isTestFile filter.
 *
 * @param {object} options - See getChangedFiles.
 * @returns {string[]}
 */
function getChangedTestFiles({ files, ...rest } = {}) {
  const changedFiles = getChangedFiles({ files, ...rest });
  if (files !== undefined && files !== null) {
    return changedFiles;
  }
  return changedFiles.filter(isTestFile);
}

module.exports = {
  getChangedFiles,
  getChangedTestFiles,
  getContextFiles,
  getUnscorableTestArtifacts,
  getDeletedFiles,
  getDeletedTestFiles,
  contextBasisFor,
  isTestFile,
  isContextNoise,
  splitGitPathList,
  assertSafePaths,
  extraTestPatterns,
  registerExtraTestPattern,
  resetExtraTestPatterns,
  CONTEXT_BASIS_VALUES,
  MAX_CONTEXT_FILES,
};
