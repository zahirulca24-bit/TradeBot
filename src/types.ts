/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AppRoute =
  | 'dashboard'
  | 'market-scanner'
  | 'signals'
  | 'active-trades'
  | 'performance'
  | 'settings';

export interface RouteConfig {
  id: AppRoute;
  name: string;
  icon: string; // name of lucide-react icon
}

export interface BackendStatus {
  connected: boolean;
  url: string;
  engineRunning: boolean;
}
