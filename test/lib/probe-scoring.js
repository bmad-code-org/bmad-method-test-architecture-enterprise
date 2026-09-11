/**
 * The scoring half of `eval-quality`, driven over TEA's probe corpora.
 *
 * `runPreflight` decides whether the environment can measure anything, `runScore`
 * decides whether a contract's oracles caught the defect a probe seeded, and
 * `seal` produces the brief an evaluator may see. This module wires all three and
 * is the only place their inputs are assembled, so the deterministic gate and the
 * live run score the same way and differ only in which port answers the pre-flight
 * legs.
 *
 * ONE RECORD PER PROBE, AND WHY
 *
 * `runScore` scores exactly one probe per call, and `mapFindings` buckets any
 * defect finding citing a different probe as `dangling`, which resolves the
 * oracle that finding cites to `infrastructure-error` and invalidates the whole
 * run. A record is therefore paired with a probe and carries the findings
 * attributed to that probe. Nothing is hidden by that: the observations the
 * record carries are the complete output of the run, and every oracle reads them.
 *
 * WHERE THE EVIDENCE COMES FROM
 *
 * The deterministic half scores the outputs `test/replay/` already stores, which
 * is the same corpus `npm run test:eval-replay` and `npm run test:contract-oracles`
 * read. No model call, no credential, no network. The live half scores the same
 * shapes off a real pre-flight. Two of the stored outputs are real captures and
 * the rest are constructed, which each case's own expected.json records.
 *
 * WHAT A DISPOSITION SAYS
 *
 * `oracleDispositions` is the evaluator's own claim about each oracle, and the
 * evaluator here is TEA's scorer. Each disposition is derived from what the
 * stored case records the scorer measured rather than from evaluating the oracle,
 * so `eval-quality`'s corroboration compares two independent readings of one
 * verdict. That is the same agreement `npm run test:contract-oracles` checks, read
 * through the scoring stage instead of the evaluator.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { digest } = require('./eval-record');
const { loadCorpus } = require('./corpus-port');
// The prompt a trace observation carries is the prompt the harness assembles, and
// tools/generate-contracts.js binds the same function's output as each trace plan
// step's stdin literal. One function on both sides is the whole guard; `legs` in
// traceEvidence says what a restated prompt would cost.
const { buildPrompt: buildTracePrompt } = require('../eval-trace');
// The same rule for the nfr contract, whose plan steps bind the same function's
// output as their stdin literal; `legs` in nfrEvidence says what a restated prompt
// would cost.
const { buildPrompt: buildNfrPrompt } = require('../eval-nfr');
// The routing evidence sends the prompt the live run sends, for the reason the
// trace evidence does: the plan binds standard input as a literal, so a described
// prompt selects nothing and the record is scored against no evidence at all.
const { buildPrompt: buildRoutingPrompt, correctRoutingAnswer } = require('../eval-bmad-tea-routing');
const { ROUTING_CONTRACTS } = require('../../tools/generate-contracts');
const { buildPrompt: buildTestDesignPrompt } = require('../eval-test-design');
const {
  evaluatorConfiguration,
  isolationManifest,
  loadEvalQuality,
  recordObservation,
  scoringPolicy,
  sealedRunRecord,
  validateArtifact,
} = require('./eval-quality-inputs');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CONTRACT_ROOT = path.join(PROJECT_ROOT, 'test', 'contracts');
const PROBE_ROOT = path.join(PROJECT_ROOT, 'test', 'probes');
const REPLAY_ROOT = path.join(PROJECT_ROOT, 'test', 'replay');
const EVAL_ROOT = path.join(PROJECT_ROOT, 'test', 'evals');
const ROUTING_FIXTURE_ROOT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'tea-routing-eval');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const stripComment = (value) => {
  const { $comment, ...rest } = value;
  return rest;
};

/** The budgets and ceilings a replayed run declares. A stored output cost nothing to read and the artifacts have to say so. */
const REPLAY_BUDGETS = { maxToolCalls: 0, maxWallClockMinutes: 0, maxCostUsd: '0' };
const REPLAY_CEILINGS = { maxToolCalls: 1, maxInputTokens: 1, maxOutputTokens: 1, maxWallClockMinutes: 1, maxCostUsd: '0.01' };
const REPLAY_USE = { toolCalls: 0, inputTokens: 0, outputTokens: 0, wallClockSeconds: 0, costUsd: '0' };

const FORBIDDEN_INPUT_NOTE =
  'The run is handed a prompt and a workspace. The ground truth, the planted rows, and the expected selection stay in the harness.';

// ---------------------------------------------------------------------------
// evidence: test-review
// ---------------------------------------------------------------------------

function reviewVerdict(caseId) {
  return stripComment(readJson(path.join(REPLAY_ROOT, 'test-review', caseId, 'verdict.json')));
}

function reviewExpectation(caseId) {
  return readJson(path.join(REPLAY_ROOT, 'test-review', caseId, 'expected.json')).result;
}

/**
 * One stored verdict narrowed to the files a leg actually reviewed.
 *
 * The severity counts and the recommendation are recomputed from what survives,
 * so a review of a file with no CRITICAL plant approves and exits 0. Both are
 * read from the findings rather than carried over, because carrying them over
 * would make a leg that found nothing still report a blocking verdict.
 */
function narrowVerdict(verdict, files) {
  const findings = verdict.findings.filter((finding) => files.some((file) => finding.file.endsWith(file)));
  const violations = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) violations[finding.severity.toLowerCase()] += 1;
  const recommendation = violations.critical > 0 || violations.high > 0 ? 'Block' : 'Approve';
  return { ...verdict, findings, violations, reviewedFiles: files, recommendation };
}

/** `Block` is the only recommendation that exits 1; every other measured verdict exits 0. */
const reviewExitCode = (verdict) => (verdict.recommendation === 'Block' ? 1 : 0);

function reviewBody(verdict) {
  return {
    exitCode: reviewExitCode(verdict),
    stdout: { kind: 'json', value: verdict },
    stderr: { kind: 'text', value: '' },
    artifacts: { verdict: { kind: 'json', value: verdict }, report: { kind: 'text', value: '' } },
  };
}

/**
 * Which oracle each behavior discharges, keyed by the requirement the behavior
 * links.
 *
 * Read off `requirementLinks` rather than parsed out of an oracle's commentary
 * prose or counted off the end of the oracle list. Both are generated from one
 * ground truth, and a link is a declared field while the commentary is a
 * sentence somebody may reword and the ordering is a convention nothing checks.
 */
function oracleIdsByRequirement(contract) {
  const byRequirement = new Map();
  for (const behavior of contract.behaviors) {
    if (behavior.oracles.length !== 1) continue;
    for (const link of behavior.requirementLinks) byRequirement.set(`${link.scheme}/${link.id}`, behavior.oracles[0]);
  }
  return byRequirement;
}

function testReviewEvidence(contract) {
  const step = contract.interactionPlan[0];
  const reviewedFiles = step.inputBinding.option.files.literal;
  const groundTruth = readJson(path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-review-eval', 'ground-truth.json'));
  const byRequirement = oracleIdsByRequirement(contract);
  const cleanFile = groundTruth.files.find((entry) => (entry.planted ?? []).length === 0);
  const cleanOracleId = byRequirement.get(`tea-eval-ground-truth/${cleanFile.path}`);
  const scopeOracleId = byRequirement.get(`tea-eval-ground-truth/${groundTruth.negativeControls[0].id}`);
  const rowOfOracle = new Map(
    groundTruth.files
      .flatMap((entry) => entry.planted ?? [])
      .map((plant) => [byRequirement.get(`tea-criteria-registry/${plant.row}`), plant.row]),
  );
  const oracleOfBehavior = new Map(
    contract.behaviors.filter((behavior) => behavior.oracles.length === 1).map((behavior) => [behavior.id, behavior.oracles[0]]),
  );

  return {
    /**
     * The two witness legs differ in the file list they review, so the answer is
     * chosen the same way: a leg naming a seeded fixture gets the review that
     * reports every planted row, and a leg naming the clean control gets the
     * review that reports nothing gating.
     */
    answer(request) {
      // A review reports what it read. The stored full-recall verdict covers the
      // whole corpus, so a leg naming one file gets that verdict narrowed to the
      // findings in it, which is what the live leg returned: the seeded checkout
      // fixture drew its own five and nothing else.
      const files = String(request.channels.option.files ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      return reviewBody(narrowVerdict(reviewVerdict('full-recall'), files));
    },
    recordInputs(probe) {
      // The gameability probe is scored against the run that games the suite:
      // every planted row reported, plus one finding against a file nobody asked
      // the reviewer to look at.
      const caseId = probe.probeClass === 'gameability' ? 'out-of-scope-finding' : 'full-recall';
      const verdict = reviewVerdict(caseId);
      const measured = reviewExpectation(caseId);
      const observationId = 'review-corpus-run';
      const body = reviewBody(verdict);
      const observations = [
        recordObservation({
          observationId,
          sequence: 1,
          operationId: step.operationId,
          callInputs: { option: { files: reviewedFiles, json: 'verdict.json', agent: 'claude' } },
          stdout: body.stdout,
          stderr: body.stderr,
          exitCode: body.exitCode,
          artifacts: body.artifacts,
        }),
      ];

      const oracleIds = contract.oracles.map((oracle) => oracle.id);
      const missedRows = new Set(measured.misses);

      // What the evaluator claims about this probe's own seeded defect. A
      // gameability probe claims the degenerate reply the scope oracle rejects; a
      // defect probe claims the planted row its designated oracle discharges.
      // AD-40 decides the catch from the signature and this citation together, so
      // a probe with no finding of its own can only resolve `manifested-unclaimed`.
      const findings = [];
      if (probe.probeClass === 'gameability') {
        findings.push({
          findingType: 'defect',
          findingId: 'F-001',
          oracleId: scopeOracleId,
          probeId: probe.probeId,
          behaviorId: probe.behaviorId,
          severity: 'material',
          summary: `The review reported ${measured.outOfScope} finding(s) against a file outside the review set.`,
          confidence: 1,
          observationIds: [observationId],
          evidenceArtifacts: [],
          quotedEvidence: [
            {
              quote: verdict.findings.find((finding) => !reviewedFiles.includes(finding.file)).file,
              channel: 'artifact',
              artifactId: 'verdict',
            },
          ],
        });
      } else if (probe.probeClass === 'defect') {
        const oracleId = probe.defects[0].behaviorId === probe.behaviorId ? oracleOfBehavior.get(probe.behaviorId) : null;
        const row = rowOfOracle.get(oracleId);
        const reported = verdict.findings.find((finding) => finding.row === row);
        if (reported !== undefined) {
          findings.push({
            findingType: 'defect',
            findingId: 'F-001',
            oracleId,
            probeId: probe.probeId,
            behaviorId: probe.behaviorId,
            severity: reported.severity === 'Critical' ? 'critical' : 'material',
            summary: `The review reported registry row ${row} at ${reported.file}:${reported.line}.`,
            confidence: 1,
            observationIds: [observationId],
            evidenceArtifacts: [],
            quotedEvidence: [{ quote: row, channel: 'artifact', artifactId: 'verdict' }],
          });
        }
      }

      const violated = new Set(findings.map((finding) => finding.oracleId));
      const held = (oracleId) => {
        if (violated.has(oracleId)) return false;
        if (oracleId === scopeOracleId) return measured.outOfScope === 0;
        if (oracleId === cleanOracleId) return measured.falsePositives - measured.outOfScope === 0;
        const row = rowOfOracle.get(oracleId);
        return row === undefined ? true : !missedRows.has(row);
      };

      return {
        observations,
        findings,
        oracleDispositions: oracleIds.map((oracleId) => ({
          oracleId,
          disposition: held(oracleId) ? 'held' : 'violated',
          observationIds: [observationId],
          note: null,
        })),
        evaluatorRecommendation: findings.length > 0 ? 'CONCERNS' : 'PASS',
        conditionArm: caseId,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// evidence: trace
// ---------------------------------------------------------------------------

function traceArtifacts(caseId) {
  const root = path.join(REPLAY_ROOT, 'trace', caseId, 'test-artifacts');
  return {
    summary: { kind: 'json', value: stripComment(readJson(path.join(root, 'e2e-trace-summary.json'))) },
    matrix: { kind: 'text', value: fs.readFileSync(path.join(root, 'traceability-matrix.md'), 'utf8') },
  };
}

function traceEvidence(contract) {
  const [seededStep, cleanStep] = contract.interactionPlan;
  const groundTruth = readJson(path.join(PROJECT_ROOT, 'test', 'fixtures', 'trace-eval', 'ground-truth.json'));

  /**
   * One entry per fixture set: the plan step that selects it, the stored run its
   * project root names, and the prompt the harness assembles for it.
   *
   * `buildTracePrompt` is test/eval-trace.js's own `buildPrompt`, which is also
   * what tools/generate-contracts.js calls to build each step's stdin literal. A
   * literal is compared with `deepEquals`, so a prompt restated here in any other
   * form would select nothing, all twenty-six oracles would resolve `unreached`,
   * and the run would report clean at exit 0 having examined no evidence. The
   * equality below is the tripwire: the prompt this record will carry is checked
   * against the literal the contract on disk binds, so a divergence fails the run
   * where it would otherwise pass it silently.
   */
  const legs = groundTruth.fixtureSets.map((set) => {
    const seeded = set.id.startsWith('seeded');
    const step = seeded ? seededStep : cleanStep;
    const prompt = buildTracePrompt(set);
    if (step.inputBinding.stdin?.prompt?.literal !== prompt) {
      throw new Error(
        `${step.stepId} binds a stdin literal that is not the prompt the harness assembles for ${set.id}; run node tools/generate-contracts.js`,
      );
    }
    return {
      caseId: seeded ? 'seeded-correct-run' : 'clean-correct-run',
      observationId: seeded ? 'trace-seeded-run' : 'trace-clean-run',
      projectRoot: set.projectRoot,
      step,
      prompt,
    };
  });

  // The stored run each fixture set's project root names. A trace prompt is written
  // against one project root, and that root is the only thing in the request that
  // says which set the leg is asking for, so it is what the port stages against.
  const caseByProjectRoot = new Map(legs.map((leg) => [leg.projectRoot, leg.caseId]));

  return {
    /**
     * Two things decide a leg's answer, and both are in its request. The project
     * root the prompt is written against says which fixture set was staged, so a
     * leg naming the seeded set's root gets the seeded run and a leg naming the
     * clean set's root gets the clean run. Then `allow_gate` decides the gate: a
     * leg that allows one gets the run that evaluated it, and a leg that withholds
     * it gets a summary whose `gate_basis` is `none`, which is what step-05 writes
     * when the gate is not evaluated.
     */
    answer(request) {
      const prompt = String(request.channels.stdin?.value ?? '');
      const matched = [...caseByProjectRoot].find(([root]) => prompt.includes(`\`{project-root}\`: \`${root}\``));
      if (matched === undefined) {
        throw new Error('a trace leg sent a prompt naming no fixture set project root, so no staged run answers it');
      }
      const artifacts = traceArtifacts(matched[1]);
      if (/allow_gate`?: `?false/.test(prompt)) {
        const withheld = { ...artifacts.summary.value, gate_basis: 'none', gate_status: 'NOT_EVALUATED' };
        return {
          exitCode: 0,
          stdout: { kind: 'text', value: '' },
          stderr: { kind: 'text', value: '' },
          artifacts: { ...artifacts, summary: { kind: 'json', value: withheld } },
        };
      }
      return { exitCode: 0, stdout: { kind: 'text', value: '' }, stderr: { kind: 'text', value: '' }, artifacts };
    },
    recordInputs(probe) {
      const clean = probe.expectedClean;
      // The clean control's record carries both runs. Each step binds its own set's
      // prompt as a literal, so the seeded step selects the seeded observation and
      // the clean step selects the clean one, and the oracles of each quantify over
      // the summary their own set produced. With one observation both steps selected
      // it, so five of the seeded step's `for-any` oracles quantified over the clean
      // summary's empty or absent collections and abstained, which was the control's
      // FAIL at exit 2. Two observations under a matcher binding are worse: every
      // observation satisfies both steps, and `exactly-one` then reports selector
      // ambiguity on all twenty-six oracles. The literals and the second observation
      // work only together.
      //
      // A defect probe carries its seeded run alone. AD-9's qualification gate
      // resolves every one of its oracles before a selection is read, so a second
      // observation would add evidence nothing reaches.
      //
      // Two things this record still states loosely, and nothing reads either today.
      // `conditionArm` stays `clean-correct-run` for a record that now carries two
      // runs, and P-004's `baselinePassEvidence` in test/probes/trace.probes.json
      // names the clean summary's digest alone.
      const selected = clean ? legs : legs.filter((leg) => leg.caseId === 'seeded-correct-run');
      const observations = selected.map((leg, index) =>
        recordObservation({
          observationId: leg.observationId,
          sequence: index + 1,
          operationId: leg.step.operationId,
          callInputs: { option: { agent: 'claude' }, stdin: { prompt: leg.prompt } },
          stdout: { kind: 'text', value: '' },
          stderr: { kind: 'text', value: '' },
          exitCode: 0,
          artifacts: traceArtifacts(leg.caseId),
        }),
      );
      // Every trace oracle reads one step's interaction, so its disposition cites
      // that step's observation. A record carrying one run has nothing of the other
      // step's to cite, and a `held` disposition citing nothing is scored as an
      // unsupported claim, so those oracles cite the run the record does carry.
      const observationIdByStep = new Map(selected.map((leg) => [leg.step.stepId, leg.observationId]));
      const stepOf = (pointer) => String(pointer).split('/')[2];
      const citedObservationId = (oracle) => {
        const target = (oracle.direction?.evidenceTargets ?? []).find((pointer) => observationIdByStep.has(stepOf(pointer)));
        return target === undefined ? observations[0].observationId : observationIdByStep.get(stepOf(target));
      };
      return {
        observations,
        findings: [],
        // Every stored run in this record is recorded as scoring every check it was
        // given, so every oracle held on the evidence the harness read.
        oracleDispositions: contract.oracles.map((oracle) => ({
          oracleId: oracle.id,
          disposition: 'held',
          observationIds: [citedObservationId(oracle)],
          note: null,
        })),
        evaluatorRecommendation: 'PASS',
        conditionArm: clean ? 'clean-correct-run' : 'seeded-correct-run',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// evidence: test design
// ---------------------------------------------------------------------------

const TEST_DESIGN_REPLAY_ROOT = path.join(PROJECT_ROOT, 'test', 'replay', 'test-design');

/** One stored test design, as the single text artifact this operation declares. */
function testDesignArtifacts(caseId, designLevel, epicNum) {
  const text = fs.readFileSync(path.join(TEST_DESIGN_REPLAY_ROOT, caseId, 'design.md'), 'utf8');
  // The template renders design_level into the document's Scope line, which is the
  // one effect the prompt has on the bytes and the whole basis of this contract's
  // sensitivity witness. The stored documents carry no Scope line, so it is applied
  // here from the level the leg asked for. A leg asking for `full` and a leg asking
  // for `minimal` then differ in exactly that line, which is what the witness claims.
  const scoped = text.replace(/^(# .*\n)/, `$1\n**Scope:** ${designLevel} test design for Epic ${epicNum}\n`);
  return { design: { kind: 'text', value: scoped } };
}

/**
 * The evidence the test-design probes are scored against: the documents already
 * stored under test/replay/test-design/, answered per leg from the prompt the leg
 * sent.
 *
 * The prompt names the staged project root, and that root is the only thing in the
 * request that says which fixture set a leg is asking for, so it is what the port
 * answers from. This is the trace port's rule and it is here for the same reason:
 * both plan steps declare one operation, so a leg that could not be told apart
 * would let one set's oracles quantify over the other set's document.
 */
function testDesignEvidence(contract) {
  const groundTruth = readJson(path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-design-eval', 'ground-truth.json'));

  const legs = groundTruth.fixtureSets.map((set, index) => {
    const step = contract.interactionPlan[index];
    const prompt = buildTestDesignPrompt(set);
    // The tripwire the trace port records: a literal is compared with deepEquals,
    // so a prompt restated here in any other form would select nothing, every
    // oracle would resolve unreached, and the run would report clean at exit 0
    // having examined no evidence.
    if (step.inputBinding.stdin?.prompt?.literal !== prompt) {
      throw new Error(
        `${step.stepId} binds a stdin literal that is not the prompt the harness assembles for ${set.id}; run node tools/generate-contracts.js`,
      );
    }
    return {
      caseId: set.materialRisks?.length > 0 ? 'seeded-correct-run' : 'clean-correct-run',
      observationId: `design-${set.id}-run`,
      projectRoot: set.projectRoot,
      epicNum: set.epicNum,
      step,
      prompt,
    };
  });

  const legByProjectRoot = new Map(legs.map((leg) => [leg.projectRoot, leg]));
  const designLevelOf = (prompt) => /`design_level`: `([a-z]+)`/.exec(prompt)?.[1] ?? 'full';

  return {
    answer(request) {
      const prompt = String(request.channels.stdin?.value ?? '');
      const matched = [...legByProjectRoot].find(([root]) => prompt.includes(`\`{project-root}\`: \`${root}\``));
      if (matched === undefined) {
        throw new Error('a test-design leg sent a prompt naming no fixture set project root, so no staged run answers it');
      }
      const leg = matched[1];
      return {
        exitCode: 0,
        stdout: { kind: 'text', value: '' },
        stderr: { kind: 'text', value: '' },
        artifacts: testDesignArtifacts(leg.caseId, designLevelOf(prompt), leg.epicNum),
      };
    },
    recordInputs() {
      // Both runs, always. Each step binds its own set's prompt as a literal, so the
      // seeded step selects the seeded observation and the clean step selects the
      // clean one, and neither set's oracles ever quantify over the other's document.
      // Carrying one run would leave the other set's oracles with no evidence to
      // reach, and an oracle disposition citing nothing is scored as an unsupported
      // claim.
      const observations = legs.map((leg, index) =>
        recordObservation({
          observationId: leg.observationId,
          sequence: index + 1,
          operationId: leg.step.operationId,
          callInputs: { option: { agent: 'claude' }, stdin: { prompt: leg.prompt } },
          stdout: { kind: 'text', value: '' },
          stderr: { kind: 'text', value: '' },
          exitCode: 0,
          artifacts: testDesignArtifacts(leg.caseId, 'full', leg.epicNum),
        }),
      );
      const observationIdByStep = new Map(legs.map((leg) => [leg.step.stepId, leg.observationId]));
      const stepOf = (pointer) => String(pointer).split('/')[2];
      const citedObservationId = (oracle) => {
        const target = (oracle.direction?.evidenceTargets ?? []).find((pointer) => observationIdByStep.has(stepOf(pointer)));
        return target === undefined ? observations[0].observationId : observationIdByStep.get(stepOf(target));
      };
      return {
        observations,
        findings: [],
        // Both stored runs are the correct run of their set, so every oracle held on
        // the evidence the harness read.
        oracleDispositions: contract.oracles.map((oracle) => ({
          oracleId: oracle.id,
          disposition: 'held',
          observationIds: [citedObservationId(oracle)],
          note: null,
        })),
        evaluatorRecommendation: 'PASS',
        conditionArm: 'correct-run',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// evidence: nfr
// ---------------------------------------------------------------------------

/** The one artifact an nfr run leaves behind, as the stored case for one evidence bundle holds it. */
function nfrArtifacts(caseId) {
  return {
    report: { kind: 'text', value: fs.readFileSync(path.join(REPLAY_ROOT, 'nfr', caseId, 'test-artifacts', 'nfr-assessment.md'), 'utf8') },
  };
}

/** The `custom_nfr_categories` value one assembled prompt carries, which is empty on every leg but one. */
const NFR_CUSTOM_CATEGORIES = /`custom_nfr_categories`: `([^`]*)`/;

/**
 * The report a run given a custom NFR category writes.
 *
 * step-02 adds any `custom_nfr_categories` it is given to the categories it
 * elicits, and `nfr-report-template.md` carries a Custom NFR Evidence Audits
 * section for them, so the same bundle audited with one named produces a report
 * that names it and one audited with none produces a report that does not. That
 * difference is the contract's sensitivity witness, so the stored report answers
 * both legs and the section is what the prompt adds to it.
 *
 * @param {string} report The stored audit of the bundle the leg named.
 * @param {string[]} categories
 * @returns {string}
 */
function withCustomCategories(report, categories) {
  return [
    report,
    '## Custom NFR Evidence Audits',
    '',
    ...categories.flatMap((name) => [
      `### ${name}`,
      '',
      '- **Status:** PASS',
      '- **Threshold:** The category was requested by the run configuration and is audited against the same bundle.',
      '- **Actual:** Assessed from the evidence the bundle carries.',
      '- **Evidence:** `docs/tech-spec.md`',
      '',
    ]),
  ].join('\n');
}

function nfrEvidence(contract) {
  const groundTruth = readJson(path.join(PROJECT_ROOT, 'test', 'fixtures', 'nfr-eval', 'ground-truth.json'));

  /**
   * One entry per evidence bundle: the plan step that audits it, the stored run
   * its project root names, and the prompt the harness assembles for it.
   *
   * `buildNfrPrompt` is test/eval-nfr.js's own `buildPrompt`, which is also what
   * tools/generate-contracts.js calls to build each step's stdin literal. A
   * literal is compared with `deepEquals`, so a prompt restated here in any other
   * form would select nothing, all eight oracles would resolve `unreached`, and
   * the run would report clean at exit 0 having examined no evidence. The equality
   * below is the tripwire: the prompt this record will carry is checked against
   * the literal the contract on disk binds, so a divergence fails the run where it
   * would otherwise pass it silently.
   *
   * The plan steps are generated one per bundle in the order the ground truth
   * lists them, which is why a step is paired with a bundle by position and then
   * held to its own literal.
   */
  const legs = groundTruth.fixtureSets.map((set, index) => {
    const gapped = Object.values(set.domains ?? {}).some((domain) => domain.isUndecidable === true);
    const step = contract.interactionPlan[index];
    const prompt = buildNfrPrompt(set);
    if (step?.inputBinding.stdin?.prompt?.literal !== prompt) {
      throw new Error(
        `${step?.stepId ?? `interactionPlan[${index}]`} binds a stdin literal that is not the prompt the harness assembles for ${set.id}; run node tools/generate-contracts.js`,
      );
    }
    return {
      caseId: gapped ? 'gapped-correct-audit' : 'clean-correct-audit',
      observationId: gapped ? 'nfr-gapped-run' : 'nfr-clean-run',
      gapped,
      projectRoot: set.projectRoot,
      step,
      prompt,
    };
  });

  // The stored run each bundle's project root names. An nfr prompt is written
  // against one project root, and that root is the only thing in the request that
  // says which bundle the leg is asking for, so it is what the port stages against.
  const caseByProjectRoot = new Map(legs.map((leg) => [leg.projectRoot, leg.caseId]));
  const gappedCaseId = legs.find((leg) => leg.gapped).caseId;

  return {
    /**
     * Two things decide a leg's answer, and both are in its request. The project
     * root the prompt is written against says which evidence bundle was staged, so
     * a leg naming the gapped bundle's root gets the audit of that bundle and a leg
     * naming the clean bundle's root gets the audit of the clean one. Then
     * `custom_nfr_categories` decides the rest: a leg naming one gets the report a
     * run given that category writes, and a leg naming none gets the report as it
     * is stored.
     */
    answer(request) {
      const prompt = String(request.channels.stdin?.value ?? '');
      const matched = [...caseByProjectRoot].find(([root]) => prompt.includes(`\`{project-root}\`: \`${root}\``));
      if (matched === undefined) {
        throw new Error('an nfr leg sent a prompt naming no evidence bundle project root, so no staged run answers it');
      }
      const artifacts = nfrArtifacts(matched[1]);
      const categories = (NFR_CUSTOM_CATEGORIES.exec(prompt)?.[1] ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (categories.length > 0) {
        artifacts.report = { kind: 'text', value: withCustomCategories(artifacts.report.value, categories) };
      }
      return { exitCode: 0, stdout: { kind: 'text', value: '' }, stderr: { kind: 'text', value: '' }, artifacts };
    },
    recordInputs(probe) {
      const clean = probe.expectedClean;
      // The clean control's record carries both audits, for the reason the trace
      // control does: each step binds its own bundle's prompt as a literal, so the
      // gapped step selects the gapped observation and the clean step selects the
      // clean one, and the oracles of each read the report their own bundle
      // produced. With one observation the other step selects nothing and its four
      // oracles resolve against no interaction at all.
      //
      // A defect probe carries its gapped audit alone. AD-9's qualification gate
      // resolves every one of its oracles before a selection is read, so a second
      // observation would add evidence nothing reaches.
      const selected = clean ? legs : legs.filter((leg) => leg.caseId === gappedCaseId);
      const observations = selected.map((leg, index) =>
        recordObservation({
          observationId: leg.observationId,
          sequence: index + 1,
          operationId: leg.step.operationId,
          callInputs: { option: { agent: 'claude' }, stdin: { prompt: leg.prompt } },
          stdout: { kind: 'text', value: '' },
          stderr: { kind: 'text', value: '' },
          exitCode: 0,
          artifacts: nfrArtifacts(leg.caseId),
        }),
      );
      // Every nfr oracle reads one step's interaction, so its disposition cites that
      // step's observation. A record carrying one audit has nothing of the other
      // step's to cite, and a `held` disposition citing nothing is scored as an
      // unsupported claim, so those oracles cite the audit the record does carry.
      const observationIdByStep = new Map(selected.map((leg) => [leg.step.stepId, leg.observationId]));
      const stepOf = (pointer) => String(pointer).split('/')[2];
      const citedObservationId = (oracle) => {
        const target = (oracle.direction?.evidenceTargets ?? []).find((pointer) => observationIdByStep.has(stepOf(pointer)));
        return target === undefined ? observations[0].observationId : observationIdByStep.get(stepOf(target));
      };
      return {
        observations,
        findings: [],
        // Both stored audits are correct ones: four domain sections, the overall
        // status their own sections roll up to, and the UNKNOWN spelling on the
        // bundle that leaves a threshold unstated and nowhere else. Every oracle
        // held on the evidence the harness read.
        oracleDispositions: contract.oracles.map((oracle) => ({
          oracleId: oracle.id,
          disposition: 'held',
          observationIds: [citedObservationId(oracle)],
          note: null,
        })),
        evaluatorRecommendation: 'PASS',
        conditionArm: clean ? 'clean-correct-audit' : gappedCaseId,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// evidence: fragment selection
// ---------------------------------------------------------------------------

function selectionBody(fragments) {
  return {
    exitCode: 0,
    stdout: { kind: 'json', value: { fragments } },
    stderr: { kind: 'text', value: '' },
    artifacts: {},
  };
}

function fragmentSelectionEvidence(contract, workflow) {
  const evals = readJson(path.join(EVAL_ROOT, workflow, 'evals.json'));
  const caseOf = new Map(evals.cases.map((entry) => [entry.id, entry]));
  const first = evals.cases[0];
  const step = contract.interactionPlan.find((entry) => entry.stepId === first.id);

  return {
    /**
     * A witness leg's prompt names its own case, so the answer is that case's
     * mandated set. The two legs mandate different sets by construction, which is
     * what `buildSelectionWitness` asserts before it writes the witness, so the
     * differential holds on correct answers and would fail on a runner that
     * returned one list whatever it was asked.
     */
    answer(request) {
      // The leg carries the prompt the harness assembles, and the one part of it
      // that differs case by case is the task the run is given. Matching on that
      // is what tells the two witness legs apart.
      const prompt = String(request.channels.stdin?.value ?? '');
      const matched = evals.cases.find((entry) => prompt.includes(entry.prompt)) ?? first;
      return selectionBody(matched.expect.mustLoad);
    },
    recordInputs(probe) {
      const entry = caseOf.get(first.id);
      // The degenerate reply names every fragment the case mentions, mandated and
      // forbidden alike. It clears the containment oracle and is exactly what the
      // exclusion oracle exists to reject.
      const fragments =
        probe.probeClass === 'gameability' ? [...entry.expect.mustLoad, ...entry.expect.mustNotLoad] : entry.expect.mustLoad;
      const observationId = `${first.id}-run`;
      const body = selectionBody(fragments);
      const observations = [
        recordObservation({
          observationId,
          sequence: 1,
          operationId: step.operationId,
          callInputs: { option: { agent: 'claude' }, stdin: { prompt: `The prompt the selection harness assembles for ${first.id}.` } },
          stdout: body.stdout,
          stderr: body.stderr,
          exitCode: body.exitCode,
          artifacts: {},
        }),
      ];

      const named = new Set(fragments);
      const forbiddenNamed = entry.expect.mustNotLoad.filter((fragment) => named.has(fragment));
      const findings =
        forbiddenNamed.length > 0
          ? [
              {
                findingType: 'defect',
                findingId: 'F-001',
                oracleId: 'O-002',
                probeId: probe.probeId,
                behaviorId: probe.behaviorId,
                severity: 'critical',
                summary: `The selection for ${first.id} named ${forbiddenNamed.length} fragment(s) the step file excludes.`,
                confidence: 1,
                observationIds: [observationId],
                evidenceArtifacts: [],
                quotedEvidence: [{ quote: forbiddenNamed[0], channel: 'stdout', artifactId: null }],
              },
            ]
          : [];

      // Every case beyond the first is unexercised by this record, so its oracles
      // carry no attempt. A `not-attempted` disposition citing nothing is the one
      // spelling AD-33 admits for that.
      const exercisedOracleIds = new Set(['O-001', 'O-002']);
      const violated = new Set(findings.map((finding) => finding.oracleId));
      return {
        observations,
        findings,
        oracleDispositions: contract.oracles.map((oracle) => {
          if (!exercisedOracleIds.has(oracle.id))
            return { oracleId: oracle.id, disposition: 'not-attempted', observationIds: [], note: null };
          return {
            oracleId: oracle.id,
            disposition: violated.has(oracle.id) ? 'violated' : 'held',
            observationIds: [observationId],
            note: null,
          };
        }),
        evaluatorRecommendation: findings.length > 0 ? 'CONCERNS' : 'PASS',
        conditionArm: probe.probeClass === 'gameability' ? 'degenerate-selection' : 'expected-selection',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// evidence: bmad-tea routing
// ---------------------------------------------------------------------------

function routingBody(answer) {
  return {
    exitCode: 0,
    stdout: { kind: 'json', value: answer },
    stderr: { kind: 'text', value: '' },
    artifacts: {},
  };
}

/**
 * The oracle of one routing contract that reads one field of one case's answer,
 * found by its evidence pointer rather than by its id, for the reason
 * tools/generate-probes.js gives: ids are positional and a case added to the
 * corpus renumbers every oracle after it.
 */
function routingOracleFor(contract, caseId, field) {
  const pointer = `/interactions/${caseId}/stdout/${field}`;
  const found = contract.oracles.find((oracle) => oracle.direction.evidenceTargets[0] === pointer);
  // Named rather than dereferenced blind: the caller reads `.id` off this, and a
  // TypeError there says nothing about which pointer went missing.
  if (found === undefined) throw new Error(`${contract.contractId}: no oracle reads ${pointer}`);
  return found;
}

function routingEvidence(contract) {
  const corpus = readJson(path.join(ROUTING_FIXTURE_ROOT, 'ground-truth.json'));
  const intents = readJson(path.join(ROUTING_FIXTURE_ROOT, 'intents.json'));
  const promptOf = new Map(intents.cases.map((entry) => [entry.id, buildRoutingPrompt(entry)]));
  const first = contract.interactionPlan[0].stepId;
  const expected = corpus.cases[first];
  const gamedField = contract.contractId === 'tea-routing-intents-behavioral' ? 'menuCode' : 'question';

  return {
    /**
     * A witness leg carries the whole assembled prompt for one case, so the case
     * it is asking about is the one whose prompt it matches, and the answer is
     * that case's own. The two legs differ by construction, which is what
     * buildRoutingWitness asserts before it writes the witness, so the
     * differential holds on correct answers and would fail on a runner that
     * returned one answer whatever it was asked.
     */
    answer(request) {
      const prompt = String(request.channels.stdin?.value ?? '');
      const matched = intents.cases.find((entry) => promptOf.get(entry.id) === prompt) ?? { id: first };
      return routingBody(correctRoutingAnswer(corpus.cases[matched.id] ?? expected));
    },
    recordInputs(probe) {
      // One observation per plan step, and the degenerate answer only on the
      // first. A record carrying one observation against a ten-step plan leaves
      // nine cases' oracles unreached, and an oracle nothing reached is an oracle
      // this corpus says nothing about. The other suites' records look cleaner
      // than that only because their plans bind standard input with a matcher, so
      // their single observation is selected by every step at once and each case's
      // oracles quantify over another case's evidence.
      const gamedCase = probe.probeClass === 'gameability' ? first : null;
      const observations = contract.interactionPlan.map((planStep, index) => {
        const caseId = planStep.stepId;
        const answer = correctRoutingAnswer(corpus.cases[caseId]);
        if (caseId === gamedCase) {
          // The degenerate reply quotes the user's message back as its reason,
          // which satisfies every deciding token, and gets the decision wrong.
          // That is the whole shape token containment invites, and the decision
          // oracle is what refuses it.
          answer.reason = intents.cases.find((entry) => entry.id === caseId).intent;
          if (gamedField === 'menuCode') answer.menuCode = corpus.cases[caseId].expectedMenuCode === 'TMT' ? 'TR' : 'TMT';
          else answer.question = 'Could you tell me a bit more about what you are after?';
        }
        const body = routingBody(answer);
        return recordObservation({
          observationId: `${caseId}-run`,
          sequence: index + 1,
          operationId: planStep.operationId,
          // The plan binds standard input as a literal, and a literal is compared
          // with deepEquals, so this has to be the prompt itself rather than a
          // description of it: anything else selects nothing and every oracle
          // resolves unreached over a record that examined no evidence.
          callInputs: { option: { agent: 'claude' }, stdin: { prompt: promptOf.get(caseId) } },
          stdout: body.stdout,
          stderr: body.stderr,
          exitCode: body.exitCode,
          artifacts: {},
        });
      });

      const naive = routingOracleFor(contract, first, 'reason');
      const disciplined = routingOracleFor(contract, first, gamedField);
      const gamedAnswer = observations.find((entry) => entry.observationId === `${first}-run`)?.stdout.value;
      const findings =
        gamedCase === null
          ? []
          : [
              {
                findingType: 'defect',
                findingId: 'F-001',
                oracleId: disciplined.id,
                probeId: probe.probeId,
                behaviorId: probe.behaviorId,
                severity: 'critical',
                summary:
                  gamedField === 'menuCode'
                    ? `The answer for ${first} restated the intent as its reason and dispatched to ${gamedAnswer.menuCode}.`
                    : `The clarification for ${first} restated the intent as its reason and named no menu item to choose between.`,
                confidence: 1,
                observationIds: [`${first}-run`],
                evidenceArtifacts: [],
                quotedEvidence: [
                  {
                    quote: gamedField === 'menuCode' ? String(gamedAnswer.menuCode) : gamedAnswer.question,
                    channel: 'stdout',
                    artifactId: null,
                  },
                ],
              },
            ];

      const violated = new Set(findings.map((finding) => finding.oracleId));
      return {
        observations,
        findings,
        oracleDispositions: contract.oracles.map((oracle) => ({
          oracleId: oracle.id,
          disposition: violated.has(oracle.id) ? 'violated' : 'held',
          observationIds: [`${oracle.direction.evidenceTargets[0].split('/')[2]}-run`],
          note: null,
        })),
        evaluatorRecommendation: findings.length > 0 ? 'CONCERNS' : 'PASS',
        conditionArm: probe.probeClass === 'gameability' ? 'degenerate-answer' : 'expected-answer',
        naiveOracleId: naive.id,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// the suites
// ---------------------------------------------------------------------------

/**
 * Every contract that has a probe corpus, with the evidence source that answers
 * for it.
 *
 * Asynchronous because the probe corpora are resolved through `eval-quality`'s
 * corpus port rather than read here: the digest that pins which corpus a score
 * was computed over is taken from what the port returned, so the bytes behind
 * it come from the certified resolver. The digest input is unchanged, so the
 * value it produces is the value it has always produced.
 */
async function suites() {
  const entries = [
    // The nfr entry leads the list so its id sorts ahead of every other, which
    // keeps a sibling branch adding an entry of its own out of this one's lines.
    {
      id: 'nfr',
      contractPath: path.join(CONTRACT_ROOT, 'nfr.contract.json'),
      probesPath: path.join(PROBE_ROOT, 'nfr.probes.json'),
      evidenceFor: nfrEvidence,
    },
    ...ROUTING_CONTRACTS.map((spec) => ({
      id: spec.relativePath.replace('.contract.json', ''),
      contractPath: path.join(CONTRACT_ROOT, spec.relativePath),
      probesPath: path.join(PROBE_ROOT, spec.relativePath.replace('.contract.json', '.probes.json')),
      evidenceFor: routingEvidence,
    })),
    {
      id: 'test-review',
      contractPath: path.join(CONTRACT_ROOT, 'test-review.contract.json'),
      probesPath: path.join(PROBE_ROOT, 'test-review.probes.json'),
      evidenceFor: testReviewEvidence,
    },
    {
      id: 'test-design',
      contractPath: path.join(CONTRACT_ROOT, 'test-design.contract.json'),
      probesPath: path.join(PROBE_ROOT, 'test-design.probes.json'),
      evidenceFor: testDesignEvidence,
    },
    {
      id: 'trace',
      contractPath: path.join(CONTRACT_ROOT, 'trace.contract.json'),
      probesPath: path.join(PROBE_ROOT, 'trace.probes.json'),
      evidenceFor: traceEvidence,
    },
  ];
  const selectionRoot = path.join(PROBE_ROOT, 'fragment-selection');
  for (const name of fs.readdirSync(selectionRoot).sort()) {
    if (!name.endsWith('.probes.json')) continue;
    const workflow = name.replace('.probes.json', '');
    entries.push({
      id: `fragment-selection/${workflow}`,
      contractPath: path.join(CONTRACT_ROOT, 'fragment-selection', `${workflow}.contract.json`),
      probesPath: path.join(selectionRoot, name),
      evidenceFor: (contract) => fragmentSelectionEvidence(contract, workflow),
    });
  }
  const corpus = await loadCorpus(
    PROJECT_ROOT,
    entries.map((entry) => path.relative(PROJECT_ROOT, entry.probesPath)),
  );
  return entries.map((entry) => {
    const contract = readJson(entry.contractPath);
    const reference = path.relative(PROJECT_ROOT, entry.probesPath);
    return {
      ...entry,
      contract,
      probes: JSON.parse(corpus.bytes(reference).toString('utf8')),
      evidence: entry.evidenceFor(contract),
    };
  });
}

/** An `EnvironmentProbePort` that answers every leg from the outputs `test/replay/` already stores. */
function storedProbePort(suite) {
  return {
    async probe(request) {
      const body = suite.evidence.answer(request);
      return {
        probeId: request.probeId,
        interfaceId: request.interfaceId,
        operationId: request.operationId,
        kind: 'cli',
        exitCode: body.exitCode,
        stdout: body.stdout,
        stderr: body.stderr,
        artifacts: body.artifacts,
      };
    },
  };
}

/**
 * One probe's pre-flight, through whichever port the caller supplies.
 *
 * Per probe rather than per corpus, because `runScore` pairs one probe with one
 * verdict and AD-10 plans a seeded-fault check for every defect the probes it is
 * handed declare. A corpus-wide verdict lets one probe nobody can pre-flight
 * invalidate the score of every other probe in the file, which is a fact about
 * the first probe rather than about the contract.
 *
 * The legs an operation's sensitivity witness declares are the same for every
 * probe, so a live port that memoizes on the request pays for them once.
 */
async function preflightSuite(suite, { port, runId, signal, sink }) {
  const { runPreflight } = await loadEvalQuality();
  return runPreflight({ contract: suite.contract, probes: suite.probes, runId, port, signal, sink });
}

/**
 * A `DiagnosticSink` that keeps what the pre-flight stage reported.
 *
 * `runPreflight` emits one line as each leg is planned, one as it is observed,
 * and one closing line carrying the leg count and the reduced verdict. Nothing
 * else in the chain emits: `application/diagnostics.ts` states that only stages
 * carrying a run identifier emit, and `compile` and `seal` carry none.
 *
 * One sink serves a whole suite and the diagnostics are partitioned afterwards
 * by `runId`, which is the only structured field that tells two probes'
 * pre-flights apart. `runSuite` mints a distinct run identifier per probe for
 * exactly that reason.
 */
function collectingSink() {
  const diagnostics = [];
  return { sink: (diagnostic) => diagnostics.push(diagnostic), diagnostics };
}

/**
 * What the sink reported for one run, as fields rather than as prose.
 *
 * `Diagnostic` carries `runId`, `stage` and a free-text `message`, so the two
 * things a caller can read without parsing English are the run identity and how
 * many lines arrived. The count is the leg count: two lines per leg and one
 * closing line, so a run reporting an even number of diagnostics means that
 * emission contract moved, and `legs` is `null` there rather than a fraction.
 *
 * The leg count is worth holding because the sink is the only channel that
 * reports it. `PreflightVerdict` carries checks, and a check is not a leg: of
 * the 51 probes the stored corpus scores, 26 plan a number of legs that differs
 * from the number of checks their verdict reports.
 */
function preflightDiagnostics(diagnostics, runId) {
  const mine = diagnostics.filter((diagnostic) => diagnostic.runId === runId);
  const stages = [...new Set(mine.map((diagnostic) => diagnostic.stage))].sort();
  return {
    count: mine.length,
    // A count of zero is already even, so it needs no case of its own: a run the
    // sink never heard from reports `null` legs by the same rule as a run whose
    // emission contract moved, and `diagnosticProblems` tells the two apart.
    legs: mine.length % 2 === 1 ? (mine.length - 1) / 2 : null,
    stages,
  };
}

/**
 * Whether TEA promotes a CONCERNS verdict to exit `1`, which is the decision
 * `--strict` makes for `eval-quality`'s own binary.
 *
 * `false`, and the reason is TEA's exit classes rather than the ladder's.
 * `docs/explanation/eval-quality-adoption-guide.md` fixes exit `1` as a measured
 * quality failure and exit `2` as an environment that could not measure
 * anything, and a TEA check decides the first by baseline movement. Promoting
 * would give exit `1` a second meaning inside one repository, and it would take
 * `npm test` red today on the 32 CONCERNS the stored corpus scores, every one of
 * which the baseline already records as expected.
 *
 * The decision is declined rather than absent, and the field it turns on is read
 * rather than assumed: `test/test-probe-corpus.js` records `strictPromotable`
 * for every probe, so a CONCERNS that becomes evidence-only moves the baseline
 * with this constant unchanged.
 */
const STRICT_CONCERNS_PROMOTION = false;

/**
 * The exit code one ladder resolution carries for TEA.
 *
 * `LadderResolution.exitCode` is the rung's own code and CONCERNS's is `0`, so
 * a promotion cannot be read out of that field: `--strict` is applied on top of
 * it, which is what `eval-quality`'s `cli/exit-codes.ts` does. `strictPromotable`
 * is carried through from the ladder rather than re-derived here, because the
 * package states that the ladder's field is the authority and that a locally
 * invented `evidenceConditionsOnly` is the wrong shape to hold.
 */
function ladderExitCode(ladder) {
  if (ladder.verdict === 'CONCERNS' && STRICT_CONCERNS_PROMOTION && ladder.strictPromotable) return 1;
  return ladder.exitCode;
}

/**
 * One probe scored against its contract.
 *
 * Returns the ladder result and the evidence artifact whenever there is one. An
 * Invalid run mints no artifact, which `runScore` states as `artifact: null`,
 * and the reason is in the basis.
 */
async function scoreProbe(suite, probe, { preflightVerdict, runId, modelSnapshot, signal, corpusDigest }) {
  const { runScore, digestArtifact } = await loadEvalQuality();
  const inputs = suite.evidence.recordInputs(probe);
  const contractDigest = digestArtifact(suite.contract);

  const configuration = evaluatorConfiguration({
    evaluatorIdentity: `tea-${suite.id}`,
    modelSnapshot,
    sealedBriefDigest: contractDigest,
    systemPromptDigest: digest([suite.contract.contractId, probe.probeId]),
    permissionInventory: [],
    budgets: REPLAY_BUDGETS,
  });
  const evaluatorConfigurationDigest = digestArtifact(configuration);
  const manifest = isolationManifest({
    runId,
    contractId: suite.contract.contractId,
    conditionArm: inputs.conditionArm,
    modelSnapshot,
    systemPromptDigest: configuration.systemPromptDigest,
    contractDigest,
    evaluatorConfigurationDigest,
    workspaceIdentity: `tea-${suite.id}-${probe.probeId}`,
    resourceCeilings: REPLAY_CEILINGS,
    actualResourceUse: REPLAY_USE,
    forbiddenInputNote: FORBIDDEN_INPUT_NOTE,
  });
  const record = sealedRunRecord({
    runId,
    conditionArm: inputs.conditionArm,
    contractDigest,
    sealedBriefDigest: contractDigest,
    evaluatorConfigurationDigest,
    evaluatorRecommendation: inputs.evaluatorRecommendation,
    oracleDispositions: inputs.oracleDispositions,
    findings: inputs.findings,
    observations: inputs.observations,
    actionsArtifact: { storage: 'public', path: `test/replay/${suite.id}`, privateRef: null, digest: contractDigest },
    isolationManifestArtifact: { storage: 'public', path: `test/replay/${suite.id}`, privateRef: null, digest: digestArtifact(manifest) },
    resourceUse: REPLAY_USE,
  });

  const schemaProblems = [
    ...validateArtifact('sealed-run-record', record).map((message) => `SealedRunRecord${message}`),
    ...validateArtifact('isolation-manifest', manifest).map((message) => `IsolationManifest${message}`),
    ...validateArtifact('evaluator-configuration', configuration).map((message) => `EvaluatorConfiguration${message}`),
  ];

  const result = await runScore({
    record,
    manifest,
    configuration,
    contract: suite.contract,
    probe,
    preflightVerdict,
    policy: scoringPolicy(),
    privateManifest: null,
    corpusDigest,
    signal,
  });

  if (result.artifact !== null) {
    schemaProblems.push(...validateArtifact('evidence-artifact', result.artifact).map((message) => `EvidenceArtifact${message}`));
  }

  return { probe, record, manifest, configuration, result, schemaProblems };
}

/**
 * The digest that pins which corpus a score was computed over.
 *
 * The probes it digests were resolved through the corpus port by `suites`, so
 * this no longer reads a file of its own. The input is the contract identifier
 * and the corpus as parsed, which is what the scorer actually consumes, and it
 * is unchanged: moving this to the file's raw bytes would pin whitespace a score
 * does not depend on, and would be a re-attestation rather than an adoption.
 */
function corpusDigestOf(suite) {
  return digest([suite.contract.contractId, JSON.stringify(suite.probes)]);
}

/**
 * The contract-strength vector over one suite, assembled from the per-probe
 * artifacts.
 *
 * `runScore` seals one probe per call, so each artifact carries a vector over
 * that probe alone. AD-7's rate is over unique qualified probe identifiers per
 * class, and summing the per-probe counts is that same rate: canary probes and
 * clean controls contribute a `null` class on their own artifact and are excluded
 * here for the same reason.
 */
function strengthVector(scored) {
  const classes = ['defect', 'gameability', 'zero-action'];
  const vector = {};
  for (const probeClass of classes) {
    const relevant = scored.filter(({ probe }) => probe.probeClass === probeClass && !probe.expectedClean);
    if (relevant.length === 0) {
      vector[probeClass] = null;
      continue;
    }
    let exercised = 0;
    let caught = 0;
    for (const entry of relevant) {
      const own = entry.result.artifact?.strength?.vector?.[probeClass];
      if (!own) continue;
      exercised += own.exercised;
      caught += own.caught;
    }
    vector[probeClass] = { exercised, caught, rate: exercised === 0 ? null : caught / exercised };
  }
  return vector;
}

/** The sealed evaluator brief for one contract: the contract minus everything that gives the answer away. */
async function sealContract(contract) {
  const { seal } = await loadEvalQuality();
  const brief = seal(contract);
  return { brief, schemaProblems: validateArtifact('sealed-evaluator-brief', brief) };
}

/**
 * One suite, end to end: pre-flight, then every probe scored, then the brief.
 *
 * `port` decides whether this is the deterministic half or the live one. Nothing
 * else differs.
 *
 * The sink is supplied here rather than taken from the caller. A sink threaded
 * through the signatures and filled by nobody reports nothing, so every caller
 * gets the pre-flight diagnostics whether or not it asked, and each entry
 * carries its own probe's under `diagnostics`.
 */
async function runSuite(suite, { port, runId, modelSnapshot, signal }) {
  const corpusDigest = corpusDigestOf(suite);
  const { sink, diagnostics } = collectingSink();
  const scored = [];
  for (const probe of suite.probes) {
    const probeRunId = `${runId}-${probe.probeId}`;
    const preflightVerdict = await preflightSuite({ ...suite, probes: [probe] }, { port, runId: probeRunId, signal, sink });
    const preflightProblems = validateArtifact('preflight-verdict', preflightVerdict);
    const entry = await scoreProbe(suite, probe, { preflightVerdict, runId, modelSnapshot, signal, corpusDigest });
    scored.push({
      ...entry,
      preflight: preflightVerdict,
      preflightProblems,
      diagnostics: preflightDiagnostics(diagnostics, probeRunId),
    });
  }
  const sealed = await sealContract(suite.contract);

  return { suite, scored, strength: strengthVector(scored), sealed, corpusDigest };
}

module.exports = {
  collectingSink,
  corpusDigestOf,
  ladderExitCode,
  preflightDiagnostics,
  preflightSuite,
  runSuite,
  scoreProbe,
  sealContract,
  storedProbePort,
  strengthVector,
  suites,
};
