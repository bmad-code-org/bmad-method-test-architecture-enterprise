# Live Codex NFR evaluation

These files preserve actual Codex calls.
Custom-agent CLI checks elsewhere are controlled fixtures.

| Observation       | Source commit                              | Corpus                                                                               | Measured result                                                                                                                           |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Historical before | `455c0255adf14999fbf7fc0c21d4b9353d222a27` | Original clean evidence allowed outbound TLS 1.2 while requirements demanded TLS 1.3 | Gapped fixture correct; clean security FAIL, matching the source contradiction. Domain accuracy 87.5%, overall accuracy 50%.              |
| Corrected before  | `a0c9bf621289e96e3cda9ab6c130d2049956e04f` | Same skill bytes, outbound transport evidence corrected to TLS 1.3                   | All measured accuracy groups 100%; zero unsupported PASS, fabricated citations, duplicate domains, gate disagreements or input mutations. |

Both observations have two fixture cases with one repetition each.
Stability is unmeasured.
The console's stable wording and `unstableCases=0` value are retained unchanged.
The repaired harness reports stability as unrepeated and null.
Corpus corrections repair the oracle.

The corrected run used a clean clone with the pinned Codex adapter and model.
Each result records repository, fixture, and prompt digests alongside the requested model.
Raw captures include supplied project files and completed reports.
The corrected capture includes probe requests and observations containing vendor streams.
Capture manifests list byte digests and external workspace paths.

The CLI executes the installed NFR skill with explicit file roles.
It retains and validates canonical criterion and evidence context beside the generated report.

## Original public calls and controlled parser replay

`public-cli-original/public-native.json.gz` is an archive generated from Codex public CLI workspaces at source `a8225395571b026f194aefc696ca0a18922bf919`.
Its manifest lists every source, report, context, prompt, vendor stream, invocation, and CLI result.
Both original attempts returned exit 3 with no detected input mutations.
One repetition per case leaves stability unmeasured.

The clean report was rejected at `security-authentication` for its `PASS ✅` display.
The gapped report was rejected for an Actual quotation rendered as a fenced block matching supplied evidence.
Follow-up runs exposed inline quotation delimiters, capitalized category labels, and the original prompt's `Label: UNKNOWN threshold gap` message.
Repairs preserve criterion identities, source bindings, enum consistency, and exact quotations.

The public regressions replay each unchanged report using a controlled custom process.
Only `requestId` and `supplied_project_root` in the canonical context change to bind the report to the fresh request.
The clean replay returns PASS and exit 0.
The gapped replay returns FAIL and exit 1.
Original model generation and parser replays remain separate observations.
These replays run without model calls or skill modifications.

`parser-replay/manifest.json` retains the controlled replay invocations, source pins, prompts, streams, and artifact digests.
Original-parser replay at `a8225395571b026f194aefc696ca0a18922bf919` reproduces exits `[3, 3]`.
Repaired-parser replay at `1debdc1112ef51a7adf4ba7c956e3bfe0c3db9da` returns exits `[0, 1]`.
Replay provenance files declare `generatedByModel: false` and preserve report digests.
Test helpers reproduce these parser replays from the committed original archive.
