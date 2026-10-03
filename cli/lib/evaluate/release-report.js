/**
 * How a deployment reports its release (Stories 1.38 and 1.65, AD-1, AD-8):
 * each `Deployment` of a deployment-routed historical probe names `reports`,
 * an object keyed by the ID of each HTTP interface of the registry, whose
 * value is an operation of that interface's `api` contract entry and an
 * RFC 6901 JSON pointer into the JSON body of its answer. Before either
 * qualification arm the runtime sends each deployment one such request per
 * interface through the evaluation's HTTP port, each to that interface's own
 * origin, and reads the string at the pointer, so the digests a qualified
 * probe records name the releases the run measured at every origin.
 *
 * The request is built as an arm builds an `api` step with no bound inputs:
 * `runArm` runs a plan of that one step over the contract, so the method, path
 * template and channels are the ones every call meets, and eval-quality's
 * `evaluateTarget` decides the request in the port. The call is no trial, so
 * it records no evidence artifact. TeA computes no verdict here: the
 * comparison is an equality of the string read and the release the probe
 * declares, TeA's own field.
 */

'use strict';

const path = require('node:path');

const { hostEnvironmentPort, runArm } = require('./arm');
const { EngineUnavailableError, loadEngine } = require('./engine');
const { EngineStageError, runEngineStage } = require('./engine-cli');
const { makeScratchDirectory, releaseScratchDirectory } = require('./workspace');

/** The step the report request runs as; no plan step of the contract carries it. */
const REPORT_STEP = 'release-report';
/** The request channels of an operation that a bound input could fill. */
const REQUEST_CHANNELS = ['path', 'query', 'header', 'body'];
/** RFC 6901: one or more `/`-led reference tokens, each holding `~` only as `~0` or `~1`. */
const JSON_POINTER = /^(?:\/(?:[^~/]|~[01])*)+$/;
/** A path template parameter. */
const PATH_PARAMETER = /\{[^{}]*\}/;
/** The most of a reported identifier a refusal quotes. */
const QUOTED_LENGTH = 160;

/** Whether `text` is a non-empty RFC 6901 JSON pointer. */
function isJsonPointer(text) {
  return typeof text === 'string' && JSON_POINTER.test(text);
}

/**
 * What is wrong with one entry of a deployment's `reports`: its operation is
 * not one operation of an `api` interface of the contract, it belongs to
 * another interface than the one the entry is keyed by (the request goes to
 * the origin of the interface its operation belongs to, so the key would
 * name an origin the run never asks), it is marked as changing state (the
 * request reads a release and goes to a live deployment before any arm runs),
 * the request would need an input (a path parameter or a required key in any
 * channel), since nothing binds one, or its pointer is no JSON pointer. An
 * entry that is not an object with both string fields is the schema's
 * finding.
 *
 * @param {object} options
 * @param {unknown} options.report the entry's `{ operationId, pointer }`
 * @param {string} options.interfaceId the interface the entry is keyed by
 * @param {object} [options.contract] the contract the probe's evaluation declares
 * @param {string} options.where how the finding names the entry (`deployments.preFix.reports.grader`)
 * @returns {string[]}
 */
function reportProblems({ report, interfaceId, contract, where }) {
  if (report === null || typeof report !== 'object' || typeof report.operationId !== 'string' || typeof report.pointer !== 'string') {
    return [];
  }
  const problems = [];
  if (!isJsonPointer(report.pointer)) {
    problems.push(
      `${where}.pointer is ${JSON.stringify(report.pointer)}, which is no JSON pointer (RFC 6901: one or more "/"-led reference tokens, with "~" only as "~0" or "~1")`,
    );
  }
  if (!Array.isArray(contract?.permittedInterfaces)) return problems;
  // An operation ID is scoped to its interface, so the entry's key names the interface the operation is looked up in.
  const iface = contract.permittedInterfaces.find((candidate) => candidate?.logicalId === interfaceId);
  const operation = (Array.isArray(iface?.operations) ? iface.operations : []).find(
    (candidate) => candidate?.operationId === report.operationId,
  );
  if (operation === undefined || iface.kind !== 'api') {
    problems.push(
      `${where}.operationId names ${JSON.stringify(report.operationId)}, which ${operation === undefined ? `interface ${JSON.stringify(interfaceId)} of the contract does not declare` : 'is not an operation of an api interface'}; a deployment reports its release through an operation of the contract's api interface`,
    );
    return problems;
  }
  if (operation.stateChangeMarker === true) {
    problems.push(
      `${where}.operationId names ${JSON.stringify(report.operationId)}, which the contract marks as changing state; the report request reads a release and goes to each live deployment before any arm runs, so name an operation that changes none`,
    );
  }
  const needs = REQUEST_CHANNELS.filter((channel) => (operation.requestShape?.[channel]?.requiredKeys ?? []).length > 0);
  if (needs.length > 0 || PATH_PARAMETER.test(operation.pathTemplate ?? '')) {
    problems.push(
      `${where}.operationId names ${JSON.stringify(report.operationId)}, which ${PATH_PARAMETER.test(operation.pathTemplate ?? '') ? `has the path parameter in ${JSON.stringify(operation.pathTemplate)}` : `requires input in its ${needs.join(' and ')} channel`}; the report request is sent with no bound inputs, so name an operation that needs none`,
    );
  }
  return problems;
}

/**
 * What is wrong with a deployment's whole `reports`: an HTTP interface of the
 * registry with no entry (its origin would go unasked, and the run would
 * measure it under an identifier it never reported), an entry for an
 * interface the registry does not serve over HTTP, and every finding of
 * `reportProblems` for each entry, interfaces in sorted order. A `reports`
 * that is not an object is the schema's finding.
 *
 * @param {object} options
 * @param {unknown} options.reports the deployment's `reports`
 * @param {object} [options.contract] the contract the probe's evaluation declares
 * @param {string[]|null} options.interfaces the registry's HTTP interface IDs, or null when the registry is unread
 * @param {string} options.where how the finding names the field (`deployments.preFix`)
 * @returns {string[]}
 */
function reportsProblems({ reports, contract, interfaces, where }) {
  if (reports === null || typeof reports !== 'object' || Array.isArray(reports)) return [];
  const problems = [];
  const named = Object.keys(reports).sort();
  if (interfaces !== null) {
    const missing = [...interfaces].sort().filter((id) => !Object.hasOwn(reports, id));
    if (missing.length > 0) {
      problems.push(
        `${where}.reports names ${JSON.stringify(named)} and no report for ${missing.map((id) => JSON.stringify(id)).join(', ')}; the run asks the origin of every HTTP interface of the registry (${interfaces.map((id) => JSON.stringify(id)).join(', ')}) which release it runs, so name one report for each`,
      );
    }
    for (const id of named.filter((name) => !interfaces.includes(name))) {
      problems.push(
        `${where}.reports.${id} names an interface the registry does not serve over HTTP (${JSON.stringify(interfaces)}); name a report for each HTTP interface of the registry and no other`,
      );
    }
  }
  for (const id of named) {
    problems.push(...reportProblems({ report: reports[id], interfaceId: id, contract, where: `${where}.reports.${id}` }));
  }
  return problems;
}

/** The refusal code eval-quality's compile gives two `api` operations of one contract that share a method and an erased path template. */
const SIGNATURE_COLLISION = 'duplicate-operation-signature';
/** The refusal code eval-quality's compile gives a contract whose `permittedInterfaces` repeat one `logicalId` (Story 1.102). */
const INTERFACE_REPEAT = 'duplicate-interface-identifier';
/** The exit of eval-quality's compile for a contract it refuses as a structural failure. */
const COMPILE_REFUSED = 4;

/**
 * The report operations a probe's deployments name, as `{ interfaceId, operationId }` pairs in sorted order: each
 * entry of either side's `reports` that names an operation, once.
 *
 * @param {unknown} deployments a probe's `qualification.deployments`
 * @returns {{ interfaceId: string, operationId: string }[]}
 */
function reportedOperations(deployments) {
  const named = new Map();
  for (const side of ['preFix', 'fix']) {
    const reports = deployments?.[side]?.reports;
    if (reports === null || typeof reports !== 'object' || Array.isArray(reports)) continue;
    for (const [interfaceId, entry] of Object.entries(reports)) {
      if (typeof entry?.operationId === 'string')
        named.set(JSON.stringify([interfaceId, entry.operationId]), { interfaceId, operationId: entry.operationId });
    }
  }
  return [...named.values()].sort((a, b) => (a.interfaceId + '\0' + a.operationId).localeCompare(b.interfaceId + '\0' + b.operationId));
}

/**
 * Whether eval-quality's refusal line names one of `operations` as one of the two operations it refuses. The engine
 * names an operation as `permittedInterfaces[logicalId=<interface>].operations[operationId=<operation>]`; this matches
 * identifiers on that line and compares no method or path template (AD-1).
 *
 * @param {string} line the engine's refusal line
 * @param {{ interfaceId: string, operationId: string }[]} operations
 * @returns {boolean}
 */
function lineNamesOperation(line, operations) {
  return operations.some(({ interfaceId, operationId }) =>
    line.includes(`logicalId=${interfaceId}].operations[operationId=${operationId}]`),
  );
}

/**
 * What eval-quality's own compile says about a contract it refuses as a structural failure (exit 4): the refusal lines
 * and the two the `check` rules read, `duplicate-operation-signature` (two `api` operations of its interfaces share a
 * method and an erased path template, AD-19 and AD-40) and `duplicate-interface-identifier` (two interfaces share a
 * `logicalId`, Story 1.102). Each line is `null` when compile gave no such refusal.
 *
 * Both are `null` when compile accepts the contract, refuses it for another cause, faults, or cannot start (those are
 * the `compile` check's findings and `run`'s, not these rules'). The refusals name what they refuse, and TeA compares
 * no template and no identifier (AD-1): it quotes the engine's line.
 *
 * Compile runs once for both rules, in a private temporary directory that holds its output and the stage record and is
 * removed afterward, so nothing is written under the evaluation folder.
 *
 * @param {string} contractPath the evaluation's `contract.json`
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ signatureCollision: string|null, interfaceRepeat: string|null }}
 */
function compileRefusals(contractPath, env = process.env) {
  const none = { signatureCollision: null, interfaceRepeat: null };
  // A scratch list of its own, since `check` has no run: the directory goes through the layer's one scratch path (`makeScratchDirectory`) and is released the same way.
  const scratch = [];
  let staging;
  try {
    staging = makeScratchDirectory(scratch, 'tea-evaluate-check-');
  } catch {
    // A temporary directory that cannot be made leaves the stage unrun: `run` reports it, and these rules stay quiet.
    return none;
  }
  try {
    const stage = runEngineStage('compile', ['--in', contractPath, '--out', path.join(staging, 'eval-contract.json')], {
      runDirectory: staging,
      recordPath: path.join(staging, 'compile-record.json'),
      env,
    });
    if (stage.exitCode !== COMPILE_REFUSED) return none;
    const lines = `${stage.stderr}\n${stage.stdout}`.split('\n');
    const lineFor = (code) => lines.find((candidate) => candidate.includes(`${code}:`))?.trim() ?? null;
    return { signatureCollision: lineFor(SIGNATURE_COLLISION), interfaceRepeat: lineFor(INTERFACE_REPEAT) };
  } catch (error) {
    // The stage could not start, was killed or exited undocumented, or no engine CLI is installed: `run` reports it, and these rules stay quiet.
    if (error instanceof EngineStageError || error instanceof EngineUnavailableError) return none;
    throw error;
  } finally {
    releaseScratchDirectory(scratch, staging);
  }
}

/** What a value found at the pointer is, for a refusal to name: its JSON type alone. */
function typeNote(value) {
  if (Array.isArray(value)) return 'an array';
  if (value === null) return 'null';
  return { object: 'an object', number: 'a number', boolean: 'a boolean' }[typeof value] ?? `a ${typeof value}`;
}

/**
 * An identifier a refusal quotes, as JSON quotes it with every character
 * outside printable ASCII written `\uXXXX` (a deployment controls the text, and
 * a control, separator or direction character would change what a log line
 * shows), cut to its first `QUOTED_LENGTH` characters.
 */
function quotedIdentifier(text) {
  const cut = text.length > QUOTED_LENGTH;
  const quoted = JSON.stringify(cut ? text.slice(0, QUOTED_LENGTH) : text).replaceAll(
    /[^\u0020-\u007E]/g,
    (unit) => `\\u${unit.codePointAt(0).toString(16).padStart(4, '0')}`,
  );
  return cut ? `${quoted} (cut short)` : quoted;
}

/**
 * Sends one deployment one of its report requests through `port` and reads
 * the string at the pointer. The answer is a 2xx status with a JSON body (one the port
 * reads as JSON, which takes an `application/json` or `+json` content type)
 * that holds a string at `report.pointer`; any other answer leaves `unread`
 * with the pointer and what was found. A fault the port throws (a policy
 * denial, a target that could not run) is not caught here: the caller decides
 * which faults refuse the probe.
 *
 * @param {object} options
 * @param {object} options.contract the authored contract
 * @param {{ operationId: string, pointer: string }} options.report
 * @param {string} options.interfaceId the interface the report's operation is declared on
 * @param {{ probe: Function }} options.port the port `createProbePort({ deployment })` returned
 * @param {object} options.registry the registry, for the host environment and the secrets to scrub
 * @param {string} options.label names the request (`report-pre-fix-grader`)
 * @param {string} [options.seed]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ reported: string } | { unread: string }>}
 */
async function reportedRelease({ contract, report, interfaceId, port, registry, label, seed, signal }) {
  const plan = [
    {
      stepId: REPORT_STEP,
      interfaceId,
      operationId: report.operationId,
      after: null,
      cardinality: 'exactly-one',
      inputBinding: { path: null, query: null, header: null, body: null },
    },
  ];
  const { steps, stepObservations } = await runArm({
    contract: { ...contract, interactionPlan: plan },
    port: hostEnvironmentPort({ port, registry }),
    registry,
    label,
    countUsage: false,
    seed,
    signal,
  });
  const { observation } = steps[0];
  if (!Number.isInteger(observation.status) || observation.status < 200 || observation.status > 299) {
    return {
      unread: `the JSON pointer ${JSON.stringify(report.pointer)} has no answer to read, since it answered status ${JSON.stringify(observation.status ?? null)} where a 2xx answer with a JSON body was needed`,
    };
  }
  if (observation.body?.kind !== 'json') {
    return {
      unread: `the JSON pointer ${JSON.stringify(report.pointer)} has no JSON answer to read, since it answered status ${observation.status} with ${observation.body?.kind === 'text' ? 'a text body' : 'no body'}`,
    };
  }
  const engine = await loadEngine();
  const read = engine.makeResolveOperand(stepObservations, {});
  const found = read({ pointer: `/interactions/${REPORT_STEP}/response-body${report.pointer}` }, engine.ABSENT, 'captured');
  if (found === engine.ABSENT) return { unread: `the JSON pointer ${JSON.stringify(report.pointer)} finds nothing in its answer` };
  if (typeof found !== 'string') {
    return {
      unread: `the JSON pointer ${JSON.stringify(report.pointer)} finds ${typeNote(found)} in its answer, where a string was needed`,
    };
  }
  return { reported: found };
}

module.exports = {
  isJsonPointer,
  quotedIdentifier,
  reportProblems,
  reportedOperations,
  lineNamesOperation,
  reportedRelease,
  reportsProblems,
  compileRefusals,
};
