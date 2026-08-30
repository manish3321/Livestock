import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/auth-context';
import { RequireAuth, RequireCommercial, RequireModule } from './auth/ProtectedRoute';
import { AppLayout } from './layout/AppLayout';
import { ForbiddenPage, NotFoundPage } from './pages/ErrorPages';
import { LoginPage } from './pages/LoginPage';
import {
  BatchDetailPage,
  FishBatchesPage,
  LivestockBatchesPage,
  PoultryBatchesPage,
} from './pages/batches/BatchesPages';
import { AnimalDetailPage, AnimalFormPage } from './pages/animals/AnimalDetailPage';
import { AnimalsListPage } from './pages/animals/AnimalsListPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { ExpensesPage } from './pages/expenses/ExpensesPage';
import { RevenuePage } from './pages/revenue/RevenuePage';
import { PnlPage } from './pages/pnl/PnlPage';
import { InventoryPage } from './pages/inventory/InventoryPage';
import { HealthPage } from './pages/health/HealthPage';
import { BreedingPage } from './pages/breeding/BreedingPage';
import { ProductionPage } from './pages/production/ProductionPage';
import { FeedPage } from './pages/feed/FeedPage';
import { AdminAuditPage, AdminMembersPage } from './pages/admin/AdminPages';
import { ReportsPage } from './pages/reports/ReportsPage';
import { AnimalScanPage, BatchScanPage } from './pages/scan/ScanPages';
import { ScanHubPage } from './pages/scan/ScanHubPage';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />

            <Route element={<RequireModule module="dashboard" />}>
              <Route path="/dashboard" element={<DashboardPage />} />
            </Route>

            <Route element={<RequireModule module="animals" />}>
              <Route path="/animals" element={<LivestockBatchesPage />} />
              <Route path="/animals/stock" element={<AnimalsListPage />} />
              <Route path="/animals/stock/new" element={<AnimalFormPage mode="create" />} />
              <Route path="/animals/stock/:id" element={<AnimalDetailPage />} />
              <Route path="/animals/stock/:id/edit" element={<AnimalFormPage mode="edit" />} />
            </Route>

            <Route element={<RequireModule module="scan" />}>
              <Route path="/scan" element={<ScanHubPage />} />
              <Route path="/scan/a/:id" element={<AnimalScanPage />} />
              <Route path="/scan/b/:id" element={<BatchScanPage />} />
            </Route>

            <Route element={<RequireModule module="groups" />}>
              <Route path="/groups" element={<PoultryBatchesPage />} />
            </Route>

            <Route element={<RequireModule module="fish" />}>
              <Route path="/fish" element={<FishBatchesPage />} />
            </Route>

            <Route element={<RequireModule module="animals" />}>
              <Route path="/batches/:id" element={<BatchDetailPage />} />
            </Route>

            <Route element={<RequireModule module="expenses" />}>
              <Route path="/expenses" element={<ExpensesPage />} />
            </Route>

            <Route element={<RequireModule module="revenue" />}>
              <Route path="/revenue" element={<RevenuePage />} />
            </Route>

            <Route element={<RequireModule module="pnl" />}>
              <Route element={<RequireCommercial />}>
                <Route path="/pnl" element={<PnlPage />} />
              </Route>
            </Route>

            <Route element={<RequireModule module="inventory" />}>
              <Route path="/inventory" element={<InventoryPage />} />
            </Route>

            <Route element={<RequireModule module="health" />}>
              <Route path="/health" element={<HealthPage />} />
            </Route>

            <Route element={<RequireModule module="breeding" />}>
              <Route path="/breeding" element={<BreedingPage />} />
            </Route>

            <Route element={<RequireModule module="production" />}>
              <Route path="/production" element={<ProductionPage />} />
            </Route>

            <Route element={<RequireModule module="feed" />}>
              <Route path="/feed" element={<FeedPage />} />
            </Route>

            <Route element={<RequireModule module="reports" />}>
              <Route element={<RequireCommercial />}>
                <Route path="/reports" element={<ReportsPage />} />
              </Route>
            </Route>

            <Route path="/admin/members" element={<AdminMembersPage />} />
            <Route path="/admin/audit" element={<AdminAuditPage />} />

            <Route path="/forbidden" element={<ForbiddenPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
