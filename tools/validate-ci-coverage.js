/**
 * Every script in the `npm test` chain runs somewhere in CI.
 *
 * `package.json`'s `test` script chains eighteen checks. The GitHub Actions
 * workflow does not run that chain: it runs each check as its own step so a
 * failure names itself in the job list instead of hiding behind whichever check
 * happened to be first. That is worth keeping, and it means the workflow is a
 * transcription of the chain, and a transcription drifts.
 *
 * It already did. Four checks added in one change reached `npm test` and never
 * reached the workflow, so contract drift, a broken replay record and a
 * corrupted trace corpus would all have passed CI on a pull request while
 * failing on a laptop.
 *
 * So this compares the two and fails on a chain entry no workflow step runs.
 * The reverse is allowed: a workflow may run more than the chain does, which is
 * how the packaged-install and CLI jobs work.
 *
 * Usage: node tools/validate-ci-coverage.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const WORKFLOW_ROOT = path.join(PROJECT_ROOT, '.github', 'workflows');

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
};

/** The script names `npm test` chains, in order. */
function chainedScripts(manifest) {
  return manifest.scripts.test
    .split('&&')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('npm run '))
    .map((part) => part.slice('npm run '.length).trim());
}

/**
 * Every `npm run <script>` any workflow invokes.
 *
 * A plain text scan rather than a YAML parse, because a step can reach a script
 * through a shell line, a matrix value, or a composite action, and all three
 * carry the same literal.
 */
function scriptsRunInCi() {
  const found = new Set();
  const files = fs.existsSync(WORKFLOW_ROOT) ? fs.readdirSync(WORKFLOW_ROOT) : [];
  for (const name of files) {
    if (!name.endsWith('.yml') && !name.endsWith('.yaml')) continue;
    const text = fs.readFileSync(path.join(WORKFLOW_ROOT, name), 'utf8');
    for (const match of text.matchAll(/npm run ([\w:-]+)/g)) found.add(match[1]);
  }
  return found;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  const chained = chainedScripts(manifest);
  if (chained.length === 0) {
    console.error(`${colors.red}package.json's test script chains no npm run steps${colors.reset}`);
    return 1;
  }

  const inCi = scriptsRunInCi();
  const missing = chained.filter((script) => !inCi.has(script));

  if (missing.length > 0) {
    console.error(`${colors.red}${missing.length} check(s) in the npm test chain never run in CI:${colors.reset}`);
    for (const script of missing) console.error(`  - npm run ${script}`);
    console.error(
      `\n${colors.dim}Add a step to the validate job in .github/workflows/quality.yaml, or remove the check from the chain.${colors.reset}`,
    );
    return 1;
  }

  console.log(`${colors.green}✅${colors.reset} all ${chained.length} npm test chain step(s) run in CI`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { chainedScripts, scriptsRunInCi };
