'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { cartTotal, lineTotal } = require('../../src/cart.js');

test('a line total applies the quantity before the discount', () => {
  assert.equal(lineTotal({ unitPriceMinor: 1250, quantity: 3, discountPercent: 10 }), 3375);
});

test('an empty cart totals to zero', () => {
  assert.equal(cartTotal([]), 0);
});

test('a cart total is the sum of its line totals', () => {
  const lines = [
    { unitPriceMinor: 1250, quantity: 3, discountPercent: 10 },
    { unitPriceMinor: 499, quantity: 1 },
  ];
  assert.equal(cartTotal(lines), 3874);
});
