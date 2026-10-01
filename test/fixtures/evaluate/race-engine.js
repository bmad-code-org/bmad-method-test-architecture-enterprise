#!/usr/bin/env node
/**
 * A stand-in for the eval-quality CLI that runs the real one and then acts as a
 * process changing the run directory while `tea-evaluate score` runs (Story
 * 1.41), reached through `TEA_EVALUATE_ENGINE_CLI`.
 *
 * It appends its argv as one JSON line to `TEA_RACE_LOG`, runs the installed
 * eval-quality CLI over the same argv with its streams and exit code passed
 * through, and then, once the real call has finished and before it exits,
 * performs the attack `TEA_RACE_MODE` names. The run directory is derived from
 * the `--record` path, `TEA_RACE_TARGET` is the directory every link points at,
 * and `TEA_RACE_SENTINEL` is a file inside it:
 *
 * - `swap-scores`, `swap-invocation`, `swap-probe`: the directory is moved
 *   aside and a link to the target takes its place, with the path the runtime
 *   would write through already made inside the target, so a followed link
 *   would land the write there.
 * - `plant-next-probe`: a link is planted where the next probe's directory
 *   will be made.
 * - `plant-record`, `plant-evidence`, `plant-summary`: a link to the sentinel is
 *   planted where the probe's `score.json`, its evidence artifact or the
 *   invocation's `score.json` will be written.
 * - `forge-corpus`, `forge-schema`, `garbage`, `forge-probe`, `stage-link`: the
 *   staged evidence artifact (`--out`) is replaced with the artifact of another
 *   corpus, with one that keeps its corpus digest and its probe's outcome but
 *   loses a required field and gains a forbidden one, with
 *   bytes that are no artifact, with the artifact of the previous probe
 *   (`TEA_RACE_STASH` keeps it between calls), or with a link to a valid artifact.
 *
 * Story 1.68 adds modes that act on the inputs the engine reads, named by the
 * input's kind (`record`, `contract`, `preflight`, `policy`, `configuration`,
 * `probe` or `manifest`, and `unreadable`, the first record turned into bytes
 * that are no JSON):
 *
 * - `rewrite-<kind>`: the file is rewritten before the real call and kept, so
 *   the engine scores the new bytes and the run directory holds them afterwards.
 * - `restore-<kind>`: the file is rewritten before the real call and put back
 *   byte for byte once it has finished, so only the engine's read ever saw the
 *   new bytes.
 * - `plant-manifest`: after the real call a file is written where the trial set
 *   has no isolation manifest (a set that has one is left alone).
 * - `forge-outcomes`: the staged evidence artifact is replaced with a
 *   schema-valid one that keeps its corpus digest and its probe's outcome and
 *   flips what the outcome says.
 * - `stage-stashed`: after the real call the evidence artifact an earlier
 *   score kept for the probe (`TEA_RACE_STASH_DIR/<probe>/evidence-artifact.json`)
 *   is copied to `--out`, whether or not the call staged one.
 *
 * `TEA_RACE_PROBE`, when set, limits those modes to the call that scores that
 * probe.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { engineCliPath } = require('../../../cli/lib/evaluate/engine');

const argv = process.argv.slice(2);
const value = (flag) => argv[argv.indexOf(flag) + 1];
fs.appendFileSync(process.env.TEA_RACE_LOG, `${JSON.stringify(argv)}\n`);

const mode = process.env.TEA_RACE_MODE ?? '';
const target = process.env.TEA_RACE_TARGET;
const sentinel = process.env.TEA_RACE_SENTINEL;
const stash = process.env.TEA_RACE_STASH;
const out = value('--out');
const probe = path.basename(value('--probe')).replace(/\.probe\.json$/, '');
const record = value('--record');
const runDirectory = record.slice(0, record.indexOf(`${path.sep}trial-sets${path.sep}`));
const scores = path.join(runDirectory, 'scores');
// The invocation `score` is making now is the newest; names sort by start time.
const invocation = fs.existsSync(scores)
  ? fs
      .readdirSync(scores)
      .filter((name) => !name.endsWith('.moved') && fs.lstatSync(path.join(scores, name)).isDirectory())
      .sort()
      .at(-1)
  : undefined;

/** The flag that names each kind of input, and the change that makes the engine read something else (and keeps it a valid input where it can). */
const INPUTS = {
  // The recommendation flips and the findings go, so both the artifact and what a view shows of the record change.
  record: [
    '--record',
    (input) => {
      input.evaluatorRecommendation = input.evaluatorRecommendation === 'FAIL' ? 'PASS' : 'FAIL';
      input.findings = [];
    },
  ],
  contract: ['--contract', (input) => (input.contractId = 'rewritten-contract')],
  preflight: ['--preflight-verdict', (input) => (input.passed = false)],
  policy: ['--policy', (input) => (input.catchThreshold = 0.6)],
  configuration: ['--evaluator-configuration', (input) => (input.evaluatorIdentity = 'rewritten evaluator')],
  probe: ['--probe', (input) => (input.probeClass = input.probeClass === 'zero-action' ? 'defect' : 'zero-action')],
  manifest: ['--isolation-manifest', (input) => (input.violation = 'rewritten manifest')],
  // The first record becomes bytes that are no JSON, which the engine refuses with a fault and no artifact.
  unreadable: ['--record', null],
};
const attack = /^(rewrite|restore)-(.+)$/.exec(mode);
const inputKind = attack !== null && Object.hasOwn(INPUTS, attack[2]) ? attack[2] : null;
const attacking = process.env.TEA_RACE_PROBE === undefined || process.env.TEA_RACE_PROBE === probe;
let original = null;
let inputFile = null;
if (inputKind !== null && attacking && argv.includes(INPUTS[inputKind][0])) {
  inputFile = value(INPUTS[inputKind][0]);
  original = fs.readFileSync(inputFile);
  if (INPUTS[inputKind][1] === null) fs.writeFileSync(inputFile, 'not json\n');
  else {
    const parsed = JSON.parse(original.toString('utf8'));
    INPUTS[inputKind][1](parsed);
    fs.writeFileSync(inputFile, `${JSON.stringify(parsed, null, 2)}\n`);
  }
}

const real = spawnSync(process.execPath, [engineCliPath({}), ...argv], { stdio: 'inherit' });
if (attack?.[1] === 'restore' && original !== null) fs.writeFileSync(inputFile, original);

/** Moves `entry` aside and leaves a link to the target in its place, once. */
function swap(entry) {
  const moved = `${entry}.moved`;
  if (fs.existsSync(moved)) return;
  fs.renameSync(entry, moved);
  fs.symlinkSync(target, entry, 'dir');
}

if (mode === 'swap-scores') {
  fs.mkdirSync(path.join(target, invocation, probe), { recursive: true });
  swap(scores);
} else if (mode === 'swap-invocation') {
  fs.mkdirSync(path.join(target, probe), { recursive: true });
  swap(path.join(scores, invocation));
} else if (mode === 'swap-probe') {
  swap(path.join(scores, invocation, probe));
} else if (mode === 'plant-next-probe' && probe === 'P-001') {
  fs.symlinkSync(target, path.join(scores, invocation, 'P-002'), 'dir');
} else if (mode === 'plant-record') {
  fs.symlinkSync(sentinel, path.join(scores, invocation, probe, 'score.json'));
} else if (mode === 'plant-evidence') {
  fs.symlinkSync(sentinel, path.join(scores, invocation, probe, 'evidence-artifact.json'));
} else if (mode === 'plant-summary') {
  fs.symlinkSync(sentinel, path.join(scores, invocation, 'score.json'));
} else if (mode === 'forge-corpus') {
  const artifact = JSON.parse(fs.readFileSync(out, 'utf8'));
  artifact.scoringVersionInputs.corpusDigest = `sha256:${'0'.repeat(64)}`;
  fs.writeFileSync(out, JSON.stringify(artifact));
} else if (mode === 'forge-schema') {
  const artifact = JSON.parse(fs.readFileSync(out, 'utf8'));
  delete artifact.strength;
  artifact.unexpectedField = true;
  fs.writeFileSync(out, JSON.stringify(artifact));
} else if (mode === 'garbage') {
  fs.writeFileSync(out, 'not an evidence artifact\n');
} else if (mode === 'forge-probe') {
  if (probe === 'P-001') fs.copyFileSync(out, stash);
  else fs.copyFileSync(stash, out);
} else if (mode === 'plant-manifest' && attacking) {
  const planted = path.join(runDirectory, 'trial-sets', probe, 'isolation-manifest.json');
  if (!fs.existsSync(planted)) fs.writeFileSync(planted, '{"planted":true}\n');
} else if (mode === 'stage-stashed' && attacking) {
  // The artifact of an earlier clean score of the same probe takes the place of whatever this call staged.
  fs.copyFileSync(path.join(process.env.TEA_RACE_STASH_DIR, probe, 'evidence-artifact.json'), out);
} else if (mode === 'forge-outcomes' && attacking) {
  const artifact = JSON.parse(fs.readFileSync(out, 'utf8'));
  artifact.reducedProbeOutcomes[0].caught = !artifact.reducedProbeOutcomes[0].caught;
  fs.writeFileSync(out, `${JSON.stringify(artifact)}\n`);
} else if (mode === 'stage-link') {
  const valid = path.join(target, 'valid-artifact.json');
  fs.renameSync(out, valid);
  fs.symlinkSync(valid, out);
}

process.exitCode = real.status ?? 5;
