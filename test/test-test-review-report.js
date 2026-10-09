/**
 * tea-test-review: the published report.
 *
 * The report an engineer reads says only what the run established. This file proves
 * the CLI's side of that:
 *
 *   - report-presentation.js removes interactive resume state, states the reviewer,
 *     marks Test Duration "not measured", leaves out criteria that do not apply,
 *     removes sentences about how the rubric decided, and puts the pull request
 *     decision at the top;
 *   - the parser accepts a report without resume state and still refuses a declared
 *     but empty stepsCompleted;
 *   - the skill's template and example are the slim shape, and parse;
 *   - the prompt carries exact file line counts and the slim contract;
 *   - a review run publishes all of it while the verdict stays what was gated.
 *
 * Usage: node test/test-test-review-report.js
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Git hooks export repository-local GIT_* variables. Clear them before this
// harness creates nested repositories or starts CLI children.
for (const name of Object.keys(process.env)) {
  if (name.startsWith('GIT_')) delete process.env[name];
}

const {
  stripResumeState,
  stampReviewer,
  presentCriteriaRows,
  tidyProseSections,
  firstThatAgrees,
  renderPullRequestGate,
} = require('../cli/lib/report-presentation');
const { parseReport } = require('../cli/lib/parse-report');
const { loadRegistryRowSeverities } = require('../cli/lib/registry-rows');
const { buildPrompt } = require('../cli/lib/build-prompt');

const repoRoot = path.join(__dirname, '..');
const skillRoot = path.join(repoRoot, 'skills', 'bmad-testarch-test-review');
const fixturesRoot = path.join(__dirname, 'fixtures', 'test-review-cli');
const stubAgent = path.join(fixturesRoot, 'stub-agent.js');
const cliPath = path.join(repoRoot, 'cli', 'test-review.js');
const registryRowSeverities = loadRegistryRowSeverities(skillRoot);

let passed = 0;
let failed = 0;

function assert(condition, name, detail) {
  if (condition) {
    passed += 1;
    console.log(`\u001B[32m✓\u001B[0m ${name}`);
  } else {
    failed += 1;
    console.log(`\u001B[31m✗\u001B[0m ${name}`);
    if (detail !== undefined) console.log(`  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
}

function section(name, body) {
  console.log(`\n${name}\n`);
  try {
    body();
  } catch (error) {
    failed += 1;
    console.log(`\u001B[31m✗\u001B[0m ${name} threw: ${error.stack ?? error.message}`);
  }
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr || result.error?.message}`);
  }
  return result.stdout;
}

const lines = (...entries) => `${entries.join('\n')}\n`;

const FRONTMATTER = lines(
  '---',
  "stepsCompleted: ['step-01-load-context', 'step-04-generate-report']",
  "lastStep: 'step-04-generate-report'",
  "lastSaved: '2026-10-08'",
  "workflowType: 'testarch-test-review'",
  "runScope: 'target'",
  "runKey: 'target-x'",
  "workflowStatus: 'completed'",
  'inputDocuments:',
  "  - 'tests/a.spec.ts'",
  "  - 'tests/b.spec.ts'",
  '---',
  '',
  '# Test Quality Review: a.spec.ts',
);

function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-report-'));
  try {
    section('resume state', () => {
      const stripped = stripResumeState(FRONTMATTER);
      assert(
        stripped ===
          lines(
            '---',
            "workflowType: 'testarch-test-review'",
            "runScope: 'target'",
            "runKey: 'target-x'",
            '---',
            '',
            '# Test Quality Review: a.spec.ts',
          ),
        'the frontmatter keeps the workflow type and run identity and loses every resume key, list continuations included',
        stripped,
      );
      const wrapped = lines(
        '---',
        'stepsCompleted:',
        '  [',
        "    'step-01',",
        "    'step-02',",
        '  ]',
        "workflowType: 'testarch-test-review'",
        '---',
        'body',
      );
      assert(
        stripResumeState(wrapped) === lines('---', "workflowType: 'testarch-test-review'", '---', 'body'),
        'a wrapped flow sequence goes with its key',
        stripResumeState(wrapped),
      );
      assert(
        stripResumeState('# no frontmatter\nstepsCompleted: x\n') === '# no frontmatter\nstepsCompleted: x\n',
        'text without a frontmatter block is left alone',
      );
      assert(
        stripResumeState(FRONTMATTER.replaceAll('\n', '\r\n'))
          .split('\n')
          .every((line, index, all) => index === all.length - 1 || line.endsWith('\r')),
        'CRLF reports stay CRLF',
      );
      const body = lines(
        '---',
        "workflowType: 'testarch-test-review'",
        '---',
        '',
        '```yaml',
        'stepsCompleted: [kept in an example]',
        '```',
      );
      assert(stripResumeState(body) === body, 'a resume key quoted in the body is not touched');
      const compact = lines(
        '---',
        'inputDocuments:',
        "- 'tests/a.spec.ts'",
        "- 'tests/b.spec.ts'",
        "workflowType: 'testarch-test-review'",
        '---',
        'body',
      );
      assert(
        stripResumeState(compact) === lines('---', "workflowType: 'testarch-test-review'", '---', 'body'),
        'a compact YAML sequence (items at column 0) goes with its key',
        stripResumeState(compact),
      );
    });

    section('reviewer', () => {
      const report = lines('# T', '**Review Mode**: pr', '**Reviewer**: TEA Agent', '', 'body');
      assert(
        stampReviewer(report, { agent: 'claude', model: 'claude-sonnet-5-5' }).includes('**Reviewer**: claude / claude-sonnet-5-5\n'),
        'the reviewer is the agent and model the CLI recorded',
      );
      assert(
        stampReviewer(report, { agent: 'codex', model: null }).includes('**Reviewer**: codex\n'),
        'a null model leaves the agent alone',
      );
      assert(
        (stampReviewer(lines('**Reviewer**: A', '**Reviewer**: B'), { agent: 'x', model: 'y' }).match(/\*\*Reviewer\*\*/g) ?? []).length ===
          1,
        'one reviewer line is left',
      );
      assert(
        stampReviewer(lines('# T', '**Review Mode**: pr', 'body'), { agent: 'x', model: 'y' }).includes(
          '**Review Mode**: pr\n**Reviewer**: x / y\n',
        ),
        'a missing reviewer line is added under the mode',
      );
      const quoted = lines('# T', '**Review Mode**: pr', '**Reviewer**: TEA Agent', '', '```md', '**Reviewer**: Jane', '```');
      const stamped = stampReviewer(quoted, { agent: 'x', model: 'y' });
      assert(
        stamped.includes('```md\n**Reviewer**: Jane\n```') && stamped.includes('**Reviewer**: x / y\n'),
        'a reviewer line quoted in a fence is left alone',
      );
    });

    section('criteria rows', () => {
      const table = lines(
        '## Quality Criteria Assessment',
        '',
        '| Criterion | Status | Violations | Basis | Notes |',
        '| --- | --- | ---: | --- | --- |',
        '| Fixture Patterns | ✅ PASS (n/a) | 0 | Applicability | gate closed |',
        '| Hard Waits | ❌ FAIL | 1 | Absolute | line 3 |',
        '| Test Duration (≤1.5 min) | ✅ PASS | 0 | Absolute | Fast tests |',
        '| Test Length (≤1000 lines) | ✅ PASS | 12 | Absolute | File is 12 lines |',
        '| Pact.js Utils Adoption | ✅ PASS (n/a) | 0 | Applicability | not a Pact file |',
        '| Data Factories | ➖ N/A | - | Applicability | no payloads |',
        '| Network-First Pattern | not applicable | 0 | Applicability | never navigates |',
        '',
        '**Total Violations**: 0 Critical, 1 High, 0 Medium, 0 Low',
      );
      const out = presentCriteriaRows(table, { 'tests/a.spec.ts': 5 });
      assert(
        !out.includes('PASS (n/a)') &&
          !out.includes('Fixture Patterns') &&
          !out.includes('Pact.js') &&
          !out.includes('Data Factories') &&
          !out.includes('Network-First'),
        'rows whose status says they do not apply are left out, in any spelling',
        out,
      );
      assert(out.includes('| Hard Waits | ❌ FAIL | 1 | Absolute | line 3 |'), 'rows that apply are kept as written', out);
      assert(
        /\| Test Duration \(≤1\.5 min\) \| ➖ Not measured \| - \| Not measured \| A static read cannot time a run \|/.test(out) &&
          !out.includes('Fast tests'),
        'Test Duration is not measured, whatever the agent wrote',
        out,
      );
      assert(
        /\| Test Length \(≤1000 lines\) \| ✅ PASS \| 0 \| Absolute \| 5 lines \|/.test(out) && !out.includes('File is 12 lines'),
        'Test Length is the line count the CLI took',
        out,
      );
      assert(
        /\| Test Length \(≤1000 lines\) \| ❌ FAIL \| 1 \| Absolute \| Largest of 2 files: 1200 lines \|/.test(
          presentCriteriaRows(table, { 'a.ts': 1200, 'b.ts': 10 }, [{ row: 'H5' }]),
        ),
        'Test Length fails when the verdict counts an H5, and several files report the largest',
      );
      assert(
        /\| Test Length \(≤1000 lines\) \| ✅ PASS \| 0 \| Absolute \| 1200 lines; over the limit, and not scored in this review \|/.test(
          presentCriteriaRows(table, { 'a.ts': 1200 }, []),
        ),
        'an oversize file the verdict does not count (it was already over the limit) cannot read as a violation',
      );
      assert(
        /\| Test Length \(≤1000 lines\) \| ❌ FAIL \| 1 \| Absolute \| 900 lines \|/.test(
          presentCriteriaRows(table, { 'a.ts': 900 }, [{ row: 'H5' }]),
        ),
        'an H5 the verdict counts shows as a failed row beside the line count',
      );
      assert(presentCriteriaRows(table, {}).includes('File is 12 lines'), 'with no counts the Test Length row is left as written');
      assert(presentCriteriaRows('no table here') === 'no table here', 'a report with no criteria section is unchanged');
      const fenced = lines('## Quality Criteria Assessment', '', '```', '| Fixture Patterns | ✅ PASS (n/a) | 0 | a | b |', '```');
      assert(presentCriteriaRows(fenced) === fenced, 'a table quoted in a fence is not touched');
      const noteMentions = lines(
        '## Quality Criteria Assessment',
        '',
        '| Criterion | Status | Violations | Basis | Notes |',
        '| --- | --- | ---: | --- | --- |',
        '| Explicit Assertions | ❌ FAIL | 1 | Absolute | Was PASS (n/a) on the base branch; line 4 now compares a value to itself. |',
      );
      assert(presentCriteriaRows(noteMentions) === noteMentions, 'only the Status cell decides that a row does not apply');
      const sixColumns = lines(
        '## Quality Criteria Assessment',
        '',
        '| Criterion | Status | Violations | Rows | Basis | Notes |',
        '| --- | --- | ---: | --- | --- | --- |',
        '| Test Duration (≤1.5 min) | ✅ PASS | 0 | H1 | Absolute | Fast |',
      );
      assert(
        presentCriteriaRows(sixColumns).includes(
          '| Test Duration (≤1.5 min) | ➖ Not measured | - | H1 | Not measured | A static read cannot time a run |',
        ),
        'the Test Duration rewrite follows the table header, not column positions',
        presentCriteriaRows(sixColumns),
      );
    });

    section('rubric mechanics and unmeasured counts', () => {
      const report = lines(
        '## Executive Summary',
        '',
        '**Overall Assessment**: Critical Issues (H1 does not fire for the old file)',
        '',
        'The assertion is tautological. H1 does not fire for this file. The registry has no row for the coverage gap. Fix the expected value.',
        '',
        '- Playwright Utils rows M9 and L9 do not exist for this run.',
        '- Keep the explicit expected value.',
        '- The M5 gate is closed: no user-level interaction API.',
        '',
        '<!-- Rows omitted: Fixture Patterns, Pact.js Utils',
        '     (the M5 gate is closed) -->',
        '',
        '## Quality Criteria Assessment',
        '',
        '| Criterion | Status | Notes |',
        '| --- | --- | --- |',
        '| Fixture Patterns | ✅ PASS | The gate is closed. The repeated setup is counted once. |',
        '| Explicit Assertions | ✅ PASS | 14 assertions (estimate) across 178 test functions |',
        '',
        '## Critical Issues (Must Fix)',
        '',
        '### 1. The listener does not fire',
        '',
        '**Severity**: P0 (Critical) because the C3 gate is open',
        '**Location**: `tests/gate-closed.spec.ts:4`',
        '**Row**: C3',
        '**Issue**: The H1 does not change after navigation, so the assertion on line 4 passes against the stale page. The onChange listener does not fire either.',
        '',
        '```',
        'H1 does not fire',
        '```',
        '',
        '**Verdict Rule**: No Critical or High and the gate closed => Approve.',
        '',
        '## Reviewed Files',
        '',
        '- tests/gate-closed.spec.ts',
      );
      const out = tidyProseSections(report);
      assert(
        out.includes('The assertion is tautological. Fix the expected value.') &&
          !out.includes('The registry has no row') &&
          !out.includes('H1 does not fire for this file'),
        'sentences about how the rubric decided go from the summary, and the rest of the paragraph stays',
        out,
      );
      assert(
        !out.includes('M9 and L9') && !out.includes('no user-level interaction API') && out.includes('- Keep the explicit expected value.'),
        'list items that only narrate the rubric go whole',
        out,
      );
      assert(
        out.includes('| Fixture Patterns | ✅ PASS | The repeated setup is counted once. |'),
        'a criteria note keeps what is left of it',
        out,
      );
      assert(
        out.includes('**Overall Assessment**: Critical Issues (H1 does not fire for the old file)'),
        'a labelled field line is never edited, even when it holds a rubric phrase',
        out,
      );
      assert(
        out.includes('<!-- Rows omitted: Fixture Patterns, Pact.js Utils\n     (the M5 gate is closed) -->'),
        'an HTML comment is never edited, so it still closes',
        out,
      );
      assert(
        out.includes('**Severity**: P0 (Critical) because the C3 gate is open') &&
          out.includes('**Location**: `tests/gate-closed.spec.ts:4`') &&
          out.includes(
            '**Issue**: The H1 does not change after navigation, so the assertion on line 4 passes against the stale page. The onChange listener does not fire either.',
          ) &&
          out.includes('### 1. The listener does not fire'),
        'finding text is never edited, including a file name and an ordinary sentence that holds a rubric phrase',
        out,
      );
      assert(
        out.includes('```\nH1 does not fire\n```') && out.includes('**Verdict Rule**:') && out.includes('- tests/gate-closed.spec.ts'),
        'fenced code, the verdict rule and manifests are untouched',
      );
      assert(
        out.includes('14 assertions (estimate) across 178 test functions (estimate)'),
        'a test or assertion count in a note is labelled an estimate, once',
        out,
      );
      const colonInside = tidyProseSections(
        lines(
          '## Executive Summary',
          '',
          '**Total Violations:** 1 Critical, 0 High, 0 Medium, 0 Low across 12 tests. The C3 gate is closed.',
          '**Overall Assessment:** Critical Issues in 12 tests. H2 does not fire here.',
        ),
      );
      assert(
        colonInside.includes('across 12 tests. The C3 gate is closed.') &&
          colonInside.includes('Critical Issues in 12 tests. H2 does not fire here.'),
        'a labelled field with the colon inside the bold is never edited either',
        colonInside,
      );
      const summaryCount = tidyProseSections(
        lines('## Executive Summary', '', 'About 178 test functions were counted by the agent. Two tests pass.'),
      );
      assert(
        summaryCount.includes('178 test functions (estimate)') && summaryCount.includes('Two tests pass.'),
        'a count in the summary is labelled, words are left alone',
        summaryCount,
      );
      for (const [sentence, label] of [
        ['The registry gap is not a finding.', 'registry gap'],
        ['The M5 gate is closed here.', 'row id with gate closed'],
        ['Rows M9 and L9 do not exist for this run.', 'rows that do not exist'],
        ['M3 did not fire on the old file.', 'row id that did not fire'],
        ['The gate was closed for this repository.', 'the gate closed'],
      ]) {
        const left = tidyProseSections(lines('## Executive Summary', '', `Keep this. ${sentence} And this.`));
        assert(left.includes('Keep this. And this.') && !left.includes(sentence), `the ${label} pattern removes its own sentence`, left);
      }
      assert(
        tidyProseSections(lines('| Notes |', '| --- |', '| The gate is closed. |')) ===
          lines('| Notes |', '| --- |', '| The gate is closed. |'),
        'a table outside the summary and criteria sections is not touched',
      );
      const dashed = tidyProseSections(
        lines('## Quality Criteria Assessment', '', '| Criterion | Notes |', '| --- | --- |', '| Fixture Patterns | The gate is closed. |'),
      );
      assert(dashed.includes('| Fixture Patterns | - |'), 'a note with nothing left reads as a dash', dashed);
    });

    section('pull request decision', () => {
      const report = lines(
        '---',
        "workflowType: 'testarch-test-review'",
        '---',
        '',
        '# Test Quality Review: a.spec.ts',
        '',
        '## Executive Summary',
        '',
      );
      const out = renderPullRequestGate(report, {
        recommendation: 'Approve',
        qualityScore: 100,
        excluded: 2,
        headSha: '0123456789abcdef0123',
      });
      assert(
        out.indexOf('> **Pull request gate**: Approve, 100/100.') > out.indexOf('# Test Quality Review') &&
          out.indexOf('> **Pull request gate**') < out.indexOf('## Executive Summary') &&
          out.includes('Reviewed commit `01234567`.') &&
          out.includes('2 findings on lines this pull request did not change were left out of this report.'),
        'the decision sits under the title, before any finding, with the reviewed commit and what was left out',
        out,
      );
      const one = renderPullRequestGate(report, { recommendation: 'Block', qualityScore: 69, excluded: 1, headSha: null });
      assert(
        one.includes('1 finding on lines this pull request did not change was left out') && !one.includes('Reviewed commit'),
        'singular wording, and no commit when none is known',
        one,
      );
      const yamlComment = renderPullRequestGate(
        lines('---', '# headless CI report', "workflowType: 'testarch-test-review'", '---', '', '# Test Quality Review: a.spec.ts'),
        { recommendation: 'Approve', qualityScore: 100, excluded: 0, headSha: null },
      );
      assert(
        yamlComment.indexOf('> **Pull request gate**') > yamlComment.lastIndexOf('---') &&
          yamlComment.startsWith('---\n# headless CI report\nworkflowType'),
        'the decision goes after the frontmatter, even when the frontmatter holds a comment',
        yamlComment,
      );
      const bare = renderPullRequestGate(lines('---', "workflowType: 'testarch-test-review'", '---', 'body'), {
        recommendation: 'Approve',
        qualityScore: 100,
        excluded: 0,
        headSha: null,
      });
      assert(
        bare.indexOf('> **Pull request gate**') > bare.lastIndexOf('---') && bare.indexOf('> **Pull request gate**') < bare.indexOf('body'),
        'with no title and no summary the decision still comes before the body',
        bare,
      );
      const none = renderPullRequestGate(report, { recommendation: 'Approve', qualityScore: 100, excluded: 0, headSha: null });
      assert(!none.includes('left out'), 'nothing is said about findings when none were left out', none);
      const noTitle = renderPullRequestGate(lines('## Executive Summary', 'x'), {
        recommendation: 'Approve',
        qualityScore: 100,
        excluded: 0,
        headSha: null,
      });
      assert(
        noTitle.startsWith('> **Pull request gate**') ||
          noTitle.indexOf('> **Pull request gate**') < noTitle.indexOf('## Executive Summary'),
        'a report with no title still gets the decision first',
      );
      assert(
        renderPullRequestGate(report.replaceAll('\n', '\r\n'), { recommendation: 'Approve', qualityScore: 100, excluded: 0, headSha: null })
          .split('\n')
          .every((line, index, all) => index === all.length - 1 || line.endsWith('\r')),
        'CRLF reports stay CRLF',
      );
    });

    section('parser and skill shape', () => {
      const example = fs.readFileSync(path.join(skillRoot, 'resources', 'test-review.example.md'), 'utf8');
      const legacy = fs.readFileSync(path.join(fixturesRoot, 'reports', 'legacy-template-report.md'), 'utf8');
      const parsedExample = parseReport(example, { registryRowSeverities });
      assert(
        parsedExample.findings.length === 3 && parsedExample.recommendation === 'Request Changes',
        'the skill example parses, with its three findings',
        parsedExample.recommendation,
      );
      assert(!/stepsCompleted|lastStep|lastSaved|workflowStatus|inputDocuments/.test(example), 'the skill example carries no resume state');
      assert(
        !/## (?:Next Steps|Appendix|Best Practices Found|Test File Analysis|Knowledge Base References|Review Metadata|Feedback on This Review)|### Key Weaknesses/.test(
          example,
        ),
        'the skill example has none of the sections that restate or pad',
      );
      assert(
        example.length < legacy.length * 0.55,
        'the skill example is roughly half the size of the report shape it replaces',
        `${example.length} vs ${legacy.length}`,
      );
      assert(
        example.split('profile-notifications.spec.ts:37').length === 2 && !/line 37|line 58|line 81/.test(example),
        'the skill example states each finding once, in its finding block',
      );
      assert(
        /^> \*\*Pull request gate\*\*: Request Changes, 79\/100\./m.test(example),
        'the skill example carries the decision line the CLI publishes in pr mode',
      );
      assert(parseReport(legacy, { registryRowSeverities }).findings.length === 3, 'a report in the earlier, longer shape still parses');

      const withoutSteps = lines(
        '---',
        "workflowType: 'testarch-test-review'",
        '---',
        '',
        example.slice(example.indexOf('# Test Quality Review')),
      );
      assert(parseReport(withoutSteps, { registryRowSeverities }).findings.length === 3, 'a report with no resume state parses');
      const emptySteps = example.replace(
        "workflowType: 'testarch-test-review'",
        "stepsCompleted: []\nworkflowType: 'testarch-test-review'",
      );
      let rejected = false;
      try {
        parseReport(emptySteps, { registryRowSeverities });
      } catch (error) {
        rejected = error.code === 'REPORT_UNPARSEABLE' && /stepsCompleted/.test(error.message);
      }
      assert(rejected, 'a declared but empty stepsCompleted is still refused');
      let noFrontmatter = false;
      try {
        parseReport(example.slice(example.indexOf('# Test Quality Review')), { registryRowSeverities });
      } catch (error) {
        noFrontmatter = error.code === 'REPORT_UNPARSEABLE';
      }
      assert(noFrontmatter, 'a report with no frontmatter is still refused');

      const template = fs.readFileSync(path.join(skillRoot, 'test-review-template.md'), 'utf8');
      assert(
        !/^## (?:Next Steps|Appendix|Best Practices Found|Test File Analysis|Knowledge Base References|Review Metadata|Feedback on This Review|Context and Integration)/m.test(
          template,
        ) &&
          !/### Key Weaknesses/.test(template) &&
          !/Rationale/.test(template) &&
          !/Before Merge|Re-Review Needed/.test(template),
        'the template has none of the sections that restate findings, no rationale and no merge instruction',
      );
      assert(
        !/PASS \\\| ✅ PASS \(n\/a\)|\{✅ PASS \(n\/a\)/.test(template) && /➖ Not measured/.test(template),
        'the template offers no PASS (n/a) and marks Test Duration not measured',
      );
      assert(
        /^workflowType: 'testarch-test-review'$/m.test(template) && !/^stepsCompleted/m.test(template),
        'the template frontmatter is the workflow type and run identity',
      );
    });

    section('prompt', () => {
      const prompt = buildPrompt({
        skillRoot,
        files: ['tests/a.spec.ts'],
        outputPath: path.join(tmpRoot, 'r.md'),
        fileStats: { 'tests/a.spec.ts': 146 },
      });
      const block = prompt.slice(
        prompt.indexOf('---BEGIN FILE STATS---\n') + '---BEGIN FILE STATS---\n'.length,
        prompt.indexOf('\n---END FILE STATS---'),
      );
      assert(
        JSON.stringify(JSON.parse(block)) === JSON.stringify({ 'tests/a.spec.ts': 146 }),
        'the prompt carries the exact line count of each review file',
      );
      assert(
        prompt.includes('Write no Key Weaknesses list') &&
          prompt.includes('Test Duration is "➖ Not measured"') &&
          prompt.includes('never write "PASS (n/a)"') &&
          prompt.includes('Write no rationale under it'),
        'the prompt states the slim contract and what the run may claim',
      );
      assert(!prompt.includes('"### Key Weaknesses" is optional'), 'the prompt no longer asks for a Key Weaknesses list');
      assert(
        prompt.includes('about how the rubric decided') &&
          prompt.includes('label an estimate "(estimate)"') &&
          prompt.includes('Do not write stepsCompleted, lastStep, lastSaved, workflowStatus or inputDocuments') &&
          prompt.includes('write nothing about why they are absent'),
        'the prompt tells the agent to say nothing about rubric mechanics, to label estimates, to omit resume state and absent rows',
      );
      const unavailable = buildPrompt({
        skillRoot,
        files: ['tests/a.spec.ts'],
        outputPath: path.join(tmpRoot, 'r.md'),
        conventionBaseline: { baselineUnavailable: true, reason: 'no corpus' },
      });
      assert(
        unavailable.includes('out of the criteria table') && !unavailable.includes('must score "✅ PASS (n/a)"'),
        'an unmeasured convention is left out of the table, not shown as a pass',
      );
    });

    section('verified presentation', () => {
      const built = [];
      const candidates = ['most', 'less', 'none'].map((label) => ({
        label,
        build: () => {
          built.push(label);
          return `text-${label}`;
        },
      }));
      const first = firstThatAgrees(candidates, () => true);
      assert(
        first.text === 'text-most' && first.skipped.length === 0 && built.join(',') === 'most',
        'the most edited text is published when it agrees, and the others are not built',
      );
      const second = firstThatAgrees(candidates, (text) => text !== 'text-most');
      assert(
        second.text === 'text-less' && second.skipped.join(',') === 'most',
        'the next less edited text is published when the first no longer agrees',
      );
      const last = firstThatAgrees(candidates, () => false);
      assert(
        last.text === 'text-none' && last.label === null && last.skipped.join(',') === 'most,less,none',
        'when nothing agrees the unedited text is published',
      );
    });

    section('a review run', () => {
      const repo = path.join(tmpRoot, 'repo');
      fs.mkdirSync(path.join(repo, 'tests'), { recursive: true });
      git(['init', '-q', '-b', 'main'], repo);
      git(['config', 'user.email', 'tea-tests@example.com'], repo);
      git(['config', 'user.name', 'TEA Tests'], repo);
      git(['config', 'commit.gpgsign', 'false'], repo);
      const base = lines(
        "test('applies the discount', () => {",
        '  const cart = makeCart();',
        '  const expected = 18;',
        "  expect(applyDiscount(cart, 'SAVE10')).toBe(expected);",
        '});',
        '',
        "test('keeps the total for an unknown code', () => {",
        '  const cart = makeCart();',
        '  if (cart.total() > 0) {',
        "    expect(applyDiscount(cart, 'NOPE')).toBe(cart.total());",
        '  }',
        '});',
      );
      fs.writeFileSync(path.join(repo, 'tests', 'discount.spec.ts'), base);
      git(['add', '.'], repo);
      git(['commit', '-q', '-m', 'base'], repo);
      git(['checkout', '-q', '-b', 'pr'], repo);
      fs.writeFileSync(
        path.join(repo, 'tests', 'discount.spec.ts'),
        base.replace('const expected = 18;', "const expected = applyDiscount(cart, 'SAVE10');"),
      );
      git(['commit', '-qam', 'pull request'], repo);
      const headSha = git(['rev-parse', 'HEAD'], repo).trim();

      const run = (name, extraArgs, fixture = 'presentation-noisy.md', project = repo) => {
        const outputDir = path.join(tmpRoot, `out-${name}`);
        const promptOut = path.join(tmpRoot, `${name}-prompt.txt`);
        const result = spawnSync(
          process.execPath,
          [
            cliPath,
            '--skill-root',
            skillRoot,
            '--project-root',
            project,
            '--output',
            path.join(outputDir, 'test-review.md'),
            '--agent-cmd',
            stubAgent,
            '--no-isolate',
            '--env-pass',
            'STUB_FIXTURE',
            '--env-pass',
            'STUB_PROMPT_OUT',
            ...extraArgs,
          ],
          { encoding: 'utf8', env: { ...process.env, STUB_FIXTURE: fixture, STUB_PROMPT_OUT: promptOut } },
        );
        let verdict = null;
        try {
          verdict = JSON.parse(result.stdout);
        } catch {
          // asserted below with the raw output
        }
        const reportPath = path.join(outputDir, 'test-review.md');
        return {
          ...result,
          verdict,
          report: fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : '',
          prompt: fs.existsSync(promptOut) ? fs.readFileSync(promptOut, 'utf8') : '',
        };
      };

      const pr = run('pr', ['--base', 'main']);
      assert(
        pr.status === 1 && pr.verdict?.recommendation === 'Block' && pr.verdict?.findings?.length === 1,
        'the review gates on its finding',
        `status=${pr.status} stderr=${pr.stderr}`,
      );
      assert(
        !/stepsCompleted|lastStep|lastSaved|workflowStatus|inputDocuments/.test(pr.report) &&
          /^workflowType: 'testarch-test-review'$/m.test(pr.report),
        'the published report carries no resume state',
        pr.report.slice(0, 300),
      );
      assert(
        /^\*\*Reviewer\*\*: claude \/ sonnet$/m.test(pr.report) && !pr.report.includes('TEA Agent'),
        'the published report names the agent and model the CLI recorded',
        pr.report.slice(0, 600),
      );
      assert(
        !pr.report.includes('PASS (n/a)') && !pr.report.includes('Fixture Patterns') && !pr.report.includes('Pact.js'),
        'rows that do not apply are not in the published criteria table',
        pr.report,
      );
      assert(
        /\| Test Duration \(≤1\.5 min\) \| ➖ Not measured \|/.test(pr.report) && !pr.report.includes('Fast tests'),
        'Test Duration reads not measured',
        pr.report,
      );
      assert(
        !/does not fire|registry has no row|gate is closed/.test(pr.report) &&
          pr.report.includes('About 178 test functions (estimate) were counted by the agent.'),
        'sentences about how the rubric decided are gone, and the agent count is labelled an estimate',
        pr.report,
      );
      assert(
        pr.report.includes('> **Pull request gate**: Block, 69/100.') &&
          pr.report.indexOf('> **Pull request gate**') < pr.report.indexOf('## Executive Summary') &&
          pr.report.includes(`Reviewed commit \`${headSha.slice(0, 8)}\`.`) &&
          !pr.report.includes('## PR Delta Gate'),
        'the pull request decision is at the top with the reviewed commit, and no gate section is appended',
        pr.report.slice(0, 700),
      );
      assert(
        JSON.stringify(
          JSON.parse(
            pr.prompt.slice(
              pr.prompt.indexOf('---BEGIN FILE STATS---\n') + '---BEGIN FILE STATS---\n'.length,
              pr.prompt.indexOf('\n---END FILE STATS---'),
            ),
          ),
        ) === JSON.stringify({ 'tests/discount.spec.ts': 12 }),
        'the agent run is told the exact line count of the review file',
        pr.prompt.slice(0, 200),
      );
      assert(
        /\| Test Length \(≤1000 lines\) \| ✅ PASS \| 0 \| Absolute \| 12 lines \|/.test(pr.report) && !pr.report.includes('999 lines'),
        "Test Length is the line count the CLI took, not the agent's",
        pr.report,
      );
      const reparsed = parseReport(pr.report, { registryRowSeverities });
      assert(
        reparsed.recommendation === 'Block' && reparsed.findings.length === 1 && reparsed.qualityScore === pr.verdict.qualityScore,
        'the published report still parses to the verdict that was gated',
        reparsed.recommendation,
      );

      const left = run('left-out', ['--base', 'main'], 'pr-scope-symptom.md');
      assert(
        left.verdict?.findings?.length === 1 &&
          left.report.includes('1 finding on lines this pull request did not change was left out of this report.') &&
          left.report.indexOf('was left out of this report.') < left.report.indexOf('## Executive Summary'),
        'the decision under the title says how many findings were left out',
        left.report.slice(0, 800),
      );

      const promptOnly = spawnSync(
        process.execPath,
        [cliPath, '--skill-root', skillRoot, '--project-root', repo, '--base', 'main', '--agent', 'none'],
        {
          encoding: 'utf8',
        },
      );
      assert(
        promptOnly.stdout.includes('---BEGIN FILE STATS---\n{\n  "tests/discount.spec.ts": 12\n}\n---END FILE STATS---'),
        'a prompt-only run states the line counts too',
      );

      const bigRepo = path.join(tmpRoot, 'big');
      fs.mkdirSync(path.join(bigRepo, 'tests'), { recursive: true });
      git(['init', '-q', '-b', 'main'], bigRepo);
      git(['config', 'user.email', 'tea-tests@example.com'], bigRepo);
      git(['config', 'user.name', 'TEA Tests'], bigRepo);
      git(['config', 'commit.gpgsign', 'false'], bigRepo);
      const bigBase = lines(...base.trimEnd().split('\n'), ...Array.from({ length: 1100 }, (_, index) => `// filler ${index}`));
      fs.writeFileSync(path.join(bigRepo, 'tests', 'discount.spec.ts'), bigBase);
      git(['add', '.'], bigRepo);
      git(['commit', '-q', '-m', 'base'], bigRepo);
      git(['checkout', '-q', '-b', 'pr'], bigRepo);
      fs.writeFileSync(
        path.join(bigRepo, 'tests', 'discount.spec.ts'),
        bigBase.replace('const expected = 18;', "const expected = applyDiscount(cart, 'SAVE10');"),
      );
      git(['commit', '-qam', 'pull request'], bigRepo);
      const big = run('big', ['--base', 'main'], 'presentation-noisy.md', bigRepo);
      assert(
        /\| Test Length \(≤1000 lines\) \| ✅ PASS \| 0 \| Absolute \| 1112 lines; over the limit, and not scored in this review \|/.test(
          big.report,
        ) && /^\*\*Total Violations\*\*: 1 Critical, 0 High, 0 Medium, 0 Low$/m.test(big.report),
        'a file that was already oversize before the pull request does not read as a violation the verdict does not count',
        big.report.slice(0, 1500),
      );

      const full = run('full', ['--files', 'tests/discount.spec.ts']);
      assert(
        full.verdict?.reviewMode === 'full-file' &&
          !full.report.includes('Pull request gate') &&
          !/stepsCompleted/.test(full.report) &&
          /^\*\*Reviewer\*\*: claude \/ sonnet$/m.test(full.report) &&
          !full.report.includes('PASS (n/a)'),
        'a full-file review gets the same presentation without a pull request decision',
        full.report.slice(0, 500),
      );
    });
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
