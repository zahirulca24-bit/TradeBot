from __future__ import annotations

import unittest

from app.entry import EntryCandle, EntryDirection, analyze_five_minute_entry


FIVE_MINUTES_MS = 5 * 60 * 1000


def make_candles(
    *,
    direction: EntryDirection,
    volume: float = 2000.0,
    reclaim: bool = True,
    sweep: bool = True,
) -> list[EntryCandle]:
    candles: list[EntryCandle] = []
    for index in range(20):
        start = (index + 1) * FIVE_MINUTES_MS
        if direction is EntryDirection.LONG:
            low = 99.0 + (index * 0.01)
            high = 101.0 + (index * 0.01)
            close = 100.0 + (index * 0.01)
        else:
            low = 199.0 - (index * 0.01)
            high = 201.0 - (index * 0.01)
            close = 200.0 - (index * 0.01)
        candles.append(
            EntryCandle(
                symbol="BTCUSDT",
                interval="5",
                start_time_ms=start,
                close_time_ms=start + FIVE_MINUTES_MS,
                open=close,
                high=high,
                low=low,
                close=close,
                volume=1000.0,
                turnover=close * 1000.0,
            )
        )

    start = 21 * FIVE_MINUTES_MS
    if direction is EntryDirection.LONG:
        level = min(candle.low for candle in candles)
        low = level - 0.5 if sweep else level + 0.1
        close = level + 0.2 if reclaim else level - 0.2
        high = max(close + 0.5, level + 0.5)
    else:
        level = max(candle.high for candle in candles)
        high = level + 0.5 if sweep else level - 0.1
        close = level - 0.2 if reclaim else level + 0.2
        low = min(close - 0.5, level - 0.5)

    candles.append(
        EntryCandle(
            symbol="BTCUSDT",
            interval="5",
            start_time_ms=start,
            close_time_ms=start + FIVE_MINUTES_MS,
            open=level,
            high=high,
            low=low,
            close=close,
            volume=volume,
            turnover=close * volume,
        )
    )
    return candles


class FiveMinuteEntryTests(unittest.TestCase):
    def test_confirms_long_sweep_reclaim_with_volume(self) -> None:
        result = analyze_five_minute_entry(
            make_candles(direction=EntryDirection.LONG), EntryDirection.LONG
        )
        self.assertTrue(result.passed)
        self.assertGreater(result.volume_ratio, 1.5)
        self.assertGreater(result.sweep_depth_bps, 0)
        self.assertEqual(result.entry_key, f"BTCUSDT:LONG:{result.entry_candle_close_time_ms}")

    def test_confirms_short_sweep_rejection_with_volume(self) -> None:
        result = analyze_five_minute_entry(
            make_candles(direction=EntryDirection.SHORT), EntryDirection.SHORT
        )
        self.assertTrue(result.passed)
        self.assertGreater(result.volume_ratio, 1.5)
        self.assertGreater(result.sweep_depth_bps, 0)

    def test_rejects_sweep_without_reclaim(self) -> None:
        result = analyze_five_minute_entry(
            make_candles(direction=EntryDirection.LONG, reclaim=False), EntryDirection.LONG
        )
        self.assertFalse(result.passed)
        self.assertIn("LATEST_5M_CANDLE_DID_NOT_RECLAIM_LONG_SWEEP_LEVEL", result.reasons)

    def test_rejects_without_volume_confirmation(self) -> None:
        result = analyze_five_minute_entry(
            make_candles(direction=EntryDirection.SHORT, volume=1500.0), EntryDirection.SHORT
        )
        self.assertFalse(result.passed)
        self.assertIn("VOLUME_NOT_ABOVE_20_CANDLE_AVERAGE_X_1_5", result.reasons)

    def test_rejects_without_sweep(self) -> None:
        result = analyze_five_minute_entry(
            make_candles(direction=EntryDirection.LONG, sweep=False), EntryDirection.LONG
        )
        self.assertFalse(result.passed)
        self.assertIn("LATEST_5M_CANDLE_DID_NOT_SWEEP_PREVIOUS_20_LOW", result.reasons)

    def test_rejects_insufficient_history(self) -> None:
        candles = make_candles(direction=EntryDirection.LONG)[:20]
        with self.assertRaisesRegex(ValueError, "INSUFFICIENT_CANDLES"):
            analyze_five_minute_entry(candles, EntryDirection.LONG)


if __name__ == "__main__":
    unittest.main()
