#!/usr/bin/env node
/**
 * A stub version probe (Story 1.44) for a framework the test installs under
 * the project's `node_modules`: it prints `{ package, version }` read from the
 * package's `package.json`, found from this file's directory upward as
 * `installed-version.mjs` finds it. `--package <name>` names the package.
 * `--mode` changes what it prints:
 *
 *   exact          the observation (the default)
 *   wrong-package  the right version under another package's name
 *   garbage        text that is no JSON
 *   extra-key      the observation with a third property
 *   empty-version  the package with an empty version
 *   exit-1         nothing, exit 1
 *   hang           never exits
 *   noisy          5000 characters on each of stdout and stderr, then exit 1
 *
 * `--flip-at <n> --counter <file>` makes the n-th launch and every later one
 * print version 9.9.9, as an installed package that changes at an exact
 * observation of the run (Story 1.44's calibration cases).
 *
 * `--log <file>` appends one line with the names of the environment variables
 * it received and its working directory, so a test can hold the probe to the
 * evaluator's own environment and working-directory rules. With `--try-write`
 * the line also says whether a write beside this file, under `evaluator/`,
 * was `allowed` or `refused <code>`, which only a confined launch refuses.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 ? fallback : argv[at + 1];
};
const name = flag('--package', 'probe-fw');
const mode = flag('--mode', 'exact');
const log = flag('--log', null);
let write = null;
if (argv.includes('--try-write')) {
  // A gitignored cache name, as an interpreter would write beside itself.
  try {
    fs.mkdirSync(path.join(__dirname, '__pycache__'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '__pycache__', 'probe.bin'), 'written by the probe\n');
    write = 'allowed';
  } catch (error) {
    write = `refused ${error.code ?? error.message}`;
  }
}
if (log !== null) {
  fs.appendFileSync(log, `${JSON.stringify({ environment: Object.keys(process.env).sort(), cwd: process.cwd(), write })}\n`);
}

if (mode === 'exit-1') process.exit(1);
if (mode === 'noisy') {
  process.stdout.write('x'.repeat(5000));
  process.stderr.write('y'.repeat(5000));
  process.exit(1);
}
if (mode === 'hang') setInterval(() => {}, 1000);
const flipAt = Number(flag('--flip-at', 0));
let launch = 0;
if (flipAt > 0) {
  const counter = flag('--counter');
  launch = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0) + 1;
  fs.writeFileSync(counter, String(launch));
}
let directory = __dirname;
let manifest = null;
for (;;) {
  const file = path.join(directory, 'node_modules', ...name.split('/'), 'package.json');
  if (fs.existsSync(file)) {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    break;
  }
  const parent = path.dirname(directory);
  if (parent === directory) break;
  directory = parent;
}
if (manifest === null) {
  process.stderr.write(`${name} is not installed\n`);
  process.exit(1);
}
const printed = { package: manifest.name, version: flipAt > 0 && launch >= flipAt ? '9.9.9' : manifest.version };
if (mode === 'wrong-package') printed.package = 'another-package';
if (mode === 'empty-version') printed.version = '';
if (mode === 'extra-key') printed.extra = true;
if (mode !== 'hang') process.stdout.write(mode === 'garbage' ? 'not json\n' : `${JSON.stringify(printed)}\n`);
