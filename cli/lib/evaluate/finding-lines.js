/**
 * How a finding or a line of output is printed: one line each, with every control or direction-changing character
 * written as an escape, so a value from a target or a file name cannot start a forged line or reorder what a reader sees.
 * `tea-evaluate` prints through these, and `tea-evaluate ci` persists each check's output through them.
 */

'use strict';

// C0 and C1 controls, DEL, the line and paragraph separators and the
// bidirectional formatting characters: any of them in a printed finding could
// start a forged finding line or reorder what a reader sees.
// eslint-disable-next-line no-control-regex
const UNPRINTABLE = /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/gu;
const SHORT_ESCAPES = { '\n': String.raw`\n`, '\r': String.raw`\r`, '\t': String.raw`\t` };

/** `text` with every unprintable character written as an escape (`\n`, `\u202E`). */
function escapeUnprintable(text) {
  return String(text).replaceAll(
    UNPRINTABLE,
    (character) => SHORT_ESCAPES[character] ?? String.raw`\u` + character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'),
  );
}

/**
 * One finding as exactly one printed line. A file name holding an unprintable
 * character is quoted as well as escaped, so the reader can tell the name from
 * the text after it; a message is escaped in place.
 */
function findingLine(file, rule, message) {
  const name = String(file);
  const escaped = escapeUnprintable(name);
  const printedName = escaped === name ? name : JSON.stringify(name).replaceAll(UNPRINTABLE, (character) => escapeUnprintable(character));
  return `${printedName}: [${rule}] ${escapeUnprintable(message)}\n`;
}

module.exports = { escapeUnprintable, findingLine };
