/**
 * `eval-quality` proven against its own published corpus, before any TEA
 * artifact is asked to run on it.
 *
 * TEA is upgrading from `eval-quality` 1.4.0 to 3.0.0, and that upgrade moves
 * TEA's probes, contracts and command policies at the same time. A failure
 * during that migration has two candidate causes, TEA's artifacts or the
 * package, and nothing in this repository could tell them apart: every existing
 * check feeds TEA's own bytes to the package, so a package regression and a bad
 * migration read identically.
 *
 * This check removes one of those candidates. It feeds the package nothing of
 * TEA's. `eval-quality` publishes its development corpus under the `./corpus/*`
 * subpath, every entry digested in `corpus/dev/index.json`, and that index also
 * records which contracts fail compilation by design and with which failure
 * code. So the corpus states the expected result and the package computes the
 * observed one, with no TEA input on either side. If this passes and a TEA
 * migration step fails, the migration owns the failure.
 *
 * WHAT IS CHECKED
 *
 * - The resolved package version is the version `package.json` pins. The pin is
 *   exact, so a resolved version that differs means the tree is not the tree the
 *   repository declares.
 * - Every corpus file the index names exists, and its bytes digest to the digest
 *   the index records. Compiling bytes the index does not vouch for would prove
 *   nothing about the published corpus.
 * - Every corpus file is named by the index. An unlisted file is corpus content
 *   nothing attests.
 * - Every contract compiles exactly as the index declares: clean when the entry
 *   carries no `structuralFailure`, and otherwise refused with that entry's
 *   failure code. A contract that moves in either direction fails this check,
 *   including one that starts compiling, because the corpus is the statement of
 *   record and a statement nobody has to update is a statement nobody reads.
 * - The compile-and-seal example seals to the shipped brief byte for byte. That
 *   is the one artifact the package both produces and publishes, so it is the
 *   only place a consumer can hold the package's output against bytes the
 *   package authored.
 *
 * Usage:
 *   node test/test-eval-quality-corpus.js
 *
 * Exit codes:
 *   0  the corpus compiled and sealed exactly as it declares
 *   1  a compile status, a digest or the sealed brief moved, or this repository
 *      declares a pin this check cannot compare
 *   2  the package, its corpus subpath or its index could not be read, an index
 *      that names no contract, or a tree resolving a version other than the pin:
 *      in each case nothing about the corpus was measured
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const CORPUS_INDEX_SUBPATH = 'eval-quality/corpus/dev/index.json';

/**
 * The entry kinds this check knows how to read.
 *
 * An index entry of any other kind is corpus content nothing here measures, and
 * it fails rather than passing unnoticed: a release that renames `contract` or
 * adds a kind would otherwise leave this reporting a clean run over fewer
 * artifacts than the corpus ships.
 */
const KNOWN_KINDS = new Set(['contract', 'sealed-evaluator-brief', 'readme']);

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
};

/**
 * The version `package.json` pins for `eval-quality`.
 *
 * The pin is a bare version with no range operator, which is what lets this
 * compare it to the resolved version directly. A range would make the question
 * unanswerable here and is a change this check should fail on.
 */
function pinnedVersion(manifest) {
  const declared = manifest.devDependencies?.['eval-quality'];
  if (declared === undefined) throw new Error('package.json declares no eval-quality devDependency');
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(declared)) {
    throw new Error(`the eval-quality pin must be an exact version, and package.json declares ${JSON.stringify(declared)}`);
  }
  return declared;
}

/** Every file under the corpus directory, as paths relative to the package root. */
function corpusFiles(packageRoot) {
  const root = path.join(packageRoot, 'corpus');
  const found = [];
  const walk = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(path.relative(packageRoot, full).split(path.sep).join('/'));
    }
  };
  walk(root);
  return found;
}

/**
 * What `compile` did with one contract, in the vocabulary the index uses.
 *
 * `StructuralFailure` is an exported class carrying a code from the package's
 * own registry, so the refusal is read by type. Any other throw is reported as
 * itself rather than folded into a failure code, because a `RuntimeFault` here
 * would mean the corpus no longer parses, which is a different finding.
 */
function compileStatus(evalQuality, contract, artifactPath) {
  try {
    evalQuality.compile(contract);
    return { status: 'compiles' };
  } catch (error) {
    if (error instanceof evalQuality.StructuralFailure) return { status: 'refused', code: error.code };
    return { status: 'threw', detail: `${error?.constructor?.name ?? 'Error'}: ${error?.message ?? String(error)}`, artifactPath };
  }
}

/** What the index says that contract should do. */
function declaredStatus(entry) {
  return entry.structuralFailure === undefined ? { status: 'compiles' } : { status: 'refused', code: entry.structuralFailure };
}

function sameStatus(actual, declared) {
  return actual.status === declared.status && actual.code === declared.code;
}

async function main() {
  let manifestPath;
  let indexPath;
  try {
    manifestPath = require.resolve('eval-quality/package.json', { paths: [PROJECT_ROOT] });
    // Resolved through the subpath rather than through a filesystem join, so
    // this fails loudly on a release that stops exporting `./corpus/*`.
    indexPath = require.resolve(CORPUS_INDEX_SUBPATH, { paths: [PROJECT_ROOT] });
  } catch (error) {
    console.error(`${colors.red}eval-quality's published corpus could not be resolved: ${error.message}${colors.reset}`);
    console.error(
      `${colors.dim}Run npm ci. This check measures the package, so an unresolvable package is measured as nothing.${colors.reset}`,
    );
    return 2;
  }

  const packageRoot = path.dirname(manifestPath);
  const teaManifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  const resolvedVersion = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version;
  let pinned;
  try {
    pinned = pinnedVersion(teaManifest);
  } catch (error) {
    // A pin this check cannot compare is a defect in this repository, so it
    // reads as a measured failure rather than as an environment that could not
    // answer.
    console.error(`${colors.red}${error.message}${colors.reset}`);
    return 1;
  }
  if (resolvedVersion !== pinned) {
    // Exit 2. A tree that is not the tree this repository declares is an
    // environment that could not answer the question, and calling it a moved
    // corpus would read an install fault as a package regression.
    console.error(
      `${colors.red}package.json pins eval-quality ${pinned} and the installed tree resolves ${resolvedVersion}${colors.reset}`,
    );
    console.error(`${colors.dim}Run npm ci. Nothing about the published corpus was measured.${colors.reset}`);
    return 2;
  }

  const evalQuality = await import('eval-quality');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const entries = index.entries ?? [];
  if (entries.length === 0) {
    console.error(`${colors.red}${CORPUS_INDEX_SUBPATH} names no entries${colors.reset}`);
    return 2;
  }
  // Every summary this check prints counts what it compiled, and every one of
  // those counts is true of zero. A corpus that declares no contract is a
  // corpus this check cannot measure, so it says so rather than reporting a
  // clean run over nothing.
  if (!entries.some((entry) => entry.kind === 'contract')) {
    console.error(`${colors.red}${CORPUS_INDEX_SUBPATH} names ${entries.length} entr(ies) and no contract among them${colors.reset}`);
    console.error(`${colors.dim}Nothing was compiled, so nothing about the package was measured.${colors.reset}`);
    return 2;
  }

  const failures = [];

  // The index does not carry its own digest, so it is the one corpus file that
  // cannot be listed in itself.
  const indexRelative = path.relative(packageRoot, indexPath).split(path.sep).join('/');
  const listed = new Set(entries.map((entry) => entry.path));
  for (const file of corpusFiles(packageRoot)) {
    if (file === indexRelative || listed.has(file)) continue;
    failures.push(`${file} is published in the corpus and named by no index entry`);
  }

  const contracts = [];
  for (const entry of entries) {
    const absolute = path.join(packageRoot, entry.path);
    if (!fs.existsSync(absolute)) {
      failures.push(`${entry.path} is named by the index and absent from the package`);
      continue;
    }
    const digest = evalQuality.digestBytes(fs.readFileSync(absolute));
    if (digest !== entry.digest) {
      failures.push(`${entry.path} digests to ${digest} and the index records ${entry.digest}`);
      continue;
    }
    if (!KNOWN_KINDS.has(entry.kind)) {
      failures.push(`${entry.path} is published as kind ${JSON.stringify(entry.kind)}, which this check measures in no way`);
      continue;
    }
    if (entry.kind === 'contract') contracts.push(entry);
  }

  for (const entry of contracts) {
    const contract = JSON.parse(fs.readFileSync(path.join(packageRoot, entry.path), 'utf8'));
    const actual = compileStatus(evalQuality, contract, entry.path);
    const declared = declaredStatus(entry);
    if (sameStatus(actual, declared)) {
      const note = actual.status === 'compiles' ? 'compiles' : `refused: ${actual.code}`;
      console.log(`${colors.green}OK${colors.reset}   ${entry.path} ${colors.dim}(${note})${colors.reset}`);
      continue;
    }
    failures.push(`${entry.path} ${JSON.stringify(actual)}, and the index declares ${JSON.stringify(declared)}`);
  }

  // Located from the index rather than transcribed, like every other fact in
  // this file: the brief is the one sealed-evaluator-brief entry, and the
  // contract it was sealed from is the contract entry beside it. A release that
  // moves the example is then a finding here rather than a read of a path that
  // no longer exists.
  const briefEntry = entries.filter((entry) => entry.kind === 'sealed-evaluator-brief');
  if (briefEntry.length === 1) {
    const briefPath = briefEntry[0].path;
    const directory = briefPath.slice(0, briefPath.lastIndexOf('/'));
    const exampleEntry = entries.find((entry) => entry.kind === 'contract' && entry.path.startsWith(`${directory}/`));
    if (exampleEntry === undefined) {
      failures.push(`${briefPath} is a sealed brief with no contract beside it, so nothing names what it was sealed from`);
    } else {
      // Both files were digested above, so the bytes read here are the bytes
      // the index vouches for.
      const example = JSON.parse(fs.readFileSync(path.join(packageRoot, exampleEntry.path), 'utf8'));
      let sealed;
      try {
        sealed = evalQuality.serializeArtifact(evalQuality.seal(example), briefPath);
      } catch (error) {
        failures.push(`${exampleEntry.path} did not seal: ${error?.message ?? String(error)}`);
      }
      if (sealed !== undefined) {
        const shipped = fs.readFileSync(path.join(packageRoot, briefPath), 'utf8');
        if (sealed === shipped) {
          console.log(
            `${colors.green}OK${colors.reset}   ${briefPath} ${colors.dim}(sealed brief matches the shipped bytes)${colors.reset}`,
          );
        } else {
          failures.push(
            `${briefPath} sealed to ${evalQuality.digestBytes(Buffer.from(sealed, 'utf8'))} and the shipped bytes digest to ${evalQuality.digestBytes(Buffer.from(shipped, 'utf8'))}`,
          );
        }
      }
    }
  } else {
    failures.push(`the corpus names ${briefEntry.length} sealed brief(s), and the compile-and-seal example is exactly one`);
  }

  if (failures.length > 0) {
    console.error(
      `\n${colors.red}${failures.length} finding(s) against eval-quality ${resolvedVersion}'s published corpus:${colors.reset}`,
    );
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }

  const refused = contracts.filter((entry) => entry.structuralFailure !== undefined).length;
  console.log(
    `\n${colors.green}eval-quality ${resolvedVersion}: ${contracts.length} contract(s) compiled as the corpus declares` +
      ` (${contracts.length - refused} clean, ${refused} refused by design), ${entries.length} entry digest(s) matched,` +
      ` and the sealed brief matched the shipped bytes.${colors.reset}`,
  );
  return 0;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`${colors.red}${error?.stack ?? error}${colors.reset}`);
      process.exit(2);
    },
  );
}

module.exports = { compileStatus, corpusFiles, declaredStatus, pinnedVersion, sameStatus };
