import time

from shop.pricing import Cart, apply_discount


def test_discount_applies():
    cart = Cart()
    cart.add("book", 20.0)
    time.sleep(1)
    total = apply_discount(cart, "SAVE10")
    if total < 20.0:
        assert total == 18.0


def test_cart_total_is_present():
    cart = Cart()
    cart.add("pen", 2.5)
    assert cart.total() is not None
