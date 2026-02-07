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
const fs = require('fs-extra');
const yaml = require('js-yaml');

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
  // Test 2: TEA Agent YAML Structure
  // ============================================================
  console.log(`${colors.yellow}Test Suite 2: TEA Agent Structure${colors.reset}\n`);

  try {
    const teaAgentPath = path.join(projectRoot, 'src/agents/tea.agent.yaml');

    if (await fs.pathExists(teaAgentPath)) {
      const teaAgent = yaml.load(await fs.readFile(teaAgentPath, 'utf8'));

      assert(teaAgent.agent !== undefined, 'tea.agent.yaml has agent root key');
      assert(teaAgent.agent.metadata !== undefined, 'TEA agent has metadata section');
      assert(teaAgent.agent.metadata.module === 'tea', 'TEA agent metadata has module: tea');
      assert(teaAgent.agent.metadata.id.includes('_bmad/tea/'), 'TEA agent id references _bmad/tea/ path');
      assert(teaAgent.agent.persona !== undefined, 'TEA agent has persona section');
      assert(teaAgent.agent.critical_actions !== undefined, 'TEA agent has critical_actions');
      assert(teaAgent.agent.menu !== undefined, 'TEA agent has menu');
      assert(Array.isArray(teaAgent.agent.menu) && teaAgent.agent.menu.length === 9, 'TEA agent menu has 9 workflows');

      // Verify no BMM references
      const yamlContent = await fs.readFile(teaAgentPath, 'utf8');
      assert(!yamlContent.includes('_bmad/bmm/'), 'TEA agent has no _bmad/bmm/ references');
      assert(!yamlContent.includes('module: bmm'), 'TEA agent has no module: bmm references');
    } else {
      assert(false, 'TEA agent YAML exists', 'src/agents/tea.agent.yaml not found - run Phase 2 first');
    }
  } catch (error) {
    assert(false, 'TEA agent structure validates', error.message);
  }

  console.log('');

  // ============================================================
  // Test 3: Knowledge Base Structure
  // ============================================================
  console.log(`${colors.yellow}Test Suite 3: Knowledge Base${colors.reset}\n`);

  try {
    const teaIndexPath = path.join(projectRoot, 'src/testarch/tea-index.csv');

    if (await fs.pathExists(teaIndexPath)) {
      const csvContent = await fs.readFile(teaIndexPath, 'utf8');
      const lines = csvContent.trim().split('\n');

      assert(lines.length === 36, 'tea-index.csv has 36 lines (header + 35 fragments)', `Found ${lines.length} lines`);
      assert(lines[0].includes('id,name,description,tags,fragment_file'), 'tea-index.csv has correct header format');

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

  const teachMeWorkflowPath = path.join(projectRoot, 'src/workflows/testarch/teach-me-testing/workflow.md');
  try {
    if (await fs.pathExists(teachMeWorkflowPath)) {
      const teachMeContent = await fs.readFile(teachMeWorkflowPath, 'utf8');
      assert(teachMeContent.length > 0, 'teach-me-testing/workflow.md exists');
      assert(!teachMeContent.includes('_bmad/bmm/'), 'teach-me-testing has no _bmad/bmm/ references');
    } else {
      assert(false, 'teach-me-testing workflow exists', 'src/workflows/testarch/teach-me-testing/workflow.md not found');
    }
  } catch (error) {
    assert(false, 'teach-me-testing workflow validates', error.message);
  }

  const workflowNames = ['framework', 'ci', 'test-design', 'atdd', 'automate', 'test-review', 'nfr-assess', 'trace'];

  for (const workflowName of workflowNames) {
    const workflowYamlPath = path.join(projectRoot, `src/workflows/testarch/${workflowName}/workflow.yaml`);

    if (await fs.pathExists(workflowYamlPath)) {
      try {
        const workflowYaml = yaml.load(await fs.readFile(workflowYamlPath, 'utf8'));
        assert(workflowYaml !== undefined, `${workflowName}/workflow.yaml is valid YAML`);

        // Verify no BMM references
        const yamlContent = await fs.readFile(workflowYamlPath, 'utf8');
        assert(!yamlContent.includes('_bmad/bmm/'), `${workflowName} has no _bmad/bmm/ references`);
      } catch (error) {
        assert(false, `${workflowName}/workflow.yaml validates`, error.message);
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
