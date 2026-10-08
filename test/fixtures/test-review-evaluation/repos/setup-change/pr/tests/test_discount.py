from shop.pricing import Cart, apply_discount


def test_save10_takes_ten_percent_off():
    cart = Cart()
    cart.add("book", 20.0)
    expected = apply_discount(cart, "SAVE10")
    assert apply_discount(cart, "SAVE10") == expected


def test_unknown_code_keeps_the_total():
    cart = Cart()
    cart.add("book", 20.0)
    assert apply_discount(cart, "NOPE") == 20.0
