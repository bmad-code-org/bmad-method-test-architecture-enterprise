/** Validate the actual NFR workflow context against supplied sources and its report. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { WorkflowError } = require('./workflow-cli');
const DOMAINS = ['security', 'performance', 'reliability', 'maintainability'];
const STATUSES = new Set(['PASS', 'CONCERNS', 'FAIL', 'N/A']);
const STEPS = [
  'step-01-load-context',
  'step-02-define-thresholds',
  'step-03-gather-evidence',
  'step-04e-aggregate-nfr',
  'step-05-generate-report',
];
const bad = (message) => {
  throw new WorkflowError('environment-parser', message);
};
const normalized = (value) => String(value).replaceAll(/\s+/g, ' ').trim();
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
/** The workflow's worst-status rollup excludes nonapplicable domains. */
function worst(values) {
  if (values.includes('FAIL')) return 'FAIL';
  if (values.includes('CONCERNS')) return 'CONCERNS';
  return values.includes('PASS') ? 'PASS' : 'N/A';
}
/** Stable criterion identity defined by NFR step02. */
function criterionId(domain, label) {
  return `${domain}-${label}`
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}
/** Parse YAML without silently accepting duplicate keys or extra documents. */
function parseYaml(text, label) {
  try {
    return yaml.load(text);
  } catch (error) {
    bad(`invalid ${label} YAML: ${error.message}`);
  }
}
/** Read canonical project-relative files from their explicit input role. */
function sourceText(reference, projectRoot, sources, label) {
  if (
    typeof reference !== 'string' ||
    !reference ||
    path.isAbsolute(reference) ||
    reference.includes('\\') ||
    path.posix.normalize(reference) !== reference ||
    reference.startsWith('../') ||
    reference.startsWith('./')
  )
    bad(`${label} must name a canonical project-relative supplied path`);
  const file = path.join(projectRoot, reference);
  if (!sources.includes(file)) bad(`${label} is outside its supplied input role: ${reference}`);
  return normalized(fs.readFileSync(file, 'utf8'));
}
/** Require an actual source excerpt, while allowing normalized line wrapping. */
function excerpt(value, source, label) {
  if (typeof value !== 'string' || !normalized(value) || !source.includes(normalized(value)))
    bad(`${label} is not a quotation from its supplied source`);
}
/** Extract populated Markdown sections without matching headings inside fenced examples. */
function sections(text, level) {
  const visible = text.replaceAll(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, (block) => block.replaceAll(/[^\n]/g, ' '));
  const headings = [...visible.matchAll(/^(#{1,6})[ \t]+([^\n]+)\n/gm)];
  return headings
    .filter((heading) => heading[1].length === level)
    .map((heading) => {
      const next = headings.find((other) => other.index > heading.index && other[1].length <= level);
      return { label: heading[2].trim(), body: text.slice(heading.index + heading[0].length, next?.index ?? text.length) };
    });
}
/** Read a unique bold report field, including multiline evidence lists. */
function field(body, name) {
  const expression = new RegExp(
    `^[ \\t]*(?:-[ \\t]+)?\\*\\*${name}:?\\*\\*[ \\t]*:?[ \\t]*([^]*?)(?=^[ \\t]*(?:-[ \\t]+)?\\*\\*[A-Za-z]|$(?![\\s\\S]))`,
    'gim',
  );
  const values = [...body.matchAll(expression)].map((match) => match[1].trim());
  if (values.length !== 1) bad(`criterion must contain exactly one ${name} field`);
  return values[0];
}
/** Validate the fresh canonical context, exact ledger bindings, report and gate together. */
function readNfrReport(text, context, request) {
  const { projectRoot, runScope, runKey, requestId, inputs, evidenceFiles } = request;
  if (
    !context ||
    context.schemaVersion !== 1 ||
    context.requestId !== requestId ||
    context.runScope !== runScope ||
    context.runKey !== runKey ||
    context.supplied_project_root !== projectRoot
  )
    bad('the NFR context does not belong to the requested attempt and scope');
  if (
    !same(Object.keys(context.declared_nfr_criteria || {}).sort(), [...DOMAINS].sort()) ||
    !same(Object.keys(context.domain_assessments || {}).sort(), [...DOMAINS].sort())
  )
    bad('context must carry exactly the four audited domains');
  const criteria = new Map();
  const validateCriterion = (criterion, domain, previousOrder) => {
    if (
      !criterion ||
      typeof criterion.label !== 'string' ||
      !criterion.label.trim() ||
      criterion.id !== criterionId(domain, criterion.label) ||
      !Number.isSafeInteger(criterion.order) ||
      criterion.order <= previousOrder ||
      criteria.has(criterion.id)
    )
      bad(`invalid criterion identity or source order in ${domain}`);
    const source = sourceText(criterion.threshold_source, projectRoot, inputs, 'threshold source');
    if (criterion.threshold !== 'UNKNOWN') excerpt(criterion.threshold, source, `${criterion.id} threshold`);
    criteria.set(criterion.id, { ...criterion, domain });
    return criterion.order;
  };
  for (const domain of DOMAINS) {
    if (!Array.isArray(context.declared_nfr_criteria[domain])) bad(`invalid declared criteria for ${domain}`);
    let order = -1;
    for (const criterion of context.declared_nfr_criteria[domain]) order = validateCriterion(criterion, domain, order);
  }
  if (!Array.isArray(context.recorded_only_nfr_criteria))
    bad('context must include recorded-only criteria, including an empty list when none were declared');
  const recorded = new Set();
  let recordedOrder = -1;
  for (const criterion of context.recorded_only_nfr_criteria) {
    if (DOMAINS.includes(criterion.domain) || typeof criterion.domain !== 'string' || criterion.assessment_mode !== 'recorded-only')
      bad('recorded-only criteria cannot create audited domains');
    recordedOrder = validateCriterion(criterion, criterion.domain, recordedOrder);
    recorded.add(criterion.id);
  }
  if (!Array.isArray(context.supplied_evidence_ledger)) bad('context is missing the supplied evidence ledger');
  const observations = new Map();
  let lastPath = '';
  for (const entry of context.supplied_evidence_ledger) {
    if (
      !entry ||
      entry.source !== 'supplied' ||
      entry.source_type !== 'implementation-evidence' ||
      typeof entry.path !== 'string' ||
      entry.path <= lastPath ||
      !Array.isArray(entry.observations) ||
      entry.observations.length === 0
    )
      bad('invalid or unsorted supplied evidence ledger');
    lastPath = entry.path;
    const source = sourceText(entry.path, projectRoot, evidenceFiles, 'implementation evidence');
    let previous = '';
    for (const observation of entry.observations) {
      if (!observation || !criteria.has(observation.criterion_id) || recorded.has(observation.criterion_id))
        bad('ledger observation has an undeclared audited criterion');
      excerpt(observation.supports, source, `${observation.criterion_id} observation`);
      const key = `${observation.criterion_id}\0${observation.supports}`;
      if (key <= previous) bad('ledger observations must be deduplicated and sorted');
      previous = key;
      const bound = observations.get(observation.criterion_id) || [];
      bound.push({ path: entry.path, supports: observation.supports });
      observations.set(observation.criterion_id, bound);
    }
    const expectedDomains = DOMAINS.filter((domain) =>
      entry.observations.some((observation) => criteria.get(observation.criterion_id).domain === domain),
    );
    if (!same(entry.domains, expectedDomains)) bad('ledger domain bindings contradict its criterion observations');
  }
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) bad('the report is missing progress frontmatter');
  const progress = parseYaml(frontmatter[1], 'progress');
  const optionalSteps = [
    'step-04-evaluate-and-score',
    'step-04a-subagent-security',
    'step-04b-subagent-performance',
    'step-04c-subagent-reliability',
    'step-04d-subagent-maintainability',
  ];
  const completed = progress?.stepsCompleted;
  const requiredSequence = Array.isArray(completed) ? completed.filter((step) => STEPS.includes(step)) : [];
  const validSteps =
    Array.isArray(completed) &&
    new Set(completed).size === completed.length &&
    completed.every((step) => STEPS.includes(step) || optionalSteps.includes(step)) &&
    optionalSteps.every(
      (step) =>
        !completed.includes(step) ||
        (completed.indexOf(step) > completed.indexOf(STEPS[2]) && completed.indexOf(step) < completed.indexOf(STEPS[3])),
    );
  if (
    progress?.workflowStatus !== 'completed' ||
    progress.runScope !== runScope ||
    progress.runKey !== runKey ||
    progress.lastStep !== STEPS.at(-1) ||
    !validSteps ||
    !same(requiredSequence, STEPS) ||
    !(typeof progress.lastSaved === 'string' || progress.lastSaved instanceof Date) ||
    !Number.isFinite(Date.parse(progress.lastSaved))
  )
    bad('the report checkpoint does not confirm this completed run');
  const gates = [];
  for (const block of text.matchAll(/^```ya?ml[^\n]*\n([\s\S]*?)^```[ \t]*$/gm)) {
    const value = parseYaml(block[1], 'gate');
    if (value && Object.hasOwn(value, 'nfr_assessment')) gates.push(value.nfr_assessment);
  }
  if (gates.length !== 1) bad('report must carry exactly one nfr_assessment gate');
  const gate = gates[0];
  if (!gate || !same(Object.keys(gate.audited_domains || {}).sort(), [...DOMAINS].sort()) || !STATUSES.has(gate.overall_status))
    bad('gate must declare exactly four audited domains and a valid overall status');
  if (
    typeof gate.blockers !== 'boolean' ||
    ['critical_issues', 'high_priority_issues', 'medium_priority_issues', 'concerns', 'evidence_gaps'].some(
      (key) => !Number.isSafeInteger(gate[key]) || gate[key] < 0,
    )
  )
    bad('gate issue counts and blockers flag must be typed');
  const reportSections = sections(text, 2);
  for (const name of [
    'Executive Summary',
    'Quick Wins',
    'Recommended Actions',
    'Monitoring Hooks',
    'Fail-Fast Mechanisms',
    'Evidence Gaps',
    'Findings Summary',
    'Gate YAML Snippet',
    'Related Artifacts',
    'Recommendations Summary',
    'Sign-Off',
  ]) {
    const matches = reportSections.filter((section) => section.label === name);
    if (
      matches.length !== 1 ||
      !matches[0].body
        .replaceAll(/<!--[^]*?-->/g, '')
        .replaceAll(/^#{1,6}[^\n]*$/gm, '')
        .trim()
    )
      bad(`report requires one populated ${name} section`);
  }
  let concerns = 0;
  let gaps = 0;
  for (const domain of DOMAINS) {
    const domainSections = reportSections.filter((section) => section.label.toLowerCase() === `${domain} assessment`);
    if (domainSections.length !== 1) bad(`report requires exactly one ${domain} Assessment`);
    const section = domainSections[0];
    const expected = context.declared_nfr_criteria[domain];
    const assessment = context.domain_assessments[domain];
    if (
      !assessment ||
      !Array.isArray(assessment.findings) ||
      !same(
        assessment.findings.map((finding) => finding.criterion_id),
        expected.map((criterion) => criterion.id),
      )
    )
      bad(`${domain} findings omit or add declared criteria`);
    const reportFindings = sections(section.body, 3);
    if (
      !same(
        reportFindings.map((finding) => finding.label),
        expected.map((criterion) => criterion.label),
      )
    )
      bad(`${domain} report headings omit, duplicate or add declared criteria`);
    const expectedGaps = [];
    for (const [index, criterion] of expected.entries()) {
      const finding = assessment.findings[index];
      const evidence = observations.get(criterion.id) || [];
      if (!STATUSES.has(finding.status) || !same(finding.evidence, evidence))
        bad(`${criterion.id} status or evidence contradicts the canonical ledger`);
      if ((evidence.length === 0 || criterion.threshold === 'UNKNOWN') && finding.status !== 'CONCERNS')
        bad(`${criterion.id} requires CONCERNS for unknown thresholds or missing evidence`);
      if (evidence.length === 0)
        expectedGaps.push({ criterion_id: criterion.id, message: `${criterion.label}: no supplied implementation evidence` });
      if (criterion.threshold === 'UNKNOWN' && evidence.length > 0)
        expectedGaps.push({ criterion_id: criterion.id, message: `${criterion.label}: UNKNOWN threshold` });
      const body = reportFindings[index].body;
      if (
        field(body, 'Status') !== finding.status ||
        normalized(field(body, 'Threshold')) !== normalized(criterion.threshold) ||
        field(body, 'Threshold Source') !== `\`${criterion.threshold_source}\``
      )
        bad(`${criterion.id} report fields contradict its canonical criterion`);
      const actual = field(body, 'Actual');
      if (finding.status === 'PASS' && actual === 'UNKNOWN') bad(`${criterion.id} claims PASS without a known actual measurement`);
      if (
        actual !== 'UNKNOWN' &&
        !evidence.some((entry) => sourceText(entry.path, projectRoot, evidenceFiles, 'actual evidence').includes(normalized(actual)))
      )
        bad(`${criterion.id} actual is unsupported by supplied evidence`);
      const evidenceText = field(body, 'Evidence');
      const paths = [...evidenceText.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
      if (!same([...new Set(paths)], [...new Set(evidence.map((entry) => entry.path))]))
        bad(`${criterion.id} report evidence paths contradict the canonical ledger`);
      const supports = field(body, 'Supports');
      for (const entry of evidence)
        if (!normalized(supports).includes(normalized(entry.supports))) bad(`${criterion.id} report omits a bound observation`);
      if (evidence.length === 0 && (evidenceText !== 'None' || supports !== 'None' || actual !== 'UNKNOWN'))
        bad(`${criterion.id} claims unsupported implementation evidence`);
      concerns += finding.status === 'CONCERNS' ? 1 : 0;
    }
    if (!same(assessment.evidence_gaps, expectedGaps)) bad(`${domain} evidence gaps contradict its declared criteria`);
    gaps += expectedGaps.length;
    const status = worst(assessment.findings.map((finding) => finding.status));
    const prelude = section.body.split(/^### /m)[0];
    const domainStatuses = [
      ...prelude.matchAll(/^[ \t]*(?:-[ \t]+)?\*\*(?:Domain )?Status:?\*\*[ \t]*:?[ \t]*(PASS|CONCERNS|FAIL|N\/A)[ \t]*$/gim),
    ].map((match) => match[1].toUpperCase());
    const domainStatus = domainStatuses.length === 1 ? domainStatuses[0] : null;
    if (assessment.status !== status || domainStatus !== status || gate.audited_domains[domain] !== status)
      bad(`${domain} status contradicts its finding rollup`);
  }
  if (
    gate.overall_status !== worst(Object.values(gate.audited_domains)) ||
    gate.concerns !== concerns ||
    gate.evidence_gaps !== gaps ||
    gate.blockers !== (gate.overall_status === 'FAIL')
  )
    bad('gate overall status or counts contradict the normalized audit');
  const tables = reportSections.filter((section) => section.label === 'Recorded-Only NFR Criteria');
  if (tables.length > 1 || (recorded.size > 0 && tables.length !== 1)) bad('declared recorded-only criteria require one report table');
  if (tables.length === 1) {
    const rows = tables[0].body
      .split('\n')
      .filter((row) => /^\|/.test(row))
      .map((row) =>
        row
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim().replaceAll('`', '')),
      )
      .filter((cells) => cells[0] !== 'ID' && !cells.every((cell) => /^:?-+:?$/.test(cell)));
    const expectedRows = context.recorded_only_nfr_criteria.map((criterion) => [
      criterion.id,
      criterion.domain,
      criterion.label,
      criterion.threshold,
      criterion.threshold_source,
      'RECORDED ONLY',
    ]);
    if (!same(rows, expectedRows)) bad('recorded-only table adds, omits, reorders or assesses criteria');
  }
  return { status: gate.overall_status, gate, progress, context };
}
module.exports = { readNfrReport, criterionId, worst, DOMAINS };
