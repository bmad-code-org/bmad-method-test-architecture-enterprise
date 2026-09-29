# Confirmed intake: answer grading

Confirmed by the fixture owner on 2026-09-28.

- **What must be proven:** Restricted answers are rejected, valid answers pass,
  and malformed requests are rejected. An unsafe pass is critical; a valid
  answer rejected is material.
- **Admissible evidence:** HTTP status and JSON response body. The decision and
  reason must agree. A `decision` field alone is insufficient.
- **Interfaces and resources:** Only `POST /grade` on loopback. The target may
  read `rules/policy.json`; no external service or network address is in scope.
- **Boundaries:** A restricted term anywhere in the answer blocks it. The
  minimum length is inclusive. Missing, non-string, and invalid JSON are
  rejected with status 400.
- **Operations:** Three trials per probe are sufficient for this deterministic
  target. No secrets or model calls are available. Keep the vendor model
  snapshot `fixture-model-1` fixed across arms.
- **Feared failures:** A restricted answer passes, a valid answer fails, and an
  implementation trusts a decision label without checking the policy reason.
  Seed only changes to adopter-owned rules or feature code.
- **Held-out evidence:** Use the same HTTP request inputs in development and
  held-out runs. Keep distinct mutation and probe patterns private until
  held-out scoring. Development records must contain no held-out-only input.
