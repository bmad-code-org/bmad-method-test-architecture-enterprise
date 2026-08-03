/**
 * Compute the PR's changed test files from `git diff <base>...HEAD`, or from an
 * explicit --files list that skips git entirely (fixture/CI-shallow-clone use).
 *
 * Hardening notes:
 * - The git invocation uses `-c core.quotePath=false` and `-z` so non-ASCII paths
 *   arrive unquoted and NUL-delimited, `--diff-filter=d` so deleted files never
 *   enter the review set (a separate --diff-filter=D pass detects deletion-only
 *   diffs), and a trailing `--` after the rev so the rev can never be re-parsed
 *   as a pathspec. The base ref is validated up front: a base starting with `-`
 *   would be a git option injection and is rejected with BASE_UNRESOLVABLE.
 * - assertSafePaths fails closed on review-set paths that could corrupt the
 *   prompt's file block (newlines, carriage returns, NUL, or the BEGIN/END
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

const UNSAFE_PATH_MARKERS = ['---BEGIN FILES---', '---END FILES---'];

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
  getDeletedFiles,
  getDeletedTestFiles,
  isTestFile,
  splitGitPathList,
  assertSafePaths,
  extraTestPatterns,
  registerExtraTestPattern,
  resetExtraTestPatterns,
};
