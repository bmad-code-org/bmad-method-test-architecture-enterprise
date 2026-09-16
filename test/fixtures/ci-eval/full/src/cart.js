'use strict';

/**
 * The line total of one cart line, in minor units, with the quantity applied
 * before any percentage discount so a rounding step never runs twice.
 */
function lineTotal({ unitPriceMinor, quantity, discountPercent = 0 }) {
  const gross = unitPriceMinor * quantity;
  return Math.round(gross * (1 - discountPercent / 100));
}

function cartTotal(lines) {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

module.exports = { lineTotal, cartTotal };
