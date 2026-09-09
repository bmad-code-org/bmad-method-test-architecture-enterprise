#!/usr/bin/env node
/**
 * The command `npm run test:probe-conformance` points eval-quality's published
 * conformance suite at.
 *
 * The suite's `cli` arm needs a real process it can make do nine specific
 * things: exit non-zero, receive a shell metacharacter as one literal token,
 * write a declared artifact, run past a wall clock, and print past an output
 * cap. A synthetic mechanism would prove nothing about the thing the adapter
 * exists to get right, which is why the package exports `nodeCommandMechanism`
 * and why this file is a real executable rather than a stub.
 *
 * It prints `{"argv": [...]}` on standard output, which is the shape the suite's
 * injection assertion reads, so a value that reached the process unexpanded can
 * be read back byte for byte.
 *
 * Options:
 *   --exit-code <n>   exit with this code after everything else
 *   --write <text>    write <text> to artifact.txt in the working directory
 *   --sleep-ms <n>    stay alive for this long before exiting
 *   --bytes <n>       print this many additional bytes on standard output
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2);

function valueOf(name) {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

function main() {
  process.stdout.write(`${JSON.stringify({ argv })}\n`);

  const bytes = Number.parseInt(valueOf('bytes') ?? '0', 10);
  if (Number.isInteger(bytes) && bytes > 0) process.stdout.write(`${'x'.repeat(bytes)}\n`);

  const text = valueOf('write');
  if (text !== undefined) fs.writeFileSync(path.join(process.cwd(), 'artifact.txt'), text, 'utf8');

  // `process.exitCode` and a natural exit, never `process.exit`. The adapter
  // captures this process through a pipe, so a write is asynchronous, and
  // exiting immediately abandons whatever has not drained. The `--bytes` case
  // writes past the authorization's output cap on purpose, which is exactly the
  // case a truncated stream would turn into a passing assertion.
  const exitCode = Number.parseInt(valueOf('exit-code') ?? '0', 10);
  const sleepMs = Number.parseInt(valueOf('sleep-ms') ?? '0', 10);
  process.exitCode = exitCode;
  if (Number.isInteger(sleepMs) && sleepMs > 0) setTimeout(() => {}, sleepMs);
}

main();
