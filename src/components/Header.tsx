/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Clock, Layers, Play, RefreshCw, Wifi, WifiOff } from 'lucide-react';

interface HeaderProps {
  onStartEngine: (message?: string) => void;
  apiBaseUrl: string;
}

type ConnectionState = 'checking' | 'online' | 'offline';

const HEALTH_TIMEOUT_MS = 10000;
const ENGINE_TIMEOUT_MS = 50000;

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`NON_JSON_RESPONSE_HTTP_${response.status}`);
  }
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

export default function Header({ onStartEngine, apiBaseUrl }: HeaderProps) {
  const [timeString, setTimeString] = React.useState<string>('');
  const [connectionState, setConnectionState] = React.useState<ConnectionState>('checking');
  const [starting, setStarting] = React.useState(false);

  const checkConnection = React.useCallback(async () => {
    if (!apiBaseUrl) {
      setConnectionState('offline');
      return;
    }

    setConnectionState('checking');
    try {
      const response = await fetch(`${apiBaseUrl}/health`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      const body = await readJsonResponse(response);
      setConnectionState(
        response.ok && body?.status === 'healthy' ? 'online' : 'offline',
      );
    } catch {
      setConnectionState('offline');
    }
  }, [apiBaseUrl]);

  React.useEffect(() => {
    void checkConnection();
    const interval = window.setInterval(() => void checkConnection(), 30000);
    return () => window.clearInterval(interval);
  }, [checkConnection]);

  React.useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
      );
    };
    updateTime();
    const interval = window.setInterval(updateTime, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const handleStartEngine = async () => {
    if (!apiBaseUrl) {
      onStartEngine('VITE_API_BASE_URL is not configured.');
      return;
    }

    setStarting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/dashboard/engine/start`, {
        method: 'POST',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
      });
      const body = await readJsonResponse(response);
      if (!response.ok || body?.accepted !== true) {
        const reason =
          typeof body?.reason === 'string'
            ? body.reason
            : typeof body?.pythonEngineReason === 'string'
              ? body.pythonEngineReason
              : `HTTP_${response.status}`;
        throw new Error(reason);
      }
      await checkConnection();
    } catch (error) {
      onStartEngine(error instanceof Error ? error.message : 'ENGINE_START_FAILED');
    } finally {
      setStarting(false);
    }
  };

  const todayDateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const online = connectionState === 'online';
  const checking = connectionState === 'checking';

  return (
    <header className="flex flex-col gap-4 border-b border-trading-border bg-sidebar-bg/80 p-4 md:flex-row md:items-center md:justify-between lg:px-6">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-bybit/20 bg-brand-bybit/10 text-brand-bybit">
          <Layers className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-slate-100 sm:text-lg">
            Bybit Intraday Demo Trading Bot
          </h1>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-brand-bybit/20 bg-brand-bybit/15 px-2 py-0.5 text-xs font-semibold text-brand-bybit">
              Bybit Demo Only
            </span>
            <span className="text-[11px] text-slate-500">Live Production Mainnet API Support Inactive</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:gap-4 md:self-center">
        <button
          type="button"
          onClick={() => void checkConnection()}
          className="flex items-center gap-2 rounded-lg border border-trading-border bg-dark-bg px-3 py-1.5 text-left"
          title="Refresh backend connection status"
        >
          <div className="relative flex h-2 w-2">
            <span className={`relative inline-flex h-2 w-2 rounded-full ${checking ? 'bg-amber-400' : online ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className={`text-xs font-medium ${checking ? 'text-amber-300' : online ? 'text-emerald-400' : 'text-rose-400'}`}>
                {checking ? 'Checking' : online ? 'Connected' : 'Not Connected'}
              </span>
              {checking ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-300" /> : online ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-rose-400" />}
            </div>
            <span className="font-mono text-[10px] text-slate-500">
              {apiBaseUrl ? `API: ${apiBaseUrl}` : 'No API BASE URL'}
            </span>
          </div>
        </button>

        <div className="hidden items-center gap-2 rounded-lg border border-trading-border bg-dark-bg px-3 py-1.5 text-slate-300 sm:flex">
          <Clock className="h-4 w-4 text-slate-400" />
          <div className="flex flex-col text-right font-mono">
            <span className="text-xs font-medium text-slate-300">{timeString || '00:00:00 PM'}</span>
            <span className="text-[10px] text-slate-500">{todayDateStr}</span>
          </div>
        </div>

        <button
          onClick={() => void handleStartEngine()}
          disabled={starting || !online}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-bybit px-4 py-2 text-sm font-semibold text-slate-950 shadow-md shadow-brand-bybit/10 transition-colors hover:bg-brand-bybit/90 active:bg-brand-bybit/80 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          {starting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-slate-950" />}
          <span>{starting ? 'Starting…' : 'Start Engine'}</span>
        </button>
      </div>
    </header>
  );
}
