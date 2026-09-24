/**
 * The single-trial arm executor (AD-7, AD-8): one pass over a contract's
 * interaction plan against one workspace, through the registry's port.
 *
 * Each step becomes one `cli` request: the operation's invocation, and each
 * channel's literal bindings as its values. A `stdin` binding with one string
 * literal is sent as that text, any other as a JSON object of its bindings. A
 * step runs after the step its `after` clause names, and otherwise in plan
 * order. A binding this release cannot resolve (`captured`, a `matcher`, a
 * `principal`) and an operation that is not a command stop the arm with an
 * `ArmError` (exit 12): the run cannot send the request the contract means.
 *
 * What comes back is recorded twice: as the port answered it, for evidence, and
 * as a Sealed Run Record observation (`provenance: baseline`, the call inputs
 * the plan bound), keyed by step, which is what an oracle's
 * `/interactions/<stepId>/...` pointers resolve against. An answer whose exit
 * code the registry entry declares as an infrastructure exit code is a target
 * that could not run, so it also stops the arm (AD-7).
 *
 * `hostEnvironmentPort` is the port every leg and arm goes through: it adds the
 * host's values for the keys a registry entry permits beneath the request's
 * own, and scrubs every injected value from what comes back.
 */

'use strict';

const { recordObservation } = require('./records');

/** An injected environment value shorter than this is not scrubbed from output: it would match ordinary text. */
const MIN_SCRUBBED_VALUE_LENGTH = 8;
const SCRUBBED = '[redacted]';

/** An arm the run cannot drive as the contract means it; `tea-evaluate` reports it as infrastructure (exit 12). */
class ArmError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArmError';
  }
}

/** `value` with every string in `secrets` replaced, walking arrays and objects. */
function scrub(value, secrets) {
  if (typeof value === 'string') return secrets.reduce((text, secret) => text.split(secret).join(SCRUBBED), value);
  if (Array.isArray(value)) return value.map((item) => scrub(item, secrets));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item, secrets)]));
  }
  return value;
}

/**
 * The request as it may be written to disk: environment values are replaced by
 * their keys, since a request carries the host's credentials.
 */
function persistableRequest(request) {
  return { ...request, channels: { ...request.channels, environment: Object.keys(request.channels?.environment ?? {}).sort() } };
}

/**
 * A port over `port` that gives each registered request the host's values for
 * the environment keys its registry entry permits, beneath the ones the request
 * declares (the command-line adapter hands a child nothing but PATH and what
 * the request carries), and scrubs every injected value from the observation.
 * A request for a pair the registry does not name goes through unchanged, so
 * the adapter's own policy refuses it.
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
      const secrets = Object.values(injected)
        .filter((value) => value.length >= MIN_SCRUBBED_VALUE_LENGTH)
        .sort((a, b) => b.length - a.length);
      try {
        return { request: augmented, observation: scrub(await port.probe(augmented, signal), secrets) };
      } catch (error) {
        error.request = augmented;
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
    values[key] = binding.literal;
  }
  return values;
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
 * @param {string} options.label names the arm's legs and observations (`baseline`, `mutated`, `re-pass-1`)
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ steps: object[], stepObservations: Record<string, object> }>}
 *   `steps` holds each step's persistable request and the port's observation, `stepObservations` the record observations by step
 * @throws {ArmError}
 */
async function runArm({ contract, port, registry, label, signal }) {
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
    if (iface.kind !== 'cli' || operation.invocation === undefined) {
      throw new ArmError(`interaction plan step ${step.stepId} names a ${iface.kind} operation; this release runs command operations only`);
    }
    const binding = step.inputBinding ?? {};
    const argument = literalValues(binding.argument, step.stepId, 'argument');
    const option = literalValues(binding.option, step.stepId, 'option');
    const environment = literalValues(binding.environment, step.stepId, 'environment');
    const stdin = literalValues(binding.stdin, step.stepId, 'stdin');
    const request = {
      probeId: `${label}-${step.stepId}`,
      interfaceId: iface.logicalId,
      operationId: operation.operationId,
      kind: 'cli',
      executable: operation.invocation.executable,
      subcommandPath: [...operation.invocation.subcommandPath],
      channels: { argument: argument ?? {}, option: option ?? {}, environment: environment ?? {}, stdin: stdinOf(stdin) },
    };
    const answered = await port.probe(request, signal);
    const { observation } = answered;
    sequence += 1;
    steps.push({ stepId: step.stepId, request: persistableRequest(answered.request), observation });
    const entry = registry.targetFor(request.interfaceId, request.executable);
    if (entry !== undefined && entry.infrastructureExitCodes.includes(observation.exitCode)) {
      const error = new ArmError(
        `the ${label} arm's step ${step.stepId} exited ${observation.exitCode}, which the ${request.executable} registry entry declares as an infrastructure exit code: the target could not run`,
      );
      error.steps = steps;
      throw error;
    }
    stepObservations[step.stepId] = recordObservation({
      observationId: request.probeId,
      sequence,
      operationId: operation.operationId,
      callInputs: { argument, option, environment, stdin },
      stdout: observation.stdout,
      stderr: observation.stderr,
      exitCode: observation.exitCode,
      artifacts: observation.artifacts ?? {},
      provenance: 'baseline',
    });
  }
  return { steps, stepObservations };
}

module.exports = { ArmError, hostEnvironmentPort, persistableRequest, runArm };
