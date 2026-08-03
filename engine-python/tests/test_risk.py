from __future__ import annotations

import unittest

from app.risk import RiskCandle, RiskDirection, analyze_final_risk_candidate


FIFTEEN_MINUTES_MS = 15 * 60 * 1000


def make_candles(direction: RiskDirection) -> list[RiskCandle]:
    candles: list[RiskCandle] = []
    for index in range(12):
        start = (index + 1) * FIFTEEN_MINUTES_MS
        if direction is RiskDirection.LONG:
            close = 100.0 + (index * 0.2)
            low = close - 0.8
            high = close + 0.8
            if index == 8:
                low = 98.0
            if index == 9:
                low = 99.5
        else:
            close = 200.0 - (index * 0.2)
            low = close - 0.8
            high = close + 0.8
            if index == 8:
                high = 203.0
            if index == 9:
                high = 201.0

        candles.append(
            RiskCandle(
                symbol="BTCUSDT",
                interval="15",
                start_time_ms=start,
                close_time_ms=start + FIFTEEN_MINUTES_MS,
                open=close,
                high=high,
                low=low,
                close=close,
                volume=1000.0,
                turnover=close * 1000.0,
            )
        )
    return candles


class FinalRiskCandidateTests(unittest.TestCase):
    def test_builds_long_candidate_from_confirmed_swing_low(self) -> None:
        candles = make_candles(RiskDirection.LONG)
        result = analyze_final_risk_candidate(
            candles,
            RiskDirection.LONG,
            entry_price=103.0,
            entry_candle_close_time_ms=candles[-1].close_time_ms + (5 * 60 * 1000),
            entry_key="BTCUSDT:LONG:123456",
        )
        self.assertTrue(result.passed)
        self.assertLess(result.stop_loss or 0, result.entry_price)
        self.assertGreater(result.target_price or 0, result.entry_price)
        self.assertAlmostEqual(result.risk_reward_ratio or 0, 2.0)
        self.assertIn("FINAL_SIGNAL_CANDIDATE_CREATED", result.reasons)

    def test_builds_short_candidate_from_confirmed_swing_high(self) -> None:
        candles = make_candles(RiskDirection.SHORT)
        result = analyze_final_risk_candidate(
            candles,
            RiskDirection.SHORT,
            entry_price=197.0,
            entry_candle_close_time_ms=candles[-1].close_time_ms + (5 * 60 * 1000),
            entry_key="BTCUSDT:SHORT:123456",
        )
        self.assertTrue(result.passed)
        self.assertGreater(result.stop_loss or 0, result.entry_price)
        self.assertLess(result.target_price or 0, result.entry_price)
        self.assertAlmostEqual(result.risk_reward_ratio or 0, 2.0)

    def test_rejects_when_no_confirmed_swing_exists(self) -> None:
        candles: list[RiskCandle] = []
        for index in range(10):
            start = (index + 1) * FIFTEEN_MINUTES_MS
            close = 100.0 + index
            candles.append(
                RiskCandle(
                    symbol="BTCUSDT",
                    interval="15",
                    start_time_ms=start,
                    close_time_ms=start + FIFTEEN_MINUTES_MS,
                    open=close,
                    high=close + 0.5,
                    low=close - 0.5,
                    close=close,
                    volume=1000.0,
                    turnover=close * 1000.0,
                )
            )

        result = analyze_final_risk_candidate(
            candles,
            RiskDirection.LONG,
            entry_price=111.0,
            entry_candle_close_time_ms=candles[-1].close_time_ms,
            entry_key="BTCUSDT:LONG:123456",
        )
        self.assertFalse(result.passed)
        self.assertIsNone(result.signal_candidate_key)
        self.assertIn("NO_CONFIRMED_15M_SWING_LOW_WITHIN_40_CANDLES", result.reasons)

    def test_rejects_swing_on_wrong_side_of_entry(self) -> None:
        candles = make_candles(RiskDirection.LONG)
        result = analyze_final_risk_candidate(
            candles,
            RiskDirection.LONG,
            entry_price=97.0,
            entry_candle_close_time_ms=candles[-1].close_time_ms,
            entry_key="BTCUSDT:LONG:123456",
        )
        self.assertFalse(result.passed)
        self.assertIn("CONFIRMED_15M_SWING_NOT_BELOW_LONG_ENTRY", result.reasons)

    def test_rejects_insufficient_pre_entry_history(self) -> None:
        candles = make_candles(RiskDirection.SHORT)
        with self.assertRaisesRegex(ValueError, "INSUFFICIENT_PRE_ENTRY_15M_CANDLES"):
            analyze_final_risk_candidate(
                candles,
                RiskDirection.SHORT,
                entry_price=197.0,
                entry_candle_close_time_ms=candles[2].close_time_ms,
                entry_key="BTCUSDT:SHORT:123456",
            )


if __name__ == "__main__":
    unittest.main()
