# Deferred work

- source_spec: `_bmad-output/implementation-artifacts/evaluate/story-1.27.md`
  summary: Decide how the test-design parser should treat an unfenced reference table with risk ID and score columns.
  evidence: The current parser counts any such table as a risk register; a document fixture with an explicit reference table and an expected risk count would settle whether the context should exclude it.
- source_spec: `_bmad-output/implementation-artifacts/evaluate/story-1.27.md`
  summary: Restore eval-quality whole-body coverage reporting for the test-design contract's structured companion.
  evidence: The generated baseline marks `whole-body` unsatisfied because the complete Markdown is nested in the companion's `design` field, although material-risk oracles still read the full string.
