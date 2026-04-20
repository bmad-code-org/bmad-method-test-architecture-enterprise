/**
 * Installation Component Tests - TEA Module
 *
 * Tests TEA module installation components in isolation:
 * - Agent YAML structure validation
 * - Module.yaml validation
 * - Path references validation
 *
 * These are deterministic unit tests that don't require full installation.
 * Usage: node test/test-installation-components.js
 */

const path = require('node:path');
const fs = require('node:fs/promises');
const yaml = require('js-yaml');

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
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
  // Test 1: Module.yaml Structure
  // ============================================================
  console.log(`${colors.yellow}Test Suite 1: Module Configuration${colors.reset}\n`);

  try {
    const moduleYamlPath = path.join(projectRoot, 'src/module.yaml');
    const moduleYaml = yaml.load(await fs.readFile(moduleYamlPath, 'utf8'));

    assert(moduleYaml.code === 'tea', 'module.yaml has correct code: tea');
    assert(moduleYaml.name === 'Test Architect', 'module.yaml has correct name');
    assert(typeof moduleYaml.description === 'string' && moduleYaml.description.length > 0, 'module.yaml has description');
    assert(typeof moduleYaml.default_selected === 'boolean', 'module.yaml has boolean default_selected');
    assert(moduleYaml.tea_use_pactjs_utils.default === false, 'module.yaml defaults Pact.js Utils to false');
    assert(moduleYaml.tea_pact_mcp.default === 'none', 'module.yaml defaults Pact MCP to none');
    assert(
      moduleYaml.tea_use_pactjs_utils.prompt.includes('consumer-driven contract testing'),
      'module.yaml Pact.js Utils prompt explains CDC intent',
    );
    assert(
      moduleYaml.tea_pact_mcp.prompt.includes('Only needed if you already use a broker'),
      'module.yaml Pact MCP prompt explains broker prerequisite',
    );
  } catch (error) {
    assert(false, 'module.yaml loads and validates', error.message);
  }

  console.log('');

  // ============================================================
  // Test 2: TEA Agent Native Skill Structure
  // ============================================================
  console.log(`${colors.yellow}Test Suite 2: TEA Agent Native Skill Structure${colors.reset}\n`);

  try {
    const skillDir = path.join(projectRoot, 'src/agents/bmad-tea');
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
      assert(false, 'SKILL.md exists', 'src/agents/bmad-tea/SKILL.md not found');
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
        customizeContent.includes('file:{project-root}/**/project-context.md'),
        'customize.toml loads project-context.md as a persistent fact',
      );
      assert(customizeContent.includes('activation_steps_prepend'), 'customize.toml defines activation_steps_prepend');
      assert(customizeContent.includes('activation_steps_append'), 'customize.toml defines activation_steps_append');

      // Verify all 9 capability codes live on the [[agent.menu]] array-of-tables
      const expectedMenu = [
        { code: 'TMT', skill: 'bmad-teach-me-testing' },
        { code: 'TF', skill: 'bmad-testarch-framework' },
        { code: 'AT', skill: 'bmad-testarch-atdd' },
        { code: 'TA', skill: 'bmad-testarch-automate' },
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
        const workflowDir = path.join(projectRoot, `src/workflows/testarch/${skill}`);
        assert(await pathExists(workflowDir), `Capability skill ${skill} has matching workflow directory`);
      }
    } else {
      assert(false, 'customize.toml exists', 'src/agents/bmad-tea/customize.toml not found');
    }

    // module.yaml must declare the agent essence for the BMM central config roster
    const moduleYamlPath = path.join(projectRoot, 'src/module.yaml');
    const moduleYaml = yaml.load(await fs.readFile(moduleYamlPath, 'utf8'));
    assert(Array.isArray(moduleYaml.agents), 'module.yaml has agents: array');
    const teaAgentEntry = (moduleYaml.agents || []).find((entry) => entry && entry.code === 'bmad-tea');
    assert(teaAgentEntry !== undefined, 'module.yaml agents: contains bmad-tea entry');
    if (teaAgentEntry) {
      assert(teaAgentEntry.name === 'Murat', 'module.yaml bmad-tea entry has name: Murat');
      assert(teaAgentEntry.title && teaAgentEntry.title.length > 0, 'module.yaml bmad-tea entry has a title');
      assert(teaAgentEntry.icon === '🧪', 'module.yaml bmad-tea entry has icon 🧪');
      assert(teaAgentEntry.team === 'software-development', 'module.yaml bmad-tea entry has team: software-development');
      assert(
        typeof teaAgentEntry.description === 'string' && teaAgentEntry.description.length > 0,
        'module.yaml bmad-tea entry has a description',
      );
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
    const teaIndexPath = path.join(projectRoot, 'src/agents/bmad-tea/resources/tea-index.csv');
    const knowledgeDir = path.join(projectRoot, 'src/agents/bmad-tea/resources/knowledge');

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

  const teachMeWorkflowPath = path.join(projectRoot, 'src/workflows/testarch/bmad-teach-me-testing/workflow.md');
  try {
    if (await pathExists(teachMeWorkflowPath)) {
      const teachMeContent = await fs.readFile(teachMeWorkflowPath, 'utf8');
      assert(teachMeContent.length > 0, 'bmad-teach-me-testing/workflow.md exists');
      assert(!teachMeContent.includes('_bmad/bmm/'), 'bmad-teach-me-testing has no _bmad/bmm/ references');
    } else {
      assert(false, 'bmad-teach-me-testing workflow exists', 'src/workflows/testarch/bmad-teach-me-testing/workflow.md not found');
    }
  } catch (error) {
    assert(false, 'teach-me-testing workflow validates', error.message);
  }

  const workflowDirs = {
    'bmad-testarch-framework': 'framework',
    'bmad-testarch-ci': 'ci',
    'bmad-testarch-test-design': 'test-design',
    'bmad-testarch-atdd': 'atdd',
    'bmad-testarch-automate': 'automate',
    'bmad-testarch-test-review': 'test-review',
    'bmad-testarch-nfr': 'nfr-assess',
    'bmad-testarch-trace': 'trace',
  };

  for (const [dirName, displayName] of Object.entries(workflowDirs)) {
    const workflowYamlPath = path.join(projectRoot, `src/workflows/testarch/${dirName}/workflow.yaml`);

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
  }

  const frameworkScaffoldStepPath = path.join(
    projectRoot,
    'src/workflows/testarch/bmad-testarch-framework/steps-c/step-03-scaffold-framework.md',
  );
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
