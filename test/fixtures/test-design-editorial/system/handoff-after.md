# TEA → BMAD Integration Handoff

## Purpose

This document connects TEA's test design outputs to BMAD's epic and story decomposition workflow.

## Epic-Level Integration Guidance

### Risk References

- R-001 (score 9) and R-002 (score 6) are the P0 risks. Every epic that touches exports carries them.

## Risk-to-Story Mapping

| Risk ID | Category | P×I | Recommended Story/Epic       | Test Level |
| ------- | -------- | --- | ---------------------------- | ---------- |
| R-001   | DATA     | 9   | Epic 2: Atomic export writes | API        |
| R-002   | SEC      | 6   | Epic 3: Per-tenant signing   | API        |
| R-003   | PERF     | 4   | Epic 2: Export performance   | API        |
