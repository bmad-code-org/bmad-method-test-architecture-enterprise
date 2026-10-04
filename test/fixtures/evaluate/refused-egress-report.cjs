'use strict';

/**
 * A preload (`node --require`) for Story 1.83's record case: a host with no egress proxy refuses no request, so the path from a
 * sandbox's report to `run.json` and the run's summary has nothing to carry. Each target sandbox the registry makes reports two
 * refused requests, one made three times, and four more past the record's cap, as a proxy that refused that many reports them, so the
 * run records and names every trial.
 *
 * It replaces `targetSandbox` before the registry reads it, and nothing else of the sandbox.
 */

const path = require('node:path');

const confinement = require(path.join(__dirname, '..', '..', '..', 'cli', 'lib', 'evaluate', 'confinement.js'));

const real = confinement.targetSandbox;
confinement.targetSandbox = (options) => {
  const sandbox = real(options);
  sandbox.egressReport = () => ({
    refusals: [
      {
        interfaceIds: ['verdict'],
        host: 'api.example.test',
        port: 443,
        address: null,
        reason: 'host-not-authorized',
        detail: 'host "api.example.test" is not the authorized "127.0.0.1"',
        count: 3,
      },
      {
        interfaceIds: ['verdict'],
        host: '127.0.0.1',
        port: 9,
        address: '127.0.0.1',
        reason: 'port-not-authorized',
        detail: 'port 9 is not the authorized 8',
        count: 1,
      },
    ],
    omitted: 4,
  });
  return sandbox;
};
