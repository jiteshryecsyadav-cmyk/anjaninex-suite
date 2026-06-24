import { Component, inject, signal, computed, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountingService, LedgerTransaction } from '../services/accounting.service';
import { amountInWords } from '../../../shared/amount-in-words.util';

/**
 * Ledger Statement / Khata — generic per ledgerId.
 * Works for party ledgers (supplier/buyer khata) AND expense ledgers (Rent, Salary...).
 * Renders as a full-screen modal overlay. Emits (close) when dismissed.
 *
 * Print: a print-only container (#ledgerPrint) is shown only via @media print so the
 * rest of the app chrome is hidden; window.print() then prints just the statement.
 */
@Component({
  selector: 'app-ledger-statement',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, DatePipe],
  template: `
    <div class="ls-backdrop" (click)="onClose()">
      <div class="ls-box" (click)="$event.stopPropagation()">

        <!-- ===== SCREEN HEADER (hidden on print) ===== -->
        <div class="ls-head no-print">
          <div>
            <div class="ls-title">📒 {{ ledgerName() || 'Ledger' }} — Statement</div>
            <div class="ls-sub">Khata / running balance</div>
          </div>
          <div class="ls-head-actions">
            <button class="ls-btn-print" (click)="print()">🖨 Print</button>
            <button class="ls-close" (click)="onClose()">✕</button>
          </div>
        </div>

        <!-- ===== DATE RANGE + CLOSING (hidden on print) ===== -->
        <div class="ls-controls no-print">
          <div class="ls-dates">
            <label>From <input type="date" [(ngModel)]="from" (change)="reload()"></label>
            <label>To <input type="date" [(ngModel)]="to" (change)="reload()"></label>
          </div>
          <div class="ls-closing">
            <span class="ls-closing-lbl">CLOSING / NET BALANCE</span>
            <span class="ls-closing-val" [class.dr]="closingType() === 'Dr'" [class.cr]="closingType() === 'Cr'">
              ₹{{ closingBalance() | number:'1.2-2' }} {{ closingType() }}
            </span>
            @if (closingWords()) { <span class="ls-closing-words">{{ closingWords() }}</span> }
          </div>
        </div>

        <!-- ===== PRINTABLE STATEMENT ===== -->
        <div id="ledgerPrint" class="ls-print-area">
          <!-- Print-only header -->
          <div class="ls-print-head print-only">
            <h1>{{ firmName }}</h1>
            <h2>Ledger Statement — {{ ledgerName() }}</h2>
            <p>Period: {{ from | date:'dd MMM yyyy' }} to {{ to | date:'dd MMM yyyy' }}</p>
          </div>

          @if (loading()) {
            <div class="ls-empty">Loading statement…</div>
          } @else if (rows().length === 0 || (rows().length === 1 && rows()[0].balance === 0)) {
            <div class="ls-empty">
              Is period me koi transaction nahi mila.
            </div>
          } @else {
            <table class="ls-table">
              <thead>
                <tr>
                  <th class="t-left">Date</th>
                  <th class="t-left">Voucher No</th>
                  <th class="t-left">Type</th>
                  <th class="t-left">Particulars</th>
                  <th class="t-right">Debit</th>
                  <th class="t-right">Credit</th>
                  <th class="t-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                @for (r of rows(); track $index) {
                  <tr [class.ls-opening]="$index === 0">
                    <td>{{ r.date | date:'dd-MM-yyyy' }}</td>
                    <td>{{ r.voucherNo }}</td>
                    <td>{{ r.voucherType }}</td>
                    <td>{{ $index === 0 ? 'Opening Balance' : (r.narration || '—') }}</td>
                    <td class="t-right mono">{{ r.debit ? (r.debit | number:'1.2-2') : '' }}</td>
                    <td class="t-right mono">{{ r.credit ? (r.credit | number:'1.2-2') : '' }}</td>
                    <td class="t-right mono">{{ r.balance | number:'1.2-2' }} {{ r.balanceType }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr class="ls-foot">
                  <td colspan="4" class="t-right">Period Total / Closing</td>
                  <td class="t-right mono">{{ totalDebit() | number:'1.2-2' }}</td>
                  <td class="t-right mono">{{ totalCredit() | number:'1.2-2' }}</td>
                  <td class="t-right mono">{{ closingBalance() | number:'1.2-2' }} {{ closingType() }}</td>
                </tr>
              </tfoot>
            </table>

            <div class="ls-print-closing print-only">
              <strong>Closing / Net Balance: ₹{{ closingBalance() | number:'1.2-2' }} {{ closingType() }}</strong>
              @if (closingWords()) { <div class="ls-words">({{ closingWords() }})</div> }
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ls-backdrop { position: fixed; inset: 0; background: rgba(27,46,92,0.6); z-index: 200;
      display: flex; align-items: flex-start; justify-content: center; padding: 24px; overflow-y: auto; }
    .ls-box { background: #fff; border-radius: 14px; width: 100%; max-width: 980px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.3); overflow: hidden; }
    .ls-head { background: #5c1a8b; color: #fff; padding: 16px 22px; display: flex;
      justify-content: space-between; align-items: center; }
    .ls-title { font-size: 18px; font-weight: 800; }
    .ls-sub { font-size: 12px; opacity: 0.85; }
    .ls-head-actions { display: flex; align-items: center; gap: 10px; }
    .ls-btn-print { background: #fff; color: #5c1a8b; border: 0; padding: 8px 16px;
      border-radius: 8px; font-weight: 800; cursor: pointer; font-size: 13px; }
    .ls-close { background: rgba(255,255,255,0.2); color: #fff; border: 0; width: 32px; height: 32px;
      border-radius: 8px; cursor: pointer; font-size: 16px; }
    .ls-controls { display: flex; justify-content: space-between; align-items: center;
      flex-wrap: wrap; gap: 12px; padding: 14px 22px; border-bottom: 1px solid #eee; background: #faf5ff; }
    .ls-dates { display: flex; gap: 16px; }
    .ls-dates label { font-size: 12px; font-weight: 700; color: #6b3fa0; display: flex; flex-direction: column; gap: 3px; }
    .ls-dates input { border: 1px solid #ddc8f5; border-radius: 6px; padding: 6px 8px; font-size: 13px; }
    .ls-closing { text-align: right; display: flex; flex-direction: column; }
    .ls-closing-lbl { font-size: 10px; font-weight: 700; color: #6b3fa0; letter-spacing: 0.4px; }
    .ls-closing-val { font-size: 22px; font-weight: 900; font-family: 'JetBrains Mono', monospace; }
    .ls-closing-val.dr { color: #16a34a; }
    .ls-closing-val.cr { color: #dc2626; }
    .ls-closing-words { font-size: 10px; font-style: italic; color: #6b7280; max-width: 320px; }
    .ls-print-area { padding: 18px 22px; }
    .ls-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .ls-table th { background: #f0e6ff; color: #5c1a8b; padding: 8px 10px; text-transform: uppercase;
      font-size: 10px; letter-spacing: 0.3px; }
    .ls-table td { padding: 7px 10px; border-bottom: 1px solid #f0eef5; }
    .ls-table tbody tr:hover { background: #faf5ff; }
    .ls-opening { background: #fbf7ff; font-weight: 600; }
    .ls-foot td { border-top: 2px solid #5c1a8b; font-weight: 800; background: #f7f2ff; }
    .t-left { text-align: left; } .t-right { text-align: right; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .ls-empty { padding: 40px; text-align: center; color: #9ca3af; font-size: 13px; }
    .print-only { display: none; }
    .ls-words { font-size: 11px; font-style: italic; color: #555; }

    @media print {
      :host { position: static; }
      .ls-backdrop { position: static; background: #fff; padding: 0; display: block; overflow: visible; }
      .ls-box { box-shadow: none; max-width: none; border-radius: 0; }
      .no-print { display: none !important; }
      .print-only { display: block !important; }
      .ls-print-head h1 { font-size: 20px; margin: 0; }
      .ls-print-head h2 { font-size: 15px; margin: 4px 0; font-weight: 700; }
      .ls-print-head p { font-size: 12px; margin: 0 0 12px; }
      .ls-print-closing { margin-top: 14px; font-size: 14px; }
    }
  `]
})
export class LedgerStatementComponent implements OnInit {
  private svc = inject(AccountingService);

  @Input({ required: true }) ledgerId!: string;
  @Input() initialName: string | null = null;
  @Input() firmName = 'Anjaninex';   // parent (ledgers page) asli firm naam pass karta hai
  @Output() close = new EventEmitter<void>();

  ledgerName = signal<string | null>(null);
  rows = signal<LedgerTransaction[]>([]);
  loading = signal(true);

  // Default range: start of current FY (1 Apr) → today.
  from = '';
  to = '';

  ngOnInit() {
    this.ledgerName.set(this.initialName);
    const now = new Date();
    const fyStartYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    this.from = `${fyStartYear}-04-01`;
    this.to = now.toISOString().slice(0, 10);
    // Fetch ledger name if not provided.
    if (!this.initialName) {
      this.svc.getLedger(this.ledgerId).subscribe({
        next: (l) => this.ledgerName.set(l.name),
        error: () => {}
      });
    }
    this.reload();
  }

  reload() {
    this.loading.set(true);
    this.svc.ledgerStatement(this.ledgerId, this.from, this.to).subscribe({
      next: (r) => { this.rows.set(r ?? []); this.loading.set(false); },
      error: () => { this.rows.set([]); this.loading.set(false); }
    });
  }

  // Closing = last row's running balance (or opening row if no transactions).
  private last = computed(() => this.rows().length ? this.rows()[this.rows().length - 1] : null);
  closingBalance = computed(() => this.last()?.balance ?? 0);
  closingType = computed(() => this.last()?.balanceType ?? 'Dr');
  closingWords = computed(() => amountInWords(this.closingBalance()));

  // Totals exclude the opening row (index 0).
  totalDebit = computed(() => this.rows().slice(1).reduce((s, r) => s + (r.debit || 0), 0));
  totalCredit = computed(() => this.rows().slice(1).reduce((s, r) => s + (r.credit || 0), 0));

  // Print: ek alag clean window me sirf khata table — SPA layout/global CSS ki wajah
  // se window.print() blank aata tha. Ab self-contained HTML print hota hai.
  print() {
    const rws = this.rows();
    if (!rws.length) { return; }

    const name = this.ledgerName() || 'Ledger';
    const period = `${this.fmtDate(this.from)} to ${this.fmtDate(this.to)}`;

    const bodyRows = rws.map((r, i) => `
      <tr${i === 0 ? ' class="op"' : ''}>
        <td>${this.fmtDate(r.date)}</td>
        <td>${this.esc(r.voucherNo)}</td>
        <td>${this.esc(r.voucherType)}</td>
        <td>${i === 0 ? 'Opening Balance' : this.esc(r.narration || '—')}</td>
        <td class="r">${r.debit ? this.fmtNo(r.debit) : ''}</td>
        <td class="r">${r.credit ? this.fmtNo(r.credit) : ''}</td>
        <td class="r">${this.fmtNo(r.balance)} ${r.balanceType ?? ''}</td>
      </tr>`).join('');

    const footRow = `
      <tr class="ft">
        <td colspan="4" class="r">Period Total / Closing</td>
        <td class="r">${this.fmtNo(this.totalDebit())}</td>
        <td class="r">${this.fmtNo(this.totalCredit())}</td>
        <td class="r">${this.fmtNo(this.closingBalance())} ${this.closingType()}</td>
      </tr>`;

    const words = this.closingWords() ? `<div class="words">(${this.esc(this.closingWords())})</div>` : '';

    const html = `<!doctype html><html><head><meta charset="utf-8">
      <title>${this.esc(name)} — Ledger Statement</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1b2e5c; margin: 24px; }
        h1 { font-size: 20px; margin: 0; }
        h2 { font-size: 15px; margin: 4px 0; font-weight: 700; }
        p.period { font-size: 12px; margin: 0 0 14px; color: #555; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #f0e6ff; color: #5c1a8b; padding: 7px 9px; text-align: left;
             text-transform: uppercase; font-size: 10px; border-bottom: 1px solid #d9c6f5; }
        td { padding: 6px 9px; border-bottom: 1px solid #eee; }
        td.r, th.r { text-align: right; font-variant-numeric: tabular-nums; }
        tr.op td { background: #fbf7ff; font-weight: 600; }
        tr.ft td { border-top: 2px solid #5c1a8b; font-weight: 800; background: #f7f2ff; }
        .closing { margin-top: 14px; font-size: 14px; font-weight: 800; }
        .words { font-size: 11px; font-style: italic; color: #555; font-weight: 400; }
      </style></head><body>
        <h1>${this.esc(this.firmName)}</h1>
        <h2>Ledger Statement — ${this.esc(name)}</h2>
        <p class="period">Period: ${period}</p>
        <table>
          <thead><tr>
            <th>Date</th><th>Voucher No</th><th>Type</th><th>Particulars</th>
            <th class="r">Debit</th><th class="r">Credit</th><th class="r">Balance</th>
          </tr></thead>
          <tbody>${bodyRows}${footRow}</tbody>
        </table>
        <div class="closing">Closing / Net Balance: ₹${this.fmtNo(this.closingBalance())} ${this.closingType()}${words}</div>
        <script>window.onload=function(){window.print();}<\/script>
      </body></html>`;

    const w = window.open('', '_blank', 'width=920,height=720');
    if (!w) { window.print(); return; }   // popup blocked → fallback
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ---- print helpers (no Angular pipes in raw HTML) ----
  private esc(v: any): string {
    return String(v ?? '').replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
  }
  private fmtNo(n: number): string {
    return (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  private fmtDate(d: any): string {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    const p = (x: number) => String(x).padStart(2, '0');
    return `${p(dt.getDate())}-${p(dt.getMonth() + 1)}-${dt.getFullYear()}`;
  }

  onClose() { this.close.emit(); }
}
