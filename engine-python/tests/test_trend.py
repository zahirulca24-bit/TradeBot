from __future__ import annotations

import unittest

from app.trend import TrendCandle, TrendDirection, analyze_one_hour_trend


HOUR_MS = 60 * 60 * 1000


def candles_from_closes(closes: list[float]) -> list[TrendCandle]:
    candles: list[TrendCandle] = []
    for index, close in enumerate(closes):
        start = (index + 1) * HOUR_MS
        candles.append(
            TrendCandle(
                symbol="BTCUSDT",
                interval="60",
                start_time_ms=start,
                close_time_ms=start + HOUR_MS,
                open=close,
                high=close + 1,
                low=max(close - 1, 0.01),
                close=close,
                volume=1000,
                turnover=close * 1000,
            )
        )
    return candles


class OneHourTrendTests(unittest.TestCase):
    def test_detects_long_alignment(self) -> None:
        closes = [100 + index for index in range(250)]
        result = analyze_one_hour_trend(candles_from_closes(closes))
        self.assertEqual(result.direction, TrendDirection.LONG)
        self.assertTrue(result.passed)
        self.assertGreater(result.ema20, result.ema50)
        self.assertGreater(result.ema50, result.ema200)

    def test_detects_short_alignment(self) -> None:
        closes = [500 - index for index in range(250)]
        result = analyze_one_hour_trend(candles_from_closes(closes))
        self.assertEqual(result.direction, TrendDirection.SHORT)
        self.assertTrue(result.passed)
        self.assertLess(result.ema20, result.ema50)
        self.assertLess(result.ema50, result.ema200)

    def test_rejects_unaligned_market(self) -> None:
        closes = [100 for _ in range(250)]
        result = analyze_one_hour_trend(candles_from_closes(closes))
        self.assertEqual(result.direction, TrendDirection.NEUTRAL)
        self.assertFalse(result.passed)
        self.assertEqual(result.reasons, ("ONE_HOUR_TREND_NOT_ALIGNED",))

    def test_rejects_insufficient_history(self) -> None:
        with self.assertRaisesRegex(ValueError, "INSUFFICIENT_CANDLES"):
            analyze_one_hour_trend(candles_from_closes([100 + index for index in range(199)]))


if __name__ == "__main__":
    unittest.main()
