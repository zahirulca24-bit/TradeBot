/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import MarketScannerView from './components/MarketScannerView';
import SignalsView from './components/SignalsView';
import ActiveTradesView from './components/ActiveTradesView';
import PerformanceView from './components/PerformanceView';
import SettingsView from './components/SettingsView';
import PlaceholderView from './components/PlaceholderView';
import Modal from './components/Modal';
import { AppRoute } from './types';

export default function App() {
  // Client-side Hash Router
  const [currentRoute, setCurrentRoute] = React.useState<AppRoute>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState<boolean>(false);
  const [isEngineModalOpen, setIsEngineModalOpen] = React.useState<boolean>(false);
  const [modalTitle, setModalTitle] = React.useState<string>('Engine Connection Failed');
  const [modalType, setModalType] = React.useState<'engine' | 'scanner' | 'signals' | 'trades' | 'performance'>('engine');
  const [modalMessage, setModalMessage] = React.useState<string>('');

  // Retrieve initial API URL from environment variable, falling back to empty
  const [apiBaseUrl, setApiBaseUrl] = React.useState<string>(() => {
    return (import.meta as any).env.VITE_API_BASE_URL || localStorage.getItem('VITE_API_BASE_URL') || '';
  });

  // Track hash changes for routing
  React.useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '') as AppRoute;
      const validRoutes: AppRoute[] = [
        'dashboard',
        'market-scanner',
        'signals',
        'active-trades',
        'performance',
        'settings',
      ];
      if (validRoutes.includes(hash)) {
        setCurrentRoute(hash);
      } else {
        // Default route
        setCurrentRoute('dashboard');
        window.location.hash = '#/dashboard';
      }
    };

    // Initialize
    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update current route both in state and in hash
  const handleRouteChange = (route: AppRoute) => {
    setCurrentRoute(route);
    window.location.hash = `#/${route}`;
  };

  const handleUpdateApiUrl = (url: string) => {
    setApiBaseUrl(url);
    localStorage.setItem('VITE_API_BASE_URL', url);
  };

  const triggerStartEngineModal = () => {
    setModalTitle('Engine Connection Failed');
    setModalType('engine');
    setIsEngineModalOpen(true);
  };

  const triggerNoBackendWarning = (message: string) => {
    setModalTitle('Scanner Connection Failed');
    setModalType('scanner');
    setIsEngineModalOpen(true);
  };

  const triggerSignalsWarning = (message: string) => {
    setModalTitle('Signals Error');
    setModalType('signals');
    setModalMessage(message);
    setIsEngineModalOpen(true);
  };

  const triggerTradesWarning = (message: string) => {
    setModalTitle('Active Trades Error');
    setModalType('trades');
    setModalMessage(message);
    setIsEngineModalOpen(true);
  };

  const triggerPerformanceWarning = (message: string) => {
    setModalTitle('Performance Analysis Error');
    setModalType('performance');
    setModalMessage(message);
    setIsEngineModalOpen(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-dark-bg text-slate-100 antialiased font-sans">
      {/* Sidebar handles mobile drawer header internally */}
      <div className="flex flex-1 flex-col md:flex-row">
        {/* Sidebar Container */}
        <Sidebar
          currentRoute={currentRoute}
          onRouteChange={handleRouteChange}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          isMobileOpen={isMobileSidebarOpen}
          setIsMobileOpen={setIsMobileSidebarOpen}
        />

        {/* Content Wrapper */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <Header onStartEngine={triggerStartEngineModal} apiBaseUrl={apiBaseUrl} />

          {/* Main Workspace Area */}
          <main className="flex-1 overflow-y-auto px-4 py-6 md:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl w-full">
              {currentRoute === 'dashboard' ? (
                <DashboardView
                  apiBaseUrl={apiBaseUrl}
                  onStartEngineClick={triggerStartEngineModal}
                />
              ) : currentRoute === 'market-scanner' ? (
                <MarketScannerView
                  apiBaseUrl={apiBaseUrl}
                  onTriggerNoBackendWarning={triggerNoBackendWarning}
                />
              ) : currentRoute === 'signals' ? (
                <SignalsView
                  apiBaseUrl={apiBaseUrl}
                  onTriggerNoBackendWarning={triggerSignalsWarning}
                />
              ) : currentRoute === 'active-trades' ? (
                <ActiveTradesView
                  apiBaseUrl={apiBaseUrl}
                  onTriggerNoBackendWarning={triggerTradesWarning}
                />
              ) : currentRoute === 'performance' ? (
                <PerformanceView
                  apiBaseUrl={apiBaseUrl}
                  onTriggerNoBackendWarning={triggerPerformanceWarning}
                />
              ) : currentRoute === 'settings' ? (
                <SettingsView
                  apiBaseUrl={apiBaseUrl}
                  onUpdateApiUrl={handleUpdateApiUrl}
                  onTriggerNoBackendWarning={triggerNoBackendWarning}
                />
              ) : (
                <PlaceholderView
                  route={currentRoute}
                  apiBaseUrl={apiBaseUrl}
                  onUpdateApiUrl={handleUpdateApiUrl}
                />
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Reusable Warning Modal */}
      <Modal
        isOpen={isEngineModalOpen}
        onClose={() => setIsEngineModalOpen(false)}
        title={modalTitle}
      >
        {modalType === 'engine' ? (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-brand-bybit">
              Engine control is not connected
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              The Bybit Intraday Demo Trading Bot is currently running in decoupled frontend mode.
              To initialize and start the demo execution loops or strategies, you must connect a running backend bot server.
            </p>
            <div className="rounded-lg bg-card-bg p-3 border border-trading-border text-[11px] font-mono text-slate-400">
              <span className="text-slate-500 block">Required Setup:</span>
              1. Configure VITE_API_BASE_URL in the Settings panel.<br />
              2. Run your intraday bot server backend.
            </div>
          </div>
        ) : modalType === 'scanner' ? (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-brand-bybit text-rose-400">
              Scanner backend is not connected
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              The Market Scanner pipeline is currently inactive because the scanner backend is offline.
              Please configure your bot server in the Settings panel and make sure the execution engine is online to run scans.
            </p>
            <div className="rounded-lg bg-card-bg p-3 border border-trading-border text-[11px] font-mono text-slate-400">
              <span className="text-slate-500 block">Required Action:</span>
              Initialize the pipeline and click "Scan Now" after establishing a live backend socket or HTTP link.
            </div>
          </div>
        ) : modalType === 'trades' ? (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-brand-bybit text-rose-400">
              Active positions sync failed
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              {modalMessage || "Unable to sync positions. Your execution engine server is disconnected or offline."}
            </p>
            <div className="rounded-lg bg-card-bg p-3 border border-trading-border text-[11px] font-mono text-slate-400">
              <span className="text-slate-500 block">Setup Instructions:</span>
              Please check your bot connection in the Settings panel or start your Bybit Intraday Bot server.
            </div>
          </div>
        ) : modalType === 'performance' ? (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-brand-bybit text-rose-400">
              Performance data sync failed
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              {modalMessage || "Performance backend is not connected. Closed trades and performance logs require a live backend connection."}
            </p>
            <div className="rounded-lg bg-card-bg p-3 border border-trading-border text-[11px] font-mono text-slate-400">
              <span className="text-slate-500 block">System State:</span>
              No fabricated metrics or fake trades are injected when offline.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-brand-bybit text-rose-400">
              Execution backend is not connected
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              {modalMessage || "The execution backend is not connected. Signals require a live Bybit Intraday Bot backend link to carry out paper execution."}
            </p>
            <div className="rounded-lg bg-card-bg p-3 border border-trading-border text-[11px] font-mono text-slate-400">
              <span className="text-slate-500 block">System State:</span>
              No mock, simulated, or fake execution can be initiated from this interface while offline.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
