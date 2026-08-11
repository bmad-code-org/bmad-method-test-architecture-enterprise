'use strict';

// Moves everything under `## [Unreleased]` into a dated version section during a stable release.
//
// AGENTS.md asks a human to do this by hand at release time. That step gets skipped, which is why
// package.json and CHANGELOG.md have drifted apart before: an entry gets written for a version that
// was never cut, or a release ships with its notes still sitting under [Unreleased]. Doing it in the
// publish workflow removes the step that gets forgotten, and it lets the GitHub Release step find an
// exact version heading instead of falling back to the accumulating [Unreleased] block.
//
// Contributors keep writing under [Unreleased] exactly as before. Nothing about authoring changes.
//
// Usage:
//   node tools/stamp-changelog.js [--dry-run] [--file CHANGELOG.md] [--version 1.22.0]
// Env:
//   CHANGELOG_DATE=YYYY-MM-DD   override the stamped date (tests)

const fs = require('node:fs');
const path = require('node:path');

const UNRELEASED_HEADING = /^##[ \t]*\[Unreleased\][ \t]*$/m;
const ANY_HEADING = /^##[ \t]/m;

function parseArgs(argv) {
  const args = { dryRun: false, file: 'CHANGELOG.md', version: null };
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--dry-run': {
        args.dryRun = true;
        break;
      }
      case '--file': {
        args.file = argv[(i += 1)];
        break;
      }
      case '--version': {
        args.version = argv[(i += 1)];
        break;
      }
      default: {
        throw new Error(`Unknown argument: ${argv[i]}`);
      }
    }
  }
  return args;
}

function resolveVersion(explicit) {
  if (explicit) return explicit;
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
}

function resolveDate() {
  const override = process.env.CHANGELOG_DATE;
  if (override) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(override)) {
      throw new Error(`CHANGELOG_DATE must be YYYY-MM-DD, got: ${override}`);
    }
    return override;
  }
  return new Date().toISOString().slice(0, 10);
}

function stamp(source, version, date) {
  const match = source.match(UNRELEASED_HEADING);
  if (!match) {
    throw new Error('CHANGELOG.md has no "## [Unreleased]" heading. Refusing to guess where notes go.');
  }

  const escapedVersion = version.replaceAll('.', String.raw`\.`);
  const versionHeading = new RegExp(String.raw`^##[ \t]*\[${escapedVersion}\]`, 'm');
  if (versionHeading.test(source)) {
    return { changed: false, reason: `CHANGELOG.md already has a section for ${version}.` };
  }

  const bodyStart = match.index + match[0].length;
  const rest = source.slice(bodyStart);
  const nextHeadingAt = rest.search(ANY_HEADING);
  const body = (nextHeadingAt === -1 ? rest : rest.slice(0, nextHeadingAt)).trim();
  const tail = nextHeadingAt === -1 ? '' : rest.slice(nextHeadingAt);

  if (!body) {
    return { changed: false, reason: 'No entries under [Unreleased]; nothing to stamp.' };
  }

  const stamped = `## [Unreleased]\n\n## [${version}] - ${date}\n\n${body}\n\n`;
  return {
    changed: true,
    reason: `Stamped [Unreleased] into [${version}] - ${date}.`,
    output: source.slice(0, match.index) + stamped + tail,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = resolveVersion(args.version);
  const date = resolveDate();
  const source = fs.readFileSync(args.file, 'utf8');
  const result = stamp(source, version, date);

  if (!result.changed) {
    console.log(result.reason);
    return;
  }
  if (args.dryRun) {
    console.log(`[dry-run] ${result.reason}`);
    return;
  }
  fs.writeFileSync(args.file, result.output);
  console.log(result.reason);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { stamp };
