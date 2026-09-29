import { expect, test } from 'vitest';

test('parse returns a value', () => {
  expect(JSON.parse('{"ok":true}'));
});
