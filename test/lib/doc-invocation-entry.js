/**
 * The `binary.entry` for the `doc-invocations` gate's `npm run <script>`
 * dispatch. `eval-quality-gates doc-invocations` spawns this file once per
 * fenced line that matches one of the eight full-literal spellings
 * `eval-quality.config.json`'s `doc-invocations` section declares, and hands
 * it only the argument tail left after stripping the matched spelling text.
 *
 * A full per-script spelling ("npm run test:eval-data", never a shared "npm
 * run" prefix) means that tail is the trailing `# ...` comment alone: the
 * script name itself was consumed by the match, so this process is never
 * told which of the eight scripts a given invocation names. The comment is
 * the only signal left, and it is a reliable one by construction: every line
 * this gate scans carries one of eight fixed, known comments, copied
 * verbatim from docs/explanation/eval-quality-adoption-guide.md's CI-usage
 * block and, for four of the eight, from README.md's too -- which is why the
 * gate scans twelve lines today, not eight. `test/test-doc-invocation-entry.js`
 * holds this file's lookup table against both pages' literal text, line by
 * line, so a swapped or drifted comment fails there even though it would
 * still resolve to some working script here. A tail whose comment is not one
 * of the eight below never reaches real `npm`.
 *
 * A tail carrying a token before any `#` never occurs under the current
 * configuration -- every declared spelling already consumes the script name
 * up to and including it -- but would if a spelling were ever broadened to a
 * shared "npm run" prefix. That leading token is checked against the same
 * eight names directly, so a future config change this file was not updated
 * for still fails closed rather than executing whatever the tail happens to
 * name -- `npm run eval:all` or `npm run release:next` included.
 *
 * Exit codes: whatever `npm run <script>` itself exits with; 64 (sysexits.h
 * EX_USAGE, the doc-invocations gate's own `usageExit` default) when nothing
 * in the tail resolves to an allowlisted script; or 1 when a real dispatch
 * was attempted and never produced its own exit code -- `npm` itself could
 * not be spawned, or the child was killed by a signal. The two are kept
 * apart so a spawn failure never reads, to the gate, as "the documented
 * command or flag does not exist."
 */

'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EX_USAGE = 64;
const EX_DISPATCH_FAILURE = 1;
const PROJECT_ROOT = path.join(__dirname, '..', '..');

/**
 * The scripts this entry may run for real, keyed by every exact trailing
 * comment the documentation carries beside each one. A script reached from
 * more than one page carries more than one entry here, one per page's own
 * phrasing -- `test/README.md` comments its own copy of seven of these
 * scripts differently than `README.md` and the adoption guide do.
 * `ALLOWLISTED_SCRIPTS`, derived from the values, is the one hardcoded
 * allowlist both dispatch paths below check against: a matched-but-unlisted
 * line can never reach real `npm`, whichever path it arrives by.
 */
const ALLOWLIST_BY_COMMENT = new Map([
  // README.md and docs/explanation/eval-quality-adoption-guide.md
  ['fragment-selection corpus, static', 'test:eval-data'],
  ['trace corpus, static', 'test:eval-trace-data'],
  ['manifest against harness constants, and the preflight argv', 'test:eval-schemas'],
  ['96 stored outputs against the scorers', 'test:eval-replay'],
  ['are the contracts what their sources generate?', 'test:contract-sources'],
  ['does the compiler still say what the baseline records?', 'test:contracts'],
  ['does every oracle resolve, and agree with the scorer?', 'test:contract-oracles'],
  ['drive every real command through the real adapter', 'test:probe-targets'],
  // test/README.md's own phrasing for seven of the scripts above. Extension-
  // and slash-free on purpose: the gate's own faithfulness heuristic treats
  // any token containing "/" or ending in a file extension as a path to
  // realize against the real tree, silently replacing it before this file
  // ever sees it -- confirmed empirically, since these comments started out
  // as literal filenames ("test-agent-schema.js", "tools/validate-eval-
  // schemas.js") and the entry received an absolute path or the sampleInput
  // placeholder instead, identical across several different scripts. Dropping
  // the extension (and, for the one case that had one, the directory prefix)
  // keeps the comment a real identifier without ever looking like a path.
  ['eval-fragment-selection --validate-only', 'test:eval-data'],
  ['eval-trace --validate-only', 'test:eval-trace-data'],
  ['validate-eval-schemas', 'test:eval-schemas'],
  ['test-eval-replay', 'test:eval-replay'],
  ['test-contracts', 'test:contracts'],
  ['test-contract-oracles', 'test:contract-oracles'],
  ['test-probe-targets', 'test:probe-targets'],
  // test/README.md only
  ['test-agent-schema', 'test:schemas'],
  ['test-installation-components', 'test:install'],
  ['test-knowledge-base', 'test:knowledge'],
  ['test-release-metadata', 'test:release-metadata'],
  ['eval-nfr --validate-only', 'test:eval-nfr-data'],
  ['eval-ci --validate-only', 'test:eval-ci-data'],
  ['eval-test-design --validate-only', 'test:eval-test-design-data'],
  ['eval-bmad-tea-routing --validate-only', 'test:eval-routing-data'],
  ['eval-automate --validate-only', 'test:eval-automate-data'],
]);

const ALLOWLISTED_SCRIPTS = new Set(ALLOWLIST_BY_COMMENT.values());

/** No documented line resolves to a real dispatch target: refuse before `npm` runs. Reserved for this, so the gate never reads a real spawn failure the same way. */
function refuse(message) {
  console.error(`doc-invocation-entry: ${message}`);
  process.exit(EX_USAGE);
}

/** A real dispatch was attempted and never produced its own exit code. Kept off EX_USAGE on purpose: see the file header. */
function dispatchFailure(message) {
  console.error(`doc-invocation-entry: ${message}`);
  process.exit(EX_DISPATCH_FAILURE);
}

/** Runs the real script from the real repository root and propagates its exit. */
function dispatch(script, extraArgs) {
  const args = extraArgs.length > 0 ? ['run', script, '--', ...extraArgs] : ['run', script];
  // Windows resolves "npm" to npm.cmd, which spawnSync can only find through
  // a shell; every other platform runs it directly.
  const result = spawnSync('npm', args, { cwd: PROJECT_ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) {
    dispatchFailure(`could not run "npm run ${script}": ${result.error.message}`);
    return;
  }
  if (result.signal) {
    dispatchFailure(`"npm run ${script}" was killed by ${result.signal} and produced no exit code of its own`);
    return;
  }
  process.exit(result.status ?? 1);
}

function main(argv) {
  const hashIndex = argv.findIndex((token) => token.startsWith('#'));
  const leading = hashIndex === -1 ? argv : argv.slice(0, hashIndex);

  // Unreachable under the current, full-literal-spelling configuration: see
  // the file header. Kept as the defense the "Never" boundary in the story
  // this file was written for requires -- a script named outside the
  // allowlist may never run for real, however it is named.
  if (leading.length > 0) {
    const [script, ...extraArgs] = leading;
    if (!ALLOWLISTED_SCRIPTS.has(script)) {
      refuse(`"${script}" is not one of the allowlisted scripts (${[...ALLOWLISTED_SCRIPTS].join(', ')})`);
      return;
    }
    dispatch(script, extraArgs);
    return;
  }

  const comment = (hashIndex === -1 ? [] : argv.slice(hashIndex + 1)).join(' ');
  const script = ALLOWLIST_BY_COMMENT.get(comment);
  if (script === undefined) {
    refuse(`no allowlisted script is documented with the comment "${comment}"`);
    return;
  }
  dispatch(script, []);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { ALLOWLIST_BY_COMMENT, ALLOWLISTED_SCRIPTS, main };
