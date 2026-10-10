/** Source preservation and transactional publication for evidence audit workflows. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WorkflowError, projectPath } = require('./workflow-cli');

/** Compare both canonical paths and existing inode aliases. */
function aliases(left, right) {
  if (left === right) return true;
  if (!fs.existsSync(left) || !fs.existsSync(right)) return false;
  const a = fs.statSync(left);
  const b = fs.statSync(right);
  return a.dev === b.dev && a.ino === b.ino;
}
/** Test a canonical directory boundary. */
function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
/** Inventory supplied directories, including symlink topology, without traversing cycles. */
function inventory(projectRoot, values) {
  const files = new Set();
  const directories = new Set();
  const topology = [];
  const visited = new Set();
  function walk(value) {
    const lexical = path.resolve(projectRoot, value);
    const target = projectPath(projectRoot, value, 'supplied source');
    const link = fs.lstatSync(lexical);
    const stat = fs.statSync(target);
    topology.push([lexical, link.isSymbolicLink() ? fs.readlinkSync(lexical) : '', target, stat.dev, stat.ino, link.mode, stat.mode]);
    if (stat.isFile()) files.add(target);
    else if (stat.isDirectory()) {
      directories.add(target);
      if (visited.has(target)) return;
      visited.add(target);
      for (const entry of fs.readdirSync(target).sort()) {
        if (['.git', 'node_modules'].includes(entry)) continue;
        walk(path.join(target, entry));
      }
    } else throw new WorkflowError('usage', 'supplied sources must contain regular files or directories');
  }
  try {
    for (const value of values) walk(value);
  } catch (error) {
    throw error instanceof WorkflowError
      ? error
      : new WorkflowError('usage', `unreadable supplied source: ${error.message}`, { cause: error });
  }
  return { files: [...files].sort(), directories: [...directories].sort(), topology: topology.sort((a, b) => a[0].localeCompare(b[0])) };
}
/** Freeze both source bytes and supplied directory membership. */
function protectSources(projectRoot, values) {
  const state = inventory(projectRoot, values);
  const digests = state.files.map((file) => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
  return {
    ...state,
    assertUnchanged() {
      try {
        const current = inventory(projectRoot, values);
        if (JSON.stringify(current) !== JSON.stringify(state)) throw new Error('source topology changed');
        for (const [file, digest] of digests) {
          if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== digest) throw new Error(file);
        }
      } catch (error) {
        throw new WorkflowError('environment-parser', `the agent changed a supplied source: ${error.message}`, { cause: error });
      }
    },
  };
}
/** Reject output destinations sharing source paths, inodes, or supplied directory descendants. */
function protectPublication(projectRoot, destinations, protection) {
  const canonical = destinations.map((file) => projectPath(projectRoot, file, 'output destination'));
  if (
    canonical.some(
      (file) => protection.files.some((input) => aliases(file, input)) || protection.directories.some((dir) => within(dir, file)),
    )
  )
    throw new WorkflowError('usage', 'output destinations overlap supplied sources; select separate output and evidence directories');
  if (canonical.some((file, index) => canonical.slice(0, index).some((other) => aliases(file, other))))
    throw new WorkflowError('usage', 'output destinations alias each other');
  return canonical;
}
/** Read only a new regular file from the current attempt. */
function freshArtifact(attemptDir, value) {
  const lexical = path.resolve(attemptDir, value);
  let stat;
  try {
    stat = fs.lstatSync(lexical);
  } catch (error) {
    throw new WorkflowError('environment-parser', `required artifact is unavailable: ${value}`, { cause: error });
  }
  const target = projectPath(attemptDir, lexical, 'generated artifact');
  if (!stat.isFile() || stat.nlink !== 1 || target !== lexical)
    throw new WorkflowError('environment-parser', `generated artifact must be a fresh regular file in this attempt: ${value}`);
  const text = fs.readFileSync(target, 'utf8');
  if (!text.trim()) throw new WorkflowError('environment-parser', `generated artifact is empty: ${value}`);
  return { path: target, text };
}
/** Stage the complete artifact set before replacing files, and roll back partial publication. */
function publishArtifacts(artifacts, { projectRoot, runDir, protection }, io = fs) {
  const targets = protectPublication(
    projectRoot,
    artifacts.map((artifact) => artifact.destination),
    protection,
  );
  const staged = [];
  let keepBackups = false;
  try {
    for (const [index, artifact] of artifacts.entries()) {
      const target = targets[index];
      io.mkdirSync(path.dirname(target), { recursive: true });
      const directory = io.mkdtempSync(path.join(path.dirname(target), '.tea-publish-'));
      const item = {
        target,
        directory,
        next: path.join(directory, 'next'),
        previous: path.join(directory, 'previous'),
        existed: io.existsSync(target),
        installed: false,
      };
      staged.push(item);
      if (item.existed) {
        if (!io.statSync(target).isFile()) throw new Error(`publication destination is not a regular file: ${target}`);
        io.copyFileSync(target, item.previous);
      }
      if (typeof artifact.text === 'string') io.writeFileSync(item.next, artifact.text, { flag: 'wx' });
      else io.copyFileSync(artifact.path, item.next);
      if (item.existed) io.chmodSync(item.next, io.statSync(target).mode);
    }
    protection.assertUnchanged();
    protectPublication(projectRoot, targets, protection);
    for (const item of staged) {
      io.renameSync(item.next, item.target);
      item.installed = true;
    }
    return targets;
  } catch (error_) {
    const rollbackErrors = [];
    for (const item of staged.filter((entry) => entry.installed).toReversed()) {
      try {
        if (item.existed) io.renameSync(item.previous, item.target);
        else io.unlinkSync(item.target);
      } catch (error) {
        rollbackErrors.push(`${item.target}: ${error.message}`);
      }
    }
    keepBackups = rollbackErrors.length > 0;
    const status = keepBackups
      ? `recovery backups: ${staged.map((item) => item.directory).join(', ')}; rollback errors: ${rollbackErrors.join('; ')}`
      : 'previous artifacts restored';
    const failureClass = error_ instanceof WorkflowError ? error_.failureClass : 'environment-configuration';
    const error = new WorkflowError(failureClass, `could not publish artifacts: ${error_.message}; ${status}`, {
      cause: error_,
    });
    error.runDir = runDir;
    throw error;
  } finally {
    if (!keepBackups)
      for (const item of staged) {
        try {
          io.rmSync(item.directory, { recursive: true, force: true });
        } catch (error) {
          process.stderr.write(`publication staging cleanup failed at ${item.directory}: ${error.message}\n`);
        }
      }
  }
}
module.exports = { inventory, protectSources, protectPublication, freshArtifact, publishArtifacts };
