/** Trace scored findings to the sealed observations and contract pointers they cite. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const READ_REGULAR = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0) | (fs.constants.O_NOFOLLOW ?? 0);

/** `file` parsed as JSON; it must be a regular file, opened without blocking and without following a link. */
function readRegularJson(file) {
  let descriptor;
  try {
    descriptor = fs.openSync(file, READ_REGULAR);
  } catch (error) {
    if (error.code === 'ELOOP' || error.code === 'EMLINK') throw new Error(`${file} is a symbolic link, not a regular file`);
    throw error;
  }
  try {
    if (!fs.fstatSync(descriptor).isFile()) throw new Error(`${file} is not a regular file`);
    return JSON.parse(fs.readFileSync(descriptor, 'utf8'));
  } finally {
    fs.closeSync(descriptor);
  }
}

function projectTrial(record, phases, oracles) {
  const observations = new Map(record.observations.map((observation) => [observation.observationId, observation]));
  const findings = record.findings.map((finding) => {
    const citations = finding.observationIds.map((observationId) => {
      const observation = observations.get(observationId);
      if (observation === undefined)
        throw new Error(
          `finding ${finding.findingId} cites observation ${observationId}, which trial ${record.trialIndex} does not contain`,
        );
      if (!Object.hasOwn(phases, observation.operationId))
        throw new Error(`observation ${observationId} names unclassified operation ${observation.operationId}`);
      return {
        observationId,
        sequence: observation.sequence,
        operationId: observation.operationId,
        provenance: observation.provenance,
        phase: phases[observation.operationId],
      };
    });
    const oracle = finding.oracleId === null ? null : oracles.get(finding.oracleId);
    return {
      ...finding,
      citations,
      oracleEvidencePointers: oracle?.direction?.evidenceTargets ?? null,
    };
  });
  const firstMaterialError =
    findings
      .filter((finding) => finding.severity === 'material' || finding.severity === 'critical')
      .flatMap((finding) => finding.citations.map((citation) => ({ findingId: finding.findingId, ...citation })))
      .sort((left, right) => left.sequence - right.sequence)[0] ?? null;
  return {
    trialIndex: record.trialIndex,
    findings,
    process: findings
      .filter((finding) => finding.citations.some((citation) => citation.phase === 'process'))
      .map((finding) => finding.findingId),
    outcome: findings
      .filter((finding) => finding.citations.some((citation) => citation.phase === 'outcome'))
      .map((finding) => finding.findingId),
    firstMaterialError,
  };
}

/** Evidence fields are direct parsed copies. No classification or verdict is computed here. */
function engineProjection(evidence) {
  if (evidence === null) return null;
  const value = {
    outcomes: evidence.outcomes,
    reducedProbeOutcomes: evidence.reducedProbeOutcomes,
    strength: evidence.strength,
  };
  if (Object.hasOwn(evidence, 'contractVerdict')) value.contractVerdict = evidence.contractVerdict;
  if (Object.hasOwn(evidence, 'productionVerdict')) value.productionVerdict = evidence.productionVerdict;
  return value;
}

/**
 * The pointer to the run-wide strength aggregate the score invocation copied (Story 1.45): where it is, its digest and
 * how its floors were read, or why there is none. The aggregate's counts, rates and floor decisions are the engine's
 * and stay in `strength-aggregate.json`; nothing here restates or computes one.
 */
function strengthAggregatePointer(summary) {
  return {
    status: summary.status,
    reason: summary.reason,
    path: summary.aggregate,
    digest: summary.aggregateDigest,
    floors: summary.floors,
    floorsDigest: summary.floorsDigest,
  };
}

/**
 * Writes `interpretation.json` into the run directory through its held writer (`run-directory.js`).
 * `evidence` maps each scored probe to the parsed evidence artifact the writer read back from the score directory
 * (`score.js`); a probe with none has `engine: null`. `strengthAggregate` is the score summary's record of the
 * run-wide aggregate, carried as a pointer.
 */
function writeInterpretation({
  writer,
  runDirectory,
  scoreInvocationId,
  trialSets,
  scores,
  evidence,
  contractPath,
  operationPhases,
  strengthAggregate,
}) {
  const contract = readRegularJson(path.join(runDirectory, contractPath));
  const oracles = new Map(contract.oracles.map((oracle) => [oracle.id, oracle]));
  const scoreByProbe = new Map(scores.map((score) => [score.probeId, score]));
  const probes = trialSets.map((set) => {
    const score = scoreByProbe.get(set.probeId);
    return {
      probeId: set.probeId,
      evidence: score?.evidence ?? null,
      scoreExitCode: score?.exitCode ?? null,
      scoreRecord: score?.record ?? null,
      scoreFailure: score?.failure ?? null,
      trials: set.records.map((recordPath) => ({
        record: recordPath,
        ...projectTrial(readRegularJson(path.join(runDirectory, recordPath)), operationPhases, oracles),
      })),
      engine: engineProjection(evidence.get(set.probeId) ?? null),
    };
  });
  writer.replaceJson('interpretation.json', { scoreInvocationId, strengthAggregate: strengthAggregatePointer(strengthAggregate), probes });
}

module.exports = { engineProjection, projectTrial, readRegularJson, strengthAggregatePointer, writeInterpretation };
