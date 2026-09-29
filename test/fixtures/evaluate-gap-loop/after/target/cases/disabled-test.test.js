import { test } from 'node:test';
import assert from 'node:assert/strict';

function divide(left, right) {
  return left / right;
}

test.skip('divide splits evenly', () => {
  assert.strictEqual(divide(6, 3), 2);
});
