import { Routes } from '@angular/router';

export const accountingRoutes: Routes = [
  { path: '', redirectTo: 'heads', pathMatch: 'full' },
  {
    path: 'heads',
    loadComponent: () => import('./pages/account-heads.component').then(m => m.AccountHeadsComponent)
  },
  {
    path: 'groups',
    loadComponent: () => import('./pages/groups.component').then(m => m.AccountGroupsComponent)
  },
  {
    path: 'sub-groups',
    loadComponent: () => import('./pages/sub-groups.component').then(m => m.SubGroupsComponent)
  },
  {
    path: 'ledgers',
    loadComponent: () => import('./pages/ledgers.component').then(m => m.LedgersComponent)
  },
  {
    path: 'vouchers',
    loadComponent: () => import('./pages/voucher-entry.component').then(m => m.VoucherEntryComponent)
  },
  {
    path: 'voucher-list',
    loadComponent: () => import('./pages/voucher-list.component').then(m => m.VoucherListComponent)
  },
  {
    path: 'trial-balance',
    loadComponent: () => import('./pages/reports.components').then(m => m.TrialBalanceComponent)
  },
  {
    path: 'profit-loss',
    loadComponent: () => import('./pages/reports.components').then(m => m.ProfitLossComponent)
  },
  {
    path: 'balance-sheet',
    loadComponent: () => import('./pages/reports.components').then(m => m.BalanceSheetComponent)
  }
];
