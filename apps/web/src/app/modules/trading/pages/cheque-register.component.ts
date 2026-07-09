import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface Handover {
  id: string; paymentRef?: string; supplierName?: string; chequeNo?: string; bankName?: string;
  amount: number; chequeDate?: string; takenBy?: string; handedDate?: string; handedBy?: string;
  commissionPaid: boolean; commissionAmount: number; remark?: string;
}

// Cheque Handover Register: supplier ka staff kaunsa cheque le gaya, kab, commission paid/unpaid.
@Component({
  selector: 'app-cheque-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div>
        <h2 class="font-display font-black text-2xl text-[#5c1a8b]">Cheque Handover Register</h2>
        <p class="text-sm text-[#6b3fa0]">Kaunsa cheque, kis supplier ka, kaun staff le gaya, kab - aur commission Paid/Unpaid.</p>
      </div>
      <div class="flex gap-2">
        <button (click)="backfill()" class="px-3 py-2 border border-[#ddc8f5] text-[#5c1a8b] rounded-lg font-bold hover:bg-purple-50" title="Purani entries me supplier/buyer naam theek karo">🔄 Naam sync</button>
        <button (click)="openAdd()" class="px-4 py-2 bg-[#5c1a8b] text-white rounded-lg font-bold">+ Cheque diya</button>
      </div>
    </div>

    <!-- Filters -->
    <div class="card mb-4 flex flex-wrap gap-3 items-end">
      <div><label class="text-xs text-gray-500 block">From</label><input type="date" [(ngModel)]="from" (change)="load()" class="input w-40"></div>
      <div><label class="text-xs text-gray-500 block">To</label><input type="date" [(ngModel)]="to" (change)="load()" class="input w-40"></div>
      <input [(ngModel)]="search" (keyup.enter)="load()" placeholder="Supplier / staff / cheque no..." class="input w-64">
      <button (click)="load()" class="px-3 py-1.5 text-sm border border-[#ddc8f5] rounded hover:bg-purple-50">Search</button>
      <div class="flex gap-1 ml-auto">
        <button (click)="commissionFilter.set(''); load()" [class]="commissionFilter()==='' ? 'bg-[#5c1a8b] text-white' : 'bg-white text-gray-600'" class="px-3 py-1 text-xs font-bold border border-[#ddc8f5] rounded-l">All</button>
        <button (click)="commissionFilter.set('paid'); load()" [class]="commissionFilter()==='paid' ? 'bg-green-600 text-white' : 'bg-white text-gray-600'" class="px-3 py-1 text-xs font-bold border border-[#ddc8f5]">Comm Paid</button>
        <button (click)="commissionFilter.set('unpaid'); load()" [class]="commissionFilter()==='unpaid' ? 'bg-red-600 text-white' : 'bg-white text-gray-600'" class="px-3 py-1 text-xs font-bold border border-[#ddc8f5] rounded-r">Comm Unpaid</button>
      </div>
    </div>

    <div class="card p-0 overflow-x-auto">
      @if (loading()) { <div class="p-8 text-center text-gray-500">Loading...</div> }
      @else if (rows().length === 0) { <div class="p-8 text-center text-gray-400">Koi cheque handover record nahi. "+ Cheque diya" se add karo.</div> }
      @else {
        <table class="w-full text-sm">
          <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
            <tr>
              <th class="px-3 py-2 text-left">Handed Date</th>
              <th class="px-3 py-2 text-left">Supplier</th>
              <th class="px-3 py-2 text-left">Cheque No</th>
              <th class="px-3 py-2 text-left">Bank</th>
              <th class="px-3 py-2 text-right">Amount</th>
              <th class="px-3 py-2 text-left">Kis ne liya</th>
              <th class="px-3 py-2 text-left">Kisne diya</th>
              <th class="px-3 py-2 text-center">Commission</th>
              <th class="px-3 py-2 text-center">Del</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr class="border-t hover:bg-[#faf5ff]">
                <td class="px-3 py-2 whitespace-nowrap">{{ r.handedDate || '-' }}</td>
                <td class="px-3 py-2 font-semibold">{{ r.supplierName || '-' }}</td>
                <td class="px-3 py-2 font-mono text-xs">{{ r.chequeNo || '-' }}</td>
                <td class="px-3 py-2 text-xs">{{ r.bankName || '-' }}</td>
                <td class="px-3 py-2 text-right font-mono">Rs {{ money(r.amount) }}</td>
                <td class="px-3 py-2 font-semibold">
                  @if (r.takenBy) { {{ r.takenBy }} }
                  @else { <button (click)="recordHandover(r)" class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold hover:bg-amber-200">Pending - Record</button> }
                </td>
                <td class="px-3 py-2 text-xs text-gray-500">{{ r.handedBy || '-' }}</td>
                <td class="px-3 py-2 text-center">
                  @if (r.commissionPaid) {
                    <span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">Paid Rs {{ money(r.commissionAmount) }}</span>
                  } @else {
                    <button (click)="markCommission(r)" class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold hover:bg-red-200">Unpaid - mark Paid</button>
                  }
                </td>
                <td class="px-3 py-2 text-center"><button (click)="del(r)" class="text-red-500 hover:text-red-700">Del</button></td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>

    <!-- Add dialog -->
    @if (showAdd()) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="showAdd.set(false)">
        <div class="bg-white rounded-2xl p-6 w-full max-w-lg" (click)="$event.stopPropagation()">
          <h3 class="font-black text-xl text-[#5c1a8b] mb-3">Cheque Handover</h3>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs text-gray-500">Supplier</label><input [(ngModel)]="f.supplierName" class="input" placeholder="Supplier naam"></div>
            <div><label class="text-xs text-gray-500">Payment/Receipt No</label><input [(ngModel)]="f.paymentRef" class="input" placeholder="e.g. Surat Ho-R36"></div>
            <div><label class="text-xs text-gray-500">Cheque / UTR No</label><input [(ngModel)]="f.chequeNo" class="input"></div>
            <div><label class="text-xs text-gray-500">Bank</label><input [(ngModel)]="f.bankName" class="input"></div>
            <div><label class="text-xs text-gray-500">Amount</label><input type="number" [(ngModel)]="f.amount" class="input"></div>
            <div><label class="text-xs text-gray-500">Cheque Date</label><input type="date" [(ngModel)]="f.chequeDate" class="input"></div>
            <div><label class="text-xs text-gray-500">Kis ne liya (staff) *</label><input [(ngModel)]="f.takenBy" class="input" placeholder="Supplier ka aadmi"></div>
            <div><label class="text-xs text-gray-500">Kab liya *</label><input type="date" [(ngModel)]="f.handedDate" class="input"></div>
          </div>
          <div class="mt-3 p-3 rounded-lg bg-purple-50 border border-[#ddc8f5]">
            <label class="flex items-center gap-2 font-bold text-[#5c1a8b]"><input type="checkbox" [(ngModel)]="f.commissionPaid" class="w-4 h-4"> Commission liya?</label>
            @if (f.commissionPaid) {
              <div class="mt-2"><label class="text-xs text-gray-500">Commission amount</label><input type="number" [(ngModel)]="f.commissionAmount" class="input w-48"></div>
            }
          </div>
          <div class="mt-3"><label class="text-xs text-gray-500">Remark</label><input [(ngModel)]="f.remark" class="input" placeholder="Optional"></div>
          @if (err()) { <p class="text-red-600 text-sm mt-2">{{ err() }}</p> }
          <div class="flex justify-end gap-2 mt-4">
            <button (click)="showAdd.set(false)" class="px-4 py-2 border border-gray-300 rounded">Cancel</button>
            <button (click)="save()" [disabled]="saving()" class="px-5 py-2 bg-[#5c1a8b] text-white rounded font-bold disabled:opacity-50">{{ saving() ? 'Saving...' : 'Save' }}</button>
          </div>
        </div>
      </div>
    }
  </div>
  `,
})
export class ChequeRegisterComponent {
  private http = inject(HttpClient);
  base = `${environment.apiUrl}/api/trading/cheque-handovers`;
  rows = signal<Handover[]>([]);
  loading = signal(false);
  commissionFilter = signal('');
  from = '';
  to = '';
  search = '';
  showAdd = signal(false);
  saving = signal(false);
  err = signal('');
  f: any = {};

  constructor() { this.load(); }

  load() {
    this.loading.set(true);
    const params: any = {};
    if (this.commissionFilter()) params.commission = this.commissionFilter();
    if (this.from) params.from = this.from;
    if (this.to) params.to = this.to;
    if (this.search.trim()) params.search = this.search.trim();
    this.http.get<Handover[]>(this.base, { params }).subscribe({
      next: r => { this.rows.set(r || []); this.loading.set(false); },
      error: () => { this.rows.set([]); this.loading.set(false); }
    });
  }

  openAdd() {
    const today = new Date().toISOString().slice(0, 10);
    this.f = { supplierName: '', paymentRef: '', chequeNo: '', bankName: '', amount: 0, chequeDate: '', takenBy: '', handedDate: today, commissionPaid: false, commissionAmount: 0, remark: '' };
    this.err.set('');
    this.showAdd.set(true);
  }

  save() {
    if (!this.f.takenBy?.trim()) { this.err.set('Kis ne liya - naam daalein.'); return; }
    this.saving.set(true); this.err.set('');
    this.http.post(this.base, this.f).subscribe({
      next: () => { this.saving.set(false); this.showAdd.set(false); this.load(); },
      error: (e) => { this.saving.set(false); this.err.set(e?.error?.error || 'Save fail - dobara try karein.'); }
    });
  }

  markCommission(r: Handover) {
    const amt = prompt('Commission amount (Rs) jo mila:', String(r.amount ? Math.round(r.amount * 0.02) : 0));
    if (amt === null) return;
    this.http.put(`${this.base}/${r.id}/commission`, { paid: true, amount: +amt || 0 }).subscribe({
      next: () => this.load(), error: () => alert('Update fail')
    });
  }

  recordHandover(r: Handover) {
    const name = prompt('Kis ne liya (supplier ka staff naam):', r.takenBy || '');
    if (!name || !name.trim()) return;
    const today = new Date().toISOString().slice(0, 10);
    const date = prompt('Kab liya (YYYY-MM-DD):', today) || today;
    this.http.put(`${this.base}/${r.id}/handover`, { takenBy: name.trim(), handedDate: date }).subscribe({
      next: () => this.load(), error: () => alert('Update fail')
    });
  }

  backfill() {
    if (!confirm('Purani cheque entries laayein + supplier/buyer naam theek karein?')) return;
    this.http.post<any>(`${this.base}/backfill`, {}).subscribe({
      next: (r) => { alert(`${r?.added || 0} nayi entry aayi, ${r?.updated || 0} ke naam theek ho gaye.`); this.load(); },
      error: () => alert('Sync fail')
    });
  }

  del(r: Handover) {
    if (!confirm('Ye handover record delete karein?')) return;
    this.http.delete(`${this.base}/${r.id}`).subscribe({ next: () => this.load(), error: () => alert('Delete fail') });
  }

  money(n: number) { return (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
}
