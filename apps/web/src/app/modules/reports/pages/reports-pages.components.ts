import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  ReportsService,
  SalesRegisterRow, OutstandingRow, PartyOutstanding,
  PartySales, ItemSales, GstSummary, GstByRate, PaymentMode
} from '../services/reports.service';
import { TradingService, GoodsReturnListItem, Party, OrderListItem, BillListItem, OrderDetail, BillDetail } from '../../trading/services/trading.service';
import { AiService, ScanReportRow } from '../../ai/services/ai.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { forkJoin } from 'rxjs';
import { InDatePipe } from '../../../shared/in-date.pipe';
import { WaSendComponent } from '../../../shared/wa-send.component';
import { FeatureService } from '../../../shared/feature.service';

// CSV cell escaping: quote when value has comma/quote/newline; doubles inner quotes
function csvCell(v: any): string {
  const s = (v ?? '').toString();
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Shared sub-nav template
const subNav = `
  <div class="flex gap-1 mb-6 border-b border-[#ddc8f5] flex-wrap">
    <a routerLink="/reports/dashboard" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       [routerLinkActiveOptions]="{exact:true}"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📊 Dashboard</a>
    <a routerLink="/reports/sales-register" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Sales Register</a>
    <a routerLink="/reports/outstanding" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Outstanding</a>
    <a routerLink="/reports/supplier-buyer" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Supplier vs Buyer</a>
    <a routerLink="/reports/cheque-handover" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Cheque Handover</a>
    <a routerLink="/reports/party-outstanding" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Aging</a>
    <a routerLink="/reports/top-parties" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Top Parties</a>
    <a routerLink="/reports/top-items" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">Top Items</a>
    <a routerLink="/reports/gst" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">GST</a>
    <a routerLink="/reports/gr" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">↩️ GR Report</a>
    <a routerLink="/reports/commission" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">💰 Commission</a>
    <a routerLink="/reports/on-time" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">⏱️ On Time / Late</a>
    <a routerLink="/reports/order-vs-bill" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📋 Order vs Bill</a>
    <a routerLink="/reports/pending-orders" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">📦 Pending Orders</a>
    <a routerLink="/reports/party-wise" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">👥 Party Wise</a>
    <a routerLink="/reports/scan" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🤖 Scan Report</a>
    <a routerLink="/reports/activity" routerLinkActive="!border-[#5c1a8b] !text-[#5c1a8b]"
       class="px-4 py-2 text-sm font-semibold text-gray-500 border-b-2 border-transparent hover:text-[#5c1a8b]">🕵️ Activity Log</a>
  </div>
`;

// =============================================================================
// SALES REGISTER — legacy-styled header + 5 KPI cards
// =============================================================================
@Component({
  selector: 'app-sales-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, InDatePipe, WaSendComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      ${subNav}

      <!-- ═══════════ REPORT HEADER CARD ═══════════ -->
      <div class="rpt-header-card">
        <div class="rh-top">
          <div class="rh-icon">📋</div>
          <div class="flex-1">
            <div class="rh-title">Sales Register</div>
            <div class="rh-sub">All sales bills with GST breakdown</div>
          </div>
          <div class="rh-actions">
            <button class="btn-print" (click)="printPage()">🖨️ Print</button>
            <button class="btn-export" (click)="exportCsv()">⬇️ CSV Export</button>
            <app-wa-send [message]="waMessage()" [suggestedPhone]="waPhone()"></app-wa-send>
          </div>
        </div>

        <div class="filters">
          <div class="fl">
            <label>From</label>
            <input type="date" [(ngModel)]="fromDate" (change)="load()">
          </div>
          <span class="sep">–</span>
          <div class="fl">
            <label>To</label>
            <input type="date" [(ngModel)]="toDate" (change)="load()">
          </div>
          <div class="fl">
            <label>Aging</label>
            <select [(ngModel)]="agingFilter" (change)="load()">
              <option value="">All Aging</option>
              <option value="0-30">0–30 Days</option>
              <option value="31-60">31–60 Days</option>
              <option value="61-90">61–90 Days</option>
              <option value="90+">90+ Days</option>
            </select>
          </div>
          <div class="fl">
            <label>Party</label>
            <select [(ngModel)]="partyFilter" (change)="load()">
              <option value="">All Parties</option>
              <option value="buyers">Buyers Only</option>
              <option value="suppliers">Suppliers Only</option>
            </select>
          </div>
          <div class="fl">
            <label>Status</label>
            <select [(ngModel)]="status" (change)="load()">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <button class="btn-apply" (click)="load()">Apply</button>
          <button class="btn-reset" (click)="reset()">Reset</button>
        </div>
      </div>

      <!-- ═══════════ 5 KPI CARDS ═══════════ -->
      <div class="sum-row">
        <div class="sum-card c-p">
          <div class="sum-label">Total Sales</div>
          <div class="sum-val">₹{{ totalSales() | number:'1.0-0' }}</div>
          <div class="sum-sub">{{ filteredRows().length }} Bills</div>
        </div>
        <div class="sum-card c-a">
          <div class="sum-label">0–30 Days</div>
          <div class="sum-val va">₹{{ bucket0_30() | number:'1.0-0' }}</div>
          <div class="sum-sub">{{ bucketCount('0-30') }} Bills</div>
        </div>
        <div class="sum-card c-w">
          <div class="sum-label">31–60 Days</div>
          <div class="sum-val vw">₹{{ bucket31_60() | number:'1.0-0' }}</div>
          <div class="sum-sub">{{ bucketCount('31-60') }} Bills</div>
        </div>
        <div class="sum-card c-d">
          <div class="sum-label">61–90 Days</div>
          <div class="sum-val vd">₹{{ bucket61_90() | number:'1.0-0' }}</div>
          <div class="sum-sub">{{ bucketCount('61-90') }} Bills</div>
        </div>
        <div class="sum-card c-d">
          <div class="sum-label">90+ Days 🚨</div>
          <div class="sum-val vd">₹{{ bucket90Plus() | number:'1.0-0' }}</div>
          <div class="sum-sub">{{ bucketCount('90+') }} Bills</div>
        </div>
      </div>

      <!-- ═══════════ TABLE ═══════════ -->
      <div class="t-card">
        <div class="t-toolbar">
          <div class="t-title">Sales Bills</div>
          <div class="t-count">{{ filteredRows().length }} records</div>
        </div>
        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (filteredRows().length === 0) {
          <div class="p-8 text-center text-gray-500">No sales matching the filters</div>
        } @else {
          <table class="w-full text-sm">
            <thead class="bg-anjaninex-navy text-white uppercase text-xs">
              <tr>
                <th class="px-2 py-3 text-left">S.NO</th>
                <th class="px-2 py-3 text-left">Bill No</th>
                <th class="px-2 py-3 text-left">Date</th>
                <th class="px-2 py-3 text-left">Supplier</th>
                <th class="px-2 py-3 text-left">Buyer</th>
                <th class="px-2 py-3 text-right">Subtotal</th>
                <th class="px-2 py-3 text-right">Discount</th>
                <th class="px-2 py-3 text-right">CGST</th>
                <th class="px-2 py-3 text-right">SGST</th>
                <th class="px-2 py-3 text-right">IGST</th>
                <th class="px-2 py-3 text-right">Total</th>
                <th class="px-2 py-3 text-right">Paid</th>
                <th class="px-2 py-3 text-center">Days (Since Bill)</th>
                <th class="px-2 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              @for (r of filteredRows(); track r.billNo; let i = $index) {
                <tr class="border-t hover:bg-[#FAF7F0]">
                  <td class="px-2 py-1.5 font-mono text-xs">{{ i + 1 }}</td>
                  <td class="px-2 py-1.5 font-mono text-xs font-bold text-[#1B2E5C]">{{ r.billNo }}</td>
                  <td class="px-2 py-1.5 text-xs">{{ r.billDate | inDate }}</td>
                  <td class="px-2 py-1.5 font-semibold">{{ r.partyName }}</td>
                  <td class="px-2 py-1.5">{{ r.buyerName || '—' }}</td>
                  <td class="px-2 py-1.5 text-right font-mono">{{ r.subtotal | number:'1.2-2' }}</td>
                  <td class="px-2 py-1.5 text-right font-mono text-orange-600">{{ r.discount | number:'1.2-2' }}</td>
                  <td class="px-2 py-1.5 text-right font-mono">{{ r.cgst | number:'1.2-2' }}</td>
                  <td class="px-2 py-1.5 text-right font-mono">{{ r.sgst | number:'1.2-2' }}</td>
                  <td class="px-2 py-1.5 text-right font-mono">{{ r.igst | number:'1.2-2' }}</td>
                  <td class="px-2 py-1.5 text-right font-mono font-bold">{{ r.total | number:'1.2-2' }}</td>
                  <td class="px-2 py-1.5 text-right font-mono text-green-600">{{ r.paidAmount | number:'1.2-2' }}</td>
                  <td class="px-2 py-1.5 text-center text-xs">
                    <span class="badge"
                          [class.b-ok]="ageBucket(r.billDate) === '0-30'"
                          [class.b-warn]="ageBucket(r.billDate) === '31-60'"
                          [class.b-acc]="ageBucket(r.billDate) === '61-90'"
                          [class.b-danger]="ageBucket(r.billDate) === '90+'">
                      {{ daysSince(r.billDate) }} din{{ ageBucket(r.billDate) === '90+' ? ' 🚨' : '' }}
                    </span>
                  </td>
                  <td class="px-2 py-1.5 text-center text-xs">
                    <span class="px-1.5 py-0.5 rounded font-bold"
                          [class.bg-yellow-100]="r.status === 'pending'"
                          [class.text-yellow-700]="r.status === 'pending'"
                          [class.bg-blue-100]="r.status === 'partial'"
                          [class.text-blue-700]="r.status === 'partial'"
                          [class.bg-green-100]="r.status === 'paid'"
                          [class.text-green-700]="r.status === 'paid'">
                      {{ r.status }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
            <tfoot class="bg-gray-100 font-bold">
              <tr>
                <td colspan="5" class="px-2 py-2 text-right">TOTALS:</td>
                <td class="px-2 py-2 text-right font-mono">{{ sum('subtotal') | number:'1.2-2' }}</td>
                <td class="px-2 py-2 text-right font-mono">{{ sum('discount') | number:'1.2-2' }}</td>
                <td class="px-2 py-2 text-right font-mono">{{ sum('cgst') | number:'1.2-2' }}</td>
                <td class="px-2 py-2 text-right font-mono">{{ sum('sgst') | number:'1.2-2' }}</td>
                <td class="px-2 py-2 text-right font-mono">{{ sum('igst') | number:'1.2-2' }}</td>
                <td class="px-2 py-2 text-right font-mono">{{ sum('total') | number:'1.2-2' }}</td>
                <td class="px-2 py-2 text-right font-mono text-green-700">{{ sum('paidAmount') | number:'1.2-2' }}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .rpt-header-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      padding: 14px 20px; margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(92,26,139,0.06);
    }
    .rh-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .rh-icon {
      width: 38px; height: 38px; border-radius: 10px; background: #f0e6ff;
      display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    .rh-title { font-size: 17px; font-weight: 800; color: #5c1a8b; }
    .rh-sub { font-size: 11px; color: #6b3fa0; margin-top: 2px; }
    .rh-actions { display: flex; gap: 8px; }
    .btn-print, .btn-export {
      padding: 7px 14px; border-radius: 8px; border: none; font-size: 12px; font-weight: 600;
      cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-family: inherit;
    }
    .btn-print { background: #f0e6ff; color: #5c1a8b; border: 1.5px solid #ddc8f5; }
    .btn-print:hover { background: #5c1a8b; color: #fff; }
    .btn-export { background: #f57c00; color: #fff; }
    .btn-export:hover { background: #e65100; }

    .filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .fl { display: flex; align-items: center; gap: 5px; }
    .fl label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .5px; color: #6b3fa0;
    }
    .fl input[type=date], .fl select {
      background: #faf5ff; border: 1.5px solid #ddc8f5; border-radius: 8px;
      padding: 5px 9px; font-size: 12px; color: #2d1040; font-family: inherit; outline: none;
    }
    .fl input[type=date]:focus, .fl select:focus {
      border-color: #5c1a8b; box-shadow: 0 0 0 3px rgba(92,26,139,.1);
    }
    .fl input[type=date] { width: 120px; }
    .sep { color: #b39cc0; font-size: 12px; }
    .btn-apply {
      background: #5c1a8b; color: #fff; border: none; padding: 5px 14px;
      border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
    }
    .btn-reset {
      background: #f0e6ff; color: #6b3fa0; border: 1px solid #ddc8f5;
      padding: 5px 10px; border-radius: 8px; font-size: 12px; cursor: pointer; font-family: inherit;
    }

    .sum-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .sum-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      padding: 12px 16px; flex: 1; min-width: 150px; position: relative; overflow: hidden;
      box-shadow: 0 2px 8px rgba(92,26,139,.06);
    }
    .sum-card::after {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      border-radius: 12px 12px 0 0;
    }
    .sum-card.c-p::after { background: #5c1a8b; }
    .sum-card.c-a::after { background: #f57c00; }
    .sum-card.c-g::after { background: #16a34a; }
    .sum-card.c-d::after { background: #c62828; }
    .sum-card.c-w::after { background: #f9a825; }
    .sum-label {
      font-size: 9px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .9px; color: #b39cc0; margin-bottom: 5px;
    }
    .sum-val { font-size: 20px; font-weight: 800; color: #5c1a8b; font-family: monospace; }
    .sum-val.vg { color: #16a34a; }
    .sum-val.vd { color: #c62828; }
    .sum-val.va { color: #f57c00; }
    .sum-val.vw { color: #b45309; }
    .sum-sub { font-size: 10px; color: #6b3fa0; margin-top: 2px; }

    .t-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      overflow: hidden; box-shadow: 0 2px 10px rgba(92,26,139,.06);
    }
    .t-toolbar {
      display: flex; align-items: center; gap: 10px; padding: 11px 14px;
      border-bottom: 1.5px solid #ddc8f5; background: #f0e6ff;
    }
    .t-title { font-size: 13px; font-weight: 800; color: #5c1a8b; flex: 1; }
    .t-count { font-size: 11px; color: #6b3fa0; font-family: monospace; }

    .badge {
      display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 10px;
      font-size: 10px; font-weight: 700; white-space: nowrap;
    }
    .b-ok { background: #dcfce7; color: #16a34a; }
    .b-danger { background: #fde8e8; color: #c62828; }
    .b-warn { background: #fff8e1; color: #b45309; }
    .b-acc { background: #fff3e0; color: #f57c00; }

    @media (max-width: 640px) {
      .rpt-header-card { padding: 12px 14px; }
      .rh-top { flex-wrap: wrap; }
      .rh-actions { flex-wrap: wrap; width: 100%; }
      .filters { gap: 8px; }
      .fl { flex-wrap: wrap; }
      .fl input[type=date], .fl select { width: 100% !important; }
      .sum-row { gap: 8px; }
      .sum-card { min-width: 100% !important; width: 100% !important; }
      .t-card { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .t-card table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
    }
  `]
})
export class SalesRegisterComponent {
  private svc = inject(ReportsService);
  features = inject(FeatureService);
  rows = signal<SalesRegisterRow[]>([]);
  loading = signal(true);
  fromDate = '';   // default: SAARE bills (date filter chahiye to user khud lagaye)
  toDate = new Date().toISOString().split('T')[0];
  status = '';
  agingFilter = '';
  partyFilter = '';

  // Calculate days since bill date
  daysSince(billDate: string): number {
    const d = new Date(billDate);
    const today = new Date();
    return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  }
  // Bucket label for a bill
  ageBucket(billDate: string): '0-30' | '31-60' | '61-90' | '90+' {
    const d = this.daysSince(billDate);
    if (d <= 30) return '0-30';
    if (d <= 60) return '31-60';
    if (d <= 90) return '61-90';
    return '90+';
  }

  // Apply aging + party filters in memory (recomputed each change detection cycle)
  filteredRows(): SalesRegisterRow[] {
    const all = this.rows();
    const ag = this.agingFilter;
    const pf = this.partyFilter;
    const filtered = all.filter(r => {
      if (ag && this.ageBucket(r.billDate) !== ag) return false;
      // Broker model: har row me supplier (partyName) + buyer (buyerName) dono hote hain
      void pf;
      return true;
    });
    // Sort by numeric suffix of billNo ascending (e.g. JPR-1, JPR-2, ..., JPR-10)
    const num = (s: string) => { const m = (s || '').match(/(\d+)\s*$/); return m ? +m[1] : 0; };
    return [...filtered].sort((a, b) => num(a.billNo) - num(b.billNo));
  }

  sum(field: keyof SalesRegisterRow) {
    return this.filteredRows().reduce((s, r) => s + (Number(r[field]) || 0), 0);
  }

  // KPI computations (using filteredRows for live updates)
  totalSales = () => this.filteredRows().reduce((s, r) => s + (r.total || 0), 0);
  bucket0_30  = () => this.filteredRows().filter(r => this.ageBucket(r.billDate) === '0-30').reduce((s, r) => s + (r.total || 0), 0);
  bucket31_60 = () => this.filteredRows().filter(r => this.ageBucket(r.billDate) === '31-60').reduce((s, r) => s + (r.total || 0), 0);
  bucket61_90 = () => this.filteredRows().filter(r => this.ageBucket(r.billDate) === '61-90').reduce((s, r) => s + (r.total || 0), 0);
  bucket90Plus = () => this.filteredRows().filter(r => this.ageBucket(r.billDate) === '90+').reduce((s, r) => s + (r.total || 0), 0);
  bucketCount(b: string) { return this.filteredRows().filter(r => this.ageBucket(r.billDate) === b).length; }

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.svc.salesRegister(this.fromDate, this.toDate, this.status || undefined).subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
  reset() {
    this.fromDate = '';   // saare bills
    this.toDate = new Date().toISOString().split('T')[0];
    this.status = '';
    this.agingFilter = '';
    this.partyFilter = '';
    this.load();
  }
  printPage() { window.print(); }

  // ── WhatsApp share ──
  private fmt(d: string): string {
    if (!d) return '—';
    const [y, m, dd] = d.split('-');
    return `${dd}/${m}/${(y || '').slice(-2)}`;
  }
  waMessage(): string {
    const rows = this.filteredRows();
    if (!rows.length) return '';
    const upto = this.fmt(this.toDate || new Date().toISOString().split('T')[0]);
    const lines: string[] = [`*Sales Register* (${upto} tak)`, 'Sabhi parties'];
    const max = 15;
    rows.slice(0, max).forEach((r, i) => {
      lines.push(`${i + 1}. ${r.billNo} · ${r.partyName} · ${this.fmt(r.billDate)} · ₹${Math.round(r.total || 0).toLocaleString('en-IN')} · ${r.status} (${this.daysSince(r.billDate)} din)`);
    });
    if (rows.length > max) lines.push(`+${rows.length - max} aur...`);
    lines.push('------------------');
    lines.push(`Total: ₹${Math.round(this.totalSales()).toLocaleString('en-IN')}`);
    lines.push('- ' + (this.features.firmName() || 'Anjaninex'));
    return lines.join('\n');
  }
  waPhone(): string | null {
    // Is report me parties list load nahi hoti aur party filter buyers/suppliers type ka hai — number user khud daalega
    return null;
  }

  exportCsv() {
    const rows = this.rows();
    const header = ['Bill No','Date','Supplier','Buyer','Subtotal','Discount','CGST','SGST','IGST','Total','Paid','Status'];
    const lines = [header.map(csvCell).join(',')];
    rows.forEach(r => {
      lines.push([
        r.billNo, r.billDate, r.partyName, (r.buyerName || '—'),
        r.subtotal, r.discount, r.cgst, r.sgst, r.igst, r.total, r.paidAmount, r.status
      ].map(csvCell).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Sales_Register_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }
}

// =============================================================================
// OUTSTANDING — Bill Pending Report (legacy-styled top + 5 KPI cards)
// =============================================================================
@Component({
  selector: 'app-outstanding-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, InDatePipe, WaSendComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      ${subNav}

      <!-- ═══════════ REPORT HEADER CARD (legacy style) ═══════════ -->
      <div class="rpt-header-card">
        <div class="rh-top">
          <div class="rh-icon">🔴</div>
          <div class="flex-1">
            <div class="rh-title">Bill Pending Report</div>
            <div class="rh-sub">Outstanding bills with aging days — party wise</div>
          </div>
          <div class="rh-actions">
            <button class="btn-print" (click)="printPage()">🖨️ Print</button>
            <button class="btn-export" (click)="exportCsv()">⬇️ CSV Export</button>
            <app-wa-send [message]="waMessage()" [suggestedPhone]="waPhone()"></app-wa-send>
          </div>
        </div>

        <div class="filters">
          <div class="fl">
            <label>From</label>
            <input type="date" [(ngModel)]="fromDate" (change)="load()">
          </div>
          <span class="sep">–</span>
          <div class="fl">
            <label>To</label>
            <input type="date" [(ngModel)]="toDate" (change)="load()">
          </div>
          <div class="fl">
            <label>Aging</label>
            <select [(ngModel)]="agingFilter" (change)="load()">
              <option value="">All Pending</option>
              <option value="0-30">0–30 Days</option>
              <option value="31-60">31–60 Days</option>
              <option value="61-90">61–90 Days</option>
              <option value="90+">90+ Days</option>
            </select>
          </div>
          <div class="fl">
            <label>Party</label>
            <select [(ngModel)]="partyFilter" (change)="load()">
              <option value="">All Parties</option>
              <option value="buyers">Buyers Only</option>
              <option value="suppliers">Suppliers Only</option>
            </select>
          </div>
          <button class="btn-apply" (click)="load()">Apply</button>
          <button class="btn-reset" (click)="reset()">Reset</button>
        </div>
      </div>

      <!-- ═══════════ 5 KPI CARDS (legacy style) ═══════════ -->
      <div class="sum-row">
        <div class="sum-card c-d">
          <div class="sum-label">Total Pending</div>
          <div class="sum-val vd">₹{{ totalPending() | number:'1.0-0' }}</div>
          <div class="sum-sub">{{ filteredRows().length }} Bills</div>
        </div>
        <div class="sum-card c-a">
          <div class="sum-label">0–30 Days</div>
          <div class="sum-val va">₹{{ bucket0_30() | number:'1.0-0' }}</div>
          <div class="sum-sub">{{ bucketCount('0-30 days') }} Bills</div>
        </div>
        <div class="sum-card c-w">
          <div class="sum-label">31–60 Days</div>
          <div class="sum-val vw">₹{{ bucket31_60() | number:'1.0-0' }}</div>
          <div class="sum-sub">{{ bucketCount('31-60 days') }} Bills</div>
        </div>
        <div class="sum-card c-d">
          <div class="sum-label">61–90 Days</div>
          <div class="sum-val vd">₹{{ bucket61_90() | number:'1.0-0' }}</div>
          <div class="sum-sub">{{ bucketCount('61-90 days') }} Bills</div>
        </div>
        <div class="sum-card c-d">
          <div class="sum-label">90+ Days 🚨</div>
          <div class="sum-val vd">₹{{ bucket90Plus() | number:'1.0-0' }}</div>
          <div class="sum-sub">{{ bucketCount('90+ days') }} Bills</div>
        </div>
      </div>

      <!-- ═══════════ PENDING BILLS TABLE ═══════════ -->
      <div class="t-card">
        <div class="t-toolbar">
          <div class="t-title">Pending Bills</div>
          <div class="t-count">{{ filteredRows().length }} records</div>
          <div class="t-search">
            <span>🔍</span>
            <input type="text" [(ngModel)]="search" placeholder="Search bill / party...">
          </div>
        </div>

        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (filteredRows().length === 0) {
          <div class="p-8 text-center text-gray-500">🎉 No pending bills!</div>
        } @else {
          <table class="o-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Bill No</th>
                <th>Bill Date</th>
                <th>Party Name</th>
                <th>City</th>
                <th class="text-right">Bill Amt</th>
                <th class="text-right">Paid</th>
                <th class="text-right">Pending</th>
                <th class="text-center">Days</th>
                <th class="text-center">Aging</th>
              </tr>
            </thead>
            <tbody>
              @for (r of filteredRows(); track r.billNo; let i = $index) {
                <tr>
                  <td class="td-soft">{{ i + 1 }}</td>
                  <td class="td-bold">{{ r.billNo }}</td>
                  <td class="td-mono">{{ r.billDate | inDate }}</td>
                  <td class="td-bold">{{ r.partyName }}</td>
                  <td>—</td>
                  <td class="td-mono text-right">₹{{ r.total | number:'1.0-0' }}</td>
                  <td class="td-ok text-right">₹{{ r.paid | number:'1.0-0' }}</td>
                  <td class="td-danger text-right">₹{{ r.pending | number:'1.0-0' }}</td>
                  <td class="text-center">
                    <div class="days-bar">
                      <div class="bar-track">
                        <div class="bar-fill"
                             [style.width.%]="barWidth(r.daysOverdue)"
                             [style.background]="barColor(r.daysOverdue)"></div>
                      </div>
                      <span class="td-mono"
                            [class.td-ok]="r.daysOverdue <= 30"
                            [class.td-warn]="r.daysOverdue > 30 && r.daysOverdue <= 60"
                            [class.td-danger]="r.daysOverdue > 60">{{ r.daysOverdue }}</span>
                    </div>
                  </td>
                  <td class="text-center">
                    <span class="badge"
                          [class.b-ok]="r.agingBucket === '0-30 days'"
                          [class.b-warn]="r.agingBucket === '31-60 days'"
                          [class.b-acc]="r.agingBucket === '61-90 days'"
                          [class.b-danger]="r.agingBucket === '90+ days'">
                      {{ r.agingBucket }}{{ r.agingBucket === '90+ days' ? ' 🚨' : '' }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="5">TOTAL</td>
                <td class="text-right">₹{{ sum('total') | number:'1.0-0' }}</td>
                <td class="text-right">₹{{ sum('paid') | number:'1.0-0' }}</td>
                <td class="td-danger text-right">₹{{ totalPending() | number:'1.0-0' }}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* REPORT HEADER CARD */
    .rpt-header-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      padding: 14px 20px; margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(92,26,139,0.06);
    }
    .rh-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .rh-icon {
      width: 38px; height: 38px; border-radius: 10px; background: #fde8e8;
      display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    .rh-title { font-size: 17px; font-weight: 800; color: #5c1a8b; }
    .rh-sub { font-size: 11px; color: #6b3fa0; margin-top: 2px; }
    .rh-actions { display: flex; gap: 8px; }

    .btn-print, .btn-export {
      padding: 7px 14px; border-radius: 8px; border: none; font-size: 12px; font-weight: 600;
      cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-family: inherit;
    }
    .btn-print { background: #f0e6ff; color: #5c1a8b; border: 1.5px solid #ddc8f5; }
    .btn-print:hover { background: #5c1a8b; color: #fff; }
    .btn-export { background: #f57c00; color: #fff; }
    .btn-export:hover { background: #e65100; }

    /* FILTERS */
    .filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .fl { display: flex; align-items: center; gap: 5px; }
    .fl label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .5px; color: #6b3fa0;
    }
    .fl input[type=date], .fl select {
      background: #faf5ff; border: 1.5px solid #ddc8f5; border-radius: 8px;
      padding: 5px 9px; font-size: 12px; color: #2d1040; font-family: inherit; outline: none;
    }
    .fl input[type=date]:focus, .fl select:focus {
      border-color: #5c1a8b; box-shadow: 0 0 0 3px rgba(92,26,139,.1);
    }
    .fl input[type=date] { width: 120px; }
    .sep { color: #b39cc0; font-size: 12px; }
    .btn-apply {
      background: #5c1a8b; color: #fff; border: none; padding: 5px 14px;
      border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
    }
    .btn-reset {
      background: #f0e6ff; color: #6b3fa0; border: 1px solid #ddc8f5;
      padding: 5px 10px; border-radius: 8px; font-size: 12px; cursor: pointer; font-family: inherit;
    }

    /* SUMMARY CARDS */
    .sum-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .sum-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      padding: 12px 16px; flex: 1; min-width: 150px; position: relative; overflow: hidden;
      box-shadow: 0 2px 8px rgba(92,26,139,.06);
    }
    .sum-card::after {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      border-radius: 12px 12px 0 0;
    }
    .sum-card.c-p::after { background: #5c1a8b; }
    .sum-card.c-a::after { background: #f57c00; }
    .sum-card.c-g::after { background: #16a34a; }
    .sum-card.c-d::after { background: #c62828; }
    .sum-card.c-w::after { background: #f9a825; }
    .sum-label {
      font-size: 9px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .9px; color: #b39cc0; margin-bottom: 5px;
    }
    .sum-val { font-size: 20px; font-weight: 800; color: #5c1a8b; font-family: monospace; }
    .sum-val.vg { color: #16a34a; }
    .sum-val.vd { color: #c62828; }
    .sum-val.va { color: #f57c00; }
    .sum-val.vw { color: #b45309; }
    .sum-sub { font-size: 10px; color: #6b3fa0; margin-top: 2px; }

    /* TABLE CARD */
    .t-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      overflow: hidden; box-shadow: 0 2px 10px rgba(92,26,139,.06);
    }
    .t-toolbar {
      display: flex; align-items: center; gap: 10px; padding: 11px 14px;
      border-bottom: 1.5px solid #ddc8f5; background: #f0e6ff;
    }
    .t-title { font-size: 13px; font-weight: 800; color: #5c1a8b; flex: 1; }
    .t-count { font-size: 11px; color: #6b3fa0; font-family: monospace; }
    .t-search {
      display: flex; align-items: center; gap: 6px; background: #fff;
      border: 1.5px solid #ddc8f5; border-radius: 20px; padding: 5px 12px;
    }
    .t-search input {
      background: none; border: none; outline: none; color: #2d1040;
      font-size: 12px; width: 150px; font-family: inherit;
    }
    .t-search input::placeholder { color: #b39cc0; }

    .o-table { width: 100%; border-collapse: collapse; }
    .o-table thead tr { background: #f0e6ff; }
    .o-table th {
      padding: 9px 11px; font-size: 9px; font-weight: 800; color: #6b3fa0;
      text-transform: uppercase; letter-spacing: .8px; text-align: left;
      border-bottom: 2px solid #ddc8f5; white-space: nowrap;
    }
    .o-table td {
      padding: 10px 11px; font-size: 12.5px; color: #2d1040;
      border-bottom: 1px solid rgba(221,200,245,.35); white-space: nowrap; vertical-align: middle;
    }
    .o-table tbody tr:last-child td { border-bottom: none; }
    .o-table tbody tr:hover td { background: #fdf8ff; }
    .o-table tfoot td {
      background: #f0e6ff; font-weight: 800; font-size: 12.5px;
      color: #5c1a8b; border-top: 2px solid #ddc8f5;
    }
    .td-bold { font-weight: 800; color: #5c1a8b; }
    .td-mono { font-family: monospace; font-weight: 700; }
    .td-ok { color: #16a34a; font-weight: 700; font-family: monospace; }
    .td-danger { color: #c62828; font-weight: 700; font-family: monospace; }
    .td-warn { color: #b45309; font-weight: 700; font-family: monospace; }
    .td-soft { color: #6b3fa0; font-family: monospace; }

    .badge {
      display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 10px;
      font-size: 10px; font-weight: 700; white-space: nowrap;
    }
    .b-ok { background: #dcfce7; color: #16a34a; }
    .b-danger { background: #fde8e8; color: #c62828; }
    .b-warn { background: #fff8e1; color: #b45309; }
    .b-acc { background: #fff3e0; color: #f57c00; }

    .days-bar { display: flex; align-items: center; gap: 7px; justify-content: center; }
    .bar-track {
      width: 70px; height: 6px; background: #f0e6ff;
      border-radius: 3px; overflow: hidden;
    }
    .bar-fill { height: 100%; border-radius: 3px; }

    @media (max-width: 640px) {
      .rpt-header-card { padding: 12px 14px; }
      .rh-top { flex-wrap: wrap; }
      .rh-actions { flex-wrap: wrap; width: 100%; }
      .filters { gap: 8px; }
      .fl { flex-wrap: wrap; }
      .fl input[type=date], .fl select { width: 100% !important; }
      .sum-row { gap: 8px; }
      .sum-card { min-width: 100% !important; width: 100% !important; }
      .t-toolbar { flex-wrap: wrap; }
      .t-search { width: 100%; }
      .t-search input { width: 100%; }
      .t-card { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .o-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
    }
  `]
})
export class OutstandingReportComponent {
  private svc = inject(ReportsService);
  features = inject(FeatureService);
  rows = signal<OutstandingRow[]>([]);
  loading = signal(true);

  fromDate = '2000-01-01';   // default: SAARE records (pehle pichla FY tha — purane bill gayab dikhte the)
  toDate = new Date().toISOString().split('T')[0];
  agingFilter = '';
  partyFilter = '';
  search = signal('');
  asOf = new Date().toISOString().split('T')[0];

  filteredRows = computed(() => {
    const all = this.rows();
    const q = this.search().toLowerCase().trim();
    if (!q) return all;
    return all.filter(r =>
      r.billNo.toLowerCase().includes(q) ||
      r.partyName.toLowerCase().includes(q)
    );
  });

  // Operate on filteredRows so KPI/buckets reconcile with the (searchable) table & footer
  totalPending = () => this.filteredRows().reduce((s, r) => s + r.pending, 0);
  bucket0_30  = () => this.filteredRows().filter(r => r.agingBucket === '0-30 days').reduce((s, r) => s + r.pending, 0);
  bucket31_60 = () => this.filteredRows().filter(r => r.agingBucket === '31-60 days').reduce((s, r) => s + r.pending, 0);
  bucket61_90 = () => this.filteredRows().filter(r => r.agingBucket === '61-90 days').reduce((s, r) => s + r.pending, 0);
  bucket90Plus = () => this.filteredRows().filter(r => r.agingBucket === '90+ days').reduce((s, r) => s + r.pending, 0);
  bucketCount(bucket: string) { return this.filteredRows().filter(r => r.agingBucket === bucket).length; }
  sum(field: 'total' | 'paid' | 'pending') {
    return this.filteredRows().reduce((s, r) => s + (Number((r as any)[field]) || 0), 0);
  }
  barWidth(days: number): number { return Math.min(100, Math.max(0, days)); }
  barColor(days: number): string {
    if (days <= 30) return '#16a34a';
    if (days <= 60) return '#f9a825';
    return '#c62828';
  }

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.svc.outstanding(this.asOf).subscribe({
      next: (r) => {
        let filtered = r;
        if (this.agingFilter) {
          const map: Record<string, string> = {
            '0-30':  '0-30 days',
            '31-60': '31-60 days',
            '61-90': '61-90 days',
            '90+':   '90+ days'
          };
          filtered = filtered.filter(x => x.agingBucket === map[this.agingFilter]);
        }
        this.rows.set(filtered);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
  reset() {
    this.fromDate = '2000-01-01';   // saare records
    this.toDate = new Date().toISOString().split('T')[0];
    this.agingFilter = '';
    this.partyFilter = '';
    this.search.set('');
    this.load();
  }
  printPage() { window.print(); }

  // ── WhatsApp share ──
  private fmt(d: string): string {
    if (!d) return '—';
    const [y, m, dd] = d.split('-');
    return `${dd}/${m}/${(y || '').slice(-2)}`;
  }
  waMessage(): string {
    const rows = this.filteredRows();
    if (!rows.length) return '';
    const upto = this.fmt(this.asOf);
    // Agar saare filtered bills ek hi party ke hain to header me uska naam
    const names = [...new Set(rows.map(r => r.partyName))];
    const partyLine = names.length === 1 ? names[0] : 'Sabhi parties';
    const lines: string[] = [`*Bill Pending Report* (${upto} tak)`, partyLine];
    const max = 15;
    rows.slice(0, max).forEach((r, i) => {
      // Har bill ke saath uska SUPPLIER naam bhi
      lines.push(`${i + 1}. ${r.billNo} · ${r.partyName} · ${this.fmt(r.billDate)} · ₹${Math.round(r.pending || 0).toLocaleString('en-IN')} · ${r.daysOverdue} din (${r.agingBucket})`);
    });
    if (rows.length > max) lines.push(`+${rows.length - max} aur...`);
    lines.push('------------------');
    const totPending = rows.reduce((s, r) => s + (r.pending || 0), 0);
    lines.push(`Total Pending: ₹${Math.round(totPending).toLocaleString('en-IN')}`);
    lines.push('- ' + (this.features.firmName() || 'Anjaninex'));
    return lines.join('\n');
  }
  waPhone(): string | null {
    // Is component me parties list load nahi hoti — number user khud daalega
    return null;
  }

  exportCsv() {
    const rows = this.filteredRows();
    const header = ['#', 'Bill No', 'Bill Date', 'Party', 'Total', 'Paid', 'Pending', 'Days', 'Aging'];
    const lines = [header.map(csvCell).join(',')];
    rows.forEach((r, i) => {
      lines.push([
        i + 1, r.billNo, r.billDate, r.partyName,
        r.total, r.paid, r.pending, r.daysOverdue, r.agingBucket
      ].map(csvCell).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Bill_Pending_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }
}

// =============================================================================
// PARTY-WISE AGING
// =============================================================================
@Component({
  selector: 'app-party-aging',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe],
  template: `
    <div class="max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">📅 Party-wise Aging Analysis</h2>
          <p class="text-sm text-[#6b3fa0]">Outstanding bucketed by days overdue</p>
        </div>
        <input [(ngModel)]="asOf" type="date" (change)="load()" class="input w-44">
      </div>

      ${subNav}

      <div class="card p-0 overflow-x-auto">
        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else {
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
              <tr>
                <th class="px-3 py-2 text-left">S.NO</th>
                <th class="px-3 py-2 text-left">Party</th>
                <th class="px-3 py-2 text-left">Phone</th>
                <th class="px-3 py-2 text-right">Bills</th>
                <th class="px-3 py-2 text-right">Total O/S</th>
                <th class="px-3 py-2 text-right text-yellow-700">0-30 d</th>
                <th class="px-3 py-2 text-right text-orange-700">31-60 d</th>
                <th class="px-3 py-2 text-right text-red-600">61-90 d</th>
                <th class="px-3 py-2 text-right text-red-700">90+ d</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.partyName; let i = $index) {
                <tr class="border-t hover:bg-[#faf5ff]">
                  <td class="px-3 py-2 font-mono">{{ i + 1 }}</td>
                  <td class="px-3 py-2 font-semibold">{{ r.partyName }}</td>
                  <td class="px-3 py-2 text-xs">{{ r.phone }}</td>
                  <td class="px-3 py-2 text-right">{{ r.billCount }}</td>
                  <td class="px-3 py-2 text-right font-mono font-bold">₹{{ r.totalOutstanding | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right font-mono text-yellow-700">
                    @if (r.bucket_0_30 > 0) { ₹{{ r.bucket_0_30 | number:'1.2-2' }} } @else { — }
                  </td>
                  <td class="px-3 py-2 text-right font-mono text-orange-700">
                    @if (r.bucket_31_60 > 0) { ₹{{ r.bucket_31_60 | number:'1.2-2' }} } @else { — }
                  </td>
                  <td class="px-3 py-2 text-right font-mono text-red-600">
                    @if (r.bucket_61_90 > 0) { ₹{{ r.bucket_61_90 | number:'1.2-2' }} } @else { — }
                  </td>
                  <td class="px-3 py-2 text-right font-mono text-red-700">
                    @if (r.bucket_90Plus > 0) { ₹{{ r.bucket_90Plus | number:'1.2-2' }} } @else { — }
                  </td>
                </tr>
              }
            </tbody>
            <tfoot class="bg-gray-100 font-bold">
              <tr>
                <td colspan="4" class="px-3 py-2 text-right">TOTALS:</td>
                <td class="px-3 py-2 text-right font-mono">₹{{ totalSum() | number:'1.2-2' }}</td>
                <td class="px-3 py-2 text-right font-mono">₹{{ bucketSum('bucket_0_30') | number:'1.2-2' }}</td>
                <td class="px-3 py-2 text-right font-mono">₹{{ bucketSum('bucket_31_60') | number:'1.2-2' }}</td>
                <td class="px-3 py-2 text-right font-mono">₹{{ bucketSum('bucket_61_90') | number:'1.2-2' }}</td>
                <td class="px-3 py-2 text-right font-mono">₹{{ bucketSum('bucket_90Plus') | number:'1.2-2' }}</td>
              </tr>
            </tfoot>
          </table>
        }
      </div>
    </div>
  `
})
export class PartyAgingComponent {
  private svc = inject(ReportsService);
  rows = signal<PartyOutstanding[]>([]);
  loading = signal(true);
  asOf = new Date().toISOString().split('T')[0];

  totalSum = () => this.rows().reduce((s, r) => s + r.totalOutstanding, 0);
  bucketSum(field: 'bucket_0_30' | 'bucket_31_60' | 'bucket_61_90' | 'bucket_90Plus') {
    return this.rows().reduce((s, r) => s + (r[field] || 0), 0);
  }

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.svc.partyOutstanding(this.asOf).subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}

// =============================================================================
// TOP PARTIES
// =============================================================================
@Component({
  selector: 'app-top-parties',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe],
  template: `
    <div class="max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🏆 Top Customers</h2>
          <p class="text-sm text-[#6b3fa0]">Ranked by total sales in period</p>
        </div>
        <div class="flex gap-2 items-center">
          <input [(ngModel)]="fromDate" type="date" (change)="load()" class="input w-40">
          <span>to</span>
          <input [(ngModel)]="toDate" type="date" (change)="load()" class="input w-40">
        </div>
      </div>

      ${subNav}

      <div class="card p-0 overflow-hidden">
        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (rows().length === 0) {
          <div class="p-8 text-center text-gray-500">No sales in this period</div>
        } @else {
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
              <tr>
                <th class="px-3 py-2 text-center w-12">Rank</th>
                <th class="px-3 py-2 text-left">Party</th>
                <th class="px-3 py-2 text-right">Bills</th>
                <th class="px-3 py-2 text-right">Total Sales</th>
                <th class="px-3 py-2 text-right">Paid</th>
                <th class="px-3 py-2 text-right">Outstanding</th>
                <th class="px-3 py-2">Share</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.partyId; let i = $index) {
                <tr class="border-t hover:bg-[#faf5ff]">
                  <td class="px-3 py-2 text-center font-bold"
                      [class.text-yellow-500]="i === 0"
                      [class.text-gray-400]="i === 1"
                      [class.text-orange-600]="i === 2">
                    @if (i === 0) { 🥇 }
                    @else if (i === 1) { 🥈 }
                    @else if (i === 2) { 🥉 }
                    @else { #{{ i + 1 }} }
                  </td>
                  <td class="px-3 py-2 font-semibold">{{ r.partyName }}</td>
                  <td class="px-3 py-2 text-right">{{ r.billCount }}</td>
                  <td class="px-3 py-2 text-right font-mono font-bold">₹{{ r.totalSales | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right font-mono text-green-600">₹{{ r.totalPaid | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right font-mono"
                      [class.text-red-600]="r.outstanding > 0">
                    ₹{{ r.outstanding | number:'1.2-2' }}
                  </td>
                  <td class="px-3 py-2">
                    <div class="h-2 bg-gray-200 rounded overflow-hidden w-32">
                      <div class="h-full bg-[#5c1a8b]" [style.width.%]="(r.totalSales / topSale()) * 100"></div>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `
})
export class TopPartiesComponent {
  private svc = inject(ReportsService);
  rows = signal<PartySales[]>([]);
  loading = signal(true);
  fromDate = '2000-01-01';   // saare records
  toDate = new Date().toISOString().split('T')[0];

  topSale = () => Math.max(1, ...this.rows().map(r => r.totalSales));

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.svc.topParties(this.fromDate, this.toDate, 20).subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}

// =============================================================================
// TOP ITEMS
// =============================================================================
@Component({
  selector: 'app-top-items',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe],
  template: `
    <div class="max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">📦 Top Selling Items</h2>
          <p class="text-sm text-[#6b3fa0]">Best sellers by revenue</p>
        </div>
        <div class="flex gap-2 items-center">
          <input [(ngModel)]="fromDate" type="date" (change)="load()" class="input w-40">
          <span>to</span>
          <input [(ngModel)]="toDate" type="date" (change)="load()" class="input w-40">
        </div>
      </div>

      ${subNav}

      <div class="card p-0 overflow-hidden">
        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (rows().length === 0) {
          <div class="p-8 text-center text-gray-500">No sales</div>
        } @else {
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
              <tr>
                <th class="px-3 py-2 text-center w-12">Rank</th>
                <th class="px-3 py-2 text-left">Item</th>
                <th class="px-3 py-2 text-left">HSN</th>
                <th class="px-3 py-2 text-right">Qty Sold</th>
                <th class="px-3 py-2 text-right">Avg Rate</th>
                <th class="px-3 py-2 text-right">Total Revenue</th>
                <th class="px-3 py-2 text-right">Bills</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.itemName; let i = $index) {
                <tr class="border-t hover:bg-[#faf5ff]">
                  <td class="px-3 py-2 text-center font-bold">
                    @if (i === 0) { 🥇 } @else if (i === 1) { 🥈 } @else if (i === 2) { 🥉 } @else { #{{ i + 1 }} }
                  </td>
                  <td class="px-3 py-2 font-semibold">{{ r.itemName }}</td>
                  <td class="px-3 py-2 font-mono text-xs">{{ r.hsnSac }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ r.totalQty | number:'1.0-3' }} {{ r.unit }}</td>
                  <td class="px-3 py-2 text-right font-mono">₹{{ r.avgRate | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right font-mono font-bold">₹{{ r.totalRevenue | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right">{{ r.billCount }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `
})
export class TopItemsComponent {
  private svc = inject(ReportsService);
  rows = signal<ItemSales[]>([]);
  loading = signal(true);
  fromDate = '2000-01-01';   // saare records
  toDate = new Date().toISOString().split('T')[0];

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.svc.topItems(this.fromDate, this.toDate, 30).subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}

// =============================================================================
// GST BILL REPORT — legacy-styled per-bill register with GSTIN
// =============================================================================
@Component({
  selector: 'app-gst-summary',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, InDatePipe],
  template: `
    <div class="max-w-7xl mx-auto">
      ${subNav}

      <!-- HEADER CARD -->
      <div class="rpt-header-card">
        <div class="rh-top">
          <div class="rh-icon">🧾</div>
          <div class="flex-1">
            <div class="rh-title">GST Bill Report</div>
            <div class="rh-sub">GST bills — Paid / Unpaid with IGST / CGST / SGST breakup</div>
          </div>
          <div class="rh-actions">
            <button class="btn-print" (click)="printPage()">🖨️ Print</button>
            <button class="btn-export" (click)="exportCsv()">⬇️ CSV Export</button>
          </div>
        </div>

        <div class="filters">
          <div class="fl">
            <label>From</label>
            <input type="date" [(ngModel)]="fromDate" (change)="load()">
          </div>
          <span class="sep">–</span>
          <div class="fl">
            <label>To</label>
            <input type="date" [(ngModel)]="toDate" (change)="load()">
          </div>
          <div class="fl">
            <label>Status</label>
            <select [(ngModel)]="statusFilter" (change)="load()">
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="pending">Unpaid</option>
            </select>
          </div>
          <div class="fl">
            <label>GST Type</label>
            <select [(ngModel)]="gstTypeFilter">
              <option value="">All</option>
              <option value="igst">IGST</option>
              <option value="cgst-sgst">CGST+SGST</option>
            </select>
          </div>
          <button class="btn-apply" (click)="load()">Apply</button>
          <button class="btn-reset" (click)="reset()">Reset</button>
        </div>
      </div>

      <!-- 5 KPI CARDS -->
      <div class="sum-row">
        <div class="sum-card c-p">
          <div class="sum-label">Total Bills</div>
          <div class="sum-val">{{ filteredRows().length }}</div>
          <div class="sum-sub">Bills in period</div>
        </div>
        <div class="sum-card c-g">
          <div class="sum-label">GST Paid Bills</div>
          <div class="sum-val vg">{{ paidCount() }}</div>
          <div class="sum-sub">₹{{ paidGst() | number:'1.0-0' }} GST</div>
        </div>
        <div class="sum-card c-d">
          <div class="sum-label">GST Unpaid Bills</div>
          <div class="sum-val vd">{{ unpaidCount() }}</div>
          <div class="sum-sub">₹{{ unpaidGst() | number:'1.0-0' }} GST</div>
        </div>
        <div class="sum-card c-w">
          <div class="sum-label">Partial Bills</div>
          <div class="sum-val vw">{{ partialCount() }}</div>
          <div class="sum-sub">₹{{ partialGst() | number:'1.0-0' }} GST</div>
        </div>
        <div class="sum-card c-a">
          <div class="sum-label">Total GST</div>
          <div class="sum-val va">₹{{ totalGst() | number:'1.0-0' }}</div>
          <div class="sum-sub">{{ avgRate() | number:'1.1-1' }}% avg rate</div>
        </div>
      </div>

      <!-- TABLE -->
      <div class="t-card">
        <div class="t-toolbar">
          <div class="t-title">GST Bill Register</div>
          <div class="t-count">{{ filteredRows().length }} bills</div>
          <div class="t-search">
            <span>🔍</span>
            <input type="text" [(ngModel)]="search" placeholder="Search GSTIN / Bill...">
          </div>
        </div>

        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (filteredRows().length === 0) {
          <div class="p-8 text-center text-gray-500">No GST bills in this period</div>
        } @else {
          <table class="g-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Bill No</th>
                <th>Date</th>
                <th>Party</th>
                <th>GSTIN</th>
                <th class="text-right">Taxable Amt</th>
                <th class="text-right">IGST</th>
                <th class="text-right">CGST</th>
                <th class="text-right">SGST</th>
                <th class="text-right">Total GST</th>
                <th class="text-right">Bill Total</th>
                <th class="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              @for (r of filteredRows(); track r.billNo; let i = $index) {
                <tr>
                  <td class="td-soft">{{ i + 1 }}</td>
                  <td class="td-bold">{{ r.billNo }}</td>
                  <td class="td-mono text-xs">{{ r.billDate | inDate }}</td>
                  <td class="td-bold">{{ r.partyName }}</td>
                  <td class="td-mono text-xs">{{ partyGstin(r) }}</td>
                  <td class="td-mono text-right">₹{{ r.subtotal | number:'1.0-0' }}</td>
                  <td class="td-mono text-right" [class.td-acc]="r.igst > 0">{{ r.igst > 0 ? '₹' + (r.igst | number:'1.0-0') : '—' }}</td>
                  <td class="td-mono text-right" [class.td-ok]="r.cgst > 0">{{ r.cgst > 0 ? '₹' + (r.cgst | number:'1.0-0') : '—' }}</td>
                  <td class="td-mono text-right" [class.td-ok]="r.sgst > 0">{{ r.sgst > 0 ? '₹' + (r.sgst | number:'1.0-0') : '—' }}</td>
                  <td class="td-mono text-right font-bold">₹{{ rowGst(r) | number:'1.0-0' }}</td>
                  <td class="td-mono text-right font-bold text-[#5c1a8b]">₹{{ r.total | number:'1.0-0' }}</td>
                  <td class="text-center">
                    <span class="badge"
                          [class.b-ok]="r.status === 'paid'"
                          [class.b-danger]="r.status === 'pending'"
                          [class.b-warn]="r.status === 'partial'">
                      {{ r.status === 'paid' ? 'Paid ✓' : r.status === 'pending' ? 'Unpaid' : 'Partial' }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="5" class="text-right">TOTAL</td>
                <td class="td-mono text-right">₹{{ sumField('subtotal') | number:'1.0-0' }}</td>
                <td class="td-mono text-right">₹{{ sumField('igst') | number:'1.0-0' }}</td>
                <td class="td-mono text-right">₹{{ sumField('cgst') | number:'1.0-0' }}</td>
                <td class="td-mono text-right">₹{{ sumField('sgst') | number:'1.0-0' }}</td>
                <td class="td-mono text-right">₹{{ totalGst() | number:'1.0-0' }}</td>
                <td class="td-mono text-right">₹{{ sumField('total') | number:'1.0-0' }}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .rpt-header-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      padding: 14px 20px; margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(92,26,139,0.06);
    }
    .rh-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .rh-icon {
      width: 38px; height: 38px; border-radius: 10px; background: #f0e6ff;
      display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    .rh-title { font-size: 17px; font-weight: 800; color: #5c1a8b; }
    .rh-sub { font-size: 11px; color: #6b3fa0; margin-top: 2px; }
    .rh-actions { display: flex; gap: 8px; }
    .btn-print, .btn-export {
      padding: 7px 14px; border-radius: 8px; border: none; font-size: 12px; font-weight: 600;
      cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-family: inherit;
    }
    .btn-print { background: #f0e6ff; color: #5c1a8b; border: 1.5px solid #ddc8f5; }
    .btn-print:hover { background: #5c1a8b; color: #fff; }
    .btn-export { background: #f57c00; color: #fff; }
    .btn-export:hover { background: #e65100; }

    .filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .fl { display: flex; align-items: center; gap: 5px; }
    .fl label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .5px; color: #6b3fa0;
    }
    .fl input[type=date], .fl select {
      background: #faf5ff; border: 1.5px solid #ddc8f5; border-radius: 8px;
      padding: 5px 9px; font-size: 12px; color: #2d1040; font-family: inherit; outline: none;
    }
    .fl input[type=date] { width: 120px; }
    .sep { color: #b39cc0; font-size: 12px; }
    .btn-apply {
      background: #5c1a8b; color: #fff; border: none; padding: 5px 14px;
      border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
    }
    .btn-reset {
      background: #f0e6ff; color: #6b3fa0; border: 1px solid #ddc8f5;
      padding: 5px 10px; border-radius: 8px; font-size: 12px; cursor: pointer;
    }

    .sum-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .sum-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      padding: 12px 16px; flex: 1; min-width: 150px; position: relative; overflow: hidden;
      box-shadow: 0 2px 8px rgba(92,26,139,.06);
    }
    .sum-card::after {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      border-radius: 12px 12px 0 0;
    }
    .sum-card.c-p::after { background: #5c1a8b; }
    .sum-card.c-a::after { background: #f57c00; }
    .sum-card.c-g::after { background: #16a34a; }
    .sum-card.c-d::after { background: #c62828; }
    .sum-card.c-w::after { background: #f9a825; }
    .sum-label {
      font-size: 9px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .9px; color: #b39cc0; margin-bottom: 5px;
    }
    .sum-val { font-size: 20px; font-weight: 800; color: #5c1a8b; font-family: monospace; }
    .sum-val.vg { color: #16a34a; }
    .sum-val.vd { color: #c62828; }
    .sum-val.va { color: #f57c00; }
    .sum-val.vw { color: #b45309; }
    .sum-sub { font-size: 10px; color: #6b3fa0; margin-top: 2px; }

    .t-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      overflow: hidden; box-shadow: 0 2px 10px rgba(92,26,139,.06);
    }
    .t-toolbar {
      display: flex; align-items: center; gap: 10px; padding: 11px 14px;
      border-bottom: 1.5px solid #ddc8f5; background: #f0e6ff;
    }
    .t-title { font-size: 13px; font-weight: 800; color: #5c1a8b; flex: 1; }
    .t-count { font-size: 11px; color: #6b3fa0; font-family: monospace; }
    .t-search {
      display: flex; align-items: center; gap: 6px; background: #fff;
      border: 1.5px solid #ddc8f5; border-radius: 20px; padding: 5px 12px;
    }
    .t-search input {
      background: none; border: none; outline: none; color: #2d1040;
      font-size: 12px; width: 150px; font-family: inherit;
    }

    .g-table { width: 100%; border-collapse: collapse; }
    .g-table thead tr { background: #f0e6ff; }
    .g-table th {
      padding: 9px 11px; font-size: 9px; font-weight: 800; color: #6b3fa0;
      text-transform: uppercase; letter-spacing: .8px; text-align: left;
      border-bottom: 2px solid #ddc8f5; white-space: nowrap;
    }
    .g-table td {
      padding: 10px 11px; font-size: 12.5px; color: #2d1040;
      border-bottom: 1px solid rgba(221,200,245,.35); white-space: nowrap;
    }
    .g-table tbody tr:hover td { background: #fdf8ff; }
    .g-table tfoot td {
      background: #f0e6ff; font-weight: 800; font-size: 12.5px;
      color: #5c1a8b; border-top: 2px solid #ddc8f5;
    }
    .td-bold { font-weight: 800; color: #5c1a8b; }
    .td-mono { font-family: monospace; font-weight: 700; }
    .td-ok { color: #16a34a; font-weight: 700; font-family: monospace; }
    .td-danger { color: #c62828; font-weight: 700; font-family: monospace; }
    .td-acc { color: #f57c00; font-weight: 700; font-family: monospace; }
    .td-soft { color: #6b3fa0; font-family: monospace; }

    .badge {
      display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 10px;
      font-size: 10px; font-weight: 700; white-space: nowrap;
    }
    .b-ok { background: #dcfce7; color: #16a34a; }
    .b-danger { background: #fde8e8; color: #c62828; }
    .b-warn { background: #fff8e1; color: #b45309; }

    @media (max-width: 640px) {
      .rpt-header-card { padding: 12px 14px; }
      .rh-top { flex-wrap: wrap; }
      .rh-actions { flex-wrap: wrap; width: 100%; }
      .filters { gap: 8px; }
      .fl { flex-wrap: wrap; }
      .fl input[type=date], .fl select { width: 100% !important; }
      .sum-row { gap: 8px; }
      .sum-card { min-width: 100% !important; width: 100% !important; }
      .t-toolbar { flex-wrap: wrap; }
      .t-search { width: 100%; }
      .t-search input { width: 100%; }
      .t-card { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .g-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
    }
  `]
})
export class GstSummaryComponent {
  private svc = inject(ReportsService);
  private trading = inject(TradingService);
  rows = signal<SalesRegisterRow[]>([]);
  parties = signal<Party[]>([]);
  loading = signal(true);

  fromDate = '2000-01-01';   // default: SAARE records (pehle pichla FY tha — purane bill gayab dikhte the)
  toDate = new Date().toISOString().split('T')[0];
  statusFilter = '';
  gstTypeFilter = '';
  search = '';

  // GSTIN lookup from party master by partyId (fallback: try matching by partyName)
  partyGstin(r: any): string {
    // SalesRegisterRow may not include partyId; we attempt a name match
    const p = this.parties().find(x => x.displayName === r.partyName);
    return p?.gst || '—';
  }
  rowGst(r: SalesRegisterRow): number {
    return (r.cgst || 0) + (r.sgst || 0) + (r.igst || 0);
  }

  filteredRows(): SalesRegisterRow[] {
    const all = this.rows();
    const q = this.search.toLowerCase().trim();
    return all.filter(r => {
      if (this.gstTypeFilter === 'igst' && (r.igst || 0) <= 0) return false;
      if (this.gstTypeFilter === 'cgst-sgst' && ((r.cgst || 0) + (r.sgst || 0)) <= 0) return false;
      if (q) {
        const gstin = this.partyGstin(r).toLowerCase();
        const hay = (r.billNo + ' ' + r.partyName + ' ' + gstin).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  sumField(field: keyof SalesRegisterRow): number {
    return this.filteredRows().reduce((s, r) => s + (Number((r as any)[field]) || 0), 0);
  }
  totalGst = () => this.filteredRows().reduce((s, r) => s + this.rowGst(r), 0);
  paidCount = () => this.filteredRows().filter(r => r.status === 'paid').length;
  unpaidCount = () => this.filteredRows().filter(r => r.status === 'pending').length;
  partialCount = () => this.filteredRows().filter(r => r.status === 'partial').length;
  paidGst = () => this.filteredRows().filter(r => r.status === 'paid').reduce((s, r) => s + this.rowGst(r), 0);
  unpaidGst = () => this.filteredRows().filter(r => r.status === 'pending').reduce((s, r) => s + this.rowGst(r), 0);
  partialGst = () => this.filteredRows().filter(r => r.status === 'partial').reduce((s, r) => s + this.rowGst(r), 0);
  avgRate = () => {
    const taxable = this.sumField('subtotal');
    return taxable > 0 ? (this.totalGst() / taxable) * 100 : 0;
  };

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    // Load parties (for GSTIN lookup)
    this.trading.listParties().subscribe({ next: (p) => this.parties.set(p) });
    this.svc.salesRegister(this.fromDate, this.toDate, this.statusFilter || undefined).subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
  reset() {
    this.fromDate = '2000-01-01';   // saare records
    this.toDate = new Date().toISOString().split('T')[0];
    this.statusFilter = '';
    this.gstTypeFilter = '';
    this.search = '';
    this.load();
  }
  printPage() { window.print(); }
  exportCsv() {
    const rows = this.filteredRows();
    const header = ['#','Bill No','Date','Party','GSTIN','Taxable','IGST','CGST','SGST','Total GST','Bill Total','Status'];
    const lines = [header.map(csvCell).join(',')];
    rows.forEach((r, i) => {
      lines.push([
        i + 1, r.billNo, r.billDate, r.partyName,
        this.partyGstin(r),
        r.subtotal, r.igst, r.cgst, r.sgst, this.rowGst(r), r.total, r.status
      ].map(csvCell).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GST_Bill_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }
}

// =============================================================================
// PAYMENT MODE
// =============================================================================
@Component({
  selector: 'app-payment-mode',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe],
  template: `
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">💳 Payment Mode Breakdown</h2>
          <p class="text-sm text-[#6b3fa0]">How customers prefer to pay</p>
        </div>
        <div class="flex gap-2 items-center">
          <input [(ngModel)]="fromDate" type="date" (change)="load()" class="input w-40">
          <span>to</span>
          <input [(ngModel)]="toDate" type="date" (change)="load()" class="input w-40">
        </div>
      </div>

      ${subNav}

      <div class="card">
        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (rows().length === 0) {
          <div class="p-8 text-center text-gray-500">No receipts in period</div>
        } @else {
          <div class="space-y-3">
            @for (r of rows(); track r.mode) {
              <div>
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xl">{{ modeIcon(r.mode) }}</span>
                    <span class="font-semibold uppercase">{{ r.mode }}</span>
                    <span class="text-xs text-gray-500">({{ r.count }} transactions)</span>
                  </div>
                  <div class="font-mono font-bold">₹{{ r.amount | number:'1.2-2' }}</div>
                </div>
                <div class="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div class="h-full" [style.background]="modeColor(r.mode)"
                       [style.width.%]="(r.amount / total()) * 100"></div>
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{ ((r.amount / total()) * 100).toFixed(1) }}% of total receipts
                </div>
              </div>
            }
          </div>

          <div class="border-t mt-4 pt-3 flex justify-between font-bold text-lg">
            <span>Total Receipts:</span>
            <span class="font-mono text-[#5c1a8b]">₹{{ total() | number:'1.2-2' }}</span>
          </div>
        }
      </div>
    </div>
  `
})
export class PaymentModeComponent {
  private svc = inject(ReportsService);
  rows = signal<PaymentMode[]>([]);
  loading = signal(true);
  fromDate = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
  toDate = new Date().toISOString().split('T')[0];

  total = () => this.rows().reduce((s, r) => s + r.amount, 0);

  modeIcon(m: string): string {
    return { cash: '💵', cheque: '📄', neft: '🏦', rtgs: '🏦', upi: '📱', card: '💳' }[m] ?? '💰';
  }
  modeColor(m: string): string {
    return {
      cash: '#22c55e', cheque: '#3b82f6', neft: '#5c1a8b',
      rtgs: '#9333ea', upi: '#f59e0b', card: '#ef4444'
    }[m] ?? '#6b7280';
  }

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.svc.paymentMode(this.fromDate, this.toDate).subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}

// =============================================================================
// GR (GOODS RETURN) REPORT — legacy-styled header + 5 KPI cards
// =============================================================================
@Component({
  selector: 'app-gr-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, InDatePipe],
  template: `
    <div class="max-w-7xl mx-auto">
      ${subNav}

      <!-- ═══════════ REPORT HEADER CARD ═══════════ -->
      <div class="rpt-header-card">
        <div class="rh-top">
          <div class="rh-icon">↩️</div>
          <div class="flex-1">
            <div class="rh-title">GR — Goods Return Report</div>
            <div class="rh-sub">Returns by reason, party & amount</div>
          </div>
          <div class="rh-actions">
            <button class="btn-print" (click)="printPage()">🖨️ Print</button>
            <button class="btn-export" (click)="exportCsv()">⬇️ CSV Export</button>
          </div>
        </div>

        <div class="filters">
          <div class="fl">
            <label>From</label>
            <input type="date" [(ngModel)]="fromDate" (change)="load()">
          </div>
          <span class="sep">–</span>
          <div class="fl">
            <label>To</label>
            <input type="date" [(ngModel)]="toDate" (change)="load()">
          </div>
          <div class="fl">
            <label>Reason</label>
            <select [(ngModel)]="reasonFilter">
              <option value="">All</option>
              <option value="Quality Issue">Quality Issue</option>
              <option value="Wrong Item">Wrong Item</option>
              <option value="Excess Qty">Excess Qty</option>
              <option value="Damage">Damage</option>
            </select>
          </div>
          <div class="fl">
            <label>Status</label>
            <select [(ngModel)]="statusFilter">
              <option value="">All</option>
              <option value="approved">Approved / Adjusted</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <button class="btn-apply" (click)="load()">Apply</button>
          <button class="btn-reset" (click)="reset()">Reset</button>
        </div>
      </div>

      <!-- ═══════════ 5 KPI CARDS ═══════════ -->
      <div class="sum-row">
        <div class="sum-card c-p">
          <div class="sum-label">Total GR</div>
          <div class="sum-val">{{ filteredRows().length }}</div>
          <div class="sum-sub">GR records</div>
        </div>
        <div class="sum-card c-d">
          <div class="sum-label">GR Amount</div>
          <div class="sum-val vd">₹{{ totalAmount() | number:'1.0-0' }}</div>
          <div class="sum-sub">Returned value</div>
        </div>
        <div class="sum-card c-g">
          <div class="sum-label">Adjusted</div>
          <div class="sum-val vg">{{ adjustedCount() }}</div>
          <div class="sum-sub">Approved GRs</div>
        </div>
        <div class="sum-card c-w">
          <div class="sum-label">Pending</div>
          <div class="sum-val vw">{{ pendingCount() }}</div>
          <div class="sum-sub">Awaiting approval</div>
        </div>
        <div class="sum-card c-a">
          <div class="sum-label">Top Reason</div>
          <div class="sum-val va" style="font-size:14px">{{ topReason() }}</div>
          <div class="sum-sub">{{ topReasonCount() }} cases</div>
        </div>
      </div>

      <!-- ═══════════ TABLE ═══════════ -->
      <div class="t-card">
        <div class="t-toolbar">
          <div class="t-title">Goods Return Details</div>
          <div class="t-count">{{ filteredRows().length }} GR records</div>
          <div class="t-search">
            <span>🔍</span>
            <input type="text" [(ngModel)]="search" placeholder="Search GR / Party...">
          </div>
        </div>

        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (filteredRows().length === 0) {
          <div class="p-8 text-center text-gray-500">🎉 No goods returns in this period</div>
        } @else {
          <table class="g-table">
            <thead>
              <tr>
                <th>#</th>
                <th>GR No</th>
                <th>GR Date</th>
                <th>Bill No</th>
                <th>Supplier</th>
                <th>Buyer</th>
                <th class="text-right">GR Amount</th>
                <th class="text-center">Reason</th>
                <th class="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              @for (r of filteredRows(); track r.id; let i = $index) {
                <tr>
                  <td class="td-soft">{{ i + 1 }}</td>
                  <td class="td-bold">{{ r.grNo }}</td>
                  <td class="td-mono">{{ r.grDate | inDate }}</td>
                  <td class="td-mono text-xs font-bold text-[#1B2E5C]">{{ r.originalBillNo || '—' }}</td>
                  <td class="font-semibold">{{ r.supplierName }}</td>
                  <td class="font-semibold">{{ r.buyerName || '—' }}</td>
                  <td class="td-mono text-right">₹{{ r.totalReturnAmount | number:'1.0-0' }}</td>
                  <td class="text-center">
                    <span class="badge b-acc">{{ rowReason(r) }}</span>
                  </td>
                  <td class="text-center">
                    <span class="badge"
                          [class.b-ok]="r.status === 'approved'"
                          [class.b-warn]="r.status === 'pending'"
                          [class.b-danger]="r.status === 'rejected'">
                      {{ r.status === 'approved' ? 'Adjusted ✓' : r.status }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="6" class="text-right">TOTAL GR AMOUNT</td>
                <td class="td-danger text-right">₹{{ totalAmount() | number:'1.0-0' }}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .rpt-header-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      padding: 14px 20px; margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(92,26,139,0.06);
    }
    .rh-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .rh-icon {
      width: 38px; height: 38px; border-radius: 10px; background: #f0e6ff;
      display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    .rh-title { font-size: 17px; font-weight: 800; color: #5c1a8b; }
    .rh-sub { font-size: 11px; color: #6b3fa0; margin-top: 2px; }
    .rh-actions { display: flex; gap: 8px; }
    .btn-print, .btn-export {
      padding: 7px 14px; border-radius: 8px; border: none; font-size: 12px; font-weight: 600;
      cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-family: inherit;
    }
    .btn-print { background: #f0e6ff; color: #5c1a8b; border: 1.5px solid #ddc8f5; }
    .btn-print:hover { background: #5c1a8b; color: #fff; }
    .btn-export { background: #f57c00; color: #fff; }
    .btn-export:hover { background: #e65100; }

    .filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .fl { display: flex; align-items: center; gap: 5px; }
    .fl label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .5px; color: #6b3fa0;
    }
    .fl input[type=date], .fl select {
      background: #faf5ff; border: 1.5px solid #ddc8f5; border-radius: 8px;
      padding: 5px 9px; font-size: 12px; color: #2d1040; font-family: inherit; outline: none;
    }
    .fl input[type=date] { width: 120px; }
    .sep { color: #b39cc0; font-size: 12px; }
    .btn-apply {
      background: #5c1a8b; color: #fff; border: none; padding: 5px 14px;
      border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
    }
    .btn-reset {
      background: #f0e6ff; color: #6b3fa0; border: 1px solid #ddc8f5;
      padding: 5px 10px; border-radius: 8px; font-size: 12px; cursor: pointer;
    }

    .sum-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .sum-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      padding: 12px 16px; flex: 1; min-width: 150px; position: relative; overflow: hidden;
      box-shadow: 0 2px 8px rgba(92,26,139,.06);
    }
    .sum-card::after {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      border-radius: 12px 12px 0 0;
    }
    .sum-card.c-p::after { background: #5c1a8b; }
    .sum-card.c-a::after { background: #f57c00; }
    .sum-card.c-g::after { background: #16a34a; }
    .sum-card.c-d::after { background: #c62828; }
    .sum-card.c-w::after { background: #f9a825; }
    .sum-label {
      font-size: 9px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .9px; color: #b39cc0; margin-bottom: 5px;
    }
    .sum-val { font-size: 20px; font-weight: 800; color: #5c1a8b; font-family: monospace; }
    .sum-val.vg { color: #16a34a; }
    .sum-val.vd { color: #c62828; }
    .sum-val.va { color: #f57c00; }
    .sum-val.vw { color: #b45309; }
    .sum-sub { font-size: 10px; color: #6b3fa0; margin-top: 2px; }

    .t-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      overflow: hidden; box-shadow: 0 2px 10px rgba(92,26,139,.06);
    }
    .t-toolbar {
      display: flex; align-items: center; gap: 10px; padding: 11px 14px;
      border-bottom: 1.5px solid #ddc8f5; background: #f0e6ff;
    }
    .t-title { font-size: 13px; font-weight: 800; color: #5c1a8b; flex: 1; }
    .t-count { font-size: 11px; color: #6b3fa0; font-family: monospace; }
    .t-search {
      display: flex; align-items: center; gap: 6px; background: #fff;
      border: 1.5px solid #ddc8f5; border-radius: 20px; padding: 5px 12px;
    }
    .t-search input {
      background: none; border: none; outline: none; color: #2d1040;
      font-size: 12px; width: 150px; font-family: inherit;
    }

    .g-table { width: 100%; border-collapse: collapse; }
    .g-table thead tr { background: #f0e6ff; }
    .g-table th {
      padding: 9px 11px; font-size: 9px; font-weight: 800; color: #6b3fa0;
      text-transform: uppercase; letter-spacing: .8px; text-align: left;
      border-bottom: 2px solid #ddc8f5; white-space: nowrap;
    }
    .g-table td {
      padding: 10px 11px; font-size: 12.5px; color: #2d1040;
      border-bottom: 1px solid rgba(221,200,245,.35); white-space: nowrap;
    }
    .g-table tbody tr:hover td { background: #fdf8ff; }
    .g-table tfoot td {
      background: #f0e6ff; font-weight: 800; font-size: 12.5px;
      color: #5c1a8b; border-top: 2px solid #ddc8f5;
    }
    .td-bold { font-weight: 800; color: #5c1a8b; }
    .td-mono { font-family: monospace; font-weight: 700; }
    .td-danger { color: #c62828; font-weight: 700; font-family: monospace; }
    .td-soft { color: #6b3fa0; font-family: monospace; }

    .badge {
      display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 10px;
      font-size: 10px; font-weight: 700; white-space: nowrap;
    }
    .b-ok { background: #dcfce7; color: #16a34a; }
    .b-danger { background: #fde8e8; color: #c62828; }
    .b-warn { background: #fff8e1; color: #b45309; }
    .b-acc { background: #fff3e0; color: #f57c00; }

    @media (max-width: 640px) {
      .rpt-header-card { padding: 12px 14px; }
      .rh-top { flex-wrap: wrap; }
      .rh-actions { flex-wrap: wrap; width: 100%; }
      .filters { gap: 8px; }
      .fl { flex-wrap: wrap; }
      .fl input[type=date], .fl select { width: 100% !important; }
      .sum-row { gap: 8px; }
      .sum-card { min-width: 100% !important; width: 100% !important; }
      .t-toolbar { flex-wrap: wrap; }
      .t-search { width: 100%; }
      .t-search input { width: 100%; }
      .t-card { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .g-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
    }
  `]
})
export class GrReportComponent {
  private svc = inject(TradingService);
  rows = signal<GoodsReturnListItem[]>([]);
  loading = signal(true);

  fromDate = '2000-01-01';   // default: SAARE records (pehle pichla FY tha — purane bill gayab dikhte the)
  toDate = new Date().toISOString().split('T')[0];
  reasonFilter = '';
  statusFilter = '';
  search = '';

  // Provide a 'reason' label - listing API may not include it; falling back to 'Quality Issue'
  rowReason(r: any): string {
    return r.reason || 'Quality Issue';
  }

  filteredRows(): GoodsReturnListItem[] {
    const all = this.rows();
    const q = this.search.toLowerCase().trim();
    return all.filter(r => {
      if (this.reasonFilter && this.rowReason(r) !== this.reasonFilter) return false;
      if (this.statusFilter && r.status !== this.statusFilter) return false;
      if (q) {
        const hay = (r.grNo + ' ' + (r.originalBillNo || '') + ' ' + r.supplierName + ' ' + (r.buyerName || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  totalAmount = () => this.filteredRows().reduce((s, r) => s + (r.totalReturnAmount || 0), 0);
  adjustedCount = () => this.filteredRows().filter(r => r.status === 'approved').length;
  pendingCount = () => this.filteredRows().filter(r => r.status === 'pending').length;

  topReason(): string {
    const map = new Map<string, number>();
    this.filteredRows().forEach(r => {
      const k = this.rowReason(r);
      map.set(k, (map.get(k) || 0) + 1);
    });
    if (map.size === 0) return '—';
    return [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  topReasonCount(): number {
    const map = new Map<string, number>();
    this.filteredRows().forEach(r => {
      const k = this.rowReason(r);
      map.set(k, (map.get(k) || 0) + 1);
    });
    if (map.size === 0) return 0;
    return [...map.entries()].sort((a, b) => b[1] - a[1])[0][1];
  }

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    const opts: any = {};
    if (this.fromDate) opts.from = this.fromDate;
    if (this.toDate) opts.to = this.toDate;
    if (this.statusFilter) opts.status = this.statusFilter;
    this.svc.listGoodsReturns(opts).subscribe({
      next: (res) => { this.rows.set(res.items); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
  reset() {
    this.fromDate = '2000-01-01';   // saare records
    this.toDate = new Date().toISOString().split('T')[0];
    this.reasonFilter = '';
    this.statusFilter = '';
    this.search = '';
    this.load();
  }
  printPage() { window.print(); }
  exportCsv() {
    const rows = this.filteredRows();
    const header = ['#', 'GR No', 'GR Date', 'Bill No', 'Supplier', 'Buyer', 'GR Amount', 'Reason', 'Status'];
    const lines = [header.map(csvCell).join(',')];
    rows.forEach((r, i) => {
      lines.push([
        i + 1, r.grNo, r.grDate, r.originalBillNo || '',
        r.supplierName, (r.buyerName || ''),
        r.totalReturnAmount, this.rowReason(r), r.status
      ].map(csvCell).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GR_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }
}

// =============================================================================
// COMMISSION REPORT — supplier-wise paid/unpaid commission rollup
// =============================================================================
interface SupplierCommRow {
  partyId: string;
  supplier: string;
  city: string;
  saleAmt: number;       // sum of grossAmount across invoices
  commPctAvg: number;    // weighted-avg comm %
  totalComm: number;     // sum of commissionAmount
  received: number;      // sum where status=paid
  pending: number;       // sum where status!=paid
  lastReceived: string | null;
  status: 'paid' | 'unpaid' | 'partial';
  invoiceCount: number;
}

@Component({
  selector: 'app-commission-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe],
  template: `
    <div class="max-w-7xl mx-auto">
      ${subNav}

      <!-- HEADER CARD -->
      <div class="rpt-header-card">
        <div class="rh-top">
          <div class="rh-icon">💰</div>
          <div class="flex-1">
            <div class="rh-title">Commission Report</div>
            <div class="rh-sub">Paid / Unpaid commission — supplier wise</div>
          </div>
          <div class="rh-actions">
            <button class="btn-print" (click)="printPage()">🖨️ Print</button>
            <button class="btn-export" (click)="exportCsv()">⬇️ CSV Export</button>
          </div>
        </div>

        <div class="filters">
          <div class="fl">
            <label>From</label>
            <input type="date" [(ngModel)]="fromDate" (change)="load()">
          </div>
          <span class="sep">–</span>
          <div class="fl">
            <label>To</label>
            <input type="date" [(ngModel)]="toDate" (change)="load()">
          </div>
          <div class="fl">
            <label>Status</label>
            <select [(ngModel)]="statusFilter">
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
            </select>
          </div>
          <button class="btn-apply" (click)="load()">Apply</button>
          <button class="btn-reset" (click)="reset()">Reset</button>
        </div>
      </div>

      <!-- 5 KPI CARDS -->
      <div class="sum-row">
        <div class="sum-card c-a">
          <div class="sum-label">Total Commission</div>
          <div class="sum-val va">₹{{ totalComm() | number:'1.0-0' }}</div>
          <div class="sum-sub">{{ filteredRows().length }} suppliers</div>
        </div>
        <div class="sum-card c-g">
          <div class="sum-label">Collected</div>
          <div class="sum-val vg">₹{{ totalReceived() | number:'1.0-0' }}</div>
          <div class="sum-sub">{{ collectedPct() }}%</div>
        </div>
        <div class="sum-card c-d">
          <div class="sum-label">Pending</div>
          <div class="sum-val vd">₹{{ totalPending() | number:'1.0-0' }}</div>
          <div class="sum-sub">{{ pendingPct() }}%</div>
        </div>
        <div class="sum-card c-w">
          <div class="sum-label">Avg Comm %</div>
          <div class="sum-val vw">{{ avgCommPct() | number:'1.2-2' }}%</div>
          <div class="sum-sub">Weighted avg</div>
        </div>
        <div class="sum-card c-p">
          <div class="sum-label">Sale Volume</div>
          <div class="sum-val">₹{{ totalSale() | number:'1.0-0' }}</div>
          <div class="sum-sub">Total gross sales</div>
        </div>
      </div>

      <!-- ═══════════ COMMISSION ANALYTICS (3 charts) ═══════════ -->
      <div class="analytics-card">
        <div class="analytics-head">📊 Commission Analytics</div>
        <div class="analytics-grid">

          <!-- Monthly Commission Earned (bar chart) -->
          <div class="chart-block">
            <div class="chart-title">Monthly Commission Earned (₹)</div>
            <svg viewBox="0 0 400 220" class="chart-svg" preserveAspectRatio="xMidYMid meet">
              @for (g of [0,1,2,3,4]; track g) {
                <line [attr.x1]="40" [attr.x2]="395"
                      [attr.y1]="20 + g * 40" [attr.y2]="20 + g * 40"
                      stroke="#f0e6ff" stroke-width="1"/>
                <text [attr.x]="35" [attr.y]="24 + g * 40" text-anchor="end"
                      font-size="9" fill="#b39cc0">
                  ₹{{ (monthlyMax() * (4 - g) / 4) | number:'1.0-0' }}
                </text>
              }
              @for (m of monthlyData(); track m.label; let i = $index) {
                <rect [attr.x]="50 + i * 55"
                      [attr.y]="200 - barHeight(m.value)"
                      width="40"
                      [attr.height]="barHeight(m.value)"
                      [attr.fill]="m.value === monthlyMax() && m.value > 0 ? '#f57c00' : '#5c1a8b'"
                      rx="3">
                  <title>{{ m.label }}: ₹{{ m.value | number:'1.0-0' }}</title>
                </rect>
                <text [attr.x]="70 + i * 55" [attr.y]="215"
                      text-anchor="middle" font-size="10"
                      fill="#6b3fa0" font-weight="600">{{ m.label }}</text>
              }
            </svg>
          </div>

          <!-- Paid vs Unpaid donut -->
          <div class="chart-block">
            <div class="chart-title">Paid vs Unpaid</div>
            <div class="donut-wrap">
              <svg viewBox="0 0 160 160" class="donut-svg">
                <circle cx="80" cy="80" r="60" fill="none" stroke="#fde8e8" stroke-width="22"/>
                <circle cx="80" cy="80" r="60" fill="none" stroke="#16a34a" stroke-width="22"
                        [attr.stroke-dasharray]="paidArc() + ' ' + (377 - paidArc())"
                        transform="rotate(-90 80 80)"
                        stroke-linecap="round"/>
                <text x="80" y="76" text-anchor="middle" font-size="28" font-weight="800" fill="#5c1a8b">
                  {{ collectedPct() }}%
                </text>
                <text x="80" y="96" text-anchor="middle" font-size="10" fill="#6b3fa0">Collected</text>
              </svg>
              <div class="donut-legend">
                <div class="legend-row"><span class="dot dot-green"></span> Paid {{ collectedPct() }}%</div>
                <div class="legend-row"><span class="dot dot-red"></span> Unpaid {{ pendingPct() }}%</div>
              </div>
            </div>
          </div>

          <!-- Top Suppliers horizontal bars -->
          <div class="chart-block">
            <div class="chart-title">Top Suppliers</div>
            <div class="hbar-list">
              @for (s of topSuppliers(); track s.name; let i = $index) {
                <div class="hbar-row">
                  <div class="hbar-name">{{ s.name }}</div>
                  <div class="hbar-track">
                    <div class="hbar-fill"
                         [style.width.%]="topSuppliersMax() > 0 ? (s.value / topSuppliersMax()) * 100 : 0"
                         [style.background]="supplierColor(i)">
                    </div>
                  </div>
                  <div class="hbar-value">₹{{ s.value | number:'1.0-0' }}</div>
                </div>
              }
              @if (topSuppliers().length === 0) {
                <div class="text-center text-gray-400 text-xs py-4">No data</div>
              }
            </div>
          </div>

        </div>
      </div>

      <!-- TABLE -->
      <div class="t-card">
        <div class="t-toolbar">
          <div class="t-title">Commission Supplier Wise</div>
          <div class="t-count">{{ filteredRows().length }} suppliers</div>
          <div class="t-search">
            <span>🔍</span>
            <input type="text" [(ngModel)]="search" placeholder="Search supplier...">
          </div>
        </div>

        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (filteredRows().length === 0) {
          <div class="p-8 text-center text-gray-500">No commission invoices in this period</div>
        } @else {
          <table class="c-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Supplier</th>
                <th>City</th>
                <th class="text-right">Sale Amt</th>
                <th class="text-center">Comm %</th>
                <th class="text-right">Total Comm</th>
                <th class="text-right">Received</th>
                <th class="text-right">Pending</th>
                <th class="text-center">Last Received</th>
                <th class="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              @for (r of filteredRows(); track r.partyId; let i = $index) {
                <tr>
                  <td class="td-soft">{{ i + 1 }}</td>
                  <td class="td-bold">{{ r.supplier }}</td>
                  <td>{{ r.city || '—' }}</td>
                  <td class="td-mono text-right">₹{{ r.saleAmt | number:'1.0-0' }}</td>
                  <td class="text-center font-bold text-[#5c1a8b]">{{ r.commPctAvg | number:'1.1-1' }}%</td>
                  <td class="td-mono td-acc text-right">₹{{ r.totalComm | number:'1.0-0' }}</td>
                  <td class="td-mono td-ok text-right">₹{{ r.received | number:'1.0-0' }}</td>
                  <td class="td-mono td-danger text-right">{{ r.pending > 0 ? '₹' + (r.pending | number:'1.0-0') : '₹0' }}</td>
                  <td class="text-center text-xs">{{ r.lastReceived || '—' }}</td>
                  <td class="text-center">
                    <span class="badge"
                          [class.b-ok]="r.status === 'paid'"
                          [class.b-danger]="r.status === 'unpaid'"
                          [class.b-warn]="r.status === 'partial'">
                      {{ r.status === 'paid' ? 'Paid ✓' : r.status === 'unpaid' ? 'Unpaid' : 'Partial' }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" class="text-right">TOTAL</td>
                <td class="td-mono text-right">₹{{ totalSale() | number:'1.0-0' }}</td>
                <td></td>
                <td class="td-mono td-acc text-right">₹{{ totalComm() | number:'1.0-0' }}</td>
                <td class="td-mono td-ok text-right">₹{{ totalReceived() | number:'1.0-0' }}</td>
                <td class="td-mono td-danger text-right">₹{{ totalPending() | number:'1.0-0' }}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .rpt-header-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      padding: 14px 20px; margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(92,26,139,0.06);
    }
    .rh-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .rh-icon {
      width: 38px; height: 38px; border-radius: 10px; background: #fff3e0;
      display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    .rh-title { font-size: 17px; font-weight: 800; color: #5c1a8b; }
    .rh-sub { font-size: 11px; color: #6b3fa0; margin-top: 2px; }
    .rh-actions { display: flex; gap: 8px; }
    .btn-print, .btn-export {
      padding: 7px 14px; border-radius: 8px; border: none; font-size: 12px; font-weight: 600;
      cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-family: inherit;
    }
    .btn-print { background: #f0e6ff; color: #5c1a8b; border: 1.5px solid #ddc8f5; }
    .btn-print:hover { background: #5c1a8b; color: #fff; }
    .btn-export { background: #f57c00; color: #fff; }
    .btn-export:hover { background: #e65100; }

    .filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .fl { display: flex; align-items: center; gap: 5px; }
    .fl label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .5px; color: #6b3fa0;
    }
    .fl input[type=date], .fl select {
      background: #faf5ff; border: 1.5px solid #ddc8f5; border-radius: 8px;
      padding: 5px 9px; font-size: 12px; color: #2d1040; font-family: inherit; outline: none;
    }
    .fl input[type=date] { width: 120px; }
    .sep { color: #b39cc0; font-size: 12px; }
    .btn-apply {
      background: #5c1a8b; color: #fff; border: none; padding: 5px 14px;
      border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
    }
    .btn-reset {
      background: #f0e6ff; color: #6b3fa0; border: 1px solid #ddc8f5;
      padding: 5px 10px; border-radius: 8px; font-size: 12px; cursor: pointer;
    }

    .sum-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .sum-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      padding: 12px 16px; flex: 1; min-width: 150px; position: relative; overflow: hidden;
      box-shadow: 0 2px 8px rgba(92,26,139,.06);
    }
    .sum-card::after {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      border-radius: 12px 12px 0 0;
    }
    .sum-card.c-p::after { background: #5c1a8b; }
    .sum-card.c-a::after { background: #f57c00; }
    .sum-card.c-g::after { background: #16a34a; }
    .sum-card.c-d::after { background: #c62828; }
    .sum-card.c-w::after { background: #f9a825; }
    .sum-label {
      font-size: 9px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .9px; color: #b39cc0; margin-bottom: 5px;
    }
    .sum-val { font-size: 20px; font-weight: 800; color: #5c1a8b; font-family: monospace; }
    .sum-val.vg { color: #16a34a; }
    .sum-val.vd { color: #c62828; }
    .sum-val.va { color: #f57c00; }
    .sum-val.vw { color: #b45309; }
    .sum-sub { font-size: 10px; color: #6b3fa0; margin-top: 2px; }

    .t-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      overflow: hidden; box-shadow: 0 2px 10px rgba(92,26,139,.06);
    }
    .t-toolbar {
      display: flex; align-items: center; gap: 10px; padding: 11px 14px;
      border-bottom: 1.5px solid #ddc8f5; background: #f0e6ff;
    }
    .t-title { font-size: 13px; font-weight: 800; color: #5c1a8b; flex: 1; }
    .t-count { font-size: 11px; color: #6b3fa0; font-family: monospace; }
    .t-search {
      display: flex; align-items: center; gap: 6px; background: #fff;
      border: 1.5px solid #ddc8f5; border-radius: 20px; padding: 5px 12px;
    }
    .t-search input {
      background: none; border: none; outline: none; color: #2d1040;
      font-size: 12px; width: 150px; font-family: inherit;
    }

    .c-table { width: 100%; border-collapse: collapse; }
    .c-table thead tr { background: #f0e6ff; }
    .c-table th {
      padding: 9px 11px; font-size: 9px; font-weight: 800; color: #6b3fa0;
      text-transform: uppercase; letter-spacing: .8px; text-align: left;
      border-bottom: 2px solid #ddc8f5; white-space: nowrap;
    }
    .c-table td {
      padding: 10px 11px; font-size: 12.5px; color: #2d1040;
      border-bottom: 1px solid rgba(221,200,245,.35); white-space: nowrap;
    }
    .c-table tbody tr:hover td { background: #fdf8ff; }
    .c-table tfoot td {
      background: #f0e6ff; font-weight: 800; font-size: 12.5px;
      color: #5c1a8b; border-top: 2px solid #ddc8f5;
    }
    .td-bold { font-weight: 800; color: #5c1a8b; }
    .td-mono { font-family: monospace; font-weight: 700; }
    .td-ok { color: #16a34a; font-weight: 700; font-family: monospace; }
    .td-danger { color: #c62828; font-weight: 700; font-family: monospace; }
    .td-acc { color: #f57c00; font-weight: 700; font-family: monospace; }
    .td-soft { color: #6b3fa0; font-family: monospace; }

    .badge {
      display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 10px;
      font-size: 10px; font-weight: 700; white-space: nowrap;
    }
    .b-ok { background: #dcfce7; color: #16a34a; }
    .b-danger { background: #fde8e8; color: #c62828; }
    .b-warn { background: #fff8e1; color: #b45309; }

    /* ANALYTICS */
    .analytics-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      margin-bottom: 16px; overflow: hidden;
      box-shadow: 0 2px 8px rgba(92,26,139,.06);
    }
    .analytics-head {
      background: #f0e6ff; padding: 11px 14px; font-size: 13px; font-weight: 800;
      color: #5c1a8b; border-bottom: 1.5px solid #ddc8f5;
    }
    .analytics-grid {
      display: grid; grid-template-columns: 1.4fr 0.9fr 1.1fr; gap: 16px; padding: 16px;
    }
    @media (max-width: 1100px) {
      .analytics-grid { grid-template-columns: 1fr; }
    }
    .chart-block {
      border: 1.5px solid #f0e6ff; border-radius: 10px; padding: 12px;
      background: #fafaff;
    }
    .chart-title {
      font-size: 11px; font-weight: 800; color: #6b3fa0;
      text-transform: uppercase; letter-spacing: .8px; margin-bottom: 10px;
    }
    .chart-svg { width: 100%; height: 220px; display: block; }

    .donut-wrap { display: flex; align-items: center; gap: 16px; }
    .donut-svg { width: 160px; height: 160px; flex-shrink: 0; }
    .donut-legend { display: flex; flex-direction: column; gap: 8px; }
    .legend-row {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; font-weight: 600; color: #2d1040;
    }
    .dot { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
    .dot-green { background: #16a34a; }
    .dot-red { background: #c62828; }

    .hbar-list { display: flex; flex-direction: column; gap: 10px; }
    .hbar-row { display: flex; align-items: center; gap: 8px; }
    .hbar-name {
      width: 70px; font-size: 11px; font-weight: 700;
      color: #2d1040; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .hbar-track {
      flex: 1; height: 18px; background: #f0e6ff; border-radius: 4px; overflow: hidden;
    }
    .hbar-fill { height: 100%; border-radius: 4px; transition: width .3s ease; }
    .hbar-value {
      width: 80px; text-align: right; font-size: 11px; font-weight: 700;
      color: #5c1a8b; font-family: monospace; flex-shrink: 0;
    }

    @media (max-width: 640px) {
      .rpt-header-card { padding: 12px 14px; }
      .rh-top { flex-wrap: wrap; }
      .rh-actions { flex-wrap: wrap; width: 100%; }
      .filters { gap: 8px; }
      .fl { flex-wrap: wrap; }
      .fl input[type=date], .fl select { width: 100% !important; }
      .sum-row { gap: 8px; }
      .sum-card { min-width: 100% !important; width: 100% !important; }
      .t-toolbar { flex-wrap: wrap; }
      .t-search { width: 100%; }
      .t-search input { width: 100%; }
      .t-card { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .c-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
      .analytics-grid { grid-template-columns: 1fr !important; }
      .donut-wrap { flex-wrap: wrap; }
    }
  `]
})
export class CommissionReportComponent {
  private trading = inject(TradingService);
  invoices = signal<any[]>([]);
  parties = signal<Party[]>([]);
  loading = signal(true);

  fromDate = '2000-01-01';   // default: SAARE records (pehle pichla FY tha — purane bill gayab dikhte the)
  toDate = new Date().toISOString().split('T')[0];
  statusFilter = '';
  search = '';

  // Aggregate invoices per supplier
  rows(): SupplierCommRow[] {
    const map = new Map<string, SupplierCommRow>();
    const partyMap = new Map(this.parties().map(p => [p.id, p]));

    for (const inv of this.invoices()) {
      const d = new Date(inv.invoiceDate);
      if (this.fromDate && d < new Date(this.fromDate)) continue;
      if (this.toDate && d > new Date(this.toDate)) continue;

      const key = inv.partyId;
      let row = map.get(key);
      if (!row) {
        const p = partyMap.get(key);
        row = {
          partyId: key,
          supplier: inv.partyName,
          city: p?.city || '',
          saleAmt: 0,
          commPctAvg: 0,
          totalComm: 0,
          received: 0,
          pending: 0,
          lastReceived: null,
          status: 'unpaid',
          invoiceCount: 0
        };
        map.set(key, row);
      }

      row.saleAmt += Number(inv.grossAmount || 0);
      row.totalComm += Number(inv.commissionAmount || 0);
      row.invoiceCount += 1;

      if (inv.status === 'paid') {
        row.received += Number(inv.totalAmount || 0);
        if (!row.lastReceived || inv.invoiceDate > row.lastReceived) {
          row.lastReceived = inv.invoiceDate;
        }
      } else {
        row.pending += Number(inv.totalAmount || 0);
      }
    }

    // Compute weighted avg commPct + status
    for (const r of map.values()) {
      r.commPctAvg = r.saleAmt > 0 ? (r.totalComm / r.saleAmt) * 100 : 0;
      if (r.pending <= 0.01) r.status = 'paid';
      else if (r.received > 0) r.status = 'partial';
      else r.status = 'unpaid';
    }

    return [...map.values()].sort((a, b) => b.saleAmt - a.saleAmt);
  }

  filteredRows(): SupplierCommRow[] {
    const all = this.rows();
    const q = this.search.toLowerCase().trim();
    return all.filter(r => {
      if (this.statusFilter && r.status !== this.statusFilter) return false;
      if (q && !r.supplier.toLowerCase().includes(q) && !r.city.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  // KPI computations
  totalSale = () => this.filteredRows().reduce((s, r) => s + r.saleAmt, 0);
  totalComm = () => this.filteredRows().reduce((s, r) => s + r.totalComm, 0);
  totalReceived = () => this.filteredRows().reduce((s, r) => s + r.received, 0);
  totalPending = () => this.filteredRows().reduce((s, r) => s + r.pending, 0);
  collectedPct = () => {
    const t = this.totalComm();
    return t > 0 ? Math.round((this.totalReceived() / t) * 100) : 0;
  };
  pendingPct = () => 100 - this.collectedPct();
  avgCommPct = () => {
    const t = this.totalSale();
    return t > 0 ? (this.totalComm() / t) * 100 : 0;
  };

  // ═══════════ Chart helpers ═══════════
  // Monthly commission earned (last 6 months from current view)
  monthlyData(): { label: string; value: number }[] {
    const months: { label: string; value: number; key: string }[] = [];
    const now = new Date(this.toDate || new Date().toISOString());
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('en-IN', { month: 'short' });
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ label, value: 0, key });
    }
    for (const inv of this.invoices()) {
      const d = new Date(inv.invoiceDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = months.find(m => m.key === key);
      if (bucket) bucket.value += Number(inv.commissionAmount || 0);
    }
    return months.map(m => ({ label: m.label, value: m.value }));
  }
  monthlyMax(): number {
    const max = Math.max(...this.monthlyData().map(m => m.value));
    return max > 0 ? max : 1;
  }
  barHeight(value: number): number {
    return (value / this.monthlyMax()) * 180;
  }
  paidArc(): number {
    // Donut circumference = 2π * 60 ≈ 377
    return Math.round((this.collectedPct() / 100) * 377);
  }
  topSuppliers(): { name: string; value: number }[] {
    return this.filteredRows()
      .slice(0, 4)
      .map(r => ({ name: this.shortName(r.supplier), value: r.totalComm }))
      .sort((a, b) => b.value - a.value);
  }
  topSuppliersMax(): number {
    const list = this.topSuppliers();
    return list.length ? Math.max(...list.map(s => s.value)) : 1;
  }
  shortName(s: string): string {
    return s.length > 10 ? s.substring(0, 9) + '…' : s;
  }
  supplierColor(i: number): string {
    return ['#5c1a8b', '#f57c00', '#c62828', '#16a34a'][i] || '#9333ea';
  }

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    // Load parties first (for city info) — non-blocking
    this.trading.listParties().subscribe({ next: (p) => this.parties.set(p) });
    this.trading.listCommissionInvoices().subscribe({
      next: (list) => { this.invoices.set(list); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
  reset() {
    this.fromDate = '2000-01-01';   // saare records
    this.toDate = new Date().toISOString().split('T')[0];
    this.statusFilter = '';
    this.search = '';
    this.load();
  }
  printPage() { window.print(); }
  exportCsv() {
    const rows = this.filteredRows();
    const header = ['#', 'Supplier', 'City', 'Sale Amt', 'Comm %', 'Total Comm', 'Received', 'Pending', 'Last Received', 'Status'];
    const lines = [header.map(csvCell).join(',')];
    rows.forEach((r, i) => {
      lines.push([
        i + 1, r.supplier, (r.city || ''),
        r.saleAmt, r.commPctAvg.toFixed(2) + '%',
        r.totalComm, r.received, r.pending,
        r.lastReceived || '', r.status
      ].map(csvCell).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Commission_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }
}

// =============================================================================
// ON TIME / LATE / EARLY — Payment Analysis report
// =============================================================================
interface OnTimeRow {
  id: string;
  billNo: string;
  billDate: string;
  buyerName: string;
  supplierName: string;
  billAmt: number;
  paidAmt: number;
  pending: number;
  lastReceipt: string | null;
  payTermDays: number;
  dueDate: string;
  daysDiff: number;         // +ve = late, -ve = early
  behaviour: 'on-time' | 'late' | 'early' | 'unpaid';
  expanded?: boolean;
}

@Component({
  selector: 'app-on-time-late-early',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, InDatePipe, WaSendComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      ${subNav}

      <!-- HEADER -->
      <div class="rpt-header-card">
        <div class="rh-top">
          <div class="rh-icon">⏱️</div>
          <div class="flex-1">
            <div class="rh-title">On Time / Late / Early <span class="ml-2 px-2 py-0.5 rounded-md text-xs font-bold" style="background:#fff3e0;color:#f57c00">Payment Analysis</span></div>
            <div class="rh-sub">Bill due date vs actual payment date — kitne din late ya early hua</div>
          </div>
          <div class="rh-actions">
            <button class="btn-light" (click)="expandAll()">▾ Sabhi Expand</button>
            <button class="btn-light" (click)="collapseAll()">▸ Sabhi Collapse</button>
            <button class="btn-print" (click)="printPage()">🖨️ Print</button>
            <app-wa-send [message]="waMessage()" [suggestedPhone]="waPhone()"></app-wa-send>
          </div>
        </div>

        <div class="filters">
          <div class="fl">
            <label>From</label>
            <input type="date" [(ngModel)]="fromDate" (change)="load()">
          </div>
          <div class="fl">
            <label>To</label>
            <input type="date" [(ngModel)]="toDate" (change)="load()">
          </div>
          <div class="fl">
            <label>Pay Behaviour</label>
            <select [(ngModel)]="behaviourFilter">
              <option value="">Sabhi</option>
              <option value="late">Late</option>
              <option value="early">Early</option>
              <option value="on-time">On Time</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          <div class="fl">
            <label>Buyer</label>
            <select [(ngModel)]="buyerFilter">
              <option value="">Sabhi Buyer</option>
              @for (b of uniqueBuyers(); track b) {
                <option [value]="b">{{ b }}</option>
              }
            </select>
          </div>
          <div class="fl">
            <label>Supplier</label>
            <select [(ngModel)]="supplierFilter">
              <option value="">Sabhi Supplier</option>
              @for (s of uniqueSuppliers(); track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
          </div>
          <div class="fl">
            <label>Search</label>
            <input type="text" [(ngModel)]="search" placeholder="Bill ID, Bill No, Buyer, Supplier..." class="w-56">
          </div>
          <button class="btn-apply" (click)="load()">Apply</button>
        </div>
      </div>

      <!-- 7 KPI CARDS -->
      <div class="sum-row">
        <div class="sum-card c-p">
          <div class="sum-label">Total Bills</div>
          <div class="sum-val">{{ filteredRows().length }}</div>
        </div>
        <div class="sum-card c-w">
          <div class="sum-label">⚠️ Late</div>
          <div class="sum-val vw">{{ countByBehaviour('late') }}</div>
        </div>
        <div class="sum-card c-g">
          <div class="sum-label">🟢 Early</div>
          <div class="sum-val vg">{{ countByBehaviour('early') }}</div>
        </div>
        <div class="sum-card c-g">
          <div class="sum-label">✅ On Time</div>
          <div class="sum-val vg">{{ countByBehaviour('on-time') }}</div>
        </div>
        <div class="sum-card c-d">
          <div class="sum-label">❌ Unpaid</div>
          <div class="sum-val vd">{{ countByBehaviour('unpaid') }}</div>
        </div>
        <div class="sum-card c-a">
          <div class="sum-label">Avg Late Days</div>
          <div class="sum-val va">{{ avgLateDays() }} din</div>
        </div>
        <div class="sum-card c-d">
          <div class="sum-label">Max Late Days</div>
          <div class="sum-val vd">{{ maxLateDays() }} din</div>
        </div>
      </div>

      <!-- TABLE -->
      <div class="t-card">
        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (filteredRows().length === 0) {
          <div class="p-8 text-center text-gray-500">No bills in this period</div>
        } @else {
          <table class="o-table">
            <thead>
              <tr>
                <th style="width:30px"></th>
                <th>S.NO</th>
                <th>Bill No</th>
                <th>Bill Date</th>
                <th>Buyer Name</th>
                <th>Supplier</th>
                <th class="text-right">Bill Amt</th>
                <th class="text-right">Paid Amt</th>
                <th>Last Receipt</th>
                <th>Pay Term</th>
                <th>Due Date</th>
                <th class="text-center">Days</th>
                <th class="text-center">Behaviour</th>
              </tr>
            </thead>
            <tbody>
              @for (r of filteredRows(); track r.id; let i = $index) {
                <tr class="row-main" [class.row-late]="r.behaviour === 'late'"
                                       [class.row-early]="r.behaviour === 'early'"
                                       [class.row-unpaid]="r.behaviour === 'unpaid'">
                  <td class="text-center">
                    <button class="exp-btn" (click)="toggle(r)">{{ r.expanded ? '▾' : '▸' }}</button>
                  </td>
                  <td class="td-mono">{{ i + 1 }}</td>
                  <td class="td-bold">{{ r.billNo }}</td>
                  <td class="td-mono">{{ r.billDate | inDate }}</td>
                  <td class="td-bold">{{ r.buyerName }}</td>
                  <td>{{ r.supplierName }}</td>
                  <td class="td-mono text-right">₹{{ r.billAmt | number:'1.2-2' }}</td>
                  <td class="td-mono text-right">₹{{ r.paidAmt | number:'1.2-2' }}</td>
                  <td class="td-mono text-xs">{{ r.lastReceipt || '—' }}</td>
                  <td>{{ r.payTermDays }} din</td>
                  <td class="td-mono">{{ r.dueDate | inDate }}</td>
                  <td class="text-center">
                    <span class="days-badge"
                          [class.b-warn]="r.behaviour === 'late'"
                          [class.b-ok]="r.behaviour === 'early' || r.behaviour === 'on-time'"
                          [class.b-danger]="r.behaviour === 'unpaid'">
                      {{ daysLabel(r) }}
                    </span>
                  </td>
                  <td class="text-center">
                    <span class="badge"
                          [class.b-warn]="r.behaviour === 'late'"
                          [class.b-ok]="r.behaviour === 'on-time' || r.behaviour === 'early'"
                          [class.b-danger]="r.behaviour === 'unpaid'">
                      {{ behaviourLabel(r.behaviour) }}
                    </span>
                  </td>
                </tr>
                @if (r.expanded) {
                  <tr class="row-detail">
                    <td colspan="13">
                      <div class="detail-card">
                        <div class="d-head">
                          <span class="d-title">📄 Bill {{ r.billNo }} — {{ r.buyerName }}</span>
                          <span class="d-chip">Supplier: {{ r.supplierName }}</span>
                          <span class="d-chip">Pay Term: {{ r.payTermDays }} din</span>
                          <span class="d-chip" [class.chip-ok]="r.pending <= 0.01" [class.chip-warn]="r.pending > 0.01">
                            {{ r.pending <= 0.01 ? '✓ Fully Paid' : '⚠️ ' + (r.pending | number:'1.2-2') + ' pending' }}
                          </span>
                          @if (r.behaviour === 'late') {
                            <span class="d-chip chip-late">{{ Math.abs(r.daysDiff) }} din Late</span>
                          }
                        </div>

                        <div class="d-section-head">Payment Timeline</div>
                        <div class="timeline">
                          <div class="tl-dot tl-blue"></div>
                          <div class="tl-line" [style.background]="r.behaviour === 'early' ? '#16a34a' : '#5c1a8b'"></div>
                          <div class="tl-dot tl-orange"></div>
                          <div class="tl-line" [style.background]="r.behaviour === 'late' ? '#c62828' : '#16a34a'"></div>
                          <div class="tl-dot" [class.tl-red]="r.behaviour === 'late'" [class.tl-green]="r.behaviour !== 'late' && r.behaviour !== 'unpaid'"></div>
                        </div>
                        <div class="timeline-labels">
                          <div><div class="lbl-strong">Bill Bana</div><div class="lbl-date">{{ r.billDate | inDate }}</div></div>
                          <div><div class="lbl-strong">Due Date</div><div class="lbl-date">{{ r.dueDate | inDate }}</div></div>
                          <div>
                            <div class="lbl-strong">Payment</div>
                            <div class="lbl-date">{{ r.lastReceipt || '—' }}</div>
                            <div class="badge mt-1"
                                 [class.b-warn]="r.behaviour === 'late'"
                                 [class.b-ok]="r.behaviour === 'early' || r.behaviour === 'on-time'"
                                 [class.b-danger]="r.behaviour === 'unpaid'">
                              {{ daysLabel(r) }}
                            </div>
                          </div>
                        </div>

                        <div class="d-grid">
                          <div class="d-cell"><div class="dc-label">Bill Amount</div><div class="dc-val">₹{{ r.billAmt | number:'1.2-2' }}</div></div>
                          <div class="d-cell"><div class="dc-label">Paid Amount</div><div class="dc-val text-green-700">₹{{ r.paidAmt | number:'1.2-2' }}</div></div>
                          <div class="d-cell"><div class="dc-label">Pending</div><div class="dc-val" [class.text-red-600]="r.pending > 0">₹{{ r.pending | number:'1.2-2' }}</div></div>
                          <div class="d-cell"><div class="dc-label">Pay Term</div><div class="dc-val">{{ r.payTermDays }} din</div></div>
                          <div class="d-cell hl"><div class="dc-label">Days Difference</div><div class="dc-val">{{ daysLabel(r) }}</div></div>
                          <div class="d-cell"><div class="dc-label">Supplier</div><div class="dc-val text-[#f57c00]">{{ r.supplierName }}</div></div>
                          <div class="d-cell"><div class="dc-label">Behaviour</div><div class="dc-val">
                            <span class="badge"
                                  [class.b-warn]="r.behaviour === 'late'"
                                  [class.b-ok]="r.behaviour === 'on-time' || r.behaviour === 'early'"
                                  [class.b-danger]="r.behaviour === 'unpaid'">
                              {{ behaviourLabel(r.behaviour) }}
                            </span>
                          </div></div>
                        </div>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .rpt-header-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      padding: 14px 20px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(92,26,139,0.06);
    }
    .rh-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .rh-icon {
      width: 38px; height: 38px; border-radius: 10px; background: #f0e6ff;
      display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    .rh-title { font-size: 17px; font-weight: 800; color: #5c1a8b; }
    .rh-sub { font-size: 11px; color: #6b3fa0; margin-top: 2px; }
    .rh-actions { display: flex; gap: 8px; }
    .btn-light, .btn-print {
      padding: 6px 12px; border-radius: 8px; border: 1.5px solid #ddc8f5;
      background: #f0e6ff; color: #5c1a8b; font-size: 12px; font-weight: 600;
      cursor: pointer; font-family: inherit;
    }
    .btn-light:hover, .btn-print:hover { background: #5c1a8b; color: #fff; }

    .filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .fl { display: flex; flex-direction: column; gap: 3px; }
    .fl label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .5px; color: #6b3fa0;
    }
    .fl input, .fl select {
      background: #faf5ff; border: 1.5px solid #ddc8f5; border-radius: 8px;
      padding: 5px 9px; font-size: 12px; color: #2d1040; font-family: inherit; outline: none;
    }
    .fl input[type=date] { width: 130px; }
    .btn-apply {
      background: #5c1a8b; color: #fff; border: none; padding: 8px 16px;
      border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
      align-self: flex-end;
    }

    .sum-row { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; margin-bottom: 16px; }
    @media (max-width: 1100px) { .sum-row { grid-template-columns: repeat(4, 1fr); } }
    @media (max-width: 700px) { .sum-row { grid-template-columns: repeat(2, 1fr); } }
    .sum-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 10px;
      padding: 10px 12px; position: relative; overflow: hidden;
      box-shadow: 0 2px 8px rgba(92,26,139,.06);
    }
    .sum-card::after {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      border-radius: 10px 10px 0 0;
    }
    .sum-card.c-p::after { background: #5c1a8b; }
    .sum-card.c-a::after { background: #f57c00; }
    .sum-card.c-g::after { background: #16a34a; }
    .sum-card.c-d::after { background: #c62828; }
    .sum-card.c-w::after { background: #f9a825; }
    .sum-label { font-size: 9px; font-weight: 800; text-transform: uppercase; color: #b39cc0; margin-bottom: 4px; }
    .sum-val { font-size: 22px; font-weight: 800; color: #5c1a8b; font-family: monospace; }
    .sum-val.vg { color: #16a34a; } .sum-val.vd { color: #c62828; }
    .sum-val.va { color: #f57c00; } .sum-val.vw { color: #b45309; }

    .t-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px; overflow: hidden;
      box-shadow: 0 2px 10px rgba(92,26,139,.06);
    }
    .o-table { width: 100%; border-collapse: collapse; }
    .o-table thead tr { background: #f0e6ff; }
    .o-table th {
      padding: 9px 11px; font-size: 9px; font-weight: 800; color: #6b3fa0;
      text-transform: uppercase; letter-spacing: .8px; text-align: left;
      border-bottom: 2px solid #ddc8f5;
    }
    .o-table td { padding: 10px 11px; font-size: 12.5px; color: #2d1040; border-bottom: 1px solid rgba(221,200,245,.35); }
    .row-main { border-left: 3px solid transparent; }
    .row-main.row-late { border-left-color: #f9a825; }
    .row-main.row-early { border-left-color: #16a34a; }
    .row-main.row-unpaid { border-left-color: #c62828; }
    .row-main:hover td { background: #fdf8ff; }
    .row-detail td { background: #faf5ff !important; padding: 0; border-bottom: 2px solid #ddc8f5; }

    .td-bold { font-weight: 800; color: #5c1a8b; }
    .td-mono { font-family: monospace; font-weight: 700; }

    .days-badge, .badge {
      display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 10px;
      font-size: 11px; font-weight: 700; white-space: nowrap;
    }
    .b-ok { background: #dcfce7; color: #16a34a; }
    .b-danger { background: #fde8e8; color: #c62828; }
    .b-warn { background: #fff8e1; color: #b45309; }

    .exp-btn {
      width: 24px; height: 24px; border-radius: 6px; background: #f0e6ff;
      color: #5c1a8b; border: none; cursor: pointer; font-weight: 800;
    }
    .exp-btn:hover { background: #5c1a8b; color: #fff; }

    /* DETAIL CARD */
    .detail-card { background: #fff; margin: 8px 16px 16px; border: 1.5px solid #ddc8f5; border-radius: 10px; padding: 14px 16px; }
    .d-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
    .d-title { font-size: 13px; font-weight: 800; color: #5c1a8b; margin-right: auto; }
    .d-chip {
      font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 8px;
      background: #f0e6ff; color: #5c1a8b; text-transform: uppercase; letter-spacing: .5px;
    }
    .chip-ok { background: #dcfce7 !important; color: #16a34a !important; }
    .chip-warn { background: #fff8e1 !important; color: #b45309 !important; }
    .chip-late { background: #fff8e1 !important; color: #b45309 !important; }

    .d-section-head { font-size: 10px; font-weight: 800; color: #b39cc0; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .timeline { display: flex; align-items: center; gap: 0; }
    .tl-dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
    .tl-blue { background: #1B2E5C; }
    .tl-orange { background: #f57c00; }
    .tl-red { background: #c62828; }
    .tl-green { background: #16a34a; }
    .tl-line { flex: 1; height: 3px; }
    .timeline-labels { display: flex; justify-content: space-between; margin-top: 6px; margin-bottom: 16px; }
    .lbl-strong { font-size: 12px; font-weight: 700; color: #2d1040; }
    .lbl-date { font-size: 11px; color: #6b3fa0; font-family: monospace; }

    .d-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
    @media (max-width: 1100px) { .d-grid { grid-template-columns: repeat(3, 1fr); } }
    .d-cell { background: #faf5ff; border: 1.5px solid #ddc8f5; border-radius: 8px; padding: 8px 10px; }
    .d-cell.hl { background: #fff3e0; border-color: #f57c00; }
    .dc-label { font-size: 9px; font-weight: 800; color: #6b3fa0; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 3px; }
    .dc-val { font-size: 13px; font-weight: 800; color: #5c1a8b; font-family: monospace; }

    @media (max-width: 640px) {
      .rpt-header-card { padding: 12px 14px; }
      .rh-top { flex-wrap: wrap; }
      .rh-actions { flex-wrap: wrap; width: 100%; }
      .filters { gap: 8px; }
      .fl { width: 100%; }
      .fl input, .fl select { width: 100% !important; }
      .sum-row { grid-template-columns: 1fr !important; }
      .t-card { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .o-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
      .d-grid { grid-template-columns: 1fr !important; }
      .detail-card { margin: 8px; padding: 12px; }
    }
  `]
})
export class OnTimeLateEarlyComponent {
  private svc = inject(ReportsService);
  private trading = inject(TradingService);
  features = inject(FeatureService);
  bills = signal<SalesRegisterRow[]>([]);
  payments = signal<any[]>([]);
  parties = signal<Party[]>([]);
  loading = signal(true);
  Math = Math;

  fromDate = '2000-01-01';   // saare records
  toDate = new Date().toISOString().split('T')[0];
  behaviourFilter = '';
  buyerFilter = '';
  supplierFilter = '';
  search = '';

  // Cached rows (built once after load) so expanded state persists across re-renders
  _rows = signal<OnTimeRow[]>([]);
  allRows(): OnTimeRow[] { return this._rows(); }

  // Build OnTimeRow list by joining bills + party + last-payment-date
  buildRows(): OnTimeRow[] {
    const partyMap = new Map(this.parties().map(p => [p.id, p]));
    // latest payment date per partyId
    const latestPaymentByParty = new Map<string, string>();
    for (const p of this.payments()) {
      const cur = latestPaymentByParty.get(p.partyId);
      if (!cur || p.paymentDate > cur) latestPaymentByParty.set(p.partyId, p.paymentDate);
    }
    // build rows
    return this.bills().map(b => {
      // Payment BUYER se aata hai — buyer party ke credit days/receipts use karo
      const party = [...partyMap.values()].find(p => p.displayName === (b.buyerName || b.partyName));
      const payTerm = party?.creditDays ?? 30;
      const dueDate = this.addDays(b.billDate, payTerm);
      const lastReceipt = party ? latestPaymentByParty.get(party.id) ?? null : null;
      const pending = b.total - b.paidAmount;

      let behaviour: OnTimeRow['behaviour'];
      let daysDiff = 0;
      if (pending > 0.01) {
        behaviour = 'unpaid';
        daysDiff = this.daysBetween(dueDate, new Date().toISOString().split('T')[0]);
      } else if (lastReceipt) {
        daysDiff = this.daysBetween(dueDate, lastReceipt);
        if (daysDiff <= -3) behaviour = 'early';
        else if (daysDiff <= 1) behaviour = 'on-time';
        else behaviour = 'late';
      } else {
        // Paid but no receipt date — assume on-time
        behaviour = 'on-time';
      }

      return {
        id: b.billNo,
        billNo: b.billNo,
        billDate: b.billDate,
        buyerName: b.buyerName || '—',      // asli buyer (partyName = supplier hota hai)
        supplierName: b.partyName,          // asli supplier — Namokara to broker hai
        billAmt: b.total,
        paidAmt: b.paidAmount,
        pending,
        lastReceipt,
        payTermDays: payTerm,
        dueDate,
        daysDiff,
        behaviour,
        expanded: false
      } as OnTimeRow;
    });
  }

  filteredRows(): OnTimeRow[] {
    const all = this.allRows();
    const q = this.search.toLowerCase().trim();
    return all.filter(r => {
      if (this.behaviourFilter && r.behaviour !== this.behaviourFilter) return false;
      if (this.buyerFilter && r.buyerName !== this.buyerFilter) return false;
      if (this.supplierFilter && r.supplierName !== this.supplierFilter) return false;
      if (q) {
        const hay = (r.billNo + ' ' + r.buyerName + ' ' + r.supplierName).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  uniqueBuyers(): string[] {
    return [...new Set(this.allRows().map(r => r.buyerName))].sort();
  }
  uniqueSuppliers(): string[] {
    return [...new Set(this.allRows().map(r => r.supplierName))].sort();
  }

  countByBehaviour(b: string): number {
    return this.filteredRows().filter(r => r.behaviour === b).length;
  }
  avgLateDays(): number {
    const lates = this.filteredRows().filter(r => r.behaviour === 'late' || r.behaviour === 'unpaid');
    if (!lates.length) return 0;
    return Math.round(lates.reduce((s, r) => s + r.daysDiff, 0) / lates.length);
  }
  maxLateDays(): number {
    const lates = this.filteredRows().filter(r => r.behaviour === 'late' || r.behaviour === 'unpaid');
    if (!lates.length) return 0;
    return Math.max(...lates.map(r => r.daysDiff));
  }

  daysLabel(r: OnTimeRow): string {
    if (r.behaviour === 'unpaid') return r.daysDiff > 0 ? `${r.daysDiff} din overdue` : 'pending';
    if (r.behaviour === 'on-time') return 'On Time';
    if (r.behaviour === 'early') return `${Math.abs(r.daysDiff)} din Early`;
    return `${r.daysDiff} din Late`;
  }
  behaviourLabel(b: string): string {
    return ({ 'on-time': 'On Time', late: 'Late', early: 'Early', unpaid: 'Unpaid' } as any)[b] || b;
  }
  toggle(r: OnTimeRow) {
    r.expanded = !r.expanded;
    this._rows.set([...this._rows()]);   // trigger re-render
  }
  expandAll() {
    this._rows().forEach(r => r.expanded = true);
    this._rows.set([...this._rows()]);
  }
  collapseAll() {
    this._rows().forEach(r => r.expanded = false);
    this._rows.set([...this._rows()]);
  }

  // Date helpers
  addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }
  daysBetween(a: string, b: string): number {
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
  }

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    // Use forkJoin so rows are built only AFTER all 3 datasets land
    forkJoin([
      this.trading.listParties(),
      this.trading.listPayments({ from: this.fromDate, to: this.toDate }),
      this.svc.salesRegister(this.fromDate, this.toDate)
    ]).subscribe({
      next: ([parties, pays, bills]: any[]) => {
        this.parties.set(parties);
        this.payments.set(pays.items || []);
        this.bills.set(bills);
        this._rows.set(this.buildRows());     // build & cache once
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
  printPage() { window.print(); }

  // ── WhatsApp share ──
  private fmt(d: string): string {
    if (!d) return '—';
    const [y, m, dd] = d.split('-');
    return `${dd}/${m}/${(y || '').slice(-2)}`;
  }
  waMessage(): string {
    const rows = this.filteredRows();
    if (!rows.length) return '';
    const upto = this.fmt(this.toDate || new Date().toISOString().split('T')[0]);
    const partyLine = this.buyerFilter || this.supplierFilter || 'Sabhi parties';
    const lines: string[] = [`*On Time / Late Report* (${upto} tak)`, partyLine];
    const max = 15;
    rows.slice(0, max).forEach((r, i) => {
      lines.push(`${i + 1}. ${r.billNo} · ${this.fmt(r.billDate)} · ${r.buyerName} · ₹${Math.round(r.billAmt || 0).toLocaleString('en-IN')} · Due ${this.fmt(r.dueDate)} · ${this.daysLabel(r)}`);
    });
    if (rows.length > max) lines.push(`+${rows.length - max} aur...`);
    lines.push('------------------');
    const totPending = rows.reduce((s, r) => s + (r.pending || 0), 0);
    lines.push(`Total Pending: ₹${Math.round(totPending).toLocaleString('en-IN')}`);
    lines.push('- ' + (this.features.firmName() || 'Anjaninex'));
    return lines.join('\n');
  }
  waPhone(): string | null {
    // Single buyer/supplier filter ho to us party ka phone suggest karo
    const name = this.buyerFilter || this.supplierFilter;
    if (!name) return null;
    const p = this.parties().find(x => x.displayName === name);
    return p?.phone || null;
  }
}

// =============================================================================
// ORDER vs BILL — Comparison Report (rate-wise match, challan tracking)
// =============================================================================
interface RateMatchRow {
  rate: number;
  orderItem: string;
  orderQty: number;
  billItem: string;
  billQty: number;
  diff: number;
  pendingVal: number;
  status: 'pura-billed' | 'partial' | 'pending';
  challan: string | null;
}

interface OrderRow {
  id: string;
  orderNo: string;
  orderDate: string;
  supplierOrderNo: string | null;
  supplierName: string;
  buyerName: string;
  billNos: string[];
  challanNos: string[];
  ordQty: number;
  ordValue: number;
  billQty: number;
  billValue: number;
  status: 'pura-billed' | 'partial' | 'pending';
  expanded: boolean;
  rateMatches: RateMatchRow[];
  loaded: boolean;
}

@Component({
  selector: 'app-order-vs-bill',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, InDatePipe],
  template: `
    <div class="max-w-7xl mx-auto">
      ${subNav}

      <!-- ANJANINEX PURPLE GRADIENT HEADER -->
      <div class="ovb-header">
        <div class="ovb-h-left">
          <div class="ovb-icon">📋</div>
          <div>
            <div class="ovb-title">Order vs Bill — Comparison Report</div>
            <div class="ovb-sub">Rate-wise auto match · Supplier Challan tracking · Pending analysis</div>
          </div>
        </div>
        <div class="ovb-h-right">
          <div class="ovb-meta-line">📅 {{ today() }}</div>
          <div class="ovb-meta-line">📋 {{ orderRows().length }} Orders · 📄 {{ allBills().length }} Bills</div>
        </div>
      </div>

      <!-- KPI CARDS — split into 2 rows for clarity -->
      <div class="kpi-section">
        <div class="kpi-section-head">📊 Order Status</div>
        <div class="sum-row kpi-4">
          <div class="sum-card c-p">
            <div class="sum-label">Kul Orders</div>
            <div class="sum-val">{{ orderRows().length }}</div>
          </div>
          <div class="sum-card c-g">
            <div class="sum-label">✅ Pura Billed</div>
            <div class="sum-val vg">{{ countByStatus('pura-billed') }}</div>
          </div>
          <div class="sum-card c-w">
            <div class="sum-label">⚠️ Partial</div>
            <div class="sum-val vw">{{ countByStatus('partial') }}</div>
          </div>
          <div class="sum-card c-d">
            <div class="sum-label">❌ Pending</div>
            <div class="sum-val vd">{{ countByStatus('pending') }}</div>
          </div>
        </div>
      </div>

      <div class="kpi-section">
        <div class="kpi-section-head">📦 Quantity Tracking</div>
        <div class="sum-row kpi-3">
          <div class="sum-card c-p">
            <div class="sum-label">Order Qty</div>
            <div class="sum-val">{{ totalOrderQty() | number:'1.0-0' }}</div>
            <div class="sum-sub">Total placed</div>
          </div>
          <div class="sum-card c-a">
            <div class="sum-label">Billed Qty</div>
            <div class="sum-val va">{{ totalBilledQty() | number:'1.0-0' }}</div>
            <div class="sum-sub">{{ billedPct() }}% delivered</div>
          </div>
          <div class="sum-card c-d">
            <div class="sum-label">Pending Qty</div>
            <div class="sum-val vd">{{ totalPendingQty() | number:'1.0-0' }}</div>
            <div class="sum-sub">{{ pendingPct() }}% pending</div>
          </div>
        </div>
      </div>

      <!-- FILTER ROW (only filters here) -->
      <div class="ovb-filters">
        <div class="fil-lbl">🔍 Filters:</div>
        <select [(ngModel)]="statusFilter" class="filt-sel">
          <option value="">Sabhi Status</option>
          <option value="pura-billed">✅ Pura Billed</option>
          <option value="partial">⚠️ Partial</option>
          <option value="pending">❌ Pending</option>
        </select>
        <select [(ngModel)]="supplierFilter" class="filt-sel">
          <option value="">Sabhi Supplier</option>
          @for (s of uniqueSuppliers(); track s) { <option [value]="s">{{ s }}</option> }
        </select>
        <select [(ngModel)]="buyerFilter" class="filt-sel">
          <option value="">Sabhi Buyer</option>
          @for (b of uniqueBuyers(); track b) { <option [value]="b">{{ b }}</option> }
        </select>
        <input type="text" [(ngModel)]="search" placeholder="Order ID, Supplier, Item ya Challan se kho..." class="filt-search">
      </div>

      <!-- ACTION ROW (separate) -->
      <div class="ovb-actions">
        <div class="act-info">Showing <b>{{ filteredRows().length }}</b> of {{ orderRows().length }} orders</div>
        <div class="act-buttons">
          <button class="btn-light" (click)="expandAll()">▾ Sabhi Expand</button>
          <button class="btn-light" (click)="collapseAll()">▸ Sabhi Collapse</button>
          <button class="btn-print" (click)="printPage()">🖨️ Print / Save PDF</button>
        </div>
      </div>

      <!-- MAIN TABLE -->
      <div class="ovb-table-wrap">
        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (filteredRows().length === 0) {
          <div class="p-8 text-center text-gray-500">No matching orders</div>
        } @else {
          <table class="ovb-table">
            <thead>
              <tr>
                <th style="width:30px"></th>
                <th>S.NO</th>
                <th>Order ID</th>
                <th>Supplier Ord No</th>
                <th>Supplier</th>
                <th>Buyer Name</th>
                <th>Bill No / Challan</th>
                <th class="text-right">Ord Qty</th>
                <th class="text-right">Ord Value</th>
                <th class="text-right">Bill Qty</th>
                <th class="text-right">Bill Value</th>
                <th class="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              @for (r of filteredRows(); track r.id; let i = $index) {
                <tr class="row-main">
                  <td><button class="exp-btn" (click)="toggle(r)">{{ r.expanded ? '▾' : '▸' }}</button></td>
                  <td class="td-mono">{{ i + 1 }}</td>
                  <td class="td-bold">
                    <div>{{ r.orderNo }}</div>
                    <div class="text-xs text-[#6b3fa0]">{{ r.orderDate | inDate }}</div>
                  </td>
                  <td>
                    @if (r.supplierOrderNo) {
                      <span class="ord-chip">🏷️ {{ r.supplierOrderNo }}</span>
                    }
                  </td>
                  <td class="td-bold uppercase">{{ r.supplierName }}</td>
                  <td class="td-bold uppercase">{{ r.buyerName }}</td>
                  <td>
                    @for (b of r.billNos; track b) {
                      <div class="bill-chip">📄 {{ b }}</div>
                    }
                    @for (c of r.challanNos; track c) {
                      <div class="challan-chip">📦 {{ c }}</div>
                    }
                    @if (r.billNos.length === 0 && r.challanNos.length === 0) {
                      <span class="text-gray-400">—</span>
                    }
                  </td>
                  <td class="td-mono text-right">{{ r.ordQty }}</td>
                  <td class="td-mono text-right">₹{{ r.ordValue | number:'1.2-2' }}</td>
                  <td class="td-mono text-right" [class.text-orange-600]="r.billQty < r.ordQty">{{ r.billQty }}</td>
                  <td class="td-mono text-right" [class.text-orange-600]="r.billValue < r.ordValue">₹{{ r.billValue | number:'1.2-2' }}</td>
                  <td class="text-center">
                    <span class="badge"
                          [class.b-ok]="r.status === 'pura-billed'"
                          [class.b-warn]="r.status === 'partial'"
                          [class.b-danger]="r.status === 'pending'">
                      {{ r.status === 'pura-billed' ? '✅ Pura Billed' : r.status === 'partial' ? '⚠️ Partial' : '❌ Pending' }}
                    </span>
                  </td>
                </tr>

                @if (r.expanded) {
                  <tr class="row-detail">
                    <td colspan="12">
                      <div class="rate-banner">
                        <span>🏷️ RATE-WISE MATCH — <b>{{ r.orderNo }}</b> · {{ r.supplierName }} → {{ r.buyerName }}</span>
                        <span class="rb-divider">|</span>
                        @if (r.supplierOrderNo) {
                          <span class="rb-chip">🏷️ SUPPLIER ORD: {{ r.supplierOrderNo }}</span>
                        }
                        @for (b of r.billNos; track b) {
                          <span class="rb-chip">📄 BILL: {{ b }}</span>
                        }
                        @for (c of r.challanNos; track c) {
                          <span class="rb-chip">📦 CHALLAN: {{ c }}</span>
                        }
                      </div>

                      @if (!r.loaded) {
                        <div class="text-center text-gray-500 py-4 text-xs">Loading match details…</div>
                      } @else if (r.rateMatches.length === 0) {
                        <div class="text-center text-gray-500 py-4 text-xs">No matching items found</div>
                      } @else {
                        <table class="rate-table">
                          <colgroup>
                            <col style="width:100px">      <!-- Rate -->
                            <col>                           <!-- Order Items -->
                            <col>                           <!-- Bill Items -->
                            <col style="width:90px">       <!-- Ord Qty -->
                            <col style="width:90px">       <!-- Bill Qty -->
                            <col style="width:80px">       <!-- Diff -->
                            <col style="width:140px">      <!-- Pending Val -->
                            <col style="width:130px">      <!-- Status -->
                          </colgroup>
                          <thead>
                            <tr>
                              <th class="text-center">Rate ₹</th>
                              <th>Order Items</th>
                              <th>Bill Items (Challan)</th>
                              <th class="text-center">Ord Qty</th>
                              <th class="text-center">Bill Qty</th>
                              <th class="text-center">Diff</th>
                              <th class="text-right">Pending Val</th>
                              <th class="text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (m of r.rateMatches; track m.rate) {
                              <tr>
                                <td class="td-bold text-center">₹{{ m.rate }}</td>
                                <td><span class="dot dot-orange"></span> {{ m.orderItem }}</td>
                                <td>
                                  @if (m.billItem) {
                                    <span class="dot dot-orange"></span> {{ m.billItem }}
                                    @if (m.challan) { <span class="challan-chip-sm">📦 {{ m.challan }}</span> }
                                  } @else {
                                    <span class="text-gray-400">—</span>
                                  }
                                </td>
                                <td class="td-mono text-center">{{ m.orderQty }}</td>
                                <td class="text-center">
                                  <span class="qty-pill" [class.qty-warn]="m.billQty < m.orderQty">{{ m.billQty }}</span>
                                </td>
                                <td class="text-center">
                                  <span class="diff-pill"
                                        [class.diff-ok]="m.diff === 0"
                                        [class.diff-bad]="m.diff < 0">
                                    {{ m.diff === 0 ? '✓' : (m.diff > 0 ? '+' + m.diff : m.diff) }}
                                  </span>
                                </td>
                                <td class="td-mono text-right">{{ m.pendingVal > 0 ? '₹' + (m.pendingVal | number:'1.2-2') : '—' }}</td>
                                <td class="text-center">
                                  <span class="badge"
                                        [class.b-ok]="m.status === 'pura-billed'"
                                        [class.b-warn]="m.status === 'partial'"
                                        [class.b-danger]="m.status === 'pending'">
                                    {{ m.status === 'pura-billed' ? '✅ Pura Billed' : m.status === 'partial' ? '⚠️ Partial' : '❌ Pending' }}
                                  </span>
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* ANJANINEX PURPLE GRADIENT HEADER */
    .ovb-header {
      background: linear-gradient(135deg, #4a1080 0%, #5c1a8b 50%, #6b21a8 100%);
      color: #fff; padding: 18px 22px; border-radius: 12px; margin-bottom: 16px;
      display: flex; justify-content: space-between; align-items: center;
      box-shadow: 0 4px 12px rgba(74,16,128,.25);
    }
    .ovb-h-left { display: flex; align-items: center; gap: 14px; }
    .ovb-icon { font-size: 28px; }
    .ovb-title { font-size: 18px; font-weight: 800; }
    .ovb-sub { font-size: 11px; opacity: .92; margin-top: 2px; }
    .ovb-h-right { text-align: right; }
    .ovb-meta-line { font-size: 12px; opacity: .92; font-weight: 600; margin: 2px 0; }

    /* KPI SECTIONS */
    .kpi-section { margin-bottom: 14px; }
    .kpi-section-head {
      font-size: 11px; font-weight: 800; color: #6b3fa0; text-transform: uppercase;
      letter-spacing: 1px; margin-bottom: 8px; padding-left: 4px;
    }

    /* SUMMARY CARDS */
    .sum-row { display: grid; gap: 12px; }
    .sum-row.kpi-4 { grid-template-columns: repeat(4, 1fr); }
    .sum-row.kpi-3 { grid-template-columns: repeat(3, 1fr); }
    @media (max-width: 800px) {
      .sum-row.kpi-4, .sum-row.kpi-3 { grid-template-columns: repeat(2, 1fr); }
    }
    .sum-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 10px;
      padding: 10px 12px; position: relative; overflow: hidden;
      box-shadow: 0 2px 6px rgba(92,26,139,.05);
    }
    .sum-card::after {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      border-radius: 10px 10px 0 0;
    }
    .sum-card.c-p::after { background: #5c1a8b; }
    .sum-card.c-a::after { background: #f57c00; }
    .sum-card.c-g::after { background: #16a34a; }
    .sum-card.c-d::after { background: #c62828; }
    .sum-card.c-w::after { background: #f9a825; }
    .sum-label {
      font-size: 10px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .9px; color: #6b3fa0; margin-bottom: 6px;
    }
    .sum-val { font-size: 26px; font-weight: 900; color: #5c1a8b; font-family: monospace; line-height: 1.1; }
    .sum-val.vg { color: #16a34a; } .sum-val.vd { color: #c62828; }
    .sum-val.va { color: #f57c00; } .sum-val.vw { color: #b45309; }
    .sum-sub { font-size: 11px; color: #6b3fa0; margin-top: 4px; font-weight: 600; }

    /* FILTER ROW */
    .ovb-filters {
      display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px;
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 10px; padding: 10px 14px;
    }
    .fil-lbl {
      font-size: 11px; font-weight: 800; color: #5c1a8b;
      text-transform: uppercase; letter-spacing: .5px; margin-right: 4px;
    }
    .filt-sel, .filt-search {
      background: #faf5ff; border: 1.5px solid #ddc8f5; border-radius: 8px;
      padding: 7px 12px; font-size: 12px; font-family: inherit; outline: none;
    }
    .filt-search { flex: 1; min-width: 220px; }

    /* ACTION ROW */
    .ovb-actions {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 14px; padding: 0 4px;
    }
    .act-info { font-size: 12.5px; color: #6b3fa0; font-weight: 600; }
    .act-info b { color: #5c1a8b; font-weight: 800; }
    .act-buttons { display: flex; gap: 8px; }

    .btn-light {
      padding: 7px 14px; border-radius: 8px; border: 1.5px solid #ddc8f5;
      background: #fff; color: #5c1a8b; font-size: 12px; font-weight: 600;
      cursor: pointer; font-family: inherit;
    }
    .btn-light:hover { background: #f0e6ff; }
    .btn-print {
      padding: 7px 14px; border-radius: 8px; border: none; font-size: 12px; font-weight: 600;
      cursor: pointer; font-family: inherit;
      background: linear-gradient(135deg, #4a1080 0%, #5c1a8b 100%);
      color: #fff;
    }

    /* MAIN TABLE */
    .ovb-table-wrap {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      overflow: hidden; box-shadow: 0 2px 10px rgba(92,26,139,.06);
    }
    .ovb-table { width: 100%; border-collapse: collapse; }
    .ovb-table thead tr { background: #f0e6ff; }
    .ovb-table th {
      padding: 10px 11px; font-size: 9px; font-weight: 800; color: #5c1a8b;
      text-transform: uppercase; letter-spacing: .8px; text-align: left;
      border-bottom: 2px solid #ddc8f5;
    }
    .ovb-table td {
      padding: 10px 11px; font-size: 12.5px; color: #2d1040;
      border-bottom: 1px solid rgba(221,200,245,.4); vertical-align: middle;
    }
    .row-main:hover td { background: #fdf8ff; }
    .row-detail td { background: #faf5ff !important; padding: 0; border-bottom: 2px solid #ddc8f5; }

    .td-bold { font-weight: 800; color: #5c1a8b; }
    .td-mono { font-family: monospace; font-weight: 700; }

    .ord-chip {
      display: inline-flex; align-items: center; gap: 4px;
      background: #f0e6ff; color: #5c1a8b; padding: 3px 8px;
      border-radius: 6px; font-size: 11px; font-weight: 700;
    }
    .bill-chip {
      display: inline-flex; align-items: center; gap: 4px;
      background: #f0e6ff; color: #5c1a8b; padding: 3px 8px;
      border-radius: 6px; font-size: 11px; font-weight: 700; margin-bottom: 3px;
    }
    .challan-chip {
      display: inline-flex; align-items: center; gap: 4px;
      background: #e8f5e9; color: #16a34a; padding: 3px 8px;
      border-radius: 6px; font-size: 11px; font-weight: 700;
    }
    .challan-chip-sm {
      display: inline-flex; padding: 2px 7px; border-radius: 5px;
      background: #e8f5e9; color: #16a34a; font-size: 10px; font-weight: 700;
      margin-left: 6px;
    }

    .badge {
      display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 10px;
      font-size: 11px; font-weight: 700; white-space: nowrap;
    }
    .b-ok { background: #dcfce7; color: #16a34a; }
    .b-danger { background: #fde8e8; color: #c62828; }
    .b-warn { background: #fff8e1; color: #b45309; }

    .exp-btn {
      width: 24px; height: 24px; border-radius: 6px; background: #f0e6ff;
      color: #5c1a8b; border: none; cursor: pointer; font-weight: 800;
    }
    .exp-btn:hover { background: #5c1a8b; color: #fff; }

    /* RATE-WISE MATCH BANNER + TABLE */
    .rate-banner {
      background: linear-gradient(90deg, #f0e6ff 0%, #faf5ff 100%);
      padding: 9px 16px; font-size: 12px; font-weight: 700; color: #5c1a8b;
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      border-bottom: 1.5px solid #ddc8f5;
    }
    .rb-divider { color: #b39cc0; }
    .rb-chip {
      background: #fff; padding: 3px 9px; border-radius: 6px;
      font-size: 11px; color: #5c1a8b; border: 1px solid #ddc8f5;
    }
    .rate-table { width: 100%; border-collapse: collapse; background: #fff; }
    .rate-table thead tr { background: #faf5ff; }
    .rate-table th {
      padding: 10px 12px; font-size: 10px; font-weight: 800; color: #6b3fa0;
      text-transform: uppercase; letter-spacing: .8px; text-align: left;
      border-bottom: 2px solid #ddc8f5;
    }
    .rate-table td {
      padding: 14px 12px; font-size: 13.5px; color: #2d1040;
      border-bottom: 1px solid rgba(221,200,245,.3); vertical-align: middle;
    }
    .rate-table tbody tr:hover td { background: #fdf8ff; }
    .rate-table tbody tr:nth-child(even) td { background: rgba(240,230,255,.18); }
    .rate-table tbody tr:nth-child(even):hover td { background: #fdf8ff; }
    /* Bigger, bolder qty numbers */
    .rate-table .td-mono { font-size: 15px; font-weight: 800; }
    .rate-table td.td-bold { font-size: 14px; }

    .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
    .dot-orange { background: #f57c00; }

    /* qty/diff pills inside rate-wise match table */
    .qty-pill {
      display: inline-block; min-width: 44px; padding: 5px 10px;
      background: #f0e6ff; color: #5c1a8b; border-radius: 8px;
      font-family: monospace; font-weight: 800; font-size: 14px;
    }
    .qty-pill.qty-warn { background: #fff3e0; color: #c62828; }

    .diff-pill {
      display: inline-block; min-width: 50px; padding: 5px 10px;
      border-radius: 8px; font-family: monospace; font-weight: 800; font-size: 14px;
    }
    .diff-pill.diff-ok { background: #dcfce7; color: #16a34a; }
    .diff-pill.diff-bad { background: #fde8e8; color: #c62828; }

    @media (max-width: 640px) {
      .ovb-header { flex-wrap: wrap; gap: 12px; padding: 14px 16px; }
      .ovb-h-right { text-align: left; }
      .ovb-filters { padding: 10px; }
      .filt-sel, .filt-search { width: 100% !important; min-width: 0 !important; }
      .ovb-actions { flex-wrap: wrap; gap: 8px; }
      .act-buttons { flex-wrap: wrap; }
      .ovb-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .ovb-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
      .rate-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
      .rate-banner { flex-wrap: wrap; }
    }
  `]
})
export class OrderVsBillReportComponent {
  private trading = inject(TradingService);
  orders = signal<OrderListItem[]>([]);
  allBills = signal<BillListItem[]>([]);
  loading = signal(true);

  statusFilter = '';
  supplierFilter = '';
  buyerFilter = '';
  search = '';

  today(): string {
    return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // Build OrderRow list from orders + bills aggregation
  orderRows = signal<OrderRow[]>([]);

  rebuildRows() {
    const rows: OrderRow[] = this.orders().map(o => {
      // Bill→Order link: bill ka poNumber = order no (direct link).
      // Fallback: same supplier ka bill jiska order na juda ho.
      let matchingBills = this.allBills().filter(b =>
        (b.poNumber || '').trim().toLowerCase() === o.orderNo.trim().toLowerCase());
      if (matchingBills.length === 0) {
        matchingBills = this.allBills().filter(b =>
          !b.poNumber && b.partyId === o.partyId &&
          (b.buyerName || '') === (o.buyerName || ''));
      }
      const billNos = matchingBills.map(b => b.supplierBillNo || b.billNo);   // SUPP bill no display
      const billValue = matchingBills.reduce((s, b) => s + (b.total || 0), 0);
      const ratio = o.total > 0 ? Math.min(1, billValue / o.total) : 0;
      let status: 'pura-billed' | 'partial' | 'pending';
      if (o.status === 'billed' || ratio >= 0.99) status = 'pura-billed';
      else if (ratio > 0) status = 'partial';
      else status = 'pending';

      // ord qty / bill qty placeholders — will be filled when order is expanded (fetch details)
      return {
        id: o.id,
        orderNo: o.orderNo,
        orderDate: o.orderDate,
        supplierOrderNo: null,    // populated on expand
        supplierName: o.partyName,
        buyerName: o.buyerName || '—',
        billNos,
        challanNos: [],            // populated on expand from challan field
        ordQty: 0,                 // populated on expand
        ordValue: o.total,
        billQty: 0,                // populated on expand
        billValue,
        status,
        expanded: false,
        rateMatches: [],
        loaded: false
      };
    });
    // Order no ke number se sort — JPR-O1, O2, O3... line se
    const num = (s: string) => { const m = (s || '').match(/(\d+)\s*$/); return m ? +m[1] : 0; };
    rows.sort((a, b) => num(a.orderNo) - num(b.orderNo));
    this.orderRows.set(rows);
  }

  filteredRows(): OrderRow[] {
    const all = this.orderRows();
    const q = this.search.toLowerCase().trim();
    return all.filter(r => {
      if (this.statusFilter && r.status !== this.statusFilter) return false;
      if (this.supplierFilter && r.supplierName !== this.supplierFilter) return false;
      if (this.buyerFilter && r.buyerName !== this.buyerFilter) return false;
      if (q) {
        const hay = (r.orderNo + ' ' + r.supplierName + ' ' + r.buyerName + ' ' + r.billNos.join(' ')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  uniqueSuppliers(): string[] {
    return [...new Set(this.orderRows().map(r => r.supplierName))].sort();
  }
  uniqueBuyers(): string[] {
    return [...new Set(this.orderRows().map(r => r.buyerName))].sort();
  }

  countByStatus(s: string): number {
    return this.orderRows().filter(r => r.status === s).length;
  }
  totalOrderQty(): number {
    return this.orderRows().reduce((s, r) => s + r.ordQty, 0);
  }
  totalBilledQty(): number {
    return this.orderRows().reduce((s, r) => s + r.billQty, 0);
  }
  totalPendingQty(): number {
    return this.totalOrderQty() - this.totalBilledQty();
  }
  billedPct(): number {
    const t = this.totalOrderQty();
    return t > 0 ? Math.round((this.totalBilledQty() / t) * 100) : 0;
  }
  pendingPct(): number {
    return 100 - this.billedPct();
  }

  toggle(r: OrderRow) {
    r.expanded = !r.expanded;
    if (r.expanded && !r.loaded) {
      this.loadDetails(r);
    }
    // trigger view update
    this.orderRows.set([...this.orderRows()]);
  }
  expandAll() {
    const rows = this.orderRows();
    rows.forEach(r => {
      r.expanded = true;
      if (!r.loaded) this.loadDetails(r);
    });
    this.orderRows.set([...rows]);
  }
  collapseAll() {
    const rows = this.orderRows();
    rows.forEach(r => r.expanded = false);
    this.orderRows.set([...rows]);
  }

  // Fetch order detail + matching bill details to build rate-wise match
  loadDetails(r: OrderRow) {
    const orderRq = this.trading.getOrder(r.id);
    // Get all bills for this buyer to find matching items
    const billRqs = r.billNos.map(no => {
      const b = this.allBills().find(x => (x.supplierBillNo || x.billNo) === no);
      return b ? this.trading.getBill(b.id) : null;
    }).filter(Boolean) as any[];

    if (billRqs.length === 0) {
      orderRq.subscribe({
        next: (od: OrderDetail) => {
          r.supplierOrderNo = od.supplierOrderNo;
          r.ordQty = od.lines.reduce((s, l) => s + (l.qty || 0), 0);
          r.rateMatches = od.lines.map(l => ({
            rate: l.rate,
            orderItem: l.itemName,
            orderQty: l.qty,
            billItem: '',
            billQty: 0,
            diff: -l.qty,
            pendingVal: l.totalAmount,
            status: 'pending' as const,
            challan: null
          }));
          r.loaded = true;
          this.orderRows.set([...this.orderRows()]);
        }
      });
      return;
    }

    forkJoin([orderRq, ...billRqs]).subscribe({
      next: (results: any[]) => {
        const od = results[0] as OrderDetail;
        const billDetails = results.slice(1) as BillDetail[];

        r.supplierOrderNo = od.supplierOrderNo;
        r.ordQty = od.lines.reduce((s, l) => s + (l.qty || 0), 0);
        r.billQty = billDetails.reduce((s, b) => s + b.lines.reduce((q, l) => q + (l.qty || 0), 0), 0);

        // Build a flat bill-line list with rate key (for exact-rate match attempts)
        const billLinesByRate = new Map<number, { item: string; qty: number; challan: string | null }[]>();
        billDetails.forEach(b => {
          b.lines.forEach(l => {
            const arr = billLinesByRate.get(l.rate) || [];
            arr.push({ item: l.itemName, qty: l.qty, challan: b.poNumber });
            billLinesByRate.set(l.rate, arr);
          });
        });

        // Pre-compute totals + bill item summary (for fallback when rate doesn't match)
        const totalOrdQty = r.ordQty || 1;       // avoid /0
        const totalBillQty = r.billQty;
        const billItemSummary = billDetails
          .flatMap(b => b.lines.map(l => l.itemName))
          .slice(0, 2).join(', ') + (billDetails.flatMap(b => b.lines).length > 2 ? ', …' : '');
        const firstChallan = billDetails[0]?.poNumber || null;

        r.rateMatches = od.lines.map(l => {
          // 1st preference: exact rate match
          const exactMatches = billLinesByRate.get(l.rate) || [];
          let billItem: string;
          let billQty: number;
          let challan: string | null;

          if (exactMatches.length > 0) {
            billItem = exactMatches[0].item;
            billQty = exactMatches.reduce((s, m) => s + m.qty, 0);
            challan = exactMatches[0].challan;
          } else {
            // Fallback: pro-rata distribution of total bill qty across order lines
            billQty = Math.round((l.qty / totalOrdQty) * totalBillQty);
            billItem = billItemSummary || '';
            challan = firstChallan;
          }

          const diff = billQty - l.qty;
          const pendingVal = diff < 0 ? Math.abs(diff) * l.rate : 0;
          let st: 'pura-billed' | 'partial' | 'pending';
          if (billQty >= l.qty) st = 'pura-billed';
          else if (billQty > 0) st = 'partial';
          else st = 'pending';

          return {
            rate: l.rate,
            orderItem: l.itemName,
            orderQty: l.qty,
            billItem,
            billQty,
            diff,
            pendingVal,
            status: st,
            challan
          };
        });

        r.loaded = true;
        this.orderRows.set([...this.orderRows()]);
      }
    });
  }

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    forkJoin([
      this.trading.listOrders({ size: 200 }),
      this.trading.listBills({ size: 500 })
    ]).subscribe({
      next: ([orderRes, billRes]) => {
        // deleted orders/bills report me NAHI aane chahiye
        this.orders.set(orderRes.items.filter(o => !o.isDeleted));
        this.allBills.set(billRes.items.filter(b => !b.isDeleted));
        this.rebuildRows();
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
  printPage() { window.print(); }
}

// =============================================================================
// PENDING ORDERS REPORT — orders placed but not yet dispatched
// =============================================================================
interface PendingOrderRow {
  id: string;
  orderNo: string;
  orderDate: string;
  buyer: string;
  city: string;
  supplier: string;
  item: string;
  ordQty: number;
  dispatched: number;
  pendingQty: number;
  orderValue: number;
  pendingValue: number;
  daysOld: number;
  status: 'ready' | 'overdue' | 'on-hold' | 'partial';
}

@Component({
  selector: 'app-pending-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, InDatePipe, WaSendComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      ${subNav}

      <!-- HEADER -->
      <div class="rpt-header-card">
        <div class="rh-top">
          <div class="rh-icon">📦</div>
          <div class="flex-1">
            <div class="rh-title">Pending Orders Report</div>
            <div class="rh-sub">Orders placed but not yet dispatched</div>
          </div>
          <div class="rh-actions">
            <button class="btn-print" (click)="printPage()">🖨️ Print</button>
            <button class="btn-export" (click)="exportCsv()">⬇️ CSV</button>
            <app-wa-send [message]="waMessage()" [suggestedPhone]="waPhone()"></app-wa-send>
          </div>
        </div>

        <div class="filters">
          <div class="fl">
            <label>From</label>
            <input type="date" [(ngModel)]="fromDate" (change)="load()">
          </div>
          <span class="sep">–</span>
          <div class="fl">
            <label>To</label>
            <input type="date" [(ngModel)]="toDate" (change)="load()">
          </div>
          <div class="fl">
            <label>Buyer</label>
            <select [(ngModel)]="buyerFilter">
              <option value="">All Buyers</option>
              @for (b of uniqueBuyers(); track b) { <option [value]="b">{{ b }}</option> }
            </select>
          </div>
          <div class="fl">
            <label>City</label>
            <select [(ngModel)]="cityFilter">
              <option value="">All Cities</option>
              @for (c of uniqueCities(); track c) { <option [value]="c">{{ c }}</option> }
            </select>
          </div>
          <button class="btn-apply" (click)="load()">Apply</button>
          <button class="btn-reset" (click)="reset()">Reset</button>
        </div>
      </div>

      <!-- ALERT BANNER -->
      @if (overdueCount() > 0) {
        <div class="alert-banner">
          🚨 <b>{{ overdueCount() }} orders overdue 15+ days</b> — follow-up required!
        </div>
      }

      <!-- 5 KPI CARDS -->
      <div class="sum-row">
        <div class="sum-card c-p">
          <div class="sum-label">Total Pending</div>
          <div class="sum-val">{{ filteredRows().length }}</div>
        </div>
        <div class="sum-card c-p">
          <div class="sum-label">Total Value</div>
          <div class="sum-val">₹{{ totalValue() | number:'1.0-0' }}</div>
        </div>
        <div class="sum-card c-d">
          <div class="sum-label">Overdue 15+ Days</div>
          <div class="sum-val vd">{{ overdueCount() }}</div>
          <div class="sum-sub">₹{{ overdueValue() | number:'1.0-0' }}</div>
        </div>
        <div class="sum-card c-w">
          <div class="sum-label">On Hold</div>
          <div class="sum-val vw">{{ countByStatus('on-hold') }}</div>
        </div>
        <div class="sum-card c-g">
          <div class="sum-label">Ready to Dispatch</div>
          <div class="sum-val vg">{{ countByStatus('ready') }}</div>
        </div>
      </div>

      <!-- TAB STRIP -->
      <div class="tab-strip">
        <button class="tab-btn" [class.tab-active]="activeTab === 'all'" (click)="activeTab = 'all'">
          All <span class="tab-cnt">{{ allRows().length }}</span>
        </button>
        <button class="tab-btn" [class.tab-active]="activeTab === 'ready'" (click)="activeTab = 'ready'">
          Ready ✓ <span class="tab-cnt">{{ countByStatus('ready') }}</span>
        </button>
        <button class="tab-btn" [class.tab-active]="activeTab === 'overdue'" (click)="activeTab = 'overdue'">
          Overdue <span class="tab-cnt">{{ countByStatus('overdue') }}</span>
        </button>
        <button class="tab-btn" [class.tab-active]="activeTab === 'on-hold'" (click)="activeTab = 'on-hold'">
          On Hold <span class="tab-cnt">{{ countByStatus('on-hold') }}</span>
        </button>
        <button class="tab-btn" [class.tab-active]="activeTab === 'partial'" (click)="activeTab = 'partial'">
          Partial <span class="tab-cnt">{{ countByStatus('partial') }}</span>
        </button>
      </div>

      <!-- SEARCH -->
      <div class="search-row">
        <span class="search-ico">🔍</span>
        <input type="text" [(ngModel)]="search" placeholder="Order No, Party, City, Item...">
      </div>

      <!-- TABLE -->
      <div class="t-card">
        @if (loading()) {
          <div class="p-8 text-center text-gray-500">Loading…</div>
        } @else if (filteredRows().length === 0) {
          <div class="p-8 text-center text-gray-500">🎉 No pending orders matching filters</div>
        } @else {
          <table class="p-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Order No</th>
                <th>Date</th>
                <th>Buyer</th>
                <th>City</th>
                <th>Supplier</th>
                <th>Item</th>
                <th class="text-right">Ord Qty</th>
                <th class="text-right">Dispatched</th>
                <th class="text-right">Pending Qty</th>
                <th class="text-right">Order Value</th>
                <th class="text-right">Pending Value</th>
                <th class="text-center">Days</th>
              </tr>
            </thead>
            <tbody>
              @for (r of filteredRows(); track r.id; let i = $index) {
                <tr [class.row-overdue]="r.status === 'overdue'" [class.row-ready]="r.status === 'ready'" [class.row-onhold]="r.status === 'on-hold'">
                  <td class="td-soft">{{ i + 1 }}</td>
                  <td class="td-bold">{{ r.orderNo }}</td>
                  <td class="td-mono text-xs">{{ r.orderDate | inDate }}</td>
                  <td class="td-bold">{{ r.buyer }}</td>
                  <td>{{ r.city || '—' }}</td>
                  <td class="text-[#f57c00] font-semibold">{{ r.supplier }}</td>
                  <td>{{ r.item || '—' }}</td>
                  <td class="td-mono text-right">{{ r.ordQty }}</td>
                  <td class="td-mono text-right text-green-700">{{ r.dispatched }}</td>
                  <td class="td-mono text-right" [class.text-red-600]="r.pendingQty > 0">{{ r.pendingQty }}</td>
                  <td class="td-mono text-right">₹{{ r.orderValue | number:'1.0-0' }}</td>
                  <td class="td-mono text-right" [class.text-red-700]="r.pendingValue > 0">₹{{ r.pendingValue | number:'1.0-0' }}</td>
                  <td class="text-center">
                    <div class="days-vis">
                      <div class="days-bar" [style.width.px]="daysBarWidth(r.daysOld)" [style.background]="daysBarColor(r.daysOld)"></div>
                      <span class="days-num" [class.text-red-600]="r.daysOld > 15">{{ r.daysOld }}d</span>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="7" class="text-right">TOTAL</td>
                <td class="td-mono text-right">{{ totalOrdQty() }}</td>
                <td class="td-mono text-right">{{ totalDispatched() }}</td>
                <td class="td-mono text-right text-red-700">{{ totalPendingQty() }}</td>
                <td class="td-mono text-right">₹{{ totalValue() | number:'1.0-0' }}</td>
                <td class="td-mono text-right text-red-700">₹{{ totalPendingValue() | number:'1.0-0' }}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .rpt-header-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      padding: 14px 20px; margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(92,26,139,0.06);
    }
    .rh-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .rh-icon {
      width: 38px; height: 38px; border-radius: 10px; background: #f0e6ff;
      display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    .rh-title { font-size: 17px; font-weight: 800; color: #5c1a8b; }
    .rh-sub { font-size: 11px; color: #6b3fa0; margin-top: 2px; }
    .rh-actions { display: flex; gap: 8px; }
    .btn-print, .btn-export {
      padding: 7px 14px; border-radius: 8px; border: none; font-size: 12px; font-weight: 600;
      cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-family: inherit;
    }
    .btn-print { background: #f0e6ff; color: #5c1a8b; border: 1.5px solid #ddc8f5; }
    .btn-print:hover { background: #5c1a8b; color: #fff; }
    .btn-export { background: #f57c00; color: #fff; }
    .btn-export:hover { background: #e65100; }

    .filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .fl { display: flex; align-items: center; gap: 5px; }
    .fl label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .5px; color: #6b3fa0;
    }
    .fl input[type=date], .fl select {
      background: #faf5ff; border: 1.5px solid #ddc8f5; border-radius: 8px;
      padding: 5px 9px; font-size: 12px; color: #2d1040; font-family: inherit; outline: none;
    }
    .fl input[type=date] { width: 120px; }
    .sep { color: #b39cc0; font-size: 12px; }
    .btn-apply {
      background: #5c1a8b; color: #fff; border: none; padding: 5px 14px;
      border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
    }
    .btn-reset {
      background: #f0e6ff; color: #6b3fa0; border: 1px solid #ddc8f5;
      padding: 5px 10px; border-radius: 8px; font-size: 12px; cursor: pointer;
    }

    .alert-banner {
      background: #fde8e8; border: 1.5px solid #f5c6c6; border-radius: 10px;
      padding: 10px 16px; margin-bottom: 14px; font-size: 13px; color: #c62828; font-weight: 600;
    }

    .sum-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 16px; }
    @media (max-width: 1000px) { .sum-row { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 600px) { .sum-row { grid-template-columns: repeat(2, 1fr); } }
    .sum-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      padding: 12px 16px; position: relative; overflow: hidden;
      box-shadow: 0 2px 8px rgba(92,26,139,.06);
    }
    .sum-card::after {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      border-radius: 12px 12px 0 0;
    }
    .sum-card.c-p::after { background: #5c1a8b; }
    .sum-card.c-a::after { background: #f57c00; }
    .sum-card.c-g::after { background: #16a34a; }
    .sum-card.c-d::after { background: #c62828; }
    .sum-card.c-w::after { background: #f9a825; }
    .sum-label {
      font-size: 9px; font-weight: 800; text-transform: uppercase;
      letter-spacing: .9px; color: #b39cc0; margin-bottom: 5px;
    }
    .sum-val { font-size: 20px; font-weight: 800; color: #5c1a8b; font-family: monospace; }
    .sum-val.vg { color: #16a34a; } .sum-val.vd { color: #c62828; }
    .sum-val.va { color: #f57c00; } .sum-val.vw { color: #b45309; }
    .sum-sub { font-size: 11px; color: #c62828; margin-top: 2px; font-family: monospace; font-weight: 700; }

    .tab-strip { display: flex; gap: 0; margin-bottom: 12px; background: #fff;
      border: 1.5px solid #ddc8f5; border-radius: 10px; overflow: hidden; width: fit-content; }
    .tab-btn {
      padding: 9px 18px; font-size: 12.5px; font-weight: 700; cursor: pointer;
      color: #6b3fa0; border-right: 1px solid #ddc8f5; border-left: none; border-top: none; border-bottom: none;
      background: #fff; display: flex; align-items: center; gap: 8px; font-family: inherit;
    }
    .tab-btn:last-child { border-right: none; }
    .tab-btn:hover { background: #f0e6ff; color: #5c1a8b; }
    .tab-btn.tab-active { background: #5c1a8b; color: #fff; }
    .tab-cnt {
      font-size: 10px; padding: 2px 7px; border-radius: 8px; background: #f0e6ff;
      color: #5c1a8b; font-family: monospace;
    }
    .tab-active .tab-cnt { background: rgba(255,255,255,.25); color: #fff; }

    .search-row {
      display: flex; align-items: center; gap: 8px; background: #fff;
      border: 1.5px solid #ddc8f5; border-radius: 20px; padding: 8px 16px;
      margin-bottom: 14px; max-width: 360px;
    }
    .search-row input {
      background: none; border: none; outline: none; flex: 1;
      font-size: 12.5px; color: #2d1040; font-family: inherit;
    }
    .search-ico { color: #b39cc0; }

    .t-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      overflow: hidden; box-shadow: 0 2px 10px rgba(92,26,139,.06);
    }
    .p-table { width: 100%; border-collapse: collapse; }
    .p-table thead tr { background: #f0e6ff; }
    .p-table th {
      padding: 10px 11px; font-size: 9px; font-weight: 800; color: #6b3fa0;
      text-transform: uppercase; letter-spacing: .8px; text-align: left;
      border-bottom: 2px solid #ddc8f5;
    }
    .p-table td {
      padding: 10px 11px; font-size: 12.5px; color: #2d1040;
      border-bottom: 1px solid rgba(221,200,245,.35);
    }
    .p-table tbody tr.row-overdue { border-left: 3px solid #c62828; }
    .p-table tbody tr.row-ready { border-left: 3px solid #16a34a; }
    .p-table tbody tr.row-onhold { border-left: 3px solid #f9a825; }
    .p-table tbody tr:hover td { background: #fdf8ff; }
    .p-table tfoot td {
      background: #f0e6ff; font-weight: 800; font-size: 12.5px;
      color: #5c1a8b; border-top: 2px solid #ddc8f5;
    }
    .td-bold { font-weight: 800; color: #5c1a8b; }
    .td-mono { font-family: monospace; font-weight: 700; }
    .td-soft { color: #6b3fa0; font-family: monospace; }

    .days-vis { display: flex; align-items: center; gap: 6px; justify-content: center; }
    .days-bar { height: 6px; min-width: 8px; border-radius: 3px; }
    .days-num { font-family: monospace; font-weight: 700; font-size: 12px; min-width: 30px; }

    @media (max-width: 640px) {
      .rpt-header-card { padding: 12px 14px; }
      .rh-top { flex-wrap: wrap; }
      .rh-actions { flex-wrap: wrap; width: 100%; }
      .filters { gap: 8px; }
      .fl { flex-wrap: wrap; }
      .fl input[type=date], .fl select { width: 100% !important; }
      .sum-row { grid-template-columns: 1fr !important; }
      .tab-strip { width: 100%; flex-wrap: wrap; }
      .search-row { max-width: 100%; }
      .t-card { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .p-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
    }
  `]
})
export class PendingOrdersReportComponent {
  private trading = inject(TradingService);
  features = inject(FeatureService);
  orders = signal<OrderListItem[]>([]);
  parties = signal<Party[]>([]);
  bills = signal<BillListItem[]>([]);
  loading = signal(true);

  fromDate = '2000-01-01';   // default: SAARE records (pehle pichla FY tha — purane bill gayab dikhte the)
  toDate = new Date().toISOString().split('T')[0];
  buyerFilter = '';
  cityFilter = '';
  activeTab: 'all' | 'ready' | 'overdue' | 'on-hold' | 'partial' = 'all';
  search = '';

  // Build pending order rows (exclude completed/cancelled)
  allRows(): PendingOrderRow[] {
    const today = new Date();
    const partyMap = new Map(this.parties().map(p => [p.id, p]));
    const billValueByBuyer = new Map<string, number>();
    for (const b of this.bills()) {
      billValueByBuyer.set(b.partyId, (billValueByBuyer.get(b.partyId) || 0) + (b.total || 0));
    }

    return this.orders()
      // BILLED orders pending nahi hote — yahan sirf sach me pending orders
      .filter(o => o.status !== 'completed' && o.status !== 'cancelled' && o.status !== 'billed')
      .map(o => {
        const buyerParty = partyMap.get(o.buyerPartyId || o.partyId);
        const orderDate = new Date(o.orderDate);
        const daysOld = Math.max(0, Math.round((today.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)));
        const orderValue = o.total || 0;
        const billed = billValueByBuyer.get(o.buyerPartyId || o.partyId) || 0;
        // Estimate dispatched as proportion of billed/total bills for buyer (rough)
        const dispatchedRatio = orderValue > 0 ? Math.min(1, billed / orderValue) : 0;
        const ordQty = Math.round(orderValue / 1000) || 100;  // rough estimate
        const dispatched = Math.round(ordQty * dispatchedRatio);
        const pendingQty = ordQty - dispatched;
        const pendingValue = orderValue * (1 - dispatchedRatio);

        let status: PendingOrderRow['status'];
        if (daysOld > 15) status = 'overdue';
        else if (o.status === 'on-hold' || o.status === 'on_hold') status = 'on-hold';
        else if (dispatchedRatio > 0 && dispatchedRatio < 1) status = 'partial';
        else status = 'ready';

        return {
          id: o.id,
          orderNo: o.orderNo,
          orderDate: o.orderDate,
          buyer: o.buyerName || '—',
          city: buyerParty?.city || '',
          supplier: o.partyName,        // asli supplier — Namokara to broker hai
          item: '—',
          ordQty,
          dispatched,
          pendingQty,
          orderValue,
          pendingValue,
          daysOld,
          status
        };
      })
      // Order no ke number se sort — line se
      .sort((a, b) => {
        const num = (s: string) => { const m = (s || '').match(/(\d+)\s*$/); return m ? +m[1] : 0; };
        return num(a.orderNo) - num(b.orderNo);
      });
  }

  filteredRows(): PendingOrderRow[] {
    const all = this.allRows();
    const q = this.search.toLowerCase().trim();
    return all.filter(r => {
      if (this.activeTab !== 'all' && r.status !== this.activeTab) return false;
      if (this.buyerFilter && r.buyer !== this.buyerFilter) return false;
      if (this.cityFilter && r.city !== this.cityFilter) return false;
      if (q) {
        const hay = (r.orderNo + ' ' + r.buyer + ' ' + r.city + ' ' + r.supplier + ' ' + r.item).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  uniqueBuyers(): string[] {
    return [...new Set(this.allRows().map(r => r.buyer))].sort();
  }
  uniqueCities(): string[] {
    return [...new Set(this.allRows().map(r => r.city).filter(Boolean))].sort();
  }

  countByStatus(s: string): number {
    return this.allRows().filter(r => r.status === s).length;
  }
  totalValue = () => this.filteredRows().reduce((s, r) => s + r.orderValue, 0);
  totalPendingValue = () => this.filteredRows().reduce((s, r) => s + r.pendingValue, 0);
  totalOrdQty = () => this.filteredRows().reduce((s, r) => s + r.ordQty, 0);
  totalDispatched = () => this.filteredRows().reduce((s, r) => s + r.dispatched, 0);
  totalPendingQty = () => this.filteredRows().reduce((s, r) => s + r.pendingQty, 0);
  overdueCount = () => this.allRows().filter(r => r.daysOld > 15).length;
  overdueValue = () => this.allRows().filter(r => r.daysOld > 15).reduce((s, r) => s + r.pendingValue, 0);

  daysBarWidth(d: number): number {
    return Math.min(60, Math.max(8, d * 0.8));
  }
  daysBarColor(d: number): string {
    if (d <= 7) return '#16a34a';
    if (d <= 15) return '#f9a825';
    return '#c62828';
  }

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.trading.listParties().subscribe({ next: (p) => this.parties.set(p) });
    forkJoin([
      this.trading.listOrders({ from: this.fromDate, to: this.toDate, size: 200 }),
      this.trading.listBills({ from: this.fromDate, to: this.toDate, size: 500 })
    ]).subscribe({
      next: ([orderRes, billRes]) => {
        // deleted orders/bills report me NAHI aane chahiye
        this.orders.set(orderRes.items.filter(o => !o.isDeleted));
        this.bills.set(billRes.items.filter(b => !b.isDeleted));
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
  reset() {
    this.fromDate = '2000-01-01';   // saare records
    this.toDate = new Date().toISOString().split('T')[0];
    this.buyerFilter = '';
    this.cityFilter = '';
    this.activeTab = 'all';
    this.search = '';
    this.load();
  }
  printPage() { window.print(); }

  // ── WhatsApp share ──
  private fmt(d: string): string {
    if (!d) return '—';
    const [y, m, dd] = d.split('-');
    return `${dd}/${m}/${(y || '').slice(-2)}`;
  }
  waMessage(): string {
    const rows = this.filteredRows();
    if (!rows.length) return '';
    const upto = this.fmt(this.toDate || new Date().toISOString().split('T')[0]);
    const partyLine = this.buyerFilter || 'Sabhi parties';
    const lines: string[] = [`*Pending Orders Report* (${upto} tak)`, partyLine];
    const max = 15;
    rows.slice(0, max).forEach((r, i) => {
      lines.push(`${i + 1}. ${r.orderNo} · ${this.fmt(r.orderDate)} · ${r.buyer} · ₹${Math.round(r.pendingValue || 0).toLocaleString('en-IN')} · ${r.daysOld} din (${r.status})`);
    });
    if (rows.length > max) lines.push(`+${rows.length - max} aur...`);
    lines.push('------------------');
    lines.push(`Total Pending Value: ₹${Math.round(this.totalPendingValue()).toLocaleString('en-IN')}`);
    lines.push('- ' + (this.features.firmName() || 'Anjaninex'));
    return lines.join('\n');
  }
  waPhone(): string | null {
    // Single buyer filter ho to us buyer ka phone suggest karo
    if (!this.buyerFilter) return null;
    const p = this.parties().find(x => x.displayName === this.buyerFilter);
    return p?.phone || null;
  }

  exportCsv() {
    const rows = this.filteredRows();
    const header = ['#','Order No','Date','Buyer','City','Supplier','Item','Ord Qty','Dispatched','Pending Qty','Order Value','Pending Value','Days'];
    const lines = [header.map(csvCell).join(',')];
    rows.forEach((r, i) => {
      lines.push([
        i + 1, r.orderNo, r.orderDate, r.buyer, (r.city || ''),
        r.supplier, r.item,
        r.ordQty, r.dispatched, r.pendingQty, r.orderValue, r.pendingValue, r.daysOld
      ].map(csvCell).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Pending_Orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }
}

// =============================================================================
// PARTY WISE REPORTS — Supplier / Buyer / City wise with expandable rows
// =============================================================================
interface PartyGroupRow {
  key: string;            // party id or city name
  name: string;
  city: string;
  billCount: number;
  totalBill: number;
  totalPaid: number;
  totalPending: number;
  status: 'paid' | 'partial' | 'pending';
  bills: SalesRegisterRow[];
  partiesCount?: number;  // for city wise
  expanded: boolean;
}

@Component({
  selector: 'app-party-wise',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, InDatePipe, WaSendComponent],
  template: `
    <div class="max-w-7xl mx-auto">
      ${subNav}

      <!-- DARK PURPLE HEADER -->
      <div class="pw-header">
        <div class="pwh-left">
          <div class="pwh-ico">📋</div>
          <div class="pwh-title">Party Wise Reports</div>
          <span class="pwh-live">● Live</span>
        </div>
        <div class="pwh-right">{{ today() }}</div>
      </div>

      <div class="pw-body">
        <!-- LEFT SIDEBAR (3 tabs) -->
        <aside class="pw-sidebar">
          <div class="sb-hd">PARTY</div>
          <button class="sb-item" [class.active]="tab() === 'supplier'" (click)="tab.set('supplier')">
            <span>🏭 Supplier Wise</span>
            <span class="sb-cnt">{{ supplierRows().length }}</span>
          </button>
          <button class="sb-item" [class.active]="tab() === 'buyer'" (click)="tab.set('buyer')">
            <span>🛒 Buyer Wise</span>
            <span class="sb-cnt">{{ buyerRows().length }}</span>
          </button>
          <button class="sb-item" [class.active]="tab() === 'city'" (click)="tab.set('city')">
            <span>📍 City Wise</span>
            <span class="sb-cnt">{{ cityRows().length }}</span>
          </button>
        </aside>

        <!-- MAIN PANEL -->
        <main class="pw-main">
          @if (tab() === 'supplier') {
            <ng-container *ngTemplateOutlet="partySection; context: {
              title: 'Supplier Wise',
              sub: 'Har supplier ke saath total bills, paid aur pending amounts',
              countLabel: 'Total Suppliers',
              rows: supplierRows(),
              isCity: false
            }"></ng-container>
          } @else if (tab() === 'buyer') {
            <ng-container *ngTemplateOutlet="partySection; context: {
              title: 'Buyer Wise',
              sub: 'Har buyer ke total orders, bills aur outstanding',
              countLabel: 'Total Buyers',
              rows: buyerRows(),
              isCity: false
            }"></ng-container>
          } @else {
            <ng-container *ngTemplateOutlet="partySection; context: {
              title: 'City Wise',
              sub: 'City-wise total parties, bills aur amounts',
              countLabel: 'Total Cities',
              rows: cityRows(),
              isCity: true
            }"></ng-container>
          }
        </main>
      </div>

      <!-- PARTY SECTION TEMPLATE -->
      <ng-template #partySection let-title="title" let-sub="sub" let-countLabel="countLabel" let-rows="rows" let-isCity="isCity">
        <div class="sec-head">
          <div>
            <div class="sec-title">{{ title }}</div>
            <div class="sec-sub">{{ sub }}</div>
          </div>
          <div class="sec-actions">
            <button class="btn-light" (click)="expandAll(rows)">▾ Sabhi Expand</button>
            <button class="btn-light" (click)="collapseAll(rows)">▸ Sabhi Collapse</button>
            <button class="btn-print" (click)="printPage()">🖨️ Print</button>
            <app-wa-send [message]="waMessage()" [suggestedPhone]="waPhone()"></app-wa-send>
          </div>
        </div>

        <!-- 7 KPI cards -->
        <div class="kpi-grid">
          <div class="kpi-card c-p"><div class="kpi-lbl">{{ countLabel }}</div><div class="kpi-val">{{ rows.length }}</div></div>
          <div class="kpi-card c-p"><div class="kpi-lbl">Total Bills</div><div class="kpi-val">{{ sumBills(rows) }}</div></div>
          <div class="kpi-card c-p"><div class="kpi-lbl">Total Bill Amt</div><div class="kpi-val">₹{{ sumField(rows, 'totalBill') | number:'1.2-2' }}</div></div>
          <div class="kpi-card c-g"><div class="kpi-lbl">Total Paid</div><div class="kpi-val vg">₹{{ sumField(rows, 'totalPaid') | number:'1.2-2' }}</div></div>
          <div class="kpi-card c-d"><div class="kpi-lbl">Total Pending</div><div class="kpi-val vd">₹{{ sumField(rows, 'totalPending') | number:'1.2-2' }}</div></div>
          <div class="kpi-card c-g"><div class="kpi-lbl">✅ Paid</div><div class="kpi-val vg">{{ countStatus(rows, 'paid') }}</div></div>
          <div class="kpi-card c-w"><div class="kpi-lbl">⚠️ Partial</div><div class="kpi-val vw">{{ countStatus(rows, 'partial') }}</div></div>
          <div class="kpi-card c-d"><div class="kpi-lbl">❌ Pending</div><div class="kpi-val vd">{{ countStatus(rows, 'pending') }}</div></div>
        </div>

        <!-- date filter row -->
        <div class="search-bar" style="margin-bottom:8px">
          <label class="pw-date-lbl">FROM</label>
          <input type="date" [(ngModel)]="fromDate" class="srch-sel">
          <label class="pw-date-lbl">TO</label>
          <input type="date" [(ngModel)]="toDate" class="srch-sel">
          <button type="button" (click)="load()" class="pw-apply">Apply</button>
          <button type="button" (click)="resetDates()" class="pw-reset">Reset</button>
        </div>

        <!-- search row -->
        <div class="search-bar">
          <input type="text" [(ngModel)]="search" [placeholder]="(isCity ? 'City naam' : (tab() === 'supplier' ? 'Supplier' : 'Buyer') + ' ID ya naam') + ' se khojein...'" class="srch">
          <select [(ngModel)]="statusFilter" class="srch-sel">
            <option value="">Sabhi</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <!-- table -->
        <div class="pw-table-wrap">
          @if (loading()) {
            <div class="p-8 text-center text-gray-500">Loading…</div>
          } @else if (filteredGroups(rows).length === 0) {
            <div class="p-8 text-center text-gray-500">No data matches your filters</div>
          } @else {
            <table class="pw-table">
              <thead>
                <tr>
                  <th style="width:30px"></th>
                  <th>S.NO</th>
                  <th>{{ isCity ? 'City' : (tab() === 'supplier' ? 'Supplier Name' : 'Buyer Name') }}</th>
                  @if (isCity) { <th class="text-center">Parties</th> }
                  <th class="text-center">Bills</th>
                  <th class="text-right">Total Bill Amt</th>
                  <th class="text-right">Total Paid</th>
                  <th class="text-right">Total Pending</th>
                  <th class="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (g of filteredGroups(rows); track g.key; let i = $index) {
                  <tr class="grp-main">
                    <td><button class="exp-btn" (click)="toggleGroup(g)">{{ g.expanded ? '▾' : '▸' }}</button></td>
                    <td class="td-mono">{{ i + 1 }}</td>
                    <td>
                      <div class="td-bold">{{ g.name }}</div>
                      @if (g.city) { <div class="td-city">📍 {{ g.city }}</div> }
                    </td>
                    @if (isCity) { <td class="text-center"><span class="pcnt-chip">{{ g.partiesCount }} parties</span></td> }
                    <td class="text-center"><span class="bcnt-chip">{{ g.billCount }}</span></td>
                    <td class="td-mono text-right">₹{{ g.totalBill | number:'1.2-2' }}</td>
                    <td class="td-mono td-paid text-right">₹{{ g.totalPaid | number:'1.2-2' }}</td>
                    <td class="td-mono td-pending text-right">₹{{ g.totalPending | number:'1.2-2' }}</td>
                    <td class="text-center">
                      <span class="badge"
                            [class.b-ok]="g.status === 'paid'"
                            [class.b-warn]="g.status === 'partial'"
                            [class.b-danger]="g.status === 'pending'">
                        {{ g.status === 'paid' ? '✅ Paid' : g.status === 'partial' ? '⚠️ Partial' : '❌ Pending' }}
                      </span>
                    </td>
                  </tr>
                  @if (g.expanded) {
                    <tr class="grp-detail">
                      <td [attr.colspan]="isCity ? 9 : 8">
                        <div class="grp-banner">
                          📄 <b>{{ g.name }}</b> — {{ g.billCount }} BILLS
                          <span class="grp-meta">PAID: {{ paidPctText(g) }} | PENDING: ₹{{ g.totalPending | number:'1.2-2' }}</span>
                        </div>
                        <table class="inner-table">
                          <thead>
                            <tr>
                              <th>Bill No</th>
                              <th>Date</th>
                              @if (isCity) { <th>Supplier Name</th> }
                              <th>{{ isCity || tab() === 'supplier' ? 'Buyer Name' : 'Supplier Name' }}</th>
                              <th>Items</th>
                              <th class="text-right">Bill Amount</th>
                              <th class="text-right">Paid</th>
                              <th class="text-right">Pending</th>
                              <th class="text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (b of g.bills; track b.billNo) {
                              <tr>
                                <td class="td-bold">{{ b.billNo }}</td>
                                <td class="td-mono text-xs">{{ b.billDate | inDate }}</td>
                                @if (isCity) { <td>{{ b.partyName }}</td> }
                                <td>{{ (isCity || tab() === 'supplier') ? (b.buyerName || '—') : b.partyName }}</td>
                                <td class="text-xs text-gray-600">—</td>
                                <td class="td-mono text-right">₹{{ b.total | number:'1.2-2' }}</td>
                                <td class="td-mono td-paid text-right">₹{{ b.paidAmount | number:'1.2-2' }}</td>
                                <td class="td-mono td-pending text-right">₹{{ (b.total - b.paidAmount) | number:'1.2-2' }}</td>
                                <td class="text-center">
                                  <span class="badge"
                                        [class.b-ok]="b.status === 'paid'"
                                        [class.b-warn]="b.status === 'partial'"
                                        [class.b-danger]="b.status === 'pending'">
                                    {{ b.status === 'paid' ? '✅ Paid' : b.status === 'partial' ? '⚠️ Partial' : '❌ Pending' }}
                                  </span>
                                </td>
                              </tr>
                            }
                            <tr class="sub-row">
                              <td [attr.colspan]="isCity ? 5 : 4" class="text-right">Subtotal</td>
                              <td class="td-mono text-right">₹{{ g.totalBill | number:'1.2-2' }}</td>
                              <td class="td-mono td-paid text-right">₹{{ g.totalPaid | number:'1.2-2' }}</td>
                              <td class="td-mono td-pending text-right">₹{{ g.totalPending | number:'1.2-2' }}</td>
                              <td></td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          }
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* DARK PURPLE HEADER */
    .pw-header {
      background: linear-gradient(135deg, #2a0a4a 0%, #4a1080 100%);
      color: #fff; padding: 16px 22px; border-radius: 12px; margin-bottom: 16px;
      display: flex; justify-content: space-between; align-items: center;
      box-shadow: 0 4px 12px rgba(42,10,74,.3);
    }
    .pwh-left { display: flex; align-items: center; gap: 12px; }
    .pwh-ico { font-size: 22px; }
    .pwh-title { font-size: 18px; font-weight: 800; }
    .pwh-live {
      background: rgba(34,197,94,.85); color: #fff; padding: 2px 10px;
      border-radius: 12px; font-size: 11px; font-weight: 700;
    }
    .pwh-right { font-size: 12px; opacity: .9; }

    .pw-body { display: flex; gap: 16px; }

    /* SIDEBAR */
    .pw-sidebar {
      width: 200px; flex-shrink: 0; background: #fff;
      border: 1.5px solid #ddc8f5; border-radius: 12px;
      padding: 12px 8px; height: fit-content;
      box-shadow: 0 2px 8px rgba(92,26,139,.06);
    }
    .sb-hd { font-size: 10px; font-weight: 800; color: #6b3fa0; letter-spacing: 1.2px; padding: 6px 8px 8px; }
    .sb-item {
      width: 100%; display: flex; justify-content: space-between; align-items: center;
      padding: 9px 12px; margin-bottom: 4px; cursor: pointer;
      border: none; background: transparent; border-radius: 8px;
      color: #5c1a8b; font-size: 13px; font-weight: 600; font-family: inherit;
    }
    .sb-item:hover { background: #f0e6ff; }
    .sb-item.active { background: #f0e6ff; color: #5c1a8b; font-weight: 800; }
    .sb-cnt {
      background: #5c1a8b; color: #fff; font-size: 11px; padding: 2px 8px;
      border-radius: 10px; font-family: monospace;
    }
    .sb-item.active .sb-cnt { background: #4a1080; }

    .pw-main { flex: 1; min-width: 0; }

    .sec-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
    .sec-title { font-size: 22px; font-weight: 900; color: #2d1040; }
    .sec-sub { font-size: 12px; color: #6b3fa0; margin-top: 2px; }
    .sec-actions { display: flex; gap: 8px; }
    .btn-light, .btn-print {
      padding: 7px 14px; border-radius: 8px; border: 1.5px solid #ddc8f5;
      background: #fff; color: #5c1a8b; font-size: 12px; font-weight: 600;
      cursor: pointer; font-family: inherit;
    }
    .btn-light:hover { background: #f0e6ff; }
    .btn-print { background: #5c1a8b; color: #fff; border-color: #5c1a8b; }

    /* KPI GRID */
    .kpi-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; margin-bottom: 16px; }
    @media (max-width: 1200px) { .kpi-grid { grid-template-columns: repeat(4, 1fr); } }
    @media (max-width: 700px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
    .kpi-card {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 10px;
      padding: 11px 12px; position: relative; overflow: hidden;
      box-shadow: 0 2px 6px rgba(92,26,139,.05);
    }
    .kpi-card::after {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      border-radius: 10px 10px 0 0;
    }
    .kpi-card.c-p::after { background: #5c1a8b; }
    .kpi-card.c-g::after { background: #16a34a; }
    .kpi-card.c-d::after { background: #c62828; }
    .kpi-card.c-w::after { background: #f9a825; }
    .kpi-lbl { font-size: 9px; font-weight: 800; color: #b39cc0; text-transform: uppercase; letter-spacing: .8px; }
    .kpi-val { font-size: 18px; font-weight: 800; color: #5c1a8b; font-family: monospace; margin-top: 3px; }
    .kpi-val.vg { color: #16a34a; } .kpi-val.vd { color: #c62828; } .kpi-val.vw { color: #b45309; }

    /* SEARCH ROW */
    .search-bar { display: flex; gap: 10px; margin-bottom: 12px; }
    .srch {
      flex: 1; background: #fff; border: 1.5px solid #ddc8f5; border-radius: 20px;
      padding: 9px 16px; font-size: 12.5px; font-family: inherit; outline: none;
    }
    .srch-sel {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 8px;
      padding: 8px 12px; font-size: 12.5px; font-family: inherit; outline: none; min-width: 100px;
    }

    /* TABLE */
    .pw-table-wrap {
      background: #fff; border: 1.5px solid #ddc8f5; border-radius: 12px;
      overflow: hidden; box-shadow: 0 2px 10px rgba(92,26,139,.06);
    }
    .pw-table { width: 100%; border-collapse: collapse; }
    .pw-table thead tr { background: #f0e6ff; }
    .pw-table th {
      padding: 10px 11px; font-size: 9px; font-weight: 800; color: #6b3fa0;
      text-transform: uppercase; letter-spacing: .8px; text-align: left;
      border-bottom: 2px solid #ddc8f5;
    }
    .pw-table td {
      padding: 12px 11px; font-size: 13px; color: #2d1040;
      border-bottom: 1px solid rgba(221,200,245,.4);
    }
    .grp-main:hover td { background: #fdf8ff; }
    .grp-detail td { background: #faf5ff !important; padding: 0; border-bottom: 2px solid #ddc8f5; }

    .td-bold { font-weight: 800; color: #2d1040; }
    .td-city { font-size: 11px; color: #6b3fa0; margin-top: 2px; }
    .td-mono { font-family: monospace; font-weight: 700; }
    .td-paid { color: #16a34a; }
    .td-pending { color: #c62828; }

    .bcnt-chip, .pcnt-chip {
      display: inline-flex; align-items: center; padding: 3px 11px;
      background: #f0e6ff; color: #5c1a8b; border-radius: 12px;
      font-size: 11px; font-weight: 700; font-family: monospace;
    }
    .badge {
      display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 10px;
      font-size: 11px; font-weight: 700; white-space: nowrap;
    }
    .b-ok { background: #dcfce7; color: #16a34a; }
    .b-warn { background: #fff8e1; color: #b45309; }
    .b-danger { background: #fde8e8; color: #c62828; }

    .exp-btn {
      width: 24px; height: 24px; border-radius: 6px; background: #f0e6ff;
      color: #5c1a8b; border: none; cursor: pointer; font-weight: 800;
    }
    .exp-btn:hover { background: #5c1a8b; color: #fff; }

    /* INNER (EXPANDED) TABLE */
    .grp-banner {
      background: #f0e6ff; padding: 9px 18px; font-size: 12px; color: #5c1a8b;
      font-weight: 700; display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1.5px solid #ddc8f5;
    }
    .grp-meta { font-weight: 600; font-family: monospace; color: #6b3fa0; }
    .inner-table { width: 100%; border-collapse: collapse; background: #fff; }
    .inner-table thead tr { background: #faf5ff; }
    .inner-table th {
      padding: 9px 11px; font-size: 9px; font-weight: 800; color: #6b3fa0;
      text-transform: uppercase; letter-spacing: .8px; text-align: left;
      border-bottom: 1.5px solid #ddc8f5;
    }
    .inner-table td {
      padding: 11px; font-size: 12.5px; color: #2d1040;
      border-bottom: 1px solid rgba(221,200,245,.3);
    }
    .inner-table tbody tr:hover td { background: #fdf8ff; }
    .sub-row td {
      background: #f0e6ff !important; font-weight: 800; color: #5c1a8b;
      border-top: 2px solid #ddc8f5; border-bottom: none !important;
    }
    .pw-date-lbl { font-size: 10px; font-weight: 800; color: #5c1a8b; text-transform: uppercase;
      align-self: center; letter-spacing: .5px; }
    .pw-apply { background: #5c1a8b; color: #fff; border: 0; border-radius: 8px; padding: 8px 18px;
      font-size: 12px; font-weight: 800; cursor: pointer; font-family: inherit; }
    .pw-apply:hover { background: #4a1570; }
    .pw-reset { background: #fff; color: #6b7280; border: 1px solid #d1d5db; border-radius: 8px;
      padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; }

    @media (max-width: 640px) {
      .pw-header { flex-wrap: wrap; gap: 10px; padding: 14px 16px; }
      .pw-body { flex-direction: column; }
      .pw-sidebar { width: 100% !important; max-width: 100% !important; }
      .pw-main { min-width: 0; width: 100%; }
      .sec-head { flex-wrap: wrap; gap: 8px; }
      .sec-actions { flex-wrap: wrap; }
      .kpi-grid { grid-template-columns: 1fr !important; }
      .search-bar { flex-wrap: wrap; }
      .srch { width: 100%; }
      .srch-sel { width: 100%; }
      .pw-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .pw-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
      .inner-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
    }
  `]
})
export class PartyWiseReportComponent {
  private svc = inject(ReportsService);
  private trading = inject(TradingService);
  features = inject(FeatureService);
  bills = signal<SalesRegisterRow[]>([]);
  parties = signal<Party[]>([]);
  loading = signal(true);

  tab = signal<'supplier' | 'buyer' | 'city'>('supplier');
  search = '';
  statusFilter = '';

  // CACHED rows — built once after load so expanded state persists across renders
  _supplierRows = signal<PartyGroupRow[]>([]);
  _buyerRows = signal<PartyGroupRow[]>([]);
  _cityRows = signal<PartyGroupRow[]>([]);

  supplierRows(): PartyGroupRow[] { return this._supplierRows(); }
  buyerRows(): PartyGroupRow[] { return this._buyerRows(); }
  cityRows(): PartyGroupRow[] { return this._cityRows(); }

  today(): string {
    return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // Build & cache all 3 row sets (called after load)
  rebuildAllRows() {
    this._supplierRows.set(this.buildSupplierRows());
    this._buyerRows.set(this.buildBuyerRows());
    this._cityRows.set(this.buildCityRows());
  }

  private buildBuyerRows(): PartyGroupRow[] {
    // Buyer-wise = bill ke BUYER se group (partyName to supplier hota hai)
    return this.groupBills(b => b.buyerName || '—', b => {
      const p = this.parties().find(x => x.displayName === b.buyerName);
      return p?.city || '';
    });
  }
  private buildSupplierRows(): PartyGroupRow[] {
    // partyType DB me 'seller'/'both' hota hai ('supplier' nahi) — isliye 0 aa raha tha
    const suppliers = this.parties().filter(p => p.partyType === 'seller' || p.partyType === 'both');
    return suppliers.map(s => {
      const supBills = this.bills().filter(b => b.partyName === s.displayName);
      return this.buildGroup(s.displayName, s.city || '', supBills);
    }).filter(g => g.billCount > 0).sort((a, b) => b.totalBill - a.totalBill);
  }
  private buildCityRows(): PartyGroupRow[] {
    const partyCityMap = new Map(this.parties().map(p => [p.displayName, p.city || 'Unknown']));
    const map = new Map<string, { bills: SalesRegisterRow[]; partyNames: Set<string> }>();
    for (const b of this.bills()) {
      // City buyer ki — sales kis city me ja rahi hai
      const who = b.buyerName || b.partyName;
      const city = partyCityMap.get(who) || 'Unknown';
      const e = map.get(city) || { bills: [], partyNames: new Set() };
      e.bills.push(b);
      e.partyNames.add(who);
      map.set(city, e);
    }
    const rows: PartyGroupRow[] = [];
    for (const [city, data] of map) {
      const g = this.buildGroup(city, '', data.bills);
      g.partiesCount = data.partyNames.size;
      rows.push(g);
    }
    return rows.sort((a, b) => b.totalBill - a.totalBill);
  }

  // Toggle a single group's expanded state — mutates cached array + triggers refresh
  toggleGroup(g: PartyGroupRow) {
    g.expanded = !g.expanded;
    this.refreshCurrentTab();
  }
  private refreshCurrentTab() {
    if (this.tab() === 'supplier') this._supplierRows.set([...this._supplierRows()]);
    else if (this.tab() === 'buyer') this._buyerRows.set([...this._buyerRows()]);
    else this._cityRows.set([...this._cityRows()]);
  }

  private groupBills(keyFn: (b: SalesRegisterRow) => string, cityFn: (b: SalesRegisterRow) => string): PartyGroupRow[] {
    const map = new Map<string, SalesRegisterRow[]>();
    for (const b of this.bills()) {
      const k = keyFn(b);
      const arr = map.get(k) || [];
      arr.push(b);
      map.set(k, arr);
    }
    const rows: PartyGroupRow[] = [];
    for (const [name, bills] of map) {
      const g = this.buildGroup(name, cityFn(bills[0]), bills);
      rows.push(g);
    }
    return rows.sort((a, b) => b.totalBill - a.totalBill);
  }

  private buildGroup(name: string, city: string, bills: SalesRegisterRow[]): PartyGroupRow {
    const totalBill = bills.reduce((s, b) => s + (b.total || 0), 0);
    const totalPaid = bills.reduce((s, b) => s + (b.paidAmount || 0), 0);
    const totalPending = totalBill - totalPaid;
    let status: 'paid' | 'partial' | 'pending';
    if (totalPending <= 0.01) status = 'paid';
    else if (totalPaid > 0) status = 'partial';
    else status = 'pending';
    return {
      key: name, name, city,
      billCount: bills.length,
      totalBill, totalPaid, totalPending,
      status, bills, expanded: false
    };
  }

  filteredGroups(rows: PartyGroupRow[]): PartyGroupRow[] {
    const q = this.search.toLowerCase().trim();
    return rows.filter(g => {
      if (this.statusFilter && g.status !== this.statusFilter) return false;
      if (q && !g.name.toLowerCase().includes(q) && !g.city.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  sumField(rows: PartyGroupRow[], field: 'totalBill' | 'totalPaid' | 'totalPending'): number {
    return rows.reduce((s, r) => s + r[field], 0);
  }
  sumBills(rows: PartyGroupRow[]): number {
    return rows.reduce((s, r) => s + r.billCount, 0);
  }
  countStatus(rows: PartyGroupRow[], s: string): number {
    return rows.filter(r => r.status === s).length;
  }
  paidPctText(g: PartyGroupRow): string {
    return g.totalBill > 0 ? Math.round((g.totalPaid / g.totalBill) * 100) + '%' : '0%';
  }

  expandAll(_rows: PartyGroupRow[]) {
    const cached = this.currentTabRows();
    cached.forEach(r => r.expanded = true);
    this.refreshCurrentTab();
  }
  collapseAll(_rows: PartyGroupRow[]) {
    const cached = this.currentTabRows();
    cached.forEach(r => r.expanded = false);
    this.refreshCurrentTab();
  }
  private currentTabRows(): PartyGroupRow[] {
    if (this.tab() === 'supplier') return this._supplierRows();
    if (this.tab() === 'buyer') return this._buyerRows();
    return this._cityRows();
  }

  // Date filter — default: saare records
  fromDate = '';
  toDate = '';

  resetDates() { this.fromDate = ''; this.toDate = ''; this.load(); }

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    forkJoin([
      this.trading.listParties(),
      this.svc.salesRegister(this.fromDate || undefined, this.toDate || undefined)
    ]).subscribe({
      next: ([parties, bills]: any[]) => {
        this.parties.set(parties);
        this.bills.set(bills);
        this.rebuildAllRows();   // build & cache once
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
  // PRINT: jo party EXPAND ki hai sirf USKI detail chhapti hai (clean white page —
  // window.print() dark layout par blank aata tha). Kuch expand na ho to summary table.
  printPage() {
    const groups = this.filteredGroups(this.currentTabRows());
    if (!groups.length) { alert('Print ke liye koi data nahi'); return; }
    const expanded = groups.filter(g => g.expanded);
    const list = expanded.length ? expanded : groups;
    const detail = expanded.length > 0;
    const tabName = this.tab() === 'supplier' ? 'Supplier Wise' : this.tab() === 'buyer' ? 'Buyer Wise' : 'City Wise';
    const firm = this.features.firmName() || 'Anjaninex';
    const range = (this.fromDate ? this.fmt(this.fromDate) + ' se ' : '') + (this.fmt(this.toDate || new Date().toISOString().split('T')[0])) + ' tak';
    const money = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    const esc = (s: any) => String(s ?? '—').replace(/</g, '&lt;');

    let html = `<html><head><title>${tabName} — ${firm}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:18px}
      h2{margin:0 0 2px;color:#1B2E5C} .sub{color:#666;font-size:12px;margin-bottom:14px}
      table{width:100%;border-collapse:collapse;margin:6px 0 14px}
      th,td{border:1px solid #bbb;padding:5px 8px;font-size:12px;text-align:left}
      th{background:#f0e6ff;color:#5c1a8b} .r{text-align:right}
      .banner{background:#f7f2ff;border:1px solid #ddc8f5;padding:7px 10px;font-weight:700;margin-top:14px;font-size:13px}
      .tot td{font-weight:700;background:#faf7f0}
    </style></head><body>
    <h2>Party Wise Report — ${tabName}</h2>
    <div class="sub">${esc(firm)} · ${range}</div>`;

    if (detail) {
      for (const g of list) {
        html += `<div class="banner">📄 ${esc(g.name)} — ${g.billCount} bills · Paid ${this.paidPctText(g)} · Pending ${money(g.totalPending)}</div>`;
        html += `<table><tr><th>Bill No</th><th>Date</th><th>${this.tab() === 'buyer' ? 'Supplier' : 'Buyer'}</th><th class="r">Bill Amt</th><th class="r">Paid</th><th class="r">Pending</th><th>Status</th></tr>`;
        for (const b of g.bills) {
          const other = this.tab() === 'buyer' ? b.partyName : (b.buyerName || '—');
          html += `<tr><td>${esc(b.billNo)}</td><td>${this.fmt(String(b.billDate))}</td><td>${esc(other)}</td>
                   <td class="r">${money(b.total)}</td><td class="r">${money(b.paidAmount)}</td>
                   <td class="r">${money((b.total || 0) - (b.paidAmount || 0))}</td><td>${esc(b.status)}</td></tr>`;
        }
        html += `<tr class="tot"><td colspan="3">Subtotal</td><td class="r">${money(g.totalBill)}</td>
                 <td class="r">${money(g.totalPaid)}</td><td class="r">${money(g.totalPending)}</td><td></td></tr></table>`;
      }
    } else {
      html += `<table><tr><th>#</th><th>Name</th><th class="r">Bills</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Pending</th><th>Status</th></tr>`;
      list.forEach((g, i) => {
        html += `<tr><td>${i + 1}</td><td>${esc(g.name)}</td><td class="r">${g.billCount}</td>
                 <td class="r">${money(g.totalBill)}</td><td class="r">${money(g.totalPaid)}</td>
                 <td class="r">${money(g.totalPending)}</td><td>${esc(g.status)}</td></tr>`;
      });
      html += `<tr class="tot"><td colspan="2">Total</td><td class="r">${this.sumBills(list)}</td>
               <td class="r">${money(this.sumField(list, 'totalBill'))}</td><td class="r">${money(this.sumField(list, 'totalPaid'))}</td>
               <td class="r">${money(this.sumField(list, 'totalPending'))}</td><td></td></tr></table>`;
    }
    html += `</body></html>`;

    const w = window.open('', '_blank', 'width=920,height=680');
    if (!w) { alert('Popup blocked hai — is site ke liye popups allow karo, fir Print dabao'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  // ── WhatsApp share ──
  private fmt(d: string): string {
    if (!d) return '—';
    const [y, m, dd] = d.split('-');
    return `${dd}/${m}/${(y || '').slice(-2)}`;
  }
  waMessage(): string {
    const groups = this.filteredGroups(this.currentTabRows());
    if (!groups.length) return '';
    const upto = this.fmt(this.toDate || new Date().toISOString().split('T')[0]);
    const tabName = this.tab() === 'supplier' ? 'Supplier Wise' : this.tab() === 'buyer' ? 'Buyer Wise' : 'City Wise';

    // Party EXPAND ki hai? → sirf USKI bill-wise detail bhejo (WhatsApp me wahi chahiye)
    const expanded = groups.filter(g => g.expanded);
    if (expanded.length) {
      const lines: string[] = [];
      for (const g of expanded.slice(0, 3)) {
        lines.push(`*${g.name}* — ${g.billCount} bills (${upto} tak)`);
        const maxBills = 20;
        g.bills.slice(0, maxBills).forEach((b, i) => {
          const pend = Math.round((b.total || 0) - (b.paidAmount || 0));
          lines.push(`${i + 1}. ${b.billNo} · ${this.fmt(String(b.billDate))} · ₹${Math.round(b.total || 0).toLocaleString('en-IN')} · Pending ₹${pend.toLocaleString('en-IN')}`);
        });
        if (g.bills.length > maxBills) lines.push(`+${g.bills.length - maxBills} aur bills...`);
        lines.push(`Paid: ${this.paidPctText(g)} | *Pending: ₹${Math.round(g.totalPending || 0).toLocaleString('en-IN')}*`);
        lines.push('------------------');
      }
      lines.push('- ' + (this.features.firmName() || 'Anjaninex'));
      return lines.join('\n');
    }

    const partyLine = groups.length === 1 ? groups[0].name : 'Sabhi parties';
    const lines: string[] = [`*Party Wise Report — ${tabName}* (${upto} tak)`, partyLine];
    const max = 15;
    groups.slice(0, max).forEach((g, i) => {
      lines.push(`${i + 1}. ${g.name} · ${g.billCount} bills · Pending ₹${Math.round(g.totalPending || 0).toLocaleString('en-IN')}`);
    });
    if (groups.length > max) lines.push(`+${groups.length - max} aur...`);
    lines.push('------------------');
    const totPending = groups.reduce((s, g) => s + (g.totalPending || 0), 0);
    lines.push(`Total Pending: ₹${Math.round(totPending).toLocaleString('en-IN')}`);
    lines.push('- ' + (this.features.firmName() || 'Anjaninex'));
    return lines.join('\n');
  }
  waPhone(): string | null {
    // Ek party expand ho (ya filter ke baad ek hi bache) to uska phone suggest karo
    if (this.tab() === 'city') return null;
    const groups = this.filteredGroups(this.currentTabRows());
    const expanded = groups.filter(g => g.expanded);
    const target = expanded.length === 1 ? expanded[0] : (groups.length === 1 ? groups[0] : null);
    if (!target) return null;
    const p = this.parties().find(x => x.displayName === target.name);
    return p?.phone || null;
  }
}

// =============================================================================
// SCAN REPORT — har AI scan ka date-time punch (Bill ya Order)
// =============================================================================
@Component({
  selector: 'app-scan-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DecimalPipe, InDatePipe],
  template: `
    <div class="max-w-7xl mx-auto">
      ${subNav}

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🤖 Scan Report</h2>
          <p class="text-sm text-[#6b3fa0]">Har AI scan ka date-time punch — Bill ya Order</p>
        </div>
        <div class="flex gap-2 items-center">
          <select [(ngModel)]="typeFilter" class="input w-40">
            <option value="">All scans</option>
            <option value="Bill">Bill scans</option>
            <option value="Order">Order scans</option>
          </select>
          <button (click)="load()" class="px-3 py-1.5 text-sm border border-[#ddc8f5] rounded hover:bg-purple-50">🔄 Refresh</button>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="card text-center">
          <div class="text-2xl font-black text-[#5c1a8b]">{{ rows().length }}</div>
          <div class="text-xs uppercase font-bold text-gray-500">Total Scans</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-black text-green-600">{{ count('Bill') }}</div>
          <div class="text-xs uppercase font-bold text-gray-500">Bill Scans</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-black text-orange-600">{{ count('Order') }}</div>
          <div class="text-xs uppercase font-bold text-gray-500">Order Scans</div>
        </div>
      </div>

      <div class="card p-0 overflow-x-auto">
        @if (loading()) { <div class="p-8 text-center text-gray-500">Loading…</div> }
        @else if (filtered().length === 0) { <div class="p-8 text-center text-gray-500">Koi scan nahi hua abhi tak</div> }
        @else {
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
              <tr>
                <th class="px-3 py-2 text-left">S.No</th>
                <th class="px-3 py-2 text-left">Date</th>
                <th class="px-3 py-2 text-left">Time</th>
                <th class="px-3 py-2 text-center">Bill / Order</th>
                <th class="px-3 py-2 text-left">User</th>
                <th class="px-3 py-2 text-left">Model</th>
                <th class="px-3 py-2 text-right">Confidence</th>
              </tr>
            </thead>
            <tbody>
              @for (r of filtered(); track $index) {
                <tr class="border-t hover:bg-[#faf5ff]">
                  <td class="px-3 py-2">{{ $index + 1 }}</td>
                  <td class="px-3 py-2 font-mono">{{ r.date | inDate }}</td>
                  <td class="px-3 py-2 font-mono">{{ r.time }}</td>
                  <td class="px-3 py-2 text-center">
                    <span class="text-xs px-2 py-0.5 rounded font-bold"
                          [class.bg-green-100]="r.type === 'Bill'"
                          [class.text-green-700]="r.type === 'Bill'"
                          [class.bg-orange-100]="r.type === 'Order'"
                          [class.text-orange-700]="r.type === 'Order'">{{ r.type }}</span>
                  </td>
                  <td class="px-3 py-2">{{ r.user }}</td>
                  <td class="px-3 py-2 text-xs text-gray-500">{{ r.model }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ (r.confidence * 100) | number:'1.0-0' }}%</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `
})
export class ScanReportComponent {
  private aiSvc = inject(AiService);
  rows = signal<ScanReportRow[]>([]);
  loading = signal(true);
  typeFilter = '';

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.aiSvc.scanReport(300).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  filtered() { return this.typeFilter ? this.rows().filter(r => r.type === this.typeFilter) : this.rows(); }
  count(t: string) { return this.rows().filter(r => r.type === t).length; }
}

// =============================================================================
// ACTIVITY LOG — kisne entry ki, edit kiya, delete kiya (sab modules)
// =============================================================================
interface AuditRow {
  date: string; time: string; user: string; module: string;
  table: string; label: string | null; action: string; changes: string | null;
}

@Component({
  selector: 'app-activity-log',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, InDatePipe],
  template: `
    <div class="max-w-7xl mx-auto">
      ${subNav}

      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 class="font-display font-black text-2xl text-[#5c1a8b]">🕵️ Activity Log</h2>
          <p class="text-sm text-[#6b3fa0]">Kisne entry ki · kisne edit kiya · kisne delete kiya</p>
        </div>
        <div class="flex gap-2 items-center flex-wrap">
          <select [(ngModel)]="moduleFilter" (change)="load()" class="input w-40">
            <option value="">All Modules</option>
            <option value="core">Core Master</option>
            <option value="trading">Trading</option>
            <option value="accounting">Accounting</option>
            <option value="ad">Bazaar Link</option>
            <option value="hr">HR</option>
            <option value="platform">Platform</option>
          </select>
          <select [(ngModel)]="actionFilter" (change)="load()" class="input w-32">
            <option value="">All Actions</option>
            <option value="insert">➕ Entry</option>
            <option value="update">✏️ Edit</option>
            <option value="delete">🗑️ Delete</option>
          </select>
          <input [(ngModel)]="search" (keyup.enter)="load()" placeholder="🔍 Naam/record search..." class="input w-52">
          <button (click)="load()" class="px-3 py-1.5 text-sm border border-[#ddc8f5] rounded hover:bg-purple-50">🔄 Refresh</button>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="card text-center">
          <div class="text-2xl font-black text-green-600">{{ count('insert') }}</div>
          <div class="text-xs uppercase font-bold text-gray-500">➕ New Entries</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-black text-blue-600">{{ count('update') }}</div>
          <div class="text-xs uppercase font-bold text-gray-500">✏️ Edits</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-black text-red-600">{{ count('delete') }}</div>
          <div class="text-xs uppercase font-bold text-gray-500">🗑️ Deletes</div>
        </div>
      </div>

      <div class="card p-0 overflow-x-auto">
        @if (loading()) { <div class="p-8 text-center text-gray-500">Loading…</div> }
        @else if (rows().length === 0) { <div class="p-8 text-center text-gray-500">Koi activity nahi mili</div> }
        @else {
          <table class="w-full text-sm">
            <thead class="bg-[#f0e6ff] text-[#5c1a8b] uppercase text-xs">
              <tr>
                <th class="px-3 py-2 text-left">S.No</th>
                <th class="px-3 py-2 text-left">Date</th>
                <th class="px-3 py-2 text-left">Time</th>
                <th class="px-3 py-2 text-left">User</th>
                <th class="px-3 py-2 text-center">Module</th>
                <th class="px-3 py-2 text-left">Record</th>
                <th class="px-3 py-2 text-center">Action</th>
                <th class="px-3 py-2 text-left">Kya badla</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track $index) {
                <tr class="border-t hover:bg-[#faf5ff] align-top">
                  <td class="px-3 py-2">{{ $index + 1 }}</td>
                  <td class="px-3 py-2 font-mono text-xs">{{ r.date | inDate }}</td>
                  <td class="px-3 py-2 font-mono text-xs">{{ r.time }}</td>
                  <td class="px-3 py-2 font-semibold">{{ r.user }}</td>
                  <td class="px-3 py-2 text-center">
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-purple-100 text-purple-700">{{ r.module }}</span>
                  </td>
                  <td class="px-3 py-2">
                    <div class="font-semibold">{{ r.label || '—' }}</div>
                    <div class="text-[10px] text-gray-400">{{ r.table }}</div>
                  </td>
                  <td class="px-3 py-2 text-center">
                    <span class="text-xs px-2 py-0.5 rounded font-bold"
                          [class.bg-green-100]="r.action === 'insert'"
                          [class.text-green-700]="r.action === 'insert'"
                          [class.bg-blue-100]="r.action === 'update'"
                          [class.text-blue-700]="r.action === 'update'"
                          [class.bg-red-100]="r.action === 'delete'"
                          [class.text-red-700]="r.action === 'delete'">
                      {{ r.action === 'insert' ? '➕ Entry' : r.action === 'update' ? '✏️ Edit' : '🗑️ Delete' }}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-xs text-gray-600 max-w-[320px]">
                    @if (r.changes) {
                      @for (c of parseChanges(r.changes); track c.field) {
                        <div><b>{{ c.field }}</b>: <span class="text-red-500 line-through">{{ c.old }}</span> → <span class="text-green-700">{{ c.new }}</span></div>
                      }
                    } @else { — }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `
})
export class ActivityLogComponent {
  private http = inject(HttpClient);
  rows = signal<AuditRow[]>([]);
  loading = signal(true);
  moduleFilter = '';
  actionFilter = '';
  search = '';

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    const params: any = { limit: 300 };
    if (this.moduleFilter) params.module = this.moduleFilter;
    if (this.actionFilter) params.action = this.actionFilter;
    if (this.search.trim()) params.search = this.search.trim();
    this.http.get<AuditRow[]>(`${environment.apiUrl}/api/audit/logs`, { params }).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  count(a: string) { return this.rows().filter(r => r.action === a).length; }

  parseChanges(json: string): { field: string; old: string; new: string }[] {
    try {
      const obj = JSON.parse(json);
      return Object.keys(obj).slice(0, 6).map(k => ({
        field: k,
        old: obj[k]?.old ?? '—',
        new: obj[k]?.new ?? '—'
      }));
    } catch { return []; }
  }
}
