# Codex test-design evaluation

The baseline invoked the actual test-design skill through the Codex adapter, pinned to `gpt-5.6-sol`, once for each fixture. Both executions finished successfully; the evaluation gate failed on report quality. This single repetition does not measure run-to-run stability.

The unmodified baseline is retained under `raw/before/`. Its capture provenance records the exact source commit, command and workspace-preservation method. Generated Markdown stays byte-for-byte unchanged and is excluded from formatters. Full staged workspaces remain at the external capture path identified in the provenance record.

The seeded plan uses the header `Description and source evidence`. The original parser treated that column as absent, reporting zero grounded risks. Adding that observed header alias rescores the same generated document as five grounded material risks with coverage. `seeded-rescored-with-header-alias.json` is a replay of the original document after the parser repair. Its equal primary priorities still fail the priority measurability check.

The clean plan contains eight scored risks against its existing ceiling of three. It splits the same freshness and visibility mechanisms across several rows and scores hypothetical new writes, networking and privacy exposure despite explicit constraints excluding those changes. Skill guidance now consolidates shared mechanisms and requires source evidence for new exposure. Coverage can still verify the constraints.

The project CLI executes the actual packaged skill with explicit project inputs and scope. It retains fresh attempts, validates scored-risk arithmetic and coverage references, checks a completed checkpoint for the requested run, and publishes verified artifacts. Deterministic custom-agent tests exercise the CLI contract. Live after-change generation will be recorded separately.
