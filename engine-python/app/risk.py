from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from math import isfinite
from typing import Sequence


FIFTEEN_MINUTES_MS = 15 * 60 * 1000
SWING_LOOKBACK_CANDLES = 40
PIVOT_LEFT_CANDLES = 1
PIVOT_RIGHT_CANDLES = 1
MINIMUM_RISK_REWARD = 2.0
MINIMUM_CANDLES = 5


class RiskDirection(str, Enum):
    LONG = "LONG"
    SHORT = "SHORT"


@dataclass(frozen=True)
class RiskCandle:
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
class RiskAnalysis:
    symbol: str
    interval: str
    direction: RiskDirection
    passed: bool
    entry_price: float
    entry_candle_close_time_ms: int
    entry_key: str
    stop_loss: float | None
    target_price: float | None
    risk_distance: float | None
    risk_bps: float | None
    risk_reward_ratio: float | None
    swing_price: float | None
    swing_candle_close_time_ms: int | None
    swing_age_candles: int | None
    candle_count: int
    latest_candle_close_time_ms: int
    signal_candidate_key: str | None
    reasons: tuple[str, ...]


def _validate_candles(candles: Sequence[RiskCandle]) -> None:
    if len(candles) < MINIMUM_CANDLES:
        raise ValueError("INSUFFICIENT_CANDLES")

    expected_symbol = candles[0].symbol
    previous_start: int | None = None
    previous_close: int | None = None

    for candle in candles:
        if candle.symbol != expected_symbol:
            raise ValueError("CANDLE_SYMBOL_MISMATCH")
        if candle.interval != "15":
            raise ValueError("INVALID_RISK_INTERVAL")
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


def _latest_confirmed_swing(
    candles: Sequence[RiskCandle], direction: RiskDirection
) -> tuple[int, RiskCandle] | None:
    latest_confirmable_index = len(candles) - 1 - PIVOT_RIGHT_CANDLES
    earliest_index = max(PIVOT_LEFT_CANDLES, len(candles) - 1 - SWING_LOOKBACK_CANDLES)

    for index in range(latest_confirmable_index, earliest_index - 1, -1):
        previous = candles[index - 1]
        pivot = candles[index]
        following = candles[index + 1]

        if direction is RiskDirection.LONG:
            if pivot.low < previous.low and pivot.low < following.low:
                return index, pivot
        elif pivot.high > previous.high and pivot.high > following.high:
            return index, pivot

    return None


def analyze_final_risk_candidate(
    candles: Sequence[RiskCandle],
    direction: RiskDirection,
    *,
    entry_price: float,
    entry_candle_close_time_ms: int,
    entry_key: str,
) -> RiskAnalysis:
    _validate_candles(candles)

    if not isfinite(entry_price) or entry_price <= 0:
        raise ValueError("INVALID_ENTRY_PRICE")
    if entry_candle_close_time_ms <= 0:
        raise ValueError("INVALID_ENTRY_TIME")
    if not entry_key:
        raise ValueError("INVALID_ENTRY_KEY")

    eligible = [candle for candle in candles if candle.close_time_ms <= entry_candle_close_time_ms]
    if len(eligible) < MINIMUM_CANDLES:
        raise ValueError("INSUFFICIENT_PRE_ENTRY_15M_CANDLES")

    latest = eligible[-1]
    selected_swing = _latest_confirmed_swing(eligible, direction)
    if selected_swing is None:
        return RiskAnalysis(
            symbol=latest.symbol,
            interval=latest.interval,
            direction=direction,
            passed=False,
            entry_price=entry_price,
            entry_candle_close_time_ms=entry_candle_close_time_ms,
            entry_key=entry_key,
            stop_loss=None,
            target_price=None,
            risk_distance=None,
            risk_bps=None,
            risk_reward_ratio=None,
            swing_price=None,
            swing_candle_close_time_ms=None,
            swing_age_candles=None,
            candle_count=len(eligible),
            latest_candle_close_time_ms=latest.close_time_ms,
            signal_candidate_key=None,
            reasons=(
                "NO_CONFIRMED_15M_SWING_LOW_WITHIN_40_CANDLES"
                if direction is RiskDirection.LONG
                else "NO_CONFIRMED_15M_SWING_HIGH_WITHIN_40_CANDLES",
            ),
        )

    swing_index, swing_candle = selected_swing
    swing_price = swing_candle.low if direction is RiskDirection.LONG else swing_candle.high
    stop_loss = swing_price
    risk_distance = (
        entry_price - stop_loss
        if direction is RiskDirection.LONG
        else stop_loss - entry_price
    )

    if risk_distance <= 0:
        return RiskAnalysis(
            symbol=latest.symbol,
            interval=latest.interval,
            direction=direction,
            passed=False,
            entry_price=entry_price,
            entry_candle_close_time_ms=entry_candle_close_time_ms,
            entry_key=entry_key,
            stop_loss=stop_loss,
            target_price=None,
            risk_distance=None,
            risk_bps=None,
            risk_reward_ratio=None,
            swing_price=swing_price,
            swing_candle_close_time_ms=swing_candle.close_time_ms,
            swing_age_candles=len(eligible) - 1 - swing_index,
            candle_count=len(eligible),
            latest_candle_close_time_ms=latest.close_time_ms,
            signal_candidate_key=None,
            reasons=(
                "CONFIRMED_15M_SWING_NOT_BELOW_LONG_ENTRY"
                if direction is RiskDirection.LONG
                else "CONFIRMED_15M_SWING_NOT_ABOVE_SHORT_ENTRY",
            ),
        )

    target_price = (
        entry_price + (risk_distance * MINIMUM_RISK_REWARD)
        if direction is RiskDirection.LONG
        else entry_price - (risk_distance * MINIMUM_RISK_REWARD)
    )
    if target_price <= 0:
        return RiskAnalysis(
            symbol=latest.symbol,
            interval=latest.interval,
            direction=direction,
            passed=False,
            entry_price=entry_price,
            entry_candle_close_time_ms=entry_candle_close_time_ms,
            entry_key=entry_key,
            stop_loss=stop_loss,
            target_price=None,
            risk_distance=risk_distance,
            risk_bps=(risk_distance / entry_price) * 10_000,
            risk_reward_ratio=None,
            swing_price=swing_price,
            swing_candle_close_time_ms=swing_candle.close_time_ms,
            swing_age_candles=len(eligible) - 1 - swing_index,
            candle_count=len(eligible),
            latest_candle_close_time_ms=latest.close_time_ms,
            signal_candidate_key=None,
            reasons=("TWO_R_TARGET_NOT_POSITIVE",),
        )

    reward_distance = abs(target_price - entry_price)
    risk_reward_ratio = reward_distance / risk_distance
    signal_candidate_key = (
        f"{entry_key}:SWING:{swing_candle.close_time_ms}:RR2"
    )

    reasons = (
        "CONFIRMED_15M_SWING_LOW_SELECTED"
        if direction is RiskDirection.LONG
        else "CONFIRMED_15M_SWING_HIGH_SELECTED",
        "STOP_LOSS_ON_VALID_SIDE_OF_ENTRY",
        "MINIMUM_RISK_REWARD_1_TO_2_CONFIRMED",
        "FINAL_SIGNAL_CANDIDATE_CREATED",
    )

    return RiskAnalysis(
        symbol=latest.symbol,
        interval=latest.interval,
        direction=direction,
        passed=risk_reward_ratio >= MINIMUM_RISK_REWARD,
        entry_price=entry_price,
        entry_candle_close_time_ms=entry_candle_close_time_ms,
        entry_key=entry_key,
        stop_loss=stop_loss,
        target_price=target_price,
        risk_distance=risk_distance,
        risk_bps=(risk_distance / entry_price) * 10_000,
        risk_reward_ratio=risk_reward_ratio,
        swing_price=swing_price,
        swing_candle_close_time_ms=swing_candle.close_time_ms,
        swing_age_candles=len(eligible) - 1 - swing_index,
        candle_count=len(eligible),
        latest_candle_close_time_ms=latest.close_time_ms,
        signal_candidate_key=signal_candidate_key,
        reasons=reasons,
    )
