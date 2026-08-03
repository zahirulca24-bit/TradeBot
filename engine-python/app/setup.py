from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from math import isfinite
from typing import Sequence


FIFTEEN_MINUTES_MS = 15 * 60 * 1000
BREAKOUT_LOOKBACK = 20
RETEST_MIN_AGE = 1
RETEST_MAX_AGE = 5
RSI_PERIOD = 14
MINIMUM_CANDLES = BREAKOUT_LOOKBACK + RETEST_MAX_AGE + RSI_PERIOD + 1


class SetupDirection(str, Enum):
    LONG = "LONG"
    SHORT = "SHORT"


@dataclass(frozen=True)
class SetupCandle:
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
class SetupAnalysis:
    symbol: str
    interval: str
    direction: SetupDirection
    passed: bool
    latest_close: float
    rsi14: float
    breakout_level: float | None
    breakout_candle_close_time_ms: int | None
    retest_candle_close_time_ms: int
    breakout_age_candles: int | None
    candle_count: int
    latest_candle_close_time_ms: int
    reasons: tuple[str, ...]


def relative_strength_index(values: Sequence[float], period: int = RSI_PERIOD) -> float:
    if period <= 0:
        raise ValueError("INVALID_RSI_PERIOD")
    if len(values) < period + 1:
        raise ValueError("INSUFFICIENT_CANDLES")
    if any(not isfinite(value) or value <= 0 for value in values):
        raise ValueError("INVALID_CLOSE_PRICE")

    gains: list[float] = []
    losses: list[float] = []
    for previous, current in zip(values, values[1:]):
        change = current - previous
        gains.append(max(change, 0.0))
        losses.append(max(-change, 0.0))

    average_gain = sum(gains[:period]) / period
    average_loss = sum(losses[:period]) / period
    for gain, loss in zip(gains[period:], losses[period:]):
        average_gain = ((average_gain * (period - 1)) + gain) / period
        average_loss = ((average_loss * (period - 1)) + loss) / period

    if average_loss == 0:
        return 50.0 if average_gain == 0 else 100.0
    relative_strength = average_gain / average_loss
    return 100.0 - (100.0 / (1.0 + relative_strength))


def _validate_candles(candles: Sequence[SetupCandle]) -> None:
    if len(candles) < MINIMUM_CANDLES:
        raise ValueError("INSUFFICIENT_CANDLES")

    expected_symbol = candles[0].symbol
    previous_start: int | None = None
    previous_close: int | None = None

    for candle in candles:
        if candle.symbol != expected_symbol:
            raise ValueError("CANDLE_SYMBOL_MISMATCH")
        if candle.interval != "15":
            raise ValueError("INVALID_SETUP_INTERVAL")
        if candle.start_time_ms <= 0 or candle.close_time_ms - candle.start_time_ms != FIFTEEN_MINUTES_MS:
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


def _directional_breakouts(
    candles: Sequence[SetupCandle], direction: SetupDirection
) -> list[tuple[int, SetupCandle, float]]:
    latest_index = len(candles) - 1
    breakouts: list[tuple[int, SetupCandle, float]] = []

    for age in range(RETEST_MIN_AGE, RETEST_MAX_AGE + 1):
        breakout_index = latest_index - age
        if breakout_index < BREAKOUT_LOOKBACK:
            continue

        breakout = candles[breakout_index]
        preceding = candles[breakout_index - BREAKOUT_LOOKBACK : breakout_index]
        if direction is SetupDirection.LONG:
            level = max(candle.high for candle in preceding)
            if breakout.close > level:
                breakouts.append((age, breakout, level))
        else:
            level = min(candle.low for candle in preceding)
            if breakout.close < level:
                breakouts.append((age, breakout, level))

    return breakouts


def analyze_fifteen_minute_setup(
    candles: Sequence[SetupCandle], direction: SetupDirection
) -> SetupAnalysis:
    _validate_candles(candles)

    latest = candles[-1]
    rsi14 = relative_strength_index([candle.close for candle in candles], RSI_PERIOD)
    breakouts = _directional_breakouts(candles, direction)

    selected_breakout: tuple[int, SetupCandle, float] | None = None
    for breakout in breakouts:
        age, _candle, level = breakout
        if direction is SetupDirection.LONG:
            retest_confirmed = latest.low <= level and latest.close > level
            rsi_confirmed = rsi14 > 50.0
        else:
            retest_confirmed = latest.high >= level and latest.close < level
            rsi_confirmed = rsi14 < 50.0

        if retest_confirmed and rsi_confirmed:
            selected_breakout = breakout
            break

    passed = selected_breakout is not None
    evidence_breakout = selected_breakout or (breakouts[0] if breakouts else None)

    if passed and selected_breakout is not None:
        age, breakout_candle, level = selected_breakout
        if direction is SetupDirection.LONG:
            reasons = (
                "ONE_HOUR_LONG_CONFIRMED",
                "BREAKOUT_ABOVE_PREVIOUS_20_HIGH",
                "LATEST_CLOSED_15M_CANDLE_RECLAIMED_BREAKOUT_LEVEL",
                "RSI14_ABOVE_50",
            )
        else:
            reasons = (
                "ONE_HOUR_SHORT_CONFIRMED",
                "BREAKOUT_BELOW_PREVIOUS_20_LOW",
                "LATEST_CLOSED_15M_CANDLE_REJECTED_BREAKOUT_LEVEL",
                "RSI14_BELOW_50",
            )
        breakout_level = level
        breakout_close_time = breakout_candle.close_time_ms
        breakout_age = age
    else:
        rejection_reasons: list[str] = []
        if not breakouts:
            rejection_reasons.append(
                "NO_LONG_BREAKOUT_WITHIN_1_TO_5_CANDLES"
                if direction is SetupDirection.LONG
                else "NO_SHORT_BREAKOUT_WITHIN_1_TO_5_CANDLES"
            )
        elif evidence_breakout is not None:
            _age, _breakout_candle, level = evidence_breakout
            if direction is SetupDirection.LONG:
                if not (latest.low <= level and latest.close > level):
                    rejection_reasons.append("LATEST_15M_CANDLE_DID_NOT_RECLAIM_LONG_BREAKOUT_LEVEL")
                if rsi14 <= 50.0:
                    rejection_reasons.append("RSI14_NOT_ABOVE_50")
            else:
                if not (latest.high >= level and latest.close < level):
                    rejection_reasons.append("LATEST_15M_CANDLE_DID_NOT_REJECT_SHORT_BREAKOUT_LEVEL")
                if rsi14 >= 50.0:
                    rejection_reasons.append("RSI14_NOT_BELOW_50")

        reasons = tuple(rejection_reasons or ["FIFTEEN_MINUTE_SETUP_NOT_CONFIRMED"])
        if evidence_breakout is None:
            breakout_level = None
            breakout_close_time = None
            breakout_age = None
        else:
            breakout_age, breakout_candle, breakout_level = evidence_breakout
            breakout_close_time = breakout_candle.close_time_ms

    return SetupAnalysis(
        symbol=latest.symbol,
        interval=latest.interval,
        direction=direction,
        passed=passed,
        latest_close=latest.close,
        rsi14=rsi14,
        breakout_level=breakout_level,
        breakout_candle_close_time_ms=breakout_close_time,
        retest_candle_close_time_ms=latest.close_time_ms,
        breakout_age_candles=breakout_age,
        candle_count=len(candles),
        latest_candle_close_time_ms=latest.close_time_ms,
        reasons=reasons,
    )
