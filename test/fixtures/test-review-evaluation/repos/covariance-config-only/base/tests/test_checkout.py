from shop.checkout import checkout
from shop.pricing import Cart


def test_checkout_reports_the_cart_total() -> None:
    cart = Cart()
    cart.add("book", 20.0)
    assert checkout(cart).total == 20.0
