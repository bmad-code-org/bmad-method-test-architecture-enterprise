# Story 9.1: Witness-only story (sensitivity witness fixture)

Status: ready-for-dev

## Story

As the eval-quality sensitivity witness for the atdd contract,
I want a story naming a criterion no other fixture story names,
so that two prompts differing only in which story they point at produce
scaffolds naming different criteria, which is a true and checkable claim
that the command reads its standard input.

This story is not part of the scored corpus. `test/eval-atdd.js` never stages
it, and `tools/generate-contracts.js` binds it into the atdd contract's
sensitivity witness alone.

## Acceptance Criteria

1. **AC-9: A witness endpoint exists.** `GET /witness` responds `200` with the
   JSON body `{ "witness": true }`.
