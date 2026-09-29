'use strict';

// One complete report per issued CLI request, on its own stderr line. The
// target's stderr remains an observation, including this line.
const PREFIX = 'TEA_EVALUATE_USAGE_JSON:';
const ZERO = Object.freeze({ inputTokens: 0, outputTokens: 0, costUsd: '0' });
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function validateUsage(value, source = 'target usage report') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${source} must be a JSON object`);
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'costUsd,inputTokens,outputTokens') {
    throw new Error(`${source} must contain exactly inputTokens, outputTokens and costUsd`);
  }
  for (const key of ['inputTokens', 'outputTokens']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error(`${source}.${key} must be a nonnegative safe integer`);
  }
  if (typeof value.costUsd !== 'string' || !DECIMAL.test(value.costUsd)) {
    throw new Error(`${source}.costUsd must be a nonnegative decimal string without an exponent`);
  }
  const [whole, fraction = ''] = value.costUsd.split('.');
  if (BigInt(whole) > BigInt(Number.MAX_SAFE_INTEGER) || (BigInt(whole) === BigInt(Number.MAX_SAFE_INTEGER) && /[1-9]/.test(fraction))) {
    throw new Error(`${source}.costUsd exceeds the manifest's maximum cost ceiling`);
  }
  return value;
}

function parseUsageReport(stderr, source) {
  const stream = stderr?.kind === 'text' ? stderr.value : stderr;
  const lines = String(stream ?? '')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('TEA_EVALUATE_USAGE_JSON'));
  if (lines.length === 0) return null;
  if (lines.length !== 1) throw new Error(`${source} sent ${lines.length} target usage reports; expected one`);
  if (!lines[0].startsWith(PREFIX)) throw new Error(`${source} sent a malformed target usage report prefix`);
  let value;
  try {
    value = JSON.parse(lines[0].slice(PREFIX.length));
  } catch {
    throw new Error(`${source} sent malformed target usage report JSON`);
  }
  return validateUsage(value, `${source} target usage report`);
}

function addDecimal(left, right) {
  const places = Math.max((left.split('.')[1] ?? '').length, (right.split('.')[1] ?? '').length);
  const units = (value) => BigInt(value.replace('.', '')) * 10n ** BigInt(places - (value.split('.')[1] ?? '').length);
  const digits = String(units(left) + units(right)).padStart(places + 1, '0');
  if (places === 0) return digits;
  return `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/0+$/, '').replace(/\.$/, '');
}

function addUsage(left, right) {
  const inputTokens = left.inputTokens + right.inputTokens;
  const outputTokens = left.outputTokens + right.outputTokens;
  if (!Number.isSafeInteger(inputTokens) || !Number.isSafeInteger(outputTokens)) {
    throw new TypeError('target usage report token sum exceeds the safe integer range');
  }
  return validateUsage({ inputTokens, outputTokens, costUsd: addDecimal(left.costUsd, right.costUsd) }, 'target usage report sum');
}

module.exports = { PREFIX, ZERO, validateUsage, parseUsageReport, addUsage };
