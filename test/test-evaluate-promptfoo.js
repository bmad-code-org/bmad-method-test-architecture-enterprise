/** Deterministic promptfoo assertions imported through Evaluate's judgment rows. */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ENGINE_CLI_ENV } = require('../cli/lib/evaluate/engine');
const { judgmentFromRows } = require('../cli/lib/evaluate/judgment-rows');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'evaluate-promptfoo');
const EVALUATION = path.join('evals', 'summary');
const EVALUATOR = path.join(FIXTURE, EVALUATION, 'evaluator');
const CLI = path.join(ROOT, 'cli', 'evaluate.js');
const STARTER = path.join(
  ROOT,
  'src',
  'workflows',
  'testarch',
  'bmad-testarch-evaluate',
  'assets',
  'evaluators',
  'promptfoo-assertions.mjs',
);
const failures = [];
const UNGRADED = 'ungraded framework error';
const REFUSED = 'is refused:';
const projects = [];
let checks = 0;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== ENGINE_CLI_ENV && !key.startsWith('GIT_')));

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function command(bin, args, options = {}) {
  const result = spawnSync(bin, args, { cwd: ROOT, encoding: 'utf8', timeout: 180_000, env, ...options });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}`, stdout: result.stdout };
}

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function nodeFloor(nvmrc, requirement, runtime = process.version, spawn = () => {}) {
  const match = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(requirement);
  if (!match) throw new Error(`unsupported promptfoo Node requirement ${requirement}`);
  const minimum = match.slice(1).map(Number);
  for (const [source, version] of [
    ['.nvmrc', fs.readFileSync(nvmrc, 'utf8').trim()],
    ['running Node', runtime],
  ]) {
    const parts = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/
      .exec(version)
      ?.slice(1)
      .map((part) => Number(part ?? 0));
    if (!parts) {
      throw new Error(`promptfoo requires Node ${requirement}; ${source} selects ${version}`);
    }
    const difference = parts.findIndex((part, index) => part !== minimum[index]);
    if (difference !== -1 && parts[difference] < minimum[difference]) {
      throw new Error(`promptfoo requires Node ${requirement}; ${source} selects ${version}`);
    }
  }
  spawn();
}

function engine() {
  const packageFile = path.join(ROOT, 'node_modules', 'promptfoo', 'package.json');
  const installed = read(packageFile);
  const requirement = installed.engines.node;
  check(read(path.join(ROOT, 'package.json')).devDependencies.promptfoo === 'latest', 'promptfoo must use the latest spec');
  check(installed.license === 'MIT', `promptfoo ${installed.version} has licence ${installed.license}`);
  let spawned = false;
  nodeFloor(path.join(ROOT, '.nvmrc'), requirement, process.version, () => {
    spawned = true;
  });
  check(spawned, 'the repository Node major failed promptfoo engine preflight');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-promptfoo-node-'));
  try {
    const minimum = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(requirement);
    const floor = minimum.slice(1).join('.');
    const below =
      Number(minimum[3]) > 0
        ? `${minimum[1]}.${minimum[2]}.${Number(minimum[3]) - 1}`
        : Number(minimum[2]) > 0
          ? `${minimum[1]}.${Number(minimum[2]) - 1}.99`
          : `${Number(minimum[1]) - 1}.99.99`;
    fs.writeFileSync(path.join(temp, '.nvmrc'), `${floor}\n`);
    spawned = false;
    nodeFloor(path.join(temp, '.nvmrc'), requirement, `v${floor}`, () => {
      spawned = true;
    });
    check(spawned, `the exact Node floor ${floor} was rejected`);
    fs.writeFileSync(path.join(temp, '.nvmrc'), `${below}\n`);
    spawned = false;
    let message = '';
    try {
      nodeFloor(path.join(temp, '.nvmrc'), requirement, process.version, () => {
        spawned = true;
      });
    } catch (error) {
      message = error.message;
    }
    check(
      message.includes(`promptfoo requires Node ${requirement}`),
      `the insufficient Node major did not name ${requirement}: ${message}`,
    );
    check(!spawned, 'the insufficient .nvmrc Node version spawned promptfoo');
    fs.writeFileSync(path.join(temp, '.nvmrc'), `${floor}\n`);
    spawned = false;
    message = '';
    try {
      nodeFloor(path.join(temp, '.nvmrc'), requirement, `v${below}`, () => {
        spawned = true;
      });
    } catch (error) {
      message = error.message;
    }
    check(message.includes('running Node') && message.includes(requirement), `the running Node floor was not reported: ${message}`);
    check(!spawned, 'the insufficient running Node spawned promptfoo');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  return installed;
}

function observed(stdout) {
  return { observationId: 'trial-1-summarize', stdout: { kind: 'text', value: stdout } };
}

function directEvaluator() {
  const file = path.join(EVALUATOR, 'promptfoo.mjs');
  for (const [label, stdout, expected] of [
    ['clean', 'Summary for List pantry: apples, pears\n', ['pass', 'pass', 'pass']],
    ['omitted item', 'Summary for List pantry: apples\n', ['pass', 'fail', 'pass']],
    ['forbidden item', 'Summary for List pantry: apples, pears, shellfish\n', ['pass', 'pass', 'fail']],
  ]) {
    const result = command(file, [], { input: JSON.stringify({ sealedBrief: {}, observations: [observed(stdout)] }) });
    check(result.status === 0, `${label}: evaluator exited ${result.status}: ${result.output}`);
    if (result.status !== 0) continue;
    const rows = JSON.parse(result.stdout).rows;
    check(
      rows.length === 3 && rows.map((row) => row.outcome).join(',') === expected.join(','),
      `${label}: wrong assertion rows ${JSON.stringify(rows)}`,
    );
    check(
      rows.every((row) => row.observationIds[0] === 'trial-1-summarize'),
      `${label}: a row lost the stdout observation`,
    );
    for (const row of rows.filter((item) => item.outcome === 'fail')) {
      check(row.quoteChannel === 'stdout' && stdout.includes(row.quote), `${label}: failed row does not quote observed stdout`);
    }
    if (label === 'forbidden item') {
      check(rows[2]?.key === 'forbidden-shellfish', `forbidden item mapped to ${rows[2]?.key}`);
      const judgment = judgmentFromRows({
        contract: read(path.join(FIXTURE, EVALUATION, 'contract.json')),
        mapping: read(path.join(EVALUATOR, 'mapping.json')),
        answer: { rows },
        probeId: 'P-003',
        behaviorIds: ['B-003'],
      });
      check(
        judgment.findings.some((finding) => finding.oracleId === 'O-003'),
        'forbidden shellfish did not map to O-003',
      );
    }
  }
  const source = fs.readFileSync(file, 'utf8');
  for (const flag of [
    '--assertions',
    '--model-outputs',
    '--output',
    '--no-cache',
    'PROMPTFOO_DISABLE_TELEMETRY',
    'PROMPTFOO_DISABLE_UPDATE',
  ]) {
    check(source.includes(flag), `evaluator omitted promptfoo control ${flag}`);
  }
  check(!source.includes('...process.env'), 'evaluator passed inherited credentials to promptfoo');
  const assertionTypes = [...fs.readFileSync(path.join(EVALUATOR, 'asserts.yaml'), 'utf8').matchAll(/^- type: (\S+)/gm)].map(
    (match) => match[1],
  );
  check(
    assertionTypes.length === 3 && assertionTypes.every((type) => ['contains', 'not-contains'].includes(type)),
    `fixture assertions require a model or changed shape: ${assertionTypes.join(', ')}`,
  );
}

function childInvocation() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-promptfoo-spawn-'));
  try {
    const preload = path.join(temporary, 'capture.cjs');
    const captureFile = path.join(temporary, 'spawn.json');
    fs.writeFileSync(
      preload,
      `const child = require('node:child_process');
const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const original = child.spawnSync;
child.spawnSync = (...arguments_) => {
  fs.writeFileSync(process.env.TEA_PROMPTFOO_CAPTURE, JSON.stringify({ executable: arguments_[0], args: arguments_[1], options: arguments_[2] }));
  return original(...arguments_);
};
syncBuiltinESMExports();
`,
    );
    const stdout = 'Summary for List pantry: apples, pears\n';
    const result = command(path.join(EVALUATOR, 'promptfoo.mjs'), [], {
      input: JSON.stringify({ sealedBrief: {}, observations: [observed(stdout)] }),
      env: {
        ...env,
        NODE_OPTIONS: `--require=${preload}`,
        TEA_PROMPTFOO_CAPTURE: captureFile,
        OPENAI_API_KEY: 'must-not-reach-promptfoo',
        ANTHROPIC_API_KEY: 'must-not-reach-promptfoo',
      },
    });
    check(result.status === 0, `captured evaluator exited ${result.status}: ${result.output}`);
    check(fs.existsSync(captureFile), 'evaluator did not spawn a captured promptfoo child');
    if (!fs.existsSync(captureFile)) return;
    const capture = read(captureFile);
    check(capture.executable === process.execPath, `promptfoo child used ${capture.executable}`);
    const installed = read(path.join(ROOT, 'node_modules', 'promptfoo', 'package.json'));
    const entrypoint = capture.args?.[0];
    check(
      entrypoint !== undefined &&
        fs.existsSync(entrypoint) &&
        fs.realpathSync.native(entrypoint) ===
          fs.realpathSync.native(path.join(ROOT, 'node_modules', 'promptfoo', installed.bin.promptfoo)),
      `promptfoo child used ${entrypoint}`,
    );
    check(
      JSON.stringify(capture.args.slice(1)) ===
        JSON.stringify([
          'eval',
          '--assertions',
          'asserts.yaml',
          '--model-outputs',
          'outputs.json',
          '--output',
          'results.jsonl',
          '--no-cache',
          '--no-write',
          '--no-table',
        ]),
      `promptfoo child arguments changed: ${capture.args.join(' ')}`,
    );
    check(capture.options?.cwd.startsWith(os.tmpdir()), `promptfoo child wrote under ${capture.options?.cwd}`);
    check(capture.options?.env.PROMPTFOO_DISABLE_TELEMETRY === '1', 'promptfoo child enabled telemetry');
    check(capture.options?.env.PROMPTFOO_DISABLE_UPDATE === '1', 'promptfoo child enabled update checks');
    check(
      JSON.stringify(Object.keys(capture.options.env).sort()) ===
        JSON.stringify(['HOME', 'LANG', 'PATH', 'PROMPTFOO_DISABLE_TELEMETRY', 'PROMPTFOO_DISABLE_UPDATE', 'TMPDIR'].sort()),
      `promptfoo child environment changed: ${Object.keys(capture.options.env).join(', ')}`,
    );
    check(
      ['NODE_OPTIONS', 'TEA_PROMPTFOO_CAPTURE', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'].every((key) => !(key in capture.options.env)),
      'promptfoo child inherited evaluator credentials or the capture hook',
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function promptfooResult(assertionFile, stdout, expectedStatus = 0, companions = [], inspect = () => {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-promptfoo-shape-'));
  try {
    fs.writeFileSync(path.join(temporary, 'outputs.json'), JSON.stringify([stdout]));
    fs.copyFileSync(path.join(EVALUATOR, assertionFile), path.join(temporary, 'asserts.yaml'));
    for (const companion of companions) fs.copyFileSync(path.join(EVALUATOR, companion), path.join(temporary, companion));
    const result = command(
      path.join(ROOT, 'node_modules', '.bin', 'promptfoo'),
      [
        'eval',
        '--assertions',
        'asserts.yaml',
        '--model-outputs',
        'outputs.json',
        '--output',
        'results.jsonl',
        '--no-cache',
        '--no-write',
        '--no-table',
      ],
      {
        cwd: temporary,
        env: { ...env, PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_UPDATE: '1' },
      },
    );
    check(
      result.status === expectedStatus,
      `${assertionFile}: promptfoo exited ${result.status}, expected ${expectedStatus}: ${result.output}`,
    );
    const file = path.join(temporary, 'results.jsonl');
    check(fs.existsSync(file), `${assertionFile}: promptfoo produced no JSONL: ${result.output}`);
    inspect(temporary);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8').trim()) : null;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function mapResults(results, observation) {
  const result = command(path.join(EVALUATOR, 'promptfoo.mjs'), ['--map-results'], {
    input: JSON.stringify({ results, observation }),
  });
  check(result.status === 0, `promptfoo result import exited ${result.status}: ${result.output}`);
  return result.status === 0 ? JSON.parse(result.stdout).rows : [];
}

function refuseResults(results, observation, expected, status, omitted) {
  const result = command(path.join(EVALUATOR, 'promptfoo.mjs'), ['--map-results'], {
    input: JSON.stringify({ results, observation, status }),
  });
  const required = Array.isArray(expected) ? expected : [expected];
  check(
    result.status !== 0 && required.every((message) => result.output.includes(message)),
    `promptfoo accepted invalid results or lost ${required.join(' and ')}: ${result.output}`,
  );
  check(!result.stdout.includes('"rows"'), `a refused result printed judgment rows: ${result.stdout}`);
  if (omitted !== undefined) check(!result.output.includes(omitted), `the refusal printed ${omitted}: ${result.output}`);
}

function resultShapes() {
  const stdout = 'Summary for List pantry: apples, pears\n';
  const observation = observed(stdout);
  const multi = promptfooResult('asserts.yaml', stdout);
  check(multi?.gradingResult?.componentResults?.length === 3, 'installed promptfoo did not emit three componentResults');
  if (multi) {
    const rows = mapResults([multi], observation);
    check(
      rows.map((row) => row.key).join(',') === 'required-apples,required-pears,forbidden-shellfish',
      'multi-assertion import lost a judgment',
    );
    const withoutComponents = structuredClone(multi);
    delete withoutComponents.gradingResult.componentResults;
    refuseResults([withoutComponents], observation, 'incomplete multi-assertion grade');
    const partial = structuredClone(multi);
    partial.gradingResult.componentResults.pop();
    refuseResults([partial], observation, 'incomplete multi-assertion grade');
    const repeated = structuredClone(multi);
    repeated.gradingResult.componentResults[1] = repeated.gradingResult.componentResults[0];
    refuseResults([repeated], observation, 'unique expected assertion');
    const missingPass = structuredClone(multi);
    delete missingPass.gradingResult.componentResults[1].pass;
    refuseResults([missingPass], observation, 'without a boolean pass');
    const conflictingMetric = structuredClone(multi);
    conflictingMetric.testCase.assert[0].metric = 'required-pears';
    refuseResults([conflictingMetric], observation, 'metric conflicts with its type and value');
    check(
      rows.map((row) => row.outcome).join(',') === 'pass,pass,pass' && rows.every((row) => row.quote === undefined),
      `graded passes lost their meaning: ${JSON.stringify(rows)}`,
    );
    const ungradedMulti = structuredClone(multi);
    delete ungradedMulti.gradingResult;
    refuseResults([ungradedMulti], observation, UNGRADED);
    ungradedMulti.gradingResult = null;
    refuseResults([ungradedMulti], observation, UNGRADED);
    ungradedMulti.error = 'deliberate multi-assertion evaluation error';
    refuseResults([ungradedMulti], observation, [UNGRADED, 'deliberate multi-assertion evaluation error']);
    ungradedMulti.error = 'first line\nsecond line of a stack';
    refuseResults([ungradedMulti], observation, [UNGRADED, 'first line'], undefined, 'second line of a stack');
    refuseResults([multi, ungradedMulti], observation, UNGRADED);
    ungradedMulti.response.output = 'different stdout';
    refuseResults([ungradedMulti], observation, 'output differs from the cited stdout');
    ungradedMulti.error = '  ';
    ungradedMulti.response.output = stdout;
    refuseResults([ungradedMulti], observation, UNGRADED);
    const onlyOneGraded = structuredClone(multi);
    onlyOneGraded.gradingResult.componentResults.splice(1);
    refuseResults([onlyOneGraded], observation, 'incomplete multi-assertion grade');
    const gradedWithError = structuredClone(multi);
    gradedWithError.error = 'promptfoo reports its failure reason here as well';
    check(mapResults([gradedWithError], observation).length === 3, 'an error string beside a complete grade set lost the graded rows');
    const noOutput = structuredClone(multi);
    delete noOutput.response.output;
    refuseResults([noOutput], observation, 'graded output other than the cited stdout');
    const wrongOutput = structuredClone(multi);
    wrongOutput.response.output = 'Summary for another request';
    refuseResults([wrongOutput], observation, 'output differs from the cited stdout');
    refuseResults([multi], observation, 'before completing evaluation', 2);
  }
  const failed = promptfooResult('asserts.yaml', 'Summary for List pantry: apples\n', 100);
  check(
    failed?.gradingResult?.componentResults?.some((component) => component.pass === false),
    'installed promptfoo did not fail the omitted-item assertion',
  );
  if (failed) {
    const failedStdout = 'Summary for List pantry: apples\n';
    const failedRows = mapResults([failed], observed(failedStdout));
    check(
      failedRows.map((row) => `${row.key}:${row.outcome}`).join(',') ===
        'required-apples:pass,required-pears:fail,forbidden-shellfish:pass',
      `a graded fail changed meaning: ${JSON.stringify(failedRows)}`,
    );
    const failedRow = failedRows.find((row) => row.outcome === 'fail');
    check(
      failedRow?.quote === failedStdout && failedRow?.quoteChannel === 'stdout' && failedRow?.observationIds[0] === 'trial-1-summarize',
      `a graded fail did not cite the observed stdout: ${JSON.stringify(failedRow)}`,
    );
    const withoutReason = structuredClone(failed);
    for (const grade of withoutReason.gradingResult.componentResults) delete grade.reason;
    const reasonless = mapResults([withoutReason], observed(failedStdout));
    check(
      reasonless.find((row) => row.outcome === 'fail')?.comment === 'Assertion failed.' && !JSON.stringify(reasonless).includes('ungraded'),
      `a graded fail without a reason carried stale text: ${JSON.stringify(reasonless)}`,
    );
  }
  const single = promptfooResult('asserts-single.yaml', stdout);
  check(single?.gradingResult?.componentResults?.length === 1, 'installed promptfoo did not emit its single componentResult');
  if (single) {
    const withoutComponents = structuredClone(single);
    delete withoutComponents.gradingResult.componentResults;
    const rows = mapResults([withoutComponents], observation);
    check(
      rows.length === 1 && rows[0].key === 'required-pears' && rows[0].outcome === 'pass',
      'top-level grade fallback lost the single assertion',
    );
    const emptyComponents = structuredClone(single);
    emptyComponents.gradingResult.componentResults = [];
    refuseResults([emptyComponents], observation, 'empty or invalid componentResults');
    const missingTopLevelPass = structuredClone(withoutComponents);
    delete missingTopLevelPass.gradingResult.pass;
    refuseResults([missingTopLevelPass], observation, 'without a boolean pass');
  }
  const errored = promptfooResult('asserts-error.yaml', stdout, 100);
  check(typeof errored?.error === 'string', 'installed promptfoo did not emit the deterministic assertion error');
  if (errored) {
    check(errored.testCase?.assert?.[0]?.metric === 'required-pears', 'the error assertion lost its oracle identity');
    // The installed promptfoo grades a thrown assertion as a failing component: the result carries a grade, and the
    // wrapper refuses it for its assertion type, so the crash text cannot become a target `fail` row.
    check(
      errored.gradingResult?.pass === false && errored.gradingResult.componentResults?.[0]?.pass === false,
      'the thrown JavaScript assertion no longer arrives as a graded failing component',
    );
    refuseResults([errored], observation, [REFUSED, '"javascript"'], undefined, UNGRADED);
    const withoutGrade = structuredClone(errored);
    delete withoutGrade.gradingResult;
    delete withoutGrade.response;
    refuseResults([withoutGrade], observation, [REFUSED, '"javascript"'], undefined, UNGRADED);
  }
  // A code file as an allow-listed assertion's value, and a transform, arrive graded too (a graded failure for text the
  // target never produced); the wrapper refuses both for what they run.
  const crashing = promptfooResult('asserts-code-file.yaml', stdout, 100, ['boom.py']);
  check(
    crashing?.gradingResult?.pass === false && crashing.gradingResult.reason?.includes('deliberate assertion error'),
    `installed promptfoo did not grade a raising Python value as a failure: ${JSON.stringify(crashing?.gradingResult)?.slice(0, 300)}`,
  );
  if (crashing)
    refuseResults([crashing], observation, [REFUSED, '"contains"', '"file://boom.py"', 'loads adopter code'], undefined, UNGRADED);
  const rewritten = promptfooResult('asserts-transform.yaml', stdout, 100);
  check(
    rewritten?.gradingResult?.pass === false && stdout.includes('pears') && rewritten.testCase?.assert?.[0]?.transform !== undefined,
    'installed promptfoo did not grade the rewritten output of a transform as a failure for an output that holds the value',
  );
  if (rewritten) refuseResults([rewritten], observation, [REFUSED, '"contains"', 'its transform rewrites the output'], undefined, UNGRADED);
  // A template value runs promptfoo's nunjucks engine, which reaches Function: this one writes `marker` in promptfoo's
  // working directory (the temporary directory) and decides the expected value, so a graded failure follows from code the
  // adopter wrote. The wrapper refuses it with the code already run.
  let templateRan = false;
  const templated = promptfooResult('asserts-template.yaml', stdout, 100, [], (directory) => {
    templateRan = fs.existsSync(path.join(directory, 'marker'));
  });
  check(templateRan, 'installed promptfoo did not run the code of a template value');
  check(
    templated?.gradingResult?.pass === false,
    `a template value did not arrive as a graded failure: ${JSON.stringify(templated?.gradingResult)?.slice(0, 200)}`,
  );
  // A zero weight turns the failure of an assertion into a pass.
  const weightless = promptfooResult('asserts-weight.yaml', stdout);
  check(
    weightless?.gradingResult?.pass === true &&
      weightless.gradingResult.componentResults?.[0]?.reason === 'Expected output to contain "figs"',
    `installed promptfoo did not turn a failed assertion of weight 0 into a pass: ${JSON.stringify(weightless?.gradingResult)?.slice(0, 200)}`,
  );
  // A pattern that does not compile is graded a failure.
  const invalidPattern = promptfooResult('asserts-regex.yaml', stdout, 100);
  check(
    invalidPattern?.gradingResult?.pass === false && /Invalid regex pattern/.test(invalidPattern.gradingResult.reason ?? ''),
    `installed promptfoo did not grade an invalid pattern as a failure: ${JSON.stringify(invalidPattern?.gradingResult)?.slice(0, 200)}`,
  );
  const starterFile = evaluatorFiles().starter;
  for (const [real, messages] of [
    [templated, [REFUSED, '"not-contains"', 'is a template promptfoo renders, which can run code']],
    [weightless, [REFUSED, '"contains"', 'a zero weight turns a failed assertion into a pass']],
    [invalidPattern, [REFUSED, '"regex"', 'does not compile']],
  ]) {
    if (!real) continue;
    refuseResults([real], observation, messages, undefined, UNGRADED);
    // The starter maps by metric alone, so without its guard each of these results becomes a row.
    const [outcome] = importBatch(starterFile, [[real]], observation).outcomes;
    check(
      messages.every((message) => outcome.message?.includes(message)),
      `starter: a real promptfoo result lost its refusal ${messages.join(', ')}: ${JSON.stringify(outcome).slice(0, 200)}`,
    );
  }
  // promptfoo returns no grade at all when an allow-listed assertion has no usable value: the shape Story 1.43 refuses.
  // The fixture maps assertions by type and value, so the assertion list is set to the keyed one before the import:
  // the refusal under test is the ungraded result.
  const ungradedReal = promptfooResult('asserts-ungraded.yaml', stdout, 100);
  check(
    ungradedReal !== null &&
      (ungradedReal.gradingResult === undefined || ungradedReal.gradingResult === null) &&
      typeof ungradedReal.error === 'string' &&
      ungradedReal.error.includes('must have a string or number value'),
    `installed promptfoo did not return an ungraded row for an object value: ${JSON.stringify(ungradedReal)?.slice(0, 300)}`,
  );
  if (ungradedReal) {
    check(ungradedReal.testCase?.assert?.[0]?.metric === 'required-pears', 'the ungraded assertion lost its oracle identity');
    ungradedReal.testCase.assert[0].value = 'pears';
    refuseResults([ungradedReal], observation, [UNGRADED, 'must have a string or number value']);
    const unidentified = structuredClone(ungradedReal);
    unidentified.testCase.assert[0].value = 'unmapped';
    delete unidentified.testCase.assert[0].metric;
    refuseResults([unidentified], observation, 'unknown, or repeated assertion metadata');
    const unknownType = structuredClone(ungradedReal);
    unknownType.testCase.assert[0].type = 'equals';
    refuseResults([unknownType], observation, 'metric conflicts with its type and value');
    const noError = structuredClone(ungradedReal);
    delete noError.error;
    refuseResults([noError], observation, [UNGRADED, 'no error reported']);
    // The diagnostic carries the first 200 characters of the first line and nothing after them.
    const long = structuredClone(ungradedReal);
    long.error = 'x'.repeat(500);
    refuseResults([long], observation, [UNGRADED, `(${'x'.repeat(200)})`], undefined, 'x'.repeat(201));
    long.error = `first line\n${'y'.repeat(50)}`;
    refuseResults([long], observation, [UNGRADED, '(first line)'], undefined, 'y'.repeat(50));
  }
}

// The import functions of both evaluators: the fixture's own and the skill's starter beside a copy of the fixture's
// mapping.json (the starter reads it). A child process imports the module and runs every case of a batch, which keeps
// the test free of a computed import and costs one process start for thousands of cases.
let evaluatorFileCache;
function evaluatorFiles() {
  if (evaluatorFileCache) return evaluatorFileCache;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-promptfoo-starter-'));
  projects.push(directory);
  fs.copyFileSync(STARTER, path.join(directory, 'promptfoo-assertions.mjs'));
  fs.copyFileSync(path.join(EVALUATOR, 'mapping.json'), path.join(directory, 'mapping.json'));
  evaluatorFileCache = { fixture: path.join(EVALUATOR, 'promptfoo.mjs'), starter: path.join(directory, 'promptfoo-assertions.mjs') };
  return evaluatorFileCache;
}

const BATCH_DRIVER = `
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const evaluator = await import(pathToFileURL(process.env.TEA_BATCH_MODULE).href);
const { batches, observation } = JSON.parse(fs.readFileSync(0, 'utf8'));
const outcomes = batches.map((results) => {
  try {
    return { rows: evaluator.rowsFromResults(results, observation) };
  } catch (error) {
    return { message: error.message };
  }
});
process.stdout.write(JSON.stringify({ outcomes, allowed: evaluator.ALLOWED_ASSERTION_TYPES }));
`;

// One refusal message (empty when the results import) and the rows, for each list of results, in one child process.
function importBatch(file, batches, observation = OBSERVATION) {
  const result = command(process.execPath, ['--input-type=module', '-e', BATCH_DRIVER], {
    env: { ...env, TEA_BATCH_MODULE: file },
    input: JSON.stringify({ batches, observation }),
    maxBuffer: 256 * 1024 * 1024,
  });
  check(result.status === 0, `the batch import of ${path.basename(file)} exited ${result.status}: ${result.output.slice(0, 300)}`);
  if (result.status !== 0) return { outcomes: batches.map(() => ({ message: 'batch failed' })), allowed: [] };
  return JSON.parse(result.stdout);
}

const OUTPUT = 'Summary for List pantry: apples, pears';
const OBSERVATION = observed(`${OUTPUT}\n`);
const APPLES = { type: 'contains', value: 'apples', metric: 'required-apples' };
const PEARS = { type: 'contains', value: 'pears', metric: 'required-pears' };
const SHELLFISH = { type: 'not-contains', value: 'shellfish', metric: 'forbidden-shellfish' };

function resultOf(assertions, extra = {}) {
  return { response: { output: OUTPUT }, testCase: { assert: assertions }, ...extra };
}

function gradedOf(assertions, passes = assertions.map(() => true)) {
  return resultOf(assertions, {
    gradingResult: {
      pass: passes.every(Boolean),
      componentResults: assertions.map((assertion, index) => ({ assertion, pass: passes[index], reason: 'graded' })),
    },
  });
}

// One assertion placed first, third of three, in a second result after a graded first one and as the third assertion of
// a second result, so a refusal is tried beyond the first element.
function placements(assertion) {
  return [
    ['first', [resultOf([assertion])]],
    ['third assertion', [resultOf([APPLES, PEARS, assertion])]],
    ['second result', [gradedOf([PEARS]), resultOf([assertion])]],
    ['second result, third assertion', [gradedOf([APPLES, PEARS, SHELLFISH]), resultOf([APPLES, PEARS, assertion])]],
  ];
}

// Each case is [value, refused as a string value, refused as an element of an array value]. The verdicts follow the
// installed promptfoo 0.123.1: a string `file://` value splits at its first colon and the resolved path runs as code when it
// ends in `.js`, `.cjs`, `.mjs`, `.ts`, `.cts` or `.mts` (any case), `.py` or `.rb`; any other extension is data or an
// error; an array element is read as data only, and a `package:` element is a literal string.
const REFERENCES = [
  ['file://boom.py', true, true],
  ['file://boom.rb', true, true],
  ['file://boom.js', true, true],
  ['file://boom.cjs', true, true],
  ['file://boom.mjs', true, true],
  ['file://boom.ts', true, true],
  ['file://boom.cts', true, true],
  ['file://boom.mts', true, true],
  ['file://x.mjs:pick', true, true],
  ['file://boom.py:fn', true, true],
  ['file://boom.py:fn:more', true, true],
  ['file://x.PY', true, true],
  ['file://x.Rb', true, true],
  ['file://x.MJS', true, true],
  ['file://dir/sub/boom.py', true, true],
  ['file:///absolute/boom.py', true, true],
  ['file://boom.py/', true, true],
  ['file://./sub/../boom.py', true, true],
  ['file://.py', true, true],
  ['package:pkg:fn', true, false],
  ['package:x:y', true, false],
  ['package:', true, false],
  ['file://list.json', false, false],
  ['file://list.yaml', false, false],
  ['file://list.yml', false, false],
  ['file://words.txt', false, false],
  ['file://x.py.txt', false, false],
  ['file://x.pyc', false, false],
  ['file://x.pyx', false, false],
  ['file://x.rbx', false, false],
  ['file://x.jsx', false, false],
  ['file://dir.py/data.json', false, false],
  ['file://dir.js/words.txt', false, false],
  ['file://boom.py.', false, false],
  ['file://boom', false, false],
  ['file://xpy', false, false],
  ['file://x.json:boom.py', false, false],
  ['FILE://boom.py', false, false],
  ['file:/boom.py', false, false],
  [' file://boom.py', false, false],
  ['pears', false, false],
  ['package', false, false],
  ['packages:x', false, false],
  ['Package:x', false, false],
  [' package:x', false, false],
  ['a package: reference', false, false],
];

// Strings promptfoo renders through nunjucks (refused) and near misses it renders to themselves (admitted).
const TEMPLATES = [
  ['{{ output }}', true],
  ['{{output}}', true],
  ['{# comment #}pears', true],
  ['{% if true %}pears{% endif %}', true],
  ['{%- set x = 1 -%}pears', true],
  ['pears {{', true],
  ['{# ', true],
  ['{{ range.constructor("return 1")() }}', true],
  ['file://list.json{{', true],
  ['[{][{]', false],
  [String.raw`\{\{user`, false],
  ['{pears}', false],
  ['{ {', false],
  ['{', false],
  ['}} {', false],
  ['#{', false],
  ['{ %', false],
  ['%}', false],
  ['{x}}', false],
];

// Patterns `new RegExp` rejects (refused for `regex` and `not-regex`) and patterns it takes.
const PATTERNS = [
  ['[', true],
  ['(', true],
  ['*', true],
  ['(?<', true],
  ['a{2,1}', true],
  ['pears', false],
  ['^Summary', false],
  ['[ab]', false],
  ['a{2}', false],
  ['(?:x|y)', false],
];

const WEIGHTS = [
  [0, true],
  [1, false],
  [0.5, false],
  [2, false],
  ['0', false],
  [null, false],
  [undefined, false],
];

const TRANSFORMS = [
  ["output.replace('pears', 'figs')", true],
  ['output.notAFunction()', true],
  ['file://rewrite.js', true],
  ['', true],
  [0, true],
  [false, true],
  [null, false],
  [undefined, false],
];

const named = (type) => (typeof type === 'string' ? JSON.stringify(type) : '(none)');
const refused = (message) => message.includes(REFUSED);

// Every case of one evaluator: [label, results, verify(outcome)], run in one batch.
function guardCases() {
  const cases = [];
  const add = (label, results, verify) => cases.push([label, results, verify]);
  // A type outside the allow-list, by itself, in each placement.
  const types = [
    'javascript',
    'python',
    'ruby',
    'webhook',
    'not-javascript',
    'llm-rubric',
    'g-eval',
    'factuality',
    'levenshtein',
    'word-count',
    'assert-set',
    'not-not-contains',
    'Contains',
    'not-',
    '',
    5,
    null,
    undefined,
  ];
  for (const type of types) {
    for (const [where, results] of placements({ type, value: 'x', metric: 'forbidden-shellfish' })) {
      add(
        `type ${String(type)} (${where})`,
        results,
        ({ message = '' }) =>
          refused(message) &&
          message.includes(`type ${named(type)}`) &&
          message.includes('contains, icontains') &&
          message.includes('command evaluator'),
      );
    }
  }
  // A value that loads code, as a string and as an element of an array, for a type and its `not-` form.
  for (const [reference, asString, asElement] of REFERENCES) {
    for (const [type, value, expected] of [
      ['contains', reference, asString],
      ['not-icontains', reference, asString],
      ['contains-any', ['pears', reference], asElement],
      ['not-contains-all', [reference], asElement],
    ]) {
      for (const [where, results] of placements({ type, value, metric: 'forbidden-shellfish' })) {
        add(
          `${type} with ${JSON.stringify(value)} (${where}) should be ${expected ? 'refused' : 'admitted'}`,
          results,
          ({ message = '' }) =>
            expected
              ? refused(message) &&
                message.includes(`assertion ${named(type)}`) &&
                message.includes('loads adopter code') &&
                message.includes(JSON.stringify(reference))
              : !refused(message),
        );
      }
    }
  }
  // A template, as a string value and as an element of an array value, for a type and its `not-` form.
  for (const [template, expected] of TEMPLATES) {
    for (const [type, value] of [
      ['contains', template],
      ['not-icontains', template],
      ['contains-any', ['pears', template]],
      ['not-contains-all', [template]],
    ]) {
      for (const [where, results] of placements({ type, value, metric: 'forbidden-shellfish' })) {
        add(
          `${type} with ${JSON.stringify(value)} (${where}) should be ${expected ? 'refused' : 'admitted'}`,
          results,
          ({ message = '' }) =>
            expected
              ? refused(message) &&
                message.includes(`assertion ${named(type)}`) &&
                message.includes('is a template promptfoo renders, which can run code') &&
                message.includes('escaped braces') &&
                message.includes(JSON.stringify(template))
              : !refused(message),
        );
      }
    }
  }
  // A pattern that does not compile, for `regex` and `not-regex`; other types take any text.
  for (const [pattern, expected] of PATTERNS) {
    for (const type of ['regex', 'not-regex', 'contains']) {
      const wanted = expected && type !== 'contains';
      for (const [where, results] of placements({ type, value: pattern, metric: 'forbidden-shellfish' })) {
        add(
          `${type} with pattern ${JSON.stringify(pattern)} (${where}) should be ${wanted ? 'refused' : 'admitted'}`,
          results,
          ({ message = '' }) =>
            wanted
              ? refused(message) &&
                message.includes(`assertion ${named(type)}`) &&
                message.includes('does not compile') &&
                message.includes(JSON.stringify(pattern))
              : !refused(message),
        );
      }
    }
  }
  // A weight of zero.
  for (const [weight, expected] of WEIGHTS) {
    for (const type of ['contains', 'not-regex']) {
      for (const [where, results] of placements({ type, value: 'pears', metric: 'forbidden-shellfish', weight })) {
        add(
          `${type} with weight ${JSON.stringify(weight)} (${where}) should be ${expected ? 'refused' : 'admitted'}`,
          results,
          ({ message = '' }) =>
            expected
              ? refused(message) &&
                message.includes(`assertion ${named(type)}`) &&
                message.includes('a zero weight turns a failed assertion into a pass')
              : !refused(message),
        );
      }
    }
  }
  // A transform.
  for (const [transform, expected] of TRANSFORMS) {
    for (const type of ['contains', 'not-regex']) {
      for (const [where, results] of placements({ type, value: 'pears', metric: 'forbidden-shellfish', transform })) {
        add(
          `${type} with transform ${JSON.stringify(transform)} (${where}) should be ${expected ? 'refused' : 'admitted'}`,
          results,
          ({ message = '' }) =>
            expected
              ? refused(message) && message.includes(`assertion ${named(type)}`) && message.includes('its transform rewrites the output')
              : !refused(message),
        );
      }
    }
  }
  // The refusal is the diagnostic whatever else is wrong with the result.
  const bad = { type: 'javascript', value: 'x', metric: 'required-pears' };
  const incomplete = gradedOf([PEARS, bad]);
  incomplete.gradingResult.componentResults.pop();
  for (const [what, result, other] of [
    ['an ungraded row', resultOf([PEARS, bad], { error: 'framework could not grade' }), UNGRADED],
    ['a graded output that differs from stdout', resultOf([PEARS, bad], { response: { output: 'another output' } }), 'output differs'],
    ['an incomplete grade set', incomplete, 'incomplete'],
    ['an unknown metric', resultOf([{ ...PEARS, metric: 'nobody' }, bad]), 'metadata'],
    ['a repeated assertion', resultOf([PEARS, PEARS, bad]), 'repeated'],
  ]) {
    add(
      `${what} hid the refusal`,
      [result],
      ({ message = '' }) => refused(message) && message.includes('"javascript"') && !message.includes(other),
    );
  }
  // Results without assertions to refuse keep their own messages.
  add('an empty assertion list changed its message', [resultOf([])], ({ message = '' }) => message !== '' && !refused(message));
  add('a result without a test case changed its message', [{ response: { output: OUTPUT } }], ({ message = '' }) => !refused(message));
  // The diagnostic quotes a value, and names a type, at most 200 characters.
  add(
    'the quoted value was not capped at 200 characters',
    [resultOf([{ type: 'contains', value: `file://${'x'.repeat(500)}.py`, metric: 'required-pears' }])],
    ({ message = '' }) => message.includes(`"file://${'x'.repeat(193)}"`) && !message.includes('x'.repeat(194)),
  );
  add(
    'the named type was not capped at 200 characters',
    [resultOf([{ type: 'y'.repeat(300), value: 'x', metric: 'required-pears' }])],
    ({ message = '' }) => message.includes(`"${'y'.repeat(200)}"`) && !message.includes('y'.repeat(201)),
  );
  return cases;
}

// Every listed type, and its `not-` form, is one the installed promptfoo defines; every type it defines outside the list is refused.
async function allowList(files) {
  const installed = await import('promptfoo');
  const base = installed.BaseAssertionTypesSchema.options;
  // AssertionTypeSchema ends in a custom() member that accepts any value, so its safeParse cannot tell a real type from a
  // made-up one. Its two enumerating members do: the base enumeration, and the pipe that adds the `not-` prefix.
  const defined = (type) => installed.BaseAssertionTypesSchema.safeParse(type).success;
  const negated = (type) => {
    const parsed = installed.NotPrefixedAssertionTypesSchema.safeParse(type);
    return parsed.success ? parsed.data : undefined;
  };
  check(!defined('not-a-real-type') && negated('not-a-real-type') === undefined, 'the installed type enumeration accepted a made-up type');
  // The contract: the ten types that run no adopter code and call no model. The installed enumeration says which of them
  // exist, and which types outside this list the evaluators must refuse.
  const specified = [
    'contains',
    'icontains',
    'contains-all',
    'contains-any',
    'icontains-all',
    'icontains-any',
    'equals',
    'starts-with',
    'regex',
    'is-json',
  ];
  const sources = Object.fromEntries(['fixture', 'starter'].map((label) => [label, fs.readFileSync(files[label], 'utf8')]));
  const refusalBlock = (source) =>
    source.slice(source.indexOf('// The assertion types that run no adopter code'), source.indexOf('function assertionKey'));
  check(refusalBlock(sources.fixture).length > 1000, 'the fixture lost the refusal block this unit compares');
  check(refusalBlock(sources.fixture) === refusalBlock(sources.starter), 'the fixture and the starter refusal blocks differ');
  const exported = {};
  for (const label of ['fixture', 'starter']) {
    const file = files[label];
    const cases = guardCases();
    const listed = [];
    const probes = [];
    const forms = (types) => types.flatMap((type) => [type, `not-${type}`]);
    // The exported list, by an empty batch first.
    const { allowed } = importBatch(file, []);
    exported[label] = allowed;
    listed.push(...allowed);
    check(
      JSON.stringify(allowed) === JSON.stringify(specified),
      `${label}: the allow-list is ${allowed.join(', ')}, expected ${specified.join(', ')}`,
    );
    const outside = forms(base.filter((type) => !specified.includes(type)));
    const inside = forms(specified);
    for (const form of outside)
      probes.push([
        `${label}: ${form} was not refused`,
        [resultOf([{ type: form, value: 'x', metric: 'required-pears' }])],
        ({ message = '' }) => refused(message) && message.includes(JSON.stringify(form)),
      ]);
    for (const form of inside)
      probes.push([
        `${label}: the listed type ${form} was refused`,
        [resultOf([{ type: form, value: 'pears', metric: 'required-pears' }])],
        ({ message = '' }) => !refused(message),
      ]);
    // The starter maps the graded pass and the graded fail of every listed type and its `not-` form.
    if (label === 'starter') {
      for (const form of inside) {
        for (const passed of [true, false]) {
          probes.push([
            `starter: ${form} graded ${passed}`,
            [gradedOf([{ type: form, value: 'pears', metric: 'required-pears' }], [passed])],
            ({ rows = [] }) =>
              rows.length === 1 &&
              rows[0].key === 'required-pears' &&
              rows[0].outcome === (passed ? 'pass' : 'fail') &&
              (passed ? rows[0].quote === undefined : rows[0].quote === `${OUTPUT}\n` && rows[0].quoteChannel === 'stdout'),
          ]);
        }
      }
    }
    const all = [...cases, ...probes];
    const { outcomes } = importBatch(
      file,
      all.map(([, results]) => results),
    );
    for (const [index, [description, , verify]] of all.entries()) {
      check(verify(outcomes[index]), `${label}: ${description}: ${JSON.stringify(outcomes[index]).slice(0, 220)}`);
    }
    check(listed.length === 10 && new Set(listed).size === 10, `${label}: the allow-list changed size: ${listed.join(', ')}`);
    for (const type of specified) {
      check(defined(type), `${label}: ${type} is not an assertion type of the installed promptfoo`);
      check(negated(type) === `not-${type}`, `${label}: the installed promptfoo does not define ${type} with a not- prefix`);
    }
  }
  check(
    JSON.stringify(exported.fixture) === JSON.stringify(exported.starter),
    `the fixture and the starter list different assertion types: ${exported.fixture} against ${exported.starter}`,
  );
}

function project(edit = () => {}) {
  const root = fs.mkdtempSync(path.join(__dirname, '.tea-promptfoo-'));
  projects.push(root);
  fs.cpSync(FIXTURE, root, { recursive: true });
  const folder = path.join(root, EVALUATION);
  edit(folder);
  const digest = command(process.execPath, [CLI, 'digest', '--evaluation', folder]);
  check(digest.status === 0, `digest failed: ${digest.output}`);
  command('git', ['init', '--quiet', '--initial-branch', 'main'], { cwd: root });
  command('git', ['add', '--all'], { cwd: root });
  const committed = command(
    'git',
    ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', 'commit', '--quiet', '-m', 'fixture'],
    { cwd: root },
  );
  check(committed.status === 0, `fixture commit failed: ${committed.output}`);
  return folder;
}

function latestRun(folder) {
  const runs = path.join(folder, 'runs');
  const name = fs
    .readdirSync(runs)
    .filter((entry) => entry !== '.gitignore' && entry !== '.workspace-journal')
    .sort()
    .at(-1);
  return path.join(runs, name);
}

function votes(run, probeId) {
  const scores = path.join(run, 'scores');
  const name = fs.readdirSync(scores).sort().at(-1);
  const evidence = read(path.join(scores, name, probeId, 'evidence-artifact.json'));
  return evidence.reducedProbeOutcomes[0].trialVotes.map((vote) => vote.state);
}

function pipeline() {
  const folder = project();
  for (const subcommand of ['check', 'preflight', 'run', 'score']) {
    const result = command(process.execPath, [CLI, subcommand, '--evaluation', folder]);
    check(result.status === 0, `${subcommand} exited ${result.status}: ${result.output}`);
    if (result.status !== 0) return;
  }
  const run = latestRun(folder);
  check(sealedRecords(run).length > 0, 'a clean run left no sealed trial records for the refusal cases to compare against');
  const clean = votes(run, 'P-001');
  const mutated = votes(run, 'P-002');
  check(clean.length === 3 && clean.every((state) => state === 'passed-clean-control'), `clean votes: ${clean}`);
  check(mutated.length === 3 && mutated.every((state) => state === 'caught'), `mutated votes: ${mutated}`);
  const index = read(path.join(run, 'trial-sets.json'));
  const set = index.trialSets.find((entry) => entry.probeId === 'P-002');
  check(set?.records.length === 3, `mutated arm has ${set?.records.length} records`);
  for (const relative of set?.records ?? []) {
    const record = read(path.join(run, relative));
    const finding = record.findings.find((item) => item.oracleId === 'O-002');
    const observation = record.observations.find((item) => item.observationId === finding?.observationIds[0]);
    check(
      finding?.quotedEvidence[0]?.channel === 'stdout' && observation?.stdout?.value.includes(finding.quotedEvidence[0].quote),
      `mutation finding does not quote observed stdout: ${JSON.stringify(finding)}`,
    );
  }
  const frameworkFiles = fs
    .readdirSync(path.dirname(folder), { recursive: true })
    .filter((name) => /(?:outputs\.json|results\.jsonl)$/.test(name));
  check(frameworkFiles.length === 0, `promptfoo wrote result files into the adopter tree: ${frameworkFiles.join(', ')}`);
}

function sealedRecords(run) {
  return fs.readdirSync(run, { recursive: true }).filter((name) => name === 'trial-sets.json' || name.split(path.sep)[0] === 'trial-sets');
}

function refusedRuns() {
  const hook = 'const rows = rowsFromResults(results, observation);';
  // The first three cases need no rewrite: promptfoo itself grades each of these assertions, and the wrapper refuses them.
  // The last three rewrite the results after promptfoo returns. No assertion the fixture admits makes promptfoo return a
  // result it cannot grade (a transform did, and is refused), and its grade checks need a result it does not return.
  for (const [label, edit, messages] of [
    ['a thrown JavaScript assertion', ['--error'], [REFUSED, '"javascript"']],
    ['a raising Python file as the value', ['--code-file'], [REFUSED, '"contains"', '"file://boom.py"', 'loads adopter code']],
    ['a rewriting transform', ['--transform'], [REFUSED, '"contains"', 'its transform rewrites the output']],
    [
      'an ungraded row with an error',
      'for (const result of results) {\n      result.gradingResult = null;\n      result.error = "promptfoo could not grade this output";\n    }',
      [UNGRADED, 'promptfoo could not grade this output'],
    ],
    [
      'a partial grade set',
      'for (const result of results) result.gradingResult.componentResults.splice(1);',
      ['incomplete multi-assertion grade'],
    ],
    [
      'a grade without a boolean pass',
      'for (const result of results) delete result.gradingResult.componentResults[1].pass;',
      ['without a boolean pass'],
    ],
  ]) {
    const folder = project((evaluation) => {
      if (Array.isArray(edit)) {
        const manifest = path.join(evaluation, 'evaluation.json');
        const evaluationJson = read(manifest);
        evaluationJson.evaluator.args = edit;
        fs.writeFileSync(manifest, `${JSON.stringify(evaluationJson, null, 2)}\n`);
        return;
      }
      const file = path.join(evaluation, 'evaluator', 'promptfoo.mjs');
      const source = fs.readFileSync(file, 'utf8');
      check(source.includes(hook), 'the fixture evaluator lost the hook the rewritten-run cases use');
      fs.writeFileSync(file, source.replace(hook, `${edit}\n    ${hook}`));
    });
    for (const subcommand of ['preflight']) {
      const prepared = command(process.execPath, [CLI, subcommand, '--evaluation', folder]);
      check(prepared.status === 0, `${label}: ${subcommand} exited ${prepared.status}: ${prepared.output}`);
    }
    const ran = command(process.execPath, [CLI, 'run', '--evaluation', folder]);
    check(ran.status === 12, `${label}: run exited ${ran.status}, expected evaluator infrastructure failure 12: ${ran.output}`);
    const run = latestRun(folder);
    const diagnostic = path.join(run, 'evaluator', 'clean', 'trial-1.stderr');
    const stderr = fs.existsSync(diagnostic) ? fs.readFileSync(diagnostic, 'utf8') : '';
    for (const message of messages)
      check(stderr.includes(message), `${label}: the evaluator diagnostic did not name ${message}: ${stderr}`);
    const records = sealedRecords(run);
    check(records.length === 0, `${label}: run sealed trial records ${records.join(', ')}`);
  }
}

function degenerate() {
  const folder = project((evaluation) => {
    const file = path.join(evaluation, 'evaluator', 'promptfoo.mjs');
    fs.writeFileSync(
      file,
      '#!/usr/bin/env node\nimport fs from "node:fs";\nconst input = JSON.parse(fs.readFileSync(0, "utf8"));\nconst rows = ["required-apples", "required-pears", "forbidden-shellfish"].map((key) => ({ key, outcome: "pass", observationIds: [input.observations[0].observationId] }));\nprocess.stdout.write(JSON.stringify({ rows }) + "\\n");\n',
      { mode: 0o755 },
    );
  });
  const ran = command(process.execPath, [CLI, 'run', '--evaluation', folder]);
  check(ran.status === 0, `always-pass run exited ${ran.status}: ${ran.output}`);
  if (ran.status !== 0) return;
  const scored = command(process.execPath, [CLI, 'score', '--evaluation', folder]);
  check(scored.status === 2, `always-pass score exited ${scored.status}, expected uncaught defect exit 2: ${scored.output}`);
  const states = votes(latestRun(folder), 'P-002');
  check(states.length === 3 && states.every((state) => state !== 'caught'), `always-pass evaluator caught the mutation: ${states}`);
}

(async () => {
  try {
    const installed = engine();
    directEvaluator();
    childInvocation();
    resultShapes();
    await allowList(evaluatorFiles());
    pipeline();
    refusedRuns();
    degenerate();
    process.stdout.write(`promptfoo ${installed.version}: ${checks} checks, ${failures.length} failures\n`);
  } catch (error) {
    failures.push(error.stack);
  } finally {
    if (process.env.KEEP_PROMPTFOO !== '1') for (const root of projects) fs.rmSync(root, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
  }
})();
