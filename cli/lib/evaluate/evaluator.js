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
 * It judges the qualification arms of AD-8 and every trial of a scored run.
 * A trial's judgment (`judgeTrial`) is what a Sealed Run Record carries: a
 * disposition for every oracle the contract declares, since eval-quality
 * holds every oracle required and reads a missing disposition as Invalid, and
 * one defect finding per violated oracle of the behaviors the probe
 * discharges, which quotes a cited observation verbatim (the whole of a
 * channel the oracle's check reads there), so eval-quality's own quotation
 * audit and witness match decide what the finding proves.
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

/** The quotation channels a pointer segment names directly. */
const QUOTED_CHANNELS = new Set(['stdout', 'stderr', 'exit-code', 'response-body', 'response-headers', 'response-status']);

/**
 * One channel of one observation as the text eval-quality's quotation audit
 * compares a quote against: a text body as itself, a JSON body and a
 * structured channel as their canonical serialization (`serializeArtifact`
 * without its trailing newline), a status or exit code as its integer, and
 * `null` for a channel that holds nothing.
 */
function channelText(engine, observation, channel, artifactId = null) {
  const body = (value) => {
    if (value === null || value === undefined || value.kind === 'absent') return null;
    if (value.kind === 'text') return value.value;
    return engine.serializeArtifact(value.value, 'observation').slice(0, -1);
  };
  switch (channel) {
    case 'stdout': {
      return body(observation.stdout);
    }
    case 'stderr': {
      return body(observation.stderr);
    }
    case 'artifact': {
      return artifactId !== null && Object.hasOwn(observation.artifacts ?? {}, artifactId) ? body(observation.artifacts[artifactId]) : null;
    }
    case 'exit-code': {
      return observation.exitCode === null ? null : String(observation.exitCode);
    }
    case 'response-status': {
      return observation.responseStatus === null ? null : String(observation.responseStatus);
    }
    case 'response-body': {
      return observation.responseBody === null ? null : engine.serializeArtifact(observation.responseBody, 'observation').slice(0, -1);
    }
    case 'response-headers': {
      return observation.responseHeaders === null
        ? null
        : engine.serializeArtifact(observation.responseHeaders, 'observation').slice(0, -1);
    }
    default: {
      return engine.serializeArtifact(observation.callInputs, 'observation').slice(0, -1);
    }
  }
}

/**
 * The verbatim quotation a finding carries for a violated oracle, from the
 * observations it cites (`cited`, pairs of step and observation, in citation
 * order): the whole of the first stream, body or written-file channel the
 * oracle's check reads on any of them that holds text, which is what shows
 * the violation; else such an exit code or status; else the first cited
 * observation's exit code, else its call inputs, which every observation
 * holds. A whole channel is verbatim by construction.
 */
function quotationFor(engine, oracle, cited) {
  const candidates = [];
  const pointers = pointersIn(oracle.check);
  for (const [stepId, observation] of cited) {
    for (const pointer of pointers) {
      const segments = pointer.split('/');
      if (segments[1] !== 'interactions' || segments[2] !== stepId) continue;
      const channel = segments[3];
      if (channel === 'artifact' && typeof segments[4] === 'string') candidates.push({ observation, channel, artifactId: segments[4] });
      else if (QUOTED_CHANNELS.has(channel)) candidates.push({ observation, channel, artifactId: null });
    }
  }
  const terse = (candidate) => candidate.channel === 'exit-code' || candidate.channel === 'response-status';
  const [first] = cited.map(([, observation]) => observation);
  const ordered = [
    ...candidates.filter((candidate) => !terse(candidate)),
    ...candidates.filter(terse),
    { observation: first, channel: 'exit-code', artifactId: null },
    { observation: first, channel: 'call-inputs', artifactId: null },
  ];
  for (const candidate of ordered) {
    const text = channelText(engine, candidate.observation, candidate.channel, candidate.artifactId);
    if (typeof text === 'string' && text.length > 0) return { quote: text, channel: candidate.channel, artifactId: candidate.artifactId };
  }
  throw new Error(`observation ${first.observationId} holds no text a finding could quote`);
}

/**
 * One scored trial's judgment for one probe, in the shape a Sealed Run Record
 * carries: a disposition for every oracle the contract declares (eval-quality
 * holds each one required), citing the observations of the steps its check
 * points at (every observation of the trial when it points at none), and a
 * `defect` finding attributed to the probe, at confidence 1 since the
 * evaluator is deterministic, for each violated oracle of the behaviors the
 * probe discharges (`behaviorIds`: the probe's own and its defects'). The
 * finding answers the first of those behaviors that declares the oracle, at
 * that behavior's severity.
 *
 * An oracle of another behavior that is violated keeps its `violated`
 * disposition and files no finding against this probe: a finding names the
 * probe it arose during, and eval-quality scores it against that probe's
 * signature, so a defect in a behavior the probe does not discharge would
 * read as the probe's false positive or an unwitnessed claim. eval-quality
 * records the unmatched disposition's corroboration as `disagrees`.
 *
 * @param {object} options
 * @param {object} options.contract
 * @param {Record<string, object>} options.stepObservations one record observation per interaction plan step
 * @param {string} options.probeId the probe the record is scored against
 * @param {string[]} options.behaviorIds the behaviors that probe discharges
 * @param {number} options.regexMatchStepBudget
 * @returns {Promise<{ oracles: object[], oracleDispositions: object[], findings: object[], discharged: string[] }>}
 *   `discharged` names the oracles of the probe's behaviors, whose findings the judgment files
 */
async function judgeTrial({ contract, stepObservations, probeId, behaviorIds, regexMatchStepBudget }) {
  const engine = await loadEngine();
  const oracleIds = (contract.oracles ?? []).map((oracle) => oracle.id);
  const oracles = await evaluateOracles({ contract, stepObservations, oracleIds, regexMatchStepBudget });
  const discharged = new Set(oraclesOfBehaviors(contract, behaviorIds));
  const everyObservation = Object.values(stepObservations)
    .sort((a, b) => a.sequence - b.sequence)
    .map((observation) => observation.observationId);
  const oracleDispositions = [];
  const findings = [];
  for (const resolved of oracles) {
    const observationIds = resolved.observationIds.length > 0 ? resolved.observationIds : everyObservation;
    const expected = resolved.polarity === 'expects-hold' ? 'true' : 'false';
    oracleDispositions.push({
      oracleId: resolved.oracleId,
      disposition: resolved.disposition,
      observationIds,
      note: `resolveCheck resolved ${resolved.resolution}; ${resolved.polarity} holds on ${expected}`,
    });
    if (resolved.disposition !== 'violated' || !discharged.has(resolved.oracleId)) continue;
    const oracle = contract.oracles.find((candidate) => candidate.id === resolved.oracleId);
    const cited = observationIds.map((observationId) =>
      Object.entries(stepObservations).find(([, observation]) => observation.observationId === observationId),
    );
    if (cited.includes(undefined)) throw new Error(`oracle ${resolved.oracleId} cites an observation this trial does not hold`);
    const behavior = behaviorIds
      .map((behaviorId) => (contract.behaviors ?? []).find((candidate) => candidate.id === behaviorId))
      .find((candidate) => candidate !== undefined && (candidate.oracles ?? []).includes(resolved.oracleId));
    findings.push({
      findingType: 'defect',
      findingId: `F-${String(findings.length + 1).padStart(3, '0')}`,
      oracleId: resolved.oracleId,
      probeId,
      behaviorId: behavior.id,
      severity: behavior.severity,
      summary: `${resolved.oracleId} is violated: its check resolved ${resolved.resolution} over ${observationIds.join(', ')}, where ${resolved.polarity} holds on ${expected}.`,
      confidence: 1,
      observationIds,
      evidenceArtifacts: [],
      quotedEvidence: [quotationFor(engine, oracle, cited)],
    });
  }
  return { oracles, oracleDispositions, findings, discharged: [...discharged] };
}

module.exports = { dispositionOf, evaluateOracles, judgeTrial, oraclesOfBehaviors };
