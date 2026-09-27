# Requirements statement: reservation review

## What must be proven

The skill approves eligible requests with the controlling rule cited (B-001). It declines over-limit requests and makes no reservation call for them (B-002, critical).

## Admissible evidence

The skill runner's stdout and exit code, plus the recorded tool-call trajectory, may establish a result. A receipt file may corroborate it. A keyword in a response alone cannot establish a correct decision.

## Interfaces and resources in scope

Use the skill runner over `skills/reservation-review/` and the test reservation tool. Read only the skill's rules and fixture requests. Production reservation services are outside this evaluation.

## Boundary conditions

Test the exact limit, one unit below it and one unit above it. Include a missing amount and a nonnumeric amount as malformed requests. A request at the limit is eligible.

## Operational constraints

Run in a disposable copy with a 30 second command ceiling. Use fixture credentials only. Make at most ten tool calls per trial; run no production request or secret-bearing log.

## Feared or observed failure modes

The skill may approve an over-limit request, decline every request, cite a rule that does not apply, make a reservation call before checking the limit or silently accept a malformed amount.

Confirmed by: adopter name and date must replace this line before corpus design.
