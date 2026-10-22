/** Shared deterministic Test Design scoring. No execution or harness dependencies. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { readDesign, RISK_ID_PATTERN, bandFor } = require('../test-design-parser');
const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };
const SCALE_MIN = 1;
const SCALE_MAX = 3;
const THRESHOLDS = {
  groundedRiskRecall: 0.8,
  riskPrecision: 0.8,
  scaleComplianceAccuracy: 1,
  scoreArithmeticAccuracy: 1,
  categoryValidityAccuracy: 1,
  bandPlacementAccuracy: 1,
  riskIdWellFormedAccuracy: 1,
  riskLinkResolutionAccuracy: 1,
  priorityOrderingAccuracy: 1,
  coverageMappingAccuracy: 0.8,
  maxUnscoredRiskTables: 0,
  maxUngroundedRisks: 0,
  maxTopSeverityMissed: 0,
  maxRiskCeilingExcess: 0,
  maxUnstableCases: 0,
  maxFixtureMutations: 0,
};
function normalizeText(value) {
  return String(value ?? '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchesGroups(groups, normalized) {
  if (!Array.isArray(groups) || groups.length === 0) return false;
  return groups.every((group) => group.some((token) => normalized.includes(String(token).toLowerCase())));
}

function orderedPairsFor(set) {
  const risks = set.materialRisks ?? [];
  const pairs = [];
  for (const first of risks) {
    for (const second of risks) {
      if (first.severityRank < second.severityRank) pairs.push({ higher: first.id, lower: second.id });
    }
  }
  return pairs;
}

function documentMentions(set, design) {
  const normalized = normalizeText(design.text);
  const mentions = {};
  for (const risk of set.materialRisks ?? []) {
    mentions[risk.id] = matchesGroups(risk.anyOf, normalized);
  }
  for (const risk of set.unsupportedRisks ?? []) {
    mentions[risk.id] = design.risks.some((row) => row.score > 3 && matchesGroups(risk.anyOf, normalizeText(row.description)));
  }
  return mentions;
}

function topSeverityMissed(set, missed) {
  const material = set.materialRisks ?? [];
  if (material.length === 0) return 0;
  const top = Math.min(...material.map((risk) => risk.severityRank));
  return material.filter((risk) => risk.severityRank === top && missed.includes(risk.id)).length;
}

function scoreRun(set, design, categories) {
  const { risks, coverage } = design;

  // -- shape: the checks that need no fixture at all ------------------------
  const seenIds = new Set();
  const shape = { rows: risks.length, wellFormedIds: 0, validCategories: 0, inScale: 0, arithmeticOk: 0, banded: 0, bandOk: 0 };
  const shapeFailures = [];
  for (const risk of risks) {
    if (RISK_ID_PATTERN.test(risk.id) && !seenIds.has(risk.id)) shape.wellFormedIds += 1;
    else shapeFailures.push({ id: risk.rawId, check: seenIds.has(risk.id) ? 'duplicate-risk-id' : 'risk-id-format' });
    seenIds.add(risk.id);

    if (categories.has(risk.category)) shape.validCategories += 1;
    else shapeFailures.push({ id: risk.rawId, check: 'category', actual: risk.category });

    const inScale = [risk.probability, risk.impact].every((value) => Number.isInteger(value) && value >= SCALE_MIN && value <= SCALE_MAX);
    if (inScale) shape.inScale += 1;
    else shapeFailures.push({ id: risk.rawId, check: 'scale', probability: risk.probability, impact: risk.impact });

    // Arithmetic is only a question once both factors are on the scale. A row
    // whose probability is missing has already been counted as a scale defect,
    // and counting it twice would report one wrong row as two.
    if (inScale) {
      if (risk.score === risk.probability * risk.impact) shape.arithmeticOk += 1;
      else shapeFailures.push({ id: risk.rawId, check: 'arithmetic', expected: risk.probability * risk.impact, actual: risk.score });
    }

    // The band the row is filed under is the document's own second statement about
    // that row's score, and the two have to agree. A register that bands nothing
    // leaves this denominator empty, which reports as unmeasurable rather than as a
    // pass: the template declares three bands and a document that dropped them has
    // dropped the structure the check reads.
    // Every row is checked, and a row under a heading that declares no range is a
    // band failure. Counting only the rows that sat under a declared range let a
    // single rangeless heading exempt them: `### Medium/Low-Priority Risks`, the
    // heading test-design-qa-template.md shipped before it declared `(Score 1-5)`,
    // took the denominator to zero and a score-9 risk filed beneath it scored a
    // clean 100%. `banded` is
    // therefore `rows` and the question is how many of them were placed correctly.
    shape.banded += 1;
    const placed = bandFor(risk.headings);
    if (placed && Number.isInteger(risk.score) && risk.score >= placed.band.min && risk.score <= placed.band.max) shape.bandOk += 1;
    else {
      shapeFailures.push({
        id: risk.rawId,
        check: 'band',
        score: risk.score,
        heading: placed ? placed.heading : null,
        reason: placed ? 'the score falls outside the range its heading declares' : 'no enclosing heading declares a score range',
      });
    }
  }
  // Rows the scale rejected are outside the arithmetic denominator, for the reason
  // above: one wrong row is one failure.
  const arithmeticTotal = shape.inScale;

  // -- risk links resolve ---------------------------------------------------
  const declaredIds = new Set(risks.map((risk) => risk.id));
  const links = { total: 0, resolved: 0, dangling: [] };
  for (const row of coverage) {
    for (const id of row.riskIds) {
      links.total += 1;
      if (declaredIds.has(id)) links.resolved += 1;
      else links.dangling.push(id);
    }
  }

  // -- grounding ------------------------------------------------------------
  // Material risks are matched first and a matched row is consumed, so a row that
  // names a real risk in words an exclusion also uses is never counted twice.
  const material = set.materialRisks ?? [];
  // Maximum matching over the eligible pairs, by augmenting path, rather than
  // first-come assignment in declaration order. One prose row can satisfy two
  // declared risks: "uncapped retry storms during a large backlog sync blow the 30
  // second budget" is eligible for both the retry risk and the backlog risk. Taking
  // the first row per risk let the earlier declaration claim it and left the later
  // one unmatched, so a run that reported both risks correctly scored one of them.
  const eligible = material.map((declared) => {
    const admitted = new Set(declared.categories ?? []);
    return risks
      .map((risk, index) => ({ risk, index }))
      .filter(({ risk }) => admitted.has(risk.category) && matchesGroups(declared.anyOf, normalizeText(risk.description)))
      .map(({ index }) => index);
  });
  const rowToRisk = new Map();
  const augment = (declaredIndex, seen) => {
    for (const rowIndex of eligible[declaredIndex]) {
      if (seen.has(rowIndex)) continue;
      seen.add(rowIndex);
      const held = rowToRisk.get(rowIndex);
      if (held === undefined || augment(held, seen)) {
        rowToRisk.set(rowIndex, declaredIndex);
        return true;
      }
    }
    return false;
  };
  for (const [declaredIndex] of material.entries()) augment(declaredIndex, new Set());

  const riskToRow = new Map([...rowToRisk].map(([rowIndex, declaredIndex]) => [declaredIndex, rowIndex]));
  const matches = [];
  const missed = [];
  for (const [declaredIndex, declared] of material.entries()) {
    const rowIndex = riskToRow.get(declaredIndex);
    if (rowIndex === undefined) missed.push(declared.id);
    else matches.push({ riskId: declared.id, rowId: risks[rowIndex].id });
  }

  // Scored rows above the 1–3 guard band are tested against the exclusions,
  // including a row that matched a material risk. A row asserting the unencrypted
  // queue and a cross-tenant leak in one sentence must count both claims.
  const ungrounded = [];
  for (const risk of risks) {
    if (risk.score === null || risk.score <= 3) continue;
    const invented = (set.unsupportedRisks ?? []).find((entry) => matchesGroups(entry.anyOf, normalizeText(risk.description)));
    if (invented) ungrounded.push({ unsupportedId: invented.id, rowId: risk.rawId });
  }

  // -- the risk ceiling -----------------------------------------------------
  // Every set declares one, and the threshold on the excess is zero. It was on the
  // clean control alone, which left over-reporting on the seeded set unbounded:
  // four risks the fixture never anticipated could be appended to a correct run and
  // every threshold still passed, because precision counts only the rows matching a
  // risk the epic rules out in as many words and says nothing about invention the
  // fixture did not foresee.
  const ceiling = typeof set.maxRisks === 'number' ? { maxRisks: set.maxRisks, excess: Math.max(0, risks.length - set.maxRisks) } : null;

  // -- coverage mapping -----------------------------------------------------
  // Evaluated over the material risks that were actually reported. A risk the run
  // never named is already a recall miss, and failing its coverage as well would
  // score one omission twice.
  const rowIdFor = new Map(matches.map((entry) => [entry.riskId, entry.rowId]));
  const coverageChecks = [];
  for (const declared of material) {
    const rowId = rowIdFor.get(declared.id);
    if (rowId === undefined) continue;
    const levels = coverage.filter((row) => row.riskIds.includes(rowId)).map((row) => row.level);
    const admitted = new Set((declared.acceptableCoverage ?? []).map((level) => level.toLowerCase()));
    const ok = levels.some((level) => admitted.has(level.toLowerCase()));
    coverageChecks.push({
      riskId: declared.id,
      rowId,
      ok,
      levels,
      reason: ok ? null : levels.length === 0 ? 'no coverage row links this risk' : 'no linked row uses an admitted level',
    });
  }

  // -- priority ordering ----------------------------------------------------
  // The strongest priority any coverage row gives a risk. A risk covered at both P0
  // and P2 is being treated as P0 work, and reading the weakest instead would fail
  // a run for a thorough coverage plan.
  const priorityFor = (rowId) => {
    const ranks = coverage.filter((row) => row.riskIds.includes(rowId) && row.priority !== null).map((row) => PRIORITY_RANK[row.priority]);
    return ranks.length === 0 ? null : Math.min(...ranks);
  };
  // A plan that files every risk at one priority satisfies `higher <= lower` on every
  // pair without ordering anything, so the constraint set is trivially met. Two or
  // more risks reaching a priority, all of them the same one, is an answer the metric
  // cannot read, and it is reported unmeasurable rather than as a perfect score.
  const orderingChecks = [];
  for (const pair of orderedPairsFor(set)) {
    const higherRow = rowIdFor.get(pair.higher);
    const lowerRow = rowIdFor.get(pair.lower);
    const higher = higherRow === undefined ? null : priorityFor(higherRow);
    const lower = lowerRow === undefined ? null : priorityFor(lowerRow);
    if (higher === null || lower === null) {
      // Unresolvable, so it leaves the denominator rather than passing for free.
      orderingChecks.push({ higher: pair.higher, lower: pair.lower, resolvable: false, ok: null });
      continue;
    }
    orderingChecks.push({
      higher: pair.higher,
      lower: pair.lower,
      resolvable: true,
      ok: higher <= lower,
      higherPriority: `P${higher}`,
      lowerPriority: `P${lower}`,
    });
  }

  const resolvedPriorities = new Set(
    material
      .map((declared) => rowIdFor.get(declared.id))
      .filter((rowId) => rowId !== undefined)
      .map((rowId) => priorityFor(rowId))
      .filter((rank) => rank !== null),
  );
  const flattened = resolvedPriorities.size === 1 && orderingChecks.some((check) => check.resolvable);

  return {
    set: set.id,
    mentions: documentMentions(set, design),
    shape: { ...shape, arithmeticTotal },
    shapeFailures,
    links,
    grounding: {
      declared: material.length,
      matched: matches.length,
      matches,
      missed,
      // The recall floor is 0.8 and the seeded set declares five material risks, so
      // "four of five" clears it and nothing distinguished a miss of the least
      // severe risk from a miss of the most severe one. The highest-ranked risk in
      // a set is reported or the run fails, whatever recall comes to.
      topSeverityMissed: topSeverityMissed(set, missed),
    },
    ungrounded,
    ceiling,
    coverageChecks,
    orderingChecks,
    flattenedPriorities: flattened,
    unscoredRiskTables: design.unscoredTables ?? [],
  };
}

function signatureOf(scored, mutations) {
  return JSON.stringify([
    scored.set,
    scored.mentions,
    scored.shape,
    scored.shapeFailures,
    scored.links,
    scored.grounding,
    scored.ungrounded,
    scored.ceiling,
    scored.coverageChecks,
    scored.orderingChecks,
    scored.flattenedPriorities,
    scored.unscoredRiskTables,
    mutations,
  ]);
}

function testDesignDiagnosticProjection(scored, mutations) {
  const ordering = scored.orderingChecks.filter((check) => check.resolvable);
  return {
    groundedRiskRecall: {
      expected: scored.grounding.declared,
      numerator: scored.grounding.matched,
      denominator: scored.grounding.declared,
      threshold: THRESHOLDS.groundedRiskRecall,
    },
    riskPrecision: {
      numerator: scored.shape.rows - scored.ungrounded.length,
      denominator: scored.shape.rows,
      threshold: THRESHOLDS.riskPrecision,
    },
    scaleComplianceAccuracy: {
      numerator: scored.shape.inScale,
      denominator: scored.shape.rows,
      threshold: THRESHOLDS.scaleComplianceAccuracy,
    },
    scoreArithmeticAccuracy: {
      numerator: scored.shape.arithmeticOk,
      denominator: scored.shape.arithmeticTotal,
      threshold: THRESHOLDS.scoreArithmeticAccuracy,
    },
    categoryValidityAccuracy: {
      numerator: scored.shape.validCategories,
      denominator: scored.shape.rows,
      threshold: THRESHOLDS.categoryValidityAccuracy,
    },
    bandPlacementAccuracy: {
      numerator: scored.shape.bandOk,
      denominator: scored.shape.banded,
      threshold: THRESHOLDS.bandPlacementAccuracy,
    },
    riskIdWellFormedAccuracy: {
      numerator: scored.shape.wellFormedIds,
      denominator: scored.shape.rows,
      threshold: THRESHOLDS.riskIdWellFormedAccuracy,
    },
    riskLinkResolutionAccuracy: {
      numerator: scored.links.resolved,
      denominator: scored.links.total,
      threshold: THRESHOLDS.riskLinkResolutionAccuracy,
    },
    priorityOrderingAccuracy: {
      expected: scored.orderingChecks.length,
      numerator: scored.flattenedPriorities ? 0 : ordering.filter((check) => check.ok).length,
      denominator: scored.flattenedPriorities ? 0 : ordering.length,
      threshold: THRESHOLDS.priorityOrderingAccuracy,
    },
    coverageMappingAccuracy: {
      expected: scored.coverageChecks.length,
      numerator: scored.coverageChecks.filter((check) => check.ok).length,
      denominator: scored.coverageChecks.length,
      threshold: THRESHOLDS.coverageMappingAccuracy,
    },
    ungroundedRisks: scored.ungrounded.length,
    maxUngroundedRisks: THRESHOLDS.maxUngroundedRisks,
    unscoredRiskTables: scored.unscoredRiskTables.length,
    maxUnscoredRiskTables: THRESHOLDS.maxUnscoredRiskTables,
    topSeverityMissed: scored.grounding.topSeverityMissed,
    maxTopSeverityMissed: THRESHOLDS.maxTopSeverityMissed,
    riskCeilingExcess: scored.ceiling?.excess ?? 0,
    maxRiskCeilingExcess: THRESHOLDS.maxRiskCeilingExcess,
    fixtureMutations: mutations,
    maxFixtureMutations: THRESHOLDS.maxFixtureMutations,
    maxUnstableCases: THRESHOLDS.maxUnstableCases,
  };
}
function projectTestDesignResult(text, set, categories) {
  const read = readDesign({ kind: 'text', value: text });
  if (!read.ok) return { unmeasurable: read.failureClass };

  const scored = scoreRun(set, read.design, categories);
  const resolvable = scored.orderingChecks.filter((check) => check.resolvable);
  return {
    mentions: scored.mentions,
    shape: scored.shape,
    shapeFailures: scored.shapeFailures,
    links: { total: scored.links.total, resolved: scored.links.resolved, dangling: scored.links.dangling },
    grounding: {
      declared: scored.grounding.declared,
      matched: scored.grounding.matched,
      missed: scored.grounding.missed,
      topSeverityMissed: scored.grounding.topSeverityMissed,
    },
    ungrounded: scored.ungrounded,
    ceiling: scored.ceiling,
    unscoredRiskTables: scored.unscoredRiskTables,
    coverage: {
      evaluated: scored.coverageChecks.length,
      satisfied: scored.coverageChecks.filter((check) => check.ok).length,
      failures: scored.coverageChecks
        .filter((check) => !check.ok)
        .map((check) => ({ riskId: check.riskId, reason: check.reason, levels: check.levels })),
    },
    ordering: {
      pairs: scored.orderingChecks.length,
      resolvable: resolvable.length,
      satisfied: resolvable.filter((check) => check.ok).length,
      flattened: scored.flattenedPriorities,
      failures: resolvable
        .filter((check) => !check.ok)
        .map((check) => ({
          higher: check.higher,
          lower: check.lower,
          higherPriority: check.higherPriority,
          lowerPriority: check.lowerPriority,
        })),
    },
  };
}

function loadGroundTruth() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'test-design-corpus/ground-truth.json'), 'utf8'));
}
function numericContributions(value, prefix = '', contributions = {}) {
  if (typeof value === 'number') {
    if (Number.isFinite(value) && prefix) contributions[prefix] = value;
    return contributions;
  }
  if (typeof value === 'boolean') {
    if (prefix) contributions[prefix] = value ? 1 : 0;
    return contributions;
  }
  if (Array.isArray(value)) {
    if (prefix) contributions[`${prefix}.count`] = value.length;
    return contributions;
  }
  if (value === null || typeof value !== 'object') return contributions;
  for (const [key, child] of Object.entries(value)) {
    numericContributions(child, prefix ? `${prefix}.${key}` : key, contributions);
  }
  return contributions;
}
module.exports = {
  PRIORITY_RANK,
  normalizeText,
  matchesGroups,
  orderedPairsFor,
  documentMentions,
  topSeverityMissed,
  scoreRun,
  signatureOf,
  testDesignDiagnosticProjection,
  THRESHOLDS,
  readDesign,
  projectTestDesignResult,
  loadGroundTruth,
  numericContributions,
};
