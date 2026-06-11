import { Routes } from '@angular/router';

export const walletRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./wallet-page.component').then(m => m.WalletPageComponent),
    title: 'Wallet & Billing — Anjaninex'
  }
];
