/**
 * The exit-code table every TEA runner command shares, and the two functions
 * that read it.
 *
 * `tea-fragment-selection-runner` and `tea-trace-runner` both stand behind
 * eval-quality's command-line adapter, which records an exit code as an
 * observation and never as a fault. The code is therefore the one channel a
 * failure class survives the boundary through, and two commands spelling the
 * same class with two numbers would make a caller holding an observation guess
 * which command it came from. One table, read by both, is what keeps the two
 * commands and every caller on the same spelling.
 *
 * The names are TEA's own failure classes (test/schema/eval-result.js), so a
 * caller reading an exit code back lands on the class it would have derived from
 * a thrown error, with no second table to keep in step. `usage` has no failure
 * class: a malformed invocation is the caller's defect rather than the
 * environment's, and it is spelled 2 because every TEA harness already spells a
 * usage error 2.
 *
 * `classOfAgentError` is test/lib/eval-record.js's `classifyAgentError`,
 * restated here rather than imported: this file ships in the package and that
 * one lives under test/, so importing it would put the eval harness on the
 * published dependency path. Restating it is only safe while the two agree, so
 * test/test-probe-targets.js runs both over the same error shapes and compares
 * the answers.
 */

'use strict';

const { AGENT_ADAPTERS } = require('./agent-adapters');

const EXIT_CODES = {
  none: 0,
  usage: 2,
  'environment-configuration': 3,
  'environment-transport': 4,
  'environment-timeout': 5,
  'environment-parser': 6,
};

/** The reverse of EXIT_CODES, for a caller holding an observation's exitCode. */
function failureClassForExit(code) {
  const entry = Object.entries(EXIT_CODES).find(([, value]) => value === code);
  return entry === undefined ? 'environment-transport' : entry[0];
}

/** A thrown runAgent error, as one of the classes above. */
function classOfAgentError(error) {
  if (error.code === 'AGENT_UNKNOWN' || error.code === 'AGENT_COMMAND_REQUIRED' || String(error.code).startsWith('MODEL_')) {
    return 'environment-configuration';
  }
  if (error.code === 'AGENT_NOT_FOUND') return 'environment-transport';
  if (/timed out/i.test(error.message)) return 'environment-timeout';
  return 'environment-transport';
}

/**
 * The environment names a runner command permits on a probe request.
 *
 * The union of every adapter's own `envNames`, because those are the variables a
 * vendor call can actually consume, plus HOME and USER. Those two are not
 * decoration: eval-quality's command-line adapter passes the child nothing but
 * PATH and the names the request declares, and both shipped vendors resolve a
 * stored login through HOME. A leg that declares neither can only authenticate
 * from an API key.
 */
function vendorEnvironmentNames() {
  return [...new Set([...Object.values(AGENT_ADAPTERS).flatMap((adapter) => adapter.envNames), 'HOME', 'USER'])].sort();
}

module.exports = { EXIT_CODES, classOfAgentError, failureClassForExit, vendorEnvironmentNames };
