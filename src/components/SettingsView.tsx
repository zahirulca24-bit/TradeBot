/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Settings,
  Sliders,
  Lock,
  Bell,
  Activity,
  FileText,
  Save,
  Check,
  Link,
  Shield,
  WifiOff,
  RefreshCw,
  Search,
  SlidersHorizontal,
  AlertCircle,
  Database,
  Send,
  Terminal,
} from 'lucide-react';

interface SettingsViewProps {
  apiBaseUrl: string;
  onUpdateApiUrl: (url: string) => void;
  onTriggerNoBackendWarning: (message: string) => void;
}

export default function SettingsView({
  apiBaseUrl,
  onUpdateApiUrl,
  onTriggerNoBackendWarning,
}: SettingsViewProps) {
  // Tab State
  const [activeTab, setActiveTab] = React.useState<
    'trading-setup' | 'bybit-api' | 'notifications' | 'diagnostics' | 'decision-log'
  >('trading-setup');

  // Local State for Connections
  const [localUrl, setLocalUrl] = React.useState(apiBaseUrl);
  const [savedUrl, setSavedUrl] = React.useState(false);

  // Trading Setup State
  const [riskPerTrade, setRiskPerTrade] = React.useState('1.0');
  const [maxOpenPositions, setMaxOpenPositions] = React.useState('3');
  const [defaultLeverage, setDefaultLeverage] = React.useState('5');
  const [targetRewardRatio, setTargetRewardRatio] = React.useState('2.0');
  const [savedTradingSetup, setSavedTradingSetup] = React.useState(false);

  // Notifications State
  const [telegramChatId, setTelegramChatId] = React.useState('');
  const [telegramBotToken, setTelegramBotToken] = React.useState('');
  const [notifySignals, setNotifySignals] = React.useState(true);
  const [notifyTrades, setNotifyTrades] = React.useState(true);
  const [notifyErrors, setNotifyErrors] = React.useState(true);
  const [savedNotifications, setSavedNotifications] = React.useState(false);

  // Decision Log Filters State
  const [logSearch, setLogSearch] = React.useState('');
  const [logLevel, setLogLevel] = React.useState('ALL');
  const [logComponent, setLogComponent] = React.useState('ALL');

  React.useEffect(() => {
    setLocalUrl(apiBaseUrl);
  }, [apiBaseUrl]);

  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateApiUrl(localUrl);
    setSavedUrl(true);
    setTimeout(() => setSavedUrl(false), 3000);
  };

  const handleSaveTradingSetup = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedTradingSetup(true);
    setTimeout(() => setSavedTradingSetup(false), 3000);
  };

  const handleSaveNotifications = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNotifications(true);
    setTimeout(() => setSavedNotifications(false), 3000);
  };

  const handleSendTestNotification = () => {
    onTriggerNoBackendWarning(
      'Unable to send test notification. Notification backend service is disconnected.'
    );
  };

  const handleRunDiagnostics = () => {
    onTriggerNoBackendWarning(
      'System diagnostics finished: 0 active socket connections. Backend server is offline.'
    );
  };

  const handleResetLogFilters = () => {
    setLogSearch('');
    setLogLevel('ALL');
    setLogComponent('ALL');
  };

  const tabs = [
    { id: 'trading-setup', name: 'Trading Setup', icon: Sliders },
    { id: 'bybit-api', name: 'Bybit API', icon: Lock },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'diagnostics', name: 'Diagnostics', icon: Activity },
    { id: 'decision-log', name: 'Decision Log', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-trading-border pb-4">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <Settings className="h-5 w-5 text-brand-bybit" />
          <span>Settings & Configuration</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Manage system parameters, Bybit Demo API connections, notification channels, and audit decision logs.
        </p>
      </div>

      {/* Responsive Tab Bar */}
      <div className="flex border-b border-trading-border overflow-x-auto no-scrollbar gap-1 sm:gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'border-brand-bybit text-brand-bybit bg-brand-bybit/5'
                  : 'border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.name}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Trading Setup */}
      {activeTab === 'trading-setup' && (
        <div className="space-y-6 max-w-4xl">
          <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-trading-border pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="h-4.5 w-4.5 text-brand-bybit" />
                <h3 className="font-semibold text-slate-100 text-sm">Strategy & Risk Parameters</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 bg-dark-bg px-2 py-0.5 rounded border border-trading-border">
                Demo Mode Only
              </span>
            </div>

            <form onSubmit={handleSaveTradingSetup} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Risk Per Trade (% of Balance)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="5.0"
                    value={riskPerTrade}
                    onChange={(e) => setRiskPerTrade(e.target.value)}
                    className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-slate-100 font-mono focus:border-brand-bybit focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Maximum 1.0% recommended for Demo</span>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Max Open Positions
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={maxOpenPositions}
                    onChange={(e) => setMaxOpenPositions(e.target.value)}
                    className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-slate-100 font-mono focus:border-brand-bybit focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Concurrent open position cap</span>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Default Leverage
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={defaultLeverage}
                    onChange={(e) => setDefaultLeverage(e.target.value)}
                    className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-slate-100 font-mono focus:border-brand-bybit focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Leverage limit for demo orders</span>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Target Risk:Reward Ratio (R:R)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    max="10.0"
                    value={targetRewardRatio}
                    onChange={(e) => setTargetRewardRatio(e.target.value)}
                    className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-slate-100 font-mono focus:border-brand-bybit focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Minimum setup filter requirement</span>
                </div>
              </div>

              <div className="rounded-lg bg-dark-bg/60 p-3 border border-trading-border/50 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Execution Framework:</span>
                <span className="font-mono text-brand-bybit font-semibold">Bybit Demo Environment</span>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-bybit hover:bg-brand-bybit/90 text-slate-950 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer"
                >
                  {savedTradingSetup ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Saved Setup</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save Setup</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tab 2: Bybit API */}
      {activeTab === 'bybit-api' && (
        <div className="space-y-6 max-w-4xl">
          {/* Connection URL */}
          <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-trading-border pb-3">
              <Link className="h-4.5 w-4.5 text-brand-bybit" />
              <h3 className="font-semibold text-slate-100 text-sm">Backend Engine Endpoint</h3>
            </div>

            <form onSubmit={handleSaveUrl} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  VITE_API_BASE_URL (Bot Backend REST / Socket Server)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                    <Link className="h-4 w-4" />
                  </div>
                  <input
                    type="url"
                    value={localUrl}
                    onChange={(e) => setLocalUrl(e.target.value)}
                    placeholder="https://api.your-bybit-bot.com"
                    className="block w-full rounded-lg border border-trading-border bg-dark-bg pl-10 pr-4 py-2.5 text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-brand-bybit focus:ring-1 focus:ring-brand-bybit focus:outline-none transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  The frontend uses this endpoint to synchronize intraday signals, positions, and performance logs.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-bybit hover:bg-brand-bybit/90 text-slate-950 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer"
                >
                  {savedUrl ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Saved Endpoint</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save Endpoint</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Bybit API Credentials Information */}
          <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-trading-border pb-3">
              <Lock className="h-4.5 w-4.5 text-brand-bybit" />
              <h3 className="font-semibold text-slate-100 text-sm">Bybit Demo Exchange API Credentials</h3>
            </div>

            <div className="rounded-lg bg-dark-bg p-4 border border-trading-border/50">
              <div className="flex items-center gap-2.5">
                <div className="rounded-md bg-card-bg p-1.5 text-slate-400 border border-trading-border">
                  <Shield className="h-4 w-4 text-brand-bybit" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-300">Server-Side Security Standard</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Private API keys are stored exclusively as server-side environment variables on your bot backend. Secrets are never exposed to the client or saved in local storage.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-card-bg p-3 border border-trading-border/55 flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">BYBIT_DEMO_API_KEY</span>
                  <span className="text-slate-400 font-mono text-[10px]">Configured Server-Side</span>
                </div>
                <div className="rounded-lg bg-card-bg p-3 border border-trading-border/55 flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">BYBIT_DEMO_SECRET</span>
                  <span className="text-slate-400 font-mono text-[10px]">Configured Server-Side</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-dark-bg/40 p-3 border border-trading-border/40 flex items-center justify-between text-xs">
              <span className="text-slate-400">Exchange Network Mode:</span>
              <span className="font-mono text-emerald-400 font-semibold">Bybit Demo Only (Locked)</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Notifications */}
      {activeTab === 'notifications' && (
        <div className="space-y-6 max-w-4xl">
          <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-trading-border pb-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4.5 w-4.5 text-brand-bybit" />
                <h3 className="font-semibold text-slate-100 text-sm">Alert & Notification Channels</h3>
              </div>
              <button
                type="button"
                onClick={handleSendTestNotification}
                className="inline-flex items-center gap-1.5 rounded-lg border border-trading-border bg-dark-bg px-3 py-1.5 text-xs text-slate-300 hover:text-slate-100 transition-colors cursor-pointer"
              >
                <Send className="h-3.5 w-3.5 text-brand-bybit" />
                <span>Send Test Alert</span>
              </button>
            </div>

            <form onSubmit={handleSaveNotifications} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Telegram Bot Token
                </label>
                <input
                  type="password"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-slate-100 font-mono placeholder-slate-600 focus:border-brand-bybit focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Telegram Chat ID
                </label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="-100123456789"
                  className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-slate-100 font-mono placeholder-slate-600 focus:border-brand-bybit focus:outline-none"
                />
              </div>

              <div className="pt-2 border-t border-trading-border/50 space-y-3">
                <span className="block text-slate-300 font-semibold">Notification Triggers</span>

                <label className="flex items-center justify-between text-slate-400 cursor-pointer">
                  <span>Validated Signal Alerts</span>
                  <input
                    type="checkbox"
                    checked={notifySignals}
                    onChange={(e) => setNotifySignals(e.target.checked)}
                    className="accent-brand-bybit h-4 w-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between text-slate-400 cursor-pointer">
                  <span>Trade Execution & SL/TP Triggers</span>
                  <input
                    type="checkbox"
                    checked={notifyTrades}
                    onChange={(e) => setNotifyTrades(e.target.checked)}
                    className="accent-brand-bybit h-4 w-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between text-slate-400 cursor-pointer">
                  <span>Engine Connection & Error Warnings</span>
                  <input
                    type="checkbox"
                    checked={notifyErrors}
                    onChange={(e) => setNotifyErrors(e.target.checked)}
                    className="accent-brand-bybit h-4 w-4 cursor-pointer"
                  />
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-bybit hover:bg-brand-bybit/90 text-slate-950 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer"
                >
                  {savedNotifications ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Saved Preferences</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save Preferences</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tab 4: Diagnostics */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-6 max-w-4xl">
          <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-trading-border pb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4.5 w-4.5 text-brand-bybit" />
                <h3 className="font-semibold text-slate-100 text-sm">System Diagnostics & Health Check</h3>
              </div>
              <button
                type="button"
                onClick={handleRunDiagnostics}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-bybit px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-brand-bybit/90 transition-colors cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Run System Diagnostics</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-lg bg-dark-bg p-3.5 border border-trading-border flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-300 block">Backend API Link</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {apiBaseUrl ? apiBaseUrl : 'VITE_API_BASE_URL not configured'}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  OFFLINE
                </span>
              </div>

              <div className="rounded-lg bg-dark-bg p-3.5 border border-trading-border flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-300 block">Bybit Demo REST Endpoint</span>
                  <span className="text-[10px] text-slate-500 font-mono">https://api-demo.bybit.com</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  DISCONNECTED
                </span>
              </div>

              <div className="rounded-lg bg-dark-bg p-3.5 border border-trading-border flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-300 block">Live WebSocket Orderbook Feed</span>
                  <span className="text-[10px] text-slate-500 font-mono">wss://stream-demo.bybit.com</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  INACTIVE
                </span>
              </div>

              <div className="rounded-lg bg-dark-bg p-3.5 border border-trading-border flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-300 block">Market Scanner Engine Pipeline</span>
                  <span className="text-[10px] text-slate-500 font-mono">1H Trend / 15M Setup / 5M Confirmation</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  OFFLINE
                </span>
              </div>

              <div className="rounded-lg bg-dark-bg p-3.5 border border-trading-border flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-300 block">Execution Loop Worker</span>
                  <span className="text-[10px] text-slate-500 font-mono">Automatic Strategy Executor</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  STOPPED
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Decision Log */}
      {activeTab === 'decision-log' && (
        <div className="space-y-6">
          {/* Filters Form */}
          <div className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-trading-border/50 pb-2.5">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="h-4 w-4 text-brand-bybit" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Decision Log Filters</span>
              </div>
              <button
                onClick={handleResetLogFilters}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-semibold cursor-pointer"
              >
                Reset Filters
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-400 mb-1.5">Search Keywords</label>
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="e.g. BTCUSDT, SL_TRIGGER"
                  className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 font-mono text-slate-100 placeholder-slate-600 focus:border-brand-bybit focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-400 mb-1.5">Log Level</label>
                <select
                  value={logLevel}
                  onChange={(e) => setLogLevel(e.target.value)}
                  className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-slate-300 focus:border-brand-bybit focus:outline-none"
                >
                  <option value="ALL">All Levels</option>
                  <option value="INFO">INFO</option>
                  <option value="WARNING">WARNING</option>
                  <option value="ERROR">ERROR</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-400 mb-1.5">System Component</label>
                <select
                  value={logComponent}
                  onChange={(e) => setLogComponent(e.target.value)}
                  className="block w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-slate-300 focus:border-brand-bybit focus:outline-none"
                >
                  <option value="ALL">All Components</option>
                  <option value="Scanner">Scanner Engine</option>
                  <option value="Signal">Signal Engine</option>
                  <option value="Risk">Risk Manager</option>
                  <option value="Executor">Execution Engine</option>
                </select>
              </div>
            </div>
          </div>

          {/* Decision Log Table - Empty State */}
          <div className="rounded-xl border border-trading-border bg-card-bg overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-trading-border flex items-center justify-between bg-card-bg/50">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-brand-bybit" />
                <h3 className="font-semibold text-slate-200 text-sm">System Decision Audit Records</h3>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">0 records</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-trading-border/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-dark-bg/20">
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-5 py-3">Component</th>
                    <th className="px-5 py-3">Level</th>
                    <th className="px-5 py-3">Event / Decision</th>
                    <th className="px-5 py-3">Symbol</th>
                    <th className="px-5 py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-500 text-xs">
                      <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                        <AlertCircle className="h-8 w-8 text-slate-600 mb-3" />
                        <span className="font-semibold text-slate-300 block">No decision log records available</span>
                        <span className="text-[11px] text-slate-500 mt-1">
                          Audited execution logs, rule checks, and risk filter decisions generated by backend strategy workers will be recorded here.
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
