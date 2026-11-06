/**
 * Generate current-engine seals beside immutable historical Evaluate captures.
 * Usage: node tools/refresh-evaluate-seals.js --source <commit>
 * The engine's seal command owns every output. Only direction wording may move;
 * original captured seals, records, manifests and blind inputs stay untouched.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DESTINATION = 'test/fixtures/evaluate-engine-seals';
const PREFIXES = ['test/fixtures/evaluate-authoring/', 'test/fixtures/evaluate-ci-repos/', 'test/fixtures/evaluate-gap-loop/'];
const git = (...args) => execFileSync('git', args, { cwd: ROOT });

async function main() {
  assert.equal(process.argv.length, 4, 'Usage: node tools/refresh-evaluate-seals.js --source <commit>');
  assert.equal(process.argv[2], '--source');
  const sourceCommit = git('rev-parse', '--verify', `${process.argv[3]}^{commit}`).toString().trim();
  const engine = await import('eval-quality');
  const originals = git('ls-tree', '-r', '--name-only', sourceCommit)
    .toString()
    .trim()
    .split('\n')
    .filter(
      (file) =>
        PREFIXES.some((prefix) => file.startsWith(prefix)) &&
        !file.includes('/baseline/') &&
        /\/(?:sealed-brief|sealed-evaluator-brief)\.json$/.test(file),
    );
  assert.equal(originals.length, 15, 'the historical seal inventory changed; review the owning list');
  const pending = path.join(ROOT, `${DESTINATION}.pending-${process.pid}`);
  fs.mkdirSync(pending);
  const files = {};
  const generated = new Map();
  for (const original of originals) {
    const originalBytes = git('show', `${sourceCommit}:${original}`);
    assert.deepEqual(fs.readFileSync(path.join(ROOT, original)), originalBytes, `${original}: historical source changed`);
    const contract = `${path.posix.dirname(original)}/contract.json`;
    const contractBytes = git('show', `${sourceCommit}:${contract}`);
    assert.deepEqual(fs.readFileSync(path.join(ROOT, contract)), contractBytes, `${contract}: historical source changed`);
    const contractDigest = engine.digestBytes(contractBytes);
    let output = generated.get(contractDigest);
    if (output === undefined) {
      output = `${contractDigest.slice('sha256:'.length)}.json`;
      execFileSync(
        path.join(ROOT, 'node_modules', '.bin', 'eval-quality'),
        ['seal', '--in', path.join(ROOT, contract), '--out', path.join(pending, output)],
        { cwd: ROOT },
      );
      generated.set(contractDigest, output);
    }
    const oldSeal = JSON.parse(originalBytes);
    const outputBytes = fs.readFileSync(path.join(pending, output));
    const newSeal = JSON.parse(outputBytes);
    const withoutWording = (seal) => ({ ...seal, directions: seal.directions.map(({ text: _text, ...rest }) => rest) });
    assert.deepEqual(withoutWording(newSeal), withoutWording(oldSeal), `${original}: seal changed beyond direction wording`);
    files[original] = {
      sourceDigest: engine.digestBytes(originalBytes),
      contract,
      contractDigest,
      generated: `${DESTINATION}/${output}`,
      generatedDigest: engine.digestBytes(outputBytes),
    };
  }
  fs.writeFileSync(
    path.join(pending, 'manifest.json'),
    `${JSON.stringify(
      {
        command: `node tools/refresh-evaluate-seals.js --source ${sourceCommit}`,
        sourceCommit,
        engineVersion: engine.VERSION,
        purpose: 'Current-engine seal expectations; original captured evidence remains immutable.',
        allowedChange: 'Evaluator direction wording only; contract and every other sealed field unchanged.',
        files,
      },
      null,
      2,
    )}\n`,
  );
  // A complete generated directory replaces the previous expectations atomically.
  const destination = path.join(ROOT, DESTINATION);
  const retired = `${destination}.retired-${process.pid}`;
  const hadPrevious = fs.existsSync(destination);
  if (hadPrevious) fs.renameSync(destination, retired);
  try {
    fs.renameSync(pending, destination);
  } catch (error) {
    if (hadPrevious) fs.renameSync(retired, destination);
    throw error;
  }
  console.log(`generated ${generated.size} engine ${engine.VERSION} seals for ${originals.length} immutable captures`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
