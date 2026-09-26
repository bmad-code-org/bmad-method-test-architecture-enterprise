/**
 * `_bmad-output/**` is linted, formatted and markdown-checked; `_bmad/**` is
 * not. Story 4.8 narrowed all three ignore configs from a `_bmad` + `*`
 * wildcard prefix, which caught both, to `_bmad/**` alone. Nothing pinned that
 * narrowing: a revert of any one of the three back to a wildcard would drop
 * `_bmad-output/` out of that tool's gate silently, since an excluded path is
 * skipped rather than failed.
 *
 * Each config's glob list is extracted with a plain text scan, the same
 * idiom `tools/validate-ci-coverage.js` uses for the same reason: executing
 * `eslint.config.mjs` for its ignores array is disproportionate for reading
 * a handful of glob strings, and parsing the YAML or gitignore-syntax files
 * needs no execution at all. The extracted patterns are then matched with
 * the `ignore` package (already a dependency), which implements gitignore
 * syntax exactly, the same syntax `.prettierignore` and
 * `.markdownlint-cli2.yaml`'s `ignores:` list use; `eslint.config.mjs`'s
 * flat-config `ignores` is minimatch rather than gitignore syntax, but for
 * the plain recursive-directory patterns here (`_bmad/**`) the two agree, so
 * this is a faithful proxy for exactly the patterns in play, not a general
 * claim that the two syntaxes are equivalent.
 *
 * The three configs are not the whole story for the files this repository
 * tracks under `_bmad-output/`, because `.gitignore` ignores that directory
 * and names each tracked file back in. A tracked file `.gitignore` still
 * ignores is skipped by Prettier, which reads `.gitignore` beside
 * `.prettierignore`, both in lint-staged and in `format:check`, and makes
 * lint-staged's re-add after formatting print "[FAILED] The following paths
 * are ignored" on every commit that touches it. So every tracked file under
 * `_bmad-output/` must also read as not ignored to `git check-ignore`, and
 * Prettier's own `getFileInfo` must skip exactly the ones `.prettierignore`
 * names.
 *
 * Usage: node test/test-bmad-output-gated.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ignore = require('ignore');
const prettier = require('prettier');

const PROJECT_ROOT = path.join(__dirname, '..');

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

/**
 * The `ignores:` YAML list in `.markdownlint-cli2.yaml`, as plain glob
 * strings. Line-by-line rather than one regex, because the list carries
 * interleaved full-line comments (explaining individual entries) that a
 * "consecutive `- item` lines" pattern would stop at prematurely.
 */
function markdownlintIgnores() {
  const lines = fs.readFileSync(path.join(PROJECT_ROOT, '.markdownlint-cli2.yaml'), 'utf8').split('\n');
  const start = lines.findIndex((line) => line.trim() === 'ignores:');
  if (start === -1) throw new Error('.markdownlint-cli2.yaml: could not find an "ignores:" list');
  const patterns = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed === '') continue;
    const item = trimmed.match(/^-\s*(\S+)/);
    if (!item) break; // A non-list, non-comment, non-blank line ends the block.
    patterns.push(item[1]);
  }
  return patterns;
}

/** `.prettierignore`'s own lines, comments and blanks dropped. */
function prettierIgnores() {
  const text = fs.readFileSync(path.join(PROJECT_ROOT, '.prettierignore'), 'utf8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/** The global-ignores array in `eslint.config.mjs`, as plain glob strings. */
function eslintIgnores() {
  const text = fs.readFileSync(path.join(PROJECT_ROOT, 'eslint.config.mjs'), 'utf8');
  const match = text.match(/ignores:\s*\[([\s\S]*?)\n\s*\],/);
  if (!match) throw new Error('eslint.config.mjs: could not find the global ignores array');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** True when `relativePath` matches one of `patterns` under gitignore semantics. */
function isIgnored(patterns, relativePath) {
  return ignore().add(patterns).ignores(relativePath);
}

function checkEachConfigGatesBmadOutputButNotBmad() {
  const configs = [
    { name: '.markdownlint-cli2.yaml', patterns: markdownlintIgnores() },
    { name: '.prettierignore', patterns: prettierIgnores() },
    { name: 'eslint.config.mjs', patterns: eslintIgnores() },
  ];
  for (const { name, patterns } of configs) {
    check(
      !isIgnored(patterns, '_bmad-output/planning-artifacts/epics.md'),
      `${name} excludes _bmad-output/planning-artifacts/epics.md; it should be gated, not skipped`,
    );
    check(
      !isIgnored(patterns, '_bmad-output/implementation-artifacts/handover-4-1.md'),
      `${name} excludes _bmad-output/implementation-artifacts/handover-4-1.md; it should be gated, not skipped`,
    );
    check(
      isIgnored(patterns, '_bmad/some/generated/file.md'),
      `${name} does not exclude _bmad/**; the runtime-install directory should stay ungated`,
    );
  }
}

function git(args, input) {
  const result = spawnSync('git', args, { cwd: PROJECT_ROOT, encoding: 'utf8', input });
  if (result.error) throw result.error;
  return result;
}

/** Every file git tracks under `_bmad-output/`, as a repository-relative path. */
function trackedBmadOutput() {
  const listed = git(['ls-files', '-z', '--', '_bmad-output']);
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
  return listed.stdout.split('\0').filter((file) => file.length > 0);
}

async function checkTrackedBmadOutputIsNotGitignored() {
  const tracked = trackedBmadOutput();
  check(tracked.length > 0, 'git tracks no file under _bmad-output/; this check would hold nothing');
  // `--no-index` asks what .gitignore says of the path itself, as `git add` and Prettier read it, whether or not it is tracked.
  const ignored = git(['check-ignore', '--no-index', '--stdin', '-z'], `${tracked.join('\0')}\0`);
  const gitignored = ignored.stdout.split('\0').filter((file) => file.length > 0);
  check(
    gitignored.length === 0,
    `.gitignore ignores ${gitignored.length} tracked file(s) under _bmad-output/, which git add refuses and Prettier skips: ${gitignored.join(', ')}`,
  );
  const deliberate = prettierIgnores();
  const ignorePath = [path.join(PROJECT_ROOT, '.gitignore'), path.join(PROJECT_ROOT, '.prettierignore')];
  for (const file of tracked) {
    const { ignored: skipped } = await prettier.getFileInfo(path.join(PROJECT_ROOT, file), { ignorePath });
    const named = isIgnored(deliberate, file);
    check(
      skipped === named,
      named
        ? `Prettier formats ${file}, which .prettierignore names`
        : `Prettier skips ${file}, which .prettierignore does not name, so neither lint-staged nor format:check formats it`,
    );
  }
}

async function main() {
  checkEachConfigGatesBmadOutputButNotBmad();
  await checkTrackedBmadOutputIsNotGitignored();

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} _bmad-output gating check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} _bmad-output gating check(s) passed`);
  return 0;
}

if (require.main === module) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
