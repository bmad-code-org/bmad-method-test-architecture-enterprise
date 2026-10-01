/** Project eval-quality's scored outcomes into authoring-safe partitions. */
'use strict';

const path = require('node:path');

const { readRegularJson, strengthAggregatePointer } = require('./interpret');

/**
 * Writes `partitions.json` and `gap-view.json` into the run directory through its held writer (`run-directory.js`).
 * `partitions.json` carries the pointer to the run's strength aggregate, never its contents (Story 1.45).
 * `evidence` maps each scored probe to the parsed evidence artifact the writer read back from the score directory
 * (`score.js`); a probe with none has `outcome: null`.
 */
function writePartitionViews({ writer, runDirectory, scoreInvocationId, trialSets, evidence, heldOutProbes, strengthAggregate }) {
  const heldOut = new Set(heldOutProbes ?? []);
  const partitions = { scoreInvocationId, strengthAggregate: strengthAggregatePointer(strengthAggregate), development: [], 'held-out': [] };
  const gapView = { scoreInvocationId, development: [], 'held-out': [] };
  for (const set of trialSets) {
    const probe = readRegularJson(path.join(runDirectory, set.probe));
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
