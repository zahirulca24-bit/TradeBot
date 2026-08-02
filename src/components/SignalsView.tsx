/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Zap,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Play,
  ArrowUpRight,
  Sliders,
} from 'lucide-react';

interface SignalsViewProps {
  apiBaseUrl: string;
  onTriggerNoBackendWarning: (message: string) => void;
}

export default function SignalsView({ apiBaseUrl, onTriggerNoBackendWarning }: SignalsViewProps) {
  // Filter States
  const [symbolSearch, setSymbolSearch] = React.useState('');
  const [directionFilter, setDirectionFilter] = React.useState('ALL');
  const [gradeFilter, setGradeFilter] = React.useState('ALL');
  const [statusFilter, setStatusFilter] = React.useState('ALL');

  const handleResetFilters = () => {
    setSymbolSearch('');
    setDirectionFilter('ALL');
    setGradeFilter('ALL');
    setStatusFilter('ALL');
  };

  const handleRefresh = () => {
    onTriggerNoBackendWarning('Signals list is empty. Backend is not connected.');
  };

  const handleExecuteDemo = () => {
    onTriggerNoBackendWarning('Execution backend is not connected');
  };

  // Summary Metrics (All 0 when backend is disconnected/unavailable)
  const summaryMetrics = [
    { name: 'Valid Signals', value: 0, color: 'text-amber-500' },
    { name: 'Long Signals', value: 0, color: 'text-emerald-500' },
    { name: 'Short Signals', value: 0, color: 'text-rose-500' },
    { name: 'Executed', value: 0, color: 'text-slate-400' },
    { name: 'Expired', value: 0, color: 'text-slate-500' },
    { name: 'Risk Blocked', value: 0, color: 'text-orange-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-trading-border pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Zap className="h-5 w-5 text-brand-bybit" />
            <span>Signals</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Validated real-time trading strategy entry alerts for Bybit Demo.
          </p>
        </div>

        {/* Live Status Diagnostics & Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg bg-card-bg border border-trading-border px-3 py-1.5 text-xs text-slate-400 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 font-semibold uppercase">Engine:</span>
              <span className="text-rose-400 font-medium font-mono">Offline</span>
            </div>
            <div className="h-3 w-[1px] bg-trading-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 font-semibold uppercase">Last Sync:</span>
              <span className="text-slate-500 font-medium font-mono">Never</span>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-trading-border bg-card-bg text-slate-400 hover:bg-dark-bg hover:text-slate-100 transition-colors cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Summary Cards Row (6 columns matching exactly) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {summaryMetrics.map((metric) => (
          <div key={metric.name} className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              {metric.name}
            </span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className={`text-xl font-bold font-mono ${metric.color}`}>
                {metric.value}
              </span>
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
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Signal Screening</span>
          </div>
          <button
            onClick={handleResetFilters}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-semibold cursor-pointer"
          >
            Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Symbol */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">Symbol Search</label>
            <input
              type="text"
              value={symbolSearch}
              onChange={(e) => setSymbolSearch(e.target.value.toUpperCase())}
              placeholder="e.g. BTCUSDT"
              className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-brand-bybit focus:ring-1 focus:ring-brand-bybit focus:outline-none"
            />
          </div>

          {/* Direction */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">Direction</label>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
              className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-xs text-slate-300 focus:border-brand-bybit focus:outline-none"
            >
              <option value="ALL">All Directions</option>
              <option value="LONG">Long</option>
              <option value="SHORT">Short</option>
            </select>
          </div>

          {/* Grade */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">Signal Grade</label>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-xs text-slate-300 focus:border-brand-bybit focus:outline-none"
            >
              <option value="ALL">All Grades (A / B / C)</option>
              <option value="A">Grade A Only</option>
              <option value="B">Grade B Only</option>
              <option value="C">Grade C Only</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">Signal Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-xs text-slate-300 focus:border-brand-bybit focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="VALID">Valid / Live</option>
              <option value="EXECUTED">Executed</option>
              <option value="EXPIRED">Expired</option>
              <option value="BLOCKED">Risk Blocked</option>
            </select>
          </div>
        </div>
      </div>

      {/* Signals Grid / List - Empty State */}
      <div className="rounded-xl border border-trading-border bg-card-bg p-12 text-center shadow-sm">
        <div className="mx-auto rounded-full bg-dark-bg p-4 text-slate-500 border border-trading-border w-16 h-16 flex items-center justify-center mb-4">
          <Zap className="h-8 w-8 text-slate-600" />
        </div>
        <h3 className="text-base font-semibold text-slate-200">No validated signals available</h3>
        <p className="mt-2 text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
          Intraday trading recommendations triggered by scanner strategies appear in this card hub.
          Currently, there is no signal feed active because the bot server is offline.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={handleExecuteDemo}
            className="rounded-lg border border-trading-border bg-dark-bg/60 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-300 cursor-pointer transition-colors"
          >
            Check Signals API status
          </button>
          <button
            disabled
            onClick={handleExecuteDemo}
            className="rounded-lg bg-amber-500/10 border border-amber-500/20 text-brand-bybit px-4 py-2 text-xs font-semibold cursor-not-allowed opacity-50"
            title="Execution backend is not connected"
          >
            Execute Demo
          </button>
        </div>
      </div>
    </div>
  );
}
