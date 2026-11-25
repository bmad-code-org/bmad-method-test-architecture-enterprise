# Target handoff: refund-check

The evaluation found these target improvements and the adopter chose a separate pull request for them.
The next evaluation of the skill measures each one against the accepted baseline with `tea-evaluate compare`.

## T-002: a request that is not text is not covered

- **Target:** `skill/SKILL.md`.
- **Evidence:** `requirements.md` says "A request with no amount and limit, or one that is not text, is refused."; SKILL.md covers only the first case.
- **Proposed change:** add "when the request is not text, reply `{"status": "refused"}`."
- **Measured by:** P-003, the malformed-request clean control of B-002, before and after the change.
