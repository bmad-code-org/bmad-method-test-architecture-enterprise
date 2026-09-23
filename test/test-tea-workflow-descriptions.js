/**
 * Wraps `tools/validate-tea-workflow-descriptions.js`: runs its real check
 * against the repository, then proves the lean-skill path with a temp fixture,
 * since a hard-coded single path (the pre-Story-1.3 shape) could pass every
 * real lean skill while silently reading nothing for a new one.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { validateFile, collectFiles } = require('../tools/validate-tea-workflow-descriptions');

const PROJECT_ROOT = path.join(__dirname, '..');

async function main() {
  const failures = [];

  try {
    execFileSync(process.execPath, [path.join(PROJECT_ROOT, 'tools/validate-tea-workflow-descriptions.js')], { stdio: 'pipe' });
  } catch (error) {
    // The tool prints its failure list with console.error, so stderr carries
    // the detail and stdout is empty on a real failure.
    failures.push(`the real repository fails validation: ${error.stderr?.toString() || error.message}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-workflow-description-'));
  try {
    const leanDir = path.join(tempRoot, 'src', 'workflows', 'testarch', 'temp-lean-missing-description');
    fs.mkdirSync(leanDir, { recursive: true });
    fs.writeFileSync(path.join(leanDir, 'SKILL.md'), '---\nname: temp-lean-missing-description\n---\n\n# Temp\n');

    const files = await collectFiles(tempRoot);
    const target = files.find((file) => file.includes('temp-lean-missing-description'));
    assert.ok(target, 'collectFiles finds the temp lean skill by its SKILL.md, since it has no workflow.yaml');

    const errors = validateFile(target, tempRoot);
    assert.ok(errors.length > 0, 'a lean skill missing its description fails validation');
    assert.ok(
      errors.some((message) => message.includes('description')),
      'the failure names the missing description',
    );
  } catch (error) {
    failures.push(error.message);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(`tea-workflow-descriptions: ${failures.length} failure(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log('tea-workflow-descriptions: real repository passes, and the lean-skill negative case is caught');
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
