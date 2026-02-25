/**
 * Knowledge Base Validation Tests - TEA Module
 *
 * Tests tea-index.csv parsing, fragment existence, tag selection,
 * and cross-fragment link references.
 *
 * Usage: node test/test-knowledge-base.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');

// ANSI colors
const colors = {
  reset: '\u001B[0m',
  green: '\u001B[32m',
  red: '\u001B[31m',
  yellow: '\u001B[33m',
  cyan: '\u001B[36m',
  dim: '\u001B[2m',
};

let passed = 0;
let failed = 0;
let warned = 0;

function assert(condition, testName, errorMessage = '') {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
    passed++;
  } else {
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    if (errorMessage) {
      console.log(`  ${colors.dim}${errorMessage}${colors.reset}`);
    }
    failed++;
  }
}

function warn(message) {
  console.log(`${colors.yellow}•${colors.reset} ${message}`);
  warned++;
}

function parseTags(tagString) {
  if (!tagString) return [];
  return tagString
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function isExternalLink(href) {
  return href.startsWith('http://') || href.startsWith('https://');
}

function resolveFragmentLink(baseDir, href) {
  if (href.startsWith('knowledge/')) {
    return path.join(baseDir, href);
  }
  if (href.startsWith('./') || href.startsWith('../')) {
    return path.join(baseDir, href);
  }
  // If only a filename is provided, assume knowledge dir
  if (href.endsWith('.md') && !href.includes('/')) {
    return path.join(baseDir, 'knowledge', href);
  }
  return null;
}

function runTests() {
  console.log(`${colors.cyan}========================================`);
  console.log('TEA Knowledge Base Tests');
  console.log(`========================================${colors.reset}\n`);

  const projectRoot = path.join(__dirname, '..');
  const kbRoot = path.join(projectRoot, 'src', 'testarch');
  const indexPath = path.join(kbRoot, 'tea-index.csv');

  // ============================================================
  // Test 1: Parse CSV and validate structure
  // ============================================================
  console.log(`${colors.yellow}Test Suite 1: CSV Structure${colors.reset}\n`);

  let records = [];
  try {
    const csv = fs.readFileSync(indexPath, 'utf8');
    records = parse(csv, { columns: true, skip_empty_lines: true });

    assert(records.length === 40, 'tea-index.csv has 40 fragment records', `Found ${records.length}`);

    const requiredFields = ['id', 'name', 'description', 'tags', 'tier', 'fragment_file'];
    const missingFields = requiredFields.filter((field) => !Object.prototype.hasOwnProperty.call(records[0] || {}, field));
    assert(missingFields.length === 0, 'tea-index.csv has required columns', missingFields.join(', '));

    // Validate tier values
    const validTiers = new Set(['core', 'extended', 'specialized']);
    const invalidTiers = records.filter((r) => !validTiers.has(r.tier));
    assert(
      invalidTiers.length === 0,
      'All fragments have valid tier values (core/extended/specialized)',
      invalidTiers.map((r) => `${r.id}: "${r.tier}"`).join(', '),
    );
  } catch (error) {
    assert(false, 'tea-index.csv parsed successfully', error.message);
  }

  console.log('');

  // ============================================================
  // Test 2: Fragment file existence
  // ============================================================
  console.log(`${colors.yellow}Test Suite 2: Fragment Existence${colors.reset}\n`);

  if (records.length > 0) {
    let missingCount = 0;
    for (const record of records) {
      const fragmentPath = path.join(kbRoot, record.fragment_file);
      const exists = fs.existsSync(fragmentPath);
      if (!exists) missingCount++;
      assert(exists, `fragment exists: ${record.fragment_file}`);
    }
    assert(missingCount === 0, 'all fragments exist');
  } else {
    assert(false, 'fragment records loaded', 'No records found in tea-index.csv');
  }

  console.log('');

  // ============================================================
  // Test 3: Tag selection logic
  // ============================================================
  console.log(`${colors.yellow}Test Suite 3: Tag Selection${colors.reset}\n`);

  if (records.length > 0) {
    const firstTag = parseTags(records[0].tags)[0];
    const selected = records.filter((record) => parseTags(record.tags).includes(firstTag));
    assert(Boolean(firstTag), 'first record has at least one tag');
    assert(selected.length > 0, `tag filter returns results for '${firstTag}'`);

    const none = records.filter((record) => parseTags(record.tags).includes('__no_such_tag__'));
    assert(none.length === 0, 'unknown tag returns no results');
  } else {
    assert(false, 'tag selection tested', 'No records to test');
  }

  console.log('');

  // ============================================================
  // Test 4: Cross-fragment references
  // ============================================================
  console.log(`${colors.yellow}Test Suite 4: Cross-Fragment Links${colors.reset}\n`);

  const knowledgeDir = path.join(kbRoot, 'knowledge');
  const mdFiles = fs.readdirSync(knowledgeDir).filter((name) => name.endsWith('.md'));

  let linkCount = 0;
  let brokenLinks = 0;

  for (const fileName of mdFiles) {
    const filePath = path.join(knowledgeDir, fileName);
    const content = fs.readFileSync(filePath, 'utf8');

    const linkMatches = content.matchAll(/\]\(([^)]+)\)/g);
    for (const match of linkMatches) {
      const href = match[1].trim();
      if (!href.endsWith('.md') || isExternalLink(href)) continue;

      const resolved = resolveFragmentLink(kbRoot, href);
      if (!resolved) continue;

      linkCount++;
      const exists = fs.existsSync(resolved);
      if (!exists) brokenLinks++;
      assert(exists, `link resolves: ${fileName} -> ${href}`);
    }
  }

  if (linkCount === 0) {
    warn('no cross-fragment links detected (informational)');
  } else {
    assert(linkCount > 0, 'cross-fragment links detected (at least one)');
  }
  assert(brokenLinks === 0, 'no broken cross-fragment links');

  console.log('');

  // ============================================================
  // Summary
  // ============================================================
  console.log(`${colors.cyan}========================================`);
  console.log('Test Results:');
  console.log(`  Passed: ${colors.green}${passed}${colors.reset}`);
  console.log(`  Warnings: ${colors.yellow}${warned}${colors.reset}`);
  console.log(`  Failed: ${colors.red}${failed}${colors.reset}`);
  console.log(`========================================${colors.reset}\n`);

  if (failed === 0) {
    console.log(`${colors.green}✨ Knowledge base tests passed!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.red}❌ Knowledge base tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

runTests();
