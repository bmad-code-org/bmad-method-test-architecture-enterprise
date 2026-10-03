#!/usr/bin/env node

// Version probe for a Node framework dependency, listed in evaluator/frameworks.json as
//   "probe": { "command": "evaluator/installed-version.mjs", "args": ["<package>"] }
// Prints { "package", "version" } from the installed package's package.json, found in the nearest
// node_modules above this file as Node finds a module. A second argument, tree or lockfile,
// adds installSource and installDigest. Repeat --importer <package> after it to resolve
// through each importing package's nearest node_modules. Exits 1 when the install cannot be read.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const name = process.argv[2];
const source = ['tree', 'lockfile'].includes(process.argv[3]) ? process.argv[3] : undefined;
const importerArgs = process.argv.slice(source === undefined ? 3 : 4);
const packageName = /^(?:@[\w.~-]+\/)?[\w.~-]+$/;
const validName = (value) => typeof value === 'string' && packageName.test(value) && !value.startsWith('.');
const validImporterArgs =
  importerArgs.length % 2 === 0 && importerArgs.every((value, index) => (index % 2 === 0 ? value === '--importer' : validName(value)));
const importers = importerArgs.filter((_, index) => index % 2 === 1);

function digest(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

/** Stable object bytes for an npm lockfile entry, independent of JSON key order. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/** Digest paths, file bytes, file execute status, empty directories and link text in sorted order. */
function treeDigest(root) {
  const hash = crypto.createHash('sha256');
  const visiting = new Set();
  function record(kind, relative, mode, bytes = Buffer.alloc(0)) {
    const label = Buffer.from(`${kind}\0${relative}\0${mode}\0${bytes.length}\0`);
    hash.update(label);
    hash.update(bytes);
  }
  function walk(file, relative) {
    const link = fs.lstatSync(file);
    if (link.isSymbolicLink()) record('link', relative, 0, Buffer.from(fs.readlinkSync(file)));
    let stat;
    try {
      stat = link.isSymbolicLink() ? fs.statSync(file) : link;
    } catch (error) {
      if (link.isSymbolicLink() && ['ENOENT', 'ENOTDIR'].includes(error.code)) {
        record('missing-target', relative, 0);
        return;
      }
      throw error;
    }
    if (stat.isDirectory()) {
      const real = fs.realpathSync(file);
      if (visiting.has(real)) throw new Error(`directory link cycle at ${relative}`);
      visiting.add(real);
      record('directory', relative, 0);
      for (const entry of fs.readdirSync(file).sort()) {
        walk(path.join(file, entry), relative === '' ? entry : `${relative}/${entry}`);
      }
      visiting.delete(real);
    } else if (stat.isFile()) {
      const descriptor = fs.openSync(file, 'r');
      try {
        const size = fs.fstatSync(descriptor).size;
        hash.update(Buffer.from(`file\0${relative}\0${stat.mode & 0o111 ? 'x' : '-'}\0${size}\0`));
        const buffer = Buffer.allocUnsafe(64 * 1024);
        let remaining = size;
        while (remaining > 0) {
          const count = fs.readSync(descriptor, buffer, 0, Math.min(buffer.length, remaining), null);
          if (count === 0) throw new Error(`installed file changed while reading ${relative}`);
          hash.update(buffer.subarray(0, count));
          remaining -= count;
        }
        if (fs.fstatSync(descriptor).size !== size) throw new Error(`installed file changed while reading ${relative}`);
      } finally {
        fs.closeSync(descriptor);
      }
    } else {
      throw new Error(`unsupported installed entry ${relative}`);
    }
  }
  walk(root, '');
  return `sha256:${hash.digest('hex')}`;
}

/** Locate the same installed path in the v1 nested dependency map. */
function lockfileV1Entry(lock, key) {
  if (!key.startsWith('node_modules/')) return;
  let dependencies = lock.dependencies;
  let entry;
  for (const name of key.slice('node_modules/'.length).split('/node_modules/')) {
    entry = dependencies?.[name];
    dependencies = entry?.dependencies;
  }
  return entry;
}

/** The package's own entry in the nearest npm package-lock.json that names it. */
function lockfileDigest(packageRoot, installedVersion) {
  if (fs.lstatSync(packageRoot).isSymbolicLink()) throw new Error(`linked package ${name} requires tree install state`);
  for (let directory = path.dirname(packageRoot); ; directory = path.dirname(directory)) {
    const file = path.join(directory, 'package-lock.json');
    if (fs.existsSync(file)) {
      const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
      const key = path.relative(directory, packageRoot).split(path.sep).join('/');
      const entry =
        lock.lockfileVersion === 1 ? lockfileV1Entry(lock, key) : [2, 3].includes(lock.lockfileVersion) ? lock.packages?.[key] : undefined;
      if (entry !== undefined) {
        if (entry.link === true) throw new Error(`lockfile entry for ${name} is a link; use tree install state`);
        if (entry.version !== installedVersion)
          throw new Error(
            `lockfile entry for ${name} is ${entry.version ?? 'missing a version'}; installed package is ${installedVersion}`,
          );
        return digest(canonical(entry));
      }
    }
    if (path.dirname(directory) === directory) throw new Error(`no package-lock.json entry names ${name}`);
  }
}

/** The package.json of `packageName` in the nearest node_modules directory at or above `start`, or null. */
function installedManifest(start, packageName) {
  for (let directory = start; ; directory = path.dirname(directory)) {
    const manifestFile = path.join(directory, 'node_modules', ...packageName.split('/'), 'package.json');
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

if (validName(name) && validImporterArgs) {
  try {
    let origin = path.dirname(fileURLToPath(import.meta.url));
    for (const importer of importers) {
      const foundImporter = installedManifest(origin, importer);
      if (foundImporter === null) throw new Error(`importer chain cannot resolve ${importer} from ${origin}`);
      if (foundImporter.manifest?.name !== importer || typeof foundImporter.manifest.version !== 'string')
        throw new Error(`importer chain found ${foundImporter.manifestFile}, which does not describe ${importer} with a version`);
      origin = fs.realpathSync(path.dirname(foundImporter.manifestFile));
    }
    const found = installedManifest(origin, name);
    if (found === null) throw new Error(`${name} is not installed in a node_modules directory above ${origin}`);
    if (found.manifest?.name !== name || typeof found.manifest.version !== 'string')
      throw new Error(`${found.manifestFile} does not describe ${name} with a version${found.problem ? `: ${found.problem}` : ''}`);
    const packageRoot = path.dirname(found.manifestFile);
    const installDigest =
      source === 'tree' ? treeDigest(packageRoot) : source === 'lockfile' ? lockfileDigest(packageRoot, found.manifest.version) : undefined;
    process.stdout.write(
      `${JSON.stringify({ package: found.manifest.name, version: found.manifest.version, ...(installDigest === undefined ? {} : { installSource: source, installDigest }) })}\n`,
    );
  } catch (error) {
    process.stderr.write(`${name} ${source ?? 'version'} probe could not be read: ${error.message}\n`);
    process.exitCode = 1;
  }
} else {
  process.stderr.write('usage: installed-version.mjs <package name> [tree|lockfile] [--importer <package name>]...\n');
  process.exitCode = 2;
}
