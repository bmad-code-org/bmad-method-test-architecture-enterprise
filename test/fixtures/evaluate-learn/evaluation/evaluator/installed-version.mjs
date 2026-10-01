#!/usr/bin/env node

// Version probe for a Node framework dependency, listed in evaluator/frameworks.json as
//   "probe": { "command": "evaluator/installed-version.mjs", "args": ["<package>"] }
// Prints { "package", "version" } from the installed package's package.json, found in the nearest
// node_modules above this file as Node finds a module, and exits 1 when the package is not installed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const name = process.argv[2];

/** The package.json of `name` in the nearest node_modules directory at or above `start`, or null. */
function installedManifest(start) {
  for (let directory = start; ; directory = path.dirname(directory)) {
    const manifestFile = path.join(directory, 'node_modules', ...name.split('/'), 'package.json');
    if (fs.existsSync(manifestFile)) {
      try {
        return { manifestFile, manifest: JSON.parse(fs.readFileSync(manifestFile, 'utf8')) };
      } catch (error) {
        return { manifestFile, manifest: null, problem: error.message };
      }
    }
    if (path.dirname(directory) === directory) return null;
  }
}

if (name && /^(?:@[\w.~-]+\/)?[\w.~-]+$/.test(name) && !name.startsWith('.')) {
  const found = installedManifest(path.dirname(fileURLToPath(import.meta.url)));
  if (found === null) {
    process.stderr.write(`${name} is not installed in a node_modules directory above evaluator/\n`);
    process.exitCode = 1;
  } else if (found.manifest?.name !== name || typeof found.manifest.version !== 'string') {
    process.stderr.write(`${found.manifestFile} does not describe ${name} with a version${found.problem ? `: ${found.problem}` : ''}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`${JSON.stringify({ package: found.manifest.name, version: found.manifest.version })}\n`);
  }
} else {
  process.stderr.write('usage: installed-version.mjs <package name>\n');
  process.exitCode = 2;
}
