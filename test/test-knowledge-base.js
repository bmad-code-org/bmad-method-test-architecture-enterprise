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

function resolveFragmentLink(knowledgeDir, href) {
  if (href.startsWith('./') || href.startsWith('../')) {
    return path.join(knowledgeDir, href);
  }
  // A bare filename names a sibling fragment.
  if (href.endsWith('.md') && !href.includes('/')) {
    return path.join(knowledgeDir, href);
  }
  return null;
}

function runTests() {
  console.log(`${colors.cyan}========================================`);
  console.log('TEA Knowledge Base Tests');
  console.log(`========================================${colors.reset}\n`);

  const projectRoot = path.join(__dirname, '..');
  const skillsRoot = path.join(projectRoot, 'skills');
  // The one copy of the knowledge base: fragments and tea-index.csv side by side,
  // fragment_file relative to this folder. Every consumer reads it as {tea-knowledge}.
  const knowledgeDir = path.join(skillsRoot, 'bmod-tea', 'knowledge');
  const indexPath = path.join(knowledgeDir, 'tea-index.csv');

  // ============================================================
  // Test 1: Parse CSV and validate structure
  // ============================================================
  console.log(`${colors.yellow}Test Suite 1: CSV Structure${colors.reset}\n`);

  let records = [];
  try {
    const csv = fs.readFileSync(indexPath, 'utf8');
    records = parse(csv, { columns: true, skip_empty_lines: true });

    const expectedFragmentCount = fs.readdirSync(knowledgeDir).filter((f) => f.endsWith('.md')).length;
    assert(
      records.length === expectedFragmentCount,
      `tea-index.csv has ${expectedFragmentCount} fragment records`,
      `Found ${records.length}`,
    );

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
      const fragmentPath = path.join(knowledgeDir, record.fragment_file);
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

      const resolved = resolveFragmentLink(knowledgeDir, href);
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
  // Test 5: One knowledge base, fully indexed, reached through {tea-knowledge}
  // ============================================================
  // The base ships once, in the bmod-tea skill, and every consumer resolves it as
  // {skill-root}/../bmod-tea/knowledge. A file on disk with no index row is never
  // selected; a row naming a missing file fails just as quietly. A per-skill copy
  // creeping back in would shadow the shared one and drift from it.
  console.log(`${colors.yellow}Test Suite 5: Single Knowledge Base${colors.reset}\n`);

  if (fs.existsSync(knowledgeDir)) {
    const fragments = fs.readdirSync(knowledgeDir).filter((name) => name.endsWith('.md'));
    const fragmentSet = new Set(fragments);

    // Resolve each link and check where it lands, rather than pattern-matching the
    // spellings that usually escape: `](./../x.md)` and a root-relative `](/skills/...)`
    // both leave the directory without starting `../`. An installed bmod-tea sits at a
    // different depth than this checkout, so a link out of the folder is not portable.
    const escapers = [];
    for (const name of fragments) {
      const content = fs.readFileSync(path.join(knowledgeDir, name), 'utf8');
      for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
        const raw = match[1].trim();
        const href = raw.split('#')[0];
        if (!href.endsWith('.md') || isExternalLink(href)) continue;
        const resolved = resolveFragmentLink(knowledgeDir, href);
        if (resolved === null) continue;
        const relative = path.relative(knowledgeDir, path.resolve(resolved));
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          escapers.push(`${name} -> ${raw}`);
        }
      }
    }
    assert(
      escapers.length === 0,
      'no fragment links outside the knowledge directory',
      `${escapers.join(', ')} - inline the content, or name the fragment without linking it.`,
    );

    const indexed = records.map((row) => row.fragment_file || '').filter(Boolean);
    const indexedSet = new Set(indexed);

    const prefixed = indexed.filter((name) => name.includes('/'));
    assert(
      prefixed.length === 0,
      'tea-index.csv names each fragment relative to the knowledge folder',
      `carries a path prefix: ${prefixed.join(', ')}`,
    );

    assert(
      indexed.length === indexedSet.size,
      'tea-index.csv lists each fragment once',
      `duplicates: ${indexed.filter((name, i) => indexed.indexOf(name) !== i).join(', ')}`,
    );

    const unindexed = fragments.filter((name) => !indexedSet.has(name));
    assert(unindexed.length === 0, 'every fragment is indexed', `on disk but absent from tea-index.csv: ${unindexed.join(', ')}`);

    const danglingRows = [...indexedSet].filter((name) => !fragmentSet.has(name));
    assert(danglingRows.length === 0, 'every index row names a fragment on disk', `missing from knowledge/: ${danglingRows.join(', ')}`);

    const skillDirs = fs
      .readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'bmod-tea')
      .map((entry) => entry.name);
    const strayCopies = skillDirs.filter(
      (name) =>
        fs.existsSync(path.join(skillsRoot, name, 'resources', 'knowledge')) ||
        fs.existsSync(path.join(skillsRoot, name, 'resources', 'tea-index.csv')),
    );
    assert(
      strayCopies.length === 0,
      'no skill ships its own knowledge copy',
      `${strayCopies.join(', ')} - read the shared base through {tea-knowledge} instead`,
    );

    // Every step file that declares a knowledge index must point at the shared one.
    const wrongIndex = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(absolute);
        } else if (entry.name.endsWith('.md')) {
          for (const match of fs.readFileSync(absolute, 'utf8').matchAll(/^knowledgeIndex:\s*(.+)$/gm)) {
            if (match[1].trim().replaceAll(/^['"]|['"]$/g, '') !== '{tea-knowledge}/tea-index.csv') {
              wrongIndex.push(`${path.relative(skillsRoot, absolute)}: ${match[1].trim()}`);
            }
          }
        }
      }
    };
    for (const name of skillDirs) walk(path.join(skillsRoot, name));
    assert(wrongIndex.length === 0, "every knowledgeIndex is '{tea-knowledge}/tea-index.csv'", wrongIndex.join('; '));
  } else {
    assert(false, 'skills/bmod-tea/knowledge exists');
  }

  console.log('');

  // ============================================================
  // Test 6: The teaching menu reaches every fragment
  // ============================================================
  // `teach-me-testing` session 7 is a hand-maintained menu of the knowledge base,
  // grouped into categories. It is the only place a learner can browse fragments,
  // and it drifted: 17 of 59 fragments were unreachable through it, including
  // every mobile fragment and the entire webhook family, while the surrounding
  // prose still advertised a number that matched the menu rather than the base.
  // A fragment nobody can navigate to is shipped and invisible, which is the same
  // failure as an unindexed one, so it is asserted the same way.
  console.log(`${colors.yellow}Test Suite 6: Teaching Menu Coverage${colors.reset}\n`);

  const menuPath = path.join(skillsRoot, 'bmad-teach-me-testing', 'steps-c', 'step-04-session-07.md');
  if (fs.existsSync(menuPath)) {
    const menu = fs.readFileSync(menuPath, 'utf8');
    const listed = [...menu.matchAll(/^- ([a-z0-9-]+\.md) -/gm)].map((match) => match[1]);
    const listedSet = new Set(listed);
    const allFragments = fs.readdirSync(knowledgeDir).filter((name) => name.endsWith('.md'));

    const unreachable = allFragments.filter((name) => !listedSet.has(name));
    assert(
      unreachable.length === 0,
      'the teaching menu lists every knowledge fragment',
      `unreachable from session 7: ${unreachable.join(', ')} - add each to a category in step-04-session-07.md`,
    );

    const phantom = listed.filter((name) => !allFragments.includes(name));
    assert(phantom.length === 0, 'the teaching menu lists no fragment that does not exist', phantom.join(', '));

    const duplicates = listed.filter((name, index) => listed.indexOf(name) !== index);
    assert(duplicates.length === 0, 'the teaching menu lists each fragment once', duplicates.join(', '));

    // Two kinds of stated count, checked separately because a heuristic that tries
    // to tell them apart by magnitude gets it wrong the moment a category grows.
    //
    // Category subtotals: `#### 2. Playwright & Pact Utils (23 fragments)` must match
    // the bullets that follow it.
    const lines = menu.split('\n');
    const subtotalErrors = [];
    let subtotalSum = 0;
    for (const [index, line] of lines.entries()) {
      const heading = /^#### (\d+)\.\s+(.+?)\s+\((\d+)\s+fragments\)$/.exec(line.trim());
      if (!heading) continue;
      subtotalSum += Number(heading[3]);
      let counted = 0;
      for (let scan = index + 1; scan < lines.length; scan += 1) {
        if (/^#### \d+\.\s/.test(lines[scan].trim())) break;
        if (/^- [a-z0-9-]+\.md -/.test(lines[scan].trim())) counted += 1;
      }
      if (counted !== Number(heading[3])) {
        subtotalErrors.push(`"${heading[2]}" says ${heading[3]}, lists ${counted}`);
      }
    }
    assert(subtotalErrors.length === 0, 'every teaching-menu category subtotal matches its own list', subtotalErrors.join('; '));

    // The arithmetic has to close as well. Each subtotal agreeing with its own
    // bullets does not make the categories add up to the base: moving a fragment
    // between two categories and correcting only one heading leaves every
    // assertion above satisfied while the sum quietly stops matching.
    assert(
      subtotalSum === allFragments.length,
      `teaching-menu category subtotals sum to the fragment count (${allFragments.length})`,
      `they sum to ${subtotalSum}`,
    );

    // Prose totals: every other stated count refers to the whole base, and prose
    // drifts silently. This is the drift that hid the 17 unreachable fragments:
    // the number matched the menu, so nobody noticed the menu was short.
    const withoutHeadings = lines.filter((line) => !/^#### \d+\.\s.*\(\d+\s+fragments\)$/.test(line.trim())).join('\n');
    const advertised = [...withoutHeadings.matchAll(/(\d+)\s+(?:TEA\s+)?(?:knowledge\s+)?fragments/g)].map((match) => Number(match[1]));
    const wrongTotals = [...new Set(advertised.filter((value) => value !== allFragments.length))];
    assert(
      wrongTotals.length === 0,
      `the teaching menu advertises the real fragment count (${allFragments.length})`,
      `states ${wrongTotals.join(', ')} instead`,
    );
  } else {
    warn('teach-me-testing session 7 not found - skipping menu coverage check');
  }

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
