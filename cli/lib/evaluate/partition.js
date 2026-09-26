/** Project eval-quality's scored outcomes into authoring-safe partitions. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function writePartitionViews({ folder, runDirectory, scoreInvocationId, trialSets, scores, heldOutProbes }) {
  const heldOut = new Set(heldOutProbes ?? []);
  const partitions = { scoreInvocationId, development: [], 'held-out': [] };
  const gapView = { scoreInvocationId, development: [], 'held-out': [] };
  const byId = new Map(scores.map((score) => [score.probeId, score]));
  for (const set of trialSets) {
    const probe = JSON.parse(fs.readFileSync(path.join(runDirectory, set.probe), 'utf8'));
    const evidenceFile = byId.get(set.probeId)?.evidence;
    const evidence =
      evidenceFile === null || evidenceFile === undefined ? null : JSON.parse(fs.readFileSync(path.join(folder, evidenceFile), 'utf8'));
    const outcome = evidence?.reducedProbeOutcomes?.find((entry) => entry.probeId === set.probeId) ?? null;
    const partition = heldOut.has(set.probeId) ? 'held-out' : 'development';
    const summary = { probeId: set.probeId, probeClass: probe.probeClass, outcome };
    partitions[partition].push(summary);
    gapView[partition].push(partition === 'held-out' ? summary : { ...summary, probe });
  }
  for (const [name, value] of [
    ['partitions.json', partitions],
    ['gap-view.json', gapView],
  ])
    fs.writeFileSync(path.join(runDirectory, name), `${JSON.stringify(value, null, 2)}\n`);
}

module.exports = { writePartitionViews };
