/**
 * The live proof behind `test/fixtures/automate-eval/qualification.json`'s
 * `rollbackVerified: true`.
 *
 * `tools/generate-probes.js`'s six existing `controlled-mutation` records set
 * `rollbackVerified: true` by comment. Each is a permanent twin-file or
 * twin-fixture-set pair with nothing to roll back, so the claim is true by
 * construction and nothing re-earns it. `test/fixtures/automate-eval` is a
 * seventh site, and the first one where the mutation is a real, reversible
 * edit to a real file, so this is the first place the claim can be checked
 * live. This script is that check, and it runs on every `npm test`: the
 * revert-and-recheck is a step of the cycle, and the claim is earned only by
 * the cycle actually running it.
 *
 * THE CYCLE
 *
 * The cycle is the runtime's: `runMutationCycle` in
 * `cli/lib/evaluate/mutation.js`, AD-8's six steps, over a disposable copy of
 * the voucher service that `cli/lib/evaluate/workspace.js` makes. This script
 * keeps only its TeA data: the voucher inputs, the three arms, and the
 * evidence files its record cites.
 *
 * 1. Baseline: the unmutated copy redeems a voucher at a cart total exactly
 *    equal to `minimumSpend`. Accepted: `minimumSpend` is inclusive.
 * 2. Mutate: the same copy, with the boundary check flipped from
 *    `cartTotal >= voucher.minimumSpend` to `cartTotal > voucher.minimumSpend`
 *    (exactly one occurrence). Same input, run again. Wrongly rejected: the
 *    mutation is observable.
 * 3. Revert: the copy restored to the committed bytes, its digest held to the
 *    pre-mutation digest, and the same input run a third time. Accepted again:
 *    this is the pass that, with the digest, earns `rollbackVerified: true`.
 *
 * The mutation only ever touches the copy under the temp directory. The
 * tracked `vouchers.js` is read once, at the top, and never written.
 *
 * WHAT ELSE THIS CHECKS
 *
 * `qualification.json` parses against `eval-quality`'s published
 * `controlled-mutation` qualification shape (the package exports no
 * standalone validator for it, so the shape is read off `probe.schema.json`'s
 * `qualification` property, the one place the package publishes it). A schema
 * failure, a wrong `route`, or an empty `mutationOperator` stops the run
 * before the cycle starts, since none of those leave anything meaningful to
 * run. Everything else, including a stale `targetArtifact` or evidence
 * digest, is collected as a problem and reported once the cycle has run, so a
 * failing run still regenerates `evidence/*.json` the way this fixture's
 * README describes.
 *
 * `targetArtifact` is digested at `vouchers.js`'s real, currently-committed
 * bytes. The mutation itself lives only in the disposable copy, per
 * `test/fixtures/automate-eval/README.md`'s stated judgment. `baselinePassEvidence`
 * and `mutatedFailEvidence` are written by phases 1 and 2 above, and their
 * digests are held to the record, so an edit to the fixed implementation's
 * behavior that nobody re-qualified is caught here, keeping the corpus from
 * silently drifting out of date.
 *
 * Two rules the mutation cycle does not exercise, the discount cap and
 * expiry, are checked once against the same unmutated copy, inside the
 * baseline phase.
 *
 * A minimal HTTP smoke check starts the real server (`src/server.js`) as a
 * child process and exercises `GET /health` and one accept case and one
 * reject case of `POST /redeem`, so the HTTP routing, parsing, and error
 * handling carry automated coverage too.
 *
 * Usage: node test/test-automate-eval-fixture.js
 * Exit codes: 0 = every phase, digest, and HTTP check matched, 1 = one didn't, 2 = the script itself could not run
 */

'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');

const AjvModule = require('ajv/dist/2020');

const { digest } = require('./lib/eval-record');
const { QualificationError, runMutationCycle } = require('../cli/lib/evaluate/mutation');
const { createWorkspace, removeWorkspace } = require('../cli/lib/evaluate/workspace');

const Ajv = AjvModule.default ?? AjvModule;

const PROJECT_ROOT = path.join(__dirname, '..');
const FIXTURE_ROOT = 'test/fixtures/automate-eval';
const SERVER_ROOT = `${FIXTURE_ROOT}/voucher-service`;
const QUALIFICATION_PATH = `${FIXTURE_ROOT}/qualification.json`;
const BASELINE_EVIDENCE_PATH = `${FIXTURE_ROOT}/evidence/baseline-pass.json`;
const MUTATED_EVIDENCE_PATH = `${FIXTURE_ROOT}/evidence/mutated-fail.json`;

const TARGET_PATH = `${SERVER_ROOT}/src/vouchers.js`;

/** The boundary flip, as a replace-exact mutation of the service copy's `src/vouchers.js`; exactly one occurrence is required. */
const VOUCHER_MUTATION = {
  mutationId: 'M-001',
  targetArtifact: 'src/vouchers.js',
  operator: {
    kind: 'replace-exact',
    find: 'cartTotal >= voucher.minimumSpend',
    replace: 'cartTotal > voucher.minimumSpend',
    occurrences: 1,
  },
};

// A cart total exactly at the voucher's minimumSpend: the boundary the mutation
// exists to flip. 10% of 50 is 5, under the voucher's 20 discount cap, so this
// input keeps the cap rule out of scope; only the minimum-spend rule is under
// test here.
const BOUNDARY_VOUCHER = { type: 'percentage', percentOff: 10, maxDiscount: 20, minimumSpend: 50, expiresOn: '2099-01-01' };
const BOUNDARY_CART_TOTAL = 50;
const BOUNDARY_REDEEMED_ON = '2026-01-01';

// Two more fixed-implementation rules the mutation cycle above does not
// exercise, since it holds everything but the minimum-spend boundary constant.
// Checked once, against the unmutated scratch copy, so the fixture's other two
// I/O matrix rows (discount cap, expiry) are covered by a check that runs in
// `npm test`.
const CAP_VOUCHER = { type: 'percentage', percentOff: 50, maxDiscount: 20, minimumSpend: 10, expiresOn: '2099-01-01' };
const CAP_CART_TOTAL = 500; // 50% of 500 is 250, which the 20 cap must bring down to 20.
const EXPIRED_VOUCHER = { type: 'fixed', amountOff: 5, minimumSpend: 10, expiresOn: '2020-01-01' };
const EXPIRED_CART_TOTAL = 50;
const OTHER_REDEEMED_ON = '2026-01-01';

const SMOKE_PORT = 4320;
const SMOKE_TIMEOUT_MS = 5000;

const colors = {
  reset: '\u001B[0m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  dim: '\u001B[2m',
};

function absolute(relativePath) {
  return path.join(PROJECT_ROOT, relativePath);
}

/**
 * `eval-quality` publishes `ProbeQualification` as a Zod schema at
 * `dist/core/schemas/probe-qualification.js`, which is not in the package's
 * `exports` map, so importing it directly throws `ERR_PACKAGE_PATH_NOT_EXPORTED`
 * (confirmed by importing it directly and reading the thrown error). The
 * shape it describes is published a second way: `probe.schema.json`'s
 * `qualification` property is the same oneOf-of-five-routes this file's own
 * d.ts documents. That property is inlined directly, with no `$ref` to a
 * `$defs` entry, so this pulls out the `controlled-mutation` branch and gives
 * it its own copy of the root schema's `$defs`, since its two
 * `ArtifactReference` fields are `$ref`'d against that root.
 */
function loadControlledMutationSchema() {
  const schemaPath = path.join(PROJECT_ROOT, 'node_modules', 'eval-quality', 'schemas', 'probe.schema.json');
  const probeSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const qualificationBranches = probeSchema.oneOf?.[0]?.properties?.qualification?.oneOf;
  if (!Array.isArray(qualificationBranches)) {
    throw new TypeError(
      "eval-quality's probe.schema.json no longer publishes qualification as an inlined oneOf under oneOf[0].properties.qualification; this schema reader needs updating to match",
    );
  }
  const controlledMutation = qualificationBranches.find((branch) => branch.properties?.route?.const === 'controlled-mutation');
  if (!controlledMutation) {
    throw new Error("eval-quality's probe.schema.json no longer publishes a controlled-mutation qualification branch");
  }
  return {
    $schema: probeSchema.$schema,
    $id: 'urn:tea:automate-eval:probe-qualification-controlled-mutation',
    $defs: probeSchema.$defs,
    ...controlledMutation,
  };
}

/** The digest this repository's corpus port takes: `sha256:<hex>` over the reference and the bytes, length-prefixed. */
function referenceDigest(relativePath) {
  return digest([relativePath, fs.readFileSync(absolute(relativePath))]);
}

/**
 * Loads `vouchers.js` fresh out of `scratchDir` without `require()`, whose
 * argument this repository's `dependency-direction` gate requires to be a
 * string literal: `scratchFile` is a path built at runtime, one the mutation
 * cycle rewrites and reloads three times. `vm.compileFunction` wraps the
 * source exactly the way `require()` does (`exports`, `require`, `module`,
 * `__filename`, `__dirname`) using a public, documented Node API, so this is
 * an evaluation of generated source, stated as one, with no module cache to
 * invalidate and no private internals involved.
 */
function requireFreshVouchers(scratchDir) {
  const scratchFile = path.join(scratchDir, 'vouchers.js');
  const source = fs.readFileSync(scratchFile, 'utf8');
  const wrapper = vm.compileFunction(source, ['exports', 'require', 'module', '__filename', '__dirname'], {
    filename: scratchFile,
  });
  const freshModule = { exports: {} };
  wrapper(freshModule.exports, require, freshModule, scratchFile, scratchDir);
  return freshModule.exports;
}

function redeemAtBoundary(scratchDir) {
  const { redeem } = requireFreshVouchers(scratchDir);
  return redeem(BOUNDARY_VOUCHER, BOUNDARY_CART_TOTAL, BOUNDARY_REDEEMED_ON);
}

function redeemFixtureCheck(scratchDir, voucher, cartTotal, redeemedOn) {
  const { redeem } = requireFreshVouchers(scratchDir);
  return redeem(voucher, cartTotal, redeemedOn);
}

/** One HTTP round trip against the smoke-tested server, JSON in and JSON out. */
function smokeRequest({ method, path: requestPath, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const request = http.request(
      {
        host: '127.0.0.1',
        port: SMOKE_PORT,
        method,
        path: requestPath,
        headers: payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: response.statusCode, body: text.length > 0 ? JSON.parse(text) : undefined });
        });
      },
    );
    request.on('error', reject);
    if (payload !== undefined) request.write(payload);
    request.end();
  });
}

/** Polls `GET /health` until it answers 200 or `deadline` passes. */
async function waitForHealth(deadline) {
  while (Date.now() < deadline) {
    try {
      const response = await smokeRequest({ method: 'GET', path: '/health' });
      if (response.status === 200) return;
    } catch {
      // The server has not opened its port yet. Retry until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`voucher-service did not answer /health on port ${SMOKE_PORT} within ${SMOKE_TIMEOUT_MS}ms`);
}

/**
 * Starts the real server as a child process and exercises `GET /health` and
 * one accept case and one reject case of `POST /redeem`. The mutation cycle
 * above only ever calls `vouchers.js`'s `redeem()` directly, so this is the
 * only coverage `src/server.js`'s HTTP routing, body parsing, and error
 * handling get.
 *
 * @returns {Promise<string[]>} Problems found, empty when every check passed.
 */
async function runServerSmoke() {
  const smokeProblems = [];
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: absolute(SERVER_ROOT),
    env: { ...process.env, PORT: String(SMOKE_PORT) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });

  try {
    await waitForHealth(Date.now() + SMOKE_TIMEOUT_MS);

    const health = await smokeRequest({ method: 'GET', path: '/health' });
    console.log(`${colors.dim}server smoke (GET /health):${colors.reset} ${health.status} ${JSON.stringify(health.body)}`);
    if (health.status !== 200 || health.body?.ok !== true) {
      smokeProblems.push(
        `server smoke: GET /health returned ${health.status} ${JSON.stringify(health.body)}, and a running server answers 200 { ok: true }`,
      );
    }

    const accepted = await smokeRequest({
      method: 'POST',
      path: '/redeem',
      body: { code: 'SAVE10', cartTotal: 50, redeemedOn: '2026-01-01' },
    });
    console.log(
      `${colors.dim}server smoke (POST /redeem, accept case):${colors.reset} ${accepted.status} ${JSON.stringify(accepted.body)}`,
    );
    if (accepted.status !== 200 || accepted.body?.accepted !== true) {
      smokeProblems.push(
        `server smoke: an in-catalog voucher at its minimum spend should be accepted over HTTP, and POST /redeem returned ${accepted.status} ${JSON.stringify(accepted.body)}`,
      );
    }

    const rejected = await smokeRequest({
      method: 'POST',
      path: '/redeem',
      body: { code: 'SAVE10', cartTotal: 49, redeemedOn: '2026-01-01' },
    });
    console.log(
      `${colors.dim}server smoke (POST /redeem, reject case):${colors.reset} ${rejected.status} ${JSON.stringify(rejected.body)}`,
    );
    if (rejected.status !== 200 || rejected.body?.accepted !== false || rejected.body?.reason !== 'below-minimum-spend') {
      smokeProblems.push(
        `server smoke: a cart total below minimumSpend should be rejected over HTTP, and POST /redeem returned ${rejected.status} ${JSON.stringify(rejected.body)}`,
      );
    }
  } catch (error) {
    const detail = stderr.trim();
    smokeProblems.push(`server smoke could not run: ${error.message}${detail.length > 0 ? `; server stderr: ${detail}` : ''}`);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('close', resolve));
  }

  return smokeProblems;
}

/**
 * Phase 1, the clean arm on the unmutated copy: a cart total exactly at
 * `minimumSpend` is accepted. Writes `evidence/baseline-pass.json` and holds its
 * digest to the record, then checks the discount cap and expiry once against
 * the same unmutated copy, since the cycle holds everything but the boundary
 * constant and both are I/O matrix rows this script covers.
 */
async function baselineArm(scratchDir, qualification, problems) {
  const baselineResult = redeemAtBoundary(scratchDir);
  console.log(`${colors.dim}phase 1 (baseline, unmutated):${colors.reset} ${JSON.stringify(baselineResult)}`);
  if (baselineResult.accepted !== true) {
    problems.push(
      `baseline phase: a cart total exactly at minimumSpend should be accepted, and the fixed implementation returned ${JSON.stringify(baselineResult)}`,
    );
  }
  const baselineEvidence = {
    phase: 'baseline-pass',
    targetArtifact: TARGET_PATH,
    input: { voucher: BOUNDARY_VOUCHER, cartTotal: BOUNDARY_CART_TOTAL, redeemedOn: BOUNDARY_REDEEMED_ON },
    result: baselineResult,
    assertion: 'cartTotal equals minimumSpend exactly; the fixed implementation accepts the redemption.',
  };
  fs.writeFileSync(absolute(BASELINE_EVIDENCE_PATH), `${JSON.stringify(baselineEvidence, null, 2)}\n`);
  const liveBaselineDigest = referenceDigest(BASELINE_EVIDENCE_PATH);
  if (qualification.baselinePassEvidence.digest !== liveBaselineDigest) {
    problems.push(
      `baselinePassEvidence digest is stale: qualification.json reads ${qualification.baselinePassEvidence.digest}, ` +
        `the live baseline run just wrote evidence digesting to ${liveBaselineDigest}.`,
    );
  }

  const capResult = redeemFixtureCheck(scratchDir, CAP_VOUCHER, CAP_CART_TOTAL, OTHER_REDEEMED_ON);
  console.log(`${colors.dim}fixture check (discount cap):${colors.reset} ${JSON.stringify(capResult)}`);
  if (!(capResult.accepted === true && capResult.discount === CAP_VOUCHER.maxDiscount)) {
    problems.push(
      `discount-cap check: a percentage discount that would exceed maxDiscount (${CAP_VOUCHER.maxDiscount}) should be capped there, and the fixed implementation returned ${JSON.stringify(capResult)}`,
    );
  }
  const expiredResult = redeemFixtureCheck(scratchDir, EXPIRED_VOUCHER, EXPIRED_CART_TOTAL, OTHER_REDEEMED_ON);
  console.log(`${colors.dim}fixture check (expiry):${colors.reset} ${JSON.stringify(expiredResult)}`);
  if (!(expiredResult.accepted === false && expiredResult.reason === 'expired')) {
    problems.push(
      `expiry check: a voucher whose expiresOn is before redeemedOn should be rejected as expired, and the fixed implementation returned ${JSON.stringify(expiredResult)}`,
    );
  }
  return { verdict: baselineResult.accepted === true ? 'held' : 'violated', result: baselineResult };
}

/**
 * Phase 2, the mutated arm: with the boundary check flipped to exclusive, the
 * same cart total is wrongly rejected. Writes `evidence/mutated-fail.json` and
 * holds its digest to the record.
 */
async function mutatedArm(scratchDir, qualification, problems) {
  const mutatedResult = redeemAtBoundary(scratchDir);
  const failedAsExpected = mutatedResult.accepted === false && mutatedResult.reason === 'below-minimum-spend';
  console.log(`${colors.dim}phase 2 (mutated, boundary flipped to exclusive):${colors.reset} ${JSON.stringify(mutatedResult)}`);
  if (!failedAsExpected) {
    problems.push(
      `mutated phase: the same cart total should be wrongly rejected once the boundary is exclusive, and the mutated copy returned ${JSON.stringify(mutatedResult)}`,
    );
  }
  const mutatedEvidence = {
    phase: 'mutated-fail',
    targetArtifact: TARGET_PATH,
    mutationOperator: qualification.mutationOperator,
    input: { voucher: BOUNDARY_VOUCHER, cartTotal: BOUNDARY_CART_TOTAL, redeemedOn: BOUNDARY_REDEEMED_ON },
    result: mutatedResult,
    assertion: 'the same boundary input, after the minimum-spend check is mutated from >= to >, is wrongly rejected.',
  };
  fs.writeFileSync(absolute(MUTATED_EVIDENCE_PATH), `${JSON.stringify(mutatedEvidence, null, 2)}\n`);
  const liveMutatedDigest = referenceDigest(MUTATED_EVIDENCE_PATH);
  if (qualification.mutatedFailEvidence.digest !== liveMutatedDigest) {
    problems.push(
      `mutatedFailEvidence digest is stale: qualification.json reads ${qualification.mutatedFailEvidence.digest}, ` +
        `the live mutated run just wrote evidence digesting to ${liveMutatedDigest}.`,
    );
  }
  return { verdict: failedAsExpected ? 'violated' : 'inconclusive', result: mutatedResult };
}

/** Phase 3, the re-run on the restored copy: the boundary is inclusive again, which earns `rollbackVerified`. */
async function revertedArm(scratchDir) {
  const revertedResult = redeemAtBoundary(scratchDir);
  console.log(`${colors.dim}phase 3 (reverted, boundary inclusive again):${colors.reset} ${JSON.stringify(revertedResult)}`);
  return { verdict: revertedResult.accepted === true ? 'held' : 'violated', result: revertedResult };
}

async function main() {
  const preCycleProblems = [];
  const problems = [];

  const qualification = JSON.parse(fs.readFileSync(absolute(QUALIFICATION_PATH), 'utf8'));

  const ajv = new Ajv({ strict: false, allErrors: true });
  const validate = ajv.compile(loadControlledMutationSchema());
  if (!validate(qualification)) {
    for (const error of validate.errors ?? []) preCycleProblems.push(`qualification.json ${error.instancePath || '/'} ${error.message}`);
  }
  if (qualification.route !== 'controlled-mutation') {
    preCycleProblems.push(
      `qualification.json's route is "${qualification.route}", and this fixture's proof script only proves controlled-mutation`,
    );
  }
  if (typeof qualification.mutationOperator !== 'string' || qualification.mutationOperator.trim().length === 0) {
    preCycleProblems.push("qualification.json's mutationOperator must be a populated non-empty string");
  }

  if (preCycleProblems.length > 0) {
    console.error(`${colors.red}qualification.json is not shaped well enough to run the live cycle:${colors.reset}`);
    for (const problem of preCycleProblems) console.error(`  - ${problem}`);
    return 1;
  }

  // Past this point, qualification.json is schema-valid with a
  // controlled-mutation route and a real mutationOperator. A stale digest or a
  // wrong evidence path is collected below and reported at the end, so
  // phases 1-3 still execute and regenerate evidence/*.json, matching the
  // recovery this fixture's README describes.
  const expectedTargetPath = TARGET_PATH;
  if (qualification.targetArtifact.path === expectedTargetPath) {
    const liveTargetDigest = referenceDigest(expectedTargetPath);
    if (qualification.targetArtifact.digest !== liveTargetDigest) {
      problems.push(
        `qualification.json's targetArtifact.digest is stale: it reads ${qualification.targetArtifact.digest}, ` +
          `and vouchers.js's committed bytes digest to ${liveTargetDigest} today. Re-qualify after editing vouchers.js.`,
      );
    }
  } else {
    problems.push(
      `qualification.json's targetArtifact.path is "${qualification.targetArtifact.path}", and this fixture's mutation target is ${expectedTargetPath}`,
    );
  }

  if (qualification.baselinePassEvidence.path !== BASELINE_EVIDENCE_PATH) {
    problems.push(
      `qualification.json's baselinePassEvidence.path is "${qualification.baselinePassEvidence.path}", and this script writes that evidence to ${BASELINE_EVIDENCE_PATH}`,
    );
  }
  if (qualification.mutatedFailEvidence.path !== MUTATED_EVIDENCE_PATH) {
    problems.push(
      `qualification.json's mutatedFailEvidence.path is "${qualification.mutatedFailEvidence.path}", and this script writes that evidence to ${MUTATED_EVIDENCE_PATH}`,
    );
  }

  // The cycle is the runtime's (`cli/lib/evaluate/mutation.js`, AD-8's six
  // steps) over a disposable copy of the service the runtime makes
  // (`cli/lib/evaluate/workspace.js`); this script supplies the voucher data,
  // the three arms, and the evidence files its record cites. The tracked
  // `vouchers.js` is never written: the mutation and its restore happen in the
  // copy, and `rollbackVerified` is the cycle's own conjunction of a restored
  // digest equal to the pre-mutation one and a re-run that passes again.
  const workspace = createWorkspace({ root: absolute(SERVER_ROOT), kind: 'copy', provision: [], label: 'automate-eval-fixture' });
  const scratchDir = path.join(workspace.root, 'src');
  let rollbackVerifiedLive = false;

  try {
    const evidence = await runMutationCycle({
      root: workspace.root,
      mutation: VOUCHER_MUTATION,
      reExecutionCap: 0,
      runArm: async (phase) => {
        if (phase === 'baseline') return baselineArm(scratchDir, qualification, problems);
        if (phase === 'mutated') return mutatedArm(scratchDir, qualification, problems);
        return revertedArm(scratchDir);
      },
    });
    rollbackVerifiedLive = evidence.rollbackVerified;
  } catch (error) {
    if (!(error instanceof QualificationError)) throw error;
    problems.push(`the mutation cycle stopped (exit ${error.exitCode}): ${error.message}`);
  } finally {
    removeWorkspace(workspace);
  }
  if (fs.existsSync(workspace.directory)) problems.push(`the disposable copy of the service was left at ${workspace.directory}`);

  if (qualification.rollbackVerified !== true) {
    problems.push('qualification.json does not declare rollbackVerified: true');
  } else if (!rollbackVerifiedLive) {
    problems.push(
      "qualification.json declares rollbackVerified: true, but this run's own revert-and-recheck did not reproduce a pass, so the claim is not earned by this run",
    );
  }

  const smokeProblems = await runServerSmoke();
  problems.push(...smokeProblems);

  if (problems.length > 0) {
    console.error(`\n${colors.red}${problems.length} automate-eval fixture problem(s):${colors.reset}`);
    for (const problem of problems) console.error(`  - ${problem}`);
    return 1;
  }

  console.log(
    `\n${colors.green}automate-eval fixture qualified: baseline pass, mutated fail, a live revert-and-recheck, and the HTTP smoke check all matched the record.${colors.reset}\n`,
  );
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`${colors.red}the automate-eval fixture proof could not run:${colors.reset} ${error.stack ?? error}`);
      process.exit(2);
    });
}

module.exports = { VOUCHER_MUTATION, runMutationCycle };
