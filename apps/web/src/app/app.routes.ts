import { Routes } from '@angular/router';
import { authGuard, guestGuard, requirePermission } from './core/auth/auth.guard';
import { agentGuard } from './modules/agent/agent.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent)
  },
  // Agent / Reseller area — apna minimal layout, firm shell se bahar
  { path: 'agent', pathMatch: 'full', redirectTo: 'agent/dashboard' },
  {
    path: 'agent/dashboard',
    canActivate: [agentGuard],
    loadComponent: () => import('./modules/agent/agent-dashboard.component').then(m => m.AgentDashboardComponent)
  },
  {
    path: 'pricing',
    loadComponent: () => import('./pages/pricing.component').then(m => m.PricingPageComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell.component').then(m => m.ShellComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/dashboard/pro-dashboard.component').then(m => m.ProDashboardComponent)
      },
      {
        path: 'dashboard-classic',
        loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'accounting',
        canActivate: [requirePermission('accounting.ledger.view.firm')],
        loadChildren: () => import('./modules/accounting/accounting.routes').then(m => m.accountingRoutes)
      },
      {
        path: 'trading',
        canActivate: [requirePermission('trading.bill.view.branch')],
        loadChildren: () => import('./modules/trading/trading.routes').then(m => m.tradingRoutes)
      },
      {
        path: 'reports',
        canActivate: [requirePermission('accounting.report.view.firm')],
        loadChildren: () => import('./modules/reports/reports.routes').then(m => m.reportsRoutes)
      },
      {
        path: 'suppliers',
        canActivate: [requirePermission('suppliers.directory.view.firm')],
        loadChildren: () => import('./modules/suppliers/suppliers.routes').then(m => m.suppliersRoutes)
      },
      {
        path: 'hr',
        canActivate: [requirePermission('hr.attendance.viewown.self')],
        loadChildren: () => import('./modules/hr/hr.routes').then(m => m.hrRoutes)
      },
      {
        path: 'admin',
        canActivate: [requirePermission('platform.firm.view.platform')],
        loadChildren: () => import('./modules/admin/admin.routes').then(m => m.adminRoutes)
      },
      {
        path: 'wallet',
        loadChildren: () => import('./modules/wallet/wallet.routes').then(m => m.walletRoutes)
      },
      {
        path: 'masters',
        loadChildren: () => import('./modules/masters/masters.routes').then(m => m.mastersRoutes)
      },
      {
        // Team & Security — branches, staff logins, roles, permissions (firm admin only)
        path: 'team',
        loadComponent: () => import('./modules/team/team.component').then(m => m.TeamComponent)
      },
      {
        // Import & Migration — naye customer ka purana data bulk import (5 tabs).
        path: 'migration',
        canActivate: [requirePermission('trading.party.view.firm')],
        loadComponent: () => import('./modules/migration/migration.component').then(m => m.MigrationComponent)
      },
      {
        // Core Master list — saare contacts ek jagah (Trading + AD + HR).
        path: 'core-master',
        loadComponent: () => import('./modules/core-master/core-master-list.component').then(m => m.CoreMasterListComponent)
      },
      {
        // Core Master edit — ek contact ka common data badlo (sab jagah reflect).
        path: 'core-master/:id',
        loadComponent: () => import('./modules/core-master/core-master-edit.component').then(m => m.CoreMasterEditComponent)
      },
      {
        path: 'forbidden',
        loadComponent: () => import('./pages/forbidden/forbidden.component').then(m => m.ForbiddenComponent)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
