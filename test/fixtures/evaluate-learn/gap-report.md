# Pantry summary evaluation gap report

## Scored development evidence

- Initial development invocation `20260929T092115944Z-94807bfb`, score `20260929T092159607Z-a9db778c`: P-001 `passed-clean-control` in trials 1, 2, and 3; P-002 `caught` in trials 1, 2, and 3. The P-002 defect component was comparable with rate 1. The engine contract verdict was `CONCERNS`. Unsatisfied discipline flags were `success-indicator-separation`, `malformed-input`, `per-record`, and `omission-and-completeness`.
- Repair development invocation `20260929T093052969Z-b3ebe08e`, score `20260929T093129254Z-691e56d2`: P-001 and P-004 each resolved `passed-clean-control` in trials 1, 2, and 3. P-002 resolved `caught` in trials 1, 2, and 3. Its defect component was comparable with rate 1. The `malformed-input` flag closed. The engine verdict remains `CONCERNS` for the three flags below.
- Final development invocation `20260929T093555821Z-6244098c`, score `20260929T093631755Z-64674f30`: P-001 and P-004 remained `passed-clean-control` in trials 1, 2, and 3. P-002 remained `caught` in trials 1, 2, and 3, with comparable defect rate 1. A truthful `collectionLocations: []` declaration closed the `per-record` and `omission-and-completeness` flags. The engine verdict remains `CONCERNS` for `success-indicator-separation` alone.
- Final held-out invocation `20260929T093647632Z-4b2e3946`, score `20260929T093713131Z-c63d12c2`: `gap-view.json` reports P-003 `caught` in trials 1, 2, and 3, with `caughtCount: 3`, `validCount: 3`, and no invalidated attempts. Held-out inputs and records were not used to tune the repair.

## Repair and remaining scope

The coordinator, acting as this fixture's adopter, supplied the malformed request refusal. `target/summarizer.js` now rejects such requests. A second planned interaction sends the engine's `type-violating` input and O-002 checks exit code 2, the full stderr diagnostic, and empty stdout. P-004 guards this clean behavior. An exploratory guard-bypass mutation exposed an unwitnessed failure row because its stdout quote was outside O-002's evidence targets. O-002 now names and checks stdout. The exploratory mutation and its probes were removed to honor the final one-mutation boundary. The final scored development run has no invalidated attempts.

The final remaining engine flag describes evidence the target does not emit:

| Engine rule | Observed target surface and limit |
| --- | --- |
| `success-indicator-separation` | The CLI emits an exit code and one substantive plain-text summary. It has no separate success claim field in its stdout descriptor. O-001 independently checks exit code 0 and the entire answer. |

The response descriptor now declares `collectionLocations: []`, because stdout is a scalar text line. The engine consequently no longer reports `per-record` or `omission-and-completeness` as unsatisfied. O-001 still compares the whole summary byte for byte, and M-001 demonstrates the missing `pears` is detected.

No waiver was claimed. A waiver requires an adopter-approved machine-checkable condition and expiry. The current engine provides per-probe strength artifacts and no run-wide `strengthFloor` gate. The measured result proves the nominated pears-removal mutation was caught in its three development and three held-out trials; it does not establish a class-wide detection rate.
