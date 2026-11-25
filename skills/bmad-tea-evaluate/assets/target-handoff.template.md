# Target handoff: reservation review skill

The evaluation found these improvements to the target, and the adopter chose a separate pull request for them.
The next evaluation measures each one: its pull request reruns the evaluation, and `tea-evaluate compare` against the accepted baseline reports the before and after.
Replace each example line with the facts of the `new-pr` findings in `target-findings.json`, one section per finding.

## T-002: the limit is not checked before a reservation is attempted

- **Target:** `skills/reservation-review/SKILL.md`.
- **Evidence:** `requirements.md` says "An over-limit request is declined without attempting a reservation."; SKILL.md never says when to call the reservation tool.
- **Proposed change:** check the limit before calling the reservation tool, and decline an over-limit request without calling it.
- **Measured by:** P-005, the B-002 defect probe, and P-002, its clean control, before and after the change.
