import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AccountingService, Ledger, VoucherListItem, VoucherDetail } from '../services/accounting.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { ToastService } from '../../../shared/toast.service';
import { InDatePipe } from '../../../shared/in-date.pipe';

interface LineRow {
  ledgerId: string;
  ledgerName?: string;
  debitCredit: 'Dr' | 'Cr';
  amount: number;
  narration: string;
}

@Component({
  selector: 'app-voucher-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, BackButtonComponent, InDatePipe],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>


      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b] flex items-center gap-2">
            📝 Voucher Entry
          </h2>
          <p class="text-sm text-[#6b3fa0]">
            Record financial transactions — Payment · Receipt · Contra · Journal
          </p>
        </div>
      </div>

      <!-- Sub-nav -->
      <div class="flex gap-1 mb-6 border-b border-[#ddc8f5]">
        <a routerLink="/accounting/heads" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Heads</a>
        <a routerLink="/accounting/groups" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Groups</a>
        <a routerLink="/accounting/sub-groups" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Sub Groups</a>
        <a routerLink="/accounting/ledgers" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Ledgers</a>
        <a routerLink="/accounting/vouchers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Vouchers</a>
        <a routerLink="/accounting/trial-balance" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Trial Balance</a>
        <a routerLink="/accounting/profit-loss" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">P&amp;L</a>
        <a routerLink="/accounting/balance-sheet" class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Balance Sheet</a>
      </div>

      <div class="grid grid-cols-3 gap-4">

        <!-- Form (2/3 width) -->
        <div class="col-span-2">

          <!-- Voucher type tabs -->
          <div class="flex gap-2 mb-4">
            @for (vt of voucherTypes; track vt.code) {
              <button (click)="selectType(vt.code)"
                      [class]="form().voucherType === vt.code
                        ? 'px-4 py-2 rounded-lg text-sm font-bold brand-gradient text-white'
                        : 'px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-[#ddc8f5] text-[#5c1a8b] hover:bg-[#f0e6ff]'">
                {{ vt.icon }} {{ vt.label }}
              </button>
            }
          </div>

          <div class="card">
            @if (editingId()) {
              <div class="flex items-center justify-between bg-amber-50 border border-amber-300 text-amber-800 px-3 py-2 rounded mb-3 text-sm">
                <span>✏️ Editing voucher <strong class="font-mono">{{ editingNo() }}</strong> — save karne par update hoga</span>
                <button (click)="cancelEdit()" class="text-xs font-bold underline">Cancel</button>
              </div>
            }
            <h3 class="font-display font-bold text-lg text-[#5c1a8b] mb-4">
              {{ voucherTypeLabel() }}
              <span class="text-xs text-gray-500 ml-2">{{ voucherTypeHint() }}</span>
            </h3>

            <!-- Date + narration -->
            <div class="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label class="text-xs font-bold text-[#6b3fa0] uppercase">Date *</label>
                <input [ngModel]="form().voucherDate" (ngModelChange)="updateField('voucherDate', $event)"
                       type="date" class="input">
              </div>
              <div>
                <label class="text-xs font-bold text-[#6b3fa0] uppercase">Narration</label>
                <input [ngModel]="form().narration" (ngModelChange)="updateField('narration', $event)"
                       type="text" class="input" placeholder="Brief description">
              </div>
            </div>

            <!-- Lines -->
            <h4 class="text-xs font-bold text-[#6b3fa0] uppercase mb-2">
              Account Entries (Debit = Credit)
            </h4>
            <div class="border border-[#ddc8f5] rounded-lg overflow-hidden mb-3">
              <table class="w-full text-sm">
                <thead class="bg-[#f0e6ff] text-[#5c1a8b] text-xs uppercase">
                  <tr>
                    <th class="px-2 py-2 text-center w-8">#</th>
                    <th class="px-2 py-2 text-left">Account</th>
                    <th class="px-2 py-2 text-center w-20">Dr/Cr</th>
                    <th class="px-2 py-2 text-right w-32">Amount</th>
                    <th class="px-2 py-2 text-left">Narration</th>
                    <th class="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  @for (line of lines(); track $index) {
                    <tr class="border-t">
                      <td class="px-2 py-2 text-center text-xs text-gray-500">{{ $index + 1 }}</td>
                      <td class="px-1 py-1">
                        <select [ngModel]="line.ledgerId" (ngModelChange)="updateLine($index, 'ledgerId', $event)"
                                class="input text-xs py-1">
                          <option value="">— Select —</option>
                          @for (l of ledgers(); track l.id) {
                            <option [value]="l.id">{{ l.name }} ({{ l.groupName }})</option>
                          }
                        </select>
                      </td>
                      <td class="px-1 py-1">
                        <select [ngModel]="line.debitCredit" (ngModelChange)="updateLine($index, 'debitCredit', $event)"
                                class="input text-xs py-1 font-bold"
                                [class.text-green-600]="line.debitCredit === 'Dr'"
                                [class.text-red-600]="line.debitCredit === 'Cr'">
                          <option value="Dr">Dr</option>
                          <option value="Cr">Cr</option>
                        </select>
                      </td>
                      <td class="px-1 py-1">
                        <input [ngModel]="line.amount" (ngModelChange)="updateLine($index, 'amount', +$event)"
                               type="number" step="0.01" class="input text-xs py-1 text-right font-mono">
                      </td>
                      <td class="px-1 py-1">
                        <input [ngModel]="line.narration" (ngModelChange)="updateLine($index, 'narration', $event)"
                               type="text" class="input text-xs py-1" placeholder="Line note">
                      </td>
                      <td class="px-1 py-1 text-center">
                        @if (lines().length > 2) {
                          <button (click)="removeLine($index)" class="text-red-500 text-lg">×</button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot class="bg-gray-50 font-bold">
                  <tr>
                    <td colspan="3" class="px-2 py-2 text-right">Totals:</td>
                    <td class="px-2 py-2 text-right font-mono text-xs">
                      Dr: <span class="text-green-600">₹{{ totalDr() | number:'1.2-2' }}</span><br>
                      Cr: <span class="text-red-600">₹{{ totalCr() | number:'1.2-2' }}</span>
                    </td>
                    <td colspan="2" class="px-2 py-2">
                      @if (isBalanced()) {
                        <span class="text-green-600 text-xs">✓ Balanced</span>
                      } @else {
                        <span class="text-red-600 text-xs">✗ Diff: ₹{{ (totalDr() - totalCr()) | number:'1.2-2' }}</span>
                      }
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <button (click)="addLine()" class="text-xs text-[#5c1a8b] hover:underline mb-4">
              + Add Line
            </button>

            @if (error()) {
              <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-3">
                {{ error() }}
              </div>
            }

            <!-- Actions -->
            <div class="flex justify-end gap-2 border-t pt-3">
              <button (click)="reset()" class="px-4 py-2 border border-gray-300 rounded text-sm">
                Clear
              </button>
              <button (click)="save()" class="btn-primary"
                      [disabled]="!isBalanced() || saving() || lines().length < 2">
                {{ saving() ? 'Saving…' : (editingId() ? '✏️ Update Voucher' : '💾 Save Voucher') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Voucher list (1/3 width) -->
        <div class="col-span-1">
          <div class="card">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-xs font-bold text-[#6b3fa0] uppercase">Voucher List</h4>
              <span class="text-[10px] text-gray-400 font-mono">{{ total() }} total</span>
            </div>

            <!-- Filters -->
            <div class="space-y-2 mb-3">
              <select [ngModel]="filterType()" (ngModelChange)="onFilterType($event)"
                      class="input text-xs py-1">
                <option value="">All Types</option>
                <option value="payment">💸 Payment</option>
                <option value="receipt">💵 Receipt</option>
                <option value="contra">🔁 Contra</option>
                <option value="journal">📓 Journal</option>
              </select>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="text-[10px] font-bold text-[#6b3fa0] uppercase">From</label>
                  <input [ngModel]="filterFrom()" (ngModelChange)="onFilterFrom($event)"
                         type="date" class="input text-xs py-1">
                </div>
                <div>
                  <label class="text-[10px] font-bold text-[#6b3fa0] uppercase">To</label>
                  <input [ngModel]="filterTo()" (ngModelChange)="onFilterTo($event)"
                         type="date" class="input text-xs py-1">
                </div>
              </div>
              @if (filterType() || filterFrom() || filterTo()) {
                <button (click)="clearFilters()" class="text-[10px] text-[#5c1a8b] hover:underline">
                  ✕ Clear filters
                </button>
              }
            </div>

            @if (loadingList()) {
              <p class="text-sm text-gray-400 text-center py-4">Loading…</p>
            } @else if (recent().length === 0) {
              <p class="text-sm text-gray-400 text-center py-4">No vouchers found</p>
            } @else {
              <div class="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                @for (v of recent(); track v.id) {
                  <div class="border border-[#ddc8f5] rounded p-2 text-xs hover:bg-[#f0e6ff]"
                       [class.ring-2]="editingId() === v.id" [class.ring-purple-400]="editingId() === v.id">
                    <div class="flex items-center justify-between">
                      <span class="font-mono font-bold text-[#5c1a8b]">{{ v.voucherNo }}</span>
                      <span class="text-gray-500">{{ v.voucherDate | inDate }}</span>
                    </div>
                    <div class="flex items-center justify-between mt-1">
                      <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold"
                            [class]="typeChipClass(v.voucherType)">
                        {{ v.voucherType }}
                      </span>
                      <span class="font-mono font-bold">₹{{ v.totalAmount | number:'1.2-2' }}</span>
                    </div>
                    @if (v.narration) {
                      <div class="text-gray-500 mt-1 truncate">{{ v.narration }}</div>
                    }
                    <div class="mt-1">
                      @if (isAutoPosted(v)) {
                        <span class="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-bold text-[10px]">
                          🔒 Auto · {{ v.sourceModule }}
                        </span>
                      } @else {
                        <span class="inline-block px-2 py-0.5 rounded bg-green-100 text-green-700 font-bold text-[10px]">
                          Manual
                        </span>
                      }
                    </div>
                    <div class="flex gap-2 mt-2 pt-2 border-t border-[#f0e6ff] items-center">
                      <button (click)="openView(v.id)"
                              class="flex-1 px-2 py-1 rounded bg-[#f0e6ff] text-[#5c1a8b] font-bold hover:bg-[#ddc8f5]"
                              [title]="isAutoPosted(v) ? ('Auto-posted from ' + v.sourceModule + ' — edit/delete source document me karein') : 'View voucher'">
                        👁 View
                      </button>
                      @if (!isAutoPosted(v)) {
                        <button (click)="startEdit(v.id)"
                                class="flex-1 px-2 py-1 rounded bg-[#f0e6ff] text-[#5c1a8b] font-bold hover:bg-[#ddc8f5]">
                          ✏️ Edit
                        </button>
                        <button (click)="deleteVoucher(v.id, v.voucherNo)"
                                class="flex-1 px-2 py-1 rounded bg-red-50 text-red-600 font-bold hover:bg-red-100">
                          🗑 Delete
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>

              <!-- Pagination -->
              <div class="flex items-center justify-between mt-3 pt-3 border-t border-[#f0e6ff] text-xs">
                <div class="flex items-center gap-1">
                  <span class="text-gray-500">Show</span>
                  <select [ngModel]="pageSize()" (ngModelChange)="onPageSize($event)"
                          class="input text-xs py-0.5 w-14">
                    <option [ngValue]="10">10</option>
                    <option [ngValue]="25">25</option>
                    <option [ngValue]="50">50</option>
                  </select>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-gray-500 font-mono">{{ rangeStart() }}–{{ rangeEnd() }} of {{ total() }}</span>
                  <button (click)="prevPage()" [disabled]="page() <= 1"
                          class="px-2 py-1 rounded border border-[#ddc8f5] text-[#5c1a8b] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f0e6ff]">
                    ‹ Prev
                  </button>
                  <button (click)="nextPage()" [disabled]="page() >= totalPages()"
                          class="px-2 py-1 rounded border border-[#ddc8f5] text-[#5c1a8b] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f0e6ff]">
                    Next ›
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
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
export class VoucherEntryComponent {
  private svc = inject(AccountingService);
  private toast = inject(ToastService);

  voucherTypes = [
    { code: 'payment',  icon: '💸', label: 'Payment',  hint: 'Money paid out — Cash/Bank credited, Expense/Party debited' },
    { code: 'receipt',  icon: '💵', label: 'Receipt',  hint: 'Money received — Cash/Bank debited, Party/Income credited' },
    { code: 'contra',   icon: '🔁', label: 'Contra',   hint: 'Cash↔Bank or Bank↔Bank transfer' },
    { code: 'journal',  icon: '📓', label: 'Journal',  hint: 'Adjustment entry — no cash/bank' }
  ];

  ledgers = signal<Ledger[]>([]);
  recent = signal<VoucherListItem[]>([]);
  saving = signal(false);
  error = signal('');
  editingId = signal<string | null>(null);
  editingNo = signal('');

  // List filters + pagination
  filterType = signal('');
  filterFrom = signal('');
  filterTo = signal('');
  page = signal(1);
  pageSize = signal(25);
  total = signal(0);
  loadingList = signal(false);

  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  rangeStart = computed(() => this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1);
  rangeEnd = computed(() => Math.min(this.page() * this.pageSize(), this.total()));

  // View modal
  viewVoucher = signal<VoucherDetail | null>(null);
  viewTotalDr = computed(() => (this.viewVoucher()?.lines ?? []).filter(l => l.debitCredit === 'Dr').reduce((s, l) => s + (+l.amount || 0), 0));
  viewTotalCr = computed(() => (this.viewVoucher()?.lines ?? []).filter(l => l.debitCredit === 'Cr').reduce((s, l) => s + (+l.amount || 0), 0));

  form = signal({
    voucherType: 'payment',
    voucherDate: new Date().toISOString().split('T')[0],
    narration: ''
  });

  lines = signal<LineRow[]>([
    { ledgerId: '', debitCredit: 'Dr', amount: 0, narration: '' },
    { ledgerId: '', debitCredit: 'Cr', amount: 0, narration: '' }
  ]);

  totalDr = computed(() => this.lines().filter(l => l.debitCredit === 'Dr').reduce((s, l) => s + (+l.amount || 0), 0));
  totalCr = computed(() => this.lines().filter(l => l.debitCredit === 'Cr').reduce((s, l) => s + (+l.amount || 0), 0));
  isBalanced = computed(() => Math.abs(this.totalDr() - this.totalCr()) < 0.01 && this.totalDr() > 0);

  voucherTypeLabel = computed(() => this.voucherTypes.find(v => v.code === this.form().voucherType)?.label ?? '');
  voucherTypeHint  = computed(() => this.voucherTypes.find(v => v.code === this.form().voucherType)?.hint ?? '');

  ngOnInit() {
    this.svc.listLedgers().subscribe(l => this.ledgers.set(l));
    this.loadRecent();
  }

  loadRecent() {
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
        this.recent.set(r.items);
        this.total.set(r.total);
        this.loadingList.set(false);
      },
      error: () => this.loadingList.set(false)
    });
  }

  // ===== Filters =====
  onFilterType(v: string) { this.filterType.set(v); this.page.set(1); this.loadRecent(); }
  onFilterFrom(v: string) { this.filterFrom.set(v); this.page.set(1); this.loadRecent(); }
  onFilterTo(v: string) { this.filterTo.set(v); this.page.set(1); this.loadRecent(); }
  clearFilters() {
    this.filterType.set('');
    this.filterFrom.set('');
    this.filterTo.set('');
    this.page.set(1);
    this.loadRecent();
  }

  // ===== Pagination =====
  onPageSize(size: number) { this.pageSize.set(size); this.page.set(1); this.loadRecent(); }
  prevPage() { if (this.page() > 1) { this.page.update(p => p - 1); this.loadRecent(); } }
  nextPage() { if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.loadRecent(); } }

  // ===== View modal =====
  openView(id: string) {
    this.svc.getVoucher(id).subscribe({
      next: (v) => this.viewVoucher.set(v),
      error: (e) => this.toast.error(e?.error?.error ?? 'Voucher load nahi hua')
    });
  }
  closeView() { this.viewVoucher.set(null); }

  selectType(code: string) {
    this.form.update(f => ({ ...f, voucherType: code }));
  }

  updateField(field: 'voucherDate' | 'narration', value: string) {
    this.form.update(f => ({ ...f, [field]: value }));
  }

  updateLine(idx: number, field: keyof LineRow, value: any) {
    this.lines.update(arr => arr.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }

  addLine() {
    this.lines.update(arr => [...arr, { ledgerId: '', debitCredit: 'Dr', amount: 0, narration: '' }]);
  }

  removeLine(idx: number) {
    this.lines.update(arr => arr.filter((_, i) => i !== idx));
  }

  reset() {
    this.lines.set([
      { ledgerId: '', debitCredit: 'Dr', amount: 0, narration: '' },
      { ledgerId: '', debitCredit: 'Cr', amount: 0, narration: '' }
    ]);
    this.form.update(f => ({ ...f, narration: '' }));
    this.error.set('');
    this.editingId.set(null);
    this.editingNo.set('');
  }

  /** Auto-posted vouchers (bill/payment/hr se) ko manual edit/delete se bachao —
   *  warna source document ke saath accounting desync ho jaayegi. Manual vouchers
   *  ka sourceModule 'accounting' (ya khaali) hota hai → wo editable rehte hain. */
  isAutoPosted(v: VoucherListItem): boolean {
    return !!v.sourceModule && v.sourceModule !== 'accounting';
  }

  // ===== Edit voucher =====
  startEdit(id: string) {
    this.svc.getVoucher(id).subscribe({
      next: (v) => {
        this.editingId.set(v.id);
        this.editingNo.set(v.voucherNo);
        this.form.set({
          voucherType: v.voucherType,
          voucherDate: (v.voucherDate || '').split('T')[0],
          narration: v.narration || ''
        });
        this.lines.set(v.lines.map(l => ({
          ledgerId: l.ledgerId,
          debitCredit: l.debitCredit,
          amount: +l.amount,
          narration: l.narration || ''
        })));
        this.error.set('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (e) => this.toast.error(e?.error?.error ?? 'Voucher load nahi hua')
    });
  }

  cancelEdit() { this.reset(); }

  // ===== Delete voucher =====
  deleteVoucher(id: string, no: string) {
    if (!confirm(`Voucher ${no} delete karna hai? Wapas nahi aayega.`)) return;
    this.svc.deleteVoucher(id).subscribe({
      next: () => {
        this.toast.success(`Voucher ${no} delete ho gaya`);
        if (this.editingId() === id) this.reset();
        this.loadRecent();
      },
      error: (e) => this.toast.error(e?.error?.error ?? 'Delete nahi hua')
    });
  }

  save() {
    if (!this.isBalanced()) {
      this.error.set('Voucher is not balanced. Total Debits must equal Total Credits.');
      return;
    }

    const validLines = this.lines().filter(l => l.ledgerId && l.amount > 0);
    if (validLines.length < 2) {
      this.error.set('At least 2 lines required (one debit, one credit)');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    const payload = {
      voucherType: this.form().voucherType,
      voucherDate: this.form().voucherDate,
      narration: this.form().narration || null,
      lines: validLines.map(l => ({
        ledgerId: l.ledgerId,
        debitCredit: l.debitCredit,
        amount: +l.amount,
        narration: l.narration || null
      }))
    };

    const editId = this.editingId();
    const req = editId ? this.svc.updateVoucher(editId, payload) : this.svc.createVoucher(payload);

    req.subscribe({
      next: (v) => {
        this.toast.success(editId
          ? `Voucher ${v.voucherNo} update ho gaya!`
          : `Voucher ${v.voucherNo} successfully save ho gaya!`);
        this.reset();
        this.loadRecent();
        this.saving.set(false);
      },
      error: (e) => {
        this.error.set(e?.error?.error ?? 'Failed to save voucher');
        this.saving.set(false);
      }
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
