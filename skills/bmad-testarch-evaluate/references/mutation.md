# Mutation

Choose one defect in the adopter's use of the target. Start with the behavior, a clean observation, and a descriptor-nominated channel. Change one source in a disposable copy. Confirm baseline pass, mutated failure, and a performed rollback that restores both the original bytes and passing behavior. The runtime records `rollbackVerified` from that performed check.

Write `mutations/M-NNN.mutation.json`. The `mutationId` matches its file name; `targetArtifact` is relative to `launch.root`. The only operator is `replace-exact` with `occurrences: 1`. After adding indexed corpus files, run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate digest --evaluation <evaluation-folder>` to refresh `corpus-index.json`, then `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation <evaluation-folder>` before qualification. For TeA's own package, use `node cli/evaluate.js` with the same subcommands and arguments from the repository root. A probe's `defectSignature` addresses an exit code, descriptor-nominated stdout or stderr, HTTP response body, or MCP result. Refuse a defect visible only in a written file or an unrecorded channel, and record the reason. Find the single source of the behavior: a rule restated in several files can survive a one-file mutation.

These fictional examples name a behavior, expected observable failure, and signature channel. Replace each `find` string with exact text verified to occur once in the adopter's target. Pair each mutation with a clean observation and a seeded probe that declares its signature on the stated channel. A mutation that does not manifest is an evaluation weakness.

## Weaken or remove a prompt instruction

B-001 requires declining an over-limit reservation. Remove the prompt instruction. Expect an approval on stdout; sign the descriptor-nominated stdout.

<!-- example:mutation -->

```json
{
  "schemaVersion": 1,
  "mutationId": "M-001",
  "mutationSource": "prompt instruction removal for B-001",
  "targetArtifact": "skills/reservation-review/SKILL.md",
  "operator": {
    "kind": "replace-exact",
    "find": "Decline requests above the reservation limit.",
    "replace": "Approve requests above the reservation limit.",
    "occurrences": 1
  },
  "expectedObservableFailure": "over-limit request approved on stdout"
}
```

## Remove required context

B-002 requires reading `references/limits.md`. Remove its prompt reference. Expect stdout to omit the applicable limit; sign stdout.

<!-- example:mutation -->

```json
{
  "schemaVersion": 1,
  "mutationId": "M-002",
  "mutationSource": "missing context for B-002",
  "targetArtifact": "skills/reservation-review/SKILL.md",
  "operator": {
    "kind": "replace-exact",
    "find": "Read references/limits.md before deciding.",
    "replace": "Decide from the request alone.",
    "occurrences": 1
  },
  "expectedObservableFailure": "stdout omits the required limit"
}
```

## Drop a validation step

B-003 requires rejecting malformed amounts before creating a reservation. Bypass the adopter's guard. Expect the HTTP response body to show acceptance; sign `responseBody`.

<!-- example:mutation -->

```json
{
  "schemaVersion": 1,
  "mutationId": "M-003",
  "mutationSource": "validation bypass for B-003",
  "targetArtifact": "src/reservation-handler.js",
  "operator": {
    "kind": "replace-exact",
    "find": "if (!validAmount(input.amount)) return rejectInvalid();",
    "replace": "if (false) return rejectInvalid();",
    "occurrences": 1
  },
  "expectedObservableFailure": "malformed amount accepted in HTTP response body"
}
```

## Alter a tool result

B-004 requires the adopter-owned reservation tool to deny an over-limit request. Corrupt the fixture that supplies its answer from denied to approved. Expect the calling agent's stdout trajectory to show a create call for the over-limit request; sign stdout, since the fixture is not an observation.

<!-- example:mutation -->

```json
{
  "schemaVersion": 1,
  "mutationId": "M-004",
  "mutationSource": "tool result corruption for B-004",
  "targetArtifact": "fixtures/reservation-tool.json",
  "operator": { "kind": "replace-exact", "find": "\"decision\":\"denied\"", "replace": "\"decision\":\"approved\"", "occurrences": 1 },
  "expectedObservableFailure": "stdout trajectory includes a create call for an over-limit request"
}
```

## Change the agent configuration

B-005 limits the agent to the read tool. Change its adopter-owned allowlist. Expect a forbidden call in the stdout trajectory; sign stdout. Keep the model snapshot fixed.

<!-- example:mutation -->

```json
{
  "schemaVersion": 1,
  "mutationId": "M-005",
  "mutationSource": "agent configuration change for B-005",
  "targetArtifact": "agent/config.json",
  "operator": {
    "kind": "replace-exact",
    "find": "\"allowedTools\":[\"reservation-read\"]",
    "replace": "\"allowedTools\":[\"reservation-read\",\"reservation-write\"]",
    "occurrences": 1
  },
  "expectedObservableFailure": "stdout trajectory includes unauthorized reservation-write"
}
```

## Break a state write or its read-back

B-006 requires saving a decision and reading it back. Remove the write. Expect the following GET response body to lack the decision; sign `responseBody`. A separate edit can break the read-back.

<!-- example:mutation -->

```json
{
  "schemaVersion": 1,
  "mutationId": "M-006",
  "mutationSource": "missing state write for B-006",
  "targetArtifact": "src/reservation-store.js",
  "operator": { "kind": "replace-exact", "find": "await store.save(decision);", "replace": "await Promise.resolve();", "occurrences": 1 },
  "expectedObservableFailure": "read-back HTTP response body lacks saved decision"
}
```

## Remove a test-review smell rule

B-007 requires flagging a keyword-only assertion. Disable that rule in the adopter's review configuration. Expect the stdout report to omit the finding; sign stdout.

<!-- example:mutation -->

```json
{
  "schemaVersion": 1,
  "mutationId": "M-007",
  "mutationSource": "smell rule removal for B-007",
  "targetArtifact": "review/smells.json",
  "operator": {
    "kind": "replace-exact",
    "find": "\"keyword-only-assertion\":true",
    "replace": "\"keyword-only-assertion\":false",
    "occurrences": 1
  },
  "expectedObservableFailure": "stdout report omits keyword-only assertion finding"
}
```

## Refuse vendor changes

Refuse a model-weight edit, provider switch, or mutation of a vendor dependency itself. Record the reason, then ask which adopter-owned prompt, context, wiring, validation or state behavior should be tested. Record the vendor model as a fixed condition in `policy/evaluator-conditions.json` across both arms.
