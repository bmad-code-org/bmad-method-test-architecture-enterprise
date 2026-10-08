/**
 * Installation Component Tests - TEA Module
 *
 * Tests TEA module installation components in isolation:
 * - Agent YAML structure validation
 * - Module.yaml validation
 * - Path references validation
 * - Scoped output layout of the per-scope workflows
 *
 * These are deterministic unit tests that don't require full installation.
 * Usage: node test/test-installation-components.js
 */

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const { parse } = require('csv-parse/sync');
const yaml = require('js-yaml');
const TOML = require('smol-toml');
const { packedPaths: readPackedPaths } = require('./lib/pack-listing');

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? match[1] : '';
}

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

/**
 * Test helper: Assert condition
 */
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

/**
 * Test Suite
 */
async function runTests() {
  console.log(`${colors.cyan}========================================`);
  console.log('TEA Installation Component Tests');
  console.log(`========================================${colors.reset}\n`);

  const projectRoot = path.join(__dirname, '..');

  // ============================================================
  // Test 1: bmod.toml Structure
  // ============================================================
  console.log(`${colors.yellow}Test Suite 1: Module Configuration${colors.reset}\n`);

  try {
    const bmodToml = TOML.parse(await fs.readFile(path.join(projectRoot, 'skills/bmod-tea/bmod.toml'), 'utf8'));
    const bmod = bmodToml.bmod || {};
    const questions = Object.fromEntries((bmod.config_questions || []).map((question) => [question.key, question]));

    assert(bmod.code === 'tea', 'bmod.toml has correct code: tea');
    assert(typeof bmod.version === 'string' && bmod.version.length > 0, 'bmod.toml has a version');
    assert(Array.isArray(bmod.skills) && bmod.skills.includes('bmad-tea'), 'bmod.toml lists the bmad-tea skill');
    assert(
      (bmod.config_questions || []).every((question) => typeof question.default === 'string'),
      'bmod.toml config_questions defaults are all strings',
    );
    assert(questions.tea_use_playwright_utils?.default === 'true', 'bmod.toml defaults Playwright Utils to "true"');
    assert(questions.tea_use_pactjs_utils?.default === 'true', 'bmod.toml defaults Pact.js Utils to "true"');
    assert(questions.tea_pact_mcp?.default === 'mcp', 'bmod.toml defaults Pact MCP to mcp');
    assert(!('tea_evaluations_folder' in questions), 'bmod.toml does not ask for tea_evaluations_folder (it is evaluate customization)');
    assert(
      questions.tea_use_pactjs_utils?.prompt.includes('no consumer-provider boundary'),
      'bmod.toml Pact.js Utils prompt says it never adds contract tests without a consumer-provider boundary',
    );
    assert(
      questions.tea_pact_mcp?.prompt.includes('skipped automatically when no broker is reachable'),
      'bmod.toml Pact MCP prompt states the no-broker degradation',
    );
  } catch (error) {
    assert(false, 'bmod.toml loads and validates', error.message);
  }

  try {
    const evaluateCustomize = TOML.parse(await fs.readFile(path.join(projectRoot, 'skills/bmad-testarch-evaluate/customize.toml'), 'utf8'));
    assert(
      evaluateCustomize.workflow?.evaluations_folder === 'evals',
      'bmad-testarch-evaluate customize.toml defaults evaluations_folder to evals',
    );
  } catch (error) {
    assert(false, 'bmad-testarch-evaluate customize.toml loads', error.message);
  }

  try {
    const bmod = TOML.parse(await fs.readFile(path.join(projectRoot, 'skills/bmod-tea/bmod.toml'), 'utf8')).bmod;
    const migration = TOML.parse(await fs.readFile(path.join(projectRoot, 'skills/bmod-tea/migration-1.toml'), 'utf8')).migration || {};
    const questionKeys = new Set((bmod.config_questions || []).map((question) => question.key));

    // `bmad migrate` lists only a migration that carries every one of these fields.
    const missingFields = ['module', 'from', 'to', 'title', 'summary', 'detect', 'guide', 'checklist'].filter(
      (field) =>
        migration[field] === undefined || migration[field] === '' || (Array.isArray(migration[field]) && migration[field].length === 0),
    );
    assert(missingFields.length === 0, 'migration-1.toml carries every field bmad migrate requires', missingFields.join(', '));
    assert(
      migration.module === bmod.code && migration.from === '6' && migration.to === '7',
      'migration-1.toml migrates module tea from 6 to 7',
    );

    // The keys it keeps are exactly the keys setup asks; the keys it moves or drops are not asked.
    const kept = [...(migration.target.match(/`([a-z_]+)`/g) || [])].map((token) => token.slice(1, -1));
    const keptQuestions = new Set(kept.filter((key) => questionKeys.has(key)));
    assert(
      questionKeys.size === 9 && [...questionKeys].every((key) => keptQuestions.has(key)),
      'migration-1.toml keeps every key bmod.toml asks',
      [...questionKeys].filter((key) => !keptQuestions.has(key)).join(', '),
    );
    for (const gone of [
      'ci_platform',
      'tea_evaluations_folder',
      'risk_threshold',
      'test_design_output',
      'test_review_output',
      'trace_output',
    ]) {
      assert(!questionKeys.has(gone), `bmod.toml does not ask the v6 key ${gone}, which migration-1.toml moves or drops`);
      assert(migration.detect.includes(gone), `migration-1.toml detects ${gone}`);
    }

    // The two moved keys land on keys their skill's customize.toml declares.
    const ciCustomize = TOML.parse(await fs.readFile(path.join(projectRoot, 'skills/bmad-testarch-ci/customize.toml'), 'utf8'));
    const evaluateCustomize = TOML.parse(await fs.readFile(path.join(projectRoot, 'skills/bmad-testarch-evaluate/customize.toml'), 'utf8'));
    assert(
      ciCustomize.workflow?.ci_platform === 'auto',
      'bmad-testarch-ci customize.toml declares ci_platform, the destination migration-1.toml names',
    );
    assert(
      typeof evaluateCustomize.workflow?.evaluations_folder === 'string' &&
        migration.guide.includes('bmad-testarch-evaluate.toml') &&
        migration.guide.includes('bmad-testarch-ci.toml') &&
        migration.guide.includes('`[workflow]` `evaluations_folder`') &&
        migration.guide.includes('`[workflow]` `ci_platform`'),
      'migration-1.toml writes evaluations_folder and ci_platform to the customization files of the skills that declare them',
    );
  } catch (error) {
    assert(false, 'migration-1.toml loads and validates', error.message);
  }

  console.log('');

  // ============================================================
  // Test 2: TEA Agent Native Skill Structure
  // ============================================================
  console.log(`${colors.yellow}Test Suite 2: TEA Agent Native Skill Structure${colors.reset}\n`);

  try {
    const skillDir = path.join(projectRoot, 'skills/bmad-tea');
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    const customizePath = path.join(skillDir, 'customize.toml');

    // Validate SKILL.md matches the new BMM agent activation pattern
    if (await pathExists(skillMdPath)) {
      const skillContent = await fs.readFile(skillMdPath, 'utf8');

      assert(skillContent.includes('name: bmad-tea'), 'SKILL.md has correct skill name in frontmatter');
      assert(skillContent.includes('## On Activation'), 'SKILL.md has On Activation section');
      assert(
        skillContent.includes('{project-root}/_bmad/scripts/resolve_customization.py'),
        'SKILL.md routes customization through the shared resolver',
      );
      assert(skillContent.includes('--key agent'), 'SKILL.md resolves the [agent] customization block');
      assert(skillContent.includes('{agent.role}'), 'SKILL.md layers {agent.role} onto the persona');
      assert(skillContent.includes('{agent.identity}'), 'SKILL.md layers {agent.identity} onto the persona');
      assert(skillContent.includes('{agent.principles}'), 'SKILL.md layers {agent.principles} onto the persona');
      assert(skillContent.includes('{agent.persistent_facts}'), 'SKILL.md loads {agent.persistent_facts}');
      assert(skillContent.includes('{agent.menu}'), 'SKILL.md dispatches from {agent.menu}');
      assert(skillContent.includes('activation_steps_prepend'), 'SKILL.md runs activation_steps_prepend');
      assert(skillContent.includes('activation_steps_append'), 'SKILL.md runs activation_steps_append');
      assert(skillContent.includes('## Critical Actions'), 'SKILL.md has Critical Actions section');

      // Verify old-pattern artifacts are gone
      assert(!skillContent.includes('resolve-customization.py'), 'SKILL.md no longer calls the per-skill resolver stub');
      assert(!skillContent.includes('{persona.displayName}'), 'SKILL.md no longer uses the old {persona.*} namespace');
      assert(!skillContent.includes('_bmad/bmm/'), 'SKILL.md has no _bmad/bmm/ references');
      assert(!skillContent.includes('module: bmm'), 'SKILL.md has no module: bmm references');
    } else {
      assert(false, 'SKILL.md exists', 'skills/bmad-tea/SKILL.md not found');
    }

    // Validate customize.toml carries the agent essence + menu in the new [agent] namespace.
    // Parse with a tiny line-by-line reader — good enough for flat key/value assertions
    // without adding a TOML dep.
    if (await pathExists(customizePath)) {
      const customizeContent = await fs.readFile(customizePath, 'utf8');

      assert(customizeContent.includes('[agent]'), 'customize.toml has [agent] section');
      assert(/^\s*name\s*=\s*"Murat"/m.test(customizeContent), 'customize.toml pins agent.name = "Murat"');
      assert(/^\s*title\s*=\s*"Master Test Architect and Quality Advisor"/m.test(customizeContent), 'customize.toml pins agent.title');
      assert(/^\s*icon\s*=\s*"🧪"/m.test(customizeContent), 'customize.toml pins agent.icon');
      assert(customizeContent.includes('persistent_facts'), 'customize.toml defines persistent_facts');
      assert(
        /^\s*persistent_facts\s*=\s*\[\s*\]/m.test(customizeContent),
        'customize.toml ships persistent_facts empty (opt-in, not a baked default)',
      );
      assert(customizeContent.includes('activation_steps_prepend'), 'customize.toml defines activation_steps_prepend');
      assert(customizeContent.includes('activation_steps_append'), 'customize.toml defines activation_steps_append');

      // Verify all 9 capability codes live on the [[agent.menu]] array-of-tables
      const expectedMenu = [
        { code: 'TMT', skill: 'bmad-teach-me-testing' },
        { code: 'TF', skill: 'bmad-testarch-framework' },
        { code: 'AT', skill: 'bmad-testarch-atdd' },
        { code: 'TA', skill: 'bmad-testarch-automate' },
        { code: 'EV', skill: 'bmad-testarch-evaluate' },
        { code: 'TD', skill: 'bmad-testarch-test-design' },
        { code: 'TR', skill: 'bmad-testarch-trace' },
        { code: 'NR', skill: 'bmad-testarch-nfr' },
        { code: 'CI', skill: 'bmad-testarch-ci' },
        { code: 'RV', skill: 'bmad-testarch-test-review' },
      ];
      for (const { code, skill } of expectedMenu) {
        const codePattern = new RegExp(`\\[\\[agent\\.menu]]\\s*\\ncode\\s*=\\s*"${code}"`);
        assert(codePattern.test(customizeContent), `customize.toml has [[agent.menu]] entry for code ${code}`);
        assert(customizeContent.includes(`skill = "${skill}"`), `customize.toml menu ${code} dispatches to ${skill}`);
        const workflowDir = path.join(projectRoot, `skills/${skill}`);
        assert(await pathExists(workflowDir), `Capability skill ${skill} has matching workflow directory`);
      }
    } else {
      assert(false, 'customize.toml exists', 'skills/bmad-tea/customize.toml not found');
    }

    // roster.toml must declare the agent essence for the bmad roster
    const rosterToml = TOML.parse(await fs.readFile(path.join(projectRoot, 'skills/bmod-tea/roster.toml'), 'utf8'));
    assert(Array.isArray(rosterToml.members), 'roster.toml has [[members]]');
    const teaAgentEntry = (rosterToml.members || []).find((entry) => entry && entry.code === 'bmad-tea');
    assert(teaAgentEntry !== undefined, 'roster.toml members contains bmad-tea entry');
    if (teaAgentEntry) {
      assert(teaAgentEntry.skill === 'bmad-tea', 'roster.toml bmad-tea entry has skill: bmad-tea');
      assert(teaAgentEntry.name === 'Murat', 'roster.toml bmad-tea entry has name: Murat');
      assert(teaAgentEntry.title && teaAgentEntry.title.length > 0, 'roster.toml bmad-tea entry has a title');
      assert(teaAgentEntry.icon === '🧪', 'roster.toml bmad-tea entry has icon 🧪');
      assert(typeof teaAgentEntry.persona === 'string' && teaAgentEntry.persona.length > 0, 'roster.toml bmad-tea entry has a persona');
    }

    // Old-pattern files must be gone
    assert(
      !(await pathExists(path.join(skillDir, 'bmad-skill-manifest.yaml'))),
      'Legacy bmad-skill-manifest.yaml is removed from the agent',
    );
    assert(
      !(await pathExists(path.join(skillDir, 'scripts', 'resolve-customization.py'))),
      'Legacy per-agent resolve-customization.py is removed',
    );
  } catch (error) {
    assert(false, 'TEA agent native skill structure validates', error.message);
  }

  console.log('');

  // ============================================================
  // Test 3: Knowledge Base Structure
  // ============================================================
  console.log(`${colors.yellow}Test Suite 3: Knowledge Base${colors.reset}\n`);

  try {
    const teaIndexPath = path.join(projectRoot, 'skills/bmod-tea/knowledge/tea-index.csv');
    const knowledgeDir = path.join(projectRoot, 'skills/bmod-tea/knowledge');

    if (await pathExists(teaIndexPath)) {
      const csvContent = await fs.readFile(teaIndexPath, 'utf8');
      const lines = csvContent.trim().split(/\r?\n/);
      const knowledgeFiles = (await fs.readdir(knowledgeDir)).filter((fileName) => fileName.endsWith('.md'));

      assert(
        lines.length === knowledgeFiles.length + 1,
        'tea-index.csv line count matches knowledge fragments',
        `Found ${lines.length} lines for ${knowledgeFiles.length} knowledge fragments`,
      );
      assert(lines[0].includes('id,name,description,tags,tier,fragment_file'), 'tea-index.csv has correct header format');

      // Verify no BMM references in CSV
      assert(!csvContent.includes('bmm'), 'tea-index.csv has no BMM references');
    } else {
      console.log(`  ${colors.dim}Skipping - tea-index.csv not found (run Phase 2 first)${colors.reset}`);
    }
  } catch (error) {
    assert(false, 'Knowledge base structure validates', error.message);
  }

  console.log('');

  // ============================================================
  // Test 4: Workflow Structure
  // ============================================================
  console.log(`${colors.yellow}Test Suite 4: Workflow Structure${colors.reset}\n`);

  const workflowDirs = [
    'bmad-teach-me-testing',
    'bmad-testarch-framework',
    'bmad-testarch-ci',
    'bmad-testarch-test-design',
    'bmad-testarch-atdd',
    'bmad-testarch-automate',
    'bmad-testarch-test-review',
    'bmad-testarch-nfr',
    'bmad-testarch-trace',
  ];

  for (const dirName of workflowDirs) {
    const workflowDir = path.join(projectRoot, `skills/${dirName}`);
    const skillMdPath = path.join(projectRoot, `skills/${dirName}/SKILL.md`);
    const customizeTomlPath = path.join(projectRoot, `skills/${dirName}/customize.toml`);
    const workflowYamlPath = path.join(projectRoot, `skills/${dirName}/workflow.yaml`);
    const instructionsMdPath = path.join(projectRoot, `skills/${dirName}/instructions.md`);
    let workflowKnowledgeIndexValidated = false;

    if (await pathExists(skillMdPath)) {
      try {
        const skillContent = await fs.readFile(skillMdPath, 'utf8');
        assert(skillContent && skillContent.trim().length > 0, `${dirName}/SKILL.md is not empty`);
        assert(skillContent.includes('## On Activation'), `${dirName}/SKILL.md has On Activation section`);
        assert(
          skillContent.includes('resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow'),
          `${dirName}/SKILL.md resolves the workflow customization block`,
        );
        assert(skillContent.includes('{workflow.activation_steps_prepend}'), `${dirName}/SKILL.md executes prepend activation steps`);
        assert(skillContent.includes('{workflow.activation_steps_append}'), `${dirName}/SKILL.md executes append activation steps`);
        assert(skillContent.includes('{workflow.persistent_facts}'), `${dirName}/SKILL.md loads persistent facts`);
        assert(
          skillContent.includes('Resolve sibling workflow files such as `instructions.md`'),
          `${dirName}/SKILL.md explains sibling workflow path resolution`,
        );
        assert(/\{skill-root\}\/steps-[cev]\//.test(skillContent), `${dirName}/SKILL.md routes first step from {skill-root}`);
        assert(!skillContent.includes('Read `{skill-root}/workflow.md`'), `${dirName}/SKILL.md no longer redirects to workflow.md`);
        assert(!skillContent.includes('[workflow.md](workflow.md)'), `${dirName}/SKILL.md no longer uses a bare relative workflow link`);
      } catch (error) {
        assert(false, `${dirName}/SKILL.md validates`, error.message);
      }
    } else {
      assert(false, `${dirName}/SKILL.md exists`, `skills/${dirName}/SKILL.md not found`);
    }

    if (await pathExists(customizeTomlPath)) {
      try {
        const customizeContent = await fs.readFile(customizeTomlPath, 'utf8');
        assert(customizeContent.includes('[workflow]'), `${dirName}/customize.toml has [workflow] section`);
        assert(customizeContent.includes('activation_steps_prepend'), `${dirName}/customize.toml defines activation_steps_prepend`);
        assert(customizeContent.includes('activation_steps_append'), `${dirName}/customize.toml defines activation_steps_append`);
        assert(customizeContent.includes('persistent_facts'), `${dirName}/customize.toml defines persistent_facts`);
        assert(customizeContent.includes('on_complete'), `${dirName}/customize.toml defines on_complete`);
        assert(
          /^\s*persistent_facts\s*=\s*\[\s*\]/m.test(customizeContent),
          `${dirName}/customize.toml ships persistent_facts empty (opt-in, not a baked default)`,
        );
      } catch (error) {
        assert(false, `${dirName}/customize.toml validates`, error.message);
      }
    } else {
      assert(false, `${dirName}/customize.toml exists`, `skills/${dirName}/customize.toml not found`);
    }

    // workflow.md was folded into SKILL.md and removed (PR: workflow customization rollout).
    const legacyWorkflowMdPath = path.join(projectRoot, `skills/${dirName}/workflow.md`);
    assert(!(await pathExists(legacyWorkflowMdPath)), `${dirName}/workflow.md is removed (content lives in SKILL.md)`);

    if (await pathExists(workflowYamlPath)) {
      try {
        const workflowYaml = yaml.load(await fs.readFile(workflowYamlPath, 'utf8'));
        assert(workflowYaml !== undefined, `${dirName}/workflow.yaml is valid YAML`);

        // Verify no BMM references
        const yamlContent = await fs.readFile(workflowYamlPath, 'utf8');
        assert(!yamlContent.includes('_bmad/bmm/'), `${dirName} has no _bmad/bmm/ references`);
      } catch (error) {
        assert(false, `${dirName}/workflow.yaml validates`, error.message);
      }
    }

    if (await pathExists(instructionsMdPath)) {
      try {
        const instructionsContent = await fs.readFile(instructionsMdPath, 'utf8');
        assert(!instructionsContent.includes('`./steps-'), `${dirName}/instructions.md has no bare relative step references`);
        assert(
          instructionsContent.includes('`{skill-root}/steps-c/') ||
            instructionsContent.includes('`{skill-root}/steps-v/') ||
            instructionsContent.includes('`{skill-root}/steps-e/'),
          `${dirName}/instructions.md anchors step entrypoints to {skill-root}`,
        );
      } catch (error) {
        assert(false, `${dirName}/instructions.md validates`, error.message);
      }
    }

    for (const stepDir of ['steps-c', 'steps-e', 'steps-v']) {
      const stepDirPath = path.join(projectRoot, `skills/${dirName}/${stepDir}`);
      if (!(await pathExists(stepDirPath))) continue;

      const stepFiles = (await fs.readdir(stepDirPath)).filter((fileName) => fileName.endsWith('.md'));
      for (const fileName of stepFiles) {
        const stepPath = path.join(stepDirPath, fileName);
        try {
          const stepContent = await fs.readFile(stepPath, 'utf8');
          const frontmatter = extractFrontmatter(stepContent);
          const stepLabel = `${dirName}/${stepDir}/${fileName}`;

          assert(!stepContent.includes("nextStepFile: './"), `${stepLabel} has no cwd-sensitive nextStepFile`);
          if (stepContent.includes('nextStepFile:')) {
            assert(/nextStepFile: '\{skill-root\}\/steps-[cev]\//.test(stepContent), `${stepLabel} anchors nextStepFile to {skill-root}`);
          }

          assert(!stepContent.includes("validationChecklist: '../checklist.md'"), `${stepLabel} has no relative validation checklist path`);
          if (stepContent.includes('validationChecklist:')) {
            assert(
              stepContent.includes("validationChecklist: '{skill-root}/checklist.md'"),
              `${stepLabel} anchors validationChecklist to {skill-root}`,
            );
          }

          assert(!stepContent.includes("checklistFile: '../checklist.md'"), `${stepLabel} has no relative checklistFile path`);
          if (stepContent.includes('checklistFile:')) {
            assert(
              stepContent.includes("checklistFile: '{skill-root}/checklist.md'"),
              `${stepLabel} anchors checklistFile to {skill-root}`,
            );
          }

          assert(!stepContent.includes("workflowPath: '../'"), `${stepLabel} has no relative workflowPath`);
          if (stepContent.includes('workflowPath:')) {
            assert(stepContent.includes("workflowPath: '{skill-root}'"), `${stepLabel} anchors workflowPath to {skill-root}`);
          }

          if (stepDir === 'steps-v') {
            const reportPathMatch = frontmatter.match(/^(?:outputFile|validationReport):\s*['"]([^'"]+)['"]/m);
            assert(Boolean(reportPathMatch), `${stepLabel} declares a parseable validation report path`);
            const reportPathTemplate = reportPathMatch ? reportPathMatch[1] : '';
            assert(reportPathTemplate.includes('{run_timestamp}'), `${stepLabel} gives every validation run a timestamped report path`);
            assert(
              stepContent.includes('refuse to overwrite') || stepContent.includes('Never overwrite'),
              `${stepLabel} refuses to overwrite an existing validation report`,
            );
            assert(
              stepContent.includes('Atomically reserve') && stepContent.includes('exclusive-create operation'),
              `${stepLabel} claims its validation report path atomically`,
            );

            if (dirName !== 'bmad-teach-me-testing') {
              assert(
                reportPathTemplate.includes('{validation_scope}'),
                `${stepLabel} identifies the artifact scope in the validation report path`,
              );
              assert(stepContent.includes('selected artifacts'), `${stepLabel} records the selected artifacts in the validation report`);

              if (reportPathMatch) {
                const epicNineReport = reportPathTemplate
                  .replace('{validation_scope}', 'epic-9')
                  .replace('{run_timestamp}', '20260824T120000000Z');
                const epicTenReport = reportPathTemplate
                  .replace('{validation_scope}', 'epic-10')
                  .replace('{run_timestamp}', '20260824T120000000Z');
                const epicNineRerun = reportPathTemplate
                  .replace('{validation_scope}', 'epic-9')
                  .replace('{run_timestamp}', '20260824T120001000Z');

                assert(epicNineReport !== epicTenReport, `${stepLabel} keeps parallel epic validation reports separate`);
                assert(epicNineReport !== epicNineRerun, `${stepLabel} keeps repeated validation reports in run history`);
              }
            }
          }

          if (frontmatter.includes('knowledgeIndex:')) {
            const knowledgeIndexMatch = frontmatter.match(/^knowledgeIndex:\s*['"]([^'"]+)['"]/m);
            assert(Boolean(knowledgeIndexMatch), `${stepLabel} declares a parseable knowledgeIndex`);

            const knowledgeIndexReference = knowledgeIndexMatch ? knowledgeIndexMatch[1] : '';
            assert(
              knowledgeIndexReference === '{tea-knowledge}/tea-index.csv',
              `${stepLabel} uses the shared knowledge index`,
              `found ${knowledgeIndexReference}`,
            );
            // {tea-knowledge} is {skill-root}/../bmod-tea/knowledge: the bmod-tea skill installed beside this one.
            const knowledgeIndexPath = path.join(workflowDir, '..', 'bmod-tea', 'knowledge', 'tea-index.csv');
            assert(await pathExists(knowledgeIndexPath), `${stepLabel} knowledgeIndex target exists`);

            if (!workflowKnowledgeIndexValidated && (await pathExists(knowledgeIndexPath))) {
              const records = parse(await fs.readFile(knowledgeIndexPath, 'utf8'), { columns: true, skip_empty_lines: true });
              const sharedKnowledgeDir = path.dirname(knowledgeIndexPath);
              const sharedKnowledgeFiles = (await fs.readdir(sharedKnowledgeDir)).filter((name) => name.endsWith('.md'));
              const missingFragments = [];

              for (const record of records) {
                if (!record.fragment_file) {
                  missingFragments.push(`${record.id || '<missing-id>'}: missing fragment_file`);
                  continue;
                }

                const fragmentPath = path.resolve(sharedKnowledgeDir, record.fragment_file);
                if (!(await pathExists(fragmentPath))) {
                  missingFragments.push(record.fragment_file);
                }
              }

              assert(
                records.length === sharedKnowledgeFiles.length,
                'bmod-tea/knowledge/tea-index.csv line count matches the shared fragments',
                `Found ${records.length} records for ${sharedKnowledgeFiles.length} fragments`,
              );
              assert(missingFragments.length === 0, 'bmod-tea/knowledge/tea-index.csv fragment files exist', missingFragments.join(', '));

              workflowKnowledgeIndexValidated = true;
            }
          }
        } catch (error) {
          assert(false, `${dirName}/${stepDir}/${fileName} validates`, error.message);
        }
      }
    }
  }

  const frameworkScaffoldStepPath = path.join(projectRoot, 'skills/bmad-testarch-framework/steps-c/step-03-scaffold-framework.md');
  try {
    const frameworkScaffoldStep = await fs.readFile(frameworkScaffoldStepPath, 'utf8');
    assert(frameworkScaffoldStep.includes('recurse.md'), 'framework scaffold step loads recurse.md when Playwright Utils is enabled');
    assert(frameworkScaffoldStep.includes('log.md'), 'framework scaffold step loads log.md when Playwright Utils is enabled');
    assert(
      frameworkScaffoldStep.includes('intercept-network-call.md'),
      'framework scaffold step conditionally loads intercept-network-call.md',
    );
  } catch (error) {
    assert(false, 'framework scaffold fragment list validates', error.message);
  }

  console.log('');

  // ============================================================
  // Test Suite 5: Lean Skill Shape
  // ============================================================
  console.log(`${colors.yellow}Test Suite 5: Lean Skill Shape${colors.reset}\n`);

  const LEAN_SKILL_DIRS = ['bmad-testarch-evaluate'];
  const LEAN_REQUIRED = ['SKILL.md', 'customize.toml', 'references', 'assets'];
  const LEAN_FORBIDDEN = ['workflow.yaml', 'steps-c', 'steps-e', 'steps-v', 'instructions.md', 'checklist.md', 'scripts'];

  // A skill is lean when it has neither workflow.yaml nor steps-c/. Both
  // conditions matter: bmad-teach-me-testing has no workflow.yaml and would
  // misclassify as lean under a "no workflow.yaml" rule alone, but it does
  // carry steps-c/ and stays on the house set.
  async function isLeanSkill(workflowDir) {
    if (!(await pathExists(workflowDir))) return false;
    const hasWorkflowYaml = await pathExists(path.join(workflowDir, 'workflow.yaml'));
    const hasStepsC = await pathExists(path.join(workflowDir, 'steps-c'));
    return !hasWorkflowYaml && !hasStepsC;
  }

  try {
    const teachMeDir = path.join(projectRoot, 'skills/bmad-teach-me-testing');
    assert(!(await isLeanSkill(teachMeDir)), 'bmad-teach-me-testing (no workflow.yaml, has steps-c/) classifies as house');

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tea-lean-shape-'));
    try {
      const tempLean = path.join(tempRoot, 'temp-lean');
      await fs.mkdir(tempLean, { recursive: true });
      assert(await isLeanSkill(tempLean), 'a temp skill with neither workflow.yaml nor steps-c/ classifies as lean');

      const tempHouseStepsC = path.join(tempRoot, 'temp-house-steps-c');
      await fs.mkdir(path.join(tempHouseStepsC, 'steps-c'), { recursive: true });
      assert(!(await isLeanSkill(tempHouseStepsC)), 'a temp skill with steps-c/ and no workflow.yaml classifies as house');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  } catch (error) {
    assert(false, 'lean-shape discriminator validates', error.message);
  }

  // The discriminator has to decide set membership itself, not just prove
  // correct in isolation: every workflow directory under skills/ (all but the
  // bmad-tea agent and the bmod-* module records) is classified and checked against the two expected lists, so a new skill
  // directory nobody added to either list shows up as a mismatch here
  // instead of silently getting no shape assertions at all.
  try {
    const testarchRoot = path.join(projectRoot, 'skills');
    const allSkillDirs = (await fs.readdir(testarchRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name !== 'bmad-tea' && !entry.name.startsWith('bmod-'))
      .map((entry) => entry.name);
    const computedLean = [];
    const computedHouse = [];
    for (const name of allSkillDirs) {
      if (await isLeanSkill(path.join(testarchRoot, name))) computedLean.push(name);
      else computedHouse.push(name);
    }
    assert(
      computedLean.sort().join(',') === [...LEAN_SKILL_DIRS].sort().join(','),
      `lean classification of skills/* equals LEAN_SKILL_DIRS (got: ${computedLean.sort().join(', ')})`,
    );
    assert(
      computedHouse.sort().join(',') === [...workflowDirs].sort().join(','),
      `house classification of skills/* equals the house workflowDirs list (got: ${computedHouse.sort().join(', ')})`,
    );
  } catch (error) {
    assert(false, 'every skills/* directory lands on exactly one expected set', error.message);
  }

  for (const dirName of LEAN_SKILL_DIRS) {
    const workflowDir = path.join(projectRoot, `skills/${dirName}`);
    try {
      assert(await isLeanSkill(workflowDir), `${dirName} classifies as lean`);
      for (const required of LEAN_REQUIRED) {
        assert(await pathExists(path.join(workflowDir, required)), `${dirName}/${required} exists`);
      }
      for (const forbidden of LEAN_FORBIDDEN) {
        assert(!(await pathExists(path.join(workflowDir, forbidden))), `${dirName} has no ${forbidden}`);
      }

      const skillContent = await fs.readFile(path.join(workflowDir, 'SKILL.md'), 'utf8');
      assert(
        skillContent.includes('resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow'),
        `${dirName}/SKILL.md resolves the workflow customization block`,
      );
      assert(skillContent.includes('{workflow.persistent_facts}'), `${dirName}/SKILL.md loads persistent facts`);
      assert(
        skillContent.includes('resolve_config.py --project-root {project-root} --key core --key modules.tea') &&
          skillContent.includes('bmad setup tea'),
        `${dirName}/SKILL.md loads TEA config through resolve_config.py and points at bmad setup tea`,
      );

      const customizeContent = await fs.readFile(path.join(workflowDir, 'customize.toml'), 'utf8');
      assert(/^\s*persistent_facts\s*=\s*\[\s*\]/m.test(customizeContent), `${dirName}/customize.toml ships persistent_facts empty`);
      assert(customizeContent.includes('on_complete'), `${dirName}/customize.toml defines on_complete`);
    } catch (error) {
      assert(false, `${dirName} lean shape validates`, error.message);
    }

    try {
      const marketplaceContent = await fs.readFile(path.join(projectRoot, '.claude-plugin/marketplace.json'), 'utf8');
      assert(marketplaceContent.includes(`./skills/${dirName}`), `.claude-plugin/marketplace.json lists ${dirName}`);
    } catch (error) {
      assert(false, `${dirName} marketplace registration validates`, error.message);
    }
  }

  // Nothing else in test/ or tools/ reads the module help, so the evaluate
  // entry needs its own assertion; without one, deleting it still leaves
  // npm test green.
  try {
    const helpContent = await fs.readFile(path.join(projectRoot, 'skills/bmod-tea/help/help.md'), 'utf8');
    assert(helpContent.includes('`bmad-testarch-evaluate`:'), 'skills/bmod-tea/help/help.md describes bmad-testarch-evaluate');
    assert(
      helpContent.includes('evaluations_folder') && helpContent.includes('`evals/`'),
      'skills/bmod-tea/help/help.md says where evaluate writes (evals/ by default, evaluations_folder to change it)',
    );
  } catch (error) {
    assert(false, 'skills/bmod-tea/help/help.md bmad-testarch-evaluate entry validates', error.message);
  }

  // A bmad-workflow-builder session writes .memlog.md and .analysis/ inside
  // the skill directory it is working on; neither belongs in a published
  // package. `package.json`'s `files` array lists `skills` as a directory entry,
  // and npm includes everything under a directory entry regardless of
  // `.gitignore` or `.npmignore` (verified live: both left these artifacts
  // packed), so the exclusion has to be a negated pattern in `files` itself.
  // Planting real fixture files here, rather than only asserting the
  // already-clean state, is what actually exercises that exclusion.
  {
    // A real bmad-workflow-builder session could be mid-run against this same
    // skill directory (its own memlog and analysis reports live here by
    // design), so this only creates what does not already exist and only
    // removes what it created.
    const plantedMemlog = path.join(projectRoot, 'skills/bmad-testarch-evaluate/.memlog.md');
    const plantedAnalysisDir = path.join(projectRoot, 'skills/bmad-testarch-evaluate/.analysis');
    const plantedReport = path.join(plantedAnalysisDir, `tea-pack-probe-${process.pid}.md`);
    const memlogPreexisted = await pathExists(plantedMemlog);
    const analysisDirPreexisted = await pathExists(plantedAnalysisDir);
    try {
      if (!memlogPreexisted) await fs.writeFile(plantedMemlog, '# session memory\n', { flag: 'wx' });
      await fs.mkdir(plantedAnalysisDir, { recursive: true });
      await fs.writeFile(plantedReport, '# analysis\n', { flag: 'wx' });

      const packOutput = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: projectRoot, encoding: 'utf8' });
      const packedPaths = readPackedPaths(packOutput);
      assert(!packedPaths.some((filePath) => filePath.endsWith('.memlog.md')), 'npm pack excludes a planted .memlog.md builder artifact');
      assert(!packedPaths.some((filePath) => filePath.includes('/.analysis/')), 'npm pack excludes a planted .analysis/ builder artifact');

      const isGitIgnored = (targetPath) => {
        try {
          execFileSync('git', ['check-ignore', '-q', targetPath], { cwd: projectRoot });
          return true;
        } catch {
          return false;
        }
      };
      assert(isGitIgnored(plantedMemlog), 'a planted .memlog.md is gitignored');
      assert(isGitIgnored(plantedAnalysisDir), 'a planted .analysis/ is gitignored');
    } catch (error) {
      assert(false, 'npm pack --dry-run excludes builder artifacts', error.message);
    } finally {
      await fs.rm(plantedReport, { force: true });
      if (!memlogPreexisted) await fs.rm(plantedMemlog, { force: true });
      if (!analysisDirPreexisted) await fs.rm(plantedAnalysisDir, { recursive: true, force: true });
    }
  }

  console.log('');

  // ============================================================
  // The listing reads both shapes `npm pack --json` prints: an array of one entry per package (npm 11 and
  // earlier) and one object keyed by the package name (npm 12), which the Publish workflow installs.
  {
    const entry = { files: [{ path: 'LICENSE' }, { path: 'src/a.md' }] };
    const expected = JSON.stringify(['LICENSE', 'src/a.md']);
    assert(JSON.stringify(readPackedPaths(JSON.stringify([entry]))) === expected, 'the pack listing reads the array shape');
    assert(
      JSON.stringify(readPackedPaths(JSON.stringify({ 'some-package': entry }))) === expected,
      'the pack listing reads the object shape',
    );
    let refused = null;
    try {
      readPackedPaths(JSON.stringify({ 'some-package': { id: 'x' } }));
    } catch (error) {
      refused = error;
    }
    assert(refused !== null, 'the pack listing refuses an entry with no files array');
  }

  // Test Suite 6: Scoped Output Layout
  // ============================================================
  console.log(`${colors.yellow}Test Suite 6: Scoped Output Layout${colors.reset}\n`);

  // Issue #228: every per-scope workflow wrote one fixed file per project, so a
  // trace for epic 16 appended to epic 15's matrix and replaced its gate decision.
  // That every declared output sits in its workflow's own folder is settled for
  // all eight workflows by OUTPUTS_IN_WORKFLOW_FOLDERS in
  // test/lib/doc-claim-sources.js, behind the configuration.md sentence it backs.
  // This suite holds the other half on the workflows that write one file per
  // scope: each create step names the scope in its file name, and the resume step
  // finds this workflow's files in the folder and the pre-folder file at its old
  // flat path, so an interrupted run from before the change can still be migrated.
  const SCOPED_WORKFLOWS = {
    trace: { tokens: ['{run_key}'], legacy: 'traceability-matrix.md' },
    nfr: { tokens: ['{run_key}'], legacy: 'nfr-assessment.md' },
    automate: { tokens: ['{run_key}'], legacy: 'automation-summary.md' },
    'test-review': { tokens: ['{run_key}'], legacy: 'test-review.md' },
    // One checklist per story, so the story key is the whole scope.
    atdd: { tokens: ['{story_key}'], legacy: 'atdd-checklist-{story_key}.md' },
    // Steps 1 to 4 write the checkpoint, named by run_key. Step 5 writes the epic
    // plan, named by the epic_num step 1 resolved together with the checkpoint's
    // epic-{epic_num} key, and keeps the checkpoint as its progressFile.
    'test-design': { tokens: ['{run_key}', '{epic_num}'], legacy: 'test-design-progress.md' },
  };
  // The two workflows whose checkpoint exists once per project keep a plain name.
  const ONCE_PER_PROJECT_CHECKPOINTS = { ci: 'ci-pipeline-progress.md', framework: 'framework-setup-progress.md' };
  // Deliverables test-design declares that exist once per project.
  const ONCE_PER_PROJECT_DELIVERABLES = new Set(['test-design-architecture.md', 'test-design-qa.md', '{project_name}-handoff.md']);

  async function stepFrontmatter(workflow, stepsDir, fileName) {
    const text = await fs.readFile(path.join(projectRoot, 'skills', `bmad-testarch-${workflow}`, stepsDir, fileName), 'utf8');
    return yaml.load(extractFrontmatter(text)) ?? {};
  }

  for (const [workflow, { tokens, legacy }] of Object.entries(SCOPED_WORKFLOWS)) {
    const folder = `{test_artifacts}/${workflow}/`;
    const carriesScope = (value) => typeof value === 'string' && value.startsWith(folder) && tokens.some((token) => value.includes(token));
    try {
      const stepsCDir = path.join(projectRoot, 'skills', `bmad-testarch-${workflow}`, 'steps-c');
      const stepFiles = (await fs.readdir(stepsCDir)).filter((name) => name.endsWith('.md')).sort();
      let outputSteps = 0;
      for (const fileName of stepFiles) {
        const frontmatter = await stepFrontmatter(workflow, 'steps-c', fileName);
        for (const key of ['outputFile', 'progressFile']) {
          const value = frontmatter[key];
          if (typeof value !== 'string' || !value.startsWith('{test_artifacts}/')) continue;
          if (key === 'outputFile') outputSteps += 1;
          assert(
            carriesScope(value),
            `${workflow}/steps-c/${fileName} ${key} sits in ${folder} and carries ${tokens.join(' or ')}`,
            `found ${value}`,
          );
        }
        // A progress checkpoint is always the run_key one, even beside test-design's epic plan.
        if (typeof frontmatter.progressFile === 'string' && workflow === 'test-design') {
          assert(
            frontmatter.progressFile.includes('{run_key}'),
            `${workflow}/steps-c/${fileName} progressFile carries {run_key}`,
            `found ${frontmatter.progressFile}`,
          );
        }
      }
      assert(outputSteps > 0, `${workflow} declares at least one create-mode outputFile under {test_artifacts}`);

      const workflowYaml = yaml.load(
        await fs.readFile(path.join(projectRoot, 'skills', `bmad-testarch-${workflow}`, 'workflow.yaml'), 'utf8'),
      );
      const deliverables = [
        ...Object.entries(workflowYaml)
          .filter(([key, value]) => (key === 'default_output_file' || key.endsWith('_output')) && typeof value === 'string')
          .map(([key, value]) => ({ key, value })),
        ...(Array.isArray(workflowYaml.outputs) ? workflowYaml.outputs : []).map((output) => ({
          key: `outputs.${output.id}`,
          value: output.path,
        })),
      ].filter(({ value }) => typeof value === 'string' && value.startsWith('{test_artifacts}/'));
      assert(deliverables.length > 0, `${workflow}/workflow.yaml declares at least one deliverable under {test_artifacts}`);
      for (const { key, value } of deliverables) {
        if (ONCE_PER_PROJECT_DELIVERABLES.has(value.split('/').pop())) continue;
        assert(
          carriesScope(value),
          `${workflow}/workflow.yaml ${key} sits in ${folder} and carries ${tokens.join(' or ')}`,
          `found ${value}`,
        );
      }

      const resume = await stepFrontmatter(workflow, 'steps-c', 'step-01b-resume.md');
      assert(
        typeof resume.progressGlob === 'string' && resume.progressGlob.startsWith(folder) && resume.progressGlob.includes('*'),
        `${workflow}/steps-c/step-01b-resume.md declares a progressGlob under ${folder}`,
        `found ${resume.progressGlob}`,
      );
      assert(
        resume.legacyOutputFile === `{test_artifacts}/${legacy}`,
        `${workflow}/steps-c/step-01b-resume.md declares the pre-folder file {test_artifacts}/${legacy} as legacyOutputFile`,
        `found ${resume.legacyOutputFile}`,
      );
      assert(
        carriesScope(resume.outputFile),
        `${workflow}/steps-c/step-01b-resume.md resumes into a scoped file under ${folder}`,
        `found ${resume.outputFile}`,
      );
    } catch (error) {
      assert(false, `${workflow} scoped output layout validates`, error.message);
    }
  }

  for (const [workflow, name] of Object.entries(ONCE_PER_PROJECT_CHECKPOINTS)) {
    try {
      const resume = await stepFrontmatter(workflow, 'steps-c', 'step-01b-resume.md');
      assert(
        resume.outputFile === `{test_artifacts}/${workflow}/${name}`,
        `${workflow}/steps-c/step-01b-resume.md resumes {test_artifacts}/${workflow}/${name}`,
        `found ${resume.outputFile}`,
      );
      assert(
        resume.legacyOutputFile === `{test_artifacts}/${name}`,
        `${workflow}/steps-c/step-01b-resume.md declares the pre-folder file {test_artifacts}/${name} as legacyOutputFile`,
        `found ${resume.legacyOutputFile}`,
      );
    } catch (error) {
      assert(false, `${workflow} checkpoint layout validates`, error.message);
    }
  }

  console.log('');

  // ============================================================
  // Summary
  // ============================================================
  console.log(`${colors.cyan}========================================`);
  console.log('Test Results:');
  console.log(`  Passed: ${colors.green}${passed}${colors.reset}`);
  console.log(`  Failed: ${colors.red}${failed}${colors.reset}`);
  console.log(`========================================${colors.reset}\n`);

  if (failed === 0) {
    console.log(`${colors.green}✨ All installation component tests passed!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.red}❌ Some installation component tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error(`${colors.red}Test runner failed:${colors.reset}`, error.message);
  console.error(error.stack);
  process.exit(1);
});
