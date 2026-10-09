---
name: Rule Quality Report
about: An agent misread, ignored, or was misled by a TEA rule or knowledge fragment
title: ''
labels: 'rule-quality'
assignees: ''
---

Report one rule that an agent misread, ignored, or followed into an incorrect result.

**Agent and model**
Name the agent, model, and versions.

**Which rule**
The file and the section inside it. Examples:

- `criteria-registry.md`, row H3
- `skills/bmod-tea/knowledge/network-first.md`, the "declare the intercept before navigating" section
- a step file such as `steps-c/step-03-generate-tests.md`

**Which workflow was running**
Name the workflow and its invocation.

**The prompt you gave**

```text

```

**What it produced**
Include the smallest excerpt that shows the violation.

```text

```

**What it should have done**
Describe the expected behavior and the wording that requires it.

**Your read of the cause** (optional)

- [ ] The rule says the right thing and the agent ignored it
- [ ] The rule is ambiguous and the agent picked a defensible wrong reading
- [ ] The rule is wrong or out of date
- [ ] The rule was never loaded (wrong fragment selected, or none)
- [ ] Not sure
