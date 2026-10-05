'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { buildNotes } = require('../src/notes.js');

test('entries group by type in a fixed order', () => {
  const notes = buildNotes([
    { type: 'fixed', text: 'a crash' },
    { type: 'added', text: 'a flag' },
  ]);
  assert.equal(notes, 'added\n- a flag\n\nfixed\n- a crash');
});

test('an entry of an unknown type is left out', () => {
  assert.equal(buildNotes([{ type: 'docs', text: 'a page' }]), '');
});
