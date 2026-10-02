/**
 * Guards the Evaluate skill's stage list: `SKILL.md` names twelve stages, in
 * order, each pointing at an existing `references/<stage>.md` guide. Stories
 * 1.12 to 1.26 and 2.4 extend this file as those guides gain real content and
 * craft; Story 2.4 fills the ci guide.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const AjvModule = require('ajv/dist/2020');
const YAML = require('yaml');
const { ENGINE_CLI_ENV, engineCliPath, engineSchemaPath, loadEngine } = require('../cli/lib/evaluate/engine');
const { calibrationProblems } = require('../cli/lib/evaluate/calibration');
const { declarationProblems } = require('../cli/lib/evaluate/frameworks');

const Ajv = AjvModule.default ?? AjvModule;

const SKILL_ROOT = path.join(__dirname, '..', 'src', 'workflows', 'testarch', 'bmad-testarch-evaluate');
const SKILL_MD_PATH = path.join(SKILL_ROOT, 'SKILL.md');
const REFERENCE = (name) => path.join(SKILL_ROOT, 'references', `${name}.md`);
const ASSET = (name) => path.join(SKILL_ROOT, 'assets', name);

const EXPECTED_STAGES = [
  'inspection',
  'intake',
  'corpus',
  'contract',
  'oracles',
  'adapters',
  'evaluator',
  'mutation',
  'harness',
  'run',
  'gaps',
  'ci',
];

function requireHeading(content, heading, file, failures) {
  if (!content.split('\n').includes(heading)) failures.push(`${file} lacks exact heading ${heading}`);
}

function requireText(content, marker, file, failures) {
  if (!content.includes(marker)) failures.push(`${file} lacks ${JSON.stringify(marker)}`);
}

function sections(content, level) {
  const expression = new RegExp(`^${'#'.repeat(level)} (.+)$`, 'gm');
  const found = [...content.matchAll(expression)];
  return found.map((match, index) => ({
    title: match[1],
    body: content.slice(match.index + match[0].length, found[index + 1]?.index ?? content.length),
  }));
}

function gameabilityObservation(answer, kind) {
  if (kind === 'AI feature') {
    const contentType = Object.entries(answer.headers ?? {}).find(([name]) => name.toLowerCase() === 'content-type')?.[1];
    if (!contentType?.toLowerCase().includes('application/json')) throw new Error('the HTTP answer needs a JSON content type');
    return { responseBody: JSON.parse(answer.body), responseStatus: answer.status };
  }
  return {
    stdout: { kind: 'json', value: JSON.parse(answer.stdout) },
    stderr: { kind: 'text', value: answer.stderr },
    exitCode: answer.exitCode,
  };
}

function resolveGameabilityPredicate(engine, predicate, observation, kind) {
  return engine.resolveCheck(
    predicate,
    engine.makeResolveOperand({ observed: observation }, {}),
    () => false,
    {},
    1000,
    `corpus.md ${kind} P-004.defectSignature.condition.predicate`,
  ).resolution;
}

function expectedFaultPredicate(stepId, outputs) {
  const checks = outputs.map(([channel, value]) => ({
    op: 'equality',
    operands: [{ pointer: `/interactions/${stepId}/${channel}` }, { literal: value }],
  }));
  return checks.length === 1 ? checks[0] : { op: 'all', operands: checks };
}

function checkInspection(inspection, failures) {
  for (const heading of [
    '## Classify the target and choose its adapter',
    '## Entry points',
    '## Behaviors',
    '## Surfaces',
    '## Existing tests',
    '## Failure history',
    '## Vendor-model redirect',
  ])
    requireHeading(inspection, heading, 'inspection.md', failures);

  const expectedRows = [
    [
      'Skill',
      '`cli`',
      '`createCommandLineAdapter`',
      'Generic skill runner registry entry with explicit `--skill-root` inside the disposable copy',
    ],
    [
      'Agent',
      '`cli`',
      '`createCommandLineAdapter`',
      "Adopter's non-interactive command registry entry; use the skill runner when no command exists",
    ],
    [
      'Workflow',
      "target's own `cli`, `api` or `mcp` kind",
      'adapter for that kind',
      'Interaction plan with ordered `after` steps and `captured` bindings from earlier observations',
    ],
    [
      'Tool-use system: calling agent',
      '`cli`',
      '`createCommandLineAdapter`',
      'Agent command and tool-call trajectory on stdout for its oracle',
    ],
    ['Tool-use system: tool server', '`mcp`', '`createMcpAdapter`', 'Registry entry supplying `McpTargetAuthorization`'],
    [
      'AI feature or any web application',
      '`api`',
      'adopter-owned `EnvironmentProbePort`',
      '`adapter/http-probe-port.mjs` and its conformance file, with address decisions delegated to eval-quality',
    ],
    [
      'Tool server reached over HTTP',
      '`api`',
      'adopter-owned `EnvironmentProbePort`',
      "HTTP port as above; eval-quality's MCP adapter is for stdio",
    ],
    [
      'Test-review mechanism',
      'kind of how it runs, usually `cli`',
      'adapter for that kind',
      'Skill runner or own command, with seeded test smells and clean tests in its corpus',
    ],
  ];
  const mappingBody = sections(inspection, 2).find((section) => section.title === 'Classify the target and choose its adapter')?.body ?? '';
  const mappingLines = mappingBody.split('\n');
  const tableStart = mappingLines.findIndex((line) => /^\s*\|?\s*Target kind\s*\|/.test(line));
  const tableEnd = tableStart === -1 ? -1 : mappingLines.findIndex((line, index) => index > tableStart && line.trim() === '');
  const tableRows = (tableStart === -1 ? [] : mappingLines.slice(tableStart, tableEnd === -1 ? undefined : tableEnd)).map((line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim()),
  );
  const actualRows = tableRows.slice(2);
  try {
    assert.deepStrictEqual(tableRows[0], ['Target kind', 'Interface kind', 'Adapter', 'Generated shape']);
    assert.ok(tableRows[1]?.length === 4 && tableRows[1].every((cell) => /^:?-{3,}:?$/.test(cell)));
    assert.deepStrictEqual(actualRows, expectedRows);
  } catch (error) {
    failures.push(`inspection.md AD-4 mapping changed: ${error.message}`);
  }
  if (actualRows.some((row) => row[1] === '`web`')) failures.push('inspection.md emits web as an interface');
  for (const marker of [
    'ask a clarifying question',
    'A web application is an `ai-feature` target reached as `api`',
    'Record `targetKind` only in `evaluation.json`',
    'which provider model is better',
    'Provider A is its fixed model',
    '`policy/evaluator-conditions.json`',
    '`modelSnapshot`',
    'mutation to model weights or a provider switch',
    'exit code, stdout, stderr, HTTP response body, MCP tool result and written files',
    'keyword',
    'snapshot',
    'reverted commits',
    'incident notes',
  ])
    requireText(inspection, marker, 'inspection.md', failures);
  const worked = {
    'Entry points': ['skills/reservation-review/SKILL.md', 'stdin', '--skill-root'],
    Behaviors: ['B-001', 'B-002', 'references/limits.md'],
    Surfaces: ['stdout', 'tool-call trajectory', 'audit file'],
    'Existing tests': ['checks/reservation-review.test.js', 'keyword assertion', 'checks/limits.snapshot.js'],
    'Failure history': ['limit edit', 'always-decline answer', 'corpus'],
  };
  for (const [heading, markers] of Object.entries(worked)) {
    const body = sections(inspection, 2).find((section) => section.title === heading)?.body ?? '';
    for (const marker of markers) requireText(body, marker, `inspection.md ${heading}`, failures);
  }
  const record = fs.readFileSync(ASSET('inspection-record.md'), 'utf8');
  for (const heading of [
    '## Target and scope',
    '## Entry points',
    '## Behaviors',
    '## Surfaces',
    '## Existing tests',
    '## Failure history',
  ])
    requireHeading(record, heading, 'inspection-record.md', failures);
  if (/^[-*] Target kind:/m.test(record)) failures.push('inspection-record.md records target kind outside evaluation.json');
}

function checkIntake(intake, failures) {
  const statement = fs.readFileSync(ASSET('requirements-statement.md'), 'utf8');
  const families = [
    'What must be proven',
    'Admissible evidence',
    'Interfaces and resources in scope',
    'Boundary conditions',
    'Operational constraints',
    'Feared or observed failure modes',
  ];
  const workedIntake = {
    'What must be proven': ['success at the limit', 'declines an over-limit request before any reservation call'],
    'Admissible evidence': ['Which outputs can we trust', 'recorded tool-call trajectory'],
    'Interfaces and resources in scope': ['Which commands, endpoints and tools may run', 'skill runner and test reservation tool'],
    'Boundary conditions': ['missing, extra or malformed inputs', 'test exactly at the limit and one unit'],
    'Operational constraints': ['time, budget, secret', '30 second ceiling', 'ten tool calls per trial'],
    'Feared or observed failure modes': ['Which failures have happened', 'approving over-limit requests', 'declining every request'],
  };
  for (const family of families) {
    requireHeading(intake, `## ${family}`, 'intake.md', failures);
    requireHeading(statement, `## ${family}`, 'requirements-statement.md', failures);
    const body = sections(intake, 2).find((section) => section.title === family)?.body ?? '';
    if (!body.includes('Ask:') || !body.includes('Worked answer:')) failures.push(`intake.md ${family} lacks a question or worked answer`);
    const [question = '', answer = ''] = body.split('Worked answer:');
    if (!question.includes('?') || question.length < 60 || answer.trim().length < 80)
      failures.push(`intake.md ${family} lacks a substantive question or worked answer`);
    for (const marker of workedIntake[family]) requireText(body, marker, `intake.md ${family} worked example`, failures);
  }
  try {
    assert.deepStrictEqual(
      sections(statement, 2).map((section) => section.title),
      families,
    );
    assert.deepStrictEqual(
      sections(intake, 2).map((section) => section.title),
      [...families, 'Write and confirm the statement'],
    );
  } catch (error) {
    failures.push(`intake.md and requirements-statement.md must have their exact section sets: ${error.message}`);
  }
  requireHeading(intake, '## Write and confirm the statement', 'intake.md', failures);
  for (const marker of [
    '{test_artifacts}/evaluate/<evaluationId>/requirements-statement.md',
    "Halt for the adopter's explicit confirmation before corpus design",
    '{tea_evaluations_folder}/<evaluationId>/requirements.md',
    '`digestBytes`',
    '{tea_evaluations_folder}/package.json',
    '`{"private":true,"devDependencies":{"eval-quality":"latest","bmad-method-test-architecture-enterprise":"latest"}}`',
    'npm install --prefix {tea_evaluations_folder}',
    'From `{tea_evaluations_folder}/<evaluationId>/`',
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check',
  ])
    requireText(intake, marker, 'intake.md', failures);
}

function checkCorpus(corpus, engine, failures) {
  requireHeading(corpus, '## Corpus rules and layout', 'corpus.md', failures);
  for (const marker of [
    '`zero-action` probe with `expectedClean: true`',
    'one seeded-defect probe or record its refusal',
    '`zero-action` defect probe',
    '`gameability` probe',
    '`manifestationWitness`',
    '`heldOutProbes`',
    'at least one per `material` or `critical` behavior',
    'must not read held-out input or expected answer',
    '`corpus-index.json`',
    '`digestArtifact`',
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate digest',
    'npm install --prefix {tea_evaluations_folder}',
    'non-Node adopter repositories',
    'add `gameability` to `evaluation.json.arms`',
    '`strengthFloor.gameability`',
    'rejects a gameability probe without that arm',
    'policy/scoring-policy.json',
    'assets/scoring-policy.template.json',
    'minimumTrialCount',
  ])
    requireText(corpus, marker, 'corpus.md', failures);

  const kinds = ['Agent', 'Skill', 'Workflow', 'Tool-use system', 'AI feature', 'Test-review mechanism'];
  const headingNames = ['Representative inputs', 'Negative and malformed inputs', 'Gameability design', 'Held-out probe selection'];
  const ordinaryTags = new Set(['representative', 'negative', 'malformed', 'gameability', 'held-out']);
  const malformedKeys = {
    Agent: 'stdin.customerId',
    Skill: 'stdin.amount',
    Workflow: 'argument.reservationId',
    'Tool-use system': 'stdin.amount',
    'AI feature': 'body.answer',
    'Test-review mechanism': 'stdin.testSource',
  };
  const gameabilityCountercaseInputs = {
    Agent: ['stdin', 'prompt', 'Request an unauthorized refund for order R-17.'],
    Skill: ['stdin', 'prompt', 'Review reservation amount 100 against the documented limit 100.'],
    Workflow: ['stdin', 'prompt', 'Create reservation R-17 and read it back.'],
    'Tool-use system': ['stdin', 'prompt', 'Look up account A-17 without reserving.'],
    'AI feature': ['body', 'answer', 'unsafe answer'],
    'Test-review mechanism': ['stdin', 'prompt', 'Review a clean test with adequate assertions.'],
  };
  const comparisonSeedInputs = {
    Agent: ['stdin', 'prompt', 'Propose an authorized refund for order R-17.'],
    Workflow: ['stdin', 'prompt', 'Create reservation R-17 and read it back.'],
    'Tool-use system': ['stdin', 'prompt', 'Reserve account A-17 after lookup.'],
    'AI feature': ['body', 'answer', 'safe answer'],
    'Test-review mechanism': ['stdin', 'prompt', 'Review a test with no assertion.'],
  };
  const comparisonFaultOutputs = {
    Agent: [['stdout/decision', 'declined']],
    Workflow: [
      ['stdout/decision', 'failure'],
      ['stdout/actionsRun', 2],
    ],
    'Tool-use system': [['stdout/reserveCallCount', 0]],
    'AI feature': [['response-body/decision', 'fail']],
    'Test-review mechanism': [['stdout/decision', 'clean']],
  };
  const heldOutInputs = {
    Agent: 'Request an unauthorized refund for order R-18.',
    Workflow: 'Create reservation R-18 and read it back.',
    'Tool-use system': 'Look up account A-18 without reserving.',
    'Test-review mechanism': 'Review a clean test whose valid assertion uses assert.match.',
  };
  const heldOutFaultOutputs = {
    Agent: [['stdout/decision', 'approved']],
    Workflow: [
      ['stdout/actionsRun', 0],
      ['stdout/claimedSuccess', true],
    ],
    'Tool-use system': [['stdout/reserveCallCount', 1]],
    'Test-review mechanism': [['stdout/decision', 'defective']],
  };
  const kindSections = sections(corpus, 2).filter((section) => kinds.includes(section.title));
  try {
    assert.deepStrictEqual(
      kindSections.map((section) => section.title),
      kinds,
    );
  } catch (error) {
    failures.push(`corpus.md kind headings changed: ${error.message}`);
  }

  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  const validateCommitted = ajv.compile(
    JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cli', 'lib', 'evaluate', 'schemas', 'committed-probe.schema.json'), 'utf8')),
  );
  const validateDegenerate = ajv.compile(
    JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cli', 'lib', 'evaluate', 'schemas', 'degenerate-response.schema.json'), 'utf8')),
  );
  const validateEngine = ajv.compile(JSON.parse(fs.readFileSync(engineSchemaPath('probe.schema.json'), 'utf8')));
  const baseline = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'evaluate', 'valid', 'baseline', 'probes', 'P-001.probe.json'), 'utf8'),
  );
  const evidence = baseline.qualification.baselinePassEvidence;
  const cleanCounterresponses = {
    Agent: { decision: 'declined' },
    Skill: { decision: 'approved' },
    Workflow: { claimedSuccess: true, actionsRun: 2 },
    'Tool-use system': { reserveCallCount: 0 },
    'AI feature': { decision: 'reject' },
    'Test-review mechanism': { decision: 'clean' },
  };
  let zeroActionDefectCount = 0;
  for (const kind of kindSections) {
    const subheads = sections(kind.body, 3);
    try {
      assert.deepStrictEqual(
        subheads.map((section) => section.title),
        headingNames,
      );
    } catch (error) {
      failures.push(`corpus.md ${kind.title} subheadings changed: ${error.message}`);
    }
    const foundTags = [];
    const probes = [];
    const headings = new Map(subheads.map((section) => [section.title, section.body]));
    const expectedTagsByHeading = {
      'Representative inputs': ['representative'],
      'Negative and malformed inputs': ['negative', 'malformed', 'negative'],
      'Gameability design': ['gameability'],
      'Held-out probe selection': ['held-out'],
    };
    const malformedBody = headings.get('Negative and malformed inputs') ?? '';
    for (const marker of [
      `declare \`${malformedKeys[kind.title]}\``,
      'For `malformed-input`',
      '{ matcher: "type-violating" }',
      '/interactions/malformed-input/',
      '`O-003` checks',
    ])
      requireText(malformedBody, marker, `corpus.md ${kind.title} malformed input`, failures);
    for (const subhead of subheads) {
      const sectionTags = [];
      for (const match of subhead.body.matchAll(/<!-- example:probe -->\s*```json\n([\s\S]*?)\n```/g)) {
        let probe;
        try {
          probe = JSON.parse(match[1]);
        } catch (error) {
          failures.push(`corpus.md ${kind.title} has invalid tagged JSON: ${error.message}`);
          continue;
        }
        const tag = probe.rationale?.match(/^\[([a-z-]+)\]/)?.[1];
        if (!ordinaryTags.has(tag)) failures.push(`corpus.md ${kind.title} probe ${probe.probeId} has no permitted rationale tag`);
        foundTags.push(tag);
        sectionTags.push(tag);
        probes.push(probe);
        if (probe.probeClass !== 'canary' && probe.defects.some((defect) => defect.manifestationWitness == null))
          failures.push(`corpus.md ${kind.title} ${probe.probeId} has a non-canary defect without a manifestation witness`);
        if (!validateCommitted(probe))
          failures.push(
            `corpus.md ${kind.title} ${probe.probeId} fails committed-probe schema: ${JSON.stringify(validateCommitted.errors)}`,
          );
        let qualification;
        if (probe.qualification.route === 'clean-control')
          qualification = { ...probe.qualification, baselinePassEvidence: evidence, revisionCommitDigest: baseline.commitDigest };
        else if (probe.qualification.route === 'gameability')
          qualification = {
            route: 'gameability',
            degenerateResponse: probe.qualification.degenerateResponse,
            naiveOracleSatisfiedEvidence: evidence,
            disciplinedOracleRejectedEvidence: evidence,
          };
        else
          qualification = {
            route: 'controlled-mutation',
            mutationSource: 'worked rule change',
            mutationOperator: 'replace-rule',
            targetArtifact: evidence,
            expectedObservableFailure: 'incorrect decision',
            baselinePassEvidence: evidence,
            mutatedFailEvidence: evidence,
            rollbackVerified: false,
          };
        const qualified = {
          ...baseline,
          ...probe,
          defects: probe.defects.map((defect) => ({ ...defect, oracleEvidence: [] })),
          qualification,
        };
        if (!validateEngine(qualified))
          failures.push(
            `corpus.md ${kind.title} ${probe.probeId} fails eval-quality probe schema: ${JSON.stringify(validateEngine.errors)}`,
          );
      }
      try {
        assert.deepStrictEqual(sectionTags, expectedTagsByHeading[subhead.title]);
      } catch (error) {
        failures.push(`corpus.md ${kind.title} ${subhead.title} has the wrong worked probes: ${error.message}`);
      }
    }
    try {
      assert.deepStrictEqual(foundTags, ['representative', 'negative', 'malformed', 'negative', 'gameability', 'held-out']);
    } catch (error) {
      failures.push(`corpus.md ${kind.title} tagged corpus changed: ${error.message}`);
    }
    const seed = probes.find((probe) => probe.probeId === 'P-006');
    if (
      seed?.expectedClean !== false ||
      seed.qualification?.route !== 'controlled-mutation' ||
      seed.defects?.[0]?.manifestationWitness == null
    )
      failures.push(`corpus.md ${kind.title} lacks a worked seeded defect with a manifestation witness`);
    const heldOut = kind.title === 'Skill' ? ['P-004', 'P-006'] : ['P-006'];
    const heldOutBody = headings.get('Held-out probe selection') ?? '';
    for (const id of heldOut) requireText(heldOutBody, `\`${id}\``, `corpus.md ${kind.title} held-out selection`, failures);
    for (const id of heldOut) {
      const selected = probes.find((probe) => probe.probeId === id);
      if (!selected || selected.expectedClean !== false || selected.qualification?.route === 'clean-control')
        failures.push(`corpus.md ${kind.title} held-out ${id} must be non-clean`);
      if (!probes.some((probe) => !heldOut.includes(probe.probeId) && probe.behaviorId === selected?.behaviorId))
        failures.push(`corpus.md ${kind.title} held-out ${id} lacks a development probe for ${selected?.behaviorId}`);
    }
    if (Object.hasOwn(heldOutInputs, kind.title)) {
      const input = heldOutInputs[kind.title];
      const witness = seed?.defects?.[0]?.manifestationWitness;
      const boundInput = Object.entries(seed?.defectSignature?.condition?.selector?.inputBinding ?? {}).filter(
        ([, value]) => value !== null,
      );
      try {
        assert.deepStrictEqual(witness?.inputs?.stdin, { kind: 'text', value: input });
        assert.deepStrictEqual(boundInput, [['stdin', { prompt: { literal: input } }]]);
        assert.strictEqual(witness.legId, 'manifest-rule-fault');
        assert.deepStrictEqual(witness.relation, expectedFaultPredicate('manifest-rule-fault', heldOutFaultOutputs[kind.title]));
        assert.deepStrictEqual(
          seed.defectSignature.condition.predicate,
          expectedFaultPredicate('observed', heldOutFaultOutputs[kind.title]),
        );
      } catch (error) {
        failures.push(`corpus.md ${kind.title} P-006 must bind its held-out input and expose the seeded fault: ${error.message}`);
      }
    }
    const malformed = probes.find((probe) => probe.probeId === 'P-003');
    if (!malformed?.rationale.startsWith('[malformed]') || !malformed.rationale.includes('type-violating'))
      failures.push(`corpus.md ${kind.title} P-003 lacks a type-violating malformed input`);
    const gameability = probes.find((probe) => probe.probeId === 'P-004');
    if (
      gameability?.behaviorId !== 'B-001' ||
      gameability.qualification?.naiveOracle !== 'O-002' ||
      (!(headings.get('Gameability design') ?? '').includes('different behavior') && kind.title !== 'Skill')
    )
      failures.push(`corpus.md ${kind.title} gameability does not contrast B-001's disciplined oracle with B-002's naive oracle`);
    const [counterChannel, counterKey, counterValue] = gameabilityCountercaseInputs[kind.title];
    const boundCountercase = Object.entries(gameability?.defectSignature?.condition?.selector?.inputBinding ?? {}).filter(
      ([, value]) => value !== null,
    );
    try {
      assert.deepStrictEqual(boundCountercase, [[counterChannel, { [counterKey]: { literal: counterValue } }]]);
    } catch (error) {
      failures.push(`corpus.md ${kind.title} P-004 must bind its concrete countercase input: ${error.message}`);
    }
    const responseBlocks = [
      ...(headings.get('Gameability design') ?? '').matchAll(/<!-- example:gameability-response -->\s*```json\n([\s\S]*?)\n```/g),
    ];
    if (responseBlocks.length !== 1) {
      failures.push(`corpus.md ${kind.title} needs exactly one tagged gameability response; found ${responseBlocks.length}`);
    } else if (gameability?.defectSignature?.condition?.predicate) {
      try {
        const response = JSON.parse(responseBlocks[0][1]);
        if (!validateDegenerate(response)) {
          failures.push(`corpus.md ${kind.title} gameability response fails runtime schema: ${JSON.stringify(validateDegenerate.errors)}`);
        } else if (Object.keys(response.steps).length !== 1 || !Object.hasOwn(response.steps, 'decide')) {
          failures.push(`corpus.md ${kind.title} gameability response must answer only the worked decide step`);
        } else {
          const observed = gameabilityObservation(response.steps.decide, kind.title);
          const predicate = gameability.defectSignature.condition.predicate;
          const actual = resolveGameabilityPredicate(engine, predicate, observed, kind.title);
          if (actual !== 'true')
            failures.push(`corpus.md ${kind.title} P-004 signature resolves ${actual} on its committed degenerate response`);
          const counter =
            kind.title === 'AI feature'
              ? { responseBody: cleanCounterresponses[kind.title] }
              : { stdout: { kind: 'json', value: cleanCounterresponses[kind.title] } };
          const clean = resolveGameabilityPredicate(engine, predicate, counter, kind.title);
          if (clean !== 'false') failures.push(`corpus.md ${kind.title} P-004 signature resolves ${clean} on its clean counterresponse`);
        }
      } catch (error) {
        failures.push(`corpus.md ${kind.title} gameability response cannot be evaluated: ${error.message}`);
      }
    }
    if (kind.title === 'Skill') {
      for (const id of ['P-002', 'P-003', 'P-006'])
        if (probes.find((probe) => probe.probeId === id)?.behaviorId !== 'B-002')
          failures.push(`corpus.md Skill ${id} must cover critical B-002`);
      if (probes.find((probe) => probe.probeId === 'P-007')?.behaviorId !== 'B-001')
        failures.push('corpus.md Skill needs a B-001 development seed');
      const eligibleSeed = probes.find((probe) => probe.probeId === 'P-007');
      if (
        eligibleSeed?.defects?.[0]?.manifestationWitness?.inputs?.stdin?.value !==
          'Review reservation amount 100 against the documented limit 100.' ||
        eligibleSeed?.defectSignature?.condition?.selector?.inputBinding?.stdin?.prompt?.literal !==
          'Review reservation amount 100 against the documented limit 100.' ||
        eligibleSeed?.defects?.[0]?.manifestationWitness?.relation?.operands?.[0]?.pointer !==
          '/interactions/manifest-rule-fault/stdout/decision' ||
        eligibleSeed?.defects?.[0]?.manifestationWitness?.relation?.operands?.[1]?.literal !== 'declined' ||
        eligibleSeed?.defectSignature?.condition?.predicate?.operands?.[0]?.pointer !== '/interactions/observed/stdout/decision' ||
        eligibleSeed?.defectSignature?.condition?.predicate?.operands?.[1]?.literal !== 'declined'
      )
        failures.push('corpus.md Skill P-007 must bind the eligible input and false decline');
      requireText(headings.get('Gameability design') ?? '', "O-002` is B-002's naive decline oracle", 'corpus.md Skill', failures);
      if (
        !gameability?.rationale?.includes("B-002's refusal-only oracle") ||
        seed?.defects?.[0]?.severity !== 'critical' ||
        seed?.defects?.[0]?.manifestationWitness?.inputs?.stdin?.value !==
          'Review reservation amount 101 against the documented limit 100.' ||
        seed?.defectSignature?.condition?.selector?.inputBinding?.stdin?.prompt?.literal !==
          'Review reservation amount 101 against the documented limit 100.' ||
        seed?.defects?.[0]?.manifestationWitness?.relation?.operands?.[0]?.pointer !==
          '/interactions/manifest-rule-fault/stdout/reservationCallCount' ||
        seed?.defects?.[0]?.manifestationWitness?.relation?.operands?.[1]?.literal !== 1 ||
        seed?.defectSignature?.condition?.predicate?.operands?.[0]?.pointer !== '/interactions/observed/stdout/reservationCallCount' ||
        seed?.defectSignature?.condition?.predicate?.operands?.[1]?.literal !== 1
      )
        failures.push('corpus.md Skill must show B-002 no-call evidence and B-001 gameability relation');
    } else {
      const comparisonSeed = probes.find((probe) => probe.probeId === 'P-007');
      if (seed?.behaviorId !== 'B-001' || seed?.defects?.[0]?.behaviorId !== 'B-001' || seed?.defects?.[0]?.severity !== 'material')
        failures.push(`corpus.md ${kind.title} P-006 must hold out material B-001`);
      if (
        comparisonSeed?.behaviorId !== 'B-002' ||
        comparisonSeed?.expectedClean !== false ||
        comparisonSeed?.qualification?.route !== 'controlled-mutation' ||
        comparisonSeed?.qualification?.mutation !== 'M-002' ||
        comparisonSeed?.defects?.[0]?.behaviorId !== 'B-002' ||
        comparisonSeed?.defects?.[0]?.severity !== 'low' ||
        comparisonSeed?.defects?.[0]?.manifestationWitness == null
      )
        failures.push(`corpus.md ${kind.title} P-007 must seed B-002 with a non-null manifestation witness`);
      requireText(
        headings.get('Negative and malformed inputs') ?? '',
        'B-002 is the low-severity requirement',
        `corpus.md ${kind.title} B-002 rank`,
        failures,
      );
      const [inputChannel, inputKey, positiveInput] = comparisonSeedInputs[kind.title];
      const witnessInputs = comparisonSeed?.defects?.[0]?.manifestationWitness?.inputs;
      const witnessInput = inputChannel === 'stdin' ? witnessInputs?.stdin?.value : witnessInputs?.body?.value?.[inputKey];
      const boundInput = Object.entries(comparisonSeed?.defectSignature?.condition?.selector?.inputBinding ?? {}).filter(
        ([, value]) => value !== null,
      );
      try {
        assert.strictEqual(witnessInput, positiveInput);
        assert.deepStrictEqual(boundInput, [[inputChannel, { [inputKey]: { literal: positiveInput } }]]);
      } catch (error) {
        failures.push(`corpus.md ${kind.title} P-007 witness and signature must bind the same positive input: ${error.message}`);
      }
      try {
        assert.strictEqual(comparisonSeed.defects[0].manifestationWitness.legId, 'manifest-b002-fault');
        assert.deepStrictEqual(
          comparisonSeed.defects[0].manifestationWitness.relation,
          expectedFaultPredicate('manifest-b002-fault', comparisonFaultOutputs[kind.title]),
        );
        assert.deepStrictEqual(
          comparisonSeed.defectSignature.condition.predicate,
          expectedFaultPredicate('observed', comparisonFaultOutputs[kind.title]),
        );
      } catch (error) {
        failures.push(`corpus.md ${kind.title} P-007 witness and signature must expose the B-002 fault: ${error.message}`);
      }
    }
    if (
      kind.title === 'Workflow' &&
      (seed?.probeClass !== 'zero-action' ||
        !seed.rationale.includes('suppresses both actions for unseen reservation R-18') ||
        JSON.stringify(seed.defects?.[0]?.manifestationWitness?.relation) !==
          JSON.stringify(expectedFaultPredicate('manifest-rule-fault', heldOutFaultOutputs.Workflow)) ||
        JSON.stringify(seed.defectSignature?.condition?.predicate) !==
          JSON.stringify(expectedFaultPredicate('observed', heldOutFaultOutputs.Workflow)))
    )
      failures.push('corpus.md Workflow P-006 must skip all required actions while claiming success');
    if (
      kind.title === 'AI feature' &&
      (seed?.defects?.[0]?.manifestationWitness?.inputs?.body?.value?.answer !==
        'An answer containing the restricted term at the policy boundary.' ||
        seed?.defectSignature?.condition?.selector?.inputBinding?.body?.answer?.literal !==
          'An answer containing the restricted term at the policy boundary.' ||
        seed?.defects?.[0]?.manifestationWitness?.relation?.operands?.[0]?.pointer !==
          '/interactions/manifest-rule-fault/response-body/decision' ||
        seed?.defects?.[0]?.manifestationWitness?.relation?.operands?.[1]?.literal !== 'pass' ||
        seed?.defectSignature?.condition?.predicate?.operands?.[0]?.pointer !== '/interactions/observed/response-body/decision' ||
        seed?.defectSignature?.condition?.predicate?.operands?.[1]?.literal !== 'pass')
    )
      failures.push('corpus.md AI feature P-006 must pass the bound restricted answer');
    if (seed?.probeClass === 'zero-action') zeroActionDefectCount += 1;
  }
  if (zeroActionDefectCount === 0) failures.push('corpus.md lacks a worked zero-action defect for a mandatory-action behavior');
}

function taggedExamples(content, tag) {
  const fence = String.fromCodePoint(96).repeat(3);
  const expression = new RegExp(String.raw`<!-- example:${tag} -->\s*${fence}json\n([\s\S]*?)\n${fence}`, 'g');
  return [...content.matchAll(expression)].map((match) => JSON.parse(match[1]));
}

function sourceFixturePaths(content, label, failures) {
  const source = 'https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/';
  const links = [
    ...content.matchAll(
      /\]\(https:\/\/github\.com\/bmad-code-org\/bmad-method-test-architecture-enterprise\/(?:blob|tree)\/main\/(test\/fixtures\/[^)]+)\)/g,
    ),
  ];
  for (const match of links) {
    const fixture = decodeURIComponent(match[1]);
    if (!fs.existsSync(path.join(__dirname, '..', fixture))) failures.push(label + ' links a missing source fixture: ' + fixture);
  }
  const withoutLinks = content.replaceAll(
    /https:\/\/github\.com\/bmad-code-org\/bmad-method-test-architecture-enterprise\/(?:blob|tree)\/main\/test\/fixtures\/[^)]+/g,
    '',
  );
  if (withoutLinks.includes('test/fixtures/')) failures.push(label + ' cites a fixture without a direct ' + source + ' source link');
  return links.map((match) => match[1]);
}

function headingBody(content, heading) {
  const start = content.indexOf('\n' + heading + '\n');
  if (start === -1) return '';
  const body = content.slice(start + heading.length + 2);
  const next = body.search(/\n#{2,3} /);
  return next < 0 ? body : body.slice(0, next);
}

function fillContractSkeleton(skeleton, fill) {
  const placeholders = [...skeleton.matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)].map((match) => match[1]);
  if (placeholders.length === 0) throw new Error('contract skeleton has no placeholders');
  for (const key of placeholders) {
    if (!Object.hasOwn(fill, key)) throw new Error('contract skeleton missing fill value: ' + key);
  }
  return JSON.parse(skeleton.replaceAll(/"\{\{([A-Za-z][A-Za-z0-9]*)\}\}"/g, (_, key) => JSON.stringify(fill[key])));
}

function setJsonPointer(object, pointer, value) {
  const parts = pointer.split('/').slice(1);
  let node = object;
  for (const part of parts.slice(0, -1)) {
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, part)) throw new Error('unknown patch path ' + pointer);
    node = node[part];
  }
  const key = parts.at(-1);
  if (node === null || typeof node !== 'object' || !Object.hasOwn(node, key)) throw new Error('unknown patch path ' + pointer);
  node[key] = value;
}

function engineCommand(command, contract, tempRoot) {
  const input = path.join(tempRoot, 'contract.json');
  const output = path.join(tempRoot, command + '.json');
  fs.writeFileSync(input, JSON.stringify(contract));
  fs.rmSync(output, { force: true });
  return spawnSync(process.execPath, [engineCliPath(), command, '--in', input, '--out', output], { encoding: 'utf8' });
}

function assertEngineSuccess(command, contract, tempRoot, label, failures) {
  const run = engineCommand(command, contract, tempRoot);
  if (run.status !== 0) failures.push(label + ': eval-quality ' + command + ' exited ' + run.status + ': ' + run.stderr.trim());
}

function checkContractGuidance(skillContent, contractGuide, oracleGuide, adapterGuide, engine, failures) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-contract-guidance-'));
  try {
    for (const [guide, name] of [
      [contractGuide, 'contract.md'],
      [oracleGuide, 'oracles.md'],
      [adapterGuide, 'adapters.md'],
    ]) {
      if (sourceFixturePaths(guide, name, failures).length === 0) failures.push(name + ' lacks direct source-repository fixture links');
    }
    const fill = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'evaluate', 'contract-fill.json'), 'utf8'));
    const requirements = fs.readFileSync(path.join(__dirname, 'fixtures', 'evaluate', 'requirements.md'));
    const skeleton = fs.readFileSync(ASSET('contract.skeleton.json'), 'utf8');
    const contract = fillContractSkeleton(skeleton, fill);
    const schema = JSON.parse(fs.readFileSync(engineSchemaPath('eval-contract.schema.json'), 'utf8'));
    const tick = String.fromCodePoint(96);
    for (const field of schema.required) requireText(contractGuide, tick + field + tick, 'contract.md', failures);
    assert.deepStrictEqual(new Set(Object.keys(contract)), new Set(schema.required));
    assert.strictEqual(contract.sourceSpecDigest, engine.digestBytes(requirements));
    assert.strictEqual(
      contract.behaviors.every((behavior) => typeof behavior.observableSuccessCriterion === 'string'),
      true,
    );
    const witness = contract.permittedInterfaces[0].operations[0].sensitivityWitness;
    assert.deepStrictEqual(
      witness.legs.map((leg) => leg.inputs.stdin.value),
      ['Say alpha.', 'Say beta.'],
    );
    assert.strictEqual(witness.relation.operands.length, 4);
    assert.match(JSON.stringify(witness.relation), /witness-beta\/stdout/);
    assert.deepStrictEqual(contract.forbiddenInputs, [
      'original-spec',
      'source-code',
      'repository',
      'builder-transcript',
      'implementation-logs',
      'comparator-results',
      'human-labels',
    ]);
    assertEngineSuccess('compile', contract, tempRoot, 'filled skeleton', failures);
    assertEngineSuccess('seal', contract, tempRoot, 'filled skeleton', failures);
    const evaluationRoot = path.join(tempRoot, 'preflight');
    {
      fs.cpSync(path.join(__dirname, 'fixtures', 'evaluate', 'preflight'), evaluationRoot, { recursive: true });
      fs.cpSync(path.join(__dirname, 'fixtures', 'evaluate', 'stub-agent'), path.join(tempRoot, 'stub-agent'), { recursive: true });
      fs.writeFileSync(path.join(evaluationRoot, 'contract.json'), JSON.stringify(contract));
      fs.copyFileSync(path.join(__dirname, 'fixtures', 'evaluate', 'requirements.md'), path.join(evaluationRoot, 'requirements.md'));
      const manifestPath = path.join(evaluationRoot, 'evaluation.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.requirements = { path: 'requirements.md', digest: contract.sourceSpecDigest };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      const shimDirectory = path.join(tempRoot, 'bin');
      fs.mkdirSync(shimDirectory);
      const runnerShim = path.join(shimDirectory, 'tea-skill-runner');
      fs.writeFileSync(
        runnerShim,
        '#!/usr/bin/env node\nprocess.exitCode = require(' +
          JSON.stringify(path.join(__dirname, '..', 'cli', 'skill-runner.js')) +
          ').main(process.argv);\n',
      );
      fs.chmodSync(runnerShim, 0o755);
      const preflightOptions = {
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env, PATH: shimDirectory + path.delimiter + process.env.PATH },
      };
      const check = spawnSync(
        process.execPath,
        [path.join(__dirname, '..', 'cli', 'evaluate.js'), 'check', '--evaluation', evaluationRoot],
        { encoding: 'utf8' },
      );
      if (check.status !== 0) failures.push('filled skeleton: tea-evaluate check exited ' + check.status + ': ' + check.stderr.trim());
      const conditionsPath = path.join(evaluationRoot, 'policy', 'evaluator-conditions.json');
      fs.rmSync(conditionsPath);
      const withoutConditions = spawnSync(
        process.execPath,
        [path.join(__dirname, '..', 'cli', 'evaluate.js'), 'check', '--evaluation', evaluationRoot],
        { encoding: 'utf8' },
      );
      if (
        withoutConditions.status !== 10 ||
        !(withoutConditions.stdout + withoutConditions.stderr).includes('policy/evaluator-conditions.json')
      )
        failures.push('skill runner without evaluator conditions did not fail check at exit 10');
      const conditions = JSON.parse(fs.readFileSync(ASSET('evaluator-conditions.template.json'), 'utf8'));
      conditions.modelSnapshot = 'stub-agent-fixture';
      conditions.systemPromptDigest = engine.digestBytes(Buffer.alloc(0));
      delete conditions.judge;
      fs.writeFileSync(conditionsPath, JSON.stringify(conditions));
      const withConditions = spawnSync(
        process.execPath,
        [path.join(__dirname, '..', 'cli', 'evaluate.js'), 'check', '--evaluation', evaluationRoot],
        { encoding: 'utf8' },
      );
      if (withConditions.status !== 0) failures.push('filled evaluator conditions did not pass check: ' + withConditions.stderr.trim());
      const preflight = spawnSync(
        process.execPath,
        [path.join(__dirname, '..', 'cli', 'evaluate.js'), 'preflight', '--evaluation', evaluationRoot],
        preflightOptions,
      );
      if (preflight.status !== 0)
        failures.push('skill runner preflight exited ' + preflight.status + ': ' + preflight.stdout.trim() + ' ' + preflight.stderr.trim());
      const brokenManifest = { ...manifest, registry: [{ ...manifest.registry[0], target: 'bin/does-not-exist.js' }] };
      fs.writeFileSync(manifestPath, JSON.stringify(brokenManifest));
      const missingTarget = spawnSync(
        process.execPath,
        [path.join(__dirname, '..', 'cli', 'evaluate.js'), 'preflight', '--evaluation', evaluationRoot],
        preflightOptions,
      );
      if (missingTarget.status !== 12 || !(missingTarget.stdout + missingTarget.stderr).includes('does not exist'))
        failures.push('a nonexistent skill runner target did not fail preflight at exit 12');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      fs.appendFileSync(path.join(evaluationRoot, 'requirements.md'), 'changed byte\n');
      const stale = spawnSync(
        process.execPath,
        [path.join(__dirname, '..', 'cli', 'evaluate.js'), 'check', '--evaluation', evaluationRoot],
        { encoding: 'utf8' },
      );
      if (stale.status !== 10 || !(stale.stdout + stale.stderr).includes('requirements'))
        failures.push('changed requirements bytes did not fail tea-evaluate check with exit 10');
    }
    {
      const policyRoot = path.join(tempRoot, 'policy-case');
      fs.cpSync(path.join(__dirname, 'fixtures', 'evaluate', 'valid'), policyRoot, { recursive: true });
      const policyPath = path.join(policyRoot, 'policy', 'scoring-policy.json');
      fs.rmSync(policyPath);
      const withoutPolicy = spawnSync(
        process.execPath,
        [path.join(__dirname, '..', 'cli', 'evaluate.js'), 'check', '--evaluation', policyRoot],
        { encoding: 'utf8' },
      );
      if (withoutPolicy.status !== 10 || !(withoutPolicy.stdout + withoutPolicy.stderr).includes('policy/scoring-policy.json'))
        failures.push('a mutation route without a scoring policy did not fail check at exit 10');
      const policy = JSON.parse(fs.readFileSync(ASSET('scoring-policy.template.json'), 'utf8'));
      Object.assign(policy, { policyId: 'guidance-policy', severityFloor: 'material', catchThreshold: 0.5, minimumTrialCount: 3 });
      fs.writeFileSync(policyPath, JSON.stringify(policy));
      const withPolicy = spawnSync(
        process.execPath,
        [path.join(__dirname, '..', 'cli', 'evaluate.js'), 'check', '--evaluation', policyRoot],
        { encoding: 'utf8' },
      );
      if (withPolicy.status !== 0) failures.push('filled scoring policy did not pass check: ' + withPolicy.stderr.trim());
    }
    {
      const mcpRoot = path.join(tempRoot, 'evaluate-mcp');
      fs.cpSync(path.join(__dirname, 'fixtures', 'evaluate-mcp'), mcpRoot, { recursive: true });
      const mcpEvaluation = path.join(mcpRoot, 'evals', 'grader');
      for (const command of ['check', 'preflight']) {
        const run = spawnSync(
          process.execPath,
          [path.join(__dirname, '..', 'cli', 'evaluate.js'), command, '--evaluation', mcpEvaluation],
          { encoding: 'utf8', timeout: 30_000 },
        );
        if (run.status !== 0) failures.push('MCP ' + command + ' exited ' + run.status + ': ' + run.stderr.trim());
      }
    }
    {
      const workflowRoot = path.join(tempRoot, 'evaluate-workflow');
      fs.cpSync(path.join(__dirname, 'fixtures', 'evaluate-workflow'), workflowRoot, { recursive: true });
      const workflowEvaluation = path.join(workflowRoot, 'evals', 'records');
      const manifestPath = path.join(workflowEvaluation, 'evaluation.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.registry[0].target = 'bin/does-not-exist.js';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      const failed = spawnSync(
        process.execPath,
        [path.join(__dirname, '..', 'cli', 'evaluate.js'), 'preflight', '--evaluation', workflowEvaluation],
        { encoding: 'utf8', timeout: 30_000 },
      );
      if (failed.status !== 12 || !(failed.stdout + failed.stderr).includes('does not exist'))
        failures.push('a nonexistent workflow target did not fail preflight at exit 12');
    }
    const missing = { ...fill };
    delete missing.schemaVersion;
    assert.throws(() => fillContractSkeleton(skeleton, missing), /missing fill value: schemaVersion/);
    const noForbidden = structuredClone(contract);
    delete noForbidden.forbiddenInputs;
    const forbiddenFailure = engineCommand('compile', noForbidden, tempRoot);
    assert.strictEqual(forbiddenFailure.status, 5, 'missing forbiddenInputs must get engine exit 5: ' + forbiddenFailure.stderr);
    assert.match(forbiddenFailure.stderr, /forbiddenInputs/);

    for (const heading of [
      '## Identity and lineage fields',
      '## Authored fields',
      '## Authoring discipline',
      '## Interaction-plan design',
      '## Sensitivity-witness design',
      '## Waiver discipline',
      '## Compile and seal',
      '## Worked end-to-end contract',
    ])
      requireHeading(contractGuide, heading, 'contract.md', failures);
    const authoredFields = headingBody(contractGuide, '## Authored fields');
    for (const member of contract.forbiddenInputs)
      requireText(authoredFields, tick + member + tick, 'contract.md Authored fields forbiddenInputs floor', failures);
    const rules = [
      'success-indicator-separation',
      'whole-body',
      'malformed-input',
      'per-record',
      'sibling-cross-check',
      'omission-and-completeness',
      'state-change-read-back',
    ];
    for (const rule of rules) {
      requireHeading(contractGuide, '### ' + rule, 'contract.md', failures);
      const section = headingBody(contractGuide, '### ' + rule);
      requireText(section, 'Without this rule', 'contract.md ' + rule, failures);
      if (taggedExamples(section, 'contract-patch').length !== 1) failures.push('contract.md ' + rule + ' needs one tagged contract patch');
    }
    for (const heading of ['## Interaction-plan design', '## Sensitivity-witness design', '## Waiver discipline']) {
      if (taggedExamples(headingBody(contractGuide, heading), 'contract-patch').length !== 1)
        failures.push('contract.md ' + heading + ' needs one tagged contract patch');
    }
    const workflowContract = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures', 'evaluate-workflow', 'evals', 'records', 'contract.json')),
    );
    const numericContract = structuredClone(contract);
    numericContract.contractId = 'numeric-amount-example';
    numericContract.sourceSpecDigest = engine.digestBytes(
      fs.readFileSync(path.join(__dirname, 'fixtures', 'evaluate', 'numeric-requirements.md')),
    );
    numericContract.behaviors[0].description = 'The numeric-amount command accepts a finite JSON number and exits clean.';
    numericContract.behaviors[0].observableSuccessCriterion = 'A finite amount is echoed on stdout with a clean exit.';
    numericContract.behaviors[0].requirementLinks[0].id = 'numeric-amount-type';
    numericContract.behaviors[0].riskLinks[0].id = 'valid-amount-rejected';
    numericContract.oracles[0] = {
      id: 'O-001',
      polarity: 'expects-hold',
      commentary: 'The numeric-amount command echoes the accepted finite amount and exits clean.',
      direction: {
        polarity: 'expects-hold',
        relation: 'all',
        scope: 'The exit code and stdout of the numeric amount run.',
        negativeDomain: 'A valid numeric amount is refused, changed, or exits nonzero.',
        evidenceTargets: ['/interactions/answer-run/exit-code', '/interactions/answer-run/stdout'],
      },
      check: {
        op: 'all',
        operands: [
          { op: 'equality', operands: [{ pointer: '/interactions/answer-run/exit-code' }, { literal: 0 }] },
          { op: 'equality', operands: [{ pointer: '/interactions/answer-run/stdout' }, { literal: 'accepted amount: 7\n' }] },
        ],
      },
    };
    const numericOperation = numericContract.permittedInterfaces[0].operations[0];
    numericContract.permittedInterfaces[0].logicalId = 'numeric-amount';
    numericOperation.invocation = { executable: 'numeric-amount', subcommandPath: [] };
    numericOperation.requestShape.option = { requiredKeys: [], permittedKeys: [], types: {} };
    numericContract.interactionPlan[0].inputBinding.option = null;
    numericContract.interactionPlan[0].inputBinding.stdin.prompt.literal = '{"amount":7}';
    const numericWitness = numericOperation.sensitivityWitness;
    for (const leg of numericWitness.legs) leg.inputs.option = {};
    numericWitness.legs[0].inputs.stdin.value = '{"amount":7}';
    numericWitness.legs[1].inputs.stdin.value = '{"amount":8}';
    const expectedWitnessLiterals = ['accepted amount: 7', 'accepted amount: 8', 'accepted amount: 8', 'accepted amount: 7'];
    for (const [index, operand] of numericWitness.relation.operands.entries()) {
      const check = operand.op === 'not' ? operand.operands[0] : operand;
      check.operands[1].literal = expectedWitnessLiterals[index];
    }
    numericContract.testData.setup = 'The numeric-amount fixture is copied into the disposable workspace.';
    numericContract.testData.cleanup = 'Nothing to remove: the numeric-amount command writes no file.';
    numericContract.safetyLimits = ['The numeric-amount command writes no file and makes no network call.'];
    for (const [index, patch] of taggedExamples(contractGuide, 'contract-patch').entries()) {
      const edited = structuredClone(patch.base === 'workflow' ? workflowContract : patch.base === 'numeric' ? numericContract : contract);
      for (const edit of patch.patches ?? [patch]) setJsonPointer(edited, edit.path, edit.value);
      if (index === 1) {
        const response = spawnSync(
          process.execPath,
          [
            path.join(__dirname, '..', 'cli', 'skill-runner.js'),
            '--agent',
            'custom',
            '--agent-cmd',
            './agent.js',
            '--skill-root',
            'skill',
            '--timeout-ms',
            '30000',
          ],
          { cwd: path.join(__dirname, 'fixtures', 'evaluate', 'stub-agent'), input: 'Say alpha.', encoding: 'utf8' },
        );
        assert.strictEqual(response.status, 0, response.stderr);
        assert.strictEqual(edited.oracles[0].check.operands[1].operands[1].literal, response.stdout);
      }
      if (index === 2) {
        assert.strictEqual(edited.permittedInterfaces[0].operations[0].invocation.executable, 'numeric-amount');
        assert.match(edited.behaviors[0].observableSuccessCriterion, /string amount is refused/);
        assert.strictEqual(typeof JSON.parse(edited.interactionPlan[0].inputBinding.stdin.prompt.literal).amount, 'string');
        assert.match(JSON.stringify(edited.oracles[0].check), /invalid amount/);
        const numericTarget = path.join(__dirname, 'fixtures', 'evaluate', 'numeric-amount.js');
        const refused = spawnSync(numericTarget, [], {
          input: edited.interactionPlan[0].inputBinding.stdin.prompt.literal,
          encoding: 'utf8',
        });
        const accepted = spawnSync(numericTarget, [], { input: '{"amount":7}', encoding: 'utf8' });
        assert.strictEqual(refused.status, 0, refused.error?.message ?? refused.stderr);
        assert.strictEqual(refused.stdout, 'error: invalid amount\n');
        assert.strictEqual(accepted.status, 0, accepted.error?.message ?? accepted.stderr);
        assert.strictEqual(accepted.stdout, 'accepted amount: 7\n');
        const numericObservation = (stdout) =>
          engine.makeResolveOperand({ 'answer-run': { exitCode: 0, stdout: { kind: 'text', value: stdout } } }, {});
        assert.strictEqual(
          engine.resolveCheck(edited.oracles[0].check, numericObservation(refused.stdout), () => false, {}, 1000, 'malformed amount')
            .resolution,
          'true',
        );
        assert.strictEqual(
          engine.resolveCheck(
            edited.oracles[0].check,
            numericObservation('accepted amount: NaN\nerror: invalid amount\n'),
            () => false,
            {},
            1000,
            'contradictory malformed amount',
          ).resolution,
          'false',
        );
      }
      if (index === 3) {
        assert.deepStrictEqual(edited.permittedInterfaces[0].operations[0].responseDescriptor.types, { records: 'array' });
        assert.deepStrictEqual(
          edited.oracles[0].check.operands.map((operand) => operand.operands[0].pointer),
          [
            '/interactions/answer-run/stdout/records/0/id',
            '/interactions/answer-run/stdout/records/0/decision',
            '/interactions/answer-run/stdout/records/1/id',
            '/interactions/answer-run/stdout/records/1/decision',
          ],
        );
      }
      if (index === 4) {
        const crossCheck = edited.oracles[0].check.operands.find(
          (operand) => operand.op === 'equality' && operand.operands?.every((value) => typeof value.pointer === 'string'),
        );
        assert.deepStrictEqual(
          crossCheck?.operands.map((value) => value.pointer),
          ['/interactions/read-back/stdout/id', '/interactions/create/stdout/id'],
        );
      }
      if (index === 5) {
        assert.strictEqual(edited.oracles[0].check.op, 'equality');
        assert.strictEqual(edited.oracles[0].check.operands[0].pointer, '/interactions/answer-run/stdout/records');
        assert.match(edited.oracles[0].commentary, /records array contains exactly the two promised records/);
        assert.doesNotMatch(edited.oracles[0].commentary, /SKILL\.md|skill root|run exited/);
        assert.deepStrictEqual(
          edited.oracles[0].check.operands[1].literal.map((record) => record.id),
          ['A', 'B'],
        );
      }
      if (index === 6) {
        assert.strictEqual(
          edited.permittedInterfaces[0].operations.find((operation) => operation.operationId === 'create')?.stateChangeMarker,
          true,
        );
        const readBack = edited.interactionPlan.find((step) => step.stepId === 'read-back');
        assert.strictEqual(readBack.after, 'create');
        assert.strictEqual(readBack.inputBinding.option.id.captured, '/interactions/create/stdout/id');
      }
      if (index === 7) {
        assert.strictEqual(edited.interactionPlan.length, 2);
        assert.strictEqual(edited.interactionPlan.find((step) => step.stepId === 'read-back')?.after, 'create');
        assert.strictEqual(
          edited.interactionPlan.find((step) => step.stepId === 'read-back')?.inputBinding.option.id.captured,
          '/interactions/create/stdout/id',
        );
        assert.ok(edited.testData.principals.operator);
        assert.ok(edited.probeStepBound >= edited.interactionPlan.length);
      }
      if (index === 8) {
        const editedWitness = edited.permittedInterfaces[0].operations[0].sensitivityWitness;
        assert.strictEqual(editedWitness.legs[1].inputs.stdin.value, 'Say beta twice.');
        assert.strictEqual(editedWitness.relation.operands[1].operands[0].operands[1].literal, 'beta twice');
        assert.strictEqual(editedWitness.relation.operands[2].operands[1].literal, 'beta twice');
        const observed = {};
        for (const leg of editedWitness.legs) {
          const response = spawnSync(
            process.execPath,
            [
              path.join(__dirname, '..', 'cli', 'skill-runner.js'),
              '--agent',
              'custom',
              '--agent-cmd',
              './agent.js',
              '--skill-root',
              'skill',
              '--timeout-ms',
              '30000',
            ],
            { cwd: path.join(__dirname, 'fixtures', 'evaluate', 'stub-agent'), input: leg.inputs.stdin.value, encoding: 'utf8' },
          );
          assert.strictEqual(response.status, 0, response.stderr);
          observed[leg.legId] = { stdout: { kind: 'text', value: response.stdout } };
        }
        assert.strictEqual(
          engine.resolveCheck(editedWitness.relation, engine.makeResolveOperand(observed, {}), () => false, {}, 1000, 'sensitivity witness')
            .resolution,
          'true',
        );
      }
      if (index === 9) {
        assert.strictEqual(patch.base, 'numeric');
        assert.strictEqual(edited.permittedInterfaces[0].operations[0].invocation.executable, 'numeric-amount');
        assert.match(edited.behaviors[0].observableSuccessCriterion, /finite amount is echoed/);
        const waiver = edited.waivers[0];
        for (const field of ['rule', 'rationale', 'condition', 'approval']) assert.ok(waiver[field]);
        assert.strictEqual(waiver.rule, 'per-record');
        assert.match(waiver.condition, /Number\.isFinite/);
        assert.match(waiver.condition, /Object\.keys\(request\)\.length === 1/);
        assert.match(waiver.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
        for (const [request, expected] of [
          [{ amount: 7 }, true],
          [{ amount: 'NaN' }, false],
          [{ amount: 7, records: [] }, false],
          [null, false],
        ])
          assert.strictEqual(vm.runInNewContext(waiver.condition, { request }, { timeout: 1000 }), expected);
        const numericTarget = path.join(__dirname, 'fixtures', 'evaluate', 'numeric-amount.js');
        const accepted = spawnSync(numericTarget, [], { input: '{"amount":7}', encoding: 'utf8' });
        assert.strictEqual(accepted.status, 0, accepted.error?.message ?? accepted.stderr);
        const observation = engine.makeResolveOperand(
          { 'answer-run': { exitCode: accepted.status, stdout: { kind: 'text', value: accepted.stdout } } },
          {},
        );
        assert.strictEqual(
          engine.resolveCheck(edited.oracles[0].check, observation, () => false, {}, 1000, 'numeric waiver base').resolution,
          'true',
        );
        const corrupted = engine.makeResolveOperand(
          { 'answer-run': { exitCode: 0, stdout: { kind: 'text', value: 'accepted amount: 70\n' } } },
          {},
        );
        assert.strictEqual(
          engine.resolveCheck(edited.oracles[0].check, corrupted, () => false, {}, 1000, 'wrong numeric amount').resolution,
          'false',
        );
      }
      assertEngineSuccess('compile', edited, tempRoot, 'contract patch ' + (index + 1), failures);
    }
    const complete = taggedExamples(contractGuide, 'contract');
    assert.strictEqual(complete.length, 1);
    assert.deepStrictEqual(complete[0], contract);
    assertEngineSuccess('compile', complete[0], tempRoot, 'worked contract', failures);
    assertEngineSuccess('seal', complete[0], tempRoot, 'worked contract', failures);
    for (const marker of ['oracle checks', 'interaction plan', 'test data', 'sealed brief digest'])
      requireText(contractGuide.toLowerCase(), marker, 'contract.md sealing lesson', failures);
    const contractStage = skillContent.match(/### Stage 4: Contract\n([\s\S]*?)(?:\n### |$)/)?.[1] ?? '';
    for (const marker of ['sourceSpecDigest', 'digestBytes', 'requirements.md', 'requirements.digest'])
      requireText(contractStage, marker, 'SKILL.md Stage 4', failures);
    const stage = skillContent.match(/### Stage 6: Adapters\n([\s\S]*?)(?:\n### |$)/)?.[1] ?? '';
    for (const marker of [
      'assets/evaluator-conditions.template.json',
      'policy/evaluator-conditions.json',
      'modelSnapshot',
      'systemPromptDigest',
      'evaluation.json.judge',
      'judge.modelSnapshot',
    ])
      requireText(stage, marker, 'SKILL.md Stage 6', failures);
    const order = ['tea-evaluate check', 'eval-quality compile', 'eval-quality seal'].map((command) => stage.indexOf(command));
    if (order.some((index) => index < 0) || !(order[0] < order[1] && order[1] < order[2]))
      failures.push('SKILL.md Stage 6 must run check, compile, seal in order');
    for (const marker of ['nonzero exit', 'exit code', 'stderr']) requireText(stage, marker, 'SKILL.md Stage 6', failures);
    if (stage.indexOf('tea-evaluate preflight') <= order[2]) failures.push('SKILL.md Stage 6 must preflight after seal');

    for (const heading of [
      '## One oracle per discharged behavior',
      '## Oracle relation choice',
      '## Exact checks and evidence pointers',
      '## Semantic rubrics',
      '## Judge calibration design',
      '## Loose oracle and degenerate response',
    ])
      requireHeading(oracleGuide, heading, 'oracles.md', failures);
    for (const marker of ['expects-hold', 'expects-violation', 'unreachable-check-evidence', 'minimumAgreement', 'labels'])
      requireText(oracleGuide, marker, 'oracles.md', failures);
    for (const lesson of [
      'A resampled identifier needs a relational comparison',
      'An impossible pointer fails compilation',
      'Give every scale level a concrete anchor',
      'Withhold the labels from the judge',
      'A loose oracle that checks only a clean exit accepts this degenerate response',
    ])
      requireText(oracleGuide, lesson, 'oracles.md lesson', failures);
    // An MCP step's ended session lives on its `exit-code` channel (Story 1.35), which a crash mutation's oracle reads.
    requireText(
      headingBody(oracleGuide, '## Exact checks and evidence pointers'),
      "An MCP step's `/interactions/<step>/exit-code`",
      'oracles.md',
      failures,
    );
    const calibrationLesson = headingBody(oracleGuide, '## Judge calibration design');
    for (const marker of ['`judge.modelSnapshot`', '`policy/evaluator-conditions.json`', 'runtime digests its fixed judge instructions'])
      requireText(calibrationLesson, marker, 'oracles.md judge calibration', failures);
    const conditionsSchema = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'cli', 'lib', 'evaluate', 'schemas', 'evaluator-conditions.schema.json')),
    );
    const validateConditions = new Ajv({ strict: false, allErrors: true }).compile(conditionsSchema);
    const judgeConditions = {
      schemaVersion: 1,
      modelSnapshot: 'none',
      systemPromptDigest: engine.digestBytes(Buffer.alloc(0)),
      judge: { modelSnapshot: 'fixed-judge-fixture' },
    };
    assert.strictEqual(validateConditions(judgeConditions), true, JSON.stringify(validateConditions.errors));
    assert.strictEqual(
      validateConditions({
        ...judgeConditions,
        judge: { ...judgeConditions.judge, systemPromptDigest: engine.digestBytes(Buffer.alloc(0)) },
      }),
      false,
    );
    const validContract = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'evaluate', 'valid', 'contract.json')));
    for (const [index, oracle] of taggedExamples(oracleGuide, 'oracle').entries()) {
      const base = oracle.direction?.evidenceTargets?.some((pointer) => pointer.includes('/create/')) ? workflowContract : validContract;
      const edited = structuredClone(base);
      edited.oracles[0] = oracle;
      assertEngineSuccess('compile', edited, tempRoot, 'oracle example ' + (index + 1), failures);
    }
    const unreachable = structuredClone(validContract);
    unreachable.oracles[0] = structuredClone(taggedExamples(oracleGuide, 'oracle')[1]);
    unreachable.oracles[0].direction.evidenceTargets[0] = '/interactions/ghost/exit-code';
    unreachable.oracles[0].check.operands[0].operands[0].pointer = '/interactions/ghost/exit-code';
    const unreachableResult = engineCommand('compile', unreachable, tempRoot);
    if (unreachableResult.status === 0 || !unreachableResult.stderr.includes('unreachable-check-evidence'))
      failures.push('unreachable oracle evidence did not fail compile');
    const looseSection = headingBody(oracleGuide, '## Loose oracle and degenerate response');
    const pair = taggedExamples(looseSection, 'oracle');
    const degenerate = taggedExamples(looseSection, 'degenerate-response');
    assert.strictEqual(pair.length, 2);
    assert.strictEqual(degenerate.length, 1);
    const validateDegenerate = new Ajv({ strict: false, allErrors: true }).compile(
      JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cli', 'lib', 'evaluate', 'schemas', 'degenerate-response.schema.json'))),
    );
    assert.strictEqual(validateDegenerate(degenerate[0]), true, JSON.stringify(validateDegenerate.errors));
    const answer = degenerate[0].steps['tea-atdd-runner-run'];
    const resolve = engine.makeResolveOperand(
      {
        'tea-atdd-runner-run': {
          exitCode: answer.exitCode,
          stdout: { kind: 'text', value: answer.stdout },
          stderr: { kind: 'text', value: answer.stderr },
          artifacts: {},
        },
      },
      {},
    );
    assert.strictEqual(engine.resolveCheck(pair[0].check, resolve, () => false, {}, 1000, 'loose-oracle').resolution, 'true');
    assert.strictEqual(engine.resolveCheck(pair[1].check, resolve, () => false, {}, 1000, 'tight-oracle').resolution, 'false');
    const rubrics = taggedExamples(oracleGuide, 'rubric');
    if (rubrics.length !== 1) failures.push('oracles.md needs one tagged rubric');
    for (const rubric of rubrics) {
      const edited = structuredClone(validContract);
      edited.rubrics = [rubric];
      assertEngineSuccess('compile', edited, tempRoot, 'rubric example', failures);
      assert.strictEqual(
        rubric.scaleLevels.every((level) => level.anchor.includes('criterion being scored')),
        true,
      );
      const calibration = taggedExamples(oracleGuide, 'calibration');
      assert.strictEqual(calibration.length, 1);
      assert.deepStrictEqual(calibrationProblems({ judgeCalibration: { minimumAgreement: 0.8 } }, edited, calibration[0], engine), []);
      for (const criterion of ['RC-001', 'RC-002']) {
        const items = calibration[0].items.filter((item) => item.criterionId === criterion);
        assert.deepStrictEqual(
          items.map((item) => item.expectedLevel),
          [0, 1, 2],
        );
        for (const item of items) {
          assert.match(item.response, /Story criteria: AC-1/);
          assert.match(item.response, /Scaffold:\n/);
          assert.match(item.response, /test\.skip\(/);
        }
        const expectedCounts =
          criterion === 'RC-001'
            ? items.map((item) => [...item.response.matchAll(/test\.skip\('AC-/g)].length)
            : items.map((item) => [...item.response.matchAll(/\.toBe\(/g)].length);
        assert.deepStrictEqual(expectedCounts, [0, 1, 2]);
      }
      const unanchored = structuredClone(edited);
      unanchored.rubrics[0].scaleLevels = [];
      const rejected = engineCommand('compile', unanchored, tempRoot);
      if (rejected.status === 0 || !rejected.stderr.includes('rubric-unanchored'))
        failures.push('unanchored rubric example did not fail with rubric-unanchored');
    }
    requireText(adapterGuide, 'interface-not-authorized', 'adapters.md', failures);
    requireText(adapterGuide, 'executable-not-authorized', 'adapters.md', failures);
    const adapterOpening = adapterGuide.split('\n## ')[0];
    for (const marker of [
      'assets/evaluator-conditions.template.json',
      'policy/evaluator-conditions.json',
      'modelSnapshot: "none"',
      '`judge` block',
      'evaluation.json.judge',
      'judge.modelSnapshot',
    ])
      requireText(adapterOpening, marker, 'adapters.md opening', failures);
    requireText(
      adapterOpening,
      'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate preflight --evaluation <evaluation-folder>',
      'adapters.md opening',
      failures,
    );
    const agentFallback = headingBody(adapterGuide, "## Agent's own non-interactive command");
    for (const marker of [
      'When an agent has no own non-interactive command',
      'shipped generic `tea-skill-runner`',
      '`SKILL.md` wrapper',
      'Omit `launch.skillRoot` for `targetKind: "agent"`',
      "contract's `--skill-root` option",
      'disposable copy',
      'registry shape in the Skill runner section',
    ])
      requireText(agentFallback, marker, 'adapters.md Agent fallback', failures);
    const adapterRows = adapterGuide.match(/## Target kind to adapter mapping\n([\s\S]*?)(?:\n## |$)/)?.[1] ?? '';
    const expectedKinds = [
      'Skill',
      'Agent',
      'Workflow',
      'Tool-use system: calling agent',
      'Tool-use system: tool server',
      'AI feature or any web application',
      'Tool server reached over HTTP',
      'Test-review mechanism',
    ];
    const rows = adapterRows
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.startsWith('| ---'))
      .slice(1)
      .map((line) =>
        line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );
    assert.deepStrictEqual(
      rows.map((row) => row[0]),
      expectedKinds,
    );
    for (const row of rows) {
      if (sourceFixturePaths(row[3] ?? '', 'adapters.md ' + row[0], failures).length === 0)
        failures.push('adapters.md ' + row[0] + ' cites no working source fixture');
    }
    const registryEntries = taggedExamples(adapterGuide, 'registry');
    if (registryEntries.length !== expectedKinds.length) failures.push('adapters.md needs a tagged registry for every AD-4 row');
    const evaluationSchema = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'cli', 'lib', 'evaluate', 'schemas', 'evaluation.schema.json')),
    );
    const validateEvaluation = new Ajv({ strict: false, allErrors: true }).compile(evaluationSchema);
    const starter = JSON.parse(fs.readFileSync(ASSET('evaluation.json'), 'utf8'));
    assert.strictEqual(starter.registry[0].target, 'tea-skill-runner');
    const registryFixtures = [
      'evaluate/preflight/evaluation.json',
      'evaluate-tool-use-agent/evals/tool-use/evaluation.json',
      'evaluate-tool-use-agent/evals/tool-use/evaluation.json',
      'evaluate-mcp/evals/grader/evaluation.json',
      'evaluate-api/evals/grader/evaluation.json',
      'evaluate-workflow/evals/records/evaluation.json',
      'evaluate-api/evals/grader/evaluation.json',
      'evaluate/preflight/evaluation.json',
    ];
    for (const [index, entry] of registryEntries.entries()) {
      const candidate = { ...starter, registry: [entry] };
      if (!validateEvaluation(candidate))
        failures.push('adapters.md registry ' + (index + 1) + ' fails runtime schema: ' + JSON.stringify(validateEvaluation.errors));
      const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', registryFixtures[index]), 'utf8'));
      assert.deepStrictEqual(entry, fixture.registry[0], 'adapters.md registry ' + (index + 1) + ' differs from its working fixture');
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function checkFrameworkTemplate(template, fixtureName, evaluationName, executable, failures) {
  const source = ASSET(path.join('evaluators', template));
  if (!fs.existsSync(source)) {
    failures.push(`assets/evaluators/${template} is missing`);
    return;
  }
  const root = fs.mkdtempSync(path.join(__dirname, '.tea-guidance-template-'));
  const evaluation = path.join(root, 'evals', evaluationName);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== ENGINE_CLI_ENV && !key.startsWith('GIT_')));
  const run = (bin, args, cwd = path.join(__dirname, '..')) => {
    const result = spawnSync(bin, args, { cwd, env, encoding: 'utf8', timeout: 300_000 });
    if (result.error) throw result.error;
    return result;
  };
  try {
    fs.cpSync(path.join(__dirname, 'fixtures', fixtureName), root, { recursive: true });
    const destination = path.join(evaluation, 'evaluator', executable);
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, 0o755);
    if (template === 'agentevals-trajectory.mjs') {
      fs.copyFileSync(
        path.join(evaluation, 'evaluator', 'reference', 'weather.json'),
        path.join(evaluation, 'evaluator', 'reference', 'trajectory.json'),
      );
    } else {
      const assertionsFile = path.join(evaluation, 'evaluator', 'asserts.yaml');
      const assertions = YAML.parse(fs.readFileSync(assertionsFile, 'utf8'));
      const metricByAssertion = new Map([
        ['contains:apples', 'required-apples'],
        ['contains:pears', 'required-pears'],
        ['not-contains:shellfish', 'forbidden-shellfish'],
      ]);
      for (const assertion of assertions) assertion.metric = metricByAssertion.get(`${assertion.type}:${assertion.value}`);
      assert.ok(
        assertions.every((assertion) => assertion.metric),
        'fixture assertion lacks a mapping metric',
      );
      fs.writeFileSync(assertionsFile, YAML.stringify(assertions));
    }
    // The framework's declaration, its probe and the learned record, rendered from the skill's assets as an adopter copies them.
    const packageName = template === 'agentevals-trajectory.mjs' ? 'agentevals' : 'promptfoo';
    const installed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'node_modules', packageName, 'package.json'), 'utf8')).version;
    const probe = path.join(evaluation, 'evaluator', 'installed-version.mjs');
    fs.copyFileSync(ASSET(path.join('evaluators', 'installed-version.mjs')), probe);
    fs.chmodSync(probe, 0o755);
    const declarationFile = path.join(evaluation, 'evaluator', 'frameworks.json');
    fs.copyFileSync(ASSET(path.join('evaluators', `${packageName}-frameworks.json`)), declarationFile);
    const placeholder =
      '- Installed package and version: one backticked `<package>@<version>` for each package `evaluator/frameworks.json` declares';
    const learnedTemplate = fs.readFileSync(ASSET(path.join('evaluators', 'LEARNED.md')), 'utf8');
    assert.ok(learnedTemplate.includes(placeholder), 'the LEARNED.md template lost its installed package and version line');
    fs.writeFileSync(
      path.join(evaluation, 'evaluator', 'LEARNED.md'),
      learnedTemplate.replace(placeholder, `- Installed package and version: \`${packageName}@${installed}\``),
    );
    for (const [bin, args, cwd] of [
      [process.execPath, [path.join(__dirname, '..', 'cli', 'evaluate.js'), 'digest', '--evaluation', evaluation]],
      ['git', ['init', '--quiet', '--initial-branch', 'main'], root],
      ['git', ['add', '--all'], root],
      ['git', ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', 'commit', '--quiet', '-m', 'template fixture'], root],
    ]) {
      const result = run(bin, args, cwd);
      if (result.status !== 0) {
        failures.push(`${template} setup failed: ${result.stdout}${result.stderr}`);
        return;
      }
    }
    // The template's version is a placeholder: check refuses it until the adopter fills the installed version.
    const unfilled = run(process.execPath, [path.join(__dirname, '..', 'cli', 'evaluate.js'), 'check', '--evaluation', evaluation]);
    if (unfilled.status !== 10 || !unfilled.stdout.includes('frameworks[0].version must be the one exact version expected'))
      failures.push(`${template} declaration template passed check unfilled (exit ${unfilled.status}): ${unfilled.stdout}`);
    const filled = JSON.parse(fs.readFileSync(declarationFile, 'utf8'));
    filled.frameworks[0].version = installed;
    fs.writeFileSync(declarationFile, `${JSON.stringify(filled, null, 2)}\n`);
    const filledDigest = run(process.execPath, [path.join(__dirname, '..', 'cli', 'evaluate.js'), 'digest', '--evaluation', evaluation]);
    const staged = run('git', ['add', '--all'], root);
    const committed = run(
      'git',
      ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', 'commit', '--quiet', '-m', 'declare the installed version'],
      root,
    );
    if (filledDigest.status !== 0 || staged.status !== 0 || committed.status !== 0)
      failures.push(`${template} declaration setup failed: ${filledDigest.stderr}${staged.stderr}${committed.stderr}`);
    for (const subcommand of ['check', 'preflight', 'run', 'score']) {
      const result = run(process.execPath, [path.join(__dirname, '..', 'cli', 'evaluate.js'), subcommand, '--evaluation', evaluation]);
      if (result.status !== 0) {
        failures.push(`${template} ${subcommand} exited ${result.status}: ${result.stdout}${result.stderr}`);
        return;
      }
    }
    const runs = path.join(evaluation, 'runs');
    const latest = fs
      .readdirSync(runs)
      .filter((name) => name !== '.gitignore' && name !== '.workspace-journal')
      .sort()
      .at(-1);
    // The run observed the installed version through the rendered probe and bound it to the evaluator configuration.
    const observed = JSON.parse(fs.readFileSync(path.join(runs, latest, 'framework-versions.json'), 'utf8'));
    const configured = JSON.parse(fs.readFileSync(path.join(runs, latest, 'evaluator-configuration.json'), 'utf8'));
    if (
      observed.frameworks?.[0]?.observed?.package !== packageName ||
      observed.frameworks[0].observed.version !== installed ||
      JSON.stringify(configured.decodingParameters['tea.evaluatorFrameworks']) !==
        JSON.stringify([{ package: packageName, version: installed }])
    )
      failures.push(`${template} run did not record the installed ${packageName} ${installed}: ${JSON.stringify(observed)}`);
    const scores = path.join(runs, latest, 'scores');
    const score = fs.readdirSync(scores).sort().at(-1);
    for (const [probeId, expected] of [
      ['P-001', 'passed-clean-control'],
      ['P-002', 'caught'],
    ]) {
      const evidence = JSON.parse(fs.readFileSync(path.join(scores, score, probeId, 'evidence-artifact.json'), 'utf8'));
      const states = evidence.reducedProbeOutcomes[0].trialVotes.map((vote) => vote.state);
      if (states.length !== 3 || !states.every((state) => state === expected))
        failures.push(`${template} ${probeId} resolved ${states.join(', ')}, expected three ${expected} votes`);
    }
    if (template === 'agentevals-trajectory.mjs') {
      const reference = JSON.parse(fs.readFileSync(path.join(evaluation, 'evaluator', 'reference', 'weather.json'), 'utf8'));
      const alternate = structuredClone(reference);
      alternate[0].content = 'Weather in Boston';
      alternate[1].tool_calls[0].function.arguments = '{"city":"Boston"}';
      fs.writeFileSync(path.join(evaluation, 'evaluator', 'reference', 'alternate.json'), JSON.stringify(alternate));
      const added = run('git', ['add', 'evals/tool-use/evaluator/reference/alternate.json'], root);
      assert.strictEqual(added.status, 0, `AgentEvals alternate reference setup failed: ${added.stderr}`);
      const result = spawnSync(process.execPath, [destination, '--reference=reference/alternate.json', '--prefix=selected: '], {
        cwd: evaluation,
        env,
        encoding: 'utf8',
        input: JSON.stringify({
          observations: [
            { observationId: 'decoy', stdout: { kind: 'text', value: `trajectory: ${JSON.stringify(reference)}` } },
            { observationId: 'selected', stdout: { kind: 'text', value: `selected: ${JSON.stringify(alternate)}` } },
          ],
        }),
      });
      assert.strictEqual(result.status, 0, `AgentEvals template flags failed: ${result.stderr}`);
      const rows = JSON.parse(result.stdout).rows;
      assert.deepStrictEqual(
        rows.map((row) => [row.key, row.outcome, row.observationIds]),
        [['trajectory_strict_match', 'pass', ['selected']]],
      );
      const ambiguous = spawnSync(process.execPath, [destination, '--reference=reference/alternate.json', '--prefix=selected: '], {
        cwd: evaluation,
        env,
        encoding: 'utf8',
        input: JSON.stringify({
          observations: [
            { observationId: 'first', stdout: { kind: 'text', value: `selected: ${JSON.stringify(alternate)}` } },
            { observationId: 'second', stdout: { kind: 'text', value: `selected: ${JSON.stringify(reference)}` } },
          ],
        }),
      });
      assert.notStrictEqual(ambiguous.status, 0, 'AgentEvals template accepted an ambiguous trajectory prefix');
      assert.match(ambiguous.stderr, /expected one stdout trajectory matching the prefix, found 2/);
      const missingMessage = `trajectory: ${JSON.stringify(reference.slice(1))}`;
      const missing = spawnSync(process.execPath, [destination], {
        cwd: evaluation,
        env,
        encoding: 'utf8',
        input: JSON.stringify({ observations: [{ observationId: 'missing', stdout: { kind: 'text', value: missingMessage } }] }),
      });
      assert.strictEqual(missing.status, 0, `AgentEvals missing-message result failed: ${missing.stderr}`);
      assert.deepStrictEqual(
        JSON.parse(missing.stdout).rows.map((row) => [row.outcome, row.quote, row.observationIds]),
        [['fail', missingMessage, ['missing']]],
      );
      const outside = path.join(evaluation, 'outside.json');
      fs.writeFileSync(outside, JSON.stringify(reference));
      const referenceInput = JSON.stringify({
        observations: [{ observationId: 'reference-test', stdout: { kind: 'text', value: `trajectory: ${JSON.stringify(reference)}` } }],
      });
      fs.writeFileSync(path.join(evaluation, 'evaluator', 'reference', 'untracked.json'), JSON.stringify(reference));
      fs.writeFileSync(path.join(evaluation, 'evaluator', 'reference', 'trajectory*.json'), JSON.stringify(reference));
      fs.symlinkSync(outside, path.join(evaluation, 'evaluator', 'reference', 'linked.json'));
      for (const [argument, reason] of [
        ['--reference=../outside.json', /under evaluator\/reference/],
        ['--reference=reference/untracked.json', /git must track/],
        ['--reference=reference/trajectory*.json', /git must track/],
        ['--reference=reference/linked.json', /regular file.*no linked path/],
      ]) {
        const rejected = spawnSync(process.execPath, [destination, argument], {
          cwd: evaluation,
          env,
          encoding: 'utf8',
          input: referenceInput,
        });
        assert.notStrictEqual(rejected.status, 0, `AgentEvals template accepted ${argument}`);
        assert.match(rejected.stderr, reason);
      }
    } else {
      checkPromptfooTemplateIdentity(destination, evaluation, env);
    }
  } catch (error) {
    failures.push(`${template} template pipeline: ${error.stack}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function checkPromptfooTemplateIdentity(destination, evaluation, env) {
  const selected = { observationId: 'selected', stdout: { kind: 'text', value: 'Selected summary: apples, pears\n' } };
  const input = {
    observations: [{ observationId: 'decoy', stdout: { kind: 'text', value: 'Decoy summary: apples, pears\n' } }, selected],
  };
  const run = (args, payload) => {
    const result = spawnSync(process.execPath, [destination, ...args], {
      cwd: evaluation,
      env,
      encoding: 'utf8',
      input: JSON.stringify(payload),
      timeout: 90_000,
    });
    if (result.error) throw result.error;
    return result;
  };
  const real = run(['--stdout-prefix=Selected summary:'], input);
  assert.strictEqual(real.status, 0, `promptfoo template stdout selection failed: ${real.stderr}`);
  const realRows = JSON.parse(real.stdout).rows;
  assert.deepStrictEqual(
    realRows.map((row) => [row.key, row.observationIds]),
    [
      ['required-apples', ['selected']],
      ['required-pears', ['selected']],
      ['forbidden-shellfish', ['selected']],
    ],
  );
  const ambiguous = run(['--stdout-prefix=Selected summary:'], {
    observations: [selected, { observationId: 'another', stdout: { kind: 'text', value: 'Selected summary: shellfish\n' } }],
  });
  assert.notStrictEqual(ambiguous.status, 0, 'promptfoo template accepted an ambiguous stdout prefix');
  assert.match(ambiguous.stderr, /expected one stdout observation matching the prefix, found 2/);
  const assertionsFile = path.join(evaluation, 'evaluator', 'asserts.yaml');
  const fullAssertions = fs.readFileSync(assertionsFile, 'utf8');
  try {
    fs.writeFileSync(assertionsFile, YAML.stringify(YAML.parse(fullAssertions).slice(0, 2)));
    const incomplete = run(['--stdout-prefix=Selected summary:'], input);
    assert.notStrictEqual(incomplete.status, 0, 'promptfoo template accepted an incomplete assertion set');
    assert.match(incomplete.stderr, /did not judge every mapped assertion exactly once/);
  } finally {
    fs.writeFileSync(assertionsFile, fullAssertions);
  }

  const assertion = (metric, type, value) => ({ metric, type, value });
  const map = (
    assertions,
    passes,
    observation = selected,
    output = observation.stdout.value.endsWith('\n') ? observation.stdout.value.slice(0, -1) : observation.stdout.value,
  ) => {
    const result = {
      response: { output },
      testCase: { assert: assertions },
      gradingResult: {
        componentResults: assertions.map((item, index) => ({ assertion: item, pass: passes[index] })),
      },
    };
    return run(['--map-results'], { results: [result], observation });
  };
  const reordered = map(
    [
      assertion('forbidden-shellfish', 'not-contains', 'shellfish'),
      assertion('required-apples', 'contains', 'apples'),
      assertion('required-pears', 'contains', 'pears'),
    ],
    [false, true, false],
  );
  assert.strictEqual(reordered.status, 0, `promptfoo template reordered assertions failed: ${reordered.stderr}`);
  assert.deepStrictEqual(
    JSON.parse(reordered.stdout).rows.map((row) => [row.key, row.outcome]),
    [
      ['forbidden-shellfish', 'fail'],
      ['required-apples', 'pass'],
      ['required-pears', 'fail'],
    ],
  );
  const subset = map([assertion('required-pears', 'contains', 'pears')], [true]);
  assert.strictEqual(subset.status, 0, `promptfoo template subset failed: ${subset.stderr}`);
  assert.deepStrictEqual(
    JSON.parse(subset.stdout).rows.map((row) => [row.key, row.outcome]),
    [['required-pears', 'pass']],
  );
  const missingIdentity = map([assertion(undefined, 'contains', 'pears')], [true]);
  assert.notStrictEqual(missingIdentity.status, 0, 'promptfoo template accepted an assertion without a mapping metric');
  const mismatchedOutput = map([assertion('required-pears', 'contains', 'pears')], [true], selected, 'another output');
  assert.notStrictEqual(mismatchedOutput.status, 0, 'promptfoo template accepted a grade for different stdout');
  assert.match(mismatchedOutput.stderr, /output differs from the cited stdout observation/);
  const whitespace = { observationId: 'whitespace', stdout: { kind: 'text', value: 'Selected summary: apples, pears \n' } };
  const whitespaceMismatch = map([assertion('required-pears', 'contains', 'pears')], [true], whitespace, 'Selected summary: apples, pears');
  assert.notStrictEqual(whitespaceMismatch.status, 0, 'promptfoo template accepted a grade for different trailing whitespace');
  assert.match(whitespaceMismatch.stderr, /output differs from the cited stdout observation/);
  const empty = { observationId: 'empty', stdout: { kind: 'text', value: '' }, exitCode: 0 };
  const missingContent = map([assertion('required-pears', 'contains', 'pears')], [false], empty);
  assert.strictEqual(missingContent.status, 0, `promptfoo template could not cite empty stdout: ${missingContent.stderr}`);
  assert.deepStrictEqual(
    JSON.parse(missingContent.stdout).rows.map((row) => [row.quote, row.quoteChannel, row.observationIds]),
    [['0', 'exit-code', ['empty']]],
  );
  checkPromptfooFailureBoundary(run, selected);
}

// An ungraded framework row stops the evaluation; a graded row keeps its meaning (Story 1.43).
function checkPromptfooFailureBoundary(run, selected) {
  const guide = headingBody(fs.readFileSync(REFERENCE('evaluator'), 'utf8'), FAILURE_BOUNDARY);
  const [ungradedExample] = taggedExamples(guide, 'promptfoo-ungraded');
  const [gradedExample] = taggedExamples(guide, 'promptfoo-graded-fail');
  assert.ok(ungradedExample && gradedExample, 'the failure boundary section lost its runnable examples');
  const refuse = (payload, label, ...mentions) => {
    const result = run(['--map-results'], payload);
    assert.notStrictEqual(result.status, 0, `promptfoo template accepted ${label}`);
    assert.match(result.stderr, /ungraded framework error|incomplete multi-assertion grade|unique expected assertion|boolean pass/, label);
    for (const mention of mentions) assert.match(result.stderr, mention, `${label} lost its diagnostic`);
    assert.ok(!result.stdout.includes('"rows"'), `promptfoo template printed rows for ${label}`);
  };
  const rowsOf = (payload) => {
    const result = run(['--map-results'], payload);
    assert.strictEqual(result.status, 0, `promptfoo template refused graded input: ${result.stderr}`);
    return JSON.parse(result.stdout).rows;
  };

  // The guide's runnable examples.
  refuse(ungradedExample, 'the guide ungraded example', /ungraded framework error/, /promptfoo could not grade this output/);
  const guideRows = rowsOf(gradedExample);
  assert.deepStrictEqual(
    guideRows.map((row) => [row.key, row.outcome, row.quote, row.quoteChannel, row.observationIds]),
    [['required-pears', 'fail', 'Summary for List pantry: apples\n', 'stdout', ['trial-1-summarize']]],
  );

  // An ungraded row, with an error, without one, with a null grade and with several assertions.
  const pears = { metric: 'required-pears', type: 'contains', value: 'pears' };
  const apples = { metric: 'required-apples', type: 'contains', value: 'apples' };
  const shellfish = { metric: 'forbidden-shellfish', type: 'not-contains', value: 'shellfish' };
  const output = selected.stdout.value.slice(0, -1);
  const result = (assertions, extra = {}) => ({ response: { output }, testCase: { assert: assertions }, ...extra });
  const grade = (assertion, pass, reason) => ({ assertion, pass, ...(reason === undefined ? {} : { reason }) });
  const ungraded = (extra) => ({ observation: selected, results: [result([pears, apples, shellfish], extra)] });
  refuse(
    ungraded({ error: 'framework could not grade' }),
    'an ungraded multi-assertion row with an error',
    /ungraded framework error/,
    /framework could not grade/,
  );
  refuse(ungraded({}), 'an ungraded row without an error', /ungraded framework error/, /no error reported/);
  refuse(ungraded({ gradingResult: null }), 'a null grade', /ungraded framework error/);
  // The diagnostic holds the first line of the framework's error, cut at 200 characters, and nothing after.
  const diagnosticOf = (error) => {
    const refused = run(['--map-results'], ungraded({ error }));
    assert.notStrictEqual(refused.status, 0, 'promptfoo template accepted an ungraded row with a long error');
    return refused.stderr;
  };
  const multiLine = diagnosticOf('first line\nsecond line of a stack');
  assert.ok(multiLine.includes('(first line)'), 'the diagnostic lost the first line of the framework error');
  assert.ok(!multiLine.includes('second line of a stack'), 'the diagnostic carried a later line of the framework error');
  const long = diagnosticOf('x'.repeat(500));
  assert.ok(long.includes(`(${'x'.repeat(200)})`), 'the diagnostic did not hold the first 200 characters of a long error');
  assert.ok(!long.includes('x'.repeat(201)), 'the diagnostic held more than 200 characters of a long error');
  refuse(ungraded({ gradingResult: null, error: '  ' }), 'a blank error', /ungraded framework error/);
  refuse(
    {
      observation: selected,
      results: [result([pears], { gradingResult: { pass: true, componentResults: [grade(pears, true)] } }), result([pears])],
    },
    'an ungraded row after a graded one',
    /ungraded framework error/,
  );

  // A graded pass and a graded fail keep their meaning, with and without a reason.
  const graded = (passes, reasons = []) => ({
    observation: selected,
    results: [
      result([pears, apples, shellfish], {
        gradingResult: {
          pass: passes.every(Boolean),
          componentResults: [
            grade(pears, passes[0], reasons[0]),
            grade(apples, passes[1], reasons[1]),
            grade(shellfish, passes[2], reasons[2]),
          ],
        },
      }),
    ],
  });
  const passRows = rowsOf(graded([true, true, true]));
  assert.deepStrictEqual(
    passRows.map((row) => [row.key, row.outcome, row.quote]),
    [
      ['required-pears', 'pass', undefined],
      ['required-apples', 'pass', undefined],
      ['forbidden-shellfish', 'pass', undefined],
    ],
  );
  const failRows = rowsOf(graded([true, false, true], [undefined, 'Expected output to contain "apples"']));
  assert.deepStrictEqual(
    failRows.map((row) => [row.key, row.outcome, row.quote, row.quoteChannel, row.comment]),
    [
      ['required-pears', 'pass', undefined, undefined, 'Assertion passed.'],
      ['required-apples', 'fail', selected.stdout.value, 'stdout', 'Expected output to contain "apples"'],
      ['forbidden-shellfish', 'pass', undefined, undefined, 'Assertion passed.'],
    ],
  );
  const reasonless = rowsOf(graded([true, true, false]));
  assert.strictEqual(reasonless[2].comment, 'Assertion failed.', 'a graded fail without a reason carried stale text');

  // An incomplete, repeated or malformed grade set stops the trial even when another assertion graded.
  const withComponents = (components) => ({
    observation: selected,
    results: [result([pears, apples, shellfish], { gradingResult: { pass: false, componentResults: components } })],
  });
  refuse(withComponents([grade(pears, true)]), 'a partial grade set', /incomplete multi-assertion grade/);
  refuse(withComponents([grade(pears, true), grade(apples, true)]), 'two of three grades', /incomplete multi-assertion grade/);
  refuse(withComponents([grade(pears, true), grade(pears, true), grade(shellfish, true)]), 'a repeated grade', /unique expected assertion/);
  refuse(
    withComponents([grade(pears, true), grade(apples, 'yes'), grade(shellfish, true)]),
    'a grade without a boolean pass',
    /boolean pass/,
  );
  refuse(withComponents([grade(pears, true), { assertion: apples }, grade(shellfish, true)]), 'a grade with no pass', /boolean pass/);
}

const FAILURE_BOUNDARY = '## Separate ungraded framework errors from graded target failures';
const FRAMEWORK_VERSIONS = '## Declare the installed framework versions';

function checkEvaluatorGuidance(guide, failures) {
  for (const heading of [
    '## Run the system',
    '## Capture observations on every oracle channel',
    '## Judge the behavior',
    '## Emit judgment rows or sealed records',
    '## Selection rubric',
    '## Framework landscape',
    FAILURE_BOUNDARY,
    FRAMEWORK_VERSIONS,
    '## Learn an unfamiliar framework',
    '## Vendor rule',
  ])
    requireHeading(guide, heading, 'evaluator.md', failures);
  for (const [heading, markers] of [
    ['## Run the system', ['authorized interface', 'deterministic', 'command', 'sealed-brief-agent', 'records', 'clean and defect arms']],
    [
      '## Capture observations on every oracle channel',
      ['stdout', 'stderr', 'HTTP response', 'MCP result', 'observation IDs', 'quoteChannel', 'SealedRunRecord'],
    ],
    [
      '## Judge the behavior',
      [
        'resolveCheck',
        'calibrated judge',
        'sealed brief',
        'adopter code',
        'evaluator/mapping.json',
        'oracle and behavior',
        'evaluation.json.judge',
        'policy/evaluator-conditions.json.judge',
        'policy/judge-calibration.json',
        'judgeCalibration.minimumAgreement',
      ],
    ],
    [
      '## Emit judgment rows or sealed records',
      [
        '{ "rows":',
        'observationIds',
        'quoteChannel',
        'confidence',
        'anchored integer',
        'SealedRunRecord',
        // Story 1.34: a sealed-brief agent is qualified before its verdicts count.
        'evaluatorQualification',
        'attempts',
        'minimumAgreement',
        'evaluator-qualification.json',
        'exits 11',
        'exits 10 under `evaluator`',
      ],
    ],
  ]) {
    const body = headingBody(guide, heading);
    for (const marker of markers) requireText(body, marker, `evaluator.md ${heading}`, failures);
  }

  const rubric = headingBody(guide, '## Selection rubric');
  const lines = rubric.split('\n').filter((line) => line.startsWith('|'));
  const cells = lines.map((line) =>
    line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );
  const criteria = [
    'Determinism',
    'Need for a model and its credentials',
    'Visibility of process and trajectory',
    'Need for reference outputs',
    'Rubric and calibration needs',
    'Language and runtime fit with adopter',
    'Licence',
    'Maintenance and version drift',
    'Cost per trial',
    'CI tier fit',
  ];
  try {
    assert.deepStrictEqual(cells[0], ['Option', '`evaluator.kind`', ...criteria]);
    assert.ok(
      cells[1]?.every((cell) => /^-{3,}$/.test(cell)),
      'rubric separator is missing',
    );
  } catch (error) {
    failures.push(`evaluator.md selection rubric columns changed: ${error.message}`);
  }
  const options = new Map([
    ['TeA deterministic evaluator', 'deterministic'],
    ['Sealed-brief agent evaluator', 'sealed-brief-agent'],
    ['Adopter harness sealing records', 'records'],
    ['Skill-specific evaluator', 'command'],
    ['Custom evaluation code', 'command'],
    ['External evaluation framework', 'command'],
  ]);
  const validKinds = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'cli', 'lib', 'evaluate', 'schemas', 'evaluation.schema.json'), 'utf8'),
  ).properties.evaluator.properties.kind.enum;
  for (const [option, kind] of options) {
    const row = cells.slice(2).find((candidate) => candidate[0] === option);
    if (!row || row.length !== cells[0]?.length || row.some((cell) => cell.length === 0)) {
      failures.push(`evaluator.md selection rubric lacks a complete ${option} row`);
      continue;
    }
    if (row[1] !== `\`${kind}\`` || !validKinds.includes(kind))
      failures.push(`evaluator.md ${option} has an invalid runtime evaluator kind ${row[1]}`);
  }
  if (cells.length !== options.size + 2) failures.push('evaluator.md selection rubric has missing or extra option rows');

  const landscape = headingBody(guide, '## Framework landscape');
  for (const marker of [
    'list is illustrative',
    'Any framework is admissible',
    'AgentEvals',
    'promptfoo',
    'evaluate-tool-use-agent',
    'evaluate-promptfoo',
  ])
    requireText(landscape, marker, 'evaluator.md Framework landscape', failures);
  const boundary = headingBody(guide, FAILURE_BOUNDARY);
  for (const marker of [
    'only when the framework graded the output',
    'graded assertion with `pass: false` becomes a `fail` row',
    'graded `pass: true` becomes a `pass` row',
    'ungraded framework error',
    'evaluator infrastructure failure (exit 12)',
    'seals no record',
    'each exactly once',
    'even when another assertion graded',
    "With promptfoo 0.123.1 a thrown `javascript` assertion or a crashing code file arrives graded `pass: false` and still becomes a target `fail` row until Story 1.70; an ungraded row arises when promptfoo cannot grade at all, for example when an assertion's `transform` fails.",
  ])
    requireText(boundary, marker, `evaluator.md ${FAILURE_BOUNDARY}`, failures);
  const ungradedExamples = taggedExamples(boundary, 'promptfoo-ungraded');
  const gradedExamples = taggedExamples(boundary, 'promptfoo-graded-fail');
  if (ungradedExamples.length !== 1 || gradedExamples.length !== 1)
    failures.push(`evaluator.md ${FAILURE_BOUNDARY} needs one promptfoo-ungraded and one promptfoo-graded-fail example`);
  else if (
    ungradedExamples[0].results?.some((result) => result.gradingResult !== undefined) ||
    gradedExamples[0].results?.some((result) => result.gradingResult?.pass !== false)
  )
    failures.push(`evaluator.md ${FAILURE_BOUNDARY} examples no longer separate the ungraded row from the graded failure`);
  const versions = headingBody(guide, FRAMEWORK_VERSIONS);
  for (const marker of [
    '`evaluator/frameworks.json`',
    'outside that tree',
    'one exact version expected',
    'version probe',
    'exits non-zero when the package is not installed',
    '`assets/evaluators/installed-version.mjs`',
    '"frameworks": []',
    "only the base environment and the evaluator's `environmentKeys`",
    'node evaluator/installed-version.mjs <package>',
    '`npm install --save-exact <package>@<version>`',
    '`importlib.metadata.version`',
    'exactly as `frameworks.json` declares it',
    'letters, digits, `.`, `_`, `-`, `~` and an optional `@scope/`',
    'The version starts with a digit, so a probe for an ecosystem that reports `v1.2.3` prints `1.2.3`.',
    '`framework-versions.json` in the run directory keeps the declared and observed versions, and the output of any probe that failed.',
    'every backticked `package@version` there is read as a record',
    'before the first trial, before each launch of the evaluator and after each trial',
    'missing, installed at a version other than the declared one, or changed during the run ends the run with exit 12 and seals no record for the affected trial',
    '`framework-versions.json`',
    'scoring version',
    '`tea-evaluate check` runs no probe',
    'a different version, a missing one or a package the declaration omits is a finding',
    '`package@version`',
    'update `LEARNED.md` and `frameworks.json` together',
  ])
    requireText(versions, marker, `evaluator.md ${FRAMEWORK_VERSIONS}`, failures);
  // The declaration the guide teaches meets the runtime's own rules, and the probe it names ships.
  const declarationExamples = taggedExamples(versions, 'frameworks');
  if (declarationExamples.length === 1) {
    const problems = declarationProblems(declarationExamples[0]);
    if (problems.length > 0 || declarationExamples[0].frameworks.length !== 1)
      failures.push(`evaluator.md ${FRAMEWORK_VERSIONS} example is not a valid declaration: ${problems.join('; ')}`);
    const [probe] = declarationExamples[0].frameworks.map((entry) => entry.probe);
    if (probe?.command !== 'evaluator/installed-version.mjs' || !fs.existsSync(ASSET(path.join('evaluators', 'installed-version.mjs'))))
      failures.push(`evaluator.md ${FRAMEWORK_VERSIONS} example names a probe the assets do not ship`);
  } else failures.push(`evaluator.md ${FRAMEWORK_VERSIONS} needs one frameworks example`);
  const learning = headingBody(guide, '## Learn an unfamiliar framework');
  for (const [index, markers] of [
    ['primary sources only', 'documentation', 'repository', 'API reference', 'examples', 'changelog', 'secondary summary'],
    ['takes inputs', 'judges', 'returns results', 'model', 'credentials'],
    ['Install the version the adopter uses', 'installed version', 'evaluator/frameworks.json', 'version probe'],
    [
      'Execute a minimal example',
      'known pass',
      'known fail',
      'stdout',
      'stderr',
      'contradicts',
      'framework cannot grade',
      'a thrown assertion may arrive as an ordinary failing grade',
    ],
    ['evaluator/LEARNED.md', 'primary source', 'contradictions', '`package@version`'],
    ['evaluator/mapping.json', 'judgment', 'passed-clean-control', 'caught', 'exit non-zero on a result the framework did not grade'],
  ].entries()) {
    const step = learning.match(new RegExp(`^${index + 1}\\. (.+)$`, 'm'))?.[1] ?? '';
    for (const marker of markers) requireText(step, marker, `evaluator.md learning step ${index + 1}`, failures);
  }
  const vendor = headingBody(guide, '## Vendor rule');
  for (const marker of [
    'framework',
    'judge model',
    'fixed conditions',
    'system under test',
    "adopter's use",
    '`evaluator/frameworks.json`',
    'exit 12 on a package that differs',
  ])
    requireText(vendor, marker, 'evaluator.md Vendor rule', failures);

  const learned = fs.readFileSync(ASSET(path.join('evaluators', 'LEARNED.md')), 'utf8');
  for (const heading of [
    '## Framework and installed version',
    '## Primary-source facts used',
    '## Executed minimal example: known pass',
    '## Executed minimal example: known fail',
    '## Documented claims contradicted by execution',
    '## Mapping and pipeline result',
  ])
    requireHeading(learned, heading, 'assets/evaluators/LEARNED.md', failures);
  requireText(learned, 'Installed package and version', 'assets/evaluators/LEARNED.md', failures);
  requireText(learned, '`<package>@<version>`', 'assets/evaluators/LEARNED.md', failures);
  for (const template of [
    'command-evaluator.mjs',
    'mapping.json',
    'frameworks.json',
    'agentevals-trajectory.mjs',
    'promptfoo-assertions.mjs',
    'installed-version.mjs',
    'agentevals-frameworks.json',
    'promptfoo-frameworks.json',
  ]) {
    const file = ASSET(path.join('evaluators', template));
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').trim().length === 0)
      failures.push(`assets/evaluators/${template} is missing or empty`);
    else if (template.endsWith('.mjs') && (fs.statSync(file).mode & 0o111) === 0)
      failures.push(`assets/evaluators/${template} is not executable`);
  }
  // The empty declaration is valid as it ships; a framework's template is valid once its version is filled and not before.
  const shipped = (name) => JSON.parse(fs.readFileSync(ASSET(path.join('evaluators', name)), 'utf8'));
  if (declarationProblems(shipped('frameworks.json')).length > 0 || shipped('frameworks.json').frameworks.length > 0)
    failures.push('assets/evaluators/frameworks.json is not the valid empty declaration');
  for (const [name, packageName] of [
    ['agentevals-frameworks.json', 'agentevals'],
    ['promptfoo-frameworks.json', 'promptfoo'],
  ]) {
    const declaration = shipped(name);
    const filled = structuredClone(declaration);
    for (const entry of filled.frameworks) entry.version = '1.2.3';
    if (
      declaration.frameworks.length !== 1 ||
      declaration.frameworks[0].package !== packageName ||
      declaration.frameworks[0].probe.command !== 'evaluator/installed-version.mjs' ||
      declaration.frameworks[0].probe.args.join(',') !== packageName ||
      declarationProblems(declaration).length === 0 ||
      declarationProblems(filled).length > 0
    )
      failures.push(`assets/evaluators/${name} does not declare ${packageName} through the shipped probe with a version to fill`);
  }
  // Each starter's header says where its declaration and probe come from.
  for (const [template, header] of [
    ['command-evaluator.mjs', 'Keep evaluator/frameworks.json beside it: an empty list while judge() uses no installed framework'],
    ['agentevals-trajectory.mjs', 'Declare the installed agentevals with agentevals-frameworks.json and installed-version.mjs'],
    ['promptfoo-assertions.mjs', 'Declare the installed promptfoo with promptfoo-frameworks.json and installed-version.mjs'],
    ['installed-version.mjs', 'Version probe for a Node framework dependency'],
  ])
    requireText(
      fs.readFileSync(ASSET(path.join('evaluators', template)), 'utf8').split('\nimport ')[0],
      header,
      `assets/evaluators/${template} header`,
      failures,
    );
  const mapping = JSON.parse(fs.readFileSync(ASSET(path.join('evaluators', 'mapping.json')), 'utf8'));
  const validateMapping = new Ajv({ strict: false, allErrors: true }).compile(
    JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cli', 'lib', 'evaluate', 'schemas', 'evaluator-mapping.schema.json'), 'utf8')),
  );
  if (!validateMapping(mapping))
    failures.push(`assets/evaluators/mapping.json fails runtime schema: ${JSON.stringify(validateMapping.errors)}`);
}

function tableRows(content, heading, columns, failures) {
  const lines = headingBody(content, heading)
    .split('\n')
    .filter((line) => line.startsWith('|'));
  const rows = lines.map((line) =>
    line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );
  if (JSON.stringify(rows[0]) !== JSON.stringify(columns)) failures.push(`${heading} table columns changed`);
  if (rows[1]?.length !== columns.length || rows[1].some((cell) => !/^:?-{3,}:?$/.test(cell)))
    failures.push(`${heading} table separator changed`);
  return rows.slice(2);
}

function checkMutationGuidance(guide, failures) {
  const headings = [
    'Weaken or remove a prompt instruction',
    'Remove required context',
    'Drop a validation step',
    'Alter a tool result',
    'Change the agent configuration',
    'Break a state write or its read-back',
    'Remove a test-review smell rule',
  ];
  const signatureChannels = ['stdout', 'stdout', 'responseBody', 'stdout', 'stdout', 'responseBody', 'stdout'];
  const expectedFailures = [
    'over-limit request approved on stdout',
    'stdout omits the required limit',
    'malformed amount accepted in HTTP response body',
    'stdout trajectory includes a create call for an over-limit request',
    'stdout trajectory includes unauthorized reservation-write',
    'read-back HTTP response body lacks saved decision',
    'stdout report omits keyword-only assertion finding',
  ];
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cli/lib/evaluate/schemas/mutation.schema.json'), 'utf8'));
  const validate = new Ajv({ strict: false, allErrors: true }).compile(schema);
  for (const [index, heading] of headings.entries()) {
    requireHeading(guide, `## ${heading}`, 'mutation.md', failures);
    const body = headingBody(guide, `## ${heading}`);
    const examples = taggedExamples(body, 'mutation');
    if (examples.length !== 1) {
      failures.push(`mutation.md ${heading} needs one tagged example`);
      continue;
    }
    const mutation = examples[0];
    if (!validate(mutation)) failures.push(`mutation.md ${heading} fails runtime mutation schema: ${JSON.stringify(validate.errors)}`);
    if (mutation.mutationId !== `M-${String(index + 1).padStart(3, '0')}`) failures.push(`mutation.md ${heading} mutation ID changed`);
    if (mutation.expectedObservableFailure !== expectedFailures[index])
      failures.push(`mutation.md ${heading} no longer names the demonstrated failure`);
    if (
      mutation.operator?.kind !== 'replace-exact' ||
      mutation.operator.occurrences !== 1 ||
      !mutation.operator.find ||
      mutation.operator.find === mutation.operator.replace
    )
      failures.push(`mutation.md ${heading} has an invalid runtime operator`);
    const lesson = body.split('<!-- example:mutation -->')[0];
    for (const marker of [`B-00${index + 1}`, 'Expect', 'sign', signatureChannels[index]])
      requireText(lesson, marker, `mutation.md ${heading}`, failures);
    const signatureClause = lesson.match(/\bsign\b[^.;]*/i)?.[0] ?? '';
    if (!signatureClause.includes(signatureChannels[index])) failures.push(`mutation.md ${heading} signs the wrong observation channel`);
  }
  for (const marker of [
    'mutations/M-NNN.mutation.json',
    'tea-evaluate digest --evaluation <evaluation-folder>',
    'corpus-index.json`, then `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check',
    'node cli/evaluate.js',
    'defectSignature',
    'single source',
    'several files',
    'Refuse',
    'model-weight',
    'provider switch',
    'rollbackVerified',
    'disposable copy',
  ])
    requireText(guide, marker, 'mutation.md', failures);
  const toolLesson = headingBody(guide, '## Alter a tool result');
  for (const marker of [
    'adopter-owned reservation tool to deny an over-limit request',
    "calling agent's stdout trajectory to show a create call for the over-limit request",
    'stdout trajectory includes a create call for an over-limit request',
  ])
    requireText(toolLesson, marker, 'mutation.md tool-result lesson', failures);
}

/** The harness guide's confined skill target is a tagged registry entry that passes the runtime schema and equals its working fixture (Story 1.59). */
function checkConfinedSkillExample(guide, failures) {
  const examples = taggedExamples(guide, 'registry');
  if (examples.length !== 1) {
    failures.push(`harness.md needs one tagged registry example of the confined skill target; found ${examples.length}`);
    return;
  }
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cli', 'lib', 'evaluate', 'schemas', 'evaluation.schema.json')));
  const validate = new Ajv({ strict: false, allErrors: true }).compile(schema);
  const starter = JSON.parse(fs.readFileSync(ASSET('evaluation.json'), 'utf8'));
  if (!validate({ ...starter, registry: examples }))
    failures.push(`harness.md confined skill registry fails runtime schema: ${JSON.stringify(validate.errors)}`);
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'evaluate', 'preflight', 'evaluation.json'), 'utf8'));
  if (
    JSON.stringify(examples[0]) !== JSON.stringify(fixture.registry[0]) ||
    examples[0].executable !== 'tea-skill-runner' ||
    fixture.confinement === false
  )
    failures.push('harness.md confined skill registry differs from its working confined fixture');
}

function checkHarnessGuidance(guide, failures) {
  for (const heading of [
    '## Choose risk and trials',
    '## Record evaluator conditions',
    '## Verify isolation',
    '## Run a skill or agent target confined',
  ])
    requireHeading(guide, heading, 'harness.md', failures);
  for (const marker of [
    'severityFloor',
    'policyId',
    'minimumTrialCount',
    'catchThreshold',
    'assets/scoring-policy.template.json',
    'policy/scoring-policy.json',
    'assets/evaluator-conditions.template.json',
    'policy/evaluator-conditions.json',
    'digestBytes',
    'actual system prompt bytes',
    'caughtCount / validCount > catchThreshold',
    'strength vector non-comparable',
    'per-trial-set isolation manifest',
    'Stage 6 may already have created',
    'confidenceThreshold',
    'reExecutionCap',
    'remediationCap',
    'regexMatchStepBudget',
    'fewer completed trials than `minimumTrialCount`',
    '`severityFloor: low` blocks low, material and critical failures',
    '`severityFloor: critical` blocks critical failures',
    'A lower floor is stricter',
    'Stage 7 may update it for the chosen evaluator',
    'Copy the template only if the file is absent',
    'Set `evaluation.json.trials` to at least the chosen `minimumTrialCount` before `tea-evaluate check`',
    'exits 10 when the manifest plans fewer trials',
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation <evaluation-folder>',
    'node cli/evaluate.js check --evaluation <evaluation-folder>',
    'one private home directory that the runtime makes beneath the run',
    '`XDG_CONFIG_HOME`, `XDG_CACHE_HOME` and `XDG_DATA_HOME`',
    'No registry field declares a writable path',
    'keeps its state across the calls of one trial or arm',
    'each independent arm or leg starts empty',
    '`"confinement": false` keeps the host environment and makes no home',
    'A login the agent stored under the adopter',
    'cannot read the evaluation folder',
    'No other home is reachable from it',
  ])
    requireText(guide, marker, 'harness.md', failures);
  checkConfinedSkillExample(guide, failures);
  const rows = tableRows(
    guide,
    '## Choose risk and trials',
    ['Target', 'Risk', 'Example `severityFloor`', 'Example `minimumTrialCount`', 'Example `catchThreshold`', 'Why discuss this choice'],
    failures,
  );
  const actual = rows.map((row) => `${row[0]}:${row[1]}`);
  const expected = [
    'Deterministic:low',
    'Deterministic:material',
    'Deterministic:critical',
    'Sampled model:low',
    'Sampled model:material',
    'Sampled model:critical',
  ];
  if (JSON.stringify(actual) !== JSON.stringify(expected) || rows.some((row) => row.length !== 6 || row.some((cell) => !cell)))
    failures.push('harness.md risk table lacks a complete target and risk row');
  const policy = JSON.parse(fs.readFileSync(ASSET('scoring-policy.template.json'), 'utf8'));
  const validatePolicy = new Ajv({ strict: false, allErrors: true }).compile(
    JSON.parse(fs.readFileSync(engineSchemaPath('scoring-policy.schema.json'), 'utf8')),
  );
  const expectedFloors = ['critical', 'material', 'low', 'critical', 'material', 'low'];
  for (const [index, row] of rows.entries()) {
    const severityFloor = row[2]?.replaceAll('`', '');
    const minimumTrialCount = Number(row[3]?.replaceAll('`', ''));
    const catchThreshold = Number(row[4]?.replaceAll('`', ''));
    const example = { ...policy, policyId: 'example-policy', severityFloor, minimumTrialCount, catchThreshold };
    if (!validatePolicy(example))
      failures.push(`harness.md risk row ${index + 1} fails engine policy schema: ${JSON.stringify(validatePolicy.errors)}`);
    if (severityFloor !== expectedFloors[index]) failures.push(`harness.md risk row ${index + 1} reverses the severity floor`);
    if (index % 3 > 0) {
      const previousCount = Number(rows[index - 1][3]?.replaceAll('`', ''));
      const previousThreshold = Number(rows[index - 1][4]?.replaceAll('`', ''));
      if (minimumTrialCount <= previousCount || catchThreshold <= previousThreshold)
        failures.push(`harness.md risk row ${index + 1} does not tighten trials and catch threshold`);
    }
  }
  for (const key of ['policyId', 'severityFloor', 'minimumTrialCount', 'catchThreshold'])
    if (policy[key] !== null) failures.push(`scoring policy template sets ${key} without adopter choice`);
  const conditions = JSON.parse(fs.readFileSync(ASSET('evaluator-conditions.template.json'), 'utf8'));
  if (conditions.modelSnapshot !== null || conditions.systemPromptDigest !== null)
    failures.push('evaluator conditions template pre-fills model identity');
}

function checkRunGuidance(guide, failures) {
  for (const heading of [
    '## Install the private latest-spec runtime',
    '## Check, compile, seal and preflight',
    '## Run development and score',
    '## Read development strength before held-out',
    '## Run held-out after development review',
  ])
    requireHeading(guide, heading, 'run.md', failures);
  for (const marker of [
    '"private": true',
    '"devDependencies"',
    '"eval-quality": "latest"',
    '"bmad-method-test-architecture-enterprise": "latest"',
    'npm install --prefix {tea_evaluations_folder}',
    'assets/evaluation-folder.gitignore',
    '.gitignore',
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check',
    'npm exec --prefix {tea_evaluations_folder} -- eval-quality compile',
    'npm exec --prefix {tea_evaluations_folder} -- eval-quality seal',
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate preflight',
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate run',
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate score',
    'node cli/evaluate.js',
    '--partition development',
    '--partition held-out',
    'score.json',
    'stderr',
    'If a development `score` exits 3 with no artifact',
    'For a held-out fault, read only `gap-view.json`',
    'passed-clean-control',
    'caught',
    'gap-view.json',
    '--run <invocationId>',
    'runs/<invocationId>/scores/<scoreInvocationId>/',
    'Each trial set has its own `runId`',
    'before the first preflight',
    'strength.comparable',
    'strength.vector',
    'evaluation.json.strengthFloor',
    'one probe',
    './node_modules/.bin/eval-quality compile',
  ])
    requireText(guide, marker, 'run.md', failures);
  const strength = headingBody(guide, '## Read development strength before held-out');
  for (const marker of [
    'strength-aggregate.json',
    'strengthAggregate',
    'aggregate-strength',
    'floorDecisions',
    '`meets`, `does-not-meet` or `undeclared`',
    'with its `basis`',
    'compute none',
    'A `null` class has no eligible probe',
    'A class with `rate: null`',
    '`comparable: false`',
    '`not-comparable`',
    'which must be `copied`',
    'reads `undeclared` with basis `no-floor-declared`',
    'the readings that follow apply under a declared floor',
    'under a declared floor reads `does-not-meet` with basis `not-comparable`',
    'None of the three is a pass',
    '`absent`, `refused`, `mismatch` or `failed`',
    'no aggregate stands, so the guide makes no class-wide claim',
    'A `does-not-meet` class gets a development repair',
    "the adopter's declined reason on record, before held-out",
  ])
    requireText(strength, marker, 'run.md run-wide strength reading', failures);
  const packages = taggedExamples(guide, 'package');
  if (
    packages.length !== 1 ||
    packages[0]?.private !== true ||
    JSON.stringify(packages[0].devDependencies) !==
      JSON.stringify({
        'eval-quality': 'latest',
        'bmad-method-test-architecture-enterprise': 'latest',
      }) ||
    Object.hasOwn(packages[0], 'dependencies')
  )
    failures.push('run.md AD-20 private package example changed');
  const expectedCommands = [
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation <evaluation-folder>',
    'npm exec --prefix {tea_evaluations_folder} -- eval-quality compile --in <evaluation-folder>/contract.json --out <evaluation-folder>/compiled-contract.json',
    'npm exec --prefix {tea_evaluations_folder} -- eval-quality seal --in <evaluation-folder>/contract.json --out <evaluation-folder>/sealed-brief.json',
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate preflight --evaluation <evaluation-folder>',
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate run --evaluation <evaluation-folder> --partition development',
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate score --evaluation <evaluation-folder> --run <invocationId>',
  ];
  const commands = [...guide.matchAll(/^npm exec --prefix \{tea_evaluations_folder\} -- (?:tea-evaluate|eval-quality) .+$/gm)].map(
    ([command]) => command,
  );
  if (JSON.stringify(commands) !== JSON.stringify(expectedCommands))
    failures.push('run.md check-through-score command sequence or required arguments changed');
}

function checkGapsGuidance(guide, engine, failures) {
  for (const heading of [
    '## Read the strength vector',
    '## Read a loose oracle',
    '## Separate process from outcome',
    '## Read held-out results',
    '## Map engine outcomes to repairs',
    '## Map discipline and preflight checks to repairs',
    '## Map AD-10 exits and classes to repairs',
    '## Author, rerun and rescore',
  ])
    requireHeading(guide, heading, 'gaps.md', failures);
  for (const [heading, markers] of [
    [
      '## Read the strength vector',
      [
        'unique qualified probe IDs exercised per class',
        'An admitted probe that was not exercised contributes no denominator',
        '`defect`, `gameability` or `zero-action`',
        "each probe's trials are reduced",
        'alone decides whether that probe is caught',
        'fewer completed trials than `minimumTrialCount` make its strength non-comparable',
        '`null` class',
        '`rate: null`',
        'Clean controls and canaries',
        'minimumTrialCount',
        'One `caught`',
        'caughtCount / validCount > catchThreshold',
        'one evidence artifact reports only that probe',
        '`strength-aggregate.json`',
        '`aggregate-strength` stage',
        'floor decision with its `basis`',
        'compute no rate or decision',
        '`no-eligible-probe`',
        '`no-exercised-probe`',
        '`not-comparable`',
        '`unexercised-probe`',
        'A class with no declared floor reads `undeclared` with basis `no-floor-declared`',
        'Under a declared floor the first match wins, in this order',
        'None of these is a pass',
        'no aggregate stands and no class-wide claim does either',
      ],
    ],
    ['## Read a loose oracle', ['gameability probe', 'fails qualification', 'does not resolve `caught`', 'clean control', 'oracle']],
    [
      '## Separate process from outcome',
      ['interpretation.json', '`process`', '`outcome`', '`firstMaterialError`', 'lowest-sequence', 'sequence 3'],
    ],
    [
      '## Read held-out results',
      [
        'gap-view.json',
        'only',
        'probe ID',
        'class',
        'outcome.caught: false',
        'An `outcome: null` leaves the held-out cause undisclosed',
        'outcome.trialVotes',
        'validCount',
        'caughtCount',
        'development',
      ],
    ],
  ])
    for (const marker of markers) requireText(headingBody(guide, heading), marker, `gaps.md ${heading}`, failures);
  const concreteRepair = (cell) =>
    /^(?:Read|Inspect|Repair|Fix|Add|Supply|Restore|Make|Keep|Check|Run|For|Author|Requalify|Retain|Narrow|Choose|Tighten)\b/.test(cell) &&
    cell.trim().split(/\s+/).length >= 7 &&
    /probe|control|oracle|evidence|registry|diagnostic|invocation|workspace|mutation|judge|target|CI|gate|calibration|isolation|artifact|contract|response|state|behavior|input|execution|baseline|policy/i.test(
      cell,
    );
  const checkKeys = (heading, column, keys) => {
    const rows = tableRows(guide, heading, column, failures);
    const found = rows.map((row) => row[0].replaceAll('`', ''));
    if (JSON.stringify(found) !== JSON.stringify(keys)) failures.push(`gaps.md ${heading} key set changed`);
    for (const row of rows)
      if (row.length !== column.length || !concreteRepair(row[1]))
        failures.push(`gaps.md ${heading} lacks concrete repair: ${row.join(' | ')}`);
  };
  checkKeys('## Map engine outcomes to repairs', ['Outcome state', 'Concrete repair'], [...engine.OUTCOME_STATES]);
  const allTables = headingBody(guide, '## Map discipline and preflight checks to repairs');
  const requestShapes = taggedExamples(allTables, 'request-shape');
  const inputBindings = taggedExamples(allTables, 'input-binding');
  if (requestShapes.length !== 1 || inputBindings.length !== 1 || [...allTables.matchAll(/```json\n/g)].length !== 2) {
    failures.push('gaps.md malformed-input examples need one tagged request shape and one tagged input binding');
  } else {
    const requestShape = requestShapes[0];
    const inputBinding = inputBindings[0];
    const contract = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/evaluate-gap-loop/after/evaluation/contract.json'), 'utf8'));
    const operation = contract.permittedInterfaces.flatMap((entry) => entry.operations).find((entry) => entry.operationId === 'review');
    const typedStep = contract.interactionPlan.find((step) => step.stepId === 'typed-file');
    if (!operation || !typedStep) {
      failures.push('gaps.md malformed-input example fixture is missing its review operation or typed step');
    } else {
      const key = Object.keys(inputBinding)[0];
      if (
        Object.keys(inputBinding).length !== 1 ||
        inputBinding[key]?.matcher !== 'type-violating' ||
        !requestShape.permittedKeys?.includes(key) ||
        requestShape.types?.[key] !== 'string'
      )
        failures.push('gaps.md malformed-input examples must bind a declared string key with a type-violating matcher');
      operation.requestShape.stdin.requiredKeys.push(...requestShape.requiredKeys);
      operation.requestShape.stdin.permittedKeys.push(...requestShape.permittedKeys);
      Object.assign(operation.requestShape.stdin.types, requestShape.types);
      Object.assign(typedStep.inputBinding.stdin, inputBinding);
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-gaps-example-'));
      try {
        assertEngineSuccess('compile', contract, tempRoot, 'gaps.md malformed-input examples', failures);
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  }
  const discipline = allTables.split('\n\n| Preflight check')[0];
  const preflight = '| Preflight check' + (allTables.split('\n\n| Preflight check')[1] ?? '');
  const mappingRows = (content) =>
    content
      .split('\n')
      .filter((line) => line.startsWith('| `'))
      .map((line) =>
        line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );
  const keys = (content) => mappingRows(content).map((row) => row[0].replaceAll('`', ''));
  if (JSON.stringify(keys(discipline)) !== JSON.stringify([...engine.DISCIPLINE_RULES]))
    failures.push('gaps.md discipline rule key set changed');
  const preflightSchema = JSON.parse(fs.readFileSync(engineSchemaPath('preflight-verdict.schema.json'), 'utf8'));
  const preflightKinds = preflightSchema.properties.checks.items.properties.kind.enum;
  if (JSON.stringify(keys(preflight)) !== JSON.stringify(preflightKinds)) failures.push('gaps.md preflight check key set changed');
  for (const row of [...mappingRows(discipline), ...mappingRows(preflight)])
    if (row.length !== 2 || !concreteRepair(row[1])) failures.push(`gaps.md lacks concrete repair: ${row.join(' | ')}`);
  const ad10 = fs
    .readFileSync(path.join(__dirname, '..', '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'), 'utf8')
    .split('### AD-10:')[1]
    ?.split('### AD-11:')[0];
  if (!ad10) failures.push('AD-10 source table is unavailable');
  const sourceClasses = new Map(
    [...(ad10 ?? '').matchAll(/^\|\s*(\d+)\s*\|\s*`?(eval-quality(?:-gates)?|tea-evaluate)`?\s*\|\s*([^|]+)\|/gm)].map(
      ([, exit, source, classText]) => [`${source} ${exit}`, classText.trim().replaceAll(/\s+/g, ' ')],
    ),
  );
  const exits = [...sourceClasses.keys()];
  const expectedClasses = new Map([
    ['eval-quality 0', ['pass or CONCERNS', 'pass. CONCERNS']],
    ['eval-quality 2', ['target behavior failure or evidence integrity', 'target behavior failure, or evidence or lineage integrity']],
    ['eval-quality 3', ['infrastructure or integrity', 'infrastructure or integrity']],
    ['eval-quality 4', ['contract authoring defect', 'contract authoring defect']],
    ['eval-quality 5', ['runtime fault', 'runtime fault']],
    ['eval-quality 64', ['wiring defect', 'wiring defect']],
    ['tea-evaluate 10', ['authoring defect', 'authoring defect']],
    ['tea-evaluate 11', ['evaluation weakness', 'evaluation weakness']],
    ['tea-evaluate 12', ['infrastructure', 'infrastructure: workspace']],
    ['tea-evaluate 13', ['evaluation evidence drift', 'evaluation evidence drift']],
    ['tea-evaluate 64', ['wiring defect', 'wiring defect']],
    ['eval-quality-gates 1', ['repository policy violation', 'repository policy violation']],
    ['eval-quality-gates 64', ['wiring defect', 'wiring defect']],
  ]);
  const rows = tableRows(
    guide,
    '## Map AD-10 exits and classes to repairs',
    ['Source and exit', 'AD-10 class', 'Concrete repair'],
    failures,
  );
  if (
    exits.length !== expectedClasses.size ||
    JSON.stringify(rows.map((row) => row[0].replaceAll('`', '')).sort()) !== JSON.stringify(exits.sort()) ||
    rows.some((row) => {
      const key = row[0].replaceAll('`', '');
      const [guideClass, sourceClass] = expectedClasses.get(key) ?? [];
      return row.length !== 3 || row[1] !== guideClass || !sourceClasses.get(key)?.includes(sourceClass) || !concreteRepair(row[2]);
    })
  )
    failures.push('gaps.md AD-10 exit mapping changed');
  requireText(guide, '`ci --tier pr` exits 13 on drift', 'gaps.md exit 13', failures);
  requireText(guide, 'run `tea-evaluate compare --accept` once the adopter confirms', 'gaps.md exit 13 accept', failures);
  requireText(guide, 'a framework result with no grade; see `evaluator.md`', 'gaps.md exit 12', failures);
  // Story 1.44: an installed framework that is missing, different or changed is the same class, with its two recoveries.
  requireText(
    guide,
    'an installed framework that is missing, differs from `evaluator/frameworks.json` or changes during the run',
    'gaps.md exit 12',
    failures,
  );
  requireText(guide, 'update `frameworks.json` and `LEARNED.md` together after a deliberate upgrade', 'gaps.md exit 12', failures);
  for (const marker of [
    'score` exit 3',
    'For a development `score` exit 3',
    'For a held-out score failure, read only its `gap-view.json` row',
    'score.json',
    'stdout and stderr diagnostics',
    'gap-view.json',
    '{test_artifacts}/evaluate/<evaluationId>/gap-report.md',
    'prior and new invocation IDs',
    'runs/<invocationId>/scores/<scoreInvocationId>/<probeId>/score.json',
  ])
    requireText(guide, marker, 'gaps.md', failures);
  const loop = headingBody(guide, '## Author, rerun and rescore');
  requireText(loop, 'corpus-index.json', 'gaps.md rerun loop', failures);
  for (const command of [
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate digest --evaluation <evaluation-folder>',
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation <evaluation-folder>',
    'npm exec --prefix {tea_evaluations_folder} -- eval-quality compile --in <evaluation-folder>/contract.json --out <evaluation-folder>/compiled-contract.json',
    'npm exec --prefix {tea_evaluations_folder} -- eval-quality seal --in <evaluation-folder>/contract.json --out <evaluation-folder>/sealed-brief.json',
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate run --evaluation <evaluation-folder> --partition development',
    'npm exec --prefix {tea_evaluations_folder} -- tea-evaluate score --evaluation <evaluation-folder> --run <invocationId>',
    './node_modules/.bin/eval-quality',
    'node cli/evaluate.js',
  ])
    requireText(loop, command, 'gaps.md executable repair loop', failures);
  const steps = loop.split('\n').filter((line) => /^\d+\. /.test(line));
  if (steps.length !== 6 || steps.some((step, index) => !step.startsWith(`${index + 1}. `)))
    failures.push('gaps.md author, rerun and rescore loop order changed');
  for (const [index, marker] of [
    'Name one gap',
    'Author the missing probe',
    'tea-evaluate digest --evaluation <evaluation-folder>',
    'run --evaluation <evaluation-folder> --partition development',
    'before and after',
    'held-out partition',
  ].entries())
    if (!steps[index]?.includes(marker)) failures.push(`gaps.md loop step ${index + 1} changed`);
  for (const marker of [
    'strength-aggregate.json',
    'does-not-meet',
    '`absent`, `refused`, `mismatch` or `failed`',
    'blocks every class-wide claim',
  ])
    if (!steps[5]?.includes(marker)) failures.push(`gaps.md loop step 6 no longer reads the run-wide aggregate (${marker})`);
  if (
    !steps[2]?.includes('tea-evaluate check --evaluation <evaluation-folder>') ||
    steps[2].indexOf('tea-evaluate digest') >= steps[2].indexOf('tea-evaluate check')
  )
    failures.push('gaps.md must digest the corpus before check');
}

/** The gate names the installed eval-quality-gates binary lists, read from its own help text. */
function installedGateNames() {
  const packagePath = require.resolve('eval-quality/package.json');
  const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const binary = path.join(path.dirname(packagePath), manifest.bin['eval-quality-gates']);
  const run = spawnSync(process.execPath, [binary, '--help'], { encoding: 'utf8' });
  return [...run.stdout.matchAll(/^ {2}([a-z]+(?:-[a-z]+)*) {2,}every /gm)].map((match) => match[1]);
}

/** The ci stage guide (Story 2.4): inspection headings, placement rules, the plan template and the tagged plan examples. */
function checkCiGuidance(guide, failures) {
  const plan = require('../cli/lib/evaluate/ci-plan');
  const INSPECTIONS = [
    [
      '## Inspect existing CI',
      [
        'Worked example.',
        'platform',
        'workflow',
        'events that start it',
        'checks the adopter requires before merge',
        'which events receive which secrets',
        'in one message',
        'its hand-off uses create mode',
      ],
    ],
    [
      '## Inspect the merge flow',
      ['Worked example.', 'branch protection', 'merge queue', 'review', '`merge_group`', 'the `merge` tier has no event'],
    ],
    [
      '## Inspect the release flow',
      [
        'Worked example.',
        'tag-triggered publish workflows',
        'deploy workflows',
        'cadence',
        'release event',
        'place the live set on `scheduled` with the `trigger` `["manual-dispatch"]`',
      ],
    ],
    [
      '## Inspect the risk profile',
      [
        'Worked example.',
        'severities',
        'cost of one live trial',
        'reach of a missed defect',
        '`critical` behaviors justify blocking `release`',
      ],
    ],
  ];
  for (const heading of [
    ...INSPECTIONS.map(([name]) => name),
    '## Place each check',
    '## Keep the deterministic checks on pr',
    '## Place the live checks',
    '## Offer eval-quality-gates',
    '## Write the plan',
    '## Hand the plan to the CI skill',
  ])
    requireHeading(guide, heading, 'ci.md', failures);
  for (const [heading, markers] of INSPECTIONS)
    for (const marker of markers) requireText(headingBody(guide, heading), marker, `ci.md ${heading}`, failures);

  // The default table is the runtime's own: every row equals DEFAULT_TIERS.
  const rows = tableRows(guide, '## Place each check', ['Check id', 'Default tier', 'Needs a secret or a live target'], failures);
  const tableDefaults = Object.fromEntries(
    rows.map((row) => [row[0].replaceAll('`', ''), row[1].split(',').map((tier) => tier.replaceAll('`', '').trim())]),
  );
  try {
    assert.deepStrictEqual(tableDefaults, structuredClone(plan.DEFAULT_TIERS));
  } catch (error) {
    failures.push(`ci.md default tiers differ from the runtime's DEFAULT_TIERS: ${error.message}`);
  }
  for (const row of rows)
    if ((row[2] === 'No') !== plan.DETERMINISTIC_CHECKS.includes(row[0].replaceAll('`', '')))
      failures.push(`ci.md secret column disagrees with the runtime for ${row[0]}`);

  for (const marker of [
    '`placement`: the chosen `tier`, the `defaultTier` from this table and a `reason`',
    'Write the `reason` for every check, default placements included',
    "name the file or the adopter's answer the placement came from",
    'Record `defaultTier` as the tier the table gives the check for this adopter',
    'is a deviation: the runtime refuses it without a reason',
    "each entry's `defaultTier` is its own tier",
    'lists every deviation with its reason',
    '`preflight-live` defaults to `merge` when the target needs no secret',
  ])
    requireText(headingBody(guide, '## Place each check'), marker, 'ci.md placement rules', failures);
  for (const marker of [
    'the gameability arm (`gameability`), contract-source freshness (part of `check`) and oracle-versus-scorer agreement (`oracle-agreement`) on `pr`',
    'No inspection moves them',
    'CAP-11 requires them on every pull request',
    'tea-evaluate compare --evaluation <evaluation-folder> --accept',
  ])
    requireText(headingBody(guide, '## Keep the deterministic checks on pr'), marker, 'ci.md pr placement', failures);
  const live = headingBody(guide, '## Place the live checks');
  for (const marker of [
    'the held-out partition (`held-out`) on `scheduled` and `release`',
    'judge calibration (`judge-calibration`) on `scheduled` and `release` whenever the contract declares a rubric',
    'Never place a live check on `pr`',
    "A skill or agent target always needs the runner's model credentials, so its live tiers are `scheduled`, `release` and manual dispatch only",
    '`schedule` and `manual-dispatch` for `scheduled`',
    "Declare the runner's credential keys as `permittedEnvironmentKeys`",
    'registry `environmentKeys`',
    'Keys carry names alone.',
    'the same names as the CI secrets to add',
    "Keep the template's `enforcement` values",
    'a strength regression on `strength-comparison`',
    'the strength floor on `twin-run` and `held-out` on `scheduled`',
  ])
    requireText(live, marker, 'ci.md live placement', failures);
  const gates = headingBody(guide, '## Offer eval-quality-gates');
  for (const marker of [
    'is opt-in',
    'add only the ones the adopter adopts',
    'eval-quality-gates --help',
    'never guess a section',
    'add a section for each adopted gate and never rewrite, reorder or reformat a section that exists',
    'adopt it as it stands',
    'joins the plan as a `gate` check on `pr`',
    'its `command` is led by `eval-quality-gates`',
  ])
    requireText(gates, marker, 'ci.md gates', failures);
  const write = headingBody(guide, '## Write the plan');
  for (const marker of [
    'assets/evaluation-ci-plan.template.json',
    '<evaluation-folder>/ci/evaluation-ci-plan.json',
    'fill every `reason`',
    'set `evaluation.json` `tiers` to the tiers the plan places a check on',
    'repair every `ci-plan` finding',
    'leave `<invocationId>` literal',
    '`judge-calibration` when the contract declares no rubric',
    'Keep the one `preflight-live` set that fits',
    '`api-conformance` for an evaluation that declares no HTTP target',
    'edit it in place',
    'tea-evaluate compare --evaluation <evaluation-folder> --accept',
    'An adopter who declines leaves the stage pending',
    'before the hand-off',
  ])
    requireText(write, marker, 'ci.md write the plan', failures);
  const handoff = headingBody(guide, '## Hand the plan to the CI skill');
  for (const marker of [
    'Invoke `bmad-testarch-ci` in edit mode',
    'steps-c/step-03b-render-evaluation-plans.md',
    'The rendering rules belong to its `steps-c/step-03b-render-evaluation-plans.md`',
    'or in create mode when the inspection found no pipeline file',
    'Stage 12 is complete when the plan passes `check`',
    'the secrets the live tiers need',
  ])
    requireText(handoff, marker, 'ci.md hand-off', failures);

  // Rendering belongs to the CI skill, and an adopter never runs the unclaimed registry name.
  for (const forbidden of ['if: always()', 'upload-artifact', 'continue-on-error', 'actions/checkout'])
    if (guide.includes(forbidden)) failures.push(`ci.md restates a rendering rule of bmad-testarch-ci: ${forbidden}`);
  const prose = guide.replaceAll(/```[\s\S]*?```/g, '');
  for (const [, span] of prose.matchAll(/`([^`\n]+)`/g)) {
    if (!/\btea-evaluate\b/.test(span)) continue;
    const adopter = span.includes('npm exec --prefix {tea_evaluations_folder} -- tea-evaluate');
    const local = span.startsWith('node cli/evaluate.js');
    if (!adopter && !local && span !== 'npx tea-evaluate') failures.push(`ci.md writes a bare tea-evaluate command: ${span}`);
  }
  requireText(
    guide,
    'A bare `npx tea-evaluate` fetches an unclaimed registry name, so never write it for an adopter.',
    'ci.md AD-20',
    failures,
  );
  requireText(guide, "Inside TeA's own package, run `node cli/evaluate.js` from the repository root.", 'ci.md TeA command', failures);
  requireText(guide, 'name the missing prerequisite and return to its stage before inspecting CI', 'ci.md prerequisites', failures);
  requireText(
    guide,
    "as a `## CI` section of the run's inspection record at `{test_artifacts}/evaluate/<evaluationId>/inspection-record.md`",
    'ci.md working state',
    failures,
  );
  const installed = '{tea_evaluations_folder}/node_modules/bmad-method-test-architecture-enterprise/cli/lib/evaluate';
  for (const pointer of [`${installed}/schemas/evaluation-ci-plan.schema.json`, `${installed}/ci-plan.js`])
    requireText(guide, pointer, 'ci.md runtime pointer', failures);

  // The plan examples meet the runtime's schema and placement rules, and the first one is a deviation that carries its reason.
  const plans = taggedExamples(guide, 'ci-plan');
  if (plans.length !== 2) failures.push(`ci.md needs two tagged ci-plan examples; found ${plans.length}`);
  for (const [index, example] of plans.entries()) {
    const found = plan.planFindings(example);
    if (found.length > 0) failures.push(`ci.md ci-plan example ${index + 1} fails the runtime: ${JSON.stringify(found)}`);
    for (const check of example.checks ?? [])
      if (!check.placement?.reason?.trim()) failures.push(`ci.md ci-plan example ${index + 1} leaves ${check.id} without a reason`);
  }
  const deviation = plans[0]?.checks?.find((check) => check.placement.tier !== check.placement.defaultTier);
  if (deviation === undefined) failures.push('ci.md has no ci-plan example that deviates from the default tier');
  else {
    const stripped = structuredClone(plans[0]);
    for (const check of stripped.checks) delete check.placement.reason;
    if (!plan.planFindings(stripped).some((item) => item.rule === 'placement-reason'))
      failures.push('ci.md deviation example does not exercise the runtime reason rule');
    if (!deviation.trigger.some((name) => ['schedule', 'manual-dispatch', 'release'].includes(name)))
      failures.push('ci.md deviation example names a trigger no live tier uses');
  }
  if (plans[0] && plans[1] && JSON.stringify(plans[0]) === JSON.stringify(plans[1]))
    failures.push('ci.md two ci-plan examples are identical, so the guide does not show a placement that differs');

  // The credential keys sit in a registry entry the runtime accepts.
  const registries = taggedExamples(guide, 'ci-registry');
  if (registries.length !== 1 || !(registries[0]?.environmentKeys?.length > 0))
    failures.push('ci.md needs one registry example that declares credential keys');
  else {
    const validate = new Ajv({ strict: false, allErrors: true }).compile(
      JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cli', 'lib', 'evaluate', 'schemas', 'evaluation.schema.json'), 'utf8')),
    );
    const starter = JSON.parse(fs.readFileSync(ASSET('evaluation.json'), 'utf8'));
    if (!validate({ ...starter, registry: registries }))
      failures.push(`ci.md registry example fails the runtime schema: ${JSON.stringify(validate.errors)}`);
    if (registries[0].environmentKeys.some((key) => /[a-z]|=/.test(key)))
      failures.push('ci.md registry example names a value or a non-key');
  }

  // The gate example: a gate the installed binary lists, a section added beside untouched ones, a check led by the binary.
  const names = installedGateNames();
  if (names.length < 8) failures.push(`the installed eval-quality-gates lists ${names.length} gates; expected eight or more`);
  const [before] = taggedExamples(guide, 'gates-config-before');
  const [after] = taggedExamples(guide, 'gates-config-after');
  const [gatePlan] = taggedExamples(guide, 'gate-check');
  if (!before || !after || !gatePlan) failures.push('ci.md lacks the gates-config-before, gates-config-after or gate-check example');
  else {
    const added = Object.keys(after).filter((key) => !(key in before));
    for (const key of Object.keys(before))
      if (JSON.stringify(after[key]) !== JSON.stringify(before[key]))
        failures.push(`ci.md gates example rewrites the existing ${key} section`);
    if (added.length !== 1 || !names.includes(added[0]))
      failures.push(`ci.md gates example adds ${JSON.stringify(added)}, not one gate the binary lists`);
    const found = plan.planFindings(gatePlan);
    if (found.length > 0) failures.push(`ci.md gate-check example fails the runtime: ${JSON.stringify(found)}`);
    const check = gatePlan.checks?.[0];
    if (
      check?.kind !== 'gate' ||
      check.id !== added[0] ||
      check.command?.[0] !== 'eval-quality-gates' ||
      check.command[1] !== added[0] ||
      check.placement?.tier !== 'pr'
    )
      failures.push('ci.md gate-check example is not the adopted gate as a pr gate check');
  }

  // The plan template: valid at the defaults, every check present with a reason field to fill, the paths left for the stage.
  const template = JSON.parse(fs.readFileSync(ASSET('evaluation-ci-plan.template.json'), 'utf8'));
  const templateFindings = plan.planFindings(template);
  if (templateFindings.length > 0)
    failures.push(`assets/evaluation-ci-plan.template.json fails the runtime: ${JSON.stringify(templateFindings)}`);
  const present = new Set(template.checks.map((check) => `${check.id}:${check.placement.tier}`));
  for (const [id, tiers] of Object.entries(plan.DEFAULT_TIERS))
    for (const tier of id === 'preflight-live' ? ['merge', 'scheduled', 'release'] : tiers)
      if (!present.has(`${id}:${tier}`)) failures.push(`assets/evaluation-ci-plan.template.json lacks ${id} on ${tier}`);
  for (const check of template.checks) {
    if (check.placement.tier !== check.placement.defaultTier)
      failures.push(`template ${check.id} on ${check.tier} leaves its default tier`);
    if (check.placement.reason !== '') failures.push(`template ${check.id} on ${check.tier} ships a reason the stage did not write`);
    if (!check.command.includes('<evaluation-folder>'))
      failures.push(`template ${check.id} on ${check.tier} names no <evaluation-folder> to replace`);
    if (check.kind !== 'evaluate') failures.push(`template ${check.id} is not an evaluate check`);
  }
  const triggerOf = { pr: ['pull-request'], merge: ['merge'], scheduled: ['schedule', 'manual-dispatch'], release: ['release'] };
  for (const check of template.checks)
    if (JSON.stringify(check.trigger) !== JSON.stringify(triggerOf[check.tier]))
      failures.push(`template ${check.id} on ${check.tier} has the wrong trigger`);
  requireText(
    fs.readFileSync(ASSET('README.md'), 'utf8'),
    '`evaluation-ci-plan.template.json` becomes `ci/evaluation-ci-plan.json`',
    'assets/README.md',
    failures,
  );
}

async function main() {
  const failures = [];
  let skillContent;
  try {
    skillContent = fs.readFileSync(SKILL_MD_PATH, 'utf8');
  } catch (error) {
    console.error(`evaluate-guidance: ${error.message}`);
    process.exit(1);
  }

  // Scoped to the "## Workflow" section alone, so an unrelated references/
  // mention elsewhere (the Conventions bullet's own example path) can never
  // shift or pad the extracted stage order.
  const workflowSectionMatch = skillContent.match(/## Workflow\n([\s\S]*?)(?:\n## |$)/);
  if (!workflowSectionMatch) failures.push('SKILL.md has no "## Workflow" section');
  const workflowSection = workflowSectionMatch ? workflowSectionMatch[1] : '';

  const referencedStages = [...workflowSection.matchAll(/^.*\bLoad `references\/([a-z-]+)\.md`/gm)].map((match) => match[1]);
  const uniqueStages = [...new Set(referencedStages)];

  try {
    assert.deepStrictEqual(uniqueStages, EXPECTED_STAGES);
  } catch (error) {
    failures.push(
      `SKILL.md's stage list is ${JSON.stringify(uniqueStages)}, expected ${JSON.stringify(EXPECTED_STAGES)}: ${error.message}`,
    );
  }

  for (const stage of EXPECTED_STAGES) {
    const referencePath = path.join(SKILL_ROOT, 'references', `${stage}.md`);
    if (!fs.existsSync(referencePath)) {
      failures.push(`references/${stage}.md does not exist`);
      continue;
    }
    if (fs.readFileSync(referencePath, 'utf8').trim().length === 0) {
      failures.push(`references/${stage}.md is empty`);
    }
  }

  // The verdict boundary applies to every stage.
  if (!workflowSection.includes('never compute a verdict')) {
    failures.push("SKILL.md's Workflow section has no rule against computing a verdict outside eval-quality's CLI");
  }
  if (
    !skillContent.includes('finish it with the CI plan that enforces it') ||
    /Stage 12 CI wiring is pending|completes through Stage 11/.test(skillContent)
  )
    failures.push('SKILL.md does not enable every stage through Stage 12');
  requireText(skillContent, '`<evaluation-folder>/ci/evaluation-ci-plan.json`, and any', 'SKILL.md resume', failures);
  if (/Placeholder\./.test(fs.readFileSync(REFERENCE('ci'), 'utf8'))) failures.push('references/ci.md is still a placeholder');
  if (!/^description:.*scored behavioral evaluations and repair gaps/m.test(skillContent))
    failures.push('SKILL.md discovery description omits scoring or gap repair');
  const stage6 = headingBody(skillContent, '### Stage 6: Adapters');
  const ignoreBeforePreflight = stage6.indexOf('copy `assets/evaluation-folder.gitignore` to `<evaluation-folder>/.gitignore`');
  const firstPreflight = stage6.indexOf('tea-evaluate preflight');
  if (ignoreBeforePreflight === -1 || firstPreflight === -1 || ignoreBeforePreflight >= firstPreflight)
    failures.push('SKILL.md must install the evaluation ignore file before first preflight');
  const checkMutationBeforeValidation = (content, found) => {
    const local = headingBody(content, '### Stage 6: Adapters');
    const author = local.indexOf('author every `mutations/<mutationId>.mutation.json`');
    const digest = local.indexOf('tea-evaluate digest --evaluation <evaluation-folder>');
    const check = local.indexOf('tea-evaluate check --evaluation <evaluation-folder>');
    if (author === -1 || digest === -1 || check === -1 || author >= digest || digest >= check)
      found.push('SKILL.md must author and digest nominated mutations before Stage 6 check');
    requireText(local, 'load `references/mutation.md`', 'SKILL.md early mutation guide', found);
    requireText(local, 'node cli/evaluate.js digest --evaluation <evaluation-folder>', 'SKILL.md local Stage 6 digest', found);
  };
  checkMutationBeforeValidation(skillContent, failures);
  const mutationOrderingFailures = [];
  checkMutationBeforeValidation(
    skillContent.replace('author every `mutations/<mutationId>.mutation.json`', 'plan every mutation file'),
    mutationOrderingFailures,
  );
  if (mutationOrderingFailures.length === 0) failures.push('SKILL.md Stage 6 mutation authoring removal passed its guidance check');
  const checkLocalStage6 = (content, found) => {
    const local = headingBody(content, '### Stage 6: Adapters');
    for (const command of [
      'node cli/evaluate.js check --evaluation <evaluation-folder>',
      './node_modules/.bin/eval-quality compile --in <evaluation-folder>/contract.json --out <evaluation-folder>/compiled-contract.json',
      './node_modules/.bin/eval-quality seal --in <evaluation-folder>/contract.json --out <evaluation-folder>/sealed-brief.json',
      'node cli/evaluate.js preflight --evaluation <evaluation-folder>',
    ])
      requireText(local, command, 'SKILL.md local Stage 6 sequence', found);
  };
  checkLocalStage6(skillContent, failures);
  const removedLocalEngine = skillContent.replace(
    './node_modules/.bin/eval-quality compile --in <evaluation-folder>/contract.json',
    'eval-quality compile --in <evaluation-folder>/contract.json',
  );
  const localFailures = [];
  checkLocalStage6(removedLocalEngine, localFailures);
  if (localFailures.length === 0) failures.push('SKILL.md local Stage 6 engine removal passed its guidance check');
  requireText(skillContent, '{test_artifacts}/evaluate/<evaluationId>/gap-report.md', 'SKILL.md resume', failures);

  const inspection = fs.readFileSync(REFERENCE('inspection'), 'utf8');
  const intake = fs.readFileSync(REFERENCE('intake'), 'utf8');
  const corpus = fs.readFileSync(REFERENCE('corpus'), 'utf8');
  const engine = await loadEngine();
  checkInspection(inspection, failures);
  checkIntake(intake, failures);
  checkCorpus(corpus, engine, failures);
  try {
    checkContractGuidance(
      skillContent,
      fs.readFileSync(REFERENCE('contract'), 'utf8'),
      fs.readFileSync(REFERENCE('oracles'), 'utf8'),
      fs.readFileSync(REFERENCE('adapters'), 'utf8'),
      engine,
      failures,
    );
  } catch (error) {
    failures.push('contract guidance: ' + error.stack);
  }
  try {
    checkEvaluatorGuidance(fs.readFileSync(REFERENCE('evaluator'), 'utf8'), failures);
  } catch (error) {
    failures.push('evaluator guidance: ' + error.stack);
  }
  for (const [name, check] of [
    ['mutation', (guide, found) => checkMutationGuidance(guide, found)],
    ['harness', (guide, found) => checkHarnessGuidance(guide, found)],
    ['run', (guide, found) => checkRunGuidance(guide, found)],
    ['gaps', (guide, found) => checkGapsGuidance(guide, engine, found)],
    ['ci', (guide, found) => checkCiGuidance(guide, found)],
  ]) {
    try {
      const guide = fs.readFileSync(REFERENCE(name), 'utf8');
      check(guide, failures);
      const firstHeading = guide.match(/^## .+$/m)?.[0];
      const reverted = [];
      check(guide.replace(firstHeading, '## Removed lesson'), reverted);
      if (reverted.length === 0) failures.push(`${name}.md heading removal did not fail its guidance check`);
    } catch (error) {
      failures.push(`${name} guidance: ${error.stack}`);
    }
  }
  try {
    const negativeCases = [
      ['mutation example corruption', 'mutation', checkMutationGuidance, (text) => text.replace('"occurrences": 1', '"occurrences": 2')],
      [
        'mutation expected failure corruption',
        'mutation',
        checkMutationGuidance,
        (text) => text.replace('malformed amount accepted in HTTP response body', 'malformed amount rejected in HTTP response body'),
      ],
      [
        'mutation signature channel removal',
        'mutation',
        checkMutationGuidance,
        (text) =>
          text.replace(
            'Expect an approval on stdout; sign the descriptor-nominated stdout.',
            'Expect an approval; sign the descriptor-nominated evidence.',
          ),
      ],
      [
        'mutation signature wrong channel',
        'mutation',
        checkMutationGuidance,
        (text) => text.replace('sign the descriptor-nominated stdout.', 'sign the descriptor-nominated stderr.'),
      ],
      ['harness confined example removal', 'harness', checkHarnessGuidance, (text) => text.replace('<!-- example:registry -->', '')],
      [
        'harness confined example corruption',
        'harness',
        checkHarnessGuidance,
        (text) => text.replace('"target": "tea-skill-runner"', '"target": "stub-skill-runner"'),
      ],
      [
        'harness home sentence removal',
        'harness',
        checkHarnessGuidance,
        (text) => text.replace('each independent arm or leg starts empty', 'the next trial goes on'),
      ],
      ['harness risk row removal', 'harness', checkHarnessGuidance, (text) => text.replace(/^\| Sampled model \| critical \|.*\n/m, '')],
      [
        'harness risk floor corruption',
        'harness',
        checkHarnessGuidance,
        (text) => text.replace(/^(\| Deterministic \| low\s+\| )`critical`/m, '$1`low`'),
      ],
      [
        'run command removal',
        'run',
        checkRunGuidance,
        (text) => text.replace(/^npm exec --prefix \{tea_evaluations_folder\} -- tea-evaluate preflight.*\n/m, ''),
      ],
      ['run package dependency corruption', 'run', checkRunGuidance, (text) => text.replace('"devDependencies"', '"dependencies"')],
      [
        'run evaluation argument removal',
        'run',
        checkRunGuidance,
        (text) => text.replace('tea-evaluate preflight --evaluation <evaluation-folder>', 'tea-evaluate preflight'),
      ],
      [
        'run score invocation argument removal',
        'run',
        checkRunGuidance,
        (text) =>
          text.replace(
            'tea-evaluate score --evaluation <evaluation-folder> --run <invocationId>',
            'tea-evaluate score --evaluation <evaluation-folder>',
          ),
      ],
      [
        'run invocation identity corruption',
        'run',
        checkRunGuidance,
        (text) => text.replace('--run <invocationId>', '--run <trial-run-id>'),
      ],
      [
        'run local engine removal',
        'run',
        checkRunGuidance,
        (text) => text.replace('./node_modules/.bin/eval-quality compile', 'eval-quality compile'),
      ],
      [
        'gaps outcome removal',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) => text.replace(/^\| `caught`[^\n]*\n/m, ''),
      ],
      [
        'gaps discipline removal',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) => text.replace(/^\| `whole-body`[^\n]*\n/m, ''),
      ],
      [
        'gaps malformed-input example tag removal',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) => text.replace('<!-- example:input-binding -->', ''),
      ],
      [
        'gaps malformed-input matcher corruption',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) => text.replace('"matcher": "type-violating"', '"literal": "valid"'),
      ],
      [
        'gaps preflight removal',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) => text.replace(/^\| `state-reset`[^\n]*\n/m, ''),
      ],
      [
        'gaps preflight remedy removal',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) => text.replace(/^(\| `clean-control`\s*\|)[^\n|]*/m, '$1 '),
      ],
      [
        'gaps outcome placeholder remedy',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) => text.replace(/^(\| `missed`\s*\|)[^\n|]*/m, '$1 TBD '),
      ],
      [
        'gaps preflight placeholder remedy',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) => text.replace(/^(\| `state-reset`\s*\|)[^\n|]*/m, '$1 probe '),
      ],
      [
        'gaps exit removal',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) => text.replace(/^\| `tea-evaluate 11`[^\n]*\n/m, ''),
      ],
      [
        'gaps exit placeholder remedy',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) => text.replace(/^(\| `tea-evaluate 11`\s*\|[^|]*\|)[^\n|]*/m, '$1 TBD '),
      ],
      [
        'gaps exit class corruption',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) => text.replace(/^(\| `tea-evaluate 13`\s*\|\s*)evaluation evidence drift/m, '$1infrastructure'),
      ],
      [
        'gaps catch threshold operator corruption',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) => text.replace('caughtCount / validCount > catchThreshold', 'caughtCount / validCount >= catchThreshold'),
      ],
      [
        'gaps class denominator corruption',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) => text.replace('unique qualified probe IDs exercised per class', 'unique qualified probe IDs per class'),
      ],
      [
        'gaps held-out fault guard removal',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) => text.replace('An `outcome: null` leaves the held-out cause undisclosed;', 'A held-out score fault exposes its cause;'),
      ],
      [
        'gaps digest removal',
        'gaps',
        (text, found) => checkGapsGuidance(text, engine, found),
        (text) =>
          text.replace('tea-evaluate digest --evaluation <evaluation-folder>', 'tea-evaluate check --evaluation <evaluation-folder>'),
      ],
      [
        'evaluator failure boundary heading removal',
        'evaluator',
        (text, found) => checkEvaluatorGuidance(text, found),
        (text) => text.replace(FAILURE_BOUNDARY, '## Framework errors'),
      ],
      [
        'evaluator failure boundary example removal',
        'evaluator',
        (text, found) => checkEvaluatorGuidance(text, found),
        (text) => text.replace('<!-- example:promptfoo-ungraded -->', ''),
      ],
      [
        'evaluator failure boundary exit removal',
        'evaluator',
        (text, found) => checkEvaluatorGuidance(text, found),
        (text) => text.replace('evaluator infrastructure failure (exit 12)', 'a finding'),
      ],
      [
        'evaluator framework versions heading removal',
        'evaluator',
        (text, found) => checkEvaluatorGuidance(text, found),
        (text) => text.replace(FRAMEWORK_VERSIONS, '## Framework versions'),
      ],
      [
        'evaluator framework versions example removal',
        'evaluator',
        (text, found) => checkEvaluatorGuidance(text, found),
        (text) => text.replace('<!-- example:frameworks -->', ''),
      ],
      [
        'evaluator framework versions invalid example',
        'evaluator',
        (text, found) => checkEvaluatorGuidance(text, found),
        (text) => text.replace('"version": "1.2.3"', '"version": "^1.2.3"'),
      ],
      [
        'evaluator framework versions exit removal',
        'evaluator',
        (text, found) => checkEvaluatorGuidance(text, found),
        (text) => text.replace('ends the run with exit 12 and seals no record for the affected trial', 'is noted'),
      ],
      [
        'evaluator framework versions LEARNED agreement removal',
        'evaluator',
        (text, found) => checkEvaluatorGuidance(text, found),
        (text) => text.replace('a different version, a missing one or a package the declaration omits is a finding', 'nothing is read'),
      ],
      [
        'evaluator framework versions digit-start sentence removal',
        'evaluator',
        (text, found) => checkEvaluatorGuidance(text, found),
        (text) => text.replace('The version starts with a digit, so a probe for an ecosystem that reports `v1.2.3` prints `1.2.3`.', ''),
      ],
      [
        'evaluator framework versions artifact wording reverted',
        'evaluator',
        (text, found) => checkEvaluatorGuidance(text, found),
        (text) =>
          text.replace(
            'keeps the declared and observed versions, and the output of any probe that failed',
            'keeps what each probe printed',
          ),
      ],
      [
        'ci default tier corruption',
        'ci',
        checkCiGuidance,
        (text) => text.replace(/^(\| `held-out`\s+\| )`scheduled`, `release`/m, '$1`pr`, `release`'),
      ],
      ['ci live rule removal', 'ci', checkCiGuidance, (text) => text.replace('Never place a live check on `pr`.', '')],
      ['ci pr placement removal', 'ci', checkCiGuidance, (text) => text.replace('No inspection moves them.', '')],
      [
        'ci inspection example removal',
        'ci',
        checkCiGuidance,
        (text) => text.replace('Worked example. `CONTRIBUTING.md`', 'Note. `CONTRIBUTING.md`'),
      ],
      [
        'ci deviation example reason removal',
        'ci',
        checkCiGuidance,
        (text) => text.replace(/"reason": "The target needs no secret, but CONTRIBUTING.md[^"]*"/, '"reason": ""'),
      ],
      [
        'ci deviation example tier corruption',
        'ci',
        checkCiGuidance,
        (text) => text.replace('"defaultTier": "merge"', '"defaultTier": "nightly"'),
      ],
      [
        'ci gates config rewrite',
        'ci',
        checkCiGuidance,
        (text) => text.replace('"allowlist": ["MIT", "ISC"] }\n}', '"allowlist": ["MIT"] }\n}'),
      ],
      [
        'ci gate check command corruption',
        'ci',
        checkCiGuidance,
        (text) => text.replace('["eval-quality-gates", "lockfile-age"]', '["lockfile-age"]'),
      ],
      [
        'ci bare command',
        'ci',
        checkCiGuidance,
        (text) => text.replace('`npm exec --prefix {tea_evaluations_folder} -- tea-evaluate compare', '`tea-evaluate compare'),
      ],
      [
        'ci rendering rule restated',
        'ci',
        checkCiGuidance,
        (text) => text.replace('render one job per tier.', 'render one job per tier with `if: always()`.'),
      ],
      [
        'ci manual dispatch wiring removal',
        'ci',
        checkCiGuidance,
        (text) =>
          text.replaceAll('place the live set on `scheduled` with the `trigger` `["manual-dispatch"]`', 'place the live set somewhere'),
      ],
      ['ci re-entry removal', 'ci', checkCiGuidance, (text) => text.replace('edit it in place', 'start again')],
      [
        'ci prerequisite route-back removal',
        'ci',
        checkCiGuidance,
        (text) => text.replace('return to its stage before inspecting CI', 'go on'),
      ],
      [
        'ci hand-off removal',
        'ci',
        checkCiGuidance,
        (text) => text.replace('Invoke `bmad-testarch-ci` in edit mode', 'Tell the adopter about the CI skill'),
      ],
      ['gaps loop removal', 'gaps', (text, found) => checkGapsGuidance(text, engine, found), (text) => text.replace(/^4\. Rerun.*\n/m, '')],
    ];
    for (const [label, file, check, corrupt] of negativeCases) {
      const original = fs.readFileSync(REFERENCE(file), 'utf8');
      const changed = corrupt(original);
      if (changed === original) {
        failures.push(`${label} could not alter its fixture`);
        continue;
      }
      const rejected = [];
      check(changed, rejected);
      if (rejected.length === 0) failures.push(`${label} passed the guidance gate`);
    }
  } catch (error) {
    failures.push(`guidance negative checks: ${error.stack}`);
  }
  // The fixtures carry the shipped probe byte for byte, so what they prove is what adopters copy.
  const shippedProbe = fs.readFileSync(ASSET(path.join('evaluators', 'installed-version.mjs')));
  for (const fixture of ['evaluate-learn/evaluation', 'evaluate-promptfoo/evals/summary', 'evaluate-tool-use-agent/evals/tool-use']) {
    const copy = path.join(__dirname, 'fixtures', fixture, 'evaluator', 'installed-version.mjs');
    if (!fs.existsSync(copy) || !fs.readFileSync(copy).equals(shippedProbe))
      failures.push(`${fixture} does not carry the shipped installed-version.mjs byte for byte`);
  }
  // A fixture declares the version its package had when its record was written; the floating dependency moving is a deliberate upgrade.
  for (const [fixture, packageName] of [
    ['evaluate-learn/evaluation', 'autoevals'],
    ['evaluate-promptfoo/evals/summary', 'promptfoo'],
    ['evaluate-tool-use-agent/evals/tool-use', 'agentevals'],
  ]) {
    const declared = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', fixture, 'evaluator', 'frameworks.json'), 'utf8'));
    const installed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'node_modules', packageName, 'package.json'), 'utf8')).version;
    if (declared.frameworks[0]?.package !== packageName || declared.frameworks[0].version !== installed)
      failures.push(
        `${fixture} declares ${packageName}@${declared.frameworks[0]?.version}, and ${installed} is installed; a deliberate upgrade updates the fixture's evaluator/frameworks.json and evaluator/LEARNED.md together`,
      );
  }
  checkFrameworkTemplate('agentevals-trajectory.mjs', 'evaluate-tool-use-agent', 'tool-use', 'trajectory.mjs', failures);
  checkFrameworkTemplate('promptfoo-assertions.mjs', 'evaluate-promptfoo', 'summary', 'promptfoo.mjs', failures);

  const template = JSON.parse(fs.readFileSync(ASSET('evaluation.json'), 'utf8'));
  const validateEvaluation = new Ajv({ strict: false, allErrors: true }).compile(
    JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cli', 'lib', 'evaluate', 'schemas', 'evaluation.schema.json'), 'utf8')),
  );
  if (!validateEvaluation(template))
    failures.push(`assets/evaluation.json fails runtime schema: ${JSON.stringify(validateEvaluation.errors)}`);
  if (template.interface === 'web') failures.push('assets/evaluation.json emits web');
  try {
    assert.deepStrictEqual(template.registry?.[0]?.infrastructureExitCodes, [3, 4, 5, 6]);
  } catch (error) {
    failures.push(`assets/evaluation.json starter runner codes changed: ${error.message}`);
  }
  const actualDigest = engine.digestBytes(fs.readFileSync(ASSET('requirements-statement.md')));
  if (template.requirements?.path !== 'requirements.md' || template.requirements.digest !== actualDigest)
    failures.push('assets/evaluation.json requirements path or digest differs from requirements-statement.md bytes');

  if (failures.length > 0) {
    console.error(`evaluate-guidance: ${failures.length} failure(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `evaluate-guidance: ${EXPECTED_STAGES.length} stages, twelve worked guides, 36 engine-valid tagged probes, seven runtime-valid mutations, contract examples, and valid templates`,
  );
}

main().catch((error) => {
  console.error(`evaluate-guidance: ${error.stack}`);
  process.exit(1);
});
