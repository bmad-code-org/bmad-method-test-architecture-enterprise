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
 * A binding is a `literal`, an `any` or `type-violating` matcher,
 * materialized from the declared JSON type, a `principal` resolved from the
 * registry's host environment, or a `captured`
 * pointer (Story 1.18), sent as the value it resolves to on the named earlier step's
 * observation in this arm, read by eval-quality's own `makeResolveOperand`,
 * the reading its `score` gives the same pointer. A step runs after the step
 * its `after` clause names and after every step its captured bindings read,
 * and otherwise in plan order, so each observation's `sequence` follows the
 * order the steps were issued in. A step whose `after` step was not issued,
 * or one of whose captured bindings resolves to nothing (the earlier step was
 * not issued, or its observation lacks the value), is not issued: it gets no
 * observation, and `steps` records it as skipped with the reason, so
 * eval-quality reads the missing observation as it reads any evidence that
 * does not exist. A command step with a captured argument, option or environment
 * binding that the system refuses to launch for the size of its arguments and
 * environment (eval-quality's `port-failure` fault whose `portFailureReason` is
 * `launch-too-large`) is not issued either, and `steps` records it as
 * `captured-value-unsendable` naming each such binding; only the launch knows the
 * system's limit, so the arm computes none. A captured stdin value is written
 * after the launch and is never named.
 * A binding this release cannot materialize, an operation of another kind and
 * a command step with no captured binding in those channels that the system
 * refuses to launch stop the arm with an `ArmError` (exit 12): the run cannot
 * send the request the contract means.
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
 * server answered with its error flag set, a tool call whose session the
 * server's own process ended before it answered (recorded with `responseStatus`
 * 1, an absent body and the signed `exitCode`, which a signal from outside stops
 * the arm on as it does a command step) and an HTTP answer at any status; a
 * server that could not start, refused its handshake or wrote a line that is no
 * JSON-RPC message throws from the adapter or the port.
 *
 * `hostEnvironmentPort` is the port every leg and arm goes through: it adds the
 * host's values for the keys a command entry permits beneath the request's
 * own, and scrubs every such value, every value a tool server's environment
 * carries, and every value an HTTP call's server and auth header carry, from
 * what comes back, in whatever letter case it comes back (Story 1.66): the
 * observation and a fault's message and cause scrub with one set of forms, and
 * the matching is compiled once per set.
 */

'use strict';

const crypto = require('node:crypto');

const { loadEngine } = require('./engine');
const { recordObservation } = require('./records');
const { ZERO, addUsage, parseUsageReport } = require('./usage-report');

/** An injected environment value shorter than this is not scrubbed from output: it would match ordinary text. */
const MIN_SCRUBBED_VALUE_LENGTH = 8;
/** The shortest leading part of a secret redacted where a cut text ends in it; a shorter one would match ordinary text. */
const MIN_CUT_PREFIX_LENGTH = 4;
const SCRUBBED = '[redacted]';
/** The `portFailureReason` eval-quality's command-line adapter gives a launch the system refused for the size of its arguments and environment. */
const LAUNCH_TOO_LARGE = 'launch-too-large';
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
 * A text in each letter case a normalizer can give it: as it is, lower-cased,
 * upper-cased, and both again under Turkish rules (a Turkish-locale server maps
 * `I` to `ı` and `i` to `İ`). Matching compares letters by case folding
 * (`foldedText`), so these add what folding does not equate: the Turkish
 * mappings, and the escape digits of a letter, which differ with its case (a
 * serializer writes `ü` with the escape of U+00FC and `Ü` with that of U+00DC).
 */
function caseVariants(text) {
  return [text, text.toLowerCase(), text.toUpperCase(), text.toLocaleLowerCase('tr'), text.toLocaleUpperCase('tr')];
}

/**
 * Each secret in every form text can carry it in, longest first and each once:
 * its own body, each way one level of JSON escaping writes it
 * (`escapingsOf`), and each way a second level writes one of those, which is
 * how a message quoting a JSON frame, a `JSON.stringify` of the server's
 * answer, or a JSON string holding JSON holds it. Each of those is held for
 * every letter case `caseVariants` names, taken of the secret before it is
 * escaped: a server that upper-cases `ü` and then writes it as an escape sends
 * the digits of `Ü`, which differ from those of the escaping of `ü`. The array is frozen: the matching
 * compiled from it (`matcherFor`) is kept with it. The cause is never decoded:
 * decoding would alter what a legitimate record says.
 */
function secretForms(secrets) {
  const forms = new Set();
  for (const secret of secrets) {
    for (const variant of caseVariants(secret)) {
      forms.add(variant);
      for (const once of escapingsOf(variant)) {
        forms.add(once);
        for (const twice of escapingsOf(once)) forms.add(twice);
      }
    }
  }
  return Object.freeze([...forms].sort((a, b) => b.length - a.length));
}

/**
 * `text` case-folded, each character on its own so the result does not depend
 * on its neighbors (`toLowerCase` reads a capital sigma by its position): lower-cased,
 * upper-cased and lower-cased again, which equates `K` and the Kelvin sign, `ς` and `σ`, `ſ` and `s`,
 * `ı` and `I`, `ẞ`, `ß` and `SS`. A text of ASCII characters folds to its lower case, character for
 * character. Otherwise a fold that changes the text's length comes with `starts` and `ends`, the original
 * span each folded unit came from, so a match found in the folded text is replaced in the original (the
 * map costs memory, so a caller that only asks whether a form occurs leaves it out).
 *
 * @returns {{ folded: string, starts: number[] | null, ends: number[] | null }}
 */
function foldedText(text, withMap = true) {
  if (/^\p{ASCII}*$/u.test(text)) return { folded: text.toLowerCase(), starts: null, ends: null };
  let folded = '';
  const starts = [];
  const ends = [];
  for (let at = 0; at < text.length; ) {
    let character = String.fromCodePoint(text.codePointAt(at));
    const unit = character === '\u0130' ? 'i' : character.toLowerCase().toUpperCase().toLowerCase();
    // `İ` lower-cases to `i` and a combining dot above, so the pair folds as the capital does: one `i`, each mark after it covered by it.
    while (unit === 'i' && text[at + character.length] === '\u0307') character += '\u0307';
    folded += unit;
    if (withMap) {
      for (let index = 0; index < unit.length; index += 1) {
        starts.push(at);
        ends.push(at + character.length);
      }
    }
    at += character.length;
  }
  return withMap ? { folded, starts, ends } : { folded, starts: null, ends: null };
}

/** What `matcherFor` gives an array that holds no form. */
const NO_MATCHER = Object.freeze({ forms: [], heads: new Set(), longest: 0 });

/** The compiled matching of each `secrets` array `scrub` has been given, so a walk over an observation folds the forms once. */
const matchers = new WeakMap();

/**
 * The matching for `secrets` (the array `secretForms` returned), built once per
 * array: its forms case-folded (`foldedText`) and each once, with the first
 * unit each starts with and the length of the longest. A form that is empty
 * matches everywhere and is left out. No regular expression is built over the
 * forms: a pattern holding every form of a large secret (a credential file,
 * a certificate chain) exceeds what the engine compiles.
 */
function matcherFor(secrets) {
  let matcher = matchers.get(secrets);
  if (matcher === undefined) {
    const forms = [
      ...new Set(secrets.filter((form) => typeof form === 'string' && form !== '').map((form) => foldedText(form, false).folded)),
    ];
    matcher =
      forms.length === 0
        ? NO_MATCHER
        : { forms, heads: new Set(forms.map((form) => form[0])), longest: Math.max(...forms.map((form) => form.length)) };
    matchers.set(secrets, matcher);
  }
  return matcher;
}

/** The spans of `folded` that hold a form, overlapping ones merged and adjacent ones kept apart, in order. */
function secretSpans(folded, forms) {
  const found = [];
  for (const form of forms) {
    for (let at = folded.indexOf(form); at !== -1; at = folded.indexOf(form, at + 1)) found.push([at, at + form.length]);
  }
  found.sort((x, y) => x[0] - y[0] || y[1] - x[1]);
  const spans = [];
  for (const [start, end] of found) {
    const last = spans.at(-1);
    if (last !== undefined && start < last[1]) last[1] = Math.max(last[1], end);
    else spans.push([start, end]);
  }
  return spans;
}

/**
 * Whether a finite number is a secret: its text holds one in some letter case, or, when its text is as long as a scrubbed value must be,
 * a secret read as a number equals it. The length floor keeps a secret such as `00000000` from redacting every 0.
 */
function numberHoldsSecret(value, secrets) {
  const text = String(value);
  const { forms } = matcherFor(secrets);
  const { folded } = foldedText(text, false);
  if (forms.some((form) => folded.includes(form))) return true;
  return text.length >= MIN_SCRUBBED_VALUE_LENGTH && secrets.some((secret) => secret.trim() !== '' && Number(secret) === value);
}

/** `text` with each secret it holds, in whatever letter case, replaced; the text itself when it holds none. */
function scrubText(text, secrets) {
  const { forms } = matcherFor(secrets);
  if (forms.length === 0) return text;
  const { folded } = foldedText(text, false);
  if (!forms.some((form) => folded.includes(form))) return text;
  const { folded: mapped, starts, ends } = foldedText(text);
  let scrubbed = '';
  let kept = 0;
  for (const [start, end] of secretSpans(mapped, forms)) {
    const from = starts === null ? start : starts[start];
    const to = ends === null ? end : ends[end - 1];
    if (from < kept) {
      // The span starts inside the character the one before it ended on (`ß` folds to `ss`): the run is one replacement.
      kept = to;
      continue;
    }
    scrubbed += text.slice(kept, from) + SCRUBBED;
    kept = to;
  }
  return scrubbed + text.slice(kept);
}

/**
 * `value` with every string in `secrets` replaced in whatever letter case it
 * comes back, in strings and object keys alike, walking arrays and objects; a
 * finite number whose text holds a secret, or that a secret read as a number
 * equals, is replaced as a whole.
 */
function scrub(value, secrets) {
  if (typeof value === 'string') return scrubText(value, secrets);
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
 * that the cut left at its end, in whatever letter case either comes back. Only
 * the last stretch of the text that a form could fill is read, so a long text
 * costs no more than a short one.
 */
function scrubCutText(text, secrets) {
  const scrubbed = scrubText(text, secrets);
  const { forms, heads, longest } = matcherFor(secrets);
  if (forms.length === 0) return scrubbed;
  // A fold can drop units (an `i` with its combining dot is one), which a text reaches only through an `i`; the forms of a
  // secret with an `i` hold its `İ` variants, each `İ` written as an escape (six units or more) for the one unit it adds to the
  // text, so the longest form always exceeds what the stretch read can lose.
  const window = scrubbed.length - Math.min(scrubbed.length, longest);
  const { folded, starts } = foldedText(scrubbed.slice(window));
  for (let at = 0; at < folded.length; at += 1) {
    const from = starts === null ? at : starts[at];
    if (scrubbed.length - window - from < MIN_CUT_PREFIX_LENGTH) break;
    if (!heads.has(folded[at])) continue;
    const tail = folded.slice(at);
    if (forms.some((form) => form.length > tail.length && form.startsWith(tail))) return `${scrubbed.slice(0, window + from)}${SCRUBBED}`;
  }
  return scrubbed;
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

/** A marker persisted where a principal credential was used on the wire. */
function principalMarker(principal) {
  return { principal };
}

/** Replace one bound principal value in a structured call-input record. */
function redactPrincipalCallInputs(callInputs, bindings) {
  const redacted = structuredClone(callInputs);
  for (const { channel, key, principal } of bindings) {
    switch (channel) {
      case 'stdin': {
        if (redacted.stdin !== null && redacted.stdin !== undefined) redacted.stdin[key] = principalMarker(principal);
        break;
      }
      case 'body': {
        if (redacted.body !== null && redacted.body !== undefined) redacted.body[key] = principalMarker(principal);
        break;
      }
      case 'arguments': {
        redacted.arguments[key] = principalMarker(principal);
        break;
      }
      default: {
        if (redacted[channel] !== null && redacted[channel] !== undefined) redacted[channel][key] = principalMarker(principal);
      }
    }
  }
  return redacted;
}

/** Replace principal values in the request copy persisted under a step. */
function redactPrincipalRequest(request, bindings) {
  const redacted = structuredClone(persistableRequest(request));
  for (const { channel, key, principal } of bindings) {
    switch (channel) {
      case 'stdin': {
        const input = redacted.channels.stdin;
        switch (input?.kind) {
          case 'text': {
            redacted.channels.stdin = { kind: 'json', value: { [key]: principalMarker(principal) } };
            break;
          }
          case 'json': {
            input.value[key] = principalMarker(principal);
            break;
          }
        }
        break;
      }
      case 'body': {
        if (redacted.channels.body?.kind === 'json') redacted.channels.body.value[key] = principalMarker(principal);
        break;
      }
      case 'arguments': {
        redacted.channels.arguments[key] = principalMarker(principal);
        break;
      }
      default: {
        if (redacted.channels[channel] !== undefined) redacted.channels[channel][key] = principalMarker(principal);
      }
    }
  }
  return redacted;
}

/**
 * What a run records of an adapter fault: its code, the `reason` eval-quality
 * gives a policy denial (`tool-not-authorized`, `executable-not-authorized`,
 * `interface-not-authorized`, ...), for every kind, the `portFailureReason` it
 * gives a `port-failure` it can name (`launch-too-large`), its message, and the
 * scrubbed `cause` of a fault the target could not run under. Nothing is read
 * from the message: a fault that carries no reason is recorded with none.
 *
 * @param {unknown} error
 * @returns {{ code: string|null, reason?: string, portFailureReason?: string, message: string }}
 */
function faultRecord(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : null,
    ...(typeof error?.reason === 'string' ? { reason: error.reason } : {}),
    ...(typeof error?.portFailureReason === 'string' ? { portFailureReason: error.portFailureReason } : {}),
    message: String(error?.message ?? error),
    ...(typeof error?.scrubbedCause === 'string' ? { cause: error.scrubbedCause } : {}),
  };
}

/** Whether a fault is eval-quality's refusal of a launch for the size of its arguments and environment, by the `portFailureReason` it carries. */
function isLaunchTooLarge(error) {
  return error?.code === 'port-failure' && error.portFailureReason === LAUNCH_TOO_LARGE;
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
  // The forms of a set of values, and the matching compiled over them (`matcherFor`), are built once per distinct set:
  // a run makes thousands of calls over a few sets.
  const formsOfValues = new Map();
  const formsFor = (values) => {
    const key = JSON.stringify(values);
    if (!formsOfValues.has(key)) formsOfValues.set(key, secretForms(values));
    return formsOfValues.get(key);
  };
  return {
    /** Empties the private home the port's sandbox keeps, where it has one (`registry.js` `createProbePort`). */
    resetHome: () => port.resetHome?.(),
    async probe(request, signal) {
      const registered = request?.kind === 'cli' && registry.targetFor(request.interfaceId, request.executable) !== undefined;
      const injected = registered ? registry.hostEnvironment(request.interfaceId, [], request.executable) : {};
      const channels = request?.channels ?? {};
      const augmented = registered
        ? { ...request, channels: { ...channels, environment: { ...injected, ...channels.environment } } }
        : request;
      // A tool server starts with the host's values for its entry's keys, which its authorization carries.
      const server =
        request?.kind === 'mcp' && registry.serverFor(request.interfaceId) !== undefined
          ? registry.serverEnvironment(request.interfaceId)
          : {};
      // An HTTP call's server starts with the host's values for its entry's keys, and its auth header carries one.
      const carried = request?.kind === 'api' ? registry.apiSecrets(request.interfaceId) : [];
      const principalValues = typeof registry.principalSecrets === 'function' ? registry.principalSecrets() : [];
      const values = [...Object.values(injected), ...Object.values(server), ...carried, ...principalValues].filter(
        (value) => value.length >= MIN_SCRUBBED_VALUE_LENGTH,
      );
      const secrets = formsFor(values);
      try {
        const observation = await port.probe(augmented, signal);
        return {
          request: augmented,
          observation: scrub(observation, secrets),
          ...(request?.kind === 'cli' ? { usageReportStderr: observation.stderr } : {}),
        };
      } catch (error) {
        error.request = augmented;
        // A fault's message and cause can quote what the target sent: a denial names the host a redirect gave, which a
        // URL lowercases, and eval-quality reports a mechanism's own failure (a server that would not start, a refused
        // handshake, a malformed frame, a spawn error) as the cause, which can quote what the target printed,
        // JSON-escaped or cut short. Both are kept scrubbed of every secret with the set the observation is scrubbed
        // with, in whatever letter case it comes back. What a process printed comes whole as the `captured` text, and is
        // quoted from its end only once it is scrubbed, so the cut cannot leave a secret's end the scrub would not
        // recognize.
        if (typeof error?.message === 'string') {
          error.message = `${scrubCutText(error.message, secrets)}${quotedCapture(error.captured, secrets)}`;
        }
        if (error?.cause !== undefined) {
          error.scrubbedCause = `${scrubCutText(String(error.cause?.message ?? error.cause), secrets)}${quotedCapture(error.cause?.captured, secrets)}`;
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
/** A transport turns these inputs into strings before the target sees them. */
const STRINGIFIED_CHANNELS = new Set(['path', 'query', 'header', 'argument', 'option', 'environment']);
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

/** A deterministic value for a matcher, derived from the run seed and binding location. */
function matcherValue(type, seed, stepId, channel, key) {
  const digest = crypto
    .createHash('sha256')
    .update(`${String(seed)}\u0000${stepId}\u0000${channel}\u0000${key}`)
    .digest();
  switch (type) {
    case 'string': {
      return `tea-any-${digest.toString('hex', 0, 12)}`;
    }
    case 'number': {
      return digest.readUInt32BE(0) / 4_294_967_296;
    }
    case 'boolean': {
      return (digest[0] & 1) === 1;
    }
    case 'object': {
      return { value: digest.toString('hex', 0, 8) };
    }
    case 'array': {
      return [digest.toString('hex', 0, 8)];
    }
    case 'null': {
      return null;
    }
    case 'integer': {
      return digest.readUInt32BE(0);
    }
    default: {
      return;
    }
  }
}

/** A JSON value whose type differs from the declared type. */
function typeViolatingValue(type) {
  if (type === 'string' || type === 'number' || type === 'integer' || type === 'boolean') return type === 'string' ? 42 : 'malformed';
  if (type === 'object' || type === 'array' || type === 'null') return 42;
}

/**
 * The values one binding channel supplies, or null for an unbound channel: a
 * literal as written, a type-violating matcher from the declared key type,
 * or a captured pointer as `resolve` reads it. `absent`
 * lists each captured binding that resolved to nothing, and `unsendable` each
 * captured value the request cannot carry as the target printed it (a value
 * holding a `__proto__` key, which eval-quality's request parser drops, a
 * header or environment value that is no string, a header value holding a
 * control character or one past U+00FF, a path value that is `.` or `..`,
 * which the evaluation's HTTP port refuses, or a command argument, option or
 * environment value holding a NUL character, which no process argument or
 * variable can), each as
 * `{ binding, pointer }` with the reason for an unsendable one. `captured`
 * lists every captured binding of the channel in that shape, whatever it
 * resolved to, for a step whose launch the system refuses for size. A literal
 * the request cannot carry is the contract's own defect and stops the arm.
 */
function boundValues(channel, stepId, name, resolve, shape, { seed, interfaceId, principalValue, principalBindings }) {
  if (channel === null || channel === undefined) return { values: null, absent: [], unsendable: [], captured: [] };
  const values = {};
  const absent = [];
  const unsendable = [];
  const captured = [];
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
    if (binding?.matcher === 'type-violating') {
      const declared = shape?.types?.[key];
      if (declared === undefined || declared === null) {
        throw new ArmError(`interaction plan step ${stepId} binds ${name}.${key} as type-violating without a declared type`);
      }
      if (STRINGIFIED_CHANNELS.has(name)) {
        throw new ArmError(`interaction plan step ${stepId} cannot send a type-violating ${name}.${key}; the transport requires a string`);
      }
      const violating = typeViolatingValue(declared);
      if (violating === undefined) {
        throw new ArmError(
          `interaction plan step ${stepId} binds ${name}.${key} as type-violating with an unsupported declared type ${declared}`,
        );
      }
      values[key] = violating;
      continue;
    }
    if (binding?.matcher === 'any') {
      const declared = shape?.types?.[key];
      if (declared === undefined || declared === null) {
        throw new ArmError(`interaction plan step ${stepId} binds ${name}.${key} as any without a declared type`);
      }
      const value = matcherValue(declared, seed, stepId, name, key);
      if (value === undefined) {
        throw new ArmError(`interaction plan step ${stepId} binds ${name}.${key} as any with an unsupported declared type ${declared}`);
      }
      if (STRINGIFIED_CHANNELS.has(name) && declared !== 'string') {
        throw new ArmError(`interaction plan step ${stepId} cannot send an any ${name}.${key}; the transport requires a string`);
      }
      values[key] = value;
      continue;
    }
    if (binding?.principal !== undefined) {
      if (typeof binding.principal !== 'string' || typeof principalValue !== 'function') {
        throw new ArmError(`interaction plan step ${stepId} binds ${name}.${key} with an unusable principal`);
      }
      let value;
      try {
        value = principalValue(binding.principal, interfaceId);
      } catch (error) {
        throw new ArmError(
          `interaction plan step ${stepId} cannot materialize ${name}.${key} principal ${JSON.stringify(binding.principal)}: ${error.message}`,
        );
      }
      values[key] = value;
      principalBindings.push({ channel: name, key, principal: binding.principal });
      continue;
    }
    if (!isCaptured(binding)) {
      throw new ArmError(
        `interaction plan step ${stepId} binds ${name}.${key} with ${JSON.stringify(binding)}; this release sends literal, matcher, principal and captured bindings only`,
      );
    }
    const site = { binding: `${name}.${key}`, pointer: binding.captured };
    captured.push(site);
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
  return { values, absent, unsendable, captured };
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
async function runArm({
  contract,
  port,
  registry,
  label,
  provenance = 'baseline',
  countUsage = true,
  signal,
  seed = 'tea-evaluate-default-seed',
}) {
  // An arm is independent of the arms before it on a shared port, so its target starts with an empty private home; the
  // steps of this arm share it.
  port.resetHome?.();
  const operations = operationsById(contract);
  const plan = contract.interactionPlan ?? [];
  const declared = new Set(plan.map((step) => step.stepId));
  const steps = [];
  const stepObservations = {};
  let resourceUse = ZERO;
  const unreportedSteps = [];
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
    const capturedSites = [];
    const principalBindings = [];
    const bound = (channel, name) => {
      const read = boundValues(channel, step.stepId, name, resolve, operation.requestShape?.[name], {
        seed,
        interfaceId: iface.logicalId,
        principalValue: registry?.principalValue,
        principalBindings,
      });
      absent.push(...read.absent);
      unsendable.push(...read.unsendable);
      // Only what a spawn carries can make a launch too large: a stdin value is written to a pipe after the process starts.
      if (PROCESS_CHANNELS.has(name)) capturedSites.push(...read.captured);
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
    let answered;
    try {
      answered = await port.probe(request, signal);
    } catch (error) {
      // A launch the system refused for the size of its arguments and environment is eval-quality's own reason on the
      // fault. With a captured value among the step's bindings the target's output is what made it too large, so the
      // step is not issued; a step of literals alone is a contract the run cannot send, and the fault stops the arm.
      if (isLaunchTooLarge(error) && request.kind === 'cli' && capturedSites.length > 0) {
        skip({
          reason: 'captured-value-unsendable',
          bindings: capturedSites.map((site) => ({
            ...site,
            reason: `the system refused to launch the command for the size of its arguments and environment (${error.portFailureReason}), and the refusal does not say which captured value made it too large`,
          })),
        });
        continue;
      }
      throw error;
    }
    const { observation } = answered;
    sequence += 1;
    issued.add(step.stepId);
    const principalLabels = [...new Set(principalBindings.map((entry) => entry.principal))];
    if (principalLabels.length > 1) {
      const error = new ArmError(
        `interaction plan step ${step.stepId} binds multiple principals, so one observation cannot record a single principal label`,
      );
      error.steps = steps;
      throw error;
    }
    const recordedCallInputs = redactPrincipalCallInputs(callInputs, principalBindings);
    steps.push({ stepId: step.stepId, request: redactPrincipalRequest(answered.request, principalBindings), observation });
    if (observation?.kind !== request.kind) {
      const error = new ArmError(
        `the ${label} arm's step ${step.stepId} sent a ${request.kind} request and the port answered a ${JSON.stringify(observation?.kind ?? null)} observation`,
      );
      error.steps = steps;
      throw error;
    }
    if (countUsage && request.kind !== 'cli') unreportedSteps.push(step.stepId);
    if (request.kind === 'api') {
      stepObservations[step.stepId] = recordObservation({
        observationId: request.probeId,
        sequence,
        operationId: operation.operationId,
        callInputs: recordedCallInputs,
        principal: principalLabels[0] ?? null,
        responseBody: bodyValue(observation.body),
        responseHeaders: observation.headers,
        responseStatus: observation.status,
        provenance,
      });
      continue;
    }
    if (request.kind === 'mcp') {
      // The observation carries an exit code only when the server's process ended the session after the handshake and
      // before it answered (McpProbeObservation.exitCode). A signal from outside stops the arm as it does a command
      // step; any other code, a plain exit or a signal of the server's own, is the target's behavior and is recorded.
      const endedSession = typeof observation.exitCode === 'number';
      if (endedSession && stoppedFromOutside(observation.exitCode)) {
        const error = new ArmError(
          `the ${label} arm's step ${step.stepId} ended the tool server's session with a signal from outside it (exit code ${JSON.stringify(observation.exitCode)}): the target could not run`,
        );
        error.steps = steps;
        throw error;
      }
      stepObservations[step.stepId] = recordObservation({
        observationId: request.probeId,
        sequence,
        operationId: operation.operationId,
        callInputs: recordedCallInputs,
        principal: principalLabels[0] ?? null,
        responseBody: bodyValue(observation.result),
        // A tool call has no transport status, so the envelope's error flag is recorded here as 1 or 0 (McpProbeObservation).
        responseStatus: observation.isError ? 1 : 0,
        exitCode: observation.exitCode ?? null,
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
    if (countUsage) {
      try {
        const reported = parseUsageReport(answered.usageReportStderr ?? observation.stderr, `step ${step.stepId}`);
        if (reported === null) unreportedSteps.push(step.stepId);
        else resourceUse = addUsage(resourceUse, reported);
      } catch (error_) {
        const error = new ArmError(`the ${label} arm's ${error_.message}`);
        error.steps = steps;
        throw error;
      }
    }
    stepObservations[step.stepId] = recordObservation({
      observationId: request.probeId,
      sequence,
      operationId: operation.operationId,
      callInputs: recordedCallInputs,
      principal: principalLabels[0] ?? null,
      stdout: observation.stdout,
      stderr: observation.stderr,
      exitCode: observation.exitCode,
      artifacts: observation.artifacts ?? {},
      provenance,
    });
  }
  return { steps, stepObservations, resourceUse, unreportedSteps };
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
