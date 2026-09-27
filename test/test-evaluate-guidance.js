/**
 * Guards the Evaluate skill's stage list: `SKILL.md` names twelve stages, in
 * order, each pointing at an existing `references/<stage>.md` guide. Stories
 * 1.12 to 1.14, 1.23 and 2.4 extend this file as those guides gain real
 * content and craft.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const AjvModule = require('ajv/dist/2020');
const { engineCliPath, engineSchemaPath, loadEngine } = require('../cli/lib/evaluate/engine');
const { calibrationProblems } = require('../cli/lib/evaluate/calibration');

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
    numericContract.behaviors[0].description = 'The numeric-amount command refuses an amount whose JSON type is not number.';
    numericContract.behaviors[0].observableSuccessCriterion = 'A string amount is refused on stdout with a clean exit.';
    numericContract.behaviors[0].requirementLinks[0].id = 'numeric-amount-type';
    numericContract.behaviors[0].riskLinks[0].id = 'silent-amount-coercion';
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
        assert.strictEqual(typeof JSON.parse(edited.interactionPlan[0].inputBinding.stdin.prompt.literal).amount, 'string');
        assert.match(JSON.stringify(edited.oracles[0].check), /invalid amount/);
        const numericTarget = path.join(__dirname, 'fixtures', 'evaluate', 'numeric-amount.js');
        const refused = spawnSync(process.execPath, [numericTarget], {
          input: edited.interactionPlan[0].inputBinding.stdin.prompt.literal,
          encoding: 'utf8',
        });
        const accepted = spawnSync(process.execPath, [numericTarget], { input: '{"amount":7}', encoding: 'utf8' });
        assert.strictEqual(refused.status, 0, refused.stderr);
        assert.strictEqual(refused.stdout, 'error: invalid amount\n');
        assert.strictEqual(accepted.status, 0, accepted.stderr);
        assert.strictEqual(accepted.stdout, 'accepted amount: 7\n');
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
        const waiver = edited.waivers[0];
        for (const field of ['rule', 'rationale', 'condition', 'approval']) assert.ok(waiver[field]);
        assert.match(waiver.condition, /Number\.isFinite/);
        assert.match(waiver.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
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
    const order = ['tea-evaluate check', 'eval-quality compile', 'eval-quality seal'].map((command) => stage.indexOf(command));
    if (order.some((index) => index < 0) || !(order[0] < order[1] && order[1] < order[2]))
      failures.push('SKILL.md Stage 6 must run check, compile, seal in order');
    for (const marker of ['nonzero exit', 'exit code', 'stderr']) requireText(stage, marker, 'SKILL.md Stage 6', failures);

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

  const referencedStages = [...workflowSection.matchAll(/references\/([a-z-]+)\.md/g)].map((match) => match[1]);
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

  // Later stages remain placeholders; the stop and verdict boundaries still
  // apply to those stages.
  if (!workflowSection.includes('stop')) {
    failures.push("SKILL.md's Workflow section has no rule to stop on a placeholder stage guide");
  }
  if (!workflowSection.includes('never compute a verdict')) {
    failures.push("SKILL.md's Workflow section has no rule against computing a verdict outside eval-quality's CLI");
  }

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
    `evaluate-guidance: ${EXPECTED_STAGES.length} stages, six worked guides, 36 engine-valid tagged probes, contract examples, and valid templates`,
  );
}

main().catch((error) => {
  console.error(`evaluate-guidance: ${error.stack}`);
  process.exit(1);
});
