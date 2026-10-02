/**
 * What one test-design document scores against one fixture set, reduced to what a
 * reader can check by hand.
 *
 * The result holds the document-global mentions the contract's oracles are paired
 * with, the per-group shape counts, and the identity of every check that did not
 * pass. A document `readDesign` refuses records `{ "unmeasurable": <failure class> }`,
 * the class `runCase` reports for that environment failure.
 *
 * `test/test-eval-replay.js` stores this for every document under
 * `test/replay/test-design/`, and `tools/generate-probes.js` performs it again on
 * the documents of a mutation cycle, so a stored result and a performed arm are
 * one function. Nothing here reads the clock, the filesystem or the agent.
 */

'use strict';

const { readDesign: readTestDesign, scoreRun: scoreTestDesignRun } = require('../eval-test-design');

/**
 * @param {string} text The design document.
 * @param {object} set The fixture set it is scored against.
 * @param {Set<string>} categories The risk categories the workflow declares.
 * @returns {object}
 */
function projectTestDesignResult(text, set, categories) {
  const read = readTestDesign({ kind: 'text', value: text });
  if (!read.ok) return { unmeasurable: read.failureClass };

  const scored = scoreTestDesignRun(set, read.design, categories);
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

module.exports = { projectTestDesignResult };
