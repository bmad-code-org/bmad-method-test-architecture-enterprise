/**
 * Bounded environment probes, from the `tea-evaluate` runtime.
 *
 * The helper moved to `cli/lib/evaluate/bounded-probe.js` in Story 1.5, because
 * the runtime's provenance (`repositoryState`, `probeVersion`) needs it and the
 * published package cannot reach this directory. TeA's harnesses keep importing
 * it from here.
 */

'use strict';

module.exports = require('../../cli/lib/evaluate/bounded-probe');
