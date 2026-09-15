---
name: 'nfr-status-definitions'
description: 'The single definition of what PASS, CONCERNS, FAIL, and N/A mean for an NFR evidence-audit finding, shared by all four domain workers'
---

# NFR Evidence-Audit Status Definitions

## WHY THIS FILE EXISTS

Four workers (Security, Performance, Reliability, Maintainability) each assign a
status to their findings independently. If each worker wrote its own wording for
what counts as CONCERNS versus FAIL, the four copies would drift the way severity
drifted before `DESIGN-CRITERIA-REGISTRY.md` existed. One definition, loaded by
all four, keeps a status meaning the same thing regardless of which worker
assigned it.

## Status Values

Every finding gets exactly one of these:

- **PASS**: Properly implemented. The dimension meets its threshold or target,
  backed by evidence.
- **CONCERNS**: Partially implemented or weak. Meets the threshold with caveats,
  is trending toward a limit, or is missing supporting evidence (baselines,
  monitoring, an owner). Does not block, but needs follow-up.
- **FAIL**: Not implemented, or a critical issue exists. A threshold is breached,
  or a vulnerability/defect exists that blocks confidence in this dimension.
- **N/A**: Not applicable to this system or this finding's category.

## Domain Status

The four statuses above are assigned to findings. A domain has one status of its own, and it is the worst status among its findings: **FAIL** when any finding is FAIL, **CONCERNS** when any finding is CONCERNS and none is FAIL, **PASS** otherwise. N/A is the absence of a judgment and never decides a domain, so a domain is N/A only when every one of its findings is N/A.

That value is written in two places and it is one judgment: the `audited_domains` block of the Gate YAML snippet, which is what a machine reads, and the domain's `## <Domain> Assessment` section, which is what a person reads. They must agree. A run whose gate artifact contradicts its own assessment section has published two answers to one question, and which of them a reader acts on decides a release.

The block always names the four domains above and no others. A category supplied through `custom_nfr_categories` is written into its own `## Custom NFR Evidence Audits` section, but no worker in Step 4 dispatches for it and no findings list exists to roll up, so it has no status to declare here. A custom category's status lives only in its own section's prose.

## Default Rule for Undefined Thresholds

If the threshold or evidence a finding depends on was marked **UNKNOWN** in Step
2 (Define Thresholds), the finding must be **CONCERNS**, never PASS. An absent
measurement is not evidence that the target was met. Step 4E (Aggregate NFR
Evidence Audit Results) checks this rule against every finding after all four
workers report; a worker producing PASS for an UNKNOWN-threshold category will
have it downgraded there.
