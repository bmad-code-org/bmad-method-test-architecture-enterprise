/**
 * Validate TEA workflow description quote style for Gemini compatibility.
 *
 * Rules for TEA workflow definitions under src/workflows/testarch/<workflow>/workflow.yaml
 * and teach-me-testing frontmatter in src/workflows/testarch/bmad-teach-me-testing/SKILL.md:
 * - `description:` must be a single-line YAML scalar on one line
 * - the raw YAML scalar must be wrapped in single quotes
 * - parsed description text must not contain single-quote characters
 *   (use double quotes for examples, e.g. "quote here")
 *
 * Usage: node tools/validate-tea-workflow-descriptions.js [project_root]
 * Exit codes: 0 = success, 1 = validation failures
 */

const fs = require('node:fs');
const path = require('node:path');
const { glob } = require('glob');
const yaml = require('yaml');

/**
 * @param {string} filePath
 * @param {string} projectRoot
 * @returns {string[]}
 */
function validateFile(filePath, projectRoot) {
  const errors = [];
  const relativePath = path.relative(projectRoot, filePath).replaceAll('\\', '/');
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return [`${relativePath}: Failed to read file: ${error.message}`];
  }
  let yamlDoc = content;
  if (filePath.endsWith('.md')) {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
    if (!frontmatterMatch) {
      return [`${relativePath}: Missing YAML frontmatter block`];
    }
    yamlDoc = frontmatterMatch[1];
  }
  /** @type {string | undefined} */
  let parsedDescription;

  try {
    const parsed = yaml.parse(yamlDoc);
    if (!parsed || typeof parsed.description !== 'string') {
      errors.push('YAML parsed but `description` is missing or not a string');
    } else {
      parsedDescription = parsed.description;
    }
  } catch (error) {
    errors.push(`YAML parse error: ${error.message}`);
    return [`${relativePath}: ${errors[0]}`];
  }

  const descriptionMatch = yamlDoc.match(/^\s*description:\s*(?:'((?:''|[^'])*)'|"((?:\\"|[^"])*)")\s*(?:#.*)?$/m);
  if (descriptionMatch) {
    const singleQuotedInner = descriptionMatch[1];
    const quote = singleQuotedInner === undefined ? '"' : "'";

    if (quote !== "'") {
      errors.push('`description:` value must be wrapped in single quotes');
    }
  } else {
    if (/^\s*description:\s*/m.test(yamlDoc)) {
      errors.push('`description:` value must be wrapped in single quotes');
    } else {
      errors.push('Missing single-line `description:` field');
    }
  }

  if (typeof parsedDescription === 'string' && parsedDescription.includes("'")) {
    errors.push('Parsed `description` contains a single quote character; use double quotes for examples');
  }

  return errors.map((error) => `${relativePath}: ${error}`);
}

/**
 * Every TEA workflow's description source: `workflow.yaml` when the skill has
 * one, and `SKILL.md` frontmatter for a lean skill that does not (AD-3).
 *
 * @param {string} projectRoot
 * @returns {Promise<string[]>}
 */
async function collectFiles(projectRoot) {
  const workflowDirs = await glob('src/workflows/testarch/*/', { cwd: projectRoot, absolute: true });
  const files = [];
  for (const dir of workflowDirs) {
    const workflowYamlPath = path.join(dir, 'workflow.yaml');
    files.push(fs.existsSync(workflowYamlPath) ? workflowYamlPath : path.join(dir, 'SKILL.md'));
  }
  return files;
}

async function main(customProjectRoot) {
  const projectRoot = customProjectRoot || path.join(__dirname, '..');
  const files = await collectFiles(projectRoot);

  if (files.length === 0) {
    console.error('No TEA workflow definitions found under src/workflows/testarch/');
    process.exit(1);
  }

  /** @type {string[]} */
  const failures = [];

  for (const filePath of files.sort()) {
    failures.push(...validateFile(filePath, projectRoot));
  }

  if (failures.length > 0) {
    console.error('TEA workflow description quote validation failed:\n');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error('\nExpected format example:');
    console.error(`description: 'Generate traceability, example "quote here"'`);
    process.exit(1);
  }

  console.log(`Validated TEA workflow description quoting in ${files.length} file(s).`);
}

if (require.main === module) {
  const customProjectRoot = process.argv[2];
  main(customProjectRoot).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { validateFile, collectFiles };
