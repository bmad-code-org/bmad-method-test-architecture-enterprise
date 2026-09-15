'use strict';

/**
 * An append-only log. Entries are frozen on the way in, and the sequence
 * number is the only thing the log assigns.
 */
class AuditLog {
  #entries = [];

  append(actor, action) {
    const entry = Object.freeze({ sequence: this.#entries.length + 1, actor, action });
    this.#entries.push(entry);
    return entry;
  }

  entries() {
    return [...this.#entries];
  }
}

module.exports = { AuditLog };
