/** Project eval-quality's scored outcomes into authoring-safe partitions. */
'use strict';

/**
 * Writes `partitions.json` and `gap-view.json` into the run directory through its held writer (`run-directory.js`).
 * `evidence` maps each scored probe to the parsed evidence artifact the writer read back from the score directory
 * (`score.js`); a probe with none has `outcome: null`.
 * `readInput(relative)` returns a run file parsed from the bytes `score` held at its input check (`score-inputs.js`),
 * so a probe file rewritten while `score` ran cannot reach a view.
 */
function writePartitionViews({ writer, readInput, scoreInvocationId, trialSets, evidence, heldOutProbes }) {
  const heldOut = new Set(heldOutProbes ?? []);
  const partitions = { scoreInvocationId, development: [], 'held-out': [] };
  const gapView = { scoreInvocationId, development: [], 'held-out': [] };
  for (const set of trialSets) {
    const probe = readInput(set.probe);
    const outcome = evidence.get(set.probeId)?.reducedProbeOutcomes?.find((entry) => entry.probeId === set.probeId) ?? null;
    const partition = heldOut.has(set.probeId) ? 'held-out' : 'development';
    const summary = { probeId: set.probeId, probeClass: probe.probeClass, outcome };
    partitions[partition].push(summary);
    gapView[partition].push(partition === 'held-out' ? summary : { ...summary, probe });
  }
  for (const [name, value] of [
    ['partitions.json', partitions],
    ['gap-view.json', gapView],
  ])
    writer.replaceJson(name, value);
}

module.exports = { writePartitionViews };
