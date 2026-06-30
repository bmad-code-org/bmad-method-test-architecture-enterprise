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
const vm = require('node:vm');
const { parse } = require('csv-parse/sync');
const yaml = require('js-yaml');

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

function extractJavaScriptBlockAfter(content, marker) {
  const markerIndex = content.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Marker not found: ${marker}`);
  }

  const match = content.slice(markerIndex).match(/```javascript\r?\n([\s\S]*?)```/);
  if (!match) {
    throw new Error(`JavaScript block not found after marker: ${marker}`);
  }

  return match[1];
}

function evaluateStep03cSummary(step03cContent, overrides = {}) {
  const code = extractJavaScriptBlockAfter(step03cContent, '**Aggregate test counts');
  const sandbox = {
    apiTestsOutput: overrides.apiTestsOutput,
    e2eTestsOutput: overrides.e2eTestsOutput,
    backendTestsOutput: overrides.backendTestsOutput,
    writtenGeneratedTestFiles: overrides.writtenGeneratedTestFiles,
    uniqueFixtures: overrides.uniqueFixtures || [],
    workerReadConcerns: overrides.workerReadConcerns || [],
    fileWriteConcerns: overrides.fileWriteConcerns || [],
    subagentContext: overrides.subagentContext || { execution: { resolvedMode: 'subagent' } },
  };

  vm.createContext(sandbox);
  vm.runInContext(`${code}\nglobalThis.__summary = summary;`, sandbox, { timeout: 1000 });
  return sandbox.__summary;
}

function evaluateStep03cWrite(step03cContent, overrides = {}) {
  const code = extractJavaScriptBlockAfter(step03cContent, '**Write API test files');
  const writes = [];
  const mkdirs = [];
  const sandbox = {
    apiTestsOutput: overrides.apiTestsOutput || { success: true, tests: [] },
    writes,
    mkdirs,
    fs: {
      mkdirSync: (file, options) => mkdirs.push({ file, options }),
      writeFileSync: (file, content, encoding) => {
        if (overrides.writeError) {
          throw new Error(overrides.writeError);
        }

        writes.push({ file, content, encoding });
      },
    },
    console: {
      log: () => {},
    },
  };

  if ('projectRoot' in overrides) {
    sandbox.project_root = overrides.projectRoot;
  }

  if ('testDir' in overrides) {
    sandbox.test_dir = overrides.testDir;
  }

  vm.createContext(sandbox);
  vm.runInContext(`${code}\nglobalThis.__result = { writes, mkdirs, fileWriteConcerns, writtenGeneratedTestFiles };`, sandbox, {
    timeout: 1000,
  });
  return sandbox.__result;
}

function evaluateStep04Evidence(step04Content, options = {}) {
  let code = extractJavaScriptBlockAfter(step04Content, 'Read the Step 3C summary seed:');
  const resolveOutputFile = options.resolvePlaceholders !== false && options.resolveOutputFile !== false;
  const resolveTaEvidenceOutput = options.resolvePlaceholders !== false && options.resolveTaEvidenceOutput !== false;
  const resolvedOutputFile = options.outputFile || '_bmad-output/test-artifacts/automation-summary.md';
  const resolvedTaEvidenceOutput = options.taEvidenceOutput || '_bmad-output/test-artifacts/tea-ta.evidence.json';

  if (resolveOutputFile) {
    code = code.replaceAll('{outputFile}', resolvedOutputFile);
  }

  if (resolveTaEvidenceOutput) {
    code = code.replaceAll('{ta_evidence_output}', resolvedTaEvidenceOutput);
  }

  const writes = [];
  const mkdirs = [];
  const reads = [];
  const expectedReadPath = options.expectedReadPath || '{test_artifacts}/tea-automate-summary-{{timestamp}}.json';
  const expectedWritePath = options.expectedWritePath || (resolveTaEvidenceOutput ? resolvedTaEvidenceOutput : '{ta_evidence_output}');
  const sandbox = {
    fs: {
      readFileSync: (file) => {
        reads.push(file);
        if (options.readError) {
          throw new Error(options.readError);
        }

        return 'rawSummary' in options ? options.rawSummary : JSON.stringify(options.summary);
      },
      mkdirSync: (file, options_) => mkdirs.push({ file, options: options_ }),
      writeFileSync: (file, content) => writes.push({ file, content }),
    },
  };

  if ('storyFile' in options) {
    sandbox.story_file = options.storyFile;
  }

  if ('automationRound' in options) {
    sandbox.automation_round = options.automationRound;
  }

  if ('projectRoot' in options) {
    sandbox.project_root = options.projectRoot;
  }

  if ('testDir' in options) {
    sandbox.test_dir = options.testDir;
  }

  vm.createContext(sandbox);
  let thrownError;
  try {
    vm.runInContext(code, sandbox, { timeout: 1000 });
  } catch (error) {
    thrownError = error;
  }

  if (reads.length !== 1 || reads[0] !== expectedReadPath) {
    throw new Error(`Expected evidence seed read from ${expectedReadPath}, got ${reads.join(', ') || '<none>'}`);
  }

  if (options.expectedErrorMessage) {
    if (!thrownError) {
      throw new Error(`Expected evidence writer to throw: ${options.expectedErrorMessage}`);
    }

    if (!thrownError.message.includes(options.expectedErrorMessage)) {
      throw new Error(`Expected thrown message to include ${options.expectedErrorMessage}, got ${thrownError.message}`);
    }

    if (writes.length > 0) {
      throw new Error('Expected no evidence write after fatal validation error');
    }

    return { error: thrownError, reads, writes, mkdirs };
  }

  if (thrownError) {
    throw thrownError;
  }

  if (writes.length !== 1) {
    throw new Error(`Expected one evidence write, got ${writes.length}`);
  }

  if (writes[0].file !== expectedWritePath) {
    throw new Error(`Expected evidence write to ${expectedWritePath}, got ${writes[0].file}`);
  }

  if (expectedWritePath.includes('/') && mkdirs.length === 0) {
    throw new Error('Expected evidence output directory to be created before write');
  }

  return JSON.parse(writes[0].content);
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
    const workflowDir = path.join(projectRoot, `src/workflows/testarch/${dirName}`);
    const skillMdPath = path.join(projectRoot, `src/workflows/testarch/${dirName}/SKILL.md`);
    const customizeTomlPath = path.join(projectRoot, `src/workflows/testarch/${dirName}/customize.toml`);
    const workflowYamlPath = path.join(projectRoot, `src/workflows/testarch/${dirName}/workflow.yaml`);
    const instructionsMdPath = path.join(projectRoot, `src/workflows/testarch/${dirName}/instructions.md`);
    let workflowKnowledgeIndexValidated = false;

    if (await pathExists(skillMdPath)) {
      try {
        const skillContent = await fs.readFile(skillMdPath, 'utf8');
        assert(skillContent && skillContent.trim().length > 0, `${dirName}/SKILL.md is not empty`);
        assert(skillContent.includes('## On Activation'), `${dirName}/SKILL.md has On Activation section`);
        assert(
          skillContent.includes('resolve_customization.py --skill {skill-root} --key workflow'),
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
      assert(false, `${dirName}/SKILL.md exists`, `src/workflows/testarch/${dirName}/SKILL.md not found`);
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
          customizeContent.includes('file:{project-root}/**/project-context.md'),
          `${dirName}/customize.toml loads project-context.md as a persistent fact`,
        );
      } catch (error) {
        assert(false, `${dirName}/customize.toml validates`, error.message);
      }
    } else {
      assert(false, `${dirName}/customize.toml exists`, `src/workflows/testarch/${dirName}/customize.toml not found`);
    }

    // workflow.md was folded into SKILL.md and removed (PR: workflow customization rollout).
    const legacyWorkflowMdPath = path.join(projectRoot, `src/workflows/testarch/${dirName}/workflow.md`);
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
      const stepDirPath = path.join(projectRoot, `src/workflows/testarch/${dirName}/${stepDir}`);
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

          if (frontmatter.includes('knowledgeIndex:')) {
            const knowledgeIndexMatch = frontmatter.match(/^knowledgeIndex:\s*['"]([^'"]+)['"]/m);
            assert(Boolean(knowledgeIndexMatch), `${stepLabel} declares a parseable knowledgeIndex`);

            const knowledgeIndexReference = knowledgeIndexMatch ? knowledgeIndexMatch[1] : '';
            const knowledgeIndexPath = path.resolve(workflowDir, knowledgeIndexReference);
            const expectedKnowledgeIndexPath = path.join(workflowDir, 'resources', 'tea-index.csv');

            assert(knowledgeIndexPath === expectedKnowledgeIndexPath, `${stepLabel} uses the workflow-local knowledge index`);
            assert(await pathExists(knowledgeIndexPath), `${stepLabel} knowledgeIndex target exists`);

            if (!workflowKnowledgeIndexValidated && (await pathExists(knowledgeIndexPath))) {
              const records = parse(await fs.readFile(knowledgeIndexPath, 'utf8'), { columns: true, skip_empty_lines: true });
              const workflowKnowledgeDir = path.join(path.dirname(knowledgeIndexPath), 'knowledge');
              const workflowKnowledgeFiles = (await fs.readdir(workflowKnowledgeDir)).filter((name) => name.endsWith('.md'));
              const missingFragments = [];

              for (const record of records) {
                if (!record.fragment_file) {
                  missingFragments.push(`${record.id || '<missing-id>'}: missing fragment_file`);
                  continue;
                }

                const fragmentPath = path.resolve(path.dirname(knowledgeIndexPath), record.fragment_file);
                if (!(await pathExists(fragmentPath))) {
                  missingFragments.push(record.fragment_file);
                }
              }

              assert(
                records.length === workflowKnowledgeFiles.length,
                `${dirName}/resources/tea-index.csv line count matches workflow-local fragments`,
                `Found ${records.length} records for ${workflowKnowledgeFiles.length} fragments`,
              );
              assert(missingFragments.length === 0, `${dirName}/resources/tea-index.csv fragment files exist`, missingFragments.join(', '));

              workflowKnowledgeIndexValidated = true;
            }
          }
        } catch (error) {
          assert(false, `${dirName}/${stepDir}/${fileName} validates`, error.message);
        }
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
  // Test 5: TA Structured Evidence Contract
  // ============================================================
  console.log(`${colors.yellow}Test Suite 5: TA Structured Evidence Contract${colors.reset}\n`);

  try {
    const automateDir = path.join(projectRoot, 'src/workflows/testarch/bmad-testarch-automate');
    const automateWorkflowPath = path.join(automateDir, 'workflow.yaml');
    const automateWorkflowContent = await fs.readFile(automateWorkflowPath, 'utf8');
    const automateWorkflow = yaml.load(automateWorkflowContent);
    const step03cContent = await fs.readFile(path.join(automateDir, 'steps-c/step-03c-aggregate.md'), 'utf8');
    const step04Content = await fs.readFile(path.join(automateDir, 'steps-c/step-04-validate-and-summarize.md'), 'utf8');
    const step01ValidateContent = await fs.readFile(path.join(automateDir, 'steps-v/step-01-validate.md'), 'utf8');
    const checklistContent = await fs.readFile(path.join(automateDir, 'checklist.md'), 'utf8');

    assert(
      automateWorkflow.variables?.ta_evidence_output === '{test_artifacts}/tea-ta.evidence.json',
      'automate workflow defines ta_evidence_output for tea-ta.evidence.json',
    );
    assert(
      automateWorkflow.default_output_file === '{test_artifacts}/automation-summary.md',
      'automate workflow preserves automation-summary.md as the default human report',
    );
    assert(
      automateWorkflowContent.includes('ta_evidence_output: "{test_artifacts}/tea-ta.evidence.json"'),
      'automate workflow documents the structured TA evidence path',
    );

    for (const requiredField of [
      'contract_version',
      'workflow',
      'story_ref',
      'node',
      'round',
      'gate',
      'generated_at',
      'report_file',
      'changed_tests',
      'fixture_needs',
      'quality_concerns',
      'nfr_signals',
      'coverage',
      'artifact_pointers',
    ]) {
      assert(step03cContent.includes(requiredField), `step 3C aggregates TA evidence field: ${requiredField}`);
    }

    assert(step03cContent.includes('apiTestsOutput.tests'), 'step 3C normalizes API worker tests into changed_tests');
    assert(step03cContent.includes('e2eTestsOutput.tests'), 'step 3C normalizes E2E worker tests into changed_tests');
    assert(step03cContent.includes('backendTestsOutput.testsGenerated'), 'step 3C normalizes backend worker tests into changed_tests');
    assert(step03cContent.includes('fixture_needs: uniqueFixtures'), 'step 3C preserves fixture needs in TA evidence seed data');
    assert(step04Content.includes('{ta_evidence_output}'), 'step 4 writes structured evidence to {ta_evidence_output}');
    assert(step04Content.includes('gate: "PASS"'), 'step 4 documents PASS for valid consumable evidence');
    assert(step04Content.includes('gate: "ERROR"'), 'step 4 documents ERROR for invalid or untrusted evidence');
    assert(step04Content.includes('fixture_needs: fixtureNeeds'), 'step 4 carries fixture needs into the final TA evidence envelope');
    assert(
      step01ValidateContent.includes('{ta_evidence_output}') &&
        step01ValidateContent.includes('JSON.parse') &&
        step01ValidateContent.includes('contract_version` is `1.0') &&
        step01ValidateContent.includes('generated_at') &&
        step01ValidateContent.includes('gate: "ERROR"') &&
        step01ValidateContent.includes('Each `nfr_signals` entry includes non-empty') &&
        step01ValidateContent.includes('reference the same file set') &&
        step01ValidateContent.includes('Unresolved output placeholders') &&
        step01ValidateContent.includes('PASS/WARN/ERROR') &&
        step01ValidateContent.includes('artifact_pointers'),
      'validate mode explicitly loads and schema-checks tea-ta.evidence.json',
    );
    assert(
      checklistContent.includes('tea-ta.evidence.json') &&
        checklistContent.includes('fixture_needs') &&
        checklistContent.includes('each `nfr_signals` entry includes non-empty') &&
        checklistContent.includes('`{ta_evidence_output}` is resolved') &&
        checklistContent.includes('missing or invalid structured evidence'),
      'checklist validates missing or invalid structured evidence as ERROR',
    );

    const safeGeneratedWrite = evaluateStep03cWrite(step03cContent, {
      apiTestsOutput: {
        success: true,
        tests: [{ file: 'tests/api/new/users.spec.ts', content: 'test' }],
      },
    });

    assert(
      safeGeneratedWrite.writes.length === 1 &&
        safeGeneratedWrite.writes[0].file === 'tests/api/new/users.spec.ts' &&
        safeGeneratedWrite.mkdirs.some((mkdir) => mkdir.file === 'tests/api/new') &&
        safeGeneratedWrite.writtenGeneratedTestFiles.includes('tests/api/new/users.spec.ts'),
      'step 3C safely writes generated tests inside expected boundaries',
    );

    const canonicalGeneratedWrite = evaluateStep03cWrite(step03cContent, {
      apiTestsOutput: {
        success: true,
        tests: [{ file: String.raw`./tests\api/./new/users.spec.ts`, content: 'test' }],
      },
    });

    assert(
      canonicalGeneratedWrite.writes.length === 1 &&
        canonicalGeneratedWrite.writes[0].file === 'tests/api/new/users.spec.ts' &&
        canonicalGeneratedWrite.writtenGeneratedTestFiles.includes('tests/api/new/users.spec.ts'),
      'step 3C canonicalizes generated test write paths before recording evidence',
    );

    const absoluteGeneratedWrite = evaluateStep03cWrite(step03cContent, {
      apiTestsOutput: {
        success: true,
        tests: [{ file: '/repo/tests/api/absolute.spec.ts', content: 'test' }],
      },
      projectRoot: '/repo',
      testDir: '/repo/tests',
    });

    assert(
      absoluteGeneratedWrite.writes.length === 1 &&
        absoluteGeneratedWrite.writes[0].file === 'tests/api/absolute.spec.ts' &&
        absoluteGeneratedWrite.writtenGeneratedTestFiles.includes('tests/api/absolute.spec.ts'),
      'step 3C converts absolute project test paths to canonical artifact paths before writing',
    );

    const duplicateGeneratedWrite = evaluateStep03cWrite(step03cContent, {
      apiTestsOutput: {
        success: true,
        tests: [
          { file: 'tests/api/duplicate.spec.ts', content: 'first' },
          { file: './tests/api/duplicate.spec.ts', content: 'second' },
        ],
      },
    });

    assert(
      duplicateGeneratedWrite.writes.length === 1 &&
        duplicateGeneratedWrite.writes[0].content === 'first' &&
        duplicateGeneratedWrite.fileWriteConcerns.some((concern) => concern.message.includes('duplicates another worker output')),
      'step 3C rejects duplicate generated test paths before overwriting content',
    );

    const escapedGeneratedWrite = evaluateStep03cWrite(step03cContent, {
      apiTestsOutput: {
        success: true,
        tests: [{ file: '../outside.spec.ts', content: 'test' }],
      },
    });

    assert(
      escapedGeneratedWrite.writes.length === 0 &&
        escapedGeneratedWrite.fileWriteConcerns.some((concern) => concern.category === 'worker-output-path'),
      'step 3C rejects generated test paths outside expected boundaries before writing',
    );

    const failedGeneratedWrite = evaluateStep03cWrite(step03cContent, {
      apiTestsOutput: {
        success: true,
        tests: [{ file: 'tests/api/users.spec.ts', content: 'test' }],
      },
      writeError: 'disk full',
    });

    assert(
      failedGeneratedWrite.writes.length === 0 &&
        failedGeneratedWrite.writtenGeneratedTestFiles.length === 0 &&
        failedGeneratedWrite.fileWriteConcerns.some(
          (concern) => concern.category === 'worker-output-write' && concern.message.includes('disk full'),
        ),
      'step 3C records generated-test write errors as quality concerns',
    );

    const aggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: {
        success: true,
        test_count: 1,
        tests: [
          {
            file: 'tests/api/users.spec.ts',
            description: 'API user behavior',
            priority_coverage: { P0: 1, P1: '2' },
          },
        ],
        fixture_needs: [],
        knowledge_fragments_used: [],
        provider_scrutiny: 'pending',
        quality_concerns: [{ category: 'worker-quality', severity: 'warn', source: 'spoofed-source', message: 'Needs review' }],
      },
      e2eTestsOutput: {
        success: true,
        test_count: 1,
        tests: [
          {
            file: 'tests/e2e/users.spec.ts',
            description: 'E2E user behavior',
            priority_coverage: { P2: 1 },
          },
        ],
        fixture_needs: [],
        knowledge_fragments_used: [],
      },
      backendTestsOutput: {
        success: true,
        status: 'complete',
        testsGenerated: [
          {
            file: 'tests/backend/users.test.ts',
            description: 'Backend user behavior',
            priority_coverage: { P3: 1 },
            nfr_signals: [{ category: null, source: null, evidence: null, file: 'tests/backend/users.test.ts' }],
          },
        ],
        coverageSummary: {
          totalTests: 1,
          nfrSignals: [null, { nfr_category: 'security', evidence_pointer: 'tests/backend/users.test.ts' }],
        },
        knowledge_fragments_used: [],
      },
      uniqueFixtures: ['authToken', 'paymentMockFixture'],
    });

    assert(
      aggregateSummary.priority_coverage.P0 === 1 &&
        aggregateSummary.priority_coverage.P1 === 2 &&
        aggregateSummary.priority_coverage.P2 === 1 &&
        aggregateSummary.priority_coverage.P3 === 1,
      'step 3C aggregates priority coverage from per-test worker records',
    );
    assert(
      aggregateSummary.ta_evidence_data.quality_concerns.some(
        (concern) => concern.category === 'provider-scrutiny' && concern.source === 'api-tests',
      ),
      'step 3C records pending provider scrutiny as a quality concern',
    );
    assert(
      aggregateSummary.ta_evidence_data.fixture_needs.includes('authToken') &&
        aggregateSummary.ta_evidence_data.fixture_needs.includes('paymentMockFixture'),
      'step 3C carries concrete fixture needs into TA evidence seed data',
    );
    assert(
      aggregateSummary.ta_evidence_data.quality_concerns.some(
        (concern) => concern.category === 'worker-quality' && concern.source === 'api-tests',
      ),
      'step 3C preserves actual worker source when normalizing quality concerns',
    );
    assert(
      aggregateSummary.ta_evidence_data.nfr_signals.some(
        (signal) =>
          signal.category === 'integration boundaries' &&
          signal.source === 'backend-tests' &&
          signal.original_source === null &&
          signal.evidence === 'tests/backend/users.test.ts',
      ),
      'step 3C preserves NFR signal defaults while owning worker source attribution',
    );

    const partialPriorityAggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: {
        success: true,
        test_count: 1,
        priority_coverage: { P0: 1 },
        tests: [
          {
            file: 'tests/api/partial.spec.ts',
            description: 'Partial coverage behavior',
            priority_coverage: { P0: 1, P1: 2, P2: 3, P3: 4 },
          },
        ],
        fixture_needs: [],
        knowledge_fragments_used: [],
      },
      e2eTestsOutput: null,
      backendTestsOutput: null,
    });

    assert(
      partialPriorityAggregateSummary.priority_coverage.P0 === 1 &&
        partialPriorityAggregateSummary.priority_coverage.P1 === 2 &&
        partialPriorityAggregateSummary.priority_coverage.P2 === 3 &&
        partialPriorityAggregateSummary.priority_coverage.P3 === 4,
      'step 3C fills partial top-level priority coverage from per-test coverage',
    );

    const malformedAggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: {
        success: true,
        test_count: 'not-a-number',
        tests: null,
        fixture_needs: [],
        knowledge_fragments_used: null,
      },
      e2eTestsOutput: {
        success: true,
        test_count: 1,
        tests: 'not-an-array',
        fixture_needs: [],
        knowledge_fragments_used: [],
      },
      backendTestsOutput: {
        success: true,
        status: 'complete',
        testsGenerated: { file: 'tests/backend/bad.test.ts' },
        coverageSummary: { totalTests: 'not-a-number' },
        knowledge_fragments_used: [],
      },
    });

    assert(
      malformedAggregateSummary.ta_evidence_data.quality_concerns.filter((concern) => concern.category === 'worker-output-shape').length ===
        3,
      'step 3C reports malformed worker arrays as quality concerns',
    );

    const malformedFixtureAggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: {
        success: true,
        test_count: 0,
        tests: [],
        fixture_needs: 'authToken',
        knowledge_fragments_used: [],
      },
      e2eTestsOutput: null,
      backendTestsOutput: null,
    });

    assert(
      malformedFixtureAggregateSummary.ta_evidence_data.quality_concerns.some((concern) =>
        concern.message.includes('fixture_needs must be an array'),
      ),
      'step 3C reports malformed fixture needs as worker-output-shape concerns',
    );

    const malformedQualityAggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: {
        success: true,
        test_count: 0,
        tests: [],
        fixture_needs: [],
        quality_concerns: 'not-an-array',
        validation_issues: { issue: 'not-an-array' },
        knowledge_fragments_used: [],
      },
      e2eTestsOutput: null,
      backendTestsOutput: null,
    });

    assert(
      malformedQualityAggregateSummary.ta_evidence_data.quality_concerns.some((concern) =>
        concern.message.includes('quality_concerns must be an array'),
      ) &&
        malformedQualityAggregateSummary.ta_evidence_data.quality_concerns.some((concern) =>
          concern.message.includes('validation_issues must be an array'),
        ),
      'step 3C reports malformed quality concern and validation issue arrays',
    );

    const nonObjectApiAggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: 'not-an-object',
      e2eTestsOutput: null,
      backendTestsOutput: null,
    });

    assert(
      nonObjectApiAggregateSummary.ta_evidence_data.quality_concerns.some(
        (concern) => concern.category === 'worker-output-shape' && concern.source === 'api-tests',
      ),
      'step 3C handles missing or non-object API worker output without crashing',
    );

    const failedWorkerAggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: {
        success: false,
        test_count: 1,
        tests: [
          {
            file: 'tests/api/failed.spec.ts',
            description: 'Failed worker output must not be trusted',
            priority_coverage: { P0: 1, P1: 0, P2: 0, P3: 0 },
          },
        ],
        fixture_needs: [],
        knowledge_fragments_used: [],
      },
      e2eTestsOutput: null,
      backendTestsOutput: null,
    });

    assert(
      failedWorkerAggregateSummary.ta_evidence_data.quality_concerns.some(
        (concern) => concern.category === 'worker-status' && concern.severity === 'error' && concern.source === 'api-tests',
      ) &&
        failedWorkerAggregateSummary.ta_evidence_data.changed_tests.length === 0 &&
        failedWorkerAggregateSummary.ta_evidence_data.artifact_pointers.generated_test_files.length === 0 &&
        failedWorkerAggregateSummary.total_tests === 0 &&
        failedWorkerAggregateSummary.api_tests === 0,
      'step 3C records success:false worker output and excludes its generated tests',
    );

    const missingSuccessAggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: {
        test_count: 1,
        tests: [
          {
            file: 'tests/api/missing-success.spec.ts',
            description: 'Missing success must not be trusted',
            priority_coverage: { P0: 1, P1: 0, P2: 0, P3: 0 },
          },
        ],
        fixture_needs: ['authToken'],
        nfr_signals: [{ category: 'security', evidence: 'tests/api/missing-success.spec.ts' }],
        knowledge_fragments_used: ['api-fragment'],
      },
      e2eTestsOutput: null,
      backendTestsOutput: null,
      writtenGeneratedTestFiles: ['tests/api/missing-success.spec.ts'],
    });

    assert(
      missingSuccessAggregateSummary.ta_evidence_data.quality_concerns.some(
        (concern) => concern.category === 'worker-status' && concern.severity === 'error',
      ) &&
        missingSuccessAggregateSummary.ta_evidence_data.changed_tests.length === 0 &&
        missingSuccessAggregateSummary.ta_evidence_data.fixture_needs.length === 0 &&
        missingSuccessAggregateSummary.ta_evidence_data.nfr_signals.length === 0 &&
        missingSuccessAggregateSummary.knowledge_fragments_used.length === 0,
      'step 3C treats missing success:true as untrusted worker evidence',
    );

    const failedStatusAggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: {
        success: true,
        status: ' failed ',
        test_count: 1,
        priority_coverage: { P0: 1, P1: 1, P2: 1, P3: 1 },
        tests: [
          {
            file: 'tests/api/failed-status.spec.ts',
            description: 'Failed status must not be trusted',
            priority_coverage: { P0: 1, P1: 0, P2: 0, P3: 0 },
          },
        ],
        fixture_needs: ['authToken'],
        nfr_signals: [{ category: 'security', evidence: 'tests/api/failed-status.spec.ts' }],
        knowledge_fragments_used: ['api-fragment'],
      },
      e2eTestsOutput: null,
      backendTestsOutput: null,
      writtenGeneratedTestFiles: ['tests/api/failed-status.spec.ts'],
    });

    assert(
      failedStatusAggregateSummary.ta_evidence_data.quality_concerns.some(
        (concern) => concern.category === 'worker-status' && concern.severity === 'error' && String(concern.message).includes('failed'),
      ) &&
        failedStatusAggregateSummary.ta_evidence_data.changed_tests.length === 0 &&
        failedStatusAggregateSummary.ta_evidence_data.fixture_needs.length === 0 &&
        failedStatusAggregateSummary.ta_evidence_data.nfr_signals.length === 0 &&
        failedStatusAggregateSummary.priority_coverage.P0 === 0,
      'step 3C treats explicit failed worker status as untrusted evidence',
    );

    const canonicalFilteredAggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: {
        success: true,
        test_count: 1,
        tests: [
          {
            file: String.raw`./tests\api/./canonical.spec.ts`,
            description: 'Canonical path behavior',
            priority_coverage: { P0: 1, P1: 0, P2: 0, P3: 0 },
          },
        ],
        fixture_needs: [],
        knowledge_fragments_used: [],
      },
      e2eTestsOutput: null,
      backendTestsOutput: null,
      writtenGeneratedTestFiles: ['tests/api/canonical.spec.ts'],
    });

    assert(
      canonicalFilteredAggregateSummary.ta_evidence_data.changed_tests.length === 1 &&
        canonicalFilteredAggregateSummary.ta_evidence_data.changed_tests[0].file === 'tests/api/canonical.spec.ts' &&
        canonicalFilteredAggregateSummary.ta_evidence_data.artifact_pointers.generated_test_files[0] === 'tests/api/canonical.spec.ts',
      'step 3C filters changed-test evidence by canonical generated artifact paths',
    );

    const skippedWriteAggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: {
        success: true,
        test_count: 1,
        tests: [
          {
            file: 'tests/api/skipped.spec.ts',
            description: 'Skipped write output must not be trusted',
            priority_coverage: { P0: 1, P1: 0, P2: 0, P3: 0 },
          },
        ],
        fixture_needs: [],
        knowledge_fragments_used: [],
      },
      e2eTestsOutput: null,
      backendTestsOutput: null,
      writtenGeneratedTestFiles: [],
      fileWriteConcerns: [
        {
          category: 'worker-output-path',
          severity: 'error',
          source: 'api-tests',
          message: 'Generated test file path must stay within the expected generated-test boundary',
        },
      ],
    });

    assert(
      skippedWriteAggregateSummary.ta_evidence_data.changed_tests.length === 0 &&
        skippedWriteAggregateSummary.ta_evidence_data.artifact_pointers.generated_test_files.length === 0 &&
        skippedWriteAggregateSummary.ta_evidence_data.quality_concerns.some((concern) => concern.category === 'worker-output-path'),
      'step 3C excludes skipped generated-test writes from changed-test evidence',
    );

    const readConcernAggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: {
        success: true,
        test_count: 0,
        tests: [],
        fixture_needs: [],
        knowledge_fragments_used: [],
      },
      e2eTestsOutput: null,
      backendTestsOutput: null,
      workerReadConcerns: [{ category: 'worker-output-read', severity: 'error', source: 'api-tests', message: 'bad json' }],
      fileWriteConcerns: [{ category: 'worker-output-shape', severity: 'error', source: 'api-tests', message: 'bad file' }],
    });

    assert(
      readConcernAggregateSummary.ta_evidence_data.quality_concerns.some((concern) => concern.message === 'bad json') &&
        readConcernAggregateSummary.ta_evidence_data.quality_concerns.some((concern) => concern.message === 'bad file'),
      'step 3C carries worker read and file-write concerns into TA evidence seed data',
    );

    const malformedValueAggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: {
        success: true,
        test_count: 'not-a-number',
        tests: [
          {
            file: 'tests/api/value.spec.ts',
            description: 'Malformed worker values',
            priority_coverage: { P0: [] },
          },
        ],
        fixture_needs: [],
        knowledge_fragments_used: [],
      },
      e2eTestsOutput: null,
      backendTestsOutput: null,
      writtenGeneratedTestFiles: ['tests/api/value.spec.ts'],
    });

    assert(
      malformedValueAggregateSummary.ta_evidence_data.quality_concerns.some(
        (concern) => concern.category === 'worker-output-value' && concern.message.includes('test_count'),
      ) &&
        malformedValueAggregateSummary.ta_evidence_data.quality_concerns.some(
          (concern) => concern.category === 'worker-output-value' && concern.message.includes('priority_coverage.P0'),
        ),
      'step 3C reports malformed worker count and priority coverage values',
    );

    const nfrNullTestAggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: {
        success: true,
        test_count: 0,
        tests: [],
        fixture_needs: [],
        knowledge_fragments_used: [],
      },
      e2eTestsOutput: null,
      backendTestsOutput: {
        success: true,
        status: 'complete',
        testsGenerated: [null],
        coverageSummary: { totalTests: 0 },
        knowledge_fragments_used: [],
      },
      writtenGeneratedTestFiles: [],
    });

    assert(
      nfrNullTestAggregateSummary.ta_evidence_data.changed_tests.length === 0 &&
        nfrNullTestAggregateSummary.ta_evidence_data.quality_concerns.some((concern) =>
          concern.message.includes('test entry 0 must be an object'),
        ),
      'step 3C handles null worker test entries without crashing NFR aggregation',
    );

    const malformedNfrAggregateSummary = evaluateStep03cSummary(step03cContent, {
      apiTestsOutput: {
        success: true,
        test_count: 0,
        tests: [{ file: 'tests/api/nfr.spec.ts', description: 'NFR shape', nfr_signals: 'not-an-array' }],
        fixture_needs: [],
        nfr_signals: ['bad-signal'],
        knowledge_fragments_used: [],
      },
      e2eTestsOutput: null,
      backendTestsOutput: {
        success: true,
        status: 'complete',
        testsGenerated: [],
        coverageSummary: { totalTests: 0, nfrSignals: [null] },
        knowledge_fragments_used: [],
      },
      writtenGeneratedTestFiles: [],
    });

    assert(
      malformedNfrAggregateSummary.ta_evidence_data.quality_concerns.some((concern) => concern.message.includes('NFR signal entry')) &&
        malformedNfrAggregateSummary.ta_evidence_data.quality_concerns.some((concern) =>
          concern.message.includes('nfr_signals must be an array'),
        ),
      'step 3C reports malformed NFR signal arrays and entries as quality concerns',
    );

    const cloneJson = (value) => structuredClone(value);
    const validSummary = {
      ta_evidence_data: {
        changed_tests: [
          {
            file: 'tests/api/users.spec.ts',
            test_level: 'api',
            description: 'API user behavior',
            priority_coverage: { P0: 1, P1: 0, P2: 0, P3: 0 },
            source: 'api-tests',
          },
        ],
        fixture_needs: ['authToken'],
        quality_concerns: [],
        nfr_signals: [],
        coverage: {
          total_tests: 1,
          by_level: { api: 1, e2e: 0, backend: 0 },
          priority_coverage: { P0: 1, P1: 0, P2: 0, P3: 0 },
        },
        artifact_pointers: {
          automation_summary: 'automation-summary.md',
          generated_test_files: ['tests/api/users.spec.ts'],
        },
      },
    };

    const validEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      automationRound: '2',
      summary: cloneJson(validSummary),
    });

    assert(
      validEvidence.gate === 'PASS' &&
        validEvidence.round === 2 &&
        validEvidence.fixture_needs[0] === 'authToken' &&
        validEvidence.artifact_pointers.generated_test_files[0] === 'tests/api/users.spec.ts',
      'step 4 emits PASS evidence for complete structured input',
    );

    const numericStringPrioritySummary = cloneJson(validSummary);
    numericStringPrioritySummary.ta_evidence_data.changed_tests[0].priority_coverage = { P0: '1', P1: '0', P2: '0', P3: '0' };
    const numericStringPriorityEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: numericStringPrioritySummary,
    });

    assert(
      numericStringPriorityEvidence.gate === 'PASS' &&
        typeof numericStringPriorityEvidence.changed_tests[0].priority_coverage.P0 === 'number',
      'step 4 normalizes per-test priority coverage numeric strings before writing PASS evidence',
    );

    const missingNfrEvidenceSummary = cloneJson(validSummary);
    missingNfrEvidenceSummary.ta_evidence_data.nfr_signals = [{ category: 'security', source: 'backend-tests' }];
    const missingNfrEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: missingNfrEvidenceSummary,
    });

    assert(
      missingNfrEvidence.gate === 'ERROR' &&
        missingNfrEvidence.quality_concerns.some((concern) =>
          concern.evidence?.some((message) => message.includes('nfr_signals[0].evidence')),
        ),
      'step 4 rejects NFR signals without category, source, and evidence fields',
    );

    const crlfEvidence = evaluateStep04Evidence(step04Content.replaceAll('\n', '\r\n'), {
      storyFile: 'stories/t1.1.md',
      summary: cloneJson(validSummary),
    });

    assert(crlfEvidence.gate === 'PASS', 'test helper extracts JavaScript blocks from CRLF markdown fences');

    const missingSeedEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      readError: 'missing seed',
    });

    assert(
      missingSeedEvidence.gate === 'ERROR' &&
        missingSeedEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('missing or invalid JSON')),
        ),
      'step 4 writes ERROR evidence when the Step 3C summary seed is missing',
    );

    const emptyRawSummaryEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      rawSummary: '',
    });

    assert(
      emptyRawSummaryEvidence.gate === 'ERROR' &&
        emptyRawSummaryEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('missing or invalid JSON')),
        ),
      'step 4 writes ERROR evidence when raw Step 3C summary content is empty',
    );

    const unresolvedPlaceholderEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: cloneJson(validSummary),
      resolveOutputFile: false,
    });

    assert(
      unresolvedPlaceholderEvidence.gate === 'ERROR' &&
        unresolvedPlaceholderEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('report_file must reference automation-summary.md')),
        ),
      'step 4 rejects unresolved outputFile placeholders as invalid report pointers',
    );

    const unresolvedReportPointerSummary = cloneJson(validSummary);
    unresolvedReportPointerSummary.ta_evidence_data.artifact_pointers.automation_summary = '{test_artifacts}/automation-summary.md';
    const unresolvedReportPointerEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: unresolvedReportPointerSummary,
    });

    assert(
      unresolvedReportPointerEvidence.gate === 'ERROR' &&
        unresolvedReportPointerEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('artifact_pointers.automation_summary must be fully resolved')),
        ),
      'step 4 rejects unresolved placeholders in automation summary pointers',
    );

    const unresolvedTaEvidenceOutput = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: cloneJson(validSummary),
      resolveTaEvidenceOutput: false,
      expectedErrorMessage: 'ta_evidence_output must be resolved',
    });

    assert(
      unresolvedTaEvidenceOutput.error &&
        unresolvedTaEvidenceOutput.writes.length === 0 &&
        unresolvedTaEvidenceOutput.error.message.includes('ta_evidence_output must be resolved'),
      'step 4 refuses to write structured evidence to an unresolved ta_evidence_output placeholder',
    );

    const invalidCoverageSummary = cloneJson(validSummary);
    invalidCoverageSummary.ta_evidence_data.coverage.total_tests = -1;
    invalidCoverageSummary.ta_evidence_data.coverage.by_level.api = 1.5;
    invalidCoverageSummary.ta_evidence_data.coverage.priority_coverage.P1 = -1;
    const invalidCoverageEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: invalidCoverageSummary,
    });

    assert(
      invalidCoverageEvidence.gate === 'ERROR' &&
        invalidCoverageEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('coverage.total_tests must be a non-negative integer')),
        ) &&
        invalidCoverageEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('coverage.by_level.api must be a non-negative integer')),
        ) &&
        invalidCoverageEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('coverage.priority_coverage.P1 must be a non-negative integer')),
        ),
      'step 4 rejects negative or fractional coverage counts',
    );

    const invalidCoercedCoverageSummary = cloneJson(validSummary);
    invalidCoercedCoverageSummary.ta_evidence_data.coverage.total_tests = [];
    invalidCoercedCoverageSummary.ta_evidence_data.coverage.by_level.api = {};
    invalidCoercedCoverageSummary.ta_evidence_data.coverage.priority_coverage.P0 = true;
    const invalidCoercedCoverageEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: invalidCoercedCoverageSummary,
    });

    assert(
      invalidCoercedCoverageEvidence.gate === 'ERROR' &&
        invalidCoercedCoverageEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('coverage.total_tests must be a non-negative integer')),
        ) &&
        invalidCoercedCoverageEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('coverage.by_level.api must be a non-negative integer')),
        ) &&
        invalidCoercedCoverageEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('coverage.priority_coverage.P0 must be a non-negative integer')),
        ),
      'step 4 rejects array, object, and boolean coverage counts instead of coercing them',
    );

    const mismatchedCoverageSummary = cloneJson(validSummary);
    mismatchedCoverageSummary.ta_evidence_data.coverage.total_tests = 2;
    const mismatchedCoverageEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: mismatchedCoverageSummary,
    });

    assert(
      mismatchedCoverageEvidence.gate === 'ERROR' &&
        mismatchedCoverageEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('coverage.total_tests must equal the sum')),
        ),
      'step 4 rejects internally inconsistent coverage totals',
    );

    const invalidChangedTestSchemaSummary = cloneJson(validSummary);
    invalidChangedTestSchemaSummary.ta_evidence_data.changed_tests[0].test_level = '';
    invalidChangedTestSchemaSummary.ta_evidence_data.changed_tests[0].description = ' ';
    invalidChangedTestSchemaSummary.ta_evidence_data.changed_tests[0].source = null;
    invalidChangedTestSchemaSummary.ta_evidence_data.changed_tests[0].priority_coverage.P0 = [];
    const invalidChangedTestSchemaEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: invalidChangedTestSchemaSummary,
    });

    assert(
      invalidChangedTestSchemaEvidence.gate === 'ERROR' &&
        invalidChangedTestSchemaEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('changed_tests[0].test_level must be a non-empty string')),
        ) &&
        invalidChangedTestSchemaEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('changed_tests[0].priority_coverage.P0')),
        ),
      'step 4 validates changed_tests item schema and per-test priority coverage',
    );

    const missingFixtureNeedsSummary = cloneJson(validSummary);
    delete missingFixtureNeedsSummary.ta_evidence_data.fixture_needs;
    const missingFixtureNeedsEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: missingFixtureNeedsSummary,
    });

    assert(
      missingFixtureNeedsEvidence.gate === 'ERROR' &&
        missingFixtureNeedsEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('fixture_needs must be an array')),
        ),
      'step 4 requires fixture_needs in the structured evidence input',
    );

    const nonStringPointerSummary = cloneJson(validSummary);
    nonStringPointerSummary.ta_evidence_data.changed_tests[0].file = ['tests/api/users.spec.ts'];
    nonStringPointerSummary.ta_evidence_data.artifact_pointers.generated_test_files = [['tests/api/users.spec.ts']];
    const nonStringPointerEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: nonStringPointerSummary,
    });

    assert(
      nonStringPointerEvidence.gate === 'ERROR' &&
        nonStringPointerEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('changed_tests entries must include file pointers')),
        ) &&
        nonStringPointerEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) =>
            message.includes('artifact_pointers.generated_test_files must not contain blank file pointers'),
          ),
        ),
      'step 4 rejects non-string evidence pointers before path normalization',
    );

    const invalidGeneratedPointersSummary = cloneJson(validSummary);
    invalidGeneratedPointersSummary.ta_evidence_data.artifact_pointers.generated_test_files = [
      'tests/api/users.spec.ts',
      '',
      'tests/api/users.spec.ts',
    ];
    const invalidGeneratedPointersEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: invalidGeneratedPointersSummary,
    });

    assert(
      invalidGeneratedPointersEvidence.gate === 'ERROR' &&
        invalidGeneratedPointersEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) =>
            message.includes('artifact_pointers.generated_test_files must not contain blank file pointers'),
          ),
        ) &&
        invalidGeneratedPointersEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) =>
            message.includes('artifact_pointers.generated_test_files must not contain duplicate file pointers'),
          ),
        ),
      'step 4 rejects blank or duplicate generated test file pointers',
    );

    const escapedPathSummary = cloneJson(validSummary);
    escapedPathSummary.ta_evidence_data.changed_tests[0].file = '../outside.spec.ts';
    escapedPathSummary.ta_evidence_data.artifact_pointers.generated_test_files = ['../outside.spec.ts'];
    const escapedPathEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: escapedPathSummary,
    });

    assert(
      escapedPathEvidence.gate === 'ERROR' &&
        escapedPathEvidence.quality_concerns.some((concern) => concern.evidence.some((message) => message.includes('path boundary'))),
      'step 4 rejects generated test file pointers outside tests/',
    );

    const pactPathSummary = cloneJson(validSummary);
    pactPathSummary.ta_evidence_data.changed_tests[0].file = 'pact/http/consumer/users.pact.test.ts';
    pactPathSummary.ta_evidence_data.changed_tests[0].test_level = 'contract';
    pactPathSummary.ta_evidence_data.artifact_pointers.generated_test_files = ['pact/http/consumer/users.pact.test.ts'];
    const pactPathEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: pactPathSummary,
    });

    assert(pactPathEvidence.gate === 'PASS', 'step 4 allows Pact generated-test artifact paths');

    const configuredTestDirSummary = cloneJson(validSummary);
    configuredTestDirSummary.ta_evidence_data.changed_tests[0].file = '/repo/generated-tests/api/users.spec.ts';
    configuredTestDirSummary.ta_evidence_data.artifact_pointers.generated_test_files = ['/repo/generated-tests/api/users.spec.ts'];
    const configuredTestDirEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: configuredTestDirSummary,
      projectRoot: '/repo',
      testDir: '/repo/generated-tests',
    });

    assert(
      configuredTestDirEvidence.gate === 'PASS' &&
        configuredTestDirEvidence.changed_tests[0].file === 'tests/api/users.spec.ts' &&
        configuredTestDirEvidence.artifact_pointers.generated_test_files[0] === 'tests/api/users.spec.ts',
      'step 4 canonicalizes generated tests inside the configured test directory',
    );

    const errorQualityConcernSummary = cloneJson(validSummary);
    errorQualityConcernSummary.ta_evidence_data.quality_concerns = [
      { category: 'worker-status', severity: ' error ', source: 'api-tests', message: 'Worker output failed validation' },
    ];
    const errorQualityConcernEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: errorQualityConcernSummary,
    });

    assert(
      errorQualityConcernEvidence.gate === 'ERROR' &&
        errorQualityConcernEvidence.quality_concerns.some((concern) =>
          concern.evidence?.some((message) => message.includes('quality_concerns contains error-severity entries')),
        ),
      'step 4 emits ERROR evidence when worker quality concerns already contain error severity',
    );

    const malformedQualityConcernSummary = cloneJson(validSummary);
    malformedQualityConcernSummary.ta_evidence_data.quality_concerns = [
      'bad concern',
      { category: 'worker-status', severity: '', source: 'api-tests', message: 'Missing severity' },
    ];
    const malformedQualityConcernEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      summary: malformedQualityConcernSummary,
    });

    assert(
      malformedQualityConcernEvidence.gate === 'ERROR' &&
        malformedQualityConcernEvidence.quality_concerns.some((concern) =>
          concern.evidence?.some((message) => message.includes('quality_concerns[0] must be an object')),
        ) &&
        malformedQualityConcernEvidence.quality_concerns.some((concern) =>
          concern.evidence?.some((message) => message.includes('quality_concerns[1].severity must be a non-empty string')),
        ),
      'step 4 validates quality concern item schema before emitting final evidence',
    );

    const invalidEvidence = evaluateStep04Evidence(step04Content, {
      storyFile: 'stories/t1.1.md',
      automationRound: 'not-a-number',
      summary: {
        ta_evidence_data: {
          changed_tests: [{}],
          quality_concerns: [],
          nfr_signals: [],
          coverage: {
            total_tests: 'one',
            by_level: { api: 1 },
            priority_coverage: { P0: 1 },
          },
          artifact_pointers: {
            automation_summary: 'reports/automation-summary.md.bak',
            generated_test_files: [],
          },
        },
      },
    });

    assert(
      invalidEvidence.gate === 'ERROR' &&
        invalidEvidence.round === 1 &&
        invalidEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('changed_tests entries must include file pointers')),
        ) &&
        invalidEvidence.quality_concerns.some((concern) =>
          concern.evidence.some((message) => message.includes('round must be a positive integer')),
        ),
      'step 4 rejects incomplete evidence before emitting the final envelope',
    );
  } catch (error) {
    assert(false, 'TA structured evidence contract validates', error.message);
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
