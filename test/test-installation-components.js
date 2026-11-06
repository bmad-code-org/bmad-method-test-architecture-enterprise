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

/** CI preflight must inventory inputs and save its contract before project-changing commands. */
function ciPreflightOrderProblems(content) {
  const problems = [];
  const headings = [...content.matchAll(/^## (.+)$/gm)];
  const sections = Object.fromEntries(
    headings.map((heading, index) => [
      heading[1],
      { position: heading.index, body: content.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? content.length) },
    ]),
  );
  const inventory = sections['3. Verify Test Framework'];
  const commands = sections['4. Ensure Tests Pass Locally'];
  const contract = sections['6c. Freeze the Existing-Framework Contract and Execute Tests'];
  if (!inventory || !commands || !contract) return ['missing inventory, command-discovery, or contract section'];
  if (!(inventory.position < commands.position && commands.position < contract.position)) problems.push('contract stages reordered');
  if (!inventory.body.includes('Inspect installed test dependencies read-only')) problems.push('inventory permits dependency writes');
  if (!commands.body.includes('Hold dependency installation and test execution until section 6c freezes and journals'))
    problems.push('command discovery permits early execution');
  for (const section of [inventory, commands]) {
    if (/\b(?:install (?:its|any|the|declared) .*dependencies|(?:Run|Execute) [^\n.]*test commands now|runs install)\b/.test(section.body))
      problems.push('dependency installation or local tests precede the frozen contract');
  }
  const journal = contract.body.indexOf('construct and atomically journal the complete immutable contract');
  const install = contract.body.indexOf('runs install any missing declared dependencies');
  const execute = contract.body.indexOf('execute its actual local test commands');
  if (!(journal !== -1 && journal < install && install < execute)) problems.push('installation or tests precede contract journaling');
  if (!contract.body.includes('After the complete contract is successfully journaled'))
    problems.push('execution lacks journal-success gate');
  return problems;
}

/** Archived Create recovery needs immutable checkpoint evidence before fixed-path replacement. */
function setupArchiveProblems(content) {
  const problems = [];
  const archive = content.split('## 1a. Preserve Create Checkpoints with Archived Journals\n')[1]?.split('\n## 2.')[0];
  if (!archive) return ['missing checkpoint archival protocol'];
  for (const required of [
    'exclusively create immutable copies of its referenced same-run phase checkpoints',
    'setup-run-progress-{archive_id}.checkpoints/',
    'setup-run-progress-{archive_id}.checkpoints.json',
    'original path, snapshot path, SHA-256 digest and original modification timestamp',
    'verify bytes, digests, ownership and paths before replacing the active journal or any Create checkpoint',
    'Edit/Validate Resume restores its journal only and leaves Create checkpoints unchanged',
    'an uncertain or still-writing worker halts archival and replacement',
    "Record justified pending-phase absences explicitly with the phase's original fixed Create path",
    "first preserve any displaced checkpoint's own run through this archive protocol, then remove only that recorded fixed Create destination",
    'A missing or foreign checkpoint for a phase that has saved its own Create progress halts archival unless an existing verified snapshot preserves its same-run bytes',
    "exclude any foreign legacy checkpoint from this phase's preflight/Resume selection and preserve its history",
    'The restored selected legacy checkpoint is authoritative even in headless mode',
    "Execute only its owning loader's migration portion once before activation, journal adoption or next-step dispatch",
    'verify its unchanged bytes at the modern path and adopt that modern `phase_checkpoints` reference',
  ]) {
    if (!archive.toLowerCase().includes(required.toLowerCase())) problems.push(`missing archive safeguard: ${required}`);
  }
  const resume = archive.indexOf('On Resume of an archived Create run');
  const verify = archive.indexOf('first verify its journal digest and every required snapshot', resume);
  const displace = archive.indexOf('Archive any displaced active run through this same protocol', resume);
  const restore = archive.indexOf('Atomically restore selected snapshot bytes', resume);
  const reread = archive.indexOf(
    'Re-read and verify all restored digests and recorded absences before adopting the selected journal or dispatching Resume',
    resume,
  );
  if (!(resume !== -1 && verify > resume && displace > verify && restore > displace && reread > restore))
    problems.push('archived Resume must verify snapshots and preserve displaced runs before restoring and dispatching');
  if (!content.includes("Before Create replaces a different run's checkpoint, the coordinator verifies that run's immutable archive"))
    problems.push('Create may overwrite a checkpoint before its immutable archive is verified');
  return problems;
}

function setupCompletionProblems(content) {
  const problems = [];
  const create = content.indexOf('### Create');
  const validate = content.indexOf('### Validate');
  const edit = content.indexOf('### Edit');
  if (!(create !== -1 && create < validate && validate < edit)) return ['missing operation-specific completion sections'];
  for (const command of content.matchAll(
    /Run the actual test commands from the frozen contract|Record failures and repair within the authorized setup scope/g,
  )) {
    if (!(command.index > create && command.index < validate))
      problems.push('Create execution or repair gate applies to another operation');
  }
  const validation = String(content.slice(validate, edit));
  if (
    !validation.includes('Never repair outputs, install missing dependencies, or change tests during Validate') ||
    !validation.includes('Complete the owned reserved report even when criteria fail')
  )
    problems.push('Validate repairs or blocks its failed report');
  const editing = String(content.slice(edit, content.indexOf('## 2.')));
  if (
    !editing.includes('Re-check only the changed outputs and their direct dependencies') ||
    !editing.includes('Missing unrelated execution prerequisites do not block completion of a valid pipeline edit')
  )
    problems.push('Edit requires unrelated full-suite execution');
  return problems;
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
    const directSkills = [
      'bmad-tea-automate',
      'bmad-tea-evaluate',
      'bmad-tea-framework',
      'bmad-tea-nfr',
      'bmad-tea-teach-me-testing',
      'bmad-tea-test-design',
      'bmad-tea-test-review',
      'bmad-tea-trace',
    ];
    assert(
      JSON.stringify([...bmod.skills].sort()) === JSON.stringify(['bmad-tea', ...directSkills].sort()),
      'bmod.toml publishes exactly the bmad-tea agent and eight renamed workflows',
    );
    const skillDirectories = await fs.readdir(path.join(projectRoot, 'skills'));
    assert(
      skillDirectories.every((name) => !name.startsWith('bmad-testarch-') && name !== 'bmad-teach-me-testing'),
      'the installed skill tree has no old public workflow roots',
    );
    for (const [name, legacyNames] of [
      ['bmad-tea-automate', ['bmad-testarch-automate', 'bmad-testarch-atdd', 'bmad-tea-atdd']],
      ['bmad-tea-evaluate', ['bmad-testarch-evaluate']],
      ['bmad-tea-framework', ['bmad-testarch-framework', 'bmad-testarch-ci', 'bmad-tea-ci']],
      ['bmad-tea-nfr', ['bmad-testarch-nfr']],
      ['bmad-tea-teach-me-testing', ['bmad-teach-me-testing']],
      ['bmad-tea-test-design', ['bmad-testarch-test-design']],
      ['bmad-tea-test-review', ['bmad-testarch-test-review']],
      ['bmad-tea-trace', ['bmad-testarch-trace']],
    ]) {
      const skillText = await fs.readFile(path.join(projectRoot, 'skills', name, 'SKILL.md'), 'utf8');
      const guard = skillText.split('## On Activation\n')[1]?.split('### Step 1:')[0] ?? '';
      assert(
        guard.includes('tea-migrate-customizations') &&
          guard.includes('{project-root}/_bmad/custom/') &&
          legacyNames.every((legacyName) => guard.includes(`${legacyName}.toml`) && guard.includes(`${legacyName}.user.toml`)),
        `${name} blocks activation while legacy customization files remain`,
      );
    }
    const retired = TOML.parse(await fs.readFile(path.join(projectRoot, 'skills/bmod-tea/retired.toml'), 'utf8'));
    const retiredNames = [...retired.renamed.map((entry) => entry.from), ...retired.removed];
    const expectedRenames = [
      ['bmad-testarch-automate', 'bmad-tea-automate'],
      ['bmad-testarch-evaluate', 'bmad-tea-evaluate'],
      ['bmad-testarch-framework', 'bmad-tea-framework'],
      ['bmad-testarch-nfr', 'bmad-tea-nfr'],
      ['bmad-testarch-test-design', 'bmad-tea-test-design'],
      ['bmad-testarch-test-review', 'bmad-tea-test-review'],
      ['bmad-testarch-trace', 'bmad-tea-trace'],
      ['bmad-teach-me-testing', 'bmad-tea-teach-me-testing'],
    ].map(([from, to]) => ({ from, to }));
    assert(
      JSON.stringify(retired.renamed) === JSON.stringify(expectedRenames) &&
        JSON.stringify(retired.removed) === JSON.stringify(['bmad-testarch-atdd', 'bmad-testarch-ci']),
      'retired.toml maps each old workflow to its bmad-tea-* skill exactly and removes atdd and ci',
    );
    assert(
      retiredNames.every((name) => !bmod.skills.includes(name)),
      'no retired skill name appears in the bmod.toml skills list',
    );
    assert(
      new Set(retiredNames).size === retiredNames.length &&
        (await Promise.all(retiredNames.map((name) => pathExists(path.join(projectRoot, 'skills', name))))).every((exists) => !exists),
      'a retired name is listed once and no skill folder reuses it',
    );
    const agentText = await fs.readFile(path.join(projectRoot, 'skills', 'bmad-tea', 'SKILL.md'), 'utf8');
    const agentGuard = agentText.split('## On Activation\n')[1]?.split('### Step 1:')[0] ?? '';
    assert(
      agentGuard.includes('bmad-testarch-') &&
        agentGuard.includes('bmad-teach-me-testing') &&
        agentGuard.includes('{project-root}/_bmad/custom/bmad-tea.toml') &&
        agentGuard.includes('tea-migrate-customizations'),
      'bmad-tea blocks removed menu skill IDs before dispatch',
    );
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
    const evaluateCustomize = TOML.parse(await fs.readFile(path.join(projectRoot, 'skills/bmad-tea-evaluate/customize.toml'), 'utf8'));
    assert(
      evaluateCustomize.workflow?.evaluations_folder === 'evals',
      'bmad-tea-evaluate customize.toml defaults evaluations_folder to evals',
    );
  } catch (error) {
    assert(false, 'bmad-tea-evaluate customize.toml loads', error.message);
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
      questionKeys.size === 13 && [...questionKeys].every((key) => keptQuestions.has(key)),
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

    // The CI key retains its customization filename, while Framework owns the CI phase.
    const ciCustomize = TOML.parse(await fs.readFile(path.join(projectRoot, 'skills/bmad-tea-framework/customize.toml'), 'utf8'));
    const evaluateCustomize = TOML.parse(await fs.readFile(path.join(projectRoot, 'skills/bmad-tea-evaluate/customize.toml'), 'utf8'));
    assert(
      ciCustomize.workflow?.ci?.ci_platform === 'auto' && !('ci_platform' in ciCustomize.workflow),
      'bmad-tea-framework customize.toml declares ci_platform under [workflow.ci] for the migrated CI setting',
    );
    assert(
      typeof evaluateCustomize.workflow?.evaluations_folder === 'string' &&
        migration.guide.includes('bmad-tea-evaluate.toml') &&
        migration.guide.includes('bmad-tea-framework.toml') &&
        migration.guide.includes('`[workflow]` `evaluations_folder`') &&
        migration.guide.includes('`[workflow.ci]` `ci_platform`'),
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

    // Validate customize.toml carries the agent essence and menu in the [agent] namespace.
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

      // Verify all capability codes live on the [[agent.menu]] array-of-tables
      const expectedMenu = [
        { code: 'TMT', skill: 'bmad-tea-teach-me-testing' },
        { code: 'TF', skill: 'bmad-tea-framework' },
        { code: 'CI', skill: 'bmad-tea-framework' },
        { code: 'AT', skill: 'bmad-tea-automate' },
        { code: 'TA', skill: 'bmad-tea-automate' },
        { code: 'EV', skill: 'bmad-tea-evaluate' },
        { code: 'TD', skill: 'bmad-tea-test-design' },
        { code: 'TR', skill: 'bmad-tea-trace' },
        { code: 'NR', skill: 'bmad-tea-nfr' },
        { code: 'RV', skill: 'bmad-tea-test-review' },
      ];
      const menu = TOML.parse(customizeContent).agent.menu;
      assert(Array.isArray(menu), 'customize.toml has an agent menu');
      for (const { code, skill } of expectedMenu) {
        const entries = menu.filter((entry) => entry.code === code);
        assert(entries.length === 1, `customize.toml has one [[agent.menu]] entry for code ${code}`);
        assert(entries[0]?.skill === skill, `customize.toml menu ${code} dispatches to ${skill}`);
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
    'bmad-tea-teach-me-testing',
    'bmad-tea-framework',
    'bmad-tea-test-design',
    'bmad-tea-automate',
    'bmad-tea-test-review',
    'bmad-tea-nfr',
    'bmad-tea-trace',
  ];

  const canonicalAutomateRoot = path.join(projectRoot, 'skills/bmad-tea-automate');
  const redWorkflow = yaml.load(await fs.readFile(path.join(canonicalAutomateRoot, 'red/workflow.yaml'), 'utf8'));
  assert(!('installed_path' in redWorkflow), 'red workflow declares no installed_path, which BMAD skill validation rejects (PATH-02)');
  for (const [component, expected] of Object.entries({
    instructions: 'red/instructions.md',
    validation: 'red/checklist.md',
    template: 'red/atdd-checklist-template.md',
  })) {
    assert(redWorkflow[component] === expected, `red workflow ${component} resolves from the canonical skill root`);
    assert(
      await pathExists(path.resolve(canonicalAutomateRoot, redWorkflow[component])),
      `red workflow ${component} selects an installed red asset`,
    );
  }

  for (const dirName of workflowDirs) {
    const workflowDir = path.join(projectRoot, `skills/${dirName}`);
    const skillMdPath = path.join(projectRoot, `skills/${dirName}/SKILL.md`);
    const customizeTomlPath = path.join(projectRoot, `skills/${dirName}/customize.toml`);
    const workflowYamlPath = path.join(projectRoot, `skills/${dirName}/workflow.yaml`);
    const instructionsMdPath = path.join(workflowDir, 'instructions.md');
    let workflowKnowledgeIndexValidated = false;

    if (await pathExists(skillMdPath)) {
      try {
        const skillContent = await fs.readFile(skillMdPath, 'utf8');
        assert(skillContent && skillContent.trim().length > 0, `${dirName}/SKILL.md is not empty`);
        {
          assert(skillContent.includes('## On Activation'), `${dirName}/SKILL.md has On Activation section`);
          assert(
            skillContent.includes(
              `resolve_customization.py --skill {skill-root} --project-root {project-root} --key ${dirName === 'bmad-tea-automate' ? '{workflow-key}' : 'workflow'}`,
            ),
            `${dirName}/SKILL.md resolves the selected workflow customization block`,
          );
          assert(skillContent.includes('{workflow.activation_steps_prepend}'), `${dirName}/SKILL.md executes prepend activation steps`);
          assert(skillContent.includes('{workflow.activation_steps_append}'), `${dirName}/SKILL.md executes append activation steps`);
          assert(skillContent.includes('{workflow.persistent_facts}'), `${dirName}/SKILL.md loads persistent facts`);
          assert(
            skillContent.includes('Resolve sibling workflow files such as `instructions.md`'),
            `${dirName}/SKILL.md explains sibling workflow path resolution`,
          );
          assert(
            dirName === 'bmad-tea-automate'
              ? skillContent.includes('{skill-root}/resources/test-generation-routing.md')
              : /\{skill-root\}\/steps-[cev]\//.test(skillContent),
            `${dirName}/SKILL.md routes first step from {skill-root}`,
          );
        }
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
          instructionsContent.includes('`{skill-root}/red/steps-c/') ||
            instructionsContent.includes('`{skill-root}/steps-c/') ||
            instructionsContent.includes('`{skill-root}/ci/steps-c/') ||
            instructionsContent.includes('`{skill-root}/steps-v/') ||
            instructionsContent.includes('`{skill-root}/steps-e/'),
          `${dirName}/instructions.md anchors step entrypoints to {skill-root}`,
        );
      } catch (error) {
        assert(false, `${dirName}/instructions.md validates`, error.message);
      }
    }

    for (const stepDir of ['steps-c', 'steps-e', 'steps-v']) {
      const stepDirPath = path.join(workflowDir, stepDir);
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
            assert(
              /nextStepFile: '\{skill-root\}\/(?:(?:ci|red)\/)?steps-[cev]\//.test(stepContent),
              `${stepLabel} anchors nextStepFile to {skill-root}`,
            );
          }

          assert(!stepContent.includes("validationChecklist: '../checklist.md'"), `${stepLabel} has no relative validation checklist path`);
          if (stepContent.includes('validationChecklist:')) {
            assert(
              stepContent.includes("validationChecklist: '{skill-root}/checklist.md'") ||
                stepContent.includes("validationChecklist: '{skill-root}/ci/checklist.md'") ||
                stepContent.includes("validationChecklist: '{skill-root}/red/checklist.md'"),
              `${stepLabel} anchors validationChecklist to {skill-root}`,
            );
          }

          assert(!stepContent.includes("checklistFile: '../checklist.md'"), `${stepLabel} has no relative checklistFile path`);
          if (stepContent.includes('checklistFile:')) {
            assert(
              stepContent.includes("checklistFile: '{skill-root}/checklist.md'") ||
                stepContent.includes("checklistFile: '{skill-root}/ci/checklist.md'") ||
                stepContent.includes("checklistFile: '{skill-root}/red/checklist.md'"),
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

            if (dirName !== 'bmad-tea-teach-me-testing') {
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
            const knowledgeIndexPath = path.join(projectRoot, 'skills', 'bmod-tea', 'knowledge', 'tea-index.csv');
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

  // Setup routing remains shared across all requested scopes.
  try {
    const router = await fs.readFile(path.join(projectRoot, 'skills/bmad-tea-framework/resources/setup-routing.md'), 'utf8');
    const canonical = await fs.readFile(path.join(projectRoot, 'skills/bmad-tea-framework/SKILL.md'), 'utf8');
    assert(
      canonical.includes('CI-only skips framework prepend/append hooks, persistent facts and completion hooks') &&
        canonical.indexOf('execute each `ci_workflow.activation_steps_prepend`') < canonical.indexOf('### Step 5: Greet the User') &&
        canonical.includes('CI-only loads its CI facts and skips framework facts'),
      'CI-only activation owns CI hooks/facts and executes its prepend before greeting',
    );
    const completion = await fs.readFile(path.join(projectRoot, 'skills/bmad-tea-framework/resources/setup-phase-completion.md'), 'utf8');
    assert(setupCompletionProblems(completion).length === 0, 'Create, Validate and Edit retain distinct completion gates');
    for (const heading of ['### Validate', '### Edit']) {
      assert(
        setupCompletionProblems(completion.replace(heading, heading + '\n\nRun the actual test commands from the frozen contract.'))
          .length > 0,
        `${heading.slice(4)} completion guard rejects a migrated full-suite execution gate`,
      );
    }
    assert(
      completion.includes('Only when scope includes framework, resolve canonical `workflow.on_complete`') &&
        completion.includes('CI-only completes after its CI hook'),
      'CI-only completion keeps framework customization outside its scope',
    );
    for (const mode of ['framework', 'ci', 'both']) {
      assert(router.includes('`' + mode + '`'), `shared setup router names ${mode} scope`);
    }
    assert(
      router.includes('Do you want CI too?') &&
        router.includes('ask exactly once') &&
        router.includes('Wait for the answer before any project writes'),
      'unclear CI intent asks once before activation hooks or project writes',
    );
    assert(
      router.includes('Set it up now and continue CI in this run?') &&
        router.includes('Declining stops the run and leaves the project untouched'),
      'CI without a framework offers framework-first setup before writes',
    );
    assert(
      router.includes('framework_reused = true') && router.includes('validate and reuse it'),
      'combined setup validates an existing framework',
    );
    assert(
      router.includes('route directly to CI Create preflight') &&
        router.includes('Skip framework Create preflight, the scaffold checklist and write-time hook checks'),
      'both with an existing framework follows existing test commands through CI contract discovery',
    );
    assert(
      router.includes('unattended/headless run with no scope answer defaults to `framework`'),
      'headless ambiguous requests retain framework-only setup',
    );
    assert(
      router.includes('`[workflow.ci]` tables of `_bmad/custom/bmad-tea-framework.toml`') &&
        router.includes('ci_workflow.ci_platform') &&
        !router.includes('bmad-tea-ci.toml'),
      'CI scope reads the [workflow.ci] table of the framework customization and no separate ci stem',
    );
    for (const prefix of ['', 'ci/']) {
      for (const [operation, route] of Object.entries({
        C: 'steps-c/step-01-preflight.md',
        R: 'steps-c/step-01b-resume.md',
        V: 'steps-v/step-01-validate.md',
        E: 'steps-e/step-01-assess.md',
      })) {
        assert(
          canonical.includes('**If ' + operation + ':** Load `{skill-root}/' + prefix + route + '`'),
          `canonical ${prefix || 'framework/'} scope retains ${operation} operation`,
        );
      }
    }
    assert(
      router.includes('A completed framework checkpoint with pending CI continues to CI'),
      'completed framework resume can continue pending CI',
    );
    const state = await fs.readFile(path.join(projectRoot, 'skills/bmad-tea-framework/resources/setup-state.md'), 'utf8');
    assert(
      router.includes('All scopes and operations use `{test_artifacts}/framework/setup-run-progress.md`') &&
        state.includes('create or adopt the active journal before executing any custom activation hook'),
      'single-phase and combined operations persist recovery state before activation hooks',
    );
    for (const key of [
      'framework.activation_steps_prepend.0',
      'framework.activation_steps_append.0',
      'ci.activation_steps_prepend.0',
      'ci.activation_steps_append.0',
      'ci.on_complete',
      'framework.on_complete',
    ]) {
      assert(state.includes('`' + key + '`'), `recovery ledger tracks individual ${key} hooks`);
    }
    assert(
      state.includes('If the key is in `hooks_completed`, skip execution') &&
        state.includes('If the key is in `hooks_started` and has no completed marker, halt') &&
        state.includes('Save the key and exact instruction in `hooks_started` before executing it'),
      'interrupted activation hooks stop before replay or further writes',
    );
    assert(
      state.includes('only after success') && state.includes('changed instruction or reordered hook list'),
      'hook recovery keeps successful and changed instructions distinct',
    );
    assert(
      state.includes('Completed journals are history; they do not select scope, operation, or hooks') &&
        state.includes('A newer standalone or legacy phase checkpoint belonging to a different run takes priority'),
      'completed both history cannot redirect an interrupted standalone CI run',
    );
    assert(
      state.includes('It never enters a Create resume loader') && state.includes('Resume continues the same owned report'),
      'Edit and Validate resume use their saved operation and report ownership',
    );
    assert(
      state.includes('CI recovery loads only preflight sections 2 through 6c') &&
        state.includes('This inventory performs no dependency installation, test execution, activation hooks, phase checkpoint saves') &&
        state.includes('dispatch the original next incomplete step'),
      'legacy checkpoints rebuild their missing contract read-only before continuing their saved route',
    );
    assert(
      state.includes('archive any existing active journal intact, including an unfinished journal whose scope or targets are unrelated') &&
        setupArchiveProblems(state).length === 0,
      'unrelated unfinished journals survive new operations in verified archives',
    );
    assert(
      setupArchiveProblems(
        state.replace('exclusively create immutable copies of its referenced same-run phase checkpoints', 'retain fixed checkpoint paths'),
      ).length > 0,
      'archive guard rejects journals that lose their referenced Create checkpoint bytes',
    );
    assert(
      setupArchiveProblems(
        state.replace('first verify its journal digest and every required snapshot', 'skip verification of saved checkpoint evidence'),
      ).length > 0,
      'archive guard rejects checkpoint restoration before snapshot verification',
    );
    assert(
      setupArchiveProblems(
        state.replace(
          'Archive any displaced active run through this same protocol',
          'Replace displaced active runs without preserving them',
        ),
      ).length > 0,
      'archive guard rejects restoration that destroys the displaced run',
    );
    assert(
      setupArchiveProblems(
        state.replace(
          "Before Create replaces a different run's checkpoint, the coordinator verifies that run's immutable archive",
          "Create replaces a different run's checkpoint without verifying its immutable archive",
        ),
      ).length > 0,
      'archive guard rejects fixed-path Create replacement before archive authorization',
    );
    assert(
      setupArchiveProblems(
        state.replace(
          "first preserve any displaced checkpoint's own run through this archive protocol, then remove only that recorded fixed Create destination",
          'remove any checkpoint occupying the pending phase path',
        ),
      ).length > 0,
      'archive guard rejects pending-phase absence restoration that loses a displaced checkpoint',
    );
    assert(
      setupArchiveProblems(
        state.replace(
          'The restored selected legacy checkpoint is authoritative even in headless mode',
          'A headless run selects whichever modern checkpoint is present',
        ),
      ).length > 0,
      'archive guard rejects resumed legacy history replaced by a foreign modern checkpoint',
    );
    for (const scope of ['', 'ci/']) {
      const resume = await fs.readFile(path.join(projectRoot, `skills/bmad-tea-framework/${scope}steps-c/step-01b-resume.md`), 'utf8');
      assert(
        resume.includes('first archive any displaced modern counterpart') &&
          resume.includes('Select that restored legacy checkpoint deterministically, including in headless mode') &&
          resume.includes('execute items 2 and 3 below once before activation, journal adoption or saved next-step dispatch') &&
          resume.includes('A saved pending-phase absence cannot consume any foreign checkpoint through either lookup path'),
        `${scope || 'framework/'} Resume preserves selected archived legacy history through its migration`,
      );
    }
    assert(
      state.includes('A headless or autonomous new request starts over and archives the prior history') &&
        state.includes('an explicit Resume keeps its recovered run'),
      'headless start-over preserves explicitly requested Resume',
    );
    const parallel = await fs.readFile(path.join(projectRoot, 'skills/bmad-tea-framework/resources/setup-parallel.md'), 'utf8');
    assert(
      parallel.includes('Before launch, atomically persist `setup_parallel_started = true`') &&
        parallel.includes('relaunch each incomplete worker at its exact saved position') &&
        parallel.includes('a generated CI phase waits for the framework and never restarts at CI preflight'),
      'parallel Resume retains generated work and finishes framework readiness before CI terminal validation',
    );
    assert(
      parallel.includes('journal `pipeline_action` and exact selected `pipeline_target` with the chosen platform before worker launch') &&
        parallel.includes('CI workers consume that decision and ask no questions'),
      'coordinator settles effective platform and pipeline update/replace before CI workers start',
    );
    const ciDefaults = TOML.parse(await fs.readFile(path.join(projectRoot, 'skills/bmad-tea-framework/customize.toml'), 'utf8'));
    assert(
      !(await pathExists(path.join(projectRoot, 'skills/bmad-tea-framework/ci/customize.toml'))) &&
        router.includes('carries the CI defaults under `[workflow.ci]`') &&
        router.includes('No other file supplies CI settings') &&
        ciDefaults.workflow.ci.ci_platform === 'auto' &&
        ['activation_steps_prepend', 'activation_steps_append', 'persistent_facts'].every(
          (key) => Array.isArray(ciDefaults.workflow.ci[key]) && ciDefaults.workflow.ci[key].length === 0,
        ) &&
        ciDefaults.workflow.ci.on_complete === '',
      'canonical CI owns its defaults as the [workflow.ci] table of the framework customize.toml',
    );
    assert(
      router.includes(
        'For CI-only and both Create with a reused framework, build this contract from the existing framework scripts/configs and service documentation',
      ) && router.includes('an empty contract cannot proceed to generation'),
      'CI-only generation and validation use the existing framework contract',
    );
    const ciPreflight = await fs.readFile(path.join(projectRoot, 'skills/bmad-tea-framework/ci/steps-c/step-01-preflight.md'), 'utf8');
    const ciGeneration = await fs.readFile(
      path.join(projectRoot, 'skills/bmad-tea-framework/ci/steps-c/step-02-generate-pipeline.md'),
      'utf8',
    );
    assert(
      ciPreflight.includes(
        'passing Jest/Vitest/Node built-in suite satisfies this existing-framework prerequisite without Playwright/Cypress',
      ) &&
        ciGeneration.includes(
          'Jest/Vitest/Node built-in unit/component/API suite uses its actual commands and artifacts with no browser installation',
        ),
      'frontend applications retain existing unit/component frameworks without adding a browser prerequisite',
    );
    assert(
      ciPreflight.includes('exact project-relative `pipeline_target` in the journal/contract') &&
        ciGeneration.includes('Consume the frozen `pipeline_action` and `pipeline_target` before selecting output') &&
        ciGeneration.includes('Preserve unrelated jobs, triggers, permissions, concurrency') &&
        ciGeneration.includes('An implicit default update never authorizes replacement'),
      'pipeline generation consumes the coordinator target and preserves unrelated behavior during updates',
    );
    assert(
      !ciPreflight.includes('Set it up now and continue CI in this run?'),
      'CI preflight keeps the missing-framework offer owned by the read-only router',
    );
    assert(
      ciPreflightOrderProblems(ciPreflight).length === 0,
      'CI inventories dependencies and freezes its contract before installation or tests',
    );
    assert(
      ciPreflightOrderProblems(
        ciPreflight.replace(
          'Inspect installed test dependencies read-only',
          'install its declared test dependencies now.\n- Inspect installed test dependencies read-only',
        ),
      ).length > 0,
      'CI instruction-order guard rejects dependency installation during inventory',
    );
    assert(
      ciPreflightOrderProblems(
        ciPreflight.replace(
          '## 4. Ensure Tests Pass Locally',
          "Run the project's local test commands now.\n\n## 4. Ensure Tests Pass Locally",
        ),
      ).length > 0,
      'CI instruction-order guard rejects tests before command discovery and contract journaling',
    );
    const prematureInstall = 'runs install any missing declared dependencies and execute its actual local test commands. ';
    assert(
      ciPreflightOrderProblems(
        ciPreflight.replace(
          '## 6c. Freeze the Existing-Framework Contract and Execute Tests',
          '## 6c. Freeze the Existing-Framework Contract and Execute Tests\n\n' + prematureInstall,
        ),
      ).length > 0,
      'CI instruction-order guard rejects installation and tests ahead of contract journaling in the contract section',
    );
    const savedExample = yaml.load(
      extractFrontmatter(
        await fs.readFile(path.join(projectRoot, 'skills/bmad-tea-framework/resources/setup-run-progress.example.md'), 'utf8'),
      ),
    );
    assert(
      savedExample.setup_scope === 'both' &&
        savedExample.setup_operation === 'create' &&
        savedExample.phase_status.framework === 'completed' &&
        savedExample.phase_status.ci === 'pending',
      'resume example records a completed framework with pending CI Create',
    );
    assert(
      savedExample.phase_checkpoints.framework === '{test_artifacts}/framework/framework-setup-progress.md' &&
        savedExample.phase_checkpoints.ci === '{test_artifacts}/ci/ci-pipeline-progress.md',
      'resume example retains both legacy phase checkpoint paths',
    );
    assert(
      typeof savedExample.run_id === 'string' &&
        savedExample.phase_position.framework === 'phase-handoff' &&
        savedExample.phase_position.ci.file === '{skill-root}/ci/steps-c/step-01-preflight.md',
      'recovery example dispatches pending CI directly under its saved run identity',
    );
    assert(
      savedExample.setup_parallel_started === true &&
        savedExample.parallel_workers.framework.status === 'completed' &&
        savedExample.parallel_workers.ci.status === 'pending' &&
        savedExample.parallel_workers.ci.position.file === '{skill-root}/ci/steps-c/step-01-preflight.md' &&
        Object.values(savedExample.parallel_workers).every((worker) => worker.run_id === savedExample.run_id),
      'resume example persists each worker status and position under one run identity',
    );
    for (const field of ['phase_targets', 'validation_reports', 'edit_requests', 'edit_applied', 'hook_instructions']) {
      assert(savedExample[field] !== null && typeof savedExample[field] === 'object', `recovery example persists ${field}`);
    }
    assert(
      savedExample.contract.ci_platform === 'github-actions' && savedExample.contract.test_commands.length > 0,
      'resume example retains the agreed framework commands and CI platform',
    );
    assert(
      savedExample.pipeline_target === '.github/workflows/test.yml' &&
        savedExample.contract.pipeline_target === savedExample.pipeline_target,
      'resume example retains the coordinator pipeline target in its immutable contract',
    );
  } catch (error) {
    assert(false, 'shared setup routing validates', error.message);
  }

  try {
    const generationRoot = path.join(projectRoot, 'skills/bmad-tea-automate');
    const router = await fs.readFile(path.join(generationRoot, 'resources/test-generation-routing.md'), 'utf8');
    const entry = await fs.readFile(path.join(generationRoot, 'SKILL.md'), 'utf8');
    assert(
      entry.indexOf('resources/test-generation-routing.md') < entry.indexOf('## On Activation'),
      'generation resolves mode and operation before any activation hook',
    );
    assert(
      router.includes('When no task mode signal is present, default to expand') &&
        router.includes('An explicit mode in the user') &&
        router.includes('test_mode_defaulted = true'),
      'generation defaults to expand and preserves explicit mode precedence',
    );
    assert(
      router.includes('When no task mode signal is present, default to expand') &&
        router.includes('only when explicit task mode signals conflict in an interactive run') &&
        router.includes('with conflicting signals defaults to expand without a question') &&
        !router.includes('or neither resolves a mode'),
      'only conflicting task signals ask a mode question',
    );
    const routingExamples = router
      .split('\n')
      .filter((line) => line.startsWith('| '))
      .map((line) =>
        line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );
    for (const example of [
      ['`bmad-tea-automate`', 'none', 'interactive', 'expand (default)', 'no'],
      ['`bmad-tea-automate`', 'lets write acceptance tests', 'interactive or headless', 'red', 'no'],
      ['`bmad-tea-automate`', 'acceptance test scaffolds', 'interactive or headless', 'red', 'no'],
      ['`bmad-tea-automate`', 'red and expand task signals', 'interactive', 'unresolved', 'ask once'],
      ['`bmad-tea-automate`', 'red and expand task signals', 'headless', 'expand (default)', 'no'],
    ]) {
      assert(
        routingExamples.some((row) => row.length === example.length && row.every((value, index) => value === example[index])),
        `generation routing example: ${example[0]}, ${example[1]}, ${example[2]} selects ${example[3]} (${example[4]})`,
      );
    }
    assert(
      router.includes('`write acceptance tests`') && router.includes('`acceptance test scaffolds`'),
      'canonical acceptance-test trigger phrases explicitly select red mode',
    );
    assert(
      router.includes('resume_checkpoint_path') &&
        router.includes('outside the configured artifact folder') &&
        router.includes('A missing supplied file stops before activation'),
      'generation binds an exact Resume checkpoint before activation without substituting another file',
    );
    for (const prefix of ['', 'red/']) {
      const loader = await fs.readFile(path.join(generationRoot, prefix, 'steps-c/step-01b-resume.md'), 'utf8');
      assert(
        loader.includes('select that exact readable file before building a candidate list') &&
          loader.includes('Bind `outputFile`') &&
          loader.includes('exact path after any migration') &&
          loader.includes('outside `{test_artifacts}`') &&
          loader.includes('**Run identity check.**'),
        `generation ${prefix || 'expand/'} Resume retains exact checkpoint selection, saves and identity checks`,
      );
    }
    assert(
      router.includes('workflow-key = workflow.red') &&
        !router.includes('workflow_customization_manual') &&
        !router.includes('bmad-tea-atdd.toml') &&
        !(await pathExists(path.join(generationRoot, 'red/customize.toml'))) &&
        entry.includes('--key {workflow-key}'),
      'red mode resolves [workflow.red] from the automate customization files through the core resolver',
    );
  } catch (error) {
    assert(false, 'generation routing and Resume contract validates', error.message);
  }

  const frameworkScaffoldStepPath = path.join(projectRoot, 'skills/bmad-tea-framework/steps-c/step-03-scaffold-framework.md');
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

  const LEAN_SKILL_DIRS = ['bmad-tea-evaluate'];
  const LEAN_REQUIRED = ['SKILL.md', 'customize.toml', 'references', 'assets'];
  const LEAN_FORBIDDEN = ['workflow.yaml', 'steps-c', 'steps-e', 'steps-v', 'instructions.md', 'checklist.md', 'scripts'];

  // A skill is lean when it has neither workflow.yaml nor steps-c/. Both
  // conditions matter: bmad-tea-teach-me-testing has no workflow.yaml and would
  // misclassify as lean under a "no workflow.yaml" rule alone, but it does
  // carry steps-c/ and stays on the house set.
  async function isLeanSkill(workflowDir) {
    if (!(await pathExists(workflowDir))) return false;
    const hasWorkflowYaml = await pathExists(path.join(workflowDir, 'workflow.yaml'));
    const hasStepsC = await pathExists(path.join(workflowDir, 'steps-c'));
    return !hasWorkflowYaml && !hasStepsC;
  }

  try {
    const teachMeDir = path.join(projectRoot, 'skills/bmad-tea-teach-me-testing');
    assert(!(await isLeanSkill(teachMeDir)), 'bmad-tea-teach-me-testing (no workflow.yaml, has steps-c/) classifies as house');

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
      computedHouse.sort().join(',') === workflowDirs.sort().join(','),
      `house classification of skills/* equals the house workflowDirs list (got: ${computedHouse.sort().join(', ')})`,
    );
  } catch (error) {
    assert(false, 'every skills/* directory lands on exactly one expected set', error.message);
  }

  for (const [root, required] of [
    [
      'bmad-tea-automate/red',
      ['instructions.md', 'checklist.md', 'atdd-checklist-template.md', 'resources', 'steps-c', 'steps-v', 'steps-e'],
    ],
    [
      'bmad-tea-framework/ci',
      [
        'instructions.md',
        'checklist.md',
        'github-actions-template.yaml',
        'gitlab-ci-template.yaml',
        'azure-pipelines-template.yaml',
        'jenkins-pipeline-template.groovy',
        'harness-pipeline-template.yaml',
        'resources',
      ],
    ],
  ]) {
    for (const file of required) {
      assert(await pathExists(path.join(projectRoot, 'skills', root, file)), `${root} retains ${file}`);
    }
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
    assert(helpContent.includes('`bmad-tea-evaluate`:'), 'skills/bmod-tea/help/help.md describes bmad-tea-evaluate');
    assert(
      helpContent.includes('evaluations_folder') && helpContent.includes('`evals/`'),
      'skills/bmod-tea/help/help.md says where evaluate writes (evals/ by default, evaluations_folder to change it)',
    );
  } catch (error) {
    assert(false, 'skills/bmod-tea/help/help.md bmad-tea-evaluate entry validates', error.message);
  }

  // bmad follows every installed module's help, so this file is how the method
  // flow finds TEA. Hold the routes, the install conditions and the artifact map.
  try {
    const helpContent = await fs.readFile(path.join(projectRoot, 'skills/bmod-tea/help/help.md'), 'utf8');
    for (const marker of [
      "## Where TEA fits in the method's flow",
      'Name a method skill only when it is installed, and a TEA skill only when it is installed',
      'say which TEA skill would fill it once installed',
      '`bmad-tea-test-design` at epic level',
      '`bmad-tea-automate` in red mode, then `bmad-build`',
      "Red mode takes the story's ref (`1.2`), its title, or its leaf file, and reads the ticket through the method's ticket tools; on v6 it takes the story file.",
      '`bmad-qa-generate-e2e-tests` remains the fit for a quick, one-off set of end-to-end tests',
      "The story's status is never TEA's to change.",
      '--key modules.tea.test_artifacts',
      "a file whose frontmatter says `workflowStatus: 'in-progress'` is a started run the user can resume",
      'When a root file and a folder file cover the same scope, say both exist and let the user pick.',
    ]) {
      assert(helpContent.includes(marker), `skills/bmod-tea/help/help.md routes the method flow: ${marker}`);
    }
    for (const folder of ['test-design', 'framework', 'ci', 'atdd', 'automate', 'test-review', 'nfr', 'trace', 'evaluate']) {
      assert(helpContent.includes(`\`${folder}/\``), `skills/bmod-tea/help/help.md names the ${folder}/ artifact folder`);
    }
    const legacyRoot = helpContent.split('\n').find((line) => line.startsWith('Runs before these folders existed')) ?? '';
    assert(
      /only a checkpoint, the report's own status, its content or the user settles whether that run finished/.test(helpContent),
      'skills/bmod-tea/help/help.md never infers a finished run from a missing checkpoint',
    );
    for (const legacy of [
      'test-design-epic-<n>.md',
      'test-design-architecture.md',
      'test-design-qa.md',
      'test-design-progress.md',
      'framework-setup-progress.md',
      'ci-pipeline-progress.md',
      'atdd-checklist-<story>.md',
      'automation-summary.md',
      'test-review.md',
      'nfr-assessment.md',
      'traceability-matrix.md',
    ]) {
      assert(legacyRoot.includes(`\`${legacy}\``), `skills/bmod-tea/help/help.md names the legacy root file ${legacy}`);
    }
    assert(
      /\| Done with `bmad-build` and wants a maintained test suite for the work +\| `bmad-tea-automate` in expand mode +\|/.test(
        helpContent,
      ),
      'skills/bmod-tea/help/help.md routes the method flow: expand mode after bmad-build',
    );
    assert(!/solutioning/i.test(helpContent), 'skills/bmod-tea/help/help.md speaks v7, not v6 phase names');
  } catch (error) {
    assert(false, 'skills/bmod-tea/help/help.md method-flow routing validates', error.message);
  }

  // One story identity for every story-scoped workflow, read from the module
  // record, and a migration that carries pre-v7 story outputs onto tickets.
  try {
    const contract = await fs.readFile(path.join(projectRoot, 'skills/bmod-tea/contracts/story-identity.md'), 'utf8');
    for (const marker of [
      'uv run "{project-root}/_bmad/method/scripts/tickets.py" --project-root "{project-root}" find ["<dir>"] "<ref>"',
      'Quote each argument, so a title phrase such as `guest checkout` reaches `find` as one reference.',
      'A v7 error never falls back to the v6 route.',
      'epic entry: `<initiative>--e<epic id>-s<entry id>`',
      'initiative entry: `<initiative>--s<entry id>`',
      'backlog leaf: `backlog--<leaf file stem>`',
      'Folder names never contain `--`, so keys of different shapes and initiatives never collide.',
      'Its `## Prior builds` section is history, never criteria.',
      'Only an epic entry has epic context',
      "A check that requires the story's location accepts `storyFile` or `ticketRef`.",
      '`bmad migrate tea` carries them onto their tickets',
    ]) {
      assert(contract.includes(marker), `skills/bmod-tea/contracts/story-identity.md states: ${marker}`);
    }
    const workflows = {
      'skills/bmad-tea-automate/red/steps-c/step-01-preflight-and-context.md': 'red mode',
      'skills/bmad-tea-automate/steps-c/step-01-preflight-and-context.md': 'expand mode',
      'skills/bmad-tea-trace/steps-c/step-01-load-context.md': 'trace',
      'skills/bmad-tea-nfr/steps-c/step-01-load-context.md': 'nfr',
      'skills/bmad-tea-test-review/steps-c/step-01-load-context.md': 'test review',
    };
    for (const [file, label] of Object.entries(workflows)) {
      const content = await fs.readFile(path.join(projectRoot, file), 'utf8');
      assert(content.includes('{tea-contracts}/story-identity.md'), `${label} resolves stories by the shared contract`);
      assert(
        !content.includes('`story_key` is the BMM story file basename without `.md`'),
        `${label} no longer carries its own copy of the v6 story_key rule`,
      );
    }
    for (const skill of ['bmad-tea-automate', 'bmad-tea-trace', 'bmad-tea-nfr', 'bmad-tea-test-review']) {
      const skillMd = await fs.readFile(path.join(projectRoot, 'skills', skill, 'SKILL.md'), 'utf8');
      assert(
        skillMd.includes('`{tea-contracts}` is the `contracts/` folder of the `bmod-tea` skill'),
        `${skill}/SKILL.md defines {tea-contracts}`,
      );
    }
    const aggregate = await fs.readFile(path.join(projectRoot, 'skills/bmad-tea-automate/red/steps-c/step-04c-aggregate.md'), 'utf8');
    assert(
      aggregate.includes('Never write to a v7 leaf file, plan or `tickets.toml`'),
      'red mode links artifacts back only into a v6 story file',
    );
    // Mirror core's knowledge.py check: a [migration] table with every field a
    // non-empty string, module equal to the record's code, and a non-empty
    // checklist of non-empty strings. Anything less and `bmad migrate` never lists it.
    const { parse: parseToml } = require('smol-toml');
    const migrationProblems = (source) => {
      const table = parseToml(source).migration;
      if (!table || typeof table !== 'object') return ['no [migration] table'];
      const problems = ['module', 'from', 'to', 'title', 'summary', 'detect', 'guide']
        .filter((name) => typeof table[name] !== 'string' || table[name].trim() === '')
        .map((name) => `empty ${name}`);
      const { checklist } = table;
      if (!Array.isArray(checklist) || checklist.length === 0 || !checklist.every((item) => typeof item === 'string' && item.trim())) {
        problems.push('empty checklist');
      }
      if (table.module !== 'tea') problems.push(`module ${table.module} is not tea`);
      return problems;
    };
    const migration = await fs.readFile(path.join(projectRoot, 'skills/bmod-tea/migration-2.toml'), 'utf8');
    assert(
      migrationProblems(migration).length === 0,
      `skills/bmod-tea/migration-2.toml passes core's migration check: ${migrationProblems(migration).join(', ')}`,
    );
    assert(
      migrationProblems(migration.replace(/^title = ".*"$/m, 'title = ""')).includes('empty title') &&
        migrationProblems(migration.replace(/^checklist = \[[\s\S]*\]\s*$/m, 'checklist = []')).includes('empty checklist'),
      'the migration check rejects an empty title and an empty checklist',
    );
    for (const marker of [
      'A key prefix or a similar title is never evidence.',
      'never leave two files with one story key in a workflow folder',
      '<test_artifacts>/migration-tea-v7-preserved/<its path relative to the test artifacts folder>',
      'its unresolved list names every pre-v7 story output still present: the project is already migrated',
      '`adopted` (`pending`, `moved`, `rewritten`), `preserved` (`pending`, `moved`)',
      'Ticket files, plans, stories and the method record are read only.',
      '## Resume',
      'never write a new plan over it',
      'passing the folder works with no active initiative',
      'the story id its H1 heading states',
      'A v7 key contains `--`',
      'pieces of evidence that name different tickets, leave the set unresolved',
      'commit the moves alone, so git records each as a rename',
    ]) {
      assert(migration.includes(marker), `skills/bmod-tea/migration-2.toml holds: ${marker}`);
    }
    for (const marker of [
      'its `epic` field holds the same name for every shape, so it does not tell them apart',
      '**Backlog leaf:** `folder` is `backlog`.',
      'a v6 or no-method run never mentions it',
      'Never read the entry id as an epic id',
      'Every resume of a story run loads this section too.',
    ]) {
      assert(contract.includes(marker), `skills/bmod-tea/contracts/story-identity.md states: ${marker}`);
    }
    assert(
      aggregate.includes('const outputFile = `{atddChecklistPath}`;') &&
        !aggregate.includes('const outputFile = `{test_artifacts}/atdd/atdd-checklist-{story_key}.md`;'),
      'red mode aggregation writes the bound checklist path, never a path rebuilt from story_key',
    );
    for (const file of [
      'skills/bmad-tea-automate/steps-c/step-01-preflight-and-context.md',
      'skills/bmad-tea-trace/steps-c/step-01-load-context.md',
      'skills/bmad-tea-nfr/steps-c/step-01-load-context.md',
      'skills/bmad-tea-test-review/steps-c/step-01-load-context.md',
    ]) {
      const content = await fs.readFile(path.join(projectRoot, file), 'utf8');
      assert(
        content.includes('also write `storyId`, `storyKey`, `ticketRef` and `storyFile` into this frontmatter'),
        `${file} saves the story fields`,
      );
    }
    for (const file of [
      'skills/bmad-tea-automate/red/steps-c/step-01b-resume.md',
      'skills/bmad-tea-automate/steps-c/step-01b-resume.md',
      'skills/bmad-tea-trace/steps-c/step-01b-resume.md',
      'skills/bmad-tea-nfr/steps-c/step-01b-resume.md',
      'skills/bmad-tea-test-review/steps-c/step-01b-resume.md',
    ]) {
      const content = await fs.readFile(path.join(projectRoot, file), 'utf8');
      assert(content.includes('This holds on every resume path, named or not.'), `${file} loads the story contract on resume`);
    }
    const reviewContext = await fs.readFile(path.join(projectRoot, 'skills/bmad-tea-test-review/steps-c/step-01-load-context.md'), 'utf8');
    const contextSection = reviewContext.slice(
      reviewContext.indexOf('## 3. Resolve Context Artifacts'),
      reviewContext.indexOf('Record `{context_basis}`'),
    );
    assert(
      contextSection.includes('0. **The invocation names a story**'),
      'test review resolves a named story while building its context set, before context_basis is recorded',
    );
  } catch (error) {
    assert(false, 'story identity contract and TEA migration-2 validate', error.message);
  }

  // Trace measures a v7 epic against its requirement spine: one gate row per `R<n>` line, criteria
  // aggregated beneath it, link exceptions kept in the gate, live evidence resolved through the alias
  // map the CLI shares, and a checkpoint from before the change resumed as a criterion run.
  try {
    const read = (file) => fs.readFile(path.join(projectRoot, file), 'utf8');
    const traceStep = (name) => read(`skills/bmad-tea-trace/steps-c/${name}`);
    const contract = await read('skills/bmod-tea/contracts/story-identity.md');
    const [load, resume, discover, map, gaps, gate, template, checklist] = await Promise.all([
      traceStep('step-01-load-context.md'),
      traceStep('step-01b-resume.md'),
      traceStep('step-02-discover-tests.md'),
      traceStep('step-03-map-criteria.md'),
      traceStep('step-04-analyze-gaps.md'),
      traceStep('step-05-gate-decision.md'),
      read('skills/bmad-tea-trace/trace-template.md'),
      read('skills/bmad-tea-trace/checklist.md'),
    ]);
    const holds = (label, text, markers) => {
      for (const marker of markers) assert(text.includes(marker), `${label} states: ${marker}`);
    };
    // Slice from a start marker to the first `end` after it, inclusive, so a block of a step's code can run here.
    const codeFrom = (text, start, end) => {
      const from = text.indexOf(start);
      const to = from === -1 ? -1 : text.indexOf(end, from);
      if (from === -1 || to === -1) throw new Error(`step code from "${start}" to "${end}" not found`);
      return text.slice(from, to + end.length);
    };

    // AC1: the switch, and a checkpoint with no granularity stays a criterion run.
    holds('trace step 1', load, [
      'A fresh run uses the requirement oracle and records `oracleGranularity: requirements` only when both hold',
      "That epic's file has at least one Requirements line of the form `R<n> (<parent or source>): <line>`",
      'Such a run also records `coverageBasis: acceptance_criteria` and `oracleResolutionMode: formal_requirements`.',
      'a story, a release, a hotfix, the system, a v6 epic, and a v7 epic whose file has no `R<n>` line',
      'A checkpoint with no `oracleGranularity` is a criterion-oracle run and resumes as one, with its rows and evidence unchanged',
      "oracleGranularity: '{criteria | requirements}'",
    ]);
    holds('trace resume', resume, [
      'A checkpoint with no `oracleGranularity` is a criterion-oracle run and resumes as one',
      'Resume never re-decides granularity; only a fresh run adopts requirement granularity.',
    ]);
    // AC2: the epic key and its run key, never slugged.
    holds('story identity contract', contract, [
      '`epic_key`, for a workflow scoped to a whole v7 epic: `<initiative>--e<epic id>`, for example `shop--e1`',
      '`<initiative>--<epic folder>`, for example `shop--epic-loyalty`',
      "An epic entry's `story_key` is its epic's key followed by `-s<entry id>`.",
    ]);
    holds('trace step 1', load, [
      '`epic-{epic_key}`: one v7 epic, for example `epic-shop--e1`',
      'The epic key is used as written; never slug it, because slugging collapses its `--`.',
      '`epic-{epic_num}`: one v6 epic.',
    ]);
    // AC3: two ledgers, every disposition, and the duplicate halt.
    holds('trace step 1', load, [
      '`id`: `<story key>--<localId>`, for example `shop--e1-s2--AC-1`.',
      "`declaredLinks`: the `R` ids the criterion names. For a `verify`-only story's single criterion, the story's `covers`: the pulled leaf's frontmatter `covers` once the story has a leaf, else the entry's.",
      '`exception`: `unlinked` when `declaredLinks` is empty; `invalid-link` when `invalidLinks` is not empty, even when `validLinks` is not; `none` otherwise.',
      'A criterion contributes to every requirement in its `validLinks`.',
      '`id`: `<epic key>--R<n>`, for example `shop--e1--R1`.',
      'Then write one row per `criterionLedger` record whose `exception` is not `none`:',
      'Two `R` lines with the same local id in one epic **halt** the run before mapping. Name the id and both source `path:line` locations',
      // AC4: priorities and their basis, recorded before mapping.
      'A requirement row takes the explicit priority its `R` line states (`explicit`); else the highest priority among its contributors (`contributors`); else, with no contributors, one inferred from the requirement text and epic context',
      "An exception row copies its criterion's `priority` and `priorityBasis` unchanged.",
      'A requirement row with at least one contributor and no explicit priority always records `contributors`; `inferred` is recorded only when its `contributors` list is empty.',
      "the row's priority is the highest `priority` recorded on the `criterionLedger` records its `contributors` list",
      // F1/F5 support: every field the CLI reconciles is persisted on each criterion.
      "- `source`: the `path:line` where the criterion starts: the line holding a numbered criterion's bold name, a plan criterion's first line, or the `verify` text.",
      'For a numbered criterion that is its name line (the bold name and the `R` ids it names) followed by every line beneath it',
      '`priority` and `priorityBasis`: by section E. Every record carries both.',
      "priorityBasis: '{explicit | inferred}'",
      "localId: '{localId}'",
      "story: '{story key}'",
      "declaredLinks: ['{R id}']",
      "exception: '{none | unlinked | invalid-link}'",
    ]);
    // AC5: aggregation, completeness, and evidence staying with criteria.
    holds('trace step 3', map, [
      "A behavior no contributor states goes into `missingBehaviors` in the requirement line's own words.",
      'it never maps to a requirement row, and it never marks a requirement FULL on its own',
      'A requirement row with no contributors is NONE, and its gaps read "no story covers it".',
      'A UNIT-ONLY or INTEGRATION-ONLY contributor counts as not FULL.',
    ]);
    const requirementCoverage = new Function(`${codeFrom(map, 'const requirementCoverage = ', '\n};')}\nreturn requirementCoverage;`)();
    const rows = (...statuses) => statuses.map((coverage) => ({ coverage }));
    for (const [linked, missing, expected] of [
      [rows(), [], 'NONE'],
      [rows('NONE', 'NONE'), [], 'NONE'],
      [rows('FULL', 'FULL'), [], 'FULL'],
      [rows('FULL', 'FULL'), ['recovery after a declined payment'], 'PARTIAL'],
      [rows('FULL', 'NONE'), [], 'PARTIAL'],
      [rows('FULL', 'UNIT-ONLY'), [], 'PARTIAL'],
      [rows('INTEGRATION-ONLY'), [], 'PARTIAL'],
    ]) {
      const actual = requirementCoverage(linked, missing);
      assert(
        actual === expected,
        `trace step 3 aggregates [${linked.map((row) => row.coverage).join(', ')}] with ${missing.length} missing behavior(s) to ${expected}`,
        `got ${actual}`,
      );
    }

    // AC6: the alias map, run from Step 3's own code and compared with the CLI's map.
    holds('trace step 3', map, [
      'Normalize every record to its canonical id **before** failure grouping, contradiction checks, evidence attachment, and disposition counts',
      'Keep the supplied id in `supplied_requirement_id` for diagnostics.',
    ]);
    const resolveLive = new Function(
      'oracleGranularity',
      'criterionRows',
      'progressFrontmatter',
      'liveRecords',
      `${codeFrom(map, 'const liveAliasMap = new Map();', '  return record;\n});')}\nreturn { liveAliasMap, resolvedLiveRecords };`,
    );
    const criteria = ['shop--e1-s1--AC-1', 'shop--e1-s2--AC-1', 'shop--e1-s2--AC-2'].map((id) => ({ id }));
    const frontmatter = { oracleLedger: [{ id: 'shop--e1--R1', kind: 'requirement' }] };
    const record = (requirement_id, disposition = 'counted') => ({ id: `${requirement_id}-${disposition}`, requirement_id, disposition });
    const live = resolveLive('requirements', criteria, frontmatter, [
      record('shop--e1-s1--AC-1'),
      record('AC-2'),
      record('AC-1'),
      record('shop--e1--R1'),
      record('R1'),
      record('AC-9'),
    ]);
    const outcome = live.resolvedLiveRecords.map((row) => `${row.supplied_requirement_id}->${row.requirement_id}:${row.disposition}`);
    assert(
      JSON.stringify(outcome) ===
        JSON.stringify([
          'shop--e1-s1--AC-1->shop--e1-s1--AC-1:counted',
          'AC-2->shop--e1-s2--AC-2:counted',
          'AC-1->AC-1:unmatched',
          'shop--e1--R1->shop--e1--R1:unmatched',
          'R1->R1:unmatched',
          'AC-9->AC-9:unmatched',
        ]),
      'trace step 3 resolves qualified and unique local ids to their criterion and leaves ambiguous, requirement-row and unknown ids unmatched',
      outcome.join(', '),
    );
    assert(
      /carried by 2 criteria/.test(live.resolvedLiveRecords[2].unmatched_reason) &&
        /names a requirement row/.test(live.resolvedLiveRecords[3].unmatched_reason) &&
        /names a requirement row/.test(live.resolvedLiveRecords[4].unmatched_reason),
      'trace step 3 gives each unmatched record the reason its id failed',
    );
    for (const [pass, fail] of [
      ['shop--e1-s2--AC-2', 'AC-2'],
      ['AC-2', 'shop--e1-s2--AC-2'],
    ]) {
      const [counted] = resolveLive('requirements', criteria, frontmatter, [record(pass), record(fail, 'fail')]).resolvedLiveRecords;
      assert(
        counted.disposition === 'contradicted',
        `trace step 3 lets a fail spelled ${fail} contradict a pass spelled ${pass}`,
        counted.disposition,
      );
    }
    const criterionRun = resolveLive('criteria', [{ id: 'AC-1' }], {}, [record('AC-1'), record('AC-9')]).resolvedLiveRecords;
    assert(
      criterionRun[0].disposition === 'counted' && criterionRun[1].disposition === 'unmatched',
      'trace step 3 keeps a criterion-oracle run on its row ids alone',
    );
    const { liveAliasMap: cliAliasMap } = require('../cli/lib/trace-live');
    assert(typeof cliAliasMap === 'function', 'the CLI exports the live alias map Trace Step 3 shares');
    if (typeof cliAliasMap === 'function') {
      const cli = cliAliasMap(
        criteria.map((row) => row.id),
        ['shop--e1--R1'],
      );
      const ids = ['shop--e1-s1--AC-1', 'shop--e1-s2--AC-1', 'AC-1', 'AC-2', 'shop--e1--R1', 'R1', 'AC-9'];
      const disagree = ids.filter((id) => (cli.get(id)?.id ?? null) !== (live.liveAliasMap.get(id)?.id ?? null));
      assert(disagree.length === 0, 'trace step 3 and the CLI resolve every live id to the same criterion', disagree.join(', '));
    }

    // AC6: live-only, derived the same way in Step 4 and Step 5 for every non-NONE gate row.
    const step4LiveOnlyCount = new Function(
      'traceabilityMatrix',
      'coverageEligibleStatuses',
      `${codeFrom(gaps, 'const isActiveTest = (test) => {', '\n  return isLiveOnlyTestSet(req.tests);\n});')}\nreturn liveOnlyRequirements.length;`,
    );
    const step4LiveOnly = (gateRows) => step4LiveOnlyCount(gateRows, new Set(['FULL', 'PARTIAL', 'UNIT-ONLY', 'INTEGRATION-ONLY']));
    const step5LiveOnlyCount = new Function(
      'coverageMatrix',
      `${codeFrom(gate, 'const liveCoverageEligible = new Set(', '\n}).length;')}\nreturn derivedLiveOnlyRequirements;`,
    );
    const step5LiveOnly = (gateRows) => step5LiveOnlyCount({ requirements: gateRows });
    const liveTest = { id: 'L', level: 'live', status: 'active' };
    const staticTest = { id: 'S', level: 'api', status: 'active' };
    const seededRows = [
      // FULL requirement with one static and one live-only contributor: capped.
      {
        kind: 'requirement',
        coverage: 'FULL',
        contributors: [
          { coverage: 'FULL', tests: [staticTest] },
          { coverage: 'FULL', tests: [liveTest] },
        ],
      },
      // PARTIAL requirement resting on a live-only contributor: capped.
      { kind: 'requirement', coverage: 'PARTIAL', contributors: [{ coverage: 'PARTIAL', tests: [liveTest] }] },
      // Static contributors only: not capped.
      { kind: 'requirement', coverage: 'FULL', contributors: [{ coverage: 'FULL', tests: [staticTest] }] },
      // Live-only exception row: capped.
      { kind: 'exception', coverage: 'FULL', tests: [liveTest] },
      // NONE requirement: never live-only.
      { kind: 'requirement', coverage: 'NONE', contributors: [] },
      // A criterion-oracle row keeps today's rule.
      { coverage: 'FULL', tests: [liveTest] },
    ];
    assert(
      step4LiveOnly(seededRows) === 4,
      'trace step 4 derives a live-only gate row from any live-only contributor or its own tests',
      `got ${step4LiveOnly(seededRows)}`,
    );
    assert(
      step5LiveOnly(seededRows) === 4,
      'trace step 5 derives live-only gate rows again by the same rule',
      `got ${step5LiveOnly(seededRows)}`,
    );

    // AC6, AC9: gate rows built by Step 3's own construction code, then run through both live-only
    // derivations and Step 5's published `oracle.rows`, with no field seeded by hand.
    const buildGateRows = new Function(
      `${codeFrom(map, 'const requirementCoverage = ', 'coverage: requirementCoverage(contributors, missingBehaviors),\n    };\n  });\n};')}\nreturn buildGateRows;`,
    )();
    const summaryOracleRows = new Function(
      `${codeFrom(gate, 'const summaryOracleRows = (gateRows) =>', '      })),\n    };\n  });')}\nreturn summaryOracleRows;`,
    )();
    const criterionRow = (id, coverage, tests) => ({ id, story: id.slice(0, id.lastIndexOf('--')), coverage, tests });
    const flagged = (flag) => ({ id: `S-${flag}`, level: 'api', status: 'active', file: 'tests/pay.spec.ts', line: 7, [flag]: true });
    const builtCriteria = [
      criterionRow('shop--e1-s1--AC-1', 'FULL', [staticTest]),
      criterionRow('shop--e1-s2--AC-1', 'FULL', [liveTest]),
      criterionRow('shop--e1-s2--AC-2', 'FULL', [staticTest]),
      criterionRow('shop--e1-s3--AC-1', 'FULL', [liveTest, flagged('skipped')]),
      criterionRow('shop--e1-s3--AC-2', 'FULL', [liveTest, flagged('pending')]),
      criterionRow('shop--e1-s3--AC-3', 'FULL', [liveTest, flagged('fixme')]),
      criterionRow('shop--e1-s4--AC-1', 'PARTIAL', [liveTest]),
    ];
    const requirementLedgerRow = (n, contributors, priorityBasis = 'contributors') => ({
      id: `shop--e1--R${n}`,
      kind: 'requirement',
      requirement: `Requirement ${n}`,
      parent: n === 1 ? null : 'parent R1',
      source: `epic.md:${10 + n}`,
      priority: 'P1',
      priorityBasis,
      contributors,
    });
    const builtLedger = [
      requirementLedgerRow(1, ['shop--e1-s1--AC-1', 'shop--e1-s2--AC-1']),
      requirementLedgerRow(2, ['shop--e1-s1--AC-1']),
      requirementLedgerRow(3, [], 'inferred'),
      requirementLedgerRow(4, ['shop--e1-s3--AC-1']),
      requirementLedgerRow(5, ['shop--e1-s3--AC-2']),
      requirementLedgerRow(6, ['shop--e1-s3--AC-3']),
      // A ledger row without `kind` still builds a requirement row.
      { ...requirementLedgerRow(7, ['shop--e1-s1--AC-1']), kind: undefined },
      {
        id: 'shop--e1-s2--AC-2',
        kind: 'exception',
        exception: 'unlinked',
        requirement: 'AC-2 text',
        source: 's2.md:9',
        priority: 'P0',
        priorityBasis: 'explicit',
      },
      {
        id: 'shop--e1-s4--AC-1',
        kind: 'exception',
        exception: 'invalid-link',
        requirement: 'AC-1 text',
        source: 's4.md:5',
        priority: 'P2',
        priorityBasis: 'inferred',
      },
    ];
    const built = buildGateRows(builtLedger, builtCriteria, { 'shop--e1--R2': ['recovery after a declined payment'] });
    assert(
      JSON.stringify(built.map((row) => `${row.id}:${row.kind}:${row.coverage}`)) ===
        JSON.stringify([
          'shop--e1--R1:requirement:FULL',
          'shop--e1--R2:requirement:PARTIAL',
          'shop--e1--R3:requirement:NONE',
          'shop--e1--R4:requirement:FULL',
          'shop--e1--R5:requirement:FULL',
          'shop--e1--R6:requirement:FULL',
          'shop--e1--R7:requirement:FULL',
          'shop--e1-s2--AC-2:exception:FULL',
          'shop--e1-s4--AC-1:exception:PARTIAL',
        ]),
      'trace step 3 builds one gate row per oracleLedger row, each with its kind and aggregated coverage',
      built.map((row) => `${row.id}:${row.kind}:${row.coverage}`).join(', '),
    );
    const builtTest = (requirementId, testId) =>
      built.find((row) => row.id === requirementId).contributors[0].tests.find((test) => test.id === testId);
    for (const [requirementId, flag] of [
      ['shop--e1--R4', 'skipped'],
      ['shop--e1--R5', 'pending'],
      ['shop--e1--R6', 'fixme'],
    ]) {
      assert(
        builtTest(requirementId, `S-${flag}`)?.[flag] === true,
        `trace step 3 keeps a contributor test's ${flag} flag through row construction`,
      );
    }
    // R1, R4, R5, R6, and the live-only invalid-link row; R2, R7, and the unlinked row rest on static tests.
    assert(
      step4LiveOnly(built) === 5,
      'trace step 4 caps every constructed row resting on a live-only criterion',
      `got ${step4LiveOnly(built)}`,
    );
    assert(
      step5LiveOnly(built) === 5,
      'trace step 5 caps every constructed row resting on a live-only criterion',
      `got ${step5LiveOnly(built)}`,
    );
    const withoutKind = built.map(({ kind, ...row }) => (row.contributors ? row : { kind, ...row }));
    assert(
      step4LiveOnly(withoutKind) === 5 && step5LiveOnly(withoutKind) === 5,
      'trace steps 4 and 5 treat a row with contributors as a requirement row when its kind is lost',
    );
    for (const flag of ['skipped', 'pending', 'fixme']) {
      const flaggedCriterion = criterionRow('shop--e1-s9--AC-1', 'FULL', [liveTest, flagged(flag)]);
      const unflagged = criterionRow('shop--e1-s9--AC-1', 'FULL', [liveTest, { ...flagged(flag), [flag]: false }]);
      const ledger = [requirementLedgerRow(1, ['shop--e1-s9--AC-1'])];
      const capped = buildGateRows(ledger, [flaggedCriterion]);
      const control = buildGateRows(ledger, [unflagged]);
      assert(
        step4LiveOnly(capped) === 1 && step5LiveOnly(capped) === 1,
        `trace steps 4 and 5 keep the live-only cap when the contributor's static test is ${flag}`,
      );
      assert(
        step4LiveOnly(control) === 0 && step5LiveOnly(control) === 0,
        `trace steps 4 and 5 lift the cap when the same static test is not ${flag}`,
      );
    }

    // AC9: the published summary carries every gate row in ledger order.
    holds('trace step 5', gate, [
      "...(oracleGranularity === 'requirements' ? { rows: summaryOracleRows(coverageMatrix.requirements || []) } : {}),",
    ]);
    const published = summaryOracleRows(built);
    assert(
      JSON.stringify(published.map((row) => row.id)) === JSON.stringify(builtLedger.map((row) => row.id)),
      'trace step 5 publishes one oracle row per oracleLedger row, in ledger order',
    );
    assert(
      JSON.stringify(published[0]) ===
        JSON.stringify({
          id: 'shop--e1--R1',
          kind: 'requirement',
          priority: 'P1',
          priority_basis: 'contributors',
          coverage: 'FULL',
          parent: null,
          missing_behaviors: [],
          contributors: [
            { id: 'shop--e1-s1--AC-1', story: 'shop--e1-s1', coverage: 'FULL' },
            { id: 'shop--e1-s2--AC-1', story: 'shop--e1-s2', coverage: 'FULL' },
          ],
        }),
      'trace step 5 publishes a requirement row with its parent, missing behaviors, and contributors',
      JSON.stringify(published[0]),
    );
    assert(
      published[1].parent === 'parent R1' &&
        JSON.stringify(published[1].missing_behaviors) === JSON.stringify(['recovery after a declined payment']) &&
        published[1].coverage === 'PARTIAL' &&
        published[2].priority_basis === 'inferred' &&
        published[2].contributors.length === 0,
      'trace step 5 publishes missing behaviors, parents, and an uncovered requirement unchanged',
    );
    assert(
      JSON.stringify(published[8]) ===
        JSON.stringify({
          id: 'shop--e1-s4--AC-1',
          kind: 'exception',
          priority: 'P2',
          priority_basis: 'inferred',
          coverage: 'PARTIAL',
          exception: 'invalid-link',
        }),
      'trace step 5 publishes an exception row with its exception and no requirement fields',
      JSON.stringify(published[8]),
    );

    // AC7: the gate counts oracleLedger rows; test and level counts come from criterion rows.
    holds('trace step 4', gaps, [
      'Statistics, priority buckets, and thresholds are computed over `traceabilityMatrix`, the `oracleLedger` rows.',
      'const totalRequirements = traceabilityMatrix.length;',
      "const oracleGranularity = ledgerFrontmatter.oracleGranularity === 'requirements' ? 'requirements' : 'criteria';",
      'granularity: oracleGranularity,',
      'criteria: criterionRows,',
    ]);
    assert(
      (gaps.match(/\(criterionRows \|\| \[\]\)\.forEach\(\(req\) => \{/g) || []).length === 2,
      'trace step 4 builds unique tests and per-level criteria_covered from criterionRows',
    );
    holds('trace step 5', gate, [
      'deriveActiveTestCasesFromRequirements(criterionRows)',
      '  criterionRows.forEach((req) => {',
      'granularity: oracleGranularity, // `requirements` for a v7 epic',
      "const oracleGranularity = coverageMatrix.oracle?.granularity === 'requirements' ? 'requirements' : 'criteria';",
    ]);

    // AC9: the matrix lists exactly the oracleLedger rows in the CLI's format, contributors in their own table.
    const tableHeader = (cells) => new RegExp(String.raw`^\|${cells.map((cell) => ` *${cell} *`).join(String.raw`\|`)}\|$`, 'm');
    assert(tableHeader(['ID', 'Requirement', 'Priority', 'Coverage']).test(template), 'the trace template renders the gate table');
    assert(
      tableHeader(['Contributor', 'Story', 'Status', 'Tests']).test(template),
      'the trace template heads each contributors table `| Contributor | Story | Status | Tests |`',
    );
    holds('the trace template', template, [
      '### {REQUIREMENT_ROW_ID} ({PRIORITY}): {REQUIREMENT_TEXT}',
      '### {EXCEPTION_CRITERION_ID} ({PRIORITY}): {CRITERION_NAME}',
      '### Invalid and Unlinked Criteria',
      "oracleGranularity: ''",
      'criterionLedger: []',
    ]);
    // Live runs: a requirement no story covers has an empty contributors list, so it needs no table.
    holds('the trace template', template, [
      "When the row's `contributors` list is empty, write `- **Contributors:** none` and omit the table.",
    ]);
    holds('trace step 5', gate, ['a contributors table when it has contributors']);
    holds('the trace checklist', checklist, [
      'a requirement with no contributors reads `**Contributors:** none` and has no table',
      'a contributors table headed exactly `| Contributor | Story | Status | Tests |`',
      '`oracle.granularity` present in the summary and the Phase 1 matrix',
    ]);

    // Live runs: a gate row names a numbered criterion by its bold name alone, and every detail heading
    // repeats the row's requirement after a lone `(P<n>)`, so the ledger, table cell and heading agree.
    holds('trace step 1', load, [
      "the row's `requirement` is the bold name alone, `Order number shown`, without the parenthesised `R` ids or priority after it",
      "For a `verify`-only story's single criterion it is the `verify` text.",
      "- `name`: the criterion's name. For a numbered criterion that is its bold name alone, without the parenthesised `R` ids or priority after it",
      "- `text`: the criterion's frozen full text as the source states it with the list marker removed.",
      "- `requirement`: the criterion's `name`. A numbered criterion's row reads `Form remembers address`, its bold name alone.",
      "name: '{criterion name}'",
      "text: '{frozen full criterion text}'",
    ]);
    // The exception row's YAML shape carries the name, never the full text.
    const exceptionStart = load.indexOf("kind: 'exception'");
    const exceptionShape = load.slice(exceptionStart, load.indexOf('\n    }', exceptionStart));
    assert(
      /requirement: '\{criterion name\}'/.test(exceptionShape) && !/full/.test(exceptionShape),
      "trace step 1's exception row shape records the criterion's name as its requirement",
    );
    holds('trace step 2', discover, ['its `name`, and its full `text`']);
    holds('trace step 3', map, ["copy each record's `name` and full `text`, and classify coverage against the full `text`"]);
    holds('trace step 5', gate, [
      "Each detail heading is `<id> (P<n>): <requirement>`, where `<requirement>` repeats the `oracleLedger` row's `requirement` exactly and `(P<n>)` is the only annotation",
    ]);
    holds('the trace template', template, [
      '#### {CRITERION_ID} ({PRIORITY}): {REQUIREMENT_TEXT}',
      "An exception row's `requirement` is its criterion's `name`, so its cell and heading read `Form remembers address`",
    ]);
    holds('the trace checklist', checklist, [
      'records that bold name alone as its `requirement`, without the parenthesised `R` ids or priority (`Order number shown`)',
      'Every detail heading reads `<id> (P<n>): <requirement>`',
    ]);
    // Every criterion and gate-row detail heading the template and worked example show uses the lone `(P<n>)` form.
    const example = await read('skills/bmad-tea-trace/resources/traceability-matrix.example.md');
    for (const [label, text] of [
      ['the trace template', template],
      ['the worked example matrix', example],
    ]) {
      const details = text.split('\n').filter((line) => /^#{3,4} (?:Example: )?(?:\{[A-Z_]*ID\}|AC-\d+)\b/.test(line));
      assert(details.length > 0, `${label} shows criterion detail headings`);
      for (const line of details)
        assert(
          /^#{3,4} (?:Example: )?(?:\{[A-Z_]*ID\}|AC-\d+) \((?:\{PRIORITY\}|P[0-3])\): [^()]+$/.test(line),
          `${label} heading uses \`<id> (P<n>): <text>\` with no other annotation: ${line}`,
        );
    }

    // AC10: persisted ledgers, and the pre-change checkpoint found, checked and resumed under its own identity.
    holds('trace step 1', load, [
      'criterionLedger:',
      "priorityBasis: '{explicit | contributors | inferred}'",
      "contributors: ['{criterion id}']",
    ]);
    holds('trace step 3', map, [
      'fenced ` ```json ` block titled `Requirement Aggregation`',
      'The block is required, and it stays in the final document: Step 5 carries it into the report unchanged.',
    ]);
    // Round 2, F2: Step 4 keeps the block and Step 5's body replacement carries it into the final report.
    holds('trace step 4', gaps, ["keep Step 3's `Requirement Aggregation` block exactly as Step 3 saved it"]);
    holds('trace step 5', gate, ["Step 3's `Requirement Aggregation` block is the one part of the working notes the report keeps."]);
    holds('trace template', template, [
      "Step 5's save appends that block, heading and ` ```json ` block unchanged, once at the end of the report",
    ]);
    const keptBlock = new Function(
      'existingDoc',
      'oracleGranularity',
      `${codeFrom(gate, 'const aggregationBlock =', '\n    : null;')}\nreturn aggregationBlock;`,
    );
    const block = '### Requirement Aggregation\n\n```json\n{ "criterionMatrix": [], "traceabilityMatrix": [] }\n```';
    const fence = '```';
    const workingNotes = `---\nrunKey: epic-shop--e1\n---\n\n## Step 3\n\n${block}\n\n## Step 4\n\n${fence}json\n{}\n${fence}\n`;
    assert(keptBlock(workingNotes, 'requirements') === block, 'trace step 5 carries the Step 3 Requirement Aggregation block, and only it');
    assert(keptBlock(workingNotes, 'criteria') === null, 'trace step 5 keeps no aggregation block in a criterion-oracle run');
    // Round 2, F5: Step 1 names the native shapes the CLI captures criteria from.
    holds('trace step 1', load, [
      "The ticket's numbered criteria are a story leaf's under `## Requirements` and a bug or spike leaf's under `## Acceptance Criteria`.",
      "A plan's acceptance criteria are the list under its Acceptance Criteria heading, or the list after the bold `**Acceptance Criteria:**` label in its `## Tasks & Acceptance` section.",
    ]);
    holds('trace resume', resume, [
      '`{test_artifacts}/trace/traceability-matrix-epic-<epic id>.md`',
      "The file is accepted only when its saved target names this epic: its `oracleSources` or `inputDocuments` cite a file inside this epic's folder",
      'An epic number or a similar title alone is never evidence.',
      "When the file names another initiative's epic, or `{outputFile}` for the new key and an accepted pre-change file are both candidates",
      'A selected pre-change file keeps its stored `runScope`, `runKey`, and target for the rest of the run',
      'It has no `oracleGranularity`, so it resumes as a criterion-oracle run.',
      'A pre-change v7 epic file that section 1 accepted passes this check through its saved target and keeps its stored `runKey`.',
    ]);
    holds('trace step 2', discover, ['a requirement row id is never a search target']);
  } catch (error) {
    assert(false, 'trace requirement oracle contract validates', error.message);
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
    const plantedMemlog = path.join(projectRoot, 'skills/bmad-tea-evaluate/.memlog.md');
    const plantedAnalysisDir = path.join(projectRoot, 'skills/bmad-tea-evaluate/.analysis');
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
    const phase = workflow === 'ci' ? 'bmad-tea-framework/ci' : workflow === 'atdd' ? 'bmad-tea-automate/red' : `bmad-tea-${workflow}`;
    const text = await fs.readFile(path.join(projectRoot, 'skills', phase, stepsDir, fileName), 'utf8');
    return yaml.load(extractFrontmatter(text)) ?? {};
  }

  for (const [workflow, { tokens, legacy }] of Object.entries(SCOPED_WORKFLOWS)) {
    const folder = `{test_artifacts}/${workflow}/`;
    const carriesScope = (value) => typeof value === 'string' && value.startsWith(folder) && tokens.some((token) => value.includes(token));
    try {
      const phase = workflow === 'atdd' ? 'bmad-tea-automate/red' : `bmad-tea-${workflow}`;
      const stepsCDir = path.join(projectRoot, 'skills', phase, 'steps-c');
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

      const workflowYaml = yaml.load(await fs.readFile(path.join(projectRoot, 'skills', phase, 'workflow.yaml'), 'utf8'));
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
