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

  const agentKnowledgeDir = path.join(kbRoot, 'knowledge');
  const workflowsRoot = path.join(projectRoot, 'src', 'workflows', 'testarch');

  // Present at the agent level only, by design: the agent reads them directly
  // and no workflow step references them.
  const AGENT_ONLY_FRAGMENTS = new Set(['confidence-gate.md', 'pactjs-utils-zod-to-pact.md']);

  if (!fs.existsSync(agentKnowledgeDir) || !fs.existsSync(workflowsRoot)) {
    warn('agent knowledge dir or workflows root missing - skipping parity checks');
  } else {
    const agentFragments = fs.readdirSync(agentKnowledgeDir).filter((name) => name.endsWith('.md'));
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

      const missing = agentFragments.filter((name) => !AGENT_ONLY_FRAGMENTS.has(name) && !copySet.has(name));
      assert(missing.length === 0, `${workflowName} carries every shared agent fragment`, `missing: ${missing.join(', ')}`);

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
