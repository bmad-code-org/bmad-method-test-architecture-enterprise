'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { AuditLog } = require('../src/audit-log.js');

test('entries are numbered in the order they were appended', () => {
  const log = new AuditLog();
  log.append('ops', 'rotate-key');
  const second = log.append('ops', 'revoke-token');
  assert.equal(second.sequence, 2);
  assert.deepEqual(
    log.entries().map((entry) => entry.action),
    ['rotate-key', 'revoke-token'],
  );
});

test('an appended entry cannot be changed afterwards', () => {
  const log = new AuditLog();
  const entry = log.append('ops', 'rotate-key');
  assert.throws(() => {
    entry.action = 'something-else';
  });
});
