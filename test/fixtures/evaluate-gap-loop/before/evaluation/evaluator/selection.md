# Evaluator selection

Selected: TeA deterministic evaluator. The command and expected outputs are deterministic JSON. Exact oracle checks cover exit code, file path, status, findings, and error. A model rubric would add judgment variance without a semantic decision to resolve. No model, credential, reference output framework, or calibration set is needed. Runtime and engine versions must be recorded by the maintainer during live check and score.

Selection criteria: repeatable checks, full stdout and exit-code visibility, no external dependency, no model cost, direct Node runtime fit, and suitable PR and scheduled tiers. The adopter harness and command evaluator would require more maintained code for the same exact checks.
