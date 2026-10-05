# Intake

Inspection supplies observed facts. Ask the adopter for the decisions those facts cannot settle. Use all six families below and write each answer under the matching heading in a run-specific copy of `assets/requirements-statement.md`. Keep the installed asset as a template. The worked answers use the reservation review skill from inspection.

## What must be proven

Ask: “Which decisions matter most? What would count as success at the limit? Which behaviors are material or critical?” Worked answer: the skill approves an eligible request with the controlling rule cited (`B-001`, material), and declines an over-limit request before any reservation call (`B-002`, critical). This ranking determines held-out coverage.

## Admissible evidence

Ask: “Which outputs can we trust as proof? Is a receipt enough, or must the tool trace agree? Can an external evaluator read a fixture?” Worked answer: stdout, exit code and the recorded tool-call trajectory are admissible; a receipt may corroborate them; a lone keyword does not establish a correct decision. Name the observation pointers when the contract is authored.

## Interfaces and resources in scope

Ask: “Which commands, endpoints and tools may run? Which files may the target read or write? Are any deployments excluded?” Worked answer: the skill runner and test reservation tool are in scope, with the skill's rule files and fixture requests. The production reservation service is excluded. Translate this answer into the execution-target registry and disposable workspace.

## Boundary conditions

Ask: “Where does the behavior change, and how should missing, extra or malformed inputs behave?” Worked answer: test exactly at the limit and one unit on either side; missing and nonnumeric amounts must be rejected. A request exactly at the limit remains eligible. Carry these boundaries into representative, negative and malformed probes.

## Operational constraints

Ask: “What are the time, budget, secret, rate-limit and environment limits?” Worked answer: each command has a 30 second ceiling, at most ten tool calls per trial, fixture credentials only and no production request. Record environment key names without secret values. Match the registry and run policy to these limits.

## Feared or observed failure modes

Ask: “Which failures have happened, and which plausible failures would hurt most?” Worked answer: approving over-limit requests, declining every request, citing an irrelevant rule, calling reservation before checking the limit and accepting malformed amounts. Use one seeded defect per behavior where an AD-19 signature can expose it; record a refused seed and reason otherwise.

## Write and confirm the statement

Copy the template to `{test_artifacts}/evaluate/<evaluationId>/requirements-statement.md` and fill that working draft.
Read it back to the adopter.
**Halt for the adopter's explicit confirmation before corpus design.**
After confirmation, copy the exact confirmed bytes into `{tea_evaluations_folder}/<evaluationId>/requirements.md`.
Create AD-20's private `{tea_evaluations_folder}/package.json` with `{"private":true,"devDependencies":{"eval-quality":"latest","bmad-method-test-architecture-enterprise":"latest"}}`.
Run `npm install --prefix {tea_evaluations_folder}`; this works when the adopter's root repository has no Node manifest.
Put `assets/evaluation.json` at `{tea_evaluations_folder}/<evaluationId>/evaluation.json` if it is not there yet, then run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate digest --evaluation {tea_evaluations_folder}/<evaluationId> --file requirements.md`.
It prints `sha256:` and 64 hex digits, eval-quality's `digestBytes` over the committed `requirements.md` bytes, and writes nothing; put the output in `evaluation.json`'s `requirements.digest` and set `requirements.path` to `requirements.md`.
`--file` is relative to the evaluation folder.
The starter `assets/evaluation.json` contains the digest of the unedited statement template; recompute it after any edit.
Keep the confirmation name and date in the statement.
`npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation {tea_evaluations_folder}/<evaluationId>` validates the complete evaluation after its remaining artifacts exist.
