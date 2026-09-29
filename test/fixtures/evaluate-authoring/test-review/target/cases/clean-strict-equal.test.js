import { test } from 'node:test';
import assert from 'node:assert/strict';

function add(left, right) {
  return left + right;
}

test('add sums two integers', () => {
  assert.strictEqual(add(2, 3), 5);
});
