import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TradingSubNavComponent } from '../components/trading-sub-nav.component';
import { TradingService, BillListItem } from '../services/trading.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { InvoicePreviewComponent, PreviewData } from '../../../shared/invoice-preview.component';
import { InDatePipe } from '../../../shared/in-date.pipe';
import { PaginatorComponent } from '../../../shared/paginator.component';
import { FeatureService } from '../../../shared/feature.service';
import { amountInWords } from '../../../shared/amount-in-words.util';

@Component({
  selector: 'app-bills',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, TradingSubNavComponent, BackButtonComponent, InvoicePreviewComponent, InDatePipe, PaginatorComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">Bills</h2>
          <p class="text-sm text-[#6b3fa0]">All sales/purchase invoices with linked vouchers</p>
        </div>
        <a routerLink="/trading/bills/new" class="btn-primary no-underline">+ New Bill</a>
      </div>

      <app-trading-sub-nav></app-trading-sub-nav>

      <!-- KPI cards — deleted bills count/amount me NAHI -->
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div class="kpi-card" style="border-left:4px solid #1B2E5C; background:#1B2E5C0d;">
          <div class="kpi-lbl">🧾 TOTAL BILLS</div>
          <div class="kpi-val" style="color:#1B2E5C;">{{ liveCount() }}</div>
          <div class="kpi-sub">deleted count nahi hote</div>
        </div>
        <div class="kpi-card" style="border-left:4px solid #16a34a; background:#16a34a0d;">
          <div class="kpi-lbl">💰 TOTAL BILL AMOUNT</div>
          <div class="kpi-val" style="color:#16a34a;">₹ {{ totalSum() | number:'1.2-2' }}</div>
          @if (inWords(totalSum())) {
            <div class="kpi-words">{{ inWords(totalSum()) }}</div>
          }
          <div class="kpi-sub">sirf active bills ka total</div>
        </div>
      </div>

      <div class="flex flex-wrap gap-3 mb-4 items-center">
        <!-- Universal search box -->
        <div class="flex-1 min-w-[300px] relative">
          <input type="text" [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)"
                 placeholder="🔍 Search by Supplier / Buyer / GST / Bill No / Order No / E-Way No / LR No..."
                 class="input w-full pr-8" style="padding-left: 14px;">
          @if (searchTerm()) {
            <button (click)="searchTerm.set('')" type="button"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 text-lg font-bold">✕</button>
          }
        </div>
        <select [(ngModel)]="filterStatus" (change)="load()" class="input w-44">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
        </select>
        <select [(ngModel)]="filterType" (change)="load()" class="input w-44">
          <option value="">All Types</option>
          <option value="sales">Sales</option>
          <option value="purchase">Purchase</option>
        </select>
        @if (searchTerm()) {
          <span class="text-xs text-gray-500">
            Showing <b class="text-[#5c1a8b]">{{ filteredBills().length }}</b> of {{ bills().length }}
          </span>
        }
      </div>

      <div class="card p-0 overflow-hidden">
        @if (loading()) { <div class="p-8 text-center text-gray-500">Loading...</div> }
        @else if (bills().length === 0) {
          <div class="p-8 text-center text-gray-500">No bills yet. <a routerLink="/trading/bills/new" class="text-[#5c1a8b] underline">Create first bill</a></div>
        }
        @else if (filteredBills().length === 0) {
          <div class="p-8 text-center text-gray-500">
            ⚠️ No bills match "<b class="text-[#5c1a8b]">{{ searchTerm() }}</b>". Try a different search term.
          </div>
        }
        @else {
          <table class="w-full text-sm">
            <thead class="bg-anjaninex-navy text-white uppercase text-xs">
              <tr>
                <th class="w-8"></th>
                <th class="px-3 py-3 text-center w-12">NO.</th>
                <th class="px-3 py-3 text-left">BILL ENTRY NO.</th>
                <th class="px-3 py-3 text-left">ORDER NO.</th>
                <th class="px-3 py-3 text-left">SUPP. BILL NO</th>
                <th class="px-3 py-3 text-left">SUPP. BILL DATE</th>
                <th class="px-3 py-3 text-left">BILL ENTRY DATE</th>
                <th class="px-3 py-3 text-left">SUPPLIER</th>
                <th class="px-3 py-3 text-left">BUYER</th>
                <th class="px-3 py-3 text-right">E-INVOICE AMT</th>
                <th class="px-3 py-3 text-center">STATUS</th>
                <th class="px-3 py-3 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              @for (b of pagedBills(); track b.id; let i = $index) {
                <tr class="border-t hover:bg-[#FAF7F0]" [class.opacity-50]="b.isDeleted">
                  <td class="text-center">
                    <button (click)="toggleExpand(b)" class="exp-btn" title="Bill ki poori detail">
                      {{ expandedId() === b.id ? '▾' : '▸' }}
                    </button>
                  </td>
                  <td class="px-3 py-3 text-center text-gray-500">{{ (pageClamped()-1)*pageSize() + i + 1 }}</td>
                  <td class="px-3 py-3 font-mono text-xs font-bold text-[#1B2E5C]">
                    <span [class.line-through]="b.isDeleted">{{ b.billNo }}</span>
                    @if (b.isDeleted) {
                      <span class="ml-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold no-underline">DELETED</span>
                    }
                  </td>
                  <td class="px-3 py-3 font-mono text-xs">{{ b.poNumber || '—' }}</td>
                  <td class="px-3 py-3 text-xs font-mono">{{ b.supplierBillNo || '—' }}</td>
                  <td class="px-3 py-3 text-xs font-mono whitespace-nowrap">
                    {{ b.billDate ? (b.billDate | date:'dd/MM/yy') : '—' }}
                  </td>
                  <td class="px-3 py-3 text-xs font-mono whitespace-nowrap">
                    {{ b.createdAt ? (b.createdAt | date:'dd/MM/yy') : (b.billDate | date:'dd/MM/yy') }}
                  </td>
                  <td class="px-3 py-3 font-semibold">{{ b.partyName }}</td>
                  <td class="px-3 py-3 text-gray-700">{{ b.buyerName || '—' }}</td>
                  <td class="px-3 py-3 text-right font-mono font-bold">₹ {{ b.total | number:'1.2-2' }}</td>
                  <td class="px-3 py-3 text-center">
                    @if (b.status === 'paid' && (b.advanceExtra || 0) > 0) {
                      <span class="text-xs px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800"
                            [title]="'Buyer ne ₹' + ((b.advanceExtra || 0) | number:'1.2-2') + ' extra diya — party ke khate me advance'">
                        💎 ADVANCE
                      </span>
                    } @else {
                      <span class="text-xs px-2 py-0.5 rounded uppercase font-bold"
                            [class.bg-yellow-100]="b.status === 'pending'"
                            [class.text-yellow-700]="b.status === 'pending'"
                            [class.bg-green-100]="b.status === 'paid'"
                            [class.text-green-700]="b.status === 'paid'"
                            [class.bg-blue-100]="b.status === 'partial'"
                            [class.text-blue-700]="b.status === 'partial'">
                        {{ b.status === 'pending' ? 'UNPAID' : b.status }}
                      </span>
                    }
                  </td>
                  <td class="px-3 py-3 text-center">
                    @if (b.isDeleted) {
                      <span class="text-xs text-gray-400">—</span>
                    } @else {
                      <a [routerLink]="['/trading/gr/new']" [queryParams]="{ billNo: b.billNo }"
                         class="ai-btn ai-gr" title="Create GR — bill auto-fill">📦</a>
                      <a [routerLink]="['/trading/payments/new']" [queryParams]="{ billNo: b.billNo }"
                         class="ai-btn ai-rcpt" title="Create Receipt — bill auto-fill">💰</a>
                      <button (click)="preview(b.id)" class="ai-btn" title="Preview & Print">👁</button>
                      <a [routerLink]="['/trading/bills', b.id, 'edit']" class="ai-btn" title="View / Attach Document">📎</a>
                      <a [routerLink]="['/trading/bills', b.id, 'edit']" class="ai-btn" title="Edit">✏️</a>
                      <button (click)="del(b.id)" class="ai-btn" title="Delete">🗑️</button>
                    }
                  </td>
                </tr>
                @if (expandedId() === b.id) {
                  <tr class="exp-row">
                    <td colspan="12" class="px-4 py-3">
                      @if (!detail(b.id)) {
                        <div class="text-center text-gray-500 py-3">⏳ Detail load ho rahi hai…</div>
                      } @else {
                        <div class="exp-chips">
                          <span class="exp-chip">🏭 {{ detail(b.id).partyName || b.partyName }}</span>
                          <span class="exp-chip">🛒 {{ detail(b.id).buyerName || b.buyerName || '—' }}</span>
                          @if (detail(b.id).supplierBillNo) { <span class="exp-chip">📄 Supp Bill: {{ detail(b.id).supplierBillNo }}</span> }
                          @if (detail(b.id).ewayBillNo) { <span class="exp-chip">🛣 e-Way: {{ detail(b.id).ewayBillNo }}</span> }
                          @if (detail(b.id).lrNo) { <span class="exp-chip">🚚 LR: {{ detail(b.id).lrNo }}</span> }
                        </div>
                        <table class="exp-table">
                          <thead>
                            <tr>
                              <th>#</th><th>Item</th><th>HSN</th><th class="text-right">Qty</th><th>Unit</th>
                              <th class="text-right">Rate</th><th class="text-right">RD%</th><th class="text-right">Tax%</th>
                              <th class="text-right">Taxable</th><th class="text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (l of detail(b.id).lines; track $index; let li = $index) {
                              <tr>
                                <td>{{ li + 1 }}</td>
                                <td class="font-semibold">{{ l.itemName }}@if (l.description) { <small class="text-gray-500"> · {{ l.description }}</small> }</td>
                                <td class="font-mono text-xs">{{ l.hsnSac || '—' }}</td>
                                <td class="text-right font-mono">{{ l.qty | number:'1.0-2' }}</td>
                                <td>{{ l.unit }}</td>
                                <td class="text-right font-mono">{{ l.rate | number:'1.2-2' }}</td>
                                <td class="text-right font-mono">{{ l.discountPct | number:'1.0-2' }}</td>
                                <td class="text-right font-mono">{{ l.taxRate | number:'1.0-2' }}</td>
                                <td class="text-right font-mono">{{ l.taxableAmount | number:'1.2-2' }}</td>
                                <td class="text-right font-mono font-bold">{{ l.totalAmount | number:'1.2-2' }}</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                        <div class="exp-sums">
                          <span>Taxable: <b>₹{{ sumLine(b.id, 'taxableAmount') | number:'1.2-2' }}</b></span>
                          <span>Tax: <b>₹{{ (sumLine(b.id, 'totalAmount') - sumLine(b.id, 'taxableAmount')) | number:'1.2-2' }}</b></span>
                          @if (detail(b.id).discount) { <span class="text-red-600">Discount: <b>- ₹{{ detail(b.id).discount | number:'1.2-2' }}</b></span> }
                          <span>Bill Total: <b>₹{{ detail(b.id).total | number:'1.2-2' }}</b></span>
                          <span class="text-green-700">Paid: <b>₹{{ detail(b.id).paidAmount | number:'1.2-2' }}</b></span>
                          <span class="text-red-600">Pending: <b>₹{{ (detail(b.id).total - detail(b.id).paidAmount) | number:'1.2-2' }}</b></span>
                        </div>
                        @if (detail(b.id).notes) {
                          <div class="exp-notes">📝 {{ detail(b.id).notes }}</div>
                        }
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
            <tfoot class="bg-gray-50 font-bold">
              <tr><td colspan="8" class="px-3 py-3 text-right">TOTALS →</td><td class="px-3 py-3 text-right font-mono">₹ {{ filteredTotal() | number:'1.2-2' }}</td><td colspan="2"></td></tr>
            </tfoot>
          </table>
          <app-paginator [total]="filteredBills().length" [page]="pageClamped()" [pageSize]="pageSize()"
                         (pageChange)="page.set($event)" (pageSizeChange)="pageSize.set($event); page.set(1)"></app-paginator>
        }
      </div>

      @if (previewData()) {
        <app-invoice-preview [data]="previewData()!" (close)="previewData.set(null)"></app-invoice-preview>
      }
    </div>
  `,
  styles: [`
    .kpi-card { background: #fff; border: 1px solid #f0e6ff; border-left: 4px solid #5c1a8b;
      border-radius: 12px; padding: 14px 18px; box-shadow: 0 1px 4px rgba(92,26,139,.06); }
    .kpi-lbl { font-size: 10px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: .5px; }
    .kpi-val { font-size: 24px; font-weight: 900; color: #1B2E5C; font-family: 'JetBrains Mono', monospace; margin-top: 2px; }
    .kpi-sub { font-size: 10px; color: #9ca3af; }
    .kpi-words { font-size: 11px; font-weight: 600; color: #16a34a; font-style: italic; margin-top: 2px; line-height: 1.3; }

    .ai-btn { display:inline-block; width:28px; height:28px; border:0; background:transparent;
      border-radius:6px; cursor:pointer; font-size:13px; transition:background 0.15s; margin:0 1px; }
    .ai-btn:hover { background:#FAF7F0; }

    .exp-btn { width:24px; height:24px; border:1px solid #ddc8f5; background:#fff; border-radius:6px;
      cursor:pointer; font-size:11px; color:#5c1a8b; font-weight:800; }
    .exp-btn:hover { background:#f0e6ff; }
    .exp-row { background:#faf5ff; }
    .exp-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px; }
    .exp-chip { background:#fff; border:1px solid #ddc8f5; border-radius:999px; padding:3px 10px;
      font-size:11px; font-weight:700; color:#5c1a8b; }
    .exp-table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #eee; }
    .exp-table th { background:#f0e6ff; color:#5c1a8b; font-size:10px; text-transform:uppercase;
      padding:5px 8px; text-align:left; }
    .exp-table td { padding:5px 8px; font-size:12px; border-top:1px solid #f3f4f6; }
    .exp-sums { display:flex; gap:16px; flex-wrap:wrap; margin-top:8px; font-size:12px; color:#374151; }
    .exp-notes { margin-top:6px; font-size:11px; color:#6b7280; white-space:pre-line; }

    @media (max-width: 640px) {
      .grid-cols-2 { grid-template-columns: 1fr !important; }
      .kpi-card { padding: 12px 14px; }
      .card { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
      table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; width: 100%; }
    }
  `]
})
export class BillsComponent {
  readonly inWords = amountInWords;   // card amount → words (Indian Lakh/Crore)
  private svc = inject(TradingService);
  features = inject(FeatureService);
  bills = signal<BillListItem[]>([]);
  loading = signal(true);
  filterStatus = '';
  filterType = '';
  previewData = signal<PreviewData | null>(null);

  // Universal search — filters by party name, GST, bill no, order no (frontend)
  searchTerm = signal('');
  filteredBills = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    if (!q) return this.bills();
    return this.bills().filter(b =>
      (b.billNo      || '').toLowerCase().includes(q) ||
      (b.partyName   || '').toLowerCase().includes(q) ||  // supplier name
      (b.partyGst    || '').toLowerCase().includes(q) ||  // supplier GST
      (b.buyerName   || '').toLowerCase().includes(q) ||  // buyer name
      (b.buyerGst    || '').toLowerCase().includes(q) ||  // buyer GST
      (b.poNumber    || '').toLowerCase().includes(q) ||  // order no
      (b.ewayBillNo  || '').toLowerCase().includes(q) ||  // 🆕 E-Way bill no
      (b.lrNo        || '').toLowerCase().includes(q)     // LR no
    );
  });
  // Pagination
  page = signal(1);
  pageSize = signal(10);
  pageClamped = computed(() => {
    const pages = Math.max(1, Math.ceil(this.filteredBills().length / this.pageSize()));
    return Math.min(this.page(), pages);
  });
  pagedBills = computed(() => {
    const st = (this.pageClamped() - 1) * this.pageSize();
    return this.filteredBills().slice(st, st + this.pageSize());
  });

  // Deleted bills totals me count NAHI honge
  liveCount = computed(() => this.bills().filter(b => !b.isDeleted).length);
  filteredTotal = computed(() => this.filteredBills().filter(b => !b.isDeleted).reduce((s, b) => s + b.total, 0));

  totalSum = computed(() => this.bills().filter(b => !b.isDeleted).reduce((s, b) => s + b.total, 0));
  paidSum = computed(() => this.bills().filter(b => !b.isDeleted).reduce((s, b) => s + b.paidAmount, 0));
  pendingSum = computed(() => this.totalSum() - this.paidSum());

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.svc.listBills({ status: this.filterStatus || undefined, type: this.filterType || undefined, size: 500 }).subscribe({
      next: (res) => {
        // Deleted bills list me NAHI dikhenge (ye Activity Log report me hain)
        const live = res.items.filter(b => !b.isDeleted);
        // Bill no ke number se sort — NEWEST upar, oldest niche (descending)
        const num = (s: string | null) => { const m = (s || '').match(/(\d+)\s*$/); return m ? +m[1] : 0; };
        this.bills.set([...live].sort((a, b) => num(b.billNo) - num(a.billNo)));
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  // ── Row expand: bill ki poori andar ki detail (items + amounts + notes) ──
  expandedId = signal<string | null>(null);
  private detailCache = new Map<string, any>();
  toggleExpand(b: BillListItem) {
    if (this.expandedId() === b.id) { this.expandedId.set(null); return; }
    this.expandedId.set(b.id);
    if (!this.detailCache.has(b.id)) {
      this.svc.getBill(b.id).subscribe({
        next: d => { this.detailCache.set(b.id, d); this.expandedId.set(this.expandedId()); this.bills.update(x => [...x]); },
        error: () => {}
      });
    }
  }
  detail(id: string) { return this.detailCache.get(id); }
  sumLine(id: string, field: 'taxableAmount' | 'totalAmount'): number {
    const d = this.detailCache.get(id);
    return d?.lines?.reduce((s: number, l: any) => s + (+l[field] || 0), 0) ?? 0;
  }

  preview(id: string) {
    this.svc.getBill(id).subscribe(b => {
      const lines = b.lines.map(l => ({
        itemName: l.itemName,
        description: l.description ?? null,
        hsnSac: l.hsnSac,
        qty: l.qty,
        unit: l.unit,
        rate: l.rate,
        rd: l.discountPct,
        taxPct: l.taxRate,
        taxableAmount: l.taxableAmount,
        taxAmount: l.totalAmount - l.taxableAmount,
        totalAmount: l.totalAmount
      }));

      const card = (p: any) => p ? ({
        name: p.displayName,
        gst: p.gst,
        mobile: p.phone,
        city: p.city,
        address: p.city ? `Address available on file · ${p.city}` : null
      }) : undefined;

      const build = (supParty: any, buyParty: any) => {
        this.previewData.set({
          type: 'bill',
          title: b.billType === 'sales' ? 'SALES INVOICE' : 'PURCHASE BILL',
          number: b.billNo,
          date: b.billDate,
          // Namokara = commission agent (header). Supplier/Buyer = real bill parties.
          firmName: this.features.firmName() || 'Anjaninex',
          firmGst: this.features.firmGst(),
          firmAddress: 'Commission Agent · Surat, Gujarat — 395003',
          supplier: card(supParty),
          buyer: card(buyParty),
          lines,
          // Reconciling breakdown: Gross − CD + Tax = Net (Tax = residual, sahi after-discount GST)
          grossAmount: b.subtotal,
          taxableAmount: b.subtotal - (b.discount || 0),
          totalTax: b.total - (b.subtotal - (b.discount || 0)),
          cdAmount: b.discount,
          netAmount: b.total,
          paymentTerms: null,
          supplierOrderNo: b.poNumber,
          notes: b.notes
        });
      };

      // partyId = asli supplier, buyerPartyId = asli buyer
      this.svc.getParty(b.partyId).subscribe(sup => {
        if (b.buyerPartyId) {
          this.svc.getParty(b.buyerPartyId).subscribe(buy => build(sup, buy));
        } else {
          build(sup, null);
        }
      });
    });
  }

  del(id: string) {
    if (!confirm('Delete this bill? This action cannot be undone.')) return;
    this.svc.deleteBill(id).subscribe(() => this.load());
  }
}
