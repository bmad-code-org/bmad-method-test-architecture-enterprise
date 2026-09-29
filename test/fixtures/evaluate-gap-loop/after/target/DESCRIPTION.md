# Test review command

`node bin/review.mjs` reads one JSON object from stdin with `action: "review"`
and a `file` string containing the path of a JavaScript test file. It prints
one JSON object on stdout. The `rules/review.json` file lists recognized
assertion forms and disabled-test markers. A file with no active assertion receives a
`missing-assertion` finding. A disabled test receives a `disabled-test`
finding. The `status` field is `findings` when any finding exists and `clean`
otherwise. A clean test has no findings. Absent input, invalid JSON, a missing
or non-string `file`, a missing or different `action`, extra request fields,
and unreadable files return an `error` JSON object with exit 0.

The rule matcher is intentionally small. The fixture files use clear assertion
and disabled-test syntax.
