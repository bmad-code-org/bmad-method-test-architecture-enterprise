/**
 * The single-trial arm executor (AD-7, AD-8): one pass over a contract's
 * interaction plan against one workspace, through the registry's port.
 *
 * Each step becomes one request of its interface's kind. A `cli` step sends
 * the operation's invocation with each channel's literal bindings as its
 * values: a `stdin` binding with one string literal is sent as that text, any
 * other as a JSON object of its bindings. An `mcp` step (Story 1.10) calls the
 * operation's tool with its literal `arguments`. A step runs after the step
 * its `after` clause names, and otherwise in plan order. A binding this
 * release cannot resolve (`captured`, a `matcher`, a `principal`) and an
 * operation of another kind stop the arm with an `ArmError` (exit 12): the
 * run cannot send the request the contract means.
 *
 * What comes back is recorded twice: as the port answered it, for evidence, and
 * as a Sealed Run Record observation (the call inputs the plan bound), keyed by
 * step, which is what an oracle's `/interactions/<stepId>/...` pointers resolve
 * against; a tool call's record carries its arguments as `callInputs.arguments`,
 * its structured result as `responseBody` and its error flag as
 * `responseStatus` 1 or 0, the projection eval-quality's `McpProbeObservation`
 * names. A qualification arm records `provenance: baseline`; a scored trial
 * records `evaluator-chosen`, since under the deterministic evaluator the plan
 * is the evaluator's own exercise of the target, and eval-quality's witness
 * match counts only evaluator-chosen observations (AD-7). A command answer
 * whose exit code the registry entry declares as an infrastructure exit code,
 * or that a signal from outside stopped (`stoppedFromOutside`), is a target
 * that could not run, so it also stops the arm (AD-7). A step that crashed by
 * a signal of its own is an observation like any other, as is a tool call the
 * server answered with its error flag set; a server that could not start or
 * answer throws from the adapter.
 *
 * `hostEnvironmentPort` is the port every leg and arm goes through: it adds the
 * host's values for the keys a command entry permits beneath the request's
 * own, and scrubs every such value, and every value a tool server's
 * environment carries, from what comes back.
 */

'use strict';

const { recordObservation } = require('./records');

/** An injected environment value shorter than this is not scrubbed from output: it would match ordinary text. */
const MIN_SCRUBBED_VALUE_LENGTH = 8;
/** The shortest leading part of a secret redacted where a cut text ends in it; a shorter one would match ordinary text. */
const MIN_CUT_PREFIX_LENGTH = 4;
const SCRUBBED = '[redacted]';

/**
 * The signals that stop a process from outside it (hang-up, interrupt, quit,
 * kill, terminate), which the adapter reports as that signal's number made
 * negative. A process a signal of its own making ended (an abort, a
 * segmentation fault) crashed, and its observation is the target's behavior
 * for the oracles to judge; eval-quality's record keeps the signed code for
 * that reason.
 */
const EXTERNAL_STOPS = new Set([1, 2, 3, 9, 15]);

/** Whether an observed exit code says the step was stopped from outside, or reports no code at all: a target that could not run. */
function stoppedFromOutside(exitCode) {
  if (!Number.isInteger(exitCode)) return true;
  return exitCode < 0 && EXTERNAL_STOPS.has(-exitCode);
}

/** An arm the run cannot drive as the contract means it; `tea-evaluate` reports it as infrastructure (exit 12). */
class ArmError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArmError';
  }
}

/**
 * Each secret in every form text can carry it in, longest first: its own body
 * and, where JSON writes it differently (a `"`, a backslash or a control character
 * in it), its JSON-escaped body, which is how a message quoting a JSON frame or
 * a `JSON.stringify` of the server's answer holds it.
 */
function secretForms(secrets) {
  const forms = new Set();
  for (const secret of secrets) {
    forms.add(secret);
    forms.add(JSON.stringify(secret).slice(1, -1));
  }
  return [...forms].sort((a, b) => b.length - a.length);
}

/**
 * `value` with every string in `secrets` replaced, in strings and object keys
 * alike, walking arrays and objects; a finite number whose text is a secret is
 * replaced as a whole.
 */
function scrub(value, secrets) {
  if (typeof value === 'string') return secrets.reduce((text, secret) => text.split(secret).join(SCRUBBED), value);
  if (typeof value === 'number' && Number.isFinite(value) && secrets.includes(String(value))) return SCRUBBED;
  if (Array.isArray(value)) return value.map((item) => scrub(item, secrets));
  if (value !== null && typeof value === 'object') {
    // A key is scrubbed as a value is: a tool's structured result is an object, and a secret can be one of its keys. A
    // key the scrub leaves as it is keeps its name; one it rewrites into a name already taken is numbered, so no answer
    // loses a field and no untouched key moves.
    const entries = Object.entries(value).map(([key, item]) => [key, scrub(key, secrets), item]);
    const names = new Set(entries.filter(([key, scrubbed]) => key === scrubbed).map(([key]) => key));
    return Object.fromEntries(
      entries.map(([key, scrubbed, item]) => {
        let name = scrubbed;
        if (key !== scrubbed) {
          for (let copy = 2; names.has(name); copy += 1) name = `${scrubbed}-${copy}`;
          names.add(name);
        }
        return [name, scrub(item, secrets)];
      }),
    );
  }
  return value;
}

/**
 * A text that may end in a cut (eval-quality quotes the first 200 characters of
 * a line that is no JSON-RPC message) scrubbed: every whole secret, and then
 * the leading part of one, at least `MIN_CUT_PREFIX_LENGTH` characters long,
 * that the cut left at its end.
 */
function scrubCutText(text, secrets) {
  const scrubbed = scrub(text, secrets);
  let cut = 0;
  for (const secret of secrets) {
    for (let length = secret.length - 1; length > cut && length >= MIN_CUT_PREFIX_LENGTH; length -= 1) {
      if (scrubbed.endsWith(secret.slice(0, length))) {
        cut = length;
        break;
      }
    }
  }
  return cut === 0 ? scrubbed : `${scrubbed.slice(0, -cut)}${SCRUBBED}`;
}

/**
 * The request as it may be written to disk: a command's environment values
 * are replaced by their keys, since a request carries the host's credentials.
 * A tool call carries no environment channel; its server's environment is the
 * registry's and never part of the request.
 */
function persistableRequest(request) {
  if (request?.channels?.environment === undefined) return request;
  return { ...request, channels: { ...request.channels, environment: Object.keys(request.channels.environment).sort() } };
}

/**
 * What a run records of an adapter fault: its code, the `reason` eval-quality
 * gives a policy denial (`tool-not-authorized`, `executable-not-authorized`,
 * `interface-not-authorized`, ...), for every kind, its message, and the
 * scrubbed `cause` of a fault the target could not run under. Nothing is read
 * from the message: a fault that carries no reason is recorded with none.
 *
 * @param {unknown} error
 * @returns {{ code: string|null, reason?: string, message: string }}
 */
function faultRecord(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : null,
    ...(typeof error?.reason === 'string' ? { reason: error.reason } : {}),
    message: String(error?.message ?? error),
    ...(typeof error?.scrubbedCause === 'string' ? { cause: error.scrubbedCause } : {}),
  };
}

/** A denial's reason as a message names it, or nothing when the fault carries none. */
function reasonNote(error) {
  return typeof error?.reason === 'string' ? ` (${error.reason})` : '';
}

/** The scrubbed cause of a fault that could not run, as a message appends it, or nothing (`hostEnvironmentPort`). */
function causeNote(error) {
  const cause = error?.scrubbedCause ?? error?.cause;
  return typeof cause === 'string' ? `: ${cause}` : '';
}

/** How the isolation manifest names one call: `<interfaceId>/<executable>` for a command, `<interfaceId>/<tool>` for a tool call. */
function callLabel(request) {
  return `${request.interfaceId}/${request.kind === 'mcp' ? request.toolName : request.executable}`;
}

/** One tagged observed body as a record's JSON value: a JSON or text body's value, and `null` for an absent one. */
function bodyValue(body) {
  if (body?.kind === 'json' || body?.kind === 'text') return body.value;
  return null;
}

/**
 * A port over `port` that gives each registered command request the host's
 * values for the environment keys its registry entry permits, beneath the ones
 * the request declares (the command-line adapter hands a child nothing but
 * PATH and what the request carries), and scrubs every injected value, and
 * every value a registered tool server starts with, from the observation. A
 * request the registry does not name goes through unchanged, so the adapter's
 * own policy refuses it.
 *
 * @returns {{ probe: (request: object, signal?: AbortSignal) => Promise<{ request: object, observation: object }> }}
 */
function hostEnvironmentPort({ port, registry }) {
  return {
    async probe(request, signal) {
      const registered = request?.kind === 'cli' && registry.targetFor(request.interfaceId, request.executable) !== undefined;
      const injected = registered ? registry.hostEnvironment(request.interfaceId, [], request.executable) : {};
      const augmented = registered
        ? { ...request, channels: { ...request.channels, environment: { ...injected, ...request.channels.environment } } }
        : request;
      // A tool server starts with the host's values for its entry's keys, which its authorization carries.
      const server =
        request?.kind === 'mcp' && registry.serverFor(request.interfaceId) !== undefined
          ? registry.serverEnvironment(request.interfaceId)
          : {};
      const secrets = secretForms(
        [...Object.values(injected), ...Object.values(server)].filter((value) => value.length >= MIN_SCRUBBED_VALUE_LENGTH),
      );
      try {
        return { request: augmented, observation: scrub(await port.probe(augmented, signal), secrets) };
      } catch (error) {
        error.request = augmented;
        // eval-quality reports a mechanism's own failure (a server that would not start, a refused handshake, a
        // malformed frame, a spawn error) as the fault's cause, which can quote what the target printed, JSON-escaped
        // or cut short, so it is kept scrubbed beside the fault.
        if (error?.cause !== undefined) error.scrubbedCause = scrubCutText(String(error.cause?.message ?? error.cause), secrets);
        throw error;
      }
    },
  };
}

/** Each operation the contract declares, by operation identifier, with its interface; an identifier two interfaces share is ambiguous. */
function operationsById(contract) {
  const index = new Map();
  for (const iface of contract.permittedInterfaces ?? []) {
    for (const operation of iface.operations ?? []) {
      const known = index.get(operation.operationId);
      index.set(operation.operationId, known === undefined ? { iface, operation } : { ambiguous: true });
    }
  }
  return index;
}

/** The literal values one binding channel supplies, or null for an unbound channel. */
function literalValues(channel, stepId, name) {
  if (channel === null || channel === undefined) return null;
  const values = {};
  for (const [key, binding] of Object.entries(channel)) {
    if (binding === null || typeof binding !== 'object' || !Object.hasOwn(binding, 'literal')) {
      throw new ArmError(
        `interaction plan step ${stepId} binds ${name}.${key} with ${JSON.stringify(binding)}; this release sends literal bindings only`,
      );
    }
    // eval-quality's request parser drops an own `__proto__` key, so the target would receive other inputs than the record shows.
    if (key === '__proto__' || carriesPrototypeKey(binding.literal)) {
      throw new ArmError(`interaction plan step ${stepId} binds ${name}.${key} with a __proto__ key, which the request cannot send`);
    }
    values[key] = binding.literal;
  }
  return values;
}

/** Whether `value` holds an own `__proto__` key at any depth. */
function carriesPrototypeKey(value) {
  if (Array.isArray(value)) return value.some((item) => carriesPrototypeKey(item));
  if (value === null || typeof value !== 'object') return false;
  return Object.hasOwn(value, '__proto__') || Object.values(value).some((item) => carriesPrototypeKey(item));
}

/** A request's standard input from the bound `stdin` values. */
function stdinOf(values) {
  if (values === null) return { kind: 'absent' };
  const keys = Object.keys(values);
  if (keys.length === 1 && typeof values[keys[0]] === 'string') return { kind: 'text', value: values[keys[0]] };
  return { kind: 'json', value: values };
}

/** The plan's steps in the order they run: each after the step its `after` clause names, otherwise in plan order. */
function orderedSteps(plan) {
  const remaining = [...plan];
  const done = new Set();
  const ordered = [];
  while (remaining.length > 0) {
    const index = remaining.findIndex((step) => step.after === null || step.after === undefined || done.has(step.after));
    if (index === -1) {
      throw new ArmError(
        `interaction plan step ${remaining[0].stepId} runs after ${remaining[0].after}, which no runnable step is; the plan has no order to run in`,
      );
    }
    const [step] = remaining.splice(index, 1);
    done.add(step.stepId);
    ordered.push(step);
  }
  return ordered;
}

/**
 * Runs one arm: every interaction plan step once, in order.
 *
 * @param {object} options
 * @param {object} options.contract the authored contract
 * @param {{probe: Function}} options.port a `hostEnvironmentPort` over the workspace's adapter
 * @param {object} options.registry the registry, for each target's infrastructure exit codes
 * @param {string} options.label names the arm's legs and observations (`baseline`, `mutated`, `re-pass-1`, `trial-2`)
 * @param {'baseline'|'evaluator-chosen'} [options.provenance] what each record observation carries
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ steps: object[], stepObservations: Record<string, object> }>}
 *   `steps` holds each step's persistable request and the port's observation, `stepObservations` the record observations by step
 * @throws {ArmError}
 */
async function runArm({ contract, port, registry, label, provenance = 'baseline', signal }) {
  const operations = operationsById(contract);
  const steps = [];
  const stepObservations = {};
  let sequence = 0;
  for (const step of orderedSteps(contract.interactionPlan ?? [])) {
    const found = operations.get(step.operationId);
    if (found === undefined || found.ambiguous) {
      throw new ArmError(
        `interaction plan step ${step.stepId} names operation ${step.operationId}, which ${found === undefined ? 'no interface declares' : 'two interfaces declare'}`,
      );
    }
    const { iface, operation } = found;
    const binding = step.inputBinding ?? {};
    let request;
    let callInputs;
    if (iface.kind === 'mcp' && typeof operation.toolName === 'string') {
      const toolArguments = literalValues(binding.arguments, step.stepId, 'arguments');
      request = {
        probeId: `${label}-${step.stepId}`,
        interfaceId: iface.logicalId,
        operationId: operation.operationId,
        kind: 'mcp',
        toolName: operation.toolName,
        channels: { arguments: toolArguments ?? {} },
      };
      callInputs = { arguments: toolArguments ?? {} };
    } else if (iface.kind === 'cli' && operation.invocation !== undefined) {
      const argument = literalValues(binding.argument, step.stepId, 'argument');
      const option = literalValues(binding.option, step.stepId, 'option');
      const environment = literalValues(binding.environment, step.stepId, 'environment');
      const stdin = literalValues(binding.stdin, step.stepId, 'stdin');
      request = {
        probeId: `${label}-${step.stepId}`,
        interfaceId: iface.logicalId,
        operationId: operation.operationId,
        kind: 'cli',
        executable: operation.invocation.executable,
        subcommandPath: [...operation.invocation.subcommandPath],
        channels: { argument: argument ?? {}, option: option ?? {}, environment: environment ?? {}, stdin: stdinOf(stdin) },
      };
      callInputs = { argument, option, environment, stdin };
    } else {
      throw new ArmError(
        `interaction plan step ${step.stepId} names a ${iface.kind} operation; this release runs command and tool-call operations only`,
      );
    }
    const answered = await port.probe(request, signal);
    const { observation } = answered;
    sequence += 1;
    steps.push({ stepId: step.stepId, request: persistableRequest(answered.request), observation });
    if (observation?.kind !== request.kind) {
      const error = new ArmError(
        `the ${label} arm's step ${step.stepId} sent a ${request.kind} request and the port answered a ${JSON.stringify(observation?.kind ?? null)} observation`,
      );
      error.steps = steps;
      throw error;
    }
    if (request.kind === 'mcp') {
      stepObservations[step.stepId] = recordObservation({
        observationId: request.probeId,
        sequence,
        operationId: operation.operationId,
        callInputs,
        responseBody: bodyValue(observation.result),
        // A tool call has no transport status, so the envelope's error flag is recorded here as 1 or 0 (McpProbeObservation).
        responseStatus: observation.isError ? 1 : 0,
        provenance,
      });
      continue;
    }
    const entry = registry.targetFor(request.interfaceId, request.executable);
    const { exitCode } = observation;
    const signalled = stoppedFromOutside(exitCode);
    if (signalled || (entry !== undefined && entry.infrastructureExitCodes.includes(exitCode))) {
      const error = new ArmError(
        signalled
          ? `the ${label} arm's step ${step.stepId} was stopped by a signal from outside it (exit code ${JSON.stringify(exitCode)}): the target could not run`
          : `the ${label} arm's step ${step.stepId} exited ${exitCode}, which the ${request.executable} registry entry declares as an infrastructure exit code: the target could not run`,
      );
      error.steps = steps;
      throw error;
    }
    stepObservations[step.stepId] = recordObservation({
      observationId: request.probeId,
      sequence,
      operationId: operation.operationId,
      callInputs,
      stdout: observation.stdout,
      stderr: observation.stderr,
      exitCode: observation.exitCode,
      artifacts: observation.artifacts ?? {},
      provenance,
    });
  }
  return { steps, stepObservations };
}

module.exports = {
  ArmError,
  bodyValue,
  callLabel,
  carriesPrototypeKey,
  causeNote,
  faultRecord,
  hostEnvironmentPort,
  persistableRequest,
  reasonNote,
  runArm,
  scrub,
  scrubCutText,
  secretForms,
  stoppedFromOutside,
};
