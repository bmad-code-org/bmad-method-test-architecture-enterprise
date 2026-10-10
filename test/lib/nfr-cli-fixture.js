/** Controlled end-user CLI agent outputs. These are fixtures, never live model observations. */
'use strict';
const yaml = require('js-yaml');
const { DOMAINS, criterionId } = require('../../cli/lib/nfr-report');
/** Build an actual-shaped NFR report/context from the CLI's explicit contract. */
function buildAudit(prompt, mode) {
  const displayMode = mode;
  if (['decorated-concerns', 'unknown-gap-display', 'unknown-gap-invalid'].includes(mode)) mode = 'unknown';
  if (mode === 'decorated-fail') mode = 'fail';
  if (mode === 'decorated-na') mode = 'na';
  const context = JSON.parse(
    prompt.match(/Required shape \(empty arrays are shape examples, fill all actual declared criteria\): (.*)\./)[1],
  );
  const reportPath = JSON.parse(prompt.match(/Produce a completed scope-specific audit at (.*)\./)[1]);
  const contextPath = JSON.parse(prompt.match(/canonical workflow context at (.*?)\. Required shape/)[1]);
  const thresholds = ['TLS 1.3', 'p95 below 300 ms', 'uptime 99.9%', 'coverage 80%'];
  const measured = ['TLS 1.3', 'p95 200 ms', 'uptime 99.99%', 'coverage 90%'];
  const labels = ['Encryption', 'Latency', 'Availability', 'Coverage'];
  const statuses = {};
  for (const [index, domain] of DOMAINS.entries()) {
    const id = criterionId(domain, labels[index]);
    const status = mode === 'fail' && index === 0 ? 'FAIL' : mode === 'unknown' && index === 0 ? 'CONCERNS' : 'PASS';
    const criterion = {
      id,
      label: labels[index],
      order: index + 1,
      threshold: mode === 'unknown' && index === 0 ? 'UNKNOWN' : thresholds[index],
      threshold_source: 'requirements.md',
    };
    context.declared_nfr_criteria[domain] = mode === 'na' ? [] : [criterion];
    context.domain_assessments[domain] = {
      status: mode === 'na' ? 'N/A' : status,
      findings:
        mode === 'na' ? [] : [{ criterion_id: id, status, evidence: [{ path: 'evidence/measured.txt', supports: measured[index] }] }],
      evidence_gaps: mode === 'unknown' && index === 0 ? [{ criterion_id: id, message: labels[index] + ': UNKNOWN threshold' }] : [],
    };
    statuses[domain] = context.domain_assessments[domain].status;
  }
  context.supplied_evidence_ledger =
    mode === 'na'
      ? []
      : [
          {
            path: 'evidence/measured.txt',
            source: 'supplied',
            source_type: 'implementation-evidence',
            domains: DOMAINS,
            observations: DOMAINS.map((domain, index) => ({
              criterion_id: criterionId(domain, labels[index]),
              supports: measured[index],
            })).sort((a, b) => a.criterion_id.localeCompare(b.criterion_id)),
          },
        ];
  if (mode === 'wrong-request') context.requestId = 'other';
  if (mode === 'wrong-threshold') context.declared_nfr_criteria.security[0].threshold = 'TLS 9.9';
  if (mode === 'invented-support') context.supplied_evidence_ledger[0].observations[0].supports = 'invented fact';
  if (mode === 'requirements-evidence') context.supplied_evidence_ledger[0].path = 'requirements.md';
  if (mode === 'missing-criterion') context.domain_assessments.security.findings = [];
  if (mode === 'extra-criterion')
    context.domain_assessments.security.findings.push({ criterion_id: 'extra', status: 'PASS', evidence: [] });
  if (mode.startsWith('recorded'))
    context.recorded_only_nfr_criteria = [
      {
        id: 'deployability-deployment',
        domain: 'deployability',
        label: 'Deployment',
        order: 5,
        threshold: 'deployment under 5 minutes',
        threshold_source: 'requirements.md',
        assessment_mode: 'recorded-only',
      },
    ];
  if (displayMode === 'unknown-gap-display') context.domain_assessments.security.evidence_gaps[0].message += ' gap';
  if (displayMode === 'unknown-gap-invalid') context.domain_assessments.security.evidence_gaps[0].message += ' ignored';
  const steps = [
    'step-01-load-context',
    'step-02-define-thresholds',
    'step-03-gather-evidence',
    'step-04e-aggregate-nfr',
    'step-05-generate-report',
  ];
  if (mode === 'native-checkpoint')
    steps.splice(
      3,
      0,
      'step-04-evaluate-and-score',
      'step-04a-subagent-security',
      'step-04b-subagent-performance',
      'step-04c-subagent-reliability',
      'step-04d-subagent-maintainability',
    );
  const progress = {
    runScope: mode === 'wrong-scope' ? 'epic' : context.runScope,
    runKey: mode === 'wrong-key' ? 'story-other' : context.runKey,
    workflowStatus: 'completed',
    stepsCompleted: mode === 'missing-progress' ? steps.slice(1) : steps,
    lastStep: steps.at(-1),
    lastSaved: new Date().toISOString(),
  };
  let report = '---\n' + yaml.dump(progress) + '---\n# NFR Assessment\n\n## Executive Summary\n\nAudit existing supplied evidence.\n';
  for (const [index, domain] of DOMAINS.entries()) {
    report += '\n## ' + domain[0].toUpperCase() + domain.slice(1) + ' Assessment\n\n**Status:** ' + statuses[domain] + '\n';
    for (const criterion of context.declared_nfr_criteria[domain])
      report +=
        '\n### ' +
        criterion.label +
        '\n\n**Status:** ' +
        (mode === 'unknown-pass' && index === 0 ? 'PASS' : statuses[domain]) +
        '\n**Threshold:** ' +
        (mode === 'unknown-pass' && index === 0 ? 'UNKNOWN' : criterion.threshold) +
        '\n**Threshold Source:** `requirements.md`\n**Actual:** ' +
        measured[index] +
        '\n**Evidence:**\n- `evidence/measured.txt`\n**Supports:**\n- ' +
        measured[index] +
        '\n';
  }
  for (const heading of [
    'Quick Wins',
    'Recommended Actions',
    'Monitoring Hooks',
    'Fail-Fast Mechanisms',
    'Evidence Gaps',
    'Findings Summary',
    'Related Artifacts',
    'Recommendations Summary',
    'Sign-Off',
  ])
    if (mode !== 'missing-section' || heading !== 'Recommended Actions')
      report +=
        '\n## ' +
        heading +
        '\n\n' +
        (heading === 'Evidence Gaps' && mode === 'unknown'
          ? 'Encryption: UNKNOWN threshold'
          : 'No additional declared actions. Existing assessment reviewed.') +
        '\n';
  if (mode === 'duplicate-domain') report += '\n## Security Assessment\n\n**Status:** PASS\n';
  if (mode.startsWith('recorded'))
    report +=
      '\n## Recorded-Only NFR Criteria\n\n| ID | Category | Label | Threshold | Source | Mode |\n| --- | --- | --- | --- | --- | --- |\n| deployability-deployment | deployability | Deployment | deployment under 5 minutes | `requirements.md` | RECORDED ONLY |' +
      (mode === 'recorded-status' ? ' FAIL |' : '') +
      '\n';
  const overall = mode === 'na' ? 'N/A' : mode === 'fail' ? 'FAIL' : mode === 'unknown' ? 'CONCERNS' : 'PASS';
  const gate = {
    audited_domains: statuses,
    overall_status: mode === 'wrong-rollup' ? 'FAIL' : overall,
    critical_issues: mode === 'fail' ? 1 : 0,
    high_priority_issues: 0,
    medium_priority_issues: 0,
    concerns: mode === 'unknown' ? 1 : 0,
    evidence_gaps: mode === 'unknown' ? 1 : 0,
    blockers: mode === 'fail',
  };
  if (mode === 'recorded-gate') gate.audited_domains.deployability = 'FAIL';
  report += '\n## Gate YAML Snippet\n\n```yaml\n' + yaml.dump({ nfr_assessment: gate }) + '```\n';
  if (mode === 'native-checkpoint')
    report = report.replaceAll(/^\*\*(Status|Threshold|Threshold Source|Actual|Evidence|Supports):/gm, '- **$1:');
  if (mode === 'tilde-example') report = report.replace(/^(---\n[\s\S]*?\n---\n)/, '$1~~~markdown\n') + '\n~~~\n';
  if (mode === 'decorated-pass') report = report.replaceAll('**Status:** PASS', '**Status:** PASS ✅');
  if (displayMode === 'decorated-concerns') report = report.replaceAll('**Status:** CONCERNS', '**Status:** CONCERNS ⚠️');
  if (displayMode === 'decorated-fail') report = report.replaceAll('**Status:** FAIL', '**Status:** FAIL ❌');
  if (displayMode === 'decorated-na') report = report.replaceAll('**Status:** N/A', '**Status:** N/A ➖');
  if (mode === 'ambiguous-status') report = report.replace('**Status:** PASS', '**Status:** PASS / FAIL');
  if (mode === 'wrong-status-glyph') report = report.replace('**Status:** PASS', '**Status:** PASS ❌');
  if (mode === 'extra-status-decoration') report = report.replace('**Status:** PASS', '**Status:** PASS ✅ ✅');
  if (mode === 'prefix-status') report = report.replace('**Status:** PASS', '**Status:** ✅ PASS');
  if (mode === 'recorded-display-case') report = report.replace('| deployability |', '| Deployability |');
  if (mode === 'recorded-wrong-category') report = report.replace('| deployability |', '| Reliability |');
  if (mode === 'tilde-yaml') report = report.replace('```yaml', '~~~yaml').replace('```\n', '~~~\n');
  if (mode === 'long-tilde-example') report = report.replace(/^(---\n[\s\S]*?\n---\n)/, '$1~~~~markdown\n') + '\n~~~~\n';
  if (mode === 'long-backtick-example') report = report.replace(/^(---\n[\s\S]*?\n---\n)/, '$1````markdown\n') + '\n````\n';
  if (mode === 'inline-actual') report = report.replace('**Actual:** TLS 1.3', '**Actual:** `TLS 1.3`');
  if (mode === 'fenced-actual') report = report.replace('**Actual:** TLS 1.3', '**Actual:**\n```text\nTLS 1.3\n```');
  if (mode === 'multiple-fenced-actual')
    report = report.replace('**Actual:** TLS 1.3', '**Actual:**\n```text\nTLS 1.3\n```\n\n```text\nTLS 1.3\n```');
  if (mode === 'invented-second-actual')
    report = report.replace('**Actual:** TLS 1.3', '**Actual:**\n```text\nTLS 1.3\n```\n\n```text\ninvented unsupported measurement\n```');
  if (mode === 'empty-fenced-actual') report = report.replace('**Actual:** TLS 1.3', '**Actual:**\n```text\n\n```');
  if (mode === 'literal-status') report = report.replace('**Status:** PASS', '```text\n**Status:** PASS\n```');
  return { context, report, reportPath, contextPath };
}
module.exports = { buildAudit };
