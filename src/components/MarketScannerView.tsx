/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Search,
  RefreshCw,
  Play,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Clock,
  Database,
  ArrowRight,
  Info,
} from 'lucide-react';

interface MarketScannerViewProps {
  apiBaseUrl: string;
  onTriggerNoBackendWarning: (message: string) => void;
}

interface PipelineStage {
  name: string;
  input: number;
  passed: number;
  rejected: number;
  status: 'Idle' | 'Running' | 'Completed' | 'Error' | 'Not Connected';
}

export default function MarketScannerView({
  apiBaseUrl,
  onTriggerNoBackendWarning,
}: MarketScannerViewProps) {
  // Filter States
  const [symbolSearch, setSymbolSearch] = React.useState('');
  const [directionFilter, setDirectionFilter] = React.useState('ALL');
  const [gradeFilter, setGradeFilter] = React.useState('ALL');
  const [statusFilter, setStatusFilter] = React.useState('ALL');

  // Reset function
  const handleResetFilters = () => {
    setSymbolSearch('');
    setDirectionFilter('ALL');
    setGradeFilter('ALL');
    setStatusFilter('ALL');
  };

  const handleScanNow = () => {
    onTriggerNoBackendWarning('Scanner backend is not connected');
  };

  // 6 Exact Sequenced Pipeline Stages:
  // Market Data → Symbol Filter → 1H Trend → 15M Setup → 5M Confirmation → Final Result
  const pipelineStages: PipelineStage[] = [
    { name: 'Market Data', input: 0, passed: 0, rejected: 0, status: 'Not Connected' },
    { name: 'Symbol Filter', input: 0, passed: 0, rejected: 0, status: 'Not Connected' },
    { name: '1H Trend', input: 0, passed: 0, rejected: 0, status: 'Not Connected' },
    { name: '15M Setup', input: 0, passed: 0, rejected: 0, status: 'Not Connected' },
    { name: '5M Confirmation', input: 0, passed: 0, rejected: 0, status: 'Not Connected' },
    { name: 'Final Result', input: 0, passed: 0, rejected: 0, status: 'Not Connected' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-trading-border pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Search className="h-5 w-5 text-brand-bybit" />
            <span>Market Scanner</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Intraday strategy pipeline analyzing live Bybit trading pairs.
          </p>
        </div>

        {/* Live Scan Diagnostics */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg bg-card-bg border border-trading-border px-3 py-1.5 text-xs text-slate-400 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 font-semibold uppercase">Scanner:</span>
              <span className="text-rose-400 font-medium font-mono">Offline</span>
            </div>
            <div className="h-3 w-[1px] bg-trading-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 font-semibold uppercase">Data Link:</span>
              <span className="text-rose-400 font-medium font-mono">No Connection</span>
            </div>
          </div>

          <button
            onClick={handleScanNow}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-bybit px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-brand-bybit/90 active:bg-brand-bybit/80 transition-all cursor-pointer"
          >
            <Play className="h-3.5 w-3.5 fill-slate-950" />
            <span>Scan Now</span>
          </button>
        </div>
      </div>

      {/* Connection States Stats Info Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-trading-border bg-card-bg p-4 flex items-center gap-3">
          <div className="rounded-lg bg-dark-bg p-2 text-slate-500 border border-trading-border">
            <Clock className="h-4.5 w-4.5 text-slate-400" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Last Scan Time</span>
            <span className="text-xs font-medium font-mono text-slate-300">Never</span>
          </div>
        </div>

        <div className="rounded-xl border border-trading-border bg-card-bg p-4 flex items-center gap-3">
          <div className="rounded-lg bg-dark-bg p-2 text-slate-500 border border-trading-border">
            <Clock className="h-4.5 w-4.5 text-slate-400" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Next Scan Interval</span>
            <span className="text-xs font-medium font-mono text-slate-300">Never (Disconnected)</span>
          </div>
        </div>

        <div className="rounded-xl border border-trading-border bg-card-bg p-4 flex items-center gap-3">
          <div className="rounded-lg bg-dark-bg p-2 text-slate-500 border border-trading-border">
            <Database className="h-4.5 w-4.5 text-slate-400" />
          </div>
          <div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Active Connection</span>
            <span className="text-xs font-medium text-rose-400 truncate max-w-[180px] block">
              {apiBaseUrl ? apiBaseUrl : 'Not Connected'}
            </span>
          </div>
        </div>
      </div>

      {/* Scanner Pipeline Progression Section */}
      <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Scanner Pipeline Stages</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Sequential screening filters. All criteria must succeed to produce a trade recommendation.
          </p>
        </div>

        {/* Responsive Wrapped Pipeline Stages Container */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {pipelineStages.map((stage, idx) => (
            <div
              key={stage.name}
              className="relative rounded-lg border border-trading-border bg-dark-bg/60 p-3.5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2.5">
                  <span className="text-xs font-bold text-slate-300 truncate">{stage.name}</span>
                  <span className="text-[9px] font-mono text-slate-500 bg-card-bg px-1.5 py-0.5 rounded border border-trading-border/50">
                    S{idx + 1}
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-500">In:</span>
                    <span className="text-slate-400">{stage.input}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Passed:</span>
                    <span className="text-emerald-500/80">{stage.passed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Rejected:</span>
                    <span className="text-rose-500/80">{stage.rejected}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-2.5 border-t border-trading-border/50 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-semibold">Status:</span>
                <span className="inline-flex items-center rounded-full bg-rose-500/10 px-1.5 py-0.2 text-[9px] font-bold text-rose-400 border border-rose-500/20 uppercase tracking-wide">
                  {stage.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Controls & Filters */}
      <div className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-trading-border/50 pb-2.5">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-4 w-4 text-brand-bybit" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Scan Filter Rules</span>
          </div>
          <button
            onClick={handleResetFilters}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-semibold cursor-pointer"
          >
            Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Symbol Search */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">Symbol Search</label>
            <input
              type="text"
              value={symbolSearch}
              onChange={(e) => setSymbolSearch(e.target.value.toUpperCase())}
              placeholder="e.g. BTCUSDT, ETHUSDT"
              className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-brand-bybit focus:ring-1 focus:ring-brand-bybit focus:outline-none"
            />
          </div>

          {/* Direction */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">Setup Direction</label>
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
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">Setup Grade Quality</label>
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
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">Pipeline Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-xs text-slate-300 focus:border-brand-bybit focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="PASSED">Passed (Target setup valid)</option>
              <option value="REJECTED">Rejected (Criteria failed)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Scanner Results Table */}
      <div className="rounded-xl border border-trading-border bg-card-bg overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-trading-border flex items-center justify-between bg-card-bg/50">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500"></span>
            <h3 className="font-semibold text-slate-200 text-sm">Scanner Output Matches</h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">0 pairs matched</span>
        </div>

        {/* Desktop and Responsive Scrollable Table Container */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-trading-border/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-dark-bg/20">
                <th className="px-5 py-3">Symbol</th>
                <th className="px-5 py-3">Direction</th>
                <th className="px-5 py-3">Setup</th>
                <th className="px-5 py-3">Grade</th>
                <th className="px-5 py-3">R:R</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">View</th>
              </tr>
            </thead>
            <tbody>
              {/* No rows matching backend requirement */}
              <tr className="border-b border-trading-border/40">
                <td colSpan={7} className="px-5 py-12 text-center text-slate-500 text-xs">
                  <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                    <AlertCircle className="h-8 w-8 text-slate-600 mb-3" />
                    <span className="font-semibold text-slate-400 block">No scanner results available</span>
                    <span className="text-[11px] text-slate-500 mt-1">
                      The execution portal expects data from the Bybit Intraday Bot backend. Please verify your settings and connect your engine server to see live scanned pairs.
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
