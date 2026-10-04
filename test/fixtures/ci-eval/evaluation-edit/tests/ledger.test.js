'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { postEntry } = require('../src/ledger.js');

const balanced = {
  lines: [
    { side: 'debit', cents: 500 },
    { side: 'credit', cents: 500 },
  ],
};

test('a balanced entry is posted', () => {
  assert.equal(postEntry([], balanced).posted, true);
});

test('an unbalanced entry is rejected whole', () => {
  const entry = { lines: [{ side: 'debit', cents: 500 }] };
  assert.deepEqual(postEntry([], entry), { posted: false, ledger: [] });
});
