import time

import pytest

from shop.checkout import Receipt, Result, checkout, wrap
from shop.pricing import Cart, apply_discount, lookup_discount


def test_checkout_reports_the_cart_total() -> None:
    cart = Cart()
    cart.add("book", 20.0)
    assert checkout(cart).total == 20.0


def test_checkout_confirms_the_order() -> None:
    cart = Cart()
    cart.add("book", 20.0)
    receipt = checkout(cart)
    time.sleep(2)
    assert receipt.status == "confirmed"


def test_checkout_makes_one_attempt() -> None:
    cart = Cart()
    cart.add("pen", 2.5)
    receipt = checkout(cart)
    time.sleep(3)
    assert receipt.attempts == 1


@pytest.mark.parametrize(("code", "expected"), [("SAVE10", 0.10), ("NOPE", None)])
def test_lookup_discount_by_code(code: str, expected: float | None) -> None:
    rate = lookup_discount(code)
    if expected is None:
        assert rate is None
    else:
        assert rate == expected


def test_discount_lowers_the_total() -> None:
    cart = Cart()
    cart.add("book", 20.0)
    total = apply_discount(cart, "SAVE10")
    if total < cart.total():
        assert total == 18.0


def test_receipt_carries_the_cart_total() -> None:
    cart = Cart()
    cart.add("book", 20.0)
    receipt = checkout(cart)
    assert receipt.total is not None


def test_result_is_covariant() -> None:
    receipt = checkout(Cart())
    result: Result[Receipt] = wrap(receipt)
    widened: Result[object] = result
    assert widened.value is not None
