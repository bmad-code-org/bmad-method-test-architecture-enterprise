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
  const actualRows = mappingBody
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| ---'))
    .slice(1)
    .map((line) =>
      line
        .split('|')
        .slice(1, 5)
        .map((cell) => cell.trim()),
    );
  try {
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
  } catch (error) {
    failures.push(`requirements-statement.md must have exactly the six intake sections: ${error.message}`);
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

function checkCorpus(corpus, failures) {
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
  ])
    requireText(corpus, marker, 'corpus.md', failures);

  const kinds = ['Agent', 'Skill', 'Workflow', 'Tool-use system', 'AI feature', 'Test-review mechanism'];
  const headingNames = ['Representative inputs', 'Negative and malformed inputs', 'Gameability design', 'Held-out probe selection'];
  const ordinaryTags = ['representative', 'negative', 'malformed', 'gameability', 'held-out'];
  const malformedKeys = {
    Agent: 'stdin.customerId',
    Skill: 'stdin.amount',
    Workflow: 'argument.reservationId',
    'Tool-use system': 'stdin.amount',
    'AI feature': 'body.answer',
    'Test-review mechanism': 'stdin.testSource',
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
  const validateEngine = ajv.compile(JSON.parse(fs.readFileSync(engineSchemaPath('probe.schema.json'), 'utf8')));
  const baseline = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'evaluate', 'valid', 'baseline', 'probes', 'P-001.probe.json'), 'utf8'),
  );
  const evidence = baseline.qualification.baselinePassEvidence;
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
    const malformedBody = headings.get('Negative and malformed inputs') ?? '';
    for (const marker of [
      `declare \`${malformedKeys[kind.title]}\``,
      'For `malformed-input`',
      '{ matcher: "type-violating" }',
      '/interactions/malformed-input/',
      '`O-003` checks',
    ])
      requireText(malformedBody, marker, `corpus.md ${kind.title} malformed input`, failures);
    for (const match of kind.body.matchAll(/<!-- example:probe -->\s*```json\n([\s\S]*?)\n```/g)) {
      let probe;
      try {
        probe = JSON.parse(match[1]);
      } catch (error) {
        failures.push(`corpus.md ${kind.title} has invalid tagged JSON: ${error.message}`);
        continue;
      }
      const tag = probe.rationale?.match(/^\[([a-z-]+)\]/)?.[1];
      if (!ordinaryTags.includes(tag)) failures.push(`corpus.md ${kind.title} probe ${probe.probeId} has no permitted rationale tag`);
      foundTags.push(tag);
      probes.push(probe);
      if (!validateCommitted(probe))
        failures.push(`corpus.md ${kind.title} ${probe.probeId} fails committed-probe schema: ${JSON.stringify(validateCommitted.errors)}`);
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
        failures.push(`corpus.md ${kind.title} ${probe.probeId} fails eval-quality probe schema: ${JSON.stringify(validateEngine.errors)}`);
    }
    try {
      assert.deepStrictEqual(
        foundTags,
        kind.title === 'Skill' ? ['representative', 'negative', 'malformed', 'negative', 'gameability', 'held-out'] : ordinaryTags,
      );
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
    if (kind.title === 'Skill') {
      for (const id of ['P-002', 'P-003', 'P-006'])
        if (probes.find((probe) => probe.probeId === id)?.behaviorId !== 'B-002')
          failures.push(`corpus.md Skill ${id} must cover critical B-002`);
      if (probes.find((probe) => probe.probeId === 'P-007')?.behaviorId !== 'B-001')
        failures.push('corpus.md Skill needs a B-001 development seed');
      requireText(headings.get('Gameability design') ?? '', "O-002` is B-002's naive decline oracle", 'corpus.md Skill', failures);
      if (
        !gameability?.rationale?.includes("B-002's refusal-only oracle") ||
        seed?.defects?.[0]?.severity !== 'critical' ||
        seed?.defects?.[0]?.manifestationWitness?.relation?.operands?.[0]?.pointer !==
          '/interactions/manifest-rule-fault/stdout/reservationCallCount' ||
        seed?.defects?.[0]?.manifestationWitness?.relation?.operands?.[1]?.literal !== 1 ||
        seed?.defectSignature?.condition?.predicate?.operands?.[0]?.pointer !== '/interactions/observed/stdout/reservationCallCount' ||
        seed?.defectSignature?.condition?.predicate?.operands?.[1]?.literal !== 1
      )
        failures.push('corpus.md Skill must show B-002 no-call evidence and B-001 gameability relation');
    }
    if (
      kind.title === 'Workflow' &&
      (seed?.probeClass !== 'zero-action' ||
        !seed.rationale.includes('suppresses both create and read-back') ||
        seed.defects?.[0]?.manifestationWitness?.relation?.operands?.[1]?.literal !== 0 ||
        seed.defectSignature?.condition?.predicate?.operands?.[1]?.literal !== true)
    )
      failures.push('corpus.md Workflow P-006 must skip all required actions while claiming success');
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
  checkInspection(inspection, failures);
  checkIntake(intake, failures);
  checkCorpus(corpus, failures);

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
  const engine = await loadEngine();
  const actualDigest = engine.digestBytes(fs.readFileSync(ASSET('requirements-statement.md')));
  if (template.requirements?.path !== 'requirements.md' || template.requirements.digest !== actualDigest)
    failures.push('assets/evaluation.json requirements path or digest differs from requirements-statement.md bytes');

  if (failures.length > 0) {
    console.error(`evaluate-guidance: ${failures.length} failure(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `evaluate-guidance: ${EXPECTED_STAGES.length} stages, three worked guides, 31 engine-valid tagged probes, and valid templates`,
  );
}

main().catch((error) => {
  console.error(`evaluate-guidance: ${error.stack}`);
  process.exit(1);
});
