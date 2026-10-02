# answer-grader

An answer grading service. `POST /grade` takes a learner's answer and returns a `decision` and a `reason`.
The production deployment asks a vendor model to grade; `app/server/grade.mjs` applies the same policy from `app/rules/policy.json` and stands in for it in tests.

The package is published to the public registry about every six weeks, from a version tag.
See `docs/RELEASING.md` for the release steps and `CONTRIBUTING.md` for the merge rules.
`evals/answer-grade/` holds the behavioral evaluation of the grading feature.
