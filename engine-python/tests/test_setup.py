from __future__ import annotations

import unittest

from app.setup import SetupCandle, SetupDirection, analyze_fifteen_minute_setup


FIFTEEN_MINUTES_MS = 15 * 60 * 1000


def candle(index: int, *, open_: float, high: float, low: float, close: float) -> SetupCandle:
    start = (index + 1) * FIFTEEN_MINUTES_MS
    return SetupCandle(
        symbol="BTCUSDT",
        interval="15",
        start_time_ms=start,
        close_time_ms=start + FIFTEEN_MINUTES_MS,
        open=open_,
        high=high,
        low=low,
        close=close,
        volume=1000,
        turnover=close * 1000,
    )


def rising_candles(count: int = 60) -> list[SetupCandle]:
    result: list[SetupCandle] = []
    for index in range(count):
        close = 100.0 + (index * 0.01)
        result.append(candle(index, open_=close - 0.02, high=close + 0.20, low=close - 0.20, close=close))
    return result


def falling_candles(count: int = 60) -> list[SetupCandle]:
    result: list[SetupCandle] = []
    for index in range(count):
        close = 200.0 - (index * 0.01)
        result.append(candle(index, open_=close + 0.02, high=close + 0.20, low=close - 0.20, close=close))
    return result


class FifteenMinuteSetupTests(unittest.TestCase):
    def test_detects_long_breakout_then_latest_candle_retest(self) -> None:
        candles = rising_candles()
        breakout_index = 56
        previous_high = max(item.high for item in candles[breakout_index - 20 : breakout_index])
        candles[breakout_index] = candle(
            breakout_index,
            open_=previous_high + 0.05,
            high=previous_high + 1.00,
            low=previous_high - 0.05,
            close=previous_high + 0.80,
        )
        candles[57] = candle(57, open_=previous_high + 0.70, high=previous_high + 0.90, low=previous_high + 0.30, close=previous_high + 0.55)
        candles[58] = candle(58, open_=previous_high + 0.55, high=previous_high + 0.65, low=previous_high + 0.10, close=previous_high + 0.35)
        candles[59] = candle(59, open_=previous_high + 0.30, high=previous_high + 0.50, low=previous_high - 0.10, close=previous_high + 0.20)

        result = analyze_fifteen_minute_setup(candles, SetupDirection.LONG)

        self.assertTrue(result.passed)
        self.assertEqual(result.direction, SetupDirection.LONG)
        self.assertEqual(result.breakout_age_candles, 3)
        self.assertAlmostEqual(result.breakout_level or 0, previous_high)
        self.assertGreater(result.rsi14, 50)
        self.assertIn("LATEST_CLOSED_15M_CANDLE_RECLAIMED_BREAKOUT_LEVEL", result.reasons)

    def test_detects_short_breakout_then_latest_candle_retest(self) -> None:
        candles = falling_candles()
        breakout_index = 57
        previous_low = min(item.low for item in candles[breakout_index - 20 : breakout_index])
        candles[breakout_index] = candle(
            breakout_index,
            open_=previous_low - 0.05,
            high=previous_low + 0.05,
            low=previous_low - 1.00,
            close=previous_low - 0.80,
        )
        candles[58] = candle(58, open_=previous_low - 0.70, high=previous_low - 0.20, low=previous_low - 0.90, close=previous_low - 0.50)
        candles[59] = candle(59, open_=previous_low - 0.40, high=previous_low + 0.10, low=previous_low - 0.60, close=previous_low - 0.20)

        result = analyze_fifteen_minute_setup(candles, SetupDirection.SHORT)

        self.assertTrue(result.passed)
        self.assertEqual(result.direction, SetupDirection.SHORT)
        self.assertEqual(result.breakout_age_candles, 2)
        self.assertAlmostEqual(result.breakout_level or 0, previous_low)
        self.assertLess(result.rsi14, 50)
        self.assertIn("LATEST_CLOSED_15M_CANDLE_REJECTED_BREAKOUT_LEVEL", result.reasons)

    def test_rejects_breakout_without_delayed_retest(self) -> None:
        candles = rising_candles()
        latest_index = len(candles) - 1
        previous_high = max(item.high for item in candles[latest_index - 20 : latest_index])
        candles[latest_index] = candle(
            latest_index,
            open_=previous_high + 0.10,
            high=previous_high + 1.00,
            low=previous_high + 0.05,
            close=previous_high + 0.80,
        )

        result = analyze_fifteen_minute_setup(candles, SetupDirection.LONG)

        self.assertFalse(result.passed)
        self.assertIn("NO_LONG_BREAKOUT_WITHIN_1_TO_5_CANDLES", result.reasons)

    def test_rejects_insufficient_history(self) -> None:
        with self.assertRaisesRegex(ValueError, "INSUFFICIENT_CANDLES"):
            analyze_fifteen_minute_setup(rising_candles(39), SetupDirection.LONG)


if __name__ == "__main__":
    unittest.main()
