/**
 * Proof that TeA's three isolation modules share one primitive layer (Story 1.62).
 *
 * `cli/lib/isolate.js`, `cli/lib/atdd-isolation.js` and
 * `cli/lib/evaluate/confinement.js` each selected a Seatbelt or Bubblewrap
 * mechanism with their own copy of four primitives: the executable lookup, the
 * check that a path can be carried into a profile or an argument vector, the
 * containment test and the probe of a trivial process. They now import
 * `cli/lib/isolation-primitives.js`, and this suite holds that in place:
 *
 *   golden    each module generates the same profiles and argument vectors it
 *             generated before the move (`test/fixtures/isolation-primitives/golden.json`,
 *             read through `test/lib/isolation-golden.js`)
 *   paths     every character a profile cannot carry is refused by all three
 *             callers, each with its own error class
 *   lookup    only a regular executable file resolves on a PATH
 *   probe     the shared probe reports a failed, signalled and missing process
 *   static    a module that defines a primitive again fails, and so does each
 *             copy restored into a module
 *
 * A story that changes a profile on purpose regenerates the golden with
 * `TEA_UPDATE_ISOLATION_GOLDEN=1 npm run test:isolation-primitives` and reads the diff.
 *
 * Usage: node test/test-isolation-primitives.js
 * Exit codes: 0 every property held, 1 a property did not hold
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const isolate = require('../cli/lib/isolate');
const atdd = require('../cli/lib/atdd-isolation');
const confinement = require('../cli/lib/evaluate/confinement');
const primitives = require('../cli/lib/isolation-primitives');
const { collectGeneratedOutputs } = require('./lib/isolation-golden');

const GOLDEN_PATH = path.join(__dirname, 'fixtures', 'isolation-primitives', 'golden.json');
const MODULES = [
  { name: 'cli/lib/isolate.js', file: path.join(__dirname, '..', 'cli', 'lib', 'isolate.js') },
  { name: 'cli/lib/atdd-isolation.js', file: path.join(__dirname, '..', 'cli', 'lib', 'atdd-isolation.js') },
  { name: 'cli/lib/evaluate/confinement.js', file: path.join(__dirname, '..', 'cli', 'lib', 'evaluate', 'confinement.js') },
];

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m', dim: '\u001B[2m' };
let failures = 0;

function assert(condition, label, detail) {
  if (condition) {
    console.log(`  ${colors.green}✓${colors.reset} ${label}`);
    return;
  }
  failures += 1;
  console.log(`  ${colors.red}✗ ${label}${colors.reset}`);
  if (detail) console.log(`    ${colors.dim}${detail}${colors.reset}`);
}

function section(title) {
  console.log(`\n${title}`);
}

/** What a caller throws for `thunk`, or `null` when it did not throw. */
function thrownBy(thunk) {
  try {
    thunk();
  } catch (error) {
    return error;
  }
  return null;
}

function checkGolden() {
  section('every module generates what it generated before the move');
  const actual = collectGeneratedOutputs();
  if (process.env.TEA_UPDATE_ISOLATION_GOLDEN === '1') {
    fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
    fs.writeFileSync(GOLDEN_PATH, `${JSON.stringify(actual, null, 2)}\n`);
    console.log(`  rewrote ${path.relative(process.cwd(), GOLDEN_PATH)}`);
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  assert(
    JSON.stringify(Object.keys(actual).sort()) === JSON.stringify(Object.keys(golden).sort()),
    'the golden names the same generated outputs',
    `golden: ${Object.keys(golden).join(', ')}`,
  );
  for (const key of Object.keys(golden)) {
    assert(
      JSON.stringify(actual[key]) === JSON.stringify(golden[key]),
      `${key} is byte-identical to the golden`,
      JSON.stringify(actual[key]),
    );
  }
}

/** One character per kind a profile cannot carry, and the safe paths beside them. */
const UNSAFE_CHARACTERS = [
  ['a double quote', '"'],
  ['a backslash', '\\'],
  ['a line feed', '\n'],
  ['a carriage return', '\r'],
  ['a tab', '\t'],
  ['a NUL', '\u0000'],
  ['an escape', '\u001B'],
  ['a delete', '\u007F'],
];

/** A PATH directory holding a `bwrap` that confines nothing and exits 0, so a probe of it passes on any host. */
function withStubMechanism(body) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-isolation-stub-'));
  try {
    fs.writeFileSync(path.join(bin, 'bwrap'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    return body(bin);
  } finally {
    fs.rmSync(bin, { recursive: true, force: true });
  }
}

/** The error a caller refuses with, or `null`; a refusal `selectConfinement` returns instead of throwing counts. */
function refusalOfSelection(selected) {
  return selected.refusal === undefined ? null : Object.assign(new Error(selected.refusal), { name: 'ConfinementRefusal' });
}

function checkPaths() {
  section('one refusal of unsafe path characters for all three callers');
  const plain = '/proj/evaluations/demo';
  const confined = { mode: 'bubblewrap', executable: '/usr/bin/bwrap', evaluationFolder: '/eval/folder' };
  const seatbelt = { mode: 'seatbelt', executable: '/usr/bin/sandbox-exec', evaluationFolder: '/eval/folder' };
  const isolateRefused = (error) => error.code === 'ISOLATION_ERROR';
  const atddRefused = (error) => error.code === 'ISOLATION_UNAVAILABLE';
  const confinementRefused = (error) => error.name === 'ConfinementError';
  const callers = [
    {
      name: 'isolate.buildSandboxProfile',
      call: (candidate) => isolate.buildSandboxProfile([candidate], '/tmp'),
      refused: isolateRefused,
    },
    {
      name: 'isolate.buildBwrapPrefix',
      call: (candidate) => isolate.buildBwrapPrefix(candidate, '/tmp/tea-writable'),
      refused: isolateRefused,
    },
    {
      name: 'atdd.buildSeatbeltProfile',
      call: (candidate) => atdd.buildSeatbeltProfile({ workspace: candidate }),
      refused: atddRefused,
    },
    {
      name: 'atdd.sandboxedCommand (bubblewrap)',
      call: (candidate) => atdd.sandboxedCommand({ backend: 'bubblewrap', workspace: candidate, cpuSeconds: 1, command: 'node', args: [] }),
      refused: atddRefused,
    },
    {
      name: 'confinement.layerPrefix (seatbelt)',
      call: (candidate) => confinement.layerPrefix({ ...seatbelt, evaluationFolder: candidate }),
      refused: confinementRefused,
    },
    {
      name: 'confinement.layerPrefix (bubblewrap)',
      call: (candidate) => confinement.layerPrefix({ ...confined, evaluationFolder: candidate }),
      refused: confinementRefused,
    },
    {
      name: 'confinement.targetSandbox (seatbelt) workspace',
      call: (candidate) => confinement.targetSandbox({ confinement: seatbelt, workspace: candidate }).wrap('node', []),
      refused: confinementRefused,
    },
    {
      name: 'confinement.targetSandbox (seatbelt) private directory',
      call: (candidate) => confinement.targetSandbox({ confinement: seatbelt, workspace: '/proj/w' }).wrap('node', [], [candidate]),
      refused: confinementRefused,
    },
    {
      name: 'confinement.targetSandbox (seatbelt) evaluation folder',
      call: (candidate) =>
        confinement.targetSandbox({ confinement: { ...seatbelt, evaluationFolder: candidate }, workspace: '/proj/w' }).wrap('node', []),
      refused: confinementRefused,
    },
    {
      name: 'confinement.targetSandbox (bubblewrap) workspace',
      call: (candidate) =>
        withStatusDirectory((status) =>
          confinement.targetSandbox({ confinement: confined, workspace: candidate, status }).wrap('node', []),
        ),
      refused: confinementRefused,
    },
    {
      name: 'confinement.targetSandbox (bubblewrap) private directory',
      call: (candidate) =>
        withStatusDirectory((status) =>
          confinement.targetSandbox({ confinement: confined, workspace: '/proj/w', status }).wrap('node', [], [candidate]),
        ),
      refused: confinementRefused,
    },
    {
      name: 'confinement.selectConfinement evaluation folder',
      call: (candidate) =>
        withStubMechanism((bin) =>
          refuseOrReturn(
            refusalOfSelection(
              confinement.selectConfinement({
                evaluation: {},
                folder: candidate,
                env: { PATH: bin, [confinement.PLATFORM_ENV]: 'linux' },
                platform: 'linux',
              }),
            ),
          ),
        ),
      refused: (error) => error.name === 'ConfinementRefusal' && error.message.includes("the evaluation folder's path"),
    },
  ];
  for (const caller of callers) {
    assert(thrownBy(() => caller.call(plain)) === null, `${caller.name} carries a plain path`);
    for (const [label, character] of UNSAFE_CHARACTERS) {
      const error = thrownBy(() => caller.call(`/proj/evaluations/de${character}mo`));
      assert(
        error !== null && caller.refused(error),
        `${caller.name} refuses a path holding ${label}`,
        error ? `${error.name}: ${error.message}` : 'no error',
      );
    }
  }

  // The temp directory comes from the environment, which cannot hold a NUL.
  withStubMechanism((bin) => {
    for (const [label, character] of UNSAFE_CHARACTERS.filter(([, candidate]) => candidate !== '\u0000')) {
      const saved = process.env.TMPDIR;
      process.env.TMPDIR = `/proj/te${character}mp`;
      let selected;
      try {
        selected = confinement.selectConfinement({
          evaluation: {},
          folder: plain,
          env: { PATH: bin, [confinement.PLATFORM_ENV]: 'linux' },
          platform: 'linux',
        });
      } finally {
        if (saved === undefined) delete process.env.TMPDIR;
        else process.env.TMPDIR = saved;
      }
      assert(
        typeof selected.refusal === 'string' && selected.refusal.includes('the temp directory'),
        `confinement.selectConfinement refuses a temp directory holding ${label}`,
        JSON.stringify(selected),
      );
    }
  });

  // A link can name a path no profile carries, so the real spelling is held to the same rule.
  const linked = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-isolation-link-'));
  try {
    const real = path.join(linked, 'real"quoted');
    fs.mkdirSync(real);
    const link = path.join(linked, 'link');
    fs.symlinkSync(real, link);
    const error = thrownBy(() => isolate.buildSandboxProfile([link], '/tmp'));
    assert(error !== null && isolateRefused(error), 'isolate.buildSandboxProfile refuses a link to a path holding a quote', error?.message);
    const atddError = thrownBy(() => atdd.buildSeatbeltProfile({ workspace: link }));
    assert(
      atddError !== null && atddRefused(atddError),
      'atdd.buildSeatbeltProfile refuses a link to a path holding a quote',
      atddError?.message,
    );
  } finally {
    fs.rmSync(linked, { recursive: true, force: true });
  }

  assert(
    primitives.isProfileSafePath(plain) && !primitives.isProfileSafePath('relative/path') && !primitives.isProfileSafePath(null),
    'the shared check wants an absolute string',
  );
}

/** Runs `body` with a directory the Bubblewrap target's status file may be written in. */
function withStatusDirectory(body) {
  const status = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-isolation-status-'));
  try {
    return body(status);
  } finally {
    fs.rmSync(status, { recursive: true, force: true });
  }
}

/** Throws `refusal` when there is one, so a thunk that returns a refusal reads like one that throws. */
function refuseOrReturn(refusal) {
  if (refusal !== null) throw refusal;
}

function checkContainment() {
  section('containment');
  assert(primitives.isInside('/proj', '/proj'), 'a root contains itself');
  assert(primitives.isInside('/proj', '/proj/a/b'), 'a root contains what is below it');
  assert(primitives.isInside('/proj', '/proj/..data/x'), 'a directory named with two leading dots is inside, not above');
  assert(!primitives.isInside('/proj', '/proj-other/a'), 'a sibling that shares a prefix is outside');
  assert(!primitives.isInside('/proj/a', '/proj'), 'a parent is outside its child');
  assert(!primitives.isInside('/proj', '/proj/../etc'), 'a path that climbs out is outside');
}

function checkLookup() {
  section('only a regular executable file resolves on a PATH');
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-isolation-lookup-'));
  try {
    fs.mkdirSync(path.join(bin, 'tool-directory'));
    fs.writeFileSync(path.join(bin, 'tool-plain'), '', { mode: 0o644 });
    fs.writeFileSync(path.join(bin, 'tool-executable'), '#!/bin/sh\n', { mode: 0o755 });
    const env = { PATH: ['', '/nonexistent-tea-directory', bin].join(path.delimiter) };
    assert(
      primitives.executableOnPath('tool-executable', env) === path.join(bin, 'tool-executable'),
      'an executable file resolves to its path',
    );
    assert(primitives.executableOnPath('tool-plain', env) === null, 'a file without the execute bit does not resolve');
    assert(primitives.executableOnPath('tool-directory', env) === null, 'a directory does not resolve');
    assert(primitives.executableOnPath('tool-missing', env) === null, 'an absent name does not resolve');
    assert(primitives.executableOnPath('tool-executable', {}) === null, 'an environment with no PATH resolves nothing');
  } finally {
    fs.rmSync(bin, { recursive: true, force: true });
  }
}

function checkProbe() {
  section('the shared probe reports what happened to the trivial process');
  assert(primitives.probeTrivialProcess({ vector: [...primitives.TRIVIAL_PROCESS] }).ok === true, 'a trivial process that exits 0 is ok');
  const failed = primitives.probeTrivialProcess({
    vector: [process.execPath, '-e', String.raw`console.error('one\ntwo\nthree'); process.exit(3)`],
  });
  assert(
    failed.ok === false && failed.status === 3 && failed.tail === 'two | three',
    'a failed process reports its exit and the last two lines it said',
    JSON.stringify(failed),
  );
  const signalled = primitives.probeTrivialProcess({ vector: [process.execPath, '-e', "process.kill(process.pid, 'SIGKILL')"] });
  assert(
    signalled.ok === false && signalled.status === null && signalled.signal === 'SIGKILL',
    'a signalled process reports the signal',
    JSON.stringify(signalled),
  );
  const missing = primitives.probeTrivialProcess({ vector: ['/nonexistent-tea-mechanism', ...primitives.TRIVIAL_PROCESS] });
  assert(missing.ok === false && missing.error?.code === 'ENOENT', 'an absent mechanism reports the spawn error', JSON.stringify(missing));
}

/**
 * The source with its whole-line comments removed, so a primitive named in a
 * comment is not a definition. A comment that follows code is left, and so is
 * a `/*` inside a string, which a stripper that matched any `/*` would read as
 * a comment and swallow the code after it.
 */
function withoutComments(source) {
  return source.replaceAll(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, '').replaceAll(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * The primitives a module's source defines for itself, by what a copy cannot
 * avoid containing. This is the backstop: `checkReached` holds that each module
 * calls the shared primitive, and `localDeclarations` holds the names.
 */
function localCopies(source) {
  const code = withoutComments(source);
  const copies = [];
  if (/\bX_OK\b/.test(code) || /\bpath\.delimiter\b/.test(code)) copies.push('executable lookup');
  if (/\/\[[^\]\n]*(?:\\[nr]|\\u0000|\\x00)/.test(code) || /new RegExp\([^)]*\\\\?[nr]/.test(code)) copies.push('profile-path check');
  if (/startsWith\((?:'\.\.|`\.\.|"\.\.)/.test(code) || /startsWith\([^)]*path\.sep/.test(code)) copies.push('containment test');
  if (/'-e'|'--eval'/.test(code) || /\.slice\(-2\)/.test(code) || /\.slice\(\s*\w+\.length\s*-\s*2\s*\)/.test(code)) {
    copies.push('mechanism probe');
  }
  return copies;
}

/** The names a module may only import: a declaration with one of them is a local copy. */
const SHARED_NAMES = ['executableOnPath', 'isInside', 'profileSafe', 'assertProfileSafePath', 'isProfileSafePath', 'stderrTail'];

function localDeclarations(source) {
  const code = withoutComments(source);
  return SHARED_NAMES.filter((name) =>
    new RegExp(String.raw`(?:function\s+${name}\b|(?:const|let|var)\s+${name}\s*=|\b${name}\s*[:=]\s*(?:async\s*)?(?:function|\())`).test(
      code,
    ),
  );
}

/** Each copy as the modules held it before the move, appended to a module to restore it. */
const RESTORED_COPIES = [
  [
    'executable lookup',
    `function executableOnPath(name, env = process.env) {
  for (const dir of (env.PATH || '').split(path.delimiter)) {
    try { fs.accessSync(path.join(dir, name), fs.constants.X_OK); return true; } catch {}
  }
  return false;
}`,
  ],
  [
    'executable lookup',
    'function find(name, env) { for (const dir of env.PATH.split(path.delimiter)) { if (fs.existsSync(path.join(dir, name))) return dir; } return null; }',
  ],
  ['containment test', 'const inside = (root, candidate) => candidate.startsWith(root + path.sep);'],
  ['mechanism probe', String.raw`const lines = text.split('\n'); const tail = lines.slice(lines.length - 2).join(' | ');`],
  ['profile-path check', String.raw`function assertProfileSafePath(filePath) { if (/["\n\r]/.test(filePath)) throw new Error(filePath); }`],
  [
    'profile-path check',
    String.raw`function profileSafe(candidate) { if (!path.isAbsolute(candidate) || /["\\\n\r]/.test(candidate)) throw new Error(candidate); }`,
  ],
  [
    'containment test',
    'function isInside(child, parent) { const relative = path.relative(parent, child); return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative); }',
  ],
  [
    'containment test',
    'function isInside(root, candidate) { const relative = path.relative(root, candidate); return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`)); }',
  ],
  ['mechanism probe', "const result = spawnSync(vector[0], [...vector.slice(1), process.execPath, '-e', ''], { encoding: 'utf8' });"],
  ['mechanism probe', String.raw`const tail = String(result.stderr ?? '').trim().split('\n').slice(-2).join(' | ');`],
];

/** Loads the three modules afresh over a shared module whose primitives count their calls, drives each, and returns the counts. */
function reachedPrimitives() {
  const names = ['executableOnPath', 'isInside', 'isProfileSafePath', 'assertProfileSafePath', 'probeTrivialProcess'];
  const sharedFile = require.resolve('../cli/lib/isolation-primitives');
  const files = [sharedFile, ...MODULES.map((module) => module.file)];
  const saved = files.map((file) => require.cache[file]);
  for (const file of files) delete require.cache[file];
  const counts = {};
  let current = null;
  try {
    const spied = require('../cli/lib/isolation-primitives');
    for (const name of names) {
      const original = spied[name];
      spied[name] = (...args) => {
        counts[current] = counts[current] ?? {};
        counts[current][name] = (counts[current][name] ?? 0) + 1;
        return original(...args);
      };
    }
    const freshIsolate = require('../cli/lib/isolate');
    const freshAtdd = require('../cli/lib/atdd-isolation');
    const freshConfinement = require('../cli/lib/evaluate/confinement');
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-isolation-reach-'));
    withStubMechanism((bin) => {
      current = MODULES[0].name;
      freshIsolate.selectBackend({ PATH: bin }, 'linux');
      freshIsolate.buildSandboxProfile(['/proj/out.md'], '/tmp');
      freshIsolate.buildBwrapPrefix('/proj', '/tmp/tea-writable');
      const savedBackend = process.env.TEA_TEST_REVIEW_ISOLATION;
      process.env.TEA_TEST_REVIEW_ISOLATION = 'chmod';
      try {
        freshIsolate.withIsolation(project, [path.join(project, 'out', 'report.md')], () => {});
      } finally {
        if (savedBackend === undefined) delete process.env.TEA_TEST_REVIEW_ISOLATION;
        else process.env.TEA_TEST_REVIEW_ISOLATION = savedBackend;
        fs.chmodSync(project, 0o755);
      }

      current = MODULES[1].name;
      freshAtdd.selectBackend({ env: { PATH: bin }, platform: 'linux' });
      freshAtdd.buildSeatbeltProfile({ workspace: '/proj/w' });
      freshAtdd.probeBackend({ backend: 'bubblewrap', workspace: project });

      current = MODULES[2].name;
      freshConfinement.selectConfinement({
        evaluation: {},
        folder: '/proj/evaluations/demo',
        env: { PATH: bin, [freshConfinement.PLATFORM_ENV]: 'linux' },
        platform: 'linux',
      });
      const mechanism = { mode: 'seatbelt', executable: '/usr/bin/sandbox-exec', evaluationFolder: '/proj/evaluations/demo' };
      freshConfinement.targetSandbox({ confinement: mechanism, workspace: '/proj/w' }).wrap('node', []);
    });
    fs.rmSync(project, { recursive: true, force: true });
  } finally {
    for (const file of files) delete require.cache[file];
    for (const [index, file] of files.entries()) {
      if (saved[index] !== undefined) require.cache[file] = saved[index];
    }
  }
  return counts;
}

function checkReached() {
  section('every module calls the shared primitives');
  const counts = reachedPrimitives();
  const expected = {
    [MODULES[0].name]: ['executableOnPath', 'assertProfileSafePath', 'isInside'],
    [MODULES[1].name]: ['executableOnPath', 'assertProfileSafePath', 'probeTrivialProcess'],
    [MODULES[2].name]: ['executableOnPath', 'assertProfileSafePath', 'isProfileSafePath', 'isInside', 'probeTrivialProcess'],
  };
  for (const [name, primitivesReached] of Object.entries(expected)) {
    for (const primitive of primitivesReached) {
      assert((counts[name]?.[primitive] ?? 0) > 0, `${name} reaches the shared ${primitive}`, JSON.stringify(counts[name] ?? {}));
    }
  }
}

function checkStatic() {
  section('no module keeps its own copy of a shared primitive');
  for (const module of MODULES) {
    const source = fs.readFileSync(module.file, 'utf8');
    assert(/require\('(?:\.|\.\.)\/isolation-primitives'\)/.test(source), `${module.name} imports the shared primitives`);
    const copies = localCopies(source);
    assert(copies.length === 0, `${module.name} defines no primitive of its own`, copies.join(', '));
    const declared = localDeclarations(source);
    assert(declared.length === 0, `${module.name} declares none of the shared names`, declared.join(', '));
    for (const [primitive, copy] of RESTORED_COPIES) {
      const found = localCopies(`${source}\n${copy}\n`);
      assert(
        found.includes(primitive),
        `restoring a local ${primitive} in ${module.name} fails the scan`,
        `found: ${found.join(', ') || 'nothing'}`,
      );
    }
    for (const name of SHARED_NAMES) {
      const restored = localDeclarations(`${source}\nfunction ${name}() {}\n`);
      assert(restored.includes(name), `declaring ${name} again in ${module.name} fails the scan`);
    }
  }
  const shared = fs.readFileSync(path.join(__dirname, '..', 'cli', 'lib', 'isolation-primitives.js'), 'utf8');
  assert(
    localCopies(shared).length === 4,
    'the shared module is where the four primitives are defined',
    `found: ${localCopies(shared).join(', ') || 'nothing'}`,
  );
}

checkGolden();
checkPaths();
checkContainment();
checkLookup();
checkProbe();
checkReached();
checkStatic();

if (failures > 0) {
  console.log(`\n${colors.red}${failures} check${failures === 1 ? '' : 's'} failed${colors.reset}`);
  process.exit(1);
}
console.log(`\n${colors.green}isolation primitives are shared${colors.reset}`);
