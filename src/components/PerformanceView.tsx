/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  BarChart2,
  RefreshCw,
  Download,
  Calendar,
  PieChart,
  TrendingUp,
  AlertCircle,
  FileSpreadsheet,
  Activity,
  Layers,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ShieldAlert,
} from 'lucide-react';

interface PerformanceViewProps {
  apiBaseUrl: string;
  onTriggerNoBackendWarning: (message: string) => void;
}

export default function PerformanceView({
  apiBaseUrl,
  onTriggerNoBackendWarning,
}: PerformanceViewProps) {
  // Date Range Filter State
  const [dateRange, setDateRange] = React.useState('30d');

  const handleRefresh = () => {
    onTriggerNoBackendWarning('Performance data backend is not connected.');
  };

  const handleExportCSV = () => {
    onTriggerNoBackendWarning('Export service unavailable. Backend is not connected.');
  };

  // Summary Metrics
  const summaryMetrics = [
    { name: 'Net P&L', value: 'No Data', extra: 'USDT', color: 'text-slate-400' },
    { name: 'Total Trades', value: '0', extra: 'Closed', color: 'text-slate-200' },
    { name: 'Win Rate', value: 'No Data', extra: '%', color: 'text-slate-400' },
    { name: 'Profit Factor', value: 'No Data', extra: 'Ratio', color: 'text-slate-400' },
    { name: 'Average R', value: 'No Data', extra: 'R-Multiple', color: 'text-slate-400' },
    { name: 'Maximum Drawdown', value: 'No Data', extra: 'Peak to Trough', color: 'text-slate-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-trading-border pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-brand-bybit" />
            <span>Performance Analysis</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Historical Bybit Demo trading statistics, profit factors, and breakdown diagnostics.
          </p>
        </div>

        {/* Date Range, Refresh, and Export Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Filter */}
          <div className="flex items-center gap-1.5 rounded-lg bg-card-bg border border-trading-border px-3 py-1.5 text-xs text-slate-300">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="7d" className="bg-card-bg text-slate-200">Last 7 Days</option>
              <option value="30d" className="bg-card-bg text-slate-200">Last 30 Days</option>
              <option value="90d" className="bg-card-bg text-slate-200">Last 90 Days</option>
              <option value="all" className="bg-card-bg text-slate-200">All Time</option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-trading-border bg-card-bg px-3 text-xs font-semibold text-slate-300 hover:bg-dark-bg hover:text-slate-100 transition-colors cursor-pointer"
            title="Refresh Performance"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
            <span>Refresh</span>
          </button>

          {/* Export CSV Button */}
          <button
            onClick={handleExportCSV}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-bybit/10 border border-brand-bybit/30 px-3 text-xs font-semibold text-brand-bybit hover:bg-brand-bybit/20 transition-colors cursor-pointer"
            title="Export CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {summaryMetrics.map((metric) => (
          <div key={metric.name} className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              {metric.name}
            </span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className={`text-lg font-bold font-mono ${metric.color}`}>
                {metric.value}
              </span>
            </div>
            <span className="text-[9px] text-slate-600 block mt-1">{metric.extra}</span>
          </div>
        ))}
      </div>

      {/* Analysis Sections (2-Column Grid on Desktop, Single Column on Mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily / Weekly P&L Bar Chart Section */}
        <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-trading-border/50 pb-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-brand-bybit" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Daily / Weekly P&L</h3>
            </div>
            <span className="text-[10px] font-mono text-slate-500">USDT Returns</span>
          </div>
          <div className="h-48 rounded-lg bg-dark-bg/60 border border-trading-border/50 flex flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="h-7 w-7 text-slate-600 mb-2" />
            <span className="text-xs font-semibold text-slate-400">No completed trade data available</span>
            <span className="text-[10px] text-slate-500 mt-1 max-w-xs">
              P&L bar chart distribution will populate once trades are closed via the Bybit execution engine.
            </span>
          </div>
        </div>

        {/* Win vs Loss Donut Chart Section */}
        <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-trading-border/50 pb-3">
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-brand-bybit" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Win vs Loss Distribution</h3>
            </div>
            <span className="text-[10px] font-mono text-slate-500">Outcome Ratio</span>
          </div>
          <div className="h-48 rounded-lg bg-dark-bg/60 border border-trading-border/50 flex flex-col items-center justify-center p-6 text-center">
            <PieChart className="h-7 w-7 text-slate-600 mb-2" />
            <span className="text-xs font-semibold text-slate-400">No completed trade data available</span>
            <span className="text-[10px] text-slate-500 mt-1 max-w-xs">
              Win/loss visual ratio requires resolved position logs from backend connection.
            </span>
          </div>
        </div>

        {/* Long vs Short Performance Section */}
        <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-trading-border/50 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brand-bybit" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Long vs Short Performance</h3>
            </div>
            <span className="text-[10px] font-mono text-slate-500">Directional Metrics</span>
          </div>
          <div className="h-48 rounded-lg bg-dark-bg/60 border border-trading-border/50 flex flex-col items-center justify-center p-6 text-center">
            <Layers className="h-7 w-7 text-slate-600 mb-2" />
            <span className="text-xs font-semibold text-slate-400">No completed trade data available</span>
            <span className="text-[10px] text-slate-500 mt-1 max-w-xs">
              Comparison between Long vs Short profit factor & win rate requires executed positions.
            </span>
          </div>
        </div>

        {/* Exit Reason Breakdown Section */}
        <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-trading-border/50 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-brand-bybit" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Exit Reason Breakdown</h3>
            </div>
            <span className="text-[10px] font-mono text-slate-500">TP / SL / Manual</span>
          </div>
          <div className="h-48 rounded-lg bg-dark-bg/60 border border-trading-border/50 flex flex-col items-center justify-center p-6 text-center">
            <Activity className="h-7 w-7 text-slate-600 mb-2" />
            <span className="text-xs font-semibold text-slate-400">No completed trade data available</span>
            <span className="text-[10px] text-slate-500 mt-1 max-w-xs">
              Analysis of take-profit hits, stop-loss triggers, and manual exits.
            </span>
          </div>
        </div>
      </div>

      {/* Performance Table */}
      <div className="rounded-xl border border-trading-border bg-card-bg overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-trading-border flex items-center justify-between bg-card-bg/50">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-brand-bybit" />
            <h3 className="font-semibold text-slate-200 text-sm">Performance by Symbol</h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">0 symbols tracked</span>
        </div>

        {/* Responsive Table Wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-trading-border/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-dark-bg/20">
                <th className="px-5 py-3">Symbol</th>
                <th className="px-5 py-3">Total Trades</th>
                <th className="px-5 py-3">Wins</th>
                <th className="px-5 py-3">Losses</th>
                <th className="px-5 py-3">Win Rate</th>
                <th className="px-5 py-3">Net P&L</th>
                <th className="px-5 py-3">Average R</th>
                <th className="px-5 py-3 text-right">Profit Factor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-slate-500 text-xs">
                  <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                    <AlertCircle className="h-8 w-8 text-slate-600 mb-3" />
                    <span className="font-semibold text-slate-300 block">No performance data available</span>
                    <span className="text-[11px] text-slate-500 mt-1">
                      Per-symbol performance metrics will be aggregated as trades are executed on Bybit Demo.
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Summary Section */}
      <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-trading-border/50 pb-2.5">
          Trading Statistics Summary
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 text-xs">
          <div className="rounded-lg bg-dark-bg/60 p-3 border border-trading-border/50">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Best Trade</span>
            <span className="font-mono text-slate-400 font-medium">No Data</span>
          </div>

          <div className="rounded-lg bg-dark-bg/60 p-3 border border-trading-border/50">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Worst Trade</span>
            <span className="font-mono text-slate-400 font-medium">No Data</span>
          </div>

          <div className="rounded-lg bg-dark-bg/60 p-3 border border-trading-border/50">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Avg Holding Time</span>
            <span className="font-mono text-slate-400 font-medium">No Data</span>
          </div>

          <div className="rounded-lg bg-dark-bg/60 p-3 border border-trading-border/50">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Consecutive Wins</span>
            <span className="font-mono text-slate-400 font-medium">0</span>
          </div>

          <div className="rounded-lg bg-dark-bg/60 p-3 border border-trading-border/50 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Consecutive Losses</span>
            <span className="font-mono text-slate-400 font-medium">0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
