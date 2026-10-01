---
title: "Story 1.62: Share one sandbox primitive layer across TeA's isolation modules"
type: 'refactor'
created: '2026-10-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '49f4e5d5e1bc0ba795775664a738491e3bc034bf'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.62)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.62 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-5, AD-7)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `cli/lib/isolate.js`, `cli/lib/atdd-isolation.js` and `cli/lib/evaluate/confinement.js` each carry their own copy of four sandbox primitives: the executable lookup on `PATH`, the check that a path can be carried into a Seatbelt profile or a Bubblewrap argument vector, the containment test and the probe of a trivial process. The copies already disagree. `confinement.js` refuses a backslash, which a Seatbelt string literal treats as an escape, and the other two accept it. `isolate.js` treats a directory named `..data` as outside its root. A fix to one copy does not reach the others.

**Approach:** one module, `cli/lib/isolation-primitives.js`, owns the four primitives and the three modules import it. Each module keeps its own error class and message text through a caller-supplied factory, so nothing an adopter or a suite reads changes. A static case in a new `test:isolation-primitives` script fails when a module defines a primitive again, and a golden case holds every profile and argument vector each module generates byte-identical to what it generated before the move.

## Boundaries & Constraints

**Always:** each module's own suites pass unchanged. Profiles and argument vectors are byte-identical for every input the golden covers. One unsafe-path rule for all three callers: the value is a string, absolute, and holds no double quote, backslash, line break or other control character. `confinement.js` keeps `ConfinementError`, `isolate.js` keeps `ISOLATION_ERROR`, `atdd-isolation.js` keeps `ISOLATION_UNAVAILABLE`, each with its current message text. The new script joins the `npm test` chain and `tools/test-shard-weights.json`. CHANGELOG entry under `[Unreleased]`. The engine check runs at start and end.

**Never:** a behavior change to backend selection, to what a profile allows or denies, or to what a probe spawns beyond the shared trivial process. The shared module imports nothing from the three modules. No new dependency. No eval-quality change.

## I/O & Edge-Case Matrix

| Scenario           | Input / State                                                                                                | Expected Output / Behavior                         | Error Handling                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------- |
| Profile unchanged  | fixed paths through each module's generator, `fs.realpathSync` stubbed                                       | output equals the golden captured before the move  | a changed rule or argument fails the comparison |
| Unsafe path        | a path holding a quote, backslash, line feed, carriage return, tab or NUL, through each of the three callers | each caller refuses it with its own error class    | a caller on its own check lets one through      |
| Local copy returns | any of the three modules defines a lookup, a path check, a containment test or a probe                       | the static case names the module and the primitive | none                                            |
| Lookup             | a name present as a directory, as a non-executable file, as an executable file                               | only the executable file resolves                  | none                                            |

</frozen-after-approval>

## Code Map

- `cli/lib/isolate.js` -- `executableOnPath` (boolean), `assertProfileSafePath` (quote, line break), `isInside` (strictly inside, `startsWith('..')`); exports `withIsolation`, `selectBackend`, `buildSandboxProfile`, `buildBwrapPrefix`.
- `cli/lib/atdd-isolation.js` -- `executableOnPath` (boolean), `assertProfileSafePath` (returns the path), `probeBackend` (spawns a trivial process, formats the failure).
- `cli/lib/evaluate/confinement.js` -- `isInside` (inclusive), `profileSafe` (absolute, quote, backslash, line break), `executableOnPath` (returns the path, requires a regular file), `probeMechanism` (spawns a trivial process, formats the failure), and two inline copies of the unsafe-character regex in `selectConfinement`.
- `test/test-test-review-cli.js` (`test:cli`), `test/test-atdd-isolation.js`, `test/test-evaluate-run.js` -- the unchanged suites that gate the move.
- `package.json`, `tools/test-shard-weights.json`, `.github/workflows/quality.yaml` -- script, weight and shard wiring (`test:ci-coverage`, `test:shards`).
- New: `cli/lib/isolation-primitives.js`, `test/test-isolation-primitives.js`, `test/fixtures/isolation-primitives/golden.json`.

## Tasks & Acceptance

**Execution:**

- [ ] `test/fixtures/isolation-primitives/golden.json` -- capture each module's profiles and vectors from the pre-move code, before any module edit -- the byte-identity baseline
- [ ] `cli/lib/isolation-primitives.js` -- executable lookup (a regular executable file, returns its path or null), unsafe-path check (`assertProfileSafePath(candidate, fail)`), inclusive containment, trivial-process probe returning `{ ok, error, status, signal, tail }` -- the one home
- [ ] the three modules -- import the primitives, delete the local copies, keep error classes and wording through the factory and a local formatter
- [ ] `test/test-isolation-primitives.js` -- golden comparison, unsafe-character matrix through all three callers, lookup cases, static scan for local copies with its restore-a-copy negative cases
- [ ] `package.json`, `tools/test-shard-weights.json`, `CHANGELOG.md`, sprint-status row -- wiring and record

**Acceptance Criteria:**

- Given the three modules after the move, when the golden case regenerates their outputs for the fixed inputs, then every profile and argument vector equals the golden.
- Given a copy of a primitive restored in any one module, when `test:isolation-primitives` runs, then the static case fails naming the module.
- Given a path with any unsafe character, when each of the three callers receives it, then each refuses it; a caller reverted to its own check lets a character through and the case fails.

## Implementation Notes

Built by the coordinator directly (Sonnet 5.5), not through a dispatched subagent, after the investigation had already loaded all three modules.

- `cli/lib/isolation-primitives.js` exports `executableOnPath`, `isProfileSafePath`, `assertProfileSafePath(candidate, fail)`, `isInside`, `probeTrivialProcess`, `TRIVIAL_PROCESS`, `stderrTail` and `PROBE_TIMEOUT_MS`. The callers keep their error classes and wording through the `fail` factory and local message formatters.
- The probe's `spawnSync` options follow `confinement.js`'s (`stdio: ['ignore', 'ignore', 'pipe']`, `SIGKILL` on timeout). `atdd-isolation.js` now also kills a hung probe with `SIGKILL`, ignores its stdin and stdout, and runs `node -e ''` where it ran `node -e 'process.exit(0)'`.
- The executable lookup wants a regular file. `isolate.js` and `atdd-isolation.js` used to accept any path entry that passed `X_OK`, a directory included, so a directory named `bwrap` or `sandbox-exec` on `PATH` no longer selects a backend there.
- `selectConfinement` finds `sandbox-exec` through the shared lookup over its fixed directory, and the failed-start message of a Bubblewrap target uses `stderrTail`, so `confinement.js` holds no `X_OK` and no tail logic.
- The two confinement refusals that name unsafe characters read "a quote, a backslash or a line break (or another control character)", which keeps the substring `test:evaluate-run` asserts and stays true for the control characters the shared rule now refuses. The reference carries the same wording.
- `README.md` count of the `npm test` chain moved from ninety-eight to ninety-nine.
- The golden (`test/fixtures/isolation-primitives/golden.json`) was captured from the unmodified modules before any edit, through `test/lib/isolation-golden.js`, which fixes the link map `realpathSync` sees and `/run/user`'s existence so macOS and Linux produce the same bytes.
- Not shared on purpose: `spellings` (it uses `realpathSync.native` in one module and `realpathSync` in the other two, and moving it would change generated bytes on a case-insensitive volume), backend selection, and each module's message text.

## Review round 1 (Opus, two lenses)

- Adversarial lens, one finding, valid: `buildSandboxProfile` in `isolate.js` checked the resolved spelling of each path and added `realpathSync` of it unchecked, so a link to a path holding a quote reached the profile. Fixed: every entry of the allowed set is checked, and a link case joins the matrix. `buildBwrapPrefix` checked no path, so both of its paths are checked now.
- Test and compliance lens, six findings, all valid and fixed: the scan in `test/test-isolation-primitives.js` was easy to rewrite around, so each module is now loaded over a shared module whose primitives count their calls and driven, with a name scan beside the pattern scan, and the comment stripper no longer reads a `/*` inside a string as a comment; the golden named `/usr/bin/node`, which a Linux host can have as `process.execPath`, so the fixture command is `/fixture/bin/node`; the path matrix reached six `confinement.js` call sites with no case, so `targetSandbox` and `selectConfinement` (evaluation folder and temp directory) join it; the story file failed `format:check` and `lint:md`; the CHANGELOG entry claimed more than the code does; the shard weight read 1.0 for a 0.1 second script.

## Revert observations

- Golden: changing `(allow file-write*\n` to `(allow file-write* \n` in `isolate.js` fails `isolate.buildSandboxProfile` and `isolate.buildSandboxProfile.tmpOnly` against the golden. Restored.
- Static: appending a local `isInside` to `atdd-isolation.js` fails "cli/lib/atdd-isolation.js defines no primitive of its own". Restored.
- Path rule: putting `isolate.js`'s old quote-and-line-break check back in place of the shared call fails the backslash, tab, NUL and escape cases for `isolate.buildSandboxProfile`. Restored.
- Round 1: dropping the check on the profile entries in `isolate.js` fails the double quote, backslash and line feed cases of `isolate.buildSandboxProfile` (and the link case); dropping it in `seatbeltTargetProfile` in `confinement.js` fails the `targetSandbox` workspace cases. Restored.

## Spec Change Log

## Review Triage Log

## Design Notes

The golden stubs `fs.realpathSync` (and `.native`) with a fixed link map (`/tmp` to `/private/tmp`, `/var` to `/private/var`) and `fs.existsSync('/run/user')`, so the vectors hold the same on macOS and Linux. The random status file name under Bubblewrap is normalized before comparison.

Two latent differences become one rule on purpose: a backslash in a path is now refused by `isolate.js` and `atdd-isolation.js` (a Seatbelt string literal reads it as an escape), and `isolate.js` no longer treats a name that merely starts with two dots as outside its root.

## Verification

**Commands:**

- `npm run test:isolation-primitives` -- expected: exit 0
- `npm run test:cli && npm run test:atdd-isolation && npm run test:atdd-net-guard && npm run test:framework-scaffold-install-isolation && npm run test:evaluate-run && npm run test:evaluate-mcp && npm run test:evaluate-api` -- expected: exit 0
- `npm test` -- expected: exit 0
