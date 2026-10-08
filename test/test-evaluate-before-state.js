'use strict';

/**
 * `tea-evaluate run --before-state`: a before-state run records a clean control declared known-failing, through the real
 * CLI over real eval-quality and the verdict fixture.
 *
 * The fixture's clean control P-001 declares `Known defect at this revision:` in its attestation, and the verdict command
 * rejects its request in the clean qualification and in the first clean trial, as a skill with a known defect would.
 *
 *  - without the flag the run still exits 11 and names the flag; with the flag it exits 0 and marks `run.json`,
 *  - the flag over an evaluation that declares no known defect exits 64 before any workspace,
 *  - a control that does not declare its defect still exits 11 under the flag, and an oracle that cannot decide keeps a declared control from failing (`mayFailBaseline`),
 *  - the flag over a partition that holds no declaring control exits 64,
 *  - `score` computes the state through eval-quality alone: P-001 scores `false-positive`,
 *  - `compare` and `compare --accept` refuse the run, also after its `run.json` mark is removed by hand,
 *  - a declared control whose baseline passes is recorded as `held` and named as a stale statement.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { declaresKnownDefect, mayFailBaseline } = require('../cli/lib/evaluate/before-state');
const { suite } = require('./lib/evaluate-story-121');

const test = suite('tea-evaluate-before-state');
const KNOWN = 'Known defect at this revision: the strict policy rejects this request. This control records the before state.';
const FAILING = { VERDICT_WHEN: 'qualify-clean,trial-clean-1', VERDICT_DO: 'reject' };

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/** A verdict project whose clean control P-001 carries `statement`. */
function projectDeclaring(label, statement) {
  return test.project(label, ({ folder }) => {
    const file = path.join(folder, 'probes', 'P-001.probe.json');
    const probe = read(file);
    probe.qualification.noKnownDefectStatement = statement;
    write(file, probe);
  });
}

function main() {
  try {
    const declared = projectDeclaring('declared', KNOWN);

    // The stop stays for a run that does not ask for a before state, and names the way out.
    let result = test.cli(declared.folder, 'run', [], { ...declared.env, ...FAILING });
    assert.equal(result.status, 11, result.output);
    assert.match(result.output, /clean control's baseline does not pass/);
    assert.match(result.output, /record the before state with tea-evaluate run --before-state/);

    // The before state.
    result = test.cli(declared.folder, 'run', ['--before-state'], { ...declared.env, ...FAILING });
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /P-001\.probe\.json: recorded as known-failing/);
    assert.match(result.output, /BEFORE STATE: 1 clean control\(s\) recorded as known-failing \(P-001\)/);
    assert.match(result.output, /a before state is never accepted as a baseline/);
    const run = test.latest(declared.folder);
    const record = read(path.join(run, 'run.json'));
    assert.equal(record.completed, true);
    assert.deepEqual(
      record.beforeState.controls.map(({ probeId, baseline, statement }) => ({ probeId, baseline, statement })),
      [{ probeId: 'P-001', baseline: 'violated', statement: KNOWN }],
    );
    const evidence = read(path.join(run, 'qualification', 'P-001', 'baseline-known-failing.json'));
    assert.equal(evidence.phase, 'baseline-known-failing');
    assert.equal(evidence.verdict, 'violated');
    assert.equal(fs.existsSync(path.join(run, 'qualification', 'P-001', 'baseline-pass.json')), false);

    // eval-quality computes the states; the run only carries them.
    const scored = test.cli(declared.folder, 'score', ['--run', path.basename(run)], declared.env);
    assert.equal(scored.status, 2, scored.output);
    assert.match(scored.output, /BEFORE STATE: 1 clean control\(s\) recorded as known-failing \(P-001\)/);
    const scores = path.join(run, 'scores', fs.readdirSync(path.join(run, 'scores')).sort().at(-1));
    const outcome = read(path.join(scores, 'P-001', 'evidence-artifact.json'));
    assert.deepEqual(
      outcome.outcomes.map(({ state }) => state),
      ['false-positive'],
    );

    // Never a baseline: compare and accept both refuse, and the mark is not the only thing they read.
    for (const args of [[], ['--accept']]) {
      result = test.cli(declared.folder, 'compare', args);
      assert.equal(result.status, 10, `compare ${args.join(' ')}: ${result.output}`);
      assert.match(result.output, /run\.json: \[before-state\] records a before state; a before state is never accepted as a baseline/);
      assert.equal(fs.existsSync(path.join(declared.folder, 'baseline')), false, 'a before state wrote baseline/');
    }
    delete record.beforeState;
    write(path.join(run, 'run.json'), record);
    for (const args of [[], ['--accept']]) {
      result = test.cli(declared.folder, 'compare', args);
      assert.equal(result.status, 10, `edited run.json, compare ${args.join(' ')}: ${result.output}`);
      assert.match(result.output, /\[before-state\] clean control P-001 attests a known defect/);
      assert.equal(fs.existsSync(path.join(declared.folder, 'baseline')), false, 'an edited before state wrote baseline/');
    }

    // The flag over an evaluation that declares nothing.
    const clean = projectDeclaring('undeclared', 'No known defect at this revision.');
    result = test.cli(clean.folder, 'run', ['--before-state'], clean.env);
    assert.equal(result.status, 64, result.output);
    assert.match(
      result.output,
      /--before-state needs a clean control whose noKnownDefectStatement begins "Known defect at this revision:"/,
    );
    const runs = path.join(clean.folder, 'runs');
    assert.deepEqual(
      fs.existsSync(runs) ? fs.readdirSync(runs).filter((name) => name !== '.gitignore' && name !== '.workspace-journal') : [],
      [],
      'a refused flag made a run directory',
    );

    // The flag counts only the controls of the selected partition.
    const partitioned = test.project('held-out', ({ folder }) => {
      const file = path.join(folder, 'probes', 'P-001.probe.json');
      const probe = read(file);
      probe.qualification.noKnownDefectStatement = KNOWN;
      write(file, probe);
      const manifest = path.join(folder, 'evaluation.json');
      write(manifest, { ...read(manifest), heldOutProbes: ['P-002'] });
    });
    result = test.cli(partitioned.folder, 'run', ['--partition', 'held-out', '--before-state'], partitioned.env);
    assert.equal(result.status, 64, result.output);
    assert.match(result.output, /in the held-out partition; none does/);

    // A control that fails without declaring its defect is a real weakness under the flag.
    const mixed = test.project('mixed', ({ folder }) => {
      // P-001 declares its defect; P-003 is a second control that does not.
      const source = read(path.join(folder, 'probes', 'P-001.probe.json'));
      source.qualification.noKnownDefectStatement = KNOWN;
      write(path.join(folder, 'probes', 'P-001.probe.json'), source);
      const other = structuredClone(source);
      other.probeId = 'P-003';
      other.qualification.noKnownDefectStatement = 'No known defect at this revision.';
      write(path.join(folder, 'probes', 'P-003.probe.json'), other);
    });
    result = test.cli(mixed.folder, 'run', ['--before-state'], { ...mixed.env, ...FAILING });
    assert.equal(result.status, 11, result.output);
    assert.match(result.output, /P-003\.probe\.json: the clean control's baseline does not pass/);
    assert.match(result.output, /--before-state lets a control fail only when its noKnownDefectStatement begins/);

    // A declared control whose baseline passes is recorded, and its statement is named as stale.
    const stale = projectDeclaring('stale', KNOWN);
    result = test.cli(stale.folder, 'run', ['--before-state'], stale.env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /P-001 declares a known defect yet its baseline passed/);
    assert.equal(read(path.join(test.latest(stale.folder), 'run.json')).beforeState.controls[0].baseline, 'held');

    // Without the flag a stale statement is named, and compare words its refusal for the control.
    const unflagged = projectDeclaring('stale-unflagged', KNOWN);
    result = test.cli(unflagged.folder, 'run', [], unflagged.env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /its statement still declares a known defect, so update it/);
    const unflaggedRun = test.latest(unflagged.folder);
    test.cli(unflagged.folder, 'score', ['--run', path.basename(unflaggedRun)], unflagged.env);
    result = test.cli(unflagged.folder, 'compare', ['--accept']);
    assert.equal(result.status, 10, result.output);
    assert.match(result.output, /has a clean control that declares a known defect/);
    assert.doesNotMatch(result.output, /is a before state/);

    // An ordinary run carries no mark, and its accept path is untouched.
    const ordinary = projectDeclaring('ordinary', 'No known defect at this revision.');
    result = test.cli(ordinary.folder, 'run', [], ordinary.env);
    assert.equal(result.status, 0, result.output);
    assert.equal('beforeState' in read(path.join(test.latest(ordinary.folder), 'run.json')), false);

    // An oracle that cannot decide keeps a declared control from failing its baseline.
    const probe = { qualification: { route: 'clean-control', noKnownDefectStatement: KNOWN } };
    const held = { disposition: 'held' };
    const violated = { disposition: 'violated' };
    const undecided = { disposition: 'not-attempted' };
    assert.equal(declaresKnownDefect({ qualification: { route: 'clean-control', noKnownDefectStatement: `  ${KNOWN}` } }), true);
    assert.equal(
      declaresKnownDefect({ qualification: { route: 'clean-control', noKnownDefectStatement: 'known defect at this revision: x' } }),
      false,
    );
    assert.equal(mayFailBaseline(probe, [violated]), true);
    assert.equal(mayFailBaseline(probe, [held, violated]), true);
    assert.equal(mayFailBaseline(probe, [violated, undecided]), false);
    assert.equal(mayFailBaseline(probe, [undecided]), false);
    assert.equal(mayFailBaseline(probe, [held]), false);
    assert.equal(mayFailBaseline(probe, []), false);
    assert.equal(
      mayFailBaseline({ qualification: { route: 'clean-control', noKnownDefectStatement: 'No known defect at this revision.' } }, [
        violated,
      ]),
      false,
    );

    process.stdout.write('Evaluate before-state runs passed.\n');
  } finally {
    test.cleanup();
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
