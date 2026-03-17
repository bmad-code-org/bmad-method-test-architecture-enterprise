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
  } catch (error) {
    assert(false, 'module.yaml loads and validates', error.message);
  }

  console.log('');

  // ============================================================
  // Test 2: TEA Agent Native Skill Structure
  // ============================================================
  console.log(`${colors.yellow}Test Suite 2: TEA Agent Native Skill Structure${colors.reset}\n`);

  try {
    const skillDir = path.join(projectRoot, 'src/agents/tea-agent-testarch');
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    const manifestPath = path.join(skillDir, 'bmad-skill-manifest.yaml');

    // Validate SKILL.md exists and has required sections
    if (await pathExists(skillMdPath)) {
      const skillContent = await fs.readFile(skillMdPath, 'utf8');

      assert(skillContent.includes('name: tea-agent-testarch'), 'SKILL.md has correct skill name in frontmatter');
      assert(skillContent.includes('## Identity'), 'SKILL.md has Identity section');
      assert(skillContent.includes('## Principles'), 'SKILL.md has Principles section');
      assert(skillContent.includes('## Critical Actions'), 'SKILL.md has Critical Actions section');
      assert(skillContent.includes('## Capabilities'), 'SKILL.md has Capabilities section');
      assert(skillContent.includes('## On Activation'), 'SKILL.md has On Activation section');

      // Verify all 9 capability codes are present in the capabilities table
      const capabilityCodes = ['TMT', 'TF', 'AT', 'TA', 'TD', 'TR', 'NR', 'CI', 'RV'];
      for (const code of capabilityCodes) {
        const codePattern = new RegExp(`\\|\\s*${code}\\s*\\|`);
        assert(codePattern.test(skillContent), `SKILL.md has capability code ${code}`);
      }

      // Verify no BMM references
      assert(!skillContent.includes('_bmad/bmm/'), 'SKILL.md has no _bmad/bmm/ references');
      assert(!skillContent.includes('module: bmm'), 'SKILL.md has no module: bmm references');
    } else {
      assert(false, 'SKILL.md exists', 'src/agents/tea-agent-testarch/SKILL.md not found');
    }

    // Validate bmad-skill-manifest.yaml
    if (await pathExists(manifestPath)) {
      const manifest = yaml.load(await fs.readFile(manifestPath, 'utf8'));

      assert(manifest.type === 'agent', 'Manifest has type: agent');
      assert(manifest.name === 'tea-agent-testarch', 'Manifest has correct name');
      assert(manifest.module === 'tea', 'Manifest has module: tea');
      assert(manifest.canonicalId === 'tea-agent-testarch', 'Manifest has correct canonicalId');
      assert(manifest.webskip === true, 'Manifest has webskip: true');
      assert(manifest.hasSidecar === false, 'Manifest has hasSidecar: false');

      // Verify all 9 capability skill IDs reference real workflow directories
      const expectedSkillDirs = [
        'bmad-teach-me-testing',
        'bmad-testarch-framework',
        'bmad-testarch-atdd',
        'bmad-testarch-automate',
        'bmad-testarch-test-design',
        'bmad-testarch-trace',
        'bmad-testarch-nfr',
        'bmad-testarch-ci',
        'bmad-testarch-test-review',
      ];
      for (const skillDir of expectedSkillDirs) {
        const workflowDir = path.join(projectRoot, `src/workflows/testarch/${skillDir}`);
        assert(await pathExists(workflowDir), `Capability skill ${skillDir} has matching workflow directory`);
      }
    } else {
      assert(false, 'bmad-skill-manifest.yaml exists', 'src/agents/tea-agent-testarch/bmad-skill-manifest.yaml not found');
    }
  } catch (error) {
    assert(false, 'TEA agent native skill structure validates', error.message);
  }

  console.log('');

  // ============================================================
  // Test 3: Knowledge Base Structure
  // ============================================================
  console.log(`${colors.yellow}Test Suite 3: Knowledge Base${colors.reset}\n`);

  try {
    const teaIndexPath = path.join(projectRoot, 'src/testarch/tea-index.csv');

    if (await pathExists(teaIndexPath)) {
      const csvContent = await fs.readFile(teaIndexPath, 'utf8');
      const lines = csvContent.trim().split('\n');

      assert(lines.length === 43, 'tea-index.csv has 43 lines (header + 42 fragments)', `Found ${lines.length} lines`);
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
