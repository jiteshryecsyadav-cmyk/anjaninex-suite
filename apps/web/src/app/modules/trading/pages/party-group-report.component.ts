import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TradingService, BillListItem } from '../services/trading.service';

interface Member { id: string; name: string; city: string; group: string; outstanding: number; }
interface GRow {
  key: string; name: string;
  members: Member[];
  bills: BillListItem[];
  outstanding: number;
  billAmt: number; paid: number; unpaid: number;
}

// GROUP REPORT (sister firms):
// - Group Wise: har group ki firms + outstanding + bills. Expand = firm breakup + bill-wise detail
//   (Supplier, Buyer, Supp. Bill No, Items, Net, Paid, Unpaid).
// - City Wise: wahi data city ke hisaab se (sirf group wali firms).
@Component({
  selector: 'app-party-group-report',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
  <div class="p-6 max-w-7xl mx-auto">
    <!-- Reports sub-nav (Reports section jaisa hi) -->
    <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
      <a routerLink="/reports/dashboard" class="pgtab">📊 Dashboard</a>
      <a routerLink="/reports/sales-register" class="pgtab">Sales Register</a>
      <a routerLink="/reports/outstanding" class="pgtab">Outstanding</a>
      <a routerLink="/reports/supplier-buyer" class="pgtab">Supplier vs Buyer</a>
      <a routerLink="/reports/party-outstanding" class="pgtab">Aging</a>
      <a routerLink="/reports/gst" class="pgtab">GST</a>
      <a routerLink="/reports/gr" class="pgtab">↩️ GR Report</a>
      <a routerLink="/reports/party-wise" class="pgtab">👥 Party Wise</a>
      <a routerLink="/reports/groups" routerLinkActive="pgtab-on" class="pgtab">👨‍👩‍👦 Groups</a>
      <a routerLink="/reports/activity" class="pgtab">🕵️ Activity Log</a>
    </div>

    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div>
        <h2 class="font-display font-black text-2xl text-[#5c1a8b]">Group Report (Sister Firms)</h2>
        <p class="text-sm text-[#6b3fa0]">Group ki saari firms, outstanding aur bill-wise detail — expand karke dekho.</p>
      </div>
      <a routerLink="/core-master/groups" class="px-3 py-1.5 text-sm border border-[#ddc8f5] rounded hover:bg-purple-50">Manage Groups</a>
    </div>

    <!-- Tabs: Group Wise | City Wise -->
    <div class="flex gap-2 mb-4">
      <button (click)="tab.set('group')"
        [class]="tab() === 'group' ? 'bg-[#5c1a8b] text-white' : 'bg-white text-[#5c1a8b] border border-[#ddc8f5]'"
        class="px-4 py-1.5 rounded-full text-sm font-bold">👥 Group Wise</button>
      <button (click)="tab.set('city')"
        [class]="tab() === 'city' ? 'bg-[#5c1a8b] text-white' : 'bg-white text-[#5c1a8b] border border-[#ddc8f5]'"
        class="px-4 py-1.5 rounded-full text-sm font-bold">📍 City Wise</button>
    </div>

    @if (loading()) { <div class="p-8 text-center text-gray-500">Loading...</div> }
    @else {
      <!-- Summary cards -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div class="card text-center"><div class="text-lg font-black text-[#5c1a8b]">{{ rows().length }}</div><div class="text-xs uppercase font-bold text-gray-500">{{ tab() === 'group' ? 'Groups' : 'Cities' }}</div></div>
        <div class="card text-center"><div class="text-lg font-black">{{ sumFirms() }}</div><div class="text-xs uppercase font-bold text-gray-500">Firms</div></div>
        <div class="card text-center"><div class="text-lg font-black">Rs {{ money(sum('billAmt')) }}</div><div class="text-xs uppercase font-bold text-gray-500">Bill Amt</div></div>
        <div class="card text-center"><div class="text-lg font-black text-green-600">Rs {{ money(sum('paid')) }}</div><div class="text-xs uppercase font-bold text-gray-500">Paid</div></div>
        <div class="card text-center"><div class="text-lg font-black text-red-600">Rs {{ money(sum('unpaid')) }}</div><div class="text-xs uppercase font-bold text-gray-500">Unpaid</div></div>
      </div>

      <div class="card p-0 overflow-x-auto mb-6">
        <table class="w-full text-sm">
          <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
            <tr>
              <th class="px-3 py-2 text-left">{{ tab() === 'group' ? 'Group' : 'City' }} (click = detail)</th>
              <th class="px-3 py-2 text-center">Firms</th>
              <th class="px-3 py-2 text-center">Bills</th>
              <th class="px-3 py-2 text-right">Bill Amt</th>
              <th class="px-3 py-2 text-right">Paid</th>
              <th class="px-3 py-2 text-right">Unpaid</th>
              <th class="px-3 py-2 text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            @for (g of rows(); track g.key) {
              <tr class="border-t hover:bg-[#faf5ff] cursor-pointer" (click)="toggle(g)">
                <td class="px-3 py-2 font-bold text-[#5c1a8b]">{{ isOpen(g.key) ? '▾' : '▸' }} {{ g.name }}</td>
                <td class="px-3 py-2 text-center">{{ g.members.length }}</td>
                <td class="px-3 py-2 text-center">{{ g.bills.length }}</td>
                <td class="px-3 py-2 text-right font-mono">Rs {{ money(g.billAmt) }}</td>
                <td class="px-3 py-2 text-right font-mono text-green-700">Rs {{ money(g.paid) }}</td>
                <td class="px-3 py-2 text-right font-mono" [class.text-red-600]="g.unpaid > 0">Rs {{ money(g.unpaid) }}</td>
                <td class="px-3 py-2 text-right font-mono" [class.text-red-600]="g.outstanding > 0">Rs {{ money(g.outstanding) }}</td>
              </tr>
              @if (isOpen(g.key)) {
                <tr class="bg-[#faf7ff]">
                  <td colspan="7" class="px-5 py-3">
                    <!-- Firm breakup -->
                    <div class="text-xs font-bold text-[#6b3fa0] mb-1">🏢 Firm-wise breakup:</div>
                    <table class="w-full text-xs mb-3">
                      @for (m of g.members; track m.id) {
                        <tr class="border-b border-[#eee]">
                          <td class="py-1 font-semibold">{{ m.name }}</td>
                          <td class="py-1 text-gray-500">📍 {{ m.city || '—' }}</td>
                          @if (tab() === 'city') { <td class="py-1"><span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{{ m.group }}</span></td> }
                          <td class="py-1 text-right font-mono" [class.text-red-600]="m.outstanding > 0">Rs {{ money(m.outstanding) }}</td>
                        </tr>
                      }
                      <tr class="font-bold text-[#5c1a8b]">
                        <td class="py-1" [attr.colspan]="tab() === 'city' ? 3 : 2">TOTAL ({{ g.members.length }} firms)</td>
                        <td class="py-1 text-right font-mono">Rs {{ money(g.outstanding) }}</td>
                      </tr>
                    </table>

                    <!-- Bill-wise detail -->
                    <div class="text-xs font-bold text-[#6b3fa0] mb-1">📄 Bills ({{ g.bills.length }}):</div>
                    @if (g.bills.length === 0) {
                      <p class="text-xs text-gray-400">Is {{ tab() === 'group' ? 'group' : 'city' }} ki firms ke koi bills nahi.</p>
                    } @else {
                      <table class="w-full text-xs bg-white border border-[#eee]">
                        <thead>
                          <tr class="bg-[#f7f2ff] text-[#5c1a8b] uppercase">
                            <th class="px-2 py-1.5 text-left">Supplier</th>
                            <th class="px-2 py-1.5 text-left">Buyer</th>
                            <th class="px-2 py-1.5 text-left">Supp. Bill</th>
                            <th class="px-2 py-1.5 text-left">Items</th>
                            <th class="px-2 py-1.5 text-right">Net Amt</th>
                            <th class="px-2 py-1.5 text-right">Paid</th>
                            <th class="px-2 py-1.5 text-right">Unpaid</th>
                            <th class="px-2 py-1.5 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (b of g.bills; track b.id) {
                            <tr class="border-t border-[#f3f4f6]">
                              <td class="px-2 py-1 font-semibold">{{ b.partyName }}</td>
                              <td class="px-2 py-1">{{ b.buyerName || '—' }}</td>
                              <td class="px-2 py-1 font-mono">{{ b.supplierBillNo || b.billNo }}</td>
                              <td class="px-2 py-1 text-gray-600">{{ items(b.id) }}</td>
                              <td class="px-2 py-1 text-right font-mono">{{ money(b.total) }}</td>
                              <td class="px-2 py-1 text-right font-mono text-green-700">{{ money(b.paidAmount) }}</td>
                              <td class="px-2 py-1 text-right font-mono" [class.text-red-600]="b.total - b.paidAmount > 0">{{ money(b.total - b.paidAmount) }}</td>
                              <td class="px-2 py-1 text-center">
                                <span class="px-2 py-0.5 rounded-full font-bold"
                                      [class]="b.status === 'paid' ? 'bg-green-100 text-green-700' : (b.paidAmount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')">
                                  {{ b.status === 'paid' ? 'Paid' : (b.paidAmount > 0 ? 'Partial' : 'Unpaid') }}
                                </span>
                              </td>
                            </tr>
                          }
                          <tr class="font-bold bg-[#faf7f0]">
                            <td colspan="4" class="px-2 py-1 text-right">Subtotal</td>
                            <td class="px-2 py-1 text-right font-mono">{{ money(g.billAmt) }}</td>
                            <td class="px-2 py-1 text-right font-mono text-green-700">{{ money(g.paid) }}</td>
                            <td class="px-2 py-1 text-right font-mono text-red-600">{{ money(g.unpaid) }}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    }
                  </td>
                </tr>
              }
            }
            @if (rows().length === 0) { <tr><td colspan="7" class="p-6 text-center text-gray-400">Koi group nahi. Core Master &gt; Groups me banao.</td></tr> }
          </tbody>
        </table>
      </div>

      @if (tab() === 'group') {
        <h3 class="font-bold text-[#5c1a8b] mb-2">Firm Pending Orders ({{ pendingOrders().length }})</h3>
        <p class="text-xs text-gray-500 mb-2">Group par bane orders jinka bill abhi nahi bana - bill par actual firm chuni jani hai.</p>
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
    }
  </div>
  `,
  styles: [`
    .pgtab { padding: 8px 16px; font-size: 13px; font-weight: 600; color: #6b7280;
      border-bottom: 2px solid transparent; text-decoration: none; }
    .pgtab:hover { color: #5c1a8b; }
    .pgtab-on { border-color: #5c1a8b; color: #5c1a8b; }
  `],
})
export class PartyGroupReportComponent {
  private svc = inject(TradingService);
  parties = signal<any[]>([]);
  orders = signal<any[]>([]);
  bills = signal<BillListItem[]>([]);
  loading = signal(true);
  tab = signal<'group' | 'city'>('group');
  private opened = signal<Set<string>>(new Set<string>());
  private c = 0;
  private done() { if (++this.c >= 3) this.loading.set(false); }

  constructor() {
    this.svc.listParties().subscribe({ next: p => { this.parties.set(p || []); this.done(); }, error: () => this.done() });
    (this.svc as any).listOrders({ size: 500 }).subscribe({
      next: (r: any) => { this.orders.set(r?.items ?? r ?? []); this.done(); },
      error: () => this.done()
    });
    this.svc.listBills({ size: 1000 }).subscribe({
      next: (r: any) => { this.bills.set((r?.items ?? []).filter((b: any) => !b.isDeleted)); this.done(); },
      error: () => this.done()
    });
  }

  toggle(g: GRow) {
    const s = new Set(this.opened());
    if (s.has(g.key)) { s.delete(g.key); }
    else { s.add(g.key); this.loadItems(g); }
    this.opened.set(s);
  }
  isOpen(k: string) { return this.opened().has(k); }

  // Sirf GROUP wali firms is report me aati hain
  private groupMembers = computed<Member[]>(() =>
    this.parties()
      .filter((p: any) => p.groupName)
      .map((p: any) => ({
        id: p.id, name: p.displayName, city: p.city || '',
        group: p.groupName, outstanding: p.outstandingBalance || 0
      })));

  rows = computed<GRow[]>(() => {
    const byKey = new Map<string, GRow>();
    const keyOf = (m: Member) => this.tab() === 'group' ? m.group : (m.city || '— (city nahi)');
    for (const m of this.groupMembers()) {
      const k = keyOf(m);
      if (!byKey.has(k)) byKey.set(k, { key: k, name: k, members: [], bills: [], outstanding: 0, billAmt: 0, paid: 0, unpaid: 0 });
      const row = byKey.get(k)!;
      row.members.push(m);
      row.outstanding += m.outstanding;
    }
    // Bills — member firm supplier ho (partyId match)
    for (const row of byKey.values()) {
      const ids = new Set(row.members.map(m => m.id));
      row.bills = this.bills().filter(b => ids.has(b.partyId));
      row.billAmt = row.bills.reduce((s, b) => s + (b.total || 0), 0);
      row.paid = row.bills.reduce((s, b) => s + (b.paidAmount || 0), 0);
      row.unpaid = row.billAmt - row.paid;
      row.members.sort((a, b) => b.outstanding - a.outstanding);
      row.bills.sort((a, b) => (b.total - b.paidAmount) - (a.total - a.paidAmount));
    }
    return [...byKey.values()].sort((a, b) => b.unpaid - a.unpaid);
  });

  sum(f: 'billAmt' | 'paid' | 'unpaid'): number { return this.rows().reduce((s, r) => s + r[f], 0); }
  sumFirms(): number { return this.rows().reduce((s, r) => s + r.members.length, 0); }

  // Items lazy-load: expand par har bill ke items ek baar fetch hoke cache
  private itemsCache = signal<Record<string, string>>({});
  items(billId: string): string { return this.itemsCache()[billId] ?? '⏳'; }
  private loadItems(g: GRow) {
    const missing = g.bills.filter(b => this.itemsCache()[b.id] === undefined).slice(0, 40);
    for (const b of missing) {
      this.itemsCache.update(m => ({ ...m, [b.id]: '⏳' }));
      this.svc.getBill(b.id).subscribe({
        next: (d: any) => {
          const names = (d.lines || []).map((l: any) => l.itemName).filter(Boolean);
          const text = names.length === 0 ? '—'
            : names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');
          this.itemsCache.update(m => ({ ...m, [b.id]: text }));
        },
        error: () => this.itemsCache.update(m => ({ ...m, [b.id]: '—' }))
      });
    }
  }

  pendingOrders = computed(() =>
    this.orders().filter((o: any) => o.supplierGroupName && o.status !== 'billed' && o.status !== 'cancelled'));

  money(n: number) { return (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
}
