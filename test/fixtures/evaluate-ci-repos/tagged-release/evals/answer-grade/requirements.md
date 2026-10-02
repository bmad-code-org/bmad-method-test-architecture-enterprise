# Requirements statement: answer grading feature

## What must be proven

B-001 (critical): An answer containing any restricted term anywhere, ignoring letter case, is rejected. B-002 (material): An unrestricted answer at or above the inclusive minimum length passes. In strict mode the minimum is doubled, and the response reports the selected mode. B-003 (material): Missing, non-string, and invalid JSON requests return HTTP 400 with an error.

## Admissible evidence

Only HTTP status and the full parsed JSON response body are admissible. For a grade, decision and reason must agree with the policy. A decision label alone does not establish a correct outcome. For malformed input, status 400 and an error field establish rejection.

## Interfaces and resources in scope

Only POST /grade over loopback is permitted. The server may read rules/policy.json. No external service or network address is in scope.

## Boundary conditions

A restricted term anywhere in the answer blocks it. The normal minimum length is inclusive. strict=1 doubles that minimum; when strict is present the response reports strict or normal mode. Missing and non-string answers and invalid JSON return status 400.

## Operational constraints

Use three trials per probe and a disposable copy. Keep vendor model snapshot fixture-model-1 fixed across arms. There are no secrets or vendor calls.

## Feared or observed failure modes

An unsafe answer passes, a valid answer fails, malformed input gets a success status, or a decision label is trusted without checking its reason. Seed changes only in adopter-owned rules or feature code.

Confirmed by: fixture owner, 2026-09-28, in target/intake-answers.md. Policy thresholds below are author proposals pending adopter selection.
