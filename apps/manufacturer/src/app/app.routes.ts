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
          },
          {
            path: 'khata',
            canActivate: [requirePermission('production.khata.view.place')],
            loadComponent: () =>
              import('./modules/production/karigar-khata.component').then(m => m.KarigarKhataComponent)
          },
          {
            path: 'lots',
            canActivate: [requirePermission('production.jobslip.view.place')],
            loadComponent: () =>
              import('./modules/production/lots.component').then(m => m.LotsComponent)
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
          },
          {
            path: 'opening',
            canActivate: [requirePermission('stock.design.edit.firm')],
            loadComponent: () =>
              import('./modules/stock/opening-stock.component').then(m => m.OpeningStockComponent)
          },
          {
            path: 'transfer',
            canActivate: [requirePermission('stock.design.edit.firm')],
            loadComponent: () =>
              import('./modules/stock/stock-transfer.component').then(m => m.StockTransferComponent)
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
          },
          {
            path: 'team',
            canActivate: [requirePermission('masters.team.view.firm')],
            loadComponent: () =>
              import('./modules/team/team.component').then(m => m.TeamComponent)
          }
        ]
      },

      // ── FIRM & SEWA ──
      // Wallet, Plans, Credil, Party Chat, Complaint Box — ye paanch firm-level
      // hain, trading module se nahi bandhi. Screen aur API dono wahi jo agency
      // app me chalti hain. Permission nahi lagayi: manufacturer ko bhi wallet
      // bharna, plan badalna aur shikayat likhna aata hi hona chahiye.
      {
        path: 'firm', data: { section: 'firm' }, loadComponent: shell,
        children: [
          { path: '', pathMatch: 'full', canActivate: [sectionLanding], children: [] },
          {
            path: 'wallet',
            loadComponent: () =>
              import('./modules/wallet/wallet-page.component').then(m => m.WalletPageComponent)
          },
          {
            path: 'plans',
            loadComponent: () =>
              import('./modules/plans/plans-page.component').then(m => m.PlansPageComponent)
          },
          {
            path: 'credil',
            loadComponent: () =>
              import('./modules/credil/credil-page.component').then(m => m.CredilPageComponent)
          },
          {
            path: 'party-chat',
            loadComponent: () =>
              import('./modules/party-chat/party-chat.component').then(m => m.PartyChatComponent)
          },
          {
            path: 'complaints',
            loadComponent: () =>
              import('./modules/complaints/complaint-box.component').then(m => m.ComplaintBoxComponent)
          },
          {
            path: 'screen-fields',
            loadComponent: () =>
              import('./modules/settings/screen-fields.component').then(m => m.ScreenFieldsComponent)
          }
        ]
      },

      // ── HR · BAZAAR LINK · ONLINE DUKAN ──
      // Ye teen apne aap me poore module hain — andar apni hi navigation hai,
      // isliye SectionShell ki patti nahi lagayi (do patti ek saath ulti lagti).
      {
        path: 'hr',
        canActivate: [requirePermission('hr.attendance.viewown.self')],
        loadChildren: () => import('./modules/hr/hr.routes').then(m => m.hrRoutes)
      },
      {
        path: 'suppliers',
        canActivate: [requirePermission('suppliers.directory.view.firm')],
        loadChildren: () => import('./modules/suppliers/suppliers.routes').then(m => m.suppliersRoutes)
      },
      {
        path: 'dukan/admin',
        loadChildren: () => import('./modules/dukan/dukan.routes').then(m => m.dukanAdminRoutes)
      },

      // Anjaan rasta landing par hi jaye, kisi fix screen par nahi.
      { path: '**', pathMatch: 'full', canActivate: [landingRedirect], children: [] }
    ]
  },
  { path: '**', redirectTo: '' }
];
