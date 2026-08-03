from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from math import isfinite
from typing import Sequence


class TrendDirection(str, Enum):
    LONG = "LONG"
    SHORT = "SHORT"
    NEUTRAL = "NEUTRAL"


@dataclass(frozen=True)
class TrendCandle:
    symbol: str
    interval: str
    start_time_ms: int
    close_time_ms: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    turnover: float


@dataclass(frozen=True)
class TrendAnalysis:
    symbol: str
    interval: str
    direction: TrendDirection
    passed: bool
    latest_close: float
    ema20: float
    ema50: float
    ema200: float
    candle_count: int
    latest_candle_close_time_ms: int
    reasons: tuple[str, ...]


def exponential_moving_average(values: Sequence[float], period: int) -> float:
    if period <= 0:
        raise ValueError("INVALID_EMA_PERIOD")
    if len(values) < period:
        raise ValueError("INSUFFICIENT_CANDLES")
    if any(not isfinite(value) or value <= 0 for value in values):
        raise ValueError("INVALID_CLOSE_PRICE")

    multiplier = 2.0 / (period + 1.0)
    ema = sum(values[:period]) / period
    for value in values[period:]:
        ema = ((value - ema) * multiplier) + ema
    return ema


def _validate_candles(candles: Sequence[TrendCandle]) -> None:
    if len(candles) < 200:
        raise ValueError("INSUFFICIENT_CANDLES")

    expected_symbol = candles[0].symbol
    previous_start: int | None = None
    previous_close: int | None = None

    for candle in candles:
        if candle.symbol != expected_symbol:
            raise ValueError("CANDLE_SYMBOL_MISMATCH")
        if candle.interval != "60":
            raise ValueError("INVALID_TREND_INTERVAL")
        if candle.start_time_ms <= 0 or candle.close_time_ms <= candle.start_time_ms:
            raise ValueError("INVALID_CANDLE_TIME")
        if previous_start is not None and candle.start_time_ms <= previous_start:
            raise ValueError("INVALID_CANDLE_SEQUENCE")
        if previous_close is not None and candle.start_time_ms != previous_close:
            raise ValueError("CANDLE_GAP_DETECTED")

        prices = (candle.open, candle.high, candle.low, candle.close)
        if any(not isfinite(value) or value <= 0 for value in prices):
            raise ValueError("INVALID_CANDLE_PRICE")
        if candle.high < max(candle.open, candle.close) or candle.low > min(candle.open, candle.close):
            raise ValueError("INVALID_CANDLE_RANGE")
        if candle.volume <= 0 or candle.turnover <= 0:
            raise ValueError("INVALID_CANDLE_ACTIVITY")

        previous_start = candle.start_time_ms
        previous_close = candle.close_time_ms


def analyze_one_hour_trend(candles: Sequence[TrendCandle]) -> TrendAnalysis:
    _validate_candles(candles)

    closes = [candle.close for candle in candles]
    latest = candles[-1]
    ema20 = exponential_moving_average(closes, 20)
    ema50 = exponential_moving_average(closes, 50)
    ema200 = exponential_moving_average(closes, 200)

    if ema20 > ema50 > ema200 and latest.close > ema20:
        direction = TrendDirection.LONG
        reasons = (
            "EMA20_ABOVE_EMA50_ABOVE_EMA200",
            "PRICE_ABOVE_EMA20",
        )
    elif ema20 < ema50 < ema200 and latest.close < ema20:
        direction = TrendDirection.SHORT
        reasons = (
            "EMA20_BELOW_EMA50_BELOW_EMA200",
            "PRICE_BELOW_EMA20",
        )
    else:
        direction = TrendDirection.NEUTRAL
        reasons = ("ONE_HOUR_TREND_NOT_ALIGNED",)

    return TrendAnalysis(
        symbol=latest.symbol,
        interval=latest.interval,
        direction=direction,
        passed=direction is not TrendDirection.NEUTRAL,
        latest_close=latest.close,
        ema20=ema20,
        ema50=ema50,
        ema200=ema200,
        candle_count=len(candles),
        latest_candle_close_time_ms=latest.close_time_ms,
        reasons=reasons,
    )
