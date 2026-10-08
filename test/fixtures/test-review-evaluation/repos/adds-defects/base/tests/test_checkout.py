import time

import pytest

from shop.checkout import Receipt, Result, checkout, wrap
from shop.pricing import Cart, apply_discount, lookup_discount


def test_checkout_reports_the_cart_total() -> None:
    cart = Cart()
    cart.add("book", 20.0)
    assert checkout(cart).total == 20.0
