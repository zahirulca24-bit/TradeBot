# TradeBot — Bybit Intraday Demo Trading Platform

TradeBot is a Bybit Demo-only intraday trading platform. The React frontend is deployed and the backend will be implemented page by page using a hybrid Node.js and Python architecture.

## Current Status

- Frontend: deployed and operational in safe offline mode
- Backend: not implemented yet
- Exchange mode: Bybit Demo only
- Testnet: disabled
- Real trading: disabled
- Mock, seeded, sample, or fabricated trading data: prohibited

Until the backend is connected, the frontend must show only `Not Connected`, `No Data`, `0`, or equivalent empty states. Trading controls must fail closed.

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

The Node.js service will own:

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

The Python service will own:

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
Bybit Demo market data
        ↓
Node.js snapshot and validation
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

## Safety Rules

- Bybit Demo only
- no Testnet mode
- no real-trading mode
- no mock fallback in any trading path
- Python unavailable or invalid response means execution is blocked
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

### Phase 1 — Hybrid Foundation

- Node.js API service
- Python strategy service
- shared contracts
- health and readiness endpoints
- internal service authentication
- environment validation
- database foundation
- unified error format
- Bybit Demo-only safety lock

### Phase 2 — Dashboard Backend

- Demo Balance
- Today P&L
- Open Trades
- Today’s Trades
- Win Rate
- Engine Status
- Active Strategy Summary
- System Health
- Recent Activity
- Start Engine and Stop Engine

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

## Planned Repository Structure

The existing frontend currently remains at the repository root. Backend folders will be introduced safely without breaking the deployed frontend.

```text
TradeBot/
├── src/                       # Current React frontend
├── backend-node/              # Planned Node.js API and execution service
├── engine-python/             # Planned Python strategy service
├── shared/                    # Planned API contracts and schemas
├── docs/                      # Architecture and operations documentation
├── infrastructure/            # Planned deployment configuration
├── package.json
└── README.md
```

The frontend will not be moved into a new folder until deployment settings and migration steps are prepared and verified.

## Deployment Plan

```text
React Frontend
→ Render Static Site

Node.js Backend
→ Render Web Service

Python Strategy Engine
→ Render Private Service or protected internal Web Service

Database
→ PostgreSQL
```

## Frontend Environment Variable

```env
VITE_API_BASE_URL=https://your-node-backend.onrender.com
```

`VITE_API_BASE_URL` is public frontend configuration, not a secret. Do not place Bybit keys, Telegram credentials, database URLs, or internal service secrets in any `VITE_` variable.

When no backend exists, omit this variable. After the Node.js backend is deployed, add the backend URL and rebuild the frontend.

## Frontend Local Commands

```bash
npm install
npm run lint
npm run build
npm run dev
```

## Render Frontend Settings

- Service type: Static Site
- Branch: `main`
- Root Directory: leave blank
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- Environment Variable: `VITE_API_BASE_URL` after backend deployment

The frontend currently uses hash routing, so navigation does not require server-side SPA rewrites.

## Next Development Step

Begin Phase 1: Hybrid Backend Foundation. Backend functionality will be implemented and validated one page at a time before moving to the next page.
