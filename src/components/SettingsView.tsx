import React from 'react';
import {
  Activity,
  Bell,
  FileText,
  Lock,
  Search,
  Settings,
  Shield,
  Sliders,
} from 'lucide-react';
import WatchdogStatusPanel from './WatchdogStatusPanel';

interface SettingsViewProps {
  apiBaseUrl: string;
  onTriggerNoBackendWarning: (message: string) => void;
}

type TabId = 'trading-setup' | 'bybit-api' | 'notifications' | 'diagnostics' | 'decision-log';

const TABS: Array<{ id: TabId; name: string; icon: React.ElementType }> = [
  { id: 'trading-setup', name: 'Trading Setup', icon: Sliders },
  { id: 'bybit-api', name: 'Bybit API', icon: Lock },
  { id: 'notifications', name: 'Notifications', icon: Bell },
  { id: 'diagnostics', name: 'Diagnostics', icon: Activity },
  { id: 'decision-log', name: 'Decision Log', icon: FileText },
];

const inputClass = 'w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-xs text-slate-300 disabled:cursor-not-allowed disabled:opacity-60';

export default function SettingsView({ apiBaseUrl, onTriggerNoBackendWarning }: SettingsViewProps) {
  const [activeTab, setActiveTab] = React.useState<TabId>('trading-setup');
  const [logSearch, setLogSearch] = React.useState('');
  const backendConnected = false;

  const showDisconnected = (action: string) => {
    onTriggerNoBackendWarning(`${action} is unavailable because the approved backend is not connected.`);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-trading-border pb-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
          <Settings className="h-5 w-5 text-brand-bybit" />
          Settings
        </h2>
        <p className="mt-1 text-xs text-slate-500">Bybit Demo configuration and audit controls.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-trading-border">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold ${activeTab === tab.id ? 'border-brand-bybit text-brand-bybit' : 'border-transparent text-slate-400'}`}
            >
              <Icon className="h-4 w-4" />
              {tab.name}
            </button>
          );
        })}
      </div>

      {activeTab === 'trading-setup' && (
        <section className="max-w-4xl rounded-xl border border-trading-border bg-card-bg p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-100">Trading Setup</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-xs text-slate-400">Trading Capital<input disabled value="" placeholder="Awaiting backend" className={inputClass} /></label>
            <label className="text-xs text-slate-400">Risk Per Trade (%)<input disabled value="0.5" className={inputClass} /></label>
            <label className="text-xs text-slate-400">Minimum Risk–Reward<input disabled value="1:2" className={inputClass} /></label>
            <label className="text-xs text-slate-400">Daily Loss Limit<input disabled value="2%" className={inputClass} /></label>
            <label className="text-xs text-slate-400">Maximum Active Trades<input disabled value="5" className={inputClass} /></label>
            <label className="text-xs text-slate-400">Cooldown Period<input disabled value="Awaiting backend" className={inputClass} /></label>
          </div>
          <div className="mt-4 flex justify-end">
            <button disabled={!backendConnected} onClick={() => showDisconnected('Saving trading settings')} className="rounded-lg bg-brand-bybit px-4 py-2 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Save Changes</button>
          </div>
        </section>
      )}

      {activeTab === 'bybit-api' && (
        <section className="max-w-4xl space-y-4 rounded-xl border border-trading-border bg-card-bg p-5">
          <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-brand-bybit" /><h3 className="text-sm font-semibold">Bybit Demo API</h3></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-trading-border bg-dark-bg p-3 text-xs"><span className="text-slate-500">Environment</span><div className="mt-1 font-semibold text-emerald-400">Bybit Demo — Locked</div></div>
            <div className="rounded-lg border border-trading-border bg-dark-bg p-3 text-xs"><span className="text-slate-500">Backend URL</span><div className="mt-1 break-all font-mono text-slate-300">{apiBaseUrl || 'Not Configured'}</div></div>
          </div>
          <p className="text-xs text-slate-500">API key and secret must exist only in backend environment variables. They are not accepted or stored by this frontend.</p>
          <button type="button" onClick={() => showDisconnected('Connection test')} className="rounded-lg border border-trading-border px-4 py-2 text-xs text-slate-300">Test Connection</button>
        </section>
      )}

      {activeTab === 'notifications' && (
        <section className="max-w-4xl rounded-xl border border-trading-border bg-card-bg p-5">
          <h3 className="mb-3 text-sm font-semibold">Notifications</h3>
          <p className="text-xs text-slate-500">Telegram credentials and alert preferences will be managed by the backend. No secret is stored in this frontend.</p>
          <button type="button" onClick={() => showDisconnected('Test notification')} className="mt-4 rounded-lg border border-trading-border px-4 py-2 text-xs text-slate-300">Test Notification</button>
        </section>
      )}

      {activeTab === 'diagnostics' && (
        <WatchdogStatusPanel
          apiBaseUrl={apiBaseUrl}
          onTriggerNoBackendWarning={onTriggerNoBackendWarning}
        />
      )}

      {activeTab === 'decision-log' && (
        <section className="space-y-4 rounded-xl border border-trading-border bg-card-bg p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h3 className="text-sm font-semibold">Decision Log</h3><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder="Search symbol or reason" className={`${inputClass} pl-9`} /></div></div>
          <div className="overflow-x-auto">
            <table className="min-w-[820px] w-full text-left text-xs">
              <thead className="border-b border-trading-border text-slate-500"><tr>{['Time','Symbol','Direction','Failed Stage','Decision','Reason','Details'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody><tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">No decision log available</td></tr></tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
