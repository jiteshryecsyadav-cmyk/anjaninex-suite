import { Component, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface BooksSummary {
  ready: boolean; booksFirmId?: string;
  income?: number; expense?: number; net?: number; voucherCount?: number;
}
interface VoucherRow { id: string; type: string; no: string; date: string; amount: number; narration: string | null; }
interface LedgerOpt { id: string; name: string; }
interface AllLedger { id: string; name: string; subGroup: string; head: string; }
interface SubGroupOpt { id: string; name: string; }
interface VLine { ledgerId: string | null; drCr: 'Dr' | 'Cr'; amount: number | null; }

@Component({
  selector: 'app-admin-books',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  template: `
    <div class="max-w-6xl mx-auto p-4">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">📒 Anjaninex Accounting</h2>
          <p class="text-sm text-[#6b3fa0]">Income auto aata hai (payment approve par) · Expense yahan se daalo</p>
        </div>
        <button (click)="load()" class="px-3 py-1.5 text-sm border border-[#ddc8f5] rounded hover:bg-purple-50">🔄 Refresh</button>
      </div>

      @if (loading()) {
        <div class="card text-center text-gray-500 py-8">Loading…</div>
      } @else if (!summary()?.ready) {
        <!-- Setup -->
        <div class="card text-center py-10">
          <div class="text-4xl mb-3">📒</div>
          <h3 class="font-bold text-lg text-[#5c1a8b] mb-2">Books abhi setup nahi hai</h3>
          <p class="text-sm text-gray-500 mb-4">Ek click me internal "Anjaninex Books" + pura chart of accounts ban jayega.<br>Uske baad income auto-post hogi aur expense yahin se daal paoge.</p>
          <button (click)="init()" [disabled]="initing()" class="btn-primary">
            {{ initing() ? 'Setup ho raha…' : '⚡ 1-Click Books Setup' }}
          </button>
        </div>
      } @else {
        <!-- Summary cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div class="card text-center border-l-4 border-green-600">
            <div class="text-2xl font-black text-green-700">₹{{ summary()!.income | number:'1.0-0' }}</div>
            <div class="text-xs uppercase font-bold text-gray-500">Income (Receipts)</div>
          </div>
          <div class="card text-center border-l-4 border-red-600">
            <div class="text-2xl font-black text-red-600">₹{{ summary()!.expense | number:'1.0-0' }}</div>
            <div class="text-xs uppercase font-bold text-gray-500">Expense (Payments)</div>
          </div>
          <div class="card text-center border-l-4 border-purple-600">
            <div class="text-2xl font-black" [class.text-green-700]="(summary()!.net ?? 0) >= 0" [class.text-red-600]="(summary()!.net ?? 0) < 0">
              ₹{{ summary()!.net | number:'1.0-0' }}
            </div>
            <div class="text-xs uppercase font-bold text-gray-500">Net (Profit)</div>
          </div>
          <div class="card text-center border-l-4 border-blue-600">
            <div class="text-2xl font-black text-blue-700">{{ summary()!.voucherCount }}</div>
            <div class="text-xs uppercase font-bold text-gray-500">Total Vouchers</div>
          </div>
        </div>

        <!-- Add expense -->
        <div class="card mb-5">
          <h3 class="font-bold text-[#5c1a8b] mb-3">➖ Expense Entry (kharcha daalo)</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label class="lbl">Date</label>
              <input type="date" [(ngModel)]="exDate" class="input">
            </div>
            <div>
              <label class="lbl">Kharcha kis cheez ka</label>
              <select [(ngModel)]="exLedgerId" class="input">
                @for (l of ledgers(); track l.id) { <option [ngValue]="l.id">{{ l.name }}</option> }
                <option [ngValue]="null">➕ Naya kharcha type…</option>
              </select>
              @if (exLedgerId === null) {
                <input [(ngModel)]="exNewLedger" class="input mt-2" placeholder="e.g. Server Cost, Marketing">
              }
            </div>
            <div>
              <label class="lbl">Amount (₹)</label>
              <input type="number" min="1" [(ngModel)]="exAmount" class="input" placeholder="0">
            </div>
            <div>
              <label class="lbl">Paisa gaya</label>
              <select [(ngModel)]="exPaidFrom" class="input">
                <option value="bank">🏦 Bank se</option>
                <option value="cash">💵 Cash se</option>
              </select>
            </div>
            <div class="col-span-2 md:col-span-3">
              <label class="lbl">Narration (optional)</label>
              <input [(ngModel)]="exNarration" class="input" placeholder="e.g. June server bill">
            </div>
            <div class="flex items-end">
              <button (click)="saveExpense()" [disabled]="savingEx()" class="btn-primary w-full">
                {{ savingEx() ? 'Saving…' : '💾 Save Expense' }}
              </button>
            </div>
          </div>
          @if (exMsg()) { <p class="text-green-600 text-sm mt-2">{{ exMsg() }}</p> }
          @if (exErr()) { <p class="text-red-600 text-sm mt-2">{{ exErr() }}</p> }
        </div>

        <!-- Voucher Entry — Journal / Contra / Receipt / Payment (multi-line) -->
        <div class="card mb-5">
          <h3 class="font-bold text-[#5c1a8b] mb-3">📝 Voucher Entry (Journal · Contra · Receipt · Payment)</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div>
              <label class="lbl">Type</label>
              <select [(ngModel)]="vType" class="input">
                <option value="journal">Journal</option>
                <option value="contra">Contra (Cash ↔ Bank)</option>
                <option value="receipt">Receipt</option>
                <option value="payment">Payment</option>
              </select>
            </div>
            <div><label class="lbl">Date</label><input type="date" [(ngModel)]="vDate" class="input"></div>
            <div class="col-span-2"><label class="lbl">Narration</label><input [(ngModel)]="vNarration" class="input" placeholder="optional"></div>
          </div>

          @for (ln of vLines; track $index) {
            <div class="grid grid-cols-12 gap-2 mb-2 items-center">
              <select [(ngModel)]="ln.ledgerId" class="input col-span-6">
                <option [ngValue]="null">— Ledger choose karo —</option>
                @for (l of allLedgers(); track l.id) { <option [ngValue]="l.id">{{ l.name }} · {{ l.head }}</option> }
              </select>
              <select [(ngModel)]="ln.drCr" class="input col-span-2">
                <option value="Dr">Dr</option>
                <option value="Cr">Cr</option>
              </select>
              <input type="number" min="0" [(ngModel)]="ln.amount" class="input col-span-3" placeholder="0">
              <button (click)="removeLine($index)" class="col-span-1 text-red-500 font-bold text-lg" title="Line hatao">✕</button>
            </div>
          }

          <div class="flex flex-wrap items-center gap-3 mt-2">
            <button (click)="addLine()" class="px-3 py-1.5 text-sm border border-[#ddc8f5] rounded hover:bg-purple-50">+ Line</button>
            <span class="text-xs font-mono font-bold" [class.text-green-700]="vBalanced()" [class.text-red-600]="!vBalanced()">
              Dr ₹{{ vDr() | number:'1.2-2' }} · Cr ₹{{ vCr() | number:'1.2-2' }} {{ vBalanced() ? '✓ balanced' : '✗ barabar karo' }}
            </span>
            <button (click)="saveVoucher()" [disabled]="savingV() || !vBalanced()" class="btn-primary">
              {{ savingV() ? 'Saving…' : '💾 Save Voucher' }}
            </button>
          </div>
          @if (vMsg()) { <p class="text-green-600 text-sm mt-2">{{ vMsg() }}</p> }
          @if (vErr()) { <p class="text-red-600 text-sm mt-2">{{ vErr() }}</p> }

          <details class="mt-3">
            <summary class="text-xs font-bold text-[#6b3fa0] cursor-pointer">➕ Naya Ledger banana ho to yahan kholo</summary>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
              <input [(ngModel)]="nlName" class="input" placeholder="Ledger naam (e.g. SBI Bank)">
              <select [(ngModel)]="nlSubGroup" class="input col-span-2">
                <option [ngValue]="null">— Sub-group choose karo —</option>
                @for (s of subGroups(); track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
              </select>
              <button (click)="saveLedger()" [disabled]="savingNl()" class="btn-primary">{{ savingNl() ? '…' : 'Save Ledger' }}</button>
            </div>
            @if (nlMsg()) { <p class="text-green-600 text-sm mt-2">{{ nlMsg() }}</p> }
          </details>
        </div>

        <!-- Reports -->
        <div class="card mb-5">
          <h3 class="font-bold text-[#5c1a8b] mb-3">📊 Reports (print/PDF)</h3>
          <div class="flex flex-wrap items-end gap-3">
            <div><label class="lbl">From (P&L)</label><input type="date" [(ngModel)]="repFrom" class="input"></div>
            <div><label class="lbl">As on / To</label><input type="date" [(ngModel)]="repTo" class="input"></div>
            <button (click)="openReport('tb')" class="btn-primary">⚖️ Trial Balance</button>
            <button (click)="openReport('pnl')" class="btn-primary">📈 P&L</button>
            <button (click)="openReport('bs')" class="btn-primary">🏛️ Balance Sheet</button>
          </div>
        </div>

        <!-- Vouchers -->
        <div class="card p-0 overflow-x-auto">
          <div class="px-4 py-2 border-b bg-[#f0e6ff]">
            <h3 class="font-bold text-[#5c1a8b]">📜 Vouchers (latest pehle)</h3>
          </div>
          @if (vouchers().length === 0) {
            <div class="p-8 text-center text-gray-400">Abhi koi voucher nahi — pehla payment approve karo ya expense daalo.</div>
          } @else {
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th class="px-3 py-2 text-left">S.No</th>
                  <th class="px-3 py-2 text-left">Voucher No</th>
                  <th class="px-3 py-2 text-left">Date</th>
                  <th class="px-3 py-2 text-center">Type</th>
                  <th class="px-3 py-2 text-right">Amount</th>
                  <th class="px-3 py-2 text-left">Narration</th>
                </tr>
              </thead>
              <tbody>
                @for (v of vouchers(); track v.id) {
                  <tr class="border-t hover:bg-[#faf5ff]">
                    <td class="px-3 py-2">{{ $index + 1 }}</td>
                    <td class="px-3 py-2 font-mono text-xs font-bold text-[#5c1a8b]">{{ v.no }}</td>
                    <td class="px-3 py-2 font-mono text-xs">{{ v.date }}</td>
                    <td class="px-3 py-2 text-center">
                      <span class="text-xs px-2 py-0.5 rounded font-bold"
                            [class.bg-green-100]="v.type === 'receipt'"
                            [class.text-green-700]="v.type === 'receipt'"
                            [class.bg-red-100]="v.type === 'payment'"
                            [class.text-red-700]="v.type === 'payment'">
                        {{ v.type === 'receipt' ? '⬇ Income' : v.type === 'payment' ? '⬆ Expense' : v.type }}
                      </span>
                    </td>
                    <td class="px-3 py-2 text-right font-mono font-bold">₹{{ v.amount | number:'1.2-2' }}</td>
                    <td class="px-3 py-2 text-xs text-gray-600">{{ v.narration || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .card { background:#fff; border:1.5px solid #ddc8f5; border-radius:12px; padding:16px; }
    .lbl { font-size:10px; font-weight:700; color:#6b3fa0; text-transform:uppercase; letter-spacing:.5px; display:block; margin-bottom:4px; }
    .input { width:100%; padding:8px 10px; border:1.5px solid #ddc8f5; border-radius:8px; font-size:13px; outline:none; background:#faf5ff; }
    .btn-primary { padding:9px 18px; background:linear-gradient(135deg,#4a1080,#5c1a8b); color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; }
    .btn-primary:disabled { opacity:.5; }

    /* ===== MOBILE (<=640px) ===== */
    @media (max-width: 640px) {
      .card { padding: 12px; }
      .grid-cols-2 { grid-template-columns: 1fr !important; }
      .col-span-2, .col-span-3 { grid-column: span 1 !important; }
      /* voucher line: ledger full, then dr/cr + amount + remove on one wrap row */
      .grid-cols-12 { grid-template-columns: 1fr 1fr !important; }
      .grid-cols-12 .col-span-6 { grid-column: span 2 !important; }
      .grid-cols-12 .col-span-3 { grid-column: span 1 !important; }
      .grid-cols-12 .col-span-2 { grid-column: span 1 !important; }
      .grid-cols-12 .col-span-1 { grid-column: span 2 !important; text-align: right; }
      table { white-space: nowrap; }
    }
  `]
})
export class AdminBooksComponent {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api/admin/books`;

  loading = signal(true);
  initing = signal(false);
  summary = signal<BooksSummary | null>(null);
  vouchers = signal<VoucherRow[]>([]);
  ledgers = signal<LedgerOpt[]>([]);

  // voucher entry (journal/contra/receipt/payment)
  allLedgers = signal<AllLedger[]>([]);
  subGroups = signal<SubGroupOpt[]>([]);
  vType = 'journal';
  vDate = new Date().toISOString().slice(0, 10);
  vNarration = '';
  vLines: VLine[] = [
    { ledgerId: null, drCr: 'Dr', amount: null },
    { ledgerId: null, drCr: 'Cr', amount: null }
  ];
  savingV = signal(false);
  vMsg = signal('');
  vErr = signal('');

  // naya ledger
  nlName = '';
  nlSubGroup: string | null = null;
  savingNl = signal(false);
  nlMsg = signal('');

  // reports
  repFrom = (() => {
    const t = new Date();
    const y = t.getMonth() + 1 >= 4 ? t.getFullYear() : t.getFullYear() - 1;
    return `${y}-04-01`;
  })();
  repTo = new Date().toISOString().slice(0, 10);

  // expense form
  exDate = new Date().toISOString().slice(0, 10);
  exLedgerId: string | null = null;
  exNewLedger = '';
  exAmount: number | null = null;
  exPaidFrom = 'bank';
  exNarration = '';
  savingEx = signal(false);
  exMsg = signal('');
  exErr = signal('');

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.http.get<BooksSummary>(`${this.base}/summary`).subscribe({
      next: (s) => {
        this.summary.set(s);
        this.loading.set(false);
        if (s.ready) {
          this.http.get<VoucherRow[]>(`${this.base}/vouchers`).subscribe({ next: v => this.vouchers.set(v), error: () => {} });
          this.http.get<LedgerOpt[]>(`${this.base}/expense-ledgers`).subscribe({
            next: l => {
              this.ledgers.set(l);
              if (l.length && this.exLedgerId === null) this.exLedgerId = l[0].id;
            },
            error: () => {}
          });
          this.http.get<AllLedger[]>(`${this.base}/ledgers`).subscribe({ next: l => this.allLedgers.set(l), error: () => {} });
          this.http.get<SubGroupOpt[]>(`${this.base}/sub-groups`).subscribe({ next: s2 => this.subGroups.set(s2), error: () => {} });
        }
      },
      error: () => this.loading.set(false)
    });
  }

  init() {
    this.initing.set(true);
    this.http.post(`${this.base}/init`, {}).subscribe({
      next: () => { this.initing.set(false); this.load(); },
      error: (e) => { this.initing.set(false); alert(e?.error?.error ?? 'Setup fail'); }
    });
  }

  // ---- voucher entry helpers ----
  addLine() { this.vLines.push({ ledgerId: null, drCr: 'Cr', amount: null }); }
  removeLine(i: number) { if (this.vLines.length > 2) this.vLines.splice(i, 1); }
  vDr() { return this.vLines.filter(l => l.drCr === 'Dr').reduce((s, l) => s + (+(l.amount ?? 0)), 0); }
  vCr() { return this.vLines.filter(l => l.drCr === 'Cr').reduce((s, l) => s + (+(l.amount ?? 0)), 0); }
  vBalanced() { return this.vDr() > 0 && Math.abs(this.vDr() - this.vCr()) < 0.01; }

  saveVoucher() {
    this.vMsg.set(''); this.vErr.set('');
    const lines = this.vLines.filter(l => l.ledgerId && (+(l.amount ?? 0)) > 0);
    if (lines.length < 2) { this.vErr.set('Kam se kam 2 poori lines bharo (ledger + amount).'); return; }
    if (!this.vBalanced()) { this.vErr.set('Dr aur Cr barabar karo.'); return; }

    this.savingV.set(true);
    this.http.post<any>(`${this.base}/voucher`, {
      type: this.vType,
      date: this.vDate,
      narration: this.vNarration || null,
      lines: lines.map(l => ({ ledgerId: l.ledgerId, drCr: l.drCr, amount: +(l.amount ?? 0) }))
    }).subscribe({
      next: (r) => {
        this.savingV.set(false);
        this.vMsg.set(`✅ Voucher save — ${r.voucherNo}`);
        this.vLines = [
          { ledgerId: null, drCr: 'Dr', amount: null },
          { ledgerId: null, drCr: 'Cr', amount: null }
        ];
        this.vNarration = '';
        this.load();
      },
      error: (e) => { this.savingV.set(false); this.vErr.set(e?.error?.error ?? 'Save nahi hua'); }
    });
  }

  saveLedger() {
    this.nlMsg.set('');
    if (!this.nlName.trim() || !this.nlSubGroup) { alert('Naam + sub-group dono chahiye.'); return; }
    this.savingNl.set(true);
    this.http.post<any>(`${this.base}/ledger`, { name: this.nlName.trim(), subGroupId: this.nlSubGroup }).subscribe({
      next: (r) => {
        this.savingNl.set(false);
        this.nlMsg.set(`✅ Ledger "${r.name}" ban gaya`);
        this.nlName = '';
        this.load();
      },
      error: (e) => { this.savingNl.set(false); alert(e?.error?.error ?? 'Ledger nahi bana'); }
    });
  }

  // ---- reports (print window) ----
  openReport(kind: 'tb' | 'pnl' | 'bs') {
    const url = kind === 'tb' ? `${this.base}/reports/trial-balance?asOf=${this.repTo}`
              : kind === 'pnl' ? `${this.base}/reports/pnl?from=${this.repFrom}&to=${this.repTo}`
              : `${this.base}/reports/balance-sheet?asOf=${this.repTo}`;
    this.http.get<any>(url).subscribe({
      next: (d) => this.printReport(kind, d),
      error: (e) => alert(e?.error?.error ?? 'Report nahi mili')
    });
  }

  private printReport(kind: 'tb' | 'pnl' | 'bs', d: any) {
    const inr = (n: number) => '₹' + (+(n ?? 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    let title = '', body = '';

    if (kind === 'tb') {
      title = `Trial Balance — as on ${d.asOf}`;
      const rows = (d.rows as any[]).filter(r => r.closingDr > 0 || r.closingCr > 0)
        .map(r => `<tr><td>${r.ledgerName}<br><small>${r.groupName} · ${r.headName}</small></td>
          <td style="text-align:right">${r.closingDr > 0 ? inr(r.closingDr) : ''}</td>
          <td style="text-align:right">${r.closingCr > 0 ? inr(r.closingCr) : ''}</td></tr>`).join('');
      body = `<table><thead><tr><th>Ledger</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>TOTAL ${d.isBalanced ? '✓ Balanced' : '✗ NOT BALANCED'}</td>
          <td style="text-align:right">${inr(d.totalDr)}</td><td style="text-align:right">${inr(d.totalCr)}</td></tr></tfoot></table>`;
    } else if (kind === 'pnl') {
      title = `Profit & Loss — ${d.from} se ${d.to}`;
      const inc = (d.incomeRows as any[]).map(r => `<tr><td>${r.ledgerName}</td><td style="text-align:right">${inr(r.closingCr - r.closingDr)}</td></tr>`).join('');
      const exp = (d.expenseRows as any[]).map(r => `<tr><td>${r.ledgerName}</td><td style="text-align:right">${inr(r.closingDr - r.closingCr)}</td></tr>`).join('');
      body = `<h3>Income</h3><table><tbody>${inc}</tbody><tfoot><tr><td>Total Income</td><td style="text-align:right">${inr(d.totalIncome)}</td></tr></tfoot></table>
        <h3>Expenses</h3><table><tbody>${exp}</tbody><tfoot><tr><td>Total Expense</td><td style="text-align:right">${inr(d.totalExpense)}</td></tr></tfoot></table>
        <h2 style="text-align:right;color:${d.netProfit >= 0 ? '#16A34A' : '#B91C1C'}">
          ${d.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}: ${inr(Math.abs(d.netProfit))}</h2>`;
    } else {
      title = `Balance Sheet — as on ${d.asOf}`;
      const li = (d.liabilities as any[]).map(r => `<tr><td>${r.name}<br><small>${r.section}</small></td><td style="text-align:right">${inr(r.amount)}</td></tr>`).join('');
      const as = (d.assets as any[]).map(r => `<tr><td>${r.name}</td><td style="text-align:right">${inr(r.amount)}</td></tr>`).join('');
      body = `<div style="display:flex;gap:20px"><div style="flex:1"><h3>Liabilities + Capital</h3>
          <table><tbody>${li}</tbody><tfoot><tr><td>Total</td><td style="text-align:right">${inr(d.totalLiabilities)}</td></tr></tfoot></table></div>
        <div style="flex:1"><h3>Assets</h3>
          <table><tbody>${as}</tbody><tfoot><tr><td>Total</td><td style="text-align:right">${inr(d.totalAssets)}</td></tr></tfoot></table></div></div>`;
    }

    const html = `<html><head><title>${title}</title><style>
        body{font-family:Arial,sans-serif;color:#222;padding:24px;max-width:760px;margin:auto}
        h1{color:#5c1a8b;font-size:18px;margin:0 0 2px} h3{color:#5c1a8b;margin:14px 0 6px}
        .muted{color:#777;font-size:12px;margin-bottom:14px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#1B2E5C;color:#fff;text-align:left;padding:6px 8px}
        td{border-bottom:1px solid #eee;padding:6px 8px} small{color:#888}
        tfoot td{font-weight:800;border-top:2px solid #5c1a8b;border-bottom:none}
      </style></head><body>
      <h1>Anjaninex — ${title}</h1>
      <div class="muted">Generated: ${new Date().toLocaleString('en-IN')}</div>
      ${body}</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Popup block ho gaya — allow karein.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  saveExpense() {
    this.exMsg.set(''); this.exErr.set('');
    if (!this.exAmount || this.exAmount <= 0) { this.exErr.set('Amount daalo.'); return; }
    if (this.exLedgerId === null && !this.exNewLedger.trim()) { this.exErr.set('Kharcha type choose karo ya naya naam do.'); return; }

    this.savingEx.set(true);
    this.http.post<any>(`${this.base}/expense`, {
      date: this.exDate,
      amount: this.exAmount,
      ledgerId: this.exLedgerId,
      newLedgerName: this.exLedgerId === null ? this.exNewLedger.trim() : null,
      paidFrom: this.exPaidFrom,
      narration: this.exNarration || null
    }).subscribe({
      next: (r) => {
        this.savingEx.set(false);
        this.exMsg.set(`✅ Expense save — voucher ${r.voucherNo}`);
        this.exAmount = null; this.exNarration = ''; this.exNewLedger = '';
        this.load();
      },
      error: (e) => { this.savingEx.set(false); this.exErr.set(e?.error?.error ?? 'Save nahi hua'); }
    });
  }
}
