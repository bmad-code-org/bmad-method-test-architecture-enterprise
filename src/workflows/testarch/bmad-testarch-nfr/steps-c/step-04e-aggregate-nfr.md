---
name: 'step-04e-aggregate-nfr'
description: 'Aggregate NFR domain evidence audits into executive summary'
nextStepFile: '{skill-root}/steps-c/step-05-generate-report.md'
outputFile: '{test_artifacts}/nfr-assessment.md'
---

# Step 4E: Aggregate NFR Evidence Audit Results

## STEP GOAL

Read outputs from 4 parallel NFR evidence audit subagents, calculate overall risk level, aggregate compliance status, and identify cross-domain risks.

---

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- ✅ Read all 4 subagent outputs
- ✅ Calculate overall risk level
- ❌ Do NOT re-assess NFRs (use subagent outputs)

---

## MANDATORY SEQUENCE

### 1. Read All Subagent Outputs

```javascript
const domains = ['security', 'performance', 'reliability', 'maintainability'];
const assessments = {};

domains.forEach((domain) => {
  const outputPath = `/tmp/tea-nfr-${domain}-{{timestamp}}.json`;
  assessments[domain] = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
});
```

---

### 1a. Enforce the Undefined-Threshold Default

#### Normalize Findings to the Declared Scope

The ordered `declared_nfr_criteria` map is the complete assessment scope. Drop
worker findings and gaps for generic checklist categories absent from that map.
For each declared criterion, keep exactly one finding identified by
`criterion_id`. If a worker omitted it, create one CONCERNS finding. Step 1b
derives the complete gap list from ledger support, so worker-authored gap labels
never enter the report. Keep findings in declared source order.

```javascript
domains.forEach((domain) => {
  const declared = subagentContext.declared_nfr_criteria[domain] || [];
  const returned = new Map();
  (assessments[domain].findings || []).forEach((finding) => {
    if (!finding || typeof finding.criterion_id !== 'string' || finding.criterion_id.length === 0) {
      throw new Error(`${domain} worker returned a malformed finding`);
    }
    if (returned.has(finding.criterion_id)) {
      throw new Error(`${domain} worker returned duplicate criterion_id: ${finding.criterion_id}`);
    }
    returned.set(finding.criterion_id, finding);
  });
  assessments[domain].findings = declared.map((criterion) => {
    const finding = returned.get(criterion.id);
    if (finding) {
      return {
        ...finding,
        criterion_id: criterion.id,
        category: criterion.label,
        recommendations: Array.isArray(finding.recommendations) ? finding.recommendations : [],
      };
    }
    return {
      criterion_id: criterion.id,
      category: criterion.label,
      status: 'CONCERNS',
      description: 'No assessment was returned for this declared criterion.',
      evidence: [],
      recommendations: [],
    };
  });
  assessments[domain].evidence_gaps = [];

  assessments[domain].findings.forEach((finding, index) => {
    if (declared[index].threshold === 'UNKNOWN') {
      finding.status = 'CONCERNS';
    }
  });
});
```

Requirements documents belong only in each criterion's `threshold_source`.
They do not become findings, evidence, or gaps. A domain with no declared
criteria is N/A and contributes no gap.

---

### 1b. Audit Every Citation Before Aggregation

Treat the `implementation-evidence` entries in
`subagentContext.supplied_evidence_ledger` as the only publication allowlist.
Each ledger observation must name a stable `criterion_id` from the declared
scope. Audit worker citations, then replace each finding's evidence with every
ledger observation bound to that criterion. Normalize paths to the spelling
relative to `supplied_project_root`, with no project-directory prefix. A
requirements or threshold-source document is always rejected as implementation
evidence.

```javascript
const projectDirectory = path.basename(subagentContext.supplied_project_root.replace(/[\\/]+$/, ''));
const canonicalEvidencePath = (candidate) => {
  if (typeof candidate !== 'string' || path.isAbsolute(candidate)) return null;
  let normalized = candidate.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith(`${projectDirectory}/`)) normalized = normalized.slice(projectDirectory.length + 1);
  if (!normalized || normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) return null;
  const resolved = path.resolve(subagentContext.supplied_project_root, normalized);
  const relative = path.relative(subagentContext.supplied_project_root, resolved).replace(/\\/g, '/');
  if (relative !== normalized || relative.startsWith('../')) return null;
  return normalized;
};
const declaredEntries = domains.flatMap((domain) =>
  (subagentContext.declared_nfr_criteria[domain] || []).map((criterion) => [criterion.id, { ...criterion, domain }]),
);
const declaredById = new Map(declaredEntries);
if (declaredById.size !== declaredEntries.length) throw new Error('Declared NFR criterion IDs must be globally unique');
const thresholdSourcePaths = new Set(
  [...declaredEntries.map(([, criterion]) => criterion), ...(subagentContext.recorded_only_nfr_criteria || [])]
    .map((criterion) => canonicalEvidencePath(criterion.threshold_source))
    .filter(Boolean),
);
const evidenceLedger = new Map();
const evidenceByCriterion = new Map();
const ledgerEntries = subagentContext.supplied_evidence_ledger;
if (!Array.isArray(ledgerEntries)) throw new Error('supplied_evidence_ledger must be an array');

ledgerEntries.forEach((entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Malformed supplied-evidence ledger entry');
  const canonicalPath = canonicalEvidencePath(entry.path);
  if (canonicalPath !== entry.path) throw new Error(`Ledger path is not canonical: ${entry.path}`);
  if (entry.source_type !== 'implementation-evidence') {
    throw new Error(`Ledger entry has invalid source_type: ${entry.path}`);
  }
  if (thresholdSourcePaths.has(entry.path)) {
    throw new Error(`Threshold source is mislabeled as implementation evidence: ${entry.path}`);
  }
  if (evidenceLedger.has(entry.path)) throw new Error(`Duplicate ledger path: ${entry.path}`);
  const resolved = path.resolve(subagentContext.supplied_project_root, entry.path);
  if (!fs.existsSync(resolved) || !fs.lstatSync(resolved).isFile()) {
    throw new Error(`Ledger path is not a supplied regular file: ${entry.path}`);
  }
  if (!Array.isArray(entry.observations) || entry.observations.length === 0) {
    throw new Error(`Ledger entry has no criterion-bound observations: ${entry.path}`);
  }
  const supported = new Set();
  entry.observations.forEach((observation) => {
    if (
      !observation ||
      typeof observation !== 'object' ||
      typeof observation.criterion_id !== 'string' ||
      typeof observation.supports !== 'string' ||
      observation.supports.trim().length === 0
    ) {
      throw new Error(`Malformed ledger observation: ${entry.path}`);
    }
    if (!declaredById.has(observation.criterion_id)) {
      throw new Error(`Ledger observation names undeclared criterion_id: ${observation.criterion_id}`);
    }
    const key = `${observation.criterion_id}\0${observation.supports}`;
    if (supported.has(key)) throw new Error(`Duplicate ledger observation: ${entry.path} -> ${observation.criterion_id}`);
    supported.add(key);
    const evidence = { path: entry.path, supports: observation.supports };
    const bound = evidenceByCriterion.get(observation.criterion_id) || [];
    bound.push(evidence);
    evidenceByCriterion.set(observation.criterion_id, bound);
  });
  evidenceLedger.set(entry.path, supported);
});

for (const [criterionId, evidence] of evidenceByCriterion) {
  evidenceByCriterion.set(
    criterionId,
    evidence
      .filter((item, index, all) => all.findIndex((other) => other.path === item.path && other.supports === item.supports) === index)
      .sort((left, right) => left.path.localeCompare(right.path) || left.supports.localeCompare(right.supports)),
  );
}
const citationAudit = [];

domains.forEach((domain) => {
  assessments[domain].evidence_gaps ||= [];
  assessments[domain].findings.forEach((finding) => {
    const evidence = Array.isArray(finding.evidence) ? finding.evidence : [];
    const normalized = evidence.map((item) => ({ ...item, path: canonicalEvidencePath(item?.path) }));
    const allowedForCriterion = new Set(
      (evidenceByCriterion.get(finding.criterion_id) || []).map((item) => `${item.path}\0${item.supports}`),
    );
    const rejected = normalized.filter((item) => {
      if (!item || typeof item.path !== 'string' || typeof item.supports !== 'string') return true;
      return (
        !evidenceLedger.get(item.path)?.has(`${finding.criterion_id}\0${item.supports}`) ||
        !allowedForCriterion.has(`${item.path}\0${item.supports}`)
      );
    });
    finding.evidence = evidenceByCriterion.get(finding.criterion_id) || [];
    if (rejected.length > 0) citationAudit.push({ domain, criterion_id: finding.criterion_id, rejected });
    const criterion = declaredById.get(finding.criterion_id);
    finding.description =
      finding.evidence.length === 0
        ? `${criterion.label}: no supplied implementation evidence.`
        : `${criterion.label}: ${finding.evidence.map((item) => item.supports).join('; ')}.`;
    const gapMessage =
      criterion.threshold === 'UNKNOWN'
        ? `${criterion.label}: declared threshold is UNKNOWN`
        : rejected.length > 0
          ? `${criterion.label}: submitted citation rejected by publication audit`
          : finding.evidence.length === 0
            ? `${criterion.label}: no supplied implementation evidence`
            : null;
    if (gapMessage === null) return;
    finding.status = 'CONCERNS';
    const gap = { criterion_id: finding.criterion_id, message: gapMessage };
    assessments[domain].evidence_gaps.push(gap);
    citationAudit.push({ domain, criterion_id: finding.criterion_id, rejected, gap });
  });
});
```

The normalizer accepts the two equivalent incoming spellings solely to produce
one canonical output spelling. Any other spelling is rejected. Never publish the project-directory prefix, a
rejected path, a threshold source as implementation evidence, or an unsupported
statement. This step cites all valid bound observations even when a worker
omitted some, which keeps grounded criterion coverage stable. Preserve the one
fixed structured gap per unsupported declared criterion in the report. If the workflow's
status vocabulary declares a separate undecidable value for this context, use
that value and preserve the same gap.

### 1c. Roll Each Domain's Findings Into Its Domain Status

A worker reports findings. The domain has one status of its own, and this is
where it is computed, by the rule stated in
`{skill-root}/steps-c/nfr-status-definitions.md` (see "Domain Status"): the worst
status among the domain's findings, with N/A deciding nothing.

This runs after 1a and 1b, so a PASS downgraded for an unknown threshold or
missing evidence is already CONCERNS here and cannot roll a domain up to PASS.

```javascript
const DOMAIN_STATUS_ORDER = ['FAIL', 'CONCERNS', 'PASS'];

const worstStatus = (statuses) => {
  const judged = statuses.filter((status) => DOMAIN_STATUS_ORDER.includes(status));
  // Every finding N/A is the one case where the domain is N/A: no finding
  // carried a judgment, so there is no worst one.
  if (judged.length === 0) return 'N/A';
  return DOMAIN_STATUS_ORDER.find((candidate) => judged.includes(candidate));
};

const domainStatuses = Object.fromEntries(
  domains.map((domain) => [domain, worstStatus(assessments[domain].findings.map((finding) => finding.status))]),
);
```

Step 5 writes these four values into the gate artifact's `audited_domains` block
and into each `## <Domain> Assessment` section, and the two have to agree.

---

### 2. Calculate Overall Risk Level

**Risk hierarchy:** HIGH > MEDIUM > LOW > NONE

```javascript
const riskLevels = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
const riskFromFindings = (findings) => {
  if (findings.some((finding) => finding.status === 'FAIL')) return 'HIGH';
  if (findings.some((finding) => finding.status === 'CONCERNS')) return 'MEDIUM';
  if (findings.some((finding) => finding.status === 'PASS')) return 'LOW';
  return 'NONE';
};
const domainRiskLevels = Object.fromEntries(domains.map((domain) => [domain, riskFromFindings(assessments[domain].findings)]));
const domainRisks = domains.map((domain) => domainRiskLevels[domain]);
const maxRiskValue = Math.max(...domainRisks.map((r) => riskLevels[r]));
const overallRisk = Object.keys(riskLevels).find((k) => riskLevels[k] === maxRiskValue);
```

**Risk assessment:**

- If ANY domain is HIGH → overall is HIGH
- If ANY domain is MEDIUM (and none HIGH) → overall is MEDIUM
- If ALL domains are LOW/NONE → overall is LOW

---

### 3. Aggregate Compliance Status

```javascript
const declaredCompliance = subagentContext.declared_compliance || {};
if (!declaredCompliance || typeof declaredCompliance !== 'object' || Array.isArray(declaredCompliance)) {
  throw new Error('declared_compliance must be an object');
}
const complianceSummary = Object.fromEntries(
  Object.entries(declaredCompliance).map(([standard, declaration]) => {
    if (!declaration || declaration.explicitly_declared !== true || !['PASS', 'PARTIAL', 'FAIL'].includes(declaration.status)) {
      throw new Error(`Malformed explicitly declared compliance entry: ${standard}`);
    }
    return [standard, declaration.status];
  }),
);
```

Ignore worker-authored compliance keys. A compliance standard absent from
`declared_compliance` is absent from the summary; silence never becomes PASS.

---

### 4. Identify Cross-Domain Risks

Record a cross-domain risk only when the audited findings share an exact ledger
evidence item. A pair of domain statuses alone does not support a factual
cross-domain claim.

```javascript
const crossDomainRisks = [];

for (let leftIndex = 0; leftIndex < domains.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < domains.length; rightIndex += 1) {
    const leftDomain = domains[leftIndex];
    const rightDomain = domains[rightIndex];
    for (const left of assessments[leftDomain].findings) {
      for (const right of assessments[rightDomain].findings) {
        const rightEvidence = new Set(right.evidence.map((item) => `${item.path}\0${item.supports}`));
        const shared = left.evidence.filter((item) => rightEvidence.has(`${item.path}\0${item.supports}`));
        if (shared.length === 0) continue;
        crossDomainRisks.push({
          domains: [leftDomain, rightDomain],
          description: `{CROSS_DOMAIN_INTERPRETATION_OF_${left.category}_AND_${right.category}}`,
          evidence: shared,
        });
      }
    }
  }
}
```

Replace the braced description only with an interpretation supported by the
shared evidence. If the relationship itself is not supported, omit the risk.

---

### 5. Aggregate Priority Actions

```javascript
const allPriorityActions = domains.flatMap((domain) =>
  assessments[domain].findings.flatMap((finding) =>
    finding.recommendations.map((action) => ({
      domain,
      criterion_id: finding.criterion_id,
      action,
      urgency: finding.status === 'FAIL' ? 'URGENT' : 'NORMAL',
    })),
  ),
);

// Sort by urgency
const prioritizedActions = allPriorityActions.sort(
  (left, right) =>
    Number(right.urgency === 'URGENT') - Number(left.urgency === 'URGENT') ||
    left.domain.localeCompare(right.domain) ||
    left.criterion_id.localeCompare(right.criterion_id) ||
    String(left.action).localeCompare(String(right.action)),
);
const normalizedDomainAssessments = Object.fromEntries(
  domains.map((domain) => [
    domain,
    {
      status: domainStatuses[domain],
      risk_level: domainRiskLevels[domain],
      findings: assessments[domain].findings,
      evidence_gaps: assessments[domain].evidence_gaps,
      priority_actions: prioritizedActions.filter((action) => action.domain === domain),
      summary: {
        pass: assessments[domain].findings.filter((finding) => finding.status === 'PASS').length,
        concerns: assessments[domain].findings.filter((finding) => finding.status === 'CONCERNS').length,
        fail: assessments[domain].findings.filter((finding) => finding.status === 'FAIL').length,
      },
    },
  ]),
);
```

---

### 6. Generate Executive Summary

```javascript
const resolvedMode = subagentContext?.execution?.resolvedMode ?? 'unknown';
const subagentExecutionLabel =
  resolvedMode === 'sequential'
    ? 'SEQUENTIAL (4 NFR domains)'
    : resolvedMode === 'agent-team'
      ? 'AGENT-TEAM (4 NFR domains)'
      : resolvedMode === 'subagent'
        ? 'SUBAGENT (4 NFR domains)'
        : 'MODE-DEPENDENT (4 NFR domains)';

const performanceGainLabel =
  resolvedMode === 'sequential'
    ? 'baseline (no parallel speedup)'
    : resolvedMode === 'agent-team' || resolvedMode === 'subagent'
      ? '~67% faster than sequential'
      : 'mode-dependent';

const executiveSummary = {
  overall_risk: overallRisk,
  assessment_date: new Date().toISOString(),

  domain_assessments: normalizedDomainAssessments,

  // The four values step 5 writes into the gate artifact's `audited_domains`
  // block. They are carried here rather than recomputed there, so the artifact
  // and the report sections cannot drift apart between the two steps.
  domain_statuses: domainStatuses,

  compliance_summary: complianceSummary,

  cross_domain_risks: crossDomainRisks,

  priority_actions: prioritizedActions,

  // Step 5 must confirm this audit contains no rejected citation before it
  // publishes the report. Rejected items have already been removed from each
  // finding and converted into explicit evidence gaps above.
  citation_audit: citationAudit,

  risk_breakdown: {
    security: domainRiskLevels.security,
    performance: domainRiskLevels.performance,
    reliability: domainRiskLevels.reliability,
    maintainability: domainRiskLevels.maintainability,
  },

  subagent_execution: subagentExecutionLabel,
  performance_gain: performanceGainLabel,
};

// Save for Step 5 (report generation)
fs.writeFileSync('/tmp/tea-nfr-summary-{{timestamp}}.json', JSON.stringify(executiveSummary, null, 2), 'utf8');
```

---

### 7. Display Summary to User

```text
✅ NFR Evidence Audit Complete ({subagentExecutionLabel})

🎯 Overall Risk Level: {overallRisk}

📊 Domain Risk Breakdown:
- Security:      {security_risk}
- Performance:   {performance_risk}
- Reliability:   {reliability_risk}
- Maintainability: {maintainability_risk}

✅ Compliance Summary:
{list standards with PASS/PARTIAL/FAIL}

⚠️ Cross-Domain Risks: {cross_domain_risk_count}

🎯 Priority Actions: {priority_action_count}

🚀 Performance: {performanceGainLabel}

✅ Ready for report generation (Step 5)
```

---

---

### 8. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it using the workflow template (if available) with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-04e-aggregate-nfr']
  lastStep: 'step-04e-aggregate-nfr'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-04e-aggregate-nfr'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-04e-aggregate-nfr'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document.

---

## EXIT CONDITION

Proceed to Step 5 when:

- ✅ All subagent outputs read
- ✅ A domain status rolled up for each of the four domains
- ✅ Overall risk calculated
- ✅ Compliance aggregated
- ✅ Summary saved
- ✅ Progress saved to output document

Load next step: `{nextStepFile}`

---

## 🚨 SYSTEM SUCCESS METRICS

### ✅ SUCCESS:

- All 4 NFR domains aggregated correctly
- Overall risk level determined
- Executive summary complete

### ❌ FAILURE:

- Failed to read subagent outputs
- Risk calculation incorrect
