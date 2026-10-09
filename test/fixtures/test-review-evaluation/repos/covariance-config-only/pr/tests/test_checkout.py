from shop.checkout import Receipt, Result, checkout, wrap
from shop.pricing import Cart


def test_checkout_reports_the_cart_total() -> None:
    cart = Cart()
    cart.add("book", 20.0)
    assert checkout(cart).total == 20.0


def test_result_is_covariant() -> None:
    receipt = checkout(Cart())
    result: Result[Receipt] = wrap(receipt)
    widened: Result[object] = result
    assert widened.value is not None
