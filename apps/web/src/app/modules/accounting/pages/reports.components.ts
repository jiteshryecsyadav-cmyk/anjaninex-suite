import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AccountingService, TrialBalance, ProfitLoss, BalanceSheet } from '../services/accounting.service';
import { FeatureService } from '../../../shared/feature.service';

// =============================================================================
// Shared Sub-Nav Template (DRY)
// =============================================================================
const subNavTemplate = `
  <div class="flex gap-1 mb-6 border-b border-[#ddc8f5]">
    <a routerLink="/accounting/heads" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Heads</a>
    <a routerLink="/accounting/groups" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Groups</a>
    <a routerLink="/accounting/sub-groups" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Sub Groups</a>
    <a routerLink="/accounting/ledgers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Ledgers</a>
    <a routerLink="/accounting/vouchers" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Vouchers</a>
    <a routerLink="/accounting/voucher-list" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📋 Voucher List</a>
    <a routerLink="/accounting/trial-balance" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Trial Balance</a>
    <a routerLink="/accounting/profit-loss" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">P&amp;L</a>
    <a routerLink="/accounting/balance-sheet" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Balance Sheet</a>
        <a routerLink="/accounting/activity-log" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
           class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🕵️ Log</a>
  </div>
`;

// =============================================================================
// TRIAL BALANCE
// =============================================================================
@Component({
  selector: 'app-trial-balance',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">⚖️ Trial Balance</h2>
          <p class="text-sm text-[#6b3fa0]">Verifies all debits equal all credits</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <input [(ngModel)]="asOf" type="date" (change)="load()" class="input w-44">
          <button (click)="load()" class="btn-primary">Refresh</button>
          <button (click)="printTB()" class="px-3 py-2 rounded border border-[#ddc8f5] text-[#5c1a8b] font-bold hover:bg-[#f0e6ff] text-sm">🖨 Print</button>
          <button (click)="whatsappTB()" class="px-3 py-2 rounded bg-green-50 text-green-700 font-bold hover:bg-green-100 text-sm">📲 WhatsApp</button>
        </div>
      </div>

      ${subNavTemplate}

      @if (loading()) {
        <div class="card text-center text-gray-500">Loading…</div>
      }
      @if (data(); as d) {
        <div class="card p-0 overflow-hidden">
          <div class="p-4 border-b flex items-center justify-between">
            <div>
              <h3 class="font-display font-bold text-lg">{{ features.firmName() || 'Anjaninex' }} — Trial Balance</h3>
              <p class="text-xs text-gray-500">As of {{ d.asOf }}</p>
            </div>
            @if (d.isBalanced) {
              <span class="px-3 py-1 bg-green-100 text-green-700 rounded text-sm font-bold">
                ✓ Balanced
              </span>
            } @else {
              <span class="px-3 py-1 bg-red-100 text-red-700 rounded text-sm font-bold">
                ✗ Unbalanced
              </span>
            }
          </div>

          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] text-xs uppercase">
              <tr>
                <th class="px-3 py-2 text-left">S.NO</th>
                <th class="px-3 py-2 text-left">Ledger</th>
                <th class="px-3 py-2 text-left">Group</th>
                <th class="px-3 py-2 text-right">Opening Dr</th>
                <th class="px-3 py-2 text-right">Opening Cr</th>
                <th class="px-3 py-2 text-right">Period Dr</th>
                <th class="px-3 py-2 text-right">Period Cr</th>
                <th class="px-3 py-2 text-right font-bold">Closing Dr</th>
                <th class="px-3 py-2 text-right font-bold">Closing Cr</th>
              </tr>
            </thead>
            <tbody>
              @for (r of pagedRows(); track r.ledgerId; let i = $index) {
                <tr class="border-t hover:bg-[#faf5ff]">
                  <td class="px-3 py-2 font-mono text-xs">{{ (page() - 1) * pageSize + i + 1 }}</td>
                  <td class="px-3 py-2 font-semibold">{{ r.ledgerName }}</td>
                  <td class="px-3 py-2 text-xs text-gray-500">{{ r.groupName }}</td>
                  <td class="px-3 py-2 text-right font-mono text-xs">
                    @if (r.openingDr > 0) { ₹{{ r.openingDr | number:'1.2-2' }} } @else { — }
                  </td>
                  <td class="px-3 py-2 text-right font-mono text-xs">
                    @if (r.openingCr > 0) { ₹{{ r.openingCr | number:'1.2-2' }} } @else { — }
                  </td>
                  <td class="px-3 py-2 text-right font-mono text-xs text-green-600">
                    @if (r.periodDr > 0) { ₹{{ r.periodDr | number:'1.2-2' }} } @else { — }
                  </td>
                  <td class="px-3 py-2 text-right font-mono text-xs text-red-600">
                    @if (r.periodCr > 0) { ₹{{ r.periodCr | number:'1.2-2' }} } @else { — }
                  </td>
                  <td class="px-3 py-2 text-right font-mono font-bold text-green-700">
                    @if (r.closingDr > 0) { ₹{{ r.closingDr | number:'1.2-2' }} } @else { — }
                  </td>
                  <td class="px-3 py-2 text-right font-mono font-bold text-red-700">
                    @if (r.closingCr > 0) { ₹{{ r.closingCr | number:'1.2-2' }} } @else { — }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="9" class="px-3 py-8 text-center text-gray-400">
                  No transactions yet. <a routerLink="/accounting/vouchers" class="text-[#5c1a8b] underline">Add a voucher</a>
                </td></tr>
              }
            </tbody>
            <tfoot class="bg-gray-100 font-bold">
              <tr>
                <td colspan="7" class="px-3 py-3 text-right">TOTALS:</td>
                <td class="px-3 py-3 text-right font-mono text-green-700">
                  ₹{{ d.totalDr | number:'1.2-2' }}
                </td>
                <td class="px-3 py-3 text-right font-mono text-red-700">
                  ₹{{ d.totalCr | number:'1.2-2' }}
                </td>
              </tr>
            </tfoot>
          </table>

          <!-- Pagination — 100 entry per page -->
          @if (totalPages() > 1) {
            <div class="flex items-center justify-between p-3 border-t border-[#f0e6ff] text-sm">
              <span class="text-gray-500 font-mono text-xs">{{ rangeStart() }}–{{ rangeEnd() }} of {{ d.rows.length }}</span>
              <div class="flex items-center gap-2">
                <button (click)="prevPage()" [disabled]="page() <= 1"
                        class="px-3 py-1 rounded border border-[#ddc8f5] text-[#5c1a8b] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f0e6ff]">‹ Prev</button>
                <span class="text-gray-500 font-mono text-xs">Page {{ page() }}/{{ totalPages() }}</span>
                <button (click)="nextPage()" [disabled]="page() >= totalPages()"
                        class="px-3 py-1 rounded border border-[#ddc8f5] text-[#5c1a8b] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f0e6ff]">Next ›</button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `
})
export class TrialBalanceComponent {
  private svc = inject(AccountingService);
  features = inject(FeatureService);
  data = signal<TrialBalance | null>(null);
  loading = signal(true);
  asOf = new Date().toISOString().split('T')[0];

  // Pagination — 100 entry per page, baaki next page.
  readonly pageSize = 100;
  page = signal(1);
  totalPages = computed(() => Math.max(1, Math.ceil((this.data()?.rows.length ?? 0) / this.pageSize)));
  pagedRows = computed(() => {
    const rows = this.data()?.rows ?? [];
    const start = (this.page() - 1) * this.pageSize;
    return rows.slice(start, start + this.pageSize);
  });
  rangeStart = computed(() => (this.data()?.rows.length ?? 0) === 0 ? 0 : (this.page() - 1) * this.pageSize + 1);
  rangeEnd = computed(() => Math.min(this.page() * this.pageSize, this.data()?.rows.length ?? 0));

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.page.set(1);   // naye data par pehle page se
    this.svc.trialBalance(this.asOf).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  prevPage() { if (this.page() > 1) this.page.update(p => p - 1); }
  nextPage() { if (this.page() < this.totalPages()) this.page.update(p => p + 1); }

  // ===== Print — poori Trial Balance (saari rows) naye window me =====
  printTB() {
    const d = this.data();
    if (!d) return;
    const fmt = (n: number) => n > 0 ? '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
    const rows = d.rows.map((r, i) =>
      `<tr>
        <td style="border:1px solid #ccc;padding:4px 6px">${i + 1}</td>
        <td style="border:1px solid #ccc;padding:4px 6px">${r.ledgerName}</td>
        <td style="border:1px solid #ccc;padding:4px 6px">${r.groupName || ''}</td>
        <td style="border:1px solid #ccc;padding:4px 6px;text-align:right">${fmt(r.closingDr)}</td>
        <td style="border:1px solid #ccc;padding:4px 6px;text-align:right">${fmt(r.closingCr)}</td>
      </tr>`).join('');
    const html =
      `<!doctype html><html><head><meta charset="utf-8"><title>Trial Balance</title></head>
      <body style="font-family:Arial,sans-serif;padding:20px;color:#222">
        <h2 style="margin:0 0 2px">${this.features.firmName() || 'Anjaninex'} — Trial Balance</h2>
        <p style="margin:0 0 12px;color:#666">As of ${d.asOf} &nbsp;·&nbsp; ${d.isBalanced ? 'Balanced' : 'UNBALANCED'}</p>
        <table style="border-collapse:collapse;width:100%;font-size:12px">
          <thead><tr style="background:#f0e6ff">
            <th style="border:1px solid #ccc;padding:4px 6px;text-align:left">S.No</th>
            <th style="border:1px solid #ccc;padding:4px 6px;text-align:left">Ledger</th>
            <th style="border:1px solid #ccc;padding:4px 6px;text-align:left">Group</th>
            <th style="border:1px solid #ccc;padding:4px 6px;text-align:right">Closing Dr</th>
            <th style="border:1px solid #ccc;padding:4px 6px;text-align:right">Closing Cr</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr style="font-weight:bold;background:#f5f5f5">
            <td colspan="3" style="border:1px solid #ccc;padding:4px 6px;text-align:right">TOTALS</td>
            <td style="border:1px solid #ccc;padding:4px 6px;text-align:right">₹${d.totalDr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td style="border:1px solid #ccc;padding:4px 6px;text-align:right">₹${d.totalCr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          </tr></tfoot>
        </table>
      </body></html>`;
    const w = window.open('', '_blank', 'width=900,height=680');
    if (!w) { alert('Popup block ho raha — browser me allow karein'); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch {} }, 350);
  }

  // ===== WhatsApp — Trial Balance ka summary (poori list bahut badi hoti, isliye totals) =====
  whatsappTB() {
    const d = this.data();
    if (!d) return;
    const txt =
      `*Trial Balance — ${this.features.firmName() || 'Anjaninex'}*\n` +
      `As of ${d.asOf}\n` +
      `Ledgers: ${d.rows.length}\n` +
      `Total Dr: ₹${d.totalDr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
      `Total Cr: ₹${d.totalCr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
      `Status: ${d.isBalanced ? 'Balanced ✅' : 'UNBALANCED ⚠️'}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
  }
}

// =============================================================================
// PROFIT & LOSS
// =============================================================================
@Component({
  selector: 'app-profit-loss',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe],
  template: `
    <div class="max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">📈 Profit & Loss</h2>
          <p class="text-sm text-[#6b3fa0]">Income minus Expenses for the period</p>
        </div>
        <div class="flex gap-2 items-center">
          <input [(ngModel)]="fromDate" type="date" (change)="load()" class="input w-40">
          <span>to</span>
          <input [(ngModel)]="toDate" type="date" (change)="load()" class="input w-40">
        </div>
      </div>

      ${subNavTemplate}

      @if (loading()) {
        <div class="card text-center text-gray-500">Loading…</div>
      }
      @if (data(); as d) {
        <div class="grid grid-cols-2 gap-4 mb-4">

          <!-- Expenses -->
          <div class="card p-0 overflow-hidden">
            <div class="bg-red-50 px-4 py-3 border-b border-red-200">
              <h3 class="font-display font-bold text-red-700">📉 Expenses</h3>
            </div>
            <table class="w-full text-sm">
              @for (r of d.expenseRows; track r.ledgerId) {
                <tr class="border-b">
                  <td class="px-4 py-2">{{ r.ledgerName }}</td>
                  <td class="px-4 py-2 text-right font-mono">
                    ₹{{ (r.closingDr - r.closingCr) | number:'1.2-2' }}
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="2" class="px-4 py-6 text-center text-gray-400">No expenses</td></tr>
              }
              <tr class="bg-red-100 font-bold">
                <td class="px-4 py-2">Total Expenses</td>
                <td class="px-4 py-2 text-right font-mono">₹{{ d.totalExpense | number:'1.2-2' }}</td>
              </tr>
            </table>
          </div>

          <!-- Income -->
          <div class="card p-0 overflow-hidden">
            <div class="bg-green-50 px-4 py-3 border-b border-green-200">
              <h3 class="font-display font-bold text-green-700">📈 Income</h3>
            </div>
            <table class="w-full text-sm">
              @for (r of d.incomeRows; track r.ledgerId) {
                <tr class="border-b">
                  <td class="px-4 py-2">{{ r.ledgerName }}</td>
                  <td class="px-4 py-2 text-right font-mono">
                    ₹{{ (r.closingCr - r.closingDr) | number:'1.2-2' }}
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="2" class="px-4 py-6 text-center text-gray-400">No income</td></tr>
              }
              <tr class="bg-green-100 font-bold">
                <td class="px-4 py-2">Total Income</td>
                <td class="px-4 py-2 text-right font-mono">₹{{ d.totalIncome | number:'1.2-2' }}</td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Net Profit/Loss -->
        <div class="card text-center"
             [class]="d.netProfit >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'">
          <div class="text-sm text-gray-600 uppercase tracking-wider mb-1">
            {{ d.netProfit >= 0 ? 'Net Profit' : 'Net Loss' }}
          </div>
          <div class="text-4xl font-display font-black"
               [class.text-green-700]="d.netProfit >= 0"
               [class.text-red-700]="d.netProfit < 0">
            ₹{{ (d.netProfit < 0 ? -d.netProfit : d.netProfit) | number:'1.2-2' }}
          </div>
          <p class="text-xs text-gray-500 mt-2">{{ d.from }} to {{ d.to }}</p>
        </div>
      }
    </div>
  `
})
export class ProfitLossComponent {
  private svc = inject(AccountingService);
  data = signal<ProfitLoss | null>(null);
  loading = signal(true);
  fromDate = `${new Date().getFullYear()}-04-01`;
  toDate = new Date().toISOString().split('T')[0];

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.svc.profitLoss(this.fromDate, this.toDate).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}

// =============================================================================
// BALANCE SHEET
// =============================================================================
@Component({
  selector: 'app-balance-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe],
  template: `
    <div class="max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">⚖️ Balance Sheet</h2>
          <p class="text-sm text-[#6b3fa0]">Snapshot of financial position</p>
        </div>
        <div class="flex gap-2">
          <input [(ngModel)]="asOf" type="date" (change)="load()" class="input w-44">
        </div>
      </div>

      ${subNavTemplate}

      @if (loading()) {
        <div class="card text-center text-gray-500">Loading…</div>
      }
      @if (data(); as d) {
        <div class="grid grid-cols-2 gap-4">
          <!-- Liabilities + Capital -->
          <div class="card p-0 overflow-hidden">
            <div class="bg-red-50 px-4 py-3 border-b">
              <h3 class="font-display font-bold text-red-700">Liabilities & Capital</h3>
            </div>
            <table class="w-full text-sm">
              @for (r of d.liabilities; track r.name) {
                <tr class="border-b">
                  <td class="px-4 py-2">
                    <div>{{ r.name }}</div>
                    <div class="text-xs text-gray-500">{{ r.section }}</div>
                  </td>
                  <td class="px-4 py-2 text-right font-mono">₹{{ r.amount | number:'1.2-2' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="2" class="px-4 py-6 text-center text-gray-400">—</td></tr>
              }
              <tr class="bg-red-100 font-bold">
                <td class="px-4 py-2">Total</td>
                <td class="px-4 py-2 text-right font-mono">₹{{ d.totalLiabilities | number:'1.2-2' }}</td>
              </tr>
            </table>
          </div>

          <!-- Assets -->
          <div class="card p-0 overflow-hidden">
            <div class="bg-green-50 px-4 py-3 border-b">
              <h3 class="font-display font-bold text-green-700">Assets</h3>
            </div>
            <table class="w-full text-sm">
              @for (r of d.assets; track r.name) {
                <tr class="border-b">
                  <td class="px-4 py-2">{{ r.name }}</td>
                  <td class="px-4 py-2 text-right font-mono">₹{{ r.amount | number:'1.2-2' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="2" class="px-4 py-6 text-center text-gray-400">—</td></tr>
              }
              <tr class="bg-green-100 font-bold">
                <td class="px-4 py-2">Total</td>
                <td class="px-4 py-2 text-right font-mono">₹{{ d.totalAssets | number:'1.2-2' }}</td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Balance check -->
        <div class="mt-4 card text-center"
             [class]="Math.abs(d.totalAssets - d.totalLiabilities) < 0.01 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'">
          @if (Math.abs(d.totalAssets - d.totalLiabilities) < 0.01) {
            <span class="text-green-700 font-bold">✓ Balanced</span>
          } @else {
            <span class="text-yellow-700">
              ⚠️ Difference: ₹{{ Math.abs(d.totalAssets - d.totalLiabilities) | number:'1.2-2' }}
              (will balance once all entries posted)
            </span>
          }
          <p class="text-xs text-gray-500 mt-1">As of {{ d.asOf }}</p>
        </div>
      }
    </div>
  `
})
export class BalanceSheetComponent {
  Math = Math;
  private svc = inject(AccountingService);
  data = signal<BalanceSheet | null>(null);
  loading = signal(true);
  asOf = new Date().toISOString().split('T')[0];

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.svc.balanceSheet(this.asOf).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}
