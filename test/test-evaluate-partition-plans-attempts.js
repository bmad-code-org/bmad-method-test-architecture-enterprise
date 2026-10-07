'use strict';

/**
 * Interaction plans isolated by evaluation partition (Story 1.51, AD-9, AD-22), through the real CLI over real eval-quality and
 * the `partition-plan` fixture: one shared step, one development-only step in `contract.json`, and one held-out step whose
 * request carries a private canary in the sealed held-out plan.
 *
 * The revert checks the story names are each one case below:
 *  - each partition launches one request per authorized step in preflight and run (restoring shared-plan execution launches
 *    the held-out request in a development run and the development request in a held-out run),
 *  - no artifact, log or replay file of one partition holds the other's canary, step ID or oracle (removing the view leaves
 *    the canary in every development artifact),
 *  - the held-out run scores after the development run, outside the gap loop, and `compare --accept` and `ci --tier pr`
 *    replay each baseline with no stale warning (compiling `contract.json` for a held-out baseline reads as stale),
 *  - a run of a folder with no `partitionPlan` writes the folder's own `contract.json` bytes in every partition.
 *
 * Story 1.105 adds rubrics to the same plan, through the `rubricLayer` over the same fixture: a criterion belongs to the
 * partition whose steps its evidence reads, so
 *  - each view holds only the criteria its steps reach (a view that keeps the other partition's criterion fails the pure and the
 *    run cases), and a development run holds no held-out criterion in any artifact,
 *  - `check` names a criterion that no view reaches, by criterion ID and never by a byte of the held-out plan,
 *  - calibration judges the items of the run's own criteria, so an item of the other partition's criterion is never judged there.
 *
 * Story 1.106 adds waivers, through the `waiverLayer` over the same fixture. A waiver names a discipline rule and no oracle, so its
 * `condition`, the one field that reads a step, places it:
 *  - each view holds only the waivers its steps reach (a view that keeps the other partition's waiver fails the pure case, the
 *    isolation scan of the held-out run, and the engine's compile of a held-out view that holds an incomplete development waiver),
 *  - `check` names a waiver that no view reaches by waiver ID and never by a byte of the held-out plan.
 *
 * Story 1.109 adds gameability probes, through the `gameabilityLayer` over the same fixture. The degenerate response of a probe answers
 * the steps of `contract.json` from `corpus/gameability/<probeId>.json` and the held-out plan's steps from
 * `corpus/held-out/gameability/<probeId>.json`, beside the plan, so
 *  - each partition's and the both view's gameability arm answers only its own view's steps (an arm that answers the whole plan puts
 *    a held-out step in a development artifact), and a development run reads no byte of the held-out answers,
 *  - `check` names a missing, misplaced or unreadable answer by probe and step ID, and a step of the held-out plan by an ID only when
 *    it has the schema's shape, and never by a byte of the sealed file.
 *
 * Story 1.108 runs `ci` over the same fixture, whose `compile` and `seal` checks run over each view (development, held-out and both):
 *  - a held-out oracle the engine refuses and `check` accepts fails the `ci` row with the engine's exit, names the refused view, and
 *    leaves a compiled contract and a sealed brief for each view that compiles and none for a view that does not (compiling only
 *    `contract.json` passes the plan),
 *  - a view that cannot be derived is a finding of that view and its stage never runs,
 *  - no development evidence of a `ci` run holds a held-out ID, and no development command reads the held-out evidence a `ci`
 *    invocation leaves under `runs/`.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { PartitionPlanError, contractView, loadContractView, readHeldOutResponse } = require('../cli/lib/evaluate/partition');
const { engineCliPath } = require('../cli/lib/evaluate/engine');
const { mostSevere } = require('../cli/lib/evaluate/ci-plan');
const { answersForView } = require('../cli/lib/evaluate/gameability');
const { EvaluatorLayerError, readEvaluatorLayer } = require('../cli/lib/evaluate/evaluators');
const { MATERIAL_HEADING } = require('../cli/lib/evaluate/sealed-brief-agent');

const { createHarness } = require('./lib/evaluate-partition-plans-harness');

const {
  PLAN_FILE,
  CANARY,
  KEEP_OUT,
  SHARED_CRITERION,
  EVALUATOR_FIXTURE,
  SHARED_ROW,
  HELD_OUT_ROW,
  criterionRow,
  MAPPING_KEEP_OUT,
  test,
  read,
  write,
  filesUnder,
  holding,
  launchesSince,
  launchCount,
  commit,
  SHARED_ANSWER,
  DEVELOPMENT_ANSWER,
  HELD_OUT_ANSWER,
  HELD_OUT_ANSWERS_DIR,
  planProject,
  cli,
  outcomes,
  viewOf,
  snapshotRecords,
  evaluation,
  heldOutPlan,
  rubricBytes,
  mappingSource,
  HELD_OUT_ROWS,
  mappingPlan,
  designatedBy,
  setTiers,
} = createHarness('tea-evaluate-partition-plans-attempts');

try {
  {
    // ---- ci compiles and seals each view: a held-out oracle the engine refuses fails the pull request that wrote it (Story 1.108) ------
    const VIEWS = ['development', 'held-out', 'both'];
    const STAGES = [
      ['compile', 'eval-contract.json'],
      ['seal', 'sealed-evaluator-brief.json'],
    ];
    /** The project's CI plan cut to the `pr` checks named, in the plan's own order. */
    const cutPlan = (project, ids) => {
      const file = path.join(project.folder, 'ci/evaluation-ci-plan.json');
      const plan = read(file);
      plan.checks = plan.checks.filter((item) => ids.includes(item.id) && item.placement.tier === 'pr');
      write(file, plan);
      setTiers(project.folder, plan);
    };
    const editJson = (project, file, edit) => {
      const value = read(path.join(project.folder, file));
      edit(value);
      write(path.join(project.folder, file), value);
    };
    /** A fresh project whose `pr` plan runs `ids`, after `edit` changed its files and the corpus index followed. */
    const viewProject = (label, edit, ids = ['check', 'compile', 'seal']) => {
      const project = planProject(label);
      cutPlan(project, ids);
      edit(project);
      assert.equal(cli(project, 'digest').status, 0);
      return project;
    };
    /** The engine CLI over one view of the project, run by hand: its exit and the bytes it wrote. */
    const engineOver = (project, partition, stage) => {
      const view = loadContractView({ folder: project.folder, evaluation: read(path.join(project.folder, 'evaluation.json')), partition });
      const input = path.join(project.directory, `${partition}-${stage}-in.json`);
      const output = path.join(project.directory, `${partition}-${stage}-out.json`);
      fs.writeFileSync(input, view.bytes);
      const run = spawnSync(process.execPath, [engineCliPath(), stage, '--in', input, '--out', output], { encoding: 'utf8' });
      return { status: run.status, stderr: run.stderr, produced: fs.existsSync(output) ? fs.readFileSync(output) : null };
    };
    /**
     * What `ci --tier pr` leaves for the stages the plan runs over each view, held against the engine run by hand over the same view:
     * `expected[stage][view]` is the exit the engine gives (the premise of the case, so a fixture the engine stops refusing fails here),
     * the row's exit is the most severe of them, each view writes its own record and, only when the engine accepted the view, its
     * artifact (the development view at the check's own paths, the others under `held-out/` and `both/`), and the stdout names each view.
     */
    const assertStageViews = (project, { ran, expected, label }) => {
      const run = test.latest(project.folder);
      const json = read(path.join(run, 'ci.json'));
      assert.deepEqual(
        json.checks.map((row) => row.id),
        ran,
        `${label}: the rows of the plan`,
      );
      for (const [stage, produced] of STAGES.filter(([name]) => ran.includes(name))) {
        const row = json.checks.find((item) => item.id === stage);
        const exits = VIEWS.map((view) => expected[stage][view]);
        assert.equal(row.exit, mostSevere(exits), `${label}: the ${stage} row's exit is the most severe of the views' exits`);
        const files = [`checks/${stage}/exit-code`, `checks/${stage}/stdout`, `checks/${stage}/stderr`];
        const stdout = fs.readFileSync(path.join(run, 'checks', stage, 'stdout'), 'utf8');
        for (const view of VIEWS) {
          const direct = engineOver(project, view, stage);
          assert.equal(direct.status, expected[stage][view], `${label}: the engine's ${stage} of the ${view} view exits ${direct.status}`);
          const where = view === 'development' ? `checks/${stage}` : `checks/${stage}/${view}`;
          files.push(`${where}/engine.json`);
          const record = read(path.join(run, where, 'engine.json'));
          assert.equal(record.stage, stage);
          assert.equal(record.exitCode, direct.status, `${label}: the ${view} record of ${stage}`);
          assert.equal(record.stderr, direct.stderr, `${label}: the ${view} record of ${stage} holds the engine's own stderr`);
          const artifact = path.join(run, where, produced);
          if (direct.status === 0) {
            files.push(`${where}/${produced}`);
            assert.equal(fs.readFileSync(artifact).equals(direct.produced), true, `${label}: the ${view} ${produced} is the engine's`);
          } else {
            assert.equal(fs.existsSync(artifact), false, `${label}: a ${view} view ${stage} the engine refused left a ${produced}`);
          }
          assert.match(
            stdout,
            new RegExp(`^${stage} over the ${view} view: eval-quality exited ${direct.status}\\b`, 'm'),
            `${label}: ${view}`,
          );
        }
        assert.deepEqual(row.files, files, `${label}: the files of the ${stage} row`);
      }
      return { run, json };
    };
    const ABSENT = { development: 0, 'held-out': 0, both: 0 };

    // A held-out oracle whose direction disagrees with its polarity: `check` accepts the plan, and eval-quality refuses the held-out and
    // both views at compile and at seal while the development view compiles.
    const refusedHeldOut = viewProject('plan-ci-views-held-out', (project) =>
      editJson(project, PLAN_FILE, (plan) => (plan.oracles[0].direction.polarity = 'expects-violation')),
    );
    const accepted = cli(refusedHeldOut, 'check');
    assert.equal(accepted.status, 0, `the defect is one \`check\` lets through: ${accepted.output}`);
    const refused = cli(refusedHeldOut, 'ci', ['--tier', 'pr']);
    assert.equal(refused.status, 4, `ci --tier pr over a held-out oracle the engine refuses: ${refused.output}`);
    const refusedRun = assertStageViews(refusedHeldOut, {
      ran: ['check', 'compile', 'seal'],
      expected: {
        compile: { development: 0, 'held-out': 4, both: 4 },
        seal: { development: 0, 'held-out': 4, both: 4 },
      },
      label: 'held-out oracle refused',
    });
    for (const stage of ['compile', 'seal']) {
      const row = refusedRun.json.checks.find((item) => item.id === stage);
      assert.deepEqual([row.exit, row.class, row.action], [4, 'contract authoring defect', 'block']);
    }
    assert.match(
      refused.output,
      /^ {2}compile over the held-out view: eval-quality exited 4; its record is runs\/\S+\/checks\/compile\/held-out\/engine\.json$/m,
    );
    assert.match(
      refused.output,
      /^ {2}seal over the both view: eval-quality exited 4; its record is runs\/\S+\/checks\/seal\/both\/engine\.json$/m,
    );
    // The held-out plan's own text sits only in the records of the views built from it; the development view's evidence, the check's own
    // stdout and stderr and the console hold none of it.
    const developmentEvidence = (run) =>
      ['compile', 'seal'].flatMap((stage) =>
        fs
          .readdirSync(path.join(run, 'checks', stage), { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => path.join(run, 'checks', stage, entry.name)),
      );
    const KEEP_OUT_TOKENS = [CANARY, 'held-out-run', 'O-101'];
    const heldOutTokensIn = (files) =>
      files.flatMap((file) =>
        KEEP_OUT_TOKENS.filter((token) => fs.readFileSync(file, 'utf8').includes(token)).map((token) => `${file}: ${token}`),
      );
    assert.deepEqual(
      heldOutTokensIn(developmentEvidence(refusedRun.run)),
      [],
      'the development evidence of the compile and seal checks holds the held-out plan',
    );
    assert.deepEqual(
      KEEP_OUT_TOKENS.filter((token) => refused.output.includes(token)),
      [],
      'the ci summary printed the held-out plan',
    );
    assert.match(
      fs.readFileSync(path.join(refusedRun.run, 'checks/compile/held-out/engine.json'), 'utf8'),
      /O-101/,
      'the refused view keeps the engine message in its record',
    );

    // The same plan with only one of the two checks: a `seal` entry alone still refuses each view it seals, and a `compile` entry alone
    // never runs a seal.
    for (const [stage, other] of [
      ['seal', 'compile'],
      ['compile', 'seal'],
    ]) {
      const alone = viewProject(
        `plan-ci-views-${stage}-only`,
        (project) => editJson(project, PLAN_FILE, (plan) => (plan.oracles[0].direction.polarity = 'expects-violation')),
        [stage],
      );
      const aloneRan = cli(alone, 'ci', ['--tier', 'pr']);
      assert.equal(aloneRan.status, 4, `${stage} alone: ${aloneRan.output}`);
      const { run } = assertStageViews(alone, {
        ran: [stage],
        expected: { [stage]: { development: 0, 'held-out': 4, both: 4 } },
        label: `${stage} alone`,
      });
      assert.equal(fs.existsSync(path.join(run, 'checks', other)), false, `${stage} alone: the ${other} check left evidence`);
    }

    // The mirror: a development-only oracle the engine refuses fails the development and both views, and the held-out view, which drops
    // that oracle with the step it reads, compiles and seals.
    const refusedDevelopment = viewProject('plan-ci-views-development', (project) =>
      editJson(project, 'contract.json', (contract) => {
        contract.oracles.find((oracle) => oracle.id === 'O-002').direction.polarity = 'expects-violation';
      }),
    );
    assert.equal(cli(refusedDevelopment, 'check').status, 0, 'a development oracle the engine refuses passes check');
    const developmentRefused = cli(refusedDevelopment, 'ci', ['--tier', 'pr']);
    assert.equal(developmentRefused.status, 4, developmentRefused.output);
    assertStageViews(refusedDevelopment, {
      ran: ['check', 'compile', 'seal'],
      expected: {
        compile: { development: 4, 'held-out': 0, both: 4 },
        seal: { development: 4, 'held-out': 0, both: 4 },
      },
      label: 'development oracle refused',
    });

    // A view the engine compiles and cannot seal: the compile row passes with an artifact for each view, and the seal row carries the
    // engine's exit for the views it refuses.
    const unsealable = viewProject('plan-ci-views-unsealable', (project) =>
      editJson(project, PLAN_FILE, (plan) => (plan.oracles[0].direction.evidenceTargets = [])),
    );
    assert.equal(cli(unsealable, 'check').status, 0, 'an oracle the engine cannot seal passes check');
    const unsealed = cli(unsealable, 'ci', ['--tier', 'pr']);
    const unsealedRun = assertStageViews(unsealable, {
      ran: ['check', 'compile', 'seal'],
      expected: {
        compile: ABSENT,
        seal: { development: 0, 'held-out': 5, both: 5 },
      },
      label: 'held-out oracle that cannot be sealed',
    });
    assert.equal(unsealed.status, 5, unsealed.output);
    assert.deepEqual(
      unsealedRun.json.checks.map((row) => [row.id, row.exit]),
      [
        ['check', 0],
        ['compile', 0],
        ['seal', 5],
      ],
    );

    // Views that fail with different exits: a development oracle the engine refuses at compile and a held-out oracle it cannot seal. The
    // `seal` exits are 4, 5 and 4, so the row's 5 is the most severe of them and no view's exit by position (the first or the last), and
    // the `compile` exits 4, 0 and 4 mix a refused view with one that compiles.
    const mixed = viewProject('plan-ci-views-mixed', (project) => {
      editJson(project, 'contract.json', (contract) => {
        contract.oracles.find((oracle) => oracle.id === 'O-002').direction.polarity = 'expects-violation';
      });
      editJson(project, PLAN_FILE, (plan) => (plan.oracles[0].direction.evidenceTargets = []));
    });
    assert.equal(cli(mixed, 'check').status, 0, 'the mixed defects pass check');
    const mixedRan = cli(mixed, 'ci', ['--tier', 'pr']);
    const mixedRun = assertStageViews(mixed, {
      ran: ['check', 'compile', 'seal'],
      expected: {
        compile: { development: 4, 'held-out': 0, both: 4 },
        seal: { development: 4, 'held-out': 5, both: 4 },
      },
      label: 'mixed exits',
    });
    assert.deepEqual(
      mixedRun.json.checks.map((row) => [row.id, row.exit]),
      [
        ['check', 0],
        ['compile', 4],
        ['seal', 5],
      ],
    );
    assert.equal(mixedRan.status, 5, mixedRan.output);

    // A plan the engine accepts in every view: three compiled contracts and three sealed briefs, one of each per view.
    const sound = viewProject('plan-ci-views-sound', () => {});
    const soundRan = cli(sound, 'ci', ['--tier', 'pr']);
    assert.equal(soundRan.status, 0, soundRan.output);
    assertStageViews(sound, {
      ran: ['check', 'compile', 'seal'],
      expected: { compile: ABSENT, seal: ABSENT },
      label: 'sound plan',
    });
    assert.deepEqual(
      heldOutTokensIn(developmentEvidence(test.latest(sound.folder))),
      [],
      "the sound plan's development evidence holds the held-out plan",
    );
    assert.match(
      fs.readFileSync(path.join(test.latest(sound.folder), 'checks/compile/held-out/eval-contract.json'), 'utf8'),
      /O-101/,
      'the held-out view of a sound plan holds its own oracle',
    );
    assert.equal(
      fs.readFileSync(path.join(test.latest(sound.folder), 'checks/compile/eval-contract.json'), 'utf8').includes('O-101'),
      false,
      'the development contract holds a held-out oracle',
    );

    // A view that cannot be derived is a finding of that view with exit 10, its stage never runs, and every other view still runs.
    const underivable = (label, edit, { expectDevelopment = 0, pattern, secret = CANARY, scanRun = true }) => {
      const project = viewProject(label, edit);
      const ran = cli(project, 'ci', ['--tier', 'pr']);
      const run = test.latest(project.folder);
      const json = read(path.join(run, 'ci.json'));
      for (const [stage, produced] of STAGES) {
        const row = json.checks.find((item) => item.id === stage);
        const stdout = fs.readFileSync(path.join(run, 'checks', stage, 'stdout'), 'utf8');
        assert.match(
          stdout,
          new RegExp(`^${stage} over the development view: eval-quality exited ${expectDevelopment}\\b`, 'm'),
          `${label}: ${stdout}`,
        );
        assert.match(
          stdout,
          new RegExp(
            `^held-out view: \\[partition-plan\\] ${pattern.replace('VIEW', 'held-out')}; ${stage} did not run over the held-out view$`,
            'm',
          ),
          `${label}: ${stdout}`,
        );
        assert.match(
          stdout,
          new RegExp(`^both view: \\[partition-plan\\] ${pattern.replace('VIEW', 'both')}; ${stage} did not run over the both view$`, 'm'),
          `${label}: ${stdout}`,
        );
        assert.deepEqual(
          [row.exit, row.action],
          [mostSevere([expectDevelopment, 10]), 'block'],
          `${label}: the ${stage} row of a view that cannot be derived`,
        );
        for (const view of ['held-out', 'both']) {
          assert.equal(
            fs.existsSync(path.join(run, 'checks', stage, view)),
            false,
            `${label}: ${stage} ran over the ${view} view that cannot be derived`,
          );
        }
        assert.equal(
          fs.existsSync(path.join(run, 'checks', stage, 'engine.json')),
          true,
          `${label}: ${stage} did not run over the development view`,
        );
        assert.equal(
          fs.existsSync(path.join(run, 'checks', stage, produced)),
          expectDevelopment === 0,
          `${label}: the development ${produced}`,
        );
      }
      assert.equal(ran.status, mostSevere([expectDevelopment, 10]), ran.output);
      // The finding names the plan's path and no byte of it. The `check` row prints the parse error of a contract.json that does not parse,
      // and the engine's record of the development view quotes it, so a case that breaks that file scans the stage rows' stdout alone.
      const scanned = scanRun ? filesUnder(run) : ['compile', 'seal'].map((stage) => path.join(run, 'checks', stage, 'stdout'));
      assert.equal(
        scanned.some((file) => fs.readFileSync(file, 'utf8').includes(secret)),
        false,
        `${label}: the scanned files quote the file`,
      );
      if (scanRun) assert.equal(ran.output.includes(secret), false, `${label}: the output quotes the file`);
      return { project, run };
    };
    underivable('plan-ci-views-unparsable-plan', (project) => fs.writeFileSync(path.join(project.folder, PLAN_FILE), `${CANARY} {`), {
      pattern: String.raw`corpus\/held-out\/plan\.json does not parse as JSON`,
    });
    underivable('plan-ci-views-absent-plan', (project) => fs.rmSync(path.join(project.folder, PLAN_FILE)), {
      pattern: String.raw`corpus\/held-out\/plan\.json cannot be read \(ENOENT\)`,
    });
    underivable('plan-ci-views-off-shape-plan', (project) => editJson(project, PLAN_FILE, (plan) => (plan.behaviorOracles['B-002'] = 5)), {
      pattern: String.raw`corpus\/held-out\/plan\.json and contract\.json do not derive the VIEW view \(an unexpected TypeError\)`,
    });
    // A folder with no `contract.json` is an error of the system, which is no file of a kind the finding may call not regular: the development
    // view is the engine's to refuse, and each derived view names the files and the class of the error.
    underivable('plan-ci-views-absent-contract', (project) => fs.rmSync(path.join(project.folder, 'contract.json')), {
      expectDevelopment: 64,
      scanRun: false,
      pattern: String.raw`corpus\/held-out\/plan\.json and contract\.json do not derive the VIEW view \(an unexpected Error\)`,
    });
    // A plan path off the schema's shape is never printed: the finding names the field of `evaluation.json` that holds it, whatever it
    // holds (revert: the typed path reaches the output).
    const typedName = 'SECRET-NAME-5b9e';
    const offShape = underivable(
      'plan-ci-views-off-shape-plan-path',
      (project) => {
        fs.rmSync(path.join(project.folder, 'contract.json'));
        editJson(
          project,
          'evaluation.json',
          (manifest) => (manifest.partitionPlan.heldOutPlan = `corpus/held-out/../../${typedName}.json`),
        );
      },
      {
        expectDevelopment: 64,
        scanRun: false,
        secret: typedName,
        pattern: String.raw`the partitionPlan of evaluation\.json and contract\.json do not derive the VIEW view \(an unexpected Error\)`,
      },
    );
    for (const stage of ['compile', 'seal']) {
      assert.equal(
        filesUnder(path.join(offShape.run, 'checks', stage)).some((file) => fs.readFileSync(file, 'utf8').includes(typedName)),
        false,
        `the ${stage} row prints the typed plan path`,
      );
    }
    // A `contract.json` that does not parse is the engine's to refuse in the development view, and no view derives from it.
    underivable(
      'plan-ci-views-unparsable-contract',
      (project) => fs.writeFileSync(path.join(project.folder, 'contract.json'), `${CANARY} {`),
      {
        expectDevelopment: 5,
        scanRun: false,
        pattern: String.raw`corpus\/held-out\/plan\.json and contract\.json do not derive the VIEW view \(an unexpected SyntaxError\)`,
      },
    );

    // A folder whose `evaluation.json` cannot be read is `check`'s finding: the stages compile `contract.json` once, as before.
    const unreadable = viewProject('plan-ci-views-unreadable-evaluation', (project) =>
      fs.writeFileSync(path.join(project.folder, 'evaluation.json'), '{'),
    );
    const unreadableRan = cli(unreadable, 'ci', ['--tier', 'pr']);
    const unreadableRun = test.latest(unreadable.folder);
    assert.equal(read(path.join(unreadableRun, 'ci.json')).checks.find((row) => row.id === 'compile').exit, 0, unreadableRan.output);
    assert.equal(fs.existsSync(path.join(unreadableRun, 'checks/compile/held-out')), false);
    assert.deepEqual(
      read(path.join(unreadableRun, 'ci.json')).checks.find((row) => row.id === 'compile').files,
      ['exit-code', 'stdout', 'stderr', 'engine.json', 'eval-contract.json'].map((name) => `checks/compile/${name}`),
    );

    // The held-out views' evidence sits under `runs/<invocationId>/checks/` of a `ci` invocation, and a development command reads none of
    // it (`score --run` reads its own run's directory, and `run` and `preflight` write theirs): after a development baseline replays through
    // `ci`, all eight held-out evidence files are made unreadable (a FIFO, a mode that denies the owner or a link to nothing), and a
    // development `check`, `preflight`, `run`, `score` and `ci` still pass and hold none of it.
    const runsFlow = planProject('plan-ci-runs');
    const runsDevelopment = cli(runsFlow, 'run', ['--partition', 'development']);
    assert.equal(runsDevelopment.status, 0, runsDevelopment.output);
    const runsDevelopmentRun = test.latest(runsFlow.folder);
    assert.equal(cli(runsFlow, 'score', ['--run', path.basename(runsDevelopmentRun)]).status, 0);
    assert.equal(cli(runsFlow, 'compare', ['--run', path.basename(runsDevelopmentRun), '--accept']).status, 0);
    commit(runsFlow.repository, 'development baseline');
    const runsReplayed = cli(runsFlow, 'ci', ['--tier', 'pr']);
    assert.equal(runsReplayed.status, 0, runsReplayed.output);
    const runsCi = test.latest(runsFlow.folder);
    const developmentRows = read(path.join(runsCi, 'ci.json')).checks;
    for (const stage of ['compile', 'seal']) {
      const files = developmentRows.find((row) => row.id === stage).files;
      for (const view of ['held-out', 'both']) {
        assert.equal(
          files.some((file) => file.startsWith(`checks/${stage}/${view}/`)),
          true,
          `the ${stage} row of a development baseline lists no ${view} view`,
        );
      }
    }
    assert.match(
      fs.readFileSync(path.join(runsCi, 'checks/compile/held-out/eval-contract.json'), 'utf8'),
      new RegExp(CANARY),
      'the held-out view of a replayed development baseline holds the held-out plan',
    );
    assert.deepEqual(holding(runsDevelopmentRun, KEEP_OUT.development), [], 'the development run holds the held-out plan');
    // Each of the eight files the compile and seal checks wrote for the held-out and both views.
    const hostile = [
      ['compile/held-out/engine.json', 'unreadable'],
      ['compile/held-out/eval-contract.json', 'fifo'],
      ['compile/both/engine.json', 'unreadable'],
      ['compile/both/eval-contract.json', 'fifo'],
      ['seal/held-out/engine.json', 'unreadable'],
      ['seal/held-out/sealed-evaluator-brief.json', 'fifo'],
      ['seal/both/engine.json', 'unreadable'],
      ['seal/both/sealed-evaluator-brief.json', 'dangling'],
    ];
    assert.deepEqual(
      filesUnder(runsCi)
        .map((file) => path.relative(path.join(runsCi, 'checks'), file).split(path.sep).join('/'))
        .filter((file) => /^(compile|seal)\/(held-out|both)\//.test(file))
        .sort(),
      hostile.map(([file]) => file).sort(),
      'the held-out evidence of the ci run is not the eight files the case makes unreadable',
    );
    for (const [file, kind] of hostile) {
      const target = path.join(runsCi, 'checks', file);
      fs.rmSync(target);
      if (kind === 'fifo') assert.equal(spawnSync('mkfifo', [target]).status, 0);
      else if (kind === 'dangling') fs.symlinkSync(path.join(runsFlow.directory, 'nothing-here'), target);
      else {
        fs.writeFileSync(target, `${CANARY} held-out-run O-101`);
        fs.chmodSync(target, 0);
      }
    }
    const runsOutputs = [];
    const developmentCommand = (command, args = []) => {
      const ran = cli(runsFlow, command, args);
      assert.equal(ran.status, 0, `development ${command} over held-out evidence nobody can read: ${ran.output}`);
      runsOutputs.push(ran.output);
      return ran;
    };
    developmentCommand('check');
    developmentCommand('preflight', ['--partition', 'development']);
    developmentCommand('run', ['--partition', 'development']);
    const hostileRun = test.latest(runsFlow.folder);
    developmentCommand('score', ['--run', path.basename(hostileRun)]);
    developmentCommand('ci', ['--tier', 'pr']);
    assert.deepEqual(
      holding(hostileRun, KEEP_OUT.development),
      [],
      'a development run beside the held-out evidence holds the held-out plan',
    );
    assert.deepEqual(
      runsOutputs.flatMap((text) => KEEP_OUT.development.filter((token) => text.includes(token))),
      [],
      'a development command printed the held-out plan',
    );
    // A `score` of a both run under a plan reads the folder's `contract.json` and plan to derive each probe's oracle: a FIFO in its place is
    // refused at once, naming the file (revert: a blocking read waits for SIGKILL).
    const bothRun = cli(runsFlow, 'run');
    assert.equal(bothRun.status, 0, bothRun.output);
    const bothRunId = path.basename(test.latest(runsFlow.folder));
    const contractFile = path.join(runsFlow.folder, 'contract.json');
    const contractBytes = fs.readFileSync(contractFile);
    fs.rmSync(contractFile);
    assert.equal(spawnSync('mkfifo', [contractFile]).status, 0);
    try {
      const fifoScore = spawnSync(
        process.execPath,
        [path.join(__dirname, '..', 'cli', 'evaluate.js'), 'score', '--evaluation', runsFlow.folder, '--run', bothRunId],
        { encoding: 'utf8', timeout: 60_000, killSignal: 'SIGKILL', env: { ...process.env, ...runsFlow.env } },
      );
      assert.equal(fifoScore.error, undefined, `score over a FIFO contract.json: ${fifoScore.error?.message}`);
      assert.equal(fifoScore.status, 10, `${fifoScore.stdout}${fifoScore.stderr}`);
      assert.match(
        `${fifoScore.stdout}${fifoScore.stderr}`,
        /contract\.json cannot be read as JSON, so the oracle each probe of the both view is scored against cannot be derived/,
      );
    } finally {
      fs.rmSync(contractFile);
      fs.writeFileSync(contractFile, contractBytes);
    }
  }

  // The records of one development run and one held-out run of the plan flow, which the sealed-record cases below patch and judge.
  const snapshotFlow = planProject('plan-snapshot-flow');
  const recordsOf = (partition) => {
    const ran = cli(snapshotFlow, 'run', ['--partition', partition]);
    assert.equal(ran.status, 0, ran.output);
    return snapshotRecords(snapshotFlow, test.latest(snapshotFlow.folder), partition);
  };
  const developmentRecords = recordsOf('development');
  const heldOutRecords = recordsOf('held-out');

  // ---- evaluator mappings through run and score: each partition's evaluator is handed and answers its own view (Story 1.107) ----
  // A command evaluator judges every trial. `contract.json` carries the development-only and the shared oracle and criteria, the plan the
  // held-out ones, and each run's evaluator reads the mapping of its own view: the stub prints a row for each step it is handed, so the
  // keys a partition's evaluator prints, and the oracles and criteria its records dispose and score, are those of its view.
  const commandFlow = planProject('plan-command-flow', null, null, { rubric: true });
  const evaluatorLog = path.join(commandFlow.directory, 'evaluator-input.jsonl');
  const evaluatorStdins = () =>
    fs.existsSync(evaluatorLog)
      ? fs
          .readFileSync(evaluatorLog, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line).stdin)
      : [];
  const STEP_IDS = ['shared-run', 'development-run', 'held-out-run'];
  const MAPPED = {
    development: {
      steps: ['shared-run', 'development-run'],
      oracles: ['O-001', 'O-002'],
      criteria: ['R-001/RC-001', 'R-001/RC-002'],
    },
    'held-out': { steps: ['shared-run', 'held-out-run'], oracles: ['O-001', 'O-101'], criteria: ['R-001/RC-002', 'R-101/RC-101'] },
    both: {
      steps: STEP_IDS,
      oracles: ['O-001', 'O-002', 'O-101'],
      criteria: ['R-001/RC-001', 'R-001/RC-002', 'R-101/RC-101'],
    },
  };
  const mappedRun = (partition) => {
    const from = evaluatorStdins().length;
    const flag = partition === 'both' ? [] : ['--partition', partition];
    const ran = cli(commandFlow, 'run', flag);
    assert.equal(ran.status, 0, `${partition}: ${ran.output}`);
    const run = test.latest(commandFlow.folder);
    const scored = cli(commandFlow, 'score', ['--run', path.basename(run)]);
    assert.equal(scored.status, 0, `${partition}: ${scored.output}`);
    const stdins = evaluatorStdins().slice(from);
    const records = fs
      .readdirSync(path.join(run, 'trial-sets'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => filesUnder(path.join(run, 'trial-sets', entry.name)).filter((file) => /record-\d+\.json$/.test(file)))
      .map((file) => read(file));
    return { run, stdins, records, output: `${ran.output}${scored.output}` };
  };
  const mappedChecks = (partition, { run, stdins, records, output }, keepOut, outputKeepOut) => {
    const expected = MAPPED[partition];
    assert.equal(stdins.length > 0, true, `${partition}: the evaluator was never called`);
    // The evaluator's own recorded stdin, as it read it: the brief and the observations of the view, and none of the other partition.
    const stepsHanded = new Set();
    for (const stdin of stdins) {
      const input = JSON.parse(stdin);
      assert.deepEqual(Object.keys(input).sort(), ['observations', 'sealedBrief']);
      for (const observation of input.observations) {
        const step = STEP_IDS.find((id) => observation.observationId.endsWith(`-${id}`));
        if (step !== undefined) stepsHanded.add(step);
      }
      assert.deepEqual(
        keepOut.filter((token) => stdin.includes(token)),
        [],
        `${partition}: the evaluator's stdin holds the other partition`,
      );
    }
    assert.deepEqual(
      [...stepsHanded].sort(),
      [...expected.steps].sort(),
      `${partition}: the evaluator was handed other steps than its view's`,
    );
    assert.deepEqual(
      [...new Set(records.flatMap((record) => record.oracleDispositions.map((entry) => entry.oracleId)))].sort(),
      expected.oracles,
      `${partition}: the records dispose other oracles than its view's`,
    );
    assert.deepEqual(
      [...new Set(records.flatMap((record) => record.judgeResults.map((entry) => `${entry.rubricId}/${entry.criterionId}`)))].sort(),
      expected.criteria,
      `${partition}: the records score other criteria than its view's`,
    );
    const calibration = read(path.join(run, 'judge-calibration.json'));
    assert.deepEqual(
      calibration.criteria.map((entry) => `${entry.rubricId}/${entry.criterionId}`).sort(),
      expected.criteria,
      `${partition}: calibration judged other criteria than its view's`,
    );
    assert.equal(
      stdins.filter((stdin) => stdin.includes('calibration response')).length,
      2 * expected.criteria.length,
      `${partition}: the evaluator calibrated other items than its view's`,
    );
    assert.deepEqual(holding(run, keepOut), [], `${partition}: the run directory holds the other partition`);
    // The development partition reads, executes and digests the evaluator's own files, so they spell nothing of the held-out one.
    if (partition === 'development')
      assert.deepEqual(
        holding(path.join(commandFlow.folder, 'evaluator'), keepOut),
        [],
        'the evaluator tree a development run reads holds the held-out partition',
      );
    assert.deepEqual(
      outputKeepOut.filter((token) => output.includes(token)),
      [],
      `${partition}: a command named the other partition`,
    );
    return JSON.parse(outcomes(run)).map(([probeId, outcome]) => [probeId, outcome.caught]);
  };
  const mappedDevelopment = mappedRun('development');
  assert.deepEqual(viewOf(mappedDevelopment.run).oracles, MAPPED.development.oracles);
  assert.deepEqual(
    mappedChecks('development', mappedDevelopment, MAPPING_KEEP_OUT.development, KEEP_OUT.development),
    [
      ['P-001', false],
      ['P-002', true],
      ['P-004', true],
    ],
    'the development run, judged by the command evaluator, did not catch what the deterministic evaluator catches',
  );
  const mappedHeldOut = mappedRun('held-out');
  assert.deepEqual(viewOf(mappedHeldOut.run).oracles, MAPPED['held-out'].oracles);
  assert.deepEqual(
    mappedChecks('held-out', mappedHeldOut, MAPPING_KEEP_OUT['held-out'], KEEP_OUT['held-out']),
    [['P-003', true]],
    'the held-out run, judged by the command evaluator, did not catch the held-out defect',
  );
  const mappedBoth = mappedRun('both');
  assert.deepEqual(viewOf(mappedBoth.run).oracles, MAPPED.both.oracles);
  mappedChecks('both', mappedBoth, [], []);
  const mappedPlan = read(path.join(commandFlow.folder, PLAN_FILE));
  assert.equal(
    holding(mappedDevelopment.run, [mappedPlan.mappings[0].key, mappedPlan.mappings[1].key]).length,
    0,
    'the development run holds a held-out row key',
  );

  // A sealed-brief agent is shown the keys of its view, in the prompt of every call it makes (calibration or none, qualification
  // attempts and trials alike). Each partition's run captures every prompt its agent was handed, and none holds the other partition.
  const agentFlow = planProject('plan-agent-flow', null, null, { agent: true });
  const agentCapture = path.join(agentFlow.directory, 'agent-capture.jsonl');
  const capturedPrompts = () =>
    fs.existsSync(agentCapture)
      ? fs
          .readFileSync(agentCapture, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line).prompt)
      : [];
  // An evaluator attempt of a both run is scored as its probe's own partition scores it (Story 1.110): the call of a probe of B-002
  // is handed the oracle its partition lists, and an attempt of a development or held-out run is handed none.
  const attemptDesignations = (run) => {
    const found = {};
    for (const file of filesUnder(path.join(run, 'evaluator-qualification')).filter((entry) => path.basename(entry) === 'score.json')) {
      const probeId = path.basename(path.dirname(file));
      (found[probeId] ??= new Set()).add(designatedBy(file));
    }
    return Object.fromEntries(Object.entries(found).map(([probeId, designated]) => [probeId, [...designated]]));
  };
  for (const partition of ['development', 'held-out']) {
    const from = capturedPrompts().length;
    const ran = cli(agentFlow, 'run', ['--partition', partition]);
    assert.equal(ran.status, 0, `${partition}: ${ran.output}`);
    const prompts = capturedPrompts().slice(from);
    assert.equal(prompts.length > 0, true, `${partition}: the agent was never called`);
    const designated = Object.values(attemptDesignations(test.latest(agentFlow.folder))).flat();
    assert.ok(designated.length > 0, `${partition}: no evaluator attempt was scored`);
    assert.deepEqual(
      designated,
      designated.map(() => null),
      `${partition}: an evaluator attempt was handed a designated oracle`,
    );
    const keys = (prompt) =>
      JSON.parse(prompt.slice(prompt.indexOf(MATERIAL_HEADING) + MATERIAL_HEADING.length)).keys.map((entry) => entry.key);
    const expected =
      partition === 'development' ? ['verdict-accepted', 'accepted:development-run'] : ['verdict-accepted', 'accepted:held-out-run'];
    for (const prompt of prompts) {
      assert.deepEqual(keys(prompt), expected, `${partition}: the agent was shown other keys than its view's`);
      assert.deepEqual(
        MAPPING_KEEP_OUT[partition].filter((token) => prompt.includes(token)),
        [],
        `${partition}: the agent's prompt holds the other partition`,
      );
    }
  }

  const agentBoth = cli(agentFlow, 'run');
  assert.equal(agentBoth.status, 0, agentBoth.output);
  assert.deepEqual(
    attemptDesignations(test.latest(agentFlow.folder)),
    { 'P-001': [null], 'P-002': [null], 'P-003': ['O-101'], 'P-004': ['O-002'] },
    'an evaluator attempt of the both view was not scored against its own partition oracle',
  );

  // The tree digest a run records covers the files its partition reads: the mapping of its view in place of the file. A development
  // run's digest therefore depends on no held-out row (the plan is never opened), a held-out run's on no development-only row, and
  // a view that changes nothing digests the file as it is. The layer is read over a scratch evaluation folder with a stand-in
  // engine whose digests are real hashes, so a changed byte changes the digest.
  const standIn = {
    digestBytes: (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
    digestArtifact: (value, kind) =>
      `sha256:${crypto
        .createHash('sha256')
        .update(`${kind}${JSON.stringify(value)}`)
        .digest('hex')}`,
  };
  const layerFolder = path.join(commandFlow.directory, 'layer-unit');
  // `indent` is the width the file's JSON is written in: the runtime serializes a view with two, so a file written with another width
  // shows whether the digest took the view's bytes or the file's.
  const layerOf = (partition, { mapping = mappingSource, plan = mappingPlan, planned = true, indent = 2 } = {}) => {
    fs.rmSync(layerFolder, { recursive: true, force: true });
    fs.cpSync(EVALUATOR_FIXTURE, path.join(layerFolder, 'evaluator'), { recursive: true });
    fs.writeFileSync(path.join(layerFolder, 'evaluator/mapping.json'), `${JSON.stringify(mapping, null, indent)}\n`);
    const manifest = {
      evaluator: { kind: 'command', command: 'evaluator/rows.js', args: [], timeoutMs: 1000 },
      ...(planned ? { partitionPlan: evaluation.partitionPlan } : {}),
    };
    const derived = contractView({ contractBytes: rubricBytes, evaluation: manifest, heldOutPlan: plan, partition });
    return readEvaluatorLayer({ folder: layerFolder, evaluation: manifest, contract: derived.contract, engine: standIn, view: derived });
  };
  const rawDigest = (mapping) => {
    const files = ['evaluator/frameworks.json', 'evaluator/mapping.json', 'evaluator/rows.js'].map((file) => ({
      path: file,
      sha256: crypto
        .createHash('sha256')
        .update(file === 'evaluator/mapping.json' ? JSON.stringify(mapping, null, 2) + '\n' : fs.readFileSync(path.join(layerFolder, file)))
        .digest('hex'),
    }));
    return standIn.digestArtifact(files, 'evaluator-tree');
  };
  const edited = (key, change) => ({ ...mappingSource, keys: { ...mappingSource.keys, [key]: { ...mappingSource.keys[key], ...change } } });
  // A key renamed in place stays a row of the same view, so each view still reads it.
  const renamed = (key, to) => ({
    ...mappingSource,
    keys: Object.fromEntries(Object.entries(mappingSource.keys).map(([name, binding]) => [name === key ? to : name, binding])),
  });
  const developmentDigest = (mapping) => layerOf('development', { mapping }).treeDigest;
  const heldOutDigest = (mapping, plan) => layerOf('held-out', { mapping, plan }).treeDigest;
  const baseline = { development: developmentDigest(mappingSource), 'held-out': heldOutDigest(mappingSource, mappingPlan) };
  assert.equal(layerOf('development').treeDigest, rawDigest(mappingSource), 'the development digest is not over the file as it is');
  // A row only the held-out partition drops does not move the held-out digest, and one it keeps does; the development digest moves
  // for both, and never for a plan row (it never opens the plan).
  assert.equal(heldOutDigest(edited('accepted:development-run', { behaviorId: 'B-001' }), mappingPlan), baseline['held-out']);
  assert.equal(heldOutDigest(edited('score:development-run', { levels: [0, 1, 2] }), mappingPlan), baseline['held-out']);
  assert.equal(heldOutDigest(edited('score:RC-003', { levels: [0, 1, 2] }), mappingPlan), baseline['held-out']);
  assert.notEqual(heldOutDigest(renamed('accepted:shared-run', 'accepted:shared'), mappingPlan), baseline['held-out']);
  assert.notEqual(heldOutDigest(renamed('score:shared-run', 'score:shared'), mappingPlan), baseline['held-out']);
  assert.notEqual(developmentDigest(renamed('accepted:development-run', 'accepted:development')), baseline.development);
  assert.notEqual(developmentDigest(renamed('score:development-run', 'score:development')), baseline.development);
  const otherRows = HELD_OUT_ROWS.map((row, index) => (index === 0 ? { ...row, key: 'accepted:held-out-run-2' } : row));
  assert.notEqual(
    heldOutDigest(mappingSource, { ...mappingPlan, mappings: otherRows }),
    baseline['held-out'],
    'a plan row left the digest alone',
  );
  assert.equal(layerOf('development', { plan: { ...mappingPlan, mappings: otherRows } }).treeDigest, baseline.development);
  // The held-out digest moves with the rows the view holds and never with a development-only row that came or went: with no plan
  // `mappings`, deleting every development-only row leaves it where it was.
  const sharedOnlyMapping = {
    schemaVersion: 1,
    keys: { 'accepted:shared-run': SHARED_ROW, 'score:shared-run': criterionRow('R-001', SHARED_CRITERION) },
  };
  // Both files are written with four-space indentation, so a view that returned the file's bytes for the shared-only file would digest
  // them as written, and the digest would move.
  assert.equal(
    layerOf('held-out', { mapping: sharedOnlyMapping, plan: heldOutPlan, indent: 4 }).treeDigest,
    layerOf('held-out', { mapping: mappingSource, plan: heldOutPlan, indent: 4 }).treeDigest,
    'the held-out digest moved when the last development-only rows were deleted',
  );
  // The both view digests the mapping it holds: every row of the file, then the plan's, and it moves when a plan row does.
  const bothMapping = {
    ...mappingSource,
    keys: { ...mappingSource.keys, ...Object.fromEntries(HELD_OUT_ROWS.map(({ key, ...binding }) => [key, binding])) },
  };
  assert.equal(layerOf('both').treeDigest, rawDigest(bothMapping), 'the both digest is not over the both mapping');
  assert.notEqual(layerOf('both').treeDigest, rawDigest(mappingSource), 'the both digest is over the file as it is');
  assert.notEqual(
    layerOf('both', { plan: { ...mappingPlan, mappings: otherRows } }).treeDigest,
    layerOf('both').treeDigest,
    'a plan row left the both digest alone',
  );
  // Without a plan the digest is the file's, in every partition.
  for (const partition of ['development', 'held-out'])
    assert.equal(layerOf(partition, { planned: false }).treeDigest, rawDigest(mappingSource), `${partition}: no plan changed the digest`);
  // The layer's mapping is the view's, and a row the held-out view drops and the plan's row stand where `mappingView` puts them.
  assert.deepEqual(Object.keys(layerOf('held-out').mapping.keys), [
    'accepted:shared-run',
    'score:shared-run',
    'accepted:held-out-run',
    'score:held-out-run',
  ]);
  assert.deepEqual(Object.keys(layerOf('development').mapping.keys), Object.keys(mappingSource.keys));
  // A held-out row in the file the development run reads stops the run's layer, naming the file's own key.
  assert.throws(
    () => layerOf('development', { mapping: { ...mappingSource, keys: { ...mappingSource.keys, 'accepted:held-out-run': HELD_OUT_ROW } } }),
    (error) =>
      error instanceof EvaluatorLayerError &&
      /key accepted:held-out-run binds oracle O-101, which the contract does not declare/.test(error.message),
  );
  // A plan row that repeats a file key stops the held-out layer with the row's place and no key.
  assert.throws(
    () => layerOf('held-out', { plan: { ...mappingPlan, mappings: [{ key: 'accepted:shared-run', ...HELD_OUT_ROW }] } }),
    (error) =>
      error instanceof EvaluatorLayerError &&
      /mappings\[0\] has a key/.test(error.message) &&
      !error.message.includes('accepted:shared-run'),
  );

  // ---- records through run and score: a harness's sealed records name only what the run's view declares (Story 1.107) ------------
  // The harness here is the deterministic evaluator's own output for each partition (the records it sealed, its configuration and each
  // set's isolation manifest), placed in `sealed-records/`. Each is a valid import for the partition it was sealed for, since the brief
  // of a view is the brief of the same view in any run.
  const recordsFlow = planProject('plan-records-flow');
  write(path.join(recordsFlow.folder, 'evaluation.json'), {
    ...read(path.join(recordsFlow.folder, 'evaluation.json')),
    evaluator: { kind: 'records', records: 'sealed-records' },
  });
  fs.mkdirSync(path.join(recordsFlow.folder, 'sealed-records'));
  assert.equal(cli(recordsFlow, 'digest').status, 0);
  const recordsDirectory = path.join(recordsFlow.folder, 'sealed-records');
  const placeRecords = (source) => {
    fs.rmSync(recordsDirectory, { recursive: true, force: true });
    fs.cpSync(source, recordsDirectory, { recursive: true });
  };
  const recordsRun = (partition) => {
    const ran = cli(recordsFlow, 'run', ['--partition', partition]);
    return { ...ran, run: fs.existsSync(path.join(recordsFlow.folder, 'runs')) ? test.latest(recordsFlow.folder) : null };
  };
  const recordsOutcomes = (partition) => {
    const ran = recordsRun(partition);
    assert.equal(ran.status, 0, `${partition}: ${ran.output}`);
    const scored = cli(recordsFlow, 'score', ['--run', path.basename(ran.run)]);
    assert.equal(scored.status, 0, `${partition}: ${scored.output}`);
    assert.deepEqual(holding(ran.run, KEEP_OUT[partition]), [], `${partition}: the records run holds the other partition`);
    return JSON.parse(outcomes(ran.run)).map(([probeId, outcome]) => [probeId, outcome.caught]);
  };
  // Each partition's own records import and score as the deterministic evaluator's did, so a records evaluator has a home beside a plan.
  placeRecords(developmentRecords);
  assert.deepEqual(recordsOutcomes('development'), [
    ['P-001', false],
    ['P-002', true],
    ['P-004', true],
  ]);
  placeRecords(heldOutRecords);
  assert.deepEqual(recordsOutcomes('held-out'), [['P-003', true]]);
  // A record that names an oracle, a behavior or a criterion its view lacks is refused with nothing copied (exit 10), wherever the
  // record keeps it: here a development record that disposes a held-out oracle, a finding that answers one and another that names a
  // behavior no contract declares, and a score for a held-out criterion. The message names where each sits and never what it names.
  const patchRecord = (source, probeId, edit) => {
    placeRecords(source);
    const file = path.join(recordsDirectory, probeId, 'record-1.json');
    const record = read(file);
    edit(record);
    write(file, record);
    return record;
  };
  const refused = (partition, expected, absent) => {
    const ran = recordsRun(partition);
    assert.equal(ran.status, 10, `${partition}: ${ran.output}`);
    assert.match(ran.output, /the records evaluator's records cannot be scored: sealed-records\/P-00\d\/record-1\.json carries /);
    for (const text of expected) assert.ok(ran.output.includes(text), `${partition}: the refusal does not name ${text}:\n${ran.output}`);
    assert.deepEqual(
      absent.filter((token) => ran.output.includes(token)),
      [],
      `${partition}: the refusal printed the other partition's text:\n${ran.output}`,
    );
    assert.deepEqual(holding(ran.run, absent), [], `${partition}: the refused run holds the other partition`);
    assert.equal(
      fs.existsSync(path.join(ran.run, 'trial-sets')) && filesUnder(path.join(ran.run, 'trial-sets')).length > 0,
      false,
      `${partition}: a refused import copied records`,
    );
  };
  const developmentRecord = patchRecord(developmentRecords, 'P-002', (record) => {
    record.oracleDispositions.push({ oracleId: 'O-101', disposition: 'held', observationIds: [], note: null });
    record.findings.push(
      { ...record.findings[0], findingId: 'F-091', oracleId: 'O-101' },
      { ...record.findings[0], findingId: 'F-092', behaviorId: 'B-999' },
    );
    record.judgeResults.push({ rubricId: 'R-101', criterionId: 'RC-101', score: 1, note: null });
  });
  const recordedAt = (record) => [
    `oracleDispositions[${record.oracleDispositions.length - 1}]`,
    `findings[${record.findings.length - 2}].oracleId`,
    `findings[${record.findings.length - 1}].behaviorId`,
    'judgeResults[0]',
  ];
  refused('development', [...recordedAt(developmentRecord), 'the development view does not declare'], ['O-101', 'B-999', 'RC-101', CANARY]);
  const heldOutRecord = patchRecord(heldOutRecords, 'P-003', (record) => {
    record.oracleDispositions.unshift({ oracleId: 'O-002', disposition: 'held', observationIds: [], note: null });
    record.findings.push({ ...record.findings[0], findingId: 'F-091', oracleId: 'O-002' });
  });
  refused(
    'held-out',
    ['oracleDispositions[0]', `findings[${heldOutRecord.findings.length - 1}].oracleId`, 'the held-out view does not declare'],
    ['O-002', 'development-run'],
  );
  // A record also holds the plan steps its observations record, each with its call inputs and every response channel, named
  // `<label>-<stepId>`. A development run never opens the plan, so it cannot know a held-out step ID, and only an allowlist (an ID
  // is `<run label>-<a step the view declares>` or `<run label>-call-<n>`) refuses it under every spelling a harness might give it:
  // TeA's own `trial-1-` form, the `baseline-` label of the baseline arm, no label at all and a label of the harness's own. The other
  // partition's observation is refused wherever it sits in the array (first and last alike), the refusal names its place and no ID, and
  // nothing of it reaches the run directory: not the step's ID and not the request that carries the canary.
  const observationOf = (source, probeId, stepId) => {
    const record = read(path.join(source, probeId, 'record-1.json'));
    const found = record.observations.find((observation) => observation.observationId.endsWith(`-${stepId}`));
    assert.ok(found, `${probeId} records no ${stepId} observation`);
    return found;
  };
  const withObservation = (source, probeId, observation, position) =>
    patchRecord(source, probeId, (record) => {
      const added = { ...structuredClone(observation), sequence: Math.max(...record.observations.map((entry) => entry.sequence)) + 1 };
      if (position === 'first') record.observations.unshift(added);
      else record.observations.push(added);
    });
  const heldOutObservation = observationOf(heldOutRecords, 'P-003', 'held-out-run');
  assert.ok(JSON.stringify(heldOutObservation).includes(CANARY), 'the held-out observation carries none of the held-out request');
  const developmentObservation = observationOf(developmentRecords, 'P-002', 'development-run');
  const respelled = (observation, spelling) => ({ ...observation, observationId: spelling(observation.observationId) });
  const spellings = [
    (id) => id,
    (id) => id.replace(/^trial-1/, 'baseline'),
    (id) => id.replace(/^trial-1-/, ''),
    (id) => id.replace(/^trial-1/, 'obs'),
  ];
  for (const spelling of spellings) {
    for (const position of ['first', 'last']) {
      const foreign = withObservation(developmentRecords, 'P-002', respelled(heldOutObservation, spelling), position);
      refused(
        'development',
        [`observations[${position === 'first' ? 0 : foreign.observations.length - 1}]`, 'the development view does not declare'],
        [...KEEP_OUT.development, spelling(heldOutObservation.observationId)],
      );
      const other = withObservation(heldOutRecords, 'P-003', respelled(developmentObservation, spelling), position);
      refused(
        'held-out',
        [`observations[${position === 'first' ? 0 : other.observations.length - 1}]`, 'the held-out view does not declare'],
        [...KEEP_OUT['held-out'], spelling(developmentObservation.observationId)],
      );
    }
  }
  // A citation names an observation the record holds: a development record whose disposition or finding cites the held-out
  // observation (which it does not hold) is refused wherever the citation sits in the list, and the step ID reaches neither the
  // output nor the run directory, where `score` would print it.
  for (const [where, cite] of [
    ['oracleDispositions[0]', (record) => record.oracleDispositions[0]],
    ['findings[0]', (record) => record.findings[0]],
  ]) {
    for (const position of ['first', 'last']) {
      const record = patchRecord(developmentRecords, 'P-002', (patched) => {
        const cited = cite(patched).observationIds;
        if (position === 'first') cited.unshift(heldOutObservation.observationId);
        else cited.push(heldOutObservation.observationId);
      });
      const cited = cite(record).observationIds;
      refused(
        'development',
        [`${where}.observationIds[${position === 'first' ? 0 : cited.length - 1}]`, 'the development view does not declare'],
        [...KEEP_OUT.development, heldOutObservation.observationId],
      );
    }
  }

  // ---- gameability: each view answers the steps of its own partition from the answers that partition keeps (Story 1.109) ---------
  // The answers an arm is handed are those of the steps its view declares, whichever files were read: a view that was handed the other
  // partition's answers, or a file that holds a step the view does not declare, passes none of them on.
  const mainAnswers = { 'shared-run': SHARED_ANSWER, 'development-run': DEVELOPMENT_ANSWER };
  const heldOutAnswers = { 'held-out-run': HELD_OUT_ANSWER };
  const answersOf = (options) => Object.keys(answersForView(options));
  assert.deepEqual(answersOf({ steps: mainAnswers, stepIds: ['shared-run', 'development-run'] }), ['shared-run', 'development-run']);
  assert.deepEqual(
    answersOf({ steps: { ...heldOutAnswers, ...mainAnswers }, stepIds: ['shared-run', 'development-run'] }),
    ['shared-run', 'development-run'],
    'a development view was handed a held-out answer that sat in the development file',
  );
  assert.deepEqual(
    answersOf({ steps: mainAnswers, heldOutSteps: heldOutAnswers, stepIds: ['shared-run', 'development-run'] }),
    ['shared-run', 'development-run'],
    'a development view was handed the held-out answers',
  );
  assert.deepEqual(
    answersOf({ steps: mainAnswers, heldOutSteps: heldOutAnswers, stepIds: ['shared-run', 'held-out-run'] }),
    ['shared-run', 'held-out-run'],
    'a held-out view keeps a development-only answer or lacks its own',
  );
  assert.deepEqual(
    answersOf({ steps: mainAnswers, heldOutSteps: heldOutAnswers, stepIds: ['held-out-run', 'development-run', 'shared-run'] }),
    ['held-out-run', 'development-run', 'shared-run'],
  );
  assert.deepEqual(
    answersForView({ steps: mainAnswers, heldOutSteps: heldOutAnswers, stepIds: ['shared-run', 'development-run', 'held-out-run'] }),
    { ...mainAnswers, ...heldOutAnswers },
  );
  assert.deepEqual(answersForView({ steps: mainAnswers, heldOutSteps: heldOutAnswers, stepIds: [] }), {});
  // A step ID has the shape `constructor` admits, so an answer is looked up as an own key and never as what every object inherits.
  assert.deepEqual(
    answersForView({ steps: mainAnswers, heldOutSteps: { constructor: HELD_OUT_ANSWER }, stepIds: ['constructor'] }),
    { constructor: HELD_OUT_ANSWER },
    'a held-out step named constructor was not answered from its own key',
  );
  assert.deepEqual(answersForView({ steps: { constructor: DEVELOPMENT_ANSWER }, heldOutSteps: {}, stepIds: ['constructor'] }), {
    constructor: DEVELOPMENT_ANSWER,
  });
  assert.deepEqual(
    answersForView({ steps: mainAnswers, heldOutSteps: heldOutAnswers, stepIds: ['constructor', 'toString'] }),
    {},
    'a step named after an inherited member was answered with it',
  );

  // `check` over a folder with gameability probes: the 1.51 refusal is gone, and every answer has a home.
  const gamed = planProject('plan-gameability-check', null, null, null, {});
  const GAME_PROBES = ['P-005', 'P-006'];
  /** `text` as a pattern that matches it and nothing else. */
  const exact = (text) => text.replaceAll(/[./]/g, String.raw`\$&`);
  const gameSnapshot = path.join(gamed.directory, 'game-snapshot');
  const GAME_PATHS = ['contract.json', 'evaluation.json', 'corpus', 'corpus-index.json', 'probes', 'mutations'];
  for (const entry of GAME_PATHS) fs.cpSync(path.join(gamed.folder, entry), path.join(gameSnapshot, entry), { recursive: true });
  const restoreGame = () => {
    for (const entry of GAME_PATHS) {
      fs.rmSync(path.join(gamed.folder, entry), { recursive: true, force: true });
      fs.cpSync(path.join(gameSnapshot, entry), path.join(gamed.folder, entry), { recursive: true });
    }
  };
  const changeGame = (file, edit) => {
    const value = read(path.join(gamed.folder, file));
    edit(value);
    write(path.join(gamed.folder, file), value);
  };
  const answersFile = (probeId, heldOut) => `${heldOut ? HELD_OUT_ANSWERS_DIR : 'corpus/gameability'}/${probeId}.json`;
  const changeAnswers = (probeId, heldOut, edit) => changeGame(answersFile(probeId, heldOut), (value) => edit(value.steps));
  /**
   * A command over an edited copy of the gameability folder, restored afterwards; the corpus index follows the edit unless `stale`.
   * `cleanup` runs first, for an edit that leaves a path the restore could not remove (a mode that denies the owner).
   */
  const gameRan = (edit, { command = 'check', args = [], stale = false, cleanup = () => {} } = {}) => {
    try {
      edit();
      if (!stale) assert.equal(cli(gamed, 'digest').status, 0);
      return cli(gamed, command, args);
    } finally {
      cleanup();
      restoreGame();
    }
  };
  const gamePristine = cli(gamed, 'check');
  assert.equal(gamePristine.status, 0, `check refused a gameability probe beside a partitionPlan\n${gamePristine.output}`);
  assert.doesNotMatch(gamePristine.output, /does not partition gameability probes/);
  const ghostKey = 'canary-/interactions/free text';
  // A key of lower-case letters, digits and hyphens that still fails the step ID's shape (a trailing hyphen) is free text too.
  const hyphenKey = 'canary-';
  const gameFindings = [];
  for (const probeId of GAME_PROBES) {
    // P-005 comes first and P-006 last in the folder, so a rule that reads only the first or the last probe passes one of each pair.
    const [main, heldOut] = [answersFile(probeId, false), answersFile(probeId, true)];
    gameFindings.push(
      [
        `a development answer left out of ${probeId}`,
        () => changeAnswers(probeId, false, (steps) => delete steps['development-run']),
        new RegExp(
          `${exact(main)}.*answers no response for interaction plan step development-run, so the gameability arm cannot run the plan`,
        ),
      ],
      [
        `a held-out answer left out of ${probeId}`,
        () => changeAnswers(probeId, true, (steps) => delete steps['held-out-run']),
        new RegExp(
          `${exact(heldOut)}.*answers no response for held-out plan step held-out-run, so the gameability arm cannot run the held-out and both views`,
        ),
      ],
      [
        `the held-out answers of ${probeId} absent`,
        () => fs.rmSync(path.join(gamed.folder, heldOut)),
        new RegExp(
          `probes/${probeId}\\.probe\\.json takes the gameability route under a partitionPlan whose held-out plan declares a step, and ${exact(heldOut)} is absent`,
        ),
      ],
      [
        `a development step answered in the held-out answers of ${probeId}`,
        () => changeAnswers(probeId, true, (steps) => (steps['development-run'] = DEVELOPMENT_ANSWER)),
        new RegExp(`${exact(heldOut)}.*answers step development-run, which the held-out plan does not declare`),
      ],
      [
        `a held-out step answered in the development answers of ${probeId}`,
        () => changeAnswers(probeId, false, (steps) => (steps['held-out-run'] = HELD_OUT_ANSWER)),
        new RegExp(`${exact(main)}.*answers step held-out-run, which the contract's interaction plan does not declare`),
      ],
      [
        `a held-out answer of another kind for ${probeId}`,
        () => changeAnswers(probeId, true, (steps) => (steps['held-out-run'] = { status: 200 })),
        /answers step held-out-run, a command, with an HTTP request's response, so the gameability arm cannot answer it/,
      ],
      [
        `an infrastructure exit code in a held-out answer of ${probeId}`,
        () => changeAnswers(probeId, true, (steps) => (steps['held-out-run'] = { ...HELD_OUT_ANSWER, exitCode: 3 })),
        /step held-out-run exits 3, which its registry entry declares as an infrastructure exit code/,
      ],
    );
  }
  gameFindings.push(
    [
      'a free-text step in the held-out answers, first',
      () =>
        changeAnswers('P-005', true, (steps) => {
          const kept = { ...steps };
          for (const key of Object.keys(steps)) delete steps[key];
          steps[ghostKey] = HELD_OUT_ANSWER;
          Object.assign(steps, kept);
        }),
      /corpus\/held-out\/gameability\/P-005\.json.*answers step steps entry 0, which the held-out plan does not declare/,
    ],
    [
      'a free-text step in the held-out answers, last',
      () => changeAnswers('P-006', true, (steps) => (steps[ghostKey] = HELD_OUT_ANSWER)),
      /corpus\/held-out\/gameability\/P-006\.json.*answers step steps entry 1, which the held-out plan does not declare/,
    ],
    [
      'an off-shape step of lower-case letters, digits and hyphens in the held-out answers',
      () => changeAnswers('P-006', true, (steps) => (steps[hyphenKey] = HELD_OUT_ANSWER)),
      /corpus\/held-out\/gameability\/P-006\.json.*answers step steps entry 1, which the held-out plan does not declare/,
    ],
    [
      'a held-out plan step named constructor that no answer covers',
      () =>
        changeGame(PLAN_FILE, (plan) => {
          plan.interactionPlan.push({ ...structuredClone(plan.interactionPlan[0]), stepId: 'constructor' });
        }),
      /answers no response for held-out plan step constructor, so the gameability arm cannot run the held-out and both views/,
    ],
    [
      'a held-out answer off its schema',
      () => changeAnswers('P-005', true, (steps) => (steps['held-out-run'] = { stdout: 'canary-schema-text' })),
      /corpus\/held-out\/gameability\/P-005\.json: \[gameability\] \/steps\/\* must/,
    ],
    [
      'an unparsable held-out answers file',
      () => write(path.join(gamed.folder, answersFile('P-006', true)), 'canary-garbage {"steps": ['),
      /corpus\/held-out\/gameability\/P-006\.json does not parse as JSON/,
    ],
    [
      'the naive oracle of a held-out probe that reads a development-only step',
      () => {
        changeGame('contract.json', (contract) => {
          const oracle = structuredClone(contract.oracles.find((candidate) => candidate.id === 'O-002'));
          contract.oracles.push({ ...oracle, id: 'O-003' });
        });
        changeGame('probes/P-006.probe.json', (probe) => (probe.qualification.naiveOracle = 'O-003'));
      },
      /probes\/P-006\.probe\.json.*qualification\.naiveOracle O-003 reads a development-only step, so the held-out view this held-out probe runs in drops it/,
    ],
    [
      'the naive oracle of a held-out probe that reads a development-only step through its evidence targets alone',
      () => {
        changeGame('contract.json', (contract) => {
          const oracle = structuredClone(contract.oracles.find((candidate) => candidate.id === 'O-001'));
          oracle.direction.evidenceTargets.push('/interactions/development-run/stdout');
          contract.oracles.push({ ...oracle, id: 'O-003' });
        });
        changeGame('probes/P-006.probe.json', (probe) => (probe.qualification.naiveOracle = 'O-003'));
      },
      /probes\/P-006\.probe\.json.*qualification\.naiveOracle O-003 reads a development-only step, so the held-out view this held-out probe runs in drops it/,
    ],
  );
  for (const [name, edit, pattern] of gameFindings) {
    const ran = gameRan(edit);
    assert.equal(ran.status, 10, `${name}: ${ran.output}`);
    assert.match(ran.output, pattern, name);
    assert.equal(ran.output.includes('canary-'), false, `${name}: check quoted a byte of the held-out answers:\n${ran.output}`);
  }
  // The same oracle is a fine naive oracle for a development probe, whose arm runs in the development and both views, both of
  // which hold it.
  const developmentNaive = gameRan(() => {
    changeGame('contract.json', (contract) => {
      contract.oracles.push({ ...structuredClone(contract.oracles.find((candidate) => candidate.id === 'O-002')), id: 'O-003' });
    });
    changeGame('probes/P-005.probe.json', (probe) => (probe.qualification.naiveOracle = 'O-003'));
  });
  assert.doesNotMatch(developmentNaive.output, /reads a development-only step/, developmentNaive.output);
  // A probe whose ID is no `P-NNN` is named by its own file, and no file under corpus/held-out/gameability/ is read for it.
  const pathProbe = gameRan(() => {
    changeGame('probes/P-005.probe.json', (probe) => (probe.probeId = 'escape-probe'));
    fs.renameSync(path.join(gamed.folder, 'probes/P-005.probe.json'), path.join(gamed.folder, 'probes/escape-probe.probe.json'));
  });
  assert.doesNotMatch(pathProbe.output, /corpus\/held-out\/gameability\/escape-probe/, pathProbe.output);
  assert.throws(
    () => readHeldOutResponse(gamed.folder, '../plan'),
    (error) => error instanceof PartitionPlanError && /of the form P-NNN/.test(error.message),
  );
  // A held-out plan that declares no step has nothing to answer: the answers are not required, and one that answers a step is named.
  const noHeldOutStep = (edit = () => {}) =>
    gameRan(() => {
      changeGame(PLAN_FILE, (plan) => {
        plan.interactionPlan = [];
        plan.oracles = JSON.parse(JSON.stringify(plan.oracles).replaceAll('held-out-run', 'shared-run'));
      });
      edit();
    });
  const noStepAbsent = noHeldOutStep(() => fs.rmSync(path.join(gamed.folder, HELD_OUT_ANSWERS_DIR), { recursive: true }));
  assert.equal(noStepAbsent.status, 0, noStepAbsent.output);
  const noStepAnswered = noHeldOutStep();
  assert.equal(noStepAnswered.status, 10, noStepAnswered.output);
  assert.match(
    noStepAnswered.output,
    /corpus\/held-out\/gameability\/P-005\.json.*answers step held-out-run, which the held-out plan does not declare/,
  );
  // The run reads the held-out answers only when the plan declares a step: with none, and no answers file, a held-out preflight of the
  // one held-out probe left (a gameability probe over the shared step) qualifies it.
  const noStepRun = gameRan(
    () => {
      changeGame(PLAN_FILE, (plan) => {
        plan.interactionPlan = [];
        // The oracle reads the shared step and wants a verdict the degenerate answer never gives, so the arm violates it.
        plan.oracles = JSON.parse(
          JSON.stringify(plan.oracles)
            .replaceAll('held-out-run', 'shared-run')
            .replaceAll('verdict: accepted', 'verdict: held-out accepted'),
        );
      });
      changeGame('evaluation.json', (evaluation) => (evaluation.heldOutProbes = ['P-006']));
      fs.rmSync(path.join(gamed.folder, 'probes/P-003.probe.json'));
      fs.rmSync(path.join(gamed.folder, 'mutations/M-003.mutation.json'));
      fs.rmSync(path.join(gamed.folder, HELD_OUT_ANSWERS_DIR), { recursive: true });
    },
    { command: 'preflight', args: ['--partition', 'held-out'] },
  );
  assert.equal(noStepRun.status, 0, noStepRun.output);
  assert.match(noStepRun.output, /probes\/P-006\.probe\.json: qualified/);
  // A held-out answers directory that is a link, and an answers file that is one, open nothing the folder does not own.
  const elsewhereAnswers = path.join(gamed.directory, 'elsewhere-answers');
  fs.cpSync(path.join(gamed.folder, HELD_OUT_ANSWERS_DIR), elsewhereAnswers, { recursive: true });
  for (const [name, edit, pattern] of [
    [
      'a linked answers directory',
      () => {
        fs.rmSync(path.join(gamed.folder, HELD_OUT_ANSWERS_DIR), { recursive: true });
        fs.symlinkSync(elsewhereAnswers, path.join(gamed.folder, HELD_OUT_ANSWERS_DIR));
      },
      /\[gameability\] corpus\/held-out\/gameability\/P-005\.json is not directly under corpus\/held-out\/gameability\/ of the evaluation folder$/m,
    ],
    [
      'a linked answers file',
      () => {
        const file = path.join(gamed.folder, answersFile('P-005', true));
        fs.rmSync(file);
        fs.symlinkSync(path.join(elsewhereAnswers, 'P-006.json'), file);
      },
      /\[gameability\] corpus\/held-out\/gameability\/P-005\.json is not a regular file$/m,
    ],
  ]) {
    const ran = gameRan(edit, { stale: true });
    assert.equal(ran.status, 10, `${name}: ${ran.output}`);
    assert.match(ran.output, pattern, name);
  }
  // A contract error elsewhere blames no answer: a plan that fails its schema is the only finding, whatever the answers hold.
  const planBroken = gameRan(() => {
    changeGame(PLAN_FILE, (plan) => (plan['canary-top-level'] = 'canary-top-value'));
    changeAnswers('P-005', true, (steps) => delete steps['held-out-run']);
  });
  assert.equal(planBroken.status, 10, planBroken.output);
  assert.doesNotMatch(planBroken.output, /\[gameability\]/, 'a plan that fails its schema was held to its answers');
  assert.equal(planBroken.output.includes('canary-'), false, planBroken.output);

  // A development partition never opens the held-out answers, so a file it cannot read, one that is absent and one edited since the
  // index was written change nothing for it, and a held-out or both run refuses what it cannot read.
  const onDevelopment = () => ({ args: ['--partition', 'development'] });
  for (const [name, edit] of [
    ['unparsable answers', () => write(path.join(gamed.folder, answersFile('P-005', true)), 'canary-garbage {"steps": [')],
    ['absent answers', () => fs.rmSync(path.join(gamed.folder, HELD_OUT_ANSWERS_DIR), { recursive: true })],
  ]) {
    for (const command of ['preflight', 'run']) {
      const before = launchCount(gamed);
      const development = gameRan(edit, { command, ...onDevelopment() });
      assert.equal(development.status, 0, `${name}: a development ${command} opened the held-out answers\n${development.output}`);
      assert.ok(launchesSince(gamed, before).length > 0, `${name}: the development ${command} launched nothing`);
      assert.equal(development.output.includes('canary-garbage'), false, development.output);
    }
    for (const [command, args] of [
      ['preflight', ['--partition', 'held-out']],
      ['run', []],
    ]) {
      const refused = gameRan(edit, { command, args });
      assert.equal(refused.status, 10, `${name} ${command} ${args.join(' ')}: ${refused.output}`);
      assert.match(
        refused.output,
        /corpus\/held-out\/gameability\/P-005\.json|probes\/P-005\.probe\.json takes the gameability route under a partitionPlan/,
      );
      assert.equal(refused.output.includes('canary-garbage'), false, refused.output);
    }
  }
  // The held-out files are sealed from a development run: whatever sits at their paths, a link, a FIFO or a path nobody may open, a
  // development run refuses none of it (the corpus index comparison neither lists nor opens it, and the tree reading lists the folder
  // and takes `lstat` metadata alone), and a held-out run, a both run and `check` refuse it by path with no stack. A mode that denies
  // the owner proves nothing for root.
  const answersDirectory = path.join(gamed.folder, HELD_OUT_ANSWERS_DIR);
  const answersPath = (probeId) => path.join(gamed.folder, answersFile(probeId, true));
  const planPath = path.join(gamed.folder, PLAN_FILE);
  // Whatever sits directly under `corpus/held-out/`, outside `gameability/` and not the plan, is sealed the same way: a development
  // run's index comparison and tree reading decide the whole folder by its path.
  const heldOutDirectory = path.join(gamed.folder, 'corpus', 'held-out');
  const deniesOwner = process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() !== 0;
  const ownerHolds = (file, mode) => () => fs.chmodSync(file, mode);
  const sealedCases = [
    [
      'a linked answers file',
      () => {
        fs.rmSync(answersPath('P-005'));
        fs.symlinkSync(path.join(elsewhereAnswers, 'P-006.json'), answersPath('P-005'));
      },
      /corpus\/held-out\/gameability\/P-005\.json/,
    ],
    [
      'a linked answers directory',
      () => {
        fs.rmSync(answersDirectory, { recursive: true });
        fs.symlinkSync(elsewhereAnswers, answersDirectory);
      },
      /corpus\/held-out\/gameability/,
    ],
    [
      'a FIFO in place of an answers file',
      () => {
        fs.rmSync(answersPath('P-005'));
        const made = spawnSync('mkfifo', [answersPath('P-005')]);
        assert.equal(made.status, 0, `mkfifo failed: ${made.stderr}`);
      },
      /corpus\/held-out\/gameability\/P-005\.json/,
    ],
    [
      'a link directly under the held-out folder',
      () => fs.symlinkSync(path.join(elsewhereAnswers, 'P-006.json'), path.join(heldOutDirectory, 'link.json')),
      /corpus\/held-out\/link\.json/,
      undefined,
      'corpus/held-out/link.json',
    ],
    [
      'a FIFO directly under the held-out folder',
      () => {
        const made = spawnSync('mkfifo', [path.join(heldOutDirectory, 'pipe.json')]);
        assert.equal(made.status, 0, `mkfifo failed: ${made.stderr}`);
      },
      /corpus\/held-out\/pipe\.json/,
      undefined,
      'corpus/held-out/pipe.json',
    ],
    [
      'an edited file directly under the held-out folder',
      () => {
        write(path.join(heldOutDirectory, 'other.json'), { schemaVersion: 1 });
        assert.equal(cli(gamed, 'digest').status, 0);
        fs.appendFileSync(path.join(heldOutDirectory, 'other.json'), '\n');
      },
      /corpus-index\.json is stale.*corpus\/held-out\/other\.json changed or added/,
      undefined,
      'corpus/held-out/other.json',
    ],
  ];
  if (deniesOwner) {
    const notesDirectory = path.join(heldOutDirectory, 'notes');
    sealedCases.push(
      [
        'an answers directory nobody may open',
        () => fs.chmodSync(answersDirectory, 0),
        /corpus\/held-out\/gameability/,
        ownerHolds(answersDirectory, 0o755),
      ],
      [
        'an answers file nobody may open',
        () => fs.chmodSync(answersPath('P-005'), 0),
        /corpus\/held-out\/gameability\/P-005\.json/,
        ownerHolds(answersPath('P-005'), 0o644),
      ],
      ['a held-out plan nobody may open', () => fs.chmodSync(planPath, 0), /corpus\/held-out\/plan\.json/, ownerHolds(planPath, 0o644)],
      [
        'a directory directly under the held-out folder nobody may list',
        () => {
          fs.mkdirSync(notesDirectory);
          write(path.join(notesDirectory, 'a.json'), { schemaVersion: 1 });
          fs.chmodSync(notesDirectory, 0);
        },
        /corpus\/held-out\/notes/,
        ownerHolds(notesDirectory, 0o755),
        'corpus/held-out/notes',
      ],
    );
  }
  for (const [name, edit, pattern, cleanup, place = 'corpus/held-out/gameability'] of sealedCases) {
    for (const command of ['preflight', 'run']) {
      const before = launchCount(gamed);
      const development = gameRan(edit, { command, ...onDevelopment(), stale: true, cleanup });
      assert.equal(development.status, 0, `${name}: a development ${command} read the sealed path\n${development.output}`);
      assert.ok(launchesSince(gamed, before).length > 0, `${name}: the development ${command} launched nothing`);
      assert.equal(
        development.output.includes(place),
        false,
        `${name}: a development ${command} named a sealed path\n${development.output}`,
      );
    }
    for (const [command, args] of [
      ['preflight', ['--partition', 'held-out']],
      ['run', []],
      ['check', []],
    ]) {
      const refused = gameRan(edit, { command, args, stale: true, cleanup });
      assert.equal(refused.status, 10, `${name}, ${command} ${args.join(' ')}: ${refused.output}`);
      assert.match(refused.output, pattern, `${name}, ${command} ${args.join(' ')}`);
      assert.doesNotMatch(
        refused.output,
        /\n\s+at \S+ \(|node:internal|scandir/,
        `${name}, ${command}: the refusal is a stack\n${refused.output}`,
      );
    }
  }
  // A directory spelled in another case is no folder the answers sit in: a case-insensitive file system resolves its path to the same
  // place, so the on-disk spelling decides, and a case-sensitive one has no such directory. Either way `check` and a held-out or both
  // run refuse the file by path, and a development run leaves the directory alone.
  const variantSpelling = () => {
    fs.renameSync(answersDirectory, `${answersDirectory}-moving`);
    fs.renameSync(`${answersDirectory}-moving`, path.join(path.dirname(answersDirectory), 'Gameability'));
  };
  const variantPattern = /corpus\/held-out\/gameability\/P-005\.json.*(is not directly under|is absent)/;
  for (const command of ['preflight', 'run']) {
    const development = gameRan(variantSpelling, { command, ...onDevelopment(), stale: true });
    assert.equal(development.status, 0, `a case-variant answers directory reached a development ${command}\n${development.output}`);
    assert.equal(development.output.includes('Gameability'), false, development.output);
  }
  for (const [command, args] of [
    ['preflight', ['--partition', 'held-out']],
    ['run', []],
    ['check', []],
  ]) {
    const refused = gameRan(variantSpelling, { command, args, stale: true });
    assert.equal(refused.status, 10, `a case-variant answers directory, ${command} ${args.join(' ')}: ${refused.output}`);
    assert.match(refused.output, variantPattern, `a case-variant answers directory, ${command} ${args.join(' ')}`);
  }
  // The plan's directory spelled in another case is no folder the plan sits in: the on-disk spelling decides for `check` and a held-out
  // or both run, which refuse `corpus/held-out/plan.json` by path, and a development run leaves the variant directory sealed, so a
  // file under it that nobody may open changes nothing for it (a mode that denies the owner proves nothing for root).
  const variantDirectory = path.join(gamed.folder, 'corpus', 'Held-Out');
  const variantPlanDirectory = () => {
    fs.renameSync(heldOutDirectory, `${heldOutDirectory}-moving`);
    fs.renameSync(`${heldOutDirectory}-moving`, variantDirectory);
  };
  const variantPlanDenied = () => {
    variantPlanDirectory();
    fs.chmodSync(path.join(variantDirectory, 'plan.json'), 0);
  };
  const variantPlanCleanup = ownerHolds(path.join(variantDirectory, 'plan.json'), 0o644);
  for (const [name, edit, cleanup] of [
    ['a case-variant plan directory', variantPlanDirectory, undefined],
    ...(deniesOwner ? [['a case-variant plan directory holding a plan nobody may open', variantPlanDenied, variantPlanCleanup]] : []),
  ]) {
    for (const command of ['preflight', 'run']) {
      const development = gameRan(edit, { command, ...onDevelopment(), stale: true, cleanup });
      assert.equal(development.status, 0, `${name} reached a development ${command}\n${development.output}`);
      assert.equal(development.output.includes('Held-Out'), false, development.output);
    }
  }
  for (const [command, args] of [
    ['preflight', ['--partition', 'held-out']],
    ['run', []],
    ['check', []],
  ]) {
    // The index follows the edit, so the refusal is the plan reader's and no stale index stands in for it.
    const refused = gameRan(variantPlanDirectory, { command, args });
    assert.equal(refused.status, 10, `a case-variant plan directory, ${command} ${args.join(' ')}: ${refused.output}`);
    assert.match(
      refused.output,
      /corpus\/held-out\/plan\.json (is not directly under corpus\/held-out\/ of the evaluation folder|cannot be read \(ENOENT\))/,
      `a case-variant plan directory, ${command} ${args.join(' ')}`,
    );
    assert.doesNotMatch(
      refused.output,
      /stale/,
      `a case-variant plan directory, ${command} ${args.join(' ')}: a stale index stood in\n${refused.output}`,
    );
    assert.doesNotMatch(
      refused.output,
      /\n\s+at \S+ \(|node:internal/,
      `a case-variant plan directory, ${command}: a stack\n${refused.output}`,
    );
  }
  const staleAnswers = () => fs.appendFileSync(path.join(gamed.folder, answersFile('P-006', true)), '\n');
  const developmentStale = gameRan(staleAnswers, { command: 'preflight', args: ['--partition', 'development'], stale: true });
  assert.equal(
    developmentStale.status,
    0,
    `an edit to the held-out answers is a stale index for a development run\n${developmentStale.output}`,
  );
  for (const [command, args] of [
    ['preflight', ['--partition', 'held-out']],
    ['run', []],
    ['check', []],
  ]) {
    const stale = gameRan(staleAnswers, { command, args, stale: true });
    assert.equal(stale.status, 10, `${command} ${args.join(' ')}: ${stale.output}`);
    assert.match(stale.output, /corpus-index\.json is stale.*corpus\/held-out\/gameability\/P-006\.json changed or added/);
  }
  // A held-out answer that satisfies the disciplined oracle does not qualify the probe (exit 11), and the message names the held-out
  // answers beside the response file, since either could hold the answer that games nothing.
  const wrongAnswer = gameRan(
    () => changeAnswers('P-006', true, (steps) => (steps['held-out-run'] = { ...HELD_OUT_ANSWER, stdout: 'verdict: accepted\n' })),
    { command: 'preflight', args: ['--partition', 'held-out'] },
  );
  assert.equal(wrongAnswer.status, 11, wrongAnswer.output);
  assert.match(
    wrongAnswer.output,
    /over the degenerate response corpus\/gameability\/P-006\.json and corpus\/held-out\/gameability\/P-006\.json, the disciplined oracle O-101 of B-002 is held where it must be violated/,
  );
  // A development file never holds a held-out step: a development answer file that does is refused by a development run at `check`.
  const misplacedAnswer = gameRan(() => changeAnswers('P-005', false, (steps) => (steps['held-out-run'] = HELD_OUT_ANSWER)), {
    command: 'preflight',
    args: ['--partition', 'development'],
  });
  assert.equal(misplacedAnswer.status, 10, misplacedAnswer.output);
  assert.match(
    misplacedAnswer.output,
    /corpus\/gameability\/P-005\.json.*answers step held-out-run, which the contract's interaction plan does not declare/,
  );

  // ---- gameability through preflight, run and score: each partition answers its own steps (Story 1.109) ---------------------------
  const gameFlow = planProject('plan-gameability-flow', null, null, null, {});
  const GAME_KEEP_OUT = {
    development: [...KEEP_OUT.development, 'corpus/held-out/gameability', HELD_OUT_ANSWER.stdout.trim()],
    'held-out': [...KEEP_OUT['held-out'], DEVELOPMENT_ANSWER.stdout.trim()],
  };
  const sha = (file) => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
  const developmentFiles = filesUnder(gameFlow.folder).filter((file) => {
    const relative = path.relative(gameFlow.folder, file).split(path.sep).join('/');
    return !/^(runs|baseline|corpus\/held-out)\//.test(relative);
  });
  assert.ok(developmentFiles.length > 0);
  assert.deepEqual(
    developmentFiles.flatMap((file) =>
      ['held-out-run', CANARY, 'O-101']
        .filter((token) => fs.readFileSync(file, 'utf8').includes(token))
        .map((token) => `${path.relative(gameFlow.folder, file)}: ${token}`),
    ),
    [],
    'a development file of the gameability folder holds a held-out step',
  );
  /** The steps a gameability arm of `run` answered, with what each was answered, and the response record its evidence names. */
  const arm = (run, probeId, phase) => {
    const evidence = read(path.join(run, 'qualification', probeId, 'naive-oracle-satisfied.json'));
    const trial = read(path.join(run, 'trials', `gameability-${probeId}`, 'trial-1.json'));
    assert.deepEqual(
      trial.degenerateResponse,
      evidence.degenerateResponse,
      `${phase}: the trial and its qualification name different answers`,
    );
    return {
      steps: trial.steps.map((step) => step.stepId),
      qualified: evidence.steps.map((step) => step.stepId),
      stdout: Object.fromEntries(trial.steps.map((step) => [step.stepId, step.observation.stdout.value])),
      response: trial.degenerateResponse,
    };
  };
  const mainOf = (probeId) => ({
    path: `corpus/gameability/${probeId}.json`,
    digest: sha(path.join(gameFlow.folder, `corpus/gameability/${probeId}.json`)),
  });
  const heldOutOf = (probeId) => ({
    path: answersFile(probeId, true),
    digest: sha(path.join(gameFlow.folder, answersFile(probeId, true))),
  });
  const gameLog = { development: [], 'held-out': [], both: [] };
  for (const [partition, args] of [
    ['development', ['--partition', 'development']],
    ['held-out', ['--partition', 'held-out']],
    ['both', []],
  ]) {
    const ran = cli(gameFlow, 'run', args);
    assert.equal(ran.status, 0, `${partition}: ${ran.output}`);
    gameLog[partition].push(ran.output);
    const run = test.latest(gameFlow.folder);
    const scored = cli(gameFlow, 'score', ['--run', path.basename(run)]);
    assert.equal(scored.status, 0, `${partition}: ${scored.output}`);
    gameLog[partition].push(scored.output);
    const armed = fs.readdirSync(path.join(run, 'trials')).filter((name) => name.startsWith('gameability-'));
    if (partition === 'development') {
      assert.deepEqual(armed, ['gameability-P-005']);
      const answered = arm(run, 'P-005', partition);
      assert.deepEqual(answered.steps, ['shared-run', 'development-run']);
      assert.deepEqual(answered.qualified, ['shared-run', 'development-run']);
      assert.equal(answered.stdout['development-run'], DEVELOPMENT_ANSWER.stdout);
      assert.deepEqual(answered.response, mainOf('P-005'), 'a development arm names the held-out answers');
      assert.deepEqual(holding(run, GAME_KEEP_OUT.development), [], 'the development run holds the held-out partition');
      assert.equal(JSON.parse(outcomes(run)).find(([probeId]) => probeId === 'P-005')[1].caught, true);
    } else if (partition === 'held-out') {
      assert.deepEqual(armed, ['gameability-P-006']);
      const answered = arm(run, 'P-006', partition);
      assert.deepEqual(answered.steps, ['shared-run', 'held-out-run']);
      assert.deepEqual(answered.qualified, ['shared-run', 'held-out-run']);
      assert.equal(answered.stdout['held-out-run'], HELD_OUT_ANSWER.stdout);
      assert.deepEqual(answered.response, { ...mainOf('P-006'), heldOut: heldOutOf('P-006') });
      assert.deepEqual(holding(run, GAME_KEEP_OUT['held-out']), [], 'the held-out run holds the development partition');
      assert.equal(JSON.parse(outcomes(run)).find(([probeId]) => probeId === 'P-006')[1].caught, true);
    } else {
      assert.deepEqual(armed, ['gameability-P-005', 'gameability-P-006']);
      for (const probeId of GAME_PROBES) {
        const answered = arm(run, probeId, partition);
        assert.deepEqual(answered.steps, ['shared-run', 'development-run', 'held-out-run']);
        assert.deepEqual(answered.qualified, ['shared-run', 'development-run', 'held-out-run']);
        assert.equal(answered.stdout['development-run'], DEVELOPMENT_ANSWER.stdout);
        assert.equal(answered.stdout['held-out-run'], HELD_OUT_ANSWER.stdout);
        assert.deepEqual(answered.response, { ...mainOf(probeId), heldOut: heldOutOf(probeId) });
      }
      // Each gameability probe of the both view is handed the oracle of its own partition (Story 1.110), so P-005 is scored against O-002
      // and P-006 against O-101, as their partitions' own runs score them, and both are caught.
      assert.deepEqual(
        JSON.parse(outcomes(run))
          .filter(([probeId]) => GAME_PROBES.includes(probeId))
          .map(([probeId, outcome]) => [probeId, outcome.caught]),
        GAME_PROBES.map((probeId) => [probeId, true]),
      );
      const bothScoreDirectory = path.join(run, 'scores', fs.readdirSync(path.join(run, 'scores')).sort().at(-1));
      assert.deepEqual(
        GAME_PROBES.map((probeId) => designatedBy(path.join(bothScoreDirectory, probeId, 'score.json'))),
        ['O-002', 'O-101'],
        'a gameability probe of the both view was not handed its own partition oracle',
      );
    }
    if (partition !== 'both') {
      // A baseline of the partition replays through `ci`, whose gameability check scores the arm over the baseline's own records.
      const accepted = cli(gameFlow, 'compare', ['--run', path.basename(run), '--accept']);
      assert.equal(accepted.status, 0, `${partition}: ${accepted.output}`);
      gameLog[partition].push(accepted.output);
      commit(gameFlow.repository, `${partition} gameability baseline`);
      assert.deepEqual(
        holding(path.join(gameFlow.folder, 'baseline'), GAME_KEEP_OUT[partition]),
        [],
        `the ${partition} gameability replay holds the other partition`,
      );
      const replayed = cli(gameFlow, 'ci', ['--tier', 'pr']);
      assert.equal(replayed.status, 0, `${partition}: ${replayed.output}`);
      assert.doesNotMatch(replayed.output, /stale/, `${partition}: the gameability baseline replays as stale`);
      assert.match(
        replayed.output,
        new RegExp(`${partition === 'development' ? 'P-005' : 'P-006'}: gameability arm scored through eval-quality score, exit 0`),
      );
      gameLog[partition].push(replayed.output);
    }
  }
  assert.deepEqual(
    gameLog.development.flatMap((text) => GAME_KEEP_OUT.development.filter((token) => text.includes(token))),
    [],
    'a development command printed the held-out partition',
  );
  assert.deepEqual(
    gameLog['held-out'].flatMap((text) => GAME_KEEP_OUT['held-out'].filter((token) => text.includes(token))),
    [],
    'a held-out command printed the development partition',
  );

  // An empty held-out set is an authoring defect for preflight, as it is for run.
  const none = test.project('plan-none');
  for (const command of ['preflight', 'run']) {
    const refused = test.cli(none.folder, command, ['--partition', 'held-out'], none.env);
    assert.equal(refused.status, 10, `${command}: ${refused.output}`);
    assert.match(refused.output, /held-out partition has no selected probes/);
  }
  process.stdout.write('Evaluate partition plans (evaluator mappings, records and gameability) passed.\n');
} finally {
  test.cleanup();
}
