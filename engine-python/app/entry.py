from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from math import isfinite
from statistics import fmean
from typing import Sequence


FIVE_MINUTES_MS = 5 * 60 * 1000
SWEEP_LOOKBACK = 20
VOLUME_LOOKBACK = 20
VOLUME_MULTIPLIER = 1.5
MINIMUM_CANDLES = max(SWEEP_LOOKBACK, VOLUME_LOOKBACK) + 1


class EntryDirection(str, Enum):
    LONG = "LONG"
    SHORT = "SHORT"


@dataclass(frozen=True)
class EntryCandle:
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
class EntryAnalysis:
    symbol: str
    interval: str
    direction: EntryDirection
    passed: bool
    latest_close: float
    sweep_level: float
    average_volume20: float
    latest_volume: float
    volume_ratio: float
    sweep_depth_bps: float
    entry_candle_close_time_ms: int
    entry_key: str
    candle_count: int
    latest_candle_close_time_ms: int
    reasons: tuple[str, ...]


def _validate_candles(candles: Sequence[EntryCandle]) -> None:
    if len(candles) < MINIMUM_CANDLES:
        raise ValueError("INSUFFICIENT_CANDLES")

    expected_symbol = candles[0].symbol
    previous_start: int | None = None
    previous_close: int | None = None

    for candle in candles:
        if candle.symbol != expected_symbol:
            raise ValueError("CANDLE_SYMBOL_MISMATCH")
        if candle.interval != "5":
            raise ValueError("INVALID_ENTRY_INTERVAL")
        if candle.start_time_ms <= 0 or candle.close_time_ms - candle.start_time_ms != FIVE_MINUTES_MS:
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
        if not isfinite(candle.volume) or candle.volume <= 0:
            raise ValueError("INVALID_CANDLE_VOLUME")
        if not isfinite(candle.turnover) or candle.turnover <= 0:
            raise ValueError("INVALID_CANDLE_TURNOVER")

        previous_start = candle.start_time_ms
        previous_close = candle.close_time_ms


def analyze_five_minute_entry(
    candles: Sequence[EntryCandle], direction: EntryDirection
) -> EntryAnalysis:
    _validate_candles(candles)

    latest = candles[-1]
    preceding = candles[-(SWEEP_LOOKBACK + 1) : -1]
    average_volume20 = fmean(candle.volume for candle in preceding[-VOLUME_LOOKBACK:])
    volume_ratio = latest.volume / average_volume20
    volume_confirmed = latest.volume > average_volume20 * VOLUME_MULTIPLIER

    if direction is EntryDirection.LONG:
        sweep_level = min(candle.low for candle in preceding)
        sweep_confirmed = latest.low < sweep_level
        reclaim_confirmed = latest.close > sweep_level
        sweep_depth_bps = max(0.0, ((sweep_level - latest.low) / sweep_level) * 10_000)
    else:
        sweep_level = max(candle.high for candle in preceding)
        sweep_confirmed = latest.high > sweep_level
        reclaim_confirmed = latest.close < sweep_level
        sweep_depth_bps = max(0.0, ((latest.high - sweep_level) / sweep_level) * 10_000)

    passed = sweep_confirmed and reclaim_confirmed and volume_confirmed

    if passed:
        if direction is EntryDirection.LONG:
            reasons = (
                "ONE_HOUR_LONG_CONFIRMED",
                "FIFTEEN_MINUTE_LONG_SETUP_CONFIRMED",
                "LATEST_CLOSED_5M_CANDLE_SWEPT_PREVIOUS_20_LOW",
                "LATEST_CLOSED_5M_CANDLE_RECLAIMED_SWEEP_LEVEL",
                "VOLUME_ABOVE_20_CANDLE_AVERAGE_X_1_5",
            )
        else:
            reasons = (
                "ONE_HOUR_SHORT_CONFIRMED",
                "FIFTEEN_MINUTE_SHORT_SETUP_CONFIRMED",
                "LATEST_CLOSED_5M_CANDLE_SWEPT_PREVIOUS_20_HIGH",
                "LATEST_CLOSED_5M_CANDLE_REJECTED_SWEEP_LEVEL",
                "VOLUME_ABOVE_20_CANDLE_AVERAGE_X_1_5",
            )
    else:
        rejection_reasons: list[str] = []
        if direction is EntryDirection.LONG:
            if not sweep_confirmed:
                rejection_reasons.append("LATEST_5M_CANDLE_DID_NOT_SWEEP_PREVIOUS_20_LOW")
            if sweep_confirmed and not reclaim_confirmed:
                rejection_reasons.append("LATEST_5M_CANDLE_DID_NOT_RECLAIM_LONG_SWEEP_LEVEL")
        else:
            if not sweep_confirmed:
                rejection_reasons.append("LATEST_5M_CANDLE_DID_NOT_SWEEP_PREVIOUS_20_HIGH")
            if sweep_confirmed and not reclaim_confirmed:
                rejection_reasons.append("LATEST_5M_CANDLE_DID_NOT_REJECT_SHORT_SWEEP_LEVEL")
        if not volume_confirmed:
            rejection_reasons.append("VOLUME_NOT_ABOVE_20_CANDLE_AVERAGE_X_1_5")
        reasons = tuple(rejection_reasons or ["FIVE_MINUTE_ENTRY_NOT_CONFIRMED"])

    entry_key = f"{latest.symbol}:{direction.value}:{latest.close_time_ms}"

    return EntryAnalysis(
        symbol=latest.symbol,
        interval=latest.interval,
        direction=direction,
        passed=passed,
        latest_close=latest.close,
        sweep_level=sweep_level,
        average_volume20=average_volume20,
        latest_volume=latest.volume,
        volume_ratio=volume_ratio,
        sweep_depth_bps=sweep_depth_bps,
        entry_candle_close_time_ms=latest.close_time_ms,
        entry_key=entry_key,
        candle_count=len(candles),
        latest_candle_close_time_ms=latest.close_time_ms,
        reasons=reasons,
    )
