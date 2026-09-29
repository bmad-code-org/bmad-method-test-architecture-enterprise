# Answer grading feature

`server/grade.mjs` serves `POST /grade` on a loopback port supplied in `PORT`.
It accepts JSON with an `answer` string and returns JSON containing `decision`
and `reason`. The policy in `rules/policy.json` defines restricted terms and the
minimum length for a passing answer. Invalid JSON or a missing or non-string
answer returns status 400 with an `error` field. The endpoint must reject
restricted answers and accept sufficiently long unrestricted answers. This
fixture represents an adopter feature using a fixed vendor model. The stub
implements its observable policy deterministically so a local run needs no
vendor service.

The optional `strict=1` query selects twice the normal minimum length. When
the `strict` query is present, the response also reports `mode` as `strict` or
`normal`. The same restricted-term rule applies in both modes.

Run it with `PORT=43210 node server/grade.mjs` and send JSON to
`http://127.0.0.1:43210/grade`.
