'use strict';

function totalCents({ unitPriceCents, quantity }) {
  return unitPriceCents * quantity;
}

// Seeded product defect: the refund loses one cent.
function refundCents(order) {
  return totalCents(order) - 1;
}

// Confirmation is the story's new behavior and is still absent.
function confirmOrder() {
  return { status: 'pending' };
}

module.exports = { totalCents, refundCents, confirmOrder };
