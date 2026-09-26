/**
 * The single-trial arm executor (AD-7, AD-8): one pass over a contract's
 * interaction plan against one workspace, through the registry's port.
 *
 * Each step becomes one request of its interface's kind. A `cli` step sends
 * the operation's invocation with each channel's bound values: a `stdin`
 * binding with one string value is sent as that text, any other as a JSON
 * object of its bindings. An `mcp` step (Story 1.10) calls the operation's
 * tool with its bound `arguments`, and an `api` step (Story 1.11) sends the
 * operation's method and path template with its bound `path`, `query` and
 * `header` values and, when bound, its `body` values as one JSON object.
 *
 * A binding is a `literal`, sent as written, or a `captured` pointer (Story
 * 1.18), sent as the value it resolves to on the named earlier step's
 * observation in this arm, read by eval-quality's own `makeResolveOperand`,
 * the reading its `score` gives the same pointer. A step runs after the step
 * its `after` clause names and after every step its captured bindings read,
 * and otherwise in plan order, so each observation's `sequence` follows the
 * order the steps were issued in. A step whose `after` step was not issued,
 * or one of whose captured bindings resolves to nothing (the earlier step was
 * not issued, or its observation lacks the value), is not issued: it gets no
 * observation, and `steps` records it as skipped with the reason, so
 * eval-quality reads the missing observation as it reads any evidence that
 * does not exist. A binding this release cannot send (a `matcher`, a
 * `principal`) and an operation of another kind stop the arm with an
 * `ArmError` (exit 12): the run cannot send the request the contract means.
 * A cycle over the `after` and capture edges never reaches an arm, since
 * `eval-quality compile` refuses it (`binding-cycle`, `nested-temporal-clause`);
 * if one does, the arm stops with an `ArmError`.
 *
 * What comes back is recorded twice: as the port answered it, for evidence, and
 * as a Sealed Run Record observation (the call inputs the plan bound), keyed by
 * step, which is what an oracle's `/interactions/<stepId>/...` pointers resolve
 * against; a tool call's record carries its arguments as `callInputs.arguments`,
 * its structured result as `responseBody` and its error flag as
 * `responseStatus` 1 or 0, the projection eval-quality's `McpProbeObservation`
 * names; an HTTP call's record carries its `path`, `query`, `header` and `body`
 * inputs and the answer's status, headers and body as `responseStatus`,
 * `responseHeaders` and `responseBody`. A qualification arm records `provenance: baseline`; a scored trial
 * records `evaluator-chosen`, since under the deterministic evaluator the plan
 * is the evaluator's own exercise of the target, and eval-quality's witness
 * match counts only evaluator-chosen observations (AD-7). A command answer
 * whose exit code the registry entry declares as an infrastructure exit code,
 * or that a signal from outside stopped (`stoppedFromOutside`), is a target
 * that could not run, so it also stops the arm (AD-7). A step that crashed by
 * a signal of its own is an observation like any other, as is a tool call the
 * server answered with its error flag set and an HTTP answer at any status; a
 * server that could not start or answer throws from the adapter or the port.
 *
 * `hostEnvironmentPort` is the port every leg and arm goes through: it adds the
 * host's values for the keys a command entry permits beneath the request's
 * own, and scrubs every such value, every value a tool server's environment
 * carries, and every value an HTTP call's server and auth header carry, from
 * what comes back.
 */

'use strict';

const { loadEngine } = require('./engine');
const { recordObservation } = require('./records');

/** An injected environment value shorter than this is not scrubbed from output: it would match ordinary text. */
const MIN_SCRUBBED_VALUE_LENGTH = 8;
/** The shortest leading part of a secret redacted where a cut text ends in it; a shorter one would match ordinary text. */
const MIN_CUT_PREFIX_LENGTH = 4;
const SCRUBBED = '[redacted]';
/** How much of what a process printed a message quotes, from its end. */
const QUOTED_TAIL = 2000;

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
 * `text` with each UTF-16 unit `pattern` matches (the pattern has no `u` flag,
 * so a character outside the BMP is its two surrogates, as JSON writes it)
 * written as JSON's `\uXXXX` escape, in lower- or upper-case hex.
 */
function unicodeEscaped(text, pattern, upper) {
  return text.replace(pattern, (unit) => {
    const hex = unit.codePointAt(0).toString(16).padStart(4, '0');
    return `\\u${upper ? hex.toUpperCase() : hex}`;
  });
}

/** The units a serializer writes as `\uXXXX`: every non-ASCII one (Python's `ensure_ascii`), `<`, `>` and `&` (Go), or both. */
const UNICODE_ESCAPED = [/[\u0080-\uFFFF]/g, /[<>&]/g, /[\u0080-\uFFFF]|[<>&]/g];

/**
 * The ways one level of JSON escaping writes a text, as serializers do in
 * practice: `JSON.stringify`'s string body, with `/` also written `\/` (PHP)
 * or not, and with every non-ASCII character, every `<`, `>` and `&`, or
 * both also written `\uXXXX` in lower- or upper-case hex (`UNICODE_ESCAPED`),
 * or none of them.
 */
function escapingsOf(text) {
  const body = JSON.stringify(text).slice(1, -1);
  const forms = [];
  for (const slashed of [body, body.replaceAll('/', String.raw`\/`)]) {
    forms.push(slashed);
    for (const pattern of UNICODE_ESCAPED) {
      for (const upper of [false, true]) forms.push(unicodeEscaped(slashed, pattern, upper));
    }
  }
  return forms;
}

/**
 * Each secret in every form text can carry it in, longest first and each once:
 * its own body, each way one level of JSON escaping writes it
 * (`escapingsOf`), and each way a second level writes one of those, which is
 * how a message quoting a JSON frame, a `JSON.stringify` of the server's
 * answer, or a JSON string holding JSON holds it. The cause is never decoded:
 * decoding would alter what a legitimate record says.
 */
function secretForms(secrets) {
  const forms = new Set();
  for (const secret of secrets) {
    forms.add(secret);
    for (const once of escapingsOf(secret)) {
      forms.add(once);
      for (const twice of escapingsOf(once)) forms.add(twice);
    }
  }
  return [...forms].sort((a, b) => b.length - a.length);
}

/**
 * Whether a finite number is a secret: its text holds one, or, when its text is as long as a scrubbed value must be,
 * a secret read as a number equals it. The length floor keeps a secret such as `00000000` from redacting every 0.
 */
function numberHoldsSecret(value, secrets) {
  const text = String(value);
  return secrets.some(
    (secret) => text.includes(secret) || (text.length >= MIN_SCRUBBED_VALUE_LENGTH && secret.trim() !== '' && Number(secret) === value),
  );
}

/**
 * `value` with every string in `secrets` replaced, in strings and object keys
 * alike, walking arrays and objects; a finite number whose text holds a secret,
 * or that a secret read as a number equals, is replaced as a whole.
 */
function scrub(value, secrets) {
  if (typeof value === 'string') return secrets.reduce((text, secret) => text.split(secret).join(SCRUBBED), value);
  if (typeof value === 'number' && Number.isFinite(value) && numberHoldsSecret(value, secrets)) return SCRUBBED;
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
 * What a process printed (an error's `captured` text), as a message appends
 * it: scrubbed whole first, a secret's leading part an end cut left included,
 * and only then cut to its last `QUOTED_TAIL` characters, so the cut never
 * splits a secret the scrub has not replaced; nothing for no output.
 */
function quotedCapture(captured, secrets = []) {
  if (typeof captured !== 'string') return '';
  const value = scrubCutText(captured, secrets).trim();
  if (value === '') return '';
  return `: ${value.length > QUOTED_TAIL ? `...${value.slice(-QUOTED_TAIL)}` : value}`;
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

/**
 * How the isolation manifest names one call: `<interfaceId>/<executable>` for a command, `<interfaceId>/<tool>` for a
 * tool call and `<interfaceId>/<method>` for an HTTP request.
 */
function callLabel(request) {
  if (request.kind === 'mcp') return `${request.interfaceId}/${request.toolName}`;
  if (request.kind === 'api') return `${request.interfaceId}/${request.method}`;
  return `${request.interfaceId}/${request.executable}`;
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
      // An HTTP call's server starts with the host's values for its entry's keys, and its auth header carries one.
      const carried = request?.kind === 'api' ? registry.apiSecrets(request.interfaceId) : [];
      const values = [...Object.values(injected), ...Object.values(server), ...carried].filter(
        (value) => value.length >= MIN_SCRUBBED_VALUE_LENGTH,
      );
      const secrets = secretForms(values);
      try {
        return { request: augmented, observation: scrub(await port.probe(augmented, signal), secrets) };
      } catch (error) {
        error.request = augmented;
        // A fault's message and cause can quote what the target sent: a denial names the host a redirect gave, which a
        // URL lowercases, and eval-quality reports a mechanism's own failure (a server that would not start, a refused
        // handshake, a malformed frame, a spawn error) as the cause, which can quote what the target printed,
        // JSON-escaped or cut short. Both are kept scrubbed of every secret, in its own case and lowercased. What a
        // process printed comes whole as the `captured` text, and is quoted from its end only once it is scrubbed, so
        // the cut cannot leave a secret's end the scrub would not recognize.
        const anyCase = secretForms([...values, ...values.map((value) => value.toLowerCase())]);
        if (typeof error?.message === 'string') {
          error.message = `${scrubCutText(error.message, anyCase)}${quotedCapture(error.captured, anyCase)}`;
        }
        if (error?.cause !== undefined) {
          error.scrubbedCause = `${scrubCutText(String(error.cause?.message ?? error.cause), anyCase)}${quotedCapture(error.cause?.captured, anyCase)}`;
        }
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

/** Whether a binding is a `{ captured }` pointer. */
function isCaptured(binding) {
  return binding !== null && typeof binding === 'object' && typeof binding.captured === 'string';
}

/** The step a captured pointer reads (`/interactions/<stepId>/...`), or null when the pointer names none. */
function capturedStepId(pointer) {
  return /^\/interactions\/([^/]+)\//.exec(pointer)?.[1] ?? null;
}

/** The channels whose values are strings on the wire: an HTTP header and a command's environment variable. */
const STRING_CHANNELS = new Set(['header', 'environment']);
/** The channels a command's argument vector and environment carry, where no string can hold a NUL character. */
const PROCESS_CHANNELS = new Set(['argument', 'option', 'environment']);
/** A character no HTTP header value may hold: a control other than tab, DEL, or one past U+00FF, which Node refuses to send. */
const HEADER_UNSENDABLE = /[^\t\u0020-\u007E\u0080-\u00FF]/;
/** How much of an unsendable value a skip's reason quotes. */
const QUOTED_VALUE = 200;

/** Whether a value, or a string in an array of them, holds a NUL character. */
function holdsNul(value) {
  if (Array.isArray(value)) return value.some((item) => holdsNul(item));
  return typeof value === 'string' && value.includes('\u0000');
}

/** A value as a skip's reason quotes it: its JSON, cut to `QUOTED_VALUE` characters. */
function quotedValue(value) {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > QUOTED_VALUE ? `${text.slice(0, QUOTED_VALUE)}...` : text;
}

/**
 * The values one binding channel supplies, or null for an unbound channel: a
 * literal as written, a captured pointer as `resolve` reads it. `absent`
 * lists each captured binding that resolved to nothing, and `unsendable` each
 * captured value the request cannot carry as the target printed it (a value
 * holding a `__proto__` key, which eval-quality's request parser drops, a
 * header or environment value that is no string, a header value holding a
 * control character or one past U+00FF, a path value that is `.` or `..`,
 * which the evaluation's HTTP port refuses, or a command argument, option or
 * environment value holding a NUL character, which no process argument or
 * variable can), each as
 * `{ binding, pointer }` with the reason for an unsendable one. A literal the
 * request cannot carry is the contract's own defect and stops the arm.
 */
function boundValues(channel, stepId, name, resolve) {
  if (channel === null || channel === undefined) return { values: null, absent: [], unsendable: [] };
  const values = {};
  const absent = [];
  const unsendable = [];
  for (const [key, binding] of Object.entries(channel)) {
    // eval-quality's request parser drops an own `__proto__` key, so the target would receive other inputs than the record shows.
    if (key === '__proto__') {
      throw new ArmError(`interaction plan step ${stepId} binds ${name}.${key} with a __proto__ key, which the request cannot send`);
    }
    if (binding !== null && typeof binding === 'object' && Object.hasOwn(binding, 'literal')) {
      if (carriesPrototypeKey(binding.literal)) {
        throw new ArmError(`interaction plan step ${stepId} binds ${name}.${key} with a __proto__ key, which the request cannot send`);
      }
      values[key] = binding.literal;
      continue;
    }
    if (!isCaptured(binding)) {
      throw new ArmError(
        `interaction plan step ${stepId} binds ${name}.${key} with ${JSON.stringify(binding)}; this release sends literal and captured bindings only`,
      );
    }
    const site = { binding: `${name}.${key}`, pointer: binding.captured };
    const resolved = resolve(binding.captured);
    if (!resolved.present) absent.push(site);
    else if (carriesPrototypeKey(resolved.value)) unsendable.push({ ...site, reason: 'the value holds a __proto__ key' });
    else if (STRING_CHANNELS.has(name) && typeof resolved.value !== 'string') {
      unsendable.push({ ...site, reason: `a ${name} value is a string, and the value is ${quotedValue(resolved.value)}` });
    } else if (name === 'header' && HEADER_UNSENDABLE.test(resolved.value)) {
      unsendable.push({
        ...site,
        reason: `a header value cannot hold a control character or one past U+00FF, and the value is ${quotedValue(resolved.value)}`,
      });
    } else if (name === 'path' && (resolved.value === '.' || resolved.value === '..')) {
      unsendable.push({ ...site, reason: `a path segment cannot be . or .., and the value is ${quotedValue(resolved.value)}` });
    } else if (PROCESS_CHANNELS.has(name) && holdsNul(resolved.value)) {
      unsendable.push({
        ...site,
        reason: `a command's ${name} cannot carry a NUL character, and the value is ${quotedValue(resolved.value)}`,
      });
    } else values[key] = resolved.value;
  }
  return { values, absent, unsendable };
}

/** Whether `value` holds an own `__proto__` key at any depth. */
function carriesPrototypeKey(value) {
  if (Array.isArray(value)) return value.some((item) => carriesPrototypeKey(item));
  if (value === null || typeof value !== 'object') return false;
  return Object.hasOwn(value, '__proto__') || Object.values(value).some((item) => carriesPrototypeKey(item));
}

/** An HTTP request's header values, each a string on the wire; a bound value of another type cannot be sent. */
function headerValues(values, stepId) {
  if (values === null) return {};
  for (const [name, value] of Object.entries(values)) {
    if (typeof value !== 'string') {
      throw new ArmError(`interaction plan step ${stepId} binds header.${name} with ${JSON.stringify(value)}; a header value is a string`);
    }
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

/** Every captured pointer one step binds, in its binding's channel order and key order. */
function capturedPointers(step) {
  const pointers = [];
  for (const channel of Object.values(step.inputBinding ?? {})) {
    if (channel === null || typeof channel !== 'object') continue;
    for (const binding of Object.values(channel)) if (isCaptured(binding)) pointers.push(binding.captured);
  }
  return pointers;
}

/**
 * The steps one step waits for: the step its `after` clause names and each
 * step its captured bindings read, among the steps the plan declares. A name
 * the plan does not declare adds no edge: a dangling `after` is permissive and
 * a dangling capture resolves to nothing, as eval-quality reads both.
 */
function dependenciesOf(step, declared) {
  const names = [step.after, ...capturedPointers(step).map(capturedStepId)];
  return [...new Set(names.filter((name) => typeof name === 'string' && declared.has(name)))];
}

/**
 * The plan's steps in the order they run: each after every step it waits for
 * (`dependenciesOf`), otherwise in plan order.
 */
function orderedSteps(plan) {
  const declared = new Set(plan.map((step) => step.stepId));
  const remaining = [...plan];
  const done = new Set();
  const ordered = [];
  while (remaining.length > 0) {
    const index = remaining.findIndex((step) => dependenciesOf(step, declared).every((name) => done.has(name)));
    if (index === -1) {
      const [first] = remaining;
      throw new ArmError(
        `interaction plan step ${first.stepId} waits for ${dependenciesOf(first, declared).join(', ')}, which no runnable step is; the plan has no order to run in`,
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
 *   `steps` holds, in the order the plan ran, each issued step's persistable request and the port's observation, and
 *   each step the arm did not issue as `{ stepId, operationId, skipped }` with the reason; `stepObservations` the record
 *   observations by step
 * @throws {ArmError}
 */
async function runArm({ contract, port, registry, label, provenance = 'baseline', signal }) {
  const operations = operationsById(contract);
  const plan = contract.interactionPlan ?? [];
  const declared = new Set(plan.map((step) => step.stepId));
  const steps = [];
  const stepObservations = {};
  const issued = new Set();
  // A captured pointer is read as eval-quality's `score` reads it, over the observations this arm has recorded so far.
  const engine = plan.some((step) => capturedPointers(step).length > 0) ? await loadEngine() : null;
  const readPointer = engine === null ? null : engine.makeResolveOperand(stepObservations, {});
  const resolve = (pointer) => {
    const value = readPointer({ pointer }, engine.ABSENT, 'captured');
    return value === engine.ABSENT ? { present: false } : { present: true, value };
  };
  let sequence = 0;
  for (const step of orderedSteps(plan)) {
    const found = operations.get(step.operationId);
    if (found === undefined || found.ambiguous) {
      throw new ArmError(
        `interaction plan step ${step.stepId} names operation ${step.operationId}, which ${found === undefined ? 'no interface declares' : 'two interfaces declare'}`,
      );
    }
    const { iface, operation } = found;
    const binding = step.inputBinding ?? {};
    const absent = [];
    const unsendable = [];
    const bound = (channel, name) => {
      const read = boundValues(channel, step.stepId, name, resolve);
      absent.push(...read.absent);
      unsendable.push(...read.unsendable);
      return read.values;
    };
    let request;
    let callInputs;
    if (iface.kind === 'api' && typeof operation.pathTemplate === 'string') {
      const pathValues = bound(binding.path, 'path');
      const query = bound(binding.query, 'query');
      const header = bound(binding.header, 'header');
      const body = bound(binding.body, 'body');
      request = {
        probeId: `${label}-${step.stepId}`,
        interfaceId: iface.logicalId,
        operationId: operation.operationId,
        kind: 'api',
        method: operation.method,
        pathTemplate: operation.pathTemplate,
        channels: {
          path: pathValues ?? {},
          query: query ?? {},
          header: headerValues(header, step.stepId),
          body: body === null ? { kind: 'absent' } : { kind: 'json', value: body },
        },
      };
      callInputs = { path: pathValues, query, header, body };
    } else if (iface.kind === 'mcp' && typeof operation.toolName === 'string') {
      const toolArguments = bound(binding.arguments, 'arguments');
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
      const argument = bound(binding.argument, 'argument');
      const option = bound(binding.option, 'option');
      const environment = bound(binding.environment, 'environment');
      const stdin = bound(binding.stdin, 'stdin');
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
        `interaction plan step ${step.stepId} names a ${iface.kind} operation this release cannot send; it sends command, tool-call and HTTP operations only`,
      );
    }
    // Decided once the request is built, so a binding or an operation the run cannot send stops the arm whatever the
    // target printed: a step cannot run after a step that never ran, a captured value the earlier observation lacks
    // leaves nothing to send, and one the request cannot carry as printed would send the target something else.
    const skip = (skipped) => steps.push({ stepId: step.stepId, operationId: step.operationId, skipped });
    if (typeof step.after === 'string' && declared.has(step.after) && !issued.has(step.after)) {
      skip({ reason: 'after-step-not-issued', after: step.after });
      continue;
    }
    if (absent.length > 0) {
      skip({ reason: 'captured-value-absent', bindings: absent });
      continue;
    }
    if (unsendable.length > 0) {
      skip({ reason: 'captured-value-unsendable', bindings: unsendable });
      continue;
    }
    const answered = await port.probe(request, signal);
    const { observation } = answered;
    sequence += 1;
    issued.add(step.stepId);
    steps.push({ stepId: step.stepId, request: persistableRequest(answered.request), observation });
    if (observation?.kind !== request.kind) {
      const error = new ArmError(
        `the ${label} arm's step ${step.stepId} sent a ${request.kind} request and the port answered a ${JSON.stringify(observation?.kind ?? null)} observation`,
      );
      error.steps = steps;
      throw error;
    }
    if (request.kind === 'api') {
      stepObservations[step.stepId] = recordObservation({
        observationId: request.probeId,
        sequence,
        operationId: operation.operationId,
        callInputs,
        responseBody: bodyValue(observation.body),
        responseHeaders: observation.headers,
        responseStatus: observation.status,
        provenance,
      });
      continue;
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
  quotedCapture,
  reasonNote,
  runArm,
  scrub,
  scrubCutText,
  secretForms,
  stoppedFromOutside,
};
