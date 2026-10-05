'use strict';

/**
 * Builds release notes from change entries. Entries group by type in the order
 * `added`, `changed`, `fixed`, and an entry of any other type is left out.
 */
const TYPES = ['added', 'changed', 'fixed'];

function buildNotes(entries) {
  return TYPES.filter((type) => entries.some((entry) => entry.type === type))
    .map((type) => `${type}\n${entries.filter((entry) => entry.type === type).map((entry) => `- ${entry.text}`).join('\n')}`)
    .join('\n\n');
}

module.exports = { buildNotes };
