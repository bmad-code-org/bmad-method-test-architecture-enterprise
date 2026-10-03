# Learned evaluation framework

## Framework and installed version

- Framework and package: Braintrust Autoevals, npm package `autoevals`.
- Installed package and version: `autoevals@0.3.0`, the version `evaluator/frameworks.json` declares and `tea-evaluate run` observes before each launch of the evaluator.
- Installed version and runtime: `0.3.0` on Node `v24.20.0`.
- Licence and source: MIT, installed `autoevals/package.json`; [publisher repository at JavaScript 0.3.0](https://github.com/braintrustdata/autoevals/tree/b0500edbf6c157d526f9bc027798ea269a3ceb7c).
- Model and credentials needed: none for `ExactMatch`. The publisher identifies it as a heuristic scorer in [SCORERS.md](https://github.com/braintrustdata/autoevals/blob/b0500edbf6c157d526f9bc027798ea269a3ceb7c/SCORERS.md).

## Primary-source facts used

| Fact used by this evaluator | Publisher source | Installed-version check |
| --- | --- | --- |
| `ExactMatch` takes `output` and `expected` | [Publisher scorer reference](https://github.com/braintrustdata/autoevals/blob/b0500edbf6c157d526f9bc027798ea269a3ceb7c/SCORERS.md#exactmatch) | `jsdist/index.d.ts` declares `ExactMatch: ScorerWithPartial<unknown, {}>` and `ScorerArgs` with `output` and optional `expected` |
| It scores exact equality as 1 or inequality as 0 | [SCORERS.md](https://github.com/braintrustdata/autoevals/blob/b0500edbf6c157d526f9bc027798ea269a3ceb7c/SCORERS.md) | Known pass and fail below returned `score: 1` and `score: 0` |
| The result has `name` and `score` | [Publisher README, Score results](https://github.com/braintrustdata/autoevals/blob/b0500edbf6c157d526f9bc027798ea269a3ceb7c/README.md#score-results) | `jsdist/index.d.ts` defines `Score` with `name: string` and `score: number | null` |
| No model call is needed for this heuristic scorer | [Publisher scorer reference](https://github.com/braintrustdata/autoevals/blob/b0500edbf6c157d526f9bc027798ea269a3ceb7c/SCORERS.md) | Installed `jsdist/index.js` implements `ExactMatch` with local normalization and equality; direct examples returned scores without a model request |

## Executed minimal example: known pass

- Command: `node --input-type=module -e "import {ExactMatch} from 'autoevals'; const expected='Summary for List pantry: apples, pears\\n'; for (const [label,output] of [['known-pass',expected],['known-fail','Summary for List pantry: apples\\n']]) { const result=await ExactMatch({output,expected}); console.log(JSON.stringify({label,input:{output,expected},result})); }"` from `test/evaluations`.
- Input: `output` and `expected` both `Summary for List pantry: apples, pears\n`.
- Stdout: `{"label":"known-pass","input":{"output":"Summary for List pantry: apples, pears\n","expected":"Summary for List pantry: apples, pears\n"},"result":{"name":"ExactMatch","score":1}}`.
- Stderr: empty. Exit status: 0. Framework result: `ExactMatch`, score 1.
- Judgment row: `pantry-exact-summary` maps this to pass when the captured CLI exit code is also 0.

## Executed minimal example: known fail

- Same command. Input: `output` was `Summary for List pantry: apples\n`; `expected` retained `pears`.
- Stdout: `{"label":"known-fail","input":{"output":"Summary for List pantry: apples\n","expected":"Summary for List pantry: apples, pears\n"},"result":{"name":"ExactMatch","score":0}}`.
- Stderr: empty. Exit status: 0. Framework result: `ExactMatch`, score 0.
- Judgment row: `pantry-exact-summary` maps this to fail with the observed stdout as its evidence quote.

The expanded malformed control also exercised `ExactMatch` on stderr. `output: "error: invalid list request\\n"` against the same expected value returned `{"name":"ExactMatch","score":1}`; `output: ""` returned `{"name":"ExactMatch","score":0}`. The command exited 0 with empty stderr. Both examples ran before adding the `malformed-request-refusal` mapping key.

## Documented claims contradicted by execution

None observed. `npm install` warned that the package requests pnpm; installation and direct examples completed successfully under npm. The warning concerns package-manager preference and did not affect the scorer's observed behavior.

## Mapping and pipeline result

- `evaluator/mapping.json` binds `pantry-exact-summary` to O-001/B-001 and `malformed-request-refusal` to O-002/B-002.
- The evaluator compares captured stdout byte for byte with the adopter-confirmed answer and checks exit code 0. It compares the malformed request's full stderr diagnostic and checks exit code 2. It never trims a final newline.
- Final single-mutation `check`, `compile`, `seal`, and `preflight` exited 0. Development P-001 and P-004 each resolved `passed-clean-control` in three trials. P-002 resolved `caught` in three trials. Held-out P-003 resolved `caught` in three trials via `gap-view.json`. At the time of that run, eval-quality 6.0.0 reported `CONCERNS` for `success-indicator-separation`, as the gap report records. Rescoring the same fixture with published eval-quality 6.0.1 produces `PASS` with no coverage gaps for all four evidence artifacts while retaining those trial outcomes.

### Story 1.56 result, 2026-10-03

The second controlled mutation, M-002, bypasses the malformed-request guard in a copied target. Development P-005 and held-out P-006 witness the same serialized type-violating stdin used in scored trials. Autoevals compares the complete stderr diagnostic, while the evaluator also requires exit code 2 and empty stdout. The guard bypass produces a summary on stdout; O-002 records a failure with a quote from the observed exit code, stdout, or stderr.

Real preflight qualified both new probes with the defective response, restored original bytes and digest, and reran a passing clean baseline. P-005 and P-006 each scored three `caught` votes. P-004 retained three `passed-clean-control` votes. The development and held-out runs now produce six evidence artifacts across P-001 through P-006. Published eval-quality 6.0.1 reports `contractVerdict: PASS` with no coverage gaps or waiver for all six artifacts.
