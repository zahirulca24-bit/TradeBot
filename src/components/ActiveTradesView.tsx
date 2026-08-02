/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  TrendingUp,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Clock,
  ShieldAlert,
  AlertTriangle,
  Info,
  Database,
  ArrowRight,
  Shield,
  Activity,
} from 'lucide-react';

interface ActiveTradesViewProps {
  apiBaseUrl: string;
  onTriggerNoBackendWarning: (message: string) => void;
}

export default function ActiveTradesView({
  apiBaseUrl,
  onTriggerNoBackendWarning,
}: ActiveTradesViewProps) {
  // Filters State
  const [symbolSearch, setSymbolSearch] = React.useState('');
  const [sideFilter, setSideFilter] = React.useState('ALL');
  const [statusFilter, setStatusFilter] = React.useState('ALL');

  const handleResetFilters = () => {
    setSymbolSearch('');
    setSideFilter('ALL');
    setStatusFilter('ALL');
  };

  const handleRefreshPositions = () => {
    onTriggerNoBackendWarning('Unable to sync positions. Execution backend is not connected.');
  };

  // Summary Metrics (P&L shows 'No Data' as instructed)
  const summaryMetrics = [
    { name: 'Open Trades', value: '0', extra: 'Positions' },
    { name: 'Long Trades', value: '0', extra: 'Buy Side' },
    { name: 'Short Trades', value: '0', extra: 'Sell Side' },
    { name: 'Unrealized P&L', value: 'No Data', extra: 'USDT' },
    { name: 'Open Risk', value: '0.00', extra: 'USDT' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-trading-border pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-brand-bybit" />
            <span>Active Trades</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time live position monitor, order parameters, and safety triggers.
          </p>
        </div>

        {/* Live Status Diagnostics */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg bg-card-bg border border-trading-border px-3 py-1.5 text-xs text-slate-400 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 font-semibold uppercase">Bybit Demo:</span>
              <span className="text-rose-400 font-medium font-mono">Offline</span>
            </div>
            <div className="h-3 w-[1px] bg-trading-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 font-semibold uppercase">Sync Time:</span>
              <span className="text-slate-500 font-medium font-mono">Never</span>
            </div>
          </div>

          <button
            onClick={handleRefreshPositions}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-trading-border bg-card-bg px-3 text-xs font-semibold text-slate-400 hover:bg-dark-bg hover:text-slate-100 transition-colors cursor-pointer"
            title="Refresh Positions"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh Positions</span>
          </button>
        </div>
      </div>

      {/* Summary Cards Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {summaryMetrics.map((metric) => (
          <div key={metric.name} className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              {metric.name}
            </span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-slate-200">
                {metric.value}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">{metric.extra}</span>
            </div>
            <span className="text-[9px] text-slate-600 block mt-1">No data link</span>
          </div>
        ))}
      </div>

      {/* Filters Form Controls */}
      <div className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-trading-border/50 pb-2.5">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-4 w-4 text-brand-bybit" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Filter Active Positions</span>
          </div>
          <button
            onClick={handleResetFilters}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-semibold cursor-pointer"
          >
            Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Symbol Search */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">Symbol Search</label>
            <input
              type="text"
              value={symbolSearch}
              onChange={(e) => setSymbolSearch(e.target.value.toUpperCase())}
              placeholder="e.g. SOLUSDT"
              className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-brand-bybit focus:ring-1 focus:ring-brand-bybit focus:outline-none"
            />
          </div>

          {/* Side */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">Side (Direction)</label>
            <select
              value={sideFilter}
              onChange={(e) => setSideFilter(e.target.value)}
              className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-xs text-slate-300 focus:border-brand-bybit focus:outline-none"
            >
              <option value="ALL">All Sides</option>
              <option value="BUY">BUY / LONG</option>
              <option value="SELL">SELL / SHORT</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">Position Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-xs text-slate-300 focus:border-brand-bybit focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="RUNNING">Running</option>
              <option value="TRAILING">Trailing Take-Profit</option>
              <option value="RISK_ALIGNED">Risk Aligned</option>
            </select>
          </div>
        </div>
      </div>

      {/* Active Trades Table Section */}
      <div className="rounded-xl border border-trading-border bg-card-bg overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-trading-border flex items-center justify-between bg-card-bg/50">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500"></span>
            <h3 className="font-semibold text-slate-200 text-sm">Active Trades</h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">0 active positions</span>
        </div>

        {/* Responsive Table Wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-trading-border/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-dark-bg/20">
                <th className="px-5 py-3">Symbol</th>
                <th className="px-5 py-3">Side</th>
                <th className="px-5 py-3">Entry Price</th>
                <th className="px-5 py-3">Current Price</th>
                <th className="px-5 py-3">Stop-Loss</th>
                <th className="px-5 py-3">Take-Profit</th>
                <th className="px-5 py-3">Unrealized P&L</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Duration</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {/* Empty state strictly as requested: No sample rows */}
              <tr>
                <td colSpan={10} className="px-5 py-14 text-center text-slate-500 text-xs">
                  <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                    <Activity className="h-8 w-8 text-slate-600 mb-3" />
                    <span className="font-semibold text-slate-300 block">No active demo trades</span>
                    <span className="text-[11px] text-slate-500 mt-1">
                      No positions are currently tracked. Launching execution strategies via a running backend will display live Bybit demo positions in this portal.
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer Status Panel below Table */}
        <div className="px-5 py-3 bg-dark-bg/30 border-t border-trading-border flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-slate-600" />
            <span>Position sync status: <strong className="text-rose-400 font-normal">Offline</strong></span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Last refresh time: <span className="font-mono">Never</span></span>
            <span>Backend connection state: <span className="text-rose-400 font-mono font-medium">DISCONNECTED</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
