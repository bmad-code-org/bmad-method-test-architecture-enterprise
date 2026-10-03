'use strict';

/**
 * A preload (`node --require`) for Story 1.82's record case: no test host holds more sockets than a call can hide, so no real
 * call is cut, and the path from a sandbox's report to `run.json` and the run's summary has nothing to carry. Each target sandbox
 * the registry makes reports one cut call of two and five sockets left reachable, as a host that held more sockets than a call can
 * hide reports, so the run records and names every trial.
 *
 * It replaces `targetSandbox` before the registry reads it, and nothing else of the sandbox.
 */

const path = require('node:path');

const confinement = require(path.join(__dirname, '..', '..', '..', 'cli', 'lib', 'evaluate', 'confinement.js'));

const real = confinement.targetSandbox;
confinement.targetSandbox = (options) => {
  const sandbox = real(options);
  sandbox.socketReport = () => ({ calls: 2, truncatedCalls: 1, socketsLeftReachable: 5 });
  return sandbox;
};
