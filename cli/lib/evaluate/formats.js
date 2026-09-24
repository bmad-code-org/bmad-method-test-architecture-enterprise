/**
 * The JSON Schema formats the runtime's Ajv instances check.
 *
 * eval-quality's published schemas use one format, `date-time`. Ajv carries no
 * formats of its own, and with `strict: false` it prints a warning for an
 * unknown format and then accepts any string, so every Ajv instance that
 * compiles an engine schema registers this one. The check is written here
 * instead of taken from `ajv-formats` because it is the only format needed, and
 * `Date.parse` alone is too lenient: it accepts `2026-02-30` and hour 24.
 */

'use strict';

const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/;

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Whether `value` is an RFC 3339 `date-time`: a calendar-valid date, an hour
 * from 0 to 23, a minute from 0 to 59, a second from 0 to 60 (RFC 3339 admits a
 * leap second), an optional fraction, and `Z` or a numeric offset of at most
 * 23:59.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isDateTime(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_TIME.exec(value);
  if (match === null) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 60 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}

/**
 * Registers every format the engine's published schemas use on `ajv`.
 *
 * @param {object} ajv An Ajv instance.
 * @returns {object} The same instance.
 */
function addFormats(ajv) {
  ajv.addFormat('date-time', { type: 'string', validate: isDateTime });
  return ajv;
}

module.exports = { addFormats, isDateTime };
