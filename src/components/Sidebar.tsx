/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  Search,
  Zap,
  TrendingUp,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Layers,
} from 'lucide-react';
import { AppRoute } from '../types';

interface SidebarProps {
  currentRoute: AppRoute;
  onRouteChange: (route: AppRoute) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export default function Sidebar({
  currentRoute,
  onRouteChange,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
}: SidebarProps) {
  // Exact requested order
  const menuItems = [
    { id: 'dashboard' as AppRoute, name: 'Dashboard', icon: LayoutDashboard },
    { id: 'market-scanner' as AppRoute, name: 'Market Scanner', icon: Search },
    { id: 'signals' as AppRoute, name: 'Signals', icon: Zap },
    { id: 'active-trades' as AppRoute, name: 'Active Trades', icon: TrendingUp },
    { id: 'performance' as AppRoute, name: 'Performance Analysis', icon: BarChart3 },
    { id: 'settings' as AppRoute, name: 'Settings', icon: Settings },
  ];

  const handleSelectRoute = (route: AppRoute) => {
    onRouteChange(route);
    setIsMobileOpen(false); // Close drawer on selection
  };

  return (
    <>
      {/* Mobile Top Bar with Hamburger Menu - Hidden on Desktop */}
      <div className="flex h-14 items-center justify-between border-b border-trading-border bg-sidebar-bg px-4 md:hidden">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-brand-bybit" />
          <span className="font-semibold text-slate-100 text-sm tracking-tight">Bybit Intraday Bot</span>
        </div>
        <button
          onClick={() => setIsMobileOpen(true)}
          className="rounded-lg p-2 text-slate-400 hover:bg-card-bg hover:text-slate-200 transition-colors cursor-pointer"
          aria-label="Open navigation drawer"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {/* Mobile Sidebar (Drawer Overlay) */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            onClick={() => setIsMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />

          {/* Drawer Content */}
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-trading-border bg-sidebar-bg p-5">
            <div className="flex items-center justify-between pb-6 border-b border-trading-border/60">
              <div className="flex items-center gap-2">
                <Layers className="h-6 w-6 text-brand-bybit" />
                <span className="font-bold text-slate-100 text-lg tracking-tight">Bybit Intraday</span>
              </div>
              <button
                onClick={() => setIsMobileOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-card-bg hover:text-slate-100 transition-colors cursor-pointer"
                aria-label="Close navigation drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Menu Links */}
            <nav className="flex-1 space-y-1.5 mt-6">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentRoute === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectRoute(item.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-brand-bybit/10 text-brand-bybit border-l-2 border-brand-bybit'
                        : 'text-slate-400 hover:bg-card-bg hover:text-slate-200'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="border-t border-trading-border pt-4 mt-auto">
              <div className="rounded-lg bg-card-bg p-3 border border-trading-border/50 text-[11px] text-slate-500">
                <p className="font-semibold text-slate-400 mb-1">Demo Environment</p>
                <p>Designed strictly for paper & demo trading simulation only.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Persistent / Collapsible Sidebar - Hidden on Mobile */}
      <aside
        className={`hidden md:flex flex-col border-r border-trading-border bg-sidebar-bg transition-all duration-300 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Brand Banner */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-trading-border/60">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-bybit/10 text-brand-bybit border border-brand-bybit/20">
              <Layers className="h-4.5 w-4.5" />
            </div>
            {!isCollapsed && (
              <span className="font-bold text-slate-100 text-base tracking-tight whitespace-nowrap">
                Bybit Intraday
              </span>
            )}
          </div>
          {!isCollapsed && (
            <button
              onClick={() => setIsCollapsed(true)}
              className="rounded-md p-1 text-slate-500 hover:bg-card-bg hover:text-slate-300 transition-colors cursor-pointer"
              title="Collapse menu"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Menu Items */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentRoute === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onRouteChange(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg py-2.5 transition-all duration-150 cursor-pointer ${
                  isCollapsed ? 'justify-center px-1' : 'px-3'
                } ${
                  isActive
                    ? 'bg-brand-bybit/10 text-brand-bybit border-l-2 border-brand-bybit'
                    : 'text-slate-400 hover:bg-card-bg hover:text-slate-200'
                }`}
                title={isCollapsed ? item.name : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!isCollapsed && <span className="text-sm font-medium whitespace-nowrap">{item.name}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom Expand Toggle / Collapse trigger */}
        {isCollapsed && (
          <div className="flex justify-center py-4 border-t border-trading-border/60">
            <button
              onClick={() => setIsCollapsed(false)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-card-bg hover:text-slate-300 transition-colors cursor-pointer"
              title="Expand menu"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Desktop Sidebar Footer */}
        {!isCollapsed && (
          <div className="p-4 border-t border-trading-border/60 bg-card-bg/10">
            <div className="rounded-lg bg-card-bg/50 p-3 border border-trading-border/40 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-400 block mb-0.5">Demo Simulation</span>
              <span>No Real Mainnet Trading execution engine loaded.</span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
