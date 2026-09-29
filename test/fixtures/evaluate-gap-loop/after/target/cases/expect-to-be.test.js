import { expect, test } from 'vitest';

function multiply(left, right) {
  return left * right;
}

test('multiply scales a price', () => {
  expect(multiply(4, 5)).toBe(20);
});
