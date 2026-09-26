/**
 * The gameability route (AD-7, AD-9, AD-19): a probe that shows a degenerate,
 * compliant-looking response satisfies a naive oracle and is rejected by the
 * disciplined one, measured with no target launched.
 *
 * The degenerate response's bytes are committed at
 * `corpus/gameability/<probeId>.json` (`degenerate-response.schema.json`: one
 * `{ stdout, stderr, exitCode }` per command step of the interaction plan, one
 * `{ isError, structuredResult? }` per tool-call step, and one
 * `{ status, headers?, body? }` per HTTP step), since eval-quality keeps the
 * probe's `degenerateResponse` as prose. A synthetic port answers every plan
 * step from that file (an HTTP step through the evaluation's own HTTP port,
 * with a transport that sends nothing), so the arm executor
 * (`arm.js`) records the response as the observations a target would have
 * produced, and the deterministic evaluator resolves oracles over them with
 * `resolveCheck`.
 *
 * Qualification resolves the probe's `naiveOracle` (an oracle of another
 * behavior, which TeA's committed probe names) and the disciplined oracle (the
 * one oracle of the probe's own behavior) over that synthetic observation. The
 * naive one must hold and the disciplined one must be violated, or the probe
 * does not qualify (exit 11); each result is evidence under
 * `qualification/<probeId>/` (`naive-oracle-satisfied.json`,
 * `disciplined-oracle-rejected.json`), and the probe is materialized as
 * eval-quality's `gameability` probe. Its trials, on the arm
 * `gameability:<probeId>`, answer from the same file.
 *
 * A gameability probe seeds nothing into the target, so, like a clean
 * control, its `artifactDigest` is its `implementationDigest`.
 */

'use strict';

const path = require('node:path');

const { admissionRefusal, armVerdict, referenceTo } = require('./admission');
const { runArm } = require('./arm');
const { expectedSchemaVersion } = require('./engine');
const { evaluateOracles, oraclesOfBehaviors } = require('./evaluator');

/** Where a gameability probe's degenerate response is committed, relative to the evaluation folder. */
function degenerateResponsePath(probeId) {
  return `corpus/gameability/${probeId}.json`;
}

/** Which kind of request a degenerate step's answer answers: a tool call's error flag, an HTTP status, or a command's exit. */
function answeredKind(answer) {
  if (typeof answer?.isError === 'boolean') return 'mcp';
  if (Number.isInteger(answer?.status)) return 'api';
  return 'cli';
}

const KIND_NAMES = { cli: 'a command', mcp: 'a tool call', api: 'an HTTP request' };

/**
 * A port that launches nothing: it answers each plan step of an arm labelled
 * `label` with the committed degenerate response for that step, in the shape
 * the command-line adapter or the MCP adapter returns for the request's kind,
 * or, for an HTTP step, through the evaluation's own HTTP port with a
 * transport that answers from the response and sends nothing
 * (`registry.degenerateHttpPort`).
 *
 * @param {object} options
 * @param {string} options.label the arm's label, which `runArm` prefixes each request's identifier with
 * @param {Record<string, object>} options.steps the response by plan step: `{ stdout, stderr, exitCode }` for a command
 *   step, `{ isError, structuredResult? }` for a tool call, `{ status, headers?, body? }` for an HTTP request
 * @param {object} [options.registry] the registry, whose HTTP port answers an HTTP step
 * @returns {{ probe: (request: object) => Promise<{ request: object, observation: object }> }}
 */
function syntheticPort({ label, steps, registry }) {
  const prefix = `${label}-`;
  return {
    async probe(request) {
      const stepId =
        typeof request?.probeId === 'string' && request.probeId.startsWith(prefix) ? request.probeId.slice(prefix.length) : null;
      if (stepId === null || !Object.hasOwn(steps, stepId)) {
        throw new Error(`the degenerate response answers no plan step for request ${JSON.stringify(request?.probeId ?? null)}`);
      }
      const answer = steps[stepId];
      const correlation = { probeId: request.probeId, interfaceId: request.interfaceId, operationId: request.operationId };
      const kind = answeredKind(answer);
      if (request.kind !== kind) {
        throw new Error(
          `the degenerate response answers plan step ${stepId}, ${KIND_NAMES[request.kind] ?? request.kind}, with ${KIND_NAMES[kind]}'s response`,
        );
      }
      if (kind === 'api') {
        if (registry === undefined)
          throw new Error(`plan step ${stepId} is an HTTP request and no registry holds the evaluation's HTTP port`);
        return { request, observation: await registry.degenerateHttpPort(answer).probe(request) };
      }
      if (kind === 'mcp') {
        return {
          request,
          observation: {
            ...correlation,
            kind: 'mcp',
            isError: answer.isError,
            result: Object.hasOwn(answer, 'structuredResult') ? { kind: 'json', value: answer.structuredResult } : { kind: 'absent' },
          },
        };
      }
      return {
        request,
        observation: {
          ...correlation,
          kind: 'cli',
          exitCode: answer.exitCode,
          stdout: { kind: 'text', value: answer.stdout },
          stderr: { kind: 'text', value: answer.stderr },
          artifacts: {},
        },
      };
    },
  };
}

/**
 * The degenerate response answered once through the plan, as `runArm` records
 * it: `provenance` is `baseline` for qualification and `evaluator-chosen` for
 * a scored trial.
 */
function degenerateArm({ contract, registry, steps, label, provenance, signal }) {
  return runArm({ contract, port: syntheticPort({ label, steps, registry }), registry, label, provenance, signal });
}

/**
 * Qualifies every gameability probe and materializes each as eval-quality's
 * `gameability` probe.
 *
 * @param {object} context `runTrialSets`'s context
 * @param {Array<{ file: string, probe: object, bytes: Buffer, steps: object }>} context.gameability the committed
 *   gameability probes, each with its degenerate response's bytes and steps, read before anything ran
 * @returns {Promise<Array<{ probe: object, steps: object, response: object }>>}
 */
async function qualifyGameabilityProbes({
  folder,
  evaluation,
  contract,
  registry,
  gameability,
  policy,
  engine,
  validate,
  digests,
  writer,
  stop,
  log,
  signal,
}) {
  const materialized = [];
  for (const { file, probe, bytes, steps } of gameability) {
    const response = { path: degenerateResponsePath(probe.probeId), digest: engine.digestBytes(bytes) };
    const directory = `qualification/${probe.probeId}`;
    let arm;
    try {
      arm = await degenerateArm({ contract, registry, steps, label: 'degenerate', provenance: 'baseline', signal });
    } catch (error) {
      writer.writeJson(`${directory}/fault.json`, {
        probeId: probe.probeId,
        degenerateResponse: response,
        message: String(error?.message ?? error),
        steps: error?.steps ?? [],
      });
      throw stop({
        stage: 'qualification',
        exitCode: 12,
        message: `${file}: the degenerate response could not be answered through the plan: ${error?.message ?? error}`,
      });
    }
    const naiveOracleId = probe.qualification.naiveOracle;
    const disciplinedOracleIds = oraclesOfBehaviors(contract, [probe.behaviorId]);
    const resolve = (oracleIds) =>
      evaluateOracles({ contract, stepObservations: arm.stepObservations, oracleIds, regexMatchStepBudget: policy.regexMatchStepBudget });
    const phases = [
      {
        name: 'naive-oracle-satisfied',
        oracles: await resolve([naiveOracleId]),
        expected: 'held',
        role: `the naive oracle ${naiveOracleId}`,
      },
      {
        name: 'disciplined-oracle-rejected',
        oracles: await resolve(disciplinedOracleIds),
        expected: 'violated',
        role: `the disciplined oracle ${disciplinedOracleIds.join(', ')} of ${probe.behaviorId}`,
      },
    ];
    const files = {};
    for (const phase of phases) {
      files[phase.name] = `${directory}/${phase.name}.json`;
      writer.writeJson(files[phase.name], {
        probeId: probe.probeId,
        phase: phase.name,
        degenerateResponse: response,
        verdict: armVerdict(phase.oracles),
        oracles: phase.oracles,
        steps: arm.steps,
      });
    }
    for (const phase of phases) {
      const verdict = armVerdict(phase.oracles);
      if (phase.oracles.length === 0 || verdict !== phase.expected) {
        throw stop({
          stage: 'qualification',
          exitCode: phase.oracles.length === 0 ? 10 : 11,
          message:
            phase.oracles.length === 0
              ? `${file}: behavior ${probe.behaviorId} declares no oracle, so no disciplined oracle can reject the degenerate response`
              : `${file}: over the degenerate response ${response.path}, ${phase.role} is ${verdict} where it must be ${phase.expected}, so the probe does not show the response games the naive oracle; the evidence is in ${path.relative(folder, writer.pathOf(files[phase.name]))}`,
        });
      }
    }
    const candidate = {
      schemaVersion: expectedSchemaVersion('probe'),
      parentDigest: null,
      revisionCount: 0,
      probeId: probe.probeId,
      probeClass: probe.probeClass,
      behaviorId: probe.behaviorId,
      systemId: evaluation.evaluationId,
      implementationDigest: digests.implementationDigest,
      // A gameability probe seeds nothing into the target, so the artifact under test is the implementation as a whole.
      artifactDigest: digests.implementationDigest,
      commitDigest: digests.commitDigest,
      rationale: probe.rationale,
      qualification: {
        route: 'gameability',
        degenerateResponse: probe.qualification.degenerateResponse,
        naiveOracleSatisfiedEvidence: referenceTo(folder, writer, files['naive-oracle-satisfied'], engine.digestBytes),
        disciplinedOracleRejectedEvidence: referenceTo(folder, writer, files['disciplined-oracle-rejected'], engine.digestBytes),
      },
      expectedClean: false,
      defects: [],
      defectSignature: probe.defectSignature ?? null,
    };
    const refused = await admissionRefusal({ candidate, contract, engine, validate });
    if (refused !== null) throw stop({ stage: 'qualification', exitCode: 10, message: `${file}: ${refused}` });
    log(`${file}: qualified; its degenerate response satisfies ${naiveOracleId} and violates ${disciplinedOracleIds.join(', ')}`);
    materialized.push({ probe: candidate, steps, response });
  }
  return materialized;
}

module.exports = { answeredKind, degenerateArm, degenerateResponsePath, qualifyGameabilityProbes, syntheticPort };
