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
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PartitionPlanError,
  bothViewDesignation,
  contractView,
  loadBothViewDesignation,
  loadContractView,
  mappingView,
  partitionPlanProblems,
  selectPartition,
  stepsReadBy,
} = require('../cli/lib/evaluate/partition');
const { HeldInputs } = require('../cli/lib/evaluate/score-inputs');
const { ENGINE_CLI_ENV, engineCliPath } = require('../cli/lib/evaluate/engine');
const { rowsValidator } = require('../cli/lib/evaluate/judgment-rows');
const { declaredContent, foreignContent } = require('../cli/lib/evaluate/records-evaluator');
const { MATERIAL_HEADING, evaluatorPrompt } = require('../cli/lib/evaluate/sealed-brief-agent');

const { groupsOf, printGroupsWhenAsked, runs, selectGroup } = require('./lib/case-groups');
const { createHarness } = require('./lib/evaluate-partition-plans-harness');

const {
  FIXTURE,
  PLAN_FILE,
  CANARY,
  SHARED_REQUEST,
  DEVELOPMENT_REQUEST,
  HELD_OUT_REQUEST,
  WITNESSES,
  DEVELOPMENT_WITNESS,
  HELD_OUT_WITNESS,
  KEEP_OUT,
  criterionOf,
  DEVELOPMENT_CRITERION,
  HELD_OUT_CRITERION,
  RUBRIC_KEEP_OUT,
  waiverOf,
  DEVELOPMENT_WAIVER,
  SHARED_WAIVER,
  HELD_OUT_WAIVER,
  HELD_OUT_SHARED_WAIVER,
  WAIVER_KEEP_OUT,
  SHARED_ROW,
  DEVELOPMENT_ROW,
  HELD_OUT_ROW,
  criterionRow,
  MAPPING_KEEP_OUT,
  test,
  read,
  write,
  holding,
  launchesSince,
  launchCount,
  requestsByWorkspace,
  commit,
  sealedBriefAgentLayer,
  judgeCalls,
  judgeCallCount,
  setTiers,
  planProject,
  cli,
  relayContract,
  outcomes,
  viewOf,
  fixtureFolder,
  contractBytes,
  evaluation,
  heldOutPlan,
  rubricSource,
  rubricBytes,
  rubricPlan,
  mappingSource,
  HELD_OUT_ROWS,
  mappingPlan,
  designatedBy,
} = createHarness('tea-evaluate-partition-plans');

/**
 * The suite's sections with the group each belongs to. CI runs the groups as three scripts (`--group=views-and-check`,
 * `--group=preflight-and-run` and `--group=score`, the `test:evaluate-partition-plans-*` scripts) so no one runner carries the
 * whole file's wall time; with no `--group` every section runs, and `--list-groups` prints them and runs none. `test:groups` holds
 * every group to a chained script. A section's block shares its variables only within the block, so what two groups read is
 * declared once, above them.
 */
const SECTIONS = [
  { name: 'the pure views, check and the held-out plan guard', group: 'views-and-check' },
  { name: 'preflight and run, and the folder with no partitionPlan', group: 'preflight-and-run' },
  { name: 'rubrics and waivers through run and score', group: 'score' },
];
const listed = printGroupsWhenAsked(SECTIONS);
const requested = selectGroup(groupsOf(SECTIONS));
if (requested.error) throw new Error(requested.error);
/** Whether the section of this group runs: with no `--group` every section does, and `--list-groups` runs none. */
const runsGroup = (group) => !listed && runs(requested.group, group);

try {
  // What the sections of more than one group read.
  const PROBE_IDS = ['P-001', 'P-002', 'P-003', 'P-004'];
  const probeOf = (probeId) => read(path.join(fixtureFolder, 'probes', `${probeId}.probe.json`));

  if (runsGroup('views-and-check')) {
    // ---- selectPartition and the pure view -------------------------------------------------------------------------------------
    const probes = ['P-001', 'P-002', 'P-003'].map((probeId) => ({ probe: { probeId } }));
    assert.deepEqual(selectPartition({ partition: undefined, heldOutProbes: ['P-003'], probes }), { selectedProbeIds: null });
    assert.deepEqual(
      [...selectPartition({ partition: 'development', heldOutProbes: ['P-003'], probes }).selectedProbeIds],
      ['P-001', 'P-002'],
    );
    assert.deepEqual([...selectPartition({ partition: 'held-out', heldOutProbes: ['P-003'], probes }).selectedProbeIds], ['P-003']);
    assert.equal(selectPartition({ partition: 'unknown', heldOutProbes: [], probes }).refusal.exitCode, 64);
    assert.equal(selectPartition({ partition: 'held-out', heldOutProbes: [], probes }).refusal.exitCode, 10);

    const view = (partition, plan = heldOutPlan) => contractView({ contractBytes, evaluation, heldOutPlan: plan, partition });
    const development = view('development', null);
    assert.equal(development.bytes, contractBytes, 'the development view is the folder bytes, not a copy of them');
    const heldOutView = view('held-out');
    const everything = view('both');
    assert.equal(heldOutView.bytes.toString('utf8'), `${JSON.stringify(heldOutView.contract, null, 2)}\n`);
    assert.deepEqual(
      heldOutView.contract.interactionPlan.map((step) => step.stepId),
      ['shared-run', 'held-out-run'],
    );
    assert.deepEqual(
      heldOutView.contract.oracles.map((oracle) => oracle.id),
      ['O-001', 'O-101'],
    );
    assert.deepEqual(
      heldOutView.contract.behaviors.map((behavior) => behavior.oracles),
      [['O-001'], ['O-101']],
    );
    assert.deepEqual(
      everything.contract.interactionPlan.map((step) => step.stepId),
      ['shared-run', 'development-run', 'held-out-run'],
    );
    assert.deepEqual(
      everything.contract.oracles.map((oracle) => oracle.id),
      ['O-001', 'O-002', 'O-101'],
    );
    assert.deepEqual(
      everything.contract.behaviors.map((behavior) => behavior.oracles),
      [['O-001'], ['O-002', 'O-101']],
    );
    const untouched = (contract) => ({ ...contract, interactionPlan: null, oracles: null, behaviors: null });
    assert.deepEqual(
      untouched(heldOutView.contract),
      untouched(JSON.parse(contractBytes.toString('utf8'))),
      'a view changed more than the plan',
    );
    assert.deepEqual(
      untouched(everything.contract),
      untouched(JSON.parse(contractBytes.toString('utf8'))),
      'a view changed more than the plan',
    );
    // No partitionPlan: every view is the source bytes.
    const unplanned = { ...evaluation };
    delete unplanned.partitionPlan;
    for (const partition of ['development', 'held-out', 'both']) {
      assert.equal(contractView({ contractBytes, evaluation: unplanned, heldOutPlan: null, partition }).bytes, contractBytes);
    }

    // ---- the oracle each probe of a both run is designated (Story 1.110) -------------------------------------------------------
    // A probe belongs to the partition `heldOutProbes` places it in, and is designated the oracle that partition's own view lists for
    // its behavior: B-002 lists O-002 in the development view, O-101 in the held-out view and both in the both view, which designates
    // none itself. B-001 lists O-001 everywhere, so the engine designates it and nothing is passed.
    const designationsOf = (options = {}) => {
      const designate = bothViewDesignation({
        contractBytes,
        evaluation,
        heldOutPlan,
        partition: 'both',
        heldOutProbes: evaluation.heldOutProbes,
        ...options,
      });
      return Object.fromEntries(PROBE_IDS.map((probeId) => [probeId, designate(probeOf(probeId)).oracleId]));
    };
    assert.deepEqual(designationsOf(), { 'P-001': null, 'P-002': null, 'P-003': 'O-101', 'P-004': 'O-002' });
    // `heldOutProbes` decides the partition: swapping it swaps the oracles.
    assert.deepEqual(designationsOf({ heldOutProbes: ['P-004'] }), { 'P-001': null, 'P-002': null, 'P-003': 'O-002', 'P-004': 'O-101' });
    assert.deepEqual(designationsOf({ heldOutProbes: [] }), { 'P-001': null, 'P-002': null, 'P-003': 'O-002', 'P-004': 'O-002' });
    // A development or a held-out run designates nothing, and a development run is handed no plan to read.
    assert.deepEqual(
      designationsOf({ partition: 'development', heldOutPlan: null }),
      Object.fromEntries(PROBE_IDS.map((id) => [id, null])),
    );
    assert.deepEqual(designationsOf({ partition: 'held-out' }), Object.fromEntries(PROBE_IDS.map((id) => [id, null])));
    // With no partitionPlan every view is contract.json and the engine's own rule stands.
    assert.deepEqual(designationsOf({ evaluation: unplanned, heldOutPlan: null }), Object.fromEntries(PROBE_IDS.map((id) => [id, null])));
    // A folder with no partitionPlan refuses no probe either: the views are the source and the designation is empty (Story 1.110).
    assert.deepEqual(
      bothViewDesignation({ contractBytes, evaluation: unplanned, heldOutPlan: null, partition: 'both', heldOutProbes: [] })({
        probeId: 'P-001',
        behaviorId: 'B-999',
      }),
      { oracleId: null, problem: null, listed: null },
      'a folder with no partitionPlan refused a probe of a behavior the contract lacks',
    );
    // Its both view is `contract.json`, so the list it holds for a behavior is the source's, and the input check holds that list against the
    // run's sealed contract.
    assert.deepEqual(
      bothViewDesignation({ contractBytes, evaluation: unplanned, heldOutPlan: null, partition: 'both', heldOutProbes: [] })(
        probeOf('P-004'),
      ),
      { oracleId: null, problem: null, listed: ['O-002'] },
    );
    // The source with another behavior list: B-002 lists a second development-only oracle (O-003, a copy of O-002 that reads the same
    // development-only step), so its development view lists two oracles and its held-out view still one.
    const severalSource = JSON.parse(contractBytes.toString('utf8'));
    severalSource.oracles.push({ ...structuredClone(severalSource.oracles.find((oracle) => oracle.id === 'O-002')), id: 'O-003' });
    severalSource.behaviors.find((behavior) => behavior.id === 'B-002').oracles = ['O-002', 'O-003'];
    const severalBytes = Buffer.from(JSON.stringify(severalSource));
    assert.deepEqual(
      designationsOf({ contractBytes: severalBytes }),
      { 'P-001': null, 'P-002': null, 'P-003': 'O-101', 'P-004': null },
      'a development view that lists two oracles was designated one, or the held-out view lost its own',
    );
    assert.deepEqual(designationsOf({ contractBytes: severalBytes, heldOutProbes: ['P-003', 'P-004'] }), {
      'P-001': null,
      'P-002': null,
      'P-003': 'O-101',
      'P-004': 'O-101',
    });
    // A both view that lists one oracle is the engine's to designate.
    const lonelyPlan = { ...heldOutPlan, behaviorOracles: {} };
    assert.deepEqual(designationsOf({ heldOutPlan: lonelyPlan }), Object.fromEntries(PROBE_IDS.map((id) => [id, null])));
    // A behavior whose source lists no `oracles` and whose plan lists two held-out ones has several in the both view and none in the
    // development view: the development probe stays undesignated, and no view's missing list throws.
    const bareSource = JSON.parse(contractBytes.toString('utf8'));
    delete bareSource.behaviors.find((behavior) => behavior.id === 'B-002').oracles;
    const twoHeldOut = { ...heldOutPlan, behaviorOracles: { ...heldOutPlan.behaviorOracles, 'B-002': ['O-101', 'O-102'] } };
    assert.deepEqual(
      designationsOf({ contractBytes: Buffer.from(JSON.stringify(bareSource)), heldOutPlan: twoHeldOut }),
      Object.fromEntries(PROBE_IDS.map((id) => [id, null])),
      'a behavior with no oracle list in the source threw or was designated',
    );
    // A partition whose own view lists several oracles leaves its probe undesignated even when another view lists one: B-002 keeps O-002
    // alone in the development view and gains O-101 and O-102 in the held-out view, so the held-out P-003 is handed nothing and does not
    // fall back to the development oracle, and the development P-004 is still handed O-002.
    assert.deepEqual(designationsOf({ heldOutPlan: twoHeldOut }), { 'P-001': null, 'P-002': null, 'P-003': null, 'P-004': 'O-002' });
    assert.deepEqual(designationsOf({ heldOutPlan: twoHeldOut, heldOutProbes: ['P-003', 'P-004'] }), {
      'P-001': null,
      'P-002': null,
      'P-003': null,
      'P-004': null,
    });
    // A clean control on B-002 is designated as a defect probe is: the partition decides, and the probe's class does not.
    const controlOf = (probeId) => ({ probeId, probeClass: 'zero-action', behaviorId: 'B-002', expectedClean: true });
    const controls = (plan) =>
      bothViewDesignation({ contractBytes, evaluation, heldOutPlan: plan, partition: 'both', heldOutProbes: ['P-008'] });
    assert.equal(controls(heldOutPlan)(controlOf('P-007')).oracleId, 'O-002', 'a development clean control was handed another oracle');
    assert.equal(controls(heldOutPlan)(controlOf('P-008')).oracleId, 'O-101', 'a held-out clean control was handed another oracle');
    assert.equal(
      controls(twoHeldOut)(controlOf('P-008')).oracleId,
      null,
      'a held-out clean control of a several-oracle view was designated',
    );
    // The list the both view holds for the probe's behavior is part of the answer, for the input check to hold against the sealed contract.
    assert.deepEqual(
      bothViewDesignation({ contractBytes, evaluation, heldOutPlan, partition: 'both', heldOutProbes: ['P-003'] })(probeOf('P-004')),
      {
        oracleId: 'O-002',
        problem: null,
        listed: ['O-002', 'O-101'],
      },
    );
    assert.equal(
      bothViewDesignation({ contractBytes, evaluation, heldOutPlan: null, partition: 'development', heldOutProbes: [] })(probeOf('P-004'))
        .listed,
      undefined,
      'a development run holds a list the sealed contract is compared with',
    );
    // A probe of a behavior the contract does not hold is refused by IDs of the schema's shape only.
    const designate = bothViewDesignation({ contractBytes, evaluation, heldOutPlan, partition: 'both', heldOutProbes: ['P-003'] });
    assert.deepEqual(designate({ probeId: 'P-003', behaviorId: 'B-999' }), {
      oracleId: null,
      problem: 'P-003 names B-999, which the contract does not hold',
      listed: null,
    });
    assert.deepEqual(designate({ probeId: 'canary-probe', behaviorId: 'canary-behavior' }), {
      oracleId: null,
      problem: 'a probe names a behavior, which the contract does not hold',
      listed: null,
    });
    // The input check holds the folder's list against the sealed contract's where that can change a designation (Story 1.110): a sealed
    // list of several, or a folder that designates an oracle. A behavior ID of no schema shape is named as "a behavior".
    const drift = ({ behaviorId = 'B-002', sealed, answer }) =>
      new HeldInputs({
        engine: null,
        index: { contract: 'sealed-contract.json', trialSets: [{ probe: 'held-probe.json' }] },
        entries: [
          { relative: 'sealed-contract.json', bytes: Buffer.from(JSON.stringify({ behaviors: [{ id: behaviorId, oracles: sealed }] })) },
          { relative: 'held-probe.json', bytes: Buffer.from(JSON.stringify({ probeId: 'P-003', behaviorId })) },
        ],
        designate: () => ({ oracleId: null, problem: null, listed: undefined, ...answer }),
      }).designationFindings();
    const messagesOf = (findings) => findings.map(({ message }) => message);
    assert.deepEqual(drift({ sealed: ['O-002', 'O-101'], answer: { listed: ['O-002', 'O-101'] } }), [], 'the same list was refused');
    assert.equal(drift({ sealed: ['O-002', 'O-101'], answer: { listed: ['O-002'] } }).length, 1, 'a sealed list of several was not held');
    assert.equal(drift({ sealed: ['O-002', 'O-101'], answer: { listed: null } }).length, 1, 'a folder without the behavior was not held');
    assert.deepEqual(drift({ sealed: ['O-001'], answer: { listed: ['O-009'] } }), [], 'a sealed list of one oracle was refused');
    assert.deepEqual(drift({ sealed: ['O-001'], answer: { listed: null } }), [], 'a folder without a single-oracle behavior was refused');
    assert.deepEqual(drift({ sealed: null, answer: { listed: null } }), [], 'a behavior neither side lists was refused');
    assert.equal(
      drift({ sealed: ['O-001'], answer: { listed: ['O-001', 'O-102'], oracleId: 'O-001' } }).length,
      1,
      'a designation was not held',
    );
    assert.deepEqual(drift({ sealed: ['O-002', 'O-101'], answer: { listed: undefined } }), [], 'a run that is not a both run was held');
    const unshaped = drift({ behaviorId: 'canary-behavior-2e7a', sealed: ['O-002', 'O-101'], answer: { listed: ['O-002'] } });
    assert.match(messagesOf(unshaped).join('\n'), /^names a behavior, whose oracles/);
    assert.equal(JSON.stringify(unshaped).includes('canary-behavior-2e7a'), false, 'a finding printed a behavior ID of no schema shape');
    // Over a folder, the files are read for a both run under a plan and for no other run.
    assert.deepEqual(
      Object.fromEntries(
        PROBE_IDS.map((id) => [
          id,
          loadBothViewDesignation({ folder: fixtureFolder, partition: 'both', heldOutProbes: ['P-003'] })(probeOf(id)).oracleId,
        ]),
      ),
      { 'P-001': null, 'P-002': null, 'P-003': 'O-101', 'P-004': 'O-002' },
    );
    // The run record's `heldOutProbes` places the probes, never the folder's `evaluation.json`: the fixture's own list names P-003, and a
    // record that names P-004 swaps the oracles.
    assert.deepEqual(
      Object.fromEntries(
        PROBE_IDS.map((id) => [
          id,
          loadBothViewDesignation({ folder: fixtureFolder, partition: 'both', heldOutProbes: ['P-004'] })(probeOf(id)).oracleId,
        ]),
      ),
      { 'P-001': null, 'P-002': null, 'P-003': 'O-002', 'P-004': 'O-101' },
      'the designation followed the folder heldOutProbes and not the run record',
    );
    for (const partition of ['development', 'held-out', undefined]) {
      const nowhere = path.join(FIXTURE, 'no-such-folder');
      assert.equal(loadBothViewDesignation({ folder: nowhere, partition, heldOutProbes: [] })(probeOf('P-003')).oracleId, null);
    }

    // Steps are read from the structured reference fields only: a pointer operand, a captured binding, evidenceTargets, a rubric
    // criterion's evidence, a waiver's condition and `after`. A literal, a commentary or a scope that spells a pointer is not one.
    const spelledOut = {
      literal: '/interactions/literal-step/stdout',
      commentary: '/interactions/commentary-step/stdout',
      scope: '/interactions/scope-step/stdout',
      check: {
        op: 'equality',
        operands: [{ literal: { pointer: '/interactions/nested-step/stdout' } }, { literal: '/interactions/other-step/stdout' }],
      },
      inputBinding: { stdin: { pointer: { literal: '/interactions/binding-step/stdout' } } },
    };
    assert.deepEqual(stepsReadBy(spelledOut), []);
    assert.deepEqual(
      stepsReadBy({
        after: 'after-step',
        commentary: '/interactions/commentary-step/stdout',
        direction: { evidenceTargets: ['/interactions/target-step/stdout', 'not a pointer'] },
        check: {
          op: 'equality',
          operands: [{ pointer: '/interactions/pointer-step/exit-code' }, { literal: '/interactions/literal-step/stdout' }],
        },
        inputBinding: { stdin: { pointer: { captured: '/interactions/captured-step/stdout' }, other: { literal: 1 } } },
        criteria: [{ evidence: '/interactions/evidence-step/stdout' }],
        condition: '/interactions/condition-step/exit-code is absent',
      }).sort(),
      ['after-step', 'captured-step', 'condition-step', 'evidence-step', 'pointer-step', 'target-step'],
    );
    // A waiver's condition is a sentence: every `/interactions/<stepId>` in it names a step, wherever it sits and with or without a path
    // after the step, while a string that is no whole step ID names none. The other fields read a pointer that starts the string.
    for (const [condition, steps] of [
      ['the exit code at /interactions/held-out-run/exit-code is absent', ['held-out-run']],
      ['when /interactions/development-run/exit-code is absent', ['development-run']],
      ['/interactions/shared-run/exit-code is 0 and /interactions/development-run/exit-code is absent', ['shared-run', 'development-run']],
      ['/interactions/held-out-run is absent', ['held-out-run']],
      ['absent: (/interactions/held-out-run), then /interactions/shared-run.', ['held-out-run', 'shared-run']],
      ['the log at /var/interactions/held-out-run/stdout is absent', ['held-out-run']],
      ['/interactions/interactions/held-out-run', ['interactions', 'held-out-run']],
      ['the target is flaky on Tuesdays', []],
      [
        '/interactions/Held-out-run/exit-code /interactions/held_out/exit-code /interactions/held-Out/stdout /interaction/held-out-run/x',
        [],
      ],
    ])
      assert.deepEqual(stepsReadBy({ condition }), steps, `a waiver condition ${JSON.stringify(condition)} read the wrong steps`);
    assert.deepEqual(stepsReadBy({ condition: null }), []);
    // Only a string is a sentence: a number, an object that holds a pointer and an array of pointers read no step and never throw.
    for (const condition of [7, { pointer: '/interactions/development-run/x' }, ['/interactions/development-run/x']])
      assert.deepEqual(stepsReadBy({ condition }), [], `a non-string condition ${JSON.stringify(condition)} read a step`);
    for (const field of ['pointer', 'captured', 'evidence'])
      assert.deepEqual(
        stepsReadBy({ [field]: 'see /interactions/held-out-run/stdout' }),
        [],
        `a ${field} that does not start with the pointer read a step`,
      );
    // A shared oracle whose literal, commentary or scope spells a development-only pointer stays in the held-out view.
    const spelledSource = JSON.parse(contractBytes.toString('utf8'));
    spelledSource.oracles[0].check.operands.push({
      op: 'containment',
      operands: [{ pointer: '/interactions/shared-run/stdout' }, { literal: '/interactions/development-run/stdout' }],
    });
    spelledSource.oracles[0].commentary = '/interactions/development-run/stdout';
    spelledSource.oracles[0].direction.scope = '/interactions/development-run/exit-code';
    assert.deepEqual(
      contractView({
        contractBytes: Buffer.from(JSON.stringify(spelledSource)),
        evaluation,
        heldOutPlan,
        partition: 'held-out',
      }).contract.oracles.map((oracle) => oracle.id),
      ['O-001', 'O-101'],
      'a literal that spells a pointer dropped a shared oracle from the held-out view',
    );

    // ---- rubrics: a criterion belongs to the partition whose steps its evidence reads (Story 1.105) -------------------------------
    const rubricView = (partition, plan = rubricPlan) =>
      contractView({ contractBytes: rubricBytes, evaluation, heldOutPlan: plan, partition });
    const criteriaIn = (partition) =>
      rubricView(partition).contract.rubrics.map((rubric) => [rubric.id, rubric.criteria.map((criterion) => criterion.id)]);
    // The development view is the source bytes: it carries the development and shared criteria and never the plan's.
    assert.equal(rubricView('development').bytes, rubricBytes, 'the development view is not the folder bytes');
    assert.deepEqual(
      rubricView('development').contract.rubrics.map((rubric) => rubric.id),
      ['R-001', 'R-002', 'R-003'],
    );
    assert.equal(
      JSON.stringify(rubricView('development').contract).includes('RC-101'),
      false,
      'the development view carries the held-out criterion',
    );
    // The held-out view drops a criterion that reads a development-only step, drops a rubric left with none, keeps a rubric that
    // never had one, and appends the plan's rubrics.
    assert.deepEqual(criteriaIn('held-out'), [
      ['R-001', ['RC-002']],
      ['R-003', []],
      ['R-101', ['RC-101']],
    ]);
    assert.deepEqual(criteriaIn('both'), [
      ['R-001', ['RC-001', 'RC-002']],
      ['R-002', ['RC-003']],
      ['R-003', []],
      ['R-101', ['RC-101']],
    ]);
    assert.deepEqual(
      { ...rubricView('held-out').contract.rubrics[0], criteria: null },
      { ...rubricSource.rubrics[0], criteria: null },
      'the held-out view changed more of a rubric than its criteria',
    );
    // A plan with no `rubrics` appends nothing, so a plan written before rubrics joined it adds none; the held-out view still drops the
    // criteria the held-out partition cannot reach.
    assert.deepEqual(
      rubricView('held-out', heldOutPlan).contract.rubrics.map((rubric) => rubric.id),
      ['R-001', 'R-003'],
    );
    assert.deepEqual(view('held-out').contract.rubrics, []);
    assert.deepEqual(view('both').contract.rubrics, []);

    // ---- waivers: a waiver belongs to the partition whose steps its condition reads (Story 1.106) -------------------------------
    const freeTextWaiver = waiverOf('W-004', 'The target is flaky on Tuesdays.', 'the target is flaky on Tuesdays');
    const waiverSource = JSON.parse(contractBytes.toString('utf8'));
    // A condition is a sentence, so a pointer sits anywhere in it and a second one counts: a waiver that reads a development-only step
    // beside a shared one (W-005), after leading text (W-006) or with no path after the step (W-007) leaves the held-out view, and one
    // that reads a shared step mid-text (W-008) stays. W-009 names the development-only step first and a shared step last, so a read of
    // the last step alone keeps it in the held-out view.
    const proseWaivers = [
      waiverOf(
        'W-005',
        'The development case shares a seed.',
        'the exit code is 0 at /interactions/shared-run/exit-code and absent at /interactions/development-run/exit-code',
      ),
      waiverOf('W-006', 'The development case is flaky in prose.', 'when /interactions/development-run/exit-code is absent'),
      waiverOf('W-007', 'The development case has no run.', 'the run /interactions/development-run is absent.'),
      waiverOf('W-008', 'The shared request has no exit code.', 'the exit code at /interactions/shared-run/exit-code is absent'),
      waiverOf(
        'W-009',
        'The development case outranks the shared one.',
        '/interactions/development-run/exit-code is absent unless /interactions/shared-run/exit-code is 0',
      ),
    ];
    waiverSource.waivers = [
      DEVELOPMENT_WAIVER,
      SHARED_WAIVER,
      waiverOf('W-003', 'No condition applies.', null),
      freeTextWaiver,
      ...proseWaivers,
    ];
    const waiverBytes = Buffer.from(JSON.stringify(waiverSource, null, 4));
    const waiverPlan = {
      ...heldOutPlan,
      waivers: [HELD_OUT_WAIVER, waiverOf('W-102', 'The held-out partition has no seed here.', null), HELD_OUT_SHARED_WAIVER],
    };
    const waiverView = (partition, plan = waiverPlan) =>
      contractView({ contractBytes: waiverBytes, evaluation, heldOutPlan: plan, partition });
    const waiversIn = (partition, plan) => waiverView(partition, plan).contract.waivers.map((waiver) => waiver.id);
    // The development view is the source bytes: it carries the waivers that read a development-only or a shared step, the ones that
    // read none, and never the plan's.
    assert.equal(waiverView('development').bytes, waiverBytes, 'the development view is not the folder bytes');
    assert.deepEqual(waiversIn('development'), ['W-001', 'W-002', 'W-003', 'W-004', 'W-005', 'W-006', 'W-007', 'W-008', 'W-009']);
    assert.equal(
      JSON.stringify(waiverView('development').contract).includes('W-101'),
      false,
      'the development view carries the held-out waiver',
    );
    // The held-out view drops the waiver whose condition reads a development-only step, keeps the shared ones and those whose condition
    // reads no step, and appends the plan's waivers.
    assert.deepEqual(waiversIn('held-out'), ['W-002', 'W-003', 'W-004', 'W-008', 'W-101', 'W-102', 'W-103']);
    assert.deepEqual(waiversIn('both'), [
      'W-001',
      'W-002',
      'W-003',
      'W-004',
      'W-005',
      'W-006',
      'W-007',
      'W-008',
      'W-009',
      'W-101',
      'W-102',
      'W-103',
    ]);
    for (const partition of ['held-out', 'both']) {
      assert.deepEqual(
        waiverView(partition)
          .contract.waivers.slice(0, 4)
          .filter((waiver) => waiver.id === 'W-004'),
        [freeTextWaiver],
        `the ${partition} view changed a waiver`,
      );
    }
    assert.equal(
      JSON.stringify(waiverView('held-out').contract).includes('development-run'),
      false,
      'the held-out view names the development-only step through a waiver',
    );
    assert.deepEqual(
      { ...waiverView('held-out').contract, waivers: null, interactionPlan: null, oracles: null, behaviors: null },
      { ...waiverSource, waivers: null, interactionPlan: null, oracles: null, behaviors: null },
      'the held-out view changed more than the plan and its waivers',
    );
    // A plan waiver the schema never reached is named by its position, whatever its ID and condition say: `check` runs the plan's schema
    // first, so this rule sees only IDs of the schema's shape through the CLI, and the label is held here.
    const unnamed = partitionPlanProblems({
      contract: JSON.parse(waiverBytes.toString('utf8')),
      evaluation,
      heldOutPlan: {
        ...heldOutPlan,
        waivers: [waiverOf('canary-free text', 'canary-rationale', '/interactions/development-run/exit-code canary-condition')],
      },
      heldOutBehaviors: new Set(['B-002']),
    });
    assert.deepEqual(
      unnamed.map((problem) => problem.message),
      ['waiver waivers[0] reads development-only step development-run, which the held-out view does not declare'],
    );
    assert.equal(JSON.stringify(unnamed).includes('canary-'), false, 'a plan waiver finding quoted a free-text ID, rationale or condition');
    // A plan waiver is read whole: a development-only pointer that is the second one, or sits after leading text, is named, and a
    // ghost step read mid-text is flagged without its name.
    const planWaiverFindings = (condition) =>
      partitionPlanProblems({
        contract: JSON.parse(waiverBytes.toString('utf8')),
        evaluation,
        heldOutPlan: { ...heldOutPlan, waivers: [waiverOf('W-101', 'canary-rationale', condition)] },
        heldOutBehaviors: new Set(['B-002']),
      }).map((problem) => problem.message);
    assert.deepEqual(
      planWaiverFindings('the exit code is 0 at /interactions/shared-run/exit-code and absent at /interactions/development-run/exit-code'),
      ['waiver W-101 reads development-only step development-run, which the held-out view does not declare'],
    );
    assert.deepEqual(
      planWaiverFindings('/interactions/development-run/exit-code is absent unless /interactions/shared-run/exit-code is 0'),
      ['waiver W-101 reads development-only step development-run, which the held-out view does not declare'],
    );
    assert.deepEqual(planWaiverFindings('when /interactions/development-run is absent'), [
      'waiver W-101 reads development-only step development-run, which the held-out view does not declare',
    ]);
    assert.deepEqual(planWaiverFindings('the log at /interactions/canary-ghost/stdout is absent'), [
      'waiver W-101 reads a step the held-out view does not declare',
    ]);
    assert.deepEqual(planWaiverFindings('the exit code at /interactions/shared-run/exit-code or /interactions/held-out-run is absent'), []);
    // A `contract.json` waiver is read whole too: a held-out step named mid-text is one the development view lacks.
    assert.deepEqual(
      partitionPlanProblems({
        contract: {
          ...JSON.parse(waiverBytes.toString('utf8')),
          waivers: [waiverOf('W-001', 'r', 'the exit code at /interactions/held-out-run/exit-code is absent')],
        },
        evaluation,
        heldOutPlan,
        heldOutBehaviors: new Set(['B-002']),
      }).map((problem) => problem.message),
      [
        "waiver W-001 reads step held-out-run, which the development view does not declare; a waiver that reads a held-out step belongs in the held-out plan's waivers",
      ],
    );
    // The held-out pointer comes first and a shared one last, so a read of the last step alone finds nothing to name.
    assert.deepEqual(
      partitionPlanProblems({
        contract: {
          ...JSON.parse(waiverBytes.toString('utf8')),
          waivers: [
            waiverOf('W-001', 'r', '/interactions/held-out-run/exit-code is absent unless /interactions/shared-run/exit-code is 0'),
          ],
        },
        evaluation,
        heldOutPlan,
        heldOutBehaviors: new Set(['B-002']),
      }).map((problem) => problem.message),
      [
        "waiver W-001 reads step held-out-run, which the development view does not declare; a waiver that reads a held-out step belongs in the held-out plan's waivers",
      ],
    );
    assert.equal(
      partitionPlanProblems({
        contract: JSON.parse(waiverBytes.toString('utf8')),
        evaluation,
        heldOutPlan: { ...heldOutPlan, waivers: [waiverOf('W-101-canary-x', 'r', null), waiverOf('W-101-canary-x', 'r', null)] },
        heldOutBehaviors: new Set(['B-002']),
      }).some((problem) => /^waiver waivers\[1\] is declared more than once$/.test(problem.message)),
      true,
      'a repeated plan waiver ID of no shape was not named by its position',
    );
    // A plan with no `waivers` appends nothing, so a plan written before waivers joined it adds none; the held-out view still drops the
    // waiver the held-out partition cannot reach.
    assert.deepEqual(waiversIn('held-out', heldOutPlan), ['W-002', 'W-003', 'W-004', 'W-008']);
    assert.deepEqual(view('held-out').contract.waivers, []);
    assert.deepEqual(view('both').contract.waivers, []);
    // A waiver whose rationale, rule and approval spell a pointer is not read: only its condition names a step.
    const spelledWaiver = {
      ...SHARED_WAIVER,
      rationale: '/interactions/development-run/stdout',
      rule: '/interactions/development-run/stdout',
      approval: '/interactions/development-run/stdout',
    };
    const spelledWaivers = JSON.parse(contractBytes.toString('utf8'));
    spelledWaivers.waivers = [spelledWaiver];
    assert.deepEqual(
      contractView({ contractBytes: Buffer.from(JSON.stringify(spelledWaivers)), evaluation, heldOutPlan, partition: 'held-out' }).contract
        .waivers,
      [spelledWaiver],
      'a rationale, rule or approval that spells a pointer dropped a waiver from the held-out view',
    );

    // ---- evaluator mappings: a mapping row belongs to the partition whose view declares what it binds (Story 1.107) ----------------
    // `evaluator/mapping.json` holds the rows of what `contract.json` declares: the shared and the development-only oracle, and the
    // criteria RC-001 and RC-003 (development-only) and RC-002 (shared). The held-out plan's `mappings` hold the rows of what only the
    // held-out partition declares, the oracle O-101 and the criterion RC-101. A row a view does not declare leaves with it.
    const mappingBytes = Buffer.from(JSON.stringify(mappingSource, null, 4));
    const mappingViewOf = (partition, { plan = mappingPlan, bytes = mappingBytes, contract = rubricBytes } = {}) => {
      const derived = contractView({ contractBytes: contract, evaluation, heldOutPlan: plan, partition });
      return mappingView({
        mappingBytes: bytes,
        source: derived.source,
        view: derived.contract,
        evaluation,
        heldOutPlan: derived.heldOutPlan,
        partition,
      });
    };
    const mappingKeysIn = (partition, options) => Object.keys(mappingViewOf(partition, options).mapping.keys);
    // The development view is the source bytes: every row of the file and never the plan's, even when the plan is handed over.
    assert.equal(mappingViewOf('development').bytes, mappingBytes, 'the development mapping is not the folder bytes');
    assert.deepEqual(mappingKeysIn('development'), Object.keys(mappingSource.keys));
    const derivedDevelopment = contractView({ contractBytes: rubricBytes, evaluation, heldOutPlan: mappingPlan, partition: 'development' });
    assert.equal(
      mappingView({
        mappingBytes,
        source: derivedDevelopment.source,
        view: derivedDevelopment.contract,
        evaluation,
        heldOutPlan: mappingPlan,
        partition: 'development',
      }).bytes,
      mappingBytes,
      'the development mapping read the plan',
    );
    // The held-out view drops the rows of the development-only oracle, of a development-only criterion and of a criterion whose rubric
    // went with it, keeps the shared ones in the file's order (the dropped rows come before, between and after them), and appends
    // the plan's rows in the plan's order.
    assert.deepEqual(mappingKeysIn('held-out'), ['accepted:shared-run', 'score:shared-run', 'accepted:held-out-run', 'score:held-out-run']);
    assert.deepEqual(mappingKeysIn('held-out', { plan: { ...mappingPlan, mappings: HELD_OUT_ROWS.toReversed() } }), [
      'accepted:shared-run',
      'score:shared-run',
      'score:held-out-run',
      'accepted:held-out-run',
    ]);
    const heldOutMapping = mappingViewOf('held-out');
    assert.equal(heldOutMapping.bytes.toString('utf8'), `${JSON.stringify(heldOutMapping.mapping, null, 2)}\n`);
    assert.deepEqual(heldOutMapping.mapping.keys['accepted:shared-run'], SHARED_ROW);
    assert.deepEqual(heldOutMapping.mapping.keys['accepted:held-out-run'], HELD_OUT_ROW, 'the key stays out of its binding');
    assert.equal(heldOutMapping.mapping.schemaVersion, 1);
    for (const token of ['accepted:development-run', 'score:development-run', 'score:RC-003', 'O-002'])
      assert.equal(heldOutMapping.bytes.toString('utf8').includes(token), false, `the held-out mapping holds ${token}`);
    assert.deepEqual(mappingKeysIn('both'), [...Object.keys(mappingSource.keys), 'accepted:held-out-run', 'score:held-out-run']);
    // A plan with no `mappings` adds none, and the held-out view still drops what it cannot reach.
    assert.deepEqual(mappingKeysIn('held-out', { plan: rubricPlan }), ['accepted:shared-run', 'score:shared-run']);
    // The both view of a plan with no mappings drops nothing and adds nothing, so it is the source bytes. The held-out view is always
    // serialized, so its bytes depend on the rows it holds and never on whether a development-only row exists: deleting the last
    // development-only row leaves the held-out bytes where they were.
    assert.equal(mappingViewOf('both', { plan: rubricPlan }).bytes, mappingBytes, 'the both mapping changed bytes it had no reason to');
    const sharedOnly = { schemaVersion: 1, keys: { 'accepted:shared-run': SHARED_ROW } };
    const sharedOnlyBytes = Buffer.from(JSON.stringify(sharedOnly, null, 4));
    assert.equal(
      mappingViewOf('held-out', { plan: rubricPlan, bytes: sharedOnlyBytes }).bytes.toString('utf8'),
      `${JSON.stringify(sharedOnly, null, 2)}\n`,
    );
    const withDevelopmentOnly = Buffer.from(
      JSON.stringify({ ...sharedOnly, keys: { ...sharedOnly.keys, 'accepted:development-run': DEVELOPMENT_ROW } }, null, 4),
    );
    assert.deepEqual(
      mappingViewOf('held-out', { plan: rubricPlan, bytes: sharedOnlyBytes }).bytes,
      mappingViewOf('held-out', { plan: rubricPlan, bytes: withDevelopmentOnly }).bytes,
      'the held-out mapping bytes moved when the last development-only row was deleted',
    );
    // Only a row for what the source declares and the view dropped leaves: a row for an oracle that no view declares stays for `check`
    // and the run to refuse, and so does a criterion of a rubric `contract.json` lacks.
    const strayBytes = Buffer.from(
      JSON.stringify(
        {
          schemaVersion: 1,
          keys: {
            'accepted:ghost': { oracleId: 'O-999', behaviorId: 'B-001' },
            'accepted:development-run': DEVELOPMENT_ROW,
            'score:RC-009': { rubricId: 'R-009', criterionId: 'RC-009', levels: [0, 1] },
          },
        },
        null,
        4,
      ),
    );
    assert.deepEqual(mappingKeysIn('held-out', { bytes: strayBytes, plan: rubricPlan }), ['accepted:ghost', 'score:RC-009']);
    // A plan key that the file declares, or an earlier plan row does, cannot yield a view; the message names the row's place and not its key.
    for (const [rows, place] of [
      [[{ key: 'accepted:shared-run', ...HELD_OUT_ROW }], 'mappings[0]'],
      // A row of the file the held-out view dropped still owns its key, so the plan cannot reuse it.
      [[{ key: 'accepted:development-run', ...HELD_OUT_ROW }], 'mappings[0]'],
      [
        [
          { key: 'canary-other', ...HELD_OUT_ROW },
          { key: 'score:development-run', ...criterionRow('R-101', HELD_OUT_CRITERION) },
        ],
        'mappings[1]',
      ],
      [
        [
          { key: 'canary-repeat', ...HELD_OUT_ROW },
          { key: 'canary-other', ...HELD_OUT_ROW },
          { key: 'canary-repeat', ...HELD_OUT_ROW },
        ],
        'mappings[2]',
      ],
    ]) {
      assert.throws(
        () => mappingViewOf('held-out', { plan: { ...mappingPlan, mappings: rows } }),
        (error) =>
          error instanceof PartitionPlanError && error.message.includes(`${place} has a key`) && !/canary-|accepted:/.test(error.message),
        `a plan key that repeats did not stop the held-out mapping at ${place}`,
      );
    }
    // A view the plan does not hold is refused, as the contract view is.
    assert.throws(() => mappingViewOf('held-out', { plan: null }), PartitionPlanError);
    // Each view's row validator accepts the keys of its own mapping and refuses the other partition's: an evaluator that prints a key
    // its partition does not hold fails the judgment-rows schema.
    const answerFor = (key) => ({ rows: [{ key, outcome: 'pass', observationIds: ['x'], comment: 'ok' }] });
    const developmentRows = rowsValidator(mappingViewOf('development').mapping);
    const heldOutRows = rowsValidator(heldOutMapping.mapping);
    assert.deepEqual(developmentRows(answerFor('accepted:development-run')), []);
    assert.notDeepEqual(developmentRows(answerFor('accepted:held-out-run')), [], 'the development rows accept the held-out key');
    assert.deepEqual(heldOutRows(answerFor('accepted:held-out-run')), []);
    assert.notDeepEqual(heldOutRows(answerFor('accepted:development-run')), [], 'the held-out rows accept the development-only key');
    // What each view shows a sealed-brief agent: the keys of its own mapping with the criterion text of its own view, and no key or
    // criterion of the other partition.
    const promptMaterial = (partition) => {
      const derived = contractView({ contractBytes: rubricBytes, evaluation, heldOutPlan: mappingPlan, partition });
      const { mapping } = mappingViewOf(partition);
      const prompt = evaluatorPrompt({ sealedBrief: { brief: 'sealed' }, contract: derived.contract, mapping, nonce: 'a'.repeat(32) });
      return { prompt, keys: JSON.parse(prompt.slice(prompt.indexOf(MATERIAL_HEADING) + MATERIAL_HEADING.length)).keys };
    };
    const developmentPrompt = promptMaterial('development');
    assert.deepEqual(
      developmentPrompt.keys.map((entry) => entry.key),
      Object.keys(mappingSource.keys),
    );
    const heldOutPrompt = promptMaterial('held-out');
    assert.deepEqual(
      heldOutPrompt.keys.map((entry) => entry.key),
      ['accepted:shared-run', 'score:shared-run', 'accepted:held-out-run', 'score:held-out-run'],
    );
    assert.equal(heldOutPrompt.keys.at(-1).criterion, HELD_OUT_CRITERION.text);
    for (const { keys } of [developmentPrompt, heldOutPrompt])
      assert.equal(
        keys.some((entry) => entry.answers === 'rubric criterion' && entry.criterion === null),
        false,
        'a key names a criterion its view lacks',
      );
    assert.deepEqual(
      MAPPING_KEEP_OUT.development.filter((token) => developmentPrompt.prompt.includes(token)),
      [],
      'the development agent was shown the held-out partition',
    );
    assert.deepEqual(
      MAPPING_KEEP_OUT['held-out'].filter((token) => heldOutPrompt.prompt.includes(token)),
      [],
      'the held-out agent was shown the development partition',
    );
    // A sealed run record names only what the view declares (the records evaluator): an oracle, a behavior and a rubric criterion, each
    // where the record keeps it, and the first and the last of a list alike. The criterion is a pair, so another rubric's criterion of
    // the same name is foreign. A finding that answers no oracle or behavior is no foreign content, and no path names an ID.
    const declaredByDevelopment = declaredContent(view('development', null).contract);
    const disposition = (oracleId, observationIds = []) => ({ oracleId, disposition: 'held', observationIds, note: null });
    const finding = (oracleId, behaviorId, observationIds = []) => ({ findingId: 'F-001', oracleId, behaviorId, observationIds });
    const judged = (rubricId, criterionId) => ({ rubricId, criterionId, score: 1, note: null });
    const observed = (observationId) => ({ observationId });
    const recordOf = (parts) => ({ observations: [], oracleDispositions: [], findings: [], judgeResults: [], ...parts });
    assert.deepEqual(foreignContent(recordOf({}), declaredByDevelopment), []);
    assert.deepEqual(
      foreignContent(
        recordOf({ oracleDispositions: [disposition('O-001'), disposition('O-002')], findings: [finding('O-002', 'B-002')] }),
        declaredByDevelopment,
      ),
      [],
    );
    assert.deepEqual(
      foreignContent(recordOf({ oracleDispositions: [disposition('O-101'), disposition('O-001')] }), declaredByDevelopment),
      ['oracleDispositions[0]'],
    );
    assert.deepEqual(
      foreignContent(
        recordOf({ oracleDispositions: [disposition('O-001'), disposition('O-002'), disposition('O-101')] }),
        declaredByDevelopment,
      ),
      ['oracleDispositions[2]'],
    );
    assert.deepEqual(
      foreignContent(
        recordOf({ findings: [finding('O-101', null), finding(null, null), finding('O-001', 'B-999')] }),
        declaredByDevelopment,
      ),
      ['findings[0].oracleId', 'findings[2].behaviorId'],
    );
    assert.deepEqual(
      foreignContent(
        recordOf({ judgeResults: [judged('R-009', 'RC-002'), judged('R-001', 'RC-002')] }),
        declaredContent(rubricView('development').contract),
      ),
      ['judgeResults[0]'],
    );
    assert.deepEqual(
      foreignContent(
        recordOf({ judgeResults: [judged('R-001', 'RC-002'), judged('R-101', 'RC-101')] }),
        declaredContent(rubricView('development').contract),
      ),
      ['judgeResults[1]'],
    );
    // An observation is admitted when its ID is `<run label>-<a step the view declares>` or `<run label>-call-<n>` (a call the agent
    // chose), and every other ID is refused: a development run never opens the plan, so only an allowlist can refuse a held-out step it
    // cannot know. The labels are every form TeA writes an arm under (`RUN_LABELS`).
    const heldOutDeclared = declaredContent(heldOutView.contract);
    assert.deepEqual(
      foreignContent(
        recordOf({
          observations: [
            'trial-1-shared-run',
            'trial-1-development-run',
            'trial-2-call-1',
            'attempt-1-shared-run',
            'baseline-shared-run',
            'degenerate-development-run',
            'mutated-shared-run',
            're-pass-2-development-run',
            'baseline-call-3',
          ].map(observed),
        }),
        declaredByDevelopment,
      ),
      [],
    );
    for (const foreignId of [
      'odd',
      'held-out-run',
      'obs-held-out-run',
      'baseline-held-out-run',
      'degenerate-held-out-run',
      'trial-1-held-out-run',
      'attempt-1-held-out-run',
      'trial-held-out-run',
      'trial-1-shared-run-2',
      'xtrial-1-shared-run',
      'trial-1-call-1-extra',
      'shared-run',
      'calibration',
    ]) {
      assert.deepEqual(
        foreignContent(recordOf({ observations: [observed('trial-1-shared-run'), observed(foreignId)] }), declaredByDevelopment),
        ['observations[1]'],
        `${foreignId} was admitted`,
      );
      assert.deepEqual(
        foreignContent(recordOf({ observations: [observed(foreignId), observed('trial-1-shared-run')] }), declaredByDevelopment),
        ['observations[0]'],
        `${foreignId} was admitted when first`,
      );
    }
    assert.deepEqual(
      foreignContent(recordOf({ observations: ['trial-1-held-out-run', 'trial-1-shared-run'].map(observed) }), declaredByDevelopment),
      ['observations[0]'],
    );
    assert.deepEqual(
      foreignContent(
        recordOf({ observations: ['trial-1-shared-run', 'trial-1-development-run', 'attempt-2-held-out-run'].map(observed) }),
        declaredByDevelopment,
      ),
      ['observations[2]'],
    );
    assert.deepEqual(
      foreignContent(
        recordOf({ observations: ['trial-1-development-run', 'trial-1-shared-run', 'trial-1-held-out-run'].map(observed) }),
        heldOutDeclared,
      ),
      ['observations[0]'],
    );
    assert.deepEqual(
      foreignContent(
        recordOf({
          observations: ['trial-1-shared-run', 'trial-1-held-out-run', 'trial-3-call-2', 'trial-1-development-run'].map(observed),
        }),
        heldOutDeclared,
      ),
      ['observations[3]'],
    );
    assert.equal(
      JSON.stringify(foreignContent(recordOf({ observations: [observed('trial-1-held-out-run')] }), declaredByDevelopment)).includes(
        'held-out',
      ),
      false,
      'a path names the held-out step',
    );
    assert.equal(
      JSON.stringify(foreignContent(recordOf({ oracleDispositions: [disposition('O-101')] }), declaredByDevelopment)).includes('O-101'),
      false,
      'a path names the held-out oracle',
    );
    // A citation is admitted when the record holds the observation it names, so a disposition or a finding cannot carry the other
    // partition's step ID in its citations: each is refused by place, first and last in the list alike, and no path names the ID.
    const held = ['trial-1-shared-run', 'trial-1-development-run'].map(observed);
    const citing = (where, ids) =>
      recordOf({
        observations: held,
        ...(where === 'disposition' ? { oracleDispositions: [disposition('O-001', ids)] } : { findings: [finding('O-001', 'B-002', ids)] }),
      });
    const placeOf = (where) => (where === 'disposition' ? 'oracleDispositions[0]' : 'findings[0]');
    for (const where of ['disposition', 'finding']) {
      assert.deepEqual(foreignContent(citing(where, ['trial-1-shared-run', 'trial-1-development-run']), declaredByDevelopment), []);
      assert.deepEqual(foreignContent(citing(where, []), declaredByDevelopment), []);
      assert.deepEqual(foreignContent(citing(where, ['trial-1-shared-run', 'trial-1-held-out-run']), declaredByDevelopment), [
        `${placeOf(where)}.observationIds[1]`,
      ]);
      assert.deepEqual(foreignContent(citing(where, ['trial-1-held-out-run', 'trial-1-shared-run']), declaredByDevelopment), [
        `${placeOf(where)}.observationIds[0]`,
      ]);
      assert.equal(
        JSON.stringify(foreignContent(citing(where, ['trial-1-held-out-run']), declaredByDevelopment)).includes('held-out'),
        false,
        `a ${where} citation path names the held-out step`,
      );
    }

    // ---- check: one case per rule, naming paths and IDs and never a byte of the plan -------------------------------------------
    const guarded = planProject('plan-check');
    const planFile = path.join(guarded.folder, PLAN_FILE);
    const originals = new Map(
      ['contract.json', 'evaluation.json', PLAN_FILE, 'probes/P-003.probe.json'].map((file) => [
        file,
        fs.readFileSync(path.join(guarded.folder, file)),
      ]),
    );
    const change = (file, edit) => {
      const value = read(path.join(guarded.folder, file));
      edit(value);
      write(path.join(guarded.folder, file), value);
    };
    /** `check` over an edited copy of the folder, restored afterwards; the corpus index follows the edit unless `stale`. */
    const checked = (edit, { stale = false } = {}) => {
      try {
        edit();
        if (!stale) assert.equal(cli(guarded, 'digest').status, 0);
        return cli(guarded, 'check');
      } finally {
        for (const [file, bytes] of originals) fs.writeFileSync(path.join(guarded.folder, file), bytes);
        assert.equal(cli(guarded, 'digest').status, 0);
      }
    };
    const pristine = cli(guarded, 'check');
    assert.equal(pristine.status, 0, pristine.output);
    const findings = [
      [
        'an unknown development-only step',
        () => change('evaluation.json', (value) => value.partitionPlan.developmentOnlySteps.push('missing-run')),
        /partitionPlan\.developmentOnlySteps names step missing-run, which contract\.json does not declare/,
      ],
      [
        'a held-out step ID that a contract step has',
        () => change(PLAN_FILE, (value) => (value.interactionPlan[0].stepId = 'shared-run')),
        /corpus\/held-out\/plan\.json.*step shared-run has the ID of a step contract\.json declares/,
      ],
      [
        'a held-out step ID declared twice',
        () => change(PLAN_FILE, (value) => value.interactionPlan.push(structuredClone(value.interactionPlan[0]))),
        /step held-out-run is declared more than once/,
      ],
      [
        'a held-out step named like a call the agent chose',
        () => change(PLAN_FILE, (value) => (value.interactionPlan[0].stepId = 'call-1')),
        /corpus\/held-out\/plan\.json.*step call-1 has an ID of the form call-<n>, which names a call the agent chose/,
      ],
      [
        'a contract step named like a call the agent chose',
        () => change('contract.json', (contract) => (contract.interactionPlan[0].stepId = 'call-2')),
        /contract\.json.*step call-2 has an ID of the form call-<n>, which names a call the agent chose/,
      ],
      [
        'a held-out oracle ID that a contract oracle has',
        () => change(PLAN_FILE, (value) => (value.oracles[0].id = 'O-001')),
        /oracle O-001 has the ID of an oracle contract\.json declares/,
      ],
      [
        'a held-out step waiting for a development-only step',
        () => change(PLAN_FILE, (value) => (value.interactionPlan[0].after = 'development-run')),
        /step held-out-run reads step development-run, which the held-out view does not declare/,
      ],
      [
        'a shared step waiting for a development-only step',
        () => change('contract.json', (contract) => (contract.interactionPlan[0].after = 'development-run')),
        /contract\.json.*step shared-run reads development-only step development-run, which the held-out view removes/,
      ],
      [
        'a held-out oracle pointing at a step the view does not declare',
        () =>
          change(PLAN_FILE, (value) => {
            value.oracles[0].check.operands[1].operands[0].pointer = '/interactions/development-run/stdout';
          }),
        /oracle O-101 reads step development-run, which the held-out view does not declare/,
      ],
      [
        'a view that empties a behavior of its oracles',
        () => change(PLAN_FILE, (value) => (value.behaviorOracles = {})),
        /behavior B-002 keeps no oracle in the held-out view/,
      ],
      [
        'a behavior of a held-out probe with two oracles in the held-out view',
        () =>
          change(PLAN_FILE, (value) => {
            value.oracles.push({ ...structuredClone(value.oracles[0]), id: 'O-102' });
            value.behaviorOracles['B-002'].push('O-102');
          }),
        /behavior B-002, discharged by a held-out probe, declares 2 oracles in the held-out view; it must declare exactly 1/,
      ],
      [
        'a behaviorOracles entry for an unknown behavior',
        () => change(PLAN_FILE, (value) => (value.behaviorOracles['B-009'] = ['O-101'])),
        /behaviorOracles names behavior B-009, which contract\.json does not declare/,
      ],
      [
        'a behaviorOracles entry naming an oracle the plan does not declare',
        () => change(PLAN_FILE, (value) => value.behaviorOracles['B-002'].push('O-199')),
        /behaviorOracles lists oracle O-199 for behavior B-002, which the held-out plan does not declare/,
      ],
      [
        'a held-out probe with no development probe for its behavior',
        () => change('evaluation.json', (value) => value.heldOutProbes.push('P-004')),
        /P-004 leaves behavior B-002 without a development probe/,
      ],
      [
        'a held-out step that is not a contract step',
        () => change(PLAN_FILE, (value) => (value.interactionPlan[0]['canary-extra'] = 'canary-field-value')),
        /corpus\/held-out\/plan\.json.*interactionPlan\[0\] must NOT have additional properties/,
      ],
      [
        'a held-out plan with an unexpected field',
        () => change(PLAN_FILE, (value) => (value['canary-top-level'] = 'canary-top-value')),
        /corpus\/held-out\/plan\.json.*\(root\) must NOT have additional properties/,
      ],
      [
        'a held-out oracle declared twice',
        () => change(PLAN_FILE, (value) => value.oracles.push(structuredClone(value.oracles[0]))),
        /oracle O-101 is declared more than once/,
      ],
      [
        'an empty heldOutProbes beside a partitionPlan',
        () => change('evaluation.json', (value) => (value.heldOutProbes = [])),
        /partitionPlan declares a held-out plan and heldOutProbes names no probe that runs it/,
      ],
      [
        'a binding key the adopter chose in a held-out step',
        () => change(PLAN_FILE, (value) => (value.interactionPlan[0].inputBinding.stdin['canary-binding'] = { bogus: 1 })),
        /corpus\/held-out\/plan\.json.*interactionPlan\[0\]\/inputBinding\/stdin\/\*/,
      ],
      [
        'a behaviorOracles key the adopter chose',
        () => change(PLAN_FILE, (value) => (value.behaviorOracles['canary-behavior'] = ['O-101'])),
        /corpus\/held-out\/plan\.json.*\/behaviorOracles property name must be valid/,
      ],
      [
        'a free-text step ID declared twice in the held-out plan',
        () =>
          change(PLAN_FILE, (value) => {
            value.interactionPlan[0].stepId = 'canary-free text';
            value.interactionPlan.push(structuredClone(value.interactionPlan[0]));
          }),
        /corpus\/held-out\/plan\.json.*\/interactionPlan\/0\/stepId must match pattern/,
      ],
      [
        'a free-text oracle ID declared twice in the held-out plan',
        () =>
          change(PLAN_FILE, (value) => {
            value.oracles[0].id = 'canary-free text';
            value.oracles.push(structuredClone(value.oracles[0]));
          }),
        /corpus\/held-out\/plan\.json.*\/oracles\/0\/id must match pattern/,
      ],
      [
        'a free-text after clause in the held-out plan',
        () => change(PLAN_FILE, (value) => (value.interactionPlan[0].after = 'canary-free text')),
        /corpus\/held-out\/plan\.json.*interactionPlan\[0\]\/after must/,
      ],
    ];
    for (const [name, edit, pattern] of findings) {
      const ran = checked(edit);
      assert.equal(ran.status, 10, `${name}: ${ran.output}`);
      assert.match(ran.output, pattern, name);
      assert.equal(ran.output.includes('canary-'), false, `${name}: check quoted a byte of the held-out plan:\n${ran.output}`);
    }
    // A command evaluator is no `partition-plan` finding (Story 1.107 replaced the 1.51 refusal with the derivation of its mapping): only
    // what the evaluator itself lacks is named, here the mapping and the framework declaration it has no folder for.
    const commandKind = checked(() =>
      change('evaluation.json', (value) => (value.evaluator = { kind: 'command', command: 'evaluator/judge.sh', timeoutMs: 1000 })),
    );
    assert.equal(commandKind.status, 10, commandKind.output);
    assert.doesNotMatch(commandKind.output, /\[partition-plan\]|requires the deterministic evaluator/, commandKind.output);
    assert.match(commandKind.output, /evaluator\/mapping\.json: \[evaluator\] evaluation\.json's evaluator is command/);
    // An unreadable or unparsable plan is named by path; the parser's own message, which quotes bytes, never appears.
    for (const [name, edit, pattern] of [
      [
        'an unparsable plan',
        () => write(planFile, 'canary-garbage {"interactionPlan": ['),
        /corpus\/held-out\/plan\.json does not parse as JSON/,
      ],
      ['an absent plan', () => fs.rmSync(planFile), /corpus\/held-out\/plan\.json cannot be read \(ENOENT\)/],
    ]) {
      const ran = checked(edit);
      assert.equal(ran.status, 10, `${name}: ${ran.output}`);
      assert.match(ran.output, pattern, name);
      assert.equal(ran.output.includes('canary-'), false, `${name}: ${ran.output}`);
    }
    // A literal, a commentary or a scope that spells a pointer is the adopter's text, never a reference: it is not read, so it
    // is neither a finding nor echoed.
    const spelled = checked(() =>
      change(PLAN_FILE, (value) => {
        value.oracles[0].check.operands.push({
          op: 'containment',
          operands: [{ pointer: '/interactions/held-out-run/stdout' }, { literal: '/interactions/canary-ghost/stdout' }],
        });
        value.oracles[0].commentary = '/interactions/canary-ghost/exit-code is what this reads';
        value.oracles[0].direction.scope = '/interactions/canary-ghost/stdout';
      }),
    );
    assert.equal(spelled.status, 0, spelled.output);
    assert.equal(spelled.output.includes('canary-'), false, spelled.output);
    // A behavior the source declares with no oracle stays legal: the held-out view leaves it none, as the source does.
    const unarmed = checked(() =>
      change('contract.json', (contract) =>
        contract.behaviors.push({ ...structuredClone(contract.behaviors[0]), id: 'B-003', oracles: [] }),
      ),
    );
    assert.equal(unarmed.status, 0, unarmed.output);
    // A path outside corpus/held-out/ opens nothing, whatever the file there holds.
    const outside = path.resolve(guarded.folder, '../../../outside.json');
    // A valid plan with a canary step ID, so a reader that opens it parses, validates and views it instead of failing the plan shape.
    fs.writeFileSync(outside, fs.readFileSync(planFile, 'utf8').replaceAll('held-out-run', 'canary-outside-run'));
    const traversal = checked(() => change('evaluation.json', (value) => (value.partitionPlan.heldOutPlan = '../../../outside.json')));
    assert.equal(traversal.status, 10, traversal.output);
    assert.match(
      traversal.output,
      /partitionPlan\.heldOutPlan "\.\.\/\.\.\/\.\.\/outside\.json" is not a file directly under corpus\/held-out\//,
    );
    assert.doesNotMatch(traversal.output, /must NOT have additional properties|canary-/, 'check read a file outside corpus/held-out/');
    assert.throws(
      () =>
        loadContractView({
          folder: guarded.folder,
          evaluation: {
            ...read(path.join(guarded.folder, 'evaluation.json')),
            partitionPlan: { developmentOnlySteps: [], heldOutPlan: '../../../outside.json' },
          },
          partition: 'held-out',
        }),
      (error) => error instanceof PartitionPlanError && /is not a file directly under corpus\/held-out\//.test(error.message),
    );
    // A corpus directory that is a link to a folder elsewhere holds a file the pattern admits and the folder does not own.
    const elsewhere = path.join(guarded.directory, 'elsewhere');
    fs.mkdirSync(path.join(elsewhere, 'held-out'), { recursive: true });
    fs.copyFileSync(planFile, path.join(elsewhere, 'held-out/plan.json'));
    fs.renameSync(path.join(guarded.folder, 'corpus'), path.join(guarded.folder, 'corpus-real'));
    fs.symlinkSync(elsewhere, path.join(guarded.folder, 'corpus'));
    try {
      assert.throws(
        () =>
          loadContractView({ folder: guarded.folder, evaluation: read(path.join(guarded.folder, 'evaluation.json')), partition: 'both' }),
        /is not directly under corpus\/held-out\/ of the evaluation folder/,
      );
    } finally {
      fs.rmSync(path.join(guarded.folder, 'corpus'));
      fs.renameSync(path.join(guarded.folder, 'corpus-real'), path.join(guarded.folder, 'corpus'));
    }
    // A plan edited after the index was written is a stale index for `check`.
    const staleCheck = checked(() => fs.appendFileSync(planFile, '\n'), { stale: true });
    assert.equal(staleCheck.status, 10, staleCheck.output);
    assert.match(staleCheck.output, /corpus-index\.json is stale.*corpus\/held-out\/plan\.json changed or added/);
    assert.equal(cli(guarded, 'check').status, 0);

    // ---- check over rubrics: each criterion has a home, and one no view reaches is named by its ID (Story 1.105) ----------------
    const rubricGuarded = planProject('plan-rubric-check', {});
    const rubricFiles = [
      'contract.json',
      'evaluation.json',
      PLAN_FILE,
      'policy/judge-calibration.json',
      'policy/evaluator-conditions.json',
    ];
    const rubricOriginals = new Map(rubricFiles.map((file) => [file, fs.readFileSync(path.join(rubricGuarded.folder, file))]));
    const rubricChange = (file, edit) => {
      const value = read(path.join(rubricGuarded.folder, file));
      edit(value);
      write(path.join(rubricGuarded.folder, file), value);
    };
    const rubricChecked = (edit, command = ['check']) => {
      try {
        edit();
        assert.equal(cli(rubricGuarded, 'digest').status, 0);
        return cli(rubricGuarded, command[0], command.slice(1));
      } finally {
        for (const [file, bytes] of rubricOriginals) fs.writeFileSync(path.join(rubricGuarded.folder, file), bytes);
        assert.equal(cli(rubricGuarded, 'digest').status, 0);
      }
    };
    // A development criterion, a shared one and a held-out one together are a valid plan: the 1.51 refusal of a rubric that reads a
    // development-only step is replaced by the derivation, so each criterion has a view.
    const rubricsPristine = cli(rubricGuarded, 'check');
    assert.equal(rubricsPristine.status, 0, rubricsPristine.output);
    // Story 1.51's id-only rule holds over the plan's rubrics: a criterion the plan declares is named by its ID when the ID has the
    // schema's shape and by its index otherwise, and its pointer, channel, member and levels are never printed.
    const idOnlyCases = [
      [
        'a held-out criterion ID of no criterion shape',
        () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].id = 'canary-crit-id')),
        /corpus\/held-out\/plan\.json.*rubrics\[0\]\/criteria\/0\/id must match pattern/,
      ],
      [
        'a held-out scale level that is no integer',
        () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].scaleLevels[1].level = 'canary-level')),
        /corpus\/held-out\/plan\.json.*rubrics\[0\]\/scaleLevels\/1\/level must be integer/,
      ],
      [
        'a held-out criterion reading a channel the engine does not know',
        () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = '/interactions/held-out-run/canary-channel')),
        /corpus\/held-out\/plan\.json.*rubrics\[0\]\/criteria\/0\/evidence must match pattern/,
      ],
      [
        'a held-out criterion reading a member no calibration response holds',
        () => {
          rubricChange(
            PLAN_FILE,
            (plan) => (plan.rubrics[0].criteria[0].evidence = '/interactions/held-out-run/response-body/canary-member'),
          );
          rubricChange('policy/judge-calibration.json', (labelled) => {
            for (const item of labelled.items.filter((entry) => entry.rubricId === 'R-101')) item.response = '{"other":1}';
          });
        },
        /policy\/judge-calibration\.json.*items\[4\] response does not reach the evidence of R-101\/RC-101/,
      ],
      [
        'a held-out criterion reading a call input no calibration response names',
        () =>
          rubricChange(
            PLAN_FILE,
            (plan) => (plan.rubrics[0].criteria[0].evidence = '/interactions/held-out-run/call-inputs/canary-member'),
          ),
        /corpus\/held-out\/plan\.json.*rubrics\[0\]\/criteria\/0\/evidence must match pattern/,
      ],
      [
        'a held-out rubric ID that a contract rubric has, over a criterion ID of no shape',
        () =>
          rubricChange(PLAN_FILE, (plan) => {
            plan.rubrics[0].id = 'R-001';
            plan.rubrics[0].criteria[0].id = 'canary-crit-id';
          }),
        /corpus\/held-out\/plan\.json.*rubric R-001 has the ID of a rubric contract\.json declares/,
      ],
      [
        'a held-out criterion of no criterion shape reading a development-only step',
        () =>
          rubricChange(PLAN_FILE, (plan) => {
            plan.rubrics[0].criteria[0].id = 'canary-crit-id';
            plan.rubrics[0].criteria[0].evidence = '/interactions/development-run/stdout';
          }),
        /corpus\/held-out\/plan\.json.*criterion criteria\[0\] of rubric R-101 reads step development-run, which the held-out view does not declare/,
      ],
      [
        'a held-out criterion ID with the criterion shape and a free-text tail, reading a development-only step',
        () =>
          rubricChange(PLAN_FILE, (plan) => {
            plan.rubrics[0].criteria[0].id = 'RC-101-canary-x';
            plan.rubrics[0].criteria[0].evidence = '/interactions/development-run/stdout';
          }),
        /corpus\/held-out\/plan\.json.*criterion criteria\[0\] of rubric R-101 reads step development-run, which the held-out view does not declare/,
      ],
    ];
    for (const [name, edit, pattern] of [
      [
        'a contract criterion reading a step the contract does not declare',
        () => rubricChange('contract.json', (contract) => (contract.rubrics[0].criteria[1].evidence = '/interactions/ghost-run/stdout')),
        /contract\.json.*criterion RC-002 of rubric R-001 reads step ghost-run, which the development view does not declare/,
      ],
      [
        'a contract criterion reading a held-out step',
        () => rubricChange('contract.json', (contract) => (contract.rubrics[0].criteria[0].evidence = '/interactions/held-out-run/stdout')),
        /contract\.json.*criterion RC-001 of rubric R-001 reads step held-out-run, which the development view does not declare/,
      ],
      [
        'a held-out criterion reading a development-only step',
        () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = '/interactions/development-run/stdout')),
        /corpus\/held-out\/plan\.json.*criterion RC-101 of rubric R-101 reads step development-run, which the held-out view does not declare/,
      ],
      [
        'a held-out criterion reading a step no view holds',
        () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = '/interactions/ghost-run/stdout')),
        /corpus\/held-out\/plan\.json.*criterion RC-101 of rubric R-101 reads step ghost-run, which the held-out view does not declare/,
      ],
      [
        'a held-out rubric ID that a contract rubric has',
        () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].id = 'R-001')),
        /corpus\/held-out\/plan\.json.*rubric R-001 has the ID of a rubric contract\.json declares/,
      ],
      [
        'a held-out rubric declared twice',
        () => rubricChange(PLAN_FILE, (plan) => plan.rubrics.push(structuredClone(plan.rubrics[0]))),
        /corpus\/held-out\/plan\.json.*rubric R-101 is declared more than once/,
      ],
      [
        'a held-out rubric ID of no rubric shape',
        () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].id = 'canary-free text')),
        /corpus\/held-out\/plan\.json.*\/rubrics\/0\/id must match pattern/,
      ],
      [
        'a held-out criterion whose evidence the engine schema refuses',
        () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = 'canary-not-a-pointer')),
        /corpus\/held-out\/plan\.json.*rubrics\[0\]\/criteria\/0\/evidence must match pattern/,
      ],
      ...idOnlyCases,
      [
        'a calibration item for a criterion no view declares',
        () =>
          rubricChange('policy/judge-calibration.json', (labelled) =>
            labelled.items.push({ rubricId: 'R-101', criterionId: 'RC-009', response: 'calibration response', expectedLevel: 0 }),
          ),
        /policy\/judge-calibration\.json.*items\[6\] names unknown rubric criterion R-101\/RC-009/,
      ],
      [
        'a held-out criterion with no calibration item at one of its levels',
        () => rubricChange('policy/judge-calibration.json', (labelled) => labelled.items.splice(5, 1)),
        /policy\/judge-calibration\.json.*R-101\/RC-101 has no calibration item labelled at one of its anchored levels/,
      ],
      [
        'a judge beside a partition plan that declares no rubric in any view',
        () => {
          rubricChange('contract.json', (contract) => (contract.rubrics = []));
          rubricChange(PLAN_FILE, (plan) => delete plan.rubrics);
          rubricChange('policy/judge-calibration.json', (labelled) => (labelled.items = []));
        },
        /evaluation\.json.*contract\.json declares no rubric, so no judge runs/,
      ],
    ]) {
      const ran = rubricChecked(edit);
      assert.equal(ran.status, 10, `${name}: ${ran.output}`);
      assert.match(ran.output, pattern, name);
      assert.equal(ran.output.includes('canary-'), false, `${name}: check quoted a byte of the held-out plan:\n${ran.output}`);
    }
    // The rubric rules read the plan only when it is sound: no finding of its own, a held-out view the engine's contract schema accepts,
    // and a `contract.json` that does too. Beside a plan or a contract with a finding they hold the rubrics `check` can see, so the
    // finding is the only one and the plan's labelled items are neither validated nor named. Each case below gives the plan criterion an
    // evidence pointer the labelled items cannot reach, which a both view built over the unsound plan would report.
    const unreachableMember = () => {
      rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = '/interactions/held-out-run/response-body/canary-member'));
      rubricChange('policy/judge-calibration.json', (labelled) => {
        for (const item of labelled.items.filter((entry) => entry.rubricId === 'R-101')) item.response = '{"other":1}';
      });
    };
    for (const [name, edit, pattern] of [
      [
        'a held-out view the engine schema refuses',
        () => rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = 'canary-not-a-pointer')),
        /corpus\/held-out\/plan\.json: \[partition-plan\] rubrics\[0\]\/criteria\/0\/evidence must match pattern/,
      ],
      [
        'a plan with a finding of its own',
        () => {
          unreachableMember();
          rubricChange(PLAN_FILE, (plan) => (plan.behaviorOracles['B-009'] = ['O-101']));
        },
        /behaviorOracles names behavior B-009, which contract\.json does not declare/,
      ],
      [
        'a contract.json that fails its own schema',
        () => {
          unreachableMember();
          rubricChange('contract.json', (contract) => (contract.oracles[0].polarity = 'bogus'));
        },
        /contract\.json: \[engine-schema\]/,
      ],
    ]) {
      const ran = rubricChecked(edit);
      assert.equal(ran.status, 10, `${name}: ${ran.output}`);
      assert.match(ran.output, pattern, name);
      assert.doesNotMatch(
        ran.output,
        /\[judge(-calibration)?\]/,
        `${name}: check judged the labelled items of a plan it cannot trust:\n${ran.output}`,
      );
    }
    // A criterion of `contract.json` whose ID has no shape is named by its index in the partition-plan finding. The adopter's own
    // contract.json is not the held-out plan, so the other findings about the file may quote it; this finding is the plan rule's.
    const freeTextContract = rubricChecked(() =>
      rubricChange('contract.json', (contract) => {
        contract.rubrics[0].criteria[1].id = 'canary-contract-crit';
        contract.rubrics[0].criteria[1].evidence = '/interactions/ghost-run/stdout';
      }),
    );
    assert.equal(freeTextContract.status, 10, freeTextContract.output);
    const planRule = freeTextContract.output.split('\n').filter((line) => line.includes('[partition-plan]'));
    assert.equal(planRule.length, 1, freeTextContract.output);
    assert.match(
      planRule[0],
      /^contract\.json: \[partition-plan\] criterion criteria\[1\] of rubric R-001 reads step ghost-run, which the development view does not declare/,
    );
    assert.equal(planRule[0].includes('canary-'), false, `the plan rule quoted contract.json's free-text ID: ${planRule[0]}`);
    // A judge the both view's rubrics need is named against the contract and its held-out plan together: `contract.json` alone may
    // declare none, and the count is the two files' sum, which neither file holds.
    const noJudge = rubricChecked(() => {
      rubricChange('contract.json', (contract) => (contract.rubrics = []));
      rubricChange(
        'policy/judge-calibration.json',
        (labelled) => (labelled.items = labelled.items.filter((item) => item.rubricId === 'R-101')),
      );
      rubricChange('evaluation.json', (evaluation) => delete evaluation.judge);
      rubricChange('policy/evaluator-conditions.json', (conditions) => delete conditions.judge);
    });
    assert.equal(noJudge.status, 10, noJudge.output);
    assert.match(
      noJudge.output,
      /evaluation\.json: \[judge\] the contract and its held-out plan declare a rubric, and evaluation\.json declares no judge/,
    );
    assert.match(
      noJudge.output,
      /policy\/evaluator-conditions\.json: \[judge\] the contract and its held-out plan declare a rubric, and policy\/evaluator-conditions\.json names no judge\.modelSnapshot/,
    );
    assert.doesNotMatch(
      noJudge.output,
      /rubric\(s\)|contract\.json declares/,
      'check counted rubrics over the both view for contract.json',
    );
    // Beside a contract that fails its own schema the plan is not read, so the rubrics `check` counts are `contract.json`'s own.
    const unreadJudge = rubricChecked(() => {
      rubricChange('contract.json', (contract) => (contract.oracles[0].polarity = 'bogus'));
      rubricChange('evaluation.json', (evaluation) => delete evaluation.judge);
    });
    assert.equal(unreadJudge.status, 10, unreadJudge.output);
    assert.match(
      unreadJudge.output,
      /evaluation\.json: \[judge\] contract\.json declares 1 rubric\(s\), and evaluation\.json declares no judge/,
    );
    assert.doesNotMatch(unreadJudge.output, /held-out plan declare/, 'check named a plan it did not read');
    // A plan criterion's schema error is named by its index among the plan's rubrics: the held-out view lists the rubrics `contract.json`
    // keeps first, and a rubric left with no held-out criterion is not kept, so the plan's rubric is `rubrics[0]` here although
    // `contract.json` declares one rubric.
    const dropped = rubricChecked(() => {
      rubricChange('contract.json', (contract) => (contract.rubrics[0].criteria = [contract.rubrics[0].criteria[0]]));
      rubricChange(PLAN_FILE, (plan) => (plan.rubrics[0].criteria[0].evidence = 'canary-not-a-pointer'));
    });
    assert.equal(dropped.status, 10, dropped.output);
    assert.match(
      dropped.output,
      /corpus\/held-out\/plan\.json: \[partition-plan\] rubrics\[0\]\/criteria\/0\/evidence must match pattern/,
      'a plan rubric was located by the count of contract.json rubrics',
    );
    assert.doesNotMatch(dropped.output, /held-out view \/rubrics|canary-/, dropped.output);
    // A development criterion is held to its own calibration items as any criterion is.
    const ownItems = rubricChecked(() => rubricChange('policy/judge-calibration.json', (labelled) => labelled.items.splice(0, 1)));
    assert.equal(ownItems.status, 10, ownItems.output);
    assert.match(ownItems.output, /R-001\/RC-001 has no calibration item labelled at anchored level 0/, ownItems.output);
    // A rubric only the held-out plan declares: `contract.json` holds none, and the judge and the labelled file serve the held-out
    // partition alone. `check` reads both files, and a development run, which never opens the plan, does not call the judge unused
    // or the held-out items unknown.
    const heldOutOnly = rubricChecked(() => {
      rubricChange('contract.json', (contract) => (contract.rubrics = []));
      rubricChange(
        'policy/judge-calibration.json',
        (labelled) => (labelled.items = labelled.items.filter((item) => item.rubricId === 'R-101')),
      );
    });
    assert.equal(heldOutOnly.status, 0, heldOutOnly.output);
    // A development run of that layout judges nothing, and a held-out run of it calibrates and judges the plan's rubric alone: the
    // judge is called in the partition that owns the criterion and in no other.
    try {
      rubricChange('contract.json', (contract) => (contract.rubrics = []));
      rubricChange(
        'policy/judge-calibration.json',
        (labelled) => (labelled.items = labelled.items.filter((item) => item.rubricId === 'R-101')),
      );
      assert.equal(cli(rubricGuarded, 'digest').status, 0);
      const before = judgeCallCount(rubricGuarded);
      const developmentRun = cli(rubricGuarded, 'run', ['--partition', 'development']);
      assert.equal(developmentRun.status, 0, developmentRun.output);
      assert.equal(judgeCallCount(rubricGuarded), before, 'a development partition with no rubric called the judge');
      assert.equal(developmentRun.output.includes('RC-101'), false, 'a development run named the held-out criterion');
      const heldOutRun = cli(rubricGuarded, 'run', ['--partition', 'held-out']);
      assert.equal(heldOutRun.status, 0, heldOutRun.output);
      const heldOutCalls = judgeCalls(rubricGuarded, before);
      const calibrationCalls = heldOutCalls.filter((call) => call.calibration);
      assert.equal(calibrationCalls.length, 2, 'the held-out run did not calibrate the plan rubric over its two labelled items');
      assert.ok(
        heldOutCalls.some((call) => !call.calibration),
        'the held-out run judged no trial',
      );
      assert.deepEqual(
        [...new Set(heldOutCalls.map((call) => call.criteria.join(',')))],
        ['R-101/RC-101'],
        'the held-out run judged a criterion other than the plan rubric',
      );
    } finally {
      for (const [file, bytes] of rubricOriginals) fs.writeFileSync(path.join(rubricGuarded.folder, file), bytes);
      assert.equal(cli(rubricGuarded, 'digest').status, 0);
    }
    // Every partition's findings stay id-only through preflight and run too: both run `check` first, so a held-out preflight or a run of
    // both partitions (a preflight with no `--partition` is refused under a plan) over a plan with a criterion of no shape, or with an
    // evidence pointer the labelled items cannot reach, stops with a finding that names none of the plan's text.
    for (const [name, edit] of idOnlyCases) {
      for (const args of [['preflight', '--partition', 'held-out'], ['run']]) {
        const ran = rubricChecked(edit, args);
        assert.equal(ran.status, 10, `${name} (${args.join(' ')}): ${ran.output}`);
        assert.equal(
          ran.output.includes('canary-'),
          false,
          `${name} (${args.join(' ')}) quoted a byte of the held-out plan:\n${ran.output}`,
        );
      }
    }
    // A contract.json that fails its own schema cannot make the both view, so `check` holds the rubrics it can see and leaves the rest
    // to the partition that owns them: the contract error is the only finding, and no rubric, judge or labelled item is called
    // missing, unused or unknown for want of the plan's rubrics.
    for (const [name, layout] of [
      [
        'a rubric only the held-out plan declares',
        () => {
          rubricChange('contract.json', (contract) => (contract.rubrics = []));
          rubricChange(
            'policy/judge-calibration.json',
            (labelled) => (labelled.items = labelled.items.filter((item) => item.rubricId === 'R-101')),
          );
        },
      ],
      ['rubrics in both files', () => {}],
    ]) {
      const ran = rubricChecked(() => {
        layout();
        rubricChange('contract.json', (contract) => (contract.oracles[0].polarity = 'bogus'));
      });
      assert.equal(ran.status, 10, `${name}: ${ran.output}`);
      assert.match(ran.output, /contract\.json/, `${name}: the contract error is gone`);
      assert.doesNotMatch(
        ran.output,
        /\[judge(-calibration)?\]|no rubric|never used|unknown rubric criterion|calibration item/,
        `${name}: check blamed the rubrics, the judge or the labelled file for a contract error:\n${ran.output}`,
      );
    }

    // ---- check over waivers: each waiver has a home, and one no view reaches is named by its ID (Story 1.106) --------------------
    const waiverGuarded = planProject('plan-waiver-check', null, {});
    const waiverFiles = ['contract.json', 'evaluation.json', PLAN_FILE];
    const waiverOriginals = new Map(waiverFiles.map((file) => [file, fs.readFileSync(path.join(waiverGuarded.folder, file))]));
    const waiverChange = (file, edit) => {
      const value = read(path.join(waiverGuarded.folder, file));
      edit(value);
      write(path.join(waiverGuarded.folder, file), value);
    };
    const waiverChecked = (edit, command = ['check']) => {
      try {
        edit();
        assert.equal(cli(waiverGuarded, 'digest').status, 0);
        return cli(waiverGuarded, command[0], command.slice(1));
      } finally {
        for (const [file, bytes] of waiverOriginals) fs.writeFileSync(path.join(waiverGuarded.folder, file), bytes);
        assert.equal(cli(waiverGuarded, 'digest').status, 0);
      }
    };
    // A waiver that reads a development-only step, one that reads a shared step and a held-out one in the plan are a valid plan: the
    // 1.51 refusal of a waiver that reads a development-only step is replaced by the derivation, so each waiver has a view.
    const waiversPristine = cli(waiverGuarded, 'check');
    assert.equal(waiversPristine.status, 0, waiversPristine.output);
    assert.equal(waiversPristine.output.includes('canary-'), false, waiversPristine.output);
    for (const [name, edit, pattern] of [
      [
        'a contract waiver reading a held-out step',
        () =>
          waiverChange('contract.json', (contract) => (contract.waivers[0].condition = '/interactions/held-out-run/exit-code is absent')),
        /contract\.json: \[partition-plan\] waiver W-001 reads step held-out-run, which the development view does not declare; a waiver that reads a held-out step belongs in the held-out plan's waivers/,
      ],
      [
        'a contract waiver reading a held-out step mid-text',
        () =>
          waiverChange(
            'contract.json',
            (contract) => (contract.waivers[0].condition = 'the exit code at /interactions/held-out-run/exit-code is absent'),
          ),
        /contract\.json: \[partition-plan\] waiver W-001 reads step held-out-run, which the development view does not declare; a waiver that reads a held-out step belongs in the held-out plan's waivers/,
      ],
      [
        'a contract waiver reading a held-out step as its second pointer, with no path after the step',
        () =>
          waiverChange(
            'contract.json',
            (contract) =>
              (contract.waivers[1].condition = '/interactions/shared-run/exit-code is 0 and /interactions/held-out-run is absent'),
          ),
        /contract\.json: \[partition-plan\] waiver W-002 reads step held-out-run, which the development view does not declare; a waiver that reads a held-out step belongs in the held-out plan's waivers/,
      ],
      [
        'a contract waiver reading a step no view holds',
        () => waiverChange('contract.json', (contract) => (contract.waivers[1].condition = '/interactions/ghost-run/stdout is absent')),
        /contract\.json: \[partition-plan\] waiver W-002 reads step ghost-run, which the development view does not declare/,
      ],
      [
        'a held-out waiver reading a development-only step through a condition that holds free text',
        () =>
          waiverChange(PLAN_FILE, (plan) => (plan.waivers[0].condition = '/interactions/development-run/exit-code canary-condition-text')),
        /corpus\/held-out\/plan\.json: \[partition-plan\] waiver W-101 reads development-only step development-run, which the held-out view does not declare/,
      ],
      [
        'a held-out waiver whose second pointer reads a development-only step',
        () =>
          waiverChange(
            PLAN_FILE,
            (plan) =>
              (plan.waivers[0].condition =
                'canary-prose: /interactions/shared-run/exit-code is 0 and /interactions/development-run/exit-code is absent'),
          ),
        /corpus\/held-out\/plan\.json: \[partition-plan\] waiver W-101 reads development-only step development-run, which the held-out view does not declare/,
      ],
      [
        'a held-out waiver whose development-only pointer follows leading text',
        () => waiverChange(PLAN_FILE, (plan) => (plan.waivers[1].condition = 'when /interactions/development-run is absent')),
        /corpus\/held-out\/plan\.json: \[partition-plan\] waiver W-103 reads development-only step development-run, which the held-out view does not declare/,
      ],
      [
        'a held-out waiver whose mid-text pointer reads a step no view holds, spelled as a canary',
        () => waiverChange(PLAN_FILE, (plan) => (plan.waivers[0].condition = 'the log at /interactions/canary-ghost/stdout is absent')),
        /corpus\/held-out\/plan\.json: \[partition-plan\] waiver W-101 reads a step the held-out view does not declare/,
      ],
      [
        'a held-out waiver reading a step no view holds, spelled as a canary',
        () => waiverChange(PLAN_FILE, (plan) => (plan.waivers[0].condition = '/interactions/canary-ghost/stdout is absent')),
        /corpus\/held-out\/plan\.json: \[partition-plan\] waiver W-101 reads a step the held-out view does not declare/,
      ],
      [
        'a held-out waiver ID that a contract waiver has',
        () => waiverChange(PLAN_FILE, (plan) => (plan.waivers[0].id = 'W-001')),
        /corpus\/held-out\/plan\.json: \[partition-plan\] waiver W-001 has the ID of a waiver contract\.json declares/,
      ],
      [
        'a held-out waiver ID that a shared contract waiver has',
        () => waiverChange(PLAN_FILE, (plan) => (plan.waivers[0].id = 'W-002')),
        /corpus\/held-out\/plan\.json: \[partition-plan\] waiver W-002 has the ID of a waiver contract\.json declares/,
      ],
      [
        'a held-out waiver declared twice',
        () => waiverChange(PLAN_FILE, (plan) => plan.waivers.push(structuredClone(plan.waivers[0]))),
        /corpus\/held-out\/plan\.json: \[partition-plan\] waiver W-101 is declared more than once/,
      ],
      [
        'a held-out waiver ID of no waiver shape',
        () => waiverChange(PLAN_FILE, (plan) => (plan.waivers[0].id = 'canary-free text')),
        /corpus\/held-out\/plan\.json: \[partition-plan\] \/waivers\/0\/id must match pattern/,
      ],
      [
        'a held-out waiver whose field the engine schema refuses, beside contract waivers the view keeps and drops',
        () => waiverChange(PLAN_FILE, (plan) => (plan.waivers[0].expiresAt = 'canary-not-a-date')),
        /corpus\/held-out\/plan\.json: \[partition-plan\] waivers\[0\]\/expiresAt must/,
      ],
      [
        'a held-out waiver with a key the engine schema does not know',
        () => waiverChange(PLAN_FILE, (plan) => (plan.waivers[0]['canary-key'] = 'canary-value')),
        /corpus\/held-out\/plan\.json: \[partition-plan\] waivers\[0\] must NOT have additional properties/,
      ],
    ]) {
      const ran = waiverChecked(edit);
      assert.equal(ran.status, 10, `${name}: ${ran.output}`);
      assert.match(ran.output, pattern, name);
      assert.equal(ran.output.includes('canary-'), false, `${name}: check quoted a byte of the held-out plan:\n${ran.output}`);
      assert.doesNotMatch(ran.output, /held-out view \/waivers/, `${name}: a plan waiver was located by the view's index`);
    }
    // A development run over a `contract.json` waiver that names the held-out step mid-text never reaches the target: the preflight
    // of the partition stops at `check`, so the development view (the folder's own bytes) never carries `held-out-run`.
    const midTextLaunches = launchCount(waiverGuarded);
    const midTextDevelopment = waiverChecked(
      () =>
        waiverChange(
          'contract.json',
          (contract) => (contract.waivers[0].condition = 'the exit code at /interactions/held-out-run/exit-code is absent'),
        ),
      ['preflight', '--partition', 'development'],
    );
    assert.equal(midTextDevelopment.status, 10, midTextDevelopment.output);
    assert.match(midTextDevelopment.output, /waiver W-001 reads step held-out-run, which the development view does not declare/);
    assert.equal(launchCount(waiverGuarded), midTextLaunches, 'a development preflight launched the target over a held-out step');
    // A waiver of `contract.json` whose ID has no shape is named by its index in the partition-plan finding. The adopter's own
    // contract.json is not the held-out plan, so the other findings about the file may quote it; this finding is the plan rule's.
    const freeTextWaiverCheck = waiverChecked(() =>
      waiverChange('contract.json', (contract) => {
        contract.waivers[1].id = 'canary-contract-waiver';
        contract.waivers[1].condition = '/interactions/ghost-run/stdout is absent';
      }),
    );
    assert.equal(freeTextWaiverCheck.status, 10, freeTextWaiverCheck.output);
    const waiverRule = freeTextWaiverCheck.output.split('\n').filter((line) => line.includes('[partition-plan]'));
    assert.equal(waiverRule.length, 1, freeTextWaiverCheck.output);
    assert.match(
      waiverRule[0],
      /^contract\.json: \[partition-plan\] waiver waivers\[1\] reads step ghost-run, which the development view does not declare/,
    );
    assert.equal(waiverRule[0].includes('canary-'), false, `the plan rule quoted contract.json's free-text waiver ID: ${waiverRule[0]}`);
    // The plan's waiver sits past the waivers `contract.json` keeps in the held-out view, and the one it drops is not counted: the plan's
    // schema error is `waivers[0]` although `contract.json` declares two waivers (checked above), and `waivers[2]` when the plan
    // declares a third and `contract.json` keeps one of its own.
    const located = waiverChecked(() => {
      waiverChange('contract.json', (contract) => (contract.waivers = [contract.waivers[1]]));
      waiverChange(PLAN_FILE, (plan) => {
        plan.waivers.push(waiverOf('W-102', 'The held-out partition has no seed here.', null));
        plan.waivers[2].approval = 7;
      });
    });
    assert.equal(located.status, 10, located.output);
    assert.match(located.output, /corpus\/held-out\/plan\.json: \[partition-plan\] waivers\[2\]\/approval must/);
    assert.doesNotMatch(located.output, /held-out view \/waivers|canary-/, located.output);
    // A contract whose own waivers are malformed is the engine schema's finding alone: the waiver rule skips an entry that is no
    // object, a condition that is no string and a `waivers` that is no array, so it neither throws nor names a waiver.
    for (const [name, waivers] of [
      ['a waivers field that is no array', 'canary-no-array'],
      ['a waiver entry that is no object', [null, 7, DEVELOPMENT_WAIVER]],
      ['a waiver condition that is no string', [{ ...DEVELOPMENT_WAIVER, condition: 7 }, SHARED_WAIVER]],
    ]) {
      const ran = waiverChecked(() => waiverChange('contract.json', (contract) => (contract.waivers = waivers)));
      assert.equal(ran.status, 10, `${name}: ${ran.output}`);
      assert.match(ran.output, /contract\.json: \[engine-schema\] \/waivers/, `${name}: the contract error is gone`);
      assert.doesNotMatch(
        ran.output,
        /\[partition-plan\]|TypeError|at .*\.js:/,
        `${name}: the waiver rule threw or blamed a waiver:\n${ran.output}`,
      );
    }
    // A contract error elsewhere is the only finding, and no waiver is blamed: a bogus oracle polarity beside sound waivers in
    // `contract.json` and the plan, and beside waivers only the plan carries.
    for (const [name, layout] of [
      ['waivers in both files', () => {}],
      ['waivers only the held-out plan declares', () => waiverChange('contract.json', (contract) => (contract.waivers = []))],
    ]) {
      const ran = waiverChecked(() => {
        layout();
        waiverChange('contract.json', (contract) => (contract.oracles[0].polarity = 'bogus'));
      });
      assert.equal(ran.status, 10, `${name}: ${ran.output}`);
      const findings = ran.output.split('\n').filter((line) => /^\S+: \[[a-z-]+\] /.test(line));
      assert.equal(findings.length, 1, `${name}: the contract error is not the only finding:\n${ran.output}`);
      assert.match(findings[0], /^contract\.json: \[engine-schema\] \/oracles\/0\/polarity /, name);
      assert.doesNotMatch(
        ran.output,
        /\[partition-plan\]|waiver W-|waivers\[|canary-/,
        `${name}: check blamed a waiver for a contract error:\n${ran.output}`,
      );
    }
    // Every partition's findings stay id-only through preflight and run too: both run `check` first, so a held-out preflight or a run of
    // both partitions over a waiver that reads a step no view holds, spelled as a canary, stops with a finding that names none of the
    // plan's text.
    for (const args of [['preflight', '--partition', 'held-out'], ['run']]) {
      const ran = waiverChecked(
        () => waiverChange(PLAN_FILE, (plan) => (plan.waivers[0].condition = '/interactions/canary-ghost/stdout is absent')),
        args,
      );
      assert.equal(ran.status, 10, `${args.join(' ')}: ${ran.output}`);
      assert.match(ran.output, /waiver W-101 reads a step the held-out view does not declare/);
      assert.equal(ran.output.includes('canary-'), false, `${args.join(' ')} quoted a byte of the held-out plan:\n${ran.output}`);
    }
    // The engine compiles each view without the waivers of the other partition. A development-only waiver the engine finds incomplete
    // (no approval) fails the development and both views and leaves the held-out one compiling; a held-out waiver in the same state
    // fails the held-out and both views and leaves the development one compiling. Compile runs inside preflight and run.
    const compiled = (name, edit, failing) => {
      for (const partition of ['development', 'held-out', 'both']) {
        const args = partition === 'both' ? ['run'] : ['preflight', '--partition', partition];
        const ran = waiverChecked(edit, args);
        const expected = failing.includes(partition) ? 4 : 0;
        assert.equal(ran.status, expected, `${name}, ${partition} ${args[0]}: ${ran.output}`);
        if (expected === 4)
          assert.match(ran.output, /waiver-incomplete.*waivers\[id=W-\d+\]\.approval/s, `${name}, ${partition}: ${ran.output}`);
        assert.equal(ran.output.includes('canary-'), false, `${name}, ${partition} quoted a byte of the held-out plan:\n${ran.output}`);
      }
    };
    compiled(
      'an incomplete development-only waiver',
      () => waiverChange('contract.json', (contract) => (contract.waivers[0].approval = null)),
      ['development', 'both'],
    );
    compiled('an incomplete held-out waiver', () => waiverChange(PLAN_FILE, (plan) => (plan.waivers[0].approval = null)), [
      'held-out',
      'both',
    ]);

    // ---- check over mappings: each row has a home, and one no view reaches is named without the plan's text (Story 1.107) -----------
    // The plan's keys are spelled `canary-...` here, so no finding may print one. `evaluator/mapping.json` is the adopter's own file, which
    // the development partition reads, so a finding about one of its rows names the key and the IDs it holds.
    const mappingGuarded = planProject('plan-mapping-check', null, null, { rubric: true, canary: true });
    const mappingFiles = ['contract.json', 'evaluation.json', PLAN_FILE, 'evaluator/mapping.json'];
    const mappingOriginals = new Map(mappingFiles.map((file) => [file, fs.readFileSync(path.join(mappingGuarded.folder, file))]));
    const mappingChange = (file, edit) => {
      const value = read(path.join(mappingGuarded.folder, file));
      edit(value);
      write(path.join(mappingGuarded.folder, file), value);
    };
    const mappingChecked = (edit, command = ['check']) => {
      try {
        edit();
        assert.equal(cli(mappingGuarded, 'digest').status, 0);
        return cli(mappingGuarded, command[0], command.slice(1));
      } finally {
        for (const [file, bytes] of mappingOriginals) fs.writeFileSync(path.join(mappingGuarded.folder, file), bytes);
        // What a case adds to the folder leaves with it.
        for (const added of ['policy/evaluator-conditions.json', 'sealed-records'])
          fs.rmSync(path.join(mappingGuarded.folder, added), { recursive: true, force: true });
        assert.equal(cli(mappingGuarded, 'digest').status, 0);
      }
    };
    // The sealed-brief agent beside a plan, with the same mapping the command evaluator reads.
    const sealedBriefAgent = (capture) => () => sealedBriefAgentLayer(mappingGuarded.folder, capture);
    const planFindings = (output) => output.split('\n').filter((line) => /^corpus\/held-out\/plan\.json: \[partition-plan\] /.test(line));
    // A development-only oracle row and a shared one in the file, a held-out oracle row in the plan, and the criterion rows split the same
    // way are a valid plan: the 1.51 refusal of a partition plan beside a command evaluator is replaced by the derivation.
    const mappingsPristine = cli(mappingGuarded, 'check');
    assert.equal(mappingsPristine.status, 0, mappingsPristine.output);
    assert.equal(mappingsPristine.output.includes('canary-'), false, mappingsPristine.output);
    const oracleRow = (key, binding) => ({ key, ...binding });
    for (const [name, edit, patterns] of [
      [
        'a plan key that evaluator/mapping.json has (first row), one it has and the held-out view dropped, and one a plan row repeats (last row)',
        () =>
          mappingChange(PLAN_FILE, (plan) => {
            plan.mappings = [
              oracleRow('accepted:shared-run', HELD_OUT_ROW),
              plan.mappings[0],
              plan.mappings[1],
              oracleRow('accepted:development-run', HELD_OUT_ROW),
              oracleRow('canary-oracle-key', { oracleId: 'O-999', behaviorId: 'B-002' }),
            ];
          }),
        [
          /\[partition-plan\] mappings\[0\] has the key of a row evaluator\/mapping\.json declares$/m,
          /\[partition-plan\] mappings\[3\] has the key of a row evaluator\/mapping\.json declares$/m,
          /\[partition-plan\] mappings\[4\] has the key of an earlier row$/m,
        ],
      ],
      [
        'rows that bind what the held-out view does not hold or another key binds, first and last of the plan',
        () =>
          mappingChange(PLAN_FILE, (plan) => {
            plan.mappings = [
              oracleRow('canary-a', { oracleId: 'O-999', behaviorId: 'B-002' }),
              oracleRow('canary-b', DEVELOPMENT_ROW),
              oracleRow('canary-c', SHARED_ROW),
              oracleRow('canary-d', { oracleId: 'O-101', behaviorId: 'B-001' }),
              oracleRow('canary-e', { oracleId: 'O-101', behaviorId: 'B-999' }),
            ];
          }),
        [
          /\[partition-plan\] key mappings\[0\] binds oracle O-999, which the held-out view does not declare$/m,
          /\[partition-plan\] key mappings\[1\] binds oracle O-002, which the held-out view does not declare$/m,
          /\[partition-plan\] keys accepted:shared-run and mappings\[2\] both bind oracle O-001$/m,
          /\[partition-plan\] key mappings\[3\] binds oracle O-101 to behavior B-001, which does not declare that oracle$/m,
          /\[partition-plan\] key mappings\[4\] binds behavior B-999, which the held-out view does not declare$/m,
          /\[partition-plan\] keys mappings\[3\] and mappings\[4\] both bind oracle O-101$/m,
          /\[partition-plan\] no key binds rubric criterion R-101\/RC-101, so nothing would score it/,
        ],
      ],
      [
        'criterion rows with the wrong levels, a repeated criterion and a criterion the view dropped',
        () =>
          mappingChange(PLAN_FILE, (plan) => {
            plan.mappings = [
              plan.mappings[0],
              { key: 'canary-first', ...criterionRow('R-101', HELD_OUT_CRITERION), levels: [1, 2] },
              { key: 'canary-second', ...criterionRow('R-101', HELD_OUT_CRITERION) },
              { key: 'canary-third', ...criterionRow('R-001', DEVELOPMENT_CRITERION) },
              { key: 'canary-fourth', ...criterionRow('R-009', HELD_OUT_CRITERION) },
            ];
          }),
        [
          /\[partition-plan\] key mappings\[1\] restates levels other than the anchored scale levels of R-101\/RC-101$/m,
          /\[partition-plan\] keys mappings\[1\] and mappings\[2\] both bind criterion R-101\/RC-101$/m,
          /\[partition-plan\] key mappings\[3\] binds criterion RC-001, which rubric R-001 does not declare$/m,
          /\[partition-plan\] key mappings\[4\] binds rubric R-009, which the held-out view does not declare$/m,
        ],
      ],
      [
        'a plan whose held-out criterion no key binds',
        () => mappingChange(PLAN_FILE, (plan) => (plan.mappings = [plan.mappings[0]])),
        [/\[partition-plan\] no key binds rubric criterion R-101\/RC-101, so nothing would score it/],
      ],
      [
        'a plan row of no shape, and one with a key the schema does not know',
        () =>
          mappingChange(PLAN_FILE, (plan) => {
            plan.mappings[0].key = 'canary free text';
            plan.mappings[1]['canary-extra'] = 'canary-value';
          }),
        [
          /\[partition-plan\] \/mappings\/0 must/,
          /\[partition-plan\] \/mappings\/0\/key must match pattern/,
          /\[partition-plan\] \/mappings\/1 must NOT have additional properties/,
        ],
      ],
    ]) {
      const ran = mappingChecked(edit);
      assert.equal(ran.status, 10, `${name}: ${ran.output}`);
      const findings = planFindings(ran.output);
      for (const pattern of patterns) assert.match(findings.join('\n'), pattern, `${name}:\n${ran.output}`);
      assert.equal(ran.output.includes('canary-'), false, `${name}: check quoted a byte of the held-out plan:\n${ran.output}`);
      assert.doesNotMatch(ran.output, /\[1,2\]|levels \[/, `${name}: check printed a level of the plan's rubric`);
    }
    // The development view cannot hold a held-out oracle's or criterion's row: one in `evaluator/mapping.json` is named by the file's own key
    // and the IDs the file holds, with where the row belongs, by `check` of every partition, the development one included (a development
    // preflight runs it and never opens the plan). The plan's own rows are removed beside them, so nothing else is wrong. A criterion
    // row whose rubric `contract.json` lacks (the held-out one) and one whose criterion its rubric lacks each carry the hint.
    const misplaced = () => {
      mappingChange('evaluator/mapping.json', (mapping) => {
        mapping.keys['accepted:held-out-run'] = HELD_OUT_ROW;
        mapping.keys['score:held-out-run'] = criterionRow('R-101', HELD_OUT_CRITERION);
        mapping.keys['score:ghost'] = criterionRow('R-001', criterionOf('RC-999', 'A criterion the rubric lacks.', 'shared-run'));
      });
      mappingChange(PLAN_FILE, (plan) => (plan.mappings = []));
    };
    const hinted = String.raw`; under a partitionPlan a held-out oracle or criterion binds in the held-out plan's mappings, and this file holds only what contract\.json declares$`;
    for (const command of [['check'], ['preflight', '--partition', 'development']]) {
      const ran = mappingChecked(misplaced, command);
      assert.equal(ran.status, 10, `${command.join(' ')}: ${ran.output}`);
      for (const finding of [
        'key accepted:held-out-run binds oracle O-101, which the contract does not declare',
        'key score:held-out-run binds rubric R-101, which the contract does not declare',
        'key score:ghost binds criterion RC-999, which rubric R-001 does not declare',
      ]) {
        assert.match(
          ran.output,
          new RegExp(`^evaluator/mapping\\.json: \\[evaluator\\] ${finding}${hinted}`, 'm'),
          `${command.join(' ')}: ${finding}`,
        );
      }
      assert.equal(ran.output.includes('canary-'), false, `${command.join(' ')}: ${ran.output}`);
    }
    // A development run over that file stops at `check` and launches nothing.
    const misplacedLaunches = launchCount(mappingGuarded);
    const misplacedRun = mappingChecked(misplaced, ['run', '--partition', 'development']);
    assert.equal(misplacedRun.status, 10, misplacedRun.output);
    assert.equal(launchCount(mappingGuarded), misplacedLaunches, 'a development run over a held-out row launched the target');
    // Only a command or sealed-brief-agent evaluator reads mappings, and a records harness whose calibration judgments answer one labelled
    // file for one contract has no partition to derive them from.
    // The rows are no one's business under a deterministic evaluator, so a bad row beside them adds no finding to the one that refuses them.
    const deterministic = mappingChecked(() => {
      mappingChange('evaluation.json', (evaluation) => delete evaluation.evaluator);
      mappingChange(PLAN_FILE, (plan) => plan.mappings.push({ key: 'canary-bad', oracleId: 'O-999', behaviorId: 'B-002' }));
    });
    assert.equal(deterministic.status, 10, deterministic.output);
    assert.deepEqual(
      planFindings(deterministic.output),
      [
        "corpus/held-out/plan.json: [partition-plan] declares mappings, which only a command or sealed-brief-agent evaluator reads; evaluation.json's evaluator is deterministic, so remove them",
      ],
      deterministic.output,
    );
    // A sealed-brief agent reads the rows as a command evaluator does, so the same plan is valid beside it and a bad row is named by its place.
    const agentPlan = mappingChecked(sealedBriefAgent(path.join(mappingGuarded.directory, 'agent-capture.jsonl')));
    assert.equal(agentPlan.status, 0, agentPlan.output);
    assert.equal(agentPlan.output.includes('canary-'), false, agentPlan.output);
    const agentBadRow = mappingChecked(() => {
      sealedBriefAgent(path.join(mappingGuarded.directory, 'agent-capture.jsonl'))();
      mappingChange(PLAN_FILE, (plan) => plan.mappings.push(oracleRow('canary-bad', { oracleId: 'O-999', behaviorId: 'B-002' })));
    });
    assert.equal(agentBadRow.status, 10, agentBadRow.output);
    assert.match(
      planFindings(agentBadRow.output).join('\n'),
      /\[partition-plan\] key mappings\[2\] binds oracle O-999, which the held-out view does not declare$/m,
    );
    assert.equal(agentBadRow.output.includes('canary-'), false, agentBadRow.output);
    // A records evaluator is refused beside a rubric wherever the rubric sits: in both files, in the plan alone, and in `contract.json` alone.
    const recordsRefusal =
      /^evaluation\.json: \[partition-plan\] partitionPlan beside a records evaluator and a rubric: the harness's calibration judgments answer one labelled file for one contract, which no partition derives; use a command or sealed-brief-agent evaluator, or declare no rubric$/m;
    const recordsEvaluator = () => {
      fs.mkdirSync(path.join(mappingGuarded.folder, 'sealed-records'));
      mappingChange('evaluation.json', (evaluation) => (evaluation.evaluator = { kind: 'records', records: 'sealed-records' }));
      mappingChange(PLAN_FILE, (plan) => delete plan.mappings);
    };
    // A development check, preflight and run never open the plan, so the rubric of `contract.json` refuses on its own and nothing of
    // the plan's rubric (R-101) reaches their output; a rubric in the plan alone is the held-out and both runs' to refuse.
    for (const [name, rubrics, development] of [
      ['both files', () => {}, true],
      ['the plan alone', () => mappingChange('contract.json', (contract) => (contract.rubrics = [])), false],
      ['contract.json alone', () => mappingChange(PLAN_FILE, (plan) => delete plan.rubrics), true],
    ]) {
      for (const command of [['check'], ['preflight', '--partition', 'development'], ['run', '--partition', 'development']]) {
        const records = mappingChecked(() => {
          recordsEvaluator();
          rubrics();
        }, command);
        fs.rmSync(path.join(mappingGuarded.folder, 'sealed-records'), { recursive: true, force: true });
        const label = `a rubric in ${name}, ${command.join(' ')}`;
        // A development command never opens the plan, so the plan's rubric stays out of what it prints.
        if (command[0] !== 'check')
          assert.equal(records.output.includes('R-101'), false, `${label} named the held-out rubric:\n${records.output}`);
        if (development || command[0] === 'check') {
          assert.equal(records.status, 10, `${label}: ${records.output}`);
          assert.match(records.output, recordsRefusal, label);
        } else assert.doesNotMatch(records.output, recordsRefusal, `${label}: the development view refused a rubric it never reads`);
      }
    }
    // `mappings` beside a records evaluator with no rubric anywhere are the plan's refusal alone: the harness reads no mapping.
    const recordsMappings = mappingChecked(() => {
      recordsEvaluator();
      mappingChange('contract.json', (contract) => (contract.rubrics = []));
      mappingChange(PLAN_FILE, (plan) => {
        delete plan.rubrics;
        plan.mappings = [oracleRow('canary-oracle-key', HELD_OUT_ROW)];
      });
    });
    fs.rmSync(path.join(mappingGuarded.folder, 'sealed-records'), { recursive: true, force: true });
    assert.equal(recordsMappings.status, 10, recordsMappings.output);
    assert.deepEqual(
      planFindings(recordsMappings.output),
      [
        "corpus/held-out/plan.json: [partition-plan] declares mappings, which only a command or sealed-brief-agent evaluator reads; evaluation.json's evaluator is records, so remove them",
      ],
      recordsMappings.output,
    );
    assert.doesNotMatch(recordsMappings.output, recordsRefusal, 'a records evaluator with no rubric was refused for one');
    // A mapping row of the file that no view can bind is named once, by the file: the rules over the plan's rows leave `evaluator/mapping.json`
    // to `check`'s own rule, and a criterion of `contract.json` that the file leaves unbound is named once too.
    const fileOnly = mappingChecked(() =>
      mappingChange('evaluator/mapping.json', (mapping) => {
        mapping.keys['accepted:ghost'] = { oracleId: 'O-999', behaviorId: 'B-001' };
        delete mapping.keys['score:shared-run'];
      }),
    );
    assert.equal(fileOnly.status, 10, fileOnly.output);
    assert.deepEqual(planFindings(fileOnly.output), [], `a mapping.json row was named under the plan:\n${fileOnly.output}`);
    assert.equal(
      fileOnly.output.split('\n').filter((line) => /^evaluator\/mapping\.json: \[evaluator\] /.test(line)).length,
      2,
      fileOnly.output,
    );
    // A contract error elsewhere is the only finding: a bogus oracle polarity beside rows of the plan that would each be blamed if the
    // mapping rules read a contract that fails its schema.
    const contractError = mappingChecked(() => {
      mappingChange('contract.json', (contract) => (contract.oracles[0].polarity = 'bogus'));
      mappingChange(PLAN_FILE, (plan) => (plan.mappings = [oracleRow('canary-a', { oracleId: 'O-999', behaviorId: 'B-002' })]));
    });
    assert.equal(contractError.status, 10, contractError.output);
    const contractFindings = contractError.output.split('\n').filter((line) => /^\S+: \[[a-z-]+\] /.test(line));
    assert.equal(contractFindings.length, 1, `the contract error is not the only finding:\n${contractError.output}`);
    assert.match(contractFindings[0], /^contract\.json: \[engine-schema\] \/oracles\/0\/polarity /);
    assert.doesNotMatch(
      contractError.output,
      /\[partition-plan\]|mappings\[|canary-/,
      `check blamed a mapping row for a contract error:\n${contractError.output}`,
    );

    // ---- a development run never opens the held-out plan; a held-out or both run refuses one it cannot read ----------------------
    for (const [name, edit] of [
      ['an unparsable plan', () => write(planFile, 'canary-garbage {"interactionPlan": [')],
      ['an absent plan', () => fs.rmSync(planFile)],
    ]) {
      edit();
      assert.equal(cli(guarded, 'digest').status, 0);
      const manifest = read(path.join(guarded.folder, 'evaluation.json'));
      assert.equal(
        loadContractView({ folder: guarded.folder, evaluation: manifest, partition: 'development' }).bytes.equals(
          originals.get('contract.json'),
        ),
        true,
      );
      for (const partition of ['held-out', 'both']) {
        assert.throws(
          () => loadContractView({ folder: guarded.folder, evaluation: manifest, partition }),
          PartitionPlanError,
          `${name}: ${partition}`,
        );
      }
      const before = launchCount(guarded);
      const developmentRun = cli(guarded, 'preflight', ['--partition', 'development']);
      assert.equal(developmentRun.status, 0, `${name}: a development preflight opened the held-out plan\n${developmentRun.output}`);
      assert.ok(launchesSince(guarded, before).length > 0);
      assert.equal(developmentRun.output.includes('canary-'), false);
      for (const [command, args] of [
        ['preflight', ['--partition', 'held-out']],
        ['run', []],
      ]) {
        const refused = cli(guarded, command, args);
        assert.equal(refused.status, 10, `${name} ${command} ${args.join(' ')}: ${refused.output}`);
        assert.match(refused.output, /corpus\/held-out\/plan\.json (does not parse as JSON|cannot be read \(ENOENT\))/);
        assert.equal(refused.output.includes('canary-garbage'), false);
      }
      for (const [file, bytes] of originals) fs.writeFileSync(path.join(guarded.folder, file), bytes);
      assert.equal(cli(guarded, 'digest').status, 0);
    }
    // A probe file that does not parse sends preflight and run down their fallback; a development run stays a development run
    // there, so the held-out plan beside it is neither opened, validated nor named.
    write(planFile, 'canary-garbage {"interactionPlan": [');
    write(path.join(guarded.folder, 'probes/P-006.probe.json'), 'canary-bad-probe {');
    try {
      for (const command of ['preflight', 'run']) {
        const development = cli(guarded, command, ['--partition', 'development']);
        assert.equal(development.status, 10, `${command}: ${development.output}`);
        assert.match(development.output, /probes\/P-006\.probe\.json/, `${command} did not report the probe`);
        assert.doesNotMatch(development.output, /plan\.json|canary-garbage/, `${command}: a development run named the held-out plan`);
        // A preflight reads the plan through the held-out partition, since a preflight of both partitions is refused under a plan.
        const control = cli(guarded, command, command === 'preflight' ? ['--partition', 'held-out'] : []);
        assert.match(control.output, /corpus\/held-out\/plan\.json does not parse as JSON/, `${command}: the control run skipped the plan`);
      }
    } finally {
      fs.rmSync(path.join(guarded.folder, 'probes/P-006.probe.json'));
      fs.writeFileSync(planFile, originals.get(PLAN_FILE));
      assert.equal(cli(guarded, 'digest').status, 0);
    }

    // A plan rewritten without a new index is stale for check and for a run that opens it, and invisible to a development run.
    fs.writeFileSync(planFile, `${fs.readFileSync(planFile, 'utf8')}\n`);
    assert.equal(cli(guarded, 'preflight', ['--partition', 'development']).status, 0);
    const staleRun = cli(guarded, 'preflight', ['--partition', 'held-out']);
    assert.equal(staleRun.status, 10, staleRun.output);
    assert.match(staleRun.output, /corpus-index\.json is stale.*corpus\/held-out\/plan\.json changed or added/);
    fs.writeFileSync(planFile, originals.get(PLAN_FILE));
  }
  if (runsGroup('preflight-and-run')) {
    // ---- preflight and run, each partition launches only its own requests ------------------------------------------------------
    const flow = planProject('plan-flow');
    const PARTITION_REQUESTS = {
      development: [SHARED_REQUEST, DEVELOPMENT_REQUEST],
      'held-out': [SHARED_REQUEST, HELD_OUT_REQUEST],
      both: [SHARED_REQUEST, DEVELOPMENT_REQUEST, HELD_OUT_REQUEST],
    };
    const PREFLIGHT_REQUESTS = {
      development: [...PARTITION_REQUESTS.development, ...WITNESSES, DEVELOPMENT_WITNESS],
      'held-out': [...PARTITION_REQUESTS['held-out'], ...WITNESSES, HELD_OUT_WITNESS],
      both: [...PARTITION_REQUESTS.both, ...WITNESSES, DEVELOPMENT_WITNESS, HELD_OUT_WITNESS],
    };
    const sorted = (list) => [...new Set(list)].sort();
    /** One qualified run's workspaces: a trial runs each authorized step once; a qualification runs it once per arm. */
    const assertLaunches = (partition, launches, { trials }) => {
      assert.deepEqual(
        sorted(launches.map(({ request }) => request)),
        sorted(PREFLIGHT_REQUESTS[partition]),
        `${partition}: launched requests`,
      );
      for (const [workspace, requests] of requestsByWorkspace(launches)) {
        if (trials && workspace?.startsWith('trial-')) {
          assert.deepEqual([...requests].sort(), [...PARTITION_REQUESTS[partition]].sort(), `${partition}: ${workspace} launched`);
        }
        if (workspace?.startsWith('qualify-')) {
          const counts = new Set(
            PARTITION_REQUESTS[partition].map((request) => requests.filter((launched) => launched === request).length),
          );
          assert.equal(counts.size, 1, `${partition}: ${workspace} ran the plan unevenly (${requests.join(' | ')})`);
          assert.ok([...counts][0] >= 1);
        }
      }
    };
    const qualified = (run) => fs.readdirSync(path.join(run, 'qualification')).sort();
    const designatedIn = (run) => {
      const scores = path.join(run, 'scores');
      const latest = path.join(scores, fs.readdirSync(scores).sort().at(-1));
      const probeIds = fs.readdirSync(latest, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? [entry.name] : []));
      return Object.fromEntries(probeIds.sort().map((probeId) => [probeId, designatedBy(path.join(latest, probeId, 'score.json'))]));
    };
    const developmentLog = [];
    const heldOutLog = [];

    let mark = launchCount(flow);
    const developmentPreflight = cli(flow, 'preflight', ['--partition', 'development']);
    assert.equal(developmentPreflight.status, 0, developmentPreflight.output);
    assertLaunches('development', launchesSince(flow, mark), { trials: false });
    const developmentPreflightRun = test.latest(flow.folder);
    assert.deepEqual(qualified(developmentPreflightRun), ['P-002', 'P-004']);
    assert.deepEqual(viewOf(developmentPreflightRun).steps, ['shared-run', 'development-run']);
    developmentLog.push(developmentPreflight.output);

    mark = launchCount(flow);
    const heldOutPreflight = cli(flow, 'preflight', ['--partition', 'held-out']);
    assert.equal(heldOutPreflight.status, 0, heldOutPreflight.output);
    assertLaunches('held-out', launchesSince(flow, mark), { trials: false });
    const heldOutPreflightRun = test.latest(flow.folder);
    assert.deepEqual(qualified(heldOutPreflightRun), ['P-003'], 'preflight --partition held-out qualified a development probe');
    assert.deepEqual(viewOf(heldOutPreflightRun).steps, ['shared-run', 'held-out-run']);
    heldOutLog.push(heldOutPreflight.output);

    assert.equal(cli(flow, 'preflight', ['--partition', 'unknown']).status, 64);

    // A preflight that names no partition is refused under a plan (Story 1.111): it would derive the both view and launch the held-out
    // request while the gap loop is open.
    // The refusal is a usage error that comes before `check` and before any workspace, so nothing launches and no run directory exists
    // to hold a byte of the held-out partition.
    // The named partitions above still preflight, `run` with no partition still runs both, and the CI `preflight-live` check still
    // qualifies every partition.
    const noPartition = planProject('plan-no-partition-preflight');
    const noPartitionRuns = path.join(noPartition.folder, 'runs');
    const HELD_OUT_TOKENS = [CANARY, 'held-out-run', 'O-101', HELD_OUT_WITNESS];
    for (const args of [[], ['--from-working-tree']]) {
      const refused = cli(noPartition, 'preflight', args);
      // The held-out scan of the run directory comes first, so a preflight that reaches the pipeline fails here, naming the step ID.
      const heldOutInRuns = holding(noPartition.folder, HELD_OUT_TOKENS).filter((hit) => hit.startsWith('runs/'));
      assert.deepEqual(
        heldOutInRuns,
        [],
        `preflight ${args.join(' ')} left the held-out partition in a run directory: ${heldOutInRuns.join(' | ')}`,
      );
      assert.equal(refused.status, 64, `preflight ${args.join(' ')} over a partitionPlan: ${refused.output}`);
      assert.match(
        refused.output,
        /declares a partitionPlan; name the partition with --partition development or --partition held-out/,
        `the refusal names the flag and both values: ${refused.output}`,
      );
      assert.equal(launchCount(noPartition), 0, `preflight ${args.join(' ')} launched the target before refusing`);
      assert.equal(fs.existsSync(noPartitionRuns), false, `preflight ${args.join(' ')} made a run directory before refusing`);
    }
    // A folder whose evaluation.json cannot be read is still `check`'s finding, so the refusal never hides an authoring defect.
    const noPartitionManifest = path.join(noPartition.folder, 'evaluation.json');
    const noPartitionOriginal = fs.readFileSync(noPartitionManifest);
    fs.writeFileSync(noPartitionManifest, '{ not json');
    try {
      const unreadable = cli(noPartition, 'preflight');
      assert.equal(unreadable.status, 10, `an unreadable evaluation.json: ${unreadable.output}`);
    } finally {
      fs.writeFileSync(noPartitionManifest, noPartitionOriginal);
    }
    // The refusal comes before `check`: a folder that carries a `check` finding outside `evaluation.json` still exits 64 with the refusal
    // and none of the finding, where a refusal placed after `check` would exit 10 with the finding first.
    const noPartitionContract = path.join(noPartition.folder, 'contract.json');
    const noPartitionContractOriginal = fs.readFileSync(noPartitionContract);
    try {
      const contract = read(noPartitionContract);
      contract.oracles[0].polarity = 'bogus';
      write(noPartitionContract, contract);
      const checked = cli(noPartition, 'check');
      assert.equal(checked.status, 10, `the planted contract defect is a check finding: ${checked.output}`);
      assert.match(checked.output, /^contract\.json: \[engine-schema\] \/oracles\/0\/polarity /m, checked.output);
      const refusedBeforeCheck = cli(noPartition, 'preflight');
      assert.equal(
        refusedBeforeCheck.status,
        64,
        `a flagless preflight over a check finding must refuse first: ${refusedBeforeCheck.output}`,
      );
      assert.match(
        refusedBeforeCheck.output,
        /declares a partitionPlan; name the partition with --partition development or --partition held-out/,
        `the refusal comes before check: ${refusedBeforeCheck.output}`,
      );
      assert.doesNotMatch(
        refusedBeforeCheck.output,
        /^\S+: \[[a-z-]+\] /m,
        `the refusal ran after check and printed its finding: ${refusedBeforeCheck.output}`,
      );
    } finally {
      fs.writeFileSync(noPartitionContract, noPartitionContractOriginal);
    }
    // The CI `preflight-live` check is no authoring step: it calls the same function with no refusal and qualifies every partition,
    // so the plan's merge tier still launches the held-out request and exits 0.
    const mergeTier = cli(noPartition, 'ci', ['--tier', 'merge']);
    assert.equal(mergeTier.status, 0, `ci --tier merge over a partitionPlan: ${mergeTier.output}`);
    assert.ok(
      launchesSince(noPartition, 0).some(({ request }) => request === HELD_OUT_REQUEST),
      'the preflight-live check no longer qualifies every partition',
    );
    // The reference tells a maintainer about the refusal where it describes `preflight`.
    const cliReference = fs.readFileSync(path.join(__dirname, '..', 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
    assert.match(
      cliReference,
      /declares a `partitionPlan`, `--partition` is required: a `preflight` with no `--partition` exits 64 and names the flag and both values/,
      'the CLI reference does not describe the preflight refusal',
    );
    // The refusal belongs to `preflight`: `run` and `score` keep their flagless meaning, which for `run` is both partitions.
    const beforeRun = launchCount(noPartition);
    const noPartitionRun = cli(noPartition, 'run');
    assert.equal(noPartitionRun.status, 0, `run with no partition over a partitionPlan: ${noPartitionRun.output}`);
    assert.ok(
      launchesSince(noPartition, beforeRun).some(({ request }) => request === HELD_OUT_REQUEST),
      'a flagless run no longer runs both partitions',
    );
    assert.equal(cli(noPartition, 'score').status, 0);

    // Development first: it launches nothing of the held-out partition, and its run directory, scores and output hold none of it.
    mark = launchCount(flow);
    const developmentRan = cli(flow, 'run', ['--partition', 'development']);
    assert.equal(developmentRan.status, 0, developmentRan.output);
    assertLaunches('development', launchesSince(flow, mark), { trials: true });
    const developmentRun = test.latest(flow.folder);
    assert.equal(
      fs.readFileSync(path.join(developmentRun, 'contract.json')).equals(fs.readFileSync(path.join(flow.folder, 'contract.json'))),
      true,
      'the development run holds a contract.json that differs from the folder',
    );
    assert.deepEqual(viewOf(developmentRun), {
      steps: ['shared-run', 'development-run'],
      oracles: ['O-001', 'O-002'],
      behaviors: { 'B-001': ['O-001'], 'B-002': ['O-002'] },
    });
    const developmentScored = cli(flow, 'score', ['--run', path.basename(developmentRun)]);
    assert.equal(developmentScored.status, 0, developmentScored.output);
    developmentLog.push(developmentRan.output, developmentScored.output);
    assert.deepEqual(holding(developmentRun, KEEP_OUT.development), [], 'the development run holds the held-out partition');
    // A development run designates nothing and never opens the held-out plan, so it scores with that plan unreadable (Story 1.110).
    assert.deepEqual(designatedIn(developmentRun), { 'P-001': null, 'P-002': null, 'P-004': null });
    const flowPlanBytes = fs.readFileSync(path.join(flow.folder, PLAN_FILE));
    fs.writeFileSync(path.join(flow.folder, PLAN_FILE), `${CANARY} {`);
    try {
      const unopened = cli(flow, 'score', ['--run', path.basename(developmentRun)]);
      assert.equal(unopened.status, 0, `a development score opened the held-out plan\n${unopened.output}`);
      assert.deepEqual(designatedIn(developmentRun), { 'P-001': null, 'P-002': null, 'P-004': null });
    } finally {
      fs.writeFileSync(path.join(flow.folder, PLAN_FILE), flowPlanBytes);
    }
    const developmentOutcomes = JSON.parse(outcomes(developmentRun));
    assert.deepEqual(
      developmentOutcomes.map(([probeId, outcome]) => [probeId, outcome.caught]),
      [
        ['P-001', false],
        ['P-002', true],
        ['P-004', true],
      ],
    );

    const accepted = cli(flow, 'compare', ['--run', path.basename(developmentRun), '--accept']);
    assert.equal(accepted.status, 0, accepted.output);
    developmentLog.push(accepted.output);
    commit(flow.repository, 'development baseline');
    assert.deepEqual(
      holding(path.join(flow.folder, 'baseline'), KEEP_OUT.development),
      [],
      'the development replay holds the held-out partition',
    );
    const developmentCi = cli(flow, 'ci', ['--tier', 'pr']);
    assert.equal(developmentCi.status, 0, developmentCi.output);
    assert.doesNotMatch(developmentCi.output, /stale/, 'a development baseline replays as stale');
    developmentLog.push(developmentCi.output);
    assert.deepEqual(
      developmentLog.flatMap((text) => KEEP_OUT.development.filter((token) => text.includes(token))),
      [],
      'a development command printed the held-out partition',
    );

    // Then held-out: the canary reaches the target, the held-out view scores, and the gap loop's view says only what it may.
    mark = launchCount(flow);
    const heldOutRan = cli(flow, 'run', ['--partition', 'held-out']);
    assert.equal(heldOutRan.status, 0, heldOutRan.output);
    assertLaunches('held-out', launchesSince(flow, mark), { trials: true });
    assert.ok(
      launchesSince(flow, mark).some(({ request }) => request === HELD_OUT_REQUEST),
      'the held-out request never reached the target',
    );
    const heldOutRun = test.latest(flow.folder);
    assert.deepEqual(viewOf(heldOutRun), {
      steps: ['shared-run', 'held-out-run'],
      oracles: ['O-001', 'O-101'],
      behaviors: { 'B-001': ['O-001'], 'B-002': ['O-101'] },
    });
    const heldOutScored = cli(flow, 'score', ['--run', path.basename(heldOutRun)]);
    assert.equal(heldOutScored.status, 0, heldOutScored.output);
    heldOutLog.push(heldOutRan.output, heldOutScored.output);
    assert.deepEqual(holding(heldOutRun, KEEP_OUT['held-out']), [], 'the held-out run holds the development partition');
    const heldOutOutcome = read(path.join(heldOutRun, 'partitions.json'))['held-out'][0].outcome;
    assert.equal(heldOutOutcome.caught, true, JSON.stringify(heldOutOutcome));
    // A held-out run designates nothing either: its own view lists one oracle for the behavior, which the engine designates itself.
    assert.deepEqual(designatedIn(heldOutRun), { 'P-003': null });
    const gap = read(path.join(heldOutRun, 'gap-view.json'));
    assert.deepEqual(Object.keys(gap['held-out'][0]).sort(), ['outcome', 'probeClass', 'probeId']);
    assert.equal(JSON.stringify(gap).includes(CANARY), false, 'the gap view carries the canary');
    assert.equal(JSON.stringify(gap).includes('held-out-run'), false, 'the gap view carries the held-out step');

    // Independent of the development run: delete its directory and score the held-out run again.
    const heldOutBefore = outcomes(heldOutRun);
    for (const run of [developmentPreflightRun, developmentRun]) fs.rmSync(run, { recursive: true });
    const rescored = cli(flow, 'score', ['--run', path.basename(heldOutRun)]);
    assert.equal(rescored.status, 0, rescored.output);
    assert.equal(outcomes(heldOutRun), heldOutBefore, 'rescoring without the development run changed the held-out outcome');

    const heldOutAccepted = cli(flow, 'compare', ['--run', path.basename(heldOutRun), '--accept']);
    assert.equal(heldOutAccepted.status, 0, heldOutAccepted.output);
    heldOutLog.push(heldOutAccepted.output);
    commit(flow.repository, 'held-out baseline');
    assert.deepEqual(
      holding(path.join(flow.folder, 'baseline'), KEEP_OUT['held-out']),
      [],
      'the held-out replay holds the development partition',
    );
    const heldOutCi = cli(flow, 'ci', ['--tier', 'pr']);
    assert.equal(heldOutCi.status, 0, heldOutCi.output);
    assert.doesNotMatch(heldOutCi.output, /stale/, 'a held-out baseline replays as stale: its contract is compiled from the wrong view');
    heldOutLog.push(heldOutCi.output);
    // The replay's `compile` and `seal` checks ran over each view of the plan (Story 1.108): a compiled contract and a sealed brief for each.
    const heldOutCiRows = read(path.join(test.latest(flow.folder), 'ci.json')).checks;
    for (const [stage, produced] of [
      ['compile', 'eval-contract.json'],
      ['seal', 'sealed-evaluator-brief.json'],
    ]) {
      const row = heldOutCiRows.find((item) => item.id === stage);
      assert.equal(row.exit, 0, `${stage}: ${heldOutCi.output}`);
      assert.deepEqual(
        row.files.filter((file) => file.endsWith(produced)),
        [`checks/${stage}/${produced}`, `checks/${stage}/held-out/${produced}`, `checks/${stage}/both/${produced}`],
        `${stage} did not run over each view`,
      );
    }
    // A view that cannot be derived is a stale reason of its own: the baseline never passes without its digest comparison.
    const sourceContractFile = path.join(flow.folder, 'contract.json');
    const sourceContract = fs.readFileSync(sourceContractFile);
    try {
      fs.writeFileSync(sourceContractFile, '{');
      const unreadable = cli(flow, 'ci', ['--tier', 'pr']);
      assert.notEqual(unreadable.status, 0, unreadable.output);
      assert.match(
        unreadable.output,
        /the held-out view of the contract cannot be derived \(an unexpected SyntaxError while deriving it\)/,
      );
    } finally {
      fs.writeFileSync(sourceContractFile, sourceContract);
    }
    assert.deepEqual(
      heldOutLog.flatMap((text) => KEEP_OUT['held-out'].filter((token) => text.includes(token))),
      [],
      'a held-out command printed the development partition',
    );

    // Both, with no flag: the whole plan and every oracle, as before.
    mark = launchCount(flow);
    const bothRan = cli(flow, 'run');
    assert.equal(bothRan.status, 0, bothRan.output);
    assertLaunches('both', launchesSince(flow, mark), { trials: true });
    const bothRun = test.latest(flow.folder);
    assert.deepEqual(viewOf(bothRun), {
      steps: ['shared-run', 'development-run', 'held-out-run'],
      oracles: ['O-001', 'O-002', 'O-101'],
      behaviors: { 'B-001': ['O-001'], 'B-002': ['O-002', 'O-101'] },
    });
    const bothScored = cli(flow, 'score', ['--run', path.basename(bothRun)]);
    assert.equal(bothScored.status, 0, bothScored.output);
    // eval-quality designates an oracle only for a behavior that names exactly one, and the both view gives B-002 its development oracle
    // and its held-out one. Each probe of B-002 is handed the oracle of its own partition, so the both view scores it as that partition's
    // own run does (Story 1.110): P-004 against O-002, P-003 against O-101, and both are caught. The probes of B-001, which has one
    // oracle in every view, are handed nothing.
    assert.deepEqual(designatedIn(bothRun), { 'P-001': null, 'P-002': null, 'P-003': 'O-101', 'P-004': 'O-002' });
    const bothOutcomes = JSON.parse(outcomes(bothRun));
    assert.deepEqual(bothOutcomes.map(([probeId]) => probeId).sort(), ['P-001', 'P-002', 'P-003', 'P-004']);
    assert.deepEqual(
      bothOutcomes.map(([probeId, outcome]) => [probeId, outcome.caught]).sort(([left], [right]) => left.localeCompare(right)),
      [
        ['P-001', false],
        ['P-002', true],
        ['P-003', true],
        ['P-004', true],
      ],
      'a probe of the both view was not scored against its own partition oracle',
    );
    // Each probe reads as it does in its partition's own run, down to the votes.
    for (const [probeId, own] of [...developmentOutcomes, ...JSON.parse(outcomes(heldOutRun))]) {
      assert.deepEqual(
        bothOutcomes.find(([id]) => id === probeId)[1],
        own,
        `${probeId} reads differently in the both view than in its own partition`,
      );
    }

    // The designation is the folder's both view read for the run: the held-out plan is read for a both run and refused by path when it
    // cannot be read, and a folder whose both view lists other oracles under a behavior than the contract the run sealed is a finding of
    // the input check, with no score call, whether or not an oracle is designated.
    const flowPlanFile = path.join(flow.folder, PLAN_FILE);
    const flowEvaluationFile = path.join(flow.folder, 'evaluation.json');
    const flowContractFile = path.join(flow.folder, 'contract.json');
    const flowEvaluationBytes = fs.readFileSync(flowEvaluationFile);
    const flowContractBytes = fs.readFileSync(flowContractFile);
    const flowFiles = [
      [flowPlanFile, flowPlanBytes],
      [flowEvaluationFile, flowEvaluationBytes],
      [flowContractFile, flowContractBytes],
    ];
    const restoreFlow = () => {
      for (const [file, bytes] of flowFiles) fs.writeFileSync(file, bytes);
    };
    const scoreCalls = (run) => fs.readdirSync(path.join(run, 'scores')).length;
    const callsBefore = scoreCalls(bothRun);
    const bothName = path.basename(bothRun);
    const UNSHAPED = 'canary-5e0a1c3f unshaped oracle text';
    const planDrift = (edit) => () => {
      const plan = JSON.parse(flowPlanBytes.toString('utf8'));
      edit(plan);
      write(flowPlanFile, plan);
    };
    const DRIFTED = /whose oracles the evaluation folder's both view lists differently from the contract this run sealed/;
    const drifts = [
      ['the plan drops the behavior', planDrift((plan) => delete plan.behaviorOracles['B-002']), DRIFTED],
      [
        'the contract lists a second development oracle',
        () => {
          const contract = JSON.parse(flowContractBytes.toString('utf8'));
          contract.behaviors.find((behavior) => behavior.id === 'B-002').oracles.push('O-003');
          write(flowContractFile, contract);
        },
        DRIFTED,
      ],
      [
        'the folder no longer has a partitionPlan',
        () => {
          const manifest = JSON.parse(flowEvaluationBytes.toString('utf8'));
          delete manifest.partitionPlan;
          write(flowEvaluationFile, manifest);
        },
        DRIFTED,
      ],
      ['the plan lists a second held-out oracle', planDrift((plan) => (plan.behaviorOracles['B-002'] = ['O-101', 'O-102'])), DRIFTED],
      ['the plan lists an oracle the run never listed there', planDrift((plan) => (plan.behaviorOracles['B-002'] = ['O-001'])), DRIFTED],
      ['the plan lists an oracle ID of no oracle shape', planDrift((plan) => (plan.behaviorOracles['B-002'] = [UNSHAPED])), DRIFTED],
      [
        'the folder has no partitionPlan and no longer holds the behavior',
        () => {
          const manifest = JSON.parse(flowEvaluationBytes.toString('utf8'));
          delete manifest.partitionPlan;
          write(flowEvaluationFile, manifest);
          fs.writeFileSync(flowContractFile, flowContractBytes.toString('utf8').replaceAll('"id": "B-002"', '"id": "B-902"'));
        },
        DRIFTED,
      ],
      [
        'the plan gives a single-oracle behavior a second oracle, so its development probes would be designated',
        planDrift((plan) => (plan.behaviorOracles['B-001'] = ['O-102'])),
        DRIFTED,
        { probes: ['P-001', 'P-002'], behavior: 'B-001', unchanged: ['P-003', 'P-004'] },
      ],
      [
        'the plan lists a number where the oracles belong',
        planDrift((plan) => (plan.behaviorOracles['B-002'] = 5)),
        /corpus\/held-out\/plan\.json and contract\.json do not derive the views of the both run/,
      ],
      [
        'evaluation.json cannot be read',
        () => fs.writeFileSync(flowEvaluationFile, '{'),
        /evaluation\.json cannot be read as JSON, so the oracle each probe of the both view is scored against cannot be derived/,
      ],
      [
        'contract.json cannot be read',
        () => fs.writeFileSync(flowContractFile, '{'),
        /contract\.json cannot be read as JSON, so the oracle each probe of the both view is scored against cannot be derived/,
      ],
    ];
    try {
      fs.writeFileSync(flowPlanFile, `${CANARY} {`);
      const unreadablePlan = cli(flow, 'score', ['--run', bothName]);
      assert.equal(unreadablePlan.status, 10, unreadablePlan.output);
      assert.match(unreadablePlan.output, /corpus\/held-out\/plan\.json does not parse as JSON/);
      assert.equal(unreadablePlan.output.includes(CANARY), false, 'a refusal quoted a byte of the held-out plan');
      restoreFlow();
      for (const [
        label,
        edit,
        message,
        scope = { probes: ['P-003', 'P-004'], behavior: 'B-002', unchanged: ['P-001', 'P-002'] },
      ] of drifts) {
        for (const [command, args] of [
          ['score', ['--run', bothName]],
          ['compare', ['--run', bothName, '--accept']],
        ]) {
          edit();
          const refused = cli(flow, command, args);
          const what = `${command}, ${label}: ${refused.output}`;
          assert.equal(refused.status, 10, what);
          assert.match(refused.output, message, what);
          assert.equal(refused.output.includes(CANARY), false, what);
          assert.equal(refused.output.includes(UNSHAPED), false, `a refusal quoted an oracle ID of no oracle shape: ${what}`);
          if (message === DRIFTED) {
            for (const probeId of scope.probes)
              assert.match(refused.output, new RegExp(`probes/${probeId}\\.probe\\.json.*names ${scope.behavior}, whose`), what);
            for (const probeId of scope.unchanged)
              assert.doesNotMatch(
                refused.output,
                new RegExp(`probes/${probeId}\\.probe\\.json.*whose oracles`),
                `${what}: a probe of an unchanged behavior was refused`,
              );
          }
          if (command === 'score') assert.match(refused.output, /no score call ran/, what);
          assert.equal(holding(bothRun, [UNSHAPED]).length, 0, `${what}: a record of the run holds the plan's oracle ID`);
          restoreFlow();
        }
      }
      // A probe whose behavior the folder's contract does not hold is named by the IDs of the schema's shape.
      fs.writeFileSync(flowContractFile, flowContractBytes.toString('utf8').replaceAll('"id": "B-002"', '"id": "B-902"'));
      const unheld = cli(flow, 'score', ['--run', bothName]);
      assert.equal(unheld.status, 10, unheld.output);
      assert.match(unheld.output, /P-003 names B-002, which the contract does not hold/);
    } finally {
      restoreFlow();
    }
    assert.equal(scoreCalls(bothRun), callsBefore, 'a refused designation still ran a score call');
    // The run record places the probes: a folder whose `heldOutProbes` was swapped after the run scores each probe under the oracle of the
    // partition the run gave it.
    try {
      write(flowEvaluationFile, { ...JSON.parse(flowEvaluationBytes.toString('utf8')), heldOutProbes: ['P-004'] });
      const swapped = cli(flow, 'score', ['--run', bothName]);
      assert.equal(swapped.status, 0, swapped.output);
      assert.deepEqual(designatedIn(bothRun), { 'P-001': null, 'P-002': null, 'P-003': 'O-101', 'P-004': 'O-002' });
    } finally {
      restoreFlow();
    }
    // A folder that changed a behavior whose sealed list names one oracle changes no designation (the engine designates it from the sealed
    // contract), so `score` does not refuse it: the stale-baseline rule reports such a folder where a baseline is replayed.
    try {
      fs.writeFileSync(flowContractFile, flowContractBytes.toString('utf8').replaceAll('"O-001"', '"O-009"'));
      const renamedSingle = cli(flow, 'score', ['--run', bothName]);
      assert.equal(renamedSingle.status, 0, renamedSingle.output);
      assert.deepEqual(designatedIn(bothRun), { 'P-001': null, 'P-002': null, 'P-003': 'O-101', 'P-004': 'O-002' });
    } finally {
      restoreFlow();
    }
    // A call the CLI makes without the designation the in-process score holds is refused: the staged artifact is not the one the held
    // inputs produce. The substituted engine program removes the flag only while its toggle is on, so the same program with the toggle off
    // is the control.
    const dropFlag = path.join(flow.directory, 'drop-designation.js');
    fs.writeFileSync(
      dropFlag,
      [
        "const { spawnSync } = require('node:child_process');",
        'const args = process.argv.slice(2);',
        "const at = args.indexOf('--designated-oracle');",
        "if (at !== -1 && process.env.DROP_DESIGNATION === 'on') args.splice(at, 2);",
        `const ran = spawnSync(process.execPath, [${JSON.stringify(engineCliPath({}))}, ...args], { stdio: 'inherit' });`,
        String.raw`if (ran.status === null) process.stderr.write('drop-designation: the engine CLI was killed\n');`,
        'process.exit(ran.status ?? 1);',
        '',
      ].join('\n'),
    );
    const undesignatedCall = test.cli(flow.folder, 'score', ['--run', bothName], {
      ...flow.env,
      [ENGINE_CLI_ENV]: dropFlag,
      DROP_DESIGNATION: 'on',
    });
    assert.equal(undesignatedCall.status, 12, undesignatedCall.output);
    assert.match(undesignatedCall.output, /P-003: .*differs from the one the verified inputs produce/);
    assert.match(undesignatedCall.output, /P-004: .*differs from the one the verified inputs produce/);
    // The probes of B-001 are handed no flag, so the removal changes nothing for them and they are not refused.
    assert.doesNotMatch(undesignatedCall.output, /P-00[12]: .*differs from the one the verified inputs produce/);
    const sameCall = test.cli(flow.folder, 'score', ['--run', bothName], {
      ...flow.env,
      [ENGINE_CLI_ENV]: dropFlag,
      DROP_DESIGNATION: 'off',
    });
    assert.equal(sameCall.status, 0, sameCall.output);
    // The shim's call records say a program was substituted, so the score the baseline is accepted from is a plain one.
    const plainScore = cli(flow, 'score', ['--run', bothName]);
    assert.equal(plainScore.status, 0, plainScore.output);

    // A both baseline replays through `ci`: the replay scores each probe under the same designation, so every probe reads as it does in
    // the baseline, both probes of B-002 are caught and nothing reads as stale.
    const bothAccepted = cli(flow, 'compare', ['--run', path.basename(bothRun), '--accept']);
    assert.equal(bothAccepted.status, 0, bothAccepted.output);
    commit(flow.repository, 'both baseline');
    const bothCi = cli(flow, 'ci', ['--tier', 'pr']);
    assert.equal(bothCi.status, 0, bothCi.output);
    assert.doesNotMatch(bothCi.output, /stale/, 'a both baseline replays as stale');
    assert.match(bothCi.output, /12 baseline file\(s\) compared, 0 difference\(s\)/);
    // A plan edited after the baseline was accepted is a stale baseline, a warning on `pr`: the replay scores each probe under the
    // designation the baseline's call records name and reads no view of the folder, so it still reproduces the baseline.
    const flowPlanAtBaseline = fs.readFileSync(flowPlanFile);
    try {
      fs.writeFileSync(flowPlanFile, flowPlanAtBaseline.toString('utf8').replaceAll('O-101', 'O-103'));
      assert.equal(cli(flow, 'digest').status, 0);
      const staleCi = cli(flow, 'ci', ['--tier', 'pr']);
      assert.equal(staleCi.status, 0, staleCi.output);
      assert.match(staleCi.output, /the baseline is stale/, staleCi.output);
      assert.match(staleCi.output, /12 baseline file\(s\) compared, 0 difference\(s\)/, staleCi.output);
      assert.doesNotMatch(staleCi.output, /\[designation\]|\[drift\]/, staleCi.output);
    } finally {
      fs.writeFileSync(flowPlanFile, flowPlanAtBaseline);
      assert.equal(cli(flow, 'digest').status, 0);
    }
    const replayScores = path.join(test.latest(flow.folder), 'replay/scores');
    const replayCaught = Object.fromEntries(
      PROBE_IDS.map((probeId) => {
        const [outcome] = read(path.join(replayScores, probeId, 'evidence-artifact.json')).reducedProbeOutcomes;
        return [probeId, outcome.caught];
      }),
    );
    assert.deepEqual(
      replayCaught,
      { 'P-001': false, 'P-002': true, 'P-003': true, 'P-004': true },
      'the both replay reads a probe uncaught',
    );
    assert.deepEqual(
      Object.fromEntries(PROBE_IDS.map((probeId) => [probeId, designatedBy(path.join(replayScores, probeId, 'score.json'))])),
      { 'P-001': null, 'P-002': null, 'P-003': 'O-101', 'P-004': 'O-002' },
      'the replay scored a both probe under another designation than the baseline',
    );

    // A behavior whose development view lists several oracles stays undesignated there, and the both run matches that partition's own
    // run: the development clean control P-007 sits on B-003, which lists two development-only oracles, so it is handed nothing in the
    // development run and in the both run (Story 1.110).
    const several = planProject('plan-several-oracles', null, null, null, null, true);
    const severalChecked = cli(several, 'check');
    assert.equal(severalChecked.status, 0, severalChecked.output);
    const severalRuns = {};
    for (const [partition, args] of [
      ['development', ['--partition', 'development']],
      ['both', []],
    ]) {
      const ran = cli(several, 'run', args);
      assert.equal(ran.status, 0, `${partition}: ${ran.output}`);
      const run = test.latest(several.folder);
      const scored = cli(several, 'score', ['--run', path.basename(run)]);
      assert.equal(scored.status, 0, `${partition}: ${scored.output}`);
      severalRuns[partition] = { designated: designatedIn(run), outcomes: Object.fromEntries(JSON.parse(outcomes(run))) };
    }
    assert.deepEqual(severalRuns.development.designated, { 'P-001': null, 'P-002': null, 'P-004': null, 'P-007': null });
    assert.deepEqual(severalRuns.both.designated, { 'P-001': null, 'P-002': null, 'P-003': 'O-101', 'P-004': 'O-002', 'P-007': null });
    for (const probeId of ['P-001', 'P-002', 'P-004', 'P-007']) {
      assert.deepEqual(
        severalRuns.both.outcomes[probeId],
        severalRuns.development.outcomes[probeId],
        `${probeId} reads differently in the both view than in the development run`,
      );
    }

    // ---- no partitionPlan: the source bytes in every view ----------------------------------------------------------------------
    const unplannedProject = test.project(
      'plan-absent',
      ({ folder }) => {
        const manifest = path.join(folder, 'evaluation.json');
        write(manifest, { ...read(manifest), heldOutProbes: ['P-002'] });
        relayContract(folder);
      },
      { marker: true },
    );
    for (const args of [['--partition', 'development'], ['--partition', 'held-out'], []]) {
      const ran = test.cli(unplannedProject.folder, 'preflight', args, unplannedProject.env);
      assert.equal(ran.status, 0, `${args.join(' ')}: ${ran.output}`);
      const run = test.latest(unplannedProject.folder);
      assert.equal(
        fs.readFileSync(path.join(run, 'contract.json')).equals(fs.readFileSync(path.join(unplannedProject.folder, 'contract.json'))),
        true,
        `a run with no partitionPlan rewrote contract.json (${args.join(' ') || 'both'})`,
      );
    }
    // A both run of a folder with no partitionPlan designates nothing and opens no plan, so a `contract.json` the folder cannot parse
    // stops no score (Story 1.110).
    const unplannedContract = path.join(unplannedProject.folder, 'contract.json');
    const unplannedBytes = fs.readFileSync(unplannedContract);
    try {
      fs.writeFileSync(unplannedContract, `${CANARY} {`);
      assert.equal(
        loadBothViewDesignation({ folder: unplannedProject.folder, partition: 'both', heldOutProbes: ['P-002'] })(probeOf('P-002'))
          .oracleId,
        null,
      );
    } finally {
      fs.writeFileSync(unplannedContract, unplannedBytes);
    }
    // A both run of a folder with no partitionPlan scores after the folder's contract changed: its sealed list names one oracle, which the
    // engine designates from the sealed contract whatever the folder says, so neither a renamed oracle nor a renamed behavior is refused.
    const unplannedRan = test.cli(unplannedProject.folder, 'run', [], unplannedProject.env);
    assert.equal(unplannedRan.status, 0, unplannedRan.output);
    const unplannedRunName = path.basename(test.latest(unplannedProject.folder));
    const unplannedScore = () => test.cli(unplannedProject.folder, 'score', ['--run', unplannedRunName], unplannedProject.env);
    assert.equal(unplannedScore().status, 0);
    try {
      for (const [from, to] of [
        ['"O-001"', '"O-009"'],
        ['"id": "B-001"', '"id": "B-901"'],
      ]) {
        fs.writeFileSync(unplannedContract, unplannedBytes.toString('utf8').replaceAll(from, to));
        const scored = unplannedScore();
        assert.equal(scored.status, 0, `${from} renamed in the folder of a planless both run: ${scored.output}`);
      }
    } finally {
      fs.writeFileSync(unplannedContract, unplannedBytes);
    }
  }
  if (runsGroup('score')) {
    // ---- rubrics through run and score: each partition judges and calibrates its own criteria (Story 1.105) ---------------------
    // One labelled file serves every partition. It holds two items per criterion, so the development run is handed items of the
    // held-out criterion and the held-out run items of the development one, and each must leave them unjudged.
    const rubricFlow = planProject('plan-rubric-flow', {});
    const rubricsOf = (run) => read(path.join(run, 'contract.json')).rubrics.map((rubric) => [rubric.id, rubric.criteria.map((c) => c.id)]);
    const calibratedIn = (run) => read(path.join(run, 'judge-calibration.json')).criteria.map((c) => `${c.rubricId}/${c.criterionId}`);
    const calibrationCalls = (calls) => calls.filter((call) => call.calibration);
    const trialCalls = (calls) => calls.filter((call) => !call.calibration);
    /** Runs a partition and returns its run directory and the judge's calls. */
    const rubricRun = (args) => {
      const from = judgeCallCount(rubricFlow);
      const ran = cli(rubricFlow, 'run', args);
      assert.equal(ran.status, 0, ran.output);
      const run = test.latest(rubricFlow.folder);
      const scored = cli(rubricFlow, 'score', ['--run', path.basename(run)]);
      assert.equal(scored.status, 0, scored.output);
      return { run, calls: judgeCalls(rubricFlow, from), output: `${ran.output}${scored.output}` };
    };

    const rubricDevelopment = rubricRun(['--partition', 'development']);
    assert.deepEqual(rubricsOf(rubricDevelopment.run), [['R-001', ['RC-001', 'RC-002']]]);
    assert.deepEqual(calibratedIn(rubricDevelopment.run), ['R-001/RC-001', 'R-001/RC-002']);
    assert.equal(
      calibrationCalls(rubricDevelopment.calls).length,
      4,
      'the development run did not judge exactly its own four calibration items',
    );
    assert.ok(trialCalls(rubricDevelopment.calls).length > 0, 'the development run judged no trial');
    assert.deepEqual(
      [...new Set(trialCalls(rubricDevelopment.calls).map((call) => call.criteria.join(',')))],
      ['R-001/RC-001,R-001/RC-002'],
      'a development trial was judged on another set of criteria',
    );
    assert.equal(
      rubricDevelopment.calls.some((call) => call.prompt.includes('RC-101') || call.prompt.includes(CANARY)),
      false,
      'the judge of a development run was handed the held-out criterion or one of its calibration items',
    );
    assert.deepEqual(holding(rubricDevelopment.run, RUBRIC_KEEP_OUT.development), [], 'the development run holds the held-out criterion');
    assert.equal(rubricDevelopment.output.includes('RC-101'), false);

    const rubricHeldOut = rubricRun(['--partition', 'held-out']);
    assert.deepEqual(rubricsOf(rubricHeldOut.run), [
      ['R-001', ['RC-002']],
      ['R-101', ['RC-101']],
    ]);
    assert.deepEqual(calibratedIn(rubricHeldOut.run), ['R-001/RC-002', 'R-101/RC-101']);
    assert.equal(calibrationCalls(rubricHeldOut.calls).length, 4, 'the held-out run did not judge exactly its own four calibration items');
    assert.deepEqual(
      [...new Set(trialCalls(rubricHeldOut.calls).map((call) => call.criteria.join(',')))],
      ['R-001/RC-002,R-101/RC-101'],
      'a held-out trial was judged on another set of criteria',
    );
    assert.equal(
      rubricHeldOut.calls.some((call) => call.prompt.includes('RC-001') || call.prompt.includes(DEVELOPMENT_CRITERION.text)),
      false,
      'the judge of a held-out run was handed the development criterion or one of its calibration items',
    );
    assert.deepEqual(holding(rubricHeldOut.run, RUBRIC_KEEP_OUT['held-out']), [], 'the held-out run holds the development criterion');
    const rubricHeldOutOutcome = read(path.join(rubricHeldOut.run, 'partitions.json'))['held-out'][0].outcome;
    assert.equal(rubricHeldOutOutcome.caught, true, JSON.stringify(rubricHeldOutOutcome));
    const rubricGap = JSON.stringify(read(path.join(rubricHeldOut.run, 'gap-view.json')));
    assert.equal(rubricGap.includes('RC-101') || rubricGap.includes('R-101'), false, 'the gap view names the held-out criterion');

    // The whole contract judges every criterion once, and a labelled file that names a criterion of no view is refused there.
    const rubricBoth = rubricRun([]);
    assert.deepEqual(rubricsOf(rubricBoth.run), [
      ['R-001', ['RC-001', 'RC-002']],
      ['R-101', ['RC-101']],
    ]);
    assert.equal(calibrationCalls(rubricBoth.calls).length, 6, 'the both run did not judge every calibration item');
    const labelledFile = path.join(rubricFlow.folder, 'policy/judge-calibration.json');
    const labelledBytes = fs.readFileSync(labelledFile);
    try {
      const labelled = read(labelledFile);
      labelled.items.push({ rubricId: 'R-101', criterionId: 'RC-009', response: 'calibration response', expectedLevel: 0 });
      write(labelledFile, labelled);
      const refused = cli(rubricFlow, 'run');
      assert.equal(refused.status, 10, refused.output);
      assert.match(refused.output, /items\[6\] names unknown rubric criterion R-101\/RC-009/);
    } finally {
      fs.writeFileSync(labelledFile, labelledBytes);
    }

    // `ci`'s judge-calibration check calibrates the view of the baseline's partition. A rubric only the held-out plan declares left
    // `contract.json` with none, so the check used to report "no rubric declared" and skip the calibration it exists to gate.
    const rubricCi = planProject('plan-rubric-ci', { development: [], heldOut: [HELD_OUT_CRITERION] });
    /** The CI plan of a project reduced to the scheduled judge-calibration check. */
    const calibrationOnlyPlan = (project) => {
      const plan = {
        schemaVersion: 1,
        checks: [
          {
            id: 'judge-calibration',
            tier: 'scheduled',
            trigger: ['schedule', 'manual-dispatch'],
            kind: 'evaluate',
            command: ['tea-evaluate', 'ci', '--evaluation', '.', '--tier', 'scheduled'],
            enforcement: 'block',
            evidence: ['runs/<invocationId>/checks/judge-calibration/stdout'],
            placement: { tier: 'scheduled', defaultTier: 'scheduled', reason: 'AD-10 default' },
          },
        ],
      };
      write(path.join(project.folder, 'ci/evaluation-ci-plan.json'), plan);
      setTiers(project.folder, plan);
    };
    calibrationOnlyPlan(rubricCi);
    commit(rubricCi.repository, 'scheduled plan');
    const calibratedByCi = cli(rubricCi, 'ci', ['--tier', 'scheduled']);
    assert.equal(calibratedByCi.status, 0, calibratedByCi.output);
    assert.doesNotMatch(
      calibratedByCi.output,
      /declares no rubric/,
      'ci skipped the calibration of a rubric only the held-out plan declares',
    );
    assert.equal(
      judgeCalls(rubricCi).filter((call) => call.calibration).length,
      2,
      'ci did not calibrate the held-out criterion over its two labelled items',
    );

    // The check follows the partition the baseline recorded, not the whole contract. A development baseline sees `contract.json`
    // alone: its development criterion is calibrated, and the plan's rubric is not, whatever the plan holds.
    /** Accepts the run of `partition` as the project's baseline and commits it. */
    const acceptBaseline = (project, partition) => {
      const ran = cli(project, 'run', ['--partition', partition]);
      assert.equal(ran.status, 0, ran.output);
      const run = test.latest(project.folder);
      assert.equal(cli(project, 'score', ['--run', path.basename(run)]).status, 0);
      const accepted = cli(project, 'compare', ['--run', path.basename(run), '--accept']);
      assert.equal(accepted.status, 0, accepted.output);
      commit(project.repository, `${partition} baseline`);
    };
    const developmentBaseline = planProject('plan-rubric-ci-development', { development: [DEVELOPMENT_CRITERION], heldOut: [] });
    calibrationOnlyPlan(developmentBaseline);
    commit(developmentBaseline.repository, 'scheduled plan');
    acceptBaseline(developmentBaseline, 'development');
    const developmentCalls = judgeCallCount(developmentBaseline);
    const developmentCalibrated = cli(developmentBaseline, 'ci', ['--tier', 'scheduled']);
    assert.equal(developmentCalibrated.status, 0, developmentCalibrated.output);
    assert.doesNotMatch(developmentCalibrated.output, /declares no rubric/, 'ci skipped the calibration of a development baseline');
    const developmentBaselineCalls = judgeCalls(developmentBaseline, developmentCalls);
    assert.deepEqual(
      developmentBaselineCalls.filter((call) => call.calibration).map((call) => call.criteria.join(',')),
      ['R-001/RC-001', 'R-001/RC-001'],
      'ci did not calibrate the development criterion over its two labelled items',
    );
    // A plan rubric no development view holds is not this baseline's to calibrate, and the plan is not opened to find out: a plan
    // that cannot be read changes nothing.
    acceptBaseline(rubricCi, 'development');
    const planBytes = fs.readFileSync(path.join(rubricCi.folder, PLAN_FILE));
    const beforeCorrupt = judgeCallCount(rubricCi);
    try {
      write(path.join(rubricCi.folder, PLAN_FILE), 'canary-garbage {"interactionPlan": [');
      const skipped = cli(rubricCi, 'ci', ['--tier', 'scheduled']);
      assert.equal(skipped.status, 0, skipped.output);
      const evidence = /evidence is in (runs\/[^ ]+)/.exec(skipped.output)?.[1];
      assert.ok(evidence, skipped.output);
      assert.match(
        fs.readFileSync(path.join(rubricCi.folder, evidence, 'checks/judge-calibration/stdout'), 'utf8'),
        /the contract declares no rubric/,
        'ci did not report the development baseline as holding no rubric',
      );
      assert.doesNotMatch(
        skipped.output,
        /corpus\/held-out\/plan\.json|canary-garbage|\[partition-plan\]/,
        'the development baseline opened the held-out plan',
      );
      assert.equal(judgeCallCount(rubricCi), beforeCorrupt, 'ci judged for a development baseline whose view holds no rubric');
    } finally {
      fs.writeFileSync(path.join(rubricCi.folder, PLAN_FILE), planBytes);
    }

    // A held-out baseline sees the plan's rubric and the criteria of `contract.json` its view reaches (here none, the development
    // criterion reads a development-only step), so the check calibrates the plan's criterion alone; a plan that cannot be read is then
    // the check's authoring finding, since this baseline's view cannot be built without it.
    const heldOutBaseline = planProject('plan-rubric-ci-held-out', { development: [DEVELOPMENT_CRITERION], heldOut: [HELD_OUT_CRITERION] });
    calibrationOnlyPlan(heldOutBaseline);
    commit(heldOutBaseline.repository, 'scheduled plan');
    acceptBaseline(heldOutBaseline, 'held-out');
    const heldOutCalls = judgeCallCount(heldOutBaseline);
    const heldOutCalibrated = cli(heldOutBaseline, 'ci', ['--tier', 'scheduled']);
    assert.equal(heldOutCalibrated.status, 0, heldOutCalibrated.output);
    assert.doesNotMatch(heldOutCalibrated.output, /declares no rubric/, 'ci skipped the calibration of a held-out baseline');
    assert.deepEqual(
      judgeCalls(heldOutBaseline, heldOutCalls)
        .filter((call) => call.calibration)
        .map((call) => call.criteria.join(',')),
      ['R-101/RC-101', 'R-101/RC-101'],
      'ci did not calibrate the plan criterion over its two labelled items for a held-out baseline',
    );
    const heldOutPlanBytes = fs.readFileSync(path.join(heldOutBaseline.folder, PLAN_FILE));
    const heldOutBeforeCorrupt = judgeCallCount(heldOutBaseline);
    try {
      write(path.join(heldOutBaseline.folder, PLAN_FILE), 'canary-garbage {"interactionPlan": [');
      const refused = cli(heldOutBaseline, 'ci', ['--tier', 'scheduled']);
      assert.equal(refused.status, 10, refused.output);
      const refusedEvidence = /evidence is in (runs\/[^ ]+)/.exec(refused.output)?.[1];
      assert.ok(refusedEvidence, refused.output);
      const refusedFinding = fs.readFileSync(path.join(heldOutBaseline.folder, refusedEvidence, 'checks/judge-calibration/stdout'), 'utf8');
      assert.match(refusedFinding, /evaluation\.json: \[partition-plan\]/);
      assert.doesNotMatch(`${refused.output}${refusedFinding}`, /canary-/, 'the unreadable plan was quoted');
      assert.equal(judgeCallCount(heldOutBaseline), heldOutBeforeCorrupt, 'ci judged over a plan it could not read');
    } finally {
      fs.writeFileSync(path.join(heldOutBaseline.folder, PLAN_FILE), heldOutPlanBytes);
    }

    // With no baseline the run is the whole contract, so the check reads the both view. A rubric whose only criterion reads a
    // development-only step is still `contract.json`'s own; a view that dropped it would report "no rubric" and skip the gate.
    const developmentOnly = planProject('plan-rubric-ci-no-baseline', { development: [DEVELOPMENT_CRITERION], heldOut: [] });
    calibrationOnlyPlan(developmentOnly);
    commit(developmentOnly.repository, 'scheduled plan');
    const noBaselineCalibrated = cli(developmentOnly, 'ci', ['--tier', 'scheduled']);
    assert.equal(noBaselineCalibrated.status, 0, noBaselineCalibrated.output);
    assert.doesNotMatch(noBaselineCalibrated.output, /declares no rubric/, 'ci skipped the calibration of a folder with no baseline');
    assert.deepEqual(
      judgeCalls(developmentOnly)
        .filter((call) => call.calibration)
        .map((call) => call.criteria.join(',')),
      ['R-001/RC-001', 'R-001/RC-001'],
      'ci did not calibrate a development-only criterion over its two labelled items when no baseline names a partition',
    );

    // A plan that cannot be read is the check's authoring finding when no baseline narrows the view to `contract.json`: the folder
    // would otherwise pass as declaring no rubric.
    const corruptPlan = planProject('plan-rubric-ci-corrupt-plan', { development: [], heldOut: [HELD_OUT_CRITERION] });
    calibrationOnlyPlan(corruptPlan);
    write(path.join(corruptPlan.folder, PLAN_FILE), 'canary-garbage {"interactionPlan": [');
    commit(corruptPlan.repository, 'scheduled plan and an unreadable plan');
    const corrupted = cli(corruptPlan, 'ci', ['--tier', 'scheduled']);
    assert.equal(corrupted.status, 10, corrupted.output);
    const corruptedEvidence = /evidence is in (runs\/[^ ]+)/.exec(corrupted.output)?.[1];
    assert.ok(corruptedEvidence, corrupted.output);
    const corruptedFinding = fs.readFileSync(path.join(corruptPlan.folder, corruptedEvidence, 'checks/judge-calibration/stdout'), 'utf8');
    assert.match(corruptedFinding, /evaluation\.json: \[partition-plan\]/);
    assert.doesNotMatch(`${corrupted.output}${corruptedFinding}`, /canary-/, 'the unreadable plan was quoted');
    assert.doesNotMatch(corruptedFinding, /declares no rubric/);
    assert.equal(judgeCallCount(corruptPlan), 0, 'ci judged over a plan it could not read');

    // ---- waivers through run and score: each partition compiles and records its own waivers (Story 1.106) -----------------------
    // `contract.json` carries a waiver that reads a development-only step and one that reads a shared step, and the plan carries a
    // held-out waiver. Each run's contract holds the waivers of its own view, and the engine compiles and scores that view.
    const waiverFlow = planProject('plan-waiver-flow', null, {});
    const waiversOf = (run) => read(path.join(run, 'contract.json')).waivers.map((waiver) => waiver.id);
    const waiverRun = (args) => {
      const ran = cli(waiverFlow, 'run', args);
      assert.equal(ran.status, 0, ran.output);
      const run = test.latest(waiverFlow.folder);
      const scored = cli(waiverFlow, 'score', ['--run', path.basename(run)]);
      assert.equal(scored.status, 0, scored.output);
      return { run, output: `${ran.output}${scored.output}` };
    };
    // The run and score output of a partition names none of the other partition's steps, waiver IDs or waiver rationales, by the same
    // token scan the run directory gets.
    const heldIn = (text, tokens) => tokens.filter((token) => text.includes(token));
    const waiverDevelopment = waiverRun(['--partition', 'development']);
    assert.deepEqual(waiversOf(waiverDevelopment.run), ['W-001', 'W-002']);
    assert.deepEqual(holding(waiverDevelopment.run, WAIVER_KEEP_OUT.development), [], 'the development run holds the held-out waiver');
    assert.deepEqual(
      heldIn(waiverDevelopment.output, WAIVER_KEEP_OUT.development),
      [],
      'a development command named the held-out partition',
    );
    const waiverHeldOut = waiverRun(['--partition', 'held-out']);
    assert.deepEqual(waiversOf(waiverHeldOut.run), ['W-002', 'W-101', 'W-103']);
    assert.deepEqual(holding(waiverHeldOut.run, WAIVER_KEEP_OUT['held-out']), [], 'the held-out run holds the development waiver');
    assert.deepEqual(heldIn(waiverHeldOut.output, WAIVER_KEEP_OUT['held-out']), [], 'a held-out command named the development partition');
    const waiverGap = JSON.stringify(read(path.join(waiverHeldOut.run, 'gap-view.json')));
    assert.equal(waiverGap.includes('W-101'), false, 'the gap view names the held-out waiver');
    const waiverBoth = waiverRun([]);
    assert.deepEqual(waiversOf(waiverBoth.run), ['W-001', 'W-002', 'W-101', 'W-103']);
  }

  if (!listed) process.stdout.write('Evaluate partition plans passed.\n');
} finally {
  test.cleanup();
}
