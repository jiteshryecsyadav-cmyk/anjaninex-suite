import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TradingSubNavComponent } from '../components/trading-sub-nav.component';
import { TradingService, GoodsReturnListItem } from '../services/trading.service';
import { InvoicePreviewComponent, PreviewData } from '../../../shared/invoice-preview.component';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { InDatePipe } from '../../../shared/in-date.pipe';
import { PaginatorComponent } from '../../../shared/paginator.component';

@Component({
  selector: 'app-gr-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, TradingSubNavComponent, BackButtonComponent, InvoicePreviewComponent, InDatePipe, PaginatorComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">📦 Goods Returns (GR)</h2>
          <p class="text-sm text-[#6b3fa0]">Items returned to supplier — bill adjustments and credit notes</p>
        </div>
        <a routerLink="/trading/gr/new" class="btn-primary no-underline">+ New GR</a>
      </div>

      <app-trading-sub-nav></app-trading-sub-nav>

            <div class="flex gap-3 mb-4">
        <select [(ngModel)]="filterStatus" (change)="load()" class="input w-44">
          <option value="">All Status</option>
          <option value="pending">⏳ Pending</option>
          <option value="approved">✅ Approved</option>
          <option value="rejected">❌ Rejected</option>
        </select>
      </div>

      <div class="card p-0 overflow-hidden">
        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (grs().length === 0) {
          <div class="p-8 text-center text-gray-500">
            No goods returns yet. <a routerLink="/trading/gr/new" class="text-[#5c1a8b] underline">Create first GR</a>
          </div>
        } @else {
          <table class="w-full text-sm">
            <thead class="bg-[#1B2E5C] text-white text-xs uppercase">
              <tr>
                <th class="px-3 py-3 text-center w-12">#</th>
                <th class="px-3 py-3 text-left">GR NO</th>
                <th class="px-3 py-3 text-center">STATUS</th>
                <th class="px-3 py-3 text-left">SUPPLIER</th>
                <th class="px-3 py-3 text-left">BUYER</th>
                <th class="px-3 py-3 text-left">DATE</th>
                <th class="px-3 py-3 text-left">BILL NO</th>
                <th class="px-3 py-3 text-right">TOTAL</th>
                <th class="px-3 py-3 text-left">REASON</th>
                <th class="px-3 py-3 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              @for (g of pagedGrs(); track g.id; let i = $index) {
                <tr class="border-t hover:bg-[#FAF7F0]">
                  <td class="px-3 py-3 text-center text-gray-500">{{ (pageClamped()-1)*pageSize() + i + 1 }}</td>
                  <td class="px-3 py-3 font-mono text-xs font-bold text-[#1B2E5C]">{{ g.grNo }}</td>
                  <td class="px-3 py-3 text-center">
                    <span class="px-2 py-0.5 rounded-full text-xs font-bold"
                          [class.bg-yellow-100]="g.status === 'pending'"
                          [class.text-yellow-700]="g.status === 'pending'"
                          [class.bg-green-100]="g.status === 'approved'"
                          [class.text-green-700]="g.status === 'approved'"
                          [class.bg-red-100]="g.status === 'rejected'"
                          [class.text-red-700]="g.status === 'rejected'">
                      {{ g.status }}
                    </span>
                  </td>
                  <td class="px-3 py-3 font-semibold">{{ g.supplierName }}</td>
                  <td class="px-3 py-3 text-gray-700">{{ g.buyerName || '—' }}</td>
                  <td class="px-3 py-3 text-xs">{{ g.grDate | inDate }}</td>
                  <td class="px-3 py-3 font-mono text-xs">{{ g.originalBillNo || '—' }}</td>
                  <td class="px-3 py-3 text-right font-mono font-bold text-red-600">₹ {{ g.totalReturnAmount | number:'1.2-2' }}</td>
                  <td class="px-3 py-3 text-xs">—</td>
                  <td class="px-3 py-3 text-center">
                    @if (g.status === 'pending') {
                      <button (click)="approve(g.id)" class="text-xs px-2 py-1 bg-green-600 text-white rounded font-bold hover:bg-green-700">✓</button>
                      <button (click)="reject(g.id)" class="text-xs px-2 py-1 bg-red-600 text-white rounded font-bold ml-1 hover:bg-red-700">✗</button>
                    }
                    <button (click)="preview(g.id)" class="ai-btn" title="Preview & Print">👁</button>
                    <a [routerLink]="['/trading/gr', g.id, 'edit']" class="ai-btn" title="Edit">✏️</a>
                    <button (click)="del(g.id)" class="ai-btn" title="Delete">🗑️</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <app-paginator [total]="grs().length" [page]="pageClamped()" [pageSize]="pageSize()"
                         (pageChange)="page.set($event)" (pageSizeChange)="pageSize.set($event); page.set(1)"></app-paginator>
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
  `]
})
export class GrComponent {
  private svc = inject(TradingService);

  grs = signal<GoodsReturnListItem[]>([]);
  loading = signal(true);
  filterStatus = '';
  previewData = signal<PreviewData | null>(null);

  // Pagination
  page = signal(1);
  pageSize = signal(10);
  pageClamped = computed(() => {
    const pages = Math.max(1, Math.ceil(this.grs().length / this.pageSize()));
    return Math.min(this.page(), pages);
  });
  pagedGrs = computed(() => {
    const st = (this.pageClamped() - 1) * this.pageSize();
    return this.grs().slice(st, st + this.pageSize());
  });

  preview(id: string) {
    this.svc.getGoodsReturn(id).subscribe(g => {
      this.svc.getParty(g.supplierPartyId).subscribe(sup => {
        const buildGr = (buyerCard: any) => {
          const lines = g.lines.map(l => ({
            itemName: l.itemName,
            description: l.description,
            hsnSac: l.hsnSac,
            qty: l.qty,
            unit: l.unit,
            rate: l.rate,
            rd: l.rd,
            taxPct: l.igstPct,
            taxableAmount: l.taxableAmount,
            taxAmount: l.taxAmount,
            totalAmount: l.totalAmount
          }));
          this.previewData.set({
            type: 'gr',
            title: 'GOODS RETURN NOTE',
            number: g.grNo,
            date: g.grDate,
            firmName: 'Namokara Agencies',
            firmGst: '24AAMPV0025C1Z3',
            firmAddress: 'Commission Agent · Surat, Gujarat',
            supplier: {
              name: sup.displayName,
              gst: sup.gst,
              mobile: sup.phone,
              city: sup.city,
              address: sup.city ? `Address on file · ${sup.city}` : null
            },
            buyer: buyerCard,
            lines,
            grossAmount: g.totalReturnAmount,
            taxableAmount: g.taxableAmount,
            totalTax: g.taxAmount,
            netAmount: g.totalReturnAmount,
            transport: g.transport,
            lrNo: g.lrNo,
            notes: g.reason ? `Reason: ${g.reason}${g.remark ? ' · ' + g.remark : ''}` : g.remark
          });
        };
        if (g.buyerPartyId) {
          this.svc.getParty(g.buyerPartyId).subscribe(buy => {
            buildGr({
              name: buy.displayName,
              gst: buy.gst,
              mobile: buy.phone,
              city: buy.city,
              address: buy.city ? `Address on file · ${buy.city}` : null
            });
          });
        } else {
          buildGr(undefined);
        }
      });
    });
  }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.svc.listGoodsReturns({ status: this.filterStatus || undefined, size: 500 }).subscribe({
      next: (res) => {
        this.grs.set(res.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  approve(id: string) {
    if (!confirm('Approve this Goods Return? This will adjust the original bill / create credit note.')) return;
    this.svc.approveGoodsReturn(id).subscribe({
      next: () => { alert('✓ GR approved!'); this.load(); },
      error: (e) => alert('Failed: ' + (e?.error?.error ?? 'unknown error'))
    });
  }

  reject(id: string) {
    const reason = prompt('Rejection reason?');
    if (!reason) return;
    this.svc.rejectGoodsReturn(id, reason).subscribe({
      next: () => { alert('✗ GR rejected!'); this.load(); },
      error: (e) => alert('Failed: ' + (e?.error?.error ?? 'unknown error'))
    });
  }

  del(id: string) {
    if (!confirm('Delete this Goods Return? This cannot be undone.')) return;
    this.svc.deleteGoodsReturn(id).subscribe({
      next: () => { alert('🗑 GR deleted'); this.load(); },
      error: (e) => alert('Delete failed: ' + (e?.error?.error ?? 'unknown error'))
    });
  }
}
