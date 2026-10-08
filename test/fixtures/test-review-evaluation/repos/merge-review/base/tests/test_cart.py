from shop.pricing import Cart


def test_empty_cart_totals_zero():
    assert Cart().total() == 0
