import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TradingSubNavComponent } from '../components/trading-sub-nav.component';
import { TradingService, PaymentListItem, Party } from '../services/trading.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { InvoicePreviewComponent, PreviewData } from '../../../shared/invoice-preview.component';
import { InDatePipe } from '../../../shared/in-date.pipe';
import { PaginatorComponent } from '../../../shared/paginator.component';
import { FeatureService } from '../../../shared/feature.service';
import { ToastService } from '../../../shared/toast.service';

@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, TradingSubNavComponent, BackButtonComponent, InvoicePreviewComponent, InDatePipe, PaginatorComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">Payments</h2>
          <p class="text-sm text-[#6b3fa0]">All receipts and payments with linked vouchers</p>
        </div>
        <a routerLink="/trading/payments/new" class="btn-primary no-underline">+ New Receipt</a>
      </div>

      <app-trading-sub-nav></app-trading-sub-nav>

      <div class="flex flex-wrap gap-3 mb-4 items-center">
        <div class="flex-1 min-w-[300px] relative">
          <input type="text" [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)"
                 placeholder="🔍 Search by Party Name / GST / V.No / Bill No / Ref No..."
                 class="input w-full pr-8" style="padding-left: 14px;">
          @if (searchTerm()) {
            <button (click)="searchTerm.set('')" type="button"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 text-lg font-bold">✕</button>
          }
        </div>
        <select [(ngModel)]="filterType" (change)="load()" class="input w-44">
          <option value="">All</option>
          <option value="receipt">Receipts</option>
          <option value="payment">Payments</option>
        </select>
        @if (searchTerm()) {
          <span class="text-xs text-gray-500">
            Showing <b class="text-[#5c1a8b]">{{ filteredPayments().length }}</b> of {{ payments().length }}
          </span>
        }
      </div>

      <div class="card p-0 overflow-hidden">
        @if (loading()) { <div class="p-8 text-center text-gray-500">Loading...</div> }
        @else if (loadError()) {
          <div style="margin:16px;padding:14px 16px;background:#FEE2E2;border:1px solid #FCA5A5;border-radius:10px;color:#991B1B">
            <div style="font-weight:800;margin-bottom:4px">⚠ Data load nahi ho paya</div>
            <div style="font-size:13px;margin-bottom:10px">{{ loadError() }}</div>
            <div style="font-size:12px;opacity:.85;margin-bottom:10px">Aapka data safe hai — ye sirf load hone me dikkat hai. Dobara koshish karein.</div>
            <button (click)="load()" style="background:#DC2626;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer">🔄 Retry</button>
          </div>
        }
        @else if (payments().length === 0) {
          <div class="p-8 text-center text-gray-500">No payments yet. <a routerLink="/trading/payments/new" class="text-[#5c1a8b] underline">Record first</a></div>
        }
        @else {
          @if (filteredPayments().length === 0) {
            <div class="p-8 text-center text-gray-500">
              ⚠️ No payments match "<b class="text-[#5c1a8b]">{{ searchTerm() }}</b>". Try a different search.
            </div>
          } @else {
          <table class="w-full text-sm">
            <thead class="bg-anjaninex-navy text-white uppercase text-xs">
              <tr>
                <th class="px-3 py-3 text-center w-12">NO.</th>
                <th class="px-3 py-3 text-left">PAYMENT NO / V.NO</th>
                <th class="px-3 py-3 text-left">BILL NO(S)</th>
                <th class="px-3 py-3 text-left">DATE</th>
                <th class="px-3 py-3 text-left">TYPE</th>
                <th class="px-3 py-3 text-left">BUYER</th>
                <th class="px-3 py-3 text-left">SUPPLIER</th>
                <th class="px-3 py-3 text-right">AMOUNT</th>
                <th class="px-3 py-3 text-right">BAL. PENDING</th>
                <th class="px-3 py-3 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              @for (p of pagedPayments(); track p.id; let i = $index) {
                <tr class="border-t hover:bg-[#FAF7F0]">
                  <td class="px-3 py-3 text-center text-gray-500">{{ (pageClamped()-1)*pageSize() + i + 1 }}</td>
                  <td class="px-3 py-3 font-mono text-xs">
                    <div class="font-bold text-[#1B2E5C]">{{ p.paymentNo }}</div>
                    <div class="text-gray-500">{{ p.voucherNo || '—' }}</div>
                  </td>
                  <td class="px-3 py-3 font-mono text-xs">{{ p.billNos || '—' }}</td>
                  <td class="px-3 py-3 text-xs">{{ p.paymentDate | inDate }}</td>
                  <td class="px-3 py-3">
                    <span class="text-xs px-2 py-0.5 rounded font-bold uppercase"
                          [class.bg-green-100]="p.paymentType === 'receipt'"
                          [class.text-green-700]="p.paymentType === 'receipt'"
                          [class.bg-orange-100]="p.paymentType === 'payment'"
                          [class.text-orange-700]="p.paymentType === 'payment'">
                      {{ p.paymentType === 'receipt' ? '⬇️ Receipt' : '⬆️ Payment' }}
                    </span>
                  </td>
                  <td class="px-3 py-3 font-semibold">{{ p.partyName }}</td>
                  <td class="px-3 py-3 text-gray-700">{{ p.supplierName || '—' }}</td>
                  <td class="px-3 py-3 text-right font-mono font-bold text-green-600">₹ {{ p.amount | number:'1.2-2' }}</td>
                  <td class="px-3 py-3 text-right font-mono font-bold"
                      [class.text-red-600]="(p.balancePending || 0) > 0"
                      [class.text-gray-400]="!(p.balancePending || 0)">
                    {{ (p.balancePending || 0) > 0 ? ('₹ ' + ((p.balancePending || 0) | number:'1.2-2')) : '✓ Clear' }}
                  </td>
                  <td class="px-3 py-3 text-center">
                    <button (click)="preview(p)" class="ai-btn" title="Preview & Print">👁</button>
                    <a [routerLink]="['/trading/payments', p.id, 'edit']" class="ai-btn" title="Edit">✏️</a>
                    <button (click)="del(p)" class="ai-btn" title="Delete">🗑️</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <app-paginator [total]="filteredPayments().length" [page]="pageClamped()" [pageSize]="pageSize()"
                         (pageChange)="page.set($event)" (pageSizeChange)="pageSize.set($event); page.set(1)"></app-paginator>
          }
        }
      </div>

      @if (previewData()) {
        <app-invoice-preview [data]="previewData()!" (close)="previewData.set(null)"></app-invoice-preview>
      }
    </div>
  `,
  styles: [`
    .ai-btn { display:inline-block; width:28px; height:28px; border:0; background:transparent;
      border-radius:6px; cursor:pointer; font-size:13px; transition:background 0.15s; margin:0 1px; }
    .ai-btn:hover { background:#FAF7F0; }

    @media (max-width: 640px) {
      .card { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
      table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; width: 100%; }
    }
  `]
})
export class PaymentsComponent {
  private svc = inject(TradingService);
  private toast = inject(ToastService);
  features = inject(FeatureService);
  payments = signal<PaymentListItem[]>([]);
  loadError = signal<string | null>(null);
  loading = signal(true);
  filterType = '';
  previewData = signal<PreviewData | null>(null);

  // Universal search — Party Name / GST / Voucher No / Bill No / Payment No / Ref No
  searchTerm = signal('');
  filteredPayments = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    if (!q) return this.payments();
    return this.payments().filter(p =>
      (p.paymentNo   || '').toLowerCase().includes(q) ||
      (p.voucherNo   || '').toLowerCase().includes(q) ||
      (p.partyName   || '').toLowerCase().includes(q) ||
      (p.partyGst    || '').toLowerCase().includes(q) ||
      (p.billNos     || '').toLowerCase().includes(q) ||
      (p.referenceNo || '').toLowerCase().includes(q)
    );
  });

  // Pagination
  page = signal(1);
  pageSize = signal(10);
  pageClamped = computed(() => {
    const pages = Math.max(1, Math.ceil(this.filteredPayments().length / this.pageSize()));
    return Math.min(this.page(), pages);
  });
  pagedPayments = computed(() => {
    const st = (this.pageClamped() - 1) * this.pageSize();
    return this.filteredPayments().slice(st, st + this.pageSize());
  });

  preview(p: PaymentListItem) {
    // Full detail (allocations + notes) ke saath preview — NET AMT ka pura hisaab dikhe
    this.svc.getPayment(p.id).subscribe({ next: (detail) => this.buildPreview(p, detail), error: () => this.buildPreview(p, null) });
  }

  private buildPreview(p: PaymentListItem, detail: any) {
    // Fetch full party details
    this.svc.getParty(p.partyId).subscribe(party => {
      const partyCard = {
        name: party.displayName,
        gst: party.gst,
        mobile: party.phone,
        city: party.city,
        address: party.city ? `Address on file · ${party.city}` : null
      };
      const firmCard = {
        name: this.features.firmName() || 'Anjaninex',
        gst: this.features.firmGst(),
        mobile: '+91 98765 43210',
        city: 'Surat',
        address: 'Commission Agent · Surat, Gujarat — 395001'
      };
      // ASLI supplier (Rahul Prints etc.) — notes ke "Supplier: X" se naam,
      // baki detail (GST/mobile/address) Party Master se
      const supName = (detail?.notes || '').split(' | ').find((s: string) => s.startsWith('Supplier: '))?.slice(10) || '';
      const supParty = supName ? this.parties().find(x => x.displayName.toLowerCase() === supName.toLowerCase()) : undefined;
      const supCard = supName
        ? {
            name: supParty?.displayName || supName,
            gst: supParty?.gst || null,
            mobile: supParty?.phone || null,
            city: supParty?.city || null,
            address: supParty?.city ? `Address on file · ${supParty.city}` : null
          }
        : firmCard;
      this.previewData.set({
        type: 'payment',
        title: p.paymentType === 'receipt' ? 'PAYMENT RECEIPT' : 'PAYMENT VOUCHER',
        number: p.paymentNo,
        date: p.paymentDate,
        firmName: this.features.firmName() || 'Anjaninex',
        firmGst: this.features.firmGst(),
        firmAddress: 'Commission Agent · Surat, Gujarat',
        // RECEIPT (we got money): we = supplier, party = buyer paying us
        // PAYMENT (we paid): party = supplier we paid, we = buyer
        supplier: p.paymentType === 'receipt' ? supCard : partyCard,
        buyer: p.paymentType === 'receipt' ? partyCard : firmCard,
        lines: [],
        grossAmount: p.amount,
        taxableAmount: p.amount,
        totalTax: 0,
        netAmount: p.amount,
        amount: p.amount,
        paymentMode: p.paymentMode,
        // Notes me save hua txn breakup wapas nikalo — kaise-kaise received hua
        paymentTxns: this.parseTxns(detail?.notes),
        // Kat-kut breakdown (save hua CALC) + bill-wise allocation
        adjustments: (() => {
          const rows = this.parseCalc(detail?.notes);
          for (const a of (detail?.allocations || [])) {
            rows.push({ label: `Bill ${a.billNo} par allocate`, amount: a.allocated });
          }
          return rows.length ? rows : undefined;
        })(),
        // Bill baki ho to pending; received allocation se ZYADA ho to ADVANCE (negative)
        balancePending: (() => {
          const dbPending = p.balancePending || 0;
          if (dbPending > 0) return dbPending;
          const allocated = (detail?.allocations || []).reduce((s: number, a: any) => s + (a.allocated || 0), 0);
          const extra = p.amount - allocated;
          return extra > 0.01 ? -extra : 0;
        })(),
        notes: this.cleanNotes(detail?.notes) || (p.referenceNo ? `Ref: ${p.referenceNo}` : null)
      });
    });
  }

  /** Notes ka "CALC:gross|tax|gr|rateDiff|dis|interest|adj|net" → kat-kut rows */
  private parseCalc(notes: string | null | undefined): { label: string; amount: number }[] {
    if (!notes) return [];
    const piece = notes.split(' | ').find(s => s.startsWith('CALC:'));
    if (!piece) return [];
    const [gross, tax, gr, rd, dis, int_, adj, net] = piece.slice(5).split('|').map(x => +x || 0);
    const rows: { label: string; amount: number }[] = [];
    rows.push({ label: 'Bill Amount (Gross + Tax)', amount: gross + tax });
    if (gr) rows.push({ label: 'GR (Goods Return)', amount: -gr });
    if (rd) rows.push({ label: 'Rate Diff', amount: -rd });
    if (dis) rows.push({ label: 'Discount', amount: -dis });
    if (int_) rows.push({ label: 'Interest', amount: int_ });
    if (adj) rows.push({ label: 'Adjustment', amount: adj });
    rows.push({ label: 'NET AMT', amount: net });
    return rows;
  }

  /** Notes me save hue "TXN:mode|bank|ref|date|amount" pieces → preview ki txn table */
  private parseTxns(notes: string | null | undefined) {
    if (!notes) return undefined;
    const rows = notes.split(' | ')
      .filter(s => s.startsWith('TXN:'))
      .map(s => {
        const [mode, bank, refNo, date, amount] = s.slice(4).split('|');
        return { mode, bank: bank || null, refNo: refNo || null, date: date || null, amount: +amount || 0 };
      })
      .filter(t => t.amount > 0);
    return rows.length ? rows : undefined;
  }

  /** TXN pieces hata kar baki notes (remark, supplier) hi dikhao */
  private cleanNotes(notes: string | null | undefined): string | null {
    if (!notes) return null;
    const rest = notes.split(' | ').filter(s => !s.startsWith('TXN:') && !s.startsWith('CALC:')).join(' | ');
    return rest || null;
  }

  // Supplier card ki detail (GST/mobile/city) ke liye parties list
  parties = signal<Party[]>([]);

  ngOnInit() {
    this.load();
    this.svc.listParties().subscribe({ next: p => this.parties.set(p), error: () => {} });
  }

  del(p: PaymentListItem) {
    if (!confirm(`🗑 Receipt ${p.paymentNo} delete karein?\n\nBill ka paid amount wapas pending ho jayega aur voucher reverse hoga.`)) return;
    this.svc.deletePayment(p.id).subscribe({
      next: () => this.load(),
      error: (e) => alert('Delete fail: ' + (e?.error?.error ?? 'unknown'))
    });
  }

  load() {
    this.loading.set(true);
    this.loadError.set(null);
    this.svc.listPayments({ type: this.filterType || undefined, size: 500 }).subscribe({
      next: (res) => { this.payments.set(res.items); this.loading.set(false); },
      error: (e: any) => {
        this.loading.set(false);
        const msg = e?.error?.error ?? e?.message ?? 'Server se data nahi aa paya';
        this.loadError.set(msg);
        this.toast.error('Load nahi hua: ' + msg);
      }
    });
  }
}
