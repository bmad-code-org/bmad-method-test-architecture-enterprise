---
title: 'Teach CLI'
description: 'Learn testing one caller-owned message at a time with durable teaching progress.'
---

`tea-teach` runs the packaged `bmad-teach-me-testing` skill for one learner message.
It saves the tutor's next question or menu, the conversation, and the skill's progress YAML.
Run the command again with your answer to continue.

```bash
npx tea-teach --learner Murat --message "I want to learn testing" --agent codex
npx tea-teach --learner Murat --message "QA" --agent codex
```

Supply your role, experience and goals as the tutor asks.
The learner name is the durable identity; repeat the same name and project on later turns.
Roles include QA, Dev, Lead and VP.
Experience levels include Beginner, Intermediate and Experienced.

| Option                  | Meaning                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `--learner <name>`      | Required learner name, including safe spaces and punctuation.       |
| `--message <text>`      | Exact learner message for this turn.                                |
| `--message-file <path>` | Read the message from a UTF-8 file in the consuming project.        |
| `--agent <name>`        | Required: codex, claude, agy, custom or none.                       |
| `--project-root <dir>`  | Consuming project; defaults to the current directory.               |
| `--state-dir <dir>`     | CLI-owned state directory; defaults under TEA teaching-progress.    |
| `--progress <path>`     | Import an existing skill progress file into an empty CLI state.     |
| `--skill-root <dir>`    | Trusted installed teaching skill override.                          |
| `--evidence-dir <dir>`  | Retained attempts; defaults to `.tea-runs`.                         |
| `--json <path>`         | Additional result JSON outside state, evidence and supplied inputs. |
| `--model <name>`        | Override the selected vendor's pinned model.                        |
| `--agent-cmd <path>`    | Agent executable override; required for custom.                     |
| `--agent-arg <arg>`     | Repeatable extra agent argument.                                    |
| `--env-pass <NAME>`     | Repeatable additional environment name passed to the agent.         |
| `--timeout-ms <n>`      | Attempt budget in milliseconds; defaults to 1,200,000.              |
| `--retries <n>`         | Additional transport/timeout attempts, 0 through 3; defaults to 0.  |

Supply exactly one message option.
`--agent none` retains the full prompt and a prompt-only run record; it leaves published progress unchanged.
Each live attempt receives a fresh copy of the original learner state.
Opted-in retries replay the same incoming message from that original state.

The JSON result on stdout contains the tutor reply and paths to conversation, progress and evidence.
Each attempt retains the exact prompt, response artifact, raw agent streams and outcome.
The host writes learner messages into the conversation from command input.
The tutor cannot add learner responses to that record.

Quiz questions use the selected skill's canonical question bank.
Answer the current multiple-choice question with one letter, A through D.
The controller grades those exact caller messages and requires all quiz answers before accepting session completion.
Two correct answers out of three score 66.67%, below the 70% passing threshold.
The skill permits an explicit C at its below-pass review menu to finish the session with that score; saved `quiz_passed: false` distinguishes completion from mastery.
The exploratory seventh session records completion without a quiz mastery claim.

Generated artifacts must be separate regular files inside the current attempt.
New learner facts must cite caller messages.
Completed sessions and their notes remain intact.
Conversation, progress and notes publish as one directory replacement with rollback.
Failed or invalid turns preserve previous state and leave an existing `--json` result unchanged.
Concurrent invocations for one learner state fail while its lock is held; a diagnostic names a stale lock for manual recovery after confirming its invocation has ended.

Saved conversation and progress form a pair.
Missing paired progress or a completed local session without its caller-owned quiz ledger fails before the vendor runs.
Explicit imported completions carry provenance for each specific session.
Established completion summaries retain their flag, path, completion date and content across import and continuation.

The controller freezes consumed configuration layers, workflow customization, resolved policy files and supplied message/import files.
It detects changes to bytes, permissions, inode identity, symlink topology, optional configuration presence and matching policy membership before accepting or publishing a turn.
A custom agent can still modify files in its consuming project; detection fails the turn and preserves published learner state.
Review retained evidence and repair changed project inputs before retrying.

An explicit `--progress` import preserves existing skill facts and completions as trusted prior history.
Its conversation records that provenance.
A legacy file with one populated YAML document followed by one empty document is normalized during import; new generated progress always requires one document.
Imported progress must belong to the exact learner and retain the seven canonical sessions.

| Exit | Meaning                                                                    |
| ---- | -------------------------------------------------------------------------- |
| 0    | A validated turn published, or prompt-only evidence retained.              |
| 2    | Invalid arguments, inputs, paths, configuration, vendor readiness or lock. |
| 3    | Agent execution failure, timeout or invalid generated teaching evidence.   |
