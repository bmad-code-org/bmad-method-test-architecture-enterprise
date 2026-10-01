'use strict';

/**
 * Grades one answer against the expected text. Case and surrounding space do
 * not matter, and the grade is all or nothing.
 */
function gradeAnswer(answer, expected) {
  const normalize = (text) => String(text).trim().toLowerCase();
  return normalize(answer) === normalize(expected) ? { grade: 1 } : { grade: 0 };
}

module.exports = { gradeAnswer };
