/**
 * Changelog stamping validation.
 *
 * Verifies that tools/stamp-changelog.js moves `## [Unreleased]` notes into a dated version
 * section during a stable release, and that it refuses or no-ops rather than corrupting the file.
 *
 * Usage: node test/test-stamp-changelog.js
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { stamp } = require('../tools/stamp-changelog.js');

const projectRoot = path.join(__dirname, '..');
const changelogPath = path.join(projectRoot, 'CHANGELOG.md');

const SAMPLE = [
  '# Changelog',
  '',
  'All notable changes will be documented in this file.',
  '',
  '## [Unreleased]',
  '',
  '### Fixed',
  '',
  '- a fix that has not shipped yet',
  '',
  '## [1.21.0] - 2026-08-01',
  '',
  '- an older entry',
  '',
].join('\n');

const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`  FAIL  ${name}`);
  }
}

check('stamps unreleased notes into a dated version section', () => {
  const result = stamp(SAMPLE, '1.22.0', '2026-08-11');
  assert.strictEqual(result.changed, true);
  assert.match(result.output, /## \[Unreleased\]\n\n## \[1\.22\.0\] - 2026-08-11\n\n### Fixed\n\n- a fix that has not shipped yet/);
});

check('leaves an empty [Unreleased] heading in place for the next cycle', () => {
  const result = stamp(SAMPLE, '1.22.0', '2026-08-11');
  assert.match(result.output, /^## \[Unreleased\]$/m);
});

check('preserves earlier version sections verbatim', () => {
  const result = stamp(SAMPLE, '1.22.0', '2026-08-11');
  assert.match(result.output, /## \[1\.21\.0\] - 2026-08-01\n\n- an older entry/);
});

check('does no work when [Unreleased] is empty', () => {
  const source = '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n- shipped\n';
  assert.strictEqual(stamp(source, '1.1.0', '2026-08-11').changed, false);
});

check('is idempotent once a section for the version exists', () => {
  const once = stamp(SAMPLE, '1.22.0', '2026-08-11').output;
  assert.strictEqual(stamp(once, '1.22.0', '2026-08-11').changed, false);
});

check('treats version dots as literals rather than wildcards', () => {
  const source = '# Changelog\n\n## [Unreleased]\n\n- pending\n\n## [1x2x0] - 2026-01-01\n\n- decoy\n';
  assert.strictEqual(stamp(source, '1.2.0', '2026-08-11').changed, true);
});

check('handles [Unreleased] as the final section', () => {
  const result = stamp('# Changelog\n\n## [Unreleased]\n\n- only entry\n', '2.0.0', '2026-08-11');
  assert.strictEqual(result.changed, true);
  assert.match(result.output, /## \[2\.0\.0\] - 2026-08-11\n\n- only entry/);
});

check('refuses a changelog with no [Unreleased] heading', () => {
  assert.throws(() => stamp('# Changelog\n\n## [1.0.0]\n\n- shipped\n', '1.1.0', '2026-08-11'), /\[Unreleased\]/);
});

check('the repository CHANGELOG.md still carries an [Unreleased] heading to stamp', () => {
  const source = fs.readFileSync(changelogPath, 'utf8');
  assert.match(source, /^## \[Unreleased\]$/m, 'publish.yaml stamps this heading; removing it breaks the release.');
});

if (failures.length > 0) {
  console.error('\nChangelog stamping validation failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Changelog stamping behaves correctly.');
