'use strict';

/**
 * Routes one support ticket to a queue by the first keyword of its subject
 * that a queue claims. A ticket that matches nothing goes to triage.
 */
const QUEUES = new Map([
  ['invoice', 'billing'],
  ['refund', 'billing'],
  ['password', 'accounts'],
  ['login', 'accounts'],
]);

function routeTicket(subject) {
  for (const word of String(subject).toLowerCase().split(/\W+/)) {
    if (QUEUES.has(word)) return { queue: QUEUES.get(word) };
  }
  return { queue: 'triage' };
}

module.exports = { routeTicket };
