'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { routeTicket } = require('../src/router.js');

test('a ticket about an invoice goes to billing', () => {
  assert.deepEqual(routeTicket('Question about my invoice'), { queue: 'billing' });
});

test('a ticket no queue claims goes to triage', () => {
  assert.deepEqual(routeTicket('Something odd happened'), { queue: 'triage' });
});
