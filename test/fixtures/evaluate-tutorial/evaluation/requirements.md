# Requirements statement: refund check

## What must be proven

The refund-check skill approves a refund whose amount is exactly the limit (B-001, critical). It refuses a request that gives no amount and limit (B-002, material).

## Admissible evidence

The skill runner's stdout is admissible. The skill replies with one JSON object, and the evaluation reads its `status` and `decision` fields.

## Interfaces and resources in scope

Use `tea-skill-runner` over `skill/`. The agent behind it reads only the skill and the request.

## Boundary conditions

A refund of 100 against a limit of 100 is eligible. The limit is inclusive. A request with no amount and limit, or one that is not text, is refused.

## Operational constraints

Run in a disposable copy with a 30 second command ceiling. The run needs no secret, no network access and no model.

## Feared or observed failure modes

An edit to the skill's wording can turn the inclusive limit into an exclusive one, so the skill declines a refund exactly at the limit.

Confirmed by: tutorial reader, 2026-10-07.
