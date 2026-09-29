import { test } from 'node:test';
import assert from 'node:assert/strict';

function isEven(value) {
  return value % 2 === 0;
}

test('isEven accepts four', () => {
  assert.ok(isEven(4));
});
