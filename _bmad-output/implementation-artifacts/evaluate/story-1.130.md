---
title: 'Story 1.130: Retry and verify the actionlint download so a GitHub outage cannot fail a shard'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f56d0c84a31e5b7dedc4d11ca96c03ab8f482728'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.130)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.130 section)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.113.md (the record format)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** The `Install actionlint` step of `.github/workflows/quality.yaml` (the `chain` job) and of `.github/workflows/publish.yaml` fetches a download script pinned by commit, checks its sha256 and runs it.
The pinned script then runs `curl -L "$url" | tar xvz -C "$target_dir" actionlint`, with no `-f`, no retry and no check of what arrived.
During a GitHub 503 window the body is an error page, `tar` reports `gzip: stdin: not in gzip format`, and the whole shard fails before any test runs (PR #321, chain shard 1).
The owner counts CI flakiness as a defect.

**Premise (read in the pinned script, commit `3795ba2f`, sha256 `a96d6013...`, and confirmed):** the script's version defaults to a hard-coded `1.7.12`.
Its `latest` keyword resolves nothing: with no argument or with `latest` it downloads 1.7.12.
The only network call that matters in it is the release tarball line, `https://github.com/rhysd/actionlint/releases/download/v<version>/actionlint_<version>_<os>_<arch>.tar.gz`; the release also publishes `actionlint_<version>_checksums.txt`.
`https://github.com/rhysd/actionlint/releases/latest` redirects to `/releases/tag/v1.7.12` today, so a floating version and 1.7.12 agree now.

**Approach:** one shared installer, `tools/install-actionlint.sh`, which both workflows call, so the retry exists once and the integration test runs the shell the workflows run.
It fetches the commit-pinned script with retry and checks its sha256, resolves the latest tag from the `/releases/latest` redirect with retry, and runs the script for that version with a `curl` in front of `PATH`.
That `curl` passes every call to the real one except the release tarball, which it downloads with retry, checks with `gzip -t` and against the release's checksum file, and writes to the script's `tar` only when it passed.
A final failure names the attempts, the last HTTP status and whether the body was a gzip file.

## Boundaries & Constraints

**Always:** the download script stays pinned by a 40-hex commit and checked against a 64-hex sha256; the version floats to latest by way of the installer's own resolution; seven attempts (the criterion's at least five) with a wait of 2, 4, 8, 16, 32 and 64 seconds, so an outage of about two minutes does not fail a shard; every transient `curl` error, non-2xx status, truncated body and non-gzip body is a failed attempt; the step stays inside its limit (the waits of one run total 126 seconds at most, a run stops retrying after 170 seconds, the worst case is about 274 seconds, and the step carries `timeout-minutes: 5`); the retry base wait, the two base URLs and the script's sha256 are overridable by environment variables, with the pinned GitHub values as defaults; the integration file is skipped with its reason named when bash, curl, gzip or tar is missing.
**Never:** a pinned binary version, a copy of the vendor's script, a check the vendor's release does not support (a 404 on the checksum file skips the checksum check and nothing else), a new dependency, a change to any other workflow step.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                        | Input / State                                                                                                                        | Expected Output / Behavior                                                                                                                                                                                 | Error Handling   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Transient 5xx                   | the tarball answers 503 twice, then a gzip tarball                                                                                   | installed after three tarball requests                                                                                                                                                                     | n/a              |
| HTML body                       | every tarball attempt answers an HTML page (status 200 or 503)                                                                       | seven attempts, no `actionlint` file, `tar` never reads the page, the last line names seven attempts, the last status and `the body was not a gzip file`                                                   | exit 1           |
| Truncated tarball               | a valid gzip header and a cut body, twice and then a whole one; or always                                                            | retried to success after three requests; or seven attempts naming `a truncated or corrupt gzip file`                                                                                                       | exit 1           |
| Checksum mismatch               | a gzip tarball whose sha256 differs from the checksum file's                                                                         | retried (the wrong first tarball and a right second one installs after two requests); seven attempts then the mismatch named                                                                               | exit 1           |
| No checksum file                | the checksum file answers 404                                                                                                        | installed; an HTML body still fails on `gzip -t`                                                                                                                                                           | exit 1 on HTML   |
| Checksum file down              | the checksum file answers 503 on every attempt                                                                                       | seven requests, the failure names the checksum file; the check is not skipped                                                                                                                              | exit 1           |
| Checksum file lacks the tarball | a well-formed checksum file with no line for the tarball                                                                             | the failure names the missing line after one tarball request, no further attempts                                                                                                                          | exit 1           |
| Latest version                  | `/releases/latest` redirects to `/releases/tag/v9.9.9`                                                                               | the tarball path asks for 9.9.9; a 503 twice on the redirect is retried; an answer with no tag fails after seven attempts                                                                                  | exit 1 on no tag |
| Script digest                   | the stub serves a script with another sha256                                                                                         | seven attempts, the mismatch named, the script never runs; a 503 twice on the script is retried                                                                                                            | exit 1           |
| Cut connection                  | the tarball connection is dropped after half its announced body, twice, then a whole tarball                                         | retried (`curl exit 18`) to success after three requests                                                                                                                                                   | n/a              |
| Deadline                        | a run past its deadline (set to 0 for the case), the tarball answers 503                                                             | one attempt, `failed after 1 attempt;`, no retry                                                                                                                                                           | exit 1           |
| Wait schedule                   | a tarball that answers 503 on every attempt, the sleep command recorded and the production base wait (the case removes the override) | waits of 2, 4, 8, 16, 32 and 64 seconds; a run whose earlier stages used their waits stays at 126 seconds in all (the script's and the tag's 30 seconds each, then 2, 4, 8, 16, 32 and the 4 seconds left) | n/a              |
| Outage of about two minutes     | the tarball answers 503 for its first six requests and then a tarball, the sleep command recorded and the production base wait       | installed on the seventh request after waits of 2, 4, 8, 16, 32 and 64 seconds (126 in all, past the 30 seconds of five attempts)                                                                          | n/a              |

</frozen-after-approval>

The frozen block was written for this build from the story's acceptance criteria as amended in `epics.md` on 2026-10-04.

## Code Map

- `tools/install-actionlint.sh`: the installer (new); `--curl-shim` is the mode in which it runs as the `curl` in front of `PATH`.
- `.github/workflows/quality.yaml`, `.github/workflows/publish.yaml`: the `Install actionlint` step calls the installer and the comments describing the step point at it.
- `test/test-install-actionlint.js` (`test:install-actionlint`, new), `package.json` (the script and its place in the `npm test` chain after `test:ci-coverage-filters`), `tools/test-shard-weights.json` (weight 7).
- `tools/validate-ci-coverage.js` (`actionlintInstallStepProblems`, `actionlintInstallerProblems`, run by `main`; the step must set `timeout-minutes: 5` and the installer's attempts, wait budget and the defaults of the wait base, sleep command and deadline are held by name) and `test/test-ci-coverage.js` (one case per dropped part, built by mutating the real text).
- `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`, this record.
- `README.md`: the length of the `npm test` chain in the Deterministic Checks section, 132 to 133 for the new script (`test:doc-counts` holds it).
- Not changed: `docs/`, `CONTRIBUTING.md`, `src/` (a grep for the actionlint install found none described), `AGENTS.md`.

## Tasks & Acceptance

- [x] Reproduce the old step's failure with the coordinator's shim.
- [x] `tools/install-actionlint.sh` and both workflow steps.
- [x] `test/test-install-actionlint.js`, its `package.json` script and shard weight.
- [x] The static check in `tools/validate-ci-coverage.js` and its cases in `test/test-ci-coverage.js`.
- [x] Each revert check once on a scratch copy.
- [x] `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml` (`review`), this record.

**Acceptance Criteria:** as in `epics.md` Story 1.130, with the amendment dated 2026-10-04 there.

## Reproduction

Run first on the unchanged text of the step, with the coordinator's `curl` shim in front of `PATH` (it answers the release URL with an HTML body and passes every other call to the real `curl`).
The pinned script (sha256 `a96d6013...` checked) failed on its first attempt: `tar: Error opening archive: Unrecognized archive format` (macOS wording; Linux gzip words it `not in gzip format`), exit 1, no retry, no `actionlint` file.
The new installer with the same shim and the retry base at 0 makes seven attempts, each named `the body was not a gzip file`, then ends on `downloading <url> failed after 7 attempts; last HTTP status ...; the body was not a gzip file` and exits 1 with no `actionlint` file.
(The shim ignores `-w`, so the status it shows is its page; the stub server of the integration file answers real statuses.)
Against the real GitHub on this host, `bash tools/install-actionlint.sh <dir>` resolved `v1.7.12` from the redirect, passed the pinned script's sha256, verified the tarball against the release's checksum file and installed a working `actionlint 1.7.12` in 1.3 seconds.

## Decisions

1. **One shared installer serves both workflows.**
   The retry and the checks live once, the integration test runs the shell the workflows run, and the static check reads one file for them.
   An inline copy in two workflows is the drift `validate-ci-coverage.js` exists to catch.
2. **The version floats because the installer resolves the latest tag.**
   The pinned script's `latest` keyword and its default both download its built-in 1.7.12, so the workflows' comments claimed a floating version the script did not deliver.
   The installer reads the `Location` of the `/releases/latest` redirect (retried like every download), requires `.../releases/tag/v<major.minor.patch>`, and passes the version to the script.
   Today the two agree; the AC says the version keeps floating, and this makes it true.
   Rejected: pinning 1.7.12 (the owner's rule is that versions float) and the GitHub API (it adds a rate limit and a JSON parse where the redirect needs neither).
3. **The retry wraps the one call that matters, through a `curl` in front of `PATH`.**
   The pinned script stays byte for byte the vendor's, hash-checked, and its tarball line is the one network call that needs the retry and the checks.
   Rejected: a copy of the script with the retry added (a second script to keep in step and to audit), and `tar` run by the installer (the pinned script's contract is `curl | tar`, so the shim keeps its own `tar` on a verified stream).
4. **The shim is the installer itself in `--curl-shim` mode.**
   `with_retry`, the failure messages and the checks exist once; the shim file the installer writes into its temp directory is two lines that `exec bash <installer> --curl-shim "$@"`.
   The real `curl` is found before `PATH` changes and handed down by `INSTALL_ACTIONLINT_REAL_CURL`.
   Only a call whose URL matches `*/releases/download/v*/actionlint_*.tar.gz` is intercepted; every other call, the Windows zip included, goes to the real `curl`.
5. **A failed attempt is a transient `curl` error, a non-2xx status, a truncated body, a body that is no gzip file, and a checksum mismatch.**
   `gzip -t` runs on the file before anything reaches `tar`; the checksum comes from the release's `actionlint_<version>_checksums.txt`, fetched once per run with its own retry.
   A 404 on that file means the release publishes none and skips the checksum check, for that case only; a 5xx fails after seven attempts, and a checksum file with no line for the tarball fails at once, since another download cannot repair it.
6. **The wait is 2, 4, 8, 16, 32, 64 seconds over seven attempts, with a 126 second budget across the run.**
   The first build tried five attempts and 2, 4, 8, 16 seconds, about 30 seconds of outage, while the story's So-that says "a GitHub outage of a few minutes cannot fail a shard".
   Round 1 of the review widened the retry: seven attempts wait 2, 4, 8, 16, 32 and 64 seconds, 126 seconds, which rides out an outage of about two minutes and still satisfies the criterion's at least five attempts.
   The run makes up to four downloads (the script, the tag, the tarball, the checksums); a shared budget file in the temp directory keeps the total waiting of the run at the schedule's 126 seconds, so a pull request's step stays bounded when several stages recover slowly.
   Once the budget is spent the remaining attempts follow without a wait.
   The first build's brief asked for about 60 seconds in total; the criterion's outage is the reason to exceed it, and Decision 12 holds the worst case inside the step's timeout.
7. **The test seams are six environment variables, and the production defaults are held by name.**
   `INSTALL_ACTIONLINT_RAW_BASE` and `INSTALL_ACTIONLINT_RELEASES_BASE` point the downloads at a stub, `INSTALL_ACTIONLINT_SCRIPT_SHA256` lets the stub's stand-in script pass the digest check, `INSTALL_ACTIONLINT_RETRY_BASE` (0 for the cases) keeps them to a second, `INSTALL_ACTIONLINT_SLEEP` lets cases record the waits, and `INSTALL_ACTIONLINT_DEADLINE` (0 for one case) proves the deadline of Decision 12.
   The defaults are the pinned GitHub values and the static check reads the defaults.
   What each default is held by: `INSTALL_ACTIONLINT_RETRY_BASE` unset is the production base of 2 seconds, held by the integration cases that record the waits (the wait schedule and the two-minute outage remove the override, so a default of 0 fails them) and by the static check; `ATTEMPTS=7`, `WAIT_BUDGET=126`, `SLEEP=${INSTALL_ACTIONLINT_SLEEP:-sleep}` and `DEADLINE=${INSTALL_ACTIONLINT_DEADLINE:-170}` are held by the static check alone, each with one mutation case in `test/test-ci-coverage.js`, since the integration cases set the sleep command and the deadline themselves.
8. **The final line names the cause and ends the output.**
   The pinned script's `tar` reads an empty stream after the shim fails and adds its own line; the installer then prints `the pinned download script exited N: <the shim's message>` last, so the output ends on the attempts, the status and the gzip cause.
9. **The workflow step installs into `$RUNNER_TEMP/actionlint-bin` and moves the binary.**
   The old step wrote `download-actionlint.bash` and `actionlint` into the checkout's root, where a later `git status` or a file scan saw them.
10. **The static check strips whole-line comments from the installer before it matches.**
    A comment that names `gzip -t` or `ATTEMPTS=7` cannot stand in for the code, and a case holds that.
11. **No docs text changes beyond one count.**
    A grep of `docs/`, `CONTRIBUTING.md`, `README.md`, `src/` and `AGENTS.md` found no text describing the actionlint install.
    `README.md` states the length of the `npm test` chain (`test:doc-counts` holds it), which the new script takes from 132 to 133, so both mentions of it changed.
12. **A run stops retrying after 170 seconds, and the worst case stays inside the step's timeout.**
    Seven attempts of a 20 second `curl` limit over four stages exceed the step's 5 minute timeout on a hung network, and the runner would kill the step with no message naming the cause.
    `with_retry` checks the time since the run started after each failed attempt and gives up at 170 seconds, so the message names the attempts made (`failed after 3 attempts`) and the step ends before its timeout.
    The final message counts the attempts actually made.
    The worst case: a wait starts only when less than 170 seconds have passed and lasts at most 64 seconds, so the last wait ends before 234 seconds; the attempt after it makes at most two requests, the tarball and the checksum file, of 20 seconds each (the `curl` limit), and past the deadline neither retries.
    That is 170 + 64 + 2 x 20 = 274 seconds, 26 seconds inside the step's `timeout-minutes: 5` (300 seconds).
    The static check requires `timeout-minutes: 5` exactly on both steps, since the 274 seconds is sized against it.
13. **Rejected: a retry of a 404 on the checksum file before skipping the check.**
    The brief and the criterion both name a 404 as the release publishing no checksum file.
    A CDN hiccup that answers 404 loses the digest comparison for that run while `gzip -t` still holds; a retry would add a wait for every release that publishes none.
14. **The static check refuses a step that skips or swallows the installer.**
    `if`, `continue-on-error` and a run line with `||`, `;` or `&` after the call each fail it, as `shardRunProblems` does for a shard step; the cases hold each.

## Implementation Notes

- The shell runs under bash 3.2 (the macOS system bash) and bash 5: no associative arrays, no `mapfile`, no `${var,,}`.
  `shellcheck tools/install-actionlint.sh` is clean.
- `fetch_file` removes its output file first, so a connection that fails before any byte cannot leave the last attempt's body to be described as this one's.
- The integration file reruns a failed case once and reports the second run's verdict, per the brief.
- The stand-in script keeps the real script's `set -e -o pipefail`, `curl -L "${url}" | tar xvz -C "$target_dir" actionlint` and `"${exe}" -version` lines; its `tar` is the real one, so a page that reached it would print `gzip: stdin: not in gzip format` or `Unrecognized archive format`, which the cases assert is absent.

## Revert observations

Each on a scratch copy of the final tree, one change at a time, then restored.
The counts are failed cases of `test:install-actionlint` (10 cases) unless named.
A failed case is counted once, though the file reruns a failed case once.

- Retry removed (`ATTEMPTS=1`): 9 of 10 cases fail (all but the deadline case), the 503-twice case and the two-minute outage case among them.
- The first build's schedule (`ATTEMPTS=5`, `WAIT_BUDGET=60`): 8 of 10 fail, the two-minute outage case among them, so the story's So-that has a case that fails on revert.
- `gzip -t` removed from the tarball path: 3 of 10 fail (the HTML body, the truncated tarball, the missing checksum file).
  With a checksum file the page is refused by the checksum comparison with the wrong cause; with none (the 404 case) the page reaches the stand-in's `tar`.
- Checksum comparison removed: 1 of 10 fails (the mismatch case installs on the first request).
- The final message reduced to the bare `gzip: stdin: not in gzip format`: 5 of 10 fail.
- The installer given a hard-coded version in place of the resolution: 3 of 10 fail (the 503-twice case, the latest-version case and the wait schedule case, whose tag stage no longer waits), and the static check names `no longer resolves the latest release tag ...` and `no longer keeps the actionlint version out of its code`.
- Each workflow reverted to the inline `curl ... | sha256sum -c - ; bash download-actionlint.bash` step: `test:ci-coverage` fails once for `quality.yaml` and once for `publish.yaml`, naming the file, that the step does not run the installer and that it fetches `download-actionlint.bash` itself.
- The pass-through of a non-tarball `curl` call removed: 1 of 10 fails (the first case, through the stand-in's second call).
- The `curl` exit-code branch of `fetch_file` removed: 1 of 10 fails (the cut connection case, in the truncated-tarball case).
- The deadline removed: 1 of 10 fails.
- The "no line for the tarball" failure turned into a retried failure (`fail` replaced by `FAIL_NOTE=...; return 1`): 1 of 10 fails (the missing checksum file case, on the count of one tarball request), so "fails at once" has a case that fails on revert.
- The production defaults, each on a scratch copy:
  - `INSTALL_ACTIONLINT_RETRY_BASE` default 0: 2 of 10 fail (the wait schedule and the two-minute outage, which run at the default base) and `test:ci-coverage` names `no longer waits a base of 2 seconds by default`.
  - `INSTALL_ACTIONLINT_SLEEP` default `true`: the integration file passes (its cases set the sleep command) and `test:ci-coverage` names `no longer sleeps with the real sleep by default`.
  - `INSTALL_ACTIONLINT_DEADLINE` default 2000: the integration file passes (the deadline case sets it) and `test:ci-coverage` names `no longer stops retrying after 170 seconds by default`.
  - `timeout-minutes: 30` on the step: `test:ci-coverage` fails once for `quality.yaml` and once for `publish.yaml` with `does not set timeout-minutes: 5`.
- The mutations the static check is held against live in `test/test-ci-coverage.js` and fail it by name (18 installer mutations, 9 workflow mutations per file).
  Reverting each of the new checks in `tools/validate-ci-coverage.js` (the exact timeout, and each of the five default parts) fails `test:ci-coverage-filters` on the matching case.

## Gates

All green on the committed tree:
`npm run test:install-actionlint` (67 checks, 10 cases), `test:ci-coverage` (133 chain steps, 167 scripts), `test:ci-coverage-filters` (180 checks), `test:shards` (183; the weight of `test:install-actionlint` is 7, from 6.5 to 7.0 seconds measured over three runs), `format:check`, `lint:md`, `lint`, `test:doc-counts`, `test:changelog`, `test:bmad-output-gated` (148).
`actionlint .github/workflows/quality.yaml .github/workflows/publish.yaml` and `shellcheck tools/install-actionlint.sh` are clean.
The gates of the first build also passed on its tree (`test:release-metadata`, `test:doc-claims`, `docs:validate-links`, `test:boundary`, `test:direction`, `test:supply-chain`, `test:guard-publish`, and `test:install-actionlint` under the macOS system bash 3.2 and with `http_proxy` set); round 1 touched none of the files they read.
No full local `npm test` ran; CI carries the chain.

## Build review

One pass by an independent review subagent over the diff, in three lenses (shell correctness, test quality, prose rules).
No blocking finding.
Fixed from it: the total deadline (Decision 12), a case for a cut connection and one for the pass-through of a non-tarball `curl` call, proxy variables removed from the test's child environment, the first run of a rerun case printed as a warning, the test's temp directories removed, the static check refusing `if`, `continue-on-error` and a swallowed exit (Decision 14), and the prose of the installer, the test header and the validator.
Answered with a reason: a 404 on the checksum file (Decision 13) and the failure file written in both modes (it is one line a run and the installer reads it only after the shim exited).

Round 1 of the PR review found five defects, all fixed in the round 1 commit:
the retry covered about 30 seconds of outage against a So-that of a few minutes (Decisions 6 and 12: seven attempts, 126 seconds of waits, a 170 second deadline, a worst case of about 274 seconds, and the two-minute outage case);
the production defaults were held by no test (Decision 7: the wait cases now run at the default base, and the static check holds the five defaults by name);
the static check required only a numeric `timeout-minutes` (now exactly 5, with a mutation case);
the "no line for the tarball" case never counted tarball requests (now it holds one request, with a revert proof);
and the Code Map listed `README.md` as unchanged while the diff changes its chain count.
