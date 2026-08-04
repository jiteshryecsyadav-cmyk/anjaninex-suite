import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';

interface NavItem {
  label: string;
  icon: string;
  path?: string;
  /** Ye permission nahi hai to line dikhegi hi nahi. */
  perm?: string;
  /** Abhi bana nahi — dikhta hai par khulta nahi, taaki roadmap saaf rahe. */
  soon?: boolean;
}
interface NavGroup { title: string; items: NavItem[]; }

/**
 * Manufacturer app ka dhaancha. Sidebar prototype se hi utaara hai
 * (supplier/prototype/supplier-app.html) — wahi 6 group, wahi kram.
 *
 * Har line par permission bandhi hai: jo aadmi wo kaam nahi kar sakta usko
 * line dikhti hi nahi. Godown wale ko sidebar me sirf 4-5 line dikhengi,
 * malik ko poori.
 */
@Component({
  selector: 'mfg-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-screen overflow-hidden">

      <!-- ── SIDEBAR ── -->
      <aside class="bg-white border-r border-brand-line w-[260px] shrink-0
                    flex flex-col transition-all duration-200
                    max-md:fixed max-md:inset-y-0 max-md:z-40 max-md:shadow-2xl"
             [class.max-md:-translate-x-full]="!sideOpen()">

        <div class="p-4 border-b border-brand-line flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-brand-purple text-white
                      grid place-items-center font-extrabold">🏭</div>
          <div class="min-w-0">
            <div class="font-extrabold text-brand-purple truncate">
              {{ auth.user()?.firmName || 'Manufacturer' }}</div>
            <div class="text-[11px] text-brand-muted truncate">
              {{ auth.user()?.fullName }}</div>
          </div>
        </div>

        <nav class="flex-1 overflow-y-auto p-2">
          @for (g of visibleGroups(); track g.title) {
            <div class="px-3 pt-3 pb-1 text-[10px] font-extrabold uppercase
                        tracking-wider text-brand-muted">{{ g.title }}</div>
            @for (it of g.items; track it.label) {
              @if (it.soon) {
                <div class="flex items-center gap-2.5 px-3 py-2 rounded-xl
                            text-sm text-slate-400 cursor-not-allowed">
                  <span class="w-5 text-center">{{ it.icon }}</span>
                  <span class="flex-1">{{ it.label }}</span>
                  <span class="chip bg-slate-100 text-slate-400">aage</span>
                </div>
              } @else {
                <a [routerLink]="it.path"
                   routerLinkActive="bg-brand-purple text-white font-bold"
                   class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm
                          hover:bg-brand-bg transition">
                  <span class="w-5 text-center">{{ it.icon }}</span>
                  <span>{{ it.label }}</span>
                </a>
              }
            }
          }
        </nav>

        <button (click)="auth.logout()"
                class="m-3 text-xs text-brand-bad font-bold py-2 rounded-xl
                       hover:bg-red-50 transition">
          Log out
        </button>
      </aside>

      <!-- mobile par sidebar khule to peeche ka parda -->
      @if (sideOpen()) {
        <div class="fixed inset-0 bg-black/40 z-30 md:hidden"
             (click)="sideOpen.set(false)"></div>
      }

      <!-- ── CONTENT ── -->
      <div class="flex-1 flex flex-col min-w-0">
        <header class="bg-white border-b border-brand-line px-4 py-3
                       flex items-center gap-3 shrink-0">
          <button class="md:hidden text-2xl" (click)="sideOpen.set(!sideOpen())">☰</button>
          <h1 class="font-extrabold text-brand-purple text-lg flex-1 truncate">
            {{ title() }}</h1>
        </header>

        <main class="flex-1 overflow-y-auto p-4">
          <router-outlet />
        </main>
      </div>
    </div>
  `
})
export class ShellComponent {
  auth = inject(AuthService);
  sideOpen = signal(false);
  title = signal('Manufacturer');

  /** Prototype ke sidebar se — wahi 6 group, wahi kram. */
  private groups: NavGroup[] = [
    { title: '🧾 Sales & Delivery', items: [
      { label: 'Sales Order',      icon: '📄', path: '/sales/order',    perm: 'sales.order.view.place' },
      { label: 'Delivery Challan', icon: '🚚', path: '/sales/challan',  perm: 'sales.challan.view.place', soon: true },
      { label: 'Tax Invoice',      icon: '🧮', path: '/sales/invoice',  perm: 'sales.invoice.view.place', soon: true },
      { label: 'Sales Return',     icon: '↩️', path: '/sales/return',   perm: 'sales.sreturn.view.place', soon: true }
    ]},
    { title: '🛒 Purchase & Inwards', items: [
      { label: 'Purchase Order',   icon: '🛍️', path: '/purchase/po',     perm: 'purchase.po.view.place',     soon: true },
      { label: 'Purchase Inward',  icon: '📥', path: '/purchase/inward', perm: 'purchase.inward.view.place', soon: true },
      { label: 'Purchase Return',  icon: '↪️', path: '/purchase/return', perm: 'purchase.preturn.view.place',soon: true }
    ]},
    { title: '🏭 Manage Production', items: [
      { label: 'Job Slips',          icon: '✂️', path: '/production/jobslip', perm: 'production.jobslip.view.place', soon: true },
      { label: 'Karigar Khata Book', icon: '📒', path: '/production/khata',   perm: 'production.khata.view.place',   soon: true },
      { label: 'Track Jobslip Lots', icon: '🔍', path: '/production/lots',    perm: 'production.jobslip.view.place', soon: true }
    ]},
    { title: '📦 Manage Stock', items: [
      { label: 'Design / Material', icon: '🎨', path: '/stock/items',    perm: 'stock.design.view.firm', soon: true },
      { label: 'Opening Stock',     icon: '🏁', path: '/stock/opening',  perm: 'stock.design.edit.firm', soon: true },
      { label: 'Stock Transfer',    icon: '🔀', path: '/stock/transfer', perm: 'stock.design.edit.firm', soon: true }
    ]},
    { title: '👥 Masters', items: [
      { label: 'Karigars',          icon: '🧑‍🏭', path: '/masters/karigars', perm: 'masters.karigar.view.firm' },
      { label: 'Customers',         icon: '🏢', path: '/masters/customers', perm: 'masters.customer.view.firm', soon: true },
      { label: 'Suppliers',         icon: '🚛', path: '/masters/suppliers', perm: 'masters.supplier.view.firm', soon: true },
      { label: 'Agents',            icon: '🤝', path: '/masters/agents',    perm: 'masters.agent.view.firm',    soon: true },
      { label: 'Offices / Godowns', icon: '🏬', path: '/masters/godowns',   perm: 'masters.office.view.firm',   soon: true },
      { label: 'Team & Role',       icon: '🧑‍💼', path: '/masters/team',     perm: 'masters.team.view.firm',     soon: true }
    ]},
    { title: '📊 Reports', items: [
      { label: 'Bikri ki report', icon: '📈', path: '/reports/sales',       perm: 'reports.sales.view.firm',       soon: true },
      { label: 'Stock report',    icon: '📦', path: '/reports/stock',       perm: 'reports.stock.view.firm',       soon: true },
      { label: 'Bakaya / udhaar', icon: '💰', path: '/reports/outstanding', perm: 'reports.outstanding.view.firm', soon: true }
    ]}
  ];

  /**
   * Jo line ki permission nahi, wo hatti hai — aur agar poore group me ek bhi
   * line na bache to group ka heading bhi nahi dikhta. Warna "Masters" likha
   * dikhta aur neeche kuch nahi hota.
   */
  visibleGroups = computed<NavGroup[]>(() =>
    this.groups
      .map(g => ({ ...g, items: g.items.filter(i => !i.perm || this.auth.can(i.perm)) }))
      .filter(g => g.items.length > 0)
  );
}
