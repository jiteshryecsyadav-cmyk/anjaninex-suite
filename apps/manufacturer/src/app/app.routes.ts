import { Routes } from '@angular/router';
import { authGuard, requirePermission } from './core/auth.guard';
import { landingRedirect, sectionLanding } from './core/landing.guard';

/**
 * Har screen lazy hai — pehli baar khulne par hi download hoti hai. Manufacturer
 * app phone par bhi chalega, isliye pehla bundle chhota rakhna zaroori hai.
 *
 * Dhaancha: har hissa (sales, purchase, …) ek SectionShell ke andar hai. Wahi
 * upar horizontal patti banata hai aur `data.section` se apne button uthata
 * hai — list [core/nav.ts] me hai. Sidebar bhi wahi list padhta hai.
 */
const shell = () =>
  import('./layout/section-shell.component').then(m => m.SectionShellComponent);

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

      // ── DASHBOARD ── (koi permission nahi — har kisi ko khulta hai)
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./modules/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },

      // ── SALES ──
      {
        path: 'sales', data: { section: 'sales' }, loadComponent: shell,
        children: [
          { path: '', pathMatch: 'full', canActivate: [sectionLanding], children: [] },
          {
            path: 'order',
            canActivate: [requirePermission('sales.order.view.place')],
            loadComponent: () =>
              import('./modules/sales/sales-orders.component').then(m => m.SalesOrdersComponent)
          },
          {
            path: 'challan',
            canActivate: [requirePermission('sales.challan.view.place')],
            loadComponent: () =>
              import('./modules/sales/challans.component').then(m => m.ChallansComponent)
          },
          {
            path: 'invoice',
            canActivate: [requirePermission('sales.invoice.view.place')],
            loadComponent: () =>
              import('./modules/sales/invoices.component').then(m => m.InvoicesComponent)
          },
          {
            path: 'return',
            canActivate: [requirePermission('sales.sreturn.view.place')],
            loadComponent: () =>
              import('./modules/sales/sales-returns.component').then(m => m.SalesReturnsComponent)
          }
        ]
      },

      // ── PURCHASE ──
      {
        path: 'purchase', data: { section: 'purchase' }, loadComponent: shell,
        children: [
          { path: '', pathMatch: 'full', canActivate: [sectionLanding], children: [] },
          {
            path: 'po',
            canActivate: [requirePermission('purchase.po.view.place')],
            loadComponent: () =>
              import('./modules/purchase/purchase-orders.component').then(m => m.PurchaseOrdersComponent)
          },
          {
            path: 'inward',
            canActivate: [requirePermission('purchase.inward.view.place')],
            loadComponent: () =>
              import('./modules/purchase/inwards.component').then(m => m.InwardsComponent)
          },
          {
            path: 'return',
            canActivate: [requirePermission('purchase.preturn.view.place')],
            loadComponent: () =>
              import('./modules/purchase/purchase-returns.component').then(m => m.PurchaseReturnsComponent)
          }
        ]
      },

      // ── PRODUCTION ──
      {
        path: 'production', data: { section: 'production' }, loadComponent: shell,
        children: [
          { path: '', pathMatch: 'full', canActivate: [sectionLanding], children: [] },
          {
            path: 'jobslip',
            canActivate: [requirePermission('production.jobslip.view.place')],
            loadComponent: () =>
              import('./modules/production/jobslips.component').then(m => m.JobSlipsComponent)
          }
        ]
      },

      // ── STOCK ──
      {
        path: 'stock', data: { section: 'stock' }, loadComponent: shell,
        children: [
          { path: '', pathMatch: 'full', canActivate: [sectionLanding], children: [] },
          {
            path: 'items',
            canActivate: [requirePermission('stock.design.view.firm')],
            loadComponent: () =>
              import('./modules/stock/items.component').then(m => m.ItemsComponent)
          }
        ]
      },

      // ── MASTERS ──
      {
        path: 'masters', data: { section: 'masters' }, loadComponent: shell,
        children: [
          { path: '', pathMatch: 'full', canActivate: [sectionLanding], children: [] },
          {
            path: 'karigars',
            canActivate: [requirePermission('masters.karigar.view.firm')],
            loadComponent: () =>
              import('./modules/masters/karigars.component').then(m => m.KarigarsComponent)
          },
          {
            path: 'customers',
            canActivate: [requirePermission('masters.customer.view.firm')],
            // `kind` component ka input hai — withComponentInputBinding se data se aata hai
            data: { kind: 'customer' },
            loadComponent: () =>
              import('./modules/masters/parties.component').then(m => m.PartiesComponent)
          },
          {
            path: 'suppliers',
            canActivate: [requirePermission('masters.supplier.view.firm')],
            data: { kind: 'supplier' },
            loadComponent: () =>
              import('./modules/masters/parties.component').then(m => m.PartiesComponent)
          },
          {
            path: 'agents',
            canActivate: [requirePermission('masters.agent.view.firm')],
            loadComponent: () =>
              import('./modules/masters/agents.component').then(m => m.AgentsComponent)
          },
          {
            path: 'godowns',
            canActivate: [requirePermission('masters.office.view.firm')],
            loadComponent: () =>
              import('./modules/masters/godowns.component').then(m => m.GodownsComponent)
          }
        ]
      },

      // Anjaan rasta landing par hi jaye, kisi fix screen par nahi.
      { path: '**', pathMatch: 'full', canActivate: [landingRedirect], children: [] }
    ]
  },
  { path: '**', redirectTo: '' }
];
