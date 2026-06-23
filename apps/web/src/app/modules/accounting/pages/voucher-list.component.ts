import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AccountingService, VoucherListItem, VoucherDetail } from '../services/accounting.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';
import { InDatePipe } from '../../../shared/in-date.pipe';

@Component({
  selector: 'app-voucher-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, BackButtonComponent, InDatePipe],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b] flex items-center gap-2">
            📋 Voucher List
          </h2>
          <p class="text-sm text-[#6b3fa0]">
            All recorded vouchers — view, edit (manual) or delete
          </p>
        </div>
        <a routerLink="/accounting/vouchers" class="btn-primary text-sm">📝 New Voucher</a>
      </div>

      <!-- Sub-nav -->
      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] overflow-x-auto">
        <a routerLink="/accounting/heads" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b] whitespace-nowrap">Heads</a>
        <a routerLink="/accounting/groups" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b] whitespace-nowrap">Groups</a>
        <a routerLink="/accounting/sub-groups" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b] whitespace-nowrap">Sub Groups</a>
        <a routerLink="/accounting/ledgers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b] whitespace-nowrap">Ledgers</a>
        <a routerLink="/accounting/vouchers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b] whitespace-nowrap">Vouchers</a>
        <a routerLink="/accounting/voucher-list" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b] whitespace-nowrap">📋 Voucher List</a>
        <a routerLink="/accounting/trial-balance" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b] whitespace-nowrap">Trial Balance</a>
        <a routerLink="/accounting/profit-loss" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b] whitespace-nowrap">P&amp;L</a>
        <a routerLink="/accounting/balance-sheet" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b] whitespace-nowrap">Balance Sheet</a>
      </div>

      <!-- Filters -->
      <div class="card mb-4">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label class="text-xs font-bold text-[#6b3fa0] uppercase block mb-1">Type</label>
            <select [ngModel]="filterType()" (ngModelChange)="onFilterType($event)" class="input text-sm py-1.5 w-40">
              <option value="">All Types</option>
              <option value="payment">💸 Payment</option>
              <option value="receipt">💵 Receipt</option>
              <option value="contra">🔁 Contra</option>
              <option value="journal">📓 Journal</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-[#6b3fa0] uppercase block mb-1">From</label>
            <input [ngModel]="filterFrom()" (ngModelChange)="onFilterFrom($event)" type="date" class="input text-sm py-1.5">
          </div>
          <div>
            <label class="text-xs font-bold text-[#6b3fa0] uppercase block mb-1">To</label>
            <input [ngModel]="filterTo()" (ngModelChange)="onFilterTo($event)" type="date" class="input text-sm py-1.5">
          </div>
          @if (filterType() || filterFrom() || filterTo()) {
            <button (click)="clearFilters()" class="text-xs text-[#5c1a8b] hover:underline pb-2">✕ Clear filters</button>
          }
          <span class="ml-auto text-xs text-gray-400 font-mono pb-2">{{ total() }} total</span>
        </div>
      </div>

      <!-- Table -->
      <div class="card">
        @if (loadingList()) {
          <p class="text-sm text-gray-400 text-center py-10">Loading…</p>
        } @else if (rows().length === 0) {
          <p class="text-sm text-gray-400 text-center py-10">No vouchers found</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm min-w-[800px]">
              <thead class="bg-[#f0e6ff] text-[#5c1a8b] text-xs uppercase">
                <tr>
                  <th class="px-3 py-2 text-left">Voucher No</th>
                  <th class="px-3 py-2 text-left">Type</th>
                  <th class="px-3 py-2 text-left">Date</th>
                  <th class="px-3 py-2 text-left">Narration</th>
                  <th class="px-3 py-2 text-right">Amount</th>
                  <th class="px-3 py-2 text-left">Source</th>
                  <th class="px-3 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (v of rows(); track v.id) {
                  <tr class="border-t hover:bg-[#f9f5ff]">
                    <td class="px-3 py-2 font-mono font-bold text-[#5c1a8b]">{{ v.voucherNo }}</td>
                    <td class="px-3 py-2">
                      <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold" [class]="typeChipClass(v.voucherType)">
                        {{ v.voucherType }}
                      </span>
                    </td>
                    <td class="px-3 py-2 whitespace-nowrap">{{ v.voucherDate | inDate }}</td>
                    <td class="px-3 py-2 text-gray-600 max-w-[260px] truncate">{{ v.narration || '—' }}</td>
                    <td class="px-3 py-2 text-right font-mono font-bold">₹{{ v.totalAmount | number:'1.2-2' }}</td>
                    <td class="px-3 py-2">
                      @if (isAutoPosted(v)) {
                        <span class="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-bold text-[10px] whitespace-nowrap">
                          🔒 Auto · {{ v.sourceModule }}
                        </span>
                      } @else {
                        <span class="inline-block px-2 py-0.5 rounded bg-green-100 text-green-700 font-bold text-[10px]">Manual</span>
                      }
                    </td>
                    <td class="px-3 py-2">
                      <div class="flex gap-1 justify-center">
                        <button (click)="openView(v.id)"
                                class="px-2 py-1 rounded bg-[#f0e6ff] text-[#5c1a8b] font-bold hover:bg-[#ddc8f5] text-xs"
                                [title]="isAutoPosted(v) ? ('Auto-posted from ' + v.sourceModule + ' — edit/delete source document me karein') : 'View voucher'">
                          👁
                        </button>
                        @if (!isAutoPosted(v)) {
                          <button (click)="editVoucher(v)"
                                  class="px-2 py-1 rounded bg-[#f0e6ff] text-[#5c1a8b] font-bold hover:bg-[#ddc8f5] text-xs" title="Edit voucher">
                            ✏️
                          </button>
                          <button (click)="deleteVoucher(v.id, v.voucherNo)"
                                  class="px-2 py-1 rounded bg-red-50 text-red-600 font-bold hover:bg-red-100 text-xs" title="Delete voucher">
                            🗑
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div class="flex flex-wrap items-center justify-between mt-4 pt-4 border-t border-[#f0e6ff] text-sm gap-3">
            <div class="flex items-center gap-1">
              <span class="text-gray-500 text-xs">Show</span>
              <select [ngModel]="pageSize()" (ngModelChange)="onPageSize($event)" class="input text-xs py-1 w-16">
                <option [ngValue]="10">10</option>
                <option [ngValue]="25">25</option>
                <option [ngValue]="50">50</option>
              </select>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-gray-500 font-mono text-xs">{{ rangeStart() }}–{{ rangeEnd() }} of {{ total() }}</span>
              <button (click)="prevPage()" [disabled]="page() <= 1"
                      class="px-3 py-1 rounded border border-[#ddc8f5] text-[#5c1a8b] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f0e6ff]">
                ‹ Prev
              </button>
              <button (click)="nextPage()" [disabled]="page() >= totalPages()"
                      class="px-3 py-1 rounded border border-[#ddc8f5] text-[#5c1a8b] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f0e6ff]">
                Next ›
              </button>
            </div>
          </div>
        }
      </div>

      <!-- View modal (read-only) -->
      @if (viewVoucher(); as vd) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" (click)="closeView()">
          <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
            <!-- Modal header -->
            <div class="flex items-center justify-between px-5 py-3 border-b border-[#ddc8f5] sticky top-0 bg-white">
              <h3 class="font-display font-bold text-lg text-[#5c1a8b]">
                👁 Voucher <span class="font-mono">{{ vd.voucherNo }}</span>
              </h3>
              <button (click)="closeView()" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>

            <div class="p-5">
              <!-- Header info -->
              <div class="grid grid-cols-2 gap-3 text-sm mb-4">
                <div><span class="text-xs font-bold text-[#6b3fa0] uppercase block">Type</span>
                  <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold" [class]="typeChipClass(vd.voucherType)">{{ vd.voucherType }}</span>
                </div>
                <div><span class="text-xs font-bold text-[#6b3fa0] uppercase block">Date</span>{{ vd.voucherDate | inDate }}</div>
                <div><span class="text-xs font-bold text-[#6b3fa0] uppercase block">Branch</span>{{ vd.branchName || '—' }}</div>
                <div><span class="text-xs font-bold text-[#6b3fa0] uppercase block">Source</span>
                  @if (vd.sourceModule && vd.sourceModule !== 'accounting') {
                    <span class="px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-bold text-[10px]">🔒 {{ vd.sourceModule }}</span>
                  } @else {
                    <span class="px-2 py-0.5 rounded bg-green-100 text-green-700 font-bold text-[10px]">Manual</span>
                  }
                </div>
                <div class="col-span-2"><span class="text-xs font-bold text-[#6b3fa0] uppercase block">Narration</span>{{ vd.narration || '—' }}</div>
              </div>

              <!-- Lines table -->
              <div class="border border-[#ddc8f5] rounded-lg overflow-hidden">
                <table class="w-full text-sm">
                  <thead class="bg-[#f0e6ff] text-[#5c1a8b] text-xs uppercase">
                    <tr>
                      <th class="px-3 py-2 text-left">Ledger</th>
                      <th class="px-3 py-2 text-center w-16">Dr/Cr</th>
                      <th class="px-3 py-2 text-right w-32">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (l of vd.lines; track $index) {
                      <tr class="border-t">
                        <td class="px-3 py-2">
                          {{ l.ledgerName }}
                          @if (l.narration) { <span class="block text-[10px] text-gray-400">{{ l.narration }}</span> }
                        </td>
                        <td class="px-3 py-2 text-center font-bold"
                            [class.text-green-600]="l.debitCredit === 'Dr'"
                            [class.text-red-600]="l.debitCredit === 'Cr'">{{ l.debitCredit }}</td>
                        <td class="px-3 py-2 text-right font-mono">₹{{ l.amount | number:'1.2-2' }}</td>
                      </tr>
                    }
                  </tbody>
                  <tfoot class="bg-gray-50 font-bold">
                    <tr>
                      <td colspan="2" class="px-3 py-2 text-right">Dr Total:</td>
                      <td class="px-3 py-2 text-right font-mono text-green-600">₹{{ viewTotalDr() | number:'1.2-2' }}</td>
                    </tr>
                    <tr>
                      <td colspan="2" class="px-3 py-2 text-right">Cr Total:</td>
                      <td class="px-3 py-2 text-right font-mono text-red-600">₹{{ viewTotalCr() | number:'1.2-2' }}</td>
                    </tr>
                    <tr class="border-t border-[#ddc8f5]">
                      <td colspan="2" class="px-3 py-2 text-right text-[#5c1a8b]">Total:</td>
                      <td class="px-3 py-2 text-right font-mono text-[#5c1a8b]">₹{{ vd.totalAmount | number:'1.2-2' }}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div class="flex justify-end mt-4">
                <button (click)="closeView()" class="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">Close</button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class VoucherListComponent {
  private svc = inject(AccountingService);
  private toast = inject(ToastService);
  private router = inject(Router);

  rows = signal<VoucherListItem[]>([]);
  loadingList = signal(false);

  // Filters + pagination
  filterType = signal('');
  filterFrom = signal('');
  filterTo = signal('');
  page = signal(1);
  pageSize = signal(25);
  total = signal(0);

  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  rangeStart = computed(() => this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1);
  rangeEnd = computed(() => Math.min(this.page() * this.pageSize(), this.total()));

  // View modal
  viewVoucher = signal<VoucherDetail | null>(null);
  viewTotalDr = computed(() => (this.viewVoucher()?.lines ?? []).filter(l => l.debitCredit === 'Dr').reduce((s, l) => s + (+l.amount || 0), 0));
  viewTotalCr = computed(() => (this.viewVoucher()?.lines ?? []).filter(l => l.debitCredit === 'Cr').reduce((s, l) => s + (+l.amount || 0), 0));

  ngOnInit() {
    this.load();
  }

  load() {
    this.loadingList.set(true);
    const opts: { type?: string; from?: string; to?: string; page?: number; size?: number } = {
      page: this.page(),
      size: this.pageSize()
    };
    if (this.filterType()) opts.type = this.filterType();
    if (this.filterFrom()) opts.from = this.filterFrom();
    if (this.filterTo()) opts.to = this.filterTo();
    this.svc.listVouchers(opts).subscribe({
      next: (r) => {
        this.rows.set(r.items);
        this.total.set(r.total);
        this.loadingList.set(false);
      },
      error: () => this.loadingList.set(false)
    });
  }

  // ===== Filters =====
  onFilterType(v: string) { this.filterType.set(v); this.page.set(1); this.load(); }
  onFilterFrom(v: string) { this.filterFrom.set(v); this.page.set(1); this.load(); }
  onFilterTo(v: string) { this.filterTo.set(v); this.page.set(1); this.load(); }
  clearFilters() {
    this.filterType.set('');
    this.filterFrom.set('');
    this.filterTo.set('');
    this.page.set(1);
    this.load();
  }

  // ===== Pagination =====
  onPageSize(size: number) { this.pageSize.set(size); this.page.set(1); this.load(); }
  prevPage() { if (this.page() > 1) { this.page.update(p => p - 1); this.load(); } }
  nextPage() { if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.load(); } }

  // ===== View modal =====
  openView(id: string) {
    this.svc.getVoucher(id).subscribe({
      next: (v) => this.viewVoucher.set(v),
      error: (e) => this.toast.error(e?.error?.error ?? 'Voucher load nahi hua')
    });
  }
  closeView() { this.viewVoucher.set(null); }

  /** Auto-posted vouchers (bill/payment/hr se) ko manual edit/delete se bachao —
   *  warna source document ke saath accounting desync ho jaayegi. Manual vouchers
   *  ka sourceModule 'accounting' (ya khaali) hota hai → wo editable rehte hain. */
  isAutoPosted(v: VoucherListItem): boolean {
    return !!v.sourceModule && v.sourceModule !== 'accounting';
  }

  // ===== Edit → deep-link into the Voucher Entry form =====
  editVoucher(v: VoucherListItem) {
    if (this.isAutoPosted(v)) return;
    this.router.navigate(['/accounting/vouchers'], { queryParams: { edit: v.id } });
  }

  // ===== Delete voucher =====
  deleteVoucher(id: string, no: string) {
    if (!confirm(`Voucher ${no} delete karna hai? Wapas nahi aayega.`)) return;
    this.svc.deleteVoucher(id).subscribe({
      next: () => {
        this.toast.success(`Voucher ${no} delete ho gaya`);
        this.load();
      },
      error: (e) => this.toast.error(e?.error?.error ?? 'Delete nahi hua')
    });
  }

  typeChipClass(t: string): string {
    return {
      payment: 'bg-red-100 text-red-700',
      receipt: 'bg-green-100 text-green-700',
      contra:  'bg-blue-100 text-blue-700',
      journal: 'bg-purple-100 text-purple-700',
      sales:   'bg-orange-100 text-orange-700',
      purchase:'bg-yellow-100 text-yellow-700'
    }[t] ?? 'bg-gray-100 text-gray-700';
  }
}
