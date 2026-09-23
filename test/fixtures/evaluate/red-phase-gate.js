#!/usr/bin/env node
/**
 * The registered target of the `tea-evaluate` check fixture
 * (`test/fixtures/evaluate/valid/`): a red-phase gate over one scaffold file.
 *
 * Exit codes:
 *   0  every test in the scaffold is declared with `test.skip(`
 *   1  the scaffold declares an active test, which is the seeded defect the
 *      fixture's P-002 signature addresses; this gate exits 1 on purpose
 *   3  the gate could not run: no scaffold path, an unreadable scaffold, or any
 *      unexpected error, which the top-level catch maps here so a crash never
 *      reads as the defect's exit 1
 */

'use strict';

const fs = require('node:fs');

try {
  const scaffold = process.argv[2];
  if (typeof scaffold !== 'string' || scaffold.length === 0) throw new Error('usage: red-phase-gate.js <scaffold>');
  const source = fs.readFileSync(scaffold, 'utf8');
  process.exitCode = /\btest\(/.test(source) ? 1 : 0;
} catch (error) {
  process.stderr.write(`red-phase-gate: ${error.message}\n`);
  process.exitCode = 3;
}
