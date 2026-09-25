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
 * `{ path, sha256 }` list of every file under `evaluator/`); for both
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

/**
 * Every regular file under the evaluation folder's `evaluator/`, as sorted
 * `{ path, sha256 }` entries; a symbolic link or other special file is
 * refused, since the digest covers only bytes the folder holds.
 *
 * @returns {Array<{ path: string, sha256: string }>}
 * @throws {EvaluatorLayerError}
 */
function evaluatorTree(folder, digestBytes) {
  const root = path.join(folder, EVALUATOR_DIRECTORY);
  const entries = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(folder, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) entries.push({ path: relative, sha256: digestBytes(fs.readFileSync(absolute)).slice(DIGEST_PREFIX.length) });
      else
        throw new EvaluatorLayerError(
          `${relative} is not a regular file or directory; evaluator/ holds only bytes the evaluation folder owns`,
        );
    }
  };
  let stats;
  try {
    stats = fs.lstatSync(root);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  if (!stats.isDirectory()) throw new EvaluatorLayerError(`${EVALUATOR_DIRECTORY} is not a directory the evaluation folder holds`);
  walk(root);
  return entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

/**
 * What a run reads of its evaluation layer before anything runs: the mapping
 * and its row validator, which the trials use as read here, and the digests
 * the configuration records. A command evaluator runs from the evaluation
 * folder at each trial, so an edit to it during the run is caught by the
 * adopter-tree read after every trial (exit 12), not by this snapshot.
 *
 * @param {object} options
 * @param {string} options.folder
 * @param {object} options.evaluation
 * @param {object} options.contract
 * @param {object} options.engine the loaded engine (`digestBytes`, `digestArtifact`)
 * @returns {{ evaluator: object, mapping: object|null, validate: Function|null, treeDigest: string|null, executableDigest: string|null }}
 * @throws {EvaluatorLayerError}
 */
function readEvaluatorLayer({ folder, evaluation, contract, engine }) {
  const evaluator = evaluatorOf(evaluation);
  const layer = { evaluator, mapping: null, validate: null, treeDigest: null, executableDigest: null };
  if (evaluator.kind === 'deterministic' || evaluator.kind === 'records') return layer;
  const tree = evaluatorTree(folder, engine.digestBytes);
  layer.treeDigest = engine.digestArtifact(tree, 'evaluator-tree');
  let mapping;
  try {
    mapping = JSON.parse(fs.readFileSync(path.join(folder, ...MAPPING_PATH.split('/')), 'utf8'));
  } catch (error) {
    throw new EvaluatorLayerError(`${MAPPING_PATH} cannot be read: ${error.message}`);
  }
  const problems = mappingSchemaProblems(mapping);
  if (problems.length === 0) problems.push(...mappingContractProblems(mapping, contract));
  if (problems.length > 0) throw new EvaluatorLayerError(`${MAPPING_PATH}: ${problems.join('; ')}`);
  layer.mapping = mapping;
  layer.validate = rowsValidator(mapping);
  if (evaluator.kind === 'command') {
    const executable = path.join(folder, ...evaluator.command.split('/'));
    let stats;
    try {
      stats = fs.lstatSync(executable);
    } catch {
      stats = null;
    }
    if (stats === null || !stats.isFile())
      throw new EvaluatorLayerError(`${evaluator.command} is not a regular file the evaluation folder holds`);
    if (process.platform !== 'win32' && (stats.mode & 0o111) === 0) throw new EvaluatorLayerError(`${evaluator.command} is not executable`);
    layer.executableDigest = engine.digestBytes(fs.readFileSync(executable));
  }
  return layer;
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
  evaluatorOf,
  isKnownEvaluator,
  evaluatorTree,
  readEvaluatorLayer,
  recordedEvaluatorModel,
};
