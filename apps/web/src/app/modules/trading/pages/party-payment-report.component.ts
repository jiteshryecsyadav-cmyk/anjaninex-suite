import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TradingService, BillListItem } from '../services/trading.service';

// Supplier vs Buyer report: date range me Paid / Unpaid / Partly-paid.
// Buyer + Supplier dono ek table me (Type column). Alag-alag search field (naam / GST).
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
      <div><label class="text-xs text-gray-500 block">From</label><input type="date" [(ngModel)]="from" class="input w-40"></div>
      <div><label class="text-xs text-gray-500 block">To</label><input type="date" [(ngModel)]="to" class="input w-40"></div>
      <div>
        <label class="text-xs text-gray-500 block">Supplier (naam / GST)</label>
        <input [ngModel]="supplierSearch()" (ngModelChange)="supplierSearch.set($event)" list="pbSuppList" placeholder="Supplier dhoondo" class="input w-52">
        <datalist id="pbSuppList">@for (p of supplierOptions(); track p) { <option [value]="p"></option> }</datalist>
      </div>
      <div>
        <label class="text-xs text-gray-500 block">Buyer (naam / GST)</label>
        <input [ngModel]="buyerSearch()" (ngModelChange)="buyerSearch.set($event)" list="pbBuyerList" placeholder="Buyer dhoondo" class="input w-52">
        <datalist id="pbBuyerList">@for (p of buyerOptions(); track p) { <option [value]="p"></option> }</datalist>
      </div>
      <button (click)="load()" class="px-5 py-1.5 text-sm font-bold text-white bg-[#5c1a8b] rounded">Get</button>
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
              <th class="px-3 py-2 text-center">Type</th>
              <th class="px-3 py-2 text-left">Party</th>
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
                <td class="px-3 py-2 text-center">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold"
                    [class]="r._type==='Buyer' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'">{{ r._type }}</span>
                </td>
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
            @if (rows().length === 0) { <tr><td colspan="8" class="p-6 text-center text-gray-400">Is filter me koi bill nahi.</td></tr> }
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
  statusFilter = signal('');
  buyerSearch = signal('');
  supplierSearch = signal('');
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

  st(b: any) { const paid = b.paidAmount || 0, total = b.total || 0; if (paid <= 0) return 'unpaid'; if (total - paid <= 0.01) return 'paid'; return 'partial'; }
  typeOf(b: any) { return b.billType === 'sales' ? 'Buyer' : 'Supplier'; }
  partyOf(b: any) { return b.billType === 'sales' ? (b.buyerName || b.partyName) : b.partyName; }
  gstOf(b: any) { return b.billType === 'sales' ? (b.buyerGst || b.partyGst) : b.partyGst; }

  buyerOptions = computed(() => {
    const set = new Set<string>();
    for (const b of this.bills()) if (b.billType === 'sales' && !(b as any).isDeleted) { const p = this.partyOf(b); if (p) set.add(p); }
    return [...set].sort();
  });
  supplierOptions = computed(() => {
    const set = new Set<string>();
    for (const b of this.bills()) if (b.billType !== 'sales' && !(b as any).isDeleted) { const p = this.partyOf(b); if (p) set.add(p); }
    return [...set].sort();
  });

  rows = computed(() => {
    const sf = this.statusFilter();
    const bs = this.buyerSearch().trim().toLowerCase();
    const ss = this.supplierSearch().trim().toLowerCase();
    return this.bills()
      .filter((b: any) => {
        if (b.isDeleted) return false;
        if (sf && this.st(b) !== sf) return false;
        const isBuyer = b.billType === 'sales';
        const party = (this.partyOf(b) || '').toLowerCase();
        const gst = (this.gstOf(b) || '').toLowerCase();
        if (isBuyer) { if (bs && !party.includes(bs) && !gst.includes(bs)) return false; }
        else { if (ss && !party.includes(ss) && !gst.includes(ss)) return false; }
        // agar sirf ek side search kiya to doosri side hide karo
        if (bs && !ss && !isBuyer) return false;
        if (ss && !bs && isBuyer) return false;
        return true;
      })
      .map((b: any) => ({ ...b, _type: this.typeOf(b), _party: this.partyOf(b), _bal: (b.total || 0) - (b.paidAmount || 0), _st: this.st(b) }))
      .sort((a: any, b: any) => a._type === b._type ? (b._bal - a._bal) : (a._type === 'Supplier' ? -1 : 1));
  });

  sum = computed(() => {
    let total = 0, paid = 0, bal = 0;
    for (const r of this.rows()) { total += r.total || 0; paid += r.paidAmount || 0; bal += r._bal; }
    return { total, paid, bal, count: this.rows().length };
  });

  money(n: number) { return (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
}
