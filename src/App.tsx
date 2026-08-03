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
import Modal from './components/Modal';
import { AppRoute } from './types';

type ModalType = 'engine' | 'scanner' | 'signals' | 'trades' | 'performance';

const VALID_ROUTES: AppRoute[] = [
  'dashboard',
  'market-scanner',
  'signals',
  'active-trades',
  'performance',
  'settings',
];

export default function App() {
  const [currentRoute, setCurrentRoute] = React.useState<AppRoute>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);
  const [isEngineModalOpen, setIsEngineModalOpen] = React.useState(false);
  const [modalTitle, setModalTitle] = React.useState('Engine Connection Failed');
  const [modalType, setModalType] = React.useState<ModalType>('engine');
  const [modalMessage, setModalMessage] = React.useState('');
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';

  React.useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '') as AppRoute;
      if (VALID_ROUTES.includes(hash)) {
        setCurrentRoute(hash);
        return;
      }
      setCurrentRoute('dashboard');
      window.location.hash = '#/dashboard';
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleRouteChange = (route: AppRoute) => {
    setCurrentRoute(route);
    window.location.hash = `#/${route}`;
  };

  const openWarning = (type: ModalType, title: string, message = '') => {
    setModalType(type);
    setModalTitle(title);
    setModalMessage(message);
    setIsEngineModalOpen(true);
  };

  const triggerStartEngineModal = (message = '') =>
    openWarning('engine', message ? 'Engine Start Blocked' : 'Engine Connection Failed', message);

  const triggerNoBackendWarning = (message: string) =>
    openWarning('scanner', 'Backend Connection Failed', message);

  const triggerSignalsWarning = (message: string) =>
    openWarning('signals', 'Signals Error', message);

  const triggerTradesWarning = (message: string) =>
    openWarning('trades', 'Active Trades Error', message);

  const triggerPerformanceWarning = (message: string) =>
    openWarning('performance', 'Performance Analysis Error', message);

  return (
    <div className="flex min-h-screen flex-col bg-dark-bg font-sans text-slate-100 antialiased">
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar
          currentRoute={currentRoute}
          onRouteChange={handleRouteChange}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          isMobileOpen={isMobileSidebarOpen}
          setIsMobileOpen={setIsMobileSidebarOpen}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <Header onStartEngine={triggerStartEngineModal} apiBaseUrl={apiBaseUrl} />

          <main className="flex-1 overflow-y-auto px-4 py-6 md:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-7xl">
              {currentRoute === 'dashboard' && (
                <DashboardView apiBaseUrl={apiBaseUrl} onStartEngineClick={triggerStartEngineModal} />
              )}
              {currentRoute === 'market-scanner' && (
                <MarketScannerView apiBaseUrl={apiBaseUrl} onTriggerNoBackendWarning={triggerNoBackendWarning} />
              )}
              {currentRoute === 'signals' && (
                <SignalsView apiBaseUrl={apiBaseUrl} onTriggerNoBackendWarning={triggerSignalsWarning} />
              )}
              {currentRoute === 'active-trades' && (
                <ActiveTradesView apiBaseUrl={apiBaseUrl} onTriggerNoBackendWarning={triggerTradesWarning} />
              )}
              {currentRoute === 'performance' && (
                <PerformanceView apiBaseUrl={apiBaseUrl} onTriggerNoBackendWarning={triggerPerformanceWarning} />
              )}
              {currentRoute === 'settings' && (
                <SettingsView apiBaseUrl={apiBaseUrl} onTriggerNoBackendWarning={triggerNoBackendWarning} />
              )}
            </div>
          </main>
        </div>
      </div>

      <Modal
        isOpen={isEngineModalOpen}
        onClose={() => setIsEngineModalOpen(false)}
        title={modalTitle}
      >
        <div className="space-y-4">
          <p className="text-sm font-semibold text-rose-400">
            {modalType === 'engine' ? 'Engine action was not accepted' : 'Backend service is not connected'}
          </p>
          <p className="text-xs leading-relaxed text-slate-300">
            {modalMessage ||
              'The frontend is in safe disconnected mode. No scan, execution, position change, notification, or diagnostic result has been fabricated.'}
          </p>
          <div className="rounded-lg border border-trading-border bg-card-bg p-3 font-mono text-[11px] text-slate-400">
            <span className="block text-slate-500">Backend</span>
            {apiBaseUrl || 'VITE_API_BASE_URL is not configured'}
          </div>
        </div>
      </Modal>
    </div>
  );
}
