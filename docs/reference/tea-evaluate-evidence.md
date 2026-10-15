---
title: 'tea-evaluate Evidence'
description: 'The run directory, the path forms in tea-evaluate records and the run-wide strength aggregate'
---

# tea-evaluate Evidence

This page holds how `tea-evaluate` keeps its evidence: what a run directory may hold, the path forms its records carry and the run-wide strength aggregate `score` writes.
The commands that write the evidence are in the [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md) reference.

## The run directory

`runs/` must be a real directory and `runs/.gitignore` a real file; a link at either is refused.
The runtime creates every directory under `runs/<invocationId>/` itself and writes each file from inside it.
Before the preflight verdict, and for `run` again before `run.json` says completed, the run directory must hold exactly the entries the runtime wrote, each file with the bytes it wrote.
An entry the runtime did not write, a directory that was replaced or moved, or a file with other bytes exits 12.
[Why Evaluate Confines the Target](/docs/explanation/why-evaluate-confines-the-target.md#the-run-directory) describes how the runtime guards each write.

## Paths in the records

The paths the runtime itself writes into a record are recorded in neutral forms, so `runs/` can be uploaded as a CI artifact and `baseline/` committed to a public repository without publishing a home directory, a temporary directory or a checkout location.
The runtime writes these forms where a path would be:

| Where                                                                                                 | Form                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run.json` `workspaces`, and `cwd` in each `observations/` and `faults/` record                       | `<workspace>`, or `<workspace>/<path>` when `launch.root` sits below the workspace's top; the record's `workspace` label tells which workspace it was                                                                   |
| `run.json` `adopterTree.repository`                                                                   | `<repository>` when your project sits in a git repository, `null` otherwise                                                                                                                                             |
| `run.json` `logins[].file`, and the login entries of a manifest or its note                           | `<credentials-file>`                                                                                                                                                                                                    |
| `cli` in each engine call record                                                                      | `eval-quality/<path below the package>`, or the file name of the program `TEA_EVALUATE_ENGINE_CLI` substituted                                                                                                          |
| a file of your evaluation folder in an engine call's `argv`                                           | its path below the evaluation folder, for example `runs/<invocationId>/scoring-policy.json`                                                                                                                             |
| the private staging file in an engine call's `argv` (`--out`)                                         | `<staging>/<file name>`                                                                                                                                                                                                 |
| the score invocation's directory in the `argv` of the aggregate call                                  | `<score-invocation>`, because each `score` writes an invocation id of its own                                                                                                                                           |
| `observedMounts` in an isolation manifest (host paths the audit saw a target open)                    | the path with your home directory as `<home>`, the temporary directory as `<tmp>`, the private root as `<private-root>` and the evaluation folder as `<evaluation-folder>`, so the entry still says which file was read |
| `failure` and `reason` in a `score` summary, and `baseline.reasons` and `baseline.error` in `ci.json` | the same substitution as the output of a `ci` check below                                                                                                                                                               |
| the output of an `evaluate` check of `ci` (`checks/<id>/stdout` and `stderr`, warnings and notes)     | the evaluation folder as `<evaluation-folder>`, the private root as `<private-root>`, the temporary directory as `<tmp>`, your home directory as `<home>`                                                               |

A recorded argv reruns by hand from the evaluation folder: the relative paths resolve there, `<score-invocation>` is the name of the invocation's directory under `scores/`, and `--out` takes a fresh file.
Every digest a record carries is taken over the bytes with these forms in them, so nothing is rewritten after a run and `compare --accept` copies the files as they are.
A `gate` check of `ci` records the output of your command as it printed it, so a path it prints stays in `checks/<id>/stdout`.
A target's printed output is recorded as received, so a target that prints its working directory, its home directory or a stack trace puts that text in its observation.

## Run-wide strength aggregate

`eval-quality score` covers one probe per call, so a probe's strength vector says nothing about a class across the run, and TEA computes no rate.
After the probe loop, `score` calls `eval-quality aggregate-strength` once, through the same CLI stage runner, over the evidence artifacts it copied, the floors and the run's own scoring policy.
It writes three files beside the probes in `scores/<scoreInvocationId>/`:

- `strength-floors.json`: `evaluation.json.strengthFloor`, read once, staged as a private file and copied in and read back after the call, so the floors a replay reads are the ones this call read (a copy that changed while the call ran exits 12).
  The engine admits `defect`, `gameability` and `zero-action`; canaries stay outside every denominator, so `strengthFloor` has no `canary` key and a floors file that names one exits 5 at the engine.
- `aggregate-strength.json`: the call's executable, argv, exit code, stdout and stderr, the same record each `score` call keeps, in the same path forms.
- `strength-aggregate.json`: the engine's strength aggregate, copied byte for byte.
  Per class it states the distinct qualified probes (`eligible`), how many the evaluator exercised, how many were `caught`, the `rate`, whether the class is `comparable`, and the floor decision with its `basis`.
  A class with no eligible probe is `null`; a class with eligible probes and none exercised has `rate: null`; a trial set below `minimumTrialCount` or an unreached oracle makes the class not comparable.
  Clean controls and canaries are outside every class denominator.
  The aggregate records the engine version and, for every artifact it read, the probe, its class and the artifact's digest.

The call runs only when every probe copied an evidence artifact and no output was refused.
When a probe has none (an Invalid score, a call that could not run, a staged artifact that failed the copy check), no aggregate call is made, the invocation's `score.json` records `strengthAggregate` as `absent` with the reason, and no class-wide strength claim stands.
The staged aggregate is copied only when it meets the published `strength-aggregate` schema and schema version, its recorded digest for each probe equals the digest of the evidence file `score` persisted (the digest of the file's canonical form, which `engine.js` computes), it covers exactly the probes the invocation scored, its `engineVersion` equals the `evalQualityVersion` in `run.json`, and its `floorDecisions` record, for each of `defect`, `gameability` and `zero-action`, the floor `evaluation.json.strengthFloor` declares (`null` when it declares none).
Any disagreement, a forged aggregate included, copies nothing, records the mismatch and exits 12.
A file the held writer refuses after the floors were staged (the floors copy that changed, a file planted where the aggregate lands) exits 12 as well, and `strengthAggregate` records `failed` with the reason and the call and floors written so far.
A floor decision changes no exit code: the engine exits 0 whatever it decides, an engine exit of 4 or 5 (a set whose artifacts disagree, a fault in its inputs) produces no aggregate and joins the most severe combination when the held bytes give the same exit (an exit they do not give, such as a refusal caused by a persisted evidence file a process rewrote, exits 12; see [Score input integrity](/docs/explanation/why-evaluate-confines-the-target.md#score-input-integrity)), an exit of 64 (a usage error, which the held bytes do not give, so it means the call was wired wrong) exits 12 with the aggregate recorded as a mismatch, and any other code or a call that cannot run exits 12.
The aggregate covers the probes the invocation scored, so a `--partition` run aggregates its own partition, and a `records` run aggregates too.
`score.json`, `partitions.json` and `interpretation.json` carry a `strengthAggregate` pointer (status, reason, path, digest, floors copy and its digest); the gap view carries none.
Rerunning `eval-quality aggregate-strength` by hand on the recorded argv, from the evaluation folder and with a fresh `--out`, gives byte-identical output, because the argv names the persisted evidence, the floors copy and the run's policy.
The Evaluate skill's `references/run.md` and `references/gaps.md` read this file to hold the class floors before held-out execution; a probe's own vector describes that probe alone.
