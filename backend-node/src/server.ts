import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { BybitMarketDataClient } from './marketData.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  TRADING_MODE: z.literal('bybit_demo'),
  PYTHON_ENGINE_URL: z.string().url(),
  INTERNAL_SERVICE_TOKEN: z.string().min(24),
  FRONTEND_ORIGIN: z.string().url(),
  BYBIT_MARKET_BASE_URL: z.literal('https://api.bybit.com').default('https://api.bybit.com'),
  MARKET_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(10000).default(5000),
  MARKET_MAX_CLOCK_SKEW_MS: z.coerce.number().int().min(250).max(10000).default(3000),
  MARKET_MAX_CANDLE_LAG_MS: z.coerce.number().int().min(0).max(300000).default(90000),
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
    error: {
      code,
      message: 'Market data is not safe for actionable use.',
      actionable: false,
    },
  });
}

app.get('/health', (_request, response) => {
  response.status(200).json({
    service: 'tradebot-backend-node',
    status: parsedEnv.success ? 'healthy' : 'degraded',
    tradingMode: parsedEnv.success ? parsedEnv.data.TRADING_MODE : 'unconfigured',
    executionEnabled: false,
    marketDataConfigured: marketData !== null,
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
    const [engineResponse, clock] = await Promise.all([
      fetch(`${parsedEnv.data.PYTHON_ENGINE_URL}/ready`, {
        headers: { 'x-internal-service-token': parsedEnv.data.INTERNAL_SERVICE_TOKEN },
        signal: AbortSignal.timeout(3000),
      }),
      marketData.assertClockSafe(),
    ]);
    const engineBody = await engineResponse.json();

    if (!engineResponse.ok || engineBody?.ready !== true) {
      return response.status(503).json({
        service: 'tradebot-backend-node',
        ready: false,
        reason: 'PYTHON_ENGINE_NOT_READY',
      });
    }

    return response.status(200).json({
      service: 'tradebot-backend-node',
      ready: true,
      tradingMode: 'bybit_demo',
      executionEnabled: false,
      marketData: { source: 'bybit-v5-public', clockSkewMs: clock.skewMs },
    });
  } catch (error) {
    return response.status(503).json({
      service: 'tradebot-backend-node',
      ready: false,
      reason: error instanceof Error ? error.message : 'DEPENDENCY_UNREACHABLE',
    });
  }
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
  const params = z
    .object({
      symbol: z.string().regex(/^[A-Z0-9]{3,30}$/),
      interval: z.enum(['5', '15', '60']),
    })
    .safeParse({
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
    const candles = await marketData.getClosedCandles(
      params.data.symbol,
      params.data.interval,
      limit.data,
    );
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
    return response.status(400).json({
      error: { code: 'INVALID_SYMBOL', message: 'Invalid market symbol.' },
    });
  }
  try {
    return response.status(200).json(await marketData.getFreshnessSnapshot(symbol));
  } catch (error) {
    return marketFailure(response, error);
  }
});

app.use((_request, response) => {
  response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
});

const port = parsedEnv.success ? parsedEnv.data.PORT : 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`TradeBot Node gateway listening on port ${port}`);
});
