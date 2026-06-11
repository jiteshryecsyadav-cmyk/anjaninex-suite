import { Routes } from '@angular/router';

export const tradingRoutes: Routes = [
  { path: '', redirectTo: 'parties', pathMatch: 'full' },
  {
    path: 'parties',
    loadComponent: () => import('./pages/parties.component').then(m => m.PartiesComponent)
  },
  {
    path: 'items',
    loadComponent: () => import('./pages/items.component').then(m => m.ItemsComponent)
  },
  {
    path: 'bills',
    loadComponent: () => import('./pages/bills.component').then(m => m.BillsComponent)
  },
  {
    path: 'bills/new',
    loadComponent: () => import('./pages/bill-entry.component').then(m => m.BillEntryComponent)
  },
  {
    path: 'bills/:id/edit',
    loadComponent: () => import('./pages/bill-entry.component').then(m => m.BillEntryComponent)
  },
  {
    path: 'orders',
    loadComponent: () => import('./pages/orders.component').then(m => m.OrdersComponent)
  },
  {
    path: 'orders/new',
    loadComponent: () => import('./pages/order-entry.component').then(m => m.OrderEntryComponent)
  },
  {
    path: 'orders/:id/edit',
    loadComponent: () => import('./pages/order-entry.component').then(m => m.OrderEntryComponent)
  },
  {
    path: 'payments',
    loadComponent: () => import('./pages/payments.component').then(m => m.PaymentsComponent)
  },
  {
    path: 'payments/new',
    loadComponent: () => import('./pages/payment-receipt.component').then(m => m.PaymentReceiptComponent)
  },
  {
    path: 'payments/:id/edit',
    loadComponent: () => import('./pages/payment-receipt.component').then(m => m.PaymentReceiptComponent)
  },
  {
    path: 'gr',
    loadComponent: () => import('./pages/gr.component').then(m => m.GrComponent)
  },
  {
    path: 'gr/new',
    loadComponent: () => import('./pages/gr-entry.component').then(m => m.GrEntryComponent)
  },
  {
    path: 'gr/:id/edit',
    loadComponent: () => import('./pages/gr-entry.component').then(m => m.GrEntryComponent)
  },
  {
    path: 'commission',
    loadComponent: () => import('./pages/commission.component').then(m => m.CommissionComponent)
  },
  {
    path: 'commission/new',
    loadComponent: () => import('./pages/commission-generate.component').then(m => m.CommissionGenerateComponent)
  }
];
