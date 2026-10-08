'use strict';

/**
 * The docs pages the Evaluate suites hold their sentences against.
 *
 * The user reference keeps what an adopter configures and acts on; the explanation page on confinement keeps how the
 * runtime builds the confinement and protects the evidence. A suite that pins a sentence reads the page that holds it,
 * so removing the sentence from that page fails the suite.
 */

const fs = require('node:fs');
const path = require('node:path');

const DOCS_DIRECTORY = path.join(__dirname, '..', '..', 'docs');

/** The user reference of the `tea-evaluate` command line. */
const REFERENCE_PAGE = 'reference/tea-evaluate-cli.md';

/** The explanation page on why the target is confined and how the runtime keeps the evidence honest. */
const CONFINEMENT_PAGE = 'explanation/why-evaluate-confines-the-target.md';

/**
 * Reads one docs page.
 *
 * @param {string} page the page's path below `docs/`, for example `reference/tea-evaluate-cli.md`
 * @returns {string} the page's text
 */
function readDocsPage(page) {
  return fs.readFileSync(path.join(DOCS_DIRECTORY, page), 'utf8');
}

/**
 * The body of the section a heading opens: the lines after the heading up to the next heading of the same or a higher level.
 * A heading inside a fenced block neither opens nor ends a section.
 *
 * @param {string} text a page's text
 * @param {string} heading the heading line, for example `### Score input integrity`
 * @returns {string | null} the section's body, or null when the page has no such heading
 */
function sectionOf(text, heading) {
  const level = heading.match(/^#+/)[0].length;
  const lines = text.split('\n');
  let fenced = false;
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith('```')) fenced = !fenced;
    if (!fenced && start === -1 && lines[index] === heading) start = index;
    else if (!fenced && start !== -1 && /^#+ /.test(lines[index]) && lines[index].match(/^#+/)[0].length <= level) {
      return lines.slice(start + 1, index).join('\n');
    }
  }
  return start === -1 ? null : lines.slice(start + 1).join('\n');
}

module.exports = { CONFINEMENT_PAGE, DOCS_DIRECTORY, REFERENCE_PAGE, readDocsPage, sectionOf };
