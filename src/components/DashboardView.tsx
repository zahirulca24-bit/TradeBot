/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Wallet,
  TrendingUp,
  Activity,
  ClipboardList,
  Percent,
  Power,
  ShieldCheck,
  Radio,
  FileText,
  RefreshCw,
  Cpu,
  Database,
  Link,
} from 'lucide-react';

interface DashboardViewProps {
  apiBaseUrl: string;
  onStartEngineClick: () => void;
}

export default function DashboardView({ apiBaseUrl, onStartEngineClick }: DashboardViewProps) {
  return (
    <div className="space-y-6">
      {/* Overview section */}
      <div>
        <h2 className="text-lg font-bold text-slate-100">Live Workspace Status</h2>
        <p className="text-xs text-slate-500 mt-1">
          Intraday paper execution status and real-time statistics.
        </p>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Card 1: Demo Balance */}
        <div className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Demo Balance</span>
            <div className="rounded-md bg-dark-bg p-1.5 text-slate-400">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl font-bold tracking-tight text-slate-100 font-mono">0.00</span>
            <span className="ml-1 text-xs text-slate-500 font-semibold font-mono">USDT</span>
          </div>
          <div className="mt-2 text-[10px] text-rose-400 font-medium">Not Connected</div>
        </div>

        {/* Card 2: Today's P&L */}
        <div className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Today's P&L</span>
            <div className="rounded-md bg-dark-bg p-1.5 text-slate-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl font-bold tracking-tight text-slate-100 font-mono">0.00</span>
            <span className="ml-1 text-xs text-slate-500 font-semibold font-mono">USDT</span>
          </div>
          <div className="mt-2 text-[10px] text-rose-400 font-medium">Not Connected</div>
        </div>

        {/* Card 3: Open Trades */}
        <div className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Open Trades</span>
            <div className="rounded-md bg-dark-bg p-1.5 text-slate-400">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl font-bold tracking-tight text-slate-100 font-mono">0</span>
            <span className="ml-1 text-xs text-slate-500 font-semibold font-mono">Positions</span>
          </div>
          <div className="mt-2 text-[10px] text-rose-400 font-medium">Not Connected</div>
        </div>

        {/* Card 4: Today's Trades */}
        <div className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Today's Trades</span>
            <div className="rounded-md bg-dark-bg p-1.5 text-slate-400">
              <ClipboardList className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl font-bold tracking-tight text-slate-100 font-mono">0</span>
            <span className="ml-1 text-xs text-slate-500 font-semibold font-mono">Completed</span>
          </div>
          <div className="mt-2 text-[10px] text-rose-400 font-medium">Not Connected</div>
        </div>

        {/* Card 5: Win Rate */}
        <div className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Win Rate</span>
            <div className="rounded-md bg-dark-bg p-1.5 text-slate-400">
              <Percent className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl font-bold tracking-tight text-slate-100 font-mono">0.0</span>
            <span className="ml-1 text-xs text-slate-500 font-semibold font-mono">%</span>
          </div>
          <div className="mt-2 text-[10px] text-rose-400 font-medium">Not Connected</div>
        </div>

        {/* Card 6: Engine Status */}
        <div className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Engine Status</span>
            <div className="rounded-md bg-dark-bg p-1.5 text-slate-400">
              <Power className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-base font-bold tracking-tight text-rose-500 uppercase">OFFLINE</span>
          </div>
          <div className="mt-2.5 text-[10px] text-rose-400 font-medium flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 inline-block"></span>
            <span>Disconnected</span>
          </div>
        </div>
      </div>

      {/* Main dashboard body - Bento layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Grid: Major updates (Active strategies, Trades, Signals) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Active Strategy Summary */}
          <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-trading-border/80 pb-4">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-brand-bybit" />
                <h3 className="font-semibold text-slate-100 text-sm">Active Strategy Summary</h3>
              </div>
              <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider font-mono">
                No active strategies
              </span>
            </div>
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="rounded-full bg-dark-bg p-3 text-slate-500 border border-trading-border">
                <Cpu className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-400">Not Connected</p>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                No intraday trading strategy has been initialized or deployed. Please configure your bot server API base URL in Settings to synchronize active strategies.
              </p>
              <button
                onClick={onStartEngineClick}
                className="mt-4 rounded-lg border border-trading-border bg-dark-bg px-3 py-1.5 text-xs font-semibold text-brand-bybit hover:bg-card-bg transition-colors cursor-pointer"
              >
                Connect Strategy Engine
              </button>
            </div>
          </div>

          {/* Active Trades Preview */}
          <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-trading-border/80 pb-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-brand-bybit" />
                <h3 className="font-semibold text-slate-100 text-sm">Active Trades Preview</h3>
              </div>
              <span className="rounded-full bg-dark-bg px-2 py-0.5 text-[10px] font-semibold text-slate-400 border border-trading-border">
                0 Active
              </span>
            </div>
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="rounded-full bg-dark-bg p-3 text-slate-500 border border-trading-border">
                <TrendingUp className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-400">No active positions</p>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                No positions are currently held. Open orders and running trade sessions will appear in this preview once connected.
              </p>
            </div>
          </div>

          {/* Latest Signals Preview */}
          <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-trading-border/80 pb-4">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-brand-bybit" />
                <h3 className="font-semibold text-slate-100 text-sm">Latest Signals Preview</h3>
              </div>
              <span className="text-xs text-slate-500">Listening inactive</span>
            </div>
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="rounded-full bg-dark-bg p-3 text-slate-500 border border-trading-border">
                <Radio className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-400">No signals detected</p>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                The scanner is offline. Once the API server is connected, incoming intraday trading signals from your strategy scanner will appear here in real time.
              </p>
            </div>
          </div>
        </div>

        {/* Right Grid: System Diagnostics & Logging */}
        <div className="space-y-6 lg:col-span-1">
          {/* System Health Status */}
          <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-trading-border/80 pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-bybit" />
                <h3 className="font-semibold text-slate-100 text-sm">System Health</h3>
              </div>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
                Diagnostics
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {/* Host Connection */}
              <div className="flex items-center justify-between rounded-lg bg-dark-bg/40 p-3 border border-trading-border">
                <div className="flex items-center gap-2">
                  <Link className="h-4 w-4 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-300">Host Connection</span>
                </div>
                <span className="inline-flex items-center rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/20 font-mono">
                  OFFLINE
                </span>
              </div>

              {/* Bybit API Connectivity */}
              <div className="flex items-center justify-between rounded-lg bg-dark-bg/40 p-3 border border-trading-border">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-300">Bybit API Ingress</span>
                </div>
                <span className="inline-flex items-center rounded bg-card-bg px-2 py-0.5 text-[10px] font-bold text-slate-500 font-mono border border-trading-border">
                  UNAVAILABLE
                </span>
              </div>

              {/* Memory Usage */}
              <div className="flex items-center justify-between rounded-lg bg-dark-bg/40 p-3 border border-trading-border">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-300">Engine Core Loop</span>
                </div>
                <span className="inline-flex items-center rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/20 font-mono">
                  STOPPED
                </span>
              </div>
            </div>

            <p className="mt-4 text-[11px] text-slate-500 text-center border-t border-trading-border/80 pt-3">
              Current VITE_API_BASE_URL: <code className="text-slate-400 font-mono">{apiBaseUrl || 'Not configured'}</code>
            </p>
          </div>

          {/* Recent Activity Logs */}
          <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-trading-border/80 pb-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand-bybit" />
                <h3 className="font-semibold text-slate-100 text-sm">Recent Activity</h3>
              </div>
              <button
                disabled
                className="text-slate-600 hover:text-slate-400 transition-colors cursor-not-allowed"
                title="Refresh logs (Disabled)"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="rounded-full bg-dark-bg p-3 text-slate-500 border border-trading-border">
                <FileText className="h-5 w-5" />
              </div>
              <p className="mt-3 text-xs font-medium text-slate-400">No activity logged</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Log reports are empty. Establish connection with the Intraday trading bot to track execution events.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
