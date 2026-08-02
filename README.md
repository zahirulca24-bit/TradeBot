# Bybit Intraday Demo Trading Bot - Frontend

A professional, high-performance, dark-themed trading dashboard and frontend management portal for the **Bybit Intraday Demo Trading Bot**.

Built with React 18, Vite, TypeScript, and Tailwind CSS.

## Features & Navigation

The application provides a responsive 6-route navigation layout:

1. **Dashboard**: Live engine start/stop controls, status badges, summary metric cards, active strategy overview, latest signals preview, active trades preview, system health indicators, and recent activity logs.
2. **Market Scanner**: Real-time token pipeline, customizable volume and price filters, table view, and detailed token metrics. Safe empty states when offline.
3. **Signals**: Real-time signal cards, strategy and leverage filters, entry/SL/TP parameters, and demo paper execution triggers. Safe disabled state when offline.
4. **Active Trades**: Open position tracking table, leverage monitors, P&L calculations, manual close confirmation modals, and safe empty state handling.
5. **Performance Analysis**: Executive summary metrics (Net P&L, Total Trades, Win Rate, Profit Factor, Average R, Drawdown), daily/weekly P&L charts, win/loss distribution, long vs short performance, exit reason breakdowns, per-symbol performance table, and statistics summary. *No Equity Curve by design.*
6. **Settings (5 Tabs)**:
   - **Trading Setup**: Risk management, position limits, default leverage, and strategy defaults.
   - **Bybit API**: `VITE_API_BASE_URL` endpoint management, Bybit Demo credential security information (keys stored server-side only).
   - **Notifications**: Telegram bot parameters, alert event triggers, test notification tools.
   - **Diagnostics**: System health status checks for API, WebSocket, Scanner, and Executor loops.
   - **Decision Log**: Searchable decision audit trail with level and component filters.

## Safety & Security Guarantees

- **Bybit Demo Only**: Strictly locked to Bybit Demo simulation environment.
- **No Testnet / Real Trading**: Completely stripped of Testnet options or real live trading execution triggers.
- **No Mock or Fake Data**: Offline states display accurate `Not Connected`, `No Data`, or `0` states rather than fabricated numbers or mock trade rows.
- **Client Security**: API secrets are never stored in client-side code, localStorage, or Git repositories.

## Environment Variables

Copy `.env.example` to `.env` or set in your hosting platform:

```env
# Base URL for the Bybit Intraday Bot Backend API
VITE_API_BASE_URL="https://your-bot-backend.com/api"
```

## Local Development & Build

### Installation
```bash
npm install
```

### Run Development Server
```bash
npm run dev
```

### Run Type Checks & Lint
```bash
npm run lint
```

### Build for Production
```bash
npm run build
```

## Deployment Guide (Render / Static Site)

This repository is optimized for deployment as a static Single Page Application (SPA) on Render, Vercel, Netlify, or Cloud Run.

### Render Static Site Settings

- **Build Command**: `npm run build`
- **Publish Directory**: `dist`
- **Redirects / Rewrites**: Add SPA rewrite rule:
  - **Source**: `/*`
  - **Destination**: `/index.html`
  - **Action**: `Rewrite`
- **Environment Variables**: Add `VITE_API_BASE_URL` pointing to your backend server.

---

*Notice: Designed exclusively for paper & demo trading simulation on Bybit Demo.*
