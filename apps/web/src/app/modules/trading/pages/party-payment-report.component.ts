import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TradingService, BillListItem } from '../services/trading.service';

// Supplier vs Buyer report: date range me Paid / Unpaid / Partly-paid.
// Buyer tab = sales bills (paisa aana), Supplier tab = purchase bills (paisa dena).
@Component({
  selector: 'app-party-payment-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="p-6 max-w-7xl mx-auto">
    <div class="mb-4">
      <h2 class="font-display font-black text-2xl text-[#5c1a8b]">Supplier vs Buyer Report</h2>
      <p class="text-sm text-[#6b3fa0]">Date range me kis buyer/supplier ka kitna Paid / Unpaid / Partly-paid.</p>
    </div>

    <!-- Filters -->
    <div class="card mb-4 flex flex-wrap gap-3 items-end">
      <div><label class="text-xs text-gray-500 block">From</label><input type="date" [(ngModel)]="from" (change)="load()" class="input w-40"></div>
      <div><label class="text-xs text-gray-500 block">To</label><input type="date" [(ngModel)]="to" (change)="load()" class="input w-40"></div>
      <div><label class="text-xs text-gray-500 block">{{ tab()==='buyer' ? 'Buyer' : 'Supplier' }} (naam / GST search)</label>
        <input [ngModel]="partySearch()" (ngModelChange)="partySearch.set($event)" list="pbPartyList" placeholder="Sab - ya naam/GST type karo" class="input w-64">
        <datalist id="pbPartyList">@for (p of partyOptions(); track p) { <option [value]="p"></option> }</datalist>
      </div>
      <button (click)="load()" class="px-5 py-1.5 text-sm font-bold text-white bg-[#5c1a8b] rounded">Get</button>
      <div class="flex-1"></div>
      <div class="flex gap-1">
        <button (click)="setTab('buyer')" [class]="tab()==='buyer' ? 'bg-[#5c1a8b] text-white' : 'bg-white text-[#5c1a8b]'" class="px-4 py-1.5 text-sm font-bold border border-[#ddc8f5] rounded-l">Buyer (Aana)</button>
        <button (click)="setTab('supplier')" [class]="tab()==='supplier' ? 'bg-[#5c1a8b] text-white' : 'bg-white text-[#5c1a8b]'" class="px-4 py-1.5 text-sm font-bold border border-[#ddc8f5] rounded-r">Supplier (Dena)</button>
      </div>
    </div>

    <!-- Status filter -->
    <div class="flex gap-2 mb-3 flex-wrap">
      @for (s of statusList; track s.key) {
        <button (click)="statusFilter.set(s.key)"
          [class]="statusFilter()===s.key ? s.on : 'bg-white text-gray-600 border-gray-200'"
          class="px-3 py-1 text-xs font-bold border rounded-full">{{ s.label }}</button>
      }
    </div>

    <!-- Summary -->
    <div class="grid grid-cols-4 gap-3 mb-4">
      <div class="card text-center"><div class="text-lg font-black text-[#5c1a8b]">{{ sum().count }}</div><div class="text-xs uppercase font-bold text-gray-500">Bills</div></div>
      <div class="card text-center"><div class="text-lg font-black">Rs {{ money(sum().total) }}</div><div class="text-xs uppercase font-bold text-gray-500">Total</div></div>
      <div class="card text-center"><div class="text-lg font-black text-green-600">Rs {{ money(sum().paid) }}</div><div class="text-xs uppercase font-bold text-gray-500">Paid</div></div>
      <div class="card text-center"><div class="text-lg font-black text-red-600">Rs {{ money(sum().bal) }}</div><div class="text-xs uppercase font-bold text-gray-500">Baaki</div></div>
    </div>

    <div class="card p-0 overflow-x-auto">
      @if (loading()) { <div class="p-8 text-center text-gray-500">Loading...</div> }
      @else {
        <table class="w-full text-sm">
          <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
            <tr>
              <th class="px-3 py-2 text-left">{{ tab()==='buyer' ? 'Buyer' : 'Supplier' }}</th>
              <th class="px-3 py-2 text-left">Bill No</th>
              <th class="px-3 py-2 text-left">Date</th>
              <th class="px-3 py-2 text-right">Total</th>
              <th class="px-3 py-2 text-right">Paid</th>
              <th class="px-3 py-2 text-right">Baaki</th>
              <th class="px-3 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr class="border-t hover:bg-[#faf5ff]">
                <td class="px-3 py-2 font-semibold">{{ r._party }}</td>
                <td class="px-3 py-2 font-mono text-xs">{{ r.billNo }}</td>
                <td class="px-3 py-2 text-xs">{{ r.billDate }}</td>
                <td class="px-3 py-2 text-right font-mono">Rs {{ money(r.total) }}</td>
                <td class="px-3 py-2 text-right font-mono text-green-700">Rs {{ money(r.paidAmount) }}</td>
                <td class="px-3 py-2 text-right font-mono" [class.text-red-600]="r._bal > 0">Rs {{ money(r._bal) }}</td>
                <td class="px-3 py-2 text-center">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold"
                    [class]="r._st==='paid' ? 'bg-green-100 text-green-700' : r._st==='unpaid' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'">
                    {{ r._st==='paid' ? 'Paid' : r._st==='unpaid' ? 'Unpaid' : 'Partly Paid' }}
                  </span>
                </td>
              </tr>
            }
            @if (rows().length === 0) { <tr><td colspan="7" class="p-6 text-center text-gray-400">Is filter me koi bill nahi.</td></tr> }
          </tbody>
        </table>
      }
    </div>
  </div>
  `,
})
export class PartyPaymentReportComponent {
  private svc = inject(TradingService);
  bills = signal<BillListItem[]>([]);
  loading = signal(false);
  tab = signal<'buyer' | 'supplier'>('buyer');
  statusFilter = signal('');
  from = '';
  to = '';

  statusList = [
    { key: '', label: 'All', on: 'bg-[#5c1a8b] text-white border-[#5c1a8b]' },
    { key: 'paid', label: 'Paid', on: 'bg-green-600 text-white border-green-600' },
    { key: 'unpaid', label: 'Unpaid', on: 'bg-red-600 text-white border-red-600' },
    { key: 'partial', label: 'Partly Paid', on: 'bg-amber-500 text-white border-amber-500' },
  ];

  constructor() { this.load(); }

  load() {
    this.loading.set(true);
    (this.svc as any).listBills({ from: this.from || undefined, to: this.to || undefined, size: 1000 }).subscribe({
      next: (r: any) => { this.bills.set(r?.items ?? r ?? []); this.loading.set(false); },
      error: () => { this.bills.set([]); this.loading.set(false); }
    });
  }

  setTab(t: 'buyer' | 'supplier') { this.tab.set(t); }

  st(b: any) { const paid = b.paidAmount || 0, total = b.total || 0; if (paid <= 0) return 'unpaid'; if (total - paid <= 0.01) return 'paid'; return 'partial'; }
  partyOf(b: any) { return this.tab() === 'buyer' ? (b.buyerName || b.partyName) : b.partyName; }
  gstOf(b: any) { return this.tab() === 'buyer' ? (b.buyerGst || b.partyGst) : b.partyGst; }
  partySearch = signal('');
  partyOptions = computed(() => {
    const t = this.tab() === 'buyer' ? 'sales' : 'purchase';
    const set = new Set<string>();
    for (const b of this.bills()) if (b.billType === t && !b.isDeleted) { const p = this.partyOf(b); if (p) set.add(p); }
    return [...set].sort();
  });

  rows = computed(() => {
    const t = this.tab() === 'buyer' ? 'sales' : 'purchase';
    const sf = this.statusFilter();
    const ps = this.partySearch().trim().toLowerCase();
    return this.bills()
      .filter((b: any) => b.billType === t && !b.isDeleted && (!sf || this.st(b) === sf)
        && (!ps || (this.partyOf(b) || '').toLowerCase().includes(ps) || (this.gstOf(b) || '').toLowerCase().includes(ps)))
      .map((b: any) => ({ ...b, _bal: (b.total || 0) - (b.paidAmount || 0), _st: this.st(b), _party: this.partyOf(b) }))
      .sort((a: any, b: any) => b._bal - a._bal);
  });

  sum = computed(() => {
    let total = 0, paid = 0, bal = 0;
    for (const r of this.rows()) { total += r.total || 0; paid += r.paidAmount || 0; bal += r._bal; }
    return { total, paid, bal, count: this.rows().length };
  });

  money(n: number) { return (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
}
