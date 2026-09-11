/**
 * No tracked text file carries an unresolved merge conflict.
 *
 * This exists because one shipped. `CHANGELOG.md` reached `main` carrying a
 * whole conflict block, `<<<<<<< HEAD` through `=======` to a trailing marker,
 * past a green CI run, past ESLint, past markdownlint, past Prettier and past
 * review. Nothing in the chain was looking for it.
 *
 * It is easy to assume `lint:md` covers this, and the reason it does not is the
 * interesting part. A trailing `>>>>>>> <sha>` marker is not markdown, so
 * Prettier reflows it into a blockquote, `> > > > > > > <sha>`, which is valid
 * markdown. Two instances landed in this repository within one night. The first
 * landed next to a heading, where the reflowed block changed the heading level
 * and `MD001/heading-increment` fired, so it was caught. The second landed
 * between two bullets, disturbed nothing, and shipped. A gate that catches a
 * class only when the class happens to disturb something else it does look at is
 * not a gate for that class, and the first catch made it look like one.
 *
 * So this looks for the markers themselves, in the four shapes they take:
 *
 *   <<<<<<<           the ours side opening
 *   =======           the divider, at the start of a line
 *   >>>>>>>           the theirs side closing
 *   > > > > > > >     the same closing after Prettier has reflowed it
 *
 * `=======` is the one that needs a rule beyond "the line starts with it",
 * because a line of exactly seven or more equals signs is also a markdown setext
 * heading underline. A setext underline sits under text; a conflict divider sits
 * in a block that also carries the other three markers. This reports a bare
 * divider only when the same file carries an opening or a closing marker too,
 * which is the difference and costs nothing, since a real conflict always has
 * both ends.
 *
 * Git's tracked text files only, from `git ls-files`, so nothing in
 * `node_modules/` or an untracked scratch file is read. Binary content is
 * skipped by a NUL check rather than by extension: an extension list is another
 * thing to keep in step with reality.
 *
 * Usage: node tools/validate-no-conflict-markers.js
 * Exit codes: 0 = clean, 1 = a marker was found, 2 = the check could not run
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..');

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
};

/** The three unambiguous markers, plus Prettier's reflow of the closing one. */
const MARKERS = [
  { label: 'conflict opening', test: (line) => line.startsWith('<<<<<<<') },
  { label: 'conflict closing', test: (line) => line.startsWith('>>>>>>>') },
  // Seven `>` separated by spaces is what Prettier makes of `>>>>>>> <sha>`: a
  // seven-deep blockquote, which is valid markdown and disturbs nothing.
  { label: 'conflict closing, reflowed into a blockquote', test: (line) => /^>(?: >){6,}/.test(line) },
];

/** The divider, which is also a setext heading underline, so it is reported only beside a real marker. */
function isDivider(line) {
  return /^={7,}\s*$/.test(line);
}

/** Every text file git tracks, or exit 2 if git cannot be asked. */
function trackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: PROJECT_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    console.error(`${colors.red}git ls-files could not run: ${result.error?.message ?? result.stderr.trim()}${colors.reset}`);
    console.error(`${colors.dim}Nothing was checked.${colors.reset}`);
    process.exit(2);
  }
  return result.stdout.split('\0').filter(Boolean);
}

function main() {
  const problems = [];
  let checked = 0;

  for (const relative of trackedFiles()) {
    const absolute = path.join(PROJECT_ROOT, relative);
    let text;
    try {
      text = fs.readFileSync(absolute, 'utf8');
    } catch {
      // A file git tracks and the working tree does not have is a checkout the
      // caller is mid-way through, not a conflict marker.
      continue;
    }
    // Binary by content rather than by extension, so a new binary kind needs no
    // edit here and a text file with an unusual name is still read.
    if (text.includes('\0')) continue;
    checked += 1;

    const lines = text.split('\n');
    const found = [];
    let sawEnd = false;
    for (const [index, line] of lines.entries()) {
      for (const marker of MARKERS) {
        if (!marker.test(line)) continue;
        found.push({ line: index + 1, label: marker.label, text: line.slice(0, 60) });
        sawEnd = true;
      }
    }
    if (sawEnd) {
      for (const [index, line] of lines.entries()) {
        if (isDivider(line)) found.push({ line: index + 1, label: 'conflict divider', text: line.slice(0, 60) });
      }
    }
    for (const item of found.sort((a, b) => a.line - b.line)) {
      problems.push(`${relative}:${item.line} ${item.label}: ${item.text}`);
    }
  }

  if (problems.length > 0) {
    console.error(`${colors.red}${problems.length} unresolved conflict marker(s) in tracked files:${colors.reset}`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(
      `\n${colors.dim}Resolve the conflict. Prettier reflows a trailing marker into a blockquote, so markdownlint sees valid markdown and says nothing.${colors.reset}`,
    );
    return 1;
  }

  console.log(`${colors.green}✅${colors.reset} no conflict markers in ${checked} tracked text file(s)`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { isDivider, MARKERS };
