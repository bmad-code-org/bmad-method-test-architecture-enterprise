---
title: "Story 1.33: Record eval-quality's denial reason for every denied call"
type: 'chore'
created: '2026-09-30'
status: 'in-review'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '1a02f227'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** Stories 1.10 and 1.11 record eval-quality's `reason` beside the `forbidden-target` code for `cli`, `mcp` and `api` denials, but the reference names the reason codes only inside a paragraph, so no test holds the list and nothing tells an adopter which codes exist.

**Approach:** Give the reference its own `### Denial reasons` section, a table of the eleven reasons eval-quality's target policies decide, and hold it with a `test:evaluate-evaluators` case that reads the section by its exact heading.

</frozen-after-approval>

## Implementation Notes

- Delivered before this story: Story 1.10 (`reason` recorded in a bridge call, a leg's `faults/` file, a qualification's fault and a trial's fault, for every kind; `test:evaluate-evaluators` `executable-not-authorized` and `interface-not-authorized`, `test:evaluate-preflight` a leg's `interface-not-authorized`, `test:evaluate-mcp` `tool-not-authorized`) and Story 1.11 (`test:evaluate-api` `address-not-authorized` in a qualification, a leg, a trial and a bridge call, `method-not-authorized` in a bridge call). No runtime file changed here.
- `docs/reference/tea-evaluate-cli.md`: the paragraph that listed the codes moved out of the registry section into `### Denial reasons`, placed before `## The HTTP port`, as a table of the eleven codes with what each denies.
- `test/test-evaluate-evaluators.js`: `checkReferenceNamesDenialReasons` asserts the heading appears once, names each code, and names no reason-shaped code outside the list held in the test.
- The eleven codes are the ones present in the installed eval-quality 4.3.0 `dist/`.
- `epics.md` and `test-design-epic-1.md` carry the amendment.

## Revert observations

- Removing `subcommand-not-authorized` from the section: `test:evaluate-evaluators` fails naming it. Renaming the heading fails all eleven codes and the once-only check.
- Dropping `reason` in `cli/lib/evaluate/arm.js` (the fault projection): `test:evaluate-mcp` fails its qualification and leg cases. Dropping it in `sealed-brief-agent.js` (the bridge's denial record): `test:evaluate-evaluators` fails the bridge outcomes, `denied:forbidden-target:undefined`. Both restored.

## Gates

Filled in at completion.
