'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { gradeAnswer } = require('../src/grader.js');

test('an answer that matches the expected text scores one', () => {
  assert.deepEqual(gradeAnswer('  Paris ', 'paris'), { grade: 1 });
});

test('an answer that differs scores zero', () => {
  assert.deepEqual(gradeAnswer('Lyon', 'Paris'), { grade: 0 });
});
