/**
 * The offline prompt candidate generator: what it proposes, what it refuses and why a preview is reproducible.
 *
 * The contract holds for the shipped module and fails for each broken copy of it, so every guard below is shown to catch
 * the change that removes it:
 *
 * - the seed orders the sites a cap chooses among, and is recorded in every candidate, so a run that ignores it or does
 *   not record it fails;
 * - a candidate's `find` is a line that occurs once in the target, checked by the native `replace-exact` planner on the
 *   real bytes, so a generator that stops checking repeated spans fails;
 * - a site inside code, a quotation, a placeholder, front matter and the rest is rejected with its reason, so a
 *   generator that stops protecting spans fails.
 *
 * Beyond the contract: the family rules in a table of lines and their previews, the counts, a golden preview of the
 * fixture prompt (which pins every identity), and zero target, model, network, process and file access during a preview.
 *
 * Usage: node test/test-evaluate-generator.js [--write-golden]
 */

'use strict';

const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const AjvModule = require('ajv/dist/2020');

const { bytesDigest, parseCandidate, serializeCandidate } = require('../cli/lib/evaluate/discovery/candidate');
const generator = require('../cli/lib/evaluate/discovery/generator');
const { addFormats } = require('../cli/lib/evaluate/formats');
const { planReplaceExact, releasePlan } = require('../cli/lib/evaluate/mutation');
const { scratchDirectories } = require('./lib/scratch-directories');

const Ajv = AjvModule.default ?? AjvModule;

const PROJECT_ROOT = path.join(__dirname, '..');
const GENERATOR_SOURCE = path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'discovery', 'generator.js');
const FIXTURES = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate-generator');
const PROMPT = path.join(FIXTURES, 'prompt.md');
const GOLDEN_JSON = path.join(FIXTURES, 'preview.golden.json');
const GOLDEN_TEXT = path.join(FIXTURES, 'preview.golden.txt');
const MUTATION_SCHEMA = path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'schemas', 'mutation.schema.json');

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };
const failures = [];
let checks = 0;
const scratch = scratchDirectories('tea-evaluate-generator');

const REQUIREMENT_DIGEST = `sha256:${'0'.repeat(63)}1`;
const ARTIFACT = 'skill/prompt.md';
const SEED = '20261014';
const promptBytes = fs.readFileSync(PROMPT);

/** Counts one assertion and records its message when `condition` is false. */
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

/** The inputs of one preview, with `overrides` applied. */
function inputs(overrides = {}) {
  return {
    target: { artifact: ARTIFACT, bytes: promptBytes },
    requirementDigest: REQUIREMENT_DIGEST,
    campaignId: 'prompt-pilot',
    seed: SEED,
    ...overrides,
  };
}

/** The preview of `text` as a prompt file. */
function previewOf(module, text, overrides = {}) {
  return module.previewCandidates(inputs({ target: { artifact: ARTIFACT, bytes: Buffer.from(text, 'utf8') }, ...overrides }));
}

/** How often `find` occurs in `bytes` as the native planner counts it, overlapping occurrences included. */
function occurrences(bytes, find) {
  const needle = Buffer.from(find, 'utf8');
  let count = 0;
  for (let at = bytes.indexOf(needle); at !== -1; at = bytes.indexOf(needle, at + 1)) count += 1;
  return count;
}

/** The module of `GENERATOR_SOURCE` with each `[from, to]` applied once, loaded where the original lives. */
function brokenGenerator(label, replacements) {
  let source = fs.readFileSync(GENERATOR_SOURCE, 'utf8');
  for (const [from, to] of replacements) {
    if (!source.includes(from))
      throw new Error(`the broken generator "${label}" cannot be built: generator.js no longer holds ${JSON.stringify(from)}`);
    source = source.replace(from, to);
  }
  const broken = new Module(GENERATOR_SOURCE, module);
  broken.filename = GENERATOR_SOURCE;
  broken.paths = Module._nodeModulePaths(path.dirname(GENERATOR_SOURCE));
  broken._compile(source, GENERATOR_SOURCE);
  return broken.exports;
}

/** The sets of candidate lines per seed: which sites a cap of three keeps for the family. */
function keptBy(module, seed, family) {
  return module
    .previewCandidates(inputs({ seed, families: [family], perFamilyCap: 3 }))
    .candidates.map((candidate) => `${candidate.line}:${candidate.column}`)
    .join(',');
}

/** Twelve sites per family on twelve lines each, so a cap of three has a choice to make. */
const MANY_SITES = [
  ...Array.from({ length: 12 }, (_, index) => `Step ${index + 1}: you must run check ${index + 1}.`),
  ...Array.from({ length: 12 }, (_, index) => `Rule ${index + 1}: do not skip case ${index + 1}.`),
  ...Array.from({ length: 12 }, (_, index) => `Limit ${index + 1}: wait at most ${index + 1}0 seconds.`),
  '',
].join('\n');

// Seeds whose cap-of-three selections differ for both families the seed test uses; the golden preview pins the rest.
const SEED_A = 'alpha';
const SEED_B = 'beta';

/**
 * Every promise a preview makes, asked of `module`. Returns the problems found, so the shipped module yields none and each
 * broken copy of it yields at least one.
 */
function contractProblems(module) {
  const problems = [];
  const expect = (condition, message) => {
    if (!condition) problems.push(message);
  };

  const first = module.previewCandidates(inputs());
  const again = module.previewCandidates(inputs({ target: { artifact: ARTIFACT, bytes: Buffer.from(promptBytes) } }));
  expect(JSON.stringify(first) === JSON.stringify(again), 'the same input, config and seed give a different preview');

  for (const family of ['negation', 'numeric-threshold']) {
    const a = keptBy(module, SEED_A, family);
    const b = keptBy(module, SEED_B, family);
    expect(a === keptBy(module, SEED_A, family), `${family}: one seed chose two different sets`);
    expect(a !== b, `${family}: the seeds ${SEED_A} and ${SEED_B} keep the same sites (${a}), so the seed orders nothing`);
  }
  // Seeds that share a first character and a length still order the sites differently, for every family.
  for (const family of generator.FAMILY_NAMES) {
    const kept = (seed) =>
      module
        .previewCandidates(
          inputs({ target: { artifact: ARTIFACT, bytes: Buffer.from(MANY_SITES) }, seed, families: [family], perFamilyCap: 3 }),
        )
        .candidates.map((candidate) => candidate.line)
        .join(',');
    expect(kept('seed-1') === kept('seed-1'), `${family}: one seed chose two different sets`);
    expect(
      kept('seed-1') !== kept('seed-2'),
      `${family}: the seeds seed-1 and seed-2 keep the same sites (${kept('seed-1')}), so most of the seed is ignored`,
    );
  }
  const seeded = module.previewCandidates(inputs({ seed: SEED_A, perFamilyCap: 100 }));
  expect(
    seeded.candidates.length > 0 && seeded.candidates.every((candidate) => candidate.record.generator.seed === SEED_A),
    `a candidate does not record the seed ${SEED_A} that produced it`,
  );
  const otherSeed = module.previewCandidates(inputs({ seed: SEED_B, perFamilyCap: 100 }));
  expect(
    seeded.candidates.every((candidate, index) => candidate.record.identity !== otherSeed.candidates[index].record.identity),
    'a candidate keeps its identity when only the seed changes',
  );

  const everything = module.previewCandidates(inputs({ perFamilyCap: 100 }));
  const text = promptBytes.toString('utf8');
  for (const candidate of everything.candidates) {
    const { find, replace } = candidate.record.edit;
    expect(
      occurrences(promptBytes, find) === 1,
      `candidate ${candidate.record.candidateId} edits ${JSON.stringify(find)}, which occurs ${occurrences(promptBytes, find)} times`,
    );
    expect(!find.includes('\n') && find !== replace, `candidate ${candidate.record.candidateId} is not a one-line change`);
    const lines = text.split('\n');
    const changed = lines.map((line) => (line === find ? replace : line));
    expect(
      changed.filter((line, index) => line !== lines[index]).length === 1,
      `candidate ${candidate.record.candidateId} changes more than one line`,
    );
  }
  const accepted = new Set(everything.candidates.map((candidate) => candidate.record.edit.find));
  expect(!accepted.has('Repeat this rule: you must answer in English.'), 'a line that occurs twice became a candidate');
  expect(!accepted.has('Never skip the review.'), 'a line that sits inside a longer line elsewhere became a candidate');
  const repeated = everything.rejected.filter((site) => site.code === 'repeated-span').map((site) => site.line);
  expect(repeated.join(',') === '29,30,33', `the repeated-span rejections are on lines ${repeated.join(',')}, not 29,30,33`);

  const protectedLines = new Set(everything.candidates.map((candidate) => candidate.line));
  for (const line of [3, 6, 18, 21, 24])
    expect(!protectedLines.has(line), `line ${line} holds only protected sites, yet a candidate edits it`);
  const protectedBecause = (line, family, reason) =>
    everything.rejected.some(
      (site) => site.code === 'protected-span' && site.line === line && site.family === family && site.message.includes(reason),
    );
  for (const [line, family, reason] of [
    [3, 'modal-strength', 'front matter'],
    [6, 'modal-strength', 'heading'],
    [18, 'modal-strength', 'quotation'],
    [18, 'modal-strength', 'inline code'],
    [21, 'negation', 'code fence'],
    [24, 'modal-strength', 'block quote'],
  ]) {
    expect(protectedBecause(line, family, reason), `line ${line} (${family}) is not rejected as ${reason}`);
  }

  // The native planner is the final judge: it takes each edit on the real bytes and produces the mutated bytes.
  const folder = scratch.make('plan');
  fs.mkdirSync(path.join(folder, 'skill'), { recursive: true });
  fs.writeFileSync(path.join(folder, ARTIFACT), promptBytes);
  for (const candidate of everything.candidates) {
    const { find, replace } = candidate.record.edit;
    const mutation = { mutationId: 'M-001', targetArtifact: ARTIFACT, operator: { kind: 'replace-exact', find, replace, occurrences: 1 } };
    let planned;
    try {
      planned = planReplaceExact(folder, mutation);
      expect(
        planned.mutated.toString('utf8') === text.replace(find, () => replace),
        `candidate ${candidate.record.candidateId} plans a different edit than it states`,
      );
    } catch (error) {
      expect(false, `the native planner refuses candidate ${candidate.record.candidateId}: ${error.message}`);
    } finally {
      if (planned !== undefined) releasePlan(planned);
    }
  }
  return problems;
}

/** The shipped module satisfies the contract and every broken copy of it does not. */
function checkContractHoldsAndBreaks() {
  const shipped = contractProblems(generator);
  check(shipped.length === 0, `the generator breaks its contract: ${shipped.join('; ')}`);

  const broken = [
    {
      label: 'ignores the seed when ranking',
      replacements: [['    seed,\n    site.family,', '    "",\n    site.family,']],
    },
    {
      label: 'ranks by the first character of the seed',
      replacements: [['    seed,\n    site.family,', '    seed[0],\n    site.family,']],
    },
    {
      label: 'ignores the seed for one family',
      replacements: [['    seed,\n    site.family,', "    site.family === 'modal-strength' ? '' : seed,\n    site.family,"]],
    },
    {
      label: 'does not record the seed',
      replacements: [
        [
          '      generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION, seed },',
          "      generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION, seed: 'fixed' },",
        ],
      ],
    },
    { label: 'stops checking for repeated spans', replacements: [['if (repeats === 1)', 'if (repeats >= 1)']] },
    {
      label: 'counts an occurrence inside a longer line as none',
      replacements: [
        [
          'for (let at = text.indexOf(find); at !== -1; at = text.indexOf(find, at + 1)) count += 1;',
          'for (let at = text.indexOf(`${find}\\n`); at !== -1; at = text.indexOf(`${find}\\n`, at + 1)) count += 1;',
        ],
      ],
    },
    { label: 'stops protecting spans', replacements: [['const reasons = protectedSpans(text);', 'const reasons = [];']] },
  ];
  for (const { label, replacements } of broken) {
    const problems = contractProblems(brokenGenerator(label, replacements));
    check(problems.length > 0, `a generator that ${label} passes the contract`);
  }
}

/** One row per rule: a prompt line, its family and the edited line, or the code it is rejected with. */
const RULES = [
  // modal-strength
  { line: 'You must cite the file.', family: 'modal-strength', edited: 'You should cite the file.' },
  { line: 'YOU MUST cite the file.', family: 'modal-strength', edited: 'YOU SHOULD cite the file.' },
  { line: 'Must cite the file.', family: 'modal-strength', edited: 'Should cite the file.' },
  { line: 'The reviewer shall cite the file.', family: 'modal-strength', edited: 'The reviewer should cite the file.' },
  { line: 'You must not cite the file.', family: 'modal-strength', edited: 'You should not cite the file.' },
  { line: 'The answer is a must.', family: 'modal-strength', code: 'not-a-directive' },
  { line: 'Must the answer cite a file?', family: 'modal-strength', code: 'question' },
  { line: 'Say "you must cite" exactly.', family: 'modal-strength', code: 'protected-span' },
  { line: 'Say “you must cite” exactly.', family: 'modal-strength', code: 'protected-span' },
  { line: 'Keep `must` exact.', family: 'modal-strength', code: 'protected-span' },
  { line: 'Fill {{must}} in.', family: 'modal-strength', code: 'protected-span' },
  { line: 'See [what you must do](https://example.test/must).', family: 'modal-strength', code: 'protected-span', count: 1 },
  { line: 'Never use "must" lightly.', family: 'modal-strength', code: 'protected-span' },
  // A modal that infers a past event or a state states no requirement; one that requires something stays eligible.
  { line: 'The model must have used the cache.', family: 'modal-strength', code: 'epistemic' },
  { line: "The model must've used the cache.", family: 'modal-strength', code: 'epistemic' },
  { line: 'The tool must be running.', family: 'modal-strength', code: 'epistemic' },
  { line: 'The result shall have been cached.', family: 'modal-strength', code: 'epistemic' },
  { line: 'You must have a test.', family: 'modal-strength', edited: 'You should have a test.' },
  { line: 'The agent must have made the call.', family: 'modal-strength', code: 'epistemic' },
  { line: 'The agent must have done it.', family: 'modal-strength', code: 'epistemic' },
  { line: 'You must have speed.', family: 'modal-strength', edited: 'You should have speed.' },
  { line: 'A page must have children.', family: 'modal-strength', edited: 'A page should have children.' },
  { line: 'The user must’ve used it.', family: 'modal-strength', code: 'epistemic' },
  { line: 'The model must already have used the cache.', family: 'modal-strength', code: 'epistemic' },
  { line: 'The model must have already used the cache.', family: 'modal-strength', code: 'epistemic' },
  { line: 'The model must have bought it.', family: 'modal-strength', code: 'epistemic' },
  { line: 'Each list must have ten items.', family: 'modal-strength', edited: 'Each list should have ten items.' },
  { line: 'The page must have green buttons.', family: 'modal-strength', edited: 'The page should have green buttons.' },
  {
    line: 'Records must have created_at and updated_at fields.',
    family: 'modal-strength',
    edited: 'Records should have created_at and updated_at fields.',
  },
  { line: 'The output must be nothing but JSON.', family: 'modal-strength', edited: 'The output should be nothing but JSON.' },
  { line: 'You must be careful.', family: 'modal-strength', edited: 'You should be careful.' },
  // negation
  { line: 'Do not invent findings.', family: 'negation', edited: 'Do invent findings.' },
  { line: 'You must not invent findings.', family: 'negation', edited: 'You must invent findings.' },
  { line: 'You should not invent findings.', family: 'negation', edited: 'You should invent findings.' },
  { line: "Don't invent findings.", family: 'negation', edited: 'Do invent findings.' },
  { line: 'You shouldn’t invent findings.', family: 'negation', edited: 'You should invent findings.' },
  { line: 'The tool cannot invent findings.', family: 'negation', edited: 'The tool can invent findings.' },
  { line: 'Never invent findings.', family: 'negation', edited: 'Always invent findings.' },
  { line: 'NEVER invent findings.', family: 'negation', edited: 'ALWAYS invent findings.' },
  { line: 'The cache has never been warm.', family: 'negation', code: 'descriptive' },
  { line: 'We do not store findings.', family: 'negation', code: 'descriptive' },
  { line: 'Do not never invent findings.', family: 'negation', code: 'double-negation' },
  { line: 'Is it true that you do not invent findings?', family: 'negation', code: 'question' },
  { line: 'Say "do not invent" exactly.', family: 'negation', code: 'protected-span' },
  // numeric-threshold
  { line: 'Answer in at most 200 words.', family: 'numeric-threshold', edited: 'Answer in at most 400 words.' },
  { line: 'Report at least 8 findings.', family: 'numeric-threshold', edited: 'Report at least 4 findings.' },
  { line: 'Report no fewer than 9 items.', family: 'numeric-threshold', edited: 'Report no fewer than 4 items.' },
  { line: 'Wait up to 30 seconds.', family: 'numeric-threshold', edited: 'Wait up to 60 seconds.' },
  { line: 'Finish within 500ms.', family: 'numeric-threshold', edited: 'Finish within 1000ms.' },
  { line: 'Keep coverage above 80%.', family: 'numeric-threshold', edited: 'Keep coverage above 40%.' },
  { line: 'Keep error rate <= 5%.', family: 'numeric-threshold', edited: 'Keep error rate <= 10%.' },
  { line: 'Keep error rate >=2.', family: 'numeric-threshold', edited: 'Keep error rate >=1.' },
  { line: 'Keep error rate under 70%.', family: 'numeric-threshold', code: 'beyond-range' },
  { line: 'Report at least 1 finding.', family: 'numeric-threshold', code: 'number-agreement' },
  { line: 'Report at least 3 findings.', family: 'numeric-threshold', code: 'number-agreement' },
  { line: 'Report at least 0 findings.', family: 'numeric-threshold', code: 'no-change' },
  { line: 'Use a version above 2.1.0.', family: 'numeric-threshold', code: 'not-a-threshold' },
  { line: 'Hold coverage over 0.95.', family: 'numeric-threshold', code: 'not-a-threshold' },
  { line: 'Ship after 2026-10-14, at least.', family: 'numeric-threshold', code: 'none', count: 0 },
  { line: 'Ship over 2026-10-14.', family: 'numeric-threshold', code: 'not-a-threshold' },
  { line: 'Handle at most 1,000 rows.', family: 'numeric-threshold', code: 'not-a-threshold' },
  { line: 'Pick at least 3-5 items.', family: 'numeric-threshold', code: 'not-a-threshold' },
  { line: 'Finish under 10:30.', family: 'numeric-threshold', code: 'not-a-threshold' },
  { line: 'Read the 3 files and the 2nd, 4th and 5th steps.', family: 'numeric-threshold', code: 'none', count: 0 },
  { line: 'over3 is no bound.', family: 'numeric-threshold', code: 'none', count: 0 },
  { line: 'Say "at most 5" exactly.', family: 'numeric-threshold', code: 'protected-span' },
];

const LOWER_BOUNDS = [
  'at least',
  'no fewer than',
  'no less than',
  'minimum of',
  'minimum',
  'min',
  'more than',
  'greater than',
  'above',
  'over',
  'exceeds',
  'exceeding',
  '>=',
  '≥',
  '>',
];
const UPPER_BOUNDS = [
  'at most',
  'no more than',
  'up to',
  'maximum of',
  'maximum',
  'max',
  'fewer than',
  'less than',
  'under',
  'below',
  'within',
  '<=',
  '≤',
  '<',
];

/** Rows built from lists: each placeholder form, each guard word, each negation form and each bound phrase. */
const GENERATED_RULES = [
  // A placeholder holds its site whatever its form.
  ...[
    ['{{you must}}', 'double braces'],
    ['${you must}', 'dollar braces'],
    ['{must}', 'single braces'],
    ['<must>', 'angle'],
    ['[[must]]', 'double brackets'],
    ['%(must)s', 'format'],
    ['$must', 'variable'],
  ].map(([form]) => ({ line: `Fill ${form} in.`, family: 'modal-strength', code: 'protected-span', reason: 'placeholder' })),
  // A word before a negation that makes it a statement of fact.
  ...['we', 'they', 'i', 'he', 'she', 'it', 'which', 'who', 'that', 'has', 'have', 'had', 'was', 'were', 'is', 'are', 'am', 'been'].map(
    (word) => ({
      line: `${word} never runs.`,
      family: 'negation',
      code: 'descriptive',
    }),
  ),
  // A negation word after a negation, and a contraction after it.
  ...['not', 'no', 'never', 'neither', 'nor', 'without', 'nothing', 'none', 'nobody', 'cannot'].map((word) => ({
    line: `Do not ${word} go.`,
    family: 'negation',
    code: 'double-negation',
  })),
  { line: "Never isn't ok.", family: 'negation', code: 'double-negation' },
  { line: 'Never isn’t ok.', family: 'negation', code: 'double-negation' },
  // A determiner before a modal makes it a noun.
  ...['a', 'an', 'the', 'this', 'that', 'no', 'any', 'every', 'each', 'its', 'their', 'our', 'your', 'my'].map((word) => ({
    line: `${word} must matter.`,
    family: 'modal-strength',
    code: 'not-a-directive',
  })),
  // Every bound phrase loosens in the direction it constrains, in any case and across any whitespace.
  ...LOWER_BOUNDS.map((phrase) => ({
    line: `Keep it ${phrase} 8 total.`,
    family: 'numeric-threshold',
    edited: `Keep it ${phrase} 4 total.`,
  })),
  ...UPPER_BOUNDS.map((phrase) => ({
    line: `Keep it ${phrase} 8 total.`,
    family: 'numeric-threshold',
    edited: `Keep it ${phrase} 16 total.`,
  })),
];

/** Rows that need more than one line, or an exact reason. */
const MULTI_LINE_RULES = [
  { text: 'Keep it <!-- you must not edit --> short.\n', family: 'modal-strength', code: 'protected-span', reason: 'html comment' },
  { text: 'Keep it <!-- you must edit\nstill you must edit\n', family: 'modal-strength', code: 'protected-span', reason: 'html comment' },
  { text: 'See [guide](docs/must.md) first.\n', family: 'modal-strength', code: 'protected-span', reason: 'link target' },
  { text: 'Open https://example.test/must now.\n', family: 'modal-strength', code: 'protected-span', reason: 'url' },
  { text: 'Say "you must act.\n', family: 'modal-strength', code: 'protected-span', reason: 'quotation' },
  { text: '# Use `must` here\n', family: 'modal-strength', code: 'protected-span', reason: 'heading' },
  { text: '---\r\nname: you must\r\n---\r\nBody.\r\n', family: 'modal-strength', code: 'protected-span', reason: 'front matter' },
  { text: 'Intro.\n~~~\nYou must not cite.\n~~~\nOutro.\n', family: 'modal-strength', code: 'protected-span', reason: 'code fence' },
  {
    text: '```\nyou must\n~~~\nyou must again\n```\n',
    family: 'modal-strength',
    code: 'protected-span',
    reason: 'code fence',
    rejections: 2,
  },
  {
    text: '````\nyou must\n```\nyou must again\n````\n',
    family: 'modal-strength',
    code: 'protected-span',
    reason: 'code fence',
    rejections: 2,
  },
  {
    text: '```\nyou must\n```js\nyou must again\n```\n',
    family: 'modal-strength',
    code: 'protected-span',
    reason: 'code fence',
    rejections: 2,
  },
  { text: '```text you must\nx\n```\n', family: 'modal-strength', code: 'protected-span', reason: 'code fence' },
  { text: '```\nx\n```\nYou must act.\n', family: 'modal-strength', edited: 'You should act.' },
  // A closing fence indented four columns is code, so it does not close; the fence runs to the unindented one.
  {
    text: '```\nfirst line\n    ```\nYou must not output secrets.\n```\n',
    family: 'modal-strength',
    code: 'protected-span',
    reason: 'code fence',
  },
  {
    text: '```\nfirst line\n    ```\nYou must not output secrets.\n```\n',
    family: 'negation',
    code: 'protected-span',
    reason: 'code fence',
  },
  // An opening fence indented four columns is indented code, so the next line is an instruction.
  { text: '    ```\nYou must cite the source.\n', family: 'modal-strength', edited: 'You should cite the source.' },
  { text: '\t```\nYou must cite the source.\n', family: 'modal-strength', edited: 'You should cite the source.' },
  { text: '``` a`b\nYou must cite the source.\n', family: 'modal-strength', edited: 'You should cite the source.' },
  // A fence in a list item opens and closes against the item's content column.
  { text: '- Item:\n\n  ```\n  You must not cite.\n  ```\n', family: 'modal-strength', code: 'protected-span', reason: 'code fence' },
  {
    text: '1. Item:\n\n   ```\n   You must not cite.\n   ```\n\nYou must act.\n',
    family: 'modal-strength',
    code: 'protected-span',
    reason: 'code fence',
    count: 1,
  },
  { text: '```\r\nYou must not cite.\r\n```\r\n', family: 'modal-strength', code: 'protected-span', reason: 'code fence' },
  // An inline code span runs over a line ending, and over nothing else.
  { text: 'Use `code\nYou must not output secrets` exactly.\n', family: 'modal-strength', code: 'protected-span', reason: 'inline code' },
  { text: 'Use `code\nYou must not output secrets` exactly.\n', family: 'negation', code: 'protected-span', reason: 'inline code' },
  { text: 'Use ``code ` with\nyou must `` exactly.\n', family: 'modal-strength', code: 'protected-span', reason: 'inline code' },
  { text: 'Use `code\n\nYou must cite` exactly.\n', family: 'modal-strength', edited: 'You should cite` exactly.' },
  { text: '- Use `code\n- You must cite` exactly.\n', family: 'modal-strength', edited: 'You should cite` exactly.' },
  // The last paragraph of a target with no trailing newline is read like any other.
  { text: 'Use `must` here', family: 'modal-strength', code: 'protected-span', reason: 'inline code' },
  { text: 'Intro.\n\nUse the `You must act` form.', family: 'modal-strength', code: 'protected-span', reason: 'inline code' },
  // A fence opens on the line of a list marker, and ends with the item that holds it.
  {
    text: '- ```bash\n  You must not leak.\n  ```\n\nYou must act.\n',
    family: 'modal-strength',
    code: 'protected-span',
    reason: 'code fence',
    count: 1,
  },
  {
    text: '1. ```\n   You must not leak.\n   ```\n\nYou must act.\n',
    family: 'modal-strength',
    code: 'protected-span',
    reason: 'code fence',
    count: 1,
  },
  {
    text: '-\t```\n\tYou must not leak.\n\t```\n\nYou must act.\n',
    family: 'modal-strength',
    code: 'protected-span',
    reason: 'code fence',
    count: 1,
  },
  {
    text: '- Item\n  ```\n  You must not x\nYou must act.\n',
    family: 'modal-strength',
    code: 'protected-span',
    reason: 'code fence',
    count: 1,
  },
  {
    text: '> Quote:\nYou must not x\n\nYou must act.\n',
    family: 'modal-strength',
    code: 'protected-span',
    reason: 'block quote',
    count: 1,
  },
  // A code span ends at a fence or a heading inside its paragraph.
  { text: 'Use `code\n```\nx\n```\nYou must cite` exactly.\n', family: 'modal-strength', edited: 'You should cite` exactly.' },
  { text: 'Use `code\n# Title\nYou must cite` exactly.\n', family: 'modal-strength', edited: 'You should cite` exactly.' },
  // A line is code inside a list item when it sits four columns past the item's content column.
  { text: '-     Item\n\n        You must cite.\n', family: 'modal-strength', code: 'protected-span', reason: 'indented code' },
  { text: '- Item\n\n    You must cite.\n', family: 'modal-strength', edited: 'You should cite.' },
  { text: '> Note\n---\nYou must cite.\n', family: 'modal-strength', edited: 'You should cite.' },
  { text: '> Note\n***\nYou must cite.\n', family: 'modal-strength', edited: 'You should cite.' },
  { text: '-     ```\n  You must cite.\n', family: 'modal-strength', edited: 'You should cite.' },
  // Only a bullet or `1.` interrupts a paragraph, so a span runs over a `2.` line; front matter belongs to no paragraph.
  { text: 'Use `code\n2. You must not x` y\n', family: 'modal-strength', code: 'protected-span', reason: 'inline code' },
  { text: '---\nname: x`\n---\nYou must act `y\n', family: 'modal-strength', edited: 'You should act `y' },
];

/** Forms, boundaries and limits of each rule. */
const EDGE_RULES = [
  { line: 'You shall not cite.', family: 'negation', edited: 'You shall cite.' },
  { line: "You mustn't cite.", family: 'negation', edited: 'You must cite.' },
  { line: 'The tool can not cite.', family: 'negation', edited: 'The tool can cite.' },
  { line: "The tool can't cite.", family: 'negation', edited: 'The tool can cite.' },
  { line: 'Cannot cite.', family: 'negation', edited: 'Can cite.' },
  { line: 'CANNOT cite.', family: 'negation', edited: 'CAN cite.' },
  { line: 'Never cite.', family: 'negation', edited: 'Always cite.' },
  // A word that only contains a trigger is no trigger.
  { line: 'The mustard is hot.', family: 'modal-strength', code: 'none' },
  { line: 'This must-have item.', family: 'modal-strength', code: 'none' },
  { line: 'Use the kudo not here.', family: 'negation', code: 'none' },
  { line: 'Nevertheless, continue.', family: 'negation', code: 'none' },
  { line: 'Plan a rollover 5 times.', family: 'numeric-threshold', code: 'none' },
  // A question mark ends a question only at the end of the line.
  { line: 'Why? You must act.', family: 'modal-strength', edited: 'Why? You should act.' },
  { text: 'Must it act? \n', family: 'modal-strength', code: 'question' },
  // Bounds in any case, across any whitespace, and the limits of a number.
  { line: 'AT LEAST 8 findings.', family: 'numeric-threshold', edited: 'AT LEAST 4 findings.' },
  { line: 'at  least 8 findings.', family: 'numeric-threshold', edited: 'at  least 4 findings.' },
  { line: 'Hold at most 8/10 tests.', family: 'numeric-threshold', code: 'not-a-threshold' },
  { line: 'Hold at most 99999999999999999999 tests.', family: 'numeric-threshold', code: 'not-a-threshold', reason: 'too large' },
  { line: 'Hold at most 1234567890123456 tests.', family: 'numeric-threshold', code: 'not-a-threshold', reason: 'too large' },
  { line: 'Hold at most 123456789012345 tests.', family: 'numeric-threshold', edited: 'Hold at most 246913578024690 tests.' },
  { line: 'Finish within 1ms.', family: 'numeric-threshold', edited: 'Finish within 2ms.' },
  { line: 'Finish within 1 day.', family: 'numeric-threshold', code: 'number-agreement' },
  // A byte order mark leaves the first line a first line.
  {
    text: '﻿---\nname: x\ndescription: You must do x\n---\nbody\n',
    family: 'modal-strength',
    code: 'protected-span',
    reason: 'front matter',
  },
  { text: '﻿# You must read\n', family: 'modal-strength', code: 'protected-span', reason: 'heading' },
  { text: '﻿```\nYou must not\n```\n', family: 'modal-strength', code: 'protected-span', reason: 'code fence' },
  // Code in a list item, indented code and setext headings.
  {
    text: '- item\n    ```\n    You must not\n    ```\nYou must go\n',
    family: 'modal-strength',
    code: 'protected-span',
    reason: 'code fence',
    count: 1,
  },
  {
    text: 'Intro.\n\n    echo you must not\n    echo you must again\n',
    family: 'modal-strength',
    code: 'protected-span',
    reason: 'indented code',
    rejections: 2,
  },
  { text: '- item\n    - You must act.\n', family: 'modal-strength', edited: 'You should act.' },
  { text: 'Title you must\n-----\n', family: 'modal-strength', code: 'protected-span', reason: 'heading' },
  // A bound under a negation constrains the other way.
  { line: 'Do not use more than 4 bullets.', family: 'numeric-threshold', code: 'negated-bound' },
  { line: 'Never write over 6 sentences.', family: 'numeric-threshold', code: 'negated-bound' },
  { line: 'Keep not less than 4 items.', family: 'numeric-threshold', code: 'negated-bound' },
  { line: "Don't go over 5 words.", family: 'numeric-threshold', code: 'negated-bound' },
  { line: 'Do not skip; keep at most 5 items.', family: 'numeric-threshold', edited: 'Do not skip; keep at most 10 items.' },
  // A percentage is a percentage however it is spelled.
  { line: 'Use up to 60 % of the quota.', family: 'numeric-threshold', code: 'beyond-range' },
  { line: 'Keep it under 60 percent.', family: 'numeric-threshold', code: 'beyond-range' },
  { line: 'Keep it under 40 percent.', family: 'numeric-threshold', edited: 'Keep it under 80 percent.' },
  { line: 'Use up to 1 % extra.', family: 'numeric-threshold', edited: 'Use up to 2 % extra.' },
  // A number that starts a range, an alternative or an ordinal is no bound.
  { line: 'Pick at least 3–5 items.', family: 'numeric-threshold', code: 'not-a-threshold' },
  { line: 'Pick at least 3 - 5 items.', family: 'numeric-threshold', code: 'not-a-threshold' },
  { line: 'Pick at least 3 to 5 items.', family: 'numeric-threshold', code: 'not-a-threshold' },
  { line: 'Pick at most 3 or 4 items.', family: 'numeric-threshold', code: 'not-a-threshold' },
  { line: 'Rank above 3rd place.', family: 'numeric-threshold', code: 'not-a-threshold', reason: 'ordinal' },
  { line: 'Rank at least 2nd.', family: 'numeric-threshold', code: 'not-a-threshold', reason: 'ordinal' },
  { line: 'Result => 3', family: 'numeric-threshold', code: 'none' },
  // Addresses, paths and single-quoted text.
  { line: 'Open www.example.test/must now.', family: 'modal-strength', code: 'protected-span', reason: 'url' },
  { line: 'Mail mailto:must@example.test now.', family: 'modal-strength', code: 'protected-span', reason: 'url' },
  { line: 'Read docs/never/x.md first.', family: 'negation', code: 'protected-span', reason: 'path' },
  { line: "He said 'you must not skip' then left.", family: 'modal-strength', code: 'protected-span', reason: 'quotation' },
  { line: 'He said ‘you must act’ then left.', family: 'modal-strength', code: 'protected-span', reason: 'quotation' },
  { line: "The user's rule: you must act, isn't it.", family: 'modal-strength', edited: "The user's rule: you should act, isn't it." },
  // A collocation that "always" cannot take.
  { line: 'Never ever skip.', family: 'negation', code: 'grammar' },
  { line: 'Never again skip.', family: 'negation', code: 'grammar' },
  // A bound in a question asks and does not instruct; the same bound as an instruction loosens.
  // A question mark inside a quotation or inline code ends no sentence.
  { line: 'You must answer "why?" in one sentence.', family: 'modal-strength', edited: 'You should answer "why?" in one sentence.' },
  {
    line: 'You must explain what `?` means in one sentence.',
    family: 'modal-strength',
    edited: 'You should explain what `?` means in one sentence.',
  },
  { line: 'Answer "why?" in at most 20 words.', family: 'numeric-threshold', edited: 'Answer "why?" in at most 40 words.' },
  // Punctuation inside a protected span, or closing a URL, is read for what it is.
  { line: 'Can you keep responses at most 5 words for https://example.test?', family: 'numeric-threshold', code: 'question' },
  {
    line: 'Keep responses at most 5 words for https://example.test.',
    family: 'numeric-threshold',
    edited: 'Keep responses at most 10 words for https://example.test.',
  },
  { line: 'Can you keep responses at most 5 words for docs/guide.md?', family: 'numeric-threshold', code: 'question' },
  { line: "You must answer 'why?' in one sentence.", family: 'modal-strength', edited: "You should answer 'why?' in one sentence." },
  { line: 'You must answer ‘why?’ in one sentence.', family: 'modal-strength', edited: 'You should answer ‘why?’ in one sentence.' },
  { line: 'You must answer {{why?}} in one sentence.', family: 'modal-strength', edited: 'You should answer {{why?}} in one sentence.' },
  {
    line: 'You must answer [why?](https://example.test/a?b) in one sentence.',
    family: 'modal-strength',
    edited: 'You should answer [why?](https://example.test/a?b) in one sentence.',
  },
  { line: "Do not answer 'why?' in one sentence.", family: 'negation', edited: "Do answer 'why?' in one sentence." },
  {
    line: 'Do you know https://example.test? You must say.',
    family: 'modal-strength',
    edited: 'Do you know https://example.test? You should say.',
  },
  { line: 'Say "do not" and keep it at most 5 words.', family: 'numeric-threshold', edited: 'Say "do not" and keep it at most 10 words.' },
  { line: 'Do not visit https://example.test and keep it at most 5 words.', family: 'numeric-threshold', code: 'negated-bound' },
  { line: 'Can you keep responses at most 5 words?', family: 'numeric-threshold', code: 'question' },
  { line: 'Keep responses at most 5 words.', family: 'numeric-threshold', edited: 'Keep responses at most 10 words.' },
  {
    line: 'Keep answers at most 5 words. Is that clear?',
    family: 'numeric-threshold',
    edited: 'Keep answers at most 10 words. Is that clear?',
  },
  {
    line: 'Is that clear? Keep answers at most 5 words.',
    family: 'numeric-threshold',
    edited: 'Is that clear? Keep answers at most 10 words.',
  },
  { line: 'Fill <!-- x --> and keep at most 5 items.', family: 'numeric-threshold', edited: 'Fill <!-- x --> and keep at most 10 items.' },
];

/** The rows above in one table, with the count of candidates a rejection row leaves. */
const ALL_RULES = [...RULES, ...GENERATED_RULES, ...MULTI_LINE_RULES, ...EDGE_RULES];

/** Each row previews as stated, in a prompt of its own. */
function checkRules() {
  for (const rule of ALL_RULES) {
    const text = rule.text ?? `${rule.line}\n`;
    const preview = previewOf(generator, text, { families: [rule.family] });
    const label = `${rule.family}: ${JSON.stringify(rule.line ?? text)}`;
    if (rule.edited !== undefined) {
      check(preview.candidates.length === 1, `${label} gives ${preview.candidates.length} candidates, not one`);
      check(
        preview.candidates[0]?.record.edit.replace.endsWith(rule.edited) &&
          (rule.line === undefined || preview.candidates[0].record.edit.find === rule.line),
        `${label} edits to ${JSON.stringify(preview.candidates[0]?.record.edit.replace)}, not ${JSON.stringify(rule.edited)}`,
      );
      check(preview.rejected.length === 0, `${label} also rejects ${JSON.stringify(preview.rejected.map((site) => site.code))}`);
    } else if (rule.code === 'none') {
      check(preview.candidates.length === 0 && preview.rejected.length === 0, `${label} proposes or rejects something; it holds no site`);
    } else {
      check(
        preview.candidates.length === (rule.count ?? 0),
        `${label} proposes ${preview.candidates.length} candidate(s), not ${rule.count ?? 0}`,
      );
      const coded = preview.rejected.filter((site) => site.code === rule.code);
      check(coded.length > 0, `${label} is not rejected as ${rule.code}: ${JSON.stringify(preview.rejected.map((site) => site.code))}`);
      if (rule.reason !== undefined) {
        check(
          coded.every((site) => site.message.includes(rule.reason)) && coded.length === (rule.rejections ?? coded.length),
          `${label} is not rejected for ${rule.reason}: ${JSON.stringify(coded.map((site) => site.message))}`,
        );
      }
    }
  }
}

/** Text encoded differently from the fixture still edits exactly the bytes it states. */
function checkEncodings() {
  const spaced = previewOf(generator, 'Do\u00A0not invent findings.\n', { families: ['negation'] });
  check(
    spaced.candidates.length === 1 && spaced.candidates[0].record.edit.replace === 'Do invent findings.',
    'a no-break space inside "Do not" is not read as the negation',
  );
  check(
    spaced.candidates[0]?.record.edit.find === 'Do\u00A0not invent findings.',
    'the find text does not keep the no-break space as written',
  );

  const windows = previewOf(generator, 'You must cite.\r\nYou must quote.\r\n', { families: ['modal-strength'] });
  check(
    windows.candidates.length === 2 && windows.candidates.every((candidate) => !candidate.record.edit.find.includes('\r')),
    'a carriage return became part of a find text',
  );
  const bom = previewOf(generator, '\uFEFFYou must cite.\n', { families: ['modal-strength'] });
  check(
    bom.candidates.length === 1 && bom.candidates[0].record.edit.find === '\uFEFFYou must cite.',
    'a byte order mark is dropped from the find text',
  );
  check(
    bom.target.artifactDigest === bytesDigest(Buffer.from('\uFEFFYou must cite.\n', 'utf8')),
    'the digest of a target with a byte order mark is not the digest of its bytes',
  );
  const folder = scratch.make('encoded');
  fs.mkdirSync(path.join(folder, 'skill'), { recursive: true });
  fs.writeFileSync(path.join(folder, ARTIFACT), '\uFEFFYou must cite.\n');
  const planned = planReplaceExact(folder, {
    mutationId: 'M-001',
    targetArtifact: ARTIFACT,
    operator: { find: bom.candidates[0].record.edit.find, replace: bom.candidates[0].record.edit.replace },
  });
  check(planned.mutated.toString('utf8') === '\uFEFFYou should cite.\n', 'the native planner turns the BOM line into a different edit');
  releasePlan(planned);

  const decomposed = previewOf(generator, 'Café must open.\nCafé must open.\n', { families: ['modal-strength'] });
  check(decomposed.candidates.length === 2, 'two lines that only differ in Unicode composition were merged as one repeated span');
}

/** The counts add up, the cap omits what it should and the family option scopes the run. */
function checkCountsAndConfig() {
  const preview = generator.previewCandidates(inputs());
  const { counts } = preview;
  check(
    counts.found === counts.selected + counts.omitted &&
      counts.selected === preview.candidates.length &&
      counts.rejected === preview.rejected.length,
    `the totals do not add up: ${JSON.stringify({ ...counts, families: undefined })}`,
  );
  for (const [name, family] of Object.entries(counts.families)) {
    check(
      family.found === family.selected + family.omitted && family.selected <= generator.DEFAULT_PER_FAMILY_CAP,
      `${name}: found ${family.found} is not selected ${family.selected} plus omitted ${family.omitted}`,
    );
    check(
      family.rejected === preview.rejected.filter((site) => site.family === name).length,
      `${name}: the rejected count is not the rejections listed`,
    );
  }
  check(
    counts.families.negation.omitted === 3 && counts.omitted === 4,
    `the default cap omits ${counts.families.negation.omitted} negation sites and ${counts.omitted} in all, not 3 and 4`,
  );

  const ids = preview.candidates.map((candidate) => candidate.record.candidateId);
  check(
    ids.join(',') === ids.map((_, index) => `C-${String(index + 1).padStart(3, '0')}`).join(','),
    'candidates are not numbered C-001 onward in order',
  );
  const order = preview.candidates.map((candidate) => [generator.FAMILY_NAMES.indexOf(candidate.family), candidate.line, candidate.column]);
  check(
    JSON.stringify(order) === JSON.stringify([...order].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])),
    'candidates are not in catalog and document order',
  );

  const capped = generator.previewCandidates(inputs({ perFamilyCap: 1 }));
  check(
    capped.candidates.length === 3 && capped.counts.omitted === counts.found - 3,
    'a cap of one keeps one candidate per family and counts the rest as omitted',
  );

  const only = generator.previewCandidates(inputs({ families: ['numeric-threshold'] }));
  check(
    only.candidates.every((candidate) => candidate.family === 'numeric-threshold') &&
      Object.keys(only.counts.families).join(',') === 'numeric-threshold' &&
      only.config.families.join(',') === 'numeric-threshold',
    'the families option does not scope the run',
  );
  const reordered = generator.previewCandidates(inputs({ families: ['numeric-threshold', 'modal-strength', 'negation'] }));
  check(JSON.stringify(reordered) === JSON.stringify(preview), 'the order of the families option changes the preview');

  const none = previewOf(generator, 'Nothing to change here.\n');
  check(
    none.candidates.length === 0 && none.counts.found === 0 && none.rejected.length === 0,
    'a prompt with no site gives a non-empty preview',
  );
}

/** An input the generator cannot use is refused by name. */
function checkRefusals() {
  const refused = (label, run, pattern) => {
    let message = '';
    try {
      run();
    } catch (error) {
      message = error.message;
    }
    check(pattern.test(message), `${label}: expected ${pattern}, got ${JSON.stringify(message)}`);
  };
  refused('no seed', () => generator.previewCandidates(inputs({ seed: '' })), /seed must be a non-empty string/);
  refused('a number seed', () => generator.previewCandidates(inputs({ seed: 7 })), /seed must be a non-empty string/);
  refused('a zero cap', () => generator.previewCandidates(inputs({ perFamilyCap: 0 })), /perFamilyCap must be a positive integer/);
  refused('a fractional cap', () => generator.previewCandidates(inputs({ perFamilyCap: 1.5 })), /perFamilyCap/);
  refused('an unknown family', () => generator.previewCandidates(inputs({ families: ['drop-lines'] })), /unknown family "drop-lines"/);
  refused(
    'no families',
    () => generator.previewCandidates(inputs({ families: [] })),
    /at least one of modal-strength, negation, numeric-threshold/,
  );
  refused(
    'a string for bytes',
    () => generator.previewCandidates(inputs({ target: { artifact: ARTIFACT, bytes: 'text' } })),
    /must be a Buffer or Uint8Array/,
  );
  refused('no artifact', () => generator.previewCandidates(inputs({ target: { bytes: promptBytes } })), /target.artifact/);
  refused(
    'invalid UTF-8',
    () => generator.previewCandidates(inputs({ target: { artifact: ARTIFACT, bytes: Buffer.from([0x4d, 0xff, 0x0a]) } })),
    /not UTF-8 text/,
  );
  refused(
    'a NUL',
    () => generator.previewCandidates(inputs({ target: { artifact: ARTIFACT, bytes: Buffer.from('a\u0000b\n') } })),
    /holds a NUL/,
  );
  // The inputs are held to the candidate schema before any scan, so a prompt with no editable site refuses them too.
  const bare = Buffer.from('Nothing here is an instruction.\n');
  for (const [label, override, pattern] of [
    ['an escaping artifact path', { target: { artifact: '../prompt.md', bytes: bare } }, /target\/artifact/],
    ['a bad digest', { requirementDigest: 'sha256:abc' }, /requirement\/digest/],
    ['a bad campaign', { campaignId: 'Pilot Run' }, /campaignId/],
    ['a campaign that is not text', { campaignId: 7 }, /campaignId must be a string/],
    ['a seed with a lone surrogate', { seed: '\uD800' }, /generator\/seed holds a lone surrogate/],
  ]) {
    let refusal;
    try {
      generator.previewCandidates(inputs({ target: { artifact: ARTIFACT, bytes: bare }, ...override }));
    } catch (error) {
      refusal = error;
    }
    check(
      refusal instanceof generator.GeneratorError && pattern.test(refusal.message),
      `${label} in a prompt with no editable site is refused with a GeneratorError matching ${pattern}; got ${refusal?.name}: ${refusal?.message}`,
    );
  }
  refused(
    'an escaping artifact path',
    () => generator.previewCandidates(inputs({ target: { artifact: '../prompt.md', bytes: promptBytes } })),
    /not a valid exploratory candidate/,
  );
  refused(
    'a bad digest',
    () => generator.previewCandidates(inputs({ requirementDigest: 'sha256:abc' })),
    /not a valid exploratory candidate/,
  );
  refused('a bad campaign', () => generator.previewCandidates(inputs({ campaignId: 'Pilot Run' })), /not a valid exploratory candidate/);
}

/** Each preview record is a slice-one candidate: valid, canonical, in the generated state, with the exact edit. */
function checkCandidatesAreCandidates() {
  const preview = generator.previewCandidates(inputs());
  const validateMutation = addFormats(new Ajv({ strict: false, allErrors: true })).compile(
    JSON.parse(fs.readFileSync(MUTATION_SCHEMA, 'utf8')),
  );
  for (const { record } of preview.candidates) {
    check(
      parseCandidate(serializeCandidate(record)).identity === record.identity,
      `${record.candidateId} does not round-trip through the canonical writer`,
    );
    check(
      record.state === 'generated' &&
        record.disposition === null &&
        record.review === null &&
        record.promotion === null &&
        record.observations.length === 0,
      `${record.candidateId} is not a fresh generated candidate`,
    );
    check(
      record.edit.occurrences === 1 && record.intent === 'regression' && record.partition === 'development',
      `${record.candidateId} carries the wrong edit count, intent or partition`,
    );
    check(
      record.target.artifactDigest === bytesDigest(promptBytes) && record.requirement.digest === REQUIREMENT_DIGEST,
      `${record.candidateId} names a different target or requirement than it was given`,
    );
    check(
      record.generator.name === generator.GENERATOR_NAME && record.generator.version === generator.GENERATOR_VERSION,
      `${record.candidateId} names a different generator`,
    );
    check(
      new RegExp(`^(${generator.FAMILY_NAMES.join('|')}), line [0-9]+: .+\\.$`).test(record.hypothesis),
      `${record.candidateId} has a hypothesis that names no family and line: ${record.hypothesis}`,
    );
    const draft = {
      schemaVersion: 1,
      mutationId: 'M-001',
      mutationSource: record.target.artifact,
      targetArtifact: record.target.artifact,
      operator: { kind: 'replace-exact', ...record.edit },
      expectedObservableFailure: record.hypothesis,
    };
    check(
      validateMutation(draft) === true,
      `${record.candidateId} edit is not a native mutation: ${JSON.stringify(validateMutation.errors)}`,
    );
  }
  const identities = new Set(preview.candidates.map(({ record }) => record.identity));
  check(identities.size === preview.candidates.length, 'two candidates share an identity');
}

/** The numeric hypotheses name the direction, the unit and the boundary the edit changes. */
function checkNumericHypothesis() {
  const preview = previewOf(
    generator,
    'Report at least 8 findings and wait up to 30 seconds, then stop within 500ms, keep at least 80% and at least 8 Of them.\n',
    {
      families: ['numeric-threshold'],
    },
  );
  const text = preview.candidates.map((candidate) => candidate.record.hypothesis).join('\n');
  for (const part of [
    'lower bound "at least 8" (unit findings) to "at least 4"',
    'upper bound "up to 30" (unit seconds) to "up to 60"',
    'upper bound "within 500ms" (unit ms) to "within 1000ms"',
    'lower bound "at least 80%" (unit %) to "at least 40%"',
    'lower bound "at least 8" (unit none) to "at least 4"',
  ]) {
    check(text.includes(part), `a numeric hypothesis lacks ${JSON.stringify(part)}: ${text}`);
  }
}

/** A long or crowded line costs time in proportion to its length, and a target past the cap is refused. */
function checkCostStaysLinear() {
  const cases = [
    ['a run of apostrophes before a digit', `${"'".repeat(5000)}1 must go\n`],
    ['a long word before a digit', `${'a'.repeat(200_000)}1b must go\n`],
    ['fifty thousand sites on one line', `${'must '.repeat(50_000)}\n`],
    ['fifty thousand questions on one line', `${'Why? must '.repeat(25_000)}\n`],
    ['twenty thousand sites on one line', `${'must '.repeat(20_000)}\n`],
    ['ten thousand bounds on one line', `${'at most 5 '.repeat(10_000)}\n`],
    ['a long run of path separators', `${'a/'.repeat(100_000)}\n`],
    ['fourteen thousand distinct editable lines', `${Array.from({ length: 14_000 }, (_, index) => `step ${index} must go`).join('\n')}\n`],
    [
      'a paragraph of unmatched backtick runs of every length',
      `${Array.from({ length: 700 }, (_, index) => `${'`'.repeat(index + 1)} x`).join('\n')}\nYou must go.\n`,
    ],
    ['twenty thousand lone backticks in one paragraph', `${'` x\n'.repeat(20_000)}`],
    ['twenty-five thousand identical editable lines', `${'a must b\n'.repeat(25_000)}`],
  ];
  for (const [label, text] of cases) {
    const started = Date.now();
    previewOf(generator, text);
    const elapsed = Date.now() - started;
    check(elapsed < 5000, `${label} took ${elapsed} ms to preview`);
  }
  let message = '';
  try {
    previewOf(generator, 'a'.repeat(256 * 1024 + 1));
  } catch (error) {
    message = error.message;
  }
  check(/not a prompt/.test(message), `a target past the size cap is not refused: ${JSON.stringify(message)}`);
  check(previewOf(generator, `${'a'.repeat(256 * 1024 - 1)}\n`).candidates.length === 0, 'a target at the size cap is not accepted');
}

/** A preview reads no file, starts no process, opens no connection and calls no model. */
function checkZeroCalls() {
  const source = fs.readFileSync(GENERATOR_SOURCE, 'utf8');
  const loads = [...source.matchAll(/require\('([^']+)'\)/g)].map((match) => match[1]).sort();
  check(
    JSON.stringify(loads) === JSON.stringify(['../digest', './candidate']),
    `generator.js loads ${JSON.stringify(loads)}; it may load the digest and the candidate module only`,
  );
  check(
    !/\b(?:fetch|XMLHttpRequest|WebSocket|spawn|execFile|fork|child_process)\b|(?<!\.)\bexec\b|process\.env/.test(source),
    'generator.js names a network, process or environment entry point',
  );

  const calls = [];
  const originals = [];
  const spy = (owner, name, label) => {
    originals.push([owner, name, owner[name]]);
    owner[name] = (...args) => {
      calls.push(`${label}${args.length > 0 && typeof args[0] === 'string' ? ` ${args[0]}` : ''}`);
      throw new Error(`${label} called during a preview`);
    };
  };
  const childProcess = require('node:child_process');
  const net = require('node:net');
  const http = require('node:http');
  const https = require('node:https');
  for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'])
    spy(childProcess, name, `child_process.${name}`);
  for (const name of ['connect', 'createConnection']) spy(net, name, `net.${name}`);
  spy(http, 'request', 'http.request');
  spy(https, 'request', 'https.request');
  for (const name of ['readFileSync', 'openSync', 'writeFileSync', 'readdirSync', 'statSync', 'lstatSync', 'existsSync'])
    spy(fs, name, `fs.${name}`);
  spy(globalThis, 'fetch', 'fetch');
  let preview;
  try {
    preview = generator.previewCandidates(inputs());
    generator.renderPreview(preview);
  } finally {
    for (const [owner, name, original] of originals.toReversed()) owner[name] = original;
  }
  check(calls.length === 0, `a preview made ${calls.length} call(s): ${calls.join(', ')}`);
  check(preview?.candidates.length > 0, 'the spied preview produced no candidates');
}

/** The fixture prompt previews to the committed JSON and text, which pin every identity and message. */
function checkGolden() {
  const preview = generator.previewCandidates(inputs());
  const json = `${JSON.stringify(preview, null, 2)}\n`;
  const text = generator.renderPreview(preview);
  if (process.argv.includes('--write-golden')) {
    fs.writeFileSync(GOLDEN_JSON, json);
    fs.writeFileSync(GOLDEN_TEXT, text);
  }
  check(
    json === fs.readFileSync(GOLDEN_JSON, 'utf8'),
    'the fixture prompt previews to different JSON than preview.golden.json; run with --write-golden after a deliberate change',
  );
  check(
    text === fs.readFileSync(GOLDEN_TEXT, 'utf8'),
    'the fixture prompt renders differently than preview.golden.txt; run with --write-golden after a deliberate change',
  );
}

/** The CLI does not carry the generator: no command, no export of the package's runtime reaches it. */
function checkNoCommand() {
  const cli = fs.readFileSync(path.join(PROJECT_ROOT, 'cli', 'evaluate.js'), 'utf8');
  check(
    !/generator|previewCandidates/.test(cli),
    'cli/evaluate.js names the generator; slice two adds a library entry point and no command',
  );
}

function main() {
  try {
    checkContractHoldsAndBreaks();
    checkRules();
    checkEncodings();
    checkCountsAndConfig();
    checkRefusals();
    checkCandidatesAreCandidates();
    checkNumericHypothesis();
    checkCostStaysLinear();
    checkZeroCalls();
    checkGolden();
    checkNoCommand();
  } finally {
    scratch.removeAll();
  }

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} generator check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} generator check(s) passed`);
  return 0;
}

process.exitCode = main();
