'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { generatedInventory, reconcileInventory } = require('../cli/lib/automate-inventory');
const ROOT = path.resolve(__dirname, '..');
const FORMS = [
  'named',
  'nested',
  'regexp',
  'regexp-ignore',
  'regexp-projects',
  'glob-basename',
  'cjs',
  'cjs-alias',
  'cjs-namespace',
  'namespace',
  'require-namespace',
  'namespace-alias',
  'namespace-merge',
  'merge',
  'cjs-merge',
  'extend',
  'var-alias',
  'reassigned',
  'computed-namespace',
  'unresolved-namespace',
  'esm',
  'esm-package',
  'named-only',
  'cjs-only',
];

function runNativeChecks({ baseline = false, evidenceRoot } = {}) {
  const scratch = evidenceRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'tea-automate-native-'));
  const outcomes = [];
  try {
    for (const form of FORMS)
      for (const selection of ['full', 'partial']) {
        const project = path.join(scratch, `${form}-${selection}`);
        fs.mkdirSync(project, { recursive: true });
        fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(project, 'node_modules'), 'junction');
        const result = spawnSync(
          process.execPath,
          [
            path.join(ROOT, 'cli/automate.js'),
            '--project-root',
            project,
            '--agent',
            'custom',
            '--agent-cmd',
            process.execPath,
            '--agent-arg',
            path.join(__dirname, 'fixtures/automate-runner/native-agent.js'),
            '--agent-arg',
            form,
            '--agent-arg',
            selection,
            'coverage',
          ],
          { encoding: 'utf8', timeout: 30_000 },
        );
        fs.writeFileSync(path.join(project, 'public-result.json'), JSON.stringify(result, null, 2));
        const native = JSON.parse(fs.readFileSync(path.join(project, 'native-exit.json')));
        assert.equal(native.status, 0, `${form}/${selection} native execution: ${native.stderr}`);
        const report = JSON.parse(fs.readFileSync(path.join(project, '_bmad-output/test-artifacts/automate/runner.json')));
        const specs = report.suites.flatMap((suite) => suite.specs);
        const outcome = {
          form,
          selection,
          nativeStatus: native.status,
          publicStatus: result.status,
          nativeLeaves: specs.map(({ title, line, column }) => ({ title, line, column })),
          stderr: result.stderr,
        };
        outcomes.push(outcome);
        console.log(`${form}/${selection}: native=${native.status}, public=${result.status}, ${JSON.stringify(outcome.nativeLeaves)}`);
        if (!baseline) {
          const unresolved = ['reassigned', 'computed-namespace', 'unresolved-namespace'].includes(form);
          assert.equal(result.status, selection === 'full' && !unresolved ? 0 : 3, `${form}/${selection}: ${result.stderr}`);
          if (unresolved) assert.match(result.stderr, /reassigned test binding|computed registration|unresolved registration binding/);
          else if (selection === 'partial') assert.match(result.stderr, /omits generated test\/project scope/);
          if (selection === 'full' && !unresolved) {
            const inventory = generatedInventory(project, JSON.parse(result.stdout).generatedFiles);
            const altered = structuredClone(report);
            altered.suites[0].specs[0].column++;
            assert.throws(
              () => reconcileInventory(inventory, [altered]),
              /does not identify one generated test leaf/,
              `${form} exact native location must remain bound`,
            );
            const foreign = structuredClone(report);
            foreign.config.configFile = path.join(path.dirname(project), 'other-project', 'playwright.config.cjs');
            assert.throws(
              () => reconcileInventory(inventory, [foreign]),
              /different consuming project root/,
              `${form} foreign root must remain rejected`,
            );
          }
        }
      }
    fs.writeFileSync(path.join(scratch, 'outcomes.json'), JSON.stringify(outcomes, null, 2));
    return outcomes.length + (baseline ? 0 : (FORMS.length - 3) * 2);
  } finally {
    if (!evidenceRoot) fs.rmSync(scratch, { recursive: true, force: true });
  }
}
module.exports = { runNativeChecks };
