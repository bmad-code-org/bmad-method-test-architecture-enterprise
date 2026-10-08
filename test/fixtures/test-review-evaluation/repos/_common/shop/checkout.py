from dataclasses import dataclass
from typing import Generic, TypeVar

from shop.pricing import Cart

T_co = TypeVar("T_co", covariant=True)


@dataclass(frozen=True)
class Result(Generic[T_co]):
    value: T_co


@dataclass(frozen=True)
class Receipt:
    status: str
    total: float
    attempts: int


def checkout(cart: Cart) -> Receipt:
    return Receipt(status="confirmed", total=cart.total(), attempts=1)


def wrap(value: T_co) -> Result[T_co]:
    return Result(value)
