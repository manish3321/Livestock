import { api } from './client';

export interface DashboardSpeciesCount {
  species: string;
  count: number;
}

export interface DashboardAlertItem {
  id: string;
  title: string;
  detail?: string | null;
  dueAt?: string | null;
}

export interface DashboardActivityItem {
  id: string;
  kind: string;
  summary: string;
  createdAt: string;
}

export interface DashboardSummary {
  animalCount: number;
  /** Omitted or null when caller lacks finance:read */
  revenueTotal?: number | null;
  expenseTotal?: number | null;
  netProfit?: number | null;
  speciesDistribution: DashboardSpeciesCount[];
  alerts: {
    healthOverdue: DashboardAlertItem[];
    inventoryCritical: DashboardAlertItem[];
    pendingApprovals: DashboardAlertItem[];
  };
  recentActivity: DashboardActivityItem[];
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return api('/v1/dashboard/summary');
}
