# Voucher redemption rules

Four rules govern whether `POST /redeem` accepts a voucher and what discount it grants. `src/vouchers.js` checks them in this order.

## Expiry

- A voucher whose `expiresOn` date is before the redemption date is rejected as expired.

## Minimum spend

- `minimumSpend` is inclusive: a cart total equal to the minimum is accepted.
- A cart total strictly below the minimum is rejected.

## Discount type

- A `percentage` voucher discounts the cart by `percentOff` percent of the cart total.
- A `fixed` voucher discounts the cart by a flat `amountOff`, capped at the cart total so a redemption never goes negative.

## Discount cap

- A `percentage` voucher that declares a `maxDiscount` never grants more than that amount, however large `percentOff` would otherwise compute.
