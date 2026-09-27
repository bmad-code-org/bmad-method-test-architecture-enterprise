/**
 * Guards the Evaluate skill's stage list: `SKILL.md` names twelve stages, in
 * order, each pointing at an existing `references/<stage>.md` guide. Stories
 * 1.12 to 1.14, 1.23 and 2.4 extend this file as those guides gain real
 * content and craft.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AjvModule = require('ajv/dist/2020');
const { engineSchemaPath, loadEngine } = require('../cli/lib/evaluate/engine');

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
  for (const family of families) {
    requireHeading(intake, `## ${family}`, 'intake.md', failures);
    requireHeading(statement, `## ${family}`, 'requirements-statement.md', failures);
    const body = sections(intake, 2).find((section) => section.title === family)?.body ?? '';
    if (!body.includes('Ask:') || !body.includes('Worked answer:')) failures.push(`intake.md ${family} lacks a question or worked answer`);
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
          'Review reservation amount 100 against the documented limit 100.'
      )
        failures.push('corpus.md Skill P-007 must bind the eligible reservation input');
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
      if (
        comparisonSeed?.behaviorId !== 'B-002' ||
        comparisonSeed?.expectedClean !== false ||
        comparisonSeed?.qualification?.route !== 'controlled-mutation' ||
        comparisonSeed?.qualification?.mutation !== 'M-002' ||
        comparisonSeed?.defects?.[0]?.behaviorId !== 'B-002' ||
        comparisonSeed?.defects?.[0]?.manifestationWitness == null
      )
        failures.push(`corpus.md ${kind.title} P-007 must seed B-002 with a non-null manifestation witness`);
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
          'An answer containing the restricted term at the policy boundary.')
    )
      failures.push('corpus.md AI feature P-006 must bind the policy-boundary answer');
    if (seed?.probeClass === 'zero-action') zeroActionDefectCount += 1;
  }
  if (zeroActionDefectCount === 0) failures.push('corpus.md lacks a worked zero-action defect for a mandatory-action behavior');
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
    `evaluate-guidance: ${EXPECTED_STAGES.length} stages, three worked guides, 36 engine-valid tagged probes, and valid templates`,
  );
}

main().catch((error) => {
  console.error(`evaluate-guidance: ${error.stack}`);
  process.exit(1);
});
