import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/anjaninex-dashboard.component').then(m => m.AnjaninexDashboardComponent)
  },
  {
    path: 'firms',
    loadComponent: () => import('./pages/admin-pages.components').then(m => m.AdminFirmsComponent)
  },
  {
    path: 'firms/:id',
    loadComponent: () => import('./pages/admin-pages.components').then(m => m.AdminFirmDetailComponent)
  },
  {
    path: 'agents',
    loadComponent: () => import('./pages/admin-agents.component').then(m => m.AdminAgentsComponent)
  },
  {
    path: 'firms/:id/subscription',
    loadComponent: () => import('./pages/admin-firm-subscription.component').then(m => m.AdminFirmSubscriptionComponent)
  },
  {
    path: 'firm-report',
    loadComponent: () => import('./pages/admin-firm-report.component').then(m => m.AdminFirmReportComponent)
  },
  {
    path: 'plans',
    loadComponent: () => import('./pages/admin-pages.components').then(m => m.AdminPlansComponent)
  },
  {
    path: 'roi',
    loadComponent: () => import('./pages/admin-roi-calculator.component').then(m => m.AdminRoiCalculatorComponent)
  },
  {
    path: 'billing',
    loadComponent: () => import('./pages/admin-billing.component').then(m => m.AdminBillingComponent)
  },
  {
    path: 'accounting',
    loadComponent: () => import('./pages/admin-books.component').then(m => m.AdminBooksComponent)
  },
  {
    path: 'invoices',
    loadComponent: () => import('./pages/admin-invoices.component').then(m => m.AdminInvoicesComponent)
  },
  {
    path: 'ai-monitor',
    loadComponent: () => import('./pages/admin-pages.components').then(m => m.AdminAiMonitorComponent)
  },
  {
    path: 'changelog',
    loadComponent: () => import('./pages/admin-pages.components').then(m => m.AdminChangelogComponent)
  }
];
