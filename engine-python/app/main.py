from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, status
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    port: int = 8001
    trading_mode: str
    internal_service_token: str

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


app = FastAPI(title="TradeBot Python Strategy Engine", version="0.1.0")


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


@app.get("/health")
def health() -> dict[str, object]:
    configured = load_settings() is not None
    return {
        "service": "tradebot-engine-python",
        "status": "healthy" if configured else "degraded",
        "tradingMode": "bybit_demo" if configured else "unconfigured",
        "executionAuthority": False,
    }


@app.get("/ready")
def ready(
    x_internal_service_token: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
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

    return {
        "service": "tradebot-engine-python",
        "ready": True,
        "tradingMode": "bybit_demo",
        "executionAuthority": False,
    }
