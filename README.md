# Bybit Intraday Demo Trading Bot — Frontend

Responsive React 19, Vite, TypeScript, and Tailwind CSS frontend for a Bybit Demo intraday trading bot.

## Approved Navigation

1. Dashboard
2. Market Scanner
3. Signals
4. Active Trades
5. Performance Analysis
6. Settings

Settings contains exactly five tabs: Trading Setup, Bybit API, Notifications, Diagnostics, and Decision Log.

## Safety Rules

- Bybit Demo only
- No Testnet option
- No real-trading option
- No mock, seeded, sample, or fabricated trading data
- Offline states show `Not Connected`, `No Data`, or `0`
- API keys and secrets must remain in backend environment variables
- The frontend does not store Bybit or Telegram secrets
- Engine, scan, execution, notification, and diagnostics actions require the backend

## Environment Variable

```env
VITE_API_BASE_URL=https://your-backend.example.com
```

Do not commit a real backend secret or credential. `VITE_API_BASE_URL` is a public frontend configuration value, not a secret.

## Local Commands

```bash
npm install
npm run lint
npm run build
npm run dev
```

## Render Static Site

- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Environment variable: `VITE_API_BASE_URL`

The app currently uses hash routing, so nested frontend navigation does not depend on server-side route rewrites.

## Current Limitation

This repository is frontend-only. Until the approved backend API is connected, all trading data remains empty and operational controls remain fail-safe.
