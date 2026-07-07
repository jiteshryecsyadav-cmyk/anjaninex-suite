import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TradingService } from '../services/trading.service';

interface GroupRow { name: string; firms: number; outstanding: number; orders: number; orderAmt: number; pending: number; }

// Group Report (sister firms): har group ka total - firms, outstanding, orders + firm-pending list.
@Component({
  selector: 'app-party-group-report',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div>
        <h2 class="font-display font-black text-2xl text-[#5c1a8b]">Group Report (Sister Firms)</h2>
        <p class="text-sm text-[#6b3fa0]">Har group ka total - saari sister firms mila ke. Aur "firm pending" orders.</p>
      </div>
      <a routerLink="/core-master/groups" class="px-3 py-1.5 text-sm border border-[#ddc8f5] rounded hover:bg-purple-50">Manage Groups</a>
    </div>

    @if (loading()) { <div class="p-8 text-center text-gray-500">Loading...</div> }
    @else {
      <div class="card p-0 overflow-x-auto mb-6">
        <table class="w-full text-sm">
          <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
            <tr>
              <th class="px-3 py-2 text-left">Group</th>
              <th class="px-3 py-2 text-center">Firms</th>
              <th class="px-3 py-2 text-right">Outstanding</th>
              <th class="px-3 py-2 text-center">Orders</th>
              <th class="px-3 py-2 text-right">Order Amount</th>
              <th class="px-3 py-2 text-center">Firm Pending</th>
            </tr>
          </thead>
          <tbody>
            @for (g of groups(); track g.name) {
              <tr class="border-t hover:bg-[#faf5ff]">
                <td class="px-3 py-2 font-bold text-[#5c1a8b]">{{ g.name }}</td>
                <td class="px-3 py-2 text-center">{{ g.firms }}</td>
                <td class="px-3 py-2 text-right font-mono" [class.text-red-600]="g.outstanding > 0">Rs {{ money(g.outstanding) }}</td>
                <td class="px-3 py-2 text-center">{{ g.orders }}</td>
                <td class="px-3 py-2 text-right font-mono">Rs {{ money(g.orderAmt) }}</td>
                <td class="px-3 py-2 text-center">
                  @if (g.pending > 0) { <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">{{ g.pending }}</span> }
                  @else { <span class="text-gray-300">0</span> }
                </td>
              </tr>
            }
            @if (groups().length === 0) { <tr><td colspan="6" class="p-6 text-center text-gray-400">Koi group nahi. Core Master &gt; Groups me banao.</td></tr> }
          </tbody>
        </table>
      </div>

      <h3 class="font-bold text-[#5c1a8b] mb-2">Firm Pending Orders ({{ pendingOrders().length }})</h3>
      <p class="text-xs text-gray-500 mb-2">Ye orders group par bane hain - inke bill par actual firm chuni jani hai.</p>
      <div class="card p-0 overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-[#fff3e0] text-amber-800 uppercase text-xs">
            <tr>
              <th class="px-3 py-2 text-left">Order No</th>
              <th class="px-3 py-2 text-left">Group</th>
              <th class="px-3 py-2 text-left">Abhi ki firm</th>
              <th class="px-3 py-2 text-left">Buyer</th>
              <th class="px-3 py-2 text-right">Amount</th>
              <th class="px-3 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            @for (o of pendingOrders(); track o.id) {
              <tr class="border-t hover:bg-[#fffbf3]">
                <td class="px-3 py-2 font-semibold">{{ o.orderNo }}</td>
                <td class="px-3 py-2"><span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">{{ o.supplierGroupName }}</span></td>
                <td class="px-3 py-2">{{ o.partyName }}</td>
                <td class="px-3 py-2 text-gray-600">{{ o.buyerName || '-' }}</td>
                <td class="px-3 py-2 text-right font-mono">Rs {{ money(o.total) }}</td>
                <td class="px-3 py-2 text-center text-xs">{{ o.status }}</td>
              </tr>
            }
            @if (pendingOrders().length === 0) { <tr><td colspan="6" class="p-6 text-center text-gray-400">Koi firm-pending order nahi.</td></tr> }
          </tbody>
        </table>
      </div>
    }
  </div>
  `,
})
export class PartyGroupReportComponent {
  private svc = inject(TradingService);
  parties = signal<any[]>([]);
  orders = signal<any[]>([]);
  loading = signal(true);
  private c = 0;
  private done() { if (++this.c >= 2) this.loading.set(false); }

  constructor() {
    this.svc.listParties().subscribe({ next: p => { this.parties.set(p || []); this.done(); }, error: () => this.done() });
    (this.svc as any).listOrders({ size: 500 }).subscribe({
      next: (r: any) => { this.orders.set(r?.items ?? r ?? []); this.done(); },
      error: () => this.done()
    });
  }

  groups = computed<GroupRow[]>(() => {
    const map = new Map<string, GroupRow>();
    const get = (g: string) => {
      if (!map.has(g)) map.set(g, { name: g, firms: 0, outstanding: 0, orders: 0, orderAmt: 0, pending: 0 });
      return map.get(g)!;
    };
    for (const p of this.parties()) {
      const g = (p as any).groupName;
      if (!g) continue;
      const row = get(g);
      row.firms++;
      row.outstanding += (p.outstandingBalance || 0);
    }
    for (const o of this.orders()) {
      const g = (o as any).supplierGroupName;
      if (!g) continue;
      const row = get(g);
      row.orders++;
      row.orderAmt += (o.total || 0);
      if (o.status !== 'billed' && o.status !== 'cancelled') row.pending++;
    }
    return [...map.values()].sort((a, b) => b.orderAmt - a.orderAmt);
  });

  pendingOrders = computed(() =>
    this.orders().filter((o: any) => o.supplierGroupName && o.status !== 'billed' && o.status !== 'cancelled'));

  money(n: number) { return (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
}
