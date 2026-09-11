/**
 * The routing answer out of a runner reply.
 *
 * Lives here rather than inside the harness for the reason cli/lib/parse-selection.js
 * records: `cli/tea-routing-runner.js` has to accept exactly the spellings
 * `test/eval-bmad-tea-routing.js` and `test/test-eval-replay.js` score, and two
 * copies of that rule would let a fenced-block reply be accepted by the runner
 * and rejected by the scorer.
 *
 * Returns null when nothing parseable came back, so "the reply was prose" never
 * reports as "the agent declined", which is a real and very different answer.
 * Everything past `action` is normalized rather than rejected: a reply that names
 * an action and forgets to say why is a measurement of a bad routing answer, and
 * a reply that is not a routing answer at all is a broken pipe. Collapsing the
 * two would let a parser change show up as a quality score.
 */

'use strict';

/** The three answers Step 8 of src/agents/bmad-tea/SKILL.md allows. */
const ROUTING_ACTIONS = ['route', 'clarify', 'decline'];

/** @returns {string|null} A trimmed non-empty string, or null for anything else. */
function text(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * @param {string} stdout - The runner reply, in full.
 * @returns {{action: string, menuCode: string|null, workflow: string|null, scope: string|null, reason: string|null, question: string|null, missing: string|null}|null}
 */
function parseRouting(stdout) {
  const source = String(stdout || '');
  const candidates = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/g;
  for (const match of source.matchAll(fenced)) candidates.push(match[1]);
  const braced = /\{[\s\S]*"action"[\s\S]*\}/.exec(source);
  if (braced) candidates.push(braced[0]);
  candidates.push(source);

  for (const candidate of candidates) {
    let parsed;
    try {
      parsed = JSON.parse(candidate.trim());
    } catch {
      continue;
    }
    const action = text(parsed?.action)?.toLowerCase();
    if (action === undefined || !ROUTING_ACTIONS.includes(action)) continue;
    return {
      action,
      menuCode: text(parsed?.menuCode)?.toUpperCase() ?? null,
      workflow: text(parsed?.workflow),
      scope: text(parsed?.scope),
      reason: text(parsed?.reason),
      question: text(parsed?.question),
      missing: text(parsed?.missing),
    };
  }
  return null;
}

module.exports = { ROUTING_ACTIONS, parseRouting };
