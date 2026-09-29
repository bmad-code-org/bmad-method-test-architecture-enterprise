# Evaluator selection

Choose TeA `deterministic` with eval-quality `resolveCheck`. The target response has finite status, decision, reason, mode, and error fields. Exact predicates cover them without a model judge. The fixed vendor snapshot is a target condition. The evaluator adds no model, credentials, reference output, framework wrapper, licence dependency, or variable per-trial cost. TeA and eval-quality versions must be recorded when installed by the maintainer. The HTTP adapter preserves status and parsed body. Execute one known pass and one seeded fail during preflight before accepting it.

The contract requires status and reason beside decision, so a label-only response cannot pass. External answer-grading frameworks add version drift and cannot improve this finite oracle. Rubrics and calibration are unnecessary for this policy fixture.
