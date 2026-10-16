'use strict';

/**
 * The docs pages the Evaluate suites hold their sentences against.
 *
 * The user reference keeps what an adopter configures and acts on: the CLI reference holds the commands, their exits and
 * the platform checklist, and its companion pages hold the manifest, the confinement, the evaluators and the evidence.
 * The explanation page on confinement keeps how the runtime builds the confinement and protects the evidence. A suite that
 * pins a sentence reads the page that holds it, so removing the sentence from that page fails the suite.
 */

const fs = require('node:fs');
const path = require('node:path');

const DOCS_DIRECTORY = path.join(__dirname, '..', '..', 'docs');

/** The user reference of the `tea-evaluate` command line. */
const REFERENCE_PAGE = 'reference/tea-evaluate-cli.md';

/** The companion reference page on the evaluation folder's manifest: the `evaluation.json` fields, the registry, the workspace and the probe routes. */
const REFERENCE_MANIFEST_PAGE = 'reference/tea-evaluate-manifest.md';

/** The companion reference page on what a confined target can read, write and reach. */
const REFERENCE_CONFINEMENT_PAGE = 'reference/tea-evaluate-confinement.md';

/** The companion reference page on the evaluation layer, the rubric judge and evaluator qualification. */
const REFERENCE_EVALUATORS_PAGE = 'reference/tea-evaluate-evaluators.md';

/** The companion reference page on the run directory, the path forms in the records and the strength aggregate. */
const REFERENCE_EVIDENCE_PAGE = 'reference/tea-evaluate-evidence.md';

/** The CLI reference and its companion pages, in the order the CLI reference lists them. */
const REFERENCE_PAGES = [
  REFERENCE_PAGE,
  REFERENCE_MANIFEST_PAGE,
  REFERENCE_CONFINEMENT_PAGE,
  REFERENCE_EVALUATORS_PAGE,
  REFERENCE_EVIDENCE_PAGE,
];

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
 * The text of the CLI reference and its companion pages, one after the other, for a check whose sentences span them.
 *
 * @returns {string} the pages' text joined by a blank line
 */
function readReferencePages() {
  return REFERENCE_PAGES.map((page) => readDocsPage(page)).join('\n\n');
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

/**
 * Whether a line closes a fenced block opened by `fence` at `indent`, by the CommonMark rule: after the opener's
 * indentation, at most three spaces, the opener's character repeated at least as many times, then only whitespace.
 * A marker line with text after it (```` ```bash ````) is block content and closes nothing.
 *
 * @param {string} line the candidate line
 * @param {string} fence the opening run of backticks or tildes
 * @param {string} [indent] the whitespace before the opening fence
 * @returns {boolean}
 */
function closesFence(line, fence, indent = '') {
  const rest = line.startsWith(indent) ? line.slice(indent.length) : line.trimStart();
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(rest);
  return match !== null && match[1][0] === fence[0] && match[1].length >= fence.length;
}

module.exports = {
  CONFINEMENT_PAGE,
  closesFence,
  DOCS_DIRECTORY,
  REFERENCE_CONFINEMENT_PAGE,
  REFERENCE_EVALUATORS_PAGE,
  REFERENCE_EVIDENCE_PAGE,
  REFERENCE_MANIFEST_PAGE,
  REFERENCE_PAGE,
  REFERENCE_PAGES,
  readDocsPage,
  readReferencePages,
  sectionOf,
};
