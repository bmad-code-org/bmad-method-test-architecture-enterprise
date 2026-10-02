'use strict';

/** The fixture repositories of Story 2.4: their files as the live ci-stage sessions read them, and a digest over those files. */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
/** What a session wrote or owns, so the digest of what it read leaves it out. */
const OUTSIDE_THE_READ = (relative) => relative === 'capture-record.json' || relative.startsWith('evals/answer-grade/');

/** Every file of a repository as relative path to bytes, runs and installed packages left out. */
function repositoryFiles(root) {
  const files = new Map();
  const walk = (directory) => {
    for (const entry of fs.readdirSync(path.join(ROOT, root, directory), { withFileTypes: true })) {
      const relative = path.posix.join(directory, entry.name);
      if (['node_modules', 'runs'].includes(entry.name)) continue;
      if (entry.isDirectory()) walk(relative);
      else files.set(relative, fs.readFileSync(path.join(ROOT, root, relative)));
    }
  };
  walk('');
  return files;
}

/** The digest of everything a session read outside the evaluation folder: each path and the SHA-256 of its bytes, in path order. */
function repositoryReadDigest(files) {
  const hash = crypto.createHash('sha256');
  for (const relative of [...files.keys()].filter((name) => !OUTSIDE_THE_READ(name)).sort())
    hash.update(`${relative}\0${crypto.createHash('sha256').update(files.get(relative)).digest('hex')}\n`);
  return `sha256:${hash.digest('hex')}`;
}

module.exports = { repositoryFiles, repositoryReadDigest };
