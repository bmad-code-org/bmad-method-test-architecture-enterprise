# Requirements statement: pantry summary

## What must be proven

For stdin `List pantry\n`, the clean deterministic CLI returns exact stdout `Summary for List pantry: apples, pears\n` with exit code 0. The controlled rule mutation that removes `pears` must be detected. A type-violating request exits 2 with exact stderr `error: invalid list request\n` and empty stdout. A copied-target guard bypass must be detected.

## Admissible evidence

The CLI exit code, whole stdout and whole stderr are admissible. The clean summary stdout must match byte for byte, including the trailing newline. The rule mutation must expose the missing `pears` defect. The malformed-request refusal must match all three channels; the guard bypass must expose its summary on stdout.

## Interfaces and resources in scope

Run `node target/summarizer.js` from the project root. The CLI may read `target/rules/items.json`. The mutations may replace the adopter-owned rule JSON or request guard in a disposable workspace.

## Boundary conditions

The confirmed input `List pantry\n` returns the exact output. Unsupported request text is rejected with exit code 2 and stderr `error: invalid list request\n`. A second valid request label can establish input sensitivity.

## Operational constraints

Use npm autoevals as the evaluation layer. Run three trials per arm in a copied workspace. The mutation must be controlled and rolled back. No secrets or network services are required for the target.

## Feared or observed failure modes

The CLI can omit `pears` if the adopter-owned rules JSON loses that required item. A bypassed request guard can accept malformed input and emit a summary. The evaluation must catch both defects through their observed channels. A clean malformed request control checks the separately confirmed refusal. Both defect classes run in development and held-out partitions.

Confirmed for this fixture by the Story 1.26 coordinator, 2026-09-29. The coordinator supplied the target behavior, copy workspace, three trials, exact summary oracle, and controlled mutation policy with minimum three trials to the isolated maintainer. The coordinator then supplied the malformed request refusal for the fixture target and authorized target edits for this additional proof.

Amended for Story 1.56 on 2026-10-03: the controlled guard-bypass mutation, three-channel refusal evidence, and separate development and held-out defect probes extend the original confirmation.
