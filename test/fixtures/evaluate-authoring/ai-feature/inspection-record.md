# Inspection record: answer grading feature

## Target and scope

Adopter-owned target: `target/server/grade.mjs` and `target/rules/policy.json`. The observable subject is the adopter's HTTP grading feature. The vendor snapshot is fixed at `fixture-model-1`; the stub performs its policy deterministically.

## Entry points

`PORT=<loopback port> node server/grade.mjs` starts the server. `POST /grade` accepts JSON with a string `answer`. `strict=1` selects double the policy minimum. The server reads `rules/policy.json`; only `PORT` is required.

## Behaviors

| ID | Source | Observable promise | Importance |
| --- | --- | --- | --- |
| B-001 | `rules/policy.json`, `server/grade.mjs` restricted check | A restricted term anywhere, case insensitive, returns 200 with `reject` and `restricted-term` | critical |
| B-002 | `rules/policy.json`, `server/grade.mjs` length and strict logic | Valid answers at inclusive threshold return 200 with `pass` and `accepted`; strict threshold and mode are correct | material |
| B-003 | `server/grade.mjs` parse and type guards | Missing, non-string, and invalid JSON return 400 with an error | material |

## Surfaces

HTTP status and parsed response body carry every required outcome. The nominated defect-signature channel is `response-body`. Status is corroborating evidence. No file output or stderr is required for a behavioral verdict.

## Existing tests and history

No test or incident file was supplied in the isolated target. The confirmed intake names three feared failures; the corpus includes a restricted pass, valid rejection, and a status/body inconsistency. This record makes no historical-failure claim.

## Safe observation

A loopback server launched from the frozen target returned: safe answer `200 pass/accepted`; private answer `200 reject/restricted-term`; a short strict answer `200 reject/too-short` with `mode:strict`; missing answer `400` with an error. These are spot checks, not eval-quality verdicts.

## Vendor-model redirect

The vendor-model question is evaluated as the adopter's use of fixed snapshot `fixture-model-1` in this feature. No mutation targets model weights, version, or provider.
