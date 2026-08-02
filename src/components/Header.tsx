/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Play, WifiOff, Clock, Layers } from 'lucide-react';

interface HeaderProps {
  onStartEngine: () => void;
  apiBaseUrl: string;
}

export default function Header({ onStartEngine, apiBaseUrl }: HeaderProps) {
  const [timeString, setTimeString] = React.useState<string>('');

  React.useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const todayDateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <header className="flex flex-col gap-4 border-b border-trading-border bg-sidebar-bg/80 p-4 md:flex-row md:items-center md:justify-between lg:px-6">
      {/* Brand info */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-bybit/10 text-brand-bybit border border-brand-bybit/20">
          <Layers className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-slate-100 sm:text-lg">
            Bybit Intraday Demo Trading Bot
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="inline-flex items-center rounded-full bg-brand-bybit/15 px-2 py-0.5 text-xs font-semibold text-brand-bybit border border-brand-bybit/20">
              Bybit Demo Only
            </span>
            <span className="text-[11px] text-slate-500">Live Production Mainnet API Support Inactive</span>
          </div>
        </div>
      </div>

      {/* Right control section */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 md:self-center">
        {/* Connection status */}
        <div className="flex items-center gap-2 rounded-lg bg-dark-bg px-3 py-1.5 border border-trading-border">
          <div className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500"></span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-rose-400">Not Connected</span>
              <WifiOff className="h-3.5 w-3.5 text-rose-400" />
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              {apiBaseUrl ? `API: ${apiBaseUrl}` : 'No API BASE URL'}
            </span>
          </div>
        </div>

        {/* Live clock */}
        <div className="hidden items-center gap-2 rounded-lg bg-dark-bg px-3 py-1.5 border border-trading-border text-slate-300 sm:flex">
          <Clock className="h-4 w-4 text-slate-400" />
          <div className="flex flex-col text-right font-mono">
            <span className="text-xs font-medium text-slate-300">{timeString || '00:00:00 PM'}</span>
            <span className="text-[10px] text-slate-500">{todayDateStr}</span>
          </div>
        </div>

        {/* Start Engine button */}
        <button
          onClick={onStartEngine}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-bybit px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-bybit/90 active:bg-brand-bybit/80 transition-colors cursor-pointer shadow-md shadow-brand-bybit/10 w-full sm:w-auto justify-center"
        >
          <Play className="h-4 w-4 fill-slate-950" />
          <span>Start Engine</span>
        </button>
      </div>
    </header>
  );
}
