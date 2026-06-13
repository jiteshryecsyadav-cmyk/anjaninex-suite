import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TradingSubNavComponent } from '../components/trading-sub-nav.component';
import { TradingService, OrderListItem } from '../services/trading.service';
import { BackButtonComponent } from '../../../shared/back-button.component';
import { InvoicePreviewComponent, PreviewData } from '../../../shared/invoice-preview.component';
import { InDatePipe } from '../../../shared/in-date.pipe';
import { PaginatorComponent } from '../../../shared/paginator.component';
import { FeatureService } from '../../../shared/feature.service';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, TradingSubNavComponent, BackButtonComponent, InvoicePreviewComponent, InDatePipe, PaginatorComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="page-top-bar"><app-back-button></app-back-button></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">Orders</h2>
          <p class="text-sm text-[#6b3fa0]">All sales/purchase orders (pre-bill stage)</p>
        </div>
        <a routerLink="/trading/orders/new" class="btn-primary no-underline">+ New Order</a>
      </div>

      <app-trading-sub-nav></app-trading-sub-nav>

      <!-- KPI cards — deleted orders count/amount me NAHI -->
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div class="kpi-card" style="border-left:4px solid #1B2E5C; background:#1B2E5C0d;">
          <div class="kpi-lbl">📋 TOTAL ORDERS</div>
          <div class="kpi-val" style="color:#1B2E5C;">{{ liveCount() }}</div>
          <div class="kpi-sub">deleted count nahi hote</div>
        </div>
        <div class="kpi-card" style="border-left:4px solid #16a34a; background:#16a34a0d;">
          <div class="kpi-lbl">💰 TOTAL ORDER AMOUNT</div>
          <div class="kpi-val" style="color:#16a34a;">₹ {{ liveAmount() | number:'1.2-2' }}</div>
          <div class="kpi-sub">sirf active orders ka total</div>
        </div>
      </div>

      <div class="flex flex-wrap gap-3 mb-4 items-center">
        <div class="flex-1 min-w-[300px] relative">
          <input type="text" [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)"
                 placeholder="🔍 Search by Party Name / Order No..."
                 class="input w-full pr-8" style="padding-left: 14px;">
          @if (searchTerm()) {
            <button (click)="searchTerm.set('')" type="button"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 text-lg font-bold">✕</button>
          }
        </div>
        <select [(ngModel)]="filterStatus" (change)="load()" class="input w-44">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        @if (searchTerm()) {
          <span class="text-xs text-gray-500">
            Showing <b class="text-[#5c1a8b]">{{ filteredOrders().length }}</b> of {{ orders().length }}
          </span>
        }
      </div>

      <div class="card p-0 overflow-hidden">
        @if (loading()) { <div class="p-8 text-center text-gray-500">Loading...</div> }
        @else if (orders().length === 0) {
          <div class="p-8 text-center text-gray-500">No orders yet. <a routerLink="/trading/orders/new" class="text-[#5c1a8b] underline">Create first order</a></div>
        }
        @else {
          @if (filteredOrders().length === 0) {
            <div class="p-8 text-center text-gray-500">
              ⚠️ No orders match "<b class="text-[#5c1a8b]">{{ searchTerm() }}</b>". Try a different search.
            </div>
          } @else {
          <table class="w-full text-sm">
            <thead class="bg-[#1B2E5C] text-white text-xs uppercase">
              <tr>
                <th class="px-3 py-3 text-center w-12">NO.</th>
                <th class="px-3 py-3 text-left">ORDER NO</th>
                <th class="px-3 py-3 text-center">STATUS</th>
                <th class="px-3 py-3 text-left">SUPPLIER</th>
                <th class="px-3 py-3 text-left">BUYER</th>
                <th class="px-3 py-3 text-left">ORDER DATE</th>
                <th class="px-3 py-3 text-left">BILL ENTRY DATE</th>
                <th class="px-3 py-3 text-center">DISPATCH DAYS</th>
                <th class="px-3 py-3 text-right">TOTAL AMOUNT</th>
                <th class="px-3 py-3 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              @for (o of pagedOrders(); track o.id; let i = $index) {
                <tr class="border-t hover:bg-[#FAF7F0]" [class.opacity-50]="o.isDeleted">
                  <td class="px-3 py-3 text-center text-gray-500">{{ (pageClamped()-1)*pageSize() + i + 1 }}</td>
                  <td class="px-3 py-3 font-mono text-xs font-bold text-[#1B2E5C]">
                    <span [class.line-through]="o.isDeleted">{{ o.orderNo }}</span>
                    @if (o.isDeleted) {
                      <span class="ml-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">DELETED</span>
                    }
                  </td>
                  <td class="px-3 py-3 text-center">
                    <span class="text-xs px-2 py-0.5 rounded-full font-bold"
                          [class.bg-yellow-100]="o.status === 'pending'"
                          [class.text-yellow-700]="o.status === 'pending'"
                          [class.bg-green-100]="o.status === 'completed'"
                          [class.text-green-700]="o.status === 'completed'"
                          [class.bg-red-100]="o.status === 'cancelled'"
                          [class.text-red-700]="o.status === 'cancelled'">
                      {{ o.status }}
                    </span>
                  </td>
                  <td class="px-3 py-3 font-semibold">{{ o.partyName }}</td>
                  <td class="px-3 py-3 text-gray-700">{{ o.buyerName || '—' }}</td>
                  <td class="px-3 py-3 text-xs">{{ o.orderDate | inDate }}</td>
                  <td class="px-3 py-3 text-xs">{{ o.billedDate ? (o.billedDate | inDate) : '— bill nahi bana' }}</td>
                  <td class="px-3 py-3 text-center text-xs">
                    @if (dispatchDays(o) !== null) {
                      <span class="px-2 py-0.5 rounded-full font-bold"
                            [class.bg-green-100]="dispatchDays(o)! <= 3"
                            [class.text-green-700]="dispatchDays(o)! <= 3"
                            [class.bg-yellow-100]="dispatchDays(o)! > 3 && dispatchDays(o)! <= 7"
                            [class.text-yellow-700]="dispatchDays(o)! > 3 && dispatchDays(o)! <= 7"
                            [class.bg-red-100]="dispatchDays(o)! > 7"
                            [class.text-red-700]="dispatchDays(o)! > 7">
                        {{ dispatchDays(o) === 0 ? 'Same day' : dispatchDays(o) + ' din' }}
                      </span>
                    } @else {
                      <span class="text-gray-400">—</span>
                    }
                  </td>
                  <td class="px-3 py-3 text-right font-mono font-bold">₹ {{ o.total | number:'1.2-2' }}</td>
                  <td class="px-3 py-3 text-center">
                    @if (o.isDeleted) {
                      <span class="text-xs text-gray-400">—</span>
                    } @else {
                      <button (click)="preview(o.id)" class="ai-btn" title="Preview & Print">👁</button>
                      <a [routerLink]="['/trading/orders', o.id, 'edit']" class="ai-btn" title="Edit">✏️</a>
                      <button (click)="del(o.id)" class="ai-btn" title="Delete">🗑️</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <app-paginator [total]="filteredOrders().length" [page]="pageClamped()" [pageSize]="pageSize()"
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
    .kpi-card { background: #fff; border: 1px solid #f0e6ff; border-left: 4px solid #5c1a8b;
      border-radius: 12px; padding: 14px 18px; box-shadow: 0 1px 4px rgba(92,26,139,.06); }
    .kpi-lbl { font-size: 10px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: .5px; }
    .kpi-val { font-size: 24px; font-weight: 900; color: #1B2E5C; font-family: 'JetBrains Mono', monospace; margin-top: 2px; }
    .kpi-sub { font-size: 10px; color: #9ca3af; }

    .ai-btn { display:inline-block; width:28px; height:28px; border:0; background:transparent;
      border-radius:6px; cursor:pointer; font-size:13px; transition:background 0.15s; margin:0 1px; }
    .ai-btn:hover { background:#FAF7F0; }

    @media (max-width: 640px) {
      .grid-cols-2 { grid-template-columns: 1fr !important; }
      .kpi-card { padding: 12px 14px; }
      .card { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
      table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; width: 100%; }
    }
  `]
})
export class OrdersComponent {
  private svc = inject(TradingService);
  features = inject(FeatureService);
  orders = signal<OrderListItem[]>([]);
  loading = signal(true);
  filterStatus = '';
  previewData = signal<PreviewData | null>(null);

  // Universal search — filters by party name, buyer name, order no (frontend)
  searchTerm = signal('');
  filteredOrders = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    if (!q) return this.orders();
    return this.orders().filter(o =>
      (o.orderNo   || '').toLowerCase().includes(q) ||
      (o.partyName || '').toLowerCase().includes(q) ||
      (o.buyerName || '').toLowerCase().includes(q)
    );
  });

  // Pagination
  page = signal(1);
  pageSize = signal(10);
  pageClamped = computed(() => {
    const pages = Math.max(1, Math.ceil(this.filteredOrders().length / this.pageSize()));
    return Math.min(this.page(), pages);
  });
  pagedOrders = computed(() => {
    const st = (this.pageClamped() - 1) * this.pageSize();
    return this.filteredOrders().slice(st, st + this.pageSize());
  });

  ngOnInit() { this.load(); }

  // KPI cards — deleted exclude
  // Order date se bill (dispatch) date tak kitne din — supplier ne kitni jaldi maal bheja
  dispatchDays(o: { orderDate: string; billedDate?: string | null }): number | null {
    if (!o.billedDate || !o.orderDate) return null;
    const a = new Date(o.orderDate).getTime();
    const b = new Date(o.billedDate).getTime();
    if (isNaN(a) || isNaN(b)) return null;
    return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
  }

  liveCount = computed(() => this.orders().filter(o => !o.isDeleted).length);
  liveAmount = computed(() => this.orders().filter(o => !o.isDeleted).reduce((s, o) => s + (o.total || 0), 0));

  load() {
    this.loading.set(true);
    this.svc.listOrders({ status: this.filterStatus || undefined, size: 500 }).subscribe({
      next: (res) => {
        // Deleted orders list me NAHI dikhenge (ye Activity Log report me hain)
        const live = res.items.filter(o => !o.isDeleted);
        // Order no ke number se sort — JPR-O1, JPR-O2, JPR-O3... line se
        const num = (s: string | null) => { const m = (s || '').match(/(\d+)\s*$/); return m ? +m[1] : 0; };
        this.orders.set([...live].sort((a, b) => num(a.orderNo) - num(b.orderNo)));
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  preview(id: string) {
    this.svc.getOrder(id).subscribe(o => {
      // Fetch supplier party details
      this.svc.getParty(o.partyId).subscribe(sup => {
        const buildOrder = (buyer: any) => {
          const lines = o.lines.map(l => ({
            itemName: l.itemName,
            description: l.description,
            hsnSac: l.hsnSac,
            qty: l.qty,
            unit: l.unit,
            rate: l.rate,
            rd: l.rd,
            taxPct: l.sgstPct + l.cgstPct,
            taxableAmount: l.taxableAmount,
            taxAmount: l.taxAmount,
            totalAmount: l.totalAmount
          }));
          this.previewData.set({
            type: 'order',
            title: 'ORDER CONFIRMATION',
            number: o.orderNo,
            date: o.orderDate,
            firmName: this.features.firmName() || 'Anjaninex',
            firmGst: this.features.firmGst(),
            firmAddress: 'Commission Agent · Surat, Gujarat',
            supplier: {
              name: sup.displayName,
              gst: sup.gst,
              mobile: sup.phone,
              city: sup.city,
              address: sup.city ? `Address on file · ${sup.city}` : null
            },
            buyer,
            lines,
            // Reconciling breakdown: Gross − CD + Tax = Net (Tax = residual of net, sahi after-discount GST)
            grossAmount: o.subtotal,
            taxableAmount: o.subtotal - (o.cdAmount || 0),
            totalTax: o.total - (o.subtotal - (o.cdAmount || 0)),
            cdAmount: o.cdAmount,
            netAmount: o.total,
            paymentTerms: o.paymentTerms,
            supplierOrderNo: o.supplierOrderNo,
            notes: o.notes
          });
        };

        // If there's a buyer, fetch their details too
        if (o.buyerPartyId) {
          this.svc.getParty(o.buyerPartyId).subscribe(buy => {
            buildOrder({
              name: buy.displayName,
              gst: buy.gst,
              mobile: buy.phone,
              city: buy.city,
              address: buy.city ? `Address on file · ${buy.city}` : null
            });
          });
        } else {
          buildOrder(undefined);
        }
      });
    });
  }

  del(id: string) {
    if (!confirm('Delete this order? This action cannot be undone.')) return;
    this.svc.deleteOrder(id).subscribe(() => this.load());
  }
}
