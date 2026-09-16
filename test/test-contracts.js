/**
 * Check every Behavioral Evaluation Contract under test/contracts/ against the
 * status test/contracts/expected-status.json records for it.
 *
 * The contracts are the machine-checkable statement of what a TEA skill has to
 * do. Nothing else in this repository can tell you whether one is well formed,
 * because the format belongs to eval-quality and its compiler is the only
 * authority on it.
 *
 * All fourteen contracts compile today. They did not when they were written: against
 * eval-quality 0.2.0 the contract language could only describe a system under
 * test that speaks HTTP, and a TEA skill runs behind a command, so every one of
 * them failed to parse in the same handful of places. test/contracts/README.md
 * records that finding and how it closed. A baseline is what keeps a known
 * failure from reading as a passing check, and what makes a status move visible
 * instead of silent: a contract whose status moves in EITHER direction fails
 * this check until the baseline is updated to say so.
 *
 * The issue shapes in the baseline are locations with array indices collapsed,
 * so adding a case to a suite does not churn the file while a new KIND of
 * failure still does.
 *
 * THIS CHECK FAILS CLOSED
 *
 * It used to skip. An unresolvable eval-quality returned null, printed a yellow
 * "skipped" and exited 0, which is a green check over fourteen contracts nobody
 * looked at. It was the only check in this repository that answered an absent
 * package with a pass: every sibling takes exit 2 for an environment that
 * measured nothing, and this one took exit 0 for the same condition. A skip is
 * only honest where somebody reads the word, and nothing reads the word in a
 * chain of thirty-odd checks whose whole output is the last line.
 *
 * So an unresolvable package exits 2 and says how many contracts went unchecked,
 * and so does a tree resolving a version other than the one package.json pins,
 * because fourteen contracts compiled against the wrong release are fourteen
 * results about a package this repository does not declare. The pin is read
 * through `pinnedVersion` in test/test-eval-quality-corpus.js, which is the one
 * comparison of its kind in this repository rather than a second copy of it.
 * To run this against an unreleased build, `npm link` it (or `npm install` its
 * packed tarball) so `node_modules/eval-quality` resolves to it, then run this
 * check with no flags; there is no `--package` path override here, since an
 * arbitrary path cannot be the literal `import()` specifier
 * `dependency-direction`'s scan of import statements requires.
 *
 * WHERE THE FAILURE SHAPE COMES FROM
 *
 * The compiler runs in this process. `compile` throws `RuntimeFault` or
 * `StructuralFailure`, and both carry `code` and `artifactPath` as fields; a
 * schema failure carries the Zod error as its `cause`, whose `issues` each carry
 * the `path` of the value that failed. So the code and the issue locations this
 * check records are read off the error rather than scraped back out of the
 * printed lines the binary would have written them as.
 *
 * `--strict-inputs` is the compiler's own default, so AD-4's strict checks run
 * here as they did when this check spawned the binary. That is stated at the
 * call rather than left to two defaults agreeing.
 *
 * Usage:
 *   node test/test-contracts.js
 *   node test/test-contracts.js --write   # rewrite the baseline
 *
 * Exit codes:
 *   0  every contract matched its recorded status
 *   1  a contract's status or failure shape moved away from the baseline; a
 *      seeded fault stopped reporting the shape recorded for it; package.json
 *      declares no eval-quality pin this check can compare against; or one of
 *      this file's own fail-closed refusals stopped refusing
 *   2  the compiler could not be loaded, whether it was named, unresolvable
 *      from the tree, or resolved to a manifest that would not read; the
 *      installed version is not the one package.json pins; the compiler
 *      failed in a way that is neither of its two declared error classes; or
 *      it reported a code no published registry carries
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadEvalQuality, validateArtifact } = require('./lib/eval-quality-inputs');
const { publishedMember } = require('./lib/vocabularies');
// The one pin comparison in this repository. `test/test-eval-quality-corpus.js`
// already owns it and already exports it, and a second copy here would be a
// second thing to keep in step with package.json's spelling.
const { pinnedVersion } = require('./test-eval-quality-corpus');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONTRACT_ROOT = path.join(__dirname, 'contracts');
const BASELINE = path.join(CONTRACT_ROOT, 'expected-status.json');

const colors = {
  reset: '\u001B[0m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  dim: '\u001B[2m',
};

/** Every *.contract.json under test/contracts, at any depth, in a stable order. */
function findContracts(directory) {
  if (!fs.existsSync(directory)) return [];
  const found = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...findContracts(full));
    else if (entry.name.endsWith('.contract.json')) found.push(full);
  }
  return found;
}

/**
 * The compiler's module, or the reason nothing can be compiled.
 *
 * The whole namespace rather than the one function, because the error classes
 * this check tests against have to come from the same module instance as the
 * compiler that threw: `instanceof` is false across two copies of the package,
 * so taking `compile` from a local build and `RuntimeFault` from the installed
 * one would report every fault as outside the compiler's declared classes.
 *
 * require.resolve settles the installed case, because it answers from this
 * repository's own resolution rather than from whatever happens to be on PATH,
 * and `loadEvalQuality` is the same accessor the rest of the test tree imports
 * the package through, so an unreleased build under test resolves the same way
 * once `npm link` (or an equivalent local install) points `eval-quality` at it.
 *
 * Every arm that cannot produce a compiler returns a code and the lines to print
 * rather than exiting here, so one place decides what this check's exit codes
 * mean. Not one of them returns null: a null used to reach the caller as a skip
 * that exits 0, which is the failure mode the header now describes.
 *
 * The three reads of the installed tree - the manifest path, this repository's
 * own pin, and the version that path resolves to - arrive as an injectable
 * `reads` object, each defaulting to the real read. `checkFailClosed` overrides
 * one at a time so it drives this function itself through every refusal rather
 * than reconstructing the refusal from a second copy of the logic: a wiring
 * bug in the calls below (the wrong value passed to `offThePin`, a swapped
 * argument) then fails the same way a real broken tree would.
 *
 * @param {number} contractCount How many contracts go unchecked when this fails, which is what makes the message worth reading.
 * @param {{resolveManifestPath?: () => string, readTeaManifest?: () => object, readInstalledVersion?: (manifestPath: string) => string}} [reads]
 * @returns {Promise<{ok: true, module: object}|{ok: false, exitCode: 1|2, lines: string[]}>}
 */
async function resolveCompiler(contractCount, reads = {}) {
  const {
    // eval-quality is a declared devDependency, so this resolves in a normal
    // install. A tree installed with --omit=dev throws here, and the honest
    // answer to that is an environment that measured nothing rather than a
    // pass over contracts nobody compiled.
    resolveManifestPath = () => require.resolve('eval-quality/package.json', { paths: [PROJECT_ROOT] }),
    readTeaManifest = () => JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')),
    readInstalledVersion = (manifestPath) => JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version,
  } = reads;

  let manifestPath;
  try {
    manifestPath = resolveManifestPath();
  } catch (error) {
    return unresolvable(error.message, contractCount);
  }

  let pinned;
  try {
    pinned = pinnedVersion(readTeaManifest());
  } catch (error) {
    // Exit 1 rather than 2, which is the class test/test-eval-quality-corpus.js
    // gives the same condition: a pin this repository declares and nothing can
    // compare is a defect here rather than an environment that could not answer.
    return { ok: false, exitCode: 1, lines: [error.message] };
  }

  let resolved;
  try {
    resolved = readInstalledVersion(manifestPath);
  } catch (error) {
    // A manifest that resolved and then could not be read is the same finding
    // as one that never resolved: nothing about the installed package could be
    // answered either way, so it takes the same refusal and names the same
    // unchecked count rather than reaching the file's top-level catch with a
    // generic message that does not.
    return unresolvable(`eval-quality's manifest at ${manifestPath} could not be read: ${error.message}`, contractCount);
  }
  const mismatch = offThePin(pinned, resolved, contractCount);
  if (mismatch !== null) return mismatch;
  return { ok: true, module: await loadEvalQuality() };
}

/**
 * The two refusals a normal install can produce, as pure functions of what the
 * tree answered.
 *
 * Split out of `resolveCompiler` so both are one-line calls inside it rather
 * than inline object literals repeated at every call site. `checkFailClosed`
 * drives each by injecting one of `resolveCompiler`'s reads rather than
 * calling either of these directly, so a wiring bug between `resolveCompiler`
 * and these two functions fails the same way a real broken tree would.
 *
 * @param {string} detail What `require.resolve` said.
 * @param {number} contractCount
 */
function unresolvable(detail, contractCount) {
  return {
    ok: false,
    exitCode: 2,
    lines: [
      `eval-quality could not be resolved, so ${contractCount} contract(s) went unchecked.`,
      detail,
      'Run npm ci, or npm link an unreleased build so eval-quality resolves to it. See test/contracts/README.md.',
    ],
  };
}

/**
 * @param {string} pinned What package.json declares.
 * @param {string} resolved What the installed tree answers.
 * @param {number} contractCount
 * @returns {null|{ok: false, exitCode: 2, lines: string[]}} Null when the tree is the tree this repository declares.
 */
function offThePin(pinned, resolved, contractCount) {
  if (resolved === pinned) return null;
  return {
    ok: false,
    exitCode: 2,
    lines: [
      `package.json pins eval-quality ${pinned} and the installed tree resolves ${resolved}, so ${contractCount} contract(s) went unchecked.`,
      'Run npm ci. A contract compiled against a release this repository does not declare is a result about some other package.',
    ],
  };
}

/**
 * Every way this check refuses to compile anything, driven through
 * `resolveCompiler` itself rather than described.
 *
 * All of them used to be one `catch { return null }` that printed a skip and
 * exited 0, so there was nothing to drive. They exist for days nobody will be
 * looking for them, which is the argument for running them on every gate: a
 * refusal nobody has watched is a refusal nobody has tested, and this one was
 * wrong for the whole life of the check.
 *
 * Each case injects one of `resolveCompiler`'s three reads to fail the way a
 * real tree would - an unresolvable manifest, a manifest that resolves and
 * will not parse, a `package.json` with no comparable pin, or an installed
 * version other than the one declared - and lets the real function's own
 * calls to `unresolvable` and `offThePin` produce the refusal. A wiring bug
 * inside `resolveCompiler`
 * (the wrong value threaded to `offThePin`, a swapped argument to
 * `unresolvable`) fails here the same way an actually broken tree would,
 * which a case built from `unresolvable(...)` or `offThePin(...)` called
 * directly cannot catch.
 *
 * Each asserts the exit class and the unchecked count, because the count is what
 * makes the message worth reading: "eval-quality could not be resolved" beside a
 * red line is a broken install, and the same sentence carrying "14 contract(s)
 * went unchecked" is what a reader needs to know went unmeasured.
 *
 * The driven count comes back with the problems rather than being transcribed by
 * the caller. A literal there is the same defect this story exists to remove one
 * size down: a sixth refusal added here would leave the line below reporting
 * five, and the reader would have no way to tell.
 *
 * @param {number} contractCount
 * @returns {Promise<{problems: string[], driven: number}>} `problems` is empty when every refusal is intact.
 */
async function checkFailClosed(contractCount) {
  const problems = [];
  const count = `${contractCount} contract(s) went unchecked`;
  const unresolvableMessage = "Cannot find module 'eval-quality/package.json'";
  const cases = [
    {
      id: 'an eval-quality that will not resolve',
      result: await resolveCompiler(contractCount, {
        resolveManifestPath: () => {
          throw new Error(unresolvableMessage);
        },
      }),
    },
    {
      id: 'an eval-quality manifest that resolves and will not read',
      result: await resolveCompiler(contractCount, {
        readInstalledVersion: () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      }),
    },
    {
      id: 'a package.json with no eval-quality pin to compare',
      result: await resolveCompiler(contractCount, { readTeaManifest: () => ({}) }),
    },
    {
      id: 'an installed version other than the pin',
      result: await resolveCompiler(contractCount, { readInstalledVersion: () => '1.4.0' }),
    },
  ];
  for (const { id, result } of cases) {
    if (result === null || result.ok !== false) {
      problems.push(`${id} produced a compiler rather than a refusal, so this check would compile against it or skip`);
      continue;
    }
    // The malformed-pin case is exit 1, the class test/test-eval-quality-corpus.js
    // gives the same condition, and it names no unchecked count because a pin
    // this repository cannot compare is a defect here rather than an
    // environment that measured nothing. Every other refusal is exit 2 and
    // names the count.
    if (id === 'a package.json with no eval-quality pin to compare') {
      if (result.exitCode !== 1) problems.push(`${id} refuses with exit ${result.exitCode}, and a pin this repository declares exits 1`);
      if (!result.lines.some((line) => line.includes('eval-quality devDependency'))) {
        problems.push(`${id} refuses without naming the missing pin: ${JSON.stringify(result.lines)}`);
      }
      continue;
    }
    if (result.exitCode !== 2)
      problems.push(`${id} refuses with exit ${result.exitCode}, and an environment that measured nothing exits 2`);
    if (!result.lines.some((line) => line.includes(count))) {
      problems.push(`${id} refuses without naming how many contracts went unchecked: ${JSON.stringify(result.lines)}`);
    }
  }
  const unreadableManifest = cases.find((c) => c.id === 'an eval-quality manifest that resolves and will not read').result;
  if (!unreadableManifest?.lines.some((line) => line.includes('could not be read'))) {
    problems.push(
      `an eval-quality manifest that resolves and will not read is not distinguished from one that never resolved: ${JSON.stringify(unreadableManifest?.lines ?? null)}`,
    );
  }
  // `pinned` here comes from the real package.json this repository ships,
  // read through the real (non-injected) `readTeaManifest`, so the message is
  // checked against both the real pin and the injected installed version
  // rather than against a literal transcribed here. Each is checked in its
  // own attributed phrase, not merely present anywhere in the message: a call
  // that swapped `pinned` and `resolved` would still mention both versions,
  // and a check for bare presence would not notice they had traded places.
  const realPin = pinnedVersion(JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')));
  const mismatch = cases.find((c) => c.id === 'an installed version other than the pin').result;
  if (!mismatch?.lines.some((line) => line.includes(`pins eval-quality ${realPin}`) && line.includes('resolves 1.4.0'))) {
    problems.push(
      `an installed version other than the pin refuses without correctly attributing the pin and the installed version: ${JSON.stringify(mismatch?.lines ?? null)}`,
    );
  }
  // The other half of the same guarantee: the tree this repository actually
  // declares must still produce a compiler, or the refusals above would be
  // satisfied by a function that refuses everything.
  const intact = await resolveCompiler(contractCount);
  if (!intact.ok) {
    problems.push(`the installed tree this repository declares is refused rather than producing a compiler: ${JSON.stringify(intact)}`);
  }
  return { problems, driven: cases.length };
}

/**
 * An RFC 6901 pointer over the value a parse issue names, with array indices
 * collapsed to `N`.
 *
 * The collapse is what keeps a suite that grows by a case from rewriting the
 * baseline while a new KIND of failure still does. The spelling is the one
 * `eval-quality` itself prints, escapes included, so a shape recorded before
 * this check moved in process still reads as the same shape.
 */
function issueShape(issuePath) {
  if (issuePath.length === 0) return '(root)';
  return issuePath
    .map((segment) => String(segment).replaceAll('~', '~0').replaceAll('/', '~1'))
    .map((segment) => `/${segment}`)
    .join('')
    .replaceAll(/\/\d+/g, '/N');
}

/**
 * One refused compile reduced to the distinct kinds of failure it carried.
 *
 * `code` is the error's own field, held against the two registries the compiler
 * throws codes from before it is recorded. It was `error.code ?? 'unknown'`, and
 * `unknown` is a string no registry publishes: a fault whose code moved upstream
 * recorded `unknown` into the baseline, matched `unknown` on the next run, and
 * the check stayed green over a compiler that had stopped saying what it
 * refused. A `RuntimeFault` carries a `RUNTIME_FAULT_CODES` member and a
 * `StructuralFailure` a `FAILURE_CODES` one, and the caller does not always know
 * which it is holding, so both registries are passed and the code is held
 * against their union.
 *
 * The issue locations come from the Zod error a schema failure carries as its
 * `cause`; a fault that carries no issues, which is every fault raised after the
 * parse succeeded, records an empty list rather than a guess.
 *
 * @param {{code?: unknown, cause?: {issues?: unknown}}} error
 * @param {{RUNTIME_FAULT_CODES: string[], FAILURE_CODES: string[]}} registries From the same resolution as the compiler that threw.
 * @throws {Error} When the code is a member of neither registry, which the caller reports as an environment that measured nothing.
 */
function failureShape(error, registries) {
  const issues = Array.isArray(error.cause?.issues) ? error.cause.issues : [];
  const shapes = new Set(issues.map((issue) => issueShape(issue.path)));
  const code = publishedMember(registries, error.code, `the code the ${error.constructor?.name ?? 'fault'} the compiler threw carries`);
  return { code, issueShapes: [...shapes].sort() };
}

/**
 * `failureShape`'s registry hold, driven with a fabricated code rather than
 * assumed from the compile loop that calls it for real.
 *
 * Every contract under test/contracts/ compiles today, which is the fact the
 * header explains at length, and the seeded faults below are refused with
 * codes the real compiler still publishes: `SEEDED_FAULTS` proves the issue
 * locations, not a moved vocabulary. So nothing in this file's normal run ever
 * hands `failureShape` a code outside `RUNTIME_FAULT_CODES` or `FAILURE_CODES`,
 * and the `?? 'unknown'` fallback this function replaced could be restored
 * here without one seeded fault or one compiled contract noticing. This check
 * is what notices: it calls `failureShape` directly with a code no registry
 * publishes and asserts the throw, the same way `checkFailClosed` drives the
 * resolution refusals rather than describing them.
 *
 * @param {{RUNTIME_FAULT_CODES: string[], FAILURE_CODES: string[]}} registries
 * @returns {string[]} Empty when the hold is intact.
 */
function checkFailureShapeHoldsRegistry(registries) {
  const problems = [];
  const fabricated = { code: 'forbidden-destination', constructor: { name: 'RuntimeFault' } };
  let thrown;
  try {
    failureShape(fabricated, registries);
  } catch (error) {
    thrown = error;
  }
  if (thrown === undefined) {
    problems.push(
      'failureShape returns a shape for a code no registry publishes rather than throwing, which is how the string "unknown" used to enter the baseline',
    );
  } else if (!thrown.message.includes('"forbidden-destination"') || !thrown.message.includes('RUNTIME_FAULT_CODES')) {
    problems.push(`failureShape's throw does not name the unpublished code and the registry it is missing from: ${thrown.message}`);
  }
  return problems;
}

/**
 * The check's own seeded faults, and the shape the compiler must report for each.
 *
 * Every contract under test/contracts/ compiles, so without these the blocked
 * arm of this check never runs: `failureShape` would be reached by nothing, and
 * a structured channel that stopped carrying the reason would read as fourteen
 * passes. That is the failure mode this whole file exists to prevent, arriving
 * through the check rather than through the contracts.
 *
 * Each case mutates a well-formed contract in one place and names the code and
 * the issue locations the compiler must answer with. Between them they cover
 * both error classes the compiler declares, all four spellings a location can
 * take (the root, a top-level key, a nested key under an array index, and a key
 * holding both characters RFC 6901 escapes), the array-index collapse the
 * baseline depends on, and the faults that carry no issue list at all.
 *
 * Every case runs against every contract, because all fourteen answer each one
 * identically today and a contract that stops doing so is worth hearing about.
 */
const SEEDED_FAULTS = [
  {
    id: 'a severity outside the published enum',
    seed: (contract) => {
      contract.behaviors[0].severity = 'not-a-severity';
      return contract;
    },
    expect: { code: 'schema-parse-failure', issueShapes: ['/behaviors/N/severity'] },
  },
  {
    id: 'a missing required identifier',
    seed: (contract) => {
      delete contract.contractId;
      return contract;
    },
    expect: { code: 'schema-parse-failure', issueShapes: ['/contractId'] },
  },
  {
    id: 'an input that is not an object at all',
    seed: () => 'not a contract',
    expect: { code: 'schema-parse-failure', issueShapes: ['(root)'] },
  },
  {
    id: 'an artifact stamped for another schema version',
    seed: (contract) => {
      contract.schemaVersion -= 1;
      return contract;
    },
    expect: { code: 'schema-version-mismatch', issueShapes: [] },
  },
  {
    // The escape branch of `issueShape`, which no other seed reaches. A record
    // key may hold both characters RFC 6901 escapes, and it is the one place the
    // shape could drift from the spelling `eval-quality` prints with nothing
    // noticing. A contract carrying no typed response descriptor leaves this
    // seed inert, and an inert seed is reported as one that compiled.
    id: 'a response-descriptor type key holding both escaped characters',
    seed: (contract) => {
      for (const declared of contract.permittedInterfaces) {
        for (const operation of declared.operations ?? []) {
          if (operation.responseDescriptor?.types) {
            operation.responseDescriptor.types['a/b~c'] = 123;
            return contract;
          }
        }
      }
      return contract;
    },
    expect: { code: 'schema-parse-failure', issueShapes: ['/permittedInterfaces/N/operations/N/responseDescriptor/types/a~1b~0c'] },
  },
  {
    id: 'a duplicated interface declaration',
    seed: (contract) => {
      contract.permittedInterfaces.push(structuredClone(contract.permittedInterfaces[0]));
      return contract;
    },
    expect: { code: 'unreachable-check-evidence', issueShapes: [] },
  },
];

/**
 * Every seeded fault against every contract, reported as the shapes that moved.
 *
 * A seed the compiler accepts is the loudest failure here: it means the mutation
 * stopped being a fault, so the case proves nothing about the channel any more.
 */
function seededFaultProblems(compile, contracts, faultClasses, registries) {
  const problems = [];
  for (const contract of contracts) {
    const key = path.relative(CONTRACT_ROOT, contract);
    let source;
    try {
      source = JSON.parse(fs.readFileSync(contract, 'utf8'));
    } catch {
      // A contract that does not parse has no well-formed body to seed a fault
      // into, and the main loop already reports it against the baseline. Seeding
      // here as well would report the same file twice under two different names.
      continue;
    }
    for (const { id, seed, expect } of SEEDED_FAULTS) {
      let observed;
      try {
        compile(seed(structuredClone(source)), { strict: true });
        problems.push(`${key}: seeded fault "${id}" compiled, so nothing exercises the blocked path through it`);
        continue;
      } catch (error) {
        // Out of the compiler's declared classes here is the same condition the
        // per-contract loop takes exit 2 for, and it takes exit 2 here too: the
        // header fixes one exit code for it, and a shape that moved is a
        // different finding from a compiler that threw something nobody models.
        if (!faultClasses.some((cls) => error instanceof cls)) {
          return {
            problems,
            fatal: `the compiler threw outside its declared classes on seeded fault "${id}" over ${key}: ${error.stack ?? error}`,
          };
        }
        try {
          observed = failureShape(error, registries);
        } catch (error_) {
          // A code the package publishes in neither registry is the same class
          // of finding as a throw outside the declared classes: the compiler's
          // vocabulary moved, so nothing here can say what it refused.
          return { problems, fatal: `seeded fault "${id}" over ${key}: ${error_.message}` };
        }
      }
      if (!sameShape({ status: 'blocked', ...observed }, { status: 'blocked', ...expect })) {
        problems.push(`${key}: seeded fault "${id}" reported ${JSON.stringify(observed)}, expected ${JSON.stringify(expect)}`);
      }
    }
  }
  return { problems, fatal: null };
}

function readBaseline() {
  if (!fs.existsSync(BASELINE)) return {};
  const parsed = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  return parsed.contracts ?? {};
}

function writeBaseline(observed) {
  const body = {
    $comment: [
      'The status this repository expects from each contract under test/contracts/.',
      '',
      'test/contracts/README.md records the finding behind whatever a contract here is not',
      '`compiles`: which failure code it carries against the pinned eval-quality release, and why.',
      '',
      'A contract whose status moves in either direction fails test/test-contracts.js. Moving to',
      '`compiles` is the good direction and still fails, on purpose: a baseline nobody has to update is',
      'a baseline nobody reads.',
      '',
      'Every contract here records `compiles`, so this fixture carries no failure code to check: the',
      'comparison short-circuits on that status and never reaches a `code` field. The check that holds',
      'every recovered code against the RUNTIME_FAULT_CODES and FAILURE_CODES eval-quality publishes',
      'applies to codes recovered at runtime, from the seeded faults this check compiles on every run,',
      'and it would apply to an entry here the day one of these contracts stops compiling.',
      '',
      'Regenerate with: node test/test-contracts.js --write',
    ],
    contracts: Object.fromEntries(
      Object.keys(observed)
        .sort()
        .map((key) => [key, observed[key]]),
    ),
  };
  fs.writeFileSync(BASELINE, `${JSON.stringify(body, null, 2)}\n`);
}

function sameShape(actual, expected) {
  if (!expected || actual.status !== expected.status) return false;
  if (actual.status === 'compiles') return true;
  return (
    actual.code === expected.code &&
    actual.issueShapes.length === (expected.issueShapes ?? []).length &&
    actual.issueShapes.every((shape, index) => shape === expected.issueShapes[index])
  );
}

async function main(argv) {
  const contracts = findContracts(CONTRACT_ROOT);
  if (contracts.length === 0) {
    console.error(`${colors.red}no *.contract.json found under test/contracts${colors.reset}`);
    return 1;
  }

  const write = argv.includes('--write');
  // Before the resolution, so the refusals are driven on every run including the
  // one that regenerates the baseline. Exit 1: a refusal that stopped refusing
  // is a defect in this file, which is a measured failure rather than an
  // environment that could not answer.
  const { problems: failClosed, driven } = await checkFailClosed(contracts.length);
  if (failClosed.length > 0) {
    for (const problem of failClosed) console.error(`${colors.red}CLOSED${colors.reset} ${problem}`);
    console.error(`\n${colors.red}${failClosed.length} fail-closed path(s) no longer refuse the way this check records.${colors.reset}`);
    return 1;
  }
  console.log(
    `${colors.green}OK${colors.reset}   ${driven} refusal(s) drive the fail-closed path ${colors.dim}(a package this repository cannot compare exits 1; every other refusal exits 2 and names ${contracts.length} contract(s) unchecked)${colors.reset}`,
  );

  const resolution = await resolveCompiler(contracts.length);
  if (!resolution.ok) {
    const [first, ...rest] = resolution.lines;
    console.error(`${colors.red}${first}${colors.reset}`);
    for (const line of rest) console.error(`${colors.dim}${line}${colors.reset}`);
    return resolution.exitCode;
  }
  const { compile, RuntimeFault, StructuralFailure, RUNTIME_FAULT_CODES, FAILURE_CODES } = resolution.module;
  // A module that resolved and is missing any of the three is a path naming
  // something that is not this package, which is this check invoked wrongly.
  if ([compile, RuntimeFault, StructuralFailure].some((value) => typeof value !== 'function')) {
    console.error(`${colors.red}the module named does not export compile, RuntimeFault and StructuralFailure${colors.reset}`);
    return 2;
  }
  const faultClasses = [RuntimeFault, StructuralFailure];
  // Destructured beside the classes, from the one resolution, for the same
  // reason the classes are: a code recovered from a fault thrown by this
  // compiler is held against the registries this compiler publishes, and an
  // unreleased build whose registries have moved is exactly the case linking
  // one in to test against exists to find out about.
  const registries = { RUNTIME_FAULT_CODES, FAILURE_CODES };

  // Driven immediately, before anything real compiles: nothing below ever
  // hands failureShape a code outside these registries, so this is the only
  // place the "never becomes unknown" guarantee is actually exercised rather
  // than assumed from a compile loop that can't produce the case.
  const registryHold = checkFailureShapeHoldsRegistry(registries);
  if (registryHold.length > 0) {
    for (const problem of registryHold) console.error(`${colors.red}CLOSED${colors.reset} ${problem}`);
    return 1;
  }

  const expected = readBaseline();
  const observed = {};
  const moved = [];
  // `validateArtifact` is the Ajv pass plus the schemaVersion check beside it,
  // over the published `eval-contract` schema. It answers a different question
  // than `compile` does, and runs independently of whether `compile` throws: a
  // contract can be well formed enough to compile while carrying a field Ajv
  // rejects, and a contract Ajv accepts can still fail `compile`'s own
  // structural rules. Neither result substitutes for the other.
  //
  // `validateArtifact` reads its schemas and version constants from the
  // installed `node_modules/eval-quality`, the same tree `compile` above runs
  // against, so the two checks always agree on which release they are reading.
  const ajvProblems = [];

  for (const contract of contracts) {
    const key = path.relative(CONTRACT_ROOT, contract);
    let actual;
    // Deserialization sits outside the compile, because a file that is not JSON
    // is a statement about this contract and not about the compiler. The binary
    // deserialized at its own boundary and raised `schema-parse-failure` with a
    // `SyntaxError` cause, which carries no issue list, so an unparsable
    // contract records the same shape here that it recorded through the spawn.
    let source;
    try {
      source = JSON.parse(fs.readFileSync(contract, 'utf8'));
    } catch (error) {
      observed[key] = { status: 'blocked', code: 'schema-parse-failure', issueShapes: [] };
      if (!write && !sameShape(observed[key], expected[key])) moved.push({ key, actual: observed[key], expected: expected[key] });
      console.error(`${colors.dim}${key} did not parse as JSON: ${error.message}${colors.reset}`);
      continue;
    }
    for (const message of await validateArtifact('eval-contract', source)) ajvProblems.push(`${key}: ${message}`);
    try {
      // `strict: true` is the compiler's own default and was the default of the
      // `--strict-inputs` flag this check used to leave unset, so AD-4's two
      // strict checks run here exactly as they ran behind the binary.
      compile(source, { strict: true });
      actual = { status: 'compiles' };
    } catch (error) {
      // The two classes the compiler declares. Anything else is a defect in the
      // compiler rather than a verdict on this contract, and the binary treated
      // it the same way: it rethrew and took its own fault exit for it.
      if (!faultClasses.some((cls) => error instanceof cls)) {
        console.error(`${colors.red}the compiler failed on ${key} in neither of its declared error classes${colors.reset}`);
        console.error(`${colors.dim}${error.stack ?? error}${colors.reset}`);
        return 2;
      }
      try {
        actual = { status: 'blocked', ...failureShape(error, registries) };
      } catch (error_) {
        // Exit 2 with the two lines above it. A code the compiler's own
        // registries do not carry says nothing about this contract: the
        // vocabulary moved, so the refusal cannot be recorded as a shape and
        // recording it anyway is how the string `unknown` used to enter the
        // baseline.
        console.error(`${colors.red}the compiler refused ${key} with a code no published registry carries${colors.reset}`);
        console.error(`${colors.dim}${error_.message}${colors.reset}`);
        return 2;
      }
    }
    observed[key] = actual;

    if (write) continue;
    if (sameShape(actual, expected[key])) {
      const note = actual.status === 'compiles' ? 'compiles' : `blocked on ${actual.code}, ${actual.issueShapes.length} issue shape(s)`;
      console.log(`${colors.green}OK${colors.reset}   ${key} ${colors.dim}(${note})${colors.reset}`);
      continue;
    }
    moved.push({ key, actual, expected: expected[key] });
  }

  // Before the write, because regenerating is what a reader does on the day
  // something moved, and a channel that stopped carrying the reason would
  // otherwise be recorded into the baseline by the same command.
  const { problems: seeded, fatal } = seededFaultProblems(compile, contracts, faultClasses, registries);
  if (fatal !== null) {
    console.error(`${colors.red}${fatal}${colors.reset}`);
    return 2;
  }
  if (seeded.length === 0) {
    console.log(
      `${colors.green}OK${colors.reset}   ${SEEDED_FAULTS.length} seeded fault(s) per contract ${colors.dim}(the blocked path still reports its code and its issue locations)${colors.reset}`,
    );
  }
  if (ajvProblems.length === 0) {
    console.log(
      `${colors.green}OK${colors.reset}   ${contracts.length} contract(s) also pass validateArtifact('eval-contract', ...) ${colors.dim}(Ajv and the schemaVersion stamp, independent of compile)${colors.reset}`,
    );
  }

  if (write) {
    if (seeded.length > 0 || ajvProblems.length > 0) {
      for (const problem of seeded) console.error(`${colors.red}SEED${colors.reset}  ${problem}`);
      for (const problem of ajvProblems) console.error(`${colors.red}AJV${colors.reset}   ${problem}`);
      console.error(`\n${colors.red}the baseline was not rewritten: fix the seeded faults and the Ajv problems first.${colors.reset}`);
      return 1;
    }
    writeBaseline(observed);
    console.log(`${colors.green}wrote${colors.reset} ${path.relative(PROJECT_ROOT, BASELINE)} for ${contracts.length} contract(s).`);
    return 0;
  }

  for (const problem of seeded) console.error(`${colors.red}SEED${colors.reset}  ${problem}`);
  for (const problem of ajvProblems) console.error(`${colors.red}AJV${colors.reset}   ${problem}`);

  for (const { key, actual, expected: before } of moved) {
    console.error(`${colors.red}MOVED${colors.reset} ${key}`);
    console.error(`  recorded: ${before ? JSON.stringify(before) : '(no entry)'}`);
    console.error(`  observed: ${JSON.stringify(actual)}`);
  }
  if (moved.length > 0) {
    console.error(
      `\n${colors.red}${moved.length} contract(s) moved away from the recorded status.${colors.reset} Re-run with --write once you have read why.`,
    );
  }
  if (seeded.length > 0) {
    console.error(`\n${colors.red}${seeded.length} seeded fault(s) no longer report the shape this check records for them.${colors.reset}`);
  }
  if (ajvProblems.length > 0) {
    console.error(`\n${colors.red}${ajvProblems.length} contract(s) failed validateArtifact('eval-contract', ...).${colors.reset}`);
  }
  if (moved.length > 0 || seeded.length > 0 || ajvProblems.length > 0) return 1;
  console.log(`\n${colors.green}${contracts.length} contract(s) match their recorded status.${colors.reset}`);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`${colors.red}the contract check could not run:${colors.reset} ${error.stack ?? error}`);
      process.exit(2);
    });
}

module.exports = {
  checkFailClosed,
  checkFailureShapeHoldsRegistry,
  findContracts,
  offThePin,
  resolveCompiler,
  failureShape,
  issueShape,
  unresolvable,
};
