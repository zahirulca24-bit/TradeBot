# TradeBot — Bybit Intraday Demo Trading Platform

TradeBot is a Bybit Demo-only intraday trading platform built with a React frontend and a hybrid Node.js + Python backend architecture.

## Current Status

- Frontend: deployed on Render and configured with the Node backend URL
- Node.js backend: deployed and healthy on Render
- Python strategy engine: deployed and healthy on Render
- Phase 1 — Hybrid Backend Foundation: completed
- Phase 1.5 — Market Data Collection & Freshness Foundation: completed
- Phase 2 — Dashboard Backend: completed
- Current backend progress: 45%
- Exchange mode: Bybit Demo only
- Testnet: disabled
- Real trading: disabled
- Mock, seeded, sample, cached-fallback, or fabricated trading data: prohibited
- Execution: disabled until the dedicated execution phases are implemented and approved

The Dashboard backend now returns real Bybit Demo account metrics. The current frontend Dashboard is still a static disconnected view and must be integrated with the completed Dashboard endpoints before Phase 3 begins.

## Frontend Navigation

1. Dashboard
2. Market Scanner
3. Signals
4. Active Trades
5. Performance Analysis
6. Settings

Settings contains exactly five tabs:

1. Trading Setup
2. Bybit API
3. Notifications
4. Diagnostics
5. Decision Log

## Hybrid Backend Architecture

### Node.js Service — API Gateway and Final Authority

The Node.js service owns or will own:

- frontend API endpoints
- authentication and control-token validation
- engine start and stop orchestration
- WebSocket and live status delivery
- Bybit Demo API integration
- final risk approval
- order execution and trade lifecycle
- active-trade management
- manual execute and manual close operations
- notification dispatch
- request validation
- database writes and audit records
- communication with the Python strategy service

Node.js is the final authority for risk, execution, exchange confirmation, trade state, and persistent records.

### Python Service — Strategy and Analytics Engine

The Python service owns or will own:

- market-data processing
- technical-indicator calculation
- 1H trend detection
- 15M setup validation
- 5M entry confirmation
- deterministic signal scoring and grading
- entry, stop-loss, and take-profit proposals
- risk-reward validation
- position-size proposals
- rejection and decision reasons
- performance analytics
- future backtesting support

Python must never place or close exchange orders directly.

## Authority Flow

```text
Bybit market data
        ↓
Node.js collection and validation
        ↓
Python strategy analysis
        ↓
Node.js response validation
        ↓
Node.js final risk approval
        ↓
Bybit Demo execution
        ↓
Database and audit log
        ↓
Frontend
```

The frontend must call only the Node.js API. It must never call the Python service or Bybit directly.

## Completed Foundation

### Phase 1 — Hybrid Foundation ✅

- Node.js API service scaffold
- Python FastAPI strategy-service scaffold
- shared contracts
- health and readiness endpoints
- internal service authentication
- environment validation
- separated frontend and backend CI validation
- Bybit Demo-only safety lock
- fail-closed readiness

### Phase 1.5 — Market Data Collection & Freshness Foundation ✅

- Bybit V5 public market-data client in Node.js
- Bybit server-time collection
- trading USDT linear perpetual symbol discovery
- ticker collection
- 5M, 15M, and 1H kline collection
- closed-candle-only filtering
- open candle exclusion
- clock-skew validation
- stale and future-dated candle rejection
- OHLC range validation
- positive price, volume, and turnover validation
- fail-closed market-data errors
- market-data readiness integration

Available market-data endpoints:

```text
GET /api/market/symbols
GET /api/market/tickers?symbol=BTCUSDT
GET /api/market/candles/:symbol/:interval
GET /api/market/freshness/:symbol
```

Supported candle intervals are `5`, `15`, and `60`.

### Phase 2 — Dashboard Backend ✅

- Bybit Demo wallet balance and total equity
- available balance and unrealised P&L
- open positions
- daily realised P&L
- daily trade count, wins, losses, and win rate
- engine status and recent activity state
- system-health endpoint
- fail-closed start and stop controls
- safe handling of HTML, malformed JSON, and invalid Bybit API responses
- no secret, signature, or upstream response-body logging

Available Dashboard endpoints:

```text
GET  /api/dashboard/summary
GET  /api/dashboard/system-health
POST /api/dashboard/engine/start
POST /api/dashboard/engine/stop
```

## Deployment Status

```text
Frontend
https://tradebot-giga.onrender.com

Node.js Backend
https://tradebot-node-backend.onrender.com

Python Strategy Engine
https://tradebot-python-engine.onrender.com
```

Validated runtime status:

- Node `/health`: healthy
- Node `/ready`: ready
- Python `/health`: healthy
- Bybit Demo account: configured
- Bybit V5 public market data: configured
- execution authority: disabled

## Safety Rules

- Bybit Demo only for all authenticated trading operations
- official Bybit public market-data source only
- no Testnet mode
- no real-trading mode
- no mock fallback in any trading path
- only validated closed candles are actionable
- stale, future-dated, incomplete, invalid, or unreachable market data blocks action
- Python unavailable or invalid response blocks execution
- Node.js performs final risk validation
- exchange response, fill status, and protection state must be confirmed before a trade becomes active
- API keys and secrets remain in backend environment variables only
- frontend must not store Bybit or Telegram secrets
- operational actions require backend confirmation
- all material decisions and failures must be auditable

## Locked Risk Defaults

- Risk per trade: `0.5%`
- Minimum risk-reward ratio: `1:2`
- Daily loss limit: `2%`
- Maximum active trades: `5`

## Page-by-Page Backend Roadmap

### Phase 2.1 — Dashboard Frontend Integration

- fetch real Dashboard summary data
- fetch real system-health data
- render Demo balance, P&L, trades, win rate, and engine status
- connect Start Engine and Stop Engine controls to the Node API
- add loading, retry, timeout, and safe disconnected states
- handle Render free-tier cold starts
- keep execution disabled
- use no mock data

### Phase 3 — Market Scanner

```text
Market Data
→ Symbol Filter
→ 1H Trend
→ 15M Setup
→ 5M Confirmation
→ Final Result
```

Every symbol must retain stage-level pass, rejection, status, and reason data.

### Phase 4 — Signals

- approved signals
- direction
- strategy
- grade
- entry
- stop-loss
- take-profit
- risk-reward
- expiry
- status
- Execute Demo action

### Phase 5 — Active Trades

- open positions
- current price
- unrealized P&L
- stop-loss and take-profit
- duration
- refresh
- idempotent manual close
- exchange-state reconciliation

### Phase 6 — Performance Analysis

- Net P&L
- Total Trades
- Win Rate
- Profit Factor
- Average R
- Max Drawdown
- Daily and Weekly P&L
- Win and Loss analysis
- Long and Short performance
- Exit-reason analysis
- Symbol performance

No equity curve is required in the approved frontend scope.

### Phase 7 — Settings

Backend-controlled settings and diagnostics for:

- Trading Setup
- Bybit API
- Notifications
- Diagnostics
- Decision Log

## Repository Structure

```text
TradeBot/
├── src/                       # Current React frontend
├── backend-node/              # Node.js API and authority service
├── engine-python/             # Python strategy service
├── shared/                    # Shared contracts and schemas
├── docs/                      # Architecture and operations documentation
├── infrastructure/            # Planned deployment configuration
├── package.json
└── README.md
```

The frontend remains at the repository root so the current Render deployment is not broken.

## Frontend Environment Variable

```env
VITE_API_BASE_URL=https://tradebot-node-backend.onrender.com
```

`VITE_API_BASE_URL` is public frontend configuration, not a secret. Do not place Bybit keys, Telegram credentials, database URLs, or internal service secrets in any `VITE_` variable.

## Next Development Step — Awaiting Approval

**Phase 2.1 — Dashboard Frontend Integration**

The next development unit is to replace the static disconnected Dashboard with real data from the completed Dashboard backend endpoints. No Phase 2.1 code should start until the project owner explicitly approves it.
