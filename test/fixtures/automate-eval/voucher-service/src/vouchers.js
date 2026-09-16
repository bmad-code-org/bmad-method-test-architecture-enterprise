'use strict';

/**
 * Voucher/discount redemption rules for the automate-eval fixture.
 *
 * Four rules, checked in this order:
 *
 *   1. Expiry: a voucher whose `expiresOn` is before `redeemedOn` is rejected.
 *   2. Minimum spend: `voucher.minimumSpend` is inclusive. A cart total equal
 *      to the minimum is accepted. This is the boundary a controlled mutation
 *      in this corpus flips from inclusive to exclusive.
 *   3. Discount: a `percentage` voucher discounts `cartTotal` by `percentOff`
 *      percent; a `fixed` voucher discounts it by `amountOff`, capped at
 *      `cartTotal` so a redemption never goes negative.
 *   4. Discount cap: a `percentage` voucher's `maxDiscount`, when declared,
 *      bounds the discount step 3 computes.
 *
 * `docs/stories/6-6-voucher-redemption.md` states these same four rules in
 * prose; this is where they are enforced.
 *
 * @param {{type: 'percentage'|'fixed', percentOff?: number, amountOff?: number, maxDiscount?: number, minimumSpend: number, expiresOn: string}} voucher
 * @param {number} cartTotal
 * @param {string} redeemedOn ISO date the redemption is attempted on.
 * @returns {{accepted: true, discount: number}|{accepted: false, reason: 'expired'|'below-minimum-spend'}}
 */
function redeem(voucher, cartTotal, redeemedOn) {
  if (redeemedOn > voucher.expiresOn) {
    return { accepted: false, reason: 'expired' };
  }

  const meetsMinimumSpend = cartTotal >= voucher.minimumSpend;
  if (!meetsMinimumSpend) {
    return { accepted: false, reason: 'below-minimum-spend' };
  }

  const rawDiscount = voucher.type === 'percentage' ? cartTotal * (voucher.percentOff / 100) : Math.min(voucher.amountOff, cartTotal);

  const discount = voucher.type === 'percentage' && voucher.maxDiscount !== undefined ? Math.min(rawDiscount, voucher.maxDiscount) : rawDiscount;

  return { accepted: true, discount };
}

module.exports = { redeem };
