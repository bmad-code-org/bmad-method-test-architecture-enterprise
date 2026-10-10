# Live Codex NFR evaluation

These files preserve actual Codex calls. Custom-agent CLI checks elsewhere are controlled fixtures.

| Observation       | Source commit                              | Corpus                                                                               | Measured result                                                                                                                           |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Historical before | `455c0255adf14999fbf7fc0c21d4b9353d222a27` | Original clean evidence allowed outbound TLS 1.2 while requirements demanded TLS 1.3 | Gapped fixture correct; clean security FAIL, matching the source contradiction. Domain accuracy 87.5%, overall accuracy 50%.              |
| Corrected before  | `a0c9bf621289e96e3cda9ab6c130d2049956e04f` | Same skill bytes, outbound transport evidence corrected to TLS 1.3                   | All measured accuracy groups 100%; zero unsupported PASS, fabricated citations, duplicate domains, gate disagreements or input mutations. |

Both observations have two fixture cases with one repetition each. Stability is unmeasured. The original console's stable wording and unstableCases=0 value are retained unchanged; the repaired harness reports unrepeated and null. The corpus correction creates a valid oracle. It supplies no causal claim about a skill improvement.

The corrected before was run from a clean immutable clone using the same pinned Codex adapter/model as the original. Each result records the repository/fixture/prompt digests and requested model. Raw captures include supplied project bytes and completed reports. The corrected capture also includes exact probe requests and observations, containing vendor streams. The historical capture has reports and harness transcript; original vendor stream files were unavailable. Capture manifests list byte digests and the original external full-workspace locations.

The new public CLI executes the existing installed NFR skill with explicit file roles, then retains and validates its canonical criterion/evidence context beside the actual report. Live public command observations will be retained separately with their exact CLI source commit and invocation.
