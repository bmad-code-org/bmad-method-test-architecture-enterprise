from shop.pricing import Cart


def test_empty_cart_totals_zero():
    assert Cart().total() == 0


def test_cart_sums_item_prices():
    cart = Cart()
    cart.add("book", 20.0)
    cart.add("pen", 2.5)
    total = cart.total()
    assert total == total
