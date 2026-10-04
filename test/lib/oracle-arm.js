/**
 * The arm the test-review, trace, nfr and ci mutation cycles run (AD-8, Story 1.99).
 *
 * A controlled-mutation probe names the contract oracle that has to catch its
 * defect. The arm resolves that oracle's own check, with eval-quality's evaluator
 * (the one `npm run test:contract-oracles` reads every oracle with), over the
 * artifact the workspace holds in the phase that is running:
 *
 *   `true`   the oracle holds, so the arm reports `held`
 *   `false`  the oracle fails, so the arm reports `violated`
 *   any other resolution (no evidence, an abstention) reports `inconclusive`, and so does text that is no artifact at all
 *
 * The oracle is the one the probe's `behaviorId` discharges, so the cycle that
 * qualifies a mutation measures the same claim the strength vector later does.
 * Nothing here scores a corpus a second way.
 *
 * Each corpus says how its artifact becomes one step observation (`observationOf`),
 * because the contracts address a verdict, a summary, a report and a workflow
 * differently. The step the observation answers for is read out of the oracle's
 * own pointers, so a contract that renames a step does not strand the arm.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const POLICY_PATH = path.join(__dirname, '..', 'probes', 'scoring-policy.json');
const INTERACTION_POINTER = /^\/interactions\/([^/]+)\//;

/** The regex step budget the policy TEA scores with, so an oracle that faults here faults there. */
function regexStepBudget() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8')).regexMatchStepBudget;
}

/** Every pointer string an oracle's check carries, in document order. */
function pointersOf(node) {
  if (node === null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(pointersOf);
  return Object.entries(node).flatMap(([key, value]) => (key === 'pointer' && typeof value === 'string' ? [value] : pointersOf(value)));
}

/**
 * The one step an oracle reads.
 *
 * @throws {Error} when the check addresses no step or several, since one observation cannot answer for both
 */
function stepOf(oracle) {
  const steps = new Set(pointersOf(oracle.check).flatMap((pointer) => INTERACTION_POINTER.exec(pointer)?.[1] ?? []));
  if (steps.size !== 1) {
    throw new Error(`${oracle.id} reads ${steps.size} step(s) (${[...steps].join(', ')}), and a cycle's arm answers for exactly one`);
  }
  return [...steps][0];
}

/**
 * One observation of one command step, in the shape eval-quality's `Observation` schema declares, with every
 * channel a contract here never addresses left null or absent.
 */
function observation({ operationId, exitCode = null, stdout = { kind: 'absent' }, artifacts = {} }) {
  return {
    observationId: `${operationId}-1`,
    sequence: 1,
    operationId,
    provenance: 'baseline',
    principal: null,
    callInputs: {
      path: null,
      query: null,
      header: null,
      body: null,
      bodyEncoding: null,
      argument: null,
      option: null,
      environment: null,
      stdin: null,
    },
    responseBody: null,
    responseHeaders: null,
    responseStatus: null,
    stdout,
    stderr: { kind: 'absent' },
    exitCode,
    artifacts,
  };
}

/**
 * The arm for one oracle of one contract.
 *
 * @param {object} options
 * @param {object} options.contract the compiled contract the oracle belongs to
 * @param {string} options.oracleId the oracle the probe's behavior discharges
 * @param {(text: string) => {exitCode?: number|null, stdout?: object, artifacts?: object}|null} options.observationOf the observation the
 *   artifact's text makes, or `null` for text that is no artifact, which no oracle can read and the arm reports as `inconclusive`
 * @param {string} options.operationId the operation the step runs
 * @param {object} [options.evaluator] eval-quality's evaluator; the installed package's by default
 * @returns {(input: {text: string}) => {verdict: 'held'|'violated'|'inconclusive', result: {resolution: string}}}
 * @throws {Error} when the contract carries no such oracle
 */
function oracleArm({ contract, oracleId, observationOf, operationId, evaluator = require('eval-quality') }) {
  const oracle = contract.oracles.find((candidate) => candidate.id === oracleId);
  if (oracle === undefined) throw new Error(`${contract.contractId} declares no oracle ${oracleId}`);
  const step = stepOf(oracle);
  const referenceSets = Object.fromEntries(Object.entries(contract.referenceSets ?? {}).map(([id, set]) => [id, set.members]));
  const denotesCollection = evaluator.makePointerDenotesCollection(contract);
  const referenceSetKeys = evaluator.referenceSetKeysOf(contract);
  const budget = regexStepBudget();

  return ({ text }) => {
    const made = observationOf(text);
    if (made === null) return { verdict: 'inconclusive', result: { resolution: 'no-artifact' } };
    const resolveOperand = evaluator.makeResolveOperand({ [step]: observation({ operationId, ...made }) }, referenceSets);
    const resolved = evaluator.resolveCheck(
      oracle.check,
      resolveOperand,
      denotesCollection,
      referenceSetKeys,
      budget,
      `oracles/${oracle.id}`,
    );
    return {
      verdict: resolved.resolution === 'true' ? 'held' : resolved.resolution === 'false' ? 'violated' : 'inconclusive',
      result: { resolution: resolved.resolution },
    };
  };
}

module.exports = { observation, oracleArm, pointersOf, stepOf };
