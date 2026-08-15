---
name: Rule Quality Report
about: An agent misread, ignored, or was misled by a TEA rule or knowledge fragment
title: ''
labels: 'rule-quality'
assignees: ''
---

TEA ships rules. This report is about a rule that failed to steer an agent, not about TEA crashing. One report per rule, please.

**Agent and model**
Which agent ran, and which model: e.g. Claude Code / Claude Opus 4.6, Cursor / GPT-5.1, Windsurf, Codex.

**Which rule**
The file and the section inside it. Examples:

- `criteria-registry.md`, row H3
- `resources/knowledge/network-first.md`, the "declare the intercept before navigating" section
- a step file such as `steps-c/step-03-generate-tests.md`

**Which workflow was running**
e.g. `test-design`, `automate`, `atdd`, `test-review`, `trace`, `nfr-assess`, `ci`, `framework`, `teach-me-testing`.

**The prompt you gave**

```text

```

**What it produced**
The non-compliant part only. Trim to the smallest excerpt that still shows the violation.

```text

```

**What it should have done**
State the behavior the rule was supposed to produce, and why you read the rule as requiring it.

**Your read of the cause** (optional)

- [ ] The rule says the right thing and the agent ignored it
- [ ] The rule is ambiguous and the agent picked a defensible wrong reading
- [ ] The rule is wrong or out of date
- [ ] The rule was never loaded (wrong fragment selected, or none)
- [ ] Not sure
