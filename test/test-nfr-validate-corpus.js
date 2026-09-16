/**
 * validateCorpus's two newest checks, seeded against a cloned ground-truth.json
 * rather than argued from reading the code.
 *
 * WHY THIS FILE EXISTS
 *
 * `npm run test:eval-nfr-data` runs `node test/eval-nfr.js --validate-only`
 * against the real ground-truth.json and asserts it stays clean. That proves
 * the corpus itself has no defect today. It does not prove a check fires when
 * the defect it exists to catch is actually present: a `problems.push(...)`
 * call that is dead code (a typo'd condition, an inverted comparison, a check
 * reading the wrong field) would leave the real run just as clean.
 *
 * Both checks here landed in the same review pass, each independently found
 * across the peer session and two of the parallel review subagents, and
 * neither had a seeded-defect proof until this file: whether two declared
 * criteria in one domain strip to the same name (scoreRun's byStrippedName
 * would then share one citation list between them), and whether every
 * CRITERION_BULLET_ALIASES target still names a criterion that exists
 * somewhere in the corpus (a rename on either side would otherwise surface
 * only indirectly, as a moved replay number with no named cause).
 *
 * Usage: node test/test-nfr-validate-corpus.js
 */

'use strict';

const assert = require('node:assert');

const { loadGroundTruth, validateCorpus, stripCriterionAnnotation, CRITERION_BULLET_ALIASES } = require('./eval-nfr.js');

const failures = [];

function check(name, fn) {
  return fn()
    .then(() => console.log(`  ok    ${name}`))
    .catch((error) => {
      failures.push(`${name}: ${error.message}`);
      console.error(`  FAIL  ${name}`);
    });
}

async function run() {
  const realGroundTruth = await loadGroundTruth();
  assert.ok(realGroundTruth, 'ground-truth.json failed to load; every check below depends on a real corpus to clone');

  await check('the real corpus validates clean, the baseline every seeded-defect check below is a mutation of', async () => {
    const { problems } = await validateCorpus(structuredClone(realGroundTruth));
    assert.deepStrictEqual(problems, []);
  });

  await check('two declared criteria in one domain that strip to the same name are reported, not silently accepted', async () => {
    const broken = structuredClone(realGroundTruth);
    let seeded = false;
    for (const set of broken.fixtureSets) {
      for (const domainName of Object.keys(set.domains ?? {})) {
        const criteria = set.domains[domainName].criteria ?? [];
        if (criteria.length > 0 && !seeded) {
          // A second criterion, decorated so it strips to the first one's own
          // name, is the exact shape a live model's decorated heading takes:
          // proven directly against stripCriterionAnnotation rather than
          // assumed, since a wrong assumption here would seed no collision at
          // all and the check would pass for the wrong reason.
          const original = criteria[0];
          const decorated = `${original.name} (renamed)`;
          assert.strictEqual(stripCriterionAnnotation(decorated), stripCriterionAnnotation(original.name));
          criteria.push({ ...original, name: decorated });
          seeded = true;
        }
      }
    }
    assert.ok(seeded, 'no fixture set in the real corpus declares any criteria; nothing to seed the collision onto');

    const { problems } = await validateCorpus(broken);
    assert.ok(
      problems.some((message) => message.includes('both strip to') && message.includes('would share one citation list between them')),
      `expected a stripped-name collision to be reported; got:\n${problems.join('\n')}`,
    );
  });

  await check('a CRITERION_BULLET_ALIASES target that names no criterion anywhere in the corpus is reported', async () => {
    const broken = structuredClone(realGroundTruth);
    const targets = new Set(CRITERION_BULLET_ALIASES.values());
    assert.ok(targets.size > 0, 'CRITERION_BULLET_ALIASES is empty; nothing to break a target of');
    for (const set of broken.fixtureSets) {
      for (const domain of Object.values(set.domains ?? {})) {
        for (const criterion of domain.criteria ?? []) {
          if (targets.has(criterion.name)) criterion.name = `${criterion.name} (renamed so no alias target resolves)`;
        }
      }
    }

    const { problems } = await validateCorpus(broken);
    assert.ok(
      problems.some(
        (message) =>
          message.includes('CRITERION_BULLET_ALIASES names') && message.includes('no criterion in ground-truth.json is named that'),
      ),
      `expected an unresolved alias target to be reported; got:\n${problems.join('\n')}`,
    );
  });
}

run()
  .then(() => {
    if (failures.length > 0) {
      console.error('\nnfr validateCorpus check failed:\n');
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      process.exit(1);
    }
    console.log('validateCorpus reports both seeded defects, and stays clean on the real corpus.');
  })
  .catch((error) => {
    console.error(error?.stack ?? error);
    process.exit(2);
  });
