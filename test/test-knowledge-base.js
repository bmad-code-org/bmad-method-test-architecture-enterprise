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
const crypto = require('node:crypto');
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
  const kbRoot = path.join(projectRoot, 'src', 'agents', 'bmad-tea', 'resources');
  const indexPath = path.join(kbRoot, 'tea-index.csv');

  // ============================================================
  // Test 1: Parse CSV and validate structure
  // ============================================================
  console.log(`${colors.yellow}Test Suite 1: CSV Structure${colors.reset}\n`);

  let records = [];
  try {
    const csv = fs.readFileSync(indexPath, 'utf8');
    records = parse(csv, { columns: true, skip_empty_lines: true });

    const expectedFragmentCount = fs.readdirSync(path.join(kbRoot, 'knowledge')).filter((f) => f.endsWith('.md')).length;
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
  // Test 5: Workflow knowledge copies match the agent's
  // ============================================================
  // Every workflow ships its own copy of the knowledge base so a skill stays
  // self-contained. Nothing checked that the copies still MATCH the agent's,
  // and a copy can drift silently: the workflows load their own copy, so a
  // fragment edited only at the agent level ships one rule to the reviewer and
  // a different one to the generator. That is not a hypothetical — it is the
  // failure this suite was added to catch.
  console.log(`${colors.yellow}Test Suite 5: Workflow Fragment Parity${colors.reset}\n`);

  const sha1 = (filePath) => crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');

  // Suite 4's cross-fragment link check runs against the agent directory only. It
  // does not need a per-workflow twin, but the reason is narrower than it looks:
  // set equality plus byte equality carries the link guarantee ONLY while every
  // link resolves inside the knowledge directory. The two locations sit at
  // different depths - src/agents/bmad-tea/resources/knowledge is five segments,
  // src/workflows/testarch/<workflow>/resources/knowledge is six - so a link that
  // escapes with `../` resolves to different targets from the two while the bytes
  // stay identical. Set equality, byte equality, and Suite 4 would all still pass
  // with all eight copies pointing at nothing. That third condition is asserted
  // below rather than assumed, because a fragment gaining one `../` link is a
  // small and reviewable-looking diff.
  // Known limit, shared with Suite 4: a fragment named inside backticks rather than
  // as a markdown link is not resolved by either check. Closing it wants a way to
  // tell a fragment reference from a step-file reference, and the obvious mechanism
  // is the exemption list this suite deliberately does not have.

  const agentKnowledgeDir = path.join(kbRoot, 'knowledge');
  const workflowsRoot = path.join(projectRoot, 'src', 'workflows', 'testarch');

  // No agent-only allowlist. There was one, and both entries were wrong: nine step
  // files referenced `confidence-gate.md` and five referenced
  // `pactjs-utils-zod-to-pact.md` while neither shipped to a workflow, and the
  // exemption is what kept this suite green through it. An allowlist entry asserts
  // intent instead of measuring anything, so a future agent-only fragment should
  // have to argue for itself in a diff rather than inherit an empty slot here.

  if (!fs.existsSync(agentKnowledgeDir) || !fs.existsSync(workflowsRoot)) {
    warn('agent knowledge dir or workflows root missing - skipping parity checks');
  } else {
    const agentFragments = fs.readdirSync(agentKnowledgeDir).filter((name) => name.endsWith('.md'));

    // The condition the transitivity argument above rests on. Resolve each link and
    // check where it lands, rather than pattern-matching the spellings that usually
    // escape: `](./../x.md)` and a root-relative `](/src/...)` both leave the
    // directory without starting `../`, and a prefix pattern standing in for a
    // resolution property is the same substitution this suite exists to avoid.
    const escapers = [];
    for (const name of agentFragments) {
      const content = fs.readFileSync(path.join(agentKnowledgeDir, name), 'utf8');
      for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
        const raw = match[1].trim();
        // Strip an anchor before the .md test. Suite 4 filters on the raw href and so
        // skips `](../foo.md#section)`; that boundary is pre-existing and shared, but
        // an anchored link escapes the directory exactly like an unanchored one, and
        // containment is what this assertion is about.
        const href = raw.split('#')[0];
        if (!href.endsWith('.md') || isExternalLink(href)) continue;
        const resolved = resolveFragmentLink(kbRoot, href);
        if (resolved === null) continue;
        const relative = path.relative(agentKnowledgeDir, path.resolve(resolved));
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          escapers.push(`${name} -> ${raw}`);
        }
      }
    }
    assert(
      escapers.length === 0,
      'no fragment links outside its own knowledge directory',
      `${escapers.join(', ')} - the agent copy sits one path segment shallower than every workflow copy, so a link ` +
        'leaving the directory resolves elsewhere from each while the bytes match. Inline the content, or name the ' +
        'fragment without linking it.',
    );
    const agentShas = new Map(agentFragments.map((name) => [name, sha1(path.join(agentKnowledgeDir, name))]));

    const workflowDirs = fs
      .readdirSync(workflowsRoot)
      .map((name) => path.join(workflowsRoot, name, 'resources', 'knowledge'))
      .filter((dir) => fs.existsSync(dir));

    assert(workflowDirs.length > 0, 'at least one workflow ships a knowledge directory');

    for (const dir of workflowDirs) {
      const workflowName = path.basename(path.dirname(path.dirname(dir)));
      const copies = fs.readdirSync(dir).filter((name) => name.endsWith('.md'));
      const copySet = new Set(copies);

      const missing = agentFragments.filter((name) => !copySet.has(name));
      assert(missing.length === 0, `${workflowName} carries every agent fragment`, `missing: ${missing.join(', ')}`);

      const extra = copies.filter((name) => !agentShas.has(name));
      assert(extra.length === 0, `${workflowName} carries no fragment the agent does not have`, `extra: ${extra.join(', ')}`);

      const drifted = copies.filter((name) => agentShas.has(name) && sha1(path.join(dir, name)) !== agentShas.get(name));
      assert(
        drifted.length === 0,
        `${workflowName} fragment contents match the agent copies`,
        `drifted: ${drifted.join(', ')} - re-copy from src/agents/bmad-tea/resources/knowledge/`,
      );

      // The other half of "ship the fragment": a file on disk with no row in the
      // workflow's own index is never selected, so it is unreachable while looking
      // present. The reverse - a row naming a file that is not there - fails just as
      // quietly. test-installation-components.js checks a CSV against its directory
      // for the FIRST workflow it encounters and then sets a flag, so the other seven
      // indexes are unvalidated there. Assert set equality here, for every workflow.
      const indexPath = path.join(path.dirname(dir), 'tea-index.csv');
      if (!fs.existsSync(indexPath)) {
        assert(false, `${workflowName} ships a tea-index.csv beside its knowledge directory`);
        continue;
      }

      let indexRows = [];
      try {
        indexRows = parse(fs.readFileSync(indexPath, 'utf8'), { columns: true, skip_empty_lines: true });
      } catch (error) {
        assert(false, `${workflowName}/resources/tea-index.csv parses`, error.message);
        continue;
      }

      const indexed = indexRows.map((row) => (row.fragment_file || '').replace(/^knowledge\//, '')).filter(Boolean);
      const indexedSet = new Set(indexed);

      assert(
        indexed.length === indexedSet.size,
        `${workflowName}/resources/tea-index.csv lists each fragment once`,
        `duplicates: ${indexed.filter((name, i) => indexed.indexOf(name) !== i).join(', ')}`,
      );

      const unindexed = copies.filter((name) => !indexedSet.has(name));
      assert(
        unindexed.length === 0,
        `${workflowName} indexes every fragment it ships`,
        `on disk but absent from tea-index.csv, so never selected: ${unindexed.join(', ')}`,
      );

      const danglingRows = [...indexedSet].filter((name) => !copySet.has(name));
      assert(
        danglingRows.length === 0,
        `${workflowName} indexes no fragment it does not ship`,
        `in tea-index.csv but missing from knowledge/: ${danglingRows.join(', ')}`,
      );
    }
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

  const menuPath = path.join(workflowsRoot, 'bmad-teach-me-testing', 'steps-c', 'step-04-session-07.md');
  if (fs.existsSync(menuPath)) {
    const menu = fs.readFileSync(menuPath, 'utf8');
    const listed = [...menu.matchAll(/^- ([a-z0-9-]+\.md) -/gm)].map((match) => match[1]);
    const listedSet = new Set(listed);
    const allFragments = fs.readdirSync(path.join(kbRoot, 'knowledge')).filter((name) => name.endsWith('.md'));

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
    // Category subtotals: `**2. Playwright & Pact Utils (23 fragments)**` must match
    // the bullets that follow it.
    const lines = menu.split('\n');
    const subtotalErrors = [];
    let subtotalSum = 0;
    for (const [index, line] of lines.entries()) {
      const heading = /^\*\*(\d+)\.\s+(.+?)\s+\((\d+)\s+fragments\)\*\*$/.exec(line.trim());
      if (!heading) continue;
      subtotalSum += Number(heading[3]);
      let counted = 0;
      for (let scan = index + 1; scan < lines.length; scan += 1) {
        if (/^\*\*\d+\.\s/.test(lines[scan].trim())) break;
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
    const withoutHeadings = lines.filter((line) => !/^\*\*\d+\.\s.*\(\d+\s+fragments\)\*\*$/.test(line.trim())).join('\n');
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
