import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { BybitDemoClient } from './bybitDemo.js';
import { DashboardService } from './dashboard.js';
import { FiveMinutePipelineService } from './fiveMinutePipeline.js';
import { BybitMarketDataClient } from './marketData.js';
import { checkPythonEngineReady } from './pythonEngine.js';
import { ScannerService } from './scanner.js';
import { SignalService } from './signalService.js';
import { SignalStore } from './signalStore.js';
import { UniverseSelector } from './universe.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  TRADING_MODE: z.literal('bybit_demo'),
  PYTHON_ENGINE_URL: z.string().url(),
  INTERNAL_SERVICE_TOKEN: z.string().min(24),
  FRONTEND_ORIGIN: z.string().url(),
  PYTHON_READY_TIMEOUT_MS: z.coerce.number().int().min(3000).max(15000).default(8000),
  PYTHON_READY_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(4),
  BYBIT_MARKET_BASE_URL: z.literal('https://api.bybit.com').default('https://api.bybit.com'),
  MARKET_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(10000).default(5000),
  MARKET_MAX_CLOCK_SKEW_MS: z.coerce.number().int().min(250).max(10000).default(3000),
  MARKET_MAX_CANDLE_LAG_MS: z.coerce.number().int().min(0).max(300000).default(90000),
  BYBIT_DEMO_BASE_URL: z.literal('https://api-demo.bybit.com').default('https://api-demo.bybit.com'),
  BYBIT_DEMO_API_KEY: z.string().min(8).optional().or(z.literal('')),
  BYBIT_DEMO_API_SECRET: z.string().min(8).optional().or(z.literal('')),
  BYBIT_DEMO_RECV_WINDOW: z.coerce.number().int().min(1000).max(10000).default(5000),
  BYBIT_DEMO_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(10000).default(5000),
  SIGNAL_STORE_PATH: z.string().min(1).default('./data/signals.json'),
});

const parsedEnv = envSchema.safeParse(process.env);
const app = express();
const marketData = parsedEnv.success
  ? new BybitMarketDataClient({
      baseUrl: parsedEnv.data.BYBIT_MARKET_BASE_URL,
      requestTimeoutMs: parsedEnv.data.MARKET_REQUEST_TIMEOUT_MS,
      maxClockSkewMs: parsedEnv.data.MARKET_MAX_CLOCK_SKEW_MS,
      maxClosedCandleLagMs: parsedEnv.data.MARKET_MAX_CANDLE_LAG_MS,
    })
  : null;
const demoClient =
  parsedEnv.success && parsedEnv.data.BYBIT_DEMO_API_KEY && parsedEnv.data.BYBIT_DEMO_API_SECRET
    ? new BybitDemoClient({
        baseUrl: parsedEnv.data.BYBIT_DEMO_BASE_URL,
        apiKey: parsedEnv.data.BYBIT_DEMO_API_KEY,
        apiSecret: parsedEnv.data.BYBIT_DEMO_API_SECRET,
        recvWindow: parsedEnv.data.BYBIT_DEMO_RECV_WINDOW,
        requestTimeoutMs: parsedEnv.data.BYBIT_DEMO_REQUEST_TIMEOUT_MS,
      })
    : null;
const dashboard = new DashboardService(demoClient);
const universeSelector =
  parsedEnv.success && marketData
    ? new UniverseSelector(marketData, {
        baseUrl: parsedEnv.data.BYBIT_MARKET_BASE_URL,
        requestTimeoutMs: parsedEnv.data.MARKET_REQUEST_TIMEOUT_MS,
        maxSpreadBps: 50,
      })
    : null;
const scanner =
  parsedEnv.success && marketData && universeSelector
    ? new ScannerService(
        marketData,
        parsedEnv.data.PYTHON_ENGINE_URL,
        parsedEnv.data.INTERNAL_SERVICE_TOKEN,
        universeSelector,
      )
    : null;
const fiveMinutePipeline =
  parsedEnv.success && marketData && scanner
    ? new FiveMinutePipelineService(
        marketData,
        parsedEnv.data.PYTHON_ENGINE_URL,
        parsedEnv.data.INTERNAL_SERVICE_TOKEN,
        scanner,
      )
    : null;
const signalStore = parsedEnv.success ? new SignalStore(parsedEnv.data.SIGNAL_STORE_PATH) : null;
const signalService =
  fiveMinutePipeline && signalStore ? new SignalService(fiveMinutePipeline, signalStore) : null;

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(
  cors({
    origin: parsedEnv.success ? parsedEnv.data.FRONTEND_ORIGIN : false,
    methods: ['GET', 'POST'],
  }),
);

function marketFailure(response: express.Response, error: unknown) {
  const code = error instanceof Error ? error.message : 'MARKET_DATA_FAILURE';
  return response.status(503).json({
    error: { code, message: 'Market data is not safe for actionable use.', actionable: false },
  });
}

function scannerFailure(response: express.Response, error: unknown) {
  const code = error instanceof Error ? error.message : 'SCANNER_FAILURE';
  return response.status(503).json({
    error: { code, message: 'Scanner analysis is unavailable.', actionable: false },
  });
}

function signalFailure(response: express.Response, error: unknown) {
  const code = error instanceof Error ? error.message : 'SIGNAL_STORE_FAILURE';
  return response.status(503).json({
    error: {
      code,
      message: 'Signal persistence is unavailable. No signal was fabricated or executed.',
      actionable: false,
    },
  });
}

function dashboardFailure(response: express.Response, error: unknown) {
  const code = error instanceof Error ? error.message : 'DASHBOARD_FAILURE';
  return response.status(503).json({
    error: { code, message: 'Dashboard data is unavailable from Bybit Demo.', actionable: false },
  });
}

async function getPythonReadiness() {
  if (!parsedEnv.success) {
    return { ready: false, reason: 'INVALID_ENVIRONMENT', attempts: 0, upstreamStatus: null };
  }
  return checkPythonEngineReady({
    baseUrl: parsedEnv.data.PYTHON_ENGINE_URL,
    internalServiceToken: parsedEnv.data.INTERNAL_SERVICE_TOKEN,
    timeoutMs: parsedEnv.data.PYTHON_READY_TIMEOUT_MS,
    attempts: parsedEnv.data.PYTHON_READY_ATTEMPTS,
  });
}

app.get('/health', (_request, response) => {
  response.status(200).json({
    service: 'tradebot-backend-node',
    status: parsedEnv.success ? 'healthy' : 'degraded',
    tradingMode: parsedEnv.success ? parsedEnv.data.TRADING_MODE : 'unconfigured',
    executionEnabled: false,
    marketDataConfigured: marketData !== null,
    bybitDemoConfigured: demoClient !== null,
    signalStoreConfigured: signalStore !== null,
  });
});

app.get('/ready', async (_request, response) => {
  if (!parsedEnv.success || !marketData) {
    return response.status(503).json({
      service: 'tradebot-backend-node',
      ready: false,
      reason: 'INVALID_ENVIRONMENT',
      issues: parsedEnv.success ? [] : parsedEnv.error.issues.map((issue) => issue.path.join('.')),
    });
  }

  try {
    const [python, clock] = await Promise.all([getPythonReadiness(), marketData.assertClockSafe()]);
    if (!python.ready) {
      return response.status(503).json({
        service: 'tradebot-backend-node',
        ready: false,
        reason: 'PYTHON_ENGINE_UNAVAILABLE',
        pythonEngineReason: python.reason,
        attempts: python.attempts,
      });
    }

    return response.status(200).json({
      service: 'tradebot-backend-node',
      ready: true,
      tradingMode: 'bybit_demo',
      executionEnabled: false,
      marketData: { source: 'bybit-v5-public', clockSkewMs: clock.skewMs },
      dashboard: { demoAccountConfigured: demoClient !== null },
      signalStore: { configured: signalStore !== null },
    });
  } catch (error) {
    return response.status(503).json({
      service: 'tradebot-backend-node',
      ready: false,
      reason: error instanceof Error ? error.message : 'DEPENDENCY_UNREACHABLE',
    });
  }
});

app.get('/api/dashboard/summary', async (_request, response) => {
  try {
    return response.status(200).json(await dashboard.getSummary());
  } catch (error) {
    return dashboardFailure(response, error);
  }
});

app.get('/api/dashboard/system-health', async (_request, response) => {
  if (!parsedEnv.success || !marketData) {
    return response.status(503).json({
      ready: false,
      reason: 'INVALID_ENVIRONMENT',
      tradingMode: 'unconfigured',
      executionEnabled: false,
      dependencies: { marketData: false, pythonEngine: false, bybitDemo: false, signalStore: false },
    });
  }

  try {
    const [clock, python] = await Promise.all([marketData.assertClockSafe(), getPythonReadiness()]);
    const ready = python.ready;
    return response.status(ready ? 200 : 503).json({
      ready,
      reason: ready ? null : 'PYTHON_ENGINE_UNAVAILABLE',
      pythonEngineReason: python.reason,
      pythonEngineAttempts: python.attempts,
      tradingMode: 'bybit_demo',
      executionEnabled: false,
      dependencies: {
        marketData: true,
        pythonEngine: ready,
        bybitDemo: demoClient !== null,
        signalStore: signalStore !== null,
      },
      clockSkewMs: clock.skewMs,
    });
  } catch (error) {
    return response.status(503).json({
      ready: false,
      reason: error instanceof Error ? error.message : 'MARKET_DATA_UNAVAILABLE',
      tradingMode: 'bybit_demo',
      executionEnabled: false,
      dependencies: {
        marketData: false,
        pythonEngine: false,
        bybitDemo: demoClient !== null,
        signalStore: signalStore !== null,
      },
    });
  }
});

app.post('/api/dashboard/engine/start', async (_request, response) => {
  if (!parsedEnv.success || !marketData) {
    return response.status(503).json({ accepted: false, engineStatus: 'BLOCKED', reason: 'INVALID_ENVIRONMENT' });
  }

  try {
    const [clock, python] = await Promise.all([marketData.assertClockSafe(), getPythonReadiness()]);
    if (!python.ready || clock.skewMs > parsedEnv.data.MARKET_MAX_CLOCK_SKEW_MS) {
      return response.status(503).json({
        accepted: false,
        engineStatus: 'BLOCKED',
        reason: python.ready ? 'MARKET_CLOCK_UNSAFE' : 'PYTHON_ENGINE_UNAVAILABLE',
        pythonEngineReason: python.reason,
      });
    }
    const result = dashboard.startEngine();
    return response.status(result.accepted ? 200 : 503).json(result);
  } catch (error) {
    return dashboardFailure(response, error);
  }
});

app.post('/api/dashboard/engine/stop', (_request, response) => {
  return response.status(200).json(dashboard.stopEngine());
});

app.get('/api/market/symbols', async (_request, response) => {
  if (!marketData) return marketFailure(response, new Error('INVALID_ENVIRONMENT'));
  try {
    const symbols = await marketData.listTradingUsdtPerpetuals();
    return response.status(200).json({
      source: 'bybit-v5-public',
      category: 'linear',
      quoteCoin: 'USDT',
      count: symbols.length,
      symbols,
      actionable: symbols.length > 0,
    });
  } catch (error) {
    return marketFailure(response, error);
  }
});

app.get('/api/market/tickers', async (request, response) => {
  if (!marketData) return marketFailure(response, new Error('INVALID_ENVIRONMENT'));
  const symbol = typeof request.query.symbol === 'string' ? request.query.symbol : undefined;
  try {
    const tickers = await marketData.getTickers(symbol);
    return response.status(200).json({
      source: 'bybit-v5-public',
      category: 'linear',
      count: tickers.length,
      tickers,
      actionable: tickers.length > 0,
    });
  } catch (error) {
    return marketFailure(response, error);
  }
});

app.get('/api/market/candles/:symbol/:interval', async (request, response) => {
  if (!marketData) return marketFailure(response, new Error('INVALID_ENVIRONMENT'));
  const params = z.object({
    symbol: z.string().regex(/^[A-Z0-9]{3,30}$/),
    interval: z.enum(['5', '15', '60']),
  }).safeParse({
    symbol: request.params.symbol?.toUpperCase(),
    interval: request.params.interval,
  });
  const limit = z.coerce.number().int().min(1).max(500).default(200).safeParse(request.query.limit ?? 200);

  if (!params.success || !limit.success) {
    return response.status(400).json({
      error: { code: 'INVALID_MARKET_DATA_REQUEST', message: 'Invalid symbol, interval, or limit.' },
    });
  }

  try {
    const candles = await marketData.getClosedCandles(params.data.symbol, params.data.interval, limit.data);
    return response.status(200).json({
      source: 'bybit-v5-public',
      category: 'linear',
      symbol: params.data.symbol,
      interval: params.data.interval,
      closedOnly: true,
      count: candles.length,
      candles,
      actionable: true,
    });
  } catch (error) {
    return marketFailure(response, error);
  }
});

app.get('/api/market/freshness/:symbol', async (request, response) => {
  if (!marketData) return marketFailure(response, new Error('INVALID_ENVIRONMENT'));
  const symbol = request.params.symbol?.toUpperCase();
  if (!symbol || !/^[A-Z0-9]{3,30}$/.test(symbol)) {
    return response.status(400).json({ error: { code: 'INVALID_SYMBOL', message: 'Invalid market symbol.' } });
  }
  try {
    return response.status(200).json(await marketData.getFreshnessSnapshot(symbol));
  } catch (error) {
    return marketFailure(response, error);
  }
});

app.get('/api/signals', async (request, response) => {
  if (!signalService) return signalFailure(response, new Error('INVALID_ENVIRONMENT'));
  const limit = z.coerce.number().int().min(1).max(500).default(100).safeParse(request.query.limit ?? 100);
  if (!limit.success) {
    return response.status(400).json({
      error: { code: 'INVALID_SIGNAL_LIST_LIMIT', message: 'Signal limit must be between 1 and 500.' },
    });
  }

  try {
    return response.status(200).json(await signalService.list(limit.data));
  } catch (error) {
    return signalFailure(response, error);
  }
});

app.post('/api/signals/scan', async (_request, response) => {
  if (!signalService) return signalFailure(response, new Error('INVALID_ENVIRONMENT'));
  try {
    return response.status(200).json(await signalService.scanAndPersist());
  } catch (error) {
    return signalFailure(response, error);
  }
});

app.get('/api/scanner/batch/five-minute', async (_request, response) => {
  if (!fiveMinutePipeline) return scannerFailure(response, new Error('INVALID_ENVIRONMENT'));
  try {
    return response.status(200).json(await fiveMinutePipeline.scanTopUniverseFiveMinute());
  } catch (error) {
    return scannerFailure(response, error);
  }
});

app.get('/api/scanner/batch/fifteen-minute', async (_request, response) => {
  if (!scanner) return scannerFailure(response, new Error('INVALID_ENVIRONMENT'));
  try {
    return response.status(200).json(await scanner.scanTopUniverseFifteenMinute());
  } catch (error) {
    return scannerFailure(response, error);
  }
});

app.get('/api/scanner/batch/one-hour', async (_request, response) => {
  if (!scanner) return scannerFailure(response, new Error('INVALID_ENVIRONMENT'));
  try {
    return response.status(200).json(await scanner.scanTopUniverseOneHour());
  } catch (error) {
    return scannerFailure(response, error);
  }
});

app.get('/api/scanner/trend/:symbol', async (request, response) => {
  if (!scanner) return scannerFailure(response, new Error('INVALID_ENVIRONMENT'));
  const symbol = request.params.symbol?.toUpperCase();
  if (!symbol || !/^[A-Z0-9]{3,30}$/.test(symbol)) {
    return response.status(400).json({
      error: { code: 'INVALID_SYMBOL', message: 'Invalid scanner symbol.', actionable: false },
    });
  }
  try {
    return response.status(200).json(await scanner.analyzeOneHourTrend(symbol));
  } catch (error) {
    return scannerFailure(response, error);
  }
});

app.use((_request, response) => {
  response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
});

const port = parsedEnv.success ? parsedEnv.data.PORT : 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`TradeBot Node gateway listening on port ${port}`);
});
