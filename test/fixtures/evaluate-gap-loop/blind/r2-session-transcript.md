# Session transcript

All commands ran from the isolated folder. The commands below abbreviate the evaluation path as `evaluation/`; the CLI executable was `/Users/murat/opensource/bmad-method-test-architecture-enterprise/cli/evaluate.js` and eval-quality was `/Users/murat/opensource/bmad-method-test-architecture-enterprise/node_modules/.bin/eval-quality`.

| Command or action | Outcome |
| --- | --- |
| Read `gaps.md`, supplied development evidence, authored evaluation, and local target command | Identified O-003's permissive `match` branch and the critical malformed-input gap. |
| Edit O-003, then `tea-evaluate digest`, `check`, `eval-quality compile`, `seal` | All exited 0. |
| `tea-evaluate run --evaluation evaluation --partition development` | Run `20260929T035801825Z-b5cb51ff`, exit 0; 12 probes qualified. |
| `tea-evaluate score --evaluation evaluation --run 20260929T035801825Z-b5cb51ff` | Score `20260929T035839151Z-e5c0085e`, exit 0; P-007 and P-009 caught 3/3; sole coverage gap persisted. |
| Add initial malformed JSON P-018 and M-009; digest, check, compile, seal, run | Run `20260929T040007996Z-417ea462` stopped at preflight exit 4 due undeclared mandatory input for a text stdin witness. |
| Experiment with a second raw operation | Compile rejected duplicate CLI operation signature. The duplicate operation was removed. |
| Convert stdin declaration and witness bindings to raw bytes; digest, check, compile, seal, run | Run `20260929T040232182Z-b070a376` stopped at preflight exit 3 because the malformed JSON fault leg resolved insufficient evidence. |
| Change P-018 to a non-string `file` fault, restore normal stdin wiring; digest, check, compile, seal, run, score | Run `20260929T040438720Z-8a537fe5`, score `20260929T040520764Z-bf76bd22`, both exit 0; P-018 caught 3/3; malformed-input gap persisted. |
| Strengthen O-004 to compare complete error JSON; digest, check, compile, seal, run, score | Run `20260929T040555719Z-69825407`, score `20260929T040637878Z-8d203979`, both exit 0; gap persisted. |
| Add raw malformed JSON P-019 and M-010; digest, check, compile, seal, run | Run `20260929T040736802Z-ce5a4630` stopped at preflight exit 4 due text stdin declaration. |
| Restore raw stdin wiring; digest, check, compile, seal, run | Runs `20260929T040820616Z-4f25595f` and `20260929T040943124Z-8dfd55a8` stopped at preflight exit 3 because P-019's manifestation relation matched a clean witness. |
| Make P-019 manifestation relation match the unique complete mutated response; digest, check, compile, seal, run, score | Run `20260929T041030384Z-f42b06f1`, score `20260929T041118138Z-95557dd4`, both exit 0. All 14 probes qualified and scored. The sole coverage gap remains critical and unsatisfied. |
| Trial a separate malformed-input oracle | `tea-evaluate check` exited 10 because one-oracle-per-behavior and schema rules rejected it. The trial oracle was removed. Final `check`, `compile`, and `seal` exited 0. |

## Files read

- `gaps.md`
- `evidence/development-first-stop.json`
- `evidence/w1-gameability.json`
- `evidence/w2-coverage.json`
- `target/bin/review.mjs`
- `evaluation/evaluation.json`
- `evaluation/requirements.md`
- `evaluation/contract.json`
- `evaluation/compiled-contract.json`
- `evaluation/policy/scoring-policy.json`
- `evaluation/policy/decision.md`
- `evaluation/evaluator/selection.md`
- `evaluation/corpus-index.json`
- `evaluation/corpus/gameability/P-009.json`
- `evaluation/probes/P-001.probe.json`, `P-002.probe.json`, `P-003.probe.json`, `P-004.probe.json`, `P-005.probe.json`, `P-006.probe.json`, `P-007.probe.json`, `P-008.probe.json`, `P-009.probe.json`, `P-014.probe.json`, `P-016.probe.json`, `P-017.probe.json`, `P-018.probe.json`, `P-019.probe.json`
- `evaluation/mutations/M-001.mutation.json`, `M-002.mutation.json`, `M-003.mutation.json`, `M-004.mutation.json`, `M-005.mutation.json`, `M-006.mutation.json`, `M-007.mutation.json`, `M-008.mutation.json`, `M-009.mutation.json`, `M-010.mutation.json`
- `evaluation/runs/20260929T035801825Z-b5cb51ff/contract.json` and its qualified probe snapshots for P-005 through P-009 and P-017
- Development run `20260929T035801825Z-b5cb51ff`: trial, interpretation, and score evidence artifacts for P-007, P-008, P-009, and P-016
- Development run `20260929T040232182Z-b070a376`: preflight verdict, engine preflight diagnostics, and manifestation observation for P-018
- Development run `20260929T040438720Z-8a537fe5`: score evidence artifacts for all 13 probes
- Development run `20260929T040555719Z-69825407`: score evidence artifacts for P-001 and P-018
- Development runs `20260929T040820616Z-4f25595f` and `20260929T040943124Z-8dfd55a8`: preflight verdicts and manifestation and clean observations for P-019
- Development run `20260929T041030384Z-f42b06f1`: interpretation and score evidence artifacts for P-001, P-007, P-009, and P-019
