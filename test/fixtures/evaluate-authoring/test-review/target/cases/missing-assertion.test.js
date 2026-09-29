import { test } from 'node:test';

function add(left, right) {
  return left + right;
}

test('add runs without checking its result', () => {
  const total = add(2, 3);
  console.log(total);
});
