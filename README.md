# TradeBot — Bybit Intraday Demo Trading Platform

**Status Date:** 04 August 2026  
**Day:** Tuesday  
**Environment:** Bybit Demo only  
**Execution:** Disabled

TradeBot is a React + Node.js + Python intraday signal platform for Bybit Demo. The current production system performs closed-candle market scanning, final risk validation, Supabase signal persistence, scheduled signal automation, and pipeline supervision. It does not place orders.

## Production Status

- Frontend: deployed on Render
- Node.js backend: deployed and healthy on Render
- Python strategy engine: deployed and healthy on Render
- Supabase PostgreSQL: connected and verified
- Automated Signal Scanner Worker: healthy
- Pipeline Watchdog: healthy
- Market data: Bybit V5 public API
- Bybit Demo account connection: online
- Real trading: disabled
- Testnet: disabled
- Order execution: disabled
- Mock, fabricated, seeded, or unsafe fallback trading data: prohibited

## Live Deployment

```text
Frontend
https://tradebot-giga.onrender.com

Node.js Backend
https://tradebot-node-backend.onrender.com

Python Strategy Engine
https://tradebot-python-engine.onrender.com
```

Important runtime endpoints:

```text
GET https://tradebot-node-backend.onrender.com/health
GET https://tradebot-node-backend.onrender.com/ready
GET https://tradebot-node-backend.onrender.com/api/signals
GET https://tradebot-node-backend.onrender.com/api/watchdog/status
GET https://tradebot-node-backend.onrender.com/api/signal-worker/status
GET https://tradebot-python-engine.onrender.com/health
```

## Current Architecture

```text
React Frontend
      ↓
Node.js API, Pipeline Orchestration, Signal Worker, Watchdog
      ↓
Python Strategy Engine
      ↓
Supabase PostgreSQL
```

### Node.js Backend

The Node service is the final application authority for:

- frontend API endpoints
- Bybit market-data collection and validation
- pipeline orchestration
- final risk validation
- Supabase signal persistence
- cross-cycle duplicate protection
- scheduled signal scanning
- watchdog supervision
- system-health and readiness reporting
- future execution authority

### Python Strategy Engine

The Python service performs deterministic analysis only:

- 1H EMA trend validation
- 15M breakout and delayed retest validation
- 5M liquidity sweep and volume entry confirmation
- 15M swing stop-loss validation
- minimum 1:2 risk-reward validation
- rejection reasons and evidence

Python does not place or close orders.

### Supabase PostgreSQL

Supabase is the persistent database for approved final signal candidates.

Implemented database controls:

- table: `public.trade_signals`
- unique key: `signal_candidate_key`
- atomic duplicate handling through RPC
- duplicate sightings increment `seen_count`
- `last_seen_at` update
- RLS enabled
- frontend, anon, and authenticated direct access blocked
- server-side secret access only
- execution and actionable flags locked to false

Render local filesystem and Render PostgreSQL are not required for signal persistence.

## Locked Scanner Pipeline

```text
Top 50 Liquid USDT Perpetuals
        ↓
1H EMA Trend Filter — maximum 20
        ↓
15M Breakout + Delayed Retest — maximum 10
        ↓
5M Liquidity Sweep + Volume Entry — maximum 3
        ↓
15M Swing Stop-Loss + Minimum R:R 1:2
        ↓
Final Signal Candidate
        ↓
Supabase Persistence
```

The limits are maximum caps, not quotas. The pipeline never fabricates or pads results.

Example valid cycle:

```text
50 → 18 → 1 → 0 → 0
```

Zero final candidates is a valid healthy result when the strategy conditions are not met.

## Strategy Rules

### 1H Trend

- LONG: `EMA20 > EMA50 > EMA200`
- SHORT: `EMA20 < EMA50 < EMA200`
- otherwise: neutral or rejected
- closed 1H candles only

### 15M Setup

LONG:

- upstream 1H direction is LONG
- close breaks above the previous 20 closed-candle high
- retest occurs within the next 1–5 closed candles
- retest touches or crosses the breakout level and closes back above
- RSI14 is above 50

SHORT uses the symmetrical rules below the previous 20-candle low with RSI14 below 50.

### 5M Entry

LONG:

- upstream 1H and 15M stages passed LONG
- low sweeps the previous 20 closed-candle low
- candle closes back above the swept level
- volume exceeds the previous 20-candle average by at least 1.5x

SHORT uses the symmetrical rejection rule above the previous 20-candle high.

### Final Risk Validation

- latest confirmed 15M swing used as stop-loss reference
- LONG stop-loss must be below entry
- SHORT stop-loss must be above entry
- minimum risk-reward ratio: `1:2`
- closed candles only
- duplicate same-candle signal blocked

## Automated Signal Scanner Worker

The signal worker runs every 15 minutes:

```text
Full Pipeline
→ Final Candidate Validation
→ Supabase Insert or Duplicate Update
```

Worker controls:

- scheduled interval: 15 minutes
- startup delay supported
- overlap lock
- duplicate scheduled-cycle protection
- manual and scheduled scans share one in-flight run
- zero-candidate cycles remain healthy
- inserts only final risk-approved candidates
- execution remains disabled

Runtime environment:

```env
SIGNAL_WORKER_ENABLED=true
SIGNAL_WORKER_INTERVAL_MS=900000
SIGNAL_WORKER_INITIAL_DELAY_MS=30000
SIGNAL_WORKER_RUN_TIMEOUT_MS=780000
```

## Pipeline Watchdog

The watchdog supervises the worker and dependencies every 15 minutes.

It checks:

- market-data connection and clock skew
- Python engine readiness
- Bybit Demo connection
- signal worker status and freshness
- stage-count order and maximum limits
- worker failures and stale runs
- overlaps and duplicate cycles
- execution-off safety flags

The watchdog does not generate, persist, or execute signals.

Recommended runtime environment:

```env
WATCHDOG_ENABLED=true
WATCHDOG_INTERVAL_MS=900000
WATCHDOG_INITIAL_DELAY_MS=90000
WATCHDOG_RUN_TIMEOUT_MS=60000
```

## Signal API

```text
GET  /api/signals
POST /api/signals/scan
GET  /api/signal-worker/status
GET  /api/watchdog/status
```

`GET /api/signals` reports:

```text
storage.mode = SUPABASE_POSTGRES
storage.table = public.trade_signals
actionable = false
executionEnabled = false
```

## Market Data API

```text
GET /api/market/symbols
GET /api/market/tickers?symbol=BTCUSDT
GET /api/market/candles/:symbol/:interval
GET /api/market/freshness/:symbol
```

Supported intervals:

```text
5M, 15M, 1H
```

Market-data safety:

- closed candles only
- open candle excluded
- stale and future-dated candles rejected
- OHLC range validation
- positive price, volume, and turnover validation
- unsafe data blocks the pipeline

## Frontend Navigation

1. Dashboard
2. Market Scanner
3. Signals
4. Active Trades
5. Performance Analysis
6. Settings

Settings tabs:

1. Trading Setup
2. Bybit API
3. Notifications
4. Diagnostics
5. Decision Log

Diagnostics currently displays:

- Automated Signal Scanner Worker status
- next and last scan times
- inserted, duplicate-updated, and total stored counts
- Watchdog status
- dependency status
- latest pipeline stage counts
- failure and overlap information

## Safety Locks

- Bybit Demo only
- no Testnet mode
- no real-mainnet support
- no order-placement endpoint
- no automatic or manual execution
- no position sizing
- no frontend exposure of Supabase or exchange secrets
- backend secrets stored only in Render environment variables
- Python cannot place orders
- only final risk-approved candidates can be persisted
- database records remain `actionable: false`
- database records remain `execution_enabled: false`

## Required Backend Environment

```env
TRADING_MODE=bybit_demo
PYTHON_ENGINE_URL=https://tradebot-python-engine.onrender.com
INTERNAL_SERVICE_TOKEN=<shared-private-token>
FRONTEND_ORIGIN=https://tradebot-giga.onrender.com

SUPABASE_URL=https://zyuvlugtygalfcjeeblj.supabase.co
SUPABASE_SECRET_KEY=<server-side-secret-key>
SUPABASE_REQUEST_TIMEOUT_MS=8000

SIGNAL_WORKER_ENABLED=true
SIGNAL_WORKER_INTERVAL_MS=900000
SIGNAL_WORKER_INITIAL_DELAY_MS=30000
SIGNAL_WORKER_RUN_TIMEOUT_MS=780000

WATCHDOG_ENABLED=true
WATCHDOG_INTERVAL_MS=900000
WATCHDOG_INITIAL_DELAY_MS=90000
WATCHDOG_RUN_TIMEOUT_MS=60000
```

Never commit real tokens, API secrets, or Supabase secret keys.

## Repository Structure

```text
TradeBot/
├── src/                       # React frontend
├── backend-node/              # Node API, pipeline, worker, watchdog
├── engine-python/             # Python strategy engine
├── shared/                    # Shared contracts and schemas
├── supabase/migrations/       # Database schema and RPC migrations
├── docs/                      # Architecture and operational documentation
├── package.json
└── README.md
```

## Completed Milestones

- Hybrid Node + Python foundation
- Bybit V5 market-data foundation
- Dashboard backend and frontend integration
- closed-candle freshness enforcement
- 1H EMA trend scanner
- 15M breakout and delayed retest scanner
- 5M liquidity sweep and volume entry scanner
- 15M swing SL and minimum 1:2 risk validation
- final signal candidate pipeline
- Supabase persistent signal store
- atomic cross-cycle duplicate protection
- 15-minute automated signal scanner worker
- 15-minute pipeline watchdog
- live Render runtime verification

## Next Review

The next session should begin with runtime verification:

1. confirm Signal Worker remains healthy
2. confirm Watchdog remains healthy
3. inspect the latest 15-minute pipeline counts
4. verify Supabase insert or duplicate counts if a final candidate appears
5. review stale Market Scanner UI messages and panel-result synchronization

No execution phase should begin without explicit approval and a separate risk-and-execution implementation plan.
