import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  TRADING_MODE: z.literal('bybit_demo'),
  PYTHON_ENGINE_URL: z.string().url(),
  INTERNAL_SERVICE_TOKEN: z.string().min(24),
  FRONTEND_ORIGIN: z.string().url(),
});

const parsedEnv = envSchema.safeParse(process.env);
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(
  cors({
    origin: parsedEnv.success ? parsedEnv.data.FRONTEND_ORIGIN : false,
    methods: ['GET', 'POST'],
  }),
);

app.get('/health', (_request, response) => {
  response.status(200).json({
    service: 'tradebot-backend-node',
    status: parsedEnv.success ? 'healthy' : 'degraded',
    tradingMode: parsedEnv.success ? parsedEnv.data.TRADING_MODE : 'unconfigured',
    executionEnabled: false,
  });
});

app.get('/ready', async (_request, response) => {
  if (!parsedEnv.success) {
    return response.status(503).json({
      service: 'tradebot-backend-node',
      ready: false,
      reason: 'INVALID_ENVIRONMENT',
      issues: parsedEnv.error.issues.map((issue) => issue.path.join('.')),
    });
  }

  try {
    const engineResponse = await fetch(`${parsedEnv.data.PYTHON_ENGINE_URL}/ready`, {
      headers: { 'x-internal-service-token': parsedEnv.data.INTERNAL_SERVICE_TOKEN },
      signal: AbortSignal.timeout(3000),
    });
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
    });
  } catch {
    return response.status(503).json({
      service: 'tradebot-backend-node',
      ready: false,
      reason: 'PYTHON_ENGINE_UNREACHABLE',
    });
  }
});

app.use((_request, response) => {
  response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
});

const port = parsedEnv.success ? parsedEnv.data.PORT : 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`TradeBot Node gateway listening on port ${port}`);
});
