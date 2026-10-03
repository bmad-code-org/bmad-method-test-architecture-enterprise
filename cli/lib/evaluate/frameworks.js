/**
 * The installed frameworks a `command` evaluator depends on (AD-21, Story
 * 1.44). A package outside the tracked `evaluator/` tree can change while
 * every byte of the tree stays fixed, and its new behavior would then judge
 * trials under the old configuration digest. The evaluation therefore
 * declares each dependency in `evaluator/frameworks.json`, a tracked file the
 * tree digest covers, and `run` observes what is installed.
 *
 * ```json
 * { "schemaVersion": 1, "frameworks": [
 *   { "package": "acme-evals", "version": "1.2.3",
 *     "probe": { "command": "evaluator/installed-version.mjs", "args": ["acme-evals"] } } ] }
 * ```
 *
 * `probe` is an executable under `evaluator/` that the run launches as it
 * launches the evaluator (same environment, working directory and
 * confinement). It prints one JSON object, `{ "package": "<identity>",
 * "version": "<installed version>" }`, with `installSource` and `installDigest` when install
 * state is declared, and exits 0; any other exit, or an
 * answer off that shape or naming another package, is a dependency that is
 * not installed as declared (the run reports it as a version that could not be read). A dependency-free evaluator declares an empty
 * list. This module holds the pure rules (the declaration's shape, how
 * `evaluator/LEARNED.md` must agree with it, how an observation is read and
 * compared); the launch lives in `command-evaluator.js`, and `cli/` imports no
 * framework.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** The runtime-owned schemas of the declaration and the run artifact; their versions are read from them so the code and the schemas cannot disagree. */
const FRAMEWORKS_SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas', 'evaluator-frameworks.schema.json'), 'utf8'));
const VERSIONS_SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas', 'framework-versions.schema.json'), 'utf8'));
const FRAMEWORKS_SCHEMA_VERSION = FRAMEWORKS_SCHEMA.properties.schemaVersion.const;
const VERSIONS_SCHEMA_VERSION = VERSIONS_SCHEMA.properties.schemaVersion.const;

const FRAMEWORKS_PATH = 'evaluator/frameworks.json';
const LEARNED_PATH = 'evaluator/LEARNED.md';
const DEFAULT_PROBE_TIMEOUT_MS = 10_000;
const MAX_PROBE_TIMEOUT_MS = 60_000;
/** The `LEARNED.md` section whose `` `package@version` `` tokens record the installed versions. */
const LEARNED_SECTION = '## Framework and installed version';
/** The heading as a whole line: a longer heading (`### ...`) or the words inside a sentence are no section. */
const SECTION_HEADING = /^## Framework and installed version[ \t]*$/;

const PACKAGE_PATTERN = /^(?:@[A-Za-z0-9][\w.~-]*\/)?[A-Za-z0-9][\w.~-]*$/;
/** A version is one digit-led token: a tag (`latest`), a range, a wildcard, a space or a backtick would stop it naming one installed version. */
const VERSION_PATTERN = /^[0-9][\w.+!~-]*$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
/** A wildcard segment (`1.x`, `1.*`) names a family of versions. */
const WILDCARD_PATTERN = /(?:^|\.)[xX*](?:\.|$)/;
/** The longest first line of a probe's stderr a diagnostic carries. */
const STDERR_NOTE_LENGTH = 200;
/** The most of a failed probe's stdout or stderr the run artifact keeps. */
const PRINTED_LENGTH = 2000;

/** Whether `value` is a plain object. */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Whether `command` is a path under `evaluator/` with no empty, `.` or `..` segment and no backslash. */
function isEvaluatorPath(command) {
  if (typeof command !== 'string' || !command.startsWith('evaluator/') || command.includes('\\')) return false;
  return command.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/**
 * The ways `declaration` departs from the declaration's shape, empty when it
 * meets it.
 *
 * @param {unknown} declaration the parsed `evaluator/frameworks.json`
 * @returns {string[]}
 */
function declarationProblems(declaration) {
  if (!isObject(declaration))
    return [`the declaration must be a JSON object { "schemaVersion": ${FRAMEWORKS_SCHEMA_VERSION}, "frameworks": [...] }`];
  const problems = [];
  for (const key of Object.keys(declaration)) {
    if (key !== 'schemaVersion' && key !== 'frameworks') problems.push(`unknown property ${JSON.stringify(key)}`);
  }
  if (declaration.schemaVersion !== FRAMEWORKS_SCHEMA_VERSION) problems.push(`schemaVersion must be ${FRAMEWORKS_SCHEMA_VERSION}`);
  if (!Array.isArray(declaration.frameworks)) {
    problems.push('frameworks must be a list, empty for an evaluator with no installed framework dependency');
    return problems;
  }
  const seen = new Set();
  for (const [index, entry] of declaration.frameworks.entries()) {
    const at = `frameworks[${index}]`;
    if (!isObject(entry)) {
      problems.push(`${at} must be an object with package, version and probe`);
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (!['package', 'version', 'probe', 'installState'].includes(key))
        problems.push(`${at} has the unknown property ${JSON.stringify(key)}`);
    }
    if (typeof entry.package !== 'string' || !PACKAGE_PATTERN.test(entry.package)) {
      problems.push(`${at}.package must name a package (letters, digits, dots, underscores, hyphens, an optional @scope/)`);
    } else if (seen.has(entry.package)) {
      problems.push(`${at}.package repeats ${entry.package}; declare each package once`);
    } else seen.add(entry.package);
    if (typeof entry.version !== 'string' || !VERSION_PATTERN.test(entry.version) || WILDCARD_PATTERN.test(entry.version)) {
      problems.push(
        `${at}.version must be the one exact version expected, starting with a digit, with no tag, range, wildcard, space or backtick`,
      );
    }
    if (
      entry.installState !== undefined &&
      (!isObject(entry.installState) ||
        Object.keys(entry.installState).length !== 1 ||
        !['tree', 'lockfile'].includes(entry.installState.source))
    ) {
      problems.push(`${at}.installState must be { "source": "tree" } or { "source": "lockfile" }`);
    }
    const { probe } = entry;
    if (!isObject(probe)) {
      problems.push(`${at}.probe must be { "command": "evaluator/<executable>", "args": [...] }`);
      continue;
    }
    for (const key of Object.keys(probe)) {
      if (key !== 'command' && key !== 'args' && key !== 'probeTimeoutMs')
        problems.push(`${at}.probe has the unknown property ${JSON.stringify(key)}`);
    }
    if (!isEvaluatorPath(probe.command)) problems.push(`${at}.probe.command must be a path of an executable under evaluator/`);
    if (probe.args !== undefined && (!Array.isArray(probe.args) || probe.args.some((argument) => typeof argument !== 'string'))) {
      problems.push(`${at}.probe.args must be a list of strings`);
    }
    if (
      probe.probeTimeoutMs !== undefined &&
      (!Number.isInteger(probe.probeTimeoutMs) || probe.probeTimeoutMs < 1 || probe.probeTimeoutMs > MAX_PROBE_TIMEOUT_MS)
    ) {
      problems.push(`${at}.probe.probeTimeoutMs must be an integer from 1 to ${MAX_PROBE_TIMEOUT_MS}`);
    }
  }
  return problems;
}

/** The declared dependencies, each with package, version and probe settings, sorted by package. */
function declaredFrameworks(declaration) {
  return declaration.frameworks
    .map((entry) => ({
      package: entry.package,
      version: entry.version,
      ...(entry.installState === undefined ? {} : { installState: { source: entry.installState.source } }),
      probe: {
        command: entry.probe.command,
        args: [...(entry.probe.args ?? [])],
        ...(entry.probe.probeTimeoutMs === undefined ? {} : { probeTimeoutMs: entry.probe.probeTimeoutMs }),
      },
    }))
    .sort((left, right) => (left.package < right.package ? -1 : left.package > right.package ? 1 : 0));
}

/** The wall clock applied to a framework's version probe. */
function effectiveProbeTimeoutMs(framework, evaluator) {
  return Math.min(framework.probe.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS, evaluator.timeoutMs);
}

/**
 * The ways `evaluator/LEARNED.md` disagrees with the declaration, empty when
 * every declared package has its `` `package@version` `` token (the version starting with a digit, so prose such as
 * `` `npm@latest` `` is no record) in the
 * `## Framework and installed version` section at the declared version, no
 * other version of it and no package the declaration lacks. A declaration
 * with no dependency has nothing to record, and a `LEARNED.md` that records a
 * package under it disagrees as well. `learned` is the file's text, or null
 * when the layer holds no such file.
 *
 * @param {Array<{ package: string, version: string }>} frameworks `declaredFrameworks(...)`
 * @param {string|null} learned
 * @returns {string[]}
 */
function learnedProblems(frameworks, learned) {
  if (learned === null) {
    return frameworks.length === 0
      ? []
      : [
          `${LEARNED_PATH} is not a file the layer holds; it records the installed version of ${frameworks.map((entry) => entry.package).join(', ')} the declaration names (the vendor rule)`,
        ];
  }
  // A file edited on Windows ends its lines with CRLF; text inside a fenced code block is no heading and no record.
  const lines = [];
  // CommonMark's fences: an opener of three or more backticks or tildes (up to three spaces of indent; a backtick
  // opener's info string holds no backtick), closed only by the same character, at least as long, and nothing after it.
  let fence = null;
  for (const line of learned.replaceAll('\r\n', '\n').split('\n')) {
    if (fence === null) {
      const opener = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (opener !== null && !(opener[1][0] === '`' && opener[2].includes('`')))
        fence = { character: opener[1][0], length: opener[1].length };
      else lines.push(line);
    } else if (new RegExp(`^ {0,3}\\${fence.character}{${fence.length},}[ \\t]*$`).test(line)) fence = null;
  }
  const headings = lines.flatMap((line, index) => (SECTION_HEADING.test(line) ? [index] : []));
  if (headings.length > 1) return [`${LEARNED_PATH} has more than one "${LEARNED_SECTION}" section; keep one`];
  let section = null;
  if (headings.length === 1) {
    const rest = lines.slice(headings[0] + 1);
    const end = rest.findIndex((line) => line.startsWith('## '));
    section = (end === -1 ? rest : rest.slice(0, end)).join('\n');
  }
  if (section === null) {
    return frameworks.length === 0 ? [] : [`${LEARNED_PATH} has no "${LEARNED_SECTION}" section recording the installed versions`];
  }
  const recorded = new Map();
  for (const match of section.matchAll(/`((?:@[A-Za-z0-9][\w.~-]*\/)?[A-Za-z0-9][\w.~-]*)@([0-9][^`\s]*)`/g)) {
    recorded.set(match[1], [...(recorded.get(match[1]) ?? []), match[2]]);
  }
  const problems = [];
  const declared = new Set(frameworks.map((entry) => entry.package));
  for (const entry of frameworks) {
    const versions = recorded.get(entry.package) ?? [];
    if (versions.length === 0) {
      problems.push(`${LEARNED_PATH} records no \`${entry.package}@${entry.version}\` in its "${LEARNED_SECTION}" section`);
    } else if (versions.some((version) => version !== entry.version)) {
      problems.push(
        `${LEARNED_PATH} records ${versions.map((version) => `${entry.package}@${version}`).join(', ')}, and ${FRAMEWORKS_PATH} declares ${entry.package}@${entry.version}; update both together when the dependency is upgraded`,
      );
    }
  }
  for (const name of recorded.keys()) {
    if (!declared.has(name)) problems.push(`${LEARNED_PATH} records ${name}, which ${FRAMEWORKS_PATH} does not declare`);
  }
  return problems;
}

/**
 * One dependency's probe output read as an observation.
 *
 * @param {{ package: string, installState?: { source: string } }|string} framework
 * @param {string} stdout
 * @returns {{ package: string, version: string, installSource?: string, installDigest?: string }|{ fault: string }}
 */
function readProbeAnswer(framework, stdout) {
  const expectedPackage = typeof framework === 'string' ? framework : framework.package;
  const requiresDigest = typeof framework !== 'string' && framework.installState !== undefined;
  let answer;
  try {
    answer = JSON.parse(stdout);
  } catch {
    return { fault: `its output is not one JSON object { "package", "version" }` };
  }
  const keys = isObject(answer) ? Object.keys(answer).sort() : [];
  if (
    keys.length !== (requiresDigest ? 4 : 2) ||
    !keys.includes('package') ||
    !keys.includes('version') ||
    (requiresDigest
      ? !keys.includes('installDigest') || !keys.includes('installSource')
      : keys.includes('installDigest') || keys.includes('installSource'))
  ) {
    return {
      fault: `its output must be an object with exactly the properties ${requiresDigest ? 'package, version, installSource and installDigest' : 'package and version'}`,
    };
  }
  if (typeof answer.package !== 'string' || typeof answer.version !== 'string' || answer.version === '') {
    return { fault: 'its package and version must be strings, the version not empty' };
  }
  if (answer.package !== expectedPackage)
    return { fault: `it reports the package ${JSON.stringify(answer.package)} where ${expectedPackage} is declared` };
  if (requiresDigest && (typeof answer.installDigest !== 'string' || !DIGEST_PATTERN.test(answer.installDigest)))
    return { fault: 'its installDigest must be a sha256 digest' };
  if (requiresDigest && answer.installSource !== framework.installState.source)
    return { fault: `its installSource is ${JSON.stringify(answer.installSource)}; declared source is ${framework.installState.source}` };
  return {
    package: answer.package,
    version: answer.version,
    ...(requiresDigest ? { installSource: answer.installSource, installDigest: answer.installDigest } : {}),
  };
}

/** The first line of a probe's stderr, cut to a length a diagnostic can carry; empty when it printed none. */
function stderrNote(stderr) {
  const first = String(stderr ?? '')
    .trim()
    .split('\n')[0];
  return first === '' ? '' : `: ${first.slice(0, STDERR_NOTE_LENGTH)}`;
}

/**
 * The versions observed, each dependency once, as the `{ package, version }`
 * list the configuration records, sorted by package, with the observed install
 * source and digest when declared. A dependency whose probe
 * failed has no version and is left out.
 *
 * @param {Array<{ package: string, observed: { package: string, version: string, installSource?: string, installDigest?: string }|null }>} entries
 * @returns {Array<{ package: string, version: string, installSource?: string, installDigest?: string }>}
 */
function observedVersions(entries) {
  return entries
    .filter((entry) => entry.observed !== null)
    .map((entry) => ({
      package: entry.observed.package,
      version: entry.observed.version,
      ...(entry.observed.installDigest === undefined
        ? {}
        : { installSource: entry.observed.installSource, installDigest: entry.observed.installDigest }),
    }))
    .sort((left, right) => (left.package < right.package ? -1 : left.package > right.package ? 1 : 0));
}

/**
 * How the observation departs from the declaration, one message per
 * dependency, empty when every declared package is installed at its declared
 * version. `when` words the departure: at the start of the run the
 * declaration is what is violated; later the version the run started with
 * (which equals it) changed.
 *
 * @param {Array<{ package: string, version: string }>} frameworks `declaredFrameworks(...)`
 * @param {Array<{ package: string, observed: object|null, fault: string|null }>} entries one per declared package, in its order
 * @param {{ changed?: boolean }} [options] `changed`: the run read this version before and it moved
 * @returns {string[]}
 */
function observationProblems(frameworks, entries, { changed = false, initial = null } = {}) {
  const problems = [];
  for (const framework of frameworks) {
    const entry = entries.find((candidate) => candidate.package === framework.package);
    if (entry === undefined || entry.observed === null) {
      problems.push(`could not read the installed ${framework.package}: ${entry?.fault ?? 'its version probe did not run'}`);
    } else if (entry.observed.version !== framework.version) {
      problems.push(
        changed
          ? `installed ${framework.package} is ${entry.observed.version}; the run started with ${framework.version}`
          : `installed ${framework.package} is ${entry.observed.version}, and ${FRAMEWORKS_PATH} declares ${framework.version}`,
      );
    } else if (framework.installState !== undefined && initial !== null) {
      const original = initial.find((candidate) => candidate.package === framework.package);
      if (entry.observed.installDigest !== original?.installDigest)
        problems.push(
          `installed ${framework.package} install digest changed from ${original?.installDigest} to ${entry.observed.installDigest}`,
        );
    }
  }
  return problems;
}

/** The first PRINTED_LENGTH characters of a probe's output, cut between code points. */
function head(text) {
  return [...String(text ?? '')].slice(0, PRINTED_LENGTH).join('');
}

/**
 * The run artifact `framework-versions.json`: what the declaration expects and
 * what each probe reported and its effective timeout, with the diagnostics when the observation does not
 * meet the declaration, so an exit 12 on a missing or different package leaves
 * the versions that were seen.
 *
 * @returns {object}
 */
function versionsRecord(frameworks, entries, problems) {
  return {
    schemaVersion: VERSIONS_SCHEMA_VERSION,
    frameworks: frameworks.map((framework) => {
      const entry = entries.find((candidate) => candidate.package === framework.package);
      if (entry === undefined) throw new Error(`missing framework probe entry for ${framework.package}`);
      return {
        package: framework.package,
        declaredVersion: framework.version,
        ...(framework.installState === undefined ? {} : { installState: framework.installState }),
        effectiveProbeTimeoutMs: entry.effectiveProbeTimeoutMs,
        observed: entry.observed,
        ...(entry.fault
          ? {
              fault: entry.fault,
              stdout: head(entry.stdout),
              stderr: head(entry.stderr),
            }
          : {}),
      };
    }),
    ...(problems.length > 0 ? { problems } : {}),
  };
}

module.exports = {
  DEFAULT_PROBE_TIMEOUT_MS,
  MAX_PROBE_TIMEOUT_MS,
  FRAMEWORKS_PATH,
  LEARNED_PATH,
  declarationProblems,
  declaredFrameworks,
  effectiveProbeTimeoutMs,
  learnedProblems,
  observationProblems,
  observedVersions,
  readProbeAnswer,
  stderrNote,
  versionsRecord,
};
