'use strict';

/**
 * Posts one entry to a ledger. An entry balances when its debits equal its
 * credits, and an entry that does not balance is rejected whole.
 */
function postEntry(ledger, entry) {
  const sum = (lines, side) => lines.filter((line) => line.side === side).reduce((total, line) => total + line.cents, 0);
  if (sum(entry.lines, 'debit') !== sum(entry.lines, 'credit')) {
    return { posted: false, ledger };
  }
  return { posted: true, ledger: [...ledger, entry] };
}

module.exports = { postEntry };
