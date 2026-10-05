/**
 * The neutral forms the runtime records in place of a machine path (AD-12).
 *
 * `compare --accept` copies a run's files into `baseline/` byte for byte, and `runs/` is uploaded as a CI artifact.
 * A path the runtime wrote into a record is published with it.
 * A temporary workspace, the repository that holds the project, the evaluation folder's absolute path, a private staging directory and the home directory each name the machine that produced the run.
 * Every digest a record carries is taken over the bytes written.
 * So the runtime writes the neutral form at the source, each digest anchor holds over the neutral bytes, and nothing rewrites a file afterwards.
 *
 * - A working directory inside a disposable workspace is `<workspace>`, followed by its path below the workspace's top when the launch root sits deeper.
 * - The git repository that holds the project is `<repository>`.
 * - A login's credentials file is `<credentials-file>`.
 * - An engine call's argv names a file inside the evaluation folder by its path below the folder (`runs/<run>/scoring-policy.json`), so a call reruns by hand from the evaluation folder.
 * - Any other absolute path in an argv is a private staging file, recorded as `<staging>/<file name>`.
 * - The score invocation's own directory name is `<score-invocation>`, because an invocation id is random and a replay of the same records writes another one.
 * - The engine executable is `eval-quality/<path below the package>`, or the file name of the program `TEA_EVALUATE_ENGINE_CLI` substituted.
 *
 * Stdout and stderr of a call are recorded with the same substitutions, so a path the engine prints for an argument it was given reads as that argument.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WORKSPACE = '<workspace>';
const REPOSITORY = '<repository>';
const CREDENTIALS_FILE = '<credentials-file>';
const STAGING = '<staging>';
const SCORE_INVOCATION = '<score-invocation>';

const posix = (relative) => relative.split(path.sep).join('/');

/** Whether `relative` (from `path.relative`) names something inside the directory it was taken from. */
const inside = (relative) => relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);

/**
 * The recorded working directory of a workspace: `<workspace>`, or `<workspace>/<path>` when `root` is below `top`.
 *
 * @param {{ top: string, root: string }} workspace
 * @returns {string}
 */
function workspaceDirectory({ top, root }) {
  const relative = path.relative(top, root);
  return relative === '' || !inside(relative) ? WORKSPACE : `${WORKSPACE}/${posix(relative)}`;
}

function realOrSelf(directory) {
  try {
    return fs.realpathSync.native(directory);
  } catch {
    return directory;
  }
}

/**
 * The recorder of one engine call: its argv and its output as the record states them.
 *
 * @param {object} options
 * @param {string} options.folder the evaluation folder the call ran over, whose files are recorded by their path below it
 * @param {string|null} [options.scoreInvocation] the score invocation the call belongs to, recorded as `<score-invocation>`
 * @returns {{ argument: (value: string) => string, text: (value: string) => string }}
 */
function pathRecorder({ folder, scoreInvocation = null }) {
  const roots = [...new Set([path.resolve(folder), realOrSelf(path.resolve(folder))])];
  const forms = new Map();
  const neutralInvocation = (form) =>
    scoreInvocation === null ? form : form.split(`scores/${scoreInvocation}/`).join(`scores/${SCORE_INVOCATION}/`);
  const argument = (value) => {
    if (typeof value !== 'string' || !path.isAbsolute(value)) return value;
    let form = null;
    for (const root of roots) {
      const relative = path.relative(root, value);
      if (inside(relative)) {
        form = relative === '' ? '.' : posix(relative);
        break;
      }
    }
    form = neutralInvocation(form ?? `${STAGING}/${path.basename(value)}`);
    forms.set(value, form);
    return form;
  };
  const text = (value) => {
    if (typeof value !== 'string' || value === '') return value;
    let recorded = value;
    for (const [original, form] of [...forms].sort(([a], [b]) => b.length - a.length)) recorded = recorded.split(original).join(form);
    for (const root of [...roots].sort((a, b) => b.length - a.length)) recorded = recorded.split(`${root}${path.sep}`).join('');
    return recorded;
  };
  return { argument, text };
}

/**
 * The recorded executable of an engine call.
 *
 * @param {string} cli the path the stage ran
 * @param {{ substituted: boolean, packageRoot: () => string }} options `packageRoot` is read only for the installed engine
 * @returns {string}
 */
function recordedEngineCli(cli, { substituted, packageRoot }) {
  if (substituted) return path.basename(cli);
  const relative = path.relative(packageRoot(), cli);
  return inside(relative) ? `eval-quality/${posix(relative)}` : path.basename(cli);
}

module.exports = {
  CREDENTIALS_FILE,
  REPOSITORY,
  SCORE_INVOCATION,
  STAGING,
  WORKSPACE,
  pathRecorder,
  recordedEngineCli,
  workspaceDirectory,
};
