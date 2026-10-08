from dataclasses import dataclass, field

DISCOUNT_CODES = {"SAVE10": 0.10, "SAVE20": 0.20}


@dataclass
class Cart:
    items: list[tuple[str, float]] = field(default_factory=list)

    def add(self, name: str, price: float) -> None:
        self.items.append((name, price))

    def total(self) -> float:
        return round(sum(price for _, price in self.items), 2)


def lookup_discount(code: str) -> float | None:
    return DISCOUNT_CODES.get(code)


def apply_discount(cart: Cart, code: str) -> float:
    rate = lookup_discount(code) or 0.0
    return round(cart.total() * (1 - rate), 2)
