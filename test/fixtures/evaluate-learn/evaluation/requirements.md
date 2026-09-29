# Requirements statement: pantry summary

## What must be proven

For stdin `List pantry\n`, the clean deterministic CLI returns exact stdout `Summary for List pantry: apples, pears\n` with exit code 0. The controlled rule mutation that removes `pears` must be detected.

## Admissible evidence

The CLI exit code and stdout are admissible. The clean stdout must match byte for byte, including the trailing newline. The mutated stdout must expose the missing `pears` defect.

## Interfaces and resources in scope

Run `node target/summarizer.js` from the project root. The CLI may read `target/rules/items.json`. The mutation may replace this adopter-owned JSON in a disposable workspace.

## Boundary conditions

The confirmed input `List pantry\n` returns the exact output. Unsupported request text is rejected with exit code 2 and stderr `error: invalid list request\n`. A second valid request label can establish input sensitivity.

## Operational constraints

Use npm autoevals as the evaluation layer. Run three trials per arm in a copied workspace. The mutation must be controlled and rolled back. No secrets or network services are required for the target.

## Feared or observed failure modes

The CLI can omit `pears` if the adopter-owned rules JSON loses that required item. The evaluation must catch this defect through stdout. A clean malformed request control checks the separately confirmed refusal. The committed mutation set is limited to the pears-removal rule change.

Confirmed for this fixture by the Story 1.26 coordinator, 2026-09-29. The coordinator supplied the target behavior, copy workspace, three trials, exact summary oracle, and controlled mutation policy with minimum three trials to the isolated maintainer. The coordinator then supplied the malformed request refusal for the fixture target and authorized target edits for this additional proof.
