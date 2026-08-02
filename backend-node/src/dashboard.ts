import { randomUUID } from 'node:crypto';
import type { BybitDemoClient } from './bybitDemo.js';

export type EngineStatus = 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'BLOCKED';

interface ActivityRecord {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export class DashboardService {
  private engineStatus: EngineStatus = 'STOPPED';
  private readonly activity: ActivityRecord[] = [];

  public constructor(private readonly demoClient: BybitDemoClient | null) {}

  private addActivity(type: string, message: string) {
    this.activity.unshift({
      id: randomUUID(),
      type,
      message,
      createdAt: new Date().toISOString(),
    });
    if (this.activity.length > 50) this.activity.length = 50;
  }

  private getUtcDayRange(now = new Date()) {
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return { startTimeMs: start, endTimeMs: now.getTime() };
  }

  public async getSummary() {
    if (!this.demoClient) {
      return {
        connected: false,
        tradingMode: 'bybit_demo',
        engineStatus: 'BLOCKED' as const,
        executionEnabled: false,
        account: null,
        today: null,
        openTrades: [],
        activeStrategy: null,
        recentActivity: this.activity,
        reason: 'BYBIT_DEMO_CREDENTIALS_NOT_CONFIGURED',
      };
    }

    const { startTimeMs, endTimeMs } = this.getUtcDayRange();
    const [wallet, openTrades, closedTrades] = await Promise.all([
      this.demoClient.getWallet(),
      this.demoClient.getOpenPositions(),
      this.demoClient.getClosedPnl(startTimeMs, endTimeMs),
    ]);

    const realisedPnl = closedTrades.reduce((sum, trade) => sum + trade.closedPnl, 0);
    const wins = closedTrades.filter((trade) => trade.closedPnl > 0).length;
    const losses = closedTrades.filter((trade) => trade.closedPnl < 0).length;
    const decidedTrades = wins + losses;

    return {
      connected: true,
      tradingMode: 'bybit_demo',
      engineStatus: this.engineStatus,
      executionEnabled: false,
      account: wallet,
      today: {
        realisedPnl,
        unrealisedPnl: wallet.unrealisedPnl,
        totalPnl: realisedPnl + wallet.unrealisedPnl,
        trades: closedTrades.length,
        wins,
        losses,
        winRate: decidedTrades > 0 ? (wins / decidedTrades) * 100 : 0,
        startTimeMs,
        endTimeMs,
      },
      openTrades,
      activeStrategy: this.engineStatus === 'RUNNING' ? 'Intraday 1H/15M/5M' : null,
      recentActivity: this.activity,
      reason: null,
    };
  }

  public startEngine() {
    if (!this.demoClient) {
      this.engineStatus = 'BLOCKED';
      this.addActivity('ENGINE_BLOCKED', 'Engine start blocked: Bybit Demo credentials are not configured.');
      return { accepted: false, engineStatus: this.engineStatus, reason: 'BYBIT_DEMO_NOT_CONFIGURED' };
    }
    if (this.engineStatus === 'RUNNING') {
      return { accepted: true, engineStatus: this.engineStatus, reason: 'ALREADY_RUNNING' };
    }
    this.engineStatus = 'RUNNING';
    this.addActivity('ENGINE_STARTED', 'Dashboard engine state changed to running. Execution remains disabled.');
    return { accepted: true, engineStatus: this.engineStatus, executionEnabled: false };
  }

  public stopEngine() {
    if (this.engineStatus === 'STOPPED') {
      return { accepted: true, engineStatus: this.engineStatus, reason: 'ALREADY_STOPPED' };
    }
    this.engineStatus = 'STOPPED';
    this.addActivity('ENGINE_STOPPED', 'Dashboard engine state changed to stopped.');
    return { accepted: true, engineStatus: this.engineStatus, executionEnabled: false };
  }
}
