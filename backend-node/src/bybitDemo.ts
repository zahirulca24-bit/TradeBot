import { createHmac } from 'node:crypto';
import { z } from 'zod';

const envelopeSchema = z.object({
  retCode: z.number(),
  retMsg: z.string(),
  result: z.unknown(),
  time: z.number().optional(),
});

const walletSchema = z.object({
  list: z.array(
    z.object({
      accountType: z.string(),
      totalEquity: z.string(),
      totalWalletBalance: z.string(),
      totalAvailableBalance: z.string(),
      totalPerpUPL: z.string(),
    }),
  ),
});

const positionsSchema = z.object({
  list: z.array(
    z.object({
      symbol: z.string(),
      side: z.string(),
      size: z.string(),
      avgPrice: z.string(),
      markPrice: z.string(),
      unrealisedPnl: z.string(),
      leverage: z.string(),
      stopLoss: z.string().optional().default(''),
      takeProfit: z.string().optional().default(''),
      updatedTime: z.string(),
    }),
  ),
});

const closedPnlSchema = z.object({
  nextPageCursor: z.string().optional().default(''),
  list: z.array(
    z.object({
      symbol: z.string(),
      side: z.string(),
      qty: z.string(),
      avgEntryPrice: z.string(),
      avgExitPrice: z.string(),
      closedPnl: z.string(),
      createdTime: z.string(),
      updatedTime: z.string(),
      orderId: z.string(),
    }),
  ),
});

function finite(value: string, field: string): number {
  const parsed = Number(value || '0');
  if (!Number.isFinite(parsed)) throw new Error(`INVALID_${field.toUpperCase()}`);
  return parsed;
}

export interface BybitDemoConfig {
  baseUrl: 'https://api-demo.bybit.com';
  apiKey: string;
  apiSecret: string;
  recvWindow: number;
  requestTimeoutMs: number;
}

export class BybitDemoClient {
  public constructor(private readonly config: BybitDemoConfig) {}

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    const query = new URLSearchParams(params);
    query.sort();
    const queryString = query.toString();
    const timestamp = Date.now().toString();
    const signaturePayload = `${timestamp}${this.config.apiKey}${this.config.recvWindow}${queryString}`;
    const signature = createHmac('sha256', this.config.apiSecret).update(signaturePayload).digest('hex');
    const response = await fetch(`${this.config.baseUrl}${path}?${queryString}`, {
      headers: {
        'X-BAPI-API-KEY': this.config.apiKey,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': String(this.config.recvWindow),
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });
    if (!response.ok) throw new Error(`BYBIT_DEMO_HTTP_${response.status}`);
    const envelope = envelopeSchema.parse(await response.json());
    if (envelope.retCode !== 0) throw new Error(`BYBIT_DEMO_${envelope.retCode}_${envelope.retMsg}`);
    return envelope.result;
  }

  public async getWallet() {
    const result = walletSchema.parse(
      await this.get('/v5/account/wallet-balance', { accountType: 'UNIFIED', coin: 'USDT' }),
    );
    const account = result.list[0];
    if (!account) throw new Error('BYBIT_DEMO_WALLET_EMPTY');
    return {
      accountType: account.accountType,
      totalEquity: finite(account.totalEquity, 'total_equity'),
      walletBalance: finite(account.totalWalletBalance, 'wallet_balance'),
      availableBalance: finite(account.totalAvailableBalance, 'available_balance'),
      unrealisedPnl: finite(account.totalPerpUPL, 'unrealised_pnl'),
    };
  }

  public async getOpenPositions() {
    const result = positionsSchema.parse(
      await this.get('/v5/position/list', { category: 'linear', settleCoin: 'USDT', limit: '200' }),
    );
    return result.list
      .filter((item) => finite(item.size, 'position_size') > 0)
      .map((item) => ({
        symbol: item.symbol,
        side: item.side,
        size: finite(item.size, 'position_size'),
        avgPrice: finite(item.avgPrice, 'avg_price'),
        markPrice: finite(item.markPrice, 'mark_price'),
        unrealisedPnl: finite(item.unrealisedPnl, 'unrealised_pnl'),
        leverage: finite(item.leverage, 'leverage'),
        stopLoss: finite(item.stopLoss, 'stop_loss'),
        takeProfit: finite(item.takeProfit, 'take_profit'),
        updatedTimeMs: finite(item.updatedTime, 'updated_time'),
      }));
  }

  public async getClosedPnl(startTimeMs: number, endTimeMs: number) {
    const records: Array<{
      symbol: string;
      side: string;
      qty: number;
      avgEntryPrice: number;
      avgExitPrice: number;
      closedPnl: number;
      createdTimeMs: number;
      updatedTimeMs: number;
      orderId: string;
    }> = [];
    let cursor = '';
    do {
      const result = closedPnlSchema.parse(
        await this.get('/v5/position/closed-pnl', {
          category: 'linear',
          startTime: String(startTimeMs),
          endTime: String(endTimeMs),
          limit: '100',
          ...(cursor ? { cursor } : {}),
        }),
      );
      records.push(
        ...result.list.map((item) => ({
          symbol: item.symbol,
          side: item.side,
          qty: finite(item.qty, 'qty'),
          avgEntryPrice: finite(item.avgEntryPrice, 'avg_entry_price'),
          avgExitPrice: finite(item.avgExitPrice, 'avg_exit_price'),
          closedPnl: finite(item.closedPnl, 'closed_pnl'),
          createdTimeMs: finite(item.createdTime, 'created_time'),
          updatedTimeMs: finite(item.updatedTime, 'updated_time'),
          orderId: item.orderId,
        })),
      );
      cursor = result.nextPageCursor;
    } while (cursor && records.length < 1000);
    return records;
  }
}
