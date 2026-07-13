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
    path: 'ai-keys',
    loadComponent: () => import('./pages/admin-ai-keys.component').then(m => m.AdminAiKeysComponent)
  },
  {
    path: 'whatsapp',
    loadComponent: () => import('./pages/admin-whatsapp.component').then(m => m.AdminWhatsAppComponent)
  },
  {
    path: 'credil',
    loadComponent: () => import('./pages/admin-credil.component').then(m => m.AdminCredilComponent)
  },
  {
    path: 'complaints',
    loadComponent: () => import('./pages/admin-complaints.component').then(m => m.AdminComplaintsComponent)
  },
  {
    path: 'feature-flags',
    loadComponent: () => import('./pages/admin-feature-flags.component').then(m => m.AdminFeatureFlagsComponent)
  },
  {
    path: 'changelog',
    loadComponent: () => import('./pages/admin-pages.components').then(m => m.AdminChangelogComponent)
  }
];
