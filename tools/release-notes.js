'use strict';

// Fits a stable release's notes into the body a GitHub Release accepts.
//
// GitHub rejects a release body over 125,000 characters with HTTP 422, and the Create GitHub Release step runs after `npm publish`
// and the tag push, so a long CHANGELOG section fails the release after the package is already out. Notes within the budget pass
// through untouched. Longer notes are cut at the last top-level bullet that fits, so no entry is split, behind a pointer line and
// above a closing line that both link the full CHANGELOG section at the release tag.
//
// Usage (notes on stdin, result on stdout):
//   node tools/release-notes.js --version 2.0.0 --tag v2.0.0 --repo owner/name --heading "## [2.0.0] - 2026-10-09" < notes.md

const fs = require('node:fs');

// GitHub's hard limit is 125,000 characters; the budget keeps a margin under it for the pointer and truncation lines.
const GITHUB_BODY_LIMIT = 125_000;
const BODY_BUDGET = 120_000;

/** GitHub's slug of a heading line: lowercase, keep letters, digits, spaces and hyphens, spaces become hyphens. */
function headingAnchor(heading) {
  return heading
    .replace(/^#+[ \t]*/, '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N} -]/gu, '')
    .replaceAll(' ', '-');
}

function fitReleaseNotes({ notes, version, tag, repo, heading, budget = BODY_BUDGET }) {
  if (notes.length <= budget) return notes;

  const link = `https://github.com/${repo}/blob/${tag}/CHANGELOG.md#${headingAnchor(heading)}`;
  const pointer = `These notes are longer than a GitHub Release allows, so this page shows the first part. The full notes for ${version} are in [CHANGELOG.md](${link}).\n\n`;
  const closing = `\n\n_Truncated here. Continue in [CHANGELOG.md](${link})._`;
  const room = budget - pointer.length - closing.length;

  // Cut before the last top-level bullet that does not fit; fall back to a line break, then to a hard cut, for notes with no bullets.
  let cut = notes.lastIndexOf('\n- ', room);
  if (cut <= 0) cut = notes.lastIndexOf('\n', room);
  if (cut <= 0) cut = room;
  return `${pointer}${notes.slice(0, cut).replace(/^\n+/, '')}${closing}`;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!['--version', '--tag', '--repo', '--heading'].includes(flag) || argv[i + 1] === undefined) {
      throw new Error(`Unknown or incomplete argument: ${flag}`);
    }
    args[flag.slice(2)] = argv[i + 1];
  }
  for (const required of ['version', 'tag', 'repo', 'heading']) {
    if (!args[required]) throw new Error(`Missing --${required}`);
  }
  return args;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    process.stdout.write(fitReleaseNotes({ notes: fs.readFileSync(0, 'utf8'), ...args }));
  } catch (error) {
    console.error(`release-notes: ${error.message}`);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = { BODY_BUDGET, GITHUB_BODY_LIMIT, fitReleaseNotes, headingAnchor };
