/**
 * Check every Behavioral Evaluation Contract under test/contracts/ against the
 * status test/contracts/expected-status.json records for it.
 *
 * The contracts are the machine-checkable statement of what a TEA skill has to
 * do. Nothing else in this repository can tell you whether one is well formed,
 * because the format belongs to eval-quality and its compiler is the only
 * authority on it.
 *
 * All thirteen contracts compile today. They did not when they were written: against
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
 * This check never passes silently. eval-quality is a declared devDependency, so
 * the compiler resolves in a normal install; a tree installed with --omit=dev
 * gets a skip that says it skipped.
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
 *   node test/test-contracts.js --package /path/to/eval-quality/dist/index.js
 *   node test/test-contracts.js --package <path> --write   # rewrite the baseline
 *
 * Exit codes:
 *   0  every contract matched its recorded status, or the compiler is absent
 *   1  a contract's status or failure shape moved away from the baseline, or a
 *      seeded fault stopped reporting the shape recorded for it
 *   2  the compiler was named and could not be loaded, or it failed in a way
 *      that is neither of its two declared error classes
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { loadEvalQuality } = require('./lib/eval-quality-inputs');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONTRACT_ROOT = path.join(__dirname, 'contracts');
const BASELINE = path.join(CONTRACT_ROOT, 'expected-status.json');

const colors = {
  reset: '\u001B[0m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
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
 * The compiler's module, or null when the package is not installed.
 *
 * The whole namespace rather than the one function, because the error classes
 * this check tests against have to come from the same module instance as the
 * compiler that threw: `instanceof` is false across two copies of the package,
 * so taking `compile` from a local build and `RuntimeFault` from the installed
 * one would report every fault as outside the compiler's declared classes.
 *
 * An explicit --package wins, so the check can run against a local build before
 * a release reaches npm. require.resolve settles the installed case, because it
 * answers from this repository's own resolution rather than from whatever
 * happens to be on PATH, and `loadEvalQuality` is the same accessor the rest of
 * the test tree imports the package through.
 */
async function resolveCompiler(argv) {
  const flagIndex = argv.indexOf('--package');
  if (flagIndex !== -1) {
    const value = argv[flagIndex + 1];
    if (!value) {
      console.error(`${colors.red}--package requires a path to eval-quality's built entry point${colors.reset}`);
      process.exit(2);
    }
    if (!fs.existsSync(value)) {
      console.error(`${colors.red}--package names a path that does not exist: ${value}${colors.reset}`);
      process.exit(2);
    }
    return await import(pathToFileURL(path.resolve(value)).href);
  }
  try {
    // eval-quality is a declared devDependency, so this resolves in a normal
    // install. The catch below is for a tree installed with --omit=dev, where
    // the honest answer is a skip that says it skipped.
    require.resolve('eval-quality/package.json', { paths: [PROJECT_ROOT] });
  } catch {
    return null;
  }
  return loadEvalQuality();
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
 * `code` is the error's own field. The issue locations come from the Zod error
 * a schema failure carries as its `cause`; a fault that carries no issues, which
 * is every fault raised after the parse succeeded, records an empty list rather
 * than a guess.
 */
function failureShape(error) {
  const issues = Array.isArray(error.cause?.issues) ? error.cause.issues : [];
  const shapes = new Set(issues.map((issue) => issueShape(issue.path)));
  return { code: error.code ?? 'unknown', issueShapes: [...shapes].sort() };
}

/**
 * The check's own seeded faults, and the shape the compiler must report for each.
 *
 * Every contract under test/contracts/ compiles, so without these the blocked
 * arm of this check never runs: `failureShape` would be reached by nothing, and
 * a structured channel that stopped carrying the reason would read as thirteen
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
 * Every case runs against every contract, because all thirteen answer each one
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
function seededFaultProblems(compile, contracts, faultClasses) {
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
        observed = failureShape(error);
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
      'Regenerate with: node test/test-contracts.js --package <path to eval-quality dist/index.js> --write',
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
  const evalQuality = await resolveCompiler(argv);
  if (evalQuality === null) {
    console.log(
      `${colors.yellow}skipped${colors.reset}: eval-quality is not installed, so ${contracts.length} contract(s) went unchecked.`,
    );
    console.log(`${colors.dim}Install it, or pass --package <path to dist/index.js>. See test/contracts/README.md.${colors.reset}`);
    return 0;
  }
  const { compile, RuntimeFault, StructuralFailure } = evalQuality;
  // A module that resolved and is missing any of the three is a path naming
  // something that is not this package, which is this check invoked wrongly.
  if ([compile, RuntimeFault, StructuralFailure].some((value) => typeof value !== 'function')) {
    console.error(`${colors.red}the module named does not export compile, RuntimeFault and StructuralFailure${colors.reset}`);
    return 2;
  }
  const faultClasses = [RuntimeFault, StructuralFailure];

  const expected = readBaseline();
  const observed = {};
  const moved = [];

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
      actual = { status: 'blocked', ...failureShape(error) };
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
  const { problems: seeded, fatal } = seededFaultProblems(compile, contracts, faultClasses);
  if (fatal !== null) {
    console.error(`${colors.red}${fatal}${colors.reset}`);
    return 2;
  }
  if (seeded.length === 0) {
    console.log(
      `${colors.green}OK${colors.reset}   ${SEEDED_FAULTS.length} seeded fault(s) per contract ${colors.dim}(the blocked path still reports its code and its issue locations)${colors.reset}`,
    );
  }

  if (write) {
    if (seeded.length > 0) {
      for (const problem of seeded) console.error(`${colors.red}SEED${colors.reset}  ${problem}`);
      console.error(`\n${colors.red}the baseline was not rewritten: fix the seeded faults first.${colors.reset}`);
      return 1;
    }
    writeBaseline(observed);
    console.log(`${colors.green}wrote${colors.reset} ${path.relative(PROJECT_ROOT, BASELINE)} for ${contracts.length} contract(s).`);
    return 0;
  }

  for (const problem of seeded) console.error(`${colors.red}SEED${colors.reset}  ${problem}`);

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
  if (moved.length > 0 || seeded.length > 0) return 1;
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

module.exports = { findContracts, resolveCompiler, failureShape, issueShape };
