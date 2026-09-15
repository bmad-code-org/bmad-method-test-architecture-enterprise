/**
 * TEA's branches over `eval-quality`'s port vocabularies are total, held against
 * the vocabularies the installed package declares.
 *
 * Three closed sets decide how a consumer reads this package: `ProbeRequest`
 * and `ProbeObservation` are unions tagged by `kind`, and the conformance
 * surface publishes one arm per port. TEA writes `kind: 'cli'` everywhere and
 * reads `exitCode`, `stdout` and `artifacts`, which are the `cli` member's
 * fields, so a member TEA does not handle reads as a run that exited nowhere
 * rather than as a port answering in a shape TEA never authorized.
 *
 * TEA is CommonJS consuming an ESM package and runs no typechecker, so no
 * compiler will notice the day a fourth member arrives. Review will not notice
 * either: the whole failure mode is code that keeps working on the members it
 * knows. This check is the assertion, executed against the package's own
 * exported parsers and registry rather than against a list transcribed from
 * them.
 *
 * WHAT IT HOLDS
 *
 * - Every member of `ProbeRequest` and `ProbeObservation` is either one TEA
 *   handles or one TEA declines, with the reason recorded here. A member in
 *   neither fails, naming it.
 * - A declined member raises a named error rather than returning a default. The
 *   narrowing function is called with one and the throw is observed, so the
 *   guarantee is executed rather than described.
 * - Every request TEA builds and every observation TEA mints carries a `kind`
 *   TEA handles, and parses against the package's own parser for it.
 * - Every conformance arm `CONFORMANCE_OUTCOME_COUNTS` names is either run by a
 *   TEA check that reads its expected count from that registry, or recorded
 *   here with the reason no check runs it, which is either planned adoption or a
 *   decline. An arm in neither fails, naming it.
 * - Every member of the five published code vocabularies TEA recognises is held
 *   against the registry that publishes it, and the three registries TEA reads
 *   exhaustively are held in the other direction too: a member the package adds
 *   fails here rather than falling quietly to a default branch.
 *
 * Usage: node test/test-port-totality.js
 *
 * Exit codes:
 *   0  every vocabulary is covered
 *   1  a member, an arm or a published code is handled by nothing and declined
 *      by nothing, or a ledger entry here has gone stale
 *   2  the package could not be imported, or it publishes a registry in a shape
 *      this check cannot read, so nothing about TEA's branches was measured
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadEvalQuality, probeObservation } = require('./lib/eval-quality-inputs');
const { cliObservation, probeRequest } = require('./lib/probe-targets');

const { expectedOutcomeCount } = require('./lib/conformance-counts');
const { publishedMember } = require('./lib/vocabularies');

const PROJECT_ROOT = path.join(__dirname, '..');

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
};

/**
 * The one member TEA handles, and why the other two are declined.
 *
 * Every contract under `test/contracts/` declares the `cli` interface kind, and
 * `test/test-probe-targets.js` asserts that for each of them, so the other two
 * members describe a system under test TEA does not measure. Declining is not
 * deferral: adopting one would mean TEA had a contract naming an HTTP service or
 * a tool server, and it has none.
 */
const PROBE_KINDS = {
  cli: { handled: true, reason: 'every TEA contract declares the cli interface kind, and TEA reads this member' },
  api: { handled: false, reason: 'TEA measures no system under test that speaks HTTP' },
  mcp: { handled: false, reason: 'TEA measures no tool server; its commands are spawned processes' },
};

/**
 * Which TEA check runs each published conformance arm.
 *
 * `file` is the check that runs it. `reason` is why no check does, and a reason
 * is one of two things, and as of this release every remaining reason is the
 * second. `environment-probe` and `mcp-probe` are the api and mcp arms, TEA
 * measures neither an HTTP service nor a tool server, and the package ships no
 * adapter for the first, so neither has a subject to run against. The adoption
 * reasons are gone: corpus, clock and file-system each name a check now. A
 * decline is not deferral and each one says which it is.
 *
 * This paragraph enumerates the entries below and nothing holds it to them, so a
 * reason moving to a file leaves it wrong. It has now been wrong twice in one
 * night, once when `file-system` became a file and again when `clock` did, each
 * time in a pull request that was not looking at it. Read it against the map
 * rather than instead of it.
 */
const CONFORMANCE_ARMS = {
  'command-probe': { file: 'test/test-probe-conformance.js' },
  // Not deferral. This is the `api` arm, over HTTP: the package names the three
  // arms `api`, `cli` and `mcp` in dist/testing/probe-conformance.d.ts, its
  // subject wants denied address classes, a method, a scheme and a redirect
  // chain, and eval-quality ships no HTTP adapter to run it against. TEA
  // authorizes no HTTP target, so the arm has no subject, the same way
  // `mcp-probe` below has none. FR21 is withdrawn in the requirements inventory
  // with the evidence.
  'environment-probe': {
    reason:
      'eval-quality ships no HTTP adapter and TEA measures no HTTP service, so the api arm has neither an implementation to certify nor a subject',
  },
  corpus: { file: 'test/test-corpus-conformance.js' },
  clock: { file: 'test/test-probe-conformance.js' },
  'file-system': { file: 'test/test-file-system-conformance.js' },
  'mcp-probe': { reason: 'TEA authorizes no tool server, so this arm has no subject to run against' },
};

/**
 * The five code vocabularies `eval-quality` publishes off its root barrel, and
 * how TEA reads each one.
 *
 * TEA recognised members of all five by transcription. No file in this
 * repository referenced `FAILURE_CODES`, `RUNTIME_FAULT_CODES`,
 * `QUALIFICATION_FAILURES`, `VERDICTS` or `EVALUATOR_RECOMMENDATIONS`, so every
 * one of these strings was a literal somebody had copied, and a code renamed
 * upstream stopped matching in silence: a fault classification fell to its
 * default branch, a recorded code became the string `unknown`, and each check
 * stayed green over a vocabulary that had moved.
 *
 * `reading` is the difference between the two halves of this ledger, and it is a
 * statement about TEA rather than about the package.
 *
 * `exhaustive` means TEA's reading of the registry is a decision over the whole
 * vocabulary, so every published member is listed here with what TEA does about
 * it. Those are held in both directions: a member TEA lists that the package
 * stopped publishing is a stale entry, and a member the package publishes that
 * this ledger does not list fails, naming it. That second direction is the one
 * worth having on `RUNTIME_FAULT_CODES` in particular, because a new fault code
 * added upstream would otherwise land on `failureClassForFault`'s default class
 * with nothing saying a new code had arrived.
 *
 * `recovered` means TEA names no member in advance: it reads whatever code the
 * package hands back at runtime and records it. Listing all 26 `FAILURE_CODES`
 * or all 20 `QUALIFICATION_FAILURES` here with a sentence each would be 46
 * sentences nobody wrote for a reason, which is decoration rather than coverage.
 * What is held instead is that the named check reads the registry off the
 * package and puts every value through `publishedMember`, on a live source line,
 * plus the forward direction over whatever members TEA does happen to name.
 *
 * Each member entry carries a `note` saying what TEA does with it, and a `file`
 * when TEA names that member in its own source. A `file` is held against the
 * source: a member this ledger says TEA names, that the named file no longer
 * mentions, is an entry describing code that has gone.
 */
const PACKAGE_VOCABULARIES = {
  RUNTIME_FAULT_CODES: {
    reading: 'exhaustive',
    note: 'test/lib/probe-targets.js classifies every fault the probe port throws, so the whole registry is a decision TEA has taken.',
    members: {
      'schema-parse-failure': {
        file: 'test/lib/probe-targets.js',
        note: 'environment-parser: the port was handed or produced something it could not read',
      },
      'schema-version-mismatch': {
        file: 'test/test-contracts.js',
        note: 'seeded into every contract, where the compiler must answer it with no issue list; out of the probe port it falls to the default transport class',
      },
      'non-canonicalizable-value': {
        note: 'falls to the default transport class. Nothing TEA sends through the probe port asks the package to canonicalize a value, so no branch would have a reader',
      },
      'digest-mismatch': {
        note: 'falls to the default transport class. TEA digests through digestArtifact and digestBytes and compares the results itself, so a mismatch is a finding in the check that compared them',
      },
      'budget-exhausted': {
        file: 'test/lib/probe-targets.js',
        note: 'splits on its own detail: a wall clock is environment-timeout and an output cap is environment-transport, because a run killed for printing too much is not a slow run',
      },
      'port-failure': {
        file: 'test/test-probe-targets.js',
        note: 'the default class, environment-transport, driven by name in the classification table so the default is asserted rather than assumed',
      },
      'port-contract-violation': {
        file: 'test/lib/probe-targets.js',
        note: 'environment-parser: the port answered outside its own contract',
      },
      'forbidden-target': {
        file: 'test/lib/probe-targets.js',
        note: 'environment-configuration: the policy denied the target before a process started',
      },
      aborted: { file: 'test/lib/probe-targets.js', note: 'environment-timeout: the caller abandoned the call' },
      'operator-cannot-accept-operand': {
        note: 'falls to the default transport class. It is raised by the evaluator over an oracle operand rather than by the probe port, and test/test-contract-oracles.js reads what the evaluator reports rather than catching a fault',
      },
    },
  },
  FAILURE_CODES: {
    reading: 'recovered',
    heldBy: ['test/test-contracts.js', 'test/lib/probe-targets.js'],
    note: 'The compile-time registry. test/test-contracts.js recovers a code from whatever the compiler refuses; test/lib/probe-targets.js recovers one off a StructuralFailure the probe port throws. Both record a recovered value rather than branch on a list, so the check is over recovered values in either file.',
    members: {
      'unreachable-check-evidence': {
        file: 'test/test-contracts.js',
        note: 'the one code TEA names in advance: the seeded duplicated interface declaration must be refused with it',
      },
    },
  },
  QUALIFICATION_FAILURES: {
    reading: 'recovered',
    heldBy: 'test/test-probe-corpus.js',
    note: "AD-9's gate reasons. TEA records whichever ones fired into test/probes/expected-strength.json and branches on none of them, because a rejected probe reads the same whichever reason fired.",
    members: {},
  },
  VERDICTS: {
    reading: 'exhaustive',
    note: "The ladder's four rungs. TEA compares against one of them and takes the ladder's own exit code for the rest, so the whole set is a decision.",
    members: {
      PASS: {
        note: "no TEA literal: a resolution at this rung takes the ladder's own exit code. The PASS that test/eval-trace.js derives and cli/test-review.js prints is TEA's own gate vocabulary and is deliberately not bound here",
      },
      WAIVED: {
        note: "no TEA literal, and deriveGate never produces one. The WAIVED: that cli/test-review.js prints is TEA's own word for a waived finding and is never this rung",
      },
      CONCERNS: {
        file: 'test/lib/probe-scoring.js',
        note: 'the one rung --strict would promote to exit 1. STRICT_PROMOTION_VERDICT holds the literal and ladderExitCode holds the resolution against it',
      },
      FAIL: { note: "no TEA literal: a resolution at this rung takes the ladder's own exit code, the same as PASS" },
    },
  },
  EVALUATOR_RECOMMENDATIONS: {
    reading: 'exhaustive',
    note: "The three values a sealed run record may carry. sealed-run-record.schema.json enums the field and validateArtifact runs over every record TEA builds, so the values are already held by the package's own published schema and are not routed through publishedMember a second time.",
    members: {
      PASS: { file: 'test/lib/probe-scoring.js', note: "authored on the record for a leg TEA's scorer found clean" },
      CONCERNS: { file: 'test/lib/probe-scoring.js', note: "authored when TEA's scorer reported findings against the leg" },
      FAIL: {
        note: "TEA's scorer never recommends FAIL. It reports findings and leaves the rung to the ladder, which is what mode 'contract-scoring' means on the record",
      },
    },
  },
};

/**
 * The tagged members of one published union parser, read off the parser itself.
 *
 * Every option has to decode. An option whose `kind` tag this cannot read is
 * thrown on rather than skipped, because skipping it is the exact failure this
 * file exists to prevent: a member added upstream in a shape this extraction
 * does not understand would otherwise read as no new member at all, and the
 * check would pass while TEA handled none of it.
 *
 * The extraction reaches into the parser's internals because the package
 * publishes the parsers and no member registry beside them. That gap is
 * recorded upstream rather than papered over here, and until it closes the
 * throw below is what keeps this check honest: a parser shape this cannot read
 * fails loudly instead of answering with a shorter list.
 */
function unionMembers(parser) {
  const options = parser?._def?.options ?? parser?.def?.options;
  if (!Array.isArray(options)) throw new Error('the published parser is not a union, so its members cannot be read');
  const members = options.map((option) => {
    const shape = option.shape ?? option._def?.shape?.() ?? option.def?.shape;
    const literal = shape?.kind?._def?.values ?? shape?.kind?.def?.values ?? [shape?.kind?.value];
    return literal?.[0];
  });
  const undecodable = members.map((member, index) => (typeof member === 'string' ? null : index)).filter((index) => index !== null);
  if (undecodable.length > 0) {
    throw new Error(
      `${undecodable.length} of ${options.length} union option(s) carry a kind tag this check cannot read, at index ${undecodable.join(', ')}; ` +
        'a member read as nothing is a member TEA handles by accident, so this fails rather than reporting a shorter list',
    );
  }
  return [...members].sort();
}

/**
 * One TEA source file's lines with the comment-only ones dropped.
 *
 * Live source only, because a commented-out read satisfies a grep while the
 * thing beside it is a transcribed literal. This is the same filter the
 * conformance-arm check has always applied, lifted out so the vocabulary ledger
 * below reads the tree the same way rather than growing a second spelling of it.
 *
 * @param {string} file Repository-relative.
 * @returns {string[]}
 */
function liveSourceLines(file) {
  return fs
    .readFileSync(path.join(PROJECT_ROOT, file), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line));
}

/**
 * A regular expression matching one vocabulary member written as a string
 * literal, in any of the three quotes JavaScript has.
 *
 * The member is escaped because it comes from the package: every published code
 * is metacharacter-free today and a future one carrying a dot would otherwise
 * match more than itself. That is the same care the conformance-arm regex takes,
 * for the same reason.
 */
function quotedLiteral(member) {
  const escaped = member.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(String.raw`['"` + '`' + String.raw`]` + escaped + String.raw`['"` + '`' + String.raw`]`);
}

let failures = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${label}`);
    return;
  }
  failures += 1;
  console.log(`${colors.red}✗ ${label}${colors.reset}`);
  if (detail) console.log(`  ${colors.dim}${detail}${colors.reset}`);
}

/** Every member of one union is handled or declined, and a declined one throws by name. */
function checkUnion(name, members) {
  for (const member of members) {
    const entry = PROBE_KINDS[member];
    assert(
      entry !== undefined,
      `${name}'s "${member}" member is handled or declined`,
      `the package declares a member this check has no entry for; handle it in test/lib/probe-targets.js or decline it here with the reason`,
    );
    // The reason is the value of the ledger. An entry carrying none records
    // that somebody noticed the member, which is not the same as deciding it.
    if (entry === undefined) continue;
    assert(
      typeof entry.reason === 'string' && entry.reason.length > 0,
      `${name}'s "${member}" member records why`,
      'an entry with no reason is a member nobody decided about',
    );
  }
  for (const declared of Object.keys(PROBE_KINDS)) {
    assert(
      members.includes(declared),
      `${name} still declares the "${declared}" member this repository has an entry for`,
      'a member the package removed leaves a stale entry, which reads as coverage of something that no longer exists',
    );
  }
}

/**
 * Every code vocabulary, held against the package in whichever directions its
 * `reading` makes meaningful.
 *
 * The forward direction runs through `publishedMember` rather than a bare
 * `includes`, deliberately. It is the same function every membership check in
 * this repository now calls, so this section is also the one place its behaviour
 * over the real registries is executed: a `publishedMember` that stopped
 * throwing would pass every `includes`-shaped test written against it and fail
 * here, where the ledger's own members are the input.
 *
 * @param {Record<string, string[]>} registries The five registries off the root barrel.
 */
function checkVocabularies(registries) {
  for (const [name, ledger] of Object.entries(PACKAGE_VOCABULARIES)) {
    const published = registries[name];
    console.log(`\n${name}: ${published.length} published, ${Object.keys(ledger.members).length} recognised by TEA (${ledger.reading})`);

    for (const [member, entry] of Object.entries(ledger.members)) {
      let thrown = null;
      try {
        publishedMember({ [name]: published }, member, `${name}'s "${member}", which this repository records TEA as recognising`);
      } catch (error) {
        thrown = error.message;
      }
      assert(thrown === null, `${name} still publishes the "${member}" member TEA recognises`, thrown ?? '');
      // The note is the value of the ledger. An entry carrying none records that
      // somebody noticed the code, which is not the same as deciding it.
      assert(
        typeof entry.note === 'string' && entry.note.length > 0,
        `${name}'s "${member}" entry records what TEA does with it`,
        'an entry with no note is a code nobody decided about',
      );
      if (entry.file === undefined) continue;
      assert(
        liveSourceLines(entry.file).some((line) => quotedLiteral(member).test(line)),
        `${entry.file} still names ${name}'s "${member}" member`,
        'this entry says TEA names the member in that file; a file that no longer does leaves an entry describing code that has gone',
      );
    }

    // Two readings and no third. A `reading` this does not recognise would
    // otherwise fall to the recovered branch below and read `heldBy` as a file
    // path, which is an EISDIR on the repository root rather than a finding.
    assert(
      ledger.reading === 'exhaustive' || ledger.reading === 'recovered',
      `${name} records how TEA reads it`,
      `reading is ${JSON.stringify(ledger.reading)}, and a registry is either read exhaustively or recovered at runtime`,
    );

    if (ledger.reading === 'exhaustive') {
      for (const member of published) {
        assert(
          Object.hasOwn(ledger.members, member),
          `${name}'s "${member}" member is recorded`,
          'the package publishes a code this ledger says nothing about; branch on it in the file that reads the registry, or record here what TEA does with it instead',
        );
      }
      continue;
    }

    // A recovered vocabulary has no member list to hold, so what is held is that
    // every file this ledger names as a reader actually reads the registry off
    // the package and puts what it recovers through the accessor. `heldBy` is a
    // file path or an array of them, because `FAILURE_CODES` crosses the
    // package boundary at two independent sites now: `test/test-contracts.js`
    // recovers a code off a refused compile, and `test/lib/probe-targets.js`
    // recovers one off a thrown `StructuralFailure`. A ledger naming only the
    // first would leave the second's `publishedMember` call unheld, which is
    // the same gap as not listing the registry at all, one reader short of it.
    if (ledger.reading !== 'recovered') continue;
    for (const file of [ledger.heldBy].flat()) {
      const lines = liveSourceLines(file);
      assert(
        lines.some((line) => line.includes(name)),
        `${file} reads ${name} off the package`,
        'a check over recovered codes that never names the registry is holding them against nothing',
      );
      assert(
        lines.some((line) => line.includes('publishedMember')),
        `${file} puts what it recovers through publishedMember`,
        'recording a recovered code without holding it is how the string "unknown" entered a baseline and stayed there',
      );
    }
  }
}

async function main() {
  let probeParsers;
  let CONFORMANCE_OUTCOME_COUNTS;
  let barrel;
  try {
    ({ probeParsers, CONFORMANCE_OUTCOME_COUNTS } = await import('eval-quality/conformance'));
    // The root barrel, where the five code vocabularies live. A second subpath
    // rather than a second copy: the ESM loader caches one namespace per
    // resolved URL, so this is the same module every other reader in the tree
    // holds.
    barrel = await loadEvalQuality();
  } catch (error) {
    // Exit 2, the class every sibling check uses: a package that cannot be
    // imported measured nothing, and reporting that as "TEA's branches are not
    // total" files an environment fault as a quality failure.
    console.error(`${colors.red}eval-quality could not be imported: ${error.message}${colors.reset}`);
    console.error(`${colors.dim}Run npm ci. Nothing about TEA's branches was measured.${colors.reset}`);
    return 2;
  }

  // Exit 2 rather than 1, for the reason the import arm takes it. A registry the
  // package no longer publishes as a non-empty list of strings is a package
  // whose shape moved, and every membership answer below would then be a
  // statement about that rather than about TEA's coverage. `publishedMember`
  // says the same thing per call; this says it once, before a hundred calls each
  // report it.
  const registries = {};
  for (const name of Object.keys(PACKAGE_VOCABULARIES)) {
    const published = barrel[name];
    if (!Array.isArray(published) || published.length === 0 || published.some((member) => typeof member !== 'string')) {
      console.error(`${colors.red}eval-quality publishes ${name} as ${JSON.stringify(published) ?? String(published)}${colors.reset}`);
      console.error(
        `${colors.dim}A registry that is not a non-empty list of codes cannot hold anything. Nothing about TEA's vocabularies was measured.${colors.reset}`,
      );
      return 2;
    }
    registries[name] = published;
  }

  const requestMembers = unionMembers(probeParsers.request);
  const observationMembers = unionMembers(probeParsers.response);

  console.log('ProbeRequest and ProbeObservation are covered member by member');
  assert(
    requestMembers.length === 3 && observationMembers.length === 3,
    'both unions carry the three members TEA is written against',
    `request ${JSON.stringify(requestMembers)}, observation ${JSON.stringify(observationMembers)}`,
  );
  checkUnion('ProbeRequest', requestMembers);
  checkUnion('ProbeObservation', observationMembers);

  console.log('\na member TEA declines raises a named error');
  for (const [member, entry] of Object.entries(PROBE_KINDS)) {
    if (entry.handled) continue;
    let thrown;
    try {
      cliObservation({ kind: member, probeId: 'totality', interfaceId: 'tea-test-review', operationId: 'review-test-files' });
    } catch (error) {
      thrown = error;
    }
    assert(
      thrown !== undefined && thrown.message.includes(member),
      `a "${member}" observation throws an error naming the member`,
      thrown === undefined ? 'the narrowing returned a value' : thrown.message,
    );
  }
  const handled = Object.entries(PROBE_KINDS).find(([, entry]) => entry.handled)?.[0];
  assert(
    cliObservation({ kind: handled }).kind === handled,
    `a "${handled}" observation passes the narrowing unchanged`,
    'the member TEA handles must survive the check that refuses the others',
  );

  console.log('\nevery request TEA builds is a member TEA handles');
  const built = probeRequest({ probeId: 'totality', interfaceId: 'tea-test-review', operationId: 'review-test-files' });
  assert(PROBE_KINDS[built.kind]?.handled === true, `probeRequest builds the "${built.kind}" member`, JSON.stringify(built.kind));
  const parsed = probeParsers.request.safeParse({ ...built, executable: 'tea-test-review' });
  assert(
    parsed.success,
    'the request TEA builds parses against the published ProbeRequest parser',
    JSON.stringify(parsed.error?.issues ?? []),
  );

  // The observation half. `probeObservation` hand-mints the shape
  // `preflightFromObservations` reduces over, for a caller that probed by some
  // other means, so nothing else in this repository holds it against the
  // package's own parser.
  const minted = probeObservation({
    legId: 'totality',
    interfaceId: 'tea-test-review',
    operationId: 'review-test-files',
    exitCode: 0,
    stdout: { kind: 'text', value: '' },
  });
  assert(PROBE_KINDS[minted.kind]?.handled === true, `probeObservation mints the "${minted.kind}" member`, JSON.stringify(minted.kind));
  const parsedObservation = probeParsers.response.safeParse(minted);
  assert(
    parsedObservation.success,
    'the observation TEA mints parses against the published ProbeObservation parser',
    JSON.stringify(parsedObservation.error?.issues ?? []),
  );

  console.log('\nevery published conformance arm is run or recorded as not run');
  const arms = Object.keys(CONFORMANCE_OUTCOME_COUNTS).sort();
  for (const arm of arms) {
    const entry = CONFORMANCE_ARMS[arm];
    assert(
      entry !== undefined,
      `the "${arm}" arm is run or recorded`,
      'the package publishes an arm this repository says nothing about; run it, or record here why it is not run',
    );
    if (entry === undefined) continue;
    assert(
      (typeof entry.file === 'string' && entry.file.length > 0) || (typeof entry.reason === 'string' && entry.reason.length > 0),
      `the "${arm}" arm names the check that runs it or records why none does`,
      'an entry that is neither is an arm nobody decided about, and an empty file path reads as a check that exists and then throws EISDIR on the repository root',
    );
    if (entry.file === undefined) continue;
    // The count for an arm this file says TEA runs, resolved here so a registry
    // whose shape moved is exit 2 with the rest of the package failures rather
    // than a thrown stack at exit 1. Exit 1 in this file means a member or an arm
    // is handled by nothing and declined by nothing, which is a statement about
    // TEA; a package that stopped publishing a count measured nothing about TEA
    // at all.
    try {
      expectedOutcomeCount(CONFORMANCE_OUTCOME_COUNTS, arm);
    } catch (error) {
      console.error(`${colors.red}the "${arm}" arm's expected count could not be read: ${error.message}${colors.reset}`);
      console.error(`${colors.dim}Nothing about TEA's branches was measured.${colors.reset}`);
      return 2;
    }
    // Live source only. A commented-out read would otherwise satisfy this while
    // the count beside it was a transcribed literal.
    //
    // The accessor, and only the accessor. A bare `CONFORMANCE_OUTCOME_COUNTS[arm]`
    // subscript also reads the package and was accepted here until this check had
    // a second clause to enforce: FR22 asks that a missing entry fail with the arm
    // named, and a subscript cannot do that. Leaving the subscript admissible
    // would let each arm Stories 3.2 through 3.4 add satisfy this gate while
    // producing the very "is undefined" message the requirement forbids, and the
    // rule that every later arm uses the accessor would live in a comment with
    // nothing holding it. Nothing in the repository uses the subscript now.
    //
    // The call has to fit one source line, which is what lets this read the arm
    // name off it. Prettier's printWidth here is 140 and the call is 85.
    // The arm name is escaped because it comes from the package: every published
    // name is metacharacter-free today and a future one carrying a dot would
    // otherwise match more than itself.
    const escapedArm = arm.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const quoted = String.raw`['"` + '`' + String.raw`]` + escapedArm + String.raw`['"` + '`' + String.raw`]`;
    const readsThroughAccessor = new RegExp(String.raw`expectedOutcomeCount\(\s*CONFORMANCE_OUTCOME_COUNTS\s*,\s*` + quoted);
    const reads = liveSourceLines(entry.file).some((line) => readsThroughAccessor.test(line));
    assert(
      reads,
      `${entry.file} reads the "${arm}" expected count from the package through expectedOutcomeCount`,
      'an arm whose expected count is transcribed rather than read drifts the first time the package adds an assertion, and one read by subscript cannot name the arm when the entry goes',
    );
  }
  // The accessor's three failures, driven rather than described. A gate nobody has
  // seen fire is a gate nobody has tested, and all three of these exist for days
  // nobody will be looking for them.
  //
  // Each is a registry built here rather than the published one, because the
  // published one is correct and cannot be made to produce any of them. There is
  // deliberately no "the accessor returns the published count" assertion beside
  // them: the success path returns `counts[arm]`, so comparing it with
  // `counts[arm]` is `x === x` and cannot report false whatever the accessor did.
  const throwsFrom = (counts, arm) => {
    try {
      expectedOutcomeCount(counts, arm);
      return null;
    } catch (error) {
      return error.message;
    }
  };

  const absentArm = throwsFrom(CONFORMANCE_OUTCOME_COUNTS, 'no-such-arm');
  assert(
    absentArm !== null && absentArm.includes('"no-such-arm"') && arms.every((arm) => absentArm.includes(arm)),
    'an arm the package does not publish fails with the arm named and the published arms listed',
    absentArm ?? 'it returned instead of throwing',
  );

  const absentRegistry = throwsFrom(undefined, 'command-probe');
  assert(
    absentRegistry !== null &&
      absentRegistry.includes('CONFORMANCE_OUTCOME_COUNTS') &&
      !absentRegistry.includes('renamed or withdrawn upstream, so the check'),
    'a registry the package no longer publishes names the registry rather than blaming the arm',
    absentRegistry ?? 'it returned instead of throwing',
  );

  const badCount = throwsFrom({ 'command-probe': 0 }, 'command-probe');
  assert(
    badCount !== null && badCount.includes('"command-probe"') && badCount.includes('not a positive whole number'),
    'a count that is present and not a positive whole number names the count rather than the arm',
    badCount ?? 'it returned instead of throwing',
  );

  const presentButUndefined = throwsFrom({ 'command-probe': undefined }, 'command-probe');
  assert(
    presentButUndefined !== null && presentButUndefined.includes('not a positive whole number'),
    'an entry present with no value is a bad count rather than a missing arm',
    presentButUndefined ?? 'it returned instead of throwing',
  );

  for (const declared of Object.keys(CONFORMANCE_ARMS)) {
    assert(
      arms.includes(declared),
      `the package still publishes the "${declared}" arm this repository has an entry for`,
      'an arm the package removed leaves a stale entry here',
    );
  }

  checkVocabularies(registries);

  // `publishedMember`'s four failures, driven rather than described, for the
  // reason the four above are: a gate nobody has seen fire is a gate nobody has
  // tested, and each of these exists for a day nobody will be looking for it.
  //
  // Each is a registry built here rather than a published one, because every
  // published one is correct and cannot be made to produce any of them. There is
  // deliberately no "the accessor returns the member" assertion beside them: the
  // ledger above already calls it over every member TEA recognises, and a
  // success path that returned the wrong string would fail there.
  console.log('\nthe vocabulary accessor fails in four distinguishable ways');
  const heldAgainst = (vocabularies, value) => {
    try {
      publishedMember(vocabularies, value, 'the value under test');
      return null;
    } catch (error) {
      return error.message;
    }
  };

  const unpublished = heldAgainst({ VERDICTS: registries.VERDICTS }, 'MOVED');
  assert(
    unpublished !== null &&
      unpublished.includes('"MOVED"') &&
      unpublished.includes('VERDICTS') &&
      registries.VERDICTS.every((member) => unpublished.includes(member)),
    'a value the registry does not publish fails with the vocabulary named, the value quoted and the published members listed',
    unpublished ?? 'it returned instead of throwing',
  );

  const withdrawn = heldAgainst({ VERDICTS: undefined }, 'CONCERNS');
  assert(
    withdrawn !== null && withdrawn.includes('published no VERDICTS') && !withdrawn.includes('"CONCERNS"'),
    'a registry the package no longer publishes names the registry rather than blaming the value',
    withdrawn ?? 'it returned instead of throwing',
  );

  // The vacuity case, which is the one an `includes` over a registry cannot
  // report: an emptied registry makes every membership check false, so a check
  // that reported "not published" would send a reader to look at values that are
  // fine, and a check written as `registry.every(...)` over nothing would pass.
  const emptied = heldAgainst({ VERDICTS: [] }, 'CONCERNS');
  assert(
    emptied !== null && emptied.includes('with no members at all') && emptied.includes('VERDICTS'),
    'a registry published with no members says so rather than reporting the value as unpublished',
    emptied ?? 'it returned instead of throwing',
  );

  // Read off an object that does not carry the key, because that is the shape
  // the case actually arrives in: a field the package stopped carrying, rather
  // than somebody passing the word `undefined`.
  const movedResolution = {};
  const wrongShape = heldAgainst({ VERDICTS: registries.VERDICTS }, movedResolution.verdict);
  assert(
    wrongShape !== null && wrongShape.includes('not a string') && wrongShape.includes('VERDICTS'),
    'a value that is not a string is the field having changed shape rather than the vocabulary having moved',
    wrongShape ?? 'it returned instead of throwing',
  );

  const recognised = Object.values(PACKAGE_VOCABULARIES).reduce((total, ledger) => total + Object.keys(ledger.members).length, 0);

  if (failures > 0) {
    console.error(`\n${colors.red}${failures} totality check(s) failed.${colors.reset}`);
    return 1;
  }
  console.log(
    `\n${colors.green}every member of both probe unions, all ${arms.length} published conformance arm(s)` +
      ` and all ${recognised} published code(s) TEA recognises across ${Object.keys(PACKAGE_VOCABULARIES).length} vocabularies are accounted for.${colors.reset}`,
  );
  return 0;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`${colors.red}${error?.stack ?? error}${colors.reset}`);
      process.exit(1);
    },
  );
}

module.exports = { CONFORMANCE_ARMS, PACKAGE_VOCABULARIES, PROBE_KINDS, unionMembers };
