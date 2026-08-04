# TradeBot Locked Development Roadmap

**Roadmap Date:** 04 August 2026  
**Day:** Tuesday  
**Environment:** Bybit Demo only  
**Current execution status:** Disabled

This roadmap is the approved delivery order for TradeBot. Work must proceed phase by phase. A phase is complete only after implementation, automated tests, deployment, and runtime verification. No later phase may silently weaken the existing closed-candle, fail-closed, Supabase persistence, duplicate-protection, or execution-off safety controls.

## Current Production Baseline — Completed

- React frontend deployed on Render
- Node.js backend deployed on Render
- Python strategy engine deployed on Render
- Bybit V5 public market data connected
- Bybit Demo account connected
- Supabase PostgreSQL connected
- closed-candle-only pipeline operational
- Top 50 → 1H max 20 → 15M max 10 → 5M max 3 → final risk candidate
- 15M swing stop-loss and minimum 1:2 R:R validation
- persistent signal storage in `public.trade_signals`
- atomic cross-cycle duplicate protection
- 15-minute Automated Signal Scanner Worker
- 15-minute Pipeline Watchdog
- order execution disabled

## Phase 8 — Runtime Stability and Frontend Consistency

### 8.1 Overnight runtime verification

- confirm Signal Worker remains `HEALTHY`
- confirm Watchdog remains `HEALTHY`
- verify 15-minute cycles continue without stale runs
- verify no unexpected overlaps or duplicate scheduled cycles
- verify Supabase remains reachable
- verify first real final candidate insertion when market conditions qualify
- verify duplicate candidate updates `seen_count`

**Exit condition:** repeated live cycles are healthy and persistence evidence is verified.

### 8.2 Market Scanner UI cleanup

- remove stale “not enabled yet” messages
- synchronize all scanner panels from one latest pipeline snapshot
- prevent old local panel results from conflicting with the final scan result
- show honest loading, empty, rejected, failed, and healthy states
- retain stage-level reasons and counts

**Exit condition:** one scan produces one consistent result across the full page.

### 8.3 Signals page hardening

- verify Supabase-backed signal listing
- improve empty, loading, retry, timeout, and error states
- show entry, stop-loss, target, R:R, evidence, first seen, last seen, and `seen_count`
- show `NOT_EXECUTED` clearly
- do not expose database or exchange secrets

**Exit condition:** persisted signals are accurately visible and auditable in the UI.

## Phase 9 — Signal Review and Approval Layer

- add deterministic signal detail view
- show complete 1H, 15M, 5M, and final-risk evidence
- add signal expiry and stale-signal blocking
- add approval state model without placing orders
- add approve/reject audit records
- add idempotency protection for approval actions
- keep all approved signals non-actionable until the risk engine phase is completed

**Exit condition:** a user can review and approve or reject a signal, but no order can be placed.

## Phase 10 — Central Risk Engine

- configurable trading capital
- locked default risk per trade: `0.5%`
- minimum R:R: `1:2`
- daily loss limit: `2%`
- maximum active trades: `5`
- symbol exposure limits
- same-symbol trade limit
- cooldown enforcement
- position-size calculation from entry and stop distance
- minimum quantity, step-size, tick-size, and notional validation
- insufficient-balance rejection
- duplicate exposure rejection
- daily lock and kill-switch state
- complete risk-decision audit trail

**Exit condition:** every approved signal receives a deterministic PASS or REJECT risk decision. Execution remains disabled.

## Phase 11 — Bybit Demo Execution Engine

This phase requires separate explicit approval before implementation.

- Bybit Demo only
- no Testnet and no mainnet support
- idempotent order intent
- exchange timestamp and signature validation
- pre-order balance and position reconciliation
- market or approved order-type submission
- exchange order-ID persistence
- fill-status confirmation
- partial-fill handling
- timeout and unknown-state handling
- no fabricated execution success
- execution audit records

**Exit condition:** an approved, risk-passed signal can place a verified Bybit Demo order exactly once.

## Phase 12 — Protection and Trade Lifecycle

- stop-loss placement and confirmation
- take-profit placement and confirmation
- protection failure blocks active-trade promotion
- active position reconciliation with Bybit Demo
- partial take-profit handling if approved later
- break-even rules only after separate approval
- trailing-stop rules only after separate approval
- idempotent manual close
- exchange-confirmed close status
- orphan-order and orphan-position detection
- restart recovery

**Exit condition:** every opened Demo trade is protected, reconciled, and safely closable.

## Phase 13 — Active Trades UI

- live positions from backend authority
- entry, current price, quantity, SL, TP, unrealized P&L, duration
- protection status
- exchange reconciliation status
- safe refresh and retry
- idempotent manual close control
- honest unknown and degraded states

**Exit condition:** UI accurately reflects exchange-confirmed trade state.

## Phase 14 — Decision Log and Audit Trail

- scanner rejection records
- signal approval/rejection records
- risk-engine decisions
- execution intents and responses
- protection events
- manual actions
- worker and watchdog incidents
- searchable filters by time, symbol, stage, action, and reason
- no secret or signature logging

**Exit condition:** all material trading decisions and failures are traceable.

## Phase 15 — Performance Analytics

- net P&L
- total trades
- win rate
- profit factor
- average R
- maximum drawdown
- daily and weekly P&L
- long versus short performance
- symbol performance
- exit-reason analysis
- strategy-stage conversion rates
- no fabricated metrics when history is incomplete

**Exit condition:** analytics reconcile with persisted exchange-confirmed trade history.

## Phase 16 — Notifications

- backend-managed Telegram or approved channel
- signal-created notifications
- approval-required notifications
- execution and protection alerts
- worker/watchdog failure alerts
- daily loss-lock alerts
- no credentials in frontend
- notification idempotency and audit records

**Exit condition:** critical operational events are delivered once and recorded.

## Phase 17 — Backtesting and Strategy Validation

- same locked production rules
- closed-candle-only historical processing
- fees and slippage
- no lookahead or repaint behavior
- stage-by-stage signal-match evidence
- in-sample and out-of-sample reporting
- strategy versioning
- Keep / Modify / Reject verdict
- backtest results never directly enable live execution

**Exit condition:** the production strategy has reproducible historical evidence without changing runtime rules.

## Phase 18 — Security, Recovery, and Release Audit

- endpoint authentication and authorization audit
- rate limits and destructive-action guards
- secret-management audit
- Supabase RLS and database-access audit
- dependency and vulnerability checks
- cold-start and dependency-outage tests
- restart recovery
- duplicate-order and duplicate-signal tests
- backup and migration verification
- end-to-end Demo trading test
- final execution enablement remains a separate owner decision

**Exit condition:** release evidence is complete and no unresolved P0/P1 defect remains.

## Locked Work Rules

1. One phase at a time.
2. One strategy remains one independent scanner/module.
3. Central pipeline remains: Signal Validator → Conflict Resolver → Risk Engine → Execution Engine.
4. Closed candles only.
5. No fake, mock, padded, or fallback trading result.
6. Supabase remains the persistent database; Render persistent disk and Render PostgreSQL are not required.
7. Node.js remains final authority.
8. Python never places orders.
9. No merge recommendation before tests pass.
10. No execution implementation or enablement without explicit approval.
11. Bybit Demo only until a completely separate future decision.
12. Any failed dependency must fail closed.

## Immediate Next Session

1. Verify overnight Signal Worker and Watchdog health.
2. Inspect the latest pipeline cycles and Supabase counts.
3. Verify the first qualifying final candidate and duplicate update when available.
4. Start Phase 8.2 Market Scanner UI cleanup.
5. Complete Phase 8 before beginning signal approval or risk-engine work.
