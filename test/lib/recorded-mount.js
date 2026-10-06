'use strict';

/**
 * An observed mount as the isolation manifest records it (`cli/lib/evaluate/recorded-paths.js`).
 * The expectation is the real path put through the runtime's own substitution, so a runtime that records the real path no longer equals it.
 * The substitution reads the home and temporary directories of the process, so the call takes the `HOME` and `TMPDIR` the run's process had.
 */

const { textNeutralizer } = require('../../cli/lib/evaluate/recorded-paths');

/**
 * @param {string} real the real path the audit saw
 * @param {object} options
 * @param {string} options.folder the evaluation folder the run was given
 * @param {string|null} [options.home] the `HOME` the run's process had, when it differs from this process's
 * @param {NodeJS.ProcessEnv} [options.env] the environment the run's process was given; its `HOME` and `TMPDIR` apply
 * @returns {string}
 */
function recordedMount(real, { folder, home = null, env = {} }) {
  const saved = { HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
  const given = { HOME: home ?? env.HOME, TMPDIR: env.TMPDIR };
  try {
    for (const [name, value] of Object.entries(given)) if (value !== undefined) process.env[name] = value;
    return textNeutralizer({ folder })(real);
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

module.exports = { recordedMount };
