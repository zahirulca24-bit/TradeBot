from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from .entry import EntryCandle, EntryDirection, analyze_five_minute_entry
from .setup import SetupCandle, SetupDirection, analyze_fifteen_minute_setup
from .trend import TrendCandle, analyze_one_hour_trend


class Settings(BaseSettings):
    environment: str = "development"
    port: int = 8001
    trading_mode: str
    internal_service_token: str

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


class TrendCandleRequest(BaseModel):
    symbol: str = Field(pattern=r"^[A-Z0-9]{3,30}$")
    interval: str = Field(pattern=r"^60$")
    startTimeMs: int = Field(gt=0)
    closeTimeMs: int = Field(gt=0)
    open: float = Field(gt=0)
    high: float = Field(gt=0)
    low: float = Field(gt=0)
    close: float = Field(gt=0)
    volume: float = Field(gt=0)
    turnover: float = Field(gt=0)


class TrendAnalysisRequest(BaseModel):
    symbol: str = Field(pattern=r"^[A-Z0-9]{3,30}$")
    candles: list[TrendCandleRequest] = Field(min_length=200, max_length=500)


class SetupCandleRequest(BaseModel):
    symbol: str = Field(pattern=r"^[A-Z0-9]{3,30}$")
    interval: str = Field(pattern=r"^15$")
    startTimeMs: int = Field(gt=0)
    closeTimeMs: int = Field(gt=0)
    open: float = Field(gt=0)
    high: float = Field(gt=0)
    low: float = Field(gt=0)
    close: float = Field(gt=0)
    volume: float = Field(gt=0)
    turnover: float = Field(gt=0)


class SetupAnalysisRequest(BaseModel):
    symbol: str = Field(pattern=r"^[A-Z0-9]{3,30}$")
    direction: SetupDirection
    candles: list[SetupCandleRequest] = Field(min_length=40, max_length=500)


class EntryCandleRequest(BaseModel):
    symbol: str = Field(pattern=r"^[A-Z0-9]{3,30}$")
    interval: str = Field(pattern=r"^5$")
    startTimeMs: int = Field(gt=0)
    closeTimeMs: int = Field(gt=0)
    open: float = Field(gt=0)
    high: float = Field(gt=0)
    low: float = Field(gt=0)
    close: float = Field(gt=0)
    volume: float = Field(gt=0)
    turnover: float = Field(gt=0)


class EntryAnalysisRequest(BaseModel):
    symbol: str = Field(pattern=r"^[A-Z0-9]{3,30}$")
    direction: EntryDirection
    candles: list[EntryCandleRequest] = Field(min_length=21, max_length=500)


app = FastAPI(title="TradeBot Python Strategy Engine", version="0.4.0")


def load_settings() -> Settings | None:
    try:
        settings = Settings()
    except Exception:
        return None

    if settings.trading_mode != "bybit_demo":
        return None
    if len(settings.internal_service_token) < 24:
        return None
    return settings


def require_internal_service(
    x_internal_service_token: Annotated[str | None, Header()] = None,
) -> Settings:
    settings = load_settings()
    if settings is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "INVALID_ENVIRONMENT", "ready": False},
        )

    if x_internal_service_token is None or not hmac.compare_digest(
        x_internal_service_token,
        settings.internal_service_token,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_INTERNAL_TOKEN", "ready": False},
        )
    return settings


def scanner_capabilities() -> list[str]:
    return [
        "ONE_HOUR_EMA_TREND",
        "FIFTEEN_MINUTE_BREAKOUT_RETEST",
        "FIVE_MINUTE_LIQUIDITY_SWEEP_VOLUME_ENTRY",
    ]


@app.get("/health")
def health() -> dict[str, object]:
    configured = load_settings() is not None
    return {
        "service": "tradebot-engine-python",
        "status": "healthy" if configured else "degraded",
        "tradingMode": "bybit_demo" if configured else "unconfigured",
        "executionAuthority": False,
        "scannerCapabilities": scanner_capabilities(),
    }


@app.get("/ready")
def ready(
    x_internal_service_token: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    require_internal_service(x_internal_service_token)
    return {
        "service": "tradebot-engine-python",
        "ready": True,
        "tradingMode": "bybit_demo",
        "executionAuthority": False,
        "scannerCapabilities": scanner_capabilities(),
    }


@app.post("/analysis/trend")
def analyze_trend(
    request: TrendAnalysisRequest,
    x_internal_service_token: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    require_internal_service(x_internal_service_token)

    if any(candle.symbol != request.symbol for candle in request.candles):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "CANDLE_SYMBOL_MISMATCH"},
        )

    try:
        analysis = analyze_one_hour_trend(
            [
                TrendCandle(
                    symbol=candle.symbol,
                    interval=candle.interval,
                    start_time_ms=candle.startTimeMs,
                    close_time_ms=candle.closeTimeMs,
                    open=candle.open,
                    high=candle.high,
                    low=candle.low,
                    close=candle.close,
                    volume=candle.volume,
                    turnover=candle.turnover,
                )
                for candle in request.candles
            ]
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": str(error)},
        ) from error

    return {
        "engine": "tradebot-python",
        "strategyStage": "ONE_HOUR_TREND",
        "symbol": analysis.symbol,
        "interval": analysis.interval,
        "direction": analysis.direction.value,
        "passed": analysis.passed,
        "indicators": {
            "latestClose": analysis.latest_close,
            "ema20": analysis.ema20,
            "ema50": analysis.ema50,
            "ema200": analysis.ema200,
        },
        "candleCount": analysis.candle_count,
        "latestCandleCloseTimeMs": analysis.latest_candle_close_time_ms,
        "reasons": list(analysis.reasons),
        "actionable": False,
    }


@app.post("/analysis/setup")
def analyze_setup(
    request: SetupAnalysisRequest,
    x_internal_service_token: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    require_internal_service(x_internal_service_token)

    if any(candle.symbol != request.symbol for candle in request.candles):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "CANDLE_SYMBOL_MISMATCH"},
        )

    try:
        analysis = analyze_fifteen_minute_setup(
            [
                SetupCandle(
                    symbol=candle.symbol,
                    interval=candle.interval,
                    start_time_ms=candle.startTimeMs,
                    close_time_ms=candle.closeTimeMs,
                    open=candle.open,
                    high=candle.high,
                    low=candle.low,
                    close=candle.close,
                    volume=candle.volume,
                    turnover=candle.turnover,
                )
                for candle in request.candles
            ],
            request.direction,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": str(error)},
        ) from error

    return {
        "engine": "tradebot-python",
        "strategyStage": "FIFTEEN_MINUTE_SETUP",
        "symbol": analysis.symbol,
        "interval": analysis.interval,
        "direction": analysis.direction.value,
        "passed": analysis.passed,
        "indicators": {
            "latestClose": analysis.latest_close,
            "rsi14": analysis.rsi14,
        },
        "setup": {
            "breakoutLevel": analysis.breakout_level,
            "breakoutCandleCloseTimeMs": analysis.breakout_candle_close_time_ms,
            "retestCandleCloseTimeMs": analysis.retest_candle_close_time_ms,
            "breakoutAgeCandles": analysis.breakout_age_candles,
            "breakoutLookbackCandles": 20,
            "retestWindowMinCandles": 1,
            "retestWindowMaxCandles": 5,
        },
        "candleCount": analysis.candle_count,
        "latestCandleCloseTimeMs": analysis.latest_candle_close_time_ms,
        "reasons": list(analysis.reasons),
        "actionable": False,
    }


@app.post("/analysis/entry")
def analyze_entry(
    request: EntryAnalysisRequest,
    x_internal_service_token: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    require_internal_service(x_internal_service_token)

    if any(candle.symbol != request.symbol for candle in request.candles):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "CANDLE_SYMBOL_MISMATCH"},
        )

    try:
        analysis = analyze_five_minute_entry(
            [
                EntryCandle(
                    symbol=candle.symbol,
                    interval=candle.interval,
                    start_time_ms=candle.startTimeMs,
                    close_time_ms=candle.closeTimeMs,
                    open=candle.open,
                    high=candle.high,
                    low=candle.low,
                    close=candle.close,
                    volume=candle.volume,
                    turnover=candle.turnover,
                )
                for candle in request.candles
            ],
            request.direction,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": str(error)},
        ) from error

    return {
        "engine": "tradebot-python",
        "strategyStage": "FIVE_MINUTE_ENTRY",
        "symbol": analysis.symbol,
        "interval": analysis.interval,
        "direction": analysis.direction.value,
        "passed": analysis.passed,
        "indicators": {
            "latestClose": analysis.latest_close,
            "sweepLevel": analysis.sweep_level,
            "averageVolume20": analysis.average_volume20,
            "latestVolume": analysis.latest_volume,
            "volumeRatio": analysis.volume_ratio,
            "sweepDepthBps": analysis.sweep_depth_bps,
        },
        "entry": {
            "entryCandleCloseTimeMs": analysis.entry_candle_close_time_ms,
            "entryKey": analysis.entry_key,
            "sweepLookbackCandles": 20,
            "volumeLookbackCandles": 20,
            "volumeMultiplier": 1.5,
        },
        "candleCount": analysis.candle_count,
        "latestCandleCloseTimeMs": analysis.latest_candle_close_time_ms,
        "reasons": list(analysis.reasons),
        "actionable": False,
    }
