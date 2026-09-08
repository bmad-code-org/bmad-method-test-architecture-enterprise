/**
 * The fragment list out of a runner reply.
 *
 * Lifted out of test/eval-fragment-selection.js unchanged when
 * cli/fragment-selection-runner.js started producing the reply the harness used
 * to parse inline. Two copies of this would let a fenced-block spelling be
 * accepted by the runner and rejected by the scorer, which is the drift
 * test/contracts/README.md already records for the report parser that
 * `verdict.findings` replaced.
 *
 * Returns null when nothing parseable came back, so "the contract changed" never
 * reports as "the agent selected nothing", which would look like a real and very
 * bad result.
 */

'use strict';

/**
 * @param {string} stdout - The runner reply, in full.
 * @returns {string[]|null} The selected fragment file names, or null when the reply carries no fragment list.
 */
function parseSelection(stdout) {
  const text = String(stdout || '');
  const candidates = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/g;
  for (const match of text.matchAll(fenced)) candidates.push(match[1]);
  const braced = /\{[\s\S]*"fragments"[\s\S]*\}/.exec(text);
  if (braced) candidates.push(braced[0]);
  candidates.push(text);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim());
      if (Array.isArray(parsed?.fragments)) {
        return parsed.fragments
          .map((name) =>
            String(name)
              .replace(/^knowledge\//, '')
              .trim(),
          )
          .filter(Boolean);
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
}

module.exports = { parseSelection };
