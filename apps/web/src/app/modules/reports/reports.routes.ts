import { Routes } from '@angular/router';

export const reportsRoutes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/executive-dashboard.component').then(m => m.ExecutiveDashboardComponent)
  },
  {
    path: 'sales-register',
    loadComponent: () => import('./pages/reports-pages.components').then(m => m.SalesRegisterComponent)
  },
  {
    path: 'outstanding',
    loadComponent: () => import('./pages/reports-pages.components').then(m => m.OutstandingReportComponent)
  },
  {
    path: 'party-outstanding',
    loadComponent: () => import('./pages/reports-pages.components').then(m => m.PartyAgingComponent)
  },
  {
    path: 'top-parties',
    loadComponent: () => import('./pages/reports-pages.components').then(m => m.TopPartiesComponent)
  },
  {
    path: 'top-items',
    loadComponent: () => import('./pages/reports-pages.components').then(m => m.TopItemsComponent)
  },
  {
    path: 'gst',
    loadComponent: () => import('./pages/reports-pages.components').then(m => m.GstSummaryComponent)
  },
  {
    path: 'gr',
    loadComponent: () => import('./pages/reports-pages.components').then(m => m.GrReportComponent)
  },
  {
    path: 'commission',
    loadComponent: () => import('./pages/reports-pages.components').then(m => m.CommissionReportComponent)
  },
  {
    path: 'on-time',
    loadComponent: () => import('./pages/reports-pages.components').then(m => m.OnTimeLateEarlyComponent)
  },
  {
    path: 'order-vs-bill',
    loadComponent: () => import('./pages/reports-pages.components').then(m => m.OrderVsBillReportComponent)
  },
  {
    path: 'pending-orders',
    loadComponent: () => import('./pages/reports-pages.components').then(m => m.PendingOrdersReportComponent)
  },
  {
    path: 'supplier-buyer',
    loadComponent: () => import('../trading/pages/party-payment-report.component').then(m => m.PartyPaymentReportComponent)
  },
  {
    path: 'cheque-handover',
    loadComponent: () => import('../trading/pages/cheque-handover-report.component').then(m => m.ChequeHandoverReportComponent)
  },
  {
    path: 'party-wise',
    loadComponent: () => import('./pages/reports-pages.components').then(m => m.PartyWiseReportComponent)
  },
  {
    path: 'groups',
    loadComponent: () => import('../trading/pages/party-group-report.component').then(m => m.PartyGroupReportComponent)
  },
  {
    path: 'scan',
    loadComponent: () => import('./pages/reports-pages.components').then(m => m.ScanReportComponent)
  },
  {
    path: 'activity',
    loadComponent: () => import('./pages/reports-pages.components').then(m => m.ActivityLogComponent)
  }
];
