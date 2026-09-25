/**
 * The evaluation layer a run judges its trials with (AD-21): which kind
 * `evaluation.json` declares, what the run reads of it before anything runs,
 * and the fixed conditions its `EvaluatorConfiguration` records.
 *
 * `evaluator.kind` is `deterministic` when `evaluation.json` declares no
 * `evaluator`. Every kind's configuration carries TeA's own conditions under
 * caller-owned keys in `decodingParameters`, the one field eval-quality's
 * strict schema opens to them: `tea.evaluatorKind` always; for a `command`
 * evaluator `tea.evaluatorExecutableDigest` (`digestBytes` over the
 * executable) and `tea.evaluatorTreeDigest` (`digestArtifact` over the sorted
 * `{ path, sha256 }` list of the layer's files, `evaluatorFiles`: in a git
 * repository the ones git tracks under `evaluator/`); for both
 * row-converting kinds `tea.evaluatorWiring` (the `evaluation.json` block
 * that runs it: arguments, environment keys, timeout, or adapter, command,
 * arguments and model); a command's model snapshot when the conditions name
 * one (`tea.evaluatorModelSnapshot`); for a `sealed-brief-agent` the tree
 * digest (its mapping lives there), the agent adapter and the model it
 * resolves to. A changed evaluator therefore changes the configuration
 * digest, every record's `evaluatorConfigurationDigest`, and the scoring
 * version. The deterministic kind gains `tea.evaluatorKind` alone, which
 * moves every deterministic run's configuration digest once, from this
 * release on.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { resolveModel } = require('../agent-adapters');
const { MAPPING_PATH, mappingContractProblems, mappingSchemaProblems, rowsValidator } = require('./judgment-rows');
const { evaluatorTemplateDigest } = require('./sealed-brief-agent');
const { runGit } = require('./workspace');

const EVALUATOR_DIRECTORY = 'evaluator';
const DIGEST_PREFIX = 'sha256:';

/** The identity each TeA-run kind records: an opaque label with no person or account in it. */
const IDENTITIES = {
  deterministic: 'tea-evaluate deterministic evaluator',
  command: 'tea-evaluate command evaluator',
  'sealed-brief-agent': 'tea-evaluate sealed-brief agent evaluator',
};

/** An evaluation layer the run cannot use as committed; `run` reports it as an authoring defect (exit 10). */
class EvaluatorLayerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EvaluatorLayerError';
  }
}

/** The evaluator kinds TeA runs. */
const KINDS = new Set(['deterministic', 'command', 'sealed-brief-agent', 'records']);

/** `evaluation.json`'s evaluator, the deterministic one when it declares none; one of no known kind is returned as it is, for `check` to refuse. */
function evaluatorOf(evaluation) {
  return evaluation.evaluator ?? { kind: 'deterministic' };
}

/** Whether `evaluator` is an object naming a kind TeA runs. */
function isKnownEvaluator(evaluator) {
  return evaluator !== null && typeof evaluator === 'object' && KINDS.has(evaluator.kind);
}

/** Whether the kind converts judgment rows through `evaluator/mapping.json`. */
function convertsRows(kind) {
  return kind === 'command' || kind === 'sealed-brief-agent';
}

/** Opens a file for reading through no link and without blocking on a FIFO. */
const READ_REGULAR = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0) | (fs.constants.O_NOFOLLOW ?? 0);
/** The execute bits of a file mode. */
const EXECUTE_BITS = 0o111;

/** The index mode git gives a gitlink, the entry a submodule is recorded as. */
const GITLINK_MODE = '160000';

/**
 * The paths git tracks under `evaluator/`, relative to the folder, or null
 * when the folder is in no git repository. A submodule there is refused by
 * name: its files are another repository's, which this one does not track.
 */
function trackedEvaluatorPaths(folder) {
  const inside = runGit(['-C', folder, 'rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.stdout.trim() !== 'true') return null;
  const listed = runGit(['-C', folder, 'ls-files', '--stage', '-z', '--', EVALUATOR_DIRECTORY]);
  if (!listed.ok) throw new EvaluatorLayerError(`the files git tracks under ${EVALUATOR_DIRECTORY}/ cannot be listed: ${listed.detail}`);
  const paths = new Set();
  // Each entry is `<mode> <object> <stage>\t<path>`; a conflicted path is listed once per stage.
  for (const entry of listed.stdout.split('\0').filter((line) => line.length > 0)) {
    const tab = entry.indexOf('\t');
    const relative = entry.slice(tab + 1);
    if (entry.slice(0, entry.indexOf(' ')) === GITLINK_MODE) {
      throw new EvaluatorLayerError(
        `${relative} is a git submodule; evaluator/ holds only files the evaluation folder's own repository tracks, so commit the evaluator's files there`,
      );
    }
    paths.add(relative);
  }
  return [...paths];
}

/** Every path under `root`, relative to `folder`; a link or special file is refused. */
function walkedEvaluatorPaths(folder, root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(folder, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) found.push(relative);
      else
        throw new EvaluatorLayerError(
          `${relative} is not a regular file or directory; evaluator/ holds only bytes the evaluation folder owns`,
        );
    }
  };
  walk(root);
  return found;
}

/** A regular file's bytes and mode, read through no link and never blocking; null when it is gone. */
function regularFile(folder, relative) {
  const absolute = path.join(folder, ...relative.split('/'));
  // Every directory on the way is the folder's own, so no linked directory carries the read elsewhere.
  let directory;
  try {
    directory = fs.realpathSync(path.dirname(absolute));
  } catch {
    return null;
  }
  const spelled = path.join(fs.realpathSync(folder), ...relative.split('/').slice(0, -1));
  if (directory !== spelled)
    throw new EvaluatorLayerError(`${relative} is reached through a link; evaluator/ holds only bytes the evaluation folder owns`);
  let descriptor;
  try {
    descriptor = fs.openSync(absolute, READ_REGULAR);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new EvaluatorLayerError(`${relative} is not a regular file or directory; evaluator/ holds only bytes the evaluation folder owns`);
  }
  try {
    const stats = fs.fstatSync(descriptor);
    if (!stats.isFile()) {
      throw new EvaluatorLayerError(
        `${relative} is not a regular file or directory; evaluator/ holds only bytes the evaluation folder owns`,
      );
    }
    return { bytes: fs.readFileSync(descriptor), mode: stats.mode };
  } finally {
    fs.closeSync(descriptor);
  }
}

/**
 * The files the evaluation layer is made of, as sorted `{ path, bytes, mode }`
 * entries (`path` relative to the evaluation folder, `evaluator/...`).
 *
 * In a git repository they are the paths git tracks under `evaluator/` (its
 * index), with their working-tree bytes, so a file git does not track (an
 * interpreter's cache, an editor's backup, a note left there) is no part of
 * the layer and never moves its digest, and an edit to a tracked file is
 * uncommitted work the run records as dirty. Outside a repository they are
 * every regular file under `evaluator/`. Either way a link, a special file or
 * a path through a linked directory is refused, since the digest covers only
 * bytes the folder holds. `tracked` says which rule chose them.
 *
 * @param {string} folder
 * @returns {{ tracked: boolean, files: Array<{ path: string, bytes: Buffer, mode: number }> }}
 * @throws {EvaluatorLayerError}
 */
function evaluatorFiles(folder) {
  const root = path.join(folder, EVALUATOR_DIRECTORY);
  let stats;
  try {
    stats = fs.lstatSync(root);
  } catch (error) {
    if (error.code === 'ENOENT') return { tracked: trackedEvaluatorPaths(folder) !== null, files: [] };
    throw error;
  }
  if (!stats.isDirectory()) throw new EvaluatorLayerError(`${EVALUATOR_DIRECTORY} is not a directory the evaluation folder holds`);
  const tracked = trackedEvaluatorPaths(folder);
  const files = [];
  for (const relative of tracked ?? walkedEvaluatorPaths(folder, root)) {
    // A tracked path deleted from the working tree is uncommitted work, and the layer is what the tree holds.
    const read = regularFile(folder, relative);
    if (read !== null) files.push({ path: relative, ...read });
  }
  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return { tracked: tracked !== null, files };
}

/**
 * The evaluation layer's files as the sorted `{ path, sha256 }` list the tree
 * digest is taken over (`evaluatorFiles`).
 *
 * @returns {Array<{ path: string, sha256: string }>}
 * @throws {EvaluatorLayerError}
 */
function evaluatorTree(folder, digestBytes) {
  return evaluatorFiles(folder).files.map((file) => ({ path: file.path, sha256: digestBytes(file.bytes).slice(DIGEST_PREFIX.length) }));
}

/** How a file the layer needs and does not hold is named: one git tracks, or one the folder holds. */
function notInLayer(relative, tracked) {
  return `${relative} is not a regular file ${tracked ? 'git tracks under evaluator/ (git add it)' : 'the evaluation folder holds'}`;
}

/**
 * What a run reads of its evaluation layer before anything runs: the mapping
 * and its row validator, which the trials use as read here, the digests the
 * configuration records, and the files those digests are taken over.
 *
 * The layer's files (`evaluatorFiles`) are read once: the digests are taken
 * over those bytes and the mapping is parsed from them. A command evaluator
 * runs in place, from the evaluation folder's `evaluator/`, so its module
 * resolution and its reads beside itself work as they do outside a run; the
 * run holds it to the bytes read here by reading the files again before
 * each launch and after each trial (`evaluatorLayerChange`).
 *
 * @param {object} options
 * @param {string} options.folder
 * @param {object} options.evaluation
 * @param {object} options.contract
 * @param {object} options.engine the loaded engine (`digestBytes`, `digestArtifact`)
 * @returns {{ evaluator: object, files: Array<{ path: string, bytes: Buffer }>|null, mapping: object|null, validate: Function|null, treeDigest: string|null, executableDigest: string|null }}
 *   `files` are the layer's files as read, null for a kind with no layer to read
 * @throws {EvaluatorLayerError}
 */
function readEvaluatorLayer({ folder, evaluation, contract, engine }) {
  const evaluator = evaluatorOf(evaluation);
  const layer = { evaluator, files: null, mapping: null, validate: null, treeDigest: null, executableDigest: null };
  if (evaluator.kind === 'deterministic' || evaluator.kind === 'records') return layer;
  const { tracked, files } = evaluatorFiles(folder);
  layer.files = files.map((file) => ({ path: file.path, bytes: file.bytes }));
  layer.treeDigest = engine.digestArtifact(
    files.map((file) => ({ path: file.path, sha256: engine.digestBytes(file.bytes).slice(DIGEST_PREFIX.length) })),
    'evaluator-tree',
  );
  const held = (relative) => files.find((file) => file.path === relative);
  const mappingFile = held(MAPPING_PATH);
  if (mappingFile === undefined) throw new EvaluatorLayerError(`${MAPPING_PATH} cannot be read: ${notInLayer(MAPPING_PATH, tracked)}`);
  let mapping;
  try {
    mapping = JSON.parse(mappingFile.bytes.toString('utf8'));
  } catch (error) {
    throw new EvaluatorLayerError(`${MAPPING_PATH} cannot be read: ${error.message}`);
  }
  const problems = mappingSchemaProblems(mapping);
  if (problems.length === 0) problems.push(...mappingContractProblems(mapping, contract));
  if (problems.length > 0) throw new EvaluatorLayerError(`${MAPPING_PATH}: ${problems.join('; ')}`);
  layer.mapping = mapping;
  layer.validate = rowsValidator(mapping);
  if (evaluator.kind === 'command') {
    const executable = held(evaluator.command);
    if (executable === undefined) throw new EvaluatorLayerError(notInLayer(evaluator.command, tracked));
    if (process.platform !== 'win32' && (executable.mode & EXECUTE_BITS) === 0) {
      throw new EvaluatorLayerError(`${evaluator.command} is not executable`);
    }
    layer.executableDigest = engine.digestBytes(executable.bytes);
  }
  return layer;
}

/**
 * How the evaluation layer's files differ from the bytes `readEvaluatorLayer`
 * read, or null when every file holds them still: a file gone, one whose
 * bytes changed, one that joined the layer, or a layer that can no longer be
 * read. The run asks before each launch of the evaluator and after each
 * trial, and a difference stops it with exit 12 and no record, since the
 * configuration digests would then name bytes that did not run.
 *
 * @param {string} folder
 * @param {Array<{ path: string, bytes: Buffer }>} files `readEvaluatorLayer(...).files`
 * @returns {string|null}
 */
function evaluatorLayerChange(folder, files) {
  let now;
  try {
    now = evaluatorFiles(folder).files;
  } catch (error) {
    if (!(error instanceof EvaluatorLayerError)) throw error;
    return error.message;
  }
  const changes = [];
  for (const file of files) {
    const current = now.find((candidate) => candidate.path === file.path);
    if (current === undefined) changes.push(`${file.path} is gone`);
    else if (!current.bytes.equals(file.bytes)) changes.push(`${file.path} no longer holds the bytes the run read at its start`);
  }
  for (const current of now) {
    if (!files.some((file) => file.path === current.path)) changes.push(`${current.path} joined the layer`);
  }
  return changes.length === 0 ? null : changes.join('; ');
}

/**
 * The fields of the run's `EvaluatorConfiguration` the evaluation layer
 * decides: its identity, model, system prompt digest, decoding parameters
 * and judge configuration. The deterministic kind keeps Story 1.9's
 * configuration, with `tea.evaluatorKind` added.
 *
 * @param {object} options
 * @param {object} options.layer `readEvaluatorLayer(...)`
 * @param {object|null} options.conditions `policy/evaluator-conditions.json`, or null
 * @param {object|null} options.judgeConfiguration the rubric judge's, under the deterministic kind
 * @param {(bytes: Uint8Array) => string} options.digestBytes
 * @returns {{ evaluatorIdentity: string, modelSnapshot: string, systemPromptDigest: string, decodingParameters: object, judgeConfiguration: object|null }}
 */
function configurationFields({ layer, conditions, judgeConfiguration, digestBytes }) {
  const { evaluator } = layer;
  const noPrompt = digestBytes(new Uint8Array(0));
  const target = { modelSnapshot: conditions?.modelSnapshot ?? 'none', systemPromptDigest: conditions?.systemPromptDigest ?? noPrompt };
  const decodingParameters = { 'tea.evaluatorKind': evaluator.kind };
  if (evaluator.kind === 'deterministic') {
    return { evaluatorIdentity: IDENTITIES.deterministic, ...target, decodingParameters, judgeConfiguration };
  }
  decodingParameters['tea.evaluatorTreeDigest'] = layer.treeDigest;
  // How evaluation.json runs the evaluator is a condition of the run as its files are.
  decodingParameters['tea.evaluatorWiring'] = evaluatorWiring(evaluator);
  if (evaluator.kind === 'command') {
    decodingParameters['tea.evaluatorExecutableDigest'] = layer.executableDigest;
    // A command evaluator that calls a model names it in the conditions, beside the target's.
    if (typeof conditions?.evaluator?.modelSnapshot === 'string')
      decodingParameters['tea.evaluatorModelSnapshot'] = conditions.evaluator.modelSnapshot;
    return { evaluatorIdentity: `${IDENTITIES.command} ${evaluator.command}`, ...target, decodingParameters, judgeConfiguration: null };
  }
  // A sealed-brief agent is the model this configuration describes; the target's own model, when it runs one, stays recorded.
  decodingParameters['tea.evaluatorAgent'] = evaluator.agent;
  decodingParameters['tea.evaluatorModel'] = recordedEvaluatorModel(evaluator);
  if (target.modelSnapshot !== 'none') {
    decodingParameters['tea.targetModelSnapshot'] = target.modelSnapshot;
    decodingParameters['tea.targetSystemPromptDigest'] = target.systemPromptDigest;
  }
  const agentPrompt = { modelSnapshot: conditions.evaluator.modelSnapshot, systemPromptDigest: evaluatorTemplateDigest(digestBytes) };
  const scoresRubrics = Object.values(layer.mapping.keys).some((binding) => typeof binding.rubricId === 'string');
  return {
    evaluatorIdentity: IDENTITIES['sealed-brief-agent'],
    ...agentPrompt,
    decodingParameters,
    // The agent scores the rubric criteria its mapping binds, so it is the run's judge.
    judgeConfiguration: scoresRubrics ? agentPrompt : null,
  };
}

/** The evaluator's `evaluation.json` block with every optional field spelled, in a fixed order, so equal wiring digests equally. */
function evaluatorWiring(evaluator) {
  if (evaluator.kind === 'command') {
    return {
      command: evaluator.command,
      args: evaluator.args ?? [],
      environmentKeys: [...(evaluator.environmentKeys ?? [])].sort(),
      timeoutMs: evaluator.timeoutMs,
    };
  }
  return {
    agent: evaluator.agent,
    agentCommand: evaluator.agentCommand ?? null,
    agentArgs: evaluator.agentArgs ?? [],
    model: evaluator.model ?? null,
    environmentKeys: [...(evaluator.environmentKeys ?? [])].sort(),
    timeoutMs: evaluator.timeoutMs,
  };
}

/** The model a sealed-brief agent runs, as `run.json` records it: its own `model`, one its `agentArgs` set, or its adapter's default. */
function recordedEvaluatorModel(evaluator) {
  return resolveModel(evaluator.agent, evaluator.model, evaluator.agentArgs ?? []);
}

module.exports = {
  EVALUATOR_DIRECTORY,
  EvaluatorLayerError,
  IDENTITIES,
  configurationFields,
  convertsRows,
  evaluatorFiles,
  evaluatorLayerChange,
  evaluatorOf,
  isKnownEvaluator,
  evaluatorTree,
  readEvaluatorLayer,
  recordedEvaluatorModel,
};
