import { Routes } from '@angular/router';
import { authGuard, requirePermission } from './core/auth.guard';
import { landingRedirect } from './core/landing.guard';

/**
 * Har screen lazy hai — pehli baar khulne par hi download hoti hai. Manufacturer
 * app phone par bhi chalega, isliye pehla bundle chhota rakhna zaroori hai.
 */
export const routes: Routes = [
  {
    path: 'no-access',
    loadComponent: () => import('./modules/auth/no-access.component').then(m => m.NoAccessComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then(m => m.ShellComponent),
    children: [
      // Fix redirect nahi — aadmi ki permission dekh kar tay hota hai.
      // Warna Godown wala/Salesman app kholte hi rok wale pardah par pahunchte the.
      { path: '', pathMatch: 'full', canActivate: [landingRedirect], children: [] },
      {
        path: 'masters/karigars',
        canActivate: [requirePermission('masters.karigar.view.firm')],
        loadComponent: () =>
          import('./modules/masters/karigars.component').then(m => m.KarigarsComponent)
      },
      {
        path: 'masters/agents',
        canActivate: [requirePermission('masters.agent.view.firm')],
        loadComponent: () =>
          import('./modules/masters/agents.component').then(m => m.AgentsComponent)
      },
      {
        path: 'masters/godowns',
        canActivate: [requirePermission('masters.office.view.firm')],
        loadComponent: () =>
          import('./modules/masters/godowns.component').then(m => m.GodownsComponent)
      },
      {
        path: 'masters/customers',
        canActivate: [requirePermission('masters.customer.view.firm')],
        // `kind` component ka input hai — withComponentInputBinding se data se aata hai
        data: { kind: 'customer' },
        loadComponent: () =>
          import('./modules/masters/parties.component').then(m => m.PartiesComponent)
      },
      {
        path: 'masters/suppliers',
        canActivate: [requirePermission('masters.supplier.view.firm')],
        data: { kind: 'supplier' },
        loadComponent: () =>
          import('./modules/masters/parties.component').then(m => m.PartiesComponent)
      },
      {
        path: 'stock/items',
        canActivate: [requirePermission('stock.design.view.firm')],
        loadComponent: () =>
          import('./modules/stock/items.component').then(m => m.ItemsComponent)
      },
      {
        path: 'sales/order',
        canActivate: [requirePermission('sales.order.view.place')],
        loadComponent: () =>
          import('./modules/sales/sales-orders.component').then(m => m.SalesOrdersComponent)
      },
      {
        path: 'sales/challan',
        canActivate: [requirePermission('sales.challan.view.place')],
        loadComponent: () =>
          import('./modules/sales/challans.component').then(m => m.ChallansComponent)
      },
      {
        path: 'purchase/po',
        canActivate: [requirePermission('purchase.po.view.place')],
        loadComponent: () =>
          import('./modules/purchase/purchase-orders.component').then(m => m.PurchaseOrdersComponent)
      },
      {
        path: 'purchase/inward',
        canActivate: [requirePermission('purchase.inward.view.place')],
        loadComponent: () =>
          import('./modules/purchase/inwards.component').then(m => m.InwardsComponent)
      },
      {
        path: 'purchase/return',
        canActivate: [requirePermission('purchase.preturn.view.place')],
        loadComponent: () =>
          import('./modules/purchase/purchase-returns.component').then(m => m.PurchaseReturnsComponent)
      },
      {
        path: 'production/jobslip',
        canActivate: [requirePermission('production.jobslip.view.place')],
        loadComponent: () =>
          import('./modules/production/jobslips.component').then(m => m.JobSlipsComponent)
      },
      // Baaki screen aage — sidebar me "aage" likha dikhta hai.
      // Anjaan rasta bhi landing par hi jaye, kisi fix screen par nahi.
      { path: '**', pathMatch: 'full', canActivate: [landingRedirect], children: [] }
    ]
  },
  { path: '**', redirectTo: '' }
];
