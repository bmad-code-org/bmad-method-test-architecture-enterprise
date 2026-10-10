'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const MarkdownIt = require('markdown-it');
const { readInput } = require('./workflow-cli');
const { liveReference } = require('./trace-live');

const GATE_TYPES = ['story', 'epic', 'release', 'hotfix'];
const COLLECTION_MODES = [
  'contract_static',
  'inventory_only',
  'runtime_manifest',
  'deferred_shared',
  'waived',
  'restricted',
  'inaccessible',
];
const GATE_STATUSES = new Set(['PASS', 'CONCERNS', 'FAIL']);
const LEVELS = ['e2e', 'api', 'component', 'unit', 'live', 'other'];

function criterionText(value) {
  const content = value.replace(/\s*\(P[0-3]\)\s*$/, '');
  const children = new MarkdownIt().parseInline(content, {})[0]?.children ?? [];
  return children
    .map((token) =>
      ['softbreak', 'hardbreak'].includes(token.type) ? ' ' : ['text', 'code_inline'].includes(token.type) ? token.content : '',
    )
    .join('')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 64)
    .replace(/-$/, '');
}

function inputError(message) {
  return Object.assign(new Error(message), { code: 'TRACE_INPUT_INVALID' });
}

/** Resolve the scope once, before allocating outputs or invoking a vendor. */
function resolveTraceTarget({ projectRoot, target, targetId, gateType }) {
  let document = null;
  let text = '';
  if (target) {
    document = path.resolve(projectRoot, target);
    try {
      text = fs.readFileSync(document, 'utf8');
    } catch (error) {
      throw inputError(`Cannot read --target ${document}: ${error.message}`);
    }
    if (!text.trim()) throw inputError(`--target ${document} is empty.`);
  }
  const basename = document ? path.basename(document, path.extname(document)) : '';
  const tokens = new MarkdownIt().parse(text, {});
  const headingIndex = tokens.findIndex((token) => token.type === 'heading_open' && token.tag === 'h1');
  const heading = headingIndex === -1 ? '' : tokens[headingIndex + 1].content;
  const inferred =
    /^story\b/i.test(heading) || /^\d+[.-]\d+[-.]/.test(basename) || /^story[-.]/i.test(basename)
      ? 'story'
      : /^epic\b/i.test(heading) || /^epic[-.]/i.test(basename)
        ? 'epic'
        : /^release\b/i.test(heading)
          ? 'release'
          : /^hotfix\b/i.test(heading)
            ? 'hotfix'
            : null;
  const type = gateType ?? inferred ?? 'story';
  if (!GATE_TYPES.includes(type)) throw inputError(`--gate-type must be one of ${GATE_TYPES.join(', ')}.`);

  let id = targetId?.trim();
  if (targetId !== undefined && !id) throw inputError('--target-id must be non-empty.');
  if (!id && type === 'epic') {
    id = heading.match(/^Epic\s+(\d+)\b/i)?.[1] ?? basename.match(/^epic[-.](\d+)(?:[-.]|$)/i)?.[1];
    if (!id && document) id = slug(heading || basename);
  }
  if (!id && type === 'story') {
    id = heading.match(/^Story\s+(\d+[.-]\d+)\b/i)?.[1] ?? basename.match(/^(?:story[-.])?(\d+[.-]\d+)(?:[-.]|$)/i)?.[1];
  }
  if (!id && type === 'release') id = heading.match(/^Release\s+(\S+)/i)?.[1];
  if (!id && type === 'hotfix') id = heading.match(/^Hotfix\s+(\S+)/i)?.[1];
  if (document && !id) throw inputError(`Cannot resolve a ${type} id from --target. Supply --target-id and --gate-type.`);
  if (!id) return { type, id: '', label: '', runScope: 'system', runKey: 'system', document };

  const keyPart = type === 'story' && document ? basename : slug(id);
  if (!keyPart) throw inputError('--target-id must contain a letter or digit.');
  return {
    type,
    id,
    label: heading || `${type[0].toUpperCase()}${type.slice(1)} ${id}`,
    runScope: type,
    runKey: `${type}-${keyPart}`,
    document,
  };
}

function tracePaths(artifactRoot, runKey) {
  const directory = path.join(artifactRoot, 'trace');
  return {
    matrix: path.join(directory, `traceability-matrix-${runKey}.md`),
    summary: path.join(directory, `e2e-trace-summary-${runKey}.json`),
    gate: path.join(directory, `gate-decision-${runKey}.json`),
  };
}

function readJson(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${file} must contain a JSON object.`);
  return value;
}

/** Capture explicitly identified requirements from the caller's source before execution. */
function sourceOracleLedger(text, source) {
  const tokens = new MarkdownIt().parse(text, {});
  const ledger = new Map();
  const add = (id, priority, requirement, line) => {
    const existing = ledger.get(id);
    if (existing) {
      if (existing.priority && priority && existing.priority !== priority)
        throw inputError(`Source oracle gives criterion ${id} conflicting priorities.`);
      if (criterionText(existing.requirement) !== criterionText(requirement))
        throw inputError(`Source oracle gives criterion ${id} conflicting requirement text.`);
      existing.priority ||= priority || null;
      return;
    }
    ledger.set(id, { id, priority: priority || null, requirement, source: `${source}:${line}` });
  };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'table_open') {
      const rows = [];
      let row;
      let line;
      while (++index < tokens.length && tokens[index].type !== 'table_close') {
        if (tokens[index].type === 'tr_open') {
          row = [];
          line = (tokens[index].map?.[0] ?? token.map?.[0] ?? 0) + 1;
        } else if (tokens[index].type === 'inline' && row) row.push(tokens[index].content.replaceAll(/[*`]/g, '').trim());
        else if (tokens[index].type === 'tr_close') rows.push({ cells: row, line });
      }
      const header = rows.shift()?.cells ?? [];
      const idIndex = header.findIndex((cell) => /^(?:id|criterion|criterion id|requirement id)$/i.test(cell));
      const requirementIndex = header.findIndex((cell) => /^(?:requirement|criterion text)$/i.test(cell));
      const priorityIndex = header.findIndex((cell) => /^priority$/i.test(cell));
      if (idIndex === -1 || requirementIndex === -1) continue;
      for (const { cells, line } of rows) {
        const priority = priorityIndex === -1 ? '' : cells[priorityIndex];
        if (priority && !/^P[0-3]$/.test(priority)) throw inputError('Source oracle has invalid priority.');
        if (!cells[idIndex] || !cells[requirementIndex]) throw inputError('Source oracle has an incomplete criterion row.');
        add(cells[idIndex], priority, cells[requirementIndex], line);
      }
    } else if (token.type === 'inline' && !(tokens[index - 1]?.type === 'heading_open' && tokens[index - 1].tag === 'h1')) {
      let pending;
      const flush = () => {
        if (pending) add(pending.id, pending.priority, pending.requirement, pending.line);
      };
      for (const [offset, line] of token.content.split('\n').entries()) {
        const claim = /^((?:AC|FR|NFR|REQ)[-_.]?\d+(?:[-_.]\d+)*)(?:\s*\((P[0-3])\))?\s*:\s*(.+)/.exec(line.replaceAll(/[*`]/g, ''));
        if (claim) {
          flush();
          pending = {
            id: claim[1],
            priority: claim[2] ?? /\b(P[0-3])\b/.exec(claim[3])?.[1],
            requirement: claim[3],
            line: (token.map?.[0] ?? 0) + offset + 1,
          };
        } else if (pending) pending.requirement += `\n${line}`;
      }
      flush();
    }
  }
  return [...ledger.values()];
}

/** Reconcile the saved Step 1 ledger with the caller's frozen source claims. */
function oracleReference(progress, sourceLedger, required, allowLegacyExplicitOracle) {
  const recorded = progress.oracleLedger;
  if (
    recorded === undefined &&
    required &&
    (!allowLegacyExplicitOracle || sourceLedger.length === 0 || sourceLedger.some((row) => !row.priority))
  )
    throw new Error('Trace progress must preserve the Step 1 oracleLedger.');
  const reference = new Map();
  if (recorded !== undefined) {
    if (!Array.isArray(recorded) || recorded.length === 0) throw new Error('Trace Step 1 oracleLedger must be a nonempty array.');
    for (const row of recorded) {
      if (
        !row ||
        typeof row.id !== 'string' ||
        !row.id.trim() ||
        !/^P[0-3]$/.test(row.priority) ||
        typeof row.requirement !== 'string' ||
        !row.requirement.trim() ||
        typeof row.source !== 'string' ||
        !row.source.trim() ||
        reference.has(row.id)
      )
        throw new Error('Trace Step 1 oracleLedger has an invalid or duplicate criterion.');
      reference.set(row.id, row);
    }
  }
  if (sourceLedger.length > 0) {
    if (recorded !== undefined && (reference.size !== sourceLedger.length || sourceLedger.some((row) => !reference.has(row.id))))
      throw new Error('Trace Step 1 oracleLedger differs from the frozen source criterion identities.');
    for (const row of sourceLedger) {
      const saved = reference.get(row.id);
      if (row.priority && saved && saved.priority !== row.priority)
        throw new Error(`Trace Step 1 criterion ${row.id} changed its explicit source priority.`);
      if (saved && (criterionText(saved.requirement) !== criterionText(row.requirement) || saved.source !== row.source))
        throw new Error(`Trace Step 1 criterion ${row.id} changed its frozen requirement text or source binding.`);
      reference.set(row.id, { ...row, priority: row.priority ?? saved?.priority, compareText: Boolean(saved) });
    }
  }
  return reference;
}

/** Read criterion claims from Markdown headings and their coverage labels. */
function matrixInventory(matrix, reference) {
  const criteria = new Map();
  const tableClaims = new Map();
  const ledgerPriorities = new Map();
  let current = null;
  let depth = 0;
  const body = matrix.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  const tokens = new MarkdownIt().parse(body, {});
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].type !== 'table_open') continue;
    const rows = [];
    let row = null;
    while (++index < tokens.length && tokens[index].type !== 'table_close') {
      if (tokens[index].type === 'tr_open') row = [];
      else if (tokens[index].type === 'inline' && row) row.push(tokens[index].content.replaceAll(/[*`]/g, '').trim());
      else if (tokens[index].type === 'tr_close') {
        rows.push(row);
        row = null;
      }
    }
    const header = rows.shift() ?? [];
    const idIndex = header.findIndex((cell) => /^(?:id|criterion|criterion id)$/i.test(cell));
    const requirementIndex = header.findIndex((cell) => /^requirement$/i.test(cell));
    const priorityIndex = header.findIndex((cell) => /^priority$/i.test(cell));
    const coverageIndex = header.findIndex((cell) => /^coverage$/i.test(cell));
    if (idIndex === -1 || priorityIndex === -1) continue;
    if (coverageIndex === -1 && !header.some((cell) => /^requirement$/i.test(cell))) continue;
    for (const cells of rows) {
      const id = cells[idIndex];
      const priority = cells[priorityIndex];
      if (!id || !/^P[0-3]$/.test(priority)) throw new Error('Trace criterion table has missing identity or priority.');
      if (ledgerPriorities.has(id) && ledgerPriorities.get(id) !== priority)
        throw new Error(`Trace criterion ${id} has conflicting priorities.`);
      ledgerPriorities.set(id, priority);
      if (coverageIndex === -1) continue;
      if (tableClaims.has(id)) throw new Error(`Trace criterion ${id} is duplicated in the matrix table.`);
      const status = /^(FULL|PARTIAL|NONE|UNIT-ONLY|INTEGRATION-ONLY)\b/.exec(cells[coverageIndex])?.[1];
      if (!status) throw new Error(`Trace criterion ${id} has invalid table coverage.`);
      tableClaims.set(id, { priority, status, requirement: requirementIndex === -1 ? undefined : cells[requirementIndex] });
    }
  }
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'heading_open') {
      const heading = tokens[index + 1].content;
      const nextDepth = Number(token.tag.slice(1));
      if (nextDepth <= depth) current = null;
      const claim = /^\*{0,2}([A-Za-z0-9][A-Za-z0-9_.-]*)\*{0,2}\s*:\s/.exec(heading);
      const priority = /\b(P[0-3])\b/.exec(heading)?.[1] ?? (claim ? ledgerPriorities.get(claim[1]) : null);
      if (!claim || (!priority && !/^[A-Za-z]+-\d+$/.test(claim[1]))) continue;
      if (!priority) throw new Error(`Trace criterion ${claim[1]} has no priority.`);
      if (ledgerPriorities.has(claim[1]) && ledgerPriorities.get(claim[1]) !== priority)
        throw new Error(`Trace criterion ${claim[1]} detail contradicts its oracle priority.`);
      if (criteria.has(claim[1])) throw new Error(`Trace criterion ${claim[1]} is duplicated.`);
      current = { priority, status: null, requirement: heading.slice(claim[0].length) };
      depth = nextDepth;
      criteria.set(claim[1], current);
    } else if (current && token.type === 'inline') {
      const coverage = /\*\*Coverage:?\*\*\s*:?\s*([A-Z-]+)/i.exec(token.content);
      if (!coverage) continue;
      if (current.status !== null) throw new Error('Trace criterion declares coverage more than once.');
      current.status = coverage[1].toUpperCase();
    }
  }
  for (const [id, criterion] of tableClaims) {
    if (criteria.has(id)) {
      const detail = criteria.get(id);
      if (detail.priority !== criterion.priority || detail.status !== criterion.status)
        throw new Error(`Trace criterion ${id} table and detail disagree.`);
      if (criterion.requirement !== undefined && criterionText(detail.requirement) !== criterionText(criterion.requirement))
        throw new Error(`Trace criterion ${id} table and detail requirement text disagree.`);
    } else criteria.set(id, criterion);
  }
  for (const id of ledgerPriorities.keys()) {
    if (!criteria.has(id)) throw new Error(`Trace oracle criterion ${id} is missing from the matrix.`);
  }
  for (const [id, expected] of reference) {
    if (!criteria.has(id) || criteria.get(id).priority !== expected.priority)
      throw new Error(`Trace criterion ${id} differs from its frozen oracle priority or is missing.`);
    if (
      expected.compareText !== false &&
      (typeof criteria.get(id).requirement !== 'string' ||
        criterionText(criteria.get(id).requirement) !== criterionText(expected.requirement))
    )
      throw new Error(`Trace criterion ${id} changed its frozen requirement text in the matrix.`);
  }
  if (reference.size > 0 && [...criteria.keys()].some((id) => !reference.has(id)))
    throw new Error('Trace matrix has criteria absent from the Step 1 oracle ledger.');
  const inventory = Object.fromEntries(['P0', 'P1', 'P2', 'P3'].map((priority) => [priority, { total: 0, covered: 0 }]));
  for (const [id, criterion] of criteria) {
    if (!['FULL', 'PARTIAL', 'NONE', 'UNIT-ONLY', 'INTEGRATION-ONLY'].includes(criterion.status))
      throw new Error(`Trace criterion ${id} has missing or invalid coverage.`);
    inventory[criterion.priority].total++;
    if (criterion.status === 'FULL') inventory[criterion.priority].covered++;
  }
  return inventory;
}

/** Check the public artifact contract and Step 5's deterministic gate invariants. */
function validateTraceOutputs({
  paths,
  target,
  collectionMode,
  allowGate,
  oracleLedger = [],
  requireOracleLedger = false,
  allowLegacyExplicitOracle = false,
  liveCapture,
  requireLiveManifest = false,
}) {
  const attemptRoot = path.dirname(path.dirname(paths.matrix));
  for (const [name, file] of Object.entries(paths)) {
    if (name === 'gate' && !fs.existsSync(file)) continue;
    try {
      readInput(attemptRoot, file, `current attempt ${name}`);
    } catch (error) {
      throw new Error(error.message, { cause: error });
    }
    if (fs.statSync(file).nlink !== 1) throw new Error(`Current attempt ${name} must be an independent regular artifact.`);
  }
  const matrix = fs.readFileSync(paths.matrix, 'utf8');
  const match = matrix.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('Trace matrix is missing progress frontmatter.');
  const progress = yaml.load(match[1]);
  if (progress?.runKey !== target.runKey || progress?.runScope !== target.runScope)
    throw new Error('Trace matrix has a different run identity.');
  if (progress.workflowStatus !== 'completed' || progress.lastStep !== 'step-05-gate-decision')
    throw new Error('Trace workflow has not completed its final step.');
  const requiredSteps = [
    'step-01-load-context',
    'step-02-discover-tests',
    'step-03-map-criteria',
    'step-04-analyze-gaps',
    'step-05-gate-decision',
  ];
  if (!Array.isArray(progress.stepsCompleted) || requiredSteps.some((step) => !progress.stepsCompleted.includes(step)))
    throw new Error('Trace matrix has incomplete workflow steps.');

  const summary = readJson(paths.summary);
  if (!/^0\.3\.\d+$/.test(summary.schema_version ?? '')) throw new Error('Trace summary must declare schema_version 0.3.x.');
  if (summary.collection_mode !== collectionMode || summary.decision_mode !== 'deterministic')
    throw new Error('Trace summary has different collection or decision settings.');
  if (!['COLLECTED', 'WAIVED', 'RESTRICTED', 'INACCESSIBLE', 'DEFERRED_SHARED'].includes(summary.collection_status))
    throw new Error('Trace summary has an unknown collection status.');
  const fixedStatus = { waived: 'WAIVED', restricted: 'RESTRICTED', inaccessible: 'INACCESSIBLE', deferred_shared: 'DEFERRED_SHARED' }[
    collectionMode
  ];
  if (fixedStatus && summary.collection_status !== fixedStatus) throw new Error('Trace summary collection status contradicts its mode.');
  if (requireLiveManifest && collectionMode === 'runtime_manifest') {
    const expectedStatus = liveCapture?.manifest ? 'COLLECTED' : 'INACCESSIBLE';
    if (summary.collection_status !== expectedStatus)
      throw new Error('Trace runtime-manifest collection status contradicts the frozen supplied evidence.');
  }
  if (summary.target?.type !== target.type || String(summary.target?.id ?? '') !== target.id)
    throw new Error('Trace summary has a different target.');
  if (!Number.isFinite(Date.parse(summary.snapshot_at))) throw new Error('Trace summary has no valid snapshot_at timestamp.');
  for (const field of ['repo', 'source_sha', 'evaluator'])
    if (typeof summary[field] !== 'string') throw new Error(`Trace summary has no ${field} string.`);
  if (!['high', 'medium', 'low'].includes(summary.confidence) || summary.oracle?.confidence !== summary.confidence)
    throw new Error('Trace summary has inconsistent oracle confidence.');
  if (
    !['formal_requirements', 'spec_artifact', 'external_pointer', 'synthetic_source'].includes(summary.oracle?.resolution_mode) ||
    !Array.isArray(summary.oracle?.sources) ||
    typeof summary.oracle.synthetic !== 'boolean'
  )
    throw new Error('Trace summary has incomplete oracle metadata.');
  if (!['acceptance_criteria', 'synthetic_requirements', 'openapi_endpoints', 'user_journeys'].includes(summary.inventory_basis))
    throw new Error('Trace summary has no concrete inventory basis.');
  for (const [name, bucket] of [
    ['inventory', summary.coverage?.inventory],
    ...['P0', 'P1', 'P2', 'P3'].map((key) => [key, summary.coverage?.priority_breakdown?.[key]]),
  ]) {
    if (
      !bucket ||
      !Number.isInteger(bucket.total) ||
      !Number.isInteger(bucket.covered) ||
      bucket.total < 0 ||
      bucket.covered < 0 ||
      bucket.covered > bucket.total
    ) {
      throw new Error(`Trace coverage ${name} has invalid counts.`);
    }
    const expected = bucket.total === 0 ? 100 : Math.round((bucket.covered / bucket.total) * 100);
    if (bucket.pct !== expected) throw new Error(`Trace coverage ${name} percentage does not match its counts.`);
  }
  const priorities = ['P0', 'P1', 'P2', 'P3'].map((key) => summary.coverage.priority_breakdown[key]);
  const reference = oracleReference(progress, oracleLedger, requireOracleLedger, allowLegacyExplicitOracle);
  const declared = matrixInventory(matrix, reference);
  for (const [priority, counts] of Object.entries(declared)) {
    const reported = summary.coverage.priority_breakdown[priority];
    if (reported.total !== counts.total || reported.covered !== counts.covered)
      throw new Error(`Trace matrix ${priority} coverage contradicts its summary.`);
  }
  if (
    priorities.reduce((total, bucket) => total + bucket.total, 0) !== summary.coverage.inventory.total ||
    priorities.reduce((total, bucket) => total + bucket.covered, 0) !== summary.coverage.inventory.covered
  )
    throw new Error('Trace priority counts disagree with overall coverage.');
  for (const level of LEVELS) {
    const bucket = summary.coverage.by_level?.[level];
    if (
      !bucket ||
      !Number.isInteger(bucket.tests) ||
      bucket.tests < 0 ||
      !Number.isInteger(bucket.criteria_covered) ||
      bucket.criteria_covered < 0
    )
      throw new Error(`Trace summary has invalid ${level} inventory.`);
  }
  for (const field of ['files', 'cases', 'skipped_cases', 'fixme_cases', 'pending_cases']) {
    if (!Number.isInteger(summary.tests?.[field]) || summary.tests[field] < 0) throw new Error(`Trace summary has invalid tests.${field}.`);
  }
  if (LEVELS.reduce((total, level) => total + summary.coverage.by_level[level].tests, 0) !== summary.tests.cases)
    throw new Error('Trace test totals disagree with level inventory.');
  for (const field of ['blockers', 'recommendations', 'rejected_evidence'])
    if (!Array.isArray(summary[field])) throw new Error(`Trace summary has no ${field} array.`);
  for (const field of ['critical_open', 'high_open', 'medium_open', 'low_open'])
    if (!Number.isInteger(summary.risk_summary?.[field]) || summary.risk_summary[field] < 0)
      throw new Error(`Trace summary has invalid risk_summary.${field}.`);
  if (!summary.live_evidence || typeof summary.live_evidence !== 'object' || Array.isArray(summary.live_evidence))
    throw new Error('Trace summary has no live_evidence metadata.');
  const frozenLive = liveReference(liveCapture, new Set(reference.keys()));
  if (frozenLive) {
    for (const field of ['present', 'freshness', 'failed'])
      if (summary.live_evidence[field] !== frozenLive[field])
        throw new Error(`Trace live evidence ${field} differs from the frozen supplied manifest.`);
    const reportedSha = summary.live_evidence.current_source_sha;
    if (reportedSha !== frozenLive.current_source_sha && !(frozenLive.current_source_sha === '' && reportedSha === 'unknown'))
      throw new Error('Trace live evidence current_source_sha differs from the frozen consuming revision.');
    if ('fresh_failed' in summary.live_evidence && summary.live_evidence.fresh_failed !== frozenLive.freshFailed)
      throw new Error('Trace live evidence fresh_failed differs from the frozen supplied manifest.');
  }
  // Step 4 counts every non-FULL P0 item as critical; P1-P3 gap buckets count NONE only.
  for (const [index, field] of ['critical_open', 'high_open', 'medium_open', 'low_open'].entries()) {
    const uncovered = priorities[index].total - priorities[index].covered;
    if (index === 0 ? summary.risk_summary[field] !== uncovered : summary.risk_summary[field] > uncovered)
      throw new Error(`Trace ${field} contradicts its uncovered priority inventory.`);
  }
  if (summary.links?.trace_report_path !== paths.matrix) throw new Error('Trace summary links to a different matrix.');

  const eligible = allowGate && summary.collection_status === 'COLLECTED';
  let gate = null;
  if (eligible) {
    if (!GATE_STATUSES.has(summary.gate_status) || summary.gate_basis !== 'priority_thresholds')
      throw new Error('Eligible trace summary has no valid gate decision.');
    const criteria = summary.gate_criteria;
    for (const field of [
      'p0_coverage_required',
      'p0_coverage_actual',
      'p1_coverage_target',
      'p1_coverage_minimum',
      'p1_coverage_actual',
      'overall_coverage_minimum',
      'overall_coverage_actual',
    ])
      if (typeof criteria?.[field] !== 'string' || !/^\d+%$/.test(criteria[field])) throw new Error(`Trace gate has invalid ${field}.`);
    for (const field of ['p0_status', 'p1_status', 'overall_status'])
      if (!['MET', 'PARTIAL', 'NOT_MET'].includes(criteria?.[field])) throw new Error(`Trace gate has invalid ${field}.`);
    // Step 5 defines these public gate fields. Validate their consistency with
    // the inventory; criterion classification remains the skill's assessment.
    const p0 = summary.coverage.priority_breakdown.P0.pct;
    const p1 = summary.coverage.priority_breakdown.P1.pct;
    const overall = summary.coverage.inventory.pct;
    const expectedCriteria = {
      p0_coverage_required: '100%',
      p0_coverage_actual: `${p0}%`,
      p0_status: p0 === 100 ? 'MET' : 'NOT_MET',
      p1_coverage_target: '90%',
      p1_coverage_minimum: '80%',
      p1_coverage_actual: `${p1}%`,
      p1_status: p1 >= 90 ? 'MET' : p1 >= 80 ? 'PARTIAL' : 'NOT_MET',
      overall_coverage_minimum: '80%',
      overall_coverage_actual: `${overall}%`,
      overall_status: overall >= 80 ? 'MET' : 'NOT_MET',
    };
    for (const [field, expected] of Object.entries(expectedCriteria))
      if (criteria[field] !== expected) throw new Error(`Trace gate ${field} contradicts the coverage inventory or Step 5 thresholds.`);
    let expectedStatus = p0 < 100 || overall < 80 || p1 < 80 ? 'FAIL' : p1 < 90 ? 'CONCERNS' : 'PASS';
    const liveOnly = summary.live_evidence.requirements_live_only;
    if (!Number.isInteger(liveOnly) || liveOnly < 0) throw new Error('Trace summary has invalid live-only coverage metadata.');
    const synthetic = summary.oracle.synthetic || ['synthetic_requirements', 'user_journeys'].includes(summary.inventory_basis);
    const liveFailed = summary.live_evidence.failed;
    if (summary.live_evidence.freshness === 'fresh' && (!Number.isInteger(liveFailed) || liveFailed < 0))
      throw new Error('Trace fresh live evidence has invalid failed count.');
    const freshFailed =
      frozenLive?.freshFailed ?? summary.live_evidence.fresh_failed ?? (summary.live_evidence.freshness === 'fresh' ? liveFailed : 0);
    if (freshFailed !== undefined && (!Number.isInteger(freshFailed) || freshFailed < 0))
      throw new Error('Trace live evidence has invalid fresh_failed count.');
    const freshFailure = freshFailed > 0;
    if (expectedStatus === 'PASS' && ((synthetic && summary.confidence !== 'high') || liveOnly > 0 || freshFailure))
      expectedStatus = 'CONCERNS';
    if (summary.gate_status !== expectedStatus) throw new Error('Trace gate decision contradicts its coverage and confidence evidence.');
    gate = readJson(paths.gate);
    if (
      gate.schema_version !== '0.1.0' ||
      gate.gate_status !== summary.gate_status ||
      gate.evaluated_at !== summary.snapshot_at ||
      gate.target?.type !== summary.target.type ||
      String(gate.target?.id ?? '') !== target.id
    )
      throw new Error('Trace gate artifact disagrees with its summary.');
    if (
      gate.collection_status !== summary.collection_status ||
      gate.gate_basis !== summary.gate_basis ||
      typeof gate.rationale !== 'string' ||
      !gate.rationale.trim() ||
      gate.critical_open !== summary.risk_summary.critical_open
    )
      throw new Error('Trace gate artifact has incomplete or inconsistent decision evidence.');
    for (const field of ['p0_status', 'p1_status', 'overall_status'])
      if (gate[field] !== criteria[field]) throw new Error(`Trace gate artifact disagrees with ${field}.`);
  } else if ('gate_status' in summary || 'gate_criteria' in summary || fs.existsSync(paths.gate) || summary.gate_basis !== 'none') {
    throw new Error('Trace collected no eligible gate, but emitted a gate signal.');
  }
  return { matrix, summary, gate };
}

/** Publish only the validated current attempt, updating the moved report link. */
function publishTraceOutputs(value, destinations, io = fs) {
  const links = { ...value.summary.links, trace_report_path: destinations.matrix };
  const summary = { ...value.summary, links };
  const gate = value.gate ? { ...value.gate, links } : null;
  const contents = {
    matrix: value.matrix,
    summary: `${JSON.stringify(summary, null, 2)}\n`,
    gate: gate ? `${JSON.stringify(gate, null, 2)}\n` : null,
  };
  const staged = [];
  let keepBackups = false;
  try {
    for (const [name, destination] of Object.entries(destinations)) {
      io.mkdirSync(path.dirname(destination), { recursive: true });
      const directory = io.mkdtempSync(path.join(path.dirname(destination), '.tea-trace-publish-'));
      const item = {
        destination,
        directory,
        previous: path.join(directory, 'previous'),
        next: path.join(directory, 'next'),
        existed: io.existsSync(destination),
        installed: false,
        remove: contents[name] === null,
      };
      staged.push(item);
      if (item.existed) {
        if (!io.statSync(destination).isFile()) throw new Error(`Trace destination is not a regular file: ${destination}`);
        io.copyFileSync(destination, item.previous);
      }
      if (!item.remove) {
        io.writeFileSync(item.next, contents[name], 'utf8');
        if (item.existed) io.chmodSync(item.next, io.statSync(destination).mode);
      }
    }
    for (const item of staged) {
      if (item.remove) {
        if (item.existed) io.unlinkSync(item.destination);
      } else io.renameSync(item.next, item.destination);
      item.installed = true;
    }
  } catch (error) {
    const failures = [];
    for (const item of staged.filter((entry) => entry.installed).toReversed()) {
      try {
        if (item.existed) io.renameSync(item.previous, item.destination);
        else if (!item.remove) io.unlinkSync(item.destination);
      } catch (error) {
        failures.push(`${item.destination}: ${error.message}`);
      }
    }
    keepBackups = failures.length > 0;
    throw new Error(
      `Trace publication failed: ${error.message}; ${keepBackups ? `recovery backups retained at ${staged.map((item) => item.directory).join(', ')}; rollback failures: ${failures.join('; ')}` : 'previous reports restored'}`,
      { cause: error },
    );
  } finally {
    if (!keepBackups) {
      for (const item of staged) {
        try {
          io.rmSync(item.directory, { recursive: true, force: true });
        } catch (error) {
          process.stderr.write(`Trace publication staging cleanup failed at ${item.directory}: ${error.message}\n`);
        }
      }
    }
  }
  return summary;
}

module.exports = {
  sourceOracleLedger,
  COLLECTION_MODES,
  GATE_TYPES,
  resolveTraceTarget,
  tracePaths,
  validateTraceOutputs,
  publishTraceOutputs,
};
