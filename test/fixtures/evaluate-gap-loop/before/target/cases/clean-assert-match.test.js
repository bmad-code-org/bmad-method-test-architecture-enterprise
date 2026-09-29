import { test } from 'node:test';
import assert from 'node:assert/strict';

function greet(name) {
  return `Hello, ${name}!`;
}

test('greet names the visitor', () => {
  assert.match(greet('Ada'), /^Hello, Ada!$/);
});
