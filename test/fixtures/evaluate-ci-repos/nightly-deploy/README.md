# answer-grader

An answer grading service. `POST /grade` takes a learner's answer and returns a `decision` and a `reason`.
The production deployment asks a vendor model to grade, with the key in `GRADER_MODEL_KEY`; `app/server/grade.mjs` applies the same policy from `app/rules/policy.json` and stands in for it in tests.

The service is deployed to production every night from `main`.
See `docs/DEPLOYING.md` for the deploy and rollback steps and `CONTRIBUTING.md` for the merge rules.
`evals/answer-grade/` holds the behavioral evaluation of the grading feature.
