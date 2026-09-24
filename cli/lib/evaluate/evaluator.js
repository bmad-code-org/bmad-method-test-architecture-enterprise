/**
 * The deterministic evaluator (AD-7, AD-21's default kind): each oracle
 * resolved by eval-quality's own `resolveCheck` over one arm's observations,
 * with the contract's reference sets in scope.
 *
 * An oracle is `held` when its check resolves as its polarity expects (`true`
 * under `expects-hold`, `false` under `expects-violation`), `violated` when it
 * resolves the other way, and `not-attempted` when the evidence is
 * insufficient, the three dispositions a Sealed Run Record carries. Each
 * disposition cites the observations of the steps its check points at.
 *
 * This release judges the qualification arms of AD-8 with it; the trial sets
 * of a scored run use the same evaluator.
 */

'use strict';

const { loadEngine } = require('./engine');

const INTERACTION_POINTER = /^\/interactions\/([^/]+)(?:\/|$)/;

/** Every `pointer` operand under an expression. */
function pointersIn(expression, found = []) {
  if (Array.isArray(expression)) {
    for (const item of expression) pointersIn(item, found);
  } else if (expression !== null && typeof expression === 'object') {
    if (typeof expression.pointer === 'string') found.push(expression.pointer);
    for (const value of Object.values(expression)) pointersIn(value, found);
  }
  return found;
}

/** The disposition a check's resolution gives an oracle of `polarity`. */
function dispositionOf(resolution, polarity) {
  if (resolution === 'insufficient-evidence') return 'not-attempted';
  return resolution === (polarity === 'expects-hold' ? 'true' : 'false') ? 'held' : 'violated';
}

/**
 * The oracles `behaviorIds` declare, in declaration order and without repeats.
 *
 * @param {object} contract
 * @param {string[]} behaviorIds
 * @returns {string[]}
 */
function oraclesOfBehaviors(contract, behaviorIds) {
  const wanted = new Set(behaviorIds);
  const oracleIds = [];
  for (const behavior of contract.behaviors ?? []) {
    if (!wanted.has(behavior.id)) continue;
    for (const oracleId of behavior.oracles ?? []) if (!oracleIds.includes(oracleId)) oracleIds.push(oracleId);
  }
  return oracleIds;
}

/**
 * Resolves each named oracle over one arm's observations.
 *
 * @param {object} options
 * @param {object} options.contract the authored contract
 * @param {Record<string, object>} options.stepObservations one record observation per interaction plan step
 * @param {string[]} options.oracleIds
 * @param {number} options.regexMatchStepBudget the scoring policy's budget for a regular-expression operator
 * @returns {Promise<Array<{ oracleId: string, polarity: string, resolution: string, disposition: string, observationIds: string[] }>>}
 */
async function evaluateOracles({ contract, stepObservations, oracleIds, regexMatchStepBudget }) {
  const engine = await loadEngine();
  const referenceSets = Object.fromEntries(
    Object.entries(contract.referenceSets ?? {}).map(([id, set]) => [id, Array.isArray(set?.members) ? set.members : []]),
  );
  const resolveOperand = engine.makeResolveOperand(stepObservations, referenceSets);
  const denotesCollection = engine.makePointerDenotesCollection(contract);
  const referenceSetKeys = engine.referenceSetKeysOf(contract);
  return oracleIds.map((oracleId) => {
    const oracle = (contract.oracles ?? []).find((candidate) => candidate.id === oracleId);
    if (oracle === undefined) throw new Error(`the contract declares no oracle ${oracleId}`);
    const { resolution } = engine.resolveCheck(
      oracle.check,
      resolveOperand,
      denotesCollection,
      referenceSetKeys,
      regexMatchStepBudget,
      `EvalContract.oracles[id=${oracleId}].check`,
    );
    const stepIds = [...new Set(pointersIn(oracle.check).map((pointer) => INTERACTION_POINTER.exec(pointer)?.[1]))];
    const observationIds = stepIds
      .filter((stepId) => stepId !== undefined && Object.hasOwn(stepObservations, stepId))
      .map((stepId) => stepObservations[stepId].observationId);
    return { oracleId, polarity: oracle.polarity, resolution, disposition: dispositionOf(resolution, oracle.polarity), observationIds };
  });
}

module.exports = { dispositionOf, evaluateOracles, oraclesOfBehaviors };
