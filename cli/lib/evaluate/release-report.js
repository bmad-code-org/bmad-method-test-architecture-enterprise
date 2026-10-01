/**
 * How a deployment reports its release (Story 1.38, AD-1, AD-8): each
 * `Deployment` of a deployment-routed historical probe names `report`, an
 * operation of the contract's `api` interface and an RFC 6901 JSON pointer
 * into the JSON body of its answer. Before either qualification arm the
 * runtime sends that request to each deployment through the evaluation's HTTP
 * port and reads the string at the pointer, so the digests a qualified probe
 * records name the releases the run measured.
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

const { hostEnvironmentPort, runArm } = require('./arm');
const { loadEngine } = require('./engine');

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
 * What is wrong with one deployment's `report`: its operation is not one
 * operation of an `api` interface of the contract that the registry serves
 * over HTTP, it is marked as changing state (the request reads a release and
 * goes to a live deployment before any arm runs), the request would need an
 * input (a path parameter or a required key in any channel), since nothing
 * binds one, or its pointer is no JSON pointer. A `report` that is not an
 * object with both string fields is the schema's finding.
 *
 * @param {object} options
 * @param {unknown} options.report the deployment's `report`
 * @param {object} [options.contract] the contract the probe's evaluation declares
 * @param {string[]|null} options.interfaces the registry's HTTP interface IDs, or null when the registry is unread
 * @param {string} options.where how the finding names the field (`deployments.preFix.report`)
 * @returns {string[]}
 */
function reportProblems({ report, contract, interfaces, where }) {
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
  const declaring = contract.permittedInterfaces.flatMap((iface) =>
    (Array.isArray(iface?.operations) ? iface.operations : [])
      .filter((operation) => operation?.operationId === report.operationId)
      .map((operation) => ({ iface, operation })),
  );
  if (declaring.length > 1) {
    problems.push(
      `${where}.operationId names ${JSON.stringify(report.operationId)}, which ${declaring.length} interfaces of the contract declare`,
    );
    return problems;
  }
  if (declaring.length === 0 || declaring[0].iface?.kind !== 'api') {
    problems.push(
      `${where}.operationId names ${JSON.stringify(report.operationId)}, which ${declaring.length === 0 ? 'no interface of the contract declares' : 'is not an operation of an api interface'}; a deployment reports its release through an operation of the contract's api interface`,
    );
    return problems;
  }
  const [{ iface, operation }] = declaring;
  if (interfaces !== null && !interfaces.includes(iface.logicalId)) {
    problems.push(
      `${where}.operationId names ${JSON.stringify(report.operationId)} of interface ${JSON.stringify(iface.logicalId)}, which the registry does not serve over HTTP (${JSON.stringify(interfaces)}); the request goes to the origin the deployment names for that interface`,
    );
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
 * Sends one deployment its report request through `port` and reads the string
 * at the pointer. The answer is a 2xx status with a JSON body (one the port
 * reads as JSON, which takes an `application/json` or `+json` content type)
 * that holds a string at `report.pointer`; any other answer leaves `unread`
 * with the pointer and what was found. A fault the port throws (a policy
 * denial, a target that could not run) is not caught here: the caller decides
 * which faults refuse the probe.
 *
 * @param {object} options
 * @param {object} options.contract the authored contract
 * @param {{ operationId: string, pointer: string }} options.report
 * @param {{ probe: Function }} options.port the port `createProbePort({ deployment })` returned
 * @param {object} options.registry the registry, for the host environment and the secrets to scrub
 * @param {string} options.label names the request (`report-pre-fix`)
 * @param {string} [options.seed]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ reported: string } | { unread: string }>}
 */
async function reportedRelease({ contract, report, port, registry, label, seed, signal }) {
  const plan = [
    {
      stepId: REPORT_STEP,
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

module.exports = { isJsonPointer, quotedIdentifier, reportProblems, reportedRelease };
