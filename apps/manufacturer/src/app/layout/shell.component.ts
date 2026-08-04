import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../core/auth.service';
import { environment } from '../../environments/environment';

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

      <!-- ── SIDEBAR — agency app jaisa navy ── -->
      <aside class="bg-anjaninex-navy text-white w-56 shrink-0 flex flex-col
                    overflow-y-auto overflow-x-hidden transition-all duration-200
                    max-md:fixed max-md:inset-y-0 max-md:z-40 max-md:shadow-2xl"
             [class.max-md:-translate-x-full]="!sideOpen()">

        <nav class="flex-1 p-2 flex flex-col gap-1">
          @for (g of visibleGroups(); track g.title) {
            <div class="px-3 pt-3 pb-1 text-[10px] font-extrabold uppercase
                        tracking-wider text-white/40">{{ g.title }}</div>
            @for (it of g.items; track it.label) {
              @if (it.soon) {
                <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                            font-semibold text-white/30 cursor-not-allowed">
                  <span class="w-5 text-center">{{ it.icon }}</span>
                  <span class="flex-1">{{ it.label }}</span>
                  <span class="chip bg-white/10 text-white/40">aage</span>
                </div>
              } @else {
                <a [routerLink]="it.path"
                   routerLinkActive="!bg-anjaninex-red !text-white"
                   class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                          font-semibold text-white/75 hover:text-white hover:bg-white/10">
                  <span class="w-5 text-center">{{ it.icon }}</span>
                  <span>{{ it.label }}</span>
                </a>
              }
            }
          }
        </nav>

        <button (click)="auth.logout()"
                class="m-3 text-xs font-bold text-white/70 hover:text-white
                       hover:bg-white/10 py-2 rounded-lg transition">
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

        <!-- Header — navy, firm ka naam beech me (agency jaisa) -->
        <header class="bg-anjaninex-navy text-white shadow-lg z-40 shrink-0">
          <div class="flex items-center gap-2 px-4 py-2">
            <button (click)="sideOpen.set(!sideOpen())"
                    class="p-1.5 hover:bg-white/10 rounded text-xl leading-none"
                    title="Menu chhupao / dikhao">☰</button>

            <div class="flex-1"></div>
            <div class="font-display leading-none text-center whitespace-nowrap">
              <div class="font-black text-sm text-white">
                {{ auth.user()?.firmName || 'Manufacturer' }}</div>
              <div class="text-[10px] font-semibold tracking-wide text-white/60">
                Vyapaar Setu · Manufacturer</div>
            </div>
            <div class="flex-1"></div>

            <div class="h-8 px-3 bg-white/10 rounded text-xs flex items-center gap-1.5">
              <span class="w-5 h-5 rounded-full bg-anjaninex-red grid place-items-center
                           text-[10px] font-black">{{ initial() }}</span>
              {{ auth.user()?.fullName }}
            </div>
          </div>
        </header>

        <main class="flex-1 overflow-y-auto p-6 bg-anjaninex-cream">
          <router-outlet />
        </main>

        <footer class="bg-white border-t border-[color:var(--ax-border)]
                       px-4 py-1.5 text-[11px] text-gray-500 flex gap-3 shrink-0">
          <span class="font-mono">Manufacturer</span>
          <span class="flex-1"></span>
          <span>Vyapaar Setu — an Anjaninex product</span>
        </footer>
      </div>
    </div>
  `
})
export class ShellComponent {
  auth = inject(AuthService);
  sideOpen = signal(false);

  /** Header ke gol nishaan me pehla akshar — agency app me bhi wahi hai. */
  initial = computed(() =>
    (this.auth.user()?.fullName ?? '?').trim().charAt(0).toUpperCase());

  constructor() {
    // Firm ka naam login ke jawab me nahi aata (wo sirf user ki baat karta hai).
    // Header me "Manufacturer" likha rehta to aadmi ko pata hi nahi chalta ki
    // wo kis firm me baitha hai — khaas kar jiski do firms hain.
    if (!this.auth.user()?.firmName) {
      inject(HttpClient)
        .get<{ firmName?: string }>(`${environment.apiUrl}/api/me/modules`)
        .subscribe({
          next: r => { if (r?.firmName) this.auth.setFirmName(r.firmName); },
          error: () => { /* naam na mile to header 'Manufacturer' hi dikhata rahe */ }
        });
    }
  }

  /** Prototype ke sidebar se — wahi 6 group, wahi kram. */
  private groups: NavGroup[] = [
    { title: '🧾 Sales & Delivery', items: [
      { label: 'Sales Order',      icon: '📄', path: '/sales/order',    perm: 'sales.order.view.place' },
      { label: 'Delivery Challan', icon: '🚚', path: '/sales/challan',  perm: 'sales.challan.view.place' },
      { label: 'Tax Invoice',      icon: '🧮', path: '/sales/invoice',  perm: 'sales.invoice.view.place' },
      { label: 'Sales Return',     icon: '↩️', path: '/sales/return',   perm: 'sales.sreturn.view.place', soon: true }
    ]},
    { title: '🛒 Purchase & Inwards', items: [
      { label: 'Purchase Order',   icon: '🛍️', path: '/purchase/po',     perm: 'purchase.po.view.place' },
      { label: 'Purchase Inward',  icon: '📥', path: '/purchase/inward', perm: 'purchase.inward.view.place' },
      { label: 'Purchase Return',  icon: '↪️', path: '/purchase/return', perm: 'purchase.preturn.view.place' }
    ]},
    { title: '🏭 Manage Production', items: [
      { label: 'Job Slips',          icon: '✂️', path: '/production/jobslip', perm: 'production.jobslip.view.place' },
      { label: 'Karigar Khata Book', icon: '📒', path: '/production/khata',   perm: 'production.khata.view.place',   soon: true },
      { label: 'Track Jobslip Lots', icon: '🔍', path: '/production/lots',    perm: 'production.jobslip.view.place', soon: true }
    ]},
    { title: '📦 Manage Stock', items: [
      { label: 'Design / Material', icon: '🎨', path: '/stock/items',    perm: 'stock.design.view.firm' },
      { label: 'Opening Stock',     icon: '🏁', path: '/stock/opening',  perm: 'stock.design.edit.firm', soon: true },
      { label: 'Stock Transfer',    icon: '🔀', path: '/stock/transfer', perm: 'stock.design.edit.firm', soon: true }
    ]},
    { title: '👥 Masters', items: [
      { label: 'Karigars',          icon: '🧑‍🏭', path: '/masters/karigars', perm: 'masters.karigar.view.firm' },
      { label: 'Customers',         icon: '🏢', path: '/masters/customers', perm: 'masters.customer.view.firm' },
      { label: 'Suppliers',         icon: '🚛', path: '/masters/suppliers', perm: 'masters.supplier.view.firm' },
      { label: 'Agents',            icon: '🤝', path: '/masters/agents',    perm: 'masters.agent.view.firm' },
      { label: 'Offices / Godowns', icon: '🏬', path: '/masters/godowns',   perm: 'masters.office.view.firm' },
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
