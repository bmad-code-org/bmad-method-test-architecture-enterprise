# Jev System One for fragment selection: feasibility verdict

Verdict: **stop at this note**. The semantic-need gate fails, so no helper, transport, dependency, or `cli/jev-fragment-selection-runner.js` is built.
Re-open only when the gate below passes.

Checked against `main` at v3.0.2.
Proposal source: the Jev System One support spec handed off against TeA 3.0.0; where it disagrees with the code below, the code wins.

## What is deterministic today

Every fragment-selection rule in the eight corpora under `test/evals/`, except the NFR relevance rule below, is a function of the config flag, the stack, the runner, `package.json` dependencies, named repository facts, and one explicit-request branch: contract testing is also relevant when the task explicitly requests it (`step-02-load-context.md` line 132 and four sibling step files).
The `automate-playwright-ui-utils-on` and `automate-backend-pytest` cases are pure code decisions (flag AND package evidence). A model call there buys nothing.
Contract-testing relevance is decided by repository facts (Pact artifacts, dependencies, configuration, broker variables) or by a phrase match on an explicit request, which no case exercises.

## What is a semantic decision

Exactly one condition needs reading natural language: `skills/bmad-tea-test-design/steps-c/step-02-load-context.md` line 155 loads `nfr-criteria.md` when the epic or story "includes security, performance, reliability, scalability, compliance, maintainability, or operational requirements".
The other candidate, "the task explicitly requests contract testing", appears in five step files. It is deterministic as a phrase match with negation handling, such as "no contract tests". No case exercises it without Pact repository facts also being present, so no case measures it and it does not qualify as a second semantic decision.

## Is there an adequate independent truth set

No.
The four epic-level `test-design` cases are the only ones where the NFR decision varies:

| Case                                      | `nfr-criteria.md` label | Reading of the scenario                                         |
| ----------------------------------------- | ----------------------- | --------------------------------------------------------------- |
| `test-design-epic-with-nfrs`              | `mustLoad`              | Tenant isolation and a 30 s budget: clear positive              |
| `test-design-epic-level`                  | unjudged                | The facts state no NFR: clear negative, no label                |
| `test-design-pact-consumer-is-a-frontend` | unjudged                | No NFR stated: likely negative, no label                        |
| `test-design-backend-junit`               | unjudged                | Poison-message path and replay idempotency: ambiguous, no label |

`mustLoad` and `mustNotLoad` judge only the fragments they name, so a fragment in neither list is unjudged.
Among the conditional epic-level cases the corpus holds one judged positive and zero judged negatives. The system-level case lists `nfr-criteria.md` because that mode always loads it.
That supports no precision, no threshold, and no exact-set agreement. Adding labels to these cases would change a scored corpus, which is a separate, independently reviewed decision.

## Reopen condition

Independently reviewed positive, negative, and ambiguous NFR scenarios exist as a held-out partition, with the NFR decision labelled on each.
Until then an inference pilot has no adequate truth set to qualify against. The one judged positive can catch an omission and supports nothing more.

## Policy to apply if a System One model is ever added

- Eligibility comes first: deterministic facts stay code; open-ended research and prose stay with the host worker; verdicts, security policy, authorization, and release decisions stay with the existing gates and the responsible parent.
- Provider order for an eligible decision: Jev when it is configured, available, qualified for that exact task, and authorized for that data; otherwise the active host's own small tier (Haiku on Claude, Luna on Codex), resolved at dispatch time and recorded; otherwise the existing parent path.
- An unknown active host gets Jev only when explicitly enabled and ready. There is no invented native fallback.
- A data-policy denial, a cancellation, or an invalid task contract stops the decision. Another provider receives the data only when its own authorization independently allows it. Cancellation suppresses every retry and fallback.
- A scored comparison fixes provider, model, target, and judge per arm. A failed trial is recorded as failed and stays on its arm.
- Choice probabilities and confidence summarize the answer distribution and say nothing measured about correctness. Each threshold belongs to one task and is calibrated again for another provider or choice-set size.

## Encoding and seam, recorded for the reopen

- Use one Choice question per candidate fragment with `include`, `exclude`, and `uncertain`. Jev's Noul primitive returns one yes probability with no separate confidence field, so abstention there would come from a task-calibrated threshold; Choice carries `uncertain` directly. The encoding is a proposal and no model call has compared Noul with Choice. Fix the encoding before any live run and tune it on development data only.
- The harness already accepts an external command: `--agent custom --agent-cmd <path>` on `test/eval-fragment-selection.js` reaches `cli/fragment-selection-runner.js`, which pipes the prompt to that command's stdin. A comparison wrapper fits there without touching `AGENT_ADAPTERS` or the default runner. Its stdout stays exactly `{ "fragments": [...] }`.
- Keep raw answers and uncertainty in a protected record outside stdout, apply the deterministic required-fragment rules after inference, and abstain to the parent when the answers conflict with a bundle rule.
