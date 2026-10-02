'use strict';

/**
 * The two-interface project of Story 1.42: one contract whose command interface (`grader-cli`) and HTTP interface
 * (`grader`) both declare the operation `grade-answer`, with a phase for each pair (`grader-cli/grade-answer` is
 * `process`, `grader/grade-answer` is `outcome`) and one defect probe for each interface.
 *
 * It is derived from two committed fixtures at test time, so no second copy of either lives in the tree: the HTTP
 * service, its contract, probe and mutation come from `test/fixtures/evaluate-api`, and the command interface from the
 * verdict fixture's operation, renamed. `test/fixtures/evaluate-reused-operation/bin/grader-cli.js` is the command's
 * target. Both targets read `rules/policy.txt`, so the one mutation M-001 relaxes both.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const API_FIXTURE = path.join(ROOT, 'test', 'fixtures', 'evaluate-api');
const VERDICT_CONTRACT = path.join(ROOT, 'test', 'fixtures', 'evaluate', 'mutation', 'evals', 'verdict', 'contract.json');
const OVERLAY = path.join(ROOT, 'test', 'fixtures', 'evaluate-reused-operation');

const OPERATION_ID = 'grade-answer';
const API_INTERFACE = 'grader';
const CLI_INTERFACE = 'grader-cli';
const API_STEP = 'grade-run';
const CLI_STEP = 'grade-run-cli';
/** The token the service's registry entry reads from the host; any value serves, and none is recorded. */
const TOKEN = 'reused-operation-token-4567';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const editJson = (file, edit) => {
  const value = readJson(file);
  edit(value);
  writeJson(file, value);
};

/** The command interface: the verdict fixture's, with its one operation given the shared ID and the twin's names. */
function commandInterface(verdictContract) {
  const iface = structuredClone(verdictContract.permittedInterfaces[0]);
  iface.logicalId = CLI_INTERFACE;
  const [operation] = iface.operations;
  operation.operationId = OPERATION_ID;
  operation.invocation.executable = CLI_INTERFACE;
  const witness = operation.sensitivityWitness;
  witness.witnessId = 'grade-cli-follows-the-request';
  for (const leg of witness.legs) leg.legId = leg.legId.replace('witness-', 'witness-cli-');
  const text = JSON.stringify(witness.relation).replaceAll('/interactions/witness-', '/interactions/witness-cli-');
  witness.relation = JSON.parse(text);
  return iface;
}

/** The command's behavior, oracle and plan step, the verdict fixture's own under this interface's names. */
function commandContract(contract, verdictContract) {
  const [behavior] = structuredClone(verdictContract.behaviors);
  behavior.id = 'B-002';
  behavior.description = 'Under the committed strict policy the grader command accepts the request it is given and exits 0.';
  behavior.oracles = ['O-002'];
  const [oracle] = structuredClone(verdictContract.oracles);
  const retarget = (value) => JSON.parse(JSON.stringify(value).replaceAll('/interactions/judge-run/', `/interactions/${CLI_STEP}/`));
  const placed = retarget(oracle);
  placed.id = 'O-002';
  const [step] = structuredClone(verdictContract.interactionPlan);
  step.stepId = CLI_STEP;
  step.interfaceId = CLI_INTERFACE;
  step.operationId = OPERATION_ID;
  contract.behaviors.push(behavior);
  contract.oracles.push(placed);
  contract.permittedInterfaces.push(commandInterface(verdictContract));
  contract.interactionPlan.push(step);
  contract.budgets.maxToolCalls = 2;
  contract.probeStepBound = 2;
}

/** P-003: the command's defect probe, the verdict fixture's P-002 under this interface's names. */
function commandProbe() {
  const probe = readJson(path.join(ROOT, 'test', 'fixtures', 'evaluate', 'mutation', 'evals', 'verdict', 'probes', 'P-002.probe.json'));
  probe.probeId = 'P-003';
  probe.behaviorId = 'B-002';
  probe.rationale = 'Seeded defect: M-001 relaxes the policy to lenient, and the grader command then rejects the request on stdout.';
  const [defect] = probe.defects;
  defect.defectId = 'D-002';
  defect.behaviorId = 'B-002';
  defect.summary = 'The relaxed policy makes the grader command reject a request it must accept.';
  const witness = defect.manifestationWitness;
  witness.legId = 'manifest-cli-lenient';
  witness.interfaceId = CLI_INTERFACE;
  witness.operationId = OPERATION_ID;
  witness.relation = JSON.parse(
    JSON.stringify(witness.relation).replace('/interactions/manifest-lenient/', '/interactions/manifest-cli-lenient/'),
  );
  probe.defectSignature.invocation.executable = CLI_INTERFACE;
  return probe;
}

/** The registry entry that runs the command interface. */
function commandRegistryEntry() {
  return {
    interfaceId: CLI_INTERFACE,
    executable: CLI_INTERFACE,
    target: 'bin/grader-cli.js',
    subcommandPaths: [[]],
    artifacts: {},
    environmentKeys: [],
    maxElapsedMs: 30_000,
    infrastructureExitCodes: [3],
  };
}

/**
 * Builds the project under `directory` and returns `{ root, folder, env }`. The corpus index is not digested here:
 * the caller runs `tea-evaluate digest` over `folder` once it has made any edit of its own.
 */
function buildProject(directory) {
  const root = path.join(directory, 'project');
  fs.cpSync(API_FIXTURE, root, { recursive: true, filter: (from) => !['runs', 'node_modules'].includes(path.basename(from)) });
  fs.cpSync(OVERLAY, root, { recursive: true });
  const folder = path.join(root, 'evals', 'grader');
  fs.mkdirSync(path.join(folder, 'node_modules'));
  fs.symlinkSync(path.join(ROOT, 'node_modules', 'eval-quality'), path.join(folder, 'node_modules', 'eval-quality'));
  fs.symlinkSync(ROOT, path.join(folder, 'node_modules', 'bmad-method-test-architecture-enterprise'));

  const verdictContract = readJson(VERDICT_CONTRACT);
  editJson(path.join(folder, 'contract.json'), (contract) => commandContract(contract, verdictContract));
  writeJson(path.join(folder, 'probes', 'P-003.probe.json'), commandProbe());
  editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
    evaluation.registry.push(commandRegistryEntry());
    evaluation.interface = 'api';
    evaluation.operationPhases = {
      [API_INTERFACE]: { [OPERATION_ID]: 'outcome', 'report-release': 'outcome' },
      [CLI_INTERFACE]: { [OPERATION_ID]: 'process' },
    };
    evaluation.trials = 1;
  });
  editJson(path.join(folder, 'policy', 'scoring-policy.json'), (policy) => (policy.minimumTrialCount = 1));
  return { root, folder, env: { GRADER_TOKEN: TOKEN } };
}

module.exports = { API_INTERFACE, API_STEP, CLI_INTERFACE, CLI_STEP, OPERATION_ID, buildProject, readJson };
