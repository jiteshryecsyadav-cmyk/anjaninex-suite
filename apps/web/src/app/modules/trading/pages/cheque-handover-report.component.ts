import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface HO {
  id: string; supplierName?: string; buyerName?: string; chequeNo?: string; bankName?: string;
  amount: number; chequeDate?: string; takenBy?: string; handedDate?: string; handedBy?: string;
  commissionPaid: boolean; commissionAmount: number;
}

// Cheque Handover Report (read-only): supplier + buyer + cheque + kis ne liya + commission paid/unpaid.
import { BackButtonComponent } from '../../../shared/back-button.component';
@Component({
  selector: 'app-cheque-handover-report',
  standalone: true,
  imports: [BackButtonComponent, CommonModule, FormsModule],
  template: `
    <div class="page-top-bar"><app-back-button></app-back-button></div>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="mb-4">
      <h2 class="font-display font-black text-2xl text-[#5c1a8b]">Cheque Handover Report</h2>
      <p class="text-sm text-[#6b3fa0]">Kaunsa cheque, supplier + buyer, kaun staff le gaya, aur commission Paid/Unpaid.</p>
    </div>

    <div class="card mb-4 flex flex-wrap gap-3 items-end">
      <div><label class="text-xs text-gray-500 block">From</label><input type="date" [(ngModel)]="from" (change)="load()" class="input w-40"></div>
      <div><label class="text-xs text-gray-500 block">To</label><input type="date" [(ngModel)]="to" (change)="load()" class="input w-40"></div>
      <input [(ngModel)]="search" (keyup.enter)="load()" placeholder="Supplier / buyer / staff / cheque no..." class="input w-64">
      <button (click)="load()" class="px-3 py-1.5 text-sm border border-[#ddc8f5] rounded hover:bg-purple-50">Search</button>
      <div class="flex gap-1 ml-auto">
        <button (click)="cf.set(''); load()" [class]="cf()==='' ? 'bg-[#5c1a8b] text-white' : 'bg-white text-gray-600'" class="px-3 py-1 text-xs font-bold border border-[#ddc8f5] rounded-l">All</button>
        <button (click)="cf.set('paid'); load()" [class]="cf()==='paid' ? 'bg-green-600 text-white' : 'bg-white text-gray-600'" class="px-3 py-1 text-xs font-bold border border-[#ddc8f5]">Comm Paid</button>
        <button (click)="cf.set('unpaid'); load()" [class]="cf()==='unpaid' ? 'bg-red-600 text-white' : 'bg-white text-gray-600'" class="px-3 py-1 text-xs font-bold border border-[#ddc8f5] rounded-r">Comm Unpaid</button>
      </div>
    </div>

    <div class="grid grid-cols-5 gap-3 mb-4">
      <div class="card text-center"><div class="text-lg font-black text-[#5c1a8b]">{{ rows().length }}</div><div class="text-xs uppercase font-bold text-gray-500">Cheques</div></div>
      <div class="card text-center"><div class="text-lg font-black">Rs {{ money(sum().amt) }}</div><div class="text-xs uppercase font-bold text-gray-500">Amount</div></div>
      <div class="card text-center"><div class="text-lg font-black text-green-600">Rs {{ money(sum().commPaid) }}</div><div class="text-xs uppercase font-bold text-gray-500">Comm Paid</div></div>
      <div class="card text-center"><div class="text-lg font-black text-red-600">{{ sum().commUnpaid }}</div><div class="text-xs uppercase font-bold text-gray-500">Comm Unpaid</div></div>
      <div class="card text-center"><div class="text-lg font-black text-amber-600">{{ sum().pending }}</div><div class="text-xs uppercase font-bold text-gray-500">Handover Pending</div></div>
    </div>

    <div class="card p-0 overflow-x-auto">
      @if (loading()) { <div class="p-8 text-center text-gray-500">Loading...</div> }
      @else if (rows().length === 0) { <div class="p-8 text-center text-gray-400">Koi cheque handover record nahi.</div> }
      @else {
        <table class="w-full text-sm">
          <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
            <tr>
              <th class="px-3 py-2 text-left">Handed Date</th>
              <th class="px-3 py-2 text-left">Supplier</th>
              <th class="px-3 py-2 text-left">Buyer</th>
              <th class="px-3 py-2 text-left">Cheque No</th>
              <th class="px-3 py-2 text-left">Bank</th>
              <th class="px-3 py-2 text-right">Amount</th>
              <th class="px-3 py-2 text-left">Kis ne liya</th>
              <th class="px-3 py-2 text-center">Commission</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr class="border-t hover:bg-[#faf5ff]">
                <td class="px-3 py-2 whitespace-nowrap">{{ r.handedDate || '-' }}</td>
                <td class="px-3 py-2 font-semibold">{{ r.supplierName || '-' }}</td>
                <td class="px-3 py-2">{{ r.buyerName || '-' }}</td>
                <td class="px-3 py-2 font-mono text-xs">{{ r.chequeNo || '-' }}</td>
                <td class="px-3 py-2 text-xs">{{ r.bankName || '-' }}</td>
                <td class="px-3 py-2 text-right font-mono">Rs {{ money(r.amount) }}</td>
                <td class="px-3 py-2">{{ r.takenBy || 'Pending' }}</td>
                <td class="px-3 py-2 text-center">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold" [class]="r.commissionPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">
                    {{ r.commissionPaid ? ('Paid Rs ' + money(r.commissionAmount)) : 'Unpaid' }}
                  </span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  </div>
  `,
})
export class ChequeHandoverReportComponent {
  private http = inject(HttpClient);
  base = `${environment.apiUrl}/api/trading/cheque-handovers`;
  rows = signal<HO[]>([]);
  loading = signal(false);
  cf = signal('');
  from = '';
  to = '';
  search = '';

  constructor() { this.load(); }

  load() {
    this.loading.set(true);
    const params: any = {};
    if (this.cf()) params.commission = this.cf();
    if (this.from) params.from = this.from;
    if (this.to) params.to = this.to;
    if (this.search.trim()) params.search = this.search.trim();
    this.http.get<HO[]>(this.base, { params }).subscribe({
      next: r => { this.rows.set(r || []); this.loading.set(false); },
      error: () => { this.rows.set([]); this.loading.set(false); }
    });
  }

  sum = computed(() => {
    let amt = 0, commPaid = 0, commUnpaid = 0, pending = 0;
    for (const r of this.rows()) {
      amt += r.amount || 0;
      if (r.commissionPaid) commPaid += r.commissionAmount || 0; else commUnpaid++;
      if (!r.takenBy) pending++;
    }
    return { amt, commPaid, commUnpaid, pending };
  });

  money(n: number) { return (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
}
