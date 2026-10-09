# Test Generation Live Evidence

`evidence.json.gz` stores 33 live captures and their raw artifacts as a versioned JSON map of base64 bytes: 20 historical captures and 13 current captures.
`index.json` pins the compressed archive digest and lists both groups.
The generation-healing suite verifies the archive and each captured artifact against its original provenance digest.
All 812 original archived file values remain byte-for-byte identical after the append.

To inspect the original files, extract into a new directory:

```bash
node test/lib/generation-evidence.js --extract /tmp/tea-generation-evidence-review
```

Historical captures retain the exact prompts, outputs, reports and staged instructions used for those runs. Their snapshots describe their original runs and carry no current-source equality claim. Genuine v2.0.0 checkpoint cases include the original Create evidence and source tag. Seeded settings inputs and controlled terminal replays have separate labels. The legacy terminal capture continues a genuine checkpoint after generation and aggregation; its physical hook log resolves the agent's inaccurate description of earlier hook entries.

`current/manifest.json` records the 13 current captures, their raw file digests, staged sources and private controller locations. Replay compares all eleven critical runtime sources with the current repository; standalone canonical red compares ten because its compatibility entry is absent. Changing a critical source requires fresh captures before these claims pass again.

Six current captures run the actual entry through default Claude with neutral task/input prompts: bare `Create.` through both entries, scoped red Create, Validate, Edit and canonical-only red Validate. Seven controlled runtime captures exercise an expand import defect plus preserved product failures, disabled validation, disabled healing, zero repair rounds, a retained exhausted budget, permanent red import repair and native Chromium verification with inherited environment and a helper child process. Controlled import faults and checkpoint projections are labeled explicitly. Their saved state establishes the test setup; it carries no claim of a genuine interruption.

Controller prompts, baselines, streams and provenance stay outside each agent project. Raw project inputs, configuration, wrappers, generated tests, checkpoints, reports and source snapshots retain their original bytes. Independent configuration-load records supplement wrapper logs because an agent can invoke the native runner directly. Validate and Edit have no fresh runner calls or configuration loads. Disabled validation also has no new reports. Native browser verification preserves the permanent skipped scaffold and every protected source/config byte; its story keeps its original bytes as a prefix and receives only the recorded checklist-link suffix.

The current replay checks actual per-leaf statuses and assertion errors, protected file contents and permissions, generated repair ownership, saved budget keys and physical hook order. The independent post-capture audit supplements the original entry harness's `tests/generated` inventory with the generated file under `tests/expand`. Passing expand execution, intended red failures and validation warnings remain distinct outcomes.
